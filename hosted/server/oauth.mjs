import {createHmac, randomUUID} from 'node:crypto';
import {createLocalJWKSet, jwtVerify} from 'jose';
import {ApplicationError, fail, object, sha256} from './validation.mjs';
import {
  AUTH_ORIGIN, AUTH_LIMITS, BROWSER_SESSION_COOKIE, OAUTH_BROWSER_COOKIE,
  opaqueToken, equalSecret, cookieValue, sessionCookie, clearBrowserSessionCookie,
  oauthBrowserCookie, clearOAuthBrowserCookie, providerSubjectHash, resolveBrowserIdentity, captureOwnerLifecycle,
} from './identity.mjs';

// Fixed, documented provider endpoints. No URL, issuer, key or callback is taken
// from the browser, an ID token, provider discovery, or environment configuration.
export const OAUTH_PROVIDERS = Object.freeze({
  google:Object.freeze({
    authorization:'https://accounts.google.com/o/oauth2/v2/auth', token:'https://oauth2.googleapis.com/token',
    jwks:'https://www.googleapis.com/oauth2/v3/certs', issuer:['https://accounts.google.com','accounts.google.com'],
    scope:'openid email profile', prefix:'CAREER_GOOGLE',
  }),
  linkedin:Object.freeze({
    authorization:'https://www.linkedin.com/oauth/v2/authorization', token:'https://www.linkedin.com/oauth/v2/accessToken',
    jwks:'https://www.linkedin.com/oauth/openid/jwks', issuer:'https://www.linkedin.com',
    scope:'openid profile', prefix:'CAREER_LINKEDIN',
  }),
});
const RETURN_PATHS = new Set(['/phone','/account','/connect']);
const MAX_JSON_BYTES = 2048, PROVIDER_TIMEOUT = 6000, MAX_TOKEN_BYTES = 65536, MAX_JWKS_BYTES = 131072;
const MAX_PENDING = 1000, MAX_STARTS_PER_MINUTE = 60, MAX_CLIENT_STARTS = 10;
const iso = milliseconds => new Date(milliseconds).toISOString();
const providerName = value => { if (!Object.hasOwn(OAUTH_PROVIDERS, value)) fail('invalid_provider','Choose Google or LinkedIn.',400); return value; };
const safeReturn = (value, fallback) => RETURN_PATHS.has(value) ? value : fallback;
function configured(env, provider) {
  const prefix = OAUTH_PROVIDERS[provider].prefix, clientId = env[`${prefix}_CLIENT_ID`], clientSecret = env[`${prefix}_CLIENT_SECRET`];
  if (typeof clientId !== 'string' || !/^[A-Za-z0-9._-]{5,255}$/.test(clientId) || typeof clientSecret !== 'string' || clientSecret.length < 8 || clientSecret.length > 512 || /[\x00-\x20\x7f]/.test(clientSecret)) return null;
  return {clientId,clientSecret};
}
function securityHeaders(extra = {}) { return {'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',...extra}; }
function json(status, data, extra = {}) { return Response.json(data, {status,headers:securityHeaders(extra)}); }
function redirect(path, cookies = []) {
  const headers = new Headers(securityHeaders({Location:path}));
  for (const cookie of cookies) headers.append('Set-Cookie',cookie);
  return new Response(null,{status:303,headers});
}
function feedback(returnTo, provider, result, cookies = []) {
  const url = new URL(safeReturn(returnTo,'/connect'),AUTH_ORIGIN);
  url.searchParams.set('oauth_provider',provider); url.searchParams.set('oauth_result',result);
  return redirect(url.pathname + url.search,cookies);
}
function exactOrigin(request) {
  if (request.headers.get('origin') !== AUTH_ORIGIN || request.headers.get('sec-fetch-site') === 'cross-site') fail('origin_denied','Account changes require the exact Career Finder website origin.',403);
}
function expectedOwner(body, identity) {
  if (!identity) fail('sign_in_required','Sign in before changing an account connection.',401);
  if (typeof body.expectedAccountId !== 'string' || body.expectedAccountId !== identity.id) fail('account_changed','The signed-in account changed. Reload this page before continuing.',409);
}
async function requestJSON(request) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) fail('json_required','Use application/json for this request.',415);
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (!Number.isFinite(declared) || declared < 0 || declared > MAX_JSON_BYTES) fail('body_too_large','This account request is too large.',413);
  const reader = request.body?.getReader(); if (!reader) fail('invalid_json','A JSON request body is required.',400);
  let bytes = 0; const chunks = [];
  try {
    for (;;) { const {value,done} = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > MAX_JSON_BYTES) { await reader.cancel(); fail('body_too_large','This account request is too large.',413); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('invalid_json','This account request is not valid JSON.',400); }
}

/** Injection is confined to isolated executable tests. Requests and env cannot enable a fixture. */
export function createOAuthHandler({fetchImpl = fetch, clock = Date.now} = {}) {
  const keyCache = new Map();
  async function providerJSON(address, options, maxBytes) {
    const controller = new AbortController(); let reader;
    const timeout = setTimeout(() => { controller.abort(); reader?.cancel().catch(() => {}); }, PROVIDER_TIMEOUT);
    try {
      const response = await fetchImpl(address,{...options,redirect:'manual',signal:controller.signal});
      if (response.status !== 200 || !/^application\/(?:json|jwk-set\+json)(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) { await response.body?.cancel(); fail('provider_response_invalid','The provider could not complete this connection. Start again.',502); }
      const declared = Number(response.headers.get('content-length') ?? 0);
      if (!Number.isFinite(declared) || declared < 0 || declared > maxBytes) { await response.body?.cancel(); fail('provider_response_invalid','The provider returned an invalid response. Start again.',502); }
      reader = response.body?.getReader(); if (!reader) fail('provider_response_invalid','The provider returned an empty response. Start again.',502);
      const chunks = []; let bytes = 0;
      for (;;) { const {value,done} = await reader.read(); if (controller.signal.aborted) throw new Error('timeout'); if (done) break; bytes += value.byteLength; if (bytes > maxBytes) { await reader.cancel(); fail('provider_response_invalid','The provider returned an invalid response. Start again.',502); } chunks.push(value); }
      let data; try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('provider_response_invalid','The provider returned an invalid response. Start again.',502); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) fail('provider_response_invalid','The provider returned an invalid response. Start again.',502);
      return data;
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      fail('provider_unavailable','The provider could not be reached. Start again when it is available.',502);
    } finally { clearTimeout(timeout); reader?.releaseLock(); }
  }
  async function keySet(provider, refresh = false) {
    const current = keyCache.get(provider);
    if (current && current.expires > clock() && (!refresh || current.loaded > clock() - 30000)) return current.keys;
    const data = await providerJSON(OAUTH_PROVIDERS[provider].jwks,{method:'GET',headers:{Accept:'application/json'}},MAX_JWKS_BYTES);
    if (!Array.isArray(data.keys) || data.keys.length < 1 || data.keys.length > 20 || data.keys.some(key => !key || key.kty !== 'RSA' || typeof key.kid !== 'string' || key.kid.length > 250 || 'd' in key || key.alg && key.alg !== 'RS256' || key.use && key.use !== 'sig')) fail('provider_keys_invalid','The provider signing keys are unavailable. Start again later.',502);
    const keys = createLocalJWKSet({keys:data.keys});
    keyCache.set(provider,{keys,loaded:clock(),expires:clock() + 300000});
    return keys;
  }
  async function verifiedClaims(provider, idToken, config, transaction) {
    if (typeof idToken !== 'string' || idToken.length > 16384) fail('provider_identity_invalid','The provider identity could not be verified. Start again.',401);
    const options = {algorithms:['RS256'],issuer:OAUTH_PROVIDERS[provider].issuer,audience:config.clientId,requiredClaims:['iss','sub','aud','exp','iat','nonce'],maxTokenAge:'10 minutes',clockTolerance:30,currentDate:new Date(clock())};
    let payload;
    try {
      try { ({payload} = await jwtVerify(idToken,await keySet(provider),options)); }
      catch (error) { if (error.code !== 'ERR_JWKS_NO_MATCHING_KEY') throw error; ({payload} = await jwtVerify(idToken,await keySet(provider,true),options)); }
      if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255 || /[\x00-\x20\x7f]/.test(payload.sub)) throw new Error('subject');
      if (typeof payload.nonce !== 'string' || !equalSecret(sha256(payload.nonce),transaction.nonce_hash)) throw new Error('nonce');
      if (payload.azp !== undefined && payload.azp !== config.clientId || Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== config.clientId) throw new Error('authorized-party');
      if (payload.iat * 1000 < transaction.created_at - 30000 || payload.iat * 1000 > clock() + 30000) throw new Error('issued-at');
      if (provider === 'google' && (payload.email_verified !== true || typeof payload.email !== 'string' || payload.email.length > 254 || !/^[^\s@<>]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(payload.email))) throw new Error('verified-email');
      if (provider === 'google') encodeURIComponent(payload.email);
    } catch { fail('provider_identity_invalid','The provider identity could not be verified. Start again.',401); }
    let displayName = typeof payload.name === 'string' && payload.name.length <= 500 && !/[\x00-\x1f\x7f]/.test(payload.name) ? payload.name.trim() : '';
    try { encodeURIComponent(displayName); } catch { displayName = ''; }
    // No profile pictures, access tokens, refresh tokens, ID tokens or LinkedIn
    // email are retained. LinkedIn is only a basic connection, never a login.
    return {subject:payload.sub,email:provider === 'google' ? payload.email.toLowerCase() : null,displayName};
  }

  return async function handleOAuth(request, env) {
    const requestStartedAt = clock();
    const url = new URL(request.url), callback = url.pathname.match(/^\/auth\/(google|linkedin)\/callback$/);
    if (!/^\/api\/auth(?:\/|$)/.test(url.pathname) && url.pathname !== '/auth/google/start' && !callback) return null;
    let transaction = null, claimedState = null, callbackProvider = callback?.[1];
    try {
      if (url.origin !== AUTH_ORIGIN || request.headers.get('host') && request.headers.get('host') !== url.host) fail('host_denied','Use the configured Career Finder HTTPS address.',403);
      // Provider callbacks are cross-site top-level navigations; every other API
      // rejects cross-site access. All mutations additionally require Origin.
      if (!callback && (request.headers.get('origin') && request.headers.get('origin') !== AUTH_ORIGIN || request.headers.get('sec-fetch-site') === 'cross-site')) fail('origin_denied','This request did not come from Career Finder.',403);
      if (url.pathname === '/api/auth/status' && request.method === 'GET') {
        const identity = await resolveBrowserIdentity(request,env,{now:clock()});
        const rows = identity && env.DB ? (await env.DB.prepare('SELECT provider,display_name FROM auth_identities WHERE owner_id=?').bind(identity.id).all()).results : [];
        const providers = Object.fromEntries(Object.keys(OAUTH_PROVIDERS).map(provider => { const row = rows.find(row => row.provider === provider); return [provider,{configured:Boolean(env.DB && configured(env,provider)),connected:Boolean(row),...(row?.display_name ? {displayName:row.display_name} : {})}]; }));
        return json(200,{ok:true,account:identity,providers});
      }
      if (!env.DB) fail('auth_unavailable','Account sign-in is temporarily unavailable.',503);
      const db = env.DB, stmt = (sql,...args) => db.prepare(sql).bind(...args), first = (sql,...args) => stmt(sql,...args).first();

      async function start(provider, intent, identity, returnTo) {
        const config = configured(env,provider); if (!config) fail('provider_not_configured','This provider connection is not available yet. Use an available sign-in method.',503);
        const lifecycle = identity ? await captureOwnerLifecycle(env,identity.id,{startedAt:requestStartedAt,now:clock()}) : null;
        const now = clock(), minute = Math.floor(now / 60000);
        const lifecycleAuthority = `(? IS NULL OR EXISTS(SELECT 1 FROM account_lifecycles WHERE owner_hash=? AND generation=? AND (deleted_at IS NULL OR deleted_at<?)))`;
        const lifecycleArgs = [lifecycle?.key ?? null,lifecycle?.key ?? null,lifecycle?.generation ?? null,requestStartedAt];
        // Only keyed, short-lived client buckets are stored; never raw IPs.
        const client = createHmac('sha256',config.clientSecret).update(String(Math.floor(now / 86400000)) + '\0' + (request.headers.get('cf-connecting-ip') ?? 'unknown')).digest('hex');
        const rates = await db.batch([
          stmt('DELETE FROM auth_rates WHERE window<?',minute - 5),
          stmt('INSERT INTO auth_rates(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window=excluded.window,count=CASE WHEN auth_rates.window=excluded.window THEN auth_rates.count+1 ELSE 1 END RETURNING count','global',minute),
          stmt('INSERT INTO auth_rates(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window=excluded.window,count=CASE WHEN auth_rates.window=excluded.window THEN auth_rates.count+1 ELSE 1 END RETURNING count','client:'+client,minute),
          stmt('DELETE FROM oauth_transactions WHERE expires_at<=?',now),
          stmt('DELETE FROM browser_sessions WHERE expires_at<=?',now),
          stmt('DELETE FROM auth_deletion_fences WHERE expires_at<=?',now),
        ]);
        if (rates[1].results[0].count > MAX_STARTS_PER_MINUTE || rates[2].results[0].count > MAX_CLIENT_STARTS) fail('rate_limited','Too many sign-in attempts. Wait one minute and try again.',429);
        const googleSession = identity?.method === 'google' ? sha256(cookieValue(request,BROWSER_SESSION_COOKIE)) : null;
        // Identity resolution happens before rate/storage I/O. A delayed link
        // start must not recreate an account after deletion or session revocation.
        const browserAuthority = `(? IS NULL OR EXISTS(SELECT 1 FROM browser_sessions s
          JOIN auth_accounts a ON a.owner_id=s.owner_id AND a.generation=s.account_generation
          JOIN auth_identities i ON i.owner_id=s.owner_id AND i.provider=s.provider AND i.subject=s.subject
          WHERE s.token_hash=? AND s.owner_id=? AND s.provider='google' AND s.expires_at>?))`;
        const authorityArgs = () => [googleSession,googleSession,identity?.id ?? null,clock()];
        let account = null;
        if (identity) {
          if (await first('SELECT 1 AS deleting FROM workspaces WHERE owner_id=? AND deleting_at IS NOT NULL',identity.id)) fail('account_deleting','Finish deleting this account before making a connection.',409);
          await stmt(`INSERT OR IGNORE INTO auth_accounts(owner_id,origin_method,generation,created_at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM auth_accounts)<? AND NOT EXISTS(SELECT 1 FROM workspaces WHERE owner_id=? AND deleting_at IS NOT NULL) AND ${browserAuthority} AND ${lifecycleAuthority}`,identity.id,identity.method,randomUUID(),now,AUTH_LIMITS.maxAccounts,identity.id,...authorityArgs(),...lifecycleArgs).run();
          account = await first('SELECT generation FROM auth_accounts WHERE owner_id=?',identity.id);
          if (!account) {
            if (googleSession) await resolveBrowserIdentity(request,env,{now:clock()});
            if (!await first('SELECT 1 AS present FROM account_lifecycles WHERE owner_hash=? AND generation=? AND (deleted_at IS NULL OR deleted_at<?)',lifecycle.key,lifecycle.generation,requestStartedAt)) fail('account_changed','This account was deleted while the connection was starting. Reload before trying again.',409);
            if (await first('SELECT 1 AS deleting FROM workspaces WHERE owner_id=? AND deleting_at IS NOT NULL',identity.id)) fail('account_deleting','Finish deleting this account before making a connection.',409);
            fail('capacity_reached','The current account capacity has been reached.',503);
          }
        }
        const state = opaqueToken(), browser = opaqueToken(), nonce = opaqueToken(), verifier = provider === 'google' ? opaqueToken() : null;
        const saved = await stmt(`INSERT INTO oauth_transactions(state_hash,browser_hash,provider,intent,owner_id,account_generation,nonce_hash,verifier,return_to,created_at,expires_at,lifecycle_key,lifecycle_generation)
          SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM oauth_transactions)<? AND (? IS NULL OR EXISTS(SELECT 1 FROM auth_accounts WHERE owner_id=? AND generation=?))
          AND NOT EXISTS(SELECT 1 FROM workspaces WHERE owner_id=? AND deleting_at IS NOT NULL) AND ${browserAuthority} AND ${lifecycleAuthority} AND ?>?`,sha256(state),sha256(browser),provider,intent,identity?.id ?? null,account?.generation ?? null,sha256(nonce),verifier,returnTo,requestStartedAt,requestStartedAt + AUTH_LIMITS.transactionMilliseconds,lifecycle?.key ?? null,lifecycle?.generation ?? null,MAX_PENDING,identity?.id ?? null,identity?.id ?? null,account?.generation ?? null,identity?.id ?? null,...authorityArgs(),...lifecycleArgs,requestStartedAt + AUTH_LIMITS.transactionMilliseconds,clock()).run();
        if (saved.meta.changes !== 1) fail('connection_unavailable','This connection could not be started. Reload the page and try again.',409);
        const authorization = new URL(OAUTH_PROVIDERS[provider].authorization);
        for (const [name,value] of Object.entries({client_id:config.clientId,response_type:'code',redirect_uri:`${AUTH_ORIGIN}/auth/${provider}/callback`,scope:OAUTH_PROVIDERS[provider].scope,state,nonce})) authorization.searchParams.set(name,value);
        if (verifier) { authorization.searchParams.set('code_challenge',Buffer.from(sha256(verifier),'hex').toString('base64url')); authorization.searchParams.set('code_challenge_method','S256'); authorization.searchParams.set('access_type','online'); authorization.searchParams.set('prompt','select_account'); }
        return {authorizationUrl:authorization.href,cookie:oauthBrowserCookie(browser)};
      }

      if (url.pathname === '/auth/google/start' && request.method === 'GET') {
        if (request.headers.has('sec-fetch-mode') && request.headers.get('sec-fetch-mode') !== 'navigate' || request.headers.has('sec-fetch-dest') && request.headers.get('sec-fetch-dest') !== 'document') fail('navigation_required','Open Google sign-in as a full browser page.',400);
        if (await resolveBrowserIdentity(request,env,{now:clock()})) fail('already_signed_in','You are already signed in. Connect Google from Account.',409);
        const result = await start('google','login',null,safeReturn(url.searchParams.get('return_to'),'/connect'));
        return redirect(result.authorizationUrl,[result.cookie]);
      }
      if (url.pathname === '/api/auth/connect' && request.method === 'POST') {
        exactOrigin(request); const body = object(await requestJSON(request),['provider','expectedAccountId']);
        const identity = await resolveBrowserIdentity(request,env,{now:clock()}); expectedOwner(body,identity);
        const result = await start(providerName(body.provider),'link',identity,'/account');
        return json(200,{ok:true,authorizationUrl:result.authorizationUrl},{'Set-Cookie':result.cookie});
      }
      if (url.pathname === '/api/auth/disconnect' && request.method === 'POST') {
        exactOrigin(request); const body = object(await requestJSON(request),['provider','expectedAccountId']), provider = providerName(body.provider);
        const identity = await resolveBrowserIdentity(request,env,{now:clock()}); expectedOwner(body,identity);
        const account = await first('SELECT origin_method,generation FROM auth_accounts WHERE owner_id=?',identity.id);
        if (provider === 'google' && (identity.method === 'google' || account?.origin_method === 'google')) fail('login_method_required','Google is your current sign-in method. Keep it connected to retain access. If you originally used ChatGPT, sign in with ChatGPT before disconnecting Google.',409);
        await db.batch([
          stmt(`INSERT INTO auth_deletion_fences(subject_hash,deleted_at,expires_at)
            SELECT subject_hash,?,? FROM auth_identities WHERE owner_id=? AND provider=?
            ON CONFLICT(subject_hash) DO UPDATE SET deleted_at=MAX(auth_deletion_fences.deleted_at,excluded.deleted_at),expires_at=MAX(auth_deletion_fences.expires_at,excluded.expires_at)`,clock(),clock() + AUTH_LIMITS.transactionMilliseconds,identity.id,provider),
          stmt('DELETE FROM oauth_transactions WHERE owner_id=? AND provider=?',identity.id,provider),
          stmt('DELETE FROM browser_sessions WHERE owner_id=? AND provider=?',identity.id,provider),
          stmt('DELETE FROM auth_identities WHERE owner_id=? AND provider=?',identity.id,provider),
        ]);
        return json(200,{ok:true});
      }
      if (url.pathname === '/api/auth/signout' && request.method === 'POST') {
        exactOrigin(request); const body = object(await requestJSON(request),['expectedAccountId']);
        if (typeof body.expectedAccountId !== 'string' || body.expectedAccountId.length > 250) fail('invalid_account','Reload the account page before signing out.',400);
        let identity, invalidCookie = false;
        try { identity = await resolveBrowserIdentity(request,env,{now:clock()}); } catch (error) { if (!(error instanceof ApplicationError) || error.code !== 'invalid_session') throw error; invalidCookie = true; }
        if (!invalidCookie) expectedOwner(body,identity);
        let token = null, browser = null;
        try { token = cookieValue(request,BROWSER_SESSION_COOKIE); browser = cookieValue(request,OAUTH_BROWSER_COOKIE); } catch { /* Duplicate invalid cookies are cleared, never used to choose an account. */ }
        const statements = [];
        if (token && /^[a-f0-9]{64}$/.test(token)) statements.push(stmt('DELETE FROM browser_sessions WHERE token_hash=?',sha256(token)));
        if (browser && /^[a-f0-9]{64}$/.test(browser)) statements.push(stmt('DELETE FROM oauth_transactions WHERE browser_hash=?',sha256(browser)));
        if (statements.length) await db.batch(statements);
        // End both browser sign-in layers. Clearing only a Google/invalid own
        // cookie could otherwise immediately reveal a different Sites account.
        // The reserved platform route is idempotent; no other account data is deleted.
        const response = json(200,{ok:true,redirectTo:'/signout-with-chatgpt?return_to=%2Fconnect'});
        response.headers.append('Set-Cookie',clearBrowserSessionCookie()); response.headers.append('Set-Cookie',clearOAuthBrowserCookie());
        return response;
      }

      if (callback && request.method === 'GET') {
        const provider = callbackProvider;
        if (url.search.length > 8192 || ['state','code','error'].some(name => url.searchParams.getAll(name).length > 1)) fail('invalid_callback','This sign-in response is invalid. Start again.',400);
        const state = url.searchParams.get('state'), browser = cookieValue(request,OAUTH_BROWSER_COOKIE);
        if (!state || !/^[a-f0-9]{64}$/.test(state) || !browser || !/^[a-f0-9]{64}$/.test(browser)) fail('invalid_state','This sign-in request is missing, expired or belongs to another browser. Start again.',401);
        const claim = opaqueToken(); claimedState = sha256(state);
        transaction = await stmt('UPDATE oauth_transactions SET claim=? WHERE state_hash=? AND browser_hash=? AND provider=? AND expires_at>? AND claim IS NULL RETURNING *',claim,claimedState,sha256(browser),provider,clock()).first();
        if (!transaction) fail('invalid_state','This sign-in request was already used or expired. Start again.',401);
        let identity = await resolveBrowserIdentity(request,env,{now:clock()});
        if (transaction.intent === 'link') {
          if (!identity || identity.id !== transaction.owner_id) fail('account_changed','The signed-in account changed. Start the connection again from Account.',409);
          if (!await first('SELECT 1 AS present FROM auth_accounts WHERE owner_id=? AND generation=?',identity.id,transaction.account_generation)) fail('account_changed','This account connection was removed. Start again.',409);
          if (!await first('SELECT 1 AS present FROM account_lifecycles WHERE owner_hash=? AND generation=? AND (deleted_at IS NULL OR deleted_at<?)',transaction.lifecycle_key,transaction.lifecycle_generation,transaction.created_at)) fail('account_changed','This account was deleted while the connection was open. Start again.',409);
        } else if (identity) fail('account_changed','Another account signed in while Google was open. Return to Account before continuing.',409);
        if (url.searchParams.has('error')) return feedback(transaction.return_to,provider,url.searchParams.get('error') === 'access_denied' ? 'cancelled' : 'failed',[clearOAuthBrowserCookie()]);
        const code = url.searchParams.get('code');
        if (!code || code.length > 4096 || /[\x00-\x20\x7f]/.test(code)) fail('invalid_callback','The provider did not return an authorization code. Start again.',400);
        const config = configured(env,provider); if (!config) fail('provider_not_configured','This provider connection is not available yet.',503);
        const form = new URLSearchParams({grant_type:'authorization_code',client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:`${AUTH_ORIGIN}/auth/${provider}/callback`,code});
        if (provider === 'google') form.set('code_verifier',transaction.verifier);
        const token = await providerJSON(OAUTH_PROVIDERS[provider].token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:form.toString()},MAX_TOKEN_BYTES);
        const claims = await verifiedClaims(provider,token.id_token,config,transaction);
        // Recheck a local session after provider I/O; sign-out/deletion in another
        // request must not leave authority alive for this delayed callback.
        identity = await resolveBrowserIdentity(request,env,{now:clock()});
        if (transaction.intent === 'link' ? !identity || identity.id !== transaction.owner_id : identity !== null) fail('account_changed','The signed-in account changed. Start again.',409);
        await stmt("INSERT OR IGNORE INTO meta(key,value) VALUES('auth_fence_salt',?)",opaqueToken()).run();
        const salt = (await first("SELECT value FROM meta WHERE key='auth_fence_salt'")).value;
        const subjectHash = providerSubjectHash(provider,claims.subject,salt);
        const existing = await first('SELECT i.owner_id,a.generation FROM auth_identities i JOIN auth_accounts a ON a.owner_id=i.owner_id WHERE i.provider=? AND i.subject=?',provider,claims.subject);
        if (transaction.intent === 'link' && existing && existing.owner_id !== identity.id) fail('provider_already_linked','This provider account is already connected to another Career Finder account. No accounts were merged.',409);
        const ownerId = transaction.intent === 'link' ? identity.id : existing?.owner_id ?? 'career-' + randomUUID();
        const generation = transaction.intent === 'link' ? transaction.account_generation : existing?.generation ?? randomUUID();
        const lifecycle = transaction.intent === 'link' ? {key:transaction.lifecycle_key,generation:transaction.lifecycle_generation} : await captureOwnerLifecycle(env,ownerId,{startedAt:transaction.created_at,now:clock()});
        const bound = await stmt(`UPDATE oauth_transactions SET owner_id=?,account_generation=?,lifecycle_key=?,lifecycle_generation=? WHERE state_hash=? AND claim=? AND expires_at>?
          AND NOT EXISTS(SELECT 1 FROM auth_deletion_fences WHERE subject_hash=? AND deleted_at>=oauth_transactions.created_at AND expires_at>?)
          AND NOT EXISTS(SELECT 1 FROM workspaces WHERE owner_id=? AND deleting_at IS NOT NULL)
          AND EXISTS(SELECT 1 FROM account_lifecycles WHERE owner_hash=? AND generation=? AND (deleted_at IS NULL OR deleted_at<?))`,ownerId,generation,lifecycle.key,lifecycle.generation,claimedState,claim,clock(),subjectHash,clock(),ownerId,lifecycle.key,lifecycle.generation,transaction.created_at).run();
        if (bound.meta.changes !== 1) fail('account_changed','This connection was cancelled or the account was deleted. Start again.',409);
        const now = clock(), session = transaction.intent === 'login' ? opaqueToken() : null;
        const linkingSession = identity?.method === 'google' ? sha256(cookieValue(request,BROWSER_SESSION_COOKIE)) : null;
        const eligible = `EXISTS(SELECT 1 FROM oauth_transactions t WHERE t.state_hash=? AND t.claim=? AND t.expires_at>? AND t.owner_id=? AND t.account_generation=?)
          AND NOT EXISTS(SELECT 1 FROM auth_deletion_fences WHERE subject_hash=? AND deleted_at>=? AND expires_at>?)
          AND NOT EXISTS(SELECT 1 FROM workspaces WHERE owner_id=? AND deleting_at IS NOT NULL)
          AND EXISTS(SELECT 1 FROM account_lifecycles WHERE owner_hash=? AND generation=? AND (deleted_at IS NULL OR deleted_at<?))
          AND (? IS NULL OR EXISTS(SELECT 1 FROM browser_sessions WHERE token_hash=? AND owner_id=? AND expires_at>?))`;
        const args = [claimedState,claim,now,ownerId,generation,subjectHash,transaction.created_at,now,ownerId,lifecycle.key,lifecycle.generation,transaction.created_at,linkingSession,linkingSession,ownerId,now];
        const statements = [];
        if (!existing && transaction.intent === 'login') statements.push(stmt(`INSERT OR IGNORE INTO auth_accounts(owner_id,origin_method,generation,created_at) SELECT ?,'google',?,? WHERE ${eligible} AND (SELECT COUNT(*) FROM auth_accounts)<? AND NOT EXISTS(SELECT 1 FROM auth_identities WHERE provider=? AND subject=?)`,ownerId,generation,now,...args,AUTH_LIMITS.maxAccounts,provider,claims.subject));
        statements.push(stmt(`INSERT INTO auth_identities(provider,subject,subject_hash,owner_id,email,display_name,connected_at,updated_at)
          SELECT ?,?,?,?,?,?,?,? WHERE ${eligible} AND EXISTS(SELECT 1 FROM auth_accounts WHERE owner_id=? AND generation=?)
          ON CONFLICT(provider,subject) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,updated_at=excluded.updated_at WHERE auth_identities.owner_id=excluded.owner_id`,provider,claims.subject,subjectHash,ownerId,claims.email,claims.displayName,iso(now),iso(now),...args,ownerId,generation));
        const identityIndex = statements.length - 1;
        if (session) statements.push(stmt(`INSERT INTO browser_sessions(token_hash,id,owner_id,account_generation,provider,subject,created_at,expires_at)
          SELECT ?,?,?,?,?,?,?,? WHERE ${eligible} AND EXISTS(SELECT 1 FROM auth_accounts WHERE owner_id=? AND generation=?)
          AND EXISTS(SELECT 1 FROM auth_identities WHERE provider=? AND subject=? AND owner_id=?) AND (SELECT COUNT(*) FROM browser_sessions WHERE owner_id=? AND expires_at>?)<?`,sha256(session),randomUUID(),ownerId,generation,provider,claims.subject,now,now + AUTH_LIMITS.sessionMilliseconds,...args,ownerId,generation,provider,claims.subject,ownerId,ownerId,now,AUTH_LIMITS.maxSessions));
        statements.push(stmt('DELETE FROM oauth_transactions WHERE state_hash=? AND claim=?',claimedState,claim));
        const results = await db.batch(statements);
        if (results[identityIndex].meta.changes !== 1 || session && results[identityIndex + 1].meta.changes !== 1) fail('connection_unavailable','The connection could not be saved, the account changed, or the browser session limit was reached. Start again.',409);
        return feedback(transaction.return_to,provider,session ? 'signed_in' : 'connected',[clearOAuthBrowserCookie(),...(session ? [sessionCookie(session)] : [])]);
      }
      return json(404,{ok:false,error:{code:'not_found',message:'This account sign-in route does not exist.'}});
    } catch (error) {
      if (callback && request.method === 'GET') return feedback(transaction?.return_to ?? '/connect',callbackProvider,'failed',transaction ? [clearOAuthBrowserCookie()] : []);
      if (error instanceof ApplicationError) return json(error.status,{ok:false,error:{code:error.code,message:error.message}},error.status === 429 ? {'Retry-After':'60'} : {});
      // Never log or expose provider responses, authorization codes or secrets.
      return json(503,{ok:false,error:{code:'auth_unavailable',message:'Account sign-in is temporarily unavailable. Try again.'}});
    } finally {
      // A claimed request remains spent even on provider timeout, rejection or
      // validation failure. Retry always starts with fresh state and nonce.
      if (transaction && claimedState && env.DB) { try { await env.DB.prepare('DELETE FROM oauth_transactions WHERE state_hash=? AND claim=?').bind(claimedState,transaction.claim).run(); } catch { /* The stored claim still prevents replay until expiry. */ } }
    }
  };
}

export const handleOAuth = createOAuthHandler();
