# Preserve live saved-search recovery — 18 November 2026

This corrective branch starts from combined integration `4f72947dbda76ca5176fa42645337c6c739e6a2a`. Production changes are limited to `CareerDiscovery.swift` and `Discovery.kt`. Regressions extend the existing `DiscoveryCheck.swift` and `DiscoveryPersistenceRegressionTest.kt`. No UI, application environment, application record store, recovery suite, workflow or project dependency file is changed.

## Corrected behavior

On iOS, a failed or missing same-scope saved-file read no longer clears the in-memory submitted query or failed-search flag. The transient reset occurs only after a saved snapshot has decoded and validated. Existing initialization defaults and explicit scope-switch, import and clear resets remain intact.

On Android, an attach to the same PrivateStore object and key retains live search state until a saved snapshot validates. Read/decode failure preserves draft filters, submitted retry identity, displayed results and attribution, service error and Retry-After. The unreadable file remains unchanged and recovery performs no writes. A missing file clears only the saved-storage block/error and enables persistence of the current memory state. A true store/key change retains the existing stop/reset boundary.

The Android same-session read guard coalesces queued retries. Both successful and failed read completion checks bind store identity, key and storage generation. Production CareerViewModel initialization, pairing, import, clear and account/workspace changes explicitly stop the prior session before attach; those deliberate reset boundaries are unchanged.

## Actual baseline-red / candidate-green evidence

Both platforms run the same expanded assertion source against the exact original store/controller from `4f72947` and the candidate. No assertion is weakened between variants.

| Focused check | Original baseline | Corrected candidate |
| --- | --- | --- |
| Swift DiscoveryCheck compile | Exit 0 | Exit 0 |
| Swift DiscoveryCheck execution | Exit 1 at the new failed-query preservation assertion | **167 assertions across 32 scenarios pass** |
| Android JVM Java/Kotlin compile | Both exit 0 | Both exit 0 |
| Existing Android persistence regression class on JVM | **11 tests, 3 assertion failures** | **11 tests, 0 failures** |

The cases exercise repeated failed recovery, submitted query A beside newer editable draft B, prior complete results or no results, elapsed and pending Retry-After, unchanged unreadable-file bytes, service error and result attribution, A's explicit retry/fallback, missing-file recovery and explicit reset boundaries. Android also proves coalesced recovery reads and current-state persistence after disappearance. Existing successful restore, cancellation, pagination and storage checks still execute.

The coordinator independently reviewed the Android source/test delta, verified 34 Android log/input hash bindings, checked candidate bytes against both worktree and executed copies, and verified the iOS baseline source against the base commit. The four final source/test hashes are in `combined-review.json`. Protected UI/environment/store/recovery/workflow paths match the child fork. The original coordinator checkout advanced independently for its own browser evidence; this lane did not modify it.

## Host boundaries

The Swift check uses Apple Swift 6.4.2, Swift-language mode 5, the macOS27.2 SDK and the actual discovery store plus its established host service stub. This is not an iOS application build or simulator/device acceptance.

Android proof uses cached Kotlin2.3.0 targeting JVM17, Temurin25, coroutines1.10.2 and JUnit4.13.2. The Android project uses Kotlin2.3.10. The harness compiles the full actual Discovery.kt, DiscoverySnapshot.kt and BoundaryPolicy.java and executes the actual existing regression class. Only instrumentation synchronization, asset loading and Main dispatch use small JVM adapters. PrivateStore's declaration and JSON helpers are extracted from actual source; the existing regression MemoryStore is retained. No Android encryption, Keystore, Looper/device or SDK compilation is claimed. The pinned free org.json20240303 artifact is evidence-only, with origin/checksum/hash receipts; no project dependency changed. Existing Java runtime/compiler deprecation warnings remain visible in raw logs.

No Xcode application build, full Gradle task, emulator, browser or CI dispatch was performed by this corrective lane. Full Android instrumentation and platform acceptance remain with the coordinator's full CI. The existing androidTest class is already discovered by that runner, so no workflow/test-runner change was necessary.

## Historical Android provenance

Reset-before-read already appears at the available history boundary `2fac36f321005d9a2703e6db92acd7d7c14886c5`. The preserved source excerpt and blame establish pre-existence, not the introducing commit. It is not attributed to the SSR migration or the recent iOS retry correction. Historical Android receipts are not reused as current passes.

## Evidence

This directory contains the exact raw compile/execution logs, source hashes, command receipts, focused host runners/adapters and source patches. Compiled binaries, caches and the downloaded JSON jar remain outside the repository. Complete copies are retained at:

`/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/resume-20261118-d60d62a70f26/native-saved-search-recovery`

Source whitespace checks pass. Raw logs and diff patches retain their original emitted bytes, including any terminal blank lines or patch context whitespace.
