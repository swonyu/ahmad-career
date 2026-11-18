import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { createHash } from "node:crypto";
import { cp, mkdir, open, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { projectRoot } from "./sites-env.mjs";
import { assertPublicBundleInputs } from "./public-bundle-inputs.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const publicFiles = [
  "favicon.ico", "apple-touch-icon.png", "favicon-16.png", "theme-init.js",
  "phone-icon.png", "phone-icon-maskable-192.png", "favicon-32.png",
  "phone-icon-maskable.png", "phone-icon-192.png", "phone.webmanifest", "favicon.svg",
  "brand/google-signin-icon.png", "brand/Google-Sans-OFL.txt", "brand/google-sans-medium.ttf",
  "fonts/noto-sans-arabic-arabic.woff2", "fonts/Noto-Sans-Arabic-OFL.txt", "fonts/noto-sans-arabic-latin.woff2",
];
const mediaTypes = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".ico": "image/x-icon", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8" };

export async function buildSite({ preview = false, outputDir = path.join(projectRoot, "dist") } = {}) {
  if (!path.isAbsolute(outputDir)) throw Error("Build output must be absolute.");
  const runtime = path.join(projectRoot, ".sites-runtime");
  await mkdir(runtime, { recursive: true });
  const lockPath = path.join(runtime, "build.lock");
  const lock = await open(lockPath, "wx").catch(error => {
    if (error.code === "EEXIST") throw Error("Another build owns .sites-runtime/build.lock; inspect its owner before continuing.");
    throw error;
  });
  const run = Date.now() + "-" + process.pid;
  const stage = path.join(runtime, "build-" + run);
  await lock.writeFile(JSON.stringify({ pid: process.pid, started: new Date().toISOString(), stage, outputDir, preview }));
  const sourceHashes = {};
  const sourceBytes = async relative => {
    const bytes = await readFile(path.join(projectRoot, relative));
    const hash = digest(bytes);
    if (sourceHashes[relative] && sourceHashes[relative] !== hash) throw Error("Source changed while building: " + relative);
    sourceHashes[relative] = hash;
    return bytes;
  };
  try {
    await mkdir(path.join(stage, "server"), { recursive: true });
    await mkdir(path.join(stage, "client"), { recursive: true });
    const catalog = {}, assetProof = {};
    async function addAsset(url, bytes) {
      if (!/^\/[a-zA-Z0-9_./-]+$/.test(url) || url.includes("..") || catalog[url]) throw Error("Invalid or duplicate public asset.");
      const extension = path.extname(url), contentType = mediaTypes[extension];
      if (!contentType) throw Error("Unknown asset media type: " + extension);
      const hash = digest(bytes);
      catalog[url] = { base64: bytes.toString("base64"), contentType, sha256: hash };
      assetProof[url] = { bytes: bytes.length, sha256: hash, contentType };
      const destination = path.join(stage, "client", url.slice(1));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, bytes, { flag: "wx" });
      return url;
    }
    const common = {
      absWorkingDir: projectRoot, bundle: true, format: "esm", write: false, metafile: true,
      target: "es2022", minify: true, sourcemap: false, legalComments: "eof", logLevel: "warning",
    };
    const worker = await build({ ...common, platform: "browser", entryPoints: ["app/phone/pdf-validation.worker.ts"] });
    assertPublicBundleInputs(Object.keys(worker.metafile.inputs), "PDF worker");
    const workerBytes = Buffer.from(worker.outputFiles[0].contents);
    const pdfURL = await addAsset("/_career/pdf-" + digest(workerBytes).slice(0, 20) + ".js", workerBytes);
    const browser = await build({
      ...common, platform: "browser", entryPoints: ["renderer/client.tsx"],
      define: { "process.env.NODE_ENV": '"production"', __CAREER_PDF_WORKER_URL__: JSON.stringify(pdfURL) },
    });
    assertPublicBundleInputs(Object.keys(browser.metafile.inputs));
    const clientBytes = Buffer.from(browser.outputFiles[0].contents);
    const client = await addAsset("/_career/client-" + digest(clientBytes).slice(0, 20) + ".js", clientBytes);
    const globalCSS = await sourceBytes("app/globals.css");
    const compiledCSS = await postcss([tailwind({ base: projectRoot })]).process(globalCSS.toString(), { from: path.join(projectRoot, "app/globals.css"), map: false });
    const stylesBytes = Buffer.concat([Buffer.from(compiledCSS.css), Buffer.from("\n"), await sourceBytes("app/i18n/i18n.css")]);
    const styles = await addAsset("/_career/styles-" + digest(stylesBytes).slice(0, 20) + ".css", stylesBytes);
    const phoneBytes = await sourceBytes("app/phone/phone.css");
    const phoneStyles = await addAsset("/_career/phone-" + digest(phoneBytes).slice(0, 20) + ".css", phoneBytes);
    for (const name of publicFiles) await addAsset("/" + name, await sourceBytes("public/" + name));
    const rendering = { assets: catalog, document: { client, styles, phoneStyles } };
    const server = await build({
      ...common, platform: "neutral", conditions: ["workerd", "browser", "import", "default"],
      mainFields: ["module", "main"], entryPoints: ["worker/index.ts"], external: ["node:*", "cloudflare:*"],
      define: {
        "process.env.NODE_ENV": '"production"', __CAREER_BUILD__: JSON.stringify(rendering),
        __CAREER_PREVIEW__: JSON.stringify(preview), __CAREER_PDF_WORKER_URL__: JSON.stringify(pdfURL),
      },
    });
    for (const output of Object.values(server.metafile.outputs)) for (const imported of output.imports) {
      if (imported.external && !/^(?:node|cloudflare):/.test(imported.path)) throw Error("Unbundled server import: " + imported.path);
    }
    const serverBytes = Buffer.from(server.outputFiles[0].contents);
    if (serverBytes.length > 64 * 1024 * 1024) throw Error("Worker exceeds the reviewed packaging limit.");
    await writeFile(path.join(stage, "server/index.js"), serverBytes, { flag: "wx" });
    await mkdir(path.join(stage, ".openai"));
    const hostingBytes = await sourceBytes(".openai/hosting.json");
    const hosting = JSON.parse(hostingBytes);
    if (hosting.static || hosting.d1 !== "DB" || hosting.r2 !== "BUCKET") throw Error("Preserve the existing Worker storage contract.");
    await writeFile(path.join(stage, ".openai/hosting.json"), hostingBytes);
    async function copyMigrations(relative) {
      for (const item of await readdir(path.join(projectRoot, relative), { withFileTypes: true })) {
        const next = relative + "/" + item.name;
        if (item.isDirectory()) await copyMigrations(next);
        else if (item.isFile()) await sourceBytes(next);
        else throw Error("Migration symlinks are not accepted.");
      }
    }
    await copyMigrations("drizzle");
    await cp(path.join(projectRoot, "drizzle"), path.join(stage, ".openai/drizzle"), { recursive: true });
    await writeFile(path.join(stage, "server/wrangler.json"), JSON.stringify({
      name: "career-finder-local", main: "./index.js", compatibility_date: "2026-05-15",
      compatibility_flags: ["nodejs_compat"],
      d1_databases: [{ binding: hosting.d1, database_name: "site-creator-d1", database_id: "00000000-0000-4000-8000-000000000000", migrations_dir: "../.openai/drizzle" }],
      r2_buckets: [{ binding: hosting.r2, bucket_name: "site-creator-r2" }],
    }, null, 2) + "\n");
    for (const meta of [worker.metafile, browser.metafile, server.metafile]) {
      for (const input of Object.keys(meta.inputs)) if (!input.startsWith("node_modules/") && !input.startsWith("<define:")) await sourceBytes(input);
    }
    for (const input of ["package.json", "package-lock.json", "tsconfig.json", "scripts/build-site.mjs", "scripts/public-bundle-inputs.mjs"]) await sourceBytes(input);
    for (const [name, hash] of Object.entries(sourceHashes)) if (digest(await readFile(path.join(projectRoot, name))) !== hash) throw Error("Source changed during build: " + name);
    await writeFile(path.join(stage, "build-manifest.json"), JSON.stringify({
      schema: 1, generatedAt: new Date().toISOString(), preview, entrypoint: "server/index.js",
      contract: "default fetch(request, env, ctx); DB and BUCKET; self-contained explicit public assets",
      sourceHashes, assets: assetProof, document: rendering.document, pdfWorker: pdfURL,
      server: { bytes: serverBytes.length, sha256: digest(serverBytes) },
      browserInputs: Object.keys(browser.metafile.inputs), pdfInputs: Object.keys(worker.metafile.inputs),
    }, null, 2) + "\n");
    await writeFile(path.join(stage, "build-metafiles.json"), JSON.stringify({ worker: worker.metafile, browser: browser.metafile, server: server.metafile }) + "\n");
    try {
      await stat(outputDir);
      await rename(outputDir, path.join(runtime, "previous-output-" + run));
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    await mkdir(path.dirname(outputDir), { recursive: true });
    await rename(stage, outputDir);
    return { outputDir, preview, assetCount: Object.keys(catalog).length, workerBytes: serverBytes.length, workerSHA256: digest(serverBytes), pdfWorker: pdfURL };
  } finally {
    await lock.close();
    const { unlink } = await import("node:fs/promises");
    await unlink(lockPath);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw Error("The production build accepts no positional arguments.");
  console.log(JSON.stringify(await buildSite(), null, 2));
}
