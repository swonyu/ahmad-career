import { civilDate, recordSchema, stageNames, type ApplicationRecord, type Job } from "./model";

type Copy = (source: string) => string;
const originalCopy: Copy = source => source;

/** Comparison only. Keep hamza, alif forms, ta marbuta and alif maqsura distinct. */
export function savedSearchText(value: string): string {
  return value.normalize("NFC").replace(/[\u0640\u064b-\u0652\u0670]/gu, "").toLowerCase();
}

/** Every whitespace-delimited term may match a different field of this one job. */
export function matchesSavedSearch(job: Pick<Job, "title" | "company" | "location">, record: Pick<ApplicationRecord, "note"> | undefined, query: string): boolean {
  const terms = savedSearchText(query).trim().split(/\s+/u).filter(Boolean);
  if (!terms.length) return true;
  const fields = [job.title, job.company, job.location, record?.note ?? ""].map(savedSearchText);
  return terms.every(term => fields.some(value => value.includes(term)));
}

export type SavedView = "all" | "applied" | "followups";
export type SavedStage = "all" | ApplicationRecord["stage"];

/** View state only. A bookmark with no record counts as Saved and is not stored. */
export function matchesSavedList(job: Pick<Job, "title" | "company" | "location">, record: Pick<ApplicationRecord, "note" | "stage" | "appliedElsewhere" | "followUpDate"> | undefined, query: string, view: SavedView, stage: SavedStage): boolean {
  const viewMatch = view === "all" || view === "applied" && Boolean(record?.appliedElsewhere) || view === "followups" && Boolean(record?.followUpDate) && record?.stage !== "closed";
  const stageMatch = stage === "all" || (record?.stage ?? "saved") === stage;
  return matchesSavedSearch(job, record, query) && viewMatch && stageMatch;
}

export function savedListEmptyMessage(input: { query: string; view: SavedView; stage: SavedStage }): { title: string; detail: string; clear: boolean } {
  const query = input.query.trim();
  if (input.stage !== "all" && (query || input.view !== "all")) return { title: "No jobs match these filters.", detail: "Nothing matches this search, view, and application stage together. Clear search and filters to see every saved job and record.", clear: true };
  if (input.stage !== "all") return { title: "No jobs at this stage.", detail: "No jobs are at this stage. A saved job without an application record is listed under Saved for later. Clear search and filters to see all jobs.", clear: true };
  if (query) return { title: "No matching saved jobs.", detail: "Try another word, or clear the search and filters to see your saved jobs and notes.", clear: true };
  if (input.view === "followups") return { title: "No follow-ups scheduled", detail: "Open a saved job, choose Edit application record, and add a follow-up date. Closed records stay out of this list.", clear: true };
  if (input.view === "applied") return { title: "No applications recorded", detail: "When you apply on an employer’s website, mark it in your application record.", clear: true };
  return { title: "No saved jobs yet", detail: "Save a job from Search or add a job link from any public employer page.", clear: false };
}

function csvCell(value: string): string {
  // Inspect compatibility forms, leading controls and text-quote prefixes too.
  // A visible literal marker survives more import paths than apostrophe-only
  // escaping. This is a viewing export; JSON retains the unmodified values.
  const formulaLike = /^[\s\p{Cf}'"]*[=+\-@\t\r\n\u0000]/u.test(value.normalize("NFKC"));
  const text = formulaLike ? "Text: " + value : value;
  return '"' + text.replace(/"/g, '""') + '"';
}

/** Only saved application records: no profile, CV, credentials or recovery data. */
export function applicationRecordsCSV(records: readonly ApplicationRecord[], copy: Copy = originalCopy): string {
  const headers = ["Job title", "Employer", "Job link", "Stage (self-entered)", "Marked applied (self-entered)", "Applied date (self-entered)", "Follow-up date (self-entered)", "Private note", "Last edited (not application time)"].map(label => copy(label));
  const rows = records.map(input => {
    const record = recordSchema.parse(input);
    return [record.title, record.company, record.identity, copy(stageNames[record.stage]), copy(record.appliedElsewhere ? "Yes" : "No"), record.appliedDate, record.followUpDate, record.note, record.updatedAt];
  });
  return "\ufeff" + [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function calendarText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

function foldCalendarLine(line: string): string {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let current = "", octets = 0;
  // Iterate code points, so no UTF-8 sequence is split across a folded line.
  for (const character of line) {
    const width = encoder.encode(character).byteLength;
    if (octets + width > 75) { lines.push(current); current = " "; octets = 1; }
    current += character; octets += width;
  }
  lines.push(current);
  return lines.join("\r\n");
}

/** RFC 5545 DATE + one day: no zone conversion, attendees, alarms or private notes. */
export async function followUpCalendar(input: ApplicationRecord, copy: Copy = originalCopy): Promise<string> {
  if (!civilDate(input.followUpDate)) throw Error("Save a valid follow-up date before exporting a calendar reminder.");
  const record = recordSchema.parse(input);
  const bytes = new TextEncoder().encode(["career-finder-follow-up-v1", record.identity, record.followUpDate].join("\n"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const uid = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Career Finder//Follow-up reminder//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:career-finder-follow-up-${uid}`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${record.followUpDate.replace(/-/g, "")}`, "DURATION:P1D",
    `SUMMARY:${calendarText(copy("Follow up") + ": " + record.title + " · " + record.company)}`,
    `DESCRIPTION:${calendarText(copy("Personal follow-up reminder. Check the employer’s current posting before contacting them."))}`,
    `URL:${record.identity}`, "CLASS:PRIVATE", "TRANSP:TRANSPARENT", "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(foldCalendarLine).join("\r\n") + "\r\n";
}
