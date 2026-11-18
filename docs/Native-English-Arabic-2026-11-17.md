# Native English and Arabic candidate — 17 November 2026

## Status and scope

This is an **unpublished development candidate**, based on the isolated native redesign snapshot that the continuation owner supplied. It is not hosted version 7, the previously tested native source `e66d1809ece7666c7d99412d48aa193cdf024c42`, or Publishing's `app-store/career-workspace-copy-20261117` release branch. The historical 99 Android / 13 iPhone result does not validate these changes. No shared Mac build, signing, store change, real employer application or provider callback was performed in this slice.

The candidate supplies English and Arabic for the iPhone and Android app's own screens, settings, validation, status and error copy. Settings offers **Device language**, **English** and **العربية**. This preference is separate from appearance, account identity, workspace records and application authority. The existing disconnected English CTA remains **Connect application workspace**. Connected review, Stop, recovery, consent, receipt classification and unavailable-submission behavior retain their existing decisions.

Employer postings, company names, profile fields, notes, filenames, URLs, email addresses, provider identifiers and stored/wire values retain their original content. Provider websites, system document/share interfaces and imported narrative content may use the language chosen by their own owner or the operating system. Unknown external/OS error details are preserved, with localized context when appropriate; the app does not invent a translated error cause. JSON exports retain their interoperable schema and original records. The iPhone editable notes preview constructs translated app captions around original values; subsequent user edits remain verbatim.

## Resource and state architecture

| Area | Implementation and reason |
| --- | --- |
| Authoritative copy | `localization/native-copy.json`: 1,761 reviewed English/Arabic entries, including explicit templates. This is the file to edit. Protocol headers, key-store names, bundle keys, ISO code tables and diagnostic constants are excluded. |
| Repeatable generation | `scripts/generate-native-localization.py` uses only Python's standard library and local files. No translation API, subscription or network call is involved. `--check` verifies that generated artifacts exactly match the catalog. |
| iPhone resources | `en.lproj/Localizable.strings`, `ar.lproj/Localizable.strings` and `NativeCopyTemplates.json`, registered in the existing Xcode project. Explicit string lookup avoids treating arbitrary user strings as localization keys. The existing bundle ID, signing and version settings are unchanged. |
| Android resources | `values/career_copy.xml`, `values-ar/career_copy.xml`, `raw/native_copy_templates.json` and generated `NativeStringIds.kt`. Stable hashed resource IDs derive only from the English key. Map initialization is split to avoid large JVM initializer methods. Android XML strings are quoted to retain intentional spaces and escaped newlines. |
| iPhone preference | `NativeLanguage` and `NativeLocalization` in `NativeLocalization.swift`. `@AppStorage` uses `career.display.language`; UI acceptance uses its existing isolated test ID namespace. The root changes SwiftUI locale, Gregorian calendar and layout direction without changing a view identity or replacing stores. |
| Android preference | `CareerLocalization.kt`, separate `career_display_language` preferences. API 33+ synchronizes the public `LocaleManager.applicationLocales` setting, including first-run migration of an earlier explicit preference. System clears the application override. API 26–32 uses a localized resource context. No global `Locale.default` or wire data is changed. |
| Lifecycle | Android's Activity handles `locale|layoutDirection` configuration changes, resynchronizing the platform preference. A context wrapper retains the original Activity chain for document launchers and dialogs. The ViewModel remains above the language composition; editor state is keyed by workspace/record rather than language. iPhone `StateObject` owners and draft state remain stable. |
| System fallback | Both platforms scan preferred device languages in order and choose the first supported exact `en` or `ar` language code. An unsupported first language does not hide a later supported choice. `arc` is not treated as Arabic. English is the final fallback. |
| Formatting | App date displays use the selected language and Gregorian calendar. Civil application dates stay civil days. Source date-only deadlines retain Riyadh's existing date semantics; explicit timestamps keep the existing selected display zone. Dynamic identifiers are directionally isolated where interpolated. |

### Safe dynamic copy

Direct UI templates pass the key and arguments separately. Interpolation replaces only placeholders present in the resource, once; a person's name containing `{0}` is not recursively interpreted. Captured values are not translated.

Some existing models return already-rendered app messages. Those use 144 generated, bounded fallback templates. The matcher moves forward through literal separators, end-anchors the final separator, rejects adjacent ambiguous placeholders and orders more specific templates before general prefixes. It does not compile arbitrary wildcard regular expressions. The input limit is 12,000 characters, with at most 12 captured arguments. Unknown text remains original. The generator rejects missing, repeated or nonsequential source placeholders, translation placeholder loss, newline loss and missing intentional boundary spaces.

## Strict review and corrections

The implementation received a separate read-only review of localization/state boundaries. The following concrete source findings were corrected before handoff:

- Employer location and review-title values had been wrapped in the app-copy translator. They now render as original strings, with only missing-value captions localized. Android's review-card title received the same correction.
- The first device-language-only choice could ignore a supported later language; the initial Swift prefix comparison could match `arc`. Both now use an ordered exact-language fallback.
- Wildcard regular-expression fallback could have ambiguous captures and excessive backtracking. Both native helpers now use bounded literal matching; explicit templates handle rich strings and adjacent placeholders.
- A generic unknown-error fallback could replace a storage/encryption explanation with connection advice. Original details now remain visible; no new diagnosis is supplied.
- Disclosure controls, selection announcements and a small number of composed captions bypassed the explicit language. These now use the same copy boundary. Known typed consent booleans translate as Yes/No while string payload fields remain original.
- Composite planning criteria previously mixed app English with raw city/role preferences. Presentation helpers now translate captions around the unchanged values.
- Dates and salary-number presentation could follow the device language despite an explicit app-language choice. The relevant presentation paths now use the selected locale without changing stored dates, units, arithmetic or validation rules.
- English suffix-based count phrases were replaced with count-after-label wording where needed, avoiding a false assumption that Arabic follows English singular/plural suffix rules.

The independent final helper review found no new concrete blocker in the revised interpolation, export captions, date semantics, Activity wrapper or locale ownership. That review was source inspection, not a native compiler or runtime result.

## Verification actually performed

At the handoff checkpoint:

| Check | Result | Limits |
| --- | --- | --- |
| Resource-generation contract tests | **8 passed** | Local Python tests; not platform execution. |
| Exact regeneration | **Passed** | All seven generated artifacts match the catalog. |
| Translation contract | **Passed** | Nonempty entries, sequential source placeholders, translation placeholder parity, newline parity and boundary spaces. This does not certify every translation linguistically. |
| Native lexical delimiter scan | **24 source/test files balanced** | String/comment-aware lexical scan only; not a Swift or Kotlin compiler. |
| XML/resource/project references | **Passed static checks** | Android XML parses; new Xcode IDs, file references and build-phase entries resolve. Native resource compilers remain pending. |
| Git whitespace and root patch applicability | **Passed at packaging** | The patch is isolated from hosted source, icon assets, signing and Publishing's branch. |

### Focused native test sources added

Three Android instrumentation cases exercise production composition/resources with isolated memory storage and synthetic services: language changes preserve profile text and workspace scope, Arabic direction and preference restoration, nonrecursive user placeholders and original unknown-error details, Gregorian civil dates, and ordered system fallback. These fixtures write a dedicated display preference rather than changing the instrumentation host's OS language. They make no application-service calls. Existing composition fixtures now include the new language provider; the existing English essentials-count assertion follows the clearer caption.

Two iPhone UI cases exercise Arabic preference persistence on an English device, original profile data, large text, RTL tab order, restoration of English and disabled-submission messaging, plus a French→Arabic device fallback with explicit English override. They use the existing isolated offline acceptance workspace. **These five new native test cases were authored, not executed in this slice.**

Run locally or in isolated cloud CI:

```sh
python scripts/generate-native-localization.py --check
python scripts/test-native-localization.py
```

Then run the existing Android compile/lint/instrumentation gate and the iPhone build/UI acceptance gate for the exact integrated candidate commit. A passing historical run is not a substitute. If either resource compiler or UI gate finds a defect, fix it and rerun the affected gate before reporting a pass.

## Remaining acceptance and publishing work

Native compilation, resource loading and the new platform tests are pending at this document's checkpoint. Physical iPhone/Android checks remain necessary for Arabic/English at large text, Arabic keyboards, hardware/software navigation, VoiceOver/TalkBack reading order and announcements, mixed-direction email/URLs/fingerprints, DatePicker behavior, light/dark contrast, dialog reachability, platform-language changes and background/resume with unfinished drafts. In particular, Android API 33+ OS-language changes and the API 26–32 fallback need device evidence; the isolated composition test is not that evidence.

Provider consent/callbacks, disposable-account isolation/recovery, release integration, privacy declarations and store acceptance remain tracked in the continuation and owner-acceptance documents. This localization work does not close them. Publishing still owns shared signing/store work; no release merge was performed here.

## Primary platform guidance and decisions

The following are official platform references, consulted during design. Requirements and source behavior are distinct: implementing a documented API does not establish that physical accessibility acceptance passed.

- [Apple: Preparing views for localization](https://developer.apple.com/documentation/swiftui/preparing-views-for-localization) and [LocalizedStringKey](https://developer.apple.com/documentation/swiftui/localizedstringkey): app copy and verbatim dynamic strings require deliberate treatment. This candidate uses explicit tables to make the boundary reviewable.
- [Apple: Localizing and varying text with a string catalog](https://developer.apple.com/documentation/xcode/localizing-and-varying-text-with-a-string-catalog): string catalogs are a modern editing option. Existing supported `.strings` tables were retained for deterministic local generation and runtime lookup; a later editor-format change is not a release prerequisite.
- [Apple: LayoutDirection](https://developer.apple.com/documentation/swiftui/layoutdirection) and [Human Interface Guidelines: Right to left](https://developer.apple.com/design/human-interface-guidelines/right-to-left): logical layout and reading direction matter; original text, logos and non-directional images must not be blindly mirrored.
- [Android: Per-app language preferences](https://developer.android.com/guide/topics/resources/app-languages): the platform language setting and older-version resource handling must be considered separately, including configuration changes.
- [Android: Support different languages and cultures](https://developer.android.com/training/basics/supporting-devices/languages): localized resources, start/end positioning and bidirectional embedded text are relevant to Arabic. They do not replace TalkBack or visual acceptance.
