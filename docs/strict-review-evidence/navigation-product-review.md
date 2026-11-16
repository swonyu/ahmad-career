# Career Finder: navigation and product critique

Read-only review of the current LinkedIn work in progress. This report identifies a bounded improvement pass; it does not claim every recommendation has been implemented.

## Existing strengths to preserve

- Search and saved opportunities without an account.
- Blank identity/profile defaults for every new user.
- Encrypted phone drafts and explicit profile upload choice after pairing.
- Profile conflict recovery and draft persistence.
- Explicit source coverage, timestamps, partial outages and stale-result labels.
- Exact application review and separate real/test/uncertain provider receipt handling.
- Android saved-job search, confirmation for local removal, three-essential profile checklist and receipt filters.
- iPhone restored discovery sessions, legacy record preservation, five-tab navigation and preparation checklist.
- Hosted one-time pairing, Google through ChatGPT sign-in guidance, data export, session revocation and deletion.
- The in-progress LinkedIn saved profile link and explicit external job-search handoff; no duplicate OAuth UI should be added without actual official integration.

## Prioritized findings

### NAV-1 — iPhone removal of a saved local opportunity has no confirmation or undo

**Severity:** P2

The Remove saved link button invokes model.removeLocalJob(id) directly. removeLocalJob persists deletion and removes selected/answers entries. The Android equivalent already presents an explicit two-choice confirmation.

**Recommended implementation:** Capture the current local job ID/title/company in confirmation state. Show Remove saved link and Keep opportunity, and re-check that the same record is still local and removable when confirmed. Keep remote records, reviews, receipts and unrelated drafts intact. Prefer exposing the action in Saved detail as well so users do not have to enter Apply to manage a saved link.

**Source locations:**

- `apple/AhmadCareer/NativeApplicationsViews.swift: NativeApplicationsScreen.opportunities`
- `apple/AhmadCareer/NativeApplicationsStore.swift: removeLocalJob(_:)`

**Acceptance criteria:**

- Cancel leaves the record and answers unchanged.
- Confirm removes only the captured local record.
- Switching workspace or syncing the record before confirmation prevents stale removal.
- Long role/employer text and AccessibilityXXXL keep both choices reachable.

### NAV-2 — Modern saved jobs need a useful external-application record

**Severity:** P2

iPhone NativeSavedApplicationDetail for modern discovery/manual-link jobs only opens/shares the employer URL or opens Apply. The self-reported Applied/Interviewing/Offer states and appliedURLs input come from legacy NativeCareerStore snapshots. Android has manualApplied checkbox persistence but no applied date, follow-up date or note for these jobs. A user applying through LinkedIn or an employer site needs a record even while live Auto Apply is disabled.

**Recommended implementation:** Add a small local Application record section to saved-job details: stage (Saved, Applied, Interview, Offer, Closed), optional applied date, optional follow-up date, and a short private note. Clearly label it Your record and keep it separate from verified provider receipts/counts. Derive the manual-applied duplicate-prevention input for Applied/Interview/Offer from this same record. Preserve it when local IDs become service IDs. Surface upcoming follow-ups in Saved with a filter; do not add another top-level tab or notification permission.

**Small first slice:** If time is tight, first give iPhone the existing Android I applied on the employer site toggle and make it participate in prepare. Then add optional dates/notes in a collapsible detail form on both phones.

**Source locations:**

- `apple/AhmadCareer/NativeCareerViews.swift: NativeSavedApplicationDetail, NativePlanScreen`
- `apple/AhmadCareer/NativeApplicationsViews.swift: appliedURLs, opportunities`
- `apple/AhmadCareer/NativeApplicationsStore.swift: prepare(manualAppliedURLs:)`
- `apple/AhmadCareer/MobileApplicationState.swift: persisted local workspace model`
- `android/app/src/main/java/com/saleh/careerfinder/MainActivity.kt: SavedJobsScreen, ReceiptsScreen`
- `android/app/src/main/java/com/saleh/careerfinder/CareerViewModel.kt: markAppliedElsewhere, syncOpportunity`
- `android/app/src/main/java/com/saleh/careerfinder/Models.kt: CareerUiState`

**Acceptance criteria:**

- Fresh profiles contain no seeded application history.
- Legacy files decode without losing data; unknown future schema stays preserved.
- Marking applied never creates a verified receipt.
- The prepare payload excludes self-reported applications on both platforms.
- Records survive relaunch and local-to-service import, remain scoped to the correct workspace, and a canceled editor makes no changes.
- Follow-up civil dates retain the date the user selected across time-zone changes.

### NAV-3 — Android loses the entire discovery session after process restart

**Severity:** P2

DiscoveryController starts MutableStateFlow(DiscoveryUiState()) and owns in-memory jobs/filter results without storage restoration. iPhone CareerDiscoveryStore already persists query, lastQuery, page and jobs, marks restoredResults and disables old-cursor pagination until a fresh search.

**Recommended implementation:** Persist a bounded encrypted last-search snapshot using the existing private store. Restore keywords, location, board selection and previously checked results with an explicit Previous results label and Search again action. Do not silently refetch at launch. Do not reuse an old cursor after restart. Optional saved-search history can wait; one last session fixes the main discontinuity.

**Source locations:**

- `android/app/src/main/java/com/saleh/careerfinder/Discovery.kt: DiscoveryController, mutable DiscoveryUiState`
- `android/app/src/main/java/com/saleh/careerfinder/CareerViewModel.kt: discovery construction`
- `android/app/src/main/java/com/saleh/careerfinder/SecureVault.kt: PrivateStore implementation`
- `android/app/src/main/java/com/saleh/careerfinder/DiscoveryScreen.kt: DiscoveryScreen`

**Acceptance criteria:**

- A process-restart fixture restores the exact last displayed filters/results and their original check times.
- Restored pagination is unavailable until a new search.
- Invalid or future-version search files are preserved and the user gets a recoverable message.
- A failed refresh keeps earlier results.
- The snapshot contains no account token, resume or application profile fields.

### NAV-4 — Default phone connection exposes infrastructure details before the user needs them

**Severity:** P2

Both native forms expose a full editable HTTPS service address in the primary setup flow. Android asks users to Open secure connection setup, obtain a pairing code and Pair this phone while also showing a long privacy explanation. Hosted Connect always presents its origin/copy-address field despite the current apps already filling it. The secure code/account binding itself is already implemented and should be kept.

**Recommended implementation:** Use two short steps: 1 Sign in and get a code; 2 Paste the code and Connect this phone. Show Career Finder as the default destination with a compact verified-origin detail. Put custom service address and operator instructions under an Advanced / Use another service disclosure. Preserve an existing custom origin exactly. Keep the Google-through-ChatGPT explanation adjacent to the sign-in action. Collapse detailed privacy/storage text behind a clearly named link; keep the upload boundary in the short primary flow.

**Source locations:**

- `apple/AhmadCareer/NativeApplicationsViews.swift: NativeApplicationConnection`
- `android/app/src/main/java/com/saleh/careerfinder/MainActivity.kt: ConnectionDialog`
- `career-finder-service/app/connect/ConnectionPanel.tsx`
- `career-finder-service/app/connect/page.tsx`

**Acceptance criteria:**

- Default setup needs no address editing/copying.
- Existing custom service setups remain supported and are never reset silently.
- Code/account-change/expiry protections are unchanged.
- No automatic clipboard reads; any paste action is initiated by the user.
- Browser guidance uses the actual native labels and accurately distinguishes Google through ChatGPT from a separate Career Finder OAuth integration.

### NAV-5 — iPhone lacks the simple application-readiness guidance Android already has

**Severity:** P2

iPhone Start offers several next-step buttons, Profile has Application profile plus Local planning notes/criteria, and the Apply profile card uses name/CV filename only. Android already has ProfileEssentials with Name, Email address and PDF resume readiness and reuses it on onboarding/profile/apply. iPhone users can miss a missing or invalid email until a review fails.

**Recommended implementation:** Add one reusable three-essential readiness component on iPhone, using the same validation rules as real save/prepare. Place it with the primary application profile action on Start/Profile and show a single context-appropriate next step such as Add email or Choose PDF. Keep optional experience/preferences and preserved legacy planning tools below a disclosure. Do not add a blocking onboarding wizard or make account connection compulsory for search.

**Source locations:**

- `apple/AhmadCareer/NativeCareerViews.swift: NativeShortlistScreen, NativeProfileScreen`
- `apple/AhmadCareer/NativeApplicationsViews.swift: profileCard, NativeApplicationProfileEditor`
- `apple/AhmadCareer/MobileApplicationClient.swift: PhoneApplicationProfile and validation helpers`

**Acceptance criteria:**

- Missing name, invalid email and missing PDF are each explained next to an actionable profile edit button.
- Selecting a PDF alone does not imply the profile or user identity is verified.
- Unfinished local drafts remain saveable.
- All existing planning notes remain accessible and unchanged.
- Large text and VoiceOver retain useful order and clear needed/ready labels.

## Scope and evidence

015 UI large-text footer/identifier failure is separately with iPhone owner; do not count this as a newly unassigned recommendation.

The machine-readable report records source fingerprints for this changing snapshot. The CI report in the same directory binds the preserved strict-review test result to commit `015b3fd3496dcef7090c3706eac7b6109ce79965`; it does not validate the later LinkedIn edits.
