# Career Finder phone service

Public employer-board discovery, hosted HTTPS connection, private account recovery, durable application records, and a bounded submission worker for the native iPhone and Android apps. The web pages manage connections and account data; the career workspace remains in the phone apps.

Service origin: `https://career-finder-service.jazzy-drake-8323.chatgpt.site`

This is a development preview. No employer integration is enabled by default. Synthetic test receipts never establish that a real employer received an application.

## Architecture

- A Cloudflare Worker serves the connection, account, help and privacy pages and the application API.
- Public discovery uses separate GET-only routes and a shared, bounded D1 cache. It does not read account identity, phone credentials, profiles or CVs.
- D1 stores private workspaces, phone sessions, immutable reviews, submission state and evidence. PDF bytes are kept in private R2, outside D1's row-size limit.
- ChatGPT Sites supplies authenticated, site-specific user identity to browser account routes. The public website does not make account records public.
- Browser writes require the exact service Origin and JSON. Native routes require a random bearer token obtained by redeeming a short-lived, one-use pairing code. Only token and pairing-code hashes are stored.
- The app's existing Node/SQLite companion service is a separate implementation. Native clients retain GET-only polling with that service unless the exact `dispatchContinuation: "client"` capability is advertised.

The production entrypoint is `worker/index.ts`. It imports the production handler directly; request inputs and environment variables cannot select a synthetic adapter. The test harness injects its synthetic HTTP dependency into a separate handler instance.

## Public job discovery

Version 0.4 adds `/api/discovery/sources` and `/api/discovery/search`. The starter catalog contains seven public employer boards across technology, logistics, music, clinical research, education, mental health and autonomous transport. A person can choose up to four boards per search or supply a supported Greenhouse or Lever board URL. Search is available without signing in. It has no country or profession whitelist, but it covers only the selected boards and the current interface is English.

The service fetches only the providers' fixed public API hosts. It filters the returned title, employer, available summary, location text and explicit remote-work metadata locally. It does not infer work eligibility or forward a person's keywords and location filter to employers. Search terms are not retained in the workspace or public board cache; ordinary platform request logs may include URL fields. See [the exact native API contract](server/discovery-contract.json).

Each board is capped at 500 validated jobs and 512 KiB of normalized cache data. Pages contain at most 50 results. A shared ten-minute cache and durable request/fetch budgets limit upstream traffic. Earlier results may remain visible for at most 24 hours after a refresh failure, with their original check time and stale state. Deleted boards clear cached vacancies. Partial coverage, unavailable sources, invalid filters, cooldowns and changed page snapshots remain distinguishable from a successful empty search.

Discovery never approves or sends an application. Saving a discovered job uses the existing opportunity flow; verified submission still requires the separately authorized employer integration described below.

## Connect and recover

1. Open `/connect` and sign in with the ChatGPT account you want to use for recovery.
2. Generate a connection code. This explicitly creates or reuses a workspace.
3. Enter the service address and code in the phone app. Codes expire after five minutes and can be redeemed once.
4. Review the phone draft before saving it. Connecting does not automatically upload an existing draft.

Phone sessions expire after 30 days. `/account` lists active sessions, revokes a lost phone, exports account records, downloads retained CV files, recovers interrupted uploads and deletes the cloud workspace. Account GET is read-only and does not create a workspace.

Automatic submission requires the email address supplied by the signed-in account. This is an account association, not verification of legal identity, qualifications or the contents of a CV.

## Submission guarantees and limits

Preparing a review freezes the chosen profile revision, exact PDF fingerprint, employer answers and reviewed posting requirements. `/submit` records explicit approval of its digest. `/advance` can process only work already authorized by the persisted server state; it cannot approve a review.

Each continuation request attempts at most one provider submission. It checks the current posting and exact saved PDF, acquires a durable D1 claim before the POST, and records the provider outcome with that claim. Phone apps continue sequentially while active and refresh authoritative workspace state after the request. Closing the app may leave unsent approved work pending. A dispatched request may finish after the phone closes or disconnects.

Confirmed means the supported provider returned its documented acceptance response and an application ID. It does not mean a recruiter reviewed, selected or hired the applicant. Network interruption, an undocumented response, expired dispatch lease or failure to persist the result remains uncertain and is blocked from automatic resend. A rate-limited attempt requires explicit approval after its cooldown. Stop prevents work that has not passed its durable dispatch claim; it cannot recall a request already sent.

Per-posting duplicate checks use workspace identity and a keyed applicant-email fingerprint across accounts. Changing a phone, starting another review or restarting a Worker does not bypass the ledger. Account erasure removes its application records, so users must retain their export and reconcile prior employer submissions before starting over.

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

The schema lives in `db/schema.ts`. Use `npm run db:generate` for schema changes. Keep the generated migration history under `drizzle/` immutable after publication. The Sites package includes these migrations and the `.openai/hosting.json` bindings for `DB` and `BUCKET`.

## Deployment

The hosting manifest selects the dedicated phone-service Site. Preserve its project ID, keep native origins synchronized, and deploy the exact pushed source and built artifact through Sites. This project is separate from the pre-existing AhmadCareer website.

No custom domain purchase, separate paid cloud account or employer integration is required to publish the connection service through the available hosting. Hosting availability and service quotas remain subject to the existing provider account and plan. Keep secrets in the service environment; never ship a Sites owner-bypass token to a phone app.

Public support is available through `https://github.com/swonyu/ahmad-career/issues`. Remove private information before reporting a problem. Store signing, physical-device acceptance and app-store review remain separate release steps.
