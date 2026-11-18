# Browser-found focus and bilingual deletion-copy corrections

Base checkpoint: `3fb5d97ec6f3568f2c8b27f148281926272a92fe`.

## Findings and fixes

The real production PhoneApp rendered in the owned synthetic Chrome fixture at 390 × 844 showed three outcomes: the prior stage-empty correction retained Clear after deleting the final record-only Interview item, and Clear restored Explore; however the deletion messages incorrectly implied an existing bookmark, and keyboard focus became BODY after deletion and after Clear removed its own control.

The new correction makes bookmark retention conditional in both English and Arabic. A bounded phone-scoped deferred focus helper preserves native/other live focus, skips reopened/replacement dialogs and detached shells, and restores a usable invoker or the existing page heading only when focus was lost. Clear calls the same helper after its unchanged three filter resets. There is no record, bookmark, account, schema, native or package change.

## Verified pinned gates

Executed 18 November 2026, 03:13:57–03:14:47 UTC using Node 24.22.3 and npm 11.20.0. The exact script and complete raw receipts/logs are included.

- Isolated original 3fb source with the new actual-source assertions: 10 focus groups, 4 passed / 6 failed, exit 1. Original production files remained unchanged in this archived baseline.
- Corrected required recovery + record test files: 88 passed / 0 failed.
- Complete npm test chain: 311 main Node tests and 6 PDF Node tests passed, plus the chain's script assertions. The 88 focused cases overlap that full count and must not be added again.
- Typecheck, lint, production build and git diff --check: exit 0.
- All implementation and test bytes remained stable. Exactly three tracked verification reports updated observedAt; every other report field remained equal. Before/after files are included.
- Build warnings remain in build.stderr.log; a successful build does not imply their absence.

The independent preliminary cloud run used unpinned Node 24.22.1 and source-slice/type-stripping scaffolding. It is explicitly separate from the later pinned full TypeScript-AST test execution above. Peer source review found no blocking defect or weakened assertion.

## Acceptance boundary at this checkpoint

The positive stage-empty browser checks and the newly found focus/copy defects are recorded in browser-initial-3fb5.json. **The corrected English/Arabic browser rerun, 22-item corpus, actual CSV/ICS download verification, physical assistive technology and native/store acceptance are pending at this checkpoint.** The rebuilt fixture must pin the changed PhoneApp, Modal and Arabic bytes and retain its empty synthetic guest/origin guards.

This is a root-owned hosted checkpoint. Publisher d57f4cd77813 retains migration/native/signing/stores, development 5bc6158967e8 retains the dependency remedy, and the existing terminal lanes remain intact. No competing native build or release was started. The root dependency graph's earlier audit is not replaced by another owner's zero-audit candidate. Good Spender remains excluded.
