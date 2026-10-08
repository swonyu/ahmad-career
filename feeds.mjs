import './web/core.js';
const {isSaudi,relevance,safeURL,isExpired,dedupe}=globalThis.CareerCore;
export const SOURCES=[
 {name:'Alcon',host:'alcon.wd5.myworkdayjobs.com',tenant:'alcon',board:'careers_alcon'},
 {name:'Johnson & Johnson',host:'jj.wd5.myworkdayjobs.com',tenant:'jj',board:'JJ'},
 {name:'Roche',host:'roche.wd3.myworkdayjobs.com',tenant:'roche',board:'roche-ext'},
 {name:'Novartis',host:'novartis.wd3.myworkdayjobs.com',tenant:'novartis',board:'Novartis_Careers'},
 {name:'GSK',host:'gsk.wd5.myworkdayjobs.com',tenant:'gsk',board:'GSKCareers'},
 {name:'BD',host:'bdx.wd1.myworkdayjobs.com',tenant:'bdx',board:'EXTERNAL_CAREER_SITE_SAUDI_ARABIA'}
];
async function jsonFetch(url,body,fetcher=fetch){const r=await fetcher(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','Accept':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(14000)});if(!r.ok)throw new Error('Employer returned '+r.status);return r.json()}
export async function workdaySource(s,fetcher=fetch){
 const base=`https://${s.host}/wday/cxs/${s.tenant}/${s.board}`;
 const d=await jsonFetch(base+'/jobs',{appliedFacets:s.tenant==='novartis'?{locationCountry:['50423b5190ad49bb89e94cd58dfaad69']}:{},limit:20,offset:0,searchText:s.tenant==='novartis'?'':'Saudi'},fetcher);
 if(!Array.isArray(d.jobPostings))throw Error('Unexpected employer response');
 const rows=d.jobPostings.filter(j=>relevance(j.title)>0&&isSaudi((j.locationsText||'')+' '+j.externalPath));
 let detailErrors=0;
 const jobs=(await Promise.all(rows.map(async j=>{try{
  if(!/^\/job\/[A-Za-z0-9_/%.,&()\-]+$/.test(j.externalPath))return null;
  const {jobPostingInfo:p}=await jsonFetch(base+j.externalPath,null,fetcher);
  if(!p||p.canApply!==true||p.posted===false||isExpired(p.endDate)||!isSaudi((p.country?.descriptor||'')+' '+p.location)||p.startDate>new Date().toISOString().slice(0,10))return null;
  const url=safeURL(`https://${s.host}/${s.board}${j.externalPath}`);
  return{id:s.tenant+'-'+p.jobReqId,title:p.title,company:s.name,location:p.location,url,posted:p.startDate||'',closes:p.endDate||null,status:'live',salary:null,kind:'live',fit:'Needs review',summary:'New employer listing. Review its requirements and seniority before applying.',relevance:relevance(p.title)};
 }catch{detailErrors++;return null}}))).filter(Boolean);
 return{jobs,source:{name:s.name,ok:true,count:jobs.length,scanned:d.jobPostings.length,total:d.total,limited:d.total>20,detailErrors}};
}
export async function workableSource(fetcher=fetch){
 const base='https://apply.workable.com/api/v3/accounts/qiddiya-investment-company-1/jobs';let rows=[],scanned=0,limited=false;
 const groups=await Promise.all(['healthcare','procurement','performance'].map(async query=>{
  let token,items=[];
  for(let page=0;page<2;page++){
   const data=await jsonFetch(base,{query,location:[],department:[],worktype:[],remote:[],...(token?{token}: {})},fetcher);
   if(!Array.isArray(data.results))throw Error('Unexpected employer response');
   scanned+=data.results.length;items.push(...data.results);token=data.nextPage;if(!token)break;
  }
  if(token)limited=true;return items;
 }));
 rows=groups.flat().filter(j=>j.state==='published'&&!j.isInternal&&j.location?.countryCode==='SA'&&relevance(j.title)>0&&j.published?.slice(0,10)<=new Date().toISOString().slice(0,10));
 const jobs=dedupe(rows.map(j=>({id:'qiddiya-'+j.shortcode,title:j.title,company:'Qiddiya',location:j.location.city+', Saudi Arabia',url:'https://apply.workable.com/qiddiya-investment-company-1/j/'+encodeURIComponent(j.shortcode)+'/',posted:j.published.slice(0,10),closes:null,status:'live',salary:null,kind:'live',fit:'Needs review',summary:'Published on the employer board. Sector and experience requirements need review.',relevance:relevance(j.title)})));
 return{jobs,source:{name:'Qiddiya',ok:true,count:jobs.length,scanned,limited}};
}
export async function getLiveJobs(fetcher=fetch){
 const tasks=[...SOURCES.map(s=>({name:s.name,run:()=>workdaySource(s,fetcher)})),{name:'Qiddiya',run:()=>workableSource(fetcher)}];
 const results=await Promise.all(tasks.map(async s=>{try{return await s.run()}catch(e){return{jobs:[],source:{name:s.name,ok:false,count:0,error:String(e.message||'Unable to reach employer').slice(0,140)}}}}));
 return{checkedAt:new Date().toISOString(),jobs:dedupe(results.flatMap(r=>r.jobs)).sort((a,b)=>b.relevance-a.relevance||String(b.posted).localeCompare(String(a.posted))),sources:results.map(r=>r.source)};
}
