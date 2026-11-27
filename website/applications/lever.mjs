import {retryAfterDelay} from './retry-after.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ApplicationError,fail,object,text,publicURL,canonical,sha256,applicantName} from './validation.mjs';

const supported = new Set(['name','email','resume','phone','urls','comments','consentStore','consentMarketing']);
function postingText(value) {
  // Unicode mode preserves valid pairs while detecting unpaired surrogate code units.
  if (/[\uD800-\uDFFF]/u.test(value)) fail('posting_unavailable','The employer posting returned an unreadable response.',503);
  // Keep valid surrogate pairs intact at the existing UTF-16 length boundary.
  return value.slice(0,500).replace(/[\uD800-\uDBFF]$/, '');
}

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../web');
export function loadConfiguration(configPath, env = process.env) {
  if (!configPath) return {version:1,connectors:[]};
  const resolved = path.resolve(configPath);
  if (resolved === webRoot || resolved.startsWith(webRoot + path.sep)) fail('unsafe_configuration','Application connector configuration must be outside the public web folder.',500);
  let config;
  try { const stat=fs.statSync(resolved); if(stat.size>1024*1024)throw Error(); config=JSON.parse(fs.readFileSync(resolved,'utf8')); } catch { fail('invalid_configuration','The application connector configuration cannot be read.',500); }
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
export function makeAdapter({testOnly,env=process.env}={}) {
  let testBase=null;
  if(testOnly) {
    if(env.NODE_ENV!=='test'||testOnly.enabled!==true) fail('unsafe_test_configuration','A mock upstream requires NODE_ENV=test and an explicit testOnly.enabled flag.',500);
    let u;try{u=new URL(testOnly.baseURL)}catch{fail('unsafe_test_configuration','The mock upstream URL is invalid.',500)}
    if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.username||u.password||u.search||u.hash) fail('unsafe_test_configuration','Mock upstreams must use an explicit 127.0.0.1 HTTP address.',500);
    testBase=u.href.replace(/\/$/,'');
  }
  const mode=testBase?'test':'local';
  const timeout=Math.max(50,Math.min(testOnly?.timeoutMs??15000,30000));
  const endpoint=t=>`${testBase??(t.region==='eu'?'https://api.eu.lever.co':'https://api.lever.co')}/v0/postings/${encodeURIComponent(t.site)}/${encodeURIComponent(t.postingId)}`;
  async function readResponse(response,max=1024*1024) {
    const reader=response.body?.getReader(); if(!reader)return '';
    let size=0;const chunks=[];
    try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new Error('response-too-large')}chunks.push(value)}}finally{reader.releaseLock()}
    return Buffer.concat(chunks).toString('utf8');
  }
  async function posting(target) {
    let response,body;
    try {response=await fetch(endpoint(target),{headers:{Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(timeout)});body=await readResponse(response);} catch {throw new ApplicationError('posting_unavailable','The current employer posting could not be checked. No application was sent.',503)}
    if(response.status===404)throw new ApplicationError('posting_closed','The employer no longer lists this posting. No application was sent.',409);
    if(response.status!==200)throw new ApplicationError('posting_unavailable','The employer posting is temporarily unavailable. No application was sent.',503);
    let p;try{p=JSON.parse(body)}catch{throw new ApplicationError('posting_unavailable','The employer posting returned an unreadable response. No application was sent.',503)}
    if(!p||p.id!==target.postingId||typeof p.text!=='string'||!p.text.trim())throw new ApplicationError('posting_mismatch','The returned posting does not match the selected opportunity.',409);
    const location=typeof p.categories?.location==='string'?postingText(p.categories.location):'';
    const country=typeof p.country==='string'&&/^[A-Z]{2}$/.test(p.country)?p.country:'';
    const workMode=['on-site','hybrid','remote'].includes(p.workplaceType)?p.workplaceType:'';
    return {...target,title:postingText(p.text),company:target.site,location,country,workMode,metadataHash:sha256(canonical({id:p.id,text:p.text,categories:p.categories??null,country:p.country??null,workplaceType:p.workplaceType??null,descriptionPlain:p.descriptionPlain??null,additionalPlain:p.additionalPlain??null,lists:p.lists??null}))};
  }
  async function submit(target,snapshot,connector) {
    const form=new FormData();
    const p=snapshot.profile,a=snapshot.answers;
    form.set('name',applicantName(p));form.set('email',p.email);
    form.set('resume',new Blob([Buffer.from(p.resume.dataBase64,'base64')],{type:'application/pdf'}),p.resume.name);
    if(p.phone)form.set('phone',p.phone);
    if(p.website)form.set('urls[Portfolio]',p.website);if(p.linkedin)form.set('urls[LinkedIn]',p.linkedin);
    if(a.comments)form.set('comments',a.comments);
    if(a.consentStore!==undefined)form.set('consent[store]',String(a.consentStore));
    if(a.consentMarketing!==undefined)form.set('consent[marketing]',String(a.consentMarketing));
    form.set('silent','false');form.set('source','Career Finder');
    const url=new URL(endpoint(target));url.searchParams.set('key',env[connector.apiKeyEnv]);
    let response,body;
    try{response=await fetch(url,{method:'POST',body:form,headers:{Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(timeout)});body=await readResponse(response,128*1024)}catch{return {state:'uncertain',error:{code:'unconfirmed_transport',message:'The request began, but no reliable provider result was received. Do not submit again until it is reconciled.'}}}
    const responseSHA256=sha256(body);
    let data;try{data=JSON.parse(body)}catch{data=null}
    // A malformed receipt ID cannot confirm an application; keep the existing uncertain outcome and response hash.
    if(response.status===200&&data?.ok===true&&typeof data.applicationId==='string'&&data.applicationId.trim()&&data.applicationId.length<=200&&!/[\x00-\x1f\x7f\uD800-\uDFFF]/u.test(data.applicationId))return {state:'confirmed',applicationId:data.applicationId.trim(),responseSHA256};
    if(response.status===429) {
      const delay=retryAfterDelay(response.headers.get('retry-after'));
      return {state:'rate_limited',retryDelay:delay,responseSHA256,error:{code:delay===null?'provider_cooldown_unknown':'provider_rate_limited',message:delay===null?'The provider rejected this request for rate limiting, but its waiting period could not be read safely. Reconcile with the employer before any new attempt.':'The provider rejected this request for rate limiting. Review and approve again after the complete cooldown.'}};
    }
    if([400,401,403,404,422].includes(response.status)&&data?.ok===false) return {state:'rejected',responseSHA256,error:{code:'provider_rejected',message:'The provider explicitly rejected this application. Review the employer’s form or integration settings before a corrected attempt.'}};
    return {state:'uncertain',responseSHA256,error:{code:'unconfirmed_response',message:'The provider did not return a documented application receipt. Do not submit again until this attempt is reconciled.'}};
  }
  return {mode,posting,submit};
}
