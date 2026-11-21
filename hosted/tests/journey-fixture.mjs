import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createJourneyHarness} from './fixtures/journey-browser/harness.mjs';
import {accounts, BOARD, SOURCE_ID, postingId, postingURL} from './fixtures/journey-browser/data.mjs';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--evidence-dir' || !path.isAbsolute(args[1])) throw Error('Usage: node tests/journey-fixture.mjs --evidence-dir /absolute/fresh/evidence');
const evidence = args[1]; await mkdir(evidence, {recursive: false});
let harness = await createJourneyHarness(path.join(evidence, 'isolated-state'));
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
const fixtureState = () => call('/__journey/state');
const control = body => call('/__journey/control', {method: 'POST', body});
const search = extra => call('/api/discovery/search?' + new URLSearchParams({source: SOURCE_ID, ...extra}));
const pdf = await readFile(new URL('./fixtures/pdf-browser/valid.pdf', import.meta.url));
const createJob = (workspaceId, number) => call('/api/phone/jobs', {actor: 'a', method: 'POST', expected: 201, body: {expectedWorkspaceId: workspaceId, url: postingURL(number)}});
const prepare = async (workspaceId, job) => (await call('/api/phone/prepare', {actor: 'a', method: 'POST', expected: 201, body: {expectedWorkspaceId: workspaceId, jobIds: [job.id], reviewSchema: 3, answers: {[job.id]: {comments: 'Fictional applicant test only', consentStore: true, consentMarketing: false}}}})).plan;
const approve = (workspaceId, plan) => call('/api/phone/submit', {actor: 'a', method: 'POST', expected: 202, body: {expectedWorkspaceId: workspaceId, planId: plan.id, digest: plan.digest, approved: true, reviewSchema: 3}});
const advance = (workspaceId, plan) => call('/api/phone/advance', {actor: 'a', method: 'POST', body: {expectedWorkspaceId: workspaceId, planId: plan.id}});
try {
  assert.equal((await call('/api/auth/status')).account, null);
  await call('/api/phone/workspace', {expected: 401, headers: {'oai-authenticated-user-id': accounts.a.id, 'oai-authenticated-user-email': accounts.a.email}});
  const blankA = await call('/api/phone/workspace', {actor: 'a'});
  assert.equal(blankA.workspaceId, null); assert.equal(blankA.profile.firstName, ''); assert.equal(blankA.profile.resume, null);
  assert.equal(blankA.mode, 'test'); assert.equal(blankA.capabilities.mode, 'test'); assert.equal(blankA.capabilities.liveEnabled, true);
  assert.equal((await harness.db.prepare('SELECT COUNT(*) AS n FROM workspaces').first()).n, 0);
  check('Blank fictional actors and guest isolation; only the declared capability envelope is simulated');

  const sources = await call('/api/discovery/sources'); assert.deepEqual(sources.defaultSources, [SOURCE_ID]);
  await call('/api/discovery/search?source=greenhouse:canonical', {expected: 400});
  await call('/api/auth/connect', {method: 'POST', expected: 404, body: {provider: 'google'}});
  const found = await search({}); assert.equal(found.jobs.length, 6); assert.equal(new Set(found.jobs.map(job => job.id)).size, 6);
  const amman = await search({q: 'Service Designer', location: 'Amman'}); assert.equal(amman.jobs.length, 1); assert.equal(amman.jobs[0].location, 'Amman');
  check('Actual discovery filters six fictional roles, removes duplicate upstream row, and denies real-source/auth routes');

  const priorProviderGets = (await fixtureState()).providerGets;
  for (const source of ['lever:global:unrelated-employer', `lever:eu:${BOARD}`, `greenhouse:${BOARD}`, `https://example.com/${BOARD}`]) {
    const denied = await call('/api/discovery/search?' + new URLSearchParams({source}), {expected: 400});
    assert.equal(denied.error.code, 'fixture_source_denied');
  }
  const duplicated = new URLSearchParams(); duplicated.append('source', SOURCE_ID); duplicated.append('source', `https://jobs.lever.co/${BOARD}/`);
  const duplicate = await call('/api/discovery/search?' + duplicated, {expected: 400});
  assert.equal(duplicate.error.code, 'invalid_query'); assert.match(duplicate.error.message, /each employer board only once/);
  assert.equal((await fixtureState()).providerGets, priorProviderGets);
  const byURL = await call('/api/discovery/search?' + new URLSearchParams({source: `https://jobs.lever.co/${BOARD}/?utm_source=synthetic`}));
  assert.deepEqual(byURL.jobs.map(job => job.id), found.jobs.map(job => job.id));
  check('Equivalent synthetic source forms reach the actual parser; canonical duplicates and unrelated sources never fetch a provider');

  await control({board: 'unavailable'}); const stale = await search({});
  assert.equal(stale.status, 'partial'); assert.equal(stale.sources[0].status, 'stale'); assert.equal(stale.jobs.length, 6);
  await control({board: 'empty'}); const empty = await search({}); assert.equal(empty.status, 'complete'); assert.deepEqual(empty.jobs, []);
  await control({board: 'open'});
  check('Real cache semantics distinguish unreachable stale results from a verified empty board');

  const a = await call('/api/phone/workspace', {actor: 'a', method: 'POST', body: {expectedAccountId: accounts.a.id}});
  const b = await call('/api/phone/workspace', {actor: 'b', method: 'POST', body: {expectedAccountId: accounts.b.id}});
  assert.notEqual(a.workspaceId, b.workspaceId);
  const saved = await call('/api/phone/profile', {actor: 'a', method: 'PUT', body: {expectedWorkspaceId: a.workspaceId, expectedRevision: 0, profile: {firstName: 'Alex', lastName: 'Example', email: accounts.a.email, country: 'JO', resume: {name: 'Synthetic-Journey-CV.pdf', mime: 'application/pdf', dataBase64: pdf.toString('base64')}}}});
  assert.equal(saved.profile.resume.sha256, digest(pdf));
  assert.equal((await call('/api/phone/workspace', {actor: 'b'})).profile.resume, null);
  await call('/api/phone/profile', {actor: 'b', method: 'PUT', expected: 409, body: {expectedWorkspaceId: a.workspaceId, expectedRevision: 1, profile: {firstName: 'Wrong owner'}}});
  check('Actual profile/PDF storage and workspace guards preserve distinct fictional owners');

  const one = (await createJob(a.workspaceId, 1)).job, two = (await createJob(a.workspaceId, 2)).job;
  const plan = await prepare(a.workspaceId, one); assert.equal(plan.items[0].state, 'ready', JSON.stringify(plan.items[0]));
  assert.equal((await fixtureState()).providerPosts, 0);
  await approve(a.workspaceId, plan); assert.equal((await fixtureState()).providerPosts, 0);
  const confirmed = await advance(a.workspaceId, plan);
  assert.equal(confirmed.attempts[0].state, 'confirmed', JSON.stringify(confirmed.attempts[0])); assert.equal(confirmed.attempts[0].mode, 'test'); assert.equal(confirmed.attempts[0].evidenceMode, 'test');
  assert.match(confirmed.attempts[0].applicationId, /^synthetic-journey-/);
  await advance(a.workspaceId, plan); assert.equal((await fixtureState()).providerPosts, 1);
  assert.equal((await prepare(a.workspaceId, one)).items[0].state, 'blocked');
  check('Prepare and approval send nothing; explicit continuation creates one test receipt and blocks duplicates');

  await control({board: 'closed'});
  await call('/api/phone/jobs', {actor: 'a', method: 'POST', expected: 409, body: {expectedWorkspaceId: a.workspaceId, url: postingURL(2)}});
  const closedPlan = await prepare(a.workspaceId, two);
  await approve(a.workspaceId, closedPlan);
  assert.equal((await advance(a.workspaceId, closedPlan)).attempts[0].state, 'blocked');
  assert.equal((await fixtureState()).providerPosts, 1);
  await control({board: 'open'});
  check('Closed posting is rejected at job registration and blocked at dispatch without a synthetic submission');
  await delay(1100); // Respect the actual one-second employer dispatch gate.

  const uncertainJob = (await createJob(a.workspaceId, 3)).job, uncertainPlan = await prepare(a.workspaceId, uncertainJob);
  await approve(a.workspaceId, uncertainPlan);
  assert.equal((await advance(a.workspaceId, uncertainPlan)).attempts[0].state, 'uncertain');
  await advance(a.workspaceId, uncertainPlan); assert.equal((await fixtureState()).providerPosts, 2);
  assert.equal((await prepare(a.workspaceId, uncertainJob)).items[0].state, 'blocked');
  check('Ambiguous synthetic receipt remains uncertain and cannot be retried automatically');
  await delay(1100); // Respect the actual employer dispatch gate before a different job.

  const coolingJob = (await createJob(a.workspaceId, 4)).job, coolingPlan = await prepare(a.workspaceId, coolingJob);
  await approve(a.workspaceId, coolingPlan);
  const cooling = await advance(a.workspaceId, coolingPlan);
  assert.equal(cooling.attempts[0].state, 'rate_limited'); assert.ok(Date.parse(cooling.attempts[0].retryAt) > Date.now());
  await advance(a.workspaceId, coolingPlan); assert.equal((await fixtureState()).providerPosts, 3);
  const stopJob = (await createJob(a.workspaceId, 6)).job, stopPlan = await prepare(a.workspaceId, stopJob);
  const stopped = await call('/api/phone/stop', {actor: 'a', method: 'POST', body: {expectedWorkspaceId: a.workspaceId, planId: stopPlan.id, onlyIfUnapproved: true}});
  assert.equal(stopped.attempts[0].state, 'cancelled'); assert.equal((await fixtureState()).providerPosts, 3);
  check('Rate limit has a real future deadline; Stop cancels unapproved work without dispatch');

  const beforeRestart = await call('/api/phone/workspace', {actor: 'a'}), runtime = await fixtureState();
  assert.equal(runtime.unexpectedProviderTargets, 0); assert.equal(harness.outboundAttempts, 0);
  const workerSHA256 = harness.workerSHA256;
  await harness.dispose(); harness = await createJourneyHarness(path.join(evidence, 'isolated-state'));
  const restarted = await call('/api/phone/workspace', {actor: 'a'});
  assert.equal(restarted.workspaceId, beforeRestart.workspaceId); assert.deepEqual(restarted.profile, beforeRestart.profile); assert.deepEqual(restarted.attempts, beforeRestart.attempts);
  assert.equal((await call('/api/phone/workspace', {actor: 'b'})).profile.resume, null);
  assert.equal(harness.outboundAttempts, 0);
  check('Isolated D1/R2 data and test receipts survive a harness restart without joining accounts');
  const receipt = {scope: 'Synthetic worker fixture checks, not browser/live-provider acceptance', startedAt, finishedAt: new Date().toISOString(), groups, requestCount, sourceWorkerSHA256: workerSHA256, originalSyntheticProviderPosts: runtime.providerPosts, originalProviderGets: runtime.providerGets, unexpectedProviderTargets: runtime.unexpectedProviderTargets, outboundAttempts: harness.outboundAttempts, testOnlyCapabilityEnvelopeCount: runtime.capabilityEnvelopes, accounts: Object.keys(accounts), postingIds: [1, 2, 3, 4, 6].map(postingId)};
  await writeFile(path.join(evidence, 'fixture-check-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
} finally {await harness.dispose();}
