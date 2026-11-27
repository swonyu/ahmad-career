// Fixed Android journey ledger checks. Pure; no runtime or network on import.
import {CheckpointError, CHECKPOINTS, SHA, UUID, canonical, sha256} from './control-state.mjs';
import {assertZeroDispatch} from './contract.mjs';
import {SOURCE_ID, PDF, postingId} from './data.mjs';

export const ANDROID_EXPECTED_COUNTS = Object.freeze([
  [0,0,0,0,1,0], [1,0,0,0,1,0], [1,1,0,1,2,1], [1,1,0,1,2,1],
  [2,1,0,1,2,1], [2,1,1,1,3,1], [3,1,1,1,3,1], [3,1,1,1,3,1],
  [3,1,1,2,3,1], [3,2,1,2,3,1], [3,2,1,2,3,1], [3,2,1,3,3,1],
  [3,2,1,3,3,1], [3,2,1,3,3,1], [3,2,1,3,3,1], [3,2,1,3,3,1],
].map(row => Object.freeze(row))); // profilePUT, jobsPOST, preparePOST, searchGET, workspaceGET, sourcesGET
const fail = code => { throw new CheckpointError(code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, maximum = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && value >= 0 && value <= maximum;
const exactKeys = (value, keys) => object(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const emptyBodySHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export function createAndroidLedgerState({testID, workspaceID, workerSHA256, bridgePort, caFingerprint256}) {
  if (!UUID.test(testID ?? '') || testID !== testID.toUpperCase() || !UUID.test(workspaceID ?? '') ||
      !SHA.test(workerSHA256 ?? '') || !integer(bridgePort, 65535) || bridgePort < 1024 ||
      typeof caFingerprint256 !== 'string' ||
      !/^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(caFingerprint256))
    fail('android_ledger_binding');
  let next = 1, previous = null, primaryJobID = null, prepared = null, offlineProofHash = null;

  function inspect(request, proof, {afterControl = true, transportClosed = false} = {}) {
    if (!request || request.testID !== testID || request.sequence !== next ||
        request.checkpoint !== CHECKPOINTS[next - 1]) fail('android_ledger_sequence');
    if (!object(proof) || proof.ok !== true || proof.schemaVersion !== 1 ||
        proof.workerSHA256 !== workerSHA256 || proof.hostOutboundCheckObserved !== true ||
        !Array.isArray(proof.workspaces) || proof.workspaces.length !== 1 ||
        proof.workspaces[0].id !== workspaceID) fail('android_ledger_source_or_owner');
    try { assertZeroDispatch(proof); } catch { fail('android_ledger_zero_dispatch'); }
    if (['unexpectedProviderTargets', 'capabilityChanges'].some(key => proof[key] !== 0) ||
        !integer(proof.providerGets) || !Array.isArray(proof.nativeCalls) || proof.nativeCalls.length > 128 ||
        !Array.isArray(proof.jobs) || proof.jobs.length > 200 || !Array.isArray(proof.controls))
      fail('android_ledger_shape');
    const bridge = proof.bridge;
    if (!object(bridge) || bridge.host !== '127.0.0.1' || bridge.port !== bridgePort ||
        bridge.caFingerprint256 !== caFingerprint256 || bridge.inFlight !== 0 ||
        bridge.apiRequests !== proof.nativeCalls.length || bridge.proxyRequests !== 0 ||
        !['deniedRequests', 'socketErrors', 'tlsErrors'].every(key => integer(bridge[key], 128)) ||
        !exactKeys(bridge.documentRequests, PDF.names) ||
        !Object.values(bridge.documentRequests).every(value => integer(value, 64)) ||
        bridge.pdf?.sha256 !== PDF.sha256 || bridge.pdf?.bytes !== PDF.bytes ||
        canonical(bridge.pdf?.names) !== canonical(PDF.names) ||
        !Array.isArray(bridge.events) || bridge.events.length > 64) fail('android_ledger_bridge');
    const server = proof.workspaces[0];
    if (!integer(server.revision) || !SHA.test(server.profileSHA256 ?? '') ||
        ![null, ...PDF.names].includes(server.resumeName) ||
        server.resumeSHA256 !== null && server.resumeSHA256 !== PDF.sha256)
      fail('android_ledger_profile_shape');

    const counts = [0, 0, 0, 0, 0, 0];
    for (const call of proof.nativeCalls) {
      if (!object(call) || !integer(call.status, 599) || call.status < 100 ||
          !SHA.test(call.requestBodySHA256 ?? '') || !integer(call.requestBytes) ||
          typeof call.nativeTokenPresent !== 'boolean') fail('android_ledger_call_shape');
      const key = call.method + ' ' + call.path;
      const readIndex = {'GET /api/discovery/search':3, 'GET /api/apply/workspace':4,
        'GET /api/discovery/sources':5}[key];
      if (readIndex !== undefined) {
        if (call.status !== 200 || call.requestBytes !== 0 || call.requestBodySHA256 !== emptyBodySHA ||
            readIndex === 4 && call.nativeTokenPresent !== true) fail('android_ledger_read');
        counts[readIndex]++;
      } else if (key === 'PUT /api/apply/profile') {
        counts[0]++;
        if (call.status !== 200 || call.nativeTokenPresent !== true || call.requestBytes < 1)
          fail('android_ledger_profile_write');
      } else if (key === 'POST /api/apply/jobs') {
        counts[1]++;
        if (call.status !== (counts[1] === 1 ? 201 : 409) ||
            call.nativeTokenPresent !== true || call.requestBytes < 1) fail('android_ledger_job_write');
      } else if (key === 'POST /api/apply/prepare') {
        counts[2]++;
        if (call.status !== 201 || call.nativeTokenPresent !== true || call.requestBytes < 1)
          fail('android_ledger_prepare');
      } else fail('android_ledger_unexpected_route');
    }
    const target = ANDROID_EXPECTED_COUNTS[next - 1];
    let ready = true;
    const expectedServerJobs = next >= 3 ? 1 : 0;
    for (const [actual, expected] of [
      ...counts.map((value, index) => [value, target[index]]),
      [server.revision, target[0]], [proof.jobs.length, expectedServerJobs],
      [proof.attempts.length, target[2]], [proof.plans.length, target[2]],
    ]) {
      if (actual > expected) fail('android_ledger_state_advanced');
      if (actual < expected) ready = false;
    }
    if (next >= 5 && bridge.documentRequests['CV-A.pdf'] < 1 ||
        next >= 7 && bridge.documentRequests['CV-B.pdf'] < 1) ready = false;

    const controlTarget = next >= 11 ? 2 : next >= 9 ? 1 : 0;
    const actualControlTarget = controlTarget - (!afterControl && [9, 11].includes(next) ? 1 : 0);
    if (proof.controls.length !== actualControlTarget ||
        proof.controls.some((value, index) => !object(value) || value.board !== ['closed', 'unavailable'][index]) ||
        proof.board !== ['open', 'closed', 'unavailable'][actualControlTarget])
      fail('android_ledger_board_control');
    if (proof.jobs.some(job => !object(job) || !UUID.test(job.id ?? '') ||
        job.workspace_id !== workspaceID || job.job_key !== SOURCE_ID + ':' + postingId(1)) ||
        new Set(proof.jobs.map(job => job.id)).size !== proof.jobs.length)
      fail('android_ledger_job_identity');
    const jobID = proof.jobs[0]?.id ?? null;
    if (primaryJobID !== null && jobID !== primaryJobID) fail('android_ledger_job_changed');
    const cv = target[0] < 2 ? null : target[0] === 2 ? 'CV-A.pdf' : 'CV-B.pdf';
    if (server.resumeName !== cv || server.resumeSHA256 !== (cv === null ? null : PDF.sha256)) ready = false;
    if (previous && target[0] === previous.revision && server.profileSHA256 !== previous.profileSHA256)
      fail('android_ledger_profile_changed');

    let preparedProjection = null;
    if (target[2] && proof.attempts.length === 1 && proof.plans.length === 1) {
      const attempt = proof.attempts[0], plan = proof.plans[0];
      if (![attempt.id, attempt.planId, attempt.jobId, plan.id].every(value => UUID.test(value ?? '')) ||
          attempt.planId !== plan.id || attempt.jobId !== jobID || attempt.profileRevision !== 2 ||
          plan.profileRevision !== 2 || attempt.resumeName !== 'CV-A.pdf' ||
          attempt.resumeSHA256 !== PDF.sha256 || !SHA.test(attempt.snapshotSHA256 ?? ''))
        fail('android_ledger_prepared_snapshot');
      preparedProjection = {attempt: canonical(attempt), plan: canonical(plan)};
      if (prepared && canonical(preparedProjection) !== canonical(prepared))
        fail('android_ledger_prepared_snapshot_changed');
    }
    if ([10, 12].includes(next) && previous && proof.providerGets <= previous.providerGets) ready = false;
    const needsClosed = next > 13 || next === 13 && afterControl;
    if (typeof transportClosed !== 'boolean' || transportClosed !== needsClosed)
      fail('android_ledger_transport_control');
    const proofHash = sha256(canonical(proof));
    if (offlineProofHash && proofHash !== offlineProofHash) fail('android_ledger_offline_mutation');
    if (!ready) return {ready: false};

    const facts = {zeroDispatch: true, sourceAndOwnerBound: true, profileRevision: server.revision,
      resumeName: server.resumeName, resumeSHA256: server.resumeSHA256,
      jobCount: proof.jobs.length, attemptCount: proof.attempts.length};
    if (preparedProjection) {
      const attempt = proof.attempts[0];
      Object.assign(facts, {planID: attempt.planId, attemptID: attempt.id, jobID: attempt.jobId});
      if (prepared) facts.immutableAUnchanged = true;
    }
    const admittedSequence = next;
    return {ready: true, facts, jobID, attempt: proof.attempts[0] ?? null, plan: proof.plans[0] ?? null,
      expectedLocalJobs: next >= 10 ? 2 : expectedServerJobs,
      commit() {
        if (next !== admittedSequence) fail('android_ledger_repeated_commit');
        primaryJobID ??= jobID;
        if (next === 6) prepared = preparedProjection;
        if (next === 13) offlineProofHash = proofHash;
        previous = {revision: target[0], profileSHA256: server.profileSHA256, providerGets: proof.providerGets};
        next++;
      }};
  }
  return {inspect, get nextSequence() { return next; }, get complete() { return next === 17; }};
}
