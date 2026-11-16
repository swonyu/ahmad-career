# Hosted phone release handoff

**Recorded 16 November 2026 — Android preview 0.4.0: published on GitHub.** The hosted discovery service is deployed and public acceptance passed. Signed-in production browser navigation was verified at approximately 19:51 UTC (22:51 Riyadh); native pairing and the remaining account lifecycle still need acceptance. The release record separates tested source and downloadable Android preview from unsigned iPhone builds, production lifecycle acceptance and store distribution. See the [phone polish review](Phone-Polish-Review-2026-11-16.md) for the changes and retained CI attempt history.

## Current evidence and identity

| Scope | Evidence |
| --- | --- |
| Published source baseline | `06f5e8a069c7debe94becf04ce73d997f9cde747`; [run 43895371363](https://github.com/swonyu/ahmad-career/actions/runs/43895371363) passed its four jobs. This is the baseline before the 0.4 discovery and polish changes. |
| Tested code and CI | `caa5ace14fe7b430db845d935a89803700cc7665` (368 source files); [run 43923335555](https://github.com/swonyu/ahmad-career/actions/runs/43923335555). Final five-job result: **passed (all five gates)**. Final iPhone UI result: **passed (7/7 synthetic tests, attempt 2)**. Publication does not by itself establish a main-branch change. |
| Android preview release | [Release notes](https://github.com/swonyu/ahmad-career/releases/tag/career-finder-v0.4.0-preview), [APK](https://github.com/swonyu/ahmad-career/releases/download/career-finder-v0.4.0-preview/Career-Finder-Android-Preview.apk) and [tested source ZIP](https://api.github.com/repos/swonyu/ahmad-career/zipball/career-finder-v0.4.0-preview). Release status: **published on GitHub**; public download checks: **passed: unauthenticated APK rehash and all 368 source files matched**. Published 16 November at 18:35:37 UTC. Exact source, hashes and check times are in the [release verification record](phone-preview-release-verification.json). |
| Android APK identity | Version 0.4.0, code 4; 12,071,908 bytes; SHA-256 `3ce9a61e875eb295f6689993884b97d15a1356074e14775c5ebc55c6d0bf1c62`. The final APK passed 35 native tests; the compact/180%/Arabic country flow passed separately in 8.027 seconds. |
| Final iPhone runtime | Seven synthetic UI cases passed in 600.248 seconds, zero failures/unexpected failures, on iPhone Air / iOS 26.5. UI job `133510144696` completed successfully at 18:34:04 UTC in attempt 2. The four successful non-UI jobs from attempt 1 were retained; all five required gates are satisfied. |
| Observed public source ZIP | 1,086,102 bytes; SHA-256 `12c99583a3e8277c56bf3a08f4810dc2053e76b41066570dfda556904b71bf9e`. Every one of its 368 files matched the tested manifest by path, length and SHA-256. The ZIP hash identifies the observed generated archive; its file hashes provide durable source identity. |
| Native evidence scope | [Apple standalone evidence](../apple/Checks/mobile-verification.json) and [Android evidence](../android/checks/verification.json) identify their source hashes, executed scenarios and limits. The [release record](phone-preview-release-verification.json) separately records the actual hosted iPhone UI result and retained earlier failures. The iPhone Release build is unsigned; simulator UI fixtures are synthetic. |
| Current hosted deployment | Sites version **2**, source `a2c82c51a37e570cedb6fd6b8459d208228fc578`, at [the public HTTPS origin](https://career-finder-service.jazzy-drake-8323.chatgpt.site). Version ID `appgprj_6afb13851fb4819193358d5db54e73b7~appgver_44afb8d73fb48191915b108625641b12`; deployment `appgdep_6afb2627e0f081918d7e98839bd2d5c1`. Deployment succeeded. |
| Hosted package identity | Archive SHA256 `fe90a6c300ebb2c17689cb03c2be04346320eefe1c610438f1123ea5cb13ef12`. The framework build and package completed successfully. The platform reported `updated_at: 2026-11-16T15:50:25.540440Z`; that metadata is not an independently measured deployment completion time. |
| Current production checks | [Version 2 public acceptance](hosted-production-polish-verification.json): 13 checks passed, including real public discovery, pagination, remote filtering, pages, D1/R2 health and anonymous/invalid-origin denials. No signed-in workspace, applicant data or employer submission was used. |
| Signed-in browser acceptance | [16 November account verification](hosted-account-verification-2026-11-16.json): sign-in completed, the target `/connect` page showed a positive signed-in state, `/account` loaded and reported no cloud workspace yet, and returning to `/connect` preserved sign-in. No connection code or cloud workspace was created and no phone was paired. This milestone does not establish full production account lifecycle acceptance. |
| Provider activation | Production reports `liveEnabled: false`. No employer credentials are configured; no real application acceptance is claimed. |
| Apple identity | Preserve `com.ahmadalayed.career` and the existing publisher-owned App Store Connect record. The publisher must verify its numeric store ID and distribution state from that record. |
| Android identity | Preserve `com.saleh.careerfinder`; `.preview` and `.acceptance` remain separate test variants. No Google Play publication is established. |

The [version 1 production record](hosted-production-http-verification.json) remains historical evidence for source `d078e56f88e1d9cfd4330f0c57f361ab845edaff`. Neither earlier store builds nor historical TestFlight/build-number observations are a verified distribution mapping for this 0.4 update. Privacy and future-fixture corrections from the separate publisher branch `0d665aa` are represented in the tested source; this does not imply a branch merge or a store upload.

## Public experience and coverage

The public name is **Career Finder**. Fresh applicant and planning profiles contain no bundled individual's biography, résumé, contact details, target location or application history. Internal bundle, package, target and storage identities remain stable for existing records. The interface is English.

The primary Search/Discover experience now uses selected public Greenhouse and Lever employer boards across regions and professions. A person can select up to four catalog or custom supported boards and filter public results by role, location text and explicit remote metadata. Each board is bounded at 500 validated jobs, with 50 results per page. Sources, check times, stale cache, partial failures and changed page snapshots are visible. Country, remote status and work eligibility are never invented. The earlier six-source Saudi research feed is retained for compatibility/history, not as the primary search limit.

Search requires no account and sends no profile or CV. Search terms are not stored in account records or the shared board cache or forwarded to employers; platform request logs may contain URL fields. Saving a result is an explicit opportunity action. Manual application self-reports and local history cannot produce verified API receipts. Public board access does not authorize automatic application submission.

## Completed hosted verification

The hosted service passed [25 discovery groups](../hosted/tests/hosted-discovery-verification.json), including eight requests through the bundled workerd entrypoint, and [29 application/storage groups](../hosted/tests/hosted-verification.json) plus [eight application runtime requests](../hosted/tests/hosted-worker-verification.json). These exercise real local D1/R2 and synthetic employer dependencies. [Public provider GET observations](../hosted/tests/discovery-public-sources.json) separately verify the starter catalog. The browser request helper passed ten transport cases covering timeout, cancellation, malformed responses and mutation confirmation; UI lint, framework typechecking and the production build also passed.

Production version 2 acceptance observed 855 validated jobs across the four default sources at 15:51:36–42 UTC, a second page without duplicates, and 349 matches for the remote-only filter. These are one bounded selected-source snapshot, not a worldwide vacancy count. Health reported usable D1/R2 and live submission disabled. Browser checks observed the Career Finder setup, support and signed-out account pages. None of these checks establishes signed-in production pairing or a real provider receipt.

### Signed-in browser milestone

At approximately 19:51 UTC on 16 November (22:51 Riyadh), the user-selected Google sign-in method and OpenAI consent flow returned to Career Finder. The deployed `/connect` page showed **Signed in securely** for the expected account. The `/account` page then loaded successfully and reported that no cloud workspace had been created; navigation back to `/connect` preserved the signed-in state. These observations are recorded without account identifiers in the [account verification record](hosted-account-verification-2026-11-16.json).

The check stopped before creating a connection code or cloud workspace. It did not pair a native phone, upload or save a profile/CV, export or delete account data, revoke a device, recover an interrupted upload, or send an employer application. Account recovery on another phone and these write paths remain separate production acceptance steps.

A focused static review of current iPhone, Android and hosted account lifecycle code found no concrete defect that would let a delayed response replace a different workspace's data. Existing regression cases cover obsolete responses and authorization errors after connection changes, local disconnect, delayed PDF writes after cloud deletion, and continuation authority. No code or test suite was changed or rerun for that review. The source review supports the recorded protections; it does not substitute for the remaining production and physical-phone checks.

## Remaining operator and publisher work

| Gate | Completion evidence needed |
| --- | --- |
| Future code changes | Re-run the configured code gates for any later source changes. This handoff and the release verification record describe the exact tested code above; subsequent documentation-only commits do not change its compiled inputs. |
| Signed-in production lifecycle | Browser sign-in and authenticated navigation are recorded above. Still verify deliberate connection-code/workspace creation, native phone pairing, same-account recovery on another phone, matching applicant email, deliberate PDF upload, revocation, export, interrupted upload recovery and deletion on the deployed service. Local synthetic lifecycle coverage is already recorded; it is not this production flow. |
| Phone acceptance | Exercise the released preview and iPhone build on intended physical phones: discovery, draft restoration, browser return, PDF picker, large text/screen reader, conflicts, cooldown approval, receipt sharing and deletion. Keep hosted simulator UI results separate from physical-device QA. Obtain the shared local Apple build-slot acknowledgment before local Xcode/simulator work. |
| Signing and distribution | The existing publisher verifies signing assets, version/build assignment, archive/install identity and upload/processing status. Record actual TestFlight/store outcomes; no new account, signing identity or store record is assumed. |
| Public disclosures and support | Reconcile the [privacy draft](Ahmad-Career-Privacy.html), deployed [privacy notice](https://career-finder-service.jazzy-drake-8323.chatgpt.site/privacy) and [support page](https://career-finder-service.jazzy-drake-8323.chatgpt.site/support) with the distributed app. Confirm the named operator, monitored contact, operational-log/feedback retention and store disclosures. |
| Account and login review | Verify the in-app account-deletion path and pending-work explanation. Assess the actual ChatGPT sign-in flow against store login requirements and any applicable exception; no approval or exemption is claimed. |
| Optional live provider activation | Obtain employer-authorized Lever credentials and current reviewed posting requirements. Enable only those postings. Applicant approval remains mandatory; only documented provider acceptance plus an application ID establishes a live verified receipt. |

The preview retains bounded storage and account limits. Deletion removes account-linked records and PDF content, while empty opaque upload markers prevent late writes from restoring erased files; deletion does not recall employer-held applications or erase a phone's local copy. Service ownership and store publication remain separate responsibilities.

The [mobile store-listing draft](Mobile-Store-Listing-Draft.md) provides reviewed publishing copy for the existing publisher. It remains a draft and does not establish store submission, approval or availability.

## Primary store references

Reference links retained for the publisher's final review; this preview has no store-approval claim:

- [Apple account deletion guidance](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)
- [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)
- [Apple App Review Guidelines, §4.8](https://developer.apple.com/app-store/review/guidelines/#login-services)
- [Google Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
