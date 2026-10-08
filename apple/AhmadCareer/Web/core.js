(function(root){
  const isSaudi=text=>/saudi|\briyadh\b|\bjeddah\b|\bdammam\b|\bkhobar\b|\bSAU\b|الرياض|جدة|السعودية/i.test(text||'');
  function relevance(title){
    if(/\bintern(ship)?\b|trainee|graduate|early[ -](?:in[ -])?career|sales|account manager|clinical|chemist|scientist|engineer|financial analyst|regulatory|QA\/RA/i.test(title||''))return 0;
    if(/supply.?chain|procurement|purchas|tender|logistics|warehouse|demand.?plan|supply.?plan|inventory|supplier/i.test(title||''))return /manager|director|head|lead/i.test(title)?90:65;
    if(/performance|operational excellence|continuous improvement|transformation|operations manager/i.test(title||''))return 80;
    if(/business[ -]value[ -]partner/i.test(title||''))return 65;
    return 0;
  }
  const safeURL=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')?u.href:'#'}catch{return '#'}};
  const jobHosts=new Set(['apply.workable.com','alcon.wd5.myworkdayjobs.com','jj.wd5.myworkdayjobs.com','roche.wd3.myworkdayjobs.com','novartis.wd3.myworkdayjobs.com','gsk.wd5.myworkdayjobs.com','bdx.wd1.myworkdayjobs.com','www.careers.jnj.com']);
  const safeJobURL=value=>{const safe=safeURL(value);if(safe==='#')return '#';const u=new URL(safe);return jobHosts.has(u.hostname)&&(u.hostname!=='apply.workable.com'||u.pathname.startsWith('/qiddiya-investment-company-1/j/'))?safe:'#'};
  const saudiDay=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  function parsedDate(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value))return null;
    const day=value.slice(0,10),midnight=Date.parse(day+'T00:00:00Z');
    if(!Number.isFinite(midnight)||new Date(midnight).toISOString().slice(0,10)!==day)return null;
    const time=Date.parse(value.length===10?value+'T00:00:00Z':value);
    return Number.isFinite(time)?{day,time,dateOnly:value.length===10}:null;
  }
  const isExpired=(value,now=new Date())=>{if(value==null||value==='')return false;const d=parsedDate(value);return !d||(d.dateOnly?d.day<saudiDay(now):d.time<now.getTime())};
  const isFuture=(value,now=new Date())=>{if(value==null||value==='')return false;const d=parsedDate(value);return !d||(d.dateOnly?d.day>saudiDay(now):d.time>now.getTime())};
  const dedupe=rows=>[...new Map(rows.map(j=>[j.id,j])).values()];
  function normalizeJob(j){
    if(!j||typeof j!=='object'||Array.isArray(j)||!['id','title','company','location','url'].every(k=>typeof j[k]==='string'&&j[k].trim()&&j[k].length<=2000)||j.id.length>256||['__proto__','constructor','prototype'].includes(j.id)||safeJobURL(j.url)==='#'||!isSaudi(j.location))return null;
    if(j.closes!=null&&j.closes!==''&&!parsedDate(j.closes)||j.posted!=null&&j.posted!==''&&!parsedDate(j.posted))return null;
    if(j.gaps!=null&&(!Array.isArray(j.gaps)||j.gaps.some(x=>typeof x!=='string'))||j.steps!=null&&(!Array.isArray(j.steps)||j.steps.some(x=>!Array.isArray(x)||x.length<2||x.some(s=>typeof s!=='string'))))return null;
    const job={...j,url:safeJobURL(j.url),posted:j.posted||'',fit:typeof j.fit==='string'?j.fit:'Needs review',summary:typeof j.summary==='string'?j.summary:'Review the employer requirements.'};
    for(const key of ['applyUrl','sourceUrl'])if(job[key]&&safeJobURL(job[key])==='#')delete job[key];
    if(job.rank!=null&&(!Number.isInteger(job.rank)||job.rank<1))delete job.rank;
    return job;
  }
  function normalizeLive(payload){
    if(!payload||typeof payload!=='object'||!parsedDate(payload.checkedAt)||isFuture(payload.checkedAt,new Date(Date.now()+60000))||!Array.isArray(payload.jobs)||payload.jobs.length>1000||!Array.isArray(payload.sources)||payload.sources.length>20)return null;
    if(payload.sources.some(s=>!s||typeof s.name!=='string'||typeof s.ok!=='boolean'||['count','scanned','detailErrors'].some(k=>s[k]!=null&&(!Number.isInteger(s[k])||s[k]<0))))return null;
    const jobs=payload.jobs.map(normalizeJob).filter(Boolean),invalidJobs=payload.jobs.length-jobs.length;
    if(invalidJobs&&!jobs.length)return null;
    return{checkedAt:payload.checkedAt,jobs:dedupe(jobs),invalidJobs,sources:payload.sources.map(s=>({...s,error:typeof s.error==='string'?s.error:''}))};
  }
  function mergeJobs(researched,snapshots,live){
    const research=new Map(researched.map(j=>[j.id,j])),jobs=new Map(research);
    for(const current of [...snapshots,...live]){const prior=jobs.get(current.id),editorial=research.get(current.id);if(editorial&&!current.lastCheckedAt&&snapshots.includes(current))continue;const combined={...prior,...current};if(editorial){for(const k of ['rank','fit','summary','gaps','steps','minYears','healthcare','leadership','subtitle'])if(editorial[k]!=null)combined[k]=editorial[k];combined.kind='researched'}jobs.set(current.id,combined)}
    return [...jobs.values()];
  }
  root.CareerCore={isSaudi,relevance,safeURL,safeJobURL,saudiDay,parsedDate,isExpired,isFuture,dedupe,normalizeJob,normalizeLive,mergeJobs};
})(globalThis);
