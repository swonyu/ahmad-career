# iPhone transition diagnosis and owner handoff

**Current development result: source `63eecda5` / run 40 remains failed. This folder preserves diagnosis and a coordinated recommendation; it does not contain an applied helper repair.**

## Source-bound observations

The [run 40 packet](../ci-44139018005/README.md) retains the verified artifact inventory, original dark Settings capture and four timestamped frames from the two failed-test recordings. The keyboard frames show a caret with no keyboard at 80.0 seconds, then a visible keyboard and Delete glyph at 87.5 seconds. The raw trace begins its first indexed Delete-key enumeration at 83.37 seconds and reaches existence queries at 86.87–87.60 seconds before the five-second waiter fails. These are observations about a presentation/query transition, not proof of a persistent obstruction or a single underlying cause.

The other failing recording brackets profile-sheet dismissal: the sheet is visible at 98.5 seconds, then closed with Settings visible at 100.5 seconds. The helper waits for tab existence and immediately checks hittability; its failure is recorded at 100.49 seconds. A screenshot cannot establish the exact accessibility-tree state at that instant.

The [publisher run 39 raw job log](publishing-run39-iphone-job.log), independently fetched from job `134224144426`, identifies pre-banner source `11cb3d4d8c15e9b16719b6e7091597f43633cda6`. It reports 17 cases with one failure in 1225.105 seconds. The same first-name keyboard-readiness case fails at helper line 108 in 124.593 seconds. Its later debug snapshot includes a real Delete key with a nonzero frame. This corroborates a pre-existing readiness problem in a different integrated tree; the later snapshot does not prove that key was hittable within the earlier deadline. The [filtered phase excerpt](publishing-run39-keyboard-phase.txt) is a reading aid; the full raw log remains authoritative. No run 39 artifact/video verification is claimed here.

## Independent recommendation and current owner

The [independent review](independent-readiness-recommendation.json) recommends waiting up to five seconds for the same `button.exists && button.isHittable` condition before a single tab tap. It also proposed a bounded ten-second allowance only for the initial real-key readiness phase, with all other waits, exact-empty/exact-final values and keyboard-dismissal requirements intact. This is a recommendation to validate, not an implemented fix or a guaranteed cure.

Before editing, ownership recovery found active publisher helper work at `/workspace/scratch/d57f4cd77813/career-keyboard-query-recovery`. Its clean checkpoint `243031d3f35040985c5b274e8ddf4a90adb0eda8` was independently confirmed on `recovery/publishing-integrated-20261117-d57f4`. That owner's committed repair replaces indexed collection traversal with a fresh `firstMatch` query after each actual field focus, while retaining real existence/hittability checks and five-second waits. It has 17 UI methods and 153 assertion sites, distinct from this development lane's 17 methods and 144 assertion sites. Its tab helper remains unchanged.

The development lane therefore did not create a competing patch or CI run. [Comment 6957000200](https://github.com/swonyu/ahmad-career/pull/1#issuecomment-6957000200) delivered the exact phase evidence, separate tab recommendation and banner-integration requirement to the active owner at 18:22:23 UTC. The comment body was independently read back exactly. Delivery does not establish that a person read it or that the proposed correction passed.

## Remaining qualification

Run 40 provides English-dark banner/title separation only. The Arabic Settings capture was not reached because the test failed before Arabic selection. The single dark capture's paler tab bar remains an unverified appearance observation, with no later settled frame to establish persistence. RUN38-VIS-01 remains only partially qualified. Publisher's new `iphone-ui` workflow scope is explicitly partial: all 17 iPhone journeys, four other gates skipped. No current runtime success or combined five-gate pass is inferred from its source review.

The [retention manifest](retention-manifest.json) binds the exact raw log, filtered excerpt and independent review bytes. The [coordination receipt](../coordination-after-63eecda5.json) records the source/ref observations and active disjoint owners. The separate Hosted audit, real provider callbacks, disposable-account lifecycle, physical accessibility and release integration remain open.
