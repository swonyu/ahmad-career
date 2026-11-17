# Android lint warning triage — 2026-11-17

## Evidence boundary

This reviews the **21 warnings** in the downloaded lint XML from [run 44057279267](https://github.com/swonyu/ahmad-career/actions/runs/44057279267), baseline `eebe748cb5afca0efcb9389255400a00cf5a480a`. XML SHA-256: `10d27f55657fdb2f68e14c09a0dfc603bc1a4d839e0f58522f3ab6e86c70009f`.

The same report also has **2 Fatal + 3 Error** findings. Those five blocking findings are handled by the separate native compiler/search follow-up; this warning review does not turn that follow-up into a successful lint or runtime result. The next exact-commit CI run remains authoritative for that result.

All warning rows are accounted for: **1 source-confirmed behavior risk corrected, 10 technical/compatibility warnings, 10 optional upgrades or polish items.** No blanket lint suppression or dependency update was made.

## Classification

| Lint ID | Count | Classification | Exact scope and decision |
| --- | ---: | --- | --- |
| `AppBundleLocaleChanges` | 1 | Actual user-facing packaging defect, corrected in candidate | `CareerLocalization.kt` implements an in-app picker, while the original `android/app/build.gradle.kts` left language splitting enabled and had no language download manager. A store-delivered app could lack the selected language. The follow-up sets `bundle.language.enableSplit = false`, retaining both languages for offline selection. This consequence is supported by Android's documentation; it was not reproduced from a Play install. No download SDK was added.[1] |
| `OldTargetApi` | 1 | Existing technical warning | `compileSdk` and `targetSdk` are 36. The same values exist in evidence commit `949ce0ad327beab79fa7033423b462ebc7bd98be`. Lint reports that newer platform targets exist; it does not establish a current crash or a current Play eligibility violation. Publishing must check the applicable live store requirement before upload. Changing target behavior is outside this bounded compiler correction. |
| `UnusedAttribute` (`localeConfig`) | 1 | Expected compatibility warning | Manifest `android:localeConfig` supplies system language choices on API 33+. `synchronizePlatformLanguage` and `LocaleManager` calls are API-33 guarded. API 26–32 have the separate app preference and localized display-resource context. The attribute being unused below 33 is expected; removing it would remove the system integration on supported Android versions.[2] |
| `Typos` | 1 | Wording false positive, optional editorial refinement | Generated `c_05296b90960e` is “Sign in in your browser, then return with a one-time code.” The adjacent words come from the verb “sign in” followed by the preposition “in”; no duplicated value or broken instruction was found. A later editorial pass could choose “Open your browser to sign in…”. Any change must start in the source/catalog and regenerate both language resources, not edit generated XML alone. |
| `ObsoleteSdkInt` | 1 | Resource-location redundancy | The new adaptive icon resides in `mipmap-anydpi-v26`, and minimum SDK is already 26. The qualifier is redundant for supported devices. This is not evidence of a missing icon or incompatible install. Moving it to the unqualified folder is optional cleanup and was not needed to fix the build. |
| `UnusedResources` | 1 | Existing unused resource | `drawable/ic_career_finder.xml` is the earlier vector. The manifest now selects `@mipmap/ic_launcher` for both icon attributes. The unused vector does not appear in the selected icon path. Removal can be reviewed with branding/publishing, without changing the current opaque icon or its references. |
| `IconLauncherShape` | 5 | Raster-hint warning, no demonstrated supported-device shape defect | The five density PNGs are opaque square fallback artwork used with `roundIcon`. The selected API-26+ `mipmap-anydpi-v26/ic_launcher.xml` is an adaptive icon; minimum SDK is 26, and Android applies launcher masks to adaptive icons.[3] The source warning alone does not prove an unmasked square on a supported launcher. Do not bake rounded corners into the requested edge-to-edge source to silence it. OEM/physical-launcher review remains unexecuted. |
| `GradleDependency` | 3 | Optional dependency upgrades | Lint lists newer `activity-compose` and two `lifecycle` libraries. The pinned versions (`1.11.0`, `2.9.4`, `2.9.4`) match evidence commit `949ce0ad`. This warning supplies version-availability information, not a demonstrated vulnerability or behavior defect. No upgrade is included without a focused reason and regression budget. |
| `NewerVersionAvailable` | 1 | Optional dependency upgrade | `kotlinx-coroutines-android:1.10.2` also matches evidence commit `949ce0ad`. The lint message says a newer release exists; it is not a security advisory. No dependency change was made. |
| `MonochromeLauncherIcon` | 1 | Optional user-visible themed-icon enhancement | The adaptive icon has background and foreground layers but no `monochrome` layer. On supporting Android 13+ launchers, this leaves the app without its authored monochrome themed-icon variant.[3] The full-color icon still exists. The current `career_icon_adaptive.png` is **RGB, 432×432, with no alpha channel**; blindly assigning it as a monochrome mask would not recover the opportunity symbol. A deliberate symbol mask and themed-icon visual review would be separate branding work. |
| `UseKtx` | 5 | Optional idiomatic source cleanup | Four findings concern `SharedPreferences.edit()` calls in language/theme preferences; one concerns `Bitmap.createBitmap()` in `ReadablePDF.kt`. The explicit editor calls end with `apply()`, and preference listeners have disposal paths. The bitmap API is valid. The warnings recommend equivalent Kotlin conveniences, not a demonstrated persistence, lifecycle or PDF-rendering defect. |

## Native source review limits

The corrected source retains scoped record access, raw user/employer text, display-only language preferences, explicit System/Light/Dark choices and the existing application-review/Stop authority. It changes neither provider integration nor application submission policy. No new permission, telemetry, dependency or paid service was introduced by the follow-up.

The classifications above are source/artifact review. They do not certify physical launcher shape, Arabic typography, TalkBack/VoiceOver, system-bar colors, real provider callbacks or store acceptance. Cloud CI must first verify the corrected native commit, and publishing still owns shared signing/store decisions.

## Primary references

1. [Android: configure the base module](https://developer.android.com/guide/app-bundle/configure-base), “Handling language changes”: an in-app picker must package languages or arrange their download. Selecting bundled resources is this project's two-language tradeoff.
2. [Android: per-app language preferences](https://developer.android.com/guide/topics/resources/app-languages): system configuration through `localeConfig` begins with Android 13, while earlier versions need app-level handling.
3. [Android: adaptive icons](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive) and [AdaptiveIconDrawable](https://developer.android.com/reference/android/graphics/drawable/AdaptiveIconDrawable): launchers mask adaptive icons, and a monochrome layer supplies authored themed-icon artwork. The artifact's exact shape warnings and the current bitmap's RGB mode are repository observations; the prioritization is our inference.

## Subsequent icon follow-up

The optional monochrome gap above is now addressed by a separate API-33 native vector layer. Ordinary opaque bitmap hashes remain unchanged. [Themed-icon implementation and static review](Android-Themed-Icon-2026-11-17.md) records the exact geometry and remaining launcher/runtime checks. The warning counts above describe the first failed CI artifact, not a new lint result.
