import { createHash } from "node:crypto";
export const pageSize = 50;
export const source = Object.freeze({ id: "lever:global:lyrahealth", name: "Lyra Health", boardUrl: "https://jobs.lever.co/lyrahealth" });
export const coverageNotice = "Search covers only the selected public employer boards. Results can change or close; open the employer posting to confirm requirements and location eligibility.";
export const limitNotice = "One or more boards reached a job or data-size limit. Filters apply to the retained subset.";
export const scenarios = Object.freeze([
  { id: "capped", label: "250 matches: local 200-result cap", total: 250, status: "complete", sourceStatus: "fresh", limited: false, error: null },
  { id: "exhausted", label: "Exactly 200 matches: exhausted", total: 200, status: "complete", sourceStatus: "fresh", limited: false, error: null },
  { id: "partial", label: "50 retained matches: source timeout", total: 50, status: "partial", sourceStatus: "fresh", limited: false, error: { code: "source_timeout", message: "The employer board could not be refreshed." } },
  { id: "partial-capped", label: "250 retained matches: source timeout + local cap", total: 250, status: "partial", sourceStatus: "fresh", limited: false, error: { code: "source_timeout", message: "The employer board could not be refreshed." } },
  { id: "stale", label: "50 earlier results: stale board", total: 50, status: "partial", sourceStatus: "stale", limited: false, error: { code: "source_unavailable", message: "The employer board could not be refreshed." } },
  { id: "unavailable", label: "No current results: board unavailable", total: 0, status: "unavailable", sourceStatus: "unavailable", limited: false, error: { code: "source_unavailable", message: "The employer board could not be refreshed." } },
  { id: "provider-limit", label: "50 retained results: provider data-size limit", total: 50, status: "partial", sourceStatus: "fresh", limited: true, error: null },
]);
export function findScenario(id) {
  const value = scenarios.find(item => item.id === id);
  if (!value) throw new Error("Unknown synthetic discovery scenario.");
  return value;
}
export function catalog() {
  return { ok: true, version: 1, defaultSources: [source.id], sources: [{ ...source }], limits: { maxSources: 4 }, notice: coverageNotice };
}
export function fixtureError(code, message, httpStatus = 400) {
  return { status: httpStatus, body: { ok: false, error: { code, message } } };
}
export function readFilters(url) {
  const keys = [...url.searchParams.keys()];
  if (keys.some(key => !["source", "q", "location", "remote", "cursor"].includes(key))) throw new Error("Unsupported fixture search parameter.");
  if (["q", "location", "remote", "cursor"].some(key => url.searchParams.getAll(key).length > 1)) throw new Error("Repeated fixture search parameter.");
  const sources = url.searchParams.getAll("source");
  if (sources.length !== 1 || sources[0] !== source.id) throw new Error("Select only the synthetic fixture employer board.");
  const query = url.searchParams.get("q") || "", location = url.searchParams.get("location") || "", remote = url.searchParams.get("remote") || "any";
  if (query.length > 120 || location.length > 100 || !["any", "remote"].includes(remote)) throw new Error("Unsupported fixture search filters.");
  return { sources, query, location, remote };
}
function filterDigest(filters) { return createHash("sha256").update(JSON.stringify(filters)).digest("hex").slice(0, 16); }
function encodeCursor(session, filters, offset) {
  return Buffer.from(JSON.stringify({ fixture: 1, generation: session.generation, scenario: session.scenario.id, filters: filterDigest(filters), offset })).toString("base64url");
}
function readCursor(cursor, session, filters) {
  if (!cursor) return 0;
  if (cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("invalid_cursor");
  let value;
  try { value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); } catch { throw new Error("invalid_cursor"); }
  if (value?.fixture !== 1 || value.generation !== session.generation || value.scenario !== session.scenario.id || value.filters !== filterDigest(filters)) throw new Error("snapshot_changed");
  if (!Number.isInteger(value.offset) || value.offset <= 0 || value.offset % pageSize || value.offset >= session.scenario.total) throw new Error("invalid_cursor");
  return value.offset;
}
function job(index, checkedAt, stale) {
  const suffix = String(index + 1).padStart(12, "0"), label = String(index + 1).padStart(3, "0");
  return {
    id: "fixture-job-" + suffix, title: "Fixture software engineer " + label + " · نموذج",
    company: "Synthetic employer · جهة تجريبية", url: "https://jobs.lever.co/lyrahealth/00000000-0000-4000-8000-" + suffix,
    location: "Riyadh / الرياض · Remote", country: "SA", remote: true,
    summary: "Synthetic browser-check data only. هذه بيانات تجريبية لفحص الواجهة فقط.",
    checkedAt, stale, sourceName: source.name,
  };
}
export function search(url, session) {
  let filters, offset;
  try { filters = readFilters(url); offset = readCursor(url.searchParams.get("cursor"), session, filters); }
  catch (error) { return fixtureError(error.message === "snapshot_changed" ? "cursor_expired" : "invalid_request", "The synthetic search changed. Start this search again.", error.message === "snapshot_changed" ? 409 : 400); }
  const scenario = session.scenario;
  const checkedAt = scenario.sourceStatus === "unavailable" ? null : new Date(Date.parse(session.generatedAt) - (scenario.sourceStatus === "stale" ? 3_600_000 : 0)).toISOString();
  const end = Math.min(scenario.total, offset + pageSize);
  const body = {
    ok: true, version: 1, generatedAt: session.generatedAt, status: scenario.status,
    jobs: Array.from({ length: Math.max(0, end - offset) }, (_, n) => job(offset + n, checkedAt, scenario.sourceStatus === "stale")),
    sources: [{
      ...source, provider: "lever", region: "global", status: scenario.sourceStatus, checkedAt,
      availableCount: scenario.total, matchedCount: scenario.total, limited: scenario.limited, error: scenario.error,
    }],
    nextCursor: end < scenario.total ? encodeCursor(session, filters, end) : null,
    totalMatches: scenario.total, limited: scenario.limited,
    notice: coverageNotice + (scenario.limited ? " " + limitNotice : ""),
  };
  return { status: 200, body, offset, filters };
}
export function discoveryReply(method, url, session) {
  if (method !== "GET") return fixtureError("fixture_mutation_denied", "This fixture supports only synthetic discovery GET requests.", 405);
  if (url.pathname === "/api/discovery/sources") return { status: 200, body: catalog() };
  if (url.pathname === "/api/discovery/search") return search(url, session);
  return fixtureError("fixture_endpoint_denied", "No account, receipt, application, or provider operation exists in this fixture.", 403);
}
