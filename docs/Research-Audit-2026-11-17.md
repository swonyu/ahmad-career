# Career Finder — primary-source research and strict acceptance audit

**Review date:** November 17, 2026. **Source inspection checkpoint:** 08:16 UTC, with focused reads through 08:27 UTC. **Status:** isolated, unpublished continuation candidate. This report accompanies a privacy-page correction and revised owner acceptance procedure. It is not a deployed-source, real-provider, physical-device or store-approval receipt.

## 1. Decision and evidence boundaries

The candidate has substantial account-isolation and failure-recovery controls in source. The strongest demonstrated release defect in this audit is a privacy disclosure that no longer matches direct LinkedIn sign-in. The companion correction explains which LinkedIn flow collects a verified email and which only links a basic profile. It also repairs the browser-data navigation instructions. The owner checklist now distinguishes direct login, authenticated linking, recovery, protected disconnection and the verified-email failure path.

These fixes do not remove the principal external gates: activating the correct saved service source/configuration, real Google and LinkedIn consent, authorized disposable-account acceptance, physical phone accessibility, publisher coordination and native-store sign-in review. No P0 exploit or proven account-isolation bypass was reproduced in this read-only research lane. That finding is narrower than a claim that every security property is proven.

This audit uses current primary documentation from Google, LinkedIn/Microsoft, OpenID Foundation, IETF, OWASP, W3C, Apple and Android. Search and page retrieval were used directly; no billable Parallel research, paid API, account enrollment, domain purchase or employer submission was performed. Protocol specifications and store policies are distinguished from design guidance. Each implementation conclusion below is our analysis of the named source, not a statement by the external authority.

| Evidence boundary | Identified source | What may be claimed |
| --- | --- | --- |
| Historical native application test milestone | `e66d1809ece7666c7d99412d48aa193cdf024c42`; evidence `949ce0ad327beab79fa7033423b462ebc7bd98be` | Five CI gates passed on that historical source, including 99 Android and 13 iPhone UI cases. |
| Last identified hosted preview | v7; source `1135a3270435d3719c6f62f1a2e3a53e2c040146`; deployment `appgdep_6afbcfe3a03881918b131992225ded31` | The recorded live baseline, not the redesigned local candidate. |
| Integrated continuation source | Uncommitted candidate inspected by file digest; appendix below | Source behavior and bounded review findings. A later commit needs its own matching test/deployment receipts. |
| Google setup checkpoint | [Redacted configuration receipt](strict-review-evidence/continuation-2026-11-17-cloud/google-provider-configuration.json), recorded 08:24 UTC | Client registration, private environment revision 1, non-sensitive scopes and External/Testing state. At that checkpoint, branding completion, deployment with revision 1 and a real callback were unverified. |
| Publishing release branch | `app-store/career-workspace-copy-20261117` at last identified `fd9c5399f2b7001b234b3b86bf72e2b36b5114c1` | Separate owner and history. No merge, shared Mac build, signing change or confirmed handoff receipt is established by this report. |

The separate auth and browser-review lanes can add exact runtime receipts. Their reported counts must not be silently relabeled as tests executed by this research lane. Arabic/English localization was requested while this report was being completed; it is a subsequent implementation slice and needs its own resource, RTL and runtime evidence.

## 2. Actionable findings and severity

Severity here describes the consequence of shipping the candidate with the condition unresolved. An external prerequisite is not presented as a reproduced code vulnerability.

| ID | Classification | Evidence and consequence | Action/status |
| --- | --- | --- | --- |
| R01 | **P1 source/documentation defect** | `hosted/app/privacy/page.tsx` said LinkedIn does not request or store an email and described only ChatGPT/Google login. `oauth.mjs` now requests email for direct LinkedIn login, requires fresh verification and persists it. Users would receive inaccurate information about account data. | Corrected in the companion privacy patch. Integrate and deploy it with the same provider implementation before enabling that flow. |
| R02 | **P2 navigation defect** | Privacy controls pointed to Profile for browser export/clear. The candidate places these controls in `PhoneApp.tsx`, Settings → Your saved data. | Corrected in the companion patch, including metadata-only account deletion. |
| R03 | **P1 acceptance gap** | The old owner procedure covered LinkedIn basic linking and Google recovery, but omitted direct LinkedIn consent, optional-email failure, LinkedIn recovery and both providers' original/current-method protection. It could produce a misleading completion claim. | Companion checklist now covers these cases and separates saved configuration from deployment. No real check is marked passed. |
| R04 | **P2 native copy drift** | At inspection, `NativeCareerViews.swift` described hosted identity only as ChatGPT; `NativeApplicationsViews.swift` told people to choose Google on the ChatGPT screen. This is incomplete once direct providers ship. | Assigned to the native wording/localization slice. Keep fallback wording accurate before direct-provider rollout; no protocol change is needed for this copy fix. |
| G01 | **P1 provider release gate** | Google receipt shows a test client and saved secrets, not an activated deployment or public verification. Shared-domain ownership/verification evidence is absent. | Match source + environment + deployment; run actual consent; retain a test audience until production prerequisites are resolved. |
| G02 | **P1 provider release gate** | LinkedIn app/product/Page approval and real callbacks were not observed. An implementation cannot provision the external product. | Complete accurate authorized registration; retain unavailable state and ChatGPT/Google fallback where applicable. |
| G03 | **P1 iOS publishing gate** | Third-party login authenticates the Career Finder workspace; no demonstrated qualifying equivalent privacy-preserving login or applicable Apple 4.8 exception is documented. | Publishing owner must resolve and document the exact strategy before store submission; do not assume ChatGPT automatically qualifies. |
| G04 | **P1 iOS publishing gate** | Native connection uses a normal SwiftUI `Link` to browser sign-in. Apple's deletion guidance also cautions against default-browser sign-in/registration. | Publisher must assess and reconcile the actual native authentication handoff. A successful browser flow alone is insufficient. |
| G05 | **P1 acceptance gate** | Revised native navigation, appearance and icon assets lack new physical-device/assistive-technology acceptance. Web focus near fixed navigation needs rendered measurement. | Use the focused matrix in section 7 and source-specific device receipts; do not infer failure or success merely from CSS. |
| G06 | **P1 account acceptance gate** | Real A → B → A, deletion, recovery and interrupted operations remain distinct from synthetic fixtures. | Use only authorized disposable workspaces and synthetic records. Preserve personal accounts and installed data. |
| G07 | **P1 integration gate** | Publishing owns the release branch/shared signing; the prior rate-limited handoff is not proof of receipt. | Obtain acknowledgment before shared builds/release edits. Continue only isolated candidate work while unavailable. |

No finding justifies turning on live automatic applications. The employer-link path remains useful without an authorized submission integration. No successful identity login, CV upload or prepared review is itself an employer application receipt.

## 3. Provider identity: what is implemented and what it means

### 3.1 Stable identity is not an email match

Google's OIDC guidance identifies `sub` as the stable account identifier and warns against treating email as an immutable identifier; callback registration and ID-token validation are part of the protocol contract.[S1] OpenID Connect requires a UserInfo subject to match the ID-token subject before its claims are used, and treats issuer plus subject as the stable identity pair.[S5]

**Source analysis:** `OAUTH_PROVIDERS` fixes each provider's issuer, token, authorization and key endpoints. `verifiedClaims()` verifies RS256 signatures with an allowlisted issuer/audience, required claims, nonce and token age. Google accepts its documented issuer alternatives within one provider namespace. LinkedIn uses its specific issuer. The persistence key is `(provider, subject)`, not email. The callback refuses linking an identity owned by a different workspace; the SQL update requires the existing owner to equal the intended owner.

The email is used as the provider-asserted verified contact associated with direct login and workspace recovery. It is not legal identity verification. Google also explains that `email_verified` can remain true for a non-Gmail address without a hosted-domain claim after third-party mailbox ownership changes.[S19] A fresh validated token is therefore not independent fresh verification of mailbox control. The subject-only ownership model avoids turning this address into an account-merge credential; future employer acceptance must not overstate that email assurance. Two people with similar or recycled addresses, or two providers returning the same address, must not become the same Career Finder owner merely through that coincidence. Conversely, when the same provider subject returns a changed verified email, the workspace may need an explicit contact update before an application review can use it. The source's `emailUpdateRequired` path is material: opening Account should not silently rewrite an approved application snapshot.

**Acceptance:** record the intended provider and account alias before consent, return through the same subject, and verify the same workspace. Use a second authorized disposable owner to test link conflict. Do not create an artificial real-provider identity or alter an email claim to demonstrate a test. Fixtures can cover adversarial claims; a real-account result must describe what the actual provider returned.

### 3.2 LinkedIn direct login and basic linking are intentionally different

LinkedIn's current OIDC product provides `openid`, `profile` and `email` scopes, documents `email` and `email_verified` as optional, and explicitly does not represent its sign-in product as legal-identity verification.[S4]

| Candidate intent | Requested scope | Data and success condition | Deliberate failure behavior |
| --- | --- | --- | --- |
| Google direct login/link | `openid email profile` | Valid provider subject and verified email, optional display name; link requires an authenticated target owner. | Invalid identity/email or an owner conflict fails without merging. |
| LinkedIn direct login | `openid profile email` | Fresh verified email in ID token, or one bounded UserInfo response whose subject exactly matches the token; stable LinkedIn identity. | Missing verified email produces `email_required`; no new account or session is created by that attempt. |
| LinkedIn basic link | `openid profile` | Stable subject plus optional name; an already authenticated Career Finder owner chooses the link. | No new email is requested or collected. A different existing owner is never reassigned. |

`linkedinLoginClaims()` does not recover a missing email from a previously stored record. That is a useful separation: a basic profile link can exist without claiming to have established a fresh verified recovery email. A later direct LinkedIn login succeeds only if that later exchange satisfies the email policy.

The upsert uses `COALESCE(excluded.email, auth_identities.email)`. Therefore an identity that previously completed direct login may retain its verified email when a later basic-link exchange supplies none. The repaired disclosure says **no new email collection** during basic linking, rather than making the false claim that an email can never be stored for that identity.

The UserInfo fallback uses a fixed LinkedIn endpoint, a short timeout and a response-size bound. The access token is used only for that exchange and is not persisted. The source does not obtain LinkedIn job-application permissions, fetch a CV or scrape private job information. Saving a LinkedIn profile URL and opening a keyword search remain separate user actions. Their existence must not be marketed as an authorized automatic application integration.

**Tradeoff:** requiring a verified email excludes some otherwise valid LinkedIn identities from direct login. That is an explicit Career Finder product/security rule, not an OIDC rule that every relying party must demand email. The implemented workaround is concrete: authenticate through an available method, then link the basic profile. It preserves the existing workspace and avoids invented placeholder addresses.

### 3.3 Production provider setup is a separate system

Google's authentication production guidance calls for accurate identity, minimal scopes, appropriate production/testing separation, owned domains, a public home page and secure registered redirects.[S2] Brand verification has additional conditions for external published apps displaying branding; the development/testing exceptions do not establish approval for a public production audience.[S3]

**Observed configuration:** the redacted receipt shows an enabled web client with the exact Career Finder callback, saved environment revision 1, no selected billing account, three non-sensitive scopes, External/Testing and one owner test user visible. The duplicate/ineligible dialog after a repeated save is recorded as an observation, not hidden as a clean second successful addition. At the recorded checkpoint, branding, deployment and real callback remained false/unverified.

**Inference:** a shared `chatgpt.site` hostname may be usable for a limited registered test callback without proving that this publisher can satisfy production domain verification. This audit does not determine ownership eligibility from the hostname alone. Do not solve that uncertainty by buying a domain or claiming another party's domain. The immediate free path is the existing hosted preview and its available ChatGPT login, while the direct provider remains bounded by its actual setup state.

For LinkedIn, the portal app, accurate publisher association and OIDC product enablement are prerequisite evidence. A prepared form, successful logo generation, requested scope string or nonempty secret does not prove the product is enabled. Production approval times are external; an engineering time budget cannot guarantee them.

`SignInOptions.tsx` provides an additional compatibility guard: direct LinkedIn login requires both configuration and `signInSupported === true`. That prevents a basic-link-only older service from being advertised as a direct-login service. Keep that capability distinction through deployment and rollback.

## 4. OAuth, session and account-lifecycle critique

RFC 9700 describes protections against authorization-code injection, mix-up and CSRF, including transaction-bound state/nonce, exact redirects and PKCE where supported.[S6] OWASP's session guidance recommends unpredictable server-managed session identifiers and explicit cookie protections; `SameSite` is defense in depth, not a substitute for request authorization. Its `HttpOnly` guidance also does not claim protection from all actions an injected script could perform.[S7]

The following are **verified source properties**, not claims that every possible race has been exercised:

| Boundary | Implementation inspected | Remaining proof/limit |
| --- | --- | --- |
| Callback destination | Fixed `AUTH_ORIGIN`; provider-specific callbacks; bounded internal return routes. | Real console registration and deployed proxy/origin behavior must match. |
| Browser/transaction binding | Random 32-byte state, nonce and browser token; hashed stored values; ten-minute transaction lifetime; atomic transaction claiming. | Reused, expired, wrong-browser and wrong-provider callbacks need negative fixture evidence and representative real cancellation/expiry observation. |
| Code exchange | Server-side fixed endpoints; redirect refusal, bounded response and timeout; Google S256 PKCE. | LinkedIn's shown discovery metadata does not advertise PKCE support. Do not invent support, remove state/nonce, or call its absence an exploit without evidence. |
| Token validation | RS256 signature, issuer, audience, required claims, nonce, age and authorized-party checks. | Real issuer/key rotation and consent errors are external runtime checks. |
| Session cookies | `__Host-career-session` and `__Host-career-oauth`; Secure, HttpOnly, Path=/, explicit SameSite=Lax; no Domain attribute. | Cookie behavior must be tested in actual Safari/Chrome and the deployed callback flow. Lax intentionally permits the top-level safe navigation used by OAuth. |
| Session authority | Stored token hashes; expiry; account-generation and provider-subject joins; invalid own cookie does not fall through into a different ChatGPT account. | The seven-day session is a design choice, not a proof that provider-side revocation immediately signs users out. |
| Mutating account requests | Exact origin, expected account ID, and expected provider connection generation. | UI cancellation alone cannot authorize a request; the server predicates are the critical boundary. |
| Delayed unlink | Atomic guarded batch keeps identity present until final deletion, checks owner generation/lifecycle/session/connection ID. | Race tests should pause immediately before the guarded write, then revoke or replace authority. |
| Deletion/recreation | Durable HMAC owner lifecycle marker plus generation/time; separate short OAuth deletion fence; deletion removes sessions/links/transactions. | Test stale in-flight requests against a newly created workspace, not just against an absent old row. |
| SSR identity | Caller-supplied `x-career-*` stripped before verified SSR injection; ChatGPT identity depends on Sites-owned ingress headers. | A standalone mock accepting arbitrary `oai-authenticated-*` headers is not proof of deployed ingress behavior. Verify that platform trust boundary separately. |

### Race analysis that matters to this implementation

The dangerous sequence is not simply “request after deletion.” It is “request captures valid identity, waits on provider/network/storage I/O, deletion completes, a new lifecycle starts, old request resumes.” A request that only checked ownership at its start could then resurrect or mutate records. The candidate's account generation, owner lifecycle and connection generation address different parts of that sequence; none should be removed as redundant merely because another ID already exists.

Provider linking must capture the authenticated target before leaving for consent and reject if it is no longer current on return. Unlink must bind to the actual connection the person confirmed: a stale confirmation should not disconnect a newly replaced connection with the same provider name. Logout and deletion must revoke local browser sessions, while an invalid provider cookie must not silently reveal a different account supplied by the hosting login. These are the invariants the independent auth lane should prove with delayed-I/O fixtures.

The UI adds another layer. `ProviderConnections.tsx` invalidates visible actions on focus, visibility and page-show changes; it suppresses stale notices and refreshes after disconnection before announcing success. That protects the displayed state, but is not a substitute for the SQL guards. Likewise, client encryption and a non-exportable key improve stored-data handling but do not protect an unlocked browser from code executing on the same origin. The privacy notice already expresses that limit accurately.

### Intentional limits and excluded work

Access/refresh tokens are not retained, so there is no refresh-token storage/rotation feature to certify in this scope. Provider consent can remain in Google or LinkedIn after local disconnect; the user can remove it in provider settings. Direct provider sign-out revokes the Career Finder session, not the provider's global login. No local check should claim otherwise.

This audit does not request broad new provider permissions, background scraping, legal-identity verification, employer impersonation, a custom password database or a new paid authentication service. Those would change the product and its risk profile without resolving the concrete acceptance gates identified here.

## 5. Privacy, export and deletion: verify the whole record

Apple's review rules require accurate privacy disclosures and account controls; its deletion guidance calls for a discoverable path that removes the account rather than merely deactivating it, permits appropriate confirmation, and allows a direct website completion link.[S12][S13] Google Play similarly requires accurate data handling disclosures and, where account creation is offered, an in-app deletion path plus an outside-app web resource. Directing creation through a browser does not remove that requirement.[S17][S18]

**Source analysis:** `AccountPanel.tsx` supports both a populated workspace and an account that has only provider/session metadata. The latter can export its connection records and delete the identity records even before a workspace exists. The former can export JSON, download retained PDFs, revoke phones, delete eligible unused PDFs and delete the active workspace. Deletion confirmation captures account/workspace identity and requires `DELETE`; the success UI requires an explicit `deleted === true` response. Pending deletion is shown as pending, and signing out follows confirmed completion.

This is materially stronger than a button that only clears a browser cookie. `identityDeletionStatements()` removes provider identities, browser sessions and pending owner-bound OAuth transactions within guarded deletion work. File removal uses its own delayed-upload protections. However, source inspection cannot establish that a real storage object was removed or an installed phone's old token stopped working. Those require the authorized disposable test.

The privacy notice distinguishes:

- Active cloud profiles, CV bytes, reviews, application records and phone connections.
- Browser-local drafts, encrypted unfinished edits, bookmarks and private notes.
- Readable exports already saved by the user and employer-held application copies.
- Provider permission grants outside Career Finder's control.
- A short hash-only OAuth fence, durable keyed owner marker and empty upload markers used to prevent stale work restoring deleted data.
- Hosting infrastructure logs/recovery copies, for which immediate erasure is not promised.

The retention markers contain no claimed CV payload, plaintext owner/email or session secret. That is a narrow purpose/data-minimization design, not a guarantee of anonymity in every possible context or a legal retention determination. The publisher must ensure store declarations describe the actual production service, including infrastructure providers and the current notice.

**A complete disposable deletion check** preserves account B, exports A's JSON and PDF separately, revokes one paired device, deletes A, waits for confirmed completion, verifies A's former browser/device credential cannot retrieve its old data, and confirms B remains unchanged. Then deliberately starting a new sign-in is distinguished from resuming a stale callback. Any new blank account must not be confused with recovery of the deleted workspace. No already-downloaded file is expected to disappear from a user's device.

**Play web-resource gate:** the publisher must test the public `/account` route from a signed-out browser and enter the appropriate URL in the actual store form. It needs an understandable route to account deletion without requiring reinstalling the native app. A public privacy paragraph alone is not evidence that the interactive route works. An account-login requirement should be evaluated as verification of ownership, not silently described as an anonymous deletion request. No source in this audit requires granting an unauthenticated stranger power to delete an account.

## 6. Web accessibility: standards mapped to the actual candidate

WCAG 2.2 supplies separate criteria for keyboard operation, focus visibility, text resizing/spacing, text and non-text contrast, reflow and target size.[S8] This audit uses those criteria as concrete acceptance targets. It does not infer full conformance from a palette calculation or automated test.

Two distinctions prevent false findings. Focus Not Obscured (Minimum), AA, requires that a focused component not be entirely hidden by author-created content; full visibility belongs to the stronger enhanced criterion.[S9] Target Size (Minimum), AA, uses 24 × 24 CSS pixels or its defined exceptions; 44 × 44 is the enhanced target-size criterion, not a universal AA minimum.[S10]

| Area | Verified implementation | Focused remaining check |
| --- | --- | --- |
| Themes and text | Semantic light/dark variables, relative sizing, distinct ink/muted/accent roles. | Measure actual rendered foreground/background pairs in ordinary, selected, error and disabled states; include browser controls and autofill. |
| Input boundaries | Final phone override uses `--field-border`; lighter `--line` remains for decorative divisions. | Do not flag an obsolete earlier border rule. Measure the computed border against its actual surface where the boundary communicates control state. |
| Keyboard focus | Visible accent outlines for controls; native dialog component; programmatic section-heading focus. | Walk actual Tab/Shift-Tab order, close dialogs, confirm focus return and visible error/confirmation actions. A noninteractive programmatically focused heading is not the same case as an invisible focused button. |
| Fixed navigation | Mobile navigation height is measured and used in main-content bottom padding; five tabs; desktop switches to a side layout. | A focused field above the fixed footer may still be obscured. Measure the focused control after browser scroll at narrow widths and enlarged text; padding alone proves neither pass nor fail. |
| Targets | Many controls have 44–49px minimum heights; navigation has larger rows; the visual checkbox sits inside a clickable label. | Measure the actual interactive label/hit box, not the icon alone. Check adjacent small controls and modal actions. |
| Reflow | Narrow grid rules, wrapping and min-width constraints are present. | Test 320 CSS-pixel content width and equivalent zoom independently of phone screenshots. Check long titles, email, Arabic expansion and validation text. |
| Motion/forced colors | Reduced-motion overrides and forced-color selected-state outlines exist. | Verify focus and selection remain distinguishable in actual forced colors; a CSS rule is only implementation evidence. |
| State announcements | Loading/status/error regions and explicit provider unavailable states are present. | Confirm announcements are understandable and not duplicated while consent status, PDF parsing and identity checks update. |

Reflow's 320 CSS-pixel reference is equivalent to a 1280 CSS-pixel viewport at 400% zoom for ordinary vertical content, with defined exceptions for genuinely two-dimensional content.[S11] It is not the same test as doubling font size. A screenshot resized after rendering does neither. The browser review lane should preserve the fixture's actual viewport, zoom/font settings, source digest and focused-element bounds.

For text, ordinary-content contrast of at least 4.5:1, large-text contrast of 3:1 and the relevant 3:1 non-text requirement are separate checks. Two-hundred-percent text resizing and text-spacing overrides must preserve content and operation.[S8] The candidate's slate/indigo palette can be measured, but translucent overlays, selected cards and browser autofill can change the effective pair. Do not claim every screen passes because twelve theme-role pairs did.

**No reproduced accessibility failure is asserted from the source-only fixed-footer observation.** The separate actual-React viewport harness is the appropriate place to demonstrate it before making a targeted fix. Its adapters and synthetic namespaces must remain labeled: it can exercise rendering, keyboard behavior and safe mock account states, but cannot prove actual provider consent, production storage isolation or physical assistive-technology behavior.

## 7. Native accessibility and appearance critique

Apple recommends scalable text, adequate contrast in each appearance and comfortably sized controls; its current accessibility guidance lists platform-specific sizes rather than one universal web rule.[S14] Android recommends at least 48dp touch targets and meaningful semantics/descriptions for interactive elements.[S16] These are platform guidance and implementation expectations, not interchangeable CSS-pixel measurements.

**iOS source:** `NativeAppearance` stores System/Light/Dark separately from account and workspace state, applies `preferredColorScheme` at the root and uses adaptive slate/indigo roles. Settings has a dedicated tab and gear, while profile editing remains a reachable Settings destination. The appearance choice exposes selected semantics; the gear and choice rows have deliberate hit areas. Existing profile editors retain their save/discard paths rather than introducing an autosave side effect.

**Android source:** `CareerTheme.kt` keeps display preference in its own SharedPreferences file, follows `isSystemInDarkTheme()` only in System mode, registers and removes a preference listener, and defines paired Material roles. `MainActivity` selects launch styles and manages system-bar icon contrast. Settings presents selectable appearance choices with radio semantics. Narrow navigation wraps when necessary instead of depending on a single compressed row. The visible benefit is an app that can follow the phone or honor an explicit choice without altering saved profiles.

Apple's Dark Mode guidance favors respecting system appearance and advises against an app-specific switch; it also recommends testing both appearances with Increase Contrast and Reduce Transparency.[S15] **Decision:** the user explicitly requested System/Light/Dark, so the candidate intentionally offers the override while defaulting to System and making the difference clear. This is a documented design tradeoff, not a fabricated store rejection. The test is whether System continues to follow a live OS change and whether returning to System removes the override cleanly.

The meaningful physical matrix is small but demanding:

1. On the exact signed/installed iPhone and Android artifacts, select each appearance, restart, rotate where supported and confirm labels, dialogs and system bars stay usable.
2. In System mode, change OS appearance while the app is open. Then switch to an explicit choice and confirm that it stays selected without changing workspace data.
3. Exercise largest relevant accessibility text with the keyboard open. Reach Save, Cancel, Stop/recovery, disconnect and deletion; verify no essential action disappears below an unreachable area.
4. With VoiceOver/TalkBack, navigate all tabs, gear, appearance choices, PDF status, provider state and confirmation actions. Check meaningful names, selected state and error announcements, not just the presence of an accessibility label in code.
5. Revisit a draft after switching sections and after a process restart. A design refactor must not silently discard unsaved work or restore an earlier application approval.
6. Re-run these cases for the subsequent English/Arabic and RTL implementation. Translating text adds expansion, mixed-script identifiers and directionality risks that the English theme checks cannot certify.

No physical device was exercised by this audit. Static XML parsing, a Swift source edit, a Compose semantics assertion or an emulator test cannot substitute for the recorded artifact/device/OS combination.

## 8. Publishing implications that require an owner decision

### iOS third-party primary login

Apple 4.8 applies when a third-party/social login authenticates an app's primary account and describes an equivalent alternative with limited name/email collection, private-email capability and consent regarding advertising interactions; it lists specific exceptions.[S12] It does not justify the simplistic claim that the only permissible remedy is always Sign in with Apple.

**Inference for Career Finder:** the hosted identity authenticates a Career Finder workspace containing profile and application records. It is not merely a link to public LinkedIn search. The repository provides no demonstrated basis to treat this as an exclusive company-owned login or to assume the third-party-service-client exception. ChatGPT appearing alongside Google/LinkedIn is not evidence, by itself, that every 4.8 privacy property is satisfied. The publishing owner must either establish an applicable exception or choose a qualifying equivalent login design and test it. This report does not authorize a new paid service or enrollment.

### Native browser handoff

`NativeApplicationsViews.swift` uses `Link(destination: setup)` for “Sign in and get a code”; the one-time code is then returned to the app. No `ASWebAuthenticationSession` integration was identified in this flow. Apple's account-deletion FAQ specifically says default-browser sign-in/registration is not appropriate under its design guidance.[S13]

**Inference:** this is a native publishing concern even though the browser-based server flow may be secure and useful. Do not claim that completing the browser callback resolves the App Store handoff requirement. Conversely, replacing a `Link` with an authentication session is not automatically a complete solution: the publisher must reconcile callback routing, cancellation, pairing, account continuity and the exact release artifact. While that work is blocked by ownership, the free hosted phone app remains usable and no shared signing environment needs to be changed.

### Store declarations and release integration

The two publishing-only wording commits must retain their meanings: **Connect application workspace**, preparation/manual employer links, public hosted submissions disabled, and explicit approval plus an authorized integration for any supported automatic submission. Integrate these meanings into newer `reviewActionTitle` behavior without overwriting connected-state, Stop or recovery branches. The [integration checklist](Release-Integration-Checklist-2026-11-17.md) records the exact commits and original divergence.

Google Play data declarations should describe actual transmitted identity/profile/CV data and retention, not merely infer “no collection” from a small permission list.[S17] A local-only browsing experience and an optional connected experience can have different data flows. The final store record must match the selected artifact and deployed service. Old green-icon screenshots and earlier UI captures are historical assets, not proof of the new indigo Settings design.

A five-minute pairing code is not a durable reviewer account. Publishing must supply whatever stable authorized review access the final flow requires through private store channels, never a credential in the repository. No upload, review decision or publication date is established by preparing that access or by completing source tests.

## 9. Closing gates in an evidence-preserving order

| Gate | Concrete evidence to retain | Failure/workaround rule |
| --- | --- | --- |
| Candidate source and configuration | Exact final commit/tree; provider keys present without values; environment revision; matching deployed saved version and terminal receipt. | If versions do not match, stop the acceptance claim and keep v7 labeled as v7. |
| Real consent | Provider, intent, scope observed, redacted result, browser/version, tested deployment; success and cancellation. | If provisioning/brand domain is blocked, leave the unavailable provider inactive and use the existing available login. |
| Recovery and link conflict | Same workspace through linked provider; separate conflicting owner unchanged; fresh verified-email requirement exercised where possible. | Do not merge by email to make a failed recovery appear successful. Use original login and authenticated basic linking. |
| Stale authority | Synthetic paused-I/O/replay fixtures plus actual old-tab account switch. | Keep operations blocked on unverified identity; retain the original local draft for its owner. |
| Disposable deletion | A/B aliases, exports open, A deletion confirmed, old access fails, B retained; no personal workspace touched. | Pending/error is not completion. Preserve records and retry only the disposable target. |
| Browser accessibility | Actual React source/fixture hashes, viewport/font/zoom/mode, keyboard focus observations and targeted before/after evidence. | Fix demonstrated failures; keep unobserved screen-reader/device cases open. |
| Native acceptance | Source/artifact digest, signing/version identity, installed device/OS, scenario results for appearance, accessibility, save/recovery and language. | Do not erase established app data to make installation easy; use an isolated approved acceptance build. |
| Publishing | Current owner acknowledgment, integrated branch heads, final artifact, updated disclosures/assets, store processing/review receipts. | No shared Mac/signing/store action while ownership is unresolved; use the free browser path. |

Each gate should record an observed outcome, including failures and incomplete steps. A useful evidence entry names the exact boundary exercised and the one it did not exercise. This avoids turning a success in a synthetic browser into a provider pass or turning historical native CI into a new physical-device claim.

The companion [owner acceptance procedure](Owner-Acceptance-2026-11-17.md) is executable guidance, not a completed checklist. It preserves the original work budget rather than starting another clock. The root continuation remains responsible for the recovered deadline, remaining time and the final status ledger.

## 10. Inspection provenance and limits

The read-only source checkpoint was captured before the companion privacy correction. These hashes identify inspected inputs; later integrated fixes require a new manifest. Paths are repository-relative.

| Path | SHA-256 at checkpoint |
| --- | --- |
| `hosted/server/oauth.mjs` | `802756741fac5f32a7a0e964e9dea57cffdb4964a6eb87bcc2de2823d9080fd3` |
| `hosted/server/identity.mjs` | `dc7b5843574d64be97829ce05840e515702e13df6f3652aa8d3cd8c058ff702f` |
| `hosted/app/privacy/page.tsx` | `959012196eaef683a6039eb3d77a95ea3962f9e4f4f5d4e1f45fb1e08723a44a` |
| `hosted/app/account/AccountPanel.tsx` | `44b8737b55192940d5814ce0a1950c8356fadb346f9ba98abe897bcd97d6c9fc` |
| `hosted/app/phone/PhoneApp.tsx` | `6c3586b01192e912e1f67d6cd7558aab99061e72b5ede9dddaf87db8fb4672c6` |
| `hosted/app/phone/phone.css` | `d83160c275815d36958c026394907a7cc7f686e3ec8dadd0b715b873ec9a441d` |
| `apple/AhmadCareer/NativeCareerViews.swift` | `c0fe896d8e930c0f3889cdcfee9d501003411d5ee32d1f0a1da120a051f9d1cb` |
| `android/app/src/main/java/com/saleh/careerfinder/CareerTheme.kt` | `9bb54845694a77d533567b1d7fefa5500730ffb41d9a1d002cfc0a4657b145e8` |

This lane performed primary-source research, code review and documentation/JSX static checks. It did not run a native compiler, share a Mac build, submit a provider app, complete a real consent callback, delete a real account, run a physical screen reader, deploy a site or submit an employer application. Separate lanes' exact receipts should be linked by the continuation ledger when they are ready; no new runtime pass is implied by this report's existence.

## 11. Primary sources

Retrieved November 17, 2026. Specifications/policies and informative implementation guidance are labeled. These links are durable references; no secondary commentary is needed for the conclusions above.

- **[S1] Google — OpenID Connect.** Provider protocol documentation: stable subject, ID-token validation and callback behavior. <https://developers.google.com/identity/openid-connect/openid-connect>
- **[S2] Google — Comply with OAuth 2.0 policies.** Production authentication policy guidance and requirements. <https://developers.google.com/identity/verification/authentication-policy-compliance>
- **[S3] Google — Submit for brand verification.** External/published branding conditions and limited exceptions. <https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification>
- **[S4] LinkedIn/Microsoft — Sign In with LinkedIn using OpenID Connect.** Official product/scopes, optional email claims and identity-verification limitation. <https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2>
- **[S5] OpenID Foundation — OpenID Connect Core 1.0.** Normative ID-token/UserInfo and subject-identity rules, especially sections 3.1.3.7, 5.3.2 and 5.7. <https://openid.net/specs/openid-connect-core-1_0.html>
- **[S6] IETF — RFC 9700, Best Current Practice for OAuth 2.0 Security.** OAuth security BCP; transaction, redirect, code-injection and CSRF defenses. <https://www.rfc-editor.org/rfc/rfc9700>
- **[S7] OWASP — Session Management Cheat Sheet.** Security guidance, not a legal certification or protocol conformance badge. <https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html>
- **[S8] W3C — Web Content Accessibility Guidelines 2.2.** Normative success criteria used by this audit. <https://www.w3.org/TR/WCAG22/>
- **[S9] W3C WAI — Understanding Focus Not Obscured (Minimum), 2.4.11.** Informative explanation of the AA criterion and obscuring content. <https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html>
- **[S10] W3C WAI — Understanding Target Size (Minimum), 2.5.8.** Informative measurement/exceptions guidance. <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html>
- **[S11] W3C WAI — Understanding Reflow, 1.4.10.** Informative viewport/zoom interpretation and exceptions. <https://www.w3.org/WAI/WCAG22/Understanding/reflow.html>
- **[S12] Apple — App Review Guidelines.** Store policy, particularly 4.8 and 5.1.1; application depends on the actual submitted flow. <https://developer.apple.com/app-store/review/guidelines/>
- **[S13] Apple — Offering account deletion in your app.** Current guideline reference, including website completion and default-browser sign-in discussion. <https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion>
- **[S14] Apple — Human Interface Guidelines: Accessibility.** Platform design guidance for text, contrast and interaction. <https://developer.apple.com/design/human-interface-guidelines/accessibility>
- **[S15] Apple — Human Interface Guidelines: Dark Mode.** System appearance, adaptive colors and accessibility settings guidance. <https://developer.apple.com/design/human-interface-guidelines/dark-mode>
- **[S16] Android Developers — Make apps more accessible.** Platform guidance for touch targets, descriptions and accessible operation. <https://developer.android.com/guide/topics/ui/accessibility/apps>
- **[S17] Google Play — User Data.** Store policy for privacy, handling/disclosure and deletion. <https://support.google.com/googleplay/android-developer/answer/10144311?hl=en>
- **[S18] Google Play — Understanding app account deletion requirements.** Policy implementation guidance, including browser account creation and outside-app web resources. <https://support.google.com/googleplay/android-developer/answer/13327111?hl=en>

- **[S19] Google — Verify the Google ID token on your server.** Provider-specific distinction between Google-authoritative email and third-party mailbox ownership. <https://developers.google.com/identity/gsi/web/guides/verify-google-id-token>

[S1]: https://developers.google.com/identity/openid-connect/openid-connect
[S2]: https://developers.google.com/identity/verification/authentication-policy-compliance
[S3]: https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification
[S4]: https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
[S5]: https://openid.net/specs/openid-connect-core-1_0.html
[S6]: https://www.rfc-editor.org/rfc/rfc9700
[S7]: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
[S8]: https://www.w3.org/TR/WCAG22/
[S9]: https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
[S10]: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
[S11]: https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
[S12]: https://developer.apple.com/app-store/review/guidelines/
[S13]: https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion
[S14]: https://developer.apple.com/design/human-interface-guidelines/accessibility
[S15]: https://developer.apple.com/design/human-interface-guidelines/dark-mode
[S16]: https://developer.android.com/guide/topics/ui/accessibility/apps
[S17]: https://support.google.com/googleplay/android-developer/answer/10144311?hl=en
[S18]: https://support.google.com/googleplay/android-developer/answer/13327111?hl=en
[S19]: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
