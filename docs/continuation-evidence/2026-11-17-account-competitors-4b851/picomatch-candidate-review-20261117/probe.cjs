'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const [mode, version, variant, caseId] = process.argv.slice(2);
const root = __dirname;
function load(which) {
  return require(path.join(root, which, version, 'index.js'));
}
function result(pm, pattern, input, options) {
  const match = pm.makeRe(pattern, options).exec(input);
  return { isMatch: pm.isMatch(input, pattern, options), capture: match ? Array.from(match) : null };
}
function fail(kind, detail) {
  console.log(JSON.stringify({ status: 'fail', kind, version, detail }));
  process.exit(1);
}
if (mode === 'semantics') {
  const baseline = load('baseline');
  const candidate = load('candidate');
  const required = [
    ['+(*)c', 'abc', true],
    ['+(*a)', 'aaa', true],
    ['+(*a)', 'ab', false],
    ['+(a*b)', 'axbayb', true],
    ['+(a*b)', 'axbay', false],
    ['*(*.js)', 'foo.js', true],
    ['*(*.js)', 'foo.ts', false],
  ];
  for (const [pattern, input, expected] of required) {
    const before = baseline.isMatch(input, pattern);
    const after = candidate.isMatch(input, pattern);
    if (before !== expected || after !== expected) fail('required-semantic', { pattern, input, expected, baseline: before, candidate: after });
  }
  const cases = [
    ['+(*)c', 'abc'], ['+(*)c', 'ab'], ['+(*)c', '.abc'],
    ['+(*a)', 'aaa'], ['+(*a)', 'ab'], ['+(*a)', 'a.a'],
    ['*(*a)', ''], ['*(*a)', 'a'], ['*(*a)', 'b'],
    ['+(a*b)', 'axbayb'], ['+(a*b)', 'axbay'],
    ['*(*.js)', 'foo.js'], ['*(*.js)', 'foo.ts'],
    ['x+(*a)y', 'xaay'], ['x+(*a)y', 'xaby'],
    ['+(a*)c', 'aaac'], ['+(a*)c', 'aaab'],
    ['+("*"a)', '*a*a'], ['+("*"a)', '*a'],
    ["+('*'a)", "'*'a'*'a"],
    ['+(\\*a)', '*a*a'], ['+(\\*a)', 'aaa'],
    ['+(*a)', 'a/b/a'], ['+(*a)', 'a\\b\\a'],
    ['+(*a)', '.a'], ['+(*a)', 'A'],
    ['+([ab]*)c', 'ababc'], ['+(?*a)', 'aaa'],
    ['+(*a|b)', 'aab'], ['+(*(a))', 'aaa'],
    ['+(**a)', 'a/a'], ['+(a', '+(a'],
  ];
  const optionSets = [
    {}, { dot: true }, { windows: true }, { bash: true },
    { capture: true }, { contains: true }, { nocase: true },
    { noextglob: true }, { maxExtglobRecursion: false },
  ];
  let comparisons = 0;
  const started = performance.now();
  for (const options of optionSets) {
    for (const [pattern, input] of cases) {
      const before = result(baseline, pattern, input, options);
      const after = result(candidate, pattern, input, options);
      comparisons++;
      try { assert.deepStrictEqual(after, before); }
      catch { fail('compatibility', { pattern, input, options, baseline: before, candidate: after, comparisons }); }
    }
  }
  console.log(JSON.stringify({ status: 'pass', kind: 'short-semantics', version, requiredCases: required.length, comparisons, maxInputLength: Math.max(...cases.map(x => x[1].length)), elapsedMs: performance.now() - started }));
} else if (mode === 'probe') {
  const cases = {
    'simple-leading-star': { pattern: '+(*a)', input: 'a'.repeat(30) + 'b', options: {} },
    'simple-optional-star': { pattern: '*(*a)', input: 'a'.repeat(30) + 'b', options: {} },
    'simple-suffix': { pattern: '+(*)c', input: 'a'.repeat(30) + 'b', options: {} },
    'literal-prefix': { pattern: '+(a*)c', input: 'a'.repeat(30) + 'b', options: {} },
    'capture-residual': { pattern: '+(*a)', input: 'a'.repeat(30) + 'b', options: { capture: true } },
  };
  const test = cases[caseId];
  if (!test) fail('harness', { message: 'Unknown probe' });
  const pm = load(variant);
  const expression = pm.makeRe(test.pattern, test.options).source;
  const started = performance.now();
  const actual = pm.isMatch(test.input, test.pattern, test.options);
  if (actual !== false) fail('probe-correctness', { caseId, actual, expression });
  console.log(JSON.stringify({ status: 'pass', kind: 'bounded-probe', version, variant, caseId, inputLength: test.input.length, options: test.options, expression, elapsedMs: performance.now() - started, actual }));
} else fail('harness', { message: 'Unknown mode' });
