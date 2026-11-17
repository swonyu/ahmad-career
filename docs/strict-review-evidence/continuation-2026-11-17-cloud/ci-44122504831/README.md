# Phone quality run 35 — completed tests, failed finalization gate

Run [44122504831](https://github.com/swonyu/ahmad-career/actions/runs/44122504831) is terminal with **four successful gates and one failed iPhone UI gate**. All **17 iPhone test cases passed**, but the execution-step timer stopped xcodebuild before its result bundle finalized. The following attachment export failed. These facts must remain separate; this run is not a five-gate pass.

## Exact source

| Object | SHA |
| --- | --- |
| Development candidate | `d97bc209ca84ecb830e6c6bad25808164706409f` |
| Actual PR merge checkout used by CI | `50c05cb61cc28f59f4591ddcd53fa49d755fda44` |
| Tree shared by both commits | `7ccafbdaad98f000e5e12a385dd69fc5beb72f50` |
| Candidate parent | `fa151e219ad4e8d9f0d3337eec10a60ed5223d47` |

The raw Service job log identifies the checkout. Git Data reads independently returned the same tree for the candidate and temporary PR merge; their comparison has zero changed files. [Tree receipt](git-tree-equivalence.json) and [comparison](checkout-equivalence.json) preserve this distinction. The temporary CI merge is not a merged PR, public deployment or release.

## Gate and test results

| Gate or phase | Actual result |
| --- | --- |
| Service and synthetic HTTPS | Passed |
| Hosted HTTPS service and durable storage | Passed |
| iPhone logic and unsigned build | Passed |
| Android compile, lint and native acceptance | Passed |
| Android ordinary phone suite | 104 executed, 104 passed; 191.584 seconds |
| Ordinary-preview TLS rejection | 1 executed, 1 passed; 0.561 seconds |
| Android native synthetic HTTPS | 1 executed, 1 passed; 24.483 seconds |
| iPhone test-case execution | 17 executed, 17 passed, zero failures or unexpected failures; 1471.177 seconds |
| Aggregate iPhone UI job | Failed: execution-step timeout, then failed result export |
| Overall workflow | Failed |

The Android instrumentation contains zero failure/skip status codes and reaches both `test-body:completed` and `activity-rule:finished` for HTTPS. The test environment remains a disposable API 36 emulator, 360dp, Arabic locale, forced RTL, dark appearance and 180% text. Ordinary-preview system trust and the acceptance variant's isolated test CA remain distinct. The receipt reports zero real employer requests and no production accounts. See [Android counts](android-results.json), [runner receipt](android-verification.json), [settings](android-com.saleh.careerfinder.acceptance-settings.json) and the three raw instrumentation logs.

All 20 Android capture hashes match their artifact manifest. The preserved [profile capture](android-profile-large-text.png) contains a substantial profile viewport. A separate [bounded visual review](android-profile-visual-review.json) found that the adjacent field and notice text are correctly clipped to separate scroll regions; it established no new overlap defect. That review does not establish physical TalkBack acceptance.

The Hosted artifacts match all 35 declared source-hash entries against this candidate. The [integrity receipt](artifact-source-consistency.json) also binds the reviewed native Clear-control source and test files.

## iPhone failure mechanism

The [raw test log](career-iphone-ui.log) contains the complete, unique expected set of 17 passing method names. The [job log](iphone-ui-job.log) records the subsequent cancellation and export failure:

| Event | UTC |
| --- | --- |
| XCTest suite starts | 16:15:07.239 |
| All 17 cases and all-tests suite finish successfully | 16:39:38.455 |
| GitHub reports the execution step timed out after 30 minutes | 16:39:56.275130 |
| Export reports missing result-bundle Info.plist | 16:40:01.361020 |
| Export exits 64 | 16:40:01.363182 |

The timer expired **17.82013 seconds after the successful suite footer**. The archive contains the raw log and unfinished `CareerFinderUI.xcresult/Staging` data. It has no finalized result-bundle Info.plist and no exported screenshot manifest. The [iPhone result receipt](iphone-ui-results.json) preserves the successful case execution and failed gate together.

The formerly failing `testProfileReadinessAndSimpleConnectionSetup` now passes in **86.706 seconds**. Its log explicitly records tapping the production `connection.clearAddress` button at test-relative 61.74 seconds. The exact tested source retains the full keyboard-dismissal requirement, visible/enabled control checks, common exact-empty predicate, fresh keyboard readiness, original exact-final-value predicate, unsent-code invalidation check and restoration of the default service. See the [case excerpt](iphone-clear-control-case.log) and [runtime receipt](iphone-clear-control-runtime.json).

The guard outcomes follow from that passing method bound to the reviewed source; no separately captured field-value dump or successful screenshot/video export is claimed. A result from another publisher-owned source cannot be inferred from this run.

## Bounded workflow follow-up

The isolated follow-up changes only two numeric limits in `.github/workflows/phone-quality.yml`:

| Limit | Before | Proposed successor |
| --- | --- | --- |
| iPhone UI execution step | 30 minutes | 35 minutes |
| iPhone UI job | 35 minutes | 40 minutes |

The same nominal five-minute job-minus-step margin remains for surrounding setup and evidence work. It is not a guarantee of five full minutes after every execution. Exact before/after byte comparison proves all other workflow content is unchanged, including commands, test selection, retries, export behavior and concurrency. Application source, all 17 test methods, 144 assertion calls and per-assertion waits are unchanged.

The [follow-up receipt](iphone-finalization-budget-followup.json) records source and patch hashes. The [independent peer review](iphone-finalization-budget-peer-review.json) accepts that precise delta and independently verifies the 17-pass log and timeout timing. `git diff --check` passes. No extra native test or local Mac build was performed to validate this configuration-only delta.

**The successor's aggregate gate and evidence finalization remain pending.** Increasing this wrapper budget does not retroactively make run 35 successful.

## Artifact verification

All four archives were downloaded once, checked against exact GitHub sizes and SHA-256 digests, and inspected for unsafe extraction paths/symlinks before extraction. See [combined verification](artifact-verification.json) and [GitHub artifact metadata](terminal-artifacts.json).

| Archive | Bytes | SHA-256 |
| --- | ---: | --- |
| Hosted | 8,817 | `b8c0d8caeee3e9c9e074820f1a3ffcb8537fe87d9f732906bc1aa8f106fc9e50` |
| Unsigned iPhone build | 8,371 | `4d02e71fbdcbf2ea118b29c026b4eb4563910a684d22ebebb784185f0cb8cb1e` |
| Android | 3,071,702 | `65959f4f510876430bbec6c73cfcf84b576052ab266e47a4c40a53afd2f4b6dc` |
| iPhone UI partial results | 28,681,944 | `3037c836cbfd2a0f7d539fe2207669553e85515e76812254896338852fbbaa2a` |

The archives expire on 24 November 2026 according to their individual metadata. Selected logs, metadata and the Android profile image are preserved here. The full extracted archives remain in the isolated workspace; the iPhone archive's incomplete state is preserved without relabeling it as complete.

## Delivery and ownership

The Mac had restarted at 15:57:20 UTC and the previous owned temporary relay was absent. A fresh uniquely named bare repository was created for object-only transfer. The [preflight](relay-preflight.json) records that changed baseline instead of claiming preservation of a directory that no longer existed.

The verified bundle was pushed by ordinary fast-forward to the same isolated development branch at **16:09:18 UTC**. The protected development base remained `949ce0ad327beab79fa7033423b462ebc7bd98be`; the protected publishing copy remained `fd9c5399f2b7001b234b3b86bf72e2b36b5114c1`. The fresh bare HEAD and absent index were preserved, and the shared HalalTag build lock was untouched. See [push receipt](push-receipt.json).

The authorized draft PR body was updated at **16:11:30 UTC**, read back byte-for-byte, and retained draft/open/base/head state. Only the prepared pending sentence gained this run's link. No duplicate comment or manual workflow dispatch was made. See [PR edit receipt](pr-edit-receipt.json) and [delivered body](delivered-pr-body.md).

This lane performed no shared native build, signing change, store action, real employer application or public hosted replacement. The original continuation budget was not restarted. Real provider consent/callback, disposable-account recovery, physical VoiceOver/TalkBack and final publishing integration remain separate acceptance gates.
