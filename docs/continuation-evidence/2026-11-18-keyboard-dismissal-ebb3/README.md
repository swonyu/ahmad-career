# Keyboard dismissal acceptance recovery — 18 November 2026

The interrupted coordinator left candidate 0db94c651d37cde774410915dbdd346cc743a458 and full run 44277443136. Recovery verified four successful jobs and 16 of 17 successful iPhone UI methods. The remaining large-text test failed inside finishTyping after tapping the actual reachable Done typing control.

The raw log records key enumeration at t = 243.57s, Done-action enumeration at t = 246.25s and keyboard existence at t = 247.87s before timeout at t = 249.41s. One predicate evaluation consumed about 5.84 seconds within its five-second wait. The retained final recording frame shows the keyboard absent. Product focus bindings were consistent; no product dismissal failure is established by this run.

The correction retains all three original postconditions and the actual tap. It observes each condition serially with its own bounded five-second wait, avoiding expensive collection queries sharing one deadline. It retains all real-key readiness assertions and all 17 existing journeys. Failure evidence includes the exact stage, last observation, screenshot and original accessibility hierarchy. The maximum aggregate observation allowance is three separate waits; this is not a product-performance measurement.

An independent reviewer inspected the actual patch and reported no in-scope defect. The corrected focused native journey passed once with no failures or skips on an isolated iPhone Air simulator, iOS 26.5, Xcode 27.2. The test includes profile labels, secure code entry, genuine keyboard dismissal and Safari return. Raw output and a source-bound verification record accompany this note. No app, hosted, Android or workflow source changed.

The focused result does not substitute for complete source acceptance. The new candidate still requires all five full CI jobs, all 17 iPhone methods, 116 Android cases, artifact/source verification and affected screenshot review before the authorized ordinary merge. Prior failure and superseded run evidence remain intact. Deployment, live provider consent, signing, installation and store release remain separate states.
