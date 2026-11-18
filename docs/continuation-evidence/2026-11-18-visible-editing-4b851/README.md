# Keep editing: visible focus

The two Keep editing focus calls now allow normal browser scrolling to reveal the focused control. All connected/open-dialog, same-form, reopened-confirmation, hidden/inert/disabled and no-late-focus-steal guards are retained.

## Source and actual pinned checks

Parent cad85c495bc03853cc2258d093e79d8d1fb52ae3. PhoneApp SHA256 e3454df4c4a4189475097d5bcc0ac2e2bf1fe53447d3046513c6eb780a9cd998. Recovery-test SHA256 671f0cc26fa35a8df399a85332902b1226b537115fd7321a40c1a04c6ddc9c4b.

Node 24.22.3/npm 11.20.0 completed at 05:35:16 UTC on 18 Nov 2026: 321 main tests plus 6 PDF, typecheck/lint/build/diff-check exit 0. The 98 focused checks overlap the main suite. Unchanged parent under the same focused assertions: 7 passed/3 failed; corrected 10/10. Failures were actual handler focus-option assertions.

The fixture was built before this commit from parent cad85 plus the candidate hash. Every tracked hosted hash matches the pinned receipt at checkpoint time. Fixture metadata and inputs are preserved. Parent cad85 alone does not contain this correction.

## Actual browser acceptance

Chrome 390x844 with synthetic guest data and production PhoneApp/styles: 12 Keep cases passed, covering record Cancel/Delete/Close/Escape and add-form Escape/Close in each language. Each intended active target was inside the still-open dialog and fully inside the visible bounds immediately after Enter, before another click or scroll. Four Tab/Shift-Tab checks retained visible focus inside the dialog.

Drafts survived. Discard/reopen preserved Offer, 2026-11-30 and the exact multiline Arabic note. Neither add-job draft was saved; 22 corpus items remain. Inspected RTL states had no horizontal overflow. Paired outer-page/main scroll observations were unchanged; short forms remained at scrollTop 0. Original cad85 clipping evidence remains in browser-before.

One combined Arabic transition timed out and reset browser bindings. Missing output is not counted as passed. Fresh inspection established the original saved record had reopened; Arabic add tests then ran from known state. Raw observations preserve the interruption.

A separate open visual finding at this checkpoint: Arabic export/delete labels touch with zero separation. Build2 has a bounded proposal; no spacing fix is included here.

## Independent critique and limits

The standards review and Grok disagreement are preserved. Actual Chrome geometry supports the minimal correction; an extra scrollIntoView was not justified by a remaining reproduced defect. Full-button visibility is a product criterion, not app-wide WCAG conformance. Other engines, physical VoiceOver/TalkBack, native and release acceptance remain separate.

## Earlier-source evidence

browser-parent-578 and export-parent-578 apply to 578d99c: 87 bounded payload/consumer assertions; each exact English/Arabic CSV preserved 189 cells through the executed LibreOffice text-import/save/reopen/roundtrip route. JSON exports are readable records, not restorable app backups. ICS bytes were checked; Calendar import/reimport/alerts and native handoff were not.

native-refresh records 05:42/05:46 owner state: original six trees unchanged; latest iPhone-only CI 44194197445/a179 passed 17/17 with four other jobs skipped. Newly observed earlier c0 is source-only, no CI, four dirty successor files. No integration, owner acknowledgement or store release is inferred.

Original cutoff remains 18 Nov 22:26:12 UTC / 19 Nov 01:26:12 Riyadh. The three terminal lanes are finished per Saleh. Existing three Grok browser sessions plus coordinator remain; native/publishing/migration ownership is preserved. Good Spender is excluded.
