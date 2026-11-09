import assert from 'node:assert/strict';
import fs from 'node:fs';
import './web/core.js';
import {parsePublicBoard,PUBLIC_SOURCES} from './feeds.mjs';
const C=globalThis.CareerCore,F=JSON.parse(fs.readFileSync(new URL('./fixtures/public-boards.json',import.meta.url)));
const now=new Date('2026-11-09T21:30:00Z');
assert.equal(C.ageInSaudiDays('2026-11-10',now),0);
assert.equal(C.ageInSaudiDays('2026-11-09T20:59:59Z',now),1);
assert.equal(C.ageInSaudiDays('',now),null);
for(const [posted,days,expected] of [['2026-11-04',7,true],['2026-11-03',7,false],['2026-11-11',7,false],['',7,false],['',0,true]])assert.equal(C.discoveryMatches({posted},{days},now),expected);
assert(C.discoveryMatches({company:'Mozn',employmentType:'Internship'},{company:'Mozn',employmentType:'Internship'}));
assert(!C.discoveryMatches({company:'Mozn',employmentType:'Full time'},{employmentType:'Internship'}));
assert.equal(C.employerMode('ashby',{isRemote:true,workplaceType:'Hybrid'}),'Hybrid');
assert.equal(C.employerMode('ashby',{isRemote:true,workplaceType:'OnSite'}),'On-site');
assert.equal(C.employerMode('ashby',{isRemote:true}),'Remote or hybrid');
assert.equal(C.employerMode('recruitee',{remote:true,on_site:true,hybrid:false}),'On-site / Remote');
assert.equal(C.employerMode('recruitee',{}),'Not stated');
const text='<script>Bachelor of evasion</script><style>5 years secret</style><p>Bachelor’s degree preferred, or equivalent practical experience.</p><p>Minimum 3 years of professional experience.</p><p>Great team &amp; culture.</p>';
assert.deepEqual(C.requirementNotes('Paid leave for new parents. With more than 25 years of conversational AI research, we serve over 5,000 enterprises.'),[]);
assert.equal(C.requirementNotes('This is a paid internship for university graduates. Minimum 3 years of professional experience.').length,2);
assert.deepEqual(C.requirementNotes('&lt;p&gt;Bachelor&#39;s degree required.&lt;/p&gt;&lt;p&gt;Minimum 3 years of experience.&lt;/p&gt;'),["Bachelor's degree required.",'Minimum 3 years of experience.']);
assert.deepEqual(C.requirementNotes('&lt;script&gt;Bachelor degree secret&lt;/script&gt;'),[]);
for(const key of ['constructor','__proto__','toString'])assert.equal(C.employerMode('ashby',{workplaceType:key}),'Not stated');
const notes=C.requirementNotes(text);
assert.equal(notes.length,2);assert(!notes.join('').includes('evasion'));assert(notes[0].includes('preferred'));assert(notes[0].includes('equivalent'));
assert.deepEqual(C.requirementNotes('x'.repeat(120001)),[]);assert(C.requirementNotes('Bachelor '+ 'x'.repeat(700))[0].length<=260);
const ashby=F[4].data.jobs[0],as=PUBLIC_SOURCES[4];
let result=parsePublicBoard(as,{jobs:[{...ashby,isRemote:true,workplaceType:'Hybrid',descriptionHtml:text,employmentType:'Intern'}]});
assert.equal(result.jobs[0].mode,'Hybrid');assert.equal(result.jobs[0].postedKind,'last-published');assert.equal(result.jobs[0].employmentType,'Internship');assert.deepEqual(result.jobs[0].requirementNotes,notes);
result=parsePublicBoard(as,{jobs:[{...ashby,location:'US',address:{postalAddress:{addressCountry:'US'}},secondaryLocations:[{location:'Riyadh',address:{addressCountry:'SA'}}]}]});
assert.equal(result.jobs.length,1);assert.match(result.jobs[0].location,/Riyadh/);
result=parsePublicBoard(as,{jobs:[{...ashby,location:'US',address:{postalAddress:{addressCountry:'US'}},secondaryLocations:[{location:'Riyadh',address:{addressCountry:'US'}}]}]});assert.equal(result.jobs.length,0);
const rs=PUBLIC_SOURCES[6],row=F[6].data.offers[0];
result=parsePublicBoard(rs,F[6].data);assert.equal(result.jobs.length,1);assert.equal(result.jobs[0].posted,'2026-01-01T00:00:00Z');assert.equal(result.jobs[0].postedKind,'last-published');assert.equal(result.jobs[0].employmentType,'Full time (permanent)');assert(C.normalizeJob(result.jobs[0]));
for(const change of [{published_at:'2026-02-30 00:00:00 UTC'},{published_at:123},{close_at:'bad'},{status:null},{slug:'../escape'},{careers_url:'https://evil.example/o/junior-software-developer'},{locations:[null]},{remote:'true'}])assert.equal(parsePublicBoard(rs,{offers:[{...row,...change}]}).source.ok,false,JSON.stringify(change));
for(const data of [{jobs:[row]},{offers:null},[]])assert.throws(()=>parsePublicBoard(rs,data));
for(const change of [{status:'closed'},{close_at:'2020-01-01 00:00:00 UTC'},{locations:[{country_code:'US',city:'Riyadh'}]},{locations:[{country_code:'',country:'Saudi Arabia',city:'Riyadh'}]},{title:'Senior Software Engineer'}]){
 result=parsePublicBoard(rs,{offers:[{...row,...change},{}]});assert.equal(result.jobs.length,0);assert.deepEqual(result.source.excludedIds,['unifonic-12345']);assert.equal(result.source.detailErrors,1);
}
result=parsePublicBoard(rs,{offers:[{...row,status:'closed'},row,{}]});assert.equal(result.jobs.length,1);assert.deepEqual(result.source.excludedIds,[]);
assert.equal(C.safeJobURL('https://jobs.unifonic.com/o/test'),'https://jobs.unifonic.com/o/test');for(const url of ['https://jobs.unifonic.com/apply','https://user@jobs.unifonic.com/o/test','http://jobs.unifonic.com/o/test','https://jobs.unifonic.com:444/o/test'])assert.equal(C.safeJobURL(url),'#');
console.log('Upgrade checks passed: honest dates/workplace semantics, Saudi-day filters, bounded requirement excerpts, direct secondary geography and Unifonic published/URL/country/deadline boundaries.');

for(const key of ['constructor','__proto__','toString']){const r=parsePublicBoard(as,{jobs:[{...ashby,employmentType:key,workplaceType:key}]});assert(r.source.ok);assert(C.normalizeJob(r.jobs[0]));const q=parsePublicBoard(rs,{offers:[{...row,employment_type_code:key}]});assert(q.source.ok);assert(C.normalizeJob(q.jobs[0]));}

for(const url of ['https://alcon.wd5.myworkdayjobs.com/o/'+row.slug,'https://www.careers.jnj.com/o/'+row.slug])assert.equal(parsePublicBoard(rs,{offers:[{...row,careers_url:url}]}).source.ok,false);
for(const v of ['Full-time','Full time','full_time'])assert.equal(C.employmentLabel(v),'Full time');assert.equal(C.employmentLabel('Full time (permanent)'),'Full time (permanent)');
