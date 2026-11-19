import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Actual production callbacks and effect cleanup; no invented DOM or live account.
// An evidence-only candidate may be selected without applying it to the worktree.
const componentFile = name => process.env.CAREER_ACCOUNT_COMPONENT_SOURCE_DIR
  ? join(process.env.CAREER_ACCOUNT_COMPONENT_SOURCE_DIR, name)
  : new URL("../app/components/" + name, import.meta.url);
const sessionSource = await readFile(componentFile("SessionRecovery.tsx"), "utf8");
const oauthSource = await readFile(componentFile("OAuthFeedback.tsx"), "utf8");
const accountSource = await readFile(process.env.CAREER_ACCOUNT_PANEL_SOURCE_FILE ?? new URL("../app/account/AccountPanel.tsx", import.meta.url), "utf8");
const sourceTree = source => ts.createSourceFile("component.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const sessionTree = sourceTree(sessionSource), oauthTree = sourceTree(oauthSource), accountTree = sourceTree(accountSource);
function nodes(tree, predicate) {
  const found = [];
  function visit(node) { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); }
  visit(tree); return found;
}
const sessionClicks = nodes(sessionTree, node => ts.isJsxAttribute(node) && node.name.text === "onClick");
assert.equal(sessionClicks.length, 1, "Exercise the actual recovery action");
const clickExpression = sessionClicks[0].initializer.expression.getText(sessionTree);
const lifecycleExpressions = nodes(sessionTree, node => ts.isCallExpression(node) && node.expression.getText(sessionTree) === "useLayoutEffect").map(node => node.arguments[0].getText(sessionTree));
const oauthEffects = nodes(oauthTree, node => ts.isCallExpression(node) && node.expression.getText(oauthTree) === "useEffect");
assert(oauthEffects.length >= 1);
const oauthEffect = oauthEffects[0].arguments[0].getText(oauthTree);
function code(value) { return ts.transpileModule(value, { fileName: "account-recovery-callbacks.tsx", compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText; }
const clickCode = code("globalThis.makeClick = accountId => (" + clickExpression + ");");
const lifecycleCode = code("globalThis.makeLifecycle = accountId => [" + lifecycleExpressions.join(",") + "];");
const oauthCode = code("globalThis.start = " + oauthEffect + ";");
const actualButton = sessionClicks[0].parent.parent.parent;
assert(ts.isJsxElement(actualButton) && actualButton.openingElement.tagName.getText(sessionTree) === "button");
const derived = name => nodes(sessionTree, node => ts.isVariableDeclaration(node) && node.name.getText(sessionTree) === name)[0]?.initializer?.getText(sessionTree) ?? "state." + name;
const buttonCode = code("globalThis.renderButton = (accountId, state) => { const busy = " + derived("busy") + "; return (" + actualButton.getText(sessionTree) + "); };");
const publicComponent = sessionTree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "SessionRecovery");
const innerComponent = sessionTree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "SessionRecoveryAction");
const keyedAction = nodes(publicComponent, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(sessionTree) === "SessionRecoveryAction")[0];
const identityContext = { React };
vm.createContext(identityContext);
vm.runInContext(code("globalThis.SessionRecoveryAction = " + (innerComponent ?? publicComponent).getText(sessionTree).replace(/^export\s+default\s+/, "") + ";\nglobalThis.actionElement = accountId => " + (keyedAction ? "(" + keyedAction.getText(sessionTree) + ")" : "React.createElement(SessionRecoveryAction, { accountId })") + ";"), identityContext);
const bundle = await build({
  stdin: { contents: 'export { internalAuthRedirect, authStatusSchema, oauthReturn } from "./app/components/provider-auth.ts"; export { APIError } from "./app/components/api.ts";', sourcefile: "account-recovery-real-helpers.ts", resolveDir: process.cwd() },
  bundle: true, write: false, platform: "node", format: "esm", target: "node24", logLevel: "silent",
});
const helpers = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text + "\n//# sourceURL=account-recovery-real-helpers.mjs").toString("base64"));
const deferred = () => { let resolve, reject; return { promise: new Promise((yes, no) => { resolve = yes; reject = no; }), resolve: value => resolve(value), reject: error => reject(error) }; };
const origin = "https://career.example";
function recoveryHarness(owner = "synthetic-account-a") {
  const calls = [], navigations = [], updates = [];
  let activeOwner = owner, state = { accountId: owner, busy: false, error: "" }, cleanups = [];
  const context = {
    Error, AbortController, React, t: value => value, actionRef: { current: null }, descriptionId: "synthetic-recovery-description", internalAuthRedirect: helpers.internalAuthRedirect,
    pending: { current: null }, generation: { current: 0 },
    requestAPI(path, options) { const gate = deferred(); calls.push({ path, options, ...gate }); return gate.promise; },
    window: { location: { origin, assign: value => navigations.push(value) } },
    setState(value) { state = structuredClone(value); updates.push(structuredClone(state)); },
    // Baseline ports allow the same behavioral tests to demonstrate the old bug.
    setBusy(value) { state = { ...state, busy: value }; updates.push(structuredClone(state)); },
    setError(value) { state = { ...state, error: value }; updates.push(structuredClone(state)); },
  };
  vm.createContext(context); vm.runInContext(clickCode, context); vm.runInContext(lifecycleCode, context); vm.runInContext(buttonCode, context);
  const mount = nextOwner => {
    for (const cleanup of cleanups) cleanup();
    activeOwner = nextOwner;
    cleanups = context.makeLifecycle(nextOwner).map(effect => effect()).filter(cleanup => typeof cleanup === "function");
    return context.makeClick(nextOwner);
  };
  let action = mount(owner);
  return {
    calls, navigations, updates, context, state: () => structuredClone(state),
    click: () => action(), button: () => context.renderButton(activeOwner, state),
    unmount() { for (const cleanup of cleanups) cleanup(); cleanups = []; },
    replace(nextOwner = activeOwner) { action = mount(nextOwner); },
  };
}

test("actual recovery preserves expectedAccountId and the existing same-origin redirect allowlist", async () => {
  for (const accountId of ["synthetic-account-a", ""]) {
    const h = recoveryHarness(accountId), pending = h.click();
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].path, "/api/auth/signout");
    assert.equal(h.calls[0].options.method, "POST"); assert.deepEqual(structuredClone(h.calls[0].options.body), { expectedAccountId: accountId });
    h.calls[0].resolve({ ok: true, redirectTo: "/signout-with-chatgpt?return_to=%2Fconnect" });
    await pending; assert.deepEqual(h.navigations, [origin + "/signout-with-chatgpt?return_to=%2Fconnect"]); h.unmount();
  }
});

test("actual recovery aborts on unmount and ignores an already completed late success", async () => {
  const h = recoveryHarness(), pending = h.click(), updateCount = h.updates.length;
  h.unmount(); h.calls[0].resolve({ ok: true, redirectTo: "/account" }); await pending;
  assert.deepEqual(h.navigations, [], "Unmounted recovery must not redirect the replacement page");
  assert.equal(h.calls[0].options.signal?.aborted, true); assert.equal(h.updates.length, updateCount);
});

test("actual recovery does not publish a late failure after unmount", async () => {
  const h = recoveryHarness(), pending = h.click(), updateCount = h.updates.length;
  h.unmount(); h.calls[0].reject(Error("Synthetic obsolete failure")); await pending;
  assert.equal(h.updates.length, updateCount, "An obsolete catch must not alter recovery state");
  assert.equal(h.calls[0].options.signal?.aborted, true); assert.deepEqual(h.navigations, []);
});

test("actual account-generation replacement keeps the newer request intact after an old success or failure", async t => {
  for (const outcome of ["success", "failure"]) await t.test(outcome, async () => {
    const h = recoveryHarness(), old = h.click(); h.replace("synthetic-account-b");
    const current = h.click(), latestState = h.state(), updateCount = h.updates.length;
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[0].options.body.expectedAccountId, "synthetic-account-a");
    assert.equal(h.calls[1].options.body.expectedAccountId, "synthetic-account-b");
    if (outcome === "success") h.calls[0].resolve({ ok: true, redirectTo: "/account?obsolete=1" });
    else h.calls[0].reject(Error("Synthetic obsolete failure"));
    await old;
    assert.deepEqual(h.navigations, []); assert.equal(h.updates.length, updateCount); assert.deepEqual(h.state(), latestState);
    assert.equal(h.calls[0].options.signal?.aborted, true); assert.equal(h.calls[1].options.signal?.aborted, false);
    h.calls[1].resolve({ ok: true, redirectTo: "/phone" }); await current;
    assert.deepEqual(h.navigations, [origin + "/phone"]); h.unmount();
  });
});

test("actual cleanup/setup replay cannot revive the earlier request or clear the replacement operation", async () => {
  const h = recoveryHarness(), old = h.click(); h.replace();
  const current = h.click();
  h.calls[0].resolve({ ok: true, redirectTo: "/account?obsolete=1" }); await old;
  assert.deepEqual(h.navigations, []); assert.equal(h.calls[1].options.signal?.aborted, false);
  // The old finally must not remove the current guard or allow a duplicate POST.
  const duplicate = h.click(), requests = h.calls.length;
  for (const call of h.calls.slice(2)) call.resolve({ ok: true, redirectTo: "/account?duplicate=1" });
  await duplicate; assert.equal(requests, 2);
  h.calls[1].resolve({ ok: true, redirectTo: "/phone" }); await current;
  assert.deepEqual(h.navigations, [origin + "/phone"]); h.unmount();
});

test("actual recovery does not send duplicate mutations before React commits its busy state", async () => {
  const h = recoveryHarness(), first = h.click(), second = h.click();
  const requests = h.calls.length;
  for (const call of h.calls) call.resolve({ ok: true, redirectTo: "/account" });
  await Promise.all([first, second]);
  assert.equal(requests, 1); assert.equal(h.navigations.length, 1); h.unmount();
});

test("actual current failures remain visible and permit only an explicit retry", async () => {
  const h = recoveryHarness(), first = h.click();
  h.calls[0].reject(Error("Synthetic service unavailable")); await first;
  assert.equal(h.calls.length, 1); assert.equal(h.state().busy, false); assert.equal(h.state().error, "Synthetic service unavailable"); assert.deepEqual(h.navigations, []);
  const retry = h.click(); assert.equal(h.calls.length, 2);
  h.calls[1].resolve({ ok: true, redirectTo: "/connect" }); await retry;
  assert.deepEqual(h.navigations, [origin + "/connect"]); h.unmount();
});

test("actual recovery rejects an untrusted redirect without navigation or automatic replay", async () => {
  const h = recoveryHarness(), pending = h.click();
  h.calls[0].resolve({ ok: true, redirectTo: "https://untrusted.example/" }); await pending;
  assert.deepEqual(h.navigations, []); assert.equal(h.calls.length, 1);
  assert.equal(h.state().busy, false); assert.match(h.state().error, /could not be verified/); h.unmount();
});

const flush = () => new Promise(resolve => setImmediate(resolve));
function oauthHarness(result, provider = "google") {
  const calls = [], feedback = [], history = [];
  const context = {
    URL, AbortController, authStatusSchema: helpers.authStatusSchema, oauthReturn: helpers.oauthReturn,
    window: { location: { href: origin + "/phone?oauth_provider=" + provider + "&oauth_result=" + result + "&error_description=SYNTHETIC_UNTRUSTED_TEXT" }, history: { state: null, replaceState: (_state, _title, value) => history.push(value) } },
    requestAPI(path, options) { const gate = deferred(); calls.push({ path, options, ...gate }); return gate.promise; },
    setFeedback(value) { feedback.push(structuredClone(value)); },
    setMessage(text) { feedback.push({ text, tone: "status" }); },
  };
  vm.createContext(context); vm.runInContext(oauthCode, context);
  const cleanup = context.start();
  return { calls, feedback, history, cleanup };
}
function authStatus({ connected = true, method = "google" } = {}) {
  return { ok: true, account: { id: "synthetic-account-a", email: "synthetic@example.com", displayName: "Synthetic", method }, providers: {
    google: { configured: true, signInSupported: true, connected, ...(connected ? { connectionId: "a".repeat(64) } : {}) },
    linkedin: { configured: true, signInSupported: true, connected: false },
  } };
}

test("actual OAuth cancellation is polite and does not render untrusted provider text", async () => {
  const h = oauthHarness("cancelled"); await flush();
  assert.equal(h.calls.length, 0); assert.equal(h.feedback.length, 1); assert.equal(h.feedback[0].tone, "status");
  assert.match(h.feedback[0].text, /cancelled/); assert(!h.feedback[0].text.includes("SYNTHETIC_UNTRUSTED_TEXT"));
  assert(!h.history[0].includes("oauth_provider")); assert(!h.history[0].includes("oauth_result")); h.cleanup();
});

test("actual OAuth success language still requires service confirmation", async t => {
  for (const connected of [true, false]) await t.test(connected ? "verified" : "unconfirmed", async () => {
    const h = oauthHarness("connected"); await flush();
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].path, "/api/auth/status");
    h.calls[0].resolve(authStatus({ connected })); await flush();
    assert.equal(h.feedback.length, 1);
    assert.match(h.feedback[0].text, connected ? /is connected to your current/ : /check which connection is active/);
    assert.equal(h.feedback[0].tone, connected ? "status" : "alert");
    assert.equal(h.feedback[0].text.includes("SYNTHETIC_UNTRUSTED_TEXT"), false);
    h.cleanup();
  });
});

test("actual OAuth negative tones stay alerts unless the service confirms the same provider", async () => {
  // The production effect and authStatusSchema decide the tone. This does not
  // render a document and does not treat a string search as a focus result.
  const cases = [
    { name: "failed", result: "failed", status: null, tone: "alert", text: /could not be completed/, calls: 0 },
    { name: "cancelled-polite", result: "cancelled", status: null, tone: "status", text: /cancelled/, calls: 0 },
    { name: "signed-in-wrong-method", result: "signed_in", status: authStatus({ connected: true, method: "chatgpt" }), tone: "alert", text: /check which connection is active/, calls: 1 },
    { name: "signed-in-verified", result: "signed_in", status: authStatus({ connected: true, method: "google" }), tone: "status", text: /sign-in is confirmed/, calls: 1 },
  ];
  for (const item of cases) {
    const h = oauthHarness(item.result);
    await flush();
    assert.equal(h.calls.length, item.calls, item.name);
    if (item.calls) assert.equal(h.calls[0].path, "/api/auth/status", item.name);
    if (item.status) {
      helpers.authStatusSchema.parse(item.status);
      h.calls[0].resolve(item.status);
      await flush();
    }
    assert.equal(h.feedback.length, 1, item.name);
    assert.equal(h.feedback[0].tone, item.tone, item.name);
    assert.match(h.feedback[0].text, item.text, item.name);
    assert.equal(h.feedback[0].text.includes("SYNTHETIC_UNTRUSTED_TEXT"), false, item.name);
    if (item.tone === "alert") assert.doesNotMatch(h.feedback[0].text, /is connected to your current|sign-in is confirmed/);
    h.cleanup();
  }
});

test("actual OAuth cleanup suppresses a late status result", async () => {
  const h = oauthHarness("signed_in"); await flush(); assert.equal(h.calls.length, 1);
  h.cleanup(); h.calls[0].resolve(authStatus()); await flush();
  assert.equal(h.calls[0].options.signal.aborted, true); assert.equal(h.feedback.length, 0);
});

console.log(JSON.stringify({ sources: {
  SessionRecovery: createHash("sha256").update(sessionSource).digest("hex"),
  OAuthFeedback: createHash("sha256").update(oauthSource).digest("hex"),
  AccountPanel: createHash("sha256").update(accountSource).digest("hex"),
}, coverage: "Production handler/effect tones with synthetic status promises; no DOM, cookie jar, live authentication, or assistive-technology result." }));

test("actual keyed action and rendered button recover from A to B to A without clicking a disabled control", async () => {
  // Select instances using the real wrapper's React element type/key. The button
  // itself is the production JSX with its production derived busy expression.
  let current;
  const show = owner => {
    const element = identityContext.actionElement(owner);
    if (!current || current.element.type !== element.type || current.element.key !== element.key) {
      current?.h.unmount(); current = { element, owner, h: recoveryHarness(owner) };
    } else if (current.owner !== owner) { current.h.replace(owner); current.owner = owner; }
    return current;
  };
  const firstA = show("synthetic-account-a"), firstButton = firstA.h.button();
  assert.equal(firstButton.props.disabled, false);
  const old = firstButton.props.onClick();
  assert.equal(firstA.h.button().props.disabled, true, "A genuinely pending operation must remain disabled");
  assert.match(renderToStaticMarkup(firstA.h.button()), /\bdisabled=""/);
  const b = show("synthetic-account-b");
  assert.equal(b.h.button().props.disabled, false); assert.equal(b.h.calls.length, firstA.h === b.h ? 1 : 0);
  const returnedA = show("synthetic-account-a"), returnedButton = returnedA.h.button();
  firstA.h.calls[0].resolve({ ok: true, redirectTo: "/account?obsolete=1" }); await old;
  assert.deepEqual(firstA.h.navigations, []);
  assert.equal(returnedButton.props.disabled, false, "Returning to A must not revive its cancelled busy state");
  assert.doesNotMatch(renderToStaticMarkup(returnedButton), /\bdisabled=/);
  assert.equal(returnedA.element.key, "synthetic-account-a");
  assert.equal(returnedA.element.type.name, "SessionRecoveryAction");
  assert.equal(returnedA.element.props.accountId, "synthetic-account-a");
  assert.equal(returnedA.h.calls.length, 0, "Identity replacement must not send an automatic recovery POST");
  const retry = returnedButton.props.onClick();
  assert.equal(returnedA.h.calls.length, 1); assert.equal(returnedA.h.button().props.disabled, true);
  returnedA.h.calls[0].resolve({ ok: true, redirectTo: "/connect" }); await retry;
  assert.deepEqual(returnedA.h.navigations, [origin + "/connect"]); returnedA.h.unmount();
});

// Exercise the account panel's actual state defaults, read/mutation callbacks,
// and recovery JSX. Only the API transport is replaced with synthetic promises.
const accountComponent = accountTree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "AccountPanel");
const accountVariable = name => nodes(accountTree, node => ts.isVariableDeclaration(node) && node.name.getText(accountTree) === name)[0];
const accountFunction = name => nodes(accountTree, node => ts.isFunctionDeclaration(node) && node.name?.text === name)[0];
const accountStates = nodes(accountComponent, node => ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(accountTree) === "useState");
const accountRefs = nodes(accountComponent, node => ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(accountTree) === "useRef");
const accountErrors = nodes(accountComponent, node => ts.isJsxElement(node) && node.openingElement.tagName.getText(accountTree) === "div" && node.openingElement.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) && attribute.name.text === "className" && attribute.initializer?.text === "alert error"));
assert.equal(accountErrors.length, 1, "Render the production account recovery controls");
const accountCode = code([
  ...["record", "count"].map(name => "const " + accountVariable(name).getText(accountTree) + ";"),
  ...["parseAccount", "loadAccount"].map(name => accountFunction(name).getText(accountTree)),
  ...accountStates.map(node => "globalThis." + node.name.elements[0].name.getText(accountTree) + " = " + node.initializer.arguments[0].getText(accountTree) + ";"),
  ...accountRefs.map(node => "globalThis." + node.name.getText(accountTree) + " = { current: " + node.initializer.arguments[0].getText(accountTree) + " };"),
  "globalThis.refresh = " + accountVariable("refresh").initializer.arguments[0].getText(accountTree) + ";",
  "globalThis.returned = " + accountVariable("returned").initializer.getText(accountTree) + ";",
  "globalThis.mutate = " + accountFunction("mutate").getText(accountTree) + ";",
  "globalThis.recovery = () => error ? (" + accountErrors[0].getText(accountTree) + ") : null;",
].join("\n"));
function elementsOfType(element, type) {
  if (!React.isValidElement(element)) return [];
  return [...(element.type === type ? [element] : []), ...React.Children.toArray(element.props.children).flatMap(child => elementsOfType(child, type))];
}
const workspaceA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
function accountResponse(accountId = "synthetic-account-a", workspaceId = workspaceA) {
  return { ok: true, accountId, workspaceId, confirmedEmail: "synthetic@example.com", emailUpdateRequired: false, deleting: false, sessions: [], documents: [],
    usage: { storedResumeBytes: 0, jobs: 0, plans: 0, attempts: 0 }, limits: { maxStoredResumeBytes: 10485760, maxResumes: 5, maxJobs: 100, maxPlans: 100, maxAttempts: 100 } };
}
function accountHarness(expectedAccountId = "synthetic-account-a") {
  const calls = [], navigations = [];
  const context = {
    Error, AbortController, React, expectedAccountId, APIError: helpers.APIError, internalAuthRedirect: helpers.internalAuthRedirect, t: value => value,
    SignInOptions: () => React.createElement("div", { "data-sign-in": true }),
    document: { visibilityState: "visible" }, window: { location: { origin, assign: value => navigations.push(value), reload: () => navigations.push("reload") } },
    requestAPI(path, options) { const gate = deferred(); calls.push({ path, options, ...gate }); return gate.promise; },
  };
  for (const node of accountStates) {
    const [state, setter] = node.name.elements.map(element => element.name.getText(accountTree));
    context[setter] = value => { context[state] = typeof value === "function" ? value(context[state]) : value; };
  }
  vm.createContext(context); vm.runInContext(accountCode, context);
  return { calls, navigations, context, recovery: () => context.recovery(), buttons: () => elementsOfType(context.recovery(), "button"), links: () => elementsOfType(context.recovery(), "a") };
}
function assertAccountReload(h) {
  const links = h.links();
  assert.equal(links.length, 1, "An identity change needs an ordinary full-page navigation");
  assert.equal(links[0].props.href, "/account");
  assert.equal(links[0].props.children, "Reload sign-in");
  assert.equal(links[0].props.onClick, undefined, "Do not intercept the link with the stale account callback");
  assert.equal(h.buttons().length, 0, "Do not offer the same stale-identity status retry");
  assert.match(renderToStaticMarkup(h.recovery()), /href="\/account"[^>]*>Reload sign-in<\/a>/);
  assert.deepEqual(h.navigations, [], "The user chooses when to navigate");
}

test("actual account return hides account A and offers a full reload when the browser changes to B", async () => {
  const h = accountHarness(), opening = h.context.refresh();
  h.calls[0].resolve(accountResponse()); await opening;
  assert.equal(h.context.account.accountId, "synthetic-account-a");
  h.context.returned();
  assert.equal(h.context.account, null, "Hide the prior account before its return check finishes");
  h.calls[1].resolve(accountResponse("synthetic-account-b")); await flush();
  assert.equal(h.context.account, null); assert.match(h.context.error, /browser account changed/);
  assert.equal(h.context.loading, false); assertAccountReload(h); assert.equal(h.calls.length, 2);
  const fresh = accountHarness("synthetic-account-b"), reopened = fresh.context.refresh();
  fresh.calls[0].resolve(accountResponse("synthetic-account-b")); await reopened;
  assert.equal(fresh.context.account.accountId, "synthetic-account-b"); assert.equal(fresh.recovery(), null);
});

test("actual account mutations distinguish an account change from a recoverable workspace change", async t => {
  for (const failureCode of ["account_changed", "workspace_changed"]) await t.test(failureCode, async () => {
    const h = accountHarness(), opening = h.context.refresh(); h.calls[0].resolve(accountResponse()); await opening;
    h.context.deleteOpen = true; h.context.deleteWorkspaceId = workspaceA; h.context.confirmation = "DELETE";
    const pending = h.context.mutate("recover", "/api/account/uploads/recover", { expectedWorkspaceId: workspaceA });
    assert.equal(h.calls[1].path, "/api/account/uploads/recover"); assert.equal(h.calls[1].options.method, "POST");
    assert.deepEqual(structuredClone(h.calls[1].options.body), { expectedWorkspaceId: workspaceA });
    h.calls[1].reject(new helpers.APIError("Synthetic account or workspace change", 409, failureCode)); await pending;
    assert.equal(h.context.account, null); assert.equal(h.context.deleteOpen, false); assert.equal(h.context.deleteWorkspaceId, null); assert.equal(h.context.confirmation, "");
    assert.equal(h.context.busy, ""); assert.equal(h.calls.length, 2, "Do not replay a rejected mutation");
    if (failureCode === "account_changed") assertAccountReload(h);
    else { assert.equal(h.links().length, 0); assert.equal(h.buttons()[0].props.children, "Reload current status"); }
  });
});

test("actual account status retry still recovers a temporary failure for the same account", async () => {
  const h = accountHarness(), opening = h.context.refresh();
  h.calls[0].reject(new helpers.APIError("Synthetic temporary connection failure", 0, "network_unavailable")); await opening;
  assert.equal(h.links().length, 0); assert.equal(h.buttons().length, 1);
  const retry = h.buttons()[0]; assert.equal(retry.props.children, "Reload current status"); assert.equal(retry.props.disabled, false);
  retry.props.onClick(); assert.equal(h.calls.length, 2); assert.equal(h.buttons()[0].props.disabled, true);
  h.calls[1].resolve(accountResponse()); await flush();
  assert.equal(h.context.account.accountId, "synthetic-account-a"); assert.equal(h.context.error, ""); assert.equal(h.context.loading, false);
  assert.equal(h.recovery(), null); assert.deepEqual(h.navigations, []);
});

test("actual account recovery clears an old identity-change choice after same-account verification or sign-in expiry", async t => {
  for (const outcome of ["same-account", "expired-sign-in"]) await t.test(outcome, async () => {
    const h = accountHarness(), changed = h.context.refresh(); h.calls[0].resolve(accountResponse("synthetic-account-b")); await changed;
    assertAccountReload(h);
    h.context.returned();
    if (outcome === "same-account") h.calls[1].resolve(accountResponse());
    else h.calls[1].reject(new helpers.APIError("Synthetic sign-in expiry", 401, "sign_in_required"));
    await flush(); assert.equal(h.links().length, 0);
    if (outcome === "same-account") { assert.equal(h.context.account.accountId, "synthetic-account-a"); assert.equal(h.recovery(), null); }
    else { assert.equal(h.context.account, null); assert.equal(h.buttons().length, 0); assert.match(renderToStaticMarkup(h.recovery()), /data-sign-in="true"/); }
  });
});
