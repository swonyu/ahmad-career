const MAX_RESPONSE_BYTES = 256 * 1024;

export class APIError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status = 0, code = "request_failed") {
    super(message);
    this.name = "APIError";
    this.status = status;
    this.code = code;
  }
}

export async function readAPI(response: Response): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) throw new APIError("The service returned an empty response. Please reload to check its current state.", response.status, "invalid_response");
  const chunks: Uint8Array[] = [];
  let size = 0, complete = false;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) { complete = true; break; }
      size += part.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        throw new APIError("The service response was too large to verify. Your saved records have not been replaced.", response.status, "invalid_response");
      }
      chunks.push(part.value);
    }
  } finally {
    // Cleanup must not delay or replace the original error if cancellation stalls or rejects.
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new APIError("The service response could not be verified. Please reload to check its current state.", response.status, "invalid_response"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new APIError("The service response could not be verified. Please reload to check its current state.", response.status, "invalid_response");
  return value as Record<string, unknown>;
}
export function apiMessage(value: Record<string, unknown>, fallback: string): string {
  const error = value.error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message.slice(0, 1000);
  return fallback;
}

type APIOptions = { method?: "GET" | "POST" | "DELETE"; body?: object; signal?: AbortSignal; timeoutMs?: number };

/** Browser account requests stay on this origin and never retry a mutation. */
export async function requestAPI(path: string, options: APIOptions = {}): Promise<Record<string, unknown>> {
  if (!/^\/api\/[a-z0-9/-]+$/i.test(path) || path.includes("//")) throw new APIError("This service address is invalid.");
  const { method = "GET", body, signal, timeoutMs = 20_000 } = options;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000 || method === "GET" && body !== undefined) throw new APIError("This service request is invalid.");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
  signal?.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(path, {
      method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
      credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
    });
    const data = await readAPI(response);
    if (!response.ok || data.ok !== true) {
      const detail = data.error && typeof data.error === "object" ? data.error as Record<string, unknown> : {};
      throw new APIError(apiMessage(data, "This request could not be completed. Please reload to check the current state."), response.status, typeof detail.code === "string" ? detail.code : "request_failed");
    }
    return data;
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    if (timedOut) throw new APIError("The connection timed out. Reload to check the current state before trying again.", 0, "request_timeout");
    if (error instanceof APIError) throw error;
    throw new APIError("The service could not be reached. Check your connection, then reload to check the current state.", 0, "network_unavailable");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
