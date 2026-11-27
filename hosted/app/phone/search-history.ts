import { parseDiscoverySourceIdentity } from "../../server/discovery-source-identity.mjs";
import type { DiscoveryPage, Filters } from "./model";

export type SearchHistoryBoard = { sourceId: string; seenIds: string[]; ready: boolean };
export type SearchHistory = {
  version: 1;
  searches: { key: string; lastUsedAt: number; boards: SearchHistoryBoard[] }[];
};
export type SearchNewResult = {
  key: string;
  newIds: string[];
  comparedSourceIds: string[];
  baselinedSourceIds: string[];
  pendingSourceIds: string[];
  coverageLimited: boolean;
  baselineReset: boolean;
};

const MAX_QUERIES = 8, MAX_BOARDS = 4, MAX_BOARD_IDS = 1000, MAX_TOTAL_IDS = 4000, MAX_RESULTS = 200;
const fold = (value: string) => value.trim().normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
const sorted = (values: Iterable<string>) => [...new Set(values)].sort();
const validId = (id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length <= 250 && !/[\x00-\x1f\x7f]/.test(id);
const belongsTo = (id: string, sourceId: string) => id.startsWith(sourceId + ":") && id.length > sourceId.length + 1;
const canonical = (value: string): string | null => {
  try { return parseDiscoverySourceIdentity(value).id; } catch { return null; }
};

export function emptySearchHistory(): SearchHistory { return { version: 1, searches: [] }; }

/** Older saved pages may have reset metadata with an obsolete comparison count. */
export function restoreSearchNewResult(result: SearchNewResult | undefined, filters: Filters): SearchNewResult | null {
  if (!result || result.key !== searchHistoryKey(filters)) return null;
  // The matching query key alone does not prove the saved comparison came
  // from its selected boards. Keep the page, but suppress inconsistent evidence.
  const sources = new Set(filters.sources.map(canonical));
  if ([result.comparedSourceIds, result.baselinedSourceIds, result.pendingSourceIds]
      .some(ids => ids.some(id => !sources.has(id)))) return null;
  if (result.baselineReset) return { ...result, newIds: [], comparedSourceIds: [], coverageLimited: true };
  if (result.newIds.some(id => !validId(id) || !result.comparedSourceIds.some(source => belongsTo(id, source)))) return null;
  return result;
}

/** A restored count is a claim about retained observations, not just a saved marker. */
export function restoreRetainedSearchNewResult(result: SearchNewResult | undefined, filters: Filters, input: SearchHistory | undefined): SearchNewResult | null {
  const restored = restoreSearchNewResult(result, filters);
  if (!restored || restored.baselineReset) return restored;
  const copied = copyHistory(input);
  const search = copied.history.searches.find(value => value.key === restored.key);
  const sources = new Set(filters.sources.map(canonical));
  if (copied.reset || !search || search.boards.some(board => !sources.has(board.sourceId))) return null;
  if (restored.comparedSourceIds.some(source => !search.boards.some(board => board.sourceId === source && board.ready))) return null;
  if (restored.newIds.some(id => !search.boards.some(board => restored.comparedSourceIds.includes(board.sourceId) && board.ready && belongsTo(id, board.sourceId) && board.seenIds.includes(id)))) return null;
  return restored;
}

/** The caller supplies resolved boards, never an implicit server-default selection. */
export function searchHistoryKey(filters: Filters): string | null {
  if (typeof filters.query !== "string" || filters.query.length > 120 || typeof filters.location !== "string" || filters.location.length > 100 ||
      /[\x00-\x1f\x7f]/.test(filters.query + filters.location) || typeof filters.remoteOnly !== "boolean" ||
      !Array.isArray(filters.sources) || filters.sources.length < 1 || filters.sources.length > MAX_BOARDS) return null;
  const sources = filters.sources.map(canonical);
  if (sources.some(value => value === null)) return null;
  // Board aliases/order do not create a different search. The server's exact
  // NFKD/mark-removal/case fold is used without collapsing internal whitespace.
  const key = JSON.stringify([1, fold(filters.query), fold(filters.location), filters.remoteOnly, sorted(sources as string[])]);
  return key.length <= 8192 ? key : null;
}

function copyHistory(input: SearchHistory | undefined): { history: SearchHistory; reset: boolean } {
  if (input === undefined) return { history: emptySearchHistory(), reset: false };
  const invalid = () => ({ history: emptySearchHistory(), reset: true });
  if (!input || input.version !== 1 || !Array.isArray(input.searches) || input.searches.length > MAX_QUERIES) return invalid();
  const keys = new Set<string>(); let total = 0;
  for (const query of input.searches) {
    if (!query || typeof query.key !== "string" || !query.key || query.key.length > 8192 || keys.has(query.key) ||
        !Number.isSafeInteger(query.lastUsedAt) || query.lastUsedAt < 0 || !Array.isArray(query.boards) || query.boards.length > MAX_BOARDS) return invalid();
    keys.add(query.key); const sources = new Set<string>();
    for (const board of query.boards) {
      if (!board || canonical(board.sourceId) !== board.sourceId || sources.has(board.sourceId) || typeof board.ready !== "boolean" ||
          !Array.isArray(board.seenIds) || board.seenIds.length > MAX_BOARD_IDS || new Set(board.seenIds).size !== board.seenIds.length ||
          board.seenIds.some(id => !validId(id) || !belongsTo(id, board.sourceId))) return invalid();
      sources.add(board.sourceId); total += board.seenIds.length;
      if (total > MAX_TOTAL_IDS) return invalid();
    }
  }
  return { history: { version: 1, searches: input.searches.map(query => ({ ...query, boards: query.boards.map(board => ({ ...board, seenIds: [...board.seenIds] })) })) }, reset: false };
}

/**
 * A local observation history, not an employer posting-date or closure claim.
 * `page.jobs` is the accumulated, validated result (at most 200). Supply
 * previousResult only for More in this same search; a fresh Search/Retry omits it.
 * Persist the returned history and result together inside the caller's existing
 * account/scope guard. This function performs no storage or network operations.
 */
export function evaluateSearchHistory({ history: input, filters, page, now, previousResult }: {
  history?: SearchHistory; filters: Filters; page: DiscoveryPage; now: number; previousResult?: SearchNewResult;
}): { history: SearchHistory; result: SearchNewResult | null } {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("A safe search observation time is required.");
  const key = searchHistoryKey(filters), copied = copyHistory(input), history = copied.history;
  if (key === null) return { history, result: null };
  const sourceIds = sorted(filters.sources.map(value => canonical(value)!));
  const previous = previousResult?.key === key ? previousResult : undefined;
  let baselineReset = copied.reset || previous?.baselineReset === true;
  let coverageLimited = page.limited || baselineReset;
  const currentIds = new Set<string>(), observed = new Map(sourceIds.map(id => [id, new Set<string>()]));
  const uncertain = new Set<string>();
  for (const job of page.jobs) {
    const sourceId = validId(job.id) ? sourceIds.find(id => belongsTo(job.id, id)) : undefined;
    if (!sourceId) { coverageLimited = true; continue; }
    currentIds.add(job.id);
    if (job.stale) uncertain.add(sourceId); else observed.get(sourceId)!.add(job.id);
  }
  // The validated UI cap is also a conservative boundary for direct callers.
  if (page.jobs.length > MAX_RESULTS) return { history, result: { key, newIds: [], comparedSourceIds: [], baselinedSourceIds: [], pendingSourceIds: sourceIds, coverageLimited: true, baselineReset } };

  const existing = history.searches.find(value => value.key === key);
  const mismatched = existing?.boards.some(board => !sourceIds.includes(board.sourceId)) === true;
  // Imported history has structurally validated but opaque keys. An unrelated
  // board list cannot be extended into a fifth board or selectively repaired.
  if (mismatched) { history.searches = history.searches.filter(value => value !== existing); baselineReset = true; }
  const query = !mismatched && existing ? existing : { key, lastUsedAt: now, boards: [] };
  const compared = new Set((previous?.comparedSourceIds ?? []).filter(id => sourceIds.includes(id)));
  const baselined = new Set((previous?.baselinedSourceIds ?? []).filter(id => sourceIds.includes(id)));
  const newIds = new Set((previous?.newIds ?? []).filter(id => currentIds.has(id)));
  for (const sourceId of sourceIds) {
    let board = query.boards.find(value => value.sourceId === sourceId);
    if (!board) { board = { sourceId, seenIds: [], ready: false }; query.boards.push(board); }
    const statuses = page.sources.filter(value => value.id === sourceId);
    const source = statuses.length === 1 ? statuses[0] : undefined;
    const eligible = source && ["fresh", "cached"].includes(source.status) && source.error === null;
    if (!eligible) { coverageLimited = true; continue; }
    const ids = observed.get(sourceId)!;
    const complete = !source.limited && !uncertain.has(sourceId) && Number.isInteger(source.matchedCount) && source.matchedCount >= 0 && source.matchedCount <= 500 && ids.size === source.matchedCount;
    if (!complete) coverageLimited = true;
    const seen = new Set(board.seenIds);
    if (board.ready && !baselined.has(sourceId) && !baselineReset) {
      compared.add(sourceId);
      for (const id of ids) if (!seen.has(id)) newIds.add(id);
    }
    for (const id of ids) seen.add(id);
    if (seen.size > MAX_BOARD_IDS) {
      // Reset the whole board baseline, never selectively forget older IDs.
      // This search (including later More pages) is explicitly silent.
      board.seenIds = sorted(ids); board.ready = complete; baselineReset = true;
      if (complete) baselined.add(sourceId);
    } else {
      board.seenIds = sorted(seen);
      if (!board.ready && complete) { board.ready = true; baselined.add(sourceId); }
    }
  }
  query.lastUsedAt = now;
  if (!history.searches.includes(query)) history.searches.push(query);
  const totalIds = () => history.searches.reduce((count, value) => count + value.boards.reduce((sum, board) => sum + board.seenIds.length, 0), 0);
  while (history.searches.length > MAX_QUERIES || totalIds() > MAX_TOTAL_IDS) {
    const oldest = history.searches.filter(value => value !== query).sort((a, b) => a.lastUsedAt - b.lastUsedAt || a.key.localeCompare(b.key))[0];
    if (!oldest) throw new Error("Search history bounds could not be maintained.");
    history.searches.splice(history.searches.indexOf(oldest), 1); baselineReset = true;
  }
  // A reset intentionally suppresses the entire comparison, not just its badges.
  // Otherwise the UI offers New only and falsely describes a suppressed count as zero.
  if (baselineReset) { newIds.clear(); compared.clear(); coverageLimited = true; }
  history.searches.sort((a, b) => b.lastUsedAt - a.lastUsedAt || a.key.localeCompare(b.key));
  return { history, result: {
    key, newIds: sorted(newIds), comparedSourceIds: sorted(compared), baselinedSourceIds: sorted(baselined),
    pendingSourceIds: sourceIds.filter(id => !query.boards.find(board => board.sourceId === id)?.ready), coverageLimited, baselineReset,
  } };
}
