# Career Finder phone service

Career Finder for phones: a browser app at `/phone`, public employer-board discovery, private account recovery, native iPhone/Android connection, durable application receipts, and a bounded submission worker. The root URL opens the same phone interface.

Service origin: `https://career-finder-service.jazzy-drake-8323.chatgpt.site`

This is a development preview. No employer integration is enabled by default. Synthetic test receipts never establish that a real employer received an application.

**Historical live baseline — 17 November 2026:** public hosted **version 7** was deployed from `1135a3270435d3719c6f62f1a2e3a53e2c040146`; its receipt is in the [publishing handoff](../docs/Publishing-Handoff-2026-11-17.md). That source provides direct Google OAuth code and basic LinkedIn OIDC linking. Its recorded deployment used empty provider configuration revision 0. Do not infer that later candidate source or saved configuration is live.

**Current continuation candidate:** five browser sections including Settings, System/Light/Dark appearance, English/Arabic display controls, direct LinkedIn login, provider connection-generation guards and bounded browser PDF validation are implemented in the isolated source. An authorized Google client and branding were saved, and its credentials are privately stored in **configuration revision 1**. The [latest redacted receipt](../docs/strict-review-evidence/continuation-2026-11-17-cloud/google-provider-configuration.json) explicitly records that revision 1 has **not been deployed** and a real callback is **not verified**. LinkedIn registration/product activation remains incomplete. See [the current implementation handoff](../docs/Continuation-Implementation-2026-11-17.md) for scoped test evidence and rollout gates.

**Free-only requirement:** retain the available free infrastructure and free supported interfaces. Do not add paid APIs, subscriptions, upgrades, domain purchases or automatic paid overages. Preserve data and report a limit when free capacity is exhausted. The quotas below are real bounded capacity, not unlimited worldwide hosting. Store developer fees and approvals remain separate publishing-owner gates; no spending or paid enrollment is authorized here.

## Architecture

- A Cloudflare Worker serves the connection, account, help and privacy pages and the application API.
- Public discovery uses separate GET-only routes and a shared, bounded D1 cache. It does not read account identity, phone credentials, profiles or CVs.
- D1 stores private workspaces, phone sessions, immutable reviews, submission state and evidence. PDF bytes are kept in private R2, outside D1's row-size limit.
- ChatGPT Sites supplies authenticated, site-specific identity. The candidate also accepts configured direct Google or LinkedIn OIDC sessions. Stable provider subjects identify owners; email never merges accounts. Saved credentials, source implementation, deployment and real provider consent are separate states. Private account data remains protected even though the website is public.
- Browser writes require the exact service Origin and JSON. Native routes require a random bearer token obtained by redeeming a short-lived, one-use pairing code. Only token and pairing-code hashes are stored.
- The phone browser interface uses the verified browser identity and dedicated `/api/phone/*` routes. It never creates or stores a native bearer token. Local drafts and self-reported application records use a separate encrypted IndexedDB vault.
- The app's existing Node/SQLite companion service is a separate implementation. Native clients retain GET-only polling with that service unless the exact `dispatchContinuation: "client"` capability is advertised.

The production entrypoint is `worker/index.ts`. It imports the production handler directly; request inputs and environment variables cannot select a synthetic adapter. The test harness injects its synthetic HTTP dependency into a separate handler instance.

## Phone browser app

Open `/phone` in a phone browser. The candidate has five sections: **Search**, **Saved**, **Apply**, **Profile**, and **Settings**. Settings holds appearance, language, provider links and saved-data controls. Discovery, a local shortlist, a profile draft and private application notes work without signing in. A home-screen manifest provides ordinary installation where the browser offers it; it does not imply App Store or Google Play distribution. There is no service worker caching private pages. An internet connection is needed to open the app and confirm a signed-in identity. The live v7 receipt predates this five-section candidate.

Saved jobs can have a stage, an applied date, a follow-up date and a private note. Removing a bookmark preserves its application record. Closing a record retains its applied mark; clearing that mark requires a separate confirmation. A mark that could affect an active approved application cannot change until that plan is stopped. The exact reviewed job identity is checked again before preparing, approving or continuing submission.

The current follow-up searches active saved notes through the existing Saved search field. Comparison-only normalization handles Arabic vowel marks/tatweel and stable Unicode case; stored text, hamza/letter distinctions, URLs and identifiers are not rewritten. A secondary **Spreadsheet export** disclosure in Settings downloads the current scope's existing application records, including retained unbookmarked records. It excludes profile/CV/session credentials. Formula-like cells receive a visible `Text: ` prefix in this viewing format; readable JSON retains original stored text. CSV includes private notes, so it remains a user-controlled local download.

A job with a valid saved follow-up date offers a calendar-file download from its details. The all-day event contains the role, employer, canonical public job URL and day, with a stable public URL/date-derived UID. It excludes private notes, profile data, attendees and alarms. It does not connect a calendar or guarantee a notification; importing a changed date does not remove a previously imported event. Export handlers reject stale identity, scope, snapshot and record authority. Source-format and handler regressions pass; actual calendar/spreadsheet import acceptance is still separate.

**Save on this phone** and **Save profile online** are separate actions. An unfinished form can be kept locally; selecting a PDF does not upload it. Online saves use optimistic profile revisions and offer a comparison when another phone has changed the profile. Profile and record forms retain unfinished edits across ordinary tab changes and account rechecks. Closing an unfinished record or new-job form requires an explicit discard choice.

The encrypted vault uses AES-GCM, a fresh non-exportable key and IV for every saved snapshot, and authenticated exact guest/account/workspace metadata. The key is kept in the same browser, so this protects the saved format rather than a compromised website or unlocked browser. Atomic compare-and-set writes reject competing tabs; unknown versions, corruption and storage errors preserve the earlier row. Reset leaves a content-free revision marker so an older tab cannot restore deleted data. Guest data and older workspace drafts are never adopted into a different account automatically. Earlier drafts for the same account can be exported deliberately.

The vault holds at most 200 bookmarks, 500 private records, a bounded 200-result search snapshot and one PDF up to 5 MiB. Search results retain their original check times and restore without a new request or a reusable pagination cursor. Browser-data deletion can remove local information permanently. Readable JSON exports include personal information and, when present, PDF bytes. They are copies for the user’s records; this browser client does not currently import them. Encrypted recovery exports may still need the key in the original browser.

## Browser workspace API

| Route | Method and intent |
| --- | --- |
| `/api/phone/workspace` | `GET` reads the existing account workspace without creating it. `POST` explicitly creates/reopens it or confirms an account-email change and requires `expectedAccountId`. |
| `/api/phone/profile` | `PUT` saves an explicitly reviewed profile and optional PDF using `expectedWorkspaceId` and `expectedRevision`. |
| `/api/phone/jobs` | `POST` adds a selected job to the connected workspace. A browser-only bookmark is not automatically uploaded. |
| `/api/phone/prepare` | `POST` freezes an exact review; no provider submission occurs. |
| `/api/phone/submit` | `POST` records approval of the exact digest and review schema. |
| `/api/phone/advance` | `POST` attempts at most one already-approved, eligible application. |
| `/api/phone/stop` | `POST` stops an exact plan, with an optional unapproved-only guard. It can reconcile expired dispatch claims for that stopped plan as uncertain. |
| `/api/phone/receipts` | `GET` exports receipts for exactly one `expectedWorkspaceId` query value. |

Every workspace mutation after creation includes `expectedWorkspaceId`. The server requires trusted platform identity, exact Origin and JSON for browser writes, and validates the same native application contract. A native bearer token cannot authenticate these browser routes. The client bounds response size to 12 MiB and request duration to 30 seconds, rejects redirects and malformed JSON, omits credentials on public discovery, and never automatically retries a failed write. Application-review bodies are bounded by their actual UTF-8 size before HTTP.

An account or workspace change locks the old page. Returning to the foreground hides private content while identity is rechecked; unfinished forms remain mounted. A delayed startup response cannot reopen an older workspace after a later identity check. Export and UI updates also recheck the captured page generation before revealing private information.

## Public job discovery

Version 0.4 adds `/api/discovery/sources` and `/api/discovery/search`. The starter catalog contains seven public employer boards across technology, logistics, music, clinical research, education, mental health and autonomous transport. A person can choose up to four boards per search or supply a supported Greenhouse or Lever board URL. Search is available without signing in. It has no country or profession whitelist, but it covers only the selected boards. The candidate interface offers English and Arabic; original employer content and user-entered search words are not translated.

The service fetches only the providers' fixed public API hosts. It filters the returned title, employer, available summary, location text and explicit remote-work metadata locally. It does not infer work eligibility or forward a person's keywords and location filter to employers. Search terms are not retained in the workspace or public board cache; ordinary platform request logs may include URL fields. See [the exact native API contract](server/discovery-contract.json).

Each board is capped at 500 validated jobs and 512 KiB of normalized cache data. Pages contain at most 50 results. A shared ten-minute cache and durable request/fetch budgets limit upstream traffic. Earlier results may remain visible for at most 24 hours after a refresh failure, with their original check time and stale state. Deleted boards clear cached vacancies. Partial coverage, unavailable sources, invalid filters, cooldowns and changed page snapshots remain distinguishable from a successful empty search.

Discovery never approves or sends an application. Saving a discovered job uses the existing opportunity flow; verified submission still requires the separately authorized employer integration described below.

## Connect and recover

1. Open `/connect` or the candidate Settings screen and use a sign-in method actually shown as available. The last verified v7 baseline offers ChatGPT sign-in, including its Google option. The candidate supports direct Google and LinkedIn only when status reports `configured` and `signInSupported`; these fields do not prove real consent. Google configuration revision 1 is saved but not yet deployed or callback-verified. To reuse an existing workspace with another method, sign in to that workspace first and connect the provider from Account or Settings. Matching email addresses never merge accounts.
2. Generate a connection code. This explicitly creates or reuses a workspace.
3. Enter the service address and code in the phone app. Codes expire after five minutes and can be redeemed once.
4. Review the phone draft before saving it. Connecting does not automatically upload an existing draft.

Phone sessions expire after 30 days. `/account` lists active sessions, revokes a lost phone, exports account records, downloads retained CV files, removes unused retained CVs, recovers interrupted uploads and deletes cloud account data. Provider identity export/deletion also works before an application workspace exists. Account GET is read-only and does not create a workspace.

Browser actions are bound to the account the person reviewed. Pairing and provider changes require `expectedAccountId`; workspace deletion, session revocation, résumé removal and upload recovery require the reviewed `expectedWorkspaceId`. Workspace export and PDF links include exactly one `expectedWorkspaceId` query parameter. An account without a workspace uses `expectedAccountId` for export and sends that ID with `expectedWorkspaceId:null` for deletion. A stale or missing target returns `409 account_changed` or `409 workspace_changed` before modifying business records or reading a private PDF. The browser hides private content while identity is rechecked and clears stale confirmation intent. Disconnecting a phone has its own confirmation step.

Pairing returns `serverTime` and `expiresAt`. The browser derives a conservative lifetime from their difference, subtracts the elapsed request time and counts down with a monotonic clock. A wrong device date cannot extend the displayed lifetime, and redemption still checks the authoritative server expiry.

Automatic submission requires the email address supplied by the signed-in account. This is an account association, not verification of legal identity, qualifications or the contents of a CV.

Account GET reports `confirmedEmail` and `emailUpdateRequired` when the platform email has changed since the last explicit pairing. It does not silently alter a profile, approval or revision. Creating a fresh connection code updates the confirmed address and advances the workspace revision; the phone must then review and correct its application profile before submission.

### Supported provider connection contract

Google uses `CAREER_GOOGLE_CLIENT_ID` and `CAREER_GOOGLE_CLIENT_SECRET`, scopes `openid email profile`, and callback `https://career-finder-service.jazzy-drake-8323.chatgpt.site/auth/google/callback`. LinkedIn uses `CAREER_LINKEDIN_CLIENT_ID` and `CAREER_LINKEDIN_CLIENT_SECRET`, with the corresponding `/auth/linkedin/callback`. Candidate direct LinkedIn login requests `openid profile email`; explicit basic linking requests only `openid profile`. Store credentials only in the managed server environment. The owner must complete the intended provider applications, actual audience/domain/product requirements and real consent/cancellation/isolation checks. No approval date is guaranteed and no paid prerequisite may be enabled.

`GET /api/auth/status` reports actual account/connection state, provider configuration, `signInSupported` and a non-secret 64-hex `connectionId` for each connected provider. Anonymous direct sign-in uses top-level `/auth/google/start` or `/auth/linkedin/start`. Linking an existing account uses `POST /api/auth/connect` with `{provider,expectedAccountId}`. Disconnect requires `{provider,expectedAccountId,expectedConnectionId}` and refuses an original/current login method. A stale client must refresh before confirming the displayed connection; it cannot remove a replacement link with the same provider name. LinkedIn direct login requires a fresh verified-email claim, using at most one bounded, exact-subject UserInfo fallback. Missing verified email returns `email_required` without a new account or session. Basic linking requests no new email; an existing email for that same identity can remain. Neither provider verifies legal identity or grants employer-application permission. See the [LinkedIn implementation](../docs/LinkedIn-Sign-In-2026-11-17.md), [independent auth review](../docs/Auth-Deep-Review-2026-11-17.md), and [primary-source research](../docs/Research-Audit-2026-11-17.md).

The server validates signed ID tokens and stable provider subjects; it does not merge accounts by email or retain provider access/refresh tokens. Expired/invalid Career Finder cookies block fallback to a different background Sites identity. Explicit recovery or normal sign-out clears both browser sign-in layers before returning through `/signout-with-chatgpt?return_to=%2Fconnect`. Account deletion also removes provider links, browser sessions and pending owner-bound OAuth requests, including for an account with no workspace. Export contains connection/session metadata but never session credentials or provider tokens. Provider-level permission grants can be removed separately in Google or LinkedIn settings.

### Migration and browser PDF validation

Migration `drizzle/0004_provider_connection_generation.sql` is schema-only: a constant-default connection column plus an AFTER INSERT trigger. Historical rows initialize lazily, at most two supported-provider links for the current owner, through status's atomic account/lifecycle/session guards. Existing IDs remain stable; deleted/recreated links receive new IDs. The corrected migration was applied only to the separate fresh owner-private acceptance Site and is now immutable. Public v7 has not received this migration. See the [upgrade proof](../docs/Provider-Generation-Upgrade-2026-11-17.md) and [rollout sequence](../docs/Continuation-Implementation-2026-11-17.md#10-rollout-sequence).

The browser and server share `shared/pdf-readability.mjs`. The browser runs it in a same-origin module worker with bounded streaming decompression; the server uses a capped zlib adapter. Limits are 5 MiB input, 20,000 objects, 16 MiB expanded streams, 500 pages, depth 64 and a three-second parser deadline. The browser has a six-second overall worker timer and terminates on success, error, cancellation or timeout. Unsupported browser features produce an actionable failure without an unbounded fallback. A malformed, encrypted, cyclic, truncated or stale-account result keeps the previous CV. Browser checks do not replace server validation or guarantee the visual content of every PDF.

### Appearance and language

Settings offers System/Light/Dark and System/English/Arabic. Theme and language preferences use separate display-only storage. Language changes set page `lang`/`dir` and update display copy without changing account identity, workspace scope, wire enums, profile text, PDF bytes or application approval. The server and browser negotiate the same supported language; unknown status text falls back safely. Arabic uses directional isolation for inserted values, localized counts and Gregorian display dates. Saved job content, names, URLs, emails and personal writing remain original. The translated catalog and focused tests are candidate evidence; complete browser/native RTL and physical-device acceptance remain separate.

## Submission guarantees and limits

Preparing a review freezes the chosen profile revision, exact PDF fingerprint, employer answers and reviewed posting requirements. `/submit` records explicit approval of its digest. `/advance` can process only work already authorized by the persisted server state; it cannot approve a review.

Each continuation request attempts at most one provider submission. It checks the current posting and exact saved PDF, acquires a durable D1 claim before the POST, and records the provider outcome with that claim. Phone apps continue sequentially while active and refresh authoritative workspace state after the request. The browser performs at most 20 continuation requests in one explicitly started pass, with one-second pacing after successful progress. It stops on an unchanged response, an in-flight claim, lost approval, hidden page or error. It does not infer new approval from an elapsed provider cooldown. Closing the app may leave unsent approved work pending. A dispatched request may finish after the phone closes or disconnects.

The browser's Stop action targets the captured account workspace and plan. It can be requested while the current request completes; it never recalls an already-sent provider request. An expired dispatch claim on a successfully stopped exact plan becomes **uncertain**, not ready to resend. Recent in-flight claims are preserved so their original provider result can still be recorded. The unapproved-only Stop guard and these state changes share one database transaction; a refused guard changes nothing, including on an already-stopped plan.

Confirmed means the supported provider returned its documented acceptance response and an application ID. It does not mean a recruiter reviewed, selected or hired the applicant. Network interruption, an undocumented response, expired dispatch lease or failure to persist the result remains uncertain and is blocked from automatic resend. A rate-limited attempt requires explicit approval after its cooldown. Stop prevents work that has not passed its durable dispatch claim; it cannot recall a request already sent.

Per-posting duplicate checks always use workspace identity, including after profile-email changes. A keyed email fingerprint can be checked across workspaces only when the applicant email matches the confirmed account email. An unverified editable email never reveals another person's application status. The operator-managed companion has no verified-email ownership and therefore confines duplicate protection and cooldowns to one workspace. Account erasure removes its application records, so users must retain their export and reconcile prior employer submissions before starting over.

## Employer configuration

The adapter supports the official Lever Postings API for global and EU regions. Live operation requires an employer-authorized API key and current requirements reviewed for each exact posting. A public posting URL alone does not authorize API submission.

Store keys only as service secrets. Set `CAREER_CONNECTORS_JSON` to a version-1 object containing a `connectors` array. Each connector has `provider: "lever"`, `region: "global"` or `"eu"`, an employer `site`, an `apiKeyEnv` referencing a `CAREER_*` secret, and `postings` keyed by the exact posting UUID. Each posting requires:

- `revision`, `reviewedAt` and `expiresAt`, with a lifetime of at most seven days;
- `hasCustomQuestions: false` and an explicit `requiredFields` list;
- a public HTTPS `privacyPolicyUrl` when storing applicant data requires consent.

Supported fields are `name`, `email`, `resume`, `phone`, `urls`, `comments`, `consentStore` and `consentMarketing`. Unknown or custom required questions block automatic submission. An explicit No to future contact is a valid marketing answer. Data-processing consent must be separately provided when required. Expired or absent requirements disable the posting automatically.

Never put employer keys, phone tokens, pairing codes, real CVs or personal exports in source, logs, public issues or screenshots. No actual employer POST is needed to run the tests.

## Storage and erasure

| Resource | Preview limit |
| --- | --- |
| One PDF | 5 MiB |
| Retained PDF versions per account | 5 within 25 MiB |
| Saved opportunities | 200 per account |
| Application reviews | 100 per account |
| Application records | 500 per account |
| Active phone connections | 10 per account |
| Selected opportunities in one review | 20 |
| Service accounts | 250 |
| Shared reserved PDF storage | 4 GiB |
| Shared application records | 10,000 |

Quotas are enforced in conditional D1 writes, including concurrent requests. Capacity errors preserve existing records. These application caps do not guarantee unlimited provider resources or perpetual free hosting, and do not authorize paid upgrades.

Account documents include `removable` and, when applicable, `retentionReason`. `POST /api/account/resumes/remove` takes `{expectedWorkspaceId,sha256}` and removes only an unused owned document. Current profile, active-review and in-flight application references protect the PDF. Temporary `deleting` state remains visible and is excluded from interrupted-upload recovery; failed removal can be retried after rechecking status.

PDF uploads reserve a durable claim before storage. If a Worker stops before acknowledging a completed write, `/api/account/uploads/recover` can recover the exact file after its one-minute lease expires. Recovery never silently attaches a CV to a profile. The phone must save explicitly.

Deletion locks the workspace, fences all retained upload keys, erases PDF contents and metadata, and deletes its active database records and phone sessions. A provider request already in progress must finish or become durably uncertain first. Failed erasure remains pending and can be retried; success is reported only after confirmation. Empty objects at opaque random retired-upload keys remain to prevent late conditional writes from resurrecting erased content. They contain no account identifier, filename, CV bytes or document fingerprint.

Deleting cloud data does not delete local phone files, recall employer-held applications, or promise immediate erasure of infrastructure recovery copies. See the published `/privacy` notice.

## Build and test

Use Node 24.22 or a compatible Node version meeting `package.json`'s engine requirement:

```sh
npm ci
npm run typecheck
npm test
node tests/hosted-worker.mjs
node --test tests/browser-api.mjs tests/browser-pairing.mjs
npm run build
```

`tests/hosted-applications.mjs` executes the production handler using actual Miniflare D1 and R2 bindings and a synthetic employer dependency. Its dated results and source hashes are in `tests/hosted-verification.json`. Tests cover real 5 MiB storage, concurrent pairing and saves, duplicate and approval gates, transport uncertainty, provider-result persistence failure, quota races, upload recovery and deletion fencing.

`tests/hosted-discovery.mjs` exercises the actual D1 cache, concurrent leases, bounded source fetches, durable quotas, normalization, privacy boundaries and pagination, including the bundled workerd entrypoint. Its observed results are in `tests/hosted-discovery-verification.json`. `tests/discovery-public-sources.json` separately records bounded public GET observations of the catalog; these checks never POST an employer application. The browser transport suite checks timeout, cancellation, malformed responses and mutation confirmation without silently replaying a failed write.

These checks are distinct from production HTTPS, platform-authentication and native UI acceptance. Production observations belong in the repository's release review, with their source commit and date.

`tests/hosted-phone.mjs` checks the browser workspace boundary through the actual Worker, with isolated identity and synthetic employer requests. `tests/phone-model.mjs`, `tests/phone-api.mjs` and `tests/phone-dispatch.mjs` check canonical job identity, exact review fields, bounded payloads, transport failures and approved continuation. `tests/phone-vault.mjs` uses actual WebCrypto and structured-cloned keys with an injected atomic storage port; it is not evidence of a browser's IndexedDB behavior. Real browser storage and phone interaction remain separate acceptance checks.

### Security dependency pins

The 0.6 candidate updates React, React DOM and `react-server-dom-webpack` together to **19.3.1**, and `@vitejs/plugin-rsc` to **0.5.39**, whose bundled RSC package is **19.3.1**. Updating only the top-level React dependency would leave the old plugin's bundled **19.2.6** copy unchanged. These pins address the October advisories [React GHSA-xqc2-xf4c-x3h3](https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3) and [Vite plugin GHSA-59pf-q495-3c99](https://github.com/vitejs/vite-plugin-react/security/advisories/GHSA-59pf-q495-3c99). Next and its ESLint configuration are pinned to **16.4.6**. The application imports patched **Zod 4.6.7**; compatible overrides pin `source-map-js` to **1.2.2**, `baseline-browser-mapping` to **2.11.0** and `fast-uri` to **3.1.9** after the production audit identified additional affected packages. The application runs on Vinext; the presence of Next in the dependency graph alone does not establish exposure to every Next-specific path. The subsequent full audit also required Vinext **1.4.6**, Vite **8.3.8**, Cloudflare’s Vite plugin **1.69.1**, Wrangler **4.160.0**, and compatible transitive patches captured in the lockfile. The complete dependency audit then passed with zero reported findings at every severity. Package-manager development classifications are not treated as proof that framework code is absent from the runtime bundle. The Miniflare 5 test fixtures use its supported v4 option adapter and an explicit deterministic fixture clock; the production handlers and test assertions are unchanged. Exact installation, build, audit and deployment evidence belongs in the release review; these pins are not a claim that all future vulnerabilities are absent.

The schema lives in `db/schema.ts`. Use `npm run db:generate` for schema changes. Keep the generated migration history under `drizzle/` immutable after publication. The Sites package includes these migrations and the `.openai/hosting.json` bindings for `DB` and `BUCKET`.

## Deployment

The hosting manifest selects the dedicated phone-service Site. Preserve its project ID, keep native origins synchronized, and deploy the exact pushed source and built artifact through Sites. This project is separate from the pre-existing AhmadCareer website.

No custom domain purchase, separate paid cloud account or employer integration is required to publish the connection service through the available hosting. Hosting availability and service quotas remain subject to the existing provider account and plan. Keep secrets in the service environment; never ship a Sites owner-bypass token to a phone app.

Public support is available through `https://github.com/swonyu/ahmad-career/issues`. Remove private information before reporting a problem. Store signing, physical-device acceptance and app-store review remain separate release steps.

## LinkedIn profile links

The phone apps can save an optional personal LinkedIn profile URL, open that profile, and hand a job search to LinkedIn. These saved-link and external-navigation features remain separate from the supported OIDC connection implemented above. A saved URL does not establish a connected or verified account. No LinkedIn password is collected and no provider access/refresh token is retained. Search sends only the explicitly entered public keyword/location query to LinkedIn. LinkedIn provider activation remains unverified until authorized setup, matching deployment and real acceptance are complete. Neither candidate direct sign-in nor basic linking grants LinkedIn application submission rights.

The profile API accepts optional `linkedin` independently of `website`. Only canonical personal `/in/` links on LinkedIn HTTPS hosts are accepted; tracking query/fragment components are removed and ambiguous paths, credentials, custom ports, malformed UTF-8, controls and Unicode format characters are refused. Omitting the field preserves a previous value for older clients; an explicit empty string clears it. `capabilities.linkedinProfile: true` advertises support. New clients with a nonblank link require that capability before syncing.

A profile containing a LinkedIn URL requires `reviewSchema: 3` to prepare an eligible review. Approving or reapproving any review containing a LinkedIn URL also requires `reviewSchema: 3`, so an older phone cannot approve an undisplayed field in a recovered plan. The exact URL appears in `payloadSummary.linkedin`, the immutable snapshot and the authorized provider’s `urls[LinkedIn]` field. Portfolio links continue to use `urls[Portfolio]`. Profile edits invalidate earlier reviews. LinkedIn job URLs remain manual links.
