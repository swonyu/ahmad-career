import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { scenarios, findScenario, source, catalog, discoveryReply } from "./scenarios.mjs";
import { createFixtureServer } from "./server.mjs";
if (process.version !== "v24.22.3") throw new Error("Use pinned Node v24.22.3.");
const here = dirname(fileURLToPath(import.meta.url));
const model = await import(pathToFileURL("/Users/saleh/Developer/career-finder-feed-continuation-20261117-4b851318da2d/hosted/app/phone/model.ts").href);
model.catalogSchema.parse(catalog());
const cases = [];
for (const scenario of scenarios) {
  const session = { scenario, generation: 7, generatedAt: "2026-11-17T18:00:00.000Z" };
  let cursor = null, jobs = [], requests = 0, at200 = null;
  do {
    const url = new URL("http://127.0.0.1:4181/api/discovery/search");
    url.searchParams.append("source", source.id); url.searchParams.set("q", ""); url.searchParams.set("location", ""); url.searchParams.set("remote", "any");
    if (cursor) url.searchParams.set("cursor", cursor);
    const reply = discoveryReply("GET", url, session); assert.equal(reply.status, 200);
    const page = model.discoveryPageSchema.parse(reply.body); requests++;
    assert.ok(page.jobs.length <= 50); assert.equal(page.status, scenario.status); assert.equal(page.sources[0].limited, scenario.limited);
    jobs.push(...page.jobs); cursor = page.nextCursor;
    if (jobs.length === 200) at200 = { count: 200, cursorPresent: Boolean(cursor), fixturePageCalls: requests };
    if (requests > 10) throw new Error("Pagination did not terminate.");
  } while (cursor);
  assert.equal(jobs.length, scenario.total); assert.equal(new Set(jobs.map(job => job.url)).size, jobs.length);
  if (scenario.id === "capped" || scenario.id === "partial-capped") assert.deepEqual(at200, { count: 200, cursorPresent: true, fixturePageCalls: 4 });
  if (scenario.id === "exhausted") assert.deepEqual(at200, { count: 200, cursorPresent: false, fixturePageCalls: 4 });
  cases.push({ scenario: scenario.id, status: "schema-valid", pages: requests, total: jobs.length, at200 });
}
const session = { scenario: findScenario("capped"), generation: 1, generatedAt: "2026-11-17T18:00:00.000Z" };
const base = new URL("http://127.0.0.1:4181/api/discovery/search?source=" + encodeURIComponent(source.id) + "&q=&location=&remote=any");
const first = discoveryReply("GET", base, session);
const later = new URL(base); later.searchParams.set("cursor", first.body.nextCursor);
assert.equal(discoveryReply("GET", later, { ...session, generation: 2 }).status, 409);
later.searchParams.set("q", "changed"); assert.equal(discoveryReply("GET", later, session).status, 409);
for (const path of ["/api/phone/workspace", "/api/phone/receipts", "/api/phone/submit", "/api/auth/status", "/api/auth/connect"]) {
  assert.equal(discoveryReply("GET", new URL(path, base), session).status, 403);
  assert.equal(discoveryReply("POST", new URL(path, base), session).status, 405);
}
assert.equal(discoveryReply("POST", base, session).status, 405);
const { server } = createFixtureServer(4181); assert.equal(server.listening, false);
const manifest = JSON.parse(await readFile(join(here, "public/build-metadata.json"), "utf8"));
const receipt = { checkedAt: new Date().toISOString(), node: process.version, status: "pass", cases, productionPhoneAppSHA256: manifest.phoneAppSHA256, cursorBoundaries: "pass", accountAndMutationDenials: "pass", listenerStarted: false, browserRun: false, source: "Pure fixture service contract checks against actual production Zod schemas; not a product browser test." };
await writeFile(join(here, "preflight-receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt, null, 2));
