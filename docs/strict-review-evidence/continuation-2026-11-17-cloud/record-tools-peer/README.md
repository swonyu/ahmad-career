# Independent review: saved-record tools

This review executes the actual candidate helper and selected actual `PhoneApp` handlers with synthetic surrounding state. It uses no browser, network, real accounts, external calendar, or spreadsheet application. The script writes a receipt only after all checks pass and verifies that the candidate source did not change during the run.

## Reproduce

From this directory:

```sh
node review.mjs /absolute/path/to/career-finder/hosted
```

Omit the path argument to target the hosted source in this repository after integration. [receipt-isolated.json](receipt-isolated.json) records the isolated candidate actually reviewed; [receipt-integrated.json](receipt-integrated.json) records the later root-candidate rerun. Both include the corrected CSV/calendar download-notice copy at that recorded checkpoint; they predate the separate recovery-notice correction below. [receipt.json](receipt.json) is the last executed run, currently the integrated rerun. Copying an earlier receipt does not relabel its tested source. The target checkout needs its existing development dependencies installed. No new package dependency is required. The independent CSV parser is Python’s standard-library `csv` module. The review bundles actual TypeScript with the checkout’s existing esbuild; its temporary output remains in this evidence directory.

## Findings

No blocking product defect was reproduced in the reviewed record-tools behavior. Six independent check groups passed in each recorded execution; exact hashes and scope are retained separately in `receipt-isolated.json` and `receipt-integrated.json`. These are reruns of the same groups, not twelve distinct tests.

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

- This six-group review did not exercise spreadsheet application import, save/reopen behavior, or calendar application import; the later headless engine receipt below has a separate scope. Formula defenses are tested for the listed inputs and are not described as universally safe under all spreadsheet transformations.
- File-save completion, calendar alert behavior, and calendar synchronization are unverified. Re-exporting a UID does not promise a particular application's deduplication behavior, and changing a date produces a distinct reminder identity.
- Handler tests execute production declarations with synthetic surrounding state. They are not a mounted React test of prop transitions or native device lifecycle behavior.
- This independent review lane stopped its browser fixture after the recorded URL policy rejection and used no alternate route for that blocked fixture. The later owner-authorized private-Site browser checks are a separate environment and receipt; they do not turn this script into mounted-browser evidence.
- The existing bilingual rendering receipt is separate evidence for the earlier UI candidate. It does not verify the appearance of these new disclosures after integration.

## Format references

- [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545), sections 3.1 (content lines and folding), 3.3.11 (TEXT escaping), 3.6.1 (VEVENT), and 3.8.2.5 (DATE-compatible duration).
- [RFC 4180](https://www.rfc-editor.org/rfc/rfc4180), section 2 (common CSV quoting and CRLF conventions; an informational RFC).
- [OWASP CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection), formula triggers and the limits of spreadsheet-dependent escaping and resave behavior.

These references informed the checks. They do not establish real spreadsheet/calendar compatibility for this implementation.

## Integration-owner rerun

The same six independent groups were rerun successfully from the root candidate after patch integration. `receipt-integrated.json` records its exact file hashes and source path; `receipt-isolated.json` preserves the author-independent isolated-candidate receipt. `receipt.json` is the last executed run. Neither result proves a browser download completed or a calendar imported the file.

## Later recovery-notice correction

The independent final product review identified **PRODUCT-FINAL-01** in the separate unfinished-edit recovery JSON notice. Candidate `880e878f6f528d903c42951f10a8b216094c889c` changes that English/Arabic notice to report download initiation; authorization and download logic are unchanged. The [focused follow-up receipt](../product-copy-followup/verification.json) records 34 existing checks passed and the newer `PhoneApp.tsx` SHA-256 `85985eddea0b3b9ed15a985c1b3e8c2b1a0be4e87c95a208373579e06df26183`. The isolated/integrated six-group receipts above retain their original source hashes; they are not relabeled as reruns on this later file. No browser completion or external import is established by either checkpoint.

## Later bounded spreadsheet engine check

The integration owner subsequently exercised actual production-generated English/Arabic CSVs in the installed LibreOfficeDev 26.8.0.0.alpha0 engine. The [separate verification receipt](../csv-libreoffice/verification.json) records four passing headless imports (two languages × default/formula-enabled modes), independent comparison of all 21 × 9 values per case after line-ending normalization, zero formula attributes and 51 protected cells remaining literal text per case. This is not a rerun of the six groups above or proof of browser saving, GUI behavior, other spreadsheet applications, supported stable versions, later resave/reopen or calendar import.

## Subsequent text-import guidance and source follow-up

The [six-record engine fixture](../csv-text-import/README.md) separately reproduces numeric-looking text coercion: default import changes 12 free-text cell types and nine displayed values per language. Quoted-as-text import preserves all 63 values including headings, with three expected-empty metadata checks per case. Both hidden-value negative probes are rejected by the [reviewed verifier](../csv-text-import/independent-review.json). These four imports supplement the earlier 20-record fixture; they do not establish GUI, browser saving, another spreadsheet or later save/reopen behavior. Date columns also remain text under that option.

Earlier source `fa151e219ad4e8d9f0d3337eec10a60ed5223d47` adds one English/Arabic import-guidance sentence in the existing disclosure and separately fixes search-draft preservation/retry and dynamic direction boundaries. The serializer and stored data remain unchanged. Its [66-case focused run, typecheck and full lint](../hosted-search-followup/verification.json) bind the new `PhoneApp.tsx` SHA-256 `7fbf684a5b400a064f01fb62173192d821f1eb4ce6d076435d1fe9ac58c9c590`; older record-tools, recovery-copy and six-group peer receipts retain their earlier source hashes. That hosted follow-up was deployed to [private QA v4](../private-acceptance-deployment-v4.json); no owner-browser or public-v7 acceptance is implied.

Earlier source `d97bc209ca84ecb830e6c6bad25808164706409f` retains the serializer, stored data and CSV guidance while correcting the remaining source-label direction spans and visible/live incomplete-search status. Its [82-case integrated hosted receipt](../search-status-f05/root-verification.json) binds `PhoneApp.tsx` SHA-256 `a8c60e30d5ab70ba341df3369846fe85e35c5fa28c633557742b704974cddd3c`, with typecheck/full lint passed. These cases overlap earlier focused subsets and do not rerun or relabel the old six-group peer receipt. That hosted slice was deployed to [private QA v5](../private-acceptance-deployment-v5.json), with no new owner-browser, file-download, provider or public-v7 acceptance.

Hosted source `21f08f5c4509bd1fdbe9112003224bf2316edd2a`, unchanged in native-only successor `63eecda5`, adds only singular wording to the live count announcement and Saved shortcut; the serializer, stored records and existing record actions remain unchanged. Its [82-case singular follow-up](../singular-count/root-verification.json) binds `PhoneApp.tsx` SHA-256 `b9599e9a6f7f955da7009feb3485174a29834b08ef8e588de4addbc08f726dfa` and records passing typecheck/full lint. The existing matrix adds count-one fixtures without new registered tests. The 36-case suite overlaps the 82 registered checks; ten ad-hoc shortcut renders ran separately with test registration disabled. They are not added to the registered total, and neither execution is browser acceptance or a replacement for the original six-group peer receipts. No new tab, ARIA override, export behavior or data capability was introduced.
