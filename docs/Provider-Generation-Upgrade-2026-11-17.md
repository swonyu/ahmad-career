# Provider generation upgrade: schema-only deployment and bounded initialization

## Scope and status

This is a source-candidate follow-up to `eebe748cb5afca0efcb9389255400a00cf5a480a`. The implementation changes `hosted/server/oauth.mjs`, the **unapplied** `0004_provider_connection_generation.sql`, and the two existing auth test programs. It changes no provider scopes, credentials, identity keys, email policy, account schema shape, Drizzle snapshot or journal. No hosted database was accessed or migrated by this work.

Before this edit, the integration owner confirmed that 0004 had never been attempted on the live or QA Site: the live phone deployment remained version 7 and the private QA Site was unpublished. That confirmation is the reason this source migration could be repaired. Once any migration is applied, its SQL, snapshot and journal are immutable. A failed deployment can already have applied SQL; check actual migration state before any later repair.

The current Sites **Storage / Schema Changes** guidance, read during this follow-up, requires schema-only, bounded migrations and places backfills outside migrations. It also requires a constant non-null default for an added non-null column. This was a guidance-based prepublication blocker, not an observed hosted migration rejection. The new SQL was exercised on isolated actual D1; acceptance by the final Sites publication workflow is a separate integration gate.

## Verified findings and changes

### 1. The migration included a whole-table data rewrite

The earlier 0004 added `connection_id TEXT NOT NULL DEFAULT ''`, installed an insert trigger, then ran an unrestricted `UPDATE auth_identities ... WHERE connection_id=''`. That last statement assigned a generation to every historical identity during deployment. It was incompatible with the current schema-only migration requirement.

The repaired 0004 has exactly two top-level statements: the constant-default `ALTER TABLE` and `CREATE TRIGGER`. Existing rows retain the empty default. The trigger continues to assign a fresh 32-byte random hex generation to each newly inserted link when a rolling older Worker omits the column. Routine metadata UPSERTs keep an existing ID; deleting and inserting a link produces a new one. No standalone data backfill remains in the migration.

Simply deleting the backfill was insufficient. A regression against the unchanged status handler reproduced an empty/missing connection ID for a legacy linked row. The current client deliberately requires a valid displayed ID before offering disconnect, so a safe replacement initialization path was necessary. See [the failing legacy-row proof](strict-review-evidence/continuation-2026-11-17-cloud/provider-generation-upgrade/legacy-before.log).

### 2. Status could finish under revoked browser authority

A second regression paused a real provider-cookie identity lookup after it had read a valid session, revoked that session, then allowed `/api/auth/status` to continue. The baseline returned HTTP 200 with account/connection metadata. The test expected an explicit stale-authority error and failed with `200 !== 409`. See [the failing status proof](strict-review-evidence/continuation-2026-11-17-cloud/provider-generation-upgrade/status-before.log).

This demonstrates a stale authenticated status response. It does **not** demonstrate a cross-account exploit, real provider-account access or an employer submission. The new final authority check closes that demonstrated response window and also protects the bounded initialization writes.

### 3. Authenticated missing-storage status could imply no connections

The former Sites-authenticated path returned `connected:false` when the DB binding was missing, although it could not read the connections. It now returns the existing `auth_unavailable` HTTP 503 error. Anonymous capability discovery may still report providers unconfigured. The response no longer represents unavailable storage as a confirmed disconnected account.

### 4. Actual D1 caught a migration formatting error during implementation

An intermediate edit placed explanatory comments after the trigger's final `END;`. The existing migration runner's actual D1 `prepare(...).run()` rejected that chunk with `SQL code did not contain a statement`. The independent reviewer reproduced the same result. Moving the comments before `CREATE TRIGGER` fixed it. Final auth and Worker runs apply the real SQL successfully; no parser relaxation or skipped migration was used.

## Implemented status protocol

`statusConnections()` runs only inside the existing auth handler. It introduces no endpoint, environment bypass, network request or token storage.

1. Anonymous status returns capability information without reading or writing account rows. An authenticated request without DB fails explicitly.
2. The handler captures the current `auth_accounts.generation` for the resolved owner. If that account is absent, a provider-cookie identity fails. A Sites identity gets an atomic continued-absence and no-deleting-workspace check before a no-connections result; a racing callback that creates account metadata makes this check fail. This branch creates no account or lifecycle metadata for a new Sites user.
3. For an existing account, the handler captures its deletion lifecycle using the original request start time. It reads only the two supported provider names for that owner, with `LIMIT 2`. The unique `(owner_id, provider)` index also enforces the two-row bound.
4. At most two captured empty rows are assigned an opaque generation. Each `UPDATE` matches owner, provider, subject and the still-empty ID. It additionally requires the captured account generation, captured lifecycle generation, compatible deletion time, no deleting workspace, and the original still-valid provider session when the current method is Google or LinkedIn.
5. Those writes, an explicit authority `SELECT`, and the final guarded connection read run in one D1 batch. The explicit authority result is essential: another valid initializer may win every update, so a zero update count does not mean an error. A failed authority check instead returns `account_changed` HTTP 409 and does not expose an empty successful provider list.
6. The returned public shape remains unchanged. Only `connectionId` and display metadata are exposed; subjects, owner generations, lifecycle keys and session tokens are not added to the response.

Concurrent valid status calls converge on the winning connection generation without rotation. A replaced link keeps the insert trigger's new generation, and the old captured subject cannot be relabeled or moved to another owner. Existing accounts, identity metadata and active session rows are preserved. Dormant owners need no maintenance scan: their supported legacy links initialize when they next make an authenticated status request. Unknown provider rows and other owners are untouched by this routine.

The existing disconnect contract remains strict: the client must send the exact displayed `expectedConnectionId`, and owner/lifecycle/session guards still protect the atomic disconnect. Old, missing or mismatched confirmations fail. The original/current sign-in lockout guards remain in place. Existing Google/LinkedIn verified-email, subject identity, nonce/state/replay, bounded provider HTTP, deletion and callback protections are unchanged and remain covered by the complete auth suite.

## Verification and evidence

The final [verification receipt](strict-review-evidence/continuation-2026-11-17-cloud/provider-generation-upgrade/verification.json) contains exact source hashes, commands and limitations.

| Check | Observed result |
| --- | --- |
| Complete `node tests/hosted-auth.mjs` | **55 groups passed**, actual isolated D1 and synthetic RS256 signatures |
| `node tests/hosted-auth-worker.mjs` | **30 actual Workerd auth requests passed**; 12 synthetic provider requests; zero real provider or employer requests |
| Independent actual-D1 review | **8 groups passed**, zero external requests; [receipt](strict-review-evidence/continuation-2026-11-17-cloud/provider-generation-upgrade/peer-review.json) |
| Targeted ESLint and `git diff --check` | Exit 0 on the final files |
| Reverse patch applicability against the isolated candidate | Exit 0 |

New regressions cover pre-upgrade identities and an active browser session; constant-default rows before first status; per-owner initialization; stable repeat/concurrent reads; untouched other owners; revoked and expired Google/LinkedIn sessions; deletion and deliberate owner recreation; absent-account creation races; a deleting Sites workspace without provider-account metadata; relink/subject replacement; and rollback of both generation updates when the second update fails. Existing stale disconnect, same-subject relink, recovery and lockout tests continue to pass. The independent reviewer additionally exercised an old subject moved to another owner and unsupported-provider rows.

The Worker fixture creates linked identities and an active cookie **before** applying 0004, verifies the migration leaves the new column empty, then calls the exported production handler through Workerd. The session survives, both IDs become valid, repeat status retains them, and no provider HTTP is involved in initialization. See the [auth log](strict-review-evidence/continuation-2026-11-17-cloud/provider-generation-upgrade/auth-after.log) and [Workerd receipt](strict-review-evidence/continuation-2026-11-17-cloud/provider-generation-upgrade/workerd.json).

These are isolated source/runtime checks. They are not real consent, hosted ingress, disposable-account, physical-device, store-signing or release acceptance. They do not replace the historical five CI gates at the earlier tested application source or imply the new combined candidate has passed remote CI. The integration owner owns the combined manifest, complete candidate checks and publication receipt.

## Rollout and recovery

1. Confirm source ownership and the target Site's actual migration/deployment state. Apply this repair only while 0004 is known unapplied. Do not change an already-applied SQL file based only on a failed deployment result.
2. Integrate the four-file source patch with the current UI/native/docs candidate and keep the existing Drizzle schema, 0004 snapshot and journal, whose column shape is unchanged. Run the full combined candidate gates and record the exact commit.
3. Package through the supported Sites workflow. Sites applies pending schema before the Worker upload. Verify that the intended environment and origin belong to the target QA or production Site; do not mix its credentials, callback URLs or version receipts with another deployment.
4. On an authorized disposable account, verify the real status path, sign-in persistence, current connection display and legitimate disconnect. Repeat the old-client/mismatched confirmation rejection and deletion/recovery acceptance. The local tests do not substitute for those checks.
5. No administrator backfill or global update is required. If initialization cannot establish current authority, the client receives an error and must reload/reconfirm the account. Do not bypass the connection ID requirement or replace an error with disconnected status.
6. A previous Worker can still insert links against the expanded schema because the default/trigger preserves compatibility. That trigger does not retrofit new authorization checks into an already-running older Worker. Keep the intended client/server release paired, preserve migration history after application, and record any rollback as a separate deployment action.

The live version 7, source candidate and publishing branch remain distinct artifacts. This work neither publishes a version nor enables live Auto Apply, changes employer integration authorization or submits a test application.

## Subsequent private QA deployment

After this repair and its tests, the corrected migration was applied successfully to the separate owner-private acceptance Site at `2026-11-17T10:07:50.731812Z`, source `8a31c7db5c761e80d08272d0f7700b4c2dc3ce99`, environment revision 1. The SQL/snapshot/journal are now immutable. The [deployment receipt](strict-review-evidence/continuation-2026-11-17-cloud/private-acceptance-deployment.json) records the Site and saved version. Public hosted v7 remains unchanged. This successful fresh-database deployment does not establish production-data upgrade or real-provider acceptance.
