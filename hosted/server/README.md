# Hosted phone application service

`applications.mjs` exposes `handleApplications(request, env, ctx)` for the dedicated HTTPS origin. It returns a JSON `Response` for `/api/apply/*`, `/api/account*`, and `/api/health`, or `null` for other paths. Required private bindings are `DB` (D1) and `BUCKET` (R2). Drizzle schema and generated, append-only migrations are in `db/schema.ts` and `drizzle/`.

The existing Node/SQLite companion remains separate. Wire `mode: "local"` means the existing non-test API contract; hosted status is conveyed by `hosting: "managed-https"`. The default exported handler has no HTTP/environment test switch or configurable provider host. An empty `CAREER_CONNECTORS_JSON` means `liveEnabled: false`. Authorized Lever keys, if supplied later, are referenced by validated runtime secret names and never sent to phones or exports. Reviewed posting requirements must be current and expire within seven days.

## Authentication and account API

Only the Sites platform may supply `oai-authenticated-user-id` and `oai-authenticated-user-email`. Sites must strip caller-spoofed identity headers. This trust boundary requires verification on the deployed Site. The generated public origin makes the native API reachable; application records remain protected by the platform identity on account routes and a private bearer token on phone routes. Never embed a Sites infrastructure bypass credential in the phones.

Browser mutations require the exact service `Origin` and JSON content type. Native mutations require a 256-bit phone bearer token. The database stores only its SHA-256 hash. Tokens expire after thirty days; pairing codes are single-use and expire after five minutes. Account GET does not create a workspace. Explicit pairing creates or reuses the signed-in identity's workspace.

| Route | Contract |
| --- | --- |
| `GET /api/account` | `{ok, workspaceId, email, createdAt, deleting, profile, sessions, documents, limits, usage}`; `workspaceId: null` before explicit creation |
| `POST /api/account/pairing` | `{}` → `{ok, pairingCode, expiresAt, workspaceId, origin}`; issuing another code invalidates the prior unconsumed code |
| `POST /api/account/sessions/revoke` | `{sessionId}` → `{ok:true}`; scoped to signed-in owner |
| `POST /api/account/uploads/recover` | `{}` → `{ok:true,recovered,retryRequired,message}`; expired/failed upload recovery, no implicit profile attachment |
| `GET /api/account/export` | Personal records, immutable application profile/answer snapshots, PDF metadata and authenticated download paths; explicitly `includesPDFBytes:false` |
| `GET /api/account/resumes/{sha256}` | Exact owned PDF, only while its record is ready and account is active |
| `DELETE /api/account` | `{confirmation:"DELETE"}` → `{ok:true,deleted:true}` only after PDF erasure fences and D1 removal succeed |

Sessions are `{id,createdAt,expiresAt}`. Documents are `{sha256,name,size,createdAt,state,downloadPath}` with state `uploading`, `ready`, or `failed`. Usage is `{storedResumes,storedResumeBytes,jobs,plans,attempts}`. Limits come from exported `LIMITS`.

The preview requires automatic applications to use the signed-in account's email. This establishes account ownership, not legal identity. Pairing with an updated platform email refreshes that requirement and increments the profile revision, invalidating older reviews; it does not rewrite the applicant's draft or silently change the saved profile email.

## Durable PDFs and interrupted upload recovery

PDF bytes (up to 5 MiB) live only in private R2 objects. D1 contains metadata and immutable object references; even a maximum-size PDF does not become a D1 row. Each upload reserves quota and an opaque random object key in D1 before it writes R2. A durable claim has a one-minute lease. Every R2 PDF write uses conditional-create semantics.

Retries or deliberate account recovery can replace an expired claim. Recovery verifies a completed object's length and SHA-256 before copying it under a fresh claim. A missing/incomplete object is fenced and marked for a new phone save. Original phone/PDF access is not needed to delete the account or recover already-written bytes. Recovery never attaches a document to a profile automatically.

Retired keys are overwritten with **zero-byte tombstones**, clearing all former filename, hash, content and account metadata. Their keys are opaque random identifiers. Conditional delayed writers cannot overwrite those markers, so a late request cannot restore a deleted CV. Empty markers remain as infrastructure fencing records; they contain no PDF bytes, account ID, email, filename or résumé fingerprint. Their retention differs from personal document retention.

Deletion locks new activity, fences every reserved upload key, verifies the empty markers, then transactionally removes workspace records, snapshots, phone sessions and owner-linked security counters. An active provider dispatch returns 409 until it finishes or its durable lease expires into uncertainty. A failed R2/D1 deletion returns an error, retains the deletion lock, and can be retried. It never returns `deleted:true` after a partial failure. Provider-held applications, phone-local data and managed infrastructure backups are outside this erasure operation. Removing a profile's current CV alone does not erase earlier immutable snapshots. Deleting a workspace removes its duplicate-prevention history as well; users must check earlier employer applications before starting fresh.

## Approval and bounded continuation

The hosted capability `dispatchContinuation: "client"` enables native `POST /api/apply/advance {planId}`. Clients must use only a fresh server `activePlanIds` list, one sequential request at a time, and refresh authoritative state afterward. They never infer permission from local selection or automatically call `/submit`. Legacy companion clients continue their existing read-only polling when this capability is absent.

`POST /submit` persists the exact digest approval; `/advance` processes at most one already-approved eligible attempt. D1 conditional updates and unique indexes prevent concurrent duplicate dispatch across isolates and workspaces. Posting preflight is bounded to five seconds; provider POST is bounded to eight seconds within an intended fifteen-second operation budget, plus storage latency. The durable dispatch lease is forty-five seconds. A provider POST begins only after committed intent. Expired dispatch claims become uncertain and are never automatically resent. GET routes do not perform recovery or dispatch writes.

Each plan retains its first approval and latest explicit approval timestamp. A 429 retry requires a later approval generation **and** an explicit approval timestamp at or after that attempt's cooldown. Reapproving other ready jobs during a cooldown cannot preauthorize its future retry. Stop and profile changes are checked atomically at claim time. Guarded review replacement refuses any approved/dispatched review.

## Bounded free preview

Per workspace: five retained PDFs totaling 25 MiB, 200 opportunities, 100 reviews, 500 attempts, ten active phone sessions, and twenty selected jobs per review. A file has at most twenty recoverable upload claims. Global application safeguards cap active accounts at 250, reserved PDF storage at 4 GiB, and attempts at 10,000. Quotas use conditional database mutations and are checked before object uploads. Hitting a limit preserves current records and does not enable a paid plan. Hosting-provider limits and availability can be stricter; no unlimited-service or uptime guarantee is made.

## Executed checks

Run `node tests/hosted-applications.mjs`. The suite uses actual local Miniflare/workerd D1 and R2 bindings, generated migrations, the production application handler, and production multipart/provider parsing with an injected synthetic HTTP dependency. It makes no live employer requests. `tests/hosted-verification.json` records passing groups and exact source fingerprints.

This test mode exercises real D1 SQL constraints, transactions, races, full-size R2 PDF storage, conditional object operations, recovery and erasure. It is separate from deployed HTTPS/Sites identity checks, built Worker execution, native-phone integration and live employer acceptance. `/api/health` reads the schema and performs a harmless R2 `head`; it returns no account, bucket or key identifiers.
