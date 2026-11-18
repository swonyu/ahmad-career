# Keep editing focus: independent review and isolated correction

## Delivery state

Ready for root's pinned project validation and actual English/Arabic browser retest. This artifact is an isolated cloud proposal. It has not been applied to the Mac, committed, pushed, built, or run in a browser by this reviewer.

Base commit designated by root: `578d99c8f225a72ca7cc0cf10ff474bb19aaaebc`. Source authority is root's frozen five-file `combined-candidate` snapshot. Original Grok output and candidate are preserved separately.

**Apply this final baseline patch:** `keep-editing-corrected-from-578.patch`, 31,594 bytes, SHA256 `ec71d3e0550515acb9d26030eaa9d86451809a6607593ac17b04ee1275572821`.

**For root's already modified tree with recovery-test SHA `d0e4d77b...`, apply only** `keep-editing-test-lint-correction.patch`: 658 bytes, SHA256 `fb09267bbb6b6d673b4e8f16311d9f62972e5cbac64897a8614c514a4b93bd1f`. This is the minimal incremental test-only correction, not a second baseline patch.

The separate original-Grok-to-corrected review diff is `keep-editing-correction-to-grok.patch`, 25,773 bytes, SHA256 `b00bf23214c57e0b03a439e5bdc1ba632b449ee311a78fcd9b2755589521ca4f`. These are alternative patch bases, not two patches to apply sequentially to the same baseline.

## Exact changed-file identities

| File | Baseline SHA256 | Final candidate SHA256 | Candidate bytes |
| --- | --- | --- | ---: |
| `hosted/app/phone/PhoneApp.tsx` | `0ee2f855083ad5933dbbca1161372e8e6e3c8b393c1fd6033b2858c59dacfd94` | `57543cdbc0fbcb7a51cab725d65907e76af2a29ecf9f2022bffe6caaadc9da02` | 123170 |
| `hosted/tests/phone-recovery-isolation.mjs` | `11eb0b7ff330b1b9c40c7dee656ae4968f3e482aed7e8f94a01cf1530739749e` | `be04a91f285aa9556e593af871e1b360e6e34ec2ce963d6528a63a32b0652206` | 50136 |

Unchanged supplied files: components SHA256 `c18753ee7c8b342831864cecc2694708f09fee6019a76c530b2c2ae743446424`; record-tools tests `965af62fc693ed788bd487ea9f18aea8d2af2e54a4242d70331569d16632feb2`; Arabic messages `46ec9674ec1186d8bc3016c78739eda38542a7beca033a0f0617256b6cc154e9`.

The entire existing recovery-test prefix—33,835 bytes, SHA256 `11eb0b7ff330b1b9c40c7dee656ae4968f3e482aed7e8f94a01cf1530739749e`—is preserved byte for byte. No package, lock, workflow, build, native, or unrelated product file changed. Root's deletion-copy correction and the previous Modal/Clear focus helper are intact.

## Verified Grok proposal provenance

The extracted patch exactly matches Grok's claim: 23,540 bytes, SHA256 `988817caa669eb47e8f0e54e2838496e4460a83afd58bc148f9d2387daf4a0c8`. The extracted stdout exactly matches: 4,582 bytes, SHA256 `728b71d88ddfdb822f712c9a491b4105f00954880b8d5d3ec7d4d84131012cc0`.

Applying that original patch to a fresh cloud baseline produced the claimed PhoneApp SHA256 `8747bd433cab5758f091f8ec4ac5ce2185627af3a261b0da8b8181a5737778bd` and test SHA256 `e4c3809501146df23899e2ac037d260c8c31f14f25d93eb812d4fb9679f843aa`. The other supplied files remained identical. See `grok-extraction-and-apply-receipt.json`.

Grok reported 49 passing recovery-file tests using Node 24.22.3. Its own response says model/vault/safety came from older isolated f8 copies, and no typecheck, lint, full hosted chain, or browser acceptance ran. That log is authentic to the retrieved response; it does not establish full exact-578 acceptance.

## Review findings and correction

Root observed the actual browser defect: Keep editing removes its focused button and leaves BODY active while the editor dialog stays open. Grok's ordinary record and add recovery paths are coherent and pass the independent focused assertions. It preserves another live focused control and keeps the existing closed-modal recovery unchanged.

Two concrete test problems required correction:

1. Grok's harness required the new `keepEditing` declaration, required the JSX handler to have that name, and required one animation frame. The unmodified baseline has an inline handler and no queued frame. Those structural failures cannot demonstrate the observed focus loss. The final tests execute the actual JSX handler in either source version and permit an empty baseline frame queue; their first baseline failure is BODY instead of the preserved invoker.
2. Grok's selector mock always returned Stage. Its no-target case removed Stage while leaving the notes textarea live, then expected BODY. The real selector would return the textarea. The final ports model field order and inherited connection state, explicitly assert the textarea fallback, and remove every matching field for the genuine no-target case.

The final source retains Grok's captured-opener approach. The additional production change is limited to the Keep handler: capture the existing form before dismissal; require that same connected form and open dialog after removal; refuse recovery while the old Keep control remains connected or a new discard heading is present; respect hidden/inert ancestry and effective disabled state; and choose the first eligible field inside the captured form.

These extra guards cover bounded queued-action transitions. **No additional live browser escape into hidden private fields was demonstrated.** Native focus normally refuses disabled/hidden controls, and Grok's existing live-focus check already protects a focused account recheck control. Same-form, reopened-confirmation, and eligibility cases are robustness evidence, not newly observed browser failures.

The correction does not change draft values, dirty state, record/recovery ownership, storage, or dialog identity. It never calls the page-heading recovery helper. A late connected focus target retains focus.

## Actual local validation

Cloud runtime was **Node v24.22.1**, not the pinned v24.22.3. No package installation was performed. A dependency-free preliminary runner executes narrowly bounded actual PhoneApp source slices with Node's type stripper and the exact same added harness/assertion body used by the project tests. It does not replace the recovery algorithm. The project test itself continues to use the existing TypeScript AST extraction machinery.

Final actual runs on 2026-11-18 at approximately 05:17:52 UTC:

| Source under identical new focused assertions | Passed | Failed | Exit |
| --- | ---: | ---: | ---: |
| Unchanged 578 baseline | 3 | 7 | 1 |
| Original Grok candidate | 6 | 4 | 1 |
| Corrected candidate | 10 | 0 | 0 |

The baseline's first failure explicitly says the removed Keep control must not leave focus on BODY. All failures are assertions; no missing-helper, ReferenceError, TypeError, or SyntaxError is counted as regression evidence. Grok passes ordinary record/add and meaningful existing-control/fallback behavior. Its four failing groups exercise the added form/prompt/eligibility protections.

The ten groups cover record and add paths, dirty Delete, field order/no-target behavior, draft preservation, late focus and redirects, dialog/form boundaries, repeated confirmation, inherited fieldset disabling, identity-hidden/inert content, eligible fallback, document-root/lost focus, and the actual discard entry handlers. Controlled DOM and frame delivery remain simulations; they do not certify browser timing or physical assistive-technology behavior.

The final test file passed `node --check`. Both final patches passed `git apply --check` and actual `git apply` in fresh disposable cloud copies; every resulting supplied file matched the final candidate. See `corrected-patch-and-source-receipt.json` and the three `*.focused.receipt.json` files. The experimental type-stripping warning remains preserved in stderr logs.

Independent peer review found no production defect in the corrected handler. A test-only peer finding corrected the reopened-prompt fixture to set confirmation true and assert that the older deferred Keep action preserves it. Final source/test identities above include that correction. Earlier preliminary patches, assertions, and logs remain under `review-v1/`; the fully reviewed pre-lint snapshot is preserved under `review-v2/`. Both are superseded for final source acceptance.

## Root-reported pinned gate and the test-only lint correction

Root subsequently reported a meaningful pinned baseline red (3 passed / 7 failed), successful application, 98/98 focused tests, and passing typecheck on the pre-lint-correction candidate. Strict lint then failed only `@typescript-eslint/no-this-alias` for the fake DOM traversal starting with `let node = this`. These results came from root's message; this reviewer did not independently read the Mac receipt and does not replace root's exact gate report.

The final correction checks `this` against the unchanged selector predicate first, then traverses from `this.parent`. It changes no production bytes, no assertion, and no lint configuration. The preceding final snapshot and peer review were copied intact into `review-v2/`. The incremental patch passed apply-check and actual application against that exact prior snapshot, with all resulting files matching the final candidate. The final cloud focused checks were rerun after this change and retain the table above. Root owns the actual strict-lint and remaining project gate rerun; the previously failed receipt is retained.

The final independent addendum, `peer-lint-correction-addendum.md` (SHA256 `cd977f72e149787585df8701473da629c3806e4060c5c5132dc6021e8ee19160`), confirms identical self-first/ancestor traversal semantics and no weakened assertion. This is a source-equivalence review, not a new lint or execution pass.

## Remaining acceptance owned by root

1. Reconfirm the actual target source/ownership and apply the final patch to the intended isolated pinned baseline.
2. Run the full existing recovery test file with final assertions on unchanged 578 for a meaningful pinned red, then the corrected file against the exact current project modules using Node 24.22.3.
3. Run the required project gates after integration, preserving existing work and owner/build coordination.
4. Repeat actual English/Arabic record Stage/note edits → Cancel/Close/dirty Delete → Keep editing, plus the add-job form. Verify the same dialog stays open, draft values survive, and focus reaches an appropriate live control. Include another live focus target and the identity-check interaction where feasible.

No full hosted/native/CI/release readiness claim is made by this artifact.
