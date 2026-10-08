# Ahmad Career — Apple app source

Version 1.1: iPhone and iPad use a fully native SwiftUI interface with native navigation, search, forms, saving, sharing and salary comparison. The Mac version uses the bundled workspace in WKWebView. Both query employer feeds through URLSession and work without a website server. Deployment minimums are iOS/iPadOS 16 and macOS 13.

## Open and run

1. Open `AhmadCareer.xcodeproj` in Xcode.
2. Select the shared **AhmadCareer** scheme.
3. Select **My Mac** or an installed **iPhone/iPad Simulator**, then Run.
4. For an actual iPhone or iPad, select the **AhmadCareer** target → **Signing & Capabilities** → your own Apple development team. The default bundle identifier is `com.ahmadalayed.career`; change it if your team needs a unique identifier. Connect the device, enable Developer Mode when prompted by iOS, select it as the destination, then Run.

The project has no development team or signing certificate selected. No account credentials or provisioning profiles are included. Distribution, TestFlight, notarization, and App Store submission are separate developer actions. The iPhone interface is native SwiftUI; the Mac interface uses bundled web resources. Neither build has been submitted to TestFlight or the App Store.

The separately delivered **Ahmad-Career-macOS-Unsigned.zip** (not committed here) contains a universal Intel/Apple Silicon Release app, tested launching locally on this Mac. It has only the linker's ad-hoc signatures, with no Developer ID certificate or team, and is not notarized. Another Mac may require an appropriately signed build; use this source project and your own development team. The app has not been installed into Applications.

The separately delivered **Ahmad-Career-iOS.ipa** (not committed here) is a development-signed iPhone/iPad build, not an App Store download. It can run only on devices registered in its provisioning profile (including Saleh’s paired iPhone). The profile expires 28 July 2027, subject to earlier certificate/profile revocation. Xcode’s device connection reset during installation, so installation on the physical phone is not confirmed. For Ahmad’s phone, use this source with his own development team, or an authorized TestFlight distribution.

## Command-line verification

Run from this directory with full Xcode selected:

```sh
bash Checks/check.sh

xcodebuild -project AhmadCareer.xcodeproj -scheme AhmadCareer \
  -configuration Debug -destination 'platform=macOS,arch=arm64' \
  -derivedDataPath DerivedData/macOS CODE_SIGNING_ALLOWED=NO build

xcodebuild -project AhmadCareer.xcodeproj -scheme AhmadCareer \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath DerivedData/iOS CODE_SIGNING_ALLOWED=NO build
```

The checks cover the strict refresh message, allowed navigation, employer URL boundaries, Saudi location checks, open deadlines, public Qiddiya listings, future dates, and unknown salary handling. The builds above compile without using signing credentials; they do not install the app on a device.

An optional live check contacts the seven configured public employer sources and saves the returned payload in `BuildLogs/live-refresh.json`:

```sh
bash Checks/check.sh --live
```

## Refresh and storage

- On iPhone, open Search and tap Find new openings, or pull to refresh. On Mac, the toolbar reloads the bundled workspace; use the workspace refresh action to query employers.
- The Mac web bridge accepts only `window.webkit.messageHandlers.careerSearch.postMessage({action: 'refresh'})` from the bundled main frame. Results are delivered through `window.receiveNativeJobs(payload)` using structured WebKit arguments.
- The fixed Workday sources are Alcon, Novartis, Johnson & Johnson, GSK, BD, and Roche. Each checks up to 20 Saudi search results and then the relevant job details; Novartis uses its verified Saudi country facet. Qiddiya checks up to two pages for each of healthcare, procurement, and performance on its public Workable board. Pagination limits and source failures remain visible in the payload.
- Sources are queried concurrently with a 45-second budget per employer and request cancellation. Completed partial results remain usable with visible coverage warnings. Redirects are refused. This is not a general network proxy; the webpage cannot choose a URL, employer, or request body for the native bridge.
- A listing must pass the source-specific public/open and Saudi-location checks, then match the supply chain, procurement, logistics, planning, inventory, supplier, performance, improvement, transformation, operations-manager, or business-value-partner title filter. Internships and unrelated clinical, scientific, engineering, sales, graduate, early-career, regulatory, and QA/RA titles are excluded. A healthcare title alone does not qualify. Workday records explicitly marked unposted, future starting dates, and expired deadlines are excluded. Missing salary stays unknown. Live discoveries are marked **Needs review** and do not automatically become curated recommendations.
- iOS records are Codable JSON in Application Support, saved atomically through one store shared by all windows. Saved/tracked vacancy snapshots survive later search omissions; malformed saved files are preserved instead of overwritten. Profile editors protect dirty drafts and reject conflicting edits from another window. Mac uses the persistent WebKit store and web local storage. There is no account or cross-device sync. Removing the app or clearing data can erase state; share application notes as a readable backup.
- Offline, the bundled workspace and saved state remain available. Live refresh requires a working internet connection; public employer endpoints can fail or change, and a listing can close after a check.
- HTTP/HTTPS job links open in the default browser. User-activated email links open the default mail application. Other external schemes and navigation outside the bundled Web folder are blocked.

## Native iOS data and checks

`NativeCareerViews.swift` contains the iOS screens. `NativeCareerStore.swift` loads `CareerResearch.json`, validates and persists records, preserves recent employer facts separately from editorial rankings, and parses salary inputs. The research JSON is a dated snapshot, not a live ranking.

`Checks/check.sh` includes the native model checks and deterministic URLSession fixtures for partial failure and deadlines. To exercise actual feeds and persistence through the native store:

```sh
swiftc AhmadCareer/NativeCareerStore.swift AhmadCareer/CareerFeed.swift Checks/NativeLiveCheck.swift -o BuildLogs/check-native-live
BuildLogs/check-native-live AhmadCareer/CareerResearch.json
```

## Maintain the shared Mac interface

Replace the contents of `AhmadCareer/Web` with the current web workspace, preserving its `index.html` entry point and relative resource URLs. The folder is copied as one app resource, so no Xcode project edit is needed when adding web assets. Use classic scripts for file-based loading. Keep `receiveNativeJobs` and the refresh message contract compatible with the Swift bridge.

`DerivedData` and `BuildLogs` are generated verification artifacts. Exclude them, along with `xcuserdata`, when sharing the source package.

## Optional Mac runtime check

This executes the real bundled WKWebView and native employer-search bridge using isolated, nonpersistent WebKit data. It checks saving, tracking, recovery, and readable note export without changing the app’s normal workspace:

```sh
mkdir -p BuildLogs
swiftc AhmadCareer/CareerPolicy.swift AhmadCareer/CareerFeed.swift AhmadCareer/CareerWebView.swift Checks/WebRuntimeCheck.swift -o BuildLogs/check-web-runtime
BuildLogs/check-web-runtime "$PWD/AhmadCareer/Web"
```

If cloud-backed Documents storage adds Finder metadata and code signing reports “resource fork, Finder information, or similar detritus,” choose a local temporary DerivedData/archive location outside that synced folder. Do not weaken signing verification.
