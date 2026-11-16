import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {Miniflare} from 'miniflare';
import {createHostedApplicationHandler,SERVICE_ORIGIN,LIMITS} from '../server/applications.mjs';
import {makeAdapter} from '../server/provider.mjs';

const passed=[];
let time=Date.now(),postCount=0,posts=[],behaviors=new Map(),postHold=null,postingVersion=new Map();
const config={version:1,connectors:[{provider:'lever',region:'global',site:'career-fixture',apiKeyEnv:'CAREER_FIXTURE_KEY',postings:{}}]};
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("isolated application test")}}',compatibilityDate:'2026-05-15',d1Databases:['DB'],r2Buckets:['BUCKET']});
let db,bucket,env,handler;
const digest=data=>createHash('sha256').update(data).digest('hex');
const checkpoint=(name)=>{passed.push(name);console.log('PASS',name)};
const owner=(id)=>({'oai-authenticated-user-id':'synthetic-'+id,'oai-authenticated-user-email':`${id}@example.com`});
const pdf=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const résumé=(bytes=pdf,name='Synthetic-CV.pdf')=>({name,mime:'application/pdf',dataBase64:bytes.toString('base64')});
const profile=(id,bytes=pdf)=>({firstName:'Single',lastName:'',email:`${id}@example.com`,phone:'',city:'Riyadh',country:'SA',headline:'Synthetic applicant',skills:['Testing'],targetRoles:[],targetCountries:['SA'],workModes:['remote'],experienceLevel:'entry',website:'',resume:résumé(bytes)});
function wrapDB(target,fail){
  const statement=(sql,args=[])=>({bind(...values){return statement(sql,values)},async first(...params){if(await fail?.(sql,args))throw Error('synthetic durable failure');return target.prepare(sql).bind(...args).first(...params)},async all(){if(await fail?.(sql,args))throw Error('synthetic durable failure');return target.prepare(sql).bind(...args).all()},async run(){if(await fail?.(sql,args))throw Error('synthetic durable failure');return target.prepare(sql).bind(...args).run()},_sql:sql,_args:args});
  return {prepare:sql=>statement(sql),batch:statements=>target.batch(statements.map(s=>target.prepare(s._sql).bind(...s._args)))};
}
async function call(path,{method='GET',body,token,user,headers={},environment=env,useHandler=handler}={}){
  const requestHeaders={...user,...headers};if(token)requestHeaders.authorization='Bearer '+token;
  if(body!==undefined){requestHeaders['content-type']='application/json';if(user)requestHeaders.origin=SERVICE_ORIGIN}
  environment.CAREER_CONNECTORS_JSON=JSON.stringify(config);
  const request=new Request(SERVICE_ORIGIN+path,{method,headers:requestHeaders,...(body===undefined?{}:{body:JSON.stringify(body)})});
  const res=await useHandler(request,environment,{waitUntil(){}});
  const data=res.headers.get('content-type')?.includes('application/json')?await res.json():new Uint8Array(await res.arrayBuffer());
  return {status:res.status,data,headers:res.headers};
}
async function account(id){const user=owner(id),code=await call('/api/account/pairing',{method:'POST',body:{},user});assert.equal(code.status,201,JSON.stringify(code.data));const session=await call('/api/apply/session',{method:'POST',body:{pairingCode:code.data.pairingCode},headers:{'cf-connecting-ip':id}});assert.equal(session.status,200,JSON.stringify(session.data));return{id,user,token:session.data.sessionToken,workspaceId:session.data.workspaceId}}
async function save(a,bytes=pdf){const result=await call('/api/apply/profile',{method:'PUT',token:a.token,body:{expectedRevision:0,profile:profile(a.id,bytes)}});assert.equal(result.status,200,JSON.stringify(result.data));return result.data.profile}
function posting(behavior='success'){
  const id=randomUUID();config.connectors[0].postings[id]={revision:'synthetic-v1',reviewedAt:new Date(time-1000).toISOString(),expiresAt:new Date(time+86400000).toISOString(),hasCustomQuestions:false,requiredFields:['name','email','resume','consentStore','consentMarketing'],privacyPolicyUrl:'https://example.com/privacy'};behaviors.set(id,behavior);return id;
}
async function addJob(a,behavior='success'){
  const id=posting(behavior),res=await call('/api/apply/jobs',{method:'POST',token:a.token,body:{url:`https://jobs.lever.co/career-fixture/${id}`}});assert.equal(res.status,201,JSON.stringify(res.data));return{id:res.data.job.id,postingId:id};
}
async function review(a,jobs){const res=await call('/api/apply/prepare',{method:'POST',token:a.token,body:{jobIds:jobs.map(j=>j.id),answers:Object.fromEntries(jobs.map(j=>[j.id,{comments:'Synthetic message',consentStore:true,consentMarketing:false}]))}});assert.equal(res.status,201,JSON.stringify(res.data));return res.data.plan}
async function approve(a,plan){return call('/api/apply/submit',{method:'POST',token:a.token,body:{planId:plan.id,digest:plan.digest,approved:true}})}
async function advance(a,plan,extra={}){time+=1100;return call('/api/apply/advance',{method:'POST',token:a.token,body:{planId:plan.id},...extra})}
async function fetchFixture(url,options={}){
  const target=new URL(url),id=target.pathname.split('/').at(-1);assert.ok(['api.lever.co','api.eu.lever.co'].includes(target.hostname));
  if(options.method!=='POST')return Response.json({id,text:'Synthetic '+id,categories:{location:'Riyadh'},country:'SA',descriptionPlain:postingVersion.get(id)??'Fixture job'});
  postCount++;const f=options.body,file=f.get('resume'),bytes=new Uint8Array(await file.arrayBuffer());posts.push({id,name:f.get('name'),email:f.get('email'),consentStore:f.get('consent[store]'),consentMarketing:f.get('consent[marketing]'),pdfSHA256:digest(bytes),pdfBytes:bytes.byteLength});
  if(postHold){const hold=postHold;postHold=null;hold.entered();await hold.release}
  const value=behaviors.get(id);
  if(value==='timeout')throw Error('synthetic ambiguous network failure');
  if(value==='429'){behaviors.set(id,'success');return Response.json({ok:false},{status:429,headers:{'Retry-After':'30'}})}
  if(value==='malformed')return new Response('not a receipt',{status:200});
  if(value==='rejected')return Response.json({ok:false},{status:422});
  return Response.json({ok:true,applicationId:'synthetic-'+id});
}

try {
  db=await mf.getD1Database('DB');const realBucket=await mf.getR2Bucket('BUCKET');bucket=new Proxy(realBucket,{get(target,key){const value=target[key];if(typeof value!=='function')return value;return async(...args)=>{try{return await value.apply(target,args)}catch(error){console.error('Isolated R2 operation failed:',String(key),error.message);throw error}}}});
  for(const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort()){
    const sql=await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8');for(const statement of sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
  }
  env={DB:db,BUCKET:bucket,CAREER_FIXTURE_KEY:'synthetic-only-not-a-real-credential'};
  handler=createHostedApplicationHandler({clock:()=>time,adapterFactory:e=>({...makeAdapter(e,{fetchImpl:fetchFixture}),mode:'test'})});
  const production=createHostedApplicationHandler();
  const status=await call('/api/apply/status',{environment:{DB:db,BUCKET:bucket},useHandler:production});
  assert.equal(status.status,200);assert.equal(status.data.liveEnabled,false);assert.equal(status.data.dispatchContinuation,'client');assert.equal(status.data.mode,'local');checkpoint('Unconfigured production service exposes no live connector or fixture switch');
  assert.equal((await call('/api/account')).status,401);assert.equal((await call('/api/apply/workspace')).status,401);
  assert.equal((await call('/api/apply/status',{headers:{origin:'https://unrelated.example'}})).status,403);
  const empty=await call('/api/account',{user:owner('empty')});assert.equal(empty.status,200);assert.equal(empty.data.workspaceId,null);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM workspaces').first()).n,0);checkpoint('Identity, origin and unauthenticated boundaries; account GET is read-only');
  const pairUser=owner('pairing'),pair=await call('/api/account/pairing',{method:'POST',body:{},user:pairUser});
  const redeemed=await Promise.all([1,2].map(i=>call('/api/apply/session',{method:'POST',headers:{'cf-connecting-ip':'pair-'+i},body:{pairingCode:pair.data.pairingCode}})));
  assert.deepEqual(redeemed.map(r=>r.status).sort(),[200,401]);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM native_sessions').first()).n,1);checkpoint('Concurrent redemption consumes exactly one code and creates one token');
  const a=await account('applicant'),large=Buffer.alloc(LIMITS.maxResumeBytes,32);pdf.copy(large);large.write('\n%%EOF\n',large.length-7);
  const saved=await save(a,large);assert.equal(saved.resume.size,LIMITS.maxResumeBytes);assert.equal(saved.resume.sha256,digest(large));assert.equal(saved.resume.objectKey,undefined);assert.equal(saved.resume.dataBase64,undefined);
  const stored=await db.prepare('SELECT * FROM resumes WHERE workspace_id=?').bind(a.workspaceId).first();assert.ok(stored.object_key.startsWith('uploads/'));assert.ok(!stored.object_key.includes(a.workspaceId));assert.ok(!stored.object_key.includes(digest(large)));assert.equal((await bucket.head(stored.object_key)).size,large.length);assert.ok((await db.prepare('SELECT length(profile_json) AS n FROM workspaces WHERE id=?').bind(a.workspaceId).first()).n<10000);checkpoint('Actual 5 MiB PDF persists in private R2 with small D1 metadata and exact hash');
  const changes=await Promise.all(['one','two'].map(headline=>call('/api/apply/profile',{method:'PUT',token:a.token,body:{expectedRevision:1,profile:{...profile(a.id),resume:undefined,headline}}})));
  assert.deepEqual(changes.map(r=>r.status).sort(),[200,409]);assert.equal((await call('/api/apply/workspace',{token:a.token})).data.profile.resume.sha256,digest(large));checkpoint('Concurrent profile saves preserve one acknowledged revision and exact previous PDF');
  const b=await account('other');await save(b);assert.equal((await call(`/api/account/resumes/${digest(large)}`,{user:b.user})).status,404);assert.equal((await call(`/api/account/resumes/${digest(large)}`,{user:a.user})).data.byteLength,large.length);checkpoint('Account PDF downloads require matching platform identity');
  const good=await addJob(a),plan=await review(a,[good]);assert.equal(plan.items[0].state,'ready');assert.equal((await advance(a,plan)).status,409);assert.equal(postCount,0);assert.equal((await call('/api/apply/workspace',{token:a.token})).data.activePlanIds.length,0);checkpoint('Unapproved reviews and GET workspace never dispatch');
  assert.equal((await approve(a,plan)).status,202);assert.equal((await call('/api/apply/stop',{method:'POST',token:a.token,body:{planId:plan.id,onlyIfUnapproved:true}})).status,409);
  const before=postCount;const result=await advance(a,plan);assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.attempts[0].state,'confirmed');assert.equal(postCount,before+1);assert.equal(posts.at(-1).pdfSHA256,digest(large));assert.equal(posts.at(-1).name,'Single');assert.equal(posts.at(-1).consentMarketing,'false');assert.equal(posts.at(-1).consentStore,'true');assert.equal(result.data.attempts[0].evidenceMode,'test');checkpoint('Exact multipart PDF, single name, explicit No, confirmed test receipt and guarded approval');
  await advance(a,plan);assert.equal(postCount,before+1);assert.equal((await review(a,[good])).items[0].state,'blocked');checkpoint('Confirmed attempts never resend and block duplicate preparations');
  const raceJob=await addJob(a),race=await review(a,[raceJob]);
  const approvals=await Promise.all([approve(a,race),call('/api/apply/stop',{method:'POST',token:a.token,body:{planId:race.id,onlyIfUnapproved:true}})]);
  assert.equal(approvals.filter(r=>r.status===409).length,1);checkpoint('Approval versus guarded Stop is atomic across concurrent requests');
  const concurrencyJob=await addJob(a),concurrentPlan=await review(a,[concurrencyJob]);await approve(a,concurrentPlan);
  let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);postHold={entered:enter,release:gate};const parallelBefore=postCount,firstAdvance=advance(a,concurrentPlan);await entered;
  assert.equal((await advance(a,concurrentPlan)).status,200);assert.equal(postCount,parallelBefore+1);
  assert.equal((await call('/api/account',{method:'DELETE',body:{confirmation:'DELETE'},user:a.user})).status,409);
  release();await firstAdvance;assert.equal(postCount,parallelBefore+1);checkpoint('Concurrent advance claims one POST; deletion refuses active provider dispatch');
  const uncertainJob=await addJob(a,'timeout'),uncertainPlan=await review(a,[uncertainJob]);await approve(a,uncertainPlan);const uncertain=await advance(a,uncertainPlan);assert.equal(uncertain.data.attempts[0].state,'uncertain');const uncertainCount=postCount;await advance(a,uncertainPlan);assert.equal(postCount,uncertainCount);assert.equal((await review(a,[uncertainJob])).items[0].state,'blocked');checkpoint('Transport uncertainty is durable and cannot be resent or re-prepared');
  const rateJob=await addJob(a,'429'),readyJob=await addJob(a),mixed=await review(a,[rateJob,readyJob]);await approve(a,mixed);
  // Select the rate-limited item first without depending on randomized attempt ordering.
  await db.prepare("UPDATE attempts SET created_at=? WHERE plan_id=? AND job_id=?").bind(new Date(time-10000).toISOString(),mixed.id,rateJob.id).run();
  const limited=await advance(a,mixed);assert.equal(limited.data.attempts.find(x=>x.jobId===rateJob.id).state,'rate_limited');
  assert.equal((await approve(a,mixed)).status,202);await advance(a,mixed);const beforeCooldown=postCount;time+=31000;
  const paused=await call('/api/apply/workspace',{token:a.token});assert.ok(!paused.data.activePlanIds.includes(mixed.id));await advance(a,mixed);assert.equal(postCount,beforeCooldown);
  assert.equal((await approve(a,mixed)).status,202);const resumed=await advance(a,mixed);assert.equal(resumed.data.attempts.find(x=>x.jobId===rateJob.id).state,'confirmed');assert.equal(postCount,beforeCooldown+1);checkpoint('Mixed ready/429 plan needs a fresh approval after cooldown, not an earlier generation');
  const persistenceJob=await addJob(a),persistencePlan=await review(a,[persistenceJob]);await approve(a,persistencePlan);let failResult=true;
  const faultDB=wrapDB(db,(sql,args)=>{if(failResult&&sql.startsWith('UPDATE attempts SET state=?')&&args[0]==='confirmed'){failResult=false;return true}return false});
  const failedResult=await advance(a,persistencePlan,{environment:{...env,DB:faultDB}});assert.equal(failedResult.status,200,JSON.stringify(failedResult.data));assert.equal(failedResult.data.attempts[0].state,'uncertain');checkpoint('Provider acceptance followed by result-write failure stays uncertain');
  const leaseJob=await addJob(a),leasePlan=await review(a,[leaseJob]);await approve(a,leasePlan);await db.prepare("UPDATE attempts SET state='dispatching',dispatch_count=1,claim_token='synthetic-lost-worker',lease_expires_at=? WHERE plan_id=?").bind(new Date(time-1000).toISOString(),leasePlan.id).run();
  const leaseCount=postCount;assert.equal((await call('/api/apply/workspace',{token:a.token})).data.attempts.find(x=>x.planId===leasePlan.id).state,'dispatching');const reclaimed=await advance(a,leasePlan);assert.equal(reclaimed.data.attempts[0].state,'uncertain');assert.equal(postCount,leaseCount);checkpoint('GET does not mutate interrupted claims; advance recovers expiry without resending');
  const exportResult=await call('/api/account/export',{user:a.user});assert.equal(exportResult.status,200);assert.equal(exportResult.data.includesPDFBytes,false);assert.ok(exportResult.data.documents.some(d=>d.sha256===digest(large)));assert.ok(!JSON.stringify(exportResult.data).includes('synthetic-only-not-a-real-credential'));checkpoint('Account export contains owned records and private PDF paths without tokens or provider secrets');

  // Real R2 conditional semantics: both write/delete orderings erase PDF bytes and all personal metadata.
  const opaque1='uploads/'+randomUUID();await bucket.put(opaque1,pdf,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/pdf',contentDisposition:'attachment; filename="PRIVATE.pdf"'},customMetadata:{private:'synthetic'}});
  await bucket.put(opaque1,new Uint8Array(0),{httpMetadata:{contentType:'application/octet-stream'},customMetadata:{purpose:'retired-upload'}});
  const emptyHead=await bucket.head(opaque1);assert.equal(emptyHead.size,0);assert.equal(emptyHead.httpMetadata.contentDisposition,undefined);assert.deepEqual(emptyHead.customMetadata,{purpose:'retired-upload'});
  const opaque2='uploads/'+randomUUID();await bucket.put(opaque2,new Uint8Array(0),{customMetadata:{purpose:'retired-upload'}});assert.equal(await bucket.put(opaque2,pdf,{onlyIf:{etagDoesNotMatch:'*'}}),null);assert.equal((await bucket.head(opaque2)).size,0);checkpoint('Real R2 tombstones fence late conditional puts in both orderings and erase metadata');
  async function stranded(a,{written=false,stale=true}={}){
    const bytes=Buffer.concat([pdf,Buffer.from(randomUUID())]),hash=digest(bytes),resumeId=a.workspaceId+':'+hash,claim=randomUUID(),key='uploads/'+randomUUID();
    await db.prepare("INSERT INTO resumes(id,workspace_id,hash,object_key,name,bytes,state,created_at,upload_claim,lease_expires_at) VALUES(?,?,?,?,?,?,'uploading',?,?,?)").bind(resumeId,a.workspaceId,hash,key,'Interrupted.pdf',bytes.length,new Date(time-90000).toISOString(),claim,new Date(time+(stale?-1000:60000)).toISOString()).run();
    await db.prepare('INSERT INTO resume_uploads(id,resume_id,workspace_id,object_key,created_at) VALUES(?,?,?,?,?)').bind(claim,resumeId,a.workspaceId,key,new Date(time-90000).toISOString()).run();
    if(written)await bucket.put(key,bytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/pdf'},customMetadata:{sha256:hash}});
    return {bytes,hash,resumeId,key,claim};
  }
  const recoverUser=await account('recovery'),lost=await stranded(recoverUser),written=await stranded(recoverUser,{written:true});
  const recovered=await call('/api/account/uploads/recover',{method:'POST',body:{},user:recoverUser.user});assert.equal(recovered.status,200,JSON.stringify(recovered.data));assert.equal(recovered.data.recovered,1);assert.equal(recovered.data.retryRequired,1);
  assert.equal((await bucket.head(lost.key)).size,0);assert.equal((await bucket.head(written.key)).size,0);const recoveredRow=await db.prepare('SELECT * FROM resumes WHERE id=?').bind(written.resumeId).first();assert.equal(recoveredRow.state,'ready');assert.notEqual(recoveredRow.object_key,written.key);assert.equal(digest(new Uint8Array(await(await bucket.get(recoveredRow.object_key)).arrayBuffer())),written.hash);checkpoint('Terminated upload before/after R2 write recovers with no original phone or PDF');
  const retry=await call('/api/apply/profile',{method:'PUT',token:recoverUser.token,body:{expectedRevision:0,profile:profile(recoverUser.id,lost.bytes)}});assert.equal(retry.status,200,JSON.stringify(retry.data));checkpoint('An expired upload reservation can be retried under a fresh durable claim');
  const deleteUser=await account('deleting'),late=await stranded(deleteUser,{stale:false});
  const erased=await call('/api/account',{method:'DELETE',body:{confirmation:'DELETE'},user:deleteUser.user});assert.equal(erased.status,200,JSON.stringify(erased.data));assert.equal(erased.data.deleted,true);assert.equal(await bucket.put(late.key,late.bytes,{onlyIf:{etagDoesNotMatch:'*'}}),null);assert.equal((await bucket.head(late.key)).size,0);assert.equal((await call('/api/apply/workspace',{token:deleteUser.token})).status,401);checkpoint('Account deletion erases pending uploads and prevents a late writer resurrecting PDF data');
  const retryDelete=await account('retrydelete');await save(retryDelete);let failTombstone=true;
  const failingBucket=new Proxy(bucket,{get(target,key){if(key==='put')return async(...args)=>{if(failTombstone&&args[1].byteLength===0){failTombstone=false;throw Error('synthetic R2 failure')}return target.put(...args)};const value=target[key];return typeof value==='function'?value.bind(target):value}});
  const failedDelete=await call('/api/account',{method:'DELETE',body:{confirmation:'DELETE'},user:retryDelete.user,environment:{...env,BUCKET:failingBucket}});assert.equal(failedDelete.status,503);assert.equal((await call('/api/apply/workspace',{token:retryDelete.token})).data.error.code,'account_deleting');assert.equal((await call('/api/account',{method:'DELETE',body:{confirmation:'DELETE'},user:retryDelete.user})).status,200);checkpoint('Failed erasure remains locked and retries without falsely reporting deletion');
  const brokenBucket=new Proxy(bucket,{get(target,key){if(key==='head')return async()=>{throw Error('synthetic binding failure')};const value=target[key];return typeof value==='function'?value.bind(target):value}});assert.equal((await call('/api/health',{environment:{...env,BUCKET:brokenBucket}})).status,503);checkpoint('Health checks verify actual R2 accessibility as well as D1');
  const sessions=await call('/api/account',{user:b.user});assert.equal((await call('/api/account/sessions/revoke',{method:'POST',body:{sessionId:sessions.data.sessions[0].id},user:b.user})).status,200);assert.equal((await call('/api/apply/workspace',{token:b.token})).status,401);checkpoint('Owner can revoke a phone; revoked credentials cannot access saved data');

  const lateUser=await account('latehandler');let enteredPut,releasePut;const putEntered=new Promise(r=>enteredPut=r),putGate=new Promise(r=>releasePut=r);let heldKey;
  const delayedBucket=new Proxy(bucket,{get(target,key){if(key==='put')return async(...args)=>{if(args[1].byteLength>0){heldKey=args[0];enteredPut();await putGate}return target.put(...args)};const value=target[key];return typeof value==='function'?value.bind(target):value}});
  const lateUpload=call('/api/apply/profile',{method:'PUT',token:lateUser.token,body:{expectedRevision:0,profile:profile(lateUser.id)},environment:{...env,BUCKET:delayedBucket}});await putEntered;
  assert.equal((await call('/api/account',{method:'DELETE',body:{confirmation:'DELETE'},user:lateUser.user})).status,200);releasePut();const lateResult=await lateUpload;assert.equal(lateResult.status,409);assert.equal((await bucket.head(heldKey)).size,0);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM resumes WHERE workspace_id=?').bind(lateUser.workspaceId).first()).n,0);checkpoint('Full profile handler cannot restore a delayed PDF or records after successful deletion');
  const recoveryRaceUser=await account('recoveryrace'),abandoned=await stranded(recoveryRaceUser);let reachRecovery,releaseRecovery;const recoveryReached=new Promise(r=>reachRecovery=r),recoveryGate=new Promise(r=>releaseRecovery=r);let pausedRecovery=false;
  const delayedRecoveryDB=wrapDB(db,async(sql)=>{if(!pausedRecovery&&sql.startsWith("UPDATE resumes SET state='failed',upload_claim=")){pausedRecovery=true;reachRecovery();await recoveryGate}return false});
  const racingRecovery=call('/api/account/uploads/recover',{method:'POST',body:{},user:recoveryRaceUser.user,environment:{...env,DB:delayedRecoveryDB}});await recoveryReached;
  const freshRetry=await call('/api/apply/profile',{method:'PUT',token:recoveryRaceUser.token,body:{expectedRevision:0,profile:profile(recoveryRaceUser.id,abandoned.bytes)}});assert.equal(freshRetry.status,200,JSON.stringify(freshRetry.data));
  const freshRow=await db.prepare('SELECT * FROM resumes WHERE id=?').bind(abandoned.resumeId).first();releaseRecovery();assert.equal((await racingRecovery).status,200);assert.equal((await bucket.head(freshRow.object_key)).size,abandoned.bytes.length);assert.equal((await db.prepare('SELECT state FROM resumes WHERE id=?').bind(abandoned.resumeId).first()).state,'ready');checkpoint('A stale recovery cannot fence the fresh claim committed by a concurrent phone retry');
  const quotaUser=await account('jobquota');const seeded=[];for(let i=0;i<LIMITS.maxJobs-1;i++)seeded.push(db.prepare('INSERT INTO jobs(id,workspace_id,job_key,data_json,created_at) VALUES(?,?,?,?,?)').bind(randomUUID(),quotaUser.workspaceId,'seeded:'+i,'{}',new Date(time).toISOString()));await db.batch(seeded);
  const quotaRace=await Promise.all(['a','b'].map(suffix=>call('/api/apply/jobs',{method:'POST',token:quotaUser.token,body:{url:`https://example.com/jobs/${suffix}`,title:'Synthetic role',company:'Fixture employer',location:'Riyadh',country:'SA'}})));assert.deepEqual(quotaRace.map(r=>r.status).sort(),[201,409]);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE workspace_id=?').bind(quotaUser.workspaceId).first()).n,LIMITS.maxJobs);checkpoint('Saved-opportunity quota remains atomic under concurrent requests');
  const fileQuota=await account('filequota');for(let i=0;i<LIMITS.maxResumes-1;i++){const hash=digest('seeded-'+i);await db.prepare("INSERT INTO resumes(id,workspace_id,hash,object_key,name,bytes,state,created_at) VALUES(?,?,?,?,?,?,'failed',?)").bind(fileQuota.workspaceId+':'+hash,fileQuota.workspaceId,hash,'uploads/'+randomUUID(),'Synthetic.pdf',10,new Date(time).toISOString()).run()}
  const uploadRace=await Promise.all(['one','two'].map(s=>call('/api/apply/profile',{method:'PUT',token:fileQuota.token,body:{expectedRevision:0,profile:profile(fileQuota.id,Buffer.concat([pdf,Buffer.from(s)]))}})));assert.deepEqual(uploadRace.map(r=>r.status).sort(),[200,409]);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM resumes WHERE workspace_id=?').bind(fileQuota.workspaceId).first()).n,LIMITS.maxResumes);checkpoint('PDF reservation quota remains atomic before concurrent R2 writes');
  const identityUser=await account('identitychange');await save(identityUser);const identityJob=await addJob(identityUser),identityPlan=await review(identityUser,[identityJob]);await approve(identityUser,identityPlan);
  const newIdentity={...identityUser.user,'oai-authenticated-user-email':'updated-identity@example.com'},identityPosts=postCount;
  assert.equal((await call('/api/account/pairing',{method:'POST',body:{},user:newIdentity})).status,201);const identityState=await call('/api/apply/workspace',{token:identityUser.token});assert.equal(identityState.data.profile.revision,2);assert.equal((await advance(identityUser,identityPlan)).status,409);assert.equal(postCount,identityPosts);assert.equal((await review(identityUser,[identityJob])).items[0].state,'blocked');
  assert.equal((await call('/api/apply/profile',{method:'PUT',token:identityUser.token,body:{expectedRevision:2,profile:{...profile(identityUser.id),email:'updated-identity@example.com',resume:undefined}}})).status,200);assert.equal((await review(identityUser,[identityJob])).items[0].state,'ready');checkpoint('Explicit pairing refreshes changed platform email and invalidates old approval until the profile is corrected');
  const currentAccounts=(await db.prepare('SELECT COUNT(*) AS n FROM workspaces').first()).n,accountSeed=[];for(let i=currentAccounts;i<LIMITS.maxAccounts-1;i++)accountSeed.push(db.prepare('INSERT INTO workspaces(id,owner_id,owner_email,created_at,profile_json) VALUES(?,?,?,?,?)').bind(randomUUID(),'seeded-account-'+i,'synthetic@example.com',new Date(time).toISOString(),'{}'));await db.batch(accountSeed);
  const accountRace=await Promise.all(['cap-a','cap-b'].map(id=>call('/api/account/pairing',{method:'POST',body:{},user:owner(id)})));assert.deepEqual(accountRace.map(r=>r.status).sort(),[201,503]);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM workspaces').first()).n,LIMITS.maxAccounts);checkpoint('Global free-service account cap is atomic rather than count-then-create');

  const files=['server/applications.mjs','server/provider.mjs','server/validation.mjs','db/schema.ts','tests/hosted-applications.mjs',...(await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort().map(f=>'drizzle/'+f)];const hashes={};for(const file of files)hashes[file]=digest(await readFile(new URL('../'+file,import.meta.url)));
  const evidence={observedAt:new Date().toISOString(),status:'passed',checks:passed.length,groups:passed,providerPosts:postCount,realEmployerRequests:0,mode:'Actual Miniflare D1 and R2 bindings; production handler and provider mapping with injected synthetic HTTP dependency.',fiveMiBPDF:true,sourceHashes:hashes,limits:'Local workerd storage and Node handler execution; production HTTPS, Sites trusted identity headers and native phone interaction require separate deployment checks.'};
  await writeFile(new URL('./hosted-verification.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({result:'PASS',groups:passed.length,syntheticProviderPosts:postCount,realEmployerRequests:0}));
} finally {await mf.dispose()}
