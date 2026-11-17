# Phone quality run 40 — three gates passed, two failed

[Run 44139018005](https://github.com/swonyu/ahmad-career/actions/runs/44139018005) completed with **three successful gates and two failed gates** for the exact acceptance-banner follow-up below. Service, Android, and iPhone logic/unsigned build passed. Hosted failed at the dependency audit; iPhone interface acceptance executed 17 cases with 15 passing and two failing. The iPhone result bundle finalized and its evidence export/upload succeeded. See the [terminal summary](terminal-summary.json), [jobs](terminal-jobs.json) and [workflow outcome](terminal-workflow-runs.json).

Run 38 remains the historical all-five successful checkpoint at source `21f08f5c4509bd1fdbe9112003224bf2316edd2a`. Its captured acceptance-banner overlap is preserved in that packet. Current-source acceptance must be assessed from this run rather than inherited from that earlier result.

## Exact source

| Object | SHA |
| --- | --- |
| Development source | `63eecda5c5c57805aeae1f5ba8e22af65e38ceee` |
| Actual temporary PR merge checkout | `e3e875cee10e379c34d833ae22827f0ae9aee570` |
| Tree shared by both commits | `74b02b205e7a256f589d9961b2f4a9c129b6935d` |
| Source parent | `21f08f5c4509bd1fdbe9112003224bf2316edd2a` |

All five raw job logs identify the same checkout. Direct Git Data reads establish the common tree. The candidate-to-merge comparison contains zero changed files. See [tree equality](git-tree-equivalence.json) and [comparison](checkout-equivalence.json). This temporary merge is a CI checkout; no PR merge, public deployment or release is implied.

The only source delta is 25 additions and six deletions in `apple/AhmadCareer/NativeCareerViews.swift`. The acceptance-only banner now occupies its own row above the tab content. Ordinary DEBUG and Release content pass through unchanged. The existing UI-acceptance flag/UUID guard, marker text/identifier, five tabs, storage-error inset, test source, workflow and all hosted source remain unchanged.

The [independent source review](banner-layout-source-peer-review.json) accepts the exact repaired source hash `01864eda7719516dc46458a0518209a17c4a85dfe0bf236063ca93cb88e84cd7`. [Source integrity](artifact-source-consistency.json) verifies that hash, the unchanged native application/test/workflow hashes, all 35 Hosted artifact source-hash entries, 17 iPhone test methods and 144 static assertion calls. Static review does not itself establish the repaired visual result.

## Hosted audit failure

The Hosted gate successfully installed the locked dependencies, checked types, exercised the production handler with local D1/R2, and built the deployable Worker/setup pages. Its unchanged **Audit the locked dependencies** step exited 1 at **17:40:09.2861885 UTC**. The evidence upload still succeeded.

The raw [audit report](dependency-audit-ci.json) records **19 high findings**, propagated through the dependency graph from the picomatch advisory [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), titled “picomatch vulnerable to ReDoS through single-branch repeated extglobs.” The report's affected range is `<=4.0.7`. The current lock contains picomatch 2.3.2, 4.0.4 and 4.0.7 at its three installed paths.

These are 19 affected dependency entries in the npm audit graph, not 19 independently reproduced exploits. No runtime reachability, external exploitation or advisory publication time is inferred here. The preserved run 38 audit reported zero vulnerabilities; hosted source and the lock are unchanged by this banner-only commit. The [failure receipt](hosted-audit-failure.json) binds both observations and the current report's SHA-256. This lane did not waive the audit, replace dependencies, or retry the failed gate.

## Android acceptance

The Android compile/lint/native gate passed. Its archive reports the exact temporary merge above. Raw instrumentation records:

| Phase | Executed / passed | Duration |
| --- | ---: | ---: |
| Ordinary phone suite | 104 / 104 | 144.784 seconds |
| Normal-preview TLS boundary | 1 / 1 | 0.548 seconds |
| Native synthetic HTTPS | 1 / 1 | 21.224 seconds |

All phases have zero failure or skip status codes. The HTTPS trace reaches both `test-body:completed` and `activity-rule:finished`. The runner retains API 36, Arabic locale, forced RTL, dark appearance, 180% text and the same disposable phone geometry. Normal system trust and the acceptance variant's isolated test CA remain distinct. Its receipt records zero real employer requests and no production accounts.

See [parsed Android results](android-results.json), [runner verification](android-verification.json), [ordinary log](android-ordinary-phone.log), [TLS log](android-normal-preview-tls-boundary.log), and [HTTPS log](android-native-https-phone.log). All 20 capture sizes/hashes match the [runner screenshot manifest](android-screenshots.json). The [large-text profile original](android-profile-large-text.png) is retained. APK hashes are declarations from the CI runner; the artifact does not contain APK binaries for an independent local rehash.

## iPhone acceptance and banner comparison

The iPhone Air Simulator ran iOS 26.5, arm64. Its 17 unique method names match the complete source test set. The suite executed **17 cases: 15 passed, two failed, zero unexpected failures and zero reported skips**, in **1287.324 seconds**. The [parsed result](iphone-ui-results.json) records every method and duration alongside the exact failures:

| Method | Failed check |
| --- | --- |
| `testAccessibilityTextKeepsCoreControlsReachable` | The existing five-second real-keyboard-key readiness predicate timed out after opening the first-name field at the largest text size. |
| `testArabicLanguagePersistsAndKeepsSavedProfileValuesAtLargeText` | After saving the profile draft, the Settings tab existed but the immediate `isHittable` assertion failed. The Arabic language change/capture had not yet been reached. |

The suite began at **17:43:26.895 UTC** and finished at **18:04:54.248 UTC**. xcodebuild reported `TEST FAILED` at **18:05:40.445775 UTC**. The execution step failed on these assertions; its 35-minute job-step budget did not expire. The result bundle's Info.plist was finalized, and the subsequent export and upload steps passed. This differs from run 35's historical finalization timeout; the current failure is retained without a retry or skipped test.

The real Clear-address interaction passed in **107.584 seconds**. Its [case log](iphone-clear-control-case.log) records the actual `connection.clearAddress` tap; the [source-bound receipt](iphone-clear-control-runtime.json) retains the keyboard, exact-empty, exact-final-value and unsent-code guards. This passing case does not erase the other two failures or establish a visual review of the expanded Clear control.

The exported evidence includes **29 original PNGs**, totaling **12,811,735 bytes**, across 15 attachment-bearing test groups. The export also contains two failed-test recordings and 30 binary event/snapshot attachments. The full [export manifest](iphone-exported-manifest.json) and [hash inventory](iphone-screenshots.json) distinguish these kinds. PNG hashes were computed from the digest-verified archive; Apple's manifest does not itself declare image hashes.

The matching [dark-largest-text Settings original](iphone-settings-dark-large-text.png), capture prefix `24-settings-dark-large-text`, shows the banner above the navigation title without their previous overlap. The `27-settings-arabic-large-text` capture is absent because that method stopped before changing the language. The earlier **RUN38-VIS-01** finding therefore does not receive full Arabic-and-dark closure from this run.

Four [diagnostic frames](iphone-diagnostic-frames.json) were decoded from the existing failed-test recordings, with exact video hashes and seek commands retained:

- [Keyboard at 80.0 seconds](iphone-keyboard-readiness-80.0s.png): the first-name field has a caret, while the software keyboard has not appeared.
- [Keyboard at 87.5 seconds](iphone-keyboard-readiness-87.5s.png): the keyboard and Delete glyph are visibly present.
- [Profile sheet at 98.5 seconds](iphone-settings-unreachable-98.5s.png): the sheet remains onscreen after the save interaction.
- [Settings tab at 100.5 seconds](iphone-settings-unreachable-100.5s.png): the sheet is closed and the Settings tab is visibly present.

These frames bound visible transitions; they do not expose the exact accessibility-tree state at each assertion. The exported UI Snapshot attachments contain a root UIApplication with no child geometry. No persistent physical occlusion or banner-specific root cause is established by the terminal frames. Transition readiness is a hypothesis for further bounded correction, not a passing result.

The [independent runtime/visual review](iphone-runtime-visual-peer-review.json) verified the four diagnostic frames and their recording hashes, dark original/manifest linkage, missing Arabic capture, exact 17/15/2 outcome and passing Clear-control case. It confirms English-dark banner/title separation while leaving bilingual closure incomplete. It also records the pale tab bar in the single dark capture as an unverified observation: no later settled dark frame or recording is available to establish a persistent contrast defect. No source change, new capture or rerun was performed for that review.

## Artifact and ownership boundaries

All four archives match GitHub's full byte counts and SHA-256 digests; ZIP integrity, paths and symlinks were checked before extraction. See the [combined verification](artifact-verification.json), [GitHub artifact metadata](terminal-artifacts.json), and individual early, Android and iPhone archive receipts.

| Archive | Bytes | SHA-256 |
| --- | ---: | --- |
| Hosted | 9,908 | `71dc243b282ff1cf057089c17661c95c0c7e30b1a19bf5b2bda0d87e17af3e12` |
| Unsigned iPhone build | 8,389 | `9d375db4de9b9fc291561300db4fce8615b558aafd13c737f5571b8f8a6ea9e0` |
| Android | 3,148,981 | `f2676a4a1c6caeb653b7ab3f2d650ed936da80161cd527e7458b06568b3d5212` |
| iPhone UI | 203,742,723 | `582a1de6b8079597f23080d052de95cea30b849b3b398f34597a3b5c4f839303` |

GitHub metadata sets these artifacts to expire on 24 November 2026. Source-bound raw logs, full image/attachment inventory, selected original captures and four clearly labeled derived diagnostic frames are retained here. Full archives and recordings remain in CI and the local extraction.

The [preflight](relay-preflight.json) and [session/process inventory](relay-session-process-inventory.json) preserve the fresh Mac check. Separately owned HalalTag/native and Career Finder feed activity was observed and left untouched. No existing session referenced the owned bare object relay; its expected symbolic HEAD and absent index were preserved. The shared build lock was absent at the second check, which was not treated as a build reservation.

The transferred 978-byte bundle matched SHA-256 `4e91903884a75bcb129f8c46df0c3e5a64af036f52df3f1c1cf38deebc88d661` and passed bundle, parent, tree, ancestry, exact source hash and one-file delta checks. An ordinary fast-forward push completed at **17:37:18.386895 UTC**. The candidate was the expected parent immediately before the push. Protected development `949ce0ad327beab79fa7033423b462ebc7bd98be` and publishing copy `fd9c5399f2b7001b234b3b86bf72e2b36b5114c1` remained unchanged. See the [push receipt](push-receipt.json).

GitHub automatically started this single successor. This lane performed no manual dispatch, cancellation, rerun, shared Mac native build, checkout in the bare relay, signing/store action or public hosted replacement. The relay was released after push; root owns PR metadata and documentation coordination.

These results qualify only this exact controlled CI source. Real provider consent/callback, authorized disposable-account recovery, physical VoiceOver/TalkBack, other publishing candidates, combined integration and store acceptance remain separate. This run does not reset the original continuation budget or establish an unknown active-time remainder.
