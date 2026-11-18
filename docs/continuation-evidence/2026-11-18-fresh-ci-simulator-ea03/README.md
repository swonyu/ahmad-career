# Fresh CI iPhone simulator selection

Date: 2026-11-18. Based on `61134b3cbe31e2f1d541fa5529eabb7ff6a4adce`.

## Observed problem and scope

The existing `phone-quality.yml` selects a device UUID directly from `xcrun simctl list devices available --json`. It does not create a device. CI run `44294650087`, iPhone job `134768385899`, logged `Selected iPhone Air on iOS 26.5 architecture arm64` and then booted pre-existing UUID `D26ED71E-9D97-4E79-B376-C104ABB9517A`. The retained boot artifact ends with terminal status 3 and `Data Migration Failed`. The compressed exact log remains in `apple/Checks/Fixtures/SimulatorBoot/ci-44294650087-failed.log.gz`; decompressed SHA-256 is `afdab1f19178b58ebc24811266f01a08d83fc3719d893f4907b19f78521835a2`.

This establishes failed readiness on an existing runner device. It does not establish that inherited per-device data caused the failure, or that the failure caused the Safari-return problem.

## Change

The workflow retains its existing newest-iOS/compact-iPhone ranking and obtains the selected device's explicit `deviceTypeIdentifier` and runtime ID. It creates one new simulator named with the CI run and attempt IDs, using precisely that type/runtime. It rejects failed creation, malformed or pre-existing UUIDs, and any created inventory entry that differs in type/runtime/name, is unavailable, or is not initially Shutdown. There is no fallback to an existing device and no restart, erase, retry or global simulator operation.

Only after those checks does it publish the newly created UUID through `GITHUB_ENV`. `career-iphone-selection.json` records source and fresh device metadata, architecture, checkout SHA, run ID and attempt; it is retained with the other UI artifacts. Existing human-readable selection metadata remains in job output.

The strict boot-evidence parser, its verification receipt, the 3-minute boot step, the 45-minute UI step, the 50-minute job budget, full/partial test selectors and all 17 UI test methods are unchanged. A fresh device must still pass the exact terminal Finished boot gate before UI tests can run.

## API/schema checks and executed validation

Read-only commands on the connected Mac confirmed the real CLI contract and inventory schema:

- `xcrun simctl help create`: `simctl create <name> <device type id> [<runtime id>]`; specifying the runtime avoids implicit newest-compatible-runtime selection.
- `xcrun simctl list devices available --json`: devices grouped by runtime ID include `udid`, `name`, `deviceTypeIdentifier`, `isAvailable` and `state`.

No local simulator was created or booted. Seven offline regression methods execute the actual workflow Python block with mocked simctl responses, covering the successful selection/metadata path, both supported CPU architectures, creation failure, bad or stale UUIDs, unavailable/mismatched/already-Booted created devices, missing device type and no eligible iPhone. All seven passed. The existing eleven boot-parser methods passed, including the actual migration failure fixture. `actionlint .github/workflows/phone-quality.yml` and `git diff --check` passed. Direct source comparison also confirmed that the boot/UI execution block and all 17 test methods remain unchanged from the base.

## Expected impact and remaining uncertainty

This removes inherited per-device state from the next hosted CI attempt while keeping the selected OS and hardware class stable. A fresh simulator may still encounter a runtime, runner image or first-boot migration defect; the unchanged readiness gate must reject it. Native execution of this patch has not yet occurred. The full exact-candidate CI run is required to assess readiness and the existing Safari-return failure. This change makes no claim that Safari is repaired.
