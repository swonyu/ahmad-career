import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// Execute callbacks and cleanup extracted from the actual production component.
// These are synthetic lifecycle tests, not a browser, provider, or cookie test.
const root = process.env.CAREER_HOSTED_TEST_ROOT ?? fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(root + '/package.json');
const ts = require('typescript');
const sourcePath = process.env.CAREER_SIGNOUT_SOURCE ?? root + '/app/components/SignOutButton.tsx';
const source = await readFile(sourcePath, 'utf8');
const tree = ts.createSourceFile('SignOutButton.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = (node, predicate) => { const result = []; function visit(value) { if (predicate(value)) result.push(value); ts.forEachChild(value, visit); } visit(node); return result; };
const clicks = nodes(tree, node => ts.isJsxAttribute(node) && node.name.text === 'onClick');
assert.equal(clicks.length, 1, 'one actual sign-out callback');
const click = clicks[0].initializer.expression.getText(tree);
const effects = nodes(tree, node => ts.isCallExpression(node) && node.expression.getText(tree) === 'useLayoutEffect').map(node => node.arguments[0].getText(tree));
const authSource = await readFile(root + '/app/components/provider-auth.ts', 'utf8');
const authTree = ts.createSourceFile('provider-auth.ts', authSource, ts.ScriptTarget.Latest, true);
const redirect = nodes(authTree, node => ts.isFunctionDeclaration(node) && node.name?.text === 'internalAuthRedirect')[0].getText(authTree).replace(/^export\s+/, '');
const code = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const compiled = code(redirect + '\nglobalThis.makeClick = accountId => (' + click + ');\nglobalThis.makeEffects = accountId => [' + effects.join(',') + '];');
console.log(JSON.stringify({ sourcePath, sourceSHA256: createHash('sha256').update(source).digest('hex'), scope: 'actual production callbacks; synthetic lifecycle and transport completions; no live accounts' }));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function harness(owner = 'synthetic-account-a') {
  const calls = [], navigations = [], updates = [];
  const window = new EventTarget(), document = new EventTarget();
  window.location = { origin: 'https://career.example', assign: value => navigations.push(value) };
  document.visibilityState = 'visible'; document.hasFocus = () => true;
  let state = { accountId: owner, busy: false, error: '' }, cleanups = [], action;
  const context = { URL, Error, AbortController, window, document,
    generation: { current: 0 }, pending: { current: null }, continuation: { current: null },
    requestAPI(path, options) { const gate = deferred(); calls.push({ path, options, ...gate }); return gate.promise; },
    setState(value) { state = structuredClone(value); updates.push(structuredClone(state)); },
    setBusy(value) { state = { ...state, busy: value }; updates.push(structuredClone(state)); },
    setError(value) { state = { ...state, error: value }; updates.push(structuredClone(state)); },
  };
  vm.createContext(context); vm.runInContext(compiled, context);
  const unmount = () => { for (const cleanup of cleanups) cleanup(); cleanups = []; };
  const mount = next => { unmount(); cleanups = context.makeEffects(next).map(effect => effect()).filter(value => typeof value === 'function'); action = context.makeClick(next); };
  mount(owner);
  return { calls, navigations, updates, window, document, context, click: () => action(), unmount, replace: mount, state: () => structuredClone(state) };
}

test('current sign-out sends the captured owner and follows only the approved same-origin destination', async () => {
  const h = harness(), pending = h.click();
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].path, '/api/auth/signout');
  assert.equal(h.calls[0].options.method, 'POST'); assert.deepEqual(structuredClone(h.calls[0].options.body), { expectedAccountId: 'synthetic-account-a' });
  h.calls[0].resolve({ ok: true, redirectTo: '/signout-with-chatgpt?return_to=%2Faccount' }); await pending;
  assert.deepEqual(h.navigations, ['https://career.example/signout-with-chatgpt?return_to=%2Faccount']); h.unmount();
});

test('repeated activation before a render does not send a second sign-out request', async () => {
  const h = harness(), first = h.click(), second = h.click(), count = h.calls.length;
  for (const request of h.calls) request.resolve({ ok: true, redirectTo: '/account' });
  await Promise.all([first, second]); assert.equal(count, 1); assert.equal(h.navigations.length, 1); h.unmount();
});

test('unmounted sign-out aborts and ignores late success and failure', async () => {
  for (const outcome of ['success', 'failure']) {
    const h = harness(), pending = h.click(), count = h.updates.length; h.unmount();
    if (outcome === 'success') h.calls[0].resolve({ ok: true, redirectTo: '/signout-with-chatgpt?return_to=%2Faccount' });
    else h.calls[0].reject(Error('Synthetic obsolete response'));
    await pending;
    assert.deepEqual(h.navigations, [], outcome); assert.equal(h.updates.length, count, outcome); assert.equal(h.calls[0].options.signal?.aborted, true, outcome);
  }
});

test('account replacement and cleanup replay keep the newer operation intact', async () => {
  for (const nextOwner of ['synthetic-account-a', 'synthetic-account-b']) {
    const h = harness(), old = h.click(); h.replace(nextOwner); const current = h.click(), count = h.updates.length;
    h.calls[0].resolve({ ok: true, redirectTo: '/account?obsolete=1' }); await old;
    assert.deepEqual(h.navigations, []); assert.equal(h.updates.length, count);
    assert.equal(h.calls[0].options.signal?.aborted, true); assert.equal(h.calls[1].options.signal?.aborted, false);
    const duplicate = h.click(); for (const extra of h.calls.slice(2)) extra.resolve({ ok: true, redirectTo: '/account?duplicate=1' }); await duplicate;
    assert.equal(h.calls.length, 2); assert.equal(h.calls[1].options.body.expectedAccountId, nextOwner);
    h.calls[1].resolve({ ok: true, redirectTo: '/phone' }); await current;
    assert.deepEqual(h.navigations, ['https://career.example/phone']); h.unmount();
  }
});

test('switching windows or hiding the page cancels pending navigation without an automatic replay', async () => {
  for (const event of ['blur', 'visibilitychange']) {
    const h = harness(), pending = h.click();
    if (event === 'blur') h.window.dispatchEvent(new Event('blur'));
    else { h.document.visibilityState = 'hidden'; h.document.dispatchEvent(new Event('visibilitychange')); }
    h.calls[0].resolve({ ok: true, redirectTo: '/signout-with-chatgpt?return_to=%2Faccount' }); await pending;
    assert.deepEqual(h.navigations, [], event); assert.equal(h.calls[0].options.signal?.aborted, true, event);
    assert.equal(h.calls.length, 1); assert.equal(h.state().busy, false); assert.match(h.state().error, /may have completed|could not be confirmed/); h.unmount();
  }
});

test('current failure is visible and retries only after another explicit activation', async () => {
  const h = harness(), first = h.click(); h.calls[0].reject(Error('Synthetic network interruption')); await first;
  assert.equal(h.state().busy, false); assert.equal(h.state().error, 'Synthetic network interruption'); assert.equal(h.calls.length, 1);
  const retry = h.click(); assert.equal(h.calls.length, 2); h.calls[1].resolve({ ok: true, redirectTo: '/account' }); await retry;
  assert.deepEqual(h.navigations, ['https://career.example/account']); h.unmount();
});

test('a malformed or foreign redirect cannot navigate the signed-in page', async () => {
  const h = harness(), pending = h.click(); h.calls[0].resolve({ ok: true, redirectTo: 'https://untrusted.example/' }); await pending;
  assert.deepEqual(h.navigations, []); assert.equal(h.state().busy, false); assert.match(h.state().error, /could not be verified/); h.unmount();
});

test('a confirmed response keeps an explicit navigation continuation without posting again', async () => {
  const h = harness(), first = h.click();
  h.calls[0].resolve({ ok: true, redirectTo: '/signout-with-chatgpt?return_to=%2Fconnect' }); await first;
  assert.equal(h.state().busy, false); assert.equal(h.state().next, 'continue');
  await h.click(); await h.click();
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.navigations, Array(3).fill('https://career.example/signout-with-chatgpt?return_to=%2Fconnect'));
  h.unmount();
});

test('blur or page hiding after confirmation discards the platform redirect and checks the current account without a second post', async () => {
  for (const event of ['blur', 'visibilitychange']) {
    const h = harness(), first = h.click();
    h.calls[0].resolve({ ok: true, redirectTo: '/signout-with-chatgpt?return_to=%2Fconnect' }); await first;
    if (event === 'blur') h.window.dispatchEvent(new Event('blur'));
    else { h.document.visibilityState = 'hidden'; h.document.dispatchEvent(new Event('visibilitychange')); }
    assert.equal(h.state().busy, false); assert.equal(h.state().next, 'account');
    await h.click(); assert.equal(h.calls.length, 1);
    assert.equal(h.navigations.at(-1), 'https://career.example/account'); h.unmount();
  }
});

test('an uncertain interrupted request offers account checking rather than replaying sign-out', async () => {
  const h = harness(), first = h.click(); h.window.dispatchEvent(new Event('blur'));
  h.calls[0].resolve({ ok: true, redirectTo: '/signout-with-chatgpt?return_to=%2Fconnect' }); await first;
  assert.equal(h.state().next, 'account'); await h.click();
  assert.equal(h.calls.length, 1); assert.deepEqual(h.navigations, ['https://career.example/account']); h.unmount();
});

test('all sign-out continuation and uncertainty messages have Arabic translations', async () => {
  const catalog = JSON.parse(await readFile(process.env.CAREER_SIGNOUT_MESSAGES ?? root + '/app/i18n/messages.ar.json', 'utf8'));
  for (const key of ['Sign-out may have completed. Check your current account before trying again.', 'Continue signing out', 'Check current account', 'Your sign-out request was confirmed. Continue to finish signing out.']) {
    assert.equal(typeof catalog[key], 'string', key); assert.match(catalog[key], /[\u0600-\u06ff]/, key); assert.notEqual(catalog[key], key);
  }
});
