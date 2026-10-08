import assert from 'node:assert/strict';
import './web/core.js';
const core=globalThis.CareerCore;
assert.equal(typeof core.isSaudi, 'function', 'Saudi filtering must exist');
assert(core.isSaudi('Riyadh, Saudi Arabia')); assert(core.isSaudi('Jeddah')); assert(!core.isSaudi('Dubai')); assert(!core.isSaudi('2 Locations'));
assert.equal(core.relevance('Supply Chain Manager'), 90); assert.equal(core.relevance('Sales Manager'), 0); assert.equal(core.relevance('Supply Chain Intern'), 0);
assert.equal(core.relevance('Early in Career - Supply Chain'),0);assert.equal(core.relevance('Business Value Partner'),65);assert.equal(core.relevance('Strategic Supplier Relationship Manager'),90);
assert.equal(core.safeURL('javascript:alert(1)'), '#'); assert.equal(core.safeURL('https://example.com/'), 'https://example.com/');
const now=new Date('2026-10-08T12:00:00Z');
assert(core.isExpired('2026-07-31',now)); assert(!core.isExpired('2026-10-08',now)); assert(!core.isExpired(null,now));
assert.deepEqual(core.dedupe([{id:'a'},{id:'a'},{id:'b'}]).map(x=>x.id),['a','b']);
console.log('Core checks passed: Saudi scope, relevance, URLs, closing dates and deduplication.');

assert.equal(core.safeJobURL('https://example.com/phishing'), '#');
assert.equal(core.safeJobURL('https://apply.workable.com/another-employer/j/ABC/'), '#');
assert.equal(core.safeURL('https://user:secret@example.com/'), '#');
assert.equal(core.safeJobURL('https://jj.wd5.myworkdayjobs.com/JJ/job/Riyadh/Test'), 'https://jj.wd5.myworkdayjobs.com/JJ/job/Riyadh/Test');
assert.equal(core.normalizeJob({id:'x',title:'Supply Chain Manager',company:'Alcon',location:'Riyadh',url:'https://example.com/phishing'}),null);
