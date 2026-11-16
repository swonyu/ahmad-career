# Selected phone acceptance evidence

These unchanged captures preserve concrete observations from 16 November 2026. They are technical acceptance evidence, not store marketing screenshots. Exact image hashes are in [manifest.json](manifest.json).

## Later accessibility correction — source 0a56340

The [updated application action](iphone-application-action-accessibility-fixed.png) shows the complete **Set up Auto Apply** label wrapping onto two lines at Accessibility XXXL. The [connection-sheet capture](iphone-application-connection-accessibility.png) shows its title and Done control. The passing case actually opened that sheet, dismissed it and returned to the action. The release coordinator inspected both unchanged images; the [visual review](iphone-application-action-visual-review.json) records their hashes and the narrow acceptance scope.

[Run 43949653473](https://github.com/swonyu/ahmad-career/actions/runs/43949653473) verifies source `0a56340fee907ffab0e4e5f25ac252de76a23c9c`. The [successful second attempt](iphone-ci-43949653473-attempt-2.json) executed all seven synthetic interface cases in 487.824 seconds with zero failures; its four non-UI successes retain their original attempt-1 execution times. The [first attempt](iphone-ci-43949653473-attempt-1.json) remains a six-of-seven failure: Xcode timed out launching the app before the large-text assertions. The cause is unproved, and no source, assertion, timeout or workflow changed for the single failed-job retry.

The large yellow acceptance banner still overlaps the top title in the application-workspace frame. That overlay belongs to the isolated DEBUG fixture; it was not edited out and is not a production-header or store-screenshot claim. The case verifies the disconnected setup action, not the connected selection or busy labels. Physical-device and screen-reader acceptance remain separate.

## Published 0.4 preview's passing iPhone run

The [final Search capture](iphone-search-final-passed.png) shows Search selected with the keyword/location fields, board picker and search action visible. It is the original capture from run 43923335555, attempt 2, on source `caa5ace14fe7b430db845d935a89803700cc7665`, using the isolated synthetic workspace on an iPhone Air / iOS 26.5 Simulator. All seven native interface tests passed in 600.248 seconds; this image supports the visible tab transition and does not itself prove the whole suite. The [final attempt record](iphone-ci-43923335555-attempt-2.json) contains all outcomes, the 14-capture manifest, input hashes and artifact identity. The [first attempt record](iphone-ci-43923335555-attempt-1.json) preserves its earlier six-of-seven result and unexplained missed transition. No code, assertion or time limit changed between these two attempts.

## iPhone search and keyboard observation

The [before frame](iphone-keyboard-before-return.png) is at 39.0 seconds in the recording of run 43913861800, attempt 2. The empty keyword field is focused and the system keyboard is visible. The [after frame](iphone-keyboard-after-return.png), at 42.0 seconds, shows the keyboard gone and two results from the empty-query search. Both frames use the isolated synthetic UI workspace on source `8ca0b34a8fb324d983c9bee63cd582a368fe4d59`.

The test's keyboard-container existence wait subsequently timed out, so that attempt remains a **failure: six of seven cases passed**. These frames support the narrower observation that Return executed the search and the keyboard visually dismissed. They do not establish every accessibility property or a passing suite. The [attempt record](../../apple/Checks/hosted-ui-attempt-43913861800.json) preserves the exact diagnostics and the later correction to distinct field focus and visible-keyboard checks. The current run's result belongs to the [release verification record](../phone-preview-release-verification.json).

## Android country selection

The [final country-selection capture](android-country-keyboard-final.png) shows the title, close control, selected country and confirmation action with the keyboard open. The actual keyboard Done action was separately observed to hide the keyboard. This is the accepted Android 0.4.0 preview with APK SHA-256 `3ce9a61e875eb295f6689993884b97d15a1356074e14775c5ebc55c6d0bf1c62`; the [Android verification record](../../android/checks/verification.json) records the compact-width, 180% text and Arabic RTL run separately from the normal 35-case run.
