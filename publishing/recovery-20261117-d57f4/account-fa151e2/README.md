# Sealed account follow-up integrated with publishing recovery

This checkpoint integrates the original source owner's sealed commit `fa151e219ad4e8d9f0d3337eec10a60ed5223d47` into publishing recovery `f47e4280f0e3b341979708acf244d5aa070ba690`. The owner’s remaining dirty documentation was left untouched. Both parent histories are preserved. No native build, signing operation, external comment, CI dispatch, or public-site deployment was performed by this integration worker.

## Reconciliation and validated fixes

The four conflicts were in the hosted phone search screen, Arabic messages, i18n fixture setup, and search workflow tests. The result preserves the publishing due-follow-up shortcut reset, saved-record location behavior, and separate unavailable/partial/complete empty states. It also retains the account owner's nonempty partial/stale Retry control, separate stale-age and source-error explanations, dynamic text direction isolation, and CSV import guidance.

Two concrete defects remained in the owner’s sealed hosted change:

1. A successful retry or page response kept visible form edits but persisted the older submitted filters over the draft. The current form draft now has a synchronous ref updated by the actual edit/restore setter. Completion stores that draft separately from the submitted filters in `lastSearch`. A request still uses its own frozen filter and cursor values, and the existing identity, generation, local-data, cancellation, and 200-result checks remain in place.
2. The generic partial-results warning implied that a source could not provide current results. The server also returns partial status when a fresh source reaches a data or job limit. The screen now describes incomplete coverage without inventing an outage. Source-specific stale and error messages remain visible, and empty results keep distinct meanings for unavailable, partial, and complete searches.

The search tests execute actual production handlers and the actual rendered results subtree. The harness freezes request-time lexical filter values so it cannot hide a stale React closure by exposing a mutable global. Before the fixes, six regression cases failed; after the fixes, all 18 tests/subtests passed. These are included in the broader focused suite and must not be added to that count as unique coverage.

Android production source remains identical to the earlier publishing checkpoint, including the large-text horizontal navigation, bounded scrollable notices, usable content height, and selected-language provider inside full-screen dialogs. Native test assertions from both histories are retained.

The iPhone helper imports the owner’s bounded real-interaction repair for the observed `connection.address` failure. It first attempts the visible Select All control; when iOS leaves only a caret, it permits a real triple-tap for a newline-free native text/search field. Delete must leave the entire field empty, and typing must produce the exact requested value. All 17 iPhone journeys, the visible-keyboard gate, and the publishing fixture/assertion safeguards remain. The target-OS runtime must still prove that the gesture works.

## Executed local checks

| Check | Observed result |
| --- | --- |
| Focused search, localization, model, record tools, async privacy, settings, theme and transport tests | 127 passed, 0 failed; includes subtests |
| TypeScript | Passed |
| Full hosted lint with `--max-warnings=0` | Passed after six mechanical unused-binding/export cleanups |
| Hosted production build | Passed |
| Follow-up theme and batch-stop tests after lint cleanup | 27 passed, 0 failed; overlaps earlier theme coverage |
| Actual local workerd phone fixture using local D1/R2 and synthetic provider HTTP | Passed; see the exact group count and scope in `verification.json` |
| Native test-method retention | No method lost from either parent; static inspection only |
| Source/evidence credential-signature and sensitive-filename screen | No matches in the scanned tree; not a guarantee against every possible secret |

Raw logs and command receipts are adjacent. `source-under-test.json` pins the inspected source bytes, and `verification.json` states the overlap and runtime limits. The initial lint output is retained as `lint-before-cleanup.log`. Framework advisory warnings in the production build remain visible in its log; no warning was suppressed to make a gate pass.

Independent read-only review found no new blocking source defect. `peer-review.json` records its scope and explicitly leaves native runtime acceptance pending.

## CI and store state

The owner’s automatic PR workflow `44111164968` runs on `fa151e2`, not this combined candidate. It cannot establish the result of this integration. The recovery branch is outside the workflow’s push trigger patterns. After the exact combined SHA is pushed, the publishing owner must first check for an existing run on that SHA, then dispatch at most one `phone-quality.yml` run for `recovery/publishing-integrated-20261117-d57f4`. All five jobs must be evaluated against that exact candidate.

This checkpoint provides no new native simulator acceptance, physical-device acceptance, signed archive, store build selection, submission, approval, or release evidence. The public support navigation patch remains prepared but unapplied. Public privacy review and the unanswered App Store privacy questionnaire remain release work. Current App Store draft descriptions/version/age changes are independent of review notes: the attempted review-notes save was blocked by missing real first name, last name, phone, and email fields, so the notes must not be reported as saved.
