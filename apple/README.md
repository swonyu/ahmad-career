# Ahmad Career — Apple app source

iPhone and iPad use native SwiftUI navigation, search, profile forms, saving, sharing and salary comparison. Mac uses the bundled workspace in WKWebView. Both Apple apps query employer feeds through URLSession without depending on the hosted website. Minimum versions are iOS/iPadOS 16 and macOS 13.

## Release status — 9 October 2026

- [Website version 10](https://ahmad-career.jolly-lynx-4861.chatgpt.site/) deployed at **16:41:32 Riyadh (13:41:32 UTC)** from source `77604276ada4bb08c0b93ed4335ccb4c0fee77b3`. This review corrected queued-save and refresh races, stale exports/views, contradictory feed totals, date ordering, partial-failure retention and exact exclusions, employer-check provenance, Mac confirmations and reload protection, repeated native save feedback, and clearer handoff instructions. Fresh workspaces start with Riyadh selected; existing choices and application history remain intact.
- Universal **Mac Release 1.1 (10)** and local **iOS Simulator Debug 1.1 (10)** compiled with `CURRENT_PROJECT_VERSION=10`; shared Xcode default remains **7**. Seven embedded web assets and research match source and builds. Mac is unsigned and not notarized. The owner's older Mac 8 app was untouched; its running state was not rechecked.
- iOS 1.1 (10) uploaded successfully once at 21:14:46 Riyadh (18:14:46.646 UTC), Xcode exit 0. Apple processing completed and the reviewed testing notes were saved. One beta-review submission at about 21:21 Riyadh was followed by an observed Approved status for build 10. It was released to the existing Ahmad Beta group; at 21:24 Riyadh the public invitation displayed Ahmad Career and View in TestFlight. This verifies the invitation landing page, not installation or launch on a physical iPhone. The group limit remains one tester; the last group check showed zero testers. Approved build 4 was preserved. Builds 5, 6 and 7 remain historical, superseded uploads. No App Store production release is claimed. Device 1.1 (10) passed the previously recorded local signature, platform and resource checks. The retained App Store IPA is a local export, not a direct installer. Its SHA256 identifies that local file; the archive/export upload receipt does not establish byte-for-byte remote payload equality. Physical-iPhone installation, native UI and complete VoiceOver remain unverified.
- Core, record, feed-boundary and server checks passed; all 63 application-state groups passed. The actual native-store checks passed on final source, including persisted employer observation chronology. Independent targeted reviews covered asynchronous saves, exact exclusions, partial refreshes, dates and native storage. Synthetic fixtures did not contact employers.
- An isolated Mac app exercised record confirmation Cancel/Continue and toolbar Keep working/Discard and reload, preserving the expected saved receipt and timestamp. One 1240×850 Mac screenshot showed readable layout. Physical iPhone, two pending Simulator UI scenarios and full VoiceOver remain unverified; announcement-dispatch probes do not prove actual speech.
- Last real website search remains version 7 at **07:59 Riyadh**, six responding employers/three leads. No live employer search was repeated for release 10. Version 10 production reload retained three saved/applied roles; reviewed local receipt notes were saved and verified after reopening. This is not a new employer check, application or device synchronization. `Ahmad-Career-iOS.ipa` remains development **1.1 (3)**. The [TestFlight invitation](https://testflight.apple.com/join/S5bDCNbd) displayed Ahmad Career and View in TestFlight at **21:24 Riyadh**; physical-device installation is not yet verified. See [release evidence](../docs/Review-2026-10-09.html); packages and checksums are supplied separately.

Application records use separate versioned per-role storage; legacy workspace/status formats and the six checklist items remain readable. Dates are optional and validated in Riyadh time. Dirty drafts survive navigation, conflicts and failed saves. Native writes are atomic within the shared app store; no cross-process compare-and-swap is claimed. Web record saves require Web Locks; when unavailable, drafts/export remain available without claiming a safe save. Full tracking notes include receipt text and clearly labeled unsaved drafts, while per-role preparation notes exclude receipts. These are local records, not verified employer acknowledgements or cloud backups.

Unsaved application-record drafts last only in the current open session. Before reloading, quitting or updating, use Save application record. If saving fails, preserve them through Application plan → Download my application notes on the website; on Mac, copy the displayed notes to a private file. These notes are readable copies, not importable backups. On iPhone, use Review my application notes before sharing or saving the text.

The public professional profile now states Regulatory KPI Department Manager at the Supply Chain Command Center, KPI coverage across 20 health clusters and Ministry of Health branches, prior Quality Control leadership of more than 10 staff, NUPCO coordination, and Power BI, SQL and Excel. These are self-reported professional facts, not independently verified credentials. Employment dates, nine researched jobs and specialist qualification gates are unchanged.

The research snapshot remains dated 9 October 2026 and contains **nine healthcare leads**, all with undisclosed salary. Role fit, seniority and pay still require confirmation; the profile correction does not establish any specialist experience minimum or a salary offer. No private preferences, CV, chat content or photos were added.

## Open and run

1. Open `AhmadCareer.xcodeproj` in Xcode and select the shared **AhmadCareer** scheme.
2. Select **My Mac** or an installed **iPhone/iPad Simulator**, then Run.
3. For a physical iPhone or iPad, select the target's **Signing & Capabilities** and your authorized Apple development team. The default bundle identifier is `com.ahmadalayed.career`; change it if your team needs a unique identifier. Connect and unlock the device, enable Developer Mode when prompted, select it as the destination, then Run.

The shared project has no development team selected and includes no account credentials or provisioning profiles. Distribution signing and uploaded TestFlight builds are separate from these portable project settings.

The older development IPA is restricted to devices registered in its provisioning profile, including Saleh's paired iPhone. Its profile expires 28 July 2027 unless revoked earlier. Physical installation was not confirmed after Xcode's device connection reset. It is not an App Store download or an install route for an unregistered phone.

The refreshed `Ahmad-Career-macOS-Unsigned.zip` contains the universal Intel/Apple Silicon **1.1 (10)** Release app. It is unsigned and not notarized: strict signature verification reports that the code object is not signed. It must not be represented as a signed distribution. Another Mac may require an appropriately signed build.

## Verification commands

Run from this directory with full Xcode selected to repeat the checks. The release review records the completed checks separately from Apple review, production search and physical-device verification.

```sh
bash Checks/check.sh

xcodebuild -project AhmadCareer.xcodeproj -scheme AhmadCareer \
  -configuration Debug -destination 'platform=macOS,arch=arm64' \
  -derivedDataPath /tmp/AhmadCareer-check-macOS CODE_SIGNING_ALLOWED=NO build

xcodebuild -project AhmadCareer.xcodeproj -scheme AhmadCareer \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/AhmadCareer-check-iOS CODE_SIGNING_ALLOWED=NO build
```

The offline script checks bridge/navigation boundaries, employer URL and date validation, feed fixtures, native persistence, pre-criteria data migration, input validation and discovery criteria. Compatibility checks for old Qiddiya records do not make Qiddiya an active source. The unsigned build commands compile the app; they do not install it, create a distribution archive or verify its UI.

The optional live check contacts the **six configured employers** and writes their response to `BuildLogs/live-refresh.json`:

```sh
bash Checks/check.sh --live
```

It requires at least one successful source, not all six. Inspect each source's coverage and error fields; a passing command does not establish complete coverage or a fixed number of vacancies.

To check live refresh and cache restoration through the native store:

```sh
mkdir -p BuildLogs
swiftc AhmadCareer/NativeCareerStore.swift AhmadCareer/CareerFeed.swift \
  Checks/NativeLiveCheck.swift -o BuildLogs/check-native-live
BuildLogs/check-native-live AhmadCareer/CareerResearch.json
```

The Mac runtime check uses the real bundled WKWebView and native search bridge with isolated, nonpersistent WebKit data. It contacts employers and checks rendering, search, saving, tracking, failure recovery and readable note export:

```sh
mkdir -p BuildLogs
swiftc AhmadCareer/CareerPolicy.swift AhmadCareer/CareerFeed.swift \
  AhmadCareer/CareerWebView.swift Checks/WebRuntimeCheck.swift \
  -o BuildLogs/check-web-runtime
BuildLogs/check-web-runtime "$PWD/AhmadCareer/Web"
```

The completed native checks cover pre-criteria migration, local-only criteria, persisted employer observations and preserved saved/tracked records. The earlier build-5 Mac runtime run rendered three leads from six source results and passed saving, tracking, cache recovery and note export. Current release-10 web assets match the source bundle and built Mac resources byte-for-byte. The build-5 runtime results remain historical; employer availability and later runtime behavior require fresh checks.

## Refresh, criteria and privacy

- Search queries Alcon, Novartis, Johnson & Johnson, GSK, BD and Roche. **Qiddiya is not queried.** Each Workday source checks a bounded Saudi search sample of up to 20 listings and relevant details; Novartis uses its Saudi country facet. Sources run concurrently with a 45-second budget per employer and cancellation. Partial coverage and failures remain visible; a missing result does not establish closure.
- Listings must pass source, Saudi-location, availability, date and title checks. Live discoveries are labeled **Needs review**, not automatically promoted to the researched shortlist. Search is neither exhaustive Saudi-market coverage nor proof of eligibility.
- New optional profile criteria refine only Shortlist and Live search. New workspaces default to Riyadh, no minimum monthly pay, and showing unverified pay. Existing saved city choices remain intact. Riyadh requires explicit location evidence; multiple-location roles still require confirmation of the assignment.
- Minimum pay accepts whole SAR from 0 to 1,000,000, including supported Arabic digits and grouping. Blank or zero disables the pay floor. Current listings have no verified comparable salary evidence: unknown pay is **never treated as meeting a minimum**. Choosing to hide unverified pay with an active floor can empty discovery; it does not mean there are no vacancies. Confirm basic salary versus fixed allowances with the employer.
- Criteria do not alter editorial ranking, saved roles or application history. Existing data without the new fields remains readable. Saved and tracked records remain available when later searches or criteria exclude a role.
- Profile details and criteria remain in the local browser/app store. Criteria are excluded from search requests and exported notes. Full tracking exports can contain user-entered professional details, receipt notes and labeled unsaved record drafts; per-role preparation notes omit receipts. Review them before sharing. No private CV, private messages or personal pay preferences belong in public source, fixtures, screenshots or deployed assets; source defaults contain no private pay preference; new workspaces start with Riyadh selected, and existing saved choices remain intact.
- Native iOS uses atomic Codable JSON workspace storage plus separate per-role application-record files in Application Support, shared by its windows. Invalid saved data is preserved instead of overwritten, and profile editors protect drafts and detect conflicts. Mac uses persistent WebKit storage; the hosted website uses that browser's local storage. There is no app account or cross-device sync. Removing the app or clearing browser data can erase state.
- Bundled research and saved state are available offline in the Apple apps. Live refresh requires internet access. Employer/recruitment providers receive ordinary connection information such as IP addresses; the native search request contains no profile, criteria or application notes. Users review and submit applications themselves on employer websites.

## Mac bridge and shared web resources

On iPhone, use **Find new openings** or pull to refresh. On Mac, the toolbar reloads the bundled workspace; its search action queries employers. The bridge accepts only `window.webkit.messageHandlers.careerSearch.postMessage({action: 'refresh'})` from the bundled main frame and delivers results through `window.receiveNativeJobs(payload)` using structured WebKit arguments. The webpage cannot select arbitrary URLs or request bodies for the native bridge. Redirects are refused by the native feed client.

HTTP/HTTPS external links open in the default browser; user-activated email links open the mail application. Other external schemes and navigation outside the bundled Web folder are blocked.

To update Mac's interface, copy the reviewed web workspace into `AhmadCareer/Web`, preserving `index.html`, relative resource URLs, classic scripts and the bridge contract. The folder is copied as one resource. Updating web source alone does not update a built Mac app or the public website; bundle propagation, runtime verification, rebuilding and deployment are separate steps.

`NativeCareerViews.swift` owns iOS screens. `NativeCareerStore.swift` loads `CareerResearch.json`, validates and persists records, and keeps recent employer facts separate from editorial ranks. The research JSON is a dated snapshot.

Exclude generated `DerivedData`, `BuildLogs` and `xcuserdata` from shared source packages. If synced Documents metadata causes a signing error about resource forks or Finder information, use a local temporary build/archive directory outside that synced folder. Do not weaken signature verification.
