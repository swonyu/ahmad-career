import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const directory = await mkdtemp(join(tmpdir(), 'career-search-workflows-'));
after(() => rm(directory, { recursive: true, force: true }));
await Promise.all([
  ['app/phone/model.ts', 'model.mjs'], ['app/phone/record-tools.ts', 'records.mjs'], ['app/i18n/core.ts', 'i18n.mjs'],
].map(([entry, filename]) => build({ entryPoints: [entry], outfile: join(directory, filename), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' })));
const model = await import(pathToFileURL(join(directory, 'model.mjs')).href);
const records = await import(pathToFileURL(join(directory, 'records.mjs')).href);
const i18n = await import(pathToFileURL(join(directory, 'i18n.mjs')).href);
const source = await readFile('app/phone/PhoneApp.tsx', 'utf8');
const tree = ts.createSourceFile('PhoneApp.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const named = new Map(), handlers = new Map();
function visit(node) {
  if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name) named.set(node.name.getText(tree), node);
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    const attrs = new Map(node.attributes.properties.filter(ts.isJsxAttribute).map(attr => [attr.name.getText(tree), attr.initializer]));
    if (attrs.get('className')?.text?.includes('phone-followup-link')) handlers.set('followups', attrs.get('onClick').expression.getText(tree));
    if (node.tagName.getText(tree) === 'DiscoveryEmptyState') handlers.set('retry', attrs.get('onRetry').expression.getText(tree));
  }
  ts.forEachChild(node, visit);
}
visit(tree);
function execute(text, scope = {}) {
  const output = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const context = vm.createContext({ exports: {}, require, AbortController, URL, ...scope });
  vm.runInContext(output, context);
  return context;
}
function declaration(name) {
  const node = named.get(name);
  assert(node, `Missing real production declaration: ${name}`);
  return ts.isFunctionDeclaration(node) ? node.getText(tree) : `const ${node.getText(tree)};`;
}

test('empty discovery output distinguishes unavailable, incomplete and healthy empty results in both languages', () => {
  for (const language of ['en', 'ar']) {
    const t = key => i18n.translate(key, language);
    const { exports: { Empty } } = execute(`${declaration('DiscoveryEmptyState')}\nexports.Empty = DiscoveryEmptyState;`, { useI18n: () => ({ t, language }) });
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
  const job = { id: 'synthetic-due', title: 'Designer', company: 'Synthetic Employer', location: 'Riyadh', country: 'SA', url: 'https://employer.example/role/1' };
  const snapshot = { ...model.blankSnapshot('guest'), jobs: [job], records: [{ ...model.blankRecord(job), followUpDate: '2020-01-01', note: 'Call the recruiter' }] };
  const state = { savedQuery: 'portfolio', savedFilter: 'all', tab: 'search' };
  const select = () => execute(['jobs', 'records', 'recordsByID', 'recordJobs', 'shownJobs'].map(declaration).join('\n') + '\nexports.rows = shownJobs;', {
    snapshot, ...state, jobIdentity: model.jobIdentity, matchesSavedSearch: records.matchesSavedSearch,
  }).exports.rows;
  assert.equal(select().length, 0);
  const before = JSON.stringify(snapshot);
  execute(`(${handlers.get('followups')})();`, {
    setSavedQuery: value => { state.savedQuery = value; }, setSavedFilter: value => { state.savedFilter = value; }, navigate: value => { state.tab = value; },
  });
  assert.equal(state.tab, 'saved');
  assert.equal(select().length, 1); assert.equal(select()[0].url, job.url);
  assert.equal(JSON.stringify(snapshot), before, 'navigation must not edit private records');
  state.savedQuery = 'recruiter'; assert.equal(select().length, 1);
  state.savedQuery = 'portfolio'; assert.equal(select().length, 0, 'ordinary Saved search remains active');
});

test('retry reuses the submitted filters and boards even when unsubmitted form edits differ', async () => {
  const searchedFilters = { query: 'designer', location: 'Riyadh', remoteOnly: true, sources: ['lever:synthetic-one', 'greenhouse:synthetic-two'] };
  const changedFilters = { query: 'engineer', location: 'London', remoteOnly: false, sources: ['lever:other'] };
  const path = model.discoveryPath(searchedFilters);
  let pending, request, selected, persisted;
  const page = { ok: true, version: 1, generatedAt: '2026-11-17T12:00:00Z', status: 'complete', jobs: [], sources: [], nextCursor: null, totalMatches: 0, limited: false, notice: 'Synthetic search only' };
  const snapshot = model.blankSnapshot('guest');
  const context = execute(`${declaration('searchJobs')}\nexports.retry = ${handlers.get('retry')};`, {
    run: (_label, action) => { pending = action(1); return pending; },
    filters: changedFilters, searchSources: changedFilters.sources, searchedFilters,
    searchPage: { ...page, status: 'unavailable' }, restored: false, searchAbort: { current: null },
    discoveryPageSchema: model.discoveryPageSchema, discoveryPath: model.discoveryPath,
    phoneAPI: async address => { request = address; return page; }, assertCurrent: generation => assert.equal(generation, 1),
    setSearchPage() {}, setSearchedFilters() {}, setRestored() {}, setFilters: value => { selected = value; },
    snapshotRef: { current: snapshot }, storageProblem: '', local: () => snapshot,
    persist: async value => { persisted = value; }, jobIdentity: model.jobIdentity,
  });
  context.exports.retry(); await pending;
  assert.equal(request, path);
  assert.equal(selected, undefined, 'retry must not replace the unsubmitted form edits');
  assert.deepEqual(persisted.filters, changedFilters);
  assert.deepEqual(persisted.lastSearch.filters, searchedFilters);
  assert.equal(changedFilters.location, 'London', 'the original object was not mutated');
});
