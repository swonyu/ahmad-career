import { APIError } from "../components/api";
import { displayHistoricalText, hasHistoricalText, hasUnpairedText } from "./historical-text";

export const MAX_READ_FRAGMENT_BYTES = 4 * 1024 * 1024;
export const MAX_READ_FRAME_BYTES = 6 * 1024 * 1024;
export const MAX_READ_ASSEMBLY_BYTES = 64 * 1024 * 1024;
const MAX_METADATA_BYTES = 16 * 1024, MAX_CURSOR_BYTES = 2048;
const kinds = ["workspace", "profile", "job", "plan", "plan-state", "receipts"] as const;
type ReadKind = (typeof kinds)[number];
export type ReadOperation = { kind: "workspace" | "profile" | "jobs" | "prepare" | "submit" | "advance" | "stop"; acknowledged: true; accountId: string; workspaceId: string; revision?: number; jobId?: string; planId?: string; digest?: string };
export type ReadIntent = { kind: ReadOperation["kind"]; accountId: string; workspaceId: string | null; planId?: string };
export type ReadMetadata = { version: 2; kind: ReadKind; accountId: string; workspaceId: string | null; asOf: string; expiresAt: string; sha256: string; totalBytes: number; exportCursor: string | null };
export type LegacyTextEntry = { path: (string | number)[]; utf16leBase64: string };
export type ReadEvidence = { read: ReadMetadata; legacyText: LegacyTextEntry[]; operation: ReadOperation | null };
type Frame = { read: ReadMetadata & { offset: number; byteLength: number; nextCursor: string | null }; payloadBase64: string; operation: ReadOperation | null };
const evidence = new WeakMap<object, ReadEvidence>();
const invalidMessage = "The response could not be verified. Your earlier information is still here.";

export class PhoneReadError extends APIError {
  readonly operation: ReadOperation | null;
  readonly recovery: ReadMetadata | null;
  readonly intent: ReadIntent | null;
  constructor(error: unknown, operation: ReadOperation | null, recovery: ReadMetadata | null, intent: ReadIntent | null = null) {
    const known = error instanceof APIError ? error : null;
    const aborted = error instanceof DOMException && error.name === "AbortError";
    super(operation ? "The service acknowledged this action, but its updated records could not be loaded. Refresh online records to check its result. Your earlier information is still here."
      : intent ? "This action’s result could not be checked. Refresh online records before trying it again. Your earlier information is still here."
      : known?.message ?? (aborted ? "The read was cancelled. Your earlier information is still here." : invalidMessage), known?.status ?? 0, known?.code ?? (aborted ? "read_cancelled" : "invalid_response"));
    this.name = "PhoneReadError";
    this.operation = operation;
    this.recovery = recovery;
    this.intent = intent;
  }
}

export function readEvidence(value: object): ReadEvidence | null { return evidence.get(value) ?? null; }
export function retainReadEvidence(original: object, parsed: object): void {
  const value = evidence.get(original); if (value) evidence.set(parsed, value);
}
export function readRecoveryURL(value: ReadMetadata | null): string | null {
  return value?.exportCursor ? "/api/phone/read-export?cursor=" + encodeURIComponent(value.exportCursor) : null;
}
function fail(message = invalidMessage, code = "invalid_response"): never { throw new APIError(message, 0, code); }
/** Capture one JSON request before asynchronous preflight can yield to caller edits. */
export function capturePhoneRequestBody(value: object | undefined): object | undefined {
  if (value === undefined) return undefined;
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string") throw new Error();
    const body: unknown = JSON.parse(serialized);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new APIError("This app request is invalid."); }
}
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, allowed: string[]): boolean { return Object.keys(value).every(key => allowed.includes(key)); }
function scalar(value: unknown, maximum: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= maximum && !hasUnpairedText(value) && !/[\x00-\x1f\x7f]/.test(value); }
function uuid(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value); }
function hash(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function integer(value: unknown, minimum: number): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum; }
function iso(value: unknown): value is string { return typeof value === "string" && value.length === 24 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function cursor(value: unknown): value is string | null { return value === null || typeof value === "string" && value.length > 0 && value.length <= MAX_CURSOR_BYTES && /^[\x21-\x7e]+$/.test(value); }
function canonicalBase64(value: unknown, maximumBytes: number): Uint8Array<ArrayBuffer> {
  if (typeof value !== "string" || value.length > Math.ceil(maximumBytes / 3) * 4 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return fail();
  let binary: string;
  try { binary = atob(value); } catch { return fail(); }
  if (binary.length > maximumBytes || btoa(binary) !== value) return fail();
  return Uint8Array.from(binary, unit => unit.charCodeAt(0));
}

export function parseReadOperation(value: unknown): ReadOperation | null {
  if (value === null || value === undefined) return null;
  if (!object(value) || !scalar(value.accountId, 250) || !uuid(value.workspaceId) || value.acknowledged !== true) return fail();
  const common = ["kind", "acknowledged", "accountId", "workspaceId"];
  if (value.kind === "workspace" && exactKeys(value, common)) return value as ReadOperation;
  if (value.kind === "profile" && integer(value.revision, 0) && exactKeys(value, [...common, "revision"])) return value as ReadOperation;
  if (value.kind === "jobs" && uuid(value.jobId) && exactKeys(value, [...common, "jobId"])) return value as ReadOperation;
  if (["prepare", "submit", "advance", "stop"].includes(String(value.kind)) && uuid(value.planId) && hash(value.digest) && exactKeys(value, [...common, "planId", "digest"])) return value as ReadOperation;
  return fail();
}

export function parseReadIntent(value: unknown): ReadIntent {
  if (!object(value) || !["workspace", "profile", "jobs", "prepare", "submit", "advance", "stop"].includes(String(value.kind)) || !scalar(value.accountId, 250) || !(uuid(value.workspaceId) || value.workspaceId === null && value.kind === "workspace") || !exactKeys(value, ["kind", "accountId", "workspaceId", "planId"]) || value.planId !== undefined && !uuid(value.planId)) return fail();
  if (["submit", "advance", "stop"].includes(String(value.kind)) !== (value.planId !== undefined)) return fail();
  return value as ReadIntent;
}
export function operationMatchesIntent(operation: ReadOperation, intent: ReadIntent): boolean {
  return operation.kind === intent.kind && operation.accountId === intent.accountId && (intent.workspaceId === null || operation.workspaceId === intent.workspaceId) && (intent.planId === undefined || operation.planId === intent.planId);
}

/** A schema-valid view must still describe the exact acknowledged/requested action. */
export function validateReadBindings(data: Record<string, unknown>, kind: ReadKind, operation: ReadOperation | null, request: { planId?: string; digest?: string; revision?: number } = {}): void {
  if (kind === "profile") {
    if (!object(data.profile) || operation && (operation.kind !== "profile" || data.profile.revision !== operation.revision) || request.revision !== undefined && data.profile.revision !== request.revision + 1) return fail();
  } else if (kind === "job") {
    if (!object(data.job) || operation && (operation.kind !== "jobs" || data.job.id !== operation.jobId)) return fail();
  } else if (kind === "plan" || kind === "plan-state") {
    if (!object(data.plan) || operation && (!["prepare", "submit", "advance", "stop"].includes(operation.kind) || data.plan.id !== operation.planId || data.plan.digest !== operation.digest) || request.planId && data.plan.id !== request.planId || request.digest && data.plan.digest !== request.digest) return fail();
  }
}

function parseFrame(data: Record<string, unknown>): Frame {
  if (new TextEncoder().encode(JSON.stringify({ read: data.read, operation: data.operation, readError: data.readError })).byteLength > MAX_METADATA_BYTES) return fail();
  const value = data.read;
  if (!exactKeys(data, ["ok", "read", "payloadBase64", "operation"]) || data.ok !== true || !object(value) || !exactKeys(value, ["version", "kind", "accountId", "workspaceId", "asOf", "expiresAt", "sha256", "totalBytes", "offset", "byteLength", "nextCursor", "exportCursor"]) || value.version !== 2 || !kinds.includes(value.kind as ReadKind) || !scalar(value.accountId, 250) || value.workspaceId !== null && !uuid(value.workspaceId) || !iso(value.asOf) || !iso(value.expiresAt) || Date.parse(value.expiresAt) - Date.parse(value.asOf) !== 300_000 || !hash(value.sha256) || !integer(value.totalBytes, 1) || !integer(value.offset, 0) || !integer(value.byteLength, 1) || value.byteLength > MAX_READ_FRAGMENT_BYTES || !cursor(value.nextCursor) || !cursor(value.exportCursor) || typeof data.payloadBase64 !== "string") return fail();
  if (value.offset + value.byteLength > value.totalBytes || !Number.isSafeInteger(value.offset + value.byteLength) || (value.offset + value.byteLength === value.totalBytes) !== (value.nextCursor === null) || value.workspaceId === null && (value.kind !== "workspace" || value.nextCursor !== null || value.exportCursor !== null) || value.workspaceId !== null && value.exportCursor === null) return fail();
  const operation = parseReadOperation(data.operation);
  if (operation && (operation.accountId !== value.accountId || operation.workspaceId !== value.workspaceId)) return fail();
  return { read: value as Frame["read"], payloadBase64: data.payloadBase64, operation };
}
function immutable(value: Frame["read"]): ReadMetadata {
  return { version: value.version, kind: value.kind, accountId: value.accountId, workspaceId: value.workspaceId, asOf: value.asOf, expiresAt: value.expiresAt, sha256: value.sha256, totalBytes: value.totalBytes, exportCursor: value.exportCursor };
}
function sameMetadata(first: ReadMetadata, next: ReadMetadata): boolean {
  return first.version === next.version && first.kind === next.kind && first.accountId === next.accountId && first.workspaceId === next.workspaceId && first.asOf === next.asOf && first.expiresAt === next.expiresAt && first.sha256 === next.sha256 && first.totalBytes === next.totalBytes && first.exportCursor === next.exportCursor;
}

// IDs, hashes, enum authority fields and URLs are never rewritten through a sidecar.
function legacyPath(kind: ReadKind, path: (string | number)[]): boolean {
  const p = path.map(segment => typeof segment === "number" ? "#" : segment).join("/");
  const profile = /^(?:profile)\/(?:firstName|lastName|email|phone|city|headline|skills\/#|targetRoles\/#|resume\/name)$/;
  const job = /^(?:job|jobs\/#)\/(?:title|company|location|sourceName|summary|reason)$/;
  const receipt = /^(?:attempts|receipts)\/#\/(?:title|company|resumeName|applicationId|requirementsRevision|error\/message)$/;
  const plan = /^(?:plan|recoverablePlans\/#)\/items\/#\/(?:title|company|reason|applicationId|requirementsRevision|job\/(?:title|company|location|sourceName|summary|reason)|resume\/name|payloadSummary\/(?:name|email|phone|comments))$/;
  if (kind === "workspace") return profile.test(p) || p.startsWith("jobs/#/") && job.test(p) || p.startsWith("attempts/#/") && receipt.test(p) || p.startsWith("recoverablePlans/#/") && plan.test(p);
  if (kind === "profile") return profile.test(p);
  if (kind === "job") return p.startsWith("job/") && job.test(p);
  if (kind === "plan" || kind === "plan-state") return p.startsWith("plan/") && plan.test(p) || kind === "plan-state" && p.startsWith("attempts/#/") && receipt.test(p);
  return kind === "receipts" && p.startsWith("receipts/#/") && receipt.test(p);
}
function decodeLegacy(data: Record<string, unknown>, entries: unknown, kind: ReadKind): LegacyTextEntry[] {
  if (!Array.isArray(entries)) return fail();
  const seen = new Set<string>(), result: LegacyTextEntry[] = [];
  for (const entry of entries) {
    if (!object(entry) || !exactKeys(entry, ["path", "utf16leBase64"]) || !Array.isArray(entry.path) || entry.path.length < 1 || entry.path.length > 8 || !entry.path.every(segment => typeof segment === "string" && scalar(segment, 250) || integer(segment, 0)) || !legacyPath(kind, entry.path as (string | number)[])) return fail();
    const path = entry.path as (string | number)[], key = JSON.stringify(path); if (seen.has(key)) return fail(); seen.add(key);
    let parent: unknown = data;
    for (const segment of path.slice(0, -1)) {
      if (typeof segment === "number" ? !Array.isArray(parent) || segment >= parent.length : !object(parent) || !Object.hasOwn(parent, segment)) return fail();
      parent = (parent as Record<string | number, unknown>)[segment];
    }
    const leaf = path.at(-1)!;
    if (typeof leaf === "number" ? !Array.isArray(parent) || leaf >= parent.length : !object(parent) || !Object.hasOwn(parent, leaf)) return fail();
    const shown = (parent as Record<string | number, unknown>)[leaf]; if (typeof shown !== "string") return fail();
    const bytes = canonicalBase64(entry.utf16leBase64, MAX_READ_ASSEMBLY_BYTES);
    if (bytes.length === 0 || bytes.length % 2 !== 0) return fail();
    const units: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      const chunk: number[] = [];
      for (let index = offset; index < Math.min(offset + 8192, bytes.length); index += 2) chunk.push(bytes[index] | bytes[index + 1] << 8);
      units.push(String.fromCharCode(...chunk));
    }
    const original = units.join("");
    if (!hasUnpairedText(original) || displayHistoricalText(original) !== shown) return fail();
    Object.defineProperty(parent, leaf, { value: original, enumerable: true, writable: true, configurable: true });
    result.push({ path: [...path], utf16leBase64: entry.utf16leBase64 as string });
  }
  return result;
}

function abort(signal?: AbortSignal): void { if (signal?.aborted) throw new DOMException("Cancelled", "AbortError"); }

export async function assemblePhoneRead(first: Record<string, unknown>, next: (cursor: string) => Promise<Record<string, unknown>>, options: { signal?: AbortSignal; expectedKind?: ReadKind; expectedAccountId?: string; expectedWorkspaceId?: string; operationKind?: ReadOperation["kind"]; expectedPlanId?: string; expectedDigest?: string; expectedRevision?: number; onAcknowledged?: (operation: ReadOperation) => Promise<void> } = {}): Promise<Record<string, unknown>> {
  let operation: ReadOperation | null = null, metadata: ReadMetadata | null = null;
  try {
    const acknowledged = parseReadOperation(first.operation);
    if (acknowledged && (acknowledged.kind !== options.operationKind || options.expectedAccountId && acknowledged.accountId !== options.expectedAccountId || options.expectedWorkspaceId && acknowledged.workspaceId !== options.expectedWorkspaceId || options.expectedPlanId && acknowledged.planId !== options.expectedPlanId || options.expectedDigest && acknowledged.digest !== options.expectedDigest || options.expectedRevision !== undefined && acknowledged.revision !== options.expectedRevision + 1)) return fail();
    if (options.operationKind && !acknowledged) return fail();
    operation = acknowledged;
    // Finish this owner-scoped save even when the caller is cancelled meanwhile.
    if (operation) await options.onAcknowledged?.(operation);
    if (first.read === null && operation && object(first.readError)) {
      const error = first.readError;
      if (!scalar(error.code, 100) || !scalar(error.message, 1000) || !exactKeys(first, ["ok", "read", "operation", "readError"]) || !exactKeys(error, ["code", "message"])) return fail();
      throw new APIError(error.message, 0, error.code);
    }
    let frame = parseFrame(first);
    if (frame.read.offset !== 0 || options.expectedKind && frame.read.kind !== options.expectedKind || options.expectedAccountId && frame.read.accountId !== options.expectedAccountId || options.expectedWorkspaceId && frame.read.workspaceId !== options.expectedWorkspaceId) return fail();
    metadata = immutable(frame.read);
    if (metadata.totalBytes > MAX_READ_ASSEMBLY_BYTES) return fail("These records are too large to open here. Download the complete recovery copy; your earlier information is still here.", "read_too_large");
    const bytes = new Uint8Array(metadata.totalBytes), usedCursors = new Set<string>(); let offset = 0, pages = 0;
    for (;;) {
      abort(options.signal);
      if (++pages > Math.ceil(MAX_READ_ASSEMBLY_BYTES / MAX_READ_FRAGMENT_BYTES) || !sameMetadata(metadata, immutable(frame.read)) || frame.read.offset !== offset || frame.operation && (!operation || Object.keys(frame.operation).some(key => frame.operation?.[key as keyof ReadOperation] !== operation?.[key as keyof ReadOperation]))) return fail();
      const chunk = canonicalBase64(frame.payloadBase64, MAX_READ_FRAGMENT_BYTES);
      if (chunk.length !== frame.read.byteLength) return fail();
      bytes.set(chunk, offset); offset += chunk.length;
      if (frame.read.nextCursor === null) break;
      if (usedCursors.has(frame.read.nextCursor)) return fail(); usedCursors.add(frame.read.nextCursor);
      abort(options.signal);
      frame = parseFrame(await next(frame.read.nextCursor));
    }
    abort(options.signal);
    if (offset !== metadata.totalBytes) return fail();
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
    abort(options.signal);
    if (digest !== metadata.sha256) return fail();
    let document: unknown;
    try { document = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return fail(); }
    if (!object(document) || document.documentVersion !== 1) return fail();
    if (document.mode === "raw-recovery") return fail("These historical records need a recovery export before they can be opened safely. Your earlier information is still here.", "raw_recovery_required");
    if (document.mode !== "view" || !exactKeys(document, ["documentVersion", "mode", "data", "legacyText"]) || !object(document.data) || document.data.ok !== true || hasHistoricalText(document.data)) return fail();
    const legacyText = decodeLegacy(document.data, document.legacyText, metadata.kind);
    if (metadata.kind === "workspace" && (document.data.accountId !== metadata.accountId || document.data.workspaceId !== metadata.workspaceId)) return fail();
    abort(options.signal);
    evidence.set(document.data, { read: metadata, legacyText, operation });
    return document.data;
  } catch (error) {
    // Acknowledgment survives page errors and cancellation. It never authorizes a replay.
    if (operation || metadata) throw new PhoneReadError(error, operation, metadata);
    throw error;
  }
}
