# Career Finder for Android phones

Native Kotlin / Jetpack Compose phone app for public job discovery, private career planning and the verified-applications service. English interface, system-scaled text, right-to-left layout support, light/dark green theme, bottom navigation, and touch controls of at least 48 dp. The app starts with an empty personal workspace and contains no sample vacancies or seeded identity.

## Product behavior

- Search selected public Lever and Greenhouse employer boards without an account or résumé upload. Choose up to four catalog employers or supported custom board links, then explicitly search by role, location or an evidenced remote label.
- See source attribution, freshness, partial availability and search limits. Unknown country/remote values remain unknown; search coverage and a remote label do not establish work eligibility.
- Save a discovered role into the existing private opportunity flow. Search and save never approve or submit an application. A failed, cancelled or stale search preserves earlier results; changed pagination requires a deliberate fresh search.
- Restore the last encrypted search in the same phone/workspace context with its original check times. Previous results are labeled, startup performs no discovery request, and **Search again** starts a fresh request without reusing an old cursor. Up to 200 displayed results and 2 MiB are kept; unavailable or newer saved formats are preserved for explicit recovery.
- Create a private phone profile, including a single-name profile with no surname, and pick the exact PDF résumé through Android's document picker.
- Add a separate optional LinkedIn personal profile link. HTTPS links from LinkedIn's public or country hosts are canonicalized, tracking parameters removed, and Unicode names preserved. This is a saved public URL, not LinkedIn OAuth or verification of account ownership.
- Open LinkedIn job search explicitly using only the current keyword and location fields. The LinkedIn website handles its own sign-in and applications; the handoff never creates a Career Finder receipt.
- See first/single name, email and PDF essentials before optional experience and preferences. Select target countries with search and explicit confirmation; dismissing the selector preserves the earlier choice.
- Keep edits, selected opportunities and explicit consent choices in an encrypted phone draft. After pairing, review and deliberately copy a saved phone profile and opportunities into the connected workspace draft; copying does not upload them.
- Save employer links from any country or profession, with searchable role/company/location details.
- Track Saved, Applied, Interview, Offer and Closed stages, optional applied/follow-up dates and a private note within Saved. The **Follow-ups** filter uses the dates you entered. These records stay encrypted on this phone and never create a verified employer receipt.
- Keep prior application evidence when closing a record or choosing conflicting notes. Marking it not applied requires a separate explicit confirmation. Restoring an old note preserves that correction; a new explicit applied-stage Save can change it again. Removing a saved link keeps its meaningful private record and history.
- Pair a configured HTTPS service with a one-time code. The bearer session and local drafts use AES-GCM with Android Keystore; no plaintext preferences or backups.
- Open the selected service's browser setup, privacy, support and account/recovery/deletion pages. New connections start with the hosted Career Finder address; existing paired addresses are preserved.
- Select synced opportunities, supply separate employer messages and explicit undecided/yes/no data-processing and future-contact choices.
- Review the server's immutable profile fields, résumé name/size/SHA-256 and per-job readiness before pressing **Approve and Auto Apply**.
- Stop pending work, review exact outcomes, export redacted receipt evidence, and reopen an earlier rate-limited plan for deliberate review after cooldown.
- Only confirmed **live** Lever receipts with an application ID count as verified applications. Test/unknown/uncertain records are visibly separate.
- Search receipts by role, employer or reference, and filter verified, attention, pending, stopped and test outcomes. When live submission is unavailable, the app explains the manual employer route and blocks an approval request before networking.
- Compare a conflicting saved profile with the preserved phone draft before keeping edited fields or reloading. A changed remote PDF is identified explicitly; a newly chosen local PDF keeps its exact bytes.
- Retry unavailable private storage, or explicitly start a separate empty storage area while preserving earlier encrypted files and Keystore keys.

Opening an employer link does not submit or create a receipt. Missing connectors, unknown requirements or unsupported custom questions remain manual applications. The phone does not hold an employer API key and does not drive third-party login pages.

Public discovery always uses `https://career-finder-service.jazzy-drake-8323.chatgpt.site`, independently of an optional paired companion. It sends only explicitly chosen search filters, with no bearer token, cookies, profile or PDF. Its synthetic contract fixture is packaged only in the instrumentation APK and is absent from the ordinary preview.

Phone-only drafts and connected workspaces have separate encrypted storage identities. Pairing does not silently upload an offline profile. Tokens expire; revocation preserves server records. Online revocation requires the service to be reachable. A separate **Remove connection locally** choice preserves the workspace draft and removes the phone's token without claiming that the remote session or already approved work was stopped.

Changing review inputs invalidates the earlier local review. **Stop earlier review and prepare update** retires an obsolete unapproved server plan only after the user chooses that action; the service's atomic approval guard prevents a race with another device's approval. Approved and rate-limited plans keep their original explicit review path. A lost response never triggers an automatic application retry.

For a service advertising `capabilities.dispatchContinuation: "client"`, the foreground app reads fresh workspace eligibility and sends at most one authenticated `POST /api/apply/advance` per polling cycle. The server decides which already approved plans remain eligible. Cycles are sequential with a four-second delay after completion; the 25-second client timeout is unchanged. The app never calls `submit` from polling, and a cooldown still needs a new visible approval. A stop request creates an encrypted local continuation hold before contacting the service, so an ambiguous stop cannot resume automatically from this phone after restart. A new explicit approval can supersede that hold.

Leaving the foreground pauses subsequent continuation requests; an in-flight application can still finish. Returning reads authoritative state before another request. Connection changes, cancellation, expired sessions, unavailable private storage and stop holds prevent stale continuation. Services without this capability retain their existing server-driven dispatch behavior.

### LinkedIn profile compatibility

The optional `profile.linkedin` string is persisted in the existing encrypted schema-1 workspace. Older profiles decode with an empty link. Incomplete or invalid edits remain private drafts even after a failed save; a valid save canonicalizes the link without changing the separate website/portfolio field.

Connected writes require `capabilities.linkedinProfile: true` before sending a nonempty link or clearing an existing link. With an older service, an empty link is omitted from profile writes and unsupported edits stay on the phone. This capability is refreshed from the service and is never restored from a cached value. Malformed optional URLs or capability values reject the response without replacing the draft.

Both `prepare` and `submit` send `reviewSchema: 3` when the exact saved profile or reviewed application contains a LinkedIn link. The approval screen displays the exact `payloadSummary.linkedin` value. An older phone cannot approve an undisplayed new profile field through the updated service. The service includes this link only in the explicitly approved employer payload; it does not access LinkedIn accounts or perform LinkedIn applications.

## Build

Use JDK 21 (JDK 17 also meets AGP's baseline) and Android SDK Platform 36. AGP selects Build Tools 35.0.0 for this pinned project. Set the SDK path in an untracked `local.properties` or `ANDROID_HOME`.

```sh
./gradlew --no-daemon --max-workers=2 :app:assembleDebug :app:lintDebug
bash checks/run-policy-checks.sh
```

The checked-in wrapper launcher matches the official Gradle 8.13 checksum; it now downloads the security-patched Gradle 8.14.7 distribution and verifies its official SHA-256. The narrow distribution update follows the upstream security advisories and retains the documented AGP/Kotlin compatibility bounds. Pinned dependencies: AGP 8.13.2, Kotlin and Compose compiler plugin 2.3.10, Compose BOM 2025.10.01, Activity 1.11.0, Lifecycle 2.9.4. Minimum phone version: Android 8 / API 26. Current unreleased candidate: **0.6.0**, version code **7**. Debug package: `com.saleh.careerfinder.preview`. Release package: `com.saleh.careerfinder`; release signing is not configured.

Compatibility references:

- [AGP 8.13 compatibility and Kotlin 2.3 support](https://developer.android.com/build/releases/agp-8-13-0-release-notes)
- [Kotlin Gradle compatibility matrix](https://kotlinlang.org/docs/gradle-configure-project.html)
- [Matching Kotlin and Compose compiler plugin](https://developer.android.com/develop/ui/compose/setup-compose-dependencies-and-compiler)
- [Pinned Compose BOM artifact](https://dl.google.com/dl/android/maven2/androidx/compose/compose-bom/2025.10.01/compose-bom-2025.10.01.pom)
- [Android domain-specific certificate configuration](https://developer.android.com/privacy-and-security/security-config)
- [Separate instrumented test build types](https://developer.android.com/studio/test/advanced-test-setup)
- [Dialog window/IME inset behavior](https://developer.android.com/reference/kotlin/androidx/compose/ui/window/DialogProperties)

## Connect a phone

For a new connection, the preset address is `https://career-finder-service.jazzy-drake-8323.chatgpt.site`. Step 1, **Sign in and get a code**, opens that origin's `/connect` page in the browser, where the service presents its currently available sign-in options and one-time code creation. Step 2, **Connect this phone**, accepts that code after returning to the app. **Advanced · use another service** reveals the custom HTTPS address; an existing custom address is preserved and shown. Changing the selected service clears the draft code. No session token or applicant data is attached to browser links. The connection screen also opens the selected service's `/privacy`, `/support` and `/account` pages; the account page handles recovery and cloud-data deletion through the browser. Removing the phone connection does not delete cloud records or employer-held applications.

An existing paired address is retained. A custom companion service still needs its explicit HTTPS origin and TLS gateway preserving the exact Host, plus a code from its own setup flow or private pairing CLI. The app rejects HTTP, redirects, embedded URL credentials, invalid certificates and an origin containing a path/query/fragment. It has no trust-all or emulator cleartext override.

Saving a connected profile uploads its fields and PDF to the chosen service; synced opportunities and receipts are stored there too. Phone drafts remain encrypted locally until deliberately shared. The hosted service stores connected records in the user's cloud workspace. Hosted availability and authorized employer integrations are service-side requirements; the Android app does not install employer credentials or guarantee an integration is enabled.

## Private record storage and compatibility

Application records are an optional schema-1 addition to the existing encrypted workspace envelope. A workspace uses the canonical service origin plus workspace identity; each record uses a canonical opportunity identity, including equivalent Lever posting/apply links. Legacy self-reported applied IDs migrate without invented dates. Explicit phone-draft import or a successful job sync adopts a record; pairing alone does not. Explicit copying includes retained record-only entries without restoring removed bookmarks. Different incoming notes/dates are kept as separate versions for an explicit choice, with the earlier applied flag preserved. Editors check the workspace, identity, token and record revision before saving or confirming. Civil dates remain literal `YYYY-MM-DD` values, without device-time-zone conversion.

Changing an applied flag for a job in active approved work requires stopping that work first; notes and dates remain editable. Unknown active targets fail closed. A recovered cooldown review and the final submit action recheck the current canonical private record before approval. Foreground continuation pauses affected plans when an earlier application is already recorded, while known unrelated plans remain eligible. This local pause does not claim to stop the service or another phone; the user can explicitly stop and refresh the original work. Active conflicting versions cannot decode as not applied, while corrected historical versions keep their earlier evidence without reviving the cleared flag.

Search snapshots use a separate encrypted record per phone/workspace scope. Only public filters, displayed result/source evidence and original timestamps are stored. They contain no applicant profile, PDF, token or resumable cursor. Account changes cancel the old search and drain its private writes before changing storage scope. Failed reads or unknown schemas preserve the earlier file and allow a temporary in-memory search; failed writes preserve the earlier saved search and offer an explicit retry.

## Verification history

The immutable **0.5.0** LinkedIn candidate and its exact 38-file source manifest, 77 boundary checks, 28 instrumented tests, preview signature and large-text/RTL captures are recorded in [the LinkedIn verification record](../docs/strict-review-evidence/android-linkedin-verification.json). The navigation changes above are the unreleased **0.6.0** candidate; its exact source and validation status are recorded in [the navigation verification record](checks/navigation-verification.json). Earlier observations below remain explicitly tied to their original candidates.

### Historical 0.4.0 candidate

The **0.4.0 candidate** source passed `assembleDebug`, `lintDebug`, `assembleDebugAndroidTest` and `processReleaseResources` through the official Gradle wrapper on the isolated macOS ARM toolchain. Lint reported **zero errors and six dependency/idiom advisories**. All **35 instrumented regression tests passed** in 17.304 seconds on the dedicated Android 16 / API 36 ARM emulator, and all **36 Java boundary-policy checks passed**.

The new checks cover public-contract validation, query isolation, explicit search, cancelled and out-of-order responses, unavailable boards, pagination changes, rate-limit delays, duplicate saving, self-reported applications, receipt filtering and disabled live submission. Actual Compose flows exercise a single-name profile, country confirm/cancel, discovery saving and manual tracking. Intermediate attempts exposed lazy-list test-navigation failures and a country-dialog keyboard/locale interaction; all results, including the interrupted run and one test-helper compile failure, are preserved under `checks/attempts` and explained in the verification record. The final country search has an explicit dialog-local Done action, and tests select stable ISO codes without weakening confirm/cancel assertions. That same case also passed separately at 360 dp, 180% text and Arabic RTL in 8.027 seconds.

Before the bounded dialog-only inset/Done refinements, the ordinary installed 0.4 candidate also performed a deliberate public HTTPS search against the deployed service from an empty, unpaired workspace. It displayed 50 of 855 matching jobs at the time of observation, with real employer/source/location details. The final country selector was visually reviewed at 360 dp width, 180% text, dark mode and Arabic RTL layout, with its real keyboard visible and its Done action hiding the keyboard. The final discovery client is identical to the candidate used for the live search; the record identifies each observed APK hash. These are bounded emulator observations, not a claim about every device. No owner-authenticated session or employer submission was exercised in this pass.

The normal APK's installed label is exactly **Career Finder**. The branding audit found no Ahmad branding or personal profile defaults in main source/resources. A fresh profile has blank identity/location/skills/target fields, no PDF and no saved opportunities. Internal package and storage names remain stable for upgrades.

The exact **32-file compiled-source manifest**, APK hash, test names and commands are in [checks/verification.json](checks/verification.json). Packaged normal-preview and release resources use system certificate trust only, with no fixture CA or emulator trust exception. The 0.4.0 preview retains the same package and signing certificate as earlier previews; legacy encrypted records pass the regression suite. It remains a locally debug-signed preview, with no production signing or store publication.

Complete earlier evidence is preserved for [0.3.0](checks/history/v0.3.0/verification.json) and [0.2.0](checks/history/v0.2.0/verification.json). The 0.2.0 run included real native HTTPS calls to a synthetic local provider, ordinary-preview certificate refusal and an actual system PDF-picker return with restart persistence. Historical observations are not presented as new 0.4.0 executions.

`checks/run-policy-checks.sh` executes the actual Java policy used by the app: secure URL construction, workspace isolation, PDF bytes/size/name, hashing, and strict live receipt counting. It makes no network requests.

The instrumentation tests are intended for a dedicated blank emulator:

```sh
./gradlew --no-daemon --max-workers=2 :app:connectedDebugAndroidTest
```

The ordinary suite exercises empty states, encrypted profile persistence, Keystore encryption/AAD isolation, original schema-1 records, storage failure/recovery, stale profile conflicts, intentional phone-draft copying, consent persistence, late responses, malformed success data, local disconnect and guarded review replacement. It uses fixture data only and never contacts an employer. The network tests require explicit fixture arguments and are skipped when those arguments are absent.

### Isolated HTTPS acceptance build

The separate `com.saleh.careerfinder.acceptance` app is labeled **Career Finder Acceptance**. Its resource configuration trusts a provided public test CA only for `10.0.2.2`, the emulator's route to the host. The ordinary preview and release resource configurations trust system certificates only and contain no fixture CA. No system trust store is changed.

Start the test-only local TLS fixture described in `../website/applications/fixtures/README.md`, then build using its generated **public** CA path:

```sh
./gradlew --no-daemon --max-workers=2 \
  -PcareerAcceptance=true -PcareerAcceptanceCa=/absolute/path/to/ca.pem \
  :app:assembleAcceptance :app:assembleAcceptanceAndroidTest
```

The acceptance test pairs through the real native HTTPS client, saves a single-name profile and exact PDF, renders and approves a review with storage consent Yes and marketing consent No, replaces an unapproved review using the atomic stop guard, and verifies confirmed/test/uncertain/cooldown outcomes. It approves the cooldown retry explicitly and checks that a new uncertain application remains blocked. A separate ordinary-preview test requires an actual TLS rejection of that same private-CA fixture. Acceptance APKs are test artifacts and must not be distributed as the user preview.

The compact layout adapts the bottom navigation to two labeled rows at large font scales, and text uses content-based paragraph direction inside RTL layouts. The archived 0.2.0 emulator pass covered a 360 dp-wide phone at 180% font scale, dark mode, Arabic RTL layout, and an actual system PDF-picker return with draft persistence after process restart. The interface remains English.

Physical-device acceptance, TalkBack reading/focus, the wider device/OS matrix, live authorized employer acceptance, store signing and store review remain separate release work. Hosted service policy and operational readiness are documented separately. The Android app does not provision employer credentials.


## Strict review changes — 2026-11-17 (source awaiting native CI)

This continuation starts from phone revision `6f95db3`. These Android changes are not evidence of an App Store or Play Store release. Root owns the exact tested follow-up commit and the disposable CI run; the local check record below explicitly identifies an uncommitted source tree.

- **Stop remains a local safety decision after an expired session.** A small, independent encrypted hold journal is written before authentication or network checks. A failed Stop response, restart, same-workspace re-pair, large main draft or fresh server eligibility cannot silently remove that hold. Only explicit approval can supersede it. A dispatched request can still finish; receipts remain authoritative.
- **Unfinished private records are recoverable.** Note, stage and date edits have workspace-bound checkpoints that do not alter saved application status. Close, Back and Cancel use Keep draft / Keep editing / Discard choices. Recovered edits based on an older record require a deliberate comparison before saving. Alternative recovered edits remain available in phone data settings. Notes count Unicode scalars up to 2,000, and any nonblank saved note can be expanded, including short multiline notes at large text sizes.
- **Malformed private data is preserved.** Present fields, nested collections, profile/PDF metadata, answers, records, receipts and draft ownership are checked without coercing wrong types or dropping malformed array entries. Absent legacy optional fields and blank individual profiles remain supported. Unknown workspace fields or schemas stop a rewrite and preserve the encrypted file.
- **Capacity errors leave an editable workspace.** The 9 MiB encrypted-record limit has a distinct recoverable error. PDF replacement and import preflight the complete prospective workspace before replacing its saved file or résumé. Android's supported `PdfRenderer` must open and render a page from a selected PDF; a signature-only or unreadable document leaves the earlier bytes intact. This is a readability check, not a guarantee about every document or every PDF renderer defect.
- **Equivalent HTTPS origins share a canonical namespace.** Explicit default port spellings such as `:443` and `:00443` resolve to the same service origin. Known older aliases are copied only into an absent canonical scope, and their original encrypted files remain available for explicit review and merge. Account IDs and nondefault origins remain separate. Unknown historical aliases cannot be inferred from a one-way filename hash; an existing saved raw origin and the common `:443` alias are recognized.
- **Profile fields match the connected service contract.** Inline errors cover names/phone/city (150), headline (500), email (254 and the service-compatible syntax), recognized countries/regions, list counts (30) and item lengths (100), work modes, public HTTPS portfolio URLs and LinkedIn profile links. Target-country selection stops at 30. Incomplete drafts remain on the phone; edits are not silently shortened to satisfy the service. Local job details retain up to 500 characters and job links up to 4,096; the service's narrower employer-name and URL requirements are checked before syncing.
- **Phone data has explicit export, import, recovery and deletion controls.** Settings → Phone data, backup and recovery exports the selected scope's profile, optionally its locally held PDF bytes, saved jobs, private records/history, unfinished edits, answer drafts, receipt copies and last search. The JSON file is readable private data, so the user chooses where to keep it. Stored connection tokens and approval authority are excluded. A scoped import preview requires deliberate merge choices; existing history and conflicting drafts are retained. Employer consent checkboxes are cleared on import. File receipts become a separate unverified archive and never raise the verified application count. Stop holds are added only when the source service and workspace match the destination. Selecting a file or export destination is bound to the workspace that opened the picker.
- **Earlier preserved areas now have a recovery path.** The app can inspect and merge a readable workspace retained by Start fresh, and explicitly delete a selected earlier copy. Unreadable earlier files remain preserved. Deleting the active local scope also deletes its saved search and known equivalent-address files, while other scopes, older recovery areas, exported copies, service records and employer-held applications stay separate. Active Auto Apply work must be stopped and refreshed before deleting the current local workspace. Cloud account deletion remains in the service's account page.

### Portable file contract and bounds

The shared iPhone/Android envelope is `format: "career-finder-phone-workspace"`, `version: 1`, with `platform`, `exportedAt`, `source`, `data`, and optional platform extensions. Common data includes a profile and optional PDF, saved jobs, flattened record/history versions, unfinished record/opportunity drafts, and restrictive Stop holds. New record drafts omit optional `recordID` and `revision`; JSON `null` is treated as absent, never as revision authority. Android extensions preserve its exact record bundles, raw unfinished fields, answer drafts, unverified receipt archive, alternate opportunity drafts and bounded discovery snapshot. No import grants application approval.

Android limits a backup file to **24 MiB**, the resulting encrypted workspace to **9 MiB**, a résumé to **5 MiB**, and the last search to **2 MiB / 200 results**. An oversized import is rejected before workspace replacement and leaves the source file available. iPhone has its own explicit storage/count limits; large Android-only histories or unfinished values beyond those limits may need a narrower transfer. This is deliberate bounded portability, not a claim that every arbitrarily large backup works on every device. A platform ignores the other platform's private extension; common records, history, profile and drafts are the shared transfer surface.

The common synthetic fixture is `app/src/androidTest/assets/phone-workspace-v1.json`. It includes a readable one-page PDF, a new unsaved record draft without revision authority, current/history records, Unicode text, a Stop hold, 4,096-character job URL and 500-character job text fields. It is an instrumentation asset, not applicant data or a production vacancy.

### Verification for this source change

`checks/run-policy-checks.sh` passes **122** executable JVM boundary checks without a device or network. `checks/strict-review-2026-11-17.json` records the baseline and exact policy-source hashes. New native tests are `WorkspaceSafetyRegressionTest` (11 cases) and `WorkspaceAccessibilityRegressionTest` (one large-text multiline-note case); additional checks extend `ContinuationRegressionTest`, `ApplicationRecordRegressionTest`, `NavigationPhoneAcceptanceTest` and `VaultAcceptanceTest`. The connected LinkedIn fixture now uses a contract-valid synthetic public portfolio URL while keeping all service requests injected.

Compilation, lint, all new instrumentation, real document-picker/process-recreation behavior and physical-device accessibility remain gates until the coordinated CI/device results identify an exact new commit. No Gradle build, emulator, signing, publishing or external employer submission was performed by the Android source-editing worker.


### Dedicated recovery proof under bounded heap pressure

`CareerReadTransportRegressionTest#historicalRecoveryUnderRetainedHeapPressurePreservesEarlierWorkspace`
is an additional environment-scoped regression for the observed 192 MiB app heap.
It retains at most 96 MiB, requires the real read-memory guard to refuse the exact
20,373,220-byte historical document before any follow-up page, and keeps that
pressure alive while encrypted recovery is saved, reopened, verified and exported.
The exported bytes, length and SHA-256 must match the complete synthetic asset;
the earlier workspace and draft must retain identical plaintext and ciphertext.
The captured refusal is also routed through an injected service to check the
ViewModel recovery offer. This does not exercise real HTTPS recovery or the system
document chooser.

The ordinary CI runner records this exact method as separately scoped and excludes
only this newly added method with AndroidJUnitRunner's `notClass Class#method`
selector. Every original regression remains selected. Ordinary CI does not claim
that the pressure proof passed. Generic direct runs report an explicit assumption
unless `careerRecoveryPressure192MiB=true` is supplied; that assumption is not
acceptance evidence. A dedicated run must select the method, pass the opt-in
argument, verify `Runtime.maxMemory() == 201326592`, and obtain an actual pass:

```sh
adb -s <owned-serial> shell am instrument -w -r \
  -e class com.saleh.careerfinder.CareerReadTransportRegressionTest#historicalRecoveryUnderRetainedHeapPressurePreservesEarlierWorkspace \
  -e careerRecoveryPressure192MiB true \
  com.saleh.careerfinder.preview.test/androidx.test.runner.AndroidJUnitRunner
```

Use an already reviewed isolated emulator with that heap; this test does not call
GC, increase the heap, or change the production memory guard. A larger generic
heap must not be forced through the 96 MiB pressure budget. The separately reviewed
31-method continuation run rejects every skip and requires this case to pass.
Independent-process results remain distinct from the failed combined-class
memory-continuity runs; the latter are retained in the validation evidence.

The selector is supported by the pinned `androidx.test:runner:1.7.0`; see the
[AndroidJUnitRunner API](https://developer.android.com/reference/androidx/test/runner/AndroidJUnitRunner).
