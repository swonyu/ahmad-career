# Submitted-search retry cooldown checkpoint

This branch starts at the exact finished search-lane commit `0beff68a6906968f282dca292dc547daad85684f`. It applies only the reviewed two-file patch: the existing Retry-After guard at the submitted-retry entry point, plus regression scenarios in the existing host DiscoveryCheck harness.

The source and logs are byte-bound to the root test run recorded in verification-receipt.json: unchanged production plus the extended harness failed the early-retry service-call assertion; the corrected production with the same harness passed 79 public discovery assertions across 19 scenarios. Packaging this checkpoint did not rerun compilation or tests.

The test used stubbed service responses and macOS Foundation/Combine. It does not establish installed iPhone, UI, physical-device, live-provider, Android, or full combined-source acceptance. The original search, recovery, accessibility, and publisher source trees were not edited by this checkpoint.

HANDOFF.md and final-preservation-receipt.json describe the original copied-source test event before this Git checkpoint. They are retained verbatim. This branch now contains the exact tested implementation and test hashes plus concise text evidence; no compiled binaries, module cache, or full source copy is included.

Integration remains with the publisher. Compare the submitted-retry entry point in the current combined source before integrating, preserve newer changes, and exercise the integrated behavior before advancing native or release gates.

## Evidence formatting

The exact unified patch ends with a single-space blank context marker. Whole-checkpoint whitespace inspection flags only that preserved artifact line 62. The two source files and every other document pass whitespace inspection; no rule was disabled and the patch remains byte-identical to SHA-256 a36265359b859d61f22dae2cde7c8d55b0e21dcb9148798efca470311e891a14.
