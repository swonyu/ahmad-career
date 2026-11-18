import { blankSnapshot, blankRecord, updateRecord, recordSchema, parseSnapshot, jobIdentity, stages, type Job, type PhoneSnapshot } from "@career/model";
import { loadPhoneSnapshot, savePhoneSnapshot, createPhoneVault, createIndexedDBPhoneVaultPort } from "@career/vault";
import { phoneSafety } from "@career/safety";

export const fixtureOrigin = "http://127.0.0.1:4183";
export const fixtureOwnerKey = "career-finder:stage-browser-fixture:owner";
export const fixtureOwner = "4b851318da2d-stage-only-20261118-v1";
export const seedLockName = fixtureOwner + ":seed";
export type SeedMode = "interview-record-only" | "stage-corpus-22";
const timestamp = "2026-11-17T18:00:00.000Z";
const safetyReader = createPhoneVault({ port: createIndexedDBPhoneVaultPort(undefined, "career-finder-phone-safety") });
type StorageGuard = () => Promise<unknown>;

function assertOwnedOrigin() {
  if (location.origin !== fixtureOrigin || !isSecureContext || localStorage.getItem(fixtureOwnerKey) !== fixtureOwner) throw Error("Seed refused: this is not the exclusively assigned synthetic stage-fixture origin.");
}

// The public vault list API intentionally accepts only one known owner prefix.
// Check keys, never row values, so a foreign/unknown scope cannot be overlooked.
async function checkGuestKeys() {
  const databases = await indexedDB.databases(), result: { database: string; guestKeys: number }[] = [];
  for (const info of databases) {
    if (!info.name || !["career-finder-phone-vault", "career-finder-phone-safety"].includes(info.name) || info.version !== 1) throw Error("Seed refused: unknown database name or version. Existing data was kept.");
    const databaseName = info.name;
    const count = await new Promise<number>((resolve, reject) => {
      let db: IDBDatabase | undefined, finished = false;
      const finish = (error?: unknown, value = 0) => { if (finished) return; finished = true; clearTimeout(timer); db?.close(); error ? reject(error) : resolve(value); };
      const timer = setTimeout(() => finish(Error("Seed refused: storage inspection did not finish. Existing data was kept.")), 6000);
      const request = indexedDB.open(databaseName);
      request.onupgradeneeded = () => { request.transaction?.abort(); finish(Error("Seed refused: database changed during inspection.")); };
      request.onerror = () => finish(Error("Seed refused: database could not be inspected."));
      request.onblocked = () => finish(Error("Seed refused: another tab blocked database inspection."));
      request.onsuccess = () => {
        db = request.result;
        if (finished) { db.close(); return; }
        if (db.version !== 1 || db.objectStoreNames.length !== 1 || !db.objectStoreNames.contains("snapshots")) { finish(Error("Seed refused: unfamiliar storage schema.")); return; }
        const tx = db.transaction("snapshots", "readonly"), store = tx.objectStore("snapshots");
        if (store.keyPath !== null || store.autoIncrement || store.indexNames.length) { finish(Error("Seed refused: unfamiliar snapshot store schema.")); return; }
        const keys = store.getAllKeys(undefined, 2);
        let count = 0;
        keys.onsuccess = () => { if (keys.result.some(key => key !== "guest")) { finish(Error("Seed refused: another workspace or unknown key is present. No data was changed.")); return; } count = keys.result.length; };
        tx.oncomplete = () => finish(undefined, count);
        tx.onabort = () => finish(Error("Seed refused: storage inspection was interrupted."));
        tx.onerror = () => finish(Error("Seed refused: storage inspection failed."));
      };
    });
    result.push({ database: databaseName, guestKeys: count });
  }
  return result;
}

function requireEmptySnapshot(value: PhoneSnapshot | null, locationLabel: string): PhoneSnapshot {
  const snapshot = value ?? blankSnapshot("guest"), { safety, ...personal } = snapshot;
  if (JSON.stringify(personal) !== JSON.stringify(blankSnapshot("guest")) || safety && (safety.holds.length || safety.recovery.length)) throw Error(`Seed refused: ${locationLabel} contains data, a profile/CV, search state, Stop intent or recovery. Keep it and use a fresh fixture origin; nothing was cleared.`);
  return snapshot;
}

export async function assertSeedableGuest(guardStorage: StorageGuard) {
  await guardStorage(); assertOwnedOrigin();
  const databases = await checkGuestKeys();
  // Use the actual singleton queues first, including any already-started save.
  const current = await loadPhoneSnapshot("guest"), safety = await phoneSafety.load("guest");
  if (safety.holds.length || safety.recovery.length) throw Error("Seed refused: existing Stop or recovery data must be preserved.");
  requireEmptySnapshot(await safetyReader.loadPhoneSnapshot("guest"), "the safety workspace");
  return { current: requireEmptySnapshot(current, "the guest workspace"), databases };
}

function fixtureRecords(mode: SeedMode) {
  if (mode === "interview-record-only") {
    const job: Job = { id: "stage-empty-interview", title: "SYNTHETIC — Interview record-only", company: "Synthetic Employer", location: "Riyadh", country: "SA", url: "https://employer.example/jobs/stage-empty-interview" };
    const base = blankRecord(job), record = recordSchema.parse({ ...updateRecord(base, { ...base, stage: "interview", note: "SYNTHETIC_PRIVATE_NOTE — fixture record for the empty-list recovery check." }), updatedAt: timestamp });
    return { jobs: [] as Job[], records: [record] };
  }
  const entries: { job: Job; record: ReturnType<typeof blankRecord>; bookmarked: boolean }[] = [];
  for (const stage of stages) for (let variant = 0; variant < 4; variant++) {
    const number = entries.length + 1;
    const job: Job = { id: `job-${number}`, title: stage === "interview" && variant === 1 ? "Nurse clinic" : `Role ${stage} ${variant}`, company: "Synthetic Employer", location: "الرياض", country: "SA", url: `https://employer.example/jobs/${number}` };
    const followUpDate = variant === 0 ? { saved: "2026-11-02", applied: "2026-11-20", interview: "2026-12-02", offer: "2026-11-18", closed: "2026-01-01" }[stage] : "";
    const note = stage === "interview" && variant === 2 ? "متابعة خاصة" : `note ${stage} ${variant}`;
    const base = { ...blankRecord(job), updatedAt: timestamp, note, followUpDate };
    let record = base;
    if (stage === "closed" && variant === 1) record = recordSchema.parse({ ...base, stage: "closed", appliedElsewhere: false });
    else if (stage === "closed") { const applied = updateRecord(base, { ...base, stage: "applied" }); record = updateRecord(applied, { ...applied, stage: "closed", followUpDate, note }); }
    else if (stage !== "saved") record = updateRecord(base, { ...base, stage, followUpDate, note });
    entries.push({ job, record: recordSchema.parse({ ...record, updatedAt: timestamp }), bookmarked: variant !== 2 });
  }
  const bookmarks: Job[] = [21, 22].map(number => ({ id: `bare-${number}`, title: `Bare ${number}`, company: "Synthetic Employer", location: "Riyadh", country: "SA", url: `https://employer.example/jobs/bare-${number}` }));
  return { jobs: [...entries.filter(entry => entry.bookmarked).map(entry => entry.job), ...bookmarks], records: entries.map(entry => entry.record) };
}

export async function seedSyntheticWorkspace(mode: SeedMode, guardStorage: StorageGuard) {
  if (mode !== "interview-record-only" && mode !== "stage-corpus-22") throw Error("Unknown synthetic seed mode.");
  if (document.querySelector("#fixture-product .phone-shell")) throw Error("Seed refused: product must be unmounted before writing.");
  const { current, databases } = await assertSeedableGuest(guardStorage);
  const data = fixtureRecords(mode), target = parseSnapshot({ ...current, ...data }, "guest");
  const payload = JSON.stringify(target), digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  const payloadSHA256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  await guardStorage(); assertOwnedOrigin(); await checkGuestKeys();
  // loadPhoneSnapshot above established the vault's expected revision. Its real
  // compare-and-set refuses a concurrent row change; no reset/remove API is used.
  await savePhoneSnapshot("guest", target);
  const readback = await loadPhoneSnapshot("guest");
  if (JSON.stringify(readback) !== payload) throw Error("Seed write completed but readback differed. Product remains unmounted; inspect existing data before any further action.");
  const recordOnly = target.records.filter(record => !target.jobs.some(job => jobIdentity(job.url) === record.identity)).length;
  return { seededAt: new Date().toISOString(), synthetic: true, origin: fixtureOrigin, owner: fixtureOwner, mode, payloadSHA256, counts: { bookmarks: target.jobs.length, records: target.records.length, recordOnly, visibleItems: target.jobs.length + recordOnly, appliedMarked: target.records.filter(record => record.appliedElsewhere).length, followUps: target.records.filter(record => record.followUpDate && record.stage !== "closed").length }, storedStages: Object.fromEntries(stages.map(stage => [stage, target.records.filter(record => record.stage === stage).length])), manifest: { bookmarkIds: target.jobs.map(job => job.id), records: target.records.map(record => ({ identity: record.identity, stage: record.stage, appliedElsewhere: record.appliedElsewhere, followUpDate: record.followUpDate })) }, inspectedDatabases: databases, databaseCleared: false, accountOrEmployerRequest: false, note: "Only an empty, owned guest snapshot was seeded through production vault APIs. All later edits/deletion use the normal product UI. No actual-browser assertion is implied by this seed receipt." };
}
