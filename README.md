# Ahmad Career

Saudi healthcare supply-chain and performance career workspace with a native SwiftUI iPhone/iPad app, a Mac WKWebView interface and a dependency-free website.

The [website is public](https://ahmad-career.jolly-lynx-4861.chatgpt.site/). This private source repository does not restrict website access, and a GitHub push does not deploy the site.

## Current release — 9 October 2026

- Public website version 5 deployed at **04:35:14 Asia/Riyadh (01:35:14 UTC)** from source `794d68ee65742c1627ddc5491e8cceb0532b626a`. A real **Find new openings** check at 04:35 showed **six of six employers responding and three current leads**, from Johnson & Johnson, Roche and Alcon. These counts describe that run, not future availability.
- Apple source is **1.1 (5)**. The iOS archive, App Store distribution export and upload succeeded; upload completed at 04:26 Riyadh. At **04:41 Riyadh**, Apple showed build 5 processed and **Ready to Submit** while build 4 remained **Waiting for Review**. Apple blocked build-5 submission because another build was already in review. Build 4's review was preserved; resubmit build 5 after that review completes.
- The [one-tester TestFlight invitation](https://testflight.apple.com/join/S5bDCNbd) has no verified approved build available. Confirm tester availability before treating it as an installation route. Installation on Ahmad's physical iPhone remains unverified.

See the [release review](docs/Review-2026-10-09.html), [handoff](docs/START-HERE.txt) and [TestFlight record](docs/TestFlight-Preparation.txt). Package downloads and their checksums are supplied separately and are not stored in this repository. The separately delivered development IPA remains 1.1 (3); the reviewed Mac 1.1 (5) package is unsigned and not notarized.

## Source and documentation

| Path | Contents |
| --- | --- |
| [apple/](apple/) | Xcode project, Swift source, bundled Mac web assets and native checks |
| [website/](website/) | Web interface, employer adapters, local server, Worker build and checks |
| [Current review](docs/Review-2026-10-09.html) | Completed review evidence, release status and limits |
| [Historical review](docs/App-Review.html) | Earlier findings; its old counts and release claims are superseded |
| [Privacy draft](docs/Ahmad-Career-Privacy.html) | Historical build-4 draft, not the current published developer policy |

## Run and check

Open `apple/AhmadCareer.xcodeproj` in Xcode and select the **AhmadCareer** scheme. Choose **My Mac** or an iPhone/iPad Simulator, then Run. Minimum versions are iOS/iPadOS 16 and macOS 13. For a physical device, select an authorized development team, connect and unlock the device, and enable Developer Mode if prompted. The shared source includes no development team selection or signing credentials.

```sh
cd apple
bash Checks/check.sh
```

Optional live-feed and actual Mac WebKit checks are in the [Apple README](apple/README.md).

For the website, use Node.js 22 or newer. No dependency installation or paid API key is required:

```sh
cd website
npm start
```

Open [the local website](http://127.0.0.1:8778). From the same website directory:

```sh
npm test
npm run build
```

The build emits `dist/server/index.js`. The existing Sites hosting binding is retained in `website/.openai/hosting.json`; deployment is separate from source control.

## Research and local criteria

The dated **9 October 2026** snapshot contains **nine curated healthcare roles**, without padding the list to ten. All nine have unknown salary. Live search covers bounded samples from **six employers**: Alcon, Novartis, Johnson & Johnson, GSK, BD and Roche. Qiddiya is not active. A missing role does not establish closure, and a live lead does not automatically become a researched recommendation.

Fit is conditional on substantiated qualifications, relevant experience, role scope and current employer requirements. Historical salary guides do not establish a vacancy's pay or guarantee a director-level role.

Optional discovery criteria are stored locally: city, a minimum monthly SAR amount and whether to show unverified pay. Defaults are any Saudi city, no pay floor and unknown pay shown. Unknown salary never counts as meeting a minimum. Hiding unknown pay with an active floor can empty discovery; saved roles and application history remain available. Confirm a multiple-city assignment and the salary/allowance basis directly with the employer.

Profile and application records stay in the browser/app on each device, without account sync. Criteria are omitted from employer requests and exported notes; notes may include professional details the user enters. Existing saved data without the new fields remains supported. Exports are readable notes, not an importable backup. Ahmad reviews and submits applications personally; this review sent no new employer applications or messages.

This repository contains public professional/employer research and source. It excludes private CVs, private messages, photographs, personal pay preferences, runtime records, credentials, signing material and packaged binaries. App-icon assets are included.

## Verification and limits

Twenty review assignments completed. The recorded web suite passed core/feed checks, **38 application-state groups**, Worker cache-denial handling and employer-redirect regressions. Native checks, the iOS simulator build, universal Intel/Apple Silicon Mac Release and build-5 archive/export passed. A real Mac WebKit run rendered three leads from six source results and passed saving, tracking, cache preservation and note export. Targeted native UI checks covered Arabic-digit criteria entry, hidden unknown pay, saved notes and the share sheet; neutral criteria were restored.

Browser download receipt, full VoiceOver behavior and installation on Ahmad's physical iPhone remain unverified. Passing tests and upload success do not establish Apple beta approval or future employer availability.

The Mac interface's seven files in `apple/AhmadCareer/Web/` match `website/web/`. Keep them aligned when changing the website. Native iOS screens and storage live in `NativeCareerViews.swift` and `NativeCareerStore.swift`; the dated research is in `CareerResearch.json`. Web and Swift employer adapters retain separate regression checks.
