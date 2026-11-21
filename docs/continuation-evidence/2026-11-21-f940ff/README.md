# Career Finder continuation — 21 November 2026

This continues candidate `a7fc83668413d20682ca28c1f7b18ba55e56b867` from [draft PR 3](https://github.com/swonyu/ahmad-career/pull/3). All earlier worktrees and commits are preserved. The current continuation owns the isolated source repairs and verification; native signing and store publication remain separate open work.

## Evidence and changes

The original [run 44708372749, attempt 2](https://github.com/swonyu/ahmad-career/actions/runs/44708372749/attempts/2) completed 14 of 17 native iPhone methods successfully, with three failures and no skips. The complete original artifact was downloaded and its recorded size and SHA-256 verified; `host-checks.json` retains the receipt. Earlier successful methods do not establish acceptance of this repair.

| Finding | Evidence | Repair and remaining acceptance |
| --- | --- | --- |
| Cold keyboard observation exceeded the deadline | First key snapshot completed at 9.389 seconds and current hittability at 24.945 seconds. Both were true but late. | Compose the keyboard-scoped key query without an intermediate keyboard element. Stop admitting further AX requests after the same deadline. Fresh key geometry, current hittability, real typing and five-second late-result rejection remain. Cold native replay is pending. |
| Discovery save did not activate | The recorded single tap hit the row center; the final hierarchy and recording still show the enabled Save opportunity button, without a saved confirmation or error. | Give the real button label a full-width, minimum-44-point rectangular hit area and the existing plain action style. Preserve the save/persistence method. Native save-to-Saved-to-Apply replay is pending. |
| Stage selection was not observed to complete | The menu remained open with Applied selected after the Saved for later tap. This was not established as merely a wrong label query. | Expose localized Stage and its selected value explicitly. Observe that exact value and menu closure within five seconds after the original one tap. Preserve all later keep/correction/cancel/relaunch assertions and capture the actual hierarchy on failure. Native replay is pending. |
| Retry-After was capped or ignored | The native HTTP client shortened numeric waits to one hour and did not parse HTTP dates. Removing the cap alone would overflow an unchecked nanosecond conversion for sufficiently long waits. | Use the production parser for full representable integer waits and HTTP dates; valid unrepresentable integers conservatively saturate at the supported year-9999 horizon instead of enabling immediate retry. Sleep in cancellable bounded chunks without changing the service deadline. Host production-parser, store and actual-view-task checks passed. |

The normal inspected discovery-service rate-limit path currently emits 1–60-second native-facing waits. Employer-provider cooldowns are enforced separately on the server. No live long-wait incident or employer-cooldown bypass is claimed.

## Verification completed

`host-checks.json` binds the exact changed files to observed results. `host-checks.log` preserves the synthetic standalone output. All standalone policy/store/recovery/compatibility/transport/fixture checks completed successfully. This includes 221 discovery assertions across 35 scenarios and 26 actual-view cooldown assertions across six scenarios. The revised XCTest source independently typechecked with zero diagnostic bytes.

Independent source reviews covered the three UI repairs, deadline preservation, the HTTP parser and cancellation. Review found an initial fail-open overflow case; that was corrected before applying or testing the patch. Source review is not native acceptance.

The existing test contract remains 17 methods, 219 assertion/failure lines, 72 prescribed PNG states, 30 AX attachments and 16 label-geometry pairs. Required interactions and captures remain. The workflow, runner and its 70-minute job, five-minute boot and 60-minute native-execution bounds are unchanged. No separate keyboard warm-up, repeated selection tap or late-result acceptance was introduced.

## Compile correction after the first integrated run

The first new-source run, `44892634124` at `94f1b96`, failed both iPhone builds because the new save-button styling referenced a file-private color alias. The host and XCTest-only checks above did not compile that SwiftUI product file. The correction uses the existing shared `NativeDesign.accent` value; all 14 app Swift files then passed both Release and Debug iPhone typechecks with zero diagnostic bytes. `compile-correction.json` preserves the failure, exact source hashes and corrective results. No native journeys passed on the failed build. A new full run remains required.

## Remaining gates

The complete current-source five-job CI run and native artifact inspection are pending at this checkpoint. Do not merge or deploy this candidate before those applicable gates pass. Live Google callback/recovery and supported-provider acceptance, requested advertising readiness, physical-device accessibility, distribution signing and store delivery remain open. The previous live Site version was 12; it was not changed or reverified by these source repairs.

Preserve actual platform navigation, English/Arabic behavior, the approved midnight navy/periwinkle theme, existing data and account boundaries, free-cost limits, and the exclusion of Good Spender. Tests use isolated synthetic data and must not contact employers, submit real applications or perform assessments/interviews.

## Technical sources

- [RFC 9110 Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3) and [HTTP-date formats](https://www.rfc-editor.org/rfc/rfc9110.html#section-5.6.7).
- [Apple firstMatch](https://developer.apple.com/documentation/xcuiautomation/xcuielementtypequeryprovider/firstmatch) and [isHittable](https://developer.apple.com/documentation/xcuiautomation/xcuielement/ishittable). The query change is a targeted experiment; these APIs do not guarantee removal of the observed cold-system delay.
