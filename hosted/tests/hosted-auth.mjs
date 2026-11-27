import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {createOAuthHandler,OAUTH_PROVIDERS} from '../server/oauth.mjs';
import {AUTH_ORIGIN,AUTH_LIMITS,BROWSER_SESSION_COOKIE,OAUTH_BROWSER_COOKIE,resolveBrowserIdentity,exportBrowserIdentity,identityDeletionStatements,stripInternalIdentityHeaders,verifiedSSRRequest,captureOwnerLifecycle} from '../server/identity.mjs';
import {ApplicationError,sha256} from '../server/validation.mjs';

// Real cryptographic signatures and an isolated actual D1 database. This adapter
// has no fallback to fetch: no provider account, secret, employer or network is used.
const mf = new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("isolated authentication fixture")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']}));
const key = await generateKeyPair('RS256'), otherKey = await generateKeyPair('RS256');
const publicKey = {...await exportJWK(key.publicKey),kid:'synthetic-key',alg:'RS256',use:'sig'};
const secretFixture = 'synthetic-provider-token-never-store';
let db,env,handler,time = Date.now(),requests = [],codes = new Map(),userInfos = new Map(),fetchBehavior = null,diagnostics = [];
const groups = [];
const sites = (id,email = `${id}@example.com`) => ({'oai-authenticated-user-id':'synthetic-'+id,'oai-authenticated-user-email':email,'oai-authenticated-user-full-name':encodeURIComponent('Synthetic '+id),'oai-authenticated-user-full-name-encoding':'percent-encoded-utf-8'});
const cookieFrom = (response,name) => response.headers.getSetCookie().map(value => value.split(';')[0]).find(value => value.startsWith(name+'='));
const cookieToken = (response,name) => cookieFrom(response,name)?.slice(name.length+1);
const queryResult = response => new URL(response.headers.get('location'),AUTH_ORIGIN).searchParams.get('oauth_result');
async function call(path,{method='GET',body,headers={},cookie,environment=env,authHandler=handler}={}) {
  const requestHeaders = {...headers};
  if (cookie) requestHeaders.cookie = cookie;
  if (body !== undefined) { requestHeaders.origin ??= AUTH_ORIGIN; requestHeaders['content-type'] ??= 'application/json'; }
  const request = new Request(AUTH_ORIGIN+path,{method,headers:requestHeaders,...(body === undefined ? {} : {body:JSON.stringify(body)})});
  const response = await authHandler(request,environment);
  return {response,status:response.status,data:response.headers.get('content-type')?.includes('application/json') ? await response.clone().json() : null,request};
}
async function begin(provider='google',{user,intent=user ? 'link' : 'login',cookie,returnTo='/connect'}={}) {
  const result = await call(intent === 'login' ? `/auth/${provider}/start?return_to=`+encodeURIComponent(returnTo) : '/api/auth/connect',intent === 'login' ? {cookie} : {method:'POST',cookie,headers:user,body:{provider,expectedAccountId:user?.['oai-authenticated-user-id'] ?? (await resolveBrowserIdentity(new Request(AUTH_ORIGIN,{headers:{cookie}}),env,{now:time})).id}});
  assert.equal(result.status,intent === 'login' ? 303 : 200,JSON.stringify(result.data));
  const authorization = new URL(result.data?.authorizationUrl ?? result.response.headers.get('location'));
  const oauthCookie = cookieFrom(result.response,OAUTH_BROWSER_COOKIE);
  assert(oauthCookie);
  return {provider,authorization,state:authorization.searchParams.get('state'),nonce:authorization.searchParams.get('nonce'),cookie:[cookie,oauthCookie].filter(Boolean).join('; '),user,response:result.response};
}
async function finish(flow,{claims={},headers=flow.user,cookie=flow.cookie,environment=env,authHandler=handler,behavior,userinfo,error,code=randomUUID()}={}) {
  codes.set(code,{flow,claims,behavior,userinfo});
  const path=`/auth/${flow.provider}/callback?state=${flow.state}&${error === undefined ? 'code='+code : 'error='+encodeURIComponent(error)}`;
  return call(path,{cookie,headers,environment,authHandler});
}
async function login(subject='synthetic-google',{claims={},user,userinfo,provider='google'}={}) {
  const flow = await begin(provider),result = await finish(flow,{claims:{sub:subject,...claims},headers:user,userinfo});
  assert.equal(queryResult(result.response),'signed_in',JSON.stringify(result.data));
  const cookie = cookieFrom(result.response,BROWSER_SESSION_COOKIE);
  const identity = await resolveBrowserIdentity(new Request(AUTH_ORIGIN,{headers:{cookie}}),env,{now:time});
  return {flow,result,cookie,identity};
}
async function fixture(address,options) {
  const provider = Object.keys(OAUTH_PROVIDERS).find(name => [OAUTH_PROVIDERS[name].token,OAUTH_PROVIDERS[name].jwks,OAUTH_PROVIDERS[name].userinfo].includes(address));
  assert(provider,'Only fixed Google/LinkedIn token, public JWKS and LinkedIn userinfo URLs are permitted');
  assert.equal(options.redirect,'manual'); assert(options.signal instanceof AbortSignal);
  assert.equal(new URL(address).search,'');
  requests.push({address,method:options.method});
  if (fetchBehavior) { const value = await fetchBehavior(address,options); if (value) return value; }
  if (address === OAUTH_PROVIDERS[provider].jwks) { assert.equal(options.method,'GET'); return Response.json({keys:[publicKey]}); }
  if (address === OAUTH_PROVIDERS.linkedin.userinfo) { assert.equal(options.method,'GET'); const info=userInfos.get(options.headers.Authorization?.replace(/^Bearer /,'')); assert(info,'Userinfo uses only the temporary access token from its own synthetic exchange'); return Response.json(info); }
  assert.equal(options.method,'POST');
  const form = new URLSearchParams(options.body),record = codes.get(form.get('code'));
  assert(record,'Every token exchange belongs to a synthetic one-use code'); codes.delete(form.get('code'));
  assert.equal(form.get('client_id'),env[OAUTH_PROVIDERS[provider].prefix+'_CLIENT_ID']);
  assert.equal(form.get('client_secret'),env[OAUTH_PROVIDERS[provider].prefix+'_CLIENT_SECRET']);
  assert.equal(form.get('redirect_uri'),AUTH_ORIGIN+`/auth/${provider}/callback`);
  assert.equal(form.get('grant_type'),'authorization_code');
  if (provider === 'google') assert.equal(Buffer.from(sha256(form.get('code_verifier')),'hex').toString('base64url'),record.flow.authorization.searchParams.get('code_challenge'));
  else assert.equal(form.has('code_verifier'),false);
  if (record.behavior) return record.behavior(address,options);
  let claims = {iss:provider === 'google' ? 'https://accounts.google.com' : 'https://www.linkedin.com',aud:form.get('client_id'),sub:'synthetic-'+provider,iat:Math.floor(time/1000),exp:Math.floor(time/1000)+3600,nonce:record.flow.nonce,name:'Synthetic Person',email:'person@example.com',email_verified:true,...record.claims};
  for (const [name,value] of Object.entries(claims)) if (value === undefined) delete claims[name];
  const signingKey = claims.wrongKey ? otherKey.privateKey : key.privateKey; delete claims.wrongKey;
  const algorithm = claims.algorithm ?? 'RS256'; delete claims.algorithm;
  const kid = claims.kid ?? 'synthetic-key'; delete claims.kid;
  const token = await new SignJWT(claims).setProtectedHeader({alg:algorithm,kid}).sign(algorithm === 'HS256' ? new TextEncoder().encode('synthetic-hmac-key-long-enough-for-test') : signingKey);
  const accessToken=secretFixture+'-'+randomUUID(); userInfos.set(accessToken,record.userinfo??{sub:claims.sub,email:claims.email,email_verified:claims.email_verified});
  return Response.json({token_type:'Bearer',access_token:accessToken,refresh_token:secretFixture+'-refresh',id_token:token});
}
async function reset() {
  requests=[]; codes=new Map(); userInfos=new Map(); fetchBehavior=null; diagnostics=[]; time+=61000;
  await db.batch(['oauth_transactions','browser_sessions','auth_identities','auth_accounts','auth_deletion_fences','auth_rates','workspaces','account_lifecycles'].map(table => db.prepare('DELETE FROM '+table)));
  handler=createOAuthHandler({fetchImpl:fixture,clock:()=>time,diagnosticSink:entry=>diagnostics.push(entry)});
}
async function check(name,action) { await reset(); await action(); groups.push(name); console.log('PASS',name); }
const count = async table => (await db.prepare('SELECT COUNT(*) AS n FROM '+table).first()).n;
const tokenRequests = () => requests.filter(request => request.method === 'POST').length;
const connectionId = async (ownerId,provider) => (await db.prepare('SELECT connection_id FROM auth_identities WHERE owner_id=? AND provider=?').bind(ownerId,provider).first())?.connection_id;
function identityMetadata(row) { const copy={...row}; delete copy.connection_id; return copy; }
async function retireOwner(ownerId) {
  const previous=await captureOwnerLifecycle(env,ownerId,{startedAt:time,now:time}),next={key:previous.key,generation:randomUUID()};
  await db.batch([
    db.prepare('UPDATE account_lifecycles SET generation=?,deleted_at=? WHERE owner_hash=? AND generation=?').bind(next.generation,time,previous.key,previous.generation),
    ...identityDeletionStatements(db,ownerId,{now:time,lifecycle:next}),
  ]);
  return {previous,next};
}

try {
  db=await mf.getD1Database('DB');
  for (const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(file => file.endsWith('.sql')).sort()) {
    let legacy;
    if (file === '0004_provider_connection_generation.sql') {
      // Exercise the real upgrade against linked identities and an active
      // session, not only an empty fresh database.
      await db.prepare('INSERT INTO auth_accounts(owner_id,origin_method,generation,created_at) VALUES(?,?,?,?)').bind('synthetic-upgrade','chatgpt','upgrade-generation',time).run();
      for (const provider of ['google','linkedin']) await db.prepare('INSERT INTO auth_identities(provider,subject,subject_hash,owner_id,email,display_name,connected_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(provider,'upgrade-'+provider,sha256(provider),'synthetic-upgrade',provider === 'google' ? 'upgrade@example.com' : null,'Synthetic upgrade',new Date(time).toISOString(),new Date(time).toISOString()).run();
      await db.prepare('INSERT INTO browser_sessions(token_hash,id,owner_id,account_generation,provider,subject,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').bind(sha256('a'.repeat(64)),randomUUID(),'synthetic-upgrade','upgrade-generation','google','upgrade-google',time,time+AUTH_LIMITS.sessionMilliseconds).run();
      legacy={identities:(await db.prepare('SELECT * FROM auth_identities ORDER BY provider').all()).results,sessions:(await db.prepare('SELECT * FROM browser_sessions').all()).results,accounts:(await db.prepare('SELECT * FROM auth_accounts').all()).results};
    }
    const migration = (await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')).split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean);
    if (file === '0004_provider_connection_generation.sql') {
      assert.equal(migration.length,2,'The upgrade contains only bounded schema operations, no standalone data backfill');
      assert.match(migration[0],/^ALTER TABLE/);
      assert.match(migration[1].replace(/^--[^\n]*(?:\n|$)/gm,''),/^\s*CREATE TRIGGER/);
    }
    for (const statement of migration) await db.prepare(statement).run();
    if (legacy) {
      const current=(await db.prepare('SELECT * FROM auth_identities ORDER BY provider').all()).results;
      assert.deepEqual(current.map(identityMetadata),legacy.identities);
      assert(current.every(row=>row.connection_id===''),'Schema migration must leave existing identity rows at the constant default');
      assert.equal((await resolveBrowserIdentity(new Request(AUTH_ORIGIN,{headers:{cookie:BROWSER_SESSION_COOKIE+'='+'a'.repeat(64)}}),{DB:db},{now:time})).id,'synthetic-upgrade');
      const initialized=await call('/api/auth/status',{cookie:BROWSER_SESSION_COOKIE+'='+'a'.repeat(64),environment:{DB:db},authHandler:createOAuthHandler({clock:()=>time,fetchImpl:()=>{throw Error('Status cannot contact a provider');}})});
      assert.equal(initialized.status,200);
      const ids=['google','linkedin'].map(provider=>initialized.data.providers[provider].connectionId);
      assert(ids.every(id=>/^[a-f0-9]{64}$/.test(id)));assert.equal(new Set(ids).size,2);
      assert.deepEqual((await db.prepare('SELECT * FROM auth_identities ORDER BY provider').all()).results.map(identityMetadata),legacy.identities);
      assert.deepEqual((await db.prepare('SELECT * FROM browser_sessions').all()).results,legacy.sessions);
      assert.deepEqual((await db.prepare('SELECT * FROM auth_accounts').all()).results,legacy.accounts);
      assert.equal((await resolveBrowserIdentity(new Request(AUTH_ORIGIN,{headers:{cookie:BROWSER_SESSION_COOKIE+'='+'a'.repeat(64)}}),{DB:db},{now:time})).id,'synthetic-upgrade');
      groups.push('Schema-only connection-generation upgrade and bounded status initialization preserve existing links, accounts and active browser sessions'); console.log('PASS',groups.at(-1));
    }
  }
  env={DB:db,CAREER_GOOGLE_CLIENT_ID:'synthetic-google.apps.googleusercontent.com',CAREER_GOOGLE_CLIENT_SECRET:'synthetic-google-secret',CAREER_LINKEDIN_CLIENT_ID:'synthetic-linkedin',CAREER_LINKEDIN_CLIENT_SECRET:'synthetic-linkedin-secret'};

  await check('Previous-worker callbacks after migration receive a stable connection generation; recreating the link rotates it',async()=>{
    const user=sites('rolling-upgrade'),ownerId=user['oai-authenticated-user-id'];
    await db.prepare('INSERT INTO auth_accounts(owner_id,origin_method,generation,created_at) VALUES(?,?,?,?)').bind(ownerId,'chatgpt','rolling-generation',time).run();
    // The previous deployed callback omits connection_id on insert and updates
    // only display metadata on a same-subject conflict. Exercise that shape
    // after the schema-only migration, without relying on a global backfill.
    const legacyWrite=()=>db.prepare(`INSERT INTO auth_identities(provider,subject,subject_hash,owner_id,email,display_name,connected_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(provider,subject) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,updated_at=excluded.updated_at WHERE auth_identities.owner_id=excluded.owner_id`)
      .bind('linkedin','rolling-subject',sha256('rolling-subject'),ownerId,null,'Synthetic rolling identity',new Date(time).toISOString(),new Date(time).toISOString()).run();
    await legacyWrite();
    const firstStatus=await call('/api/auth/status',{headers:user}),firstConnection=firstStatus.data.providers.linkedin.connectionId;
    assert.equal(firstStatus.status,200); assert.equal(firstStatus.data.providers.linkedin.connected,true);
    assert.match(firstConnection ?? '',/^[a-f0-9]{64}$/,'An old worker completing after migration must not produce an unparsable connected status');
    await legacyWrite();
    assert.equal(await connectionId(ownerId,'linkedin'),firstConnection,'Routine callbacks preserve the displayed connection generation');
    await db.prepare('DELETE FROM auth_identities WHERE owner_id=? AND provider=?').bind(ownerId,'linkedin').run();
    await legacyWrite();
    const replacement=await connectionId(ownerId,'linkedin'); assert.match(replacement,/^[a-f0-9]{64}$/); assert.notEqual(replacement,firstConnection);
    const stale=await call('/api/auth/disconnect',{method:'POST',headers:user,body:{provider:'linkedin',expectedAccountId:ownerId,expectedConnectionId:firstConnection}});
    assert.equal(stale.status,409); assert.equal(stale.data.error.code,'connection_changed'); assert.equal(await connectionId(ownerId,'linkedin'),replacement);
    const current=await call('/api/auth/disconnect',{method:'POST',headers:user,body:{provider:'linkedin',expectedAccountId:ownerId,expectedConnectionId:replacement}});
    assert.equal(current.status,200); assert.equal(await connectionId(ownerId,'linkedin'),undefined);
    const explicit='d'.repeat(64);
    await db.prepare('INSERT INTO auth_identities(provider,subject,subject_hash,owner_id,connection_id,email,display_name,connected_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind('linkedin','explicit-subject',sha256('explicit-subject'),ownerId,explicit,null,'Synthetic explicit identity',new Date(time).toISOString(),new Date(time).toISOString()).run();
    assert.equal(await connectionId(ownerId,'linkedin'),explicit,'New-worker explicit generations are preserved');
    assert.equal(requests.length,0,'No external HTTP request is needed for migration coverage');
  });

  await check('Legacy connection generations initialize only the confirmed owner and remain stable across concurrent status reads',async()=>{
    const user=sites('legacy-status'),other=sites('legacy-other'),ownerId=user['oai-authenticated-user-id'];
    for(const [provider,headers,subject] of [['google',user,'legacy-google'],['linkedin',user,'legacy-linkedin'],['google',other,'legacy-other-google']]) {
      const flow=await begin(provider,{user:headers});assert.equal(queryResult((await finish(flow,{claims:{sub:subject}})).response),'connected');
    }
    const signed=await login('legacy-google');assert.equal(signed.identity.id,ownerId);
    // Emulate rows that existed before ADD COLUMN; no production initializer
    // or trigger can be disabled by a request or environment option.
    await db.prepare("UPDATE auth_identities SET connection_id=''").run();
    const before=(await db.prepare('SELECT * FROM auth_identities ORDER BY owner_id,provider').all()).results;
    const sessions=(await db.prepare('SELECT * FROM browser_sessions').all()).results,accounts=(await db.prepare('SELECT * FROM auth_accounts ORDER BY owner_id').all()).results,requestsBefore=requests.length;
    const statuses=await Promise.all([call('/api/auth/status',{cookie:signed.cookie}),call('/api/auth/status',{headers:user})]);
    for(const result of statuses){assert.equal(result.status,200);for(const provider of ['google','linkedin'])assert.match(result.data.providers[provider].connectionId??'',/^[a-f0-9]{64}$/);}
    assert.deepEqual(statuses[0].data.providers,statuses[1].data.providers);
    const current=(await db.prepare('SELECT * FROM auth_identities ORDER BY owner_id,provider').all()).results;
    assert.deepEqual(current.map(identityMetadata),before.map(identityMetadata));
    assert.equal(current.find(row=>row.owner_id===other['oai-authenticated-user-id']).connection_id,'','Other accounts are not backfilled by this request');
    assert.deepEqual((await call('/api/auth/status',{cookie:signed.cookie})).data.providers,statuses[0].data.providers);
    assert.deepEqual((await db.prepare('SELECT * FROM browser_sessions').all()).results,sessions);
    assert.deepEqual((await db.prepare('SELECT * FROM auth_accounts ORDER BY owner_id').all()).results,accounts);
    assert.equal(requests.length,requestsBefore,'Status makes no provider request');
  });

  await check('Delayed provider status rejects revoked, expired and deleted/recreated authority instead of exposing replacement connections',async()=>{
    for(const provider of ['google','linkedin'])for(const change of ['revoke','expire','recreate']) {
      const subject=`status-${provider}-${change}`,signed=await login(subject,{provider});
      await db.prepare("UPDATE auth_identities SET connection_id='' WHERE owner_id=?").bind(signed.identity.id).run();
      let enter,release,captured=false;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve);
      const environment={...env,DB:{batch:statements=>db.batch(statements),prepare(sql){const prepared=db.prepare(sql);if(!sql.startsWith('SELECT s.owner_id'))return prepared;return{bind(...args){const query=prepared.bind(...args);return{async first(){const row=await query.first();if(!captured){captured=true;enter();await gate;}return row;}};}};}}};
      const pending=call('/api/auth/status',{cookie:signed.cookie,environment});await entered;
      if(change==='revoke')assert.equal((await call('/api/auth/signout',{method:'POST',cookie:signed.cookie,body:{expectedAccountId:signed.identity.id}})).status,200);
      else if(change==='expire')time+=AUTH_LIMITS.sessionMilliseconds+1;
      else {time+=1;await retireOwner(signed.identity.id);time+=1;await login(subject,{provider});}
      const before=(await db.prepare('SELECT * FROM auth_identities ORDER BY owner_id,provider').all()).results;
      release();const result=await pending;
      assert.equal(result.status,409,provider+' '+change);assert.equal(result.data.error.code,'account_changed');assert.equal(result.data.account,undefined);assert.equal(result.data.providers,undefined);
      assert.deepEqual((await db.prepare('SELECT * FROM auth_identities ORDER BY owner_id,provider').all()).results,before);
    }
  });

  await check('A delayed Sites status cannot initialize a recreated owner or treat a racing new account as unlinked',async()=>{
    for(const existing of [false,true]) {
      const user=sites('status-generation-'+existing),ownerId=user['oai-authenticated-user-id'];
      if(existing){const flow=await begin('linkedin',{user});await finish(flow,{claims:{sub:'status-old-owner'}});await db.prepare("UPDATE auth_identities SET connection_id='' WHERE owner_id=?").bind(ownerId).run();}
      let enter,release;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve);
      const environment={...env,DB:{prepare:sql=>db.prepare(sql),async batch(statements){enter();await gate;return db.batch(statements);}}};
      const pending=call('/api/auth/status',{headers:user,environment});await entered;
      if(existing){time+=1;await retireOwner(ownerId);}time+=1;
      const replacement=await begin('linkedin',{user});await finish(replacement,{claims:{sub:'status-new-owner-'+existing}});
      const before=(await db.prepare('SELECT * FROM auth_identities WHERE owner_id=?').bind(ownerId).all()).results;
      release();const result=await pending;assert.equal(result.status,409);assert.equal(result.data.error.code,'account_changed');assert.equal(result.data.providers,undefined);
      assert.deepEqual((await db.prepare('SELECT * FROM auth_identities WHERE owner_id=?').bind(ownerId).all()).results,before);
    }
  });

  await check('Sites status checks deleting workspaces even without provider-account metadata and leaves new accounts unmodified',async()=>{
    const user=sites('status-no-provider'),ownerId=user['oai-authenticated-user-id'];
    const first=await call('/api/auth/status',{headers:user});assert.equal(first.status,200);assert.equal(first.data.providers.google.connected,false);assert.equal(first.data.providers.linkedin.connected,false);
    assert.equal(await count('auth_accounts'),0);assert.equal(await count('account_lifecycles'),0);
    await db.prepare('INSERT INTO workspaces(id,owner_id,owner_email,created_at,profile_json,deleting_at) VALUES(?,?,?,?,?,?)').bind(randomUUID(),ownerId,user['oai-authenticated-user-email'],new Date(time).toISOString(),'{}',new Date(time).toISOString()).run();
    const deleted=await call('/api/auth/status',{headers:user});assert.equal(deleted.status,409);assert.equal(deleted.data.error.code,'account_changed');assert.equal(deleted.data.providers,undefined);
    assert.equal(await count('auth_accounts'),0);assert.equal(await count('account_lifecycles'),0);
  });

  await check('A link replaced while legacy initialization waits keeps the new insert generation and the old subject is not recreated',async()=>{
    const user=sites('status-relink'),ownerId=user['oai-authenticated-user-id'],flow=await begin('linkedin',{user});await finish(flow,{claims:{sub:'status-old-link'}});
    await db.prepare("UPDATE auth_identities SET connection_id='' WHERE owner_id=?").bind(ownerId).run();
    let enter,release;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve);
    const environment={...env,DB:{prepare:sql=>db.prepare(sql),async batch(statements){enter();await gate;return db.batch(statements);}}};
    const pending=call('/api/auth/status',{headers:user,environment});await entered;
    await db.prepare('DELETE FROM auth_identities WHERE owner_id=? AND provider=?').bind(ownerId,'linkedin').run();
    const replacement=await begin('linkedin',{user});await finish(replacement,{claims:{sub:'status-new-link'}});
    const before=(await db.prepare('SELECT * FROM auth_identities WHERE owner_id=?').bind(ownerId).all()).results;
    release();const result=await pending;assert.equal(result.status,200);assert.equal(result.data.providers.linkedin.connectionId,before[0].connection_id);
    assert.deepEqual((await db.prepare('SELECT * FROM auth_identities WHERE owner_id=?').bind(ownerId).all()).results,before);
    assert.equal(before[0].subject,'status-new-link');
  });

  await check('A failed lazy initialization rolls back both provider IDs and reports failure instead of empty connections',async()=>{
    const user=sites('status-atomic'),ownerId=user['oai-authenticated-user-id'];
    for(const provider of ['google','linkedin']){const flow=await begin(provider,{user});await finish(flow,{claims:{sub:'status-atomic-'+provider}});}
    await db.prepare("UPDATE auth_identities SET connection_id='' WHERE owner_id=?").bind(ownerId).run();
    await db.prepare(`CREATE TRIGGER synthetic_generation_abort BEFORE UPDATE OF connection_id ON auth_identities
      WHEN OLD.owner_id='synthetic-status-atomic' AND OLD.provider='linkedin'
      BEGIN SELECT RAISE(ABORT,'synthetic initialization refusal'); END`).run();
    try{
      const result=await call('/api/auth/status',{headers:user});assert.equal(result.status,503);assert.equal(result.data.providers,undefined);
      assert((await db.prepare('SELECT connection_id FROM auth_identities WHERE owner_id=?').bind(ownerId).all()).results.every(row=>row.connection_id===''));
    }finally{await db.prepare('DROP TRIGGER synthetic_generation_abort').run();}
    const result=await call('/api/auth/status',{headers:user});assert.equal(result.status,200);assert.match(result.data.providers.google.connectionId,/^[a-f0-9]{64}$/);assert.match(result.data.providers.linkedin.connectionId,/^[a-f0-9]{64}$/);
  });

  await check('Unconfigured providers stay unavailable; Sites identity and verified SSR boundaries remain intact',async()=>{
    const anonymous=await call('/api/auth/status',{environment:{DB:db}});
    assert.deepEqual(anonymous.data,{ok:true,account:null,providers:{google:{configured:false,signInSupported:true,connected:false},linkedin:{configured:false,signInSupported:true,connected:false}}});
    const noDatabase=await call('/api/auth/status',{environment:{}});assert.equal(noDatabase.status,200);assert.equal(noDatabase.data.account,null);assert.equal(noDatabase.data.providers.google.configured,false);
    const unavailable=await call('/api/auth/status',{headers:sites('no-database'),environment:{}});assert.equal(unavailable.status,503);assert.equal(unavailable.data.error.code,'auth_unavailable');assert.equal(unavailable.data.providers,undefined);
    for (const provider of ['google','linkedin']) assert.equal((await call(`/auth/${provider}/start`,{environment:{DB:db}})).status,503);
    assert.equal(requests.length,0);
    const user=sites('alice'),status=await call('/api/auth/status',{headers:user});
    assert.deepEqual(status.data.account,{id:'synthetic-alice',email:'alice@example.com',displayName:'Synthetic alice',method:'chatgpt'});
    assert.equal(await count('auth_accounts'),0);
    const spoof=new Request(AUTH_ORIGIN,{headers:{...user,'x-career-user-id':'attacker','x-career-user-method':'google','x-career-arbitrary':'unsafe'}});
    assert.equal(stripInternalIdentityHeaders(spoof).headers.has('x-career-user-id'),false);
    const verified=verifiedSSRRequest(spoof,status.data.account); assert.equal(verified.headers.get('x-career-user-id'),'synthetic-alice'); assert.equal(verified.headers.has('x-career-arbitrary'),false);
    const international=verifiedSSRRequest(spoof,{...status.data.account,email:'名%tag@example.com',displayName:'名字'});
    assert.equal(decodeURIComponent(international.headers.get('x-career-user-email')),'名%tag@example.com'); assert.equal(decodeURIComponent(international.headers.get('x-career-user-name')),'名字');
    assert.equal(await resolveBrowserIdentity(new Request(AUTH_ORIGIN,{headers:{'x-career-user-id':'attacker','x-career-user-email':'x@example.com'}}),env),null);
    assert.equal((await call('/api/auth/status',{headers:user,cookie:BROWSER_SESSION_COOKIE+'=bad'})).data.error.code,'invalid_session');
  });

  await check('Google authorization code uses S256, nonce, hashed one-use state and a private opaque browser session',async()=>{
    const flow=await begin('google',{returnTo:'/phone'});
    assert.equal(flow.authorization.origin+flow.authorization.pathname,OAUTH_PROVIDERS.google.authorization);
    assert.equal(flow.authorization.searchParams.get('scope'),'openid email profile'); assert.equal(flow.authorization.searchParams.get('response_type'),'code'); assert.equal(flow.authorization.searchParams.get('code_challenge_method'),'S256');
    assert.match(flow.response.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Lax/);
    const transaction=await db.prepare('SELECT * FROM oauth_transactions').first();
    assert.equal(transaction.state_hash,sha256(flow.state)); assert.equal(transaction.nonce_hash,sha256(flow.nonce));
    assert(!JSON.stringify(transaction).includes(flow.state)); assert(!JSON.stringify(transaction).includes(flow.cookie.split('=')[1]));
    const result=await finish(flow); assert.equal(queryResult(result.response),'signed_in'); assert.equal(new URL(result.response.headers.get('location'),AUTH_ORIGIN).pathname,'/phone');
    const cookie=cookieFrom(result.response,BROWSER_SESSION_COOKIE),token=cookieToken(result.response,BROWSER_SESSION_COOKIE);
    assert.match(token,/^[a-f0-9]{64}$/); assert.match(result.response.headers.getSetCookie().find(value=>value.startsWith(BROWSER_SESSION_COOKIE+'=')),/Path=\/; Secure; HttpOnly; SameSite=Lax/);
    const row=await db.prepare('SELECT * FROM browser_sessions').first(); assert.equal(row.token_hash,sha256(token)); assert(!JSON.stringify(row).includes(token));
    const status=await call('/api/auth/status',{cookie,headers:sites('different')}); assert.equal(status.data.account.id,row.owner_id); assert.equal(status.data.account.method,'google');
    assert.equal(status.data.providers.google.connected,true); assert.equal(await count('workspaces'),0); assert.equal(await count('oauth_transactions'),0);
    for(const table of ['auth_accounts','auth_identities','browser_sessions','oauth_transactions']) assert(!JSON.stringify((await db.prepare('SELECT * FROM '+table).all()).results).includes(secretFixture));
    assert.equal(result.response.headers.get('referrer-policy'),'no-referrer'); assert.equal(result.response.headers.get('cache-control'),'no-store');
  });

  await check('Provider subject is stable; matching email never merges Google subjects or an existing Sites owner',async()=>{
    const a=await login('google-one'),b=await login('google-two'); assert.notEqual(a.identity.id,b.identity.id);
    const originalConnection=await connectionId(a.identity.id,'google'); assert.match(originalConnection,/^[a-f0-9]{64}$/);
    const repeat=await login('google-one',{claims:{email:'updated@example.com'}}); assert.equal(repeat.identity.id,a.identity.id); assert.equal(repeat.identity.email,'updated@example.com');
    assert.equal(await connectionId(a.identity.id,'google'),originalConnection,'An ordinary sign-in does not replace the same existing connection');
    const site=await call('/api/auth/status',{headers:sites('person','person@example.com')}); assert.notEqual(site.data.account.id,a.identity.id);
    assert.equal(await count('auth_accounts'),2);
  });


  await check('A same-email Google link conflict preserves both owners, sessions and saved data, then normal Google login recovers its original account',async()=>{
    for(const originalHasWorkspace of [false,true]){
      await reset();
      const original=await login('already-linked-google'),user=sites('separate-sites-owner','person@example.com');
      const linked=await finish(await begin('linkedin',{user}),{claims:{sub:'sites-linkedin-kept'}});
      assert.equal(queryResult(linked.response),'connected');
      const flow=await begin('google',{user}),originalConnection=await connectionId(original.identity.id,'google');
      const owners=[user['oai-authenticated-user-id'],...(originalHasWorkspace?[original.identity.id]:[])];
      for(const [index,owner] of owners.entries())await db.prepare('INSERT INTO workspaces(id,owner_id,owner_email,created_at,profile_json) VALUES(?,?,?,?,?)')
        .bind('conflict-workspace-'+index,owner,'person@example.com',new Date(time).toISOString(),JSON.stringify({syntheticPrivateSentinel:'saved-for-'+owner})).run();
      const before={};
      for(const table of ['auth_accounts','auth_identities','browser_sessions','workspaces'])before[table]=(await db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()).results;
      const result=await finish(flow,{claims:{sub:'already-linked-google'}});
      assert.equal(result.status,303);assert.equal(result.response.headers.get('location'),'/account?oauth_provider=google&oauth_result=already_linked');
      assert.equal(cookieFrom(result.response,BROWSER_SESSION_COOKIE),undefined);assert.match(result.response.headers.get('set-cookie'),/Max-Age=0/);
      assert.deepEqual(diagnostics,[{stage:'identity_lookup',code:'provider_already_linked'}]);
      for(const [table,rows] of Object.entries(before))assert.deepEqual((await db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()).results,rows,table);
      assert.equal(await count('oauth_transactions'),0);
      const current=await call('/api/auth/status',{headers:user});
      assert.equal(current.data.account.id,user['oai-authenticated-user-id']);assert.equal(current.data.providers.google.connected,false);assert.equal(current.data.providers.linkedin.connected,true);
      const signedOut=await call('/api/auth/signout',{method:'POST',headers:user,body:{expectedAccountId:user['oai-authenticated-user-id']}});
      assert.equal(signedOut.status,200);assert.equal(signedOut.data.redirectTo,'/signout-with-chatgpt?return_to=%2Fconnect');
      const recovered=await login('already-linked-google');
      assert.equal(recovered.identity.id,original.identity.id);assert.equal(await connectionId(original.identity.id,'google'),originalConnection);
      assert.equal(await count('auth_accounts'),2);assert.equal(await count('auth_identities'),2);assert.equal(await count('browser_sessions'),before.browser_sessions.length+1);
      assert.deepEqual((await db.prepare('SELECT * FROM workspaces ORDER BY rowid').all()).results,before.workspaces);
      assert.equal((await call('/api/auth/status',{cookie:recovered.cookie,headers:user})).data.account.id,original.identity.id,'The verified Google session, not a background Sites identity, owns the recovered account');
      assert.equal((await call('/api/auth/status',{headers:user})).data.account.id,user['oai-authenticated-user-id'],'The distinct Sites account remains recoverable');
    }
  });

  await check('Provider error text cannot impersonate the verified already-linked recovery result',async()=>{
    for(const error of ['provider_already_linked','already_linked']){
      const flow=await begin('google',{user:sites('untrusted-provider-error')}),result=await finish(flow,{error});
      assert.equal(result.response.headers.get('location'),'/account?oauth_provider=google&oauth_result=failed');
      assert.equal(cookieFrom(result.response,BROWSER_SESSION_COOKIE),undefined);
    }
    assert.deepEqual(diagnostics,[{stage:'provider_response',code:'provider_rejected'},{stage:'provider_response',code:'provider_rejected'}]);
    assert.equal(tokenRequests(),0);assert.equal(await count('auth_identities'),0);assert.equal(await count('browser_sessions'),0);assert.equal(await count('oauth_transactions'),0);
  });

  await check('Explicit Google linking preserves the exact Sites owner and subsequent Google login returns that owner',async()=>{
    const user=sites('link-owner'),flow=await begin('google',{user}),result=await finish(flow,{claims:{sub:'linked-google',email:'different@example.com'}});
    assert.equal(queryResult(result.response),'connected'); assert.equal(cookieFrom(result.response,BROWSER_SESSION_COOKIE),undefined);
    const linked=await login('linked-google',{claims:{email:'different@example.com'}}); assert.equal(linked.identity.id,'synthetic-link-owner');
    assert.equal((await db.prepare('SELECT origin_method FROM auth_accounts WHERE owner_id=?').bind(linked.identity.id).first()).origin_method,'chatgpt');
  });

  await check('Explicit LinkedIn linking retains basic openid/profile scopes without email collection or a new login session',async()=>{
    const user=sites('linkedin-owner'),flow=await begin('linkedin',{user});
    assert.equal(flow.authorization.searchParams.get('scope'),'openid profile'); assert.equal(flow.authorization.searchParams.has('code_challenge'),false); assert(flow.nonce);
    const result=await finish(flow,{claims:{sub:'linkedin-person'}}); assert.equal(queryResult(result.response),'connected');
    const stored=await db.prepare("SELECT * FROM auth_identities WHERE provider='linkedin'").first(); assert.equal(stored.email,null); assert.equal(stored.owner_id,'synthetic-linkedin-owner'); assert.equal(stored.display_name,'Synthetic Person');
    assert.equal(await count('browser_sessions'),0); assert.equal(await count('workspaces'),0);
    const status=await call('/api/auth/status',{headers:user}); assert.equal(status.data.providers.linkedin.connected,true); assert.equal(status.data.account.method,'chatgpt');
    assert.equal(status.data.providers.linkedin.signInSupported,true);
  });

  await check('Direct LinkedIn sign-in requests email, validates a signed subject and creates its own private session',async()=>{
    const signed=await login('linkedin-login-subject',{provider:'linkedin'});
    assert.equal(signed.flow.authorization.searchParams.get('scope'),'openid profile email'); assert.equal(signed.flow.authorization.searchParams.get('redirect_uri'),AUTH_ORIGIN+'/auth/linkedin/callback');
    assert(signed.flow.nonce); assert.equal(signed.identity.method,'linkedin'); assert.equal(signed.identity.email,'person@example.com');
    assert.equal((await db.prepare('SELECT origin_method FROM auth_accounts WHERE owner_id=?').bind(signed.identity.id).first()).origin_method,'linkedin');
    const status=await call('/api/auth/status',{cookie:signed.cookie,headers:sites('different')}); assert.equal(status.data.account.id,signed.identity.id); assert.equal(status.data.providers.linkedin.connected,true);
    assert.equal(requests.filter(row=>row.address===OAUTH_PROVIDERS.linkedin.userinfo).length,0,'Verified signed email needs no extra API request');
    assert.equal(queryResult((await finish(signed.flow)).response),'failed'); assert.equal(tokenRequests(),1);
    assert.equal((await call('/auth/linkedin/start',{cookie:signed.cookie})).status,409);
    assert.equal((await call('/auth/linkedin/start',{headers:{'sec-fetch-site':'cross-site'}})).status,403);
    for(const table of ['auth_accounts','auth_identities','browser_sessions','oauth_transactions']) assert(!JSON.stringify((await db.prepare('SELECT * FROM '+table).all()).results).includes(secretFixture));
  });

  await check('LinkedIn userinfo supplies optional verified email only when its subject matches the signed ID token',async()=>{
    const signed=await login('linkedin-userinfo',{provider:'linkedin',claims:{email:undefined,email_verified:undefined},userinfo:{sub:'linkedin-userinfo',email:'verified@example.com',email_verified:true}});
    assert.equal(signed.identity.email,'verified@example.com'); assert.equal(requests.filter(row=>row.address===OAUTH_PROVIDERS.linkedin.userinfo).length,1);
    const flow=await begin('linkedin'),before=await count('auth_accounts');
    const mismatch=await finish(flow,{claims:{sub:'signed-subject',email:undefined,email_verified:undefined},userinfo:{sub:'different-subject',email:'verified@example.com',email_verified:true}});
    assert.equal(queryResult(mismatch.response),'failed'); assert.equal(cookieFrom(mismatch.response,BROWSER_SESSION_COOKIE),undefined); assert.equal(await count('auth_accounts'),before);
  });

  await check('Absent, unverified and invalid LinkedIn email fails with a safe fallback and no partial account or session',async()=>{
    for(const info of [{sub:'email-optional'},{sub:'email-optional',email:'x@example.com'},{sub:'email-optional',email:'x@example.com',email_verified:false},{sub:'email-optional',email:'x@example.com',email_verified:'true'},{sub:'email-optional',email:'not-an-email',email_verified:true}]) {
      time+=61000; const flow=await begin('linkedin');
      const result=await finish(flow,{claims:{sub:'email-optional',email:undefined,email_verified:undefined},userinfo:info});
      assert.equal(queryResult(result.response),'email_required'); assert.equal(cookieFrom(result.response,BROWSER_SESSION_COOKIE),undefined);
      for(const table of ['auth_accounts','auth_identities','browser_sessions','oauth_transactions'])assert.equal(await count(table),0,table);
      assert(!result.response.headers.get('location').includes('x@example.com')); assert.equal(queryResult((await finish(flow)).response),'failed');
    }
  });

  await check('LinkedIn userinfo rejects redirects, oversized bodies and invalid signed claims without identity writes',async()=>{
    for(const behavior of [()=>new Response('',{status:302,headers:{Location:'https://evil.example'}}),()=>new Response('x'.repeat(16385),{headers:{'Content-Type':'application/json'}})]) {
      const flow=await begin('linkedin'); fetchBehavior=async address=>address===OAUTH_PROVIDERS.linkedin.userinfo?behavior():null;
      assert.equal(queryResult((await finish(flow,{claims:{email:undefined,email_verified:undefined}})).response),'failed'); assert.equal(await count('auth_accounts'),0); fetchBehavior=null;
    }
    for(const claims of [{aud:'wrong-client'},{nonce:'wrong-nonce'},{wrongKey:true}]) {
      const flow=await begin('linkedin'),before=requests.filter(row=>row.address===OAUTH_PROVIDERS.linkedin.userinfo).length;
      assert.equal(queryResult((await finish(flow,{claims})).response),'failed'); assert.equal(await count('auth_accounts'),0);
      assert.equal(requests.filter(row=>row.address===OAUTH_PROVIDERS.linkedin.userinfo).length,before);
    }
  });

  await check('LinkedIn subjects never merge by email and explicit ChatGPT or Google links recover their original owner',async()=>{
    const a=await login('linkedin-a',{provider:'linkedin'}),b=await login('linkedin-b',{provider:'linkedin'}),google=await login('google-same-email');
    assert.equal(new Set([a.identity.id,b.identity.id,google.identity.id]).size,3);
    const site=sites('linked-sites','person@example.com'),siteFlow=await begin('linkedin',{user:site}); await finish(siteFlow,{claims:{sub:'sites-linkedin'}});
    const siteLogin=await login('sites-linkedin',{provider:'linkedin'}); assert.equal(siteLogin.identity.id,site['oai-authenticated-user-id']);
    const googleFlow=await begin('linkedin',{intent:'link',cookie:google.cookie}); await finish(googleFlow,{claims:{sub:'google-linkedin'}});
    const googleLogin=await login('google-linkedin',{provider:'linkedin'}); assert.equal(googleLogin.identity.id,google.identity.id);
    const repeat=await login('linkedin-a',{provider:'linkedin',claims:{email:'updated@example.com'}}); assert.equal(repeat.identity.id,a.identity.id);
    const relink=await begin('linkedin',{user:site}); await finish(relink,{claims:{sub:'sites-linkedin',email:undefined,email_verified:undefined}});
    assert.equal((await call('/api/auth/status',{cookie:siteLogin.cookie})).data.account.email,'person@example.com','Basic linking does not erase a previously verified sign-in address');
  });

  await check('LinkedIn original/current login cannot be removed and expired LinkedIn cookies never reveal a background Sites owner',async()=>{
    const signed=await login('protected-linkedin',{provider:'linkedin'}),body={provider:'linkedin',expectedAccountId:signed.identity.id,expectedConnectionId:await connectionId(signed.identity.id,'linkedin')};
    assert.equal((await call('/api/auth/disconnect',{method:'POST',cookie:signed.cookie,body})).data.error.code,'login_method_required');
    const exported=await exportBrowserIdentity(env,signed.identity.id); assert.equal(exported.browserSessions[0].method,'linkedin'); assert(!JSON.stringify(exported).includes(signed.cookie));
    time+=AUTH_LIMITS.sessionMilliseconds+1;
    assert.equal((await call('/api/auth/status',{cookie:signed.cookie,headers:sites('background')})).data.error.code,'invalid_session');
    const result=await call('/api/auth/signout',{method:'POST',cookie:signed.cookie,headers:sites('background'),body:{expectedAccountId:''}}); assert.equal(result.status,200); assert.equal(await count('browser_sessions'),0);
  });

  await check('Revoking LinkedIn sign-in during a Google linking callback prevents a late connection',async()=>{
    const signed=await login('linkedin-link-race',{provider:'linkedin'}),flow=await begin('google',{intent:'link',cookie:signed.cookie});
    let enter,release; const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve);
    fetchBehavior=async address=>{if(address===OAUTH_PROVIDERS.google.token){enter();await gate;}return null;};
    const pending=finish(flow); await entered;
    assert.equal((await call('/api/auth/signout',{method:'POST',cookie:signed.cookie,body:{expectedAccountId:signed.identity.id}})).status,200);
    release(); assert.equal(queryResult((await pending).response),'failed'); assert.equal(await count('browser_sessions'),0);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM auth_identities WHERE provider='google'").first()).n,0);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM auth_identities WHERE provider='linkedin'").first()).n,1);
  });

  await check('Deleting a LinkedIn owner while optional userinfo is pending cannot recreate its deleted account',async()=>{
    const signed=await login('linkedin-delete-race',{provider:'linkedin'}),flow=await begin('linkedin');
    let enter,release; const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve);
    fetchBehavior=async address=>{if(address===OAUTH_PROVIDERS.linkedin.userinfo){enter();await gate;}return null;};
    const pending=finish(flow,{claims:{sub:'linkedin-delete-race',email:undefined,email_verified:undefined},userinfo:{sub:'linkedin-delete-race',email:'person@example.com',email_verified:true}}); await entered;
    time+=1; await retireOwner(signed.identity.id); release(); assert.equal(queryResult((await pending).response),'failed');
    for(const table of ['auth_accounts','auth_identities','browser_sessions','oauth_transactions'])assert.equal(await count(table),0,table);
  });

  await check('Published LinkedIn login and consent cancellation codes spend state without exchanging a token',async()=>{
    for(const error of ['user_cancelled_login','user_cancelled_authorize']){const flow=await begin('linkedin'); assert.equal(queryResult((await finish(flow,{error})).response),'cancelled'); assert.equal(queryResult((await finish(flow)).response),'failed');}
    assert.equal(tokenRequests(),0); assert.equal(await count('auth_accounts'),0);
  });

  await check('State is browser-bound, provider-bound, one-use and atomically claimed across concurrent callbacks',async()=>{
    const flow=await begin();
    const stolen=await finish(flow,{cookie:OAUTH_BROWSER_COOKIE+'='+'b'.repeat(64)});
    assert.equal(queryResult(stolen.response),'failed'); assert.equal(stolen.response.headers.has('set-cookie'),false); assert.equal(tokenRequests(),0);
    const wrongProvider=await call(`/auth/linkedin/callback?state=${flow.state}&code=wrong`,{cookie:flow.cookie}); assert.equal(queryResult(wrongProvider.response),'failed'); assert.equal(tokenRequests(),0);
    const code=randomUUID(); codes.set(code,{flow,claims:{}});
    const responses=await Promise.all([1,2].map(()=>call(`/auth/google/callback?state=${flow.state}&code=${code}`,{cookie:flow.cookie})));
    assert.deepEqual(responses.map(value=>queryResult(value.response)).sort(),['failed','signed_in']); assert.equal(tokenRequests(),1); assert.equal(await count('browser_sessions'),1);
    assert.equal(queryResult((await finish(flow)).response),'failed'); assert.equal(tokenRequests(),1);
  });

  await check('Actual RS256 verification rejects wrong audience, issuer, nonce, lifetime, authorized party, signature and unverified email',async()=>{
    const invalid=[{aud:'other-client'},{iss:'https://attacker.example'},{nonce:'wrong-nonce'},{nonce:undefined},{exp:Math.floor(time/1000)-60},{iat:Math.floor(time/1000)+3600},{azp:'other-client'},{aud:[env.CAREER_GOOGLE_CLIENT_ID,'other-client'],azp:undefined},{email_verified:false},{email_verified:'true'},{email:undefined},{wrongKey:true},{algorithm:'HS256'},{kid:'unknown-key'}];
    for(const claims of invalid) {
      time+=61000; const flow=await begin(),before=tokenRequests();
      const result=await finish(flow,{claims}); assert.equal(queryResult(result.response),'failed',JSON.stringify(claims)); assert.equal(await count('browser_sessions'),0);
      assert.equal(queryResult((await finish(flow)).response),'failed'); assert.equal(tokenRequests(),before+1);
    }
    assert.equal(await count('auth_accounts'),0);
  });

  await check('OIDC subject bytes reject non-ASCII aliases before any account or session is written',async()=>{
    for(const provider of ['google','linkedin'])for(const subject of [String.fromCharCode(0xd800),String.fromCharCode(0xd801),'accented-'+String.fromCharCode(0xe9),'emoji-'+String.fromCodePoint(0x1f600)]){
      time+=61000;const flow=await begin(provider),result=await finish(flow,{claims:{sub:subject}});
      assert.equal(queryResult(result.response),'failed',provider+' subject '+JSON.stringify(subject)+' must be rejected before D1 Unicode conversion');
      for(const table of ['auth_accounts','auth_identities','browser_sessions','oauth_transactions'])assert.equal(await count(table),0,table);
    }
  });

  await check('Cancellation consumes state without exchanging a code; hostile error descriptions never reach the redirect',async()=>{
    const flow=await begin(),cancelled=await finish(flow,{error:'access_denied'}); assert.equal(queryResult(cancelled.response),'cancelled'); assert.equal(tokenRequests(),0);
    assert.equal(queryResult((await finish(flow)).response),'failed');
    const second=await begin(),failed=await finish(second,{error:'<script>synthetic-secret</script>'}); assert.equal(queryResult(failed.response),'failed'); assert(!failed.response.headers.get('location').includes('synthetic-secret')); assert.equal(tokenRequests(),0);
  });

  await check('Account changes between connect and callback fail before provider exchange; links cannot transfer between owners',async()=>{
    const alice=sites('alice'),bob=sites('bob'),flow=await begin('linkedin',{user:alice});
    assert.equal(queryResult((await finish(flow,{headers:bob})).response),'failed'); assert.equal(tokenRequests(),0); assert.equal(await count('auth_identities'),0);
    const own=await begin('linkedin',{user:alice}); assert.equal(queryResult((await finish(own,{claims:{sub:'same-person'}})).response),'connected');
    const other=await begin('linkedin',{user:bob}); assert.equal(queryResult((await finish(other,{claims:{sub:'same-person'}})).response),'already_linked');
    const row=await db.prepare('SELECT owner_id FROM auth_identities').first(); assert.equal(row.owner_id,'synthetic-alice');
    const wrong=await call('/api/auth/connect',{method:'POST',headers:bob,body:{provider:'google',expectedAccountId:'synthetic-alice'}}); assert.equal(wrong.status,409);
  });

  await check('Concurrent links for the same provider subject create one owner association and never merge either account',async()=>{
    const a=await begin('linkedin',{user:sites('a')}),b=await begin('linkedin',{user:sites('b')});
    const results=await Promise.all([a,b].map(flow=>finish(flow,{claims:{sub:'contended-subject'}})));
    const outcomes=results.map(value=>queryResult(value.response));assert.equal(outcomes.filter(value=>value==='connected').length,1);assert.equal(outcomes.filter(value=>value==='failed'||value==='already_linked').length,1);
    assert.equal(await count('auth_identities'),1); assert.equal(await count('auth_accounts'),2);
  });

  await check('A Google cookie suppresses Sites fallback; mismatched sign-out fails and invalid-cookie recovery clears no Sites account',async()=>{
    const signed=await login(),other=sites('other');
    assert.equal((await call('/api/auth/status',{cookie:signed.cookie,headers:other})).data.account.id,signed.identity.id);
    assert.equal((await call('/api/auth/signout',{method:'POST',cookie:signed.cookie,headers:other,body:{expectedAccountId:'synthetic-other'}})).status,409); assert.equal(await count('browser_sessions'),1);
    time+=AUTH_LIMITS.sessionMilliseconds+1;
    assert.equal((await call('/api/auth/status',{cookie:signed.cookie,headers:other})).data.error.code,'invalid_session');
    const recovered=await call('/api/auth/signout',{method:'POST',cookie:signed.cookie,headers:other,body:{expectedAccountId:''}}); assert.equal(recovered.status,200); assert.equal(recovered.data.redirectTo,'/signout-with-chatgpt?return_to=%2Fconnect'); assert.match(recovered.response.headers.get('set-cookie'),/Max-Age=0/);
    assert.equal(await count('auth_identities'),1);
    const siteSignout=await call('/api/auth/signout',{method:'POST',headers:other,body:{expectedAccountId:'synthetic-other'}}); assert.equal(siteSignout.data.redirectTo,'/signout-with-chatgpt?return_to=%2Fconnect');
  });

  await check('Sole Google login cannot be unlinked; Sites-owned Google unlink revokes its sessions and in-flight connections',async()=>{
    const signed=await login();
    assert.equal((await call('/api/auth/disconnect',{method:'POST',cookie:signed.cookie,body:{provider:'google',expectedAccountId:signed.identity.id,expectedConnectionId:await connectionId(signed.identity.id,'google')}})).data.error.code,'login_method_required');
    const user=sites('original'),flow=await begin('google',{user}); await finish(flow,{claims:{sub:'original-google'}});
    const google=await login('original-google'); const pending=await begin('google',{user}),anonymousPending=await begin();
    assert.equal((await call('/api/auth/disconnect',{method:'POST',headers:user,body:{provider:'google',expectedAccountId:'synthetic-original',expectedConnectionId:await connectionId('synthetic-original','google')}})).status,200);
    assert.equal((await call('/api/auth/status',{cookie:google.cookie,headers:user})).status,401);
    assert.equal(queryResult((await finish(pending,{claims:{sub:'original-google'}})).response),'failed');
    assert.equal(queryResult((await finish(anonymousPending,{claims:{sub:'original-google'}})).response),'failed');
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM auth_identities WHERE owner_id=?').bind('synthetic-original').first()).n,0);
  });

  await check('A displayed connection ID is required; old clients and mismatched confirmations cannot disconnect a link',async()=>{
    const user=sites('disconnect-target'),flow=await begin('linkedin',{user}); await finish(flow,{claims:{sub:'target-link'}});
    const before=(await db.prepare('SELECT * FROM auth_identities').all()).results;
    const status=await call('/api/auth/status',{headers:user}); assert.match(status.data.providers.linkedin.connectionId,/^[a-f0-9]{64}$/); assert.equal(status.data.providers.google.connectionId,undefined);
    for (const expectedConnectionId of [undefined,'',42,'a'.repeat(64)]) {
      const result=await call('/api/auth/disconnect',{method:'POST',headers:user,body:{provider:'linkedin',expectedAccountId:user['oai-authenticated-user-id'],...(expectedConnectionId===undefined?{}:{expectedConnectionId})}});
      assert.equal(result.status,409); assert.equal(result.data.error.code,'connection_changed');
    }
    assert.deepEqual((await db.prepare('SELECT * FROM auth_identities').all()).results,before); assert.equal(await count('auth_deletion_fences'),0);
  });

  await check('A valid LinkedIn disconnect preserves Google sign-in and another owner connection',async()=>{
    const signed=await login('disconnect-google-owner');
    const linked=await begin('linkedin',{intent:'link',cookie:signed.cookie}); await finish(linked,{claims:{sub:'disconnect-linkedin-owner'}});
    const other=sites('unrelated-owner'),otherFlow=await begin('linkedin',{user:other}); await finish(otherFlow,{claims:{sub:'unrelated-linkedin'}});
    const untouched=(await db.prepare('SELECT * FROM auth_identities WHERE owner_id=?').bind(other['oai-authenticated-user-id']).all()).results;
    const googleId=await connectionId(signed.identity.id,'google');
    const result=await call('/api/auth/disconnect',{method:'POST',cookie:signed.cookie,body:{provider:'linkedin',expectedAccountId:signed.identity.id,expectedConnectionId:await connectionId(signed.identity.id,'linkedin')}});
    assert.equal(result.status,200); assert.equal(result.data.ok,true);
    assert.equal(await connectionId(signed.identity.id,'linkedin'),undefined); assert.equal(await connectionId(signed.identity.id,'google'),googleId);
    assert.equal((await call('/api/auth/status',{cookie:signed.cookie})).data.account.id,signed.identity.id);
    assert.deepEqual((await db.prepare('SELECT * FROM auth_identities WHERE owner_id=?').bind(other['oai-authenticated-user-id']).all()).results,untouched);
  });

  await check('A final-statement database failure rolls back the entire disconnect and cannot report success',async()=>{
    const user=sites('atomic-disconnect'),ownerId=user['oai-authenticated-user-id'];
    const linked=await begin('google',{user}); await finish(linked,{claims:{sub:'atomic-google-subject'}});
    const signed=await login('atomic-google-subject'); await begin('google',{user});
    const expectedConnectionId=await connectionId(ownerId,'google');
    const tables=['auth_identities','browser_sessions','oauth_transactions','auth_deletion_fences'];
    const snapshots=await Promise.all(tables.map(async table=>(await db.prepare('SELECT * FROM '+table).all()).results));
    // Fail at the final identity deletion, after the same D1 batch has attempted
    // its fence, pending-flow and browser-session writes. SQLite must roll all
    // of those changes back, not merely skip the final deletion.
    await db.prepare(`CREATE TRIGGER synthetic_disconnect_abort BEFORE DELETE ON auth_identities
      WHEN OLD.owner_id='synthetic-atomic-disconnect' AND OLD.provider='google'
      BEGIN SELECT RAISE(ABORT,'synthetic final-delete failure'); END`).run();
    try {
      const result=await call('/api/auth/disconnect',{method:'POST',headers:user,body:{provider:'google',expectedAccountId:ownerId,expectedConnectionId}});
      assert.equal(result.status,503); assert.equal(result.data.ok,false); assert.equal(result.data.error.code,'auth_unavailable');
      for(let index=0;index<tables.length;index++)assert.deepEqual((await db.prepare('SELECT * FROM '+tables[index]).all()).results,snapshots[index],tables[index]+' must be unchanged after rollback');
      assert.equal((await call('/api/auth/status',{cookie:signed.cookie})).data.account.id,ownerId);
    } finally { await db.prepare('DROP TRIGGER synthetic_disconnect_abort').run(); }
    assert.equal((await call('/api/auth/disconnect',{method:'POST',headers:user,body:{provider:'google',expectedAccountId:ownerId,expectedConnectionId}})).status,200);
  });

  await check('A delayed disconnect cannot remove a deliberately recreated owner generation',async()=>{
    const user=sites('delayed-disconnect'),ownerId=user['oai-authenticated-user-id'];
    const first=await begin('linkedin',{user}); await finish(first,{claims:{sub:'old-subject'}});
    const expectedConnectionId=await connectionId(ownerId,'linkedin');
    let enter,release; const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve);
    const environment={...env,DB:{prepare:sql=>db.prepare(sql),async batch(statements){enter(); await gate; return db.batch(statements);}}};
    const pending=call('/api/auth/disconnect',{method:'POST',headers:user,body:{provider:'linkedin',expectedAccountId:ownerId,expectedConnectionId},environment});
    await entered; time+=1; await retireOwner(ownerId); time+=1;
    const replacement=await begin('linkedin',{user}); assert.equal(queryResult((await finish(replacement,{claims:{sub:'new-subject'}})).response),'connected');
    const before=(await db.prepare('SELECT * FROM auth_identities').all()).results;
    release(); const result=await pending;
    assert.equal(result.status,409); assert.equal(result.data.error.code,'connection_changed');
    assert.deepEqual((await db.prepare('SELECT * FROM auth_identities').all()).results,before); assert.notEqual(await connectionId(ownerId,'linkedin'),expectedConnectionId);
    assert.equal(await count('auth_accounts'),1);
  });

  await check('A same-owner same-subject relink has a fresh connection ID and survives an older disconnect',async()=>{
    const user=sites('relinked-disconnect'),ownerId=user['oai-authenticated-user-id'];
    const first=await begin('linkedin',{user}); await finish(first,{claims:{sub:'same-subject'}});
    const expectedConnectionId=await connectionId(ownerId,'linkedin'),generation=(await db.prepare('SELECT generation FROM auth_accounts WHERE owner_id=?').bind(ownerId).first()).generation;
    let enter,release; const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve);
    const environment={...env,DB:{prepare:sql=>db.prepare(sql),async batch(statements){enter(); await gate; return db.batch(statements);}}};
    const body={provider:'linkedin',expectedAccountId:ownerId,expectedConnectionId};
    const pending=call('/api/auth/disconnect',{method:'POST',headers:user,body,environment}); await entered;
    assert.equal((await call('/api/auth/disconnect',{method:'POST',headers:user,body})).status,200); time+=1;
    const replacement=await begin('linkedin',{user}); assert.equal(queryResult((await finish(replacement,{claims:{sub:'same-subject'}})).response),'connected');
    assert.equal((await db.prepare('SELECT generation FROM auth_accounts WHERE owner_id=?').bind(ownerId).first()).generation,generation);
    assert.notEqual(await connectionId(ownerId,'linkedin'),expectedConnectionId);
    const before=(await db.prepare('SELECT * FROM auth_identities').all()).results,fences=(await db.prepare('SELECT * FROM auth_deletion_fences').all()).results;
    release(); assert.equal((await pending).status,409);
    assert.equal((await call('/api/auth/disconnect',{method:'POST',headers:user,body})).status,409,'An old confirmation remains stale even when sent after the relink');
    assert.deepEqual((await db.prepare('SELECT * FROM auth_identities').all()).results,before); assert.deepEqual((await db.prepare('SELECT * FROM auth_deletion_fences').all()).results,fences);
  });

  await check('Revoking a Google session while disconnect is delayed preserves the selected LinkedIn connection',async()=>{
    const signed=await login('revoked-disconnect-session'),flow=await begin('linkedin',{intent:'link',cookie:signed.cookie}); await finish(flow,{claims:{sub:'keep-after-signout'}});
    const body={provider:'linkedin',expectedAccountId:signed.identity.id,expectedConnectionId:await connectionId(signed.identity.id,'linkedin')};
    let enter,release; const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve);
    const environment={...env,DB:{prepare:sql=>db.prepare(sql),async batch(statements){enter(); await gate; return db.batch(statements);}}};
    const pending=call('/api/auth/disconnect',{method:'POST',cookie:signed.cookie,body,environment}); await entered;
    const before=(await db.prepare('SELECT * FROM auth_identities ORDER BY provider').all()).results;
    assert.equal((await call('/api/auth/signout',{method:'POST',cookie:signed.cookie,body:{expectedAccountId:signed.identity.id}})).status,200);
    release(); assert.equal((await pending).status,409);
    assert.equal(await count('browser_sessions'),0); assert.equal(await count('auth_deletion_fences'),0);
    assert.deepEqual((await db.prepare('SELECT * FROM auth_identities ORDER BY provider').all()).results,before);
  });

  await check('A disconnect whose first lifecycle lookup follows deletion cannot affect a fresh link',async()=>{
    const user=sites('late-disconnect-lifecycle'),ownerId=user['oai-authenticated-user-id'],flow=await begin('linkedin',{user}); await finish(flow,{claims:{sub:'late-old'}});
    const expectedConnectionId=await connectionId(ownerId,'linkedin'); let injected=false;
    const environment={...env,DB:{batch:statements=>db.batch(statements),prepare(sql){const prepared=db.prepare(sql);if(!sql.startsWith('SELECT origin_method,generation FROM auth_accounts'))return prepared;return{bind(...args){const query=prepared.bind(...args);return{async first(){const account=await query.first();if(!injected){injected=true;time+=1;await retireOwner(ownerId);time+=1;const replacement=await begin('linkedin',{user});assert.equal(queryResult((await finish(replacement,{claims:{sub:'late-new'}})).response),'connected');}return account;}};}};}}};
    const result=await call('/api/auth/disconnect',{method:'POST',headers:user,body:{provider:'linkedin',expectedAccountId:ownerId,expectedConnectionId},environment});
    assert(injected); assert.equal(result.status,409); assert.equal(result.data.error.code,'account_changed');
    assert.equal((await db.prepare('SELECT subject FROM auth_identities WHERE owner_id=?').bind(ownerId).first()).subject,'late-new');
    assert.notEqual(await connectionId(ownerId,'linkedin'),expectedConnectionId);
  });

  await check('Deleting an account during provider I/O prevents a late link from recreating removed identity metadata',async()=>{
    const user=sites('deleted'),flow=await begin('linkedin',{user}); let enter,release;
    const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve);
    fetchBehavior=async address=>{if(address===OAUTH_PROVIDERS.linkedin.token){enter();await gate;}return null;};
    const completion=finish(flow); await entered;
    await db.batch(identityDeletionStatements(db,'synthetic-deleted',{now:time}));
    // Reusing the Sites login creates a new generation, never authority for the old callback.
    await db.prepare('INSERT INTO auth_accounts(owner_id,origin_method,generation,created_at) VALUES(?,?,?,?)').bind('synthetic-deleted','chatgpt',randomUUID(),time).run();
    release(); assert.equal(queryResult((await completion).response),'failed'); assert.equal(await count('auth_identities'),0);
  });

  await check('Deletion between callback binding and its atomic commit cannot resurrect a Google account or issue a cookie',async()=>{
    const signed=await login('delete-at-commit'),flow=await begin();
    let deleted=false;
    const environment={...env,DB:{prepare:sql=>db.prepare(sql),async batch(statements){if(!deleted){deleted=true;await db.batch(identityDeletionStatements(db,signed.identity.id,{now:time}));}return db.batch(statements);}}};
    const result=await finish(flow,{claims:{sub:'delete-at-commit'},environment});
    assert(deleted); assert.equal(queryResult(result.response),'failed'); assert.equal(cookieFrom(result.response,BROWSER_SESSION_COOKIE),undefined); assert.equal(await count('auth_accounts'),0); assert.equal(await count('browser_sessions'),0); assert.equal(await count('auth_identities'),0);
  });

  await check('Short-lived opaque deletion fences block anonymous logins begun before deletion; a deliberate later login starts a new blank account',async()=>{
    const signed=await login('deleted-subject'),pending=await begin(); time+=1;
    await db.batch(identityDeletionStatements(db,signed.identity.id,{now:time}));
    const fence=await db.prepare('SELECT * FROM auth_deletion_fences').first(); assert.match(fence.subject_hash,/^[a-f0-9]{64}$/); assert.notEqual(fence.subject_hash,sha256('google\0deleted-subject')); assert.equal(fence.expires_at-time,AUTH_LIMITS.transactionMilliseconds);
    assert.equal(queryResult((await finish(pending,{claims:{sub:'deleted-subject'}})).response),'failed'); assert.equal(await count('auth_accounts'),0);
    time+=1; const deliberate=await login('deleted-subject'); assert.notEqual(deliberate.identity.id,signed.identity.id); assert.equal(await count('workspaces'),0);
    time+=AUTH_LIMITS.transactionMilliseconds+1; await begin(); assert.equal(await count('auth_deletion_fences'),0);
  });

  await check('Revoking the Google browser session during a LinkedIn exchange prevents a late account connection',async()=>{
    const signed=await login(),flow=await begin('linkedin',{intent:'link',cookie:signed.cookie}); let enter,release;
    const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve);
    fetchBehavior=async address=>{if(address===OAUTH_PROVIDERS.linkedin.token){enter();await gate;}return null;};
    const completion=finish(flow); await entered; await db.prepare('DELETE FROM browser_sessions WHERE owner_id=?').bind(signed.identity.id).run(); release();
    assert.equal(queryResult((await completion).response),'failed'); assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM auth_identities WHERE provider='linkedin'").first()).n,0);
  });

  await check('Identity export is owner-scoped and credential-free; account deletion works before any workspace exists',async()=>{
    const a=await login('export-a'),b=await login('export-b'),data=await exportBrowserIdentity(env,a.identity.id);
    assert.equal(data.connections.length,1); assert.equal(data.connections[0].subject,'export-a'); assert.equal(data.browserSessions.length,1); assert.equal(data.browserSessions[0].method,'google');
    assert(!JSON.stringify(data).includes('token_hash')); assert(!JSON.stringify(data).includes(cookieToken(a.result.response,BROWSER_SESSION_COOKIE))); assert(!JSON.stringify(data).includes('export-b'));
    await db.batch(identityDeletionStatements(db,a.identity.id,{now:time}));
    assert.equal((await exportBrowserIdentity(env,a.identity.id)).connections.length,0); assert.equal((await exportBrowserIdentity(env,b.identity.id)).connections.length,1);
    assert.equal(await count('workspaces'),0); assert.equal((await call('/api/auth/status',{cookie:a.cookie})).status,401); assert.equal((await call('/api/auth/status',{cookie:b.cookie})).status,200);
  });

  await check('Guarded deletion preserves identities when a workspace appeared or the expected account generation changed',async()=>{
    const signed=await login('guarded-delete'),ownerId=signed.identity.id;
    const generation=(await db.prepare('SELECT generation FROM auth_accounts WHERE owner_id=?').bind(ownerId).first()).generation;
    await db.prepare('INSERT INTO workspaces(id,owner_id,owner_email,created_at,profile_json) VALUES(?,?,?,?,?)').bind('appeared-workspace',ownerId,signed.identity.email,new Date(time).toISOString(),'{}').run();
    await db.batch(identityDeletionStatements(db,ownerId,{now:time,expectedWorkspaceId:null,expectedGeneration:generation}));
    assert.equal(await count('auth_identities'),1); assert.equal(await count('browser_sessions'),1); assert.equal(await count('auth_deletion_fences'),0);
    await db.batch(identityDeletionStatements(db,ownerId,{now:time,expectedWorkspaceId:'appeared-workspace',expectedGeneration:generation}));
    assert.equal(await count('auth_identities'),1,'An unfenced workspace cannot authorize identity deletion');
    await db.prepare('UPDATE workspaces SET deleting_at=? WHERE owner_id=?').bind(new Date(time).toISOString(),ownerId).run();
    const replacement=randomUUID(); await db.prepare('UPDATE auth_accounts SET generation=? WHERE owner_id=?').bind(replacement,ownerId).run();
    await db.batch(identityDeletionStatements(db,ownerId,{now:time,expectedWorkspaceId:'appeared-workspace',expectedGeneration:generation}));
    assert.equal(await count('auth_identities'),1); assert.equal(await count('browser_sessions'),1); assert.equal(await count('auth_deletion_fences'),0);
    await db.batch(identityDeletionStatements(db,ownerId,{now:time,expectedWorkspaceId:'appeared-workspace',expectedGeneration:null}));
    assert.equal(await count('auth_identities'),1,'An initially absent auth account cannot authorize deleting a new generation');
    await db.batch(identityDeletionStatements(db,ownerId,{now:time,expectedWorkspaceId:'appeared-workspace',expectedGeneration:replacement}));
    assert.equal(await count('auth_identities'),0); assert.equal(await count('browser_sessions'),0); assert.equal(await count('auth_accounts'),0); assert.equal(await count('auth_deletion_fences'),1); assert.equal(await count('workspaces'),1);
  });

  await check('Deletion beginning after the connect precheck cannot create a new empty identity generation',async()=>{
    const user=sites('start-race'),ownerId=user['oai-authenticated-user-id'];
    await db.prepare('INSERT INTO workspaces(id,owner_id,owner_email,created_at,profile_json) VALUES(?,?,?,?,?)').bind('start-race-workspace',ownerId,'start-race@example.com',new Date(time).toISOString(),'{}').run();
    let injected=false;
    const environment={...env,DB:{batch:statements=>db.batch(statements),prepare(sql){
      const prepared=db.prepare(sql); if(!sql.startsWith('INSERT OR IGNORE INTO auth_accounts'))return prepared;
      return {bind(...args){const bound=prepared.bind(...args);return {async run(){injected=true;await db.prepare('UPDATE workspaces SET deleting_at=? WHERE owner_id=?').bind(new Date(time).toISOString(),ownerId).run();return bound.run();}};}};
    }}};
    const result=await call('/api/auth/connect',{method:'POST',headers:user,environment,body:{provider:'linkedin',expectedAccountId:ownerId}});
    assert(injected); assert.equal(result.status,409); assert.equal(result.data.error.code,'account_deleting'); assert.equal(await count('auth_accounts'),0); assert.equal(await count('oauth_transactions'),0); assert.equal(requests.length,0);
  });

  await check('A stale Google connect request cannot recreate an account deleted after initial cookie resolution',async()=>{
    const signed=await login('deleted-before-connect-insert'); let injected=false;
    const environment={...env,DB:{batch:statements=>db.batch(statements),prepare(sql){
      const prepared=db.prepare(sql); if(!sql.startsWith('INSERT OR IGNORE INTO auth_accounts'))return prepared;
      return {bind(...args){const bound=prepared.bind(...args);return {async run(){injected=true;await db.batch(identityDeletionStatements(db,signed.identity.id,{now:time}));return bound.run();}};}};
    }}};
    const result=await call('/api/auth/connect',{method:'POST',cookie:signed.cookie,environment,body:{provider:'linkedin',expectedAccountId:signed.identity.id}});
    assert(injected); assert.equal(result.status,401); assert.equal(result.data.error.code,'invalid_session');
    assert.equal(await count('auth_accounts'),0); assert.equal(await count('auth_identities'),0); assert.equal(await count('browser_sessions'),0); assert.equal(await count('oauth_transactions'),0);
  });

  await check('Revocation immediately before transaction insertion cannot leave a new pending Google-owned link',async()=>{
    const signed=await login('revoked-before-connect-insert'); let injected=false;
    const environment={...env,DB:{batch:statements=>db.batch(statements),prepare(sql){
      const prepared=db.prepare(sql); if(!sql.startsWith('INSERT INTO oauth_transactions'))return prepared;
      return {bind(...args){const bound=prepared.bind(...args);return {async run(){injected=true;await db.prepare('DELETE FROM browser_sessions WHERE owner_id=?').bind(signed.identity.id).run();return bound.run();}};}};
    }}};
    const result=await call('/api/auth/connect',{method:'POST',cookie:signed.cookie,environment,body:{provider:'linkedin',expectedAccountId:signed.identity.id}});
    assert(injected); assert.equal(result.status,409); assert.equal(await count('oauth_transactions'),0); assert.equal(await count('auth_identities'),1);
  });

  await check('Opaque lifecycle generations reject requests that first read after deletion and permit a later deliberate request',async()=>{
    const startedAt=time,initial=await captureOwnerLifecycle(env,'synthetic-lifecycle-owner',{startedAt,now:time}); time+=1;
    const retired=await retireOwner('synthetic-lifecycle-owner'); assert.equal(retired.previous.generation,initial.generation);
    await assert.rejects(captureOwnerLifecycle(env,'synthetic-lifecycle-owner',{startedAt,now:time}),error=>error.code==='account_changed');
    time+=1; const current=await captureOwnerLifecycle(env,'synthetic-lifecycle-owner',{startedAt:time,now:time}); assert.equal(current.key,initial.key); assert.equal(current.generation,retired.next.generation);
    const rows=(await db.prepare('SELECT * FROM account_lifecycles').all()).results; assert.equal(rows.length,1); assert.deepEqual(Object.keys(rows[0]).sort(),['deleted_at','generation','owner_hash']); assert(!JSON.stringify(rows).includes('synthetic-lifecycle-owner'));
    assert.notEqual(current.key,sha256('owner\0synthetic-lifecycle-owner'));
  });

  await check('A Sites link whose first lifecycle lookup occurs after deletion cannot recreate removed metadata',async()=>{
    const user=sites('delayed-first-lifecycle'); let injected=false;
    const environment={...env,DB:{batch:statements=>db.batch(statements),prepare(sql){
      const prepared=db.prepare(sql); if(!sql.startsWith("INSERT OR IGNORE INTO meta(key,value) VALUES('auth_fence_salt'"))return prepared;
      return {bind(...args){const bound=prepared.bind(...args);return {async run(){if(!injected){injected=true;time+=1;await retireOwner(user['oai-authenticated-user-id']);}return bound.run();}};}};
    }}};
    const result=await call('/api/auth/connect',{method:'POST',headers:user,environment,body:{provider:'linkedin',expectedAccountId:user['oai-authenticated-user-id']}});
    assert(injected); assert.equal(result.status,409); assert.equal(result.data.error.code,'account_changed'); assert.equal(await count('auth_accounts'),0); assert.equal(await count('oauth_transactions'),0);
  });

  await check('A captured Sites lifecycle cannot create a link after deletion rotates its generation',async()=>{
    const user=sites('deleted-sites-connect'); let injected=false;
    const environment={...env,DB:{batch:statements=>db.batch(statements),prepare(sql){
      const prepared=db.prepare(sql); if(!sql.startsWith('INSERT OR IGNORE INTO auth_accounts'))return prepared;
      return {bind(...args){const bound=prepared.bind(...args);return {async run(){injected=true;time+=1;await retireOwner(user['oai-authenticated-user-id']);return bound.run();}};}};
    }}};
    const result=await call('/api/auth/connect',{method:'POST',headers:user,environment,body:{provider:'linkedin',expectedAccountId:user['oai-authenticated-user-id']}});
    assert(injected); assert.equal(result.status,409); assert.equal(await count('auth_accounts'),0); assert.equal(await count('oauth_transactions'),0);
  });

  await check('A lifecycle rotation immediately before OAuth commit fences identity writes even before other deletion statements run',async()=>{
    const user=sites('lifecycle-commit'),flow=await begin('linkedin',{user}); let rotated=false;
    const environment={...env,DB:{prepare:sql=>db.prepare(sql),async batch(statements){
      if(!rotated){rotated=true;await db.prepare('UPDATE account_lifecycles SET generation=?,deleted_at=?').bind(randomUUID(),time).run();}
      return db.batch(statements);
    }}};
    const result=await finish(flow,{environment}); assert(rotated); assert.equal(queryResult(result.response),'failed'); assert.equal(await count('auth_identities'),0);
  });

  await check('A repeated deletion using an older lifecycle generation cannot remove a deliberately recreated Sites connection',async()=>{
    const user=sites('recreated-sites'),first=await begin('linkedin',{user}); assert.equal(queryResult((await finish(first)).response),'connected');
    time+=1; const {previous}=await retireOwner(user['oai-authenticated-user-id']); time+=1;
    const current=await begin('linkedin',{user}); assert.equal(queryResult((await finish(current,{claims:{sub:'deliberate-new-link'}})).response),'connected');
    await db.batch(identityDeletionStatements(db,user['oai-authenticated-user-id'],{now:time,lifecycle:previous}));
    assert.equal((await db.prepare('SELECT subject FROM auth_identities').first()).subject,'deliberate-new-link'); assert.equal(await count('auth_accounts'),1);
  });

  await check('Exact-origin JSON mutation, top-level navigation, safe return paths and callback expiry remain enforced',async()=>{
    const user=sites('origin'),body={provider:'linkedin',expectedAccountId:'synthetic-origin'};
    assert.equal((await call('/api/auth/connect',{method:'POST',body,headers:{...user,origin:'https://attacker.example'}})).status,403);
    assert.equal((await call('/api/auth/connect',{method:'POST',body,headers:{...user,origin:''}})).status,403);
    assert.equal((await call('/api/auth/connect',{method:'POST',body,headers:{...user,'content-type':'text/plain'}})).status,415);
    assert.equal((await call('/api/auth/connect',{method:'POST',body:{...body,extra:'x'.repeat(2100)},headers:user})).status,413);
    assert.equal((await call('/auth/google/start',{headers:{'sec-fetch-mode':'cors','sec-fetch-dest':'empty'}})).status,400);
    const flow=await begin('google',{returnTo:'https://attacker.example/steal'}); assert.equal((await db.prepare('SELECT return_to FROM oauth_transactions').first()).return_to,'/connect');
    time+=AUTH_LIMITS.transactionMilliseconds+1; assert.equal(queryResult((await finish(flow)).response),'failed'); assert.equal(tokenRequests(),0);
    assert.equal((await call('/api/auth/status',{headers:{host:'attacker.example'}})).status,403);
  });

  for (const cleanup of ['pending','rejected','resolved']) {
    await check(`Oversized account JSON retains its 413 despite ${cleanup} body cleanup`,async()=>{
      let cancelled=0,release=()=>{},timer;
      const pendingCleanup=cleanup==='pending'?new Promise(resolve=>{release=resolve}):null;
      const request=new Request(AUTH_ORIGIN+'/api/auth/connect',{method:'POST',headers:{Origin:AUTH_ORIGIN,'Content-Type':'application/json'},duplex:'half',body:new ReadableStream({
        start(controller){controller.enqueue(new Uint8Array(2049));},
        cancel(){cancelled++;if(cleanup==='rejected')return Promise.reject(new Error('Synthetic cancellation failure'));return pendingCleanup;},
      })});
      const pending=handler(request,env);
      try {
        const response=await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Oversized account request waited for transport cleanup')),1500);})]);
        assert.equal(response.status,413);assert.equal((await response.json()).error.code,'body_too_large');assert.equal(cancelled,1);assert.equal(request.body.locked,false);
        assert.equal(await count('oauth_transactions'),0);assert.equal(await count('auth_accounts'),0);assert.equal(requests.length,0);
      } finally { clearTimeout(timer);release();await pending; }
    });
  }

  for (const rejection of ['status','content-type','declared-oversize','streamed-oversize']) for (const cleanup of ['pending','rejected','resolved']) {
    await check(`Rejected OAuth ${rejection} response settles despite ${cleanup} body cleanup`,async()=>{
      let cancelled=0,release=()=>{},timer;
      const pendingCleanup=cleanup==='pending'?new Promise(resolve=>{release=resolve}):null;
      const response=new Response(new ReadableStream({
        start(controller){controller.enqueue(rejection==='streamed-oversize'?new Uint8Array(65537):new TextEncoder().encode('{}'));},
        cancel(){cancelled++;if(cleanup==='rejected')return Promise.reject(new Error('Synthetic cancellation failure'));return pendingCleanup;},
      }),{status:rejection==='status'?503:200,headers:{
        'Content-Type':rejection==='content-type'?'text/plain':'application/json',
        ...(rejection==='declared-oversize'?{'Content-Length':'65537'}:{}),
      }});
      const flow=await begin(),pending=finish(flow,{behavior:()=>response});
      try {
        const result=await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Rejected OAuth response waited for transport cleanup')),1500);})]);
        assert.equal(queryResult(result.response),'failed');assert.equal(cancelled,1);assert.equal(response.body.locked,false);
        assert.equal(await count('oauth_transactions'),0);assert.equal(await count('browser_sessions'),0);assert.equal(await count('auth_identities'),0);
        assert.equal(queryResult((await finish(flow)).response),'failed');assert.equal(tokenRequests(),1);
      } finally { clearTimeout(timer);release();await pending; }
    });
  }

  await check('Provider redirects and oversized token responses are refused without retry or following any URL',async()=>{
    for (const behavior of [()=>new Response('',{status:302,headers:{Location:'https://attacker.example'}}),()=>new Response('x'.repeat(65537),{headers:{'Content-Type':'application/json'}}),()=>Response.json({id_token:'x'.repeat(16385)})]) {
      const flow=await begin(),before=tokenRequests(),result=await finish(flow,{behavior}); assert.equal(queryResult(result.response),'failed'); assert.equal(await count('browser_sessions'),0);
      assert.equal(queryResult((await finish(flow)).response),'failed'); assert.equal(tokenRequests(),before+1);
    }
  });

  await check('A stalled provider body is cancelled within the bounded deadline and its claimed transaction cannot replay',async()=>{
    let cancelled=false;
    const flow=await begin(),started=Date.now();
    const result=await finish(flow,{behavior:()=>new Response(new ReadableStream({cancel(){cancelled=true}}),{headers:{'Content-Type':'application/json'}})});
    assert.equal(queryResult(result.response),'failed'); assert(cancelled); assert(Date.now()-started<10000); assert.equal(await count('oauth_transactions'),0);
    assert.equal(queryResult((await finish(flow)).response),'failed'); assert.equal(tokenRequests(),1);
  });


  await check('Callback diagnostics disclose only a fixed token-failure label and upstream status',async()=>{
    const canary='private-diagnostic-canary',user=sites(canary,canary+'@example.com'),flow=await begin('google',{user});
    const result=await finish(flow,{code:canary+'-authorization-code',behavior:()=>Response.json({error:canary,id_token:canary,access_token:canary},{status:400,headers:{Location:AUTH_ORIGIN+'/'+canary,'Set-Cookie':canary+'='+canary}})});
    assert.equal(result.status,303);assert.equal(result.response.headers.get('location'),'/account?oauth_provider=google&oauth_result=failed');
    assert.deepEqual(diagnostics,[{stage:'token_exchange',code:'provider_response_invalid',upstreamStatus:400}]);
    assert(Object.isFrozen(diagnostics[0]));assert(!JSON.stringify(diagnostics).includes(canary));
    assert.equal(await result.response.text(),'');assert.equal(await count('oauth_transactions'),0);assert.equal(await count('auth_identities'),0);assert.equal(await count('browser_sessions'),0);
  });

  await check('The production diagnostic sink excludes arbitrary error codes, messages, stacks and provider data',async()=>{
    const canary='private-exception-canary',flow=await begin('google',{user:sites(canary)}),logged=[],warn=console.warn;
    const productionLogger=createOAuthHandler({fetchImpl:fixture,clock:()=>time});
    console.warn=(...args)=>logged.push(args);
    try {
      const result=await finish(flow,{authHandler:productionLogger,behavior:()=>{throw new ApplicationError(canary+'-code',canary+'-message',403)}});
      assert.equal(result.status,303);assert.equal(queryResult(result.response),'failed');
    } finally { console.warn=warn; }
    assert.deepEqual(logged,[['career_oauth_callback_failure',JSON.stringify({stage:'token_exchange',code:'internal_error'})]]);
    assert(!JSON.stringify(logged).includes(canary));assert.equal(await count('oauth_transactions'),0);assert.equal(await count('auth_identities'),0);assert.equal(await count('browser_sessions'),0);
  });

  await check('Signed token and claim failures retain distinct safe stages without logging claims or prior HTTP status',async()=>{
    for(const [claims,stage] of [[{aud:'private-audience-canary'},'identity_verification'],[{nonce:'private-nonce-canary'},'claims_validation']]){
      await reset();
      const flow=await begin(),result=await finish(flow,{claims:{sub:'private-subject-canary',email:'private-email-canary@example.com',name:'private-name-canary',...claims}});
      assert.equal(queryResult(result.response),'failed');
      assert.deepEqual(diagnostics,[{stage,code:'provider_identity_invalid'}]);
      assert.equal(await count('oauth_transactions'),0);assert.equal(await count('auth_accounts'),0);assert.equal(await count('auth_identities'),0);assert.equal(await count('browser_sessions'),0);
    }
  });

  await check('JWKS transport and key-shape failures survive the public identity-error wrapper with accurate diagnostic stages',async()=>{
    for(const [response,expected] of [
      [()=>Response.json({error:'private-jwks-canary'},{status:503}),{stage:'jwks_fetch',code:'provider_response_invalid',upstreamStatus:503}],
      [()=>Response.json({keys:[],private:'private-jwks-canary'}),{stage:'jwks_validation',code:'provider_keys_invalid'}],
    ]){
      await reset();fetchBehavior=address=>address===OAUTH_PROVIDERS.google.jwks?response():null;
      const flow=await begin(),result=await finish(flow);
      assert.equal(result.status,303);assert.equal(queryResult(result.response),'failed');assert.deepEqual(diagnostics,[expected]);
      assert.equal(await count('oauth_transactions'),0);assert.equal(await count('auth_identities'),0);assert.equal(await count('browser_sessions'),0);
    }
  });

  await check('Overlapping callback diagnostics never share their stage, failure code or upstream status',async()=>{
    let reached,release;
    const waiting=new Promise(resolve=>{reached=resolve}),gate=new Promise(resolve=>{release=resolve});
    fetchBehavior=async address=>{if(address===OAUTH_PROVIDERS.google.jwks){reached();await gate;return Response.json({error:'private-overlap-key-canary'},{status:503})}return null};
    const keyFlow=await begin(),tokenFlow=await begin(),pending=finish(keyFlow);
    try {
      await waiting;
      const tokenResult=await finish(tokenFlow,{behavior:()=>Response.json({error:'private-overlap-token-canary'},{status:401})});
      assert.equal(queryResult(tokenResult.response),'failed');
      assert.deepEqual(diagnostics,[{stage:'token_exchange',code:'provider_response_invalid',upstreamStatus:401}]);
    } finally { release(); }
    assert.equal(queryResult((await pending).response),'failed');
    assert.deepEqual(diagnostics,[{stage:'token_exchange',code:'provider_response_invalid',upstreamStatus:401},{stage:'jwks_fetch',code:'provider_response_invalid',upstreamStatus:503}]);
    assert.equal(await count('oauth_transactions'),0);assert.equal(await count('auth_accounts'),0);assert.equal(await count('auth_identities'),0);assert.equal(await count('browser_sessions'),0);
  });

  await check('Successful and cancelled callbacks stay quiet while other provider errors emit one fixed label',async()=>{
    const user=sites('diagnostic-success'),success=await finish(await begin('google',{user}));
    assert.equal(queryResult(success.response),'connected');assert.deepEqual(diagnostics,[]);
    const cancelled=await finish(await begin('google',{user}),{error:'access_denied'});
    assert.equal(queryResult(cancelled.response),'cancelled');assert.deepEqual(diagnostics,[]);
    const rejected=await finish(await begin('google',{user}),{error:'private-provider-error-canary'});
    assert.equal(queryResult(rejected.response),'failed');
    assert.deepEqual(diagnostics,[{stage:'provider_response',code:'provider_rejected'}]);
    assert.equal(tokenRequests(),1);assert.equal(await count('oauth_transactions'),0);assert.equal(await count('auth_identities'),1);
  });

  for(const mode of ['throwing','rejecting','pending'])await check('A '+mode+' diagnostic sink cannot change or delay the callback failure and cleanup',async()=>{
    const events=[],unhandled=[],onUnhandled=error=>unhandled.push(error);
    const isolated=createOAuthHandler({fetchImpl:fixture,clock:()=>time,diagnosticSink:entry=>{
      events.push(entry);
      if(mode==='throwing')throw new Error('private-logger-canary');
      if(mode==='rejecting')return Promise.reject(new Error('private-logger-canary'));
      return new Promise(()=>{});
    }});
    const flow=await begin('google',{user:sites('logger-isolation')}),work=finish(flow,{authHandler:isolated,behavior:()=>{throw new Error('private-network-canary')}});
    let timer;
    process.on('unhandledRejection',onUnhandled);
    try {
      const result=await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Callback waited for diagnostics')),1500)})]);
      assert.equal(result.status,303);assert.equal(result.response.headers.get('location'),'/account?oauth_provider=google&oauth_result=failed');
      assert.match(result.response.headers.get('set-cookie'),/Max-Age=0/);
      assert.deepEqual(events,[{stage:'token_exchange',code:'provider_unavailable'}]);assert.deepEqual(diagnostics,[]);
      assert.equal(await count('oauth_transactions'),0);assert.equal(await count('auth_identities'),0);assert.equal(await count('browser_sessions'),0);
      await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(unhandled,[]);
    } finally { clearTimeout(timer);process.removeListener('unhandledRejection',onUnhandled);await work; }
  });

  await check('Shared rate budgets reject excess starts and never retain raw network addresses',async()=>{
    for(let i=0;i<10;i++) await begin();
    const blocked=await call('/auth/google/start'); assert.equal(blocked.status,429); assert.equal(blocked.response.headers.get('retry-after'),'60');
    assert.equal(await count('oauth_transactions'),10); assert.equal(requests.length,0);
    const rates=(await db.prepare('SELECT * FROM auth_rates').all()).results; assert(rates.every(row=>row.key==='global'||/^client:[a-f0-9]{64}$/.test(row.key)));
  });

  console.log(`Authentication verification: ${groups.length} groups passed against isolated D1 and actual synthetic RS256 signatures. No live provider or employer requests.`);
} finally { await mf.dispose(); }
