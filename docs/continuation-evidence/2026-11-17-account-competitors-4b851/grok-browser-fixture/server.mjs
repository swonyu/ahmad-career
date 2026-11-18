import http from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { accountId, findScenario, makeStatus, scenarios } from "./scenarios.mjs";
const here = dirname(fileURLToPath(import.meta.url)), publicRoot = join(here, "public");
const portArg = process.argv.indexOf("--port");
const port = portArg < 0 ? 4179 : Number(process.argv[portArg + 1]);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Use --port with an unprivileged TCP port.");
const origin = "http://127.0.0.1:" + port;
let scenario = findScenario("healthy"), delayMs = 1500, status = makeStatus(scenario), requests = [], sequence = 0, generation = 0, repaired = false;
const state = () => ({
  scenarioId: scenario.id, delayMs, repaired, requests,
  counts: Object.fromEntries([...new Set(requests.map(row => row.method + " " + row.path))].map(key => [key, requests.filter(row => row.method + " " + row.path === key).length])),
});
const error = (code, message, httpStatus) => ({ httpStatus, body: { ok: false, error: { code, message } } });
const ok = body => ({ httpStatus: 200, body: { ok: true, ...body } });
function sendJSON(response, value, code = 200) {
  response.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}
async function readJSON(request) {
  let body = "";
  for await (const chunk of request) { body += chunk; if (body.length > 8192) throw new Error("Fixture request too large"); }
  return body ? JSON.parse(body) : {};
}
function replyFor(path, method, body) {
  if (path === "/api/auth/status" && method === "GET") {
    if (scenario.invalidSession && !repaired) return error("invalid_session", "This browser session has expired. Sign out and sign in again.", 401);
    if (scenario.statusError && !repaired) return error("unavailable", "The service is temporarily unavailable. Try again.", 503);
    return ok(structuredClone(status));
  }
  if (path === "/api/auth/signout" && method === "POST") {
    if (scenario.signoutError && !repaired) return error("unavailable", "Sign-in recovery could not be completed.", 503);
    if (body.expectedAccountId && body.expectedAccountId !== accountId) return error("account_changed", "The active account changed. Refresh before trying again.", 409);
    return ok({ redirectTo: "/account?component=recovery&fixture_return=recovered" });
  }
  if (path === "/api/auth/connect" && method === "POST") {
    if (body.expectedAccountId !== accountId || !["google", "linkedin"].includes(body.provider)) return error("invalid_request", "Synthetic account or provider did not match.", 409);
    // Intentionally rejected by the REAL authorizationTarget guard. Never return
    // a provider URL, authorization code, token, or external redirect.
    return ok({ authorizationUrl: origin + "/__fixture/blocked-authorization" });
  }
  if (path === "/api/auth/disconnect" && method === "POST") {
    const provider = status.providers[body.provider];
    if (body.expectedAccountId !== accountId || !provider || body.expectedConnectionId !== provider.connectionId) return error("connection_changed", "This connection changed. Check its current status before trying again.", 409);
    if (scenario.disconnectError && !repaired) return error("unavailable", "This connection could not be changed. Check its current status before trying again.", 503);
    if (scenario.disconnectLastMethod && !repaired) return error("last_sign_in_method", "Your only sign-in method cannot be removed.", 409);
    if (!(scenario.disconnectUnconfirmed && !repaired)) {
      provider.connected = false; delete provider.connectionId; delete provider.displayName;
    }
    return ok({});
  }
  return error("not_found", "No synthetic fixture endpoint matches this request.", 404);
}
const staticFiles = new Map([
  ["/fixture.js", ["fixture.js", "text/javascript; charset=utf-8"]],
  ["/fixture.js.map", ["fixture.js.map", "application/json"]],
  ["/fixture.css", ["fixture.css", "text/css; charset=utf-8"]],
  ["/production.css", ["production.css", "text/css; charset=utf-8"]],
  ["/build-metadata.json", ["build-metadata.json", "application/json"]],
  ["/brand/google-signin-icon.png", ["brand/google-signin-icon.png", "image/png"]],
  ["/brand/google-sans-medium.ttf", ["brand/google-sans-medium.ttf", "font/ttf"]],
  ["/fonts/noto-sans-arabic-arabic.woff2", ["fonts/noto-sans-arabic-arabic.woff2", "font/woff2"]],
  ["/fonts/noto-sans-arabic-latin.woff2", ["fonts/noto-sans-arabic-latin.woff2", "font/woff2"]],
]);
const shells = new Set(["/", "/account", "/connect", "/phone"]);
const authStubs = new Set(["/auth/google/start", "/auth/linkedin/start", "/signin-with-chatgpt", "/signout-with-chatgpt", "/__fixture/blocked-authorization"]);
const server = http.createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'");
  try {
    if (request.headers.host !== "127.0.0.1:" + port) return sendJSON(response, { error: "Use the exact 127.0.0.1 loopback URL." }, 403);
    if (request.headers.origin && request.headers.origin !== origin) return sendJSON(response, { error: "Cross-origin requests are not accepted." }, 403);
    const url = new URL(request.url, origin), path = url.pathname, method = request.method;
    if (path === "/__fixture/state" && method === "GET") return sendJSON(response, state());
    if (path === "/__fixture/scenario" && method === "POST") {
      const body = await readJSON(request);
      if (!scenarios.some(item => item.id === body.scenarioId) || !Number.isInteger(body.delayMs) || body.delayMs < 0 || body.delayMs > 25000) return sendJSON(response, { error: "Unknown scenario or delay." }, 400);
      scenario = findScenario(body.scenarioId); delayMs = body.delayMs; status = makeStatus(scenario); requests = []; sequence = 0; generation++; repaired = false;
      return sendJSON(response, state());
    }
    if (path === "/__fixture/repair" && method === "POST") {
      await readJSON(request); repaired = true; status.account.id = accountId;
      return sendJSON(response, state());
    }
    if (path.startsWith("/api/auth/")) {
      const body = method === "POST" ? await readJSON(request) : undefined;
      const row = { id: ++sequence, method, path, status: null, ...(body ? { body } : {}) };
      requests.push(row); requests = requests.slice(-200);
      const capturedGeneration = generation;
      response.on("close", () => { if (!response.writableFinished) row.aborted = true; });
      await new Promise(resolve => setTimeout(resolve, delayMs));
      if (capturedGeneration !== generation) return sendJSON(response, { ok: false, error: { code: "fixture_reset", message: "The synthetic scenario was reset." } }, 409);
      const reply = replyFor(path, method, body ?? {}); row.status = reply.httpStatus;
      if (!response.destroyed) return sendJSON(response, reply.body, reply.httpStatus);
      return;
    }
    if (authStubs.has(path) && method === "GET") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return response.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Local authentication stub</title><link rel="stylesheet" href="/production.css"><link rel="stylesheet" href="/fixture.css"></head><body><main class="fixture-main"><h1>Local authentication stub reached</h1><p>No external provider was contacted. No sign-in, sign-out, account connection or authentication took place.</p><p><a class="button" href="/?component=signin">Return to the component fixture</a></p></main></body></html>');
    }
    if (path === "/favicon.ico") { response.writeHead(204); return response.end(); }
    const asset = shells.has(path) ? ["index.html", "text/html; charset=utf-8"] : staticFiles.get(path);
    if (asset && method === "GET") { response.writeHead(200, { "Content-Type": asset[1] }); return response.end(await readFile(join(publicRoot, asset[0]))); }
    sendJSON(response, { error: "Fixture route not found." }, 404);
  } catch {
    if (!response.headersSent) sendJSON(response, { error: "Synthetic fixture request could not be handled." }, 400);
    else response.destroy();
  }
});
server.listen(port, "127.0.0.1", () => console.log("Synthetic fixture ready: " + origin + "\nNo live auth/providers. Stop only this process with Ctrl-C when finished."));
server.on("error", error => { console.error("Fixture listener could not start:", error.code ?? error.message); process.exitCode = 1; });
