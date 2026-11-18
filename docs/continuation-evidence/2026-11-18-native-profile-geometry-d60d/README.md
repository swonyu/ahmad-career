# Native profile positioning correction — 18 November 2026

This package qualifies a change to the positioning block in `assertProfileLabel` in [`CareerFinderUITests.swift`](../../../apple/UITests/CareerFinderUITests.swift). Product UI is unchanged relative to base `1fe9b7543be68ec9343e0fcbc6ca3bc52d58ef62`. The final test source SHA-256 is `c4644ab9b28a1ec55cb284b5633e8d80bff07de3084472ae3798ded063736e3f`.

## Retained failures and correction

| Source | Actual result | Evidence and implication |
| --- | --- | --- |
| Base `1fe9b754` | Full first-name label/value containment failed | The 187.667-point pair fits the 367-point viewport, but its top overflow was 42.667 points. Twenty alternating 110.2-point drags left the label beneath navigation. See `baseline-failure.json`. |
| Candidate 001, source `d7a6bf22…` | Full method failed at email containment after first-name checks passed, 108.178 seconds | The email pair was 129.667 points high in a 394-point viewport, with only 2 points of bottom overflow. Twenty identical 10-point upward drags produced no observed scrolling. See `candidate-001-failure.json`. |
| Candidate 002, source `c4644ab9…` | Full affected method passed, 112.424 seconds, 1 test and 0 failures | Root ran `testAccessibilityTextKeepsCoreControlsReachable` on the iPhone Air simulator with iOS 26.5. `xcodebuild` exited 0 and the retained receipt confirms the source still matched. See `native-replay-002.json` and `native-observations.json`. |

The helper now derives direction and movement from the observed edge overflow, re-observes the pair each iteration, and performs a slow real drag with a 0.2-second end hold. Touch coordinates remain on the visible padding of the Form containing the specific field, outside its editable value. Travel is capped at 80 points and 25% of the visible scroll surface. A 32-point minimum, within that cap, addresses the actual 10-point no-motion case; it is an empirically chosen bounded correction, not a claimed universal UIKit gesture threshold.

All source outside this positioning block is byte-identical to the base. The 20-attempt bound, original screenshot and accessibility-tree captures, real keyboard requirements, exact field values and selected-language labels, no-overlap check, and strict full-label/full-field containment assertions remain intact. No native product layout or other UI behavior was changed. Syntax parsing and `git diff --check` passed before the root-owned native replay.

## Scope and limits

This is one actual complete simulator journey, not the full release gate. It does not establish physical-device behavior, VoiceOver or TalkBack traversal, or broader accessibility certification. Original failed runs remain retained and are explicitly marked as failures. The source scope and hashes are in `candidate-002-scope.json`; the bounded actual runtime receipt and artifact hashes are included beside it. Full XCResult bundles, logs and PNG/AX attachments remain in the recorded continuation-evidence location on the authorized Mac.
