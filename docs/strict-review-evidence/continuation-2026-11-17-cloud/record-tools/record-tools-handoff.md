# Web record tools: isolated implementation handoff

Base: `eebe748cb5afca0efcb9389255400a00cf5a480a`. Source lives in `record-tools-candidate`; only the five files listed in the verification receipt changed. The patch is `record-tools-eebe748.patch`. No root source, shared native build, release configuration, live account or external calendar was modified.

## Delivered behavior

Saved search compares the currently displayed job title, employer and location plus its saved private note. NFC normalization, stable Unicode lowercase, and removal only of U+0640/U+064B–0652/U+0670 affect comparison. Every whitespace-separated term must occur somewhere in that job's fields. Hamza/maddah, alif forms, ta marbuta/heh and ya/alif maqsura stay distinct. Raw text, record keys and URLs are unchanged. A no-match state offers one action to clear search and filters.

Settings > Your saved data has a collapsed Spreadsheet export disclosure only when records exist. The CSV selects nine record columns: job title, employer, job link, self-entered stage/applied mark/application date/follow-up date, private note and last edit time. It includes a UTF-8 BOM, CRLF rows, quotes every field and doubles embedded quotes. Formula-like cells, including full-width equivalent prefixes and leading whitespace/control/format/quote characters, receive a visible `Text: ` marker. This improves the intended human spreadsheet import path; it is not a universal Excel re-save guarantee. The existing JSON export remains the original-text data path.

An existing job detail with a valid saved follow-up date has a collapsed Calendar reminder disclosure. The `.ics` file uses all-day `DTSTART;VALUE=DATE` and `DURATION:P1D`, so civil dates are not converted through time zones. It escapes RFC 5545 TEXT, folds by UTF-8 octet count without splitting code points, and includes a deterministic SHA-256 UID of a domain separator plus public canonical job URL and date. It selects no private notes, applicant profile, account ID, provider token, attendees or alarm. The user chooses whether to import the downloaded file. Date changes do not synchronize or remove an earlier event; notification behavior remains the calendar's choice.

Both export handlers read only the current in-memory snapshot after the existing current-account fence, match its exact guest/account/workspace scope, and verify the captured snapshot. The calendar handler checks again after asynchronous hashing and rejects a changed identity generation, revalidation, workspace, snapshot or saved record. No vault scan or remote fetch is added. English and Arabic labels/notices are provided (26 new catalog keys). The new success notices say download started, because the browser API does not confirm that the file was saved.

## Verification

- New source-executing suite: **28/28** pass, including independent CSV parsing, adversarial formula cases, date boundaries, UTF-8 folding, private-field exclusions, stable UID, actual export handlers and actual disclosure JSX.
- Related existing Settings privacy, recovery, PDF worker and localization checks: **37/37** pass.
- TypeScript and targeted ESLint: exit 0.
- Final production build after the copy correction: exit 0. Existing framework sourcemap and route-classification warnings remain in the log.
- `git diff --check`: exit 0.
- Independent reviewer: six proof groups pass; no blocking product defect. The one copy precision finding was fixed.
- Actual pre/post Saved selector demonstration: note-only, Arabic vowel-mark and terms-in-different-fields each returned zero results at the baseline and one in this candidate with the same synthetic active records.

The first focused test harness attempt collided with a nested `let local` while extracting the real handler. The harness was corrected to select only direct PhoneApp declarations; no product workaround was used. Subsequent complete focused runs pass.

## Evidence and limits

The verification JSON contains final SHA-256 values, commands and paths. Supporting files are `record-tools-focused.log`, `record-tools-build.log`, `record-tools-before-after.json`, and the independent `record-tools-review/receipt.json`. That peer receipt precedes only the final English/Arabic download notice adjustment. Actual file saving, spreadsheet save/reopen and calendar import were not exercised. No physical device, native build, provider consent, employer submission or release readiness claim is made.

Standards used: RFC 4180 (https://www.rfc-editor.org/rfc/rfc4180), RFC 5545 (https://www.rfc-editor.org/rfc/inline-errata/rfc5545.html), and OWASP CSV Injection (https://community.owasp.org/attacks/CSV_Injection). The product/review rationale is in the separately delivered Product-Review-Research-2026-11-17.md and source ledger.

## Integration

Apply the five-file patch in the integration owner's checkout after confirming its expected baseline and any newer PhoneApp/catalog edits. Run the package's complete test/type/lint/build gates there. The patch has no schema or dependency changes. The package test command includes the focused suite. Keep the hosted v7 deployment, this source candidate and publishing branch distinct; this patch deploys none of them.
