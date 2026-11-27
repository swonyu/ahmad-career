import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as hostedValidation from '../server/validation.mjs';
import * as companionValidation from '../../website/applications/validation.mjs';
import { makeAdapter as hostedAdapter } from '../server/provider.mjs';
import { makeAdapter as companionAdapter } from '../../website/applications/lever.mjs';
import { createHostedApplicationHandler, SERVICE_ORIGIN } from '../server/applications.mjs';

const { canonical, sha256 } = hostedValidation;
const invalidText = ['\ud800', '\udfff', 'prefix\ud800suffix', 'prefix\udfffsuffix', '\ud800\ud800', '\udfff\udfff'];
const target = { provider: 'lever', region: 'global', site: 'synthetic', postingId: '11111111-2222-4333-8444-555555555555', url: 'https://jobs.lever.co/synthetic/11111111-2222-4333-8444-555555555555', key: 'synthetic' };

test('new hosted and companion writes reject unpaired surrogates without replacing characters', () => {
  for (const validation of [hostedValidation, companionValidation]) {
    for (const input of invalidText) assert.throws(() => validation.text(input, 'name', 500, false), error => error.code === 'invalid_field');
    assert.throws(() => validation.profile({ firstName: 'bad\ud800' }), error => error.code === 'invalid_field');
    assert.throws(() => validation.answers({ comments: 'bad\udfff' }), error => error.code === 'invalid_field');
    assert.throws(() => validation.resume({ name: 'bad\ud800.pdf', mime: 'application/pdf', dataBase64: 'JVBERi0xLjEK' }), error => error.code === 'invalid_field');
    assert.throws(() => validation.publicURL('https://example.com/\ud800'), error => error.code === 'invalid_field');
  }
});

test('valid Arabic, astral pairs, combining sequences, and intentional U+FFFD stay exact', () => {
  for (const input of ['العربية English', '😀'.repeat(75), 'a\u0301', '\uFFFD', '\ud800\udc00']) {
    for (const validation of [hostedValidation, companionValidation]) assert.equal(validation.text(input, 'name', 500, false), input);
  }
});

test('the canonical URL length boundary remains enforced after Unicode validation', () => {
  for (const validation of [hostedValidation, companionValidation]) {
    assert.throws(() => validation.publicURL('https://example.com/' + '界'.repeat(400)), error => error.code === 'invalid_field');
    assert.equal(validation.publicURL('https://example.com/وظائف'), 'https://example.com/%D9%88%D8%B8%D8%A7%D8%A6%D9%81');
  }
});

async function withPosting(payload, checkPosting) {
  const previousFetch = globalThis.fetch;
  let reads = 0;
  const fakeFetch = async (_url, options = {}) => {
    assert.equal(options.method ?? 'GET', 'GET', 'a posting check must never send an application');
    reads++;
    return Response.json({ id: target.postingId, ...payload });
  };
  globalThis.fetch = fakeFetch;
  try { await checkPosting(fakeFetch); assert.ok(reads > 0); }
  finally { globalThis.fetch = previousFetch; }
}

function postingHash(payload) {
  return sha256(canonical({ id: target.postingId, text: payload.text, categories: payload.categories ?? null, country: payload.country ?? null, workplaceType: payload.workplaceType ?? null, descriptionPlain: payload.descriptionPlain ?? null, additionalPlain: payload.additionalPlain ?? null, lists: payload.lists ?? null }));
}

for (const [name, createAdapter] of [
  ['hosted', fake => hostedAdapter({ CAREER_UNICODE_FIXTURE_KEY: 'synthetic-only' }, { fetchImpl: fake })],
  ['companion', () => companionAdapter({ testOnly: { enabled: true, baseURL: 'http://127.0.0.1:1' }, env: { NODE_ENV: 'test', CAREER_UNICODE_FIXTURE_KEY: 'synthetic-only' } })],
]) {
  test(`${name}: a valid pair crossing the 500-unit boundary stays whole and the full posting hash stays exact`, async () => {
    const payload = { text: 'a'.repeat(499) + '😀', categories: { location: 'b'.repeat(499) + '😀' } };
    await withPosting(payload, async fake => {
      const posting = await createAdapter(fake).posting(target);
      assert.equal(posting.title, 'a'.repeat(499));
      assert.equal(posting.location, 'b'.repeat(499));
      assert.equal(posting.metadataHash, postingHash(payload));
    });
  });

  test(`${name}: pairs ending at 500 units and Arabic posting text remain exact`, async () => {
    for (const text of ['a'.repeat(498) + '😀', 'وظائف في الرياض']) {
      const payload = { text, categories: { location: text } };
      await withPosting(payload, async fake => {
        const posting = await createAdapter(fake).posting(target);
        assert.equal(posting.title, text); assert.equal(posting.location, text);
        assert.equal(posting.metadataHash, postingHash(payload));
      });
    }
  });

  test(`${name}: malformed provider title or location fails before any application request`, async () => {
    for (const payload of [
      { text: 'invalid\ud800', categories: { location: 'Riyadh' } },
      { text: 'valid', categories: { location: 'invalid\udfff' } },
      { text: 'a'.repeat(501) + '\ud800', categories: { location: 'Riyadh' } },
    ]) await withPosting(payload, async fake => assert.rejects(() => createAdapter(fake).posting(target), error => error.code === 'posting_unavailable' && error.status === 503 && error.message === 'The employer posting returned an unreadable response.'));
  });

  test(`${name}: malformed receipt IDs remain uncertain with the exact response hash and no resend; valid IDs remain exact`, async () => {
    const previousFetch = globalThis.fetch;
    const pdf = Buffer.from('%PDF-synthetic');
    const snapshot = { profile: { firstName: 'Synthetic', lastName: '', email: 'fixture@example.com', resume: { name: 'synthetic.pdf', dataBase64: pdf.toString('base64') } }, answers: {} };
    try {
      for (const applicationId of ['receipt\ud800', 'receipt\udfff', 'receipt\ud800x', 'receipt-😀', 'إيصال', 'receipt-\uFFFD']) {
        const response = { ok: true, applicationId };
        let posts = 0;
        const fakeFetch = async (_url, options = {}) => {
          assert.equal(options.method, 'POST');
          posts++;
          return Response.json(response);
        };
        globalThis.fetch = fakeFetch;
        const outcome = await createAdapter(fakeFetch).submit(target, snapshot, { apiKeyEnv: 'CAREER_UNICODE_FIXTURE_KEY' }, pdf);
        assert.equal(posts, 1, 'an uncertain result must not cause an automatic retry');
        assert.equal(outcome.responseSHA256, sha256(JSON.stringify(response)));
        if (/[\uD800-\uDFFF]/u.test(applicationId)) {
          assert.equal(outcome.state, 'uncertain');
          assert.equal(outcome.error.code, 'unconfirmed_response');
          assert.equal(outcome.applicationId, undefined);
        } else {
          assert.equal(outcome.state, 'confirmed');
          assert.equal(outcome.applicationId, applicationId);
        }
      }
    } finally { globalThis.fetch = previousFetch; }
  });
}

test('legacy malformed filenames remain exact in workspace and receipt views, without rewriting immutable plans or snapshots', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const filename of readdirSync(new URL('../drizzle/', import.meta.url)).filter(name => name.endsWith('.sql')).sort()) db.exec(readFileSync(new URL('../drizzle/' + filename, import.meta.url), 'utf8'));
    const statement = (sql, args = []) => ({
      bind(...values) { return statement(sql, values); },
      async first() { return db.prepare(sql).get(...args) ?? null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { throw new Error('workspace and receipt reads must not mutate the fixture'); },
    });
    const DB = { prepare: statement, async batch() { throw new Error('workspace and receipt reads must not mutate the fixture'); } };
    const time = Date.parse('2026-11-22T20:00:00Z'), createdAt = new Date(time).toISOString(), expiresAt = new Date(time + 1800000).toISOString();
    const workspaceId = randomUUID(), planId = randomUUID(), token = '1'.repeat(64), legacyNames = ['old\ud800.pdf', 'old\udfff.pdf'];
    const profile = { firstName: 'Synthetic', lastName: '', email: 'fixture@example.com', phone: '', city: '', country: 'SA', headline: '', skills: [], targetRoles: [], targetCountries: [], workModes: [], experienceLevel: 'any', website: '', linkedin: '', resume: { name: legacyNames[0], mime: 'application/pdf', size: 100, sha256: 'a'.repeat(64) } };
    db.prepare('INSERT INTO workspaces(id,owner_id,owner_email,created_at,profile_json,revision) VALUES(?,?,?,?,?,1)').run(workspaceId, 'synthetic-unicode-history', profile.email, createdAt, JSON.stringify(profile));
    db.prepare('INSERT INTO native_sessions(token_hash,id,workspace_id,created_at,expires_at) VALUES(?,?,?,?,?)').run(sha256(token), randomUUID(), workspaceId, createdAt, expiresAt);
    const entries = legacyNames.map((name, index) => {
      const id = randomUUID(), job = { ...target, id: randomUUID(), key: 'synthetic-' + index, title: 'Synthetic posting', company: 'Synthetic', location: 'Riyadh', country: 'SA' };
      const snapshot = { job, profile: { ...profile, resume: { ...profile.resume, name } }, profileRevision: 1, answers: { comments: '' }, requirements: { revision: 'synthetic-v1' }, mode: 'test', payloadSHA256: String(index + 1).repeat(64) };
      const item = { attemptId: id, jobId: job.id, job: { id: job.id, title: job.title, company: job.company, url: job.url, location: job.location, country: job.country }, title: job.title, company: job.company, state: 'ready', reason: '', payloadSummary: { name: 'Synthetic', email: profile.email, phone: '', website: '', comments: '' }, resume: snapshot.profile.resume, privacyPolicyUrl: null, requirementsRevision: 'synthetic-v1' };
      return { id, job, snapshot, item };
    });
    const itemsJSON = JSON.stringify(entries.map(entry => entry.item));
    const digest = sha256(canonical({ planId, workspaceId, profileRevision: 1, createdAt, expiresAt, items: entries.map(entry => entry.item), snapshots: entries.map(entry => entry.snapshot.payloadSHA256) }));
    db.prepare('INSERT INTO plans(id,workspace_id,digest,profile_revision,created_at,expires_at,items_json) VALUES(?,?,?,1,?,?,?)').run(planId, workspaceId, digest, createdAt, expiresAt, itemsJSON);
    entries.forEach((entry, index) => db.prepare('INSERT INTO attempts(id,plan_id,workspace_id,applicant_hash,job_key,job_id,state,snapshot_json,created_at,mode) VALUES(?,?,?,?,?,?,?,?,?,?)').run(entry.id, planId, workspaceId, 'b'.repeat(64), entry.job.key, entry.job.id, index ? 'confirmed' : 'ready', JSON.stringify(entry.snapshot), createdAt, 'test'));
    const before = JSON.stringify({ plans: db.prepare('SELECT * FROM plans ORDER BY id').all(), attempts: db.prepare('SELECT * FROM attempts ORDER BY id').all(), workspace: db.prepare('SELECT * FROM workspaces').all() });
    let providerCalls = 0;
    const failProvider = async () => { providerCalls++; throw new Error('reads must never contact a provider'); };
    const handler = createHostedApplicationHandler({ clock: () => time, adapterFactory: () => ({ mode: 'test', posting: failProvider, submit: failProvider }) });
    const env = { DB, BUCKET: {} };
    const read = async path => {
      const response = await handler(new Request(SERVICE_ORIGIN + path, { headers: { authorization: 'Bearer ' + token } }), env, {});
      assert.equal(response.status, 200); return response.json();
    };
    const workspace = await read('/api/apply/workspace'), receipts = await read('/api/apply/receipts');
    assert.equal(workspace.profile.resume.name, legacyNames[0]);
    for (const [index, entry] of entries.entries()) assert.equal(workspace.attempts.find(attempt => attempt.id === entry.id).resumeName, legacyNames[index]);
    assert.equal(receipts.receipts.find(attempt => attempt.id === entries[1].id).resumeName, legacyNames[1]);
    assert.equal(workspace.recoverablePlans[0].digest, digest);
    assert.deepEqual(workspace.recoverablePlans[0].items.map(item => item.resume.name), legacyNames);
    const after = JSON.stringify({ plans: db.prepare('SELECT * FROM plans ORDER BY id').all(), attempts: db.prepare('SELECT * FROM attempts ORDER BY id').all(), workspace: db.prepare('SELECT * FROM workspaces').all() });
    assert.equal(after, before, 'original plan JSON, digest, profile JSON, and immutable snapshot bytes must stay exact');
    assert.equal(providerCalls, 0);
  } finally { db.close(); }
});
