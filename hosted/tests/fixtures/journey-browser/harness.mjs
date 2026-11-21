import {readFile, readdir, mkdir, writeFile, open, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {SERVICE_ORIGIN} from '../../../server/applications.mjs';

export const sourceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
export async function readFixtureBody(stream, maximumBytes = 8 * 1024 * 1024) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0 || maximumBytes > 8 * 1024 * 1024) throw Error('Invalid fixture body byte limit');
  const chunks = []; let length = 0;
  for await (const chunk of stream) {
    if (!Buffer.isBuffer(chunk)) throw Error('Fixture request body must provide byte buffers');
    length += chunk.length;
    if (length > maximumBytes) throw Object.assign(Error('Synthetic fixture request exceeds its byte limit'), {code: 'fixture_body_too_large'});
    chunks.push(chunk);
  }
  // Network chunk boundaries can split Arabic text or a surrogate-pair code point.
  // Decode the complete bounded byte sequence once, rejecting invalid UTF-8.
  try {return new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks, length));}
  catch {throw Object.assign(Error('Synthetic fixture request has invalid UTF-8'), {code: 'fixture_body_invalid_utf8'});}
}
export async function createJourneyHarness(stateDirectory) {
  if (!path.isAbsolute(stateDirectory)) throw Error('Use an absolute isolated fixture state directory');
  const state = path.resolve(stateDirectory), relative = path.relative(sourceRoot, state);
  if (!relative.startsWith('..' + path.sep)) throw Error('Fixture state must be outside the production source tree');
  await mkdir(state, {recursive: true});
  const lockPath = path.join(state, 'runtime-owner.json'), lock = await open(lockPath, 'wx');
  await lock.writeFile(JSON.stringify({pid: process.pid, startedAt: new Date().toISOString(), sourceRoot}));
  await lock.close();
  let mf, disposed = false, outboundAttempts = 0;
  const dispose = async () => {if (disposed) return; disposed = true; try {await mf?.dispose();} finally {await rm(lockPath);}};
  try {
    // Avoid optional external metadata and telemetry, including the known cf.json path.
    process.env.CLOUDFLARE_CF_FETCH_ENABLED = 'false';
    const reviewPath = path.join(state, 'fixture-review.json');
    let review;
    try {review = JSON.parse(await readFile(reviewPath, 'utf8'));} catch (error) {if (error.code !== 'ENOENT') throw error; review = {reviewedAt: Date.now() - 1000}; await writeFile(reviewPath, JSON.stringify(review) + '\n', {flag: 'wx'});}
    if (!Number.isSafeInteger(review.reviewedAt) || review.reviewedAt <= 0) throw Error('Invalid synthetic requirements review epoch');
    const {Miniflare, convertV4MiniflareOptions} = await import('miniflare');
    const bundle = await build({entryPoints: [new URL('./runtime.mjs', import.meta.url).pathname], bundle: true, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'], target: 'es2022', external: ['node:*'], write: false});
    mf = new Miniflare(convertV4MiniflareOptions({
      modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'],
      d1Databases: ['DB'], r2Buckets: ['BUCKET'], bindings: {JOURNEY_REVIEW_EPOCH: review.reviewedAt}, cf: false, telemetry: {enabled: false},
      host: '127.0.0.1', port: 0, inspectorHost: '127.0.0.1', inspectorPort: 0,
      resourcePersistencePath: path.join(state, 'resources'), isolatedResourcePersistencePath: path.join(state, 'isolated-resources'),
      unsafeDevRegistryPath: path.join(state, 'registry'),
      outboundService: () => {outboundAttempts++; throw Error('Real outbound requests are forbidden in the synthetic journey');},
    }));
    const db = await mf.getD1Database('DB');
    const migrations = [];
    for (const filename of (await readdir(path.join(sourceRoot, 'drizzle'))).filter(name => name.endsWith('.sql')).sort()) {
      const sql = await readFile(path.join(sourceRoot, 'drizzle', filename), 'utf8');
      migrations.push({filename, sql, sha256: digest(sql)});
    }
    const schema = migrations.map(({filename, sha256}) => ({filename, sha256}));
    const marker = path.join(state, 'fixture-schema.json');
    let previous;
    try {previous = JSON.parse(await readFile(marker, 'utf8'));} catch (error) {if (error.code !== 'ENOENT') throw error;}
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(schema)) throw Error('The persisted fixture schema differs; choose a new isolated directory');
    } else {
      for (const {sql} of migrations) for (const statement of sql.split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean)) await db.prepare(statement).run();
      await writeFile(marker, JSON.stringify(schema, null, 2) + '\n', {flag: 'wx'});
    }
    return {mf, db, dispose, stateDirectory: state, workerSHA256: digest(bundle.outputFiles[0].text), get outboundAttempts() {return outboundAttempts;},
      async call(route, {actor = 'guest', method = 'GET', body, raw, headers = {}} = {}) {
        const h = new Headers({'sec-fetch-site': 'same-origin', 'x-journey-actor': actor, ...headers});
        if (method !== 'GET') h.set('origin', SERVICE_ORIGIN);
        if (body !== undefined || raw !== undefined) h.set('content-type', 'application/json');
        return mf.dispatchFetch(SERVICE_ORIGIN + route, {method, headers: h, ...(body !== undefined ? {body: JSON.stringify(body)} : raw !== undefined ? {body: raw} : {})});
      },
    };
  } catch (error) {await dispose(); throw error;}
}
