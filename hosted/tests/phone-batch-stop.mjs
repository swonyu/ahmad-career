import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const directory=await mkdtemp(join(tmpdir(),'career-phone-batch-stop-'));
after(()=>rm(directory,{recursive:true,force:true}));
await build({entryPoints:['app/phone/batch-stop.ts'],outfile:join(directory,'stop.mjs'),bundle:true,platform:'node',format:'esm'});
const {stopBatchOnce}=await import(pathToFileURL(join(directory,'stop.mjs')).href);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function fixture(){
  const job={id:id(1),url:`https://jobs.lever.co/fixture/${id(1)}`,title:'Synthetic role',company:'Fixture',location:'',country:''};
  const plan={id:id(2),digest:'a'.repeat(64),profileRevision:1,createdAt:'2026-01-01T00:00:00.000Z',expiresAt:'2999-01-01T00:00:00.000Z',approvedAt:'2026-01-01T00:00:00.000Z',stopped:true,items:[{jobId:job.id,job,title:job.title,company:job.company,state:'cancelled',reason:'Stopped',payloadSummary:{name:'Synthetic',email:'synthetic@example.com',phone:'',website:'',comments:''},resume:null,privacyPolicyUrl:null,requirementsRevision:null,retryAt:null}]};
  const current={accountId:'synthetic-owner',workspaceId:id(3)};
  const batch={generation:7,scope:'synthetic-scope',accountId:current.accountId,workspaceId:current.workspaceId,planId:plan.id,stopAttempted:false};
  const state={generation:7,workspace:{...current},identityUnverified:false};
  const calls={posts:[],accepts:0,deferrals:0,holds:0,confirmations:0};
  const response={ok:true,plan};
  const controls={readState:()=>state,persistHold:async()=>{calls.holds++},confirmHold:async()=>{calls.confirmations++},post:async body=>{assert.equal(batch.stopAttempted,true);assert.equal(batch.stopConfirmed,false);calls.posts.push(structuredClone(body));return response},accept:async()=>{calls.accepts++;return{...current,refreshed:true}},deferRefresh:()=>{calls.deferrals++}};
  return{job,plan,current,batch,state,calls,response,controls};
}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}

test('captured batch Stop survives interruption without a duplicate or stale target',async t=>{
  await t.test('one confirmed Stop uses only captured target fields and shares its result',async()=>{
    const f=fixture(),result=await stopBatchOnce(f.batch,f.current,f.controls);assert.equal(result.refreshed,true);assert.equal(f.batch.stopConfirmed,true);
    assert.deepEqual(f.calls.posts,[{expectedWorkspaceId:f.batch.workspaceId,planId:f.batch.planId,onlyIfUnapproved:false}]);assert.equal(f.calls.accepts,1);
    assert.deepEqual(await stopBatchOnce(f.batch,f.current,f.controls),result);assert.equal(f.calls.posts.length,1);assert.equal(f.calls.accepts,1);
  });
  await t.test('an unverified identity curtain does not block the captured Stop or reveal its response',async()=>{
    const f=fixture();f.state.identityUnverified=true;const result=await stopBatchOnce(f.batch,f.current,f.controls);
    assert.equal(result,f.current);assert.equal(f.calls.posts.length,1);assert.equal(f.calls.accepts,0);assert.equal(f.calls.deferrals,1);assert.equal(f.batch.stopConfirmed,true);
  });
  await t.test('a curtain raised during the request defers response adoption',async()=>{
    const f=fixture(),pending=deferred();f.controls.post=async body=>{f.calls.posts.push(body);return pending.promise};const task=stopBatchOnce(f.batch,f.current,f.controls);
    f.state.identityUnverified=true;pending.resolve(f.response);assert.equal(await task,f.current);assert.equal(f.calls.accepts,0);assert.equal(f.calls.deferrals,1);assert.equal(f.batch.stopConfirmed,true);
  });
  await t.test('stale epochs, missing identity and changed owners are rejected before any POST',async()=>{
    for(const mutate of [f=>{f.state.generation++},f=>{f.state.workspace=null},f=>{f.state.workspace.accountId='another-owner'},f=>{f.state.workspace.workspaceId=id(99)}]){
      const f=fixture();mutate(f);await assert.rejects(stopBatchOnce(f.batch,f.current,f.controls),/changed before Stop/);assert.equal(f.batch.stopAttempted,false);assert.equal(f.calls.posts.length,0);assert.equal(f.calls.accepts,0);
    }
  });
  await t.test('the displayed workspace cannot retarget a captured batch',async()=>{
    const f=fixture();await assert.rejects(stopBatchOnce(f.batch,{...f.current,workspaceId:id(99)},f.controls),/different workspace/);assert.equal(f.calls.posts.length,0);
  });
  await t.test('an epoch or owner change while POST is pending never adopts or refreshes stale UI',async()=>{
    for(const mutate of [f=>{f.state.generation++},f=>{f.state.workspace.accountId='another-owner'},f=>{f.state.workspace.workspaceId=id(99)}]){
      const f=fixture(),pending=deferred();f.controls.post=async body=>{f.calls.posts.push(body);return pending.promise};const task=stopBatchOnce(f.batch,f.current,f.controls);await Promise.resolve();mutate(f);pending.resolve(f.response);
      await assert.rejects(task,/changed before Stop/);assert.equal(f.calls.posts.length,1);assert.equal(f.calls.accepts,0);assert.equal(f.calls.deferrals,0);assert.equal(f.batch.stopConfirmed,true);
    }
  });
  await t.test('concurrent helper and finalizer calls share one pending POST',async()=>{
    const f=fixture(),pending=deferred();f.controls.post=async body=>{f.calls.posts.push(body);return pending.promise};const first=stopBatchOnce(f.batch,f.current,f.controls),second=stopBatchOnce(f.batch,f.current,f.controls);
    await Promise.resolve();assert.equal(f.calls.posts.length,1);assert.equal(f.batch.stopConfirmed,false);pending.resolve(f.response);assert.deepEqual(await first,await second);assert.equal(f.calls.accepts,1);
  });
  await t.test('durable hold precedes transport and failed persistence never sends a request',async()=>{
    const f=fixture(),saved=deferred();f.controls.persistHold=()=>saved.promise;const task=stopBatchOnce(f.batch,f.current,f.controls);assert.equal(f.calls.posts.length,0);saved.resolve();await task;assert.equal(f.calls.posts.length,1);assert.equal(f.calls.confirmations,1);
    const failed=fixture();failed.controls.persistHold=async()=>{throw new Error('Synthetic full storage')};await assert.rejects(stopBatchOnce(failed.batch,failed.current,failed.controls),/full storage/);assert.equal(failed.calls.posts.length,0);assert.equal(failed.batch.stopConfirmed,false);
  });
  await t.test('owner change during durable hold prevents a stale Stop request',async()=>{
    const f=fixture(),saved=deferred();f.controls.persistHold=()=>saved.promise;const task=stopBatchOnce(f.batch,f.current,f.controls);f.state.workspace.accountId='another-owner';saved.resolve();await assert.rejects(task,/changed before Stop/);assert.equal(f.calls.posts.length,0);
  });
  await t.test('a lost response remains a failed attempt on every later call',async()=>{
    const f=fixture(),failure=new Error('Synthetic lost POST response');f.controls.post=async body=>{f.calls.posts.push(body);throw failure};
    await assert.rejects(stopBatchOnce(f.batch,f.current,f.controls),error=>error===failure);await assert.rejects(stopBatchOnce(f.batch,f.current,f.controls),error=>error===failure);
    assert.equal(f.calls.posts.length,1);assert.equal(f.batch.stopAttempted,true);assert.equal(f.batch.stopConfirmed,false);assert.equal(f.calls.accepts,0);
  });
  await t.test('synchronous transport failure is also attempted once',async()=>{
    const f=fixture(),failure=new Error('Synthetic synchronous transport error');f.controls.post=body=>{f.calls.posts.push(body);throw failure};
    for(let repeat=0;repeat<2;repeat++)await assert.rejects(stopBatchOnce(f.batch,f.current,f.controls),error=>error===failure);assert.equal(f.calls.posts.length,1);assert.equal(f.batch.stopConfirmed,false);
  });
  await t.test('confirmation requires a fully parsed exact plan with stopped=true',async()=>{
    for(const mutate of [f=>{f.plan.id=id(99)},f=>{f.plan.stopped=false},f=>{f.plan.items[0].state='unknown'},f=>{f.response.plan=null}]){
      const f=fixture();mutate(f);for(let repeat=0;repeat<2;repeat++)await assert.rejects(stopBatchOnce(f.batch,f.current,f.controls));assert.equal(f.calls.posts.length,1);assert.equal(f.batch.stopConfirmed,false);assert.equal(f.calls.accepts,0);
    }
  });
  await t.test('a successful Stop followed by failed readback stays confirmed but is never resent',async()=>{
    const f=fixture(),failure=new Error('Synthetic workspace readback failure');f.controls.accept=async()=>{f.calls.accepts++;throw failure};
    for(let repeat=0;repeat<2;repeat++)await assert.rejects(stopBatchOnce(f.batch,f.current,f.controls),error=>error===failure);assert.equal(f.calls.posts.length,1);assert.equal(f.calls.accepts,1);assert.equal(f.batch.stopConfirmed,true);
  });
  await t.test('a curtain raised during readback prevents returning newly fetched private data',async()=>{
    const f=fixture(),entered=deferred(),readback=deferred();f.controls.accept=async()=>{f.calls.accepts++;entered.resolve();return readback.promise};
    const task=stopBatchOnce(f.batch,f.current,f.controls);await entered.promise;f.state.identityUnverified=true;readback.resolve({...f.current,refreshed:true});
    assert.equal(await task,f.current);assert.equal(f.calls.deferrals,1);assert.equal(f.calls.posts.length,1);assert.equal(f.batch.stopConfirmed,true);
  });
  await t.test('stale or foreign readback results cannot be returned as the captured workspace',async()=>{
    for(const mutate of [f=>{f.state.generation++},f=>{}]){
      const f=fixture();f.controls.accept=async()=>{f.calls.accepts++;mutate(f);return{...f.current,workspaceId:id(99)}};await assert.rejects(stopBatchOnce(f.batch,f.current,f.controls));assert.equal(f.batch.stopConfirmed,true);assert.equal(f.calls.posts.length,1);
    }
  });
  await t.test('a previously confirmed cached result cannot be reused after an account change',async()=>{
    const f=fixture();await stopBatchOnce(f.batch,f.current,f.controls);f.state.workspace.accountId='another-owner';await assert.rejects(stopBatchOnce(f.batch,f.current,f.controls),/changed before Stop/);assert.equal(f.calls.posts.length,1);
  });
  await t.test('an already-attempted context without its promise cannot report false success or resend',async()=>{
    const f=fixture();f.batch.stopAttempted=true;for(let repeat=0;repeat<2;repeat++)await assert.rejects(stopBatchOnce(f.batch,f.current,f.controls),/already attempted/);assert.equal(f.calls.posts.length,0);assert.equal(f.batch.stopConfirmed,undefined);
  });
  await t.test('the finalizer can deliver a requested Stop after submission response loss',async()=>{
    const f=fixture(),submissionFailure=new Error('Synthetic submit response lost');let stopRequested=false;
    try{try{stopRequested=true;throw submissionFailure}finally{if(stopRequested&&!f.batch.stopAttempted)await stopBatchOnce(f.batch,f.current,f.controls)}}catch(error){assert.equal(error,submissionFailure)}
    assert.equal(f.calls.posts.length,1);assert.equal(f.batch.stopConfirmed,true);
  });
});
