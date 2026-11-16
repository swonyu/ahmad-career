# Career Finder

Native career and application workspace for **iPhone and Android phones**. The current update adds a personal profile, PDF résumé, opportunities from any country or profession, and an **Auto Apply** flow backed by durable provider receipts.

**Status: phone development preview with a published HTTPS service, 16 November 2026.** Current reliability work and exact executed checks are recorded in the [phone quality review](docs/Phone-Quality-Review-2026-11-16.md). The [initial phone update](docs/Phone-Update-2026-11-16.md) preserves the earlier candidate's evidence. Store distribution and employer-integration activation remain separate release steps. No real employer applications were sent during development.

## Hosted phone connection

The Android preview is **0.3.0** (Android 8 or newer); downloads are in the [project releases](https://github.com/swonyu/ahmad-career/releases). The iPhone source preserves its existing app identity for the authorized publisher.

The development-preview service is live at **[Connect Career Finder](https://career-finder-service.jazzy-drake-8323.chatgpt.site/connect)**. It uses the available managed hosting; no separate paid account, subscription or domain purchase was started.

Sign in with ChatGPT, create a one-use code, then connect your phone. Each account owns a private workspace. New users start with their own blank profile and can choose any country, profession and career level. Automatic submissions must use the account email. The account page provides recovery, phone revocation, PDF downloads, export and cloud deletion.

[Privacy](https://career-finder-service.jazzy-drake-8323.chatgpt.site/privacy) · [Help](https://career-finder-service.jazzy-drake-8323.chatgpt.site/support) · [Manage account](https://career-finder-service.jazzy-drake-8323.chatgpt.site/account)

The hosted backend passed 29 regression groups using actual local D1/R2 storage and an eight-request workerd runtime probe. Eight production HTTP checks verified public HTTPS pages, storage readiness, anonymous access denial and rejection of forged identity headers. These are separate from a signed-in production phone flow. See [production observations](docs/hosted-production-http-verification.json) and [release handoff](docs/HOSTED-RELEASE-HANDOFF.md).

The preview currently permits 250 workspaces, five PDFs/25 MiB per workspace and bounded application records. No employer credentials are configured, so live Auto Apply remains disabled until an authorized integration is connected. Hosting and provider quotas do not imply unlimited or perpetual free service.

## What the phone apps do

- Start with a blank personal profile; choose your own country, location, career level, roles, skills and work preferences.
- Keep phone drafts and select an actual PDF résumé, up to 5 MiB.
- Preserve unsaved profile edits when the service changes, compare both versions, and make a deliberate choice before saving over newer information.
- Save and search employer opportunities from any country or profession. Existing iPhone saved roles and application history remain available.
- Connect the hosted service through browser sign-in and a short-lived, single-use code, or use your own compatible HTTPS service. Store its token in platform secure storage.
- Review the exact applicant details, selected résumé, employer-specific message, explicit data choices and eligible jobs before approving Auto Apply.
- Track confirmed, uncertain, rejected, rate-limited and stopped outcomes. Reopen eligible reviews after restarting the phone app; resuming requires deliberate approval.
- Export receipt evidence without résumé bytes, employer keys or phone credentials.

The reliability follow-up protects drafts from delayed network responses and expired connections, keeps employer choices with their intended review, and permits a genuine single name. An explicit “No” to future marketing contact remains a valid answer. Android includes a deliberate offline-draft import and recovery that preserves unreadable encrypted files.

**Verification has a specific meaning:** a confirmed live receipt requires a supported employer API's documented success response and a nonempty application ID. It establishes API acceptance, not a recruiter decision. Opening an employer link or changing a local tracker status cannot create one.

## Automatic submission coverage

The initial connector supports the official Lever Postings API, separately for global and EU employers. Each employer needs an authorized key and current, explicitly reviewed posting requirements. Unknown or unsupported custom questions block automatic submission. Other employer links remain useful for manual applications.

This does not add a worldwide job-feed aggregator. The retained iPhone live discovery still uses bounded samples from six selected Saudi employer sources; its coverage is disclosed in the app. Worldwide opportunities can be added manually. The current interface is English.

## Source layout

| Area | Purpose |
| --- | --- |
| [apple/](apple/) | Native SwiftUI iPhone app, iOS 16+, existing identity and records preserved |
| [android/](android/) | Native Kotlin/Jetpack Compose phone app, Android 8/API 26+ |
| [hosted/](hosted/) | Hosted HTTPS service, private account recovery, D1 records and private R2 PDFs |
| [website/applications/](website/applications/) | Separate Node/SQLite application service and private pairing CLI |
| [Application contract](docs/Verified-Applications-Contract.md) | Auth, immutable reviews, dispatch states, consent and receipt evidence |
| [postman/](postman/) | Real HTTP acceptance collection using a synthetic local Lever dependency |
| [Phone quality review](docs/Phone-Quality-Review-2026-11-16.md) | Current fixes, executed evidence, native acceptance scope and remaining release work |
| [Initial phone update](docs/Phone-Update-2026-11-16.md) | First candidate's implementation, source provenance and dated evidence |

The pre-existing website and Mac source remain for compatibility and history. This candidate targets phones. GitHub source changes do not deploy the existing website.

## Build and verify

### iPhone

Open `apple/AhmadCareer.xcodeproj`, select the **AhmadCareer** scheme and an iPhone destination. The project targets iPhone/iPhone Simulator only. Preserve bundle identifier `com.ahmadalayed.career` and use the authorized signing team for device distribution.

The current source passed a full ten-file Swift typecheck for the iOS 16 target, 61 boundary checks, and 117 assertions across 25 deterministic workspace lifecycle scenarios. The lifecycle harness executes the production store with injected transport and credentials and real temporary persistence:

```sh
bash apple/Checks/check-mobile.sh
```

These checks are distinct from a linked Xcode app build and device UI acceptance. See [exact evidence](apple/Checks/mobile-verification.json).

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

The [Phone quality workflow](.github/workflows/phone-quality.yml) repeats the Node service and HTTPS checks, hosted D1/R2 regressions and Worker build, Android compilation/lint, the iPhone client/store harness, and an unsigned iPhone app build on relevant source changes. Its hosted Mac is isolated from the shared local Apple build schedule. Native UI execution, physical-device checks and distribution signing are recorded separately.

## Data and release readiness

Connected use sends a profile and selected résumé to the configured application service, and approved fields/CV to the supported employer. The private service ledger retains immutable dispatch snapshots and receipt evidence. Local legacy records remain separate.

HTTPS hosting, account onboarding/recovery, bounded retention, account-erasure operations and service privacy/support pages are implemented. Public deployment and anonymous security checks passed; signed-in production pairing and native use still require their own recorded acceptance. Before store distribution, complete operator/contact and store disclosures, authorized live connector acceptance, native device/accessibility QA, signing and store review. The privacy draft now describes the connected service.

Historical releases, TestFlight observations and earlier checks are preserved in [project history](docs/Project-History-Through-2026-11-15.md) and [Apple history](docs/Apple-History-Through-2026-11-15.md). They are not fresh evidence for this candidate.
