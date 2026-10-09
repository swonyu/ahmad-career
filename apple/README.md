# Ahmad Career — Apple app source

iPhone and iPad use native SwiftUI navigation, search, profile forms, saving, sharing and salary comparison. Mac uses the bundled workspace in WKWebView. Both Apple apps query employer feeds through URLSession without depending on the hosted website. Minimum versions are iOS/iPadOS 16 and macOS 13.

## Release status — 9 October 2026

- [Website version 7](https://ahmad-career.jolly-lynx-4861.chatgpt.site/) deployed at **07:49:53 Riyadh (04:49:53 UTC)** from source `96c182097356609a1ccc19fdd7ee6fe769de0811`. A new live search at **07:59 Riyadh** completed with six responding employers and three leads. Existing saved/applied records remained visible after the release; this describes this browser, not cross-device sync.
- Apple source is **1.1 (7)**. Mac Debug, iOS simulator, universal Mac Release, iOS archive and App Store export passed. Strict signatures passed for the archive and exported IPA. Upload succeeded at **07:53:58 Riyadh**, exit code 0; Apple showed **Ready to Submit at 07:56**. Build 4 remained **Waiting for Review**. Its review is preserved; Apple explicitly blocks another version 1.1 build until the existing build is approved. Build 7 has not been submitted or approved. Testing notes were saved at 07:59. Builds 5 and 6 are superseded.
- The [one-tester TestFlight invitation](https://testflight.apple.com/join/S5bDCNbd) has no verified approved build available. Physical-iPhone installation and complete VoiceOver remain unverified.
- Final checks passed: core, **12 feed groups**, **45 application-state groups**, server failure/cache/cooldown/coalescing cases and native offline checks. Independent targeted regressions verified corrected chronology, record preservation, storage recovery and dialog behavior. Local browser focus/theme checks passed; live website search is separately recorded above.
- The seven web assets and native research match source, build 7 Mac, archive and exported IPA. Refreshed source/Mac ZIPs are version 7. `Ahmad-Career-iOS.ipa` remains the older development **1.1 (3)**, not the App Store export. See [release evidence](../Review-2026-10-09.html) and [checksums](../SHA256SUMS.txt).

The public professional profile now states Regulatory KPI Department Manager at the Supply Chain Command Center, KPI coverage across 20 health clusters and Ministry of Health branches, prior Quality Control leadership of more than 10 staff, NUPCO coordination, and Power BI, SQL and Excel. These are self-reported professional facts, not independently verified credentials. Employment dates, nine researched jobs and specialist qualification gates are unchanged.

The research snapshot remains dated 9 October 2026 and contains **nine healthcare leads**, all with undisclosed salary. Role fit, seniority and pay still require confirmation; the profile correction does not establish any specialist experience minimum or a salary offer. No private preferences, CV, chat content or photos were added.

## Open and run

1. Open `AhmadCareer.xcodeproj` in Xcode and select the shared **AhmadCareer** scheme.
2. Select **My Mac** or an installed **iPhone/iPad Simulator**, then Run.
3. For a physical iPhone or iPad, select the target's **Signing & Capabilities** and your authorized Apple development team. The default bundle identifier is `com.ahmadalayed.career`; change it if your team needs a unique identifier. Connect and unlock the device, enable Developer Mode when prompted, select it as the destination, then Run.

The shared project has no development team selected and includes no account credentials or provisioning profiles. Distribution signing and uploaded TestFlight builds are separate from these portable project settings.

The older development IPA is restricted to devices registered in its provisioning profile, including Saleh's paired iPhone. Its profile expires 28 July 2027 unless revoked earlier. Physical installation was not confirmed after Xcode's device connection reset. It is not an App Store download or an install route for an unregistered phone.

The refreshed `Ahmad-Career-macOS-Unsigned.zip` contains the universal Intel/Apple Silicon **1.1 (7)** Release app. It is unsigned and not notarized: strict signature verification reports that the code object is not signed. It must not be represented as a signed distribution. Another Mac may require an appropriately signed build.

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

The completed native checks cover pre-criteria migration, local-only criteria and preserved saved/tracked records. The earlier build-5 Mac runtime run rendered three leads from six source results and passed saving, tracking, cache recovery and note export. The reviewed web assets match both the native source bundle and the built Mac resources byte-for-byte. These results describe that run; employer availability and later source changes require fresh checks.

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
