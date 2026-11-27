import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createHash, webcrypto } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(join(tmpdir(), 'career-workspace-history-'));
after(() => rm(directory, { recursive: true, force: true }));
await build({ stdin: { contents: 'export * from "./app/phone/model.ts"; export { createPhoneVault } from "./app/phone/vault.ts";', resolveDir: process.cwd(), sourcefile: 'workspace-history-client.ts' }, outfile: join(directory, 'client.mjs'), bundle: true, platform: 'node', format: 'esm' });
const client = await import(pathToFileURL(join(directory, 'client.mjs')).href);

const id = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const now = '2026-11-23T12:00:00.000Z', later = '2099-11-23T12:30:00.000Z';
const prefix = 'https://example.com/';
// Exact pre-BA02 input/canonical pair preserved in the actual-handler evidence.
const oldInput = prefix + '界'.repeat(2048 - prefix.length);
const oldURL = prefix + '%E7%95%8C'.repeat(2048 - prefix.length);
const scope = `account:synthetic-history:${id(999)}`;
const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
const fingerprint = value => createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex');

function fixture() {
  const profile = { ...client.blankProfile(), firstName: 'Synthetic', email: 'synthetic@example.com', website: oldURL, resume: { name: 'Synthetic.pdf', mime: 'application/pdf', size: 8, sha256: 'a'.repeat(64) }, revision: 1 };
  const job = { id: id(1), title: 'Historical saved opportunity', company: 'Synthetic employer', url: oldURL, location: 'الرياض', country: 'SA' };
  const plan = { id: id(2), digest: 'b'.repeat(64), profileRevision: 1, createdAt: now, expiresAt: later, stopped: false, approvedAt: null, items: [{ jobId: job.id, job: { ...job }, title: job.title, company: job.company, state: 'ready', reason: '', payloadSummary: { name: profile.firstName, email: profile.email, phone: '', website: oldURL, linkedin: '', comments: 'Exact historical answer', consentStore: true, consentMarketing: false }, resume: profile.resume, privacyPolicyUrl: oldURL, requirementsRevision: 'synthetic-history', retryAt: null }] };
  const receipt = { id: id(3), planId: plan.id, jobId: job.id, title: job.title, company: job.company, url: oldURL, state: 'ready', resumeName: profile.resume.name, profileRevision: 1, createdAt: now, mode: 'test', evidenceMode: 'test', dispatchCount: 0, dispatchedAt: null, error: null };
  return { ok: true, accountId: 'synthetic-history', accountEmail: profile.email, confirmedEmail: profile.email, emailUpdateRequired: false, deleting: false, workspaceId: id(999), mode: 'test', profile, jobs: [job], attempts: [receipt], capabilities: { liveEnabled: false, linkedinProfile: true, mode: 'test', coverage: 'Synthetic only' }, recoverablePlans: [plan], activePlanIds: [] };
}

class MemoryPort {
  rows = new Map();
  writes = 0;
  async read(key) { return this.rows.has(key) ? { exists: true, value: structuredClone(this.rows.get(key)) } : { exists: false }; }
  async compareAndSet(key, expectedId, value) {
    const exists = this.rows.has(key), previous = this.rows.get(key);
    if (expectedId === null ? exists : !exists || previous?.envelopeId !== expectedId) return false;
    this.rows.set(key, structuredClone(value)); this.writes++; return true;
  }
  async remove(key, marker) { this.rows.set(key, structuredClone(marker)); }
  async list(prefixValue) { return [...this.rows].filter(([key, value]) => key.startsWith(prefixValue) && value.reset !== true).map(([key, value]) => ({ scope: key, updatedAt: value.updatedAt })); }
}
const makeVault = port => client.createPhoneVault({ port, crypto: webcrypto, now: () => new Date(now) });

test('the exact 18,272-character historical website remains readable in every workspace location', () => {
  assert.equal(oldInput.length, 2048); assert.equal(oldURL.length, 18272); assert.equal(new URL(oldInput).href, oldURL);
  const raw = fixture(), before = structuredClone(raw), originalJSON = JSON.stringify(raw), planHash = fingerprint(raw.recoverablePlans[0]);
  const parsed = client.workspaceSchema.parse(JSON.parse(JSON.stringify(raw)));
  assert.deepEqual(parsed, raw); assert.deepEqual(raw, before);
  assert.equal(JSON.stringify(raw), originalJSON);
  assert.equal(fingerprint(parsed.recoverablePlans[0]), planHash);
  assert.equal(parsed.recoverablePlans[0].digest, raw.recoverablePlans[0].digest);
  console.log(JSON.stringify({ historicalWebsiteInputUnits: oldInput.length, historicalWebsiteCanonicalUnits: oldURL.length, workspaceBytes: Buffer.byteLength(JSON.stringify(raw)), preservedPlanDigest: true }));
});

test('new profile and job URL writes keep both input and canonical output at 2,048 units', () => {
  const limit = prefix + 'x'.repeat(2048 - prefix.length);
  assert.equal(client.publicURL(limit), limit);
  assert.equal(client.profileRequest({ ...client.blankProfile(), website: limit }).website, limit);
  for (const input of [oldInput, oldURL, limit + 'x']) {
    assert.throws(() => client.publicURL(input), { message: 'This link is too long. Use a shorter link.' });
    assert.throws(() => client.profileRequest({ ...client.blankProfile(), website: input }));
  }
  // New URL must not normalize combining sequences to make an oversized value fit.
  assert.throws(() => client.publicURL(prefix + 'e\u0301'.repeat(300)));
  assert.equal(client.publicURL(prefix + '\u00e9'.repeat(300)).length, 1820);
  assert.equal(client.publicURL('https://example.com:443/job#details'), 'https://example.com/job');
});

test('URL validation rejects unpaired code units without confusing intentional replacement characters', () => {
  for (const input of [prefix + '\ud800', prefix + '\udfff']) {
    assert.throws(() => client.publicURL(input));
    assert.throws(() => client.historicalPublicURL(input));
    assert.throws(() => client.jobIdentity(input));
    assert.throws(() => client.profileSchema.parse({ ...client.blankProfile(), website: input }));
  }
  const intentional = prefix + '\ufffd';
  assert.equal(client.historicalPublicURL(intentional), intentional);
  assert.equal(client.publicURL(intentional), prefix + '%EF%BF%BD');
  assert.equal(client.jobIdentity(intentional), client.jobIdentity(prefix + '%EF%BF%BD'));
  assert.equal(client.historicalPublicURL(prefix + 'العربية🌱'), prefix + 'العربية🌱');
  assert.equal(client.jobIdentity(prefix + '🌱'), client.jobIdentity(prefix + '%F0%9F%8C%B1'));
});

test('historical URL reads retain lexical text while identities compare without length rejection', () => {
  const lexical = 'HTTPS://EXAMPLE.COM:443/' + '%e7%95%8c'.repeat(2028) + '?b=two%20words&a=1&utm_source=old#section';
  const job = { ...fixture().jobs[0], url: lexical };
  assert.equal(client.historicalPublicURL(lexical), lexical);
  assert.equal(client.jobSchema.parse(job).url, lexical);
  assert.equal(client.profileSchema.parse({ ...client.blankProfile(), website: lexical }).website, lexical);
  const identity = client.jobIdentity(lexical);
  assert.ok(identity.length > 2048); assert.ok(!identity.includes('utm_source')); assert.ok(!identity.includes('#section'));
  assert.equal(identity, client.jobIdentity(lexical.replace('utm_source=old', 'utm_source=another')));
  assert.notEqual(identity, client.jobIdentity(lexical.replace('a=1', 'a=2')));
});

test('removing the historical length rejection retains the public HTTPS destination policy', () => {
  const suffix = 'x'.repeat(3000);
  for (const value of [
    `http://example.com/${suffix}`, `https://name:secret@example.com/${suffix}`, `https://example.com:8443/${suffix}`,
    `https://127.0.0.1/${suffix}`, `https://[::1]/${suffix}`, `https://private.local/${suffix}`, `https://private.internal/${suffix}`,
    `https://localhost/${suffix}`, `https://example.invalid/${suffix}`, `https://example.com/${suffix} space`,
    `https://example.com/${suffix}\\path`, `https://example.com/${suffix}\u0000`,
  ]) {
    assert.throws(() => client.historicalPublicURL(value));
    assert.throws(() => client.profileSchema.parse({ ...client.blankProfile(), website: value }));
    assert.throws(() => client.jobSchema.parse({ ...fixture().jobs[0], url: value }));
  }
});

test('long saved opportunity identities retain deduplication and exact review matching', () => {
  const workspace = fixture(), job = workspace.jobs[0], plan = workspace.recoverablePlans[0];
  const snapshot = { ...client.blankSnapshot(scope), profile: workspace.profile, jobs: [job], records: [client.blankRecord(job)] };
  assert.equal(snapshot.records[0].identity, oldURL);
  assert.deepEqual(client.parseSnapshot(snapshot, scope), snapshot);
  assert.throws(() => client.parseSnapshot({ ...snapshot, jobs: [job, { ...job, id: id(7), url: job.url + '?utm_campaign=old' }] }, scope));
  assert.throws(() => client.parseSnapshot({ ...snapshot, records: [{ ...snapshot.records[0], identity: oldURL + '?utm_campaign=old' }] }, scope));
  assert.doesNotThrow(() => client.checkReview(plan, workspace.profile, [job], []));
  assert.throws(() => client.checkReview(plan, { ...workspace.profile, website: oldURL.toLowerCase() }, [job], []));
  const changed = structuredClone(plan); changed.items[0].job.url += '?job=another';
  assert.throws(() => client.checkReview(changed, workspace.profile, [job], []));
});

test('long URLs and original UTF-16 text survive encrypted draft and recovery round trips', async () => {
  const workspace = fixture(), job = workspace.jobs[0], snapshot = { ...client.blankSnapshot(scope), profile: workspace.profile, jobs: [job], records: [client.blankRecord(job)] };
  snapshot.profile.firstName = 'قديم\ud800 عربي 🌱';
  snapshot.profile.resume.name = 'قديم\udfff.pdf';
  snapshot.records[0].note = 'Preserved \ud800 \udfff and valid 🌱 العربية';
  snapshot.safety = { holds: [], recovery: [{ id: id(8), savedAt: now, profile: { ...snapshot.profile } }] };
  const port = new MemoryPort(), vault = makeVault(port);
  await vault.savePhoneSnapshot(scope, snapshot);
  const stored = port.rows.get(scope);
  assert.equal(stored.key.extractable, false); assert.equal(stored.key.algorithm.name, 'AES-GCM');
  assert.deepEqual(await makeVault(port).loadPhoneSnapshot(scope), snapshot);
  const exported = JSON.parse(await vault.exportPhoneSnapshot(scope));
  assert.equal(exported.profile.website, oldURL);
  assert.equal(exported.profile.firstName, snapshot.profile.firstName);
  assert.equal(exported.records[0].note, snapshot.records[0].note);
  assert.equal(exported.safety.recovery[0].profile.website, oldURL);
});

test('unsafe or conflicting historical draft data cannot replace the previous encrypted draft', async () => {
  const workspace = fixture(), snapshot = { ...client.blankSnapshot(scope), profile: workspace.profile, jobs: workspace.jobs };
  const port = new MemoryPort(), vault = makeVault(port);
  await vault.savePhoneSnapshot(scope, snapshot);
  const before = structuredClone(port.rows.get(scope));
  const unsafe = { ...snapshot, profile: { ...snapshot.profile, website: 'https://private.local/' + 'x'.repeat(3000) } };
  await assert.rejects(vault.savePhoneSnapshot(scope, unsafe), error => error.code === 'invalid_snapshot');
  assert.equal(port.writes, 1); assert.deepEqual(port.rows.get(scope).ciphertext, before.ciphertext);
  assert.deepEqual(await makeVault(port).loadPhoneSnapshot(scope), snapshot);
});

test('the existing 20 MiB encrypted draft bound fails without discarding an earlier save', async () => {
  const port = new MemoryPort(), vault = makeVault(port), snapshot = client.blankSnapshot(scope);
  await vault.savePhoneSnapshot(scope, snapshot);
  const before = structuredClone(port.rows.get(scope));
  const oversized = { ...snapshot, profile: { ...snapshot.profile, website: prefix + 'x'.repeat(20 * 1024 * 1024) } };
  await assert.rejects(vault.savePhoneSnapshot(scope, oversized), error => error.code === 'too_large');
  assert.equal(port.writes, 1); assert.deepEqual(port.rows.get(scope).ciphertext, before.ciphertext);
  assert.deepEqual(await makeVault(port).loadPhoneSnapshot(scope), snapshot);
});
