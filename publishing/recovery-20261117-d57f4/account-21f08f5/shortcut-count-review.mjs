import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const repository = process.argv[2];
assert(repository && path.isAbsolute(repository), 'An absolute isolated checkout path is required');
const harnessURL = pathToFileURL(path.join(repository, 'hosted/tests/phone-localization.mjs')).href;
const appBaseURL = pathToFileURL(path.join(repository, 'hosted') + '/').href;
const React = createRequire(harnessURL)('react');
const { renderToStaticMarkup } = createRequire(harnessURL)('react-dom/server');
let harness = fs.readFileSync(new URL(harnessURL), 'utf8');
function replaceOnce(before, after) {
  assert.equal(harness.split(before).length, 2, `Expected one harness anchor: ${before}`);
  harness = harness.replace(before, after);
}
// Reuse the existing render helpers in memory, without registering or running
// their test suite and without changing either test or production source files.
replaceOnce("import { test } from 'node:test';", 'const test = () => {};');
replaceOnce('createRequire(import.meta.url)', `createRequire(${JSON.stringify(harnessURL)})`);
replaceOnce("const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');",
  `const read = file => fs.readFileSync(new URL(file, ${JSON.stringify(appBaseURL)}), 'utf8');`);
harness += '\nexport { renderPhoneFragment, phoneFragment, hasClass, renderedElements, allText };';
const helpers = await import(`data:text/javascript;base64,${Buffer.from(harness).toString('base64')}`);
const { renderPhoneFragment, phoneFragment, hasClass, renderedElements, allText } = helpers;
const fragment = phoneFragment(node => hasClass(node, 'workspace-shortcuts'));
const cases = [];
for (const language of ['en', 'ar']) for (const [count, englishNumber, arabicNumber] of [
  [0, '0', '٠'], [1, '1', '١'], [2, '2', '٢'], [12, '12', '١٢'], [200, '200', '٢٠٠'],
]) {
  const navigations = [];
  const expectedNumber = language === 'en' ? englishNumber : arabicNumber;
  const expectedLabel = language === 'en'
    ? count === 1 ? 'Saved job' : 'Saved jobs'
    : count === 1 ? 'وظيفة محفوظة' : 'الوظائف المحفوظة';
  const entry = { language, count, expectedNumber, expectedLabel };
  try {
    const element = renderPhoneFragment(fragment, language, {
      jobs: Array.from({ length: count }, (_, index) => ({ id: `synthetic-saved-${index}` })),
      ready: true, navigate: value => navigations.push(value), ArrowRight: () => null,
    });
    assert.equal(element.type, 'div'); assert.equal(element.props.className, 'workspace-shortcuts');
    const buttons = renderedElements(element, node => node.type === 'button');
    assert.equal(buttons.length, 2);
    const button = buttons[0], contents = React.Children.toArray(button.props.children);
    entry.ariaLabel = button.props['aria-label'] ?? null;
    assert.equal(button.props['aria-label'], undefined, 'The existing content-derived accessible name must remain');
    assert.equal(contents.length, 2); assert.equal(contents[0].type, 'span');
    assert.equal(contents[1].props['aria-hidden'], 'true'); assert.equal(contents[1].props.size, 18);
    const textParts = React.Children.toArray(contents[0].props.children);
    assert.equal(textParts.length, 2); assert.equal(textParts[0].type, 'strong');
    entry.actualNumber = textParts[0].props.children;
    entry.actualLabel = textParts[1];
    entry.contentText = allText(button);
    entry.renderedMarkup = renderToStaticMarkup(button);
    button.props.onClick(); buttons[1].props.onClick();
    assert.deepEqual(navigations, ['saved', 'profile']);
    entry.navigations = navigations;
    assert.equal(entry.actualNumber, expectedNumber);
    assert.equal(entry.actualLabel, expectedLabel);
    entry.passed = true;
  } catch (error) {
    entry.passed = false;
    entry.error = error.message;
  }
  cases.push(entry);
}
const failed = cases.filter(entry => !entry.passed).length;
process.stdout.write(JSON.stringify({ kind: 'ad-hoc actual render review; no test registration', cases: cases.length, passed: cases.length - failed, failed, results: cases }, null, 2) + '\n');
process.exitCode = failed ? 1 : 0;
