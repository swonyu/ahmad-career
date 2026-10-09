import assert from 'node:assert/strict';
import { workdaySource, workableSource, SOURCES } from './feeds.mjs';
import './web/core.js';
const C=globalThis.CareerCore;
const source=SOURCES[0];
const now=new Date();
const yesterday=new Date(now-86400000).toISOString().slice(0,10);
const listing={title:'Supply Chain Manager',externalPath:'/job/Tabuk/Supply-Chain-Manager_REQ',locationsText:'Tabuk'};
const detail={title:'Supply Chain Manager',jobReqId:'REQ',canApply:true,posted:true,country:{descriptor:'Saudi Arabia'},location:'Tabuk',startDate:yesterday};
const response=value=>({ok:true,status:200,text:async()=>JSON.stringify(value),json:async()=>value});
const workday=(info=detail,posting=listing)=>async(url,options)=>{
  if(url.endsWith('/jobs'))return response({jobPostings:[posting],total:1});
  if(info instanceof Error)throw info;
  return response(info===null?{}:{jobPostingInfo:info});
};
let failures=0;
async function test(name,run){try{await run();console.log('PASS '+name)}catch(error){failures++;console.error('FAIL '+name+': '+error.message)}}
await test('Riyadh midnight and exact timestamp deadlines',()=>{
  assert.equal(C.isExpired('2026-10-08',new Date('2026-10-08T21:00:01Z')),true);
  assert.equal(C.isExpired('2026-10-09T07:00:00Z',new Date('2026-10-09T08:00:00Z')),true);
  assert.equal(C.isExpired('2026-10-09',new Date('2026-10-09T08:00:00Z')),false);
  assert.equal(C.isExpired('9999-99-99',now),true);
});
await test('Saudi country retains a city outside the short city list',async()=>{
  const result=await workdaySource(source,workday());
  assert.equal(result.jobs.length,1);assert.match(result.jobs[0].location,/Saudi Arabia/);
});
await test('Employer requests use the edge-supported manual redirect mode',async()=>{
  const requests=[],fetcher=async(url,options)=>{
    if(!['follow','manual'].includes(options.redirect))throw new TypeError('Invalid redirect value, must be one of "follow" or "manual"');
    requests.push(options);return workday()(url,options);
  };
  const result=await workdaySource(source,fetcher);
  assert.equal(result.jobs.length,1);assert.deepEqual(requests.map(r=>[r.method,r.redirect]),[['POST','manual'],['GET','manual']]);
});
await test('Employer redirects fail closed at listing and detail boundaries',async()=>{
  for(const status of [301,302,303,307,308])for(const boundary of ['listing','detail']){
    const requests=[];let bodyReads=0;
    const fetcher=async(url,options)=>{
      requests.push({url,options});assert.equal(options.redirect,'manual');
      if(boundary==='detail'&&url.endsWith('/jobs'))return response({jobPostings:[listing],total:1});
      return {ok:false,status,headers:new Headers({Location:'https://redirect.invalid/job'}),text:async()=>{bodyReads++;return '{}'}};
    };
    if(boundary==='listing')await assert.rejects(workdaySource(source,fetcher),new RegExp('Employer returned '+status));
    else{const result=await workdaySource(source,fetcher);assert.equal(result.jobs.length,0);assert.equal(result.source.ok,false);assert.equal(result.source.detailErrors,1)}
    assert.equal(requests.length,boundary==='listing'?1:2);assert.equal(bodyReads,0);
    assert.ok(requests.every(r=>new URL(r.url).hostname===source.host));
  }
});
await test('All failed or malformed Workday details are an incomplete source',async()=>{
  for(const info of [new Error('Offline'),null]){
    const result=await workdaySource(source,workday(info,{...listing,locationsText:'Riyadh'}));
    assert.equal(result.source.ok,false);assert.equal(result.source.detailErrors,1);assert.equal(result.jobs.length,0);
  }
});
await test('Final Workday detail must have an ID and a relevant title',async()=>{
  for(const info of [{...detail,jobReqId:''},{...detail,title:'Sales Manager'}]){
    const result=await workdaySource(source,workday(info,{...listing,locationsText:'Riyadh'}));
    assert.equal(result.jobs.length,0);
  }
});
await test('Conflicting structured country cannot be overridden by a Saudi label',async()=>{
  const result=await workdaySource(source,workday({...detail,location:'Riyadh',country:{descriptor:'United Arab Emirates'}},{...listing,locationsText:'Riyadh'}));
  assert.equal(result.jobs.length,0);
});
await test('An expired timestamp is removed and today\'s published timestamp is accepted',async()=>{
  const stamp=new Date(now-60000).toISOString();
  const result=await workdaySource(source,workday({...detail,startDate:stamp},{...listing,locationsText:'Riyadh'}));
  assert.equal(result.jobs.length,1);
  const expired=await workdaySource(source,workday({...detail,endDate:stamp},{...listing,locationsText:'Riyadh'}));
  assert.equal(expired.jobs.length,0);
});
await test('One failed Qiddiya query retains validated results from the other queries',async()=>{
  const result=await workableSource(async(url,options)=>{
    const {query}=JSON.parse(options.body);if(query==='performance')throw Error('Offline');
    return response({results:[{state:'published',isInternal:false,shortcode:'GOOD1',title:'Procurement Manager',location:{countryCode:'SA',city:'Tabuk'},published:new Date(now-3600000).toISOString()}]});
  });
  assert.equal(result.jobs.length,1);assert.equal(result.source.ok,true);assert.equal(result.source.queryErrors,1);assert.match(result.source.error,/incomplete|failed/i);
});
await test('Future Qiddiya publication and malformed codes are rejected',async()=>{
  const result=await workableSource(async()=>response({results:[
    {state:'published',isInternal:false,shortcode:'FUTURE1',title:'Procurement Manager',location:{countryCode:'SA',city:'Riyadh'},published:new Date(now.getTime()+60000).toISOString()},
    {state:'published',isInternal:false,shortcode:'../other',title:'Procurement Manager',location:{countryCode:'SA',city:'Riyadh'},published:new Date(now-60000).toISOString()}
  ]}));assert.equal(result.jobs.length,0);
});
if(failures)process.exitCode=1;
else console.log('All feed-boundary regression groups passed.');
