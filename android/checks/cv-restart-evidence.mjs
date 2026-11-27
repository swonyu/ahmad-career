import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inspectPNG} from './screenshot-evidence.mjs';

export const RESTART_CLASS = 'com.saleh.careerfinder.ApplicationCvHistoryProcessRestartTest';
export const RESTART_METHODS = Object.freeze({
  seed: 'seedReviewedA_thenSaveProfileBInEncryptedStore',
  restore: 'restoreHistoricalA_afterOwnedPackageProcessRestart',
});
export const RESTART_CAPTURES = Object.freeze({
  seed: Object.freeze(['seed-ar-prepared-status-banner', 'seed-ar-test-service-warning',
    'seed-ar-historical-a', 'seed-ar-current-b']),
  restore: Object.freeze(['restore-en-historical-a', 'restore-en-current-b',
    'restore-en-status-confirmed', 'restore-en-status-uncertain', 'restore-en-status-cancelled',
    'restore-ar-historical-a', 'restore-ar-current-b',
    'restore-ar-status-confirmed', 'restore-ar-status-uncertain', 'restore-ar-status-cancelled']),
});
const markerNames = {seed: 'seed-process.json', restore: 'restored-process.json'};
const seedCalls = ['GET workspace', 'POST prepare', 'GET workspace', 'POST submit', 'GET workspace',
  'PUT profile', 'GET workspace', 'POST prepare', 'GET workspace', 'POST submit', 'GET workspace'];
const statusLabels = {
  en: {confirmed: 'Test receipt · Confirmed', uncertain: 'Test receipt · Outcome uncertain',
    cancelled: 'Test receipt · Stopped'},
  ar: {confirmed: 'إيصال إرسال تجريبي · تم تأكيد الإرسال',
    uncertain: 'إيصال إرسال تجريبي · النتيجة غير مؤكدة', cancelled: 'إيصال إرسال تجريبي · متوقف'},
};
const receiptIDs = {confirmed: 'cv-attempt-1', uncertain: 'cv-attempt-2', cancelled: 'cv-legacy-no-evidence'};
const maximumFileBytes = 5 * 1024 * 1024;
const maximumTextBytes = 1024 * 1024;
const phaseBudgetMilliseconds = 60_000;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function partitionRestartClasses(classes, source) {
  assert.ok(Array.isArray(classes) && classes.every(name => typeof name === 'string'));
  assert.equal(new Set(classes).size, classes.length, 'Duplicate discovered test classes are not allowed.');
  assert.equal(classes.filter(name => name === RESTART_CLASS).length, 1,
    'The process-restart class must remain a required discovered class.');
  const methods = [...source.matchAll(/@Test\s+fun\s+([A-Za-z_]\w*)\s*\(/g)].map(match => match[1]);
  assert.equal((source.match(/@Test\b/g) ?? []).length, 2, 'The restart class must declare exactly two tests.');
  assert.equal(new Set(methods).size, methods.length);
  assert.deepEqual(methods.slice().sort(), Object.values(RESTART_METHODS).sort(),
    'Explicit orchestration must cover every restart method exactly once.');
  const ordinary = classes.filter(name => name !== RESTART_CLASS);
  assert.deepEqual([...ordinary, RESTART_CLASS].sort(), classes.slice().sort());
  return {ordinary, restart: RESTART_CLASS, methods: {...RESTART_METHODS}};
}

export function assertSingleRestartExecution(output, phase) {
  assert.ok(Object.hasOwn(RESTART_METHODS, phase));
  assert.equal(typeof output, 'string');
  assert.doesNotMatch(output, /FAILURES!!!|INSTRUMENTATION_FAILED|INSTRUMENTATION_STATUS_CODE: -(?:1|2|3|4)\b/);
  const events = [];
  let fields = {};
  for (const line of output.split(/\r?\n/)) {
    const field = line.match(/^INSTRUMENTATION_STATUS: (class|test|current|numtests)=(.*)$/);
    if (field) {
      assert.ok(!Object.hasOwn(fields, field[1]), 'Duplicate instrumentation identity field.');
      fields[field[1]] = field[2];
    }
    const code = line.match(/^INSTRUMENTATION_STATUS_CODE: (-?\d+)$/);
    if (code) {
      events.push({...fields, code: Number(code[1])});
      fields = {};
    }
  }
  assert.deepEqual(fields, {}, 'Incomplete instrumentation event.');
  const expected = {class: RESTART_CLASS, test: RESTART_METHODS[phase], current: '1', numtests: '1'};
  assert.deepEqual(events, [{...expected, code: 1}, {...expected, code: 0}],
    'Require exactly one start and one pass for the selected restart method.');
  const summaries = [...output.matchAll(/^OK \((\d+) tests?\)\s*$/gm)].map(match => Number(match[1]));
  assert.deepEqual(summaries, [1]);
  return {class: RESTART_CLASS, method: RESTART_METHODS[phase], tests: 1, starts: 1, passes: 1};
}

export function restartOriginalNames(phase) {
  assert.ok(Object.hasOwn(RESTART_CAPTURES, phase));
  return [markerNames[phase], ...RESTART_CAPTURES[phase].flatMap(name =>
    [name + '.png', name + '.json', name + '-semantics.txt'])];
}

export function requireShellV2Features(output) {
  assert.equal(typeof output, 'string');
  const tokens = output.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  assert.ok(tokens.length > 0 && tokens.every(value => /^[a-z0-9_]+$/.test(value)));
  assert.ok(tokens.includes('shell_v2'), 'The selected device must negotiate shell_v2.');
}
export function parseOwnedPackagePids({text, code}) {
  assert.equal(typeof text, 'string');
  const value = text.trim();
  if (code === 1 && value === '') return [];
  assert.equal(code, 0, 'The process query did not complete normally.');
  assert.match(value, /^[1-9][0-9]*(?: [1-9][0-9]*)*$/);
  const pids = value.split(' ').map(Number);
  assert.ok(pids.every(pid => Number.isSafeInteger(pid) && pid <= 0x7fffffff));
  assert.equal(new Set(pids).size, pids.length);
  return pids;
}

export function parseOwnedProcessTable(output, mainPids) {
  assert.equal(typeof output, 'string');
  const lines = output.trim().split(/\r?\n/);
  assert.match(lines.shift(), /^\s*PID\s+NAME\s*$/);
  const rows = lines.filter(line => line.trim()).map(line => {
    const match = line.trim().match(/^([1-9][0-9]*)\s+(\S.*)$/);
    assert.ok(match, 'Malformed device process table.');
    const pid = Number(match[1]);
    assert.ok(Number.isSafeInteger(pid) && pid <= 0x7fffffff);
    return {pid, name: match[2].trim()};
  });
  const exact = rows.filter(row => row.name === 'com.saleh.careerfinder.preview').map(row => row.pid).sort((a,b) => a-b);
  assert.deepEqual(exact, mainPids.slice().sort((a,b) => a-b), 'The two current package-process observations disagree.');
  const owned = rows.filter(row => row.name === 'com.saleh.careerfinder.preview' ||
    row.name.startsWith('com.saleh.careerfinder.preview:')).map(row => row.pid);
  assert.equal(new Set(owned).size, owned.length);
  return owned.sort((a,b) => a-b);
}

function identity(value, {phase, namespace, commit}) {
  assert.ok(object(value));
  assert.equal(value.schema, 1);
  assert.equal(value.phase, phase);
  assert.equal(value.namespace, namespace);
  assert.equal(value.sourceCommitClaimedByRunner, commit);
  assert.ok(Number.isSafeInteger(value.processID) && value.processID > 0 && value.processID <= 0x7fffffff);
  assert.ok(Number.isSafeInteger(value.processStartElapsedMillis) && value.processStartElapsedMillis >= 0);
  assert.match(value.invocationNonce, /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
  assert.equal(value.allOutcomesSynthetic, true);
  assert.equal(value.verifiedLiveReceiptCount, 0);
}

function receiptFacts(value) {
  for (const [key, id, state, filename, revision] of [
    ['receiptA', 'cv-attempt-1', 'confirmed', 'CV-A.pdf', 1],
    ['receiptB', 'cv-attempt-2', 'uncertain', 'CV-B.pdf', 2],
    ['legacyReceipt', 'cv-legacy-no-evidence', 'cancelled', null, null],
  ]) {
    const receipt = value[key];
    assert.ok(object(receipt));
    assert.equal(receipt.attemptId, id);
    assert.equal(receipt.state, state);
    assert.equal(receipt.evidenceMode, 'test');
    if (filename === null) {
      assert.ok(!Object.hasOwn(receipt, 'resumeName') && !Object.hasOwn(receipt, 'profileRevision'),
        'Older missing CV evidence must remain absent.');
    } else {
      assert.equal(receipt.resumeName, filename);
      assert.equal(receipt.profileRevision, revision);
      assert.match(receipt.resumeSHA256, /^[a-f0-9]{64}$/);
    }
  }
  assert.equal(value.currentProfileFilename, 'CV-B.pdf');
  assert.equal(value.currentProfileRevision, 2);
  assert.match(value.encryptedWorkspaceSHA256, /^[a-f0-9]{64}$/);
}

export function validateRestartMarker(value, context, seed) {
  identity(value, context);
  receiptFacts(value);
  if (context.phase === 'seed') {
    assert.equal(value.realModelTransitionsCompleted, true);
    assert.deepEqual(value.serviceCalls, seedCalls);
    assert.deepEqual(value.observedStatusLabels, []);
  } else {
    assert.ok(seed, 'Restore acceptance requires the retained seed marker.');
    assert.equal(value.restoredWithoutSeedOrServiceResponse, true);
    assert.deepEqual(value.serviceCalls, ['GET workspace']);
    assert.equal(value.seedProcessID, seed.processID);
    assert.equal(value.seedProcessStartElapsedMillis, seed.processStartElapsedMillis);
    assert.notEqual(value.processID, seed.processID, 'The target must use a different actual process.');
    assert.ok(value.processStartElapsedMillis > seed.processStartElapsedMillis);
    assert.notEqual(value.invocationNonce, seed.invocationNonce);
    assert.equal(value.encryptedWorkspaceSHA256, seed.encryptedWorkspaceSHA256);
    for (const key of ['receiptA', 'receiptB', 'legacyReceipt'])
      assert.deepEqual(value[key], seed[key], 'Restart changed historical receipt evidence.');
    const labels = ['en', 'ar'].flatMap(language => ['confirmed', 'uncertain', 'cancelled'].map(state => ({
      language, receiptID: receiptIDs[state], state, displayedLabel: statusLabels[language][state],
      testMode: true, verified: false,
    })));
    assert.deepEqual(value.observedStatusLabels, labels);
  }
  return value;
}

function rect(value) {
  assert.ok(Array.isArray(value) && value.length === 4 && value.every(Number.isFinite));
  assert.ok(value[2] > value[0] && value[3] > value[1], 'Geometry must be finite and nonempty.');
  return value;
}
function contains(outer, inner) {
  return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];
}
function expectedTarget(stem) {
  if (stem.endsWith('prepared-status-banner')) return 'تم إعداد المراجعة. لم يُقدَّم أي طلب.';
  if (stem.endsWith('test-service-warning')) return 'خدمة اختبار: الطلبات وإيصالات الإرسال محاكاة.';
  if (stem.endsWith('historical-a')) return 'CV-A.pdf';
  if (stem.endsWith('current-b')) return 'CV-B.pdf';
  const language = stem.includes('-ar-') ? 'ar' : 'en';
  return statusLabels[language][stem.split('-').at(-1)];
}
function text(bytes) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= maximumTextBytes);
  return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
}
function json(bytes) {
  const value = JSON.parse(text(bytes));
  assert.ok(object(value), 'Original JSON must contain an object.');
  return value;
}

export function validateRestartPhaseOriginals(files, context, seed) {
  const required = restartOriginalNames(context.phase);
  assert.ok(files instanceof Map);
  assert.deepEqual([...files.keys()].sort(), required.slice().sort(), 'Require the complete exact phase inventory.');
  const marker = validateRestartMarker(json(files.get(markerNames[context.phase])), context, seed);
  const geometry = [];
  for (const stem of RESTART_CAPTURES[context.phase]) {
    const png = files.get(stem + '.png');
    assert.deepEqual(inspectPNG(png), {width: 1080, height: 1920});
    const data = json(files.get(stem + '.json'));
    identity(data, context);
    for (const key of ['processID', 'processStartElapsedMillis', 'invocationNonce'])
      assert.equal(data[key], marker[key]);
    const language = stem.includes('-ar-') ? 'ar' : 'en';
    assert.equal(data.language, language);
    assert.equal(data.layoutDirection, language === 'ar' ? 'Rtl' : 'Ltr');
    assert.equal(data.fontScale, 1.8);
    assert.equal(data.imeVisible, false);
    assert.equal(data.targetCount, 1);
    assert.equal(data.wholeTargetVisible, true);
    const target = rect(data.fullTargetBounds), viewport = rect(data.listBounds);
    assert.ok(contains([0, 0, 1080, 1920], viewport) && contains(viewport, target));
    assert.deepEqual(rect(data.clippedTargetBounds), target, 'A clipped target cannot count as whole.');
    const companion = stem === 'seed-ar-prepared-status-banner';
    assert.equal(data.companionRequired, companion);
    assert.equal(data.wholeCompanionVisible, true);
    if (companion) {
      assert.equal(data.companionCount, 1);
      assert.ok(contains(viewport, rect(data.companionFullBounds)));
      assert.deepEqual(data.companionClippedBounds, data.companionFullBounds);
      assert.equal(data.testScrolledTargetBeforeCapture, false);
    } else {
      assert.equal(data.companionCount, 0);
      assert.equal(data.companionFullBounds, null);
      assert.equal(data.companionClippedBounds, null);
    }
    const early = stem === 'seed-ar-prepared-status-banner' || stem === 'seed-ar-test-service-warning';
    assert.equal(data.currentProfileFilename, early ? 'CV-A.pdf' : 'CV-B.pdf');
    assert.equal(data.currentProfileRevision, early ? 1 : 2);
    assert.deepEqual(data.receiptMetadata, early ? [marker.legacyReceipt] :
      [marker.legacyReceipt, marker.receiptA, marker.receiptB]);
    assert.deepEqual(data.serviceCalls, early ? seedCalls.slice(0, 3) : marker.serviceCalls);
    assert.ok(Array.isArray(data.observedStatusLabels));
    assert.deepEqual(data.observedStatusLabels, marker.observedStatusLabels.slice(0, data.observedStatusLabels.length));
    const semantics = text(files.get(stem + '-semantics.txt'));
    assert.match(semantics, /^ROOT \d+\r?\nPrinting with useUnmergedTree = 'true'\r?\nNode #\d+ at /m);
    assert.ok((semantics.match(/Node #\d+ at /g) ?? []).length > 1);
    assert.ok(semantics.includes("Text = '[" + expectedTarget(stem) + "]'"),
      'The original semantics must contain the exact named visible target.');
    if (companion) {
      assert.match(semantics, /Tag: 'workspace-messages'[\s\S]*?ScrollAxisRange\(value=0\.0,/);
      assert.ok(semantics.includes("ContentDescription = '[إخفاء الرسالة]'"));
      assert.ok(semantics.includes("LiveRegion = 'Polite'"));
    }
    geometry.push({state: stem, language, fullTargetBounds: target, viewport, companion});
  }
  return {marker, geometry, originalCount: required.length, pngCount: RESTART_CAPTURES[context.phase].length};
}

export function createRestartEvidenceCollector({evidence, namespace, commit, device, readOriginal,
  milliseconds = () => performance.now(), now = () => new Date().toISOString()}) {
  assert.match(namespace, /^cv-restart-[a-f0-9]{32}$/);
  assert.match(commit, /^[a-f0-9]{40}$/);
  assert.equal(typeof readOriginal, 'function');
  const report = {schema: 1, commit, namespace, device, required: true, observedAt: now(),
    expectedOriginals: 44, phases: [], result: 'pending',
    visualReview: 'Original bytes and geometry are required; human image review is separate.'};
  const phaseData = new Map(), attempted = new Set();
  const persist = () => fs.writeFileSync(path.join(evidence, 'cv-restart.json'), JSON.stringify(report, null, 2) + '\n');
  fs.mkdirSync(evidence, {recursive: true});
  persist();
  function save(file, bytes) {
    assert.ok(!fs.existsSync(file), 'Never overwrite retained restart evidence.');
    fs.mkdirSync(path.dirname(file), {recursive: true});
    const partial = file + '.partial';
    const descriptor = fs.openSync(partial, 'wx', 0o600);
    try { fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); }
    finally { fs.closeSync(descriptor); }
    fs.renameSync(partial, file);
  }
  async function collect(phase, execution) {
    assert.ok(Object.hasOwn(RESTART_METHODS, phase));
    assert.ok(!attempted.has(phase), 'A restart evidence phase may not be retried.');
    assert.deepEqual(execution, {class: RESTART_CLASS, method: RESTART_METHODS[phase], tests: 1, starts: 1, passes: 1});
    if (phase === 'restore') {
      assert.equal(report.phases.find(item => item.phase === 'seed')?.result, 'captured');
      assert.ok(report.explicitProcessBoundary, 'Restore requires the explicit owned-package boundary.');
    }
    attempted.add(phase);
    const item = {phase, execution, startedAt: now(), files: [], result: 'collecting'};
    report.phases.push(item); persist();
    const started = milliseconds(), files = new Map();
    try {
      for (const name of restartOriginalNames(phase)) {
        const remaining = phaseBudgetMilliseconds - (milliseconds() - started);
        assert.ok(remaining > 0, 'The bounded restart phase export budget expired.');
        const remotePath = 'cache/application-cv-restart-evidence-' + namespace + '/' + name;
        const original = await readOriginal(remotePath, Math.min(15_000, remaining));
        assert.ok(milliseconds() - started <= phaseBudgetMilliseconds, 'A late phase export cannot be accepted.');
        assert.ok(Buffer.isBuffer(original.bytes) && original.bytes.length > 0 && original.bytes.length <= maximumFileBytes);
        assert.equal(original.bytes.length, original.remoteBytes);
        assert.match(original.remoteSHA256Before, /^[a-f0-9]{64}$/);
        assert.equal(original.remoteSHA256After, original.remoteSHA256Before);
        assert.equal(hash(original.bytes), original.remoteSHA256Before);
        const file = path.join('cv-restart', phase, name);
        save(path.join(evidence, file), original.bytes);
        files.set(name, original.bytes);
        item.files.push({name, remotePath, file, bytes: original.bytes.length,
          sha256: hash(original.bytes), remoteSHA256Before: original.remoteSHA256Before,
          remoteSHA256After: original.remoteSHA256After});
        persist();
      }
      const validated = validateRestartPhaseOriginals(files, {phase, namespace, commit}, phaseData.get('seed')?.marker);
      phaseData.set(phase, validated);
      item.geometry = validated.geometry;
      item.marker = validated.marker;
      item.originalCount = validated.originalCount;
      item.pngCount = validated.pngCount;
      item.result = 'captured';
      item.completedAt = now(); persist();
      return validated.marker;
    } catch (error) {
      item.result = 'failed';
      item.reason = String(error.message ?? error).slice(0, 2000);
      item.completedAt = now(); report.result = 'failed'; persist();
      throw error;
    }
  }
  function recordProcessBoundary(boundary) {
    assert.equal(report.phases.find(item => item.phase === 'seed')?.result, 'captured');
    assert.ok(!attempted.has('restore') && !report.explicitProcessBoundary);
    assert.equal(boundary.packageName, 'com.saleh.careerfinder.preview');
    assert.equal(boundary.forceStopCompleted, true);
    assert.equal(boundary.reinstallOrDataClearBetweenPhases, false);
    assert.equal(boundary.seedPID, phaseData.get('seed').marker.processID);
    assert.ok(Array.isArray(boundary.packagePidsBefore) &&
      boundary.packagePidsBefore.every(pid => Number.isSafeInteger(pid) && pid > 0));
    assert.equal(new Set(boundary.packagePidsBefore).size, boundary.packagePidsBefore.length);
    assert.deepEqual(boundary.packagePidsAfter, []);
    report.explicitProcessBoundary = {...boundary,
      seedProcessStillPresentBeforeExplicitStop: boundary.packagePidsBefore.includes(phaseData.get('seed').marker.processID)};
    persist();
  }
  function verify() {
    report.verifiedOriginals = 0; report.verifiedPNGs = 0;
    try {
      assert.deepEqual(report.phases.map(item => item.phase), ['seed', 'restore']);
      assert.ok(report.explicitProcessBoundary);
      assert.deepEqual(report.explicitProcessBoundary.packagePidsAfter, []);
      const markers = {};
      let originals = 0;
      for (const item of report.phases) {
        assert.equal(item.result, 'captured');
        const files = new Map();
        for (const record of item.files) {
          assert.ok(!files.has(record.name), 'Duplicate original filename.');
          const bytes = fs.readFileSync(path.join(evidence, record.file));
          assert.equal(bytes.length, record.bytes);
          assert.equal(hash(bytes), record.sha256);
          files.set(record.name, bytes);
        }
        const value = validateRestartPhaseOriginals(files,
          {phase: item.phase, namespace, commit}, markers.seed);
        markers[item.phase] = value.marker; originals += files.size;
      }
      assert.equal(originals, 44);
      report.result = 'passed'; report.verifiedOriginals = originals; report.verifiedPNGs = 14;
      report.processBoundary = {seedPID: markers.seed.processID, restorePID: markers.restore.processID,
        seedStartElapsedMillis: markers.seed.processStartElapsedMillis,
        restoreStartElapsedMillis: markers.restore.processStartElapsedMillis,
        encryptedWorkspaceSHA256: markers.seed.encryptedWorkspaceSHA256,
        actualDifferentProcess: true, restoredWithoutSeedOrServiceResponse: true};
    } catch (error) {
      report.result = 'failed'; report.reason = String(error.message ?? error).slice(0, 2000);
    }
    report.verifiedAt = now(); persist();
    return {result: report.result, expectedOriginals: 44, verifiedOriginals: report.verifiedOriginals ?? 0,
      verifiedPNGs: report.verifiedPNGs ?? 0, manifest: 'cv-restart.json'};
  }
  return {collect, recordProcessBoundary, verify};
}
