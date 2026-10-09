(function(root){
  const isSaudi=text=>/saudi|\briyadh\b|\bjeddah\b|\bdammam\b|\bkhobar\b|\bSAU\b|الرياض|جدة|السعودية/i.test(text||'');
  function canonicalMinimumSAR(text){
    if(typeof text!=='string')return null;
    const value=text.trim().replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c<='٩'?0x660:0x6f0))).replace(/٬/g,',').replace(/٫/g,'.');
    if(!value)return '';
    if(!/^(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.[0-9]{1,2})?$/.test(value))return null;
    const amount=Number(value.replace(/,/g,''));
    return Number.isSafeInteger(amount)&&amount<=1000000?String(amount):null;
  }
  function riyadhCity(location){
    // ponytail: location text is a bounded heuristic; use structured worksites when available.
    const cityText=(location||'').replace(/\briyadh\s+(?:region|province)\b|(?:منطقة|إقليم)\s+الرياض/giu,'');
    if(!/(?:^|[^\p{L}])(?:riyadh|الرياض)(?=$|[^\p{L}])/iu.test(cityText))return 'outside';
    const multiple=/\b(?:jeddah|dammam|khobar|dhahran|makkah|mecca|madinah|medina|taif|tabuk|abha|jubail|yanbu|qassim|buraidah|hail|jazan|najran|hofuf|ahsa)\b|جدة|الدمام|الخبر|الظهران|مكة|المدينة|الطائف|تبوك|أبها|الجبيل|ينبع|القصيم|بريدة|حائل|جازان|نجران|الهفوف|الأحساء|[\/;؛]|\b(?:or|and|multiple|locations)\b|(?:^|\s)(?:أو|و)(?:\s|$)|مواقع متعددة|موقعين/iu;
    return multiple.test(location)?'conditional':'confirmed';
  }
  function criteriaFor(job,profile={}){
    const city=profile.preferredCity==='riyadh'?riyadhCity(job.location):'any';
    // Current feeds have no comparable, verified monthly pay evidence.
    const salary=Number(profile.minimumMonthlySAR)>0?'unverified':'inactive';
    return {included:city!=='outside'&&!(salary==='unverified'&&profile.unknownSalary==='hide'),city,salary};
  }
  function relevance(title){
    if(/\bintern(ship)?\b|trainee|graduate|early[ -](?:in[ -])?career|sales|account manager|clinical|chemist|scientist|engineer|financial analyst|QA\/RA/i.test(title||''))return 0;
    if(/supply.?chain|procurement|purchas|tender|logistics|warehouse|demand.?plan|supply.?plan|inventory|supplier/i.test(title||''))return /manager|director|head|lead/i.test(title)?90:65;
    if(/performance|operational excellence|continuous improvement|transformation|operations? manager/i.test(title||''))return 80;
    if(/business[ -]value[ -]partner/i.test(title||''))return 65;
    return 0;
  }
  const safeURL=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')?u.href:'#'}catch{return '#'}};
  const jobHosts=new Set(['apply.workable.com','alcon.wd5.myworkdayjobs.com','jj.wd5.myworkdayjobs.com','roche.wd3.myworkdayjobs.com','novartis.wd3.myworkdayjobs.com','gsk.wd5.myworkdayjobs.com','bdx.wd1.myworkdayjobs.com','www.careers.jnj.com','eenp.fa.em3.oraclecloud.com','efan.fa.em3.oraclecloud.com','careers.al-dawaa.com','sa.linkedin.com','www.linkedin.com']);
  const safeJobURL=value=>{const safe=safeURL(value);if(safe==='#')return '#';const u=new URL(safe);if(u.hostname.endsWith('.oraclecloud.com')&&!/^\/hcmUI\/CandidateExperience\/en\/sites\/CX_1\/job\/\d+\/?$/.test(u.pathname))return '#';if(u.hostname.endsWith('linkedin.com')&&!/^\/jobs\/view\/(?:[a-z0-9-]+-)?\d+\/?$/i.test(u.pathname))return '#';if(u.hostname==='careers.al-dawaa.com'&&!u.pathname.startsWith('/en/saudi-arabia/jobs/'))return '#';return jobHosts.has(u.hostname)&&(u.hostname!=='apply.workable.com'||u.pathname.startsWith('/qiddiya-investment-company-1/j/'))?safe:'#'};
  const saudiDay=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  function parsedDate(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.test(value))return null;
    const day=value.slice(0,10),midnight=Date.parse(day+'T00:00:00Z');
    if(!Number.isFinite(midnight)||new Date(midnight).toISOString().slice(0,10)!==day)return null;
    const time=Date.parse(value.length===10?value+'T00:00:00+03:00':value);
    return Number.isFinite(time)?{day,time,dateOnly:value.length===10}:null;
  }
  const dateSortTime=(value,closing=false)=>{const d=parsedDate(value);return d?d.time+(closing&&d.dateOnly?86400000-1:0):null};
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
  const sourceIncomplete=s=>!s.ok||Boolean(s.error)||Boolean(s.detailErrors)||Boolean(s.queryErrors);
  function normalizeLive(payload){
    if(!payload||typeof payload!=='object'||!parsedDate(payload.checkedAt)||isFuture(payload.checkedAt,new Date(Date.now()+60000))||!Array.isArray(payload.jobs)||payload.jobs.length>1000||!Array.isArray(payload.sources)||payload.sources.length>20)return null;
    if(payload.sources.some(s=>!s||typeof s.name!=='string'||typeof s.ok!=='boolean'||s.excludedIds!=null&&(!Array.isArray(s.excludedIds)||s.excludedIds.length>20||s.excludedIds.some(id=>typeof id!=='string'||!id.trim()||id.length>256))||['count','scanned','detailErrors'].some(k=>s[k]!=null&&(!Number.isInteger(s[k])||s[k]<0))))return null;
    const jobs=payload.jobs.map(normalizeJob).filter(Boolean),rejected=payload.jobs.length-jobs.length;
    if(rejected&&!jobs.length)return null;
    const invalidJobs=Math.max(rejected,Number.isInteger(payload.invalidJobs)&&payload.invalidJobs>=0&&payload.invalidJobs<=1000?payload.invalidJobs:0);
    return{checkedAt:payload.checkedAt,jobs:dedupe(jobs).filter(j=>j.company!=='Qiddiya'&&j.healthcare!==false).map(j=>{const failed=payload.sources.some(s=>s.name===j.company&&sourceIncomplete(s)),prior=parsedDate(j.lastCheckedAt);if(failed&&j.lastCheckedAt!=null&&(!prior||prior.time>parsedDate(payload.checkedAt).time))return null;return {...j,lastCheckedAt:failed&&prior?j.lastCheckedAt:payload.checkedAt}}).filter(Boolean),invalidJobs,sources:payload.sources.map(s=>({...s,error:typeof s.error==='string'?s.error:''}))};
  }
  const factsTime=job=>Math.max(parsedDate(job?.lastCheckedAt)?.time??-Infinity,parsedDate(job?.researchCheckedAt)?.time??-Infinity);
  function mergeJobs(researched,snapshots,live){
    const research=new Map(researched.map(j=>[j.id,j])),jobs=new Map(research);
    for(const current of [...snapshots,...live]){
      const prior=jobs.get(current.id),editorial=research.get(current.id);
      const checked=factsTime(current),priorChecked=factsTime(prior);
      const employer=[prior,current].reduce((latest,j)=>(parsedDate(j?.lastCheckedAt)?.time??-Infinity)>(parsedDate(latest?.lastCheckedAt)?.time??-Infinity)?j:latest,null);
      if(editorial&&(checked??-Infinity)<=(parsedDate(editorial.researchCheckedAt)?.time??-Infinity)){if(employer)jobs.set(current.id,{...prior,lastCheckedAt:employer.lastCheckedAt});continue;}
      const combined=priorChecked!=null&&(checked==null||priorChecked>checked)?{...current,...prior}:{...prior,...current};
      if(employer)combined.lastCheckedAt=employer.lastCheckedAt;
      let evidence=editorial;
      for(const candidate of [prior,current])if(candidate&&(candidate.rank||candidate.kind==='researched'||candidate.kind==='archived')&&(!evidence||(parsedDate(candidate.researchCheckedAt)?.time??-Infinity)>(parsedDate(evidence.researchCheckedAt)?.time??-Infinity)))evidence=candidate;
      if(evidence){for(const k of ['rank','fit','summary','gaps','steps','minYears','healthcare','leadership','subtitle','researchCheckedAt'])if(evidence[k]!=null)combined[k]=evidence[k];combined.kind=editorial?'researched':'archived';if(!editorial)delete combined.rank}
      jobs.set(current.id,combined);
    }
    return [...jobs.values()];
  }
  function validApplicationRecord(value,id,now=new Date()){
    if(!value||typeof value!=='object'||Array.isArray(value)||value.schema!==1||value.jobId!==id||typeof id!=='string'||!id.trim()||id.length>256||['__proto__','constructor','prototype'].includes(id))return false;
    if(Object.keys(value).some(k=>!['schema','jobId','appliedAt','receiptNote','updatedAt'].includes(k)))return false;
    if(typeof value.appliedAt!=='string'||typeof value.receiptNote!=='string'||[...value.receiptNote].length>2000)return false;
    if(value.appliedAt&&(value.appliedAt.length!==10||!parsedDate(value.appliedAt)||isFuture(value.appliedAt,now)))return false;
    const edited=parsedDate(value.updatedAt);
    return Boolean(edited&&!edited.dateOnly&&new Date(edited.time).toISOString()===value.updatedAt);
  }
  function attentionFor(jobs,states={},records={},now=new Date()){
    const tasks=[],today=saudiDay(now),last=new Date(Date.parse(today+'T00:00:00Z')+7*86400000).toISOString().slice(0,10);
    for(const job of dedupe(jobs)){
      const status=states[job.id]??'Not started',record=records[job.id];
      if(['Applied','Interviewing','Offer received'].includes(status)){
        if(!validApplicationRecord(record,job.id,now)||!record.appliedAt)tasks.push({jobId:job.id,kind:'applied-date',order:2});
      }else if(['Not started','Preparing'].includes(status)){
        const closing=parsedDate(job.closes),past=Boolean(closing&&isExpired(job.closes,now));
        const day=closing&&(closing.dateOnly?closing.day:saudiDay(new Date(closing.time)));
        if(closing&&(past||day>=today&&day<=last))tasks.push({jobId:job.id,kind:'deadline',past,order:past?0:1,time:dateSortTime(job.closes,true)});
        if(!past)tasks.push({jobId:job.id,kind:'requirements',order:3});
      }
    }
    return tasks.sort((a,b)=>a.order-b.order||(a.order===1?a.time-b.time:0)||a.jobId.localeCompare(b.jobId));
  }
  root.CareerCore={isSaudi,canonicalMinimumSAR,riyadhCity,criteriaFor,relevance,safeURL,safeJobURL,saudiDay,parsedDate,dateSortTime,isExpired,isFuture,dedupe,normalizeJob,sourceIncomplete,normalizeLive,mergeJobs,validApplicationRecord,attentionFor};
})(globalThis);
