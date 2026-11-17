# App Store draft for the recovered iPhone candidate

Prepared on 17 November 2026 for App Store Connect record `6820749119`. The root publishing owner observed version **1.0**, state **Prepare for Submission**, **no build selected**, three existing iPhone screenshots of unverified source versions, blank review contact fields, and obsolete review notes. Those observations are the parent's live console evidence; this child did not change the console.

The source reviewed here is `918cfaa455b76f217b21c6c01fe862ea95ebe920`, followed only by docs correction `eb4c883f3c5a4bfe1dfd683bd9c2d25a6d482711`. Its iPhone configuration is **1.1/build 7**, bundle identifier `com.ahmadalayed.career`, targeted device family **iPhone**. Android has its own version **0.6.0/code 7** and is not the source for this iPhone record.

## Reviewable payloads

- [English review notes](review-notes-en.txt) describe the actual native tabs, optional hosted account, local data, manual versus confirmed applications, and the current disabled live-submission state.
- [English description](description-en.txt) matches the corrected mobile listing draft.
- [Arabic description](description-ar.txt) carries the same behavior and limits. It is prepared copy, not an uploaded App Store localization.
- [Verification receipt](verification.json) records exact UTF-8 byte and character counts.

The notes replace the stale iPhone/iPad, Start/Search/Saved/Plan/Profile, no-account/cloud-sync and fixed-six-Saudi-sources assumptions. The native iPhone tabs are Start/Search/Apply/Saved/Settings, with Profile reachable from Settings. The candidate supports Arabic and English. Search uses the person's selected public Greenhouse/Lever boards; it does not promise exhaustive country or profession coverage.

## Inputs before submission

Reconcile the console version 1.0 with the intended source version 1.1 after the publishing owner verifies the exact app identity and signing record. This draft does not change either value. Bind the final descriptions and review notes to the accepted release commit; recheck if active owner changes alter behavior.

Supply verified review contact details and stable authorized review access in the console. A five-minute pairing code alone cannot provide continuing reviewer access. Validate the intended backend and actual primary login choices. Apple guideline 4.8 equivalence or an applicable exception remains a review gate; a ChatGPT sign-in option by itself does not prove compliance. Account deletion, provider success/denial/recovery, exact integrated native CI, physical-device accessibility, signing and distribution evidence remain separate gates.

Keep the three existing console screenshots until their versions are verified or current captures are prepared. Historical CI screenshots are not screenshots of this candidate. No screenshot replacement, store field write, build upload, signing change, submission, approval or public release was performed here.

No explicit app minimum-age policy was found in the current native privacy/policy, hosted privacy/support, repository store draft or pinned public privacy/support pages `156b3363b409c660e88ff2fb96fc02bf0f55baca`. No app-specific age override was invented. External employer eligibility and provider account rules are separate from the app-content questionnaire.

Sources: the candidate's `apple/AhmadCareer/NativeCareerViews.swift`, `NativeApplicationsViews.swift`, `NativeDiscoveryViews.swift`, `apple/AhmadCareer.xcodeproj/project.pbxproj`, hosted account/privacy code, and [Apple's current review guidelines](https://developer.apple.com/app-store/review/guidelines/#login-services), read 17 November 2026.
