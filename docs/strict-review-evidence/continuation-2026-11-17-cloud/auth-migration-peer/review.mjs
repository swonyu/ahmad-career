// Independent, actual-D1 race review. Uses only isolated synthetic identities.
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=process.argv[2]??fileURLToPath(new URL('../../../../hosted',import.meta.url));
const out=fileURLToPath(new URL('.',import.meta.url));
const require=createRequire(root+'/package.json');
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {createOAuthHandler}=await import(pathToFileURL(root+'/server/oauth.mjs'));
const {AUTH_ORIGIN,BROWSER_SESSION_COOKIE,captureOwnerLifecycle}=await import(pathToFileURL(root+'/server/identity.mjs'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const paths=['server/oauth.mjs','server/identity.mjs','drizzle/0004_provider_connection_generation.sql'];
const hashes=Object.fromEntries(await Promise.all(paths.map(async path=>[path,hash(await readFile(root+'/'+path))])));
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("synthetic migration peer fixture")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']}));
let db,time=Date.now(),networkCalls=0;
const passed=[];
const headers=owner=>({'oai-authenticated-user-id':owner,'oai-authenticated-user-email':owner+'@example.com'});
const stmt=(sql,...args)=>db.prepare(sql).bind(...args);
async function row(owner,provider='linkedin'){return stmt('SELECT * FROM auth_identities WHERE owner_id=? AND provider=?',owner,provider).first();}
async function account(owner,generation=randomUUID()) {await stmt('INSERT INTO auth_accounts(owner_id,origin_method,generation,created_at) VALUES(?,?,?,?)',owner,'chatgpt',generation,time).run();return generation;}
async function link(owner,provider='linkedin',subject=owner+'-'+provider,legacy=true){await stmt('INSERT INTO auth_identities(provider,subject,subject_hash,owner_id,email,display_name,connected_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',provider,subject,hash(provider+'\0'+subject),owner,owner+'@example.com','Synthetic '+owner,new Date(time).toISOString(),new Date(time).toISOString()).run();if(legacy)await stmt("UPDATE auth_identities SET connection_id='' WHERE owner_id=? AND provider=?",owner,provider).run();return subject;}
async function reset(){time+=61000;await db.batch(['oauth_transactions','browser_sessions','auth_identities','auth_accounts','auth_deletion_fences','auth_rates','workspaces','account_lifecycles'].map(table=>db.prepare('DELETE FROM '+table)));}
async function status(owner,{environment,token}={}){const request=new Request(AUTH_ORIGIN+'/api/auth/status',{headers:{...(owner?headers(owner):{}),...(token?{cookie:BROWSER_SESSION_COOKIE+'='+token}:{})}});const handler=createOAuthHandler({clock:()=>time,fetchImpl:async()=>{networkCalls++;throw Error('No external network is permitted');}});const response=await handler(request,environment??{DB:db});return{status:response.status,data:await response.json()};}
function observeBeforeStatusBatch(change){let fired=false,batches=0;const underlying=new WeakMap();function wrap(query,sql,args=[]){const wrapper={bind(...values){return wrap(query.bind(...values),sql,values);},first(...values){return query.first(...values);},all(...values){return query.all(...values);},run(...values){return query.run(...values);},raw(...values){return query.raw(...values);}};underlying.set(wrapper,{query,sql,args});return wrapper;}return{environment:{DB:{prepare:sql=>wrap(db.prepare(sql),sql),async batch(queries){batches++;if(!fired){fired=true;await change();}return db.batch(queries.map(query=>underlying.get(query)?.query??query));}}},assertFired(){assert(fired,'Status must reach an explicit atomic authority/read batch');},get batches(){return batches;}};}
async function group(name,fn){await reset();await fn();passed.push(name);process.stdout.write('PASS '+name+'\n');}

try{
 db=await mf.getD1Database('DB');
 const files=(await readdir(root+'/drizzle')).filter(file=>file.endsWith('.sql')).sort();
 for(const file of files){
  if(file==='0004_provider_connection_generation.sql'){
   await account('synthetic-migration');
   await stmt('INSERT INTO auth_identities(provider,subject,subject_hash,owner_id,email,display_name,connected_at,updated_at) VALUES(?,?,?,?,?,?,?,?)','linkedin','pre-migration-subject',hash('pre-migration-subject'),'synthetic-migration',null,'Synthetic existing link',new Date(time).toISOString(),new Date(time).toISOString()).run();
  }
  const chunks=(await readFile(root+'/drizzle/'+file,'utf8')).split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean);
  if(file==='0004_provider_connection_generation.sql'){
   for(const chunk of chunks){const statement=chunk.replace(/^\s*--[^\n]*(?:\n|$)/gm,'').trim();assert(/^(?:ALTER TABLE|CREATE TRIGGER)\b/i.test(statement),'0004 must contain schema/trigger definitions, not a top-level data backfill');}
  }
  for(const chunk of chunks)await db.prepare(chunk).run();
 }
 assert.equal((await row('synthetic-migration')).connection_id,'','Existing link must remain empty after schema-only migration');
 passed.push('0004 is schema-only and leaves pre-upgrade identity data unbackfilled');
 process.stdout.write('PASS '+passed.at(-1)+'\n');

 await group('Missing storage remains anonymous configuration information but never authenticated unlinked success',async()=>{
  const publicResult=await status(undefined,{environment:{}});assert.equal(publicResult.status,200);assert.equal(publicResult.data.account,null);assert.equal(publicResult.data.providers.google.configured,false);
  const privateResult=await status('synthetic-a',{environment:{}});assert.equal(privateResult.status,503);assert.equal(privateResult.data.error.code,'auth_unavailable');assert.equal(privateResult.data.account,undefined);assert.equal(privateResult.data.providers,undefined);
 });

 await group('Lazy initialization is bounded to current-owner supported rows and repeat calls keep generations',async()=>{
  await account('synthetic-a');await account('synthetic-b');
  for(const owner of ['synthetic-a','synthetic-b'])for(const provider of ['google','linkedin','unsupported-provider'])await link(owner,provider);
  const before=(await stmt('SELECT * FROM auth_identities ORDER BY owner_id,provider').all()).results;
  const result=await status('synthetic-a');assert.equal(result.status,200,JSON.stringify(result));
  for(const provider of ['google','linkedin'])assert.match(result.data.providers[provider].connectionId,/^[a-f0-9]{64}$/);
  const after=(await stmt('SELECT * FROM auth_identities ORDER BY owner_id,provider').all()).results;
  for(let i=0;i<before.length;i++){const {connection_id,...rest}=after[i],{connection_id:old,...prior}=before[i];assert.deepEqual(rest,prior);if(prior.owner_id==='synthetic-b'||prior.provider==='unsupported-provider')assert.equal(connection_id,old);}
  const again=await status('synthetic-a');assert.deepEqual(again.data.providers,result.data.providers);assert.equal(networkCalls,0);
 });

 await group('A concurrent successful initializer wins without generation rotation or false empty status',async()=>{
  await account('synthetic-a');await link('synthetic-a');
  const winner='a'.repeat(64),hook=observeBeforeStatusBatch(()=>stmt('UPDATE auth_identities SET connection_id=? WHERE owner_id=? AND provider=?',winner,'synthetic-a','linkedin').run());
  const result=await status('synthetic-a',hook);hook.assertFired();assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.data.providers.linkedin.connectionId,winner);assert.equal((await row('synthetic-a')).connection_id,winner);
 });

 await group('Captured legacy rows cannot initialize under changed account generation, lifecycle, or deleting workspace',async()=>{
  for(const change of ['account-generation','lifecycle','deleting-workspace']){
   await reset();await account('synthetic-a');await link('synthetic-a');
   const lifecycle=await captureOwnerLifecycle({DB:db},'synthetic-a',{startedAt:time,now:time});
   const hook=observeBeforeStatusBatch(async()=>{
    if(change==='account-generation')await stmt('UPDATE auth_accounts SET generation=? WHERE owner_id=?',randomUUID(),'synthetic-a').run();
    if(change==='lifecycle')await stmt('UPDATE account_lifecycles SET generation=?,deleted_at=? WHERE owner_hash=?',randomUUID(),time,lifecycle.key).run();
    if(change==='deleting-workspace')await stmt('INSERT INTO workspaces(id,owner_id,owner_email,created_at,profile_json,deleting_at) VALUES(?,?,?,?,?,?)',randomUUID(),'synthetic-a','synthetic-a@example.com',new Date(time).toISOString(),'{}',new Date(time).toISOString()).run();
   });
   const result=await status('synthetic-a',hook);hook.assertFired();assert(result.status>=400,change+': '+JSON.stringify(result));assert.equal(result.data.ok,false);assert.equal((await row('synthetic-a')).connection_id,'');
  }
 });

 await group('Provider-session loss or replacement cannot initialize links or return a successful empty status',async()=>{
  for(const change of ['remove-session','expire-session','session-owner-generation']){
   await reset();const generation=await account('synthetic-a');const subject=await link('synthetic-a','google');await link('synthetic-a','linkedin');const token='c'.repeat(64);
   await stmt('INSERT INTO browser_sessions(token_hash,id,owner_id,account_generation,provider,subject,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)',hash(token),randomUUID(),'synthetic-a',generation,'google',subject,time,time+3600000).run();
   const hook=observeBeforeStatusBatch(async()=>{
    if(change==='remove-session')await stmt('DELETE FROM browser_sessions WHERE token_hash=?',hash(token)).run();
    if(change==='expire-session')await stmt('UPDATE browser_sessions SET expires_at=? WHERE token_hash=?',time-1,hash(token)).run();
    if(change==='session-owner-generation')await stmt('UPDATE browser_sessions SET account_generation=? WHERE token_hash=?',randomUUID(),hash(token)).run();
   });
   const result=await status(undefined,{...hook,token});hook.assertFired();assert(result.status>=400,change+': '+JSON.stringify(result));assert.equal((await row('synthetic-a','google')).connection_id,'');assert.equal((await row('synthetic-a','linkedin')).connection_id,'');
  }
 });

 await group('A captured old link cannot overwrite or relabel a newly inserted replacement',async()=>{
  await account('synthetic-a');await account('synthetic-b');await link('synthetic-a','linkedin','old-subject');let replacement;
  const hook=observeBeforeStatusBatch(async()=>{await stmt('DELETE FROM auth_identities WHERE owner_id=? AND provider=?','synthetic-a','linkedin').run();await link('synthetic-b','linkedin','old-subject',true);await link('synthetic-a','linkedin','new-subject',false);replacement=await row('synthetic-a');});
  const result=await status('synthetic-a',hook);hook.assertFired();assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.data.providers.linkedin.connectionId,replacement.connection_id);assert.equal((await row('synthetic-b')).connection_id,'');assert.deepEqual(await row('synthetic-a'),replacement);
 });

 await group('Absent auth accounts do not create lifecycle metadata and cannot hide a newly created account or deleting workspace',async()=>{
  const normal=await status('synthetic-new');assert.equal(normal.status,200);assert.equal(normal.data.providers.google.connected,false);assert.equal((await stmt('SELECT COUNT(*) AS n FROM account_lifecycles').first()).n,0);assert.equal((await stmt('SELECT COUNT(*) AS n FROM auth_accounts').first()).n,0);
  const created=observeBeforeStatusBatch(async()=>{await account('synthetic-new');await link('synthetic-new','linkedin','created-subject',false);});
  const changed=await status('synthetic-new',created);created.assertFired();assert(changed.status>=400,JSON.stringify(changed));assert.match((await row('synthetic-new')).connection_id,/^[a-f0-9]{64}$/);
  await reset();await stmt('INSERT INTO workspaces(id,owner_id,owner_email,created_at,profile_json,deleting_at) VALUES(?,?,?,?,?,?)',randomUUID(),'synthetic-new','synthetic-new@example.com',new Date(time).toISOString(),'{}',new Date(time).toISOString()).run();
  const deleting=await status('synthetic-new');assert(deleting.status>=400,JSON.stringify(deleting));assert.equal((await stmt('SELECT COUNT(*) AS n FROM account_lifecycles').first()).n,0);
 });

 assert.equal(networkCalls,0);
 const finalHashes=Object.fromEntries(await Promise.all(paths.map(async path=>[path,hash(await readFile(root+'/'+path))])));assert.deepEqual(finalHashes,hashes,'Source changed during review; rerun one stable candidate.');
 await mkdir(out,{recursive:true});
 await writeFile(out+'receipt.json',JSON.stringify({kind:'independent actual-D1 schema/lazy-initialization authority review',recordedAt:new Date().toISOString(),root,sourceHashes:hashes,passed,externalNetworkCalls:networkCalls,limits:['Only an isolated local Miniflare/D1 database was used.','No live provider consent, deployed migration, QA Site, production data, browser, or real account was accessed.','Races were injected before the actual atomic status batch; no claim of exhaustive concurrency testing.']},null,2)+'\n');
 process.stdout.write(JSON.stringify({groups:passed.length,receipt:out+'receipt.json'})+'\n');
}finally{await mf.dispose();}
