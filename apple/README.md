# Career Finder for iPhone

Native SwiftUI phone app for iOS 16 and newer. This candidate preserves the existing `com.ahmadalayed.career` app identity and existing local saved roles/application records, adds a native **Apply** workspace, and changes the project target to iPhone/iPhone Simulator only.

The tab bar contains Start, Search, Apply, Saved and Settings. Start opens with direct actions to find jobs, add a job link, create an application profile and continue an application review. The same applicant profile is available from Start, Apply and Profile in Settings. Optional local planning notes remain separate, and the preparation checklist is accessible from Start. Earlier professional research is never silently converted into an application.

## Career Finder for every new user

The public iPhone name is **Career Finder**. Both build configurations set `PRODUCT_NAME` to `Career Finder`, which Xcode uses for the generated `CFBundleName`, and set `CFBundleDisplayName` to the same name. The built product and scheme references use `Career Finder.app`. Navigation titles and exported receipt/note filenames use Career Finder. Internal Xcode target/scheme/file names, the Swift module name, the established bundle identifier and legacy storage locations remain unchanged so existing installations can retain their records. See Apple's [build settings reference](https://developer.apple.com/documentation/xcode/build-settings-reference) for the generated bundle-name rule.

Fresh applicant and planning profiles contain no assumed name, biography, contact information, personal URL, CV, country, city, profession or salary target. New histories, saved jobs and preparation checklists are empty. Displayed timestamps use the new user's device time zone unless they choose another. The profile editor accepts a genuine single name and lets users enter their own experience and goals.

The offer calculator starts with blank amounts and no currency choice. Dated Saudi salary examples are an optional disclosure after the general calculator and negotiation guidance. They are neither a personal salary target nor coverage of other professions or countries.

Nine archived researched roles remain solely as recovery material for existing saved/tracked records whose snapshots are missing. Existing user-entered profiles, saved roles, dates, notes and historical preferences are preserved. Fresh workspaces receive none of those archived recommendations. The primary Search tab now uses selected public Greenhouse and Lever employer boards across professions and locations. The old Saudi feed/parser remains only for record compatibility; the new Search flow has no fixed Saudi-country or role-family gate. This is coverage of selected employer boards, not a complete worldwide jobs index.

## Public employer-board discovery

Search is available without pairing or an account. The app reads the public employer directory, then waits for an explicit **Search jobs** action. Users can enter role words, optional location text, a remote-evidence filter and up to four employer boards. Suggested boards are available, and supported Greenhouse/Lever board or posting URLs can be added. Results arrive in pages of 50; each source is bounded to 500 jobs by the service.

The client always uses `https://career-finder-service.jazzy-drake-8323.chatgpt.site/api/discovery`. It sends only explicit discovery parameters, with no applicant profile, CV, email, application token or account cookie. Its ephemeral session disables cookies and credential storage and refuses redirects. A paired custom application companion does not change this public origin. Search fields are visible in the service request and may be included in ordinary hosting logs; they are not forwarded to employers.

Every result keeps employer/source attribution, the provider's location evidence and the last successful check time. Unknown country and remote values stay unknown. Cached, stale, partial and unavailable source states remain visible. Edited criteria or cancelled requests cannot install an obsolete response. Failed or malformed responses preserve prior results. A changed pagination snapshot requires an explicit new search, and a rate-limit response prevents another request before its retry time. Previously stored results are labelled as previous results after relaunch.

**Save opportunity** copies the public link and role details into the existing application workspace. Saved shows those opportunities alongside earlier local records, and earlier role details offer an explicit **Copy to application workspace** action. Canonical URL identity prevents a second copy of the same opportunity. Original planning notes and self-entered statuses remain intact. Saving, opening and sharing a link do not apply to the job.

## Phone application flow

### Apply on an employer’s website

1. Find a role on the selected employer boards, or add a public HTTPS job link and its details. Save the job before opening the employer’s page so you can return to its record.
2. Review your profile and select a PDF résumé of at most 5 MiB when ready. **Reuse your contact details** lets you copy one chosen field, then paste and check it yourself in the employer’s form. It does not fill or submit that form.
3. Open the saved job’s employer link and check the requirements, location and deadline there. The employer manages its own sign-in and application process. No Career Finder application-service connection is required for this manual path.
4. Return to **Saved** to record your application stage, dates, follow-up and private notes. These are your own records; saving a link or changing a stage does not submit an application or create a provider receipt.

For a guest, the primary action in **Apply** opens saved jobs. If there are none, it opens **Search**. Saved roles from earlier local records remain reachable.

### Optional connected application service

1. In **Apply**, choose **Connect application workspace**. New connections suggest the hosted HTTPS service. Open connection setup in the browser, sign in with ChatGPT, obtain a one-time code, and enter it on the phone. Existing custom service addresses are preserved.
2. For a supported, activated integration, select opportunities and review the authoritative applicant fields/CV summary. Provide any required employer-specific message and explicit data choices before approving an eligible application. Connecting alone does not activate automatic submission; the hosted preview currently has live automatic submissions disabled.
3. The service owns approval, submission and verification. Keep Career Finder open while a supported hosted queue advances; a request already sent may still complete after the app closes. Inspect activity and provider receipts for the outcome. Unknown outcomes remain unconfirmed, and a known rate-limit rejection needs a fresh review after its cooldown.

Phone credentials use Keychain with device-only accessibility. Draft files are atomically written with iOS file protection. Unsupported service origins, redirects, private job URLs, invalid PDF contents and uncertain receipt evidence are rejected. Genuine single-name applicants can use the first/single-name field without inventing a surname. Future-role contact can be explicitly declined.

A service address alone does not enable all employer sites. The first submission connector needs an authorized Lever employer key and current reviewed requirements. Public discovery does not activate automatic submission for a board. Manually saved opportunities support any country or profession.

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

The add-opportunity form also protects unfinished work. Cancel offers **Save draft on this phone**, **Keep editing** or **Discard draft** after an edit. Changed sheets cannot disappear through a swipe, backgrounding checkpoints the draft, and relaunch restores it. Adding the matching job consumes that draft in the same local write as the saved link. Saving a different discovered role cannot erase an unfinished manual draft.

Application lists now use stable semantic identities. Long CV names wrap, the view picker adapts at accessibility text sizes, and text/icon accents support dark backgrounds. Planning notes are labelled separately from employer-facing details. Legacy monthly-SAR controls are shown only for preferences that already contain those historical fields.

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

- All thirteen Swift app source files passed static typechecks for `arm64-apple-ios16.0` in both Release and Debug conditions using the installed iPhoneOS 27.2 SDK, Swift 5 language mode, with zero diagnostics. The separate XCTest source also typechecked against the simulator SDK and XCTest Swift overlay.
- The application boundary harness compiled and ran on macOS: **61 checks passed**, including blank applicant identity/contact/location/profession/CV defaults and unrestricted initial career-stage/work-mode preferences.
- The actual application store compiled and ran with injected transport/credentials and real temporary draft files: **129 assertions passed across 27 deterministic lifecycle scenarios**. These cover draft revision persistence and legacy migration, explicit conflict resolution, successful PUT reconciliation, delayed responses/errors across saves and connection changes, offline disconnect, token expiry, canonical job merging, multiple reviews, atomic replacement conflicts, changed preparation inputs, malformed response preservation, background draft checkpoints, and persistence/Keychain failures. Hosted cases exercise setup preservation, exact capability gating, server-only approval, sequential continuation and pacing, Stop during a request, ignored advance receipt data, failed workspace reads, uncertainty, explicit cooldown approval, stale continuation results across connections, and account deletion/revocation. New add-link cases exercise partial-draft restoration, deliberate discard, bounded writes and atomic consumption without losing a different draft.
- The new public discovery policy and production store passed **33 assertions across 10 scenarios**, including the shared backend JSON fixture, privacy of request fields, source limits, unknown geography, cached restoration, stale input/cancellation, pagination, cursor changes, unavailable/malformed responses, rate limits and preservation of unreadable local data.
- Backend behavior and phone authentication were separately exercised over real local HTTP by the regression and Postman suites.
- The same standalone command also executes the existing native planning-store regression harness. Its fresh-user checks verify empty profiles/history, neutral country/city/currency/role/salary preferences, device time zone and Career Finder exports; its legacy fixtures verify that prior profiles and saved application records remain intact.

The executable scenarios use production store methods with synthetic transport/credentials and real temporary files. They do not exercise iPhone networking, system Keychain behavior or SwiftUI interaction. Project/scheme parsing verified all thirteen app-source references, both configurations' product/bundle identity and the separate UI-test target dependency. A linked build, rendered native UI and live service acceptance require their own exact-commit results. Shared local Apple build/simulator scheduling was preserved.

## Hosted native UI acceptance

`CareerFinderAcceptance` is a separate shared scheme for the `CareerFinderUITests` target. Seven XCUITests cover the five-tab first-run flow, blank applicant fields, saved profile drafts across relaunch, add-job keep/discard/save behavior, discovery-to-Saved-to-Apply handoff, empty/offline search, large text and keyboard reachability. Fourteen named screenshots are retained as XCTest attachments.

On **16 November 2026**, the first [hosted UI run](https://github.com/swonyu/ahmad-career/actions/runs/43904422104) on commit `ba836006259bd30162ddc76444e1186726483d33` executed all seven tests on an iPhone Air with iOS 26.5 Simulator: five passed and two exposed interaction issues. Its separate production policy and unsigned Release build job passed. [The exact attempt record](Checks/hosted-ui-attempt-43904422104.json) preserves the result and artifact fingerprints. The resulting changes made **Keep editing** visible in native confirmation popovers and provided **Search jobs** in the keyboard toolbar.

Also on **16 November 2026**, [run 43909112336](https://github.com/swonyu/ahmad-career/actions/runs/43909112336) on `a2c452e8ac382e90e2ce8640b02525e64b69980b` again passed policy checks and the unsigned Release build. Its seven UI tests recorded five passes and two accessibility-query failures: the native **Keep editing** action was visibly present while the custom-identifier representation was not hittable, and the error query selected a decorative image even though the complete message and previous roles were visible. [Its attempt record](Checks/hosted-ui-attempt-43909112336.json) preserves those observations. The corrected test selects a label-matched native button only after a bounded visibility/reachability check, and the app exposes the error as one readable message. Real taps, draft-value checks, keyboard dismissal, completed no-results content and retained-result assertions remain required. All thirteen app sources and the updated XCTest source passed static checks with zero diagnostics at the timestamps in [mobile-verification.json](Checks/mobile-verification.json).

Later on **16 November 2026**, [run 43913861800](https://github.com/swonyu/ahmad-career/actions/runs/43913861800) on `8ca0b34a8fb324d983c9bee63cd582a368fe4d59` passed policy checks and the unsigned Release build. Each of its two UI attempts passed six of seven tests. Attempt 1 recorded an accessibility IPC timeout during a large-text swipe; attempt 2 passed that test and the draft flows, but its keyboard-container existence assertion timed out after Return. The recording shows that Return completed the empty search and visibly dismissed the keyboard before that assertion failed. [Both exact attempts](Checks/hosted-ui-attempt-43913861800.json) are preserved. The targeted correction gives each search field its own optional focus value and checks dismissal of a real keyboard key and toolbar action that were positively reachable before submission, keeping the same five-second dismissal bound and all result assertions. Updated production and test sources passed standalone static checks with zero diagnostics; this does not establish a subsequent runtime outcome.

The next [run, 43921041281](https://github.com/swonyu/ahmad-career/actions/runs/43921041281), on `5879fd9f1d696d159eeb4d5e6fba2edfebfec468` again passed the production checks and Release build, and six of seven UI tests. Its diagnostic hierarchy shows successful first-search results and no keyboard; the failed predicate spent its five-second bound internally retrying lookups of the removed key and toolbar. [The exact record](Checks/hosted-ui-attempt-43921041281.json) preserves those lookup timestamps. The following correction changes only the test to inspect fresh query collections, retaining the same controls, time bound and subsequent assertions. Production source is unchanged, and the revised test passed its standalone static check.

These are dated observations for the stated source snapshots. See the [phone polish review](../docs/Phone-Polish-Review-2026-11-16.md) for subsequent exact-commit CI results and release status.

Debug acceptance requires an explicit launch flag and a valid per-test UUID. It uses a dedicated folder inside the simulator app's sandbox, synthetic discovery responses and injected offline credentials. It does not reset a user's storage, access Keychain, load a real CV or contact an employer. Screenshots are visibly marked as offline synthetic acceptance. Release ignores the acceptance flags and uses the normal storage/services; the UI-test target is separate from the app product.

On a separate GitHub-hosted macOS runner with an owned iPhone Simulator, the workflow can run:

```sh
xcodebuild -project apple/AhmadCareer.xcodeproj \
  -scheme CareerFinderAcceptance -configuration Debug \
  -destination "platform=iOS Simulator,id=${CAREER_SIMULATOR_UDID}" \
  -derivedDataPath "${RUNNER_TEMP}/career-ui-derived" \
  -resultBundlePath "${RUNNER_TEMP}/CareerFinderUI.xcresult" \
  -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO test
```

The hosted runner does not use the shared local-Mac build slot. Local Xcode/simulator work still requires its separate scheduling acknowledgment and atomic lock protocol. Simulator evidence does not establish physical-device or signing acceptance.

## Release checks still required

Run the unsigned hosted CI build on the exact updated candidate. Device/simulator work on the shared Mac still requires its authorized Apple build slot. Exercise phone layout at large text sizes, VoiceOver navigation, keyboard and PDF-picker return, dark mode, restoration, offline drafts, stale profile conflicts, interrupted network requests, rate-limit recovery and receipt sharing. Confirm migration of existing saved records on a disposable test workspace.

Validate browser sign-in/pairing, HTTPS workspace recovery, approved continuation, account deletion and the published privacy/support pages against the deployed service before public testing. Signing, physical-device execution and distribution remain separate checks. Only a provider-confirmed live receipt may be described as a submitted application.

Historical Apple release details and commands remain in [Apple history](../docs/Apple-History-Through-2026-11-15.md), with their original dates and limitations.
