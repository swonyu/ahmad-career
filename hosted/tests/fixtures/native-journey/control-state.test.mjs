// Pure protocol/owned-temporary-file tests. No Worker, listener, auth or native runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, chmod, symlink, lstat, rm, utimes, realpath, rename} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {CHECKPOINTS, CheckpointError, sha256, decodeBoundedJSON,
  decodeControlRequest, createCheckpointState, discoveryFilename, operationJournalFilename, needsReconciledJournal} from './control-state.mjs';
import {createFileCheckpointController, readCheckpointFile} from './file-control.mjs';
import {BOARD, PDF, SOURCE_ID, postings, postingId, postingURL} from './data.mjs';

const id = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const binding = {testID:id(1).toUpperCase(),workspaceID:id(2),
  logicalOrigin:'https://career-finder-service.jazzy-drake-8323.chatgpt.site',workerSHA256:'a'.repeat(64),
  bootstrapSHA256:'b'.repeat(64),followUpDay:'2026-11-25',bridgePort:58367,
  caFingerprint256:Array(32).fill('AB').join(':')};
const request = n => ({schemaVersion:1,testID:binding.testID,sequence:n,checkpoint:CHECKPOINTS[n-1]});
const encode = v => Buffer.from(JSON.stringify(v));
const copied = v => structuredClone(v);
const counts = [[0,0,0,0,0,0],[1,0,0,0,0,0],[1,1,0,1,1,1],[1,1,0,1,1,1],
  [2,1,0,1,1,1],[2,1,1,1,1,1],[3,1,1,1,1,1],[3,1,1,1,1,1],
  [3,1,1,2,1,1],[3,2,1,2,1,2],[3,2,1,2,1,2],[3,2,1,3,1,2],
  [3,2,1,3,1,2],[3,2,1,3,1,2],[3,2,1,3,1,2],[3,2,1,3,1,2]];
function profile(guest=false) {
  return Object.fromEntries([...['firstName','lastName','email','phone','city','country','headline','skills',
    'targetRoles','targetCountries','website','linkedin','resumeName'].map(k=>[k,'']),['experienceLevel','any'],
  ...['remote','hybrid','onsite'].map(k=>[k,guest]),['resumeChanged',false],['resumeRemoved',false]]);
}
function witness(n,{beforeControl=false}={}) {
  const [puts,jobs,prepare,search,serverJobs,localJobs]=counts[n-1], cv=puts<2?null:puts===2?'CV-A.pdf':'CV-B.pdf';
  const call=(method,url,status=200)=>({method,path:url,status,requestBodySHA256:'0'.repeat(64),
    requestBytes:method==='GET'?0:16,nativeTokenPresent:url.startsWith('/api/apply/'),startedAt:'2026-11-22T00:00:00Z',finishedAt:'2026-11-22T00:00:00Z'});
  const writes=[
    ...Array.from({length:puts},()=>call('PUT','/api/apply/profile')),
    ...Array.from({length:jobs},(_,i)=>call('POST','/api/apply/jobs',i===0?201:409)),
    ...Array.from({length:prepare},()=>call('POST','/api/apply/prepare',201))];
  const nativeCalls=[call('GET','/api/apply/status'),call('GET','/api/apply/workspace'),
    ...writes.flatMap(mutation => mutation.status < 300 ? [mutation, call('GET','/api/apply/workspace')] : [mutation]),
    ...Array.from({length:search},()=>call('GET','/api/discovery/search'))];
  const controlCount=(n>=11?2:n>=9?1:0)-(beforeControl&&[9,11].includes(n)?1:0);
  const attempt={id:id(3),planId:id(4),jobId:id(5),state:'ready',mode:'test',dispatchCount:0,
    approvalGeneration:0,dispatchedAt:null,confirmedAt:null,applicationId:null,profileRevision:2,
    resumeName:'CV-A.pdf',resumeSHA256:PDF.sha256,snapshotSHA256:'c'.repeat(64)};
  const cacheEntry={id:id(3),attemptId:id(3),state:'ready',provider:'lever',mode:'test',evidenceMode:'test',
    title:'Service Designer',company:'Synthetic Native Journey Studio',profileRevision:2,resumeName:'CV-A.pdf',resumeSHA256:PDF.sha256};
  const currentProfile=profile();if(puts)Object.assign(currentProfile,{firstName:'Jamie',email:'jamie.native@example.com'});
  if(cv)Object.assign(currentProfile,{resumeName:cv,resumeSize:PDF.bytes,resumeSHA256:PDF.sha256});
  const blankDraft={scope:{origin:'',workspaceID:''},profile:profile(true),profileNeedsSync:false,jobs:[],
    opportunityDraft:{url:'',title:'',company:'',location:'',country:''}};
  const original=postings[0], checkedAt='2026-11-22T00:00:00Z';
  const primaryBackup={id:'local-'+id(7),localOnly:true,url:postingURL(1),title:original.text,company:BOARD,
    location:original.categories.location,country:original.country,provider:'lever',workMode:original.workplaceType,sourceName:BOARD,checkedAt};
  const phone={profile:currentProfile,profileRevision:puts,profileNeedsSync:false,
    workspaceID:binding.workspaceID,serviceAddress:binding.logicalOrigin,connectionEnabled:true,
    credentialAccount:'native-journey.'+binding.testID,workspaceDrafts:[blankDraft],jobs:localJobs?[
      primaryBackup,
      ...(localJobs===2?[{id:'local-secondary',url:postingURL(2),localOnly:true}]:[])]:[],
    applicationRecords:n>=8?[{id:id(6),scope:{workspaceID:binding.workspaceID,origin:binding.logicalOrigin},
      job:{url:postingURL(1)},stage:'saved',appliedElsewhere:false,archived:false,appliedOn:'',followUpOn:binding.followUpDay,
      note:'Synthetic follow-up: review the role and my questions.'}]:[],recordDrafts:[],submissionHolds:[],
    savedApplicationHistory:{schemaVersion:1,scope:{origin:binding.logicalOrigin,workspaceID:binding.workspaceID},
      credentialAccount:'native-journey.'+binding.testID,savedAt:'2026-11-22T00:00:00Z',entries:prepare?[cacheEntry]:[]}};
  const proof={ok:true,schemaVersion:1,workerSHA256:binding.workerSHA256,hostOutboundCheckObserved:true,
    workspaces:[{id:binding.workspaceID,revision:puts,profileSHA256:sha256('profile'+puts),resumeName:cv,resumeSHA256:cv?PDF.sha256:null}],
    attempts:prepare?[attempt]:[],plans:prepare?[{id:id(4),profileRevision:2,approvalGeneration:0,approvedAt:null,lastApprovedAt:null,stopped:0}]:[],
    jobs:serverJobs?[{id:id(5),workspace_id:binding.workspaceID,job_key:SOURCE_ID+':'+postingId(1)}]:[],nativeCalls,
    outboundAttempts:0,forbiddenDispatchAttempts:0,providerPostAttempts:0,unexpectedProviderTargets:0,capabilityChanges:0,
    providerGets:search+jobs,controls:['closed','unavailable'].slice(0,controlCount).map(board=>({board})),
    board:['open','closed','unavailable'][controlCount],
    bridge:{host:'127.0.0.1',port:binding.bridgePort,caFingerprint256:binding.caFingerprint256,inFlight:0,
      apiRequests:nativeCalls.length,documentRequests:{'CV-A.pdf':n>=5?1:0,'CV-B.pdf':n>=7?1:0},
      proxyRequests:0,deniedRequests:0,socketErrors:0,tlsErrors:0,pdf:{sha256:PDF.sha256,bytes:PDF.bytes,names:PDF.names},events:[]}};
  const discovery=search?{jobs:[1,2].map(i=>({sourceId:SOURCE_ID,id:SOURCE_ID+':'+postingId(i),url:postingURL(i),checkedAt})),
    page:{status:n>=12?'partial':'ok',sources:[{id:SOURCE_ID,status:n>=12?'stale':'ok',...(n>=12?{error:{code:'upstream_unavailable'}}:{})}]}}:null;
  const operationJournal=needsReconciledJournal(n) ? {version:1,origin:binding.logicalOrigin,
    workspaceId:binding.workspaceID,entries:[],intents:[]} : null;
  return {proof,phone,discovery,operationJournal,sourceBound:true,transportClosed:n>=13&&!(n===13&&beforeControl),
    seedReceipt:{schemaVersion:1,testID:binding.testID,bootstrapSHA256:binding.bootstrapSHA256,initialStateSHA256:'d'.repeat(64),onlyBlankConnection:true},
    seedReceiptSHA256:'e'.repeat(64)};
}
function advance(state,last) {for(let n=1;n<=last;n++){const r=state.inspect(request(n),witness(n));assert.equal(r.ready,true,'checkpoint '+n);r.commit();}}
const rejected=(fn,code)=>assert.throws(fn,e=>e instanceof CheckpointError&&e.code===code);

test('sixteen observations require real boundary evidence; final facts do not claim UI proof',()=>{
  const state=createCheckpointState(binding);
  for(let n=1;n<=16;n++) {
    if([9,11,13].includes(n))assert.equal(state.inspect(request(n),witness(n,{beforeControl:true}),{afterControl:false}).ready,true);
    const r=state.inspect(request(n),witness(n));assert.equal(r.ready,true);r.commit();
    assert.equal(r.facts.persistedRestartUnchanged,n>=15?true:undefined);
    assert.equal(Object.hasOwn(r.facts,'uiHistoryVisible'),false);
  }
  assert.equal(state.complete,true);assert.equal(state.nextSequence,17);
});
test('pending asynchronous saved state cannot advance or acknowledge',()=>{
  const state=createCheckpointState(binding);advance(state,1);const w=witness(1);
  assert.equal(state.inspect(request(2),w).ready,false);assert.equal(state.nextSequence,2);
});
test('source, workspace, zero-dispatch and current bridge identity are required',()=>{
  for(const [edit,code] of [[w=>w.sourceBound=false,'checkpoint_source_or_owner'],
    [w=>w.proof.workspaces[0].id=id(99),'checkpoint_source_or_owner'],
    [w=>w.proof.providerPostAttempts=1,'checkpoint_zero_dispatch'],
    [w=>w.proof.bridge.port++,'checkpoint_bridge_evidence']]) {
    const w=witness(1);edit(w);rejected(()=>createCheckpointState(binding).inspect(request(1),w),code);
  }
});
test('only the legitimate empty guest archive is admitted and it stays immutable',()=>{
  const state=createCheckpointState(binding);advance(state,1);
  const w=witness(2);w.phone.workspaceDrafts[0].profile.firstName='Hidden seeded contact';
  rejected(()=>state.inspect(request(2),w),'checkpoint_phone_scope_or_shape');
  const v=witness(1);v.phone.workspaceDrafts=[];
  rejected(()=>createCheckpointState(binding).inspect(request(1),v),'checkpoint_phone_scope_or_shape');
});
test('cancel must preserve actual disk and server profile',()=>{
  const state=createCheckpointState(binding);advance(state,3);const w=witness(4);w.phone.opportunityDraft={title:'changed'};
  rejected(()=>state.inspect(request(4),w),'checkpoint_picker_changed_state');
});
test('both named document routes must have been observed without accepting another PDF',()=>{
  const state=createCheckpointState(binding);advance(state,4);const w=witness(5);w.proof.bridge.documentRequests['CV-A.pdf']=0;
  assert.equal(state.inspect(request(5),w).ready,false);
  w.proof.bridge.pdf.sha256='0'.repeat(64);rejected(()=>state.inspect(request(5),w),'checkpoint_bridge_evidence');
});
test('reviewed A stays immutable when current CV is B, including the display cache',()=>{
  const state=createCheckpointState(binding);advance(state,6);
  const w=witness(7);w.phone.savedApplicationHistory.entries[0].resumeName='CV-B.pdf';
  rejected(()=>state.inspect(request(7),w),'checkpoint_cached_history_changed');
  const v=witness(7);v.proof.attempts[0].snapshotSHA256='f'.repeat(64);
  rejected(()=>state.inspect(request(7),v),'checkpoint_prepared_snapshot_changed');
});
test('cache carries no recovered approval or plan authority and is bound to exact credential account',()=>{
  const state=createCheckpointState(binding);advance(state,5);
  for(const edit of [w=>w.phone.savedApplicationHistory.entries[0].planId=id(4),w=>w.phone.savedApplicationHistory.credentialAccount='different']) {
    const w=witness(6);edit(w);assert.equal(state.inspect(request(6),w).ready,false);
  }
});
test('closed posting keeps the failed local bookmark and prior server job',()=>{
  const state=createCheckpointState(binding);advance(state,9);const w=witness(10);w.phone.jobs[1].localOnly=false;
  rejected(()=>state.inspect(request(10),w),'checkpoint_closed_bookmark_changed');
});
test('transport closure cannot be acknowledged early and later server/disk changes fail closed',()=>{
  const state=createCheckpointState(binding);advance(state,12);
  rejected(()=>state.inspect(request(13),witness(13,{beforeControl:true})),'checkpoint_transport_control_changed');
  const r=state.inspect(request(13),witness(13));r.commit();
  const w=witness(14);w.proof.bridge.deniedRequests=1;
  rejected(()=>state.inspect(request(14),w),'checkpoint_offline_server_changed');
  const v=witness(14);v.phone.applicationRecords[0].note='Changed';
  rejected(()=>state.inspect(request(14),v),'checkpoint_private_followup_changed');
});
test('offline reopen cannot replace the cache, profile, discovery snapshot or seed',()=>{
  const state=createCheckpointState(binding);advance(state,14);
  for(const [edit,code] of [[w=>w.phone.savedApplicationHistory.savedAt='2026-11-22T01:00:00Z','checkpoint_cached_history_changed'],
    [w=>w.phone.newUnexpectedPersistedField=true,'checkpoint_offline_disk_changed'],
    [w=>w.discovery.extra=true,'checkpoint_offline_disk_changed'],
    [w=>w.seedReceiptSHA256='f'.repeat(64),'checkpoint_seed_changed']]) {
    const w=witness(15);edit(w);rejected(()=>state.inspect(request(15),w),code);
  }
});
test('request parser rejects duplicate, oversized, deep, wrong-order and foreign-UUID inputs',()=>{
  rejected(()=>decodeBoundedJSON(Buffer.from('{"a":1,"a":2}'),1024),'checkpoint_json_duplicate_key');
  rejected(()=>decodeBoundedJSON(Buffer.alloc(1025),1024),'checkpoint_json_size');
  rejected(()=>decodeBoundedJSON(Buffer.from('['.repeat(34)+'0'+']'.repeat(34)),1024),'checkpoint_json_complexity');
  rejected(()=>decodeControlRequest(encode(request(2)),binding.testID,1),'checkpoint_request_shape_or_sequence');
  rejected(()=>decodeControlRequest(encode({...request(1),testID:id(99)}),binding.testID,1),'checkpoint_request_shape_or_sequence');
});
test('scoped discovery filename uses exact origin/NUL/workspace and never the guest path',()=>{
  assert.equal(discoveryFilename(binding.logicalOrigin,binding.workspaceID),'discovery-'+sha256(binding.logicalOrigin+'\0'+binding.workspaceID)+'.json');
  assert.notEqual(discoveryFilename(binding.logicalOrigin,binding.workspaceID),discoveryFilename(binding.logicalOrigin,id(99)));
});

async function writePhoneDraft(appRoot,current) {
  const directory=path.join(appRoot,'applications');
  await writeFile(path.join(directory,'phone-draft.json'),encode(current.phone),{mode:0o600});
  if(current.operationJournal) await writeFile(path.join(directory,operationJournalFilename(binding.logicalOrigin,binding.workspaceID)),
    encode(current.operationJournal),{mode:0o600});
}
async function temporary(t) {
  const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'career-control-unit-')));await chmod(root,0o700);
  t.after(()=>rm(root,{recursive:true,force:true}));return root;
}
test('bounded descriptor reader rejects symlinks, oversized and non-private control files',async t=>{
  const root=await temporary(t),file=path.join(root,'file'),linked=path.join(root,'linked');
  await writeFile(file,'{}',{mode:0o600});await symlink(file,linked);
  await assert.rejects(readCheckpointFile(linked,1024),{code:'checkpoint_file_shape'});
  await assert.rejects(readCheckpointFile(file,1),{code:'checkpoint_file_shape'});
  await chmod(file,0o644);await assert.rejects(readCheckpointFile(file,1024,{privateMode:true}),{code:'checkpoint_file_shape'});
});
test('owned file IPC completes all16 with each fixed control once and retains originals; no listener is initialized',async t=>{
  const root=await temporary(t);const runner=path.join(root,'runner'),app=path.join(root,'app'),evidence=path.join(root,'evidence');
  for(const p of [runner,app,evidence])await mkdir(p,{mode:0o700});
  const control=path.join(runner,'Documents','NativeJourneyControl',binding.testID);
  const appRoot=path.join(app,'Library','Application Support','CareerFinderUIAcceptance',binding.testID);
  await mkdir(control,{recursive:true,mode:0o700});await mkdir(path.join(appRoot,'applications'),{recursive:true,mode:0o700});
  const w=witness(1), bootstrap=encode({syntheticPrivateBootstrap:true});let current=w;
  const actualBinding={...binding,bootstrapSHA256:sha256(bootstrap)};w.seedReceipt.bootstrapSHA256=actualBinding.bootstrapSHA256;
  const source=path.join(root,'pinned-source.mjs');await writeFile(source,'// pinned pure fixture\n',{mode:0o600});
  for(const [name,value] of [['applications/phone-draft.json',encode(w.phone)],['native-journey-seed-receipt.json',encode(w.seedReceipt)],
    ['native-journey-bootstrap.private.json',bootstrap]])await writeFile(path.join(appRoot,name),value,{mode:0o600});
  const bound=async p=>{const s=await lstat(p);return {path:p,dev:s.dev,ino:s.ino,uid:s.uid};};
  let closeCalls=0,boardCalls=0;
  const controller=await createFileCheckpointController({...actualBinding,
    harness:{workerSHA256:binding.workerSHA256,evidence:async()=>copied(current.proof),setBoard:async board=>{
      boardCalls++;current.proof.controls.push({board});current.proof.board=board;return {ok:true,board};}},
    bridge:{privateConfiguration:{port:binding.bridgePort},caFingerprint256:binding.caFingerprint256,evidence:async()=>copied(current.proof),
      close:async()=>{closeCalls++;return {closed:true,ownSocketCount:0};}},runnerContainer:await bound(runner),appContainer:await bound(app),
    evidenceParent:evidence,expectedSourceFiles:{[source]:sha256(await readFile(source))},stopAt:performance.now()+10000});
  // The actual XCTest writes a private pending file with sorted JSON keys and moves it
  // into this runner Documents directory before waiting five seconds for the reply.
  const pending=path.join(control,'.pending-001-'+id(3).toUpperCase()+'.json');
  await writeFile(pending,JSON.stringify(request(1),Object.keys(request(1)).sort()),{mode:0o600,flag:'wx'});
  await rename(pending,path.join(control,'001-request.json'));
  const requestedAt=performance.now();
  assert.equal(await controller.poll(),true);assert.ok(performance.now()-requestedAt<5000);
  assert.equal(controller.status().controlDirectorySeen,true);
  assert.equal(controller.status().requestsObserved,1);
  assert.equal(controller.status().nextSequence,2);
  const response=JSON.parse(await readFile(path.join(control,'001-response.json'),'utf8'));
  assert.deepEqual(response.facts,{zeroDispatch:true,sourceAndOwnerBound:true,profileRevision:0,resumeName:null,resumeSHA256:null,jobCount:0,attemptCount:0});
  assert.equal((await lstat(path.join(control,'001-response.json'))).mode&0o777,0o600);
  assert.equal(closeCalls,0);assert.equal(boardCalls,0);
  assert.deepEqual(await readFile(path.join(evidence,'control-'+binding.testID,'001-phone-draft.original.json')),encode(w.phone));
  for(let n=2;n<=16;n++) {
    current=witness(n,{beforeControl:[9,11,13].includes(n)});
    await writePhoneDraft(appRoot,current);
    if(current.discovery)await writeFile(path.join(appRoot,discoveryFilename(binding.logicalOrigin,binding.workspaceID)),encode(current.discovery),{mode:0o600});
    const prefix=String(n).padStart(3,'0');await writeFile(path.join(control,prefix+'-request.json'),encode(request(n)),{mode:0o600});
    assert.equal(await controller.poll(),true,'file checkpoint '+n);
    const reply=JSON.parse(await readFile(path.join(control,prefix+'-response.json'),'utf8'));
    assert.equal(reply.sequence,n);assert.equal(reply.ok,true);
  }
  assert.equal(controller.complete,true);assert.equal(boardCalls,2);assert.equal(closeCalls,1);
  const closeReceipt=JSON.parse(await readFile(path.join(evidence,'control-'+binding.testID,'013-transport-close.original.json'),'utf8'));
  assert.equal(closeReceipt.closed,true);assert.equal(closeReceipt.ownSocketCount,0);assert.equal(closeReceipt.harnessDisposed,false);
  await writeFile(path.join(control,'017-request.json'),encode({...request(16),sequence:17}),{mode:0o600});
  await assert.rejects(controller.poll(),{code:'checkpoint_file_inventory'});
  assert.equal(controller.status().stopped,true);controller.stop();await controller.settle();
});

async function failureFixture(t,{evidenceResult,boardResult}={}) {
  const root=await temporary(t),runner=path.join(root,'runner'),app=path.join(root,'app'),evidence=path.join(root,'evidence');
  for(const p of [runner,app,evidence])await mkdir(p,{mode:0o700});
  const control=path.join(runner,'Documents','NativeJourneyControl',binding.testID);
  const appRoot=path.join(app,'Library','Application Support','CareerFinderUIAcceptance',binding.testID);
  await mkdir(control,{recursive:true,mode:0o700});await mkdir(path.join(appRoot,'applications'),{recursive:true,mode:0o700});
  const bootstrap=encode({syntheticPrivateBootstrap:'never-copy-this-bootstrap'}),actualBinding={...binding,bootstrapSHA256:sha256(bootstrap)};
  const source=path.join(root,'pinned-source.mjs');await writeFile(source,'// pure failure fixture\n',{mode:0o600});
  let current=witness(1),evidenceCalls=0,boardCalls=0,closeCalls=0;
  current.seedReceipt.bootstrapSHA256=actualBinding.bootstrapSHA256;
  await writeFile(path.join(appRoot,'native-journey-seed-receipt.json'),encode(current.seedReceipt),{mode:0o600});
  await writeFile(path.join(appRoot,'native-journey-bootstrap.private.json'),bootstrap,{mode:0o600});
  async function set(n) {
    current=witness(n,{beforeControl:[9,11,13].includes(n)});
    await writePhoneDraft(appRoot,current);
    if(current.discovery)await writeFile(path.join(appRoot,discoveryFilename(binding.logicalOrigin,binding.workspaceID)),encode(current.discovery),{mode:0o600});
    await writeFile(path.join(control,String(n).padStart(3,'0')+'-request.json'),encode(request(n)),{mode:0o600});
  }
  await set(1);
  const bound=async p=>{const s=await lstat(p);return {path:p,dev:s.dev,ino:s.ino,uid:s.uid};};
  const controller=await createFileCheckpointController({...actualBinding,
    harness:{workerSHA256:binding.workerSHA256,evidence:async()=>copied(current.proof),setBoard:async board=>{
      boardCalls++;return boardResult?boardResult(board):{ok:true,board};}},
    bridge:{privateConfiguration:{port:binding.bridgePort},caFingerprint256:binding.caFingerprint256,
      evidence:async()=>{evidenceCalls++;return evidenceResult?evidenceResult(copied(current.proof),evidenceCalls,{evidence}):copied(current.proof);},
      close:async()=>{closeCalls++;return {closed:true,ownSocketCount:0};}},
    runnerContainer:await bound(runner),appContainer:await bound(app),evidenceParent:evidence,
    expectedSourceFiles:{[source]:sha256(await readFile(source))},stopAt:performance.now()+10000});
  const output=path.join(evidence,'control-'+binding.testID);
  return {controller,control,output,appRoot,set,counters:()=>({evidenceCalls,boardCalls,closeCalls}),
    manifest:async prefix=>JSON.parse(await readFile(path.join(output,prefix+'-failure-manifest.json'),'utf8'))};
}
test('failure journal summary reads only the bound scope and exposes counts without identities',async t=>{
  const f=await failureFixture(t);f.controller.stop();await f.controller.settle();
  assert.deepEqual(await f.controller.failureJournalSummary(),
    {state:'absent',intentCount:0,profileIntentCount:0,acknowledgementCount:0});
  const journal=path.join(f.appRoot,'applications',operationJournalFilename(binding.logicalOrigin,binding.workspaceID));
  const value={version:1,origin:binding.logicalOrigin,workspaceId:binding.workspaceID,entries:[],
    intents:[{journalID:id(9),route:'profile',workspaceId:binding.workspaceID}]};
  await writeFile(journal,encode(value),{mode:0o600});
  const summary=await f.controller.failureJournalSummary();
  assert.deepEqual(summary,{state:'profile_intent_present',intentCount:1,profileIntentCount:1,acknowledgementCount:0});
  const publicBytes=JSON.stringify(summary);
  assert.equal(publicBytes.includes(binding.logicalOrigin),false);
  assert.equal(publicBytes.includes(binding.workspaceID),false);
  assert.equal(publicBytes.includes(id(9)),false);
  await writeFile(journal,encode({...value,workspaceId:id(99)}));
  assert.deepEqual(await f.controller.failureJournalSummary(),
    {state:'rejected',intentCount:null,profileIntentCount:null,acknowledgementCount:null});
  await writeFile(journal,encode(value));await chmod(journal,0o666);
  assert.equal((await f.controller.failureJournalSummary()).state,'rejected');
});
test('rejected state retains observed originals and a fixed failure receipt without a success reply',async t=>{
  const f=await failureFixture(t,{evidenceResult:proof=>({...proof,providerPostAttempts:1})});
  await assert.rejects(f.controller.poll(),{code:'checkpoint_zero_dispatch'});
  const failure=await f.manifest('001');
  assert.equal(failure.accepted,false);assert.equal(failure.failureCode,'checkpoint_zero_dispatch');
  assert.equal(failure.responsePublished,false);assert.equal(failure.controlAttempted,false);
  assert.equal(failure.originals.length,5);assert.equal(f.controller.status().nextSequence,1);
  assert.equal(f.controller.status().failureRetention,'retained');
  assert.ok(failure.retentionStartedAtUptimeMs>=failure.failedAtUptimeMs);
  for(const record of failure.originals) {
    const original=await readFile(path.join(f.output,record.name));
    assert.equal(sha256(original),record.sha256);assert.equal(original.length,record.bytes);
    assert.equal((await lstat(path.join(f.output,record.name))).mode&0o777,0o600);
    assert.equal(original.includes(Buffer.from('never-copy-this-bootstrap')),false);
    assert.equal(record.returnedAfterDeadline,false);
  }
  assert.deepEqual(f.counters(),{evidenceCalls:2,boardCalls:0,closeCalls:0});
  await assert.rejects(readFile(path.join(f.control,'001-response.json')),{code:'ENOENT'});
  await f.controller.settle();
});
test('a pending late evidence promise is not reread or added to the retained failure witness',async t=>{
  const f=await failureFixture(t,{evidenceResult:async(proof,count)=>{
    if(count===2)await new Promise(resolve=>setTimeout(resolve,650));return proof;
  }});
  const old=new Date(Date.now()-4500);await utimes(path.join(f.control,'001-request.json'),old,old);
  await assert.rejects(f.controller.poll(),{code:'checkpoint_harness_deadline'});
  const failure=await f.manifest('001');
  assert.equal(failure.accepted,false);assert.ok(failure.failedAtUptimeMs>=failure.deadlineUptimeMs);
  assert.ok(failure.originals.some(x=>x.name.endsWith('-phone-draft.original.json')));
  assert.ok(!failure.originals.some(x=>x.name.endsWith('-evidence-after.original.json')));
  assert.ok(failure.originals.every(x=>!x.returnedAfterDeadline));
  await f.controller.settle();
  assert.equal(f.counters().evidenceCalls,2);
  assert.deepEqual(await f.manifest('001'),failure);
  await assert.rejects(readFile(path.join(f.control,'001-response.json')),{code:'ENOENT'});
});
test('a synchronously returned late observation is retained as late and never accepted',async t=>{
  const f=await failureFixture(t,{evidenceResult:(proof,count)=>{
    if(count===2)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,650);return proof;
  }});
  const old=new Date(Date.now()-4500);await utimes(path.join(f.control,'001-request.json'),old,old);
  await assert.rejects(f.controller.poll(),{code:'checkpoint_deadline_or_stopped'});
  const failure=await f.manifest('001');
  const late=failure.originals.find(x=>x.name.endsWith('-evidence-after.original.json'));
  assert.ok(late);assert.equal(late.returnedAfterDeadline,true);
  assert.ok(late.observedAtUptimeMs>=failure.deadlineUptimeMs);
  assert.equal(failure.accepted,false);assert.equal(f.controller.status().nextSequence,1);
  assert.equal(f.controller.status().lastFailurePhase,'bridge_after');
  assert.ok(f.controller.status().lastFailureElapsedMs>=650);
  assert.equal(failure.responsePublished,false);assert.equal(f.counters().evidenceCalls,2);
  await assert.rejects(readFile(path.join(f.control,'001-response.json')),{code:'ENOENT'});
  await f.controller.settle();
});
test('rejected once-only control is retained without a second control call',async t=>{
  const f=await failureFixture(t,{boardResult:()=>({ok:false,board:'closed'})});
  assert.equal(await f.controller.poll(),true);
  for(let n=2;n<=8;n++){await f.set(n);assert.equal(await f.controller.poll(),true);}
  await f.set(9);await assert.rejects(f.controller.poll(),{code:'checkpoint_board_control_rejected'});
  const failure=await f.manifest('009');
  assert.equal(failure.controlAttempted,true);assert.equal(failure.responsePublished,false);
  assert.equal(failure.failureCode,'checkpoint_board_control_rejected');assert.equal(f.counters().boardCalls,1);
  await assert.rejects(f.controller.poll(),{code:'checkpoint_deadline_or_stopped'});
  assert.equal(f.counters().boardCalls,1);assert.deepEqual(await f.manifest('009'),failure);
  await assert.rejects(readFile(path.join(f.control,'009-response.json')),{code:'ENOENT'});
  await f.controller.settle();
});
test('failure evidence ownership rejection preserves the original state rejection',async t=>{
  const f=await failureFixture(t,{evidenceResult:async(proof,count,{evidence})=>{
    if(count===2)await chmod(evidence,0o755);return {...proof,providerPostAttempts:1};
  }});
  await assert.rejects(f.controller.poll(),{code:'checkpoint_zero_dispatch'});
  assert.equal(f.controller.status().failureRetention,'retention_rejected');
  await assert.rejects(readFile(path.join(f.output,'001-failure-manifest.json')),{code:'ENOENT'});
  await assert.rejects(readFile(path.join(f.control,'001-response.json')),{code:'ENOENT'});
  assert.deepEqual(f.counters(),{evidenceCalls:2,boardCalls:0,closeCalls:0});
  await f.controller.settle();
});
