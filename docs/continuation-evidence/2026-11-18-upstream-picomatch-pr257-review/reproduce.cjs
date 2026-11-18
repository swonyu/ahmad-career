// Evidence-only, bounded semantic comparison. Run with two audited local package directories.
// No network, install, writes, native builds or adversarial long-input execution.
'use strict';
const assert = require('node:assert/strict');
const [baselinePath, candidatePath] = process.argv.slice(2);
if (!baselinePath || !candidatePath) throw Error('Supply baseline and PR-patched picomatch directories.');
const baseline = require(baselinePath);
const candidate = require(candidatePath);
const cases = [
  ['+(*a)', 'aa'], ['+(*a)', 'aba'], ['+(*a|*b)', 'ba'],
  ['*(*a)', 'aa'], ['+(*b)', 'bbb']
];
let captureDifferences = 0;
for (const [pattern, input] of cases) {
  for (const capture of [false, true]) {
    const oldResult = baseline.makeRe(pattern, {capture}).exec(input);
    const newResult = candidate.makeRe(pattern, {capture}).exec(input);
    assert.equal(Boolean(oldResult), Boolean(newResult), 'Short-input match behavior changed');
    if (JSON.stringify(oldResult?.slice(0, 5)) !== JSON.stringify(newResult?.slice(0, 5))) {
      assert.equal(capture, true, 'Unexpected non-capture result change');
      captureDifferences++;
    }
    process.stdout.write(JSON.stringify({pattern, input, capture,
      baseline: oldResult?.slice(0,5) ?? null, patched: newResult?.slice(0,5) ?? null})+'\n');
  }
}
assert.equal(captureDifferences, 4, 'Capture semantics are expected to differ in four bounded cases');
process.stderr.write('Bounded cases complete: 10 comparisons; 4 capture shape/value differences, 0 match-boolean differences.\n');
