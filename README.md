# Career Finder

Native career and application workspace for **iPhone and Android phones**. Find jobs on selected public employer boards, save opportunities, keep your own profile and PDF résumé, and review applications before using a supported **Auto Apply** integration.

**Status: 0.4.0 phone candidate with a published HTTPS service, 16 November 2026.** Version 0.4 adds public job discovery and phone usability improvements. The [current polish review](docs/Phone-Polish-Review-2026-11-16.md) separates executed checks from pending final-source CI, signed-in phone acceptance and distribution. The [earlier reliability review](docs/Phone-Quality-Review-2026-11-16.md) and [initial phone update](docs/Phone-Update-2026-11-16.md) retain their original evidence. No real employer applications were sent during development.

## Hosted phone connection

The current phone source candidate is **0.4.0**, targeting iOS 16 or newer and Android 8 or newer. Published preview downloads, with their own versions and checks, are in the [project releases](https://github.com/swonyu/ahmad-career/releases). A published earlier APK does not include later candidate changes. The iPhone source preserves its existing app identity for the authorized publisher.

The development-preview service is live at **[Connect Career Finder](https://career-finder-service.jazzy-drake-8323.chatgpt.site/connect)**. Hosted version 2, including the discovery API, deployed successfully and passed 13 public production checks. It uses the available managed hosting; no separate paid account, subscription or domain purchase was started.

Public discovery does not require sign-in. To save a private hosted workspace, sign in with ChatGPT, create a one-use code, then connect your phone. Each account owns its workspace. New users start with a blank profile and can choose their own country, profession and career level. Automatic submissions must use the account email; this associates the applicant with the account and does not verify their legal identity or qualifications. The account page provides upload recovery, phone revocation, PDF downloads, export and cloud deletion.

[Privacy](https://career-finder-service.jazzy-drake-8323.chatgpt.site/privacy) · [Help](https://career-finder-service.jazzy-drake-8323.chatgpt.site/support) · [Manage account](https://career-finder-service.jazzy-drake-8323.chatgpt.site/account)

The hosted candidate passed 25 discovery regression groups and 29 application/storage groups, plus eight discovery and eight application requests through the actual workerd runtime. These use local D1/R2 and synthetic dependencies. [Version 2 production observations](docs/hosted-production-polish-verification.json) separately record real public search, pagination, filtering, pages, storage readiness and access boundaries. The [earlier version 1 observations](docs/hosted-production-http-verification.json) remain preserved. Neither public check set establishes a signed-in phone flow; see the [release handoff](docs/HOSTED-RELEASE-HANDOFF.md).

The preview currently permits 250 workspaces, five PDFs/25 MiB per workspace and bounded application records. No employer credentials are configured, so live Auto Apply remains disabled until an authorized integration is connected. Hosting and provider quotas do not imply unlimited or perpetual free service.

## What the phone apps do

- Search selected public Greenhouse and Lever employer boards with role keywords, location text and a remote-only option. Choose catalog sources or enter a supported employer-board link.
- Start with a blank personal profile; choose your own country, location, career level, roles, skills and work preferences.
- Keep phone drafts and select an actual PDF résumé, up to 5 MiB.
- Preserve unsaved profile edits when the service changes, compare both versions, and make a deliberate choice before saving over newer information.
- Save discovered jobs or employer links from any country or profession. Existing iPhone saved roles and application history remain available, with an explicit handoff into the application workspace.
- Connect the hosted service through browser sign-in and a short-lived, single-use code, or use your own compatible HTTPS service. Store its token in platform secure storage.
- Review the exact applicant details, selected résumé, employer-specific message, explicit data choices and eligible jobs before approving Auto Apply.
- Track confirmed, uncertain, rejected, rate-limited and stopped outcomes. Reopen reviews after restarting the phone app. Only already-approved eligible work can continue automatically; retrying a rate-limited job requires fresh approval after its cooldown.
- Export receipt evidence without résumé bytes, employer keys or phone credentials.

The 0.4 candidate improves first-run guidance, search and source feedback, draft recovery, profile editing and accessibility labels. iPhone opportunity drafts can be saved, resumed or deliberately discarded. Android separates required profile essentials from optional details and adds receipt search and status filters. Platform differences and exact checks are documented in the [polish review](docs/Phone-Polish-Review-2026-11-16.md).

The earlier reliability protections remain: delayed responses cannot replace newer drafts or another connection's data, genuine single names are supported, and an explicit “No” to future marketing contact remains a valid answer. Android offers deliberate offline-draft import and preserves unreadable encrypted files during recovery.

**Verification has a specific meaning:** a confirmed live receipt requires a supported employer API's documented success response and a nonempty application ID. It establishes API acceptance, not a recruiter decision. Saving a job, opening an employer link or marking a manual application cannot create one. Android's “Applied elsewhere” record is explicitly self-reported; test and unknown evidence do not count as live verified receipts.

## Job discovery and coverage

The starter catalog contains seven selected employer boards across technology, logistics, music, clinical research, education, mental health and autonomous transport: Canonical, DoorDash, Spotify, Freenome, Duolingo, Lyra Health and Zoox. A search can use up to four catalog or custom supported boards. Results link to the provider's identified posting, show source attribution and check times, and distinguish partial outages and stale cached data from a successful empty search.

This is useful discovery across the selected employers' regions and professions, with no country or profession whitelist. It is not an exhaustive worldwide job index. Each board is capped at 500 validated jobs and each results page at 50. Missing country or remote-work evidence stays unknown; the app does not infer work authorization or eligibility. The interface is English. Earlier six-source Saudi research records remain compatibility/history data and are no longer the primary search experience.

Search is explicit and sends no applicant profile or PDF. Keywords and location filters are not stored in the workspace or board cache or forwarded to employers, although ordinary hosting request logs may contain the search URL. See the [discovery contract](hosted/server/discovery-contract.json), [service limits](hosted/README.md#public-job-discovery) and [public-board observations](hosted/tests/discovery-public-sources.json).

## Automatic submission coverage

The initial connector supports the official Lever Postings API, separately for global and EU employers. Each employer needs an authorized key and current, explicitly reviewed posting requirements. Unknown or unsupported custom questions block automatic submission. Other employer links remain useful for manual applications.

Public job discovery and automatic submission have different coverage. A publicly readable Greenhouse or Lever board does not authorize submission. Live Auto Apply remains disabled on the hosted preview because no employer credentials are configured; employer links remain available for manual application.

## Source layout

| Area | Purpose |
| --- | --- |
| [apple/](apple/) | Native SwiftUI iPhone app, iOS 16+, existing identity and records preserved |
| [android/](android/) | Native Kotlin/Jetpack Compose phone app, Android 8/API 26+ |
| [hosted/](hosted/) | Hosted HTTPS service, private account recovery, D1 records and private R2 PDFs |
| [website/applications/](website/applications/) | Separate Node/SQLite application service and private pairing CLI |
| [Application contract](docs/Verified-Applications-Contract.md) | Auth, immutable reviews, dispatch states, consent and receipt evidence |
| [postman/](postman/) | Real HTTP acceptance collection using a synthetic local Lever dependency |
| [Phone polish review](docs/Phone-Polish-Review-2026-11-16.md) | Current 0.4 candidate features, executed evidence and remaining acceptance |
| [Earlier phone quality review](docs/Phone-Quality-Review-2026-11-16.md) | Preserved reliability findings and dated evidence from earlier candidates |
| [Initial phone update](docs/Phone-Update-2026-11-16.md) | First candidate's implementation, source provenance and dated evidence |

The pre-existing website and Mac source remain for compatibility and history. This candidate targets phones. GitHub source changes do not deploy the existing website.

## Build and verify

### iPhone

Open `apple/AhmadCareer.xcodeproj`, select the **AhmadCareer** scheme and an iPhone destination. The project targets iPhone/iPhone Simulator only. Preserve bundle identifier `com.ahmadalayed.career` and use the authorized signing team for device distribution.

The native harness exercises the production client and stores with injected transport and credentials and real temporary persistence. Run:

```sh
bash apple/Checks/check-mobile.sh
```

See [exact executed Apple evidence](apple/Checks/mobile-verification.json) and the [Apple setup](apple/README.md) for the checked source hashes, current scenarios and limitations. Static checks, a linked Xcode app build, simulator UI execution and physical-device acceptance are separate forms of evidence. The new hosted iPhone UI job is defined for this candidate; its authored tests are not a passing run until the final CI records one.

### Android

From `android/`, with JDK 21 and Android SDK 36 installed:

```sh
./gradlew --no-daemon --max-workers=2 :app:assembleDebug :app:lintDebug
bash checks/run-policy-checks.sh
```

The checked-in Gradle wrapper verifies its pinned distribution checksum. See [Android setup and evidence](android/README.md) for exact package identifiers, build results and device checks. Release signing is not configured.

### Application service

Use Node with the built-in SQLite module; Node 24.22 and Node 26.13 were exercised. From `website/`:

```sh
npm test
npm run test:applications
npm run applications
```

The service binds to `127.0.0.1:8780`. Phones require a separately configured HTTPS gateway preserving the exact authorized Host. No employer connector is enabled by default. Read the [service setup](website/applications/README.md) before pairing.

For the official local HTTP acceptance suite, from the repository root with Postman CLI installed:

```sh
node postman/fixtures/run-acceptance.mjs
```

Fixtures are visibly synthetic, use a separate test ledger and cannot count as live applications. [Recorded Postman results](postman/verification.json): 29 HTTP calls across 28 request definitions, 36 assertions, zero failures.

For the isolated HTTPS service diagnostic:

```sh
node website/applications/fixtures/tls-check.mjs
```

This uses an ephemeral private CA and a synthetic local provider. The ordinary Android preview and release build retain normal TLS trust. Only the separately identified acceptance build may trust the fixture CA for the emulator host. See [native HTTPS acceptance](website/applications/fixtures/README.md).

The [Phone quality workflow](.github/workflows/phone-quality.yml) now defines five jobs: Node service/HTTPS checks, hosted storage/discovery/Worker checks, Android compilation/lint, iPhone logic plus an unsigned **Release** build, and isolated iPhone simulator UI acceptance. The earlier four-job [run 43895371363](https://github.com/swonyu/ahmad-career/actions/runs/43895371363) passed on baseline `06f5e8a069c7debe94becf04ce73d997f9cde747`; it does not validate the later 0.4 changes or new fifth job. Final-candidate CI is pending. Hosted Mac runners are isolated from the shared local Apple build schedule; the local build-slot restriction remains in force.

## Data and release readiness

Connected use sends a profile and selected résumé to the configured application service, and approved fields/CV to the supported employer. The private service ledger retains immutable dispatch snapshots and receipt evidence. Local legacy records remain separate.

HTTPS hosting, account onboarding/recovery, bounded storage, account-erasure operations and service privacy/support pages are implemented. Hosted version 2 is deployed and public acceptance passed. Final 0.4 source CI and a signed-in production phone flow remain pending. Before store distribution, complete operator/contact and store disclosures, native device/accessibility QA, signing and store review. Enable live Auto Apply only after an authorized employer integration and its acceptance are established. The [release handoff](docs/HOSTED-RELEASE-HANDOFF.md) records the remaining gates without treating historical store builds as this candidate.

Historical releases, TestFlight observations and earlier checks are preserved in [project history](docs/Project-History-Through-2026-11-15.md) and [Apple history](docs/Apple-History-Through-2026-11-15.md). They are not fresh evidence for this candidate.
