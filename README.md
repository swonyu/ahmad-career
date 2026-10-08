# Ahmad Career

A private career workspace for Ahmad Alayed, focused on healthcare supply-chain and performance leadership opportunities in Saudi Arabia.

- **iPhone and iPad:** native SwiftUI interface with researched opportunities, live employer search, saved roles, application tracking, profile editing and salary comparison.
- **Mac:** bundled web interface in WKWebView, with native employer requests.
- **Website:** dependency-free JavaScript interface and a Worker backend.

## Repository layout

| Folder | Contents |
| --- | --- |
| `apple/` | Shared Xcode project, Swift source, app icons, bundled Mac interface and native checks |
| `website/` | Website source, employer adapters, local server, Worker build and regression checks |
| `docs/App-Review.html` | Full review, 24 grouped findings, fixes and verification evidence |

## Run the Apple app

Open `apple/AhmadCareer.xcodeproj` in Xcode and select the **AhmadCareer** scheme. Choose an iPhone/iPad Simulator or **My Mac**, then Run. The project targets iOS/iPadOS 16+ and macOS 13+; the delivered builds were verified with Xcode 27.

For a physical iPhone, select your Apple team in **Signing & Capabilities**, keep automatic signing enabled, connect and unlock the phone, choose it as the destination, then Run. Change the bundle identifier if Xcode reports that it is unavailable. No development team is fixed in the source.

Ahmad only has an iPhone. A developer can build on a Mac and install onto his registered phone, or distribute through TestFlight using an eligible paid Apple Developer team. This repository itself is not an iPhone installation link. No TestFlight or App Store build has been published.

See [Apple setup and checks](apple/README.md).

## Run the website

With Node.js 22 or newer:

```sh
cd website
npm start
```

Open http://127.0.0.1:8778. No dependency installation or paid API key is required.

```sh
npm test
npm run build
```

The build produces `dist/server/index.js`. The existing hosted site uses Sites; its project binding is retained in `website/.openai/hosting.json`. GitHub pushes do not automatically publish changes to that site.

## Native checks

On a Mac with Xcode selected:

```sh
cd apple
bash Checks/check.sh
```

Optional live employer and Mac WebKit checks are documented in `apple/README.md`.

## Keeping the interfaces aligned

The Mac app bundles the files from `website/web/` in `apple/AhmadCareer/Web/`. Copy updated web files there before rebuilding the Mac app. Native iOS uses `NativeCareerViews.swift`, `NativeCareerStore.swift` and `CareerResearch.json`; changes to researched content must also update that JSON snapshot. Web and Swift employer adapters have separate regression checks.

## Research and privacy

The top ten are a research snapshot from **8 October 2026**, with conditional fit and documented qualification gaps. Seven roles are at Qiddiya. Live search checks bounded samples from seven employer boards; it is not exhaustive Saudi market coverage or an automatic replacement ranking. Missing results do not establish closure.

Ahmad's complete CV was unavailable. The researched vacancies did not disclose salary; live lead salaries were not checked. Historical salary benchmarks are context, not offers or guarantees.

Profile entries, saved jobs and application status stay on each browser/device. There is no account or device sync. Applications are reviewed and submitted personally on employer websites. This repository contains the public research snapshot and source, not local user records or signing credentials.

The existing website at https://ahmad-career.jolly-lynx-4861.chatgpt.site/ is owner-private. GitHub repository access does not grant access to the hosted website. Invite collaborators explicitly when needed.

## Review and release status

The review report records passing website state/feed/server checks, native feed/store checks, simulator and Mac builds, actual Mac WebKit workflows, and a development-signed iOS archive. The updated private website was published. Physical iPhone installation remains unverified after a device connection reset. Signed binaries and provisioning profiles are excluded from this source repository.
