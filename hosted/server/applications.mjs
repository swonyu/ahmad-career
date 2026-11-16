import {randomBytes,randomUUID,createHmac,timingSafeEqual} from 'node:crypto';
import {ApplicationError,fail,object,text,canonical,sha256,publicURL,leverTarget,profile as validateProfile,answers as validateAnswers,requiredProfile,country,applicantName} from './validation.mjs';
import {loadConfiguration,connectorFor,requirementsError,makeAdapter} from './provider.mjs';

export const SERVICE_ORIGIN='https://career-finder-service.jazzy-drake-8323.chatgpt.site';
export const LIMITS=Object.freeze({maxResumeBytes:5*1024*1024,maxStoredResumeBytes:25*1024*1024,maxResumes:5,maxUploadClaimsPerResume:20,maxJobs:200,maxPlans:100,maxAttempts:500,maxSessions:10,maxSelectedJobs:20,maxAccounts:250,maxGlobalResumeBytes:4*1024*1024*1024,maxGlobalAttempts:10000});
const MAX_BODY=7*1024*1024+32768;
const BLANK={firstName:'',lastName:'',email:'',phone:'',city:'',country:'',headline:'',skills:[],targetRoles:[],targetCountries:[],workModes:[],experienceLevel:'any',website:'',linkedin:'',resume:null};
const stringify=JSON.stringify;
const idCheck=id=>{if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))fail('invalid_identifier','The requested identifier is invalid.');return id};
function equal(a,b){return typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b))}
function safeResume(r){return r?{name:r.name,mime:r.mime,size:r.size,sha256:r.sha256}:null}
function publicProfile(p,revision){return {...p,linkedin:p.linkedin??'',resume:safeResume(p.resume),revision}}
function response(status,data,headers={}){return new Response(stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...headers}})}
async function bodyJSON(request,max=32768){
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??''))fail('json_required','Use application/json for this request.',415);
  const length=Number(request.headers.get('content-length')??0);if(!Number.isFinite(length)||length>max)fail('body_too_large','This request is too large.',413);
  const reader=request.body?.getReader();if(!reader)fail('invalid_json','A JSON request body is required.',400);
  let size=0;const chunks=[];
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();fail('body_too_large','This request is too large.',413)}chunks.push(value)}}finally{reader.releaseLock()}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{fail('invalid_json','The request body is not valid JSON.',400)}
}
function pairingCode(value){if(typeof value!=='string'||value.length>40)return null;const code=value.toUpperCase().replace(/[- ]/g,'');return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{16}$/.test(code)?code:null}

/** Dependency injection is only for isolated executable tests, never supplied by request or environment values. */
export function createHostedApplicationHandler({clock=Date.now,adapterFactory=makeAdapter}={}) {
  return async function handleApplications(request,env,ctx={}) {
    const url=new URL(request.url);
    const browserPhone=/^\/api\/phone(?:\/|$)/.test(url.pathname);
    if(url.pathname!=='/api/health'&&!url.pathname.startsWith('/api/apply/')&&!/^\/api\/account(?:\/|$)/.test(url.pathname)&&!browserPhone)return null;
    const now=()=>clock(),iso=()=>new Date(now()).toISOString();
    try {
      if(url.origin!==SERVICE_ORIGIN||request.headers.get('host')&&request.headers.get('host')!==url.host)fail('host_denied','Use the configured Career Finder HTTPS address.',403);
      const origin=request.headers.get('origin');
      if(origin&&origin!==SERVICE_ORIGIN||request.headers.get('sec-fetch-site')==='cross-site')fail('origin_denied','This request did not come from Career Finder.',403);
      if(!env.DB||!env.BUCKET)fail('service_unavailable','The private application storage is not available.',503);
      const db=env.DB;
      const stmt=(sql,...args)=>db.prepare(sql).bind(...args);
      const first=(sql,...args)=>stmt(sql,...args).first();
      const all=async(sql,...args)=>(await stmt(sql,...args).all()).results;
      const run=(sql,...args)=>stmt(sql,...args).run();
      const config=loadConfiguration(env),adapter=adapterFactory(env),mode=adapter.mode;
      const support=job=>job.provider==='lever'?connectorFor(config,job,env,now()):{supported:false,reason:'This employer uses a manual application form. Open the employer site to apply.'};
      const jobView=job=>{const s=support(job);return {...job,submissionSupported:s.supported,reason:s.reason??''}};
      const capabilities=()=>({mode,liveEnabled:mode==='local'&&config.connectors.some(c=>env[c.apiKeyEnv]&&Object.keys(c.postings).some(postingId=>connectorFor(config,{...c,postingId},env,now()).supported)),providers:config.connectors.map(c=>({provider:'lever',region:c.region,site:c.site,connected:Boolean(env[c.apiKeyEnv]),reviewedPostingCount:Object.keys(c.postings).filter(postingId=>connectorFor(config,{...c,postingId},env,now()).supported).length})),coverage:'Only employer-authorized integrations with current reviewed requirements can submit automatically.',storage:'Private hosted workspace',hosting:'managed-https',dispatchContinuation:'client',linkedinProfile:true,applicantEmailPolicy:'signed-in-account',maxResumeBytes:LIMITS.maxResumeBytes,maxSelectedJobs:LIMITS.maxSelectedJobs});
      if(url.pathname==='/api/health'&&request.method==='GET'){await first('SELECT 1 AS ready FROM workspaces LIMIT 1');await env.BUCKET.head('service-health-probe');return response(200,{ok:true,service:'Career Finder',storage:'ready',mode,liveEnabled:capabilities().liveEnabled})}
      const owner=()=>{const id=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');if(!id||!email||id.length>250||email.length>254)fail('sign_in_required','Sign in with ChatGPT to manage your Career Finder account.',401);return{id,email:email.toLowerCase()}};
      const requireBrowserWrite=()=>{if(origin!==SERVICE_ORIGIN)fail('origin_denied','Account changes require the exact Career Finder website origin.',403)};
      async function throttle(key,limit=60){
        const window=Math.floor(now()/60000);
        await run('DELETE FROM throttles WHERE window<?',window-5);
        const row=await stmt('INSERT INTO throttles(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window=excluded.window,count=CASE WHEN throttles.window=excluded.window THEN throttles.count+1 ELSE 1 END RETURNING count',key,window).first();
        if(row.count>limit)fail('rate_limited','Too many requests. Wait one minute and try again.',429);
      }
      async function salt(){let value=await first("SELECT value FROM meta WHERE key='identity_salt'");if(!value)fail('service_unavailable','The application identity ledger is not initialized.',503);return value.value}
      async function activeIDs(workspace){
        const rows=await all("SELECT p.id FROM plans p JOIN workspaces w ON w.id=p.workspace_id WHERE p.workspace_id=? AND w.deleting_at IS NULL AND p.stopped=0 AND p.expires_at>? AND p.profile_revision=w.revision AND p.approval_generation>0 AND EXISTS(SELECT 1 FROM attempts a WHERE a.plan_id=p.id AND (a.state='ready' OR a.state='dispatching' OR (a.state='rate_limited' AND a.retry_at<=? AND a.approval_generation<p.approval_generation AND p.last_approved_at>=a.retry_at))) ORDER BY p.created_at,p.id LIMIT 100",workspace,iso(),iso());return rows.map(r=>r.id);
      }
      function attemptView(row){const s=JSON.parse(row.snapshot_json);return{id:row.id,attemptId:row.id,planId:row.plan_id,jobId:row.job_id,provider:s.job.provider,region:s.job.region,employerSite:s.job.site,site:s.job.site,postingId:s.job.postingId,company:s.job.company,title:s.job.title,url:s.job.url,state:row.state,createdAt:row.created_at,dispatchedAt:row.dispatched_at,confirmedAt:row.confirmed_at,...(row.state==='confirmed'?{applicationId:row.application_id}:{}),profileRevision:s.profileRevision,resumeSHA256:s.profile.resume?.sha256??null,payloadSHA256:s.payloadSHA256,requirementsRevision:s.requirements?.revision??null,responseSHA256:row.response_hash,mode:row.mode,evidenceMode:row.mode==='test'?'test':'live',...(row.retry_at?{retryAt:row.retry_at}:{}),dispatchCount:row.dispatch_count,error:row.error_code?{code:row.error_code,message:row.error_message}:null}}
      async function attemptsFor(workspace,planId){const rows=planId?await all('SELECT * FROM attempts WHERE workspace_id=? AND plan_id=? ORDER BY created_at,id LIMIT 500',workspace,planId):await all('SELECT * FROM attempts WHERE workspace_id=? ORDER BY created_at DESC,id LIMIT 500',workspace);return rows.map(attemptView)}
      async function planView(row,existingRows=null){const rows=existingRows??await all('SELECT * FROM attempts WHERE plan_id=? ORDER BY created_at,id LIMIT 20',row.id),mapped=new Map(rows.map(a=>[a.id,a]));return{id:row.id,digest:row.digest,profileRevision:row.profile_revision,createdAt:row.created_at,expiresAt:row.expires_at,stopped:Boolean(row.stopped),approvedAt:row.approved_at,items:JSON.parse(row.items_json).map(item=>{const a=mapped.get(item.attemptId);return a?{...item,state:a.state,reason:a.error_message??item.reason,applicationId:a.state==='confirmed'?a.application_id:undefined,retryAt:a.retry_at}:item})}}
      async function workspaceView(ws){
        const plans=await all("SELECT p.* FROM plans p WHERE p.workspace_id=? AND p.stopped=0 AND p.expires_at>? AND p.profile_revision=? AND EXISTS(SELECT 1 FROM attempts a WHERE a.plan_id=p.id AND a.state IN ('ready','rate_limited')) ORDER BY p.created_at DESC,p.id LIMIT 20",ws.id,iso(),ws.revision);
        const attemptRows=await all('SELECT * FROM attempts WHERE workspace_id=? ORDER BY created_at DESC,id LIMIT 500',ws.id);
        return{ok:true,mode,workspaceId:ws.id,profile:publicProfile(JSON.parse(ws.profile_json),ws.revision),jobs:(await all('SELECT * FROM jobs WHERE workspace_id=? ORDER BY created_at DESC,id LIMIT 200',ws.id)).map(r=>jobView({...JSON.parse(r.data_json),id:r.id})),attempts:attemptRows.map(attemptView),capabilities:capabilities(),recoverablePlans:await Promise.all(plans.map(p=>planView(p,attemptRows))),activePlanIds:await activeIDs(ws.id)};
      }
      async function browserWorkspaceView(who,ws){
        const view=ws?await workspaceView(ws):{ok:true,mode,workspaceId:null,profile:publicProfile(BLANK,0),jobs:[],attempts:[],capabilities:capabilities(),recoverablePlans:[],activePlanIds:[]};
        return{...view,accountId:who.id,accountEmail:who.email,confirmedEmail:ws?.owner_email??who.email,emailUpdateRequired:Boolean(ws&&ws.owner_email!==who.email),deleting:Boolean(ws?.deleting_at)};
      }
      async function nativeSession(){const match=(request.headers.get('authorization')??'').match(/^Bearer ([a-f0-9]{64})$/),row=match?await first('SELECT w.* FROM native_sessions s JOIN workspaces w ON w.id=s.workspace_id WHERE s.token_hash=? AND s.expires_at>?',sha256(match[1]),iso()):null;if(!row)fail('session_required','Your phone session expired or is invalid. Pair this phone again.',401);if(row.deleting_at)fail('account_deleting','This account is being deleted. No new applications can be started.',409);return row}
      async function documents(ws){return(await all("SELECT hash,name,bytes,created_at,state FROM resumes WHERE workspace_id=? ORDER BY created_at DESC LIMIT 5",ws.id)).map(r=>({sha256:r.hash,name:r.name,size:r.bytes,createdAt:r.created_at,state:r.state,downloadPath:`/api/account/resumes/${r.hash}?expectedWorkspaceId=${encodeURIComponent(ws.id)}`}))}
      async function usage(ws){const r=await first('SELECT COUNT(*) AS files,COALESCE(SUM(bytes),0) AS bytes FROM resumes WHERE workspace_id=?',ws.id);return{storedResumes:r.files,storedResumeBytes:r.bytes,jobs:(await first('SELECT COUNT(*) AS n FROM jobs WHERE workspace_id=?',ws.id)).n,plans:(await first('SELECT COUNT(*) AS n FROM plans WHERE workspace_id=?',ws.id)).n,attempts:(await first('SELECT COUNT(*) AS n FROM attempts WHERE workspace_id=?',ws.id)).n}}
      // A permanent, opaque empty object fences conditional late writers. No account ID, hash, filename or PDF metadata is retained in these markers.
      async function tombstone(key){await env.BUCKET.put(key,new Uint8Array(0),{httpMetadata:{contentType:'application/octet-stream'},customMetadata:{purpose:'retired-upload'}});const head=await env.BUCKET.head(key);if(!head||head.size!==0||head.customMetadata?.purpose!=='retired-upload')fail('deletion_pending','Private file erasure is not confirmed. Try again.',503)}
      async function storeResume(ws,resume,data){
        const fileId=ws.id+':'+resume.sha256,existing=await first('SELECT * FROM resumes WHERE id=?',fileId);
        if(existing?.state==='ready')return {...safeResume(resume),objectKey:existing.object_key};
        if(existing?.state==='uploading'&&Date.parse(existing.lease_expires_at)>now())fail('upload_in_progress','This PDF is still being saved. Retry or recover it after one minute.',409);
        const claim=randomUUID(),key='uploads/'+randomUUID(),lease=new Date(now()+60000).toISOString();
        let results;
        if(!existing){results=await db.batch([stmt("INSERT OR IGNORE INTO resumes(id,workspace_id,hash,object_key,name,bytes,state,created_at,upload_claim,lease_expires_at) SELECT ?,?,?,?,?,?,'uploading',?,?,? FROM workspaces WHERE id=? AND deleting_at IS NULL AND (SELECT COUNT(*) FROM resumes WHERE workspace_id=?)<? AND (SELECT COALESCE(SUM(bytes),0) FROM resumes WHERE workspace_id=?)+?<=? AND (SELECT COALESCE(SUM(bytes),0) FROM resumes)+?<=?",fileId,ws.id,resume.sha256,key,resume.name,data.byteLength,iso(),claim,lease,ws.id,ws.id,LIMITS.maxResumes,ws.id,data.byteLength,LIMITS.maxStoredResumeBytes,data.byteLength,LIMITS.maxGlobalResumeBytes),stmt('INSERT INTO resume_uploads(id,resume_id,workspace_id,object_key,created_at) SELECT ?,?,?,?,? FROM resumes WHERE id=? AND upload_claim=?',claim,fileId,ws.id,key,iso(),fileId,claim)])}
        else{results=await db.batch([stmt("UPDATE resumes SET object_key=?,state='uploading',upload_claim=?,lease_expires_at=?,created_at=? WHERE id=? AND (state='failed' OR (state='uploading' AND lease_expires_at<=?)) AND EXISTS(SELECT 1 FROM workspaces WHERE id=? AND deleting_at IS NULL) AND (SELECT COUNT(*) FROM resume_uploads WHERE resume_id=?)<?",key,claim,lease,iso(),fileId,iso(),ws.id,fileId,LIMITS.maxUploadClaimsPerResume),stmt('INSERT INTO resume_uploads(id,resume_id,workspace_id,object_key,created_at) SELECT ?,?,?,?,? FROM resumes WHERE id=? AND upload_claim=?',claim,fileId,ws.id,key,iso(),fileId,claim)])}
        if(results[0].meta.changes!==1)fail('storage_quota','The PDF is already being saved, the account is being deleted, or the free storage/recovery limit was reached. Existing records were preserved.',409);
        try{
          const previous=await all('SELECT object_key FROM resume_uploads WHERE resume_id=? AND id<>? LIMIT 20',fileId,claim);for(const old of previous)await tombstone(old.object_key);
          const stored=await env.BUCKET.put(key,data,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/pdf'},customMetadata:{sha256:resume.sha256}});
          if(!stored)fail('upload_retired','This upload was stopped by account deletion or recovery. No profile was replaced.',409);
          const acknowledged=await run("UPDATE resumes SET state='ready',lease_expires_at=NULL WHERE id=? AND upload_claim=? AND state='uploading' AND EXISTS(SELECT 1 FROM workspaces WHERE id=? AND deleting_at IS NULL)",fileId,claim,ws.id);
          if(acknowledged.meta.changes!==1){await tombstone(key);fail('upload_retired','This upload was superseded or the account was deleted. No profile was replaced.',409)}
          return {...safeResume(resume),objectKey:key};
        }catch(error){try{await run("UPDATE resumes SET state='failed',lease_expires_at=NULL WHERE id=? AND upload_claim=? AND state='uploading'",fileId,claim)}catch{}if(error instanceof ApplicationError)throw error;fail('file_storage_unavailable','The PDF could not be saved. Your previous profile was preserved; retry or recover the upload.',503)}
      }

      if(url.pathname.startsWith('/api/account')) {
        const who=owner(),mutation=!['GET','HEAD'].includes(request.method);if(mutation)requireBrowserWrite();
        let ws=await first('SELECT * FROM workspaces WHERE owner_id=?',who.id);
        if(url.pathname==='/api/account'&&request.method==='GET')return response(200,{ok:true,workspaceId:ws?.id??null,email:who.email,confirmedEmail:ws?.owner_email??who.email,emailUpdateRequired:Boolean(ws&&ws.owner_email!==who.email),createdAt:ws?.created_at??null,deleting:Boolean(ws?.deleting_at),profile:publicProfile(ws?JSON.parse(ws.profile_json):BLANK,ws?.revision??0),sessions:ws?await all('SELECT id,created_at AS createdAt,expires_at AS expiresAt FROM native_sessions WHERE workspace_id=? AND expires_at>? ORDER BY created_at DESC LIMIT 10',ws.id,iso()):[],documents:ws?await documents(ws):[],limits:LIMITS,usage:ws?await usage(ws):{storedResumes:0,storedResumeBytes:0,jobs:0,plans:0,attempts:0}});
        if(url.pathname==='/api/account/pairing'&&request.method==='POST'){
          const body=object(await bodyJSON(request),['expectedAccountId']);
          if(body.expectedAccountId!==who.id)fail('account_changed','The signed-in account changed. Reload this page before creating a connection code.',409);
          await throttle('account:'+sha256(who.id),30);
          if(ws?.deleting_at)fail('account_deleting','Finish deleting this account before creating another connection.',409);
          if(!ws){const id=randomUUID();await run('INSERT OR IGNORE INTO workspaces(id,owner_id,owner_email,created_at,profile_json) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM workspaces)<?',id,who.id,who.email,iso(),stringify(BLANK),LIMITS.maxAccounts);ws=await first('SELECT * FROM workspaces WHERE owner_id=?',who.id);if(!ws)fail('capacity_reached','The free service has reached its current account capacity. No paid service was enabled.',503)}
          if(ws.owner_email!==who.email){await run('UPDATE workspaces SET owner_email=?,revision=revision+1 WHERE id=? AND owner_email<>? AND deleting_at IS NULL',who.email,ws.id,who.email);ws=await first('SELECT * FROM workspaces WHERE owner_id=?',who.id);if(!ws||ws.deleting_at)fail('account_deleting','This account is being deleted.',409)}
          await run("INSERT OR IGNORE INTO meta(key,value) VALUES('identity_salt',?)",randomBytes(32).toString('hex'));
          await run('DELETE FROM native_sessions WHERE workspace_id=? AND expires_at<=?',ws.id,iso());
          if((await first('SELECT COUNT(*) AS n FROM native_sessions WHERE workspace_id=?',ws.id)).n>=LIMITS.maxSessions)fail('session_limit','Remove an older phone connection before pairing another.',409);
          const raw=[...randomBytes(16)].map(b=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b&31]).join(''),expiresAt=new Date(now()+300000).toISOString();
          const savedCode=await db.batch([stmt('DELETE FROM pairing_codes WHERE workspace_id=?',ws.id),stmt('INSERT INTO pairing_codes(code_hash,workspace_id,created_at,expires_at) SELECT ?,?,?,? FROM workspaces WHERE id=? AND deleting_at IS NULL',sha256(raw),ws.id,iso(),expiresAt,ws.id)]);
          if(savedCode[1].meta.changes!==1)fail('account_deleting','This account was deleted or locked before a pairing code could be issued.',409);
          return response(201,{ok:true,pairingCode:raw.match(/.{4}/g).join('-'),expiresAt,serverTime:iso(),workspaceId:ws.id,origin:SERVICE_ORIGIN});
        }
        const mutationFields=url.pathname==='/api/account'&&request.method==='DELETE'?['confirmation']:url.pathname==='/api/account/sessions/revoke'&&request.method==='POST'?['sessionId']:url.pathname==='/api/account/uploads/recover'&&request.method==='POST'?[]:null;
        let accountBody;
        if(mutationFields!==null){
          accountBody=object(await bodyJSON(request),['expectedWorkspaceId',...mutationFields]);
          // Bind the user's displayed target to this request's current Sites identity.
          // Check before changing codes, sessions, documents, or deletion state.
          if(!ws||typeof accountBody.expectedWorkspaceId!=='string'||accountBody.expectedWorkspaceId!==ws.id)fail('workspace_changed','The signed-in workspace changed. Reload this page before making changes.',409);
          await throttle('account:'+sha256(who.id),30);
        }
        const file=url.pathname.match(/^\/api\/account\/resumes\/([a-f0-9]{64})$/);
        if(request.method==='GET'&&(url.pathname==='/api/account/export'||file)){
          const targets=url.searchParams.getAll('expectedWorkspaceId');
          if(!ws||targets.length!==1||targets[0]!==ws.id)fail('workspace_changed','The signed-in workspace changed. Reload this page before downloading records.',409);
        }
        if(!ws)fail('workspace_missing','Create a phone connection to start your hosted workspace.',404);
        if(url.pathname==='/api/account/sessions/revoke'&&request.method==='POST'){idCheck(accountBody.sessionId);await run('DELETE FROM native_sessions WHERE id=? AND workspace_id=?',accountBody.sessionId,ws.id);return response(200,{ok:true})}
        if(url.pathname==='/api/account/uploads/recover'&&request.method==='POST'){
          if(ws.deleting_at)fail('account_deleting','Finish the pending deletion instead of recovering files.',409);
          const rows=await all("SELECT * FROM resumes WHERE workspace_id=? AND (state='failed' OR (state='uploading' AND lease_expires_at<=?)) LIMIT 5",ws.id,iso());let recovered=0,retryRequired=0;
          for(const row of rows){
            const stored=await env.BUCKET.get(row.object_key);let bytes=stored&&stored.size===row.bytes?new Uint8Array(await stored.arrayBuffer()):null;
            if(bytes&&sha256(bytes)===row.hash){await storeResume(ws,{name:row.name,mime:'application/pdf',size:row.bytes,sha256:row.hash},bytes);recovered++}
            else{const priorKeys=await all('SELECT object_key FROM resume_uploads WHERE resume_id=? LIMIT 20',row.id),claim=randomUUID(),changed=await run("UPDATE resumes SET state='failed',upload_claim=?,lease_expires_at=NULL WHERE id=? AND upload_claim IS ? AND (state='failed' OR (state='uploading' AND lease_expires_at<=?))",claim,row.id,row.upload_claim,iso());if(changed.meta.changes){for(const old of priorKeys)await tombstone(old.object_key);retryRequired++}}
          }
          return response(200,{ok:true,recovered,retryRequired,message:'Recovered files remain private account documents. A phone must explicitly save its profile to attach a recovered CV.'});
        }
        if(url.pathname==='/api/account/export'&&request.method==='GET'){
          const planRows=await all('SELECT * FROM plans WHERE workspace_id=? ORDER BY created_at,id LIMIT 100',ws.id),attemptRows=await all('SELECT * FROM attempts WHERE workspace_id=? ORDER BY created_at,id LIMIT 500',ws.id);
          return response(200,{ok:true,schemaVersion:1,exportedAt:iso(),workspaceId:ws.id,email:who.email,profile:publicProfile(JSON.parse(ws.profile_json),ws.revision),jobs:(await all('SELECT * FROM jobs WHERE workspace_id=? ORDER BY created_at,id LIMIT 200',ws.id)).map(r=>({...JSON.parse(r.data_json),id:r.id})),plans:await Promise.all(planRows.map(p=>planView(p,attemptRows))),attempts:attemptRows.map(r=>{const s=JSON.parse(r.snapshot_json);return{...attemptView(r),submittedProfile:publicProfile(s.profile,s.profileRevision),answers:s.answers,requirements:s.requirements}}),documents:await documents(ws),includesPDFBytes:false,pdfInstructions:'Download the private PDFs using each document downloadPath while signed in. This JSON export contains records and PDF fingerprints.'},{'Content-Disposition':'attachment; filename="career-finder-records.json"'});
        }
        if(file&&request.method==='GET'){if(ws.deleting_at)fail('account_deleting','This account is being erased. Its PDFs are no longer available for download.',409);const row=await first("SELECT * FROM resumes WHERE workspace_id=? AND hash=? AND state='ready'",ws.id,file[1]);if(!row)fail('file_not_found','This PDF is not in your account.',404);const stored=await env.BUCKET.get(row.object_key);if(!stored||stored.size!==row.bytes)fail('file_unavailable','The exact stored PDF is temporarily unavailable.',503);return new Response(stored.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}})}
        if(url.pathname==='/api/account'&&request.method==='DELETE'){
          if(accountBody.confirmation!=='DELETE')fail('deletion_confirmation_required','Type DELETE to permanently remove the hosted workspace.',409);
          await run("UPDATE attempts SET state='uncertain',error_code='worker_interrupted',error_message='The dispatch lease expired without a durable provider result. No automatic resend occurred.' WHERE workspace_id=? AND state='dispatching' AND lease_expires_at<=?",ws.id,iso());
          // R2 tombstones fence late conditional uploads; an actual provider dispatch must finish or become durably uncertain first.
          const lock=await run("UPDATE workspaces SET deleting_at=COALESCE(deleting_at,?) WHERE id=? AND NOT EXISTS(SELECT 1 FROM attempts WHERE workspace_id=? AND state='dispatching')",iso(),ws.id,ws.id);
          if(lock.meta.changes!==1)fail('work_in_flight','An application request is still in progress. Resolve its outcome before deleting the account.',409);
          const objects=await all('SELECT object_key FROM resume_uploads WHERE workspace_id=? LIMIT 100',ws.id);for(const item of objects)await tombstone(item.object_key);
          await db.batch(['attempts','plans','jobs','resume_uploads','resumes','native_sessions','pairing_codes'].map(table=>stmt(`DELETE FROM ${table} WHERE workspace_id=?`,ws.id)).concat([stmt('DELETE FROM throttles WHERE key IN (?,?)','workspace:'+ws.id,'account:'+sha256(who.id)),stmt('DELETE FROM workspaces WHERE id=? AND deleting_at IS NOT NULL',ws.id)]));
          return response(200,{ok:true,deleted:true,scope:'Hosted account records, PDF contents, application records, pairing codes and phone sessions erased. Opaque empty upload markers prevent delayed writes from restoring deleted files. Employer-held applications and managed backup retention are separate.'});
        }
        fail('not_found','This account endpoint or method is not supported.',404);
      }

      const route=url.pathname.slice(browserPhone?'/api/phone/'.length:'/api/apply/'.length);
      let ws,browserBody;
      if(browserPhone){
        // The platform owns browser authentication. A native bearer, a body field,
        // or a caller-supplied workspace never substitutes for the trusted owner.
        const fields={profile:['expectedRevision','profile'],jobs:['url','title','company','location','country'],prepare:['jobIds','answers','manualAppliedJobIds','reviewSchema'],submit:['planId','digest','approved','reviewSchema'],advance:['planId'],stop:['planId','onlyIfUnapproved']};
        const mutation=request.method==='PUT'&&route==='profile'||request.method==='POST'&&['jobs','prepare','submit','advance','stop'].includes(route);
        const open=route==='workspace'&&request.method==='POST',read=request.method==='GET'&&['workspace','receipts'].includes(route);
        if(!mutation&&!open&&!read)fail('not_found','This phone website endpoint or method is not supported.',404);
        const who=owner(),fetchSite=request.headers.get('sec-fetch-site');
        if(fetchSite&&fetchSite!=='same-origin')fail('origin_denied','Open Career Finder directly before using your private workspace.',403);
        if(mutation||open)requireBrowserWrite();
        ws=await first('SELECT * FROM workspaces WHERE owner_id=?',who.id);
        if(open){
          const body=object(await bodyJSON(request),['expectedAccountId']);
          if(body.expectedAccountId!==who.id)fail('account_changed','The signed-in account changed. Reload this page before opening your workspace.',409);
          // Intent is checked before cleanup, throttling, email refresh or creation.
          if(ws?.deleting_at)fail('account_deleting','Finish deleting this account before opening another workspace.',409);
          await throttle('account:'+sha256(who.id),30);
          if(!ws){const id=randomUUID();await run('INSERT OR IGNORE INTO workspaces(id,owner_id,owner_email,created_at,profile_json) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM workspaces)<?',id,who.id,who.email,iso(),stringify(BLANK),LIMITS.maxAccounts);ws=await first('SELECT * FROM workspaces WHERE owner_id=?',who.id);if(!ws)fail('capacity_reached','The free service has reached its current account capacity. No paid service was enabled.',503)}
          if(ws.owner_email!==who.email){await run('UPDATE workspaces SET owner_email=?,revision=revision+1 WHERE id=? AND owner_email<>? AND deleting_at IS NULL',who.email,ws.id,who.email);ws=await first('SELECT * FROM workspaces WHERE owner_id=?',who.id)}
          if(!ws||ws.deleting_at)fail('account_deleting','This account is being deleted.',409);
          await run("INSERT OR IGNORE INTO meta(key,value) VALUES('identity_salt',?)",randomBytes(32).toString('hex'));
          return response(200,await browserWorkspaceView(who,ws));
        }
        if(route==='workspace')return response(200,await browserWorkspaceView(who,ws));
        if(mutation){
          const body=object(await bodyJSON(request,route==='profile'?MAX_BODY:32768),['expectedWorkspaceId',...fields[route]]);
          if(!ws||typeof body.expectedWorkspaceId!=='string'||body.expectedWorkspaceId!==ws.id)fail('workspace_changed','The signed-in workspace changed. Reload this page before making changes.',409);
          browserBody={...body};delete browserBody.expectedWorkspaceId;
        }else{
          const targets=url.searchParams.getAll('expectedWorkspaceId');
          if(!ws||targets.length!==1||targets[0]!==ws.id)fail('workspace_changed','The signed-in workspace changed. Reload this page before downloading receipts.',409);
        }
        if(ws.deleting_at)fail('account_deleting','This account is being deleted. No new applications can be started.',409);
      }
      if(!browserPhone&&route==='status'&&request.method==='GET')return response(200,{ok:true,...capabilities()});
      if(!browserPhone&&route==='session'&&request.method==='POST'){
        await throttle('pair:'+sha256(request.headers.get('cf-connecting-ip')??'unknown-client'),10);
        const body=object(await bodyJSON(request),['pairingCode']),code=pairingCode(body.pairingCode);if(!code)fail('invalid_pairing_code','The pairing code is invalid, expired, or already used.',401);
        const token=randomBytes(32).toString('hex'),hash=sha256(token),claim=randomUUID(),sessionId=randomUUID(),expiresAt=new Date(now()+30*86400000).toISOString();
        const results=await db.batch([
          stmt('UPDATE pairing_codes SET claimed_by=? WHERE code_hash=? AND expires_at>? AND claimed_by IS NULL AND EXISTS(SELECT 1 FROM workspaces w WHERE w.id=pairing_codes.workspace_id AND w.deleting_at IS NULL) AND (SELECT COUNT(*) FROM native_sessions s WHERE s.workspace_id=pairing_codes.workspace_id AND s.expires_at>?)<?',claim,sha256(code),iso(),iso(),LIMITS.maxSessions),
          stmt('INSERT INTO native_sessions(token_hash,id,workspace_id,created_at,expires_at) SELECT ?,?,workspace_id,?,? FROM pairing_codes WHERE code_hash=? AND claimed_by=?',hash,sessionId,iso(),expiresAt,sha256(code),claim),
          stmt('DELETE FROM pairing_codes WHERE code_hash=? AND claimed_by=?',sha256(code),claim),
        ]);
        if(results[1].meta.changes!==1)fail('invalid_pairing_code','The pairing code is invalid, expired, already used, or the phone limit was reached.',401);
        const ws=await first('SELECT w.* FROM workspaces w JOIN native_sessions s ON s.workspace_id=w.id WHERE s.token_hash=?',hash);
        return response(200,{ok:true,workspaceId:ws.id,sessionToken:token,expiresAt,profile:publicProfile(JSON.parse(ws.profile_json),ws.revision)});
      }
      if(!browserPhone)ws=await nativeSession();
      // Browser bodies are bounded and parsed once above; strip only the intent
      // field and pass the remaining payload through the existing native guards.
      const applicationBody=(max=32768)=>browserPhone?browserBody:bodyJSON(request,max);
      if(!['GET','HEAD'].includes(request.method))await throttle('workspace:'+ws.id,120);
      if(route==='session/revoke'&&request.method==='POST'){object(await bodyJSON(request),[]);await run('DELETE FROM native_sessions WHERE token_hash=? AND workspace_id=?',sha256(request.headers.get('authorization').slice(7)),ws.id);return response(200,{ok:true,message:'This phone session has been revoked. Saved records remain in your account.'})}
      if(route==='workspace'&&request.method==='GET')return response(200,await workspaceView(ws));
      if(route==='receipts'&&request.method==='GET')return response(200,{ok:true,schemaVersion:1,exportedAt:iso(),mode,meaning:'Confirmed means the provider returned an application ID; it does not mean recruiter review or selection.',receipts:(await attemptsFor(ws.id)).filter(a=>a.state!=='ready')});

      if(route==='profile'&&request.method==='PUT'){
        const body=object(await applicationBody(MAX_BODY),['expectedRevision','profile']);if(!Number.isInteger(body.expectedRevision)||body.expectedRevision!==ws.revision)fail('stale_profile','Your profile changed on another device. Compare the saved versions before continuing.',409);
        const p=validateProfile(body.profile,JSON.parse(ws.profile_json));
        if(p.resume?.dataBase64){
          p.resume=await storeResume(ws,p.resume,Buffer.from(p.resume.dataBase64,'base64'));
        }
        const updated=await run('UPDATE workspaces SET profile_json=?,revision=revision+1 WHERE id=? AND revision=? AND deleting_at IS NULL',stringify(p),ws.id,body.expectedRevision);
        if(updated.meta.changes!==1)fail('stale_profile','Your profile changed or is being deleted. Your previous version was preserved.',409);
        return response(200,{ok:true,profile:publicProfile(p,ws.revision+1)});
      }
      if(route==='jobs'&&request.method==='POST'){
        const body=object(await applicationBody(),['url','title','company','location','country']),address=publicURL(body.url),target=leverTarget(address);let job;
        if(target)job=await adapter.posting(target);else{const canonicalURL=new URL(address);for(const key of [...canonicalURL.searchParams.keys()])if(/^utm_/i.test(key)||['gclid','fbclid'].includes(key))canonicalURL.searchParams.delete(key);canonicalURL.searchParams.sort();job={provider:'manual',key:'manual:'+sha256(canonicalURL.origin+canonicalURL.pathname.replace(/\/$/,'')+canonicalURL.search),url:address,title:text(body.title,'Job title',500,false),company:text(body.company,'Employer',250,false),location:text(body.location,'Location',500),country:country(body.country),region:null,site:null,postingId:null,workMode:'',metadataHash:null}}
        const existing=await first('SELECT id FROM jobs WHERE workspace_id=? AND job_key=?',ws.id,job.key),id=existing?.id??randomUUID();
        if(existing)await run('UPDATE jobs SET data_json=? WHERE id=? AND workspace_id=? AND EXISTS(SELECT 1 FROM workspaces WHERE id=? AND deleting_at IS NULL)',stringify(job),id,ws.id,ws.id);
        else{const result=await run('INSERT INTO jobs(id,workspace_id,job_key,data_json,created_at) SELECT ?,?,?,?,? FROM workspaces WHERE id=? AND deleting_at IS NULL AND (SELECT COUNT(*) FROM jobs WHERE workspace_id=?)<? ON CONFLICT(workspace_id,job_key) DO UPDATE SET data_json=excluded.data_json',id,ws.id,job.key,stringify(job),iso(),ws.id,ws.id,LIMITS.maxJobs);if(result.meta.changes!==1)fail('job_quota','This workspace has reached its saved opportunity limit.',409)}
        const saved=await first('SELECT id FROM jobs WHERE workspace_id=? AND job_key=?',ws.id,job.key);return response(existing?200:201,{ok:true,job:jobView({...job,id:saved.id})});
      }

      // Plan creation, approval and advancement below use D1 comparisons rather than isolate-local locks.
      const duplicate=async(applicantHash,jobKey,except='')=>first("SELECT id,state,retry_at FROM attempts WHERE job_key=? AND (workspace_id=? OR applicant_hash=?) AND id<>? AND (state IN ('dispatching','confirmed','uncertain','rate_limited') OR retry_at>?) LIMIT 1",jobKey,ws.id,applicantHash,except,iso());
      const duplicateReason=d=>d.state==='confirmed'?'This applicant already has a confirmed application for this posting.':d.state==='rate_limited'?'A prior attempt is waiting for its cooldown. Reopen that review and approve it again after the waiting time.':'A previous application is active, uncertain, or still within a cooldown. Reconcile it before applying again.';
      async function planOwned(id){idCheck(id);const p=await first('SELECT * FROM plans WHERE id=? AND workspace_id=?',id,ws.id);if(!p)fail('plan_not_found','This review is not in your workspace.',404);return p}
      async function planReply(plan){return{ok:true,plan:await planView(plan),attempts:await attemptsFor(ws.id,plan.id),activePlanIds:await activeIDs(ws.id)}}
      if(route==='prepare'&&request.method==='POST'){
        const body=object(await applicationBody(),['jobIds','answers','manualAppliedJobIds','reviewSchema']);if(!Array.isArray(body.jobIds)||!body.jobIds.length||body.jobIds.length>20||new Set(body.jobIds).size!==body.jobIds.length)fail('invalid_selection','Select between one and twenty distinct opportunities.');body.jobIds.forEach(idCheck);
        if(body.reviewSchema!==undefined&&body.reviewSchema!==3)fail('invalid_review_schema','Use the current application review format.');
        const answerMap=body.answers??{};object(answerMap,body.jobIds,'Answer map');const manual=body.manualAppliedJobIds??[];if(!Array.isArray(manual)||manual.some(id=>!body.jobIds.includes(id)))fail('invalid_selection','Manual application references must be selected jobs.');
        const p=JSON.parse(ws.profile_json),planId=randomUUID(),createdAt=iso(),expiresAt=new Date(now()+30*60000).toISOString(),items=[],rows=[],emailAuthorized=p.email===ws.owner_email;
        // An editable profile address is not evidence of account ownership. Only
        // the verified account email may access the cross-workspace duplicate ledger.
        const identity=emailAuthorized?createHmac('sha256',await salt()).update(p.email.trim().toLowerCase()).digest('hex'):null;
        const selectedRows=await all(`SELECT * FROM jobs WHERE workspace_id=? AND id IN (${body.jobIds.map(()=>'?').join(',')})`,ws.id,...body.jobIds),selectedMap=new Map(selectedRows.map(r=>[r.id,r]));
        if(selectedRows.length!==body.jobIds.length)fail('job_not_found','A selected opportunity is not in your workspace.',404);
        await run("UPDATE attempts SET state='cancelled',error_code='review_replaced_after_cooldown',error_message='The rejected request cooldown ended and an obsolete review was retired. No automatic resend occurred.' WHERE workspace_id=? AND state='rate_limited' AND retry_at<=? AND EXISTS(SELECT 1 FROM plans p WHERE p.id=attempts.plan_id AND (p.stopped=1 OR p.expires_at<=? OR p.profile_revision<>?))",ws.id,iso(),iso(),ws.revision);
        const keys=selectedRows.map(r=>r.job_key),scope=emailAuthorized?'(workspace_id=? OR applicant_hash=?)':'workspace_id=?',scopeArgs=emailAuthorized?[ws.id,identity]:[ws.id];
        const priorRows=await all(`SELECT id,job_key,state,retry_at FROM attempts WHERE ${scope} AND job_key IN (${keys.map(()=>'?').join(',')}) AND (state IN ('dispatching','confirmed','uncertain','rate_limited') OR retry_at>?) LIMIT 500`,...scopeArgs,...keys,iso()),priorMap=new Map(priorRows.map(r=>[r.job_key,r]));
        for(const id of body.jobIds){
          const saved=selectedMap.get(id);
          const job={...JSON.parse(saved.data_json),id},answer=validateAnswers(answerMap[id]??{}),matched=support(job);
          const prior=priorMap.get(job.key),reason=manual.includes(id)?'Your tracker already records this application. Reconcile it before applying again.':prior?duplicateReason(prior):requiredProfile(p)||(p.linkedin&&body.reviewSchema!==3?'Update Career Finder to review the LinkedIn profile link before approving this application.':null)||(!emailAuthorized?'Automatic submission requires the email verified by your signed-in account.':null)||(!matched.supported?matched.reason:requirementsError(p,answer,matched.requirements));
          const item={jobId:id,job:{id,title:job.title,company:job.company,url:job.url,location:job.location,country:job.country},title:job.title,company:job.company,state:reason?'blocked':'ready',reason:reason??'',payloadSummary:{name:applicantName(p),email:p.email,phone:p.phone,website:p.website,...(p.linkedin?{linkedin:p.linkedin}:{}),comments:answer.comments,...(answer.consentStore===undefined?{}:{consentStore:answer.consentStore}),...(answer.consentMarketing===undefined?{}:{consentMarketing:answer.consentMarketing})},resume:safeResume(p.resume),privacyPolicyUrl:matched.requirements?.privacyPolicyUrl??null,requirementsRevision:matched.requirements?.revision??null};
          if(!reason){const id=randomUUID(),snapshot={job,profile:p,profileRevision:ws.revision,answers:answer,requirements:matched.requirements,mode};snapshot.payloadSHA256=sha256(canonical({schema:p.linkedin?3:2,jobKey:job.key,profile:publicProfile(p,ws.revision),answers:answer,requirements:matched.requirements}));item.attemptId=id;rows.push({id,job,identity,snapshot})}items.push(item);
        }
        const digest=sha256(canonical({planId,workspaceId:ws.id,profileRevision:ws.revision,createdAt,expiresAt,items,snapshots:rows.map(a=>a.snapshot.payloadSHA256)}));
        const results=await db.batch([stmt('INSERT INTO plans(id,workspace_id,digest,profile_revision,created_at,expires_at,items_json) SELECT ?,?,?,?,?,?,? FROM workspaces WHERE id=? AND revision=? AND deleting_at IS NULL AND (SELECT COUNT(*) FROM plans WHERE workspace_id=?)<? AND (SELECT COUNT(*) FROM attempts WHERE workspace_id=?)+?<=? AND (SELECT COUNT(*) FROM attempts)+?<=?',planId,ws.id,digest,ws.revision,createdAt,expiresAt,stringify(items),ws.id,ws.revision,ws.id,LIMITS.maxPlans,ws.id,rows.length,LIMITS.maxAttempts,rows.length,LIMITS.maxGlobalAttempts),...rows.map(a=>stmt("INSERT INTO attempts(id,plan_id,workspace_id,applicant_hash,job_key,job_id,state,snapshot_json,created_at,mode) SELECT ?,?,?,?,?,?,'ready',?,?,? FROM plans WHERE id=?",a.id,planId,ws.id,a.identity,a.job.key,a.job.id,stringify(a.snapshot),createdAt,mode,planId))]);
        if(results[0].meta.changes!==1)fail('review_unavailable','The profile changed or this workspace reached its review limit. Existing records were preserved.',409);
        return response(201,{ok:true,plan:await planView(await planOwned(planId))});
      }
      if(route==='submit'&&request.method==='POST'){
        const body=object(await applicationBody(),['planId','digest','approved','reviewSchema']),plan=await planOwned(body.planId);
        if(body.reviewSchema!==undefined&&body.reviewSchema!==3)fail('invalid_review_schema','Use the current application review format.');
        if(JSON.parse(plan.items_json).some(item=>item.payloadSummary?.linkedin)&&body.reviewSchema!==3)fail('review_update_required','Update Career Finder to review the exact LinkedIn profile link before approving this application.',409);
        if(body.approved!==true||!equal(body.digest,plan.digest))fail('approval_required','Approve the exact current application review before submitting.',409);
        if(plan.stopped||Date.parse(plan.expires_at)<=now()||plan.profile_revision!==ws.revision)fail('stale_review','This review has stopped, expired, or changed. Prepare another review.',409);
        const pending=await all("SELECT state,retry_at FROM attempts WHERE plan_id=? AND state IN ('ready','rate_limited') LIMIT 20",plan.id);
        if(!pending.some(a=>a.state==='ready'||Date.parse(a.retry_at)<=now())){if(pending.length)fail('cooldown_active','Wait for the provider cooldown before approving this review again.',409);return response(200,await planReply(plan))}
        const update=await run('UPDATE plans SET approved_at=COALESCE(approved_at,?),last_approved_at=?,approval_generation=approval_generation+1 WHERE id=? AND workspace_id=? AND stopped=0 AND expires_at>? AND profile_revision=(SELECT revision FROM workspaces WHERE id=? AND deleting_at IS NULL)',iso(),iso(),plan.id,ws.id,iso(),ws.id);
        if(update.meta.changes!==1)fail('stale_review','This review changed before approval could be recorded.',409);
        return response(202,await planReply(await planOwned(plan.id)));
      }
      if(route==='stop'&&request.method==='POST'){
        const body=object(await applicationBody(),['planId','onlyIfUnapproved']),plan=await planOwned(body.planId);if(body.onlyIfUnapproved!==undefined&&typeof body.onlyIfUnapproved!=='boolean')fail('invalid_stop_condition','The unapproved-review condition must be a boolean.');
        const guarded=body.onlyIfUnapproved===true;
        const stopGuard=guarded?"AND approved_at IS NULL AND NOT EXISTS(SELECT 1 FROM attempts WHERE plan_id=plans.id AND (dispatch_count>0 OR dispatched_at IS NOT NULL OR state IN ('dispatching','rate_limited','uncertain','confirmed')))":'';
        const stoppedPlan=`EXISTS(SELECT 1 FROM plans WHERE id=? AND workspace_id=? AND stopped=1 ${stopGuard})`;
        // The complete stop is one transaction. A refused guarded stop cannot
        // change attempts, even when the plan had already been stopped earlier.
        // Expired claims remain uncertain; live claims may still record a result.
        const updates=await db.batch([
          stmt(`UPDATE plans SET stopped=1 WHERE id=? AND workspace_id=? ${stopGuard}`,plan.id,ws.id),
          stmt(`UPDATE attempts SET error_message=CASE WHEN state='rate_limited' THEN 'The provider rejected the earlier request for rate limiting. Its queued retry was stopped; the cooldown still applies.' ELSE 'Stopped before this application was sent.' END,state='cancelled',error_code='stopped' WHERE workspace_id=? AND plan_id=? AND state IN ('ready','rate_limited') AND ${stoppedPlan}`,ws.id,plan.id,plan.id,ws.id),
          stmt(`UPDATE attempts SET state='uncertain',error_code='worker_interrupted',error_message='The dispatch lease expired without a durable provider result. No automatic resend occurred.' WHERE workspace_id=? AND plan_id=? AND state='dispatching' AND lease_expires_at<=? AND ${stoppedPlan}`,ws.id,plan.id,iso(),plan.id,ws.id),
        ]);
        if(guarded&&updates[0].meta.changes!==1)fail('review_already_approved','This review was already approved or dispatched. Refresh before deciding whether to stop it.',409);
        return response(200,{...await planReply(await planOwned(plan.id)),message:'Unsent work was stopped. An in-flight provider result will still be recorded.'});
      }
      if(route==='advance'&&request.method==='POST'){
        const body=object(await applicationBody(),['planId']),plan=await planOwned(body.planId),deadline=now()+15000;
        if(plan.stopped||Date.parse(plan.expires_at)<=now()||plan.profile_revision!==ws.revision||!plan.approval_generation)fail('approval_required','This review has no current approval to continue.',409);
        const work=(async()=>{
          await run("UPDATE attempts SET state='uncertain',error_code='worker_interrupted',error_message='An earlier dispatch did not record a durable result. Reconcile it before applying again.' WHERE workspace_id=? AND state='dispatching' AND lease_expires_at<=?",ws.id,iso());
          if(await first("SELECT id FROM attempts WHERE plan_id=? AND state='dispatching' LIMIT 1",plan.id))return;
          const row=await first("SELECT * FROM attempts WHERE plan_id=? AND (state='ready' OR (state='rate_limited' AND retry_at<=? AND approval_generation<? AND retry_at<=?)) ORDER BY created_at,id LIMIT 1",plan.id,iso(),plan.approval_generation,plan.last_approved_at);if(!row)return;
          const snapshot=JSON.parse(row.snapshot_json),matched=support(snapshot.job);
          const block=async(code,message)=>run("UPDATE attempts SET state='blocked',error_code=?,error_message=? WHERE id=? AND state IN ('ready','rate_limited')",code,message,row.id);
          if(row.dispatch_count>=3){await block('retry_limit','This application reached its dispatch limit. Complete it on the employer site.');return}
          if(!matched.supported||canonical(matched.requirements)!==canonical(snapshot.requirements)){await block('requirements_changed',matched.reason??'The employer requirements changed. Prepare another review.');return}
          if(snapshot.profile.email!==ws.owner_email){await block('email_not_verified','The application email must match your signed-in account.');return}
          let pdf;
          try{const latest=await adapter.posting(snapshot.job);if(latest.metadataHash!==snapshot.job.metadataHash){await block('posting_changed','The employer changed this posting. Add its link again and prepare another review.');return}const stored=await env.BUCKET.get(snapshot.profile.resume.objectKey);if(!stored)throw Error('missing-pdf');pdf=new Uint8Array(await stored.arrayBuffer());if(pdf.byteLength!==snapshot.profile.resume.size||sha256(pdf)!==snapshot.profile.resume.sha256)throw Error('pdf-integrity')}
          catch(error){await block(error instanceof ApplicationError?error.code:'preflight_failed',error instanceof ApplicationError?error.message:'The exact saved PDF and posting could not be verified. Nothing was sent.');return}
          if(now()>deadline-1000)return;
          const gateKey=`lever:${snapshot.job.region}:${snapshot.job.site.toLowerCase()}`;await run('INSERT OR IGNORE INTO dispatch_gates(key,next_at) VALUES(?,0)',gateKey);if((await run('UPDATE dispatch_gates SET next_at=? WHERE key=? AND next_at<=?',now()+1000,gateKey,now())).meta.changes!==1)return;
          const claim=randomUUID();
          let claimed;
          try{claimed=await run("UPDATE attempts SET state='dispatching',dispatched_at=?,dispatch_count=dispatch_count+1,approval_generation=(SELECT approval_generation FROM plans WHERE id=?),claim_token=?,lease_expires_at=?,error_code=NULL,error_message=NULL,retry_at=NULL WHERE id=? AND dispatch_count<3 AND (state='ready' OR (state='rate_limited' AND retry_at<=? AND approval_generation<(SELECT approval_generation FROM plans WHERE id=?) AND retry_at<=(SELECT last_approved_at FROM plans WHERE id=?))) AND EXISTS(SELECT 1 FROM plans p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=? AND p.workspace_id=? AND p.stopped=0 AND p.expires_at>? AND p.approval_generation>0 AND p.profile_revision=w.revision AND w.owner_email=? AND w.deleting_at IS NULL) AND NOT EXISTS(SELECT 1 FROM attempts other WHERE other.id<>attempts.id AND other.job_key=attempts.job_key AND (other.workspace_id=attempts.workspace_id OR other.applicant_hash=attempts.applicant_hash) AND (other.state IN ('dispatching','confirmed','uncertain','rate_limited') OR other.retry_at>?))",iso(),plan.id,claim,new Date(now()+45000).toISOString(),row.id,iso(),plan.id,plan.id,plan.id,ws.id,iso(),snapshot.profile.email,iso())}catch{claimed=null}
          if(claimed?.meta.changes!==1){const prior=await duplicate(row.applicant_hash,row.job_key,row.id);if(prior)await block('duplicate_application',duplicateReason(prior));return}
          let outcome;
          try{outcome=await adapter.submit(snapshot.job,snapshot,matched.connector,pdf,{timeoutMs:Math.max(1,Math.min(8000,deadline-now()))})}catch{outcome={state:'uncertain',error:{code:'unconfirmed_transport',message:'The provider outcome is unknown. Reconcile before applying again.'}}}
          try{await run("UPDATE attempts SET state=?,application_id=?,response_hash=?,confirmed_at=?,error_code=?,error_message=?,retry_at=?,lease_expires_at=NULL WHERE id=? AND claim_token=? AND state='dispatching'",outcome.state,outcome.applicationId??null,outcome.responseSHA256??null,outcome.state==='confirmed'?iso():null,outcome.error?.code??null,outcome.error?.message??null,outcome.retryDelay?new Date(now()+outcome.retryDelay).toISOString():null,row.id,claim)}catch{try{await run("UPDATE attempts SET state='uncertain',error_code='result_persistence_failed',error_message='The provider result could not be recorded durably. Reconcile this attempt before applying again.' WHERE id=? AND claim_token=? AND state='dispatching'",row.id,claim)}catch{}}
        })();
        if(typeof ctx.waitUntil==='function')ctx.waitUntil(work.catch(()=>{}));await work;
        return response(200,await planReply(await planOwned(plan.id)));
      }
      fail('not_found','This application endpoint or method is not supported.',404);
    } catch(error) {
      return response(error instanceof ApplicationError?error.status:503,{ok:false,error:{code:error instanceof ApplicationError?error.code:'storage_or_service_error',message:error instanceof ApplicationError?error.message:'The operation could not be completed. Refresh the account or application status before retrying.'}});
    }
  };
}

export const handleApplications=createHostedApplicationHandler();
