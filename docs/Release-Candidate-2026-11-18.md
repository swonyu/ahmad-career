# Career Finder — integrated release candidate, 18 November 2026

## Purpose and current acceptance boundary

This continuation combines the completed terminal lanes and publisher work under the owner's explicit instruction to merge the work and accelerate release. The existing pull request is [PR #1](https://github.com/swonyu/ahmad-career/pull/1), targeting `career-finder-phones-verified-apply-20261116`.

**The combined candidate is not certified by the historical 17 November runs or the deployed website.** Complete acceptance is attached to the exact final candidate in the PR and its five-job Phone quality run. The integration is held until that candidate passes the required checks. A source merge, a deployed website, a signed install and store availability are separate outcomes.

The 17 November [integration checklist](Release-Integration-Checklist-2026-11-17.md) and [publishing handoff](Publishing-Handoff-2026-11-17.md) retain historical observations. Their old branch heads, test counts, provider settings and ownership acknowledgment requirements are not current-state evidence. The owner's later instruction authorizes the integration and normal merge in this continuation.

## Preserved work

The integrated source includes the completed hosted, native, SSR, search, recovery and accessibility work, plus a checkpoint of the publisher's uncommitted native work. Original worktrees, branch history and the publisher's original dirty files remain preserved.

The independent [preservation audit](continuation-evidence/2026-11-18-corrected-release-d60d/preservation-audit-1fe9b754.json) establishes that all seven requested checkpoints are actual ancestors of the combined `1fe9b7543be68ec9343e0fcbc6ca3bc52d58ef62` source. Later scoped acceptance corrections descend from that source; they do not replace a completed lane wholesale. See the [audit explanation](continuation-evidence/2026-11-18-corrected-release-d60d/preservation-README.md).

The native integration retains the publisher's truthful connection wording: preparing a profile or opening an employer link is not a confirmed application. A genuine submitted outcome requires a supported, authorized provider and an actual returned application identifier.

## What the candidate provides

- Arabic and English phone experiences, persistent language selection, five-tab navigation and explicit account/workspace boundaries.
- Search across selected supported public employer boards with visible coverage and freshness limits, plus saved public job links.
- Reusable Career Finder profile details and validated PDF storage. Uploaded PDFs are not automatically converted into profile fields.
- Private application notes, stages, follow-ups, exports and recoverable interrupted work. Self-reported stages remain distinct from provider submission receipts.
- Explicit review and approval for supported submissions, durable Stop intent and truthful treatment of uncertain provider responses.
- Corrections for saved-search recovery, exact-query retries, actual cooldown clocks, opening an explicitly selected older record and retaining draft history.
- Restored native profile-field accessible names and ASCII connection-code entry under Arabic app language.
- A React SSR/hydration build that preserves service and storage boundaries while removing the dependency audit blocker.

[The Clacku feedback comparison](Clacku-Feedback-2026-11-18.md) maps the supplied replies to actual source behavior. It records unmet needs in repeated entry, experience matching, source coverage, questionable listings and employer responses. It does not silently add unimplemented features to the release or claim those needs have already been solved.

## Review and verification

Three independent reviews covered engineering, UX/accessibility and security/SSR/release evidence. Validated in-scope findings were corrected and retested. The three existing Grok chats were retained; no new Grok prompts were sent after the owner reported exhausted usage. The independent reviews in this continuation were completed here.

The required combined gate remains all five ordinary Phone quality jobs:

| Gate | Required evidence |
| --- | --- |
| Hosted HTTPS service and durable storage | Ordinary install, zero unfiltered dependency vulnerabilities, lint/types, complete regressions, D1/R2 smoke checks, production build and SSR boundaries |
| Service and synthetic HTTPS | Complete service regressions, explicit consent, receipt and recovery behavior in synthetic transport |
| iPhone logic and unsigned build | Boundary, lifecycle, recovery, discovery and actual-clock checks, plus the unsigned Release build |
| Android compile, lint and native acceptance | All 116 source-defined cases, actual emulator outcomes and source-bound screenshots |
| iPhone native acceptance | All 17 full UI journeys, no filtering or skips, exact checkout/source binding and retained attachments |

Focused local replays diagnose and qualify corrections; they do not replace the complete combined gate. Original failed runs and failed focused attempts remain preserved alongside the corresponding correction evidence. The iPhone readiness step permits 5 minutes, the combined build/UI step permits 60 minutes, and the whole job permits 70 minutes, with 5 minutes of shared job headroom for setup and evidence. The [readiness-budget review](continuation-evidence/2026-11-18-takeover-20698/ci-readiness-budget-review.json) records the strictly successful 187-second preparation sequence that exceeded the previous 180-second step limit. Run 44372262687 then spent about 5 minutes 47 seconds building and launching before its tests, completed 15 journeys without a failed assertion, and was interrupted during journey 16 by the former 45-minute combined deadline; journey 17 never started. The bounded 60/70-minute correction is supported by that measured workload. All strict readiness checks, commands, the 17-test list and assertions remain unchanged; this resource-budget correction still requires its own complete current-source acceptance.

Actual production-Worker browser checks also exercised guest save/reload, bilingual persistence, private notes, recovery/export focus and the real profile/PDF save, invalid-replacement rejection and exact-byte export. These use isolated synthetic data and are not evidence of real-provider acceptance. Browser and native simulator results do not establish physical-device or store readiness.

## Delivery states and remaining external items

| Outcome | Evidence needed |
| --- | --- |
| Implemented, committed and pushed | Exact final branch/commit and preserved lane ancestry |
| Combined engineering acceptance | Successful final five-job run with source and artifact receipts |
| Merged | GitHub merge result and merge-tree equality to the accepted candidate |
| Hosted deployment | Matching authoritative Site source, saved version, completed deployment and live journey verification |
| Direct provider availability | Actual approved configuration and consenting-account success, cancellation, linking, conflict refusal, disconnect and recovery |
| Signed native availability | Existing authorized signing identity, install/upgrade validation and exact artifact digest |
| Store availability | Matching metadata/privacy/support, uploaded and processed build, observed review and distribution state |

The current continuation does not claim a replacement public deployment, live employer application, physical-device acceptance, signed install or store release merely because code or automated checks are complete.

Known external items include real Google consent/recovery verification, LinkedIn application/product configuration, authorized employer integration for live automatic submission, and physical-device/signing/store distribution. The existing supported alternatives remain the browser app, available account flow, manual employer links, saved profiles and private records. Provider and store approval times are not engineering completion guarantees.

No paid API, subscription, domain purchase, new developer enrollment payment or overage is authorized. No real employer is contacted and no real application is sent for acceptance testing.

## Continuity

The original cutoff remains **19 November 2026, 01:26:12 Riyadh**. This continuation does not restart the clock. Engineering estimates remain conditional on the observed run and any newly exposed failure; they do not promise external-provider or store approval.

The coordinating ChatGPT continuation owns integration through the authorized merge and records the result in the PR and exact-source receipts. The existing publishing context and original work remain preserved for subsequent deployment and distribution. No unattended post-release monitoring is claimed.


## Interrupted-coordinator recovery — 18 November 2026

Full run 44277443136 on 0db94c6 completed with four jobs successful and iPhone UI 16/17. The keyboard-dismissal predicate in the large-text journey exhausted its shared observation budget; the final recording shows the keyboard absent. The isolated correction retains all original conditions and all 17 methods, and its focused native journey passed. See [the source-bound recovery evidence](continuation-evidence/2026-11-18-keyboard-dismissal-ebb3/README.md). Full five-job acceptance of this successor remains required before merge; no prior pending statement should be read as a pass.
