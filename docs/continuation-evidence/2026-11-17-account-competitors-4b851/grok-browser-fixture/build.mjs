import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const repo = "/Users/saleh/Developer/career-finder-feed-continuation-20261117-4b851318da2d";
const hosted = join(repo, "hosted");
const require = createRequire(join(hosted, "package.json"));
const esbuild = require("esbuild");
const postcss = require("postcss");
const tailwind = require("@tailwindcss/postcss");
const output = join(here, "public");
await mkdir(output, { recursive: true });
const alias = Object.fromEntries(["SessionRecovery", "SignInOptions", "OAuthFeedback", "ProviderConnections"].map(name => ["@career/" + name, join(hosted, "app/components", name + ".tsx")]));
alias["@career/LocaleProvider"] = join(hosted, "app/i18n/LocaleProvider.tsx");
alias["next/image"] = join(here, "ImageStub.tsx");
const result = await esbuild.build({
  absWorkingDir: here, entryPoints: ["fixture.tsx"], outfile: join(output, "fixture.js"),
  bundle: true, platform: "browser", format: "iife", target: ["chrome120"], jsx: "automatic",
  nodePaths: [join(hosted, "node_modules")], alias,
  define: { "process.env.NODE_ENV": '"production"' }, sourcemap: "external", metafile: true, logLevel: "warning",
});
const globalCSS = join(hosted, "app/globals.css"), localeCSS = join(hosted, "app/i18n/i18n.css");
const css = await postcss([tailwind({ base: hosted, optimize: false })]).process(
  await readFile(globalCSS, "utf8") + "\n" + await readFile(localeCSS, "utf8"),
  { from: globalCSS, to: join(output, "production.css"), map: false },
);
await writeFile(join(output, "production.css"), css.css);
for (const name of ["index.html", "fixture.css"]) await copyFile(join(here, name), join(output, name));
for (const asset of ["brand/google-signin-icon.png", "brand/google-sans-medium.ttf", "fonts/noto-sans-arabic-arabic.woff2", "fonts/noto-sans-arabic-latin.woff2"]) {
  await mkdir(dirname(join(output, asset)), { recursive: true });
  await copyFile(join(hosted, "public", asset), join(output, asset));
}
const sourceFiles = [...new Set([...Object.keys(result.metafile.inputs).map(name => resolve(here, name)), globalCSS, localeCSS])].filter(name => !name.includes("/node_modules/")).sort();
const sources = [];
for (const path of sourceFiles) sources.push({ path: path.startsWith(repo + "/") ? relative(repo, path) : path, sha256: createHash("sha256").update(await readFile(path)).digest("hex") });
const dependencies = Object.fromEntries(await Promise.all(["react", "react-dom", "esbuild", "postcss", "@tailwindcss/postcss"].map(async name => [name, JSON.parse(await readFile(join(hosted, "node_modules", name, "package.json"), "utf8")).version])));
const metadata = {
  generatedAt: new Date().toISOString(), node: process.version, repository: repo,
  commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(),
  note: "Current working-tree source; hashes record dirty files. Real React components and DOM. Only Next Image is replaced. Synthetic service only; not a hosted/native/provider pass.",
  dependencies,
  sources,
};
await writeFile(join(output, "build-metadata.json"), JSON.stringify(metadata, null, 2) + "\n");
await writeFile(join(here, "build.log"), "Fixture bundle prepared. No HTTP listener started.\n" + JSON.stringify(metadata, null, 2) + "\n");
console.log(JSON.stringify({ built: output, node: metadata.node, commit: metadata.commit, sourceFiles: sources.length, dependencies: metadata.dependencies, listenerStarted: false }, null, 2));
