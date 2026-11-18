# Career Finder native stability repair

Base: `92266631b5eba3eb7d66810e6553535fe42cce86`.

## Observed failures

The retained fresh iPhone 17 Pro / iOS 26.5 attempt on source `87c3849bba6e1f03914a7a16943cd50a9b4f6f49` completed seven selected methods: five passed and two failed. The two affected files are byte-identical between that source and this base (verified with Git).

- Changing appearance recreated the List/Form structure in `NativeScrollPalette`, returning Settings to its top before the selected-dark assertion. The existing theme, relaunch and reachability assertions remain unchanged.
- The Email field tap center overlapped the keyboard accessory; First name retained keyboard focus. A visible keyboard was insufficient evidence that the intended field had received the tap.

Retained diagnosis: `/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/resume-20261118-ebb3eed5/native-fresh17pro26-87c3849-20261118T140031Z-a85ec6/failure-diagnosis.json`.

## Changes

The palette keeps one modifier chain around its content and varies style values. Dark colors are unchanged. Light appearance retains the system content background, primary/secondary colors, system bar material and automatic bar visibility.

The typing helper reveals the full real target above the keyboard and its actual accessory toolbar before tapping. It uses bounded real scrolling; no synthetic value assignment or hidden focus setter is introduced. Keyboard readiness, real typing, exact field-value assertions and all 17 existing native methods remain.

## Verification and remaining acceptance

`source-checks.json` records whitespace checks, native-localization generation verification, all eight localization contract checks, and syntax parsing of both changed Swift files. Syntax parsing is not typechecking, a native build, or UI acceptance.

The integrated candidate still needs its hosted compile and all 17 iPhone UI methods, including actual theme-scroll preservation, profile input, English/Arabic, large text and relaunch behavior. No simulator, shared native build, process cancellation, CI dispatch or publication was performed by this repair lane.

## Primary references

- [Apple: Demystify SwiftUI](https://developer.apple.com/videos/play/wwdc2021/10022/) explains structural identity and conditional view modifiers.
- [Apple: system bar material](https://developer.apple.com/documentation/swiftui/shapestyle/bar) defines material matching system toolbars.
- [Apple: toolbar background style](https://developer.apple.com/documentation/swiftui/view/toolbarbackground(_:for:)) documents how the style reaches its bar container.
- [Apple: toolbar background visibility](https://developer.apple.com/documentation/swiftui/view/toolbarbackgroundvisibility(_:for:)) documents automatic visibility tied to scroll position.
