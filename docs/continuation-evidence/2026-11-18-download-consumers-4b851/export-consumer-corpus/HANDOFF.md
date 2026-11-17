# Career Finder hosted export consumer review

Evidence captured 17 November 2026, approximately 22:46–22:51 UTC. The folder name is a lane identifier, not the test date.

Owner: /root/export_consumer_review. Scope: direct execution of actual hosted CSV/ICS export functions and isolated synthetic consumer evidence. No product/native/package/lock/CI changes, shared builds, browser actions, account actions, personal calendar imports, installs, commits or external posts.

## Result

The current production CSV works in the installed Mac LibreOffice when quoted fields are imported as text, including an ODS save/reopen and CSV export/reimport. All 17 synthetic records in both Arabic and English retained their nine displayed fields (149 string cells and 13 blanks per file, including headers). Embedded CRLF/CR become LF in LibreOffice paragraphs; this sole comparison normalization is explicit. No numeric, Unicode or whitespace normalization was accepted.

Default LibreOffice import does not preserve all number-like text. Each language had six changed displayed values and seven text fields converted into numeric/date cells. The existing product warning and Text-import workaround already cover this limitation; this review executed that workaround successfully. This is a reproduced known consumer limitation, not a new product regression.

Twenty actual-production ICS files passed independent byte/content-line checks. No Calendar application import, repeated import, alert delivery, GUI or browser download was executed. Generated civil-day bytes are not consumer acceptance.

No new validated production defect was found within this bounded lane. Remaining consumer gates are listed below, without inventing passes.

## Exact source and runtime

Generation and final verification both observed commit 2884188263f3dad5753da7b2e507f6ba55e30eb0. Source files were hash-checked before/after generation and verification. The checkout was clean at final inventory.

| File | SHA-256 |
|---|---|
| hosted/app/phone/record-tools.ts | 910dae464cd8504ed225fe5f68fa6b0750c7b7a9c7b18c6454ff4504a772e9a9 |
| hosted/app/phone/model.ts | 955d5afcede6b8f7eb901394f9ae3e00d1bbffa57bf1e457c5436f23541577bf |
| hosted/app/phone/PhoneApp.tsx, reviewed | cea98d8442f0dcb43cee2b1e3d5d5a2814a89130b7c18793ee50f4a8366d5368 |
| hosted/tests/phone-record-tools.mjs, inspected rather than rerun | 29c7c1e987703b7b50360fafdc8f733aa8e34441a150bcd0fde8ecb3dcffe522 |

- Production execution: pinned Node v24.22.3, existing esbuild, no installation.
- Consumer: LibreOffice 26.8.1.1 bf6ef2662401c7d6dce671ab4deb26ee0af3a7c1.
- Host: macOS 27.3 arm64. /opt/homebrew/bin/soffice resolves to a Homebrew shell wrapper that executes /Applications/LibreOffice.app/Contents/MacOS/soffice, verified as a Mach-O 64-bit arm64 executable.
- Independent verifier: Python 3.15.2, standard-library csv/XML/byte handling.
- LibreOffice and Calendar exist; Numbers is absent. No installed icalendar, vobject or libical/parser was found in the bounded locations inspected.
- All consumer conversions used new dedicated UserInstallation profiles inside this evidence folder. No LibreOffice process remained at final inventory.
- Nonfatal Fontconfig warnings are preserved in command receipts; no visual rendering acceptance is inferred.

## Actual production corpus

generate-exports.mjs bundles and imports the actual production record-tools.ts, model.ts and i18n/core.ts from the pinned checkout. It does not copy/reimplement the exporters.

The 17-record corpus covers Arabic/English, decomposed Unicode, emoji, quotes, commas, newlines/tabs, leading zeros, long digits, scientific-looking text, date-like free text, empty values, maximum schema lengths and nine explicit formula-like scenarios. The CSV checks compare against the original reference fields and the intentional Text: marker. They do not reuse the production formula-detection regex. There are 27 explicitly protected title/employer/note cells per language.

generated/original-records.json retains the original synthetic field values and scenario names. This is a harness reference file, not a claim that the app's JSON download/restore journey was exercised.

Production serialization also rejected a NUL-containing field and a calendar request without a follow-up date. Extra synthetic email/token/CV/password fields were not serialized in CSV. No fixture input mutation occurred.

| File | Bytes | SHA-256 |
|---|---:|---|
| generated/career-records-en.csv | 14401 | a105002f4f42c4afc93c03aff83de38733295f68e871344956124db1a2e96a03 |
| generated/career-records-ar.csv | 14750 | d269edd1ec50e38b7e0568320bd04fd57d907301b90637401f9fd4ba809b10c6 |
| generated/follow-up-en.ics | 625 | 999d98290cd17751077d5972f20473d2157b22755db1e19dcb3f2ed4561176ab |
| generated/follow-up-ar.ics | 663 | 6c72390ce3e27f201d27a25ba876cfceb84c053c0427e99cd243a7244a6a6ea5 |
| generated/same-day-updated-caption-en.ics | 574 | ce1b44d5b49c39f20149e07448fac4ac0a078deba7835e770850058b5c34cb3e |
| generated/changed-day-en.ics | 625 | 189baedee9046e6ed390edb33d749e79d9fa2da81d73606e44855fbd3cfc4879 |

generation-receipt.json records every generated CSV/ICS hash, byte length and source identity. source-manifest.json and source/ retain the inspected source snapshot.

## Spreadsheet evidence

run-consumer.py made eight bounded headless engine invocations, producing 15 conversion artifacts. This is not an app-suite pass count.

| Operation, each language unless noted | Observed outcome |
|---|---|
| Default CSV import | 18 rows × 9 columns; six changed values, seven free-text type coercions; zero formula cells |
| Formula-enabled CSV import | Same coercions; zero formula cells |
| Quoted-fields-as-text import | All 162 cells match after only documented line-ending normalization; zero formula cells |
| Save as native ODS, then reopen | All 162 cells match; 149 strings and 13 blanks; zero formula cells |
| Export CSV from ODS and reimport as text | All 162 cells match; zero formula cells |
| Arithmetic-only unprotected control, one separate non-product file | =1+1 became formula of:=1+1 with numeric result 2, proving formula evaluation was active |

Minimal known coercion reproduction: open generated/career-records-en.csv with default settings. Row 3 title 000123 becomes numeric 123; its employer 01234567890123456789 becomes 1.23456789012346E+018. Row 4 title 1E03 becomes 1000 and employer 2.50 becomes 2.5. Row 5 title retains visible 2026-11-17 but changes to a date cell. Arabic has the same value/type behavior.

Executed working alternative: import with UTF-8, comma separator, double-quote delimiter and Quoted field as text enabled. The exact CLI filter string was:
44,34,76,1,,1033,true,false,true,false,false,0,true,false,false

consumer-invocations.json contains the complete actual argument arrays, exit statuses, output hashes and stderr. verification.json contains every coercion and cell-type result. No external links/macros were used; the positive control is arithmetic only.

The first verifier attempt had a harness bug: a regex incorrectly treated the second character of an escaped backslash as an invalid ICS escape. It was replaced by sequential escape decoding and rerun successfully. Both the initial failure and corrected-run logs remain under receipts/. This was not a production finding.

## Calendar evidence and remaining acceptance

The four principal files are ready for a separately owned real Calendar check:

1. follow-up-en.ics and follow-up-ar.ics: 24 November 2026, one all-day event; same UID across locale.
2. Reimport follow-up-en.ics: observe the actual duplicate handling; do not infer it from UID alone.
3. same-day-updated-caption-en.ics: same UID/date but a changed title. Observe whether the consumer updates, prompts, ignores or duplicates; record its actual behavior.
4. changed-day-en.ics: 25 November 2026 and a different UID. Existing app text explicitly says later changes do not update an already imported file. Observe coexistence and the user's calendar-managed removal/edit route.

The content-line inspection confirms one VEVENT, CRLF, valid UTF-8, maximum physical line length 75 octets, escaped title injection text remaining inside SUMMARY, DATE DTSTART, P1D duration, no DTEND, CLASS:PRIVATE, TRANSP:TRANSPARENT, no private-note sentinel and no attendees/organizers/attachments/alarms.

Sixteen additional boundary fixtures cover 8 March 2026, 1 November 2026, 29 February 2000 and 31 December 9999 across Asia/Riyadh, Pacific/Kiritimati, Pacific/Pago_Pago and UTC. For each civil day, output bytes and UID matched across generating time zones. This does not test calendar timezone display or consumer support for the extreme year.

Remaining acceptance:

| Gate | Exact acceptance / practical alternative | Status |
|---|---|---|
| Actual browser CSV download | Use production UI in an isolated, authorized test context; verify filename/MIME, BOM, nine columns, original values and localized headers, then repeat the verified Text-import route | Pending root |
| Spreadsheet GUI | Open either quoted-text FODS/ODS in installed LibreOffice; inspect Arabic shaping/RTL, wide/long fields and discoverability of Text import. Headless text fidelity is already verified | Pending root |
| Real ICS import | Import a synthetic file into a separate test-only local calendar, only if authorized; record date/title/URL/notes/free-busy, locale and screenshots. Do not touch personal calendars or import an archive | Pending root |
| Repeat/date-change behavior | Use the four principal fixtures above; record event count and title/date outcomes before/after. App already discloses calendar-managed changes; no automatic sync promise | Pending root |
| Extreme-year compatibility | Verify 9999 consumer acceptance or capture a concrete failure before proposing a bounded supported-date constraint | Unverified; no defect asserted |
| Mobile handoff | Verify actual iPhone/Android download/open behavior independently; a Mac consumer result is not a phone pass | Pending native/browser owners |

Do not compare regenerated ICS files by full hash when DTSTAMP differs; compare unfolded semantic fields and record both hashes/timestamps. CSV hashes are reproducible only when source inputs and locale match this reference exactly.

## Research grounding

Official sources checked 17 November 2026:

- LibreOffice CSV filter documentation: https://help.libreoffice.org/latest/en-US/text/shared/guide/csv_params.html — quoted-text, formula-evaluation and scientific-number options define the executed consumer modes.
- LibreOffice Text Import: https://help.libreoffice.org/latest/en-US/text/shared/00/00000208.html — Text columns/quoted fields are the documented preservation route.
- RFC 5545: https://www.rfc-editor.org/rfc/rfc5545 — content-line folding, DATE events, day duration and UID semantics support byte-level checks; they do not guarantee a particular consumer's reimport behavior.
- Apple Calendar import/export: https://support.apple.com/guide/calendar/icl1023/mac — .ics imports target a selected calendar. This review did not execute the import.

No paid service, new dependency, Calendar mutation or browser download was used. Preserve existing native/publishing ownership and the original 18 November 22:26:12 UTC cutoff.
