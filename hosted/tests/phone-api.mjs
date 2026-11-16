import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const directory=await mkdtemp(join(tmpdir(),'career-phone-api-'));
after(()=>rm(directory,{recursive:true,force:true}));
await build({stdin:{contents:'export {phoneAPI} from "./app/phone/api.ts"; export {APIError} from "./app/components/api.ts"; export * from "./app/phone/model.ts";',resolveDir:process.cwd(),sourcefile:'phone-api-test.ts'},outfile:join(directory,'client.mjs'),bundle:true,platform:'node',format:'esm'});
const {phoneAPI,APIError,workspaceSchema,blankProfile,reviewRequest}=await import(pathToFileURL(join(directory,'client.mjs')).href);

test('phone API keeps authentication, cancellation and verification bounded',async t=>{
  const originalFetch=globalThis.fetch;let requests=[];
  t.after(()=>{globalThis.fetch=originalFetch});
  const install=implementation=>{requests=[];globalThis.fetch=async(path,options)=>{requests.push({path,options});return implementation(path,options)}};
  await t.test('private writes carry the exact intent body, same-origin cookies and no native credential',async()=>{
    install(()=>Response.json({ok:true}));const body={expectedWorkspaceId:'synthetic',expectedRevision:3,profile:{firstName:'Test'}};
    await phoneAPI('/api/phone/profile',{method:'PUT',body});assert.equal(requests.length,1);const request=requests[0];
    assert.equal(request.path,'/api/phone/profile');assert.equal(request.options.method,'PUT');assert.equal(request.options.credentials,'same-origin');assert.equal(request.options.cache,'no-store');assert.equal(request.options.redirect,'error');assert.equal(request.options.body,JSON.stringify(body));assert.equal(new Headers(request.options.headers).get('authorization'),null);
  });
  await t.test('public discovery omits account credentials and preserves encoded search intent',async()=>{
    install(()=>Response.json({ok:true}));await phoneAPI('/api/discovery/search?q=Engineer%20%26%20Design&source=remotive');assert.equal(requests[0].options.credentials,'omit');assert.equal(requests[0].options.body,undefined);assert.match(requests[0].path,/q=Engineer%20%26%20Design/);
  });
  await t.test('oversized multi-job review payloads are rejected before an API call begins',async()=>{
    install(()=>Response.json({ok:true}));const ids=Array.from({length:20},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`),workspace='00000000-0000-4000-8000-000000000999';
    const prepare=async jobs=>phoneAPI('/api/phone/prepare',{method:'POST',body:reviewRequest(workspace,jobs,'a'.repeat(5000),true,false)});
    await assert.rejects(prepare(ids),/Shorten the message or select fewer jobs/);assert.equal(requests.length,0);
    await prepare([ids[0]]);assert.equal(requests.length,1);assert.equal(JSON.parse(requests[0].options.body).answers[ids[0]].comments.length,5000);
  });
  await t.test('foreign destinations, non-app routes and writes to discovery are rejected before fetch',async()=>{
    install(()=>Response.json({ok:true}));
    for(const path of ['https://example.com/api/phone/workspace','//example.com/api/phone/workspace','/api/account/pairing','/signin-with-chatgpt','/api/phone/session/revoke','/api/phone/../account'])await assert.rejects(phoneAPI(path),APIError);
    await assert.rejects(phoneAPI('/api/discovery/search',{method:'POST',body:{}}),APIError);await assert.rejects(phoneAPI('/api/phone/workspace',{body:{}}),APIError);assert.equal(requests.length,0);
  });
  await t.test('HTTP and logical failures remain distinguishable and never replay a mutation',async()=>{
    for(const [status,code] of [[401,'sign_in_required'],[409,'workspace_changed'],[409,'stale_profile'],[503,'storage_or_service_error']]){
      install(()=>Response.json({ok:false,error:{code,message:'Refresh the current workspace.'}},{status}));await assert.rejects(phoneAPI('/api/phone/submit',{method:'POST',body:{approved:true}}),error=>error instanceof APIError&&error.status===status&&error.code===code);assert.equal(requests.length,1);
    }
    install(()=>Response.json({ok:false,error:{code:'unconfirmed',message:'Not completed.'}}));await assert.rejects(phoneAPI('/api/phone/submit',{method:'POST',body:{}}),error=>error.code==='unconfirmed');assert.equal(requests.length,1);
  });
  await t.test('unverified content, invalid UTF-8, arrays and empty responses are rejected safely',async()=>{
    for(const make of [()=>new Response('<html>private debug trace</html>'),()=>new Response(new Uint8Array([0xc3,0x28]),{headers:{'content-type':'application/json'}}),()=>Response.json([]),()=>Response.json(null),()=>new Response(null,{headers:{'content-type':'application/json'}})]){
      install(make);await assert.rejects(phoneAPI('/api/phone/workspace'),error=>error.code==='invalid_response'&&!error.message.includes('private debug'));assert.equal(requests.length,1);
    }
  });
  await t.test('the 12 MiB response limit cancels oversized streams before parsing',async()=>{
    let cancelled=false;const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(12*1024*1024+1))},cancel(){cancelled=true}});
    install(()=>new Response(stream,{headers:{'content-type':'application/json'}}));await assert.rejects(phoneAPI('/api/phone/workspace'),error=>error.code==='invalid_response');assert.equal(cancelled,true);assert.equal(requests.length,1);
  });
  await t.test('network errors do not retry writes or expose private exception details',async()=>{
    install(()=>{throw Error('private synthetic network detail')});await assert.rejects(phoneAPI('/api/phone/jobs',{method:'POST',body:{}}),error=>error.code==='network_unavailable'&&!error.message.includes('private synthetic'));assert.equal(requests.length,1);
  });
  await t.test('caller cancellation aborts once and pre-cancelled work never starts',async()=>{
    install((_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true})));
    const controller=new AbortController(),pending=phoneAPI('/api/phone/workspace',{signal:controller.signal});controller.abort();await assert.rejects(pending,error=>error.name==='AbortError');assert.equal(requests.length,1);assert.equal(requests[0].options.signal.aborted,true);
    install(()=>Response.json({ok:true}));await assert.rejects(phoneAPI('/api/phone/workspace',{signal:controller.signal}),error=>error.name==='AbortError');assert.equal(requests.length,0);
  });
  await t.test('the timer aborts a stalled mutation and tells the user to reconcile before retrying',async()=>{
    const originalTimer=globalThis.setTimeout;globalThis.setTimeout=(fn,delay,...args)=>originalTimer(fn,delay===30000?20:delay,...args);
    try{install((_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Timeout','AbortError')),{once:true})));await assert.rejects(phoneAPI('/api/phone/advance',{method:'POST',body:{}}),error=>error.code==='request_timeout'&&/whether it completed/.test(error.message));assert.equal(requests.length,1)}finally{globalThis.setTimeout=originalTimer}
  });
  await t.test('a populated valid workspace above 4 MiB remains readable within the native 12 MiB budget',async()=>{
    // Schema-valid synthetic data at the service's record/review count limits.
    // Each prepare body for twenty jobs remains below the 32 KiB request limit.
    const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,now=new Date().toISOString(),later=new Date(Date.now()+1800000).toISOString();
    const longURL='https://example.com/'+ 'a'.repeat(2048-'https://example.com/'.length),linkedin='https://www.linkedin.com/in/'+'a'.repeat(2048-'https://www.linkedin.com/in/'.length);
    const profile={...blankProfile(),firstName:'界'.repeat(150),lastName:'文'.repeat(150),email:'synthetic@example.com',phone:'1'.repeat(150),website:longURL,linkedin,resume:{name:'Synthetic.pdf',mime:'application/pdf',size:100,sha256:'a'.repeat(64)},revision:1};
    const jobs=Array.from({length:200},(_,i)=>({id:id(i+1),title:'職'.repeat(500),company:'c'.repeat(80),url:`https://jobs.lever.co/${'c'.repeat(80)}/${id(i+1)}`,location:'地'.repeat(500),country:'SA'}));
    const plans=Array.from({length:20},(_,i)=>({id:id(1000+i),digest:'b'.repeat(64),profileRevision:1,createdAt:now,expiresAt:later,stopped:false,approvedAt:null,items:jobs.slice(0,20).map(job=>({jobId:job.id,job,title:job.title,company:job.company,state:'ready',reason:'',payloadSummary:{name:profile.firstName+' '+profile.lastName,email:profile.email,phone:profile.phone,website:profile.website,linkedin:profile.linkedin,comments:'c'.repeat(1000),consentStore:true,consentMarketing:false},resume:profile.resume,privacyPolicyUrl:longURL,requirementsRevision:'synthetic',retryAt:null}))}));
    const attempts=Array.from({length:500},(_,i)=>({id:id(2000+i),planId:id(1000+Math.floor(i/20)),jobId:jobs[i%20].id,title:jobs[i%20].title,company:jobs[i%20].company,url:jobs[i%20].url,state:i<400?'ready':'confirmed',...(i<400?{}:{applicationId:'synthetic-'+i}),createdAt:now,mode:'test',evidenceMode:'test',error:null}));
    const workspace={ok:true,accountId:'synthetic-capacity',accountEmail:profile.email,confirmedEmail:profile.email,emailUpdateRequired:false,deleting:false,workspaceId:id(999),mode:'test',profile,jobs,attempts,capabilities:{liveEnabled:false,linkedinProfile:true,mode:'test',coverage:'Synthetic fixture only'},recoverablePlans:plans,activePlanIds:[]};
    const preparation={jobIds:jobs.slice(0,20).map(j=>j.id),answers:Object.fromEntries(jobs.slice(0,20).map(j=>[j.id,{comments:'c'.repeat(1000),consentStore:true,consentMarketing:false}])),reviewSchema:3};assert.ok(Buffer.byteLength(JSON.stringify(preparation))<32768);
    const serialized=JSON.stringify(workspace),bytes=Buffer.byteLength(serialized);assert.ok(bytes>4*1024*1024);assert.ok(bytes<12*1024*1024);assert.equal(workspaceSchema.parse(workspace).attempts.length,500);
    install(()=>new Response(serialized,{headers:{'content-type':'application/json'}}));const parsed=workspaceSchema.parse(await phoneAPI('/api/phone/workspace'));assert.equal(parsed.recoverablePlans.length,20);assert.equal(parsed.jobs.length,200);assert.equal(requests.length,1);console.log(JSON.stringify({populatedWorkspaceBytes:bytes,attempts:500,reviews:20,reviewItems:400}));
  });
});
