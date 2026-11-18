# Native connection code and browser acceptance correction

Parent: d8d2e999d0348eb07942472a1d9e87d2fc4498a2. Prepared 18 November 2026.
This is a bounded correction after full CI44262971576 ran all17 journeys with11 passes and6 failures. Its two local passing journeys are focused qualification, not a complete release gate.

## Product correction

The connection code SecureField now requests an ASCII-capable keyboard, consistent with the hosted pairing-code alphabet (uppercase ASCII letters and digits). Original Arabic-device-language test typing produced no visible code and left Connect disabled before Safari opened. Diagnosis002 with the keyboard modifier shows nine masked characters and an enabled Connect action both before and after keyboard dismissal. No code, account, connection, submission, URL or browser presentation state is injected by the test.

The native Safari presenter and its dismissal semantics are unchanged. Temporary diagnostic NSLog calls from diagnosis002 were removed.

## Acceptance corrections

- Original CI polled Done only before the cold Safari service was ready. Its original recording subsequently shows native browser controls. The bounded wait now allows20seconds for the actual unique, visible, localized Done action; no fixed sleep or cached success is used.
- Native Safari's circular Done control has an overlapping address accessibility rectangle. Both failed local synthesized events touched its rectangular corner at(20.4,72.4), outside the visible circle centered at(38,90). The test now touches the center of the already-qualified real control, preserving the actual Safari Done action and every disappearance/return/state assertion.
- App launch-language overrides leave the system-owned Safari service in the simulator's English system language. The helper now distinguishes the expected browser Done label from the Arabic connection-form label. This proves an Arabic app on an English-system simulator; it is not evidence of globally Arabic Safari.
- Before-browser and before-blur screenshots/accessibility observations retain the real visible synthetic code representation. No plaintext credential comparison is claimed.

## Actual focused result

Correction003 built the actual app and ran two full selected test methods on iPhone Air/iOS26.5/arm64:
- testDeviceLanguageUsesAnOrderedSupportedFallbackAndAllowsEnglishOverride:77.313seconds, passed.
- testProfileReadinessAndSimpleConnectionSetup:85.301seconds, passed.
- Total2tests,0failures,162.614seconds. Native xcodebuildexit0.

Original failed diagnosis001/002 and their raw xcresults remain preserved in the owner's continuation evidence directory. This folder retains bounded source/results/geometry receipts and selected original captures. File hashes and exact source inputs are in qualification.json and media-manifest.json.

All17 test names and all original assertion calls remain. Source-independent engineering review inspected the bad touch evidence and the final corrected source/result. The next integrated five-job run remains required.

## Primary API references

- Apple's current SFSafariViewController documentation requires direct modal presentation and preserving standard browser interaction: https://developer.apple.com/documentation/safariservices/sfsafariviewcontroller/
- The current finish-delegate documentation says dismissal follows the callback: https://developer.apple.com/documentation/safariservices/sfsafariviewcontrollerdelegate/safariviewcontrollerdidfinish(_:).md
- XCTest tap uses a system-computed hit point; the correction uses the documented element-relative coordinate API for the observed circular control. It does not dismiss the browser programmatically.

## Independent qualification and retained warnings

Engineering independently matched both source hashes, all17method names, all187original assertion calls, the three actual center touches (Arabic once, English initial and reopened), and the two passing xcresult cases. No introduced P0/P1/P2 finding was established in this bounded delta. Two Invalid frame dimension runtime warnings appear identically in diagnosis001, diagnosis002 and correction003; this is not a warning-free claim. Full integrated CI remains required.
