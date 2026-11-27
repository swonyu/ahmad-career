// Host-only file IPC. Importing creates no file, listener, process, harness or native action.
import {constants} from 'node:fs';
import {open, lstat, realpath, readdir, mkdir, link, unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {CHECKPOINTS, CONTROL_LIMITS, CheckpointError, UUID, SHA, canonical, sha256,
  decodeBoundedJSON, decodeControlRequest, createCheckpointState, discoveryFilename,
  operationJournalFilename, needsReconciledJournal} from './control-state.mjs';

const fail = code => { throw new CheckpointError(code); };
// Failure receipts never serialize a foreign error's message or arbitrary code.
const FAILURE_CODES = new Set([
  'checkpoint_accepted_file_changed','checkpoint_binding_invalid','checkpoint_board_control_changed',
  'checkpoint_board_control_rejected','checkpoint_bootstrap_changed','checkpoint_bridge_evidence',
  'checkpoint_cached_history_changed','checkpoint_call_shape','checkpoint_cleanup_bound',
  'checkpoint_cleanup_unsettled','checkpoint_closed_bookmark_changed','checkpoint_commit_repeated',
  'checkpoint_concurrent_poll','checkpoint_contact_changed','checkpoint_container_binding',
  'checkpoint_controller_binding','checkpoint_controller_rejected','checkpoint_deadline_or_stopped',
  'checkpoint_directory_changed','checkpoint_directory_identity','checkpoint_discovery_identity',
  'checkpoint_evidence_parent','checkpoint_evidence_shape','checkpoint_file_changed',
  'checkpoint_file_inventory','checkpoint_file_missing','checkpoint_file_read_rejected',
  'checkpoint_file_shape','checkpoint_guest_archive_changed','checkpoint_harness_deadline',
  'checkpoint_harness_evidence_rejected','checkpoint_initial_profile_not_blank','checkpoint_job_mutation_rejected',
  'checkpoint_json_complexity','checkpoint_json_duplicate_key','checkpoint_json_invalid',
  'checkpoint_json_number','checkpoint_json_size','checkpoint_json_utf8',
  'checkpoint_lease_changed','checkpoint_local_job_identity','checkpoint_observation_limit',
  'checkpoint_offline_disk_changed','checkpoint_offline_server_changed','checkpoint_pending_file',
  'checkpoint_operation_journal_shape',
  'checkpoint_pending_inventory','checkpoint_phone_revision','checkpoint_phone_scope_or_shape',
  'checkpoint_picker_changed_state','checkpoint_prepare_rejected','checkpoint_prepared_snapshot_changed',
  'checkpoint_prepared_snapshot_invalid','checkpoint_primary_job_changed','checkpoint_private_followup_changed',
  'checkpoint_primary_backup_changed',
  'checkpoint_private_record_mutated','checkpoint_private_records_unexpected','checkpoint_profile_evidence',
  'checkpoint_profile_mutation_rejected','checkpoint_read_rejected','checkpoint_request_age',
  'checkpoint_request_shape_or_sequence','checkpoint_response_changed','checkpoint_response_size',
  'checkpoint_retained_size','checkpoint_seed_changed','checkpoint_sequence_changed',
  'checkpoint_server_job_identity','checkpoint_server_profile_changed','checkpoint_source_changed',
  'checkpoint_source_or_owner','checkpoint_source_pin','checkpoint_state_advanced_unexpectedly',
  'checkpoint_transport_close_rejected','checkpoint_transport_control_changed','checkpoint_unexpected_native_call',
  'checkpoint_zero_dispatch'
]);
const mono = () => performance.now();
const sameIdentity = (a,b) => a.dev === b.dev && a.ino === b.ino && a.uid === b.uid;
const sameFile = (a,b) => sameIdentity(a,b) && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
const identity = s => ({dev:s.dev,ino:s.ino,uid:s.uid});
const exists = async name => { try { return await lstat(name); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };

async function directory(filename, binding, {privateMode = false} = {}) {
  const before = await lstat(filename);
  if (!before.isDirectory() || before.isSymbolicLink() || before.uid !== process.getuid() ||
      privateMode && (before.mode & 0o777) !== 0o700 || (before.mode & 0o022) !== 0 ||
      binding && !sameIdentity(before,binding) || await realpath(filename) !== filename) fail('checkpoint_directory_identity');
  const after = await lstat(filename);
  if (!sameIdentity(before,after)) fail('checkpoint_directory_changed');
  return identity(after);
}

/** Bounded descriptor read, same named inode before/after; never follows a symlink. */
export async function readCheckpointFile(filename, maximum, {privateMode = false, uid = process.getuid()} = {}) {
  let handle;
  try {
    const named = await lstat(filename);
    if (!named.isFile() || named.isSymbolicLink() || named.uid !== uid || named.nlink !== 1 ||
        named.size < 1 || named.size > maximum || (named.mode & 0o022) !== 0 ||
        privateMode && (named.mode & 0o777) !== 0o600 || await realpath(filename) !== filename) fail('checkpoint_file_shape');
    handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = await handle.stat();
    if (!sameFile(named,before)) fail('checkpoint_file_changed');
    const capacity = before.size + 1, buffer = Buffer.alloc(capacity); let used = 0;
    while (used < capacity) {
      const {bytesRead} = await handle.read(buffer, used, capacity - used, null);
      if (!bytesRead) break; used += bytesRead;
    }
    const after = await handle.stat(), finalName = await lstat(filename);
    if (used !== before.size || used > maximum || !sameFile(before,after) || !sameFile(after,finalName)) fail('checkpoint_file_changed');
    return {bytes:buffer.subarray(0,used),sha256:sha256(buffer.subarray(0,used)),stat:identity(after),mtimeMs:after.mtimeMs};
  } catch (error) {
    if (error instanceof CheckpointError) throw error;
    fail(error.code === 'ENOENT' ? 'checkpoint_file_missing' : 'checkpoint_file_read_rejected');
  } finally { await handle?.close(); }
}
async function stableRead(filename, maximum, options) {
  const first = await readCheckpointFile(filename,maximum,options);
  const second = await readCheckpointFile(filename,maximum,options);
  if (first.sha256 !== second.sha256 || !sameIdentity(first.stat,second.stat)) fail('checkpoint_file_changed');
  return second;
}
async function exclusivePrivate(filename, bytes) {
  let handle;
  try {
    handle = await open(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(bytes); await handle.sync();
  } finally { await handle?.close(); }
}
const jsonBytes = value => Buffer.from(JSON.stringify(value,null,2) + '\n');

/**
 * The reviewed outer wrapper supplies exact fresh container identities, source
 * files and its monotonic stop time. Requests contain no path or authority.
 * It calls poll() sequentially; this module starts no poller of its own.
 */
export async function createFileCheckpointController({harness, bridge, testID, workspaceID, logicalOrigin,
  workerSHA256, bootstrapSHA256, followUpDay, runnerContainer, appContainer,
  evidenceParent, expectedSourceFiles, stopAt}) {
  if (!harness || harness.workerSHA256 !== workerSHA256 || typeof harness.evidence !== 'function' ||
      typeof harness.setBoard !== 'function' || !bridge || typeof bridge.evidence !== 'function' ||
      typeof bridge.close !== 'function' || !Number.isSafeInteger(bridge.privateConfiguration?.port) ||
      typeof bridge.caFingerprint256 !== 'string' || !Number.isFinite(stopAt) || stopAt <= mono() ||
      stopAt > mono() + 1800_000 || !UUID.test(testID ?? '') || testID !== testID.toUpperCase() ||
      !expectedSourceFiles || Object.keys(expectedSourceFiles).length < 1 || Object.keys(expectedSourceFiles).length > 160) fail('checkpoint_controller_binding');
  for (const binding of [runnerContainer,appContainer]) {
    if (!binding || !path.isAbsolute(binding.path ?? '') || path.resolve(binding.path) !== binding.path ||
        ![binding.dev,binding.ino,binding.uid].every(Number.isSafeInteger)) fail('checkpoint_container_binding');
    await directory(binding.path,binding);
  }
  if (runnerContainer.path === appContainer.path) fail('checkpoint_container_binding');
  if (!path.isAbsolute(evidenceParent) || path.resolve(evidenceParent) !== evidenceParent) fail('checkpoint_evidence_parent');
  const parentIdentity = await directory(evidenceParent,null,{privateMode:true});
  const sourceNames = Object.keys(expectedSourceFiles).sort();
  for (const name of sourceNames) if (!path.isAbsolute(name) || path.resolve(name) !== name || !SHA.test(expectedSourceFiles[name])) fail('checkpoint_source_pin');
  async function sourcePins() {
    for (const name of sourceNames) if ((await readCheckpointFile(name,8*1024*1024)).sha256 !== expectedSourceFiles[name]) fail('checkpoint_source_changed');
  }
  await sourcePins();
  const controlPath = path.join(runnerContainer.path,'Documents','NativeJourneyControl',testID);
  const appRoot = path.join(appContainer.path,'Library','Application Support','CareerFinderUIAcceptance',testID);
  const draftPath = path.join(appRoot,'applications','phone-draft.json');
  const operationJournalPath = path.join(appRoot,'applications',operationJournalFilename(logicalOrigin,workspaceID));
  // CareerDiscoveryStore.attach(to:) uses the actual owner-scoped filename.
  const discoveryPath = path.join(appRoot,discoveryFilename(logicalOrigin,workspaceID));
  const seedPath = path.join(appRoot,'native-journey-seed-receipt.json');
  const bootstrapPath = path.join(appRoot,'native-journey-bootstrap.private.json');
  const output = path.join(evidenceParent,'control-' + testID);
  await mkdir(output,{mode:0o700});
  const outputIdentity = await directory(output,null,{privateMode:true});
  const token = randomBytes(32).toString('hex');
  const lease = {schemaVersion:1,purpose:'native-journey-file-checkpoints',testID,token,pid:process.pid,
    runnerContainer,appContainer,sourcePinsSHA256:sha256(canonical(expectedSourceFiles)),workerSHA256,bootstrapSHA256};
  const leasePath = path.join(output,'controller-owner.private.json'), leaseBytes = jsonBytes(lease);
  await exclusivePrivate(leasePath,leaseBytes);
  const leaseSHA = sha256(leaseBytes);
  const state = createCheckpointState({testID,workspaceID,logicalOrigin,workerSHA256,bootstrapSHA256,followUpDay,
    bridgePort:bridge.privateConfiguration.port,caFingerprint256:bridge.caFingerprint256});
  const acceptedFiles = new Map(), pending = new Set(), checkpoints = [];
  let controlIdentity, appIdentity, polling = false, stopped = false, controlAttempted = false, transportCloseReceipt;
  let failureContext = null, failureRetention = 'not_attempted';
  function remember(role, bytes) {
    if (!failureContext) return;
    if (!Buffer.isBuffer(bytes) || bytes.length > CONTROL_LIMITS.evidenceBytes) fail('checkpoint_retained_size');
    failureContext.originals.set(role,{bytes:Buffer.from(bytes),observedAtUptimeMs:mono(),
      observation:failureContext.observation});
  }
  // This path reads only our evidence directory and lease. It never obtains a
  // new app/harness observation, changes a control or publishes a response.
  async function retainFailure(error, failedAtUptimeMs) {
    if (failureRetention !== 'not_attempted') return;
    failureRetention = 'retaining';
    const context = failureContext;
    const prefix = context?.prefix ?? 'controller';
    const code = FAILURE_CODES.has(error?.code) ? error.code : 'checkpoint_controller_rejected';
    const records = [...(context?.originals ?? [])].map(([role,value])=>({role,...value}));
    const event = {schemaVersion:1,testID,sequence:context?.sequence ?? state.nextSequence,
      checkpoint:context?.checkpoint ?? null,failureCode:code,accepted:false,
      deadlineUptimeMs:context?.deadline ?? null,failedAtUptimeMs,
      retentionStartedAtUptimeMs:mono(),controlAttempted:context?.controlAttempted === true,
      responsePublished:context?.responsePublished === true,
      observationMeaning:'Partial already-observed bytes; not an atomic or accepted witness.'};
    try {
      await directory(evidenceParent,parentIdentity,{privateMode:true});
      await directory(output,outputIdentity,{privateMode:true});
      if ((await stableRead(leasePath,16384,{privateMode:true})).sha256 !== leaseSHA) fail('checkpoint_lease_changed');
      const eventName = prefix + '-failure-event.json';
      await exclusivePrivate(path.join(output,eventName),jsonBytes(event));
      const originals = [];
      for (const record of records) {
        const name = prefix + '-failure-' + record.role + '.original.json';
        await exclusivePrivate(path.join(output,name),record.bytes);
        originals.push({name,bytes:record.bytes.length,sha256:sha256(record.bytes),
          observation:record.observation,observedAtUptimeMs:record.observedAtUptimeMs,
          returnedAfterDeadline:event.deadlineUptimeMs !== null && record.observedAtUptimeMs >= event.deadlineUptimeMs});
      }
      await exclusivePrivate(path.join(output,prefix+'-failure-manifest.json'),jsonBytes({...event,
        retentionFinishedAtUptimeMs:mono(),originals}));
      failureRetention = 'retained';
    } catch {
      // Best-effort evidence cannot replace the original rejection or turn it
      // into a pass. Exclusive partial files, if any, remain for inspection.
      failureRetention = 'retention_rejected';
    }
  }
  function guard(deadline = stopAt) {
    if (stopped || mono() >= Math.min(stopAt,deadline)) { stopped = true; fail('checkpoint_deadline_or_stopped'); }
  }
  async function owned(deadline) {
    guard(deadline);
    await directory(runnerContainer.path,runnerContainer); await directory(appContainer.path,appContainer);
    await directory(evidenceParent,parentIdentity,{privateMode:true}); await directory(output,outputIdentity,{privateMode:true});
    if ((await stableRead(leasePath,16384,{privateMode:true})).sha256 !== leaseSHA) fail('checkpoint_lease_changed');
    if (controlIdentity) await directory(controlPath,controlIdentity,{privateMode:true});
    appIdentity = await directory(appRoot,appIdentity); guard(deadline);
  }
  async function inventory() {
    const names = await readdir(controlPath);
    if (names.length > CHECKPOINTS.length * 2 + 1) fail('checkpoint_file_inventory');
    let pendingNames = 0;
    const current = String(state.nextSequence).padStart(3,'0');
    for (const name of names) {
      if (acceptedFiles.has(name)) {
        const observed = await stableRead(path.join(controlPath,name),name.endsWith('-request.json') ? 1024 : 16384,{privateMode:true});
        if (observed.sha256 !== acceptedFiles.get(name)) fail('checkpoint_accepted_file_changed');
      } else if (name === current + '-request.json' && !state.complete) {
        // The full body is admitted below only after this inventory check.
      } else if (!state.complete && new RegExp('^\\.pending-' + current + '-[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}\\.json$').test(name)) {
        if (++pendingNames > 1) fail('checkpoint_pending_inventory');
        const stat = await lstat(path.join(controlPath,name));
        if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() || stat.nlink !== 1 || stat.size > 1024) fail('checkpoint_pending_file');
      } else fail('checkpoint_file_inventory');
    }
  }
  async function boundedHarness(operation, deadline, observed) {
    guard(deadline);
    const promise = Promise.resolve().then(operation); pending.add(promise);
    promise.then(()=>pending.delete(promise),()=>pending.delete(promise));
    let timer;
    try {
      const result = await Promise.race([promise,new Promise((_,reject)=>{
        timer = setTimeout(()=>{stopped=true;reject(new CheckpointError('checkpoint_harness_deadline'));},Math.max(1,deadline-mono()));
      })]);
      observed?.(result); guard(deadline); return result;
    } finally { clearTimeout(timer); }
  }
  async function observe(deadline) {
    await owned(deadline);
    if (failureContext) failureContext.observation++;
    let first, second;
    try {
      first = await boundedHarness(()=>bridge.evidence(),deadline,value=>remember('evidence-before',jsonBytes(value)));
      const mutable = async (filename,maximum) => {
        try { return await stableRead(filename,maximum); }
        catch (error) { if (['checkpoint_file_changed','checkpoint_file_missing'].includes(error.code)) return null; throw error; }
      };
      const journalRequired = needsReconciledJournal(state.nextSequence);
      const [phone,seed,bootstrap,operationJournal] = await Promise.all([
        mutable(draftPath,CONTROL_LIMITS.phoneBytes), stableRead(seedPath,4096,{privateMode:true}),
        stableRead(bootstrapPath,65536,{privateMode:true}),
        journalRequired ? mutable(operationJournalPath,CONTROL_LIMITS.phoneBytes) : null,
      ]);
      if (phone) remember('phone-draft',phone.bytes);
      if (operationJournal) remember('operation-journal',operationJournal.bytes);
      remember('seed-receipt',seed.bytes);
      if (bootstrap.sha256 !== bootstrapSHA256) fail('checkpoint_bootstrap_changed');
      guard(deadline); // Preserve returned bytes above; admit no new app read after the budget.
      let discovery = null;
      if (state.nextSequence >= 3) discovery = await mutable(discoveryPath,CONTROL_LIMITS.discoveryBytes);
      if (discovery) remember('discovery',discovery.bytes);
      second = await boundedHarness(()=>bridge.evidence(),deadline,value=>remember('evidence-after',jsonBytes(value)));
      if (!phone || journalRequired && !operationJournal || state.nextSequence >= 3 && !discovery || canonical(first) !== canonical(second)) return null;
      guard(deadline);
      return {proof:second,phone:decodeBoundedJSON(phone.bytes,CONTROL_LIMITS.phoneBytes),
        operationJournal:operationJournal ? decodeBoundedJSON(operationJournal.bytes,CONTROL_LIMITS.phoneBytes) : null,
        discovery:discovery ? decodeBoundedJSON(discovery.bytes,CONTROL_LIMITS.discoveryBytes) : null,
        seedReceipt:decodeBoundedJSON(seed.bytes,4096),seedReceiptSHA256:seed.sha256,sourceBound:true,
        transportClosed:transportCloseReceipt?.closed === true,
        originals:{phone,seed,discovery,operationJournal,proof:{bytes:jsonBytes(second)}}};
    } catch (error) {
      if (!stopped && error?.code === 'fixture_requests_still_running') return null;
      if (error instanceof CheckpointError) throw error;
      fail('checkpoint_harness_evidence_rejected');
    }
  }
  async function retain(prefix, request, witness, response, deadline) {
    const entries = [['request.json',request.bytes],['phone-draft.original.json',witness.originals.phone.bytes],
      ['seed-receipt.original.json',witness.originals.seed.bytes],['combined-evidence.original.json',witness.originals.proof.bytes],
      ['response.json',response]];
    if (transportCloseReceipt) entries.push(['transport-close.original.json',jsonBytes(transportCloseReceipt)]);
    if (witness.originals.discovery) entries.push(['discovery.original.json',witness.originals.discovery.bytes]);
    if (witness.originals.operationJournal) entries.push(['operation-journal.original.json',witness.originals.operationJournal.bytes]);
    const outputs = [];
    for (const [suffix,bytes] of entries) {
      guard(deadline); if (bytes.length > CONTROL_LIMITS.evidenceBytes) fail('checkpoint_retained_size');
      const name = prefix + '-' + suffix; await exclusivePrivate(path.join(output,name),bytes); guard(deadline);
      outputs.push({name,bytes:bytes.length,sha256:sha256(bytes)});
    }
    return outputs;
  }
  async function publish(prefix, bytes, deadline) {
    guard(deadline); await directory(controlPath,controlIdentity,{privateMode:true});
    const temporary = path.join(controlPath,'.reply-' + prefix + '-' + randomBytes(12).toString('hex') + '.tmp');
    const destination = path.join(controlPath,prefix + '-response.json');
    await exclusivePrivate(temporary,bytes); guard(deadline);
    // Same-directory hard-link publication is atomic and refuses an existing
    // destination. Unlike rename(), it cannot overwrite a response raced in.
    await link(temporary,destination);
    if (failureContext) failureContext.responsePublished = true;
    await unlink(temporary); guard(deadline);
    const saved = await stableRead(destination,CONTROL_LIMITS.responseBytes,{privateMode:true});
    if (saved.sha256 !== sha256(bytes)) fail('checkpoint_response_changed'); guard(deadline);
  }
  return {
    get complete(){return state.complete;},
    status(){return {schemaVersion:1,testID,completed:state.complete,stopped,nextSequence:state.nextSequence,
      checkpointCount:checkpoints.length,unsettledHarnessOperations:pending.size,failureRetention};},
    async poll() {
      if (polling) fail('checkpoint_concurrent_poll'); polling = true;
      failureContext = null;
      try {
        guard(); if (state.complete) { await owned(stopAt); await inventory(); return false; }
        const root = await exists(controlPath); if (!root) return false;
        controlIdentity ??= await directory(controlPath,null,{privateMode:true});
        await owned(stopAt); await inventory();
        const prefix = String(state.nextSequence).padStart(3,'0'), requestName = prefix + '-request.json';
        if (!await exists(path.join(controlPath,requestName))) return false;
        const requestFile = await stableRead(path.join(controlPath,requestName),CONTROL_LIMITS.requestBytes,{privateMode:true});
        failureContext = {prefix,sequence:state.nextSequence,checkpoint:CHECKPOINTS[state.nextSequence-1],
          deadline:null,observation:0,originals:new Map(),controlAttempted:false,responsePublished:false};
        remember('request',requestFile.bytes);
        const age = Date.now() - requestFile.mtimeMs;
        if (age < -50 || age >= 5000) fail('checkpoint_request_age');
        const deadline = Math.min(stopAt,mono() + CONTROL_LIMITS.requestMilliseconds,mono() + 5000 - Math.max(0,age));
        failureContext.deadline = deadline;
        const request = decodeControlRequest(requestFile.bytes,testID,state.nextSequence);
        await sourcePins(); guard(deadline);
        const board = request.checkpoint === 'closeSecondary' ? 'closed' : request.checkpoint === 'outage' ? 'unavailable' : null;
        const closeTransport = request.checkpoint === 'networkDisconnected';
        const action = board !== null || closeTransport;
        controlAttempted = false;
        for (let count = 0; count < CONTROL_LIMITS.observations; count++) {
          guard(deadline); await inventory();
          const witness = await observe(deadline);
          if (witness) {
            const result = state.inspect(request,witness,{afterControl:!action || controlAttempted});
            if (result.ready && action && !controlAttempted) {
              controlAttempted = true; // Any failure is final; never retry a control.
              failureContext.controlAttempted = true;
              if (board !== null) {
                const changed = await boundedHarness(()=>harness.setBoard(board),deadline);
                if (changed?.ok !== true || changed.board !== board) fail('checkpoint_board_control_rejected');
              } else {
                const startedAtUptimeMs = mono();
                const closed = await boundedHarness(()=>bridge.close(),deadline);
                if (closed?.closed !== true || closed.ownSocketCount !== 0) fail('checkpoint_transport_close_rejected');
                transportCloseReceipt = {schemaVersion:1,action:'close_owned_https_listener',closed:true,ownSocketCount:0,
                  startedAtUptimeMs,finishedAtUptimeMs:mono(),harnessDisposed:false};
                remember('transport-close',jsonBytes(transportCloseReceipt));
              }
              continue;
            }
            if (result.ready) {
              await sourcePins(); await owned(deadline); guard(deadline);
              const response = jsonBytes({schemaVersion:1,testID,sequence:request.sequence,checkpoint:request.checkpoint,ok:true,facts:result.facts});
              if (response.length > CONTROL_LIMITS.responseBytes) fail('checkpoint_response_size');
              const retained = await retain(prefix,requestFile,witness,response,deadline);
              guard(deadline); await inventory();
              await publish(prefix,response,deadline); result.commit();
              acceptedFiles.set(requestName,requestFile.sha256); acceptedFiles.set(prefix+'-response.json',sha256(response));
              checkpoints.push({sequence:request.sequence,checkpoint:request.checkpoint,observationCount:count+1,
                responseSHA256:sha256(response),requestAgeAtAdmissionMs:age,completedWithinHostDeadline:true,originals:retained});
              await exclusivePrivate(path.join(output,prefix+'-verification.json'),jsonBytes(checkpoints.at(-1)));
              return true;
            }
          }
          guard(deadline); await new Promise(resolve=>setTimeout(resolve,Math.min(25,Math.max(1,deadline-mono()))));
        }
        fail('checkpoint_observation_limit');
      } catch (error) {
        stopped = true;
        await retainFailure(error,mono());
        if (error instanceof CheckpointError) throw error;
        fail('checkpoint_controller_rejected');
      } finally { polling = false; }
    },
    stop(){stopped=true;},
    async settle(maximumMilliseconds = 5000){
      stopped = true;
      if (!Number.isSafeInteger(maximumMilliseconds) || maximumMilliseconds < 1 || maximumMilliseconds > 5000) fail('checkpoint_cleanup_bound');
      const until = mono() + maximumMilliseconds;
      while (polling || pending.size) {
        if (mono() >= until) fail('checkpoint_cleanup_unsettled');
        await new Promise(resolve => setTimeout(resolve,Math.min(10,Math.max(1,until-mono()))));
      }
      return {settled:true,unsettledHarnessOperations:0,polling:false};
    },
  };
}
