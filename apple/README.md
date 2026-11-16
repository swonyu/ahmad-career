# Career Finder for iPhone

Native SwiftUI phone app for iOS 16 and newer. This candidate preserves the existing `com.ahmadalayed.career` app identity and existing local saved roles/application records, adds a native **Apply** workspace, and changes the project target to iPhone/iPhone Simulator only.

The tab bar contains Start, Search, Apply, Saved and Profile. The existing application-planning screen is accessible from Start. The Apply workspace has its own explicit applicant profile and selected PDF résumé; it never silently converts historical professional research into an application.

## Phone application flow

1. Create a profile and select a PDF résumé of at most 5 MiB.
2. Save an employer opportunity using its public HTTPS URL and role details.
3. Connect an activated application service using its HTTPS address and a single-use pairing code.
4. Select opportunities, review the authoritative applicant fields/CV summary, and provide any required employer-specific message or explicit data choices.
5. Approve Auto Apply for eligible jobs. The service owns submission and verification.
6. Inspect activity and receipt details. Unknown outcomes remain unconfirmed; a known rate-limit rejection can be reviewed again after its cooldown.

Phone credentials use Keychain with device-only accessibility. Draft files are atomically written with iOS file protection. Unsupported service origins, redirects, private job URLs, invalid PDF contents and uncertain receipt evidence are rejected. The review uses a captured profile revision, so a stale editor cannot silently overwrite a newer server profile.

A service address alone does not enable all employer sites. The first connector needs an authorized Lever employer key and current reviewed requirements. Existing live job discovery retains its disclosed limited Saudi coverage; manually saved opportunities support any country or profession.

## Open and run

Open `AhmadCareer.xcodeproj` in Xcode, select **AhmadCareer**, and select an iPhone or iPhone Simulator destination. Use the existing authorized signing team for a physical device. This candidate does not change signing identity, upload a build or assign a new store release number.

Do not use historical Mac or iPad run commands for this candidate. Mac web assets and compatibility source remain in the repository without being current product targets.

## Executed verification

See [mobile-verification.json](Checks/mobile-verification.json) for source hashes and exact commands.

- All nine Swift app source files passed a static typecheck for `arm64-apple-ios16.0` using the installed iPhoneOS 27.2 SDK, Swift 5 language mode, with zero diagnostics.
- The actual Foundation application client/policy harness compiled and ran on macOS: 40 checks passed.
- Backend behavior and phone authentication were separately exercised over real local HTTP by the regression and Postman suites.

These checks do not establish a linked Xcode project build, simulator rendering, VoiceOver behavior, device installation, signed archive, TestFlight upload or live employer acceptance. Shared Apple build/simulator scheduling was preserved.

## Release checks still required

Build the exact candidate in the authorized Apple build slot. Exercise phone layout at large text sizes, VoiceOver navigation, keyboard and PDF-picker return, dark mode, restoration, offline drafts, stale profile conflicts, interrupted network requests, rate-limit recovery and receipt sharing. Confirm migration of existing saved records on a disposable test workspace.

Complete the configured HTTPS integration and updated privacy/support/account-data operations before public testing. Only a provider-confirmed live receipt may be described as a submitted application.

Historical Apple release details and commands remain in [Apple history](../docs/Apple-History-Through-2026-11-15.md), with their original dates and limitations.
