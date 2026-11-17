# Phone quality run 38 — all five gates passed

[Run 44130275991](https://github.com/swonyu/ahmad-career/actions/runs/44130275991) completed successfully for the exact development source below. All five gates passed. The iPhone suite completed **17/17 cases**, xcodebuild finalized its result bundle, and screenshot export/upload succeeded. Android completed **104 ordinary tests, one normal TLS-boundary test and one native synthetic HTTPS test**.

This is controlled CI acceptance. Real provider consent/callback, disposable-account recovery, physical VoiceOver/TalkBack, final combined publishing integration and store acceptance remain separate.

## Exact source and checkout

| Object | SHA |
| --- | --- |
| Development source | `21f08f5c4509bd1fdbe9112003224bf2316edd2a` |
| Actual temporary PR merge used by all five CI jobs | `8ea5e6b2108772cfade35f7e266659a27ab00b2e` |
| Tree shared by both commits | `b2a2ca81df383a468c318e4ebc629c13f16e5fe9` |
| Source parent | `d97bc209ca84ecb830e6c6bad25808164706409f` |

All five raw job logs identify the same checkout. Direct Git Data reads establish the common tree, and the candidate-to-merge comparison contains zero changed files. See [tree equality](git-tree-equivalence.json) and [comparison](checkout-equivalence.json). The temporary PR merge is a CI checkout; no PR merge or release is inferred.

The source delta from the parent comprises four files: the two reviewed iPhone workflow time limits, the singular hosted English/Arabic search messages, and their existing test-matrix entries. Native application/test source is unchanged from the independently reviewed Clear-control repair. [Source integrity](artifact-source-consistency.json) binds both native files, the workflow, and all 35 source-hash entries declared by the Hosted artifacts.

## Terminal results

| Gate or phase | Verified result |
| --- | --- |
| Service and synthetic HTTPS | Passed |
| Hosted HTTPS service and durable storage | Passed |
| iPhone logic and unsigned build | Passed |
| Android compile, lint and native acceptance | Passed |
| iPhone native interface acceptance | Passed, including result finalization and evidence export |
| Android ordinary phone suite | 104 executed, 104 passed; 149.488 seconds |
| Normal-preview TLS rejection | 1 executed, 1 passed; 0.545 seconds |
| Native synthetic HTTPS | 1 executed, 1 passed; 21.892 seconds |
| iPhone test cases | 17 executed, 17 passed, zero failures or unexpected failures; 1350.545 seconds |

The raw instrumentation reports zero failure or skip status codes across all three Android phases. HTTPS reaches both `test-body:completed` and `activity-rule:finished`. The runner retains a disposable API 36 phone at 360dp, Arabic locale, forced RTL, dark appearance and 180% text. Ordinary system trust and the acceptance variant's isolated test CA remain distinct. The receipt reports zero real employer requests and no production accounts. See [Android results](android-results.json), [runner verification](android-verification.json), [settings](android-com.saleh.careerfinder.acceptance-settings.json) and the three phase logs.

The selected iPhone is an **iPhone Air Simulator on iOS 26.5, arm64**, as recorded by the job. The observed 17 unique passing method names exactly match the complete source method set; there are no reported skipped cases. The [iPhone result receipt](iphone-ui-results.json) preserves every method and duration.

| iPhone event | UTC |
| --- | --- |
| All-tests suite begins | 16:55:17.683 |
| All-tests suite passes | 17:17:48.267 |
| xcodebuild reports TEST SUCCEEDED | 17:18:27.427699 |
| Export and artifact upload | Both succeeded |

The finalized result bundle contains its Info.plist, and the exported screenshot manifest is present. The successful process marker follows the suite footer by about 39.16 seconds. Parent run 35 remains a failed aggregate gate: its 17 cases passed, but its execution timer expired 17.82 seconds after the footer, before finalization. Run 38 does not retroactively change that record.

The execution-step limit is now 35 minutes and the iPhone job limit is 40 minutes. The nominal five-minute job-minus-step margin remains for surrounding setup/evidence work. All other workflow bytes, commands, test methods, assertion calls, retries and per-assertion waits are unchanged by that repair. These CI limits do not reset the original continuation work budget.

## Clear-control runtime evidence

`testProfileReadinessAndSimpleConnectionSetup` passes in **91.008 seconds**. Its raw log records the actual `connection.clearAddress` button tap at test-relative **64.00 seconds**.

The executed source preserves full keyboard dismissal before target reveal, enabled/visible control checks, the exact-empty predicate, fresh keyboard readiness after refocus, the original exact-final-value predicate, unsent-code invalidation and restoration of the default service. See the [case log](iphone-clear-control-case.log) and [runtime receipt](iphone-clear-control-runtime.json).

Those guard outcomes follow from the passing method bound to the reviewed exact source; no separately captured field-value dump is claimed. The retained connection screenshot follows restoration of default setup and does not show the expanded Clear control.

## Screenshots and bounded visual review

The successful iPhone export contains **36 original PNGs**, totaling **16,183,488 bytes**, across **15 attachment-bearing test groups**. The other two passing methods have no exported attachments:

- `testDeviceLanguageUsesAnOrderedSupportedFallbackAndAllowsEnglishOverride`
- `testOpportunityDiscardRequiresExplicitChoice`

All manifest file names resolve to unique exported images. The complete [exported manifest](iphone-exported-manifest.json) and [36-image hash inventory](iphone-screenshots.json) are preserved. Image hashes are computed from the archive whose full digest matches GitHub; the original export manifest itself does not declare image hashes.

Four representative original iPhone captures are retained here:

- [Default connection after reset](iphone-default-connection.png)
- [Arabic Settings at large text](iphone-settings-arabic-large-text.png)
- [Arabic profile with original saved values](iphone-arabic-profile-original-values.png)
- [Dark Settings at large text](iphone-settings-dark-large-text.png)

The independent [visual review](iphone-visual-peer-review.json) verified the four originals, hashes and export linkage. It found no new actionable product-control defect in the inspected connection/profile content. It retains **RUN38-VIS-01**, a low-severity acceptance-harness readability finding: the synthetic-data banner overlaps the small navigation title in the two large-text Settings frames. Source inspection confirms that banner requires DEBUG, the UI-acceptance flag and a valid UUID; it is excluded from Release. No production UI defect is inferred from that banner. Its overlap remains visible in the evidence and is not labeled fixed.

The expanded Clear control's visual appearance is outside these captures; its real interaction is evidenced by the passing case and explicit tap log. These acceptance images do not establish physical assistive-technology acceptance or constitute final store screenshots.

Android's 20 capture hashes match its runner manifest. The [profile image](android-profile-large-text.png), [capture manifest](android-screenshots.json) and current exact-source runtime result are retained. No additional Android visual test was run after the previously documented source review.

## Artifact integrity

All four archives match GitHub's exact sizes and SHA-256 digests. ZIP integrity and extraction paths/symlinks were checked before extraction. See [combined verification](artifact-verification.json) and [GitHub metadata](terminal-artifacts.json).

| Archive | Bytes | SHA-256 |
| --- | ---: | --- |
| Hosted | 8,816 | `7b45086cb91136d33fe11ebaa4d364474ddace7515100b13c2bae291b2047203` |
| Unsigned iPhone build | 8,349 | `49136f50cbc11beee85b48848fc4abb792a01c47834aec8008d01c185a28c89b` |
| Android | 3,107,392 | `0f217cb73dd30c866cf95c3ca3438f8f3409fecf744c43573c53e49fd7e80edb` |
| iPhone UI | 177,487,782 | `4895285f086dece71aefd3e3af8d325e79c0440035740eb648dfc1768bae5ec3` |

GitHub's individual metadata sets expiry on 24 November 2026. The full archives and all exported images remain in the local extraction and CI artifacts. This Git evidence folder retains the raw logs, receipts, full image inventory/manifest and selected original captures.

## Push and ownership

Fresh read-only inventory found the designated Mac online, no active terminal sessions, no matching native/Git relay processes and no Git lock files. The existing owned relay was a bare repository with the expected unborn symbolic HEAD and absent index. The shared build lock was absent; no build reservation was inferred. See [preflight](relay-preflight.json) and [session/process inventory](relay-session-process-inventory.json).

The 1,620-byte bundle matched SHA-256 `7ca73e54b2f4e236586b39225abc4565530edff0c6294ebf310a359e55439c3b`, passed Git bundle verification, and had the exact expected parent, four-file delta and tree. An ordinary fast-forward push completed at **16:50:07 UTC**. Immediately before and after the push, the protected development base remained `949ce0ad327beab79fa7033423b462ebc7bd98be` and the protected publishing copy remained `fd9c5399f2b7001b234b3b86bf72e2b36b5114c1`. The bare HEAD and absent index were preserved. See [push receipt](push-receipt.json).

GitHub automatically triggered this single successor run. This lane performed no manual dispatch, retry, cancellation, checkout on the Mac, shared native build, signing/store action or public hosted replacement. The relay was released after the push; root owns the subsequent PR metadata/documentation handoff. Another owner's publishing candidate requires its own integrated-source qualification.
