# Career Finder — owner acceptance steps

These are remaining **real account, provider, device, and publishing checks**, not completed test results. This revision describes the isolated November 17 candidate, including direct LinkedIn sign-in and the redesigned Settings screen. It does not establish that this candidate, its configuration, or its UI is deployed.

| Version or evidence | What it establishes |
| --- | --- |
| Hosted phone preview **v7**, source `1135a3270435d3719c6f62f1a2e3a53e2c040146` | Last identified live hosted baseline; do not assume it has the candidate's direct LinkedIn sign-in, Settings, new icon, or appearance controls. |
| Native source `e66d1809ece7666c7d99412d48aa193cdf024c42`, evidence commit `949ce0ad327beab79fa7033423b462ebc7bd98be` | Historical five-gate milestone, including 99 Android tests and 13 iPhone UI tests. These results do not validate the new candidate or physical phones. |
| Current isolated candidate | Provider, privacy, Settings, appearance and icon changes require source-specific build and acceptance evidence before release claims. |
| Publishing branch `app-store/career-workspace-copy-20261117`, last identified head `fd9c5399f2b7001b234b3b86bf72e2b36b5114c1` | Publishing owns this branch, shared signing, Mac builds, store records and integration. Its receipt of the earlier handoff has not been established. |

The [publishing handoff](Publishing-Handoff-2026-11-17.md) and [continuation ledger](Continuation-Review-2026-11-17.md) retain the historical evidence. Use the [release integration checklist](Release-Integration-Checklist-2026-11-17.md) and [research audit](Research-Audit-2026-11-17.md) for candidate-specific decisions and remaining gates.

Use accounts you own or whose owners have agreed to testing. Use disposable Career Finder workspaces with synthetic profiles and PDFs for deletion and account-switch checks. Keep the existing personal workspace and installed app data intact. No step requires submitting a test application to a real employer, purchasing a domain or service, or starting a new work-budget clock.

## 1. Complete and verify provider configuration

### LinkedIn: external provisioning remains separate from implementation

**Historical v7 continuation context:** the [official app-creation form](https://www.linkedin.com/developers/apps/new) was prepared with the following values. The logo chooser did not establish an uploaded logo, and the terms checkbox was left unchecked in that attempt. This is not a current observation of a submitted or approved LinkedIn app. Verify the actual portal state before proceeding.

| Field | Required value or action |
| --- | --- |
| App name | **Career Finder** |
| Privacy policy | `https://career-finder-service.jazzy-drake-8323.chatgpt.site/privacy`; deploy the candidate's accurate disclosure before offering its direct LinkedIn flow. |
| LinkedIn Page | Use the accurate publisher Page that the authorized owner may associate with the app. Treat the association as permanent. |
| Logo | Use the final opaque [512 × 512 candidate icon](../hosted/public/phone-icon.png), after confirming it matches the version being configured. Its presence in Git is not evidence of portal upload. |
| API terms | The authorized owner must complete the provider's required review and acceptance before app creation. Record the outcome without credentials or private account identifiers. |
| Product | Request **Sign In with LinkedIn using OpenID Connect** in Products. Product access must be enabled before the real callback check. |
| Callback | `https://career-finder-service.jazzy-drake-8323.chatgpt.site/auth/linkedin/callback` |
| Direct sign-in scope in the candidate | `openid profile email` |
| Basic connection from an authenticated account | `openid profile` |

LinkedIn documents [free Page creation](https://www.linkedin.com/help/linkedin/answer/a543852), [publisher-Page association](https://www.linkedin.com/help/linkedin/answer/a548360/) and its [self-service OIDC product](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2). Use accurate publisher details. The default Page documented for Member Data Portability belongs to a different product; it is not an established workaround for OIDC provisioning.

LinkedIn may omit `email` or `email_verified`. The candidate accepts direct sign-in only with a verified-email assertion supplied in the current ID token or a bounded UserInfo request whose subject exactly matches that token. This is a provider assertion, not independent verification of current mailbox ownership by Career Finder. It never invents a placeholder address or merges accounts by email. If no verified email is available, `email_required` explains how to sign in using ChatGPT or Google and then connect the basic LinkedIn profile. Basic linking does not request or collect a new email; an earlier verified email for that same LinkedIn identity can be retained. Linking alone is therefore not a guarantee that a later LinkedIn recovery sign-in will succeed.

Neither flow imports a CV, accesses private job data, verifies legal identity, or permits LinkedIn application submission. Provisioning and Page verification remain external steps with no guaranteed approval time.

### Google: registration and saved configuration are not callback evidence

**Historical v7 continuation context:** the earlier Google console attempt returned **Site Unavailable**. That observation is retained as the outcome of that attempt, not a current blocker or a finding that Google's OAuth implementation failed.

The [redacted Google configuration receipt](strict-review-evidence/continuation-2026-11-17-cloud/google-provider-configuration.json), recorded at **2026-11-17 08:24 UTC**, reports that the web OAuth client was created and enabled and its credentials were saved privately in **Sites environment revision 1**. The receipt lists the three non-sensitive OpenID, email and profile scopes, an **External / Testing** audience, and one owner test user visible in the portal table. A first test-user save timed out and a repeated attempt showed an ineligible/duplicate notice; the observed table, not an assumed second successful addition, is the evidence. No personal email or client secret is included in the receipt.

At that recorded checkpoint, branding completion, deployment with environment revision 1, and a real consent/callback were **not verified**. Check the latest receipt and actual portal/deployment state before repeating setup or declaring these gates complete. The exact registered callback is:

```text
https://career-finder-service.jazzy-drake-8323.chatgpt.site/auth/google/callback
```

Runtime scopes are `openid email profile`. Google's [production authentication policy](https://developers.google.com/identity/verification/authentication-policy-compliance) and [brand-verification guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification) apply separately from a working test client. Domain ownership and eligibility of this shared hosted domain for production verification remain unproven. Do not buy a domain, enable billing or describe an External / Testing client as publicly production-approved. The existing ChatGPT sign-in flow, including its Google option, remains the free fallback where available.

### Apply the correct private configuration to the correct source

The supported managed server keys are:

```text
CAREER_GOOGLE_CLIENT_ID
CAREER_GOOGLE_CLIENT_SECRET
CAREER_LINKEDIN_CLIENT_ID
CAREER_LINKEDIN_CLIENT_SECRET
```

Do not paste client secrets into chat, Git, screenshots, exported account files or this document. Google keys were saved at the checkpoint above; that does not establish LinkedIn keys or runtime activation. The managed Sites configuration must be applied by a deployment of the intended saved source. Record the **source version, environment revision, deployment receipt and observed live version together**. Rebuilding or redeploying an older saved version does not silently integrate the new candidate.

A button, portal registration, secret-entry success or `configured: true` establishes only its narrow configuration state. Provider consent, token validation, browser cookies and callback return must be observed separately. A legacy service that supports only basic LinkedIn linking must not be described as supporting direct LinkedIn sign-in merely because its LinkedIn keys exist.

## 2. Verify real consent, linking and recovery

Start at [Account](https://career-finder-service.jazzy-drake-8323.chatgpt.site/account) on the exact intended deployment. The candidate also exposes provider connection controls from the phone app's **Settings** tab or gear. These candidate controls must not be assumed present on live v7.

If you already have a ChatGPT-owned workspace, first return through that original account and connect the additional provider there. Directly signing in with an unlinked Google or LinkedIn identity can create a separate account even when its email matches the existing one. Do not test recovery by creating accidental parallel personal workspaces.

| Check | Action | Required result |
| --- | --- | --- |
| Provider availability | Compare the current deployment receipt with the visible provider choices and account connection status. | Only configured methods supported by that deployed source are offered. An unavailable method gives a clear setup state; no approval or callback is implied. |
| Cancellation | Start each available provider flow and cancel at the provider. | Clear cancellation/error feedback, no new identity, session or workspace-data change. Existing local work remains intact. |
| Google linking | In an authenticated disposable account, choose the Google artwork button whose accessible name is **Connect Google to this Career Finder account**, then approve the intended Google account. | Account confirms the intended identity and retains the original Career Finder workspace. |
| Google recovery | Sign out, then directly sign in with that linked Google account. | The same workspace, profile and records return. A matching email on a different provider identity does not merge another account. |
| LinkedIn basic connection | From an authenticated disposable account, choose **Connect LinkedIn** and inspect the actual consent. | The requested basic flow is `openid profile`, without a new email request. The intended identity is linked; no CV import, legal-identity verification or application rights are claimed. |
| LinkedIn direct sign-in | In a separate authorized disposable session, choose **Sign in with LinkedIn** where supported, inspect consent, and approve the intended identity. | Direct flow requests `openid profile email`. A successful sign-in has a provider-verified email and a stable provider identity. The workspace is newly created only when that identity is not already linked. |
| LinkedIn recovery | Link a LinkedIn identity to a disposable existing account, then sign out and use direct LinkedIn sign-in. | With a verified email supplied in this fresh sign-in, the same workspace returns. Previously stored email is not used as a substitute for missing fresh verification. |
| LinkedIn missing verified email | If an authorized real account/provider response omits a verified email, observe the result. If no such account is available, retain the synthetic result and mark this real case unobserved. | `email_required` provides the ChatGPT/Google plus basic-link route. No new Career Finder account or browser session is created by that attempt. Do not alter or fabricate real provider claims to force the case. |
| Wrong account | Attempt linking from another disposable Career Finder account using an identity already linked elsewhere. | Refuse the conflicting link; both workspaces remain unchanged. No email-based merge or implicit identity reassignment. |
| Disconnect an additional method | Return using the original sign-in method and choose the additional provider's **Disconnect → Confirm disconnect**. | Only the selected current connection is removed. Career Finder profile/history remain. Subsequent status is rechecked before success is reported. |
| Protect original/current sign-in | For both Google and LinkedIn, attempt disconnect while using that provider, and separately when it was the account's original method. | Refuse removal of the original or current sign-in method, even if another connection exists. For a ChatGPT-origin account, return through ChatGPT before removing its additional Google/LinkedIn connection. Whole-account deletion is separate. |
| Return to an old tab | Keep Account, Connect or Settings open, switch the signed-in account in another tab, then return. | Private data is hidden while identity is rechecked; stale confirmations cannot mutate the previous account or a replacement provider connection. |
| Expired or reused attempt | Let a disposable consent attempt expire, or revisit its already consumed callback URL without sharing its code. | No second session, link or account is created. The UI offers a fresh sign-in/recovery path. Never put the callback URL or code in evidence. |

Record provider, intent (direct sign-in or basic link), disposable account alias, tested source/deployment, time and observed outcome. Redact email, member identifiers, authorization codes and credentials. An automated provider stub is not a real consent pass; a real success does not replace the synthetic adversarial checks.

## 3. Verify isolation, export and deletion with disposable data

1. In fresh disposable account **A**, open the [phone browser app](https://career-finder-service.jazzy-drake-8323.chatgpt.site/phone), then **Profile → Create private workspace** before entering test data. Prepare a clearly synthetic profile and a readable synthetic PDF within the 5 MiB limit, then choose **Save profile online** deliberately. A local draft alone is not an online save. If a draft already exists, preserve it through the app's explicit save/recovery choices before opening the separate workspace scope.
2. In a separate browser profile, sign in as disposable account **B**. Confirm its own blank or previously saved state; it must not contain A's profile, PDF, jobs or private notes. Return to A and confirm its data is still present. Also test **A → B → A in the same browser profile**: save a distinctive synthetic local draft and note under A, sign out and switch to B, then return to A. B must not inherit A's draft/PDF/notes, and A must recover its own saved local state. This second check exercises shared-browser storage separation; separate profiles alone do not.
3. In A's Account page, choose **Download account records** and download its PDF separately under **Your CV files**. Confirm the JSON and PDF open. Account JSON contains private download paths, not embedded PDF bytes; keep the separate PDF when retaining a complete copy. Phone backup/export is a different format that can include the local PDF.
4. For a phone paired to A, use **Disconnect** and **Confirm disconnect** under **Connected phones**. Confirm that it needs a fresh connection for online access and that its local data has not been silently erased.
5. Only for the disposable A workspace, open **Delete cloud workspace**. Confirm the intended account, type `DELETE`, then personally choose **Permanently delete**. Do not substitute your established personal workspace for this test.
6. Wait for **Deletion completed**. An error or pending-deletion message is not completion. Follow **Finish signing out** and verify that the old session cannot recover A's deleted cloud profile/PDF. Account B must still retain its own data. Already-downloaded copies and local drafts remain separate and are not claimed erased.

Deletion removes active account/workspace content as the privacy page describes. Narrow lifecycle and pending-OAuth deletion fences remain for their documented purposes. It does not withdraw any application an employer already received.

## 4. Verify physical phones with the publishing owner

The separate publishing continuation owns installation signing, upgrade compatibility and store work. It should identify the exact installable artifact and source before these checks. Do not uninstall an existing preview or replace signing identities just to make an install succeed. Export existing local data first and verify the export opens.

On an available iPhone and Android phone, record the device model, OS version, installed build/version and source/artifact identity. Exercise the following with synthetic local records:

- Fresh or isolated blank profile, generic branding and optional country/role/work preferences.
- Search, saved jobs and the employer-link handoff; preserve previous results on an offline/failed search.
- PDF selection, invalid-file rejection that retains the earlier valid PDF, draft save, restart and recovery.
- Private notes, history, follow-up dates, bookmark removal and explicit cancellation/discard choices.
- Settings tab and gear; System, Light and Dark appearance choices; restart persistence; and a system appearance change while the app remains open in System mode. Check light and dark contrast, visible focus, selected states and errors.
- Large system text, the on-screen keyboard, landscape where supported, VoiceOver or TalkBack labels/order, and every confirmation action without clipping or unreachable controls. On the web, separately exercise 320 CSS-pixel reflow, 200% text enlargement, keyboard Tab order and focused controls near the fixed navigation. A resized screenshot alone does not prove these checks passed.
- Account A → B → A separation, online-save conflict handling and connection expiry/recovery using the disposable accounts above.
- Export/recovery without credentials or restored application approval. Android accepts backup/import files up to 24 MiB and destination workspace data up to 9 MiB; iPhone's backup/import limit is 64 MiB. Rejection must preserve the existing destination data.

The publisher must also resolve iOS third-party-login eligibility and the native browser-based sign-in handoff against the current Apple review guidance, and verify both stores’ account-deletion and privacy declarations. See the [research audit](Research-Audit-2026-11-17.md); a source implementation or a reviewer note is not store acceptance. Coordinate before shared Mac builds or release changes. If the publishing owner remains unreachable, keep candidate work isolated and record the handoff as unreceived.

Public Auto Apply remains disabled until an employer-authorized integration exists. Verify that the interface explains this and offers the employer's own application page. Confirmed/uncertain/cooldown application outcomes remain synthetic CI tests until an authorized integration can be tested appropriately. Do not send test applications to real employers.

## Planning estimates and completion criteria

These are engineering planning ranges, not approval guarantees:

| Milestone | Working estimate after prerequisites are available |
| --- | --- |
| Provider-console setup and private configuration | Roughly 30–60 minutes of active setup; provider/Page/domain approval or browser access may add an unbounded external wait. |
| Real consent, linking and cancellation checks | Roughly 20–40 minutes after both configured providers are actually available. |
| Two-account export/deletion acceptance | Roughly 30–60 minutes with two authorized disposable workspaces. |
| Physical-device acceptance | Roughly 45–90 minutes per available phone, followed by time for any observed repairs. |
| Store/TestFlight/Play availability | Publishing-owner and external-review gate; no guaranteed date and no new fee payment authorized. |

Mark a gate complete only after recording its actual result and exact tested build/source. Preview links, successful simulators, an unsigned build and a hosted deployment are separate from public store releases. The free browser app remains a supported iPhone/Android path while native distribution or direct providers are unavailable.
