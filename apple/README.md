# Career Finder for iPhone

Native SwiftUI phone app for iOS 16 and newer. This candidate preserves the existing `com.ahmadalayed.career` app identity and existing local saved roles/application records, adds a native **Apply** workspace, and changes the project target to iPhone/iPhone Simulator only.

The tab bar contains Start, Search, Apply, Saved and Profile. The existing application-planning screen is accessible from Start. The Apply workspace has its own explicit applicant profile and selected PDF résumé; it never silently converts historical professional research into an application.

## Career Finder for every new user

The public iPhone name is **Career Finder**, including the display name and generated bundle-name setting. Navigation titles and exported receipt/note filenames use Career Finder. Internal Xcode target/file names, the established bundle identifier and legacy storage locations remain unchanged so existing installations can retain their records.

Fresh applicant and planning profiles contain no assumed name, biography, contact information, personal URL, CV, country, city, profession or salary target. New histories, saved jobs and preparation checklists are empty. Displayed timestamps use the new user's device time zone unless they choose another. The profile editor accepts a genuine single name and lets users enter their own experience and goals.

The offer calculator starts with blank amounts and no currency choice. Dated Saudi salary examples are an optional disclosure after the general calculator and negotiation guidance. They are neither a personal salary target nor coverage of other professions or countries.

Nine archived researched roles remain solely as recovery material for existing saved/tracked records whose snapshots are missing. Existing user-entered profiles, saved roles, dates, notes and historical preferences are preserved. Fresh workspaces receive none of those archived recommendations. Live discovery still covers only the disclosed six Saudi-oriented employer sources and selected role families; manually saved opportunities and the Apply profile support users from any country or profession.

## Phone application flow

1. Create a profile and select a PDF résumé of at most 5 MiB.
2. Save an employer opportunity using its public HTTPS URL and role details.
3. Open **Set up Auto Apply**. New connections suggest the hosted HTTPS service. Open connection setup in the browser, sign in with ChatGPT, obtain a one-time code, and enter it on the phone. Existing custom service addresses are preserved.
4. Select opportunities, review the authoritative applicant fields/CV summary, and provide any required employer-specific message or explicit data choices.
5. Approve Auto Apply for eligible jobs. The service owns approval, submission and verification. Keep Career Finder open while the hosted queue advances; any request already sent may still complete after the app closes.
6. Inspect activity and receipt details. Unknown outcomes remain unconfirmed; a known rate-limit rejection can be reviewed again after its cooldown.

Phone credentials use Keychain with device-only accessibility. Draft files are atomically written with iOS file protection. Unsupported service origins, redirects, private job URLs, invalid PDF contents and uncertain receipt evidence are rejected. Genuine single-name applicants can use the first/single-name field without inventing a surname. Future-role contact can be explicitly declined.

A service address alone does not enable all employer sites. The first connector needs an authorized Lever employer key and current reviewed requirements. Existing live job discovery retains its disclosed limited Saudi coverage; manually saved opportunities support any country or profession.

## Hosted setup and account data

The setup-only default is `https://career-finder-service.jazzy-drake-8323.chatgpt.site`. It is not written over an existing address and does not create a connection or send a draft merely by opening the app.

- `/connect` opens browser sign-in and one-use phone pairing. Use the same ChatGPT account to recover the existing workspace or connect another phone.
- `/privacy` describes hosted storage and application-provider data flows.
- `/support` provides service help.
- `/account` manages the hosted account and deletion. Disconnecting or deleting the phone app is separate from deleting hosted data; employer copies and exports remain with their recipients.

The connection screen and Privacy & support screen share the same application store and route hosted links according to the actual configured origin. Custom Node companions retain their operator-provided invitation/recovery process and are not presented as ChatGPT-hosted accounts. Native connection tokens remain in Keychain; browser URLs do not contain those tokens or applicant fields. Pending account deletion clears continuation/review authority, and a revoked token disconnects the phone while retaining its local draft.

## Continuing an approved hosted queue

Only a fresh, complete authenticated workspace declaring `capabilities.dispatchContinuation: "client"` enables `POST /api/apply/advance`. The request contains only a server-returned active `planId`; it cannot approve a review and never calls `/submit` automatically. Approval remains a server record. An absent or unknown capability preserves the Node companion's GET-only polling behavior, including when `mode` is still `local`.

Foreground polling runs across the app's tabs. It permits one continuation request at a time, waits at least four seconds after completion, and always reads the workspace again for durable results. A failed or malformed workspace read cannot authorize a request from cached active IDs. An advance response does not create a local receipt. A timeout is reconciled with the server; uncertain attempts never enter an automatic retry path. An explicit rate-limit rejection requires a new visible review and `/submit` approval after its cooldown before the server makes it active again.

The processing card distinguishes sending from an approved queue and explains foreground continuation. Stop remains available during a request; the service determines which unsent work can still be stopped. The existing 25-second request timeout accommodates the hosted service's bounded single-attempt processing budget. The client does not claim background execution or eventual completion while the app is closed.

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
- The application boundary harness compiled and ran on macOS: **61 checks passed**, including blank applicant identity/contact/location/profession/CV defaults and unrestricted initial career-stage/work-mode preferences.
- The actual application store compiled and ran with injected transport/credentials and real temporary draft files: **117 assertions passed across 25 deterministic lifecycle scenarios**. These cover draft revision persistence and legacy migration, explicit conflict resolution, successful PUT reconciliation, delayed responses/errors across saves and connection changes, offline disconnect, token expiry, canonical job merging, multiple reviews, atomic replacement conflicts, changed preparation inputs, malformed response preservation, background draft checkpoints, and persistence/Keychain failures. Hosted additions exercise setup preservation, exact capability gating, server-only approval, sequential continuation and pacing, Stop during a request, ignored advance receipt data, failed workspace reads, uncertainty, explicit cooldown approval, stale continuation results across connections, and account deletion/revocation.
- Backend behavior and phone authentication were separately exercised over real local HTTP by the regression and Postman suites.
- The same standalone command also executes the existing native planning-store regression harness. Its fresh-user checks verify empty profiles/history, neutral country/city/currency/role/salary preferences, device time zone and Career Finder exports; its legacy fixtures verify that prior profiles and saved application records remain intact.

The lifecycle scenarios execute production store methods, rather than a parallel test model. Their transport and credentials are synthetic; they do not exercise iPhone networking, system Keychain behavior or SwiftUI interaction. The current standalone checks do not establish a linked project build or live hosted-service acceptance. The earlier published `2a9004a0` candidate passed its [hosted unsigned iPhone project build](https://github.com/swonyu/ahmad-career/actions/runs/43883809010/job/133356409913); that result does not cover later source changes. Shared local Apple build/simulator scheduling was preserved.

## Release checks still required

Run the unsigned hosted CI build on the exact updated candidate. Device/simulator work on the shared Mac still requires its authorized Apple build slot. Exercise phone layout at large text sizes, VoiceOver navigation, keyboard and PDF-picker return, dark mode, restoration, offline drafts, stale profile conflicts, interrupted network requests, rate-limit recovery and receipt sharing. Confirm migration of existing saved records on a disposable test workspace.

Validate browser sign-in/pairing, HTTPS workspace recovery, approved continuation, account deletion and the published privacy/support pages against the deployed service before public testing. Signing, physical-device execution and distribution remain separate checks. Only a provider-confirmed live receipt may be described as a submitted application.

Historical Apple release details and commands remain in [Apple history](../docs/Apple-History-Through-2026-11-15.md), with their original dates and limitations.
