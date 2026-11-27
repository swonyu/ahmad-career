#!/usr/bin/env node
// Opt-in host half of the synthetic iPhone document-picker journey.
// No listener, database or native action starts merely by importing this file.
import {constants} from 'node:fs';
import {open, mkdir, lstat, realpath, readdir, link, unlink} from 'node:fs/promises';
import {createHash, randomBytes, X509Certificate} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureNativeJourneySourceInputs, bundleNativeJourney, createNativeJourneyHarness,
  repositoryRoot} from './harness.mjs';
import {startNativeJourneyBridge} from './bridge.mjs';
import {createFileCheckpointController, readCheckpointFile} from './file-control.mjs';
import {assertBlankWorkspace, assertZeroDispatch} from './contract.mjs';
import {CHECKPOINTS, UUID, decodeBoundedJSON} from './control-state.mjs';

const ownFile = fileURLToPath(import.meta.url);
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const fail = code => { const error = new Error(code); error.safeCode = code; throw error; };
const scope = filename => filename === repositoryRoot || filename.startsWith(repositoryRoot + path.sep);
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino && a.uid === b.uid;

function argumentsFor(argv) {
  const names = ['--app-container', '--runner-container', '--work-dir', '--test-id', '--follow-up-day', '--port'];
  const handoffName = '--runtime-runner-handoff';
  if (![names.length * 2, names.length * 2 + 2].includes(argv.length)) fail('iphone_arguments_invalid');
  const values = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!(names.includes(argv[i]) || argv[i] === handoffName) || Object.hasOwn(values, argv[i])) fail('iphone_arguments_invalid');
    values[argv[i]] = argv[i + 1];
  }
  if (names.some(name => !Object.hasOwn(values, name)) ||
      Object.hasOwn(values, handoffName) && values[handoffName] !== 'enabled') fail('iphone_arguments_invalid');
  const testID = values['--test-id'], port = Number(values['--port']), followUpDay = values['--follow-up-day'];
  const selected = new Date(followUpDay + 'T12:00:00Z');
  if (!UUID.test(testID) || testID !== testID.toUpperCase() ||
      !/^[1-9]\d{3,4}$/.test(values['--port']) || !Number.isSafeInteger(port) || port < 1024 || port > 65535 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(followUpDay) ||
      !Number.isFinite(selected.valueOf()) || selected.toISOString().slice(0, 10) !== followUpDay) fail('iphone_arguments_invalid');
  const today = new Date();
  if (selected.getFullYear() !== today.getFullYear() || selected.getMonth() !== today.getMonth() ||
      selected.getDate() <= today.getDate()) fail('iphone_follow_up_day_invalid');
  for (const name of names.slice(0, 3)) {
    const value = values[name];
    if (typeof value !== 'string' || value.length > 4096 || !path.isAbsolute(value) ||
        path.resolve(value) !== value || scope(value)) fail('iphone_path_invalid');
  }
  return {appContainer:values['--app-container'], runnerContainer:values['--runner-container'],
    workDir:values['--work-dir'], testID, followUpDay, port,
    runtimeRunnerHandoff:values[handoffName] === 'enabled'};
}

async function directory(filename, privateMode = false) {
  const first = await lstat(filename);
  if (!first.isDirectory() || first.isSymbolicLink() || first.uid !== process.getuid() ||
      (first.mode & 0o022) !== 0 || privateMode && (first.mode & 0o777) !== 0o700 ||
      await realpath(filename) !== filename) fail('iphone_directory_invalid');
  const second = await lstat(filename);
  if (!sameIdentity(first, second)) fail('iphone_directory_changed');
  return {path:filename, dev:second.dev, ino:second.ino, uid:second.uid};
}
async function childDirectory(parent, name, fresh = false) {
  const filename = path.join(parent, name);
  try { await mkdir(filename, {mode:0o700}); }
  catch (error) { if (fresh || error.code !== 'EEXIST') throw error; }
  await directory(filename, fresh);
  return filename;
}
async function atomicPrivate(filename, bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > 65536) fail('iphone_publication_invalid');
  const temporary = path.join(path.dirname(filename), '.pending-' + path.basename(filename) + '-' + randomBytes(12).toString('hex'));
  const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  try { await link(temporary, filename); } finally { await unlink(temporary); }
  return digest(bytes);
}
async function containers(appPath, runnerPath) {
  if (appPath === runnerPath || path.dirname(appPath) !== path.dirname(runnerPath) ||
      !path.dirname(appPath).endsWith(path.join('data', 'Containers', 'Data', 'Application')) ||
      !UUID.test(path.basename(appPath)) || !UUID.test(path.basename(runnerPath))) fail('iphone_container_invalid');
  return {app:await directory(appPath), runner:await directory(runnerPath)};
}
async function controllerPins() {
  const files = [
    'hosted/tests/fixtures/native-journey/serve-iphone.mjs',
    'hosted/tests/fixtures/native-journey/harness.mjs',
    'hosted/tests/fixtures/native-journey/bridge.mjs',
    'hosted/tests/fixtures/native-journey/file-control.mjs',
    'hosted/tests/fixtures/native-journey/control-state.mjs',
    'hosted/tests/fixtures/native-journey/contract.mjs',
    'hosted/tests/fixtures/native-journey/runtime.mjs',
    'hosted/tests/fixtures/native-journey/data.mjs',
    'hosted/server/applications.mjs',
    'hosted/server/discovery.mjs',
    'hosted/shared/discovery-source-identity.mjs',
    'apple/UITests/CareerFinderNativeJourneyUITests.swift',
    'apple/AhmadCareer/AcceptanceNativeJourney.swift',
    'apple/AhmadCareer/MobileApplicationClient.swift',
    'apple/AhmadCareer/CareerDiscovery.swift',
  ];
  const pins = {};
  for (const relative of files) {
    const filename = path.join(repositoryRoot, relative);
    pins[filename] = (await readCheckpointFile(filename, 8 * 1024 * 1024)).sha256;
  }
  return pins;
}
function safeFailure(error, stage) {
  const code = error?.safeCode ?? error?.code;
  return typeof code === 'string' && /^(?:iphone_|fixture_|checkpoint_)[a-z0-9_]+$/.test(code)
    ? code : 'iphone_' + stage + '_failed';
}

export async function serveIPhone(args, {signal, preserveSignals} = {}) {
  const config = argumentsFor(args);
  let workOwned = false, harness, bridge, controller, activePoll, proof, completed = false;
  let stage = 'work_directory';
  const result = {ok:false, testID:config.testID, checkpoints:0, zeroDispatch:false};
  try {
    if (signal?.aborted) fail('iphone_cancelled');
    const parent = path.dirname(config.workDir);
    if (await realpath(parent) !== parent) fail('iphone_path_invalid');
    try { await mkdir(config.workDir, {mode:0o700}); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    await directory(config.workDir, true);
    if ((await readdir(config.workDir)).length) fail('iphone_work_directory_not_empty');
    workOwned = true;
    const bound = await containers(config.appContainer, config.runnerContainer);
    const pins = await controllerPins();
    stage = 'source_pins';
    const {expectedInputs, bundleInputCount} = await captureNativeJourneySourceInputs();
    const bundle = await bundleNativeJourney(expectedInputs);
    if (signal?.aborted) fail('iphone_cancelled');
    stage = 'hosted_runtime';
    harness = await createNativeJourneyHarness({stateDirectory:path.join(config.workDir, 'private-state'),
      expectedInputs, expectedWorkerSHA256:bundle.sha256});
    // Miniflare installs process-exiting signal hooks. The CLI retains only
    // handlers that predate this owned runtime so its async cleanup can finish.
    preserveSignals?.();
    const connection = await harness.provision();
    assertBlankWorkspace(connection.initialWorkspace);
    if (signal?.aborted) fail('iphone_cancelled');
    stage = 'loopback_bridge';
    bridge = await startNativeJourneyBridge({harness, port:config.port, signal});
    if (!bridge.caPath.startsWith(config.workDir + path.sep)) fail('iphone_certificate_path_invalid');
    const ca = await readCheckpointFile(bridge.caPath, 65536);
    const certificate = new X509Certificate(ca.bytes);
    if (!certificate.ca || certificate.fingerprint256 !== bridge.caFingerprint256) fail('iphone_certificate_invalid');
    stage = 'private_bootstrap';
    const library = await childDirectory(bound.app.path, 'Library');
    const support = await childDirectory(library, 'Application Support');
    const acceptance = await childDirectory(support, 'CareerFinderUIAcceptance');
    const appRoot = await childDirectory(acceptance, config.testID, true);
    const bootstrap = json({schemaVersion:1, testID:config.testID, connection,
      transport:{origin:bridge.privateConfiguration.iosOrigin, capability:bridge.privateConfiguration.bridgeToken}});
    const bootstrapPath = path.join(appRoot, 'native-journey-bootstrap.private.json');
    const bootstrapSHA256 = await atomicPrivate(bootstrapPath, bootstrap);
    if ((await readCheckpointFile(bootstrapPath, 65536, {privateMode:true})).sha256 !== bootstrapSHA256) fail('iphone_bootstrap_changed');
    if (signal?.aborted) fail('iphone_cancelled');
    const stopAt = performance.now() + 1_500_000;
    const documents = Object.fromEntries(Object.entries(bridge.privateConfiguration.documents)
      .map(([name, relative]) => [name, bridge.privateConfiguration.iosOrigin + relative]));
    if (Object.keys(documents).sort().join(',') !== 'CV-A.pdf,CV-B.pdf') fail('iphone_document_urls_invalid');
    const bindController = async runtime => {
      stage = 'checkpoint_controller';
      controller = await createFileCheckpointController({harness, bridge, testID:config.testID,
        workspaceID:connection.workspaceId, logicalOrigin:connection.origin,
        workerSHA256:bundle.sha256, bootstrapSHA256, followUpDay:config.followUpDay,
        appContainer:runtime.app, runnerContainer:runtime.runner, evidenceParent:config.workDir,
        expectedSourceFiles:pins, stopAt});
    };
    if (!config.runtimeRunnerHandoff) await bindController(bound);
    await atomicPrivate(path.join(config.workDir, 'ready.json'), json({caPath:bridge.caPath, documents}));
    if (config.runtimeRunnerHandoff) {
      // Xcode may reinstall the UI-test Runner when test-without-building starts.
      // The supervisor observes its exact test-ID control directory first.
      stage = 'runner_handoff';
      const handoffPath = path.join(config.workDir, 'runner-container-handoff.json');
      while (true) {
        if (signal?.aborted) fail('iphone_cancelled');
        if (performance.now() >= stopAt) fail('iphone_deadline');
        try { await lstat(handoffPath); break; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        await delay(25);
      }
      const handoff = decodeBoundedJSON((await readCheckpointFile(handoffPath, 4096, {privateMode:true})).bytes, 4096);
      if (!handoff || Object.keys(handoff).sort().join(',') !== 'appContainer,runnerContainer,schemaVersion,testID' ||
          handoff.schemaVersion !== 1 || handoff.testID !== config.testID ||
          [handoff.appContainer,handoff.runnerContainer].some(value =>
            typeof value !== 'string' || value.length > 4096 || !path.isAbsolute(value) ||
            path.resolve(value) !== value || scope(value))) fail('iphone_runner_handoff_invalid');
      const runtime = await containers(handoff.appContainer, handoff.runnerContainer);
      const runtimeBootstrap = path.join(runtime.app.path, 'Library', 'Application Support',
        'CareerFinderUIAcceptance', config.testID, 'native-journey-bootstrap.private.json');
      if ((await readCheckpointFile(runtimeBootstrap, 65536, {privateMode:true})).sha256 !== bootstrapSHA256) fail('iphone_bootstrap_changed');
      await bindController(runtime);
      await atomicPrivate(path.join(config.workDir, 'controller-ready.json'), json({schemaVersion:1,
        testID:config.testID, runnerContainerID:path.basename(runtime.runner.path)}));
    }
    stage = 'checkpoints';
    while (!controller.complete) {
      if (signal?.aborted) fail('iphone_cancelled');
      if (performance.now() >= stopAt) fail('iphone_deadline');
      activePoll = controller.poll();
      try { await activePoll; } finally { activePoll = null; }
      if (!controller.complete) await delay(25);
    }
    const status = controller.status();
    if (!status.completed || status.checkpointCount !== CHECKPOINTS.length ||
        status.unsettledHarnessOperations !== 0) fail('iphone_checkpoints_incomplete');
    proof = await bridge.evidence(); assertZeroDispatch(proof);
    const names = await readdir(path.join(config.workDir, 'control-' + config.testID));
    if (names.filter(name => /^\d{3}-verification\.json$/.test(name)).length !== CHECKPOINTS.length) fail('iphone_verifications_incomplete');
    completed = true;
    result.checkpoints = status.checkpointCount;
    result.zeroDispatch = true;
    result.evidence = {directory:'control-' + config.testID, verifications:CHECKPOINTS.length,
      nativeCalls:proof.nativeCalls.length, apiRequests:proof.bridge.apiRequests,
      documentRequests:{'CV-A.pdf':proof.bridge.documentRequests['CV-A.pdf'],
        'CV-B.pdf':proof.bridge.documentRequests['CV-B.pdf']},
      providerPostAttempts:proof.providerPostAttempts, outboundAttempts:proof.outboundAttempts,
      bundleInputCount, sourcePinCount:Object.keys(expectedInputs).length,
      controllerPinCount:Object.keys(pins).length, workerSHA256:bundle.sha256};
  } catch (error) {
    result.failure = {stage, code:safeFailure(error, stage)};
  } finally {
    stage = 'cleanup';
    let clean = true;
    if (controller) {
      controller.stop();
      try { if (activePoll) await activePoll.catch(() => {}); await controller.settle(5000); }
      catch { clean = false; }
      const status = controller.status();
      result.checkpoints = status.checkpointCount;
      if (!completed) {
        result.diagnostic = {controlDirectorySeen:status.controlDirectorySeen,
          requestsObserved:status.requestsObserved, controllerFailureCode:status.lastFailureCode,
          failureRetention:status.failureRetention, failurePhase:status.lastFailurePhase,
          failureElapsedMs:status.lastFailureElapsedMs};
        try { result.diagnostic.operationJournal = await controller.failureJournalSummary(); }
        catch { result.diagnostic.operationJournal = {state:'unavailable'}; }
      }
    }
    if (bridge) {
      if (!completed) {
        result.diagnostic ??= {};
        const status = bridge.status();
        result.diagnostic.search = status.search;
        result.diagnostic.profileWrites = status.profileWrites;
        result.diagnostic.loopbackApiRequests = status.apiRequests;
        result.diagnostic.documentRequests = status.documentRequests;
        result.diagnostic.tlsErrors = status.tlsErrors;
        result.diagnostic.lastTlsErrorAtUTC = status.lastTlsErrorAtUTC;
        result.diagnostic.lastTlsErrorAgeMs = status.lastTlsErrorAgeMs;
      }
      try {
        const closed = await bridge.close();
        if (!closed.closed || closed.ownSocketCount !== 0) clean = false;
      } catch { clean = false; }
    }
    if (harness && clean) {
      try { if (!(await harness.dispose()).closed) clean = false; }
      catch { clean = false; }
    } else if (harness) clean = false;
    result.ok = completed && clean && !signal?.aborted;
    if (!result.ok) {
      result.zeroDispatch = false;
      delete result.evidence;
      result.failure ??= {stage:'cleanup', code:'iphone_cleanup_failed'};
    }
    result.cleanupComplete = clean;
    if (workOwned) {
      try { await atomicPrivate(path.join(config.workDir, 'result.json'), json(result)); }
      catch { result.ok = false; result.failure = {stage:'publication', code:'iphone_result_publication_failed'}; }
    }
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === ownFile) {
  const abort = new AbortController();
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const name of signals) process.once(name, () => abort.abort());
  const original = new Map(signals.map(name => [name, new Set(process.rawListeners(name))]));
  const preserveSignals = () => {
    for (const name of signals) for (const listener of process.rawListeners(name)) {
      if (!original.get(name).has(listener)) process.removeListener(name, listener);
    }
  };
  serveIPhone(process.argv.slice(2), {signal:abort.signal, preserveSignals}).then(result => {
    // Only fixed counts, booleans and failure codes reach stdout. Private bootstrap and
    // transport capability never enter argv, environment, logs or ready.json.
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  }).catch(() => {
    console.log(JSON.stringify({ok:false, failure:{code:'iphone_launcher_failed'}}));
    process.exitCode = 1;
  });
}
