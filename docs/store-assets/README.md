# Career Finder — phone store assets

Prepared 16 November 2026; feature-graphic wording revised 18 November 2026. This folder supplies Google Play artwork, preserves the historical phone evidence, and records separately authorized ordinary phone captures. **The artwork, four Android screenshot candidates and four iPhone screenshot candidates are ready for publisher review.** Nothing in this folder establishes store submission or approval.

Use the existing [mobile store listing draft](../Mobile-Store-Listing-Draft.md) for the name, descriptions, keywords and review notes. The initial artwork review changed no app or runtime state. The dated Android follow-up below used the existing published preview APK on an isolated emulator; it did not rebuild the app or change source, signing or hosted service behavior. Use the [publishing handoff](../Publishing-Handoff-2026-11-17.md) and [release integration checklist](../Release-Integration-Checklist-2026-11-17.md) for current release prerequisites. The earlier [v6 handoff](../HOSTED-RELEASE-HANDOFF.md) is historical evidence.

## Prepared artwork

| File | Verified output | Purpose |
| --- | --- | --- |
| [feature-graphic.png](feature-graphic.png) | 1024 × 500; 8-bit RGB / 24-bit PNG; no alpha; 45,956 bytes | Google Play feature graphic. Accurate discovery, saving and preparation wording. |
| [feature-graphic.svg](feature-graphic.svg) | Editable vector, 1024 × 500 | Source for the feature graphic. Uses the established green document/check identity; contains no app screenshot or invented interface. |
| [play-icon.png](play-icon.png) | 512 × 512; 8-bit RGBA / 32-bit PNG; 5,373 bytes; alpha is 255 throughout | Google Play icon exported directly from the unchanged current [brand vector](../../apple/Branding/career-finder.svg). Full square, without an added corner mask or outer shadow. |

The feature graphic reads “Search jobs.” and “Save jobs and prepare applications.” Its three supporting labels are “Search”, “Save” and “Prepare”. It makes no live submission or guaranteed outcome claim. The small brand mark supports the wordmark without dominating the composition.

Suggested feature-graphic alt text: **Career Finder: search jobs, save job links and prepare applications.**

Both PNGs were visually inspected at their original size. They use the existing brand colors `#173E2D`, `#D5ECD9` and `#A7CA87`; the feature graphic adds cream text and a subtle dark green background pattern. ImageMagick identifies the outputs as sRGB; Inkscape exports do not embed an ICC profile. All phone screenshot originals remain byte for byte unchanged. The 18 November feature-graphic revision changes text only; the earlier vector and PNG remain recorded in the manifest and Git history. Exact hashes, source paths, renderer version and export commands are in [manifest.json](manifest.json).

### Reproduce the exports

Run from the repository root with Inkscape 1.4 (`e7c3feb100`, 2024-10-09). The feature graphic requires Noto Sans Regular/Bold and Noto Serif Display Regular; its text remains editable. Check the rendered typography if those fonts or the renderer change.

```sh
inkscape docs/store-assets/feature-graphic.svg \
  --export-type=png --export-png-color-mode=RGB_8 \
  --export-background='#173E2D' --export-background-opacity=255 \
  --export-filename=docs/store-assets/feature-graphic.png

inkscape apple/Branding/career-finder.svg \
  --export-width=512 --export-height=512 \
  --export-type=png --export-png-color-mode=RGBA_8 \
  --export-background='#173E2D' --export-background-opacity=255 \
  --export-filename=docs/store-assets/play-icon.png
```

## Android ordinary capture follow-up — 16 November 2026

The release coordinator opened and accepted all four actual PNGs after reviewing the pixel-comparison and cleanup records. These are ordinary app screens from the existing **0.4.0 / version code 4** published Android preview, APK SHA-256 `3ce9a61e875eb295f6689993884b97d15a1356074e14775c5ebc55c6d0bf1c62`. The installed `base.apk` hash matched that exact file. This captures the current preview interface; it does not establish a store-signed release or physical-phone acceptance.

| Order and upload candidate | Visible state | Draft alt text |
| --- | --- | --- |
| [1. Discover jobs](android/01-discovery-results.png) | A real public Canonical Accountant role, EMEA location, Greenhouse source, check time and saving disclosure. | Career Finder shows a public Canonical role with location, source, check time and save controls. |
| [2. Keep a shortlist](android/02-saved-opportunities.png) | The same role saved on this phone. The self-reported employer-application checkbox remains unchecked. | A job saved on this phone in Career Finder, with an employer link and an unchecked application record. |
| [3. Prepare your profile](android/03-blank-profile.png) | An empty profile with 0 of 3 essentials ready. No personal name, email or résumé was entered. | A blank Career Finder profile shows the name, email and resume needed to prepare an application. |
| [4. Review application options](android/04-application-preparation.png) | Connection-required Auto Apply preparation with “Connect service”; no submitted application or verified receipt. | Career Finder asks to connect a service before reviewing and submitting supported applications. |

Every candidate is **1080 × 1920, 8-bit RGB / 24-bit PNG without alpha**. The emulator's native physical-display query and captured framebuffer both confirmed 1080 × 1920 at density 420 before ordinary UI work. The capture used standard text size, light appearance and the default English interface. Scrolling selected each view normally; some lower content continues below the visible area in Saved and Profile.

The four unchanged RGBA screenshots are retained in [android/originals/](android/originals/) as technical originals, not upload copies. Their alpha channel is entirely opaque. The separate RGB exports remove only that channel: **every RGB pixel and both dimensions are identical**. A second implementation, Pillow 13.0.0, independently checked the pixels, modes, dimensions and transfer hashes. There was no resizing, cropping, drawing or retouching. [capture-verification.json](android/capture-verification.json) records the exact APK, native display evidence, capture times, original/export hashes, visual acceptance and cleanup; [manifest.json](manifest.json) links this follow-up without replacing the original 16-image history.

The session performed ordinary public job discovery and one local save while unpaired. It entered no personal profile data, selected no CV, opened no employer link and sent no employer application. Job counts, availability and check times are specific to the capture. The Auto Apply image documents connection-required preparation; it is not evidence that live automatic submissions are enabled.

The first cold-boot attempt stopped on a capture-helper path-validation error before ordinary UI interaction. Only that helper check was corrected; the unchanged APK was then reinstalled and verified for the completed capture. Both attempts performed cleanup. Final cleanup read back the original observed 180% text, dark appearance and Arabic app locale before shutdown, restored the exact original 1080 × 2400 AVD configuration bytes, stopped only the owned emulator/ADB resources, and preserved the shared ADB service. No app build or acceptance suite was rerun.

## iPhone ordinary capture follow-up — 16 November 2026

All four actual PNGs were opened and accepted by the release coordinator. [Capture run 43955902261](https://github.com/swonyu/ahmad-career/actions/runs/43955902261), attempt 1, passed its single ordinary UI walkthrough in **98.074 seconds**. This artifact run is separate from the five-job code quality gate. It used an isolated GitHub-hosted **iPhone 17 Pro / iOS 26.5 simulator**, with the ordinary unsigned **Release** app: Career Finder, bundle `com.ahmadalayed.career`, observed version **1.1 (7)**. That version/build is simulator metadata, not a claimed TestFlight or App Store upload.

| Order and upload candidate | Visible state | Draft alt text |
| --- | --- | --- |
| [1. Start your search](iphone/store-01-start.png) | Career Finder start page with discovery, saved opportunities and a create-profile action; no personal profile. | Career Finder starts with job discovery, saved opportunities and a blank application profile. |
| [2. Discover public jobs](iphone/store-02-public-search.png) | Actual public roles, employers, locations and qualified remote wording. | Public Career Finder job results show role titles, employers, locations and qualified remote wording. |
| [3. Inspect a role](iphone/store-03-public-opportunity.png) | Canonical Accountant, EMEA, Greenhouse source, save controls and the saving-is-not-submitting notice. | A Canonical role shows location, source, save controls and a notice that saving does not submit an application. |
| [4. Prepare your next step](iphone/store-04-application-workspace.png) | One local opportunity, zero confirmations, the disconnected-service explanation and complete Set up Auto Apply action. | One locally saved opportunity and zero confirmations appear above the Set up Auto Apply button. |

Each file is its **unaltered 1206 × 2622, 8-bit RGB / 24-bit PNG original without alpha**. Source and destination byte counts and SHA-256 hashes match. No image was resized, cropped, redrawn, retouched or converted. Normal scroll continuation and native translucent navigation remain visible. In the opportunity screen, the employer and provider are visible; lower freshness information continues below the viewport. The fresh simulator used English, en_US and standard text size. Its appearance setting was not forced or measured; the reviewed images appear light.

The capture branch's **32 production source/resource files and both shared schemes** match verified source `0a56340fee907ffab0e4e5f25ac252de76a23c9c`. A whole-project guard limited the project changes to the exact capture-test references and membership entries. Product checks confirmed Release, the existing bundle identity, iPhone-only device family and disabled signing. The auxiliary workflow, project additions, helper and capture test are excluded from the production branch. [capture-verification.json](iphone/capture-verification.json) retains the source and product proof, image hashes, visual findings and prior capture history.

The first auxiliary run stopped before build when an optional light-appearance setter timed out. The next stopped before compilation because a settings query used a test-only scheme. Their failed logs and artifacts were preserved; each correction was confined to the capture harness. The successful run used the existing production scheme for settings and the existing acceptance scheme for build-for-testing and the ordinary capture. No production code, scheme, launch timeout or acceptance assertion was weakened for these corrections.

The walkthrough performed public discovery and one local save. It did not pair a phone, enter applicant information, select a CV, open an employer link or tap a submission control. A network trace was not captured. The final screen remains disconnected and contains no verified submission receipt. The job completed its disposable-simulator cleanup step; that step tolerates cleanup errors and does not establish a separate deletion readback. No local Apple tooling or physical phone was used.

## Historical phone captures: retain the original 16-image record

| Original set | Observed properties | Disposition |
| --- | --- | --- |
| 14 iPhone Air captures, CI run `43923335555`, attempt 2 | 1260 × 2736 RGB PNGs; current Career Finder branding; isolated synthetic UI workspace | **QA-only.** Ten frames visibly show the synthetic acceptance banner. Four sheets obscure that banner but retain the same synthetic provenance. Their dimensions match an accepted large iPhone slot; dimensions do not establish release screenshot eligibility. |
| Android `discovery-live-results.png` | 1080 × 2400 RGBA PNG; all pixels opaque; ordinary Jobs UI with public roles, source information and save controls | **Useful composition reference; recapture required.** It comes from the earlier 0.4 candidate, before the final dialog fixes. Its 20:9 aspect ratio exceeds Play's 2:1 limit and it retains an alpha channel. Counts and check dates are time-specific. |
| Android `country-keyboard-final.png` | 720 × 1600 RGBA PNG; all pixels opaque; large text, country selector and keyboard | **QA-only.** This is the final compact-width Arabic RTL country-selection exercise, not an Arabic app localization claim. It also has a 20:9 aspect ratio and an alpha channel. The identical repository copy is [android-country-keyboard-final.png](../phone-polish-evidence/android-country-keyboard-final.png). |

No real applicant details or credentials were visible in these reviewed originals. The iPhone profile and employer examples are test fixtures. No stale “Ahmad Career” branding was visible in the reviewed app surfaces. Legacy source-directory and repository names are provenance, not proposed display names.

Keep these originals as evidence. Do not remove test labels, replace fixture content, crop out inconvenient UI, stretch a 20:9 capture to 9:16, or present synthetic receipts as real submissions. New release screenshots should come from the ordinary app in the intended release configuration.

The full 14-image iPhone index includes artifact members, test names, capture times and hashes in the [final CI record](../phone-polish-evidence/iphone-ci-43923335555-attempt-2.json). This folder's manifest adds image properties and per-image visual assessments without copying those originals. Android APK identities and capture history are preserved in [Android verification](../../android/checks/verification.json). In particular, the ordinary public-search image belongs to APK `d1d235edf5cefaa3880d09aaeba5dc0e858a86e484034c9801140934fd9599f2`; the final country image belongs to `3ce9a61e875eb295f6689993884b97d15a1356074e14775c5ebc55c6d0bf1c62`.

### Large-text iPhone issue and separate fix

The original `12-application-workspace-accessibility-text.png` shows the setup action shortened to “Set up Auto Ap…” at very large accessibility text. The separate correction at source `0a56340fee907ffab0e4e5f25ac252de76a23c9c` changes one production view and its existing UI test. [Fresh CI and actual after-image review](../phone-polish-evidence/iphone-ci-43949653473-attempt-2.json) now verify the complete two-line action and connection-sheet open/dismiss flow: all five gates passed, with seven of seven native UI cases passing after one unchanged failed-job retry. The first launch-timeout failure is retained. The fixture banner's navigation-title overlap remains a synthetic QA observation, and these QA images remain separate from ordinary store captures. The initial artwork review and Android capture did not themselves change app source or rerun its acceptance suite.

## Current store format requirements

Checked against the official pages on 16 November 2026; recheck the publisher console at submission.

| Destination | Current requirements relevant to this phone release |
| --- | --- |
| Apple screenshots | 1–10 per device size; JPEG/JPG/PNG without alpha. The required iPhone category is Dynamic Island, medium display: 1179 × 2556 or 1206 × 2622 portrait. 1260 × 2736 is accepted in the large category. Apple documents scaling between categories; this app's required-slot/scaling acceptance has not been checked in App Store Connect. |
| Play screenshots | At least 2 overall; up to 8 per device type. JPEG or 24-bit PNG without alpha; each dimension 320–3840; longer side at most twice the shorter. For screenshot-based recommendations, apps need at least 4 images, with portrait 9:16 at 1080 × 1920 minimum. |
| Play feature graphic | 1024 × 500; JPEG or 24-bit PNG without alpha. |
| Play store icon | 512 × 512; 32-bit PNG with alpha; maximum 1024 KB. sRGB, full square; let Play apply corner masking and the outer shadow. |

Sources: [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications), [Google Play preview assets](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en), and [Google Play icon design specifications](https://developer.android.com/distribute/google-play/resources/icon-design-specifications). These are format checks, not an assurance of review approval.

## Remaining submission checks

Both phone sets are captured and visually accepted for publisher review. The iPhone originals match a documented medium-category portrait size; the four Android RGB copies match the recorded native 9:16 display. Final store-console slot acceptance and correspondence to the actual signed release still require the publisher. No iPad or desktop set is requested.

Use the per-platform tables above for sequence and alt text. Every proposed alt text is under 140 characters. Public roles, availability and check times are specific to their capture. The screenshots show supported-board discovery, local saving and application preparation; they do not claim universal coverage or enabled live automatic submissions.

Before submission, confirm the final release version/build, signing, operator/support details, privacy disclosures and relevant physical-phone/account acceptance in the [publishing handoff](../Publishing-Handoff-2026-11-17.md) and [release integration checklist](../Release-Integration-Checklist-2026-11-17.md). Preserve all originals and their history. If a later production change requires new images, capture the ordinary app again; do not alter these images or substitute the synthetic QA set.

The initial artwork review performed no app/runtime action. The separate Android and GitHub-hosted iPhone capture follow-ups are documented above. This asset package performed no store upload, submission or publication.
