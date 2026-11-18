import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
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
  stdin: { contents: 'export * from "./app/phone/vault.ts"; export * from "./app/phone/model.ts"; export * from "./app/phone/safety.ts"; export { z } from "zod";', resolveDir: process.cwd(), sourcefile: "phone-recovery-production.ts" },
  bundle: true, write: false, platform: "node", format: "esm", target: "node24", logLevel: "silent",
});
const production = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text + "\n//# sourceURL=phone-recovery-production.mjs").toString("base64"));
const { createPhoneVault, createPhoneSafety, blankSnapshot, blankRecord, PhoneVaultError } = production;
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
  afterWrite = null;
  afterRemove = null;
  async read(owner) { return this.rows.has(owner) ? { exists: true, value: plain(this.rows.get(owner)) } : { exists: false }; }
  async compareAndSet(owner, expectedId, value) {
    this.writeCalls++;
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
    snapshotRef: { current: saved }, workspaceRef: { current: { workspaceId: uuid(1), activePlanIds: [] } },
    locked: false, checkingIdentity: false, storageProblem: "", profile: plain(saved.profile), formChanged: false,
    editorDraft: null, dialog: null, dialogDirty: false, profileRecoveryId: { current: null }, recordRecoveryId: { current: null }, clearingRecovery: { current: null },
    safetyState: await safety.load(scope), safetyError: "", notice: null, reloads: 0, navigation: [],
    phoneSafety: safety, savePhoneSnapshot: main.savePhoneSnapshot, removePhoneSnapshot: main.removePhoneSnapshot,
    run: (_label, callback) => callback(context.epoch.current),
    navigate: tab => context.navigation.push(tab),
    window: { location: { reload() { context.reloads++; } } },
  };
  for (const [setter, field] of Object.entries({ setProfile: "profile", setFormChanged: "formChanged", setEditorDraft: "editorDraft", setDialog: "dialog", setDialogDirty: "dialogDirty", setSafetyState: "safetyState", setSafetyError: "safetyError", setNotice: "notice", setStorageProblem: "storageProblem", setStorageCode: "storageCode", setPlan: "plan", setReviewAccepted: "reviewAccepted", setConfirmDialogDiscard: "confirmDialogDiscard", setSnapshot: "snapshot" })) {
    context[setter] = value => { context[field] = typeof value === "function" ? value(context[field]) : value; };
  }
  vm.createContext(context);
  for (const name of ["same", "message", "local", "assertCurrent", "putSnapshot", "storageFailure", "persist", "unfinished", "adoptSafety", "preserveUnfinished", "discardRecovery", "restoreRecovery", "saveLocalProfile", "saveRecord"]) install(context, name);
  install(context, "openClear", buttonClick("Clear this phone’s saved data"));
  install(context, "openReset", buttonClick("Reset this phone’s data"));
  install(context, "clear", action("Clearing phone data"));
  install(context, "discardConfirmed", action("Discarding recovery copy"));
  return { context, main, safety, mainPort, recoveryPort };
}
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
function phoneDeclarationExists(name) {
  const app = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "PhoneApp");
  const matches = app.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).filter(node => node.name.getText(tree) === name);
  assert(matches.length <= 1, "Production declaration must be unique: " + name);
  return matches.length === 1;
}

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
    assert.equal(h.focusCalls[0].options.preventScroll, true);
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

test("actual discard entry handlers remember Cancel or Delete and preserve clean close behavior", () => {
  class HTMLElement {}
  const opener = new HTMLElement(); opener.name = "Cancel";
  const state = { confirm: false, dialog: { kind: "record", record: { identity: "synthetic" }, scope: "guest" } };
  const context = vm.createContext({
    discardReturn: { current: null }, HTMLElement, document: { activeElement: { name: "not an element" } },
    dialogDirty: true, dialog: state.dialog,
    setConfirmDialogDiscard(value) { state.confirm = value; },
    setDialog(value) { state.dialog = value; },
  });
  if (phoneDeclarationExists("rememberDiscardOpener")) install(context, "rememberDiscardOpener");
  install(context, "requestDialogClose");
  install(context, "deletePrivate", buttonClick("Delete this private record"));
  context.requestDialogClose();
  assert.equal(context.discardReturn.current, null); assert.equal(state.confirm, true); assert.equal(state.dialog.kind, "record");
  context.document.activeElement = opener; state.confirm = false;
  context.requestDialogClose();
  assert.equal(context.discardReturn.current, opener, "The actual opener must be retained for the later Keep interaction");
  assert.equal(state.confirm, true); assert.equal(state.dialog.kind, "record");
  context.dialogDirty = false; context.discardReturn.current = null; state.confirm = false;
  context.requestDialogClose();
  assert.equal(state.dialog, null); assert.equal(state.confirm, false); assert.equal(context.discardReturn.current, null);
  context.dialogDirty = true; state.dialog = { kind: "record", record: { identity: "synthetic" }, scope: "guest" }; context.dialog = state.dialog;
  const deleteButton = new HTMLElement();
  context.deletePrivate({ currentTarget: deleteButton });
  assert.equal(context.discardReturn.current, deleteButton);
  assert.equal(state.confirm, true); assert.equal(state.dialog.kind, "record", "Dirty Delete only asks about unfinished changes");
  context.dialogDirty = false; state.confirm = false;
  context.deletePrivate({ currentTarget: deleteButton });
  assert.equal(state.dialog.kind, "delete-record"); assert.equal(state.confirm, false);
});
