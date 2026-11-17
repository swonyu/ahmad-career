# Public support navigation correction

Prepared on 17 November 2026 against app source `918cfaa455b76f217b21c6c01fe862ea95ebe920` and the separate public-pages commit `156b3363b409c660e88ff2fb96fc02bf0f55baca`. This folder contains an exact English/Arabic patch for publishing review. The public site has not been changed or redeployed by this work.

## Validated problem and correction

The opening paragraph in both public support pages describes the hosted web app's five sections as though they were also the native iPhone and Android sections. The candidate native apps have different navigation. The prepared patch identifies each platform and preserves local use without an online workspace.

| App | Sections in the current source | Source evidence |
| --- | --- | --- |
| Phone web app | Search, Saved, Apply, Profile, Settings | `hosted/app/phone/PhoneApp.tsx` |
| Native iPhone | Start, Search, Apply, Saved, Settings; Profile is reachable from Settings | `apple/AhmadCareer/NativeCareerViews.swift` |
| Native Android | Jobs, Apply, Receipts, Profile, Settings | `android/app/src/main/java/com/saleh/careerfinder/MainActivity.kt` |

The Arabic wording uses the native labels: البداية، البحث، التقديم، المحفوظات، الإعدادات، الوظائف، إيصالات الإرسال، الملف الشخصي. The Latin platform names are isolated with `bdi dir="ltr"`. No canonical application data or navigation behavior changes.

## Exact reviewable change

[The patch](support-navigation.patch) changes one paragraph in each of `support.html` and `support-ar.html`. Their original Git blobs are `8d59baa62c0b7354af7dfdb7ed47409fd265cb9b` and `9d7cd743197705fab35681264ea545bffccc5db2`. The source was fetched through the connected GitHub tool at the pinned public-pages commit.

The patch belongs to the separate public-pages history. Before applying it there, verify its current owner, branch and head, retain any newer edits, and run `git apply --check` on the current files. Reconcile newer content deliberately if the exact patch no longer applies. Keep this app repository's native source and the public-pages history separate. A prepared patch is not a public-site update.

## Verification and scope

The paired paragraphs were compared to the candidate's actual native navigation and localization sources. The patch was applied to the fetched, pinned support pages in an isolated temporary directory; both surrounding pages remain unchanged. See [the verification receipt](verification.json) for source blobs, hashes, patch checks and exact store-copy counts.

The companion edit in [the mobile listing draft](../Mobile-Store-Listing-Draft.md) replaces the obsolete 0.4/English-only description with the current source versions and supported display languages. iPhone is version 1.1/build 7; Android is version 0.6.0/version code 7. It also makes the primary-login review gate explicit using [Apple guideline 4.8](https://developer.apple.com/app-store/review/guidelines/#login-services), read on 17 November 2026.

No native build, provider setup, signing change, support deployment or store submission was performed. These copy checks do not establish a rendered support-page pass, provider callback acceptance, physical-device accessibility or release readiness. The active account owner is independently preparing hosted Retry/BiDi corrections; those changes are not represented by this docs-only patch.
