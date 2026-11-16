import assert from 'node:assert/strict';
import test from 'node:test';
import { APIError, readAPI, requestAPI } from '../app/components/api.ts';

test('browser account transport keeps mutations bounded and explicit', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let requests = [];
  const install = implementation => {
    requests = [];
    globalThis.fetch = async (path, options) => { requests.push({ path, options }); return implementation(path, options); };
  };

  await t.test('successful writes preserve same-origin authentication and never redirect', async () => {
    install(() => Response.json({ ok: true, pairingCode: 'synthetic' }));
    const data = await requestAPI('/api/account/pairing', { method: 'POST', body: {} });
    assert.equal(data.pairingCode, 'synthetic');
    assert.equal(requests.length, 1);
    assert.deepEqual({ method: requests[0].options.method, credentials: requests[0].options.credentials, redirect: requests[0].options.redirect, cache: requests[0].options.cache, body: requests[0].options.body }, { method: 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store', body: '{}' });
    assert.equal(new Headers(requests[0].options.headers).has('Authorization'), false);
  });
  await t.test('expired sessions remain distinguishable from ordinary network errors', async () => {
    install(() => Response.json({ ok: false, error: { code: 'sign_in_required', message: 'Sign in again.' } }, { status: 401 }));
    await assert.rejects(requestAPI('/api/account'), error => error instanceof APIError && error.status === 401 && error.code === 'sign_in_required');
    assert.equal(requests.length, 1);
  });
  await t.test('a failed deletion is never silently retried or reported successful', async () => {
    install(() => Response.json({ ok: false, error: { code: 'deletion_pending', message: 'Erasure is pending.' } }, { status: 503 }));
    await assert.rejects(requestAPI('/api/account', { method: 'DELETE', body: { confirmation: 'DELETE' } }), error => error instanceof APIError && error.code === 'deletion_pending');
    assert.equal(requests.length, 1);
  });
  await t.test('an unconfirmed 200 response cannot become a successful mutation', async () => {
    install(() => Response.json({ ok: false, error: { code: 'not_finished', message: 'Check the current state.' } }));
    await assert.rejects(requestAPI('/api/account/uploads/recover', { method: 'POST', body: {} }), error => error.code === 'not_finished');
    assert.equal(requests.length, 1);
  });
  await t.test('malformed and non-object responses are rejected without exposing their content', async () => {
    for (const body of ['<html>private debug detail</html>', '[]', 'null']) {
      install(() => new Response(body));
      await assert.rejects(requestAPI('/api/account'), error => error.code === 'invalid_response' && !error.message.includes('private debug'));
    }
  });
  await t.test('a response larger than the browser record budget is cancelled', async () => {
    let cancelled = false;
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(256 * 1024 + 1)); }, cancel() { cancelled = true; } });
    await assert.rejects(readAPI(new Response(stream)), error => error.code === 'invalid_response');
    assert.equal(cancelled, true);
  });
  await t.test('a stalled request times out once without replaying the write', async () => {
    install((_, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })));
    await assert.rejects(requestAPI('/api/account/pairing', { method: 'POST', body: {}, timeoutMs: 20 }), error => error.code === 'request_timeout');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.signal.aborted, true);
  });
  await t.test('leaving a page cancels its pending read without a retry', async () => {
    install((_, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })));
    const controller = new AbortController();
    const result = requestAPI('/api/account', { signal: controller.signal });
    controller.abort();
    await assert.rejects(result, error => error.name === 'AbortError');
    assert.equal(requests.length, 1);
  });
  await t.test('an already cancelled page never starts a request', async () => {
    install(() => Response.json({ ok: true }));
    const controller = new AbortController(); controller.abort();
    await assert.rejects(requestAPI('/api/account', { signal: controller.signal }), error => error.name === 'AbortError');
    assert.equal(requests.length, 0);
  });
  await t.test('external or non-API destinations are rejected before sending credentials', async () => {
    install(() => Response.json({ ok: true }));
    for (const path of ['https://example.com/api/account', '//example.com/api/account', '/signin-with-chatgpt', '/api/../account']) await assert.rejects(requestAPI(path));
    assert.equal(requests.length, 0);
  });
});
