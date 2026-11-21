import { jobIdentity, retainRecordJobContext, type ApplicationRecord, type Job } from "./model";

export type SavedComparisonRow = { identity: string; job: Job; record?: ApplicationRecord; bookmarked: boolean };

/** Rebuild a retained record without inventing a source or a fresh check. */
export function jobFromRecord(record: ApplicationRecord): Job {
  return { id: record.identity, title: record.title, company: record.company, url: record.identity,
    location: record.location ?? "", country: "",
    ...(record.sourceName ? { sourceName: record.sourceName } : {}),
    ...(record.checkedAt ? { checkedAt: record.checkedAt } : {}) };
}

/** Posting identity alone joins a bookmark to its own private application record. */
export function savedComparisonRows(jobs: readonly Job[], records: readonly ApplicationRecord[]): SavedComparisonRow[] {
  const recordsByID = new Map(records.map(record => [record.identity, record]));
  const rows = new Map<string, SavedComparisonRow>();
  for (const job of jobs) {
    const identity = jobIdentity(job.url);
    if (rows.has(identity)) continue;
    const record = recordsByID.get(identity);
    const context = record ? retainRecordJobContext(record, job) : undefined;
    rows.set(identity, { identity, bookmarked: true, record,
      job: context ? { ...job, location: context.location ?? job.location,
        ...(context.sourceName ? { sourceName: context.sourceName } : {}),
        ...(context.checkedAt ? { checkedAt: context.checkedAt } : {}) } : job });
  }
  for (const record of records) if (!rows.has(record.identity)) {
    rows.set(record.identity, { identity: record.identity, job: jobFromRecord(record), record, bookmarked: false });
  }
  return [...rows.values()];
}

export function availableComparisonSelection(selected: readonly string[], rows: readonly SavedComparisonRow[]): string[] {
  const available = new Set(rows.map(row => row.identity));
  return [...new Set(selected)].filter(identity => available.has(identity)).slice(0, 2);
}

export function toggleComparisonSelection(selected: readonly string[], identity: string, rows: readonly SavedComparisonRow[]): string[] {
  const current = availableComparisonSelection(selected, rows);
  if (current.includes(identity)) return current.filter(value => value !== identity);
  return current.length < 2 && rows.some(row => row.identity === identity) ? [...current, identity] : current;
}
