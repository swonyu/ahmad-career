# Scope the post-boot inventory to the owned iPhone

Base: `d24b659a8bd1bcb11490dde4c717c1a2e3825cb7`. Date: 18 November 2026.

## Exact observed failure

[Run 44326554344](https://github.com/swonyu/ahmad-career/actions/runs/44326554344), iPhone job `134879291229`, tested source `dd78b0f7b259ad7394694aa24a264727dc746402`. It used the standard `macos-26` label, observed image `macos-26-arm64/20261112.0504.1`, macOS 26.7.2, and a fresh iPhone 17 Pro on iOS 26.5.

Contrary to an initial summary, the retained log contains terminal status **4294967295 / Finished**, at 14:41:38 UTC, elapsed 1 minute 45 seconds. It does not contain a terminal migration failure. The full readiness step nevertheless timed out after its three-minute limit and did not produce a verifier receipt or run the native suite. This failed job remains failed.

The retained artifact `14436583398` has SHA-256 `502bc63eb0fa90e1c974d48b1bc036a4f6709a5386b08598e568732e8dc849c1`. Its file timestamps show the inventory command's error-output file created at 14:41:40, the 61-device / 33,533-byte inventory completed at 14:43:00, and the job timed out at 14:43:01. These observations implicate broad inventory enumeration after successful boot. They do not prove a process exit status or a passed readiness gate.

## Minimal repair

Change the post-boot read from `simctl list devices --json` to `simctl list devices "$CAREER_UI_DEVICE" --json`. Apple's installed `simctl help list` documents a case-insensitive description filter. A read-only query against an existing local UUID returned exactly that UUID with the required runtime, availability and state fields; it did not create, boot, modify or shut down a simulator.

The existing verifier still requires exactly one matching UUID, available and Booted state, a terminal Finished log for that same UUID, and successful boot/log/inventory command exits. Missing or duplicate entries still fail. Added stage messages identify whether the boot command or inventory capture is consuming time on the next hosted attempt.

The current runner, runtime/model selection, fresh creation, minimum iOS 17 for UI tests, parser, all 17 native methods and the 3-minute boot / 45-minute UI / 50-minute job limits remain unchanged. There is no retry, erase, global shutdown, fallback acceptance or larger paid runner.

## Verification and remaining gate

The 12 selection-fixture methods and 11 strict-parser methods pass, as do `actionlint` and `git diff --check`. The strict verifier and UI test source are byte-identical to the base. A parser-only check using the retained Finished log and a filtered inventory accepts synthetic zero process exits and rejects nonzero or absent process evidence. Those injected values are test fixtures, not recovered CI exit results.

`verification.json` binds the source, artifact hashes, timestamps and these limited checks. Raw downloaded evidence is retained at `/tmp/career-finder-ci-boot-20698-44326554344`.

The exact integrated candidate still requires a new hosted run to demonstrate that this narrower inventory finishes within the unchanged deadline and that all native journeys pass. No local native build/boot or CI dispatch was performed by this repair lane.

## Primary evidence

- [Exact failed iPhone job](https://github.com/swonyu/ahmad-career/actions/runs/44326554344/job/134879291229).
- [Exact retained iPhone artifact](https://github.com/swonyu/ahmad-career/actions/runs/44326554344/artifacts/14436583398).
- [Observed GitHub runner image inventory](https://github.com/actions/runner-images/blob/macos-26-arm64/20261112.0504/images/macos/macos-26-arm64-Readme.md).
- Installed Apple command documentation: `xcrun simctl help list`. The documented filter was confirmed by a read-only query; no alternative OS image is needed to address the observed inventory bottleneck.
