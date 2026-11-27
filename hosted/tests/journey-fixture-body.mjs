import assert from 'node:assert/strict';
import {readFixtureBody} from './fixtures/journey-browser/harness.mjs';

const original = {firstName: 'متقدم افتراضي', city: 'عمّان', note: 'Fictional متابعة — 🧪 synthetic only'};
const json = JSON.stringify(original), bytes = Buffer.from(json, 'utf8');
async function* stream(chunks) {yield* chunks;}
for (let cut = 0; cut <= bytes.length; cut++) {
  assert.equal(await readFixtureBody(stream([bytes.subarray(0, cut), bytes.subarray(cut)])), json);
}
assert.deepEqual(JSON.parse(await readFixtureBody(stream([...bytes].map(byte => Buffer.from([byte]))))), original);
assert.equal(await readFixtureBody(stream([bytes]), bytes.length), json);
await assert.rejects(readFixtureBody(stream([bytes.subarray(0, bytes.length - 1), bytes.subarray(-1)]), bytes.length - 1), {code: 'fixture_body_too_large'});
await assert.rejects(readFixtureBody(stream([Buffer.from([0xc3]), Buffer.from([0x28])])), {code: 'fixture_body_invalid_utf8'});
assert.equal(await readFixtureBody(stream([]), 0), '');
console.log(JSON.stringify({passed: true, splitPositionsChecked: bytes.length + 1, singleByteChunks: bytes.length, exactByteLimit: true, overLimitRejected: true, malformedUTF8Rejected: true, emptyBody: true, scope: 'Actual synthetic HTTP bridge body reader only; no worker, browser or network activity'}));
