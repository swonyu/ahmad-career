# Private-hosting discovery failure: investigation and fix

## Outcome and current verification boundary

A minimal client fix is ready and the integration owner has applied its four-file patch. Local checks pass: **13 phone API checks**, **26 discovery groups**, **8 actual Workerd requests**, and **63 successful response decodes through the phone schemas**. The actual private QA redeploy and Search UI confirmation remain pending at this handoff. No employer API was contacted by this investigation and no application was submitted.

The investigated private QA source was `8a31c7db5c761e80d08272d0f7700b4c2dc3ce99`. Its `app/phone/api.ts` was verified byte-identical to the GitHub candidate baseline `859b84a4bb184cbc9bb5039be34e35ad4ca17356` used for the isolated patch. The [verification receipt](verification.json) binds the before/after client, tests and README to their exact SHA-256 hashes and records timestamps from completed output files.

## What was observed, and what was inferred

The integration owner reported that the signed-in private QA app displayed **Search options: 0 boards** followed by **“The response could not be verified. Your earlier information is still here.”** Account status, workspace and Google connection routes worked. Purpose-built Worker logs showed those requests but no discovery request in the inspected window; the error-event result was empty.

That exact message comes from `phoneAPI` rejecting a response whose Content-Type is not JSON, before the catalog schema is parsed. The real source-catalog handler returns JSON for success and for host/origin errors, uses no DB or employer request for the catalog, and its actual payload passes the current phone schema. The deployed QA SERVICE_ORIGIN was also set to the QA origin. This did not point to a catalog-field mismatch or the new auth initialization path.

The client instead used `credentials:'omit'` for discovery while the Site was owner-private. Its other API requests used `credentials:'same-origin'`. The resulting hypothesis was that the hosting access gate rejected the credentialless request before it reached the Worker. A signed-in document navigation to the same catalog route then reached the Worker and returned JSON `origin_denied`, as reported by the integration owner. That supports reachability when hosting access is present; it also confirms why the server's cross-site guard must remain intact. The live non-JSON response body/status itself was not captured in this lane.

## Reproduced mechanism

The new client regression executes the actual `phoneAPI`, then the actual discovery catalog handler and actual catalog schema. Only the owner-private hosting gate is synthetic. Without same-origin credentials that gate returns a non-JSON access response. The unchanged client reproduced the exact visible error, with **one gate denial, zero Worker reaches and zero provider calls**. See [client-before.log](client-before.log).

With the minimal change, the same test reports **zero gate denials, one Worker reach and zero provider calls**, decodes **seven catalog sources and four defaults**, and confirms that the cookie-bearing payload equals the anonymous public catalog despite an invalid app cookie. See [client-after.log](client-after.log). This is concrete proof of the mechanism under the stated boundary; the deployed reload is the remaining end-to-end confirmation.

## Implementation and retained privacy boundary

`hosted/app/phone/api.ts` now uses same-origin browser credentials for all of its existing allowlisted relative API calls. It never reads a cookie or adds a Cookie/Authorization header itself. The browser can therefore present its private hosting session to the same Site. Discovery remains GET-only, has no request body and cannot fetch an arbitrary destination. Redirects remain rejected, as do non-JSON, malformed, oversized and schema-invalid responses. The timeout, response-size limit, mutation behavior and server host/origin/fetch-metadata checks are unchanged.

The discovery application handler still ignores account cookies and identity. It is routed before app identity resolution, and every employer GET is constructed with fresh `Accept` and `User-Agent` headers. Tests now explicitly supply synthetic hosting cookies, app cookies, an Authorization bearer value, owner ID and owner email, then verify none enters employer requests, the shared discovery cache or rate rows. Search text and raw client IP also remain excluded from those recorded data structures. No account or native session is created by discovery. The existing server tests enforce exactly the two public upstream header keys. See [discovery-after.log](discovery-after.log) and [discovery-verification.json](discovery-verification.json).

The stale README statement that discovery omits credentials was corrected to distinguish same-origin hosting access from application logic and employer forwarding. No server, auth, schema, migration, provider credential, employer submission or hosting audience change is part of the patch. Applied migration 0004 remains untouched.

## Independent review and handoff

A separate reviewer inspected the final source boundary and found no blocking issue: exact path/method allowlist, same-origin fetch, no redirects, discovery before app identity resolution and fresh upstream headers remain intact. This was a source review; it adds no live browser or platform-ingress acceptance claim.

Patch: `discovery-private-hosting.patch`, SHA-256 `48d89c36131c7409f532b84cbad37ef11a93a33fcdff61f9be18d79736026bff`. It changes the client, two existing test files and hosted README. Targeted ESLint and diff/reverse-patch checks exit 0. The integration owner owns packaging, QA publication and verification that a normal same-origin Search page load now shows the four defaults without the catalog error. A document navigation's cross-site rejection must not be used as a reason to relax the server guard.
