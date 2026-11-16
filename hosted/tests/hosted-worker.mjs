import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {SERVICE_ORIGIN} from '../server/applications.mjs';

// Miniflare dispatch uses its loopback transport origin. This test-only adapter supplies the deployment's exact URL/Host.
const output=await build({stdin:{contents:'import {handleApplications,SERVICE_ORIGIN} from "./server/applications.mjs"; export default {fetch(request,env,ctx){const original=new URL(request.url);const headers=new Headers(request.headers);headers.set("host",new URL(SERVICE_ORIGIN).host);const adapted=new Request(SERVICE_ORIGIN+original.pathname+original.search,new Request(request,{headers}));return handleApplications(adapted,env,ctx)}};',resolveDir:process.cwd(),sourcefile:'hosted-runtime-probe.mjs'},bundle:true,format:'esm',platform:'neutral',target:'es2022',external:['node:*'],write:false});
const mf=new Miniflare({modules:true,script:output.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET']});
let checks=0;
try{
  const db=await mf.getD1Database('DB');
  for(const file of(await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())for(const sql of(await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
  const call=async(path,options={})=>{const response=await mf.dispatchFetch(SERVICE_ORIGIN+path,options);const data=await response.json();assert.equal(response.status,options.expectedStatus??200,JSON.stringify(data));checks++;return data};
  const health=await call('/api/health');assert.equal(health.storage,'ready');
  const identity={'oai-authenticated-user-id':'runtime-synthetic-owner','oai-authenticated-user-email':'runtime@example.com',Origin:SERVICE_ORIGIN,'Content-Type':'application/json'};
  const before=await call('/api/account',{headers:identity});assert.equal(before.workspaceId,null);
  const pair=await call('/api/account/pairing',{method:'POST',headers:identity,body:JSON.stringify({expectedAccountId:identity['oai-authenticated-user-id']}),expectedStatus:201});
  const ttl=Date.parse(pair.expiresAt)-Date.parse(pair.serverTime);assert.ok(ttl>0&&ttl<=300000);
  const session=await call('/api/apply/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pairingCode:pair.pairingCode})});
  const native={Authorization:'Bearer '+session.sessionToken,'Content-Type':'application/json'};
  const pdf=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
  const saved=await call('/api/apply/profile',{method:'PUT',headers:native,body:JSON.stringify({expectedRevision:0,profile:{firstName:'Runtime',email:'runtime@example.com',linkedin:'https://sa.linkedin.com/in/Runtime+Example/?trk=discard',resume:{name:'Synthetic.pdf',mime:'application/pdf',dataBase64:pdf.toString('base64')}}})});assert.equal(saved.profile.resume.sha256,createHash('sha256').update(pdf).digest('hex'));assert.equal(saved.profile.linkedin,'https://www.linkedin.com/in/Runtime%2BExample');
  const workspace=await call('/api/apply/workspace',{headers:native});assert.equal(workspace.capabilities.dispatchContinuation,'client');assert.equal(workspace.capabilities.liveEnabled,false);assert.equal(workspace.capabilities.linkedinProfile,true);assert.equal(workspace.profile.linkedin,saved.profile.linkedin);assert.equal(workspace.mode,'local');
  const legacySave=await call('/api/apply/profile',{method:'PUT',headers:native,body:JSON.stringify({expectedRevision:1,profile:{firstName:'Runtime',email:'runtime@example.com'}})});assert.equal(legacySave.profile.linkedin,saved.profile.linkedin);
  const invalidLink=await call('/api/apply/profile',{method:'PUT',headers:native,body:JSON.stringify({expectedRevision:2,profile:{firstName:'Runtime',email:'runtime@example.com',linkedin:'https://linkedin.com.evil.example/in/Runtime'}}),expectedStatus:422});assert.equal(invalidLink.error.code,'invalid_linkedin');
  const cleared=await call('/api/apply/profile',{method:'PUT',headers:native,body:JSON.stringify({expectedRevision:2,profile:{firstName:'Runtime',email:'runtime@example.com',linkedin:''}})});assert.equal(cleared.profile.linkedin,'');assert.equal(cleared.profile.resume.sha256,saved.profile.resume.sha256);
  const exportTarget=await call('/api/account/export?expectedWorkspaceId=00000000-0000-0000-0000-000000000000',{headers:identity,expectedStatus:409});assert.equal(exportTarget.error.code,'workspace_changed');
  const exported=await call(`/api/account/export?expectedWorkspaceId=${session.workspaceId}`,{headers:identity});assert.equal(exported.workspaceId,session.workspaceId);assert.ok(exported.documents[0].downloadPath.endsWith(`?expectedWorkspaceId=${session.workspaceId}`));
  const fileTarget=await call(`/api/account/resumes/${saved.profile.resume.sha256}?expectedWorkspaceId=00000000-0000-0000-0000-000000000000`,{headers:identity,expectedStatus:409});assert.equal(fileTarget.error.code,'workspace_changed');
  const downloaded=await mf.dispatchFetch(SERVICE_ORIGIN+exported.documents[0].downloadPath,{headers:identity});assert.equal(downloaded.status,200);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),pdf);checks++;
  const changed=await call('/api/account',{method:'DELETE',headers:identity,body:JSON.stringify({confirmation:'DELETE',expectedWorkspaceId:'00000000-0000-0000-0000-000000000000'}),expectedStatus:409});assert.equal(changed.error.code,'workspace_changed');
  assert.equal((await call('/api/apply/workspace',{headers:native})).workspaceId,session.workspaceId);
  const erased=await call('/api/account',{method:'DELETE',headers:identity,body:JSON.stringify({confirmation:'DELETE',expectedWorkspaceId:session.workspaceId})});assert.equal(erased.deleted,true);
  await call('/api/apply/workspace',{headers:native,expectedStatus:401});
  const sourceHashes={};for(const file of['server/applications.mjs','server/provider.mjs','server/validation.mjs','tests/hosted-worker.mjs'])sourceHashes[file]=createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex');
  await writeFile(new URL('./hosted-worker-verification.json',import.meta.url),JSON.stringify({observedAt:new Date().toISOString(),status:'passed',checks,scope:'Actual bundled application handler executing inside workerd with nodejs_compat, D1 and R2; local synthetic identity headers only.',realEmployerRequests:0,sourceHashes},null,2)+'\n');
  console.log(JSON.stringify({result:'PASS',actualWorkerdRequests:checks,realEmployerRequests:0}));
}finally{await mf.dispose()}
