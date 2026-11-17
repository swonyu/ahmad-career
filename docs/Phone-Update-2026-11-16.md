# Career Finder phone update

Initial development candidate, 16 November 2026, commit `396cc370d98a0ee48f8cc2ac89312de08a3dec74`. Target platforms: **iOS and Android phones**.

This page records the first candidate. See the [phone reliability follow-up](Phone-Quality-Review-2026-11-16.md) for subsequent fixes and current checks. Evidence links below are pinned to the original commit so they retain their historical meaning.

## Current continuation — 17 November 2026

The repaired phone baseline `6f95db3a09a60be8f0b325c8ad01cdcd305dd8de` now has a successful [five-job run 43986038118](https://github.com/swonyu/ahmad-career/actions/runs/43986038118), including **all 13 iPhone UI cases**. The additional continuation changes require their own exact-source acceptance; the live site is now version 7 and provider activation and store distribution remain separate gates. Read the [continuation review and acceptance ledger](Continuation-Review-2026-11-17.md) for the current findings, implementation status, provider setup and coordinated release boundaries. The original candidate and evidence below remain historical.

The final local continuation checks pass **61 account groups**, **19 phone groups / 164 Worker requests**, **64 frontend + 14 browser transport tests**, **33 vault groups**, **26 discovery groups**, **30 auth groups + 15 auth Worker requests**, and the separate 17-request Worker gate; the complete hosted audit has **zero findings**. Companion checks pass 119 HTTP groups, 77 application-state groups and 12 TLS checks; Android passes 122 policy checks. Authoritative hosted source is pushed at `1135a3270435d3719c6f62f1a2e3a53e2c040146`, and its production build passed. Phone candidate `4bbe5a5087378d6a9bfe3f1cac956233b5d6ba71` passed all 13 iPhone UI cases and both service jobs in [run 44014455183](https://github.com/swonyu/ahmad-career/actions/runs/44014455183). The Android production Debug build passed, but instrumentation test compilation and an iPhone lifecycle expectation need the prepared test corrections. A screenshot review also found and corrected a red success notice and a truncated large-text title; the follow-up needs fresh UI acceptance. **Android 97 ordinary + 2 TLS acceptance, the corrected complete CI run and full device/browser acceptance remain pending.** The continuation ledger explains the tested account deletion races and the separate durable owner and ten-minute provider fences.

**Next native checkpoint:** at `66669da8bd34943ad3fc9dae45e9a8288ff0d9e7`, [run 44018512141](https://github.com/swonyu/ahmad-career/actions/runs/44018512141) passes both service jobs and the complete iPhone logic/unsigned Release job, including 503 lifecycle assertions across 77 scenarios. Android production/instrumentation compilation and lint pass; its ADB startup failed before phone tests ran. The isolated local-socket correction and additional large-text presentation polish are prepared, with all acceptance cases retained. This run's iPhone UI job passed all 13 tests with zero failures; the new follow-up requires its own complete CI result.

## Delivered behavior

The update adds native application workspaces to the existing iPhone app and a new Kotlin/Jetpack Compose Android app. Everyone starts with a blank applicant profile. The person chooses their own name, location, country, roles, skills, work modes and career level; no historical biography or presumed qualification becomes their application.

Phone users can save opportunities from any profession or country, select an actual PDF résumé, connect a personal workspace, review eligible applications, approve Auto Apply and inspect recorded outcomes. The iPhone app preserves existing saved roles and self-entered application history. The Android app keeps phone-only drafts separate from connected workspaces in encrypted storage.

The current interface is English. Country selection and manually saved opportunities are global; live job discovery is not a worldwide feed. Existing iPhone discovery still samples six selected Saudi employer sources. Neither distribution country nor a matching keyword establishes that a vacancy is supported or that a candidate is qualified.

## Auto Apply and receipt verification

The phone prepares a review; it does not decide whether an employer accepted an application. The application service creates an immutable plan containing the actual applicant fields, résumé metadata, employer-specific comments and explicit data choices. The person approves that plan before dispatch. Editing profile or review details invalidates prior approval.

The first connector implements Lever's [official Postings API](https://github.com/lever/postings-api), with separate global and EU endpoints. Each employer requires its own authorized integration key and a current reviewed posting-requirements manifest. The public posting API cannot establish that every custom application question is supported. Missing, expired, unknown or unsupported requirements block automatic dispatch and leave the employer's manual application route available.

A live submission becomes confirmed only after the documented HTTP 200 response contains both `ok: true` and a nonempty provider application ID. The receipt establishes provider API acceptance. It does not establish recruiter review, eligibility, an interview or an offer.

The ledger stores the attempt before sending and records profile revision, résumé and payload fingerprints, requirements revision, provider response fingerprint and timestamps. Export excludes CV bytes and authentication secrets. Clients cannot manufacture confirmation by supplying a status or opening a link.

### Failure and recovery behavior

- Confirmed and uncertain attempts block automatic duplicates for the same applicant and posting, including a changed email or copied profile with the same email.
- Timeouts, redirects, malformed success responses and ambiguous server failures remain uncertain. A lost submit response triggers observation rather than an automatic second POST.
- A service restart turns interrupted dispatches into uncertain records; it does not replay them.
- Explicit provider rate-limit rejection records a cooldown. A new review or cancellation cannot bypass it. Retrying requires deliberate review/approval and respects the bounded dispatch count.
- Stop affects work that has not yet been sent. An in-flight application retains its actual outcome; stopping a previously rejected retry does not claim that no request ever occurred.
- Current eligible reviews can be reopened after a phone restart. Recovery restores the original digest and current item states without approving or sending them.
- A newer unsaved phone profile must be resolved before submission. Stale profile saves cannot silently overwrite a newer server revision.

## Native phone implementation

### iPhone

The SwiftUI app has Start, Search, Apply, Saved and Profile tabs. Apply opens the new application workspace. The earlier application-plan screen remains accessible from Start. Existing local records remain separate from provider receipts, and known manually applied roles require reconciliation before automatic submission.

The project targets iPhone/iPhone Simulator, minimum iOS 16. It preserves bundle identifier `com.ahmadalayed.career` and existing version/signing metadata. This candidate does not allocate a new release build number or modify an Apple account.

The iPhone icon now uses the same general Career Finder document/check mark as Android. Its SVG source is kept in the repository, and the iOS export is an opaque 1024 × 1024 RGB asset. The historical Mac icons remain unchanged.

Keychain holds the bearer credential with device-only accessibility. Atomic draft files use iOS file protection. Unreadable saved drafts are preserved rather than overwritten. PDF selection uses the system document picker; the app validates actual bytes, name and size. Native controls use system text styles, accessibility labels and light/dark system surfaces.

### Android

The native Kotlin/Compose app targets Android phones, minimum Android 8/API 26. It uses Material controls, bottom navigation, light/dark styling, scalable text and right-to-left layout support. Android Keystore-backed AES-GCM protects connection and draft records with independent storage identities; device backup is disabled.

The reproducible Gradle wrapper pins and verifies the Gradle distribution checksum. Debug application identity is `com.saleh.careerfinder.preview`; the release identity is `com.saleh.careerfinder`. Release signing and a Google Play listing remain unconfigured. See [Android build instructions and evidence](https://github.com/swonyu/ahmad-career/blob/396cc370d98a0ee48f8cc2ac89312de08a3dec74/android/README.md).

## Executed checks

| Check | Observed result | What it establishes |
| --- | --- | --- |
| Existing website/tracker regression suite | Passed, including 77 application-state groups | Existing logic, preferences, records, feed boundaries and server behavior remained compatible |
| New service HTTP regression suite | 77 groups passed | Actual local HTTP, multipart PDF bytes, auth/isolation, revision and requirement gates, duplicate protection, failures, stop, cooldown and restart recovery |
| Official Postman CLI acceptance | 28 HTTP requests; 36 assertions; zero failures | Actual companion through a synthetic local Lever dependency, including one-use phone pairing and bearer isolation |
| Postman collection lint | 28 definitions; zero errors or warnings | Collection structure is valid |
| iOS Foundation executable | 40 checks passed | Actual native boundary policy and serialization behavior |
| iOS complete Swift static typecheck | All 9 app Swift sources; exit 0; zero diagnostics | Source typechecks for arm64 iOS 16 using the installed iPhoneOS 27.2 SDK |
| Android boundary policy executable | 36 checks passed on Linux and macOS | Actual Java policy used by the app handles secure URLs, PDF boundaries, workspace separation and receipt evidence |
| Android native build | Debug application and instrumentation APK assembled successfully | Exact current Kotlin/Java/resources compile and package with the pinned toolchain |
| Android lint | Zero errors; six dependency/idiom advisories | Static Android checks completed without blocking findings |
| Android phone emulator acceptance | 3 tests passed on an isolated API 36 ARM Pixel 7 emulator | Blank/connection states, encrypted profile persistence after activity recreation, and Keystore ciphertext/AAD isolation |

The service test result is tied to SHA-256 `14a9423b3b5771760feb629861b5c86773886d0655c074e6b469ff147b720a0a` for `website/applications/service.mjs`. Formal HTTP proof and all captured runtime hashes are in [postman/verification.json](https://github.com/swonyu/ahmad-career/blob/396cc370d98a0ee48f8cc2ac89312de08a3dec74/postman/verification.json) and [runtime-manifest.json](https://github.com/swonyu/ahmad-career/blob/396cc370d98a0ee48f8cc2ac89312de08a3dec74/postman/runtime-manifest.json). Exact iOS commands, source hashes and limitations are in [mobile-verification.json](https://github.com/swonyu/ahmad-career/blob/396cc370d98a0ee48f8cc2ac89312de08a3dec74/apple/Checks/mobile-verification.json).

Postman independently observed exactly two synthetic application POSTs, one per application, with actual multipart PDF bytes. Replays caused no further provider POST. Fixture evidence is marked `test` and excluded from live application totals. No live employer POST occurred. Passing this modeled protocol does not establish live provider compatibility.

The iOS check was static plus a Foundation executable, not a linked Xcode project build or rendered device test. The shared Apple build and simulator schedule was preserved. No iOS signing, archive or upload was performed for this candidate. Android's debug APK is signed with a local development key; it is a test installer, not a Play Store release. Neither platform was published to a store. Exact Android source/build/device evidence is in [android/checks/verification.json](https://github.com/swonyu/ahmad-career/blob/396cc370d98a0ee48f8cc2ac89312de08a3dec74/android/checks/verification.json).

## Activation and public release requirements

The companion listener binds to loopback. Phones require an owner-controlled HTTPS gateway forwarding the exact configured Host; there is no bundled cleartext or certificate bypass. No public application service or gateway has been deployed by this update. No real employer credential is included.

The operator can issue a private five-minute, single-use pairing code through the CLI. A second phone can be paired to the same workspace explicitly. Tokens expire after 30 days and can be revoked. This establishes an integration path, not finished public self-service registration, account recovery or an abuse-resistant internet deployment.

Before live public use, complete:

1. **Hosting and operation:** configured HTTPS, monitoring, private ledger storage, backups/recovery, operator access and abuse controls.
2. **Authorized employer integration:** an employer-authorized key, reviewed current requirements and one separately authorized real application proving phone approval through durable provider receipt and phone reload.
3. **Candidate data lifecycle:** retention periods, full account erasure, recovery, appropriate storage protection and a clear process for immutable CV/application snapshots. Removing a current résumé does not erase historical submission snapshots. The database has private OS permissions; application-level database encryption is not implemented.
4. **Privacy and support:** publish accurate contact/support information and a policy describing transmission of applicant/CV data to the service and selected employers. The legacy local-only policy is insufficient for this connected feature.
5. **Native acceptance:** exact-source app builds, phone installation, document picker and keyboard behavior, offline and interrupted requests, recovery/conflicts, large text, VoiceOver/TalkBack, RTL, light/dark mode and receipt export. Validate existing iPhone record migration on a disposable test workspace.
6. **Distribution:** authorized signing, unique release build numbers, store metadata, platform privacy declarations, review and deliberate rollout.

## Source provenance

This candidate was developed in isolation from the active canonical checkout. Its baseline text files were matched against the canonical source before edits. A final comparison of all 64 baseline files, including original icon assets, confirmed that the canonical checkout remained unchanged. Existing general-audience phases 1 and 2 were carried forward. The upstream parent was `bcc4aae3258099b6e2277abdf07fa839d31dbee9`. The complete candidate is saved on the separate `career-finder-phones-verified-apply-20261116` branch and in an isolated local copy. The existing publishing checkout, historical app artifacts and public website were not replaced.

Publication to `swonyu/ahmad-career` was initially paused by automatic approval review. The owner then explicitly authorized uploading this candidate to that repository. Source publication is separate from deploying the service, submitting real applications or distributing a store release.

Prior releases and TestFlight observations remain in [project history](Project-History-Through-2026-11-15.md) and [Apple history](Apple-History-Through-2026-11-15.md). Their dates and evidence do not establish current phone-release readiness.
