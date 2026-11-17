// Runs only the real local scripts in isolated DOM/storage stubs and injected
// employer transports. No network, build, native process or account mutation.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createApp} from './state-check.mjs';
import {getLiveJobs,SOURCES} from './feeds.mjs';

const sourcePins=JSON.parse(readFileSync(new URL('./merge-evidence/compatibility-source-pins.json',import.meta.url),'utf8'));
function pinnedSource(path) {
 const pin=sourcePins.files[path];assert(pin,'Missing source pin: '+path);
 const bytes=readFileSync(new URL('./'+path,import.meta.url));
 assert.equal(bytes.length,pin.bytes,path+' byte length');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),pin.sha256,path+' SHA256');
 assert.equal(createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex'),pin.git_blob_sha1,path+' original Git blob');
 return bytes;
}
const locks={request:async(_name,fn)=>fn()};
const create=(storage=new Map(),options={})=>createApp(storage,{productionBundle:true,locks,...options});
const stamp='2026-01-01T00:00:00.000Z',id='legacy-compatibility-fixture',q=JSON.stringify(id);
const job={id,title:'Supply Chain Manager',company:'Alcon',location:'Riyadh, Saudi Arabia',url:'https://alcon.wd5.myworkdayjobs.com/careers_alcon/job/Riyadh/Legacy_REQ1',posted:'2026-01-01',fit:'Needs review',summary:'Synthetic saved record',kind:'archived',healthcare:true,mode:'Hybrid',postedKind:'last-published',employmentType:'Full time',experienceLevel:'Professional',requirementNotes:['Degree or equivalent experience preferred.','Confirm the complete requirements on the employer website.']};
const receipt={schema:1,jobId:id,appliedAt:'',receiptNote:'Imported receipt; not employer verification',updatedAt:stamp};
const action={schema:1,jobId:id,dueOn:'2026-11-18',actionNote:'Review the role requirements',completed:false,updatedAt:stamp};
const workspace=()=>({saved:[id],states:{[id]:'Preparing'},savedDetails:{[id]:job},importedApplicationRecords:{[id]:receipt},importedNextActions:{[id]:action}});
const storageFor=(value=workspace())=>new Map([['ahmad-workspace',JSON.stringify(value)]]);
const receiptKey='ahmad-application-record-v1:'+encodeURIComponent(id),actionKey='ahmad-next-action-v1:'+encodeURIComponent(id);
const persisted=app=>JSON.parse(app.storage.get('ahmad-workspace'));
const envelope=(schema=1,profile={})=>({format:'saleh-career-workspace',schema,exportedAt:stamp,platform:'web',workspace:{saved:[id],states:{[id]:'Submission uncertain'},savedDetails:{[id]:job}},profile,checklist:{profile:true},applicationRecords:[receipt],nextActions:[action]});
const parse=(app,data)=>app.evaluate(`Backup.parse(${JSON.stringify(JSON.stringify(data))})`);
const evaluateJSON=(app,expression)=>app.json(expression);
let groups=0;
async function check(name,run){await run();groups++;console.log('PASS COMPAT '+name)}

await check('Original continuation actually loses imported-only maps on a regular save',async()=>{
 const sourceOverrides=Object.fromEntries(['core.js','data.js','app.js'].map(name=>[name,pinnedSource('fixtures/compatibility/continuation/'+name).toString('utf8')]));
 sourceOverrides['backup.js']='';
 const app=create(storageFor(),{sourceOverrides});
 assert.equal(app.evaluate(`readApplicationRecord(${q})`),null,'Original source must reproduce the invisible imported receipt');
 await app.dispatch('change',{id:'',dataset:{status:id},value:'Applied'});
 assert.equal(persisted(app).importedApplicationRecords,undefined);
 assert.equal(persisted(app).importedNextActions,undefined);
});

await check('Imported receipt, task and employer metadata survive save and relaunch',async()=>{
 const app=create(storageFor());
 assert.deepEqual(evaluateJSON(app,`readApplicationRecord(${q})`),receipt);
 assert.deepEqual(evaluateJSON(app,`readNextAction(${q})`),action);
 await app.dispatch('change',{id:'',dataset:{status:id},value:'Applied'});
 assert.deepEqual(persisted(app).importedApplicationRecords,{[id]:receipt});
 assert.deepEqual(persisted(app).importedNextActions,{[id]:action});
 const reload=create(app.storage);assert.deepEqual(evaluateJSON(reload,`readApplicationRecord(${q})`),receipt);assert.deepEqual(evaluateJSON(reload,`readNextAction(${q})`),action);
 for(const field of ['requirementNotes','employmentType','experienceLevel','postedKind'])assert.deepEqual(persisted(reload).savedDetails[id][field],job[field]);
});

await check('Explicit empty sidecars override imported fallback through export and reload',async()=>{
 const emptyReceipt={...receipt,receiptNote:''},emptyAction={...action,actionNote:'',dueOn:'',completed:false};
 const storage=storageFor();storage.set(receiptKey,JSON.stringify(emptyReceipt));storage.set(actionKey,JSON.stringify(emptyAction));
 const app=create(storage);assert.equal(app.evaluate(`readApplicationRecord(${q}).receiptNote`),'');assert.equal(app.evaluate(`readNextAction(${q}).actionNote`),'');
 await app.toggleSaved(id);const reload=create(app.storage);
 assert.equal(reload.evaluate(`readApplicationRecord(${q}).receiptNote`),'');assert.equal(reload.evaluate(`readNextAction(${q}).actionNote`),'');
 await reload.evaluate('prepareBackup()');const out=JSON.parse(reload.evaluate('backupExport'));
 assert.equal(out.applicationRecords[0].receiptNote,'');assert.equal(out.nextActions[0].actionNote,'');
 assert.equal(app.storage.get(receiptKey),JSON.stringify(emptyReceipt));assert.equal(app.storage.get(actionKey),JSON.stringify(emptyAction));
});

await check('Null and future-format sidecars are preserved instead of replaced by fallback',async()=>{
 for(const [key,map] of [[receiptKey,'recordDrafts'],[actionKey,'actionDrafts']])for(const bytes of ['null',JSON.stringify({...key===receiptKey?receipt:action,schema:2})]){
  const storage=storageFor();storage.set(key,bytes);const app=create(storage);
  app.evaluate(`openJob(${q});${map}[${q}].${map==='recordDrafts'?'receiptNote':'actionNote'}='Unsaved replacement'`);
  assert.equal(await app.evaluate(`${map==='recordDrafts'?'saveApplicationRecord':'saveNextAction'}(${q})`),false);
  assert.equal(app.storage.get(key),bytes);assert.equal(app.evaluate(`blockedKeys.has(${JSON.stringify(key.slice(6))})`),true);
 }
});

await check('Unknown workspace and imported-map formats block writes and preserve exact bytes',async()=>{
 for(const value of [{...workspace(),futureWorkspace:{private:'preserve'}},{...workspace(),importedNextActions:{[id]:{...action,schema:2}}},{...workspace(),importedApplicationRecords:{[id]:{...receipt,unexpected:'preserve'}}}]){
  const storage=storageFor(value),before=storage.get('ahmad-workspace');const app=create(storage);
  await app.toggleSaved(id);assert.equal(app.storage.get('ahmad-workspace'),before);assert.equal(app.evaluate("blockedKeys.has('workspace')"),true);
  await app.evaluate('prepareBackup()');assert.equal(app.evaluate('backupExport'),'');
 }
});

await check('Unsupported or unknown stored profile fields remain intact and block restore',async()=>{
 for(const profile of [{preferencesVersion:'3',targetCountry:'SA'},{preferencesVersion:'2',futurePreference:'preserve'}]){
  const storage=storageFor();const bytes=JSON.stringify(profile);storage.set('ahmad-profile',bytes);const app=create(storage);
  await app.evaluate("saveProfile({...profileDraft,skills:'new draft'})");assert.equal(app.storage.get('ahmad-profile'),bytes);
  app.evaluate(`backupInput=${JSON.stringify(JSON.stringify(envelope()))};previewBackup()`);assert.equal(app.evaluate('backupPreview'),null);
 }
});

await check('Legacy uncertain stage survives current selectors, unrelated writes and export',async()=>{
 const value=workspace();value.states[id]='Submission uncertain';const app=create(storageFor(value));
 app.evaluate(`openJob(${q})`);assert.match(app.evaluate("$('#job-dialog').innerHTML"),/<option selected>Submission uncertain<\/option>/);
 await app.toggleSaved(id);assert.equal(persisted(app).states[id],'Submission uncertain');
 const text=await app.exportNotes();assert.match(text,/Submission uncertain/);assert.match(text,/Imported receipt/);assert.match(text,/Review the role requirements/);
 assert(!app.evaluate(`draft(jobById(${q}))`).includes(receipt.receiptNote));assert(!app.evaluate(`draft(jobById(${q}))`).includes(action.actionNote));
});

await check('Schema1 empty-profile backups retain the original import contract',async()=>{
 const app=create();const input=envelope(1,{});assert.deepEqual(JSON.parse(JSON.stringify(parse(app,input))).profile,{});
 app.evaluate(`backupInput=${JSON.stringify(JSON.stringify(input))};previewBackup()`);assert.equal(await app.evaluate('applyBackup()'),true);
 assert.equal(app.evaluate('profile.preferencesVersion'),'2');assert.equal(app.evaluate('profile.targetCountry'),'');assert.equal(app.evaluate('checklist.profile'),undefined);
 assert.deepEqual(evaluateJSON(app,`readNextAction(${q})`),action);
});

const v2Profile={years:'2',degree:'Synthetic degree',skills:'Synthetic skills',achievements:'Synthetic evidence',preferredCity:'',minimumMonthlySAR:'',unknownSalary:'show',preferencesVersion:'2',targetCountry:'GB',targetCity:'London',roleKeywords:'Planner',planningCurrency:'GBP',planningPayPeriod:'annual',displayTimeZone:'Europe/London'};
await check('Schema2 exports all14 known profile fields without restoring any into destination',async()=>{
 const storage=storageFor();storage.set('ahmad-profile',JSON.stringify(v2Profile));const source=create(storage);await source.evaluate('prepareBackup()');
 const bytes=source.evaluate('backupExport'),out=JSON.parse(bytes);assert.equal(out.schema,2);assert.deepEqual(out.profile,v2Profile);assert(parse(source,out));
 const target=create();target.evaluate(`backupInput=${JSON.stringify(bytes)};previewBackup()`);assert.equal(await target.evaluate('applyBackup()'),true);
 assert.equal(target.evaluate('profile.targetCountry'),'');assert.equal(target.evaluate('profile.skills'),undefined);assert.equal(target.evaluate('profile.displayTimeZone'),'');
 assert.equal(target.evaluate(`readApplicationRecord(${q}).receiptNote`),receipt.receiptNote);
 await source.evaluate('saveBackupFile()');assert.equal(source.downloads.length,1);assert.equal(await source.downloads[0].text(),bytes);
});

await check('Schema2 rejects unknown fields, versions and malformed preference values without writes',async()=>{
 const app=create();for(const profile of [{...v2Profile,preferencesVersion:'3'},{...v2Profile,targetCountry:'ZZ'},{...v2Profile,planningCurrency:'INVALID'},{...v2Profile,displayTimeZone:'Mars/Olympus'},{...v2Profile,targetCity:23},{...v2Profile,unrecognized:'future'}]){
  const before=[...app.storage];assert.throws(()=>parse(app,envelope(2,profile)));assert.deepEqual([...app.storage],before);
 }
 assert.throws(()=>parse(app,envelope(3,{})));assert.throws(()=>parse(app,envelope(1,v2Profile)));
});

await check('A stale editor cannot overwrite maps restored by another tab',async()=>{
 const empty={saved:[id],states:{},savedDetails:{[id]:job}},shared=storageFor(empty),a=create(shared,{shared:true}),b=create(shared,{shared:true});
 a.evaluate(`openJob(${q});recordDrafts[${q}].receiptNote='Stale receipt';actionDrafts[${q}].actionNote='Stale action'`);
 b.evaluate(`backupInput=${JSON.stringify(JSON.stringify(envelope()))};previewBackup()`);assert.equal(await b.evaluate('applyBackup()'),true);
 assert.equal(await a.evaluate(`saveApplicationRecord(${q})`),false);assert.equal(await a.evaluate(`saveNextAction(${q})`),false);
 const reload=create(shared);assert.equal(reload.evaluate(`readApplicationRecord(${q}).receiptNote`),receipt.receiptNote);assert.equal(reload.evaluate(`readNextAction(${q}).actionNote`),action.actionNote);
 assert.equal(a.evaluate(`recordDrafts[${q}].receiptNote`),'Stale receipt');assert.equal(a.evaluate(`actionDrafts[${q}].actionNote`),'Stale action');
});

await check('Fresh neutral preferences and primary navigation remain the current product',async()=>{
 const app=create();assert.equal(app.evaluate('profile.targetCountry'),'');assert.equal(app.evaluate('profile.targetCity'),'');assert.equal(app.evaluate('profile.planningCurrency'),'');assert.equal(app.evaluate('profile.displayTimeZone'),'');assert.deepEqual(app.json('saved'),[]);assert.deepEqual(app.json('D.jobs'),[]);
 const html=readFileSync(new URL('./web/index.html',import.meta.url),'utf8');const nav=html.match(/<nav aria-label="Workspace">([\s\S]*?)<\/nav>/)[1];
 assert.deepEqual([...nav.matchAll(/data-view="([^"]+)"/g)].map(m=>m[1]),['shortlist','live','saved','profile','salary','plan']);
 assert(!/Saleh Career Finder|Ahmad Alayed/.test(html));assert(html.includes('src="backup.js"'));
 assert.match(app.evaluate('savedPage()'),/data-view="backups"/);assert.match(app.evaluate('planPage()'),/Your next actions/);
});

await check('Production refresh calls exactly the existing six employer sources',async()=>{
 const requests=[];const result=await getLiveJobs(async(url,options)=>{requests.push({url,options});return {ok:true,status:200,text:async()=>JSON.stringify({jobPostings:[],total:0})}});
 assert.deepEqual(result.sources.map(s=>s.name),SOURCES.map(s=>s.name));assert.equal(result.sources.length,6);assert.equal(requests.length,6);
 assert.deepEqual(requests.map(r=>new URL(r.url).hostname),SOURCES.map(s=>s.host));
 assert(requests.every(r=>r.options.method==='POST'&&!/smartrecruiters|ashby|recruitee|workable/.test(r.url)));
});

await check('Current source exclusion bounds and legacy metadata acceptance are both explicit',()=>{
 const app=create();const C=app.evaluate('C');const checkedAt=new Date().toISOString();
 assert.equal(C.normalizeLive({checkedAt,jobs:[],sources:[{name:'Alcon',ok:true,count:0,excludedIds:Array(21).fill('x')}]}),null);
 const legacy=C.normalizeLive({checkedAt,jobs:[],sources:[{name:'Lean Technologies',ok:true,count:0,excludedIds:Array.from({length:40},(_,i)=>'legacy-'+i)}]});assert.equal(legacy.sources[0].excludedIds.length,40);
 assert.equal(C.sourceIncomplete({ok:true,limited:true}),true);
 assert.deepEqual(JSON.parse(JSON.stringify(C.normalizeJob(job))).requirementNotes,job.requirementNotes);
});

await check('Bundled web copies and historical source pins remain exact',()=>{
 for(const name of ['app.js','core.js','backup.js','data.js','icon.svg','index.html','manifest.webmanifest','style.css'])assert.deepEqual(readFileSync(new URL('./web/'+name,import.meta.url)),readFileSync(new URL('../apple/AhmadCareer/Web/'+name,import.meta.url)),name);
 for(const file of ['check.mjs','state-check.mjs','backup-check.mjs','followup-check.mjs','role-review-check.mjs','web/core.js','web/app.js','web/backup.js'])pinnedSource('historical/public1.3/'+file);
});
console.log(`Merged legacy compatibility: ${groups} groups passed. Native/build/network execution: none.`);
