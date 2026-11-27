import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createJourneyHarness} from './fixtures/journey-browser/harness.mjs';
import {accounts} from './fixtures/journey-browser/data.mjs';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--evidence-dir' || !path.isAbsolute(args[1])) throw Error('Usage: node tests/journey-account-fixture.mjs --evidence-dir /absolute/fresh/evidence');
const evidence = args[1]; await mkdir(evidence, {recursive: false});
const harness = await createJourneyHarness(path.join(evidence, 'isolated-state'));
const groups = [], startedAt = new Date().toISOString(); let requestCount = 0;
const digest = value => createHash('sha256').update(value).digest('hex');
const check = name => {groups.push(name); console.log('PASS', name);};
async function call(route, {expected = 200, ...options} = {}) {
  requestCount++;
  const response = await harness.call(route, options), data = await response.json();
  assert.equal(response.status, expected, `${route}: ${JSON.stringify(data)}`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  return data;
}
async function privateRows() {
  const rows = {};
  for (const table of ['workspaces', 'native_sessions', 'resumes', 'pairing_codes', 'auth_accounts', 'auth_identities', 'browser_sessions', 'oauth_transactions', 'account_lifecycles']) rows[table] = (await harness.db.prepare(`SELECT * FROM ${table}`).all()).results;
  return rows;
}
try {
  await call('/api/account', {expected: 401});
  await call('/api/account', {expected: 401, headers: {'oai-authenticated-user-id': accounts.a.id, 'oai-authenticated-user-email': accounts.a.email}});
  for (const actor of ['a', 'b']) {
    const blank = await call('/api/account', {actor});
    assert.equal(blank.accountId, accounts[actor].id); assert.equal(blank.email, accounts[actor].email);
    assert.equal(blank.workspaceId, null); assert.deepEqual(blank.documents, []); assert.deepEqual(blank.sessions, []);
  }
  assert.equal((await harness.db.prepare('SELECT COUNT(*) AS n FROM workspaces').first()).n, 0);
  check('Actual Account reads preserve blank distinct actors and reject forged guest identity');

  const a = await call('/api/phone/workspace', {actor: 'a', method: 'POST', body: {expectedAccountId: accounts.a.id}});
  const b = await call('/api/phone/workspace', {actor: 'b', method: 'POST', body: {expectedAccountId: accounts.b.id}});
  assert.notEqual(a.workspaceId, b.workspaceId);
  const pdf = await readFile(new URL('./fixtures/pdf-browser/valid.pdf', import.meta.url));
  await call('/api/phone/profile', {actor: 'a', method: 'PUT', body: {expectedWorkspaceId: a.workspaceId, expectedRevision: 0, profile: {firstName: 'Synthetic Account A', lastName: 'Example', email: accounts.a.email, country: 'JO', resume: {name: 'Synthetic-Account-A-CV.pdf', mime: 'application/pdf', dataBase64: pdf.toString('base64')}}}});
  await call('/api/phone/profile', {actor: 'b', method: 'PUT', body: {expectedWorkspaceId: b.workspaceId, expectedRevision: 0, profile: {firstName: 'Synthetic Account B', lastName: 'Example', email: accounts.b.email, country: 'CA'}}});
  const accountA = await call('/api/account', {actor: 'a'}), accountB = await call('/api/account', {actor: 'b'});
  assert.equal(accountA.accountId, accounts.a.id); assert.equal(accountA.workspaceId, a.workspaceId); assert.equal(accountA.profile.firstName, 'Synthetic Account A');
  assert.equal(accountA.documents.length, 1); assert.equal(accountA.documents[0].sha256, digest(pdf)); assert.equal(accountA.usage.storedResumeBytes, pdf.length);
  assert.equal(accountB.accountId, accounts.b.id); assert.equal(accountB.workspaceId, b.workspaceId); assert.equal(accountB.profile.firstName, 'Synthetic Account B');
  assert.deepEqual(accountB.documents, []); assert.equal(accountB.usage.storedResumeBytes, 0);
  for (const value of [accounts.a.id, accounts.a.email, a.workspaceId, digest(pdf), 'Synthetic Account A']) assert.equal(JSON.stringify(accountB).includes(value), false);
  for (const value of [accounts.b.id, accounts.b.email, b.workspaceId, 'Synthetic Account B']) assert.equal(JSON.stringify(accountA).includes(value), false);
  const spoofedB = await call('/api/account', {actor: 'b', headers: {'oai-authenticated-user-id': accounts.a.id, 'oai-authenticated-user-email': accounts.a.email, authorization: 'Bearer synthetic-only', cookie: 'synthetic-only=ignored'}});
  assert.deepEqual(spoofedB, accountB);
  check('Actual Account payloads expose only their synthetic owner, workspace, profile and PDF metadata');

  const before = await privateRows();
  const deniedRoutes = [
    ['/api/account', 'POST', {}],
    ['/api/account', 'DELETE', {confirmation: 'DELETE', expectedWorkspaceId: a.workspaceId, expectedAccountId: accounts.a.id}],
    ['/api/account/pairing', 'POST', {expectedAccountId: accounts.a.id}],
    ['/api/account/sessions/revoke', 'POST', {sessionId: '20000000-0000-4000-8000-000000000001', expectedWorkspaceId: a.workspaceId}],
    ['/api/account/uploads/recover', 'POST', {expectedWorkspaceId: a.workspaceId}],
    ['/api/account/resumes/remove', 'POST', {sha256: digest(pdf), expectedWorkspaceId: a.workspaceId}],
    ['/api/account/export?expectedWorkspaceId=' + a.workspaceId, 'GET'],
    ['/api/account/resumes/' + digest(pdf) + '?expectedWorkspaceId=' + a.workspaceId, 'GET'],
    ['/api/auth/connect', 'POST', {provider: 'google', expectedAccountId: accounts.a.id}],
    ['/api/auth/disconnect', 'POST', {provider: 'google', expectedAccountId: accounts.a.id, expectedConnectionId: '0'.repeat(64)}],
    ['/api/auth/signout', 'POST', {expectedAccountId: accounts.a.id}],
    ['/auth/google/start?return_to=%2Faccount', 'GET'],
    ['/signin-with-chatgpt?return_to=%2Faccount', 'GET'],
  ];
  for (const [route, method, body] of deniedRoutes) {
    const denied = await call(route, {actor: 'a', method, ...(body === undefined ? {} : {body}), expected: 404});
    assert.equal(denied.error.code, 'fixture_route_denied');
  }
  assert.deepEqual(await privateRows(), before, 'Denied account/auth actions must not change either owner or its stored data');
  assert.deepEqual(await call('/api/account', {actor: 'a'}), accountA);
  assert.deepEqual(await call('/api/account', {actor: 'b'}), accountB);
  for (const actor of ['a', 'b']) {
    const status = await call('/api/auth/status', {actor});
    assert.equal(status.account.id, accounts[actor].id);
    for (const provider of ['google', 'linkedin']) {assert.equal(status.providers[provider].configured, false); assert.equal(status.providers[provider].connected, false);}
  }
  const runtime = await call('/__journey/state');
  assert.equal(runtime.providerGets, 0); assert.equal(runtime.providerPosts, 0); assert.equal(runtime.unexpectedProviderTargets, 0); assert.equal(harness.outboundAttempts, 0);
  check('Only Account/status reads are admitted; account mutations, downloads and sign-in remain denied without data or provider effects');
  const receipt = {scope: 'Synthetic Account handler isolation and route-denial checks; not browser, OAuth or production acceptance', startedAt, finishedAt: new Date().toISOString(), groups, requestCount, deniedRouteCount: deniedRoutes.length, sourceWorkerSHA256: harness.workerSHA256, unchangedPrivateRowsSHA256: digest(JSON.stringify(before)), providerGets: runtime.providerGets, providerPosts: runtime.providerPosts, unexpectedProviderTargets: runtime.unexpectedProviderTargets, outboundAttempts: harness.outboundAttempts};
  await writeFile(path.join(evidence, 'account-fixture-check-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
} finally {await harness.dispose();}
