# Record action layout and export focus checkpoint

## Status and current authority

This checkpoint seals the hosted record-action layout and export-focus fixes on `continuation/feed-reliability-20261117-4b851`, based on `ac6a0b8651c8f5348f7976ee8a84d8a10890a082`. The exact product/test bytes passed the recorded hosted gates and actual synthetic browser checks below. This is an integration checkpoint, not a deployment, native device pass, store submission or release.

The user subsequently authorized: “can u merge everything and keep the 3 grok browser sessions working to make release faster thanks”. Root now coordinates integration in isolated branches and schedules one full combined build/CI owner. This supersedes historical wording reserving all integration solely to the publisher. Preserve original branches/worktrees and dirty publisher files; retain the three existing Grok browser sessions and completed terminal outputs. No reset, competing full build or restart of stopped terminal lanes is implied. The recorded cutoff remains 19 November 2026 01:26:12 Riyadh. See [the authorization record](integration/merge-authorization-update.txt). Career Finder remains the worldwide Arabic/English five-tab product; Good Spender is excluded and free dependencies/services remain the current boundary.

## Product changes and exact source

- Group record export/delete actions in `.phone-record-actions`, with wrapping and a 10 px gap; retain existing action availability and record semantics.
- Restore lost focus to the same record export button after the existing busy/fieldset/download cycle. Captured epoch, editor ID, dialog and form must still match, and the target must remain connected, enabled and available. Account confirmation, newer work, discard prompts and intentional focus take precedence.
- Extend the existing recovery isolation harness for successful/failed downloads, exported draft preservation, focus redirection, stale account/editor callbacks, unavailable controls and pending identity checks.
- The three generated verification reports change only `observedAt`. No dependency, native, provider, signing or deployment change is included.

| File | SHA-256 |
|---|---|
| `hosted/app/phone/PhoneApp.tsx` | `fb4b548459f38b42848df3c29ffef9b07d2448b49833a69bcaa04f02c4075ee4` |
| `hosted/app/phone/phone.css` | `97f4611f8eb9c8a6ab845b600771210f3a6ae56eae83f6f4434eefc81438481a` |
| `hosted/tests/phone-recovery-isolation.mjs` | `e66f9e302499772bdb7e1e1b0793da64f5b809c59f5c7706ba01c62f38eb1229` |

The [gate receipt](gates/receipt.json) binds all 249 tracked hosted files. Packaging independently matched every current file to its after-hash and verified all eight gate log hashes. Only generated report timestamps changed during the gates.

## Recorded verification

| Evidence | Result | Boundary |
|---|---|---|
| Typecheck, lint, build | All exit 0 | Hosted source above; warnings retained in `gates/build.stderr.log` |
| Main test run | 326/326; no failures/skips | Existing host harnesses and synthetic boundaries |
| Separate PDF stage in npm test | 6/6 | Not additional browser/device checks |
| Export-focus regression | Baseline 57/60; candidate 60/60 | These 60 overlap the main suite and must not be added to 326 |
| Real browser export | Direct click and Enter, English 390 px and Arabic 320 px, retain visible export focus and dirty fields | Actual PhoneApp/React/CSS on the owned loopback fixture; synthetic guest data |
| Six downloaded JSON files | Exact bytes, original/draft data verified | Existing record, new-record export-only and saved date cases |
| Enlarged action text | Measured 27.2 px; Arabic 390/320 and English 320 checks | Fixture-only action text; no browser zoom, native large-text or general resize-text conformance claim |

Pinned Node v24.22.3/npm 11.20.0. Final gates ran 18 November 2026, 06:36:57–06:37:49 UTC. The build succeeded with Vinext/Vite configuration, sourcemap and chunk warnings preserved in stderr. No new tests or builds were run while sealing this checkpoint.

### Baseline failure and reproducibility

The initial direct browser export downloaded correct JSON and retained the dirty record, but left BODY focused with the modal open and enabled. The focused harness executes actual handler, `run`, `exportUnfinished` and `unfinished` code with controlled DOM/download boundaries. Identical assertions fail three focus checks on the baseline and pass all 60 on the candidate. An initial harness omitted the production `z` export on the error path; final baseline/candidate copies received the identical correction. This was a harness issue. See [the regression receipt](regression/verification-receipt.json).

The baseline is `ac6a0b8` plus the action-wrapper change, before export-focus restoration. Its PhoneApp hash is `0deaf9a6a9423ba5753cef6e0e2acfc670a161c423bd0a6d2db105803d7fc1b0`. Exact source is retained as `regression/baseline-PhoneApp.tsx.txt`. For later reproduction, use a disposable checkout of this checkpoint, run the existing focused test with candidate PhoneApp, substitute only that baseline PhoneApp, then run the same test. Do not replace source in an active owned checkout. Raw patch artifacts and copied baseline/build trees are omitted; Git changes and the single baseline source preserve the comparison without patch-context whitespace noise.

### Browser preservation and tool boundaries

[Raw final observations](browser/final-observations.json) retain original tool text and distinguish earlier source observations. The six [downloads and receipt](browser/downloads/receipt.json) bind exact JSON bytes and unchanged saved originals. The saved 2 December 2026 follow-up date remains in the original and exported draft. Discard/reopen preserves the original record and the 22-item Saved corpus. Final cleanup reports 22 Saved cards and zero open dialogs.

The read-only browser adapter did not expose `document.hasFocus()`; unavailability is not a false result. Actual focus acceptance uses focused elements/rectangles, while host tests exercise the guard. A date-fill tool attempt was partial and is not counted as date-entry acceptance; saved-date preservation is established separately by JSON/UI observations. META+plus changed no measured values and is not zoom evidence. Screenshot files originally labeled `.png.b64` actually decode to JPEG/JFIF; the exact bytes are retained with correct `.jpg` extensions, without re-encoding.

### Enlarged action text

The first 200% selection rendered the enabled class but left action text at 13.6 px because product `.text-button { font-size: .85rem !important; }` outranked the initial fixture declaration. This remains a failure to activate the fixture, with neither a product failure nor a 200% pass claimed. The corrected fixture-only rule adds `!important` to `font-size:1.7rem` under the same fixture/action selector. Product CSS is unchanged by this correction.

Corrected computed text is 27.2 px. At Arabic 390 px, the longest action is approximately 302.604 px wide inside a 316.667 px wrapper. At Arabic 320 px both labels wrap within a 254.667 px wrapper; each action is 107.75 px high, the gap is 10 px, and no horizontal overflow is observed. English 320 px has the same bounded wrapping/height result. Keep-editing and action focus remain visible. See [text-stress observations](browser/action-text-stress-observations.json) and [Arabic screenshot](browser/screenshots/career_finder_ar_actions_text200_320.jpg).

`fixture/` contains corrected fixture source/build receipts. Its control updates state/class without remounting PhoneApp; origin, ownership, seed lock and edited-form guards remain intact. Absolute source paths/pin checks describe the original Mac workspace and require deliberate review before reproduction elsewhere. Compiled JS bundles, dependencies and module caches are excluded.

## Preserved lanes and integration limits

| Lane | Preserved tip | Boundary |
|---|---|---|
| Native search/localized cooldown | `9531a4be09c459e15573667c67b695dc6040874d` | Includes original `0beff68a6906968f282dca292dc547daad85684f` and retry `ffc038cd2bfcbc6006dfc23dee87e34ee55a7a00`; host evidence is not device acceptance |
| Native recovery | `53c7341d8e0d28137089522a2ffc542e4d780299` | Finished-lane preservation; historical 179 Swift host assertions/56 scenarios remain separate from Android/combined native gates |
| Account/search accessibility | `b37fe51fa2e03868efb0ad3c830be5801defe913` | Existing branch pushed unchanged; 34 ordered commits relative to `243031d3f35040985c5b274e8ddf4a90adb0eda8` |

Push receipts are in `integration/`. The [historical native handoff](integration/historical-combined-native-handoff.txt) preserves earlier observations and ownership wording for provenance; newer user authorization above governs current integration. Root/assigned agents coordinate these lanes and isolated SSR/dependency work. This hosted checkpoint does not claim those changes are already integrated.

Latest observed CI [44194197445](https://github.com/swonyu/ahmad-career/actions/runs/44194197445) is the older focused iPhone run at `a17999ce9f24d1e8c94a38c03dcda68101db4507`: 17/17 UI checks, four other jobs skipped. It is not a full combined pass. Earlier combined run [44185640786](https://github.com/swonyu/ahmad-career/actions/runs/44185640786), at `2884188263f3dad5753da7b2e507f6ba55e30eb0`, failed. Captured CI does not establish acceptance for this checkpoint or later integrated source. Dependency/audit acceptance, exact combined source/native builds, signing/store and release gates remain with the coordinated integration owner.

Grok reviews are advisory; source/receipts determine acceptance. No live-provider, assistive-technology speech, native/device, worldwide-provider, deployment or store readiness is inferred.

## Integrity

`manifest.json` records curated paths, sizes and SHA-256 values. `seal-preflight.json` records 249-file matching, gate-log binding and PR1 ancestry. Commit/push receipts are saved outside this commit to avoid self-reference. Historical receipts/HANDOFF files retain their original time-bound statements; this README supplies the final checkpoint context.

The full staged whitespace check reports only preserved raw-log formatting (trailing spaces and terminal blank lines). Those exact bytes remain bound to their original gate/regression hashes. All other staged files, including product code, pass the scoped whitespace check. See `artifact-whitespace-diagnostic.json`; no whitespace rule was disabled.
