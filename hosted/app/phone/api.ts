import { APIError } from "../components/api";

/** Same-origin only, with no redirects or automatic mutation retries. */
export async function phoneAPI(path: string, options: { method?: "GET" | "POST" | "PUT"; body?: object; signal?: AbortSignal } = {}): Promise<Record<string, unknown>> {
  const url = new URL(path, "https://career-finder.invalid");
  if (url.origin !== "https://career-finder.invalid" || !/^\/api\/(?:phone\/[a-z]+|discovery\/(?:sources|search))$/.test(url.pathname)) throw new APIError("This app request is invalid.");
  const method = options.method ?? "GET", discovery = url.pathname.startsWith("/api/discovery/");
  if (discovery && method !== "GET" || method === "GET" && options.body) throw new APIError("This app request is invalid.");
  const controller = new AbortController(), cancel = () => controller.abort();
  if (options.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  options.signal?.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);
  try {
    // Owner-private hosting can require its session even for a public-data GET.
    // Discovery ignores app credentials and never forwards them to employers.
    const response = await fetch(url.pathname + url.search, { method, credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal, headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) }, ...(options.body ? { body: JSON.stringify(options.body) } : {}) });
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) throw new APIError("The response could not be verified. Your earlier information is still here.", response.status, "invalid_response");
    const reader = response.body?.getReader(); if (!reader) throw new APIError("The service returned an empty response.", response.status, "invalid_response");
    const parts: Uint8Array[] = []; let length = 0;
    try {
      for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > 12 * 1024 * 1024) { await reader.cancel(); throw new APIError("The response is too large to verify. Your earlier information is still here.", response.status, "invalid_response"); } parts.push(part.value); }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    let value: unknown;
    try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new APIError("The response could not be read safely. Your earlier information is still here.", response.status, "invalid_response"); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new APIError("The service response is invalid.", response.status, "invalid_response");
    const data = value as Record<string, unknown>;
    if (!response.ok || data.ok !== true) {
      const error = data.error && typeof data.error === "object" ? data.error as Record<string, unknown> : {};
      throw new APIError(typeof error.message === "string" ? error.message.slice(0,1000) : "This request could not be completed. Refresh to check the current state.", response.status, typeof error.code === "string" ? error.code : "request_failed");
    }
    return data;
  } catch (error) {
    if (options.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (error instanceof APIError) throw error;
    throw new APIError(timedOut ? "The request timed out. Refresh to check whether it completed before trying again." : "You appear to be offline or the service is unavailable. Your earlier information is still here.", 0, timedOut ? "request_timeout" : "network_unavailable");
  } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", cancel); }
}
