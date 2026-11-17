# Independent review: saved-record tools

This review executes the actual candidate helper and selected actual `PhoneApp` handlers with synthetic surrounding state. It uses no browser, network, real accounts, external calendar, or spreadsheet application. The script writes a receipt only after all checks pass and verifies that the candidate source did not change during the run.

## Reproduce

From this directory:

```sh
node review.mjs /absolute/path/to/career-finder/hosted
```

Omit the path argument to target the hosted source in this repository after integration. The committed receipt records the earlier isolated candidate actually reviewed; copying the evidence does not relabel it as a test of a later integrated revision. The target checkout needs its existing development dependencies installed. No new package dependency is required. The independent CSV parser is Python's standard-library `csv` module. The review bundles actual TypeScript with the checkout's existing esbuild; its temporary output remains in this evidence directory.

## Findings

No blocking product defect was reproduced in the reviewed record-tools behavior. Six independent check groups passed; their exact source hashes and scope are in `receipt.json`.

| Area | Evidence |
| --- | --- |
| CSV | Python parses every exported record into exactly nine columns. Quoted commas, embedded quotes, Arabic, emoji, and multiline notes preserve their intended cell value. BOM and CRLF output are present. Listed formula triggers, including whitespace/format prefixes and compatibility operators, receive the visible `Text: ` marker. Input objects remain unchanged. |
| Calendar content | Actual generated physical lines stay at or below 75 UTF-8 octets, including continuation whitespace. Arabic and emoji force real folding. Unfolding and TEXT decoding reproduce the intended summary. Newlines, commas, semicolons, and backslashes cannot inject another property. Private notes are absent. |
| Calendar dates and identity | Leap-day and year-boundary cases preserve the saved civil date. Invalid days and out-of-range years fail. All-day DATE plus `DURATION:P1D` avoids timezone conversion and derived year-10000 end dates. The UID stays stable for the public canonical job URL/date and changes when either changes; private note/title/company changes do not affect it. |
| Arabic search | Search terms can match different fields within the same job or its current private note. Basic vowel marks and tatweel are ignored for comparison; hamza, ta marbuta, alif maqsura, and their distinct counterparts remain distinct. Canonical composition is respected. Stored and displayed strings are untouched. |
| Account boundary | Actual extracted handlers suppress a delayed calendar download after identity invalidation, generation change, workspace ownership change, scope change, snapshot replacement, or record edit. The CSV handler refuses an unconfirmed or mismatched current account. A normal current-owner request remains allowed. |
| Progressive disclosure | Read-only JSX review confirms spreadsheet export stays in Settings under its disclosure, and calendar export stays in a job's details under its disclosure. Both disclose their contents and require an explicit click. No new main navigation item is introduced. The author's separate test suite renders the actual disclosure JSX; this independent script does not claim a mounted browser render. |

### Accepted copy correction

The original new success notices said that the calendar file was downloaded and application records were exported. The shared download helper can observe only its anchor-click request; it cannot confirm a completed file save or calendar import. The author accepted the narrow correction to **“Spreadsheet download started…”** and **“Calendar download started…”**, with matching Arabic. This is an observability and wording finding, not evidence that a browser download actually failed.

## Limits

- Spreadsheet application import, save/reopen behavior, and calendar application import were not exercised. Formula defenses are tested for the listed inputs and are not described as universally safe under all spreadsheet transformations.
- File-save completion, calendar alert behavior, and calendar synchronization are unverified. Re-exporting a UID does not promise a particular application's deduplication behavior, and changing a date produces a distinct reminder identity.
- Handler tests execute production declarations with synthetic surrounding state. They are not a mounted React test of prop transitions or native device lifecycle behavior.
- Browser review remains blocked by the earlier browser URL policy rejection. No alternate browser, raw automation, or other workaround was used.
- The existing bilingual rendering receipt is separate evidence for the earlier UI candidate. It does not verify the appearance of these new disclosures after integration.

## Format references

- [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545), sections 3.1 (content lines and folding), 3.3.11 (TEXT escaping), 3.6.1 (VEVENT), and 3.8.2.5 (DATE-compatible duration).
- [RFC 4180](https://www.rfc-editor.org/rfc/rfc4180), section 2 (common CSV quoting and CRLF conventions; an informational RFC).
- [OWASP CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection), formula triggers and the limits of spreadsheet-dependent escaping and resave behavior.

These references informed the checks. They do not establish real spreadsheet/calendar compatibility for this implementation.

## Integration-owner rerun

The same six independent groups were rerun successfully from the root candidate after patch integration. `receipt-integrated.json` records its exact file hashes and source path; `receipt-isolated.json` preserves the author-independent isolated-candidate receipt. `receipt.json` is the last executed run. Neither result proves a browser download completed or a calendar imported the file.
