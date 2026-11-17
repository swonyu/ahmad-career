# Android themed-icon silhouette — 2026-11-17

This isolated follow-up supplies the optional authored monochrome icon identified in [Android lint triage](Android-Lint-Triage-2026-11-17.md). It does not regenerate or recolor the accepted opaque ordinary icons.

## Implementation

`android/app/src/main/res/drawable/ic_career_finder_monochrome.xml` is a native `VectorDrawable`: one solid alpha silhouette of the existing rising-path/arrow outline, authored on Android's 108×108 dp adaptive-icon canvas. Its white fill supplies shape/coverage; a supporting launcher supplies themed colors. The two colored planes of the ordinary icon are intentionally combined into a strong single silhouette, without a baked background, rounded outer corners, tiny strokes or lettering.

`mipmap-anydpi-v33/ic_launcher.xml` retains the exact existing background and full-color foreground references and adds the monochrome layer. Android 26–32 keep the existing `mipmap-anydpi-v26` resource. Android 33+ can select the qualified resource and use its monochrome layer when the launcher supports themed icons and the user enables them. Android documents this user-controlled behavior; an ordinary app appearance preference does not force launcher icon theming.[1]

The manifest, resource identifier `ic_launcher`, ordinary bitmap assets, package IDs, SDK levels, versions and signing settings are unchanged.

## Verification scope

Static checks validate the XML, its resource references, the closed single path and the absence of a background in the silhouette. Every line endpoint and cubic Bézier control point is inside the centered 66 dp safe circle. Because that circle is convex, each curve stays inside it; sampled raster coverage is checked separately. Both ordinary foreground/background references are identical to the API-26 resource.

A contact sheet renders the same authored path at launcher-relevant sizes in light/dark example colors and with circle/rounded-square mask simulations. These are deterministic vector previews, not screenshots from an Android launcher. Existing ordinary icon hashes are checked unchanged.

Executed checks: one closed path; maximum endpoint/control-point distance 32.3671 dp from the center, below the 33 dp safe radius; transparent sampled outside coverage and solid sampled inside coverage; unchanged hashes for all six ordinary Android bitmap assets. The contact sheet and machine-readable receipt are in `docs/branding/2026-11-17-indigo/qa/monochrome-contact-sheet.png` and `monochrome-verification.json`. An independent read-only visual critique found the mark recognizable at 48/32/24 pixels, consistently legible in light/dark inversions and clear of the displayed mask edges. That result applies to these previews only.

At authoring time, Android compilation/lint and physical/OEM launcher themed-icon acceptance remain pending. The next exact-commit CI can validate resource compilation; physical review should enable and disable themed icons and verify that the same rising-path mark stays recognizable.

## Reference

1. [Android: adaptive icons](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive) describes the monochrome layer and Android 13+ launcher/user conditions. [AdaptiveIconDrawable](https://developer.android.com/reference/android/graphics/drawable/AdaptiveIconDrawable) documents layer masks and the reserved outer inset. The authored silhouette geometry, conservative safe-circle check and visual simplification are project implementation decisions.
