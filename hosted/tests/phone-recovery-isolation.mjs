import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";

// Run the real PhoneApp handlers and production encrypted vault/safety modules.
// The only replacements are React/browser ports and synthetic atomic storage;
// no browser profile, account, provider or real private data is opened.
const source = await readFile(new URL("../app/phone/PhoneApp.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("PhoneApp.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findNode(predicate) {
  let found;
  function visit(node) { if (predicate(node)) { assert(!found, "Production handler must be unique"); found = node; } ts.forEachChild(node, visit); }
  visit(tree); assert(found, "Actual production handler must exist"); return found;
}
const extracted = new Map(), compiled = new Map();
function declaration(name) {
  if (!extracted.has(name)) {
    const app = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "PhoneApp");
    const candidates = [...tree.statements, ...app.body.statements].flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : [node]);
    const matches = candidates.filter(node => ts.isVariableDeclaration(node) && node.name.getText(tree) === name || ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.equal(matches.length, 1, "Actual top-level handler " + name + " must be unique");
    const node = matches[0];
    extracted.set(name, ts.isVariableDeclaration(node) ? node.initializer.getText(tree) : node.getText(tree));
  }
  return extracted.get(name);
}
function action(label) {
  const key = "action:" + label;
  if (!extracted.has(key)) extracted.set(key, findNode(node => ts.isCallExpression(node) && node.expression.getText(tree) === "run" && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === label).arguments[1].getText(tree));
  return extracted.get(key);
}
function buttonClick(label) {
  const key = "button:" + label;
  if (extracted.has(key)) return extracted.get(key);
  const button = findNode(node => {
    if (!ts.isJsxElement(node) || node.openingElement.tagName.getText(tree) !== "button") return false;
    let matches = false;
    function visit(child) { if (ts.isCallExpression(child) && child.expression.getText(tree) === "t" && ts.isStringLiteral(child.arguments[0]) && child.arguments[0].text === label) matches = true; ts.forEachChild(child, visit); }
    node.children.forEach(visit); return matches;
  });
  extracted.set(key, button.openingElement.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.text === "onClick").initializer.expression.getText(tree));
  return extracted.get(key);
}
function install(context, name, value = declaration(name)) {
  const key = name + ":" + value;
  if (!compiled.has(key)) compiled.set(key, ts.transpileModule("globalThis." + name + " = " + value, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText);
  vm.runInContext(compiled.get(key), context); return context[name];
}
const bundle = await build({
  stdin: { contents: 'export * from "./app/phone/vault.ts"; export { workspaceFromResponse, acknowledgeWorkspacePublication } from "./app/phone/api.ts"; export { PhoneReadError } from "./app/phone/read-transport.ts"; export { APIError } from "./app/components/api.ts"; export * from "./app/phone/historical-text.ts"; export * from "./app/phone/model.ts"; export * from "./app/phone/safety.ts"; export * from "./app/i18n/core.ts"; export { z } from "zod";', resolveDir: process.cwd(), sourcefile: "phone-recovery-production.ts" },
  bundle: true, write: false, platform: "node", format: "esm", target: "node24", logLevel: "silent",
});
const production = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text + "\n//# sourceURL=phone-recovery-production.mjs").toString("base64"));
const { createPhoneVault, createPhoneSafety, blankSnapshot, blankRecord, PhoneVaultError } = production;
const validWorkspace = () => ({ ok: true, accountId: "synthetic-a", accountEmail: "applicant@example.invalid", confirmedEmail: "applicant@example.invalid", emailUpdateRequired: false, deleting: false, workspaceId: uuid(1), mode: "local", profile: savedSnapshot().profile, jobs: [], attempts: [], capabilities: { liveEnabled: false, mode: "local", coverage: "Synthetic only" }, recoverablePlans: [], activePlanIds: [] });
const uuid = n => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const scope = "account:synthetic-a:" + uuid(1), otherScope = "account:synthetic-b:" + uuid(2);
const originalId = uuid(10), holdId = uuid(11);
const fixedNow = () => new Date("2026-11-17T12:00:00.000Z");
const plain = value => structuredClone(value);
const deferred = () => { let resolve; return { promise: new Promise(done => { resolve = done; }), resolve: () => resolve() }; };

class MemoryPort {
  rows = new Map();
  writes = [];
  removals = [];
  writeCalls = 0;
  writeFailure = null;
  failWriteAt = null;
  removeFailure = null;
  beforeWrite = null;
  afterWrite = null;
  afterRemove = null;
  async read(owner) { return this.rows.has(owner) ? { exists: true, value: plain(this.rows.get(owner)) } : { exists: false }; }
  async compareAndSet(owner, expectedId, value) {
    this.writeCalls++;
    if (this.beforeWrite) await this.beforeWrite(owner);
    if (this.writeFailure || this.failWriteAt === this.writeCalls) throw this.writeFailure ?? new DOMException("Synthetic full storage", "QuotaExceededError");
    const exists = this.rows.has(owner), saved = this.rows.get(owner);
    if (expectedId === null ? exists : !exists || saved.envelopeId !== expectedId) return false;
    this.rows.set(owner, plain(value)); this.writes.push(owner);
    if (this.afterWrite) await this.afterWrite(owner);
    return true;
  }
  async remove(owner, marker) {
    if (this.removeFailure) throw this.removeFailure;
    this.rows.set(owner, plain(marker)); this.removals.push(owner);
    if (this.afterRemove) await this.afterRemove(owner);
  }
  async list(prefix) { return [...this.rows].filter(([owner, value]) => !value.reset && owner.startsWith(prefix)).map(([owner, value]) => ({ scope: owner, updatedAt: value.updatedAt })); }
}
const vault = port => createPhoneVault({ port, crypto: webcrypto, now: fixedNow });
function savedSnapshot(owner = scope) {
  const value = blankSnapshot(owner);
  value.profile.firstName = "Earlier saved profile";
  value.jobs = [{ id: "synthetic-job", title: "Engineer", company: "Synthetic employer", url: "https://example.com/job/1", location: "Remote", country: "" }];
  value.records = [{ ...blankRecord(value.jobs[0]), note: "Earlier saved note" }];
  return value;
}
function recovery(kind, id = originalId, savedAt = "2026-11-17T12:00:00.000Z") {
  const saved = savedSnapshot();
  return kind === "profile"
    ? { id, savedAt, profile: { ...saved.profile, firstName: "Recovered profile العربية" } }
    : { id, savedAt, record: { job: saved.jobs[0], original: saved.records[0], draft: { ...saved.records[0], note: "Recovered private note العربية" }, existed: true } };
}
async function harness({ mainPort = new MemoryPort(), recoveryPort = new MemoryPort() } = {}) {
  const main = vault(mainPort), safety = createPhoneSafety(vault(recoveryPort));
  let saved = await main.loadPhoneSnapshot(scope);
  if (!saved) { saved = savedSnapshot(); await main.savePhoneSnapshot(scope, saved); }
  const context = {
    ...production, crypto: webcrypto, DOMException, Error,
    account: { id: "synthetic-a" }, epoch: { current: 1 }, identityUnverified: { current: false },
    busyRef: { current: false }, readIssueRef: { current: null }, recordRecoveryLifecycle: { current: { retired: new Map(), editorVersion: 0 } },
    snapshotRef: { current: saved }, workspaceRef: { current: { workspaceId: uuid(1), activePlanIds: [] } },
    locked: false, checkingIdentity: false, storageProblem: "", profile: plain(saved.profile), formChanged: false,
    editorDraft: null, dialog: null, dialogDirty: false, closedJobDrafts: { current: new Set() }, quarantine: { current: null }, pdfCheck: { current: null }, discardReturn: { current: null }, profileRecoveryId: { current: null }, recordRecoveryId: { current: null }, clearingRecovery: { current: null },
    safetyState: await safety.load(scope), safetyError: "", notice: null, reloads: 0, navigation: [],
    phoneSafety: safety, savePhoneSnapshot: main.savePhoneSnapshot, loadPhoneSnapshot: main.loadPhoneSnapshot, removePhoneSnapshot: main.removePhoneSnapshot,
    responseWorkspace: validWorkspace(), phoneAPI: async () => context.responseWorkspace, downloads: [], download: value => context.downloads.push(JSON.parse(value)),
    document: { visibilityState: "visible", activeElement: null }, HTMLElement: class {}, setFilters: value => { context.filters = value; },
    run: (_label, callback) => callback(context.epoch.current),
    navigate: tab => context.navigation.push(tab),
    window: { location: { reload() { context.reloads++; } } },
  };
  for (const [setter, field] of Object.entries({ setReadIssue: "readIssue", setProfile: "profile", setFormChanged: "formChanged", setEditorDraft: "editorDraft", setDialog: "dialog", setDialogDirty: "dialogDirty", setSafetyState: "safetyState", setSafetyError: "safetyError", setNotice: "notice", setStorageProblem: "storageProblem", setStorageCode: "storageCode", setPlan: "plan", setReviewAccepted: "reviewAccepted", setConfirmDialogDiscard: "confirmDialogDiscard", setSnapshot: "snapshot", setWorkspace: "workspace", setHasQuarantinedEdits: "hasQuarantinedEdits", setRecoveryStatus: "recoveryStatus", setSelected: "selected", setOlderDrafts: "olderDrafts", setSearchPage: "searchPage", setSearchedFilters: "searchedFilters", setSearchNewResult: "searchNewResult", setShowNewOnly: "showNewOnly", setEmployerAnswers: "employerAnswers", setCheckingIdentity: "checkingIdentity", setLocked: "locked" })) {
    context[setter] = value => { context[field] = typeof value === "function" ? value(context[field]) : value; };
  }
  vm.createContext(context);
  for (const name of ["rememberReadIssue", "same", "message", "local", "assertCurrent", "putSnapshot", "putWorkspace", "storageFailure", "persist", "unfinished", "adoptSafety", "preserveUnfinished", "retireRecordRecovery", "discardRecovery", "restoreRecovery", "saveLocalProfile", "saveRecord", "openAddJob", "editAddedJob", "saveJob", "saveAddedJob", "discardDialogEdits", "rememberDiscardOpener", "requestDialogClose", "editRecord", "exportUnfinished", "lock", "recoverLocked"]) install(context, name);
  install(context, "openClear", buttonClick("Clear this phone’s saved data"));
  install(context, "openReset", buttonClick("Reset this phone’s data"));
  install(context, "clear", action("Clearing phone data"));
  install(context, "discardConfirmed", action("Discarding recovery copy"));
  return { context, main, safety, mainPort, recoveryPort };
}
test("online profile save preserves the local CV until the service confirms the change", async () => {
  const bytes = Buffer.from("%PDF-1.4 fixture");
  const digest = Buffer.from(await webcrypto.subtle.digest("SHA-256", bytes)).toString("hex");
  const metadata = { name: "سيرة.pdf", mime: "application/pdf", size: bytes.length, sha256: digest };
  const selected = { ...metadata, name: "  سيرة.pdf", dataBase64: bytes.toString("base64") };
  for (const [draft, reply, accepted] of [
    [selected, null, false], [selected, { ...metadata, name: "Other.pdf" }, false],
    [selected, { ...metadata, size: bytes.length + 1 }, false],
    [selected, { ...metadata, sha256: "b".repeat(64) }, false],
    [null, metadata, false], [selected, metadata, true], [null, null, true],
  ]) {
    const { context, main } = await harness();
    install(context, "online"); install(context, "withPDF"); install(context, "saveOnlineProfile");
    const workspace = validWorkspace();
    workspace.profile.resume = { ...metadata, name: "Previous.pdf" };
    context.workspaceRef.current = workspace;
    context.profile = { ...workspace.profile, resume: draft };
    context.formChanged = true;
    let writes = 0;
    context.phoneAPI = async (path, options) => {
      assert.equal(path, "/api/phone/profile"); assert.equal(options.method, "PUT"); writes++;
      return { profile: { ...workspace.profile, revision: 1, resume: reply } };
    };
    if (accepted) {
      await context.saveOnlineProfile();
      assert.equal(context.formChanged, false);
      assert.equal(context.profile.revision, 1);
      assert.equal(context.profile.resume?.dataBase64, draft?.dataBase64);
      assert.equal(context.profile.resume?.name, reply?.name);
      assert.equal((await main.loadPhoneSnapshot(scope)).profileDirty, false);
    } else {
      await assert.rejects(context.saveOnlineProfile(), /did not confirm the CV change/);
      const restored = await main.loadPhoneSnapshot(scope);
      assert.deepEqual(restored.profile.resume, draft);
      assert.equal(restored.profileDirty, true);
      assert.equal(context.workspaceRef.current, workspace);
      assert.equal(context.formChanged, true);
      assert.equal(restored.profile.revision, 0);
    }
    assert.equal(writes, 1);
  }
});

function markUnfinished(h) {
  const c = h.context;
  c.profile = { ...c.profile, firstName: "Current unsaved profile" }; c.formChanged = true;
  c.editorDraft = { ...savedSnapshot().records[0], note: "Current unfinished record" };
  c.profileRecoveryId.current = uuid(20); c.recordRecoveryId.current = uuid(21);
  return { profile: plain(c.profile), editorDraft: plain(c.editorDraft), profileId: c.profileRecoveryId.current, recordId: c.recordRecoveryId.current };
}
function assertUnfinished(h, before) {
  const c = h.context;
  assert.equal(c.formChanged, true); assert.deepEqual(plain(c.profile), before.profile); assert.deepEqual(plain(c.editorDraft), before.editorDraft);
  assert.equal(c.profileRecoveryId.current, before.profileId); assert.equal(c.recordRecoveryId.current, before.recordId); assert.equal(c.reloads, 0);
}
async function seed(h, kind) {
  const original = recovery(kind);
  await h.safety.hold(scope, holdId); await h.safety.recover(scope, original);
  h.context.safetyState = await h.safety.load(scope);
  return original;
}
const recoveryRows = h => createPhoneSafety(vault(h.recoveryPort)).load(scope);
const hasCode = code => error => error instanceof PhoneVaultError && error.code === code;

for (const kind of ["profile", "record"]) {
  test("actual " + kind + " restore forks ownership so one tab's successful save keeps the other's newer recovery", async () => {
    const a = await harness(), original = await seed(a, kind), originalJSON = JSON.stringify(original);
    const b = await harness({ mainPort: a.mainPort, recoveryPort: a.recoveryPort });
    await a.context.restoreRecovery(original); await b.context.restoreRecovery(original);
    if (kind === "profile") { b.context.profile = { ...b.context.profile, firstName: "Newer tab B profile" }; }
    else { b.context.editorDraft = { ...b.context.editorDraft, note: "Newer tab B private note" }; }
    await b.context.preserveUnfinished(scope, b.context.unfinished());
    const aId = (kind === "profile" ? a.context.profileRecoveryId : a.context.recordRecoveryId).current;
    const bId = (kind === "profile" ? b.context.profileRecoveryId : b.context.recordRecoveryId).current;
    if (kind === "profile") await a.context.saveLocalProfile();
    else await a.context.saveRecord(a.context.editorDraft, false);
    const after = await recoveryRows(a);
    const bCopy = after.recovery.find(row => row.id === bId);
    assert(bCopy, "Tab A save must not erase tab B's newer recoverable edits");
    assert.equal(kind === "profile" ? bCopy.profile.firstName : bCopy.record.draft.note, kind === "profile" ? "Newer tab B profile" : "Newer tab B private note");
    assert.notEqual(aId, original.id); assert.notEqual(bId, original.id); assert.notEqual(aId, bId);
    assert(!after.recovery.some(row => row.id === aId), "Only the saved tab's own copy is removed");
    assert.deepEqual(after.recovery.find(row => row.id === original.id), original); assert.equal(JSON.stringify(original), originalJSON);
    assert.equal(after.holds[0].planId, holdId);
    const main = await vault(a.mainPort).loadPhoneSnapshot(scope);
    assert.equal(kind === "profile" ? main.profile.firstName : main.records[0].note, kind === "profile" ? original.profile.firstName : original.record.draft.note);
  });

  test("actual " + kind + " restore preserves current form and both identities when fork storage hits quota", async () => {
    const h = await harness(), original = await seed(h, kind), before = markUnfinished(h);
    // The first write preserves the current editor; the second persists the fork.
    h.recoveryPort.failWriteAt = h.recoveryPort.writeCalls + 2;
    await assert.rejects(h.context.restoreRecovery(original), hasCode("storage_full"));
    assertUnfinished(h, before); assert.equal(h.context.navigation.length, 0);
    const state = await recoveryRows(h);
    assert.deepEqual(state.recovery.find(row => row.id === original.id), original);
    assert.equal(state.recovery.find(row => row.id === before.profileId).profile.firstName, before.profile.firstName);
    assert.equal(state.recovery.length, 2); assert.equal(state.holds[0].planId, holdId);
  });

  test("actual " + kind + " restore rejects the recovery-cap edge without replacing the current form or source copy", async () => {
    const h = await harness(), original = await seed(h, kind);
    for (let n = 0; n < 19; n++) await h.safety.recover(scope, recovery("profile", uuid(100 + n)));
    const before = { profile: plain(h.context.profile), editorDraft: h.context.editorDraft, dialog: h.context.dialog };
    await assert.rejects(h.context.restoreRecovery(original));
    assert.deepEqual(plain(h.context.profile), before.profile); assert.equal(h.context.editorDraft, before.editorDraft); assert.equal(h.context.dialog, before.dialog);
    assert.equal(h.context.formChanged, false); assert.equal(h.context.profileRecoveryId.current, null); assert.equal(h.context.recordRecoveryId.current, null);
    const state = await recoveryRows(h); assert.equal(state.recovery.length, 20); assert.deepEqual(state.recovery.find(row => row.id === original.id), original);
  });

  test("actual " + kind + " restore adopts nothing after scope or identity changes during fork persistence", async t => {
    for (const changed of ["scope", "generation", "identity"]) await t.test(changed, async () => {
      const h = await harness(), original = await seed(h, kind), before = plain(h.context.profile);
      h.recoveryPort.afterWrite = async () => {
        if (changed === "scope") h.context.snapshotRef.current = savedSnapshot(otherScope);
        else if (changed === "generation") h.context.epoch.current++;
        else h.context.identityUnverified.current = true;
      };
      await assert.rejects(h.context.restoreRecovery(original), /page changed|account needs to be confirmed/);
      assert.deepEqual(plain(h.context.profile), before); assert.equal(h.context.formChanged, false);
      assert.equal(h.context.profileRecoveryId.current, null); assert.equal(h.context.recordRecoveryId.current, null); assert.equal(h.context.editorDraft, null);
      assert.equal(h.context.navigation.length, 0); assert.deepEqual((await recoveryRows(h)).recovery.find(row => row.id === original.id), original);
      assert(!h.recoveryPort.rows.has(otherScope));
    });
  });

  test("actual explicit " + kind + " discard refuses a stale confirmation and keeps a newer shared source", async () => {
    const h = await harness(), original = await seed(h, kind);
    h.context.dialog = { kind: "recover", draft: original };
    const newer = recovery(kind, original.id, "2026-11-17T12:01:00.000Z");
    if (kind === "profile") newer.profile.firstName = "Newer shared source"; else newer.record.draft.note = "Newer shared note";
    await createPhoneSafety(vault(h.recoveryPort)).recover(scope, newer);
    await assert.rejects(h.context.discardConfirmed(h.context.epoch.current), hasCode("changed_elsewhere"));
    assert.deepEqual((await recoveryRows(h)).recovery.find(row => row.id === original.id), newer); assert.equal(h.context.dialog.draft, original);
  });
}

test("actual Clear preserves unsaved fields and dirty tracking when the recovery vault write fails", async () => {
  const h = await harness(), original = await seed(h, "profile"), before = markUnfinished(h);
  h.context.openClear(); h.recoveryPort.writeFailure = new DOMException("Synthetic full storage", "QuotaExceededError");
  await assert.rejects(h.context.clear(h.context.epoch.current), hasCode("storage_full"));
  assertUnfinished(h, before); assert.equal(h.mainPort.removals.length, 0);
  assert.deepEqual((await recoveryRows(h)).recovery, [original]); assert.equal(h.context.safetyState.recovery.length, 1);
});

test("actual partial Clear updates removed recovery entries while preserving main data and unsaved editors", async () => {
  const h = await harness(); await seed(h, "profile"); const before = markUnfinished(h);
  h.context.openClear(); h.mainPort.removeFailure = new DOMException("Synthetic failed reset", "QuotaExceededError");
  await assert.rejects(h.context.clear(h.context.epoch.current), hasCode("storage_full"));
  assertUnfinished(h, before); assert.equal((await vault(h.mainPort).loadPhoneSnapshot(scope)).profile.firstName, "Earlier saved profile");
  assert.equal((await recoveryRows(h)).recovery.length, 0); assert.equal(h.context.safetyState.recovery.length, 0);
  assert.equal(h.context.safetyState.holds[0].planId, holdId);
  await h.context.preserveUnfinished(scope, h.context.unfinished());
  assert.equal((await recoveryRows(h)).recovery[0].profile.firstName, before.profile.firstName, "Recovery must resume after a failed Clear");
});

test("actual Clear retains dirty state while either storage operation is still pending", async t => {
  for (const stage of ["recovery", "main"]) await t.test(stage, async () => {
    const h = await harness(); await seed(h, "profile"); const before = markUnfinished(h), entered = deferred(), gate = deferred();
    const wait = async () => { entered.resolve(); await gate.promise; };
    if (stage === "recovery") h.recoveryPort.afterWrite = wait; else h.mainPort.afterRemove = wait;
    h.context.openClear(); const pending = h.context.clear(h.context.epoch.current);
    try { await entered.promise; assertUnfinished(h, before); } finally { gate.resolve(); }
    await pending; assert.equal(h.context.reloads, 1); assert.equal(h.context.formChanged, false);
  });
});

test("actual successful Clear removes only its confirmed scope and keeps Stop holds", async () => {
  const h = await harness(); await seed(h, "profile"); markUnfinished(h);
  await vault(h.mainPort).savePhoneSnapshot(otherScope, savedSnapshot(otherScope));
  await createPhoneSafety(vault(h.recoveryPort)).recover(otherScope, recovery("record"));
  h.context.openClear(); await h.context.clear(h.context.epoch.current);
  assert.equal(h.context.formChanged, false); assert.equal(h.context.editorDraft, null); assert.equal(h.context.profileRecoveryId.current, null); assert.equal(h.context.recordRecoveryId.current, null); assert.equal(h.context.reloads, 1);
  assert.equal(await vault(h.mainPort).loadPhoneSnapshot(scope), null); assert.equal((await recoveryRows(h)).recovery.length, 0); assert.equal((await recoveryRows(h)).holds[0].planId, holdId);
  assert.equal((await vault(h.mainPort).loadPhoneSnapshot(otherScope)).profile.firstName, "Earlier saved profile");
  assert.equal((await createPhoneSafety(vault(h.recoveryPort)).load(otherScope)).recovery.length, 1);
});

test("actual Clear rejects a confirmation from another scope or generation before changing storage", async t => {
  for (const changed of ["scope", "generation", "identity"]) await t.test(changed, async () => {
    const h = await harness(); await seed(h, "profile"); const before = markUnfinished(h), writes = h.recoveryPort.writes.length;
    h.context.openClear();
    if (changed === "scope") { h.context.snapshotRef.current = savedSnapshot(otherScope); h.context.workspaceRef.current = { workspaceId: uuid(2) }; }
    else if (changed === "generation") h.context.epoch.current++;
    else h.context.identityUnverified.current = true;
    await assert.rejects(h.context.clear(h.context.epoch.current), /page changed|account needs to be confirmed/);
    assertUnfinished(h, before); assert.equal(h.mainPort.removals.length, 0); assert.equal(h.recoveryPort.writes.length, writes);
  });
});

test("actual Clear rechecks owner and generation after each storage await before proceeding or reloading", async t => {
  for (const stage of ["recovery", "main"]) for (const changed of ["scope", "generation", "identity"]) await t.test(stage + ":" + changed, async () => {
    const h = await harness(); await seed(h, "record"); const before = markUnfinished(h), captured = h.context.unfinished();
    const change = async () => {
      if (changed === "scope") h.context.snapshotRef.current = savedSnapshot(otherScope);
      else if (changed === "generation") h.context.epoch.current++;
      else h.context.identityUnverified.current = true;
    };
    if (stage === "recovery") h.recoveryPort.afterWrite = change; else h.mainPort.afterRemove = change;
    h.context.openClear(); await assert.rejects(h.context.clear(h.context.epoch.current), /page changed|account needs to be confirmed/);
    assertUnfinished(h, before); assert.equal(h.mainPort.removals.length, stage === "recovery" ? 0 : 1);
    assert(!h.mainPort.rows.has(otherScope)); assert(!h.recoveryPort.rows.has(otherScope));
    if (stage === "main") {
      assert.equal(h.mainPort.rows.get(scope).reset, true, "The main reset already committed before the stale UI rejection");
      assert.equal(await vault(h.mainPort).loadPhoneSnapshot(scope), null);
      await assert.rejects(h.context.preserveUnfinished(scope, captured), hasCode("reset_pending"));
      assert.equal((await recoveryRows(h)).recovery.length, 0, "A stale UI result must not reopen recovery after a committed reset");
    }
  });
});

test("explicitly confirmed Clear remains available when the current main vault is damaged and no snapshot opened", async () => {
  const h = await harness(); await seed(h, "profile"); const before = markUnfinished(h);
  h.context.snapshotRef.current = null; h.context.storageProblem = "Synthetic unreadable encrypted draft";
  h.mainPort.rows.set(scope, { damaged: true });
  h.context.openReset(); await h.context.clear(h.context.epoch.current);
  assert.equal(h.context.reloads, 1); assert.equal(await vault(h.mainPort).loadPhoneSnapshot(scope), null);
  assert.equal((await recoveryRows(h)).holds[0].planId, holdId);
  assert.equal(h.context.formChanged, false); assert.notEqual(h.context.profileRecoveryId.current, before.profileId);
});

test("a captured recovery autosave cannot recreate personal drafts while Clear waits for the main reset", async () => {
  const h = await harness(); await seed(h, "profile"); markUnfinished(h);
  const captured = h.context.unfinished(), entered = deferred(), gate = deferred();
  h.mainPort.afterRemove = async () => { entered.resolve(); await gate.promise; };
  h.context.openClear(); const pending = h.context.clear(h.context.epoch.current);
  try {
    await entered.promise;
    await assert.rejects(h.context.preserveUnfinished(scope, captured), hasCode("reset_pending"));
    assert.equal((await recoveryRows(h)).recovery.length, 0, "The pre-clear autosave must stay fenced after the recovery reset");
  } finally { gate.resolve(); await pending; }
  assert.equal((await recoveryRows(h)).recovery.length, 0); assert.equal(h.context.reloads, 1);
});

// Exercise the actual Modal layout effect and Clear handler with controlled DOM
// ports. Only native focus/connection state and animation-frame delivery are fake.
const componentSource = await readFile(new URL("../app/phone/components.tsx", import.meta.url), "utf8");
const componentTree = ts.createSourceFile("components.tsx", componentSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const modalFunction = componentTree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "Modal");
assert(modalFunction?.body, "The actual Modal component is required");
const modalEffects = [];
function findModalEffect(node) {
  if (ts.isCallExpression(node) && node.expression.getText(componentTree) === "useLayoutEffect") modalEffects.push(node.arguments[0]);
  ts.forEachChild(node, findModalEffect);
}
findModalEffect(modalFunction.body);
assert.equal(modalEffects.length, 1, "The actual Modal layout effect must be unique");
const focusDefinitions = componentTree.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).filter(node => node.name.getText(componentTree) === "recoverPhoneFocus");
assert(focusDefinitions.length <= 1, "The production focus recovery must be unique");
// An absent helper leaves the original native-only cleanup executable for red
// regression evidence; no replacement recovery implementation is supplied.
const modalFocusCode = ts.transpileModule([
  focusDefinitions.length ? "globalThis.recoverPhoneFocus = " + focusDefinitions[0].initializer.getText(componentTree) + ";" : "",
  "globalThis.mountModal = " + modalEffects[0].getText(componentTree) + ";",
].join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

function modalFocusHarness({ nativeReturn = true } = {}) {
  const frames = [], focusCalls = [];
  const document = { activeElement: null, body: null, documentElement: null, querySelector() { assert.fail("Focus recovery must stay inside its owning phone shell"); } };
  let shell;
  class FocusTarget {
    constructor(name) { this.name = name; this.isConnected = true; this.focusable = true; this.ownerDocument = document; }
    closest(selector) { assert.equal(selector, ".phone-shell"); return shell; }
    focus(options) {
      focusCalls.push({ target: this, options });
      if (this.isConnected && this.focusable) { document.activeElement = this; this.onFocus?.(); }
    }
  }
  const body = new FocusTarget("body"), html = new FocusTarget("html"), invoker = new FocusTarget("record button"), heading = new FocusTarget("own Saved heading"), inside = new FocusTarget("dialog control"), clearButton = new FocusTarget("Clear filters"), otherControl = new FocusTarget("other phone control"), outsideControl = new FocusTarget("outside phone control"), unrelatedHeading = new FocusTarget("another phone heading");
  document.body = body; document.documentElement = html; document.activeElement = invoker;
  const element = {
    ownerDocument: document, isConnected: true, open: false, closes: 0,
    closest(selector) { assert.equal(selector, ".phone-shell"); return shell; },
    contains(target) { return target === this || target === inside; },
    showModal() { this.open = true; document.activeElement = inside; },
    close() {
      this.open = false; this.closes++;
      if (this.contains(document.activeElement)) document.activeElement = nativeReturn && invoker.isConnected && invoker.focusable ? invoker : body;
    },
  };
  shell = {
    isConnected: true, ownerDocument: document, replacementDialog: null,
    querySelector(selector) {
      if (selector === "dialog[open]") return element.open ? element : this.replacementDialog;
      assert.equal(selector, "#phone-main .phone-page-heading h1[tabindex='-1']");
      return heading.isConnected ? heading : null;
    },
  };
  const context = vm.createContext({ dialog: { current: element }, HTMLElement: FocusTarget, requestAnimationFrame(callback) { frames.push(callback); return frames.length; } });
  vm.runInContext(modalFocusCode, context);
  const disconnect = target => { target.isConnected = false; if (document.activeElement === target) document.activeElement = body; };
  const flush = () => { assert(frames.length <= 1, "One close/action schedules at most one focus check"); while (frames.length) frames.shift()(0); };
  const clear = () => {
    const filters = { query: "", view: "all", stage: "interview" };
    Object.assign(context, {
      heading: { current: heading },
      setSavedQuery: value => { filters.query = value; }, setSavedFilter: value => { filters.view = value; }, setSavedStage: value => { filters.stage = value; },
    });
    install(context, "clearSavedFilters", buttonClick("Clear search and filters"))();
    return filters;
  };
  return { document, body, html, invoker, heading, inside, element, shell, clearButton, otherControl, outsideControl, unrelatedHeading, frames, focusCalls, disconnect, flush, clear, mount: () => context.mountModal() };
}

test("actual Modal cleanup preserves native focus return and restores a surviving invoker when needed", () => {
  for (const nativeReturn of [true, false]) {
    const h = modalFocusHarness({ nativeReturn }), cleanup = h.mount();
    assert.equal(h.document.activeElement, h.inside);
    cleanup(); assert.equal(h.element.closes, 1); h.flush();
    assert.equal(h.document.activeElement, h.invoker);
    assert.equal(h.focusCalls.some(call => call.target === h.heading), false);
    if (nativeReturn) assert.equal(h.focusCalls.length, 0, "Already-restored native focus is not moved again");
  }
});

test("actual Modal cleanup recovers the owning heading when its invoker disappears before or after cleanup", () => {
  for (const removed of ["before", "after"]) {
    const h = modalFocusHarness(), cleanup = h.mount();
    if (removed === "before") h.disconnect(h.invoker);
    cleanup();
    if (removed === "after") h.disconnect(h.invoker);
    assert.equal(h.document.activeElement, h.body);
    h.flush();
    assert.equal(h.document.activeElement, h.heading, removed);
    assert.equal(h.focusCalls.filter(call => call.target === h.heading).length, 1);
    assert.equal(h.focusCalls.some(call => call.target === h.unrelatedHeading), false);
  }
});

test("actual Modal cleanup falls back if a connected invoker cannot receive focus", () => {
  const h = modalFocusHarness(), cleanup = h.mount();
  h.invoker.focusable = false; cleanup(); h.flush();
  assert.equal(h.document.activeElement, h.heading);
});

test("actual Modal cleanup leaves other live focus alone before close or before deferred recovery", () => {
  for (const timing of ["before close", "before recovery"]) for (const name of ["otherControl", "outsideControl"]) {
    const h = modalFocusHarness(), cleanup = h.mount();
    h.disconnect(h.invoker);
    if (timing === "before close") h.document.activeElement = h[name];
    cleanup();
    if (timing === "before recovery") h.document.activeElement = h[name];
    h.flush(); assert.equal(h.document.activeElement, h[name]); assert.equal(h.focusCalls.length, 0);
  }
});

test("actual Modal cleanup respects focus redirected while restoring the invoker", () => {
  const h = modalFocusHarness({ nativeReturn: false }), cleanup = h.mount();
  h.invoker.onFocus = () => { h.document.activeElement = h.otherControl; };
  cleanup(); h.flush();
  assert.equal(h.document.activeElement, h.otherControl);
  assert.equal(h.focusCalls.some(call => call.target === h.heading), false);
});

test("actual Modal cleanup does not override a reopened or replacement dialog", () => {
  for (const next of ["reopened", "replacement"]) {
    const h = modalFocusHarness(), cleanup = h.mount(); h.disconnect(h.invoker); cleanup();
    if (next === "reopened") h.element.showModal();
    else h.shell.replacementDialog = { open: true, isConnected: true };
    const active = h.document.activeElement;
    h.flush(); assert.equal(h.document.activeElement, active); assert.equal(h.focusCalls.length, 0);
  }
});

test("actual Modal cleanup does not focus a removed phone shell or heading", () => {
  for (const removed of ["shell", "heading"]) {
    const h = modalFocusHarness(), cleanup = h.mount(); h.disconnect(h.invoker); cleanup();
    h.disconnect(h[removed]); h.flush();
    assert.equal(h.document.activeElement, h.body); assert.equal(h.focusCalls.length, 0);
  }
});

test("actual Modal cleanup treats absent, document-root and disconnected focus as lost", () => {
  for (const target of ["absent", "root", "disconnected", "closing dialog"]) {
    const h = modalFocusHarness(), cleanup = h.mount(); h.disconnect(h.invoker); cleanup();
    h.document.activeElement = target === "absent" ? null : target === "root" ? h.html : target === "closing dialog" ? h.inside : h.invoker;
    h.flush(); assert.equal(h.document.activeElement, h.heading, target);
  }
});

test("actual Saved Clear resets every filter and recovers its heading after its button disappears", () => {
  const h = modalFocusHarness(); h.document.activeElement = h.clearButton;
  assert.deepEqual(h.clear(), { query: "", view: "all", stage: "all" });
  assert.equal(h.document.activeElement, h.clearButton, "Focus waits for the actual render/removal boundary");
  h.disconnect(h.clearButton); h.flush();
  assert.equal(h.document.activeElement, h.heading);
  assert.equal(h.focusCalls.some(call => call.target === h.unrelatedHeading), false);
});

test("actual Saved Clear does not steal later focus or cross a dialog/phone unmount boundary", () => {
  for (const next of ["other control", "replacement dialog", "removed phone"]) {
    const h = modalFocusHarness(); h.document.activeElement = h.clearButton;
    assert.deepEqual(h.clear(), { query: "", view: "all", stage: "all" }); h.disconnect(h.clearButton);
    if (next === "other control") h.document.activeElement = h.outsideControl;
    else if (next === "replacement dialog") h.shell.replacementDialog = { open: true, isConnected: true };
    else h.disconnect(h.shell);
    const active = h.document.activeElement;
    h.flush(); assert.equal(h.document.activeElement, active); assert.equal(h.focusCalls.length, 0);
  }
});

// Execute the actual Keep JSX handler on both the inline baseline and the
// candidate. DOM ports model field order, inherited disabling and unmounts;
// they do not supply a replacement focus algorithm.
function keepFocusHarness(opener = "cancel", kind = "record") {
  const frames = [], focusCalls = [];
  const document = { activeElement: null, body: null, documentElement: null, editorQueries: 0, querySelector() { assert.fail("Keep editing must stay in its originating dialog"); } };
  let dialog;
  class FocusTarget {
    constructor(name, tag = "button") { this.name = name; this.tag = tag; this.isConnected = true; this.focusable = true; this.ownerDocument = document; this.parent = null; this.disabled = false; this.hidden = false; this.inert = false; }
    get isConnected() { return Boolean(this.connected && (!this.parent || this.parent.isConnected)); }
    set isConnected(value) { this.connected = value; }
    closest(selector) {
      assert(["dialog", "[hidden], [inert]"].includes(selector), "Unexpected closest selector: " + selector);
      if (selector === "dialog" ? this.tag === "dialog" : this.hidden || this.inert) return this;
      for (let node = this.parent; node; node = node.parent) {
        if (selector === "dialog" ? node.tag === "dialog" : node.hidden || node.inert) return node;
      }
      return null;
    }
    matches(selector) {
      assert.equal(selector, ":disabled");
      if (this.disabled) return true;
      for (let node = this.parent; node; node = node.parent) if (node.tag === "fieldset" && node.disabled) return true;
      return false;
    }
    focus(options) {
      focusCalls.push({ target: this, options });
      if (this.isConnected && this.focusable && !this.matches(":disabled") && !this.closest("[hidden], [inert]")) { document.activeElement = this; this.onFocus?.(); }
    }
  }
  const body = new FocusTarget("body", "body"), html = new FocusTarget("html", "html"), heading = new FocusTarget("page heading", "h1"), outside = new FocusTarget("outside control");
  const fieldset = new FocusTarget("editor fieldset", "fieldset"), form = new FocusTarget("current editor", "form"), alert = new FocusTarget("discard alert", "section"), alertHeading = new FocusTarget("discard heading", "h3");
  const cancel = new FocusTarget("Cancel"), close = new FocusTarget("Close dialog"), deleteButton = new FocusTarget("Delete this private record"), keep = new FocusTarget("Keep editing"), recheck = new FocusTarget("Check account again");
  const stage = new FocusTarget("Stage", "select"), notes = new FocusTarget("Private notes", "textarea"), url = new FocusTarget("Job link", "input"), title = new FocusTarget("Job title", "input"), hiddenInput = new FocusTarget("hidden input", "input");
  hiddenInput.type = "hidden";
  form.fields = kind === "record" ? [stage, notes] : [url, title];
  form.querySelectorAll = selector => {
    document.editorQueries++;
    assert.equal(selector, "select, textarea, input:not([type='hidden'])");
    return form.fields.filter(node => node.isConnected && node.parent === form && node.type !== "hidden");
  };
  dialog = {
    tag: "dialog", parent: null, open: true, isConnected: true, form,
    contains(target) { for (let node = target; node; node = node.parent) if (node === this) return true; return false; },
    querySelector(selector) {
      if (selector === "form") return this.form?.isConnected ? this.form : null;
      assert.equal(selector, "fieldset select, fieldset textarea, fieldset input:not([type='hidden'])");
      document.editorQueries++;
      return this.form?.fields.find(node => node.isConnected && node.parent === this.form && node.type !== "hidden") ?? null;
    },
  };
  fieldset.parent = dialog; form.parent = fieldset; alert.parent = fieldset; alertHeading.parent = alert; keep.parent = alert;
  cancel.parent = form; deleteButton.parent = fieldset; close.parent = dialog; recheck.parent = dialog;
  for (const node of [...form.fields, hiddenInput]) node.parent = form;
  document.body = body; document.documentElement = html; document.activeElement = keep;
  const draft = kind === "record" ? { note: "متابعة خاصة", stage: "offer" } : { url: "https://example.com/job", title: "Unfinished job العربية" };
  const state = { confirm: true, dialogDirty: true, editorDraft: draft, dialogKind: kind, writes: 0, recoveryId: "existing-recovery-id" };
  const initialDraft = JSON.stringify(draft);
  const discardReturn = { current: opener === "none" ? null : ({ cancel, close, delete: deleteButton, notes, url })[opener] };
  const discardHeading = { current: alertHeading };
  const forbidMutation = () => { throw new Error("Keep editing must preserve the dialog, dirty state, draft and storage"); };
  const context = vm.createContext({
    discardReturn, discardHeading, HTMLElement: FocusTarget, document,
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
    setConfirmDialogDiscard(value) { assert.equal(value, false); state.confirm = false; },
    setDialog: forbidMutation, setDialogDirty: forbidMutation, setEditorDraft: forbidMutation,
    persist: forbidMutation, discardRecovery: forbidMutation, savePhoneSnapshot: forbidMutation,
    recordRecoveryId: { get current() { return state.recoveryId; }, set current(_value) { forbidMutation(); } },
  });
  const handler = buttonClick("Keep editing");
  if (/^[A-Za-z_$][\w$]*$/.test(handler)) install(context, handler);
  install(context, "activateKeep", handler);
  const disconnect = target => { target.isConnected = false; target.parent = null; if (document.activeElement === target) document.activeElement = body; };
  const removeAlert = () => { disconnect(keep); disconnect(alertHeading); disconnect(alert); discardHeading.current = null; };
  const flush = () => { assert(frames.length <= 1, "One Keep action schedules at most one recovery"); while (frames.length) frames.shift()(0); };
  const unchanged = (expectedConfirmation = false) => {
    assert.equal(state.confirm, expectedConfirmation); assert.equal(state.dialogDirty, true); assert.equal(state.editorDraft, draft); assert.equal(state.dialogKind, kind);
    assert.equal(JSON.stringify(draft), initialDraft); assert.equal(state.writes, 0); assert.equal(state.recoveryId, "existing-recovery-id");
  };
  return { document, body, html, heading, outside, fieldset, form, alert, alertHeading, cancel, close, deleteButton, keepButton: keep, recheck, stage, notes, url, title, hiddenInput, dialog, discardReturn, discardHeading, state, draft, focusCalls, frames, disconnect, removeAlert, flush, unchanged, activate: () => context.activateKeep({ currentTarget: keep }) };
}

test("actual Keep editing restores a preserved record control after removal without changing the draft", () => {
  for (const opener of ["cancel", "close", "notes"]) {
    const h = keepFocusHarness(opener);
    h.activate();
    assert.equal(h.document.activeElement, h.keepButton, "Focus waits until the alert control is removed");
    h.removeAlert(); h.flush();
    assert.equal(h.document.activeElement, h[opener], "The removed Keep control must not leave focus on BODY");
    assert.deepEqual(h.focusCalls.map(call => call.target), [h[opener]]);
    assert.equal(h.focusCalls[0].options.preventScroll, false, "Keep recovery must allow the open dialog to scroll its focused control into view");
    assert.equal(h.document.editorQueries, 0, "A usable opener does not fall through to another field");
    h.unchanged();
  }
});

test("actual Keep editing restores dirty Delete or a surviving editor field, with a real no-target case", () => {
  const deleted = keepFocusHarness("delete");
  deleted.activate(); deleted.removeAlert(); deleted.flush();
  assert.equal(deleted.document.activeElement, deleted.deleteButton); deleted.unchanged();
  const fallback = keepFocusHarness("cancel");
  fallback.disconnect(fallback.cancel); fallback.document.activeElement = fallback.dialog;
  fallback.activate(); fallback.removeAlert(); fallback.flush();
  assert.equal(fallback.document.activeElement, fallback.stage); fallback.unchanged();
  assert.equal(fallback.focusCalls[0].options.preventScroll, false, "Editor fallback must also allow native focus scrolling");
  const textarea = keepFocusHarness("none");
  textarea.disconnect(textarea.stage); textarea.activate(); textarea.removeAlert(); textarea.flush();
  assert.equal(textarea.document.activeElement, textarea.notes, "DOM order exposes the remaining textarea when Stage disappears");
  const nowhere = keepFocusHarness("none");
  for (const field of nowhere.form.fields) nowhere.disconnect(field);
  nowhere.activate(); nowhere.removeAlert(); nowhere.flush();
  assert.equal(nowhere.document.activeElement, nowhere.body); assert.equal(nowhere.focusCalls.length, 0); nowhere.unchanged();
  for (const h of [deleted, fallback, textarea, nowhere]) assert.equal(h.focusCalls.some(call => call.target === h.heading), false);
});

test("actual Keep editing restores the add-job form and preserves all unfinished fields", () => {
  for (const opener of ["close", "url", "none"]) {
    const h = keepFocusHarness(opener, "add");
    h.activate(); h.removeAlert(); h.flush();
    assert.equal(h.document.activeElement, opener === "close" ? h.close : h.url);
    assert.equal(h.focusCalls[0].options.preventScroll, false, "Add-job recovery must keep its focused control reachable in the dialog");
    assert.equal(h.focusCalls.some(call => call.target === h.heading), false); h.unchanged();
  }
});

test("actual Keep editing leaves intentional focus and a focus redirect alone", () => {
  for (const next of ["notes", "outside", "recheck"]) {
    const h = keepFocusHarness();
    h.activate(); h.removeAlert(); h.document.activeElement = h[next];
    h.flush(); assert.equal(h.document.activeElement, h[next]); assert.equal(h.focusCalls.length, 0); h.unchanged();
  }
  const redirected = keepFocusHarness();
  redirected.cancel.onFocus = () => { redirected.document.activeElement = redirected.notes; };
  redirected.activate(); redirected.removeAlert(); redirected.flush();
  assert.equal(redirected.document.activeElement, redirected.notes);
  assert.deepEqual(redirected.focusCalls.map(call => call.target), [redirected.cancel]);
  assert.equal(redirected.document.editorQueries, 0); redirected.unchanged();
});

test("actual Keep editing cannot cross a closed, replaced or unmounted dialog/editor", () => {
  for (const next of ["closed", "dialog-unmounted", "form-unmounted", "form-replaced"]) {
    const h = keepFocusHarness("none");
    h.activate(); h.removeAlert();
    if (next === "closed") h.dialog.open = false;
    else if (next === "dialog-unmounted") h.dialog.isConnected = false;
    else {
      h.disconnect(h.form);
      if (next === "form-replaced") {
        const replacement = { isConnected: true, parent: h.fieldset, fields: [h.stage, h.notes] };
        for (const field of replacement.fields) field.parent = replacement;
        h.dialog.form = replacement;
      }
    }
    h.flush(); assert.equal(h.document.activeElement, h.body, next); assert.equal(h.focusCalls.length, 0, next); h.unchanged();
  }
});

test("actual Keep editing waits for its old prompt removal and does not override a reopened prompt", () => {
  const retained = keepFocusHarness();
  retained.activate(); retained.document.activeElement = retained.body;
  retained.flush(); assert.equal(retained.document.activeElement, retained.body); assert.equal(retained.focusCalls.length, 0);
  const reopened = keepFocusHarness();
  reopened.activate(); reopened.removeAlert();
  reopened.state.confirm = true;
  reopened.discardHeading.current = { isConnected: true };
  reopened.flush(); assert.equal(reopened.document.activeElement, reopened.body); assert.equal(reopened.focusCalls.length, 0); reopened.unchanged(true);
});

test("actual Keep editing rechecks inherited disabling, hidden identity content and inert ancestry", () => {
  for (const next of ["disabled", "hidden", "inert"]) {
    const h = keepFocusHarness("cancel");
    h.activate(); h.removeAlert(); h.fieldset[next] = true;
    assert.equal(h.cancel.disabled, false); assert.equal(h.stage.disabled, false, "The controls have no own disabled attribute");
    h.flush(); assert.equal(h.document.activeElement, h.body, next); assert.equal(h.focusCalls.length, 0, next); h.unchanged();
  }
  const identity = keepFocusHarness();
  identity.activate(); identity.removeAlert(); identity.fieldset.hidden = true; identity.fieldset.disabled = true; identity.document.activeElement = identity.recheck;
  identity.flush(); assert.equal(identity.document.activeElement, identity.recheck); assert.equal(identity.focusCalls.length, 0); identity.unchanged();
});

test("actual Keep editing skips an unusable opener and selects the first eligible field in its form", () => {
  for (const unavailable of ["disabled", "hidden", "inert"]) {
    const h = keepFocusHarness();
    h.cancel[unavailable] = true; h.stage[unavailable] = true;
    h.activate(); h.removeAlert(); h.flush();
    assert.equal(h.document.activeElement, h.notes, unavailable);
    assert.deepEqual(h.focusCalls.map(call => call.target), [h.notes]); h.unchanged();
  }
  const nonfocusable = keepFocusHarness();
  nonfocusable.cancel.focusable = false;
  nonfocusable.activate(); nonfocusable.removeAlert(); nonfocusable.flush();
  assert.equal(nonfocusable.document.activeElement, nonfocusable.stage);
  assert.deepEqual(nonfocusable.focusCalls.map(call => call.target), [nonfocusable.cancel, nonfocusable.stage]);
});

test("actual Keep editing recovers absent, root, disconnected and dialog-root focus", () => {
  for (const lost of ["absent", "html", "disconnected", "dialog"]) {
    const h = keepFocusHarness();
    h.activate(); h.removeAlert();
    h.document.activeElement = lost === "absent" ? null : lost === "html" ? h.html : lost === "dialog" ? h.dialog : { isConnected: false };
    h.flush(); assert.equal(h.document.activeElement, h.cancel, lost); h.unchanged();
  }
});

test("actual discard entry handlers remember Cancel or Delete and preserve clean close behavior", async () => {
  const h = await harness(), context = h.context;
  const opener = new context.HTMLElement(); opener.name = "Cancel";
  context.editRecord(context.snapshotRef.current.jobs[0]);
  context.editorDraft = { ...context.editorDraft, note: "Unfinished note" }; context.dialogDirty = true;
  context.document.activeElement = { name: "not an element" };
  install(context, "deletePrivate", buttonClick("Delete this private record"));
  context.requestDialogClose();
  assert.equal(context.discardReturn.current, null); assert.equal(context.confirmDialogDiscard, true); assert.equal(context.dialog.kind, "record");
  context.document.activeElement = opener; context.confirmDialogDiscard = false;
  context.requestDialogClose();
  assert.equal(context.discardReturn.current, opener, "The actual opener must be retained for the later Keep interaction");
  assert.equal(context.confirmDialogDiscard, true); assert.equal(context.dialog.kind, "record");
  context.editorDraft = plain(context.dialog.record); context.dialogDirty = false; context.discardReturn.current = null; context.confirmDialogDiscard = false;
  await context.requestDialogClose();
  assert.equal(context.dialog, null); assert.equal(context.confirmDialogDiscard, false); assert.equal(context.discardReturn.current, null);
  context.editRecord(context.snapshotRef.current.jobs[0]); context.dialogDirty = true;
  const deleteButton = new context.HTMLElement();
  context.deletePrivate({ currentTarget: deleteButton });
  assert.equal(context.discardReturn.current, deleteButton);
  assert.equal(context.confirmDialogDiscard, true); assert.equal(context.dialog.kind, "record", "Dirty Delete only asks about unfinished changes");
  context.dialogDirty = false; context.confirmDialogDiscard = false;
  context.deletePrivate({ currentTarget: deleteButton });
  assert.equal(context.dialog.kind, "delete-record"); assert.equal(context.confirmDialogDiscard, false);
});


// Execute the real export button, run(), and exportUnfinished() against a DOM
// port that models the observed blur when busy disables the focused fieldset.
// The download boundary captures synthetic JSON only; browser download/scroll
// acceptance remains separate from these handler and ownership regressions.
function recordExportFocusHarness({ failDownload = false } = {}) {
  const h = keepFocusHarness(); h.removeAlert();
  const exportButton = new h.deleteButton.constructor("Export unfinished record");
  const actions = new h.deleteButton.constructor("record actions", "div");
  actions.parent = h.fieldset; exportButton.parent = actions; h.deleteButton.parent = actions;
  let windowFocused = true;
  h.document.hasFocus = () => windowFocused;
  h.document.activeElement = exportButton;
  const saved = savedSnapshot(), editorId = "synthetic-record-editor";
  const recordDialog = { kind: "record", editorId, job: saved.jobs[0], record: saved.records[0], existed: true, scope };
  const draft = { ...saved.records[0], stage: "interview", note: "Unfinished note متابعة", followUpDate: "2026-11-30" };
  const initialDraft = JSON.stringify(draft), downloads = [], running = [];
  const forbidMutation = () => { throw new Error("Record export must preserve its editor, draft, recovery identity and saved data"); };
  const { APIError } = production;
  const context = vm.createContext({
    ...production, Error, DOMException, APIError, crypto: webcrypto, z: production.z,
    document: h.document, dialog: recordDialog, editorDraft: draft, dialogDirty: true,
    profile: saved.profile, formChanged: false, profileRecoveryId: { current: null },
    recordRecoveryId: { current: editorId }, snapshotRef: { current: saved },
    recordRecoveryLifecycle: { current: { retired: new Map(), editorVersion: 0 } },
    locked: false, identityUnverified: { current: false }, identityCheckPending: { current: false },
    busyRef: { current: false }, epoch: { current: 7 }, discardHeading: h.discardHeading,
    notice: null, busy: "", identityChecks: 0,
    requestAnimationFrame(callback) { h.frames.push(callback); return h.frames.length; },
    setBusy(value) {
      context.busy = value; h.fieldset.disabled = Boolean(value); exportButton.disabled = Boolean(value);
      const active = h.document.activeElement;
      if (value && h.dialog.contains(active) && active?.matches?.(":disabled")) h.document.activeElement = h.body;
    },
    setNotice(value) { context.notice = value; },
    download(value, filename) {
      if (failDownload) throw Error("Synthetic download failed");
      downloads.push({ value, filename });
    },
    setDialog: forbidMutation, setDialogDirty: forbidMutation, setEditorDraft: forbidMutation,
    persist: forbidMutation, discardRecovery: forbidMutation, savePhoneSnapshot: forbidMutation,
    lock() { context.identityUnverified.current = true; context.epoch.current++; },
  });
  context.identityCheckRef = { current() {
    context.identityChecks++; context.identityCheckPending.current = false; context.identityUnverified.current = true;
    h.fieldset.hidden = true; h.fieldset.disabled = true; h.document.activeElement = h.recheck;
  } };
  for (const name of ["same", "message", "unfinished", "exportUnfinished", "run"]) install(context, name);
  const productionRun = context.run;
  context.run = (...args) => { const task = productionRun(...args); running.push(task); return task; };
  const handler = buttonClick("Export unfinished record");
  if (/^[A-Za-z_$][\w$]*$/.test(handler)) install(context, handler);
  install(context, "activateExport", handler);
  const activate = async () => {
    const completion = context.activateExport({ currentTarget: exportButton });
    await Promise.all([completion, ...running]);
  };
  const unchanged = () => {
    assert.equal(context.dialog, recordDialog); assert.equal(context.dialogDirty, true); assert.equal(context.editorDraft, draft);
    assert.equal(JSON.stringify(draft), initialDraft); assert.deepEqual(plain(context.snapshotRef.current), saved);
  };
  return { ...h, context, exportButton, actions, downloads, activate, unchanged, setWindowFocused(value) { windowFocused = value; } };
}

test("actual record export recovers its enabled action after busy blurs focus and preserves the exported draft", async () => {
  const h = recordExportFocusHarness();
  await h.activate();
  assert.equal(h.document.activeElement, h.body, "Busy can remove focus before deferred recovery");
  assert.equal(h.context.busyRef.current, false); assert.equal(h.exportButton.matches(":disabled"), false);
  assert.equal(h.focusCalls.length, 0, "Focus waits until run has settled and the controls have re-enabled");
  h.flush();
  assert.equal(h.document.activeElement, h.exportButton, "Export must not leave BODY focused while its editor remains open");
  assert.deepEqual(h.focusCalls.map(call => call.target), [h.exportButton]);
  assert.equal(h.focusCalls[0].options.preventScroll, false, "Restored export focus must be allowed to scroll into view");
  assert.equal(h.downloads.length, 1); assert.equal(h.downloads[0].filename, "Career-Finder-unfinished-edits.json");
  const exported = JSON.parse(h.downloads[0].value);
  assert.equal(exported.format, "Career Finder unfinished edits"); assert.equal(exported.scope, scope);
  assert.equal(exported.drafts.length, 1); assert.deepEqual(exported.drafts[0].record.draft, plain(h.context.editorDraft));
  assert.equal(h.context.notice.error, undefined); assert.match(h.context.notice.text, /unfinished edits/);
  h.unchanged();
});

test("actual record export preserves run error reporting and restores only its still-usable action", async () => {
  const h = recordExportFocusHarness({ failDownload: true });
  await h.activate(); h.flush();
  assert.equal(h.downloads.length, 0); assert.equal(h.context.notice.error, true); assert.equal(h.context.notice.text, "Synthetic download failed");
  assert.equal(h.context.busyRef.current, false); assert.equal(h.document.activeElement, h.exportButton);
  assert.deepEqual(h.focusCalls.map(call => call.target), [h.exportButton]); h.unchanged();
});

test("actual record export leaves intentional focus, redirected focus and an inactive window alone", async () => {
  for (const next of ["notes", "outside", "recheck", "exportButton"]) {
    const h = recordExportFocusHarness(); await h.activate(); h.document.activeElement = h[next];
    h.flush(); assert.equal(h.document.activeElement, h[next]); assert.equal(h.focusCalls.length, 0); h.unchanged();
  }
  const inactive = recordExportFocusHarness(); await inactive.activate(); inactive.setWindowFocused(false);
  inactive.flush(); assert.equal(inactive.document.activeElement, inactive.body); assert.equal(inactive.focusCalls.length, 0); inactive.unchanged();
  const redirected = recordExportFocusHarness(); await redirected.activate();
  redirected.exportButton.onFocus = () => { redirected.document.activeElement = redirected.notes; };
  redirected.flush(); assert.equal(redirected.document.activeElement, redirected.notes);
  assert.deepEqual(redirected.focusCalls.map(call => call.target), [redirected.exportButton]); redirected.unchanged();
});

test("actual record export cannot cross an account, record, dialog or form replacement", async () => {
  for (const next of ["epoch", "record", "closed", "dialog-unmounted", "form-unmounted", "form-replaced", "button-unmounted", "button-moved"]) {
    const h = recordExportFocusHarness(); await h.activate();
    if (next === "epoch") h.context.epoch.current++;
    else if (next === "record") h.context.recordRecoveryId.current = "replacement-record";
    else if (next === "closed") h.dialog.open = false;
    else if (next === "dialog-unmounted") h.dialog.isConnected = false;
    else if (next === "form-unmounted") h.disconnect(h.form);
    else if (next === "form-replaced") h.dialog.form = { isConnected: true, parent: h.fieldset };
    else if (next === "button-unmounted") h.disconnect(h.exportButton);
    else h.exportButton.parent = { tag: "dialog", isConnected: true, open: true };
    h.flush(); assert.equal(h.document.activeElement, h.body, next); assert.equal(h.focusCalls.length, 0, next); h.unchanged();
  }
});

test("actual record export respects newer busy, identity, discard and inherited availability state", async () => {
  for (const next of ["busy", "identity", "pending-identity", "discard", "disabled", "hidden", "inert", "button-disabled", "form-hidden"]) {
    const h = recordExportFocusHarness(); await h.activate();
    if (next === "busy") h.context.busyRef.current = true;
    else if (next === "identity") h.context.identityUnverified.current = true;
    else if (next === "pending-identity") h.context.identityCheckPending.current = true;
    else if (next === "discard") h.discardHeading.current = { isConnected: true };
    else if (next === "button-disabled") h.exportButton.disabled = true;
    else if (next === "form-hidden") h.form.hidden = true;
    else h.fieldset[next] = true;
    h.flush(); assert.equal(h.document.activeElement, h.body, next); assert.equal(h.focusCalls.length, 0, next); h.unchanged();
  }
  const pending = recordExportFocusHarness(); pending.context.identityCheckPending.current = true;
  await pending.activate(); pending.flush();
  assert.equal(pending.context.identityChecks, 1); assert.equal(pending.document.activeElement, pending.recheck);
  assert.equal(pending.focusCalls.length, 0); pending.unchanged();
});

// Job-link drafts use the same encrypted owner/workspace recovery as profiles,
// while incomplete URLs remain plain draft text until explicit validation on Save.
const jobLinkFields = { url: "https://example.com/jobs/recovery", title: "Engineer / مهندس", company: "Synthetic private employer العربية", location: "Riyadh / الرياض" };
const addFormSource = findNode(node => ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "form" && node.openingElement.attributes.properties.some(prop => ts.isJsxAttribute(prop) && prop.name.text === "onSubmit" && prop.getText(tree).includes("saveAddedJob()"))).getText(tree);
const addFormCode = ts.transpileModule("globalThis.addForm = (" + addFormSource + ");", { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
function renderAddForm(context, language = "en") {
  Object.assign(context, { React, t: (text, values) => production.translate(text, language, values), cannotSave: false });
  vm.runInContext(addFormCode, context); return context.addForm;
}
function descendants(node) { return node && typeof node === "object" ? [node, ...React.Children.toArray(node.props?.children).flatMap(descendants)] : []; }
function beginJobLink(h, fields = jobLinkFields) { h.context.openAddJob(); h.context.editAddedJob(plain(fields)); return h.context.dialog.editorId; }

test("actual Add job form controls retain each exact field in English and Arabic", async () => {
  for (const language of ["en", "ar"]) {
    const h = await harness(); h.context.openAddJob();
    for (const [name, value] of Object.entries(jobLinkFields)) {
      const input = descendants(renderAddForm(h.context, language)).find(node => node.type === "input" && node.props.name === name);
      assert(input, name); assert.equal(input.props.value, "");
      input.props.onChange({ target: { value } });
      assert.equal(h.context.dialog.draft[name], value); assert.equal(h.context.dialogDirty, true);
      const rerendered = descendants(renderAddForm(h.context, language)).find(node => node.type === "input" && node.props.name === name);
      assert.equal(rerendered.props.value, value);
    }
    const html = renderToStaticMarkup(renderAddForm(h.context, language));
    assert(html.includes(language === "ar" ? "المسمى الوظيفي" : "Job title"));
    assert(html.includes(jobLinkFields.company));
  }
});

test("partial job links survive encrypted storage and a new page without becoming bookmarks", async () => {
  const h = await harness(), fields = { ...jobLinkFields, url: "https://", title: "", location: "  الرياض  " }, id = beginJobLink(h, fields);
  await h.context.preserveUnfinished(scope, h.context.unfinished());
  const serialized = JSON.stringify([...h.recoveryPort.rows]);
  assert(!serialized.includes(fields.company)); assert(!serialized.includes(fields.location));
  const fresh = await harness({ mainPort: h.mainPort, recoveryPort: h.recoveryPort });
  const draft = fresh.context.safetyState.recovery.find(row => row.id === id);
  assert.deepEqual(draft.jobLink, fields);
  const priorJobs = plain(fresh.context.snapshotRef.current.jobs);
  await fresh.context.restoreRecovery(draft);
  assert.equal(fresh.context.dialog.kind, "add"); assert.equal(fresh.context.dialog.scope, scope);
  assert.notEqual(fresh.context.dialog.editorId, id); assert.deepEqual(plain(fresh.context.dialog.draft), fields);
  assert.equal(fresh.context.dialogDirty, true); assert.deepEqual(plain(fresh.context.snapshotRef.current.jobs), priorJobs);
  await fresh.context.saveAddedJob();
  assert.equal(fresh.context.notice.error, true); assert.deepEqual(plain(fresh.context.dialog.draft), fields);
  assert.deepEqual((await vault(h.mainPort).loadPhoneSnapshot(scope)).jobs, priorJobs);
  assert.equal(production.recoveryDraftSchema.safeParse({ ...draft, profile: savedSnapshot().profile }).success, false, "Recovery cannot combine unrelated draft types");
});

test("account lock hides Add fields and restores or exports them only after the original account returns", async () => {
  const h = await harness(), id = beginJobLink(h);
  h.context.lock();
  await h.safety.load(scope); // Wait for the same recovery queue used by lock.
  assert.equal(h.context.dialog, null); assert.equal(h.context.locked, true);
  assert.deepEqual(plain(h.context.quarantine.current.dialog.draft), jobLinkFields);
  assert.equal((await recoveryRows(h)).recovery.find(row => row.id === id).jobLink.company, jobLinkFields.company);
  await h.context.recoverLocked(true);
  assert.deepEqual(h.context.downloads[0].jobLink, jobLinkFields); assert.equal(h.context.dialog, null);
  await h.context.recoverLocked();
  assert.equal(h.context.locked, false); assert.equal(h.context.dialog.kind, "add");
  assert.equal(h.context.dialog.editorId, id); assert.equal(h.context.dialogDirty, true);
  assert.deepEqual(plain(h.context.dialog.draft), jobLinkFields);
  assert.equal(h.context.snapshotRef.current.jobs.length, 1, "Recovery does not save a bookmark");
});

test("locked job-link recovery cannot expose fields to another account, workspace or late identity check", async t => {
  for (const change of ["account", "workspace", "identity", "hidden"]) await t.test(change, async () => {
    const h = await harness(); beginJobLink(h); h.context.lock(); await h.safety.load(scope);
    if (change === "account") h.context.responseWorkspace = { ...validWorkspace(), accountId: "synthetic-b", workspaceId: uuid(2) };
    if (change === "workspace") h.context.responseWorkspace = { ...validWorkspace(), workspaceId: uuid(2) };
    if (["identity", "hidden"].includes(change)) h.context.phoneAPI = async () => {
      if (change === "identity") h.context.identityUnverified.current = true; else h.context.document.visibilityState = "hidden";
      return validWorkspace();
    };
    await assert.rejects(h.context.recoverLocked(), /original account|different workspace|confirmed|no longer current/);
    assert.equal(h.context.dialog, null); assert.equal(h.context.downloads.length, 0);
    assert.deepEqual(plain(h.context.quarantine.current.dialog.draft), jobLinkFields);
    assert(!h.recoveryPort.rows.has(otherScope));
    if (change !== "workspace") await assert.rejects(h.context.recoverLocked(true), /original account|confirmed|no longer current/);
    assert.equal(h.context.downloads.length, 0);
  });
});

test("job-link save removes only this editor's recovery copy and preserves another tab and the source draft", async () => {
  const a = await harness(), sourceId = beginJobLink(a);
  await a.context.preserveUnfinished(scope, a.context.unfinished());
  const original = (await recoveryRows(a)).recovery.find(row => row.id === sourceId);
  const b = await harness({ mainPort: a.mainPort, recoveryPort: a.recoveryPort });
  a.context.dialog = null; a.context.dialogDirty = false;
  await a.context.restoreRecovery(original); await b.context.restoreRecovery(original);
  const aId = a.context.dialog.editorId, bId = b.context.dialog.editorId;
  b.context.editAddedJob({ title: "Newer tab B title العربية" });
  await b.context.preserveUnfinished(scope, b.context.unfinished());
  const captured = a.context.unfinished();
  await a.context.saveAddedJob();
  await a.context.preserveUnfinished(scope, captured); // a delayed pre-save autosave cannot recreate the finished copy
  const state = await recoveryRows(a);
  assert(!state.recovery.some(row => row.id === aId));
  assert.deepEqual(state.recovery.find(row => row.id === sourceId), original);
  assert.equal(state.recovery.find(row => row.id === bId).jobLink.title, "Newer tab B title العربية");
  const saved = await vault(a.mainPort).loadPhoneSnapshot(scope);
  assert.equal(saved.jobs.filter(job => job.url === jobLinkFields.url).length, 1);
  assert.equal(saved.jobs[0].title, jobLinkFields.title); assert.equal(a.context.dialog, null); assert.equal(a.context.dialogDirty, false);
});

test("Add cancellation preserves typed fields until confirmation and discards only its own draft", async () => {
  const h = await harness(), id = beginJobLink(h);
  await h.safety.hold(scope, holdId); await h.safety.recover(scope, recovery("record"));
  const captured = h.context.unfinished(); await h.context.preserveUnfinished(scope, captured);
  h.context.requestDialogClose();
  assert.equal(h.context.confirmDialogDiscard, true); assert.deepEqual(plain(h.context.dialog.draft), jobLinkFields);
  const before = plain(h.context.snapshotRef.current);
  await h.context.discardDialogEdits(); await h.context.preserveUnfinished(scope, captured);
  const state = await recoveryRows(h);
  assert(!state.recovery.some(row => row.id === id)); assert.equal(state.recovery[0].id, originalId);
  assert.equal(state.holds[0].planId, holdId); assert.deepEqual(plain(h.context.snapshotRef.current), before);
  assert.equal(h.context.dialog, null); assert.equal(h.context.dialogDirty, false);
});

test("a failed or duplicate job save retains every entered field and its recovery copy", async t => {
  for (const failure of ["storage", "duplicate", "scope"]) await t.test(failure, async () => {
    const h = await harness(), fields = failure === "duplicate" ? { ...jobLinkFields, url: savedSnapshot().jobs[0].url } : jobLinkFields;
    const id = beginJobLink(h, fields); await h.context.preserveUnfinished(scope, h.context.unfinished());
    if (failure === "storage") h.mainPort.writeFailure = new DOMException("Synthetic full storage", "QuotaExceededError");
    if (failure === "scope") h.context.dialog.scope = otherScope;
    if (failure === "duplicate") { await h.context.saveAddedJob(); assert.match(h.context.notice.text, /already in Saved/); }
    else await assert.rejects(h.context.saveAddedJob(), /storage|space|different workspace/i);
    assert.equal(h.context.dialog.kind, "add"); assert.deepEqual(plain(h.context.dialog.draft), fields);
    assert.equal(h.context.dialogDirty, true); assert.equal(h.context.closedJobDrafts.current.has(id), false);
    assert((await recoveryRows(h)).recovery.some(row => row.id === id));
  });
});

test("unfinished job-link export includes all four fields and does not create or upload a job", async () => {
  const h = await harness(), id = beginJobLink(h, { ...jobLinkFields, url: "unfinished link" });
  const before = h.mainPort.writes.length;
  h.context.exportUnfinished();
  const exported = h.context.downloads[0];
  assert.equal(exported.scope, scope); assert.equal(exported.drafts[0].id, id);
  assert.deepEqual(exported.drafts[0].jobLink, { ...jobLinkFields, url: "unfinished link" });
  assert.equal(h.mainPort.writes.length, before);
  h.context.identityUnverified.current = true;
  assert.throws(() => h.context.exportUnfinished(), /Confirm this account/);
  assert.equal(h.context.downloads.length, 1);
});

test("in-flight recovery saving is removed after Add save and cannot reappear afterward", async () => {
  const h = await harness(), id = beginJobLink(h), entered = deferred(), gate = deferred();
  const captured = h.context.unfinished();
  h.recoveryPort.afterWrite = async () => { entered.resolve(); await gate.promise; };
  const preserving = h.context.preserveUnfinished(scope, captured);
  await entered.promise;
  const cleanupEntered = deferred();
  h.context.phoneSafety = { ...h.safety, discard: (...args) => { cleanupEntered.resolve(); return h.safety.discard(...args); } };
  const saving = h.context.saveAddedJob();
  await cleanupEntered.promise;
  await h.context.preserveUnfinished(scope, captured);
  gate.resolve(); await preserving; await saving;
  h.recoveryPort.afterWrite = null;
  assert(!(await recoveryRows(h)).recovery.some(row => row.id === id));
  assert.equal((await vault(h.mainPort).loadPhoneSnapshot(scope)).jobs.filter(job => job.url === jobLinkFields.url).length, 1);
});

test("account lock during recovery cleanup cannot reopen an already saved or discarded job-link draft", async t => {
  for (const action of ["save", "discard"]) await t.test(action, async () => {
    const h = await harness(), id = beginJobLink(h);
    await h.context.preserveUnfinished(scope, h.context.unfinished());
    const entered = deferred(), gate = deferred();
    h.context.phoneSafety = { ...h.safety, discard: async (...args) => { entered.resolve(); await gate.promise; return h.safety.discard(...args); } };
    const pending = action === "save" ? h.context.saveAddedJob() : h.context.discardDialogEdits();
    await entered.promise;
    assert.equal(h.context.closedJobDrafts.current.has(id), true);
    h.context.lock();
    assert.equal(h.context.quarantine.current.dialog, null);
    gate.resolve(); await assert.rejects(pending, /page changed/);
    await h.context.recoverLocked();
    assert.equal(h.context.dialog, null); assert.equal(h.context.dialogDirty, false);
    assert.equal(h.context.snapshotRef.current.jobs.filter(job => job.url === jobLinkFields.url).length, action === "save" ? 1 : 0);
    assert(!(await recoveryRows(h)).recovery.some(row => row.id === id));
  });
});

// Couple the actual record editor's edit, submit and Keep handlers to PhoneApp's
// real draft callback. Storage remains the production authenticated vault and
// serialized safety queue; only DOM focus and the atomic persistence port vary.
function recordControls(h) {
  const editor = componentTree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "RecordEditor");
  assert(editor?.body, "The actual RecordEditor is required");
  const variables = editor.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]);
  const control = vm.createContext({
    record: h.context.dialog.record, draft: h.context.editorDraft, confirmClear: false,
    stageInput: { current: null }, frames: [],
    setDraft(value) { control.draft = value; },
    onDraftChange(value) { h.context.setEditorDraft(value); },
    setConfirmClear(value) { control.confirmClear = value; },
    onSave() { assert.fail("An unconfirmed applied-mark change must not save"); },
    requestAnimationFrame(callback) { control.frames.push(callback); },
  });
  for (const name of ["edit", "keepAppliedRecord"]) {
    const node = variables.find(node => node.name.getText(componentTree) === name);
    assert(node?.initializer, "The actual editor handler " + name + " is required");
    install(control, name, node.initializer.getText(componentTree));
  }
  const form = editor.body.statements.find(ts.isReturnStatement).expression;
  const submit = form.openingElement.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.text === "onSubmit");
  install(control, "submit", submit.initializer.expression.getText(componentTree));
  return control;
}
async function setAppliedBaseline(h) {
  const saved = plain(h.context.snapshotRef.current);
  saved.records[0] = production.updateRecord(saved.records[0], { ...saved.records[0], stage: "applied" });
  await h.main.savePhoneSnapshot(scope, saved); h.context.putSnapshot(saved);
}
async function seedNeighbors(h) {
  const profile = recovery("profile"), job = { ...savedSnapshot().jobs[0], id: "other-job", url: "https://example.com/job/2" };
  const original = blankRecord(job), record = { id: uuid(12), savedAt: fixedNow().toISOString(), record: { job, original, draft: { ...original, note: "Another record's unfinished note" }, existed: false } };
  await h.safety.hold(scope, holdId); await h.safety.recover(scope, profile); await h.safety.recover(scope, record);
  h.context.safetyState = await h.safety.load(scope);
  return plain(h.context.safetyState);
}
async function dirtyRecord(h, note = "Recoverable private note متابعة") {
  const c = h.context; c.editRecord(c.snapshotRef.current.jobs[0]);
  c.editorDraft = { ...c.editorDraft, note }; c.dialogDirty = true;
  const captured = c.unfinished(); await c.preserveUnfinished(scope, captured);
  return { id: c.dialog.editorId, baseline: plain(c.dialog.record), captured };
}

test("actual Keep then clean Cancel retires only this editor across repeated applied-stage cycles", async () => {
  const h = await harness(); await setAppliedBaseline(h); const neighbors = await seedNeighbors(h);
  const mainBefore = plain(h.mainPort.rows.get(scope)), mainWrites = h.mainPort.writes.length, ids = [];
  for (let cycle = 0; cycle < 4; cycle++) {
    const c = h.context; c.editRecord(c.snapshotRef.current.jobs[0]); ids.push(c.dialog.editorId);
    const control = recordControls(h); control.edit({ stage: "saved" });
    control.submit({ preventDefault() {} }); assert.equal(control.confirmClear, true);
    const captured = c.unfinished(); assert.equal(captured.length, 1);
    await c.preserveUnfinished(scope, captured);
    control.keepAppliedRecord({ form: null, ownerDocument: {} });
    assert.equal(control.confirmClear, false); assert.deepEqual(plain(c.editorDraft), plain(c.dialog.record));
    assert((await recoveryRows(h)).recovery.some(row => row.id === ids.at(-1)), "Keep alone must not delete a recovery copy");
    c.dialogDirty = true; // The child effect may still hold the previous flag.
    const closing = c.requestDialogClose();
    assert.equal(c.dialog, null, "A clean editor closes before asynchronous storage completes");
    assert.equal(c.recordRecoveryId.current, null); assert.equal(c.editorDraft, null); assert.equal(c.confirmDialogDiscard, false);
    await closing;
    await c.preserveUnfinished(scope, captured); // Delayed timer from the rejected stage.
    assert.deepEqual(await recoveryRows(h), neighbors, "Only this cycle's owned record copy is retired");
  }
  assert.equal(new Set(ids).size, 4); assert.equal(h.mainPort.writes.length, mainWrites);
  assert.deepEqual(h.mainPort.rows.get(scope), mainBefore, "Closing clean editors must not rewrite the saved application");
  assert.equal(h.context.notice, null); assert.equal(h.context.safetyError, "");
});

test("actual Keep preserves another dirty field and clean-close checks the draft instead of a lagging flag", async () => {
  const h = await harness(); await setAppliedBaseline(h); h.context.editRecord(h.context.snapshotRef.current.jobs[0]);
  const c = h.context, control = recordControls(h), id = c.dialog.editorId;
  control.edit({ stage: "saved", note: "Keep this private change متابعة" }); control.submit({ preventDefault() {} });
  await c.preserveUnfinished(scope, c.unfinished());
  control.keepAppliedRecord({ form: null, ownerDocument: {} });
  c.dialogDirty = false; const before = plain(h.recoveryPort.rows.get(scope)), opener = new c.HTMLElement(); c.document.activeElement = opener;
  await c.requestDialogClose();
  assert.equal(c.dialog.kind, "record"); assert.equal(c.dialog.editorId, id); assert.equal(c.confirmDialogDiscard, true);
  assert.equal(c.discardReturn.current, opener); assert.equal(c.editorDraft.stage, "applied"); assert.equal(c.editorDraft.note, "Keep this private change متابعة");
  assert(!c.recordRecoveryLifecycle.current.retired.get(scope)?.has(id));
  assert.deepEqual(h.recoveryPort.rows.get(scope), before, "A dirty field still requires explicit save or discard");
  await c.preserveUnfinished(scope, c.unfinished());
  assert.equal((await recoveryRows(h)).recovery.find(row => row.id === id).record.draft.note, c.editorDraft.note);
});

test("clean close follows queued and in-flight encrypted autosaves and fences their delayed publication", async () => {
  const h = await harness(), neighbors = await seedNeighbors(h), c = h.context;
  c.editRecord(c.snapshotRef.current.jobs[0]); c.editorDraft = { ...c.editorDraft, note: "In-flight original" };
  const captured = c.unfinished(), id = c.dialog.editorId, entered = deferred(), gate = deferred(), cleanupEntered = deferred(), cleanupGate = deferred();
  let writes = 0;
  h.recoveryPort.afterWrite = async () => {
    writes++;
    if (writes === 1) { entered.resolve(); await gate.promise; }
    if (writes === 3) { cleanupEntered.resolve(); await cleanupGate.promise; }
  };
  const inFlight = c.preserveUnfinished(scope, captured); await entered.promise;
  const queued = c.preserveUnfinished(scope, [{ ...captured[0], record: { ...captured[0].record, draft: { ...captured[0].record.draft, note: "Already queued successor" } } }]);
  c.editorDraft = plain(c.dialog.record); const closing = c.requestDialogClose();
  assert.equal(c.dialog, null);
  const delayed = c.preserveUnfinished(scope, captured), displayed = c.safetyState;
  try {
    gate.resolve(); await Promise.all([inFlight, queued, delayed]); await cleanupEntered.promise;
    assert.equal(c.safetyState, displayed, "Retired in-flight and queued writes must not publish an obsolete recovery list");
  } finally { gate.resolve(); cleanupGate.resolve(); await closing; }
  assert.deepEqual(await recoveryRows(h), neighbors); assert.equal(writes, 3);
  await c.preserveUnfinished(scope, captured); assert.equal(writes, 3, "A timer after cleanup must not recreate its retired identity");
  assert(!h.context.safetyState.recovery.some(row => row.id === id));
});

test("clean close of a recovered fork preserves its source, another tab's fork, other records and Stop holds", async () => {
  const a = await harness(), neighbors = await seedNeighbors(a), original = recovery("record", uuid(13));
  await a.safety.recover(scope, original);
  const b = await harness({ mainPort: a.mainPort, recoveryPort: a.recoveryPort });
  await a.context.restoreRecovery(original); await b.context.restoreRecovery(original);
  b.context.editorDraft = { ...b.context.editorDraft, note: "Other tab's newer record" };
  await b.context.preserveUnfinished(scope, b.context.unfinished());
  const aId = a.context.recordRecoveryId.current, bId = b.context.recordRecoveryId.current;
  a.context.editorDraft = plain(a.context.dialog.record); await a.context.requestDialogClose();
  const after = await recoveryRows(a);
  assert(!after.recovery.some(row => row.id === aId)); assert.notEqual(aId, original.id); assert.notEqual(aId, bId);
  assert.deepEqual(after.recovery.find(row => row.id === original.id), original);
  assert.equal(after.recovery.find(row => row.id === bId).record.draft.note, "Other tab's newer record");
  for (const row of neighbors.recovery) assert.deepEqual(after.recovery.find(value => value.id === row.id), row);
  assert.deepEqual(after.holds, neighbors.holds); assert.equal(after.recovery.length, 4);
  assert.equal((await vault(a.mainPort).loadPhoneSnapshot(scope)).records[0].note, "Earlier saved note");
});

test("a retired in-flight autosave failure cannot surface an obsolete error in a replacement editor", async () => {
  const h = await harness(), { baseline, captured } = await dirtyRecord(h), c = h.context, entered = deferred(), gate = deferred();
  let first = true;
  h.recoveryPort.beforeWrite = async () => { if (first) { first = false; entered.resolve(); await gate.promise; } };
  h.recoveryPort.failWriteAt = h.recoveryPort.writeCalls + 1;
  const saving = c.preserveUnfinished(scope, captured); await entered.promise;
  c.editorDraft = baseline; const closing = c.requestDialogClose(); c.editRecord(c.snapshotRef.current.jobs[0]);
  const replacement = c.dialog, displayed = c.safetyState; c.safetyError = "Replacement editor's message";
  gate.resolve(); await assert.doesNotReject(saving); await closing;
  assert.equal(c.dialog, replacement); assert.equal(c.safetyState, displayed); assert.equal(c.safetyError, "Replacement editor's message");
  assert.equal((await recoveryRows(h)).recovery.length, 0);
  h.recoveryPort.writeFailure = new DOMException("Synthetic full storage", "QuotaExceededError");
  c.editorDraft = { ...c.editorDraft, note: "Still-active unfinished note" };
  await assert.rejects(c.preserveUnfinished(scope, c.unfinished()), hasCode("storage_full"), "An active editor's failure must still be reported");
});

test("a failed clean-close cleanup preserves encrypted recovery and keeps clean close usable", async () => {
  const h = await harness(), neighbors = await seedNeighbors(h), { id, baseline, captured } = await dirtyRecord(h), c = h.context;
  const before = plain(h.recoveryPort.rows.get(scope)), mainBefore = plain(h.mainPort.rows.get(scope));
  h.recoveryPort.writeFailure = new DOMException("Synthetic full storage", "QuotaExceededError");
  c.editorDraft = baseline; const closing = c.requestDialogClose(); assert.equal(c.dialog, null); await closing;
  assert.match(c.safetyError, /^Your saved change was kept, but its recovery copy could not be removed\./);
  assert.equal(c.notice, null); assert.deepEqual(h.recoveryPort.rows.get(scope), before);
  await c.preserveUnfinished(scope, captured); assert.deepEqual(h.recoveryPort.rows.get(scope), before);
  const retained = await recoveryRows(h); assert(retained.recovery.some(row => row.id === id)); assert.deepEqual(retained.holds, neighbors.holds);
  c.editRecord(c.snapshotRef.current.jobs[0]); const anotherClose = c.requestDialogClose(); assert.equal(c.dialog, null); await anotherClose;
  assert.deepEqual(h.mainPort.rows.get(scope), mainBefore); assert.deepEqual(h.recoveryPort.rows.get(scope), before);
});

test("clean-close cleanup cannot publish success or errors into a newer scope, generation, identity or editor", async t => {
  for (const outcome of ["success", "failure"]) for (const changed of ["scope", "generation", "identity", "editor"]) await t.test(outcome + ":" + changed, async () => {
    const h = await harness(), { baseline } = await dirtyRecord(h), c = h.context, entered = deferred(), gate = deferred();
    h.recoveryPort.beforeWrite = async () => { entered.resolve(); await gate.promise; };
    if (outcome === "failure") h.recoveryPort.writeFailure = new DOMException("Synthetic full storage", "QuotaExceededError");
    c.editorDraft = baseline; const closing = c.requestDialogClose(); await entered.promise;
    if (changed === "scope") c.snapshotRef.current = savedSnapshot(otherScope);
    else if (changed === "generation") c.epoch.current++;
    else if (changed === "identity") c.identityUnverified.current = true;
    else c.editRecord(c.snapshotRef.current.jobs[0]);
    const dialog = c.dialog, displayed = { holds: [], recovery: [] }; c.safetyState = displayed; c.safetyError = "Newer view's message";
    gate.resolve(); await closing;
    assert.equal(c.safetyState, displayed); assert.equal(c.safetyError, "Newer view's message"); assert.equal(c.dialog, dialog);
    assert(!h.recoveryPort.rows.has(otherScope)); assert(!h.mainPort.rows.has(otherScope));
  });
});

test("an earlier cleanup stays fenced when another editor opens and closes before it finishes", async () => {
  const h = await harness(), { baseline } = await dirtyRecord(h), c = h.context;
  const firstEntered = deferred(), firstGate = deferred(), secondEntered = deferred(), secondGate = deferred(); let writes = 0;
  h.recoveryPort.beforeWrite = async () => { writes++; if (writes === 1) { firstEntered.resolve(); await firstGate.promise; } else if (writes === 2) { secondEntered.resolve(); await secondGate.promise; } };
  c.editorDraft = baseline; const firstClose = c.requestDialogClose(); await firstEntered.promise;
  c.editRecord(c.snapshotRef.current.jobs[0]); const secondClose = c.requestDialogClose();
  assert.equal(c.recordRecoveryId.current, null); const displayed = c.safetyState; c.safetyError = "Current editor's status";
  try {
    firstGate.resolve(); await firstClose; await secondEntered.promise;
    assert.equal(c.safetyState, displayed); assert.equal(c.safetyError, "Current editor's status", "A null editor ID alone must not authorize an obsolete completion");
  } finally { firstGate.resolve(); secondGate.resolve(); await Promise.all([firstClose, secondClose]); }
  assert.equal(c.safetyError, ""); assert.equal((await recoveryRows(h)).recovery.length, 0);
});

test("clean close requires the current owner and exact editor and refuses an unavailable draft", async t => {
  for (const changed of ["busy", "locked", "checking", "identity", "scope", "editor", "missing-draft"]) await t.test(changed, async () => {
    const h = await harness(), { baseline } = await dirtyRecord(h), c = h.context;
    c.editorDraft = baseline; c.dialogDirty = false;
    if (changed === "busy") c.busyRef.current = true;
    else if (changed === "locked") c.locked = true;
    else if (changed === "checking") c.checkingIdentity = true;
    else if (changed === "identity") c.identityUnverified.current = true;
    else if (changed === "scope") c.snapshotRef.current = savedSnapshot(otherScope);
    else if (changed === "editor") c.recordRecoveryId.current = uuid(91);
    else c.editorDraft = null;
    const dialog = c.dialog, before = plain(h.recoveryPort.rows.get(scope)), writes = h.recoveryPort.writes.length;
    await c.requestDialogClose(); assert.equal(c.dialog, dialog); assert.equal(h.recoveryPort.writes.length, writes);
    assert.deepEqual(h.recoveryPort.rows.get(scope), before); assert.equal(c.recordRecoveryLifecycle.current.retired.size, 0);
    if (changed === "missing-draft") assert.equal(c.confirmDialogDiscard, true);
  });
});

// A job-link editor was introduced after the original B16 repair. It must
// participate in the same lifecycle fence even though it has no record ID.
test("record clean-close cleanup stays fenced after a job-link editor opens or opens then closes", async t => {
  for (const outcome of ["success", "failure"]) for (const replacement of ["open", "closed"]) await t.test(outcome + ":" + replacement, async () => {
    const h = await harness(), { id, baseline } = await dirtyRecord(h), c = h.context;
    const entered = deferred(), gate = deferred(), mainBefore = plain(h.mainPort.rows.get(scope));
    h.recoveryPort.beforeWrite = async () => { entered.resolve(); await gate.promise; };
    if (outcome === "failure") h.recoveryPort.writeFailure = new DOMException("Synthetic full storage", "QuotaExceededError");
    c.editorDraft = baseline; const closing = c.requestDialogClose(); await entered.promise;
    c.openAddJob();
    if (replacement === "closed") await c.requestDialogClose();
    else c.editAddedJob(jobLinkFields);
    const dialog = c.dialog, displayed = c.safetyState; c.safetyError = "Current job-link editor's status";
    gate.resolve(); await closing;
    assert.equal(c.dialog, dialog); assert.equal(c.safetyState, displayed); assert.equal(c.safetyError, "Current job-link editor's status");
    assert.deepEqual(h.mainPort.rows.get(scope), mainBefore);
    const rows = await recoveryRows(h);
    assert.equal(rows.recovery.some(row => row.id === id), outcome === "failure", "Cleanup failure must retain the old encrypted copy without replacing new editor feedback");
    if (replacement === "open") {
      assert.deepEqual(plain(c.dialog.draft), jobLinkFields); assert.equal(c.dialogDirty, true);
      h.recoveryPort.writeFailure = null; h.recoveryPort.beforeWrite = null;
      await c.preserveUnfinished(scope, c.unfinished());
      assert.deepEqual((await recoveryRows(h)).recovery.find(row => row.id === c.dialog.editorId).jobLink, jobLinkFields);
    } else assert.equal(c.dialog, null, "An add-editor open/close cycle must not authorize an older completion");
  });
});

test("explicit record save and discard fence a captured autosave after the editor finishes", async t => {
  for (const action of ["save", "discard"]) await t.test(action, async () => {
    const h = await harness(), neighbors = await seedNeighbors(h), { id, captured } = await dirtyRecord(h), c = h.context;
    const changed = plain(c.editorDraft), mainBefore = plain(h.mainPort.rows.get(scope));
    if (action === "save") await c.saveRecord(changed, false); else await c.discardDialogEdits();
    assert.equal(c.dialog, null); assert(!(await recoveryRows(h)).recovery.some(row => row.id === id), "The explicit operation removed its own recovery copy first");
    await c.preserveUnfinished(scope, captured);
    assert.deepEqual(await recoveryRows(h), neighbors, "A late callback must not recreate a saved or deliberately discarded editor");
    if (action === "save") assert.equal((await h.main.loadPhoneSnapshot(scope)).records[0].note, changed.note);
    else assert.deepEqual(h.mainPort.rows.get(scope), mainBefore);
  });
});

test("explicit record completion follows an in-flight encrypted autosave and fences pending callbacks", async t => {
  for (const action of ["save", "discard"]) await t.test(action, async () => {
    const h = await harness(), neighbors = await seedNeighbors(h), { id, captured } = await dirtyRecord(h), c = h.context;
    const entered = deferred(), gate = deferred(), cleanupEntered = deferred(); let once = true;
    h.recoveryPort.afterWrite = async () => { if (once) { once = false; entered.resolve(); await gate.promise; } };
    c.phoneSafety = { ...h.safety, discard: (...args) => { cleanupEntered.resolve(); return h.safety.discard(...args); } };
    const saving = c.preserveUnfinished(scope, captured); await entered.promise;
    const completion = action === "save" ? c.saveRecord(c.editorDraft, false) : c.discardDialogEdits(); await cleanupEntered.promise;
    assert(c.recordRecoveryLifecycle.current.retired.get(scope)?.has(id));
    const displayed = c.safetyState; await c.preserveUnfinished(scope, captured); assert.equal(c.safetyState, displayed);
    gate.resolve(); await Promise.all([saving, completion]);
    assert.equal(c.dialog, null); assert.deepEqual(await recoveryRows(h), neighbors);
    await c.preserveUnfinished(scope, captured); assert.deepEqual(await recoveryRows(h), neighbors);
  });
});

test("a failed main-record save preserves the live editor and its encrypted recovery", async () => {
  const h = await harness(), { id, captured } = await dirtyRecord(h), c = h.context;
  const original = c.dialog, draft = plain(c.editorDraft), before = plain(h.recoveryPort.rows.get(scope));
  h.mainPort.writeFailure = new DOMException("Synthetic full storage", "QuotaExceededError");
  await assert.rejects(c.saveRecord(c.editorDraft, false), hasCode("storage_full"));
  assert.equal(c.dialog, original); assert.equal(c.recordRecoveryId.current, id); assert.deepEqual(plain(c.editorDraft), draft);
  assert(!c.recordRecoveryLifecycle.current.retired.get(scope)?.has(id)); assert.deepEqual(h.recoveryPort.rows.get(scope), before);
  await c.preserveUnfinished(scope, captured); assert.equal((await recoveryRows(h)).recovery.find(row => row.id === id).record.draft.note, draft.note);
  h.mainPort.writeFailure = null; c.storageProblem = ""; c.storageCode = "";
  await c.saveRecord(c.editorDraft, false); assert.equal(c.dialog, null); assert(!(await recoveryRows(h)).recovery.some(row => row.id === id));
});

test("an account lock during record cleanup cannot reopen a successfully saved or explicitly discarded editor", async t => {
  for (const action of ["save", "discard"]) await t.test(action, async () => {
    const h = await harness(), { id, captured } = await dirtyRecord(h), c = h.context, entered = deferred(), gate = deferred();
    c.phoneSafety = { ...h.safety, discard: async (...args) => { entered.resolve(); await gate.promise; return h.safety.discard(...args); } };
    const completing = action === "save" ? c.saveRecord(c.editorDraft, false) : c.discardDialogEdits(); await entered.promise;
    assert(c.recordRecoveryLifecycle.current.retired.get(scope)?.has(id));
    c.lock(); assert.equal(c.quarantine.current.dialog, null); assert.equal(c.quarantine.current.editorDraft, null);
    assert.equal(c.dialog, null); gate.resolve(); await assert.rejects(completing, /page changed/);
    await c.recoverLocked(); assert.equal(c.dialog, null); assert.equal(c.editorDraft, null); assert.equal(c.dialogDirty, false);
    await c.preserveUnfinished(scope, captured); assert(!(await recoveryRows(h)).recovery.some(row => row.id === id));
    assert.equal((await h.main.loadPhoneSnapshot(scope)).records[0].note, action === "save" ? captured[0].record.draft.note : "Earlier saved note");
  });
});

test("record save and discard cleanup cannot overwrite a replacement Add editor", async t => {
  for (const action of ["save", "discard"]) for (const outcome of ["success", "failure"]) await t.test(action + ":" + outcome, async () => {
    const h = await harness(), { id } = await dirtyRecord(h), c = h.context, entered = deferred(), gate = deferred();
    c.phoneSafety = { ...h.safety, discard: async (...args) => { entered.resolve(); await gate.promise; return h.safety.discard(...args); } };
    const completing = action === "save" ? c.saveRecord(c.editorDraft, false) : c.discardDialogEdits(); await entered.promise;
    if (outcome === "failure") h.recoveryPort.writeFailure = new DOMException("Synthetic full storage", "QuotaExceededError");
    c.openAddJob(); c.editAddedJob(jobLinkFields);
    const replacement = c.dialog, displayed = c.safetyState; c.safetyError = "Replacement job editor's message";
    gate.resolve(); await completing;
    assert.equal(c.dialog, replacement); assert.deepEqual(plain(c.dialog.draft), jobLinkFields); assert.equal(c.dialogDirty, true);
    assert.equal(c.safetyState, displayed); assert.equal(c.safetyError, "Replacement job editor's message"); assert.equal(c.notice, null);
    assert.equal((await recoveryRows(h)).recovery.some(row => row.id === id), outcome === "failure");
  });
});

// Autosave starts outside the busy operation. Exercise the production Save /
// Discard wrapper while the real encrypted safety queue is still completing it.
function useActualOperationRun(h) {
  const c = h.context;
  c.setBusy = value => { c.busy = value; };
  c.APIError = class extends Error {};
  c.identityCheckPending = { current: false };
  c.identityCheckRef = { current() { assert.fail("No identity request is expected in this local operation"); } };
  install(c, "run");
}

test("job-link retirement fences an in-flight autosave result while real cleanup remains queued", async t => {
  for (const action of ["save", "discard"]) await t.test(action, async () => {
    const h = await harness(), neighbors = await seedNeighbors(h), c = h.context;
    useActualOperationRun(h);
    const id = beginJobLink(h), captured = c.unfinished();
    const entered = deferred(), gate = deferred(), cleanupRequested = deferred(), cleanupEntered = deferred(), cleanupGate = deferred();
    let writes = 0;
    h.recoveryPort.afterWrite = async () => {
      writes++;
      if (writes === 1) { entered.resolve(); await gate.promise; }
      if (writes === 2) { cleanupEntered.resolve(); await cleanupGate.promise; }
    };
    c.phoneSafety = { ...h.safety, discard: (...args) => { cleanupRequested.resolve(); return h.safety.discard(...args); } };
    const preserving = c.preserveUnfinished(scope, captured); await entered.promise;
    const completing = action === "save" ? c.saveAddedJob() : c.discardDialogEdits(); await cleanupRequested.promise;
    assert(c.closedJobDrafts.current.has(id)); assert.equal(c.busyRef.current, true);
    const displayed = c.safetyState;
    try {
      gate.resolve(); await preserving; await cleanupEntered.promise;
      assert.equal(c.safetyState, displayed, "A retired job-link autosave must not publish its obsolete recovery list");
    } finally { gate.resolve(); cleanupGate.resolve(); await completing; }
    assert.deepEqual(await recoveryRows(h), neighbors);
    assert.equal(c.dialog, null); assert.equal(c.busyRef.current, false);
    assert.equal((await h.main.loadPhoneSnapshot(scope)).jobs.filter(job => job.url === jobLinkFields.url).length, action === "save" ? 1 : 0);
  });
});

test("job-link retirement silences a late autosave error without hiding an active editor failure", async t => {
  for (const action of ["save", "discard"]) await t.test(action, async () => {
    const h = await harness(), neighbors = await seedNeighbors(h), c = h.context;
    useActualOperationRun(h);
    const id = beginJobLink(h), captured = c.unfinished(), entered = deferred(), gate = deferred(), cleanupRequested = deferred();
    let first = true;
    h.recoveryPort.beforeWrite = async () => { if (first) { first = false; entered.resolve(); await gate.promise; } };
    h.recoveryPort.failWriteAt = h.recoveryPort.writeCalls + 1;
    c.phoneSafety = { ...h.safety, discard: (...args) => { cleanupRequested.resolve(); return h.safety.discard(...args); } };
    const preserving = c.preserveUnfinished(scope, captured).then(() => null, error => error); await entered.promise;
    const completing = action === "save" ? c.saveAddedJob() : c.discardDialogEdits(); await cleanupRequested.promise;
    assert(c.closedJobDrafts.current.has(id)); assert.equal(c.busyRef.current, true);
    gate.resolve(); const oldError = await preserving; await completing;
    assert.equal(oldError, null, "A retired job-link autosave must not trigger the outer recovery-error notice");
    assert.deepEqual(await recoveryRows(h), neighbors); assert.equal(c.dialog, null);
    beginJobLink(h, { ...jobLinkFields, title: "Current unfinished job / وظيفة قيد الإضافة" });
    h.recoveryPort.writeFailure = new DOMException("Synthetic full storage", "QuotaExceededError");
    await assert.rejects(c.preserveUnfinished(scope, c.unfinished()), hasCode("storage_full"), "An active Add editor must still report a genuine save failure");
    assert.equal(c.dialog.kind, "add"); assert.equal(c.dialogDirty, true);
  });
});
