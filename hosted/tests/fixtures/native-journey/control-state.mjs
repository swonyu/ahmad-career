// Private, fixed native-journey checkpoint protocol. No I/O or runtime on import.
import {createHash} from 'node:crypto';
import {assertZeroDispatch} from './contract.mjs';
import {BOARD, SOURCE_ID, PDF, postingId, postingURL, postings} from './data.mjs';

export const CHECKPOINTS = Object.freeze(['blank', 'contactSaved', 'jobSaved', 'pickerCancelled',
  'profileA', 'preparedA', 'profileB', 'followUpSaved', 'closeSecondary', 'closedResult',
  'outage', 'outageResult', 'networkDisconnected', 'networkFailure', 'restarted', 'finished']);
export const CONTROL_LIMITS = Object.freeze({requestBytes: 1024, responseBytes: 16384, phoneBytes: 262144,
  discoveryBytes: 262144, evidenceBytes: 1048576, observations: 128, requestMilliseconds: 4500});
export class CheckpointError extends Error {
  constructor(code) { super(code); this.name = 'CheckpointError'; this.code = code; }
}
const fail = code => { throw new CheckpointError(code); };
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SHA = /^[a-f0-9]{64}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, maximum = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= 0 && value <= maximum;
const exactKeys = (value, keys) => object(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
export const discoveryFilename = (logicalOrigin, workspaceID) => 'discovery-' + sha256(logicalOrigin + '\0' + workspaceID) + '.json';
// Matches PhoneOperationJournal's current scoped file, not the phone-draft representation.
export const operationJournalFilename = (logicalOrigin, workspaceID) => 'pending-operations-' + sha256(logicalOrigin + '\0' + workspaceID) + '.json';
// These five checkpoints require a successful mutation and its complete workspace refresh.
// A rejected closed-job import or a later offline read must not be treated as a successful refresh.
export const needsReconciledJournal = sequence => [2, 3, 5, 6, 7].includes(sequence);
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}

/** Bounded JSON with duplicate-property and excessive-depth rejection. Errors never include input. */
export function decodeBoundedJSON(bytes, maximum) {
  if (!(bytes instanceof Uint8Array) || !integer(maximum, CONTROL_LIMITS.evidenceBytes) ||
      bytes.byteLength < 1 || bytes.byteLength > maximum) fail('checkpoint_json_size');
  let source;
  try { source = new TextDecoder('utf-8', {fatal: true}).decode(bytes); } catch { fail('checkpoint_json_utf8'); }
  let at = 0, nodes = 0;
  const space = () => { while (/[\t\n\r ]/.test(source[at] ?? '\0')) at++; };
  const string = () => {
    const start = at++;
    while (at < source.length) {
      const c = source[at++];
      if (c === '"') { try { return JSON.parse(source.slice(start, at)); } catch { fail('checkpoint_json_invalid'); } }
      if (c === '\\') at++;
    }
    fail('checkpoint_json_invalid');
  };
  function value(depth) {
    if (depth > 32 || ++nodes > 20000) fail('checkpoint_json_complexity');
    space(); const c = source[at];
    if (c === '"') return string();
    if (c === '{' || c === '[') {
      at++; space(); const array = c === '[', result = array ? [] : Object.create(null), seen = new Set();
      const end = array ? ']' : '}';
      if (source[at] === end) { at++; return result; }
      while (at < source.length) {
        space(); let key;
        if (!array) {
          if (source[at] !== '"') fail('checkpoint_json_invalid');
          key = string(); if (seen.has(key)) fail('checkpoint_json_duplicate_key'); seen.add(key);
          space(); if (source[at++] !== ':') fail('checkpoint_json_invalid');
        }
        const next = value(depth + 1); if (array) result.push(next); else result[key] = next;
        space(); if (source[at] === end) { at++; return result; }
        if (source[at++] !== ',') fail('checkpoint_json_invalid');
      }
      fail('checkpoint_json_invalid');
    }
    const found = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(source.slice(at));
    if (!found) fail('checkpoint_json_invalid');
    at += found[0].length; let result;
    try { result = JSON.parse(found[0]); } catch { fail('checkpoint_json_invalid'); }
    if (typeof result === 'number' && !Number.isFinite(result)) fail('checkpoint_json_number');
    return result;
  }
  const result = value(0); space(); if (at !== source.length) fail('checkpoint_json_invalid'); return result;
}
export function decodeControlRequest(bytes, testID, expectedSequence) {
  const value = decodeBoundedJSON(bytes, CONTROL_LIMITS.requestBytes);
  if (!exactKeys(value, ['schemaVersion', 'testID', 'sequence', 'checkpoint']) || value.schemaVersion !== 1 ||
      value.testID !== testID || !UUID.test(testID) || testID !== testID.toUpperCase() ||
      !Number.isInteger(value.sequence) || value.sequence !== expectedSequence ||
      CHECKPOINTS[value.sequence - 1] !== value.checkpoint) fail('checkpoint_request_shape_or_sequence');
  return value;
}
function dayValid(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value && value >= '0001-01-01';
}
const expected = [
  [0,0,0,0,0,0], [1,0,0,0,0,0], [1,1,0,1,1,1], [1,1,0,1,1,1],
  [2,1,0,1,1,1], [2,1,1,1,1,1], [3,1,1,1,1,1], [3,1,1,1,1,1],
  [3,1,1,2,1,1], [3,2,1,2,1,2], [3,2,1,2,1,2], [3,2,1,3,1,2],
  [3,2,1,3,1,2], [3,2,1,3,1,2], [3,2,1,3,1,2], [3,2,1,3,1,2],
]; // profile PUT, jobs POST, prepare POST, search GET, server jobs, local jobs.

const blankText = ['firstName','lastName','email','phone','city','country','headline','skills',
  'targetRoles','targetCountries','website','linkedin'];
function blankProfile(profile, guest) {
  return object(profile) && blankText.every(key => profile[key] === '') &&
    profile.experienceLevel === 'any' && ['remote','hybrid','onsite'].every(key => profile[key] === guest) &&
    profile.resumeName === '' && profile.resumeChanged === false && profile.resumeRemoved === false &&
    ['resumeData','resumeSize','resumeSHA256'].every(key => profile[key] == null);
}
function blankGuestArchive(drafts) {
  if (!Array.isArray(drafts) || drafts.length !== 1) return false;
  const draft = drafts[0];
  return object(draft) && exactKeys(draft.scope,['origin','workspaceID']) && draft.scope.origin === '' &&
    draft.scope.workspaceID === '' && blankProfile(draft.profile,true) && draft.profileNeedsSync === false &&
    ['profileRevision','latestServerRevision','latestServerProfile'].every(key => draft[key] == null) &&
    Array.isArray(draft.jobs) && draft.jobs.length === 0 && exactKeys(draft.opportunityDraft,['url','title','company','location','country']) &&
    Object.values(draft.opportunityDraft).every(value => value === '');
}
const historyKeys = ['id','attemptId','state','provider','evidenceMode','mode','title','company','applicationId',
  'resumeName','resumeSHA256','payloadSHA256','requirementsRevision','createdAt','dispatchedAt','confirmedAt','profileRevision'];
function savedHistoryValid(cache, {workspaceID,logicalOrigin,testID,attempt}) {
  if (!exactKeys(cache,['schemaVersion','scope','credentialAccount','savedAt','entries']) || cache.schemaVersion !== 1 ||
      !exactKeys(cache.scope,['origin','workspaceID']) || cache.scope.workspaceID !== workspaceID ||
      cache.scope.origin !== logicalOrigin || cache.credentialAccount !== 'native-journey.' + testID ||
      typeof cache.savedAt !== 'string' || !Number.isFinite(Date.parse(cache.savedAt)) ||
      !Array.isArray(cache.entries) || cache.entries.length !== (attempt ? 1 : 0)) return false;
  if (!attempt) return true;
  const entry = cache.entries[0];
  return object(entry) && Object.keys(entry).every(key => historyKeys.includes(key)) &&
    entry.id === attempt.id && (entry.attemptId == null || entry.attemptId === attempt.id) &&
    entry.state === 'ready' && entry.evidenceMode === 'test' && (entry.mode == null || entry.mode === 'test') &&
    entry.profileRevision === 2 && entry.resumeName === 'CV-A.pdf' && entry.resumeSHA256 === PDF.sha256 &&
    entry.applicationId == null && entry.dispatchedAt == null && entry.confirmedAt == null;
}

/** Only real observations are inputs. A pending result never authorizes a response. */
export function createCheckpointState({testID, workspaceID, logicalOrigin, workerSHA256, bootstrapSHA256, followUpDay,
  bridgePort, caFingerprint256}) {
  if (!UUID.test(testID ?? '') || testID !== testID.toUpperCase() || !UUID.test(workspaceID ?? '') ||
      !SHA.test(workerSHA256 ?? '') || !SHA.test(bootstrapSHA256 ?? '') || !dayValid(followUpDay) ||
      logicalOrigin !== 'https://career-finder-service.jazzy-drake-8323.chatgpt.site' ||
      !integer(bridgePort,65535) || bridgePort < 1024 || typeof caFingerprint256 !== 'string' ||
      !/^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(caFingerprint256)) fail('checkpoint_binding_invalid');
  let next = 1, previous, prepared, initialSeedHash, initialJobID, initialPrimaryBackupHash, guestArchiveHash, restartPhoneHash,
    restartDiscoveryHash, offlineEvidenceHash;
  const phoneContact = p => canonical(Object.fromEntries(Object.entries(p).filter(([key]) => !key.startsWith('resume'))));
  let contactProjection;
  function inspect(request, witness, {afterControl = true} = {}) {
    if (request.sequence !== next || request.testID !== testID || request.checkpoint !== CHECKPOINTS[next - 1]) fail('checkpoint_sequence_changed');
    const {proof, phone, discovery, operationJournal, seedReceipt, seedReceiptSHA256, sourceBound, transportClosed} = witness;
    if (sourceBound !== true || !object(proof) || proof.workerSHA256 !== workerSHA256 || proof.hostOutboundCheckObserved !== true ||
        proof.ok !== true || proof.schemaVersion !== 1 || !Array.isArray(proof.workspaces) || proof.workspaces.length !== 1 ||
        proof.workspaces[0].id !== workspaceID) fail('checkpoint_source_or_owner');
    try { assertZeroDispatch(proof); } catch { fail('checkpoint_zero_dispatch'); }
    if (['unexpectedProviderTargets','capabilityChanges'].some(key => proof[key] !== 0) ||
        !integer(proof.providerGets) || !Array.isArray(proof.nativeCalls) || proof.nativeCalls.length > 128 ||
        !Array.isArray(proof.jobs) || proof.jobs.length > 200 || !Array.isArray(proof.controls)) fail('checkpoint_evidence_shape');
    const bridge = proof.bridge;
    if (!object(bridge) || bridge.host !== '127.0.0.1' || bridge.port !== bridgePort ||
        bridge.caFingerprint256 !== caFingerprint256 || bridge.inFlight !== 0 || bridge.apiRequests !== proof.nativeCalls.length ||
        bridge.proxyRequests !== 0 || !['deniedRequests','socketErrors','tlsErrors'].every(key => integer(bridge[key],128)) ||
        !exactKeys(bridge.documentRequests,PDF.names) || !Object.values(bridge.documentRequests).every(n => integer(n,64)) ||
        bridge.pdf?.sha256 !== PDF.sha256 || bridge.pdf?.bytes !== PDF.bytes ||
        canonical(bridge.pdf?.names) !== canonical(PDF.names) || !Array.isArray(bridge.events) || bridge.events.length > 64) fail('checkpoint_bridge_evidence');
    const server = proof.workspaces[0];
    if (!integer(server.revision) || !SHA.test(server.profileSHA256 ?? '') ||
        ![null, ...PDF.names].includes(server.resumeName) ||
        (server.resumeSHA256 !== null && server.resumeSHA256 !== PDF.sha256)) fail('checkpoint_profile_evidence');
    if (!object(phone) || phone.workspaceID !== workspaceID || phone.serviceAddress !== logicalOrigin ||
        phone.connectionEnabled !== true || phone.credentialAccount !== 'native-journey.' + testID ||
        !object(phone.profile) || !Array.isArray(phone.jobs) || !Array.isArray(phone.applicationRecords) ||
        !Array.isArray(phone.recordDrafts) || !Array.isArray(phone.submissionHolds) ||
        phone.submissionHolds.length || phone.recordDrafts.length ||
        (phone.recordDraftAlternatives ?? []).length || (phone.recoveredOpportunityDrafts ?? []).length ||
        !blankGuestArchive(phone.workspaceDrafts)) fail('checkpoint_phone_scope_or_shape');
    const archiveHash = sha256(canonical(phone.workspaceDrafts));
    if (guestArchiveHash && archiveHash !== guestArchiveHash) fail('checkpoint_guest_archive_changed');
    if (!exactKeys(seedReceipt, ['schemaVersion','testID','bootstrapSHA256','initialStateSHA256','onlyBlankConnection']) ||
        seedReceipt.schemaVersion !== 1 || seedReceipt.testID !== testID || seedReceipt.bootstrapSHA256 !== bootstrapSHA256 ||
        seedReceipt.onlyBlankConnection !== true || !SHA.test(seedReceipt.initialStateSHA256 ?? '') ||
        !SHA.test(seedReceiptSHA256 ?? '') || initialSeedHash && initialSeedHash !== seedReceiptSHA256) fail('checkpoint_seed_changed');
    const [putCount, jobPosts, prepareCount, searchCount, serverJobs, localJobs] = expected[next - 1];
    const counts = {profile:0, jobs:0, prepare:0, search:0, workspace:0};
    for (const call of proof.nativeCalls) {
      if (!object(call) || !Number.isInteger(call.status) || !SHA.test(call.requestBodySHA256 ?? '') || !integer(call.requestBytes)) fail('checkpoint_call_shape');
      const key = call.method + ' ' + call.path;
      if (key.startsWith('GET ') && ['/api/apply/status','/api/apply/workspace','/api/apply/receipts',
        '/api/discovery/sources','/api/discovery/search'].includes(call.path)) {
        if (call.status !== 200 || call.requestBytes !== 0 || call.path.startsWith('/api/apply/') && call.nativeTokenPresent !== true) fail('checkpoint_read_rejected');
        if (call.path === '/api/discovery/search') counts.search++;
        if (call.path === '/api/apply/workspace') counts.workspace++;
      } else if (key === 'PUT /api/apply/profile') {
        counts.profile++; if (call.status !== 200 || call.nativeTokenPresent !== true) fail('checkpoint_profile_mutation_rejected');
      } else if (key === 'POST /api/apply/jobs') {
        counts.jobs++; if (call.nativeTokenPresent !== true || call.status !== (counts.jobs === 1 ? 201 : 409)) fail('checkpoint_job_mutation_rejected');
      } else if (key === 'POST /api/apply/prepare') {
        counts.prepare++; if (call.status !== 201 || call.nativeTokenPresent !== true) fail('checkpoint_prepare_rejected');
      } else fail('checkpoint_unexpected_native_call');
    }
    let ready = counts.workspace >= 1;
    if (needsReconciledJournal(next)) {
      if (operationJournal == null) ready = false;
      else {
        if (!exactKeys(operationJournal,['version','origin','workspaceId','entries','intents']) ||
            operationJournal.version !== 1 || operationJournal.origin !== logicalOrigin ||
            operationJournal.workspaceId !== workspaceID || !Array.isArray(operationJournal.entries) ||
            !Array.isArray(operationJournal.intents)) fail('checkpoint_operation_journal_shape');
        if (operationJournal.entries.length || operationJournal.intents.length) ready = false;
      }
      // A 200 response alone cannot prove that the app validated and persisted it.
      // The real client writes an intent before sending and clears this journal
      // only after a complete scoped workspace snapshot is accepted and saved.
      const mutation = proof.nativeCalls.findLastIndex(call => call.method === 'POST' || call.method === 'PUT');
      if (mutation < 0 || !proof.nativeCalls.slice(mutation + 1).some(call =>
          call.method === 'GET' && call.path === '/api/apply/workspace' && call.status === 200)) ready = false;
    }
    if (next >= 5 && bridge.documentRequests['CV-A.pdf'] < 1 || next >= 7 && bridge.documentRequests['CV-B.pdf'] < 1) ready = false;
    for (const [actual, target] of [[counts.profile,putCount],[counts.jobs,jobPosts],[counts.prepare,prepareCount],
      [counts.search,searchCount],[server.revision,putCount],[proof.jobs.length,serverJobs],
      [phone.jobs.length,localJobs],[proof.attempts.length,prepareCount],[proof.plans.length,prepareCount]]) {
      if (actual > target) fail('checkpoint_state_advanced_unexpectedly'); if (actual < target) ready = false;
    }
    const controlTarget = next >= 11 ? 2 : next >= 9 ? 1 : 0;
    const controlsExpected = controlTarget - (!afterControl && [9,11].includes(next) ? 1 : 0);
    if (proof.controls.length !== controlsExpected || proof.controls.some((c,i) => !object(c) || c.board !== ['closed','unavailable'][i]) ||
        proof.board !== ['open','closed','unavailable'][controlsExpected]) fail('checkpoint_board_control_changed');
    if (proof.jobs.some(job => !object(job) || !UUID.test(job.id ?? '') || job.workspace_id !== workspaceID ||
      job.job_key !== SOURCE_ID + ':' + postingId(1)) || new Set(proof.jobs.map(j => j.id)).size !== proof.jobs.length) fail('checkpoint_server_job_identity');
    const jobID = proof.jobs[0]?.id;
    if (initialJobID && jobID !== initialJobID) fail('checkpoint_primary_job_changed');
    const urls = phone.jobs.map(j => j.url);
    if (new Set(urls).size !== urls.length || urls.some(url => ![postingURL(1),postingURL(2)].includes(url))) fail('checkpoint_local_job_identity');
    let primaryBackupHash;
    if (phone.jobs.length === localJobs && localJobs) {
      const primary = phone.jobs.find(j => j.url === postingURL(1));
      // NativeApplicationsStore.rememberImported keeps a local-ID backup on disk.
      // The canonical server row remains separately verified above; the app merges
      // it with this backup for display without rewriting the persisted identity.
      const original = postings[0], discovered = discovery?.jobs?.find(j => j.url === postingURL(1));
      if (!exactKeys(primary,['id','localOnly','url','title','company','location','country','provider','workMode','sourceName','checkedAt']) ||
          typeof primary.id !== 'string' || !primary.id.startsWith('local-') || !UUID.test(primary.id.slice(6)) ||
          primary.localOnly !== true || primary.title !== original.text || primary.company !== BOARD ||
          primary.location !== original.categories.location || primary.country !== original.country ||
          primary.provider !== 'lever' || primary.workMode !== original.workplaceType || primary.sourceName !== BOARD ||
          typeof primary.checkedAt !== 'string' || !Number.isFinite(Date.parse(primary.checkedAt)) ||
          !initialPrimaryBackupHash && primary.checkedAt !== discovered?.checkedAt) ready = false;
      if (primary) {
        primaryBackupHash = sha256(canonical(primary));
        if (initialPrimaryBackupHash && primaryBackupHash !== initialPrimaryBackupHash) fail('checkpoint_primary_backup_changed');
      }
      if (localJobs === 2 && phone.jobs.find(j => j.url === postingURL(2))?.localOnly !== true) fail('checkpoint_closed_bookmark_changed');
    }
    const cv = putCount < 2 ? null : putCount === 2 ? 'CV-A.pdf' : 'CV-B.pdf';
    if (server.resumeName !== cv || server.resumeSHA256 !== (cv ? PDF.sha256 : null)) ready = false;
    if (!integer(phone.profileRevision) || phone.profileRevision > putCount) fail('checkpoint_phone_revision');
    if (phone.profileRevision !== putCount || phone.profileNeedsSync !== false ||
        phone.profile.resumeName !== (cv ?? '') || (phone.profile.resumeSHA256 ?? null) !== (cv ? PDF.sha256 : null) ||
        (phone.profile.resumeSize ?? null) !== (cv ? PDF.bytes : null) || phone.profile.resumeChanged !== false ||
        phone.profile.resumeRemoved !== false || phone.profile.resumeData != null) ready = false;
    if (putCount === 0) {
      if (!blankProfile(phone.profile,false)) fail('checkpoint_initial_profile_not_blank');
    } else if (phone.profile.firstName !== 'Jamie' || phone.profile.email !== 'jamie.native@example.com') ready = false;
    if (contactProjection && phoneContact(phone.profile) !== contactProjection) fail('checkpoint_contact_changed');
    const phoneHash = sha256(canonical(phone));
    if (next === 4 && (phoneHash !== previous.phoneHash || server.profileSHA256 !== previous.profileSHA256)) fail('checkpoint_picker_changed_state');
    if (previous && putCount === previous.putCount && server.profileSHA256 !== previous.profileSHA256) fail('checkpoint_server_profile_changed');
    if (prepareCount) {
      if (proof.attempts.length === 1 && proof.plans.length === 1) {
        const attempt = proof.attempts[0], plan = proof.plans[0];
        if (![attempt.id,attempt.planId,attempt.jobId,plan.id].every(id => UUID.test(id ?? '')) || attempt.planId !== plan.id ||
            attempt.jobId !== jobID || attempt.profileRevision !== 2 || plan.profileRevision !== 2 ||
            attempt.resumeName !== 'CV-A.pdf' || attempt.resumeSHA256 !== PDF.sha256 || !SHA.test(attempt.snapshotSHA256 ?? '')) fail('checkpoint_prepared_snapshot_invalid');
        if (prepared && (canonical(attempt) !== prepared.attempt || canonical(plan) !== prepared.plan)) fail('checkpoint_prepared_snapshot_changed');
      } else ready = false;
    }
    if (!savedHistoryValid(phone.savedApplicationHistory,{workspaceID,logicalOrigin,testID,
      attempt:prepareCount ? proof.attempts[0] : null})) ready = false;
    if (prepared?.cache && canonical(phone.savedApplicationHistory) !== prepared.cache) fail('checkpoint_cached_history_changed');
    const recordExpected = next >= 8 ? 1 : 0;
    if (phone.applicationRecords.length > recordExpected) fail('checkpoint_private_records_unexpected');
    if (phone.applicationRecords.length < recordExpected) ready = false;
    let actualFollowUp;
    if (recordExpected && phone.applicationRecords.length === 1) {
      const record = phone.applicationRecords[0];
      if (!object(record) || record.scope?.workspaceID !== workspaceID || record.scope?.origin !== logicalOrigin ||
          record.job?.url !== postingURL(1) || record.stage !== 'saved' || record.appliedElsewhere !== false || record.archived !== false ||
          record.appliedOn !== '' || record.followUpOn !== followUpDay || record.note !== 'Synthetic follow-up: review the role and my questions.') fail('checkpoint_private_followup_changed');
      actualFollowUp = record.followUpOn;
      if (previous?.recordsHash && sha256(canonical(phone.applicationRecords)) !== previous.recordsHash) fail('checkpoint_private_record_mutated');
    }
    if (searchCount > 0) {
      if (!object(discovery) || !Array.isArray(discovery.jobs) || !object(discovery.page) || !Array.isArray(discovery.page.sources)) ready = false;
      else {
        if (discovery.jobs.some(j => j.sourceId !== SOURCE_ID || ![1,2].some(n => j.id === SOURCE_ID + ':' + postingId(n) && j.url === postingURL(n))) ||
            new Set(discovery.jobs.map(j => j.id)).size !== discovery.jobs.length || discovery.jobs.length !== 2 ||
            discovery.page.sources.length !== 1 || discovery.page.sources[0].id !== SOURCE_ID) fail('checkpoint_discovery_identity');
        if (next >= 12 && (!['partial','unavailable'].includes(discovery.page.status) ||
            !['stale','unavailable'].includes(discovery.page.sources[0].status) || !object(discovery.page.sources[0].error))) ready = false;
      }
    }
    if ([10,12].includes(next) && proof.providerGets <= previous.providerGets) ready = false;
    const discoveryHash = discovery ? sha256(canonical(discovery)) : null;
    const needsClosedTransport = next > 13 || next === 13 && afterControl;
    if (typeof transportClosed !== 'boolean' || transportClosed !== needsClosedTransport) fail('checkpoint_transport_control_changed');
    if (next >= 13 && (phoneHash !== restartPhoneHash || discoveryHash !== restartDiscoveryHash)) fail('checkpoint_offline_disk_changed');
    if (offlineEvidenceHash && sha256(canonical(proof)) !== offlineEvidenceHash) fail('checkpoint_offline_server_changed');
    if (!ready) return {ready: false};
    const facts = {zeroDispatch:true, sourceAndOwnerBound:true, profileRevision:server.revision,
      resumeName:server.resumeName, resumeSHA256:server.resumeSHA256, jobCount:proof.jobs.length, attemptCount:proof.attempts.length};
    if (prepareCount) {
      const a = proof.attempts[0]; Object.assign(facts, {planID:a.planId,attemptID:a.id,jobID:a.jobId});
      if (prepared) facts.immutableAUnchanged = true;
    }
    if (next === 4) facts.pickerCancelUnchanged = true;
    if (actualFollowUp) facts.followUpDay = actualFollowUp;
    // This fact describes observed disk equality. The UI test and outer runner
    // separately prove the process boundary and visible offline A/B/follow-up.
    if (next >= 15) facts.persistedRestartUnchanged = true;
    return {ready:true, facts, commit() {
      if (request.sequence !== next) fail('checkpoint_commit_repeated');
      initialSeedHash ??= seedReceiptSHA256; initialJobID ??= jobID; initialPrimaryBackupHash ??= primaryBackupHash; guestArchiveHash ??= archiveHash;
      if (next === 2) contactProjection = phoneContact(phone.profile);
      if (next === 6) prepared = {attempt:canonical(proof.attempts[0]),plan:canonical(proof.plans[0]),cache:canonical(phone.savedApplicationHistory)};
      if (next === 12) { restartPhoneHash = phoneHash; restartDiscoveryHash = discoveryHash; }
      if (next === 13) offlineEvidenceHash = sha256(canonical(proof));
      previous = {phoneHash, profileSHA256:server.profileSHA256, putCount, providerGets:proof.providerGets,
        recordsHash:actualFollowUp ? sha256(canonical(phone.applicationRecords)) : null};
      next++;
    }};
  }
  return {get nextSequence(){return next;}, get complete(){return next === CHECKPOINTS.length + 1;}, inspect};
}
