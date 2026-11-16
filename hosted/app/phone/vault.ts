import { PHONE_SCHEMA, parseSnapshot } from "./model";
import type { PhoneSnapshot } from "./model";

// Personal drafts are never written to localStorage or a service-worker cache.
// The opaque key and authenticated ciphertext commit together in one IDB row.
const DATABASE_NAME = "career-finder-phone-vault";
const STORE_NAME = "snapshots";
const STORAGE_VERSION = 1;
const MAX_PLAIN_BYTES = 20 * 1024 * 1024;
const MAX_RECOVERY_BYTES = 64 * 1024 * 1024;
const DATABASE_TIMEOUT_MS = 12_000;
const AAD_DOMAIN = "Career Finder private phone draft";

export type PhoneVaultErrorCode = "unavailable" | "storage_full" | "changed_elsewhere" | "damaged" | "unsupported" | "invalid_scope" | "invalid_snapshot" | "too_large" | "reset_pending";

export class PhoneVaultError extends Error {
  readonly code: PhoneVaultErrorCode;
  constructor(code: PhoneVaultErrorCode, message: string) {
    super(message);
    this.name = "PhoneVaultError";
    this.code = code;
  }
}

type StoredEnvelope = {
  storageVersion: number;
  payloadSchema: number;
  scope: string;
  envelopeId: string;
  updatedAt: string;
  key: CryptoKey;
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
};
type ResetMarker = { storageVersion: number; scope: string; envelopeId: string; updatedAt: string; reset: true };

export type PhoneVaultEntry = { exists: false } | { exists: true; value: unknown };
export type PhoneVaultMetadata = { scope: string; updatedAt: string };

/** A small transaction port makes the actual crypto and concurrency policy testable. */
export interface PhoneVaultPort {
  read(scope: string): Promise<PhoneVaultEntry>;
  compareAndSet(scope: string, expectedId: string | null, value: unknown): Promise<boolean>;
  /** Replace this scope with a revision marker, dropping its key and all personal content. */
  remove(scope: string, marker: unknown): Promise<void>;
  list(prefix: string): Promise<PhoneVaultMetadata[]>;
}

export interface PhoneVault {
  loadPhoneSnapshot(scope: string): Promise<PhoneSnapshot | null>;
  savePhoneSnapshot(scope: string, snapshot: PhoneSnapshot): Promise<void>;
  exportPhoneSnapshot(scope: string): Promise<string>;
  removePhoneSnapshot(scope: string): Promise<void>;
  listPhoneSnapshots(prefix: string): Promise<PhoneVaultMetadata[]>;
}

function fail(code: PhoneVaultErrorCode, message: string): never { throw new PhoneVaultError(code, message); }
function changed(): never { return fail("changed_elsewhere", "This draft changed in another tab. Reload the saved draft before saving again. Your edits are still on this screen."); }
function damaged(): never { return fail("damaged", "This saved draft could not be opened safely. It was kept unchanged. Export it for recovery, or explicitly remove this browser's saved draft before starting again."); }
function unsupported(): never { return fail("unsupported", "This saved draft uses a newer format. It was kept unchanged. Update Career Finder or export it for recovery."); }

function storageError(error: unknown): PhoneVaultError {
  if (error instanceof PhoneVaultError) return error;
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  if (name === "QuotaExceededError") return new PhoneVaultError("storage_full", "This browser has no room to save your draft. Free some device storage, then try again. Your edits are still on this screen.");
  if (name === "VersionError") return new PhoneVaultError("unsupported", "This browser's saved drafts use a newer format. Update Career Finder before opening them. The saved data was kept unchanged.");
  return new PhoneVaultError("unavailable", "This browser could not save or open private drafts. Allow browser storage and try again. Keep this page open so you do not lose unsaved edits.");
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function accountPrefix(value: string): boolean {
  const match = /^account:([^:]+):$/.exec(value);
  if (!match || value.length > 560) return false;
  try {
    const account = decodeURIComponent(match[1]);
    return account.length > 0 && !/[\x00-\x1f\x7f-\x9f]/u.test(account) && encodeURIComponent(account) === match[1];
  } catch { return false; }
}

function validScope(scope: unknown): scope is string {
  if (scope === "guest") return true;
  if (typeof scope !== "string" || scope.length > 600) return false;
  const index = scope.lastIndexOf(":");
  if (index < 0 || !accountPrefix(scope.slice(0, index + 1))) return false;
  const workspace = scope.slice(index + 1);
  return workspace === "new" || /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(workspace);
}

function checkScope(scope: unknown): asserts scope is string {
  if (!validScope(scope)) fail("invalid_scope", "Choose a confirmed account and workspace before opening this draft.");
}

function checkPrefix(prefix: unknown): asserts prefix is string {
  if (typeof prefix !== "string" || prefix !== "guest" && !accountPrefix(prefix)) fail("invalid_scope", "Choose one confirmed account before listing its saved drafts.");
}

function inPrefix(scope: string, prefix: string): boolean { return prefix === "guest" ? scope === "guest" : scope.startsWith(prefix); }
function timestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length !== 24) return false;
  const time = new Date(value);
  return Number.isFinite(time.valueOf()) && time.toISOString() === value;
}

function envelopeId(value: unknown): string | null {
  const row = object(value);
  return row && typeof row.envelopeId === "string" && /^[a-f0-9]{32}$/.test(row.envelopeId) ? row.envelopeId : null;
}

function checkedReset(value: unknown, scope: string): ResetMarker | null {
  const row = object(value);
  if (row?.reset !== true) return null;
  if (row.scope !== scope || !envelopeId(row) || !timestamp(row.updatedAt)) return damaged();
  if (row.storageVersion !== STORAGE_VERSION || Object.keys(row).some(key => !["storageVersion", "scope", "envelopeId", "updatedAt", "reset"].includes(key))) return unsupported();
  return row as ResetMarker;
}

function isReset(value: unknown, scope: string): boolean {
  try { return checkedReset(value, scope) !== null; } catch { return false; }
}

function keyLooksValid(value: unknown): value is CryptoKey {
  const key = object(value), algorithm = object(key?.algorithm);
  return Boolean(key && key.type === "secret" && key.extractable === false && algorithm?.name === "AES-GCM" && algorithm.length === 256 && Array.isArray(key.usages) && key.usages.length === 2 && key.usages.includes("encrypt") && key.usages.includes("decrypt"));
}

function buffer(value: unknown): value is ArrayBuffer {
  // IDB structured clone returns buffers in this realm. No SharedArrayBuffer is accepted.
  return value instanceof ArrayBuffer;
}

function checkedEnvelope(value: unknown, scope: string, allowFuture = false): StoredEnvelope {
  const row = object(value);
  if (!row || row.scope !== scope) return damaged();
  if (!Number.isSafeInteger(row.storageVersion) || !Number.isSafeInteger(row.payloadSchema) || Number(row.storageVersion) < 1 || Number(row.payloadSchema) < 1) return damaged();
  if (!allowFuture && (row.storageVersion !== STORAGE_VERSION || row.payloadSchema !== PHONE_SCHEMA)) return unsupported();
  if (!envelopeId(row) || !timestamp(row.updatedAt) || !keyLooksValid(row.key) || !buffer(row.iv) || row.iv.byteLength !== 12 || !buffer(row.ciphertext) || row.ciphertext.byteLength < 17 || row.ciphertext.byteLength > MAX_PLAIN_BYTES + 16) return damaged();
  if (!allowFuture && Object.keys(row).some(key => !["storageVersion", "payloadSchema", "scope", "envelopeId", "updatedAt", "key", "iv", "ciphertext"].includes(key))) return unsupported();
  return row as StoredEnvelope;
}

function aad(row: Pick<StoredEnvelope, "storageVersion" | "payloadSchema" | "scope" | "envelopeId" | "updatedAt">): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify([AAD_DOMAIN, row.storageVersion, row.payloadSchema, row.scope, row.envelopeId, row.updatedAt]));
}

// Schema defaults may add fields, but a reader must never silently drop future fields.
function preservesInput(original: unknown, parsed: unknown): boolean {
  if (original === undefined) return true;
  if (Array.isArray(original)) return Array.isArray(parsed) && original.length === parsed.length && original.every((value, index) => preservesInput(value, parsed[index]));
  if (original && typeof original === "object") {
    const output = object(parsed);
    return Boolean(output && Object.entries(original).every(([key, value]) => value === undefined || Object.hasOwn(output, key) && preservesInput(value, output[key])));
  }
  return Object.is(original, parsed);
}

function parsePreserving(value: unknown, scope: string): PhoneSnapshot {
  const parsed = parseSnapshot(value, scope);
  if (!preservesInput(value, parsed)) return unsupported();
  return parsed;
}

function captureSnapshot(value: PhoneSnapshot, scope: string): Uint8Array<ArrayBuffer> {
  let parsed: PhoneSnapshot;
  try { parsed = parsePreserving(value, scope); }
  catch (error) {
    if (error instanceof PhoneVaultError) throw error;
    return fail("invalid_snapshot", "This draft contains unsupported or conflicting data. Your previous saved draft was kept. Review your edits before trying again.");
  }
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    const serialized = JSON.stringify(parsed);
    // JSON must not silently erase a non-JSON value carried by a future passthrough field.
    if (!preservesInput(parsed, JSON.parse(serialized))) return fail("invalid_snapshot", "This draft contains data that cannot be saved safely. Your previous saved draft was kept.");
    bytes = new TextEncoder().encode(serialized);
  }
  catch { return fail("invalid_snapshot", "This draft could not be saved safely. Your previous saved draft was kept."); }
  if (bytes.byteLength > MAX_PLAIN_BYTES) return fail("too_large", "This draft is too large to save in this browser. Export a copy, then remove older saved jobs or notes and try again.");
  return bytes;
}

function browserCrypto(): Crypto {
  const implementation = globalThis.crypto;
  if (!implementation?.subtle || typeof implementation.getRandomValues !== "function") fail("unavailable", "Private draft storage needs a secure HTTPS browser with encryption support. Keep this page open to protect unsaved edits.");
  return implementation;
}

/** No browser globals are accessed until an operation is requested (safe during SSR). */
export function createIndexedDBPhoneVaultPort(factory?: IDBFactory): PhoneVaultPort {
  let opening: Promise<IDBDatabase> | undefined;
  function database(): Promise<IDBDatabase> {
    if (opening) return opening;
    const indexedDB = factory ?? globalThis.indexedDB;
    if (!indexedDB) return Promise.reject(storageError(null));
    const pending = new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => finish(storageError(null)), DATABASE_TIMEOUT_MS);
      function finish(error?: unknown, db?: IDBDatabase) {
        if (settled) { db?.close(); return; }
        settled = true;
        clearTimeout(timer);
        if (error) reject(storageError(error)); else if (db) resolve(db);
      }
      let request: IDBOpenDBRequest;
      try { request = indexedDB.open(DATABASE_NAME, STORAGE_VERSION); }
      catch (error) { finish(error); return; }
      request.onblocked = () => finish(new PhoneVaultError("unavailable", "Close other Career Finder tabs and try again so this browser can open your saved drafts. Your existing data was kept."));
      request.onerror = () => finish(request.error);
      request.onupgradeneeded = event => {
        if (event.oldVersion === 0) request.result.createObjectStore(STORE_NAME);
        else request.transaction?.abort();
      };
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.close(); finish(new PhoneVaultError("unsupported", "This browser's saved drafts use an unfamiliar format. They were kept unchanged. Update Career Finder before opening them.")); return;
        }
        db.onversionchange = () => { db.close(); if (opening === pending) opening = undefined; };
        finish(undefined, db);
      };
    });
    opening = pending;
    void pending.catch(() => { if (opening === pending) opening = undefined; });
    return pending;
  }

  async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
    const db = await database();
    return new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        try { tx = db.transaction(STORE_NAME, mode, mode === "readwrite" ? { durability: "strict" } : undefined); }
        catch (error) { if (error instanceof TypeError) tx = db.transaction(STORE_NAME, mode); else throw error; }
      } catch (error) { opening = undefined; reject(storageError(error)); return; }
      let value: T, hasResult = false, settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error || !hasResult) reject(storageError(error)); else resolve(value);
      };
      const timer = setTimeout(() => { try { tx.abort(); } catch { /* Already closed. */ } finish(storageError(null)); }, DATABASE_TIMEOUT_MS);
      tx.oncomplete = () => finish();
      tx.onabort = () => finish(tx.error ?? storageError(null));
      // Request errors cause the transaction to abort. Wait for that result.
      tx.onerror = () => undefined;
      try { run(tx.objectStore(STORE_NAME), result => { value = result; hasResult = true; }); }
      catch (error) { try { tx.abort(); } catch { /* Already closed. */ } finish(error); }
    });
  }

  function readIn(store: IDBObjectStore, scope: string, result: (entry: PhoneVaultEntry) => void) {
    const valueRequest = store.get(scope), keyRequest = store.getKey(scope);
    let gotValue = false, gotKey = false;
    const finish = () => { if (gotValue && gotKey) result(keyRequest.result === undefined ? { exists: false } : { exists: true, value: valueRequest.result }); };
    valueRequest.onsuccess = () => { gotValue = true; finish(); };
    keyRequest.onsuccess = () => { gotKey = true; finish(); };
  }

  return {
    read: scope => transaction("readonly", (store, result) => readIn(store, scope, result)),
    compareAndSet: (scope, expectedId, value) => transaction("readwrite", (store, result) => {
      readIn(store, scope, current => {
        const matches = expectedId === null ? !current.exists : current.exists && envelopeId(current.value) === expectedId;
        if (!matches) { result(false); return; }
        // There is no await between the read and write in this transaction.
        const request = store.put(value, scope);
        request.onsuccess = () => result(true);
      });
    }),
    remove: (scope, marker) => transaction("readwrite", (store, result) => { const request = store.put(marker, scope); request.onsuccess = () => result(undefined); }),
    list: prefix => transaction("readonly", (store, result) => {
      const rows: PhoneVaultMetadata[] = [];
      const range = typeof IDBKeyRange === "undefined" ? undefined : prefix === "guest" ? IDBKeyRange.only(prefix) : IDBKeyRange.bound(prefix, prefix + "\uffff");
      const request = store.openCursor(range);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { result(rows); return; }
        if (typeof cursor.key === "string" && validScope(cursor.key) && inPrefix(cursor.key, prefix) && !isReset(cursor.value, cursor.key)) {
          const row = object(cursor.value);
          rows.push({ scope: cursor.key, updatedAt: timestamp(row?.updatedAt) ? row.updatedAt : "" });
        }
        cursor.continue();
      };
    }),
  };
}

function base64(bytes: Uint8Array): string {
  let encoded = "";
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  // Avoid a spread/apply over multi-megabyte CV data.
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index], b = bytes[index + 1], c = bytes[index + 2];
    encoded += alphabet[a >> 2] + alphabet[(a & 3) << 4 | (b ?? 0) >> 4] + (b === undefined ? "=" : alphabet[(b & 15) << 2 | (c ?? 0) >> 6]) + (c === undefined ? "=" : alphabet[c & 63]);
    if (encoded.length >= 16_384) { chunks.push(encoded); encoded = ""; }
  }
  chunks.push(encoded);
  return chunks.join("");
}

/** Preserve unfamiliar fields in a recovery export; opaque keys remain in IDB. */
function recoveryValue(value: unknown): unknown {
  const seen = new WeakSet<object>();
  let bytes = 0, nodes = 0;
  function visit(item: unknown, depth: number): unknown {
    if (++nodes > 100_000 || depth > 24) return fail("too_large", "This recovery export is too large to prepare safely. The saved draft was kept unchanged.");
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "string") { bytes += new TextEncoder().encode(item).byteLength; if (bytes > MAX_RECOVERY_BYTES) return fail("too_large", "This recovery export is too large. The saved draft was kept unchanged."); return item; }
    if (typeof item === "number") return Number.isFinite(item) ? item : { unsupportedNumber: String(item) };
    if (typeof item === "undefined") return { unsupportedValue: "undefined" };
    if (typeof item === "bigint") return { unsupportedBigInt: item.toString() };
    if (typeof item !== "object") return { unsupportedValue: typeof item };
    if (buffer(item) || ArrayBuffer.isView(item)) {
      const data = buffer(item) ? new Uint8Array(item) : new Uint8Array(item.buffer, item.byteOffset, item.byteLength);
      bytes += Math.ceil(data.byteLength / 3) * 4;
      if (bytes > MAX_RECOVERY_BYTES) return fail("too_large", "This recovery export is too large. The saved draft was kept unchanged.");
      return { encoding: "base64", data: base64(data) };
    }
    if (keyLooksValid(item)) return { opaqueBrowserKey: true, extractable: false, algorithm: "AES-GCM", bits: 256, notice: "The key remains in this browser. This file cannot restore the encrypted data in another browser." };
    if (seen.has(item)) return { unsupportedValue: "circular reference" };
    seen.add(item);
    if (Array.isArray(item)) return item.map(child => visit(child, depth + 1));
    const output: Record<string, unknown> = Object.create(null);
    for (const [key, child] of Object.entries(item)) { bytes += key.length; output[key] = visit(child, depth + 1); }
    return output;
  }
  return visit(value, 0);
}

export function createPhoneVault(options: { port?: PhoneVaultPort; crypto?: Crypto; now?: () => Date } = {}): PhoneVault {
  const port = options.port ?? createIndexedDBPhoneVaultPort();
  const expected = new Map<string, string | null>();
  const blocked = new Map<string, PhoneVaultError>();
  const queues = new Map<string, Promise<void>>();
  const epochs = new Map<string, number>();
  const crypto = () => options.crypto ?? browserCrypto();
  const now = options.now ?? (() => new Date());

  function queue<T>(scope: string, action: () => Promise<T>): Promise<T> {
    const preceding = queues.get(scope) ?? Promise.resolve();
    const task = preceding.then(action);
    const tail = task.then(() => undefined, () => undefined);
    queues.set(scope, tail);
    void tail.then(() => { if (queues.get(scope) === tail) queues.delete(scope); });
    return task;
  }

  async function read(scope: string): Promise<PhoneVaultEntry> {
    try { return await port.read(scope); } catch (error) { throw storageError(error); }
  }

  async function decrypt(row: StoredEnvelope): Promise<unknown> {
    let bytes: ArrayBuffer;
    try { bytes = await crypto().subtle.decrypt({ name: "AES-GCM", iv: row.iv, additionalData: aad(row), tagLength: 128 }, row.key, row.ciphertext); }
    catch (error) { if (error instanceof PhoneVaultError) throw error; return damaged(); }
    if (bytes.byteLength > MAX_PLAIN_BYTES) return damaged();
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { return damaged(); }
  }

  async function decode(value: unknown, scope: string): Promise<{ snapshot: PhoneSnapshot; row: StoredEnvelope }> {
    const row = checkedEnvelope(value, scope);
    const plain = await decrypt(row);
    try { return { snapshot: parsePreserving(plain, scope), row }; }
    catch (error) { if (error instanceof PhoneVaultError) throw error; return damaged(); }
  }

  return {
    async loadPhoneSnapshot(scope) {
      checkScope(scope);
      return queue(scope, async () => {
        const entry = await read(scope);
        if (!entry.exists) { expected.set(scope, null); blocked.delete(scope); return null; }
        try {
          const reset = checkedReset(entry.value, scope);
          if (reset) { expected.set(scope, reset.envelopeId); blocked.delete(scope); return null; }
          const result = await decode(entry.value, scope);
          expected.set(scope, result.row.envelopeId);
          blocked.delete(scope);
          return result.snapshot;
        } catch (error) {
          const failure = error instanceof PhoneVaultError ? error : storageError(error);
          blocked.set(scope, failure);
          throw failure;
        }
      });
    },

    async savePhoneSnapshot(scope, snapshot) {
      checkScope(scope);
      const bytes = captureSnapshot(snapshot, scope); // Capture now, before any earlier write finishes.
      const epoch = epochs.get(scope) ?? 0;
      return queue(scope, async () => {
        const currentEpoch = () => { if ((epochs.get(scope) ?? 0) !== epoch) fail("reset_pending", "This save was cancelled because the browser draft is being removed. Your previous data was not restored."); };
        currentEpoch();
        const failure = blocked.get(scope);
        if (failure) throw failure;
        const entry = await read(scope);
        const known = expected.get(scope);
        if (known === undefined && entry.exists || known === null && entry.exists || typeof known === "string" && (!entry.exists || envelopeId(entry.value) !== known)) return changed();
        // Even a row with the same ID must still authenticate before it can be replaced.
        if (entry.exists) {
          try { if (!checkedReset(entry.value, scope)) await decode(entry.value, scope); }
          catch (error) { const failure = error instanceof PhoneVaultError ? error : storageError(error); blocked.set(scope, failure); throw failure; }
        }
        currentEpoch();
        const implementation = crypto();
        let row: StoredEnvelope;
        try {
          const key = await implementation.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
          const iv = implementation.getRandomValues(new Uint8Array(12));
          const id = [...implementation.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, "0")).join("");
          const updatedAt = now().toISOString();
          if (!timestamp(updatedAt)) return fail("unavailable", "The device clock is not available. Correct it and try saving again.");
          const metadata = { storageVersion: STORAGE_VERSION, payloadSchema: PHONE_SCHEMA, scope, envelopeId: id, updatedAt };
          const ciphertext = await implementation.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(metadata), tagLength: 128 }, key, bytes);
          row = { ...metadata, key, iv: iv.buffer, ciphertext };
        } catch (error) { throw storageError(error); }
        currentEpoch();
        let saved: boolean;
        try { saved = await port.compareAndSet(scope, known ?? null, row); }
        catch (error) { throw storageError(error); }
        if (!saved) return changed();
        expected.set(scope, row.envelopeId);
      });
    },

    async exportPhoneSnapshot(scope) {
      checkScope(scope);
      return queue(scope, async () => {
        const entry = await read(scope);
        if (!entry.exists) return fail("invalid_snapshot", "There is no saved browser draft to export for this workspace.");
        if (isReset(entry.value, scope)) return fail("invalid_snapshot", "There is no saved browser draft to export for this workspace.");
        try { return JSON.stringify((await decode(entry.value, scope)).snapshot, null, 2); }
        catch (error) {
          // Export is read-only: it does not unblock saving or adopt another tab's revision.
          if (error instanceof PhoneVaultError && error.code === "unavailable") throw error;
          let recoveredPayload: unknown;
          try {
            const value = await decrypt(checkedEnvelope(entry.value, scope, true));
            if (object(value)?.scope === scope) recoveredPayload = value;
          } catch { /* The unchanged encrypted row is still available for recovery. */ }
          const recovery = {
            format: "career-finder-phone-draft-recovery",
            recoveryVersion: 1,
            scope,
            exportedAt: now().toISOString(),
            notice: recoveredPayload === undefined ? "The saved draft could not be opened. Its encrypted data is included, but its non-extractable key remains in this browser. Keep this browser's saved data until recovery is complete; this file alone cannot restore it elsewhere." : "This draft could be decrypted but its format is unsupported or damaged. The original payload is included for recovery. Career Finder has not changed the browser's saved copy.",
            ...(recoveredPayload === undefined ? {} : { recoveredPayload: recoveryValue(recoveredPayload) }),
            encryptedRecord: recoveryValue(entry.value),
          };
          const output = JSON.stringify(recovery, null, 2);
          if (new TextEncoder().encode(output).byteLength > MAX_RECOVERY_BYTES) return fail("too_large", "This recovery export is too large. The saved browser draft was kept unchanged.");
          return output;
        }
      });
    },

    async removePhoneSnapshot(scope) {
      checkScope(scope);
      epochs.set(scope, (epochs.get(scope) ?? 0) + 1);
      return queue(scope, async () => {
        // A content-free marker prevents a tab that saw an empty scope from resurrecting
        // an older draft after another tab saved and reset it in the meantime.
        let marker: ResetMarker;
        try {
          const id = [...crypto().getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, "0")).join("");
          marker = { storageVersion: STORAGE_VERSION, scope, envelopeId: id, updatedAt: now().toISOString(), reset: true };
          await port.remove(scope, marker);
        } catch (error) { throw storageError(error); }
        expected.set(scope, marker.envelopeId);
        blocked.delete(scope);
      });
    },

    async listPhoneSnapshots(prefix) {
      checkPrefix(prefix);
      let rows: PhoneVaultMetadata[];
      try { rows = await port.list(prefix); } catch (error) { throw storageError(error); }
      return rows.filter(row => validScope(row.scope) && inPrefix(row.scope, prefix)).map(row => ({ scope: row.scope, updatedAt: timestamp(row.updatedAt) ? row.updatedAt : "" })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.scope.localeCompare(b.scope));
    },
  };
}

const phoneVault = createPhoneVault();
export const loadPhoneSnapshot = phoneVault.loadPhoneSnapshot;
export const savePhoneSnapshot = phoneVault.savePhoneSnapshot;
export const exportPhoneSnapshot = phoneVault.exportPhoneSnapshot;
export const removePhoneSnapshot = phoneVault.removePhoneSnapshot;
export const listPhoneSnapshots = phoneVault.listPhoneSnapshots;
