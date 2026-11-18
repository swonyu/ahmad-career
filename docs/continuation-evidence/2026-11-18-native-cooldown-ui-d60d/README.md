# Native retry cooldown UI correction

Base: `0991272b57387effb81af231ac22e4e0f739e809`.
Branch: `integration/native-cooldown-ui-20261118-d60d`.
This isolated child addresses independent review findings ENGINEERING-2 and UX-1 only.

## Changes

- Refresh the displayed search clock whenever the retry-deadline task starts, including an already expired deadline or a zero-second response. Calculate its remaining interval from the same timestamp used by the control predicate, so expiry between two clock reads cannot strand a disabled button.
- Apply the shared deadline predicate to Search again and both Retry this search controls. Keep the model guard, original failure, localized deadline, captured-query action, future wait and task cancellation behavior.
- Add DEBUG-only offline zero-second and ten-second structured rate-limit fixtures. Extend existing `testSearchEmptyAndFailurePreservesPreviousResults` to observe blocked controls, expiry and successful recovery. The suite still has 17 test journeys; its workflow count remains accurate.
- Wire `check-discovery-cooldown.py` into the existing mobile host gate. It extracts and executes the actual Foundation-only view task and all three actual button predicates in a Swift harness. No application target was changed.

## Bounded evidence

The same host assertions run against the base and candidate source. The base fails six assertions: Search again remains disabled for zero/expired deadlines; both exact-retry paths are enabled during future/cancelled waits. The candidate passes all 21 assertions in five scenarios (zero deadline; future wait and expiry; cancellation; task restart after expiry; cleared deadline).

`baseline.log` and `candidate-final.log` bind each run to the exact UI source and gate SHA-256. The matching generated Swift files contain the executed task/predicates. The receipt JSON files contain exact commands and exit codes. `source-sha256-final.json` binds every changed source/check plus both protected files.

Additional qualification: the actual DEBUG fixture source compiles; the existing 38 acceptance-initializer preservation assertions pass; iOS view/test source parsing and shell syntax pass. Those 38 assertions cover initializer preservation, not the newly added rate-limit UI interactions. `qualification-receipts.json` records the exact compiler commands.

## Ownership and remaining gates

`CareerDiscovery.swift` and `DiscoveryCheck.swift` are byte-identical to the base. Root separately owns the corrupt-read query-state correction and the combined integration. The original publisher worktree and published native checkpoint were not changed.

The host harness verifies clock/predicate execution, not SwiftUI rendering, accessibility traversal or task scheduling on a device. The added native UI scenarios have not run here. No Xcode build, Gradle build, simulator/device run, full mobile gate or CI run was launched by this lane. Root will merge the child into the combined tree and run the single coordinated native pipeline before claiming those gates.
