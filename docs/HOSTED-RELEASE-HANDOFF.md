# Career Finder release handoff

**Checkpoint: 17 November 2026.** Hosted version 6 is deployed with the phone browser app and reliability/security corrections. Live browser acceptance is in progress. The 0.6 native candidate adds phone navigation and private application tracking; final native CI and publication remain pending. This document records source implementation, executed tests, live deployment and store availability separately.

## Current release state

| Area | Observed status |
| --- | --- |
| Public name | **Career Finder**. Fresh profiles are blank. Internal app/storage identities remain stable for existing records. |
| Hosted service | Public version **6** is deployed at [Career Finder](https://career-finder-service.jazzy-drake-8323.chatgpt.site), source `d0ba1810c2a07fa84b4d2b88e6e56f8c80ad3470`, deployment `appgdep_6afb9a2791e88191801449c36c9f2248`. Terminal success was observed at `2026-11-17T00:05:24.410309Z`. [Deployment receipt](strict-review-evidence/phone-web-hosted-deployment-v6.json). |
| Phone browser app | Available at `/` and [`/phone`](https://career-finder-service.jazzy-drake-8323.chatgpt.site/phone). Final typecheck/build passed with both routes classified dynamic. Refreshed D1/R2/Worker, model/API/dispatch and vault checks passed locally. **Actual live browser acceptance is in progress; no pass is claimed.** [Package receipt](strict-review-evidence/phone-web-sites-package-v6.json). |
| Published hosted correction | Feature commit `5efda90fd5ac58b4d8b8641466056bbd0dc6bbd3`. Its [hosted job 133706762047 in CI run 43983824827](https://github.com/swonyu/ahmad-career/actions/runs/43983824827/job/133706762047) passed, including the complete dependency audit with zero findings. This commit preserves the earlier native inputs; it is not a passing runtime result for the later iPhone repairs. |
| Earlier 0.6 checkpoint | Source `bc68f1a38cd705eb5d789874bff471f03e084549`, [CI run 43979963388](https://github.com/swonyu/ahmad-career/actions/runs/43979963388), remains a **failed** run. Service, Android and iPhone logic/unsigned build passed; hosted verification/build passed before the full dependency audit failed. The iPhone UI run passed 9 of 13 cases. Both failures remain preserved in the strict ledger. |
| Latest published source before 0.6 | Feature head `3c25a963db4fa10e8162641cbd0ec396e127c06c`. Its [CI attempt](https://github.com/swonyu/ahmad-career/actions/runs/43970712465) failed: Android dependency HTTP 429, and two of nine iPhone UI cases. The failures are preserved; new fixes require fresh CI. |
| Android 0.6 | 91 policy checks and all 83 native tests passed, with zero lint issues. All 13 final captures were inspected; the exact source/APK/signature evidence is in [navigation verification](../android/checks/navigation-verification.json). The latest public download remains the historical 0.4 preview until the new asset is published. |
| iPhone 0.6 changes | The exact `bc68f1a` source passed logic and unsigned build, then passed **9 of 13 UI cases**. The prior draft/relaunch and availability repairs passed. Corrections for the four failed cases are frozen in three source files and independently reviewed; a **fresh exact-source 13-case run is pending**. [Original outcomes](strict-review-evidence/ci-bc68-native-test-results.json), [repair review](strict-review-evidence/iphone-bc68-ui-repair-review.json), [independent review](strict-review-evidence/iphone-bc68-ui-repair-independent-review.json). |
| Store distribution | No current 0.6 TestFlight/App Store or Google Play publication is established. Android preview signing and unsigned iPhone CI builds do not establish production distribution. |
| Live submission | Production remains `liveEnabled: false`; no employer credentials are configured. All submission tests use synthetic providers. |

See the [strict critique and evidence ledger](Strict-Review-2026-11-17.md), [application contract](Verified-Applications-Contract.md), and [hosted implementation guide](../hosted/README.md). The [previous 0.4 handoff](Hosted-Release-Handoff-0.4-History.md) retains its dated source, APK, CI, public discovery and initial account observations.

## What people can use

The native apps and browser interface support discovery and local preparation without an account. Search covers selected Greenhouse and Lever boards, with up to four boards per search and visible freshness/source information. It is not a complete worldwide job index. The UI is English; users can supply their own country, profession, CV and links.

The 0.6 tracking flow keeps a stage, dates and private notes. Removing a bookmark preserves its record; closing a record preserves its applied mark. Conflicting and historical native records are retained. Copying earlier phone information into a connected workspace is explicit and bound to its exact account/workspace. A manual mark is never converted to a verified employer receipt.

The phone browser interface has Search, Saved, Apply and Profile. It separates local and online saves, preserves account-specific encrypted drafts, rejects competing-tab writes, provides recovery exports and uses a deliberate data-reset confirmation. Identity changes hide private content and invalidate stale intent. A home-screen install is a browser feature; the app needs a network connection to open and confirm a signed-in identity.

## Sign-in and external integrations

Google is available on the ChatGPT sign-in screen used by the public service. Career Finder does not own a separate Google OAuth client or receive a Google password. Native apps redeem a five-minute, single-use code. Browser workspace actions use platform identity and exact expected account/workspace checks.

LinkedIn support is an optional saved personal-profile URL and an explicit handoff to LinkedIn job search. It does not verify the LinkedIn account, import employment history or submit LinkedIn applications. A true OAuth integration requires an authorized LinkedIn developer app, approved product access and usable credentials. No missing credential or access approval is represented by a fake connected state.

Live Auto Apply requires an authorized supported employer integration and reviewed application requirements. The initial connector is Lever global/EU. Public job discovery does not grant submission permission. Exact applicant review remains mandatory after activation. A confirmed live receipt requires the documented provider success and application identifier; unknown outcomes remain uncertain and cannot be automatically resent.

## Final release gates

1. Freeze and fingerprint the candidate source, including the exact hosted mirror, native source, migrations and dependency lock.
2. Run all five Phone quality gates for that source: companion/synthetic HTTPS; hosted D1/R2 and actual Worker; Android compilation/lint; iPhone isolated logic and unsigned Release; isolated iPhone UI acceptance. Retain failed attempts and attach actual results.
3. Review Android final runtime captures and bind the released APK to its source, version, package and existing certificate. Publish a new immutable tag/asset without replacing the 0.4 release.
4. Complete live browser acceptance for deployed hosted version 6. Its matching source/archive, preserved public audience and terminal deployment success are already recorded; browser acceptance remains a separate gate.
5. Update current links and evidence after observing publication. A source change, a successful package, a release upload and a verified public download each require their own result.

The current security update patches the dependency tree and retains a complete locked-dependency audit. Exact installed versions and final audit/build outcomes are in the strict review. The corrected source is now deployed as version 6 and passed the hosted GitHub CI gate; the earlier version 4 deployment and failed audits remain historical evidence. A clean audit records known-advisory findings for the identified tree and does not replace runtime acceptance.

## External activation and distribution

| Gate | Required concrete evidence |
| --- | --- |
| Physical phones | Intended iPhone/Android devices must exercise browser return, PDF picker, local recovery, account changes, large text/screen reader, receipt export and deletion. Simulator tests remain separately labeled. |
| Apple distribution | The authorized publisher verifies bundle `com.ahmadalayed.career`, existing store record, signing, exact version/build mapping, archive/install and actual processing/TestFlight/store outcomes. Shared local Apple tooling must remain coordinated with its owner. |
| Google Play | Preserve production identity `com.saleh.careerfinder`; obtain/verify the authorized production signing and publishing setup. The `.preview` and `.acceptance` variants are separate. |
| LinkedIn OAuth | Authorized developer-app access, approved products/scopes and configured callback/credentials, followed by real consent and revocation checks. |
| Employer submissions | Employer-authorized credentials and reviewed supported posting requirements, followed by a deliberately authorized real acceptance check. Development must not send unsolicited applications. |
| Store disclosures | Reconcile the distributed code, actual login route, account deletion, privacy disclosures, support contact and current store requirements. Do not imply an approval or exception that has not been granted. |

The public host uses existing managed HTTPS. No separate paid account, domain purchase or paid upgrade was started. Preview quotas remain 250 workspaces and bounded per-workspace files/records. Account deletion removes active service records and CV contents; it does not erase local downloads or employer-held applications. Empty opaque upload/reset markers prevent delayed writes from restoring deleted information.
