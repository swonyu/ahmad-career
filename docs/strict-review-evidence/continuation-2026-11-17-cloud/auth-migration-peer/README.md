# Independent review: schema-only provider connection migration

Eight independent groups passed against the isolated candidate identified in `receipt.json`. The review used the actual OAuth handler, actual migration files, and an isolated Miniflare/D1 database. It made zero external provider requests and did not access any deployed database, QA Site, browser, real account, or production data.

## Reproduce

```sh
node review.mjs /absolute/path/to/career-finder/hosted
```

Omit the path argument to use this repository's hosted source after integration. Use the checkout's existing installed development dependencies. No new dependency is added. The script verifies that its reviewed source files do not change during execution, then writes a receipt with their hashes. The committed receipt identifies the isolated source actually tested; copying it into another checkout does not turn it into evidence for an untested integrated revision.

## Findings and outcome

No remaining blocking authority or race defect was found in the reviewed scope. The migration adds the constant-default column and insertion trigger without a top-level data update. The test creates a link before applying migration 0004 and confirms that the existing row retains the empty default afterward.

The status initializer operates only on at most two captured supported-provider rows for the confirmed owner. Its final batch separately checks authority; it does not infer authorization from the number of changed rows. A competing initializer can win the update and its connection generation is retained. Changed authority produces an error instead of a successful empty connection list.

| Independent group | Observed result |
| --- | --- |
| Schema-only upgrade | Existing identity data remains unbackfilled; only schema and trigger definitions are present as top-level migration statements. |
| Missing storage | Anonymous capability discovery remains available with providers unconfigured. A signed-in Sites identity gets `503 auth_unavailable`, without an account or providers success payload. |
| Bounded lazy initialization | Only the requesting owner's Google/LinkedIn empty generations initialize. Another owner's links and an unsupported provider remain untouched. Other identity fields are unchanged; repeated reads preserve IDs. |
| Concurrent initializer | A generation written immediately before the status batch remains the winning value and is returned consistently. A legitimate zero-change update is not mistaken for lost authority. |
| Account/lifecycle/deletion races | Changing the account generation, rotating its lifecycle, or beginning workspace deletion before the actual status batch rejects the result and leaves empty connection IDs untouched. |
| Provider-session races | Removing the session, expiring it, or changing its account generation rejects status initialization and response. |
| Captured-row replacement | Moving the captured old subject to a different owner and inserting a replacement for the original owner cannot initialize the other owner's row or overwrite the replacement generation. Current authorized status returns the replacement. |
| Previously unconnected Sites user | Normal status creates neither auth-account nor lifecycle metadata. A racing new auth account or an already deleting workspace prevents a false unlinked success. |

The author's separate suites cover additional callback, deletion, rollback and actual Worker requests. This receipt reports only the independent groups above and does not incorporate their counts as independently run results.

## Failed attempt retained

The first independent run stopped while applying the initial schema-only candidate's trigger statement. That draft put explanatory comments after the trigger's `END;`. Actual D1 returned:

```text
D1_ERROR: SQL code did not contain a statement.
```

The author independently observed the same failure and moved the comments before `CREATE TRIGGER`. The final source hashes in the receipt identify the corrected migration. The failed attempt did not reach the authority tests and is not counted as a pass. It was entirely local; no migration was applied to a deployed database during this review.

## Scope limits

- Concurrency changes were injected immediately before the actual status batch. This is meaningful race coverage, not a proof covering every possible interleaving.
- The reviewed endpoint continues to depend on trusted Sites ingress identity for the Sites path and the existing provider-session resolver for cookie identity.
- Local D1 execution does not verify deployment migration ordering, provider consent, external callbacks, signing, stores, physical devices, or a production rollout.
- Editing migration 0004 relies on the integration owner's verified premise that this migration is not yet applied in the relevant deployment. This review did not inspect deployed migration history.
- Hosted version 7, the development candidate, owner-private QA deployment and store release remain distinct.
