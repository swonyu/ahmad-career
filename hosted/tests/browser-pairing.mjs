import assert from 'node:assert/strict';
import test from 'node:test';
import { SERVICE_ORIGIN, parsePairingResponse, pairingSecondsRemaining } from '../app/connect/pairing-response.ts';

const response = (overrides = {}) => ({
  pairingCode: 'ABCD-EFGH-JKLM-NPQR',
  origin: SERVICE_ORIGIN,
  serverTime: '2026-11-17T00:00:00.000Z',
  expiresAt: '2026-11-17T00:05:00.000Z',
  ...overrides,
});

test('pairing validity is relative to the server, independent of the phone wall clock', () => {
  const issued = parsePairingResponse(response(), 500, 2500);
  assert.equal(pairingSecondsRemaining(issued, 2500), 298);
  // Identical server-relative lifetime remains correct when either clock is years away.
  const past = parsePairingResponse(response({ serverTime: '2021-01-01T12:00:00Z', expiresAt: '2021-01-01T12:05:00Z' }), 500, 2500);
  const future = parsePairingResponse(response({ serverTime: '2031-01-01T12:00:00Z', expiresAt: '2031-01-01T12:05:00Z' }), 500, 2500);
  assert.equal(past.deadline, issued.deadline);
  assert.equal(future.deadline, issued.deadline);
  assert.equal(pairingSecondsRemaining(issued, 300_499), 1);
  assert.equal(pairingSecondsRemaining(issued, 300_500), 0);
  assert.equal(pairingSecondsRemaining(issued, 900_000), 0);
  assert.equal(pairingSecondsRemaining(null, 0), 0);
});

test('delayed replies cannot extend validity or revive an expired code', () => {
  const delayed = parsePairingResponse(response(), 1000, 240_000);
  assert.equal(pairingSecondsRemaining(delayed, 240_000), 61);
  assert.equal(delayed.deadline, 301_000);
  assert.throws(() => parsePairingResponse(response(), 1000, 301_000), /expired before it arrived/);
  assert.throws(() => parsePairingResponse(response(), 1000, 401_000), /expired before it arrived/);
});

test('unverified codes, foreign origins, invalid clocks and excessive validity fail closed', () => {
  const invalid = [
    { pairingCode: 'ABCD-EFGH-IJKL-NPQR' }, { pairingCode: 'ABCD-EFGH-JKLM' },
    { pairingCode: null }, { origin: 'https://career-finder.example' },
    { origin: SERVICE_ORIGIN + '.example' }, { serverTime: undefined },
    { serverTime: 'not-a-time' }, { expiresAt: 'not-a-time' },
    { expiresAt: '2026-11-17T00:05:00.001Z' },
    { expiresAt: '2026-11-17T00:00:00Z' },
    { expiresAt: '2026-11-16T23:59:59Z' },
  ];
  for (const fields of invalid) assert.throws(() => parsePairingResponse(response(fields), 0, 1000), /could not be verified/);
  for (const [start, end] of [[1000, 999], [NaN, 1000], [0, Infinity], [-Infinity, 0]]) {
    assert.throws(() => parsePairingResponse(response(), start, end), /could not be verified/);
  }
});
