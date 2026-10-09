import assert from 'node:assert/strict';
import './web/core.js';
const C=globalThis.CareerCore,now=new Date('2026-10-09T21:00:00Z'); // Riyadh Oct10
for(const malformed of ['2026-10-09T24:00:00Z','2026-10-09T21:60:00Z','2026-10-09T21:00:60Z','2026-10-09T21:00:00+24:00']){
 assert.equal(C.parsedDate(malformed),null);
 assert.equal(C.attentionFor([{id:'invalid',closes:malformed}],{},{},now).some(t=>t.kind==='deadline'),false);
}
assert.equal(typeof C.validApplicationRecord,'function','Application record validation must exist');
const record={schema:1,jobId:'a',appliedAt:'2026-10-10',receiptNote:'Private acknowledgement 🌷',updatedAt:now.toISOString()};
assert(C.validApplicationRecord(record,'a',now));
for(const id of [1,'','   ','__proto__'])assert(!C.validApplicationRecord({...record,jobId:id},id,now));
for(const date of ['2026-02-29','2026-10-11','2026-10-10T00:00:00Z','not a date'])assert(!C.validApplicationRecord({...record,appliedAt:date},'a',now));
assert(C.validApplicationRecord({...record,appliedAt:'2024-02-29'},'a',now));
assert(C.validApplicationRecord({...record,appliedAt:'',receiptNote:'🌷'.repeat(2000)},'a',now));
assert(!C.validApplicationRecord({...record,receiptNote:'🌷'.repeat(2001)},'a',now));
for(const patch of [{schema:2},{jobId:'b'},{receiptNote:3},{updatedAt:'2026-10-10'},{inferredActor:'system'}])assert(!C.validApplicationRecord({...record,...patch},'a',now));
const jobs=[{id:'a',closes:'2026-10-09'},{id:'b',closes:'2026-10-10'},{id:'c',closes:'2026-10-17'},{id:'d',closes:'2026-10-18'},{id:'e',closes:'2026-02-29'},{id:'f',closes:'2026-10-09T20:59:59Z'},{id:'g',closes:now.toISOString()}];
const tasks=C.attentionFor(jobs,{}, {},now);
assert.deepEqual(tasks.filter(t=>t.kind==='deadline').map(t=>[t.jobId,t.past]),[['a',true],['f',true],['g',false],['b',false],['c',false]]);
assert.deepEqual(tasks.filter(t=>t.kind==='requirements').map(t=>t.jobId),['b','c','d','e','g']);
assert.deepEqual(C.attentionFor([{id:'a'},{id:'b'},{id:'c'},{id:'d'}],{a:'Applied',b:'Closed / not pursuing',c:'Interviewing',d:'invalid'}, {},now).map(t=>[t.jobId,t.kind]),[['a','applied-date'],['c','applied-date']]);
assert.equal(C.attentionFor([{id:'a'}],{a:'Applied'},{a:record},now).length,0);
assert.equal(C.attentionFor([{id:'a'}],{a:'Applied'},{a:{...record,appliedAt:''}},now).length,1);
console.log('Application record and Riyadh attention fixtures passed.');
