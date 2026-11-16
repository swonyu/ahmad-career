import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import {startTLSFixture} from './tls-fixture.mjs';

const runtimeDir=fs.mkdtempSync(path.join(os.tmpdir(),'career-tls-check-'));
const fixture=await startTLSFixture({runtimeDir,port:Number(process.env.CAREER_TLS_CHECK_PORT??4943),mockPort:Number(process.env.CAREER_TLS_CHECK_MOCK_PORT??4944)});
let checks=0;
const check=(name,fn)=>{fn();checks++;console.log('PASS '+name)};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Standard TLS chain + hostname validation for local host loopback. Android uses its
// 10.0.2.2 host alias directly, with the same certificate and exact HTTP Host.
const request=(method,route,body,{token,trust=true,host=new URL(fixture.origin).host}={})=>new Promise((resolve,reject)=>{
  const encoded=body===undefined?undefined:JSON.stringify(body);
  const req=https.request({hostname:'127.0.0.1',servername:'',port:new URL(fixture.origin).port,path:'/api/apply/'+route,method,...(trust?{ca:fs.readFileSync(fixture.caPath)}:{}),headers:{Host:host,Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(encoded?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(encoded)}:{})}},res=>{
    const parts=[];res.on('data',part=>parts.push(part));res.on('end',()=>{try{resolve({status:res.statusCode,data:JSON.parse(Buffer.concat(parts).toString())})}catch(error){reject(error)}});
  });
  req.on('error',reject);req.setTimeout(5000,()=>req.destroy(new Error('TLS fixture request timed out.')));req.end(encoded);
});
const api=token=>({request:(method,route,body)=>request(method,route,body,{token})});
async function completed(client,planId) {
  for(let i=0;i<100;i++){const response=await client.request('GET','workspace');assert.equal(response.status,200);if(!response.data.activePlanIds.includes(planId))return response.data;await pause(50)}
  throw new Error('Synthetic application did not settle.');
}
async function prepare(client,name) {
  const imported=await client.request('POST','jobs',{url:fixture.jobs[name]});assert.equal(imported.status,201);
  const jobId=imported.data.job.id;
  const response=await client.request('POST','prepare',{jobIds:[jobId],answers:{[jobId]:{comments:'Synthetic native TLS acceptance only.',consentMarketing:false}}});assert.equal(response.status,201);assert.equal(response.data.plan.items[0].state,'ready');return response.data.plan;
}
const submit=(client,plan)=>client.request('POST','submit',{planId:plan.id,digest:plan.digest,approved:true});
try {
  await assert.rejects(()=>request('GET','status',undefined,{trust:false}));check('untrusted fixture certificate is rejected without changing system trust',()=>{});
  let response=await request('GET','status',undefined,{host:'attacker.example'});check('TLS does not weaken exact Host checks',()=>assert.equal(response.status,403));
  response=await request('POST','session',{});check('HTTPS cannot mint anonymous browser workspaces',()=>assert.equal(response.status,403));
  response=await request('POST','session',{pairingCode:fixture.pairingCode});assert.equal(response.status,200);
  const workspaceId=response.data.workspaceId,client=api(response.data.sessionToken);
  const saved=await client.request('PUT','profile',{expectedRevision:0,profile:{firstName:'Amina',lastName:'',email:'native-tls@example.com',country:'SA',resume:fixture.resume}});
  check('native bearer profile and actual PDF traverse trusted TLS',()=>{assert.equal(saved.status,200);assert.equal(saved.data.profile.revision,1);assert.ok(saved.data.profile.resume.sha256);assert.equal(saved.data.profile.resume.dataBase64,undefined)});
  const plan=await prepare(client,'success');check('review over TLS contains the single name and explicit marketing No',()=>{assert.equal(plan.items[0].payloadSummary.name,'Amina');assert.equal(plan.items[0].payloadSummary.consentMarketing,false)});
  response=await submit(client,plan);assert.equal(response.status,202);let workspace=await completed(client,plan.id),receipt=workspace.attempts.find(a=>a.planId===plan.id);
  check('real multipart submission returns a visibly synthetic durable receipt',()=>{assert.equal(receipt.state,'confirmed');assert.equal(receipt.evidenceMode,'test');assert.equal(receipt.dispatchCount,1);assert.ok(receipt.applicationId.startsWith('test-application-'))});
  await submit(client,plan);let observations=await fixture.observations();const successId=fixture.jobs.success.split('/').at(-1);
  check('review replay sends one provider POST and includes actual PDF bytes',()=>{assert.equal(observations.counts[successId],1);const event=observations.observations.find(value=>value.id===successId);assert.equal(event.multipart,true);assert.equal(event.hasPDFBytes,true)});
  const timeoutPlan=await prepare(client,'timeout');await submit(client,timeoutPlan);workspace=await completed(client,timeoutPlan.id);
  check('a provider timeout preserves uncertainty without a fabricated receipt',()=>{const attempt=workspace.attempts.find(a=>a.planId===timeoutPlan.id);assert.equal(attempt.state,'uncertain');assert.equal(attempt.applicationId,undefined)});
  const pairing=fixture.service.createPairingCode({workspaceId});response=await request('POST','session',{pairingCode:pairing.pairingCode});assert.equal(response.status,200);const reloaded=api(response.data.sessionToken);
  workspace=(await reloaded.request('GET','workspace')).data;await submit(reloaded,timeoutPlan);observations=await fixture.observations();
  check('a newly paired phone recovers uncertain evidence and cannot replay the POST',()=>{assert.equal(workspace.workspaceId,workspaceId);assert.equal(workspace.attempts.find(a=>a.planId===timeoutPlan.id).state,'uncertain');assert.equal(observations.counts[fixture.jobs.timeout.split('/').at(-1)],1)});
  const cooldownPlan=await prepare(reloaded,'cooldown');await submit(reloaded,cooldownPlan);workspace=await completed(reloaded,cooldownPlan.id);
  const recovered=workspace.recoverablePlans.find(value=>value.id===cooldownPlan.id);
  check('approved cooldown review is recoverable with its exact digest',()=>{assert.equal(recovered.digest,cooldownPlan.digest);assert.equal(recovered.items[0].state,'rate_limited');assert.ok(recovered.items[0].retryAt)});
  response=await submit(reloaded,recovered);assert.equal(response.status,409);
  await pause(Math.max(0,Date.parse(recovered.items[0].retryAt)-Date.now())+30);await submit(reloaded,recovered);workspace=await completed(reloaded,recovered.id);
  check('cooldown needs a new explicit continuation and preserves one attempt',()=>{const attempt=workspace.attempts.find(a=>a.planId===recovered.id);assert.equal(attempt.state,'confirmed');assert.equal(attempt.dispatchCount,2);assert.equal(workspace.attempts.filter(a=>a.planId===recovered.id).length,1)});
  response=await reloaded.request('GET','receipts');check('TLS receipt export remains labeled test and excludes PDF bytes',()=>{assert.equal(response.status,200);assert.equal(response.data.mode,'test');assert.equal(response.data.receipts.length,3);assert.ok(!JSON.stringify(response.data).includes(fixture.resume.dataBase64))});
  console.log(JSON.stringify({result:'passed',checks,transport:'HTTPS with explicit isolated CA and normal hostname validation',mode:'test',providerPosts:(await fixture.observations()).counts}));
} finally {await fixture.close();fs.rmSync(runtimeDir,{recursive:true,force:true})}
