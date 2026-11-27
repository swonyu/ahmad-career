import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {webcrypto} from 'node:crypto';
import {createDiscoveryHandler} from '../server/discovery.mjs';
import {SERVICE_ORIGIN} from '../server/applications.mjs';

const directory=await mkdtemp(join(tmpdir(),'career-phone-api-'));
after(()=>rm(directory,{recursive:true,force:true}));
await build({stdin:{contents:'export {createReadOutcomeJournal} from "./app/phone/read-outcomes.ts"; export {createPhoneVault} from "./app/phone/vault.ts"; export {phoneAPI} from "./app/phone/api.ts"; export {APIError} from "./app/components/api.ts"; export * from "./app/phone/model.ts";',resolveDir:process.cwd(),sourcefile:'phone-api-test.ts'},outfile:join(directory,'client.mjs'),bundle:true,platform:'node',format:'esm'});
const {phoneAPI:requestPhoneAPI,createReadOutcomeJournal,createPhoneVault,APIError,workspaceSchema,catalogSchema,blankProfile,reviewRequest}=await import(pathToFileURL(join(directory,'client.mjs')).href);

const accountId='synthetic-api-owner',workspaceId='00000000-0000-4000-8000-000000000999',planId='00000000-0000-4000-8000-000000000099',jobId='00000000-0000-4000-8000-000000000001';
const rows=new Map(),port={
  async read(key){return rows.has(key)?{exists:true,value:structuredClone(rows.get(key))}:{exists:false}},
  async compareAndSet(key,expected,value){const old=rows.get(key);if(expected===null?rows.has(key):old?.envelopeId!==expected)return false;rows.set(key,structuredClone(value));return true},
  async remove(key,value){rows.set(key,structuredClone(value))},
  async list(prefix){return [...rows].filter(([key,value])=>key.startsWith(prefix)&&!value.reset).map(([key,value])=>({scope:key,updatedAt:value.updatedAt}))},
};
const outcomes=createReadOutcomeJournal(createPhoneVault({port,crypto:webcrypto}));
const phoneAPI=(path,options={})=>requestPhoneAPI(path,{expectedAccountId:accountId,expectedWorkspaceId:workspaceId,outcomes,...options});
const job={id:jobId,title:'Synthetic role',company:'Synthetic employer',url:'https://example.com/job',location:'',country:''};
const plan={id:planId,digest:'a'.repeat(64),profileRevision:0,createdAt:'2026-11-23T12:00:00.000Z',expiresAt:'2099-11-23T12:30:00.000Z',stopped:false,approvedAt:null,items:[{jobId,job,title:job.title,company:job.company,state:'ready',reason:'',payloadSummary:{name:'Synthetic',email:'synthetic@example.com',phone:'',website:'',linkedin:'',comments:'',consentStore:true,consentMarketing:false},resume:null,privacyPolicyUrl:null,requirementsRevision:null,retryAt:null}]};

test('phone API keeps authentication, cancellation and verification bounded',async t=>{
  const originalFetch=globalThis.fetch;let requests=[];
  t.after(()=>{globalThis.fetch=originalFetch});
  const install=implementation=>{requests=[];globalThis.fetch=async(path,options)=>{requests.push({path,options});return implementation(path,options)}};
  await t.test('private writes carry the exact intent body, same-origin cookies and no native credential',async()=>{
    install(()=>Response.json({ok:true,profile:{...blankProfile(),firstName:'Test',revision:4}}));const body={expectedWorkspaceId:workspaceId,expectedRevision:3,profile:{firstName:'Test'}};
    await phoneAPI('/api/phone/profile',{method:'PUT',body});assert.equal(requests.length,1);const request=requests[0];
    assert.equal(request.path,'/api/phone/profile');assert.equal(request.options.method,'PUT');assert.equal(request.options.credentials,'same-origin');assert.equal(request.options.cache,'no-store');assert.equal(request.options.redirect,'error');assert.equal(request.options.body,JSON.stringify(body));assert.equal(new Headers(request.options.headers).get('authorization'),null);
  });
  await t.test('the actual source catalog remains readable behind an owner-private same-origin hosting gate',async()=>{
    let denied=0,workerRequests=0,providerRequests=0;
    const handler=createDiscoveryHandler({fetchImpl:async()=>{providerRequests++;throw Error('A source catalog must never call an employer');}});
    const anonymous=await (await handler(new Request(SERVICE_ORIGIN+'/api/discovery/sources'),{})).json();
    // Model only the private hosting boundary. The response after that boundary
    // comes from the real discovery handler and is decoded by the real schema.
    install(async(path,options)=>{
      if(options.credentials!=='same-origin'){denied++;return new Response('<html>Private site sign-in required</html>',{status:403,headers:{'Content-Type':'text/html'}});}
      workerRequests++;
      return handler(new Request(SERVICE_ORIGIN+path,{method:options.method,headers:{Origin:SERVICE_ORIGIN,'Sec-Fetch-Site':'same-origin',Cookie:'__Host-sites-session=synthetic-hosting-cookie; __Host-career-session=synthetic-invalid-app-cookie','oai-authenticated-user-id':'synthetic-private-site-owner'}}),{});
    });
    try{
      const data=await phoneAPI('/api/discovery/sources'),catalog=catalogSchema.parse(data);
      assert.deepEqual(data,anonymous,'A forged/expired application cookie cannot alter public catalog data');
      assert.equal(catalog.sources.length,7);assert.equal(catalog.defaults.length,4);
      assert.equal(denied,0);assert.equal(workerRequests,1);assert.equal(providerRequests,0);
      assert.equal(new Headers(requests[0].options.headers).get('authorization'),null);assert.equal(requests[0].options.body,undefined);assert.equal(requests[0].options.redirect,'error');
    }finally{console.log(JSON.stringify({syntheticPrivateIngress:{denied,workerRequests,providerRequests}}));}
  });
  await t.test('discovery preserves same-origin hosting access and encoded search intent without a native credential',async()=>{
    install(()=>Response.json({ok:true}));await phoneAPI('/api/discovery/search?q=Engineer%20%26%20Design&source=greenhouse%3Asynthetic');assert.equal(requests[0].options.credentials,'same-origin');assert.equal(requests[0].options.body,undefined);assert.match(requests[0].path,/q=Engineer%20%26%20Design/);
    assert.equal(new Headers(requests[0].options.headers).get('authorization'),null);assert.equal(new Headers(requests[0].options.headers).get('cookie'),null);
  });
  await t.test('oversized multi-job review payloads are rejected before an API call begins',async()=>{
    install(()=>Response.json({ok:true,plan}));const ids=Array.from({length:20},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`),workspace='00000000-0000-4000-8000-000000000999';
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
      install(()=>Response.json({ok:false,error:{code,message:'Refresh the current workspace.'}},{status}));await assert.rejects(phoneAPI('/api/phone/submit',{method:'POST',body:{expectedWorkspaceId:workspaceId,planId,digest:'a'.repeat(64),approved:true}}),error=>error instanceof APIError&&error.status===status&&error.code===code);assert.equal(requests.length,1);
    }
    install(()=>Response.json({ok:false,error:{code:'unconfirmed',message:'Not completed.'}}));await assert.rejects(phoneAPI('/api/phone/submit',{method:'POST',body:{expectedWorkspaceId:workspaceId,planId,digest:'a'.repeat(64)}}),error=>error.code==='unconfirmed');assert.equal(requests.length,1);
  });
  await t.test('malformed and unfamiliar discovery conflicts retain their HTTP 409 status',async()=>{
    const cases=[
      ()=>new Response('<html>synthetic private page</html>',{status:409,headers:{'content-type':'text/html'}}),
      ()=>new Response(null,{status:409,headers:{'content-type':'application/json'}}),
      ()=>new Response('{',{status:409,headers:{'content-type':'application/json'}}),
      ()=>Response.json({ok:false,error:{code:'unfamiliar_conflict',message:'Synthetic conflict.'}},{status:409}),
    ];
    for(const make of cases){
      install(make);await assert.rejects(phoneAPI('/api/discovery/search?q=Synthetic&cursor=rejected'),error=>error instanceof APIError&&error.status===409);assert.equal(requests.length,1);
    }
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
    let started;const ready=new Promise(resolve=>{started=resolve});
    install((_,options)=>new Promise((resolve,reject)=>{started();options.signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true})}));
    const controller=new AbortController(),pending=phoneAPI('/api/phone/workspace',{signal:controller.signal});await ready;controller.abort();await assert.rejects(pending,error=>error.name==='AbortError');assert.equal(requests.length,1);assert.equal(requests[0].options.signal.aborted,true);
    install(()=>Response.json({ok:true}));await assert.rejects(phoneAPI('/api/phone/workspace',{signal:controller.signal}),error=>error.name==='AbortError');assert.equal(requests.length,0);
  });
  await t.test('the timer aborts a stalled mutation and tells the user to reconcile before retrying',async()=>{
    const originalTimer=globalThis.setTimeout;globalThis.setTimeout=(fn,delay,...args)=>originalTimer(fn,delay===30000?20:delay,...args);
    try{install((_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Timeout','AbortError')),{once:true})));await assert.rejects(phoneAPI('/api/phone/advance',{method:'POST',body:{expectedWorkspaceId:workspaceId,planId}}),error=>error.code==='request_timeout'&&/Refresh online records before trying it again/.test(error.message)&&error.intent?.kind==='advance');assert.equal(requests.length,1)}finally{globalThis.setTimeout=originalTimer}
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
    install(()=>new Response(serialized,{headers:{'content-type':'application/json'}}));const parsed=workspaceSchema.parse(await phoneAPI('/api/phone/workspace',{expectedAccountId:workspace.accountId}));assert.equal(parsed.recoverablePlans.length,20);assert.equal(parsed.jobs.length,200);assert.equal(requests.length,1);console.log(JSON.stringify({populatedWorkspaceBytes:bytes,attempts:500,reviews:20,reviewItems:400}));
  });
});

