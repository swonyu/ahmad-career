# Modal and Saved Clear focus recovery

## Ready for owner application and pinned acceptance

Base commit: `3fb5d97ec6f3568f2c8b27f148281926272a92fe` in `swonyu/ahmad-career`.

Patch: `modal-and-clear-focus.patch`.

Patch SHA-256: `282d33d6ca24ea317521a6c3b6fb1aeb97521f922eb451249f3877b7064d29f1`.

The exact GitHub source bytes were fetched at that commit, verified against Git blob SHA-1 identities, copied into this isolated cloud evidence tree, and recorded with SHA-256 in `base-source-manifest.json`. The patch was checked and actually applied to a separate disposable copy; all four resulting files match the candidate bytes. No Mac source, packages, browser, native work, CI or external posts were changed by this implementer.

Root independently observed two real-browser failures: deleting the last record-only Interview item closes the dialog with focus on BODY; subsequently clearing the retained filter also removes the focused Clear button and leaves BODY. The existing stage-filter visual recovery works. Root owns browser evidence, primary APG verification and the separate deletion-copy correction.

## Production behavior

`components.tsx` adds one phone-scoped `recoverPhoneFocus` utility. It waits until the next animation frame, then rereads active focus after React's removal work. It preserves native return to the invoker and any other connected focus target, including a newly selected control outside the phone shell. It aborts if the owning shell has gone, the old dialog reopened or another dialog in that shell is open.

When focus remains lost, the utility first attempts the surviving invoker. It checks again afterward, so a non-focusable invoker permits fallback and an invoker focus event that moves focus elsewhere is respected. The fallback is the existing `#phone-main .phone-page-heading h1[tabindex='-1']` within the captured `.phone-shell`; there is no document-wide heading query or language-dependent selector. Focus uses `preventScroll: true`.

Modal captures its invoker and owning shell before `showModal()`. Its real layout-effect cleanup still closes the native dialog, then requests this bounded recovery. Saved Clear retains its original three state resets and requests the same recovery through the existing heading ref. The heading and its tabIndex already exist in PhoneApp; no new tab stop or DOM structure is added.

## Non-overlapping source scope

| Path | Change |
|---|---|
| `hosted/app/phone/components.tsx` | Shared focus utility and actual Modal cleanup invocation. |
| `hosted/app/phone/PhoneApp.tsx` | Components import and Saved Clear handler only. |
| `hosted/tests/phone-recovery-isolation.mjs` | Append ten actual-source focus regression groups and synthetic DOM/frame ports. The original file is retained byte-for-byte as a prefix. |
| `hosted/tests/phone-record-tools.mjs` | Extract the actual helper and provide it plus a null DOM heading to the two existing Clear-handler tests. All existing reset/render assertions are preserved. |

The PhoneApp deletion confirmation/toast at the separate line-814 region and all Arabic messages are untouched. Apply the patch hunks to the owner-controlled integration copy; do not overwrite PhoneApp wholesale with this candidate because root is combining its independent copy hunks.

## Source identities

| Path | Base SHA-256 | Candidate SHA-256 |
|---|---|---|
| `hosted/app/phone/components.tsx` | `c7614e923223d427e3a218f9c8d1038e4d90f244de9da8707bb92bf8dce90c52` | `c18753ee7c8b342831864cecc2694708f09fee6019a76c530b2c2ae743446424` |
| `hosted/app/phone/PhoneApp.tsx` | `77b3f3bd43f7a7fab19b68807118fba41bb95409701d054ed8232bc139a7dcba` | `2e9024fab451f70bff40872e3090b3ab13c07a312fa1c48b999cd43890a33ac4` |
| `hosted/tests/phone-recovery-isolation.mjs` | `56114b76ab4db6b5abb964e755bc89773f3043ce0451a020c36bbe4838881e06` | `11eb0b7ff330b1b9c40c7dee656ae4968f3e482aed7e8f94a01cf1530739749e` |
| `hosted/tests/phone-record-tools.mjs` | `a383e178f53782529ec4ff35a111113a7e13a752ceea22a0e24b351039686015` | `965af62fc693ed788bd487ea9f18aea8d2af2e54a4242d70331569d16632feb2` |

## Meaningful regression scope

The required existing test file extracts the actual Modal layout-effect callback, actual exported utility and actual Saved Clear handler. It supplies controlled browser/frame ports without reproducing the recovery decision algorithm. An absent helper on the original source leaves its native-only cleanup executable, so original failures are behavior failures rather than a missing-helper fixture error.

The ten groups cover native/surviving invoker return, invoker removal before and after cleanup, non-focusable invokers, live focus chosen before close or before recovery, focus redirected by an invoker handler, reopened/replacement dialogs, removed shells/headings, absent/root/disconnected/closing-dialog focus, Clear's exact resets and disappeared-button recovery, and prevention of late Clear focus theft. The browser port rejects document-wide query selection.

Both modified test files are already explicitly included in the current package's main test chain. No package or lock change is needed. Existing stage-filter reset and actual-button assertions remain unchanged; their all-non-default fixture complements the new stage-only focus case.

## Executed cloud evidence

| Check | Observed result |
|---|---|
| `git apply --check` on a disposable base copy | Exit 0. |
| Actual patch application to that copy | Exit 0; all four outputs equal candidate bytes. |
| Preliminary actual-source focused runner against original | 4 pass / 6 fail; exit 1. The failures are focus-state assertions. |
| Same ten assertion groups against candidate | 10 pass / 0 fail; exit 0. |
| Modified MJS syntax checks | No syntax errors reported. |

The focused runtime was **Node v24.22.1, not the agreed project v24.22.3**. TypeScript was unavailable in the cloud environment. The dependency-free preliminary runner therefore executes narrowly delimited actual source slices through Node's built-in `stripTypeScriptTypes`, with the identical new harness/assertion body. It records the experimental API warning. This is explicitly distinct from the required test file's TypeScript AST extraction, complete existing project tests, a build, or a browser run. No dependency was installed to obtain these results.

`baseline-focused-receipt.json`, `candidate-focused-receipt.json`, their stdout/stderr logs, `focused-source-runner.mjs` and its header preserve exact commands and source/runtime scope. `patch-and-source-receipt.json` binds the candidate and patch to the application check.

## Independent review

The separate peer review found no blocking production defect or weakened assertion. It verified the race guards, scoped fallback, unchanged original recovery-test prefix and minimal record-tools bindings. Its Markdown SHA is `c63617aa3b448aec1d257cbae89e8abb6153e55628849b75d5adf9e13dc62c3f`; its JSON SHA is `9c1f418b470f884523858cac901ca817c1c6d9c4393113d345fe94d3850b3a0b`. Root separately reviewed the production diff and fragment and reported no further source defect.

## Remaining owner acceptance

Root will combine its non-overlapping deletion-copy patch, retain exact combined hashes, run the full existing recovery test on original source with the candidate assertions for a pinned red result, and run the combined candidate's required tests/type/lint/build under Node 24.22.3. Root will also repeat the actual 390×844 English/Arabic deletion → Clear flow and inspect focus, including an extant-invoker control case and protection of a newly focused control.

Those executions are not claimed passed here. Synthetic DOM ports do not establish native browser focus timing, screen-reader announcements or physical VoiceOver/TalkBack behavior. This handoff does not claim integration, native acceptance, store readiness or release readiness.
