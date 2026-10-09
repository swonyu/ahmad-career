# Ahmad Career

Saudi healthcare supply-chain and performance career workspace with a native SwiftUI iPhone/iPad app, a Mac WKWebView interface and a dependency-free website.

The [website is public](https://ahmad-career.jolly-lynx-4861.chatgpt.site/). This private source repository does not restrict website access, and a GitHub push does not deploy the site.

## Current release — 9 October 2026

- Public website **version 9** deployed at **13:38:21 Riyadh (10:38:21 UTC)** from source `943dcfe1ddcff0710eb51e926b7acb3e5b5c3df0`. Optional application dates and plain-text receipt notes remain separate from status/edit time. Needs attention derives deadline, requirements and optional missing-date prompts. Production readback retained all three existing saved/applied roles.
- Universal **Mac Release 1.1 (9)** compiled for Intel and Apple Silicon with matching web resources; unsigned and not notarized. Local **iOS Simulator Debug 1.1 (9)** compiled with new native record functionality. Shared Xcode default remains 7; builds used `CURRENT_PROJECT_VERSION=9`. No iOS 9 distribution archive, upload, installation or native UI run occurred. The owner-opened Mac 8 window was left running.
- **iOS 1.1 (7)** remains the latest uploaded build. Last server-backed Apple rows at **08:59 Riyadh**: **7 Ready to Submit / 4 Waiting for Review**. Refresh around **10:00 Riyadh** returned sign-in with `authResult=FAILED`; no fresh status follows. Secure owner sign-in is required before checking again. Preserve build 4's queue. Build 7 is not verified submitted, approved or installable.
- The [TestFlight invitation](https://testflight.apple.com/join/S5bDCNbd) is not a verified installation route. Physical-iPhone installation and full VoiceOver remain unverified.

See the [release review](docs/Review-2026-10-09.html), [handoff](docs/START-HERE.txt) and [TestFlight record](docs/TestFlight-Preparation.txt). Packages and checksums are supplied separately. The development IPA remains 1.1 (3), registered devices only, not the uploaded App Store export. Current native/web source differs from uploaded iOS 7.

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

Profile and application records stay in the browser/app on each device, without account sync. Criteria are omitted from employer requests and exported notes; full tracking exports include user-entered receipt notes and labeled unsaved record drafts, while per-role preparation notes exclude receipts. Review text before sharing. Existing saved data without the new fields remains supported. Exports are readable notes, not an importable backup. Changing a local application status does not submit an application. Actual employer submissions and acknowledgements are separate records.

This repository contains public professional/employer research and source. It excludes private CVs, private messages, photographs, personal pay preferences, runtime records, credentials, signing material and packaged binaries. App-icon assets are included.

## Verification and limits

Version 9 passed core and record checks, **52 application-state groups**, **12 feed-boundary groups**, and the extended native-store check. Independent native storage review passed 74 assertions in seven groups before a final whitespace-only identity guard; root's final-source check passed afterward. Scoped parser/storage/refresh/native-view findings were corrected and rechecked. Isolated two-tab browser readback exercised save, conflict refusal, draft retention, plaintext and attention; screenshots failed, so no pixel-quality pass is claimed.

Universal Mac Release and iOS Simulator Debug 1.1 (9) compiled, with all seven web assets and research matching source. No actual native editor UI/full VoiceOver test followed. Earlier version-7 archive/export/signature and full server receipts remain dated. Last real website search remains version 7 at **07:59 Riyadh**, six responding employers/three leads; no new live search was run for this feature.
Earlier build-5 simulator and Mac WebKit checks remain historical evidence: native criteria, notes and share sheet; Mac search, saving, tracking, cache preservation and note export. Those earlier results are not fresh physical-device checks.
Actual notes downloads in the Codex in-app browser and Chrome were verified at **05:17 Riyadh**. Each saved a 564-byte file with the correct export timestamp, research date, four “Not provided” placeholders and six unchecked checklist items. The files matched except for the timestamp and contained no discovery criteria. The automation download-event wait timed out despite successful saves; no code fix was needed. Chrome showed no unexpected notes dialog or console errors.

Full VoiceOver behavior and installation on Ahmad's physical iPhone remain unverified. Passing tests and upload success do not establish Apple beta approval or future employer availability.

The Mac interface's seven files in `apple/AhmadCareer/Web/` match `website/web/`. Keep them aligned when changing the website. Native iOS screens and storage live in `NativeCareerViews.swift` and `NativeCareerStore.swift`; the dated research is in `CareerResearch.json`. Web and Swift employer adapters retain separate regression checks.
