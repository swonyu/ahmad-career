import { blankSnapshot, phoneSafetySchema, recoveryDraftSchema, stopHoldSchema, type PhoneSafety, type RecoveryDraft, type StopHold } from "./model";
import { createIndexedDBPhoneVaultPort, createPhoneVault, PhoneVaultError, type PhoneVault } from "./vault";

// A separate encrypted vault keeps Stop intent and unfinished edits independent
// of a conflicted or damaged main draft. It uses the same exact owner/workspace
// scopes, authenticated encryption, revision checks and reset fencing.
export function createPhoneSafety(vault: PhoneVault) {
  const queues = new Map<string, Promise<void>>();
  const epochs = new Map<string, number>();
  const empty = (): PhoneSafety => ({ holds: [], recovery: [] });
  async function readState(scope: string): Promise<PhoneSafety> {
    const value = await vault.loadPhoneSnapshot(scope);
    return phoneSafetySchema.parse(value?.safety ?? empty());
  }
  function queue<T>(scope: string, action: () => Promise<T>): Promise<T> {
    const prior = queues.get(scope) ?? Promise.resolve();
    const task = prior.then(action);
    const tail = task.then(() => undefined, () => undefined);
    queues.set(scope, tail);
    void tail.then(() => { if (queues.get(scope) === tail) queues.delete(scope); });
    return task;
  }
  function update(scope: string, change: (current: PhoneSafety) => PhoneSafety): Promise<PhoneSafety> {
    const epoch = epochs.get(scope) ?? 0;
    return queue(scope, async () => {
      for (let retry = 0; retry < 3; retry++) {
        if ((epochs.get(scope) ?? 0) !== epoch) throw new PhoneVaultError("reset_pending", "This recovery save was cancelled because its browser data was cleared.");
        const current = await readState(scope);
        const safety = phoneSafetySchema.parse(change(current));
        try {
          await vault.savePhoneSnapshot(scope, { ...blankSnapshot(scope), safety });
          return safety;
        } catch (error) {
          if (!(error instanceof PhoneVaultError) || error.code !== "changed_elsewhere" || retry === 2) throw error;
        }
      }
      throw Error("Your recovery information changed in another tab. Try again.");
    });
  }
  return {
    load: (scope: string) => queue(scope, () => readState(scope)),
    checkWritable: (scope: string) => update(scope, state => state),
    hold(scope: string, planId: string): Promise<PhoneSafety> {
      const hold = stopHoldSchema.parse({ planId, requestedAt: new Date().toISOString(), confirmed: false });
      return update(scope, state => ({ ...state, holds: [...state.holds.filter(value => value.planId !== planId && !value.confirmed), hold] }));
    },
    confirm(scope: string, planId: string): Promise<PhoneSafety> {
      return update(scope, state => ({ ...state, holds: state.holds.map(value => value.planId === planId ? { ...value, confirmed: true } : value) }));
    },
    recover(scope: string, draft: RecoveryDraft): Promise<PhoneSafety> {
      const captured = recoveryDraftSchema.parse(draft);
      return update(scope, state => ({ ...state, recovery: [...state.recovery.filter(value => value.id !== captured.id), captured] }));
    },
    discard(scope: string, id: string, expectedSavedAt?: string): Promise<PhoneSafety> {
      return update(scope, state => { const current = state.recovery.find(value => value.id === id); if (expectedSavedAt && current && current.savedAt !== expectedSavedAt) throw new PhoneVaultError("changed_elsewhere", "This recovery copy changed in another tab. Open the latest version before discarding it."); return { ...state, recovery: state.recovery.filter(value => value.id !== id) }; });
    },
    async clearRecovery(scope: string) {
      // Stop holds must survive clearing personal browser drafts. Only a
      // confirmed service Stop can make that held authorization obsolete.
      epochs.set(scope, (epochs.get(scope) ?? 0) + 1);
      return update(scope, state => ({ holds: state.holds, recovery: [] }));
    },
    async list(prefix: string) {
      const rows = await vault.listPhoneSnapshots(prefix), visible = [];
      for (const row of rows) {
        try { if ((await queue(row.scope, () => readState(row.scope))).recovery.length) visible.push(row); }
        catch { visible.push(row); } // Keep unreadable rows visible for explicit export or erasure.
      }
      return visible;
    },
    export: (scope: string) => vault.exportPhoneSnapshot(scope),
  };
}

const safetyVault = createPhoneVault({ port: createIndexedDBPhoneVaultPort(undefined, "career-finder-phone-safety") });
export const phoneSafety = createPhoneSafety(safetyVault);
export function heldPlan(holds: StopHold[], planId: string): boolean { return holds.some(hold => hold.planId === planId); }
