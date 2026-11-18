# Saved application-stage filters: reviewed implementation checkpoint

Recorded 18 November 2026 after the pinned run completed at 02:33:57 UTC (05:33:57 Riyadh).

## Change and ownership

This checkpoint adds a localized Application stage select to Saved. The five existing record stages compose with the current search text and All, Applied and Follow-ups views. A bookmark without a record matches Saved without creating a record. Clear and the due-follow-up shortcut reset the stage select. Ordinary tab navigation preserves mounted view state; a reload starts at All stages. CSV and calendar exports retain their existing source and privacy boundaries.

Grok Build 1 supplied the original five-file implementation and an isolated 42-test log. Root independently verified both artifact hashes, checked all five reconstructed source hashes against the clean f6 baseline, and reviewed the implementation. Root owns these hosted changes. Publisher d57f4cd77813 retains native integration, migration builds, CI, signing and stores; development5bc6158967e8 retains dependency remediation.

## Findings fixed and retested

1. **STAGE-EMPTY-001:** deleting the final record-only item with an active stage filter hid both the stage selector and Clear, while the explanation instructed the user to clear filters. The correction renders Clear whenever the empty-state contract requests it, including zero items. Its existing handler clears query, view and stage.
2. **STAGE-TEST-001:** the first regression searched all rendered text for the Clear label, which also appears in explanatory copy. The final regression checks labels from actual rendered button elements before invoking the source-derived handler, then requires the actual Explore button.
3. The full regression found an existing due-shortcut AST harness still binding the earlier search helper. Its four guarded substitutions now bind the production list helper and stage setter, begin with a restrictive stage, and require the exact reset state. Expected record identity, immutable private data and continuing query behavior remain asserted.

The two source reviews and Grok Heavy critique found no additional concrete defect in their bounded review. They are source evidence, separate from runtime results.

## Actual final pinned checks

Runtime: Node24.22.3, npm11.20.0. Exact executables, argv, source hashes, start/finish times and raw log hashes are in final-acceptance/receipt.json.

| Check | Actual result |
|---|---|
| Original candidate with final button-only regression | 43 checks:42 pass/1 fail, exit1; first EN Interview/zero-item case proves the hidden Clear button |
| Corrected typecheck | exit0 |
| Corrected lint | exit0 |
| Complete npm test chain | exit0;301 main Node tests and6 PDF Node tests pass, plus the project's script assertions |
| Corrected hosted build | exit0 |
| Diff whitespace check | exit0 |

The 43 record-tools cases are a subset of the301 main tests. They are not added to301. A prior focused two-file rerun passed71 tests, also overlapping this suite.

The final run preserved every tracked implementation/test hash. Three existing test-generated verification JSON files refreshed only observedAt; each before/after JSON comparison confirmed all other fields equal. Earlier failed/stopped receipts are retained in the owner's evidence directory. One earlier full run passed its commands but its all-tracked-file guard stopped on those generated timestamps; that is not an implementation-source movement.

Build warnings concerning the existing framework and sourcemaps remain in the raw build stderr. The dependency graph was not changed here. Root's last audit remains19 high/0 critical; the separate unintegrated SSR replacement audit0 is not a root audit result.

## Acceptance still pending at this checkpoint

Actual narrow English/Arabic browser checks, real browser CSV/ICS downloads on this new source, and last-record deletion recovery are the next owned root task. Static renders and AST tests do not establish physical assistive-technology, device/native, live OAuth, employer submission or store acceptance.

Latest observed native CI remains a17999ce9f24d1e8c94a38c03dcda68101db4507 / run44194197445:17/17 iPhone simulator UI tests; four other jobs skipped. It is not a new combined-source pass. No native build or CI dispatch was initiated for this hosted checkpoint. Signing and store release are not established.

## Grok streams and preserved evidence

- Build1: https://grok.com/c/adc8cfe9-ed35-4fcd-9961-d1fc081daef0
- Build2: https://grok.com/c/abe34c88-8973-4ecb-aacc-9a7e595c33ef
- Heavy: https://grok.com/c/3bf518a8-10be-40cd-9d0e-7a811c512a74

The original stage patch/log hashes, header-only normalization and independent reviews are retained here. Full original source/audit packages and39images were not resent. Seven existing workstreams, Good Spender exclusion, free costs and the original18November22:26:12UTC cutoff remain unchanged.

Mac evidence: /Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/resume-20261118-0410/stage-filter-20261118T0220Z/
