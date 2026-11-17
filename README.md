# Career Finder

Career Finder helps people find jobs, keep a shortlist, prepare a profile and PDF CV, and track what happens after applying. It is designed for **iPhone and Android phones**, starts with a blank personal profile, and has no country or profession whitelist.

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

The hosted service uses **ChatGPT sign-in**, which offers **Continue with Google**. This is not an independent Career Finder Google OAuth client. Use the same account on another phone to recover the same online workspace. Native apps connect with a short-lived, single-use code; the browser app uses its authenticated account directly without a pairing code.

**Save on this phone** preserves a local draft. **Save profile online** uploads the chosen profile and PDF to the private workspace. Online saves check profile revisions so another phone's changes are not silently overwritten. A comparison screen shows both versions before a deliberate choice.

The browser app keeps phone data in encrypted IndexedDB with separate guest, account and workspace scopes. Atomic writes reject conflicting tabs, and damaged or unfamiliar data is preserved for recovery. A reset cannot be silently undone by an older open tab. The browser stores the encryption key, so this does not protect against someone using an unlocked browser or code executing on the website. Home-screen installation is supported where the browser offers it; opening the browser app still requires a network connection. No service worker caches private pages.

Account controls provide cloud export, retained PDF downloads, phone disconnection, interrupted-upload recovery and cloud-workspace deletion. Local phone records and employer-held applications are separate. Deleting cloud data does not erase an already-downloaded file or withdraw an employer application.

## Google, LinkedIn and Auto Apply

| Capability | Actual scope |
| --- | --- |
| Google sign-in | Available through the secure ChatGPT sign-in flow used by the hosted service. No Google password or access token is collected by Career Finder. |
| LinkedIn profile | Save and open an optional personal profile URL. The app removes tracking information and displays the exact link in an application review. |
| LinkedIn job search | Explicitly open LinkedIn with your entered keywords and location. LinkedIn handles its own login and application. |
| LinkedIn account connection | OAuth account verification, profile import and LinkedIn application submission are not enabled. A saved link must not be labeled a connected or verified account. |
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
| [Strict review](docs/Strict-Review-2026-11-17.md) | Current findings, fixes, exact evidence and remaining release gates |
| [Application contract](docs/Verified-Applications-Contract.md) | Authentication, immutable approval, continuation and receipt semantics |
| [Release handoff](docs/HOSTED-RELEASE-HANDOFF.md) | Current publication state and external activation/distribution requirements |

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
