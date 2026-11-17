# Android accessibility integration map

## Scope and exact frozen source

Read-only analysis of the frozen evidence captured at 23:40:30 UTC on 17 November 2026. No app/source edits, checkout changes, tests, builds, installations, CI dispatch, browser work or external posts. No owner acknowledgement or TalkBack/runtime pass inferred.

- Requested accessibility: `6054d0bcfcd2d84aa5d4701c982d4feb256d9980` (24 total commits; 14 touch Android).
- Later frozen accessibility: `00e4257e519dec88b2b532ef606fbe0633966314` (27 total commits; 17 touch Android).
- Publisher: `2884188263f3dad5753da7b2e507f6ba55e30eb0`.
- RecoveryHEAD: `11cb3d4d8c15e9b16719b6e7091597f43633cda6` plus preserved dirty source.
- Source refs abbreviate `source/<snapshot>/android/app/src/main/java/com/saleh/careerfinder/<filename>:line`; full paths are preserved in the JSON hunk entries. Line numbers are frozen. Parent must recheck source movement.

## Conclusions

The publisher already has the stronger submitted-search retry contract. Preserve it and review the accessibility cooldown UI separately. Raw keyword/location retention is **not** integrated: publisher `Discovery.kt:498` still calls `.take(120)`/`.take(100)`, while its `repairSources` only canonicalizes saved board IDs. The c4/b5 input/persistence hunks remain distinct.

Publisher288 is byte-identical to base243 for `MainActivity.kt`, `ApplicationRecordViews.kt`, `WorkspaceDataViews.kt`, `ProfileContract.java` and `BoundaryPolicyCheck.java`. Their accessibility changes remain distinct. Search-error and connection-error live regions already exist; the relevant a11y hunks only add test tags. No entire Android-touching commit is classified as behaviorally redundant because each retains at least one distinct hunk.

## Exact recovery overlap

Only `MainActivity.kt` intersects the observed Android recovery dirty paths. Base243, publisher288 and recoveryHEAD11cb have identical content SHA-256 `3aed8440668070d2c573a739a84956e3e2ab278d4109ea29ba527b7214416f3e`. Recovery working source SHA-256 is `1a01a32a739d8f62f4639f52012b37d06a498a36db9db6988034617c24ea92a5`.

The frozen changed-base-line ranges do **not** intersect. Accessibility replaces base line417 (the phone-import profile-conflict message); recovery changes adjacent line418 (the Copy selected drafts predicate) and inserts unfinished-draft panels earlier. Keep both. Recovery also adds localized ProfileSummary formatters and the dispatching-receipt Stop action in separate regions. This is shared ownership and adjacent patch context, not a demonstrated same-line merge conflict or permission to integrate.

## Source-confirmed integration caveat

`c4bf5db` removes `error=customError` from the board `Field` at a11y `DiscoveryScreen.kt:285` while adding a separate live message. Existing `Field` maps that parameter to `isError` and `supportingText` (publisher `MainActivity.kt:940-947`). Adapt the announcement while preserving field error styling/supporting text and publisher canonical/duplicate-board validation. A wholesale old SourcesDialog replacement would also discard integrated canonicalization. No runtime failure was claimed.

## Android commit and hunk dispositions

| Commit | Disposition | Exact behavior and source |
|---|---|---|
| `2552446` | Split; email unit distinct; retry intent already covered in a stronger form | Email needed/check/added contract and five checks, missing email error translation, cooldown UI and connection.issue tag. Publisher retrySubmittedSearch preserves the submitted filters and newer draft; keep it instead of adding the older search() retry action. Existing connection error already has a live region; that hunk adds a test tag only. Source: `a11y-current/MainActivity.kt:777-794,1125-1128`; `ProfileContract.java:31-36`; `publisher288/DiscoveryScreen.kt:117-130`; `Discovery.kt:566-569`. |
| `fa759f0` | Distinct cooldown explanation; adapt to existing retry | Android-only change in this commit adds Try again after {0} while waiting. It does not add Android saved-search recovery; that recovery already exists in base/publisher. Source: `a11y-current/DiscoveryScreen.kt:118-136`; `publisher288/DiscoveryScreen.kt:84-90`. |
| `b6d5fca` | Distinct announcement and test tag | Android-only change adds a polite live region and discovery.linkedinIssue to the existing invalid LinkedIn search explanation. Source: `a11y-current/DiscoveryScreen.kt:179-182`. |
| `c4bf5db` | Distinct raw-input retention and announcements; adapt board field hunk | Remove query/location truncation in editFilters and add oversized-search-save guard preserving earlier file. Adds board/catalog announcements and opportunity-save error announcement. Preserve publisher canonical/duplicate board validation; do not remove Field(error=customError) when adding live-region output. Source: `a11y-current/Discovery.kt:231-243,278-285`; `DiscoveryScreen.kt:285-295`; `MainActivity.kt:1196-1199`; `publisher288/Discovery.kt:456-473,496-502`; `MainActivity.kt:940-947`. |
| `b5f8dff` | Distinct; retain as refinement of c4 guard | Adds state.value.filters==capturedFilters before publishing oversized-save error, restoring-search announcement and catalog retry outside dialog. Dialog local val is a refinement around its announcement. Source: `a11y-current/Discovery.kt:239`; `DiscoveryScreen.kt:60-63,98-105,261-267`. |
| `720fce5` | Distinct backup/apply announcements; discovery tag only | Profile-dirty Apply message, deletion blocker, PDF import problem and workspace import error gain polite live regions. Search error already had a live region in publisher; discovery.error adds only a test tag. Source: `a11y-current/MainActivity.kt:655-656`; `WorkspaceDataViews.kt:119-120,167-169,195-197`; `DiscoveryScreen.kt:128-129`. |
| `1c44581` | Distinct; adjacent recovery context requires reconciliation | Record restored-draft/conflict messages and phone-import profile-conflict message gain live regions. In MainActivity, a11y replaces base243 line417; recovery changes adjacent line418 and inserts draft previews earlier. No exact changed-base-line intersection observed. Source: `a11y-current/ApplicationRecordViews.kt:93-106`; `MainActivity.kt:423-427`; `recovery-working/MainActivity.kt:423-440,457-458`. |
| `9700d0e` | Distinct storage announcements | Storage-blocked Settings text and StorageRecoveryScreen headline gain polite live regions. Source: `a11y-current/MainActivity.kt:273-277,299-305`. |
| `f139c04` | Distinct expired-review explanations | Adds expired earlier-review and current-plan explanations; only the first expired earlier review is a live region to reduce duplicate announcements. Existing disabled controls alone do not provide this copy. Source: `a11y-current/MainActivity.kt:615-625,674-676`. |
| `f6ec0cd` | Distinct status announcement and helper dependency | Adds optional Modifier parameter to StatusPill and uses it for automatic-sending-unavailable live region. Needed before the 47fdfb2 StatusPill call. Source: `a11y-current/MainActivity.kt:592,1031-1036`. |
| `47fdfb2` | Distinct; depends on StatusPill modifier support | Newer saved profile status gains polite live region; keep recovery ProfileSummary localization helpers in the nearby region. Source: `a11y-current/MainActivity.kt:356`; `recovery-working/MainActivity.kt:332-362`. |
| `6411a10` | Distinct reconnect announcement | Reconnect title gains a polite live region only when pairing is required. Source: `a11y-current/MainActivity.kt:1085-1086`. |
| `c04ea87` | Distinct note-limit feedback | When boundedApplicationNote truncates, show a polite limit message; reset below 2000 and preserve existing bounded note write. Source: `a11y-current/ApplicationRecordViews.kt:82,132-140`. |
| `ee3bac2` | Distinct no-selection feedback | Shows Choose what to import when all three import categories are unselected; retains existing disabled predicate and model call. Source: `a11y-current/WorkspaceDataViews.kt:198-202`. |
| `1838e0a` **after 6054** | New after6054; distinct selected-date semantics | Adds localized selected civil date as stateDescription while preserving the Choose date content description. Source: `a11y-current/ApplicationRecordViews.kt:201-211`. |
| `910369f` **after 6054** | New after6054; distinct Arabic stage formatting | Replaces interpolated English stage sentence with localized stage plus localized {0} · your record template. Source: `a11y-current/ApplicationRecordViews.kt:33`. |
| `00e4257` **after 6054** | New after6054; distinct backup preview localization | Localizes backup country/target countries, closed work-mode and experience choices; preserves free text. Similar purpose to recovery ProfileSummary formatters but different file and surface, not an integrated equivalent. Source: `a11y-current/WorkspaceDataViews.kt:145-149,180-186,210-234`; `recovery-working/MainActivity.kt:332-362`. |

Commit JSON includes exact full SHA, subject, all Android paths and original patch hunk headers. Commit message scope differs by platform: fa759f0 is only the cooldown explanation on Android; b6d5fca is only LinkedIn warning semantics on Android.

## Small owner-reviewed integration units

### U1 — Email status and required translations

Paths: `MainActivity.kt`, `ProfileContract.java`, `BoundaryPolicyCheck.java`, `NativeStringIds.kt`, `values/career_copy.xml`, `values-ar/career_copy.xml`.

Take only the email essentials helper/call/checks from255. Route the single missing email translation through the shared localization owner, retaining publisher catalog additions and regenerated chunk layout. Do not copy whole resource files.

### U2 — Cooldown UI on publisher retry contract

Paths: `DiscoveryScreen.kt`.

Review255/fa cooldown state/timer and explanatory copy against existing retrySubmittedSearch. Keep publisher submitted-query retry, draft preservation, partial/unavailable recovery and fresh-search action. No second overlapping search() retry.

### U3 — Search announcements and catalog retry

Paths: `DiscoveryScreen.kt`.

Apply focused restoring, LinkedIn, catalog and error-tag hunks. For custom board error, preserve publisher canonical/duplicate validation and Field(error=customError); add live feedback without dropping field error styling/supporting text.

### U4 — Untruncated draft plus guarded persistence

Paths: `Discovery.kt`.

Integrate c4 editFilters raw-text retention and oversized-save rejection together with b5 captured-filter guard. Preserve publisher canonical board repair, parser, deadline, generation and submitted-search state. Owner should exercise long Unicode input, old-file preservation and edit-during-save before claiming behavior.

### U5 — MainActivity announcements

Paths: `MainActivity.kt`.

Owner-review small function-level hunks. Add StatusPill Modifier support with its new uses. Preserve recovery localized ProfileSummary, unfinished opportunity previews plus widened Copy selected drafts predicate, and dispatching receipt stop action. Adjacent PhoneImport lines need deliberate reconciliation; no same changed base line was observed.

### U6 — Record editor feedback through6054

Paths: `ApplicationRecordViews.kt`.

Apply 1c restored/conflict announcements and c04 note-limit feedback as a single-file presentation unit; no observed recovery dirty-file overlap.

### U6-new — Later date and Arabic stage fixes

Paths: `ApplicationRecordViews.kt`.

Review1838e0a and910369f as explicit post6054 additions. They touch distinct summary/date regions and need EN/AR semantics verification; do not silently expand the requested 24-commit review scope.

### U7 — Backup blockers through6054

Paths: `WorkspaceDataViews.kt`.

Apply720 deletion/PDF/import announcements andee3 no-selection explanation without changing import action semantics. No observed recovery dirty-file overlap.

### U7-new — Later backup profile choice localization

Paths: `WorkspaceDataViews.kt`.

Review00e4257 separately. Recovery has similar formatter intent in MainActivity but not this preview. Preserve closed-choice translations and free text; coordinate consistency without overwriting either surface.

## Verification limits

This is an integration map from committed and dirty source snapshots. No patch application, compile, test, native acceptance or assistive-technology run was performed. Suggested verification is pending owner work, never a passed gate. The shared localization owner remains responsible for catalog changes. Good Spender is excluded; original deadline and existing owners remain unchanged.
