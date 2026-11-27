# Career Finder: appearance and continuation status

Prepared 18 November 2026. This supplement records the work after the ten-pass review checkpoint. It does not replace historical test results or certify an unreleased successor.

## Result

The dark appearance now follows the Career Finder icon: midnight navy surfaces, soft periwinkle actions and warm ivory text. The palette is implemented in the reviewed browser and native source. The Arabic browser capture is a real rendered preview, not a generated mockup. The active continuation has incorporated the reviewed bilingual copy, job-link recovery, native compatibility and PDF-size corrections.

The combined app and test source independently inspected for this supplement was `d24b659a8bd1bcb11490dde4c717c1a2e3825cb7`, in the active owner’s `continuation/career-finder-owner-20261118-20698` branch. The owner then advanced to `b6614346cb4f0e72b9bde0e96ab083ea7df72371`; its delta is confined to simulator-inventory workflow handling and evidence documents. The reviewed app and UI-test files are unchanged. Source integration is verified; complete release acceptance is still open.

At 17:51 Riyadh, the owner started [full Phone quality run 44328888955](https://github.com/swonyu/ahmad-career/actions/runs/44328888955) for that exact successor. It was observed in progress, with no final conclusion. This earlier session did not launch a duplicate run.

## Appearance

| Role | Colour |
|---|---|
| Main canvas | `#101322` |
| Card surface | `#191E33` |
| Raised surface | `#242B45` |
| Main text | `#F3F0E9` |
| Secondary text | `#BBC3DD` |
| Main action | `#A5ACFF` |
| Action hover | `#BCC1FF` |
| Text on the main action | `#151936` |
| Selected surface | `#2A3153` |

The design uses restrained surface differences, a consistent action colour and clear selected navigation. The icon remains the visual reference. The recorded contrast checks cover 19 nominal colour-role combinations; they are not a complete accessibility certification.

The captured Arabic preview is `career-finder-b16-dark-ar-20261118.png`, SHA-256 `6c55a3334775b9064b9df479319470df6cbf544fe50c522744abc5030ab67cda`. It shows the application guide, retained unfinished-edit recovery and the five navigation destinations in the browser layout.

## Wording and practical improvements

The writing follows the user’s request for direct, natural English and Arabic. Nulaya-specific product instructions remain scoped to Nulaya. Career Finder instructions describe the action, what information is used and what the app actually confirms.

Recent reviewed examples:

| Context | English | Arabic |
|---|---|---|
| Phone connection | Sign in using your browser, then enter the one-time code here. | سجّل الدخول عبر المتصفح، ثم أدخل رمز ربط الهاتف هنا. |
| Connecting a draft | Connecting does not send your draft. You choose when to save your profile to the workspace. | لن تُرسل مسودتك عند ربط الهاتف. يمكنك حفظ ملفك الشخصي في مساحة العمل عندما تختار. |
| A follow-up that is due | Follow-up due: | حان موعد المتابعة: |
| Country selection count | Selected: {0} / 30 · Leave empty for no preference. | الدول المحددة: {0} من 30 · اترك الاختيار فارغًا إذا لم تكن لديك تفضيلات. |

Record-correction wording retains the distinction between editing a private phone record and changing an application already sent to an employer. Profile-copy wording explains that replacing a local draft does not itself send the profile to the service.

Small PDF sizes now use B, KiB or MiB as appropriate, formatted with the selected app locale. The confirmed display problem was synthetic résumé metadata of 20 bytes showing “0.0 MiB”; it now displays a useful whole-byte value. This did not establish that a valid real PDF contains 20 bytes. Stored file bytes, fingerprints and size limits are unchanged.

The job-link recovery correction prevents an already-completed Save or Discard flow from later publishing stale unfinished-edit feedback. The regression exercises actual production handlers and the encrypted recovery queue. Its four delayed-completion/error cases failed before the correction; the full recovery test file passed 129 tests afterward. That count is a focused test-file result, not a total for the entire app.

## Ten distinct critique scopes

Each review included relevant UI and wording observations. The detailed checkpoint records findings, source changes, rendered observations and remaining acceptance for every scope. The ten reviews were carried out; final acceptance of the combined program is not yet closed.

| Pass | Scope | Main decisions and work |
|---|---|---|
| 1 | Job-seeker goals, competitor research and navigation | Prioritise finding a role, preparing details, applying and following up. Retain the existing useful navigation rather than add another dashboard. |
| 2 | First use and search setup | Show selected employer boards and distinguish them from the sources of displayed results. Reuse a saved role only as a query prefill; preserve filters and require an explicit search. |
| 3 | Results and job details | Explain the actual searchable scope, show the destination hostname and retain agreement between visible and accessible job-link labels. |
| 4 | Saved jobs and follow-ups | Use practical stage labels, improve private-record correction and preserve previous record versions. |
| 5 | Profile and repeated application entry | Offer deliberate contact-field copying, keep PDF identity visible and improve very small file-size display. |
| 6 | Manual application and submission evidence | Make the employer-website route easy to find. Keep personal progress records distinct from confirmed submission receipts. |
| 7 | English, Arabic and RTL | Remove awkward wording, improve Arabic follow-up/count labels, preserve placeholders and check generated translations. |
| 8 | Visual consistency and accessibility | Apply the icon palette; inspect dark/light views, narrow layouts, keyboard focus and large Arabic text. Investigate the Settings theme-change jump. |
| 9 | Failure recovery, privacy and portability | Preserve unfinished edits, correct retired-editor races, verify export/reload behaviour and retain explicit privacy boundaries. |
| 10 | Independent critique and integrated regression | Reproduce supported defects, review exact changes independently and keep failed, unrun and passing checks distinct. Full final-source acceptance remains required. |

The research comparison included LinkedIn, Indeed, Teal, Huntr, Simplify, Bayt, GulfTalent, Naukrigulf and EURES. Useful patterns informed saved-job tracking, explicit next actions, manual application support and reusable profile details. Vendor descriptions, research samples, source inspection and actual app observations remain separate evidence categories. No representative Career Finder user study or universal superiority benchmark was performed.

Primary references supporting these decisions include [Indeed’s My Jobs guidance](https://www.indeed.com/help/job-seekers/articles/4412589551757-my-jobs-managing-applied-jobs?co=US&hl=en), [Teal’s job tracker](https://www.tealhq.com/tools/job-tracker), [Huntr’s extension guidance](https://help.huntr.co/en/articles/9859408-the-huntr-chrome-extension) and [Simplify’s application-fill guidance](https://help.simplify.jobs/en/help/articles/2415391-use-copilot-to-autofill-applications). The full research register and survey qualifications remain in the ten-pass checkpoint.

## Verification that actually completed

| Evidence | Observed result | Limit |
|---|---|---|
| Android run `44317593106`, source `1c253f0` | 116 tests passed, none skipped; all 22 recorded images verified and viewed | These results do not automatically cover later source changes. The captured UI is Arabic at large text size; English native visual coverage is not established by these images. |
| Full five-job run `44317593106` | Service, Android and iPhone logic/unsigned build passed | Hosted lint failed on an unused helper; the full iPhone UI suite did not start because simulator readiness failed. Overall result was failed. |
| iPhone focused run, source `87c3849` | Strict readiness passed on iPhone 17 Pro; five of seven methods passed | Profile typing and theme persistence failed. This was not the complete 17-method suite. |
| iPhone warning correction | Fresh generic compilation passed with no compiler, linker or analyser warnings | Two optional App Intents notices remained. Compilation is not UI acceptance. |
| Saved-draft recovery | 129 tests in the focused recovery file passed; lint and type checking passed | Full app/native acceptance still required. |
| Native copy correction | Generator check covered 1,824 strings and 149 templates; existing localisation checks passed | Updated native text still needs relevant final-source visual verification. |
| PDF-size correction | 39 checks of the exact formatting expressions passed across size boundaries and locale configurations | These JVM expression checks were not a Kotlin/Android compile or native UI run. |
| Arabic/English browser work | Actual navigation, manual-application guide, explicit copy, recovery, export and reload flows were reviewed | HTTP preview did not establish protected HTTPS/provider behaviour. |

The root visual review also found clipped notice text at a deliberately scrollable viewport. Source inspection found no fixed-line truncation. The remaining relevant check is to scroll the notice area at large Arabic text size, reach the complete ending and Dismiss action, and retain usable main-content space. A screenshot alone did not establish lost content.

The newer owner’s earlier Android run `44316849501` timed out while waiting for profile-save completion. Retained logs did not capture the individual state values or request result. The launcher image and empty process lookup were obtained after test teardown and do not establish an app crash. Independent source review accepted the current continuation’s live failure diagnostics: they preserve all 116 method identities and existing limits, capture the predicate values before teardown and rethrow the original failure. The structured output excludes profile text, pairing codes, tokens, headers and request payloads. Actual capture still requires execution, and the cause remains unproven until new evidence resolves it.

## iPhone follow-up review

The focused run established two mechanisms. Changing appearance rebuilt the light/dark content branch and reset the Settings list. The profile test tapped the Email field where its centre overlapped the keyboard toolbar. The active owner’s implementation uses a stable modifier chain and prepares the target field inside the unobscured viewport before the original real tap and typing actions.

Independent source review found all 17 test-method bodies and timeout values unchanged. The global assertion-token count is 203 instead of 204 because a field-existence assertion became an equivalent guard with `XCTFail` and return; the existence failure gate and method-body postconditions remain.

A separate two-line review patch proposes hierarchical foreground styles in light mode while retaining the current dark colours. Apple documents that hierarchical foreground styles preserve the material-vibrancy behaviour that custom styles can disable: [Material](https://developer.apple.com/documentation/swiftui/material.md) and [HierarchicalShapeStyle](https://developer.apple.com/documentation/swiftui/hierarchicalshapestyle.md). This is a source-semantics refinement; a visible light-mode regression was not established. The patch is not represented as compiled, integrated or run.

The helper’s whole-field-fit condition may be stricter than necessary for a very tall multiline editor. Current fixture inputs do not establish a failure from that condition. It is recorded as a bounded helper limitation, not a newly proven app defect or a reason to invent another acceptance requirement.

## Integration and remaining delivery

The later user-authorised continuation `20698f1e14d3` is the active integrator. The earlier session verified that its source includes the exact reviewed job-link files, all eight copy/generated-resource files, the three native warning-fix files and the same PDF-size patch. The independent integration receipt is `owner20698-reviewed-changes-integration.json`, SHA-256 `d12be42ee8d22f73f903c2d1adc71a13b3318495cd97748935f9c054fb13fab4`.

All earlier worktrees, historical failures, result bundles, images and review patches are preserved. The earlier coordinator has stopped competing source pushes, CI dispatches, simulator work, Site publication and merge actions. This allows the active continuation to validate one combined source version.

The remaining release work is the full exact-source five-job run, all 17 iPhone methods, the Android suite and relevant visual evidence, followed by the already-authorised normal merge and matching Site publication when those gates pass. Signed native distribution, store publication, live account consent and real employer submission are separate outcomes. They have not been claimed here.

The latest Site observation in this session, at 17:05 Riyadh on 18 November, was a saved, undeployed version 10; the public site remained on its prior deployment. This supplement does not claim that the new appearance is already live in production.
