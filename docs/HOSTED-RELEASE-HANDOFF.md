# Career Finder release handoff

**Checkpoint: 17 November 2026.** The current 0.6 candidate adds phone navigation, private application tracking, the browser phone app and further reliability/security corrections. Final candidate CI and publication are in progress. This document separates source implementation, executed tests, live deployment and store availability.

## Current release state

| Area | Observed status |
| --- | --- |
| Public name | **Career Finder**. Fresh profiles are blank. Internal app/storage identities remain stable for existing records. |
| Hosted service | Public version 4 is deployed at [Career Finder](https://career-finder-service.jazzy-drake-8323.chatgpt.site), source `0bff0a2885c9b0e51d4270b7f0e9c32d83d8ae2d`, deployment `appgdep_6afb82c7891c8191a11516c1f5de9595`. |
| New phone browser app | Saved hosted version **6**, source `d0ba1810c2a07fa84b4d2b88e6e56f8c80ad3470`. Full dependency audit reports zero findings; final typecheck/build passed with `/` and `/phone` classified dynamic. The refreshed D1/R2/Worker, model/API/dispatch and vault checks passed locally. Deployment and actual browser acceptance remain pending. [Package receipt](strict-review-evidence/phone-web-sites-package-v6.json). |
| Published 0.6 checkpoint | Source `bc68f1a38cd705eb5d789874bff471f03e084549`, [CI run 43979963388](https://github.com/swonyu/ahmad-career/actions/runs/43979963388). Service, Android and iPhone logic/unsigned build passed; hosted verification/build passed but its new full dependency audit failed. The corrected version 6 dependency source requires a new exact-head CI run. The iPhone UI outcome is tracked in the strict ledger. |
| Latest published source before 0.6 | Feature head `3c25a963db4fa10e8162641cbd0ec396e127c06c`. Its [CI attempt](https://github.com/swonyu/ahmad-career/actions/runs/43970712465) failed: Android dependency HTTP 429, and two of nine iPhone UI cases. The failures are preserved; new fixes require fresh CI. |
| Android 0.6 | 91 policy checks and all 83 native tests passed, with zero lint issues. All 13 final captures were inspected; the exact source/APK/signature evidence is in [navigation verification](../android/checks/navigation-verification.json). The latest public download remains the historical 0.4 preview until the new asset is published. |
| iPhone 0.6 changes | The exact `bc68f1a` source passed logic and unsigned build, then passed **9 of 13 UI cases**. The prior draft/relaunch and availability repairs passed; four remaining navigation/presentation assertions failed and are under investigation. [Exact outcomes](strict-review-evidence/ci-bc68-native-test-results.json). |
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
4. Deploy the matching hosted source/archive, preserve its public audience and confirm terminal success. Record any browser-verification limit separately from deployment success.
5. Update current links and evidence after observing publication. A source change, a successful package, a release upload and a verified public download each require their own result.

The current security update patches both the top-level React server package and the Vite plugin's bundled copy. The dependency audit also led to a patched schema validator and compatible transitive updates. Exact installed versions and final audit/build outcomes are in the strict review; the earlier version 4 deployment is not relabeled as patched before the new deployment succeeds.

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
