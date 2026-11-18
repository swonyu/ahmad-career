# Android saved-search recovery correction

The production change is limited to `Discovery.kt`; the regression assertions are in the existing `DiscoveryPersistenceRegressionTest.kt`. No Gradle or project dependencies changed.

## Behavior

- Same PrivateStore object and storage key retain current in-memory state while a saved read is attempted.
- Failed read or decode retains editable filters, submitted-filter retry identity, displayed results and metadata, live error, Retry-After and private snapshot state. The earlier unreadable file remains byte-identical and blocked recovery performs zero writes.
- A missing file in that same session is an explicit writable-recovery outcome: storage block/error clear, current memory remains, and the current snapshot can be saved. It does not reset the query or result state.
- A successfully validated saved snapshot may replace state. Active same-session search/catalog work is invalidated only after that validation.
- A true storage key or store object change keeps the existing stop/reset boundary.
- Same-session in-flight reads coalesce inside attach, so queued retries cannot race an older failure against a newer recovery. Success and failure checks both bind store identity, key and storage generation.

## Actual focused proof

The same existing regression class and supporting sources were compiled against the original `4f72947` controller and the candidate. Baseline Java/Kotlin compile both exit 0; execution runs 11 tests with 3 assertion failures exposing state loss. Candidate Java/Kotlin compile both exit 0; execution passes all 11 tests. The test and codec/BoundaryPolicy bytes match across both runs.

Coverage includes the strengthened future-schema recovery test, repeated malformed and thrown read failures, submitted search A beside newer editable draft B, with and without earlier results, both elapsed and pending cooldown, missing-file recovery, absence of provider requests during disk recovery, preserved file bytes, explicit current-snapshot persistence after disappearance, coalesced queued reads, and distinct key/store reset behavior. Existing successful recovery, account cancellation, pagination and storage checks still execute.

## Exact host limits

This is a standalone JVM proof, not Android instrumentation/device acceptance. The harness uses cached Kotlin 2.3.0 targeting JVM17 (project Android Kotlin is 2.3.10), Temurin25, actual coroutines1.10.2 and JUnit4.13.2. It compiles the full actual Discovery.kt, DiscoverySnapshot.kt and BoundaryPolicy.java and runs the actual existing test class.

The adapters replace only Android instrumentation synchronization, asset opening and Main-thread dispatch with one JVM executor and the committed synthetic asset file. PrivateStore's actual interface/PreservedWorkspace declaration is extracted unchanged; the existing test's MemoryStore remains its storage implementation. Exact JSON helpers are extracted from Models.kt and the actual service origin constant is copied into the host support object. No SecureVault/Android Keystore encryption is exercised. The JSON runtime is the pinned free org.json20240303 jar from Maven Central, with upstream checksum and local SHA256 receipt; it is evidence-only and does not modify the project dependency graph.

The small host adapters, runner, all exact commands, source/tool hashes and raw baseline/candidate logs are retained here. No app/Android SDK compilation, Gradle task, emulator, browser, native UI build or CI dispatch occurred.

## Historical provenance

The Android reset-before-read behavior is already present at the available repository-history boundary `2fac36f321005d9a2703e6db92acd7d7c14886c5` (17 November), as recorded by the exact source excerpt and blame. That establishes pre-existence, not that the boundary commit originally introduced it. It must not be attributed to the newly integrated iOS submitted-search retry correction or SSR migration. Prior Android acceptance receipts are historical; they are not reused as a current Android pass.
