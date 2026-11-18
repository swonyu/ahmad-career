# Career Finder — release integration checklist

> **Historical snapshot — 17 November 2026.** The source, counts, deployment and ownership observations below describe that earlier checkpoint. See [the 18 November integrated candidate](Release-Candidate-2026-11-18.md) and [PR #1](https://github.com/swonyu/ahmad-career/pull/1) for the current integration and its exact acceptance state.

**Status: integration is prepared for review, not performed.** This document was prepared in an isolated continuation. No release branch was changed, no shared Mac build was started, and no signing or store action was performed. A fresh acknowledgment from the publishing owner is still required before shared release work. New isolated source changes are not certified by the baseline CI or deployed v7 receipts.

## Keep the source and deployment identities separate

| Boundary | Verified baseline at takeover | What it establishes |
| --- | --- | --- |
| Development evidence | `career-finder-phones-verified-apply-20261116` at `949ce0ad327beab79fa7033423b462ebc7bd98be` | Documentation/evidence checkpoint; the completed application gates below belong to e66d180 |
| Application source with completed five-gate CI | `e66d1809ece7666c7d99412d48aa193cdf024c42`, tree `2bbffcaa056fa08b2cdea9da7b9426cac8476fc0` | [Run 44030852040](https://github.com/swonyu/ahmad-career/actions/runs/44030852040) passed all five jobs, including 99 Android and 13 iPhone UI cases; physical devices and stores remain separate |
| Public hosted deployment | Version **7**, source `1135a3270435d3719c6f62f1a2e3a53e2c040146`, deployment `appgdep_6afbcfe3a03881918b131992225ded31` | Recorded production deployment; direct provider configuration was empty at revision 0 |
| Publishing branch | `app-store/career-workspace-copy-20261117` at `fd9c5399f2b7001b234b3b86bf72e2b36b5114c1` | Separate release candidate and owner; it does not contain the later development fixes |
| New isolated continuation | Unpublished candidate; record its final commit/tree and affected-path checks separately | Source preparation only until matching receipts establish tests, integration or deployment |

The [publishing handoff](Publishing-Handoff-2026-11-17.md) preserves the baseline receipts and remaining real-account/device gates. The [continuation ledger](Continuation-Review-2026-11-17.md) preserves earlier failures and exact-source corrections. A later successful test must identify the source it actually exercised.

## Preserve the two publishing-only commits

The [GitHub comparison](https://github.com/swonyu/ahmad-career/compare/949ce0ad327beab79fa7033423b462ebc7bd98be...fd9c5399f2b7001b234b3b86bf72e2b36b5114c1) reports a common ancestor of `303ee73e0e6389593f6cb08eba285405d60f19cb`: publishing is **two commits ahead and twelve commits behind** the development evidence checkpoint. This is a baseline comparison, not a promise that those branch heads have stayed unchanged. GitHub's comparison patch describes the publishing changes from their common ancestor; it is not a complete patch from current development to release.

| Publishing commit | Exact intent to preserve | Affected paths |
| --- | --- | --- |
| [`d17bd83a3e602bc2850444f3476bc4966a1e2b22`](https://github.com/swonyu/ahmad-career/commit/d17bd83a3e602bc2850444f3476bc4966a1e2b22) | Rename the disconnected action to **Connect application workspace**. Describe preparation and manual employer links. State that the hosted preview's live automatic submissions are disabled and that a custom service needs an activated, authorized employer integration plus approval of the reviewed application. | `apple/AhmadCareer/NativeApplicationsViews.swift`; `apple/AhmadCareer/NativeCareerViews.swift` |
| [`fd9c5399f2b7001b234b3b86bf72e2b36b5114c1`](https://github.com/swonyu/ahmad-career/commit/fd9c5399f2b7001b234b3b86bf72e2b36b5114c1) | Make the existing accessibility-size UI assertion expect **Connect application workspace**, while retaining its reachability check and connection-sheet action. | `apple/UITests/CareerFinderUITests.swift` |

At the development baseline, `reviewActionTitle` has since been refactored. It still returns **Set up Auto Apply** while disconnected. Preserve its current connected-state decisions, Stop/recovery handling, approval logic and availability behavior when reconciling the publishing wording. Do not replace a current file wholesale with its older publishing version. The UI test also has a diagnostic message containing the old label; update that message consistently when the publishing owner integrates the actual label change. No native source change is made by this checklist.

The publishing copy should retain these exact meanings:

- A saved job or prepared profile is not an employer submission.
- Employer links support manual applications; opening a link is not an application receipt.
- Public hosted live Auto Apply remains unavailable without an authorized employer integration and current reviewed requirements.
- A supported custom service still requires explicit approval of the reviewed application.
- Only a valid live provider receipt with a nonempty application identifier confirms a genuine submission.

## Integration sequence for the publishing owner

1. **Acknowledge the exact incoming source.** Recheck both remote branch heads, current owners, existing worktrees, uncommitted changes, active processes and pending CI/deployments. Agree on the integration checkout and build window. An absent `/tmp/dot-ios-build.lock` does not reserve the Mac. If another owner is active or acknowledgment is unavailable, continue only isolated work.
2. **Preserve the working copy and both histories.** Integrate the selected development candidate into an isolated publishing-owned candidate, retaining the two publishing-only commits and newer development behavior. Resolve conflicts explicitly; do not force-push, discard local changes or substitute a historical release snapshot for newer source. Record the integrated commit/tree before testing.
3. **Verify the affected source.** Run the relevant hosted/account/provider tests for new service changes and retain failure-to-fix evidence. Once native copy or integrated native code changes, run the iPhone logic/build and all 13 UI cases against that integrated revision. Reuse earlier unaffected evidence only with exact unchanged path/tree provenance; do not relabel the old five-gate run as a new integrated-source result. Run any additionally required release gates on the final selected source.
4. **Keep hosted publication independent.** Reconcile the authoritative Sites source and its repository mirror by exact path/hash, preserve the existing Site identity/audience, and apply only approved configuration. Save/deploy the matching source archive and record its terminal result. A GitHub commit, a saved version and a live deployment are separate events. Keep Google and LinkedIn unavailable until their actual registrations/configuration and consent checks succeed.
5. **Complete account and device acceptance.** Use the [owner steps](Owner-Acceptance-2026-11-17.md) with authorized disposable accounts and synthetic records. Record browser/device/OS versions, exact build/source, observation and failure evidence for account A → B → A, export/deletion, provider cancellation/recovery, large text, keyboard, VoiceOver/TalkBack and PDF picker interruption. Local fixture, simulator and physical-device results remain separately labeled.
6. **Verify the install and store mapping.** Preserve iPhone bundle `com.ahmadalayed.career`, Android production identity `com.saleh.careerfinder`, preview/acceptance separation and existing upgrade paths. The publishing owner verifies current signing authority, version/build uniqueness, artifact digest/certificate and install behavior before upload. Match store copy/screenshots, operator/support details and privacy disclosures to the actual signed build. Record processing, review and publication outcomes only when observed.

## External gates and supported alternatives

| Gate still open | Evidence required to close it | Supported path while blocked |
| --- | --- | --- |
| Publishing acknowledgment | Current owner accepts the exact source and shared build/release schedule | Isolated development candidate and durable repository handoff |
| Direct Google/LinkedIn configuration | Authorized provider applications, correct callbacks/scopes, required owner/domain/product decisions, private server configuration and matching deployment | Existing ChatGPT sign-in, including its Google option; saved LinkedIn profile/search links |
| Real provider consent and recovery | Actual consenting-account success/cancellation, explicit linking, conflict refusal, disconnect and session recovery | Keep unconfigured providers inactive; synthetic tests remain engineering evidence only |
| Disposable-account and physical-device acceptance | Exact scenario/build/device records showing preservation and isolation with authorized test accounts | Bounded browser/local/simulator checks, labeled with their actual scope |
| Native/store availability | Publishing-owner signing, install, upload and observed review/distribution receipts | Free browser app at [`/phone`](https://career-finder-service.jazzy-drake-8323.chatgpt.site/phone) |

Do not purchase a domain, enable billing, add a paid API or subscription, pay a new developer enrollment fee, or enable automatic paid overages to close a gate. Do not send test applications to real employers. No external provider approval or store-review date is guaranteed by the engineering work budget.

## Review provenance

This checklist uses the three required handoff documents, read-only source inspection and a read-only GitHub comparison of the exact revisions above. It adds no runtime-test, merge, deployment, signed-build or physical-device pass. The documentation correction labels the earlier v6 material as historical and directs current publishing work to the v7/e66d180 baseline plus the separately recorded new candidate.
