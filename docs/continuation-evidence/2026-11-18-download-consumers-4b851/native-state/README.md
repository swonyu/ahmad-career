# Career Finder native and integration recovery — 18 November 2026, Riyadh

Observation window: 17 November 22:36–22:48 UTC / 18 November 01:36–01:48 Riyadh. This was read-only recovery, immutable source comparison and CI log inspection. No source edits, tests, native builds, process stops, lock changes, CI dispatches, pushes, browser actions or external posts were performed.

Good Spender remains excluded. The original cutoff is unchanged: 18 November 22:26:12 UTC / 19 November 01:26:12 Riyadh. Publisher d57f4cd77813 retains native integration, CI/build scheduling, signing and stores. Development 5bc6158967e8 retains dependency remediation. Search 01a1ea9d107f retains shared localization ownership.

## Newest integration and actual CI

The newest publisher branch is **recovery/publishing-reconciled-20261117-d57**, remote-verified at **2884188263f3dad5753da7b2e507f6ba55e30eb0**. Its three parents are publisher363ae84, root9d01149 and native-search0beff68. The older integrated branch still points to363ae84; it should not be mistaken for the newest reconciled work.

All three root e1 account follow-up files are byte-identical in288: ProviderConnections.tsx, SignInOptions.tsx and account-recovery-lifecycle.mjs. Native search is a merge parent. Five of its13 changed paths were further changed in publisher reconciliation; the exact blob comparisons are in immutable-tree-comparison.json. Do not overwrite those reconciliations with a whole-file copy from search.

Full run43 / **44185640786** at288 is terminal with **three of five jobs successful**:

| Job | Outcome |
| --- | --- |
| Service and synthetic HTTPS | Success |
| Android compile, lint and native acceptance | Success; raw log reports112 ordinary instrumented tests,1 TLS-boundary and1 native HTTPS |
| iPhone logic and unsigned build | Success |
| iPhone native interface acceptance | Failure;16/17, one assertion failure, normal TEST FAILED finalization |
| Hosted HTTPS service and durable storage | Failure at required dependency audit, after passing npm test/build; main Node group289/289 |

The iPhone failure is **testSearchEmptyAndFailurePreservesPreviousResults**, CareerFinderUITests.swift:553: “The empty state must describe the completed search.” The other16 cases passed. This is a new source-bound result, not a continuation of the old connection-address failure. Total test execution was1083.171seconds. No fresh physical-device or assistive-technology acceptance is implied.

The raw hosted log does not print the audit JSON count. The publisher commit message still reports19high findings; the independent dependency lane is checking the exact artifact. Do not invent a clean audit or derive a new count from an older run.

## Source-confirmed empty-copy assertion mismatch

At exact288, the synthetic AcceptanceDiscovery fixture filters the query “nothing matches” to an empty job list and returns status complete. CareerDiscovery.swift:112 maps that status to **No matching jobs in these boards.** NativeDiscoveryViews.swift:173 renders this title inside the discovery.empty element. The unchanged UI assertion at553 instead requires **No roles match this search.**

This source mismatch explains why the old expected string is incompatible with the approved complete-state copy. It is not an executed correction. No failure screenshot was inspected and no native rerun was started. The publisher already has a clean local correction, **a17999ce9f24d1e8c94a38c03dcda68101db4507**, parent288, on recovery/empty-state-ui-expectation-20261117-d57. It changes only this test file: the title assertion now matches the complete-state copy, and an additional assertion checks the useful broader-search detail. The rest of the journey is retained. This is a source-consistent correction, not an executed native pass. Its exact remote branch was absent from targeted readback and no rerun appeared in the latest three CI runs. Review this existing candidate; do not implement a competing fix.

The source copies used for this diagnosis are saved with the .288-source suffix. They were retrieved from immutable GitHub refs.

## Three existing terminal lanes

- **Search01a1ea9d107f:** clean at0beff68a6906968f282dca292dc547daad85684f, exact registered branch remotely verified. It published a bounded checkpoint with13 changed paths. Its owner reports67 host iOS discovery assertions across16scenarios and syntax/desktop-parser checks; those reports alone are not native acceptance. Newer run43 validates the reconciled Android build/instrumentation scope.
- **Recovery01a1ea9cfd25:** still based on11cb3d4, with7modified source files and new NativeRecoveryCheck.swift. Source modification times show ongoing work through22:07UTC. It has no matching remote branch in the targeted readback. These facts do not establish its test result or release the dirty work for takeover.
- **Accessibility01a1ea56:** clean at6054d0bcfcd2d84aa5d4701c982d4feb256d9980, **24 local commits** and20 changed paths from243. Latest notice21:37UTC still targets obsolete01a49 and expressly reports local patches, no push/merge/native build/VoiceOver pass. Its registered branch was absent from targeted remote readback.

The accessibility/search overlap is now11 committed paths; accessibility/recovery overlap remains MainActivity.kt, MobileApplicationState.swift and NativeApplicationsViews.swift. All20 a11y changed file blobs differ from288, which does not by itself quantify individual hunk incorporation. Reconcile exact hunks and the shared catalog before integration. The current notice and full path lists are saved in current-native-state.json and immutable-tree-comparison.json.

All three previously identified Grok PIDs were present at22:36UTC. The shared native lock was absent, and no matching xcodebuild/gradle process names were observed at that instant. Presence does not prove uninterrupted progress, and absence does not transfer build ownership.

## Coordination and workflow risk

Newer PR comments include search's checkpoint and two independent CI observations. No explicit current-owner acknowledgement of root's accessibility-overlap request was found among those comments. Root/search integration is nevertheless independently demonstrated by the new merge and exact blobs; do not keep reporting those files as unintegrated.

The workflow at288 is still blobf4a5a102d2f6179e02fa40a684627e06ebfb7ab5. Its concurrency group contains workflow and ref but omits acceptance_scope, with cancel-in-progress:true. The source-level full/partial cancellation risk remains. Publisher owns scope-key correction and validation; no specific cancellation incident is attributed here.

## Existing publisher worktrees recovered

The cloud RECOVERY-STATE.json is stale at19:35UTC after the earlier workspace-loss recovery. The actual Mac source root is /Users/saleh/Library/Caches/Publishing-Continuation-20261117-d597fc87411f/Recovery-d57f4cd77813/SourceRecovery-20261117T1920Z/. At22:45UTC:

- Career-CombinedR2 is clean at288 on recovery/publishing-reconciled-20261117-d57.
- Career-EmptyState-UI288 is clean at local a17999, as reviewed above.
- Career-ToolchainProof288 is at288 on recovery/toolchain-proof-20261117-d57, with dirty hosted/package.json and hosted/package-lock.json. Preserve and coordinate this existing proof with the dependency owner. No package content or result was changed or tested by this helper.

The current root and dependency helper were notified of these owner lanes. No external owner message was posted by this helper.

## Evidence

- current-native-state.json: bounded state, CI jobs/log observations, latest notice and new PR comments.
- immutable-tree-comparison.json: exact root/search/a11y versus publisher blobs.
- remote-ref-readback.json: final targeted remote verification at22:42:52UTC.
- run43-iphone-ui.log, run43-android.log, run43-hosted.log: raw retrieved CI job logs.
- Four .288-source files: immutable code used for the complete-empty diagnosis.
- publisher-active-lanes.json and publisher-empty-state-a17999.patch: actual owner worktrees and existing correction.
- publisher-checkout-observation.json: older clean363 clone, retained to explain why it is not the newest source.

This helper has not modified or taken over any implementation lane. Root should route the actionable source mismatch and latest integration state to the existing publisher while continuing its independent hosted/browser work.
