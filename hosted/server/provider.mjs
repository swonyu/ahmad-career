import {retryAfterDelay} from './retry-after.mjs';
import {fail,object,text,publicURL,canonical,sha256,applicantName} from './validation.mjs';
const supported = new Set(['name','email','resume','phone','urls','comments','consentStore','consentMarketing']);
function postingText(value) {
  // Unicode mode preserves valid pairs while detecting unpaired surrogate code units.
  if (/[\uD800-\uDFFF]/u.test(value)) fail('posting_unavailable','The employer posting returned an unreadable response.',503);
  // Keep valid surrogate pairs intact at the existing UTF-16 length boundary.
  return value.slice(0,500).replace(/[\uD800-\uDBFF]$/, '');
}

export function loadConfiguration(env) {
  if (!env.CAREER_CONNECTORS_JSON) return {version:1,connectors:[]};
  if (env.CAREER_CONNECTORS_JSON.length > 1024*1024) fail('invalid_configuration','Connector configuration exceeds the supported size.',503);
  let config; try { config=JSON.parse(env.CAREER_CONNECTORS_JSON); } catch { fail('invalid_configuration','Connector configuration is unavailable.',503); }
  object(config,['version','connectors'],'Connector configuration');
  if(config.version!==1 || !Array.isArray(config.connectors) || config.connectors.length>50) fail('invalid_configuration','The application connector configuration version or entries are invalid.',500);
  const seen=new Set();
  for(const c of config.connectors) {
    object(c,['provider','region','site','apiKeyEnv','postings'],'Connector');
    if(c.provider!=='lever'||!['global','eu'].includes(c.region)||typeof c.site!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(c.site)||typeof c.apiKeyEnv!=='string'||!/^CAREER_[A-Z0-9_]{1,100}$/.test(c.apiKeyEnv)) fail('invalid_configuration','A connector identity or secret reference is invalid.',500);
    const key=`${c.region}:${c.site.toLowerCase()}`;if(seen.has(key))fail('invalid_configuration','A connector is configured more than once.',500);seen.add(key);
    if(!c.postings||typeof c.postings!=='object'||Array.isArray(c.postings)||Object.keys(c.postings).length>1000) fail('invalid_configuration','Reviewed postings must be a bounded object.',500);
    for(const [id,r] of Object.entries(c.postings)) {
      if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) fail('invalid_configuration','A reviewed posting identifier is invalid.',500);
      object(r,['revision','reviewedAt','expiresAt','hasCustomQuestions','requiredFields','privacyPolicyUrl'],'Posting requirements');
      text(r.revision,'Requirements revision',150,false);
      if(!Number.isFinite(Date.parse(r.reviewedAt))||!Number.isFinite(Date.parse(r.expiresAt))||Date.parse(r.expiresAt)<=Date.parse(r.reviewedAt)||Date.parse(r.expiresAt)-Date.parse(r.reviewedAt)>7*86400000||typeof r.hasCustomQuestions!=='boolean'||!Array.isArray(r.requiredFields)||r.requiredFields.length>30||r.requiredFields.some(v=>typeof v!=='string')) fail('invalid_configuration','Reviewed requirements must have valid dates and a review lifetime of at most seven days.',500);
      if(r.privacyPolicyUrl)publicURL(r.privacyPolicyUrl);
    }
  }
  return config;
}

export function connectorFor(config,target,env,now=Date.now()) {
  const c=config.connectors.find(c=>c.region===target.region && c.site.toLowerCase()===target.site.toLowerCase());
  if(!c || !env[c.apiKeyEnv]) return {supported:false,reason:'This employer has not connected an authorized application integration.'};
  const r=c.postings[target.postingId];
  if(!r) return {supported:false,reason:'The employer has not supplied reviewed requirements for this posting.'};
  if(r.hasCustomQuestions!==false||r.requiredFields.some(v=>!supported.has(v))) return {supported:false,reason:'This application has additional or unsupported questions. Complete it on the employer site.'};
  if(Date.parse(r.reviewedAt)>now||Date.parse(r.expiresAt)<=now) return {supported:false,reason:'The employer’s application requirements need a current review.'};
  if(r.requiredFields.includes('consentStore')&&!r.privacyPolicyUrl) return {supported:false,reason:'The employer’s required data-consent policy is unavailable.'};
  return {supported:true,connector:c,requirements:r};
}
export function requirementsError(profile,answer,requirements) {
  const values={name:applicantName(profile),email:profile.email,resume:profile.resume,phone:profile.phone,urls:profile.website||profile.linkedin,comments:answer.comments,consentStore:answer.consentStore===true,consentMarketing:typeof answer.consentMarketing==='boolean'};
  const missing=requirements.requiredFields.filter(k=>!values[k]);
  return missing.length?`This employer requires: ${missing.join(', ')}. Review those fields before submitting.`:'';
}

async function boundedText(response,max) {
  const reader=response.body?.getReader(); if(!reader)return '';
  let size=0; const chunks=[];
  // Size rejection must not wait for upstream cleanup or inherit its failure.
  try { for(;;){ const part=await reader.read(); if(part.done)break; size+=part.value.byteLength; if(size>max){void reader.cancel().catch(()=>{});throw Error('response-too-large')} chunks.push(part.value); } }
  finally {reader.releaseLock()}
  return Buffer.concat(chunks).toString('utf8');
}
export function makeAdapter(env,{fetchImpl=fetch}={}) {
  const endpoint=t=>`${t.region==='eu'?'https://api.eu.lever.co':'https://api.lever.co'}/v0/postings/${encodeURIComponent(t.site)}/${encodeURIComponent(t.postingId)}`;
  async function posting(target) {
    let response,body;
    try{response=await fetchImpl(endpoint(target),{headers:{Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(5000)});body=await boundedText(response,1024*1024)}catch{fail('posting_unavailable','The current employer posting could not be checked. No application was sent.',503)}
    if(response.status===404)fail('posting_closed','The employer no longer lists this posting. No application was sent.',409);
    if(response.status!==200)fail('posting_unavailable','The employer posting is temporarily unavailable.',503);
    let p;try{p=JSON.parse(body)}catch{fail('posting_unavailable','The employer posting returned an unreadable response.',503)}
    if(!p||p.id!==target.postingId||typeof p.text!=='string'||!p.text.trim())fail('posting_mismatch','The returned posting does not match the selected opportunity.',409);
    return {...target,title:postingText(p.text),company:target.site,location:typeof p.categories?.location==='string'?postingText(p.categories.location):'',country:typeof p.country==='string'&&/^[A-Z]{2}$/.test(p.country)?p.country:'',workMode:['on-site','hybrid','remote'].includes(p.workplaceType)?p.workplaceType:'',metadataHash:sha256(canonical({id:p.id,text:p.text,categories:p.categories??null,country:p.country??null,workplaceType:p.workplaceType??null,descriptionPlain:p.descriptionPlain??null,additionalPlain:p.additionalPlain??null,lists:p.lists??null}))};
  }
  async function submit(target,snapshot,connector,pdfBytes,{timeoutMs=8000}={}) {
    const p=snapshot.profile,a=snapshot.answers,form=new FormData();
    form.set('name',applicantName(p));form.set('email',p.email);
    form.set('resume',new Blob([pdfBytes],{type:'application/pdf'}),p.resume.name);
    if(p.phone)form.set('phone',p.phone);if(p.website)form.set('urls[Portfolio]',p.website);if(p.linkedin)form.set('urls[LinkedIn]',p.linkedin);if(a.comments)form.set('comments',a.comments);
    if(a.consentStore!==undefined)form.set('consent[store]',String(a.consentStore));if(a.consentMarketing!==undefined)form.set('consent[marketing]',String(a.consentMarketing));
    form.set('silent','false');form.set('source','Career Finder');
    const url=new URL(endpoint(target));url.searchParams.set('key',env[connector.apiKeyEnv]);
    let response,body;
    try{response=await fetchImpl(url,{method:'POST',body:form,headers:{Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(Math.max(1,Math.min(8000,timeoutMs)))});body=await boundedText(response,128*1024)}catch{return {state:'uncertain',error:{code:'unconfirmed_transport',message:'The request began without a reliable provider result. Reconcile this attempt before applying again.'}}}
    const responseSHA256=sha256(body);let data;try{data=JSON.parse(body)}catch{data=null}
    // A malformed receipt ID cannot confirm an application; keep the existing uncertain outcome and response hash.
    if(response.status===200&&data?.ok===true&&typeof data.applicationId==='string'&&data.applicationId.trim()&&data.applicationId.length<=200&&!/[\x00-\x1f\x7f\uD800-\uDFFF]/u.test(data.applicationId))return {state:'confirmed',applicationId:data.applicationId.trim(),responseSHA256};
    if(response.status===429){const delay=retryAfterDelay(response.headers.get('retry-after'));return {state:'rate_limited',retryDelay:delay,responseSHA256,error:{code:delay===null?'provider_cooldown_unknown':'provider_rate_limited',message:delay===null?'The provider rejected this request for rate limiting, but its waiting period could not be read safely. Reconcile with the employer before any new attempt.':'The provider rejected this request for rate limiting. Review and approve again after the complete cooldown.'}}}
    if([400,401,403,404,422].includes(response.status)&&data?.ok===false)return {state:'rejected',responseSHA256,error:{code:'provider_rejected',message:'The provider explicitly rejected this application. Review the employer form or integration before a corrected attempt.'}};
    return {state:'uncertain',responseSHA256,error:{code:'unconfirmed_response',message:'The provider did not return a documented application receipt. Reconcile this attempt before applying again.'}};
  }
  return {mode:'local',posting,submit};
}
