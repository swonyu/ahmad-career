import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { configureToolEnvironment } from "../scripts/tool-environment.mjs";
import { assertPublicBundleInputs } from "../scripts/public-bundle-inputs.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
configureToolEnvironment(root);
const digest = value => createHash("sha256").update(value).digest("hex");
const manifest = JSON.parse(await readFile(new URL("../dist/build-manifest.json", import.meta.url), "utf8"));
const origin = "https://career-finder-service.jazzy-drake-8323.chatgpt.site";
let mf;
const bootstrap = html => {
  const matches = [...html.matchAll(/<script id="career-bootstrap" type="application\/json">([\s\S]*?)<\/script>/g)];
  assert.equal(matches.length, 1, "exactly one explicit bootstrap payload");
  return JSON.parse(matches[0][1]);
};
const fetchPage = async (route, headers = {}) => {
  const response = await mf.dispatchFetch(origin + route, { headers, redirect: "manual" });
  const html = await response.text();
  assert.equal(response.status, 200, html.slice(0, 400));
  return { response, html, data: bootstrap(html) };
};
before(async () => {
  assert.equal(manifest.preview, false);
  assert.equal(digest(await readFile(new URL("../dist/server/index.js", import.meta.url))), manifest.server.sha256);
  for (const [name, hash] of Object.entries(manifest.sourceHashes)) assert.equal(digest(await readFile(path.join(root, name))), hash, "build source changed: " + name);
  mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, scriptPath: path.join(root, "dist/server/index.js"), cf: false,
    compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
    d1Databases: ["DB"], r2Buckets: ["BUCKET"],
    outboundService: async () => { throw Error("SSR acceptance must make no outbound network request."); },
  }));
  await mf.ready;
});
after(async () => { if (mf) await mf.dispose(); });

test("actual packaged Worker renders all six complete SSR documents in both languages", async () => {
  for (const language of ["en", "ar"]) for (const route of ["/", "/phone", "/connect", "/account", "/privacy", "/support"]) {
    const { response, html, data } = await fetchPage(route, { "Accept-Language": language });
    assert.match(html, /^<!DOCTYPE html>/i);
    assert(html.includes('lang="' + language + '"'));
    assert(html.includes('dir="' + (language === "ar" ? "rtl" : "ltr") + '"'));
    assert.equal(data.page, route);
    assert.equal(data.context.language, language);
    assert.equal(data.context.user, null);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
    for (const asset of [data.assets.client, data.assets.styles]) assert(html.includes(asset));
    assert.equal(html.includes(data.assets.phoneStyles), true, "bootstrap always declares the same phone stylesheet");
    assert.equal(html.includes('<link rel="stylesheet" href="' + data.assets.phoneStyles + '"'), route === "/" || route === "/phone");
    assert.match(html, /<main\b/);
    assert.match(html, /<\/body><\/html>$/);
  }
});
test("request-local language preference wins over headers without cross-request state", async () => {
  const responses = await Promise.all(Array.from({ length: 12 }, (_, index) => {
    const language = index % 2 ? "en" : "ar";
    return fetchPage("/support", { Cookie: "career_finder_language=" + language, "Accept-Language": language === "en" ? "ar" : "en" }).then(value => ({ ...value, language }));
  }));
  for (const { data, language } of responses) {
    assert.equal(data.context.language, language);
    assert.equal(data.context.languagePreference, language);
  }
});
test("verified Sites identity stays isolated and internal SSR identity fields grant no authority", async () => {
  const results = await Promise.all(Array.from({ length: 10 }, (_, index) => {
    const id = "synthetic-ssr-" + index;
    return fetchPage("/account", {
      "oai-authenticated-user-id": id, "oai-authenticated-user-email": id + "@example.test",
      "oai-authenticated-user-full-name": encodeURIComponent("Synthetic " + index + " اسم"),
      "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
      "x-career-user-id": "untrusted-internal-field", "x-career-user-email": "untrusted@example.test",
    }).then(result => ({ ...result, id, index }));
  }));
  for (const { data, html, id, index } of results) {
    assert.equal(data.context.user.userId, id);
    assert.equal(data.context.user.displayName, "Synthetic " + index + " اسم");
    assert.equal(data.context.user.method, "chatgpt");
    assert(!html.includes("untrusted@example.test"));
  }
  const noIdentity = await fetchPage("/account", { "x-career-user-id": "untrusted-internal-field", "x-career-user-email": "untrusted@example.test" });
  assert.equal(noIdentity.data.context.user, null);
});
test("invalid browser session renders recovery without falling back to another Sites identity", async () => {
  const { data, html } = await fetchPage("/account", {
    Cookie: "__Host-career-session=invalid-synthetic-session",
    "oai-authenticated-user-id": "other-sites-owner", "oai-authenticated-user-email": "other@example.test",
  });
  assert.equal(data.context.user, null);
  assert(!html.includes("other@example.test"));
  assert(!html.includes("invalid-synthetic-session"));
});
test("bootstrap data roundtrips HTML boundary characters and rejects nonconforming data", async () => {
  const { html, data } = await fetchPage("/account", {
    "oai-authenticated-user-id": "synthetic-text-owner", "oai-authenticated-user-email": "text@example.test",
    "oai-authenticated-user-full-name": encodeURIComponent('A <b> B & C " D\u2028E\u2029اسم'),
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  });
  assert.equal(data.context.user.displayName, 'A <b> B & C " D\u2028E\u2029اسم');
  const payload = html.match(/<script id="career-bootstrap" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert(!/[<>&\u2028\u2029]/.test(payload));
  const compiled = await build({ entryPoints: [path.join(root, "renderer/bootstrap.ts")], bundle: true, format: "esm", platform: "node", write: false });
  const { parseBootstrap, serializeBootstrap } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].contents).toString("base64"));
  assert.deepEqual(parseBootstrap(serializeBootstrap(data)), data);
  for (const invalid of [
    { ...data, version: 2 },
    { ...data, context: { ...data.context, language: ["en"] } },
    { ...data, context: { ...data.context, user: { ...data.context.user, method: ["chatgpt"] } } },
    { ...data, assets: { ...data.assets, client: "https://example.test/script.js" } },
    { ...data, assets: { ...data.assets, client: data.assets.styles } },
  ]) assert.throws(() => parseBootstrap(JSON.stringify(invalid)));
});
test("all 21 public assets are served as exact built bytes with correct methods and MIME types", async () => {
  assert.equal(Object.keys(manifest.assets).length, 21);
  for (const [url, evidence] of Object.entries(manifest.assets)) {
    const response = await mf.dispatchFetch(origin + url);
    assert.equal(response.status, 200, url);
    assert.equal(response.headers.get("content-type"), evidence.contentType);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, evidence.bytes, url);
    assert.equal(digest(bytes), evidence.sha256, url);
    const head = await mf.dispatchFetch(origin + url, { method: "HEAD" });
    assert.equal(head.status, 200); assert.equal((await head.arrayBuffer()).byteLength, 0);
    assert.equal(Number(head.headers.get("content-length")), evidence.bytes);
    const cached = await mf.dispatchFetch(origin + url, { headers: { "If-None-Match": response.headers.get("etag") } });
    assert.equal(cached.status, 304);
    const post = await mf.dispatchFetch(origin + url, { method: "POST" });
    assert.equal(post.status, 405); assert.equal(post.headers.get("allow"), "GET, HEAD");
  }
});
test("two rendered images retain semantics, dimensions, lazy loading and asynchronous decoding", async () => {
  const { html } = await fetchPage("/connect");
  const images = [...html.matchAll(/<img\b[^>]*>/g)].map(match => match[0]);
  const icon = images.find(value => value.includes('src="/phone-icon-192.png"'));
  // Provider status is intentionally unresolved during full-page SSR. Exercise
  // the actual artwork component separately rather than forcing auth availability.
  const fixture = await mkdtemp(path.join(tmpdir(), "career-image-ssr-"));
  let googleHTML;
  try {
    const artwork = await build({
      absWorkingDir: root, stdin: { contents: `import React from "react"; import {renderToStaticMarkup} from "react-dom/server"; import GoogleSignInArtwork from "./app/components/GoogleSignInArtwork"; export function render(){return renderToStaticMarkup(React.createElement(GoogleSignInArtwork));}`, resolveDir: root, loader: "tsx" },
      bundle: true, format: "cjs", platform: "node", write: false,
    });
    const entry = path.join(fixture, "artwork.cjs");
    await writeFile(entry, artwork.outputFiles[0].contents);
    googleHTML = (await import(pathToFileURL(entry).href)).render();
  } finally { await rm(fixture, { recursive: true, force: true }); }
  const google = [...googleHTML.matchAll(/<img\b[^>]*>/g)].map(match => match[0]).find(value => value.includes('src="/brand/google-signin-icon.png"'));
  assert(googleHTML.includes('aria-hidden="true"'));
  assert(googleHTML.includes("Sign in with Google"));
  for (const [image, dimension] of [[icon, "42"], [google, "40"]]) {
    assert(image, "rendered original local image");
    for (const attribute of ['alt=""', 'loading="lazy"', 'decoding="async"', 'width="' + dimension + '"', 'height="' + dimension + '"']) assert(image.includes(attribute), attribute);
  }
  assert.match(html, /aria-label="[^"]+"/);
});
test("current CSS, Arabic fonts and hashed production module worker are packaged", async () => {
  const css = await (await mf.dispatchFetch(origin + manifest.document.styles)).text();
  assert(css.includes(".site-header"));
  assert(css.includes("noto-sans-arabic-arabic.woff2"));
  const phoneCSS = await (await mf.dispatchFetch(origin + manifest.document.phoneStyles)).text();
  assert(phoneCSS.includes(".phone-bottom-nav"));
  assert(manifest.pdfInputs.some(value => value.endsWith("app/phone/pdf-validation.worker.ts")));
  assert(manifest.pdfInputs.some(value => value.endsWith("shared/pdf-readability.mjs")));
  assertPublicBundleInputs(manifest.browserInputs);
  assertPublicBundleInputs(manifest.pdfInputs, "PDF worker");
  assert(manifest.assets[manifest.pdfWorker]);
});
test("routing preserves HEAD, explicit 404/405, canonical paths and no source-file serving", async () => {
  const head = await mf.dispatchFetch(origin + "/privacy", { method: "HEAD" });
  assert.equal(head.status, 200); assert.equal(await head.text(), "");
  const canonical = await mf.dispatchFetch(origin + "/phone/?lang=ar", { redirect: "manual" });
  assert.equal(canonical.status, 308); assert.equal(canonical.headers.get("location"), "/phone?lang=ar");
  for (const route of ["/missing", "/.env", "/server/identity.mjs", "/_career/missing.js"]) {
    const response = await mf.dispatchFetch(origin + route);
    assert.equal(response.status, 404, route);
    assert.equal(bootstrap(await response.text()).page, "not-found");
  }
  const post = await mf.dispatchFetch(origin + "/privacy", { method: "POST" });
  assert.equal(post.status, 405); assert.equal(post.headers.get("allow"), "GET, HEAD");
});
test("production Worker preserves service origin rejection and deployment identity", async () => {
  const unknown = await mf.dispatchFetch(origin + "/api/phone/not-a-service");
  // Miniflare dispatch uses its loopback transport origin. The real service
  // correctly rejects it; unchanged hosted-worker tests supply the exact origin.
  assert.equal(unknown.status, 403);
  assert.equal((await unknown.json()).error.code, "host_denied");
  assert.equal(unknown.headers.get("cache-control"), "no-store");
  assert.deepEqual(await readFile(new URL("../dist/.openai/hosting.json", import.meta.url)), await readFile(new URL("../.openai/hosting.json", import.meta.url)));
  const config = JSON.parse(await readFile(new URL("../dist/server/wrangler.json", import.meta.url), "utf8"));
  assert.equal(config.d1_databases[0].binding, "DB");
  assert.equal(config.r2_buckets[0].binding, "BUCKET");
  assert(!("assets" in config));
});

test("explicit request helpers retain safe sign-in and temporary redirect semantics", async () => {
  const compiled = await build({ entryPoints: [path.join(root, "app/chatgpt-auth.ts")], bundle: true, format: "esm", platform: "node", write: false });
  const auth = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].contents).toString("base64"));
  const context = { user: null, language: "en", languagePreference: "system" };
  assert.equal(auth.getChatGPTUser(context), null);
  assert.throws(() => auth.requireChatGPTUser("/phone#profile", context), error => error instanceof auth.PageRedirect && error.location === auth.chatGPTSignInPath("/phone#profile"));
  for (const path of ["//example.test", "https://example.test", "/signin-with-chatgpt"]) assert.equal(auth.chatGPTSignInPath(path), auth.chatGPTSignInPath("/"));
  const user = { userId: "synthetic-helper", email: "helper@example.test", fullName: "Synthetic", displayName: "Synthetic", method: "chatgpt" };
  assert.equal(auth.requireChatGPTUser("/account", { ...context, user }), user);
});
