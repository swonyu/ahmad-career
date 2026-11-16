import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {createApplicationService} from './applications/service.mjs';
import {profile as validateProfile,country,publicURL,leverTarget} from './applications/validation.mjs';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'career-application-check-'));
const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
const cv={name:'Fixture-CV.pdf',mime:'application/pdf',dataBase64:pdf.toString('base64')};
const candidate={firstName:'Amina',lastName:'Example',email:'amina@example.com',phone:'+966 50 000 0000',city:'Riyadh',country:'SA',headline:'Independent software developer',skills:['Swift','JavaScript'],targetRoles:['Software'],targetCountries:['SA'],workModes:['remote','hybrid'],experienceLevel:'entry',website:'https://example.com/portfolio',resume:cv};
let checks=0;const check=(name,fn)=>{fn();checks++;console.log(`PASS ${name}`)};
const counts=new Map(),requests=[],scenarios=new Map();let changedTitle=false;
const postingID=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const postingURL=n=>`https://jobs.lever.co/career-fixture/${postingID(n)}`;
const mock=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost');
  const match=u.pathname.match(/^\/lever\/v0\/postings\/career-fixture\/([a-f0-9-]{36})$/);
  if(!match){res.writeHead(501);res.end('Unmodeled mock route');return}
  const id=match[1],n=Number(id.slice(-12));
  if(req.method==='GET') {
    if(scenarios.get(n)==='closed'){res.writeHead(404);res.end('{}');return}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id,text:changedTitle?'Updated role':'Software developer',categories:{location:'Riyadh'},country:'SA',workplaceType:'hybrid',descriptionPlain:'Synthetic test posting',hostedUrl:postingURL(n),applyUrl:postingURL(n)+'/apply'}));return;
  }
  if(req.method!=='POST'){res.writeHead(501);res.end();return}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const body=Buffer.concat(chunks);counts.set(n,(counts.get(n)??0)+1);
  requests.push({n,body,contentType:req.headers['content-type'],key:u.searchParams.get('key')});
  if(u.searchParams.get('key')!=='fixture-key-never-real'){res.writeHead(403,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'fake key required'}));return}
  const scenario=scenarios.get(n)??'success';
  if(scenario==='timeout')await new Promise(resolve=>setTimeout(resolve,250));
  if(scenario==='no-receipt'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true}));return}
  if(scenario==='html'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<h1>Thank you</h1>');return}
  if(scenario==='false-ok'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,applicationId:'test-invalid'}));return}
  if(scenario==='server-error'){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'internal fixture-key-never-real'}));return}
  if(scenario==='redirect'){res.writeHead(302,{Location:'https://example.com/must-not-follow'});res.end();return}
  if(scenario==='rejected'){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'private fixture-key-never-real'}));return}
  if(scenario==='rate-limit'&&(counts.get(n)??0)===1){res.writeHead(429,{'Content-Type':'application/json','Retry-After':'1'});res.end(JSON.stringify({ok:false,error:'rate limit'}));return}
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,applicationId:`test-application-${n}`}));
});
mock.listen(0,'127.0.0.1');await once(mock,'listening');
const mockOrigin=`http://127.0.0.1:${mock.address().port}`;
const serviceInstances=[];
async function fixture(name,{hooks={},timeoutMs=150,clock,configOverride}={}) {
  const dir=path.join(temp,name),configPath=path.join(temp,name+'.json');
  const now=Date.now();
  const entries=Object.fromEntries(Array.from({length:80},(_,i)=>[postingID(i+1),{revision:'fixture-v1',reviewedAt:new Date(now-60000).toISOString(),expiresAt:new Date(now+86400000).toISOString(),hasCustomQuestions:false,requiredFields:['name','email','resume'],privacyPolicyUrl:'https://example.com/privacy'}]));
  const config={version:1,connectors:[{provider:'lever',region:'global',site:'career-fixture',apiKeyEnv:'CAREER_LEVER_FIXTURE_KEY',postings:entries}]};
  configOverride?.(config);fs.writeFileSync(configPath,JSON.stringify(config),{mode:0o600});
  let service;
  const server=http.createServer((req,res)=>{service.handle(req,res).then(handled=>{if(!handled){res.writeHead(404);res.end()}})});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  const options={dataDir:dir,configPath,origin,env:{NODE_ENV:'test',CAREER_LEVER_FIXTURE_KEY:'fixture-key-never-real'},testOnly:{enabled:true,baseURL:mockOrigin+'/lever',timeoutMs},clock,hooks};
  service=createApplicationService(options);
  const item={service,server,origin,dir,configPath,options,async close(){await service.close();server.closeAllConnections();server.close();await once(server,'close')}};serviceInstances.push(item);
  function client({token,cookie,csrf}={}) {
    return {token,cookie,csrf,async request(method,route,body,extra={}){
      const headers={...(method!=='GET'?{'Content-Type':'application/json'}:{}),...(this.token?{Authorization:`Bearer ${this.token}`}:{Origin:origin,...(this.cookie?{Cookie:this.cookie}:{}),...(this.csrf?{'X-Career-CSRF':this.csrf}:{})}),...extra};
      for(const k of Object.keys(headers))if(headers[k]===undefined)delete headers[k];
      const r=await fetch(origin+'/api/apply/'+route,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});let data;try{data=await r.json()}catch{data=null};return {status:r.status,data,headers:r.headers};
    }};
  }
  item.client=client;
  item.browser=async()=>{const c=client();const r=await c.request('POST','session',{});assert.equal(r.status,200);c.cookie=r.headers.get('set-cookie').split(';')[0];c.csrf=r.data.csrfToken;c.workspaceId=r.data.workspaceId;return c};
  item.native=async workspaceId=>{const code=service.createPairingCode({workspaceId});const c=client();const r=await c.request('POST','session',{pairingCode:code.pairingCode},{Origin:undefined});assert.equal(r.status,200);c.token=r.data.sessionToken;c.workspaceId=r.data.workspaceId;return c};
  return item;
}
async function save(c,p=candidate,expectedRevision=0){const r=await c.request('PUT','profile',{expectedRevision,profile:p});assert.equal(r.status,200,JSON.stringify(r.data));return r.data.profile}
async function job(c,n){const r=await c.request('POST','jobs',{url:postingURL(n)});assert.ok([200,201].includes(r.status),JSON.stringify(r.data));return r.data.job}
async function plan(c,jobIds,extra={}){const r=await c.request('POST','prepare',{jobIds,...extra});assert.equal(r.status,201,JSON.stringify(r.data));return r.data.plan}
async function submit(c,p){return c.request('POST','submit',{planId:p.id,digest:p.digest,approved:true})}
async function settled(c,planId){for(let i=0;i<100;i++){const r=await c.request('GET','workspace');assert.equal(r.status,200);if(!r.data.activePlanIds.includes(planId))return r.data;await new Promise(resolve=>setTimeout(resolve,20))}throw Error('Submission did not settle')}

try {
  const f=await fixture('main'),c=await f.browser();
  const status=await c.request('GET','status');check('test mode is explicit and never claims live enablement',()=>{assert.equal(status.data.mode,'test');assert.equal(status.data.liveEnabled,false)});
  check('blank workspace contains no personal defaults',()=>assert.equal(JSON.parse(fs.readFileSync(f.configPath)).connectors[0].site,'career-fixture'));
  let r=await c.request('GET','workspace');check('fresh profile is blank and revision zero',()=>{assert.equal(r.data.profile.revision,0);assert.equal(r.data.profile.firstName,'');assert.equal(r.data.jobs.length,0)});
  r=await c.request('POST','session',{}, {Origin:undefined});check('missing Origin cannot mint a browser session',()=>assert.equal(r.status,403));
  r=await c.request('POST','session',{}, {Origin:'https://attacker.example'});check('foreign Origin is rejected',()=>assert.equal(r.status,403));
  const hostStatus=await new Promise((resolve,reject)=>{const request=http.request(f.origin+'/api/apply/status',{headers:{Host:'attacker.example'}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode))});request.on('error',reject);request.end()});check('DNS rebinding Host is rejected',()=>assert.equal(hostStatus,403));
  r=await c.request('PUT','profile',{expectedRevision:0,profile:candidate},{'X-Career-CSRF':'wrong'});check('wrong CSRF cannot mutate profile',()=>assert.equal(r.status,403));
  r=await c.request('PUT','profile',{expectedRevision:0,profile:{...candidate,verified:true}});check('client-supplied verification field rejected',()=>assert.equal(r.status,422));
  const saved=await save(c);check('résumé saved as bytes but not returned to UI',()=>{assert.equal(saved.resume.size,pdf.length);assert.equal(saved.resume.dataBase64,undefined);assert.equal(saved.revision,1)});
  r=await c.request('PUT','profile',{expectedRevision:0,profile:candidate});check('stale profile revision cannot overwrite newer profile',()=>assert.equal(r.status,409));
  const j=await job(c,1);r=await c.request('POST','jobs',{url:postingURL(1)+'/apply?utm_source=test'});check('canonical Lever URLs share one opportunity identity',()=>assert.equal(r.data.job.id,j.id));
  const p=await plan(c,[j.id]);check('preparation reviews exact fields without sending',()=>{assert.equal(p.items[0].state,'ready');assert.equal(p.items[0].payloadSummary.name,'Amina Example');assert.equal(p.items[0].resume.sha256,saved.resume.sha256);assert.equal(counts.get(1),undefined)});
  r=await c.request('POST','submit',{planId:p.id,digest:'wrong',approved:true});check('unmatched approval digest cannot dispatch',()=>assert.equal(r.status,409));
  const race=await Promise.all([submit(c,p),submit(c,p)]);await settled(c,p.id);
  check('two simultaneous approval clicks send exactly once',()=>{assert.ok(race.every(x=>x.status===202));assert.equal(counts.get(1),1)});
  r=await c.request('GET','workspace');const confirmed=r.data.attempts.find(a=>a.planId===p.id);check('only provider receipt becomes confirmed',()=>{assert.equal(confirmed.state,'confirmed');assert.equal(confirmed.applicationId,'test-application-1');assert.equal(confirmed.mode,'test');assert.ok(confirmed.responseSHA256);assert.ok(confirmed.resumeSHA256)});
  check('real multipart includes exact PDF bytes and key remains server-side',()=>{const q=requests.find(x=>x.n===1);assert.match(q.contentType,/multipart\/form-data; boundary=/);assert.ok(q.body.includes(pdf));assert.match(q.body.toString(),/name="resume"; filename="Fixture-CV.pdf"/);assert.equal(q.key,'fixture-key-never-real')});
  r=await submit(c,p);check('repeated completed plan returns existing evidence without resending',()=>{assert.equal(r.status,200);assert.equal(counts.get(1),1)});
  r=await c.request('GET','receipts');check('receipt export excludes keys, tokens and PDF bytes',()=>{const s=JSON.stringify(r.data);assert.ok(!s.includes('fixture-key-never-real'));assert.ok(!s.includes(cv.dataBase64));assert.ok(!s.includes(c.csrf));assert.ok(s.includes('test-application-1'))});
  const dup=await plan(c,[j.id]);check('confirmed same-applicant posting is blocked in a new plan',()=>assert.equal(dup.items[0].state,'blocked'));
  const c2=await f.browser();await save(c2);const j2=await job(c2,1);const copy=await plan(c2,[j2.id]);check('copied profile email cannot bypass duplicate protection',()=>assert.equal(copy.items[0].state,'blocked'));
  r=await c2.request('GET','workspace');check('workspaces do not expose another applicant’s receipts',()=>assert.equal(r.data.attempts.length,0));
  await save(c,{...candidate,email:'changed@example.com'},1);const changed=await plan(c,[j.id]);check('changing email cannot erase same-workspace application history',()=>assert.equal(changed.items[0].state,'blocked'));
  for(const [n,scenario] of [[2,'no-receipt'],[3,'server-error'],[4,'timeout'],[6,'rejected'],[7,'redirect'],[8,'html'],[9,'false-ok']]) {
    scenarios.set(n,scenario);const jj=await job(c,n),pp=await plan(c,[jj.id]);await submit(c,pp);const state=(await settled(c,pp.id)).attempts.find(a=>a.planId===pp.id);
    check(`${scenario} response has honest outcome`,()=>{assert.equal(state.state,scenario==='rejected'?'rejected':'uncertain');assert.equal(state.applicationId,undefined);assert.ok(!JSON.stringify(state).includes('fixture-key-never-real'))});
    const before=counts.get(n);await submit(c,pp);check(`${scenario} is not blindly retried`,()=>assert.equal(counts.get(n),before));
  }
  let clockTime=Date.now();const fr=await fixture('cooldown',{clock:()=>clockTime}),cr=await fr.browser();await save(cr,{...candidate,email:'rate@example.com'});scenarios.set(5,'rate-limit');const jr=await job(cr,5),pr=await plan(cr,[jr.id]);await submit(cr,pr);let wr=await settled(cr,pr.id);
  check('429 saves rate-limited state and explicit cooldown',()=>{assert.equal(wr.attempts[0].state,'rate_limited');assert.ok(wr.attempts[0].retryAt);assert.equal(counts.get(5),1)});
  const reloadedPhone=await fr.native(cr.workspaceId),reloadedReview=(await reloadedPhone.request('GET','workspace')).data.recoverablePlans.find(value=>value.id===pr.id);
  check('a reauthenticated phone recovers the exact approved429 review without sending',()=>{assert.equal(reloadedReview.digest,pr.digest);assert.equal(reloadedReview.items[0].state,'rate_limited');assert.ok(reloadedReview.approvedAt);assert.equal(reloadedReview.items[0].retryAt,wr.attempts[0].retryAt);assert.equal(counts.get(5),1)});
  const unrelatedPhone=await fr.native(),unrelatedWorkspace=await unrelatedPhone.request('GET','workspace');check('recoverable reviews remain private to their workspace',()=>assert.deepEqual(unrelatedWorkspace.data.recoverablePlans,[]));
  const duplicateRate=await plan(cr,[jr.id]);check('new plans cannot bypass a provider cooldown',()=>assert.equal(duplicateRate.items[0].state,'blocked'));
  r=await submit(cr,pr);check('429 retry before cooldown is denied',()=>assert.equal(r.status,409));clockTime+=1500;await submit(cr,pr);wr=await settled(cr,pr.id);check('429 retry after cooldown uses same approved attempt',()=>{assert.equal(wr.attempts[0].state,'confirmed');assert.equal(wr.attempts.length,1);assert.equal(counts.get(5),2)});
  scenarios.set(20,'rate-limit');const expiredRateJob=await job(cr,20),expiredRatePlan=await plan(cr,[expiredRateJob.id]);await submit(cr,expiredRatePlan);await settled(cr,expiredRatePlan.id);clockTime+=31*60000;const freshRatePlan=await plan(cr,[expiredRateJob.id]);check('expired rate-limited review can be replaced after its cooldown',()=>{assert.equal(freshRatePlan.items[0].state,'ready');assert.equal(counts.get(20),1)});await submit(cr,freshRatePlan);const replacementState=await settled(cr,freshRatePlan.id);check('replacement needs a fresh approval and preserves prior rejection evidence',()=>{assert.equal(replacementState.attempts.find(a=>a.planId===expiredRatePlan.id).state,'cancelled');assert.equal(replacementState.attempts.find(a=>a.planId===freshRatePlan.id).state,'confirmed');assert.equal(counts.get(20),2)});
  scenarios.set(21,'rate-limit');const stoppedRateJob=await job(cr,21),stoppedRatePlan=await plan(cr,[stoppedRateJob.id]);await submit(cr,stoppedRatePlan);await settled(cr,stoppedRatePlan.id);await cr.request('POST','stop',{planId:stoppedRatePlan.id});const bypassedRatePlan=await plan(cr,[stoppedRateJob.id]);check('stopping a429 retry cannot bypass the provider cooldown',()=>{assert.equal(bypassedRatePlan.items[0].state,'blocked');assert.match(bypassedRatePlan.items[0].reason,/cooldown remains active/);assert.equal(counts.get(21),1)});clockTime+=1500;const afterStoppedCooldown=await plan(cr,[stoppedRateJob.id]);check('a stopped429 attempt permits a fresh review after cooldown',()=>{assert.equal(afterStoppedCooldown.items[0].state,'ready');assert.equal(counts.get(21),1)});
  const j10=await job(c,10),p10=await plan(c,[j10.id]);r=await c.request('GET','workspace');check('unsent current reviews are recoverable after reload',()=>assert.ok(r.data.recoverablePlans.some(value=>value.id===p10.id&&value.digest===p10.digest)));await save(c,{...candidate,email:'changed@example.com',headline:'Updated headline'},2);r=await submit(c,p10);check('profile changes invalidate existing approval',()=>{assert.equal(r.status,409);assert.equal(counts.get(10),undefined)});r=await c.request('GET','workspace');check('outdated profile reviews are excluded from recovery',()=>assert.ok(!r.data.recoverablePlans.some(value=>value.id===p10.id)));
  const j11=await job(c,11),p11=await plan(c,[j11.id]);r=await c.request('POST','stop',{planId:p11.id});await submit(c,p11);check('stop before dispatch sends nothing',()=>{assert.equal(r.status,200);assert.equal(r.data.attempts[0].state,'cancelled');assert.equal(counts.get(11),undefined)});
  r=await c.request('GET','workspace');check('stopped reviews are excluded from recovery',()=>assert.ok(!r.data.recoverablePlans.some(value=>value.id===p11.id)));
  const j12=await job(c,12),p12=await plan(c,[j12.id]);changedTitle=true;await submit(c,p12);const w12=await settled(c,p12.id);changedTitle=false;check('changed employer posting invalidates approval before POST',()=>{assert.equal(w12.attempts.find(a=>a.planId===p12.id).state,'blocked');assert.equal(counts.get(12),undefined)});
  const manual=await c.request('POST','jobs',{url:'https://example.org/jobs/customer-service',title:'Customer service adviser',company:'Example',country:'GB',location:'London'});check('any profession/country can be tracked manually',()=>{assert.equal(manual.status,201);assert.equal(manual.data.job.country,'GB');assert.equal(manual.data.job.submissionSupported,false)});
  const mp=await plan(c,[manual.data.job.id]);check('manual-only employer cannot be mislabeled automatic',()=>assert.equal(mp.items[0].state,'blocked'));
  const jm=await job(c,13),pm=await plan(c,[jm.id],{manualAppliedJobIds:[jm.id]});check('existing manually recorded application requires reconciliation',()=>assert.equal(pm.items[0].state,'blocked'));
  const cn=await f.native(c.workspaceId);r=await cn.request('GET','workspace');check('phone pairing opens the intended workspace',()=>{assert.equal(r.status,200);assert.equal(r.data.profile.email,'changed@example.com')});
  const nativeNew=await f.native();r=await nativeNew.request('GET','workspace');check('new phone workspace starts blank',()=>{assert.equal(r.data.profile.revision,0);assert.equal(r.data.profile.email,'')});
  await save(nativeNew,{...candidate,email:'mobile@example.com'});check('valid bearer authorizes profile change without Origin/CSRF',()=>assert.ok(nativeNew.token));
  const oneCode=f.service.createPairingCode();const nc=f.client();r=await nc.request('POST','session',{pairingCode:oneCode.pairingCode},{Origin:undefined});assert.equal(r.status,200);r=await nc.request('POST','session',{pairingCode:oneCode.pairingCode},{Origin:undefined});check('mobile pairing code is single-use',()=>assert.equal(r.status,401));
  const db=new DatabaseSync(path.join(f.dir,'applications.sqlite'));const stored=db.prepare('SELECT token_hash FROM native_sessions').all();check('native tokens stored only as hashes',()=>assert.ok(stored.every(row=>row.token_hash!==cn.token&&row.token_hash!==nativeNew.token)));
  db.prepare('UPDATE native_sessions SET expires_at=? WHERE workspace_id=?').run('2020-01-01T00:00:00.000Z',nativeNew.workspaceId);r=await nativeNew.request('GET','workspace');check('expired mobile token is refused',()=>assert.equal(r.status,401));db.close();
  const c3=await f.browser();r=await c3.request('GET','workspace',undefined,{Authorization:'Bearer invalid'});check('invalid Bearer cannot fall back to a browser cookie',()=>assert.equal(r.status,401));
  const mobileClock={time:Date.now()},fm=await fixture('mobile-auth',{clock:()=>mobileClock.time}),cm=fm.client();
  const expiredCode=fm.service.createPairingCode();mobileClock.time+=5*60000+1;r=await cm.request('POST','session',{pairingCode:expiredCode.pairingCode},{Origin:undefined});check('pairing code expires after five minutes',()=>assert.equal(r.status,401));
  for(let i=0;i<4;i++)await cm.request('POST','session',{pairingCode:'AAAA-AAAA-AAAA-AAAA'},{Origin:undefined});
  r=await cm.request('POST','session',{pairingCode:'AAAA-AAAA-AAAA-AAAA'},{Origin:undefined});check('pairing redemption is rate limited',()=>assert.equal(r.status,429));
  mobileClock.time+=60001;const revocable=await fm.native();r=await revocable.request('POST','session/revoke',{});assert.equal(r.status,200);r=await revocable.request('GET','workspace');check('mobile token can be revoked without deleting application records',()=>assert.equal(r.status,401));
  check('same ledger refuses a second service owner',()=>assert.throws(()=>createApplicationService(f.options),/already owns/));
  const fp=await fixture('failure-before-dispatch',{hooks:{beforeDispatchCommit(){throw Error('disk write refused')}}}),cp=await fp.browser();await save(cp,{...candidate,email:'persist@example.com'});const jp=await job(cp,14),pp=await plan(cp,[jp.id]);await submit(cp,pp);const wp=await settled(cp,pp.id);check('failed durable intent produces zero outbound POSTs',()=>{assert.equal(counts.get(14),undefined);assert.equal(wp.attempts[0].state,'blocked')});
  const fa=await fixture('failure-after-response',{hooks:{beforeResultCommit(){throw Error('result storage failed')}}}),ca=await fa.browser();await save(ca,{...candidate,email:'result@example.com'});const ja=await job(ca,15),pa=await plan(ca,[ja.id]);await submit(ca,pa);const wa=await settled(ca,pa.id);check('result-save failure never reports durable confirmation',()=>{assert.equal(counts.get(15),1);assert.equal(wa.attempts[0].state,'uncertain');assert.equal(wa.attempts[0].applicationId,undefined)});
  const fq=await fixture('unknown-requirements',{configOverride(c){c.connectors[0].postings[postingID(16)].hasCustomQuestions=true;c.connectors[0].postings[postingID(17)].expiresAt=new Date(Date.now()-1000).toISOString();c.connectors[0].postings[postingID(17)].reviewedAt=new Date(Date.now()-60000).toISOString()}}),cq=await fq.browser();await save(cq,{...candidate,email:'questions@example.com'});
  for(const n of [16,17]){const jj=await job(cq,n),pp=await plan(cq,[jj.id]);check(n===16?'custom questions block automatic submission':'expired requirements block automatic submission',()=>assert.equal(pp.items[0].state,'blocked'))}
  r=await cq.request('POST','jobs',{url:`https://jobs.eu.lever.co/career-fixture/${postingID(18)}`});const euPlan=await plan(cq,[r.data.job.id]);check('EU posting never uses a global employer key',()=>assert.equal(euPlan.items[0].state,'blocked'));
  check('invalid résumé paths and content rejected',()=>{assert.throws(()=>validateProfile({...candidate,resume:{...cv,name:'../resume.pdf'}}));assert.throws(()=>validateProfile({...candidate,resume:{...cv,dataBase64:Buffer.from('not a PDF').toString('base64')}}));assert.throws(()=>validateProfile({...candidate,resume:{...cv,mime:'text/html'}}))});
  check('private/custom URLs rejected without arbitrary fetch',()=>{for(const u of ['http://example.com/job','https://127.0.0.1/job','https://user:pass@example.com/job','https://example.com:8443/job','https://host.local/job'])assert.throws(()=>publicURL(u));assert.equal(leverTarget(postingURL(1)+'/apply?a=b').key,leverTarget(postingURL(1)).key)});
  const ma=await c.request('POST','jobs',{url:'https://example.org/jobs?id=alpha',title:'Designer',company:'Example'}),mb=await c.request('POST','jobs',{url:'https://example.org/jobs?id=beta',title:'Designer',company:'Example'});check('manual jobs preserve meaningful query identity',()=>assert.notEqual(ma.data.job.id,mb.data.job.id));
  check('country selection includes global regions beyond the legacy scope',()=>{for(const code of ['AW','MG','US','GB','SA','XK'])assert.equal(country(code),code)});
  check('all supported test storage is private',()=>{assert.equal(fs.statSync(f.dir).mode&0o777,0o700);assert.equal(fs.statSync(path.join(f.dir,'applications.sqlite')).mode&0o777,0o600)});
  // Crash recovery: only manipulate this isolated synthetic ledger after closing its owner.
  const recovery=await fixture('recovery'),recoveryClient=await recovery.browser();await save(recoveryClient,{...candidate,email:'recovery@example.com'});const recoveryJob=await job(recoveryClient,19),recoveryPlan=await plan(recoveryClient,[recoveryJob.id]);await recovery.service.close();
  const rd=new DatabaseSync(path.join(recovery.dir,'applications.sqlite'));rd.prepare("UPDATE attempts SET state='dispatching',dispatched_at=? WHERE plan_id=?").run(new Date().toISOString(),recoveryPlan.id);rd.close();
  const restarted=createApplicationService(recovery.options);const verifyDB=new DatabaseSync(path.join(recovery.dir,'applications.sqlite'));const recovered=verifyDB.prepare('SELECT state,error_code FROM attempts WHERE plan_id=?').get(recoveryPlan.id);verifyDB.close();check('restart converts interrupted dispatch to uncertainty without POST',()=>{assert.equal(recovered.state,'uncertain');assert.equal(recovered.error_code,'service_restarted');assert.equal(counts.get(19),undefined)});await restarted.close();
  serviceInstances.splice(serviceInstances.indexOf(recovery),1);recovery.server.closeAllConnections();recovery.server.close();await once(recovery.server,'close');
  console.log(`PASS: ${checks} verified-application regression groups (real HTTP against synthetic local Lever only).`);
} finally {
  for(const instance of serviceInstances.reverse()){try{await instance.close()}catch{}}
  mock.closeAllConnections();mock.close();await once(mock,'close');
  fs.rmSync(temp,{recursive:true,force:true});
}
