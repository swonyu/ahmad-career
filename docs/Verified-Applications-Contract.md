# Verified applications: implementation contract

Version 1, 16 November 2026. This additive feature preserves the existing tracker, feed contracts and historical records. The product targets iPhone and Android phones. A shared Node application service stores isolated personal workspaces and provider receipts. Its listener binds only to loopback; production phone access requires an independently configured HTTPS gateway. No public service is deployed by this source change. Every person starts with a blank profile. It can track opportunities in any profession/country, but automatic submission is limited to explicitly configured employer integrations.

## Evidence and provider boundary

The first real connector is Lever's official Postings API: https://github.com/lever/postings-api. Global and EU hosts are separate. An employer-authorized key is required per employer site. Successful submission means exactly HTTP 200 and a JSON object containing `ok: true` and a nonempty string `applicationId`. The identifier proves API acceptance, not recruiter review or a job offer. Redirects, timeouts, 5xx and malformed success responses are unconfirmed and must never be automatically retried. HTTP 429 explicitly rejects a request and may be retried after the recorded cooldown with unchanged approval. Custom questions are not exposed by this API; employer-controlled, current posting requirements must explicitly establish that the supported standard fields are sufficient. Unknown/custom requirements block dispatch. PDF résumé bytes must be uploaded as multipart form data.

## Deployment and sessions

The API-only service runs from `website/applications/server.mjs` under `/api/apply/`. It binds exclusively to 127.0.0.1, default port 8780. iOS and Android require HTTPS and a server-issued, single-use pairing code. The existing website and generated Worker keep their prior behavior; this task adds no web or desktop product interface. Phones without an activated service do not pretend to submit.

Every route validates the exact configured Host. Native sessions use an expiring bearer token whose hash alone is retained by the server. Pairing codes expire after five minutes and are issued through an administrator-only CLI; no unauthenticated HTTP route can issue them. HTTPS deployments reject anonymous browser workspace creation. Browser state-changing requests require exact Origin, JSON, a private HttpOnly SameSite=Strict session cookie and an X-Career-CSRF token, except initial session bootstrap which still requires exact Origin and JSON. No CORS wildcard. Each new browser session owns a separately identified workspace. No personal profile is seeded. Native tokens expire after 30 days and can be revoked through POST /api/apply/session/revoke. Native bearer requests require no browser Origin/CSRF headers. Both clients retain tokens in their platform secure storage.

The SQLite ledger is outside `web/`, with private permissions and durable transactions. A process lock prevents two companion instances recovering each other's active dispatches. Restart changes leftover dispatching attempts to uncertain. Test instances use separate data directories and a separately labeled test connector; fixture receipts never enter real data.

## API contract

All JSON responses use `{ok:true,...}` or `{ok:false,error:{code,message}}`. Errors are sanitized. Unknown request properties are rejected. Missing sessions return 401; denied Origin/Host/CSRF return 403; stale revisions or duplicate attempts return 409; validation errors return 422; oversized payloads return 413. The browser never supplies a submission outcome or trusted provider configuration.

| Method/path | Input | Result |
| --- | --- | --- |
| GET /api/apply/status | none | mode, provider summaries and liveEnabled; no secrets |
| POST /api/apply/session | Local browser `{}` or native `{pairingCode}` | Browser cookie/CSRF for loopback tests; native sessionToken, workspaceId, profile and expiry after one-use pairing |
| POST /api/apply/session/revoke | `{}` with native bearer | Revoke this phone token while retaining workspace data |
| GET /api/apply/workspace | session | profile with revision and résumé metadata, jobs, attempts, capabilities, activePlanIds and up to 20 recoverablePlans; never CV bytes or secrets |
| PUT /api/apply/profile | `{expectedRevision,profile}` | Validated profile and incremented revision; profile fields listed below |
| POST /api/apply/jobs | `{url,title?,company?,location?,country?}` | Saved opportunity. Lever URLs import exact public posting metadata. Other public HTTPS URLs need explicit title/company and are manual-only; they are never fetched by the server. |
| POST /api/apply/prepare | `{jobIds,answers?,manualAppliedJobIds?}` | Immutable plan `{id,digest,profileRevision,items,expiresAt}` with per-job eligibility and exact shared fields/CV metadata; no dispatch. `answers` keyed by job ID, only comments, consentStore, consentMarketing; no inferred consent. Manual already-applied IDs are blocked for reconciliation. |
| POST /api/apply/submit | `{planId,digest,approved:true}` | Return HTTP 202 and process eligible attempts serially in the background; persist each dispatch before POST. Poll workspace activePlanIds and attempts; stop remains available. Server serializes work and deduplicates applicant identity/email + canonical job. |
| POST /api/apply/stop | `{planId,onlyIfUnapproved?:boolean}` | Stop jobs not dispatched; in-flight outcome remains truthful. With `onlyIfUnapproved:true`, atomically reject already-approved/dispatched reviews with HTTP 409 `review_already_approved` and leave them unchanged. |
| GET /api/apply/receipts | session | Exportable receipt object with immutable evidence, hashes and outcomes; no secrets or CV bytes |

Profile fields: firstName, lastName, email, phone, city, country (ISO alpha-2), headline, skills (string array), targetRoles (string array), targetCountries (string array), workModes (on-site/hybrid/remote), experienceLevel (entry/mid/senior/any), website (optional public HTTPS URL), resume (optional `{name,mime:'application/pdf',dataBase64}`; omitted means preserve, null means remove). Required for automatic submission: first or genuine single name, valid email, PDF with matching magic bytes and ≤5 MiB. A separate last/family name is optional; the review and multipart upload use the same trimmed name without inventing a surname. First save uses expectedRevision 0. Unknown fields, malformed strings, invalid enumerations and filesystem paths are rejected. Profile revision changes invalidate prepared approvals. The immutable payload, résumé digest and provider requirements revision are recorded before sending.

## States and authority

Each attempt records `evidenceMode: live` or `test`; tests and real data cannot share a ledger. A phone must not count missing/unknown evidence mode as a live receipt.

`ready` → `dispatching` → `confirmed`, `uncertain`, `rejected` or `rate_limited`. `ready` → `cancelled` when stopped. Unsupported/incomplete items are `blocked`. Confirmed, uncertain and dispatching attempts block further automatic submissions for the same applicant/job, including copied profiles with the same email. A profile's stable workspace identity also blocks duplicates after email changes. A rate-limited attempt records the next permitted retry and never retries before it; retries require the same still-valid approval and a bounded attempt count. Definite rejection is presented for correction, not a generic retry-all loop. Clicking or opening an employer link cannot create a receipt.

Receipt fields: attemptId, provider, region, employerSite, postingId, employer/title, applicationId (confirmed only), state, createdAt, dispatchedAt, confirmedAt, profileRevision, resumeSHA256, payloadSHA256, requirementsRevision, responseSHA256 and sanitized error. Export identifies mock/test evidence explicitly. Raw authorization, API key query strings, CV bytes and raw provider errors are never logged/exported.

## Configuration

Server-side connector configuration is read from an explicitly provided private file (`CAREER_APPLY_CONFIG`) outside static assets. Each entry binds region, employer site, API-key environment-variable name and reviewed posting IDs. Each posting has a current requirements revision, reviewedAt, expiresAt, requiredFields and hasCustomQuestions:false. Only supported fields may be required. An absent/expired/unknown requirements manifest disables auto submission and leaves manual application available. Config never contains an unrestricted user-provided POST URL. Real outbound hosts are fixed to api.lever.co and api.eu.lever.co. Response redirects are disabled.

For required consent fields, `consentMarketing` requires an explicit boolean answer; `false` is a valid declined future-contact choice and is sent unchanged. A required `consentStore` requires explicit positive permission and an available employer policy. Unanswered values are never inferred, and agreeing to application processing does not imply future-contact permission.

## Acceptance evidence

Run existing regression checks and real HTTP tests through the companion against a documented local Lever mock. Test multipart CV bytes, strict success parsing, wrong-region/config blocks, expired requirements, failed durable writes, concurrent clicks, duplicate URLs/profiles/email changes, restart after dispatch, stale approvals, timeout/5xx/no-ID responses, 429 cooldown, stop, auth/CSRF/Host checks, upload boundaries, malicious text, session isolation and receipt redaction. Passing mocks proves the implemented behavior against modeled responses. Live acceptance remains unverified until an authorized employer integration and an explicitly approved real application are used.

## Phone recovery

GET workspace returns current, unexpired, unstopped reviews with ready or explicitly rate-limited attempts, limited to the authenticated workspace. Recovering a review restores its original digest and current item states; it neither approves nor sends it. Both phone clients require a new visible review/approval to resume after a provider cooldown. Unknown outcomes remain blocked.

Replacing an unapproved review is deliberate: stop that exact earlier plan using `onlyIfUnapproved:true`, then prepare the new inputs. The condition and stop occur in one transaction. If another phone approved the earlier plan in the meantime, the replacement must pause and refresh its current state. A client-side check alone cannot authorize cancellation of an approved review. Ordinary explicit Stop omits the condition and retains the existing batch-stop behavior.
