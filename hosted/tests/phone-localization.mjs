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
