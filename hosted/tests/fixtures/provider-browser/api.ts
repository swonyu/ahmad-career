// Test-only HTTP injection. No live provider, account or employer is contacted.
type Provider = "google" | "linkedin";
type Connection = { configured: boolean; connected: boolean; displayName?: string; connectionId?: string };
type RequestBody = { provider: Provider; expectedAccountId: string; expectedConnectionId?: string };
type PendingRequest = { path: string; body: RequestBody; signal?: AbortSignal; resolve: (value: unknown) => void; resolved: boolean };

export class APIError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
}
const oldID = "a".repeat(64), newID = "b".repeat(64);
let account = { id: "synthetic-owner-a", email: "a@example.com", displayName: "Synthetic A", method: "chatgpt" };
const providers: Record<Provider, Connection> = { google: { configured: true, connected: false }, linkedin: { configured: true, connected: true, displayName: "Synthetic LinkedIn A", connectionId: oldID } };
export const requests: PendingRequest[] = [];
export const listeners = new Set<() => void>();
function notify() { for (const listener of listeners) listener(); }
export function snapshot() { return { account: account.id, requests: requests.map(item => ({ path: item.path, body: item.body, pending: !item.resolved, aborted: item.signal?.aborted ?? false })) }; }
export function switchAccount() {
  account = { ...account, id: account.id === "synthetic-owner-a" ? "synthetic-owner-b" : "synthetic-owner-a", displayName: account.id === "synthetic-owner-a" ? "Synthetic B" : "Synthetic A" };
  notify(); window.dispatchEvent(new Event("focus"));
}
export function relink() { providers.linkedin = { ...providers.linkedin, connected: true, connectionId: newID, displayName: "Synthetic LinkedIn B" }; notify(); window.dispatchEvent(new Event("focus")); }
export function revalidate() { window.dispatchEvent(new Event("focus")); notify(); }
export function resolveNext() {
  const next = requests.find(item => !item.resolved);
  if (!next) return;
  next.resolved = true;
  if (next.path.endsWith("/disconnect")) {
    providers[next.body.provider] = { configured: true, connected: false };
    next.resolve({ ok: true });
  } else next.resolve({ ok: true, authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=synthetic-provider-harness" });
  notify();
}
export async function requestAPI(url: string, options: { body?: RequestBody; signal?: AbortSignal } = {}) {
  if (url === "/api/auth/status") return { ok: true, account: structuredClone(account), providers: structuredClone(providers) };
  if ((url === "/api/auth/connect" || url === "/api/auth/disconnect") && options.body) {
    const body = options.body;
    // Deliberately ignore abort when resolving. The component must independently
    // suppress a response that arrives after its authority has been invalidated.
    return new Promise(resolve => { requests.push({ path: url, body, signal: options.signal, resolve, resolved: false }); notify(); });
  }
  throw new APIError("Synthetic harness refuses all other requests", 400, "test_only");
}
