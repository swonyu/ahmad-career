# Career Finder — local preferences candidate, phase 2

This follow-up is based on the reviewed phase 1 source, whose patch SHA256 is `7771577fa92b9e5cb17bff1a29582728e603aa48057ad28b1d7eb1b8dc3bb339`, over upstream `bcc4aae3258099b6e2277abdf07fa839d31dbee9`. It is a local candidate, not a release, upload, production approval or claim of worldwide job coverage.

## Behavior and compatibility

Country/region, city text, role words, planning currency/period and display zone are independent optional local preferences. The existing profile object gains additive string fields under `preferencesVersion: "2"`. Browser storage keys, native paths, bundle IDs, job IDs, job snapshots, statuses, checklist IDs and the separate application-record schema remain unchanged. The old `preferredCity`, `minimumMonthlySAR` and `unknownSalary` keys retain their literal values and original meaning. Version 2 uses `targetCity` when present; otherwise it derives the previous blank/Riyadh choice.

| Setting | Fresh profile | Existing profile with no new fields |
| --- | --- | --- |
| Country | No personal country chosen; “Any covered country” | Saudi source scope, preserving the previous behavior |
| City | Blank; any city within covered scope | Blank still means any Saudi city; `riyadh` still requires bounded Riyadh-city evidence |
| Role words | Blank; no extra local role filter | Blank; no extra local role filter |
| Planning currency | No currency selected | SAR, preserving the old calculator unit |
| Planning period | Monthly fixed amounts, visibly labeled | Monthly fixed amounts |
| Display zone | Device time zone | Asia/Riyadh, preserving the previous timestamp display |
| Minimum salary | Unset | Existing amount remains whole monthly SAR, without conversion |

Reading old preferences does not rewrite them. A successful profile save may add version 2 fields while retaining the old keys. Invalid/future preference versions preserve original storage rather than overwriting it. Native loading keeps readable saved records available but blocks writes to an unsupported workspace; web loading protects the profile key while continuing independent saved-record operations. This is forward migration support; an older native app that does not know the new fields may drop them when writing after a downgrade. No downgrade guarantee is made.

## Coverage and ordering

The feed remains the same six limited Saudi-oriented sources: Alcon, Johnson & Johnson, Roche, Novartis, GSK and BD. The fixed supply-chain, procurement and performance title families, sampled-provider behavior and response validation remain intact. A country picker is not a provider expansion. Other countries and role families are explicitly unsupported.

Selecting a country outside the supported scope produces a coverage explanation, hides unsupported discovery rows and prevents a new search request. Cached rows and every saved or tracked record remain available. Changing back to Saudi Arabia or “Any covered country” allows review of the same limited feed. Role words filter returned titles/subtitles locally; they do not change employer queries or certify eligibility. City matching is a text heuristic and requires worksite confirmation. Riyadh-region text still does not count as Riyadh city.

Discovery defaults to role title ordering, with company and ID tie-breaks. It does not use universal leadership or provider relevance ranking. Optional existing category filters remain available. Earlier personal assessments are retained as historical records and labeled accordingly; their original text is not rewritten into current personalized advice.

## Currency and dates

A planning currency is only the default for a temporary local calculator using the user's own explicitly entered amounts. Its period is independent of the legacy monthly SAR filter. Changing calculator currency or period clears the temporary amounts. Historical source figures, salary-floor values and pay provenance remain SAR. No exchange rates, conversions, taxes or deductions are calculated.

The calculator rejects negative, out-of-range, malformed and greater-than-two-decimal input. It accepts English or Arabic digits/separators, uses integer hundredths for annual arithmetic, labels target bonus as not guaranteed, and identifies an annual-to-monthly result as an equivalent. Monthly equivalents display at most two decimal places. This limited-precision calculator is not a payroll, tax, exchange-rate or currency-validity service.

Country/code vocabulary is bundled from the cloud runtime's `/usr/share/iso-codes/json/iso_3166-1.json` and `iso_4217.json`, with XK regional selection and runtime-recognized XCG/ZWG units. Runtime locale names label countries and numbers. This list includes historical/fund units and is not a claim that every listed code is current legal tender or appropriate for a specific country; no country-to-currency mapping is inferred. Currency-catalog cleanup and locale review remain release work.

Display-zone choice applies to timestamps that contain an explicit offset. DST repeated clock times show their UTC offset as well as the zone identifier. Date-only employer deadlines keep the published civil date; no local instant is invented. Existing application dates remain exact entered strings and still validate against the Riyadh day, with an explicit UI notice. The application-record schema and its prior-date validation remain unchanged. A future per-record zone/date migration needs separate design and testing before making local-day validation worldwide.

## Privacy and boundaries

New preferences stay on the device and are excluded from application preparation notes, tracking exports, fixed employer requests, web `/api/live` requests and native bridge payloads. Existing self-entered professional details, application/receipt data and unsaved record drafts retain their existing export behavior. The live web request remains `/api/live` with its existing Accept header; the bridge message remains `{action: "refresh"}`. The local preference helper lives in `app.js`, outside the feed core. Source adapters, Worker implementation, shared `core.js`, request/query contracts, URL allowlists, navigation security and `CareerWebView.swift` / `CareerPolicy.swift` are unchanged.

The exact required `postman:api-engineer` workflow remains unavailable. This candidate does not undertake API engineering or replace the missing workflow with a new specification. Source expansion and personalized requests remain on hold. The privacy HTML is deliberately left to the owner's separate review. Existing beta/TestFlight support language remains accurate for beta and is not production support; a published policy, support destination and monitored contact remain release gates.

## Verification and remaining work

The cloud Node regression suite includes preference/units/date fixtures and 76 application-state groups. New state cases cover literal legacy profiles, monthly SAR preservation, byte-preserved tracking/receipts/checklists, unsupported-country requests, both unchanged search transports, multiple-tab preference merging/conflicts, future-schema protection, neutral ordering, explicit calculator units/reset, and historical assessment labels. Existing record/feed/server fixtures remain part of the regression run. The seven hosted/bundled web assets are synchronized byte for byte.

Native regression cases were added for backward decoding, profile round-trips, retained snapshots/statuses/receipts/checklist, unknown-version write protection, preference exclusion from notes, literal city/role behavior, DST offsets and unchanged civil dates. They have not been compiled or run in the cloud. The native views have not been type-checked or rendered here.

Before application or release, the owner must verify the precise candidate hashes, compile under the coordinated shared build lock, run native checks, then exercise actual iPhone/WebKit and hosted web flows. Required manual coverage includes first launch, upgrade with real existing records, optional preferences, unsupported-country recovery, dynamic type, VoiceOver, long translated country/zone names, text direction, keyboard and picker behavior, calculator unit resets, export review, offline/error paths, all screens and device storage failures. UI prose remains English; country and number localization is not full app localization. Apple signing/account access, production support/privacy hosting, current source/data rights, screenshots/store copy, production review authorization and Apple acceptance remain unresolved. No TestFlight/build approval is treated as production approval.
