// Programmatic private support only: no main(), server, migration or pairing on import.
import {open, readdir, mkdir, realpath, unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash, randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SERVICE_ORIGIN} from '../../../server/applications.mjs';
import {FixtureError, nativeRoute, nativeHeaders, assertBlankWorkspace, assertZeroDispatch} from './contract.mjs';

export const hostedRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const repositoryRoot = path.resolve(hostedRoot, '..');
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw new FixtureError(code, 503); };
const supportPrefix = 'hosted/tests/fixtures/native-journey/';
// Installed, lockfile-backed dependencies reached by the real handler's dynamic
// imports. Their exact code/JSON bytes are pinned before either offline bundle;
// the metafile must still contain no input outside that reviewed map.
const dependencyPrefixes = ['jose', 'pdf-lib', '@pdf-lib/standard-fonts', '@pdf-lib/upng']
  .map(name => 'hosted/node_modules/' + name + '/');
const required = ['data.mjs', 'contract.mjs', 'runtime.mjs', 'harness.mjs', 'bridge.mjs'].map(n => supportPrefix + n)
  .concat(['hosted/server/applications.mjs', 'hosted/server/discovery.mjs', 'hosted/server/provider.mjs',
    'hosted/package.json', 'hosted/package-lock.json', 'postman/fixtures/integration-resume.pdf', 'website/applications/fixtures/certificates.mjs'])
  .concat(dependencyPrefixes.map(prefix => prefix + 'package.json'));
function permittedInput(name) {
  return typeof name === 'string' && !name.includes('\\') && !name.split('/').some(part => !part || part === '.' || part === '..') &&
    (/^hosted\/(?:server|shared|drizzle)\//.test(name) || name.startsWith(supportPrefix) || required.includes(name) ||
      dependencyPrefixes.some(prefix => name.startsWith(prefix) && /\.(?:js|mjs|cjs|json)$/.test(name)));
}
async function readRegular(filename, maximum = 8 * 1024 * 1024) {
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size < 1 || before.size > maximum) fail('fixture_file_shape_invalid');
    const bytes = await handle.readFile(), after = await handle.stat();
    if (bytes.length !== before.size || before.dev !== after.dev || before.ino !== after.ino ||
        before.size !== after.size || before.mtimeMs !== after.mtimeMs) fail('fixture_file_changed');
    return bytes;
  } finally { await handle.close(); }
}
export async function verifySourceInputs(expected) {
  if (!expected || Array.isArray(expected) || typeof expected !== 'object' || Object.keys(expected).length > 512 ||
      required.some(name => !Object.hasOwn(expected, name))) fail('fixture_source_pins_missing');
  for (const [name, hash] of Object.entries(expected)) {
    if (!permittedInput(name) || !/^[a-f0-9]{64}$/.test(hash)) fail('fixture_source_pin_invalid');
    const filename = path.join(repositoryRoot, name);
    if (await realpath(filename) !== filename || digest(await readRegular(filename)) !== hash) fail('fixture_source_changed');
  }
  const migrations = (await readdir(path.join(hostedRoot, 'drizzle'))).filter(n => n.endsWith('.sql')).sort();
  if (!migrations.length || migrations.some(n => !Object.hasOwn(expected, 'hosted/drizzle/' + n))) fail('fixture_migration_pin_missing');
  return migrations;
}
/** Offline build preparation only; invoking it still requires the next review grant. */
export async function bundleNativeJourney(expectedInputs) {
  await verifySourceInputs(expectedInputs);
  const {build} = await import('esbuild');
  let result;
  try {
    result = await build({entryPoints: [fileURLToPath(new URL('./runtime.mjs', import.meta.url))], absWorkingDir: hostedRoot,
      bundle: true, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'], target: 'es2022',
      external: ['node:*'], write: false, metafile: true, logLevel: 'silent'});
  } catch { fail('fixture_bundle_failed'); }
  if (result.outputFiles.length !== 1 || result.outputFiles[0].contents.length > 8 * 1024 * 1024) fail('fixture_bundle_shape_invalid');
  for (const name of Object.keys(result.metafile.inputs)) {
    const relative = path.relative(repositoryRoot, path.resolve(hostedRoot, name)).split(path.sep).join('/');
    if (!Object.hasOwn(expectedInputs, relative)) fail('fixture_bundle_input_unpinned');
  }
  await verifySourceInputs(expectedInputs);
  return {text: result.outputFiles[0].text, sha256: digest(result.outputFiles[0].contents),
    inputs: Object.keys(result.metafile.inputs).sort()};
}
async function writePrivate(filename, value) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  const handle = await open(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  return digest(bytes);
}
/** Explicit future action. Creates only a fresh private store, never reuses production or an earlier receipt directory. */
export async function createNativeJourneyHarness({stateDirectory, expectedInputs, expectedWorkerSHA256}) {
  if (!/^[a-f0-9]{64}$/.test(expectedWorkerSHA256 ?? '')) fail('fixture_worker_pin_missing');
  const bundle = await bundleNativeJourney(expectedInputs);
  if (bundle.sha256 !== expectedWorkerSHA256) fail('fixture_worker_changed');
  if (!path.isAbsolute(stateDirectory)) fail('fixture_state_path_invalid');
  const state = path.resolve(stateDirectory), parent = await realpath(path.dirname(state));
  if (parent !== path.dirname(state) || state === repositoryRoot || state.startsWith(repositoryRoot + path.sep)) fail('fixture_state_path_invalid');
  await mkdir(state, {mode: 0o700}); // Must not already exist; there is no implicit recovery/retry.
  const ownerPath = path.join(state, 'runtime-owner.json');
  const owner = {schemaVersion: 1, purpose: 'synthetic-native-journey', pid: process.pid,
    nonce: randomBytes(24).toString('hex'), startedAt: new Date().toISOString()};
  const ownerSHA256 = await writePrivate(ownerPath, owner);
  let mf, closing, closed = false, outboundAttempts = 0, forbiddenDispatchAttempts = 0;
  let provisioningAttempted = false, nativeInFlight = 0;
  const runtimeToken = randomBytes(32).toString('hex'), calls = [];
  async function dispose() {
    if (closing) return closing;
    closing = (async () => {
      await mf?.dispose();
      // Leave the owner in place if resource disposal or ownership validation fails.
      if (digest(await readRegular(ownerPath, 8192)) !== ownerSHA256) fail('fixture_owner_changed');
      await unlink(ownerPath); closed = true;
      return {closed: true, stateRetained: true, ownerRemoved: true};
    })();
    return closing;
  }
  try {
    process.env.CLOUDFLARE_CF_FETCH_ENABLED = 'false';
    const {Miniflare, convertV4MiniflareOptions} = await import('miniflare');
    const reviewEpoch = Date.now() - 1000;
    mf = new Miniflare(convertV4MiniflareOptions({
      modules: true, script: bundle.text, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'],
      d1Databases: ['DB'], r2Buckets: ['BUCKET'],
      bindings: {NATIVE_JOURNEY_REVIEW_EPOCH: reviewEpoch, NATIVE_JOURNEY_RUNTIME_TOKEN: runtimeToken},
      cf: false, telemetry: {enabled: false}, host: '127.0.0.1', port: 0, inspectorHost: '127.0.0.1', inspectorPort: 0,
      resourcePersistencePath: path.join(state, 'resources'), isolatedResourcePersistencePath: path.join(state, 'isolated-resources'),
      unsafeDevRegistryPath: path.join(state, 'registry'),
      outboundService: () => { outboundAttempts++; throw new Error('fixture_outbound_denied'); },
    }));
    const db = await mf.getD1Database('DB'), migrations = await verifySourceInputs(expectedInputs), schema = [];
    for (const name of migrations) {
      const bytes = await readRegular(path.join(hostedRoot, 'drizzle', name));
      if (digest(bytes) !== expectedInputs['hosted/drizzle/' + name]) fail('fixture_migration_changed');
      for (const statement of bytes.toString('utf8').split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run();
      schema.push({name, sha256: digest(bytes)});
    }
    await writePrivate(path.join(state, 'runtime-inputs.json'), {workerSHA256: bundle.sha256, sourceInputs: expectedInputs, schema, reviewEpoch});
    async function internal(route, {method = 'GET', body} = {}) {
      if (closed || closing) fail('fixture_runtime_closed');
      const headers = new Headers({'x-native-journey-runtime': runtimeToken});
      if (body !== undefined) headers.set('content-type', 'application/json');
      const response = await mf.dispatchFetch(SERVICE_ORIGIN + route, {method, headers,
        ...(body === undefined ? {} : {body: JSON.stringify(body)})});
      if (!response.ok) fail('fixture_control_rejected');
      return response.json();
    }
    return {
      stateDirectory: state, workerSHA256: bundle.sha256, dispose,
      async provision() {
        if (provisioningAttempted) fail('fixture_provision_already_attempted');
        provisioningAttempted = true;
        const value = await internal('/__native-journey/provision', {method: 'POST'});
        assertBlankWorkspace(value.initialWorkspace);
        await writePrivate(path.join(state, 'connection.private.json'), value);
        return value; // Sensitive token: only private adapter configuration may receive this object.
      },
      async setBoard(value) {
        if (!['open', 'closed', 'unavailable'].includes(value)) fail('fixture_control_invalid');
        if (nativeInFlight !== 0) fail('fixture_requests_still_running');
        return internal('/__native-journey/control', {method: 'POST', body: {board: value}});
      },
      recordDispatchRejection() { forbiddenDispatchAttempts++; },
      async dispatchNative(target, {method = 'GET', headers, bodyText} = {}) {
        if (closed || closing || calls.length >= 512) fail('fixture_runtime_closed');
        let route;
        try { route = nativeRoute(target, method); }
        catch (error) { if (error.code === 'fixture_dispatch_denied') forbiddenDispatchAttempts++; throw error; }
        if (bodyText !== undefined && (typeof bodyText !== 'string' || Buffer.byteLength(bodyText) > route.maximumBodyBytes)) fail('fixture_body_too_large');
        const forwarded = nativeHeaders(headers, SERVICE_ORIGIN); forwarded.set('x-native-journey-runtime', runtimeToken);
        const started = new Date().toISOString(); nativeInFlight++;
        try {
          const response = await mf.dispatchFetch(SERVICE_ORIGIN + target, {method, headers: forwarded,
            ...(bodyText === undefined || route.maximumBodyBytes === 0 ? {} : {body: bodyText})});
          calls.push({method, path: route.pathname, requestBodySHA256: digest(bodyText ?? ''),
            requestBytes: Buffer.byteLength(bodyText ?? ''), nativeTokenPresent: forwarded.has('authorization'),
            status: response.status, startedAt: started, finishedAt: new Date().toISOString()});
          return response;
        } finally { nativeInFlight--; }
      },
      async evidence() {
        if (nativeInFlight !== 0) fail('fixture_requests_still_running');
        const worker = await internal('/__native-journey/evidence');
        const value = {...worker, outboundAttempts, forbiddenDispatchAttempts: worker.forbiddenDispatchAttempts + forbiddenDispatchAttempts,
          workerSHA256: bundle.sha256, nativeCalls: calls.slice(), hostOutboundCheckObserved: true};
        assertZeroDispatch(value);
        return value;
      },
    };
  } catch (error) {
    try { await dispose(); } catch { fail('fixture_startup_cleanup_failed'); }
    throw error instanceof FixtureError ? error : new FixtureError('fixture_startup_failed', 503);
  }
}
