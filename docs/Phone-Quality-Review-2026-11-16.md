# Phone reliability follow-up

Follow-up to the first phone candidate, commit `396cc370d98a0ee48f8cc2ac89312de08a3dec74`. This review addresses concrete behavior found in that source. Results below must describe executed checks, with exact source identity; authored checks are not passing evidence.

## Findings and acceptance criteria

| Area | Finding in the first candidate | Required behavior |
| --- | --- | --- |
| iPhone profile conflicts | The saved phone draft did not retain the server revision it was based on. Refresh could move that revision underneath a dirty draft. | Keep the draft's original revision across restart and refresh; show an explicit conflict-resolution choice before replacing newer server data. |
| iPhone connection changes | A response from an earlier connection could finish after a disconnect or switch. | Ignore responses and errors belonging to an obsolete connection; never repopulate another workspace with them. |
| Expired/offline connections | HTTP status was lost in iPhone errors, and disconnect depended on successful online revocation. | Distinguish expired sessions from transport failure; allow explicit local removal while accurately explaining whether remote revocation succeeded. |
| iPhone profile save | A successful PUT was not durably reconciled until a later GET also succeeded. | Persist the confirmed profile revision and résumé metadata from the save response itself. |
| Recovered reviews | Only one iPhone review was reachable, and an open review could become stale after refresh. | Make eligible reviews reachable, invalidate outdated approvals, and retain exact immutable details for retries. |
| Android storage recovery | Unreadable encrypted storage blocked further use without a recovery choice. | Preserve unreadable data, offer retry and a deliberate recovery path, and avoid silent overwrites. |
| Android profile conflicts | Edits survived a conflict but the available reload action discarded them. | Let the person retain/review their draft or deliberately use the server version. |
| Android phone drafts | Pairing hid useful offline drafts without an explicit import route. | Offer a visible, deliberate import into the connected workspace; never silently upload a profile or CV. |
| Android employer choices | Comments and consent lived only in the Apply view and disappeared during navigation. | Keep per-opportunity choices with the intended workspace and invalidate review when they change. |
| Android asynchronous review | A delayed prepare response could restore a review after selection changed. | Accept a review only if its selection/profile/answers still match the initiating inputs. |
| Android prepared screen | The selected-answer card and prepared-review card used the same list key for a job. | Use distinct stable keys and execute the actual prepare-to-review flow without a duplicate-key crash. |
| Earlier review replacement | An obsolete unapproved review could remain available after changing its inputs. | Deliberately retire the old unapproved review before preparing its replacement, with an atomic server guard against another phone's intervening approval. |
| Delayed workspace refresh | A GET begun before a successful profile save could arrive later with older profile data. | Preserve the acknowledged revision/CV and reject obsolete refresh responses in the same workspace. |
| Compact Android with enlarged text | At 360 dp and 180% text, a four-column navigation label broke mid-word; English punctuation followed forced RTL paragraph direction. | Keep all four labeled destinations reachable with adaptive rows and preserve content-based reading direction without reducing the person's text scale. |
| Applicant names | Automatic application required a separate family name although the provider accepts a single name string. | Support a genuine single name without inventing a surname; review and send the same trimmed value. |
| Future-contact choice | A required marketing-consent question treated an explicit no as unanswered. | Preserve and transmit an explicit false answer; never infer permission or require future-contact permission merely to answer the question. |

## Actual phone-to-service acceptance

The first candidate's HTTP and phone checks were separate. This follow-up adds a controlled HTTPS acceptance environment to exercise the actual native network client, pairing, saved profile/PDF, immutable review, dispatch and receipt observation against the actual application service and a synthetic provider.

The fixture must bind only to loopback and require explicit test mode. It must use a fresh private ledger, ephemeral TLS private material, exact Host validation, visibly synthetic applicants/jobs and separate test evidence. Only an acceptance-specific Android build may trust the public fixture certificate for the emulator host. The normal debug installer and release configuration must retain their normal TLS trust behavior, contain no fixture trust anchor, and reject the untrusted fixture certificate.

No simulated receipt may count as a live application. No test may contact a real employer, silently reuse personal credentials, change system trust, or weaken production TLS.

## Native acceptance scope

Android checks should cover the concrete state defects above and inspect a compact phone layout, enlarged text, dark mode, right-to-left layout and the system PDF-picker return. Record which configurations were actually run. UI inspection does not establish TalkBack speech or physical-device acceptance.

iPhone work on the shared Mac uses isolated source and standalone Swift checks while its Apple build window is unresolved. The current publishing handoff requires a fresh scheduling acknowledgment before acquiring `/tmp/dot-ios-build.lock`; an absent lock is insufficient. A source typecheck or Foundation executable is not a linked Xcode app build, simulator UI result, device installation or store release. The repository workflow separately compiles the unsigned iPhone app on an ephemeral GitHub-hosted Mac, with dedicated DerivedData and signing disabled. That independent runner does not use the shared Mac, its build slot, simulators or accounts.

## Evidence

The application service at SHA-256 `77d413e1e01078bf9f7b389529e6379580d50a54d24819cc551d347aef07094c` passed 86 real HTTP regression groups and 12 actual HTTPS diagnostic checks. The official Postman CLI then made 29 HTTP calls across 28 request definitions, passing 36 assertions with no failures. Its captured runtime files remained unchanged; [Postman verification](../postman/verification.json) and the adjacent runtime manifest identify the exact inputs. These service-level checks used synthetic applicants and a local provider dependency.

The existing website/tracker suite also passed again, including 77 application-state groups plus preference, record, feed-boundary and server checks. Existing records and discovery logic remain covered independently from the new submission service.

The iPhone production client passed 48 boundary checks. Its actual application store passed 79 assertions across 15 deterministic lifecycle scenarios using injected transport/credentials and real temporary files. These exercised revision migration, conflict choices and exact PDF handling, durable PUT acknowledgement, delayed response/error rejection, connection switches and local disconnection, malformed successful responses, review replacement races, changed preparation inputs and disk failures. All ten Swift app source files also passed the iOS 16 static typecheck with zero diagnostics. Exact source hashes, commands and limits are in [Apple verification](../apple/Checks/mobile-verification.json).

The final Android source passed 15 native regression tests on the dedicated API 36 phone emulator, plus ordinary-preview rejection of the fixture certificate and the real native HTTPS application flow: 17 instrumented tests in total. Both the ordinary preview and separate acceptance variant compiled; normal lint and release resource processing passed. The preview retains the earlier installer's signing certificate and can read its legacy encrypted records.

The native HTTPS run paired the phone, saved a genuine single-name profile and actual PDF, rendered the review, replaced an obsolete unapproved review through the atomic guard, approved dispatch, and continued a known rate-limit rejection through a fresh visible approval. The independent provider observations recorded exactly one successful request, one uncertain timeout request and two requests for the rate-limited application. All four contained multipart PDF bytes. The result was two confirmed **test** receipts, one uncertain outcome, three stopped unapproved attempts and zero live receipts. A new review for the uncertain application was blocked. The ordinary preview rejected the same isolated CA with an SSL trust error; normal debug/release resources contain no fixture CA or emulator trust exception. [Native service evidence](../website/applications/fixtures/native-verification.json) records the outcomes independently of the phone UI.

The 360 dp phone layout was inspected in dark mode, RTL and 180% text after the adaptive navigation/direction fixes. All four destinations remained labeled and reachable. The actual Android document picker returned the selected 609-byte PDF in that configuration, and the encrypted draft retained it after force-stop and relaunch. These are emulator and specific-configuration observations, not physical-device acceptance or TalkBack speech validation. [Android verification](../android/checks/verification.json) records final source/artifact fingerprints and commands.

The ordinary Android preview is version **0.2.0**, build **2**, package `com.saleh.careerfinder.preview`; its APK is 11,816,005 bytes with SHA-256 `ecffb59697d0a87757d117ea0a6fd2aed66daaa1731bcf95a7a09ddf99ed87e3`. It is locally debug-signed. The separate acceptance package is never supplied as the user preview.

The first candidate's dated evidence remains available in the [initial phone update](Phone-Update-2026-11-16.md); it must not be relabeled as a run against changed files.

## Repeatable repository checks

[Phone quality](../.github/workflows/phone-quality.yml) runs on relevant source changes to the candidate branch or main, on pull requests, and on manual dispatch. Its jobs execute the existing web/service regressions and synthetic TLS diagnostic, compile/lint the ordinary Android preview and its instrumentation, run the production iPhone client/store through the standalone Swift harness, and build the unsigned iPhone app on an isolated hosted Mac. It uses pinned official actions and read-only repository permissions. It performs no deployment, employer submission, simulator launch, release signing or store upload.

A compiled instrumentation APK does not establish emulator execution. The separate recorded native runs remain necessary for UI and HTTPS acceptance evidence. Actual hosted runs and their associated commits are visible in the repository's [Phone quality workflow](https://github.com/swonyu/ahmad-career/actions/workflows/phone-quality.yml); a workflow definition alone is not passing evidence.

## Remaining public-release requirements

This is a tested development preview. Public service hosting and operational access, employer-authorized live integration acceptance, full account-data retention/erasure/recovery, current privacy/support information, physical-phone accessibility and device QA, distribution signing and store review remain release work. The service still needs a configured HTTPS gateway; a source push does not create one. Existing iPhone discovery retains its limited Saudi coverage, while manually saved opportunities support any country or profession. The interface remains English.

The shared Mac's scheduled iPhone runtime/build handoff remains in force. Hosted unsigned compilation is an independent packaging check; it cannot establish phone installation, rendered SwiftUI behavior, Keychain/file-protection behavior, VoiceOver or a TestFlight/App Store release. No real employer application was submitted during this review.
