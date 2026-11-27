import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createHash, webcrypto } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createReadFrame, verifyReadCursor, READ_HEADERS } from '../server/read-transport.mjs';

const directory = await mkdtemp(join(tmpdir(), 'career-workspace-read-'));
after(() => rm(directory, { recursive: true, force: true }));
await build({ stdin: { contents: 'export * from "./app/phone/api.ts"; export * from "./app/phone/read-transport.ts"; export * from "./app/phone/read-outcomes.ts"; export * from "./app/phone/historical-text.ts"; export * from "./app/phone/model.ts"; export {createPhoneVault} from "./app/phone/vault.ts"; export {APIError} from "./app/components/api.ts";', resolveDir: process.cwd(), sourcefile: 'workspace-read-client.ts' }, outfile: join(directory, 'client.mjs'), bundle: true, platform: 'node', format: 'esm' });
const client = await import(pathToFileURL(join(directory, 'client.mjs')).href);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const accountId = 'synthetic-history', workspaceId = id(999), asOf = '2026-11-23T12:00:00.000Z', salt = 'e'.repeat(64);
const scope = { audience: 'phone', accountId, workspaceId, sessionBinding: 'f'.repeat(64) };
const spec = kind => ({ kind, resourceId: ['job', 'plan', 'plan-state'].includes(kind) ? id(kind === 'job' ? 1 : 2) : null, variant: '' });
const job = { id: id(1), title: 'Synthetic role', company: 'Synthetic employer', url: 'https://example.com/job', location: 'الرياض', country: 'SA' };
function workspace() {
  const profile = { ...client.blankProfile(), firstName: 'Synthetic', email: 'synthetic@example.com', resume: { name: 'Synthetic.pdf', mime: 'application/pdf', size: 8, sha256: 'a'.repeat(64) }, revision: 1 };
  const plan = { id: id(2), digest: 'b'.repeat(64), profileRevision: 1, createdAt: asOf, expiresAt: '2099-11-23T12:30:00.000Z', stopped: false, approvedAt: null, items: [{ jobId: job.id, job: { ...job }, title: job.title, company: job.company, state: 'ready', reason: '', payloadSummary: { name: profile.firstName, email: profile.email, phone: '', website: '', linkedin: '', comments: 'Synthetic answer', consentStore: true, consentMarketing: false }, resume: profile.resume, privacyPolicyUrl: 'https://example.com/privacy', requirementsRevision: 'synthetic', retryAt: null }] };
  return { ok: true, accountId, accountEmail: profile.email, confirmedEmail: profile.email, emailUpdateRequired: false, deleting: false, workspaceId, mode: 'test', profile, jobs: [{ ...job }], attempts: [], capabilities: { liveEnabled: false, linkedinProfile: true, mode: 'test', coverage: 'Synthetic only' }, recoverablePlans: [plan], activePlanIds: [] };
}
function largeWorkspace(variant = 'legacy-url') {
  const value = workspace(), glyph = variant === 'surrogate' ? '\ud800' : '界', prefix = 'https://example.com/';
  const website = variant === 'legacy-url' ? prefix + '%E7%95%8C'.repeat(2048 - prefix.length) : prefix + 'x'.repeat(2048 - prefix.length);
  value.profile = { ...value.profile, firstName: glyph.repeat(150), lastName: glyph.repeat(150), phone: glyph.repeat(150), website, linkedin: 'https://www.linkedin.com/in/' + 'x'.repeat(2020), resume: { ...value.profile.resume, name: glyph.repeat(176) + '.pdf' } };
  value.jobs = Array.from({ length: 200 }, (_, i) => ({ ...job, id: id(i + 10), title: glyph.repeat(500), location: glyph.repeat(500), url: `https://jobs.lever.co/synthetic/${id(i + 10)}` }));
  value.recoverablePlans = Array.from({ length: 20 }, (_, i) => ({ ...value.recoverablePlans[0], id: id(1000 + i), items: value.jobs.slice(0, 20).map(target => ({ ...value.recoverablePlans[0].items[0], jobId: target.id, job: target, title: target.title, payloadSummary: { name: value.profile.firstName + ' ' + value.profile.lastName, email: value.profile.email, phone: value.profile.phone, website, linkedin: value.profile.linkedin, comments: glyph.repeat(480), consentStore: true, consentMarketing: false }, resume: value.profile.resume, privacyPolicyUrl: prefix + 'x'.repeat(2048 - prefix.length) })) }));
  value.attempts = Array.from({ length: 500 }, (_, i) => ({ id: id(2000 + i), planId: id(1000 + i % 20), jobId: value.jobs[i % 20].id, title: value.jobs[i % 20].title, company: job.company, url: value.jobs[i % 20].url, state: 'ready', resumeName: value.profile.resume.name, profileRevision: 1, createdAt: asOf, mode: 'test', evidenceMode: 'test', dispatchCount: 0, dispatchedAt: null, error: null }));
  return value;
}
class MemoryPort {
  rows = new Map();
  async read(key) { return this.rows.has(key) ? { exists: true, value: structuredClone(this.rows.get(key)) } : { exists: false }; }
  async compareAndSet(key, expected, value) { const old = this.rows.get(key); if (expected === null ? this.rows.has(key) : old?.envelopeId !== expected) return false; this.rows.set(key, structuredClone(value)); return true; }
  async remove(key, value) { this.rows.set(key, structuredClone(value)); }
  async list(prefix) { return [...this.rows].filter(([key, value]) => key.startsWith(prefix) && !value.reset).map(([key, value]) => ({ scope: key, updatedAt: value.updatedAt })); }
}
function journal(port = new MemoryPort()) { return client.createReadOutcomeJournal(client.createPhoneVault({ port, crypto: webcrypto, now: () => new Date(asOf) })); }
const options = outcomes => ({ expectedAccountId: accountId, outcomes });
const frame = (data, kind = 'workspace', expected = null, operation = null) => createReadFrame({ data, spec: spec(kind), scope, salt, asOf, expected, operation });
const response = data => Response.json(data, { headers: READ_HEADERS });
function install(t, implementation) { const original = globalThis.fetch, requests = []; t.after(() => { globalThis.fetch = original; }); globalThis.fetch = async (path, request) => { requests.push({ path, method: request.method, signal: request.signal, headers: new Headers(request.headers), body: request.body }); return implementation(path, request, requests.length); }; return requests; }
function nextFrame(data, path) { const cursor = new URL(path, 'https://career-finder.invalid').searchParams.get('cursor'); return frame(data, 'workspace', verifyReadCursor(cursor, { scope, salt, now: Date.parse(asOf) })); }
function operation(kind) { return { kind, acknowledged: true, accountId, workspaceId, ...(kind === 'profile' ? { revision: 1 } : kind === 'jobs' ? { jobId: id(1) } : kind === 'workspace' ? {} : { planId: id(2), digest: 'b'.repeat(64) }) }; }
function documentFrame(document) { const bytes = Buffer.from(JSON.stringify(document)), result = frame(workspace()); result.payloadBase64 = bytes.toString('base64'); Object.assign(result.read, { totalBytes: bytes.length, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), nextCursor: null }); return result; }

test('actual server frames restore raw UTF-16, retain provenance, and distinguish literal escapes', async t => {
  const data = workspace(); data.profile.firstName = 'A\ud800 العربية 🌱'; data.profile.resume.name = 'old\udfff.pdf'; data.jobs[0].title = 'Literal \\uD800'; data.recoverablePlans[0].items[0].payloadSummary.comments = 'old\ud800';
  install(t, () => response(frame(data)));
  const result = await client.phoneAPI('/api/phone/workspace', options(journal()));
  assert.deepEqual(result, data); assert.equal(client.readEvidence(result).legacyText.length, 4);
  assert.equal(client.displayHistoricalText(data.profile.firstName), 'A\\uD800 العربية 🌱');
  assert.equal(client.hasHistoricalText(data.jobs[0].title), false);
  assert.throws(() => client.checkReview(result.recoverablePlans[0], result.profile, result.jobs, []), /needs repair/);
  assert.throws(() => client.profileRequest(result.profile), /needs repair/);
  assert.equal(client.planSchema.parse(result.recoverablePlans[0]).digest, data.recoverablePlans[0].digest);
});

test('three populated historical variants assemble every row through actual bounded server frames', async t => {
  for (const variant of ['valid-unicode', 'surrogate', 'legacy-url']) await t.test(variant, async child => {
    const data = largeWorkspace(variant), outcomes = journal(), first = frame(data); let maxFrame = 0;
    const requests = install(child, path => { const value = path.startsWith('/api/phone/read?') ? nextFrame(data, path) : first; maxFrame = Math.max(maxFrame, Buffer.byteLength(JSON.stringify(value))); return response(value); });
    const result = await client.phoneAPI('/api/phone/workspace', options(outcomes));
    assert.deepEqual(result, data); assert.equal(result.jobs.length, 200); assert.equal(result.attempts.length, 500); assert.equal(result.recoverablePlans.length, 20);
    assert.ok(maxFrame <= client.MAX_READ_FRAME_BYTES); assert.equal(requests[0].path, '/api/phone/workspace'); assert.ok(requests.slice(1).every(r => r.method === 'GET' && r.path.startsWith('/api/phone/read?cursor=')));
    assert.ok(requests.every(r => r.headers.get('X-Career-Read-Version') === '2'));
    console.log(JSON.stringify({ variant, documentBytes: first.read.totalBytes, pages: requests.length, maxFrame, heapUsedAfter: process.memoryUsage().heapUsed, rssAfter: process.memoryUsage().rss, evidence: 'synthetic data with actual server frame codec and actual web transport/model' }));
  });
});

test('a failed read after one workspace POST keeps a durable acknowledgment until verified publication', async t => {
  const data = largeWorkspace(), port = new MemoryPort(), outcomes = journal(port), ack = operation('workspace'); let failFollowing = true;
  const requests = install(t, (path, request) => request.method === 'POST' ? response(frame(data, 'workspace', null, ack)) : path.startsWith('/api/phone/read?') && failFollowing ? Response.json({ ok: false, error: { code: 'snapshot_changed', message: 'Changed' } }, { status: 409 }) : response(path.startsWith('/api/phone/read?') ? nextFrame(data, path) : frame(data)));
  const previous = workspace(); let shown = previous;
  await assert.rejects(client.phoneAPI('/api/phone/workspace', { ...options(outcomes), method: 'POST', body: { expectedAccountId: accountId } }).then(value => { shown = value; }), error => error instanceof client.PhoneReadError && error.operation.kind === 'workspace' && error.code === 'snapshot_changed');
  assert.equal(shown, previous); assert.equal(requests.filter(r => r.method === 'POST').length, 1);
  assert.equal((await journal(port).capture(accountId)).length, 1);
  assert.equal((await journal(port).capture('another-account')).length, 0);
  failFollowing = false;
  const read = await client.phoneAPI('/api/phone/workspace', options(journal(port))), parsed = client.workspaceFromResponse(read);
  assert.equal((await journal(port).capture(accountId)).length, 1, 'a completed promise alone is not publication');
  await client.acknowledgeWorkspacePublication(parsed);
  assert.equal((await journal(port).capture(accountId)).length, 0);
  assert.equal(requests.filter(r => r.method === 'POST').length, 1);
});

test('cancellation after acknowledgment persists the original owner outcome and never starts another request', async t => {
  const port = new MemoryPort(), durable = journal(port), controller = new AbortController();
  const outcomes = { ...durable, async record(value, pending) { controller.abort(); await durable.record(value, pending); } };
  const requests = install(t, () => response(frame(workspace(), 'workspace', null, operation('workspace'))));
  await assert.rejects(client.phoneAPI('/api/phone/workspace', { ...options(outcomes), method: 'POST', body: { expectedAccountId: accountId }, signal: controller.signal }), error => error instanceof client.PhoneReadError && error.operation.accountId === accountId && error.code === 'read_cancelled');
  assert.equal(requests.length, 1); assert.equal((await journal(port).capture(accountId)).length, 1); assert.equal((await journal(port).capture('new-account')).length, 0);
});

test('each mutation kind retains the first acknowledged outcome when the initial read cannot be built', async t => {
  for (const kind of ['workspace', 'profile', 'jobs', 'prepare', 'submit', 'advance', 'stop']) await t.test(kind, async child => {
    const outcomes = journal(), ack = operation(kind), requests = install(child, () => response({ ok: true, read: null, operation: ack, readError: { code: 'read_unavailable', message: 'Read unavailable' } }));
    await assert.rejects(client.phoneAPI('/api/phone/' + kind, { ...options(outcomes), method: kind === 'profile' ? 'PUT' : 'POST', body: { expectedWorkspaceId: workspaceId, ...(kind === 'profile' ? { expectedRevision: 0 } : {}), ...(kind === 'submit' ? { digest: 'b'.repeat(64) } : {}), ...(['submit', 'advance', 'stop'].includes(kind) ? { planId: id(2) } : {}) } }), error => error instanceof client.PhoneReadError && error.operation.kind === kind);
    assert.equal(requests.length, 1); assert.equal((await outcomes.capture(accountId)).length, 1);
  });
});

test('publication clears only captured journal IDs, preserving a later acknowledgment', async t => {
  const outcomes = journal(); await outcomes.record(operation('prepare'));
  install(t, () => response(frame(workspace())));
  const result = client.workspaceFromResponse(await client.phoneAPI('/api/phone/workspace', options(outcomes)));
  await outcomes.record(operation('stop'));
  await client.acknowledgeWorkspacePublication(result);
  assert.equal((await outcomes.capture(accountId)).length, 1);
});

test('only a read-only GET may restart a changed snapshot once', async t => {
  const data = largeWorkspace(), fresh = structuredClone(data); fresh.jobs[0].title = 'Fresh complete snapshot'; let initial = 0;
  const requests = install(t, path => {
    if (path === '/api/phone/workspace') { initial++; return response(frame(initial === 1 ? data : fresh)); }
    if (initial === 1) return Response.json({ ok: false, error: { code: 'snapshot_changed', message: 'Changed' } }, { status: 409 });
    return response(nextFrame(fresh, path));
  });
  assert.deepEqual(await client.phoneAPI('/api/phone/workspace', options(journal())), fresh);
  assert.equal(initial, 2); assert.ok(requests.every(r => r.method === 'GET'));
});

test('wrong identity, corrupt fragments, invalid totals and unsupported sidecars never publish data', async () => {
  const before = workspace();
  const cases = [
    value => { value.read.accountId = 'another-account'; }, value => { value.read.workspaceId = id(888); }, value => { value.read.offset = 1; },
    value => { value.read.totalBytes = Number.MAX_SAFE_INTEGER + 1; }, value => { value.read.sha256 = '0'.repeat(64); }, value => { value.payloadBase64 = 'YR=='; },
    value => { value.read.byteLength--; }, value => { value.read.exportCursor = 'x'.repeat(2049); }, value => { value.read.version = 99; },
  ];
  for (const mutate of cases) {
    const value = frame(before); mutate(value); let published = before;
    await assert.rejects(client.assemblePhoneRead(value, () => { throw Error('No follow-up expected'); }, { expectedAccountId: accountId, expectedWorkspaceId: workspaceId }).then(data => { published = data; }));
    assert.equal(published, before);
  }
  const raw = workspace(); raw.profile.firstName = 'old\ud800';
  const valid = { documentVersion: 1, mode: 'view', data: structuredClone(raw), legacyText: [{ path: ['profile', 'firstName'], utf16leBase64: Buffer.from(raw.profile.firstName, 'utf16le').toString('base64') }] }; valid.data.profile.firstName = 'old\\uD800';
  for (const mutate of [
    doc => { doc.legacyText.push(doc.legacyText[0]); }, doc => { doc.legacyText[0].path = ['accountId']; }, doc => { doc.legacyText[0].path = ['profile', 'website']; },
    doc => { doc.legacyText[0].path = ['jobs', '0', 'title']; }, doc => { doc.legacyText[0].utf16leBase64 = 'AA=='; },
    doc => { doc.data.profile.firstName = 'Different'; }, doc => { doc.legacyText = []; doc.data.profile.firstName = 'old\ud800'; },
  ]) { const doc = structuredClone(valid); mutate(doc); await assert.rejects(client.assemblePhoneRead(documentFrame(doc), () => { throw Error('No follow-up expected'); })); }
});

test('oversized v2 streams are cancelled before JSON parsing and oversized documents offer complete recovery', async t => {
  let cancelled = false; install(t, () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(client.MAX_READ_FRAME_BYTES + 1)); }, cancel() { cancelled = true; } }), { headers: { ...READ_HEADERS, 'Content-Type': 'application/json' } }));
  await assert.rejects(client.phoneAPI('/api/phone/workspace'), error => error.code === 'invalid_response'); assert.equal(cancelled, true);
  const value = frame(workspace()); value.read.totalBytes = client.MAX_READ_ASSEMBLY_BYTES + 1; value.read.nextCursor = 'next';
  await assert.rejects(client.assemblePhoneRead(value, () => { throw Error('No allocation/follow-up expected'); }), error => error.code === 'read_too_large' && client.readRecoveryURL(error.recovery).startsWith('/api/phone/read-export?cursor='));
});

test('malformed object keys and malformed URLs require exact recovery without replacing the model', async () => {
  for (const change of [value => { value.profile['bad\ud800'] = 'kept'; }, value => { value.profile.website = 'https://example.com/\ud800'; }]) {
    const data = workspace(); change(data); let published = null;
    await assert.rejects(client.assemblePhoneRead(frame(data), () => { throw Error('No follow-up expected'); }).then(value => { published = value; }), error => error.code === 'raw_recovery_required' && Boolean(client.readRecoveryURL(error.recovery)));
    assert.equal(published, null);
  }
});

test('malformed new body text is blocked before fetch; malformed historical references are not shown as verified', async t => {
  const requests = install(t, () => { throw Error('No request allowed'); });
  await assert.rejects(client.phoneAPI('/api/phone/profile', { method: 'PUT', body: { profile: { firstName: 'old\ud800' } } }), error => error.code === 'legacy_text_requires_repair');
  assert.equal(requests.length, 0);
  const receipt = { id: id(3), planId: id(2), jobId: id(1), title: job.title, company: job.company, url: job.url, state: 'confirmed', applicationId: 'old\ud800', createdAt: asOf, mode: 'local', evidenceMode: 'live', error: null };
  assert.equal(client.receiptLabel(client.receiptSchema.parse(receipt)), 'Outcome needs checking');
  assert.equal(client.receiptLabel(client.receiptSchema.parse({ ...receipt, applicationId: 'intentional\ufffd' })), 'Submission confirmed');
});

test('intervening page identity, snapshot, offset and cursor changes cannot publish a mixed view', async () => {
  const data = { ...workspace(), padding: 'x'.repeat(2 * client.MAX_READ_FRAGMENT_BYTES + 64) }, first = frame(data);
  const second = nextFrame(data, '/api/phone/read?cursor=' + encodeURIComponent(first.read.nextCursor));
  for (const mutate of [
    value => { value.read.accountId = 'another-account'; }, value => { value.read.workspaceId = id(998); },
    value => { value.read.asOf = '2026-11-23T12:00:01.000Z'; value.read.expiresAt = '2026-11-23T12:05:01.000Z'; },
    value => { value.read.sha256 = '0'.repeat(64); }, value => { value.read.totalBytes++; }, value => { value.read.exportCursor += 'changed'; },
    value => { value.read.offset--; }, value => { value.read.offset++; }, value => { value.read.nextCursor = first.read.nextCursor; },
  ]) {
    const changed = structuredClone(second); mutate(changed); let calls = 0, published = null;
    await assert.rejects(client.assemblePhoneRead(first, async () => { calls++; return changed; }, { expectedAccountId: accountId, expectedWorkspaceId: workspaceId }).then(value => { published = value; }));
    assert.equal(published, null); assert.equal(calls, 1);
  }
});

test('a second changed snapshot ends the GET recovery and never retries indefinitely', async t => {
  const data = { ...workspace(), padding: 'x'.repeat(client.MAX_READ_FRAGMENT_BYTES) };
  const requests = install(t, path => path === '/api/phone/workspace' ? response(frame(data)) : Response.json({ ok: false, error: { code: 'snapshot_expired', message: 'Expired' } }, { status: 409 }));
  await assert.rejects(client.phoneAPI('/api/phone/workspace', options(journal())), error => error.code === 'snapshot_expired');
  assert.equal(requests.filter(value => value.path === '/api/phone/workspace').length, 2);
  assert.equal(requests.length, 4); assert.ok(requests.every(value => value.method === 'GET'));
});

test('cancellation during a continuation stream retains the acknowledged outcome', async t => {
  const data = { ...workspace(), padding: 'x'.repeat(client.MAX_READ_FRAGMENT_BYTES) }, controller = new AbortController(), outcomes = journal();
  const requests = install(t, (path, request) => {
    if (request.method === 'POST') return response(frame(data, 'workspace', null, operation('workspace')));
    return new Response(new ReadableStream({ start(stream) {
      stream.enqueue(new TextEncoder().encode('{'));
      request.signal.addEventListener('abort', () => stream.error(new DOMException('Cancelled', 'AbortError')), { once: true });
      queueMicrotask(() => controller.abort());
    } }), { headers: { ...READ_HEADERS, 'Content-Type': 'application/json' } });
  });
  await assert.rejects(client.phoneAPI('/api/phone/workspace', { ...options(outcomes), method: 'POST', body: { expectedAccountId: accountId }, signal: controller.signal }), error => error instanceof client.PhoneReadError && error.operation.kind === 'workspace' && error.code === 'read_cancelled');
  assert.equal(requests.length, 2); assert.equal(requests.filter(value => value.method === 'POST').length, 1); assert.equal((await outcomes.capture(accountId)).length, 1);
});

test('fully verified responses allow the authorized multi-write chain while retaining its journal', async t => {
  const outcomes = journal(), data = workspace();
  const requests = install(t, (path, request) => {
    if (path === '/api/phone/jobs') return response(frame({ ok: true, job: data.jobs[0] }, 'job', null, operation('jobs')));
    if (path === '/api/phone/prepare') return response(frame({ ok: true, plan: data.recoverablePlans[0] }, 'plan', null, operation('prepare')));
    assert.equal(request.method, 'GET'); return response(frame(data));
  });
  for (let index = 0; index < 2; index++) await client.phoneAPI('/api/phone/jobs', { ...options(outcomes), method: 'POST', body: { expectedWorkspaceId: workspaceId, url: job.url } });
  await client.phoneAPI('/api/phone/prepare', { ...options(outcomes), method: 'POST', body: { expectedWorkspaceId: workspaceId } });
  assert.equal((await outcomes.capture(accountId)).length, 3);
  const result = client.workspaceFromResponse(await client.phoneAPI('/api/phone/workspace', options(outcomes)));
  await client.acknowledgeWorkspacePublication(result);
  assert.equal((await outcomes.capture(accountId)).length, 0); assert.equal(requests.length, 4);
});

test('a preflight journal save failure prevents the mutation from being sent', async t => {
  class FailingPort extends MemoryPort { async compareAndSet() { throw Error('Synthetic storage failure'); } }
  const outcomes = journal(new FailingPort());
  const requests = install(t, () => { throw Error('No request should be sent'); });
  await assert.rejects(client.phoneAPI('/api/phone/workspace', { ...options(outcomes), method: 'POST', body: { expectedAccountId: accountId } }));
  assert.equal(requests.length, 0);
});

test('a failed ack replacement leaves the durable intent recoverable after reopening', async t => {
  class AckFailingPort extends MemoryPort {
    commits = 0;
    async compareAndSet(...args) { if (++this.commits === 2) throw Error('Synthetic acknowledgment storage failure'); return super.compareAndSet(...args); }
  }
  const port = new AckFailingPort(), outcomes = journal(port), data = { ...workspace(), padding: 'x'.repeat(client.MAX_READ_FRAGMENT_BYTES) };
  const requests = install(t, (path, request) => request.method === 'POST' ? response(frame(data, 'workspace', null, operation('workspace'))) : response(frame(workspace())));
  await assert.rejects(client.phoneAPI('/api/phone/workspace', { ...options(outcomes), method: 'POST', body: { expectedAccountId: accountId } }), error => error instanceof client.PhoneReadError && error.operation.kind === 'workspace' && error.intent.kind === 'workspace');
  assert.equal(requests.length, 1);
  const reopened = journal(port); assert.equal((await reopened.capture(accountId)).length, 1);
  const result = client.workspaceFromResponse(await client.phoneAPI('/api/phone/workspace', options(reopened)));
  await client.acknowledgeWorkspacePublication(result);
  assert.equal((await journal(port).capture(accountId)).length, 0); assert.equal(requests.filter(value => value.method === 'POST').length, 1);
});

test('a GET begun while the POST is in flight cannot clear that pending intent or its later ack', async t => {
  const outcomes = journal(), pending = await outcomes.begin({ kind: 'workspace', accountId, workspaceId: null });
  install(t, () => response(frame(workspace())));
  const beforeCommit = client.workspaceFromResponse(await client.phoneAPI('/api/phone/workspace', options(outcomes)));
  assert.equal((await outcomes.capture(accountId)).length, 0, 'in-flight intent is excluded');
  await outcomes.record(operation('workspace'), pending); outcomes.finish(pending);
  assert.equal((await outcomes.capture(accountId)).length, 1);
  await client.acknowledgeWorkspacePublication(beforeCommit);
  assert.equal((await outcomes.capture(accountId)).length, 1, 'old read cannot clear later acknowledgment');
  const afterCommit = client.workspaceFromResponse(await client.phoneAPI('/api/phone/workspace', options(outcomes)));
  await client.acknowledgeWorkspacePublication(afterCommit);
  assert.equal((await outcomes.capture(accountId)).length, 0);
});

test('a cancelled POST without an ack retains its preflight intent for GET-only recovery', async t => {
  const outcomes = journal(), controller = new AbortController();
  const requests = install(t, () => { controller.abort(); throw new DOMException('Cancelled', 'AbortError'); });
  await assert.rejects(client.phoneAPI('/api/phone/workspace', { ...options(outcomes), method: 'POST', body: { expectedAccountId: accountId }, signal: controller.signal }), error => error instanceof client.PhoneReadError && error.operation === null && error.intent.kind === 'workspace' && error.code === 'read_cancelled');
  assert.equal(requests.length, 1); assert.equal((await outcomes.capture(accountId)).length, 1);
});

test('a second journal cannot reconcile an intent held by another live browser context', async () => {
  const held = new Set(), locks = { async request(name, options, callback) {
    assert.ok(!(options.ifAvailable && options.signal), 'Browser API forbids combining ifAvailable and signal');
    if (held.has(name)) { assert.equal(options.ifAvailable, true); return callback(null); }
    held.add(name); try { return await callback({ name }); } finally { held.delete(name); }
  } };
  const port = new MemoryPort(), make = () => client.createReadOutcomeJournal(client.createPhoneVault({ port, crypto: webcrypto }), locks), first = make(), second = make();
  const pending = await first.begin({ kind: 'workspace', accountId, workspaceId: null });
  assert.equal((await second.capture(accountId)).length, 0);
  await second.published(workspace(), [{ scope: pending.scope, id: pending.id }]);
  first.finish(pending); await Promise.resolve(); await Promise.resolve();
  const captured = await second.capture(accountId); assert.equal(captured.length, 1);
  await second.published(workspace(), captured); assert.equal((await second.capture(accountId)).length, 0);
});

test('production lock fallback permits verified reads but prevents writes and pending-outcome deletion', async t => {
  const port = new MemoryPort(), vault = client.createPhoneVault({ port, crypto: webcrypto }), outcomes = client.createReadOutcomeJournal(vault, undefined, { requireLocks: true });
  const existing = journal(port); await existing.record(operation('workspace'));
  const requests = install(t, () => response(frame(workspace())));
  await assert.rejects(client.phoneAPI('/api/phone/workspace', { ...options(outcomes), method: 'POST', body: { expectedAccountId: accountId } }), error => error.code === 'read_locks_unavailable');
  assert.equal(requests.length, 0);
  const result = client.workspaceFromResponse(await client.phoneAPI('/api/phone/workspace', options(outcomes)));
  assert.equal(await client.acknowledgeWorkspacePublication(result), false);
  assert.equal((await existing.capture(accountId)).length, 1);
});

test('an unavailable coordination lock ends the preflight within its fixed deadline', async t => {
  const locks = { request(_name, options) { return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Lock timed out', 'AbortError')), { once: true })); } };
  const outcomes = client.createReadOutcomeJournal(client.createPhoneVault({ port: new MemoryPort(), crypto: webcrypto }), locks, { requireLocks: true });
  const requests = install(t, () => { throw Error('No request should be sent'); }), started = performance.now();
  await assert.rejects(client.phoneAPI('/api/phone/workspace', { ...options(outcomes), method: 'POST', body: { expectedAccountId: accountId } }), error => error.code === 'read_lock_timeout');
  assert.ok(performance.now() - started < 7000); assert.equal(requests.length, 0); assert.equal((await outcomes.capture(accountId)).length, 0);
});

test('an acknowledgment must match the requested profile revision, plan ID and approval digest before promotion', async t => {
  for (const [kind, change] of [
    ['profile', ack => { ack.revision = 2; }], ['submit', ack => { ack.planId = id(44); }],
    ['submit', ack => { ack.digest = 'c'.repeat(64); }], ['advance', ack => { ack.planId = id(44); }], ['stop', ack => { ack.planId = id(44); }],
  ]) await t.test(kind + '-' + change.toString(), async child => {
    const port = new MemoryPort(), outcomes = journal(port), ack = operation(kind); change(ack);
    const requests = install(child, () => response({ ok: true, read: null, operation: ack, readError: { code: 'read_unavailable', message: 'Synthetic unavailable view' } }));
    const body = { expectedWorkspaceId: workspaceId, ...(kind === 'profile' ? { expectedRevision: 0 } : { planId: id(2) }), ...(kind === 'submit' ? { digest: 'b'.repeat(64) } : {}) };
    await assert.rejects(client.phoneAPI('/api/phone/' + kind, { ...options(outcomes), method: kind === 'profile' ? 'PUT' : 'POST', body }), error => error instanceof client.PhoneReadError && error.operation === null && error.intent.kind === kind);
    const stored = await client.createPhoneVault({ port, crypto: webcrypto }).loadPhoneSnapshot(`account:${accountId}:${workspaceId}`);
    assert.equal(stored.pendingReadOperations.length, 1); assert.equal(stored.pendingReadOperations[0].operation, undefined); assert.equal(requests.length, 1);
  });
});

test('a valid acknowledgment with a mismatched returned object never publishes the view', async t => {
  for (const [kind, readKind, change] of [
    ['profile', 'profile', data => { data.profile.revision = 2; }], ['jobs', 'job', data => { data.job.id = id(44); }],
    ['prepare', 'plan', data => { data.plan.id = id(44); }], ['prepare', 'plan', data => { data.plan.digest = 'c'.repeat(64); }],
    ['submit', 'plan-state', data => { data.plan.id = id(44); }], ['advance', 'plan-state', data => { data.plan.digest = 'c'.repeat(64); }], ['stop', 'plan-state', data => { data.plan.id = id(44); }],
  ]) await t.test(kind + '-' + change.toString(), async child => {
    const value = workspace(), data = { ok: true, ...(kind === 'profile' ? { profile: value.profile } : kind === 'jobs' ? { job: value.jobs[0] } : { plan: value.recoverablePlans[0] }) }, outcomes = journal(); change(data);
    const requests = install(child, () => response(frame(data, readKind, null, operation(kind))));
    const body = { expectedWorkspaceId: workspaceId, ...(kind === 'profile' ? { expectedRevision: 0 } : {}), ...(['submit', 'advance', 'stop'].includes(kind) ? { planId: id(2) } : {}), ...(kind === 'submit' ? { digest: 'b'.repeat(64) } : {}) };
    let published = false;
    await assert.rejects(client.phoneAPI('/api/phone/' + kind, { ...options(outcomes), method: kind === 'profile' ? 'PUT' : 'POST', body }).then(() => { published = true; }), error => error instanceof client.PhoneReadError && error.operation.kind === kind && error.code === 'invalid_response');
    assert.equal(published, false); assert.equal((await outcomes.capture(accountId)).length, 1); assert.equal(requests.length, 1);
  });
});

test('the serialized body and its acknowledgment bindings are captured before preflight yields', async t => {
  let release; const barrier = new Promise(resolve => { release = resolve; }), durable = journal();
  const outcomes = { ...durable, async begin(intent) { await barrier; return durable.begin(intent); } };
  const body = { expectedWorkspaceId: workspaceId, expectedRevision: 0, profile: { firstName: 'Before preflight' } };
  const requests = install(t, () => response(frame({ ok: true, profile: { ...workspace().profile, firstName: 'Before preflight' } }, 'profile', null, operation('profile'))));
  const result = client.phoneAPI('/api/phone/profile', { ...options(outcomes), method: 'PUT', body });
  body.expectedRevision = 7; body.profile.firstName = 'Changed while waiting'; release();
  await result;
  assert.deepEqual(JSON.parse(requests[0].body), { expectedWorkspaceId: workspaceId, expectedRevision: 0, profile: { firstName: 'Before preflight' } });
  assert.equal(requests.length, 1);
});

test('a pre-cancelled mutation creates neither an intent nor an HTTP request', async t => {
  const controller = new AbortController(); controller.abort(); let began = 0;
  const outcomes = { ...journal(), async begin() { began++; throw Error('No preflight expected'); } };
  const requests = install(t, () => { throw Error('No request expected'); });
  await assert.rejects(client.phoneAPI('/api/phone/workspace', { ...options(outcomes), method: 'POST', body: { expectedAccountId: accountId }, signal: controller.signal }), error => error.name === 'AbortError');
  assert.equal(began, 0); assert.equal(requests.length, 0);
});
