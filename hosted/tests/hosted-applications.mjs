import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {createHostedApplicationHandler,SERVICE_ORIGIN,LIMITS} from '../server/applications.mjs';
import {makeAdapter} from '../server/provider.mjs';

const passed=[];
let time=Date.now(),postCount=0,posts=[],behaviors=new Map(),postHold=null,postingVersion=new Map(),getHook=null;
const config={version:1,connectors:[{provider:'lever',region:'global',site:'career-fixture',apiKeyEnv:'CAREER_FIXTURE_KEY',postings:{}}]};
// Use the SDK adapter to preserve isolated v4 fixture semantics on Miniflare5.
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("isolated application test")}}',compatibilityDate:'2026-05-15',d1Databases:['DB'],r2Buckets:['BUCKET']}));
let db,bucket,env,handler;
const digest=data=>createHash('sha256').update(data).digest('hex');
const checkpoint=(name)=>{passed.push(name);console.log('PASS',name)};
const owner=(id)=>({'oai-authenticated-user-id':'synthetic-'+id,'oai-authenticated-user-email':`${id}@example.com`});
const pdf=Buffer.from('JVBERi0xLjcKJYGBgYEKCjEgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFsgNCAwIFIgXQovQ291bnQgMQo+PgplbmRvYmoKCjIgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDEgMCBSCj4+CmVuZG9iagoKMyAwIG9iago8PAovUHJvZHVjZXIgPEZFRkYwMDcwMDA2NDAwNjYwMDJEMDA2QzAwNjkwMDYyMDAyMDAwMjgwMDY4MDA3NDAwNzQwMDcwMDA3MzAwM0EwMDJGMDAyRjAwNjcwMDY5MDA3NDAwNjgwMDc1MDA2MjAwMkUwMDYzMDA2RjAwNkQwMDJGMDA0ODAwNkYwMDcwMDA2NDAwNjkwMDZFMDA2NzAwMkYwMDcwMDA2NDAwNjYwMDJEMDA2QzAwNjkwMDYyMDAyOT4KL01vZERhdGUgKEQ6MjAyNjAxMDEwMDAwMDBaKQovQ3JlYXRvciA8RkVGRjAwNzAwMDY0MDA2NjAwMkQwMDZDMDA2OTAwNjIwMDIwMDAyODAwNjgwMDc0MDA3NDAwNzAwMDczMDAzQTAwMkYwMDJGMDA2NzAwNjkwMDc0MDA2ODAwNzUwMDYyMDAyRTAwNjMwMDZGMDA2RDAwMkYwMDQ4MDA2RjAwNzAwMDY0MDA2OTAwNkUwMDY3MDAyRjAwNzAwMDY0MDA2NjAwMkQwMDZDMDA2OTAwNjIwMDI5PgovQ3JlYXRpb25EYXRlIChEOjIwMjYwMTAxMDAwMDAwWikKPj4KZW5kb2JqCgo0IDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9QYXJlbnQgMSAwIFIKL1Jlc291cmNlcyA8PAovRm9udCA8PAovSGVsdmV0aWNhLTcwOTg0ODA3ODkgNSAwIFIKPj4KL1hPYmplY3QgPDwKPj4KL0V4dEdTdGF0ZSA8PAo+Pgo+PgovTWVkaWFCb3ggWyAwIDAgNjEyIDc5MiBdCi9Bbm5vdHMgWyBdCi9Db250ZW50cyBbIDYgMCBSIF0KPj4KZW5kb2JqCgo1IDAgb2JqCjw8Ci9UeXBlIC9Gb250Ci9TdWJ0eXBlIC9UeXBlMQovQmFzZUZvbnQgL0hlbHZldGljYQovRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZwo+PgplbmRvYmoKCjYgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL0xlbmd0aCAxMzIKPj4Kc3RyZWFtCnicJYvBCkJBCEX3foXrINIZRx2IFsFAizaBPxDxiqIWRfT9+YqL4j0cn7ANIJzzusBqN90/0/t6Oi6NuouTeUcuGGcogrEH/qmMQmg58YB1q9Z1mKhry921FpKqbEVbkpJNkw6Vf1PWmmlGaXPyvJOmY25ibf7bYNwgFjACDvAFvpcjUgplbmRzdHJlYW0KZW5kb2JqCgp4cmVmCjAgNwowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTYgMDAwMDAgbiAKMDAwMDAwMDA3NiAwMDAwMCBuIAowMDAwMDAwMTI2IDAwMDAwIG4gCjAwMDAwMDA1OTYgMDAwMDAgbiAKMDAwMDAwMDc5MSAwMDAwMCBuIAowMDAwMDAwODg5IDAwMDAwIG4gCgp0cmFpbGVyCjw8Ci9TaXplIDcKL1Jvb3QgMiAwIFIKL0luZm8gMyAwIFIKPj4KCnN0YXJ0eHJlZgoxMDk0CiUlRU9G','base64');
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
async function account(id){const user=owner(id),code=await call('/api/account/pairing',{method:'POST',body:{expectedAccountId:user['oai-authenticated-user-id']},user});assert.equal(code.status,201,JSON.stringify(code.data));const ttl=Date.parse(code.data.expiresAt)-Date.parse(code.data.serverTime);assert.ok(ttl>0&&ttl<=300000);const session=await call('/api/apply/session',{method:'POST',body:{pairingCode:code.data.pairingCode},headers:{'cf-connecting-ip':id}});assert.equal(session.status,200,JSON.stringify(session.data));return{id,user,token:session.data.sessionToken,workspaceId:session.data.workspaceId}}
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
  if(options.method!=='POST'){if(getHook){const hook=getHook;getHook=null;await hook()}return Response.json({id,text:'Synthetic '+id,categories:{location:'Riyadh'},country:'SA',descriptionPlain:postingVersion.get(id)??'Fixture job'})}
  postCount++;const f=options.body,file=f.get('resume'),bytes=new Uint8Array(await file.arrayBuffer());posts.push({id,name:f.get('name'),email:f.get('email'),consentStore:f.get('consent[store]'),consentMarketing:f.get('consent[marketing]'),pdfSHA256:digest(bytes),pdfBytes:bytes.byteLength,linkedin:f.get('urls[LinkedIn]'),portfolio:f.get('urls[Portfolio]')});
  if(postHold){const hold=postHold;postHold=null;hold.entered();await hold.release}
  const value=behaviors.get(id);
  if(value==='timeout')throw Error('synthetic ambiguous network failure');
  if(value==='429'){behaviors.set(id,'success');return Response.json({ok:false},{status:429,headers:{'Retry-After':'30'}})}
  if(value==='429-long')return Response.json({ok:false},{status:429,headers:{'Retry-After':'172800'}});
  if(value==='429-invalid')return Response.json({ok:false},{status:429,headers:{'Retry-After':'not-a-waiting-period'}});
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
  const empty=await call('/api/account',{user:owner('empty')});assert.equal(empty.status,200);assert.equal(empty.data.workspaceId,null);assert.equal(empty.data.confirmedEmail,'empty@example.com');assert.equal(empty.data.emailUpdateRequired,false);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM workspaces').first()).n,0);checkpoint('Identity, origin and unauthenticated boundaries; account GET is read-only');
  const pairUser=owner('pairing'),pair=await call('/api/account/pairing',{method:'POST',body:{expectedAccountId:pairUser['oai-authenticated-user-id']},user:pairUser});
  const redeemed=await Promise.all([1,2].map(i=>call('/api/apply/session',{method:'POST',headers:{'cf-connecting-ip':'pair-'+i},body:{pairingCode:pair.data.pairingCode}})));
  assert.deepEqual(redeemed.map(r=>r.status).sort(),[200,401]);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM native_sessions').first()).n,1);checkpoint('Concurrent redemption consumes exactly one code and creates one token');
  const a=await account('applicant'),large=Buffer.alloc(LIMITS.maxResumeBytes,32);pdf.copy(large);large.write('\n%%EOF\n',large.length-7);
  const saved=await save(a,large);assert.equal(saved.resume.size,LIMITS.maxResumeBytes);assert.equal(saved.resume.sha256,digest(large));assert.equal(saved.resume.objectKey,undefined);assert.equal(saved.resume.dataBase64,undefined);
  const stored=await db.prepare('SELECT * FROM resumes WHERE workspace_id=?').bind(a.workspaceId).first();assert.ok(stored.object_key.startsWith('uploads/'));assert.ok(!stored.object_key.includes(a.workspaceId));assert.ok(!stored.object_key.includes(digest(large)));assert.equal((await bucket.head(stored.object_key)).size,large.length);assert.ok((await db.prepare('SELECT length(profile_json) AS n FROM workspaces WHERE id=?').bind(a.workspaceId).first()).n<10000);checkpoint('Actual 5 MiB PDF persists in private R2 with small D1 metadata and exact hash');
  const changes=await Promise.all(['one','two'].map(headline=>call('/api/apply/profile',{method:'PUT',token:a.token,body:{expectedRevision:1,profile:{...profile(a.id),resume:undefined,headline}}})));
  assert.deepEqual(changes.map(r=>r.status).sort(),[200,409]);assert.equal((await call('/api/apply/workspace',{token:a.token})).data.profile.resume.sha256,digest(large));checkpoint('Concurrent profile saves preserve one acknowledged revision and exact previous PDF');
  const b=await account('other');await save(b);assert.equal((await call(`/api/account/resumes/${digest(large)}?expectedWorkspaceId=${b.workspaceId}`,{user:b.user})).status,404);assert.equal((await call(`/api/account/resumes/${digest(large)}?expectedWorkspaceId=${a.workspaceId}`,{user:a.user})).data.byteLength,large.length);checkpoint('Account PDF downloads require matching platform identity');
  const good=await addJob(a),plan=await review(a,[good]);assert.equal(plan.items[0].state,'ready');assert.equal((await advance(a,plan)).status,409);assert.equal(postCount,0);assert.equal((await call('/api/apply/workspace',{token:a.token})).data.activePlanIds.length,0);checkpoint('Unapproved reviews and GET workspace never dispatch');
  assert.equal((await approve(a,plan)).status,202);assert.equal((await call('/api/apply/stop',{method:'POST',token:a.token,body:{planId:plan.id,onlyIfUnapproved:true}})).status,409);
  const before=postCount;const result=await advance(a,plan);assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.attempts[0].state,'confirmed');assert.equal(postCount,before+1);assert.equal(posts.at(-1).pdfSHA256,digest(large));assert.equal(posts.at(-1).name,'Single');assert.equal(posts.at(-1).consentMarketing,'false');assert.equal(posts.at(-1).consentStore,'true');assert.equal(result.data.attempts[0].evidenceMode,'test');checkpoint('Exact multipart PDF, single name, explicit No, confirmed test receipt and guarded approval');
  await advance(a,plan);assert.equal(postCount,before+1);assert.equal((await review(a,[good])).items[0].state,'blocked');checkpoint('Confirmed attempts never resend and block duplicate preparations');
  const privacyOwner=await account('privacy-owner'),privacyProbe=await account('privacy-probe');await save(privacyOwner);await save(privacyProbe);
  const privateJob=await addJob(privacyOwner),probeSaved=await call('/api/apply/jobs',{method:'POST',token:privacyProbe.token,body:{url:`https://jobs.lever.co/career-fixture/${privateJob.postingId}`}});
  assert.equal(probeSaved.status,201);const probeJob={id:probeSaved.data.job.id,postingId:privateJob.postingId};
  const unverifiedEmail=await call('/api/apply/profile',{method:'PUT',token:privacyProbe.token,body:{expectedRevision:1,profile:{...profile(privacyProbe.id),email:`${privacyOwner.id}@example.com`,resume:undefined}}});
  assert.equal(unverifiedEmail.status,200);const absentPrivateApplication=await review(privacyProbe,[probeJob]);
  assert.equal(absentPrivateApplication.items[0].state,'blocked');assert.match(absentPrivateApplication.items[0].reason,/email verified by your signed-in account/);
  const privatePlan=await review(privacyOwner,[privateJob]);assert.equal((await approve(privacyOwner,privatePlan)).status,202);
  assert.equal((await advance(privacyOwner,privatePlan)).data.attempts[0].state,'confirmed');const privacyPosts=postCount;
  const existingPrivateApplication=await review(privacyProbe,[probeJob]);
  assert.deepEqual(existingPrivateApplication.items,absentPrivateApplication.items);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE workspace_id=?').bind(privacyProbe.workspaceId).first()).n,0);assert.equal(postCount,privacyPosts);
  checkpoint('An unverified profile email cannot reveal whether another workspace has a confirmed application');
  assert.equal((await call('/api/apply/profile',{method:'PUT',token:privacyOwner.token,body:{expectedRevision:1,profile:{...profile(privacyOwner.id),email:'unverified-change@example.com',resume:undefined}}})).status,200);
  const ownDuplicate=await review(privacyOwner,[privateJob]);assert.equal(ownDuplicate.items[0].state,'blocked');assert.match(ownDuplicate.items[0].reason,/already has a confirmed application/);assert.equal(postCount,privacyPosts);
  checkpoint('Same-workspace duplicate protection survives an unverified profile email change');
  const verifiedProbe={...privacyProbe.user,'oai-authenticated-user-email':`${privacyOwner.id}@example.com`};
  assert.equal((await call('/api/account/pairing',{method:'POST',body:{expectedAccountId:verifiedProbe['oai-authenticated-user-id']},user:verifiedProbe})).status,201);
  const authorizedDuplicate=await review(privacyProbe,[probeJob]);assert.equal(authorizedDuplicate.items[0].state,'blocked');assert.match(authorizedDuplicate.items[0].reason,/already has a confirmed application/);assert.equal(postCount,privacyPosts);
  checkpoint('Cross-workspace duplicate protection remains available for the verified account email');
  const raceJob=await addJob(a),race=await review(a,[raceJob]);
  const approvals=await Promise.all([approve(a,race),call('/api/apply/stop',{method:'POST',token:a.token,body:{planId:race.id,onlyIfUnapproved:true}})]);
  assert.equal(approvals.filter(r=>r.status===409).length,1);checkpoint('Approval versus guarded Stop is atomic across concurrent requests');
  const concurrencyJob=await addJob(a),concurrentPlan=await review(a,[concurrencyJob]);await approve(a,concurrentPlan);
  let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);postHold={entered:enter,release:gate};const parallelBefore=postCount,firstAdvance=advance(a,concurrentPlan);await entered;
  assert.equal((await advance(a,concurrentPlan)).status,200);assert.equal(postCount,parallelBefore+1);
  assert.equal((await call('/api/account',{method:'DELETE',body:{confirmation:'DELETE',expectedWorkspaceId:a.workspaceId},user:a.user})).status,409);
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
  const stopJobs=[await addJob(a),await addJob(a),await addJob(a)],expiredStopPlan=await review(a,stopJobs);
  const separateStopPlan=await review(a,[await addJob(a)]),foreignStopPlan=await review(b,[await addJob(b)]);
  assert.equal((await approve(a,expiredStopPlan)).status,202);
  const expiredLease=new Date(time-1000).toISOString(),liveLease=new Date(time+60000).toISOString();
  await db.prepare("UPDATE attempts SET state='dispatching',dispatch_count=1,dispatched_at=?,claim_token='synthetic-stop-expired',lease_expires_at=? WHERE plan_id=? AND job_id=?").bind(expiredLease,expiredLease,expiredStopPlan.id,stopJobs[0].id).run();
  await db.prepare("UPDATE attempts SET state='dispatching',dispatch_count=1,dispatched_at=?,claim_token='synthetic-stop-live',lease_expires_at=? WHERE plan_id=? AND job_id=?").bind(expiredLease,liveLease,expiredStopPlan.id,stopJobs[1].id).run();
  for(const other of [separateStopPlan,foreignStopPlan])await db.prepare("UPDATE attempts SET state='dispatching',dispatch_count=1,lease_expires_at=? WHERE plan_id=?").bind(expiredLease,other.id).run();
  await db.prepare('UPDATE plans SET expires_at=? WHERE id=?').bind(expiredLease,expiredStopPlan.id).run();
  const stopRows=async()=>({plans:(await db.prepare('SELECT * FROM plans WHERE id IN (?,?,?) ORDER BY id').bind(expiredStopPlan.id,separateStopPlan.id,foreignStopPlan.id).all()).results,attempts:(await db.prepare('SELECT * FROM attempts WHERE plan_id IN (?,?,?) ORDER BY id').bind(expiredStopPlan.id,separateStopPlan.id,foreignStopPlan.id).all()).results});
  const beforeExpiredStop=await stopRows(),beforeStopPosts=postCount;
  await call('/api/apply/workspace',{token:a.token});assert.deepEqual(await stopRows(),beforeExpiredStop);
  assert.equal((await advance(a,expiredStopPlan)).status,409);assert.deepEqual(await stopRows(),beforeExpiredStop);
  assert.equal((await call('/api/apply/stop',{method:'POST',token:a.token,body:{planId:expiredStopPlan.id,onlyIfUnapproved:true}})).status,409);assert.deepEqual(await stopRows(),beforeExpiredStop);
  checkpoint('Expired-plan GET and denied advance/guarded Stop leave dispatch claims unchanged');
  const atomicStopDB=wrapDB(db);
  atomicStopDB.batch=statements=>db.batch(statements.map((s,index)=>index===2?db.prepare("INSERT INTO meta(key,value) VALUES('identity_salt','synthetic-duplicate')"):db.prepare(s._sql).bind(...s._args)));
  assert.equal((await call('/api/apply/stop',{method:'POST',token:a.token,body:{planId:expiredStopPlan.id},environment:{...env,DB:atomicStopDB}})).status,503);
  assert.deepEqual(await stopRows(),beforeExpiredStop);
  checkpoint('A failed expiry-reconciliation write rolls back the plan stop and queued cancellation atomically');
  const stoppedExpired=await call('/api/apply/stop',{method:'POST',token:a.token,body:{planId:expiredStopPlan.id}});assert.equal(stoppedExpired.status,200);
  const stoppedStates=new Map(stoppedExpired.data.attempts.map(attempt=>[attempt.jobId,attempt]));
  assert.equal(stoppedStates.get(stopJobs[0].id).state,'uncertain');assert.equal(stoppedStates.get(stopJobs[0].id).error.code,'worker_interrupted');
  assert.equal(stoppedStates.get(stopJobs[1].id).state,'dispatching');assert.equal(stoppedStates.get(stopJobs[2].id).state,'cancelled');
  const afterExpiredStop=await stopRows();
  for(const row of beforeExpiredStop.attempts.filter(row=>row.plan_id!==expiredStopPlan.id||row.job_id===stopJobs[1].id))assert.deepEqual(afterExpiredStop.attempts.find(current=>current.id===row.id),row);
  assert.equal((await db.prepare("UPDATE attempts SET state='confirmed',application_id='synthetic-late' WHERE plan_id=? AND claim_token='synthetic-stop-expired' AND state='dispatching'").bind(expiredStopPlan.id).run()).meta.changes,0);
  await db.prepare('UPDATE attempts SET lease_expires_at=? WHERE plan_id=? AND job_id=?').bind(expiredLease,expiredStopPlan.id,stopJobs[1].id).run();
  const alreadyStopped=await stopRows();
  assert.equal((await call('/api/apply/stop',{method:'POST',token:a.token,body:{planId:expiredStopPlan.id,onlyIfUnapproved:true}})).status,409);assert.deepEqual(await stopRows(),alreadyStopped);
  const repeatedStop=await call('/api/apply/stop',{method:'POST',token:a.token,body:{planId:expiredStopPlan.id}});assert.equal(repeatedStop.status,200);
  assert.equal(repeatedStop.data.attempts.find(attempt=>attempt.jobId===stopJobs[1].id).state,'uncertain');assert.equal(postCount,beforeStopPosts);
  checkpoint('Explicit Stop reconciles only this stopped plan’s expired leases, preserves live and foreign claims, and never resends');
  const exportResult=await call(`/api/account/export?expectedWorkspaceId=${a.workspaceId}`,{user:a.user});assert.equal(exportResult.status,200);assert.equal(exportResult.data.includesPDFBytes,false);assert.ok(exportResult.data.documents.some(d=>d.sha256===digest(large)));assert.ok(exportResult.data.documents.every(d=>d.downloadPath.endsWith(`?expectedWorkspaceId=${a.workspaceId}`)));assert.ok(!JSON.stringify(exportResult.data).includes('synthetic-only-not-a-real-credential'));checkpoint('Account export contains owned records and workspace-bound private PDF paths without tokens or provider secrets');

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
  // A stale tab must not retarget its confirmed action when Sites signs in another account.
  const intentA=await account('intent-a'),intentB=await account('intent-b');await save(intentA);await save(intentB);
  await stranded(intentB);const intentJob=await addJob(intentB),intentPlan=await review(intentB,[intentJob]);
  await db.prepare("UPDATE attempts SET state='dispatching',dispatch_count=1,claim_token='synthetic-expired-claim',lease_expires_at=? WHERE plan_id=?").bind(new Date(time-1000).toISOString(),intentPlan.id).run();
  const intentCode=await call('/api/account/pairing',{method:'POST',body:{expectedAccountId:intentB.user['oai-authenticated-user-id']},user:intentB.user});assert.equal(intentCode.status,201);
  async function privateState(a){
    const state={workspace:await db.prepare('SELECT * FROM workspaces WHERE id=?').bind(a.workspaceId).first(),tables:{},files:[]};
    for(const table of ['native_sessions','pairing_codes','resumes','resume_uploads','jobs','plans','attempts'])state.tables[table]=(await db.prepare(`SELECT * FROM ${table} WHERE workspace_id=? ORDER BY rowid`).bind(a.workspaceId).all()).results;
    for(const upload of state.tables.resume_uploads){const file=await bucket.get(upload.object_key);state.files.push({key:upload.object_key,bytes:file?.size??null,sha256:file?digest(new Uint8Array(await file.arrayBuffer())):null})}
    return state;
  }
  const intentBefore=[await privateState(intentA),await privateState(intentB)],changedBrowser={...intentB.user,'oai-authenticated-user-email':'unaccepted-email-change@example.com'};
  for(const expectedAccountId of [intentA.user['oai-authenticated-user-id'],undefined]){
    const changed=await call('/api/account/pairing',{method:'POST',body:{expectedAccountId},user:changedBrowser});assert.equal(changed.status,409);assert.equal(changed.data.error.code,'account_changed');
  }
  const unopened=owner('intent-unopened'),wrongNewAccount=await call('/api/account/pairing',{method:'POST',body:{expectedAccountId:intentA.user['oai-authenticated-user-id']},user:unopened});
  assert.equal(wrongNewAccount.status,409);assert.equal((await call('/api/account',{user:unopened})).data.workspaceId,null);
  assert.deepEqual([await privateState(intentA),await privateState(intentB)],intentBefore);
  checkpoint('Stale or missing account intent cannot create a workspace, refresh email, or rotate another account pairing code');
  const intentSession=(await call('/api/account',{user:intentB.user})).data.sessions[0].id;
  const guardedActions=[{path:'/api/account',method:'DELETE',body:{confirmation:'DELETE'}},{path:'/api/account/sessions/revoke',method:'POST',body:{sessionId:intentSession}},{path:'/api/account/uploads/recover',method:'POST',body:{}}];
  for(const action of guardedActions)for(const expectedWorkspaceId of [intentA.workspaceId,undefined]){
    const changed=await call(action.path,{method:action.method,body:{...action.body,expectedWorkspaceId},user:intentB.user});assert.equal(changed.status,409);assert.equal(changed.data.error.code,'workspace_changed');
  }
  const noWorkspace=await call('/api/account',{method:'DELETE',body:{confirmation:'DELETE',expectedWorkspaceId:intentA.workspaceId},user:unopened});assert.equal(noWorkspace.status,409);assert.equal(noWorkspace.data.error.code,'workspace_changed');
  assert.deepEqual([await privateState(intentA),await privateState(intentB)],intentBefore);
  checkpoint('Stale workspace confirmation cannot delete, revoke, recover, or alter expired dispatch state in either account');
  let guardedFileReads=0;
  const guardedBucket=new Proxy(bucket,{get(target,key){if(key==='get')return async(...args)=>{guardedFileReads++;return target.get(...args)};const value=target[key];return typeof value==='function'?value.bind(target):value}});
  for(const path of ['/api/account/export',`/api/account/resumes/${digest(pdf)}`])for(const query of ['',`?expectedWorkspaceId=${intentA.workspaceId}`,`?expectedWorkspaceId=${intentB.workspaceId}&expectedWorkspaceId=${intentA.workspaceId}`]){
    const changed=await call(path+query,{user:intentB.user,environment:{...env,BUCKET:guardedBucket}});assert.equal(changed.status,409);assert.equal(changed.data.error.code,'workspace_changed');
  }
  assert.equal(guardedFileReads,0);assert.deepEqual([await privateState(intentA),await privateState(intentB)],intentBefore);
  const ownedExport=await call(`/api/account/export?expectedWorkspaceId=${intentB.workspaceId}`,{user:intentB.user});assert.equal(ownedExport.status,200);assert.equal(ownedExport.data.workspaceId,intentB.workspaceId);assert.ok(ownedExport.data.documents.every(d=>d.downloadPath.endsWith(`?expectedWorkspaceId=${intentB.workspaceId}`)));
  const ownedPDF=await call(`/api/account/resumes/${digest(pdf)}?expectedWorkspaceId=${intentB.workspaceId}`,{user:intentB.user});assert.equal(ownedPDF.status,200);assert.equal(digest(ownedPDF.data),digest(pdf));
  checkpoint('Stale, missing, or ambiguous download targets cannot expose another account export or read its PDF');
  const missingIdentities=[undefined,{'oai-authenticated-user-id':intentB.user['oai-authenticated-user-id']},{'oai-authenticated-user-email':intentB.user['oai-authenticated-user-email']}];
  for(const user of missingIdentities){
    assert.equal((await call('/api/account/pairing',{method:'POST',body:{expectedAccountId:intentB.user['oai-authenticated-user-id']},user,headers:{origin:SERVICE_ORIGIN}})).status,401);
    for(const action of guardedActions)assert.equal((await call(action.path,{method:action.method,body:{...action.body,expectedWorkspaceId:intentB.workspaceId},user,headers:{origin:SERVICE_ORIGIN}})).status,401);
  }
  assert.deepEqual([await privateState(intentA),await privateState(intentB)],intentBefore);
  checkpoint('Missing or incomplete platform identity fails closed even with a valid-looking action precondition');
  const intactCode=await call('/api/apply/session',{method:'POST',body:{pairingCode:intentCode.data.pairingCode},headers:{'cf-connecting-ip':'intent-intact'}});assert.equal(intactCode.status,200);
  const expiredCode=await call('/api/account/pairing',{method:'POST',body:{expectedAccountId:intentB.user['oai-authenticated-user-id']},user:intentB.user});assert.equal(expiredCode.status,201);
  await db.prepare('UPDATE pairing_codes SET expires_at=? WHERE workspace_id=?').bind(new Date(time-1000).toISOString(),intentB.workspaceId).run();
  assert.equal((await call('/api/apply/session',{method:'POST',body:{pairingCode:expiredCode.data.pairingCode},headers:{'cf-connecting-ip':'intent-expired'}})).status,401);
  await db.prepare('UPDATE native_sessions SET expires_at=? WHERE token_hash=?').bind(new Date(time-1000).toISOString(),digest(intactCode.data.sessionToken)).run();
  assert.equal((await call('/api/apply/workspace',{token:intactCode.data.sessionToken})).status,401);
  assert.equal((await call('/api/apply/prepare',{method:'POST',token:intactCode.data.sessionToken,body:{jobIds:[intentJob.id]}})).status,401);
  assert.equal((await call('/api/apply/workspace',{token:intentB.token})).status,200);
  checkpoint('The preserved code redeems normally while expired codes and phone sessions cannot regain access');
  const recoverUser=await account('recovery'),lost=await stranded(recoverUser),written=await stranded(recoverUser,{written:true});
  const recovered=await call('/api/account/uploads/recover',{method:'POST',body:{expectedWorkspaceId:recoverUser.workspaceId},user:recoverUser.user});assert.equal(recovered.status,200,JSON.stringify(recovered.data));assert.equal(recovered.data.recovered,1);assert.equal(recovered.data.retryRequired,1);
  assert.equal((await bucket.head(lost.key)).size,0);assert.equal((await bucket.head(written.key)).size,0);const recoveredRow=await db.prepare('SELECT * FROM resumes WHERE id=?').bind(written.resumeId).first();assert.equal(recoveredRow.state,'ready');assert.notEqual(recoveredRow.object_key,written.key);assert.equal(digest(new Uint8Array(await(await bucket.get(recoveredRow.object_key)).arrayBuffer())),written.hash);checkpoint('Terminated upload before/after R2 write recovers with no original phone or PDF');
  const retry=await call('/api/apply/profile',{method:'PUT',token:recoverUser.token,body:{expectedRevision:0,profile:profile(recoverUser.id,lost.bytes)}});assert.equal(retry.status,200,JSON.stringify(retry.data));checkpoint('An expired upload reservation can be retried under a fresh durable claim');
  const deleteUser=await account('deleting'),late=await stranded(deleteUser,{stale:false});
  const erased=await call('/api/account',{method:'DELETE',body:{confirmation:'DELETE',expectedWorkspaceId:deleteUser.workspaceId},user:deleteUser.user});assert.equal(erased.status,200,JSON.stringify(erased.data));assert.equal(erased.data.deleted,true);assert.equal(await bucket.put(late.key,late.bytes,{onlyIf:{etagDoesNotMatch:'*'}}),null);assert.equal((await bucket.head(late.key)).size,0);assert.equal((await call('/api/apply/workspace',{token:deleteUser.token})).status,401);checkpoint('Account deletion erases pending uploads and prevents a late writer resurrecting PDF data');
  const retryDelete=await account('retrydelete');await save(retryDelete);let failTombstone=true;
  const failingBucket=new Proxy(bucket,{get(target,key){if(key==='put')return async(...args)=>{if(failTombstone&&args[1].byteLength===0){failTombstone=false;throw Error('synthetic R2 failure')}return target.put(...args)};const value=target[key];return typeof value==='function'?value.bind(target):value}});
  const failedDelete=await call('/api/account',{method:'DELETE',body:{confirmation:'DELETE',expectedWorkspaceId:retryDelete.workspaceId},user:retryDelete.user,environment:{...env,BUCKET:failingBucket}});assert.equal(failedDelete.status,503);assert.equal((await call('/api/apply/workspace',{token:retryDelete.token})).data.error.code,'account_deleting');assert.equal((await call('/api/account',{method:'DELETE',body:{confirmation:'DELETE',expectedWorkspaceId:retryDelete.workspaceId},user:retryDelete.user})).status,200);checkpoint('Failed erasure remains locked and retries without falsely reporting deletion');
  const brokenBucket=new Proxy(bucket,{get(target,key){if(key==='head')return async()=>{throw Error('synthetic binding failure')};const value=target[key];return typeof value==='function'?value.bind(target):value}});assert.equal((await call('/api/health',{environment:{...env,BUCKET:brokenBucket}})).status,503);checkpoint('Health checks verify actual R2 accessibility as well as D1');
  const sessions=await call('/api/account',{user:b.user});assert.equal((await call('/api/account/sessions/revoke',{method:'POST',body:{sessionId:sessions.data.sessions[0].id,expectedWorkspaceId:b.workspaceId},user:b.user})).status,200);assert.equal((await call('/api/apply/workspace',{token:b.token})).status,401);checkpoint('Owner can revoke a phone; revoked credentials cannot access saved data');

  const lateUser=await account('latehandler');let enteredPut,releasePut;const putEntered=new Promise(r=>enteredPut=r),putGate=new Promise(r=>releasePut=r);let heldKey;
  const delayedBucket=new Proxy(bucket,{get(target,key){if(key==='put')return async(...args)=>{if(args[1].byteLength>0){heldKey=args[0];enteredPut();await putGate}return target.put(...args)};const value=target[key];return typeof value==='function'?value.bind(target):value}});
  const lateUpload=call('/api/apply/profile',{method:'PUT',token:lateUser.token,body:{expectedRevision:0,profile:profile(lateUser.id)},environment:{...env,BUCKET:delayedBucket}});await putEntered;
  assert.equal((await call('/api/account',{method:'DELETE',body:{confirmation:'DELETE',expectedWorkspaceId:lateUser.workspaceId},user:lateUser.user})).status,200);releasePut();const lateResult=await lateUpload;assert.equal(lateResult.status,409);assert.equal((await bucket.head(heldKey)).size,0);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM resumes WHERE workspace_id=?').bind(lateUser.workspaceId).first()).n,0);checkpoint('Full profile handler cannot restore a delayed PDF or records after successful deletion');
  const recoveryRaceUser=await account('recoveryrace'),abandoned=await stranded(recoveryRaceUser);let reachRecovery,releaseRecovery;const recoveryReached=new Promise(r=>reachRecovery=r),recoveryGate=new Promise(r=>releaseRecovery=r);let pausedRecovery=false;
  const delayedRecoveryDB=wrapDB(db,async(sql)=>{if(!pausedRecovery&&sql.startsWith("UPDATE resumes SET state='failed',upload_claim=")){pausedRecovery=true;reachRecovery();await recoveryGate}return false});
  const racingRecovery=call('/api/account/uploads/recover',{method:'POST',body:{expectedWorkspaceId:recoveryRaceUser.workspaceId},user:recoveryRaceUser.user,environment:{...env,DB:delayedRecoveryDB}});await recoveryReached;
  const freshRetry=await call('/api/apply/profile',{method:'PUT',token:recoveryRaceUser.token,body:{expectedRevision:0,profile:profile(recoveryRaceUser.id,abandoned.bytes)}});assert.equal(freshRetry.status,200,JSON.stringify(freshRetry.data));
  const freshRow=await db.prepare('SELECT * FROM resumes WHERE id=?').bind(abandoned.resumeId).first();releaseRecovery();assert.equal((await racingRecovery).status,200);assert.equal((await bucket.head(freshRow.object_key)).size,abandoned.bytes.length);assert.equal((await db.prepare('SELECT state FROM resumes WHERE id=?').bind(abandoned.resumeId).first()).state,'ready');checkpoint('A stale recovery cannot fence the fresh claim committed by a concurrent phone retry');
  const quotaUser=await account('jobquota');const seeded=[];for(let i=0;i<LIMITS.maxJobs-1;i++)seeded.push(db.prepare('INSERT INTO jobs(id,workspace_id,job_key,data_json,created_at) VALUES(?,?,?,?,?)').bind(randomUUID(),quotaUser.workspaceId,'seeded:'+i,'{}',new Date(time).toISOString()));await db.batch(seeded);
  const quotaRace=await Promise.all(['a','b'].map(suffix=>call('/api/apply/jobs',{method:'POST',token:quotaUser.token,body:{url:`https://example.com/jobs/${suffix}`,title:'Synthetic role',company:'Fixture employer',location:'Riyadh',country:'SA'}})));assert.deepEqual(quotaRace.map(r=>r.status).sort(),[201,409]);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE workspace_id=?').bind(quotaUser.workspaceId).first()).n,LIMITS.maxJobs);checkpoint('Saved-opportunity quota remains atomic under concurrent requests');
  const fileQuota=await account('filequota');for(let i=0;i<LIMITS.maxResumes-1;i++){const hash=digest('seeded-'+i);await db.prepare("INSERT INTO resumes(id,workspace_id,hash,object_key,name,bytes,state,created_at) VALUES(?,?,?,?,?,?,'failed',?)").bind(fileQuota.workspaceId+':'+hash,fileQuota.workspaceId,hash,'uploads/'+randomUUID(),'Synthetic.pdf',10,new Date(time).toISOString()).run()}
  const uploadRace=await Promise.all(['one','two'].map(s=>call('/api/apply/profile',{method:'PUT',token:fileQuota.token,body:{expectedRevision:0,profile:profile(fileQuota.id,Buffer.concat([pdf,Buffer.from(s)]))}})));assert.deepEqual(uploadRace.map(r=>r.status).sort(),[200,409]);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM resumes WHERE workspace_id=?').bind(fileQuota.workspaceId).first()).n,LIMITS.maxResumes);checkpoint('PDF reservation quota remains atomic before concurrent R2 writes');
  const identityUser=await account('identitychange');await save(identityUser);const identityJob=await addJob(identityUser),identityPlan=await review(identityUser,[identityJob]);await approve(identityUser,identityPlan);
  const newIdentity={...identityUser.user,'oai-authenticated-user-email':'updated-identity@example.com'},identityPosts=postCount;
  const beforeEmailNotice=await privateState(identityUser),emailNotice=await call('/api/account',{user:newIdentity});
  assert.equal(emailNotice.status,200);assert.equal(emailNotice.data.email,'updated-identity@example.com');assert.equal(emailNotice.data.confirmedEmail,'identitychange@example.com');assert.equal(emailNotice.data.emailUpdateRequired,true);assert.equal(emailNotice.data.profile.revision,1);
  assert.deepEqual(await privateState(identityUser),beforeEmailNotice);assert.equal(postCount,identityPosts);
  checkpoint('Account GET reports a changed platform email without rebasing data, revision, or prior approval');
  assert.equal((await call('/api/account/pairing',{method:'POST',body:{expectedAccountId:newIdentity['oai-authenticated-user-id']},user:newIdentity})).status,201);const identityState=await call('/api/apply/workspace',{token:identityUser.token});assert.equal(identityState.data.profile.revision,2);assert.equal((await advance(identityUser,identityPlan)).status,409);assert.equal(postCount,identityPosts);assert.equal((await review(identityUser,[identityJob])).items[0].state,'blocked');
  const refreshedEmail=await call('/api/account',{user:newIdentity});assert.equal(refreshedEmail.data.confirmedEmail,'updated-identity@example.com');assert.equal(refreshedEmail.data.emailUpdateRequired,false);
  assert.equal((await call('/api/apply/profile',{method:'PUT',token:identityUser.token,body:{expectedRevision:2,profile:{...profile(identityUser.id),email:'updated-identity@example.com',resume:undefined}}})).status,200);assert.equal((await review(identityUser,[identityJob])).items[0].state,'ready');checkpoint('Explicit pairing refreshes changed platform email and invalidates old approval until the profile is corrected');
  const linked=await account('linkedin'),linkedURL='https://www.linkedin.com/in/Synthetic%2BExample';
  const linkedBlank=await call('/api/apply/workspace',{token:linked.token});assert.equal(linkedBlank.data.profile.linkedin,'');assert.equal(linkedBlank.data.capabilities.linkedinProfile,true);
  const linkedSaved=await call('/api/apply/profile',{method:'PUT',token:linked.token,body:{expectedRevision:0,profile:{...profile(linked.id),website:'https://example.com/portfolio',linkedin:'https://sa.linkedin.com/in/Synthetic+Example/?trk=discard#about'}}});
  assert.equal(linkedSaved.status,200);assert.equal(linkedSaved.data.profile.linkedin,linkedURL);assert.equal(linkedSaved.data.profile.website,'https://example.com/portfolio');
  const oldPhoneSaved=await call('/api/apply/profile',{method:'PUT',token:linked.token,body:{expectedRevision:1,profile:{...profile(linked.id),website:'https://example.com/portfolio',resume:undefined}}});
  assert.equal(oldPhoneSaved.status,200);assert.equal(oldPhoneSaved.data.profile.linkedin,linkedURL);
  const badLink=await call('/api/apply/profile',{method:'PUT',token:linked.token,body:{expectedRevision:2,profile:{...profile(linked.id),resume:undefined,linkedin:'https://linkedin.com.evil.example/in/not-owned'}}});
  assert.equal(badLink.status,422);assert.equal((await call('/api/apply/workspace',{token:linked.token})).data.profile.revision,2);
  checkpoint('LinkedIn profile URLs are canonical, optional, separate from portfolio and preserved by older phone saves; invalid updates preserve data');
  const linkedJob=await addJob(linked);config.connectors[0].postings[linkedJob.postingId].requiredFields.push('urls');
  const oldReview=await review(linked,[linkedJob]);assert.equal(oldReview.items[0].state,'blocked');assert.match(oldReview.items[0].reason,/Update Career Finder/);assert.equal(oldReview.items[0].attemptId,undefined);
  const beforeLinkedPosts=postCount,linkedBody={jobIds:[linkedJob.id],answers:{[linkedJob.id]:{consentStore:true,consentMarketing:false}},reviewSchema:3};
  for(const reviewSchema of [2,'3',null])assert.equal((await call('/api/apply/prepare',{method:'POST',token:linked.token,body:{...linkedBody,reviewSchema}})).status,422);
  const linkedPrepared=await call('/api/apply/prepare',{method:'POST',token:linked.token,body:linkedBody});assert.equal(linkedPrepared.status,201);const linkedPlan=linkedPrepared.data.plan;
  assert.equal(linkedPlan.items[0].state,'ready');assert.equal(linkedPlan.items[0].payloadSummary.linkedin,linkedURL);assert.equal(linkedPlan.items[0].payloadSummary.website,'https://example.com/portfolio');assert.equal(postCount,beforeLinkedPosts);
  assert.equal((await approve(linked,linkedPlan)).status,409);assert.equal((await db.prepare('SELECT approval_generation FROM plans WHERE id=?').bind(linkedPlan.id).first()).approval_generation,0);assert.equal(postCount,beforeLinkedPosts);
  checkpoint('Older clients cannot create or approve a recovered review containing an undisplayed LinkedIn URL; preparation sends nothing');
  const linkedApproved=await call('/api/apply/submit',{method:'POST',token:linked.token,body:{planId:linkedPlan.id,digest:linkedPlan.digest,approved:true,reviewSchema:3}});assert.equal(linkedApproved.status,202);
  assert.equal((await advance(linked,linkedPlan)).data.attempts[0].state,'confirmed');assert.equal(postCount,beforeLinkedPosts+1);assert.equal(posts.at(-1).linkedin,linkedURL);assert.equal(posts.at(-1).portfolio,'https://example.com/portfolio');
  const linkedSnapshot=JSON.parse((await db.prepare('SELECT snapshot_json FROM attempts WHERE plan_id=?').bind(linkedPlan.id).first()).snapshot_json);assert.equal(linkedSnapshot.profile.linkedin,linkedURL);
  checkpoint('An explicitly approved LinkedIn profile URL is included exactly in the immutable snapshot and provider multipart payload');
  const pendingLinkedJob=await addJob(linked),pendingLinked=await call('/api/apply/prepare',{method:'POST',token:linked.token,body:{...linkedBody,jobIds:[pendingLinkedJob.id],answers:{[pendingLinkedJob.id]:{consentStore:true,consentMarketing:false}}}});assert.equal(pendingLinked.status,201);
  const clearedLink=await call('/api/apply/profile',{method:'PUT',token:linked.token,body:{expectedRevision:2,profile:{...profile(linked.id),resume:undefined,linkedin:''}}});assert.equal(clearedLink.status,200);assert.equal(clearedLink.data.profile.linkedin,'');
  assert.equal((await call('/api/apply/submit',{method:'POST',token:linked.token,body:{planId:pendingLinked.data.plan.id,digest:pendingLinked.data.plan.digest,approved:true,reviewSchema:3}})).status,409);assert.equal(postCount,beforeLinkedPosts+1);
  const manualLinked=await call('/api/apply/jobs',{method:'POST',token:linked.token,body:{url:'https://www.linkedin.com/jobs/view/123456789/',title:'Synthetic manual role',company:'Example'}});assert.equal(manualLinked.status,201);assert.equal(manualLinked.data.job.provider,'manual');assert.equal(manualLinked.data.job.submissionSupported,false);
  const manualLinkedReview=await review(linked,[{id:manualLinked.data.job.id}]);assert.equal(manualLinkedReview.items[0].state,'blocked');assert.equal(postCount,beforeLinkedPosts+1);
  checkpoint('Clearing a link invalidates prior approval; saved LinkedIn job URLs remain manual and never produce automatic-submission receipts');

  {
  const safeguarded=await account('safeguarded');await save(safeguarded);
  const originalPrivate=await privateState(safeguarded),invalidPDFs=[Buffer.from('%PDF-123'),Buffer.from('%PDF-1.4\n1 0 obj <</Type /Catalog>> endobj\ntrailer <</Root 1 0 R>>\n%%EOF')];
  for(const bytes of invalidPDFs){
    const invalid=await call('/api/apply/profile',{method:'PUT',token:safeguarded.token,body:{expectedRevision:1,profile:profile(safeguarded.id,bytes)}});
    assert.equal(invalid.status,422);assert.equal(invalid.data.error.code,'invalid_resume');assert.deepEqual(await privateState(safeguarded),originalPrivate);
  }
  checkpoint('Truncated and page-less PDFs fail a real parser before profile revision, stored bytes or records can change');
  const removalBody={expectedWorkspaceId:safeguarded.workspaceId,sha256:digest(pdf)};
  const attached=await call('/api/account',{user:safeguarded.user});assert.equal(attached.data.accountId,safeguarded.user['oai-authenticated-user-id']);assert.equal(attached.data.documents[0].removable,false);
  assert.equal((await call('/api/account/resumes/remove',{method:'POST',user:safeguarded.user,body:removalBody})).status,409);
  assert.equal((await call('/api/account/resumes/remove',{method:'POST',user:b.user,body:removalBody})).status,409);
  assert.deepEqual(await privateState(safeguarded),originalPrivate);
  checkpoint('PDF removal rejects a current profile reference or a stale/foreign workspace target without changing either account');
  const oldReview=await review(safeguarded,[await addJob(safeguarded)]),secondPDF=Buffer.concat([pdf,Buffer.from('\n% Synthetic distinct résumé version\n')]);
  const replacement=await call('/api/apply/profile',{method:'PUT',token:safeguarded.token,body:{expectedRevision:1,profile:profile(safeguarded.id,secondPDF)}});assert.equal(replacement.status,200);
  assert.equal((await call('/api/account',{user:safeguarded.user})).data.documents.find(r=>r.sha256===digest(pdf)).removable,true);
  const beforeRemovalAttempts=(await db.prepare('SELECT * FROM attempts WHERE workspace_id=? ORDER BY id').bind(safeguarded.workspaceId).all()).results;
  const removed=await call('/api/account/resumes/remove',{method:'POST',user:safeguarded.user,body:removalBody});assert.equal(removed.status,200);assert.equal(removed.data.removed,true);
  assert.equal((await call('/api/account',{user:safeguarded.user})).data.usage.storedResumes,1);
  assert.deepEqual((await db.prepare('SELECT * FROM attempts WHERE workspace_id=? ORDER BY id').bind(safeguarded.workspaceId).all()).results,beforeRemovalAttempts);
  assert.equal((await approve(safeguarded,oldReview)).status,409);
  assert.equal((await call('/api/account/resumes/'+digest(pdf)+'?expectedWorkspaceId='+safeguarded.workspaceId,{user:safeguarded.user})).status,404);
  assert.equal((await call('/api/account/resumes/remove',{method:'POST',user:safeguarded.user,body:removalBody})).status,200);
  checkpoint('Unused PDF erasure releases its quota, preserves historical fingerprints, fences files and remains idempotent');
  const reinstate=await call('/api/apply/profile',{method:'PUT',token:safeguarded.token,body:{expectedRevision:2,profile:profile(safeguarded.id,pdf)}});assert.equal(reinstate.status,200);
  const another=await call('/api/apply/profile',{method:'PUT',token:safeguarded.token,body:{expectedRevision:3,profile:profile(safeguarded.id,secondPDF)}});assert.equal(another.status,200);
  let racedRemoval=false;
  const removeBeforeAttach=wrapDB(db,async(sql)=>{if(!racedRemoval&&sql.startsWith('UPDATE workspaces SET profile_json=')){racedRemoval=true;assert.equal((await call('/api/account/resumes/remove',{method:'POST',user:safeguarded.user,body:removalBody})).status,200)}return false});
  const raced=await call('/api/apply/profile',{method:'PUT',token:safeguarded.token,body:{expectedRevision:4,profile:profile(safeguarded.id,pdf)},environment:{...env,DB:removeBeforeAttach}});
  assert.equal(raced.status,409);assert.equal((await call('/api/apply/workspace',{token:safeguarded.token})).data.profile.resume.sha256,digest(secondPDF));
  checkpoint('A concurrent profile save cannot reattach a PDF retired after its upload lookup');
  const expiry=await account('requirements-expiry');await save(expiry);
  const expiringJob=await addJob(expiry);config.connectors[0].postings[expiringJob.postingId].expiresAt=new Date(time+2000).toISOString();
  const expiringPlan=await review(expiry,[expiringJob]);await approve(expiry,expiringPlan);const beforeExpiry=postCount;
  getHook=()=>{time+=1500};const expiredDuringRead=await advance(expiry,expiringPlan);
  assert.equal(expiredDuringRead.data.attempts[0].state,'blocked');assert.equal(expiredDuringRead.data.attempts[0].error.code,'requirements_changed');assert.equal(postCount,beforeExpiry);
  checkpoint('Employer requirements expiring during posting/PDF preflight produce no application POST');
  const claimExpiryJob=await addJob(expiry);config.connectors[0].postings[claimExpiryJob.postingId].expiresAt=new Date(time+2000).toISOString();
  const claimExpiryPlan=await review(expiry,[claimExpiryJob]);await approve(expiry,claimExpiryPlan);let delayedClaim=false;
  const delayedDB=wrapDB(db,(sql)=>{if(!delayedClaim&&sql.startsWith("UPDATE attempts SET state='dispatching'")){delayedClaim=true;time+=1500}return false});
  const expiredDuringClaim=await advance(expiry,claimExpiryPlan,{environment:{...env,DB:delayedDB}});
  assert.equal(expiredDuringClaim.data.attempts[0].state,'blocked');assert.equal(expiredDuringClaim.data.attempts[0].dispatchCount,0);assert.equal(expiredDuringClaim.data.attempts[0].dispatchedAt,null);assert.equal(postCount,beforeExpiry);
  checkpoint('Requirements expiry while persisting the dispatch claim is rechecked before POST without inventing a dispatch');
  const rate=await account('extended-cooldown');await save(rate);
  const longJob=await addJob(rate,'429-long'),longPlan=await review(rate,[longJob]);await approve(rate,longPlan);const rateBefore=time;const longResult=await advance(rate,longPlan);
  assert.equal(longResult.data.attempts[0].state,'rate_limited');assert.ok(Date.parse(longResult.data.attempts[0].retryAt)-rateBefore>=172800000);
  await call('/api/apply/stop',{method:'POST',token:rate.token,body:{planId:longPlan.id}});assert.equal((await review(rate,[longJob])).items[0].state,'blocked');
  const unknownJob=await addJob(rate,'429-invalid'),unknownPlan=await review(rate,[unknownJob]);await approve(rate,unknownPlan);const unknown=await advance(rate,unknownPlan);const unknownPosts=postCount;
  assert.equal(unknown.data.attempts[0].state,'rate_limited');assert.equal(unknown.data.attempts[0].retryAt,undefined);assert.equal(unknown.data.attempts[0].error.code,'provider_cooldown_unknown');
  await call('/api/apply/stop',{method:'POST',token:rate.token,body:{planId:unknownPlan.id}});assert.equal((await review(rate,[unknownJob])).items[0].state,'blocked');assert.equal(postCount,unknownPosts);
  checkpoint('Two-day provider cooldowns are not shortened and an unreadable cooldown stays blocked after Stop');
  const configured=await account('broken-connector');await save(configured);
  const badConfiguration={...env,CAREER_CONNECTORS_JSON:'{broken configuration'};
  async function badConfig(path,method='GET',body){const result=await handler(new Request(SERVICE_ORIGIN+path,{method,headers:{...configured.user,...(body?{origin:SERVICE_ORIGIN,'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),badConfiguration);return{status:result.status,data:await result.json()}}
  assert.equal((await badConfig('/api/account')).status,200);
  assert.equal((await badConfig('/api/account/export?expectedWorkspaceId='+configured.workspaceId)).status,200);
  assert.equal((await badConfig('/api/apply/status')).data.liveEnabled,false);
  const phoneSession=(await call('/api/account',{user:configured.user})).data.sessions[0].id;
  assert.equal((await badConfig('/api/account/sessions/revoke','POST',{expectedWorkspaceId:configured.workspaceId,sessionId:phoneSession})).status,200);
  assert.equal((await badConfig('/api/account','DELETE',{expectedWorkspaceId:configured.workspaceId,confirmation:'DELETE'})).status,200);
  checkpoint('Invalid employer configuration disables submission while account access, export, revocation and erasure remain usable');

  const legacy=await account('legacy-pdf');await save(legacy);const legacyJob=await addJob(legacy),legacyResume=await db.prepare('SELECT * FROM resumes WHERE workspace_id=?').bind(legacy.workspaceId).first();
  await bucket.put(legacyResume.object_key,new Uint8Array(pdf.length));
  const legacyPrepared=await review(legacy,[legacyJob]);assert.equal(legacyPrepared.items[0].state,'blocked');assert.match(legacyPrepared.items[0].reason,/exact saved résumé could not be opened/);assert.equal(legacyPrepared.items[0].attemptId,undefined);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE workspace_id=?').bind(legacy.workspaceId).first()).n,0);
  checkpoint('A legacy missing or damaged stored PDF is caught during review before an approval or dispatch record exists');

  const cleanup=await account('pdf-cleanup-retry');await save(cleanup);const cleanupJob=await addJob(cleanup),cleanupPlan=await review(cleanup,[cleanupJob]);await approve(cleanup,cleanupPlan);
  let enterCleanup,releaseCleanup;const cleanupEntered=new Promise(resolve=>enterCleanup=resolve),cleanupGate=new Promise(resolve=>releaseCleanup=resolve);postHold={entered:enterCleanup,release:cleanupGate};
  const cleanupSending=advance(cleanup,cleanupPlan);await cleanupEntered;
  const cleanupNext=await call('/api/apply/profile',{method:'PUT',token:cleanup.token,body:{expectedRevision:1,profile:profile(cleanup.id,secondPDF)}});assert.equal(cleanupNext.status,200);
  const cleanupRemoval={expectedWorkspaceId:cleanup.workspaceId,sha256:digest(pdf)};
  assert.equal((await call('/api/account/resumes/remove',{method:'POST',user:cleanup.user,body:cleanupRemoval})).status,409);
  releaseCleanup();assert.equal((await cleanupSending).data.attempts[0].state,'confirmed');
  let failedRetirement=false;
  const brokenErasure=new Proxy(bucket,{get(target,key){if(key==='put')return async(...args)=>{if(args[1].byteLength===0&&!failedRetirement){failedRetirement=true;throw Error('Synthetic erasure unavailable')}return target.put(...args)};const value=target[key];return typeof value==='function'?value.bind(target):value}});
  const cleanupFailed=await call('/api/account/resumes/remove',{method:'POST',user:cleanup.user,body:cleanupRemoval,environment:{...env,BUCKET:brokenErasure}});assert.equal(cleanupFailed.status,503);
  const pendingRemoval=(await call('/api/account',{user:cleanup.user})).data.documents.find(item=>item.sha256===digest(pdf));assert.equal(pendingRemoval.state,'deleting');assert.equal(pendingRemoval.removable,true);
  assert.equal((await call('/api/account/resumes/remove',{method:'POST',user:cleanup.user,body:cleanupRemoval})).status,200);
  assert.equal((await call('/api/apply/receipts',{token:cleanup.token})).data.receipts[0].state,'confirmed');
  checkpoint('In-flight provider dispatch retains its exact PDF; a failed later erasure is visible and safely retriable without losing the receipt');

  async function googleIdentity(label){
    const id='synthetic-google-'+label,generation=randomUUID(),subject='google-subject-'+label,token=digest('synthetic-browser-token-'+label),sessionID=randomUUID();
    await db.batch([
      db.prepare("INSERT INTO auth_accounts(owner_id,origin_method,generation,created_at) VALUES(?,'google',?,?)").bind(id,generation,time),
      db.prepare("INSERT INTO auth_identities(provider,subject,subject_hash,owner_id,email,display_name,connected_at,updated_at) VALUES('google',?,?,?,?,?,?,?)").bind(subject,digest(subject),id,label+'@example.com','Synthetic '+label,new Date(time).toISOString(),new Date(time).toISOString()),
      db.prepare("INSERT INTO browser_sessions(token_hash,id,owner_id,account_generation,provider,subject,created_at,expires_at) VALUES(?,?,?,?,'google',?,?,?)").bind(digest(token),sessionID,id,generation,subject,time,time+600000),
    ]);
    return{id,generation,token,headers:{cookie:'__Host-career-session='+token}};
  }
  const googleOnly=await googleIdentity('identity-only'),otherBefore=await privateState(b);
  const googleAccount=await call('/api/account',{user:b.user,headers:googleOnly.headers});assert.equal(googleAccount.status,200);assert.equal(googleAccount.data.accountId,googleOnly.id);assert.equal(googleAccount.data.workspaceId,null);
  const googlePhone=await call('/api/phone/workspace',{user:b.user,headers:googleOnly.headers});assert.equal(googlePhone.data.accountId,googleOnly.id);assert.equal(googlePhone.data.workspaceId,null);
  for(const cookie of ['__Host-career-session=bad','__Host-career-session='+digest('expired')])assert.equal((await call('/api/account',{user:b.user,headers:{cookie}})).status,401);
  assert.equal((await call('/api/apply/workspace',{token:cleanup.token,headers:{cookie:'__Host-career-session=bad'}})).status,200);
  assert.equal((await call('/api/account/export?expectedAccountId='+b.user['oai-authenticated-user-id'],{user:b.user,headers:googleOnly.headers})).status,409);
  const identityExport=await call('/api/account/export?expectedAccountId='+googleOnly.id,{user:b.user,headers:googleOnly.headers});assert.equal(identityExport.status,200);assert.equal(identityExport.data.connections.length,1);assert.equal(identityExport.data.browserSessions.length,1);assert.equal(identityExport.data.workspaceId,null);assert.ok(!JSON.stringify(identityExport.data).includes(digest(googleOnly.token)));assert.ok(!JSON.stringify(identityExport.data).includes(googleOnly.token));
  checkpoint('Google cookie identity owns account/phone access and a scoped metadata export; invalid cookies never expose a different Sites account or affect native bearer access');
  assert.equal((await call('/api/account',{method:'DELETE',body:{expectedAccountId:b.user['oai-authenticated-user-id'],expectedWorkspaceId:null,confirmation:'DELETE'},user:b.user,headers:googleOnly.headers})).status,409);
  const identityRemoved=await call('/api/account',{method:'DELETE',body:{expectedAccountId:googleOnly.id,expectedWorkspaceId:null,confirmation:'DELETE'},user:b.user,headers:googleOnly.headers});assert.equal(identityRemoved.status,200);assert.match(identityRemoved.headers.get('set-cookie'),/Max-Age=0/);assert.equal(identityRemoved.data.redirectTo,'/signout-with-chatgpt?return_to=%2Faccount');
  for(const table of ['auth_accounts','auth_identities','browser_sessions'])assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM '+table+' WHERE owner_id=?').bind(googleOnly.id).first()).n,0);
  assert.deepEqual(await privateState(b),otherBefore);assert.equal((await call('/api/account',{user:b.user,headers:googleOnly.headers})).status,401);
  checkpoint('Identity-only account erasure revokes its sessions and links without creating a workspace or changing another signed-in account');

  const raceIdentity=await googleIdentity('creation-race'),raceDB=wrapDB(db);let insertedWorkspace=false;
  raceDB.batch=async statements=>{if(!insertedWorkspace&&statements[0]?._sql.startsWith('UPDATE account_lifecycles SET generation=')){insertedWorkspace=true;await db.prepare('INSERT INTO workspaces(id,owner_id,owner_email,created_at,profile_json) VALUES(?,?,?,?,?)').bind(randomUUID(),raceIdentity.id,'creation-race@example.com',new Date(time).toISOString(),JSON.stringify(empty.data.profile)).run()}return db.batch(statements.map(s=>db.prepare(s._sql).bind(...s._args)))};
  const raceDelete=await call('/api/account',{method:'DELETE',body:{expectedAccountId:raceIdentity.id,expectedWorkspaceId:null,confirmation:'DELETE'},user:b.user,headers:raceIdentity.headers,environment:{...env,DB:raceDB}});assert.equal(raceDelete.status,409);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM auth_identities WHERE owner_id=?').bind(raceIdentity.id).first()).n,1);
  checkpoint('A workspace created during identity-only deletion prevents the stale deletion atomically');

  for(const [label,path] of [['pair','/api/account/pairing'],['open','/api/phone/workspace']]){
    const staleIdentity=await googleIdentity('stale-'+label);let deletedBeforeCreate=false;
    const delayedCreation=wrapDB(db,async sql=>{if(!deletedBeforeCreate&&sql.startsWith('INSERT OR IGNORE INTO workspaces')){deletedBeforeCreate=true;const erased=await call('/api/account',{method:'DELETE',body:{expectedAccountId:staleIdentity.id,expectedWorkspaceId:null,confirmation:'DELETE'},user:b.user,headers:staleIdentity.headers});assert.equal(erased.status,200)}return false});
    const staleRequest=await call(path,{method:'POST',body:{expectedAccountId:staleIdentity.id},user:b.user,headers:staleIdentity.headers,environment:{...env,DB:delayedCreation}});
    assert.equal(deletedBeforeCreate,true);assert.equal(staleRequest.status,401);assert.equal(staleRequest.data.error.code,'invalid_session');
    for(const table of ['workspaces','auth_accounts','auth_identities','browser_sessions'])assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM '+table+' WHERE owner_id=?').bind(staleIdentity.id).first()).n,0);
  }
  checkpoint('Google pairing and browser-open requests already in flight cannot recreate a deleted owner or mint a phone code');

  for(const [label,path] of [['pair','/api/account/pairing'],['open','/api/phone/workspace']])for(const stage of ['before-lifecycle','before-create']){
    const user=owner('sites-stale-'+label+'-'+stage),id=user['oai-authenticated-user-id'];let deletedBeforeCreate=false;
    const delayedCreation=wrapDB(db,async sql=>{
      const matches=stage==='before-create'?sql.startsWith('INSERT OR IGNORE INTO workspaces'):sql.startsWith("INSERT OR IGNORE INTO meta(key,value) VALUES('auth_fence_salt'");
      if(!deletedBeforeCreate&&matches){deletedBeforeCreate=true;time++;const erased=await call('/api/account',{method:'DELETE',body:{expectedAccountId:id,expectedWorkspaceId:null,confirmation:'DELETE'},user});assert.equal(erased.status,200)}return false;
    });
    const staleRequest=await call(path,{method:'POST',body:{expectedAccountId:id},user,environment:{...env,DB:delayedCreation}});
    assert.equal(deletedBeforeCreate,true);assert.equal(staleRequest.status,409);assert.equal(staleRequest.data.error.code,'account_changed');
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM workspaces WHERE owner_id=?').bind(id).first()).n,0);
    time++;const freshRequest=await call(path,{method:'POST',body:{expectedAccountId:id},user});assert.ok([200,201].includes(freshRequest.status),JSON.stringify(freshRequest.data));
  }
  checkpoint('Opaque owner generations stop stale Sites pairing/open requests before or after lifecycle capture, while a deliberate later request can start fresh');

  const fullIdentity=await googleIdentity('full-account'),googleOpened=await call('/api/phone/workspace',{method:'POST',body:{expectedAccountId:fullIdentity.id},user:b.user,headers:fullIdentity.headers});assert.equal(googleOpened.status,200);const googleWorkspace=googleOpened.data.workspaceId;
  const fullExport=await call('/api/account/export?expectedWorkspaceId='+googleWorkspace,{user:b.user,headers:fullIdentity.headers});assert.equal(fullExport.data.connections[0].provider,'google');assert.equal(fullExport.data.accountId,fullIdentity.id);
  const fullDelete=await call('/api/account',{method:'DELETE',body:{expectedWorkspaceId:googleWorkspace,confirmation:'DELETE'},user:b.user,headers:fullIdentity.headers});assert.equal(fullDelete.status,200);
  for(const table of ['auth_accounts','auth_identities','browser_sessions','workspaces'])assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM '+table+' WHERE owner_id=?').bind(fullIdentity.id).first()).n,0);
  assert.deepEqual(await privateState(b),otherBefore);
  checkpoint('Full Google-owned workspace erasure removes identity and application state together and preserves the other browser account');

  }
  const currentAccounts=(await db.prepare('SELECT COUNT(*) AS n FROM workspaces').first()).n,accountSeed=[];for(let i=currentAccounts;i<LIMITS.maxAccounts-1;i++)accountSeed.push(db.prepare('INSERT INTO workspaces(id,owner_id,owner_email,created_at,profile_json) VALUES(?,?,?,?,?)').bind(randomUUID(),'seeded-account-'+i,'synthetic@example.com',new Date(time).toISOString(),'{}'));await db.batch(accountSeed);
  const accountRace=await Promise.all(['cap-a','cap-b'].map(id=>call('/api/account/pairing',{method:'POST',body:{expectedAccountId:owner(id)['oai-authenticated-user-id']},user:owner(id)})));assert.deepEqual(accountRace.map(r=>r.status).sort(),[201,503]);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM workspaces').first()).n,LIMITS.maxAccounts);checkpoint('Global free-service account cap is atomic rather than count-then-create');

  const files=['server/applications.mjs','server/provider.mjs','server/validation.mjs','server/identity.mjs','server/pdf-readability.mjs','server/retry-after.mjs','db/schema.ts','tests/hosted-applications.mjs',...(await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort().map(f=>'drizzle/'+f)];const hashes={};for(const file of files)hashes[file]=digest(await readFile(new URL('../'+file,import.meta.url)));
  const evidence={observedAt:new Date().toISOString(),status:'passed',checks:passed.length,groups:passed,providerPosts:postCount,realEmployerRequests:0,mode:'Actual Miniflare D1 and R2 bindings; production handler and provider mapping with injected synthetic HTTP dependency.',fiveMiBPDF:true,sourceHashes:hashes,limits:'Local workerd storage and Node handler execution; production HTTPS, Sites trusted identity headers and native phone interaction require separate deployment checks.'};
  await writeFile(new URL('./hosted-verification.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({result:'PASS',groups:passed.length,syntheticProviderPosts:postCount,realEmployerRequests:0}));
} finally {await mf.dispose()}
