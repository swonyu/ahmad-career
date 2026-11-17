import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {linkedinProfileURL,leverTarget} from '../server/validation.mjs';

const directory=await mkdtemp(join(tmpdir(),'career-phone-model-'));
after(()=>rm(directory,{recursive:true,force:true}));
await build({entryPoints:['app/phone/model.ts'],outfile:join(directory,'model.mjs'),bundle:true,platform:'node',format:'esm'});
const model=await import(pathToFileURL(join(directory,'model.mjs')).href);
await build({entryPoints:['app/components/provider-auth.ts'],outfile:join(directory,'auth.mjs'),bundle:true,platform:'node',format:'esm'});
const auth=await import(pathToFileURL(join(directory,'auth.mjs')).href);
const jobID='00000000-0000-4000-8000-000000000001',scope='account:synthetic-a';
const job={id:jobID,title:'Synthetic role',company:'phone-fixture',url:`https://jobs.lever.co/phone-fixture/${jobID}`,location:'Remote',country:'SA'};
const pdf=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
const resume={name:'Synthetic.pdf',mime:'application/pdf',size:pdf.length,sha256:createHash('sha256').update(pdf).digest('hex')};
const profile={...model.blankProfile(),firstName:'Synthetic',email:'a@example.com',linkedin:'https://www.linkedin.com/in/Example',resume,revision:1};
function plan(){return{id:'00000000-0000-4000-8000-000000000099',digest:'a'.repeat(64),profileRevision:1,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+1800000).toISOString(),stopped:false,approvedAt:null,items:[{jobId:jobID,job:{...job},title:job.title,company:job.company,state:'ready',reason:'',payloadSummary:{name:profile.firstName,email:profile.email,phone:'',website:'',linkedin:profile.linkedin,comments:'Explicit application message',consentStore:true,consentMarketing:false},resume,privacyPolicyUrl:'https://example.com/privacy',requirementsRevision:'synthetic-1',retryAt:null}]}}

test('phone model keeps canonical identities and private local state separate',async t=>{
  await t.test('LinkedIn values have the same canonical boundary as the application service',()=>{
    for(const input of ['https://linkedin.com/in/a+b','HTTPS://SA.LINKEDIN.COM:443/in/Example/?trk=phone#about','https://linkedin.com/in/Jose\u0301','https://linkedin.com/in/سلام',"https://linkedin.com/in/a!'()*b",'https://linkedin.com/in/a%3fb'])assert.equal(model.linkedInURL(input),linkedinProfileURL(input));
    for(const input of ['https://linkedin.com.evil.example/in/a','https://linkedin.com/jobs/view/123','https://linkedin.com/in/a%2fb','https://linkedin.com/in/a%252fb','https://linkedin.com/in/a%E2%80%AEb','https://linkedin.com/in/a%C2%85b','https://linkedin.com/in/a#%0a','https://linkedin.com/in/a%FF','https://linkedin.com/in/'+'س'.repeat(400)]){assert.throws(()=>model.linkedInURL(input));assert.throws(()=>linkedinProfileURL(input))}
    const limit='https://www.linkedin.com/in/'+'a'.repeat(2048-'https://www.linkedin.com/in/'.length);assert.equal(model.linkedInURL(limit),limit);assert.throws(()=>model.linkedInURL(limit+'a'));
  });
  await t.test('Lever paths, arbitrary tracking queries and case share the actual remote posting identity',()=>{
    const uuid='ABCDEF01-2345-4567-89AB-CDEF01234567';
    for(const host of ['jobs.lever.co','jobs.eu.lever.co']){
      const variants=[`https://${host}/Acme/${uuid}/apply/?source=external&ref=message`,`https://${host}/acme/${uuid.toLowerCase()}?a=1`,`https://${host}/ACME/${uuid}?utm_campaign=phone#apply`];
      const remote=variants.map(leverTarget);assert.equal(new Set(remote.map(v=>v.key)).size,1);
      assert.equal(new Set(variants.map(model.jobIdentity)).size,1);assert.equal(model.jobIdentity(variants[0]),`https://${host}/acme/${uuid.toLowerCase()}`);
    }
    assert.notEqual(model.jobIdentity('https://example.com/jobs?id=1'),model.jobIdentity('https://example.com/jobs?id=2'));
  });
  await t.test('scope mismatch, duplicate jobs and noncanonical/contradictory imported records fail closed',()=>{
    const value={...model.blankSnapshot(scope),jobs:[job],records:[model.blankRecord(job)]},before=structuredClone(value);
    assert.throws(()=>model.parseSnapshot(value,'account:synthetic-b'));assert.deepEqual(value,before);
    assert.throws(()=>model.parseSnapshot({...value,jobs:[job,{...job,id:'duplicate',url:job.url+'/apply?source=another'}]},scope));
    assert.throws(()=>model.parseSnapshot({...value,records:[{...value.records[0],identity:job.url+'?source=another'}]},scope));
    for(const stage of ['applied','interview','offer'])assert.throws(()=>model.parseSnapshot({...value,records:[{...value.records[0],stage,appliedElsewhere:false}]},scope));
    assert.throws(()=>model.parseSnapshot({...value,records:[value.records[0],value.records[0]]},scope));
  });
  await t.test('civil dates and applied history survive stage transitions until explicit clearing',()=>{
    assert.equal(model.civilDate('2024-02-29'),true);for(const value of ['2023-02-29','2026-02-30','2026-13-01','2026-1-01','1899-12-31','2026-01-01T00:00:00Z'])assert.equal(model.civilDate(value),false);
    const saved=model.blankRecord(job),applied=model.updateRecord(saved,{...saved,stage:'applied',note:'Private follow-up note'});assert.equal(applied.appliedElsewhere,true);
    const closed=model.updateRecord(applied,{...applied,stage:'closed'});assert.equal(closed.appliedElsewhere,true);assert.equal(closed.note,'Private follow-up note');
    assert.throws(()=>model.updateRecord(closed,{...closed,stage:'saved'}));assert.equal(model.updateRecord(closed,{...closed,stage:'saved'},true).appliedElsewhere,false);
    assert.throws(()=>model.updateRecord(saved,{...saved,identity:'https://example.com/another'}));
  });
  await t.test('profile transport strips local notes, records, revision and resume metadata',()=>{
    const input={...profile,firstName:' Synthetic ',email:' A@EXAMPLE.COM ',linkedin:' https://linkedin.com/in/Example/?trk=phone ',skills:[' TypeScript ','','TypeScript'],targetRoles:[' Engineer ','Engineer'],note:'PRIVATE NOTE',records:[{note:'PRIVATE TRACKER'}]};
    const request=model.profileRequest(input);assert.equal(request.firstName,'Synthetic');assert.equal(request.email,'a@example.com');assert.equal(request.linkedin,profile.linkedin);assert.deepEqual(request.skills,['TypeScript']);assert.deepEqual(request.targetRoles,['Engineer']);
    for(const key of ['note','records','revision','resume'])assert.equal(Object.hasOwn(request,key),false,key);
    const attached=model.profileRequest({...profile,resume:{...resume,dataBase64:pdf.toString('base64')}});assert.deepEqual(Object.keys(attached.resume).sort(),['dataBase64','mime','name']);assert.equal(attached.resume.dataBase64,pdf.toString('base64'));
    assert.equal(model.profileRequest({...profile,resume:null}).resume,null);
  });
  await t.test('exact review validates the target and every submitted profile/CV field',()=>{
    const review=model.planSchema.parse(plan());assert.equal(review.items[0].retryAt,null);assert.equal(review.items[0].job.url,job.url);assert.doesNotThrow(()=>model.checkReview(review,profile,[job],[]));
    for(const field of ['firstName','email','phone','website','linkedin'])assert.throws(()=>model.checkReview(review,{...profile,[field]:'changed'},[job],[]));
    for(const field of ['sha256','name','size'])assert.throws(()=>model.checkReview(review,{...profile,resume:{...resume,[field]:field==='size'?999:'changed'}},[job],[]));
    assert.throws(()=>model.checkReview(review,profile,[{...job,url:'https://example.com/different-job'}],[]));
    assert.throws(()=>model.checkReview({...review,profileRevision:2},profile,[job],[]));assert.throws(()=>model.checkReview({...review,expiresAt:'2000-01-01T00:00:00Z'},profile,[job],[]));
    const applied={...model.blankRecord(job),stage:'closed',appliedElsewhere:true};assert.throws(()=>model.checkReview(review,profile,[job],[applied]));
  });
  await t.test('review requests bind a workspace, distinct UUIDs and explicit consent choices',()=>{
    const ids=Array.from({length:20},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`),workspace='00000000-0000-4000-8000-000000000999';
    const body=model.reviewRequest(workspace,ids,'Explicit application message',true,false);assert.equal(body.expectedWorkspaceId,workspace);assert.equal(body.reviewSchema,3);assert.deepEqual(body.manualAppliedJobIds,[]);assert.deepEqual(Object.keys(body).sort(),['answers','expectedWorkspaceId','jobIds','manualAppliedJobIds','reviewSchema']);
    assert.deepEqual(body.answers[ids[0]],{comments:'Explicit application message',consentStore:true,consentMarketing:false});
    assert.equal(model.reviewRequest(workspace,[ids[0]],'',false,false).answers[ids[0]].consentStore,false);
    for(const jobs of [[],[...ids,workspace],[ids[0],ids[0]],['not-a-uuid'],[1]])assert.throws(()=>model.reviewRequest(workspace,jobs,'',true,false));
    for(const value of [undefined,null,'true',0]){assert.throws(()=>model.reviewRequest(workspace,[ids[0]],'',value,false));assert.throws(()=>model.reviewRequest(workspace,[ids[0]],'',true,value))}
    assert.throws(()=>model.reviewRequest('wrong-workspace',[ids[0]],'',true,false));assert.throws(()=>model.reviewRequest(workspace,[ids[0]],'x'.repeat(5001),true,false));
  });
  await t.test('review request budget measures serialized UTF-8 including repeated answers and JSON escaping',()=>{
    const ids=Array.from({length:20},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`),workspace='00000000-0000-4000-8000-000000000999';
    const single=model.reviewRequest(workspace,[ids[0]],'a'.repeat(5000),true,false);assert.ok(new TextEncoder().encode(JSON.stringify(single)).byteLength<32768);
    assert.throws(()=>model.reviewRequest(workspace,ids,'a'.repeat(5000),true,false),/Shorten the message or select fewer jobs/);
    assert.doesNotThrow(()=>model.reviewRequest(workspace,ids,'a'.repeat(1000),true,false));
    assert.throws(()=>model.reviewRequest(workspace,ids,'界'.repeat(1000),true,false),/message is too long/);assert.throws(()=>model.reviewRequest(workspace,ids,'"'.repeat(1000),true,false),/message is too long/);
    let low=0,high=5000;while(low<high){const middle=Math.ceil((low+high)/2);try{model.reviewRequest(workspace,ids,'a'.repeat(middle),true,false);low=middle}catch{high=middle-1}}
    assert.ok(Buffer.byteLength(JSON.stringify(model.reviewRequest(workspace,ids,'a'.repeat(low),true,false)))<=32768);assert.throws(()=>model.reviewRequest(workspace,ids,'a'.repeat(low+1),true,false));
  });
});

test('model schemas preserve serialized workspace, nullable review and blocked receipt contract fields',()=>{
  // These are static service-contract fixtures. Actual handler/storage execution
  // is covered separately by hosted-phone.mjs; this test starts no network server.
  const base={ok:true,accountId:'synthetic-owner',accountEmail:'a@example.com',confirmedEmail:'a@example.com',emailUpdateRequired:false,deleting:false,workspaceId:null,mode:'test',profile:model.blankProfile(),jobs:[],attempts:[],capabilities:{liveEnabled:false,linkedinProfile:true,mode:'test',coverage:'Synthetic only'},recoverablePlans:[],activePlanIds:[]};
  assert.equal(model.workspaceSchema.parse(base).workspaceId,null);
  const prepared=plan(),review=model.planSchema.parse(JSON.parse(JSON.stringify(prepared)));assert.equal(review.items[0].retryAt,null);model.checkReview(review,profile,[job],[]);
  const receipt={id:'00000000-0000-4000-8000-000000000123',planId:prepared.id,jobId:job.id,title:job.title,company:job.company,url:job.url,state:'blocked',createdAt:prepared.createdAt,mode:'test',evidenceMode:'test',error:{code:'requirements_changed',message:'This employer has not connected an authorized application integration.'}};
  const blocked={...prepared,items:prepared.items.map(item=>({...item,state:'blocked',reason:receipt.error.message}))};assert.equal(model.planSchema.parse(blocked).items[0].state,'blocked');assert.equal(model.receiptSchema.parse(receipt).state,'blocked');
  const workspace={...base,workspaceId:'00000000-0000-4000-8000-000000000456',profile,jobs:[job],attempts:[receipt]};assert.equal(model.workspaceSchema.parse(workspace).attempts[0].state,'blocked');assert.equal(model.workspaceSchema.parse({...workspace,deleting:true}).deleting,true);
  const retryAt=new Date(Date.now()+30000).toISOString(),retry={...prepared,items:prepared.items.map(item=>({...item,state:'rate_limited',retryAt}))};assert.equal(model.planSchema.parse(retry).items[0].retryAt,retryAt);
});

test('phone search accepts the published discovery status contract and preserves it in a restored search',async()=>{
  const fixture=JSON.parse(await readFile(new URL('./fixtures/discovery-search-v1.json',import.meta.url),'utf8'));
  assert(fixture.sources.every(source=>!Object.hasOwn(source,'region')));
  const page=model.discoveryPageSchema.parse(fixture);
  assert.equal(page.status,'partial');assert.equal(page.jobs.length,2);
  assert.deepEqual(page.sources,fixture.sources);
  const filters={...model.emptyFilters,sources:fixture.sources.map(source=>source.id)};
  const snapshot={...model.blankSnapshot(scope),filters,lastSearch:{filters,page}};
  assert.deepEqual(model.parseSnapshot(JSON.parse(JSON.stringify(snapshot)),scope).lastSearch,{filters,page});
  for(const changes of [{provider:'unsupported'},{status:'unknown'},{boardUrl:'http://localhost/private'},{availableCount:501},{error:{code:'source_failed'}}]){
    assert.throws(()=>model.discoveryPageSchema.parse({...fixture,sources:[{...fixture.sources[0],...changes}]}));
  }
});


test('each employer keeps separate exact answers and no missing answer is inferred',()=>{
  const workspace='00000000-0000-4000-8000-000000000999',ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
  const answers={ [ids[0]]:{comments:'Message for employer A',consentStore:true,consentMarketing:false}, [ids[1]]:{comments:'Message for employer B',consentStore:false,consentMarketing:true} };
  const body=model.reviewRequest(workspace,ids,'',false,false,answers);assert.deepEqual(body.answers,answers);assert.notEqual(body.answers[ids[0]],answers[ids[0]]);
  assert.throws(()=>model.reviewRequest(workspace,ids,'',false,false,{[ids[0]]:answers[ids[0]]}));
  assert.throws(()=>model.reviewRequest(workspace,ids,'',false,false,{...answers,[ids[1]]:{...answers[ids[1]],consentMarketing:undefined}}));
});

test('receipts require an application ID and consistent live evidence before confirmation',()=>{
  const receipt={id:jobID,planId:plan().id,jobId:jobID,title:job.title,company:job.company,url:job.url,state:'confirmed',createdAt:new Date().toISOString(),mode:'local',evidenceMode:'live',error:null};
  for(const applicationId of [undefined,'','   '])assert.throws(()=>model.receiptSchema.parse({...receipt,applicationId}));
  const confirmed=model.receiptSchema.parse({...receipt,applicationId:'synthetic-employer-acceptance-123',dispatchCount:1});assert.equal(model.receiptLabel(confirmed),'Submission confirmed');
  assert.throws(()=>model.receiptSchema.parse({...confirmed,mode:'test'}));
  assert.match(model.receiptLabel({...confirmed,mode:'test',evidenceMode:'test'}),/Test receipt/);
  assert.match(model.receiptLabel({...receipt,state:'cancelled',dispatchCount:0}),/Stopped before sending/);
  assert.match(model.receiptLabel({...receipt,state:'cancelled',dispatchCount:1}),/earlier request recorded/);
  assert.doesNotMatch(model.receiptLabel({...receipt,state:'cancelled'}),/before sending/);
});

test('career preferences and an unfinished record stage survive encrypted recovery serialization',()=>{
  const value={...model.blankSnapshot(scope),profile:{...model.blankProfile(),targetRoles:['Designer','Nurse'],targetCountries:['NZ','KE','SA'],workModes:['hybrid','remote']}};
  assert.deepEqual(model.parseSnapshot(JSON.parse(JSON.stringify(value)),scope),value);
  const original=model.blankRecord(job),draft={...original,stage:'interview',note:'Unfinished private follow-up'};
  assert.throws(()=>model.recordSchema.parse(draft));
  const recovery=model.recoveryDraftSchema.parse({id:jobID,savedAt:new Date().toISOString(),record:{job,original,draft,existed:false}});assert.equal(recovery.record.draft.note,draft.note);assert.equal(recovery.record.draft.appliedElsewhere,false);
});


test('provider navigation accepts only official authorization endpoints and safe app returns',()=>{
  assert.match(auth.authorizationTarget('google','https://accounts.google.com/o/oauth2/v2/auth?state=synthetic'),/^https:\/\/accounts\.google\.com/);
  assert.match(auth.authorizationTarget('linkedin','https://www.linkedin.com/oauth/v2/authorization?state=synthetic'),/^https:\/\/www\.linkedin\.com/);
  for(const value of ['https://accounts.google.com.evil.example/o/oauth2/v2/auth','http://accounts.google.com/o/oauth2/v2/auth','https://user:secret@accounts.google.com/o/oauth2/v2/auth','https://accounts.google.com/o/oauth2/v2/auth#fragment','https://www.linkedin.com/jobs'])assert.throws(()=>auth.authorizationTarget('google',value));
  assert.equal(auth.internalAuthRedirect('/signout-with-chatgpt?return_to=%2Faccount','https://career.example'),'https://career.example/signout-with-chatgpt?return_to=%2Faccount');
  for(const value of ['//evil.example/','https://evil.example/','/unknown','/signout-with-chatgpt?return_to=https%3A%2F%2Fevil.example','/\\evil.example','/connect\n'])assert.throws(()=>auth.internalAuthRedirect(value,'https://career.example'));
});

test('OAuth callback feedback only accepts exact provider and result enums once',()=>{
  assert.deepEqual(auth.oauthReturn('?oauth_provider=google&oauth_result=signed_in'),{provider:'google',result:'signed_in'});
  assert.deepEqual(auth.oauthReturn('?oauth_provider=linkedin&oauth_result=cancelled&error_description=untrusted'),{provider:'linkedin',result:'cancelled'});
  assert.deepEqual(auth.oauthReturn('?oauth_provider=linkedin&oauth_result=email_required'),{provider:'linkedin',result:'email_required'});
  for(const query of ['','?oauth_provider=google&oauth_result=email_required','?oauth_provider=evil&oauth_result=connected','?oauth_provider=google&oauth_result=<script>','?oauth_provider=google&oauth_provider=linkedin&oauth_result=connected','?oauth_provider=google&oauth_result=connected&oauth_result=failed'])assert.equal(auth.oauthReturn(query),null);
});


test('provider status represents LinkedIn login without treating older basic-link backends as sign-in support',()=>{
  const disconnected={configured:true,connected:false};
  const base={ok:true,account:null,providers:{google:disconnected,linkedin:disconnected}};
  const previous=auth.authStatusSchema.parse(base);
  assert.equal(previous.providers.linkedin.signInSupported,false);
  assert.equal(previous.providers.google.signInSupported,false);
  const current=auth.authStatusSchema.parse({...base,account:{id:'synthetic-linkedin-owner',email:'person@example.com',displayName:'Synthetic Person',method:'linkedin'},providers:{...base.providers,linkedin:{...disconnected,signInSupported:true,connected:true,connectionId:'a'.repeat(64)}}});
  assert.equal(current.account.method,'linkedin');assert.equal(current.providers.linkedin.signInSupported,true);
  for(const method of ['unknown','LinkedIn',''])assert.throws(()=>auth.authStatusSchema.parse({...base,account:{...current.account,method}}));
  assert.throws(()=>auth.authStatusSchema.parse({...base,providers:{...base.providers,linkedin:{...disconnected,connected:true,signInSupported:true}}}));
});
