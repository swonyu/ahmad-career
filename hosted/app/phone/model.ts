import { z } from "zod";

export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const PHONE_SCHEMA = 1;
export const stages = ["saved", "applied", "interview", "offer", "closed"] as const;
export const stageNames: Record<(typeof stages)[number], string> = { saved: "Saved for later", applied: "Applied", interview: "Interview", offer: "Offer", closed: "Closed" };
export const countryCodes = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW".split(" ");

export function publicURL(input: string): string {
  if (typeof input !== "string" || input.length > 2048 || /[\s\\\x00-\x1f\x7f]/u.test(input)) throw Error("Enter a complete public HTTPS link without spaces.");
  let url: URL;
  try { url = new URL(input); } catch { throw Error("Enter a complete public HTTPS link without spaces."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443" || !url.hostname.includes(".") || /^[\d.]+$/.test(url.hostname) || url.hostname.startsWith("[") || /(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)) throw Error("Use a public HTTPS link without a password or custom port.");
  url.hash = "";
  return url.href;
}

export function linkedInURL(input: string): string {
  const fail = () => { throw Error("Use your personal LinkedIn profile link, starting with https://www.linkedin.com/in/."); };
  if (typeof input !== "string" || input.length > 2048 || /[\x00-\x20\x7f\\]/.test(input)) return fail();
  const parts = input.match(/^https:\/\/((?:www\.|[a-z]{2,3}\.)?linkedin\.com(?::443)?)([^?#]*)(?:\?[^#]*)?(?:#.*)?$/i);
  if (!parts) return fail();
  let decoded: string, slug: string;
  try {
    decoded = decodeURIComponent(input);
    const path = parts[2].match(/^\/in\/([^/]+)\/?$/);
    if (!path) return fail();
    slug = decodeURIComponent(path[1]);
  } catch { return fail(); }
  if (/[\x00-\x1f\x7f-\x9f]|\p{Cf}/u.test(decoded) || !slug || slug === "." || slug === ".." || /[/\\%\s\x00-\x1f\x7f-\x9f]/u.test(slug)) return fail();
  let encoded: string;
  try { encoded = encodeURIComponent(slug).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`); } catch { return fail(); }
  const value = `https://www.linkedin.com/in/${encoded}`;
  if (value.length > 2048) return fail();
  return value;
}

export function jobIdentity(input: string): string {
  const url = new URL(publicURL(input));
  const lever = url.pathname.match(/^\/([a-z0-9][a-z0-9_-]{0,79})\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\/apply)?\/?$/i);
  if (["jobs.lever.co", "jobs.eu.lever.co"].includes(url.hostname) && lever) return `${url.origin}/${lever[1].toLowerCase()}/${lever[2].toLowerCase()}`;
  for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key) || ["gclid", "fbclid", "lever-source", "lever-origin"].includes(key)) url.searchParams.delete(key);
  if (["jobs.lever.co", "jobs.eu.lever.co"].includes(url.hostname)) url.pathname = url.pathname.replace(/\/apply\/?$/, "");
  url.pathname = url.pathname.replace(/\/$/, "");
  url.searchParams.sort();
  return url.href;
}

export function civilDate(input: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
  const [year, month, day] = input.split("-").map(Number);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}
export function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function friendlyDate(input: string, language?: "en" | "ar"): string {
  if (!civilDate(input)) return input;
  const [year, month, day] = input.split("-").map(Number);
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA-u-ca-gregory-nu-arab" : language, { year: "numeric", month: "short", day: "numeric" }).format(new Date(year, month - 1, day, 12));
}
const boundedText = (max: number) => z.string().max(max).refine(v => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v), "Unsupported control characters");
const https = z.string().max(2048).refine(v => { try { publicURL(v); return true; } catch { return false; } }, "Invalid HTTPS URL");
const timestamp = z.string().max(80).refine(v => Number.isFinite(Date.parse(v)), "Invalid timestamp");
const date = z.string().refine(v => v === "" || civilDate(v), "Choose a valid calendar date");
const linkedin = z.string().max(2048).refine(v => { if (!v) return true; try { return linkedInURL(v) === v; } catch { return false; } }, "Invalid LinkedIn link");
export const resumeSchema = z.object({ name: boundedText(180).refine(value => /\.pdf$/i.test(value) && !/[/\\:]/.test(value) && !value.startsWith("."), "Use a plain PDF filename"), mime: z.literal("application/pdf"), size: z.number().int().min(8).max(MAX_PDF_BYTES), sha256: z.string().regex(/^[a-f0-9]{64}$/), dataBase64: z.string().max(Math.ceil(MAX_PDF_BYTES / 3) * 4).refine(value => value.length >= 12 && value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value) && value.startsWith("JVBERi0"), "Invalid PDF bytes").optional() }).refine(value => !value.dataBase64 || value.dataBase64.length / 4 * 3 - (value.dataBase64.endsWith("==") ? 2 : value.dataBase64.endsWith("=") ? 1 : 0) === value.size, "PDF byte size does not match its metadata");
export const profileSchema = z.object({
  firstName: boundedText(150), lastName: boundedText(150), email: boundedText(254), phone: boundedText(150), city: boundedText(150), country: z.string().refine(v => v === "" || countryCodes.includes(v)), headline: boundedText(500),
  skills: z.array(boundedText(100)).max(30), targetRoles: z.array(boundedText(100)).max(30), targetCountries: z.array(z.string().max(2).refine(value => countryCodes.includes(value), "Choose a supported country or region")).max(30), workModes: z.array(z.enum(["on-site", "hybrid", "remote"])).max(3), experienceLevel: z.enum(["any", "entry", "mid", "senior"]),
  website: z.union([z.literal(""), https]), linkedin: linkedin.default(""), resume: resumeSchema.nullable(), revision: z.number().int().min(0),
});
export const draftProfileSchema = profileSchema.extend({ website: boundedText(2048), linkedin: boundedText(2048) });
export type Profile = z.infer<typeof profileSchema>;
export function blankProfile(): Profile { return { firstName: "", lastName: "", email: "", phone: "", city: "", country: "", headline: "", skills: [], targetRoles: [], targetCountries: [], workModes: [], experienceLevel: "any", website: "", linkedin: "", resume: null, revision: 0 }; }
export function profileEssentials(profile: Profile) {
  return { name: Boolean(profile.firstName.trim()), email: /^[^\s@<>]{1,64}@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(profile.email.trim()), resume: Boolean(profile.resume) };
}
export function profileRequest(profile: Profile) {
  profile = draftProfileSchema.parse(profile);
  const { resume, ...fieldsWithRevision } = profile;
  const fields = { ...fieldsWithRevision }; delete (fields as Partial<Profile>).revision;
  return { ...fields, firstName: profile.firstName.trim(), lastName: profile.lastName.trim(), email: profile.email.trim().toLowerCase(), phone: profile.phone.trim(), city: profile.city.trim(), headline: profile.headline.trim(), skills: [...new Set(profile.skills.map(s => s.trim()).filter(Boolean))], targetRoles: [...new Set(profile.targetRoles.map(s => s.trim()).filter(Boolean))], website: profile.website.trim() ? publicURL(profile.website.trim()) : "", linkedin: profile.linkedin.trim() ? linkedInURL(profile.linkedin.trim()) : "", ...(resume === null ? { resume: null } : resume.dataBase64 ? { resume: { name: resume.name, mime: resume.mime, dataBase64: resume.dataBase64 } } : {}) };
}

export const jobSchema = z.object({ id: z.string().min(1).max(250), title: boundedText(500), company: boundedText(250), url: https, location: boundedText(500).default(""), country: z.string().max(2).default(""), remoteId: z.string().uuid().optional(), checkedAt: timestamp.optional(), sourceName: boundedText(150).optional(), summary: boundedText(1000).optional() });
export type Job = z.infer<typeof jobSchema>;
// Preserve partially entered links locally; public-URL validation still runs on Save.
export const jobLinkDraftSchema = z.object({ url: boundedText(2048), title: boundedText(500), company: boundedText(250), location: boundedText(500) });
export type JobLinkDraft = z.infer<typeof jobLinkDraftSchema>;
export function blankJobLinkDraft(): JobLinkDraft { return { url: "", title: "", company: "", location: "" }; }
export const recordSchema = z.object({ identity: https.refine(value => { try { return value === jobIdentity(value); } catch { return false; } }, "Application identity must be canonical"), title: boundedText(500), company: boundedText(250), location: boundedText(500).optional(), stage: z.enum(stages), appliedElsewhere: z.boolean(), appliedDate: date, followUpDate: date, note: boundedText(5000), updatedAt: timestamp }).refine(value => !["applied", "interview", "offer"].includes(value.stage) || value.appliedElsewhere, "An applied stage must preserve its applied mark");
export type ApplicationRecord = z.infer<typeof recordSchema>;
export function blankRecord(job: Job): ApplicationRecord { return { identity: jobIdentity(job.url), title: job.title, company: job.company, location: job.location, stage: "saved", appliedElsewhere: false, appliedDate: "", followUpDate: "", note: "", updatedAt: new Date().toISOString() }; }
export function updateRecord(previous: ApplicationRecord, draft: ApplicationRecord, clearApplied = false): ApplicationRecord {
  const value = recordSchema.parse({ ...draft, appliedElsewhere: ["applied", "interview", "offer"].includes(draft.stage) || (previous.appliedElsewhere && !clearApplied) });
  if (value.identity !== previous.identity) throw Error("This application record changed. Open it again before saving.");
  const selectedApplied = ["applied", "interview", "offer"].includes(value.stage);
  if (previous.appliedElsewhere && value.stage === "saved" && !clearApplied) throw Error("Confirm marking this job as not applied before saving.");
  return { ...value, appliedElsewhere: selectedApplied || (previous.appliedElsewhere && !clearApplied), updatedAt: new Date().toISOString() };
}

export const filtersSchema = z.object({ query: boundedText(120), location: boundedText(100), remoteOnly: z.boolean(), sources: z.array(z.string().max(2048)).max(4) });
export type Filters = z.infer<typeof filtersSchema>;
export const emptyFilters: Filters = { query: "", location: "", remoteOnly: false, sources: [] };
export const discoveryJobSchema = z.object({ id: z.string().max(250), title: boundedText(500), company: boundedText(250), url: https, location: boundedText(500), country: z.string().nullable(), remote: z.boolean().nullable(), summary: boundedText(1000), checkedAt: timestamp, stale: z.boolean(), sourceName: boundedText(150) });
// Search source statuses follow discovery-contract.json. The optional legacy region
// is retained when opening older encrypted snapshots, but is never required.
export const discoveryPageSchema = z.object({ ok: z.literal(true), version: z.literal(1), generatedAt: timestamp, status: z.enum(["complete", "partial", "unavailable"]), jobs: z.array(discoveryJobSchema).max(50), sources: z.array(z.object({ id: boundedText(150), name: boundedText(150), provider: z.enum(["greenhouse", "lever"]), region: z.enum(["global", "eu"]).optional(), boardUrl: https, status: z.enum(["fresh", "cached", "stale", "unavailable"]), checkedAt: timestamp.nullable(), availableCount: z.number().int().min(0).max(500), matchedCount: z.number().int().min(0).max(500), limited: z.boolean(), error: z.object({ code: boundedText(100), message: boundedText(1000) }).nullable() })).max(4), nextCursor: z.string().max(8192).nullable(), totalMatches: z.number().int().min(0).max(2000), limited: z.boolean(), notice: boundedText(2000) });
export type DiscoveryPage = z.infer<typeof discoveryPageSchema>;
export const catalogSchema = z.object({ ok: z.literal(true), version: z.literal(1), defaultSources: z.array(boundedText(150)).max(4), sources: z.array(z.object({ id: boundedText(150), name: boundedText(150), boardUrl: https })).max(100), limits: z.object({ maxSources: z.number().int().min(1).max(4) }), notice: boundedText(2000) }).transform(v => ({ defaults: v.defaultSources, sources: v.sources, maxSources: v.limits.maxSources, notice: v.notice }));
export type Catalog = z.infer<typeof catalogSchema>;
export function discoveryPath(filters: Filters, cursor?: string | null): string {
  const f = filtersSchema.parse(filters), query = new URLSearchParams();
  for (const source of f.sources) query.append("source", source);
  query.set("q", f.query.trim()); query.set("location", f.location.trim()); query.set("remote", f.remoteOnly ? "remote" : "any");
  if (cursor) query.set("cursor", cursor);
  return "/api/discovery/search?" + query.toString();
}
export function linkedInSearch(filters: Filters): string {
  const f = filtersSchema.pick({ query: true, location: true }).parse(filters), query = new URLSearchParams();
  if (f.query.trim()) query.set("keywords", f.query.trim());
  if (f.location.trim()) query.set("location", f.location.trim());
  return "https://www.linkedin.com/jobs/search/" + (query.size ? "?" + query.toString() : "");
}

export const employerAnswerSchema = z.object({ comments: boundedText(5000), consentStore: z.boolean(), consentMarketing: z.boolean() });
export type EmployerAnswer = z.infer<typeof employerAnswerSchema>;
export const blankEmployerAnswer = (): EmployerAnswer => ({ comments: "", consentStore: false, consentMarketing: false });
export function reviewRequest(workspaceId: string, jobIds: string[], comments: string, consentStore: boolean, consentMarketing: boolean, individualAnswers?: Record<string, EmployerAnswer>) {
  z.string().uuid().parse(workspaceId); z.array(z.string().uuid()).min(1).max(20).parse(jobIds); boundedText(5000).parse(comments);
  if (new Set(jobIds).size !== jobIds.length || typeof consentStore !== "boolean" || typeof consentMarketing !== "boolean") throw Error("Choose distinct jobs and explicit permission answers.");
  const answers = Object.fromEntries(jobIds.map(id => [id, employerAnswerSchema.parse(individualAnswers ? individualAnswers[id] : { comments, consentStore, consentMarketing })]));
  const body = { expectedWorkspaceId: workspaceId, jobIds, answers, manualAppliedJobIds: [] as string[], reviewSchema: 3 };
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 32 * 1024) throw Error(`Your message is too long for ${jobIds.length} selected jobs in one review. Shorten the message or select fewer jobs; nothing was submitted.`);
  return body;
}

const summarySchema = z.object({ name: boundedText(400), email: boundedText(254), phone: boundedText(150), website: z.union([z.literal(""), https]), linkedin: linkedin.optional(), comments: boundedText(5000), consentStore: z.boolean().optional(), consentMarketing: z.boolean().optional() });
export const reviewItemSchema = z.object({ jobId: z.string().uuid(), job: z.object({ id: z.string().uuid(), url: https, title: boundedText(500), company: boundedText(250), location: boundedText(500), country: z.string() }), title: boundedText(500), company: boundedText(250), state: z.enum(["ready", "blocked", "dispatching", "confirmed", "uncertain", "rate_limited", "rejected", "cancelled"]), reason: boundedText(2000), payloadSummary: summarySchema, resume: resumeSchema.nullable(), privacyPolicyUrl: https.nullable(), requirementsRevision: z.string().nullable(), applicationId: z.string().optional(), retryAt: timestamp.nullable().optional() });
export const planSchema = z.object({ id: z.string().uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/), profileRevision: z.number().int().min(0), createdAt: timestamp, expiresAt: timestamp, stopped: z.boolean(), approvedAt: timestamp.nullable(), items: z.array(reviewItemSchema).min(1).max(20) });
export type Plan = z.infer<typeof planSchema>;
export const receiptSchema = z.object({ id: z.string().uuid(), planId: z.string().uuid(), jobId: z.string().uuid(), title: boundedText(500), company: boundedText(250), url: https, state: z.enum(["ready", "blocked", "dispatching", "confirmed", "uncertain", "rate_limited", "rejected", "cancelled"]), applicationId: boundedText(500).optional(), createdAt: timestamp, mode: z.enum(["local", "test"]), evidenceMode: z.enum(["live", "test"]), dispatchCount: z.number().int().min(0).optional(), dispatchedAt: timestamp.nullable().optional(), error: z.object({ message: boundedText(2000), code: z.string() }).nullable(), retryAt: timestamp.optional() }).passthrough().refine(value => value.evidenceMode === (value.mode === "test" ? "test" : "live"), "Receipt evidence does not match its service mode").refine(value => value.state !== "confirmed" || Boolean(value.applicationId?.trim()), "A confirmed receipt needs an employer application ID");
export type Receipt = z.infer<typeof receiptSchema>;
export function receiptLabel(receipt: Receipt): string {
  if (receipt.state === "confirmed") return receipt.applicationId?.trim() ? receipt.evidenceMode === "live" && receipt.mode === "local" ? "Submission confirmed" : "Test receipt — not sent to an employer" : "Outcome needs checking";
  if (receipt.state === "cancelled") return (receipt.dispatchCount ?? 0) > 0 || receipt.dispatchedAt ? "Retry stopped — earlier request recorded" : receipt.dispatchCount === 0 ? "Stopped before sending" : "Unsent work stopped — check earlier request details";
  return ({ ready: "Approved, waiting to send", dispatching: "Checking submission", uncertain: "Outcome needs checking", rate_limited: "Waiting for employer cooldown", rejected: "Employer rejected the request", blocked: "Submission blocked" } as const)[receipt.state];
}
export const workspaceSchema = z.object({ ok: z.literal(true), accountId: z.string().min(1), accountEmail: z.string(), confirmedEmail: z.string(), emailUpdateRequired: z.boolean(), deleting: z.boolean().default(false), workspaceId: z.string().uuid().nullable(), mode: z.enum(["local", "test"]), profile: profileSchema, jobs: z.array(jobSchema).max(200), attempts: z.array(receiptSchema).max(500), capabilities: z.object({ liveEnabled: z.boolean(), linkedinProfile: z.boolean().optional(), mode: z.enum(["local", "test"]), coverage: z.string() }).passthrough(), recoverablePlans: z.array(planSchema).max(100), activePlanIds: z.array(z.string().uuid()).max(100) });
export type Workspace = z.infer<typeof workspaceSchema>;
export function checkReview(plan: Plan, profile: Profile, jobs: Job[], records: ApplicationRecord[]) {
  plan = planSchema.parse(plan); profile = profileSchema.parse(profile); records = z.array(recordSchema).max(500).parse(records);
  if (plan.stopped || Date.parse(plan.expiresAt) <= Date.now() || plan.profileRevision !== profile.revision) throw Error("This review changed or expired. Prepare a new review.");
  const manuallyApplied = new Set(records.filter(r => r.appliedElsewhere).map(r => r.identity));
  for (const item of plan.items.filter(i => ["ready", "rate_limited"].includes(i.state))) {
    const job = jobs.find(j => (j.remoteId ?? j.id) === item.jobId);
    if (!job || item.job.id !== item.jobId || jobIdentity(item.job.url) !== jobIdentity(job.url) || item.title !== item.job.title || item.company !== item.job.company || manuallyApplied.has(jobIdentity(job.url))) throw Error("A selected application is already recorded or changed. Review your saved jobs first.");
    if ((item.payloadSummary.linkedin ?? "") !== profile.linkedin || item.payloadSummary.email !== profile.email || item.payloadSummary.phone !== profile.phone || item.payloadSummary.website !== profile.website || item.payloadSummary.name !== [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() || item.resume?.sha256 !== profile.resume?.sha256 || item.resume?.name !== profile.resume?.name || item.resume?.size !== profile.resume?.size) throw Error("The review does not match your saved profile and CV. Refresh before approving.");
  }
}

// Recovery drafts may contain an unfinished stage change. Only an explicit save
// passes through updateRecord and the applied-mark confirmation.
export const recordDraftSchema = z.object(recordSchema.shape);
export const recoveryDraftSchema = z.object({ id: z.string().uuid(), savedAt: timestamp, profile: draftProfileSchema.optional(), record: z.object({ job: jobSchema, original: recordSchema, draft: recordDraftSchema, existed: z.boolean() }).optional(), jobLink: jobLinkDraftSchema.optional() }).refine(value => [value.profile, value.record, value.jobLink].filter(Boolean).length === 1, "Choose one recovery draft type");
export type RecoveryDraft = z.infer<typeof recoveryDraftSchema>;
export const stopHoldSchema = z.object({ planId: z.string().uuid(), requestedAt: timestamp, confirmed: z.boolean() });
export type StopHold = z.infer<typeof stopHoldSchema>;
export const phoneSafetySchema = z.object({ holds: z.array(stopHoldSchema).max(100), recovery: z.array(recoveryDraftSchema).max(20) });
export type PhoneSafety = z.infer<typeof phoneSafetySchema>;
// Search familiarity belongs to this encrypted profile scope. Older snapshots
// omit these optional fields and establish a new baseline without new-job badges.
const searchIdentity = boundedText(250).min(1);
const searchSourceIdentity = z.string().max(150).regex(/^(?:greenhouse:[a-z0-9][a-z0-9_-]{0,79}|lever:(?:global|eu):[a-z0-9][a-z0-9_-]{0,79})$/);
const distinctStrings = <T extends z.ZodType<string>>(value: T, maximum: number) => z.array(value).max(maximum).refine(items => new Set(items).size === items.length, "Search history contains duplicate identities");
const searchHistoryBoardSchema = z.object({ sourceId: searchSourceIdentity, seenIds: distinctStrings(searchIdentity, 1000), ready: z.boolean() }).refine(board => board.seenIds.every(id => id.startsWith(board.sourceId + ":")), "Posting history must belong to its employer board");
export const searchHistorySchema = z.object({ version: z.literal(1), searches: z.array(z.object({
  key: boundedText(8192).min(1), lastUsedAt: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  boards: z.array(searchHistoryBoardSchema).max(4).refine(boards => new Set(boards.map(board => board.sourceId)).size === boards.length, "Search history contains duplicate boards"),
})).max(8) }).refine(value => new Set(value.searches.map(search => search.key)).size === value.searches.length, "Search history contains duplicate searches")
  .refine(value => value.searches.reduce((total, search) => total + search.boards.reduce((count, board) => count + board.seenIds.length, 0), 0) <= 4000, "Search history exceeds its local limit");
export const searchNewResultSchema = z.object({
  key: boundedText(8192).min(1), newIds: distinctStrings(searchIdentity, 200),
  comparedSourceIds: distinctStrings(searchSourceIdentity, 4), baselinedSourceIds: distinctStrings(searchSourceIdentity, 4), pendingSourceIds: distinctStrings(searchSourceIdentity, 4),
  coverageLimited: z.boolean(), baselineReset: z.boolean(),
});
export type SearchHistory = z.infer<typeof searchHistorySchema>;
export type SearchNewResult = z.infer<typeof searchNewResultSchema>;

export const phoneSnapshotSchema = z.object({ schema: z.literal(PHONE_SCHEMA), scope: z.string().min(1).max(600), profile: draftProfileSchema, profileDirty: z.boolean(), jobs: z.array(jobSchema).max(200), records: z.array(recordSchema).max(500), filters: filtersSchema, lastSearch: z.object({ filters: filtersSchema, page: discoveryPageSchema.extend({ jobs: z.array(discoveryJobSchema).max(200) }), newResult: searchNewResultSchema.optional() }).nullable(), searchHistory: searchHistorySchema.optional(), safety: phoneSafetySchema.optional() });
export type PhoneSnapshot = z.infer<typeof phoneSnapshotSchema>;
export function blankSnapshot(scope: string): PhoneSnapshot { return { schema: PHONE_SCHEMA, scope, profile: blankProfile(), profileDirty: false, jobs: [], records: [], filters: { ...emptyFilters, sources: [] }, lastSearch: null }; }
export function parseSnapshot(value: unknown, scope: string): PhoneSnapshot {
  const data = phoneSnapshotSchema.parse(value);
  if (data.scope !== scope) throw Error("This saved draft belongs to another account. Your previous data was preserved.");
  if (new Set(data.jobs.map(j => jobIdentity(j.url))).size !== data.jobs.length || new Set(data.records.map(r => r.identity)).size !== data.records.length) throw Error("This saved draft contains conflicting records. Your previous data was preserved.");
  if (data.lastSearch?.newResult && !data.lastSearch.newResult.newIds.every(id => data.lastSearch?.page.jobs.some(job => job.id === id))) throw Error("This saved search contains conflicting new-opening markers. Your previous data was preserved.");
  return data;
}
