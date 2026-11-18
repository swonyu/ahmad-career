import assert from 'node:assert/strict';
import test from 'node:test';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {makeAdapter} from '../server/provider.mjs';

const target={region:'global',site:'synthetic-employer',postingId:'00000000-0000-4000-8000-000000000001'};
const connector={apiKeyEnv:'CAREER_FIXTURE_KEY'};
const snapshot={profile:{firstName:'Synthetic',lastName:'Applicant',email:'applicant@example.invalid',resume:{name:'synthetic.pdf'}},answers:{}};
const pdfBytes=new Uint8Array([37,80,68,70]);

function fixtureAdapter(response,method='GET'){
  let calls=0;
  const adapter=makeAdapter({CAREER_FIXTURE_KEY:'synthetic-fixture-only'},{fetchImpl:async(input,options)=>{
    calls++;
    const url=new URL(input);
    assert.equal(url.origin,'https://api.lever.co');
    assert.equal(options.method??'GET',method);
    assert.equal(options.redirect,'manual');
    assert.equal(options.headers.Accept,'application/json');
    assert(options.signal instanceof AbortSignal);
    if(method==='POST'){
      assert.equal(url.searchParams.get('key'),'synthetic-fixture-only');
      assert(options.body instanceof FormData);
      assert.equal(options.body.get('email'),'applicant@example.invalid');
      assert.equal(options.body.get('resume').type,'application/pdf');
    }else assert.equal(url.search,'');
    return response;
  }});
  return {adapter,calls:()=>calls};
}

function oversizedResponse(limit,mode){
  let cancelled=0,release;
  const completion=new Promise(resolve=>{release=resolve});
  const response=new Response(new ReadableStream({
    start(controller){controller.enqueue(new Uint8Array(limit+1))},
    cancel(){
      cancelled++;
      return mode==='pending'?completion:Promise.reject(new Error('Synthetic cancellation failure'));
    }
  }),{headers:{'content-type':'application/json'}});
  return {response,cancelled:()=>cancelled,release};
}

for(const operation of ['posting','submit'])for(const mode of ['pending','rejected']){
  test(`${operation} bounds an oversized response despite ${mode} cancellation`,async()=>{
    const fixture=oversizedResponse(operation==='posting'?1024*1024:128*1024,mode);
    const transport=fixtureAdapter(fixture.response,operation==='posting'?'GET':'POST');
    let outcome;
    const work=(operation==='posting'?transport.adapter.posting(target):transport.adapter.submit(target,snapshot,connector,pdfBytes))
      .then(value=>{outcome={value}},error=>{outcome={error}});
    try{
      // Let the injected fetch and stream microtasks finish, without resolving cleanup.
      await nextTurn();
      assert.equal(fixture.cancelled(),1,'The rejected upstream body must be cancelled once');
      assert(outcome,'The adapter must settle without waiting for upstream cancellation');
      if(operation==='posting'){
        assert.equal(outcome.error?.code,'posting_unavailable');
        assert.equal(outcome.error?.status,503);
      }else{
        assert.equal(outcome.value?.state,'uncertain');
        assert.equal(outcome.value?.error.code,'unconfirmed_transport');
        assert.equal(outcome.value?.applicationId,undefined);
      }
      assert.equal(fixture.response.body.locked,false,'The reader must be released');
      assert.equal(transport.calls(),1,'An ambiguous result must never trigger another request');
    }finally{
      fixture.release();
      await work;
    }
  });
}

test('a bounded posting still validates its identity and releases its reader',async()=>{
  const response=Response.json({id:target.postingId,text:'Synthetic role',categories:{location:'Riyadh'},country:'SA',workplaceType:'hybrid'});
  const transport=fixtureAdapter(response),result=await transport.adapter.posting(target);
  assert.equal(result.postingId,target.postingId);
  assert.equal(result.title,'Synthetic role');
  assert.equal(result.location,'Riyadh');
  assert.match(result.metadataHash,/^[a-f0-9]{64}$/);
  assert.equal(response.body.locked,false);
  assert.equal(transport.calls(),1);
});

test('a bounded missing posting retains the closed-posting error',async()=>{
  const response=Response.json({error:'synthetic missing posting'},{status:404});
  const transport=fixtureAdapter(response);
  await assert.rejects(transport.adapter.posting(target),{code:'posting_closed',status:409});
  assert.equal(response.body.locked,false);
  assert.equal(transport.calls(),1);
});

for(const [name,status,body,headers,state,code] of [
  ['confirmed receipt',200,{ok:true,applicationId:'synthetic-receipt'}, {},'confirmed',undefined],
  ['explicit rejection',422,{ok:false}, {},'rejected','provider_rejected'],
  ['provider cooldown',429,{ok:false},{'retry-after':'120'},'rate_limited','provider_rate_limited'],
  ['undocumented receipt',200,{ok:true}, {},'uncertain','unconfirmed_response'],
])test(`a bounded submission preserves ${name} semantics`,async()=>{
  const response=Response.json(body,{status,headers}),transport=fixtureAdapter(response,'POST');
  const result=await transport.adapter.submit(target,snapshot,connector,pdfBytes);
  assert.equal(result.state,state);
  assert.equal(result.error?.code,code);
  assert.match(result.responseSHA256,/^[a-f0-9]{64}$/);
  if(state==='confirmed')assert.equal(result.applicationId,'synthetic-receipt');
  if(state==='rate_limited')assert.equal(result.retryDelay,120000);
  assert.equal(response.body.locked,false);
  assert.equal(transport.calls(),1);
});
