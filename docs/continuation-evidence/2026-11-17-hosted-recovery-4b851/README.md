# Career Finder — strict research, recovery and integration checkpoint

Recorded: 17 November 2026, approximately 22:04 Riyadh (19:04 UTC). This is a continuation checkpoint, not a release approval.

## Outcome

Two existing Grok conversations were verified in **Build** mode. A third conversation was created and verified in **Heavy** mode for deep research. Four Heavy responses were inspected and challenged against actual source, project evidence and primary documentation. The last correction request was submitted before the originating-browser connection failed; its acknowledgement has not been read.

The reviewed hosted fixes are implemented on the root continuation branch. They are combined with the publisher’s exact `243031d` checkpoint. The full hosted test chain passes after correcting an existing localization fixture binding. Type checking, zero-warning application/worker lint, worker/API checks and build passed. The required full dependency audit still fails with **19 high findings**. No audit exception, dependency-lock workaround, release, deployment or real account operation was performed.

## Exact source and ownership

Repository: https://github.com/swonyu/ahmad-career

Coordination: https://github.com/swonyu/ahmad-career/pull/1

Root branch: `continuation/feed-reliability-20261117-4b851`

| Checkpoint | Exact commit | Meaning |
| --- | --- | --- |
| Feed reliability | `d534a6c23bbe81615b8f7a40d3fb4204bb991781` | Response-body cleanup and retained validated feed prefixes, with regressions |
| Two terminal handoffs | `9878a7e8d3645952435181763802a91691fda4f9` | Native search/recovery instructions |
| Reviewed hosted source | `4221871aea33f79b29ee75b4b054502a0eb1add9` | Recovery, search, account and URL-guidance fixes |
| Publisher/root merge | `2c4862192d5fdd2dcb656c95619ea1b85cb74110` | Parents: root4221871 and publisher243031d |
| Localization fixture correction | `9971b7f9367e5a8374890f1c6b8648742c3491b1` | Adds the shared Add action binding to a markup-render fixture; no product change |

The merge had one conflict, in the live search announcement. Its resolution retains the publisher’s singular/plural message key and root’s combined partial-source/local-cap summary. The Saved shortcut’s singular label, Arabic keys, source-name direction boundaries and publisher count matrix survived. Independent review verified that native source, workflow files and the dependency lock are byte-for-byte equal to the publisher parent.

| Owner | Current boundary |
| --- | --- |
| Publisher d57f4cd77813 | Integrated native source, CI scheduling, signing and stores |
| Development 5bc6158967e8 | Dependency investigation and its sealed development changes |
| Root 4b851318da2d | This isolated feed/hosted recovery/search integration and evidence |
| Native search 01a1ea9d107f | Registered 11cb-based native discovery lane; sole shared native localization writer |
| Native recovery 01a1ea9cfd25 | Registered 11cb-based receipt/profile/import/recovery lane; requests strings from native search |

The terminal lanes are already registered. Their handoff files are continuation instructions, not a request to launch duplicate workers. No new implementation checkpoint from either native lane was independently verified in this foreground pass. Good Spender remains excluded.

## Grok sessions and actual progress

| Session | Verified mode | Delivered work and limitations |
| --- | --- | --- |
| https://grok.com/c/adc8cfe9-ed35-4fcd-9961-d1fc081daef0 | Build | Actual four-component account patch. Its custom-DOM run failed five of six checks and is excluded from passing evidence. Root corrected the patch, independently reviewed it, and integrated meaningful regressions. This session acknowledged the pause on further product edits. |
| https://grok.com/c/abe34c88-8973-4ecb-aacc-9a7e595c33ef | Build | Independent consent, recovery and native-source critique. Its eight transcription fixtures under Node22 are research probes, not pinned project acceptance. Useful native findings were routed to the existing native owners. |
| https://grok.com/c/3bf518a8-10be-40cd-9d0e-7a811c512a74 | Heavy | Four inspected research responses, progressively focused on primary sources, precise source attribution, feed-budget alternatives and vault/concurrency counterexamples. The final request corrects remaining overclaims; its response is uninspected because browser access dropped. |

Existing source packages and images were not resent. Mode selection alone was not used as proof of progress: actual answers, source ranges, patches and test outputs were checked. A completed session awaiting integration review was left paused rather than given overlapping edits.

The existing hourly continuation task was updated, without creating a duplicate schedule or restarting the work clock. It retains the cutoff **19 November 2026 at01:26:12 Riyadh /18 November22:26:12 UTC**. Scheduled checks are not a promise of continuous execution. Active owner and foreground-work safeguards remain.

## Validated findings and repairs

### 1. Response resources and partial discovery

Early response rejection previously left response bodies uncancelled. The committed repair attempts cancellation without allowing cleanup to replace or delay the original validation/timeout error. Reader ownership is released on all relevant paths. The targeted provider and frontend cleanup suites cover these cases.

A later transient failure during Lever pagination previously discarded already validated rows. The repair retains that prefix with explicit partial/error/retry metadata. It retains the total source deadline, response-size limits, cache bounds, compare-and-set protection and old-cursor rejection. A failure before any valid first page still reports unavailable; it does not invent results.

The practical fallback is a validated employer-board link. Actual Chrome checks verified the link’s destination, source-specific accessible text, new-tab target and `noopener noreferrer`. The local test interlock deliberately blocked external navigation, so those UI checks do not establish that every employer site was reachable. Earlier bounded live probes and their timestamps remain separate evidence.

Increasing all timeouts or blindly retrying was rejected. A source has a10-second total budget and a5-second per-request budget. Fetching500 records at100,50 or25 records per upstream page takes up to5,10 or20 pages respectively. Smaller payloads may improve an individual response but consume more requests for equal coverage. Upstream page size is distinct from the50-result UI page. No new retry strategy was implemented without evidence.

### 2. Clear operations preserve unfinished work on failure

Clear now captures and checks the confirmed scope and generation. Dirty forms, editor state and recovery identifiers remain until the relevant storage operations succeed. If recovery removal commits but the main reset fails, the displayed recovery state reflects the completed removal while the current draft remains available.

The independent review caught an additional race after a committed main reset: a stale UI return could release the autosave fence and recreate recovery data. The repair marks the reset committed before the later UI-validity check, retaining the fence after that committed reset. Failed attempts release only their own fence. Damaged-data reset remains available through the appropriate account/workspace scope.

### 3. Restoring a recovery copy creates an editor-owned fork

The baseline reused one recovery ID across tabs. Storage compare-and-set alone could not prevent one editor’s successful save from cleaning up a recovery record another editor still relied on.

The repair persists a fresh UUID recovery copy before adopting the recovered fields. Each editor owns its new copy, while the shared source remains available. Quota and identity/generation failures preserve existing edits instead of partially adopting the new form.

### 4. Search completeness and the local200-result boundary

The UI distinguishes source completeness from the local display limit. At200 results with a continuation cursor, the visible guidance and live announcement ask the user to refine the query, location or boards. Load More is absent. Exactly200 exhausted results retain completion wording without a false cap warning.

Partial-source guidance and local-cap guidance can appear together. Stale and unavailable boards retain source-specific explanations and the employer-board fallback. The publisher’s singular announcement and Saved label remain intact.

### 5. Applied selections and employer-board keyboard behavior

After a successful, scope-validated record save, marking a selected job applied removes only that job from the pending selection. Other selections and employer answers remain. A stale selected/applied checkbox can be unchecked; applied jobs cannot then be newly selected. Final Prepare and active-plan protections remain.

Ordinary Enter in the employer-board URL field now invokes the same Add action as the button and prevents the Search form’s default submission. Real Chrome reproduced the old behavior and confirmed one Add with no search request after the fix. Enter in the job-title field still searches. Composition and legacy key-code guards have meaningful handler tests; actual IME behavior remains untested.

Malformed URL parsing exposed raw browser-engine text. The model now maps only the URL-constructor failure to an existing translated HTTPS-link message. HTTPS, credential, port, local-host/IP and canonicalization checks are unchanged. The regression failed on the original source, then passed. Arabic Chrome showed the existing Arabic guidance while preserving the entered value.

### 6. Account recovery lifecycle, focus and announcements

Real Chrome on the original component reproduced a delayed signout reply navigating after SessionRecovery unmounted. The corrected implementation aborts obsolete requests and checks operation identity and generation before navigation or errors. It preserves the expected-account body and the real internal-redirect allowlist. Client cancellation does not undo a mutation already accepted by a service.

Peer review found a second candidate defect: A starts recovery, the same mounted component changes to B, then returns to A; stale busy state could leave A’s button disabled with no request running. A keyed inner action now gives each account fresh state and refs. The new regression checks the actual wrapper key, derived busy state and rendered button before invoking retry. It failed on the intermediate candidate and passes on the correction.

The useful Grok changes remain: confirmation-entry focus, cancel-return focus, explicit button types and a meaningful busy Connect name. OAuth cancellation remains polite status feedback; verified success still requires service confirmation. Unnecessary OAuth alert autofocus was removed. Parent error announcements in ProviderConnections, AccountPanel and ConnectionPanel now contain the error text separately from the interactive recovery interface.

The original candidate’s cleanup expression caused a strict-lint warning. An equivalent guarded assignment removed it without disabling the rule. All final application/worker lint passes with zero permitted warnings.

### 7. Arabic/English direction

Email and URL direction boundaries are explicit. Free-text job title, employer and location use automatic direction. Actual Arabic Chrome editing showed LTR URL and English-leading employer content, RTL Arabic-leading title/location content, preserved values, and no document-level horizontal overflow at390 CSS pixels. These checks establish the observed browser layout, not VoiceOver/TalkBack acceptance.

## Strict critique: claims not accepted as findings or passes

The research was useful only after reconciliation. The following claims were corrected or rejected:

- A failed identity check is not a reason to reveal private workspace data. Existing retry/confirmation paths must preserve that boundary.
- A ready attempt can exist before user approval; labeling every ready attempt Approved would misrepresent consent.
- Unknown remote status is excluded by the existing remote-only contract. That is not automatically a filtering defect.
- An error using a status region is not by itself proof of a WCAG failure. Alert feedback should not unexpectedly move keyboard focus.
- Root’s retained Lever-prefix implementation belongs to d534a6c, not development63e.
- The URL parser allows bounded tracking parameters; it does not reject every query parameter. HTTPS default port443 is normalized by the URL implementation.
- Account switching increments the UI generation and quarantines work; it does not itself increment vault/safety reset epochs.
- Two direct stale vault writes differ from higher-level safety operations, which retry conflicts and may preserve both concurrent additions. A universal “only one tab succeeds” acceptance condition is wrong.
- The local Clear excerpt contains no server mutation or cancellation path and cannot prove a remote-cancellation outcome.
- No user-facing import route does not prove export completeness, recoverability or round-trip integrity.
- A quota failure before transaction completion does not test an error after a committed write.
- Grok’s proposed tests were never counted as executed. Its repeated “Severity: None” labels did not close uninspected or untested scenarios.

The four Heavy reports and the final correction request are retained with this evidence. The fourth report remains a partial source-review note, with its unsupported closure claims explicitly rejected.

## Executed verification

Pinned runtime: **Node v24.22.3**, npm11.20.0.

| Check | Recorded result |
| --- | --- |
| Recovery/search/selection focused suite |76 passed,0 failed |
| URL/model suite |18 passed,0 failed after intended baseline failure |
| Corrected account lifecycle candidate |16 passed,0 failed; intermediate A→B→A candidate failed1 of16 |
| Full hosted npm test, first merged attempt |Main Node section284 passed,4 localization-fixture ReferenceErrors; failure retained |
| Full hosted npm test after fixture binding repair |Exit0; PDF6/6 and main Node288/288, plus the remaining chained suites and vault checks |
| Discovery integration |47 check groups;97 successful responses parsed by actual client schema;8 actual workerd requests; no real provider requests |
| Hosted phone integration |19 groups;164 actual workerd requests; synthetic providers only |
| Hosted applications/storage verification |63 groups using actual local D1/R2 and synthetic HTTP |
| Type checking |Passed |
| Application/worker ESLint, maximum warnings0 |Passed |
| Separate actual worker check |Passed;17 requests |
| Browser API/pairing checks |14 passed |
| Production build |Passed |
| Full dependency audit |**Failed:19 high findings**,0 critical; required gate unchanged |

The first full manifest’s broad `sourceUnchanged:false` reflects four generated verification JSON files being rewritten by the tests, not implementation changes. The retest explicitly excludes those known generated outputs and records `applicationAndTestSourceUnchanged:true`. The fixture-only follow-up did not change the product source that passed type checking, lint, worker/API checks and build.

Actual browser evidence used production React/components/styles with synthetic loopback services and guest storage. It covered English cap/exhaustion, Arabic cap/partial/stale/unavailable states, board keyboard submission, invalid-URL guidance and mixed-script editing. It preceded the publisher’s two singular-text changes. The final rebuilt fixture has not been retested in the browser.

The corrected account components have **no completed mounted-browser acceptance** yet. Browser access failed twice with the originating-context error after the earlier checks. Both owned fixture servers were stopped after their command paths were verified. Source and rebuilt fixtures remain for the next authorized browser session.

## Native CI and store state

| Run | Exact source | Verified result |
| --- | --- | --- |
|44147056599|243031d3f35040985c5b274e8ddf4a90adb0eda8|iPhone-only scope:17/17,0 failures,1283.028 seconds, normal TEST SUCCEEDED; export step succeeded; four other jobs skipped|
|44139018005|63eecda5c5c57805aeae1f5ba8e22af65e38ceee|3 jobs succeeded,2 failed; iPhone15/17 and hosted audit failed; connection setup passed|
|44135594938|11cb3d4d8c15e9b16719b6e7091597f43633cda6|3 jobs succeeded,2 failed; hosted audit and iPhone UI|
|44130275991|21f08f5c4509bd1fdbe9112003224bf2316edd2a|Historical five-job success, including17/17 iPhone; source/date-specific|

Root did not dispatch native CI or download/byte-verify the new run41 artifact archive. The iPhone-only pass does not establish full acceptance of the root combined hosted/native tree.

The current full audit is blocked by Picomatch’s advisory through4.0.7; the official advisory lists no patched version. Existing development owners reported rejecting a bounded guard because it broke a valid upstream case. No unsafe pin, blanket suppression or production-only-audit substitution was accepted. The full gate remains required.

Last verified store information remains a draft, with no current signed upload, attached build, submission or release independently established. Support-page availability is separate from app release status. Real provider callbacks, account unlink/relink and physical VoiceOver/TalkBack remain separate acceptance work.

## Next concrete work

1. Restore the authorized originating ChatGPT/browser-extension context. Reset the temporary viewport override and mark the three requested Grok tabs as deliverables; those cleanup actions could not run after access failed.
2. Read the final Heavy correction response, confirm modes/progress, and route only useful non-overlapping deltas.
3. Complete mounted-browser checks of the corrected account components: delayed unmount, account replacement, failure/retry, focus restoration, busy names and OAuth confirmation/cancellation in English and Arabic.
4. Continue native search/recovery through their registered owners. Publisher decides integration and any next shared native run.
5. Keep the dependency investigation with development. A real compatible remedy must pass the unchanged full audit and relevant upstream/project tests.
6. Reconcile any newer publisher changes before further edits, preserve all existing work and secrets, and keep implementation/test/build/signing/deployment/store states distinct.

## Primary references

- [GitHub Picomatch advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), rechecked17November: reviewed High, affected through4.0.7, no patched version listed.
- [W3C Alert Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alert/): alert announcements should not move keyboard focus.
- [HTML implicit submission](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#implicit-submission): relevant to the nested board-input Enter behavior.
- [Undici documentation](https://github.com/nodejs/undici): response-body consumption/cancellation is relevant to transport resource release.
- [Lever Postings API](https://github.com/lever/postings-api): upstream pagination and source contracts.
- [Indeed My Jobs](https://www.indeed.com/help/job-seekers/articles/205332490-what-is-my-jobs), [Huntr Activities](https://help.huntr.co/en/articles/10042702-activities), [Teal job tracking](https://help.tealhq.com/en/articles/14435727-how-to-track-your-job-applications): workflow comparisons do not justify inferring verified employer submission from an external-page visit.

Evidence limits are part of the result. This checkpoint supports continued coordinated work, not100% reliability or release readiness.
