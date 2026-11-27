// Private Android durable/live journey observations. Pure; no I/O on import.
// Values are the actual WorkspaceStorage/DiscoverySnapshot JSON, not an iPhone projection.
import {CheckpointError, CHECKPOINTS, UUID, SHA, canonical, sha256} from './control-state.mjs';
import {SOURCE_ID, PDF, postingId, postingURL} from './data.mjs';
import {ANDROID_EXPECTED_COUNTS} from './android-ledger.mjs';
import {decodeAndroidJSON} from './android-json.mjs';

const fail = code => { throw new CheckpointError(code); };
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (v, keys) => object(v) && Object.keys(v).sort().join(',') === [...keys].sort().join(',');
const array = (v, max = 200) => Array.isArray(v) && v.length <= max;
const same = (a, b) => canonical(a) === canonical(b);
const hash = v => sha256(canonical(v));
const integer = (v, min = 0, max = 2147483647) => Number.isSafeInteger(v) && v >= min && v <= max;
const instant = v => typeof v === 'string' && v.length <= 64 && Number.isFinite(Date.parse(v));
const strings = (v, max = 200) => array(v, max) && v.every(x => typeof x === 'string') && new Set(v).size === v.length;
const uuid = v => typeof v === 'string' && UUID.test(v);
const lowerUUID = v => uuid(v) && v === v.toLowerCase();
const PRIMARY_IDENTITY = 'jobs.lever.co/synthetic-native-journey/' + postingId(1);
const NOTE = 'Synthetic follow-up: review the role and my questions.';
const COMPANY = 'Synthetic Native Journey Studio';
const PROFILE_TEXT = ['firstName','lastName','email','phone','city','country','headline','experienceLevel',
  'website','linkedin','draftSkills','draftTargetRoles','draftTargetCountries'];
const PROFILE_ARRAY = ['skills','targetRoles','targetCountries','workModes'];
const PROFILE_KEYS = [...PROFILE_TEXT, ...PROFILE_ARRAY, 'revision','draftResume','removeResume'];
const WORKSPACE_KEYS = ['schema','profile','profileDirty','opportunityDraft','recoveredOpportunityDrafts',
  'applicationRecords','recordDrafts','recordDraftAlternatives','jobs','activePlans','manualApplied','selected',
  'obsoleteReviews','continuationHolds','serverProfile','answers','receipts','importedReceipts'];
const LIVE_KEYS = ['loaded','busy','storageBlocked','requiresPairing','privateScope','profileDirty','profile',
  'receiptIDs','activePlanIDs','selectedIDs','planID','recordEditorOpen','errorPresent','testService','liveEnabled','discovery'];
const SEARCH_KEYS = ['schema','filters','displayedFilters','page','searchHistory','newResult','lastSearchSourceIds'];

function profile(value, revision, name) {
  if (!exact(value, PROFILE_KEYS) || value.revision !== revision || value.removeResume !== false ||
      !PROFILE_TEXT.every(k => typeof value[k] === 'string') ||
      !PROFILE_ARRAY.every(k => strings(value[k], 100))) fail('android_state_profile_shape');
  if (name === null) {
    if (value.draftResume !== null) fail('android_state_unexpected_cv');
  } else if (!exact(value.draftResume, ['name','mime','size','sha256']) ||
      value.draftResume.name !== name || value.draftResume.mime !== 'application/pdf' ||
      value.draftResume.size !== PDF.bytes || value.draftResume.sha256 !== PDF.sha256)
    fail('android_state_current_cv');
  if (value.firstName !== (revision ? 'Jamie' : '') ||
      value.email !== (revision ? 'jamie.native@example.com' : '') ||
      value.experienceLevel !== 'any' ||
      PROFILE_TEXT.filter(k => !['firstName','email','experienceLevel'].includes(k)).some(k => value[k] !== '') ||
      PROFILE_ARRAY.some(k => value[k].length !== 0)) fail('android_state_contact_changed');
}

function job(value, number, id, local) {
  if (!object(value) || !Object.keys(value).every(k =>
      ['id','url','title','company','location','country','localOnly','sourceName','checkedAt'].includes(k)) ||
      value.id !== id || value.url !== postingURL(number) ||
      value.title !== (number === 1 ? 'Service Designer' : 'Senior Service Designer') ||
      value.company !== COMPANY || value.location !== 'Riyadh' || value.country !== 'SA' ||
      value.localOnly !== local || value.sourceName !== COMPANY || !instant(value.checkedAt))
    fail('android_state_saved_job');
}

function receipt(value, expected) {
  if (!exact(value, ['attemptId','title','employer','state','applicationId','createdAt','error',
        'evidenceMode','resumeSHA256','provider','planId','resumeName','profileRevision']) ||
      value.attemptId !== expected.id || value.planId !== expected.planId ||
      value.title !== 'Service Designer' || value.employer !== COMPANY || value.state !== 'ready' ||
      value.applicationId !== '' || value.error !== '' || value.evidenceMode !== 'test' ||
      value.provider !== 'lever' || !instant(value.createdAt) || value.resumeName !== 'CV-A.pdf' ||
      value.profileRevision !== 2 || value.resumeSHA256 !== PDF.sha256)
    fail('android_state_prepared_receipt');
}

function recordBundle(bundle, primary, followUpDay) {
  if (!exact(bundle, ['identity','job','current','revision','alternatives','history','appliedElsewhere','relatedURLs']) ||
      bundle.identity !== PRIMARY_IDENTITY || !same(bundle.job, primary) || bundle.revision !== 1 ||
      !array(bundle.alternatives, 0) || !array(bundle.history, 0) || bundle.appliedElsewhere !== false ||
      !same(bundle.relatedURLs, [postingURL(1)])) fail('android_state_followup_bundle');
  const version = bundle.current;
  if (!exact(version, ['id','record','savedAt','source']) || !lowerUUID(version.id) ||
      !instant(version.savedAt) || version.source !== 'edited') fail('android_state_followup_version');
  const saved = version.record;
  if (!exact(saved, ['stage','appliedDate','followUpDate','note','appliedElsewhere']) ||
      saved.stage !== 'saved' || saved.appliedDate !== '' || saved.followUpDate !== followUpDay ||
      saved.note !== NOTE || saved.appliedElsewhere !== false) fail('android_state_private_followup');
}

const filtersValid = (v, populated) => exact(v, ['query','location','remoteOnly','sources']) &&
  v.query === (populated ? 'Service Designer' : '') && v.location === (populated ? 'Riyadh' : '') &&
  v.remoteOnly === false && same(v.sources, populated ? [SOURCE_ID] : []);
function sourceRows(rows, live) {
  if (!array(rows, 1) || rows.length !== 1) fail('android_state_discovery_sources');
  const row = rows[0];
  if (!object(row) || row.id !== SOURCE_ID || !['fresh','cached','stale','unavailable'].includes(row.status) ||
      row.checkedAt !== null && !instant(row.checkedAt)) fail('android_state_discovery_source');
  if (live) {
    if (!exact(row, ['id','status','checkedAt','errorPresent']) || typeof row.errorPresent !== 'boolean')
      fail('android_state_live_source');
  } else if (!exact(row, ['id','name','provider','boardUrl','status','checkedAt','availableCount','matchedCount','limited','error']) ||
      row.name !== COMPANY || row.provider !== 'lever' ||
      row.boardUrl !== 'https://jobs.lever.co/synthetic-native-journey' ||
      !integer(row.availableCount) || !integer(row.matchedCount) || typeof row.limited !== 'boolean' ||
      row.error !== null && (!exact(row.error, ['message']) || typeof row.error.message !== 'string'))
    fail('android_state_saved_source');
}
function jobRows(rows, live) {
  if (!array(rows, 2) || rows.length !== 2 || new Set(rows.map(x => x.id)).size !== 2)
    fail('android_state_discovery_jobs');
  for (const row of rows) {
    const number = [1, 2].find(n => row?.id === SOURCE_ID + ':' + postingId(n));
    if (!number || row.url !== postingURL(number) || typeof row.stale !== 'boolean' ||
        row[live ? 'sourceID' : 'sourceId'] !== SOURCE_ID) fail('android_state_discovery_job_identity');
    if (live && !exact(row, ['id','sourceID','url','stale'])) fail('android_state_live_job_shape');
    if (!live && (!exact(row, ['id','sourceId','sourceName','provider','title','company','url','location',
          'country','remote','summary','publishedAt','updatedAt','checkedAt','stale']) ||
        row.sourceName !== COMPANY || row.provider !== 'lever' || row.company !== COMPANY ||
        row.title !== (number === 1 ? 'Service Designer' : 'Senior Service Designer') ||
        row.location !== 'Riyadh' || row.country !== 'SA' || row.remote !== false ||
        typeof row.summary !== 'string' || !instant(row.checkedAt) ||
        row.publishedAt !== null && !instant(row.publishedAt) || row.updatedAt !== null && !instant(row.updatedAt)))
      fail('android_state_saved_discovery_job');
  }
}
const liveJobProjection = page => page.jobs.map(j => ({id:j.id,sourceID:j.sourceId,url:j.url,stale:j.stale}));
const liveSourceProjection = page => page.sources.map(s => ({id:s.id,status:s.status,checkedAt:s.checkedAt,errorPresent:s.error !== null}));

function discovery(saved, live, sequence, previousSearchHash) {
  if (!exact(live, ['filters','status','loading','restoredSearch','errorPresent','jobs','sources']) ||
      live.loading !== false || typeof live.restoredSearch !== 'boolean' || typeof live.errorPresent !== 'boolean' ||
      !array(live.jobs, 200) || !array(live.sources, 4)) fail('android_state_live_discovery_shape');
  if (sequence < 3) {
    if (!filtersValid(live.filters, false) || live.status !== null || live.jobs.length || live.sources.length || live.errorPresent)
      fail('android_state_initial_discovery_not_blank');
    if (saved === null) return null;
    if (!exact(saved, SEARCH_KEYS) || saved.schema !== 1 || !filtersValid(saved.filters, false) ||
        ['displayedFilters','page','searchHistory','newResult','lastSearchSourceIds'].some(k => saved[k] !== null))
      fail('android_state_initial_saved_search_not_blank');
    return hash(saved);
  }
  if (!exact(saved, SEARCH_KEYS) || saved.schema !== 1 || !filtersValid(saved.filters, true) ||
      !filtersValid(saved.displayedFilters, true) || !filtersValid(live.filters, true) ||
      !object(saved.page) || !object(saved.searchHistory) || !object(saved.newResult) ||
      !same(saved.lastSearchSourceIds, [SOURCE_ID])) fail('android_state_saved_discovery_shape');
  const page = saved.page;
  if (!exact(page, ['ok','version','generatedAt','status','totalMatches','limited','notice','nextCursor','jobs','sources']) ||
      page.ok !== true || page.version !== 1 || !instant(page.generatedAt) ||
      !['complete','partial'].includes(page.status) || page.totalMatches !== 2 || page.limited !== false ||
      typeof page.notice !== 'string' || page.nextCursor !== null) fail('android_state_saved_page');
  jobRows(page.jobs, false); sourceRows(page.sources, false);
  jobRows(live.jobs, true); sourceRows(live.sources, true);
  const searchHash = hash(saved);
  if (sequence >= 12 && sequence < 15 && live.status === 'unavailable') {
    // Actual unavailable branch retains lastPage/history but publishes live failure sources.
    if (!live.errorPresent || !same(live.jobs, liveJobProjection(page)) ||
        !live.sources.some(s => s.status === 'unavailable' || s.errorPresent) ||
        previousSearchHash !== searchHash) fail('android_state_unavailable_branch');
  } else {
    if (live.status !== page.status || !same(live.jobs, liveJobProjection(page)) ||
        !same(live.sources, liveSourceProjection(page))) fail('android_state_live_saved_search_mismatch');
    if (sequence < 12 && (page.status !== 'complete' || live.errorPresent ||
        page.jobs.some(j => j.stale) || page.sources.some(s => !['fresh','cached'].includes(s.status))))
      fail('android_state_initial_search_result');
    if (sequence >= 12 && sequence < 15 && (page.status !== 'partial' ||
        !page.sources.some(s => s.status === 'stale' || s.status === 'unavailable' || s.error !== null)))
      fail('android_state_outage_not_observed');
  }
  if (sequence >= 15 && live.restoredSearch !== true) fail('android_state_search_not_restored');
  return searchHash;
}

/** Validate the pinned participant's actual store witness; never create a missing outcome. */
export function createAndroidDurableState({binding, followUpDay}) {
  const followUpMillis = typeof followUpDay === 'string' ? Date.parse(followUpDay + 'T00:00:00Z') : NaN;
  if (!binding || typeof followUpDay !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(followUpDay) ||
      !Number.isFinite(followUpMillis) || new Date(followUpMillis).toISOString().slice(0, 10) !== followUpDay)
    fail('android_state_binding');
  let next = 1, firstProcess = null, restartedProcess = null, restart = null;
  let previous = null, preparedReceiptHash = null, recordHash = null, connectionHash = null;
  let offlineWorkspaceHash = null, offlineSearchHash = null, primaryHash = null, secondaryHash = null;

  function bindRestartBoundary({boundaryBytes, seedHandoffBytes, restorePreActivityBytes}) {
    if (next !== 15 || restart) fail('android_state_restart_admission');
    const boundary = decodeAndroidJSON(boundaryBytes, 16384), seed = decodeAndroidJSON(seedHandoffBytes, 32768),
      before = decodeAndroidJSON(restorePreActivityBytes, 32768);
    const names = ['connection', 'workspace-' + previous.workspaceKey, 'search-' + previous.workspaceKey];
    if (!exact(boundary, ['schemaVersion','testID','seedProcess','forceStopIssued','noTargetPIDObserved','postStopCiphertexts','seedHandoffSHA256']) ||
        boundary.schemaVersion !== 1 || boundary.testID !== binding.testID ||
        boundary.forceStopIssued !== true || boundary.noTargetPIDObserved !== true ||
        !same(boundary.seedProcess, firstProcess) || !exact(boundary.postStopCiphertexts, names) ||
        !Object.values(boundary.postStopCiphertexts).every(x => SHA.test(x)) ||
        boundary.seedHandoffSHA256 !== sha256(seedHandoffBytes)) fail('android_state_process_boundary');
    if (!exact(seed, ['schemaVersion','testID','process','lastCheckpoint','expectedNextCheckpoint','beforeOnStopCiphertextsAreNotClaimedStable','source']) ||
        seed.schemaVersion !== 1 || seed.testID !== binding.testID || seed.lastCheckpoint !== 14 || seed.expectedNextCheckpoint !== 15 ||
        seed.beforeOnStopCiphertextsAreNotClaimedStable !== true || !same(seed.source, binding.source) ||
        !same(seed.process, firstProcess)) fail('android_state_seed_handoff');
    if (!exact(before, ['schemaVersion','testID','process','seedProcess','ciphertexts','boundarySHA256','noReseed','activityStarted']) ||
        before.schemaVersion !== 1 || before.testID !== binding.testID || before.noReseed !== true || before.activityStarted !== false ||
        before.boundarySHA256 !== sha256(boundaryBytes) || !same(before.seedProcess, firstProcess) ||
        !same(before.ciphertexts, boundary.postStopCiphertexts) || !exact(before.process, ['pid','startTicks','nonce']) ||
        !integer(before.process.pid, 1) || typeof before.process.startTicks !== 'string' || !/^[1-9][0-9]{0,19}$/.test(before.process.startTicks) ||
        !uuid(before.process.nonce) || before.process.nonce !== before.process.nonce.toUpperCase() ||
        ['pid','startTicks','nonce'].some(k => before.process[k] === firstProcess[k]))
      fail('android_state_restore_before_activity');
    restart = {boundarySHA256:sha256(boundaryBytes), postStopCiphertexts:boundary.postStopCiphertexts};
    restartedProcess = before.process;
  }

  function inspect(decoded, ledger) {
    const {request, witness, workspaceKey} = decoded;
    if (request.sequence !== next || request.checkpoint !== CHECKPOINTS[next - 1] || !ledger?.ready)
      fail('android_state_sequence');
    if (firstProcess && !same(witness.process, next < 15 ? firstProcess : restartedProcess) || next >= 15 && !restart)
      fail('android_state_process_changed');
    const live = witness.live, workspace = witness.storage.workspace?.value;
    if (!exact(live, LIVE_KEYS) || !exact(workspace, WORKSPACE_KEYS) || workspace.schema !== 1 ||
        live.loaded !== true || live.busy !== false || live.storageBlocked !== false || live.requiresPairing !== false ||
        live.privateScope !== 'workspace-' + workspaceKey || live.profileDirty !== false || workspace.profileDirty !== false ||
        live.recordEditorOpen !== false || live.liveEnabled !== false || typeof live.errorPresent !== 'boolean' ||
        live.testService !== (next < 15) || !same(live.profile, workspace.profile) || !same(workspace.serverProfile, workspace.profile))
      fail('android_state_workspace_or_live_shape');
    const revision = ANDROID_EXPECTED_COUNTS[next - 1][0], cv = revision < 2 ? null : revision === 2 ? 'CV-A.pdf' : 'CV-B.pdf';
    profile(workspace.profile, revision, cv);
    const blank = workspace.opportunityDraft;
    if (!exact(blank, ['url','title','company','location','country']) || Object.values(blank).some(x => x !== '') ||
        !exact(workspace.answers, []) ||
        ['recoveredOpportunityDrafts','recordDrafts','recordDraftAlternatives','activePlans','manualApplied','continuationHolds','importedReceipts'].some(k => !array(workspace[k], 0)) ||
        !array(live.activePlanIDs, 0) || !strings(workspace.selected, 1) || !strings(live.selectedIDs, 1) ||
        !strings(workspace.obsoleteReviews, 1)) fail('android_state_unexpected_private_work');
    const wantedSelection = next >= 6 ? [ledger.jobID] : [];
    if (!same(workspace.selected, wantedSelection) || !same(live.selectedIDs, wantedSelection) ||
        !same(workspace.obsoleteReviews, next >= 7 ? [ledger.plan.id] : []) ||
        live.planID !== (next === 6 ? ledger.plan.id : null)) fail('android_state_review_state');
    const jobs = workspace.jobs;
    if (!array(jobs, 2) || jobs.length !== ledger.expectedLocalJobs || new Set(jobs.map(x => x.id)).size !== jobs.length)
      fail('android_state_job_inventory');
    const primary = jobs.find(x => x.url === postingURL(1)), secondary = jobs.find(x => x.url === postingURL(2));
    if (next >= 3) job(primary, 1, ledger.jobID, false);
    if (next >= 10) {
      if (typeof secondary?.id !== 'string' || !/^local-[a-f0-9-]{36}$/.test(secondary.id)) fail('android_state_local_job_id');
      job(secondary, 2, secondary.id, true);
    }
    if (primaryHash && hash(primary) !== primaryHash || secondaryHash && hash(secondary) !== secondaryHash)
      fail('android_state_bookmark_changed');
    const receipts = workspace.receipts;
    if (!array(receipts, 1) || receipts.length !== (next >= 6 ? 1 : 0) ||
        !same(live.receiptIDs, next >= 6 ? [ledger.attempt.id] : [])) fail('android_state_receipt_inventory');
    if (next >= 6) receipt(receipts[0], ledger.attempt);
    if (preparedReceiptHash && hash(receipts) !== preparedReceiptHash) fail('android_state_historical_cv_changed');
    if (!exact(workspace.applicationRecords, ['schema','records']) || workspace.applicationRecords.schema !== 1 ||
        !array(workspace.applicationRecords.records, 1) || workspace.applicationRecords.records.length !== (next >= 8 ? 1 : 0))
      fail('android_state_record_inventory');
    if (next >= 8) recordBundle(workspace.applicationRecords.records[0], primary, followUpDay);
    if (recordHash && hash(workspace.applicationRecords) !== recordHash) fail('android_state_record_changed');
    const workspaceHash = hash(workspace), savedSearch = witness.storage.search?.value ?? null;
    const searchHash = discovery(savedSearch, live.discovery, next, previous?.searchHash);
    if (connectionHash && witness.storage.connection.sha256 !== connectionHash) fail('android_state_connection_changed');
    if (next === 4 && (workspaceHash !== previous.workspaceHash || searchHash !== previous.searchHash))
      fail('android_state_picker_cancel_changed');
    if (next >= 13 && (workspaceHash !== offlineWorkspaceHash || searchHash !== offlineSearchHash))
      fail('android_state_offline_durable_change');
    const facts = {};
    if (next === 4) facts.pickerCancelUnchanged = true;
    if (next >= 8) facts.followUpDay = followUpDay;
    if (next >= 15) facts.persistedRestartUnchanged = true;
    const admitted = next;
    return {facts, hashes:{workspace:workspaceHash,search:searchHash}, commit() {
      if (next !== admitted) fail('android_state_repeated_commit');
      firstProcess ??= witness.process; connectionHash ??= witness.storage.connection.sha256;
      if (next >= 3) primaryHash ??= hash(primary);
      if (next >= 10) secondaryHash ??= hash(secondary);
      if (next === 6) preparedReceiptHash = hash(receipts);
      if (next === 8) recordHash = hash(workspace.applicationRecords);
      if (next === 12) { offlineWorkspaceHash = workspaceHash; offlineSearchHash = searchHash; }
      previous = {workspaceHash,searchHash,workspaceKey}; next++;
    }};
  }
  return {inspect, bindRestartBoundary, get nextSequence() { return next; }, get complete() { return next === 17; }};
}
