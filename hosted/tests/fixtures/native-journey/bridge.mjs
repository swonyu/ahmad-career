// No automatic startup, certificate creation or trust installation on import.
import https from 'node:https';
import {readFile, open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash, randomBytes} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import path from 'node:path';
import {fixtureCertificates} from '../../../../website/applications/fixtures/certificates.mjs';
import {repositoryRoot} from './harness.mjs';
import {PDF} from './data.mjs';
import {FixtureError, matchesSecret, nativeRoute, decodeBody} from './contract.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (code, status = 400) => { throw new FixtureError(code, status); };
function publicFailure(response, code, status) {
  if (response.destroyed) return;
  if (response.headersSent) { response.destroy(); return; }
  response.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Connection': 'close'});
  response.end(JSON.stringify({ok: false, error: {code}}));
}
/** Future explicit action. Call only after the source/runner and fresh resource gates are approved. */
export async function startNativeJourneyBridge({harness, port, signal}) {
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535 || !harness?.stateDirectory) fail('fixture_bridge_configuration_invalid');
  if (signal?.aborted) fail('fixture_bridge_cancelled', 503);
  const pdfPath = path.join(repositoryRoot, PDF.relativePath);
  const pdfFile = await open(pdfPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let pdf;
  try {
    const stat = await pdfFile.stat();
    if (!stat.isFile() || stat.size !== PDF.bytes) fail('fixture_pdf_changed', 503);
    pdf = await pdfFile.readFile();
  } finally { await pdfFile.close(); }
  if (pdf.length !== PDF.bytes || digest(pdf) !== PDF.sha256) fail('fixture_pdf_changed', 503);
  if (signal?.aborted) fail('fixture_bridge_cancelled', 503);
  const tls = fixtureCertificates(path.join(harness.stateDirectory, 'certificates'));
  const [key, cert] = await Promise.all([readFile(tls.keyPath), readFile(tls.certPath)]);
  if (signal?.aborted) fail('fixture_bridge_cancelled', 503);
  const bridgeToken = randomBytes(32).toString('hex'), documentNonce = randomBytes(24).toString('hex');
  const documentPaths = Object.fromEntries(PDF.names.map(name => [`/__native-journey-documents/${documentNonce}/${name}`, name]));
  const allowedHosts = new Set([`127.0.0.1:${port}`, `10.0.2.2:${port}`]);
  const events = [], sockets = new Set();
  const stats = {apiRequests: 0, documentRequests: { 'CV-A.pdf': 0, 'CV-B.pdf': 0 },
    deniedRequests: 0, proxyRequests: 0, socketErrors: 0, tlsErrors: 0};
  const search = {started:0, completed:0, lastDurationMs:null, lastStatusClass:null};
  const profileWrites = {admitted:0, completed:0, inFlight:0,
    lastAdmittedAtUTC:null, lastCompletedAtUTC:null, lastDurationMs:null, lastStatusClass:null};
  let lastTlsErrorAtMs = null;
  const activeSearches = new Set();
  let server, closing, stopped = false, startupSettled = false, inFlight = 0;
  function event(code) {
    // Only fixed event codes: no request URL, credentials, exception or header value.
    if (events.length < 64) events.push({code, observedAt: new Date().toISOString()});
  }
  function rejectSocket(socket, code) {
    socket.on('error', () => { stats.socketErrors++; event('fixture_rejected_socket_error'); });
    event(code); socket.destroy();
  }
  async function handle(request, response) {
    inFlight++;
    let searchRecord, profileStartedAt = null, profileFinished = false;
    const finishSearch = status => {
      if (!searchRecord) return;
      search.completed++;
      search.lastDurationMs = Math.min(300000, Math.round(performance.now() - searchRecord.startedAt));
      search.lastStatusClass = Math.floor(status / 100);
    };
    const finishProfile = status => {
      if (profileStartedAt === null || profileFinished) return;
      profileFinished = true;
      profileWrites.completed++;
      profileWrites.lastCompletedAtUTC = new Date().toISOString();
      profileWrites.lastDurationMs = Math.min(1800000, Math.round(performance.now() - profileStartedAt));
      profileWrites.lastStatusClass = Math.floor(status / 100);
    };
    try {
      if (stopped || signal?.aborted) fail('fixture_bridge_closed', 503);
      if (!['127.0.0.1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress) ||
          !allowedHosts.has(request.headers.host) || !request.url || request.url.length > 10000) fail('fixture_bridge_origin_denied', 403);
      if (Object.hasOwn(documentPaths, request.url) && ['GET', 'HEAD'].includes(request.method)) {
        if (request.headers.authorization || request.headers.cookie || request.headers['x-native-journey-bridge']) fail('fixture_document_credentials_denied', 403);
        const name = documentPaths[request.url]; stats.documentRequests[name]++;
        response.writeHead(200, {'Content-Type': 'application/pdf', 'Content-Length': pdf.length,
          'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'});
        response.end(request.method === 'HEAD' ? undefined : pdf);
        return;
      }
      // The separate transport capability is not native identity. The genuine
      // Authorization header is forwarded intact and checked by the actual handler.
      if (!matchesSecret(request.headers['x-native-journey-bridge'], bridgeToken)) fail('fixture_bridge_authority_denied', 403);
      let route;
      try { route = nativeRoute(request.url, request.method); }
      catch (error) { if (error.code === 'fixture_dispatch_denied') harness.recordDispatchRejection(); throw error; }
      if (route.pathname === '/api/apply/profile' && request.method === 'PUT') {
        profileStartedAt = performance.now();
        profileWrites.admitted++; profileWrites.inFlight++;
        profileWrites.lastAdmittedAtUTC = new Date().toISOString();
      }
      if (route.pathname === '/api/discovery/search') {
        searchRecord = {startedAt:performance.now()};
        activeSearches.add(searchRecord); search.started++;
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (name === 'x-native-journey-bridge') continue;
        if (Array.isArray(value)) fail('fixture_header_ambiguous');
        if (value !== undefined) headers.set(name, value);
      }
      const duplicates = new Map();
      for (let i = 0; i < request.rawHeaders.length; i += 2) {
        const name = request.rawHeaders[i].toLowerCase(); duplicates.set(name, (duplicates.get(name) ?? 0) + 1);
      }
      if (['authorization', 'x-native-journey-bridge', 'host', 'content-type'].some(name => (duplicates.get(name) ?? 0) > 1)) fail('fixture_header_ambiguous');
      const chunks = []; let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > route.maximumBodyBytes) fail('fixture_body_too_large', 413);
        chunks.push(chunk);
      }
      const bodyText = decodeBody(chunks, route.maximumBodyBytes);
      const result = await harness.dispatchNative(request.url, {method: request.method, headers,
        ...(route.maximumBodyBytes === 0 ? {} : {bodyText})});
      stats.apiRequests++;
      const reply = Buffer.from(await result.arrayBuffer());
      if (reply.length > 4 * 1024 * 1024 || result.status < 200 || result.status > 599 || result.headers.has('location') || result.headers.has('set-cookie')) {
        fail('fixture_response_shape_invalid', 503);
      }
      const responseHeaders = {'Content-Type': result.headers.get('content-type') ?? 'application/json',
        'Content-Length': reply.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'};
      // Preserve the actual read protocol and recovery-integrity metadata.
      // Never synthesize a version or forward unrelated service headers.
      for (const name of ['X-Career-Read-Version', 'X-Career-Read-SHA256', 'X-Career-Read-Bytes',
        'X-Career-Read-Workspace-Id', 'X-Career-Read-Account-SHA256']) {
        const value = result.headers.get(name);
        if (value !== null) responseHeaders[name] = value;
      }
      const retryAfter = result.headers.get('retry-after');
      if (retryAfter !== null) responseHeaders['Retry-After'] = retryAfter;
      response.writeHead(result.status, responseHeaders); response.end(reply);
      finishSearch(result.status);
      finishProfile(result.status);
    } catch (error) {
      stats.deniedRequests++;
      const status = error instanceof FixtureError ? error.status : 500;
      finishSearch(status);
      finishProfile(status);
      publicFailure(response, error instanceof FixtureError ? error.code : 'fixture_bridge_failure', status);
    } finally {
      if (searchRecord) activeSearches.delete(searchRecord);
      if (profileStartedAt !== null) profileWrites.inFlight--;
      inFlight--;
    }
  }
  server = https.createServer({key, cert, minVersion: 'TLSv1.2', maxHeaderSize: 16384}, (req, res) => { void handle(req, res); });
  server.requestTimeout = 30000; server.headersTimeout = 10000; server.maxHeadersCount = 64;
  server.on('connection', socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => { stats.socketErrors++; event('fixture_socket_error'); });
  });
  server.on('tlsClientError', () => {
    stats.tlsErrors++; lastTlsErrorAtMs = Date.now(); event('fixture_tls_client_error');
  });
  server.on('clientError', (_error, socket) => rejectSocket(socket, 'fixture_http_client_error'));
  server.on('connect', (_request, socket) => { stats.proxyRequests++; rejectSocket(socket, 'fixture_connect_denied'); });
  server.on('upgrade', (_request, socket) => { stats.proxyRequests++; rejectSocket(socket, 'fixture_upgrade_denied'); });
  async function close() {
    if (closing) return closing;
    stopped = true;
    closing = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { for (const socket of sockets) socket.destroy(); }, 1500);
      server.close(error => {
        clearTimeout(timer); signal?.removeEventListener('abort', abort);
        if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(new FixtureError('fixture_bridge_close_failed', 503));
        else resolve({closed: true, ownSocketCount: sockets.size});
      });
      server.closeIdleConnections();
    });
    return closing;
  }
  // During listen startup, mark cancellation only. Wait for the pending listen
  // to settle before cleanup so it cannot admit a server after an early close.
  const abort = () => { stopped = true; if (startupSettled) void close().catch(() => event('fixture_bridge_close_failed')); };
  signal?.addEventListener('abort', abort, {once: true});
  try {
    if (signal?.aborted) fail('fixture_bridge_cancelled', 503);
    await new Promise((resolve, reject) => {
      const failed = () => reject(new FixtureError('fixture_bridge_listen_failed', 503));
      server.once('error', failed);
      server.listen(port, '127.0.0.1', () => { server.removeListener('error', failed); resolve(); });
    });
    startupSettled = true;
    if (signal?.aborted || stopped) fail('fixture_bridge_cancelled', 503);
    server.on('error', () => { event('fixture_bridge_server_error'); void close().catch(() => event('fixture_bridge_close_failed')); });
    return {
      close, caPath: tls.caPath, caFingerprint256: tls.caFingerprint256, certificateExpiresAt: tls.expiresAt,
      status() {
        const oldest = [...activeSearches].reduce((value, record) => Math.min(value, record.startedAt), Infinity);
        return {search:{...search, inFlight:activeSearches.size,
          oldestInFlightMs:Number.isFinite(oldest) ? Math.min(300000, Math.round(performance.now() - oldest)) : null},
          profileWrites:{...profileWrites}, apiRequests:stats.apiRequests, tlsErrors:stats.tlsErrors,
          lastTlsErrorAtUTC:lastTlsErrorAtMs === null ? null : new Date(lastTlsErrorAtMs).toISOString(),
          lastTlsErrorAgeMs:lastTlsErrorAtMs === null ? null : Math.min(1800000, Math.max(0, Date.now() - lastTlsErrorAtMs))};
      },
      privateConfiguration: {schemaVersion: 1, bridgeToken, port,
        iosOrigin: `https://127.0.0.1:${port}`, androidOrigin: `https://10.0.2.2:${port}`,
        documents: Object.fromEntries(Object.entries(documentPaths).map(([route, name]) => [name, route]))},
      async evidence() {
        if (inFlight !== 0) fail('fixture_requests_still_running', 409);
        const value = await harness.evidence();
        return {...value, bridge: {host: '127.0.0.1', port, ...stats, events: events.slice(), inFlight: 0,
          pdf: {sha256: PDF.sha256, bytes: PDF.bytes, names: PDF.names}, caFingerprint256: tls.caFingerprint256}};
      },
    };
  } catch (error) {
    startupSettled = true;
    await close();
    throw error;
  }
}
