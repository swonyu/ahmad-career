# Career Finder

Career Finder helps people find jobs, keep a shortlist, prepare a profile and PDF CV, and track what happens after applying. It is designed for **iPhone and Android phones**, starts with a blank personal profile, and has no country or profession whitelist.

## Start here

- [Public Career Finder service](https://career-finder-service.jazzy-drake-8323.chatgpt.site)
- [Open the phone browser app](https://career-finder-service.jazzy-drake-8323.chatgpt.site/phone)
- [Connect a native phone app](https://career-finder-service.jazzy-drake-8323.chatgpt.site/connect)
- [Manage your account](https://career-finder-service.jazzy-drake-8323.chatgpt.site/account)
- [Help](https://career-finder-service.jazzy-drake-8323.chatgpt.site/support) · [Privacy](https://career-finder-service.jazzy-drake-8323.chatgpt.site/privacy)
- [Existing Android 0.4 preview downloads](https://github.com/swonyu/ahmad-career/releases/tag/career-finder-v0.4.0-preview) (November 16 preview).

The native Android app targets Android 8 or newer. Its ordinary preview uses `com.saleh.careerfinder.preview` and the existing preview signing certificate; it is separate from Google Play distribution. The iPhone project targets iOS 16 or newer. An unsigned build or simulator test does not make an iPhone app available through TestFlight or the App Store.

## Release status

On November 27 the hosted service was reachable, and its health endpoint reported that live application submission was disabled. Sites records show a successful deployment of version 14 and a saved version 15. The November 27 code combines search recovery, saved-opening comparison, public job sharing, CV draft recovery and native history. [Integrated changes and verification](https://github.com/swonyu/ahmad-career/pull/4)

<details>
<summary>Earlier verification and implementation history</summary>

### November 17 baseline and development handoff

The [November 17 acceptance archive](https://github.com/swonyu/ahmad-career/tree/636d79a808bd4ecdd7ebd386b0f98a16ab3d2a32/docs/strict-review-evidence/continuation-2026-11-17-cloud) preserves the publisher’s partial iPhone results, test logs and supporting research from that date.

On November 17 the public deployment ran **version 7**, from hosted commit `1135a3270435d3719c6f62f1a2e3a53e2c040146`. At the `949ce0ad327beab79fa7033423b462ebc7bd98be` handoff, its 186 tracked source files matched the repository mirror. Live discovery returned 50 jobs; a bookmark survived navigation, the prior synthetic local record survived reload, and Account/Connect loaded without changing the owner's cloud data. See the [deployment receipt](docs/strict-review-evidence/hosted-v7-deployment.json) and [bounded browser receipt](docs/strict-review-evidence/hosted-v7-browser-verification.json).

Further work is an **isolated, unpublished development candidate**. Its changes require their own source-bound test receipts; the baseline results below do not certify later edits. The publishing branch remains separate at `fd9c5399f2b7001b234b3b86bf72e2b36b5114c1`. Its owner's current acknowledgment could not be obtained, so no release integration, shared Mac build, signing or store change is established by this continuation. The [release integration checklist](docs/Release-Integration-Checklist-2026-11-17.md) records the exact publishing changes to preserve and the remaining gates.

The latest application source with completed five-gate CI at takeover is `e66d1809ece7666c7d99412d48aa193cdf024c42` (tree `2bbffcaa056fa08b2cdea9da7b9426cac8476fc0`), in [run 44030852040](https://github.com/swonyu/ahmad-career/actions/runs/44030852040). **All five jobs passed. Android completed all 99 cases with zero failures or skips**, including 97 ordinary cases, ordinary-preview rejection of the isolated test certificate, and the native HTTPS review/approval flow. The previously stalled HTTPS case completed in 24.871 seconds with the original assertions intact; synthetic success/uncertainty/cooldown POST counts were exactly **1/1/2**, with multipart and PDF evidence. Android compilation and lint passed on Gradle 8.14.7 with **zero errors and six retained warnings**. **All 13 iPhone UI cases passed, zero failures**, in 1059.01 seconds; iPhone logic and the unsigned Release build also passed. Downloaded artifact sizes and SHA-256 hashes were verified. The earlier incomplete runs retain their own evidence; the successful correction does not establish the exact cause of the earlier Android stall.

The [continuation ledger](docs/Continuation-Review-2026-11-17.md) records the baseline's **29 finding groups**, exact source/run history and implemented fixes. Baseline service evidence includes 61 account groups, 19 phone groups / 164 Worker requests, 64 frontend + 14 browser-transport tests, 33 vault groups, 26 discovery groups, 30 authentication groups + 15 auth Worker requests, a separate 17-request Worker gate and **zero dependency-audit findings**. Companion checks passed 119 HTTP groups, 77 application-state groups and 12 TLS checks. iPhone logic passed 120 boundary checks, 503 lifecycle assertions / 77 scenarios and 43 discovery assertions / 13 scenarios. The e66d180 UI suite passed in 1059.01 seconds on an arm64 iPhone simulator; later candidates require their own relevant results.

The v7 source includes Google OAuth and basic LinkedIn connection code, but the original deployment used empty provider configuration revision 0. During this continuation, an authorized Google web client and branding were saved and its credentials were stored privately in **configuration revision 1**. The latest [redacted setup receipt](docs/strict-review-evidence/continuation-2026-11-17-cloud/google-provider-configuration.json) records External/Testing and one owner test user, with **no deployment using revision 1 and no verified real consent callback**. LinkedIn provider registration/product activation remains incomplete. Real provider consent, disposable-account acceptance, physical devices and store distribution remain separate gates. The [owner acceptance steps](docs/Owner-Acceptance-2026-11-17.md) give concrete actions. Historical [v7 Chrome zoom checks](docs/strict-review-evidence/browser-zoom-v7-2026-11-17/receipt.json) and [Account/Connect checks](docs/strict-review-evidence/browser-zoom-v7-2026-11-17/account-connect-receipt.json) remain evidence for their recorded source and limited scenarios. The publishing owner retains shared signing and `app-store/career-workspace-copy-20261117`; its receipt of the final handoff is not confirmed.

**Free-only requirement:** use available free infrastructure; do not add paid APIs, subscriptions, purchases, upgrades or automatic paid overages. Existing limits, including 250 service accounts, remain real limits. External developer-program costs and approvals are publishing-owner gates, with no new payment authorized. Preview availability, simulator success and deployment do not establish a public store release.

### Candidate implementation at that checkpoint

The isolated continuation adds five-section browser navigation with **Settings**, a slate/indigo light and dark appearance, updated icon assets, English/Arabic display controls, direct LinkedIn OIDC sign-in, stronger provider connection generations, guarded private recovery and a bounded PDF worker. These are candidate-source features until the corresponding source is deployed. Native appearance/settings and English/Arabic resources are integrated. The follow-up adds Saved-note search; the web also adds secondary CSV export and a contextual calendar-file action, without additional main tabs.

The [continuation implementation handoff](docs/Continuation-Implementation-2026-11-17.md) records architecture, migration 0004, exact critique findings, scoped tests, rollout steps and unresolved external gates. The preserved candidate `eebe748cb5afca0efcb9389255400a00cf5a480a` is in [draft PR #1](https://github.com/swonyu/ahmad-career/pull/1). Its [first full cloud run](https://github.com/swonyu/ahmad-career/actions/runs/44057279267) passed both service gates and failed native compile/lint gates; iPhone UI tests did not execute. Follow-up fixes are integrated and await a new source-bound run. Historical 99/13 native results do not establish this candidate's readiness.

The original request was made at `2026-11-16T22:26:12Z` and accepted as **24 hours of active implementation and testing**. No trustworthy complete active-work ledger was recovered, so the actual active hours remaining are unknown. `2026-11-17T22:26:12Z` is a calculated elapsed-time checkpoint, not an explicitly agreed deadline. No new 24-hour clock was started; see the [takeover receipt](docs/strict-review-evidence/continuation-2026-11-17-cloud/takeover.json).

### Earlier checkpoint retained for history

**Historical v6 checkpoint — superseded:** version 6 had been deployed with the phone browser app and dependency corrections. At that earlier checkpoint, its hosted GitHub CI gate had passed with zero audit findings, browser acceptance was in progress, Android had passed 91 policy checks and 83 native tests, and iPhone UI had passed nine of thirteen cases. The four iPhone corrections still needed a fresh run then. The [v6 deployment receipt](docs/strict-review-evidence/phone-web-hosted-deployment-v6.json) and [earlier strict review](docs/Strict-Review-2026-11-17.md) preserve those dated outcomes. The v7 and e66d180 evidence above supersedes these former open automated gates; it does not close provider, physical-device or store acceptance.

</details>

## Simple phone navigation

The current browser candidate uses five sections. The deployed v7 baseline had four; the new Settings section is not a claim about that live version:

| Section | What you can do |
| --- | --- |
| **Search** | Search selected public employer boards by role, location and remote work. See the source and original check time. Open a job or save it. |
| **Saved** | Keep a shortlist, add a public job link, record an application stage, write a private note and set a follow-up date. Filter All, Applied or Follow-ups. |
| **Apply** | Check your essentials, review the exact details for an available integration, stop unsent work and inspect submission receipts. |
| **Profile** | Prepare your name, email and PDF CV; add optional professional details and LinkedIn/portfolio links; choose a phone draft or an explicit online save. |
| **Settings** | Choose System/Light/Dark appearance and English/Arabic/device language; view only a currently confirmed account; manage available provider links and saved browser data. |

Native iPhone and Android navigation retains the established app structure while adding the same application-tracking concepts, simpler connection setup and clearer next actions. The iPhone Start and Apply screens show the missing name, email or PDF essentials. Android restores earlier search results without silently making another request.

Removing a bookmark keeps its application record. Closing an application keeps its applied mark. Correcting an applied mark requires a separate confirmation and cannot change a matching active approved plan until that plan is stopped. Private notes and follow-up dates are local records, not employer-verified evidence.

## Accounts and your information

Searching and local preparation do not require an account. New users supply their own details. Signing in does not automatically upload an existing draft.

The Connect page shows the sign-in methods available for that deployment. Direct Google and LinkedIn sign-in require provider configuration. LinkedIn sign-in also requires a provider-reported verified email. Use the same identity on another phone to recover the same workspace. To add a sign-in method, open the existing workspace first and connect it from Account or Settings. Matching email addresses never merge accounts. Native apps use a short-lived, single-use connection code. The browser app uses its verified account directly.

**Save on this phone** preserves a local draft. **Save profile online** uploads the chosen profile and PDF to the private workspace. Online saves check profile revisions so another phone's changes are not silently overwritten. A comparison screen shows both versions before a deliberate choice.

The browser app keeps phone data in encrypted IndexedDB with separate guest, account and workspace scopes. Atomic writes reject conflicting tabs, and damaged or unfamiliar data is preserved for recovery. A reset cannot be silently undone by an older open tab. The browser stores the encryption key, so this does not protect against someone using an unlocked browser or code executing on the website. Home-screen installation is supported where the browser offers it; opening the browser app still requires a network connection. No service worker caches private pages.

Account controls provide cloud export, retained PDF downloads, phone disconnection, interrupted-upload recovery and cloud-workspace deletion. Local phone records and employer-held applications are separate. Deleting cloud data does not erase an already-downloaded file or withdraw an employer application.

## Google, LinkedIn and Auto Apply

| Capability | Actual scope |
| --- | --- |
| Google sign-in | The account recovery check verified that signing out and signing in with Google reopened its own workspace. The Connect page reports which Google options are currently available. Provider tokens are discarded after verification. [Account recovery receipt](https://github.com/swonyu/ahmad-career/pull/4) |
| LinkedIn profile | Save and open an optional personal profile URL. The app removes tracking information and displays the exact link in an application review. |
| LinkedIn job search | Explicitly open LinkedIn with your entered keywords and location. LinkedIn handles its own login and application. |
| LinkedIn account connection/sign-in | v7 has basic-link code. The candidate adds direct OIDC login with `openid profile email`, accepting a fresh provider-reported verified email or failing safely with `email_required`. Explicit basic linking requests only `openid profile` and collects no new email. Provider registration/product activation and real consent remain open. Neither flow imports a CV, submits LinkedIn applications or verifies legal identity. |
| Auto Apply | The implementation prepares immutable reviews and can submit through an authorized supported employer integration after explicit approval. The public preview currently has no employer credentials, so live Auto Apply remains unavailable. |
| Verified submission | A supported live provider must return its documented acceptance response and an application ID. A manual mark, opened link or synthetic test receipt cannot create live confirmation. |

The initial submission adapter supports the official Lever Postings API for global and EU employers. Each employer needs an authorized key and current, reviewed posting requirements. Unknown custom questions block automatic submission. Public access to a Greenhouse or Lever jobs board does not grant permission to submit applications to that employer.

A review binds the selected job, profile revision, exact PDF fingerprint, links, answers and permissions. Continuation processes only already-approved work. The browser performs at most 20 sequential continuation steps in a pass and stops on an error, unchanged result, hidden page or lost approval. Rate-limited work requires fresh approval after its cooldown. An uncertain provider outcome blocks automatic resend.

Requesting **Stop** immediately holds further sending on that phone or browser. A confirmed service Stop cancels unsent work; a failed or pending request still needs service confirmation. A request already sent may finish, and the service records late outcomes for live claims. An expired unresolved claim can be marked uncertain through an exact-plan Stop action without resending it. Confirmed receipt means API acceptance, not recruiter review, an interview or a job offer.

## Job coverage and hosting limits

The starting catalog contains seven selected Greenhouse and Lever employer boards across regions and professions. A search uses up to four catalog or custom supported boards. Each board is capped at 500 validated jobs, with at most 50 results per response. Partial outages, stale data and a successful empty search have different messages.

This is not an exhaustive worldwide jobs index. Country, remote-work status and work authorization are not inferred when evidence is missing. The candidate browser interface supports English and Arabic with right-to-left layout, while job postings, names, CVs and text entered by the user remain in their original language. Native bilingual integration and its acceptance are separately in progress. Earlier country-specific research records remain compatibility/history data rather than the primary discovery limit.

Public search sends no profile or CV. Search terms are not stored in the cloud workspace or shared board cache or forwarded as search queries to employers. Hosting logs may include request URLs. Opening an employer link contacts that employer directly.

The managed HTTPS service was published without buying a domain, starting a paid upgrade or creating a separate paid hosting account. Its preview limits include 250 workspaces, five PDFs/25 MiB per workspace, 200 opportunities, 100 reviews, 500 submission records and ten phone connections. Each PDF is limited to 5 MiB. Provider quotas and account terms still apply; hosting is not described as unlimited or permanently free.

## Source and verification

| Location | Purpose |
| --- | --- |
| [apple/](apple/) | Native SwiftUI iPhone app and isolated logic/UI checks |
| [android/](android/) | Native Kotlin/Compose Android app and phone/runtime checks |
| [hosted/](hosted/) | Phone browser app, HTTPS APIs, D1 workspace storage and private R2 PDFs |
| [website/applications/](website/applications/) | Separate Node/SQLite companion service and pairing CLI |
| [postman/](postman/) | Synthetic HTTP acceptance collection; no real employer submissions |
| [Continuation review](docs/Continuation-Review-2026-11-17.md) | Historical finding ledger and exact-source evidence through the prior handoff |
| [Continuation implementation](docs/Continuation-Implementation-2026-11-17.md) | Current isolated candidate architecture, provider setup, critique corrections, scoped results, rollout and blockers |
| [Application contract](docs/Verified-Applications-Contract.md) | Authentication, immutable approval, continuation and receipt semantics |
| [Publishing handoff](docs/Publishing-Handoff-2026-11-17.md) | Prior exact-source/deployment handoff; delivery to the publishing owner still needs confirmation |
| [Release integration checklist](docs/Release-Integration-Checklist-2026-11-17.md) | Exact development/release boundaries, publishing-only wording changes and evidence required before integration |

Run the hosted checks with Node 24:

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

Android uses JDK 21 and Android SDK 36:

```sh
cd android
bash checks/run-policy-checks.sh
./gradlew --no-daemon --max-workers=2 :app:assembleDebug :app:assembleDebugAndroidTest :app:lintDebug
```

For iPhone, open `apple/AhmadCareer.xcodeproj`, select the existing `AhmadCareer` scheme and an iPhone destination. Preserve bundle identifier `com.ahmadalayed.career` and use the authorized signing identity for distribution. The internal project and storage names remain stable for existing data; the public app name is **Career Finder**.

```sh
bash apple/Checks/check-mobile.sh
```

The [Phone quality workflow](.github/workflows/phone-quality.yml) has five gates: companion service/synthetic HTTPS, hosted storage and Worker checks, Android compile/lint, iPhone logic/unsigned Release, and isolated iPhone UI acceptance. Test fixtures use synthetic applicants and providers. No real employer application was sent during development.

The hosted gate for published feature commit `5efda90fd5ac58b4d8b8641466056bbd0dc6bbd3` passed in [run 43983824827](https://github.com/swonyu/ahmad-career/actions/runs/43983824827/job/133706762047). This is evidence for the hosted source and full dependency audit, not an all-five-gate pass for the later iPhone repair. The [iPhone repair review](docs/strict-review-evidence/iphone-bc68-ui-repair-review.json) and [independent review](docs/strict-review-evidence/iphone-bc68-ui-repair-independent-review.json) record the corrected bytes and the runtime check pending at that historical checkpoint.

The retained [0.4 release verification](docs/phone-preview-release-verification.json), [earlier polish review](docs/Phone-Polish-Review-2026-11-16.md) and [earlier reliability review](docs/Phone-Quality-Review-2026-11-16.md) remain dated evidence. They must not be relabeled as results for this candidate. Physical-phone acceptance, app-store distribution, real Google/LinkedIn consent and live employer activation require their own observed results.
