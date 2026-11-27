import { APIError } from "../components/api";
import { hasHistoricalText } from "./historical-text";
import { jobSchema, planSchema, profileSchema, receiptSchema, workspaceSchema, type Workspace } from "./model";
import { assemblePhoneRead, capturePhoneRequestBody, validateReadBindings, MAX_READ_FRAME_BYTES, PhoneReadError, readEvidence, retainReadEvidence, type ReadOperation, type ReadMetadata } from "./read-transport";
import { phoneReadOutcomes, type CapturedReadOperation, type ReadOutcomeJournal } from "./read-outcomes";

type PhoneOptions = { method?: "GET" | "POST" | "PUT"; body?: object; signal?: AbortSignal; expectedAccountId?: string; expectedWorkspaceId?: string; outcomes?: ReadOutcomeJournal };
const invalid = "The response could not be verified. Your earlier information is still here.";
const publications = new WeakMap<object, { journal: ReadOutcomeJournal; captured: CapturedReadOperation[] }>();

export function workspaceFromResponse(data: Record<string, unknown>): Workspace {
  const value = workspaceSchema.parse(data); retainReadEvidence(data, value);
  const publication = publications.get(data); if (publication) publications.set(value, publication);
  return value;
}
export async function acknowledgeWorkspacePublication(value: Workspace): Promise<boolean> {
  const publication = publications.get(value);
  if (!publication) return false;
  if (!await publication.journal.published(value, publication.captured)) return false;
  publications.delete(value); return true;
}

async function requestJSON(path: string, options: PhoneOptions, versioned: boolean, continuation = false): Promise<{ data: Record<string, unknown>; versioned: boolean }> {
  const controller = new AbortController(), cancel = () => controller.abort();
  if (options.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  options.signal?.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);
  try {
    const response = await fetch(path, { method: options.method ?? "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
      headers: { Accept: "application/json", ...(versioned ? { "X-Career-Read-Version": "2" } : {}), ...(options.body ? { "Content-Type": "application/json" } : {}) }, ...(options.body ? { body: JSON.stringify(options.body) } : {}) });
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) {
      void response.body?.cancel().catch(() => {});
      throw new APIError(invalid, response.status, "invalid_response");
    }
    const v2 = response.headers.get("X-Career-Read-Version") === "2";
    const maximum = v2 || continuation ? MAX_READ_FRAME_BYTES : 12 * 1024 * 1024;
    const reader = response.body?.getReader(); if (!reader) throw new APIError("The service returned an empty response.", response.status, "invalid_response");
    const parts: Uint8Array[] = []; let length = 0, complete = false;
    try {
      for (;;) {
        if (options.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
        const part = await reader.read();
        if (part.done) { complete = true; break; }
        length += part.value.byteLength;
        if (length > maximum) throw new APIError("The response is too large to verify. Your earlier information is still here.", response.status, "invalid_response");
        parts.push(part.value);
      }
    } finally {
      if (!complete) void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    let value: unknown;
    try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new APIError("The response could not be read safely. Your earlier information is still here.", response.status, "invalid_response"); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new APIError("The service response is invalid.", response.status, "invalid_response");
    const data = value as Record<string, unknown>;
    if (!response.ok || data.ok !== true) {
      const error = data.error && typeof data.error === "object" ? data.error as Record<string, unknown> : {};
      const message = error.code === "recovery_required" ? "This historical review contains text that needs repair. You can view or stop it. Repair the affected details and prepare a new review before applying."
        : typeof error.message === "string" ? error.message.slice(0, 1000) : "This request could not be completed. Refresh to check the current state.";
      throw new APIError(message, response.status, typeof error.code === "string" ? error.code : "request_failed");
    }
    if (continuation && !v2 || "read" in data && !v2 || v2 && !versioned) throw new APIError(invalid, response.status, "invalid_response");
    return { data, versioned: v2 };
  } catch (error) {
    if (options.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (error instanceof APIError) throw error;
    throw new APIError(timedOut ? "The request timed out. Refresh to check whether it completed before trying again." : "You appear to be offline or the service is unavailable. Your earlier information is still here.", 0, timedOut ? "request_timeout" : "network_unavailable");
  } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", cancel); }
}

function validateRead(data: Record<string, unknown>, expectedKind?: ReadMetadata["kind"], request: { planId?: string; digest?: string; revision?: number } = {}): void {
  const source = readEvidence(data), kind = source?.read.kind ?? expectedKind; if (!kind) return;
  try {
    switch (kind) {
      case "workspace": workspaceSchema.parse(data); break;
      case "profile": profileSchema.parse(data.profile); break;
      case "job": jobSchema.parse(data.job); break;
      case "plan": case "plan-state":
        planSchema.parse(data.plan);
        if (kind === "plan-state" && data.attempts !== undefined) {
          if (!Array.isArray(data.attempts) || data.attempts.length > 500) throw new Error();
          data.attempts.forEach(value => receiptSchema.parse(value));
        }
        break;
      case "receipts":
        if (!Array.isArray(data.receipts) || data.receipts.length > 500) throw new Error();
        data.receipts.forEach(value => receiptSchema.parse(value)); break;
    }
    validateReadBindings(data, kind, source?.operation ?? null, request);
  } catch { throw new PhoneReadError(new APIError(invalid, 0, "invalid_response"), source?.operation ?? null, source?.read ?? null); }
}

/** Same-origin only. Original writes run once; continuation and recovery are GETs. */
export async function phoneAPI(path: string, options: PhoneOptions = {}): Promise<Record<string, unknown>> {
  if (options.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  // Later caller edits cannot retarget a request after its intent was saved.
  options = { ...options, body: capturePhoneRequestBody(options.body) };
  const url = new URL(path, "https://career-finder.invalid");
  if (url.origin !== "https://career-finder.invalid" || !/^\/api\/(?:phone\/[a-z]+|discovery\/(?:sources|search))$/.test(url.pathname)) throw new APIError("This app request is invalid.");
  const method = options.method ?? "GET", discovery = url.pathname.startsWith("/api/discovery/");
  if (discovery && method !== "GET" || method === "GET" && options.body) throw new APIError("This app request is invalid.");
  if (method !== "GET" && hasHistoricalText(options.body)) throw new APIError("Some historical text needs repair before it can be sent. Your original information is still here.", 0, "legacy_text_requires_repair");
  const route = url.pathname.split("/").at(-1)!;
  const kindsByRoute = { workspace: "workspace", profile: "profile", jobs: "job", prepare: "plan", submit: "plan-state", advance: "plan-state", stop: "plan-state", receipts: "receipts" } as const;
  const expectedKind = kindsByRoute[route as keyof typeof kindsByRoute];
  const expectedBody = options.body as Record<string, unknown> | undefined;
  const expectedAccountId = options.expectedAccountId ?? (typeof expectedBody?.expectedAccountId === "string" ? expectedBody.expectedAccountId : undefined);
  const expectedWorkspaceId = options.expectedWorkspaceId ?? (typeof expectedBody?.expectedWorkspaceId === "string" ? expectedBody.expectedWorkspaceId : url.searchParams.get("expectedWorkspaceId") ?? undefined);
  const operationKind = method === "GET" ? undefined : route as ReadOperation["kind"];
  const expectedPlanId = method !== "GET" && ["submit", "advance", "stop"].includes(route) && typeof expectedBody?.planId === "string" ? expectedBody.planId : undefined;
  const expectedDigest = method !== "GET" && route === "submit" && typeof expectedBody?.digest === "string" ? expectedBody.digest : undefined;
  const expectedRevision = method !== "GET" && route === "profile" && typeof expectedBody?.expectedRevision === "number" ? expectedBody.expectedRevision : undefined;
  if (method !== "GET" && route === "profile" && (expectedRevision === undefined || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !Number.isSafeInteger(expectedRevision + 1)) || method !== "GET" && route === "submit" && !/^[a-f0-9]{64}$/.test(expectedDigest ?? "")) throw new APIError("This app request is invalid.");
  const bindings = { planId: expectedPlanId, digest: expectedDigest, revision: expectedRevision };
  const journal = options.outcomes ?? phoneReadOutcomes;
  const pending = method !== "GET" && !discovery ? await journal.begin({ kind: operationKind!, accountId: expectedAccountId ?? "", workspaceId: expectedWorkspaceId ?? null,
    ...(["submit", "advance", "stop"].includes(route) ? { planId: typeof expectedBody?.planId === "string" ? expectedBody.planId : "" } : {}) }) : null;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const captured = method === "GET" && route === "workspace" && expectedAccountId ? await journal.capture(expectedAccountId) : [];
        const first = await requestJSON(url.pathname + url.search, options, !discovery);
        if (!first.versioned) {
          validateRead(first.data, expectedKind, bindings);
          if (expectedKind === "workspace" && (expectedAccountId && first.data.accountId !== expectedAccountId || expectedWorkspaceId && first.data.workspaceId !== expectedWorkspaceId)) throw new APIError(invalid, 409, "workspace_changed");
          if (method === "GET" && route === "workspace") publications.set(first.data, { journal, captured });
          return first.data;
        }
        const data = await assemblePhoneRead(first.data, async cursor => (await requestJSON("/api/phone/read?cursor=" + encodeURIComponent(cursor), { method: "GET", signal: options.signal }, true, true)).data,
          { signal: options.signal, expectedKind, expectedAccountId, expectedWorkspaceId, operationKind, expectedPlanId, expectedDigest, expectedRevision, onAcknowledged: operation => journal.record(operation, pending ?? undefined) });
        validateRead(data, expectedKind, bindings);
        if (method === "GET" && route === "workspace") publications.set(data, { journal, captured });
        return data;
      } catch (error) {
        // A single fresh read may recover a changed snapshot. Never replay POST/PUT.
        if (method === "GET" && attempt === 0 && !options.signal?.aborted && error instanceof APIError && ["snapshot_changed", "snapshot_expired"].includes(error.code) && !(error instanceof PhoneReadError && error.operation)) continue;
        throw error;
      }
    }
  } catch (error) {
    if (!pending) throw error;
    throw new PhoneReadError(error, error instanceof PhoneReadError ? error.operation : null, error instanceof PhoneReadError ? error.recovery : null, pending.intent);
  } finally { if (pending) journal.finish(pending); }
}
