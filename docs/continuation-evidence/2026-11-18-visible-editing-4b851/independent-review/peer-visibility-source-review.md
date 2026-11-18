# Peer source review: Keep editing target visibility

## Verdict

**The exact two-option production correction is supported and appropriately narrow. No weakened assertion or unrelated change was found.** It allows the browser to reveal a control while preserving the existing choice of focus target and all recovery guards. Real-browser visibility remains to be demonstrated by root; this review is not a layout or full-gate pass.

Baseline commit supplied by root: `cad85c495bc03853cc2258d093e79d8d1fb52ae3`. Root observed Keep via Enter returning focus to Cancel and preserving the dirty draft, while Cancel's bounds (top 832.1459, bottom 881.1459) lay below the dialog's clipping bottom of 828. Active-element success alone therefore did not establish a usable visible focus result. This reviewer did not operate the browser or independently capture those measurements.

## Exact change

Only the two Keep calls in PhoneApp change from `focus({ preventScroll: true })` to `focus({ preventScroll: false })`: restored opener and editor fallback. Allowing native focus scrolling directly addresses the reported suppression of scrolling inside the open dialog. No target selection, current-focus check, connection/open/form/prompt guard, effective disabled/hidden/inert check, draft state, storage behavior, or modal-close behavior changes.

The complete source comparison confirms that substituting these two options into the baseline produces the candidate PhoneApp exactly. The components file remains byte-identical, including its separate closed-modal/Clear recovery behavior. The record-tools tests and Arabic catalog are also unchanged.

The test diff changes the previous Keep opener option expectation to false and adds explicit false expectations for the editor fallback and add-job form. Existing focus-target, no-steal, data-preservation and boundary assertions remain. Revising the former true expectation is an intentional correction of the now-disproved visibility contract, not removal of a regression check.

## Acceptance expectation and bounded risk

Native scrolling may choose a different offset across browser/layout combinations; do not require a hard-coded scrollTop. For the reported long-dialog case, root should reproduce the clipped opener, activate Keep with Enter, then wait for recovery/layout and verify:

- Focus remains on the intended Cancel control, the dialog remains open, and the dirty draft remains intact.
- The control is visible within both the dialog scrollport and viewport; this small button should fit fully within those bounds.
- Measurements and the screenshot are taken before a later locator action or manual scroll can automatically reveal the control and mask the failure.

The existing live-focus and stale-callback guards must continue to prevent unwanted focus changes or scrolling when another control has already acquired focus. The option-contract tests can verify the requested false option, but their fake DOM has no layout and cannot prove rendered visibility. Root owns the actual pinned/full and browser acceptance; no broader accessibility refactor is requested.

## Reviewed identities

| Artifact | SHA-256 |
|---|---|
| Patch, 3,045 bytes | `05488c32dab09136a62b1d20938ec2c7a1eae27c0cb2a91c44630a98406219ea` |
| Baseline PhoneApp | `57543cdbc0fbcb7a51cab725d65907e76af2a29ecf9f2022bffe6caaadc9da02` |
| Candidate PhoneApp | `e3454df4c4a4189475097d5bcc0ac2e2bf1fe53447d3046513c6eb780a9cd998` |
| Baseline recovery test | `be04a91f285aa9556e593af871e1b360e6e34ec2ce963d6528a63a32b0652206` |
| Candidate recovery test | `671f0cc26fa35a8df399a85332902b1226b537115fd7321a40c1a04c6ddc9c4b` |

No tests, implementation scripts, builds, installs, browser or Mac actions were executed by this reviewer. No production/test source was edited; only this review and its JSON counterpart were written.
