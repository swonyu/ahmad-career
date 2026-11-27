import { APIError } from "../components/api";
import { blankSnapshot, pendingReadOperationSchema, type PendingReadOperation, type Workspace } from "./model";
import { createIndexedDBPhoneVaultPort, createPhoneVault, PhoneVaultError, type PhoneVault } from "./vault";
import { parseReadOperation, parseReadIntent, operationMatchesIntent, type ReadOperation, type ReadIntent } from "./read-transport";

export type CapturedReadOperation = { scope: string; id: string };
export type PendingReadIntent = CapturedReadOperation & { intent: ReadIntent };
export type ReadOutcomeJournal = ReturnType<typeof createReadOutcomeJournal>;
const scopeFor = (accountId: string, workspaceId: string | null) => `account:${encodeURIComponent(accountId)}:${workspaceId ?? "new"}`;

/** Independent encrypted rows never create or replace the ordinary phone draft. */
export function createReadOutcomeJournal(vault: PhoneVault, locks?: Pick<LockManager, "request">, { requireLocks = false } = {}) {
  const queues = new Map<string, Promise<void>>(), inFlight = new Set<string>(), releases = new Map<string, () => void>();
  const lockName = (id: string) => "career-finder:read-intent:" + id;
  async function hold(id: string) {
    if (!locks) { if (requireLocks) throw new APIError("This browser cannot safely coordinate online changes. Your saved records are still available.", 0, "read_locks_unavailable"); return; }
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 5000);
    try {
      await new Promise<void>((resolve, reject) => {
        void locks.request(lockName(id), { mode: "exclusive", signal: controller.signal }, () => { clearTimeout(timer); releases.set(id, release); resolve(); return held; }).catch(reject);
      });
    } catch (error) { if (controller.signal.aborted) throw new APIError("This browser could not confirm safe access to pending changes. Reload and try again.", 0, "read_lock_timeout"); throw error; }
    finally { clearTimeout(timer); }
  }
  async function active(id: string): Promise<boolean> {
    if (inFlight.has(id)) return true;
    if (!locks) return requireLocks;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        locks.request(lockName(id), { mode: "exclusive", ifAvailable: true }, lock => lock === null),
        new Promise<boolean>((_resolve, reject) => { timer = setTimeout(() => reject(new APIError("This browser could not confirm safe access to pending changes. Reload and try again.", 0, "read_lock_timeout")), 5000); }),
      ]);
    } finally { clearTimeout(timer); }
  }
  function finish(pending: PendingReadIntent) { inFlight.delete(pending.id); releases.get(pending.id)?.(); releases.delete(pending.id); }
  function update(scope: string, change: (values: PendingReadOperation[]) => PendingReadOperation[]) {
    const task = (queues.get(scope) ?? Promise.resolve()).then(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const value = await vault.loadPhoneSnapshot(scope), current = value?.pendingReadOperations ?? [];
        const pendingReadOperations = change(current);
        try { await vault.savePhoneSnapshot(scope, { ...blankSnapshot(scope), pendingReadOperations }); return; }
        catch (error) { if (!(error instanceof PhoneVaultError) || error.code !== "changed_elsewhere" || attempt === 2) throw error; }
      }
    });
    const tail = task.then(() => undefined, () => undefined); queues.set(scope, tail);
    void tail.then(() => { if (queues.get(scope) === tail) queues.delete(scope); });
    return task;
  }
  async function capture(accountId: string): Promise<CapturedReadOperation[]> {
    const result: CapturedReadOperation[] = [];
    for (const row of await vault.listPhoneSnapshots(`account:${encodeURIComponent(accountId)}:`)) {
      await queues.get(row.scope);
      const value = await vault.loadPhoneSnapshot(row.scope);
      for (const operation of value?.pendingReadOperations ?? []) if (!await active(operation.id)) result.push({ scope: row.scope, id: operation.id });
    }
    return result;
  }
  return {
    capture,
    async begin(value: ReadIntent): Promise<PendingReadIntent> {
      const intent = structuredClone(parseReadIntent(value)), id = crypto.randomUUID(), scope = scopeFor(intent.accountId, intent.workspaceId);
      const entry = pendingReadOperationSchema.parse({ id, recordedAt: new Date().toISOString(), intent });
      inFlight.add(id);
      try { await hold(id); await update(scope, current => [...current, entry]); }
      catch (error) { finish({ scope, id, intent }); throw error; }
      return { scope, id, intent };
    },
    finish,
    async record(value: ReadOperation, pending?: PendingReadIntent) {
      const operation = parseReadOperation(value); if (!operation) throw new Error("Invalid acknowledged operation");
      if (pending && !operationMatchesIntent(operation, pending.intent)) throw new Error("Acknowledgment does not match the pending action");
      const entry = pendingReadOperationSchema.parse({ id: pending?.id ?? crypto.randomUUID(), recordedAt: new Date().toISOString(), ...(pending ? { intent: pending.intent } : {}), operation: structuredClone(operation) });
      const scope = pending?.scope ?? scopeFor(operation.accountId, operation.workspaceId);
      await update(scope, current => pending ? [...current.filter(value => value.id !== pending.id), entry] : [...current, entry]);
    },
    async published(workspace: Workspace, captured: CapturedReadOperation[]) {
      if (requireLocks && !locks) return false;
      const prefix = `account:${encodeURIComponent(workspace.accountId)}:`;
      for (const scope of new Set(captured.filter(value => value.scope.startsWith(prefix)).map(value => value.scope))) {
        const ids = new Set<string>();
        for (const value of captured) if (value.scope === scope && !await active(value.id)) ids.add(value.id);
        if (!ids.size) continue;
        await update(scope, current => current.filter(value => {
          if (!ids.has(value.id) || inFlight.has(value.id)) return true;
          const owner = value.operation ?? value.intent;
          if (!owner || owner.accountId !== workspace.accountId) return true;
          return owner.workspaceId !== workspace.workspaceId && !(value.intent?.kind === "workspace" && value.intent.workspaceId === null && !value.operation);
        }));
      }
      return true;
    },
  };
}

export const phoneReadOutcomes = createReadOutcomeJournal(createPhoneVault({ port: createIndexedDBPhoneVaultPort(undefined, "career-finder-phone-read-outcomes") }), globalThis.navigator?.locks, { requireLocks: true });
