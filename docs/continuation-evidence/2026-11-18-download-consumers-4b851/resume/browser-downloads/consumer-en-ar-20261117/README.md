# Actual UI download → LibreOffice consumer receipt

## Result

The exact synthetic CSV files downloaded through the root-operated PhoneApp browser at parent commit **2884188263f3dad5753da7b2e507f6ba55e30eb0** were imported into the installed **LibreOffice 26.8.1.1 bf6ef2662401c7d6dce671ab4deb26ee0af3a7c1** using the previously verified quoted-fields-as-text recipe and a new isolated profile.

| Language | Input bytes | Cells compared | Exact matches | Formulas | Types |
|---|---:|---:|---:|---:|---|
| English | 489 | 18 | 18 | 0 | 17 strings, 1 blank |
| Arabic | 670 | 18 | 18 | 0 | 17 strings, 1 blank |

No comparison normalization was needed. The bilingual title, localized headers/stage/No value, saved follow-up date **2026-11-24**, edit timestamp, and complete multiline note beginning `Text: =1+1` and containing `SYNTHETIC_PRIVATE_NOTE_4b851` were preserved exactly. The blank applied date remained blank. The synthetic URL is https://example.org/career-finder-ui-export-20261117.

English source: `/Users/saleh/Downloads/Career-Finder-application-records (1).csv`, SHA-256 `6337ab97ad63ddf64bcf6e4cf55a5b176ef1abe99890426f638ff3c17ff44e64`.

Repeat English source: `/Users/saleh/Downloads/Career-Finder-application-records (2).csv`, same exact SHA-256 and length. Its bytes were verified; it was not converted a second time.

Arabic source: `/Users/saleh/Downloads/Career-Finder-application-records (3).csv`, SHA-256 `f920db19636bbee85ceb9dfffd4a0045bf8946364f95f8a3a10605786c6542d8`.

All three hashes were checked before interpretation/copy and again after consumer execution. Original downloads were preserved unchanged.

## Evidence

- `ui-download-consumer-receipt.json`: exact source/output identities and all 18 cells per locale with types and formula attributes.
- `receipts/inputs.json`: original paths, hashes, byte lengths and parsed source rows.
- `receipts/browser-fixture-build-metadata.json`: the browser fixture's parent-288 source metadata, copied before the later cleanup change.
- `receipts/invocation.json`: actual LibreOffice argument array, isolated profile/cache configuration, exit and logs.
- `receipts/consumer-version.txt`: observed consumer version.
- `receipts/verification.stdout.log` and `receipts/verification.stderr.log`: successful focused verification, exit 0.
- `inputs/actual-ui-en.csv`, `inputs/actual-ui-ar.csv`: exact verified copies.
- `output/actual-ui-en.fods`, `output/actual-ui-ar.fods`: actual consumer results.
- `verify-ui-download-consumer.py`: focused reproduction and independent XML comparison.

The interrupted first attempt left no conversion output, receipt or owned process. These were inspected before resuming. Exactly one CSV-to-FODS consumer invocation then processed the English and Arabic inputs. No default-import or broader-corpus rerun occurred.

## Boundary

This closes the actual parent-288 browser-download-to-headless-spreadsheet gap for this synthetic record and the documented text-import route. Browser actions were performed by root; this agent independently verified and consumed the resulting files.

The later root-owned download-cleanup helper has PhoneApp SHA-256 `5b1f3db0063b062f21209870274b83a3def83cb6bb056c987fd7dac0653e6352`. These immutable files do not establish a browser pass for that changed helper. Its browser rerun remains separate.

No spreadsheet GUI/visual acceptance, default-import fidelity, other spreadsheet consumer, iPhone/Android, Calendar, live account or release-readiness claim is made. No production/dependency edits or installations occurred. For a repository checkpoint, copy the files listed in `files-for-checkpoint.json`; omit the disposable `profile/` and `cache/` directories.
