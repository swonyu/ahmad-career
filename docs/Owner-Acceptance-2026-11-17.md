# Career Finder — owner acceptance steps

These are the remaining **real account and device checks**, prepared for the owner to perform. They are not completed test results. The [publishing handoff](Publishing-Handoff-2026-11-17.md) identifies the exact tested source and current gates; the [continuation ledger](Continuation-Review-2026-11-17.md) retains the engineering evidence.

Use accounts you own or whose owners have agreed to testing. Use disposable Career Finder workspaces with synthetic profiles and PDFs for deletion and account-switch checks. Keep the existing personal workspace and installed app data intact. No step requires submitting a test application to a real employer or buying a service.

## 1. Complete the provider setup

### LinkedIn

The [official app-creation form](https://www.linkedin.com/developers/apps/new) has been prepared in the continuation's cloud browser with:

| Field | Prepared value or required action |
| --- | --- |
| App name | **Career Finder** |
| Privacy policy | `https://career-finder-service.jazzy-drake-8323.chatgpt.site/privacy` |
| LinkedIn Page | Choose the accurate publisher Page that you are authorized to associate with the app. This association is permanent. |
| Logo | Upload the existing [512 × 512 public app logo](../hosted/public/phone-icon.png). The native file picker was reached after the automated chooser failed, but the form still showed its placeholder afterward; logo selection remains unfinished. |
| API terms | Review and accept them yourself if you agree, then create the app. The checkbox has been left unchecked. |
| Product | Request **Sign In with LinkedIn using OpenID Connect** from the app's Products area. |
| Callback | `https://career-finder-service.jazzy-drake-8323.chatgpt.site/auth/linkedin/callback` |
| Requested scope | `openid profile` |

LinkedIn documents [free Page creation](https://www.linkedin.com/help/linkedin/answer/a543852), [publisher-Page association](https://www.linkedin.com/help/linkedin/answer/a548360/) and its [self-service OIDC product](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2). Use accurate publisher details. The default Page documented for Member Data Portability belongs to another product; it is not an established OIDC workaround.

Basic profile connection does not grant private job access, résumé import or permission to submit applications. Product provisioning and Page verification are external steps with no guaranteed approval time.

### Google

The [Google API console](https://console.cloud.google.com/apis/dashboard) returned **Site Unavailable** in the continuation's cloud browser. That establishes a limitation of this attempt, not that the console is unavailable to you or that Google's OAuth implementation failed.

Use an authorized web OAuth client, the app's correct branding/privacy information and this exact callback:

```text
https://career-finder-service.jazzy-drake-8323.chatgpt.site/auth/google/callback
```

The app requests `openid email profile`. Google's [production authentication policy](https://developers.google.com/identity/verification/authentication-policy-compliance) includes brand/domain requirements. Eligibility of this shared hosted domain is still unverified. Do not buy a domain, enable paid services or claim production verification to work around that gate. The existing ChatGPT sign-in flow, including its Google option, remains available.

### Apply the server configuration privately

The required managed server keys are:

```text
CAREER_GOOGLE_CLIENT_ID
CAREER_GOOGLE_CLIENT_SECRET
CAREER_LINKEDIN_CLIENT_ID
CAREER_LINKEDIN_CLIENT_SECRET
```

Do not paste client secrets into chat, Git, screenshots or exported account files. Once provider registration is complete, use an authorized private configuration channel for the existing managed service. The current Sites connector supports secret environment entries; changing them requires redeploying the existing saved source version to apply the new environment revision. No particular owner-facing secret-entry screen has been verified, so these instructions do not invent one. Record the resulting environment revision and deployment receipt, then execute the real consent checks below. A visible button or `configured: true` is not proof that consent and callbacks work.

## 2. Verify real provider consent and account continuity

Start at [Account](https://career-finder-service.jazzy-drake-8323.chatgpt.site/account). If you already use a ChatGPT-owned workspace, sign in to that workspace first and connect Google from Account before using direct Google sign-in. Matching email addresses do not merge accounts.

| Check | Action | Required result |
| --- | --- | --- |
| Cancellation | Start the available provider connection and cancel at the provider. | Return with a clear cancellation/error state; no new connected identity or workspace-data change. |
| Google linking | In the Google section, choose the **Sign in with Google** artwork button, whose accessible name is **Connect Google to this Career Finder account**, and approve the intended Google account. | Account confirms the intended Google identity while retaining the same Career Finder workspace. |
| Google recovery | Sign out, then use direct Google sign-in with that linked account. | The same workspace, profile and records return. No matching-email merge into another workspace occurs. |
| LinkedIn connection | Choose **Connect LinkedIn**, inspect the basic-profile scope and approve the intended LinkedIn account. | Account confirms the intended connection. The app does not claim résumé import, legal identity verification or application rights. |
| Wrong account | Start linking from another disposable Career Finder account using an identity already linked elsewhere. | The app refuses the conflicting link; both workspaces remain unchanged. |
| Disconnect | Choose **Disconnect LinkedIn**, then **Confirm disconnect**. For an account originally created through ChatGPT, sign out after the Google-recovery check and return through the original ChatGPT account before testing **Disconnect Google → Confirm disconnect**. | Only the additional connection is removed; the Career Finder profile/history remain. Google disconnection is refused while Google is the current sign-in method, and an account originally created through Google must retain Google. |
| Return to an old tab | Keep Account/Connect open, change the signed-in account in another tab, then return to the old tab. | Private data is hidden while identity is rechecked; a stale page cannot mutate the previous account. |

Record which provider and account alias were used, the observed result and any exact error. Keep identifiers, codes and credentials out of shared screenshots. These are consenting-owner checks, not permission to use someone else's account.

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
- Large system text, the on-screen keyboard, landscape where supported, VoiceOver or TalkBack focus labels/order, and every confirmation action without clipping or unreachable controls.
- Account A → B → A separation, online-save conflict handling and connection expiry/recovery using the disposable accounts above.
- Export/recovery without credentials or restored application approval. Android accepts backup/import files up to 24 MiB and destination workspace data up to 9 MiB; iPhone's backup/import limit is 64 MiB. Rejection must preserve the existing destination data.

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
