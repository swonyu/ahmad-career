# Phone discovery and polish review

**16 November 2026 — version 0.4.0 candidate.** This review records broader public job discovery and phone usability work after source baseline `06f5e8a069c7debe94becf04ce73d997f9cde747`. Hosted version 2 is deployed and its public acceptance passed. Final candidate publication, five-job CI and phone distribution still need their own evidence. The [earlier reliability review](Phone-Quality-Review-2026-11-16.md) remains unchanged apart from its historical banner.

## What changed

| Area | Candidate behavior |
| --- | --- |
| Public discovery | Both phone clients use the shared unauthenticated Greenhouse/Lever discovery contract. Searches are explicit, with role keywords, location text, a remote option and up to four catalog/custom supported employer boards. Search sends no applicant profile, CV or account token. |
| Coverage and result quality | Seven starter boards span several sectors; custom supported boards extend the selection. Results carry stable provider/posting identities, canonical links, plain text, source attribution and check times. Missing country/remote evidence stays unknown. Partial source outages, capped results and stale cache are disclosed. |
| Search resilience | Clients reject obsolete responses after filters or connections change, support cancellation and pagination, and require a deliberate restart when the server's page snapshot changes. A failed search is not presented as a proven absence of vacancies. |
| iPhone first run and saved work | Start links to public discovery, a new opportunity draft and the actual shared applicant profile. Optional local planning notes are labeled separately. Saved includes the application workspace and earlier local records, with explicit copy-to-Apply that preserves the original notes and status. |
| iPhone drafts and layout | Add-opportunity sheets support save draft, keep editing and discard; background checkpoints and relaunch restoration preserve unfinished work. A successful save consumes only its matching draft. Stable semantic IDs, an adaptive picker, wrapped résumé text and dark-mode accent adjustments improve navigation and layout. |
| Android profile and saved work | Name, email and PDF are presented as the concrete essentials; optional details can collapse and target countries can be searched. Single names and unfinished drafts remain supported. Save-only discovery handoff rejects duplicate URLs. “Applied elsewhere” is explicitly self-reported and invalidates an obsolete review without creating a receipt. |
| Android receipts and guidance | Receipt search and All/Verified/Needs attention/Pending/Stopped/Test filters help find records. Test/unknown evidence never counts as live verified. Contextual guidance explains disabled live submission and retains the manual employer path. Accessibility labels identify actions more specifically. |
| Browser setup and recovery | Bounded request timeouts, cancellation, stale-response fences and session-expiry guidance protect the connection/account pages. Failed or ambiguous writes are not silently replayed. Install and support guidance distinguishes source/preview availability from store distribution. |

The public name is **Career Finder**, the interface is English, and fresh users begin with blank personal profiles. Existing app identities and stored history are preserved. The primary discovery experience is no longer restricted to the earlier six Saudi research sources; those records remain historical/compatibility material. Selected public boards do not constitute an exhaustive worldwide feed or establish an applicant's eligibility.

## Discovery limits and privacy

The [version 1 discovery contract](../hosted/server/discovery-contract.json) is separate from the app's 0.4 version. Each search selects at most four sources, each source contributes at most 500 validated jobs, and pages contain at most 50 results. The service uses fixed provider API hosts, strict board/posting URL validation, refused upstream redirects, bounded fetches and durable request budgets. It does not scrape authenticated pages or use unofficial submission APIs.

Public board metadata is shared in a ten-minute cache. After a refresh failure, an older result may remain visible for at most 24 hours with its original check time and a stale label. A deleted board clears its cached vacancies. Query/location terms are not stored in the account or board cache or forwarded to employers; ordinary hosting logs may include the URL. A search does not create a private workspace. See [service operating limits](../hosted/README.md) for cache, quota and account behavior.

Discovery and saving are separate from approval. The existing immutable profile/PDF review, explicit approval, duplicate prevention, guarded stop and uncertainty rules remain in force. Rate-limited work needs fresh approval after its cooldown. A confirmed live receipt still requires the supported API's documented acceptance and a nonempty application ID; a self-report, opened link, saved result or synthetic test cannot create one. Production continues to report `liveEnabled: false` because no authorized employer integration is configured.

## Executed evidence and its scope

| Evidence | Observed result and boundary |
| --- | --- |
| [Hosted discovery regression record](../hosted/tests/hosted-discovery-verification.json) | 25 groups passed, including eight actual bundled workerd requests. Covers normalization, cache/claim races, quotas, unknown metadata, pagination snapshots, deletion of stale boards and privacy boundaries. Uses actual local D1 with controlled upstream responses. |
| [Hosted application record](../hosted/tests/hosted-verification.json) and [runtime probe](../hosted/tests/hosted-worker-verification.json) | The existing 29 storage/application groups and eight workerd requests passed with the additive discovery migration. Exact-PDF storage, approval/429 timing, uncertain outcomes, concurrency, upload recovery and erasure fences remain covered. Provider dependencies are synthetic; no real applications were sent. |
| [Starter-board observations](../hosted/tests/discovery-public-sources.json) | Bounded, standard-TLS public GETs confirmed all seven catalog boards; six retired/unavailable candidates were excluded. These probes did not use account data or submit applications. |
| Browser and framework checks | Ten browser transport scenarios passed. App lint, framework typecheck and the deployable production build passed. These do not establish authenticated native production use. |
| [Apple exact evidence](../apple/Checks/mobile-verification.json) | Records executed client/store/discovery checks, Debug and Release static typechecks, source hashes and limitations. New offline XCUITest cases are authored and statically checked; an actual hosted UI run is still pending. See [Apple setup and current status](../apple/README.md). |
| [Android exact evidence](../android/checks/verification.json) | Records the exact preview build, policy/native checks, source identity, artifacts and limitations. See [Android setup and current status](../android/README.md); earlier version proof is kept under its historical directory. |
| [Version 2 production acceptance](hosted-production-polish-verification.json) | 13 public checks passed. The default four boards returned a complete fresh snapshot of 855 validated jobs at 15:51:36–42 UTC, a second page contained no duplicates, and the remote filter returned 349 matches. These are selected-source observations at that time. Pages, D1/R2 readiness, disabled live submission and anonymous/input/origin boundaries were checked without an account, CV or employer POST. |
| Prior published CI | [Run 43895371363](https://github.com/swonyu/ahmad-career/actions/runs/43895371363) passed four jobs for baseline `06f5e8a069c7debe94becf04ce73d997f9cde747`. It does not validate this later candidate. |

Hosted version 2 deployed from source `a2c82c51a37e570cedb6fd6b8459d208228fc578` at the existing [HTTPS origin](https://career-finder-service.jazzy-drake-8323.chatgpt.site). The [release handoff](HOSTED-RELEASE-HANDOFF.md) records deployment/package identifiers. Version 1's [production record](hosted-production-http-verification.json) and the hosted [0.3 application](../hosted/tests/history/v0.3.0/hosted-verification.json)/[runtime](../hosted/tests/history/v0.3.0/hosted-worker-verification.json) proofs remain distinct.

## What still requires acceptance

The [workflow](../.github/workflows/phone-quality.yml) now includes five jobs, adds isolated iPhone simulator UI execution and builds the production iPhone configuration as unsigned Release. The final candidate has not yet completed that workflow. The tests' existence is not a result, and a simulator run will not replace physical-device or screen-reader acceptance.

Signed-in production pairing, deliberate PDF upload, recovery, revocation/export/deletion and native phone use need an observed account flow. Wider device/accessibility checks, operator/contact disclosures, publisher signing, and actual TestFlight/App Store/Google Play outcomes remain separate gates. The local Apple build-slot acknowledgment remains required; hosted CI does not grant that local slot. Bundle IDs and existing publisher records are preserved, including the distinction between this candidate and historical store builds.

Live provider activation additionally requires employer-authorized credentials, reviewed posting requirements and the applicant's explicit approval. No real provider acceptance, exhaustive coverage, physical QA, store availability or perfect behavior is claimed by this review.
