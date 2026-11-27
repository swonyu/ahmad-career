import {timingSafeEqual} from 'node:crypto';

export class FixtureError extends Error {
  constructor(code, status = 400) { super(code); this.name = 'FixtureError'; this.code = code; this.status = status; }
}
const fail = (code, status) => { throw new FixtureError(code, status); };
export const MAX_BODY_BYTES = 7 * 1024 * 1024 + 32768;
const routes = new Map([
  ['GET /api/apply/status', 0], ['GET /api/apply/workspace', 0], ['GET /api/apply/receipts', 0],
  ['PUT /api/apply/profile', MAX_BODY_BYTES], ['POST /api/apply/jobs', 32768], ['POST /api/apply/prepare', 32768],
  ['GET /api/discovery/sources', 0], ['GET /api/discovery/search', 0],
]);
export function nativeRoute(target, method) {
  if (typeof target !== 'string' || target.length > 10000 || !target.startsWith('/') || target.startsWith('//') ||
      /[\\\x00-\x20\x7f#]/.test(target) || /%(?![0-9a-f]{2})/i.test(target)) fail('fixture_route_denied', 404);
  const url = new URL(target, 'https://fixture.invalid'), pathname = target.split('?')[0];
  if (url.pathname !== pathname || url.origin !== 'https://fixture.invalid') fail('fixture_route_denied', 404);
  if (/^\/api\/(?:apply|phone)\/(?:submit|advance)$/.test(pathname)) fail('fixture_dispatch_denied', 403);
  const key = `${method} ${pathname}`;
  if (!routes.has(key) || url.search && pathname !== '/api/discovery/search') fail('fixture_route_denied', 404);
  return {pathname, kind: pathname.startsWith('/api/apply/') ? 'application' : 'discovery', maximumBodyBytes: routes.get(key)};
}
export function matchesSecret(received, expected) {
  return typeof received === 'string' && typeof expected === 'string' && /^[a-f0-9]{64}$/.test(received) &&
    /^[a-f0-9]{64}$/.test(expected) && timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
}
export function nativeHeaders(input, logicalOrigin) {
  const source = new Headers(input), result = new Headers();
  for (const name of source.keys()) {
    if (/^(?:oai-authenticated-user-|x-career-|x-journey-|x-native-journey-|x-forwarded-)/.test(name) ||
        ['cookie', 'forwarded', 'cf-connecting-ip'].includes(name)) fail('fixture_identity_header_denied', 403);
  }
  for (const name of ['authorization', 'content-type', 'origin', 'sec-fetch-site']) {
    const value = source.get(name);
    if (value !== null) {
      if (value.length > 512) fail('fixture_header_denied', 400);
      result.set(name, value);
    }
  }
  // Preserve the original native Authorization value. The real handler, not a
  // fixture identity or token stub, decides whether it belongs to this workspace.
  result.set('host', new URL(logicalOrigin).host);
  result.set('cf-connecting-ip', '192.0.2.58');
  return result;
}
export function decodeBody(chunks, maximumBytes) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0 || maximumBytes > MAX_BODY_BYTES) fail('fixture_body_limit_invalid');
  let length = 0;
  for (const chunk of chunks) {
    if (!(chunk instanceof Uint8Array)) fail('fixture_body_invalid');
    length += chunk.byteLength;
    if (length > maximumBytes) fail('fixture_body_too_large', 413);
  }
  try { return new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks, length)); }
  catch { fail('fixture_body_invalid_utf8'); }
}
export function assertTestCapabilities(value, workspace = false) {
  const capabilities = workspace ? value?.capabilities : value;
  if (!value || value.ok !== true || value.mode !== 'test' || capabilities?.mode !== 'test' || capabilities.liveEnabled !== false) {
    fail('fixture_capability_changed', 503);
  }
}
export function assertBlankWorkspace(value) {
  assertTestCapabilities(value, true);
  const p = value.profile;
  if (!p || p.revision !== 0 || p.resume !== null ||
      ['firstName', 'lastName', 'email', 'phone', 'city', 'country', 'headline', 'website', 'linkedin'].some(key => p[key] !== '') ||
      ['skills', 'targetRoles', 'targetCountries', 'workModes'].some(key => !Array.isArray(p[key]) || p[key].length !== 0) ||
      p.experienceLevel !== 'any' ||
      ['jobs', 'attempts', 'recoverablePlans', 'activePlanIds'].some(key => !Array.isArray(value[key]) || value[key].length !== 0)) {
    fail('fixture_initial_workspace_not_blank', 409);
  }
}
export function assertZeroDispatch(proof) {
  if (!proof || ['providerPostAttempts', 'forbiddenDispatchAttempts', 'outboundAttempts'].some(key => proof[key] !== 0) ||
      !Array.isArray(proof.attempts) || proof.attempts.length > 500 || !Array.isArray(proof.plans) || proof.plans.length > 100) {
    fail('fixture_zero_dispatch_unproved', 409);
  }
  if (proof.attempts.some(a => a.state !== 'ready' || a.mode !== 'test' || a.dispatchCount !== 0 ||
      a.approvalGeneration !== 0 || a.dispatchedAt !== null || a.confirmedAt !== null || a.applicationId !== null) ||
      proof.plans.some(p => p.approvalGeneration !== 0 || p.approvedAt !== null || p.lastApprovedAt !== null || p.stopped !== 0)) {
    fail('fixture_zero_dispatch_unproved', 409);
  }
  return true;
}
