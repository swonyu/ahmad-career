import {assertReadablePDF} from './pdf-readability.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,createHmac,timingSafeEqual} from 'node:crypto';
import {ApplicationError,fail,object,text,canonical,sha256,publicURL,leverTarget,profile as validateProfile,safeProfile,answers as validateAnswers,requiredProfile,country,applicantName} from './validation.mjs';
import {loadConfiguration,connectorFor,requirementsError,makeAdapter} from './lever.mjs';
import {pairingSchema,issuePairingCode,normalizePairingCode} from './pairing.mjs';

const API='/api/apply/';
const MAX_BODY=7*1024*1024+32768;
const blankProfile={firstName:'',lastName:'',email:'',phone:'',city:'',country:'',headline:'',skills:[],targetRoles:[],targetCountries:[],workModes:[],experienceLevel:'any',website:'',linkedin:'',resume:null};
const json=value=>JSON.stringify(value);
function equals(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b))}
function jsonBody(req) {
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']??''))fail('json_required','Use application/json for application requests.',415);
  const declared=Number(req.headers['content-length']??0);if(!Number.isFinite(declared)||declared>MAX_BODY)fail('body_too_large','This request exceeds the résumé upload limit.',413);
  return new Promise((resolve,reject)=>{
    let size=0,parts=[],finished=false;
    const bad=e=>{if(!finished){finished=true;parts=[];reject(e)}};
    req.on('data',part=>{size+=part.length;if(size>MAX_BODY){bad(new ApplicationError('body_too_large','This request exceeds the résumé upload limit.',413));return}if(!finished)parts.push(part)});
    req.on('end',()=>{if(finished)return;finished=true;try{resolve(JSON.parse(Buffer.concat(parts).toString('utf8')))}catch{reject(new ApplicationError('invalid_json','The request body is not valid JSON.',400))}});
    req.on('error',()=>bad(new ApplicationError('request_interrupted','The request was interrupted.',400)));
  });
}
function assertID(id,label='Identifier'){if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))fail('invalid_identifier',`${label} is invalid.`);return id}
function acquireLock(directory) {
  const lock=path.join(directory,'service.lock');const marker=randomUUID();
  const contents=json({pid:process.pid,marker});
  for(let attempt=0;attempt<2;attempt++) {
    try {const fd=fs.openSync(lock,'wx',0o600);fs.writeFileSync(fd,contents);fs.fsyncSync(fd);fs.closeSync(fd);return()=>{try{const current=JSON.parse(fs.readFileSync(lock,'utf8'));if(current.marker===marker)fs.unlinkSync(lock)}catch{}}}
    catch(error) {
      if(error.code!=='EEXIST')throw error;
      let previous;try{previous=JSON.parse(fs.readFileSync(lock,'utf8'))}catch{fail('ledger_locked','The application ledger has an unreadable process lock; inspect it before starting another service.',503)}
      if(!Number.isInteger(previous.pid)||previous.pid<=0)fail('ledger_locked','The application ledger lock requires manual inspection.',503);
      let alive=true;try{process.kill(previous.pid,0)}catch(e){if(e.code==='ESRCH')alive=false}
      if(alive)fail('ledger_locked','Another application service already owns this ledger.',503);
      try{if(fs.readFileSync(lock,'utf8')===json(previous))fs.unlinkSync(lock);else fail('ledger_locked','The application ledger lock changed; restart after checking the running service.',503)}catch(e){if(e.code!=='ENOENT')throw e}
    }
  }
  fail('ledger_locked','The application ledger is already in use.',503);
}

/** Personal, loopback-only companion. No request can choose a provider key or POST host. */
export function createApplicationService({dataDir,configPath=process.env.CAREER_APPLY_CONFIG,origin='http://127.0.0.1:8778',env=process.env,testOnly,clock=Date.now,hooks={}}={}) {
  const adapter=makeAdapter({testOnly,env});
  let originURL;try{originURL=new URL(origin)}catch{fail('invalid_origin','A loopback HTTP origin is required.',500)}
  // The isolated Android acceptance runner binds to host loopback; 10.0.2.2 is the emulator's host alias.
  const emulatorTLS=adapter.mode==='test'&&testOnly?.allowEmulatorTLS===true&&originURL.protocol==='https:'&&originURL.hostname==='10.0.2.2'&&Number.isInteger(Number(originURL.port))&&Number(originURL.port)>=1024&&Number(originURL.port)<=65535;
  if(originURL.origin!==origin||originURL.username||originURL.password||!(originURL.protocol==='http:'&&originURL.hostname==='127.0.0.1'||emulatorTLS||originURL.protocol==='https:'&&publicURL(origin)))fail('invalid_origin','Use the exact loopback HTTP origin or a public HTTPS gateway origin.',500);
  const directory=path.resolve(dataDir??path.join(process.cwd(),'.career-applications'));
  const webRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../web');
  if(directory===webRoot||directory.startsWith(webRoot+path.sep))fail('unsafe_storage','Application storage must be outside public assets.',500);
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  if(fs.lstatSync(directory).isSymbolicLink())fail('unsafe_storage','The application storage directory cannot be a symlink.',500);
  const realDirectory=fs.realpathSync(directory),realWebRoot=fs.existsSync(webRoot)?fs.realpathSync(webRoot):webRoot;
  if(realDirectory===realWebRoot||realDirectory.startsWith(realWebRoot+path.sep))fail('unsafe_storage','Application storage cannot resolve inside public assets.',500);
  fs.chmodSync(directory,0o700);
  const releaseLock=acquireLock(directory);
  let db;
  try{
    const dbPath=path.join(directory,'applications.sqlite');
    for(const file of [dbPath,dbPath+'-wal',dbPath+'-shm'])if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())fail('unsafe_storage','The ledger database and journals cannot be symlinks.',500);
    db=new DatabaseSync(dbPath);fs.chmodSync(dbPath,0o600);
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, session_hash TEXT UNIQUE NOT NULL, csrf TEXT NOT NULL, created_at TEXT NOT NULL, profile_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), job_key TEXT NOT NULL, data_json TEXT NOT NULL, UNIQUE(workspace_id,job_key));
      CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), digest TEXT NOT NULL, profile_revision INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, stopped INTEGER NOT NULL DEFAULT 0, approved_at TEXT, items_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES plans(id), workspace_id TEXT NOT NULL REFERENCES workspaces(id), applicant_hash TEXT NOT NULL, job_key TEXT NOT NULL, job_id TEXT NOT NULL, state TEXT NOT NULL, snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL, dispatched_at TEXT, confirmed_at TEXT, application_id TEXT, response_hash TEXT, error_code TEXT, error_message TEXT, retry_at TEXT, dispatch_count INTEGER NOT NULL DEFAULT 0, mode TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS attempt_plan ON attempts(plan_id);
      -- Applicant email is editable and unverified in this operator-managed companion.
      -- Remove the legacy cross-workspace constraint without removing any records.
      DROP INDEX IF EXISTS active_applicant_job;
      CREATE UNIQUE INDEX IF NOT EXISTS active_workspace_job ON attempts(workspace_id,job_key) WHERE state IN ('dispatching','confirmed','uncertain');`);
    db.exec(pairingSchema);
    const oldMode=db.prepare('SELECT value FROM meta WHERE key=?').get('mode')?.value;
    if(oldMode&&oldMode!==adapter.mode)fail('mode_mismatch','Test and real application workspaces cannot share a ledger directory.',500);
    db.prepare('INSERT OR IGNORE INTO meta(key,value) VALUES(?,?)').run('mode',adapter.mode);
    db.prepare('INSERT OR IGNORE INTO meta(key,value) VALUES(?,?)').run('identity_salt',randomBytes(32).toString('hex'));
    db.prepare("UPDATE attempts SET state='uncertain',error_code='service_restarted',error_message='The service restarted before a durable provider result was recorded. Reconcile this attempt before applying again.' WHERE state='dispatching'").run();
    for(const name of ['applications.sqlite-wal','applications.sqlite-shm']){const f=path.join(directory,name);if(fs.existsSync(f))fs.chmodSync(f,0o600)}
    loadConfiguration(configPath,env);
  }catch(error){try{db?.close()}catch{}releaseLock();throw error}
  const salt=db.prepare('SELECT value FROM meta WHERE key=?').get('identity_salt').value;
  const active=new Map();let serial=Promise.resolve(),closed=false,lastDispatchAt=0;
  let pairingAttempts=[];
  const now=()=>clock();const iso=()=>new Date(now()).toISOString();
  const config=()=>loadConfiguration(configPath,env);
  const identity=email=>createHmac('sha256',salt).update(email.trim().toLowerCase()).digest('hex');
  function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result}catch(error){try{db.exec('ROLLBACK')}catch{}throw error}}
  function send(res,status,data,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...extra});res.end(json(data))}
  function validRequest(req,mutation=false,bootstrap=false) {
    if(req.headers.host!==originURL.host)fail('host_denied','The application companion accepts only its exact local address.',403);
    if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!==origin)fail('origin_denied','This request did not come from the Career Finder workspace.',403);
    const bearer=typeof req.headers.authorization==='string'&&req.headers.authorization.startsWith('Bearer ');
    if(mutation&&!bootstrap&&req.headers.origin!==origin&&!bearer)fail('origin_denied','Changes require an exact workspace Origin or an authenticated mobile session.',403);
    if(mutation&&!bootstrap&&!bearer&&!req.headers['x-career-csrf'])fail('csrf_denied','Refresh this workspace before making changes.',403);
  }
  function session(req,required=true) {
    if(req.headers.authorization!==undefined) {
      const bearer=req.headers.authorization.match(/^Bearer ([a-f0-9]{64})$/);
      const s=bearer?db.prepare('SELECT * FROM native_sessions WHERE token_hash=? AND expires_at>?').get(sha256(bearer[1]),iso()):null;
      const ws=s?db.prepare('SELECT * FROM workspaces WHERE id=?').get(s.workspace_id):null;
      if(!ws&&required)fail('session_required','Your mobile session expired or is invalid. Pair this phone again.',401);
      return ws?{...ws,native:true}:undefined;
    }
    const match=(req.headers.cookie??'').match(/(?:^|;\s*)career_apply_session=([a-f0-9]{64})(?:;|$)/);
    const row=match?db.prepare('SELECT * FROM workspaces WHERE session_hash=?').get(sha256(match[1])):undefined;
    if(!row&&required)fail('session_required','Open a private Career Finder workspace first.',401);
    return row;
  }
  function csrf(req,workspace){if(!workspace.native&&!equals(req.headers['x-career-csrf'],workspace.csrf))fail('csrf_denied','The workspace security token is invalid. Refresh the page.',403)}
  function readJob(id,workspace){const row=db.prepare('SELECT * FROM jobs WHERE id=? AND workspace_id=?').get(id,workspace);if(!row)fail('job_not_found','This opportunity is not in your workspace.',404);return {...JSON.parse(row.data_json),id:row.id};}
  function support(job,conf=config()) {return job.provider==='lever'?connectorFor(conf,job,env,now()):{supported:false,reason:'This employer uses a manual application form. Open the employer site to apply.'}}
  function jobView(job,conf=config()){const s=support(job,conf);return {...job,submissionSupported:s.supported,reason:s.reason??'',provider:job.provider??'manual'};}
  function capabilities(){const conf=config();return {mode:adapter.mode,liveEnabled:adapter.mode==='local'&&conf.connectors.some(c=>env[c.apiKeyEnv]&&Object.entries(c.postings).some(([postingId])=>connectorFor(conf,{...c,postingId},env,now()).supported)),providers:conf.connectors.map(c=>({provider:'lever',region:c.region,site:c.site,connected:Boolean(env[c.apiKeyEnv]),reviewedPostingCount:Object.entries(c.postings).filter(([postingId])=>connectorFor(conf,{...c,postingId},env,now()).supported).length})),coverage:'Only employer-authorized integrations with current reviewed posting requirements can submit automatically.',storage:'Private local browser workspace',linkedinProfile:true,maxResumeBytes:5*1024*1024};}
  function attemptView(row){const s=JSON.parse(row.snapshot_json);return {id:row.id,attemptId:row.id,planId:row.plan_id,jobId:row.job_id,provider:s.job.provider,region:s.job.region,employerSite:s.job.site,site:s.job.site,postingId:s.job.postingId,company:s.job.company,title:s.job.title,url:s.job.url,state:row.state,createdAt:row.created_at,dispatchedAt:row.dispatched_at,confirmedAt:row.confirmed_at,...(row.state==='confirmed'?{applicationId:row.application_id}:{}),profileRevision:s.profileRevision,resumeSHA256:s.profile.resume?.sha256??null,payloadSHA256:s.payloadSHA256,requirementsRevision:s.requirements?.revision??null,responseSHA256:row.response_hash,mode:row.mode,evidenceMode:row.mode==='test'?'test':'live',...(row.retry_at?{retryAt:row.retry_at}:{}),dispatchCount:row.dispatch_count,error:row.error_code?{code:row.error_code,message:row.error_message}:null};}
  function attemptsFor(workspace,planId){const rows=planId?db.prepare('SELECT * FROM attempts WHERE workspace_id=? AND plan_id=? ORDER BY created_at,id').all(workspace,planId):db.prepare('SELECT * FROM attempts WHERE workspace_id=? ORDER BY created_at DESC,id').all(workspace);return rows.map(attemptView);}
  function planView(row){const attempts=new Map(db.prepare('SELECT * FROM attempts WHERE plan_id=?').all(row.id).map(r=>[r.id,r]));return {id:row.id,digest:row.digest,profileRevision:row.profile_revision,createdAt:row.created_at,expiresAt:row.expires_at,stopped:Boolean(row.stopped),approvedAt:row.approved_at,items:JSON.parse(row.items_json).map(item=>{const a=attempts.get(item.attemptId);return a?{...item,state:a.state,reason:a.error_message??item.reason,applicationId:a.state==='confirmed'?a.application_id:undefined,retryAt:a.retry_at}:item})};}
  function workspaceView(ws){const conf=config();return {ok:true,mode:adapter.mode,workspaceId:ws.id,profile:safeProfile(JSON.parse(ws.profile_json),ws.revision),jobs:db.prepare('SELECT * FROM jobs WHERE workspace_id=? ORDER BY rowid DESC').all(ws.id).map(r=>jobView({...JSON.parse(r.data_json),id:r.id},conf)),attempts:attemptsFor(ws.id),capabilities:capabilities(),recoverablePlans:db.prepare("SELECT p.* FROM plans p WHERE p.workspace_id=? AND p.stopped=0 AND p.expires_at>? AND p.profile_revision=? AND EXISTS(SELECT 1 FROM attempts a WHERE a.plan_id=p.id AND a.state IN ('ready','rate_limited')) ORDER BY p.rowid DESC LIMIT 20").all(ws.id,iso(),ws.revision).map(planView),activePlanIds:[...active.keys()].filter(id=>db.prepare('SELECT workspace_id FROM plans WHERE id=?').get(id)?.workspace_id===ws.id)};}
  function duplicate(workspaceId,jobKey,except='') {return db.prepare("SELECT id,state,retry_at,error_code FROM attempts WHERE job_key=? AND workspace_id=? AND id<>? AND (state IN ('dispatching','confirmed','uncertain','rate_limited') OR retry_at>? OR error_code='provider_cooldown_unknown') LIMIT 1").get(jobKey,workspaceId,except,iso())}
  function retireExpiredRateLimits(workspaceId,jobKey) {
    const rows=db.prepare("SELECT a.id,a.retry_at,p.expires_at,p.stopped,p.profile_revision,w.revision FROM attempts a JOIN plans p ON p.id=a.plan_id JOIN workspaces w ON w.id=a.workspace_id WHERE a.job_key=? AND a.workspace_id=? AND a.state='rate_limited'").all(jobKey,workspaceId);
    for(const row of rows)if(Date.parse(row.retry_at)<=now()&&(Date.parse(row.expires_at)<=now()||row.stopped||row.profile_revision!==row.revision))db.prepare("UPDATE attempts SET state='cancelled',error_code='review_replaced_after_cooldown',error_message='The provider had rejected this attempt for rate limiting. Its cooldown ended and an expired or changed review was replaced. No automatic resend occurred.' WHERE id=? AND state='rate_limited'").run(row.id);
  }
  const unknownCooldownReason='The provider rejected the earlier request for rate limiting, but its waiting period could not be read safely. Reconcile with the employer before any new attempt.';
  function reasonForDuplicate(d){return d.state==='confirmed'?'This applicant already has a confirmed application for this posting.':d.error_code==='provider_cooldown_unknown'?unknownCooldownReason:d.state==='rate_limited'?'An earlier approved attempt is waiting for the provider cooldown. Continue that review instead of preparing a duplicate.':d.retry_at&&Date.parse(d.retry_at)>now()?`The provider cooldown remains active until ${d.retry_at}, even though its queued retry was stopped. Wait until then before preparing another application.`:'An earlier attempt for this applicant and posting is active or unconfirmed. Reconcile it before applying again.'}
  function setOutcome(id,outcome){db.prepare('UPDATE attempts SET state=?,application_id=?,response_hash=?,confirmed_at=?,error_code=?,error_message=?,retry_at=? WHERE id=?').run(outcome.state,outcome.applicationId??null,outcome.responseSHA256??null,outcome.state==='confirmed'?iso():null,outcome.error?.code??null,outcome.error?.message??null,outcome.retryDelay?new Date(now()+outcome.retryDelay).toISOString():null,id)}
  function cancelPending(planId) {
    // Stopping queued work must not erase an earlier provider response or turn
    // an unreadable waiting period into permission to prepare another attempt.
    db.prepare("UPDATE attempts SET error_message=CASE WHEN error_code='provider_cooldown_unknown' THEN ? WHEN state='rate_limited' THEN 'The provider rejected the earlier request for rate limiting. Its queued retry was stopped; the cooldown still applies.' ELSE 'Stopped before this application was sent.' END,state='cancelled',error_code=CASE WHEN error_code='provider_cooldown_unknown' THEN error_code ELSE 'stopped' END WHERE plan_id=? AND state IN ('ready','rate_limited')").run('Its queued retry was stopped. '+unknownCooldownReason,planId);
  }
  function setPendingOutcome(id,outcome) {
    const current=db.prepare('SELECT a.state,a.plan_id,p.stopped FROM attempts a JOIN plans p ON p.id=a.plan_id WHERE a.id=?').get(id);
    if(current?.stopped){cancelPending(current.plan_id);return}
    if(current&&['ready','rate_limited'].includes(current.state))setOutcome(id,outcome);
  }
  async function runPlan(planId) {
    const rows=db.prepare("SELECT id FROM attempts WHERE plan_id=? AND state IN ('ready','rate_limited') ORDER BY created_at,id").all(planId);
    for(const {id} of rows) {
      if(closed)break;
      let row=db.prepare('SELECT * FROM attempts WHERE id=?').get(id),plan=db.prepare('SELECT * FROM plans WHERE id=?').get(planId);
      if(plan.stopped){cancelPending(planId);continue}
      if(!['ready','rate_limited'].includes(row.state))continue;
      if(row.state==='rate_limited'&&(!row.retry_at||!Number.isFinite(Date.parse(row.retry_at))||Date.parse(row.retry_at)>now()))continue;
      if(row.dispatch_count>=3){setOutcome(id,{state:'blocked',error:{code:'retry_limit',message:'This application reached its automatic retry limit. Complete it on the employer site.'}});continue}
      const snapshot=JSON.parse(row.snapshot_json),ws=db.prepare('SELECT * FROM workspaces WHERE id=?').get(row.workspace_id);
      if(Date.parse(plan.expires_at)<=now()||ws.revision!==plan.profile_revision){setOutcome(id,{state:'blocked',error:{code:'stale_review',message:'Your profile or review changed. Prepare a new application review.'}});continue}
      let matched;
      try {
        matched=support(snapshot.job);
        if(!matched.supported||canonical(matched.requirements)!==canonical(snapshot.requirements)){setOutcome(id,{state:'blocked',error:{code:'requirements_changed',message:matched.reason??'The employer requirements changed. Prepare a new review.'}});continue}
        await assertReadablePDF(Buffer.from(snapshot.profile.resume.dataBase64,'base64'));
        const latest=await adapter.posting(snapshot.job);
        if(latest.metadataHash!==snapshot.job.metadataHash){setPendingOutcome(id,{state:'blocked',error:{code:'posting_changed',message:'The employer changed this posting. Add its link again and prepare a fresh review.'}});continue}
      } catch(error) {setPendingOutcome(id,{state:'blocked',error:{code:error instanceof ApplicationError?error.code:'preflight_failed',message:error instanceof ApplicationError?error.message:'The current posting could not be checked. Nothing was sent.'}});continue}
      if(adapter.mode==='local'&&lastDispatchAt){const wait=1000-(Date.now()-lastDispatchAt);if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait))}
      let claimed=false;
      try {
        claimed=transaction(()=>{
          const current=db.prepare('SELECT * FROM attempts WHERE id=?').get(id),freshPlan=db.prepare('SELECT * FROM plans WHERE id=?').get(planId),freshWs=db.prepare('SELECT revision FROM workspaces WHERE id=?').get(row.workspace_id);
          if(freshPlan.stopped){cancelPending(planId);return false}
          if(!['ready','rate_limited'].includes(current.state))return false;
          if(freshWs.revision!==freshPlan.profile_revision||Date.parse(freshPlan.expires_at)<=now()){setOutcome(id,{state:'blocked',error:{code:'review_invalidated',message:'The application review is no longer current.'}});return false}
          const currentSupport=support(snapshot.job);
          if(!currentSupport.supported||canonical(currentSupport.requirements)!==canonical(snapshot.requirements)){setOutcome(id,{state:'blocked',error:{code:'requirements_changed',message:currentSupport.reason??'The employer requirements changed. Prepare a new review.'}});return false}
          matched=currentSupport;
          const prior=duplicate(row.workspace_id,row.job_key,id);
          if(prior){setOutcome(id,{state:'blocked',error:{code:'duplicate_application',message:reasonForDuplicate(prior)}});return false}
          hooks.beforeDispatchCommit?.({attemptId:id});
          db.prepare("UPDATE attempts SET state='dispatching',dispatched_at=?,dispatch_count=dispatch_count+1,error_code=NULL,error_message=NULL,retry_at=NULL WHERE id=?").run(iso(),id);
          return true;
        });
      }catch{try{setOutcome(id,{state:'blocked',error:{code:'persistence_failed',message:'The intent could not be saved safely. No application was sent.'}})}catch{}continue}
      if(!claimed)continue;
      lastDispatchAt=Date.now();
      let result;
      try {result=await adapter.submit(snapshot.job,snapshot,matched.connector)}catch{result={state:'uncertain',error:{code:'unconfirmed_transport',message:'The provider outcome is unknown. Reconcile this attempt before applying again.'}}}
      try {hooks.beforeResultCommit?.({attemptId:id,result});transaction(()=>{setOutcome(id,result);if(db.prepare('SELECT stopped FROM plans WHERE id=?').get(planId).stopped)cancelPending(planId)})}
      catch {try{setOutcome(id,{state:'uncertain',error:{code:'result_persistence_failed',message:'The provider result could not be saved durably. Reconcile this attempt before applying again.'}})}catch{}}
    }
  }
  function launch(planId) {if(active.has(planId))return;const work=serial.then(()=>runPlan(planId));active.set(planId,work);serial=work.catch(()=>{});work.catch(()=>{}).finally(()=>active.delete(planId));}

  async function handle(req,res) {
    let pathname;try{pathname=new URL(req.url,origin).pathname}catch{return false}
    if(!pathname.startsWith(API))return false;
    try{
      if(closed)fail('service_closed','The application service is stopping.',503);
      const route=pathname.slice(API.length),mutation=!['GET','HEAD'].includes(req.method);
      validRequest(req,mutation,route==='session');
      if(route==='status'&&req.method==='GET'){send(res,200,{ok:true,...capabilities()});return true}
      if(route==='session'&&req.method==='POST') {
        const body=object(await jsonBody(req),['pairingCode']);
        if(body.pairingCode!==undefined) {
          pairingAttempts=pairingAttempts.filter(t=>t>now()-60000);
          if(pairingAttempts.length>=5)fail('pairing_rate_limited','Too many pairing attempts. Wait one minute before trying again.',429);
          pairingAttempts.push(now());
          const normalized=normalizePairingCode(body.pairingCode);
          if(!normalized)fail('invalid_pairing_code','The pairing code is invalid, expired, or already used.',401);
          const result=transaction(()=>{
            const code=db.prepare('SELECT * FROM pairing_codes WHERE code_hash=? AND expires_at>?').get(sha256(normalized),iso());
            if(!code)fail('invalid_pairing_code','The pairing code is invalid, expired, or already used.',401);
            const token=randomBytes(32).toString('hex'),expiresAt=new Date(now()+30*86400000).toISOString();let workspaceId=code.workspace_id;
            if(!workspaceId){workspaceId=randomUUID();db.prepare('INSERT INTO workspaces(id,session_hash,csrf,created_at,profile_json) VALUES(?,?,?,?,?)').run(workspaceId,sha256(randomBytes(32)),randomBytes(32).toString('hex'),iso(),json(blankProfile))}
            db.prepare('DELETE FROM pairing_codes WHERE code_hash=?').run(sha256(normalized));
            db.prepare('INSERT INTO native_sessions(token_hash,workspace_id,created_at,expires_at) VALUES(?,?,?,?)').run(sha256(token),workspaceId,iso(),expiresAt);
            const workspace=db.prepare('SELECT * FROM workspaces WHERE id=?').get(workspaceId);
            return {ok:true,workspaceId,sessionToken:token,expiresAt,profile:safeProfile(JSON.parse(workspace.profile_json),workspace.revision)};
          });
          send(res,200,result);return true;
        }
        if(originURL.protocol!=='http:'||originURL.hostname!=='127.0.0.1'||req.headers.origin!==origin)fail('origin_denied','Browser workspace creation is local-only; phones require a one-use pairing code.',403);
        let ws=session(req,false),cookie;
        if(!ws){const token=randomBytes(32).toString('hex'),id=randomUUID(),csrfToken=randomBytes(32).toString('hex');db.prepare('INSERT INTO workspaces(id,session_hash,csrf,created_at,profile_json) VALUES(?,?,?,?,?)').run(id,sha256(token),csrfToken,iso(),json(blankProfile));ws=db.prepare('SELECT * FROM workspaces WHERE id=?').get(id);cookie=`career_apply_session=${token}; HttpOnly; SameSite=Strict; Path=/api/apply/; Max-Age=31536000`}
        send(res,200,{ok:true,workspaceId:ws.id,csrfToken:ws.csrf},cookie?{'Set-Cookie':cookie}:{});return true;
      }
      const ws=session(req);if(mutation)csrf(req,ws);
      if(route==='session/revoke'&&req.method==='POST') {
        object(await jsonBody(req),[]);
        if(!ws.native)fail('native_session_required','Only an authenticated mobile session can use this route.',403);
        const token=req.headers.authorization.slice('Bearer '.length);
        db.prepare('DELETE FROM native_sessions WHERE token_hash=? AND workspace_id=?').run(sha256(token),ws.id);
        send(res,200,{ok:true,message:'This phone session has been revoked. Saved application records remain in the workspace.'});return true;
      }
      if(route==='workspace'&&req.method==='GET'){send(res,200,workspaceView(ws));return true}
      if(route==='profile'&&req.method==='PUT') {
        const body=object(await jsonBody(req),['expectedRevision','profile']);
        if(!Number.isInteger(body.expectedRevision)||body.expectedRevision!==ws.revision)fail('stale_profile','Your profile changed in another tab. Reload before saving.',409);
        const p=validateProfile(body.profile,JSON.parse(ws.profile_json));
        if(p.resume)await assertReadablePDF(Buffer.from(p.resume.dataBase64,'base64'));
        const result=db.prepare('UPDATE workspaces SET profile_json=?,revision=revision+1 WHERE id=? AND revision=?').run(json(p),ws.id,body.expectedRevision);
        if(result.changes!==1)fail('stale_profile','Your profile changed in another tab. Reload before saving.',409);
        send(res,200,{ok:true,profile:safeProfile(p,ws.revision+1)});return true;
      }
      if(route==='jobs'&&req.method==='POST') {
        const body=object(await jsonBody(req),['url','title','company','location','country']);
        const url=publicURL(body.url),target=leverTarget(url);let job;
        if(target)job=await adapter.posting(target);
        else {const identityURL=new URL(url);for(const key of [...identityURL.searchParams.keys()])if(/^utm_/i.test(key)||['gclid','fbclid'].includes(key))identityURL.searchParams.delete(key);identityURL.searchParams.sort();job={provider:'manual',key:'manual:'+sha256(identityURL.origin+identityURL.pathname.replace(/\/$/,'')+identityURL.search),url,title:text(body.title,'Job title',500,false),company:text(body.company,'Employer',250,false),location:text(body.location,'Job location',500),country:country(body.country),region:null,site:null,postingId:null,workMode:'',metadataHash:null};}
        const existing=db.prepare('SELECT id FROM jobs WHERE workspace_id=? AND job_key=?').get(ws.id,job.key),id=existing?.id??randomUUID();
        if(existing)db.prepare('UPDATE jobs SET data_json=? WHERE id=? AND workspace_id=?').run(json(job),id,ws.id);else db.prepare('INSERT INTO jobs(id,workspace_id,job_key,data_json) VALUES(?,?,?,?)').run(id,ws.id,job.key,json(job));
        send(res,existing?200:201,{ok:true,job:jobView({...job,id})});return true;
      }
      if(route==='prepare'&&req.method==='POST') {
        const body=object(await jsonBody(req),['jobIds','answers','manualAppliedJobIds','reviewSchema']);
        if(!Array.isArray(body.jobIds)||!body.jobIds.length||body.jobIds.length>20||new Set(body.jobIds).size!==body.jobIds.length)fail('invalid_selection','Select between one and twenty distinct opportunities.');
        for(const id of body.jobIds)assertID(id,'Job identifier');
        if(body.reviewSchema!==undefined&&body.reviewSchema!==3)fail('invalid_review_schema','Use the current application review format.');
        const answerMap=body.answers??{};object(answerMap,body.jobIds,'Answer map');
        const manualIds=body.manualAppliedJobIds??[];if(!Array.isArray(manualIds)||manualIds.some(id=>!body.jobIds.includes(id)))fail('invalid_selection','Manual application references must belong to the selected opportunities.');
        const p=JSON.parse(ws.profile_json),planId=randomUUID(),createdAt=iso(),expiresAt=new Date(now()+30*60000).toISOString(),conf=config(),items=[],attemptRows=[];
        for(const id of body.jobIds) {
          const job=readJob(id,ws.id),answer=validateAnswers(answerMap[id]??{}),matched=support(job,conf),applicantHash=identity(p.email);
          retireExpiredRateLimits(ws.id,job.key);
          const prior=duplicate(ws.id,job.key);
          let reason=manualIds.includes(id)?'Your tracker already records this application. Reconcile it before applying again.':prior?reasonForDuplicate(prior):requiredProfile(p)||(p.linkedin&&body.reviewSchema!==3?'Update Career Finder to review the LinkedIn profile link before approving this application.':null)||(!matched.supported?matched.reason:requirementsError(p,answer,matched.requirements));
          const payloadSummary={name:applicantName(p),email:p.email,phone:p.phone,website:p.website,...(p.linkedin?{linkedin:p.linkedin}:{}),comments:answer.comments,...(answer.consentStore===undefined?{}:{consentStore:answer.consentStore}),...(answer.consentMarketing===undefined?{}:{consentMarketing:answer.consentMarketing})};
          const item={jobId:id,job:{id,title:job.title,company:job.company,url:job.url,location:job.location,country:job.country},title:job.title,company:job.company,state:reason?'blocked':'ready',reason:reason??'',payloadSummary,resume:safeProfile(p,ws.revision).resume,privacyPolicyUrl:matched.requirements?.privacyPolicyUrl??null,requirementsRevision:matched.requirements?.revision??null};
          if(!reason){const attemptId=randomUUID(),snapshot={job,profile:p,profileRevision:ws.revision,answers:answer,requirements:matched.requirements,mode:adapter.mode};snapshot.payloadSHA256=sha256(canonical({jobKey:job.key,profile:p,answers:answer,requirements:matched.requirements}));item.attemptId=attemptId;attemptRows.push({id:attemptId,job,applicantHash,snapshot})}
          items.push(item);
        }
        const digest=sha256(canonical({planId,workspaceId:ws.id,profileRevision:ws.revision,createdAt,expiresAt,items,snapshots:attemptRows.map(a=>a.snapshot.payloadSHA256)}));
        transaction(()=>{db.prepare('INSERT INTO plans(id,workspace_id,digest,profile_revision,created_at,expires_at,items_json) VALUES(?,?,?,?,?,?,?)').run(planId,ws.id,digest,ws.revision,createdAt,expiresAt,json(items));for(const a of attemptRows)db.prepare('INSERT INTO attempts(id,plan_id,workspace_id,applicant_hash,job_key,job_id,state,snapshot_json,created_at,mode) VALUES(?,?,?,?,?,?,?,?,?,?)').run(a.id,planId,ws.id,a.applicantHash,a.job.key,a.job.id,'ready',json(a.snapshot),createdAt,adapter.mode)});
        send(res,201,{ok:true,plan:planView(db.prepare('SELECT * FROM plans WHERE id=?').get(planId))});return true;
      }
      if(route==='submit'&&req.method==='POST') {
        const body=object(await jsonBody(req),['planId','digest','approved','reviewSchema']);assertID(body.planId,'Plan identifier');
        const plan=db.prepare('SELECT * FROM plans WHERE id=? AND workspace_id=?').get(body.planId,ws.id);if(!plan)fail('plan_not_found','This review is not in your workspace.',404);
        if(body.reviewSchema!==undefined&&body.reviewSchema!==3)fail('invalid_review_schema','Use the current application review format.');
        if(JSON.parse(plan.items_json).some(item=>item.payloadSummary?.linkedin)&&body.reviewSchema!==3)fail('review_update_required','Update Career Finder to review the exact LinkedIn profile link before approving this application.',409);
        if(body.approved!==true||!equals(body.digest,plan.digest))fail('approval_required','Approve the exact current application review before submitting.',409);
        if(plan.stopped||Date.parse(plan.expires_at)<=now()||ws.revision!==plan.profile_revision)fail('stale_review','This review has expired, stopped, or changed. Prepare a new review.',409);
        const pending=db.prepare("SELECT * FROM attempts WHERE plan_id=? AND state IN ('ready','rate_limited')").all(plan.id);
        const eligible=pending.filter(a=>a.state==='ready'||Date.parse(a.retry_at)<=now());
        if(!eligible.length&&!active.has(plan.id)) {
          if(pending.some(a=>a.error_code==='provider_cooldown_unknown'))fail('provider_cooldown_unknown',unknownCooldownReason,409);
          if(pending.length)fail('cooldown_active','Wait for the provider cooldown before retrying the same review.',409);
          send(res,200,{ok:true,plan:planView(plan),attempts:attemptsFor(ws.id,plan.id)});return true;
        }
        db.prepare('UPDATE plans SET approved_at=COALESCE(approved_at,?) WHERE id=?').run(iso(),plan.id);
        launch(plan.id);send(res,202,{ok:true,plan:planView(db.prepare('SELECT * FROM plans WHERE id=?').get(plan.id)),attempts:attemptsFor(ws.id,plan.id)});return true;
      }
      if(route==='stop'&&req.method==='POST') {
        const body=object(await jsonBody(req),['planId','onlyIfUnapproved']);assertID(body.planId,'Plan identifier');
        if(body.onlyIfUnapproved!==undefined&&typeof body.onlyIfUnapproved!=='boolean')fail('invalid_stop_condition','The unapproved-review condition must be a boolean.');
        const plan=db.prepare('SELECT * FROM plans WHERE id=? AND workspace_id=?').get(body.planId,ws.id);if(!plan)fail('plan_not_found','This plan is not in your workspace.',404);
        transaction(()=>{
          const current=db.prepare('SELECT approved_at FROM plans WHERE id=? AND workspace_id=?').get(plan.id,ws.id);
          if(body.onlyIfUnapproved===true&&(current.approved_at||db.prepare("SELECT 1 FROM attempts WHERE plan_id=? AND (dispatched_at IS NOT NULL OR dispatch_count>0 OR state IN ('dispatching','rate_limited','uncertain','confirmed')) LIMIT 1").get(plan.id)))fail('review_already_approved','This review was already approved or dispatched. Refresh it before deciding whether to stop its remaining work.',409);
          db.prepare('UPDATE plans SET stopped=1 WHERE id=?').run(plan.id);
          cancelPending(plan.id);
        });
        send(res,200,{ok:true,plan:planView(db.prepare('SELECT * FROM plans WHERE id=?').get(plan.id)),attempts:attemptsFor(ws.id,plan.id),message:'Jobs that had not started were stopped. Any in-flight provider outcome will still be recorded.'});return true;
      }
      if(route==='receipts'&&req.method==='GET'){send(res,200,{ok:true,schemaVersion:1,exportedAt:iso(),mode:adapter.mode,meaning:'Confirmed means the provider returned an application ID; it does not mean recruiter review or selection.',receipts:attemptsFor(ws.id).filter(a=>a.state!=='ready')});return true}
      fail('not_found','This application endpoint or method is not supported.',404);
    }catch(error){if(!res.headersSent)send(res,error instanceof ApplicationError?error.status:500,{ok:false,error:{code:error instanceof ApplicationError?error.code:'storage_or_service_error',message:error instanceof ApplicationError?error.message:'The operation could not be completed safely. Existing application records were preserved.'}});else if(!res.writableEnded)res.end()}
    return true;
  }
  async function close(){closed=true;await serial;try{db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close()}finally{releaseLock()}}
  function createPairingCode(options={}){if(closed)fail('service_closed','The service is stopping.',503);return issuePairingCode(db,{...options,now:now()})}
  return {handle,close,createPairingCode,mode:adapter.mode};
}
