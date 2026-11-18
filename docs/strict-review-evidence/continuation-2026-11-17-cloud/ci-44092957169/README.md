# CI run 44092957169: verified failing native acceptance and bounded follow-up

Observed terminal status: **2026-11-17 14:00:57 UTC**. [Phone quality run 31](https://github.com/swonyu/ahmad-career/actions/runs/44092957169) tested candidate `3a709eb15f1024df78ee03474f511568df2dc3de` through the actual PR merge checkout `55adcb006d1e439ea2fdfb9e12702506f60dcdb9`. GitHub's candidate-to-checkout comparison returned zero changed files. The separately measured local candidate tree is `452759cff642bd4f5657584f27cec58630dbeb9f`; see `checkout-equivalence.json`.

## Actual outcome

| Gate | Verified result |
| --- | --- |
| Service and synthetic HTTPS | Passed |
| Hosted HTTPS service and durable storage | Passed; 158 aggregate Node tests, plus the separately reported fixture/Workerd suites; dependency audit found zero vulnerabilities |
| iPhone logic and unsigned Release build | Passed; 120 boundary checks, 503 lifecycle assertions across 77 scenarios, 43 discovery assertions across 13 scenarios, 21 Saved-search comparison cases, store checks, and an unsigned iPhone-only Release build |
| Android compile, lint and native acceptance | Compile passed; lint 0 errors / 20 warnings. Ordinary acceptance: **104 executed, 103 passed, 1 failed, 0 skipped** in 209.039 seconds. The later normal-preview TLS and native synthetic HTTPS phases were not run because this phase failed. |
| iPhone native interface acceptance | **17 executed, 14 passed, 3 failed, 0 unexpected errors, 0 skipped** in 1166.314 seconds, on a disposable hosted iPhone Air / iOS 26.5 simulator. |

The native result exports and uploads completed successfully. `terminal-jobs.json`, `terminal-artifacts.json`, raw logs, runtime result JSON, and selected artifact files preserve the source and result. The earlier `initial-status.json` and `completed-artifacts.json` retain intermediate observations and are superseded by the terminal files. The ZIP archive hashes and sizes were verified before safe extraction; `artifact-verification.json` records those checks.

## Findings and proposed corrections

1. **Android Arabic / 180% text reachability.** `unfinishedOpportunity_closeChoicesKeepAndDiscardOnlyTheDraft` clicked the localized Add opportunity control before scrolling the Saved lazy list. Its node was not composed. The follow-up adds only `performScrollToNode` on `jobs-list` before the original click. All assertions, test selection, required Arabic/RTL/font settings and timeouts remain. The passing open-dialog language test uses the same scrolling pattern, but begins in English under Arabic OS resources; it does not prove this corrected Arabic-only flow. The independent source review accepted this narrow fix. The correction itself has not yet run.

2. **iPhone Arabic profile query at the largest text size.** The persisted first name was exactly `Saved`, so that assertion passed. The next email lookup failed: only first name at y787.7 and last name at y882.7 were in the lazy Form hierarchy. The failure screenshot and full hierarchy are preserved. The proposed correction reveals the email field before its unchanged exact `saved@example.invalid` assertion. The remainder of the persistence and language-switch flow still needs to run.

3. **iPhone replacement typing began inside existing text.** The exact-value checks caught retained suffixes from the test helper's assumption that the caret was at the end. The connection recording at 55 seconds visibly begins `https://custom.example.comservice.jazzy-…`; the rest is clipped, so a complete resulting URL is not claimed. The Saved search recording at 92 seconds shows `private-record` plus the remaining Arabic `جهة`. The first normalized Arabic note search had already matched the saved role successfully. These are concrete test interaction failures; these recordings do not establish a native product replacement defect.

The replacement correction opens the real native editing menu for nonempty ordinary fields, requires a reachable **Select All** action represented as either a menu item or button, taps it, deletes once, and asserts an empty field before optional replacement typing. The original final exact-value comparison, keyboard readiness and full all-key dismissal checks are retained. Empty requested strings remain covered. Secure-field behavior is unchanged. A missing menu action fails with a screenshot and UI hierarchy; there is no silent extra-backspace fallback. All 17 test methods remain, and assertion call sites increase from 139 to 141.

This interaction follows Apple's documented [press-and-hold API](https://developer.apple.com/documentation/xcuiautomation/xcuielement/press%28forduration%3A%29) and [Select All editing action](https://developer.apple.com/documentation/uikit/uiresponderstandardeditactions/selectall%28_%3A%29). Its actual availability across these iOS 26 test cases still requires a fresh CI run. Source review is not runtime verification.

## Evidence and limits

- `android-runtime-result.json` lists all 104 outcomes and the prior failed cases that now passed; its patch receipt identifies the one-line follow-up.
- `iphone-runtime-result.json` lists all 17 outcomes, exact source/patch hashes, failure classifications, and the SHA-256 and timestamp provenance of each derived frame. `iphone-attachments-manifest.json` is the original attachment manifest.
- `iphone-connection-55s.png` and `iphone-saved-search-92s.png` show the retained suffixes. `iphone-arabic-email-84s.png`, `iphone-arabic-failure-hierarchy.txt` and `iphone-arabic-failure-description.txt` show the lazy Form state.
- The full large `.xcresult` and recordings remain in GitHub artifact 14333469470; they are not duplicated into Git. GitHub retention is seven days, with the expiration recorded in `terminal-artifacts.json`. The selected durable findings, frames and logs are retained here.
- No shared Mac build, signing change, publishing-branch change, physical-device assistive technology pass, real provider callback, public deployment, or real employer application was performed or established by this lane. Public hosted version 7, the private QA site, this source candidate, and store releases remain separate.

Both follow-up patches are **pending fresh runtime verification**. The next candidate must preserve these failing-run results and run all five gates; even five passing gates would not establish release readiness or remove the separate real provider, disposable-account, physical-device and publishing acceptance blockers.
