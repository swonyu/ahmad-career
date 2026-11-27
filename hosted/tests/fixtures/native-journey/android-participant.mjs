// Separate private Android participant. Importing this module starts no runtime.
import {open, lstat, realpath, mkdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {randomBytes} from 'node:crypto';
import {CheckpointError, CHECKPOINTS, SHA, UUID, canonical, sha256} from './control-state.mjs';
import {decodeAndroidCheckpointPacket, androidWorkspaceKey, ANDROID_SOURCE_KEYS} from './android-witness.mjs';
import {createAndroidLedgerState} from './android-ledger.mjs';
import {createAndroidDurableState} from './android-state.mjs';
import {validateAndroidRequestRelay, validateAndroidResponseRelay} from './android-relay-proof.mjs';
import {validateAndroidRestartRelay} from './android-restart-proof.mjs';

const fail = code => { throw new CheckpointError(code); };
const jsonBytes = value => Buffer.from(JSON.stringify(value,null,2)+'\n');
const same = (a,b) => canonical(a) === canonical(b);
const mono = () => performance.now();
const ownModules = ['android-participant.mjs','android-relay-proof.mjs','android-witness.mjs','android-json.mjs',
  'android-ledger.mjs','android-state.mjs','android-restart-proof.mjs','control-state.mjs','contract.mjs','data.mjs'];
const BINDING_KEYS = ['testID','workspaceID','physicalOrigin','language','nativeTokenSHA256','source','followUpDay',
  'deviceID','applicationID','appUID','appGID','bridgePort','caFingerprint256'];
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const fixedError = error => error instanceof CheckpointError ? error.code : 'android_participant_operation_failed';

async function directory(filename, expected = null) {
  const value = await lstat(filename);
  if (!value.isDirectory() || value.isSymbolicLink() || value.uid !== process.getuid() ||
      (value.mode & 0o777) !== 0o700 || await realpath(filename) !== filename)
    fail('android_participant_directory');
  const identity = {path:filename,dev:value.dev,ino:value.ino,uid:value.uid};
  if (expected && !same(identity,expected)) fail('android_participant_directory_changed');
  return identity;
}

async function stableFile(filename, maximum, privateMode = false) {
  const named = await lstat(filename);
  const shape = s => [s.dev,s.ino,s.uid,s.mode,s.nlink,s.size,s.mtimeMs,s.ctimeMs];
  if (!named.isFile() || named.isSymbolicLink() || named.uid !== process.getuid() || named.nlink !== 1 ||
      named.mode & 0o022 || privateMode && (named.mode & 0o777) !== 0o600 ||
      named.size < 1 || named.size > maximum || await realpath(filename) !== filename)
    fail('android_participant_file');
  const fd = await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const before = await fd.stat(), bytes = await fd.readFile(), after = await fd.stat(), final = await lstat(filename);
    if (![before,after,final].every(x=>same(shape(x),shape(named))) || bytes.length !== named.size)
      fail('android_participant_file_changed');
    return bytes;
  } finally { await fd.close(); }
}

async function writeExclusive(filename, bytes) {
  const fd = await open(filename,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try { await fd.writeFile(bytes); await fd.sync(); } finally { await fd.close(); }
}

export async function createAndroidCheckpointParticipant({harness,bridge,relay,binding,evidenceParent,expectedSourceFiles,stopAt}) {
  if (!harness || typeof harness.setBoard !== 'function' || !bridge ||
      typeof bridge.evidence !== 'function' || typeof bridge.close !== 'function' ||
      !relay || typeof relay.takeCheckpoint !== 'function' || typeof relay.publishResponse !== 'function' ||
      !exact(binding,BINDING_KEYS) || !exact(binding.source,ANDROID_SOURCE_KEYS) ||
      !ANDROID_SOURCE_KEYS.every(key=>SHA.test(binding.source[key] ?? '')) ||
      !UUID.test(binding.testID ?? '') || binding.testID !== binding.testID.toUpperCase() ||
      !['en','ar'].includes(binding.language) || binding.applicationID !== 'com.saleh.careerfinder.acceptance' ||
      typeof binding.deviceID !== 'string' || !/^[A-Za-z0-9_.:-]{1,160}$/.test(binding.deviceID) ||
      !Number.isSafeInteger(binding.appUID) || binding.appUID < 1 || !Number.isSafeInteger(binding.appGID) || binding.appGID < 1 ||
      !SHA.test(binding.nativeTokenSHA256 ?? '') || !path.isAbsolute(evidenceParent) ||
      !Number.isFinite(stopAt) || stopAt <= mono() || stopAt > mono()+3600000 ||
      !Array.isArray(expectedSourceFiles) || expectedSourceFiles.length < ownModules.length || expectedSourceFiles.length > 64)
    fail('android_participant_binding');
  androidWorkspaceKey(binding.physicalOrigin,binding.workspaceID);
  if (Number(new URL(binding.physicalOrigin).port) !== binding.bridgePort) fail('android_participant_origin_port');
  binding = structuredClone(binding);
  expectedSourceFiles = structuredClone(expectedSourceFiles);
  const pinPaths = new Set();
  for (const item of expectedSourceFiles) {
    if (!item || Object.keys(item).sort().join(',') !== 'path,sha256' || !path.isAbsolute(item.path) ||
        !SHA.test(item.sha256 ?? '') || pinPaths.has(item.path)) fail('android_participant_source_inventory');
    pinPaths.add(item.path);
  }
  if (!ownModules.every(name=>pinPaths.has(fileURLToPath(new URL(name,import.meta.url)))))
    fail('android_participant_required_source_missing');
  async function sourcePins() {
    for (const item of expectedSourceFiles) {
      if (sha256(await stableFile(item.path,2097152)) !== item.sha256) fail('android_participant_source_changed');
    }
  }
  await sourcePins();
  const ledger = createAndroidLedgerState({testID:binding.testID,workspaceID:binding.workspaceID,
    workerSHA256:binding.source.workerSHA256,bridgePort:binding.bridgePort,caFingerprint256:binding.caFingerprint256});
  const durable = createAndroidDurableState({binding,followUpDay:binding.followUpDay});
  const parentIdentity = await directory(evidenceParent);
  const output = path.join(evidenceParent,'android-control-'+binding.testID);
  await mkdir(output,{mode:0o700});
  const outputIdentity = await directory(output), leasePath = path.join(output,'participant-owner.private.json');
  const leaseBytes = jsonBytes({schemaVersion:1,owner:'/root/strict_test_review',testID:binding.testID,
    nonce:randomBytes(24).toString('hex'),pid:process.pid,parentIdentity,outputIdentity,binding,expectedSourceFiles});
  await writeExclusive(leasePath,leaseBytes);
  const leaseSHA = sha256(leaseBytes);
  let stopped = false, failure = null, polling = false, boundaryBusy = false, boundaryBound = false, activeContext = null;
  let directoryIdentity = null, transportClosed = false, transportCloseReceipt = null;
  let failureRetention = 'not_attempted';
  const accepted = [], pending = new Set();

  function guard(deadline = stopAt) {
    if (stopped || mono() >= Math.min(stopAt,deadline)) fail('android_participant_deadline_or_stopped');
  }
  async function owned() {
    await directory(evidenceParent,parentIdentity); await directory(output,outputIdentity);
    if (sha256(await stableFile(leasePath,32768,true)) !== leaseSHA) fail('android_participant_lease_changed');
  }
  async function retain(name, bytes, deadline, late = false) {
    if (!/^[A-Za-z0-9_.-]{1,150}$/.test(name) || !(bytes instanceof Uint8Array) || bytes.length > 8*1024*1024+65536)
      fail('android_participant_retention_bound');
    if (!late) guard(deadline);
    await owned();
    await writeExclusive(path.join(output,name),bytes);
    if (!late) guard(deadline);
    return {name,bytes:bytes.length,sha256:sha256(bytes)};
  }
  function remember(name,value) {
    if (!activeContext) return;
    const bytes = value instanceof Uint8Array ? Buffer.from(value) : jsonBytes(value);
    if (bytes.length > 8*1024*1024+65536) fail('android_participant_returned_evidence_bound');
    activeContext.returned.set(name,{bytes,returnedAtMonotonic:mono()});
  }
  async function bounded(operation, deadline, observed = null) {
    const limit = () => typeof deadline === 'function' ? deadline() : deadline;
    guard(limit());
    const promise = Promise.resolve().then(operation); pending.add(promise);
    promise.then(()=>pending.delete(promise),()=>pending.delete(promise));
    let timer;
    const timeout = new Promise((_,reject)=>{
      const check = () => {
        const remaining = Math.min(stopAt,limit())-mono();
        if (stopped || remaining <= 0) reject(new CheckpointError('android_participant_operation_deadline'));
        else timer=setTimeout(check,Math.min(25,remaining));
      };
      check();
    });
    try {
      const result = await Promise.race([promise,timeout]);
      observed?.(result); guard(limit()); return result;
    } finally { clearTimeout(timer); }
  }
  async function preserveFailure(error) {
    failure = fixedError(error); stopped = true;
    const context = activeContext;
    if (!context) return;
    failureRetention = 'attempted';
    try {
      const originals = [];
      for (const [name,value] of context.returned) {
        const result = await retain(context.prefix+'-failed-'+name,value.bytes,stopAt,true);
        originals.push({...result,returnedAtMonotonic:value.returnedAtMonotonic,
          returnedAfterDeadline:context.deadline !== null && value.returnedAtMonotonic >= context.deadline});
      }
      await retain(context.prefix+'-failure.json',jsonBytes({schemaVersion:1,testID:binding.testID,
        sequence:context.sequence,checkpoint:CHECKPOINTS[context.sequence-1],failure,
        observedAtMonotonic:context.started,deadline:context.deadline,retainedAtMonotonic:mono(),originals,
        responseAttempted:context.responseAttempted,controlAttempted:context.controlAttempted,
        noNewAppOrHarnessObservation:true,lateNeverAccepted:true}),stopAt,true);
      failureRetention = 'retained';
    } catch { failureRetention = 'retention_rejected'; }
  }
  async function evidence(deadline) {
    try {
      const first = await bounded(()=>bridge.evidence(),deadline,value=>remember('host-evidence-before.json',value));
      const second = await bounded(()=>bridge.evidence(),deadline,value=>remember('host-evidence-after.json',value));
      if (!same(first,second)) return null;
      return second;
    } catch (error) {
      if (error?.code === 'fixture_requests_still_running') return null;
      throw error;
    }
  }

  return {
    get complete() { return accepted.length === 16 && ledger.complete && durable.complete && failure === null; },
    status() { return {schemaVersion:1,platform:'android',testID:binding.testID,
      lastAcceptedSequence:accepted.length,nextSequence:ledger.nextSequence,failure,
      complete:accepted.length===16 && ledger.complete && durable.complete && failure===null,
      stopped,boundaryBound,unsettledOperations:pending.size+(polling?1:0)+(boundaryBusy?1:0),failureRetention}; },
    stop() { stopped = true; },
    async settle({milliseconds = 5000} = {}) {
      if (!Number.isSafeInteger(milliseconds) || milliseconds < 0 || milliseconds > 5000) fail('android_participant_settle_bound');
      const end = mono()+milliseconds;
      while ((pending.size||polling||boundaryBusy) && mono()<end) await new Promise(resolve=>setTimeout(resolve,Math.min(20,end-mono())));
      return {settled:pending.size===0&&!polling&&!boundaryBusy,unsettledOperations:pending.size+(polling?1:0)+(boundaryBusy?1:0),stopped,
        noNewObservation:true,harnessDisposed:false};
    },
    async bindRestartBoundary({boundaryBytes,seedHandoffBytes,restorePreActivityBytes,relayProof}) {
      if (polling || boundaryBusy || boundaryBound || ledger.nextSequence !== 15) fail('android_participant_restart_sequence');
      boundaryBusy=true;
      activeContext={sequence:15,prefix:'restart',pollStarted:mono(),started:null,deadline:null,returned:new Map(),
        responseAttempted:false,controlAttempted:false};
      try {
        guard(); await owned(); await sourcePins(); guard();
        remember('process-boundary.json',boundaryBytes);remember('first-process-complete.json',seedHandoffBytes);
        remember('restore-pre-activity.json',restorePreActivityBytes);
        const input={boundaryBytes,seedHandoffBytes,restorePreActivityBytes,relayProof};
        const verified=validateAndroidRestartRelay(input,binding,{artifactRoot:path.dirname(evidenceParent),now:mono(),
          checkpoint14CompletedAt:accepted[13].completedAtMonotonic});
        remember('relay-proof.json',verified.retainedProof);
        for(const [name,pair] of Object.entries(verified.commandOriginals))for(const stream of ['stdout','stderr'])
          remember(name+'.'+stream,pair[stream]);
        // Validate the actual fresh-process and post-stop ciphertext bodies only
        // after the corresponding raw command/file proof has been checked.
        durable.bindRestartBoundary(input); guard();
        const originals=[];
        for(const [name,value]of activeContext.returned) originals.push(await retain('restart-'+name,value.bytes,stopAt));
        await retain('restart-accepted.json',jsonBytes({schemaVersion:1,testID:binding.testID,boundarySHA256:verified.boundarySHA256,
          firstMethodRawSHA256:verified.firstMethodRawSHA256,originals,acceptedAtMonotonic:mono(),
          scope:verified.scope}),stopAt);guard();
        boundaryBound=true;activeContext=null;
        return {bound:true,boundarySHA256:verified.boundarySHA256,nextSequence:15};
      } catch(error) { await preserveFailure(error);throw new CheckpointError(failure); }
      finally { boundaryBusy=false; }
    },
    async poll() {
      if (polling || boundaryBusy) fail('android_participant_concurrent_poll');
      guard();
      if (accepted.length===16 || ledger.nextSequence===15 && !boundaryBound) return false;
      polling = true;
      const sequence = ledger.nextSequence, prefix = String(sequence).padStart(3,'0'), pollStarted = mono();
      activeContext = {sequence,prefix,pollStarted,started:null,deadline:null,returned:new Map(),
        controlAttempted:false,responseAttempted:false};
      try {
        await owned(); guard();
        const limit = () => activeContext.deadline ?? Math.min(stopAt,pollStarted+2100);
        const remainingMilliseconds = () => { guard(limit()); return limit()-mono(); };
        const packet = await bounded(()=>relay.takeCheckpoint(sequence,{
          onRequestObserved() {
            if (activeContext.started !== null) fail('android_participant_observation_repeated');
            activeContext.started = mono(); activeContext.deadline = Math.min(stopAt,activeContext.started+4500);
          },remainingMilliseconds}),limit,value=>{
            if (!value) return;
            for (const [name,bytes] of Object.entries(value.packet ?? {})) {
              if (name==='ciphertexts') { for (const [kind,data] of Object.entries(bytes)) remember(kind+'.enc',data); }
              else remember(name+'.json',bytes);
            }
            remember('request-relay-proof.json',value.relayProof);
          });
        if (packet === null) {
          if (activeContext.started !== null) fail('android_participant_observed_request_lost');
          activeContext=null; return false;
        }
        if (activeContext.started === null) fail('android_participant_observation_missing');
        const deadline = activeContext.deadline;
        const decoded = decodeAndroidCheckpointPacket(packet.packet,binding,sequence);
        const timing = () => ({pollStarted,started:activeContext.started,deadline,now:mono()});
        const identity = validateAndroidRequestRelay(packet,decoded,binding,timing());
        if (directoryIdentity && !same(identity,directoryIdentity)) fail('android_participant_guest_directory_changed');
        directoryIdentity ??= identity;
        await bounded(sourcePins,deadline); guard(deadline);
        const action = sequence===9?'closed':sequence===11?'unavailable':sequence===13?'close_listener':null;
        for (let count=0;count<128;count++) {
          guard(deadline);
          const proof = await evidence(deadline);
          if (proof) {
            const result = ledger.inspect(decoded.request,proof,{afterControl:!action||activeContext.controlAttempted,transportClosed});
            if (result.ready) {
              const local = durable.inspect(decoded,result);
              if (action && !activeContext.controlAttempted) {
                activeContext.controlAttempted = true;
                if (action==='close_listener') {
                  const started = mono();
                  const closed = await bounded(()=>bridge.close(),deadline,value=>remember('transport-close-returned.json',value));
                  if (closed?.closed !== true || closed.ownSocketCount !== 0) fail('android_participant_transport_close');
                  transportClosed = true;
                  transportCloseReceipt = {schemaVersion:1,action:'close_owned_https_listener',closed:true,ownSocketCount:0,
                    startedAtMonotonic:started,finishedAtMonotonic:mono(),harnessDisposed:false};
                } else {
                  const changed = await bounded(()=>harness.setBoard(action),deadline,value=>remember('board-control-returned.json',value));
                  if (changed?.ok !== true || changed.board !== action) fail('android_participant_board_control');
                }
                continue;
              }
              const response = jsonBytes({schemaVersion:1,testID:binding.testID,sequence,checkpoint:CHECKPOINTS[sequence-1],
                ok:true,facts:{...result.facts,...local.facts}});
              if (response.length>16384) fail('android_participant_response_size');
              const originals = [];
              for (const [name,value] of activeContext.returned) originals.push(await retain(prefix+'-'+name,value.bytes,deadline));
              if (transportCloseReceipt) originals.push(await retain(prefix+'-transport-close.json',jsonBytes(transportCloseReceipt),deadline));
              originals.push(await retain(prefix+'-response-intended.json',response,deadline));
              activeContext.responseAttempted = true;
              const published = await bounded(()=>relay.publishResponse(sequence,response,{remainingMilliseconds}),deadline,
                value=>{remember('response-readback.json',value.bytes);remember('response-relay-proof.json',value.relayProof);});
              validateAndroidResponseRelay(published,response,decoded,binding,timing()); guard(deadline);
              originals.push(await retain(prefix+'-response-relay-proof.json',jsonBytes(published.relayProof),deadline));
              const completion = {schemaVersion:1,testID:binding.testID,sequence,checkpoint:CHECKPOINTS[sequence-1],
                requestSHA256:decoded.hashes.request,observedAtMonotonic:activeContext.started,deadline,
                completedAtMonotonic:mono(),facts:{...result.facts,...local.facts},originals,
                scope:'Actual private relay/store/host observations; UI and instrumentation method acceptance are separate.'};
              await retain(prefix+'-accepted.json',jsonBytes(completion),deadline); guard(deadline);
              result.commit(); local.commit(); accepted.push(completion); activeContext=null; return true;
            }
          }
          await new Promise(resolve=>setTimeout(resolve,Math.min(10,Math.max(1,deadline-mono()))));
        }
        fail('android_participant_observation_limit');
      } catch (error) {
        await preserveFailure(error); throw new CheckpointError(failure);
      } finally { polling=false; }
    },
  };
}
