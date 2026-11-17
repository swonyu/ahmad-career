import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Bundle the production readers together so the phone reader's extensionless
// import uses the same APIError class. No replacement reader or live service.
const bundle = await build({
  stdin: {
    contents: 'export { APIError, readAPI, requestAPI } from "./app/components/api.ts"; export { phoneAPI } from "./app/phone/api.ts";',
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
    sourcefile: 'frontend-body-cleanup.ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { APIError, readAPI, requestAPI, phoneAPI } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text + '\n//# sourceURL=career-frontend-production.mjs').toString('base64')
);

const clients = [
  { name: 'account', limit: 256 * 1024, run: options => requestAPI('/api/account/pairing', { method: 'POST', body: {}, ...options }) },
  { name: 'phone', limit: 12 * 1024 * 1024, run: options => phoneAPI('/api/phone/profile', { method: 'PUT', body: {}, ...options }) },
];

function installFetch(t, implementation) {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    requests.push({ path, options });
    return implementation(path, options);
  });
  return requests;
}

function controlledBody(bytes, { mode = 'pending', contentType = 'application/json', status = 200, close = false } = {}) {
  let cancellations = 0, release;
  const completion = new Promise(resolve => { release = resolve; });
  const response = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      if (close) controller.close();
    },
    cancel() {
      cancellations++;
      if (mode === 'pending') return completion;
      if (mode === 'rejected') return Promise.reject(new Error('Synthetic cancellation failure'));
    },
  }), { status, headers: contentType === null ? {} : { 'content-type': contentType } });
  return {
    response, cancellations: () => cancellations, release,
    async dispose() {
      release();
      if (!response.body.locked) await response.body.cancel().catch(() => {});
    },
  };
}

async function assertDrained(response) {
  assert.equal(response.body.locked, false, 'A completed reader must release its lock');
  const reader = response.body.getReader();
  try { assert.equal((await reader.read()).done, true, 'A finite response must be fully consumed'); }
  finally { reader.releaseLock(); }
}

for (const client of clients) for (const mode of ['pending', 'rejected']) {
  test(`${client.name} rejects an oversized body without waiting for ${mode} cleanup`, async t => {
    const fixture = controlledBody(new Uint8Array(client.limit + 1), { mode });
    const requests = installFetch(t, () => fixture.response);
    let outcome;
    const work = client.run().then(value => { outcome = { value }; }, error => { outcome = { error }; });
    try {
      await nextTurn();
      assert.equal(fixture.cancellations(), 1, 'An unread oversized body must be cancelled once');
      assert.ok(outcome, 'The invalid-response result must not wait for cancellation to finish');
      assert.ok(outcome.error instanceof APIError);
      assert.equal(outcome.error.code, 'invalid_response');
      assert.equal(outcome.error.status, 200);
      assert.equal(outcome.error.message.includes('Synthetic cancellation'), false);
      assert.equal(fixture.response.body.locked, false, 'The rejected reader must release its lock');
      assert.equal(requests.length, 1, 'A rejected mutation must not be retried');
    } finally {
      fixture.release();
      await work;
      await fixture.dispose();
    }
  });
}

for (const mode of ['pending', 'rejected']) {
  test(`phone rejects unverified response headers despite ${mode} cleanup`, async t => {
    const fixture = controlledBody(new TextEncoder().encode('private synthetic HTML'), {
      mode, contentType: mode === 'pending' ? 'text/html' : null, status: 503,
    });
    const requests = installFetch(t, () => fixture.response);
    let outcome;
    const work = phoneAPI('/api/phone/workspace').then(value => { outcome = { value }; }, error => { outcome = { error }; });
    try {
      await nextTurn();
      assert.ok(outcome, 'A header rejection must not wait for body cancellation');
      assert.ok(outcome.error instanceof APIError);
      assert.equal(outcome.error.code, 'invalid_response');
      assert.equal(outcome.error.status, 503);
      assert.equal(outcome.error.message.includes('private synthetic'), false);
      assert.equal(fixture.cancellations(), 1, 'A header-rejected body must be cancelled');
      assert.equal(fixture.response.body.locked, false);
      assert.equal(requests.length, 1);
    } finally {
      fixture.release();
      await work;
      await fixture.dispose();
    }
  });
}

for (const client of clients) {
  test(`${client.name} drains finite success and error responses and permits a later explicit request`, async t => {
    const cases = [
      { text: '{"ok":true,"label":"مرحبا"}', status: 200, expected: { ok: true, label: 'مرحبا' } },
      { text: '{"ok":false,"error":{"code":"workspace_changed","message":"Refresh the current workspace."}}', status: 409, code: 'workspace_changed' },
      { text: '{"private synthetic invalid JSON"', status: 200, code: 'invalid_response' },
      { text: '{"ok":true,"recovered":true}', status: 200, expected: { ok: true, recovered: true } },
    ];
    const fixtures = cases.map(item => {
      const bytes = new TextEncoder().encode(item.text);
      let cancellations = 0;
      const response = new Response(new ReadableStream({
        start(controller) {
          // Split a multi-byte character as well as ordinary JSON across chunks.
          for (let offset = 0; offset < bytes.length; offset += 3) controller.enqueue(bytes.slice(offset, offset + 3));
          controller.close();
        },
        cancel() { cancellations++; },
      }), { status: item.status, headers: { 'content-type': 'application/json; charset=utf-8' } });
      return { response, cancellations: () => cancellations };
    });
    const queue = [...fixtures];
    const requests = installFetch(t, () => {
      const fixture = queue.shift();
      assert.ok(fixture, 'The client must not issue an extra automatic request');
      return fixture.response;
    });
    for (const [index, item] of cases.entries()) {
      if (item.expected) assert.deepEqual(await client.run(), item.expected);
      else await assert.rejects(client.run(), error =>
        error instanceof APIError && error.code === item.code &&
        error.status === item.status && !error.message.includes('private synthetic')
      );
      await assertDrained(fixtures[index].response);
      assert.equal(fixtures[index].cancellations(), 0, 'A fully consumed response needs no cancellation');
      assert.equal(requests.length, index + 1);
    }
    assert.equal(queue.length, 0);
  });

  for (const failure of ['caller abort', 'timeout', 'read failure']) {
    test(`${client.name} releases a failed body read while preserving ${failure} semantics`, async t => {
      let bodyController, requestSignal;
      const caller = new AbortController();
      const response = new Response(new ReadableStream({
        start(controller) { bodyController = controller; },
      }), { headers: { 'content-type': 'application/json' } });
      if (failure === 'timeout' && client.name === 'phone') {
        const originalTimer = globalThis.setTimeout;
        t.mock.method(globalThis, 'setTimeout', (fn, delay, ...args) =>
          originalTimer(fn, delay === 30_000 ? 20 : delay, ...args)
        );
      }
      const requests = installFetch(t, (_, options) => {
        requestSignal = options.signal;
        requestSignal.addEventListener('abort', () =>
          bodyController.error(new DOMException('Synthetic transport aborted', 'AbortError')), { once: true }
        );
        return response;
      });
      const work = client.run({ signal: caller.signal, ...(failure === 'timeout' ? { timeoutMs: 20 } : {}) });
      // Attach rejection handling before triggering a stream failure.
      const result = assert.rejects(work, error => failure === 'caller abort'
        ? error.name === 'AbortError'
        : error instanceof APIError && error.code === (failure === 'timeout' ? 'request_timeout' : 'network_unavailable') &&
          !error.message.includes('private synthetic'));
      if (failure !== 'timeout') {
        await nextTurn();
        if (failure === 'caller abort') caller.abort();
        else bodyController.error(new Error('private synthetic transport detail'));
      }
      await result;
      await nextTurn(); // Also expose an accidentally unhandled cleanup rejection.
      assert.equal(response.body.locked, false);
      assert.equal(requests.length, 1, 'A failed read must never replay the mutation');
      assert.equal(requestSignal.aborted, failure !== 'read failure');
    });
  }
}

test('the standalone account reader retains invalid_response when cancellation rejects', async () => {
  const fixture = controlledBody(new Uint8Array(256 * 1024 + 1), { mode: 'rejected' });
  try {
    await assert.rejects(readAPI(fixture.response), error =>
      error instanceof APIError && error.code === 'invalid_response' && error.status === 200
    );
    await nextTurn();
    assert.equal(fixture.cancellations(), 1);
    assert.equal(fixture.response.body.locked, false);
  } finally { await fixture.dispose(); }
});
