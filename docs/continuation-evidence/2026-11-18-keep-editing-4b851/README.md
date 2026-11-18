# Keep editing focus — pinned source checkpoint

Base: `578d99c8f225a72ca7cc0cf10ff474bb19aaaebc`. Root coordinator `4b851318da2d` owns these hosted hunks; publisher and dependency ownership is unchanged. Good Spender is excluded. No native build, dependency migration, signing or store action was performed.

## Problem and bounded change

Actual Chrome testing of 578d99c found that **Keep editing** removed the focused discard-confirmation control and left BODY focused while the editor remained open. The unsaved stage and note were preserved, but keyboard focus was lost.

The corrected handler remembers the confirmation opener and returns focus to it when it remains usable, otherwise to an eligible control in the same surviving editor form. It waits for the confirmation to be removed, preserves meaningful focus acquired meanwhile, and avoids closed/replaced forms, a reopened confirmation and disabled/hidden/inert content. It changes only dismissal of the confirmation; it does not close, save or discard the draft. The existing Modal/Clear focus helper is byte-identical to 578.

The extra queued-transition guards are robustness coverage. They are not additional live-browser failures.

## Actual pinned validation

Final gates ran **18 November 2026 05:19:18–05:20:11 UTC** using **Node 24.22.3 / npm 11.20.0**. Exact argv, timestamps and log hashes are in `pinned-gates-final/receipt.json`.

| Check | Actual outcome |
| --- | --- |
| Unchanged 578 source with the same final new assertions | 10 groups: 3 pass, 7 fail, exit 1 |
| Corrected existing recovery and record test files | 98/98 pass |
| Full required npm test chain | 321 main Node tests + 6 separate PDF Node tests pass, plus required script assertions |
| Typecheck / strict lint / build / diff-check | Exit 0 |
| Source/test stability through validation | All implementation and test hashes unchanged |
| Three generated verification reports | Only `observedAt` changed; all other fields equal |

The focused 98 overlap the main 321 and must not be added to them. The old source's first failure is the actual inline Keep handler leaving BODY instead of its invoker. A missing helper, extraction error or syntax failure is not counted as regression proof.

An earlier actual pinned run passed focused tests and typecheck but stopped at strict lint: the new test port aliased `this`. The correction checks the node itself and then traverses its parents, preserving traversal order and assertions without disabling the rule. The failed run is retained under `pinned-gates/`; the final rerun above is separate. Existing build warnings remain in raw logs; this is not a zero-warning claim.

## Exact source identities

- PhoneApp SHA-256: `57543cdbc0fbcb7a51cab725d65907e76af2a29ecf9f2022bffe6caaadc9da02`.
- Recovery test SHA-256: `be04a91f285aa9556e593af871e1b360e6e34ec2ce963d6528a63a32b0652206`.
- Full baseline patch SHA-256: `ec71d3e0550515acb9d26030eaa9d86451809a6607593ac17b04ee1275572821`.
- Final pinned receipt SHA-256: `47491eadee81995e7da36afeb0c7bd4d3b6b87047293a446495f1e146980b38c`.
- Components remain `c18753ee7c8b342831864cecc2694708f09fee6019a76c530b2c2ae743446424`; Arabic catalog remains `46ec9674ec1186d8bc3016c78739eda38542a7beca033a0f0617256b6cc154e9`.

Only PhoneApp and the existing recovery test file change as implementation/test source. No package, lockfile, workflow, native source or broad localization change is included. The whole existing 33,835-byte recovery-test prefix is preserved.

## Grok contribution and independent critique

The existing Build 1 session supplied the original proposal. Extracted patch and stdout matched its declared hashes. Independent review corrected two concrete test-oracle problems: tests tied to the new helper name could not demonstrate the baseline behavior, and a fallback mock incorrectly ignored a live textarea. Record and add flows, actual production handlers, same-form boundaries and meaningful baseline failures are now covered.

Original Grok output, original patch/stdout, final patch, review receipts and peer addendum are retained. Grok's reported 49-test run used older isolated dependency-source copies and is not counted as exact-current project acceptance. Preliminary cloud source-slice checks used Node 24.22.1 and are also separate from the actual pinned root gates above.

## Browser and release boundary at this checkpoint

**Corrected-source Keep editing browser acceptance is pending at this source checkpoint.** Root will build a source-bound fixture and exercise actual English/Arabic record and add forms before claiming that acceptance.

At parent 578, actual English/Arabic stage composition, conditional deletion copy, retained/removed-invoker focus, Clear recovery and reload reset were observed in a synthetic guest workspace. The pre-reset observation array was lost during a browser connection interruption; a transparent reconstructed report preserves observations without invented per-case timestamps. Original dialog screenshots remain available. Current JSON/CSV/ICS downloads are real fixture downloads and are undergoing separate exact-file consumer verification. No live OAuth/employer submission, calendar import, native handoff or physical assistive-technology pass is implied.

Latest owner/CI refresh at 05:02:28 UTC still showed the earlier a179 iPhone simulator run 44194197445 with 17/17 passing and four other jobs skipped. The newer native dirty recovery and accessibility work has no new combined acceptance. The publisher SSR candidate's ordinary lifecycle install, integrated audit/build/runtime gates, signing and store state remain unresolved. No release-readiness or universal competitor-superiority claim is made.
