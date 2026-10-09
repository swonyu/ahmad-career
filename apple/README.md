# Ahmad Career — Apple app source

iPhone and iPad use native SwiftUI navigation, search, profile forms, saving, sharing and salary comparison. Mac uses the bundled workspace in WKWebView. Both Apple apps query employer feeds through URLSession without depending on the hosted website. Minimum versions are iOS/iPadOS 16 and macOS 13.

## Release status — 9 October 2026

- The companion website is public: [Ahmad Career](https://ahmad-career.jolly-lynx-4861.chatgpt.site/). Final version 5, source `794d68ee65742c1627ddc5491e8cceb0532b626a`, deployed at 04:35:14 Asia/Riyadh (01:35:14 UTC). A real **Find new openings** check at 04:35 Riyadh showed **six of six employers responding and three current leads**, from Johnson & Johnson, Roche and Alcon. Cache-permission and employer-redirect corrections are included. This verifies that recorded run, not future employer availability.
- iOS/iPadOS **1.1 (5)** was archived, exported with App Store distribution signing and successfully uploaded at **04:26 Asia/Riyadh**. At **04:41 Asia/Riyadh**, App Store Connect showed processing complete and **Ready to Submit**. An attempted external-beta submission was blocked because build 4 is already in review. Build 5 must be resubmitted after that review completes; it is not yet approved or available for testing.
- The **1.1 (4)** beta remained **Waiting for Review at 04:41 Asia/Riyadh**. Its review was preserved and the blocked build-5 submission dialog was canceled. The one-tester [TestFlight invitation](https://testflight.apple.com/join/S5bDCNbd) has no verified approved build available; its last availability check did not allow testers to join. Ahmad's physical-phone installation remains unverified.
- This source is **1.1 (5)**. Twenty review assignments are complete. The web suite passed, including 38 application-state groups, Worker cache-denial handling and employer-redirect regressions. Native checks, the universal Mac Release build, iOS simulator build and build-5 archive/export passed. Targeted native criteria, notes and sharing interactions were checked. Actual notes downloads in the Codex in-app browser and Chrome were verified at **05:17 Riyadh**: both saved 564-byte files with correct timestamps, research date, four “Not provided” placeholders and six unchecked checklist items. Contents matched except for the export timestamp and excluded discovery criteria. The automation event wait timed out despite successful saves; no code fix was needed. Chrome showed no unexpected notes dialog or console errors. Full VoiceOver and physical-iPhone installation remain unverified.
- The source ZIPs and unsigned universal Mac ZIP were regenerated from this reviewed source. The separate `Ahmad-Career-iOS.ipa` is still the older development build **1.1 (3)**; it was deliberately not replaced with an App Store distribution IPA. See [the release review](../docs/Review-2026-10-09.html) and the separately supplied deliverable checksums.

The research snapshot is dated 9 October 2026 and contains **nine healthcare leads**, all with undisclosed salary; unsuitable jobs are not added to reach ten. Role fit, seniority and salary require confirmation. A job title or historical salary guide does not establish a director-level match or a pay offer.

## Open and run

1. Open `AhmadCareer.xcodeproj` in Xcode and select the shared **AhmadCareer** scheme.
2. Select **My Mac** or an installed **iPhone/iPad Simulator**, then Run.
3. For a physical iPhone or iPad, select the target's **Signing & Capabilities** and your authorized Apple development team. The default bundle identifier is `com.ahmadalayed.career`; change it if your team needs a unique identifier. Connect and unlock the device, enable Developer Mode when prompted, select it as the destination, then Run.

The shared project has no development team selected and includes no account credentials or provisioning profiles. Distribution signing and the submitted TestFlight build are separate from these portable project settings.

The older development IPA is restricted to devices registered in its provisioning profile, including Saleh's paired iPhone. Its profile expires 28 July 2027 unless revoked earlier. Physical installation was not confirmed after Xcode's device connection reset. It is not an App Store download or an install route for an unregistered phone.

The refreshed `Ahmad-Career-macOS-Unsigned.zip` contains the universal Intel/Apple Silicon **1.1 (5)** Release app. It is unsigned and not notarized: strict signature verification reports that the code object is not signed. It must not be represented as a signed distribution. Another Mac may require an appropriately signed build.

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

The completed native checks cover pre-criteria migration, local-only criteria and preserved saved/tracked records. The recorded Mac runtime run rendered three leads from six source results and passed saving, tracking, cache recovery and note export. The reviewed web assets match both the native source bundle and the built Mac resources byte-for-byte. These results describe that run; employer availability and later source changes require fresh checks.

## Refresh, criteria and privacy

- Search queries Alcon, Novartis, Johnson & Johnson, GSK, BD and Roche. **Qiddiya is not queried.** Each Workday source checks a bounded Saudi search sample of up to 20 listings and relevant details; Novartis uses its Saudi country facet. Sources run concurrently with a 45-second budget per employer and cancellation. Partial coverage and failures remain visible; a missing result does not establish closure.
- Listings must pass source, Saudi-location, availability, date and title checks. Live discoveries are labeled **Needs review**, not automatically promoted to the researched shortlist. Search is neither exhaustive Saudi-market coverage nor proof of eligibility.
- New optional profile criteria refine only Shortlist and Live search. Defaults are any Saudi city, no minimum monthly pay, and showing unverified pay. Riyadh requires explicit location evidence; multiple-location roles still require confirmation of the assignment.
- Minimum pay accepts whole SAR from 0 to 1,000,000, including supported Arabic digits and grouping. Blank or zero disables the pay floor. Current listings have no verified comparable salary evidence: unknown pay is **never treated as meeting a minimum**. Choosing to hide unverified pay with an active floor can empty discovery; it does not mean there are no vacancies. Confirm basic salary versus fixed allowances with the employer.
- Criteria do not alter editorial ranking, saved roles or application history. Existing data without the new fields remains readable. Saved and tracked records remain available when later searches or criteria exclude a role.
- Profile details and criteria remain in the local browser/app store. Criteria are excluded from search requests and exported notes. Exported notes can contain professional details explicitly entered by the user, so review them before sharing. No private CV, private messages or personal pay preferences belong in public source, fixtures, screenshots or deployed assets; source defaults contain no such preferences.
- Native iOS uses atomic Codable JSON storage in Application Support, shared by its windows. Invalid saved data is preserved instead of overwritten, and profile editors protect drafts and detect conflicts. Mac uses persistent WebKit storage; the hosted website uses that browser's local storage. There is no app account or cross-device sync. Removing the app or clearing browser data can erase state.
- Bundled research and saved state are available offline in the Apple apps. Live refresh requires internet access. Employer/recruitment providers receive ordinary connection information such as IP addresses; the native search request contains no profile, criteria or application notes. Users review and submit applications themselves on employer websites.

## Mac bridge and shared web resources

On iPhone, use **Find new openings** or pull to refresh. On Mac, the toolbar reloads the bundled workspace; its search action queries employers. The bridge accepts only `window.webkit.messageHandlers.careerSearch.postMessage({action: 'refresh'})` from the bundled main frame and delivers results through `window.receiveNativeJobs(payload)` using structured WebKit arguments. The webpage cannot select arbitrary URLs or request bodies for the native bridge. Redirects are refused by the native feed client.

HTTP/HTTPS external links open in the default browser; user-activated email links open the mail application. Other external schemes and navigation outside the bundled Web folder are blocked.

To update Mac's interface, copy the reviewed web workspace into `AhmadCareer/Web`, preserving `index.html`, relative resource URLs, classic scripts and the bridge contract. The folder is copied as one resource. Updating web source alone does not update a built Mac app or the public website; bundle propagation, runtime verification, rebuilding and deployment are separate steps.

`NativeCareerViews.swift` owns iOS screens. `NativeCareerStore.swift` loads `CareerResearch.json`, validates and persists records, and keeps recent employer facts separate from editorial ranks. The research JSON is a dated snapshot.

Exclude generated `DerivedData`, `BuildLogs` and `xcuserdata` from shared source packages. If synced Documents metadata causes a signing error about resource forks or Finder information, use a local temporary build/archive directory outside that synced folder. Do not weaken signature verification.
