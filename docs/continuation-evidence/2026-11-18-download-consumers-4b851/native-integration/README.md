# Accessibility owner integration map

Read-only source review captured 17 November 2026 at 23:40 UTC; final owner/CI receipt 23:47:29 UTC. No source edits, patch applications, tests, native builds, dispatches, process interference or external posts. Pending acceptance items are not passes.

## Exact scope

- Requested accessibility6054d0b: 24 commits after 243031d.
- Reviewed frozen accessibility00e4257: 27 commits across 20 paths.
- Latest observed accessibility2230499: 28 commits; final one-file localization delta is preserved separately.
- Publisher 2884188 remained clean; recovery 11cb3d4 retained seven dirty source files plus one new check. All eight dirty hashes stayed unchanged.

## Useful integration findings

Most accessibility behavior is distinct. Eight paths are unchanged at publisher 288 versus the base; NativeCareerViews has only separate publisher provenance-wrapper changes. Eleven paths overlap newer search work. The three recovery-shared paths have separate/adjacent changed lines, not an observed same-line conflict; this does not prove a cherry-pick applies.

Preserve the stronger submitted-query retry, canonical board handling and recovery draft/receipt work. Add the still-distinct announcements, labels, cooldown presentation and long-input retention in small owner-reviewed units. Retain Android Field(error=customError) styling/association when adding a spoken board error. Merge the single missing email-correction translation through the search/localization owner. Existing employer-directory copy is already translated.

## Latest actual CI

Run 44194197445 at a17999c completed SUCCESS at 23:27:52 UTC. Raw log shows 17 distinct named cases passed, 17 executed, 0 failures, 1478.798 seconds; the previously failing empty-search journey passed. Completed .xcresult output, successful attachment export and finalized artifact 14378904630 are evidenced. Four other jobs were skipped. This does not clear the hosted audit or validate these unintegrated accessibility/recovery hunks. No physical AT or store-readiness claim.

No new PR 1 comments were returned after 23:25:09 UTC. No new owner acknowledgement or dependency-proof receipt was established.

## Files

- INTEGRATION-MAP.md: full 27-commit/20-path map, smallest review units, exact recovery hashes and later-source/CI addendum.
- integration-map.json: structured dispositions, path/hunk index, preserved behavior and pending owner acceptance.
- ANDROID-HUNK-REVIEW.md/json: independent 17 Android-commit review and exact base-line overlap facts.
- snapshot.json, source/, commits/ and four comparative patches: frozen inputs.
- a11y-after-frozen-review.patch/json: separate 2230499 delta.
- final-state-receipt.json, run44-result-summary.json and raw job log: authoritative current read and actual 17-case result.
- manifest.json: hashes and sizes for every file except the manifest itself.

The large 191 MB CI artifact was not downloaded; its identity, upload-reported hash and finalization are preserved in the result summary. No screenshot or archive-body interpretation is claimed.
