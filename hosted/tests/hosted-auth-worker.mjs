import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {AUTH_ORIGIN,BROWSER_SESSION_COOKIE,OAUTH_BROWSER_COOKIE} from '../server/identity.mjs';
import {OAUTH_PROVIDERS} from '../server/oauth.mjs';
import {sha256} from '../server/validation.mjs';

const key=await generateKeyPair('RS256'),jwk={...await exportJWK(key.publicKey),kid:'worker-synthetic',alg:'RS256',use:'sig'};
const clientIds={google:'runtime-google.apps.googleusercontent.com',linkedin:'runtime-linkedin'};
const codeFixtures=new Map(),userInfos=new Map(); let providerRequests=0,checks=0;
// This fixture wraps the exported production handler. The only injected provider
// transport is an isolated service binding, with no outbound-network fallback.
// Miniflare's loopback URL is adapted to the configured deployment URL as in the
// existing hosted-worker.mjs runtime check.
const output=await build({stdin:{contents:`
import {createOAuthHandler} from './server/oauth.mjs';
import {AUTH_ORIGIN,resolveBrowserIdentity,stripInternalIdentityHeaders,verifiedSSRRequest} from './server/identity.mjs';
export default {async fetch(request,env){
  const original=new URL(request.url),headers=new Headers(request.headers);headers.set('host',new URL(AUTH_ORIGIN).host);
  if(['/auth/google/start','/auth/linkedin/start'].includes(original.pathname)){headers.set('sec-fetch-mode','navigate');headers.set('sec-fetch-dest','document');}
  const adapted=stripInternalIdentityHeaders(new Request(AUTH_ORIGIN+original.pathname+original.search,new Request(request,{headers})));
  const auth=createOAuthHandler({fetchImpl:(url,options)=>env.SYNTHETIC_PROVIDER.fetch(new Request(url,options))});
  const response=await auth(adapted,env);if(response)return response;
  const identity=await resolveBrowserIdentity(adapted,env),verified=verifiedSSRRequest(adapted,identity);
  return Response.json({identity,headers:Object.fromEntries([...verified.headers].filter(([name])=>name.startsWith('x-career-')))});
}};`,resolveDir:process.cwd(),sourcefile:'isolated-auth-runtime.mjs'},bundle:true,format:'esm',platform:'neutral',mainFields:['module','main'],target:'es2022',external:['node:*'],write:false});
const mf=new Miniflare(convertV4MiniflareOptions({
  modules:true,script:output.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],
  bindings:{CAREER_GOOGLE_CLIENT_ID:clientIds.google,CAREER_GOOGLE_CLIENT_SECRET:'runtime-google-synthetic-secret',CAREER_LINKEDIN_CLIENT_ID:clientIds.linkedin,CAREER_LINKEDIN_CLIENT_SECRET:'runtime-linkedin-synthetic-secret'},
  serviceBindings:{SYNTHETIC_PROVIDER:async request=>{
    providerRequests++;
    const provider=Object.keys(OAUTH_PROVIDERS).find(name=>[OAUTH_PROVIDERS[name].jwks,OAUTH_PROVIDERS[name].token,OAUTH_PROVIDERS[name].userinfo].includes(request.url));
    assert(provider,'Unknown upstream URL must never leave this fixture'); assert.equal(new URL(request.url).search,'');
    if(request.url===OAUTH_PROVIDERS[provider].jwks){assert.equal(request.method,'GET');return Response.json({keys:[jwk]});}
    if(request.url===OAUTH_PROVIDERS.linkedin.userinfo){const info=userInfos.get(request.headers.get('Authorization')?.replace(/^Bearer /,''));assert(info);return Response.json(info);}
    assert.equal(request.method,'POST'); const form=new URLSearchParams(await request.text()),fixture=codeFixtures.get(form.get('code'));
    assert(fixture); codeFixtures.delete(form.get('code')); assert.equal(form.get('client_id'),clientIds[provider]); assert.equal(form.get('redirect_uri'),AUTH_ORIGIN+`/auth/${provider}/callback`);
    if(provider==='google')assert.equal(Buffer.from(sha256(form.get('code_verifier')),'hex').toString('base64url'),fixture.authorization.searchParams.get('code_challenge'));
    const issued=Math.floor(Date.now()/1000),jwt=await new SignJWT({sub:fixture.subject??'runtime-'+provider,iss:provider==='google'?'https://accounts.google.com':'https://www.linkedin.com',aud:fixture.wrongAudience?'another-client':clientIds[provider],iat:issued,exp:issued+300,nonce:fixture.authorization.searchParams.get('nonce'),...(fixture.missingEmail?{}:{email:'fixture%tag@example.com',email_verified:true}),name:'Synthetic 名字'}).setProtectedHeader({alg:'RS256',kid:'worker-synthetic'}).sign(key.privateKey);
    const token='synthetic-access-not-retained-'+form.get('code');userInfos.set(token,fixture.userinfo??{sub:fixture.subject??'runtime-'+provider});return Response.json({id_token:jwt,access_token:token});
  }},
}));
const cookie=(response,name)=>response.headers.getSetCookie().map(value=>value.split(';')[0]).find(value=>value.startsWith(name+'='));
async function call(path,{status=200,...options}={}){
  // Do not follow provider redirects: every provider response comes from the
  // synthetic service binding, never the public Google/LinkedIn endpoints.
  const response=await mf.dispatchFetch(AUTH_ORIGIN+path,{...options,redirect:'manual'});
  assert.equal(response.status,status,await response.clone().text()); checks++;
  return {response,data:response.headers.get('content-type')?.includes('application/json')?await response.clone().json():null};
}
const jsonHeaders={Origin:AUTH_ORIGIN,'Content-Type':'application/json'};
try{
  const db=await mf.getD1Database('DB');
  for(const file of(await readdir(new URL('../drizzle/',import.meta.url))).filter(file=>file.endsWith('.sql')).sort())for(const statement of(await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')).split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean))await db.prepare(statement).run();
  const anonymous=await call('/api/auth/status'); assert.equal(anonymous.data.account,null); assert.equal(anonymous.data.providers.google.configured,true);
  const start=await call('/auth/google/start?return_to=%2Fphone',{status:303}),authorization=new URL(start.response.headers.get('location')),oauthCookie=cookie(start.response,OAUTH_BROWSER_COOKIE);
  codeFixtures.set('runtime-google-code',{authorization});
  const signed=await call(`/auth/google/callback?state=${authorization.searchParams.get('state')}&code=runtime-google-code`,{status:303,headers:{Cookie:oauthCookie}});
  assert.equal(signed.response.headers.get('location'),'/phone?oauth_provider=google&oauth_result=signed_in');
  const session=cookie(signed.response,BROWSER_SESSION_COOKIE); assert(session); assert.match(signed.response.headers.getSetCookie().find(value=>value.startsWith(BROWSER_SESSION_COOKIE+'=')),/Secure; HttpOnly; SameSite=Lax/);
  const sites={'oai-authenticated-user-id':'runtime-sites-owner','oai-authenticated-user-email':'sites@example.com'};
  const status=await call('/api/auth/status',{headers:{Cookie:session,...sites}}),owner=status.data.account.id; assert.equal(status.data.account.method,'google'); assert.notEqual(owner,sites['oai-authenticated-user-id']);
  const probe=await call('/ssr-test-only',{headers:{Cookie:session,...sites,'x-career-user-id':'forged','x-career-forged':'unsafe'}});
  assert.equal(probe.data.headers['x-career-user-id'],owner); assert.equal(decodeURIComponent(probe.data.headers['x-career-user-email']),'fixture%tag@example.com'); assert.equal(decodeURIComponent(probe.data.headers['x-career-user-name']),'Synthetic 名字'); assert.equal(probe.data.headers['x-career-forged'],undefined);
  const siteProbe=await call('/ssr-test-only',{headers:{...sites,'x-career-user-id':'forged'}}); assert.equal(siteProbe.data.identity.id,'runtime-sites-owner');
  const linked=await call('/api/auth/connect',{method:'POST',headers:{...jsonHeaders,Cookie:session},body:JSON.stringify({provider:'linkedin',expectedAccountId:owner})}),linkedin=new URL(linked.data.authorizationUrl);
  assert.equal(linkedin.searchParams.get('scope'),'openid profile'); codeFixtures.set('runtime-linkedin-code',{authorization:linkedin});
  const connected=await call(`/auth/linkedin/callback?state=${linkedin.searchParams.get('state')}&code=runtime-linkedin-code`,{status:303,headers:{Cookie:session+'; '+cookie(linked.response,OAUTH_BROWSER_COOKIE)}});
  assert.equal(connected.response.headers.get('location'),'/account?oauth_provider=linkedin&oauth_result=connected');
  const after=await call('/api/auth/status',{headers:{Cookie:session}}); assert.equal(after.data.providers.linkedin.connected,true); assert.equal(after.data.account.id,owner);
  assert.equal((await db.prepare("SELECT email FROM auth_identities WHERE provider='linkedin'").first()).email,null);
  assert.match(after.data.providers.google.connectionId,/^[a-f0-9]{64}$/); assert.match(after.data.providers.linkedin.connectionId,/^[a-f0-9]{64}$/);
  const soleLogin=await call('/api/auth/disconnect',{status:409,method:'POST',headers:{...jsonHeaders,Cookie:session},body:JSON.stringify({provider:'google',expectedAccountId:owner,expectedConnectionId:after.data.providers.google.connectionId})});
  assert.equal(soleLogin.data.error.code,'login_method_required');
  for (const expectedConnectionId of [undefined,'a'.repeat(64)]) {
    const stale=await call('/api/auth/disconnect',{status:409,method:'POST',headers:{...jsonHeaders,Cookie:session},body:JSON.stringify({provider:'linkedin',expectedAccountId:owner,...(expectedConnectionId?{expectedConnectionId}:{})})});
    assert.equal(stale.data.error.code,'connection_changed');
  }
  await call('/api/auth/disconnect',{method:'POST',headers:{...jsonHeaders,Cookie:session},body:JSON.stringify({provider:'linkedin',expectedAccountId:owner,expectedConnectionId:after.data.providers.linkedin.connectionId})});
  const disconnected=await call('/api/auth/status',{headers:{Cookie:session}}); assert.equal(disconnected.data.providers.linkedin.connected,false); assert.equal(disconnected.data.providers.linkedin.connectionId,undefined); assert.equal(disconnected.data.providers.google.connected,true); assert.equal(disconnected.data.account.id,owner);
  const signout=await call('/api/auth/signout',{method:'POST',headers:{...jsonHeaders,Cookie:session},body:JSON.stringify({expectedAccountId:owner})}); assert.equal(signout.data.redirectTo,'/signout-with-chatgpt?return_to=%2Fconnect');
  const invalid=await call('/api/auth/status',{status:401,headers:{Cookie:session,...sites}}); assert.equal(invalid.data.error.code,'invalid_session');
  const recovered=await call('/api/auth/signout',{method:'POST',headers:{...jsonHeaders,Cookie:session,...sites},body:JSON.stringify({expectedAccountId:''})}); assert.equal(recovered.data.redirectTo,'/signout-with-chatgpt?return_to=%2Fconnect');
  const badStart=await call('/auth/google/start',{status:303}),badAuthorization=new URL(badStart.response.headers.get('location'));
  codeFixtures.set('runtime-wrong-audience',{authorization:badAuthorization,wrongAudience:true});
  const denied=await call(`/auth/google/callback?state=${badAuthorization.searchParams.get('state')}&code=runtime-wrong-audience`,{status:303,headers:{Cookie:cookie(badStart.response,OAUTH_BROWSER_COOKIE)}});
  assert.equal(new URL(denied.response.headers.get('location'),AUTH_ORIGIN).searchParams.get('oauth_result'),'failed'); assert.equal(cookie(denied.response,BROWSER_SESSION_COOKIE),undefined);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM browser_sessions').first()).n,0);
  const linkedinStart=await call('/auth/linkedin/start?return_to=%2Fphone',{status:303}),linkedinLogin=new URL(linkedinStart.response.headers.get('location'));
  assert.equal(linkedinLogin.searchParams.get('scope'),'openid profile email');
  codeFixtures.set('linkedin-runtime-login',{authorization:linkedinLogin,missingEmail:true,userinfo:{sub:'runtime-linkedin',email:'linkedin@example.com',email_verified:true}});
  const linkedinSigned=await call(`/auth/linkedin/callback?state=${linkedinLogin.searchParams.get('state')}&code=linkedin-runtime-login`,{status:303,headers:{Cookie:cookie(linkedinStart.response,OAUTH_BROWSER_COOKIE)}});
  assert.equal(linkedinSigned.response.headers.get('location'),'/phone?oauth_provider=linkedin&oauth_result=signed_in');
  const linkedinSession=cookie(linkedinSigned.response,BROWSER_SESSION_COOKIE);assert(linkedinSession);
  const linkedinStatus=await call('/api/auth/status',{headers:{Cookie:linkedinSession,...sites}}),linkedinOwner=linkedinStatus.data.account.id;
  assert.equal(linkedinStatus.data.account.method,'linkedin');assert.equal(linkedinStatus.data.account.email,'linkedin@example.com');assert.notEqual(linkedinOwner,sites['oai-authenticated-user-id']);
  const linkedinSSR=await call('/ssr-test-only',{headers:{Cookie:linkedinSession,...sites,'x-career-user-id':'forged'}});assert.equal(linkedinSSR.data.headers['x-career-user-id'],linkedinOwner);assert.equal(linkedinSSR.data.headers['x-career-user-method'],'linkedin');
  const protectedLinkedin=await call('/api/auth/disconnect',{status:409,method:'POST',headers:{...jsonHeaders,Cookie:linkedinSession},body:JSON.stringify({provider:'linkedin',expectedAccountId:linkedinOwner,expectedConnectionId:linkedinStatus.data.providers.linkedin.connectionId})});assert.equal(protectedLinkedin.data.error.code,'login_method_required');
  await call('/api/auth/signout',{method:'POST',headers:{...jsonHeaders,Cookie:linkedinSession},body:JSON.stringify({expectedAccountId:linkedinOwner})});
  assert.equal((await call('/api/auth/status',{status:401,headers:{Cookie:linkedinSession,...sites}})).data.error.code,'invalid_session');
  const accountCount=(await db.prepare('SELECT COUNT(*) AS n FROM auth_accounts').first()).n;
  const optionalStart=await call('/auth/linkedin/start',{status:303}),optionalAuthorization=new URL(optionalStart.response.headers.get('location'));
  codeFixtures.set('linkedin-no-email',{authorization:optionalAuthorization,subject:'runtime-email-absent',missingEmail:true});
  const optional=await call(`/auth/linkedin/callback?state=${optionalAuthorization.searchParams.get('state')}&code=linkedin-no-email`,{status:303,headers:{Cookie:cookie(optionalStart.response,OAUTH_BROWSER_COOKIE)}});
  assert.equal(new URL(optional.response.headers.get('location'),AUTH_ORIGIN).searchParams.get('oauth_result'),'email_required');assert.equal(cookie(optional.response,BROWSER_SESSION_COOKIE),undefined);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM auth_accounts').first()).n,accountCount);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM browser_sessions').first()).n,0);
  assert.equal(providerRequests,12);
  console.log(JSON.stringify({result:'PASS',actualWorkerdAuthRequests:checks,syntheticProviderRequests:providerRequests,realProviderRequests:0,realEmployerRequests:0}));
}finally{await mf.dispose()}
