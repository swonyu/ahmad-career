# Native profile labels and keyboard readiness

Base: `d8d2e999d0348eb07942472a1d9e87d2fc4498a2`.
Branch: `fix/native-fields-20261118-d60d`.

## Actual failure evidence

Full CI [44262971576, iPhone job 134660556103](https://github.com/swonyu/ahmad-career/actions/runs/44262971576/job/134660556103) ran all 17 UI journeys on **iPhone Air, iOS 26.5, arm64**, with 11 passes, 6 failures and no skips. This change addresses only the three profile-field/keyboard failures. The other failures have separate owners.

The English restored-profile and Arabic large-text journeys found the correct separate visible name label, but the native `application.firstName` text field had an empty accessible name. The two persistent-label VStacks use their TextField titles as placeholders and had no explicit accessibility label. Both first-name and email now explicitly expose the existing localized title as the native field's accessible name. Values, bindings, identifiers, content types, focus modifiers, layout and the separate visible labels are unchanged.

The first large-text journey failed before typing into the first-name field. The original log records its real tap at test time 45.27s, initial delete-key existence lookup at 51.17s, and internal query retries at 55.45–55.46s. The later failure snapshot contains the first-name field marked Keyboard Focused and a real system delete key at (363.7, 730), size 54 by 56. This establishes a readiness failure; it does not establish absent keyboard, lost product focus, or the exact cause of XCTest's snapshot timing.

`replace()` now first waits up to five seconds for the actual native keyboard after the real field tap, matching the existing staging in `searchFromKeyboard()`. It does the same after the Clear action reopens the keyboard. The original separate five-second unique delete-key `exists && isHittable` gate still follows. No successful visibility result is cached, no value is injected and no wait/assertion was removed or weakened. The two stages intentionally distinguish keyboard presentation from its actionable real key; this is not a guarantee that XCTest internal snapshot calls obey the nominal wall-clock bound.

## Rejected historical alternative

Commit `243031d3f35040985c5b274e8ddf4a90adb0eda8` already replaced exact-key indexed enumeration after that approach stalled on an earlier large-text failure with the keyboard visibly present. Its existing source evidence is retained at `publishing/recovery-20261117-d57f4/keyboard-query-11cb`. This candidate keeps that unique `firstMatch` query and does not restore collection enumeration.

## Verification and limits

Both changed Swift files passed `swiftc -frontend -parse` with exit 0. This is syntax verification, **not** native compilation or UI acceptance. Source retention independently proves that removing only the stated additions produces the exact base files: two label modifiers in the product view, and two keyboard-appearance assertions plus their comment in the UI helper. All 17 test method bodies are byte-identical. All 187 original assertions remain; the candidate has 189 assertions. All original key readiness waits, exact value checks, real typing, keyboard dismissal, Safari return and cooldown test content remain unchanged. English/Arabic titles are bound to the unchanged localization resources in the source receipt.

No app build, simulator run, native CI, Gradle, browser action, deployment or store operation was performed in this lane. Current CI supplies the baseline failures. **The keyboard staging remains a source-grounded repair hypothesis until the root coordinator's actual native rerun.** No candidate UI pass is claimed.

The root owns the final integrated rerun. Required observations remain the actual keyboard and exact typed value at largest text, native plus separate visible profile labels in English and Arabic, saved draft/relaunch persistence, and every original acceptance assertion. No skips or assertion relaxations are authorized.

Raw observations and source hashes are in `ci-observations.json` and `source-retention-and-syntax.json`. The original full job log is preserved outside this bounded package with SHA-256 `8366a5761892fc9217e293f963966726a1bd18eb2c4cfa8c9071d3238696a589`.

Patch SHA-256: `5c4290245ff98501ef2160fadef34e15d634a2884ca282825eb864bc47ed98ae`.
