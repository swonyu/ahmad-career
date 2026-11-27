import assert from 'node:assert/strict';
import { productionRead } from './phone-read-test-helpers.mjs';
import test,{after} from 'node:test';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Worker as NodeWorker} from 'node:worker_threads';
import {webcrypto,createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import vm from 'node:vm';
import ts from 'typescript';
import {build} from 'esbuild';
import {PDFDocument} from 'pdf-lib';

const directory=await mkdtemp(join(tmpdir(),'career-private-async-'));
after(()=>rm(directory,{recursive:true,force:true}));
await Promise.all([
  build({entryPoints:['app/phone/pdf.ts'],outfile:join(directory,'pdf.mjs'),bundle:true,platform:'browser',format:'esm',logLevel:'silent'}),
  build({entryPoints:['app/phone/pdf-validation.worker.ts'],outfile:join(directory,'worker.mjs'),bundle:true,platform:'browser',format:'esm',logLevel:'silent'}),
]);
const pdf=await import(pathToFileURL(join(directory,'pdf.mjs')).href);
const wrapper=join(directory,'worker-node-adapter.mjs');
await writeFile(wrapper,`import {parentPort,workerData} from 'node:worker_threads';\nif(workerData?.withoutInflation)globalThis.DecompressionStream=undefined;\nglobalThis.self={postMessage:value=>parentPort.postMessage(value),onmessage:null};\nawait import('./worker.mjs');\nparentPort.on('message',data=>self.onmessage({data}));\n`);
function actualWorker({withoutInflation=false}={}) {
  const worker=new NodeWorker(pathToFileURL(wrapper),{workerData:{withoutInflation}}),listeners=new Map();
  return {postMessage:(value,transfer)=>worker.postMessage(value,transfer),terminate:()=>{void worker.terminate();},addEventListener(name,callback){const listener=value=>callback(name==='message'?{data:value}:value);listeners.set(callback,listener);worker.on(name,listener);},removeEventListener(name,callback){const listener=listeners.get(callback);if(listener)worker.off(name,listener);listeners.delete(callback);}};
}
const checked=(file,options={})=>pdf.readCheckedPDF(file,{...options,createWorker:()=>actualWorker()});
const readable=await readFile(new URL('./fixtures/readable-resume.pdf',import.meta.url));
function syntheticPDF(objects,trailer='') {
  const parts=[Buffer.from('%PDF-1.7\n')],offsets=[0];let offset=parts[0].length;
  for(let i=0;i<objects.length;i++){offsets.push(offset);const bytes=Buffer.concat([Buffer.from(`${i+1} 0 obj\n`),Buffer.from(objects[i]),Buffer.from('\nendobj\n')]);parts.push(bytes);offset+=bytes.length;}
  parts.push(Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<</Size ${objects.length+1} /Root 1 0 R ${trailer}>>\nstartxref\n${offset}\n%%EOF\n`));return Buffer.concat(parts);
}
const base=['<</Type /Catalog /Pages 2 0 R>>','<</Type /Pages /Kids [3 0 R] /Count 1>>','<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]>>'];
const malformed=Buffer.from('%PDF-1.7\n'+'not a PDF '.repeat(12)+'\n%%EOF\n');
const encrypted=syntheticPDF([...base,'<</Filter /Standard /V 1 /R 2 /Length 40>>'],'/Encrypt 4 0 R');
const cyclic=syntheticPDF([base[0],'<</Type /Pages /Kids [2 0 R] /Count 1>>']);
const source=await readFile(new URL('../app/phone/PhoneApp.tsx',import.meta.url),'utf8'),tree=ts.createSourceFile('PhoneApp.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function extract(name){let value;function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(tree)===name)value=node.initializer.getText(tree);if(ts.isFunctionDeclaration(node)&&node.name?.text===name)value=node.getText(tree);ts.forEachChild(node,visit);}visit(tree);assert(value,`Actual production handler ${name} must exist`);return value;}
function install(name,context){const js=ts.transpileModule('globalThis.'+name+' = '+extract(name),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;vm.runInNewContext(js,context);return context[name];}
const defer=()=>{let resolve;return{promise:new Promise(done=>resolve=done),resolve:value=>resolve(value)}};
function recoveryHarness(stage='none') {
  const scope='account:synthetic-a:00000000-0000-4000-8000-000000000001',workspace={ok:true,accountId:'synthetic-a',accountEmail:'synthetic@example.com',confirmedEmail:'synthetic@example.com',emailUpdateRequired:false,deleting:false,workspaceId:'00000000-0000-4000-8000-000000000001',mode:'local',profile:productionRead.blankProfile(),jobs:[],attempts:[],capabilities:{liveEnabled:false,mode:'local',coverage:'Synthetic only'},recoverablePlans:[],activePlanIds:[]};
  const saved={snapshot:{scope,privateMarker:'SYNTHETIC A SNAPSHOT'},profile:{firstName:'SYNTHETIC A PRIVATE DRAFT'},formChanged:true,dialog:null,editorDraft:null};
  const pending=defer(),entered=defer(),downloads=[],restored=[],calls=[];
  const wait=(at,value)=>{calls.push(at);if(stage===at){entered.resolve();return pending.promise.then(()=>value);}return Promise.resolve(value);};
  const context={...productionRead,account:{id:'synthetic-a'},quarantine:{current:saved},epoch:{current:1},identityUnverified:{current:false},snapshotRef:{current:null},document:{visibilityState:'visible'},run:(_label,action)=>action(context.epoch.current),phoneAPI:()=>wait('account',workspace),loadPhoneSnapshot:scopeValue=>{assert.equal(scopeValue,scope);return wait('vault',saved.snapshot);},phoneSafety:{load:()=>wait('safety',{holds:[],recovery:[]})},download:value=>downloads.push(value),putSnapshot:value=>restored.push(value),putWorkspace:()=>{},setProfile:()=>{},setFormChanged:()=>{},setEditorDraft:()=>{},setDialog:()=>{},setDialogDirty:()=>{},setSafetyState:()=>{},setSafetyError:()=>{},setStorageProblem:()=>{},setStorageCode:()=>{},setCheckingIdentity:()=>{},setLocked:()=>{},setHasQuarantinedEdits:()=>{},setRecoveryStatus:()=>{},setNotice:()=>{}};
  install('assertCurrent',context);const recover=install('recoverLocked',context);
  return{context,saved,pending,entered,downloads,restored,calls,recover,assertPreserved(){assert.equal(context.quarantine.current,saved);assert.equal(downloads.length,0);assert.equal(restored.length,0);assert.equal(saved.profile.firstName,'SYNTHETIC A PRIVATE DRAFT');}};
}
function pdfHarness(check=checked) {
  const original={firstName:'SYNTHETIC PROFILE',resume:{name:'Earlier-valid.pdf',mime:'application/pdf',size:readable.length,sha256:createHash('sha256').update(readable).digest('hex'),dataBase64:readable.toString('base64')}};
  let profile=structuredClone(original),notice=null;
  const context={run:(_label,action)=>action(context.epoch.current),epoch:{current:1},identityUnverified:{current:false},snapshotRef:{current:{scope:'account:synthetic-a:00000000-0000-4000-8000-000000000001'}},locked:false,pdfCheck:{current:null},AbortController,readCheckedPDF:check,crypto:webcrypto,btoa,Uint8Array,TextDecoder,setProfile:update=>profile=update(profile),setFormChanged:()=>{},setNotice:value=>notice=value};
  install('assertCurrent',context);const readPDF=install('readPDF',context);
  return{context,original,readPDF,profile:()=>profile,notice:()=>notice};
}

test('actual recovery export refuses a late original-account response after identity revalidation starts',async()=>{
  const h=recoveryHarness('account'),pending=h.recover(true);await h.entered.promise;h.context.identityUnverified.current=true;h.pending.resolve();await assert.rejects(pending,/account needs to be confirmed/);h.assertPreserved();
});
test('actual recovery rejects changed generations, hidden pages and replaced quarantine before export',async t=>{
  for(const change of ['generation','hidden','quarantine'])await t.test(change,async()=>{
    const h=recoveryHarness('account'),pending=h.recover(true);await h.entered.promise;
    if(change==='generation')h.context.epoch.current++;else if(change==='hidden')h.context.document.visibilityState='hidden';else h.context.quarantine.current={...h.saved};
    h.pending.resolve();await assert.rejects(pending,/changed|no longer current/);assert.equal(h.downloads.length,0);assert.equal(h.restored.length,0);assert.equal(h.saved.profile.firstName,'SYNTHETIC A PRIVATE DRAFT');
  });
});
test('actual restoration rechecks identity after both vault and safety reads without losing original drafts',async t=>{
  for(const stage of ['vault','safety'])await t.test(stage,async()=>{const h=recoveryHarness(stage),pending=h.recover();await h.entered.promise;h.context.identityUnverified.current=true;h.pending.resolve();await assert.rejects(pending,/account needs to be confirmed/);h.assertPreserved();if(stage==='vault')assert(!h.calls.includes('safety'));});
});
test('recovery cannot start during revalidation and legitimate owner export and restoration remain available',async()=>{
  const blocked=recoveryHarness();blocked.context.identityUnverified.current=true;await assert.rejects(blocked.recover(true));assert.equal(blocked.calls.length,0);blocked.assertPreserved();
  const exported=recoveryHarness();await exported.recover(true);assert.equal(exported.downloads.length,1);assert(exported.downloads[0].includes('SYNTHETIC A PRIVATE DRAFT'));assert.equal(exported.context.quarantine.current,exported.saved);
  const restored=recoveryHarness();await restored.recover();assert.equal(restored.restored.length,1);assert.equal(restored.context.quarantine.current,null);
});
test('actual browser-worker parser accepts ordinary and object-stream PDFs and preserves bytes and checksum',async()=>{
  const ordinary=await checked(new File([readable],'Valid.pdf',{type:'application/pdf'}));assert.equal(ordinary.pageCount,1);assert.equal(ordinary.resume.dataBase64,readable.toString('base64'));assert.equal(ordinary.resume.sha256,createHash('sha256').update(readable).digest('hex'));
  const document=await PDFDocument.create();document.addPage([595,842]);document.addPage([612,792]);const objectStream=await document.save({useObjectStreams:true});assert.equal((await checked(new File([objectStream],'Object-stream.pdf'))).pageCount,2);
});
test('actual browser-worker parser rejects malformed, truncated, encrypted, cyclic and deeply nested PDFs',async t=>{
  for(const [name,bytes,pattern] of [['malformed',malformed,/supported PDF/],['truncated',readable.subarray(0,Math.floor(readable.length/2)),/supported PDF/],['encrypted',encrypted,/password protection/],['cyclic',cyclic,/supported PDF/],['nested',syntheticPDF([...base,'['.repeat(100)+'0'+']'.repeat(100)]),/supported PDF/]])await t.test(name,()=>assert.rejects(checked(new File([bytes],name+'.pdf')),pattern));
});
test('actual browser-worker streaming inflation rejects expansion beyond the existing 16 MiB cap',async()=>{
  const compressed=deflateSync(Buffer.alloc(17*1024*1024,32)),stream=Buffer.concat([Buffer.from(`<</Filter /FlateDecode /Length ${compressed.length}>>\nstream\n`),compressed,Buffer.from('\nendstream')]);
  const bytes=syntheticPDF([...base.slice(0,2),'<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R>>',stream]);assert(bytes.length<100000);await assert.rejects(checked(new File([bytes],'Expansion.pdf')),/supported PDF/);
});
test('actual PDF selection keeps the prior valid local draft on every invalid file and only reports success after validation',async()=>{
  for(const [name,bytes] of [['Malformed',malformed],['Encrypted',encrypted],['Truncated',readable.subarray(0,50)]]){const h=pdfHarness();await assert.rejects(h.readPDF(new File([bytes],name+'.pdf')));assert.deepEqual(h.profile(),h.original);assert.equal(h.notice(),null);}
  const h=pdfHarness();await h.readPDF(new File([readable],'New-valid.pdf'));assert.equal(h.profile().resume.name,'New-valid.pdf');assert.match(h.notice().text,/PDF checked: 1 page/);
});
test('actual PDF selection refuses late success after cancellation, identity invalidation or page replacement',async t=>{
  for(const change of ['abort','identity','generation'])await t.test(change,async()=>{const gate=defer(),h=pdfHarness(()=>gate.promise),pending=h.readPDF(new File([readable],'Late.pdf'));if(change==='abort')h.context.pdfCheck.current.abort();else if(change==='identity')h.context.identityUnverified.current=true;else h.context.epoch.current++;gate.resolve({resume:{...h.original.resume,name:'Late.pdf'},pageCount:1});await assert.rejects(pending);assert.deepEqual(h.profile(),h.original);assert.equal(h.notice(),null);assert.equal(h.context.pdfCheck.current,null);});
});
test('worker timeout, abort and unavailable streaming support fail closed and terminate work',async()=>{
  const silent=()=>{let terminated=0;return{port:{postMessage(){},terminate(){terminated++;},addEventListener(){},removeEventListener(){}},terminated:()=>terminated};};
  const timed=silent();await assert.rejects(pdf.validatePDFBytes(readable,{createWorker:()=>timed.port,timeoutMs:20}),/too long/);assert.equal(timed.terminated(),1);
  const stopped=silent(),controller=new AbortController(),pending=pdf.validatePDFBytes(readable,{createWorker:()=>stopped.port,signal:controller.signal});controller.abort();await assert.rejects(pending,error=>error.name==='AbortError');assert.equal(stopped.terminated(),1);
  await assert.rejects(pdf.validatePDFBytes(readable,{createWorker:()=>actualWorker({withoutInflation:true})}),/updated browser/);
  await assert.rejects(pdf.readCheckedPDF(new File([readable],'Unavailable.pdf'),{createWorker:()=>{throw Error('no worker')}}),/updated browser/);
});
