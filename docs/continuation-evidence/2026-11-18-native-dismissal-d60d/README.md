# Native keyboard dismissal acceptance correction

## Problem and evidence

CI run 44277443136 tested commit 0db94c651d37cde774410915dbdd346cc743a458. Sixteen of the seventeen full native interface methods passed; the large-text method failed in finishTyping after the real Done typing action was tapped.

The original predicate eagerly enumerated every keyboard key and every matching Done action before querying the actual keyboard. The retained log records those reads at test times 243.57, 246.25 and 247.87 seconds, followed by timeout at 249.41 seconds. One observation path therefore consumed about 5.84 seconds against a five-second wait. The same test source in the preserved local control completed the corresponding observation path in about 0.17 seconds.

Independent UX inspection of the original variable-frame-rate recording found the keyboard and Done present at decoded PTS 239.275, moving away at 239.618333, and fully dismissed at 240.015 with the nine-dot unsent code retained. Under the recorded attachment/log alignment, the completed dismissal is about 2.3 seconds before the first all-key query. The decoded PTS values, rather than requested seek times, support that timing statement. Review, frame metadata, original log context and source bindings are retained beside this note. The original source video SHA-256 is c41ec5100f82834bf17b57b2ae17233defdb56d65908aeb3d742eaa75ce734f7.

## Correction and unchanged conditions

Only the finishTyping helper changes. Its unchanged five-second wait now observes the actual keyboard absence or nonhittability. After that transition wait, the helper explicitly checks the original no-hittable-key and no-reachable-Done conditions, then checks the actual keyboard again before leaving. Failure captures preserve the screenshot, original accessibility tree and observed condition values before assertions run.

The missing-Done branch still rejects any hittable keyboard keys. The real Done action must remain reachable and receives the same actual tap. All seventeen test methods, other helpers, product source and timeout values remain unchanged. Source outside finishTyping is byte-identical to the base. The resulting CareerFinderUITests.swift SHA-256 is 567f688796d08e655d6c47cb0e43874481b76dd5afaff235ffb1fd6cd3b434a3.

## Qualification

qualification.json records the evidence status at this snapshot. Independent review accepted the bounded delta and confirmed actual dismissal in the original recording. Root then ran the full previously failing large-text method on the frozen source: one test passed with zero failures in 114.137 seconds, xcodebuild exited zero, and the final receipt confirms the source still matches. The focused run receipt is retained beside this note. Complete combined acceptance on the final integrated source remains pending; this focused pass does not establish full release acceptance. No product change is part of this correction.

The evidence folder contains only bounded text/JSON and the helper diff. Original screenshots, recording and result bundles remain in the referenced evidence paths and the preserved CI artifact.
