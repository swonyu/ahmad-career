import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const directory=await mkdtemp(join(tmpdir(),'career-phone-dispatch-'));
after(()=>rm(directory,{recursive:true,force:true}));
await build({entryPoints:['app/phone/dispatch.ts'],outfile:join(directory,'dispatch.mjs'),bundle:true,platform:'node',format:'esm'});
const {continueApprovedPlan}=await import(pathToFileURL(join(directory,'dispatch.mjs')).href);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,planId=id(900),workspaceId=id(901);
const past='2020-01-01T00:00:00.000Z',future='2999-01-01T00:00:00.000Z';
const profile={firstName:'Synthetic',lastName:'',email:'synthetic@example.com',phone:'',city:'',country:'',headline:'',skills:[],targetRoles:[],targetCountries:[],workModes:[],experienceLevel:'any',website:'',linkedin:'',resume:null,revision:1};
function fixture(count=1){
  const jobs=Array.from({length:count},(_,index)=>({id:id(index+1),title:'Synthetic '+index,company:'Fixture',url:`https://jobs.lever.co/fixture/${id(index+1)}`,location:'',country:''}));
  const plan={id:planId,digest:'a'.repeat(64),profileRevision:1,createdAt:past,expiresAt:future,approvedAt:past,stopped:false,items:jobs.map(job=>({jobId:job.id,job:{...job},title:job.title,company:job.company,state:'ready',reason:'',payloadSummary:{name:'Synthetic',email:profile.email,phone:'',website:'',comments:'',consentStore:true,consentMarketing:false},resume:null,privacyPolicyUrl:null,requirementsRevision:'synthetic-v1',retryAt:null}))};
  return{ok:true,accountId:'synthetic-owner',accountEmail:profile.email,confirmedEmail:profile.email,emailUpdateRequired:false,deleting:false,workspaceId,mode:'test',profile:{...profile},jobs,attempts:jobs.map((job,index)=>({id:id(index+100),planId,jobId:job.id,title:job.title,company:job.company,url:job.url,state:'ready',createdAt:past,mode:'test',evidenceMode:'test',error:null,dispatchCount:0})),capabilities:{liveEnabled:false,mode:'test',coverage:'Synthetic only'},recoverablePlans:[plan],activePlanIds:[planId]};
}
function outcome(workspace,index,state='confirmed',retryAt){
  const next=structuredClone(workspace),plan=next.recoverablePlans[0],item=plan.items[index],attempt=next.attempts.find(value=>value.jobId===item.jobId);
  item.state=state;item.retryAt=retryAt??null;attempt.state=state;attempt.dispatchCount++;
  if(retryAt)attempt.retryAt=retryAt;else delete attempt.retryAt;
  if(state==='confirmed'){item.applicationId='synthetic-'+index;attempt.applicationId=item.applicationId}
  if(!plan.items.some(value=>['ready','rate_limited'].includes(value.state)))next.recoverablePlans=[];
  if(!plan.items.some(value=>value.state==='ready'||value.state==='dispatching'))next.activePlanIds=[];
  return next;
}
function controls(overrides={}){
  return{advance:async()=>{throw Error('Unexpected advance')},stop:async current=>({...current,recoverablePlans:[],activePlanIds:[]}),validate:()=>{},isVisible:()=>true,shouldStop:()=>false,...overrides};
}
async function paced(action,onPace=()=>{}){
  const original=globalThis.setTimeout,delays=[];
  globalThis.setTimeout=(callback,delay,...args)=>{if(delay===1000){delays.push(delay);onPace(delays.length);return original(callback,0,...args)}return original(callback,delay,...args)};
  try{return{value:await action(),delays}}finally{globalThis.setTimeout=original}
}

test('approved phone continuation is bounded, owner-bound and never grants approval',async t=>{
  await t.test('one explicit run processes a batch with fresh validation and pacing',async()=>{
    const initial=fixture(3),before=structuredClone(initial);let calls=0,validations=0;
    const {value,delays}=await paced(()=>continueApprovedPlan(initial,planId,controls({validate:current=>{assert.equal(current.attempts.filter(row=>row.state==='confirmed').length,calls);validations++},advance:async current=>outcome(current,calls++)})));
    assert.equal(value.reason,'complete');assert.equal(calls,3);assert.equal(validations,3);assert.deepEqual(delays,[1000,1000]);assert.deepEqual(initial,before);assert.ok(value.workspace.attempts.every(row=>row.state==='confirmed'));
  });
  await t.test('at most twenty advances run even if changing responses remain authorized',async()=>{
    let calls=0;const {value,delays}=await paced(()=>continueApprovedPlan(fixture(20),planId,controls({advance:async current=>{const next=outcome(current,calls++,'rate_limited',past);next.activePlanIds=[planId];return next}})));
    assert.equal(calls,20);assert.equal(delays.length,19);assert.equal(value.reason,'limit');
  });
  await t.test('a hidden page never starts a step and pauses after an in-flight step',async()=>{
    assert.equal((await continueApprovedPlan(fixture(),planId,controls({isVisible:()=>false}))).reason,'paused');
    let visible=true,calls=0;const result=await continueApprovedPlan(fixture(2),planId,controls({isVisible:()=>visible,advance:async current=>{calls++;visible=false;return outcome(current,0)}}));assert.equal(result.reason,'paused');assert.equal(calls,1);
  });
  await t.test('explicit Stop wins over visibility and is sent once without another advance',async()=>{
    let stopped=0;const result=await continueApprovedPlan(fixture(),planId,controls({isVisible:()=>false,shouldStop:()=>true,stop:async current=>{stopped++;return{...current,activePlanIds:[],recoverablePlans:[]}}}));assert.equal(result.reason,'stopped');assert.equal(stopped,1);
    let intent=false,calls=0;stopped=0;const after=await continueApprovedPlan(fixture(2),planId,controls({shouldStop:()=>intent,advance:async current=>{calls++;intent=true;return outcome(current,0)},stop:async current=>{stopped++;return{...current,activePlanIds:[],recoverablePlans:[]}}}));assert.equal(after.reason,'stopped');assert.equal(calls,1);assert.equal(stopped,1);
  });
  await t.test('Stop and visibility are rechecked after pacing',async()=>{
    let intent=false,calls=0,stops=0;
    const stopped=await paced(()=>continueApprovedPlan(fixture(2),planId,controls({shouldStop:()=>intent,advance:async current=>outcome(current,calls++),stop:async current=>{stops++;return{...current,activePlanIds:[],recoverablePlans:[]}}})),()=>{intent=true});
    assert.equal(stopped.value.reason,'stopped');assert.equal(calls,1);assert.equal(stops,1);
    let visible=true;calls=0;const hidden=await paced(()=>continueApprovedPlan(fixture(2),planId,controls({isVisible:()=>visible,advance:async current=>outcome(current,calls++)})),()=>{visible=false});assert.equal(hidden.value.reason,'paused');assert.equal(calls,1);
  });
  await t.test('dispatching claims halt continuation whether present in a plan or receipt',async()=>{
    for(const location of ['plan','receipt']){const current=fixture(2);if(location==='plan')current.recoverablePlans[0].items[0].state='dispatching';else current.attempts[0].state='dispatching';assert.equal((await continueApprovedPlan(current,planId,controls())).reason,'waiting')}
  });
  await t.test('a missing current plan never falls back to an old plan or another review',async()=>{
    const missing=fixture();missing.recoverablePlans=[];assert.equal((await continueApprovedPlan(missing,planId,controls())).reason,'waiting');
    missing.activePlanIds=[];missing.attempts[0].state='confirmed';missing.attempts[0].applicationId='synthetic-confirmed-missing-plan';assert.equal((await continueApprovedPlan(missing,planId,controls())).reason,'complete');
    missing.attempts=[];assert.equal((await continueApprovedPlan(missing,planId,controls())).reason,'paused');
  });
  await t.test('approval, profile revision, expiry and account status are rechecked before writes',async()=>{
    for(const mutate of [w=>{w.recoverablePlans[0].approvedAt=null},w=>{w.activePlanIds=[]},w=>{w.recoverablePlans[0].expiresAt=past},w=>{w.profile.revision=2},w=>{w.deleting=true},w=>{w.emailUpdateRequired=true}]){const current=fixture();mutate(current);assert.equal((await continueApprovedPlan(current,planId,controls())).reason,'paused')}
  });
  await t.test('elapsed 429 cooldown alone cannot trigger a retry',async()=>{
    for(const [retryAt,active] of [[future,true],[past,false]]){const current=fixture();current.recoverablePlans[0].items[0].state='rate_limited';current.recoverablePlans[0].items[0].retryAt=retryAt;current.attempts[0].state='rate_limited';current.attempts[0].retryAt=retryAt;current.activePlanIds=active?[planId]:[];assert.equal((await continueApprovedPlan(current,planId,controls())).reason,'waiting')}
    const authorized=fixture();authorized.recoverablePlans[0].items[0].state='rate_limited';authorized.recoverablePlans[0].items[0].retryAt=past;authorized.attempts[0].state='rate_limited';authorized.attempts[0].retryAt=past;let calls=0;const result=await continueApprovedPlan(authorized,planId,controls({advance:async current=>{calls++;return outcome(current,0)}}));assert.equal(calls,1);assert.equal(result.reason,'complete');
  });
  await t.test('a new provider 429 can coexist with other ready jobs without being retried',async()=>{
    let calls=0;const {value}=await paced(()=>continueApprovedPlan(fixture(2),planId,controls({advance:async current=>{calls++;return calls===1?outcome(current,0,'rate_limited',future):outcome(current,1)}})));
    assert.equal(calls,2);assert.equal(value.reason,'waiting');assert.equal(value.workspace.attempts[0].state,'rate_limited');assert.equal(value.workspace.attempts[0].dispatchCount,1);assert.equal(value.workspace.attempts[1].state,'confirmed');
  });
  await t.test('HTTP 429, network and Stop errors propagate once with no retry',async()=>{
    for(const failure of [Object.assign(new Error('Synthetic HTTP429'),{status:429}),new Error('Synthetic disconnected response')]){let calls=0;await assert.rejects(continueApprovedPlan(fixture(),planId,controls({advance:async()=>{calls++;throw failure}})),error=>error===failure);assert.equal(calls,1)}
    let stops=0;const error=new Error('Synthetic stop failure');await assert.rejects(continueApprovedPlan(fixture(),planId,controls({shouldStop:()=>true,stop:async()=>{stops++;throw error}})),failure=>failure===error);assert.equal(stops,1);
  });
  await t.test('each returned workspace is checked against the captured account and workspace',async()=>{
    for(const operation of ['advance','stop'])for(const [field,value,code] of [['accountId','another-owner','account_changed'],['workspaceId',id(999),'workspace_changed'],['workspaceId',null,'workspace_changed']]){let calls=0;await assert.rejects(continueApprovedPlan(fixture(),planId,controls({shouldStop:()=>operation==='stop',[operation]:async current=>{calls++;return{...current,[field]:value}}})),error=>error.code===code);assert.equal(calls,1)}
    const blank=fixture();blank.workspaceId=null;await assert.rejects(continueApprovedPlan(blank,planId,controls()),error=>error.code==='workspace_changed');
  });
  await t.test('review mutation and validation failure stop further requests',async()=>{
    for(const field of ['digest','profileRevision']){let calls=0;await assert.rejects(continueApprovedPlan(fixture(2),planId,controls({advance:async current=>{calls++;const next=outcome(current,0);next.recoverablePlans[0][field]=field==='digest'?'b'.repeat(64):2;return next}})),error=>error.code==='review_changed');assert.equal(calls,1)}
    const failure=new Error('Synthetic exact-review mismatch');await assert.rejects(continueApprovedPlan(fixture(),planId,controls({validate:()=>{throw failure}})),error=>error===failure);
  });
  await t.test('unchanged advance responses stop as waiting without retry or pacing',async()=>{
    let calls=0;const {value,delays}=await paced(()=>continueApprovedPlan(fixture(),planId,controls({advance:async current=>{calls++;return structuredClone(current)}})));assert.equal(value.reason,'waiting');assert.equal(calls,1);assert.deepEqual(delays,[]);
  });
  await t.test('malformed returned data, invalid identifiers and oversized plans fail closed',async()=>{
    await assert.rejects(continueApprovedPlan(fixture(), 'invalid-plan',controls()));await assert.rejects(continueApprovedPlan(fixture(21),planId,controls()));
    let calls=0;await assert.rejects(continueApprovedPlan(fixture(),planId,controls({advance:async current=>{calls++;return{...current,recoverablePlans:'invalid'}}})));assert.equal(calls,1);
  });
  await t.test('terminal and already-stopped plans require no additional write',async()=>{
    const terminal=fixture();terminal.recoverablePlans[0].items[0].state='uncertain';terminal.attempts[0].state='uncertain';terminal.activePlanIds=[];assert.equal((await continueApprovedPlan(terminal,planId,controls())).reason,'complete');
    const stopped=fixture();stopped.recoverablePlans[0].stopped=true;stopped.activePlanIds=[];assert.equal((await continueApprovedPlan(stopped,planId,controls())).reason,'stopped');
  });
});
