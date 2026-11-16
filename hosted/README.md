# Career Finder phone service

Career Finder for phones: a browser app at `/phone`, public employer-board discovery, private account recovery, native iPhone/Android connection, durable application receipts, and a bounded submission worker. The root URL opens the same phone interface.

Service origin: `https://career-finder-service.jazzy-drake-8323.chatgpt.site`

This is a development preview. No employer integration is enabled by default. Synthetic test receipts never establish that a real employer received an application.

## Architecture

- A Cloudflare Worker serves the connection, account, help and privacy pages and the application API.
- Public discovery uses separate GET-only routes and a shared, bounded D1 cache. It does not read account identity, phone credentials, profiles or CVs.
- D1 stores private workspaces, phone sessions, immutable reviews, submission state and evidence. PDF bytes are kept in private R2, outside D1's row-size limit.
- ChatGPT Sites supplies authenticated, site-specific user identity to browser account routes. The public website does not make account records public.
- Browser writes require the exact service Origin and JSON. Native routes require a random bearer token obtained by redeeming a short-lived, one-use pairing code. Only token and pairing-code hashes are stored.
- The phone browser interface uses platform identity and the dedicated `/api/phone/*` routes. It never creates or stores a native bearer token. Local drafts and self-reported application records use a separate encrypted IndexedDB vault.
- The app's existing Node/SQLite companion service is a separate implementation. Native clients retain GET-only polling with that service unless the exact `dispatchContinuation: "client"` capability is advertised.

The production entrypoint is `worker/index.ts`. It imports the production handler directly; request inputs and environment variables cannot select a synthetic adapter. The test harness injects its synthetic HTTP dependency into a separate handler instance.

## Phone browser app

Open `/phone` in a phone browser. Its four sections are **Search**, **Saved**, **Apply**, and **Profile**. Discovery, a local shortlist, a profile draft and private application notes work without signing in. A home-screen manifest provides ordinary installation where the browser offers it; it does not imply App Store or Google Play distribution. There is no service worker caching private pages. An internet connection is needed to open the app and confirm a signed-in identity.

Saved jobs can have a stage, an applied date, a follow-up date and a private note. Removing a bookmark preserves its application record. Closing a record retains its applied mark; clearing that mark requires a separate confirmation. A mark that could affect an active approved application cannot change until that plan is stopped. The exact reviewed job identity is checked again before preparing, approving or continuing submission.

**Save on this phone** and **Save profile online** are separate actions. An unfinished form can be kept locally; selecting a PDF does not upload it. Online saves use optimistic profile revisions and offer a comparison when another phone has changed the profile. Profile and record forms retain unfinished edits across ordinary tab changes and account rechecks. Closing an unfinished record or new-job form requires an explicit discard choice.

The encrypted vault uses AES-GCM, a fresh non-exportable key and IV for every saved snapshot, and authenticated exact guest/account/workspace metadata. The key is kept in the same browser, so this protects the saved format rather than a compromised website or unlocked browser. Atomic compare-and-set writes reject competing tabs; unknown versions, corruption and storage errors preserve the earlier row. Reset leaves a content-free revision marker so an older tab cannot restore deleted data. Guest data and older workspace drafts are never adopted into a different account automatically. Earlier drafts for the same account can be exported deliberately.

The vault holds at most 200 bookmarks, 500 private records, a bounded 200-result search snapshot and one PDF up to 5 MiB. Search results retain their original check times and restore without a new request or a reusable pagination cursor. Browser-data deletion can remove local information permanently. Readable backup exports include personal information and, when present, PDF bytes; encrypted recovery exports may still need the key in the original browser.

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

Version 0.4 adds `/api/discovery/sources` and `/api/discovery/search`. The starter catalog contains seven public employer boards across technology, logistics, music, clinical research, education, mental health and autonomous transport. A person can choose up to four boards per search or supply a supported Greenhouse or Lever board URL. Search is available without signing in. It has no country or profession whitelist, but it covers only the selected boards and the current interface is English.

The service fetches only the providers' fixed public API hosts. It filters the returned title, employer, available summary, location text and explicit remote-work metadata locally. It does not infer work eligibility or forward a person's keywords and location filter to employers. Search terms are not retained in the workspace or public board cache; ordinary platform request logs may include URL fields. See [the exact native API contract](server/discovery-contract.json).

Each board is capped at 500 validated jobs and 512 KiB of normalized cache data. Pages contain at most 50 results. A shared ten-minute cache and durable request/fetch budgets limit upstream traffic. Earlier results may remain visible for at most 24 hours after a refresh failure, with their original check time and stale state. Deleted boards clear cached vacancies. Partial coverage, unavailable sources, invalid filters, cooldowns and changed page snapshots remain distinguishable from a successful empty search.

Discovery never approves or sends an application. Saving a discovered job uses the existing opportunity flow; verified submission still requires the separately authorized employer integration described below.

## Connect and recover

1. Open `/connect` and continue to the secure ChatGPT sign-in screen. Choose **Continue with Google** there to use Google, or use the same method as your existing account. The hosted preview uses ChatGPT identity; it is not an independent Career Finder Google OAuth client.
2. Generate a connection code. This explicitly creates or reuses a workspace.
3. Enter the service address and code in the phone app. Codes expire after five minutes and can be redeemed once.
4. Review the phone draft before saving it. Connecting does not automatically upload an existing draft.

Phone sessions expire after 30 days. `/account` lists active sessions, revokes a lost phone, exports account records, downloads retained CV files, recovers interrupted uploads and deletes the cloud workspace. Account GET is read-only and does not create a workspace.

Browser actions are bound to the account the person reviewed. Pairing requires `expectedAccountId`; deletion, session revocation and upload recovery require `expectedWorkspaceId`. Export and PDF links include exactly one `expectedWorkspaceId` query parameter. A stale or missing target returns `409 account_changed` or `409 workspace_changed` before modifying business records or reading a private PDF. The browser clears stale confirmation intent and asks the person to reload. Disconnecting a phone has its own confirmation step.

Pairing returns `serverTime` and `expiresAt`. The browser derives a conservative lifetime from their difference, subtracts the elapsed request time and counts down with a monotonic clock. A wrong device date cannot extend the displayed lifetime, and redemption still checks the authoritative server expiry.

Automatic submission requires the email address supplied by the signed-in account. This is an account association, not verification of legal identity, qualifications or the contents of a CV.

Account GET reports `confirmedEmail` and `emailUpdateRequired` when the platform email has changed since the last explicit pairing. It does not silently alter a profile, approval or revision. Creating a fresh connection code updates the confirmed address and advances the workspace revision; the phone must then review and correct its application profile before submission.

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
node --experimental-strip-types tests/browser-api.mjs
npm run build
```

`tests/hosted-applications.mjs` executes the production handler using actual Miniflare D1 and R2 bindings and a synthetic employer dependency. Its dated results and source hashes are in `tests/hosted-verification.json`. Tests cover real 5 MiB storage, concurrent pairing and saves, duplicate and approval gates, transport uncertainty, provider-result persistence failure, quota races, upload recovery and deletion fencing.

`tests/hosted-discovery.mjs` exercises the actual D1 cache, concurrent leases, bounded source fetches, durable quotas, normalization, privacy boundaries and pagination, including the bundled workerd entrypoint. Its observed results are in `tests/hosted-discovery-verification.json`. `tests/discovery-public-sources.json` separately records bounded public GET observations of the catalog; these checks never POST an employer application. The browser transport suite checks timeout, cancellation, malformed responses and mutation confirmation without silently replaying a failed write.

These checks are distinct from production HTTPS, platform-authentication and native UI acceptance. Production observations belong in the repository's release review, with their source commit and date.

`tests/hosted-phone.mjs` checks the browser workspace boundary through the actual Worker, with isolated identity and synthetic employer requests. `tests/phone-model.mjs`, `tests/phone-api.mjs` and `tests/phone-dispatch.mjs` check canonical job identity, exact review fields, bounded payloads, transport failures and approved continuation. `tests/phone-vault.mjs` uses actual WebCrypto and structured-cloned keys with an injected atomic storage port; it is not evidence of a browser's IndexedDB behavior. Real browser storage and phone interaction remain separate acceptance checks.

### Security dependency pins

The 0.6 candidate updates React, React DOM and `react-server-dom-webpack` together to **19.2.9**, and `@vitejs/plugin-rsc` to **0.5.39**, whose bundled RSC package is **19.3.1**. Updating only the top-level React dependency would leave the old plugin's bundled **19.2.6** copy unchanged. These pins address the October advisories [React GHSA-xqc2-xf4c-x3h3](https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3) and [Vite plugin GHSA-59pf-q495-3c99](https://github.com/vitejs/vite-plugin-react/security/advisories/GHSA-59pf-q495-3c99). Next and its ESLint configuration are pinned to **16.4.6**. The application imports patched **Zod 4.6.7**; compatible overrides pin `source-map-js` to **1.2.2**, `baseline-browser-mapping` to **2.11.0** and `fast-uri` to **3.1.9** after the production audit identified additional affected packages. The application runs on Vinext; the presence of Next in the dependency graph alone does not establish exposure to every Next-specific path. Exact installation, build, audit and deployment evidence belongs in the release review; these pins are not a claim that all future vulnerabilities are absent.

The schema lives in `db/schema.ts`. Use `npm run db:generate` for schema changes. Keep the generated migration history under `drizzle/` immutable after publication. The Sites package includes these migrations and the `.openai/hosting.json` bindings for `DB` and `BUCKET`.

## Deployment

The hosting manifest selects the dedicated phone-service Site. Preserve its project ID, keep native origins synchronized, and deploy the exact pushed source and built artifact through Sites. This project is separate from the pre-existing AhmadCareer website.

No custom domain purchase, separate paid cloud account or employer integration is required to publish the connection service through the available hosting. Hosting availability and service quotas remain subject to the existing provider account and plan. Keep secrets in the service environment; never ship a Sites owner-bypass token to a phone app.

Public support is available through `https://github.com/swonyu/ahmad-career/issues`. Remove private information before reporting a problem. Store signing, physical-device acceptance and app-store review remain separate release steps.

## LinkedIn profile links

The phone apps can save an optional personal LinkedIn profile URL, open that profile, and hand a job search to LinkedIn. This is a saved link and external navigation, not an OAuth connection, verified account, profile import, or LinkedIn application integration. No LinkedIn password or access token is collected. Search sends only the explicitly entered public keyword/location query to LinkedIn.

The profile API accepts optional `linkedin` independently of `website`. Only canonical personal `/in/` links on LinkedIn HTTPS hosts are accepted; tracking query/fragment components are removed and ambiguous paths, credentials, custom ports, malformed UTF-8, controls and Unicode format characters are refused. Omitting the field preserves a previous value for older clients; an explicit empty string clears it. `capabilities.linkedinProfile: true` advertises support. New clients with a nonblank link require that capability before syncing.

A profile containing a LinkedIn URL requires `reviewSchema: 3` to prepare an eligible review. Approving or reapproving any review containing a LinkedIn URL also requires `reviewSchema: 3`, so an older phone cannot approve an undisplayed field in a recovered plan. The exact URL appears in `payloadSummary.linkedin`, the immutable snapshot and the authorized provider’s `urls[LinkedIn]` field. Portfolio links continue to use `urls[Portfolio]`. Profile edits invalidate earlier reviews. LinkedIn job URLs remain manual links.
