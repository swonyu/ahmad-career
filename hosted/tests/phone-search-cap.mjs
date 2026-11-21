import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// These overrides allow an isolated evidence copy to exercise a proposed source
// file. Normal project runs always read the actual production PhoneApp.
const project = process.env.CAREER_SEARCH_CAP_PROJECT || fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(path.join(project, 'package.json'));
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const read = file => fs.readFileSync(path.join(project, file), 'utf8');

function execute(source, scope = {}, loader = require) {
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const context = { exports: {}, require: loader, Error, URL, URLSearchParams, Intl,
    fetch() { assert.fail('Rendering a recovery action must not contact a network'); }, ...scope };
  vm.runInNewContext(code, context);
  return context.exports;
}
const model = execute(read('app/phone/model.ts'));
const catalog = JSON.parse(read('app/i18n/messages.ar.json'));
const i18n = execute(read('app/i18n/core.ts'), {}, name => name === './messages.ar.json' ? catalog : require(name));
const source = process.env.CAREER_SEARCH_CAP_SOURCE
  ? fs.readFileSync(process.env.CAREER_SEARCH_CAP_SOURCE, 'utf8')
  : read('app/phone/PhoneApp.tsx');
const tree = ts.createSourceFile('PhoneApp.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'PhoneApp');
assert(component?.body);

function declaration(name, optional = false) {
  for (const node of [...tree.statements, ...component.body.statements]) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node.getText(tree);
    if (ts.isVariableStatement(node)) {
      const entry = node.declarationList.declarations.find(value => value.name.getText(tree) === name);
      if (entry?.initializer) return entry.initializer.getText(tree);
    }
  }
  if (optional) return null;
  assert.fail('Actual production declaration is required: ' + name);
}
let resultsNode, liveStatusNode;
function findSurfaces(node) {
  if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(prop =>
    ts.isJsxAttribute(prop) && prop.name.text === 'className' && prop.initializer &&
    ts.isStringLiteral(prop.initializer) && prop.initializer.text === 'phone-results')) resultsNode = node;
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'p' &&
    node.getText(tree).includes('"{0} jobs shown. {1}"')) {
    assert(!liveStatusNode, 'Expected one production search announcement');
    liveStatusNode = node;
  }
  ts.forEachChild(node, findSurfaces);
}
findSurfaces(tree);
assert(resultsNode && liveStatusNode, 'Actual production results and live status are required');

const capNotice = 'You have viewed 200 results. Refine the job title, location, or employer boards to narrow your search.';
const incompleteNotice = 'This search is incomplete. Review the source details, or retry the same search.';
const stamp = '2026-11-17T18:00:00.000Z';
const filters = { query: '', location: '', remoteOnly: false, sources: ['lever:global:synthetic'] };
function fixture({ count = 200, status = 'complete', sourceStatus = 'fresh', error = null,
  nextCursor = 'synthetic-fifth-page', limited = false, sourceLimited = false } = {}) {
  const jobs = Array.from({ length: count }, (_, index) => ({
    id: 'synthetic-' + index, title: 'Synthetic opportunity ' + index,
    company: 'Synthetic employer', url: 'https://example.org/career-finder-search/' + index,
    location: 'الرياض / Riyadh', country: 'SA', remote: false, summary: 'Synthetic data only',
    checkedAt: stamp, stale: sourceStatus === 'stale', sourceName: 'Synthetic employer',
  }));
  const page = { ok: true, version: 1, generatedAt: stamp, status, jobs,
    sources: [{ id: 'lever:global:synthetic', name: 'Synthetic employer العربية',
      provider: 'lever', boardUrl: 'https://jobs.lever.co/synthetic',
      status: sourceStatus, checkedAt: sourceStatus === 'unavailable' ? null : stamp,
      availableCount: count ? 250 : 0, matchedCount: count ? 250 : 0, limited: sourceLimited, error }],
    nextCursor, totalMatches: count ? 250 : 0, limited,
    notice: 'Search covers only the selected public employer boards. Results can change or close; open the employer posting to confirm requirements and location eligibility.' };
  // Accumulated results use the real snapshot extension, not the 50-row API page.
  return model.phoneSnapshotSchema.parse({
    ...model.blankSnapshot('guest'), filters, lastSearch: { filters, page },
  }).lastSearch.page;
}
function render(page, language, overrides = {}) {
  const calls = [];
  const t = (key, values) => i18n.translate(key, language, values);
  const scope = { searchPage: page, searchedFilters: filters, filters, searchSources: filters.sources,
    restored: false, busy: '', loading: false, locked: false, checkingIdentity: false, jobs: [], cannotSave: false,
    searchResultsHeading: { current: null },
    searchNewResult: null, showNewOnly: false, setShowNewOnly() { assert.fail('No filter change during rendering'); },
    language, t, formatNumber: i18n.formatNumber, displayTime: value => i18n.formatDateTime(value, language),
    same: (a, b) => JSON.stringify(a) === JSON.stringify(b), jobIdentity: model.jobIdentity,
    JobCard: ({ job }) => React.createElement('article', { 'data-synthetic-job': job.id }, job.title),
    searchJobs: mode => { calls.push(mode); }, saveJob() { assert.fail('No saving during rendering'); },
    setDialog() { assert.fail('No dialog action during rendering'); },
    useI18n: () => ({ t, language }), ...overrides };
  const top = ['discoveryCoverageNotice', 'discoveryLimitNotice']
    .map(name => 'const ' + name + ' = ' + declaration(name) + ';').join('\n');
  // Optional new derived values let this same behavioral test render the
  // unpatched baseline and fail on the missing UI, not a fixture dependency.
  const derived = ['newSearchIDs', 'shownSearchJobs', 'newSearchCount', 'hasSearchComparison', 'incompleteSearch', 'localResultLimitReached', 'searchSummary']
    .map(name => ({ name, value: declaration(name, true) }))
    .filter(entry => entry.value !== null)
    .map(entry => 'const ' + entry.name + ' = ' + entry.value + ';').join('\n');
  const setup = top + '\n' + declaration('discoveryNoticeText') + '\n' +
    declaration('DiscoveryEmptyState') + '\n' + derived + '\n';
  const { Surface } = execute(setup + 'exports.Surface = () => (' + resultsNode.getText(tree) + ');', scope);
  const { Status } = execute(setup + 'exports.Status = () => (' + liveStatusNode.getText(tree) + ');', scope);
  const element = Surface(), live = Status();
  return { element, live, html: renderToStaticMarkup(element), calls, t };
}
function elements(node, type, found = []) {
  if (!React.isValidElement(node)) return found;
  if (typeof node.type === 'function') return elements(node.type(node.props), type, found);
  if (node.type === type) found.push(node);
  React.Children.forEach(node.props.children, child => elements(child, type, found));
  return found;
}
function accessibleText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node) || node.props['aria-hidden'] === true) return '';
  if (typeof node.type === 'function') return accessibleText(node.type(node.props));
  return React.Children.toArray(node.props.children).map(accessibleText).join('');
}
function button(result, label) {
  return elements(result.element, 'button').filter(node => accessibleText(node) === result.t(label));
}

test('exactly 200 retained results with another page explain the local limit visibly and in the live summary in EN and AR', () => {
  for (const language of ['en', 'ar']) {
    const page = fixture(), before = JSON.stringify(page), result = render(page, language);
    assert(result.html.includes(result.t(capNotice)), 'The normal exact-cap boundary needs visible guidance');
    assert.equal([...result.html.matchAll(/data-synthetic-job=/g)].length, 200);
    assert(result.live.props.children.includes(result.t(capNotice)), 'The live summary must include the same recovery guidance');
    assert(!result.live.props.children.includes(result.t('Search complete.')));
    assert(!result.html.includes(result.t(incompleteNotice)), 'A local display cap must not invent a provider failure');
    assert.equal(button(result, 'Load more jobs').length, 0, 'Replace the unusable pagination action with the explanation');
    assert.equal(result.live.props.role, 'status');
    assert.equal(result.live.props['aria-live'], 'polite');
    assert.equal(result.live.props['aria-atomic'], 'true');
    assert.deepEqual(result.calls, []);
    assert.equal(JSON.stringify(page), before, 'Rendering must preserve provider status, limits, cursor and all jobs');
    if (language === 'ar') assert.notEqual(result.t(capNotice), capNotice);
  }
});

test('the local-cap message is absent below 200 or when all 200 results have been loaded, and work stays silent', () => {
  for (const language of ['en', 'ar']) {
    for (const [count, nextCursor, moreButtons] of [[199, 'synthetic-next-page', 1], [200, null, 0]]) {
      const result = render(fixture({ count, nextCursor }), language);
      assert(!result.html.includes(result.t(capNotice)));
      assert(!result.live.props.children.includes(result.t(capNotice)));
      assert(result.live.props.children.includes(result.t('Search complete.')));
      assert.equal(button(result, 'Load more jobs').length, moreButtons);
      if (moreButtons) assert.equal(button(result, 'Load more jobs')[0].props.disabled, false);
    }
    for (const busy of ['Searching employer boards', 'Loading more jobs']) {
      assert.equal(render(fixture(), language, { busy }).live.props.children, '');
    }
  }
});

test('local-cap guidance preserves provider limits, partial outcomes and unavailable empty-state distinctions', () => {
  for (const language of ['en', 'ar']) {
    for (const options of [
      { status: 'partial', error: { code: 'source_unavailable', message: 'The employer board could not be refreshed.' } },
      { status: 'partial', limited: true },
      { sourceLimited: true },
    ]) {
      const page = fixture(options), before = JSON.stringify(page), result = render(page, language);
      assert(result.html.includes(result.t(capNotice)));
      assert(result.html.includes(result.t(incompleteNotice)));
      assert(result.live.props.children.includes(result.t(capNotice)));
      assert(result.live.props.children.includes(result.t(incompleteNotice)));
      assert.equal(button(result, 'Retry this search').length, 1);
      if (options.limited) assert(result.html.includes(result.t('Some boards have more jobs than can be checked at once. Open an employer’s website for its complete list.')));
      if (options.error) assert(result.html.includes(result.t(options.error.message)));
      else assert(!result.html.includes(result.t('This board could not provide current results.')));
      assert.equal(JSON.stringify(page), before);
    }
    for (const [status, headline] of [
      ['partial', 'No matches in the results we could check.'],
      ['unavailable', 'Current openings could not be checked.'],
    ]) {
      const result = render(fixture({ count: 0, status, nextCursor: null,
        sourceStatus: status === 'unavailable' ? 'unavailable' : 'fresh' }), language);
      assert(result.html.includes(result.t(headline)));
      assert(!result.html.includes(result.t(capNotice)));
      assert(result.live.props.children.includes(result.t(incompleteNotice)));
      assert.equal(button(result, 'Retry this search').length, 1);
      assert(!result.html.includes(result.t('No matching jobs in these boards.')));
    }
  }
});

test('affected source notes offer an explicit safe employer-board link in EN and AR without taking any action', () => {
  for (const language of ['en', 'ar']) {
    for (const options of [
      { count: 0, status: 'unavailable', sourceStatus: 'unavailable', nextCursor: null },
      { count: 1, status: 'partial', sourceStatus: 'stale', nextCursor: null },
      { count: 1, status: 'partial', nextCursor: null,
        error: { code: 'source_unavailable', message: 'The employer board could not be refreshed.' } },
    ]) {
      const page = fixture(options), result = render(page, language);
      const anchors = elements(result.element, 'a');
      assert.equal(anchors.length, 1, 'Each affected source gets one actionable alternative');
      const anchor = anchors[0];
      assert.equal(anchor.props.href, page.sources[0].boardUrl);
      assert.equal(anchor.props.target, '_blank');
      assert.deepEqual(new Set(anchor.props.rel.split(/\s+/)), new Set(['noopener', 'noreferrer']));
      assert.equal(anchor.props.onClick, undefined, 'The native link must not start an application or background action');
      const label = accessibleText(anchor);
      assert(label.includes(result.t('Open employer page ')));
      assert(label.includes(page.sources[0].name), 'The accessible link name must identify its employer source');
      if (language === 'ar') assert(!label.includes('Open employer page'));
      assert.deepEqual(result.calls, []);
    }
    const healthy = render(fixture({ count: 1, nextCursor: null }), language);
    assert(!healthy.html.includes('phone-source-note'));
    assert.equal(elements(healthy.element, 'a').length, 0, 'Healthy sources must not acquire an error notice');
  }
});
