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

Phone credentials use Keychain with device-only accessibility. Draft files are atomically written with iOS file protection. Unsupported service origins, redirects, private job URLs, invalid PDF contents and uncertain receipt evidence are rejected. Genuine single-name applicants can use the first/single-name field without inventing a surname. Future-role contact can be explicitly declined.

A service address alone does not enable all employer sites. The first connector needs an authorized Lever employer key and current reviewed requirements. Existing live job discovery retains its disclosed limited Saudi coverage; manually saved opportunities support any country or profession.

## Drafts, reconnecting and reviews

The phone keeps the revision on which a draft was based, including after an offline save, failed request or relaunch. A background refresh can discover a newer service profile without replacing that draft or silently changing its base revision. The profile editor offers a comparison, an explicit choice to keep the phone draft against the displayed version, or replacement with the service version. A successful profile-save response is written locally before the app reports a completed save; it does not depend on a second network request.

Changed profile sheets cannot disappear through a swipe. Cancel offers **Save draft on this phone**, **Keep editing** and **Discard changes**. Backgrounding checkpoints edited fields and the selected PDF locally without uploading them. Returning from a cancelled or invalid PDF selection preserves the earlier file. The app reads a bounded copy of the actual PDF bytes and records its filename, byte count and SHA-256 fingerprint; later changes to the original document cannot change the saved selection.

A disconnected or expired session keeps the phone draft. Local disconnect takes effect even when the service cannot confirm remote revocation. Recovering an existing server workspace requires an invitation for that workspace. Connecting to a different workspace keeps local fields as an unsaved draft and never silently reuses CV metadata from the former workspace. The old session's delayed responses and errors cannot populate or disconnect the new workspace.

Explicitly saved opportunity links remain on the phone if network import fails. Imported URL variants merge into one opportunity while preserving selection and explicit application choices. Connecting alone does not upload the local applicant draft or start applications.

Every recoverable review is reachable from the Apply workspace. Updating choices replaces only an unapproved review, using the service's atomic `onlyIfUnapproved` stop guard. A review approved elsewhere, already sending, uncertain or awaiting a provider cooldown is not implicitly cancelled. Selection, answers and profile state are captured during preparation; changed inputs cannot install an approvable older result. Use the matching companion version with complete workspace/profile responses and the atomic stop guard.

## Open and run

Open `AhmadCareer.xcodeproj` in Xcode, select **AhmadCareer**, and select an iPhone or iPhone Simulator destination. Use the existing authorized signing team for a physical device. This candidate does not change signing identity, upload a build or assign a new store release number.

Do not use historical Mac or iPad run commands for this candidate. Mac web assets and compatibility source remain in the repository without being current product targets.

## Executed verification

See [mobile-verification.json](Checks/mobile-verification.json) for exact source/compiler/SDK fingerprints, commands and limitations. On macOS, run the production policy and store lifecycle checks with:

```sh
bash apple/Checks/check-mobile.sh
```

The command uses a disposable build directory and module cache. It does not invoke an Xcode project build, simulator, signing or deployment.

- All ten Swift app source files passed a static typecheck for `arm64-apple-ios16.0` using the installed iPhoneOS 27.2 SDK, Swift 5 language mode, with zero diagnostics.
- The application boundary harness compiled and ran on macOS: **48 checks passed**.
- The actual application store compiled and ran with injected transport/credentials and real temporary draft files: **79 assertions passed across 15 deterministic lifecycle scenarios**. These cover draft revision persistence and legacy migration, explicit conflict resolution, successful PUT reconciliation, delayed responses/errors across saves and connection changes, offline disconnect, token expiry, canonical job merging, multiple reviews, atomic replacement conflicts, changed preparation inputs, malformed response preservation, background draft checkpoints, and persistence/Keychain failures.
- Backend behavior and phone authentication were separately exercised over real local HTTP by the regression and Postman suites.

The lifecycle scenarios execute production store methods, rather than a parallel test model. Their transport and credentials are synthetic; they do not exercise iPhone networking, system Keychain behavior or SwiftUI interaction. The checks do not establish a linked Xcode project build, simulator rendering, VoiceOver behavior, device installation, signed archive, TestFlight upload or live employer acceptance. Shared Apple build/simulator scheduling was preserved.

## Release checks still required

Build the exact candidate in the authorized Apple build slot. Exercise phone layout at large text sizes, VoiceOver navigation, keyboard and PDF-picker return, dark mode, restoration, offline drafts, stale profile conflicts, interrupted network requests, rate-limit recovery and receipt sharing. Confirm migration of existing saved records on a disposable test workspace.

Complete the configured HTTPS integration and updated privacy/support/account-data operations before public testing. Only a provider-confirmed live receipt may be described as a submitted application.

Historical Apple release details and commands remain in [Apple history](../docs/Apple-History-Through-2026-11-15.md), with their original dates and limitations.
