import http from 'node:http';
import {readFile, writeFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createJourneyHarness, readFixtureBody} from './fixtures/journey-browser/harness.mjs';

// An owned parent closes through its private IPC channel. Miniflare's SIGTERM
// hook exits synchronously, before our asynchronous state cleanup can finish.
let shutdownRequested = false, shutdownReady = false;
process.on('message', message => {
  if (message !== 'career-finder-owned-preview-stop-v1') return;
  shutdownRequested = true;
  if (shutdownReady) void shutdown();
});

const args = process.argv.slice(2);
if (![4, 6].includes(args.length) || args[0] !== '--output-dir' || args[2] !== '--state-dir' || !path.isAbsolute(args[1]) || !path.isAbsolute(args[3]) || args.length === 6 && (args[4] !== '--port' || !/^\d{1,5}$/.test(args[5]))) throw Error('Usage: node tests/serve-journey-browser.mjs --output-dir /absolute/bundle --state-dir /absolute/isolated-state [--port PORT]');
const requestedPort = args.length === 6 ? Number(args[5]) : 0;
if (requestedPort !== 0 && (requestedPort < 1024 || requestedPort > 65535)) throw Error('Use port 0 or an unprivileged owned fixture port');
const output = path.resolve(args[1]), harness = await createJourneyHarness(args[3]);
const manifest = await readFile(path.join(output, 'source-manifest.json'));
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.png': 'image/png', '.pdf': 'application/pdf', '.json': 'application/json'};
let origin, closing = false;
const server = http.createServer(async (request, response) => {
  try {
    if (!origin || request.headers.host !== new URL(origin).host || request.headers['sec-fetch-site'] === 'cross-site' || request.headers.origin && request.headers.origin !== origin) {response.writeHead(403); response.end('Synthetic fixture origin denied'); return;}
    const url = new URL(request.url, origin);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/__journey/')) {
      if (!['GET', 'POST', 'PUT'].includes(request.method) || request.method !== 'GET' && request.headers.origin !== origin) {response.writeHead(403); response.end('Synthetic fixture method denied'); return;}
      const raw = await readFixtureBody(request);
      const result = await harness.call(url.pathname + url.search, {actor: request.headers['x-journey-actor'] ?? 'guest', method: request.method, ...(raw ? {raw} : {})});
      response.writeHead(result.status, {'Content-Type': result.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'});
      response.end(Buffer.from(await result.arrayBuffer())); return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {response.writeHead(405); response.end(); return;}
    const relative = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    if (relative.includes('..') || relative.includes('\\') || !/^(?:index\.html|frame\.html|source-manifest\.json|app\.js|app\.css|theme-init\.js|controls\.js|pdf-worker-[a-f0-9]+\.js|phone-icon-192\.png|fonts\/[a-z-]+\.woff2|brand\/[a-z-]+\.(?:png|ttf)|fixture-pdfs\/[a-zA-Z0-9-]+\.pdf)$/.test(relative)) {response.writeHead(404); response.end(); return;}
    const file = path.join(output, relative);
    if (!(await stat(file)).isFile()) throw Error('Not a fixture file');
    const bytes = await readFile(file);
    response.writeHead(200, {'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'});
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    const status = error.code === 'ENOENT' ? 404 : error.code === 'fixture_body_too_large' ? 413 : error.code === 'fixture_body_invalid_utf8' ? 400 : 500;
    response.writeHead(status, {'Content-Type': 'text/plain', 'Cache-Control': 'no-store'});
    response.end('Synthetic fixture request failed. Inspect the local test log.');
    console.error(error);
  }
});
try {await new Promise((resolve, reject) => {server.once('error', reject); server.listen(requestedPort, '127.0.0.1', resolve);});}
catch (error) {await harness.dispose(); throw error;}
origin = `http://127.0.0.1:${server.address().port}`;
const receipt = {scope: 'Synthetic local journey only', pid: process.pid, startedAt: new Date().toISOString(), command: [process.execPath, ...process.argv.slice(1)], cwd: process.cwd(), origin, output, stateDirectory: harness.stateDirectory, sourceManifestSHA256: createHash('sha256').update(manifest).digest('hex'), workerSHA256: harness.workerSHA256, externalOutbound: 'deny-all', capability: 'simulated true envelope; actual handler and receipts remain test mode'};
await writeFile(path.join(output, 'server-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
async function shutdown() {
  if (closing) return; closing = true;
  await new Promise(resolve => server.close(resolve));
  await harness.dispose();
  console.log(JSON.stringify({stoppedAt: new Date().toISOString(), outboundAttempts: harness.outboundAttempts}));
  if (process.connected) process.disconnect();
}
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
shutdownReady = true;
if (shutdownRequested) void shutdown();
