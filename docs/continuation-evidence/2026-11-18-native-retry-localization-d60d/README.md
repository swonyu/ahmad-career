# Submitted-search retry: preserve localized guidance

This ordinary follow-up supersedes `ffc038cd2bfcbc6006dfc23dee87e34ee55a7a00` as the native retry lane tip. Its cooldown protection remains intact; this correction keeps the original service error so the existing view can present that message and its separate localized retry-time hint.

## Reviewed change

`retrySubmittedSearch()` returns during an active cooldown without rewriting `error`. No request is sent, the retry hint remains, and newer draft fields and prior results stay unchanged. The pre-existing `search()` guard, `execute()`, native views and localization resources are unchanged.

`NativeDiscoveryViews` already renders `l10n.message(error)` and a separate `l10n.format("Try again after {0}.", ...)` using `l10n.time(retry)`. The previous new guard duplicated waiting copy and supplied a system-locale preformatted time. The dynamic translation template exists, so this correction does not claim the prior text was necessarily untranslated English.

## Actual host verification

The same revised existing `DiscoveryCheck.swift` assertions were used for both runs:

- Baseline ffc038c: compile exit 0; run exit 1 at original-error preservation.
- Candidate: compile exit 0; run exit 0; **79 assertions across 19 scenarios passed**.

Checks use the real 429 error text and cover a blocked retry with and without earlier results, no service call or disk rewrite, retained newer form fields and result attribution, and an allowed retry after an expired hint. Existing account and cancellation cases remain included.

These are host Swift checks with a stubbed service. They do not establish native UI, installed-device, live-provider or complete integrated release acceptance. No additional test/build was started for this evidence commit.

## Evidence

The JSON receipts and stdout/stderr are preserved from the tested candidate. The application receipt records the historical pre-commit state; its `committed: false` and `pushed: false` values are intentionally unchanged. Exact compiler commands and source hashes are in the receipts. The previous commit is retained in history; this is neither an amend nor a force push.
