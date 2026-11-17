# Career Finder continuation — implementation and publishing handoff

**Status: an isolated source candidate with implemented fixes and scoped evidence. It is not a release-readiness, live-provider, physical-device or store acceptance certificate.**

This handoff records the continuation after evidence commit `949ce0ad327beab79fa7033423b462ebc7bd98be`. It explains the implementation, verified critiques, setup, migration and rollout requirements, and remaining blockers. The final candidate commit/tree, terminal integrated build/CI receipts and any later deployment must be added by the integration owner. Native bilingual resource work and additional RTL checks were still in progress when this document was prepared.

The prior [publishing handoff](Publishing-Handoff-2026-11-17.md), [owner acceptance](Owner-Acceptance-2026-11-17.md), and [continuation review](Continuation-Review-2026-11-17.md) were the starting instructions. Their dated evidence is preserved. Where a prior document describes an older provider configuration, four-section UI or English-only interface, the candidate implementation below is a later source state; it does not retroactively change the deployed v7 state.

## 1. Version, ownership and time boundaries

| Boundary | Recorded identity | Meaning |
| --- | --- | --- |
| Development evidence at takeover | Branch `career-finder-phones-verified-apply-20261116`; commit `949ce0ad327beab79fa7033423b462ebc7bd98be` | Starting evidence/documentation checkpoint. |
| Historical tested application | `e66d1809ece7666c7d99412d48aa193cdf024c42`; application tree `2bbffcaa056fa08b2cdea9da7b9426cac8476fc0` | [CI run 44030852040](https://github.com/swonyu/ahmad-career/actions/runs/44030852040) passed all five historical gates, including 99 Android and 13 iPhone UI cases. These results do not test later edits. |
| Last identified public hosted site | **Version 7**, source `1135a3270435d3719c6f62f1a2e3a53e2c040146`; deployment `appgdep_6afbcfe3a03881918b131992225ded31` | The recorded live baseline at `/phone`. Its deployment is separate from current source and later saved configuration. |
| Isolated continuation | Local branch `continuation/account-acceptance-20261117`, created from `949ce0a`; final candidate commit/tree pending | Current source work and source-specific tests. Do not describe the starting HEAD as the commit containing uncommitted changes. |
| Managed provider configuration | Google keys saved privately in **revision 1** | Configuration receipt says no deployment with revision 1 and no verified real callback. A saved secret is not runtime activation. |
| Publishing-owned branch | `app-store/career-workspace-copy-20261117`, last identified head `fd9c5399f2b7001b234b3b86bf72e2b36b5114c1` | Separate ownership, signing and store history. Recheck the remote head before integrating. |
| Native theme/language work | Theme/settings/icon candidate changes; bilingual resources and acceptance being finalized | No new native runtime or signed-install result is established by this document. |

The [takeover receipt](strict-review-evidence/continuation-2026-11-17-cloud/takeover.json) records an inherited checkout with no tracked changes and three existing untracked evidence files whose hashes were preserved. At that observation there were no queued/in-progress GitHub runs. A separate Streamio-owned simulator run was observed on the shared Mac. No competing Career Finder shared build was started. An absent `/tmp/dot-ios-build.lock` did not reserve the machine.

The publishing conversation could not be opened through the available browser route because host-access policy rejected navigation before page access. The earlier handoff was also not confirmed delivered. Work therefore continued in an isolated cloud checkout with separate file ownership. This continuation did not merge the release branch, change shared signing, upload to a store or perform a live hosted deployment. Authorized Google project/client setup and private configuration storage are separately recorded external changes, described in section 5.

### Original work allocation — no restarted clock

The recovered original request was at **2026-11-16T22:26:12Z**. The assistant accepted it at **22:26:26Z** as **24 hours of active implementation and testing**, with external reviews separate. The recovery source is linked in the takeover receipt.

The calculated elapsed-time checkpoint is **2026-11-17T22:26:12Z**. It is not an explicitly agreed deadline and must not be presented as one. No complete trustworthy active-work ledger was recovered. Therefore **actual active hours remaining are unknown**; elapsed wall time cannot supply the missing active-work total. No fresh 24-hour clock was started. External provider/domain decisions, unavailable physical devices and store review remain blockers regardless of the engineering allocation.

## 2. Actual architecture and data boundaries

The authoritative hosted source is under [hosted/](../hosted/). Its entrypoint, [worker/index.ts](../hosted/worker/index.ts), directly imports production handlers. Request fields and environment settings cannot switch the production endpoint to a synthetic provider adapter. Tests construct separate handlers with injected synthetic transport.

| Layer | Implementation | Responsibility and boundary |
| --- | --- | --- |
| Hosted rendering | React/Vinext application in `hosted/app`; generated Worker build | `/phone`, `/connect`, `/account`, `/support`, `/privacy`, current display language and appearance. SSR receives only resolved identity through internal headers. |
| Provider authentication | [oauth.mjs](../hosted/server/oauth.mjs), [identity.mjs](../hosted/server/identity.mjs), client [provider-auth.ts](../hosted/app/components/provider-auth.ts) | Browser-bound authorization transactions, provider claim validation, explicit identity linking, opaque local sessions and lifecycle checks. |
| Browser account/workspace API | [applications.mjs](../hosted/server/applications.mjs), `/api/account*`, `/api/phone/*` | Exact Origin/JSON checks, reviewed account/workspace targets, profiles, PDFs, export/deletion and immutable application approval. A native bearer token does not authenticate browser routes. |
| Native service API | `/api/apply/*` and existing native clients | One-use pairing followed by an independent hashed bearer credential. Phone sessions expire after 30 days; connection codes after five minutes. Connecting does not upload the existing local draft. |
| Public discovery | [discovery.mjs](../hosted/server/discovery.mjs) | Public GET-only Greenhouse/Lever board discovery, bounded cache and rate counters. Does not read an applicant profile, account cookie, CV or application token. |
| Durable service storage | [db/schema.ts](../hosted/db/schema.ts), [drizzle/](../hosted/drizzle/) | D1 metadata, identities, sessions, workspaces, revisions, review snapshots, attempts and guards. Private R2 holds PDF bytes. The existing hosting bindings are `DB` and `BUCKET`. |
| Browser-local workspace | [vault.ts](../hosted/app/phone/vault.ts), [safety.ts](../hosted/app/phone/safety.ts), [PhoneApp.tsx](../hosted/app/phone/PhoneApp.tsx) | Separate encrypted guest/account/workspace drafts, private records, recovery copies and durable Stop intent. User-chosen online save is separate from local preparation. |
| Existing companion service | [website/applications/](../website/applications/) | Separate Node/SQLite implementation and synthetic test fixtures. Its capabilities are not inferred from the hosted implementation. |

The Worker strips caller-supplied `x-career-*` headers before routing and injects verified SSR identity itself. ChatGPT identity depends on the hosting ingress owning and sanitizing `oai-authenticated-*` headers. A standalone fixture supplied with trusted ingress headers is not proof of the public platform boundary. This continuation's authorized anonymous status probe received HTTP 403 and stopped before attempting a synthetic identity-header request; that probe did not verify deployed ingress behavior. Earlier v7 forged-header receipts remain historical observations of their stated requests.

The browser vault uses authenticated encrypted storage and non-exportable browser keys, plus atomic expected-revision checks. It does not promise protection against an unlocked browser or code executing on the same origin. A clear/reset leaves a content-free revision marker so an old tab cannot restore erased data. Stop locks are separate from personal draft deletion so clearing a draft does not revive earlier approval. Recovery exports may still require the original browser key; readable browser exports are records for the user and currently have no automatic browser import path.

Existing native account/record scopes, application IDs, signing identities and internal storage names are preserved. Public branding is Career Finder; changing a legacy package identifier merely to remove an old personal-looking internal name would risk upgrade/data compatibility and was not used as an account-isolation fix. The demonstrated wrong-account display issue was an unconfirmed SSR identity path, corrected as described below.

## 3. Provider identity, sessions and migration

### Identity and email policy

The provider key is the validated **provider plus subject**, never matching email. A subject with no existing link receives a random `career-` owner identifier. An explicitly linked identity returns its existing owner. Two distinct subjects with identical email remain distinct owners unless the current owner deliberately links a method. A callback cannot transfer an identity already assigned to another owner.

Google direct login/link uses `openid email profile`. The candidate adds actual direct LinkedIn login at `/auth/linkedin/start`, alongside its existing basic linking path. Direct LinkedIn login requests `openid profile email`. LinkedIn may omit `email` or `email_verified`; Career Finder's application policy nevertheless requires a usable provider-reported verified account email for direct login. If the validated ID token lacks one, the handler makes at most one bounded request to LinkedIn's fixed UserInfo endpoint and accepts its email only when `sub` exactly matches the signed token. If verification remains unavailable, `email_required` creates no new account, identity or browser session. The UI offers an available ChatGPT/Google method followed by basic linking. It does not manufacture an applicant email or loosen the signed-in-email submission rule.

Basic LinkedIn linking requests only `openid profile`, does not call UserInfo to obtain a new email, and can preserve a verified email previously obtained for that same identity. A later direct login still needs fresh verified-email evidence. Provider verification is not independent proof of current mailbox ownership, legal identity or qualifications. See [LinkedIn implementation](LinkedIn-Sign-In-2026-11-17.md) and [research audit](Research-Audit-2026-11-17.md).

### Callback and request fences

Authorization transactions bind random state, nonce and browser tokens to the intended provider, action and account; they expire in ten minutes and are claimed once. The allowed return routes remain `/phone`, `/account` and `/connect`. Signature, issuer, audience, authorized party, nonce, required claims, token age and expiry are checked. The subject must use bounded printable ASCII before hashing or D1 binding. Names and ordinary Arabic/international profile text are not restricted to ASCII.

Google retains S256 PKCE. LinkedIn uses its documented confidential server code flow; undocumented PKCE support is not invented. Provider hosts/endpoints are fixed, redirects are refused, and each operation has a six-second deadline with streamed response limits: token 64 KiB, JWKS 128 KiB and UserInfo 16 KiB. Access, refresh and ID tokens are not persisted or exported.

Local browser sessions use opaque 256-bit secrets, with hashes in D1 and `__Host-` cookies using Secure, HttpOnly, Path=/ and SameSite=Lax. The local session lifetime is seven days, subject to server revocation and account/provider joins. An invalid or expired Career Finder cookie does not fall through into a different background ChatGPT account. Local sign-out, local provider unlinking and revoking a provider's own permission grant are different actions; removing the provider grant remains available through that provider's settings.

Three distinct generations matter:

1. The **account generation** binds sessions and account-owned transactions to the current auth account.
2. The **owner lifecycle generation**, backed by a private keyed hash and deletion timestamp, fences delayed work across deletion/recreation even when rows are absent or a new account is created.
3. The **connection generation** identifies the exact linked provider instance the user confirmed. Removing and relinking the same provider subject produces a new generation.

Provider I/O is followed by another authority check. SQL predicates retain the target identity until guarded writes finish and bind the session, owner lifecycle and expected connection. An originally used or currently used provider cannot be removed through ordinary unlink; that is an intentional conservative recovery limitation. A basic LinkedIn link without a verified direct-login email does not establish an available alternate login. Deleting the Career Finder account remains a distinct explicit action.

### Additive migration 0004

[0004_provider_connection_generation.sql](../hosted/drizzle/0004_provider_connection_generation.sql) adds non-null `connection_id` to `auth_identities`. It installs an AFTER INSERT trigger **before** backfilling existing empty values with opaque 64-hex generations. An older in-flight worker INSERT that omits the field is covered; metadata-only UPSERTs retain the existing generation. Deleting and recreating a link receives a new one. Existing accounts, links and active sessions are preserved. Schema, migration journal and snapshot are included.

Status exposes `connectionId` for a connected provider. Disconnect requires `{provider, expectedAccountId, expectedConnectionId}`. Old/missing confirmation data fails safely and requires refreshed status; it cannot authorize removal of a replacement link. The frontend captures provider, generation and auth revision when confirmation opens, invalidates on revalidation/unmount, aborts obsolete requests, and checks service state before presenting success.

Migration tests cover existing-row backfill, old-style INSERT/UPSERT/recreation and actual D1 transactional rollback. The trigger supplies transition compatibility; it does **not** turn an older worker's unlink implementation into the new guarded implementation. Complete server/client rollout and drain old code before accepting the new invariant. No live migration was applied by this continuation.

## 4. PDF validation and private recovery

The earlier browser handler accepted a file largely from its `%PDF-` prefix, replaced the prior local résumé and displayed “PDF checked,” while the bounded server parser could reject it later. The candidate shares [pdf-readability.mjs](../hosted/shared/pdf-readability.mjs) between the server adapter and a real browser module worker. It validates supported document structure before changing the current draft.

| Bound | Enforced limit |
| --- | --- |
| Input PDF | 5 MiB, with bounded filename and supported header/structure |
| Parsed objects | 20,000 |
| Expanded stream data | 16 MiB total |
| Pages | 500 |
| Structural nesting | 64 |
| Parser deadline | 3 seconds |
| Browser worker deadline | 6 seconds, plus termination on cancellation/error/completion |

The server uses capped zlib inflation; the browser uses chunk-bounded `DecompressionStream("deflate")` inside [pdf-validation.worker.ts](../hosted/app/phone/pdf-validation.worker.ts). Unsupported capabilities fail with actionable copy and preserve the old file. There is no unbounded parser fallback. [pdf.ts](../hosted/app/phone/pdf.ts) terminates the worker on every settled result and validates its page count. Hashing/base64 conversion follow successful parsing; cancellation and current account/workspace generation are checked around asynchronous steps. Server validation remains required after a browser pass. Structural readability is not a guarantee of visual correctness, truthful content or universal PDF support.

A separate recovery defect was reproduced: a delayed original-owner recovery response could export or reopen quarantined edits after newer identity revalidation. The corrected recovery path captures generation, treats unverified identity as a stop condition and checks authority after every asynchronous boundary before exporting or restoring private data. Failure retains the original draft. Normal recovery still works after the original owner is confirmed.

### Actual browser worker acceptance

The [PDF browser receipt](strict-review-evidence/continuation-2026-11-17-cloud/pdf-browser-acceptance.json) records eight actual Cloud Chrome file-picker scenarios using the real browser PDF client, emitted Vite module worker, shared parser and extracted actual handler. The fixture uses only synthetic memory state and no auth, persistence or external requests; an existing unrelated guest draft was left untouched.

Readable one-page and two-page object-stream PDFs passed. Malformed, truncated, encrypted and cyclic documents preserved the prior valid CV. Cancellation after real worker dispatch and synthetic identity invalidation after a valid worker result also preserved it. Eight workers started, eight were terminated, and none remained active. [Source hashes](strict-review-evidence/continuation-2026-11-17-cloud/pdf-browser-source-manifest.json) identify the exact tested files.

One CSP `script-src`/`eval` violation was retained in the receipt. Inspection traced it to Zod's caught feature-detection `new Function` probe, reached through the actual model import. The strict fixture CSP was not loosened; the PDF worker still executed its bounded path. This observation is not silently relabeled as a clean zero-violation CSP run.

The fixture builder lives in [tests/build-pdf-browser.mjs](../hosted/tests/build-pdf-browser.mjs). Its source template is outside production routes, and generated output must be outside the hosted tree. The template was renamed to `.template.ts.txt` so intentionally generated imports do not enter normal production typechecking. Production TypeScript validation was not weakened to accommodate the fixture.

## 5. Actual provider setup and working alternatives

### Google — configuration saved, activation still unverified

The latest [redacted Google setup receipt](strict-review-evidence/continuation-2026-11-17-cloud/google-provider-configuration.json), recorded `2026-11-17T09:03:58.171857+00:00`, supersedes the earlier empty-configuration checkpoint for **stored configuration**, not for deployment.

- Dedicated project: `career-finder-515007`; enabled web client: **Career Finder web sign-in**.
- Exact redirect: `https://career-finder-service.jazzy-drake-8323.chatgpt.site/auth/google/callback`; no JavaScript origin was added for this server code flow.
- Basic OpenID/email/profile scopes are saved, with no sensitive/restricted scopes recorded.
- Audience is **External**, publishing status **Testing**. One existing owner test user was visible; no second test identity was added or recorded publicly. A duplicate/ineligible save dialog is retained as an observation.
- Home page, privacy URL and authorized-domain entry were saved. Console branding completion does not prove production domain/brand verification.
- `CAREER_GOOGLE_CLIENT_ID` and `CAREER_GOOGLE_CLIENT_SECRET` are stored through the private server configuration mechanism, revision 1. Their values are absent from evidence, Git, screenshots and native binaries.
- No billing account or paid service was enabled. **No deployment with revision 1 and no real consent/callback verification are recorded.**

A compatible deployment must be coordinated and separately observed before testing real activation. Do not turn `configured:true`, a console screenshot or successful private secret storage into a claim of real account acceptance.

### LinkedIn — source implemented, external setup incomplete

Direct login and basic linking are implemented and synthetically tested. There is no current receipt establishing completion of an authorized LinkedIn app, its accurate publisher-Page association, the OIDC product/scopes, saved runtime credentials and a real callback. The earlier app-creation form was incomplete; it did not establish an app or approval. Use the exact callback `https://career-finder-service.jazzy-drake-8323.chatgpt.site/auth/linkedin/callback` after authorized setup.

The OIDC product is separate from LinkedIn employer/talent integrations. A profile URL, basic identity link or login grant does not permit automatic LinkedIn applications, résumé import or private scraping. Public shared-domain eligibility and provider review remain evidence gates, not guessed approvals. No paid domain, subscription or account enrollment may be purchased to bypass them.

### Free paths that already work within their scope

The recorded v7 browser service, available ChatGPT sign-in with its Google option, public selected-board discovery, saved LinkedIn profile/search links, manual employer pages, private local records and exports remain usable alternatives. Direct LinkedIn users without a verified email can use an available existing sign-in method and then link a basic profile when the configured service supports it. These alternatives do not claim the blocked direct-provider acceptance has passed.

Live Auto Apply stays unavailable without an employer-authorized integration and current reviewed requirements. No real employer test applications were sent. A valid live receipt and nonempty application identifier are required for actual submission confirmation; opening a page, saving a job, changing a local stage or passing a synthetic POST test cannot create that confirmation.

## 6. Redesign, appearance, icon and bilingual implementation

The candidate browser has **Search, Saved, Apply, Profile and Settings**, with a header Settings entry and responsive navigation. Settings separates public display preferences from private account controls. An initially rendered account is not treated as current authority after a failed live check. Identity revalidation hides private content while preserving unsaved forms for their original owner.

The visual direction uses slate/indigo/neutral surfaces and System/Light/Dark choices, with semantic foreground, muted text, control boundary, focus and action roles. Early theme initialization accepts only recognized display preferences; blocked persistence applies the choice for the current visit and reports the limit. The native theme/settings candidate follows the same direction without replacing app IDs or data stores. Physical native appearance and launcher checks remain open.

The new icon is a generated bitmap with retained provenance and platform-specific padding, not an assertion of a mathematically exact three-color vector. [Asset verification](branding/2026-11-17-indigo/qa/asset-verification.json) records 23 opaque derived images, RGB PNGs, opaque ICO frames, matching Apple catalog filenames and parsed Android XML. Dedicated PWA maskable and Android adaptive variants passed the recorded safe-area geometry checks. [Critical review](branding/2026-11-17-indigo/qa/critical-review.json) preserves palette, small-size, mask and integration critiques. These are static/visual asset checks; they do not establish a store upload, physical launcher rendering or installed-PWA icon refresh.

Google sign-in uses a locally bundled official logo asset without recoloring or distortion and live localized HTML text; the asset/font hashes and font license are in the [Google artwork receipt](branding/2026-11-17-indigo/google-signin-assets.json). Neither a custom icon nor the application's general palette is used to imitate an unofficial Google approval badge.

### Language boundaries

The web implementation is in [app/i18n/](../hosted/app/i18n/), with [LanguageSettings](../hosted/app/components/LanguageSettings.tsx). The current integration checkpoint has **1,272 catalog keys**; this is a source-count checkpoint, not proof that every future string or screen is localized. The original screen work supplied 877 translated entries with 10 explicit CSS/machine exclusions; backend/error copy and subsequent control/status strings were merged separately.

English, Arabic and device preference are explicit display choices. Server negotiation and client state use the dedicated language cookie/storage key, with an en/ar/system whitelist. Locale updates the existing component tree and page `lang`/`dir`; it does not reload or key-remount a workspace, alter identity, translate stored profile text, change a country/work-mode/stage wire code, substitute a PDF or grant application approval. Inserted names and addresses are isolated for bidirectional display. Counts have Arabic plural handling, and display dates use the Gregorian calendar. Original employer postings, names, CVs and user writing remain original.

The translator now uses own-property string lookup and bounded forward-only template matching ordered by specificity. Captured dynamic bytes retain whitespace and are substituted only once. Unknown keys safely fall back. App-owned status messages may be localized; arbitrary employer or user text must not be passed through a translator. The exact `DELETE` confirmation remains literal even though the deletion-section heading is translated.

Native bilingual work was still being assembled in a separate owner lane. Its source design preserves Swift StateObjects and Android ViewModel/saveable state, uses separate display preferences, supports ordered device-language fallback and retains original unknown-error details. Raw employer title/location paths and composite labels were independently reviewed and sent to the native owner. Do not treat that source review or translated resource count as a compiled or physical-device result. Further Arabic fragment, date, narrow-layout, font and screen-reader checks remain required on final integrated source.

## 7. Strict critiques and observed corrections

| Finding | Before | Implemented correction and evidence scope |
| --- | --- | --- |
| Delayed provider disconnect | A request could retain stale owner/link authority across deletion/recreation or a same-subject replacement. | Atomic session/lifecycle/connection predicates plus opaque per-link generation; regressions include stale owner, stale replacement, revoked session, legitimate unlink and login protection. [Auth source/tests](../hosted/tests/hosted-auth.mjs). |
| Stale provider UI intent | A pending connect/disconnect could outlive unmount, revalidation or an account change. | Captured auth revision and connection ID, cancellation and verified post-disconnect status. Four actual React/browser synthetic scenarios passed in the [provider receipt](strict-review-evidence/continuation-2026-11-17-cloud/provider-browser-acceptance.json). |
| Quarantined recovery race | A delayed recovery could export/restore after newer account verification began. | Generation and unverified-identity checks around asynchronous boundaries, retaining original edits on failure. Focused source regressions and actual handler checks remain distinct from real-owner acceptance. |
| Prefix-only browser PDF acceptance | A malformed or protected file could replace the good local CV before server rejection. | Shared bounded parser plus real worker, feature detection and cancellation; eight browser picker scenarios described above. |
| Unconfirmed Settings identity | After initial workspace/status 401, stale SSR account details/tools could be shown before any successful current confirmation. | Private Settings requires confirmed matching authority; public appearance/retry controls remain. Synthetic actual React before/after receipt confirms stale details disappear. |
| Enlarged text/navigation | A focused control at 320 CSS px with 200% root text was partly covered by fixed navigation; appearance descriptions crossed cards. | Measured navigation inset/focus clearance and responsive choice layout. The recorded 51.8125 px overlap became 18.1875 px clearance; appearance cards had no overflow. This was not claimed as an entire-hide WCAG AA failure. |
| Dialog focus/reflow | Close left focus on BODY; narrow enlarged-text dialog content was unnecessarily constrained. | Stable dialog lifecycle/focus restoration and wider usable viewport. Close/Escape returned focus to the opener; the recorded after dialog had 279 px client and scroll widths. |
| Nonconforming OIDC subject alias | Two different synthetic signed lone-surrogate subjects reached the same owner through UTF-8/D1 conversion. | Reject non-ASCII subjects before storage. Baseline regression failed, corrected auth 49 groups and Workerd 28 requests passed. No real provider-issued malformed-token exploit is claimed. |
| Translation lookup/matching | Inherited keys threw; a broad template beat a specific one; normalized fallback changed captured whitespace. | Own-key lookup, specificity ordering, original-text matching and nonrecursive parameter isolation; independent 10 checks and the later focused integrated 22-test checkpoint passed. |
| Icon masking and provenance | An ordinary icon exceeded stricter mask-safe geometry; new assets alone did not update selectors. | Dedicated padding variants, exact file manifest and explicit integration; static asset results remain separate from installed/launcher behavior. |

The [identity/accessibility receipt](strict-review-evidence/continuation-2026-11-17-cloud/identity-accessibility/receipt.json) includes source manifests, screenshots, measurements and limits. It used synthetic actual React/CSS in Linux Chrome. Its200% root-text stress test is not native browser zoom, and it is not VoiceOver/TalkBack or physical-phone acceptance. Historical v7 zoom receipts remain separately named. No document should add these scoped observations together and call them a full accessibility conformance result.

## 8. Verification ledger and evidence locations

| Checkpoint | Result actually established | Durable pointer / limitation |
| --- | --- | --- |
| Historical complete CI | Five gates, 99 Android/13 iPhone UI at e66d180 | [Complete exact-source receipt](strict-review-evidence/ci-44030852040/complete-source-acceptance.json); never reuse its counts as candidate results. |
| LinkedIn implementation slice | Auth 48 groups, actual Workerd 28 requests, application 63 groups and phone model 17 tests | [LinkedIn implementation verification](LinkedIn-Sign-In-2026-11-17.md). All provider/employer HTTP synthetic; no real consent. |
| Later ASCII-subject hardening | Auth 49 groups and actual Workerd 28 requests | [Independent auth review](Auth-Deep-Review-2026-11-17.md). This supersedes the auth count for that later source; it is not an additional disjoint 48-test pass. |
| Provider UI fixture | Four browser scenarios passed | [Receipt](strict-review-evidence/continuation-2026-11-17-cloud/provider-browser-acceptance.json), [source manifest](strict-review-evidence/continuation-2026-11-17-cloud/provider-browser-source-manifest.json). |
| Browser PDF fixture | Eight selection/cancellation/account-invalidation scenarios; 8 workers started/terminated | [Receipt](strict-review-evidence/continuation-2026-11-17-cloud/pdf-browser-acceptance.json), [source manifest](strict-review-evidence/continuation-2026-11-17-cloud/pdf-browser-source-manifest.json). Memory-only synthetic state. |
| Identity/accessibility fixture | Reproduced privacy/reflow/focus findings corrected in the tested English candidate | [Receipt](strict-review-evidence/continuation-2026-11-17-cloud/identity-accessibility/receipt.json), linked before/after files. Later RTL edits need matching evidence. |
| Focused current web checkpoint | **22 tests passed, 0 failed** | `hosted/tests/i18n.mjs`, `phone-settings-privacy.mjs`, `phone-navigation-inset.mjs`, `web-experience.mjs`; terminal local log `/workspace/scratch/5bc6158967e8/web-i18n-focus-tests.log`. Archive the log and final source hashes at freeze. |
| Integrated full suite/build | **Pending terminal source-bound receipt** | A running log or an earlier pre-redesign build is not a final integrated pass. |
| New native CI and signed installs | **Not established here** | Resources/source still changing; require final workflow, artifact and device receipts. |
| Real provider/disposable acceptance | **Not completed** | Google configuration receipt explicitly says callback/deployment unverified; LinkedIn external activation remains open. |

The primary-source review is [Research-Audit-2026-11-17.md](Research-Audit-2026-11-17.md). It distinguishes official OIDC/OAuth rules, provider setup, account deletion, WCAG criteria and store requirements from implemented behavior and remaining runtime proof. The later Google branding observation in section 5 supersedes that research document's earlier setup checkpoint only where the new receipt says so.

### Required final freeze record

Before presenting the integrated candidate as tested, fill in all of the following with observed values, without replacing historical records:

- Candidate commit SHA, tree SHA, branch and relevant source-manifest hashes.
- Terminal local full-suite, typecheck, lint, build and locked-dependency audit results; preserve any failing attempts and fixes.
- Exact `.github/workflows/phone-quality.yml` run and the current jobs: **Service and synthetic HTTPS**, **Hosted HTTPS service and durable storage**, **Android compile, lint and native acceptance**, **iPhone logic and unsigned build**, **iPhone native interface acceptance**. Use each new run's actual case counts, not 99/13 by assumption.
- Artifact size/digest, application ID, version/build and signing identity for any installable native result.
- Separate managed source version, configuration revision, migration application and terminal deployment receipt for any hosted publication.
- Owner acknowledgment, device/account acceptance and unresolved gates. A passing build alone closes none of these external gates.

## 9. Local setup and safe validation

Use a clearly owned isolated checkout of the selected source. Preserve the inherited checkout, existing untracked evidence and other owners' processes. The pinned package lock is authoritative; do not silently upgrade dependencies while reproducing results. Node 24 is the documented working line, with `package.json` requiring at least 22.13.0. See [hosted README](../hosted/README.md) and the [workflow](../.github/workflows/phone-quality.yml).

From the repository root:

```sh
cd hosted
npm ci
npm run typecheck
npx eslint app worker --max-warnings 0
npm test
node tests/hosted-worker.mjs
node --test tests/browser-api.mjs tests/browser-pairing.mjs
npm run build
npm audit --json --fetch-retries=0 --fetch-timeout=30000
```

Run these against the final selected source and retain terminal results. If package/network access is denied, report that limitation or use an already validated lock-matching installation; do not bypass access controls or claim an unrun audit passed. The production entrypoint has no fixture fallback. Browser fixtures in `hosted/tests/fixtures/` are test-only and must build outside production output. Use a new synthetic test surface instead of erasing an existing localhost draft whose provenance is unknown.

The existing hosting manifest identifies the dedicated Career Finder Site and `DB`/`BUCKET` bindings. Preserve that Site identity and the exact native service origin. Schema generation is `npm run db:generate`; do not regenerate or rewrite published migrations during release. The candidate adds 0004 to the committed ordered history. Native build commands, required JDK/SDK/Xcode and test schemes are retained in the root README and workflow. Do not execute a shared Mac build until the publishing owner acknowledges the schedule; a free hosted CI runner's result remains distinct from signing and physical installation.

## 10. Rollout sequence

These are required future actions, not an assertion they occurred.

1. **Reconfirm ownership and source.** Read current remote branch heads, session activity, locks, processes and uncommitted changes. Obtain the publishing owner's acknowledgment for release/shared-device work. Preserve all unrelated work. Freeze a reviewable isolated candidate and record its commit/tree before testing.
2. **Close integrated source gates.** Finish native bilingual resources and RTL/status corrections. Run relevant tests, then the complete required workflow on that exact source. Preserve failures, fix concrete causes and rerun affected gates. The current focused 22-test result and prior 99/13 milestone cannot stand in for this step.
3. **Prepare an authorized data-preserving deployment.** Select the existing Site/project and actual target database/bucket. Retain the existing recovery/backup procedure and rollback source. Review the migration diff, private configuration key names and output archive; never put secret values or real private account data in logs/evidence.
4. **Apply the ordered managed migration history.** Apply 0004 once through the platform's migration mechanism, with its trigger preceding backfill. Verify the column/trigger and nonempty existing connection generations without exporting identities. Do not drop identity/session rows or overwrite migration history. Drain older worker code; the database trigger alone does not fix older unlink logic.
5. **Deploy a coherent server/client archive.** Keep the Site identity/audience, production handler, bindings and origin. Publish the compatible API/status/disconnect contract, client UI and emitted PDF module worker together. Associate the intended private configuration revision. Record saved source version and terminal deployment separately. Do not call a GitHub push or saved version a successful deployment.
6. **Smoke-check the deployed boundary.** Confirm health, schema, static assets/worker URLs, no accidental test routes, actual provider status and expected failure behavior. Use only authorized synthetic data/account scenarios. Verify missing/stale connection generations fail safely and old invalid cookies do not reveal another account. Keep live employer dispatch disabled.
7. **Complete real provider consent.** Use the authorized test user in Google Testing, observe success, denial, wrong-browser/expired/replayed callback handling, linking, unlinking where allowed and sign-out. Complete LinkedIn app/product setup and equivalent consent checks, including missing verified email. Record outcomes without codes/tokens. Public provider verification remains a separate external gate.
8. **Complete disposable-account and device acceptance.** Follow section 11 and the owner acceptance document. Confirm preservation before deletion, use synthetic records, and record exact browser/device/build. Do not use the user's current private workspace as a destructive test fixture.
9. **Integrate with publishing-owned history.** Preserve the release-only wording commits and current safeguards; do not replace newer files wholesale from the older branch. See [Release-Integration-Checklist](Release-Integration-Checklist-2026-11-17.md). Test the integrated source and preserve signing/upgrade compatibility before upload.
10. **Record actual release outcomes.** A signed artifact, successful upload, store processing, approval, TestFlight availability and public store release are different events. Update the handoff only for observed events, with receipt and exact revision. No external approval date is promised.

If rollout fails, stop new publication/activation and retain data and receipts. Prefer a reviewed forward correction. A code rollback must be tested against the additive schema and current sessions/capabilities; do not “rollback” by deleting links, generations, sessions or user files. Older server/client combinations may intentionally disable unsupported direct login or stale disconnect rather than silently accepting an unsafe request. Revalidate the retained release artifact before using it.

## 11. Remaining blockers, acceptance and useful workarounds

| Gate | Current evidence / blocker | Required closure and working alternative |
| --- | --- | --- |
| Complete active-work accounting | Original 24 active-hour acceptance recovered, complete ledger absent | Report active remainder unknown; retain original request and calculated checkpoint. Do not restart the clock. |
| Final integrated source/build/CI | Candidate still changing; focused passes available | Freeze exact source, retain terminal full gate receipts and actual new counts. Continue isolated source work while waiting. |
| Google runtime activation | Client/branding/private revision 1 saved; no matching deployment or callback | Coordinated deployment plus real owner-consent checks; existing ChatGPT sign-in remains available. |
| LinkedIn activation | No receipt proves completed app/publisher/product/secret/consent setup | Accurate authorized publisher association and OIDC provisioning; saved profile/search links remain separate useful features. |
| Production provider/domain verification | Testing configuration is not public production approval | Record actual provider decision and supported audience; no paid domain or subscription workaround. |
| Real account isolation/recovery | D1/Worker and synthetic browser tests pass within stated scope | Authorized disposable A/B browser and device checks, including expiry, unlink/relink and delete/recreate. Keep current real workspace untouched. |
| Live ingress boundary | New anonymous probe denied with HTTP 403 before synthetic header check | Permitted deployed platform proof; do not bypass denial. Historical v7 checks retain only their original scope. |
| Physical accessibility/device operation | Linux synthetic browser, static assets and historical simulator evidence | Real iPhone/Android, VoiceOver/TalkBack, keyboard, text size, RTL, picker/background/restart and installed icon checks. |
| Dot/publishing receipt | Final handoff not confirmed received; shared-owner access unavailable | Durable repository handoff plus explicit acknowledgment of exact source. Continue isolated work until coordination exists. |
| Signing/store distribution | No new signed install/store receipt for this candidate | Publishing owner validates signing, upgrade path, actual privacy/login rules and store forms. Free browser service remains the alternative. |
| Live Auto Apply | No authorized employer integration for real dispatch | Keep disabled; manual employer applications and private records work. Never send real test applications to close an engineering gate. |

For disposable acceptance, use two expressly authorized accounts and synthetic names, notes and PDF fixtures. Preserve/export the selected account's records before any destructive step. Verify A → B → A while Account, Connect, provider confirmations and dirty editors are open, including visibility/back-forward restoration. A's metadata, pairing code, PDF, export and deletion targets must stay hidden or blocked while identity is unverified or belongs to B. Same-email/different-subject identities must remain separate; an explicitly linked method must recover the same owner.

Delete only the authorized disposable A after its current identity and target are confirmed. Verify A's former browser/phone credentials no longer retrieve its old records, B is unchanged, and delayed provider/upload responses cannot recreate A's old records. A deliberate new login may create a new blank owner; that is not recovery of the deleted workspace. Confirm local drafts, user-exported files, employer-held applications and provider permission grants retain their separately explained behavior. Do not claim downloaded files vanished remotely.

On physical devices, include Arabic and English, light/dark/system, portrait/landscape, large system text, text enlargement and keyboard focus, long mixed-direction names/addresses, notes and actual PDF picker interruption. Record device/OS/browser, build/source and whether each check was physical, simulated or a fixture. Static contrast and root-font tests do not close screen-reader, platform permission or signed-install gates.

## 12. Dot / App Publishing handoff — delivery unconfirmed

**This document is the durable fallback; it is not evidence that Dot or the publishing owner received or accepted the handoff.** The final earlier handoff was rate-limited, and the current available route could not open the publishing conversation. No fresh acknowledgment or shared build reservation is claimed.

The publishing owner should receive the final candidate commit/tree, terminal test/artifact receipts, this migration/provider contract, the actual Google revision 1 receipt, the remaining real-account/device checklist and the unchanged live-v7 identity. Preserve release-only wording from `d17bd83a3e602bc2850444f3476bc4966a1e2b22` and `fd9c5399f2b7001b234b3b86bf72e2b36b5114c1` while retaining newer account/PDF/Stop guards. Recheck branch heads and the integration diff instead of relying on the takeover comparison.

Before shared Mac builds, signing changes or release integration, obtain acknowledgment naming the exact incoming revision and build window. After integration, record the publishing-owned commit and test that source. Keep iPhone bundle `com.ahmadalayed.career`, Android production `com.saleh.careerfinder` and existing preview/acceptance separation. A fresh CI debug certificate is not evidence of upgrade compatibility with an installed historical preview; do not require uninstalling private data merely to test an update.

The final handoff remains open until that receipt is observed. All unclosed gates above must remain visible in release notes and completion reporting. No purchase, paid API, billing upgrade, new developer enrollment payment or automatic paid overage is authorized by this continuation.
