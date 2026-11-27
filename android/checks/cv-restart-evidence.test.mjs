import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {
  RESTART_CLASS, RESTART_METHODS, RESTART_CAPTURES, partitionRestartClasses,
  assertSingleRestartExecution, restartOriginalNames, validateRestartMarker,
  validateRestartPhaseOriginals, createRestartEvidenceCollector, requireShellV2Features, parseOwnedPackagePids, parseOwnedProcessTable,
} from './cv-restart-evidence.mjs';

const namespace = 'cv-restart-' + 'a'.repeat(32), commit = 'b'.repeat(40);
const context = phase => ({phase, namespace, commit});
const source = Object.values(RESTART_METHODS).map(name => '@Test fun ' + name + '() {}').join('\n');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value));
const clone = value => structuredClone(value);
const seedCalls = ['GET workspace', 'POST prepare', 'GET workspace', 'POST submit', 'GET workspace',
  'PUT profile', 'GET workspace', 'POST prepare', 'GET workspace', 'POST submit', 'GET workspace'];
const labels = {
  en: {confirmed: 'Test receipt · Confirmed', uncertain: 'Test receipt · Outcome uncertain', cancelled: 'Test receipt · Stopped'},
  ar: {confirmed: 'إيصال إرسال تجريبي · تم تأكيد الإرسال', uncertain: 'إيصال إرسال تجريبي · النتيجة غير مؤكدة',
    cancelled: 'إيصال إرسال تجريبي · متوقف'},
};
function markers() {
  const base = {schema: 1, namespace, sourceCommitClaimedByRunner: commit,
    allOutcomesSynthetic: true, verifiedLiveReceiptCount: 0,
    receiptA: {attemptId: 'cv-attempt-1', state: 'confirmed', evidenceMode: 'test',
      resumeName: 'CV-A.pdf', profileRevision: 1, resumeSHA256: '1'.repeat(64)},
    receiptB: {attemptId: 'cv-attempt-2', state: 'uncertain', evidenceMode: 'test',
      resumeName: 'CV-B.pdf', profileRevision: 2, resumeSHA256: '2'.repeat(64)},
    legacyReceipt: {attemptId: 'cv-legacy-no-evidence', state: 'cancelled', evidenceMode: 'test'},
    currentProfileFilename: 'CV-B.pdf', currentProfileRevision: 2, encryptedWorkspaceSHA256: 'c'.repeat(64)};
  const seed = {...clone(base), phase: 'seed', processID: 1234, processStartElapsedMillis: 100,
    invocationNonce: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', realModelTransitionsCompleted: true,
    serviceCalls: seedCalls, observedStatusLabels: []};
  const restore = {...clone(base), phase: 'restore', processID: 2345, processStartElapsedMillis: 200,
    invocationNonce: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', restoredWithoutSeedOrServiceResponse: true,
    seedProcessID: seed.processID, seedProcessStartElapsedMillis: seed.processStartElapsedMillis,
    serviceCalls: ['GET workspace'], observedStatusLabels: ['en', 'ar'].flatMap(language =>
      ['confirmed', 'uncertain', 'cancelled'].map(state => ({language,
        receiptID: {confirmed: 'cv-attempt-1', uncertain: 'cv-attempt-2', cancelled: 'cv-legacy-no-evidence'}[state],
        state, displayedLabel: labels[language][state], testMode: true, verified: false})))};
  return {seed, restore};
}
function crc(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]), size = Buffer.alloc(4), checksum = Buffer.alloc(4);
  size.writeUInt32BE(data.length); checksum.writeUInt32BE(crc(body));
  return Buffer.concat([size, body, checksum]);
}
// A real decodable fixture image; this is not human visual acceptance.
const header = Buffer.alloc(13);
header.writeUInt32BE(1080, 0); header.writeUInt32BE(1920, 4); header[8] = 8; header[9] = 2;
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
  chunk('IDAT', deflateSync(Buffer.alloc((1080 * 3 + 1) * 1920))), chunk('IEND', Buffer.alloc(0))]);
function target(stem) {
  if (stem.endsWith('prepared-status-banner')) return 'تم إعداد المراجعة. لم يُقدَّم أي طلب.';
  if (stem.endsWith('test-service-warning')) return 'خدمة اختبار: الطلبات وإيصالات الإرسال محاكاة.';
  if (stem.endsWith('historical-a')) return 'CV-A.pdf';
  if (stem.endsWith('current-b')) return 'CV-B.pdf';
  return labels[stem.includes('-ar-') ? 'ar' : 'en'][stem.split('-').at(-1)];
}
function originals(phase, marker) {
  const files = new Map([[phase === 'seed' ? 'seed-process.json' : 'restored-process.json', json(marker)]]);
  for (const stem of RESTART_CAPTURES[phase]) {
    const language = stem.includes('-ar-') ? 'ar' : 'en';
    const early = stem.includes('prepared-status-banner') || stem.includes('test-service-warning');
    const companion = stem.includes('prepared-status-banner');
    const data = {...clone(marker), language, fontScale: 1.8, layoutDirection: language === 'ar' ? 'Rtl' : 'Ltr',
      targetCount: 1, fullTargetBounds: [20, 400, 1000, 500], clippedTargetBounds: [20, 400, 1000, 500],
      listBounds: [0, 300, 1080, 1700], wholeTargetVisible: true, imeVisible: false,
      testScrolledTargetBeforeCapture: !early, companionRequired: companion, companionCount: companion ? 1 : 0,
      companionFullBounds: companion ? [20, 510, 120, 610] : null,
      companionClippedBounds: companion ? [20, 510, 120, 610] : null, wholeCompanionVisible: true,
      currentProfileFilename: early ? 'CV-A.pdf' : 'CV-B.pdf', currentProfileRevision: early ? 1 : 2,
      receiptMetadata: early ? [marker.legacyReceipt] : [marker.legacyReceipt, marker.receiptA, marker.receiptB],
      serviceCalls: early ? seedCalls.slice(0, 3) : marker.serviceCalls};
    const semantics = "ROOT 0\nPrinting with useUnmergedTree = 'true'\nNode #1 at (l=0.0, t=0.0, r=1080.0, b=1920.0)px\n" +
      " |-Node #2 at (l=20.0, t=400.0, r=1000.0, b=500.0)px, Tag: 'workspace-messages'\n" +
      " VerticalScrollAxisRange = 'ScrollAxisRange(value=0.0, maxValue=112.0, reverseScrolling=false)'\n" +
      " Text = '[" + target(stem) + "]'\n LiveRegion = 'Polite'\n ContentDescription = '[إخفاء الرسالة]'\n";
    files.set(stem + '.png', png); files.set(stem + '.json', json(data));
    files.set(stem + '-semantics.txt', Buffer.from(semantics));
  }
  return files;
}
function executionOutput(phase) {
  const fields = 'INSTRUMENTATION_STATUS: class=' + RESTART_CLASS + '\nINSTRUMENTATION_STATUS: current=1\n' +
    'INSTRUMENTATION_STATUS: numtests=1\nINSTRUMENTATION_STATUS: test=' + RESTART_METHODS[phase] + '\n';
  return fields + 'INSTRUMENTATION_STATUS_CODE: 1\n' + fields +
    'INSTRUMENTATION_STATUS_CODE: 0\nOK (1 test)\nINSTRUMENTATION_CODE: -1\n';
}
const execution = phase => assertSingleRestartExecution(executionOutput(phase), phase);
const boundary = {packageName: 'com.saleh.careerfinder.preview', forceStopCompleted: true,
  packagePidsBefore: [], packagePidsAfter: [], observedAt: '2026-01-01T00:00:00Z',
  seedPID: 1234, reinstallOrDataClearBetweenPhases: false};
function rig(overrides = {}) {
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'career-cv-restart-check-'));
  const proof = markers(), files = new Map([...originals('seed', proof.seed), ...originals('restore', proof.restore)]);
  const reads = [];
  const collector = createRestartEvidenceCollector({evidence, namespace, commit, device: 'emulator-owned',
    readOriginal: async remote => {
      reads.push(remote); const bytes = files.get(path.posix.basename(remote));
      assert.ok(bytes);
      return {bytes, remoteBytes: bytes.length, remoteSHA256Before: hash(bytes), remoteSHA256After: hash(bytes)};
    }, ...overrides});
  return {evidence, proof, files, reads, collector, close: () => fs.rmSync(evidence, {recursive: true, force: true})};
}
async function complete(r) {
  await r.collector.collect('seed', execution('seed'));
  r.collector.recordProcessBoundary(boundary);
  await r.collector.collect('restore', execution('restore'));
}
function mutateJSON(files, name, change) {
  const copy = new Map(files), value = JSON.parse(copy.get(name));
  change(value); copy.set(name, json(value)); return copy;
}

test('partition keeps every ordinary class and separately requires the two named restart methods', () => {
  const classes = ['com.saleh.careerfinder.WorkspaceSafetyRegressionTest', RESTART_CLASS,
    'com.saleh.careerfinder.NativeLocalizationAcceptanceTest'];
  const result = partitionRestartClasses(classes, source);
  assert.deepEqual(result.ordinary, [classes[0], classes[2]]);
  assert.deepEqual(result.methods, RESTART_METHODS);
});
test('missing or duplicate discovered classes cannot be hidden by set normalization', () => {
  assert.throws(() => partitionRestartClasses(['OrdinaryTest'], source));
  assert.throws(() => partitionRestartClasses([RESTART_CLASS, RESTART_CLASS], source));
  assert.throws(() => partitionRestartClasses(['OrdinaryTest', 'OrdinaryTest', RESTART_CLASS], source));
});
test('extra, missing and duplicated restart methods fail before native startup', () => {
  for (const bad of [source.split('\n')[0], source + '\n@Test fun extra() {}',
    source.replace(RESTART_METHODS.restore, RESTART_METHODS.seed)])
    assert.throws(() => partitionRestartClasses([RESTART_CLASS], bad));
});
test('the exact one-start one-pass Android runner form is accepted for each phase', () => {
  for (const phase of ['seed', 'restore']) assert.equal(execution(phase).method, RESTART_METHODS[phase]);
});
test('skipped, repeated, wrong or incomplete instrumentation cannot count as a phase pass', () => {
  const good = executionOutput('seed');
  for (const bad of [good.replace('CODE: 0', 'CODE: -3'), good + good,
    good.replaceAll(RESTART_METHODS.seed, RESTART_METHODS.restore),
    good.replaceAll(RESTART_CLASS, 'WrongClass'), good.replace('OK (1 test)', ''),
    good.replace('OK (1 test)', 'OK (2 tests)'), good.replace('CODE: 1', 'CODE: 2')])
    assert.throws(() => assertSingleRestartExecution(bad, 'seed'));
});
test('both markers preserve A, B, legacy absence and a different actual process', () => {
  const {seed, restore} = markers();
  assert.equal(validateRestartMarker(seed, context('seed')), seed);
  assert.equal(validateRestartMarker(restore, context('restore'), seed), restore);
});
test('source, namespace, phase and actual process identity are required', () => {
  const {seed} = markers();
  for (const change of [x => x.namespace = 'wrong', x => x.phase = 'restore',
    x => x.sourceCommitClaimedByRunner = '0'.repeat(40), x => x.processID = 0,
    x => x.processStartElapsedMillis = Infinity, x => x.invocationNonce = 'not-a-nonce']) {
    const bad = clone(seed); change(bad);
    assert.throws(() => validateRestartMarker(bad, context('seed')));
  }
});
test('same process, changed disk/history or successful restore data cannot pass', () => {
  const {seed, restore} = markers();
  for (const change of [x => x.processID = seed.processID,
    x => x.processStartElapsedMillis = seed.processStartElapsedMillis,
    x => x.invocationNonce = seed.invocationNonce, x => x.encryptedWorkspaceSHA256 = 'd'.repeat(64),
    x => x.receiptA.resumeName = 'CV-B.pdf', x => x.legacyReceipt.resumeName = 'invented.pdf',
    x => x.currentProfileFilename = 'CV-A.pdf', x => x.restoredWithoutSeedOrServiceResponse = false,
    x => x.serviceCalls.push('GET workspace'), x => x.observedStatusLabels[3].displayedLabel = 'Confirmed']) {
    const bad = clone(restore); change(bad);
    assert.throws(() => validateRestartMarker(bad, context('restore'), seed));
  }
});
test('the exact 13 seed and 31 restore originals validate separately', () => {
  const {seed, restore} = markers();
  assert.equal(validateRestartPhaseOriginals(originals('seed', seed), context('seed')).originalCount, 13);
  assert.equal(validateRestartPhaseOriginals(originals('restore', restore), context('restore'), seed).originalCount, 31);
});
test('a header placeholder, truncated PNG, malformed JSON or invalid UTF-8 is rejected', () => {
  const {seed} = markers(), good = originals('seed', seed), stem = RESTART_CAPTURES.seed[0];
  for (const [name, bad] of [[stem + '.png', png.subarray(0, 24)], [stem + '.png', png.subarray(0, png.length - 1)],
    [stem + '.json', Buffer.from('{')], [stem + '-semantics.txt', Buffer.from([0xff])]]) {
    const files = new Map(good); files.set(name, bad);
    assert.throws(() => validateRestartPhaseOriginals(files, context('seed')));
  }
});
test('whole target and Dismiss geometry is recalculated instead of trusting Boolean claims', () => {
  const {seed} = markers(), files = originals('seed', seed), name = RESTART_CAPTURES.seed[0] + '.json';
  for (const change of [x => x.fullTargetBounds = [20, 400, 20, 500],
    x => x.fullTargetBounds = [20, 400, 1100, 500], x => x.clippedTargetBounds[0] = 21,
    x => x.companionFullBounds = [20, 1600, 120, 1800], x => x.targetCount = 2,
    x => x.testScrolledTargetBeforeCapture = true, x => x.imeVisible = true])
    assert.throws(() => validateRestartPhaseOriginals(mutateJSON(files, name, change), context('seed')));
});
test('semantics stubs and a missing named target cannot count as companion evidence', () => {
  const {seed} = markers(), good = originals('seed', seed), name = RESTART_CAPTURES.seed[0] + '-semantics.txt';
  for (const bad of ['Application,', good.get(name).toString().replace(target(RESTART_CAPTURES.seed[0]), 'wrong target')]) {
    const files = new Map(good); files.set(name, Buffer.from(bad));
    assert.throws(() => validateRestartPhaseOriginals(files, context('seed')));
  }
});
test('missing and unexpected original filenames fail the exact inventory', () => {
  const {seed} = markers(), good = originals('seed', seed);
  const missing = new Map(good); missing.delete(RESTART_CAPTURES.seed[0] + '.png');
  const extra = new Map(good); extra.set('unapproved.txt', Buffer.from('no'));
  assert.throws(() => validateRestartPhaseOriginals(missing, context('seed')));
  assert.throws(() => validateRestartPhaseOriginals(extra, context('seed')));
});
test('collector requires both methods, an explicit boundary and all 44 retained originals', async () => {
  const r = rig();
  try {
    await complete(r);
    assert.deepEqual(r.collector.verify(), {result: 'passed', expectedOriginals: 44,
      verifiedOriginals: 44, verifiedPNGs: 14, manifest: 'cv-restart.json'});
    assert.equal(r.reads.length, 44);
    const report = JSON.parse(fs.readFileSync(path.join(r.evidence, 'cv-restart.json')));
    assert.equal(report.explicitProcessBoundary.seedProcessStillPresentBeforeExplicitStop, false);
  } finally {r.close()}
});
test('restore cannot bypass seed or the explicit force-stop/no-PID boundary', async () => {
  const r = rig();
  try {
    await assert.rejects(r.collector.collect('restore', execution('restore')));
    await r.collector.collect('seed', execution('seed'));
    await assert.rejects(r.collector.collect('restore', execution('restore')));
    assert.throws(() => r.collector.recordProcessBoundary({...boundary, packagePidsAfter: [1234]}));
    assert.throws(() => r.collector.recordProcessBoundary({...boundary, packageName: 'foreign.package'}));
    assert.equal(r.collector.verify().result, 'failed');
  } finally {r.close()}
});
test('changed retained bytes cannot keep a completed collector green', async () => {
  const r = rig();
  try {
    await complete(r);
    fs.appendFileSync(path.join(r.evidence, 'cv-restart/restore/restore-ar-current-b.png'), 'changed');
    assert.equal(r.collector.verify().result, 'failed');
  } finally {r.close()}
});
test('remote hash disagreement fails without retry or accepting a phase', async () => {
  let reads = 0;
  const r = rig({readOriginal: async () => {
    reads++; const bytes = json(markers().seed);
    return {bytes, remoteBytes: bytes.length, remoteSHA256Before: hash(bytes), remoteSHA256After: '0'.repeat(64)};
  }});
  try {
    await assert.rejects(r.collector.collect('seed', execution('seed')));
    await assert.rejects(r.collector.collect('seed', execution('seed')));
    assert.equal(reads, 1); assert.equal(r.collector.verify().result, 'failed');
  } finally {r.close()}
});
test('late export replies are rejected within the fixed phase budget', async () => {
  let elapsed = 0, reads = 0;
  const r = rig({milliseconds: () => elapsed, readOriginal: async () => {
    reads++; const bytes = json(markers().seed); elapsed = 60_001;
    return {bytes, remoteBytes: bytes.length, remoteSHA256Before: hash(bytes), remoteSHA256After: hash(bytes)};
  }});
  try {
    await assert.rejects(r.collector.collect('seed', execution('seed')));
    assert.equal(reads, 1); assert.equal(r.collector.verify().result, 'failed');
  } finally {r.close()}
});
test('a failed later export retains earlier originals and cannot start restore', async () => {
  const proof = markers(), files = originals('seed', proof.seed);
  let reads = 0;
  const r = rig({readOriginal: async remote => {
    if (++reads === 3) throw Error('synthetic transport closed');
    const bytes = files.get(path.posix.basename(remote));
    return {bytes, remoteBytes: bytes.length, remoteSHA256Before: hash(bytes), remoteSHA256After: hash(bytes)};
  }});
  try {
    await assert.rejects(r.collector.collect('seed', execution('seed')));
    assert.ok(fs.existsSync(path.join(r.evidence, 'cv-restart/seed/seed-process.json')));
    assert.ok(fs.existsSync(path.join(r.evidence, 'cv-restart/seed/seed-ar-prepared-status-banner.png')));
    await assert.rejects(r.collector.collect('restore', execution('restore')));
    assert.equal(reads, 3); assert.equal(r.collector.verify().result, 'failed');
  } finally {r.close()}
});
test('all prescribed filenames are distinct and phase-specific', () => {
  const names = [...restartOriginalNames('seed'), ...restartOriginalNames('restore')];
  assert.equal(names.length, 44); assert.equal(new Set(names).size, 44);
  assert.throws(() => restartOriginalNames('other'));
});

test('shell-v2 negotiation requires a complete token, not a substring or invented feature', () => {
  requireShellV2Features('shell_v2\ncmd\nstat_v2\n');
  for (const bad of ['', 'not_shell_v2\n', 'shell_v20\n', 'shell_v2,cmd', 'shell_v2 extra'])
    assert.throws(() => requireShellV2Features(bad));
});
test('only exact successful PID output or explicit empty exit-one means an observed process state', () => {
  assert.deepEqual(parseOwnedPackagePids({text: '123 456\n', code: 0}), [123, 456]);
  assert.deepEqual(parseOwnedPackagePids({text: '', code: 1}), []);
  for (const bad of [{text: '', code: 0}, {text: '', code: 255}, {text: 'device offline', code: 1},
    {text: '123', code: 1}, {text: '123 123', code: 0}, {text: '0', code: 0},
    {text: '999999999999999999', code: 0}])
    assert.throws(() => parseOwnedPackagePids(bad));
});

test('the explicit boundary includes exact package subprocesses and rejects inconsistent observations', () => {
  const table = 'PID NAME\n1 init\n123 com.saleh.careerfinder.preview\n124 com.saleh.careerfinder.preview:worker\n125 com.saleh.careerfinder.preview.other\n';
  assert.deepEqual(parseOwnedProcessTable(table, [123]), [123, 124]);
  assert.deepEqual(parseOwnedProcessTable('PID NAME\n1 init\n', []), []);
  assert.throws(() => parseOwnedProcessTable(table, []));
  assert.throws(() => parseOwnedProcessTable('PID NAME\n123 truncated.package\n', [123]));
  assert.throws(() => parseOwnedProcessTable('PID NAME\nbad row\n', []));
});
