# Hosted phone release handoff

**Recorded 16 November 2026 — 0.4.0 phone candidate.** The hosted discovery service is deployed and public acceptance passed. Final phone-source CI, signed-in production phone acceptance and store distribution remain separate, unfinished gates. See the [phone polish review](Phone-Polish-Review-2026-11-16.md) for the changes in this candidate.

## Current evidence and identity

| Scope | Evidence |
| --- | --- |
| Published source baseline | `06f5e8a069c7debe94becf04ce73d997f9cde747`; [run 43895371363](https://github.com/swonyu/ahmad-career/actions/runs/43895371363) passed its four jobs. This is the baseline before the 0.4 discovery and polish changes. |
| Current source candidate | Native and hosted sources are frozen for publication. The expanded workflow defines five jobs, including an unsigned iPhone **Release** build and a new hosted iPhone UI run. No completed final-0.4 CI run is recorded yet. |
| Current native checks | [Apple evidence](../apple/Checks/mobile-verification.json) and [Android evidence](../android/checks/verification.json) identify their exact source hashes, executed scenarios, tools and limitations. Authored UI cases and static typechecking are not proof of a completed UI run. |
| Current hosted deployment | Sites version **2**, source `a2c82c51a37e570cedb6fd6b8459d208228fc578`, at [the public HTTPS origin](https://career-finder-service.jazzy-drake-8323.chatgpt.site). Version ID `appgprj_6afb13851fb4819193358d5db54e73b7~appgver_44afb8d73fb48191915b108625641b12`; deployment `appgdep_6afb2627e0f081918d7e98839bd2d5c1`. Deployment succeeded. |
| Hosted package identity | Archive SHA256 `fe90a6c300ebb2c17689cb03c2be04346320eefe1c610438f1123ea5cb13ef12`. The framework build and package completed successfully. The platform reported `updated_at: 2026-11-16T15:50:25.540440Z`; that metadata is not an independently measured deployment completion time. |
| Current production checks | [Version 2 public acceptance](hosted-production-polish-verification.json): 13 checks passed, including real public discovery, pagination, remote filtering, pages, D1/R2 health and anonymous/invalid-origin denials. No signed-in workspace, applicant data or employer submission was used. |
| Provider activation | Production reports `liveEnabled: false`. No employer credentials are configured; no real application acceptance is claimed. |
| Apple identity | Preserve `com.ahmadalayed.career` and the existing publisher-owned App Store Connect record. The publisher must verify its numeric store ID and distribution state from that record. |
| Android identity | Preserve `com.saleh.careerfinder`; `.preview` and `.acceptance` remain separate test variants. No Google Play publication is established. |

The [version 1 production record](hosted-production-http-verification.json) remains historical evidence for source `d078e56f88e1d9cfd4330f0c57f361ab845edaff`. Neither earlier store builds nor historical TestFlight/build-number observations are a verified distribution mapping for this candidate. Privacy and future-fixture corrections from the separate publisher branch `0d665aa` are represented in the candidate; this does not imply a branch merge or a store upload.

## Public experience and coverage

The public name is **Career Finder**. Fresh applicant and planning profiles contain no bundled individual's biography, résumé, contact details, target location or application history. Internal bundle, package, target and storage identities remain stable for existing records. The interface is English.

The primary Search/Discover experience now uses selected public Greenhouse and Lever employer boards across regions and professions. A person can select up to four catalog or custom supported boards and filter public results by role, location text and explicit remote metadata. Each board is bounded at 500 validated jobs, with 50 results per page. Sources, check times, stale cache, partial failures and changed page snapshots are visible. Country, remote status and work eligibility are never invented. The earlier six-source Saudi research feed is retained for compatibility/history, not as the primary search limit.

Search requires no account and sends no profile or CV. Search terms are not stored in account records or the shared board cache or forwarded to employers; platform request logs may contain URL fields. Saving a result is an explicit opportunity action. Manual application self-reports and local history cannot produce verified API receipts. Public board access does not authorize automatic application submission.

## Completed hosted verification

The candidate passed [25 discovery groups](../hosted/tests/hosted-discovery-verification.json), including eight requests through the bundled workerd entrypoint, and [29 application/storage groups](../hosted/tests/hosted-verification.json) plus [eight application runtime requests](../hosted/tests/hosted-worker-verification.json). These exercise real local D1/R2 and synthetic employer dependencies. [Public provider GET observations](../hosted/tests/discovery-public-sources.json) separately verify the starter catalog. The browser request helper passed ten transport cases covering timeout, cancellation, malformed responses and mutation confirmation; UI lint, framework typechecking and the production build also passed.

Production version 2 acceptance observed 855 validated jobs across the four default sources at 15:51:36–42 UTC, a second page without duplicates, and 349 matches for the remote-only filter. These are one bounded selected-source snapshot, not a worldwide vacancy count. Health reported usable D1/R2 and live submission disabled. Browser checks observed the Career Finder setup, support and signed-out account pages. None of these checks establishes signed-in production pairing or a real provider receipt.

## Remaining operator and publisher work

| Gate | Completion evidence needed |
| --- | --- |
| Final source and CI | Publish the intended 0.4 source and require all five configured jobs to pass on that exact commit. Retain commit, run URLs, artifacts and hashes. The earlier four-job success cannot validate later edits. |
| Signed-in production lifecycle | Record same-account sign-in/recovery, phone pairing, matching applicant email, deliberate PDF upload, revocation, export, interrupted upload recovery and deletion on the deployed service. Local synthetic lifecycle coverage is already recorded; it is not this production flow. |
| Phone acceptance | Exercise the exact candidate on intended phones: discovery, draft restoration, browser return, PDF picker, large text/screen reader, conflicts, cooldown approval, receipt sharing and deletion. Record the new hosted iPhone UI run separately from physical-device QA. Obtain the shared local Apple build-slot acknowledgment before local Xcode/simulator work. |
| Signing and distribution | The existing publisher verifies signing assets, version/build assignment, archive/install identity and upload/processing status. Record actual TestFlight/store outcomes; no new account, signing identity or store record is assumed. |
| Public disclosures and support | Reconcile the [privacy draft](Ahmad-Career-Privacy.html), deployed [privacy notice](https://career-finder-service.jazzy-drake-8323.chatgpt.site/privacy) and [support page](https://career-finder-service.jazzy-drake-8323.chatgpt.site/support) with the distributed app. Confirm the named operator, monitored contact, operational-log/feedback retention and store disclosures. |
| Account and login review | Verify the in-app account-deletion path and pending-work explanation. Assess the actual ChatGPT sign-in flow against store login requirements and any applicable exception; no approval or exemption is claimed. |
| Optional live provider activation | Obtain employer-authorized Lever credentials and current reviewed posting requirements. Enable only those postings. Applicant approval remains mandatory; only documented provider acceptance plus an application ID establishes a live verified receipt. |

The preview retains bounded storage and account limits. Deletion removes account-linked records and PDF content, while empty opaque upload markers prevent late writes from restoring erased files; deletion does not recall employer-held applications or erase a phone's local copy. Service ownership and store publication remain separate responsibilities.

## Primary store references

Reference links retained for the publisher's final review; the candidate has no store-approval claim:

- [Apple account deletion guidance](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)
- [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)
- [Apple App Review Guidelines, §4.8](https://developer.apple.com/app-store/review/guidelines/#login-services)
- [Google Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
