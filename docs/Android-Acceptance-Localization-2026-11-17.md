# Android acceptance: locale boundaries and fixture isolation

## Evidence and source boundary

Owner source `859b84a4bb184cbc9bb5039be34e35ad4ca17356`, [run 44062756461](https://github.com/swonyu/ahmad-career/actions/runs/44062756461), passed Android compilation and lint, then failed ordinary-phone instrumentation: **103 tests ran, 11 failed**. The reported count error was the runner's failure summary after instrumentation omitted an `OK` footer. It was not permission to reduce the required tests or ignore failed assertions. The subsequent synthetic HTTPS phases were not reached.

The downloaded Android artifact matched SHA256 `e7f9823ebba13e4130af455e2deabc48f8881c4752caa0ab2b1fd3fdc6b83ccc`. Its settings record confirms 360 dp width, font scale 1.8, forced RTL, dark mode and Arabic per-app locale. Raw logs, screenshots and the failed result are retained outside this repository in the publishing integration evidence directory. The screenshot of the exact LinkedIn review shows Arabic labels; the note screenshot is blank and does not prove a successful note layout.

The all-branch integration was first sealed at `6066f23c2289cf1ad7808451b6cce19a90f267eb`, with all seven current published heads as ancestors. This correction is a later local source revision. The active owner's branch was rechecked immediately before editing and remained `859b84…`. No owner branch, signing state, shared native workspace or hosted deployment was changed.

## Diagnosis

All four failures reported as touch injection errors actually say that the expected English node was absent. No low-level input crash or failed touch dispatch is shown.

| Cases | Evidence-supported cause | Correction prepared |
| --- | --- | --- |
| Three NavigationPhoneAcceptance journeys: private date/note record, two-step connection, clearing an applied record | The parent composable captured English strings before opening a native dialog; nested Action and RecordDateField helpers read the dialog's Arabic Android context. The connection test found the English heading but could not find the adjacent English action. | Keep the selected display strings in a custom composition local. Reapply locale and direction inside full-screen forms and date-picker content while retaining the window configuration and existing state owners. |
| Four PhonePolishAcceptance journeys | These English-selector fixtures used the shared language preference. The earlier real MainActivity synchronized Arabic from Android, so later fixtures inherited Arabic despite expecting English. | Give the English fixture an explicitly selected, unique language preference file. It still uses the real language implementation and does not change Android's locale or shared app preferences. |
| Two PhoneAcceptance journeys | The actual MainActivity correctly synchronized the runner's Arabic setting, but its old selectors expected English. | Resolve only UI labels in the actual activity locale; keep user-entered values, visibility checks, file persistence and activity recreation unchanged. Wait for the actual workspace to load. |
| LinkedIn exact-review component and multiline-note component | These standalone components use the Arabic platform context, while old selectors expected English. | Keep the Arabic/RTL components and localize selectors. Check the complete LinkedIn handoff disclosure. Keep every note-layout assertion, including final-line visibility, overflow, maximum lines and 2x text. |

The context explanation is supported by the observed failures and source inspection. It still requires the next native run to confirm resolution and reveal any later layout failures. AndroidX's [Dialog implementation](https://android.googlesource.com/platform/frameworks/support/+/06a6ec97f0674c5e26666bd0590c92ce922d092f/compose/ui/ui/src/androidMain/kotlin/androidx/compose/ui/window/AndroidDialog.android.kt) creates a native window from the Compose view context, while [Android composition setup](https://android.googlesource.com/platform/frameworks/support/+/2e96ac2d37a419b45437e1b21f62c4ecfd6b1c74/compose/ui/ui/src/androidMain/kotlin/androidx/compose/ui/platform/AndroidCompositionLocals.android.kt) provides that view's context/configuration. Custom composition values carry the selected display language across this boundary. These primary-source references explain the mechanism; they are not a substitute for running this repository's pinned Compose dependency.

## Regression scope

All 103 original test methods remain selected. Two new methods exercise an already-open connection dialog through English → Arabic → English and actual in-app language buttons while an unfinished profile and private scope remain intact. The UI preference test has its own preference file and deliberately lacks the Android locale service, so it cannot change the runner's per-app locale; real OS language-picker acceptance remains separate.

The minimum ordinary-phone count increases from 97 to **105**, matching the current selected source methods. The original failed-result detection, timeout, 1.8 font scale, forced RTL, dark mode, Arabic platform setting, HTTPS checks and five-job workflow remain intact. No tests are skipped, no assertion is suppressed, and no retry or delay is used to hide missing controls.

Prepared source has not been compiled or run on an emulator/device. Passing owner-branch logic builds do not validate this integration. Physical accessibility, English/Arabic visual layout, real platform locale transitions, storage/account isolation, signing and release remain gated by their own evidence.
