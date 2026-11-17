# Scoped CSV import into LibreOffice

This check executes Career Finder's production CSV serializer at source `880e878f6f528d903c42951f10a8b216094c889c`, then imports its output into the installed **LibreOfficeDev 26.8.0.0.alpha0** headless runtime. It exercises a real spreadsheet engine without requiring a browser account, a desktop installation, a purchase or a change to application code.

## Observed result

Both English and Arabic exports contain 20 synthetic application records and nine columns. Each file was imported twice: with the engine's default CSV settings and with explicit UTF-8/comma/quote settings that enable formula evaluation. All four conversions succeeded.

The independent verifier compares the imported flat-ODS cell values against Python's standard CSV reader. It checks every row and column, reconstructs repeated cells and explicit XML spaces/tabs, and inspects formula and value-type attributes. All four imports retained 21 rows including the header and nine columns, with **zero value mismatches after line-ending normalization and zero formula attributes**. Each case includes 51 formula-like cells (17 payload variants in the title, employer and note fields); all remained literal strings beginning with the application's visible `Text: ` prefix.

Arabic, accented Latin text, quoted commas, quotation marks, multiline notes and civil dates were retained in the inspected cell values. An independent review found that the first verifier checked displayed dates but did not assert their stored date metadata. That evidence-check omission is corrected: the verifier now checks all 30 stored date values, ten empty Applied dates and 149 string cells per import. Both displayed and stored dates match the source. Calc normalized CRLF/CR inside cells to LF. The verifier allows only that line-ending normalization, and the original CSV files remain unchanged.

A separate harmless positive control contains the deliberately unprotected expression `=1+1`. Under the same explicit import options, the engine created one formula cell and computed `2`. This confirms actual formula evaluation in this runtime; the application's protected export files still contain zero formula cells. The control is not production output and contains no external reference or macro.

## Reproduction and evidence

- `generate-fixtures.mjs` bundles and executes the existing production serializer, model and translation code. Run it with the repository root as its argument. `fixture-generation.json` records the exact source and generated-file hashes.
- `engine-invocations.json` records the installed version, exact commands, exit codes and standard output. It also preserves the initial fixture setup rejection: the production public-URL guard refused an `.invalid` hostname. Only the fixture changed to the reserved `example.org`; no production guard was relaxed and no URL was requested.
- `default/` and `formula-enabled/` retain the actual engine-produced flat-ODS outputs.
- `verify-imports.py` reads those files without changing a workbook. `verification.json` records the comparisons and hashes.
- `positive-control-invocation.json` and `control/positive-control.fods` retain the separate arithmetic control.
- The [official CSV filter documentation](https://help.libreoffice.org/latest/en-US/text/shared/guide/csv_params.html) defines the explicit options, including UTF-8, delimiters and formula evaluation.

## Limits

The available desktop app inventory contained no spreadsheet application. This is a **headless import check on one development build**, not a GUI or supported-release compatibility matrix. The files came directly from production serialization with synthetic data; a completed browser download was not observed. Excel, Apple Numbers, Google Sheets, visual layout, user-selected import settings and later user re-save/reopen behavior remain unverified. Calendar-file import is a separate open check. No provider, real account, physical-device, employer application or publishing acceptance is established here.
