import { createServer } from "node:http";
import { readFileSync, unlinkSync } from "node:fs";
import { once } from "node:events";
import { Readable } from "node:stream";
import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { projectRoot } from "./sites-env.mjs";
import { readExecutionProfile } from "./execution-profile.mjs";
import { buildSite } from "./build-site.mjs";
import { connectorPreview } from "./vite/connector-preview-plugin.mjs";

export async function startPreview(args = []) {
  const options = { host: "127.0.0.1", port: 5173 };
  for (let i = 0; i < args.length;) {
    const option = args[i++];
    // The managed Sites launcher passes this flag. listen() already fails on
    // an occupied port; this preview never falls back to a different one.
    if (option === "--strictPort") continue;
    const value = args[i++];
    if (!["--host", "--port"].includes(option) || !value || value.startsWith("--")) throw Error("Preview accepts --host and --port pairs, plus --strictPort.");
    if (option === "--host") options.host = value;
    else options.port = Number(value);
  }
  const managed = readExecutionProfile() === "managed-linux";
  if (!(options.host === "127.0.0.1" || managed && options.host === "0.0.0.0") ||
      !Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) throw Error("Use a valid preview port and the permitted local host.");
  const runtime = path.join(projectRoot, ".sites-runtime");
  await mkdir(runtime, { recursive: true });
  const lockPath = path.join(runtime, "preview.lock");
  const lock = await open(lockPath, "wx");
  await lock.writeFile(JSON.stringify({ pid: process.pid, started: new Date().toISOString(), ...options }));
  // Miniflare also handles termination. Release only this process's lock even
  // when its signal handler exits before asynchronous disposal has completed.
  process.once("exit", () => {
    try {
      if (JSON.parse(readFileSync(lockPath, "utf8")).pid === process.pid) unlinkSync(lockPath);
    } catch (error) { if (error.code !== "ENOENT") console.error("Preview lock cleanup failed:", error.message); }
  });
  let mf, server;
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    if (server) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    if (mf) await mf.dispose();
    await lock.close();
    await unlink(lockPath);
  }
  try {
    const output = path.join(runtime, "preview-dist");
    await buildSite({ preview: true, outputDir: output });
    const helper = await build({
      absWorkingDir: projectRoot, entryPoints: ["scripts/vite/sites-vite-plugin.ts"],
      bundle: true, format: "esm", platform: "node", write: false, target: "es2022",
    });
    const helperPath = path.join(runtime, "preview-middleware-" + process.pid + ".mjs");
    await writeFile(helperPath, helper.outputFiles[0].contents);
    const { sites } = await import(pathToFileURL(helperPath).href);
    const handlers = [];
    const previewServer = {
      config: { server: { port: options.port, https: false }, logger: { info: message => console.log(message) } },
      middlewares: {
        use(route, handler) {
          handlers.push(typeof route === "function" ? { route: null, handler: route } : { route, handler });
        },
      },
    };
    const localAuth = sites({ mockAuth: !managed });
    localAuth.configResolved({ root: projectRoot, command: "serve" });
    localAuth.configureServer(previewServer);
    const connectors = connectorPreview();
    connectors.configResolved({ root: projectRoot });
    connectors.configureServer(previewServer);
    const connectorModule = connectors.load.call({ environment: { name: "server" } }, "\0virtual:sites-connector-preview", { ssr: true });
    if (typeof connectorModule !== "string") throw Error("The preserved connector adapter did not provide its server binding.");
    const connectorBundle = await build({
      absWorkingDir: projectRoot, entryPoints: ["scripts/connector-preview/worker.mjs"],
      bundle: true, format: "esm", platform: "neutral", external: ["cloudflare:*"],
      write: false, target: "es2022",
      plugins: [{ name: "connector-preview-module", setup(builder) {
        builder.onResolve({ filter: /^virtual:sites-connector-preview$/ }, () => ({ path: "binding", namespace: "connector-preview" }));
        builder.onLoad({ filter: /.*/, namespace: "connector-preview" }, () => ({ contents: connectorModule, loader: "js" }));
      } }],
    });
    const hosting = JSON.parse(await readFile(path.join(projectRoot, ".openai/hosting.json"), "utf8"));
    mf = new Miniflare(convertV4MiniflareOptions({
      host: "127.0.0.1", port: 0, cf: false,
      defaultPersistRoot: path.join(runtime, "preview-storage"),
      d1Persist: true, r2Persist: true,
      workers: [{
        name: "career-preview", modules: true, scriptPath: path.join(output, "server/index.js"),
        compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
        d1Databases: { [hosting.d1]: "00000000-0000-4000-8000-000000000000" },
        r2Buckets: { [hosting.r2]: "site-creator-r2" },
        serviceBindings: { CONNECTORS: { name: "sites-connector-preview", entrypoint: "ConnectorPreview" } },
      }, {
        name: "sites-connector-preview", modules: true, script: connectorBundle.outputFiles[0].text,
        compatibilityDate: "2026-05-15",
      }],
    }));
    await mf.ready;
    async function forward(request, response) {
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) for (const part of value) headers.append(name, part);
        else if (value !== undefined) headers.set(name, value);
      }
      const origin = "http://" + request.headers.host;
      const target = new URL(request.url ?? "/", origin);
      const result = await mf.dispatchFetch(target.href, {
        method: request.method, headers, redirect: "manual",
        ...(["GET", "HEAD"].includes(request.method ?? "GET") ? {} : { body: Readable.toWeb(request), duplex: "half" }),
      });
      response.statusCode = result.status;
      for (const [name, value] of result.headers) if (name !== "set-cookie") response.setHeader(name, value);
      const cookies = result.headers.getSetCookie();
      if (cookies.length) response.setHeader("set-cookie", cookies);
      if (!result.body) { response.end(); return; }
      const reader = result.body.getReader();
      try {
        while (!response.destroyed) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!response.write(value)) await once(response, "drain");
        }
        response.end();
      } finally { await reader.cancel(); }
    }
    server = createServer((request, response) => {
      const allowed = new Set(["127.0.0.1", "localhost", ...(managed ? ["terminal.local"] : [])]);
      let authority;
      try { authority = new URL("http://" + request.headers.host); } catch {}
      if (!authority || !allowed.has(authority.hostname) || Number(authority.port || 80) !== options.port) {
        response.writeHead(403); response.end("Unsupported preview host."); return;
      }
      let index = 0;
      const failed = error => {
        console.error("Preview request failed:", error.message);
        if (!response.headersSent) response.writeHead(500, { "Cache-Control": "no-store" });
        response.end("This preview request could not complete.");
      };
      const next = () => {
        if (response.writableEnded) return;
        const entry = handlers[index++];
        if (!entry) { forward(request, response).catch(failed); return; }
        if (entry.route && new URL(request.url ?? "/", authority).pathname !== entry.route) { next(); return; }
        try { Promise.resolve(entry.handler(request, response, next)).catch(failed); } catch (error) { failed(error); }
      };
      next();
    });
    server.listen(options.port, options.host);
    await once(server, "listening");
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, () => {
      close().then(() => { process.exitCode = 0; }).catch(error => { console.error(error.message); process.exitCode = 1; });
    });
    console.log("Local: http://127.0.0.1:" + options.port);
    console.log("Explicit esbuild preview. Restart after source changes; production output remains separate.");
    return { close, url: "http://127.0.0.1:" + options.port };
  } catch (error) { await close(); throw error; }
}
