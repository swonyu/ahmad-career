# CSV text-import follow-up — 17 November 2026

This bounded check follows the publishing owner's numeric-coercion report in [PR comment 6947899192](https://github.com/swonyu/ahmad-career/pull/1#issuecomment-6947899192). It reproduces that risk locally with the unchanged production CSV serializer and verifies the import setting now explained in the existing English/Arabic Spreadsheet export disclosure.

## Actual result

The installed **LibreOfficeDev 26.8.0.0.alpha0**, build `2c87e51eeaa2b413ff4ae097b2705eea1995d8e5`, imported the unchanged English and Arabic CSV files under two configurations. Each file contains six synthetic records and nine columns, giving **63 values including headings** per import.

| Import configuration | English | Arabic |
| --- | --- | --- |
| Default | 12 free-text cells acquired numeric/date types; nine displayed values changed | Same observed counts |
| Quoted fields as text | All 63 displayed values matched; every nonempty cell remained text | All 63 displayed values matched; every nonempty cell remained text |

The free-text samples cover leading zeros, a 21-digit numeric string, scientific-notation-like text, a date-like string, mixed Arabic/English and a protected formula-like string. The three protected `Text: =1+1` cells per import remain literal strings; every output contains zero formula attributes. The independently verified harmless formula-evaluation control in [the earlier engine check](../csv-libreoffice/README.md) remains separate.

## Product decision

The original text and serializer remain unchanged. One sentence inside the existing export disclosure advises importing quoted fields as text or setting text columns to Text, and points to JSON for original values. It adds no main navigation, import mode or new feature panel. Spreadsheet settings belong to the chosen consumer; CSV quoting alone does not prevent automatic number/date conversion.

The text-import option also leaves the intended date columns as text. A user who needs spreadsheet date calculations can explicitly convert those columns after import. This check does not establish preservation in every spreadsheet product, or after later editing, saving or reopening.

## Reproducible evidence

- [generate-fixtures.mjs](generate-fixtures.mjs) bundles and executes the actual production serializer, model and translation code; it adds no product dependency.
- [fixture-generation.json](fixture-generation.json) records exact source and CSV hashes. The serializer is unchanged from `880e878`; the Arabic catalog contains the working follow-up and is identified by its own hash.
- [run-engine.py](run-engine.py) and [engine-invocations.json](engine-invocations.json) record the four actual imports. Each uses a separate temporary application profile. The text option follows [LibreOffice's documented CSV filter parameters](https://help.libreoffice.org/latest/en-US/text/shared/guide/csv_params.html).
- [verify-imports.py](verify-imports.py) independently reads the CSV and flat-ODS XML with Python's standard library. It checks row/column counts, every displayed value, stored string metadata, coerced free-text types, protected cells, formula attributes and hashes.
- [verification.json](verification.json) retains the default-import changes and the successful text-import results; default import is intentionally not labeled exact-text preservation.
- [verification-attempts.json](verification-attempts.json) preserves the earlier invocation that ran before engine imports had finished and therefore found an output file missing.
- [independent-review.json](independent-review.json) records the peer's verifier finding and closure. Expected empty cells now reject hidden stored values; both English and Arabic in-memory negative probes failed as intended. Actual artifacts were clean and were re-read without another engine import. The receipt from before that correction is preserved separately.

No GUI, browser file-saving, actual user account, real employer request, Excel, Numbers, Google Sheets, later save/reopen or calendar acceptance occurred in this check. These results supplement, rather than overwrite, the earlier 20-record formula and Unicode fixture evidence.
