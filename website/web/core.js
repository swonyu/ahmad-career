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
    const t=title||'';
    if(/\b(senior|sr\.?|lead|principal|staff|manager|director|head|chief|vp|vice[ -]president|sales|pre[ -]?sales|clinical)\b/i.test(t))return 0;
    if(/software|developer|python|machine[ -]learning|artificial[ -]intelligence|\bAI\b|full[ -]?stack|front[ -]?end|back[ -]?end|\bios\b|\bswift(?:ui)?\b|\bandroid\b|\bmobile[ -](engineer|developer)\b|automation|devops|site[ -]reliability|cloud[ -](platform|native|engineer)|database[ -]administrator|techops|data[ -](analyst|engineer|scientist)|builders[ -]program.*data|quality[ -]assurance|\bQA\b|مطور|برمجيات|ذكاء اصطناعي|محلل بيانات/i.test(t))return /junior|entry[ -]level|graduate|intern|trainee|associate|himmah|tamheer|builders[ -]program/i.test(t)?95:80;
    return 0;
  }
  function plainEmployerText(value){
    if(typeof value!=='string'||value.length>120000)return '';
    const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
    const decoded=value.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi,(_,v)=>{if(v[0]!=='#')return entities[v.toLowerCase()]||' ';const n=v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):Number(v.slice(1));return Number.isInteger(n)&&n>=32&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):' '});
    return decoded.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<\/?(?:p|li|div|br|h[1-6]|ul|ol)[^>]*>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/[\t \r]+/g,' ').replace(/\n\s*/g,'\n').trim();
  }
  function requirementNotes(value){
    const text=plainEmployerText(value);if(!text)return [];
    const relevant=/bachelor|master.?s|degree|\bph\.?d\b|university|student|graduat|\d+\+?\s*(?:-\s*\d+\s*)?years?|\bpaid\b|unpaid|work authori[sz]ation|saudi nationals?|citizenship|\b(?:tamheer|eligible|eligibility|GPA)\b|تخرج|بكالوريوس|سنوات|طالب|تمهير/i;
    const lines=[...new Set(text.split(/\n+|(?<=[.!?])\s+/).map(x=>x.trim()).filter(x=>x.length>12&&!(/\bpaid\s+(?:leave|holidays?|time off|vacation)\b/i.test(x)&&!/(?:degree|experience|internship|salary)/i.test(x))&&!(/\b(?:we serve|our company|founded in|we have served)\b/i.test(x)&&!/\b(?:required|minimum|must|candidate|you have)\b/i.test(x))))];
    const primary=lines.filter(x=>relevant.test(x)).slice(0,4),technology=lines.filter(x=>!primary.includes(x)&&skillPatterns.some(([,pattern])=>pattern.test(x))).slice(0,2);
    return [...primary,...technology].map(x=>x.length>260?x.slice(0,257)+'…':x);
  }
  function employerMode(type,row){
    if(type==='recruitee'){const modes=[['on_site','On-site'],['hybrid','Hybrid'],['remote','Remote']].filter(([key])=>row[key]===true).map(([,label])=>label);return modes.length?modes.join(' / '):'Not stated';}
    if(type==='ashby'){const modes={Remote:'Remote',Hybrid:'Hybrid',OnSite:'On-site'};return (typeof row.workplaceType==='string'&&Object.hasOwn(modes,row.workplaceType)?modes[row.workplaceType]:null)||(row.isRemote===true?'Remote or hybrid':'Not stated');}
    return row.telecommuting===true?'Remote arrangement: confirm details':'Not stated';
  }
  function employmentLabel(value){const labels={fulltime:'Full time',parttime:'Part time',internship:'Internship',contract:'Contract',temporary:'Temporary'};const key=typeof value==='string'?value.toLowerCase().replace(/[\s_-]/g,''):'';return Object.hasOwn(labels,key)?labels[key]:value;}
  const publicationLabel=j=>j.postedKind==='last-published'?'Last published':'Published';
  function ageInSaudiDays(value,now=new Date()){
    const parsed=parsedDate(value);if(!parsed)return null;
    const day=parsed.dateOnly?parsed.day:saudiDay(new Date(parsed.time));
    return Math.floor((Date.parse(saudiDay(now)+'T00:00:00Z')-Date.parse(day+'T00:00:00Z'))/86400000);
  }
  function discoveryMatches(job,options={},now=new Date()){
    if(options.company&&job.company!==options.company)return false;
    if(options.days){const age=ageInSaudiDays(job.posted,now);if(age===null||age<0||age>=options.days)return false;}
    if(options.employmentType&&job.employmentType!==options.employmentType)return false;
    return true;
  }
  function applicationWarnings(job,jobs,states={},recordIDs=[]){
    const tracked=j=>states[j.id]&&states[j.id]!=='Not started'||recordIDs.includes(j.id);
    const messages=[];
    if(tracked(job))messages.push(states[job.id]==='Submission uncertain'?'Submission is uncertain. Check the employer account or receipt before trying again.':'This role already has a local application record. Review it before applying again.');
    const others=dedupe(jobs).filter(j=>j.id!==job.id&&j.company.toLowerCase()===job.company.toLowerCase()&&tracked(j));
    if(others.length)messages.push('You are tracking '+others.length+' other role'+(others.length===1?'':'s')+' at '+job.company+'. Check any company or program application rules. Different roles are not automatically duplicates.');
    return messages;
  }
  const safeURL=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')?u.href:'#'}catch{return '#'}};
  const jobHosts=new Set(['apply.workable.com','alcon.wd5.myworkdayjobs.com','jj.wd5.myworkdayjobs.com','roche.wd3.myworkdayjobs.com','novartis.wd3.myworkdayjobs.com','gsk.wd5.myworkdayjobs.com','bdx.wd1.myworkdayjobs.com','www.careers.jnj.com','eenp.fa.em3.oraclecloud.com','efan.fa.em3.oraclecloud.com','careers.al-dawaa.com','sa.linkedin.com','www.linkedin.com','jobs.ashbyhq.com','job-boards.eu.greenhouse.io','jobs.unifonic.com','jobs.smartrecruiters.com']);
  const safeJobURL=value=>{
    const safe=safeURL(value);if(safe==='#')return '#';const u=new URL(safe);
    if(!jobHosts.has(u.hostname))return '#';
    if(u.hostname==='apply.workable.com'&&!/^\/(qiddiya-investment-company-1|mozn-ai|lucidya|foodics|salla)\/j\/[A-Za-z0-9]{1,64}(?:\/apply)?\/?$/.test(u.pathname))return '#';
    if(u.hostname==='jobs.ashbyhq.com'&&!/^\/LeanTech\/[a-f0-9-]{36}(?:\/application)?\/?$/i.test(u.pathname))return '#';
    if(u.hostname==='jobs.smartrecruiters.com'&&(!/^\/(Devoteam|DeliveryHero)\/\d{1,20}-[a-z0-9-]{1,240}\/?$/.test(u.pathname)||safe.includes('?')||safe.includes('#')))return '#';
    if(u.hostname==='jobs.unifonic.com'&&!/^\/o\/[a-z0-9][a-z0-9-]{0,199}\/?$/i.test(u.pathname))return '#';
    if(u.hostname==='job-boards.eu.greenhouse.io'&&!/^\/tamara\/jobs\/\d{1,20}\/?$/.test(u.pathname))return '#';
    if(u.hostname.endsWith('.oraclecloud.com')&&!/^\/hcmUI\/CandidateExperience\/en\/sites\/CX_1\/job\/\d+\/?$/.test(u.pathname))return '#';
    if(u.hostname.endsWith('linkedin.com')&&!/^\/jobs\/view\/(?:[a-z0-9-]+-)?\d+\/?$/i.test(u.pathname))return '#';
    if(u.hostname==='careers.al-dawaa.com'&&!u.pathname.startsWith('/en/saudi-arabia/jobs/'))return '#';
    return safe;
  };
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
    if(j.requirementNotes!=null&&(!Array.isArray(j.requirementNotes)||j.requirementNotes.length>6||j.requirementNotes.some(x=>typeof x!=='string'||x.length>300)))return null;
    for(const k of ['experienceLevel','employmentType'])if(j[k]!=null&&(typeof j[k]!=='string'||j[k].length>100))return null;
    if(j.postedKind!=null&&!['published','last-published'].includes(j.postedKind))return null;
    const job={...j,url:safeJobURL(j.url),posted:j.posted||'',fit:typeof j.fit==='string'?j.fit:'Needs review',summary:typeof j.summary==='string'?j.summary:'Review the employer requirements.'};
    for(const key of ['applyUrl','sourceUrl'])if(job[key]&&safeJobURL(job[key])==='#')delete job[key];
    if(job.rank!=null&&(!Number.isInteger(job.rank)||job.rank<1))delete job.rank;
    return job;
  }
  const sourceIncomplete=s=>!s.ok||s.limited===true||Boolean(s.error)||Boolean(s.detailErrors)||Boolean(s.queryErrors);
  function normalizeLive(payload){
    if(!payload||typeof payload!=='object'||!parsedDate(payload.checkedAt)||isFuture(payload.checkedAt,new Date(Date.now()+60000))||!Array.isArray(payload.jobs)||payload.jobs.length>1000||!Array.isArray(payload.sources)||payload.sources.length>20)return null;
    if(payload.sources.some(s=>!s||typeof s.name!=='string'||typeof s.ok!=='boolean'||s.limited!=null&&typeof s.limited!=='boolean'||s.excludedIds!=null&&(!Array.isArray(s.excludedIds)||s.excludedIds.length>500||s.excludedIds.some(id=>typeof id!=='string'||!id.trim()||id.length>256))||['count','scanned','detailErrors'].some(k=>s[k]!=null&&(!Number.isInteger(s[k])||s[k]<0))))return null;
    const jobs=payload.jobs.map(normalizeJob).filter(Boolean),rejected=payload.jobs.length-jobs.length;
    if(rejected&&!jobs.length)return null;
    const invalidJobs=Math.max(rejected,Number.isInteger(payload.invalidJobs)&&payload.invalidJobs>=0&&payload.invalidJobs<=1000?payload.invalidJobs:0);
    const normalized={checkedAt:payload.checkedAt,jobs:dedupe(jobs).filter(j=>j.company!=='Qiddiya'&&relevance(j.title)>0).map(j=>{const failed=payload.sources.some(s=>s.name===j.company&&sourceIncomplete(s)),prior=parsedDate(j.lastCheckedAt);if(failed&&j.lastCheckedAt!=null&&(!prior||prior.time>parsedDate(payload.checkedAt).time))return null;return {...j,lastCheckedAt:failed&&prior?j.lastCheckedAt:payload.checkedAt}}).filter(Boolean),invalidJobs,sources:payload.sources.map(s=>({...s,error:typeof s.error==='string'?s.error:''}))};
    const comparison=normalizeSearchComparison(payload.searchComparison,normalized);
    if(comparison)normalized.searchComparison=comparison;
    return normalized;
  }
  function normalizeSearchComparison(value,snapshot){
    if(!value||typeof value!=='object'||Array.isArray(value)||value.schema!==1)return null;
    const checked=parsedDate(value.checkedAt),previous=parsedDate(value.previousCheckedAt);
    if(!checked||checked.time!==parsedDate(snapshot.checkedAt)?.time||value.previousCheckedAt!==null&&(!previous||previous.time>=checked.time))return null;
    const ids=value.addedIds,current=new Set(snapshot.jobs.map(j=>j.id));
    if(!Array.isArray(ids)||ids.length>1000||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id.trim()||id.length>256||!current.has(id))||value.previousCheckedAt===null&&ids.length)return null;
    return {schema:1,previousCheckedAt:value.previousCheckedAt,checkedAt:value.checkedAt,addedIds:[...ids]};
  }
  function compareSearches(previous,current){
    const ids=new Set((previous?.jobs||[]).map(j=>j.id));
    return {schema:1,previousCheckedAt:previous?.checkedAt??null,checkedAt:current.checkedAt,addedIds:previous?current.jobs.filter(j=>!ids.has(j.id)).map(j=>j.id):[]};
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
  function validNextAction(value,id){
    if(!value||typeof value!=='object'||Array.isArray(value)||value.schema!==1||value.jobId!==id||typeof id!=='string'||!id.trim()||id.length>256||['__proto__','constructor','prototype'].includes(id))return false;
    if(Object.keys(value).some(k=>!['schema','jobId','dueOn','actionNote','completed','updatedAt'].includes(k)))return false;
    if(typeof value.dueOn!=='string'||typeof value.actionNote!=='string'||typeof value.completed!=='boolean'||[...value.actionNote].length>500||/[\uD800-\uDFFF]/u.test(value.actionNote))return false;
    if(value.dueOn&&(value.dueOn.length!==10||!parsedDate(value.dueOn)))return false;
    if(!value.actionNote.trim()&&(value.dueOn||value.completed))return false;
    const edited=parsedDate(value.updatedAt);
    return Boolean(edited&&!edited.dateOnly&&new Date(edited.time).toISOString()===value.updatedAt);
  }
  function nextActionBucket(value,now=new Date()){
    if(value.completed)return 'completed';
    if(!value.dueOn)return 'undated';
    const days=(Date.parse(value.dueOn+'T00:00:00Z')-Date.parse(saudiDay(now)+'T00:00:00Z'))/86400000;
    return days<0?'overdue':days===0?'today':days<=7?'next7days':'upcoming';
  }
  function attentionFor(jobs,states={},records={},now=new Date()){
    const tasks=[],today=saudiDay(now),last=new Date(Date.parse(today+'T00:00:00Z')+7*86400000).toISOString().slice(0,10);
    for(const job of dedupe(jobs)){
      const status=states[job.id]??'Not started',record=records[job.id];
      if(status==='Submission uncertain'){tasks.push({jobId:job.id,kind:'confirm-submission',order:0});}
      else if(['Applied','Interviewing','Offer received'].includes(status)){
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
  // Review aids use bounded available text, never eligibility inference or a match percentage.
  const roleFocuses=[['software','Software & web'],['data-ai','Data & AI'],['platform','Cloud & platform'],['mobile','Mobile'],['quality','Quality & testing']];
  const boundedPattern=body=>new RegExp('(?<![\\p{L}\\p{N}_])(?:'+body+')(?![\\p{L}\\p{N}_])','iu');
  const rolePatterns=[
    ['software',boundedPattern('software|developers?|front[ -]?end|back[ -]?end|full[ -]?stack|web|مطور|برمجيات')],
    ['data-ai',boundedPattern('AI|machine[ -]learning|artificial[ -]intelligence|data|analytics|NLP|ذكاء اصطناعي|بيانات')],
    ['platform',boundedPattern('cloud|devops|site[ -]reliability|techops|databases?')],
    ['mobile',boundedPattern('ios|swift(?:ui)?|android|mobile')],
    ['quality',boundedPattern('QA|quality[ -]assurance|test[ -]automation')]
  ];
  const skillPatterns=[['Python','python'],['JavaScript','javascript'],['TypeScript','typescript'],['Swift','swift(?:ui)?'],['SQL','sql'],['React','react(?:\\.js|js)?'],['Node.js','node(?:\\.js|js)'],['Docker','docker'],['Kubernetes','kubernetes|k8s'],['AWS','aws|amazon web services'],['Azure','azure'],['Git','git'],['Machine learning','machine[ -]learning|ML']].map(([label,body])=>[label,boundedPattern(body)]);
  const reviewPatterns=[['degree','Education wording','degree|bachelor|master.?s|ph\\.?d|بكالوريوس'],['student','Student / graduation wording','students?|university|graduat[\\p{L}]*|enroll[\\p{L}]*|تخرج|طالب'],['program','Program eligibility wording','tamheer|eligible|eligibility|GPA|تمهير'],['experience','Experience wording','experience|years?|سنوات'],['authorization','Work authorization / nationality wording','work authori[sz]ation|visa|citizen(?:ship|s)?|nationality|nationals?'],['unpaid','Unpaid wording','unpaid']].map(([id,label,body])=>[id,label,boundedPattern(body)]);
  function boundedReviewText(value,max=2000){return typeof value==='string'&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|<\/?[A-Za-z][^>]*>/iu.test(value)?value:'';}
  function roleReview(job={},profile={}){
    const title=boundedReviewText(job?.title),notes=Array.isArray(job?.requirementNotes)?job.requirementNotes.slice(0,6).map(x=>boundedReviewText(x,300)).filter(x=>x.trim()):[];
    const available=[title,...notes].join('\n'),skills=skillPatterns.filter(([,pattern])=>pattern.test(available)).map(([label])=>label),profileText=boundedReviewText(profile?.skills,3000);
    const own=new Set(skillPatterns.filter(([,pattern])=>pattern.test(profileText)).map(([label])=>label));
    return {categories:rolePatterns.filter(([,pattern])=>pattern.test(title)).map(([id])=>id),skills,overlap:skills.filter(label=>own.has(label)),topics:reviewPatterns.map(([id,label,pattern])=>({id,label,excerpts:notes.filter(note=>pattern.test(note))})).filter(topic=>topic.excerpts.length),hasExcerpts:notes.length>0};
  }
  function searchableText(job={}){return [job.title,job.company,job.location,job.summary,job.mode,job.employmentType,job.experienceLevel,...(Array.isArray(job.requirementNotes)?job.requirementNotes:[]),...(Array.isArray(job.gaps)?job.gaps:[])].filter(x=>typeof x==='string').map(x=>x.slice(0,4000)).join(' ').toLowerCase();}
  root.CareerCore={roleFocuses,roleReview,searchableText,employmentLabel,plainEmployerText,requirementNotes,employerMode,publicationLabel,ageInSaudiDays,discoveryMatches,applicationWarnings,isSaudi,canonicalMinimumSAR,riyadhCity,criteriaFor,relevance,safeURL,safeJobURL,saudiDay,parsedDate,dateSortTime,isExpired,isFuture,dedupe,normalizeJob,sourceIncomplete,normalizeLive,normalizeSearchComparison,compareSearches,mergeJobs,validApplicationRecord,validNextAction,nextActionBucket,attentionFor};
})(globalThis);
