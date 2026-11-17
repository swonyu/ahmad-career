import assert from 'node:assert/strict';
import {writeFileSync,existsSync,readFileSync} from 'node:fs';
import {createApp} from './state-check.mjs';
const locks={request:async(_key,fn)=>fn()};
const create=(storage=new Map(),options={})=>createApp(storage,{locks,...options});
const source=create();
const job={...source.json('Backup.portableJob(D.jobs[0])'),id:'backup-web-test'},id=job.id,q=JSON.stringify(id),stamp=new Date(Date.now()-1000).toISOString();
const receipt={schema:1,jobId:id,appliedAt:'',receiptNote:'SYNTHETIC receipt, not a submission',updatedAt:stamp};
const action={schema:1,jobId:id,dueOn:'2030-01-01',actionNote:'SYNTHETIC task',completed:false,updatedAt:stamp};
const data={format:'saleh-career-workspace',schema:1,exportedAt:stamp,platform:'web',workspace:{saved:[id],states:{[id]:'Submission uncertain'},savedDetails:{[id]:job}},profile:{years:'',degree:'Synthetic coursework',preferredCity:'riyadh',minimumMonthlySAR:'',unknownSalary:'show'},checklist:{profile:true},applicationRecords:[receipt],nextActions:[action]};
const parse=(app,value)=>app.evaluate(`Backup.parse(${JSON.stringify(typeof value==='string'?value:JSON.stringify(value))})`);
const review=(app,value=data)=>{app.evaluate(`backupInput=${JSON.stringify(JSON.stringify(value))};previewBackup()`);return app.json('backupPreview?.count??null')};
const blank=()=>new Map([['ahmad-workspace',JSON.stringify({saved:[],states:{},savedDetails:{}})]]);
assert(parse(source,data));
for(const patch of [{schema:2},{format:'other'},{platform:'random'},{exportedAt:'2039-01-01T00:00:00.000Z'},{unexpected:1},{workspace:{...data.workspace,saved:[id,id]}},{workspace:{...data.workspace,states:{bad:'Applied'}}},{profile:{years:61}},{profile:{skills:null}},{checklist:{x:1}},{applicationRecords:[receipt,receipt]},{nextActions:[{...action,unexpected:1}]},{applicationRecords:[{...receipt,updatedAt:'2039-01-01T00:00:00.000Z'}]}])assert.throws(()=>parse(source,{...data,...patch}),JSON.stringify(patch));
assert.throws(()=>parse(source,'{"oops":'));
assert.throws(()=>parse(source,' '.repeat(4*1024*1024+1)));
assert.throws(()=>parse(source,JSON.stringify(data).replace('SYNTHETIC task','🌷'.repeat(500000))));
assert.throws(()=>parse(source,{...data,workspace:{...data.workspace,savedDetails:{[id]:{...job,applyUrl:'https://attacker.invalid/apply'}}}}));
assert.throws(()=>parse(source,JSON.stringify(data).replace('"savedDetails":{','"savedDetails":{"__proto__":{},')));
{
 const app=create(blank());const before=[...app.storage];const c=review(app);assert.deepEqual(c,{jobs:1,saved:1,states:1,receipts:1,actions:1,conflicts:0});assert.deepEqual([...app.storage],before,'preview wrote storage');
 assert.equal(await app.evaluate('applyBackup()'),true);assert.equal(app.evaluate(`states[${q}]`),'Submission uncertain');assert.equal(app.evaluate(`readApplicationRecord(${q}).receiptNote`),receipt.receiptNote);assert.equal(app.evaluate(`readNextAction(${q}).actionNote`),action.actionNote);assert.equal(app.evaluate('profile.degree'),undefined);
 assert(!app.storage.has('ahmad-application-record-v1:'+encodeURIComponent(id)));assert(!app.storage.has('ahmad-next-action-v1:'+encodeURIComponent(id)));
 const recovery=JSON.parse(app.storage.get('ahmad-pre-restore-v1'));assert.deepEqual(recovery.backup.workspace.saved,[]);
 app.evaluate('prepareRecoveryBackup()');assert.deepEqual(JSON.parse(app.evaluate('backupExport')).workspace.saved,[]);
 const reloaded=create(app.storage);assert.equal(reloaded.evaluate(`readNextAction(${q}).actionNote`),action.actionNote);
 review(reloaded);assert.equal(reloaded.evaluate('backupPreview.changed'),false);const snapshot=[...reloaded.storage];assert.equal(await reloaded.evaluate('applyBackup()'),false);assert.deepEqual([...reloaded.storage],snapshot);
 reloaded.evaluate(`openJob(${q});recordDrafts[${q}].receiptNote='Changed after import'`);assert.equal(await reloaded.evaluate(`saveApplicationRecord(${q})`),true);assert.equal(reloaded.evaluate(`readApplicationRecord(${q}).receiptNote`),'Changed after import');assert.equal(create(reloaded.storage).evaluate(`readApplicationRecord(${q}).receiptNote`),'Changed after import');
 reloaded.evaluate(`openJob(${q});actionDrafts[${q}].actionNote='';actionDrafts[${q}].dueOn='';actionDrafts[${q}].completed=false`);assert.equal(await reloaded.evaluate(`saveNextAction(${q})`),true);assert.equal(create(reloaded.storage).evaluate(`readNextAction(${q}).actionNote`),'');
 await reloaded.evaluate('prepareBackup()');const out=JSON.parse(reloaded.evaluate('backupExport'));assert.equal(out.applicationRecords[0].receiptNote,'Changed after import');assert.equal(out.nextActions[0].actionNote,'');assert.equal(out.platform,'web');assert.equal(out.workspace.states[id],'Submission uncertain');assert(!JSON.stringify(out).includes('searchComparison'));
 if(process.argv.includes('--write-fixture'))writeFileSync(new URL('./fixtures/web-backup.json',import.meta.url),JSON.stringify(out,null,2)+'\n');
}
{
 const existing={saved:[],states:{[id]:'Not started'},savedDetails:{[id]:{...job,summary:'Preserved summary'}}};const app=create(new Map([['ahmad-workspace',JSON.stringify(existing)],['ahmad-application-record-v1:'+encodeURIComponent(id),JSON.stringify({...receipt,receiptNote:'Preserved receipt'})],['ahmad-next-action-v1:'+encodeURIComponent(id),JSON.stringify({...action,actionNote:'Preserved task'})]]));review(app);assert.equal(app.evaluate('backupPreview.count.conflicts'),4);assert(await app.evaluate('applyBackup()'));assert.equal(app.evaluate(`states[${q}]`),'Not started');assert.equal(app.evaluate(`savedDetails[${q}].summary`),'Preserved summary');assert.equal(app.evaluate(`readApplicationRecord(${q}).receiptNote`),'Preserved receipt');
}
for(const key of ['ahmad-workspace','ahmad-pre-restore-v1']){
 const app=create(blank());review(app);const before=app.storage.get('ahmad-workspace');app.failKeys.add(key);assert.equal(await app.evaluate('applyBackup()'),false);assert.equal(app.storage.get('ahmad-workspace'),before);assert.deepEqual(app.json('saved'),[]);assert.equal(app.evaluate(`readNextAction(${q})`),null);
}
for(const key of ['ahmad-workspace','ahmad-profile','ahmad-checklist','ahmad-application-record-v1:'+encodeURIComponent(id),'ahmad-next-action-v1:'+encodeURIComponent(id)]){
 const app=create(blank());review(app);const changed=key.endsWith('workspace')?{saved:[],states:{},savedDetails:{[id]:job}}:key.endsWith('profile')?{years:'1'}:key.endsWith('checklist')?{profile:true}:key.includes('application-record')?receipt:action;app.storage.set(key,JSON.stringify(changed));const before=app.storage.get('ahmad-workspace');assert.equal(await app.evaluate('applyBackup()'),false,key);assert.equal(app.storage.get('ahmad-workspace'),before);assert.match(app.evaluate('backupNotice'),/changed after this preview|orphaned/);
}
{
 const app=create(blank(),{locks:null});review(app);assert.equal(await app.evaluate('applyBackup()'),false);assert.match(app.evaluate('backupNotice'),/unavailable/);
 const orphan=create(blank());orphan.storage.set('ahmad-next-action-v1:'+encodeURIComponent(id),JSON.stringify(action));await orphan.evaluate('prepareBackup()');assert.match(orphan.evaluate('backupNotice'),/orphaned/);assert.equal(orphan.evaluate('backupExport'),'');
 const unreadable=create(blank());unreadable.storage.set('ahmad-next-action-v1:'+encodeURIComponent(id),'null');assert.equal(review(unreadable),null);assert.match(unreadable.evaluate('backupNotice'),/orphaned|unreadable/);
 const draft=create(blank());draft.evaluate("profileDraft.skills='Unfinished edit'");assert.equal(review(draft),null);assert.match(draft.evaluate('backupNotice'),/unsaved/);
 const quota=create(blank());quota.failAllWrites();assert(review(quota));assert.equal(await quota.evaluate('applyBackup()'),false);
}
{
 const app=create(blank());review(app);await app.dispatch('input',{id:'backup-input',value:'{}'});assert.equal(app.evaluate('backupPreview'),null);assert.equal(await app.evaluate('applyBackup()'),false);
}
if(existsSync(new URL('./fixtures/native-backup.json',import.meta.url))){const app=create(blank());const native=JSON.parse(readFileSync(new URL('./fixtures/native-backup.json',import.meta.url),'utf8'));assert(parse(app,native));assert(review(app,native));assert(await app.evaluate('applyBackup()'));assert.equal(app.json('saved').length,native.workspace.saved.length);}
{
 const initial=new Map([['ahmad-workspace',JSON.stringify({saved:[],states:{},savedDetails:{[id]:job}})]]);
 const a=create(initial,{shared:true}),b=create(initial,{shared:true});
 a.evaluate(`openJob(${q});recordDrafts[${q}].receiptNote='STALE draft';actionDrafts[${q}].actionNote='STALE task'`);
 review(b);assert(await b.evaluate('applyBackup()'));
 assert.equal(a.evaluate(`readApplicationRecord(${q}).receiptNote`),receipt.receiptNote);
 assert.equal(a.evaluate(`readNextAction(${q}).actionNote`),action.actionNote);
 assert.equal(await a.evaluate(`saveApplicationRecord(${q})`),false);
 assert.equal(await a.evaluate(`saveNextAction(${q})`),false);
 assert.equal(create(initial).evaluate(`readApplicationRecord(${q}).receiptNote`),receipt.receiptNote);
 assert.equal(create(initial).evaluate(`readNextAction(${q}).actionNote`),action.actionNote);
}
{
 const bulk=(prefix,count)=>{const rows=Array.from({length:count},(_,i)=>({...job,id:prefix+i,title:'Synthetic software role',gaps:[],steps:[],summary:'Synthetic backup capacity check'}));return {...data,workspace:{saved:[],states:{},savedDetails:Object.fromEntries(rows.map(j=>[j.id,j]))},applicationRecords:rows.map(j=>({...receipt,jobId:j.id,receiptNote:'🌷'.repeat(2000)})),nextActions:[]};};
 const existing=bulk('existing-cap-',300),incoming=bulk('incoming-cap-',300);
 assert(parse(source,JSON.stringify(existing,null,2)));assert(parse(source,JSON.stringify(incoming,null,2)));
 const records=new Map([['ahmad-workspace',JSON.stringify(existing.workspace)],...existing.applicationRecords.map(r=>['ahmad-application-record-v1:'+encodeURIComponent(r.jobId),JSON.stringify(r)])]);
 const app=create(records),before=[...app.storage];assert.equal(review(app,incoming),null);assert.match(app.evaluate('backupNotice'),/4 MiB/);assert.deepEqual([...app.storage],before,'oversized merged portable export changed storage');
 const tooLarge=bulk('existing-large-',600),huge=new Map([['ahmad-workspace',JSON.stringify(tooLarge.workspace)],...tooLarge.applicationRecords.map(r=>['ahmad-application-record-v1:'+encodeURIComponent(r.jobId),JSON.stringify(r)])]);
 const recover=create(huge);assert.equal(review(recover),null);assert.match(recover.evaluate('backupNotice'),/4 MiB/);assert(!recover.storage.has('ahmad-pre-restore-v1'));
}
console.log('Backup validation, atomic additive restore, failure, duplicate, stale preview, fallback and export checks passed.');
