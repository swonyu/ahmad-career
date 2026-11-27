import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createHostedApplicationHandler,SERVICE_ORIGIN} from '../server/applications.mjs';
import {sha256,canonical} from '../server/validation.mjs';
import {MAX_FRAGMENT_BYTES,MAX_FRAME_BYTES,SNAPSHOT_LIFETIME_MS,makeReadDocument,canonicalReadChunks,createReadFrame,createReadExport,verifyReadCursor,signReadCursor,restoreReadDocument,hasMalformedText,legacyTextPathAllowed} from '../server/read-transport.mjs';

const iso=value=>new Date(value).toISOString();
const START=Date.parse('2026-11-23T09:00:00.000Z');
const SALT='a'.repeat(64),TOKEN='b'.repeat(64);
const spec=(kind='workspace',resourceId=null,variant='')=>({kind,resourceId,variant});
const scope=()=>({audience:'apply',accountId:'synthetic-read-owner',workspaceId:randomUUID(),sessionBinding:sha256(TOKEN)});
const documentBytes=document=>Buffer.concat([...canonicalReadChunks(document)]);
const parseFrame=frame=>JSON.parse(Buffer.from(frame.payloadBase64,'base64'));
const expectCode=(code,status)=>error=>error.code===code&&(status===undefined||error.status===status);
const blank=()=>({firstName:'',lastName:'',email:'reader@example.com',phone:'',city:'',country:'',headline:'',skills:[],targetRoles:[],targetCountries:[],workModes:[],experienceLevel:'any',website:'',linkedin:'',resume:null});

function fixture() {
  const db=new DatabaseSync(':memory:');
  for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  const state={now:START,readBatches:0,failRead:false,submissions:0,beforeRead:null};
  function statement(sql,args=[]) {
    return{sql,args,bind(...values){return statement(sql,values);},
      async first(){if(state.failFirst?.(sql,args))throw Error('synthetic post-write read failure');return db.prepare(sql).get(...args)??null;},
      async all(){return{results:db.prepare(sql).all(...args)};},
      async run(){const result={meta:{changes:Number(db.prepare(sql).run(...args).changes)}};state.afterRun?.(sql,args,result);return result;}};
  }
  const DB={prepare:statement,async batch(statements){
    const read=statements.every(s=>/^SELECT\b/i.test(s.sql));
    if(read){state.readBatches++;state.beforeRead?.();if(state.failRead)throw Error('synthetic read failure');}
    db.exec('BEGIN');
    try {
      const result=statements.map(s=>/^SELECT\b/i.test(s.sql)?{results:db.prepare(s.sql).all(...s.args),meta:{changes:0}}:{meta:{changes:Number(db.prepare(s.sql).run(...s.args).changes)}});
      db.exec('COMMIT');return result;
    } catch(error){db.exec('ROLLBACK');throw error;}
  }};
  const env={DB,BUCKET:{async head(){return null;},async get(){return null;}},CAREER_CONNECTORS_JSON:JSON.stringify({version:1,connectors:[]})};
  const handler=createHostedApplicationHandler({clock:()=>state.now,adapterFactory:()=>({mode:'test',async posting(){throw Error('unexpected provider read');},async submit(){state.submissions++;throw Error('unexpected provider submission');}})});
  const workspaceId=randomUUID(),accountId='synthetic-read-owner';
  db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('identity_salt',SALT);
  db.prepare('INSERT INTO workspaces(id,owner_id,owner_email,created_at,profile_json) VALUES(?,?,?,?,?)').run(workspaceId,accountId,'reader@example.com',iso(START),JSON.stringify(blank()));
  db.prepare('INSERT INTO native_sessions(token_hash,id,workspace_id,created_at,expires_at) VALUES(?,?,?,?,?)').run(sha256(TOKEN),randomUUID(),workspaceId,iso(START),iso(START+86400000));
  const owner={'oai-authenticated-user-id':accountId,'oai-authenticated-user-email':'reader@example.com'};
  async function request(path,{method='GET',body,token=TOKEN,browser=false,v2=true,headers={}}={}) {
    return handler(new Request(SERVICE_ORIGIN+path,{method,headers:{...(browser?owner:{authorization:'Bearer '+token}),...(v2?{'X-Career-Read-Version':'2'}:{}),...(body!==undefined?{'content-type':'application/json',...(browser?{origin:SERVICE_ORIGIN}:{})}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env,{});
  }
  async function call(path,options={}){const response=await request(path,options);return{status:response.status,headers:response.headers,body:await response.json()};}
  function profile(value){db.prepare('UPDATE workspaces SET profile_json=? WHERE id=?').run(JSON.stringify(value),workspaceId);}
  function job({title='Synthetic role',url='https://example.com/jobs/one'}={}) {
    const id=randomUUID(),value={id,provider:'manual',key:'manual:'+sha256(url),url,title,company:'Synthetic employer',location:'Riyadh',country:'SA',region:null,site:null,postingId:null,workMode:'',metadataHash:null};
    db.prepare('INSERT INTO jobs(id,workspace_id,job_key,data_json,created_at) VALUES(?,?,?,?,?)').run(id,workspaceId,value.key,JSON.stringify(value),iso(START));return value;
  }
  function plan({malformed=false,snapshotMalformed=false,approved=false,state:readyState='ready'}={}) {
    const saved=job(),id=randomUUID(),attemptId=randomUUID(),p={...blank(),firstName:'Example',resume:{name:'synthetic.pdf',mime:'application/pdf',size:123,sha256:'c'.repeat(64),objectKey:'synthetic-only'}};
    if(snapshotMalformed)p.headline='Original\uD800';
    const item={jobId:saved.id,attemptId,job:{id:saved.id,title:saved.title,company:saved.company,url:saved.url,location:saved.location,country:saved.country},title:saved.title,company:saved.company,state:'ready',reason:'',payloadSummary:{name:malformed?'Original\uD800':'Example',email:p.email,phone:'',website:'',comments:''},resume:p.resume,privacyPolicyUrl:null,requirementsRevision:null};
    const snapshot={job:saved,profile:p,profileRevision:0,answers:{comments:''},requirements:{revision:'v1',expiresAt:iso(START+86400000)},mode:'test',payloadSHA256:'d'.repeat(64)};
    const digest=sha256(canonical(item));
    db.prepare('INSERT INTO plans(id,workspace_id,digest,profile_revision,created_at,expires_at,items_json,approval_generation,approved_at,last_approved_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,workspaceId,digest,0,iso(START),iso(START+1800000),JSON.stringify([item]),approved?1:0,approved?iso(START):null,approved?iso(START):null);
    db.prepare('INSERT INTO attempts(id,plan_id,workspace_id,applicant_hash,job_key,job_id,state,snapshot_json,created_at,mode) VALUES(?,?,?,?,?,?,?,?,?,?)').run(attemptId,id,workspaceId,'e'.repeat(64),saved.key,saved.id,readyState,JSON.stringify(snapshot),iso(START),'test');
    return{id,digest,attemptId,job:saved};
  }
  return{db,env,state,request,call,workspaceId,accountId,owner,profile,job,plan,close:()=>db.close()};
}

test('exact malformed UTF-16, Arabic, emoji and literal escapes round-trip without rewriting digests',()=>{
  const data={ok:true,profile:{...blank(),firstName:'ع😀\uD800\\uD800�',lastName:'\uDC00',resume:{name:'a\uD800.pdf'}},recoverablePlans:[{id:randomUUID(),digest:'a'.repeat(64),items:[{payloadSummary:{comments:'x\uD800y'},requirementsRevision:'r\uDC00'}]}]};
  const before=JSON.stringify(data),document=JSON.parse(documentBytes(makeReadDocument(data,'workspace')));
  assert.equal(hasMalformedText(document),false);assert.equal(document.legacyText.length,5);
  assert.equal(document.data.profile.firstName,'ع😀\\uD800\\uD800�');
  assert.deepEqual(restoreReadDocument(document,'workspace'),JSON.parse(before));
  assert.equal(JSON.stringify(data),before);assert.equal(document.data.recoverablePlans[0].digest,'a'.repeat(64));
});

test('all URL fields, control identities and malformed object keys require complete raw recovery',()=>{
  for(const [data,reasonCode] of [
    [{ok:true,profile:{website:'https://example.com/\uD800'}},'malformed_url_or_control'],
    [{ok:true,jobs:[{url:'https://example.com/\uD800'}]},'malformed_url_or_control'],
    [{ok:true,recoverablePlans:[{id:'\uD800'}]},'malformed_url_or_control'],
    [{ok:true,profile:{['x\uD800']:'first','x�':'second'}},'malformed_object_key'],
  ]) {
    const document=JSON.parse(documentBytes(makeReadDocument(data,'workspace')));
    assert.deepEqual(Object.keys(document).sort(),['documentVersion','mode','originalJSONBase64','reasonCode']);
    assert.equal(document.mode,'raw-recovery');assert.equal(document.reasonCode,reasonCode);
    assert.deepEqual(JSON.parse(Buffer.from(document.originalJSONBase64,'base64')),data);
  }
});

test('legacy provider receipt identifiers are evidence; authority and URL paths are excluded',()=>{
  assert.equal(legacyTextPathAllowed('receipts',['receipts',0,'applicationId']),true);
  assert.equal(legacyTextPathAllowed('workspace',['recoverablePlans',0,'items',0,'requirementsRevision']),true);
  for(const path of [['jobs',0,'url'],['recoverablePlans',0,'digest'],['attempts',0,'state'],['profile','website'],['__proto__','x']])assert.equal(legacyTextPathAllowed('workspace',path),false);
  const document=JSON.parse(documentBytes(makeReadDocument({ok:true,receipts:[{applicationId:'provider\uD800',state:'confirmed'}]},'receipts')));
  assert.equal(document.data.receipts[0].state,'confirmed');assert.equal(restoreReadDocument(document,'receipts').receipts[0].applicationId,'provider\uD800');
});

test('sidecar decoder rejects retargeting, duplicate entries, malformed base64 and incomplete provenance',()=>{
  const original=JSON.parse(documentBytes(makeReadDocument({ok:true,profile:{firstName:'a\uD800'}},'workspace')));
  const mutations=[d=>{d.legacyText.push(d.legacyText[0]);},d=>{d.legacyText[0].path=['profile','website'];},d=>{d.legacyText[0].utf16leBase64+='=';},d=>{d.legacyText[0].utf16leBase64='YQ==';},d=>{d.legacyText[0].utf16leBase64=Buffer.from('abc','utf16le').toString('base64');},d=>{d.data.profile.firstName='changed';},d=>{d.data.profile.firstName='\uD800';},d=>{d.extra=true;}];
  for(const mutate of mutations){const copy=structuredClone(original);mutate(copy);assert.throws(()=>restoreReadDocument(copy,'workspace'));}
});

test('a single field crossing fragment boundaries assembles exactly under frame limits',()=>{
  const data={ok:true,profile:{firstName:'界'.repeat(Math.ceil(MAX_FRAGMENT_BYTES/3)+10)}},identity=scope();
  const initial=createReadFrame({data,spec:spec(),scope:identity,salt:SALT,asOf:iso(START)}),parts=[Buffer.from(initial.payloadBase64,'base64')];
  assert.equal(parts[0].length,MAX_FRAGMENT_BYTES);assert.ok(initial.read.nextCursor);assert.ok(Buffer.byteLength(JSON.stringify(initial))<MAX_FRAME_BYTES);
  const claims=verifyReadCursor(initial.read.nextCursor,{scope:identity,salt:SALT,now:START+1});
  const next=createReadFrame({data,spec:spec(),scope:identity,salt:SALT,asOf:claims.asOf,expected:claims});parts.push(Buffer.from(next.payloadBase64,'base64'));
  assert.equal(next.read.offset,MAX_FRAGMENT_BYTES);assert.equal(next.read.nextCursor,null);assert.equal(next.operation,null);
  const bytes=Buffer.concat(parts);assert.equal(bytes.length,initial.read.totalBytes);assert.equal(sha256(bytes),initial.read.sha256);assert.deepEqual(restoreReadDocument(JSON.parse(bytes),'workspace'),data);
});

test('cursor signature, account, workspace, session, audience, syntax and current expiry are enforced',()=>{
  const identity=scope(),frame=createReadFrame({data:{ok:true},spec:spec(),scope:identity,salt:SALT,asOf:iso(START)}),cursor=frame.read.exportCursor;
  assert.equal(verifyReadCursor(cursor,{scope:identity,salt:SALT,now:START+1}).offset,0);
  for(const changed of [{accountId:'another-owner'},{workspaceId:randomUUID()},{sessionBinding:'c'.repeat(64)},{audience:'phone'}])assert.throws(()=>verifyReadCursor(cursor,{scope:{...identity,...changed},salt:SALT,now:START}),expectCode('workspace_changed',409));
  assert.throws(()=>verifyReadCursor(cursor,{scope:identity,salt:SALT,now:START+SNAPSHOT_LIFETIME_MS}),expectCode('snapshot_expired',409));
  assert.throws(()=>verifyReadCursor(cursor.slice(0,-1)+(cursor.endsWith('0')?'1':'0'),{scope:identity,salt:SALT,now:START}),expectCode('invalid_read_cursor',422));
  const claims=verifyReadCursor(cursor,{scope:identity,salt:SALT,now:START});
  for(const changes of [{offset:1},{totalBytes:0},{variant:'arbitrary'},{extra:true},{asOf:'2026-11-23T09:00:00Z'}])assert.throws(()=>verifyReadCursor(signReadCursor({...claims,...changes},SALT),{scope:identity,salt:SALT,now:START}),expectCode('invalid_read_cursor',422));
});

test('changed or shortened snapshots cannot return mixed fragments',()=>{
  const identity=scope(),data={ok:true,profile:{firstName:'x'.repeat(MAX_FRAGMENT_BYTES+50)}};
  const frame=createReadFrame({data,spec:spec(),scope:identity,salt:SALT,asOf:iso(START)}),claims=verifyReadCursor(frame.read.nextCursor,{scope:identity,salt:SALT,now:START});
  for(const value of ['short','y'.repeat(MAX_FRAGMENT_BYTES+50)])assert.throws(()=>createReadFrame({data:{ok:true,profile:{firstName:value}},spec:spec(),scope:identity,salt:SALT,asOf:claims.asOf,expected:claims}),expectCode('snapshot_changed',409));
});

test('streamed export matches its document digest and excludes operation credentials',async()=>{
  const identity=scope(),data={ok:true,profile:{firstName:'x\uD800'}},frame=createReadFrame({data,spec:spec(),scope:identity,salt:SALT,asOf:iso(START),operation:{kind:'workspace',acknowledged:true,accountId:identity.accountId,workspaceId:identity.workspaceId}});
  const expected=verifyReadCursor(frame.read.exportCursor,{scope:identity,salt:SALT,now:START}),response=createReadExport({data,spec:spec(),scope:identity,expected}),bytes=Buffer.from(await response.arrayBuffer());
  assert.equal(response.headers.get('X-Career-Read-Version'),'2');assert.equal(response.headers.get('X-Career-Read-SHA256'),sha256(bytes));assert.equal(Number(response.headers.get('X-Career-Read-Bytes')),bytes.length);
  assert.ok(response.headers.get('Content-Disposition').includes('attachment'));assert.equal(sha256(bytes),frame.read.sha256);
  assert.equal(bytes.includes(Buffer.from('operation')),false);assert.equal(bytes.includes(Buffer.from(TOKEN)),false);
});

test('actual handler preserves v1 and returns coherent v2 workspace with explicit identity',async t=>{
  const f=fixture();t.after(f.close);f.job();
  const legacy=await f.call('/api/apply/workspace',{v2:false}),current=await f.call('/api/apply/workspace');
  assert.equal(legacy.headers.get('X-Career-Read-Version'),null);assert.equal(current.headers.get('X-Career-Read-Version'),'2');assert.equal(current.status,200);
  assert.deepEqual(restoreReadDocument(parseFrame(current.body),'workspace'),legacy.body);assert.equal(current.body.read.accountId,f.accountId);assert.equal(current.body.read.workspaceId,f.workspaceId);assert.equal(f.state.readBatches,1);
  assert.equal((await f.call('/api/apply/status')).headers.get('X-Career-Read-Version'),null);
});

test('actual read-only browser workspace without records is small and needs no snapshot secret',async t=>{
  const f=fixture();t.after(f.close);f.db.prepare('DELETE FROM native_sessions').run();f.db.prepare('DELETE FROM workspaces').run();f.db.prepare('DELETE FROM meta').run();
  const result=await f.call('/api/phone/workspace',{browser:true});assert.equal(result.status,200);assert.equal(result.body.read.workspaceId,null);assert.equal(result.body.read.exportCursor,null);assert.equal(result.body.read.nextCursor,null);
  assert.equal(restoreReadDocument(parseFrame(result.body),'workspace').accountId,f.accountId);
});

test('actual handler reads long historical URLs and sidecar text without changing stored bytes',async t=>{
  const f=fixture();t.after(f.close);const p={...blank(),firstName:'A\uD800',website:'https://example.com/'+'%E7%95%8C'.repeat(2029),resume:{name:'CV\uD800.pdf',mime:'application/pdf',size:1,sha256:'c'.repeat(64)}};f.profile(p);const original=f.db.prepare('SELECT profile_json FROM workspaces').get().profile_json;
  const result=await f.call('/api/apply/workspace');assert.equal(result.status,200);const document=parseFrame(result.body);assert.equal(document.legacyText.length,2);assert.deepEqual(restoreReadDocument(document,'workspace').profile,{...p,revision:0});assert.equal(f.db.prepare('SELECT profile_json FROM workspaces').get().profile_json,original);
});

test('actual authenticated export includes complete raw fallback and enforces exact cursor syntax',async t=>{
  const f=fixture();t.after(f.close);f.profile({...blank(),website:'https://example.com/\uD800'});
  const frame=(await f.call('/api/apply/workspace')).body,document=parseFrame(frame);assert.equal(document.mode,'raw-recovery');
  const exported=await f.request('/api/apply/read-export?cursor='+encodeURIComponent(frame.read.exportCursor),{v2:false}),bytes=Buffer.from(await exported.arrayBuffer());assert.equal(exported.status,200);assert.equal(sha256(bytes),frame.read.sha256);assert.deepEqual(JSON.parse(bytes),document);
  for(const query of ['cursor='+encodeURIComponent(frame.read.exportCursor)+'&cursor=x','cursor='+encodeURIComponent(frame.read.exportCursor)+'&url=https://example.com','wrong=x'])assert.equal((await f.call('/api/apply/read?'+query)).body.error.code,'invalid_read_cursor');
});

test('actual continuation uses current session expiry, revocation and deletion despite frozen asOf',async t=>{
  const f=fixture();t.after(f.close);const frame=(await f.call('/api/apply/workspace')).body,route='/api/apply/read?cursor='+encodeURIComponent(frame.read.exportCursor);
  f.db.prepare('UPDATE native_sessions SET expires_at=?').run(iso(START+1000));f.state.now+=1000;assert.equal((await f.call(route)).status,401);
  f.db.prepare('UPDATE native_sessions SET expires_at=?').run(iso(START+86400000));f.db.prepare('UPDATE workspaces SET deleting_at=?').run(iso(f.state.now));assert.equal((await f.call(route)).body.error.code,'account_deleting');
  f.db.prepare('UPDATE workspaces SET deleting_at=NULL').run();f.db.prepare('DELETE FROM native_sessions').run();assert.equal((await f.call(route)).status,401);
});

test('actual continuation rejects another valid session, account and audience',async t=>{
  const f=fixture();t.after(f.close);const frame=(await f.call('/api/apply/workspace')).body,cursor=encodeURIComponent(frame.read.exportCursor),other='c'.repeat(64),otherWorkspace=randomUUID();
  f.db.prepare('INSERT INTO native_sessions(token_hash,id,workspace_id,created_at,expires_at) VALUES(?,?,?,?,?)').run(sha256(other),randomUUID(),f.workspaceId,iso(START),iso(START+86400000));
  assert.equal((await f.call('/api/apply/read?cursor='+cursor,{token:other})).body.error.code,'workspace_changed');
  assert.equal((await f.call('/api/phone/read?cursor='+cursor,{browser:true})).body.error.code,'workspace_changed');
  f.db.prepare('INSERT INTO workspaces(id,owner_id,owner_email,created_at,profile_json) VALUES(?,?,?,?,?)').run(otherWorkspace,'another-owner','other@example.com',iso(START),JSON.stringify(blank()));f.db.prepare('UPDATE native_sessions SET workspace_id=? WHERE token_hash=?').run(otherWorkspace,sha256(other));
  assert.equal((await f.call('/api/apply/read?cursor='+cursor,{token:other})).body.error.code,'workspace_changed');
});

test('actual read snapshot fixes derived time while rejecting source mutations',async t=>{
  const f=fixture();t.after(f.close);f.plan();const frame=(await f.call('/api/apply/workspace')).body,route='/api/apply/read?cursor='+encodeURIComponent(frame.read.exportCursor);
  f.db.prepare('UPDATE plans SET expires_at=?').run(iso(START+1000));const fresh=(await f.call('/api/apply/workspace')).body;
  f.state.now+=2000;const unchanged=await f.call('/api/apply/read?cursor='+encodeURIComponent(fresh.read.exportCursor));assert.equal(unchanged.status,200);assert.equal(unchanged.body.read.sha256,fresh.read.sha256);
  assert.equal((await f.call(route)).body.error.code,'snapshot_changed');f.profile({...blank(),headline:'changed'});assert.equal((await f.call('/api/apply/read?cursor='+encodeURIComponent(fresh.read.exportCursor))).body.error.code,'snapshot_changed');
});

test('actual read rechecks authority and workspace state within its database transaction',async t=>{
  const f=fixture();t.after(f.close);f.state.beforeRead=()=>{f.db.prepare('DELETE FROM native_sessions').run();f.state.beforeRead=null;};
  const result=await f.call('/api/apply/workspace');assert.equal(result.status,401);assert.equal(result.body.error.code,'session_required');
});

test('browser provider identity and revocation are read in the same snapshot transaction',async t=>{
  const f=fixture();t.after(f.close);const generation=randomUUID(),cookie='f'.repeat(64),subject='synthetic-subject';
  f.db.prepare('INSERT INTO auth_accounts(owner_id,origin_method,generation,created_at) VALUES(?,?,?,?)').run(f.accountId,'google',generation,START);
  f.db.prepare('INSERT INTO auth_identities(provider,subject,subject_hash,owner_id,email,display_name,connected_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('google',subject,'e'.repeat(64),f.accountId,'reader@example.com','Synthetic',iso(START),iso(START));
  f.db.prepare('INSERT INTO browser_sessions(token_hash,id,owner_id,account_generation,provider,subject,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').run(sha256(cookie),randomUUID(),f.accountId,generation,'google',subject,START,START+86400000);
  const options={browser:true,headers:{cookie:'__Host-career-session='+cookie}};
  f.state.beforeRead=()=>{f.db.prepare('UPDATE auth_identities SET email=?').run('updated@example.com');f.state.beforeRead=null;};
  const current=await f.call('/api/phone/workspace',options);assert.equal(current.status,200);const data=restoreReadDocument(parseFrame(current.body),'workspace');assert.equal(data.accountEmail,'updated@example.com');assert.equal(data.emailUpdateRequired,true);
  f.state.beforeRead=()=>{f.db.prepare('DELETE FROM browser_sessions').run();f.state.beforeRead=null;};
  assert.equal((await f.call('/api/phone/read?cursor='+encodeURIComponent(current.body.read.exportCursor),options)).status,401);
});

test('successful profile save retains acknowledgement when its following read fails',async t=>{
  const f=fixture();t.after(f.close);f.state.failRead=true;
  const result=await f.call('/api/apply/profile',{method:'PUT',body:{expectedRevision:0,profile:{...blank(),firstName:'Saved exactly once'}}});
  assert.equal(result.status,200);assert.equal(result.body.read,null);assert.equal(result.body.operation.kind,'profile');assert.equal(result.body.operation.revision,1);assert.equal(result.body.readError.code,'read_unavailable');
  assert.equal(f.db.prepare('SELECT revision FROM workspaces').get().revision,1);assert.equal(JSON.parse(f.db.prepare('SELECT profile_json FROM workspaces').get().profile_json).firstName,'Saved exactly once');
});

test('successful job save and prepare retain operation identity when follow-up reads fail',async t=>{
  const f=fixture();t.after(f.close);f.state.failRead=true;
  const saved=await f.call('/api/apply/jobs',{method:'POST',body:{url:'https://example.com/jobs/new',title:'Synthetic',company:'Example',location:'Riyadh',country:'SA'}});
  assert.equal(saved.status,201);assert.equal(saved.body.operation.kind,'jobs');assert.equal(saved.body.read,null);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n,1);
  const prepared=await f.call('/api/apply/prepare',{method:'POST',body:{jobIds:[saved.body.operation.jobId],answers:{},reviewSchema:3}});
  assert.equal(prepared.status,201);assert.equal(prepared.body.read,null);assert.equal(prepared.body.operation.kind,'prepare');const plan=f.db.prepare('SELECT * FROM plans').get();assert.equal(plan.id,prepared.body.operation.planId);assert.equal(plan.digest,prepared.body.operation.digest);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM plans').get().n,1);
});

test('browser open acknowledges confirmed workspace independently of its following view',async t=>{
  const f=fixture();t.after(f.close);f.state.failRead=true;
  const result=await f.call('/api/phone/workspace',{method:'POST',browser:true,body:{expectedAccountId:f.accountId}});assert.equal(result.status,200);assert.equal(result.body.operation.kind,'workspace');assert.equal(result.body.operation.workspaceId,f.workspaceId);assert.equal(result.body.read,null);
});

test('browser workspace creation remains acknowledged when its immediate read-back fails',async t=>{
  const f=fixture();t.after(f.close);f.db.prepare('DELETE FROM native_sessions').run();f.db.prepare('DELETE FROM workspaces').run();
  f.state.afterRun=(sql,args,result)=>{if(sql.startsWith('INSERT OR IGNORE INTO workspaces')&&result.meta.changes===1)f.state.failFirst=query=>query==='SELECT * FROM workspaces WHERE owner_id=?';};
  const result=await f.call('/api/phone/workspace',{method:'POST',browser:true,body:{expectedAccountId:f.accountId}});
  assert.equal(result.status,200);assert.equal(result.body.read,null);assert.equal(result.body.operation.kind,'workspace');assert.equal(result.body.operation.workspaceId,f.db.prepare('SELECT id FROM workspaces').get().id);assert.equal(result.body.readError.code,'read_unavailable');assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM workspaces').get().n,1);
});

test('browser email confirmation remains acknowledged if its read-back fails after committing',async t=>{
  const f=fixture();t.after(f.close);f.db.prepare('UPDATE workspaces SET owner_email=?').run('old@example.com');
  f.state.afterRun=(sql,args,result)=>{if(sql.startsWith('UPDATE workspaces SET owner_email=')&&result.meta.changes===1)f.state.failFirst=query=>query==='SELECT * FROM workspaces WHERE owner_id=?';};
  const result=await f.call('/api/phone/workspace',{method:'POST',browser:true,body:{expectedAccountId:f.accountId}});
  assert.equal(result.status,200);assert.equal(result.body.operation.kind,'workspace');assert.equal(result.body.operation.workspaceId,f.workspaceId);assert.equal(result.body.read,null);assert.deepEqual({...f.db.prepare('SELECT owner_email,revision FROM workspaces').get()},{owner_email:'reader@example.com',revision:1});
});

test('browser workspace acknowledgement survives a later identity-ledger initialization failure',async t=>{
  const f=fixture();t.after(f.close);f.state.afterRun=sql=>{if(sql.includes("VALUES('identity_salt',?)"))throw Error('synthetic salt write response failure');};
  const result=await f.call('/api/phone/workspace',{method:'POST',browser:true,body:{expectedAccountId:f.accountId}});assert.equal(result.status,200);assert.equal(result.body.operation.kind,'workspace');assert.equal(result.body.read,null);assert.equal(result.body.readError.code,'read_unavailable');
});

test('pairing v2 returns a small credential acknowledgement without historical profile',async t=>{
  const f=fixture();t.after(f.close);f.profile({...blank(),firstName:'old\uD800'});const code='ABCDEFGHJKLMNPQR';
  f.db.prepare('INSERT INTO pairing_codes(code_hash,workspace_id,created_at,expires_at) VALUES(?,?,?,?)').run(sha256(code),f.workspaceId,iso(START),iso(START+300000));
  const paired=await f.call('/api/apply/session',{method:'POST',body:{pairingCode:code}});assert.equal(paired.status,200);assert.equal(paired.body.read,null);assert.equal(paired.body.operation.kind,'session');assert.equal(paired.body.operation.accountId,f.accountId);assert.match(paired.body.operation.sessionToken,/^[a-f0-9]{64}$/);assert.equal(Object.hasOwn(paired.body,'profile'),false);assert.equal(hasMalformedText(paired.body),false);
  assert.equal((await f.call('/api/apply/session',{method:'POST',body:{pairingCode:code}})).status,401);
  const revoke=await f.call('/api/apply/session/revoke',{method:'POST',token:paired.body.operation.sessionToken,body:{}});assert.equal(revoke.body.operation.kind,'session/revoke');assert.equal((await f.call('/api/apply/workspace',{token:paired.body.operation.sessionToken})).status,401);
});

test('malformed immutable plans cannot be newly approved or advanced, including v1 calls',async t=>{
  const f=fixture();t.after(f.close);const plan=f.plan({malformed:true,approved:true}),before=f.db.prepare('SELECT * FROM plans WHERE id=?').get(plan.id),attempt=f.db.prepare('SELECT * FROM attempts WHERE id=?').get(plan.attemptId);
  for(const v2 of [false,true])for(const route of ['submit','advance']){
    const result=await f.call('/api/apply/'+route,{method:'POST',v2,body:route==='submit'?{planId:plan.id,digest:plan.digest,approved:true,reviewSchema:3}:{planId:plan.id}});assert.equal(result.status,409);assert.equal(result.body.error.code,'recovery_required');
  }
  assert.deepEqual(f.db.prepare('SELECT * FROM plans WHERE id=?').get(plan.id),before);assert.deepEqual(f.db.prepare('SELECT * FROM attempts WHERE id=?').get(plan.attemptId),attempt);assert.equal(f.state.submissions,0);
  assert.equal((await f.call('/api/apply/workspace')).status,200);
  const stop=await f.call('/api/apply/stop',{method:'POST',body:{planId:plan.id}});assert.equal(stop.status,200);assert.equal(stop.body.operation.kind,'stop');assert.equal(f.db.prepare('SELECT digest,items_json FROM plans WHERE id=?').get(plan.id).items_json,before.items_json);assert.equal(f.db.prepare('SELECT state FROM attempts WHERE id=?').get(plan.attemptId).state,'cancelled');
});

test('malformed strings hidden outside plan summaries also block immutable snapshot dispatch',async t=>{
  const f=fixture();t.after(f.close);const plan=f.plan({snapshotMalformed:true,approved:true});assert.equal((await f.call('/api/apply/advance',{method:'POST',body:{planId:plan.id}})).body.error.code,'recovery_required');assert.equal(f.state.submissions,0);
});

test('successful approval and Stop preserve acknowledgements if view construction fails',async t=>{
  const f=fixture();t.after(f.close);const plan=f.plan();f.state.failRead=true;
  const approval=await f.call('/api/apply/submit',{method:'POST',body:{planId:plan.id,digest:plan.digest,approved:true,reviewSchema:3}});assert.equal(approval.status,202);assert.equal(approval.body.operation.kind,'submit');assert.equal(approval.body.read,null);assert.equal(f.db.prepare('SELECT approval_generation FROM plans WHERE id=?').get(plan.id).approval_generation,1);
  const stop=await f.call('/api/apply/stop',{method:'POST',body:{planId:plan.id}});assert.equal(stop.status,200);assert.equal(stop.body.operation.kind,'stop');assert.equal(stop.body.read,null);assert.equal(f.db.prepare('SELECT stopped FROM plans WHERE id=?').get(plan.id).stopped,1);
});

test('an acknowledged advance with no eligible work is retained after a read failure and never sends',async t=>{
  const f=fixture();t.after(f.close);const plan=f.plan({approved:true,state:'cancelled'});f.state.failRead=true;
  const result=await f.call('/api/apply/advance',{method:'POST',body:{planId:plan.id}});assert.equal(result.status,200);assert.equal(result.body.operation.kind,'advance');assert.equal(result.body.operation.planId,plan.id);assert.equal(result.body.operation.digest,plan.digest);assert.equal(result.body.read,null);assert.equal(f.state.submissions,0);
});

test('an advance lease-recovery write remains acknowledged if the next database read fails',async t=>{
  const f=fixture();t.after(f.close);const plan=f.plan({approved:true,state:'dispatching'});f.db.prepare('UPDATE attempts SET lease_expires_at=? WHERE id=?').run(iso(START-1),plan.attemptId);
  f.state.afterRun=(sql,args,result)=>{if(sql.includes("state='uncertain',error_code='worker_interrupted'")&&result.meta.changes===1)f.state.failFirst=query=>query.includes("state='dispatching' LIMIT 1");};
  const result=await f.call('/api/apply/advance',{method:'POST',body:{planId:plan.id}});assert.equal(result.status,200);assert.equal(result.body.operation.kind,'advance');assert.equal(result.body.operation.planId,plan.id);assert.equal(result.body.read,null);assert.equal(f.db.prepare('SELECT state FROM attempts WHERE id=?').get(plan.attemptId).state,'uncertain');assert.equal(f.state.submissions,0);
});

test('receipts retain source state and exact historical résumé filename evidence',async t=>{
  const f=fixture();t.after(f.close);const plan=f.plan();f.db.prepare('UPDATE attempts SET state=?,application_id=?,response_hash=? WHERE id=?').run('confirmed','provider-original','f'.repeat(64),plan.attemptId);
  // SQLite's native string binding cannot retain unpaired UTF-16. Verify the
  // service path with a raw stored JSON filename and a valid receipt ID; the
  // pure codec above covers exact malformed ID units returned by a provider DB.
  const row=f.db.prepare('SELECT snapshot_json FROM attempts WHERE id=?').get(plan.attemptId),snapshot=JSON.parse(row.snapshot_json);snapshot.profile.resume.name='Original\uD800.pdf';f.db.prepare('UPDATE attempts SET snapshot_json=? WHERE id=?').run(JSON.stringify(snapshot),plan.attemptId);
  const result=await f.call('/api/apply/receipts');assert.equal(result.status,200);const document=parseFrame(result.body),data=restoreReadDocument(document,'receipts');assert.equal(data.receipts[0].state,'confirmed');assert.equal(data.receipts[0].resumeName,'Original\uD800.pdf');assert.equal(data.receipts[0].responseSHA256,'f'.repeat(64));assert.equal(data.exportedAt,iso(START));
});
