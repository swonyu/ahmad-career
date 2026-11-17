import { authorizationTarget, type Provider } from "./provider-auth";

export type ProviderView = {
  accountId: string;
  revision: number;
  verified: boolean;
  connections: Record<Provider, string | null>;
};
export type DisconnectTarget = {
  provider: Provider;
  connectionId: string;
  accountId: string;
  revision: number;
};
type Result = { kind: "disconnect" } | { kind: "connect"; authorizationUrl: string };
type Request = (path: string, options: { method: "POST"; body: Record<string, string>; signal: AbortSignal }) => Promise<Record<string, unknown>>;

export function matchesDisconnect(view: ProviderView, target: DisconnectTarget): boolean {
  return view.verified && view.accountId === target.accountId && view.revision === target.revision
    && view.connections[target.provider] === target.connectionId;
}
export function captureDisconnect(view: ProviderView, provider: Provider): DisconnectTarget {
  const connectionId = view.connections[provider];
  if (!view.verified || !connectionId) throw Error("Check this account’s current connection before disconnecting it.");
  return { provider, connectionId, accountId: view.accountId, revision: view.revision };
}

// A response can arrive after the account card was removed or its identity was
// rechecked. Aborting alone is insufficient: an already completed response can
// still resolve, so every result is also bound to the captured view revision.
export function createProviderChanges(initialView: ProviderView, request: Request, environment: { currentRevision?: () => number; visible?: () => boolean } = {}) {
  let view = initialView;
  const readView = () => {
    const revision = environment.currentRevision?.() ?? view.revision;
    return { ...view, revision, verified: view.verified && view.revision === revision && (environment.visible?.() ?? true) };
  };
  let closed = false;
  let pending: { controller: AbortController; provider: Provider; view: ProviderView } | null = null;
  const current = (operation: NonNullable<typeof pending>) => {
    const view = readView();
    return !closed && pending === operation && !operation.controller.signal.aborted
      && view.verified && view.accountId === operation.view.accountId && view.revision === operation.view.revision;
  };
  function cancel() {
    pending?.controller.abort();
    pending = null;
  }
  return {
    cancel,
    open() { closed = false; },
    update(next: ProviderView) { view = next; if (pending && !current(pending)) cancel(); },
    close() { closed = true; cancel(); },
    isClosed: () => closed,
    busyProvider: () => pending?.provider ?? null,
    async change(provider: Provider, disconnect?: DisconnectTarget): Promise<Result | null> {
      if (closed || pending) return null;
      const view = readView();
      if (!view.verified) throw Error("Confirm this account before changing a provider connection.");
      if (disconnect && (disconnect.provider !== provider || !matchesDisconnect(view, disconnect))) {
        throw Error("This connection changed. Check its current status and confirm the intended connection again.");
      }
      const operation = { controller: new AbortController(), provider, view };
      pending = operation;
      try {
        const response = await request(`/api/auth/${disconnect ? "disconnect" : "connect"}`, {
          method: "POST", signal: operation.controller.signal,
          body: { provider, expectedAccountId: view.accountId, ...(disconnect ? { expectedConnectionId: disconnect.connectionId } : {}) },
        });
        if (!current(operation)) return null;
        if (disconnect) {
          if (!matchesDisconnect(readView(), disconnect)) return null;
          return { kind: "disconnect" };
        }
        return { kind: "connect", authorizationUrl: authorizationTarget(provider, response.authorizationUrl) };
      } catch (failure) {
        if (!current(operation)) return null;
        throw failure;
      } finally { if (pending === operation) pending = null; }
    },
  };
}
