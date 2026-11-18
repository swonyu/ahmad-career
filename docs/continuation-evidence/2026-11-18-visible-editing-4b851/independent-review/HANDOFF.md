# Keep editing: reveal the recovered focus target

## State and exact patch

This is a separate, cloud-only incremental proposal against root-designated pushed commit `cad85c495bc03853cc2258d093e79d8d1fb52ae3`. It changes only two Keep editing focus options and three focused test expectations. The prior frozen candidates remain untouched.

`keep-editing-visibility.patch`: **3,045 bytes**, SHA256 **`05488c32dab09136a62b1d20938ec2c7a1eae27c0cb2a91c44630a98406219ea`**.

| File | Base SHA256 | Candidate SHA256 |
| --- | --- | --- |
| `hosted/app/phone/PhoneApp.tsx` | `57543cdbc0fbcb7a51cab725d65907e76af2a29ecf9f2022bffe6caaadc9da02` | `e3454df4c4a4189475097d5bcc0ac2e2bf1fe53447d3046513c6eb780a9cd998` |
| `hosted/tests/phone-recovery-isolation.mjs` | `be04a91f285aa9556e593af871e1b360e6e34ec2ce963d6528a63a32b0652206` | `671f0cc26fa35a8df399a85332902b1226b537115fd7321a40c1a04c6ddc9c4b` |

Source bytes were copied from the previous frozen candidate only after verifying these exact baseline identities supplied by root. This child did not independently query the pushed commit. The unchanged components SHA256 is `c18753ee7c8b342831864cecc2694708f09fee6019a76c530b2c2ae743446424`; record-tools tests and Arabic messages also remain byte-identical.

## Newly reproduced browser finding

Root reported an actual English record-editor flow: change Stage to Interview and retain a synthetic private-note draft; Cancel; activate Keep editing with Enter. Focus correctly returns to Cancel and the draft survives, but Cancel is entirely below the visible scrollable dialog. Root's screenshot confirms it is not visible.

| Root-reported measurement | Value |
| --- | ---: |
| Focused target top / bottom | 832.1459 / 881.1459 |
| Dialog top / bottom | 16 / 828 |
| Dialog clientHeight / scrollHeight | 811 / 976 |
| Dialog scrollTop | 0 |
| Viewport height | 844 |
| overflowY | auto |

This is a newly observed visibility defect, separate from the earlier lost-focus bug. Root reported that the cad85 source had already passed 321 main tests, 6 PDF tests, typecheck, lint and build at 05:20:11 UTC. Those earlier checks do not resolve this browser finding. This child did not operate the browser or independently read those Mac receipts.

## Minimal correction and review

Both focus calls inside `keepEditing` now use `{ preventScroll: false }`. This permits the browser's native focus scrolling to reveal the preserved opener or surviving editor fallback inside the still-open dialog.

All existing connection, same-form, prompt, disabling, hidden/inert and no-steal guards are identical. The closed-modal/Saved Clear helper in components is unchanged. No CSS, draft, storage, dialog lifecycle, locale, package, native or build behavior is changed. There is no additional manual scrolling action or broader focus-management refactor.

The previous test explicitly required scroll suppression for the recovered opener. That expectation now requires scrolling to be allowed. Two added assertions cover the editor fallback and add-job form. Existing focus-target, draft, dirty-state, storage, dialog-boundary and no-steal assertions remain intact.

Independent peer review confirmed the exact patch identities and found no production defect or weakened check. Permitting native scrolling is supported by the measured clipped target. It does not by itself prove target visibility in every browser layout; root's actual retest remains necessary.

## Actual cloud validation

Fresh disposable cloud `git apply --check` and actual application both exited 0, and every resulting supplied file matched the candidate. The candidate test file passed `node --check`.

At approximately 05:33:06 UTC on 2026-11-18, the identical focused harness/assertions ran against actual source slices using **Node v24.22.1**, not the project's pinned v24.22.3:

| Source | Passed | Failed | Exit |
| --- | ---: | ---: | ---: |
| Unchanged cad85 source | 7 | 3 | 1 |
| Candidate | 10 | 0 | 0 |

The baseline's three failures are actual `preventScroll: true` calls versus the required false option, covering opener, fallback and add form. They are assertion failures rather than missing-binding or syntax failures. This runner uses bounded actual-source extraction and the identical 16,005-byte project harness/assertion body. The project test retains its existing TypeScript AST extraction. No replacement focus algorithm or simulated layout geometry was introduced.

**These results verify the focus API request, not browser visibility.** No pinned full project, browser, native, install or CI action was run by this child. The experimental type-stripping warning is preserved in stderr.

## Root acceptance

Root owns application, pinned project checks and actual browser retesting. Repeat the reported flow in English and Arabic and inspect focus plus geometry immediately after Enter/recovery, before any locator action or manual scroll can reveal the target. Check that the focused control is visibly within the dialog's usable bounds and that the draft survives. Do not require a fixed scrollTop; native alignment can vary. Exercise preserved-opener and editor-fallback paths while retaining the existing no-steal/closed-modal checks.

No release-readiness or physical assistive-technology claim is made by this artifact.
