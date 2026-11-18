import assert from 'node:assert/strict';
import './web/core.js';
import {createApp} from './state-check.mjs';
const C=globalThis.CareerCore;
const record={schema:1,jobId:'a',dueOn:'2028-02-29',actionNote:'Ask myself what evidence to prepare 🌷',completed:false,updatedAt:'2026-11-09T21:00:00.000Z'};
assert(C.validNextAction(record,'a'));
for(const patch of [{schema:2},{jobId:'b'},{dueOn:'2027-02-29'},{dueOn:'2026-01-01T00:00:00Z'},{completed:1},{actionNote:''},{actionNote:' '},{actionNote:'x'.repeat(501)},{actionNote:'\ud800'},{updatedAt:'2026-11-09T21:00:00Z'},{unexpected:1}])assert(!C.validNextAction({...record,...patch},'a'),JSON.stringify(patch));
assert(C.validNextAction({...record,actionNote:'🌷'.repeat(500)},'a'));
assert(C.validNextAction({...record,dueOn:'',actionNote:''},'a'));
assert(!C.validNextAction({...record,dueOn:'',actionNote:'',completed:true},'a'));
assert(C.validNextAction({...record,dueOn:'1900-01-01'},'a'));
for(const [dueOn,expected] of [['2026-11-09','overdue'],['2026-11-10','today'],['2026-11-17','next7days'],['2026-11-18','upcoming'],['','undated']])assert.equal(C.nextActionBucket({...record,dueOn},new Date(record.updatedAt)),expected);
assert.equal(C.nextActionBucket({...record,dueOn:'2026-11-10'},new Date('2026-11-09T20:59:59Z')),'next7days');
assert.equal(C.nextActionBucket({...record,completed:true},new Date(record.updatedAt)),'completed');
const locks={request:async(_key,fn)=>fn()};
function setup(storage=new Map(),options={}){const app=createApp(storage,{locks,...options});const id=app.evaluate('D.jobs[0].id');app.evaluate(`openJob(${JSON.stringify(id)});$('#next-action-form').dataset.record=${JSON.stringify(id)};$('#action-completion').dataset.record=${JSON.stringify(id)}`);return {app,id,q:JSON.stringify(id),key:'ahmad-next-action-v1:'+encodeURIComponent(id)}}
{
 const {app,id,q,key}=setup();app.evaluate(`actionDrafts[${q}].actionNote='PRIVATE unique reminder';actionDrafts[${q}].dueOn='2026-11-10'`);
 assert.equal(await app.evaluate(`saveNextAction(${q})`),true);assert.equal(app.storage.has('ahmad-application-record-v1:'+encodeURIComponent(id)),false);
 assert(app.json(`savedDetails[${q}]`));assert.equal(app.evaluate(`meaningfulRecord(${q})`),false);assert.equal(app.evaluate(`applicationJobs().some(j=>j.id===${q})`),true);
 assert.match(app.evaluate('applicationsPage()'),/Record only/);assert(!app.evaluate(`applicationAdvisory(jobById(${q}))`).includes('already has a local application record'));
 const reload=setup(app.storage).app;assert.equal(reload.evaluate(`readNextAction(${q}).actionNote`),'PRIVATE unique reminder');
 assert.equal(await app.evaluate(`saveNextAction(${q},true)`),true);assert.equal(JSON.parse(app.storage.get(key)).completed,true);assert.match(app.evaluate('nextActionsSection()'),/Completed/);
 assert.equal(await app.evaluate(`saveNextAction(${q},false)`),true);
 app.evaluate(`states[${q}]='Closed / not pursuing'`);assert.match(app.evaluate('nextActionsSection()'),/reminder still unfinished/);
 app.evaluate(`actionDrafts[${q}].actionNote='UNSAVED private task';actionDrafts[${q}].dueOn=''`);
 const text=await app.exportNotes();assert.match(text,/PRIVATE unique reminder/);assert.match(text,/UNSAVED private task/);assert.match(text,/UNSAVED next action draft/);
 assert(!app.evaluate(`draft(jobById(${q}))`).includes('PRIVATE unique reminder'));assert(!app.evaluate(`draft(jobById(${q}))`).includes('UNSAVED private task'));
 const dialog=app.evaluate("$('#job-dialog').innerHTML");app.changeStatus(id,'Applied');assert.equal(app.evaluate("$('#job-dialog').innerHTML"),dialog);
 app.evaluate(`openJob(${q})`);assert.equal(app.evaluate(`actionDrafts[${q}].actionNote`),'UNSAVED private task');
 assert.equal(app.evaluate('closeRoleDialog()'),false);assert(app.evaluate("$('#job-dialog').open"));
 await app.dispatch('click',{closest:()=>({dataset:{action:'reload-action',record:id}})});assert.equal(app.evaluate(`actionDrafts[${q}].actionNote`),'UNSAVED private task');
 app.evaluate('confirm=()=>true');assert.equal(app.evaluate('closeRoleDialog()'),true);app.evaluate(`openJob(${q})`);assert.equal(app.evaluate(`actionDrafts[${q}].actionNote`),'UNSAVED private task');
 await app.dispatch('click',{closest:()=>({dataset:{action:'reload-action',record:id}})});assert.equal(app.evaluate(`actionDrafts[${q}].actionNote`),'PRIVATE unique reminder');
 app.evaluate(`actionDrafts[${q}].actionNote='';actionDrafts[${q}].dueOn=''`);assert.equal(await app.evaluate(`saveNextAction(${q})`),true);assert.equal(app.evaluate(`meaningfulAction(${q})`),false);
}
{
 const shared=new Map(),a=setup(shared,{shared:true}),b=setup(shared,{shared:true});
 a.app.evaluate(`actionDrafts[${a.q}].actionNote='first'`);b.app.evaluate(`actionDrafts[${b.q}].actionNote='second'`);
 assert(await a.app.evaluate(`saveNextAction(${a.q})`));assert.equal(await b.app.evaluate(`saveNextAction(${b.q})`),false);assert.equal(JSON.parse(shared.get(a.key)).actionNote,'first');assert.equal(b.app.evaluate(`actionDrafts[${b.q}].actionNote`),'second');
 await b.app.windowEvent('storage',{key:a.key});assert.equal(b.app.evaluate(`actionDrafts[${b.q}].actionNote`),'second');
 const bad=setup();bad.app.storage.set(bad.key,'{corrupt');bad.app.evaluate(`actionDrafts[${bad.q}].actionNote='preserve me'`);assert.equal(await bad.app.evaluate(`saveNextAction(${bad.q})`),false);assert.equal(bad.app.storage.get(bad.key),'{corrupt');assert.match(await bad.app.exportNotes(),/unreadable; original bytes preserved/);
 const noLock=setup(new Map(),{locks:undefined});noLock.app.evaluate(`actionDrafts[${noLock.q}].actionNote='keep'`);assert.equal(await noLock.app.evaluate(`saveNextAction(${noLock.q})`),false);assert(!noLock.app.storage.has(noLock.key));
}
{
 let release;const gates=[];const {app,q,key}=setup(new Map(),{locks:{request:async(name,fn)=>{if(name.includes('next-action'))await new Promise(resolve=>{release=resolve;gates.push(name)});return fn()}}});
 app.evaluate(`actionDrafts[${q}].actionNote='submitted'`);const pending=app.evaluate(`saveNextAction(${q})`);app.evaluate(`actionDrafts[${q}].actionNote='later typing'`);
 assert.equal(await app.evaluate(`saveNextAction(${q})`),false);assert.equal(app.evaluate('closeRoleDialog()'),false);release();assert(await pending);assert.equal(JSON.parse(app.storage.get(key)).actionNote,'submitted');assert.equal(app.evaluate(`actionDrafts[${q}].actionNote`),'later typing');assert(app.evaluate(`actionDirty(actionDrafts[${q}])`));
 let prevented=false;await app.windowEvent('beforeunload',{preventDefault(){prevented=true}});assert(prevented);
}
{
 const {app,id,q,key}=setup();const receipt={schema:1,jobId:id,appliedAt:'2026-01-01',receiptNote:'Existing receipt',updatedAt:'2026-01-01T00:00:00.000Z'},receiptKey='ahmad-application-record-v1:'+encodeURIComponent(id),bytes=JSON.stringify(receipt);app.storage.set(receiptKey,bytes);
 app.evaluate(`actionDrafts[${q}].actionNote='keep receipt separate';document.activeElement=$('#action-note')`);const focus=app.evaluate('document.activeElement');await app.dispatch('change',{dataset:{status:id},value:'Closed / not pursuing'});assert.equal(app.evaluate('document.activeElement'),focus);
 assert(await app.evaluate(`saveNextAction(${q})`));assert.equal(app.storage.get(receiptKey),bytes);
 app.storage.set(key,'null is not JSON');const reloaded=setup(app.storage).app;assert.match(reloaded.evaluate('nextActionsSection()'),/saved next action is unreadable/);assert(reloaded.evaluate(`applicationJobs().some(j=>j.id===${q})`));
 const failed=setup();failed.app.evaluate(`actionDrafts[${failed.q}].actionNote='quota draft'`);failed.app.failKeys.add(failed.key);assert.equal(await failed.app.evaluate(`saveNextAction(${failed.q})`),false);assert(!failed.app.storage.has(failed.key));assert.match(await failed.app.exportNotes(),/quota draft/);
}
{
 const {app,q,key}=setup();app.storage.set(key,'null');app.evaluate(`delete actionDrafts[${q}];openJob(${q});actionDrafts[${q}].actionNote='do not overwrite null'`);
 assert.equal(await app.evaluate(`saveNextAction(${q})`),false);assert.equal(app.storage.get(key),'null');assert.match(app.evaluate('nextActionsSection()'),/saved next action is unreadable/);
 const reload=setup(app.storage).app;assert.match(reload.evaluate('nextActionsSection()'),/saved next action is unreadable/);assert.equal(reload.storage.get(key),'null');
}
{
 let now=Date.parse('2026-11-09T20:59:59Z'),sequence=0;const timers=new Map();
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
 const {app,id,q,key}=setup(new Map(),{Date:Clock,setTimeout(fn,delay){const id=++sequence;timers.set(id,{fn,delay});return id},clearTimeout(id){timers.delete(id)}});
 app.storage.set(key,JSON.stringify({...record,jobId:id,dueOn:'2026-11-09'}));app.evaluate("view='plan';document.visibilityState='visible';render()");
 const timer=app.evaluate('dayRolloverTimer');assert.equal(timers.get(timer).delay,1000);assert.match(app.evaluate("$('#main').innerHTML"),/<h3>Today /);
 app.evaluate(`actionDrafts[${q}].actionNote='draft through midnight';document.activeElement=$('#action-note')`);const focus=app.evaluate('document.activeElement'),dialog=app.evaluate("$('#job-dialog').innerHTML");
 now+=1000;const tick=timers.get(timer);timers.delete(timer);tick.fn();assert.match(app.evaluate("$('#main').innerHTML"),/<h3>Overdue /);assert.equal(app.evaluate('document.activeElement'),focus);assert.equal(app.evaluate("$('#job-dialog').innerHTML"),dialog);assert.equal(app.evaluate(`actionDrafts[${q}].actionNote`),'draft through midnight');assert.equal(timers.get(app.evaluate('dayRolloverTimer')).delay,86400000);
 app.evaluate("document.visibilityState='hidden'");await app.dispatch('visibilitychange',{});assert.equal(app.evaluate('dayRolloverTimer'),null);
 now+=86400000;app.evaluate("document.visibilityState='visible';view='applications'");await app.windowEvent('pageshow',{});assert.match(app.evaluate("$('#main').innerHTML"),/<h3>Overdue /);assert.equal(timers.get(app.evaluate('dayRolloverTimer')).delay,86400000);
 const prior=app.evaluate('dayRolloverTimer');await app.dispatch('visibilitychange',{});assert(!timers.has(prior));assert(timers.has(app.evaluate('dayRolloverTimer')));
 app.evaluate("view='live';render()");assert.equal(app.evaluate('dayRolloverTimer'),null);
}
console.log('Next-action validation, Riyadh buckets, persistence, conflict, draft, completion and export regressions passed.');
