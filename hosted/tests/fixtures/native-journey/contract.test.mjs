// Pure boundary tests. These import no harness, Worker, handler, TLS or database.
import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeRoute, nativeHeaders, matchesSecret, decodeBody, assertTestCapabilities,
  assertBlankWorkspace, assertZeroDispatch, MAX_BODY_BYTES} from './contract.mjs';

const origin = 'https://example.invalid';
const rejected = (fn, code) => assert.throws(fn, error => error.code === code);
test('only exact native journey methods and paths are admitted', () => {
  for (const [method, path] of [['GET', 'status'], ['GET', 'workspace'], ['GET', 'receipts'], ['PUT', 'profile'], ['POST', 'jobs'], ['POST', 'prepare']]) {
    const route = nativeRoute('/api/apply/' + path, method);
    assert.equal(route.kind, 'application'); assert.equal(route.pathname, '/api/apply/' + path);
  }
  assert.equal(nativeRoute('/api/discovery/search?source=lever%3Aglobal%3Afictional&q=%D9%85%D8%B5%D9%85%D9%85', 'GET').kind, 'discovery');
  assert.equal(nativeRoute('/api/discovery/sources', 'GET').maximumBodyBytes, 0);
  assert.equal(nativeRoute('/api/apply/profile', 'PUT').maximumBodyBytes, MAX_BODY_BYTES);
  for (const target of ['/api/phone/workspace', '/api/account', '/api/account/pairing', '/api/apply/session',
    '/api/apply/session/revoke', '/api/apply/stop', '/__native-journey/control', '/api/apply/jobs?x=1',
    '/api/apply/%70repare', '/api/../api/apply/prepare', '//example.invalid/api/apply/prepare',
    'https://example.invalid/api/apply/prepare', '/api/apply/prepare#fragment', '/api/apply/prepare\\suffix',
    '/api/discovery/search?q=%Q0', '/api/apply/prepare\n']) rejected(() => nativeRoute(target, 'POST'), 'fixture_route_denied');
  rejected(() => nativeRoute('/api/apply/profile', 'POST'), 'fixture_route_denied');
  rejected(() => nativeRoute('/api/apply/prepare', 'GET'), 'fixture_route_denied');
});
test('submit and advance are denied for both native and browser paths before handler admission', () => {
  let admitted = 0;
  for (const prefix of ['apply', 'phone']) for (const action of ['submit', 'advance']) for (const method of ['GET', 'POST', 'PUT']) {
    rejected(() => { nativeRoute(`/api/${prefix}/${action}`, method); admitted++; }, 'fixture_dispatch_denied');
  }
  assert.equal(admitted, 0);
});
test('transport authority is exact, separate and never inferred from a native bearer', () => {
  const token = 'ab'.repeat(32);
  assert.equal(matchesSecret(token, token), true);
  for (const value of [null, '', token.slice(1), token + '0', token.toUpperCase(), 'Bearer ' + token, 'cd'.repeat(32)]) {
    assert.equal(matchesSecret(value, token), false);
  }
});
test('real native Authorization and origin rejection inputs survive forwarding unchanged', () => {
  const authorization = 'Bearer ' + 'ac'.repeat(32);
  const result = nativeHeaders({'authorization': authorization, 'content-type': 'application/json',
    'origin': 'https://foreign.invalid', 'sec-fetch-site': 'cross-site', 'host': '127.0.0.1:12345'}, origin);
  assert.equal(result.get('authorization'), authorization);
  assert.equal(result.get('origin'), 'https://foreign.invalid');
  assert.equal(result.get('sec-fetch-site'), 'cross-site');
  assert.equal(result.get('host'), 'example.invalid');
  assert.equal(result.has('oai-authenticated-user-id'), false);
  assert.equal(nativeHeaders({}, origin).has('authorization'), false);
  assert.equal(nativeHeaders({'authorization': 'Bearer invalid'}, origin).get('authorization'), 'Bearer invalid');
});
test('caller browser identity, cookies, forwarding and private-control headers are refused', () => {
  for (const name of ['oai-authenticated-user-id', 'oai-authenticated-user-email', 'x-career-user', 'cookie',
    'x-journey-actor', 'x-native-journey-runtime', 'x-forwarded-host', 'forwarded', 'cf-connecting-ip']) {
    rejected(() => nativeHeaders({[name]: 'synthetic'}, origin), 'fixture_identity_header_denied');
  }
});
test('bounded bytes preserve Arabic split across network chunks and reject malformed UTF-8', () => {
  const body = Buffer.from(JSON.stringify({city: 'الرياض', title: 'مصمم الخدمة 🧪'}));
  const chunks = [...body].map(byte => Buffer.from([byte]));
  assert.equal(decodeBody(chunks, body.length), body.toString('utf8'));
  rejected(() => decodeBody(chunks, body.length - 1), 'fixture_body_too_large');
  rejected(() => decodeBody([Buffer.from([0xc3, 0x28])], 2), 'fixture_body_invalid_utf8');
  rejected(() => decodeBody([Buffer.from('x')], 0), 'fixture_body_too_large');
  rejected(() => decodeBody([], MAX_BODY_BYTES + 1), 'fixture_body_limit_invalid');
});
const blank = () => ({ok: true, mode: 'test', capabilities: {mode: 'test', liveEnabled: false},
  profile: {revision: 0, resume: null, firstName: '', lastName: '', email: '', phone: '', city: '', country: '',
    headline: '', website: '', linkedin: '', skills: [], targetRoles: [], targetCountries: [], workModes: [], experienceLevel: 'any'},
  jobs: [], attempts: [], recoverablePlans: [], activePlanIds: []});
test('actual test capabilities are required without enabling live submission', () => {
  assertTestCapabilities({ok: true, mode: 'test', liveEnabled: false});
  assertBlankWorkspace(blank());
  for (const value of [{ok: true, mode: 'test', liveEnabled: true}, {ok: true, mode: 'local', liveEnabled: false}, {ok: true, mode: 'test'}]) {
    rejected(() => assertTestCapabilities(value), 'fixture_capability_changed');
  }
});
test('initial fixture cannot pre-seed a contact, PDF, saved job, prepared review or revision', () => {
  for (const change of [v => { v.profile.firstName = 'Seeded'; }, v => { v.profile.email = 'seed@example.invalid'; },
    v => { v.profile.resume = {name: 'CV-A.pdf'}; }, v => { v.profile.revision = 1; },
    v => { v.jobs.push({}); }, v => { v.attempts.push({}); }, v => { v.recoverablePlans.push({}); }]) {
    const value = blank(); change(value);
    rejected(() => assertBlankWorkspace(value), 'fixture_initial_workspace_not_blank');
  }
});
const proof = () => ({providerPostAttempts: 0, forbiddenDispatchAttempts: 0, outboundAttempts: 0,
  plans: [{approvalGeneration: 0, approvedAt: null, lastApprovedAt: null, stopped: 0}],
  attempts: [{state: 'ready', mode: 'test', dispatchCount: 0, approvalGeneration: 0,
    dispatchedAt: null, confirmedAt: null, applicationId: null}]});
test('zero-dispatch proof rejects missing counters, any approval, receipt or provider attempt', () => {
  assert.equal(assertZeroDispatch(proof()), true);
  assert.equal(assertZeroDispatch({...proof(), plans: [], attempts: []}), true);
  for (const key of ['providerPostAttempts', 'forbiddenDispatchAttempts', 'outboundAttempts']) {
    const missing = proof(); delete missing[key]; rejected(() => assertZeroDispatch(missing), 'fixture_zero_dispatch_unproved');
    rejected(() => assertZeroDispatch({...proof(), [key]: 1}), 'fixture_zero_dispatch_unproved');
  }
  for (const [key, value] of [['state', 'confirmed'], ['mode', 'local'], ['dispatchCount', 1], ['approvalGeneration', 1],
    ['dispatchedAt', '2026-11-21T00:00:00Z'], ['confirmedAt', '2026-11-21T00:00:00Z'], ['applicationId', 'invented']]) {
    const changed = proof(); changed.attempts[0][key] = value;
    rejected(() => assertZeroDispatch(changed), 'fixture_zero_dispatch_unproved');
  }
  for (const [key, value] of [['approvalGeneration', 1], ['approvedAt', '2026-11-21T00:00:00Z'], ['lastApprovedAt', '2026-11-21T00:00:00Z'], ['stopped', 1]]) {
    const changed = proof(); changed.plans[0][key] = value;
    rejected(() => assertZeroDispatch(changed), 'fixture_zero_dispatch_unproved');
  }
  rejected(() => assertZeroDispatch({...proof(), attempts: [{}]}), 'fixture_zero_dispatch_unproved');
});
