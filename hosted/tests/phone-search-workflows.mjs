import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { setImmediate as yieldEventLoop } from 'node:timers/promises';
import * as sourceIdentity from '../shared/discovery-source-identity.mjs';

const require = createRequire(import.meta.url);
const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function execute(source, scope = {}, loader = require) {
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const context = { exports: {}, require: loader, Error, URL, URLSearchParams, Intl, ...scope };
  vm.runInNewContext(code, context);
  return context.exports;
}
const { APIError } = execute(read('app/components/api.ts'));
const historicalHelpers = execute(read('app/phone/historical-text.ts'));
const readTransport = execute(read('app/phone/read-transport.ts'), {}, name => name === '../components/api' ? { APIError } : name === './historical-text' ? historicalHelpers : require(name));
const model = execute(read('app/phone/model.ts'), {}, name => name === './historical-text' ? historicalHelpers : name === './read-transport' ? readTransport : require(name));
const searchHistory = execute(read('app/phone/search-history.ts'), {}, name => name === '../../shared/discovery-source-identity.mjs' ? sourceIdentity : require(name));
const records = execute(read('app/phone/record-tools.ts'), {}, name => name === './model' ? model : require(name));
const savedComparison = execute(read('app/phone/saved-comparison.ts'), {}, name => name === './model' ? model : require(name));
const catalog = JSON.parse(read('app/i18n/messages.ar.json'));
const i18n = execute(read('app/i18n/core.ts'), {}, name => name === './messages.ar.json' ? catalog : require(name));
const source = read('app/phone/PhoneApp.tsx');
const tree = ts.createSourceFile('PhoneApp.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'PhoneApp');
assert(component?.body);
function declaration(name) {
  for (const node of [...tree.statements, ...component.body.statements]) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node.getText(tree);
    if (ts.isVariableStatement(node)) {
      const entry = node.declarationList.declarations.find(value => value.name.getText(tree) === name);
      if (entry?.initializer) return entry.initializer.getText(tree);
    }
  }
  assert.fail(`Actual production declaration ${name} is required`);
}
function install(name, scope) {
  const value = name === 'searchJobs'
    // Match a React handler's render-time closure. The later draft edit must
    // reach a pending request through the real ref, not a mutable VM global.
    ? `((filters, searchSources, searchedFilters, searchPage, restored, searchNewResult, showNewOnly) => (${declaration(name)}))(filters, searchSources, searchedFilters, searchPage, restored, searchNewResult, showNewOnly)`
    : declaration(name);
  const code = ts.transpileModule(`globalThis.${name} = ${value};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  vm.runInContext(code, scope);
}
const stamp = '2026-11-17T15:00:00.000Z';
const submitted = () => ({ query: 'Engineer العربية', location: 'Riyadh', remoteOnly: false, sources: ['lever:synthetic-a'] });
const draft = () => ({ query: 'Designer draft', location: 'Jeddah', remoteOnly: true, sources: ['lever:synthetic-b'] });
const laterDraft = () => ({ query: 'Healthcare typed while waiting', location: 'الدمام', remoteOnly: false, sources: ['lever:synthetic-c'] });
function job(index) {
  return { id: `synthetic-${index}`, title: `Synthetic opportunity ${index}`, company: 'Synthetic board',
    url: `https://example.org/career-finder-search/${index}`, location: 'Riyadh', country: 'SA',
    remote: false, summary: 'Synthetic test data only', checkedAt: stamp, stale: false, sourceName: 'Synthetic board' };
}
function page({ status = 'complete', jobs = [job(9)], sourceStatus = 'fresh', error = null, nextCursor = null, limited = false, sourceLimited = false } = {}) {
  return { ok: true, version: 1, generatedAt: stamp, status, jobs,
    sources: [{ id: 'lever:synthetic-a', name: 'Synthetic board', provider: 'lever', boardUrl: 'https://jobs.lever.co/synthetic-a',
      status: sourceStatus, checkedAt: sourceStatus === 'unavailable' ? null : stamp,
      availableCount: jobs.length, matchedCount: jobs.length, limited: sourceLimited, error }],
    nextCursor, totalMatches: jobs.length, limited, notice: 'Selected synthetic boards only.' };
}

// Execute the real search, run, identity, local-data and persistence handlers.
// Only the transport and encrypted-storage ports are synthetic; any unexpected
// route or attempted network request fails immediately.
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function harness({ initialPage, initialHistory, initialNewResult = null, restored = false, searchedFilters = submitted(), savedFilters = draft(), initialFilters = draft(), scope = 'account:synthetic-search-owner:00000000-0000-4000-8000-000000000001' } = {}) {
  const snapshot = model.blankSnapshot(scope);
  snapshot.profile.firstName = 'SYNTHETIC_PRIVATE_PROFILE';
  snapshot.jobs = [model.jobSchema.parse(job(0))];
  snapshot.records = [{ ...model.blankRecord(snapshot.jobs[0]), note: 'SYNTHETIC_PRIVATE_NOTE' }];
  snapshot.filters = plain(savedFilters);
  const displayedPage = initialPage ?? page({ status: 'partial', jobs: [job(0)], sourceStatus: 'stale', error: { code: 'source_unavailable', message: 'Synthetic source unavailable.' }, nextCursor: 'synthetic-next-page' });
  snapshot.lastSearch = searchedFilters ? { filters: plain(searchedFilters), page: { ...plain(displayedPage), nextCursor: null } } : null;
  if (initialHistory) snapshot.searchHistory = plain(initialHistory);
  if (initialNewResult && snapshot.lastSearch) snapshot.lastSearch.newResult = plain(initialNewResult);
  const calls = [], writes = [], writeAttempts = [], writeHook = { current: null };
  let stored = JSON.stringify(snapshot);
  const context = {
    ...historicalHelpers, PhoneReadError: readTransport.PhoneReadError, Error, URL, URLSearchParams, Intl, DOMException, AbortController, APIError, z: require('zod').z,
    filters: plain(initialFilters), searchedFilters, searchPage: displayedPage,
    restored, busy: '', busyRef: { current: false }, notice: null, epoch: { current: 3 },
    identityUnverified: { current: false }, identityCheckPending: { current: false }, identityCheckRef: { current() {} },
    snapshotRef: { current: snapshot }, filterDraftRef: { current: plain(initialFilters) }, searchAbort: { current: null }, storageProblem: '', locked: false, checkingIdentity: false,
    discoveryPageSchema: model.discoveryPageSchema, discoveryPath: model.discoveryPath, jobIdentity: model.jobIdentity,
    parseSnapshot: model.parseSnapshot, ...searchHistory, searchNewResult: initialNewResult, showNewOnly: false, showNewOnlyRef: { current: false },
    fetch() { assert.fail('Search workflow tests must never contact a network'); },
    setBusy(value) { context.busy = value; }, setNotice(value) { context.notice = value; },
    setSearchPage(value) { context.searchPage = value; }, setSearchedFilters(value) { context.searchedFilters = value; },
    setRestored(value) { context.restored = value; },
    setSearchNewResult(value) { context.searchNewResult = value; }, setShowNewOnlyState(value) { context.showNewOnly = value; },
    setFiltersState(value) { context.filters = value; },
    putSnapshot(value) { context.snapshotRef.current = value; },
    async savePhoneSnapshot(owner, value) {
      const attempted = { scope: owner, value: plain(value) }; writeAttempts.push(attempted);
      assert.equal(owner, scope, 'A search draft must never be written to another owner scope');
      await writeHook.current?.(attempted, writeAttempts.length);
      writes.push(attempted.value); stored = JSON.stringify(attempted.value);
    },
    storageFailure(error) { throw error; },
    lock() { context.locked = true; context.epoch.current++; },
    phoneAPI(path, options = {}) {
      const url = new URL(path, 'https://synthetic.local');
      assert.equal(url.pathname, '/api/discovery/search');
      assert.equal(options.method, undefined); assert.equal(options.body, undefined);
      assert(!path.includes('SYNTHETIC_PRIVATE_PROFILE'));
      assert(!path.includes('SYNTHETIC_PRIVATE_NOTE'));
      // Match the real HTTP adapter: a pre-aborted signal never admits a fetch.
      if (options.signal?.aborted) return Promise.reject(new DOMException('Synthetic cancellation', 'AbortError'));
      return new Promise((resolve, reject) => {
        const abort = () => reject(new DOMException('Synthetic cancellation', 'AbortError'));
        options.signal?.addEventListener('abort', abort, { once: true });
        calls.push({ path, signal: options.signal,
          resolve(value) { options.signal?.removeEventListener('abort', abort); resolve(value); },
          reject(error) { options.signal?.removeEventListener('abort', abort); reject(error); } });
      });
    },
  };
  Object.defineProperty(context, 'searchSources', { get: () => context.filters.sources });
  vm.createContext(context);
  for (const name of ['same', 'message', 'setFilters', 'setShowNewOnly', 'assertCurrent', 'local', 'persist', 'run', 'searchJobs']) install(name, context);
  return { context, calls, writes, writeAttempts, writeHook, scope,
    readSaved() { return plain(model.parseSnapshot(JSON.parse(stored), scope)); },
    edit(value) { context.setFilters(plain(value)); },
    search(mode) { install('searchJobs', context); return context.searchJobs(mode); },
    async admitted(index = 0) {
      // Flush settled preflight promises without imposing a made-up transport delay.
      await yieldEventLoop(); assert(calls[index], `Expected synthetic request ${index} to be admitted`); return calls[index];
    },
  };
}
function requestFilters(call) {
  const params = new URL(call.path, 'https://synthetic.local').searchParams;
  return { query: params.get('q'), location: params.get('location'), remoteOnly: params.get('remote') === 'remote', sources: params.getAll('source') };
}

test('retry repeats the displayed search without a cursor and preserves newer visible draft filters', async () => {
  const h = harness(), previous = h.context.searchPage, original = submitted();
  const pending = h.search('retry');
  await h.admitted();
  assert.equal(h.calls.length, 1); assert.deepEqual(requestFilters(h.calls[0]), original);
  assert.equal(new URL(h.calls[0].path, 'https://synthetic.local').searchParams.has('cursor'), false);
  assert.equal(h.context.searchPage, previous); assert.deepEqual(plain(h.context.filters), draft());
  assert.equal(h.writes.length, 0);
  h.edit(laterDraft()); h.calls[0].resolve(page()); await pending;
  assert.deepEqual(plain(h.context.filters), laterDraft());
  assert.deepEqual(plain(h.context.searchedFilters), original);
  assert.equal(h.context.searchPage.jobs[0].id, 'synthetic-9');
  assert.equal(h.context.searchAbort.current, null); assert.equal(h.context.busyRef.current, false);
  assert.equal(h.writes.length, 1);
  assert.deepEqual(h.writes[0].filters, laterDraft(), 'reload must restore the current draft, not the retried filters');
  assert.deepEqual(h.writes[0].lastSearch.filters, original);
  assert.equal(h.writes[0].lastSearch.page.nextCursor, null);
  assert.equal(h.writes[0].profile.firstName, 'SYNTHETIC_PRIVATE_PROFILE');
});

test('a fresh search response does not overwrite text or boards edited while it is pending', async () => {
  const h = harness(), pending = h.search();
  await h.admitted();
  assert.deepEqual(requestFilters(h.calls[0]), draft());
  h.edit(laterDraft()); h.calls[0].resolve(page()); await pending;
  assert.deepEqual(plain(h.context.filters), laterDraft());
  assert.deepEqual(plain(h.context.searchedFilters), draft());
  assert.deepEqual(h.writes[0].filters, laterDraft());
  assert.deepEqual(h.writes[0].lastSearch.filters, draft());
});

test('pagination uses the displayed search and cursor, merges identities, and leaves draft filters alone', async () => {
  const initialPage = page({ jobs: [job(0), job(1)], nextCursor: 'synthetic-next-page' });
  const h = harness({ initialPage }), pending = h.search('more');
  await h.admitted();
  assert.deepEqual(requestFilters(h.calls[0]), submitted());
  assert.equal(new URL(h.calls[0].path, 'https://synthetic.local').searchParams.get('cursor'), 'synthetic-next-page');
  h.edit(laterDraft());
  h.calls[0].resolve(page({ jobs: [{ ...job(1), title: 'Updated synthetic opportunity' }, job(2)] })); await pending;
  assert.deepEqual(plain(h.context.filters), laterDraft());
  assert.deepEqual(Array.from(h.context.searchPage.jobs, value => value.id), ['synthetic-0', 'synthetic-1', 'synthetic-2']);
  assert.equal(h.context.searchPage.jobs[1].title, 'Updated synthetic opportunity');
  assert.deepEqual(h.writes[0].filters, laterDraft());
  assert.deepEqual(h.writes[0].lastSearch.filters, submitted());
});

test('failed and cancelled retries retain results, submitted metadata and visible edits, then release the controller', async t => {
  for (const outcome of ['failure', 'cancel']) await t.test(outcome, async () => {
    const h = harness(), previous = h.context.searchPage, priorFilters = h.context.searchedFilters;
    const earlierSaved = h.readSaved(), pending = h.search('retry'); await h.admitted(); h.edit(laterDraft());
    if (outcome === 'cancel') h.context.searchAbort.current.abort();
    else h.calls[0].reject(new APIError('Synthetic service unavailable', 503, 'source_unavailable'));
    await pending;
    assert.equal(h.context.searchPage, previous); assert.equal(h.context.searchedFilters, priorFilters);
    assert.deepEqual(plain(h.context.filters), laterDraft()); assert.equal(h.writes.length, 1);
    assert.deepEqual(h.readSaved(), { ...earlierSaved, filters: laterDraft() }, 'Only the latest visible draft changes; earlier results and private records survive reload');
    assert.equal(h.context.searchAbort.current, null); assert.equal(h.context.busyRef.current, false);
    assert.match(h.context.notice.text, outcome === 'cancel' ? /Search cancelled/ : /Synthetic service unavailable/);
  });
});

test('late search results cannot cross the existing identity or generation boundary', async t => {
  for (const boundary of ['identity', 'generation']) await t.test(boundary, async () => {
    const h = harness(), previous = h.context.searchPage, priorFilters = h.context.searchedFilters;
    const pending = h.search('retry');
    await h.admitted();
    if (boundary === 'identity') h.context.identityUnverified.current = true; else h.context.epoch.current++;
    h.calls[0].resolve(page()); await pending;
    assert.equal(h.context.searchPage, previous); assert.equal(h.context.searchedFilters, priorFilters);
    assert.deepEqual(plain(h.context.filters), draft()); assert.equal(h.writes.length, 0);
    assert.equal(h.context.searchAbort.current, null); assert.equal(h.context.notice.error, true);
    assert.match(h.context.notice.text, boundary === 'identity' ? /account needs to be confirmed/ : /page changed/);
  });
});

test('pagination retains the 200-result cap and retry refreshes restored results without a stale cursor', async () => {
  const many = page({ jobs: Array.from({ length: 199 }, (_, index) => job(index)), nextCursor: 'page-limit' });
  const capped = harness({ initialPage: many }), before = capped.readSaved(), priorFilters = capped.context.searchedFilters;
  const capPending = capped.search('more');
  await capped.admitted();
  capped.edit(laterDraft());
  assert.deepEqual(capped.readSaved(), before, 'Pending edits are not a committed reload snapshot yet');
  capped.calls[0].resolve(page({ jobs: [job(199), job(200)] })); await capPending;
  assert.equal(capped.context.searchPage, many); assert.equal(capped.context.searchedFilters, priorFilters);
  assert.match(capped.context.notice.text, /200 results/); assert.deepEqual(plain(capped.context.filters), laterDraft());
  assert.deepEqual(capped.readSaved(), { ...before, filters: laterDraft() }, 'The cap preserves the latest draft on reload without changing earlier results or private data');
  assert.equal(capped.writeAttempts.length, 1); assert.equal(capped.writes.length, 1);
  assert.equal(capped.context.searchAbort.current, null); assert.equal(capped.context.busyRef.current, false);
  const restored = harness({ restored: true }); await restored.search('more');
  assert.equal(restored.calls.length, 0); assert.equal(restored.context.restored, true);
  const retry = restored.search('retry');
  await restored.admitted();
  assert.equal(new URL(restored.calls[0].path, 'https://synthetic.local').searchParams.has('cursor'), false);
  restored.calls[0].resolve(page()); await retry; assert.equal(restored.context.restored, false);
});

test('the attempted draft is durable before a failed fresh Search, with earlier results and private data unchanged on reload', async () => {
  const h = harness({ savedFilters: submitted() }), before = h.readSaved(), previousPage = h.context.searchPage;
  const saving = deferred(), release = deferred();
  h.writeHook.current = async () => { saving.resolve(); await release.promise; };
  const pending = h.search(); await saving.promise;
  assert.equal(h.calls.length, 0, 'Discovery must wait for the attempted draft to finish saving');
  assert.deepEqual(h.readSaved(), before, 'An unfinished storage write is not a committed reload snapshot');
  assert.equal(h.context.busyRef.current, true);
  release.resolve(); const request = await h.admitted();
  assert.deepEqual(requestFilters(request), draft());
  assert.deepEqual(h.readSaved(), { ...before, filters: draft() });
  request.reject(new APIError('Synthetic offline response', 0, 'network_unavailable')); await pending;
  assert.deepEqual(h.readSaved(), { ...before, filters: draft() }, 'Restart restores the attempted draft, not the old successful query');
  assert.equal(h.context.searchPage, previousPage); assert.deepEqual(plain(h.context.searchedFilters), submitted());
  assert.equal(h.writeAttempts.length, 1); assert.equal(h.writes.length, 1, 'Unchanged failure state must not be written twice');
  assert.equal(h.context.notice.error, true); assert.match(h.context.notice.text, /Synthetic offline response/);
  assert.equal(h.context.searchAbort.current, null); assert.equal(h.context.busyRef.current, false);
});

test('successful Search preserves the preflight draft and then the newer visible draft without changing its submitted query', async () => {
  const h = harness({ savedFilters: submitted() }), before = h.readSaved(), pending = h.search();
  const request = await h.admitted();
  assert.equal(h.writes.length, 1); assert.deepEqual(h.writes[0], { ...before, filters: draft() });
  h.edit(laterDraft()); request.resolve(page()); await pending;
  assert.equal(h.writes.length, 2);
  assert.deepEqual(h.readSaved().filters, laterDraft()); assert.deepEqual(h.readSaved().lastSearch.filters, draft());
  assert.equal(h.readSaved().lastSearch.page.jobs[0].id, 'synthetic-9');
  for (const field of ['profile', 'profileDirty', 'jobs', 'records']) assert.deepEqual(h.readSaved()[field], before[field]);
});

test('Retry and More save the visible draft but continue the earlier submitted query and paging contract', async t => {
  for (const mode of ['retry', 'more']) await t.test(mode, async () => {
    const h = harness({ savedFilters: submitted() }), before = h.readSaved(), pending = h.search(mode);
    const request = await h.admitted();
    assert.deepEqual(h.readSaved(), { ...before, filters: draft() });
    assert.deepEqual(requestFilters(request), submitted());
    const cursor = new URL(request.path, 'https://synthetic.local').searchParams.get('cursor');
    assert.equal(cursor, mode === 'more' ? 'synthetic-next-page' : null);
    h.edit(laterDraft()); request.resolve(page()); await pending;
    assert.equal(h.writeAttempts.length, 2); assert.equal(h.writes.length, 2);
    assert.deepEqual(h.readSaved().filters, laterDraft()); assert.deepEqual(h.readSaved().lastSearch.filters, submitted());
    assert.equal(h.readSaved().lastSearch.page.nextCursor, null);
  });
});

test('Cancel during a deferred preflight save admits no fetch and retains the latest edits before returning', async () => {
  const h = harness({ savedFilters: submitted() }), before = h.readSaved(), previousPage = h.context.searchPage;
  const saving = deferred(), release = deferred();
  h.writeHook.current = async () => { saving.resolve(); await release.promise; };
  const pending = h.search(); await saving.promise;
  h.edit(laterDraft()); h.context.searchAbort.current.abort();
  assert.equal(h.calls.length, 0); release.resolve(); await pending;
  assert.equal(h.calls.length, 0, 'The real adapter rejects pre-aborted signals before admitting a fetch');
  assert.equal(h.writeAttempts.length, 2); assert.equal(h.writes.length, 2);
  assert.deepEqual(h.readSaved(), { ...before, filters: laterDraft() });
  assert.equal(h.context.searchPage, previousPage); assert.deepEqual(plain(h.context.searchedFilters), submitted());
  assert.match(h.context.notice.text, /Search cancelled/);
  assert.equal(h.context.searchAbort.current, null); assert.equal(h.context.busyRef.current, false);
});

function changeBoundary(h, boundary) {
  if (boundary === 'identity') h.context.identityUnverified.current = true;
  else if (boundary === 'generation') h.context.epoch.current++;
  else h.context.snapshotRef.current = model.blankSnapshot('account:another-synthetic-owner:00000000-0000-4000-8000-000000000002');
}

test('an identity, generation or scope change during a preflight write cannot admit transport or adopt the old snapshot', async t => {
  for (const boundary of ['identity', 'generation', 'scope']) await t.test(boundary, async () => {
    const h = harness({ savedFilters: submitted() }), saving = deferred(), release = deferred();
    const before = h.readSaved(); h.writeHook.current = async () => { saving.resolve(); await release.promise; };
    const pending = h.search(); await saving.promise; changeBoundary(h, boundary);
    const currentSnapshot = h.context.snapshotRef.current;
    release.resolve(); await pending;
    assert.equal(h.calls.length, 0); assert.equal(h.writeAttempts.length, 1); assert.equal(h.writes.length, 1);
    assert.equal(h.writeAttempts[0].scope, h.scope, 'The already-started write belongs only to the original verified owner');
    assert.deepEqual(h.readSaved(), { ...before, filters: draft() });
    assert.equal(h.context.snapshotRef.current, currentSnapshot, 'A late storage completion cannot replace the current page snapshot');
    assert.equal(h.context.notice.error, true); assert.equal(h.context.busyRef.current, false);
    assert.equal(h.context.searchAbort.current, null);
  });
});

test('a failed transport never saves newer edits after identity, generation or scope changes', async t => {
  for (const boundary of ['identity', 'generation', 'scope']) await t.test(boundary, async () => {
    const h = harness(), before = h.readSaved(), previousPage = h.context.searchPage, pending = h.search('retry');
    const request = await h.admitted(); h.edit(laterDraft()); changeBoundary(h, boundary);
    request.reject(new APIError('Synthetic late transport failure', 503, 'source_unavailable')); await pending;
    assert.equal(h.writeAttempts.length, 0); assert.equal(h.writes.length, 0); assert.deepEqual(h.readSaved(), before);
    assert.equal(h.context.searchPage, previousPage); assert.deepEqual(plain(h.context.filters), laterDraft());
    assert.equal(h.context.notice.error, true); assert.equal(h.context.searchAbort.current, null);
  });
});

test('auth and owner-change errors preserve only the valid preflight write and never save later edits', async t => {
  for (const [status, code] of [[401, 'invalid_session'], [409, 'account_changed'], [409, 'workspace_changed'], [403, 'sign_in_required']]) await t.test(code, async () => {
    const h = harness({ savedFilters: submitted() }), before = h.readSaved(), pending = h.search();
    const request = await h.admitted(); h.edit(laterDraft());
    request.reject(new APIError('Synthetic owner changed', status, code)); await pending;
    assert.equal(h.context.locked, true); assert.equal(h.writeAttempts.length, 1); assert.equal(h.writes.length, 1);
    assert.deepEqual(h.readSaved(), { ...before, filters: draft() });
    assert.equal(h.context.searchAbort.current, null); assert.equal(h.context.busyRef.current, false);
  });
});

test('preflight, successful-result and failure-draft storage errors are surfaced once without retrying a write', async t => {
  for (const phase of ['preflight', 'successful-result', 'failure-draft']) await t.test(phase, async () => {
    const h = harness({ savedFilters: phase === 'preflight' ? submitted() : draft() }), before = h.readSaved(), previousPage = h.context.searchPage;
    h.writeHook.current = async () => { throw Error('Synthetic storage quota rejected this write'); };
    const pending = h.search();
    if (phase !== 'preflight') {
      const request = await h.admitted(); h.edit(laterDraft());
      if (phase === 'successful-result') request.resolve(page());
      else request.reject(new APIError('Synthetic network failure', 0, 'network_unavailable'));
    }
    await pending;
    assert.equal(h.writeAttempts.length, 1); assert.equal(h.writes.length, 0); assert.deepEqual(h.readSaved(), before);
    assert.equal(h.calls.length, phase === 'preflight' ? 0 : 1);
    if (phase !== 'successful-result') assert.equal(h.context.searchPage, previousPage);
    else assert.equal(h.context.searchPage.jobs[0].id, 'synthetic-9', 'A successful public response remains visible even when its local copy cannot be saved');
    assert.equal(h.context.notice.error, true); assert.match(h.context.notice.text, /Synthetic storage quota/);
    assert.equal(h.context.searchAbort.current, null); assert.equal(h.context.busyRef.current, false);
  });
});

test('an already known storage problem still permits public search without attempting a private draft write', async () => {
  const h = harness({ savedFilters: submitted() }), before = h.readSaved();
  h.context.storageProblem = 'Synthetic storage is unavailable';
  const pending = h.search(), request = await h.admitted(); request.resolve(page()); await pending;
  assert.equal(h.calls.length, 1); assert.equal(h.writeAttempts.length, 0); assert.deepEqual(h.readSaved(), before);
  assert.equal(h.context.searchPage.jobs[0].id, 'synthetic-9'); assert.deepEqual(plain(h.context.filters), draft());
});

let resultsNode, liveStatusNode;
function findResults(node) {
  if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(prop =>
    ts.isJsxAttribute(prop) && prop.name.text === 'className' && prop.initializer && ts.isStringLiteral(prop.initializer) && prop.initializer.text === 'phone-results')) resultsNode = node;
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'p'
    && node.getText(tree).includes('"{0} jobs shown. {1}"')) {
    assert(!liveStatusNode, 'Expected one actual search announcement');
    liveStatusNode = node;
  }
  ts.forEachChild(node, findResults);
}
findResults(tree); assert(resultsNode, 'The actual results subtree is required');
assert(liveStatusNode, 'The actual search live region is required');
function renderSearchSurface(node, searchPage, language, overrides = {}) {
  const calls = [], t = (key, values) => i18n.translate(key, language, values);
  const scope = { searchPage, searchedFilters: submitted(), filters: draft(), searchSources: draft().sources,
    restored: false, busy: '', loading: false, locked: false, checkingIdentity: false, jobs: [], cannotSave: false,
    searchResultsHeading: { current: null },
    searchNewResult: null, showNewOnly: false, setShowNewOnly() { assert.fail('A toggle must supply its local setter in the test'); },
    language, t, formatNumber: i18n.formatNumber, displayTime: value => i18n.formatDateTime(value, language),
    same: (a, b) => JSON.stringify(a) === JSON.stringify(b), jobIdentity: model.jobIdentity,
    JobCard: ({ job, newToSearch }) => React.createElement('article', { 'data-synthetic-job': job.id, 'data-new-to-search': newToSearch ? 'true' : undefined }, job.title),
    searchJobs: mode => { calls.push(mode); }, saveJob() {}, setDialog() {}, ...overrides };
  const top = ['discoveryCoverageNotice', 'discoveryLimitNotice'].map(name => `const ${name} = ${declaration(name)};`).join('\n');
  const newness = ['newSearchIDs', 'shownSearchJobs', 'newSearchCount', 'hasSearchComparison'].map(name => `const ${name} = ${declaration(name)};`).join('\n');
  const { Results } = execute(`${top}\n${newness}\n${declaration('discoveryNoticeText')}\n${declaration('DiscoveryEmptyState')}\nconst incompleteSearch = ${declaration('incompleteSearch')};\nconst localResultLimitReached = ${declaration('localResultLimitReached')};\nconst searchSummary = ${declaration('searchSummary')};\nexports.Results = () => (${node.getText(tree)});`, {
    ...scope, useI18n: () => ({ t, language }),
  });
  const element = Results();
  return { element, html: renderToStaticMarkup(element), calls, t };
}
const renderResults = (searchPage, language, overrides) => renderSearchSurface(resultsNode, searchPage, language, overrides);
const renderLiveStatus = (searchPage, language, overrides) => renderSearchSurface(liveStatusNode, searchPage, language, overrides);
function findButtons(element, text, found = []) {
  if (!React.isValidElement(element)) return found;
  if (typeof element.type === 'function') return findButtons(element.type(element.props), text, found);
  if (element.type === 'button' && element.props.children === text) found.push(element);
  React.Children.forEach(element.props.children, child => findButtons(child, text, found));
  return found;
}

test('actual nonempty partial and stale results show a localized retry that targets the displayed search', () => {
  for (const language of ['en', 'ar']) for (const value of [
    page({ status: 'partial', error: { code: 'source_incomplete', message: 'Synthetic incomplete source.' } }),
    page({ status: 'complete', sourceStatus: 'stale' }),
  ]) {
    const r = renderResults(value, language);
    assert(r.html.includes(r.t('This search is incomplete. Review the source details, or retry the same search.')));
    assert.match(r.html, /role="status"/); assert.match(r.html, /data-synthetic-job="synthetic-9"/);
    const buttons = findButtons(r.element, r.t('Retry this search')); assert.equal(buttons.length, 1);
    assert.equal(buttons[0].props.disabled, false); buttons[0].props.onClick(); assert.deepEqual(r.calls, ['retry']);
    if (value.sources[0].status === 'stale') assert(r.html.includes(r.t('Showing an earlier check of this board.')));
    if (language === 'ar') assert.notEqual(r.t('Retry this search'), 'Retry this search');
  }
});

test('actual empty unavailable results distinguish missing evidence from a completed zero-match search in both languages', () => {
  for (const language of ['en', 'ar']) {
    const unavailable = renderResults(page({ status: 'unavailable', jobs: [], sourceStatus: 'unavailable' }), language);
    assert(unavailable.html.includes(unavailable.t('Current openings could not be checked.')));
    assert(!unavailable.html.includes(unavailable.t('No matching jobs in these boards.')));
    assert.equal(findButtons(unavailable.element, unavailable.t('Retry this search')).length, 1);
    const complete = renderResults(page({ jobs: [] }), language);
    assert(complete.html.includes(complete.t('No matching jobs in these boards.')));
    assert(!complete.html.includes(complete.t('Current openings could not be checked.')));
    assert.equal(findButtons(complete.element, complete.t('Retry this search')).length, 0);
    if (language === 'ar') assert.notEqual(unavailable.t('Current openings could not be checked.'), 'Current openings could not be checked.');
  }
});

test('actual retry control stays disabled during work or identity checks and is absent without a submitted search', () => {
  const partial = page({ status: 'partial' });
  for (const values of [{ busy: 'Searching employer boards' }, { loading: true }, { locked: true }, { checkingIdentity: true }]) {
    const r = renderResults(partial, 'en', values), buttons = findButtons(r.element, 'Retry this search');
    assert.equal(buttons.length, 1); assert.equal(buttons[0].props.disabled, true);
  }
  const missing = renderResults(partial, 'en', { searchedFilters: null });
  assert.equal(findButtons(missing.element, 'Retry this search').length, 0);
});

test('empty discovery output distinguishes unavailable, incomplete and healthy empty results in both languages', () => {
  for (const language of ['en', 'ar']) {
    const t = key => i18n.translate(key, language);
    const { Empty } = execute(`${declaration('DiscoveryEmptyState')}\nexports.Empty = DiscoveryEmptyState;`, {
      useI18n: () => ({ t, language }),
    });
    for (const [status, headline] of [
      ['unavailable', 'Current openings could not be checked.'],
      ['partial', 'No matches in the results we could check.'],
      ['complete', 'No matching jobs in these boards.'],
    ]) {
      const html = renderToStaticMarkup(React.createElement(Empty, { status, busy: false, onRetry() {} }));
      assert(html.includes(`<h2>${t(headline)}</h2>`));
      assert.equal(html.includes('<button'), status !== 'complete');
      if (status !== 'complete') assert(!html.includes(t('No matching jobs in these boards.')));
      if (status === 'partial') assert(html.includes(t('This search is incomplete. Review the source details, or retry the same search.')));
      if (language === 'ar') assert(!/[A-Za-z]/.test(html.replace(/<[^>]*>/g, '').replaceAll('LinkedIn', '')));
      if (status !== 'complete') {
        const busy = renderToStaticMarkup(React.createElement(Empty, { status, busy: true, onRetry() {} }));
        assert.match(busy, /<button[^>]*disabled=""/);
      }
    }
  }
});

test('due shortcut reveals the promised record after an unrelated Saved search', () => {
  let onFollowups;
  function findFollowups(node) {
    if (ts.isJsxOpeningElement(node)) {
      const attrs = new Map(node.attributes.properties.filter(ts.isJsxAttribute).map(attr => [attr.name.getText(tree), attr.initializer]));
      if (attrs.get('className')?.text?.includes('phone-followup-link')) onFollowups = attrs.get('onClick').expression.getText(tree);
    }
    ts.forEachChild(node, findFollowups);
  }
  findFollowups(tree); assert(onFollowups, 'The actual due shortcut handler is required');
  const savedJob = { id: 'synthetic-due', title: 'Designer', company: 'Synthetic Employer', location: 'Riyadh', country: 'SA', url: 'https://employer.example/role/1' };
  const snapshot = { ...model.blankSnapshot('guest'), jobs: [savedJob], records: [{ ...model.blankRecord(savedJob), followUpDate: '2020-01-01', note: 'Call the recruiter' }] };
  const state = { savedQuery: 'portfolio', savedFilter: 'all', savedStage: 'closed', tab: 'search' };
  const select = () => execute(['jobs', 'records', 'recordsByID', 'recordJobs', 'shownJobs'].map(name => `const ${name} = ${declaration(name)};`).join('\n') + '\nexports.rows = shownJobs;', {
    snapshot, ...state, jobIdentity: model.jobIdentity, jobFromRecord: savedComparison.jobFromRecord, matchesSavedList: records.matchesSavedList,
  }).rows;
  assert.equal(select().length, 0);
  const before = JSON.stringify(snapshot);
  execute(`(${onFollowups})();`, {
    setSavedQuery: value => { state.savedQuery = value; }, setSavedFilter: value => { state.savedFilter = value; }, setSavedStage: value => { state.savedStage = value; }, navigate: value => { state.tab = value; },
  });
  assert.deepEqual(state, { savedQuery: '', savedFilter: 'followups', savedStage: 'all', tab: 'saved' });
  assert.equal(select().length, 1); assert.equal(select()[0].url, savedJob.url);
  assert.equal(JSON.stringify(snapshot), before, 'navigation must not edit private records');
  state.savedQuery = 'recruiter'; assert.equal(select().length, 1);
  state.savedQuery = 'portfolio'; assert.equal(select().length, 0, 'ordinary Saved search remains active');
});

test('retry reuses the submitted filters and boards even when unsubmitted form edits differ', async () => {
  const h = harness(), original = plain(h.context.filters), pending = h.search('retry');
  await h.admitted();
  assert.deepEqual(requestFilters(h.calls[0]), submitted());
  h.calls[0].resolve(page()); await pending;
  assert.deepEqual(plain(h.context.filters), original);
  assert.deepEqual(h.writes[0].filters, original);
  assert.deepEqual(h.writes[0].lastSearch.filters, submitted());
  assert.equal(original.location, 'Jeddah', 'the original draft was not mutated');
});

test('fresh but limited results explain incomplete coverage without inventing a source outage', () => {
  for (const language of ['en', 'ar']) for (const jobs of [[], [job(9)]]) {
    const value = page({ status: 'partial', jobs, sourceStatus: 'fresh', error: null, limited: true });
    const r = renderResults(value, language);
    assert(r.html.includes(r.t('This search is incomplete. Review the source details, or retry the same search.')));
    assert(r.html.includes(r.t('Some boards have more jobs than can be checked at once. Open an employer’s website for its complete list.')));
    assert(!r.html.includes(r.t('Some boards could not provide current results. This search may be incomplete.')));
    assert(!r.html.includes(r.t('This board could not provide current results.')));
    assert(!r.html.includes(r.t('Current openings could not be checked.')));
    assert.equal(findButtons(r.element, r.t('Retry this search')).length, 1);
    if (jobs.length) assert.match(r.html, /data-synthetic-job="synthetic-9"/);
    else assert(r.html.includes(r.t('No matches in the results we could check.')));
  }
});

test('a stale source with an error keeps both the age warning and the source failure explanation', () => {
  for (const language of ['en', 'ar']) {
    const r = renderResults(page({ status: 'partial', sourceStatus: 'stale', error: {
      code: 'source_unavailable', message: 'This board could not provide current results.',
    } }), language);
    assert(r.html.includes(r.t('Showing an earlier check of this board.')));
    assert(r.html.includes(r.t('This board could not provide current results.')));
    assert.match(r.html, /data-synthetic-job="synthetic-9"/);
    assert.equal(findButtons(r.element, r.t('Retry this search')).length, 1);
  }
});

const incompleteMessage = 'This search is incomplete. Review the source details, or retry the same search.';
const expectedIncomplete = {
  en: incompleteMessage,
  ar: 'نتائج هذا البحث غير مكتملة. راجع تفاصيل المصادر أو أعد البحث نفسه.',
};
function assertLiveSummary(result, expected) {
  assert.equal(result.element.type, 'p');
  assert.equal(result.element.props.role, 'status');
  assert.equal(result.element.props['aria-live'], 'polite');
  assert.equal(result.element.props['aria-atomic'], 'true');
  assert.equal(result.element.props.className, 'visually-hidden');
  assert.equal(result.element.props.children, expected);
}

for (const language of ['en', 'ar']) {
  for (const [label, options] of [
    ['fresh partial results', { status: 'partial' }],
    ['only the overall result limit', { limited: true }],
    ['only a source result limit', { sourceLimited: true }],
  ]) test(`actual visible and live summaries describe ${label} without inventing an outage in ${language}`, () => {
    for (const count of [0, 1, 12]) {
      const value = model.discoveryPageSchema.parse(page({ ...options, jobs: Array.from({ length: count }, (_, index) => job(index)) }));
      // A displayed count must describe this page, not its larger match estimate.
      value.totalMatches = 417;
      assert.equal(value.sources[0].status, 'fresh'); assert.equal(value.sources[0].error, null);
      const visible = renderResults(value, language), live = renderLiveStatus(value, language);
      assert.equal(visible.t(incompleteMessage), expectedIncomplete[language], 'The neutral message needs a real locale entry');
      const announcementKey = count === 1 ? '{0} job shown. {1}' : '{0} jobs shown. {1}';
      if (count === 1 && language === 'ar') assert.equal(catalog[announcementKey], 'الوظائف المعروضة: {0}. {1}', 'The singular Arabic template must retain both placeholders');
      assertLiveSummary(live, live.t(announcementKey, [i18n.formatNumber(count, language), expectedIncomplete[language]]));
      assert(visible.html.includes(expectedIncomplete[language]));
      assert(visible.html.includes(visible.t('{0} shown', [i18n.formatNumber(count, language)])));
      assert.equal([...visible.html.matchAll(/data-synthetic-job=/g)].length, count);
      for (const outage of [
        'Some boards could not provide current results. This search may be incomplete.',
        'Some sources could not provide current results.',
        'This board could not provide current results.',
        'Showing an earlier check of this board.',
      ]) {
        assert(!visible.html.includes(visible.t(outage)), `Fresh results must not claim: ${outage}`);
        assert(!live.html.includes(live.t(outage)), `The announcement must not claim: ${outage}`);
      }
      const retries = findButtons(visible.element, visible.t('Retry this search'));
      assert.equal(retries.length, 1); assert.equal(retries[0].props.disabled, false);
      retries[0].props.onClick(); assert.deepEqual(visible.calls, ['retry']);
      if (!count) {
        assert(visible.html.includes(visible.t('No matches in the results we could check.')));
        assert(!visible.html.includes(visible.t('Current openings could not be checked.')));
        assert(!visible.html.includes(visible.t('No matching jobs in these boards.')));
      }
    }
  });

  test(`actual search summaries retain source evidence and distinguish complete zero/nonzero results in ${language}`, () => {
    for (const { value, incomplete, detail } of [
      { value: page(), incomplete: false },
      { value: page({ sourceStatus: 'stale' }), incomplete: true, detail: 'Showing an earlier check of this board.' },
      { value: page({ error: { code: 'source_unavailable', message: 'Synthetic provider refusal.' } }), incomplete: true, detail: 'Synthetic provider refusal.' },
      { value: page({ status: 'unavailable', sourceStatus: 'unavailable', jobs: [] }), incomplete: true, detail: 'This board could not provide current results.' },
      { value: page({ jobs: [] }), incomplete: false },
      { value: page({ jobs: Array.from({ length: 12 }, (_, index) => job(index)) }), incomplete: false },
    ]) {
      const visible = renderResults(value, language), live = renderLiveStatus(value, language);
      const summary = incomplete ? expectedIncomplete[language] : live.t('Search complete.');
      const announcementKey = value.jobs.length === 1 ? '{0} job shown. {1}' : '{0} jobs shown. {1}';
      assertLiveSummary(live, live.t(announcementKey, [i18n.formatNumber(value.jobs.length, language), summary]));
      if (value.jobs.length === 1 && language === 'en') assert.equal(live.element.props.children, `1 job shown. ${summary}`);
      if (incomplete && value.status === 'unavailable' && !value.jobs.length) {
        assert(visible.html.includes(visible.t('Current openings could not be checked.')));
        assert(visible.html.includes(visible.t('The selected boards did not return results. Retry the same search, or review the source details.')));
        assert(!visible.html.includes(visible.t('No matches in the results we could check.')));
      } else assert.equal(visible.html.includes(expectedIncomplete[language]), incomplete);
      assert.equal(findButtons(visible.element, visible.t('Retry this search')).length, incomplete ? 1 : 0);
      if (detail) assert(visible.html.includes(visible.t(detail)), 'Specific source evidence must remain visible');
      if (!incomplete && !value.jobs.length) {
        assert(visible.html.includes(visible.t('No matching jobs in these boards.')));
        assert(!visible.html.includes(visible.t('No current matches could be confirmed.')));
      }
    }
  });

  test(`the actual search live region stays silent during work and before any result page in ${language}`, () => {
    for (const value of [page(), page({ limited: true }), page({ sourceLimited: true })]) {
      for (const busy of ['Searching employer boards', 'Loading more jobs']) {
        assertLiveSummary(renderLiveStatus(value, language, { busy }), '');
      }
    }
    for (const busy of ['', 'Searching employer boards']) {
      assertLiveSummary(renderLiveStatus(null, language, { busy }), '');
    }
  });
}

// These cases use real source-scoped discovery identities, unlike the older
// transport-only stubs above. The production history algorithm and schemas run.
const historySource = 'lever:global:synthetic-history';
const historyFilters = () => ({ query: 'Designer', location: 'Toronto', remoteOnly: false, sources: [historySource] });
const historyJob = number => ({ ...job(number), id: `${historySource}:20000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
  url: `https://jobs.lever.co/synthetic-history/20000000-0000-4000-8000-${String(number).padStart(12, '0')}`, location: 'Toronto' });
function historyPage(numbers, { matchedCount = numbers.length, nextCursor = null, sourceStatus = 'fresh', error = null } = {}) {
  return { ...page({ jobs: numbers.map(historyJob), nextCursor }), sources: [{ ...page().sources[0], id: historySource,
    boardUrl: 'https://jobs.lever.co/synthetic-history', matchedCount, availableCount: matchedCount, status: sourceStatus, error }] };
}
const historyEvaluation = (history, value, previousResult) => searchHistory.evaluateSearchHistory({ history, filters: historyFilters(), page: value, now: 1000, previousResult });
function historyHarness(options = {}) {
  return harness({ searchedFilters: null, savedFilters: historyFilters(), initialFilters: historyFilters(), ...options });
}
async function completeHistorySearch(h, value, mode) {
  const index = h.calls.length, pending = h.search(mode), request = await h.admitted(index);
  request.resolve(value); await pending;
  assert.equal(h.context.notice, null, h.context.notice?.text);
}

test('actual search commits a silent A/B baseline then only C with B/C and reload retains the exact result', async () => {
  const h = historyHarness(), privateBefore = h.readSaved();
  await completeHistorySearch(h, historyPage([1, 2]));
  assert.deepEqual(plain(h.context.searchNewResult.newIds), []);
  assert.deepEqual(h.readSaved().lastSearch.newResult.newIds, []);
  assert.equal(h.readSaved().searchHistory.searches[0].boards[0].ready, true);
  await completeHistorySearch(h, historyPage([2, 3]));
  const saved = h.readSaved();
  assert.deepEqual(saved.lastSearch.newResult.newIds, [historyJob(3).id]);
  assert.deepEqual(plain(h.context.searchNewResult), saved.lastSearch.newResult);
  assert.deepEqual(saved.lastSearch.page.jobs.map(job => job.id), [historyJob(2).id, historyJob(3).id]);
  assert.equal(saved.lastSearch.page.nextCursor, null);
  for (const name of ['profile', 'jobs', 'records']) assert.deepEqual(saved[name], privateBefore[name]);
  for (const call of h.calls) assert.deepEqual([...new URL(call.path, 'https://synthetic.local').searchParams.keys()].sort(), ['location', 'q', 'remote', 'source']);
});

test('actual More commits accumulated IDs and carries earlier new markers across the current search', async () => {
  const baseline = historyEvaluation(undefined, historyPage([1, 2]));
  const firstPage = historyPage([2, 3], { matchedCount: 3, nextCursor: 'synthetic-history-next' });
  const compared = historyEvaluation(baseline.history, firstPage);
  const h = historyHarness({ searchedFilters: historyFilters(), initialPage: firstPage, initialHistory: compared.history, initialNewResult: compared.result });
  h.context.setShowNewOnly(true);
  await completeHistorySearch(h, historyPage([4], { matchedCount: 3 }), 'more');
  assert.deepEqual(h.readSaved().lastSearch.newResult.newIds, [historyJob(3).id, historyJob(4).id]);
  assert.equal(h.context.showNewOnly, true, 'More retains the local display choice');
  assert.deepEqual(h.readSaved().lastSearch.page.jobs.map(job => job.id), [2, 3, 4].map(value => historyJob(value).id));
  const visible = renderResults(h.context.searchPage, 'en', { searchNewResult: h.context.searchNewResult, showNewOnly: h.context.showNewOnly });
  assert.equal([...visible.html.matchAll(/data-synthetic-job=/g)].length, 2);
  assert(!visible.html.includes(historyJob(2).id));
});

for (const [initialOnly, latestOnly] of [[false, true], [true, false]]) {
  test('More preserves the latest display choice across its frozen render closure: ' + (initialOnly ? 'New' : 'All') + ' to ' + (latestOnly ? 'New' : 'All'), async () => {
    const baseline = historyEvaluation(undefined, historyPage([1, 2]));
    const firstPage = historyPage([2, 3], { matchedCount: 3, nextCursor: 'synthetic-history-next' });
    const compared = historyEvaluation(baseline.history, firstPage);
    const h = historyHarness({ searchedFilters: historyFilters(), initialPage: firstPage, initialHistory: compared.history, initialNewResult: compared.result });
    h.context.setShowNewOnly(initialOnly);
    // search() installs the actual handler with the render's scalar state
    // captured by value. A later click cannot update that lexical binding.
    const pending = h.search('more'), request = await h.admitted();
    const waiting = renderResults(h.context.searchPage, 'en', {
      searchNewResult: h.context.searchNewResult, showNewOnly: h.context.showNewOnly,
      setShowNewOnly: h.context.setShowNewOnly, busy: h.context.busy,
    });
    const choices = findButtons(waiting.element, waiting.t(latestOnly ? 'New only' : 'All results'));
    assert.equal(choices.length, 1);
    assert(!choices[0].props.disabled, 'The local display choice remains reachable while More is pending');
    choices[0].props.onClick();
    assert.equal(h.context.showNewOnly, latestOnly);
    assert.equal(h.context.showNewOnlyRef.current, latestOnly, 'The actual production setter records current intent synchronously');
    assert.deepEqual(waiting.calls, [], 'Changing the display filter admits no new request');
    assert.equal(h.calls.length, 1);

    request.resolve(historyPage([4], { matchedCount: 3 })); await pending;
    assert.equal(h.context.notice, null, h.context.notice?.text);
    assert.equal(h.context.showNewOnly, latestOnly, 'The completed request must not restore its captured earlier display choice');
    assert.equal(h.context.showNewOnlyRef.current, latestOnly);
    assert.deepEqual(h.readSaved().lastSearch.newResult.newIds, [historyJob(3).id, historyJob(4).id]);
    assert.deepEqual(plain(h.context.searchPage.jobs.map(job => job.id)), [2, 3, 4].map(value => historyJob(value).id));
    const final = renderResults(h.context.searchPage, 'en', {
      searchNewResult: h.context.searchNewResult, showNewOnly: h.context.showNewOnly,
      setShowNewOnly: h.context.setShowNewOnly,
    });
    assert.equal([...final.html.matchAll(/data-synthetic-job=/g)].length, latestOnly ? 2 : 3);
    assert.equal(h.calls.length, 1);
  });
}

test('a failed final More save reveals all accumulated jobs instead of keeping an unsupported New-only filter', async () => {
  const baseline = historyEvaluation(undefined, historyPage([1, 2]));
  const firstPage = historyPage([2, 3], { matchedCount: 3, nextCursor: 'synthetic-history-next' });
  const compared = historyEvaluation(baseline.history, firstPage);
  const h = historyHarness({ searchedFilters: historyFilters(), initialPage: firstPage, initialHistory: compared.history, initialNewResult: compared.result });
  const before = h.readSaved(); h.context.setShowNewOnly(true);
  h.writeHook.current = async () => { throw Error('Synthetic More history vault failure'); };
  const pending = h.search('more'), request = await h.admitted(); request.resolve(historyPage([4], { matchedCount: 3 })); await pending;
  assert.equal(h.writeAttempts.length, 1); assert.equal(h.writes.length, 0); assert.deepEqual(h.readSaved(), before);
  assert.equal(h.context.searchNewResult, null); assert.equal(h.context.showNewOnly, false);
  assert.deepEqual(plain(h.context.searchPage.jobs.map(job => job.id)), [2, 3, 4].map(value => historyJob(value).id));
  assert.match(h.context.notice.text, /Synthetic More history vault failure/);
  for (const language of ['en', 'ar']) {
    const view = renderResults(h.context.searchPage, language, { searchNewResult: h.context.searchNewResult, showNewOnly: h.context.showNewOnly });
    assert.equal([...view.html.matchAll(/data-synthetic-job=/g)].length, 3);
    assert.equal(findButtons(view.element, view.t('New only')).length, 0);
    assert(!view.html.includes(view.t('No openings are new in the results compared.')));
  }
});

test('actual failure and cancellation preserve history and frozen new markers while retaining later filter drafts', async t => {
  const baseline = historyEvaluation(undefined, historyPage([1, 2]));
  const compared = historyEvaluation(baseline.history, historyPage([2, 3]));
  for (const cancel of [false, true]) await t.test(cancel ? 'cancel' : 'network failure', async () => {
    const h = historyHarness({ searchedFilters: historyFilters(), initialPage: historyPage([2, 3]), initialHistory: compared.history, initialNewResult: compared.result });
    const before = h.readSaved(), pending = h.search(), request = await h.admitted();
    h.edit({ ...historyFilters(), query: 'Nurse typed while waiting' });
    if (cancel) h.context.searchAbort.current.abort();
    else request.reject(new APIError('Synthetic history request failed', 0, 'network_unavailable'));
    await pending;
    const saved = h.readSaved();
    assert.deepEqual(saved.searchHistory, before.searchHistory);
    assert.deepEqual(saved.lastSearch, before.lastSearch);
    assert.deepEqual(plain(h.context.searchNewResult), before.lastSearch.newResult);
    assert.equal(saved.filters.query, 'Nurse typed while waiting');
  });
});

test('an identity change during history search cannot commit a baseline to either owner', async () => {
  const h = historyHarness(), before = h.readSaved(), pending = h.search(), request = await h.admitted();
  h.context.epoch.current++; h.context.identityUnverified.current = true;
  h.context.snapshotRef.current = model.blankSnapshot('account:other-synthetic-owner:new');
  request.resolve(historyPage([1, 2])); await pending;
  assert.equal(h.writeAttempts.length, 0); assert.deepEqual(h.readSaved(), before);
  assert.equal(h.context.snapshotRef.current.searchHistory, undefined);
  assert.equal(h.context.searchNewResult, null);
});

test('failed final vault save never publishes or commits an unretained newness result', async () => {
  const baseline = historyEvaluation(undefined, historyPage([1, 2]));
  const h = historyHarness({ searchedFilters: historyFilters(), initialPage: historyPage([1, 2]), initialHistory: baseline.history, initialNewResult: baseline.result });
  const before = h.readSaved(); h.writeHook.current = async () => { throw Error('Synthetic history vault failure'); };
  const pending = h.search(), request = await h.admitted(); request.resolve(historyPage([2, 3])); await pending;
  assert.equal(h.writeAttempts.length, 1); assert.equal(h.writes.length, 0);
  assert.deepEqual(h.readSaved(), before); assert.equal(h.context.searchNewResult, null);
  assert.match(h.context.notice.text, /Synthetic history vault failure/);
});

for (const language of ['en', 'ar']) test(`actual new-only controls/count and live summary remain local and truthful in ${language}`, () => {
  const first = historyEvaluation(undefined, historyPage([1, 2])), next = historyEvaluation(first.history, historyPage([2, 3]));
  const value = historyPage([2, 3]), untouched = JSON.stringify(value);
  let showNewOnly = false;
  const options = () => ({ searchNewResult: next.result, showNewOnly, setShowNewOnly: value => { showNewOnly = value; } });
  const all = renderResults(value, language, options());
  const label = all.t('{0} role new to this search', [i18n.formatNumber(1, language)]);
  assert(all.html.includes(label)); assert.equal([...all.html.matchAll(/data-new-to-search="true"/g)].length, 1);
  const toggle = findButtons(all.element, all.t('New only'));
  assert.equal(toggle.length, 1); assert.equal(toggle[0].props['aria-pressed'], false);
  toggle[0].props.onClick(); assert.equal(showNewOnly, true); assert.deepEqual(all.calls, []);
  const only = renderResults(value, language, options());
  assert.equal([...only.html.matchAll(/data-synthetic-job=/g)].length, 1);
  assert(only.html.includes(historyJob(3).id)); assert(!only.html.includes(historyJob(2).id));
  assert(only.html.includes(only.t('{0} of {1} shown', [i18n.formatNumber(1, language), i18n.formatNumber(2, language)])));
  assertLiveSummary(renderLiveStatus(value, language, options()), only.t('{0} job shown. {1}', [i18n.formatNumber(1, language), only.t('Search complete.')]));
  findButtons(only.element, only.t('All results'))[0].props.onClick(); assert.equal(showNewOnly, false);
  assert.equal([...renderResults(value, language, options()).html.matchAll(/data-synthetic-job=/g)].length, 2);
  assert.equal(JSON.stringify(value), untouched); assert.deepEqual(only.calls, []);
  const initial = renderResults(historyPage([1, 2]), language, { searchNewResult: first.result });
  assert.equal(findButtons(initial.element, initial.t('New only')).length, 0, 'the initial baseline is silent');
  const zero = historyEvaluation(next.history, value), zeroOnly = renderResults(value, language, { searchNewResult: zero.result, showNewOnly: true, setShowNewOnly() {} });
  assert(zeroOnly.html.includes(zeroOnly.t('No openings are new in the results compared.')));
  assert.equal([...zeroOnly.html.matchAll(/data-synthetic-job=/g)].length, 0);
});

test('an all-board outage keeps earlier jobs and the latest draft without reviving old pagination', async t => {
  for (const mode of ['new', 'more']) await t.test(mode, async () => {
    const previousPage = page({ jobs: [job(7), job(8)], nextCursor: 'earlier-cursor' });
    const h = harness({ initialPage: previousPage });
    const previousSaved = h.readSaved();
    const pending = h.search(mode);
    const request = await h.admitted();
    h.edit(laterDraft());
    request.resolve(page({ status: 'unavailable', jobs: [], sourceStatus: 'unavailable' }));
    await pending;

    assert.equal(h.context.searchPage, previousPage, 'Earlier results remain visible with their original sources and date');
    assert.equal(h.context.restored, true, 'Earlier openings are labeled as previous results');
    assert.equal(h.context.notice?.text, 'Current openings could not be checked.');
    assert.deepEqual(h.readSaved(), { ...previousSaved, filters: laterDraft() }, 'The outage saves the draft without erasing earlier results or private records');
    await h.search('more');
    assert.equal(h.calls.length, 1, 'The old cursor cannot issue a request after the outage');

    const refreshed = h.search('new');
    const retry = await h.admitted(1);
    assert.equal(new URL(retry.path, 'https://synthetic.local').searchParams.has('cursor'), false);
    retry.resolve(page({ jobs: [job(9)] }));
    await refreshed;
    assert.equal(h.context.restored, false);
    assert.deepEqual(plain(h.context.searchPage.jobs), [job(9)]);
  });
});
