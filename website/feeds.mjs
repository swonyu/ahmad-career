import './web/core.js';
const {isSaudi,relevance,safeJobURL,requirementNotes,employerMode,employmentLabel,isExpired,isFuture,parsedDate,dateSortTime,dedupe}=globalThis.CareerCore;
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
 if(!r.ok){await r.body?.cancel?.().catch(()=>{});throw new Error('Employer returned '+r.status);}
 const limit=8_000_000,declared=r.headers?.get?.('content-length');
 const oversized=()=>Error('Employer response was too large');
 if(declared&&/^\d+$/.test(declared)&&Number(declared)>limit){await r.body?.cancel?.().catch(()=>{});throw oversized();}
 // Bound decoded transport bytes before accumulating or parsing an employer payload.
 if(r.body?.getReader){
  const reader=r.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true}),parts=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw oversized();parts.push(decoder.decode(value,{stream:true}));}parts.push(decoder.decode());return JSON.parse(parts.join(''));}
  catch(error){await reader.cancel().catch(()=>{});throw error}finally{reader.releaseLock();}
 }
 // Compatibility path for injected adapters without a WHATWG response stream.
 const text=await r.text();if(new TextEncoder().encode(text).byteLength>limit)throw oversized();return JSON.parse(text);
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
 if(!Array.isArray(d.jobPostings)||d.total!=null&&(!Number.isInteger(d.total)||d.total<d.jobPostings.length||d.total>0&&!d.jobPostings.length))throw Error('Unexpected employer response');
 const sampled=d.jobPostings.slice(0,20),valid=sampled.filter(j=>j&&typeof j.title==='string'&&j.title.trim()&&detailPath(j.externalPath));
 const rows=valid.filter(j=>relevance(j.title)>0);
 let detailErrors=sampled.length-valid.length,checkedDetails=0;const excludedIds=[];
 const jobs=(await Promise.all(rows.map(async j=>{try{
  if(!detailPath(j.externalPath))throw Error('Invalid employer detail path');
  const {jobPostingInfo:p}=await jsonFetch(base+j.externalPath,null,fetcher);
  if(!validDetail(p))throw Error('Invalid employer detail fields');
  const id=s.tenant+'-'+p.jobReqId;if(id.length>256)throw Error('Invalid employer job identifier');
  checkedDetails++;
  if(p.canApply!==true||p.posted===false||!relevance(p.title)||isExpired(p.endDate)||isFuture(p.startDate)){excludedIds.push(id);return null;}
  const country=p.country?.descriptor?.trim()||'',location=typeof p.location==='string'?p.location:'';
  const mappedText=(mapping,key)=>typeof key==='string'&&Object.hasOwn(mapping,key)?mapping[key]:null;
const saCountry=/^(?:Saudi Arabia|Kingdom of Saudi Arabia|SA|SAU|السعودية|المملكة العربية السعودية)$/i.test(country);
  const locationSegment=decodeURIComponent(j.externalPath.split('/')[2]||'');
  if(country?!saCountry:!isSaudi(location||locationSegment)){excludedIds.push(id);return null;}
  const displayLocation=isSaudi(location)?location:(location||locationSegment||'Saudi Arabia')+', Saudi Arabia';
  const url=safeJobURL(`https://${s.host}/${s.board}${j.externalPath}`);
  if(url==='#')throw Error('Invalid employer application URL');
  return{id,title:p.title,company:s.name,location:displayLocation,url,posted:p.startDate||'',closes:p.endDate||null,status:'live',salary:null,kind:'live',fit:'Needs review',healthcare:false,leadership:/\b(manager|director|head|lead)\b/i.test(p.title),summary:'Software or AI title match. Confirm paid status, degree, professional experience and Riyadh worksite before applying.',relevance:relevance(p.title)};
 }catch{detailErrors++;return null}}))).filter(Boolean);
 return{jobs,source:{name:s.name,ok:checkedDetails>0||rows.length===0&&(valid.length>0||sampled.length===0),count:jobs.length,scanned:Math.min(d.jobPostings.length,20),total:d.total,limited:d.total>20||d.jobPostings.length>20,detailErrors,excludedIds,...(detailErrors?{error:`${detailErrors} listing checks failed; results may be incomplete.`}:{})}};
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

// Public, read-only employer boards. No profile, CV or application data is sent.
export const PUBLIC_SOURCES = [
  {name:'Mozn', type:'workable', board:'mozn-ai'},
  {name:'Lucidya', type:'workable', board:'lucidya'},
  {name:'Foodics', type:'workable', board:'foodics'},
  {name:'Salla', type:'workable', board:'salla'},
  {name:'Lean Technologies', type:'ashby', board:'LeanTech'},
  {name:'Tamara', type:'greenhouse', board:'tamara'},
  {name:'Unifonic', type:'recruitee', board:'unifonic'}
];
const textValue=(v,max=2000)=>typeof v==='string'&&v.trim()&&v.length<=max?v.trim():null;
const mappedText=(mapping,key)=>typeof key==='string'&&Object.hasOwn(mapping,key)?mapping[key]:null;
const saCountry=v=>typeof v==='string'&&/^(Saudi Arabia|Kingdom of Saudi Arabia|SA|SAU|السعودية|المملكة العربية السعودية)$/i.test(v.trim());
function sourceURL(s){
  if(s.type==='recruitee')return 'https://unifonic.recruitee.com/api/offers/';
  if(s.type==='workable')return 'https://apply.workable.com/api/v1/widget/accounts/'+s.board;
  if(s.type==='ashby')return 'https://api.ashbyhq.com/posting-api/job-board/'+s.board;
  return 'https://boards-api.greenhouse.io/v1/boards/'+s.board+'/jobs?content=true';
}
function locationsFor(s,j){
  if(s.type==='recruitee')return j.locations.filter(l=>saCountry(l.country_code != null ? l.country_code : l.country)).map(l=>textValue(l.city)||'Saudi Arabia');
  if(s.type==='workable'){
    const locations=Array.isArray(j.locations)&&j.locations.length?j.locations:[{country:j.country,city:j.city}];
    return locations.filter(l=>l&&l.hidden!==true&&(l.countryCode?saCountry(l.countryCode):saCountry(l.country))).map(l=>textValue(l.city)||'Saudi Arabia');
  }
  if(s.type==='ashby'){
    return [{location:j.location,address:j.address},...(Array.isArray(j.secondaryLocations)?j.secondaryLocations:[])].filter(l=>{
      const country=l?.address?.postalAddress?.addressCountry??l?.address?.addressCountry;
      return country?saCountry(country):typeof l?.location==='string'&&isSaudi(l.location);
    }).map(l=>textValue(l.location)).filter(Boolean);
  }
  const location=textValue(j.location?.name);
  return location&&isSaudi(location)?[location]:[];
}
function parsePublicRow(s,j){
  if(!j||typeof j!=='object'||Array.isArray(j)||!textValue(j.title))throw Error('Malformed listing');
  const id=s.type==='workable'?j.shortcode:s.type==='ashby'?j.id:String(j.id??'');
  const idOK=s.type==='workable'?typeof id==='string'&&/^[A-Za-z0-9]{1,64}$/.test(id):s.type==='ashby'?typeof id==='string'&&/^[a-f0-9-]{36}$/i.test(id):typeof j.id==='number'&&Number.isSafeInteger(j.id)&&j.id>=0;
  if(!idOK)throw Error('Malformed job identifier');
  if(s.type==='ashby'&&typeof j.isListed!=='boolean')throw Error('Missing listing state');
  if(s.type==='workable'){
    if(j.locations!=null&&(!Array.isArray(j.locations)||j.locations.some(l=>!l||typeof l!=='object'||Array.isArray(l)||['country','countryCode','city'].some(k=>l[k]!=null&&typeof l[k]!=='string')||l.hidden!=null&&typeof l.hidden!=='boolean')))throw Error('Malformed locations');
    if(['country','city'].some(k=>j[k]!=null&&typeof j[k]!=='string'))throw Error('Malformed location');
    if(!j.locations?.length&&!textValue(j.country))throw Error('Missing country');
  }
  if(s.type==='ashby'){
    if(typeof j.location!=='string'||j.secondaryLocations!=null&&!Array.isArray(j.secondaryLocations))throw Error('Malformed locations');
    for(const l of [{location:j.location,address:j.address},...(j.secondaryLocations||[])]){
      if(!l||typeof l!=='object'||typeof l.location!=='string'||l.address!=null&&(typeof l.address!=='object'||Array.isArray(l.address))||l.address?.postalAddress!=null&&(typeof l.address.postalAddress!=='object'||Array.isArray(l.address.postalAddress))||l.address?.postalAddress?.addressCountry!=null&&typeof l.address.postalAddress.addressCountry!=='string'||l.address?.addressCountry!=null&&typeof l.address.addressCountry!=='string')throw Error('Malformed locations');
    }
  }
  if(s.type==='recruitee'){
    if(typeof j.status!=='string'||typeof j.slug!=='string'||!(/^[a-z0-9][a-z0-9-]{0,199}$/i.test(j.slug))||!Array.isArray(j.locations)||j.locations.some(l=>!l||typeof l!=='object'||Array.isArray(l)||['country_code','country','city'].some(k=>l[k]!=null&&typeof l[k]!=='string'))||['remote','on_site','hybrid'].some(k=>j[k]!=null&&typeof j[k]!=='boolean'))throw Error('Malformed Recruitee listing');
  }
  if(s.type==='greenhouse'&&typeof j.location?.name!=='string')throw Error('Malformed location');
  const title=j.title.trim(),score=relevance(title),locs=locationsFor(s,j);
  // Only publication dates are labeled Posted. Greenhouse updated_at is not publication.
  const sourceDate=v=>v==null||v===''?'':typeof v==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/.test(v)?v.replace(' ','T').replace(' UTC','Z'):null;
  const posted=s.type==='workable'?(j.published_on??''):s.type==='ashby'?(j.publishedAt??''):s.type==='recruitee'?sourceDate(j.published_at):(j.first_published??'');
  const closes=s.type==='recruitee'?sourceDate(j.close_at):'';
  if(closes!==''&&(typeof closes!=='string'||!parsedDate(closes)))throw Error('Malformed deadline');
  if(posted!==''&&(typeof posted!=='string'||!parsedDate(posted)))throw Error('Malformed publication date');
  if(!score||!locs.length||isFuture(posted)||s.type==='ashby'&&!j.isListed||s.type==='recruitee'&&j.status!=='published'||isExpired(closes))return {_excludedId:`${s.board.toLowerCase()}-${id}`};
  const level=typeof j.experience==='string'?j.experience.trim():'';
  if(/^(director|executive)$/i.test(level))return {_excludedId:`${s.board.toLowerCase()}-${id}`};
  const url=s.type==='workable'?`https://apply.workable.com/${s.board}/j/${id}/`:s.type==='ashby'?j.jobUrl:s.type==='recruitee'?j.careers_url:j.absolute_url;
  if(typeof url!=='string'||safeJobURL(url)==='#')throw Error('Unsafe employer URL');
  const u=new URL(url),expectedHost=s.type==='ashby'?'jobs.ashbyhq.com':s.type==='greenhouse'?'job-boards.eu.greenhouse.io':s.type==='recruitee'?'jobs.unifonic.com':'apply.workable.com',expected=s.type==='ashby'?`/${s.board}/${id}`:s.type==='greenhouse'?`/${s.board}/jobs/${id}`:s.type==='recruitee'?`/o/${j.slug}`:null;
  if(u.hostname!==expectedHost)throw Error('Mismatched employer host');
  if(expected&&u.pathname.replace(/\/$/,'').toLowerCase()!==expected.toLowerCase())throw Error('Mismatched employer URL');
  const early=/junior|entry[ -]level|graduate|intern|trainee|associate|himmah|tamheer|builders[ -]program/i.test(title+' '+level);
  return {id:`${s.board.toLowerCase()}-${id}`,title,company:s.name,location:[...new Set(locs)].map(l=>s.type!=='greenhouse'&&!isSaudi(l)?l+', Saudi Arabia':l).join(' / '),url:safeJobURL(url),posted,closes:closes||null,status:'live',salary:null,kind:'live',fit:'Needs review',healthcare:false,leadership:false,relevance:early?95:score,mode:employerMode(s.type,j),postedKind:['ashby','recruitee'].includes(s.type)?'last-published':'published',experienceLevel:level.slice(0,100),employmentType:employmentLabel(mappedText({FullTime:'Full time',PartTime:'Part time',Intern:'Internship',Contract:'Contract',Temporary:'Temporary'},j.employmentType)||textValue(j.employment_type,100)||mappedText({fulltime_permanent:'Full time (permanent)',fulltime_fixed_term:'Full time (fixed term)',parttime_permanent:'Part time (permanent)',parttime_fixed_term:'Part time (fixed term)',internship:'Internship'},j.employment_type_code)||(s.type==='recruitee'&&textValue(j.employment_type_code,100)?'Employer code: '+j.employment_type_code.slice(0,80):'Not stated')),requirementNotes:requirementNotes(s.type==='ashby'?(j.descriptionPlain||j.descriptionHtml):s.type==='greenhouse'?j.content:s.type==='recruitee'?[j.requirements,j.description].filter(v=>typeof v==='string').join('\n'):''),
    summary:'Currently listed on the employer board. Confirm paid status, degree, professional experience and work location before applying.',
    gaps:[...(level?['Employer-listed experience level: '+level+'. Check the full requirements.']:[]),'Personal projects are not formal employment. Confirm any degree, student-status or minimum professional-experience requirement.','Salary and paid status are not verified. Review the current official job description.']};
}
export function parsePublicBoard(s,data){
  if(s.type==='recruitee'){if(!data||typeof data!=='object'||!Array.isArray(data.offers))throw Error('Unexpected employer response');data={jobs:data.offers};}
  if(!data||typeof data!=='object'||!Array.isArray(data.jobs)||data.jobs.length>5000)throw Error('Unexpected employer response');
  const sampled=data.jobs.slice(0,500),byID=new Map(),excluded=new Set();let failures=0,valid=0;
  for(const row of sampled){try{
    const job=parsePublicRow(s,row);valid++;if(!job)continue;if(job._excludedId){excluded.add(job._excludedId);continue;}
    const prior=byID.get(job.id);
    if(prior){const locations=[...new Set([...prior.location.split(' / '),...job.location.split(' / ')])];prior.location=locations.join(' / ');prior.relevance=Math.max(prior.relevance,job.relevance)}else byID.set(job.id,job);
  }catch{failures++}}
  const jobs=[...byID.values()],limited=data.jobs.length>500;
  return {jobs,source:{name:s.name,ok:valid>0||sampled.length===0,count:jobs.length,scanned:sampled.length,total:data.jobs.length,limited,detailErrors:failures,excludedIds:[...excluded].filter(id=>!byID.has(id)),...(failures?{error:`${failures} malformed listings were skipped; results may be incomplete.`}:{})}};
}
export async function publicBoardSource(s,fetcher=fetch){
  if(!PUBLIC_SOURCES.some(x=>x.name===s.name&&x.type===s.type&&x.board===s.board))throw Error('Unknown employer board');
  return parsePublicBoard(s,await jsonFetch(sourceURL(s),null,fetcher));
}
export async function getLiveJobs(fetcher=fetch){
  const results=await Promise.all(PUBLIC_SOURCES.map(async s=>{try{return await publicBoardSource(s,fetcher)}catch(e){return{jobs:[],source:{name:s.name,ok:false,count:0,scanned:0,error:String(e.message||'Unable to reach employer').slice(0,140)}}}}));
  return {checkedAt:new Date().toISOString(),jobs:dedupe(results.flatMap(r=>r.jobs)).sort((a,b)=>b.relevance-a.relevance||(dateSortTime(b.posted)??-Infinity)-(dateSortTime(a.posted)??-Infinity)),sources:results.map(r=>r.source)};
}
