# Three independent expert review closures

These are coordinator records of three separate review sessions. Reviewers inspected source, test assertions, raw author-run receipts and hashes. They did not author the corrections they reviewed or independently run native builds and tests. Exact combined source bindings are recorded in source-bindings.json.

## Engineering — /root/expert_engineering

The final corrected-source verdict is bound to `d8d2e999d0348eb07942472a1d9e87d2fc4498a2`: no additional P0, P1 or P2 defect was established in the bounded reviewed changes.

| Finding | Reviewed correction | Actual focused evidence |
| --- | --- | --- |
| Failed iOS saved-file recovery erased the submitted-search retry | Preserve live state until a replacement file passes validation; retain intentional lifecycle resets | Same expanded harness fails on the baseline, then passes 167 assertions across 32 scenarios |
| An expired iPhone deadline could strand Search again | Refresh the view clock before checking the deadline | Actual extracted task and predicates: six baseline failures, then 21 assertions across five passing scenarios |
| A selected older record draft could be ignored and deleted unseen | Bind the explicitly selected values to the current revision for review; preserve original alternatives | Same harness fails on the baseline, then passes 201 assertions across 61 scenarios |
| Pre-existing Android saved-file recovery cleared usable state | Preserve the same store/key session until valid restoration, with generation and ownership guards | Same actual regression class: 11 baseline tests with three failures, then 11/11 pass in the documented JVM harness |

Android host adapters and the Kotlin version difference are explicit; they do not establish Keystore, SDK or device behavior. Normal scope, identity, generation, stale-save, capacity and Stop/receipt boundaries remain intact.

## UX/accessibility — /root/expert_ux

The corrective verdict is bound to `cbe3b29d0b14f357cb6aab1b1b9f4425ef1fa83d`; the reviewed UI and store files remain unchanged at `d8d2e999`.

The reviewer closed the additional finding that exact retry controls remained enabled while the model would refuse the action. All three controls now use the same cooldown predicate, while the localized error and deadline remain visible.

The selected older record opens with the chosen values for review and explicit save, preserving original alternatives. No additional material UX issue was established in this delta. This is source and evidence review, not VoiceOver, TalkBack or native UI traversal.

## Security, SSR and release evidence — /root/expert_release

The reviewer inspected SSR commit `963e871` and its unchanged hosted/workflow portions in the combined tree. No material introduced authentication, cache, bootstrap, router, public-asset, bundle-boundary or CI defect was established.

Independent integrity checks matched 261 source-map files, 78 manifest contents, 42 gate logs, 93 build inputs, 21 assets and the actual 5,768,585-byte Worker, without mismatches. Ordinary npm ci lifecycle executions and the unfiltered zero-vulnerability audit were confirmed. Lint equivalence claims remain bounded.

The reviewer independently verified the integrated Chrome packet at `4368a29`: guest note persistence/export/focus, six PDF selections plus cancellation and synthetic owner-change cases, exact worker lifecycles, manifests and screenshots. The attempted 320-pixel viewport override stayed at 390 and is not a 320-pixel pass. The preselection CSP eval denial was retained without unsupported origin attribution or a zero-violation claim.

This reviewer identified a missing full Profile/PDF/save/reload gate. Root then performed it on `d8d2e999` through the actual production UI. The reviewer independently matched the downloaded 4,183-byte export, original 1,311-byte PDF, UI observations, source and local-save semantics, and closed that gate with zero mismatches. See the adjacent production-profile evidence directory.

## Scope and final gate

Five specific review findings were corrected in four repair areas; both iPhone cooldown observations share one UI correction. All source findings above are closed. This does not declare universal correctness or live-provider/store completion. [Combined CI run 44262971576](https://github.com/swonyu/ahmad-career/actions/runs/44262971576) is the separate native/build gate; consult its final result and retained receipt.

The three original Grok chats were retained. The user's exhausted usage was respected: no new prompts were submitted after that steering. These three independent reviewers supplied the requested expert review without further Grok usage.

## Current Android CI visual and lint follow-up

The UX reviewer viewed all 20 current-run screenshots and independently matched every image against its manifest. No material visual regression was established in the captured Arabic large-text states. These images do not establish a separate English-interface visual matrix or TalkBack traversal.

The engineering reviewer classified the current lint result: 0 errors and 20 warnings. Flagged source/assets and the relevant generated sentence are inherited from the publisher baseline. No material introduced defect or acceptance blocker was established. The existing icon-shape and monochrome-theming limitations remain explicitly recorded. Full category counts, source and screenshot bindings, and limits are in android-current-visual-lint-review.json.
