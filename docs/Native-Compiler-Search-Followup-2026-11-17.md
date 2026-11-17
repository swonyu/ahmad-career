# Native compiler and Saved-search follow-up — 2026-11-17

## Baseline and status

This isolated candidate starts from `eebe748cb5afca0efcb9389255400a00cf5a480a`. It is a follow-up to [Native English and Arabic](Native-English-Arabic-2026-11-17.md), not a replacement for its dated evidence.

[Cloud CI run 44057279267](https://github.com/swonyu/ahmad-career/actions/runs/44057279267) tested that exact baseline. The coordinator reported that Service and Hosted gates passed and all three native gates failed. The Swift logs identified a private catalog access, a removed color name and a private view referenced from another source file. The downloaded Android lint report contained two fatal resource-cycle findings, two API-level errors and one missing-translation error. These are baseline failures; this document does **not** claim the corrected candidate has passed a native build.

No shared Mac build, store upload, signing change, publishing-branch merge or hosted deployment was performed for this follow-up. Hosted version 7, this unpublished development candidate and the publishing branch remain separate.

## Verified findings and bounded changes

| Finding | Correction | Boundary preserved |
| --- | --- | --- |
| Arabic export code could not access the store's private `allJobs` property. | A read-only `exportJobs` projection now owns the existing saved/tracked/meaningful-record/dirty-draft selection. English and Arabic exports consume it. | The full merged catalog stays private. The existing off-list dirty-draft behavior is retained. |
| A legacy job row still referenced the removed `careerMint` color. | The row uses the existing adaptive indigo `accentSurface` role. | No green palette or new style variant is introduced. |
| Settings called a connection view that was private to another file. | `NativeApplicationConnection` is module-internal for its two existing callers. | Address, code, confirmation and focus state remain private to the view. |
| Android theme aliases formed a lint-detected cycle; API 27 navigation-bar attributes were in API 26 resources. | Concrete light/dark theme names have explicit platform-base parents. API 27 attributes are defined only in `values-v27`. | Minimum SDK, IDs, versions, manifest, icon selection and signing are unchanged. |
| The shared product brand had no Arabic translation declaration. | `app_name` is explicitly non-translatable, retaining “Career Finder” across platforms. | All app-owned screen copy continues to use the bilingual resources. |
| AAB language splitting could omit a language selected inside the app. | `bundle.language.enableSplit = false` packages both supported languages. | No download service or Play Core dependency is added. Store-distributed installation remains an external acceptance check. |
| iOS typed arrays and objects could expose app-owned English labels in Arabic review summaries. | The display-only helper recursively localizes typed boolean/null labels and the object caption. | Every `.string` payload, including text equal to “Yes” or “Additional details”, remains verbatim. Numeric and encoded values are unchanged. |
| Existing Saved search did not include saved private notes or comparison-only Arabic vowel-mark handling. | Existing search predicates include the displayed row's active saved notes and share the policy below. | No screen, field, persistent index, network request or stored-value rewrite is added. |

The iOS Saved query and filter now clear when `workspaceScope` changes. Android already keys these states to `privateScope`. This closes a source-visible query-retention path; real account switching has not been executed for this patch.

## Comparison policy

Matching first applies NFC canonical normalization, removes U+0640 (tatweel), U+064B–U+0652 and U+0670, applies stable Unicode lowercasing, and returns to NFC. It splits on whitespace and requires every query term somewhere in the joined visible metadata and allowed saved notes. Query terms are prepared once for each list evaluation instead of once per row.

Maddah and hamza marks U+0653–U+0655 are preserved. Alif variants, ة/ه and ى/ي remain distinct. Latin accents are retained: “Élan” matches its lowercase/canonically equivalent spelling, while “Résumé” does not match “resume”. This is a conservative product decision for finding already-saved content, not transliteration, stemming, Arabic linguistic equivalence or an identity-normalization rule. Unicode documents that combining hamza can carry semantic distinctions and that some letter forms have canonical equivalents.[1]

Android uses each displayed row's already-scoped `ApplicationRecordBundle`, checks its job identity before reading notes, and includes the current and active alternative versions. iOS uses the same `recordVersions(for:)` accessor as that row's detail view and excludes archived versions. Its existing visible local/unpaired records remain visible by the same selection policy. Earlier iOS planning records retain their previous metadata fields and add their saved receipt note. Draft notes and archived history are not indexed. URL paths, opaque IDs and unrelated record bundles do not enter the index. Original content continues to display and export unchanged.

## Evidence at this checkpoint

Executed in the isolated Linux checkout:

- Resource generation `--check`: passed; 1,761 strings per language, 144 bounded templates, all seven generated outputs unchanged.
- Python native-resource contracts: 8 passed.
- Android XML resource-selection inspection: 12 combinations of API 26/API 27, day/night and system/light/dark selections resolved without a cycle. API 26 selections contain no `windowLightNavigationBar` attribute; API 27 selections resolve the intended value. This is XML inspection, **not Android lint or runtime execution**.
- Shell syntax and `git diff --check`: passed.
- Independent read-only review found no concrete blocker in the Saved-note scope, conservative mark policy, raw-string boundary or typed recursive display helper. This was source review only.

Added executable native regression sources, pending cloud execution:

- One shared 21-case search fixture covers Arabic marks/tatweel, mixed-language terms, whitespace, canonical equivalents, retained hamza/alif distinctions, Latin case/accents, original placeholder-like text and long saved notes. The existing Mac policy runner and Android instrumentation run their actual platform matcher against it.
- A Foundation check exercises nested typed values, raw English-looking strings and unchanged encoded payloads.
- Android record-selection checks cover active alternatives, archived history exclusion, a mismatched record identity, opaque IDs/URLs and retained unbookmarked records.
- Existing store checks now assert the shared export selection excludes untouched research, retains meaningful note-only records and includes dirty off-list drafts.
- One iPhone UI case creates only synthetic offline data, saves an Arabic note, relaunches, searches with Arabic/Latin terms, rejects a URL-only query and verifies the original note remains intact. Its keyboard automation and rendered result are unverified until CI runs it.

## Remaining native gates

The next cloud run must compile both Apple targets, execute the policy/store checks, run Android lint and instrumentation, and run the iPhone UI suite against the new exact commit. A successful run would still leave physical-device Arabic RTL, VoiceOver/TalkBack, large text, system-bar/theme behavior and store-distributed language switching to acceptance. Existing provider consent/callback, disposable-account recovery/isolation, trusted ingress and publishing gates are not closed by these source changes.

Nonblocking lint warnings about dependency currency, target-version currency, launcher icon hints and style conveniences were not suppressed or turned into unrelated upgrades. Publishing still owns shared store/signing decisions.

## Primary references and inference

1. [Unicode 16, Chapter 9: Middle East-I](https://www.unicode.org/versions/Unicode16.0.0/core-spec/chapter-9/) describes Arabic marks and canonical-equivalent hamza forms. The precise conservative removal set above is our comparison policy, not a Unicode mandate.
2. [Android: configure the base module](https://developer.android.com/guide/app-bundle/configure-base) explains language resource splitting and the need to package or download languages when an app offers its own picker. Keeping both bundled is the selected implementation tradeoff for this two-language offline interface.
3. [Android: styles and themes](https://developer.android.com/develop/ui/views/theming/themes) documents explicit style inheritance and version-qualified themes. The actual failed names/API attributes came from this repository's cloud lint artifact.
4. [Android `Normalizer`](https://developer.android.com/reference/java/text/Normalizer) and [Apple `precomposedStringWithCanonicalMapping`](https://developer.apple.com/documentation/foundation/nsstring/precomposedstringwithcanonicalmapping) describe the platform canonical-normalization APIs. Their use here affects comparisons only.
