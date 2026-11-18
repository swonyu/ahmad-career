import http from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scenarios, findScenario, discoveryReply } from "./scenarios.mjs";
const here = dirname(fileURLToPath(import.meta.url));
const assets = new Map([
  ["/", ["index.html", "text/html"]], ["/phone", ["index.html", "text/html"]],
  ...["fixture.js", "fixture.js.map", "production.css", "fixture.css", "build-metadata.json"].map(name => ["/" + name, [name, name.endsWith(".css") ? "text/css" : name.endsWith(".js") ? "text/javascript" : "application/json"]]),
  ["/phone-icon-192.png", ["phone-icon-192.png", "image/png"]],
  ["/brand/google-signin-icon.png", ["brand/google-signin-icon.png", "image/png"]],
  ["/brand/google-sans-medium.ttf", ["brand/google-sans-medium.ttf", "font/ttf"]],
  ["/fonts/noto-sans-arabic-arabic.woff2", ["fonts/noto-sans-arabic-arabic.woff2", "font/woff2"]],
  ["/fonts/noto-sans-arabic-latin.woff2", ["fonts/noto-sans-arabic-latin.woff2", "font/woff2"]],
]);
export function createFixtureServer(port = 4181) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Choose an unprivileged port.");
  const origin = "http://127.0.0.1:" + port;
  let session = { scenario: findScenario("capped"), generation: 0, generatedAt: new Date().toISOString() }, delayMs = 250, requests = [], sequence = 0;
  const state = () => ({ scenarioId: session.scenario.id, generation: session.generation, delayMs, scenarios: scenarios.map(({ id, label }) => ({ id, label })), requests, counts: Object.fromEntries([...new Set(requests.map(row => row.method + " " + row.path))].map(key => [key, requests.filter(row => row.method + " " + row.path === key).length])), externalServicesImplemented: false });
  const send = (response, body, status = 200) => { response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify(body)); };
  const server = http.createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'");
    try {
      if (request.headers.host !== "127.0.0.1:" + port || request.headers.origin && request.headers.origin !== origin) return send(response, { error: "Use the exact loopback origin." }, 403);
      const url = new URL(request.url, origin), method = request.method || "GET";
      if (url.pathname === "/__fixture/state" && method === "GET") return send(response, state());
      if (url.pathname === "/__fixture/scenario" && method === "POST") {
        let text = "";
        for await (const chunk of request) { text += chunk; if (text.length > 1024) throw new Error("Control payload too large."); }
        const body = JSON.parse(text);
        if (!scenarios.some(item => item.id === body.scenarioId) || !Number.isInteger(body.delayMs) || body.delayMs < 0 || body.delayMs > 2500) return send(response, { error: "Unknown scenario or delay." }, 400);
        session = { scenario: findScenario(body.scenarioId), generation: session.generation + 1, generatedAt: new Date().toISOString() };
        delayMs = body.delayMs; requests = []; sequence = 0;
        return send(response, state());
      }
      if (url.pathname.startsWith("/api/")) {
        const captured = session, reply = discoveryReply(method, url, captured);
        const row = { id: ++sequence, method, path: url.pathname, query: Object.fromEntries(url.searchParams), startedAt: new Date().toISOString(), status: null, offset: reply.offset ?? null, jobsReturned: reply.body.jobs?.length ?? null, nextCursorPresent: Boolean(reply.body.nextCursor), sourceStatus: reply.body.sources?.[0]?.status ?? null, denied: reply.status !== 200 };
        requests.push(row); requests = requests.slice(-100);
        response.on("close", () => { if (!response.writableFinished) row.aborted = true; });
        if (reply.status === 200) await new Promise(done => setTimeout(done, delayMs));
        if (response.destroyed) return;
        if (captured !== session) { row.status = 409; return send(response, { ok: false, error: { code: "cursor_expired", message: "The synthetic scenario changed. Start the search again." } }, 409); }
        row.status = reply.status; row.completedAt = new Date().toISOString();
        return send(response, reply.body, reply.status);
      }
      if (url.pathname === "/favicon.ico" && method === "GET") { response.writeHead(204); return response.end(); }
      const asset = assets.get(url.pathname);
      if (asset && method === "GET") { const value = await readFile(join(here, "public", asset[0])); response.writeHead(200, { "Content-Type": asset[1] + (asset[1].startsWith("text/") ? "; charset=utf-8" : "") }); return response.end(value); }
      return send(response, { error: "Out-of-scope fixture route denied." }, 403);
    } catch (error) {
      if (!response.headersSent) send(response, { error: "Fixture request rejected." }, 400); else response.destroy();
    }
  });
  return { server, origin };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argument = process.argv.indexOf("--port"), port = argument < 0 ? 4181 : Number(process.argv[argument + 1]);
  const { server, origin } = createFixtureServer(port);
  server.on("error", error => { console.error("Fixture could not start:", error.code || error.message); process.exitCode = 1; });
  server.listen(port, "127.0.0.1", () => console.log("Synthetic search fixture ready: " + origin + "\nOnly discovery sources/search GETs are supported. No real accounts/providers. Stop only this process when done."));
}
