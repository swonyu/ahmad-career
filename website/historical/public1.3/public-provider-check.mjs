import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PUBLIC_SOURCES,parsePublicBoard,publicBoardSource,getLiveJobs} from './feeds.mjs';
const C=globalThis.CareerCore,fixtures=JSON.parse(fs.readFileSync(new URL('./fixtures/public-boards.json',import.meta.url)));
const clone=v=>structuredClone(v);
for(const [i,f] of fixtures.slice(0,6).entries()){
 const source=PUBLIC_SOURCES[i],row=f.data.jobs[0];
 assert.deepEqual(source,f.source);
 let p=parsePublicBoard(source,f.data);assert.equal(p.jobs.length,1);assert(p.source.ok);assert.equal(p.source.detailErrors,0);assert(C.normalizeJob(p.jobs[0]));
 assert.equal(parsePublicBoard(source,{jobs:[]}).source.ok,true,'Valid zero is a success');
 p=parsePublicBoard(source,{jobs:[row,{},null]});assert.equal(p.jobs.length,1);assert.equal(p.source.detailErrors,2);assert(p.source.ok);
 p=parsePublicBoard(source,{jobs:[{}]});assert.equal(p.source.ok,false);
 assert.throws(()=>parsePublicBoard(source,{results:[]}));assert.throws(()=>parsePublicBoard(source,{jobs:Array(5001).fill(row)}));
 p=parsePublicBoard(source,{jobs:Array(501).fill(row)});assert.equal(p.source.scanned,500);assert.equal(p.source.limited,true);assert.equal(p.jobs.length,1);
 for(const title of ['Senior Software Engineer','Bioscience Technician','Biosafety Officer','Presales Consultant, Applied AI'])assert.equal(parsePublicBoard(source,{jobs:[{...row,title}]}).jobs.length,0,title);
 const malformed=clone(row);malformed[source.type==='workable'?'published_on':source.type==='ashby'?'publishedAt':'first_published']='2026-02-30';assert.equal(parsePublicBoard(source,{jobs:[malformed]}).source.ok,false);
 const future=clone(row);future[source.type==='workable'?'published_on':source.type==='ashby'?'publishedAt':'first_published']='2099-01-01';assert.equal(parsePublicBoard(source,{jobs:[future]}).jobs.length,0);
 if(source.type==='workable'){
  const second=clone(row);second.city='Jeddah';second.locations[0].city='Jeddah';
  p=parsePublicBoard(source,{jobs:[second,row,second,row]});assert.equal(p.jobs.length,1);assert.match(p.jobs[0].location,/Riyadh/);assert.match(p.jobs[0].location,/Jeddah/);assert.equal((p.jobs[0].location.match(/Riyadh/g)||[]).length,1);assert.equal(C.riyadhCity(p.jobs[0].location),'conditional');
  const foreign=clone(row);foreign.locations[0].countryCode='JO';assert.equal(parsePublicBoard(source,{jobs:[foreign]}).jobs.length,0,'Foreign country overrides city');
  const hidden=clone(row);hidden.locations[0].hidden=true;assert.equal(parsePublicBoard(source,{jobs:[hidden]}).jobs.length,0);
  const bad=clone(row);bad.locations=[42];assert.equal(parsePublicBoard(source,{jobs:[bad]}).source.ok,false);
  assert.equal(parsePublicBoard(source,{jobs:[{...row,experience:'Director'}]}).jobs.length,0);
 }else if(source.type==='ashby'){
  for(const isListed of [false])assert.equal(parsePublicBoard(source,{jobs:[{...row,isListed}]}).jobs.length,0);
  for(const isListed of [1,'true',null])assert.equal(parsePublicBoard(source,{jobs:[{...row,isListed}]}).source.ok,false);
  const foreign=clone(row);foreign.address.postalAddress.addressCountry='US';assert.equal(parsePublicBoard(source,{jobs:[foreign]}).jobs.length,0);
  for(const jobUrl of ['https://evil.example/job',row.jobUrl.replace('11111111','22222222'),'http://jobs.ashbyhq.com/LeanTech/'+row.id])assert.equal(parsePublicBoard(source,{jobs:[{...row,jobUrl}]}).source.ok,false);
  assert.equal(parsePublicBoard(source,{jobs:[{...row,secondaryLocations:[null]}]}).source.ok,false);
 }else{
  assert.equal(parsePublicBoard(source,f.data).jobs[0].posted,'','updated_at is not a publication date');
  for(const id of [true,1.2,'123',null])assert.equal(parsePublicBoard(source,{jobs:[{...row,id}]}).source.ok,false);
  assert.equal(parsePublicBoard(source,{jobs:[{...row,absolute_url:row.absolute_url+'4'}]}).source.ok,false);
 }
}
for(const title of ['iOS Engineer','Swift Developer','Software Engineering Intern','Tamara Builders Program - Data'])assert(C.relevance(title)>0,title);
const requests=[];
const payload=await getLiveJobs(async(url,options)=>{requests.push({url,options});assert.equal(options.method,'GET');assert.equal(options.body,undefined);assert.equal(options.redirect,'manual');const f=fixtures[requests.length-1];return new Response(JSON.stringify(url.includes('api.smartrecruiters.com')?{offset:0,limit:100,totalFound:0,content:[]}:f.data),{status:200})});
assert.equal(requests.length,9);assert.equal(payload.jobs.length,7);assert(C.normalizeLive(payload));
await assert.rejects(publicBoardSource({name:'Unknown',type:'workable',board:'malicious'}));
for(const source of PUBLIC_SOURCES)await assert.rejects(publicBoardSource(source,async()=>new Response('{}',{status:302})));
assert.equal(parsePublicBoard(PUBLIC_SOURCES[6],fixtures[6].data).jobs.length,1);
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(payload,null,2));
console.log('Public board checks passed: three ATS schemas, six fixed sources, strict URLs/countries/states/dates, multi-city union, duplicates, partial/empty failures, title boundaries, transport request scope and native UI fixture.');
