import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

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
const model = execute(read('app/phone/model.ts'));
const { APIError } = execute(read('app/components/api.ts'));
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
  const code = ts.transpileModule(`globalThis.${name} = ${declaration(name)};`, {
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
function page({ status = 'complete', jobs = [job(9)], sourceStatus = 'fresh', error = null, nextCursor = null } = {}) {
  return { ok: true, version: 1, generatedAt: stamp, status, jobs,
    sources: [{ id: 'lever:synthetic-a', name: 'Synthetic board', provider: 'lever', boardUrl: 'https://jobs.lever.co/synthetic-a',
      status: sourceStatus, checkedAt: sourceStatus === 'unavailable' ? null : stamp,
      availableCount: jobs.length, matchedCount: jobs.length, limited: false, error }],
    nextCursor, totalMatches: jobs.length, limited: false, notice: 'Selected synthetic boards only.' };
}

// Execute the real search, run, identity, local-data and persistence handlers.
// Only the transport and encrypted-storage ports are synthetic; any unexpected
// route or attempted network request fails immediately.
function harness({ initialPage, restored = false, searchedFilters = submitted() } = {}) {
  const scope = 'account:synthetic-search-owner:00000000-0000-4000-8000-000000000001';
  const snapshot = model.blankSnapshot(scope);
  snapshot.profile.firstName = 'SYNTHETIC_PRIVATE_PROFILE';
  const calls = [], writes = [];
  const context = {
    Error, URL, URLSearchParams, Intl, DOMException, AbortController, APIError, z: require('zod').z,
    filters: draft(), searchedFilters, searchPage: initialPage ?? page({ status: 'partial', jobs: [job(0)], sourceStatus: 'stale', error: { code: 'source_unavailable', message: 'Synthetic source unavailable.' }, nextCursor: 'synthetic-next-page' }),
    restored, busy: '', busyRef: { current: false }, notice: null, epoch: { current: 3 },
    identityUnverified: { current: false }, identityCheckPending: { current: false }, identityCheckRef: { current() {} },
    snapshotRef: { current: snapshot }, searchAbort: { current: null }, storageProblem: '', locked: false, checkingIdentity: false,
    discoveryPageSchema: model.discoveryPageSchema, discoveryPath: model.discoveryPath, jobIdentity: model.jobIdentity,
    parseSnapshot: model.parseSnapshot,
    fetch() { assert.fail('Search workflow tests must never contact a network'); },
    setBusy(value) { context.busy = value; }, setNotice(value) { context.notice = value; },
    setSearchPage(value) { context.searchPage = value; }, setSearchedFilters(value) { context.searchedFilters = value; },
    setRestored(value) { context.restored = value; },
    setFilters(value) { context.filters = typeof value === 'function' ? value(context.filters) : value; },
    putSnapshot(value) { context.snapshotRef.current = value; },
    async savePhoneSnapshot(owner, value) { assert.equal(owner, scope); writes.push(plain(value)); },
    storageFailure(error) { throw error; },
    lock() { context.locked = true; context.epoch.current++; },
    phoneAPI(path, options = {}) {
      const url = new URL(path, 'https://synthetic.local');
      assert.equal(url.pathname, '/api/discovery/search');
      assert.equal(options.method, undefined); assert.equal(options.body, undefined);
      assert(!path.includes('SYNTHETIC_PRIVATE_PROFILE'));
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
  for (const name of ['message', 'assertCurrent', 'local', 'persist', 'run', 'searchJobs']) install(name, context);
  return { context, calls, writes, edit(value) { context.filters = plain(value); }, search: mode => context.searchJobs(mode) };
}
function requestFilters(call) {
  const params = new URL(call.path, 'https://synthetic.local').searchParams;
  return { query: params.get('q'), location: params.get('location'), remoteOnly: params.get('remote') === 'remote', sources: params.getAll('source') };
}

test('retry repeats the displayed search without a cursor and preserves newer visible draft filters', async () => {
  const h = harness(), previous = h.context.searchPage, original = submitted();
  const pending = h.search('retry');
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
  // Existing persistence stores the submitted search, not every later form edit.
  assert.deepEqual(h.writes[0].lastSearch.filters, original);
  assert.equal(h.writes[0].lastSearch.page.nextCursor, null);
  assert.equal(h.writes[0].profile.firstName, 'SYNTHETIC_PRIVATE_PROFILE');
});

test('a fresh search response does not overwrite text or boards edited while it is pending', async () => {
  const h = harness(), pending = h.search();
  assert.deepEqual(requestFilters(h.calls[0]), draft());
  h.edit(laterDraft()); h.calls[0].resolve(page()); await pending;
  assert.deepEqual(plain(h.context.filters), laterDraft());
  assert.deepEqual(plain(h.context.searchedFilters), draft());
});

test('pagination uses the displayed search and cursor, merges identities, and leaves draft filters alone', async () => {
  const initialPage = page({ jobs: [job(0), job(1)], nextCursor: 'synthetic-next-page' });
  const h = harness({ initialPage }), pending = h.search('more');
  assert.deepEqual(requestFilters(h.calls[0]), submitted());
  assert.equal(new URL(h.calls[0].path, 'https://synthetic.local').searchParams.get('cursor'), 'synthetic-next-page');
  h.edit(laterDraft());
  h.calls[0].resolve(page({ jobs: [{ ...job(1), title: 'Updated synthetic opportunity' }, job(2)] })); await pending;
  assert.deepEqual(plain(h.context.filters), laterDraft());
  assert.deepEqual(Array.from(h.context.searchPage.jobs, value => value.id), ['synthetic-0', 'synthetic-1', 'synthetic-2']);
  assert.equal(h.context.searchPage.jobs[1].title, 'Updated synthetic opportunity');
});

test('failed and cancelled retries retain results, submitted metadata and visible edits, then release the controller', async t => {
  for (const outcome of ['failure', 'cancel']) await t.test(outcome, async () => {
    const h = harness(), previous = h.context.searchPage, priorFilters = h.context.searchedFilters;
    const pending = h.search('retry'); h.edit(laterDraft());
    if (outcome === 'cancel') h.context.searchAbort.current.abort();
    else h.calls[0].reject(new APIError('Synthetic service unavailable', 503, 'source_unavailable'));
    await pending;
    assert.equal(h.context.searchPage, previous); assert.equal(h.context.searchedFilters, priorFilters);
    assert.deepEqual(plain(h.context.filters), laterDraft()); assert.equal(h.writes.length, 0);
    assert.equal(h.context.searchAbort.current, null); assert.equal(h.context.busyRef.current, false);
    assert.match(h.context.notice.text, outcome === 'cancel' ? /Search cancelled/ : /Synthetic service unavailable/);
  });
});

test('late search results cannot cross the existing identity or generation boundary', async t => {
  for (const boundary of ['identity', 'generation']) await t.test(boundary, async () => {
    const h = harness(), previous = h.context.searchPage, priorFilters = h.context.searchedFilters;
    const pending = h.search('retry');
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
  const capped = harness({ initialPage: many }), capPending = capped.search('more');
  capped.calls[0].resolve(page({ jobs: [job(199), job(200)] })); await capPending;
  assert.equal(capped.context.searchPage, many); assert.equal(capped.writes.length, 0);
  assert.match(capped.context.notice.text, /200 results/); assert.deepEqual(plain(capped.context.filters), draft());
  const restored = harness({ restored: true }); await restored.search('more');
  assert.equal(restored.calls.length, 0); assert.equal(restored.context.restored, true);
  const retry = restored.search('retry');
  assert.equal(new URL(restored.calls[0].path, 'https://synthetic.local').searchParams.has('cursor'), false);
  restored.calls[0].resolve(page()); await retry; assert.equal(restored.context.restored, false);
});

let resultsNode;
function findResults(node) {
  if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(prop =>
    ts.isJsxAttribute(prop) && prop.name.text === 'className' && prop.initializer && ts.isStringLiteral(prop.initializer) && prop.initializer.text === 'phone-results')) resultsNode = node;
  ts.forEachChild(node, findResults);
}
findResults(tree); assert(resultsNode, 'The actual results subtree is required');
function renderResults(searchPage, language, overrides = {}) {
  const calls = [], t = (key, values) => i18n.translate(key, language, values);
  const scope = { searchPage, searchedFilters: submitted(), filters: draft(), searchSources: draft().sources,
    restored: false, busy: '', loading: false, locked: false, checkingIdentity: false, jobs: [], cannotSave: false,
    language, t, formatNumber: i18n.formatNumber, displayTime: value => i18n.formatDateTime(value, language),
    same: (a, b) => JSON.stringify(a) === JSON.stringify(b), jobIdentity: model.jobIdentity,
    JobCard: ({ job }) => React.createElement('article', { 'data-synthetic-job': job.id }, job.title),
    searchJobs: mode => { calls.push(mode); }, saveJob() {}, setDialog() {}, ...overrides };
  const top = ['discoveryCoverageNotice', 'discoveryLimitNotice'].map(name => `const ${name} = ${declaration(name)};`).join('\n');
  const { Results } = execute(`${top}\n${declaration('discoveryNoticeText')}\nconst incompleteSearch = ${declaration('incompleteSearch')};\nexports.Results = () => (${resultsNode.getText(tree)});`, scope);
  const element = Results();
  return { element, html: renderToStaticMarkup(element), calls, t };
}
function findButtons(element, text, found = []) {
  if (!React.isValidElement(element)) return found;
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
    assert(r.html.includes(r.t('Some boards could not provide current results. This search may be incomplete.')));
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
    assert(unavailable.html.includes(unavailable.t('No current matches could be confirmed.')));
    assert(!unavailable.html.includes(unavailable.t('No matching jobs in these boards.')));
    assert.equal(findButtons(unavailable.element, unavailable.t('Retry this search')).length, 1);
    const complete = renderResults(page({ jobs: [] }), language);
    assert(complete.html.includes(complete.t('No matching jobs in these boards.')));
    assert(!complete.html.includes(complete.t('No current matches could be confirmed.')));
    assert.equal(findButtons(complete.element, complete.t('Retry this search')).length, 0);
    if (language === 'ar') assert.notEqual(unavailable.t('No current matches could be confirmed.'), 'No current matches could be confirmed.');
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
