# Simulator boot verification fixtures

These files test the boot-evidence parser offline. They do not establish that a current runner, native journey, or release has passed.

## Retained failure

`ci-44294650087-failed.log.gz` is a lossless gzip encoding of the exact bytes of `career-iphone-boot.log` from Career Finder CI run 44294650087, artifact 14424058569, candidate `7b3f7761d69d5651db08e1ec67289367fb20ff20`.

The artifact SHA-256 is `cad20b94e331d1a990d1515edf164a4b9c7e1a08858658af349f86562eac892b`. The decompressed log's SHA-256 is `afdab1f19178b58ebc24811266f01a08d83fc3719d893f4907b19f78521835a2`.

The compressed fixture preserves the original final blank line without a Git whitespace exception. Its SHA-256 is `034fa613a2dbd01aab9cbdc0799cf5e9522e502a2b8396a69177bf0301881dd0`; gzip metadata uses a fixed zero timestamp.

The GitHub step reported success, but the retained log ended with terminal status 3 and Data Migration Failed. The selected UUID matches the xcodebuild destination and xcresult device. This proves a readiness-verification gap; it does not prove the cause of the three subsequent UI failures.

## Recorded Finished format

`finished.log` contains the device-identification line and final two-line success record from the Flutter project's own captured simctl output in [flutter/flutter issue 64018](https://github.com/flutter/flutter/issues/64018), reported on August 18, 2020. Logger prefixes and intervening progress lines were omitted. The status and Finished text are unchanged.

The fixture SHA-256 is `cc29d5b244ae4cba931b13c257fea95f3a177e702704e061639a533c01b9393a`. Its historical origin verifies a known output format; it is not proof about the current Xcode runner. Device-inventory objects constructed in the tests are explicitly synthetic parser inputs.

## Gate contract

The gate requires successful boot, log-capture and inventory commands; one exact monitored UUID; one final terminal Finished result; and one matching available Booted inventory entry. Any failed or unknown status, contradictory output, missing proof, or invalid inventory fails the step. An already-booted shortcut alone is insufficient evidence for this gate. A new CLI output format requires review instead of implicit acceptance.

The workflow captures all command exit statuses and retains the raw boot log, device inventory, inventory error output and hashed verification receipt. It does not retry, erase or select another simulator, change test scope, or extend any native test or job timeout.

Run the offline checks with:

```sh
python3 apple/Checks/test-simulator-boot.py
```
