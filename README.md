# Career Finder

Native career and application workspace for **iPhone and Android phones**. The current update adds a personal profile, PDF résumé, opportunities from any country or profession, and an **Auto Apply** flow backed by durable provider receipts.

**Status: development candidate, 16 November 2026.** Source implementation and the checks below are complete or recorded in the [phone update](docs/Phone-Update-2026-11-16.md). This is not a published App Store/Google Play release or a deployed application service. No real employer applications were sent during development.

## What the phone apps do

- Start with a blank personal profile; choose your own country, location, career level, roles, skills and work preferences.
- Keep phone drafts and select an actual PDF résumé, up to 5 MiB.
- Save and search employer opportunities from any country or profession. Existing iPhone saved roles and application history remain available.
- Pair a configured HTTPS application service using a short-lived, single-use code. Store its token in platform secure storage.
- Review the exact applicant details, selected résumé, employer-specific message, explicit data choices and eligible jobs before approving Auto Apply.
- Track confirmed, uncertain, rejected, rate-limited and stopped outcomes. Reopen eligible reviews after restarting the phone app; resuming requires deliberate approval.
- Export receipt evidence without résumé bytes, employer keys or phone credentials.

**Verification has a specific meaning:** a confirmed live receipt requires a supported employer API's documented success response and a nonempty application ID. It establishes API acceptance, not a recruiter decision. Opening an employer link or changing a local tracker status cannot create one.

## Automatic submission coverage

The initial connector supports the official Lever Postings API, separately for global and EU employers. Each employer needs an authorized key and current, explicitly reviewed posting requirements. Unknown or unsupported custom questions block automatic submission. Other employer links remain useful for manual applications.

This does not add a worldwide job-feed aggregator. The retained iPhone live discovery still uses bounded samples from six selected Saudi employer sources; its coverage is disclosed in the app. Worldwide opportunities can be added manually. The current interface is English.

## Source layout

| Area | Purpose |
| --- | --- |
| [apple/](apple/) | Native SwiftUI iPhone app, iOS 16+, existing identity and records preserved |
| [android/](android/) | Native Kotlin/Jetpack Compose phone app, Android 8/API 26+ |
| [website/applications/](website/applications/) | Separate Node/SQLite application service and private pairing CLI |
| [Application contract](docs/Verified-Applications-Contract.md) | Auth, immutable reviews, dispatch states, consent and receipt evidence |
| [postman/](postman/) | Real HTTP acceptance collection using a synthetic local Lever dependency |
| [Phone update and readiness](docs/Phone-Update-2026-11-16.md) | Changes, executed checks, source provenance and release requirements |

The pre-existing website and Mac source remain for compatibility and history. This candidate targets phones. GitHub source changes do not deploy the existing website.

## Build and verify

### iPhone

Open `apple/AhmadCareer.xcodeproj`, select the **AhmadCareer** scheme and an iPhone destination. The project targets iPhone/iPhone Simulator only. Preserve bundle identifier `com.ahmadalayed.career` and use the authorized signing team for device distribution.

The current source passed a full nine-file Swift typecheck for the iOS 16 target using the installed iPhoneOS SDK, plus 40 executed Foundation policy checks. This is not a linked Xcode app build or device UI acceptance. See [exact evidence](apple/Checks/mobile-verification.json).

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

Fixtures are visibly synthetic, use a separate test ledger and cannot count as live applications. [Recorded Postman results](postman/verification.json): 28 requests, 36 assertions, zero failures.

## Data and release readiness

Connected use sends a profile and selected résumé to the configured application service, and approved fields/CV to the supported employer. The private service ledger retains immutable dispatch snapshots and receipt evidence. Local legacy records remain separate.

Before public distribution, complete HTTPS hosting and operator access, user onboarding/recovery, retention and account-erasure operations, updated privacy/support publication, authorized live connector acceptance, native device/accessibility QA, store signing and store review. The old local-only privacy draft does not describe this new connected service.

Historical releases, TestFlight observations and earlier checks are preserved in [project history](docs/Project-History-Through-2026-11-15.md) and [Apple history](docs/Apple-History-Through-2026-11-15.md). They are not fresh evidence for this candidate.
