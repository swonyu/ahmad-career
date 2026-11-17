# Accessible service-address clearing and truthful search summaries

This merge combines publishing recovery `bf8bfb0015d6f64c17f47e8d48e15d152e8491d8` with the original owner's sealed `d97bc209ca84ecb830e6c6bad25808164706409f`. Both histories remain intact. The original owner's remaining dirty documentation is not imported or modified. The original account branch was separately verified at the exact sealed d97 commit.

## Evidence and repair

The complete combined567 run `44114195156` finished with four of five jobs passing and 16 of 17 iPhone journeys passing. Its failed connection journey correctly rejected partial clearing: a real triple-tap did not select the whole URL, and Delete removed one hyphen at the caret. The current failure screenshots and accessibility snapshots are identified in the earlier `iphone-connection-followup` receipt. That failed run is evidence of the problem, not acceptance of this new tree.

The owner adds an ordinary, accessible Clear button to the advanced service-address row. It has a 44 by 44 point minimum target, English/Arabic accessibility label, stable identifier, and disabled state while the connection model is busy. It changes the local address and focus only. The existing address-change handler still invalidates the unsent connection code. No authentication, destination policy, token persistence, submission, signing, or build-version logic changes.

The actual connection journey dismisses the floating typing toolbar, reveals and taps this button, requires the entire field to become empty, refocuses the real field, requires a visible keyboard key, types the replacement, and checks the exact final value. The failed triple-tap fallback is removed. Other field replacements still require a reachable real Select All action followed by Delete and the same whole-empty and exact-value checks. All 17 test methods remain; the other 16 journey bodies are byte-identical to publishing567. This source repair still requires actual target-OS execution.

The hosted follow-up uses a neutral incomplete-search message in the live announcement, including fresh-but-limited source results, and isolates source names and custom-board labels according to their own text direction. Canonical values and links remain unchanged. The prior publishing fixes remain: current edited filters persist separately from the last submitted search, retries use the submitted filters without a cursor, pagination preserves its 200-result cap, and unavailable, incomplete and healthy empty results keep distinct explanations with one applicable retry control.

## Deliberate conflict resolution and critique

Three files had merge conflicts. The generated Kotlin string map was regenerated from the union native catalog, retaining all publishing entries plus the new Clear label. The phone results conflict retains the dedicated empty-state component and avoids two Retry controls. The search test conflict keeps both parents' production-handler tests and all new live-announcement scenarios; expected wording in two new cases follows the preserved, more precise partial/unavailable meanings.

An additional automatic merge issue was caught during inspection: the Arabic JSON contained the same neutral-summary key twice. The identical duplicate was removed and both catalogs were checked for duplicate keys. The focused suite and production build were then rerun against the final bytes. The actual draft-ref and request-closure checks, source-error plus stale-age details, due-follow-up navigation, dynamic text isolation, full native clearing assertions, and fixture isolation remain intact.

## Local verification

| Check | Observed result |
| --- | --- |
| Focused production search, localization, i18n and record-tools tests | 79 passed, 0 failed, 0 skipped, including subtests |
| Native localization generator | Exact generated files pass; 1,801 strings per language and 148 bounded templates |
| Native localization generator tests | 8 passed |
| TypeScript | Passed |
| Full hosted ESLint with zero warnings required | Passed |
| Hosted production build | Passed; existing framework advisories retained in the log |
| Native source retention | 17 methods retained; 16 journey bodies unchanged; 146 assertion calls, static review only |
| Workflow | Byte-identical to the coordinator-reviewed bf8 optional focused-mode change |

The adjacent receipts pin tested source hashes and exact command scopes. Counts from the focused suite are not added to historical test counts as new unique coverage. No native simulator, physical-device, signing or store operation was performed by this worker.

## Next runtime gate

The coordinator may push this sealed merge to the recovery branch as a non-forced fast-forward, confirm no conflicting workflow is active, and dispatch one existing `phone-quality.yml` workflow with `acceptance_scope=iphone-connection`. That intentionally partial run has one named iPhone connection journey, an exact-one-pass guard, and explicit PARTIAL job/artifact labels; the four unrelated jobs are skipped. A successful partial result is not a five-job or release pass. Default manual, push and PR runs retain the full five jobs and all 17 iPhone journeys. Full exact-candidate acceptance, live account/provider readiness, current screenshots, App Store privacy answers, real review contact, a selected processed store build, and store submission evidence remain separate gates.

The user's explicit additional 24 hours extends the prior cutoff to `2026-11-18T22:26:12Z` (19 November 01:26:12 Riyadh), preserving the original start rather than restarting it. Active-effort accounting remains unrecovered; work remains free-only.
