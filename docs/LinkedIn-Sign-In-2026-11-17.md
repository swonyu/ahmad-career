# LinkedIn sign-in implementation — 2026-11-17

## Evidence and deployment boundary

This is an isolated development-source change based on the continuing Career Finder branch at evidence commit `949ce0ad327beab79fa7033423b462ebc7bd98be`, with the provider connection-generation and rolling-migration fixes already applied. It is not a new release or a change to hosted version 7. No provider credentials, live provider accounts, production database, employer integration, shared Mac build, signing material, store entry, or publishing-owned branch was modified by this implementation task.

The earlier source handled Google login and explicit LinkedIn linking. It deliberately did not handle `/auth/linkedin/start`, required Google for local browser sessions, and rejected a `linkedin` account method in the client/SSR contracts. The new source implements that missing direct sign-in path and preserves explicit linking.

## Account and email decisions

LinkedIn identifies the account by a validated OIDC issuer and subject. Career Finder looks up the owner by `(provider, subject)` and keeps the owner stable on a subsequent login. Email is never a key for account lookup or merging. Two LinkedIn subjects with the same email, or a Google subject with that email, create separate owners unless the owner deliberately linked the provider while signed in. A provider subject already linked to another owner cannot be transferred by a callback.

The official LinkedIn OIDC documentation says `email` and `email_verified` may be absent. Career Finder's existing application policy requires the signed-in account's email; this patch keeps that requirement. Direct LinkedIn login requests `openid profile email` and accepts an address only when the provider asserts `email_verified: true`, the address passes the existing bounded email shape, and it can be safely represented in the internal SSR header.

If the verified ID token has no usable verified email, the handler makes one bounded HTTPS request to LinkedIn's fixed userinfo endpoint. Its `sub` must exactly match the signed ID token's subject. A usable verified email from that response may complete login. If it is still absent, unverified or malformed, the callback returns the fixed `email_required` result and creates no account, identity link or browser session. The UI explains the working alternative: sign in using an available ChatGPT or Google option, then connect the basic LinkedIn profile from Account. It does not invent an applicant email.

Basic LinkedIn linking still requests only `openid profile`; it neither requests userinfo nor collects a new email. A later basic-scope link preserves an existing verified email for that same provider subject so it cannot silently invalidate a legitimate existing LinkedIn session. A fresh direct login still requires a freshly verified email, even for an existing linked owner.

## Architecture and security contract

- `GET /auth/linkedin/start?return_to=/phone` opens the official authorization endpoint as a top-level browser navigation. The existing safe return paths remain `/phone`, `/account`, and `/connect`.
- The confidential authorization-code exchange uses the configured server client secret. Google S256 PKCE remains unchanged. LinkedIn retains the existing confidential-server code flow instead of assuming undocumented provider PKCE support.
- Existing browser-bound state, transaction claim/replay prevention, nonce, RS256 signature, issuer, audience, authorized party, token-age and expiry checks apply to both providers. Provider-published cancellation results consume the transaction without a token exchange.
- Provider endpoints are fixed in source. The handler follows no provider redirects and accepts no callback, issuer, discovery or key URL from the browser or token. Every provider HTTP operation uses the existing six-second deadline, cancellation and streamed byte limits. Userinfo is capped at 16 KiB; token and JWKS caps remain 64 KiB and 128 KiB respectively. There is no new network fallback.
- Access tokens, refresh tokens and ID tokens are not stored or exported. The userinfo access token exists only during that callback. Browser cookies remain opaque, secure, HTTP-only, same-site cookies, with only token hashes stored in D1.
- Cookie resolution, link start, disconnect and workspace creation now apply the same session/lifecycle checks to Google and LinkedIn. Revoked or expired local cookies never reveal a background ChatGPT account. Provider I/O is followed by another identity check, and atomic lifecycle/deletion guards prevent late callbacks from restoring erased owners.
- An original or currently used provider cannot be disconnected. Other disconnects still require the displayed connection generation. Existing connection-generation migration and rolling-worker compatibility tests were retained without modifying their migration.
- The account method union is now `chatgpt | google | linkedin`. Provider status adds `signInSupported`; the client defaults missing values to `false` so an older basic-link backend does not advertise direct LinkedIn login. `configured` means a well-formed client ID/secret and database are present. Neither field proves external consent, email permission, or a real callback.

## Provider setup and integration steps

1. Use the intended LinkedIn developer application and obtain its **Sign in with LinkedIn using OpenID Connect** product/scopes. Confirm that `openid`, `profile` and `email` are available for direct login. Basic linking requests the first two only.
2. Register this exact HTTPS callback: `https://career-finder-service.jazzy-drake-8323.chatgpt.site/auth/linkedin/callback`.
3. Configure `CAREER_LINKEDIN_CLIENT_ID` and `CAREER_LINKEDIN_CLIENT_SECRET` using the existing server-secret mechanism. Never put a secret in client code, repository text, a redirect URL or test evidence. Google retains its separate `CAREER_GOOGLE_*` settings and `/auth/google/callback` URI.
4. Integrate the source with the coordinated Settings/sign-in UI. Show the direct provider option only when its status is both configured and supported. Integrate all pending lifecycle migration and frontend changes before considering deployment; this slice adds no migration or dependency.
5. Coordinate publishing ownership before live deployment. Use expressly authorized disposable accounts for real consent, callback, sign-out, account-switch, linked-owner recovery and deletion checks. Record actual provider grants and returned claim shapes without retaining codes or tokens. Check a same-email/different-subject pair remains separate, an explicitly linked provider returns the original owner, and an unavailable verified email produces the supported alternative.

These steps are requirements, not claims that portal configuration, real consent or deployment has happened. A development or Workerd fixture success cannot replace these checks. Auto Apply remains subject to its existing authorized-employer, exact-review and verified-receipt requirements; no real application was submitted.

## Verification at this checkpoint

All tests below ran in the isolated local copy. Provider HTTP in tests is synthetic with no outbound fallback. Browser-looking requests are programmatic; this is not physical-device, screen-reader, provider-consent or app-store acceptance.

| Check | Observed result |
| --- | --- |
| `node tests/hosted-auth.mjs` | 48 groups passed using actual isolated D1 and synthetic RS256 signatures. Includes all 39 pre-existing lifecycle/rolling-migration groups plus nine direct LinkedIn login, optional-email, isolation, cancellation and revocation groups. |
| `node tests/hosted-auth-worker.mjs` | 28 actual Workerd handler requests passed; 12 synthetic provider HTTP requests; zero real provider or employer requests. Exercises LinkedIn userinfo fallback, SSR method, background-account isolation, sign-out, sole-login protection and no-email failure. |
| `node tests/hosted-applications.mjs` | 63 groups passed with isolated D1/R2; 12 synthetic employer application POSTs; zero real employer requests. Added LinkedIn workspace/export/deletion isolation and revocation during delayed pairing/open. Existing signed-in-email and review safeguards still pass. |
| `node --test tests/phone-model.mjs` | 17 tests passed, including the new method/capability contract and LinkedIn-only `email_required` parsing. |
| TypeScript | `tsc --noEmit --incremental false` passed. |
| Targeted ESLint | `app/chatgpt-auth.ts`, `app/components/provider-auth.ts`, and `app/components/OAuthFeedback.tsx` passed. |
| Independent source critique | A separate agent reviewed optional email, subject ownership and lifecycle/session parity and reported no concrete blocker. It did not perform real provider consent or additional runtime tests. |

Remaining acceptance: integration with the current redesign, full integrated build/CI, real authorized provider grants and callbacks, account recovery in actual browser/device sessions, physical-device/accessibility acceptance, and publishing-owned release work. The hosted version remains distinct from this tested source candidate.

## Primary documentation consulted

- [LinkedIn: Sign in with LinkedIn using OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2) — scopes, issuer/endpoints, optional email claims and subject identity.
- [LinkedIn: Authorization Code Flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow) — confidential server exchange, registered redirect and cancellation behavior.

The implementation followed the official pages read during this task on 2026-11-17. It makes no claim that LinkedIn sign-in establishes a user's legal identity.
