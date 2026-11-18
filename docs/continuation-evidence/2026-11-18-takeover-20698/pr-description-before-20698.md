## Why this change is needed

Career Finder needs one integrated Arabic/English release candidate with reliable account boundaries, recoverable work, truthful search/application status and a passing dependency audit. The completed hosted, native search, recovery, accessibility and publisher work previously lived in separate continuation trees.

**Status: final corrected combined candidate; complete CI running.** Head: `0db94c651d37cde774410915dbdd346cc743a458`, tree `86e2a6dc9905e66af25f45984d3e0a3ecfd012d9`. [Current five-job run](https://github.com/swonyu/ahmad-career/actions/runs/44277443136). All 17 iPhone journeys remain selected. The original [full run](https://github.com/swonyu/ahmad-career/actions/runs/44262971576) passed four jobs and ran all 17 iPhone journeys once: 11 passed, six failed, zero skipped. Its exact failures are retained. [Run 44273363743](https://github.com/swonyu/ahmad-career/actions/runs/44273363743) on the preceding candidate is superseded; its four passing jobs are not the final candidate's acceptance. Merge remains held for the current complete run.

## What this PR changes

- Combines the completed search, recovery, account/accessibility and publisher native work, preserving original worktrees and branch history.
- Restores explicit localized native profile-field names and supports ASCII connection-code entry on Arabic keyboards.
- Corrects actual native acceptance timing and touch targeting while retaining every original return assertion and all 17 journeys. The iPhone execution ceiling now accommodates the observed complete workload (45-minute test step, 50-minute job); no test filters or skips were added.
- Keeps exact submitted-search retries distinct from newer editable filters; preserves live results, submitted query, draft, errors and cooldowns when saved-file recovery fails on either phone platform.
- Corrects iPhone zero/expired cooldown behavior and disables all retry controls consistently while a real deadline remains.
- Makes an explicitly selected older recovered record open with its chosen text against the current record revision. Earlier unfinished versions remain recoverable; stale-save, workspace, ambiguity and capacity checks remain strict.
- Preserves the bilingual redesign, five-tab navigation, original branding, account isolation, receipt-stop protections, canonical employer-board behavior and accurate partial/search-limit explanations.
- Improves record-action spacing and restores visible keyboard focus after exporting unfinished edits.
- Replaces the affected Next/Vite rendering toolchain with explicit React SSR/hydration through esbuild. The existing service, identity/OAuth, provider, connector, database, deployment identity and storage handlers remain unchanged. The full unfiltered audit requirement remains enabled.

## Independent reviews and corrections

Three independent reviewers covered engineering, UX/accessibility, and security/SSR/release evidence. They inspected the actual source and evidence rather than treating another model's suggestions as proof. Engineering and UX accepted the corrected recovery and cooldown behavior; engineering accepted both final saved-read corrections at the combined head. The SSR/security reviewer found no material introduced defect and independently matched the production source, Worker, assets and evidence hashes.

After the failed full run, engineering independently reviewed the scoped field, cooldown and browser corrections. The actual iPhone Air / iOS 26.5 simulator now passes both complete selected connection journeys, including Arabic code retention and English browser reopening. This is focused qualification only. The native Safari presenter is unchanged; the failed browser interaction was traced to cold service startup and an automated tap outside the circular Done control. Arabic app-language overrides are distinguished from the system-owned Safari service language.

The subsequent local four-case run passed saved-draft recovery, Arabic large-text profile persistence and the complete cooldown/search journey. It exposed a remaining English large-text positioning failure. The test helper was corrected to use measured edge overflow and a bounded real drag that crosses the observed pan dead zone. The full affected method then passed on iPhone Air / iOS 26.5 in 112.424 seconds. Product code, all 17 methods, the 20-attempt bound and the complete visibility/value/keyboard assertions remain unchanged by this last correction. The original and intermediate failures remain retained. These source-bound focused runs qualify the corrections and do not replace the final combined gate.

[Native qualification](https://github.com/swonyu/ahmad-career/blob/0db94c651d37cde774410915dbdd346cc743a458/docs/continuation-evidence/2026-11-18-corrected-release-d60d/local-native-qualification.json) · [Geometry correction](https://github.com/swonyu/ahmad-career/tree/0db94c651d37cde774410915dbdd346cc743a458/docs/continuation-evidence/2026-11-18-native-profile-geometry-d60d) · [Preservation audit](https://github.com/swonyu/ahmad-career/blob/0db94c651d37cde774410915dbdd346cc743a458/docs/continuation-evidence/2026-11-18-corrected-release-d60d/preservation-audit-1fe9b754.json).

The three existing Grok chats are preserved as context. After the user reported exhausted usage, no further Grok prompts were sent; these independent reviews were completed here.

| Focused regression | Baseline | Corrected result |
| --- | --- | --- |
| iOS saved-search recovery | Expanded identical harness fails | 167 assertions / 32 scenarios pass |
| Android saved-search recovery | Same class: 11 tests, 3 failures | 11 / 11 pass in explicitly labeled JVM host harness |
| Selected older record recovery | Same harness fails to restore chosen text | 201 assertions / 61 scenarios pass |
| Actual iPhone view clock and retry predicates | Six failed assertions | 21 assertions / five scenarios pass |

Host checks do not substitute for SDK builds or device acceptance. The corrected combined source must pass a new complete CI run before merge.

## Actual browser and hosted evidence

- Ordinary dependency install with lifecycle scripts actually executed; unfiltered audit reports zero vulnerabilities. Strict lint, typecheck, complete hosted regressions, real local D1/R2 smoke checks, browser API/pairing, production build, and packaged SSR/asset-boundary checks pass on the integrated hosted source.
- Actual Chrome served the production Worker after matching all 93 build inputs to the combined tree. Guest job/private-note save and reload, Arabic persistence, original/draft JSON download, visible export focus, Tab to Delete, and Keep editing were exercised.
- The actual module-worker fixture passed all six PDF selections plus cancellation and synthetic owner-change cases. Invalid replacements retained the previous CV; eight workers started and eight terminated.
- The real production Profile flow also accepted a valid CV, rejected an encrypted replacement, saved on the phone, reloaded, and exported the exact original 1,311-byte CV. This is synthetic guest-browser acceptance, not live-provider acceptance.
- Actual integration viewport evidence is 390 CSS pixels wide. A requested 320 override stayed at 390 and is not claimed as a 320 pass. Earlier bounded 320/enlarged-action-text evidence remains separately source-bound.

[Hosted SSR evidence](https://github.com/swonyu/ahmad-career/tree/d8d2e999d0348eb07942472a1d9e87d2fc4498a2/docs/continuation-evidence/2026-11-18-hosted-ssr-integration-d60d) · [Native integration](https://github.com/swonyu/ahmad-career/tree/d8d2e999d0348eb07942472a1d9e87d2fc4498a2/docs/continuation-evidence/2026-11-18-native-integration-d60d) · [Saved-search correction](https://github.com/swonyu/ahmad-career/tree/d8d2e999d0348eb07942472a1d9e87d2fc4498a2/docs/continuation-evidence/2026-11-18-saved-search-recovery-d60d) · [Integrated browser evidence](https://github.com/swonyu/ahmad-career/tree/d8d2e999d0348eb07942472a1d9e87d2fc4498a2/docs/continuation-evidence/2026-11-18-integrated-browser-d60d).

## User feedback

The owner supplied two Clacku screenshots. [The source-mapped feedback note](https://github.com/swonyu/ahmad-career/blob/1fe9b7543be68ec9343e0fcbc6ca3bc52d58ef62/docs/Clacku-Feedback-2026-11-18.md) deduplicates repeated replies, records current support and gaps, and identifies future investigations. It does not claim universal ATS autofill, verified hiring, personalized seniority ranking or comprehensive government-job coverage.

## Release boundaries

[Current release-candidate scope and delivery states](https://github.com/swonyu/ahmad-career/blob/0db94c651d37cde774410915dbdd346cc743a458/docs/Release-Candidate-2026-11-18.md). The older 17 November handoffs are explicitly labeled historical.

The user explicitly authorized combining and merging the completed work. Final merge is being held for the full combined gate, not for another user permission round. No public deployment replacement or signed/store publication is claimed.

Live Google callback/denial/unlink/relink, LinkedIn product/client authorization and real consent, physical-device accessibility acceptance and signed/store distribution remain separate, unverified release items. No employer was contacted, real application sent, or paid service activated in this continuation.

The original Career Finder cutoff remains **19 November 2026, 01:26:12 Riyadh**. This integration does not start a new clock. Historical run failures and focused passes are retained in the existing evidence; they are not the current candidate's result.

