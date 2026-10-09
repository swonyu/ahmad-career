# Ahmad Career

Saudi healthcare supply-chain and performance career workspace with a native SwiftUI iPhone/iPad app, a Mac WKWebView interface and a dependency-free website.

The [website is public](https://ahmad-career.jolly-lynx-4861.chatgpt.site/). This private source repository does not restrict website access, and a GitHub push does not deploy the site.

## Current release — 9 October 2026

- Public website **version 8** deployed at **08:43:59 Riyadh (05:43:59 UTC)** from source `01050a01a9b3a421f1aea222eb02bcc2c6d4bbc2`. Application notes capture newer saved profile/checklist values while preserving unsent drafts and failed-save recovery data. Three saved/applied records remained visible after reload.
- Universal **Mac 1.1 (8)** release compiled for Intel and Apple Silicon with the same corrected web assets. It is unsigned and not notarized. The shared Xcode build-number default remains 7; the Mac release used `CURRENT_PROJECT_VERSION=8`.
- Native iPhone SwiftUI is unchanged. **iOS 1.1 (7)** remains the latest upload, successful at **07:53:58 Riyadh** and last shown **Ready to Submit at 07:56**. Build 4 remained **Waiting for Review**. Its queue was preserved; Apple blocks another version 1.1 beta submission until it is approved. Build 7 is not verified submitted, approved or installable. No iOS build 8 was uploaded.
- The [TestFlight invitation](https://testflight.apple.com/join/S5bDCNbd) has no verified approved build available. Physical-iPhone installation and complete VoiceOver remain unverified.

See the [release review](docs/Review-2026-10-09.html), [handoff](docs/START-HERE.txt) and [TestFlight record](docs/TestFlight-Preparation.txt). Packages and checksums are supplied separately. The development IPA remains 1.1 (3), restricted to registered devices, not the uploaded App Store export. New web/Mac assets are not claimed identical to the earlier uploaded iOS 7 bundle.

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

Profile and application records stay in the browser/app on each device, without account sync. Criteria are omitted from employer requests and exported notes; notes may include professional details the user enters. Existing saved data without the new fields remains supported. Exports are readable notes, not an importable backup. Changing a local application status does not submit an application. Actual employer submissions and acknowledgements are separate records.

This repository contains public professional/employer research and source. It excludes private CVs, private messages, photographs, personal pay preferences, runtime records, credentials, signing material and packaged binaries. App-icon assets are included.

## Verification and limits

The note-freshness correction passed core checks, **47 application-state groups**, an independent five-case preservation/freshness probe, two recovery transitions and an actual two-tab browser note check. The universal Mac 1.1 (8) build passed, and its seven web assets match canonical source. The latest production UI reload retained all three existing saved/applied records.

Earlier version-7 checks passed 12 feed groups, server checks, native offline checks, Mac Debug, iOS simulator, Mac Release, iOS archive/export and strict archive/exported signatures. Those unchanged components were not rebuilt/retested for this web/Mac correction. The last real employer search was version 7 at **07:59 Riyadh**, six responding employers and three leads. No new live search was needed.
Earlier build-5 simulator and Mac WebKit checks remain historical evidence: native criteria, notes and share sheet; Mac search, saving, tracking, cache preservation and note export. Those earlier results are not fresh physical-device checks.
Actual notes downloads in the Codex in-app browser and Chrome were verified at **05:17 Riyadh**. Each saved a 564-byte file with the correct export timestamp, research date, four “Not provided” placeholders and six unchecked checklist items. The files matched except for the timestamp and contained no discovery criteria. The automation download-event wait timed out despite successful saves; no code fix was needed. Chrome showed no unexpected notes dialog or console errors.

Full VoiceOver behavior and installation on Ahmad's physical iPhone remain unverified. Passing tests and upload success do not establish Apple beta approval or future employer availability.

The Mac interface's seven files in `apple/AhmadCareer/Web/` match `website/web/`. Keep them aligned when changing the website. Native iOS screens and storage live in `NativeCareerViews.swift` and `NativeCareerStore.swift`; the dated research is in `CareerResearch.json`. Web and Swift employer adapters retain separate regression checks.
