// Synthetic serialized observations for pure validator checks only.
// These are not device evidence and never seed an app, handler or runtime.
import {canonical, sha256, CHECKPOINTS} from './control-state.mjs';
import {PDF, SOURCE_ID, postingId, postingURL} from './data.mjs';
import {ANDROID_EXPECTED_COUNTS} from './android-ledger.mjs';
import {androidWorkspaceKey} from './android-witness.mjs';

export const TEST_ID = '10000000-0000-4000-8000-000000000001';
export const WORKSPACE_ID = '10000000-0000-4000-8000-000000000002';
export const JOB_ID = '10000000-0000-4000-8000-000000000003';
export const PLAN_ID = '10000000-0000-4000-8000-000000000004';
export const ATTEMPT_ID = '10000000-0000-4000-8000-000000000005';
export const FIRST_PROCESS = {pid:4100,startTicks:'812345',nonce:'20000000-0000-4000-8000-000000000001'};
export const SECOND_PROCESS = {pid:4200,startTicks:'912345',nonce:'20000000-0000-4000-8000-000000000002'};
export const BINDING = {
  testID:TEST_ID,workspaceID:WORKSPACE_ID,physicalOrigin:'https://10.0.2.2:58369',language:'en',
  nativeTokenSHA256:'1'.repeat(64),source:Object.fromEntries(['sourceManifestSHA256','appAPKsha256','testAPKsha256','workerSHA256','bootstrapSHA256']
    .map((key,i)=>[key,String(i+2).repeat(64)])),followUpDay:'2026-11-25',deviceID:'emulator-5584',
  applicationID:'com.saleh.careerfinder.acceptance',appUID:10123,appGID:10123,bridgePort:58369,
  caFingerprint256:Array(32).fill('AB').join(':'),
};
const DAY = '2026-11-22T05:00:00Z', COMPANY = 'Synthetic Native Journey Studio';
export const bytes = value => Buffer.from(JSON.stringify(value));
export const clone = value => structuredClone(value);
const ciphertext = kind => Buffer.concat([Buffer.from([1]),Buffer.from(sha256(kind),'hex')]);
const resume = name => ({name,mime:'application/pdf',size:PDF.bytes,sha256:PDF.sha256});
const profile = revision => ({firstName:revision?'Jamie':'',lastName:'',email:revision?'jamie.native@example.com':'',
  phone:'',city:'',country:'',headline:'',experienceLevel:'any',website:'',linkedin:'',draftSkills:'',draftTargetRoles:'',
  draftTargetCountries:'',skills:[],targetRoles:[],targetCountries:[],workModes:[],revision,
  draftResume:revision<2?null:resume(revision===2?'CV-A.pdf':'CV-B.pdf'),removeResume:false});
export const primary = () => ({id:JOB_ID,url:postingURL(1),title:'Service Designer',company:COMPANY,location:'Riyadh',
  country:'SA',localOnly:false,sourceName:COMPANY,checkedAt:DAY});
const secondary = () => ({id:'local-30000000-0000-4000-8000-000000000001',url:postingURL(2),title:'Senior Service Designer',
  company:COMPANY,location:'Riyadh',country:'SA',localOnly:true,sourceName:COMPANY,checkedAt:DAY});
const filters = populated => ({query:populated?'Service Designer':'',location:populated?'Riyadh':'',remoteOnly:false,sources:populated?[SOURCE_ID]:[]});
const page = () => ({ok:true,version:1,generatedAt:DAY,status:'complete',totalMatches:2,limited:false,notice:'',nextCursor:null,
  jobs:[1,2].map(n=>({id:SOURCE_ID+':'+postingId(n),sourceId:SOURCE_ID,sourceName:COMPANY,provider:'lever',
    title:n===1?'Service Designer':'Senior Service Designer',company:COMPANY,url:postingURL(n),location:'Riyadh',country:'SA',remote:false,
    summary:'Synthetic description',publishedAt:null,updatedAt:null,checkedAt:DAY,stale:false})),
  sources:[{id:SOURCE_ID,name:COMPANY,provider:'lever',boardUrl:'https://jobs.lever.co/synthetic-native-journey',status:'fresh',
    checkedAt:DAY,availableCount:2,matchedCount:2,limited:false,error:null}]});
const record = () => ({identity:'jobs.lever.co/synthetic-native-journey/'+postingId(1),job:primary(),revision:1,alternatives:[],history:[],
  appliedElsewhere:false,relatedURLs:[postingURL(1)],current:{id:'40000000-0000-4000-8000-000000000001',savedAt:DAY,source:'edited',
    record:{stage:'saved',appliedDate:'',followUpDate:BINDING.followUpDay,note:'Synthetic follow-up: review the role and my questions.',appliedElsewhere:false}}});

export function sample(sequence, {outage='unavailable'} = {}) {
  const revision=ANDROID_EXPECTED_COUNTS[sequence-1][0], expected=ANDROID_EXPECTED_COUNTS[sequence-1];
  const workspace={schema:1,profile:profile(revision),profileDirty:false,serverProfile:profile(revision),
    opportunityDraft:{url:'',title:'',company:'',location:'',country:''},recoveredOpportunityDrafts:[],
    applicationRecords:{schema:1,records:sequence>=8?[record()]:[]},recordDrafts:[],recordDraftAlternatives:[],
    jobs:sequence<3?[]:sequence<10?[primary()]:[primary(),secondary()],activePlans:[],manualApplied:[],
    selected:sequence>=6?[JOB_ID]:[],obsoleteReviews:sequence>=7?[PLAN_ID]:[],continuationHolds:[],answers:{},importedReceipts:[],
    receipts:sequence<6?[]:[{attemptId:ATTEMPT_ID,title:'Service Designer',employer:COMPANY,state:'ready',applicationId:'',createdAt:DAY,error:'',
      evidenceMode:'test',resumeSHA256:PDF.sha256,provider:'lever',planId:PLAN_ID,resumeName:'CV-A.pdf',profileRevision:2}]};
  let search=sequence<3?null:{schema:1,filters:filters(true),displayedFilters:filters(true),page:page(),
    searchHistory:{schemaVersion:1,searches:[]},newResult:{key:'pure-fixture'},lastSearchSourceIds:[SOURCE_ID]};
  if (search && sequence>=12 && outage==='partial') {
    search.page.status='partial';search.page.jobs.forEach(j=>j.stale=true);
    search.page.sources[0].status='stale';search.page.sources[0].error={message:'Synthetic outage'};
  }
  const liveDiscovery={filters:filters(sequence>=3),status:search?.page.status??null,loading:false,restoredSearch:sequence>=15,errorPresent:false,
    jobs:search?.page.jobs.map(j=>({id:j.id,sourceID:j.sourceId,url:j.url,stale:j.stale}))??[],
    sources:search?.page.sources.map(s=>({id:s.id,status:s.status,checkedAt:s.checkedAt,errorPresent:s.error!==null}))??[]};
  if(sequence>=12&&sequence<15&&outage==='unavailable') {
    liveDiscovery.status='unavailable';liveDiscovery.errorPresent=true;
    liveDiscovery.sources[0]={id:SOURCE_ID,status:'unavailable',checkedAt:null,errorPresent:true};
  }
  const key=androidWorkspaceKey(BINDING.physicalOrigin,BINDING.workspaceID), storage={}, originals={};
  for (const [kind,value] of [['connection',{}],['workspace',workspace],['search',search]]) {
    if(value===null){storage[kind]=null;continue;}
    const cipher=ciphertext(kind);originals[kind]=cipher;
    storage[kind]={recordName:kind==='connection'?kind:kind+'-'+key,bytes:cipher.length,sha256:sha256(cipher),
      evidenceFile:String(sequence).padStart(3,'0')+'-'+kind+'.enc',
      ...(kind==='connection'?{}:{value,canonicalSHA256:sha256(canonical(value))})};
  }
  const request={schemaVersion:1,testID:TEST_ID,sequence,checkpoint:CHECKPOINTS[sequence-1]};
  const process=sequence<15?FIRST_PROCESS:SECOND_PROCESS, start=sequence*10000;
  const witness={schemaVersion:1,platform:'android',testID:TEST_ID,sequence,checkpoint:request.checkpoint,language:'en',
    observation:{startedElapsedNanos:(start-10)*1000000,finishedElapsedNanos:(start-5)*1000000,wallTime:DAY,sequentialNotAtomicUIAndDisk:true},
    process:clone(process),source:clone(BINDING.source),
    scope:{origin:BINDING.physicalOrigin,workspaceID:WORKSPACE_ID,workspaceKey:key,nativeTokenSHA256:BINDING.nativeTokenSHA256},storage,
    live:{loaded:true,busy:false,storageBlocked:false,requiresPairing:false,privateScope:'workspace-'+key,profileDirty:false,
      profile:profile(revision),receiptIDs:sequence>=6?[ATTEMPT_ID]:[],activePlanIDs:[],selectedIDs:sequence>=6?[JOB_ID]:[],
      planID:sequence===6?PLAN_ID:null,recordEditorOpen:false,errorPresent:sequence===10||sequence>=14,testService:sequence<15,liveEnabled:false,
      discovery:liveDiscovery}};
  const publication={schemaVersion:1,testID:TEST_ID,sequence,checkpoint:request.checkpoint,process:clone(process),
    uiBudgetStartedElapsedMillis:start,uiBudgetStartedElapsedNanos:start*1000000,uiDeadlineElapsedMillis:start+5000,
    witnessFinishedElapsedNanos:witness.observation.finishedElapsedNanos,requestSHA256:sha256(bytes(request)),witnessSHA256:sha256(bytes(witness)),
    publicationOrder:'ciphertexts_then_witness_then_budget_marker_then_request_last'};
  const paths=['/api/apply/profile','/api/apply/jobs','/api/apply/prepare','/api/discovery/search','/api/apply/workspace','/api/discovery/sources'];
  const nativeCalls=[];
  for(let i=0;i<6;i++)for(let n=0;n<expected[i];n++)nativeCalls.push({method:i<3?(i===0?'PUT':'POST'):'GET',path:paths[i],
    status:i===1?(n===0?201:409):i===2?201:200,requestBytes:i<3?1:0,requestBodySHA256:i<3?sha256('x'):sha256(''),nativeTokenPresent:i<3||i===4});
  const controls=sequence>=11?[{board:'closed'},{board:'unavailable'}]:sequence>=9?[{board:'closed'}]:[];
  const attempt={id:ATTEMPT_ID,planId:PLAN_ID,jobId:JOB_ID,profileRevision:2,resumeName:'CV-A.pdf',resumeSHA256:PDF.sha256,
    snapshotSHA256:'a'.repeat(64),state:'ready',mode:'test',dispatchCount:0,approvalGeneration:0,dispatchedAt:null,confirmedAt:null,applicationId:null};
  const plan={id:PLAN_ID,profileRevision:2,approvalGeneration:0,approvedAt:null,lastApprovedAt:null,stopped:0};
  const proof={ok:true,schemaVersion:1,workerSHA256:BINDING.source.workerSHA256,hostOutboundCheckObserved:true,providerPostAttempts:0,
    forbiddenDispatchAttempts:0,outboundAttempts:0,unexpectedProviderTargets:0,capabilityChanges:0,
    providerGets:sequence<3?0:sequence<9?1:sequence<10?2:sequence<12?3:4,
    workspaces:[{id:WORKSPACE_ID,revision,profileSHA256:sha256('profile'+revision),resumeName:revision<2?null:revision===2?'CV-A.pdf':'CV-B.pdf',
      resumeSHA256:revision<2?null:PDF.sha256}],nativeCalls,jobs:sequence<3?[]:[{id:JOB_ID,workspace_id:WORKSPACE_ID,job_key:SOURCE_ID+':'+postingId(1)}],
    attempts:sequence<6?[]:[attempt],plans:sequence<6?[]:[plan],controls,board:['open','closed','unavailable'][controls.length],
    bridge:{host:'127.0.0.1',port:BINDING.bridgePort,caFingerprint256:BINDING.caFingerprint256,inFlight:0,apiRequests:nativeCalls.length,
      proxyRequests:0,deniedRequests:0,socketErrors:0,tlsErrors:0,documentRequests:{'CV-A.pdf':sequence>=5?1:0,'CV-B.pdf':sequence>=7?1:0},
      pdf:{sha256:PDF.sha256,bytes:PDF.bytes,names:PDF.names},events:[]}};
  return {request,witness,publication,proof,packet:{request:bytes(request),witness:bytes(witness),publication:bytes(publication),ciphertexts:originals}};
}

export function restartBodies() {
  const key=androidWorkspaceKey(BINDING.physicalOrigin,BINDING.workspaceID);
  const seed={schemaVersion:1,testID:TEST_ID,process:clone(FIRST_PROCESS),lastCheckpoint:14,expectedNextCheckpoint:15,
    beforeOnStopCiphertextsAreNotClaimedStable:true,source:clone(BINDING.source)};
  const postStopCiphertexts=Object.fromEntries(['connection','workspace','search'].map(kind=>[kind==='connection'?kind:kind+'-'+key,sha256(ciphertext(kind+'-post-stop'))]));
  const boundary={schemaVersion:1,testID:TEST_ID,seedProcess:clone(FIRST_PROCESS),forceStopIssued:true,noTargetPIDObserved:true,
    postStopCiphertexts,seedHandoffSHA256:sha256(bytes(seed))};
  const before={schemaVersion:1,testID:TEST_ID,process:clone(SECOND_PROCESS),seedProcess:clone(FIRST_PROCESS),ciphertexts:clone(postStopCiphertexts),
    boundarySHA256:sha256(bytes(boundary)),noReseed:true,activityStarted:false};
  return {seedHandoffBytes:bytes(seed),boundaryBytes:bytes(boundary),restorePreActivityBytes:bytes(before)};
}

export function repack(value) {
  for(const kind of ['workspace','search'])if(value.witness.storage[kind])
    value.witness.storage[kind].canonicalSHA256=sha256(canonical(value.witness.storage[kind].value));
  value.packet.request=bytes(value.request); value.packet.witness=bytes(value.witness);
  value.publication.requestSHA256=sha256(value.packet.request);value.publication.witnessSHA256=sha256(value.packet.witness);
  value.packet.publication=bytes(value.publication);return value;
}
