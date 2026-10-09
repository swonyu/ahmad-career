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

for(const [input,expected] of [['',''],['  ',''],['0','0'],['10,000','10000'],['١٠٬٠٠٠','10000'],['۱۰٬۰۰۰٫۰۰','10000'],['1000000','1000000'],['0010.00','10'],['1,00',null],['1000001',null],['-1',null],['1.50',null],['1e4',null],['Infinity',null],['10 000',null]]){
  assert.equal(core.canonicalMinimumSAR(input),expected,`Minimum pay input: ${input}`);
}
const criteriaCases=[
  ['Neutral city','Jeddah',{},true,'any','inactive'],
  ['English Riyadh','Riyadh, Saudi Arabia',{preferredCity:'riyadh'},true,'confirmed','inactive'],
  ['Arabic Riyadh','الرياض، السعودية',{preferredCity:'riyadh'},true,'confirmed','inactive'],
  ['Other city','Jeddah, Saudi Arabia',{preferredCity:'riyadh'},false,'outside','inactive'],
  ['Country only','Saudi Arabia',{preferredCity:'riyadh'},false,'outside','inactive'],
  ['Missing city','',{preferredCity:'riyadh'},false,'outside','inactive'],
  ['Ambiguous count','2 Locations, Saudi Arabia',{preferredCity:'riyadh'},false,'outside','inactive'],
  ['Multiple cities','Riyadh / Jeddah',{preferredCity:'riyadh'},true,'conditional','inactive'],
  ['Arabic multiple cities','الرياض، جدة',{preferredCity:'riyadh'},true,'conditional','inactive'],
  ['Riyadh and unknown site','Riyadh / other locations',{preferredCity:'riyadh'},true,'conditional','inactive'],
  ['Word boundaries','Riyadhville, Saudi Arabia',{preferredCity:'riyadh'},false,'outside','inactive'],
  ['Blank floor disables hide','Riyadh',{unknownSalary:'hide'},true,'any','inactive'],
  ['Zero floor disables hide','Riyadh',{minimumMonthlySAR:'0',unknownSalary:'hide'},true,'any','inactive'],
  ['Unknown pay defaults to show','Riyadh',{minimumMonthlySAR:'10000'},true,'any','unverified'],
  ['Unknown pay can be hidden','Riyadh',{minimumMonthlySAR:'10000',unknownSalary:'hide'},false,'any','unverified'],
];
for(const [label,location,profile,included,city,salary] of criteriaCases){
  const job=Object.freeze({location,salary:null,rank:7}),criteria=core.criteriaFor(job,profile);
  assert.deepEqual(criteria,{included,city,salary},label);
  assert.equal(job.rank,7,'Criteria must preserve the editorial rank');
}
assert.equal(core.criteriaFor({location:'Riyadh',salary:{min:20000,max:30000}},{minimumMonthlySAR:'10000'}).salary,'unverified','An unsupported salary shape cannot prove comparable monthly pay');
console.log('Criteria matrix passed: neutral defaults, strict city evidence, Arabic amounts and unverified salary.');

const datedResearch={id:'date-precedence-fixture',title:'Bundled title',kind:'researched',rank:1,researchCheckedAt:'2026-10-09'};
for(const [checkedAt,expected] of [
  ['2026-10-08T23:00:00Z','Employer update'],
  ['2026-10-09T02:00:00+03:00','Employer update'],
  ['2026-10-09','Bundled title'],
  ['2026-10-08T21:00:00Z','Bundled title'],
  ['2026-10-09T00:00:00+03:00','Bundled title'],
  ['2026-10-08T20:59:59Z','Bundled title'],
]){
  const fresh={...datedResearch,title:'Employer update',kind:'live',lastCheckedAt:checkedAt};
  for(const fromSnapshot of [false,true])assert.equal(core.mergeJobs([datedResearch],fromSnapshot?[fresh]:[],fromSnapshot?[]:[fresh])[0].title,expected,`Saudi research boundary: ${checkedAt}, snapshot=${fromSnapshot}`);
}
const preciseResearch={...datedResearch,researchCheckedAt:'2026-10-09T00:30:00Z'};
assert.equal(core.mergeJobs([preciseResearch],[],[{...datedResearch,title:'Older offset update',lastCheckedAt:'2026-10-09T02:00:00+03:00'}])[0].title,'Bundled title','An older instant cannot win through offset spelling');
const archivedDate={...datedResearch,kind:'archived',lastCheckedAt:'2026-10-09'};
const laterSameSaudiDay={...datedResearch,title:'Later archived employer facts',kind:'live',lastCheckedAt:'2026-10-08T23:00:00Z'};
assert.equal(core.mergeJobs([],[archivedDate],[laterSameSaudiDay])[0].title,laterSameSaudiDay.title,'Archived snapshot merging must use the same Saudi date boundary');
console.log('Evidence chronology passed: Saudi midnight, equivalent offsets, exact ties and archived snapshots.');

for(const location of ['Riyadh Region, Saudi Arabia','Riyadh Province','منطقة الرياض، السعودية','Al Kharj, Riyadh Region','إقليم الرياض'])assert.equal(core.riyadhCity(location),'outside',location);
for(const location of ['Riyadh, Riyadh Region, Saudi Arabia','الرياض، منطقة الرياض'])assert.equal(core.riyadhCity(location),'confirmed',location);
console.log('Region names alone do not establish Riyadh city.');

const correctedSnapshot={...datedResearch,title:'Corrected durable facts',researchCheckedAt:'2026-10-08',closes:'2099-02-01'};
const oldEmployer={...correctedSnapshot,title:'Obsolete employer facts',kind:'live',rank:undefined,researchCheckedAt:undefined,lastCheckedAt:'2026-10-07T00:00:00Z',closes:'2099-01-01'};
const archivedMixed=core.mergeJobs([],[correctedSnapshot],[oldEmployer]);
for(let i=0;i<3;i++){
 const repeated=core.mergeJobs([],archivedMixed,[oldEmployer]);assert.equal(repeated[0].title,correctedSnapshot.title);assert.equal(repeated[0].closes,correctedSnapshot.closes);
 assert.equal(repeated[0].researchCheckedAt,correctedSnapshot.researchCheckedAt);assert.equal(repeated[0].lastCheckedAt,oldEmployer.lastCheckedAt);
}
console.log('Archived merging is idempotent across mixed evidence dates.');

// research facts and employer observations have separate clocks.
for(const [researchCheck,savedCheck,expected] of [
 [undefined,undefined,'2026-10-09T00:10:00Z'],
 ['2026-10-09T00:05:00Z',undefined,'2026-10-09T00:10:00Z'],
 ['2026-10-09T00:15:00Z',undefined,'2026-10-09T00:15:00Z'],
 [undefined,'2026-10-09T00:20:00Z','2026-10-09T00:20:00Z'],
]){
 const research=Object.freeze({...preciseResearch,lastCheckedAt:researchCheck});
 const observed=Object.freeze({id:research.id,title:'Older employer facts',kind:'live',lastCheckedAt:'2026-10-09T00:10:00Z'});
 const snapshots=savedCheck?[Object.freeze({...observed,lastCheckedAt:savedCheck})]:[];
 const merged=core.mergeJobs([research],snapshots,[observed])[0];
 assert.equal(merged.title,research.title);assert.equal(merged.lastCheckedAt,expected);
 assert.equal(core.mergeJobs([research],[merged],[])[0].lastCheckedAt,expected,'Observation survives healthy-zero cache turnover');
}
const oldObservation=Object.freeze({...preciseResearch,lastCheckedAt:'2026-10-09T00:20:00Z'});
const laterResearch=Object.freeze({...preciseResearch,title:'Later research',researchCheckedAt:'2026-10-09T01:00:00Z',lastCheckedAt:'2026-10-09T00:10:00Z'});
const archivedObservation=core.mergeJobs([],[oldObservation,laterResearch],[])[0];
assert.equal(archivedObservation.title,laterResearch.title);assert.equal(archivedObservation.lastCheckedAt,oldObservation.lastCheckedAt);

console.log('Employer observations survive editorial precedence and retained-cache turnover.');
