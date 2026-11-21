import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createJourneyHarness} from './fixtures/journey-browser/harness.mjs';
import {SOURCE_ID, postingId, searchSequenceEpoch} from './fixtures/journey-browser/data.mjs';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--evidence-dir' || !path.isAbsolute(args[1])) throw Error('Usage: node tests/journey-search-sequence.mjs --evidence-dir /absolute/fresh/evidence');
const evidence = args[1]; await mkdir(evidence, {recursive: false});
const harness = await createJourneyHarness(path.join(evidence, 'isolated-state'));
const startedAt = new Date().toISOString(), groups = []; let requestCount = 0;
const hash = value => createHash('sha256').update(value).digest('hex');
const check = name => {groups.push(name); console.log('PASS', name);};
async function call(route, {expected = 200, ...options} = {}) {
  requestCount++;
  const response = await harness.call(route, options), value = await response.json();
  assert.equal(response.status, expected, `${route}: ${JSON.stringify(value)}`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return value;
}
const control = body => call('/__journey/control', {method: 'POST', body});
const search = (query = '') => call('/api/discovery/search?' + new URLSearchParams({source: SOURCE_ID, q: query}));
const ids = value => value.jobs.map(job => job.id).sort();
const scoped = values => values.map(value => `${SOURCE_ID}:${postingId(value)}`).sort();
const fixedStamp = new Date(searchSequenceEpoch).toISOString();
const fixed = value => {assert.equal(value.generatedAt, fixedStamp); assert.equal(value.sources[0].checkedAt, fixedStamp); for (const job of value.jobs) assert.equal(job.checkedAt, fixedStamp);};
try {
  const original = await search(); assert.equal(original.jobs.length, 6);
  await control({sequence: 'ab'}); const ab = await search('Designer');
  assert.deepEqual(ids(ab), scoped([101, 102])); fixed(ab); assert.equal(ab.sources[0].matchedCount, 2);
  await control({sequence: 'bc'}); const bc = await search('Designer');
  assert.deepEqual(ids(bc), scoped([102, 103])); fixed(bc); assert.equal(bc.status, 'complete');
  assert(bc.jobs.some(job => job.id.endsWith(postingId(102)) && job.location === 'Toronto'));
  assert(bc.jobs.some(job => job.id.endsWith(postingId(103)) && job.location === 'Remote'));
  check('Actual discovery returns distinct A/B then B/C identities with fixed source and result timestamps');

  await control({sequence: 'cb'}); const reordered = await search('Designer');
  assert.deepEqual(reordered, bc, 'actual normalizer removes the duplicate and provider ordering difference');
  await control({board: 'unavailable'}); const stale = await search('Designer');
  assert.equal(stale.status, 'partial'); assert.equal(stale.sources[0].status, 'stale');
  assert.deepEqual(ids(stale), ids(bc)); assert(stale.jobs.every(job => job.stale)); fixed(stale);
  await control({board: 'open'}); const recovered = await search('Designer');
  assert.deepEqual(recovered, bc);
  check('Reordering is stable and the actual cache preserves B/C through outage then recovers fresh');

  const before = await call('/__journey/state');
  for (const body of [{sequence: 'real-employer'}, {sequence: 'bc', clock: 0}, {sequence: null}]) {
    const value = await call('/__journey/control', {method: 'POST', body, expected: 400});
    assert.equal(value.error.code, 'invalid_fixture_control');
  }
  const denied = await call('/api/discovery/search?source=lever:global:unrelated', {expected: 400});
  assert.equal(denied.error.code, 'fixture_source_denied');
  assert.equal((await call('/__journey/state')).providerGets, before.providerGets);
  await control({sequence: 'journey'}); const restored = await search();
  assert.deepEqual(ids(restored), ids(original)); assert.equal(restored.jobs.length, 6);
  const runtime = await call('/__journey/state');
  assert.equal(runtime.sequence, 'journey'); assert.equal(runtime.providerPosts, 0); assert.equal(runtime.unexpectedProviderTargets, 0); assert.equal(harness.outboundAttempts, 0);
  assert.equal((await harness.db.prepare('SELECT COUNT(*) AS n FROM workspaces').first()).n, 0);
  check('Invalid controls and unrelated boards are denied; original six-job journey remains intact without private writes or provider POSTs');

  const sourceHashes = {};
  for (const file of ['data.mjs', 'runtime.mjs', 'harness.mjs']) sourceHashes[file] = hash(await readFile(new URL('./fixtures/journey-browser/' + file, import.meta.url)));
  const receipt = {startedAt, completedAt: new Date().toISOString(), groups, requestCount, sourceHashes, workerSHA256: harness.workerSHA256, sequenceClock: fixedStamp, observed: {ab: ids(ab), bc: ids(bc), reordered: ids(reordered), stale: ids(stale), recovered: ids(recovered), default: ids(restored)}, runtime, outboundAttempts: harness.outboundAttempts, scope: 'Synthetic actual discovery-handler evidence only; no browser/newness UI or real-provider acceptance'};
  await writeFile(path.join(evidence, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({groups: groups.length, requestCount, providerGets: runtime.providerGets, providerPosts: runtime.providerPosts, outboundAttempts: harness.outboundAttempts, evidence}));
} finally {await harness.dispose();}
