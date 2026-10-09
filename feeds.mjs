import './web/core.js';
const {isSaudi,relevance,safeJobURL,isExpired,isFuture,parsedDate,dedupe}=globalThis.CareerCore;
export const SOURCES=[
 {name:'Alcon',host:'alcon.wd5.myworkdayjobs.com',tenant:'alcon',board:'careers_alcon'},
 {name:'Johnson & Johnson',host:'jj.wd5.myworkdayjobs.com',tenant:'jj',board:'JJ'},
 {name:'Roche',host:'roche.wd3.myworkdayjobs.com',tenant:'roche',board:'roche-ext'},
 {name:'Novartis',host:'novartis.wd3.myworkdayjobs.com',tenant:'novartis',board:'Novartis_Careers'},
 {name:'GSK',host:'gsk.wd5.myworkdayjobs.com',tenant:'gsk',board:'GSKCareers'},
 {name:'BD',host:'bdx.wd1.myworkdayjobs.com',tenant:'bdx',board:'EXTERNAL_CAREER_SITE_SAUDI_ARABIA'}
];
async function jsonFetch(url,body,fetcher=fetch){
 const r=await fetcher(url,{method:body?'POST':'GET',redirect:'manual',headers:{'Content-Type':'application/json','Accept':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(14000)});
 if(!r.ok)throw new Error('Employer returned '+r.status);
 const text=await r.text();if(text.length>8000000)throw Error('Employer response was too large');return JSON.parse(text);
}
function detailPath(path){
 if(typeof path!=='string'||!path.startsWith('/job/'))return false;
 try{const decoded=decodeURIComponent(path);return !/[?#\\%\x00-\x1f]/.test(decoded)&&!decoded.split('/').some(s=>s==='.'||s==='..')}catch{return false}
}
function validDetail(p){
 if(!p||typeof p.title!=='string'||!p.title.trim()||typeof p.jobReqId!=='string'||!p.jobReqId.trim()||typeof p.canApply!=='boolean')return false;
 if(p.posted!=null&&typeof p.posted!=='boolean'||p.location!=null&&typeof p.location!=='string')return false;
 if(p.country!=null&&(typeof p.country!=='object'||Array.isArray(p.country)||p.country.descriptor!=null&&typeof p.country.descriptor!=='string'))return false;
 return [p.startDate,p.endDate].every(value=>value==null||value===''||typeof value==='string'&&parsedDate(value));
}
export async function workdaySource(s,fetcher=fetch){
 const base=`https://${s.host}/wday/cxs/${s.tenant}/${s.board}`;
 const d=await jsonFetch(base+'/jobs',{appliedFacets:s.tenant==='novartis'?{locationCountry:['50423b5190ad49bb89e94cd58dfaad69']}:{},limit:20,offset:0,searchText:s.tenant==='novartis'?'':'Saudi'},fetcher);
 if(!Array.isArray(d.jobPostings)||d.total!=null&&(!Number.isInteger(d.total)||d.total<0))throw Error('Unexpected employer response');
 const sampled=d.jobPostings.slice(0,20),valid=sampled.filter(j=>j&&typeof j.title==='string'&&j.title.trim()&&detailPath(j.externalPath));
 const rows=valid.filter(j=>relevance(j.title)>0);
 let detailErrors=sampled.length-valid.length,checkedDetails=0;
 const jobs=(await Promise.all(rows.map(async j=>{try{
  if(!detailPath(j.externalPath))throw Error('Invalid employer detail path');
  const {jobPostingInfo:p}=await jsonFetch(base+j.externalPath,null,fetcher);
  if(!validDetail(p))throw Error('Invalid employer detail fields');
  checkedDetails++;
  if(p.canApply!==true||p.posted===false||!relevance(p.title)||isExpired(p.endDate)||isFuture(p.startDate))return null;
  const country=p.country?.descriptor?.trim()||'',location=typeof p.location==='string'?p.location:'';
  const saCountry=/^(?:Saudi Arabia|Kingdom of Saudi Arabia|SA|SAU|السعودية|المملكة العربية السعودية)$/i.test(country);
  const locationSegment=decodeURIComponent(j.externalPath.split('/')[2]||'');
  if(country?!saCountry:!isSaudi(location||locationSegment))return null;
  const displayLocation=isSaudi(location)?location:(location||locationSegment||'Saudi Arabia')+', Saudi Arabia';
  const url=safeJobURL(`https://${s.host}/${s.board}${j.externalPath}`);
  if(url==='#')throw Error('Invalid employer application URL');
  return{id:s.tenant+'-'+p.jobReqId,title:p.title,company:s.name,location:displayLocation,url,posted:p.startDate||'',closes:p.endDate||null,status:'live',salary:null,kind:'live',fit:'Needs review',healthcare:true,leadership:/\b(manager|director|head|lead)\b/i.test(p.title),summary:'New employer listing. Review its requirements and seniority before applying.',relevance:relevance(p.title)};
 }catch{detailErrors++;return null}}))).filter(Boolean);
 return{jobs,source:{name:s.name,ok:checkedDetails>0||rows.length===0&&(valid.length>0||sampled.length===0),count:jobs.length,scanned:Math.min(d.jobPostings.length,20),total:d.total,limited:d.total>20||d.jobPostings.length>20,detailErrors,...(detailErrors?{error:`${detailErrors} listing checks failed; results may be incomplete.`}:{})}};
}
export async function workableSource(fetcher=fetch){
 const base='https://apply.workable.com/api/v3/accounts/qiddiya-investment-company-1/jobs';let scanned=0,limited=false,failures=0,successfulQueries=0;
 const groups=await Promise.all(['healthcare','procurement','performance'].map(async query=>{
  let token,items=[],recovered=false;
  try{for(let page=0;page<2;page++){
   const data=await jsonFetch(base,{query,location:[],department:[],worktype:[],remote:[],...(token?{token}:{})},fetcher);
   if(!Array.isArray(data.results))throw Error('Unexpected employer response');
   recovered=true;scanned+=data.results.length;items.push(...data.results);token=typeof data.nextPage==='string'?data.nextPage:null;if(!token)break;
  }}catch{failures++}
  if(recovered)successfulQueries++;if(token)limited=true;return items;
 }));
 const rows=groups.flat().filter(j=>j&&j.state==='published'&&j.isInternal===false&&j.location?.countryCode==='SA'&&typeof j.shortcode==='string'&&/^[A-Za-z0-9]+$/.test(j.shortcode)&&typeof j.title==='string'&&relevance(j.title)>0&&parsedDate(j.published)&&!isFuture(j.published));
 const jobs=dedupe(rows.map(j=>({id:'qiddiya-'+j.shortcode,title:j.title,company:'Qiddiya',location:(j.location.city||'Qiddiya')+', Saudi Arabia',url:'https://apply.workable.com/qiddiya-investment-company-1/j/'+j.shortcode+'/',posted:j.published,closes:null,status:'live',salary:null,kind:'live',fit:'Needs review',healthcare:/healthcare|medical/i.test(j.title),leadership:/\b(manager|director|head|lead)\b/i.test(j.title),summary:'Published on the employer board. Sector and experience requirements need review.',relevance:relevance(j.title)})));
 return{jobs,source:{name:'Qiddiya',ok:successfulQueries>0,count:jobs.length,scanned,limited,queryErrors:failures,...(failures?{error:`${failures} searches failed; results may be incomplete.`}:{})}};
}
export async function getLiveJobs(fetcher=fetch){
 const tasks=[...SOURCES.map(s=>({name:s.name,run:()=>workdaySource(s,fetcher)}))];
 const results=await Promise.all(tasks.map(async s=>{try{return await s.run()}catch(e){return{jobs:[],source:{name:s.name,ok:false,count:0,error:String(e.message||'Unable to reach employer').slice(0,140)}}}}));
 return{checkedAt:new Date().toISOString(),jobs:dedupe(results.flatMap(r=>r.jobs)).sort((a,b)=>b.relevance-a.relevance||String(b.posted).localeCompare(String(a.posted))),sources:results.map(r=>r.source)};
}
