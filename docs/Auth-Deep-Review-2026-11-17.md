# Independent authentication review — 2026-11-17

## Scope and evidence boundary

This review used a new isolated copy of the current continuation candidate's OAuth, identity and validation modules, all five existing SQL migrations, and authentication fixtures. No production database, provider account, live session, signing/store asset or shared native build was changed. The isolated baseline hashes are recorded in `auth-deep-review/baseline-hashes.json` in the review workspace. The development candidate remains separate from hosted version 7 and from publishing-owned releases.

The review examined provider subject identity, optional LinkedIn email, login/link/unlink, interrupted provider HTTP, account deletion/recreation, session expiry and recovery. Tests use actual isolated D1 storage and valid synthetic RS256 signatures. They do not issue real provider or employer requests. One separately authorized anonymous read-only public status request was denied with HTTP 403; no synthetic identity-header request followed that denial.

## Verified finding and correction: malformed subject aliases

The baseline checks a subject's type, nonempty length, 255-character bound, whitespace and control characters. It did not reject non-ASCII UTF-16 values. Two distinct synthetic, correctly signed LinkedIn claims, containing isolated surrogate code units U+D800 and U+D801 respectively, both completed sign-in and returned the same Career Finder owner. D1/UTF-8 string conversion collapses these malformed strings. The defect occurs before database account lookup: distinct input identifiers cannot safely be accepted when their storage representation aliases.

OpenID Connect Core defines the subject as a bounded ASCII identifier. The fix rejects every character outside the already intended printable ASCII range before hashing, lookup or D1 binding. It does not normalize a subject into another identity, change valid provider subjects, merge by email, or alter display names and profile text. Arabic/international display names remain supported. No migration or mass account/session reset is introduced.

The test first failed against the baseline (`actual: signed_in`, `expected: failed`). After the guard change, both providers reject isolated surrogates, an accented non-ASCII subject and an emoji subject before creating an account, identity or browser session. This is a verified trust-boundary hardening defect. It requires a nonconforming but validly provider-signed token; the review did not demonstrate an ordinary external attacker obtaining such a token from Google or LinkedIn.

## Lifecycle and recovery results

| Scenario | Observed result |
| --- | --- |
| Google or LinkedIn local session expires while another provider's token exchange is in flight | The callback fails after provider I/O. No additional identity is linked; its transaction is spent. An expired local cookie does not reveal a background ChatGPT identity. |
| LinkedIn OAuth transaction expires during optional-email userinfo | No account, identity or session is created, and the transaction is spent. One opaque lifecycle row can remain; see retention note below. |
| LinkedIn owner is deleted while a previous login waits on userinfo, followed by deliberate fresh sign-in | Fresh sign-in creates a different random owner. The old callback fails and cannot change the fresh email, name, connection generation or session. The old cookie remains invalid. |
| ChatGPT-owned LinkedIn link is removed, then the same subject is deliberately relinked while an older anonymous login waits on userinfo | The replacement receives a new connection generation. The older callback fails and cannot add a session, overwrite display metadata or attach its email to the replacement. |
| Request is authorized before session expiry, then the clock passes expiry immediately before its prepared disconnect batch executes | The already-authorized disconnect completes; the next request gets 401. The SQL statements use the captured authorization time. This is an observed in-flight-request boundary, not evidence that an expired cookie can start a new request or change another owner. No policy rewrite was made. |
| Google-origin owner links LinkedIn, then successfully signs in through that same linked LinkedIn identity | Both methods return the same owner. Removing the original Google method still returns `login_method_required`, and its current local session remains valid. This is the existing conservative recovery policy, described below. |

### Original login protection remains intentional

The current source creates a new owner with `career-` plus a random UUID only when an exact `(provider, subject)` identity lookup finds no existing owner. It has no deterministic subject-to-owner or matching-email fallback. An explicitly linked provider can therefore return the original owner, whereas an unlinked subject does not independently identify that owner's remaining workspace.

The review did not relax the original/current-method protection. It prevents accidental removal of a required login, but also prevents removing an original method even while a verified alternate method is in use. This remains a documented recovery limitation rather than a newly demonstrated account-takeover defect. Removing that restriction should first prove alternate-method availability and revocation/re-login safety, including simultaneous opposite-provider disconnects, stale sessions, delayed callbacks and recreation. A basic LinkedIn link without a verified sign-in email is not by itself evidence of an available alternate login.

Local sign-out or provider unlinking is also distinct from revoking a Google/LinkedIn permission grant. This application does not retain provider access or refresh tokens. Provider-side permissions must be managed with the provider; a provider permission change is not proof that every already-issued Career Finder local session has ended. Account deletion revokes the application's owned local sessions and links under the existing guards.

### Retention and expiry limits

An expired callback can create an opaque owner lifecycle entry before its final transaction-eligibility check rejects account creation. The observed entry contains the existing keyed owner hash, generation and deletion marker fields, not a plaintext provider identity or profile. This review did not establish a production exhaustion incident, alter retention or delete markers, since those markers protect deletion/recreation boundaries. The account limit must not be interpreted as a proved hard cap on every security bookkeeping table.

Session expiry was verified before requests and again after delayed provider HTTP. The review did not claim that expiry cancels every database operation that was already authenticated and prepared. If an instantaneous commit-time deadline is required, it needs an explicit policy and consistent database-clock design instead of an unsafe change to one isolated timestamp predicate.

## Provider and protocol research

The implementation uses the signed issuer/subject relationship as the identity, keeps email out of account lookup, and requires exact subject equality before accepting UserInfo claims. LinkedIn makes email and its verification claim optional. The chosen policy rejects direct login without a usable provider-verified address; it provides a ChatGPT/Google sign-in plus basic LinkedIn linking alternative and never invents an applicant address.

A newly obtained provider assertion is not an independent mailbox-ownership challenge. Google specifically distinguishes addresses for which it is authoritative from third-party addresses whose ownership might have changed since initial verification. Subject-based ownership avoids treating those mutable email values as account-merging authority. Privacy wording should state what the provider asserted and what the application actually checked.

OAuth security guidance requires browser/transaction-bound CSRF and code-injection defenses. The code uses a browser-bound one-use transaction, provider-specific redirect URI, signed issuer/audience validation and a transaction-specific nonce. Google also uses S256 PKCE. The current LinkedIn confidential-server flow validates its nonce before making the UserInfo request; it does not assume undocumented provider PKCE support. Actual LinkedIn consent/nonce/scope behavior still needs an authorized live callback check.

The reverse-proxy trust boundary is external: `oai-authenticated-*` headers are accepted only because Sites ingress is expected to own them. Workerd fixtures intentionally supply those trusted headers and cannot prove public-ingress sanitization. The anonymous public status request returned HTTP 403, so the review stopped without sending the planned synthetic-header probe. That control remains an external acceptance gate, not a source vulnerability proved by a forged local fixture request.

Primary sources inspected:

- [OpenID Connect Core 1.0, subject and ID-token validation](https://openid.net/specs/openid-connect-core-1_0.html#IDToken): bounded subject identity and claim checks.
- [OpenID Connect Core, UserInfo response](https://openid.net/specs/openid-connect-core-1_0.html#UserInfoResponse): exact subject matching before accepting UserInfo data.
- [LinkedIn OIDC sign-in](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2): optional email claims, scopes, endpoints and product provisioning.
- [Google server-side ID-token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token): stable subject identity and limits of third-party email verification. This page also covers GIS POST flows; those GIS-specific CSRF instructions must not be confused with the application's authorization-code callback.
- [RFC 9700, OAuth Security BCP](https://www.rfc-editor.org/rfc/rfc9700.html): transaction-bound nonce/PKCE, issuer/mix-up protection and reverse-proxy header trust.

## Verification and remaining gates

The focused malformed-subject regression failed before the guard and passed afterward. The expanded full authentication suite passed 49 groups, retaining the prior lifecycle, rolling-migration and LinkedIn-login coverage. The actual Workerd authentication fixture passed 28 requests, with 12 synthetic provider HTTP requests and no real provider/employer requests. The separate observational deep-review fixture executed eight groups, including the baseline migration check, without real HTTP dependencies.

Real consent/callback, provider-console permissions, actual ingress header sanitization, physical-device/accessibility acceptance and publishing integration remain separate. Neither passing synthetic cryptographic fixtures nor a blocked live request proves those gates complete. No unauthorized Auto Apply or real application submission was enabled by this review.
