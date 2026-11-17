# Career Finder

Career Finder helps people find jobs, keep a shortlist, prepare a profile and PDF CV, and track what happens after applying. It is designed for **iPhone and Android phones**, starts with a blank personal profile, and has no country or profession whitelist.

## Current continuation — 17 November 2026

The deployed service is **version 7**, from hosted commit `1135a3270435d3719c6f62f1a2e3a53e2c040146`. Its 186 tracked source files match the repository mirror. Live discovery returned 50 jobs; a bookmark survived navigation, the prior synthetic local record survived reload, and Account/Connect loaded without changing the owner's cloud data. See the [deployment receipt](docs/strict-review-evidence/hosted-v7-deployment.json) and [bounded browser receipt](docs/strict-review-evidence/hosted-v7-browser-verification.json).

The latest executed phone revision is `b07337632b002aafa05a04c5843b9f971cabca26`, in [run 44020929694](https://github.com/swonyu/ahmad-career/actions/runs/44020929694). Both service jobs and the complete iPhone logic/unsigned Release job passed. Its iPhone interface job finished cancelled: eight cases passed, one query failed, one case was interrupted and three did not start. A typed, scoped query correction and bounded simulator-build/evidence budget are prepared; this is not a 13-case pass. Android builds and lints on patched Gradle 8.14.7 with **zero errors and six retained warnings**. All 97 ordinary Android cases executed: **95 passed, two failed**; the two dedicated HTTPS cases were not reached. Narrow country-picker and note-layout corrections are implemented and independently reviewed, with every original case/assertion retained; their fresh compile/runtime gate is still required.

The [continuation ledger](docs/Continuation-Review-2026-11-17.md) records **28 finding groups**, exact source/run history and implemented fixes. Current service evidence includes 61 account groups, 19 phone groups / 164 Worker requests, 64 frontend + 14 browser-transport tests, 33 vault groups, 26 discovery groups, 30 authentication groups + 15 auth Worker requests, a separate 17-request Worker gate and **zero dependency-audit findings**. Companion checks pass 119 HTTP groups, 77 application-state groups and 12 TLS checks. iPhone logic passes 120 boundary checks, 503 lifecycle assertions / 77 scenarios and 43 discovery assertions / 13 scenarios. The prior 66669da candidate passed all 13 UI cases; that result is not substituted for a later source's acceptance.

Direct Google OAuth and a supported basic LinkedIn connection are deployed, but their managed provider configuration remains empty. Real provider consent, complete browser/device acceptance and store distribution remain separate gates. The [publishing handoff](docs/Publishing-Handoff-2026-11-17.md) gives exact owner actions. The separate App Publishing owner retains signing and the `app-store/career-workspace-copy-20261117` release branch; this continuation has not changed that branch or started a competing release.

**Free-only requirement:** use available free infrastructure; do not add paid APIs, subscriptions, purchases, upgrades or automatic paid overages. Existing limits, including 250 service accounts, remain real limits. External developer-program costs and approvals are publishing-owner gates, with no new payment authorized. Preview availability, simulator success and deployment do not establish a public store release.

### Earlier checkpoint retained for history

**Release checkpoint — 17 November 2026:** hosted **version 6 is deployed**, including the phone browser app and dependency corrections. Its hosted GitHub CI gate passed with zero findings in the complete dependency audit; live browser acceptance is still in progress. Android 0.6 passed 91 policy checks and all 83 native phone tests, with zero lint issues, but its new download is not yet published. The latest completed iPhone UI run passed nine of thirteen cases. Corrections for its four failures are frozen and independently reviewed; a fresh 13-case run is pending. The [deployment receipt](docs/strict-review-evidence/phone-web-hosted-deployment-v6.json) and [strict review](docs/Strict-Review-2026-11-17.md) identify observed results and remaining gates. Earlier successful tests do not verify a later source change.

## Start here

- [Public Career Finder service](https://career-finder-service.jazzy-drake-8323.chatgpt.site)
- [Open the phone browser app](https://career-finder-service.jazzy-drake-8323.chatgpt.site/phone)
- [Connect a native phone app](https://career-finder-service.jazzy-drake-8323.chatgpt.site/connect)
- [Manage your account](https://career-finder-service.jazzy-drake-8323.chatgpt.site/account)
- [Help](https://career-finder-service.jazzy-drake-8323.chatgpt.site/support) · [Privacy](https://career-finder-service.jazzy-drake-8323.chatgpt.site/privacy)
- [Existing Android 0.4 preview downloads](https://github.com/swonyu/ahmad-career/releases/tag/career-finder-v0.4.0-preview) — retained historical release; it does not include the pending 0.6 changes.

The native Android app targets Android 8 or newer. Its ordinary preview uses `com.saleh.careerfinder.preview` and the existing preview signing certificate; it is separate from Google Play distribution. The iPhone project targets iOS 16 or newer. An unsigned build or simulator test does not make an iPhone app available through TestFlight or the App Store.

## Simple phone navigation

The deployed phone browser app uses four sections:

| Section | What you can do |
| --- | --- |
| **Search** | Search selected public employer boards by role, location and remote work. See the source and original check time. Open a job or save it. |
| **Saved** | Keep a shortlist, add a public job link, record an application stage, write a private note and set a follow-up date. Filter All, Applied or Follow-ups. |
| **Apply** | Check your essentials, review the exact details for an available integration, stop unsent work and inspect submission receipts. |
| **Profile** | Prepare your name, email and PDF CV; add optional professional details and LinkedIn/portfolio links; choose a phone draft or an explicit online save. |

Native iPhone and Android navigation retains the established app structure while adding the same application-tracking concepts, simpler connection setup and clearer next actions. The iPhone Start and Apply screens show the missing name, email or PDF essentials. Android restores earlier search results without silently making another request.

Removing a bookmark keeps its application record. Closing an application keeps its applied mark. Correcting an applied mark requires a separate confirmation and cannot change a matching active approved plan until that plan is stopped. Private notes and follow-up dates are local records, not employer-verified evidence.

## Accounts and your information

Searching and local preparation do not require an account. New users supply their own details. Signing in does not automatically upload an existing draft.

The hosted service currently uses **ChatGPT sign-in**, which offers **Continue with Google**. Direct Career Finder Google OAuth is also implemented in deployed version 7, but remains inactive until its authorized provider application is configured and accepted in a real browser flow. Use the same account on another phone to recover the same online workspace. Native apps connect with a short-lived, single-use code; the browser app uses its authenticated account directly without a pairing code.

**Save on this phone** preserves a local draft. **Save profile online** uploads the chosen profile and PDF to the private workspace. Online saves check profile revisions so another phone's changes are not silently overwritten. A comparison screen shows both versions before a deliberate choice.

The browser app keeps phone data in encrypted IndexedDB with separate guest, account and workspace scopes. Atomic writes reject conflicting tabs, and damaged or unfamiliar data is preserved for recovery. A reset cannot be silently undone by an older open tab. The browser stores the encryption key, so this does not protect against someone using an unlocked browser or code executing on the website. Home-screen installation is supported where the browser offers it; opening the browser app still requires a network connection. No service worker caches private pages.

Account controls provide cloud export, retained PDF downloads, phone disconnection, interrupted-upload recovery and cloud-workspace deletion. Local phone records and employer-held applications are separate. Deleting cloud data does not erase an already-downloaded file or withdraw an employer application.

## Google, LinkedIn and Auto Apply

| Capability | Actual scope |
| --- | --- |
| Google sign-in | Currently available through ChatGPT sign-in. Direct Career Finder OAuth code is deployed but unconfigured; its confidential server exchanges the provider code, verifies identity and does not retain provider access/refresh tokens. Career Finder never asks for a Google password. |
| LinkedIn profile | Save and open an optional personal profile URL. The app removes tracking information and displays the exact link in an application review. |
| LinkedIn job search | Explicitly open LinkedIn with your entered keywords and location. LinkedIn handles its own login and application. |
| LinkedIn account connection | A supported basic OpenID Connect flow is deployed but unconfigured. Once activated, it connects an explicitly authorized basic profile using `openid profile`; it does not import a résumé, search private jobs, submit applications or verify legal identity. A saved link remains distinct from an authenticated connection. |
| Auto Apply | The implementation prepares immutable reviews and can submit through an authorized supported employer integration after explicit approval. The public preview currently has no employer credentials, so live Auto Apply remains unavailable. |
| Verified submission | A supported live provider must return its documented acceptance response and an application ID. A manual mark, opened link or synthetic test receipt cannot create live confirmation. |

The initial submission adapter supports the official Lever Postings API for global and EU employers. Each employer needs an authorized key and current, reviewed posting requirements. Unknown custom questions block automatic submission. Public access to a Greenhouse or Lever jobs board does not grant permission to submit applications to that employer.

A review binds the selected job, profile revision, exact PDF fingerprint, links, answers and permissions. Continuation processes only already-approved work. The browser performs at most 20 sequential continuation steps in a pass and stops on an error, unchanged result, hidden page or lost approval. Rate-limited work requires fresh approval after its cooldown. An uncertain provider outcome blocks automatic resend.

**Stop** prevents unsent work; it cannot recall a request already sent. The service records late outcomes for live claims. An expired unresolved claim can be marked uncertain through an exact-plan Stop action without resending it. Confirmed receipt means API acceptance, not recruiter review, an interview or a job offer.

## Job coverage and hosting limits

The starting catalog contains seven selected Greenhouse and Lever employer boards across regions and professions. A search uses up to four catalog or custom supported boards. Each board is capped at 500 validated jobs, with at most 50 results per response. Partial outages, stale data and a successful empty search have different messages.

This is not an exhaustive worldwide jobs index. Country, remote-work status and work authorization are not inferred when evidence is missing. The current interface is English. Earlier country-specific research records remain compatibility/history data rather than the primary discovery limit.

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
| [Continuation review](docs/Continuation-Review-2026-11-17.md) | Current findings, fixes, exact evidence and remaining acceptance gates; preserves the earlier strict review |
| [Application contract](docs/Verified-Applications-Contract.md) | Authentication, immutable approval, continuation and receipt semantics |
| [Publishing handoff](docs/Publishing-Handoff-2026-11-17.md) | Current source/deployment evidence, provider owner actions and coordinated distribution gates |

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

The hosted gate for published feature commit `5efda90fd5ac58b4d8b8641466056bbd0dc6bbd3` passed in [run 43983824827](https://github.com/swonyu/ahmad-career/actions/runs/43983824827/job/133706762047). This is evidence for the hosted source and full dependency audit, not an all-five-gate pass for the later iPhone repair. The [iPhone repair review](docs/strict-review-evidence/iphone-bc68-ui-repair-review.json) and [independent review](docs/strict-review-evidence/iphone-bc68-ui-repair-independent-review.json) record the corrected bytes and the pending runtime check.

The retained [0.4 release verification](docs/phone-preview-release-verification.json), [earlier polish review](docs/Phone-Polish-Review-2026-11-16.md) and [earlier reliability review](docs/Phone-Quality-Review-2026-11-16.md) remain dated evidence. They must not be relabeled as results for this candidate. Physical-phone acceptance, app-store distribution, direct LinkedIn OAuth and live employer activation require their own observed results.
