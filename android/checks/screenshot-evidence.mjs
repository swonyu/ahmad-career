import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';

// These are the success captures emitted by the current instrumentation classes.
// Only these PNGs, plus the explicit acceptance failure PNG, may leave the apps.
export const REQUIRED_SCREENSHOTS = Object.freeze({
  'com.saleh.careerfinder.preview': Object.freeze([
    'cache/navigation-review-evidence/custom-connection-address.png',
    'cache/navigation-review-evidence/previous-search-results.png',
    'cache/navigation-review-evidence/private-follow-up-list.png',
    'cache/navigation-review-evidence/private-record-correction.png',
    'cache/navigation-review-evidence/private-record-date-picker.png',
    'cache/navigation-review-evidence/private-record-editor.png',
    'cache/navigation-review-evidence/profile-role-shortcut.png',
    'cache/navigation-review-evidence/record-only-phone-import.png',
    'cache/navigation-review-evidence/settings-dark.png',
    'cache/navigation-review-evidence/settings-light.png',
    'cache/navigation-review-evidence/two-step-connection.png',
    'cache/linkedin-review-evidence/linkedin-exact-review.png',
    'cache/linkedin-review-evidence/linkedin-profile-guidance.png',
    'cache/linkedin-review-evidence/linkedin-search-handoff.png',
    'cache/strict-review-evidence/expanded-private-note-large-text.png',
    'cache/strict-review-evidence/profile-contact-copy.png',
    'cache/strict-review-evidence/remove-local-opportunity-confirmation.png',
    'cache/strict-review-evidence/target-country-jp-draft-after-ime.png',
    'cache/strict-review-evidence/unfinished-opportunity-choices.png',
  ]),
  'com.saleh.careerfinder.acceptance': Object.freeze([
    'files/acceptance-profile-large-text.png',
    'files/acceptance-prepared.png',
    'files/acceptance-receipts.png',
  ]),
});
const failurePNG = 'files/acceptance-native-failure.png';
const maximumPNGBytes = 16 * 1024 * 1024;
const phaseBudgetMilliseconds = 60_000;
const readLimitMilliseconds = 15_000;

const maximumDecodedPNGBytes = 64 * 1024 * 1024;
const crcTable = Array.from({length: 256}, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255];
  return (value ^ 0xffffffff) >>> 0;
}

export function inspectPNG(png) {
  assert.ok(Buffer.isBuffer(png) && png.length >= 45 && png.length <= maximumPNGBytes,
    'The screenshot must be a bounded PNG.');
  assert.ok(png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
    'The captured file is not a PNG.');
  let offset = 8, header, palette = false, ended = false, imageDataEnded = false;
  const imageData = [];
  while (offset < png.length) {
    assert.ok(offset + 12 <= png.length, 'The PNG chunk is incomplete.');
    const length = png.readUInt32BE(offset), dataStart = offset + 8, dataEnd = dataStart + length;
    assert.ok(dataEnd + 4 <= png.length, 'The PNG chunk is incomplete.');
    const type = png.toString('latin1', offset + 4, dataStart);
    assert.match(type, /^[A-Za-z]{4}$/, 'The PNG chunk type is invalid.');
    assert.equal(crc32(png.subarray(offset + 4, dataEnd)), png.readUInt32BE(dataEnd),
      'The PNG chunk CRC is invalid.');
    const data = png.subarray(dataStart, dataEnd);
    if (!header) assert.equal(type, 'IHDR', 'A PNG must begin with its image header.');
    if (type === 'IHDR') {
      assert.ok(!header && offset === 8 && length === 13, 'The PNG image header is invalid.');
      const width = data.readUInt32BE(0), height = data.readUInt32BE(4);
      const depth = data[8], color = data[9];
      const depths = {0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16]};
      assert.ok(width > 0 && height > 0 && width <= 8192 && height <= 8192,
        'The screenshot dimensions are invalid.');
      assert.ok(depths[color]?.includes(depth), 'The PNG color format is invalid.');
      assert.ok(data[10] === 0 && data[11] === 0 && data[12] === 0,
        'Captures must use standard compression/filtering and non-interlaced PNG scanlines.');
      header = {width, height, depth, color};
    } else if (type === 'PLTE') {
      assert.ok(!palette && imageData.length === 0 && ![0, 4].includes(header.color) &&
        length > 0 && length <= 768 && length % 3 === 0, 'The PNG palette is invalid.');
      palette = true;
    } else if (type === 'IDAT') {
      assert.ok(!imageDataEnded, 'PNG image data chunks must be consecutive.');
      assert.ok(header.color !== 3 || palette, 'An indexed PNG requires its palette before image data.');
      imageData.push(data);
    } else if (type === 'IEND') {
      assert.equal(length, 0, 'The PNG ending is invalid.');
      assert.ok(imageData.length > 0, 'The PNG contains no IDAT pixel data.');
      ended = true;
    } else {
      assert.ok(type[0] === type[0].toLowerCase(), 'The PNG contains an unsupported critical chunk.');
      if (imageData.length) imageDataEnded = true;
    }
    offset = dataEnd + 4;
    if (ended) break;
  }
  assert.ok(ended && offset === png.length, 'The screenshot is incomplete or has trailing chunks.');
  const channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[header.color];
  const rowBytes = Math.ceil(header.width * channels * header.depth / 8);
  const decodedBytes = (rowBytes + 1) * header.height;
  assert.ok(decodedBytes <= maximumDecodedPNGBytes, 'The decoded PNG exceeds its bounded size.');
  const compressed = Buffer.concat(imageData);
  assert.ok(compressed.length > 0, 'The PNG contains no compressed pixel data.');
  const decoded = inflateSync(compressed, {maxOutputLength: decodedBytes});
  assert.equal(decoded.length, decodedBytes, 'The PNG scanline data is incomplete.');
  for (let row = 0; row < header.height; row++)
    assert.ok(decoded[row * (rowBytes + 1)] <= 4, 'The PNG scanline filter is invalid.');
  return {width: header.width, height: header.height};
}

export function createScreenshotCollector({evidence, device, commit, readScreenshot,
  milliseconds = () => performance.now(), now = () => new Date().toISOString()}) {
  assert.equal(typeof readScreenshot, 'function');
  assert.match(commit, /^[a-f0-9]{40}$/, 'Screenshot evidence requires the exact source commit.');
  const required = Object.entries(REQUIRED_SCREENSHOTS).flatMap(([packageName, paths]) =>
    paths.map(remotePath => ({packageName, remotePath})));
  const key = ({packageName, remotePath}) => packageName + '/' + remotePath;
  const settled = new Set(), captures = new Map();
  const report = {commit, observedAt: now(), device, required, captures: [], unavailable: [], phases: []};
  fs.mkdirSync(evidence, {recursive: true});
  const persist = () => {
    report.updatedAt = now();
    report.captures = [...captures.values()];
    fs.writeFileSync(path.join(evidence, 'screenshots.json'), JSON.stringify(report, null, 2));
  };
  persist();

  async function collect(packageName, {phase, includeFailure = false} = {}) {
    assert.ok(Object.hasOwn(REQUIRED_SCREENSHOTS, packageName), 'Only the isolated test packages may be read.');
    assert.equal(typeof phase, 'string');
    const paths = [...REQUIRED_SCREENSHOTS[packageName]];
    if (includeFailure && packageName === 'com.saleh.careerfinder.acceptance') paths.push(failurePNG);
    const pending = paths.filter(remotePath => !settled.has(key({packageName, remotePath})));
    if (pending.length === 0) return;
    const phaseRecord = {phase, packageName, startedAt: now(), completedAt: null};
    report.phases.push(phaseRecord);
    const started = milliseconds();
    let stoppedReason;
    for (const remotePath of pending) {
      const item = {packageName, remotePath};
      const required = remotePath !== failurePNG;
      settled.add(key(item)); // One bounded attempt; final cleanup must not retry stalled reads.
      const remaining = phaseBudgetMilliseconds - (milliseconds() - started);
      if (remaining <= 0) stoppedReason ??= 'The phase screenshot read budget was exhausted.';
      if (stoppedReason) {
        report.unavailable.push({...item, phase, required, attempted: false, reason: stoppedReason});
        persist();
        continue;
      }
      try {
        const png = await readScreenshot(packageName, remotePath, Math.min(readLimitMilliseconds, remaining));
        const {width, height} = inspectPNG(png);
        const file = path.join('captures', packageName, remotePath);
        const destination = path.join(evidence, file);
        fs.mkdirSync(path.dirname(destination), {recursive: true});
        fs.writeFileSync(destination, png);
        captures.set(key(item), {...item, phase, required, file, bytes: png.length, width, height,
          sha256: createHash('sha256').update(png).digest('hex')});
      } catch (error) {
        const reason = String(error.message ?? error).slice(0, 2000);
        report.unavailable.push({...item, phase, required, attempted: true, reason});
        if (['SCREENSHOT_READ_TIMEOUT', 'SCREENSHOT_DEVICE_UNAVAILABLE'].includes(error.code))
          stoppedReason = 'Collection stopped after the screenshot transport became unavailable.';
      }
      persist(); // Preserve earlier phases even if the device or a later phase fails.
    }
    phaseRecord.completedAt = now();
    persist();
  }

  function verify() {
    const missing = [], invalid = [];
    for (const item of required) {
      const capture = captures.get(key(item));
      if (!capture) { missing.push(item); continue; }
      try {
        const png = fs.readFileSync(path.join(evidence, capture.file));
        const size = inspectPNG(png);
        assert.equal(png.length, capture.bytes);
        assert.equal(size.width, capture.width); assert.equal(size.height, capture.height);
        assert.equal(createHash('sha256').update(png).digest('hex'), capture.sha256,
          'The retained PNG does not match its capture fingerprint.');
      } catch (error) { invalid.push({...item, reason: String(error.message ?? error).slice(0, 2000)}); }
    }
    const verification = {
      result: missing.length === 0 && invalid.length === 0 ? 'captured' : 'failed',
      expectedRequiredCaptures: required.length,
      capturedRequiredCaptures: required.length - missing.length - invalid.length,
      missing, invalid,
      visualReview: 'These are retained image bytes; human visual acceptance is separate.',
    };
    report.verification = verification;
    persist();
    return verification;
  }

  return {collect, verify};
}
