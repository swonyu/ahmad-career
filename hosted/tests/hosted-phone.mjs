import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {SERVICE_ORIGIN} from '../server/applications.mjs';

const groups=[];
let requests=0,db,bucket;
const digest=value=>createHash('sha256').update(value).digest('hex');
const check=name=>{groups.push(name);console.log('PASS',name)};
const pdf=Buffer.from('JVBERi0xLjcKJYGBgYEKCjEgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFsgNCAwIFIgXQovQ291bnQgMQo+PgplbmRvYmoKCjIgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDEgMCBSCj4+CmVuZG9iagoKMyAwIG9iago8PAovUHJvZHVjZXIgPEZFRkYwMDcwMDA2NDAwNjYwMDJEMDA2QzAwNjkwMDYyMDAyMDAwMjgwMDY4MDA3NDAwNzQwMDcwMDA3MzAwM0EwMDJGMDAyRjAwNjcwMDY5MDA3NDAwNjgwMDc1MDA2MjAwMkUwMDYzMDA2RjAwNkQwMDJGMDA0ODAwNkYwMDcwMDA2NDAwNjkwMDZFMDA2NzAwMkYwMDcwMDA2NDAwNjYwMDJEMDA2QzAwNjkwMDYyMDAyOT4KL01vZERhdGUgKEQ6MjAyNjAxMDEwMDAwMDBaKQovQ3JlYXRvciA8RkVGRjAwNzAwMDY0MDA2NjAwMkQwMDZDMDA2OTAwNjIwMDIwMDAyODAwNjgwMDc0MDA3NDAwNzAwMDczMDAzQTAwMkYwMDJGMDA2NzAwNjkwMDc0MDA2ODAwNzUwMDYyMDAyRTAwNjMwMDZGMDA2RDAwMkYwMDQ4MDA2RjAwNzAwMDY0MDA2OTAwNkUwMDY3MDAyRjAwNzAwMDY0MDA2NjAwMkQwMDZDMDA2OTAwNjIwMDI5PgovQ3JlYXRpb25EYXRlIChEOjIwMjYwMTAxMDAwMDAwWikKPj4KZW5kb2JqCgo0IDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9QYXJlbnQgMSAwIFIKL1Jlc291cmNlcyA8PAovRm9udCA8PAovSGVsdmV0aWNhLTcwOTg0ODA3ODkgNSAwIFIKPj4KL1hPYmplY3QgPDwKPj4KL0V4dEdTdGF0ZSA8PAo+Pgo+PgovTWVkaWFCb3ggWyAwIDAgNjEyIDc5MiBdCi9Bbm5vdHMgWyBdCi9Db250ZW50cyBbIDYgMCBSIF0KPj4KZW5kb2JqCgo1IDAgb2JqCjw8Ci9UeXBlIC9Gb250Ci9TdWJ0eXBlIC9UeXBlMQovQmFzZUZvbnQgL0hlbHZldGljYQovRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZwo+PgplbmRvYmoKCjYgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL0xlbmd0aCAxMzIKPj4Kc3RyZWFtCnicJYvBCkJBCEX3foXrINIZRx2IFsFAizaBPxDxiqIWRfT9+YqL4j0cn7ANIJzzusBqN90/0/t6Oi6NuouTeUcuGGcogrEH/qmMQmg58YB1q9Z1mKhry921FpKqbEVbkpJNkw6Vf1PWmmlGaXPyvJOmY25ibf7bYNwgFjACDvAFvpcjUgplbmRzdHJlYW0KZW5kb2JqCgp4cmVmCjAgNwowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTYgMDAwMDAgbiAKMDAwMDAwMDA3NiAwMDAwMCBuIAowMDAwMDAwMTI2IDAwMDAwIG4gCjAwMDAwMDA1OTYgMDAwMDAgbiAKMDAwMDAwMDc5MSAwMDAwMCBuIAowMDAwMDAwODg5IDAwMDAwIG4gCgp0cmFpbGVyCjw8Ci9TaXplIDcKL1Jvb3QgMiAwIFIKL0luZm8gMyAwIFIKPj4KCnN0YXJ0eHJlZgoxMDk0CiUlRU9G','base64');
const linked='https://www.linkedin.com/in/Phone%2BExample';
const profile=email=>({firstName:'Phone',lastName:'Example',email,country:'SA',website:'https://example.com/portfolio',linkedin:'https://sa.linkedin.com/in/Phone+Example/?trk=discard',resume:{name:'Phone-CV.pdf',mime:'application/pdf',dataBase64:pdf.toString('base64')}});
const postingId=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const bundle=await build({entryPoints:['tests/fixtures/phone-runtime.mjs'],bundle:true,format:'esm',platform:'neutral',mainFields:['module','main'],target:'es2022',external:['node:*'],write:false});
// Use the SDK adapter to preserve isolated v4 fixture semantics on Miniflare5.
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],outboundService:()=>{throw Error('Real outbound requests are forbidden in phone browser tests')}}));

async function call(path,{actor='a',method='GET',body,raw,headers={},expected=200}={}){
  const h=new Headers({'sec-fetch-site':'same-origin'});
  if(actor)h.set('x-fixture-actor',actor);
  if(body!==undefined||raw!==undefined){h.set('content-type','application/json');h.set('origin',SERVICE_ORIGIN)}
  for(const [name,value] of Object.entries(headers))if(value===null)h.delete(name);else h.set(name,value);
  const response=await mf.dispatchFetch(SERVICE_ORIGIN+path,{method,headers:h,...(body!==undefined?{body:JSON.stringify(body)}:raw!==undefined?{body:raw}:{})});
  const data=await response.json();requests++;
  assert.equal(response.status,expected,`${method} ${path}: ${JSON.stringify(data)}`);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'),null);
  return data;
}
async function fixture(){return(await mf.dispatchFetch(SERVICE_ORIGIN+'/__fixture/state')).json()}
async function rows(table){return(await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results}
async function state(){
  const tables={};for(const table of ['workspaces','meta','throttles','pairing_codes','native_sessions','jobs','plans','attempts','resumes','resume_uploads','dispatch_gates'])tables[table]=await rows(table);
  const files=[];for(const object of(await bucket.list()).objects){const file=await bucket.get(object.key);files.push({key:object.key,sha256:digest(new Uint8Array(await file.arrayBuffer()))})}
  return{tables,files,provider:await fixture()};
}
async function open(actor,expectedAccountId=`phone-synthetic-${actor}`){return call('/api/phone/workspace',{actor,method:'POST',body:{expectedAccountId}})}
async function job(ws,n,actor='a'){return(await call('/api/phone/jobs',{actor,method:'POST',body:{expectedWorkspaceId:ws,url:`https://jobs.lever.co/phone-fixture/${postingId(n)}`},expected:201})).job}
async function prepare(ws,saved,actor='a'){
  return(await call('/api/phone/prepare',{actor,method:'POST',body:{expectedWorkspaceId:ws,jobIds:[saved.id],answers:{[saved.id]:{comments:'Synthetic browser application',consentStore:true,consentMarketing:false}},reviewSchema:3},expected:201})).plan;
}
const approval=(ws,plan)=>({expectedWorkspaceId:ws,planId:plan.id,digest:plan.digest,approved:true,reviewSchema:3});

try{
  db=await mf.getD1Database('DB');bucket=await mf.getR2Bucket('BUCKET');
  for(const file of(await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())for(const sql of(await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
  const blankBefore=await state(),blank=await call('/api/phone/workspace',{actor:'unopened'});
  assert.equal(blank.workspaceId,null);assert.equal(blank.accountId,'phone-synthetic-unopened');assert.equal(blank.profile.revision,0);assert.deepEqual(blank.jobs,[]);assert.deepEqual(blank.recoverablePlans,[]);assert.equal(blank.capabilities.linkedinProfile,true);assert.deepEqual(await state(),blankBefore);
  check('A first browser GET returns a blank account view without creating a workspace, salt, throttle or session');

  for(const headers of [{},{'oai-authenticated-user-id':'phone-synthetic-a','oai-authenticated-user-email':'a@example.com'},{authorization:'Bearer '+'a'.repeat(64),'x-user-id':'phone-synthetic-a'}]){
    assert.equal((await call('/api/phone/workspace',{actor:null,headers,expected:401})).error.code,'sign_in_required');
    assert.equal((await call('/api/phone/workspace',{actor:null,method:'POST',body:{expectedAccountId:'phone-synthetic-a'},headers,expected:401})).error.code,'sign_in_required');
  }
  assert.deepEqual(await state(),blankBefore);
  check('Anonymous requests and caller-forged authentication headers fail behind the modeled trusted Sites edge');

  for(const expectedAccountId of [undefined,'phone-synthetic-a'])assert.equal((await call('/api/phone/workspace',{actor:'unopened',method:'POST',body:{expectedAccountId},expected:409})).error.code,'account_changed');
  assert.deepEqual(await state(),blankBefore);
  const a=await open('a'),b=await open('b');
  assert.ok(a.workspaceId);assert.notEqual(a.workspaceId,b.workspaceId);assert.equal(a.confirmedEmail,'a@example.com');assert.equal(a.accountEmail,'a@example.com');assert.equal(a.emailUpdateRequired,false);
  assert.equal(a.sessionToken,undefined);assert.equal(a.pairingCode,undefined);assert.equal((await rows('native_sessions')).length,0);assert.equal((await rows('pairing_codes')).length,0);
  assert.equal((await open('a')).workspaceId,a.workspaceId);assert.equal((await call('/api/phone/workspace')).profile.revision,0);
  check('Explicit account-bound creation and reopening create no native credential or pairing code');

  const savedA=await call('/api/phone/profile',{method:'PUT',body:{expectedWorkspaceId:a.workspaceId,expectedRevision:0,profile:profile('a@example.com')}});
  await call('/api/phone/profile',{actor:'b',method:'PUT',body:{expectedWorkspaceId:b.workspaceId,expectedRevision:0,profile:profile('b@example.com')}});
  assert.equal(savedA.profile.revision,1);assert.equal(savedA.profile.linkedin,linked);assert.equal(savedA.profile.resume.sha256,digest(pdf));
  const stored=(await rows('resumes')).find(r=>r.workspace_id===a.workspaceId);
  assert.equal(digest(new Uint8Array(await(await bucket.get(stored.object_key)).arrayBuffer())),digest(pdf));
  const pair=await call('/api/account/pairing',{method:'POST',body:{expectedAccountId:a.accountId},expected:201});
  const native=await call('/api/apply/session',{actor:null,method:'POST',body:{pairingCode:pair.pairingCode},headers:{origin:null,'sec-fetch-site':null}});
  assert.equal((await call('/api/apply/workspace',{actor:null,headers:{authorization:'Bearer '+native.sessionToken,'sec-fetch-site':null}})).workspaceId,a.workspaceId);
  assert.equal((await call('/api/phone/workspace',{actor:null,headers:{authorization:'Bearer '+native.sessionToken},expected:401})).error.code,'sign_in_required');
  assert.equal((await call('/api/phone/workspace',{actor:'b',headers:{authorization:'Bearer '+native.sessionToken,'oai-authenticated-user-id':a.accountId,'oai-authenticated-user-email':'a@example.com'}})).workspaceId,b.workspaceId);
  check('Browser PDF/profile writes use shared validation and actual private R2; valid native tokens never choose the browser owner');

  const readyJob=await job(a.workspaceId,1),readyPlan=await prepare(a.workspaceId,readyJob);
  const bJob=await job(b.workspaceId,5,'b'),bPlan=await prepare(b.workspaceId,bJob,'b');
  assert.equal(readyPlan.items[0].state,'ready');assert.equal(readyPlan.items[0].payloadSummary.linkedin,linked);
  await db.prepare('INSERT INTO throttles(key,window,count) VALUES(?,?,?)').bind('expired-phone-fixture',0,77).run();
  await db.prepare('INSERT INTO native_sessions(token_hash,id,workspace_id,created_at,expires_at) VALUES(?,?,?,?,?)').bind('b'.repeat(64),randomUUID(),b.workspaceId,'2000-01-01T00:00:00.000Z','2000-01-01T00:00:01.000Z').run();
  await db.prepare('INSERT INTO pairing_codes(code_hash,workspace_id,created_at,expires_at) VALUES(?,?,?,?)').bind('c'.repeat(64),b.workspaceId,'2000-01-01T00:00:00.000Z','2000-01-01T00:00:01.000Z').run();
  await db.prepare("UPDATE attempts SET state='dispatching',lease_expires_at=? WHERE plan_id=?").bind('2000-01-01T00:00:01.000Z',bPlan.id).run();
  const intents=[
    {path:'profile',method:'PUT',body:{expectedRevision:1,profile:profile('changed-b@example.com')}},
    {path:'jobs',body:{url:'https://www.linkedin.com/jobs/view/123456789/',title:'Manual',company:'Fixture'}},
    {path:'prepare',body:{jobIds:[bJob.id],reviewSchema:3}},
    {path:'submit',body:{planId:bPlan.id,digest:bPlan.digest,approved:true,reviewSchema:3}},
    {path:'advance',body:{planId:bPlan.id}},
    {path:'stop',body:{planId:bPlan.id}},
  ];
  const intentBefore=await state();
  for(const action of intents)assert.equal((await call('/api/phone/'+action.path,{actor:null,method:action.method??'POST',body:{...action.body,expectedWorkspaceId:b.workspaceId},headers:{authorization:'Bearer '+native.sessionToken,'oai-authenticated-user-id':b.accountId,'oai-authenticated-user-email':'b@example.com'},expected:401})).error.code,'sign_in_required');
  assert.equal((await call('/api/phone/receipts?expectedWorkspaceId='+b.workspaceId,{actor:null,headers:{authorization:'Bearer '+native.sessionToken},expected:401})).error.code,'sign_in_required');
  assert.deepEqual(await state(),intentBefore);
  check('No browser mutation or receipt export accepts a native token or forged caller identity in place of Sites authentication');
  for(const action of intents)for(const expectedWorkspaceId of [undefined,a.workspaceId]){
    const rejected=await call('/api/phone/'+action.path,{actor:'changedB',method:action.method??'POST',body:{...action.body,expectedWorkspaceId},expected:409});assert.equal(rejected.error.code,'workspace_changed');
  }
  for(const expectedAccountId of [undefined,a.accountId])assert.equal((await call('/api/phone/workspace',{actor:'changedB',method:'POST',body:{expectedAccountId},expected:409})).error.code,'account_changed');
  assert.deepEqual(await state(),intentBefore);
  check('Every browser mutation rejects stale or missing account/workspace intent before any write, cleanup, throttle, PDF access or provider request');

  const changedView=await call('/api/phone/workspace',{actor:'changedB'});assert.equal(changedView.accountEmail,'changed-b@example.com');assert.equal(changedView.confirmedEmail,'b@example.com');assert.equal(changedView.emailUpdateRequired,true);assert.equal(changedView.profile.revision,1);
  await call('/api/phone/receipts?expectedWorkspaceId='+b.workspaceId,{actor:'changedB'});
  for(const query of ['',`?expectedWorkspaceId=${a.workspaceId}`,`?expectedWorkspaceId=${b.workspaceId}&expectedWorkspaceId=${a.workspaceId}`])assert.equal((await call('/api/phone/receipts'+query,{actor:'b',expected:409})).error.code,'workspace_changed');
  assert.deepEqual(await state(),intentBefore);
  check('Workspace and bound receipt GETs remain read-only, including changed email and expired dispatch/session rows');

  for(const action of [{path:'workspace',body:{expectedAccountId:b.accountId}},...intents.map(x=>({...x,body:{...x.body,expectedWorkspaceId:b.workspaceId}}))]){
    for(const headers of [{origin:null},{origin:'https://unrelated.example'},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':'same-site'},{'sec-fetch-site':'none'}]){
      assert.equal((await call('/api/phone/'+action.path,{actor:'b',method:action.method??'POST',body:action.body,headers,expected:403})).error.code,'origin_denied');
    }
  }
  assert.deepEqual(await state(),intentBefore);
  check('All browser writes require the exact Origin and reject cross-site, same-site and navigation Fetch Metadata');

  for(const [path,method] of [['session','POST'],['session/revoke','POST'],['pairing','POST'],['status','GET'],['export','GET'],['profile','POST'],['jobs','GET'],['workspace','DELETE'],['','GET']])await call('/api/phone/'+path,{actor:'b',method,...(method==='GET'?{}:{body:{expectedWorkspaceId:b.workspaceId}}),expected:404});
  for(const action of intents)await call('/api/phone/'+action.path,{actor:'b',method:action.method??'POST',body:{...action.body,expectedWorkspaceId:b.workspaceId,authorization:'forged-payload'},expected:422});
  await call('/api/phone/jobs',{actor:'b',method:'POST',body:{expectedWorkspaceId:b.workspaceId,title:'x'.repeat(33000)},expected:413});
  await call('/api/phone/profile',{actor:'b',method:'PUT',raw:'{"expectedWorkspaceId":',expected:400});
  await call('/api/phone/profile',{actor:'b',method:'PUT',body:{expectedWorkspaceId:b.workspaceId},headers:{'content-type':'text/plain'},expected:415});
  assert.deepEqual(await state(),intentBefore);
  check('The browser allowlist excludes native credential routes, rejects unknown fields, and applies bounded single-pass JSON parsing');

  const refreshed=await open('changedB',b.accountId);assert.equal(refreshed.workspaceId,b.workspaceId);assert.equal(refreshed.confirmedEmail,'changed-b@example.com');assert.equal(refreshed.profile.revision,2);assert.equal(refreshed.profile.email,'b@example.com');
  assert.equal((await open('changedB',b.accountId)).profile.revision,2);
  assert.equal((await call('/api/phone/submit',{actor:'changedB',method:'POST',body:approval(b.workspaceId,bPlan),expected:409})).error.code,'stale_review');
  assert.equal((await rows('pairing_codes')).filter(r=>r.workspace_id===b.workspaceId).length,1);
  assert.equal((await rows('native_sessions')).filter(r=>r.workspace_id===b.workspaceId).length,1);
  check('Explicit same-account email refresh advances the revision once and invalidates old approval without creating or rotating phone credentials');

  const oldProfile=(await call('/api/phone/workspace')).profile,filesBefore=(await state()).files;
  await call('/api/phone/profile',{method:'PUT',body:{expectedWorkspaceId:a.workspaceId,expectedRevision:0,profile:profile('overwrite@example.com')},expected:409});
  assert.deepEqual((await call('/api/phone/workspace')).profile,oldProfile);assert.deepEqual((await state()).files,filesBefore);
  for(const body of [{...approval(a.workspaceId,readyPlan),digest:'0'.repeat(64)},{...approval(a.workspaceId,readyPlan),approved:false},{...approval(a.workspaceId,readyPlan),reviewSchema:undefined}])await call('/api/phone/submit',{method:'POST',body,expected:409});
  assert.equal((await db.prepare('SELECT approval_generation FROM plans WHERE id=?').bind(readyPlan.id).first()).approval_generation,0);assert.equal((await fixture()).posts.length,0);
  check('Stale profile replay and unapproved, changed-digest or old-schema reviews cannot replace data or authorize a send');

  const approved=await call('/api/phone/submit',{method:'POST',body:approval(a.workspaceId,readyPlan),expected:202});assert.ok(approved.activePlanIds.includes(readyPlan.id));assert.equal((await fixture()).posts.length,0);
  const confirmed=await call('/api/phone/advance',{method:'POST',body:{expectedWorkspaceId:a.workspaceId,planId:readyPlan.id}});assert.equal(confirmed.attempts[0].state,'confirmed');assert.equal(confirmed.attempts[0].evidenceMode,'test');
  await call('/api/phone/advance',{method:'POST',body:{expectedWorkspaceId:a.workspaceId,planId:readyPlan.id}});
  await call('/api/phone/submit',{method:'POST',body:approval(a.workspaceId,readyPlan)});
  const sent=(await fixture()).posts;assert.equal(sent.length,1);assert.equal(sent[0].linkedin,linked);assert.equal(sent[0].portfolio,'https://example.com/portfolio');assert.equal(sent[0].resumeSHA256,digest(pdf));assert.equal(sent[0].consentStore,'true');assert.equal(sent[0].consentMarketing,'false');
  const duplicate=await prepare(a.workspaceId,readyJob);assert.equal(duplicate.items[0].state,'blocked');
  check('Explicit approval and continuation submit the exact reviewed PDF/LinkedIn payload once; repeat requests and duplicate reviews do not resend');

  const uncertainJob=await job(a.workspaceId,2),uncertainPlan=await prepare(a.workspaceId,uncertainJob);
  await call('/api/phone/submit',{method:'POST',body:approval(a.workspaceId,uncertainPlan),expected:202});
  const uncertain=await call('/api/phone/advance',{method:'POST',body:{expectedWorkspaceId:a.workspaceId,planId:uncertainPlan.id}});assert.equal(uncertain.attempts[0].state,'uncertain');
  await call('/api/phone/advance',{method:'POST',body:{expectedWorkspaceId:a.workspaceId,planId:uncertainPlan.id}});assert.equal((await fixture()).posts.length,2);assert.equal((await prepare(a.workspaceId,uncertainJob)).items[0].state,'blocked');
  check('An ambiguous browser dispatch remains durably uncertain and cannot be automatically retried or duplicated');

  const stoppedJob=await job(a.workspaceId,3),stoppedPlan=await prepare(a.workspaceId,stoppedJob);
  const stopped=await call('/api/phone/stop',{method:'POST',body:{expectedWorkspaceId:a.workspaceId,planId:stoppedPlan.id,onlyIfUnapproved:true}});assert.equal(stopped.attempts[0].state,'cancelled');
  await call('/api/phone/submit',{method:'POST',body:approval(a.workspaceId,stoppedPlan),expected:409});
  const unavailableJob=await job(a.workspaceId,4),unavailablePlan=await prepare(a.workspaceId,unavailableJob);
  await call('/api/phone/submit',{method:'POST',body:approval(a.workspaceId,unavailablePlan),expected:202});
  const unavailable=await call('/api/phone/advance',{method:'POST',body:{expectedWorkspaceId:a.workspaceId,planId:unavailablePlan.id},headers:{'x-fixture-disable-provider':'true'}});assert.equal(unavailable.attempts[0].state,'blocked');assert.equal((await fixture()).posts.length,2);
  check('Stop and provider-unavailable continuation preserve the existing fail-closed submission rules');

  const leaseJobs=[await job(a.workspaceId,6),await job(a.workspaceId,7),await job(a.workspaceId,8)];
  const leasePlan=(await call('/api/phone/prepare',{method:'POST',body:{expectedWorkspaceId:a.workspaceId,jobIds:leaseJobs.map(saved=>saved.id),answers:Object.fromEntries(leaseJobs.map(saved=>[saved.id,{comments:'Synthetic interrupted dispatch',consentStore:true,consentMarketing:false}])),reviewSchema:3},expected:201})).plan;
  const separateLeasePlan=await prepare(a.workspaceId,stoppedJob);
  await call('/api/phone/submit',{method:'POST',body:approval(a.workspaceId,leasePlan),expected:202});
  const expiredLease='2000-01-01T00:00:00.000Z',liveLease='2999-01-01T00:00:00.000Z';
  await db.prepare("UPDATE attempts SET state='dispatching',dispatch_count=1,dispatched_at=?,claim_token='synthetic-phone-expired',lease_expires_at=? WHERE plan_id=? AND job_id=?").bind(expiredLease,expiredLease,leasePlan.id,leaseJobs[0].id).run();
  await db.prepare("UPDATE attempts SET state='dispatching',dispatch_count=1,dispatched_at=?,claim_token='synthetic-phone-live',lease_expires_at=? WHERE plan_id=? AND job_id=?").bind(expiredLease,liveLease,leasePlan.id,leaseJobs[1].id).run();
  await db.prepare("UPDATE attempts SET state='dispatching',dispatch_count=1,lease_expires_at=? WHERE plan_id=?").bind(expiredLease,separateLeasePlan.id).run();
  await db.prepare('UPDATE plans SET expires_at=? WHERE id=?').bind(expiredLease,leasePlan.id).run();
  const leaseRows=async()=>({plans:await rows('plans'),attempts:await rows('attempts')}),leaseBefore=await leaseRows(),providerBeforeLease=await fixture();
  await call('/api/phone/workspace');await call('/api/phone/receipts?expectedWorkspaceId='+a.workspaceId);assert.deepEqual(await leaseRows(),leaseBefore);
  assert.equal((await call('/api/phone/advance',{method:'POST',body:{expectedWorkspaceId:a.workspaceId,planId:leasePlan.id},expected:409})).error.code,'approval_required');
  assert.equal((await call('/api/phone/stop',{method:'POST',body:{expectedWorkspaceId:a.workspaceId,planId:leasePlan.id,onlyIfUnapproved:true},expected:409})).error.code,'review_already_approved');
  assert.deepEqual(await leaseRows(),leaseBefore);assert.deepEqual(await fixture(),providerBeforeLease);
  check('Browser GETs, expired-plan advance and denied guarded Stop cannot reconcile or change expired dispatch claims');
  const stoppedLeases=await call('/api/phone/stop',{method:'POST',body:{expectedWorkspaceId:a.workspaceId,planId:leasePlan.id}});
  assert.equal(stoppedLeases.plan.stopped,true);assert.equal(stoppedLeases.attempts.find(attempt=>attempt.jobId===leaseJobs[0].id).state,'uncertain');assert.equal(stoppedLeases.attempts.find(attempt=>attempt.jobId===leaseJobs[0].id).error.code,'worker_interrupted');
  assert.equal(stoppedLeases.attempts.find(attempt=>attempt.jobId===leaseJobs[1].id).state,'dispatching');assert.equal(stoppedLeases.attempts.find(attempt=>attempt.jobId===leaseJobs[2].id).state,'cancelled');
  const leaseAfter=await leaseRows();
  for(const row of leaseBefore.attempts.filter(row=>row.plan_id!==leasePlan.id||row.job_id===leaseJobs[1].id))assert.deepEqual(leaseAfter.attempts.find(current=>current.id===row.id),row);
  await db.prepare('UPDATE attempts SET lease_expires_at=? WHERE plan_id=? AND job_id=?').bind(expiredLease,leasePlan.id,leaseJobs[1].id).run();
  const repeatedLeaseBefore=await leaseRows();
  await call('/api/phone/stop',{method:'POST',body:{expectedWorkspaceId:a.workspaceId,planId:leasePlan.id,onlyIfUnapproved:true},expected:409});assert.deepEqual(await leaseRows(),repeatedLeaseBefore);
  const repeatedLeaseStop=await call('/api/phone/stop',{method:'POST',body:{expectedWorkspaceId:a.workspaceId,planId:leasePlan.id}});assert.equal(repeatedLeaseStop.attempts.find(attempt=>attempt.jobId===leaseJobs[1].id).state,'uncertain');assert.deepEqual(await fixture(),providerBeforeLease);
  check('Browser Stop reconciles only the exact stopped plan’s expired claims, preserves live/other-owner claims and never resends');

  const beforeManual=await fixture(),manual=await call('/api/phone/jobs',{method:'POST',body:{expectedWorkspaceId:a.workspaceId,url:'https://www.linkedin.com/jobs/view/123456789/',title:'Manual role',company:'Fixture'},expected:201});
  assert.equal(manual.job.provider,'manual');assert.equal(manual.job.submissionSupported,false);assert.equal((await prepare(a.workspaceId,manual.job)).items[0].state,'blocked');assert.deepEqual(await fixture(),beforeManual);
  const receipts=await call('/api/phone/receipts?expectedWorkspaceId='+a.workspaceId);assert.ok(receipts.receipts.some(r=>r.state==='confirmed'));assert.ok(receipts.receipts.some(r=>r.state==='uncertain'));assert.ok(receipts.receipts.every(r=>r.state!=='ready'));assert.ok(!JSON.stringify(receipts).includes(pdf.toString('base64')));
  check('Manual LinkedIn jobs cause no fetch or receipt; receipt exports remain account-bound and contain no PDF bytes');

  await db.prepare("UPDATE attempts SET state='uncertain',lease_expires_at=NULL WHERE plan_id=?").bind(bPlan.id).run();
  await call('/api/account',{actor:'changedB',method:'DELETE',body:{expectedWorkspaceId:b.workspaceId,confirmation:'DELETE'}});
  const newB=await open('changedB',b.accountId);assert.notEqual(newB.workspaceId,b.workspaceId);
  const recreatedBefore=await state();
  for(const action of intents)assert.equal((await call('/api/phone/'+action.path,{actor:'changedB',method:action.method??'POST',body:{...action.body,expectedWorkspaceId:b.workspaceId},expected:409})).error.code,'workspace_changed');
  assert.deepEqual(await state(),recreatedBefore);
  check('A deleted and recreated workspace rejects stale requests even when the signed-in account is unchanged');

  await db.prepare('UPDATE workspaces SET deleting_at=? WHERE id=?').bind(new Date().toISOString(),newB.workspaceId).run();
  const deletingBefore=await state();
  assert.equal((await call('/api/phone/workspace',{actor:'changedB'})).deleting,true);
  assert.equal((await call('/api/phone/workspace',{actor:'changedB',method:'POST',body:{expectedAccountId:b.accountId},expected:409})).error.code,'account_deleting');
  for(const action of intents)assert.equal((await call('/api/phone/'+action.path,{actor:'changedB',method:action.method??'POST',body:{...action.body,expectedWorkspaceId:newB.workspaceId},expected:409})).error.code,'account_deleting');
  assert.equal((await call('/api/phone/receipts?expectedWorkspaceId='+newB.workspaceId,{actor:'changedB',expected:409})).error.code,'account_deleting');
  assert.deepEqual(await state(),deletingBefore);
  check('A pending deletion remains visible and read-only while browser creation, mutations and receipt downloads stay locked without cleanup');

  const sourceHashes={};for(const file of ['server/applications.mjs','server/provider.mjs','server/validation.mjs','worker/index.ts','tests/hosted-phone.mjs','tests/fixtures/phone-runtime.mjs'])sourceHashes[file]=digest(await readFile(new URL('../'+file,import.meta.url)));
  const provider=await fixture(),evidence={observedAt:new Date().toISOString(),status:'passed',groups,groupCount:groups.length,actualWorkerdRequests:requests,syntheticProviderPosts:provider.posts.length,syntheticProviderGets:provider.providerGets,observedR2Reads:provider.storageReads,observedR2Writes:provider.storageWrites,realEmployerRequests:0,sourceHashes,scope:'Bundled production application handler inside actual workerd with real local D1 and R2. Provider HTTP is synthetic and all real outbound requests are forbidden.',limits:'The test-only edge strips caller identity headers and injects trusted synthetic owners. Production Sites header stripping, browser UI behavior and production HTTPS require separate live acceptance.'};
  await writeFile(new URL('./hosted-phone-verification.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({result:'PASS',groups:groups.length,actualWorkerdRequests:requests,syntheticProviderPosts:provider.posts.length,realEmployerRequests:0}));
}finally{await mf.dispose()}
