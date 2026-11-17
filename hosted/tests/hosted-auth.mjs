import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {createOAuthHandler,OAUTH_PROVIDERS} from '../server/oauth.mjs';
import {AUTH_ORIGIN,AUTH_LIMITS,BROWSER_SESSION_COOKIE,OAUTH_BROWSER_COOKIE,resolveBrowserIdentity,exportBrowserIdentity,identityDeletionStatements,stripInternalIdentityHeaders,verifiedSSRRequest,captureOwnerLifecycle} from '../server/identity.mjs';
import {sha256} from '../server/validation.mjs';

// Real cryptographic signatures and an isolated actual D1 database. This adapter
// has no fallback to fetch: no provider account, secret, employer or network is used.
const mf = new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("isolated authentication fixture")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']}));
const key = await generateKeyPair('RS256'), otherKey = await generateKeyPair('RS256');
const publicKey = {...await exportJWK(key.publicKey),kid:'synthetic-key',alg:'RS256',use:'sig'};
const secretFixture = 'synthetic-provider-token-never-store';
let db,env,handler,time = Date.now(),requests = [],codes = new Map(),fetchBehavior = null;
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
  const result = await call(intent === 'login' ? '/auth/google/start?return_to='+encodeURIComponent(returnTo) : '/api/auth/connect',intent === 'login' ? {cookie} : {method:'POST',cookie,headers:user,body:{provider,expectedAccountId:user?.['oai-authenticated-user-id'] ?? (await resolveBrowserIdentity(new Request(AUTH_ORIGIN,{headers:{cookie}}),env,{now:time})).id}});
  assert.equal(result.status,intent === 'login' ? 303 : 200,JSON.stringify(result.data));
  const authorization = new URL(result.data?.authorizationUrl ?? result.response.headers.get('location'));
  const oauthCookie = cookieFrom(result.response,OAUTH_BROWSER_COOKIE);
  assert(oauthCookie);
  return {provider,authorization,state:authorization.searchParams.get('state'),nonce:authorization.searchParams.get('nonce'),cookie:[cookie,oauthCookie].filter(Boolean).join('; '),user,response:result.response};
}
async function finish(flow,{claims={},headers=flow.user,cookie=flow.cookie,environment=env,authHandler=handler,behavior,error,code=randomUUID()}={}) {
  codes.set(code,{flow,claims,behavior});
  const path=`/auth/${flow.provider}/callback?state=${flow.state}&${error === undefined ? 'code='+code : 'error='+encodeURIComponent(error)}`;
  return call(path,{cookie,headers,environment,authHandler});
}
async function login(subject='synthetic-google',{claims={},user}={}) {
  const flow = await begin('google'),result = await finish(flow,{claims:{sub:subject,...claims},headers:user});
  assert.equal(queryResult(result.response),'signed_in',JSON.stringify(result.data));
  const cookie = cookieFrom(result.response,BROWSER_SESSION_COOKIE);
  const identity = await resolveBrowserIdentity(new Request(AUTH_ORIGIN,{headers:{cookie}}),env,{now:time});
  return {flow,result,cookie,identity};
}
async function fixture(address,options) {
  const provider = Object.keys(OAUTH_PROVIDERS).find(name => [OAUTH_PROVIDERS[name].token,OAUTH_PROVIDERS[name].jwks].includes(address));
  assert(provider,'Only fixed Google/LinkedIn token or public JWKS URLs are permitted');
  assert.equal(options.redirect,'manual'); assert(options.signal instanceof AbortSignal);
  assert.equal(new URL(address).search,'');
  requests.push({address,method:options.method});
  if (fetchBehavior) { const value = await fetchBehavior(address,options); if (value) return value; }
  if (address === OAUTH_PROVIDERS[provider].jwks) { assert.equal(options.method,'GET'); return Response.json({keys:[publicKey]}); }
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
  return Response.json({token_type:'Bearer',access_token:secretFixture,refresh_token:secretFixture+'-refresh',id_token:token});
}
async function reset() {
  requests=[]; codes=new Map(); fetchBehavior=null; time+=61000;
  await db.batch(['oauth_transactions','browser_sessions','auth_identities','auth_accounts','auth_deletion_fences','auth_rates','workspaces','account_lifecycles'].map(table => db.prepare('DELETE FROM '+table)));
  handler=createOAuthHandler({fetchImpl:fixture,clock:()=>time});
}
async function check(name,action) { await reset(); await action(); groups.push(name); console.log('PASS',name); }
const count = async table => (await db.prepare('SELECT COUNT(*) AS n FROM '+table).first()).n;
const tokenRequests = () => requests.filter(request => request.method === 'POST').length;
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
    for (const statement of (await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')).split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
  env={DB:db,CAREER_GOOGLE_CLIENT_ID:'synthetic-google.apps.googleusercontent.com',CAREER_GOOGLE_CLIENT_SECRET:'synthetic-google-secret',CAREER_LINKEDIN_CLIENT_ID:'synthetic-linkedin',CAREER_LINKEDIN_CLIENT_SECRET:'synthetic-linkedin-secret'};

  await check('Unconfigured providers stay unavailable; Sites identity and verified SSR boundaries remain intact',async()=>{
    const anonymous=await call('/api/auth/status',{environment:{DB:db}});
    assert.deepEqual(anonymous.data,{ok:true,account:null,providers:{google:{configured:false,connected:false},linkedin:{configured:false,connected:false}}});
    assert.equal((await call('/auth/google/start',{environment:{DB:db}})).status,503); assert.equal(requests.length,0);
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
    const repeat=await login('google-one',{claims:{email:'updated@example.com'}}); assert.equal(repeat.identity.id,a.identity.id); assert.equal(repeat.identity.email,'updated@example.com');
    const site=await call('/api/auth/status',{headers:sites('person','person@example.com')}); assert.notEqual(site.data.account.id,a.identity.id);
    assert.equal(await count('auth_accounts'),2);
  });

  await check('Explicit Google linking preserves the exact Sites owner and subsequent Google login returns that owner',async()=>{
    const user=sites('link-owner'),flow=await begin('google',{user}),result=await finish(flow,{claims:{sub:'linked-google',email:'different@example.com'}});
    assert.equal(queryResult(result.response),'connected'); assert.equal(cookieFrom(result.response,BROWSER_SESSION_COOKIE),undefined);
    const linked=await login('linked-google',{claims:{email:'different@example.com'}}); assert.equal(linked.identity.id,'synthetic-link-owner');
    assert.equal((await db.prepare('SELECT origin_method FROM auth_accounts WHERE owner_id=?').bind(linked.identity.id).first()).origin_method,'chatgpt');
  });

  await check('LinkedIn is a basic openid/profile connection with no email, application profile import or login session',async()=>{
    const user=sites('linkedin-owner'),flow=await begin('linkedin',{user});
    assert.equal(flow.authorization.searchParams.get('scope'),'openid profile'); assert.equal(flow.authorization.searchParams.has('code_challenge'),false); assert(flow.nonce);
    const result=await finish(flow,{claims:{sub:'linkedin-person'}}); assert.equal(queryResult(result.response),'connected');
    const stored=await db.prepare("SELECT * FROM auth_identities WHERE provider='linkedin'").first(); assert.equal(stored.email,null); assert.equal(stored.owner_id,'synthetic-linkedin-owner'); assert.equal(stored.display_name,'Synthetic Person');
    assert.equal(await count('browser_sessions'),0); assert.equal(await count('workspaces'),0);
    const status=await call('/api/auth/status',{headers:user}); assert.equal(status.data.providers.linkedin.connected,true); assert.equal(status.data.account.method,'chatgpt');
    assert.equal(await handler(new Request(AUTH_ORIGIN+'/auth/linkedin/start'),env),null);
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

  await check('Cancellation consumes state without exchanging a code; hostile error descriptions never reach the redirect',async()=>{
    const flow=await begin(),cancelled=await finish(flow,{error:'access_denied'}); assert.equal(queryResult(cancelled.response),'cancelled'); assert.equal(tokenRequests(),0);
    assert.equal(queryResult((await finish(flow)).response),'failed');
    const second=await begin(),failed=await finish(second,{error:'<script>synthetic-secret</script>'}); assert.equal(queryResult(failed.response),'failed'); assert(!failed.response.headers.get('location').includes('synthetic-secret')); assert.equal(tokenRequests(),0);
  });

  await check('Account changes between connect and callback fail before provider exchange; links cannot transfer between owners',async()=>{
    const alice=sites('alice'),bob=sites('bob'),flow=await begin('linkedin',{user:alice});
    assert.equal(queryResult((await finish(flow,{headers:bob})).response),'failed'); assert.equal(tokenRequests(),0); assert.equal(await count('auth_identities'),0);
    const own=await begin('linkedin',{user:alice}); assert.equal(queryResult((await finish(own,{claims:{sub:'same-person'}})).response),'connected');
    const other=await begin('linkedin',{user:bob}); assert.equal(queryResult((await finish(other,{claims:{sub:'same-person'}})).response),'failed');
    const row=await db.prepare('SELECT owner_id FROM auth_identities').first(); assert.equal(row.owner_id,'synthetic-alice');
    const wrong=await call('/api/auth/connect',{method:'POST',headers:bob,body:{provider:'google',expectedAccountId:'synthetic-alice'}}); assert.equal(wrong.status,409);
  });

  await check('Concurrent links for the same provider subject create one owner association and never merge either account',async()=>{
    const a=await begin('linkedin',{user:sites('a')}),b=await begin('linkedin',{user:sites('b')});
    const results=await Promise.all([a,b].map(flow=>finish(flow,{claims:{sub:'contended-subject'}})));
    assert.deepEqual(results.map(value=>queryResult(value.response)).sort(),['connected','failed']); assert.equal(await count('auth_identities'),1); assert.equal(await count('auth_accounts'),2);
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
    assert.equal((await call('/api/auth/disconnect',{method:'POST',cookie:signed.cookie,body:{provider:'google',expectedAccountId:signed.identity.id}})).data.error.code,'login_method_required');
    const user=sites('original'),flow=await begin('google',{user}); await finish(flow,{claims:{sub:'original-google'}});
    const google=await login('original-google'); const pending=await begin('google',{user}),anonymousPending=await begin();
    assert.equal((await call('/api/auth/disconnect',{method:'POST',headers:user,body:{provider:'google',expectedAccountId:'synthetic-original'}})).status,200);
    assert.equal((await call('/api/auth/status',{cookie:google.cookie,headers:user})).status,401);
    assert.equal(queryResult((await finish(pending,{claims:{sub:'original-google'}})).response),'failed');
    assert.equal(queryResult((await finish(anonymousPending,{claims:{sub:'original-google'}})).response),'failed');
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM auth_identities WHERE owner_id=?').bind('synthetic-original').first()).n,0);
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

  await check('Shared rate budgets reject excess starts and never retain raw network addresses',async()=>{
    for(let i=0;i<10;i++) await begin();
    const blocked=await call('/auth/google/start'); assert.equal(blocked.status,429); assert.equal(blocked.response.headers.get('retry-after'),'60');
    assert.equal(await count('oauth_transactions'),10); assert.equal(requests.length,0);
    const rates=(await db.prepare('SELECT * FROM auth_rates').all()).results; assert(rates.every(row=>row.key==='global'||/^client:[a-f0-9]{64}$/.test(row.key)));
  });

  console.log(`Authentication verification: ${groups.length} groups passed against isolated D1 and actual synthetic RS256 signatures. No live provider or employer requests.`);
} finally { await mf.dispose(); }
