import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const hosted = path.join(root, "hosted");
const require = createRequire(path.join(hosted, "package.json"));
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
const { configureToolEnvironment } = await import(path.join(hosted, "scripts/tool-environment.mjs"));
configureToolEnvironment(hosted);
const manifest = JSON.parse(await readFile(path.join(hosted, "dist/build-manifest.json"), "utf8"));
if (manifest.preview !== false) throw Error("Expected production build");
const hash = b => createHash("sha256").update(b).digest("hex");
for (const [name, expected] of Object.entries(manifest.sourceHashes)) {
 if (hash(await readFile(path.join(hosted, name))) !== expected) throw Error("Build source changed: " + name);
}
const mf = new Miniflare(convertV4MiniflareOptions({
 host: "127.0.0.1", port: 4188, modules: true, scriptPath: path.join(hosted, "dist/server/index.js"), cf: false,
 compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
 d1Databases: ["DB"], r2Buckets: ["BUCKET"],
 outboundService: async () => new Response("Local review has no external provider access", { status: 503 }),
}));
await mf.ready;
const receipt = { atUTC: new Date().toISOString(), pid: process.pid, node: process.version, url: "http://127.0.0.1:4188/phone", sourceRoot: hosted, server: manifest.server, sourceInputs: Object.keys(manifest.sourceHashes).length, productionBuild: true, account: "synthetic anonymous guest", outbound: "blocked", persistentServerStorage: false };
await writeFile(new URL("./browser-server.json", import.meta.url), JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt));
let closing = false;
async function close() { if (closing) return; closing = true; await mf.dispose(); process.exitCode = 0; }
process.once("SIGTERM", close); process.once("SIGINT", close);
