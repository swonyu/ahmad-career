# Career Finder: visible-key query repair

This is an unrun successor to `11cb3d4d8c15e9b16719b6e7091597f43633cda6`. The original full CI run `44135594938` passed three of five jobs. Its iPhone suite passed 16 of 17 journeys and failed the large-text application journey while waiting for a real typing key. This checkpoint does not establish a native or release pass.

## Observed failure and bounded repair

The failed accessibility tree contains a focused first-name field and exactly one system delete key with a 54 × 56 point frame. Three original video frames at 74, 92 and 116 seconds show that keyboard and key still visibly present. The log starts indexed key collection at 74.26 seconds, requests snapshots at 78.69 and 93.80 seconds, and reaches failure at 124.12 seconds. The five-second predicate configuration did not bound the underlying XCTest snapshot call.

The repair creates the exact `delete` key's `firstMatch` query once after each real keyboard presentation and reuses that query for the existing `exists && isHittable` predicate. Clear's subsequent keyboard presentation gets a fresh query. No successful visibility Boolean is cached. This avoids the observed indexed collection materialization; actual native execution must establish whether it resolves the stall.

Apple documents [firstMatch](https://developer.apple.com/documentation/xcuiautomation/xcuielementtypequeryprovider/firstmatch) as stopping traversal at the first match, appropriate when the query is known to be unique. Apple documents [allElementsBoundByIndex](https://developer.apple.com/documentation/xcuiautomation/xcuielementquery/allelementsboundbyindex) as immediate query evaluation into indexed elements. The original failed tree, rather than an assumed keyboard layout, supplies the unique-key evidence here.

All 17 original test method bodies, 153 assertion expressions, 12 waiter calls, five-second readiness settings, real Clear/edit actions, exact empty-field and replacement-value checks, and the keyboard dismissal helper remain byte-identical. Shipping files are unchanged. The separate owner's `63eecda5` DEBUG provenance layout change was inspected and is not merged into this repair.

## Manual CI scope

The workflow adds `acceptance_scope=iphone-ui` to request all 17 iPhone UI journeys while skipping the other four jobs. Both the job name and log identify this as **partial CI**. The existing default `full` still runs all five jobs; push and pull-request routing remains unchanged. The existing `iphone-connection` one-journey mode and its exact-once result check remain unchanged.

The new scope adds no test selector. The native command, scheme, test step's 35-minute bound, job's 40-minute bound, evidence export, seven-day artifact retention, action pins, permissions and concurrency settings remain unchanged. A result inventory must still prove that all 17 journeys executed and passed. A green iPhone-only run cannot establish the four omitted gates or store readiness.

## Verification and next action

`source-retention.json` records the static source comparison. `workflow-scope-review.json` records the parsed workflow comparison and its event/input truth table. Two independent file-only peer receipts cover the helper and workflow. `failure-evidence.json` binds the original observations to file hashes; original video, images and full native results remain in the separately preserved CI evidence package.

No native execution, CI dispatch, push, build or store action was performed by the repair agent. The coordinator must verify the exact pushed commit and inspect active runs before dispatch: the inherited workflow has `cancel-in-progress: true`, so a new dispatch on an occupied ref could cancel another run. After the authorized partial iPhone run and separate dependency repair, the final integrated five-job gate remains required.

The original programme deadline was `2026-11-17T22:26:12Z`; the user's explicit additional 24 hours extends it to `2026-11-18T22:26:12Z` without resetting the original start.
