import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
if (process.version !== "v24.22.3") throw new Error("Use the project-pinned Node v24.22.3.");
const here = dirname(fileURLToPath(import.meta.url));
const repo = "/Users/saleh/Developer/career-finder-feed-continuation-20261117-4b851318da2d", hosted = join(repo, "hosted"), output = join(here, "public");
const require = createRequire(join(hosted, "package.json")), esbuild = require("esbuild"), postcss = require("postcss"), tailwind = require("@tailwindcss/postcss");
const hash = value => createHash("sha256").update(value).digest("hex");
const phonePath = join(hosted, "app/phone/PhoneApp.tsx"), phoneBefore = await readFile(phonePath);
const expectedPhoneHash = "0ee2f855083ad5933dbbca1161372e8e6e3c8b393c1fd6033b2858c59dacfd94";
if (hash(phoneBefore) !== expectedPhoneHash) throw new Error("PhoneApp changed since the authorized source receipt. Notify root and review the new source before rebuilding.");
const expectedAPIs = {
  "app/phone/components.tsx": "c18753ee7c8b342831864cecc2694708f09fee6019a76c530b2c2ae743446424",
  "app/i18n/messages.ar.json": "46ec9674ec1186d8bc3016c78739eda38542a7beca033a0f0617256b6cc154e9",
  "app/phone/phone.css": "786f03f7e8e30f85ecc38917d999f0fce9f81a6879d997ff5738d7ea740df915",
  "app/phone/model.ts": "955d5afcede6b8f7eb901394f9ae3e00d1bbffa57bf1e457c5436f23541577bf",
  "app/phone/vault.ts": "1c45092458fe9f56ee84925091342f3c5f920800409965a7a99ab32b07138c95",
  "app/phone/safety.ts": "8571c8e0f1625e50fd2d1749ab7cd10aca57f8b24c16107e6179437154eb4c4f",
  "app/phone/record-tools.ts": "7394ea75959f766053f4b6373a4c1687fa0e095c5cec7c0d887571ffb9908494",
};
for (const [path, expected] of Object.entries(expectedAPIs)) if (hash(await readFile(join(hosted, path))) !== expected) throw new Error("Production API changed since fixture review: " + path);
const trackedHostedPaths = execFileSync("git", ["ls-files", "-z", "--", "hosted"], { cwd: repo, encoding: "utf8" }).split("\0").filter(Boolean);
const trackedHostedBefore = Object.fromEntries(await Promise.all(trackedHostedPaths.map(async name => [name, hash(await readFile(join(repo, name)))])));
await mkdir(output, { recursive: true });
const result = await esbuild.build({
  absWorkingDir: here, entryPoints: ["fixture.tsx"], outfile: join(output, "fixture.js"),
  bundle: true, platform: "browser", format: "esm", target: ["chrome120"], jsx: "automatic",
  nodePaths: [join(hosted, "node_modules")],
  alias: { "@career/PhoneApp": phonePath, "@career/LocaleProvider": join(hosted, "app/i18n/LocaleProvider.tsx"), "@career/model": join(hosted, "app/phone/model.ts"), "@career/vault": join(hosted, "app/phone/vault.ts"), "@career/safety": join(hosted, "app/phone/safety.ts"), "next/image": join(here, "ImageStub.tsx") },
  define: { "process.env.NODE_ENV": '"production"' }, sourcemap: "external", metafile: true, logLevel: "warning",
});
const cssFiles = ["app/globals.css", "app/i18n/i18n.css", "app/phone/phone.css"].map(name => join(hosted, name));
const css = await postcss([tailwind({ base: hosted, optimize: false })]).process((await Promise.all(cssFiles.map(name => readFile(name, "utf8")))).join("\n"), { from: cssFiles[0], to: join(output, "production.css"), map: false });
await writeFile(join(output, "production.css"), css.css);
for (const name of ["index.html", "fixture.css"]) await copyFile(join(here, name), join(output, name));
for (const asset of ["phone-icon-192.png", "brand/google-signin-icon.png", "brand/google-sans-medium.ttf", "fonts/noto-sans-arabic-arabic.woff2", "fonts/noto-sans-arabic-latin.woff2"]) {
  await mkdir(dirname(join(output, asset)), { recursive: true });
  await copyFile(join(hosted, "public", asset), join(output, asset));
}
if (hash(await readFile(phonePath)) !== hash(phoneBefore)) throw new Error("PhoneApp changed during fixture generation; do not serve this bundle.");
for (const [path, expected] of Object.entries(expectedAPIs)) if (hash(await readFile(join(hosted, path))) !== expected) throw new Error("Production API changed during fixture build; do not serve: " + path);
for (const [name, expected] of Object.entries(trackedHostedBefore)) if (hash(await readFile(join(repo, name))) !== expected) throw new Error("Tracked hosted source changed during fixture build: " + name);
const sources = [];
const sourcePaths = [...new Set([...Object.keys(result.metafile.inputs).map(name => resolve(here, name)), ...cssFiles, join(hosted, "package-lock.json")])].filter(name => !name.includes("/node_modules/")).sort();
for (const path of sourcePaths) sources.push({ path: path.startsWith(repo + "/") ? relative(repo, path) : path, sha256: hash(await readFile(path)) });
const dependencies = Object.fromEntries(await Promise.all(["react", "react-dom", "esbuild", "postcss", "@tailwindcss/postcss", "zod"].map(async name => [name, JSON.parse(await readFile(join(hosted, "node_modules", name, "package.json"), "utf8")).version])));
const metadata = { generatedAt: new Date().toISOString(), node: process.version, repository: repo, commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), phoneAppSHA256: hash(phoneBefore), trackedHostedStable: true, pinnedInputs: expectedAPIs, dependencies, sources, note: "Current working-tree PhoneApp and dependencies/CSS; real React and guest storage. Only Next Image is adapted. Explicit synthetic Saved seeds use production model/vault/safety APIs; empty guest scope and origin guards apply. Synthetic discovery GET service; no native/hosted/provider or screen-reader acceptance is implied." };
await writeFile(join(output, "build-metadata.json"), JSON.stringify(metadata, null, 2) + "\n");
await writeFile(join(here, "build.log"), JSON.stringify(metadata, null, 2) + "\n");
console.log(JSON.stringify({ output, node: process.version, phoneAppSHA256: metadata.phoneAppSHA256, sourceFiles: sources.length, dependencies, listenerStarted: false }));
