# Ahmad Career

Saudi healthcare supply-chain and performance career workspace with a native SwiftUI iPhone/iPad app, a Mac WKWebView interface and a dependency-free website.

The [website is public](https://ahmad-career.jolly-lynx-4861.chatgpt.site/). This private source repository does not restrict website access, and a GitHub push does not deploy the site.

## Current release — 9 October 2026

- Public website **version 6** deployed at **05:31:58 Asia/Riyadh (02:31:58 UTC)** from source `20aa61b6b15817c3ea98865ebfe8105e38654ce2`. The live Profile, application plan and Roche preparation note displayed the corrected manager title at 05:32–05:33. The earlier 04:35 search showed six of six employers responding with three leads from Johnson & Johnson, Roche and Alcon; it was not replayed for this profile-only release.
- Apple source is **1.1 (6)**. The universal Mac Release, iOS archive and App Store export passed, with strict iOS signature verification and source parity. Upload succeeded at **05:34:11 Riyadh**, exit code 0. At **05:38**, Apple showed build 6 processed and **Ready to Submit**, build 5 Ready to Submit and build 4 Waiting for Review. Build-6 submission has not been attempted. The prior build-5 submission was blocked by build 4's review, which remains intact. Build 5 is superseded: submit the processed latest build 6 when Apple permits it, preserving build 4's existing review. Build 6 is not externally approved or available for testing.
- The [one-tester TestFlight invitation](https://testflight.apple.com/join/S5bDCNbd) has no verified approved build available. Confirm tester availability before treating it as an installation route. Installation on Ahmad's physical iPhone remains unverified.

See the [release review](docs/Review-2026-10-09.html), [handoff](docs/START-HERE.txt) and [TestFlight record](docs/TestFlight-Preparation.txt). Package downloads and their checksums are supplied separately and are not stored in this repository. The separately delivered development IPA remains 1.1 (3); the reviewed Mac 1.1 (6) package is unsigned and not notarized.

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

The corrected public profile states Regulatory KPI Department Manager at the Supply Chain Command Center, KPI coverage across 20 health clusters and Ministry branches, prior Quality Control leadership of more than 10 staff and NUPCO coordination, and Power BI, SQL and Excel. These are self-reported facts, not independent credential verification. Employment dates and specialist experience gates are unchanged. No private preferences, CV or photos were added.

Fit is conditional on substantiated qualifications, relevant experience, role scope and current employer requirements. Historical salary guides do not establish a vacancy's pay or guarantee a director-level role.

Optional discovery criteria are stored locally: city, a minimum monthly SAR amount and whether to show unverified pay. Defaults are any Saudi city, no pay floor and unknown pay shown. Unknown salary never counts as meeting a minimum. Hiding unknown pay with an active floor can empty discovery; saved roles and application history remain available. Confirm a multiple-city assignment and the salary/allowance basis directly with the employer.

Profile and application records stay in the browser/app on each device, without account sync. Criteria are omitted from employer requests and exported notes; notes may include professional details the user enters. Existing saved data without the new fields remains supported. Exports are readable notes, not an importable backup. Ahmad reviews and submits applications personally; this review sent no new employer applications or messages.

This repository contains public professional/employer research and source. It excludes private CVs, private messages, photographs, personal pay preferences, runtime records, credentials, signing material and packaged binaries. App-icon assets are included.

## Verification and limits

Twenty review assignments completed. After the final profile copy, the full web suite passed core/feed checks, **38 application-state groups**, Worker cache-denial handling and employer-redirect regressions. Native offline checks passed with nine jobs. The universal Mac 1.1 (6) Release, iOS build-6 archive/export, strict signature verification and source parity passed. Earlier build-5 simulator and targeted UI checks remain dated evidence: the Mac WebKit run rendered three leads from six source results and passed saving, tracking, cache preservation and note export; native criteria, saved notes and share-sheet checks passed, with neutral defaults restored.

Actual notes downloads in the Codex in-app browser and Chrome were verified at **05:17 Riyadh**. Each saved a 564-byte file with the correct export timestamp, research date, four “Not provided” placeholders and six unchecked checklist items. The files matched except for the timestamp and contained no discovery criteria. The automation download-event wait timed out despite successful saves; no code fix was needed. Chrome showed no unexpected notes dialog or console errors.

Full VoiceOver behavior and installation on Ahmad's physical iPhone remain unverified. Passing tests and upload success do not establish Apple beta approval or future employer availability.

The Mac interface's seven files in `apple/AhmadCareer/Web/` match `website/web/`. Keep them aligned when changing the website. Native iOS screens and storage live in `NativeCareerViews.swift` and `NativeCareerStore.swift`; the dated research is in `CareerResearch.json`. Web and Swift employer adapters retain separate regression checks.
