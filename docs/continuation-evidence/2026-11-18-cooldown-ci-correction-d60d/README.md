# Correct the cooldown acceptance observation window

Base: `d8d2e999d0348eb07942472a1d9e87d2fc4498a2`.
Branch: `integration/native-cooldown-acceptance-20261118-d60d`.
Scope: the rate-limit mapping in the DEBUG discovery fixture and the cooldown portion of existing UI journey 08.

## Actual failure and diagnosis

Full CI run 44262971576 failed journey `testSearchEmptyAndFailurePreservesPreviousResults` at its line 729 assertion that Search again remained disabled. Its pinned UI test source is byte-identical to this branch's base (SHA-256 `e83b063b5f36a213fa2bb2a95e6f085728ce186968635321715175646044d0ff`).

The log records the search input event at test time 243.14 seconds, the first error query at 245.51, and the disabled-state query at 262.27. The control was queried **19.13 seconds after the input event**, and 16.76 seconds after the first error query, against a **10-second fixture**. Error reveal, a swipe, repeated accessibility resolution and existence waits consumed the observation window. This failure does not establish early product re-enablement. The zero-deadline subcase precedes this future-deadline assertion in the same non-continuing test.

`ci-timing-evidence.json` binds the exact log lines, timestamps and source hash. `ci-timing-excerpt.log` preserves the relevant original output.

## Correction

The test now observes both controls before slow error-text traversal, records the duration of its search helper and control lookup, and uses a 30-second future fixture with a bounded 35-second release wait. It still requires all of the following:

- The zero-second deadline releases both retry actions.
- A future deadline visibly disables Search again and exact Retry this search.
- Both controls become enabled when the actual deadline elapses.
- The original service failure remains present until retry.
- An enabled action actually recovers the matching submitted query result. The future case still taps exact Retry this search.

No assertion is skipped. No test is removed; there are still 17 journeys. The product clock, request model, shared UI helpers and unrelated native source remain byte-identical to the base.

## Bounded qualification

The existing host gate executes the actual view task and all three control predicates: **21 assertions / 5 scenarios pass**.

An additional captured-timing replay compiles the actual DEBUG fixture with the actual extracted view task/predicates, derives each future mode from that version's actual UI test, and time-translates its returned deadline by the recorded 19.13-second interval. The old 10-second configuration produces **3 failed active-state assertions**. The 30-second configuration passes **14 assertions / 2 scenarios**, including exact one-shot service recovery. This is a host timing replay, not an XCUITest or simulator result. Generated source, exact compile/run commands, logs and source SHA-256 bindings are retained beside this README.

The modified iOS UI test source parses and `git diff --check` passes. No Xcode build, Gradle build, simulator/device run, full native suite or CI rerun was started by this lane. The corrected native journey remains pending the coordinator's rerun; these bounded checks are not a native UI pass.
