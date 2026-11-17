import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const catalog = JSON.parse(read('app/i18n/messages.ar.json'));

function execute(source, scope = {}, loader = require) {
  const result = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } });
  const context = { exports: {}, require: loader, Intl, ...scope };
  vm.runInNewContext(result.outputText, context);
  return context.exports;
}
const { translate, formatNumber } = execute(read('app/i18n/core.ts'), {}, name => name === './messages.ar.json' ? catalog : require(name));
const translator = language => (key, values) => translate(key, language, values);

// Compile the real presentation code, while replacing only its surrounding
// transport/context dependencies. No production routes or external services run.
function declarations(source, names) {
  const tree = ts.createSourceFile('source.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return tree.statements.filter(node => names.includes(node.name?.getText(tree))
    || ts.isVariableStatement(node) && node.declarationList.declarations.some(d => names.includes(d.name.getText(tree))))
    .map(node => node.getText(tree).replace(/^export\s+/, '')).join('\n');
}
function assertArabic(text) {
  assert.match(text, /[\u0600-\u06ff]/u);
  assert.doesNotMatch(text, /[a-z]/i);
}

test('real review rendering localizes every state and preserves user and employer content', () => {
  const source = declarations(read('app/phone/components.tsx'), ['reviewStateLabels', 'ReviewDetails']);
  const ReviewDetails = execute(`${source}\nexports.ReviewDetails = ReviewDetails;`, {
    useI18n: () => ({ language: 'ar', t: translator('ar') }),
  }).ReviewDetails;
  const states = ['ready', 'blocked', 'dispatching', 'confirmed', 'uncertain', 'rate_limited', 'rejected', 'cancelled'];
  const plan = { items: states.map((state, index) => ({
    jobId: `synthetic-${index}`, state, reason: '',
    title: 'Ready for your review', company: 'English employer title',
    job: { url: 'https://employer.example/posting' },
    payloadSummary: { name: 'Outcome needs checking', email: 'synthetic@example.invalid', comments: 'Private note: do not translate me.' },
    resume: null, privacyPolicyUrl: null,
  })) };
  const html = renderToStaticMarkup(React.createElement(ReviewDetails, { plan }));
  const labels = [...html.matchAll(/<p class="phone-kicker">(.*?)<\/p>/g)].map(match => match[1]);
  assert.equal(labels.length, states.length);
  labels.forEach(assertArabic);
  for (const value of [plan.items[0].title, plan.items[0].company, plan.items[0].job.url,
    plan.items[0].payloadSummary.name, plan.items[0].payloadSummary.email, plan.items[0].payloadSummary.comments]) {
    assert(html.includes(value), `Original content changed: ${value}`);
  }
});

test('recovery notices render full sentences and locale-specific counts from the same stored data', () => {
  const source = declarations(read('app/account/AccountPanel.tsx'), ['accountNoticeText']);
  const format = execute(`${source}\nexports.format = accountNoticeText;`, { formatNumber }).format;
  for (const recovered of [0, 1, 2, 11, 1021]) {
    for (const retryRequired of [0, 1, 2]) {
      const notice = Object.freeze({ kind: 'recovered-uploads', recovered, retryRequired });
      const english = format(notice, 'en', translator('en'));
      const arabic = format(notice, 'ar', translator('ar'));
      assert(english.includes(`Recovered files: ${formatNumber(recovered, 'en')}.`));
      assert(arabic.includes(formatNumber(recovered, 'ar')));
      assertArabic(arabic);
      assert(arabic.includes(translator('ar')('A recovered file is attached to your profile only when you explicitly save it from the phone app.')));
      if (retryRequired) {
        assert(arabic.includes(translator('ar')('Files to save again from your phone: {0}.', [formatNumber(retryRequired, 'ar')])));
      } else {
        assert(arabic.includes(translator('ar')('Uploads still in progress can be checked again after one minute.')));
      }
      assert.equal(notice.recovered, recovered);
      assert.equal(notice.retryRequired, retryRequired);
    }
  }
  const ordinary = 'Your workspace changed. Review its details before making another change.';
  assert.equal(format(ordinary, 'ar', translator('ar')), translator('ar')(ordinary));
});

test('actual copy handler stores translatable notices and copies the exact value on success or refusal', async () => {
  const source = read('app/connect/ConnectionPanel.tsx');
  const tree = ts.createSourceFile('connect.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let copyFunction;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'copy') copyFunction = node.getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert(copyFunction, 'Expected the component copy handler');
  for (const label of ['Connection code', 'Service address']) {
    for (const refuses of [false, true]) {
      let notice = '', copied = '';
      const { copy } = execute(`${declarations(source, ['copyMessages'])}\n${copyFunction}\nexports.copy = copy;`, {
        navigator: { clipboard: { async writeText(value) {
          copied = value;
          if (refuses) throw new Error('Synthetic clipboard refusal');
        } } },
        setNotice: value => { notice = value; },
      });
      const value = label === 'Connection code' ? 'ABCD EFGH IJKL' : 'https://service.example/';
      await copy(value, label);
      assert.equal(copied, value);
      assert.equal(notice, refuses ? `Select and copy the displayed ${label.toLowerCase()}.` : `${label} copied.`);
      assert.equal(translate(notice, 'en'), notice);
      assertArabic(translate(notice, 'ar'));
    }
  }
});

test('discovery notice translates only the known service composition and keeps unknown text opaque', () => {
  const source = declarations(read('app/phone/PhoneApp.tsx'), ['discoveryCoverageNotice', 'discoveryLimitNotice', 'discoveryNoticeText']);
  const { format, base, limit } = execute(`${source}\nexports.format = discoveryNoticeText; exports.base = discoveryCoverageNotice; exports.limit = discoveryLimitNotice;`);
  const combined = `${base} ${limit}`;
  const arabic = translator('ar');
  assert.equal(format(combined, arabic), `${arabic(base)} ${arabic(limit)}`);
  assertArabic(format(combined, arabic));
  assert.equal(format(base, arabic), arabic(base));
  assert.equal(format(combined, translator('en')), combined);
  for (const unknown of ['Employer statement: private text', `${combined} Employer statement: private text`]) {
    assert.equal(format(unknown, arabic), unknown);
  }
});

// Inspect rendered production fragments, not a second copy of their markup.
// Every independent dynamic value must retain its original text inside its own
// bidi boundary. This checks semantics; physical visual acceptance is separate.
const phoneSource = read('app/phone/PhoneApp.tsx');
const phoneTree = ts.createSourceFile('phone.tsx', phoneSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function phoneFragment(predicate) {
  let result;
  function visit(node) {
    if (!result && ts.isJsxElement(node) && predicate(node, node.getText(phoneTree))) result = node;
    ts.forEachChild(node, visit);
  }
  visit(phoneTree); assert(result, 'Expected actual phone presentation fragment');
  return result.getText(phoneTree);
}
const tagName = node => node.openingElement.tagName.getText(phoneTree);
const hasClass = (node, name) => node.openingElement.attributes.properties.some(prop =>
  ts.isJsxAttribute(prop) && prop.name.text === 'className' && prop.initializer
  && ts.isStringLiteral(prop.initializer) && prop.initializer.text === name);
function allText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(allText).join('');
  if (!React.isValidElement(node)) return '';
  if (typeof node.type === 'function') return allText(node.type(node.props));
  return allText(node.props.children);
}
function assertIsolatedRawValue(element, value, label) {
  let occurrences = 0;
  function visit(node, parents = []) {
    if (Array.isArray(node)) { node.forEach(child => visit(child, parents)); return; }
    if (typeof node === 'string') {
      if (node === value) {
        occurrences++;
        const boundary = [...parents].reverse().find(parent =>
          parent.type === 'bdi' || ['auto', 'ltr'].includes(parent.props.dir));
        assert(boundary, `${label}: ${value} has no independent bidi boundary`);
        assert.equal(allText(boundary), value, `${label}: unrelated inline values share the boundary`);
      }
      return;
    }
    if (!React.isValidElement(node)) return;
    if (typeof node.type === 'function') { visit(node.type(node.props), parents); return; }
    visit(node.props.children, [...parents, node]);
  }
  visit(element);
  assert(occurrences > 0, `${label}: original value was changed or omitted`);
  const escaped = renderToStaticMarkup(React.createElement('span', null, value)).slice(6, -7);
  assert(renderToStaticMarkup(element).includes(escaped), `${label}: original value absent from rendered markup`);
  return occurrences;
}
const mixedJob = Object.freeze({ id: 'mixed-direction-synthetic',
  title: 'Data (QA) 2 — العربية', company: 'شركة (Acme) 17', location: 'Riyadh (الرياض) 123',
  url: 'https://example.org/career-finder-bidi/17', country: 'SA', summary: 'Synthetic mixed-script posting', checkedAt: '2026-11-17T15:00:00Z' });
const mixedFile = 'CV-أحمد-(QA)-2026.pdf';
function renderPhoneFragment(fragment, language, additions = {}) {
  const t = translator(language);
  const profile = { firstName: 'أحمد (Alex)', lastName: 'Example-17', email: 'synthetic+ar@example.org',
    resume: { name: mixedFile, size: 1024, sha256: '1'.repeat(64) }, linkedin: 'https://www.linkedin.com/in/synthetic', website: 'https://example.org',
    phone: '+966500000000', city: 'الرياض (Riyadh)', country: 'SA', headline: 'Synthetic headline',
    skills: ['TypeScript', 'تحليل'], targetRoles: ['QA'], targetCountries: ['SA'], workModes: ['remote'], experienceLevel: 'mid' };
  const context = { t, language, job: mixedJob, identity: mixedJob.url, bookmarked: true, record: undefined,
    busy: '', cannotSave: false, selected: [], applied: true, profile, workspace: { profile },
    dialog: { job: mixedJob, record: { title: mixedJob.title, company: mixedJob.company } },
    draft: { id: 'synthetic-recovery', savedAt: '2026-11-17T15:00:00Z', record: { job: mixedJob } },
    receipt: { id: 'synthetic-receipt', state: 'uncertain', title: mixedJob.title, company: mixedJob.company,
      createdAt: '2026-11-17T15:00:00Z', url: mixedJob.url },
    RecordSummary: () => null, today: () => '2026-11-17', formatNumber,
    displayTime: () => '17 November 2026', countryName: code => code, workModeLabel: value => value,
    experienceLabel: value => value, receiptLabel: () => 'Outcome needs checking',
    ...additions };
  for (const name of ['ArrowUpRight', 'ChevronRight', 'Check']) context[name] = () => null;
  const View = execute(`exports.View = () => (${fragment});`, context).View;
  return View();
}

test('actual Saved, Apply, details and recovery values retain separate bidi boundaries in both languages', () => {
  const cases = [
    ['Saved card', phoneFragment(node => hasClass(node, 'phone-card phone-saved-card')), [mixedJob.title, mixedJob.company]],
    ['Online bookmark copy', phoneFragment((node, text) => tagName(node) === 'div' && hasClass(node, 'phone-recoverable') && text.includes('Copy bookmark to this phone')), [mixedJob.title, mixedJob.company, mixedJob.location]],
    ['Apply choice', phoneFragment(node => hasClass(node, 'phone-check phone-job-choice')), [mixedJob.title, mixedJob.company]],
    ['Employer-answer legend', phoneFragment((node, text) => tagName(node) === 'legend' && text.includes('job.company') && text.includes('job.title')), [mixedJob.title, mixedJob.company]],
    ['Submission receipt', phoneFragment((node, text) => tagName(node) === 'article' && text.includes('phone-receipt') && text.includes('receipt.title')), [mixedJob.title, mixedJob.company]],
    ['Details location', phoneFragment(node => tagName(node) === 'p' && node.children.some(child => ts.isJsxExpression(child) && child.expression?.getText(phoneTree) === 'dialog.job.location')), [mixedJob.location]],
    ['Unfinished recovery label', phoneFragment((node, text) => tagName(node) === 'button' && text.includes('draft.record?.job.title')), [mixedJob.title, mixedJob.company]],
    ['Record-editor summary', phoneFragment((node, text) => tagName(node) === 'p' && text.includes('dialog.job.title') && text.includes('dialog.job.company')), [mixedJob.title, mixedJob.company]],
    ['Private-record deletion', phoneFragment((node, text) => tagName(node) === 'p' && text.includes('dialog.record.title') && text.includes('dialog.record.company')), [mixedJob.title, mixedJob.company]],
  ];
  for (const language of ['en', 'ar']) for (const [label, fragment, values] of cases) {
    const element = renderPhoneFragment(fragment, language);
    for (const value of values) assertIsolatedRawValue(element, value, `${language} ${label}`);
  }
});

test('actual profile comparison and application review isolate names and CV filenames without changing them', () => {
  const versions = phoneFragment(node => hasClass(node, 'phone-version-grid'));
  const reviewSource = declarations(read('app/phone/components.tsx'), ['reviewStateLabels', 'ReviewDetails']);
  for (const language of ['en', 'ar']) {
    const element = renderPhoneFragment(versions, language);
    assert.equal(assertIsolatedRawValue(element, 'أحمد (Alex) Example-17', `${language} profile comparison name`), 2);
    assert.equal(assertIsolatedRawValue(element, mixedFile, `${language} profile comparison CV`), 2);
    const ReviewDetails = execute(`${reviewSource}\nexports.ReviewDetails = ReviewDetails;`, {
      useI18n: () => ({ language, t: translator(language) }),
    }).ReviewDetails;
    const review = React.createElement(ReviewDetails, { plan: { items: [{
      jobId: 'synthetic-review-bidi', state: 'ready', reason: '', title: mixedJob.title, company: mixedJob.company,
      job: { url: mixedJob.url }, payloadSummary: { name: 'أحمد (Alex) Example-17', email: 'synthetic+ar@example.org', comments: '' },
      resume: { name: mixedFile }, privacyPolicyUrl: null,
    }] } });
    assertIsolatedRawValue(review, mixedFile, `${language} reviewed CV filename`);
  }
});

test('actual search inputs preserve mixed-script draft text with automatic direction', () => {
  const inputs = [];
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(phoneTree) === 'input') {
      const value = node.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.text === 'value');
      if (value?.initializer && ts.isJsxExpression(value.initializer)
        && ['filters.query', 'filters.location'].includes(value.initializer.expression?.getText(phoneTree))) inputs.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(phoneTree); assert.equal(inputs.length, 2);
  for (const language of ['en', 'ar']) for (const input of inputs) {
    const filters = { query: mixedJob.title, location: mixedJob.location };
    const View = execute(`exports.View = () => (${input.getText(phoneTree)});`, { t: translator(language), filters }).View;
    const element = View();
    assert.equal(element.props.dir, 'auto');
    assert([mixedJob.title, mixedJob.location].includes(element.props.value));
    assert(renderToStaticMarkup(element).includes('dir="auto"'));
  }
});
