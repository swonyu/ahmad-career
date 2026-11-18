# Native UI locale follow-up — 17 November 2026

## Exact baseline and observed CI outcome

This follow-up starts from candidate `859b84a4bb184cbc9bb5039be34e35ad4ca17356` and GitHub Actions run `44062756461` (Phone quality #28). Actions checked out the pull-request merge commit `fdab7f1181ab236be8f8085c562b357d9cfb4874`. GitHub's commit records give **the same tree** for that checkout and the candidate: `0ab8ce45b11c4f4564e88e55007e5a22111ab15e`. The head-to-merge comparison contains no changed files. These results therefore cover the candidate's exact file tree, while preserving the distinction between head and checkout commit IDs.

The following are observed results from that run, not results for the corrections below:

- Service and synthetic HTTPS gate: passed.
- Hosted HTTPS service and durable storage gate: passed.
- iPhone logic and unsigned build gate: passed. Its log records 120 application boundary checks, 503 lifecycle assertions across 77 scenarios, 43 discovery assertions across 13 scenarios, 21 saved-search comparison cases, and the nested typed-display contract. The unsigned iPhone-only build succeeded with the existing app identity.
- Android ordinary preview and instrumentation compilation: passed. Lint reports zero errors and 20 warnings. The previously fatal resource, API-level and translation findings no longer block this build.
- Android ordinary emulator suite: **103 tests ran; 11 failed and 92 completed successfully**. The later normal-preview TLS-boundary and synthetic native HTTPS phases did not run because this stage failed.
- iPhone interface acceptance: **17 tests ran; three failed and 14 passed**. The suite completed rather than timing out. The new Arabic-note saved-search test, ordered device-language fallback/English override, Settings appearance and the other completed core flows passed. The failures are analyzed separately below; a completed unsigned build is not interface acceptance.

The emulator settings receipt records an override size of 1080 × 1920 at density 480 (360 dp wide), font scale 1.8, forced RTL, dark system appearance and Arabic per-app locale. That does **not** establish that every fixture rendered Arabic. The failed-run Settings capture shows English content in a `ComponentActivity` fixture, while the standalone review capture shows Arabic. The fixture-context issue below explains why the platform-settings receipt alone was insufficient.

## All eleven failures and the corresponding correction

The original failing log and captures are retained. No failing test is skipped or replaced with an English-only variant.

| Failing test | Observed failure | Source-supported diagnosis and correction |
| --- | --- | --- |
| `LinkedInPhoneAcceptanceTest.exactApprovalLinkAndExternalSearch_areReadableWithoutClaimingSubmission` | English `Search LinkedIn` selector finds no node. | The second mount omitted `CareerLanguage`; its capture visibly contains Arabic. Mount the production language provider and select translated app copy. Preserve the exact, untranslated review URL, encoded external-search URL, zero application requests and zero receipts. |
| `NavigationPhoneAcceptanceTest.privateRecord_datesNotesAndFollowUp_areUsableAtLargeText_withoutCreatingAReceipt` | English date-choice description is absent. | Date semantics now format a translated label. Use that localized description and a consistent Arabic host. Keep date cancel/confirm, original Gregorian values, note persistence, follow-up, discard, history and no-receipt checks. |
| `NavigationPhoneAcceptanceTest.connectionUsesTwoSteps_andPreservesTheChosenCustomAddressUnderAdvanced` | English step heading exists, but the English nested Action does not. | Outer copy was captured in the display context while the nested dialog Action read its window context. Keep selected copy through a dedicated composition value, synchronize the fixture as production does, and use localized selectors. Preserve advanced-address visibility, exact chosen origin/code, allowed routes and record-only import assertions. |
| `NavigationPhoneAcceptanceTest.clearingAnAppliedRecord_requiresASeparateConfirmation_andKeepsEarlierHistory` | English save-record Action is absent. | Same nested dialog/context seam. Keep the separate correction confirmation, cancellation, unchanged saved record and retained earlier history. |
| `PhoneAcceptanceTest.phoneProfile_survivesActivityRecreation_withoutAnyService` | English `Profile` selector is absent. | MainActivity correctly synchronizes Arabic platform language. Use the existing `navigation-profile` semantics and localized field labels. Preserve exact original profile values and Activity recreation. |
| `PhoneAcceptanceTest.blankWorkspace_hasHonestEmptyState_andConnectionRequirement` | English discovery heading fails its visibility assertion. | A generic `assertIsDisplayed` failure against an English selector does not prove clipping. Wait for the loaded discovery list, scroll the translated heading into view, then keep the visibility and honest-empty-state checks on all relevant tabs. |
| `PhonePolishAcceptanceTest.discoveredRole_savesPrivately_andManualApplicationRemainsSelfReported` | English `Search jobs` is absent. | Use the actual display locale for controls and existing navigation semantics. Keep exact URL preservation, private save, explicit Applied stage, self-reported label, private persistence, no service requests and no verified receipt. |
| `PhonePolishAcceptanceTest.unfinishedOpportunity_closeChoicesKeepAndDiscardOnlyTheDraft` | English `Add opportunity` is absent. | Use translated app copy and composed localized close descriptions. Preserve keep-editing, keep-draft, reopen, exact draft title, discard and empty saved-job assertions. |
| `PhonePolishAcceptanceTest.profileEssentials_andCountrySelection_preserveSingleNamesAndCancelledChoices` | English `Profile` is absent. | Use the existing navigation tag and localized form labels. Keep the raw single name/email, unselected PDF, JP selection, FR cancellation, retained ISO code and zero-service assertions. ISO country codes are not translated. |
| `PhonePolishAcceptanceTest.localOpportunityRemoval_requiresConfirmation_andPreservesOtherSavedRoles` | English interpolated remove description is absent. | Format the translated accessibility description with unchanged employer/title arguments and bidi isolation. Keep separate confirmation, cancel preservation, the surviving role's exact URL, saved-state checks and no-receipt assertions. |
| `WorkspaceAccessibilityRegressionTest.shortMultilineNote_canExpandAtLargeText_withoutClippingItsLastLine` | English `Read full note` is absent. | The standalone fixture used Arabic resources. Keep Arabic content and the explicit 200% Compose density override; translate toggle selectors. Preserve all six-line, unlimited-lines, no-overflow, no-ellipsis, last-character and final-line-height assertions against the original raw note. |

## Product changes, kept separate from test maintenance

### Selected copy survives dialog window contexts

`CareerLanguage` now creates one `CareerStrings` value from its selected display context and provides it as a dedicated `CompositionLocal`. `rememberCareerStrings` reads this value before its standalone-context fallback. Android dialogs can install a window `Context`; nested `Field`, `Heading` and `Action` must continue using the app's selected language rather than silently changing to that context's resource locale.

The observed fixture failure is a mixed-context case. The inferred production risk applies when the display language and raw Activity resources differ, including the fallback implementation before Android 13. A new instrumented regression deliberately keeps the Activity's platform resources Arabic while the isolated app preference starts in English. It opens the actual opportunity editor, checks the nested field and action, changes to Arabic while the dialog remains open, changes back, and verifies that the original mixed-language title, private scope, empty saved-job list, empty receipts and zero service calls remain intact. **That new regression has not yet run on a device at the time this patch was prepared.**

Its layout-direction observation is at the root `CareerLanguage` provider. This is a modal-copy/draft regression with a root RTL assertion; it does not independently prove the geometry or reading order inside an Android dialog.

This uses the documented tree-scoped composition mechanism. Android's [CompositionLocal guide](https://developer.android.com/develop/ui/compose/compositionlocal) explains that descendant reads use the nearest provided value and that changing a `compositionLocalOf` value invalidates its readers. The choice to use it for selected application copy is this implementation's design decision; the guide is not evidence that this particular patch has passed a runtime test.

### Phone-import counts use translated app-owned labels

The phone-import summary previously passed English `linkCount` and `recordCount` phrases directly into an otherwise localized two-part template. It now translates those app-owned phrases before formatting. Employer titles, company names, URLs, record identities, profile values and stored text remain original. The existing record-only import acceptance path now expects the localized `0 saved links` and `1 private record` phrases while still asserting the same imported record and no restored bookmark.

## Acceptance changes

`PhoneAcceptanceEnvironment.kt` is test-only. It synchronizes the selected preference from the existing Android per-app locale through the same production helper as MainActivity. It does not alter Android's locale, font scale, direction, night mode, application permissions or stored workspace.

The fixture helper asserts Arabic resources, RTL resource direction and font scale of at least 1.79 (tolerance for the configured 1.8). Its composable wrapper separately asserts the actual rendered copy locale, layout direction and enlarged-text configuration. Existing per-language isolation tests retain their intentional English/Arabic changes. The new modal regression covers both languages in one open editor.

Selectors use existing navigation tags where the destination is the assertion target, and localized text or accessibility descriptions where wording matters. Unknown/user/employer values remain exact literals. Prefix-only English assertions for the LinkedIn guidance were replaced with the full corresponding localized messages; their honesty assertions are retained.

The later synthetic native HTTPS acceptance class uses the same updated selectors and Arabic environment assertions. Its PDF hash, exact payload values, explicit approval, unchanged marketing consent, uncertain-state retry boundary, cooldown behavior and zero verified-live-receipt checks are retained. **This is source maintenance for a stage that was not executed in run 44062756461; it is not new HTTPS evidence.**

## Three iPhone interface failures

The run used an iPhone Air simulator on the disposable hosted runner. The interface log records 17 completed tests, three failures and no unexpected test errors. The failing cases are not equivalent to the product problems suggested by their test names.

| Failing test | Observed evidence | Bounded follow-up |
| --- | --- | --- |
| `testArabicLanguagePersistsAndKeepsSavedProfileValuesAtLargeText` | After relaunch the first-name field had its Arabic placeholder instead of `Saved`. The test stopped before the following email assertion. | `CareerAppEnvironment.makeApplicationsStore` unconditionally wrote a fresh `phone-draft.json` for the DEBUG availability fixture on every launch. The test passed `availability: "disabled"` twice, so that fixture overwrote the saved draft before normal restoration. Seed only when the UUID-scoped draft file is absent. The exact raw-name/email, explicit Arabic persistence, RTL tab order and English-switch-back assertions remain. This is a demonstrated fixture defect; it is not evidence of production profile loss. |
| `testSavedLinkRemovalAtLargestTextKeepsCancelReachable` | `typeText` reported that `opportunity.title` lacked keyboard focus. The recording still shows the earlier URL field active. This happened during initial normal-size data entry, before the test relaunched at the largest text size or reached removal confirmation. | Wait for the existing Done action to finish dismissing the keyboard before moving to the next opportunity field. Keep the same taps and field-specific typing; do not retry typing into a different control. The shared replacement helper also requires a visible real keyboard key and verifies the exact resulting value for nonsecure fields. Removal, cancellation and largest-text reachability assertions remain unchanged. The follow-up run must establish whether the interaction succeeds. |
| `testSearchEmptyAndFailurePreservesPreviousResults` | The third search's readiness predicate timed out while enumerating changing per-index key snapshots, including zero-size padding. The final hierarchy and recording show the full visible keyboard, `offline error`, and the app's keyboard Search action. The earlier empty search and subsequent successful search had run; the final error-preservation assertions had not. | Query the observed system `delete` key by its semantic identifier instead of walking all keyboard keys by index. Continue requiring a real hittable key before submission, a reachable Search action, and keyboard/toolbar dismissal afterward. Both keyboard-toolbar and return-key submission paths remain. No keyboard assertion is removed or replaced with mere element existence. |

Apple documents that [`typeText`](https://developer.apple.com/documentation/xcuiautomation/xcuielement/typetext(_:)) requires keyboard focus. Its [`isHittable`](https://developer.apple.com/documentation/xcuiautomation/xcuielement/ishittable) documentation distinguishes a computable hit point from mere existence. Those API requirements support checking readiness; the failure-specific explanation above comes from this run's event log, hierarchy, recording and source. The proposed interaction corrections still require a new native run.

The DEBUG seed correction leaves any existing unreadable fixture file for the normal storage error path to preserve. It does not reset production storage, alter a workspace identity, change the real server's profile contract or relax a data-retention assertion. No shared Mac, signing or store operation was used.

## Local validation and next gate

The following checks passed in the isolated Linux checkout:

- `python scripts/generate-native-localization.py --check`: 1,761 entries per language and 144 bounded templates are aligned with generated resources.
- `python scripts/test-native-localization.py`: eight contract tests passed.
- `git diff --check`: clean.
- A focused selector inventory found no unknown static translated selector keys in the six updated legacy acceptance classes.
- Every original behavioral assertion count (`assertEquals`, `assertTrue`, `assertFalse`, `assertNull`, `assertNotEquals`, `assertIsOff`, `assertDoesNotExist`, and existing `assumeTrue`) is unchanged in those classes; the changed statements were also reviewed against their original data and state checks. No test, assertion, test-class selection or CI phase was removed.

Android and iPhone compilation and interface execution of this follow-up remain pending. The added Android modal regression increases the ordinary suite's expected test inventory by one; this expectation is not a claimed pass count. All 17 iPhone test methods remain. iPhone physical-device, TalkBack/VoiceOver, real Arabic keyboard, older supported Android versions, real consent/callback and authorized two-account isolation/recovery acceptance remain separate gates.

## Evidence retention

The failed Android artifact `14318609761` was downloaded and verified against its declared size (766,402 bytes) and SHA-256 `e7f9823ebba13e4130af455e2deabc48f8881c4752caa0ab2b1fd3fdc6b83ccc`. The iPhone build artifact `14318717509` was verified at 8,347 bytes and SHA-256 `3a317ab481066fb5f99e49b9fbe45807826f54b19ac53c942e6aba346a3bccfd`. Archive entries were checked for safe extraction paths before inspection.

The iPhone UI artifact `14320023688` was also downloaded, checked for safe extraction paths and verified at 290,340,760 bytes with SHA-256 `f47c75f9b68b145839f82b9252a0fe2f8fbd5e13f4418e97d0e02a1098a2ad51`. It retains the original xcresult, complete interface log, exported attachment manifest, UI hierarchies and failure screen recordings. Review frames were derived from copies; the original recordings are retained unchanged.

Original logs, reports and screenshots are retained in the run-specific evidence directory. The follow-up does not overwrite them, claim they show the corrected UI, or change any shared release branch, signing configuration or store resource. Hosted v7, private provider QA deployment and the unpublished native candidate remain distinct.

Capture filenames are not assertions of a reached state. In particular, `expanded-private-note-large-text.png` came from the test's `@After` hook after its English toggle selector failed; it does not prove that the note was expanded or that the later line-layout assertions ran.

## Resumed independent review: keyboard dismissal strength

The preserved first iPhone follow-up used the observed system `delete` key for both keyboard readiness and keyboard dismissal. An additional independent source review found that the dismissal predicate was narrower than the original acceptance requirement: another hittable keyboard key could theoretically remain after the `delete` key disappeared. This was an acceptance-strength finding, not a reproduced app runtime defect. The prior patch and its source-bound receipt remain preserved as the reviewed earlier state.

The small `iphone-dismissal-strength.patch` correction keeps the semantic `delete` key for readiness, where the failed run supports it, and restores the exact original search-dismissal requirement: **no hittable keyboard key of any kind, and no hittable Search toolbar action**. The new editor `finishTyping` helper and its no-Done guard now use the same all-key condition. Exact edited values, reachable controls, both search-submission paths, five-second bounds, all 17 test methods and all original outcome assertions remain.

The independent reviewer checked the correction and closed that finding in source-review scope. No new native compilation or simulator/emulator execution is implied. The [resumed-review receipt](strict-review-evidence/continuation-2026-11-17-cloud/native-ui-44062756461/keyboard-dismissal-peer-followup.json) records the prior and corrected source hashes, patch integrity, preserved test inventory and current validation boundary. Apply this correction after the original iPhone follow-up; its source hash supersedes only that file's prior candidate hash, not the failed CI record.
