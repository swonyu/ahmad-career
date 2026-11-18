import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";
import { createHash } from "node:crypto";

// Preliminary dependency-free source runner. The required project test uses
// TypeScript AST extraction; this runner executes the identical added assertions
// against narrowly bounded actual source slices using Node's built-in stripper.
const root = path.resolve(process.argv[2]);
const componentSource = fs.readFileSync(path.join(root, "hosted/app/phone/components.tsx"), "utf8");
const phoneSource = fs.readFileSync(path.join(root, "hosted/app/phone/PhoneApp.tsx"), "utf8");
const digest = source => createHash("sha256").update(source).digest("hex");
const modalStart = componentSource.indexOf("export function Modal(");
const modalEnd = componentSource.indexOf("\nexport function Readiness(", modalStart);
assert(modalStart >= 0 && modalEnd > modalStart);
const modalSource = componentSource.slice(modalStart, modalEnd);
const effectStart = modalSource.indexOf("useLayoutEffect(");
const effectEnd = modalSource.indexOf(", []);", effectStart);
assert(effectStart >= 0 && effectEnd > effectStart);
assert.equal(modalSource.indexOf("useLayoutEffect(", effectStart + 1), -1);
const effect = modalSource.slice(effectStart + "useLayoutEffect(".length, effectEnd);
const helperMarker = "export const recoverPhoneFocus = ";
const helperStart = componentSource.indexOf(helperMarker);
const helper = helperStart < 0 ? "" : componentSource.slice(helperStart + helperMarker.length, modalStart).trim().replace(/;$/, "");
const modalFocusCode = stripTypeScriptTypes((helper ? "globalThis.recoverPhoneFocus = " + helper + ";\n" : "") + "globalThis.mountModal = " + effect + ";");
const clearLabel = '>{t("Clear search and filters")}</button>';
const labelAt = phoneSource.indexOf(clearLabel);
assert(labelAt >= 0); assert.equal(phoneSource.indexOf(clearLabel, labelAt + 1), -1);
const handlerAt = phoneSource.lastIndexOf("onClick={", labelAt);
assert(handlerAt >= 0); assert.equal(phoneSource[labelAt - 1], "}");
const clearExpression = phoneSource.slice(handlerAt + "onClick={".length, labelAt - 1);
function buttonClick(label) { assert.equal(label, "Clear search and filters"); return clearExpression; }
function install(context, name, value) {
  vm.runInContext(stripTypeScriptTypes("globalThis." + name + " = " + value + ";"), context);
  return context[name];
}
console.log(JSON.stringify({ scope: "identical-added-focus-assertions/actual-source-slices", runtime: process.version, sourceRoot: root, componentSHA256: digest(componentSource), phoneSHA256: digest(phoneSource), helperPresent: helperStart >= 0, requiredProjectRuntime: "v24.22.3", projectPinnedRuntime: process.version === "v24.22.3" }));

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
