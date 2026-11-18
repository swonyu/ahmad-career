import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Evidence overrides select a source copy without changing the repository.
// Normal project execution reads the real PhoneApp and installed dependencies.
const project = process.env.CAREER_ACTIONS_PROJECT || fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(path.join(project, "package.json"));
const ts = require("typescript");
const read = name => fs.readFileSync(path.join(project, name), "utf8");
function execute(source, scope = {}, loader = require) {
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const context = { exports: {}, require: loader, Error, DOMException, URL, URLSearchParams, TextEncoder, TextDecoder,
    fetch() { assert.fail("These production-handler regressions must not contact a network"); }, ...scope };
  vm.runInNewContext(code, context);
  return context.exports;
}
const model = execute(read("app/phone/model.ts"));
const { APIError } = execute(read("app/components/api.ts"));
const { PhoneVaultError } = execute(read("app/phone/vault.ts"), {}, name => name === "./model" ? model : require(name));
const source = process.env.CAREER_ACTIONS_SOURCE ? fs.readFileSync(process.env.CAREER_ACTIONS_SOURCE, "utf8") : read("app/phone/PhoneApp.tsx");
const tree = ts.createSourceFile("PhoneApp.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(tree.parseDiagnostics.length, 0, "The complete candidate source must parse");
const app = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "PhoneApp");
assert(app?.body);
function declaration(name, optional = false) {
  for (const node of [...tree.statements, ...app.body.statements]) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node.getText(tree);
    if (ts.isVariableStatement(node)) {
      const entry = node.declarationList.declarations.find(value => value.name.getText(tree) === name);
      if (entry?.initializer) return entry.initializer.getText(tree);
    }
  }
  if (optional) return null;
  assert.fail("Actual production declaration is required: " + name);
}
function findNode(predicate) {
  const matches = [];
  function walk(node) { if (predicate(node)) matches.push(node); ts.forEachChild(node, walk); }
  walk(tree); assert.equal(matches.length, 1, "Exactly one production control must match");
  return matches[0];
}
function attribute(node, name) {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  const value = opening.attributes?.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.text === name)?.initializer;
  return value && ts.isJsxExpression(value) ? value.expression?.getText(tree) : value?.text;
}
const checkbox = findNode(node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === "input" && attribute(node, "checked") === "selected.includes(identity)");
const boardInput = findNode(node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === "input" && attribute(node, "value") === "customBoard");
const titleInput = findNode(node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === "input" && attribute(node, "value") === "filters.query");
const locationInput = findNode(node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === "input" && attribute(node, "value") === "filters.location");
const boardButton = findNode(node => ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "button" && node.children.some(child => ts.isJsxExpression(child) && child.expression?.getText(tree) === 't("Add employer board")'));
const searchForm = findNode(node => ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "form" && attribute(node, "className") === "phone-search-card");
function install(context, name, expression = declaration(name)) {
  const code = ts.transpileModule("globalThis." + name + " = " + expression, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInContext(code, context);
  return context[name];
}
const plain = value => JSON.parse(JSON.stringify(value));
const uuid = value => "00000000-0000-4000-8000-" + String(value).padStart(12, "0");
const owner = "account:synthetic-action-owner:" + uuid(1);
const job = value => ({ id: "synthetic-job-" + value, url: "https://example.com/job/" + value, title: "Opportunity " + value, company: "Synthetic employer", location: "الرياض / Riyadh", country: "SA" });
const identityA = model.jobIdentity(job(1).url), identityB = model.jobIdentity(job(2).url);
function profile() {
  return model.profileSchema.parse({ ...model.blankProfile(), firstName: "Synthetic", email: "fixture@example.com",
    revision: 1, resume: { name: "Synthetic.pdf", mime: "application/pdf", size: 128, sha256: "a".repeat(64) } });
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function recordHarness({ applied = false } = {}) {
  const saved = model.blankSnapshot(owner); saved.profile = profile(); saved.jobs = [job(1), job(2)];
  saved.records = saved.jobs.map(value => model.blankRecord(value));
  if (applied) saved.records[0] = model.updateRecord(saved.records[0], { ...saved.records[0], stage: "applied" });
  const writes = [], network = [], discarded = [], writeHook = { current: null };
  const context = {
    ...model, z: require("zod").z, APIError, PhoneVaultError, Error, DOMException, URL, URLSearchParams, TextEncoder, TextDecoder, require, exports: {},
    account: { id: "synthetic-action-owner" }, epoch: { current: 4 }, identityUnverified: { current: false },
    identityCheckPending: { current: false }, identityCheckRef: { current() {} }, busyRef: { current: false },
    busy: "", locked: false, checkingIdentity: false, storageProblem: "", formChanged: false,
    snapshotRef: { current: saved }, snapshot: saved, profile: saved.profile, selected: [identityA, identityB], employerAnswers: {},
    workspaceRef: { current: { accountId: "synthetic-action-owner", workspaceId: uuid(1), profile: saved.profile,
      activePlanIds: [], recoverablePlans: [], capabilities: { liveEnabled: true }, jobs: saved.jobs, deleting: false, emailUpdateRequired: false } },
    dialog: { kind: "record", editorId: uuid(20), record: plain(saved.records[0]), scope: owner, existed: true, job: saved.jobs[0] },
    recordRecoveryLifecycle: { current: { retired: new Map(), editorVersion: 0 } },
    editorDraft: plain(saved.records[0]), recordRecoveryId: { current: uuid(20) }, notice: null, safetyError: "",
    phoneSafety: { async discard(scope, id) { discarded.push({ scope, id }); return { holds: [], recovery: [] }; } },
    async savePhoneSnapshot(scope, value) {
      assert.equal(scope, owner); writes.push(plain(value));
      if (writeHook.current) await writeHook.current();
    },
    async phoneAPI(route, options) {
      network.push({ route, options: plain(options) });
      if (route === "/api/phone/jobs") return { job: { ...job(2), ...options.body, id: uuid(102) } };
      assert.equal(route, "/api/phone/prepare");
      // Capture the exact preparation request; no synthetic submission or live
      // provider result is needed for selection/consent boundary verification.
      throw Error("Synthetic preparation transport stops after recording the request.");
    },
    lock() { assert.fail("No synthetic selection case should invoke account sign-out"); },
  };
  for (const [setter, field] of Object.entries({ setBusy: "busy", setNotice: "notice", setSnapshot: "snapshot",
    setSelected: "selected", setEditorDraft: "editorDraft", setPlan: "plan", setReviewAccepted: "reviewAccepted",
    setDialog: "dialog", setSafetyState: "safetyState", setSafetyError: "safetyError",
    setStorageCode: "storageCode", setStorageProblem: "storageProblem" })) {
    context[setter] = value => { context[field] = typeof value === "function" ? value(context[field]) : value; };
  }
  vm.createContext(context);
  for (const name of ["same", "message", "assertCurrent", "storageFailure", "putSnapshot", "persist", "run", "local", "online", "adoptSafety", "retireRecordRecovery", "discardRecovery", "saveRecord", "prepare"]) install(context, name);
  return { context, writes, network, discarded, writeHook, draft: stage => ({ ...context.dialog.record, stage }) };
}
function renderCheckbox(h, identity = identityA) {
  const context = h.context;
  context.identity = identity;
  context.applied = context.snapshotRef.current.records.find(record => record.identity === identity)?.appliedElsewhere;
  const render = context.renderChoice ?? install(context, "renderChoice", "() => (" + checkbox.getText(tree) + ")");
  return render();
}
function boardHarness({ url = "https://jobs.lever.co/synthetic-new", sources = ["lever:global:synthetic-old"] } = {}) {
  const searches = [], filterWrites = [], context = {
    ...model, z: require("zod").z, Error, URL, require, exports: {}, customBoard: url, boardsTouched: true,
    filters: { query: "Engineer مهندس", location: "Riyadh", remoteOnly: true, sources: [...sources] }, catalog: null, notice: null,
    setBoardsTouched(value) { context.boardsTouched = value; },
    setCustomBoard(value) { context.customBoard = value; },
    setFilters(value) { context.filters = value; filterWrites.push(plain(value)); },
    setNotice(value) { context.notice = value; },
    searchJobs() { searches.push(plain(context.filters)); },
  };
  vm.createContext(context);
  Object.defineProperty(context, "searchSources", { get: () => vm.runInContext("(" + declaration("searchSources") + ")", context) });
  install(context, "message");
  const add = declaration("addEmployerBoard", true);
  if (add) install(context, "addEmployerBoard", add);
  install(context, "clickAdd", attribute(boardButton, "onClick"));
  install(context, "submitSearch", attribute(searchForm, "onSubmit"));
  const keydown = attribute(boardInput, "onKeyDown");
  if (keydown) install(context, "boardKeyDown", keydown);
  return { context, searches, filterWrites };
}
function keyEvent({ key = "Enter", composing = false, keyCode = 13 } = {}) {
  return { key, keyCode, nativeEvent: { isComposing: composing, keyCode }, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; } };
}
function enterBoard(h, { implicitSubmit = false, ...options } = {}) {
  const event = keyEvent(options); h.context.boardKeyDown?.(event);
  // Explicitly model only the ordinary, valid-URL default submit routing.
  // Browser/native-picker/IME behavior is not claimed by this AST regression.
  if (implicitSubmit && !event.defaultPrevented && !event.nativeEvent.isComposing && event.keyCode !== 229) h.context.submitSearch({ preventDefault() {} });
  return event;
}

test("marking a selected job applied prunes only that identity after its actual storage save completes", async () => {
  const h = recordHarness(), entered = deferred(), gate = deferred();
  h.writeHook.current = async () => { entered.resolve(); await gate.promise; };
  const pending = h.context.saveRecord(h.draft("applied"), false);
  try { await entered.promise; assert.deepEqual(plain(h.context.selected), [identityA, identityB]); }
  finally { gate.resolve(); }
  await pending;
  assert.equal(h.context.snapshotRef.current.records.find(row => row.identity === identityA).appliedElsewhere, true);
  assert.deepEqual(plain(h.context.selected), [identityB]);
  assert.equal(h.writes.length, 1); assert.equal(h.network.length, 0);
});

test("selection pruning follows the persisted appliedElsewhere value, preserving ordinary edits and explicit unmarking", async () => {
  for (const [priorApplied, stage, clearApplied, expected] of [
    [false, "interview", false, [identityB]], [false, "offer", false, [identityB]],
    [true, "closed", false, [identityB]], [false, "saved", false, [identityA, identityB]],
    [true, "saved", true, [identityA, identityB]],
  ]) {
    const h = recordHarness({ applied: priorApplied });
    await h.context.saveRecord(h.draft(stage), clearApplied);
    assert.equal(h.context.notice.error, undefined);
    assert.deepEqual(plain(h.context.selected), expected);
  }
});

test("failed or stale record saves preserve selection and the current editor", async () => {
  for (const change of ["storage", "scope", "generation", "identity"]) {
    const h = recordHarness(), originalDialog = h.context.dialog, originalId = h.context.recordRecoveryId.current;
    h.writeHook.current = async () => {
      if (change === "storage") throw new PhoneVaultError("storage_full", "Synthetic storage is full.");
      if (change === "scope") h.context.snapshotRef.current = model.blankSnapshot("guest");
      if (change === "generation") h.context.epoch.current++;
      if (change === "identity") h.context.identityUnverified.current = true;
    };
    await h.context.saveRecord(h.draft("applied"), false);
    assert.equal(h.context.notice.error, true);
    assert.deepEqual(plain(h.context.selected), [identityA, identityB]);
    assert.equal(h.context.dialog, originalDialog); assert.equal(h.context.recordRecoveryId.current, originalId);
    assert.equal(h.discarded.length, 0); assert.equal(h.network.length, 0);
  }
});

test("active-plan applied-mark and final Prepare guards still reject forbidden changes before transport", async () => {
  for (const knownPlan of [false, true]) {
    const h = recordHarness();
    h.context.workspaceRef.current.activePlanIds = [uuid(30)];
    h.context.workspaceRef.current.recoverablePlans = knownPlan ? [{ id: uuid(30), items: [{ job: job(1) }] }] : [];
    await h.context.saveRecord(h.draft("applied"), false);
    assert.match(h.context.notice.text, /Stop the approved application/);
    assert.deepEqual(plain(h.context.selected), [identityA, identityB]); assert.equal(h.writes.length, 0);
  }
  const h = recordHarness({ applied: true });
  await h.context.prepare();
  assert.match(h.context.notice.text, /already marked applied/);
  assert.equal(h.network.length, 0); assert.equal(h.writes.length, 0);
});

test("a stale selected applied job can be unchecked while ineligible new selection stays blocked", async () => {
  const h = recordHarness({ applied: true }), choice = renderCheckbox(h);
  assert.equal(choice.props.checked, true); assert.equal(choice.props.disabled, false);
  choice.props.onChange({ target: { checked: false } });
  assert.deepEqual(plain(h.context.selected), [identityB]);
  const unselected = renderCheckbox(h); assert.equal(unselected.props.checked, false); assert.equal(unselected.props.disabled, true);
  h.context.busy = "Checking"; assert.equal(renderCheckbox(h, identityB).props.disabled, true); h.context.busy = "";
  await h.context.prepare();
  assert.deepEqual(h.network.map(call => call.route), ["/api/phone/jobs", "/api/phone/prepare"]);
  assert.equal(h.network[0].options.body.url, job(2).url);
  assert.deepEqual(h.network[1].options.body.jobIds, [uuid(102)]);
  assert.deepEqual(h.network[1].options.body.manualAppliedJobIds, []);
});

test("Enter in the employer-board field adds exactly one board through the real action and never searches", () => {
  for (const action of ["click", "enter"]) {
    const h = boardHarness({ sources: ["lever:global:a", "lever:global:b", "lever:global:c"] });
    const prior = plain(h.context.filters);
    if (action === "click") h.context.clickAdd();
    else assert.equal(enterBoard(h, { implicitSubmit: true }).defaultPrevented, true);
    assert.equal(h.filterWrites.length, 1); assert.equal(h.searches.length, 0);
    assert.equal(h.context.customBoard, "");
    assert.deepEqual(plain(h.context.filters), { ...prior, sources: [...prior.sources, "https://jobs.lever.co/synthetic-new"] });
  }
});

test("board Enter preserves Add validation, input and filters on invalid, unsupported, duplicate or full selections", () => {
  for (const options of [
    { url: "not-a-url" }, { url: "https://unsupported.example.com/jobs" },
    { sources: ["https://jobs.lever.co/synthetic-new"] },
    { sources: ["lever:global:a", "lever:global:b", "lever:global:c", "lever:global:d"] },
  ]) {
    const click = boardHarness(options), enter = boardHarness(options), prior = plain(enter.context.filters), input = enter.context.customBoard;
    click.context.clickAdd(); const event = enterBoard(enter);
    assert.equal(event.defaultPrevented, true);
    assert.equal(enter.context.notice?.error, true);
    assert.equal(enter.context.notice.text, click.context.notice.text);
    assert.deepEqual(plain(enter.context.filters), prior); assert.equal(enter.context.customBoard, input);
    assert.equal(enter.filterWrites.length, 0); assert.equal(enter.searches.length, 0);
  }
});

test("composition Enter, legacy composition keycode and ordinary keys do not add or interfere with input", () => {
  for (const options of [{ composing: true }, { keyCode: 229 }, { key: "a", keyCode: 65 }]) {
    const h = boardHarness(), event = enterBoard(h, options);
    assert.equal(event.defaultPrevented, false);
    assert.equal(h.filterWrites.length, 0); assert.equal(h.searches.length, 0); assert.equal(h.context.notice, null);
    assert.equal(h.context.customBoard, "https://jobs.lever.co/synthetic-new");
  }
});

test("title and location keep ordinary search submission without adding the custom board", () => {
  for (const input of [titleInput, locationInput]) {
    const h = boardHarness(), event = keyEvent(), code = attribute(input, "onKeyDown");
    if (code) install(h.context, "otherKeyDown", code)(event);
    if (!event.defaultPrevented) h.context.submitSearch({ preventDefault() { event.defaultPrevented = true; } });
    assert.equal(h.searches.length, 1); assert.equal(h.filterWrites.length, 0);
    assert.deepEqual(h.searches[0].sources, ["lever:global:synthetic-old"]);
    assert.equal(h.context.customBoard, "https://jobs.lever.co/synthetic-new");
  }
});
