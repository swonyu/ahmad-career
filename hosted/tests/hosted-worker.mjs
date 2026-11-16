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
  const pair=await call('/api/account/pairing',{method:'POST',headers:identity,body:'{}',expectedStatus:201});
  const session=await call('/api/apply/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pairingCode:pair.pairingCode})});
  const native={Authorization:'Bearer '+session.sessionToken,'Content-Type':'application/json'};
  const pdf=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
  const saved=await call('/api/apply/profile',{method:'PUT',headers:native,body:JSON.stringify({expectedRevision:0,profile:{firstName:'Runtime',email:'runtime@example.com',resume:{name:'Synthetic.pdf',mime:'application/pdf',dataBase64:pdf.toString('base64')}}})});assert.equal(saved.profile.resume.sha256,createHash('sha256').update(pdf).digest('hex'));
  const workspace=await call('/api/apply/workspace',{headers:native});assert.equal(workspace.capabilities.dispatchContinuation,'client');assert.equal(workspace.capabilities.liveEnabled,false);assert.equal(workspace.mode,'local');
  const erased=await call('/api/account',{method:'DELETE',headers:identity,body:JSON.stringify({confirmation:'DELETE'})});assert.equal(erased.deleted,true);
  await call('/api/apply/workspace',{headers:native,expectedStatus:401});
  const sourceHashes={};for(const file of['server/applications.mjs','server/provider.mjs','server/validation.mjs','tests/hosted-worker.mjs'])sourceHashes[file]=createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex');
  await writeFile(new URL('./hosted-worker-verification.json',import.meta.url),JSON.stringify({observedAt:new Date().toISOString(),status:'passed',checks,scope:'Actual bundled application handler executing inside workerd with nodejs_compat, D1 and R2; local synthetic identity headers only.',realEmployerRequests:0,sourceHashes},null,2)+'\n');
  console.log(JSON.stringify({result:'PASS',actualWorkerdRequests:checks,realEmployerRequests:0}));
}finally{await mf.dispose()}
