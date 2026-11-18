# Native lane integration — 18 November 2026

Source checkpoint: `15d476b853c2bfdbec52538f03f68d59bfb3ffa5`.

The isolated branch includes the publisher source and its four copied, hash-bracketed dirty files, the completed search cooldown child, recovery checkpoint and all 34 accessibility commits. Six conflicting files were reconciled by behavior; generated localization came from the merged canonical catalog. Original owner checkouts were not edited.

## Verification

Fresh final discovery: **109 assertions / 26 scenarios**. Fresh final dedicated recovery runner: **179 / 56**. Other combined-source checks passed: lifecycle **508 / 77**, saved-search **21**, actual acceptance initializer **38**, Android Java policy **127**, Swift UI syntax parsing and localization consistency/contracts. Exact commands, logs, SHA-256 source bindings, merge parents and conflict dispositions are retained beside this note.

The initial discovery failure is preserved. Its older test expected a new English retry message, conflicting with the approved behavior that retains the original service error and separately localizes the deadline. The assertion was reconciled without removing request, deadline, query or result preservation checks; the final discovery run passes.

The new `apple/Checks/check-native-recovery.sh` runs the real preserved recovery suite and is called from the existing `check-mobile.sh`; no app target was changed.

## Scope limits

These are host checks. Xcode/Gradle app builds, Kotlin app compilation, full five-job CI, native UI/device/provider journeys, assistive technology and release/store acceptance remain pending. Root coordinates one native build owner after the final combined native/hosted source is ready.

The initial runner is an exact historical command record with paths for this workspace; its logs are evidence, not an invitation to rerun it on another checkout unchanged.
