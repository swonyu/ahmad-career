# Career Finder export acceptance at source 578d99c

## Result

The exact final synthetic guest downloads passed independent payload checks and the installed LibreOffice text-import procedure. No production source changed in this helper lane.

- Both JSON exports contain the same payload apart from top-level `exportedAt`: 17 saved jobs, 20 application records, five record-only identities and two saved jobs without a record. The empty recovery section also matches across exports. This compares the sections across the two downloads; it does not equate the saved section with recovery.
- Both CSV locales contain all 20 application records and nine columns, even though root observed only the Nurse result under the visible Nurse/Offer filter. All fields match the JSON, with the expected translated labels and one explicit `Text: ` formula-protection marker.
- The Nurse record has Offer stage, `2026-11-30` follow-up date, `2026-11-18T05:09:19.214Z` last edit and the exact original multiline Arabic note. JSON retains the original note. CSV intentionally prefixes it with `Text: `; embedded quotes and newline remain intact.
- Repeated English CSV downloads are byte-identical.
- The installed LibreOffice 26.8.1.1 preserved all 189 cells per locale through quoted-fields-as-text import, native ODS save/reopen and CSV export/reimport. Each result has 155 string cells, 34 blanks, zero mismatches and zero formulas.
- All three calendar downloads retain 30 November 2026 as an all-day date, `DURATION:P1D`, the same UID, the public employer link and private/transparent flags. English repeat differs only in DTSTAMP. Arabic differs only in DTSTAMP and localized SUMMARY/DESCRIPTION. All physical lines use CRLF, remain at most 75 octets and preserve valid UTF-8 across two folds. Private note/profile fields are absent.

The verifier completed **87 bounded assertions, 87 passed, zero failed** at 05:22:51 UTC on 18 November 2026. These are file and consumer checks, not a count of app journeys or a full regression suite. Six isolated LibreOffice invocations returned exit code 0 and produced 11 conversion artifacts. A separate arithmetic-only positive control evaluated `=1+1` to 2. No LibreOffice process remained after the conversions.

## Evidence and provenance

The original browser downloads were taken by root through the normal app UI in the synthetic guest fixture. This helper only read and copied the Downloads files and ran the explicitly authorized isolated consumer procedure.

Source commit: [578d99c8f225a72ca7cc0cf10ff474bb19aaaebc](https://github.com/swonyu/ahmad-career/commit/578d99c8f225a72ca7cc0cf10ff474bb19aaaebc).

The existing fixture build metadata records generation at 03:18:30.976 UTC, Node v24.22.3 and PhoneApp SHA-256 `0ee2f855083ad5933dbbca1161372e8e6e3c8b393c1fd6033b2858c59dacfd94`. Its unchanged metadata file is copied to [reference/fixture-build-metadata.json](reference/fixture-build-metadata.json). The working PhoneApp at the later 05:20:26 evidence capture had SHA `57543cdbc0fbcb7a51cab725d65907e76af2a29ecf9f2022bffe6caaadc9da02` while root's next correction was in progress. The exports are attributed to the existing served fixture, not that later working file.

Primary receipts:

- [source-manifest.json](source-manifest.json): exact original filenames, UTC modification times, byte lengths, copy names and hashes.
- [verification.json](verification.json): every assertion, full synthetic Nurse record, complete cell and calendar results, and limits.
- [consumer-invocations.json](consumer-invocations.json): exact argument arrays, start/end times, statuses, output hashes and stderr.
- [verify-downloads.py](verify-downloads.py) and [run-consumer.py](run-consumer.py): executed independent verifier and consumer harness.
- [receipts/](receipts/): actual stdout and stderr.
- [originals/](originals/): ten byte-exact copies. Original Downloads files were preserved.
- [manifest.json](manifest.json): packaged evidence paths and SHA-256 hashes.

| Browser download | Preserved copy | SHA-256 |
|---|---|---|
| Career-Finder-phone-data (1).json | originals/final-phone-data-en.json | bd22ab685d9fb92739337605d0583423d2bf6a9c906abd66dfdf1d4d7c3441e1 |
| Career-Finder-phone-data (2).json | originals/final-phone-data-ar.json | 8d11f3c388a1190817bb8bf0c5772b5e8480a4bf40d91bbbfdb739b8dbd56fe1 |
| Career-Finder-application-records (5).csv | originals/final-records-en.csv | 419c024b8907e6e0eed3867b507c97d79f56d7e224b852b90a97004027a3f935 |
| Career-Finder-application-records (6).csv | originals/final-records-en-repeat.csv | 419c024b8907e6e0eed3867b507c97d79f56d7e224b852b90a97004027a3f935 |
| Career-Finder-application-records (7).csv | originals/final-records-ar.csv | 46f691bdb8a9d4bf4aa6b23045fb3ba222daa91707f3b42ed318ca250f994c68 |
| Career-Finder-follow-up (3).ics | originals/final-follow-up-en.ics | d8386a43a3da7e451c0bbc3c640a417e7e01e97898695d51190fab03059b02ed |
| Career-Finder-follow-up (4).ics | originals/final-follow-up-en-repeat.ics | 864be0ba972adeb37feff5c424322a5ae92d8b5c5b2a1917367be694d3f79126 |
| Career-Finder-follow-up (5).ics | originals/final-follow-up-ar.ics | 8fc32f4e7867865bc57e42c529c009af0ee6f8a54c127b07dd3b36cbf5dc4909 |

The newest Arabic calendar was actually named `Career-Finder-follow-up (5).ics`, with modification time 05:15:33.457841 UTC. No anticipated filename or click time was substituted.

The earlier unsuffixed JSON and CSV (4) are preserved as `initial-phone-data.json` and `initial-records-en.csv`. They were downloaded before the follow-up date was committed. Their empty date is initial-state provenance, not a failed final export.

## Executed spreadsheet procedure

The previously established procedure was inspected first; its exact scripts and handoff are preserved under `reference/`. No installation was performed.

Each conversion used a new `UserInstallation` profile inside this task's Mac evidence directory and the existing `/Applications/LibreOffice.app/Contents/MacOS/soffice` executable. No other app document or existing process was used or stopped.

The executed text-import filter was:

```text
44,34,76,1,,1033,true,false,true,false,false,0,true,false,false
```

This enables the established UTF-8, comma/double-quote and quoted-fields-as-text route. The complete actual command arrays are retained in the invocation receipt. The verification allows only LibreOffice paragraph CRLF/CR-to-LF normalization. It accepts no Unicode, whitespace, numeric, identifier or translated-value drift.

The earlier broader corpus had already reproduced number-like text coercion under default import and verified this text-import alternative. Default import was not retested here. This result applies to the stated procedure on these exact browser downloads; it does not claim every spreadsheet's default settings preserve text.

The isolated profile directories remain on the Mac. They are excluded from the portable archive; the exact downloaded bytes, conversion artifacts, scripts, arguments and receipts are included.

## Remaining acceptance

| Gate | Status |
|---|---|
| Actual browser download payload and repeated English CSV | Verified for these synthetic guest files. Browser interactions were performed and observed by root. |
| Exact Mac LibreOffice headless consumer | Verified with the specified text-import route, ODS reopen and CSV roundtrip. |
| JSON restore/import journey | Not executed by this helper. Equal payloads do not prove restoration. |
| Browser reload persistence | Root-owned; not inferred from these downloaded files. |
| Spreadsheet GUI, Arabic visual shaping/RTL, Excel/Numbers | Not executed here. |
| Actual Calendar import, duplicate handling, date-change coexistence, alerts | Not executed. Content-line/UID evidence is not calendar-consumer acceptance. |
| Actual iPhone/Android file download/open handoff | Not executed. Mac evidence is not native acceptance. |
| Live account/OAuth, hosted deployment, release/store status | Outside this bounded task; no new acceptance or release claim. |

Owner: `/root/current_native_coordination`, acting as a review helper within the existing seven streams. No eighth terminal stream, source edit, browser action, account API, installation, native build, workflow dispatch, commit or external post was performed.
