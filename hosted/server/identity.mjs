import {randomBytes, randomUUID, timingSafeEqual, createHmac} from 'node:crypto';
import {ApplicationError, fail, sha256} from './validation.mjs';

export const AUTH_ORIGIN = 'https://career-finder-service.jazzy-drake-8323.chatgpt.site';
export const BROWSER_SESSION_COOKIE = '__Host-career-session';
export const OAUTH_BROWSER_COOKIE = '__Host-career-oauth';
export const AUTH_LIMITS = Object.freeze({transactionMilliseconds:600000, sessionMilliseconds:604800000, maxSessions:20, maxAccounts:250});
const INTERNAL_PREFIX = 'x-career-';
const COOKIE_ATTRIBUTES = 'Path=/; Secure; HttpOnly; SameSite=Lax';

export function opaqueToken() { return randomBytes(32).toString('hex'); }
export function equalSecret(a, b) {
  return typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export function cookieValue(request, name) {
  const header = request.headers.get('cookie') ?? '';
  if (header.length > 16384) fail('invalid_session', 'This browser session is invalid. Sign out and sign in again.', 401);
  const matches = header.split(';').map(part => part.trim()).filter(part => part.startsWith(name + '='));
  if (matches.length > 1) fail('invalid_session', 'This browser session is invalid. Sign out and sign in again.', 401);
  return matches.length ? matches[0].slice(name.length + 1) : null;
}
export function sessionCookie(token) {
  return `${BROWSER_SESSION_COOKIE}=${token}; ${COOKIE_ATTRIBUTES}; Max-Age=${AUTH_LIMITS.sessionMilliseconds / 1000}`;
}
export function clearBrowserSessionCookie() { return `${BROWSER_SESSION_COOKIE}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`; }
export function oauthBrowserCookie(token) {
  return `${OAUTH_BROWSER_COOKIE}=${token}; ${COOKIE_ATTRIBUTES}; Max-Age=${AUTH_LIMITS.transactionMilliseconds / 1000}`;
}
export function clearOAuthBrowserCookie() { return `${OAUTH_BROWSER_COOKIE}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`; }
export function providerSubjectHash(provider, subject, salt) { return createHmac('sha256', salt).update(provider + '\0' + subject).digest('hex'); }

/**
 * Capture before asynchronous browser mutation work. The timestamp rejects a
 * request whose first lifecycle read happens after deletion; the generation
 * fences requests that captured their authority before deletion. Only an HMAC,
 * opaque generation and deletion time persist, never the plaintext owner ID.
 */
export async function captureOwnerLifecycle(env, ownerId, {startedAt, now = Date.now()} = {}) {
  if (!env.DB) fail('auth_unavailable', 'Account sign-in is temporarily unavailable.', 503);
  if (!Number.isSafeInteger(startedAt) || startedAt < 0 || !Number.isSafeInteger(now)) fail('invalid_request_time', 'Reload before changing this account.', 409);
  await env.DB.prepare("INSERT OR IGNORE INTO meta(key,value) VALUES('auth_fence_salt',?)").bind(opaqueToken()).run();
  const salt = (await env.DB.prepare("SELECT value FROM meta WHERE key='auth_fence_salt'").first()).value;
  const key = providerSubjectHash('owner', ownerId, salt);
  await env.DB.prepare('INSERT OR IGNORE INTO account_lifecycles(owner_hash,generation,deleted_at) VALUES(?,?,NULL)').bind(key,randomUUID()).run();
  const row = await env.DB.prepare('SELECT generation,deleted_at FROM account_lifecycles WHERE owner_hash=?').bind(key).first();
  if (!row || row.deleted_at !== null && row.deleted_at >= startedAt) fail('account_changed', 'This account was deleted while the request was in progress. Reload before starting again.', 409);
  return {key,generation:row.generation};
}

function plainText(value, max) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value) ? value : null;
}
/** These OAI headers are supplied by the Sites ingress. They are never accepted from our own SSR headers. */
function sitesIdentity(request) {
  const id = plainText(request.headers.get('oai-authenticated-user-id'), 250);
  const email = plainText(request.headers.get('oai-authenticated-user-email'), 254);
  if (!id || !email) return null;
  let name = null;
  if (request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') {
    try { name = plainText(decodeURIComponent(request.headers.get('oai-authenticated-user-full-name') ?? ''), 500); } catch { /* An invalid optional name grants no identity. */ }
  }
  return {id, email:email.toLowerCase(), displayName:name ?? email, method:'chatgpt'};
}

/**
 * The opaque Career Finder cookie takes precedence. A bad/expired cookie must
 * never fall through into a different Sites account in the same browser.
 * @returns {Promise<null | {id:string,email:string,displayName:string,method:'chatgpt'|'google'|'linkedin'}>}
 */
export async function resolveBrowserIdentity(request, env, {now = Date.now()} = {}) {
  const token = cookieValue(request, BROWSER_SESSION_COOKIE);
  if (token === null) return sitesIdentity(request);
  if (!/^[a-f0-9]{64}$/.test(token)) fail('invalid_session', 'This browser session has expired. Sign out and sign in again.', 401);
  if (!env.DB) fail('auth_unavailable', 'Account sign-in is temporarily unavailable.', 503);
  const row = await env.DB.prepare(`SELECT s.owner_id, i.email, i.display_name, s.provider
    FROM browser_sessions s JOIN auth_accounts a ON a.owner_id=s.owner_id AND a.generation=s.account_generation
    JOIN auth_identities i ON i.owner_id=s.owner_id AND i.provider=s.provider AND i.subject=s.subject
    WHERE s.token_hash=? AND s.expires_at>? AND s.provider IN ('google','linkedin')`).bind(sha256(token), now).first();
  if (!row || !row.email) fail('invalid_session', 'This browser session has expired. Sign out and sign in again.', 401);
  return {id:row.owner_id, email:row.email, displayName:row.display_name || row.email, method:row.provider};
}

/** Strip every caller-supplied internal identity field before the Worker injects verified values. */
export function stripInternalIdentityHeaders(request) {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (name.toLowerCase().startsWith(INTERNAL_PREFIX)) headers.delete(name);
  return new Request(request, {headers});
}
export function verifiedSSRRequest(request, identity) {
  const clean = stripInternalIdentityHeaders(request);
  if (!identity) return clean;
  const headers = new Headers(clean.headers);
  headers.set('x-career-user-id', encodeURIComponent(identity.id));
  headers.set('x-career-user-email', encodeURIComponent(identity.email));
  headers.set('x-career-user-name', encodeURIComponent(identity.displayName));
  headers.set('x-career-user-method', identity.method);
  return new Request(clean, {headers});
}

/** Export owned basic identity metadata, never token hashes, codes, verifier or cookie values. */
export async function exportBrowserIdentity(env, ownerId) {
  if (!env.DB) fail('auth_unavailable', 'Account sign-in is temporarily unavailable.', 503);
  const [connections, sessions] = await Promise.all([
    env.DB.prepare('SELECT provider,subject,email,display_name AS displayName,connected_at AS connectedAt FROM auth_identities WHERE owner_id=? ORDER BY provider').bind(ownerId).all(),
    env.DB.prepare('SELECT id,provider AS method,created_at AS createdAt,expires_at AS expiresAt FROM browser_sessions WHERE owner_id=? ORDER BY created_at,id').bind(ownerId).all(),
  ]);
  return {connections:connections.results, browserSessions:sessions.results.map(row => ({...row, createdAt:new Date(row.createdAt).toISOString(), expiresAt:new Date(row.expiresAt).toISOString()}))};
}

/**
 * Include in the caller's atomic account-deletion batch, after fencing uploads.
 * A short-lived hash-only fence blocks a login begun before deletion from
 * recreating the removed provider link. Newly initiated sign-in remains allowed.
 * Account generation and transaction existence additionally fence in-flight links.
 */
export function identityDeletionStatements(db, ownerId, options = {}) {
  const {now = Date.now(), expectedWorkspaceId, expectedGeneration, lifecycle} = options;
  const clauses = [], args = [];
  if (lifecycle) {
    clauses.push('EXISTS(SELECT 1 FROM account_lifecycles WHERE owner_hash=? AND generation=?)'); args.push(lifecycle.key,lifecycle.generation);
  }
  if (Object.hasOwn(options, 'expectedWorkspaceId')) {
    if (expectedWorkspaceId === null) { clauses.push('NOT EXISTS(SELECT 1 FROM workspaces WHERE owner_id=?)'); args.push(ownerId); }
    else { clauses.push('EXISTS(SELECT 1 FROM workspaces WHERE owner_id=? AND id=? AND deleting_at IS NOT NULL)'); args.push(ownerId, expectedWorkspaceId); }
  }
  if (Object.hasOwn(options, 'expectedGeneration')) {
    if (expectedGeneration === null) { clauses.push('NOT EXISTS(SELECT 1 FROM auth_accounts WHERE owner_id=?)'); args.push(ownerId); }
    else { clauses.push('EXISTS(SELECT 1 FROM auth_accounts WHERE owner_id=? AND generation=?)'); args.push(ownerId, expectedGeneration); }
  }
  const guard = clauses.length ? clauses.join(' AND ') : '1';
  return [
    db.prepare(`INSERT INTO auth_deletion_fences(subject_hash,deleted_at,expires_at)
      SELECT subject_hash,?,? FROM auth_identities WHERE owner_id=? AND ${guard}
      ON CONFLICT(subject_hash) DO UPDATE SET deleted_at=MAX(auth_deletion_fences.deleted_at,excluded.deleted_at),expires_at=MAX(auth_deletion_fences.expires_at,excluded.expires_at)`)
      .bind(now, now + AUTH_LIMITS.transactionMilliseconds, ownerId, ...args),
    db.prepare(`DELETE FROM oauth_transactions WHERE owner_id=? AND ${guard}`).bind(ownerId, ...args),
    db.prepare(`DELETE FROM browser_sessions WHERE owner_id=? AND ${guard}`).bind(ownerId, ...args),
    db.prepare(`DELETE FROM auth_identities WHERE owner_id=? AND ${guard}`).bind(ownerId, ...args),
    // Keep the account generation present until every prior guarded mutation has
    // run in this same D1 batch. A repeated deletion cannot affect a later account.
    db.prepare(`DELETE FROM auth_accounts WHERE owner_id=? AND ${guard}`).bind(ownerId, ...args),
    db.prepare('DELETE FROM auth_deletion_fences WHERE expires_at<=?').bind(now),
  ];
}

export {ApplicationError};
