# Native profile lists: Arabic and ASCII commas

Date: 2026-11-18. Base: `ead12355246f1889f53f3d7bc3ff71cd42da4d92`.
Branch: `fix/native-profile-lists-20261118-ea03`.

## Reproduced defect

The native profile fields say that skills, target roles and target countries are comma-separated. Their parsers accepted ASCII comma U+002C only, although Arabic keyboards normally use U+060C. For example, `محاسب، محلل بيانات` became one target role and one search shortcut; `sa، US, AE` was rejected by Android's country validation.

Before the production fix, added host regressions failed against the base source:

- Android actual `ProfileContract.listError`: `AssertionError: Arabic and ASCII commas separate recognized target countries` in `BoundaryPolicyCheck.main` (the initial regression at line 45). This output was observed from `android/checks/run-policy-checks.sh` before implementation.
- iPhone actual `PhoneApplicationProfile.payload()`: `Precondition failed: Mixed comma skills preserve order and existing duplicate semantics`. The captured output is in `ios-regression-before.log` (host executable exited 133).

## Repair and preserved behavior

Android `ProfileContract.listItems` is now the shared splitter for list validation and Kotlin `String.parts()`. It accepts either comma, trims Unicode whitespace at item edges, skips empty items and retains item order. `parts()` continues applying its existing distinct-item policy, feeding API/private serialization and profile search shortcuts. `ProfileDraft.privateJson()` still keeps the original raw strings in its draft fields. Validation still allows at most 30 distinct entries, checks 100-character item limits and requires recognized target countries.

iPhone `MobileApplicationPolicy.profileListItems` now feeds profile payloads, the portable backup wire format and `PhoneApplicationProfile.targetRoleShortcuts`. Payloads/backups keep existing duplicates and order; shortcuts keep their existing first-occurrence deduplication. Codable private drafts keep their original spelling. Portable backup import still allows at most 30 entries and 1,000 UTF-16 units per entry. No list is silently truncated, and no existing validation threshold changed. Server validation remains responsible for its existing service-facing limits.

Regressions cover mixed Arabic/ASCII delimiters, Arabic labels, Unicode edge whitespace, empty entries, exact duplicate behavior, country normalization, actual profile payloads, raw-draft roundtrip, shortcut values, portable JSON export/import, and the existing count/length boundaries.

## Executed verification

`android/checks/run-policy-checks.sh` ran with the installed OpenJDK 17, without a device or network: **137 checks passed**, exit 0. Its exact output is in `android-policy-after.log`.

`bash apple/Checks/check-mobile.sh` ran on the Mac host with the script's isolated temporary directory and module cache: **exit 0**. Its exact output is in `ios-host-after.log`, including:

- 126 native application boundary checks.
- 518 application lifecycle assertions across 78 scenarios.
- 201 native recovery assertions across 61 scenarios.
- 167 public discovery assertions across 32 scenarios.
- 21 discovery cooldown assertions and 21 saved-search cases.
- Native store, backup, next-action, merge compatibility and transport checks.
- 38 actual acceptance-initializer preservation assertions.

`git diff --check` passed. The harmless CoreGraphics diagnostic occurs while the existing synthetic PDF cases run; it is also present in the before log.

## Scope and pending acceptance

This change contains no Safari lifecycle/assertion changes, palette changes, navigation changes or hosted-web changes. No simulator, emulator, Gradle build or Xcode UI build ran in this lane. The Android Kotlin call site and iPhone view binding were reviewed, while the executed tests cover the actual shared Java/Swift behavior. Full app compilation and native UI acceptance must run on the exact integrated candidate. The previously reported iPhone Safari-return failure is still a separate unresolved runtime finding; these host results do not establish its resolution or release readiness.
