# Hosted phone release handoff

**Recorded 16 November 2026.** This is a source and release-gate handoff. Deployment, signed distribution and store review require their own evidence for the final candidate.

## Current evidence and identity

| Scope | Evidence |
| --- | --- |
| Earlier published source | Commit `2a9004a0b684198018ea6583a08ba4f49f2af5b1`; [Phone quality run 43883809010](https://github.com/swonyu/ahmad-career/actions/runs/43883809010) passed all three jobs, including the hosted unsigned iPhone project build. This predates the hosted-service changes. |
| Current Apple hosted integration | [Exact standalone evidence](../apple/Checks/mobile-verification.json): 61 boundary checks, 117 production-store assertions across 25 scenarios, the native planning-store regression, and all ten Swift app sources typechecked for iOS 16 with zero diagnostics. The evidence file SHA256 is `583f96acc38277070d8bc45113a1417c8b70eeab584220297f343798fb390e20`. Synthetic transport and credentials were used. |
| Published service | `https://career-finder-service.jazzy-drake-8323.chatgpt.site`; Sites version 1 deployed successfully from source `d078e56f88e1d9cfd4330f0c57f361ab845edaff` at 14:57:43 UTC, 16 November 2026. Eight public HTTP checks passed; browser pages and sign-in navigation were observed. Signed-in production pairing is not yet established. |
| Provider activation | No employer credentials configured; `liveEnabled: false`. No real employer acceptance is claimed. |
| Apple identity | Preserve `com.ahmadalayed.career` and the existing publisher-owned App Store Connect record. The numeric store ID and current distribution state must be read from that existing record by its publisher. |
| Android identity | Preserve the release application ID `com.saleh.careerfinder`. `.preview` and `.acceptance` packages are separate test variants. No Play publication is established here. |

The current source has no verified mapping to an App Store/TestFlight release or build 13. Historical version numbers and approvals must be associated with their original source/archive evidence.

## Public name and fresh users

The public name is **Career Finder**. iPhone Debug and Release set `PRODUCT_NAME` and `CFBundleDisplayName` to Career Finder, with matching `Career Finder.app` product/scheme references; a new hosted CI run must verify the generated `CFBundleName` after correcting the metadata assertion failure in run 43893803094; the Android 0.3.0 packaged label was verified as Career Finder. New applicant and planning profiles contain no personal biography, CV, contact details, country/city/career targets or saved history. Regional salary examples are optional historical references. Internal package/target/storage identities stay stable for upgrades and existing records. Built-in iPhone live discovery remains explicitly limited to six selected Saudi employer sources; manually saved opportunities and profiles accept any country or profession.

## Completed hosted work

The production health check confirmed D1 and R2 access. Anonymous account/native workspace requests and caller-supplied platform identity headers were rejected. Public connection, privacy and support pages use Career Finder. See [the production HTTP record](hosted-production-http-verification.json). The backend passed 29 local D1/R2 concurrency, quota, approval and erasure groups plus eight requests in the actual workerd runtime. These are synthetic local account/provider flows, separate from production authentication.

## Work remaining with the service operator and publisher

| Gate | Completion evidence needed |
| --- | --- |
| Hosted deployment | Exact deployed source/runtime identity, HTTPS responses, live `/connect`, `/privacy`, `/support` and `/account` pages, sign-in and same-account recovery, phone pairing, and signed-in/applicant email matching. Record the actual deployed status and quotas. |
| Hosted data lifecycle | Exercise explicit PDF upload and the five-file/25-MiB account limit, approved continuation, interrupted requests, account deletion during an active provider request, immediate upload fencing, token revocation, and removal of account-linked CV content/metadata. Empty random storage markers must retain no account association, filename, CV hash or content. |
| Final source and CI | Publish the final intended source and require every configured CI job to pass on that exact commit. Retain the commit, job URLs, artifacts and hashes. The earlier run above cannot validate later edits. |
| Phone acceptance | Exercise the exact candidate on the intended phones: browser sign-in return, PDF picker, large text and screen-reader navigation, offline/restored drafts, conflicts, explicit cooldown approval, receipt sharing, recovery and deletion. Obtain the shared local Apple build-slot acknowledgment before local Xcode/simulator work. |
| Signing and distribution | Existing publisher verifies app/store identity, signing assets, version/build assignment, archive/install identity, upload and processing status. Record actual TestFlight/store review outcomes. No account, signing, build-number or store-record change was performed by this documentation pass. |
| Public disclosures and support | Reconcile the [privacy draft](Ahmad-Career-Privacy.html) with the deployed service and distributed app. Confirm the named operator, monitored contact, operational-log and feedback retention, current privacy/support URLs and store data disclosures. |
| Account and login review | Verify the in-app path directly reaches account deletion and clearly reports pending work. Assess the ChatGPT browser sign-in flow against current Apple login-services rules, including any applicable exception; this handoff makes no review-approval or exemption claim. |
| Real provider use | Obtain an employer-authorized Lever integration and current reviewed posting requirements. Enable only the configured authorized postings. A real submission still needs the applicant's explicit approval; only documented provider acceptance plus its application ID can establish a live verified receipt. |

## Primary store references

Checked on 16 November 2026:

- [Apple account deletion guidance](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion): account deletion must be reachable from the app; when completed on a website, use a direct link and explain delays.
- [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/): disclosures must reflect actual off-device collection, including data retained for core functionality.
- [Apple App Review Guidelines, §4.8](https://developer.apple.com/app-store/review/guidelines/#login-services): evaluate equivalent login options and the listed exceptions for the actual primary-account flow.
- [Google Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en): assess the in-app deletion path, web resource and Data safety responses for account creation reached from the app.

Root owns hosting, packaging and source publication. The established publisher owns physical-device/signing/store work. This handoff does not replace those separate completion records.
