# iOS submitted-search retry cooldown candidate

Validated defect: retrySubmittedSearch bypassed the Retry-After check in search and execute cleared the retry hint before starting another service request.

Base: 0beff68a6906968f282dca292dc547daad85684f, continuation/native-search-20261117-01a1ea9d107f.
Scope: isolated copies only. No original worktree changes, native app build, Xcode build, Gradle, CI, commit, or push.

## Minimal implementation

The existing three-line Retry-After guard is repeated immediately after retrySubmittedSearch captures the submitted/last query. This keeps normal search behavior and preserves submitted-filter retry semantics and newer form drafts; it leaves execute, cancellation, request identity and account scoping unchanged.

## Actual validation

Using the existing DiscoveryCheck.swift host stub harness, with identical additional assertions for baseline and candidate:

- Unchanged production + extended harness: compile exit 0, run exit 1. The specific failure was “Submitted retry must not contact the service before Retry-After, including a failed first search”.
- Candidate production + same harness: compile exit 0, run exit 0. PASS 79 public discovery assertions across 19 scenarios.
- Added scenarios cover failed first search and retained prior results during a future cooldown, retained newer form fields and saved file bytes, and a permitted retry after an expired hint using the original submitted filters.
- Existing account isolation, cancellation and newer-explicit-search scenarios remain in the harness and passed.
- Tests use stubbed service responses and host Foundation/Combine. This is not installed iPhone, UI, live-provider or full integrated native acceptance.

Exact commands, compiler/SDK and output hashes are in verification-receipt.json. Original/source hashes are in source-receipt.json. Source preservation and read-only patch applicability are in final-preservation-receipt.json.

## Integration recommendation

Accept the two-file patch after owner review. Apply to the actual integration target, preserving unrelated terminal work. The patch applies read-only to the clean original search-lane commit. If the publishing tree has newer source, compare its exact retry entry point and existing check before applying. Run the relevant integrated check after integration, then retain device/native gates as pending until actually exercised.
