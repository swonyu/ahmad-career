import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {createScreenshotCollector, inspectPNG, REQUIRED_SCREENSHOTS} from './screenshot-evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const preview = 'com.saleh.careerfinder.preview';
const acceptance = 'com.saleh.careerfinder.acceptance';
const commit = 'a'.repeat(40);
function chunk(type, data = Buffer.alloc(0)) {
  const bytes = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0); bytes.copy(result, 4);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}
const signature = Buffer.from('89504e470d0a1a0a', 'hex');
const scanline = Buffer.from([0, 255, 0, 0, 255]); // One real, opaque red RGBA pixel.
function fixturePNG({width = 1, height = 1, data = scanline, includeIDAT = true,
  compressed = deflateSync(data), interlace = 0} = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6; header[12] = interlace;
  return Buffer.concat([signature, chunk('IHDR', header),
    ...(includeIDAT ? [chunk('IDAT', compressed)] : []), chunk('IEND')]);
}
const png = fixturePNG();
const totalRequired = Object.values(REQUIRED_SCREENSHOTS).reduce((sum, paths) => sum + paths.length, 0);

function setup(t, read = async () => png, options = {}) {
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'career-screenshot-fixture-'));
  t.after(() => fs.rmSync(evidence, {recursive: true, force: true}));
  const calls = [];
  const collector = createScreenshotCollector({evidence, device: 'fixture-no-device', commit,
    readScreenshot: async (packageName, remotePath, timeout) => {
      calls.push({packageName, remotePath, timeout});
      return read(packageName, remotePath, timeout);
    }, ...options});
  return {evidence, calls, collector,
    manifest: () => JSON.parse(fs.readFileSync(path.join(evidence, 'screenshots.json'), 'utf8'))};
}
async function collectBoth(collector) {
  await collector.collect(preview, {phase: 'ordinary-phone'});
  await collector.collect(acceptance, {phase: 'native-https-phone'});
}

test('required paths match the actual success captures declared by the instrumentation source', () => {
  const source = name => fs.readFileSync(path.join(root,
    'android/app/src/androidTest/java/com/saleh/careerfinder', name), 'utf8');
  const declarations = [
    ['NavigationPhoneAcceptanceTest.kt', 'cache/navigation-review-evidence', /\bcapture\("([a-z0-9-]+)"\)/g],
    ['LinkedInPhoneAcceptanceTest.kt', 'cache/linkedin-review-evidence', /\bcapture\("([a-z0-9-]+)"\)/g],
    ['PhonePolishAcceptanceTest.kt', 'cache/strict-review-evidence', /\bcaptureConfirmation\("([a-z0-9-]+)"\)/g],
  ];
  const previewPaths = declarations.flatMap(([file, directory, pattern]) => {
    const names = [...source(file).matchAll(pattern)].map(match => directory + '/' + match[1] + '.png');
    assert.ok(names.length > 0, 'The instrumentation capture declarations must remain discoverable.');
    return names;
  });
  previewPaths.push(...[...source('WorkspaceAccessibilityRegressionTest.kt')
    .matchAll(/java\.io\.File\(directory,\s*"([a-z0-9-]+\.png)"\)/g)]
    .map(match => 'cache/strict-review-evidence/' + match[1]));
  const acceptancePaths = [...source('NativeHttpsAcceptanceTest.kt')
    .matchAll(/\bcapture\("(acceptance-[a-z0-9-]+\.png)"/g)]
    .map(match => 'files/' + match[1])
    .filter(file => file !== 'files/acceptance-native-failure.png');
  assert.deepEqual([...REQUIRED_SCREENSHOTS[preview]].sort(), previewPaths.sort());
  assert.deepEqual([...REQUIRED_SCREENSHOTS[acceptance]].sort(), acceptancePaths.sort());
  assert.equal(new Set(previewPaths).size, previewPaths.length);
  assert.equal(new Set(acceptancePaths).size, acceptancePaths.length);
});

test('both phases require retained PNG bytes and fingerprints before capture verification succeeds', async t => {
  const {collector, calls, evidence, manifest} = setup(t);
  await collector.collect(preview, {phase: 'ordinary-phone'});
  const first = collector.verify();
  assert.equal(first.result, 'failed');
  assert.equal(first.capturedRequiredCaptures, REQUIRED_SCREENSHOTS[preview].length);
  assert.deepEqual(first.missing.map(item => item.packageName), REQUIRED_SCREENSHOTS[acceptance].map(() => acceptance));
  const early = manifest().captures.map(item => ({file: item.file, sha256: item.sha256}));
  await collector.collect(acceptance, {phase: 'native-https-phone'});
  const complete = collector.verify();
  assert.equal(complete.result, 'captured');
  assert.equal(complete.capturedRequiredCaptures, totalRequired);
  assert.equal(calls.length, totalRequired);
  assert.ok(calls.every(call => call.timeout > 0 && call.timeout <= 15_000));
  assert.equal(manifest().commit, commit);
  for (const capture of manifest().captures) {
    assert.equal(capture.sha256, createHash('sha256').update(fs.readFileSync(path.join(evidence, capture.file))).digest('hex'));
  }
  for (const capture of early) assert.ok(manifest().captures.some(item => item.file === capture.file && item.sha256 === capture.sha256));
  await collectBoth(collector);
  assert.equal(calls.length, totalRequired, 'Cleanup must not retry completed collection.');
});

test('transport loss after the preview phase preserves earlier images and exposes missing acceptance evidence', async t => {
  const {collector, calls, evidence, manifest} = setup(t, async packageName => {
    if (packageName === acceptance) throw Object.assign(Error('device offline'), {code: 'SCREENSHOT_DEVICE_UNAVAILABLE'});
    return png;
  });
  await collectBoth(collector);
  const result = collector.verify();
  assert.equal(result.result, 'failed');
  assert.equal(result.capturedRequiredCaptures, REQUIRED_SCREENSHOTS[preview].length);
  assert.equal(calls.filter(call => call.packageName === acceptance).length, 1);
  assert.ok(manifest().unavailable.some(item => item.attempted === false));
  for (const capture of manifest().captures) assert.deepEqual(fs.readFileSync(path.join(evidence, capture.file)), png);
  await collectBoth(collector);
  assert.equal(calls.filter(call => call.packageName === acceptance).length, 1, 'A failed transport must not be retried during cleanup.');
});

test('a single absent required PNG fails capture verification while the other paths remain available', async t => {
  const missing = REQUIRED_SCREENSHOTS[preview][2];
  const {collector, calls, manifest} = setup(t, async (packageName, remotePath) => {
    if (remotePath === missing) throw Object.assign(Error('No such file'), {code: 'ENOENT'});
    return png;
  });
  await collectBoth(collector);
  const result = collector.verify();
  assert.equal(result.result, 'failed');
  assert.equal(result.capturedRequiredCaptures, totalRequired - 1);
  assert.deepEqual(result.missing, [{packageName: preview, remotePath: missing}]);
  assert.equal(calls.length, totalRequired);
  assert.equal(manifest().unavailable.length, 1);
});

test('truncated PNGs never enter the retained-capture manifest', async t => {
  const damaged = REQUIRED_SCREENSHOTS[acceptance][0];
  const {collector, manifest} = setup(t, async (packageName, remotePath) => remotePath === damaged ? png.subarray(0, png.length - 8) : png);
  await collectBoth(collector);
  assert.equal(collector.verify().result, 'failed');
  assert.equal(manifest().captures.length, totalRequired - 1);
  assert.ok(manifest().unavailable.some(item => item.remotePath === damaged && /incomplete/.test(item.reason)));
});

test('a changed or missing retained file invalidates its recorded fingerprint at the final gate', async t => {
  const {collector, evidence, manifest} = setup(t);
  await collectBoth(collector);
  const capture = manifest().captures[0], altered = Buffer.from(png);
  altered[altered.length - 20] ^= 1;
  fs.writeFileSync(path.join(evidence, capture.file), altered);
  let result = collector.verify();
  assert.equal(result.result, 'failed');
  assert.equal(result.invalid.length, 1);
  assert.match(result.invalid[0].reason, /CRC|fingerprint/);
  fs.unlinkSync(path.join(evidence, capture.file));
  result = collector.verify();
  assert.equal(result.invalid.length, 1);
});

test('the phase read budget prevents repeated attempts after a stalled transport', async t => {
  let time = 0;
  const {collector, calls, manifest} = setup(t, async () => {
    time = 60_001;
    return png;
  }, {milliseconds: () => time});
  await collector.collect(preview, {phase: 'ordinary-phone'});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].timeout, 15_000);
  assert.equal(manifest().unavailable.length, REQUIRED_SCREENSHOTS[preview].length - 1);
  assert.ok(manifest().unavailable.every(item => item.attempted === false));
  assert.equal(collector.verify().result, 'failed');
});

test('a screenshot timeout stops that phase without extending or retrying the read', async t => {
  const {collector, calls, manifest} = setup(t, async () => {
    throw Object.assign(Error('fifteen-second limit'), {code: 'SCREENSHOT_READ_TIMEOUT'});
  });
  await collector.collect(preview, {phase: 'ordinary-phone'});
  await collector.collect(preview, {phase: 'failure-or-cleanup'});
  assert.equal(calls.length, 1);
  assert.equal(manifest().captures.length, 0);
  assert.equal(collector.verify().capturedRequiredCaptures, 0);
});

test('existing files and unknown packages cannot satisfy or widen the evidence scope', async t => {
  const {collector, evidence, calls} = setup(t);
  const oldPath = path.join(evidence, 'captures', preview, REQUIRED_SCREENSHOTS[preview][0]);
  fs.mkdirSync(path.dirname(oldPath), {recursive: true});
  fs.writeFileSync(oldPath, png);
  assert.equal(collector.verify().capturedRequiredCaptures, 0, 'Prior files are not evidence from this collector/source run.');
  await assert.rejects(() => collector.collect('com.example.real-account', {phase: 'invalid'}), /isolated test packages/);
  assert.equal(calls.length, 0);
});

test('the explicit failure PNG is optional and does not replace any required success capture', async t => {
  const {collector, calls, manifest} = setup(t);
  await collector.collect(preview, {phase: 'ordinary-phone'});
  await collector.collect(acceptance, {phase: 'failure-or-cleanup', includeFailure: true});
  const result = collector.verify();
  assert.equal(result.result, 'captured');
  assert.equal(result.expectedRequiredCaptures, totalRequired);
  assert.equal(result.capturedRequiredCaptures, totalRequired);
  assert.equal(calls.length, totalRequired + 1);
  assert.equal(manifest().captures.filter(item => item.required === false).length, 1);
  assert.ok(calls.every(call => REQUIRED_SCREENSHOTS[call.packageName].includes(call.remotePath) ||
    call.packageName === acceptance && call.remotePath === 'files/acceptance-native-failure.png'));
});

test('PNG signature, bounds, dimensions and completion are checked', () => {
  assert.deepEqual(inspectPNG(png), {width: 1, height: 1});
  assert.throws(() => inspectPNG(Buffer.from('not a PNG')), /bounded PNG/);
  assert.throws(() => inspectPNG(Buffer.alloc(16 * 1024 * 1024 + 1)), /bounded PNG/);
  const badSignature = Buffer.from(png); badSignature[0] = 0;
  assert.throws(() => inspectPNG(badSignature), /not a PNG/);
  const tooWide = fixturePNG({width: 8193});
  assert.throws(() => inspectPNG(tooWide), /dimensions/);
  assert.throws(() => inspectPNG(png.subarray(0, png.length - 1)), /incomplete/);
});

test('header-only and corrupt-IDAT files cannot produce a successful capture gate', async t => {
  for (const invalid of [fixturePNG({includeIDAT: false}), fixturePNG({compressed: Buffer.from([1, 2, 3])})]) {
    const {collector, manifest} = setup(t, async () => invalid);
    await collectBoth(collector);
    const result = collector.verify();
    assert.equal(result.result, 'failed');
    assert.equal(result.capturedRequiredCaptures, 0);
    assert.equal(result.missing.length, totalRequired);
    assert.equal(manifest().captures.length, 0);
    assert.equal(manifest().unavailable.length, totalRequired);
  }
});

test('PNG chunk integrity and bounded decoded scanlines are required before bytes count as an image', () => {
  assert.throws(() => inspectPNG(fixturePNG({includeIDAT: false})), /no IDAT/);
  const corruptCRC = Buffer.from(png); corruptCRC[corruptCRC.length - 17] ^= 1;
  assert.throws(() => inspectPNG(corruptCRC), /CRC/);
  const chunkOverflow = Buffer.from(png); chunkOverflow.writeUInt32BE(0xffffffff, 8);
  assert.throws(() => inspectPNG(chunkOverflow), /incomplete/);
  assert.throws(() => inspectPNG(fixturePNG({compressed: Buffer.from([1, 2, 3])})));
  assert.throws(() => inspectPNG(fixturePNG({data: Buffer.from([0, 255])})), /scanline data/);
  assert.throws(() => inspectPNG(fixturePNG({data: Buffer.alloc(6)})), /larger than|size|length|output|buffer/i);
  assert.throws(() => inspectPNG(fixturePNG({data: Buffer.from([5, 255, 0, 0, 255])})), /filter/);
  assert.throws(() => inspectPNG(fixturePNG({width: 8192, height: 8192})), /decoded PNG/);
  assert.throws(() => inspectPNG(fixturePNG({interlace: 1})), /non-interlaced/);
  assert.throws(() => inspectPNG(Buffer.concat([png, Buffer.from([0])])), /trailing/);
  const compressed = deflateSync(scanline);
  const nonConsecutive = Buffer.concat([png.subarray(0, 33), chunk('IDAT', compressed.subarray(0, 3)),
    chunk('tEXt'), chunk('IDAT', compressed.subarray(3)), chunk('IEND')]);
  assert.throws(() => inspectPNG(nonConsecutive), /consecutive/);
});
