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

The verification JSON contains final SHA-256 values, commands and paths. Supporting files are `record-tools-focused.log`, `record-tools-build.log` and `record-tools-before-after.json`. The independent [isolated receipt](../record-tools-peer/receipt-isolated.json) and the integration-owner [integrated rerun](../record-tools-peer/receipt-integrated.json) both identify the corrected English/Arabic CSV/calendar download notices at that checkpoint; their matching `PhoneApp.tsx` hash is `c4852fa70d2305a9227b68a0423aa4366a1b1c20ea1f2255d66c70ea59724345`. [receipt.json](../record-tools-peer/receipt.json) is the last executed run, not an alias for the older isolated run. These checks did not exercise actual file saving, spreadsheet save/reopen or calendar import. Later browser observations and the interrupted ICS attempt are recorded separately in [live browser acceptance](../live-browser-acceptance.json). No physical-device, provider-consent, employer-submission or release-readiness claim is made by this report.

Standards used: RFC 4180 (https://www.rfc-editor.org/rfc/rfc4180), RFC 5545 (https://www.rfc-editor.org/rfc/inline-errata/rfc5545.html), and OWASP CSV Injection (https://community.owasp.org/attacks/CSV_Injection). The product/review rationale is in the separately delivered Product-Review-Research-2026-11-17.md and source ledger.

## Integration

Apply the five-file patch in the integration owner's checkout after confirming its expected baseline and any newer PhoneApp/catalog edits. Run the package's complete test/type/lint/build gates there. The patch has no schema or dependency changes. The package test command includes the focused suite. Keep the hosted v7 deployment, this source candidate and publishing branch distinct; this patch deploys none of them.

## Later final product correction

The [independent final product review](../final-product-review.json) subsequently found **PRODUCT-FINAL-01** in the separate recovery JSON notice. The earlier `880e878f6f528d903c42951f10a8b216094c889c` source first changed the notice to say “Recovery download started” with matching Arabic. [The focused follow-up](../product-copy-followup/verification.json) passed 34 existing checks, changed no authorization/download logic and records the later `PhoneApp.tsx` SHA-256 `85985eddea0b3b9ed15a985c1b3e8c2b1a0be4e87c95a208373579e06df26183`. The older record-tools receipts remain source-bound historical runs. Private QA v3 first deployed this notice, but correct-owner browser acceptance, completed file saving, GUI spreadsheet use, later resaving and calendar import remain unverified.

## Later bounded spreadsheet engine check

A [separate source-bound receipt](../csv-libreoffice/verification.json) now records four successful headless CSV imports in the installed LibreOfficeDev 26.8.0.0.alpha0 build. Production code generated English/Arabic files with 20 synthetic records; default and formula-enabled imports preserved all 21 × 9 values per case after only line-ending normalization. The flat-ODS outputs contain zero formula attributes, and all 51 formula-like cells per case remain literal `Text: ` strings. [Fixture provenance](../csv-libreoffice/fixture-generation.json) and [commands](../csv-libreoffice/engine-invocations.json) retain exact hashes and the initial production-guard rejection of a synthetic `.invalid` URL. This is not GUI, browser-download, other-engine, later-resave or calendar acceptance, nor a supported-release compatibility matrix.

## Subsequent text-import guidance and source follow-up

The [six-record engine fixture](../csv-text-import/README.md) separately reproduces numeric-looking text coercion: default import changes 12 free-text cell types and nine displayed values per language. Quoted-as-text import preserves all 63 values including headings, with three expected-empty metadata checks per case. Both hidden-value negative probes are rejected by the [reviewed verifier](../csv-text-import/independent-review.json). These four imports supplement the earlier 20-record fixture; they do not establish GUI, browser saving, another spreadsheet or later save/reopen behavior. Date columns also remain text under that option.

Earlier source `fa151e219ad4e8d9f0d3337eec10a60ed5223d47` adds one English/Arabic import-guidance sentence in the existing disclosure and separately fixes search-draft preservation/retry and dynamic direction boundaries. The serializer and stored data remain unchanged. Its [66-case focused run, typecheck and full lint](../hosted-search-followup/verification.json) bind the new `PhoneApp.tsx` SHA-256 `7fbf684a5b400a064f01fb62173192d821f1eb4ce6d076435d1fe9ac58c9c590`; older record-tools, recovery-copy and six-group peer receipts retain their earlier source hashes. That hosted follow-up was deployed to [private QA v4](../private-acceptance-deployment-v4.json); no owner-browser or public-v7 acceptance is implied.

Earlier source `d97bc209ca84ecb830e6c6bad25808164706409f` retains the serializer, stored data and CSV guidance while correcting the remaining source-label direction spans and visible/live incomplete-search status. Its [82-case integrated hosted receipt](../search-status-f05/root-verification.json) binds `PhoneApp.tsx` SHA-256 `a8c60e30d5ab70ba341df3369846fe85e35c5fa28c633557742b704974cddd3c`, with typecheck/full lint passed. These cases overlap earlier focused subsets and do not rerun or relabel the old six-group peer receipt. That hosted slice was deployed to [private QA v5](../private-acceptance-deployment-v5.json), with no new owner-browser, file-download, provider or public-v7 acceptance.

Hosted source `21f08f5c4509bd1fdbe9112003224bf2316edd2a`, unchanged in native-only successor `63eecda5`, adds only singular wording to the live count announcement and Saved shortcut; the serializer, stored records and existing record actions remain unchanged. Its [82-case singular follow-up](../singular-count/root-verification.json) binds `PhoneApp.tsx` SHA-256 `b9599e9a6f7f955da7009feb3485174a29834b08ef8e588de4addbc08f726dfa` and records passing typecheck/full lint. The existing matrix adds count-one fixtures without new registered tests. The 36-case suite overlaps the 82 registered checks; ten ad-hoc shortcut renders ran separately with test registration disabled. They are not added to the registered total, and neither execution is browser acceptance or a replacement for the original six-group peer receipts. No new tab, ARIA override, export behavior or data capability was introduced.
