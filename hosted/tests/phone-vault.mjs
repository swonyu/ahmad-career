import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

// Exercise the actual TypeScript modules on every Node version supported by this repo.
const directory = await mkdtemp(join(tmpdir(), "career-phone-vault-"));
let vaultModule, modelModule, safetyModule;
try {
  await build({ entryPoints: { vault: "app/phone/vault.ts", model: "app/phone/model.ts", safety: "app/phone/safety.ts" }, splitting: true, outdir: directory, outExtension: { ".js": ".mjs" }, bundle: true, platform: "node", format: "esm", target: "node22" });
  vaultModule = await import(pathToFileURL(join(directory, "vault.mjs")).href);
  modelModule = await import(pathToFileURL(join(directory, "model.mjs")).href);
  safetyModule = await import(pathToFileURL(join(directory, "safety.mjs")).href);
} finally { await rm(directory, { recursive: true, force: true }); }
const { createPhoneVault, createIndexedDBPhoneVaultPort, PhoneVaultError } = vaultModule;
const { blankSnapshot, MAX_PDF_BYTES, countryCodes } = modelModule;

const workspace = "11111111-1111-4111-8111-111111111111";
const anotherWorkspace = "22222222-2222-4222-8222-222222222222";
const alice = `account:alice:${workspace}`, aliceOld = `account:alice:${anotherWorkspace}`;
const bob = `account:bob:${workspace}`;
const fixedNow = () => new Date("2026-11-17T12:00:00.000Z");
const results = [];

// Structured clone exercises the real non-extractable CryptoKey, not a key stub.
class MemoryPort {
  rows = new Map();
  writes = [];
  readFailure = null;
  writeFailure = null;
  removeFailure = null;
  async read(scope) {
    if (this.readFailure) throw this.readFailure;
    return this.rows.has(scope) ? { exists: true, value: structuredClone(this.rows.get(scope)) } : { exists: false };
  }
  async compareAndSet(scope, expectedId, value) {
    if (this.writeFailure) throw this.writeFailure;
    const exists = this.rows.has(scope), stored = this.rows.get(scope);
    if (expectedId === null ? exists : !exists || stored?.envelopeId !== expectedId) return false;
    this.rows.set(scope, structuredClone(value));
    this.writes.push({ scope, expectedId, id: value.envelopeId });
    return true;
  }
  async remove(scope, marker) { if (this.removeFailure) throw this.removeFailure; this.rows.set(scope, structuredClone(marker)); }
  async list(prefix) {
    return [...this.rows].filter(([scope, value]) => value?.reset !== true && (prefix === "guest" ? scope === "guest" : scope.startsWith(prefix))).map(([scope, value]) => ({ scope, updatedAt: value?.updatedAt ?? "" }));
  }
}

function client(port = new MemoryPort(), extra = {}) { return createPhoneVault({ port, crypto: webcrypto, now: fixedNow, ...extra }); }
function draft(scope = alice, name = "Private applicant") {
  const value = blankSnapshot(scope);
  value.profile.firstName = name;
  value.profile.email = "private@example.com";
  value.profile.linkedin = "not finished yet"; // Unsaved draft text must survive validation.
  value.profile.resume = { name: "private-cv.pdf", mime: "application/pdf", size: 8, sha256: "1".repeat(64), dataBase64: Buffer.from("%PDF-1.7").toString("base64") };
  value.jobs = [{ id: "local-example", title: "Mobile engineer", company: "Example", url: "https://jobs.example.com/roles/123", location: "Remote", country: "" }];
  value.records = [{ identity: "https://jobs.example.com/roles/123", title: "Mobile engineer", company: "Example", stage: "interview", appliedElsewhere: true, appliedDate: "2026-11-15", followUpDate: "2026-11-20", note: "PRIVATE NOTE Arabic العربية and emoji 🌱", updatedAt: fixedNow().toISOString() }];
  return value;
}
function errorCode(code) { return error => { assert.ok(error instanceof PhoneVaultError); assert.equal(error.code, code); return true; }; }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function aad(row) { return new TextEncoder().encode(JSON.stringify(["Career Finder private phone draft", row.storageVersion, row.payloadSchema, row.scope, row.envelopeId, row.updatedAt])); }
async function openRaw(row) { return JSON.parse(new TextDecoder().decode(await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: row.iv, additionalData: aad(row), tagLength: 128 }, row.key, row.ciphertext))); }
async function replacePayload(port, scope, change) {
  const row = structuredClone(port.rows.get(scope));
  const value = await openRaw(row);
  const replacement = change(value, row);
  const bytes = replacement instanceof Uint8Array ? replacement : new TextEncoder().encode(JSON.stringify(replacement));
  row.ciphertext = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv: row.iv, additionalData: aad(row), tagLength: 128 }, row.key, bytes);
  port.rows.set(scope, row);
}
async function test(name, action) { try { await action(); results.push(name); } catch (error) { console.error(`FAIL: ${name}`); throw error; } }

await test("encrypted round trip preserves full draft, PDF, Unicode and unfinished fields", async () => {
  const port = new MemoryPort(), vault = client(port), value = draft();
  assert.equal(await vault.loadPhoneSnapshot(alice), null);
  await vault.savePhoneSnapshot(alice, value);
  assert.deepEqual(await client(port).loadPhoneSnapshot(alice), value);
  const row = port.rows.get(alice);
  assert.equal(row.key.extractable, false);
  assert.equal(row.key.algorithm.name, "AES-GCM");
  assert.equal(row.key.algorithm.length, 256);
  assert.equal(row.iv.byteLength, 12);
  assert.equal(row.ciphertext.byteLength, new TextEncoder().encode(JSON.stringify(value)).byteLength + 16);
  await assert.rejects(webcrypto.subtle.exportKey("raw", row.key));
  const stored = JSON.stringify(row) + new TextDecoder().decode(row.ciphertext);
  for (const secret of [value.profile.firstName, value.profile.email, value.records[0].note, value.profile.resume.dataBase64]) assert.ok(!stored.includes(secret));
  const loaded = await vault.loadPhoneSnapshot(alice);
  loaded.profile.firstName = "Changed in memory";
  assert.equal((await vault.loadPhoneSnapshot(alice)).profile.firstName, value.profile.firstName);
});

await test("every save rotates the opaque key, IV and authenticated envelope ID", async () => {
  const port = new MemoryPort(), vault = client(port);
  await vault.savePhoneSnapshot(alice, draft());
  const first = structuredClone(port.rows.get(alice));
  await vault.savePhoneSnapshot(alice, draft());
  const second = port.rows.get(alice);
  assert.notEqual(first.envelopeId, second.envelopeId);
  assert.notDeepEqual(new Uint8Array(first.iv), new Uint8Array(second.iv));
  assert.notDeepEqual(new Uint8Array(first.ciphertext), new Uint8Array(second.ciphertext));
  const probe = { name: "AES-GCM", iv: new Uint8Array(12) }, plain = new Uint8Array([1, 2, 3]);
  assert.notDeepEqual(await webcrypto.subtle.encrypt(probe, first.key, plain), await webcrypto.subtle.encrypt(probe, second.key, plain));
});

await test("exact guest, account and workspace scopes remain isolated", async () => {
  const port = new MemoryPort(), vault = client(port);
  for (const scope of ["guest", alice, aliceOld, bob, "account:alice:new"]) await vault.savePhoneSnapshot(scope, draft(scope, scope));
  for (const scope of ["guest", alice, aliceOld, bob, "account:alice:new"]) assert.equal((await client(port).loadPhoneSnapshot(scope)).profile.firstName, scope);
  await vault.removePhoneSnapshot(aliceOld);
  assert.equal(await vault.loadPhoneSnapshot(aliceOld), null);
  assert.equal(port.rows.size, 5);
  assert.equal(port.rows.get(aliceOld).reset, true);
  assert.equal(port.rows.get(aliceOld).key, undefined);
  assert.equal(port.rows.get(aliceOld).ciphertext, undefined);
  assert.equal((await vault.loadPhoneSnapshot(alice)).profile.firstName, alice);
});

await test("metadata and ciphertext tampering fail closed without replacing the saved row", async () => {
  for (const field of ["scope", "envelopeId", "updatedAt", "iv", "ciphertext", "key"]) {
    const port = new MemoryPort(); await client(port).savePhoneSnapshot(alice, draft());
    const row = port.rows.get(alice);
    if (field === "scope") row.scope = bob;
    if (field === "envelopeId") row.envelopeId = "f".repeat(32);
    if (field === "updatedAt") row.updatedAt = "2026-11-18T12:00:00.000Z";
    if (field === "iv") new Uint8Array(row.iv)[0] ^= 1;
    if (field === "ciphertext") new Uint8Array(row.ciphertext)[0] ^= 1;
    if (field === "key") row.key = await webcrypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const saved = structuredClone(row), vault = client(port);
    await assert.rejects(vault.loadPhoneSnapshot(alice), errorCode("damaged"));
    await assert.rejects(vault.savePhoneSnapshot(alice, draft(alice, "Replacement")), errorCode("damaged"));
    assert.deepEqual(port.rows.get(alice), saved);
  }
});

await test("copying a row to another account or changing its plaintext owner cannot expose that owner's profile", async () => {
  const port = new MemoryPort(); await client(port).savePhoneSnapshot(alice, draft());
  port.rows.set(bob, structuredClone(port.rows.get(alice)));
  await assert.rejects(client(port).loadPhoneSnapshot(bob), errorCode("damaged"));
  await replacePayload(port, alice, value => ({ ...value, scope: bob, profile: { ...value.profile, firstName: "BOB FOREIGN PRIVATE SECRET" } }));
  const vault = client(port);
  await assert.rejects(vault.loadPhoneSnapshot(alice), errorCode("damaged"));
  const recovered = JSON.parse(await vault.exportPhoneSnapshot(alice));
  assert.equal(recovered.format, "career-finder-phone-draft-recovery");
  assert.equal(recovered.recoveredPayload, undefined);
  assert.ok(!JSON.stringify(recovered).includes("BOB FOREIGN PRIVATE SECRET"));
});

await test("future envelope versions are preserved, exportable and blocked until explicit reset", async () => {
  const port = new MemoryPort(); await client(port).savePhoneSnapshot(alice, draft()); await client(port).savePhoneSnapshot(bob, draft(bob));
  const row = port.rows.get(alice); row.storageVersion = 9;
  const original = structuredClone(row), vault = client(port);
  await assert.rejects(vault.loadPhoneSnapshot(alice), errorCode("unsupported"));
  await assert.rejects(vault.savePhoneSnapshot(alice, draft()), errorCode("unsupported"));
  const recovery = JSON.parse(await vault.exportPhoneSnapshot(alice));
  assert.equal(recovery.encryptedRecord.storageVersion, 9);
  assert.equal(recovery.encryptedRecord.key.opaqueBrowserKey, true);
  assert.deepEqual(port.rows.get(alice), original);
  await assert.rejects(vault.savePhoneSnapshot(alice, draft()), errorCode("unsupported"));
  await vault.removePhoneSnapshot(alice);
  await vault.savePhoneSnapshot(alice, draft(alice, "New explicit draft"));
  assert.equal((await vault.loadPhoneSnapshot(alice)).profile.firstName, "New explicit draft");
  assert.ok(port.rows.has(bob));
});

await test("unknown future profile fields cannot be silently stripped on load or save", async () => {
  const port = new MemoryPort(); await client(port).savePhoneSnapshot(alice, draft());
  await replacePayload(port, alice, value => { value.profile.futurePrivateNote = "Keep future content"; return value; });
  const saved = structuredClone(port.rows.get(alice)), vault = client(port);
  await assert.rejects(vault.loadPhoneSnapshot(alice), errorCode("unsupported"));
  const recovery = JSON.parse(await vault.exportPhoneSnapshot(alice));
  assert.equal(recovery.recoveredPayload.profile.futurePrivateNote, "Keep future content");
  await assert.rejects(vault.savePhoneSnapshot(alice, draft()), errorCode("unsupported"));
  assert.deepEqual(port.rows.get(alice), saved);
  const newDraft = draft(bob); newDraft.profile.unknownField = "Not disposable";
  await assert.rejects(vault.savePhoneSnapshot(bob, newDraft), errorCode("unsupported"));
  assert.equal(port.rows.has(bob), false);
});

await test("optional job fields receive safe defaults while known draft data remains intact", async () => {
  const port = new MemoryPort(); await client(port).savePhoneSnapshot(alice, draft());
  await replacePayload(port, alice, value => { delete value.jobs[0].country; delete value.jobs[0].location; return value; });
  const value = await client(port).loadPhoneSnapshot(alice);
  assert.equal(value.profile.linkedin, draft().profile.linkedin); assert.equal(value.jobs[0].country, ""); assert.equal(value.jobs[0].location, "");
  assert.equal(value.records[0].note, draft().records[0].note);
});

await test("bad UTF-8, malformed JSON and duplicate canonical jobs preserve the original ciphertext", async () => {
  for (const replacement of [() => new Uint8Array([0xc3, 0x28]), () => new TextEncoder().encode("{broken json"), value => { value.jobs.push({ ...value.jobs[0], id: "other", url: value.jobs[0].url + "?utm_source=campaign" }); return value; }]) {
    const port = new MemoryPort(); await client(port).savePhoneSnapshot(alice, draft()); await replacePayload(port, alice, replacement);
    const original = structuredClone(port.rows.get(alice)), vault = client(port);
    await assert.rejects(vault.loadPhoneSnapshot(alice), errorCode("damaged"));
    await assert.rejects(vault.savePhoneSnapshot(alice, draft()), errorCode("damaged"));
    assert.deepEqual(port.rows.get(alice), original);
  }
});

await test("malformed present rows are not mistaken for an empty workspace", async () => {
  for (const row of [undefined, null, {}, { storageVersion: 1, scope: alice }, { ...draft(), key: "plaintext key" }]) {
    const port = new MemoryPort(); port.rows.set(alice, row);
    const vault = client(port);
    await assert.rejects(vault.loadPhoneSnapshot(alice), errorCode("damaged"));
    await assert.rejects(vault.savePhoneSnapshot(alice, draft()), errorCode("damaged"));
    assert.equal(port.rows.has(alice), true);
    assert.equal(port.writes.length, 0);
  }
});

await test("a new tab must load an existing draft before it can replace it", async () => {
  const port = new MemoryPort(), first = client(port), second = client(port);
  await first.savePhoneSnapshot(alice, draft(alice, "Existing"));
  await assert.rejects(second.savePhoneSnapshot(alice, draft(alice, "Unseen overwrite")), errorCode("changed_elsewhere"));
  assert.equal((await first.loadPhoneSnapshot(alice)).profile.firstName, "Existing");
  await second.loadPhoneSnapshot(alice);
  await second.savePhoneSnapshot(alice, draft(alice, "Loaded first"));
  assert.equal((await second.loadPhoneSnapshot(alice)).profile.firstName, "Loaded first");
});

await test("cross-tab changes are rejected and export does not adopt another tab's version", async () => {
  const port = new MemoryPort(), first = client(port), second = client(port);
  await first.loadPhoneSnapshot(alice); await second.loadPhoneSnapshot(alice);
  await first.savePhoneSnapshot(alice, draft(alice, "Saved by first tab"));
  await assert.rejects(second.savePhoneSnapshot(alice, draft(alice, "Stale second tab")), errorCode("changed_elsewhere"));
  assert.equal(JSON.parse(await second.exportPhoneSnapshot(alice)).profile.firstName, "Saved by first tab");
  await assert.rejects(second.savePhoneSnapshot(alice, draft(alice, "Export did not reload")), errorCode("changed_elsewhere"));
  await second.loadPhoneSnapshot(alice); await second.savePhoneSnapshot(alice, draft(alice, "Explicitly reloaded"));
  await assert.rejects(first.savePhoneSnapshot(alice, draft()), errorCode("changed_elsewhere"));
});

await test("compare-and-set closes the race between the initial read and final encrypted commit", async () => {
  const port = new MemoryPort(), entered = deferred(), resume = deferred();
  const delayed = { read: scope => port.read(scope), remove: (...args) => port.remove(...args), list: prefix => port.list(prefix), compareAndSet: async (...args) => { entered.resolve(); await resume.promise; return port.compareAndSet(...args); } };
  const first = client(delayed), second = client(port);
  await first.loadPhoneSnapshot(alice); await second.loadPhoneSnapshot(alice);
  const pending = first.savePhoneSnapshot(alice, draft(alice, "Slower tab"));
  const rejected = assert.rejects(pending, errorCode("changed_elsewhere"));
  await entered.promise;
  await second.savePhoneSnapshot(alice, draft(alice, "Faster tab"));
  resume.resolve(); await rejected;
  assert.equal((await second.loadPhoneSnapshot(alice)).profile.firstName, "Faster tab");
  assert.equal(port.writes.length, 1);
});

await test("same-tab saves remain ordered and capture values before their queue starts", async () => {
  const port = new MemoryPort(), entered = deferred(), resume = deferred();
  let pause = true;
  const delayed = { read: scope => port.read(scope), remove: (...args) => port.remove(...args), list: prefix => port.list(prefix), compareAndSet: async (...args) => { if (pause) { pause = false; entered.resolve(); await resume.promise; } return port.compareAndSet(...args); } };
  const vault = client(delayed);
  const first = vault.savePhoneSnapshot(alice, draft(alice, "First"));
  await entered.promise;
  const input = draft(alice, "Second captured"), second = vault.savePhoneSnapshot(alice, input);
  input.profile.firstName = "Later unsaved mutation";
  resume.resolve(); await Promise.all([first, second]);
  assert.equal((await vault.loadPhoneSnapshot(alice)).profile.firstName, "Second captured");
  assert.equal(port.writes[1].expectedId, port.writes[0].id);
});

await test("a reset cancels older queued saves and leaves no resurrected draft", async () => {
  const port = new MemoryPort(), entered = deferred(), resume = deferred();
  const delayed = { read: scope => port.read(scope), remove: (...args) => port.remove(...args), list: prefix => port.list(prefix), compareAndSet: async (...args) => { entered.resolve(); await resume.promise; return port.compareAndSet(...args); } };
  const vault = client(delayed);
  const first = vault.savePhoneSnapshot(alice, draft(alice, "In flight")); await entered.promise;
  const second = vault.savePhoneSnapshot(alice, draft(alice, "Queued before reset"));
  const cancelled = assert.rejects(second, errorCode("reset_pending"));
  const removal = vault.removePhoneSnapshot(alice);
  resume.resolve(); await Promise.all([first, cancelled, removal]);
  assert.equal(await vault.loadPhoneSnapshot(alice), null);
  assert.equal(port.rows.get(alice).reset, true);
  assert.equal(port.rows.get(alice).key, undefined);
  assert.equal(port.rows.get(alice).ciphertext, undefined);
});

await test("deletion in another tab cannot be silently undone by an older draft", async () => {
  const port = new MemoryPort(), first = client(port), second = client(port);
  await first.savePhoneSnapshot(alice, draft()); await second.loadPhoneSnapshot(alice);
  await first.removePhoneSnapshot(alice);
  await assert.rejects(second.savePhoneSnapshot(alice, draft()), errorCode("changed_elsewhere"));
  assert.equal(port.rows.get(alice).reset, true);
  await second.loadPhoneSnapshot(alice); await second.savePhoneSnapshot(alice, draft());
  assert.equal(port.rows.has(alice), true);
});

await test("an empty-to-saved-to-reset change cannot bypass another tab's expected revision", async () => {
  const port = new MemoryPort(), stale = client(port), current = client(port);
  assert.equal(await stale.loadPhoneSnapshot(alice), null);
  await current.savePhoneSnapshot(alice, draft());
  await current.removePhoneSnapshot(alice);
  await assert.rejects(stale.savePhoneSnapshot(alice, draft(alice, "Resurrected old draft")), errorCode("changed_elsewhere"));
  assert.equal(await current.loadPhoneSnapshot(alice), null);
  assert.deepEqual(await current.listPhoneSnapshots("account:alice:"), []);
  await assert.rejects(current.exportPhoneSnapshot(alice), errorCode("invalid_snapshot"));
  assert.equal(await stale.loadPhoneSnapshot(alice), null);
  await stale.savePhoneSnapshot(alice, draft(alice, "New draft after explicit reload"));
  assert.equal((await stale.loadPhoneSnapshot(alice)).profile.firstName, "New draft after explicit reload");
});

await test("quota failure keeps the prior ciphertext and allows a later explicit retry", async () => {
  const port = new MemoryPort(), vault = client(port);
  await vault.savePhoneSnapshot(alice, draft(alice, "Original"));
  const original = structuredClone(port.rows.get(alice));
  port.writeFailure = new DOMException("private storage details", "QuotaExceededError");
  await assert.rejects(vault.savePhoneSnapshot(alice, draft(alice, "New edit")), error => errorCode("storage_full")(error) && !error.message.includes("private storage details"));
  assert.deepEqual(port.rows.get(alice), original);
  port.writeFailure = null;
  await vault.savePhoneSnapshot(alice, draft(alice, "Retry"));
  assert.equal((await vault.loadPhoneSnapshot(alice)).profile.firstName, "Retry");
});

await test("read and delete failures never report an empty or successfully removed draft", async () => {
  const port = new MemoryPort(), vault = client(port); await vault.savePhoneSnapshot(alice, draft());
  port.readFailure = new DOMException("blocked", "SecurityError");
  await assert.rejects(vault.loadPhoneSnapshot(alice), errorCode("unavailable"));
  await assert.rejects(vault.savePhoneSnapshot(alice, draft()), errorCode("unavailable"));
  port.readFailure = null;
  port.removeFailure = new DOMException("aborted", "AbortError");
  await assert.rejects(vault.removePhoneSnapshot(alice), errorCode("unavailable"));
  assert.ok(port.rows.has(alice));
  port.removeFailure = null;
  assert.deepEqual(await vault.loadPhoneSnapshot(alice), draft());
});

await test("exporting a repaired row does not clear a previous safety block", async () => {
  const port = new MemoryPort(); await client(port).savePhoneSnapshot(alice, draft());
  const original = structuredClone(port.rows.get(alice));
  new Uint8Array(port.rows.get(alice).ciphertext)[2] ^= 1;
  const vault = client(port);
  await assert.rejects(vault.loadPhoneSnapshot(alice), errorCode("damaged"));
  port.rows.set(alice, original);
  assert.deepEqual(JSON.parse(await vault.exportPhoneSnapshot(alice)), draft());
  await assert.rejects(vault.savePhoneSnapshot(alice, draft()), errorCode("damaged"));
  await vault.loadPhoneSnapshot(alice); await vault.savePhoneSnapshot(alice, draft());
});

await test("valid exports are readable snapshots and do not mutate stored data", async () => {
  const port = new MemoryPort(); await client(port).savePhoneSnapshot(alice, draft());
  const original = structuredClone(port.rows.get(alice)), vault = client(port);
  assert.deepEqual(JSON.parse(await vault.exportPhoneSnapshot(alice)), draft());
  assert.deepEqual(port.rows.get(alice), original);
  await assert.rejects(vault.savePhoneSnapshot(alice, draft()), errorCode("changed_elsewhere"));
  await assert.rejects(vault.exportPhoneSnapshot(bob), errorCode("invalid_snapshot"));
  assert.equal(port.rows.has(bob), false);
});

await test("metadata listing isolates exact accounts and never exposes encrypted content or keys", async () => {
  const port = new MemoryPort(), vault = client(port);
  for (const scope of ["guest", alice, aliceOld, bob, `account:alice2:${workspace}`, `account:alice%3Abob:${workspace}`]) await vault.savePhoneSnapshot(scope, draft(scope));
  const malformed = `account:alice:new`; port.rows.set(malformed, { storageVersion: 99, secret: "Private future content" });
  const rows = await vault.listPhoneSnapshots("account:alice:");
  assert.deepEqual(new Set(rows.map(row => row.scope)), new Set([alice, aliceOld, malformed]));
  assert.ok(rows.every(row => Object.keys(row).sort().join(",") === "scope,updatedAt"));
  assert.equal(rows.find(row => row.scope === malformed).updatedAt, "");
  assert.deepEqual((await vault.listPhoneSnapshots("guest")).map(row => row.scope), ["guest"]);
  assert.deepEqual((await vault.listPhoneSnapshots("account:alice%3Abob:")).map(row => row.scope), [`account:alice%3Abob:${workspace}`]);
  for (const prefix of ["", "account:", "account:alice", "account:ali", "account:alice:\0", "account:alice%3abob:", "guest:"]) await assert.rejects(vault.listPhoneSnapshots(prefix), errorCode("invalid_scope"));
});

await test("malformed and ambiguous scope identifiers never reach storage", async () => {
  const port = new MemoryPort(), vault = client(port);
  for (const scope of ["", "Guest", "account:alice:", "account:alice:123", "account:alice:bob:new", "account:%61lice:new", "account:%:new", "account:%00:new", "account::new", "account:alice:new/other", "guest\0"]) {
    await assert.rejects(vault.loadPhoneSnapshot(scope), errorCode("invalid_scope"));
    await assert.rejects(vault.savePhoneSnapshot(scope, draft(scope)), errorCode("invalid_scope"));
    await assert.rejects(vault.removePhoneSnapshot(scope), errorCode("invalid_scope"));
  }
  assert.equal(port.rows.size, 0);
});

await test("invalid or oversized new fields do not replace the last valid draft", async () => {
  const port = new MemoryPort(), vault = client(port); await vault.savePhoneSnapshot(alice, draft());
  const original = structuredClone(port.rows.get(alice));
  const invalid = draft(); invalid.records[0].followUpDate = "2026-02-30";
  await assert.rejects(vault.savePhoneSnapshot(alice, invalid), errorCode("invalid_snapshot"));
  const large = draft(); large.jobs[0].title = "x".repeat(501);
  await assert.rejects(vault.savePhoneSnapshot(alice, large), errorCode("invalid_snapshot"));
  const badCountry = draft(); badCountry.profile.targetCountries = ["ZZ"];
  await assert.rejects(vault.savePhoneSnapshot(alice, badCountry), errorCode("invalid_snapshot"));
  const badPDF = draft(); badPDF.profile.resume.size += 1;
  await assert.rejects(vault.savePhoneSnapshot(alice, badPDF), errorCode("invalid_snapshot"));
  await assert.rejects(vault.savePhoneSnapshot(alice, draft(bob)), errorCode("invalid_snapshot"));
  assert.deepEqual(port.rows.get(alice), original);
});

await test("maximum collection counts, full Unicode notes and a 5 MB PDF survive a bounded round trip", async () => {
  const value = draft(), cjk = count => "界".repeat(count);
  const pdf = Buffer.alloc(MAX_PDF_BYTES, 65); pdf.write("%PDF-1.7");
  value.profile = { ...value.profile, firstName: cjk(150), lastName: cjk(150), email: "x".repeat(254), phone: cjk(150), city: cjk(150), country: "US", headline: cjk(500), skills: Array(30).fill(cjk(100)), targetRoles: Array(30).fill(cjk(100)), targetCountries: countryCodes.slice(0, 30), workModes: ["on-site", "hybrid", "remote"], website: "x".repeat(2048), linkedin: "x".repeat(2048), resume: { name: cjk(176) + ".pdf", mime: "application/pdf", size: pdf.length, sha256: createHash("sha256").update(pdf).digest("hex"), dataBase64: pdf.toString("base64") } };
  value.jobs = Array.from({ length: 200 }, (_, index) => ({ id: `job-${index}`, title: cjk(500), company: cjk(250), url: `https://jobs.example.com/roles/${index}`, location: cjk(500), country: "US", checkedAt: fixedNow().toISOString(), sourceName: cjk(150), summary: cjk(1000) }));
  value.records = Array.from({ length: 500 }, (_, index) => ({ ...draft().records[0], identity: `https://jobs.example.com/roles/${index}`, title: cjk(500), company: cjk(250), note: cjk(5000) }));
  value.filters = { query: cjk(120), location: cjk(100), remoteOnly: true, sources: ["https://jobs.lever.co/a", "https://jobs.lever.co/b", "https://jobs.lever.co/c", "https://jobs.lever.co/d"] };
  value.lastSearch = { filters: structuredClone(value.filters), page: { ok: true, version: 1, generatedAt: fixedNow().toISOString(), status: "complete", jobs: value.jobs.map(job => ({ id: job.id, title: job.title, company: job.company, url: job.url, location: job.location, country: job.country, remote: true, summary: job.summary, checkedAt: job.checkedAt, stale: false, sourceName: job.sourceName })), sources: Array.from({ length: 4 }, (_, index) => ({ id: `source-${index}`, name: cjk(150), provider: "lever", region: "global", boardUrl: `https://jobs.lever.co/source-${index}`, status: "fresh", checkedAt: fixedNow().toISOString(), availableCount: 50, matchedCount: 50, limited: true, error: null })), nextCursor: null, totalMatches: 200, limited: true, notice: cjk(2000) } };
  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  assert.ok(bytes > 15 * 1024 * 1024 && bytes < 20 * 1024 * 1024, `Large valid fixture size: ${bytes}`);
  assert.doesNotThrow(() => modelModule.parseSnapshot(value, alice), "The large round-trip fixture must satisfy the current phone model");
  const port = new MemoryPort(), vault = client(port);
  await vault.savePhoneSnapshot(alice, value);
  const restored = await client(port).loadPhoneSnapshot(alice);
  assert.deepEqual(restored, value);
  assert.equal(port.rows.get(alice).ciphertext.byteLength, bytes + 16);
});

await test("an unfamiliar IndexedDB version surfaces a recovery-safe error without deleting databases", async () => {
  let opens = 0;
  const factory = { open() { opens++; const request = {}; queueMicrotask(() => { request.error = new DOMException("newer database", "VersionError"); request.onerror(); }); return request; } };
  const vault = client(createIndexedDBPhoneVaultPort(factory));
  await assert.rejects(vault.loadPhoneSnapshot(alice), errorCode("unsupported"));
  await assert.rejects(vault.savePhoneSnapshot(alice, draft()), errorCode("unsupported"));
  assert.equal(opens, 2);
});

await test("missing browser capabilities fail explicitly while module import remains SSR-safe", async () => {
  assert.equal(typeof globalThis.indexedDB, "undefined");
  const vault = createPhoneVault();
  await assert.rejects(vault.loadPhoneSnapshot(alice), errorCode("unavailable"));
  const brokenCrypto = { subtle: { generateKey: async () => { throw new DOMException("unsupported", "NotSupportedError"); } }, getRandomValues: array => webcrypto.getRandomValues(array) };
  const port = new MemoryPort();
  await assert.rejects(client(port, { crypto: brokenCrypto }).savePhoneSnapshot(alice, draft()), errorCode("unavailable"));
  assert.equal(port.rows.has(alice), false);
});

const { createPhoneSafety, heldPlan } = safetyModule;
const planOne = "33333333-3333-4333-8333-333333333333", planTwo = "44444444-4444-4444-8444-444444444444";
const recoveryId = "55555555-5555-4555-8555-555555555555";
function recoveredProfile(id = recoveryId) { return { id, savedAt: fixedNow().toISOString(), profile: draft().profile }; }

await test("Stop intent survives reload, failed transport and other account scopes", async () => {
  const port = new MemoryPort(), safety = createPhoneSafety(client(port));
  await safety.hold(alice, planOne);
  const reloaded = createPhoneSafety(client(port));
  assert.equal(heldPlan((await reloaded.load(alice)).holds, planOne), true);
  assert.deepEqual((await reloaded.load(bob)).holds, []);
  assert.deepEqual((await reloaded.load(aliceOld)).holds, []);
  assert.equal((await reloaded.load(alice)).holds[0].confirmed, false);
  await reloaded.confirm(alice, planOne);
  assert.equal((await createPhoneSafety(client(port)).load(alice)).holds[0].confirmed, true);
  assert.equal(port.rows.get(alice).key.extractable, false);
});
await test("recovery keeps unfinished profile and private notes without changing the main vault", async () => {
  const originalPort = new MemoryPort(), original = client(originalPort), recoveryPort = new MemoryPort(), safety = createPhoneSafety(client(recoveryPort));
  const saved = draft(); await original.savePhoneSnapshot(alice, saved);
  await safety.recover(alice, recoveredProfile());
  const record = saved.records[0], recoveryRecord = { id: planTwo, savedAt: fixedNow().toISOString(), record: { job: saved.jobs[0], original: record, draft: { ...record, stage: "saved", note: "Unfinished PRIVATE note" }, existed: true } };
  await safety.recover(alice, recoveryRecord);
  const restored = await createPhoneSafety(client(recoveryPort)).load(alice);
  assert.equal(restored.recovery.length, 2); assert.equal(restored.recovery[1].record.draft.note, recoveryRecord.record.draft.note);
  assert.deepEqual(await original.loadPhoneSnapshot(alice), saved);
  assert.ok(!new TextDecoder().decode(recoveryPort.rows.get(alice).ciphertext).includes("PRIVATE"));
});
await test("concurrent safety updates merge Stop holds and recovery without losing either", async () => {
  const port = new MemoryPort(), first = createPhoneSafety(client(port)), second = createPhoneSafety(client(port));
  await Promise.all([first.hold(alice, planOne), second.recover(alice, recoveredProfile()), first.load(alice)]);
  const value = await createPhoneSafety(client(port)).load(alice);
  assert.equal(heldPlan(value.holds, planOne), true); assert.equal(value.recovery.length, 1);
});
await test("clearing personal recovery keeps Stop locks and fences queued old draft saves", async () => {
  const port = new MemoryPort(), safety = createPhoneSafety(client(port)); await safety.hold(alice, planOne); await safety.recover(alice, recoveredProfile());
  const pending = safety.recover(alice, recoveredProfile(planTwo)), cleared = safety.clearRecovery(alice);
  await assert.rejects(pending, errorCode("reset_pending")); await cleared;
  const value = await createPhoneSafety(client(port)).load(alice); assert.equal(value.recovery.length, 0); assert.equal(heldPlan(value.holds, planOne), true); assert.deepEqual(await safety.list("account:alice:"), []);
});
await test("recovery quota failure preserves existing Stop intent and supports a later retry", async () => {
  const port = new MemoryPort(), safety = createPhoneSafety(client(port)); await safety.hold(alice, planOne);
  port.writeFailure = new DOMException("full", "QuotaExceededError"); await assert.rejects(safety.checkWritable(alice), errorCode("storage_full")); await assert.rejects(safety.recover(alice, recoveredProfile()), errorCode("storage_full"));
  assert.equal(heldPlan((await safety.load(alice)).holds, planOne), true);
  port.writeFailure = null; await safety.recover(alice, recoveredProfile()); assert.equal((await safety.load(alice)).recovery.length, 1);
});
await test("discarding a stale recovery confirmation cannot erase newer edits", async () => {
  const port = new MemoryPort(), safety = createPhoneSafety(client(port)); const before = recoveredProfile(); await safety.recover(alice, before);
  const newer = { ...before, savedAt: "2026-11-17T12:01:00.000Z", profile: { ...before.profile, firstName: "Newer edit" } }; await safety.recover(alice, newer);
  await assert.rejects(safety.discard(alice, before.id, before.savedAt), errorCode("changed_elsewhere")); assert.equal((await safety.load(alice)).recovery[0].profile.firstName, "Newer edit");
});

console.log(JSON.stringify({ ok: true, groups: results.length, checks: results, coverage: "Actual Node WebCrypto + structured-cloned non-extractable keys; injected atomic storage port. Real browser IndexedDB acceptance remains a separate check." }, null, 2));
