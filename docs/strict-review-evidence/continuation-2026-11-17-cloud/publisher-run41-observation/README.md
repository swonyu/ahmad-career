# Publisher run 41 — partial iPhone acceptance

**All 17 iPhone UI journeys passed on publisher source `243031d3f35040985c5b274e8ddf4a90adb0eda8`. Four other jobs were intentionally skipped. This is a partial acceptance result.**

[Workflow 44147056599](https://github.com/swonyu/ahmad-career/actions/runs/44147056599) became terminal success at the 18:50:00 UTC metadata update. The first terminal observation was at 18:52:18 UTC; the complete [retained receipt](observation.json) was recorded at 18:53:26.772376 UTC. The [raw UI job log](iphone-ui-job.log) independently identifies the same source, whose tree is `192a239ea8c33e5ec74751f95a63089114822347`.

The suite completed **17 tests, 17 passed, zero failures, zero unexpected failures and zero reported test skips**, in **1283.028 seconds**. It ended at 18:48:21.421 UTC; xcodebuild reported `TEST SUCCEEDED` at 18:49:19.164358 UTC. Result finalization, evidence export and upload succeeded. The conditional connection-only verification step was inapplicable to this all-17-journey scope; that skipped workflow step is distinct from test skips.

| Journey | Result | Duration |
| --- | --- | --- |
| Largest-text core controls and first keyboard presentation | Passed | 88.894 seconds |
| Arabic persistence and retained profile values at largest text | Passed | 161.231 seconds |
| Profile readiness and connection setup, including Clear | Passed | 74.397 seconds |

The full named inventory is retained in the receipt. Hosted HTTPS, Service, Android, and iPhone logic/unsigned-build jobs were intentionally skipped, as the [job metadata](jobs.json) records. The [workflow summary](workflow-run.json) retains the exact run identity.

## Source and evidence boundaries

Publisher `243031d` changes the typing-key query to a `firstMatch` query created after actual field focus. It retains real existence/hittability checks and the five-second wait. Its tab helper is unchanged, and this tree does not contain development `63eecda5`'s banner correction.

Both journey names that failed in [development run 40](../ci-44139018005/README.md) passed in this different publisher tree. This supports the publisher's exact-source iPhone result. It does not establish a single cause for either earlier failure, apply the separate tab-synchronization recommendation, or qualify the newer banner's Arabic/dark layout. Development run 40 remains three passed gates and two failed gates. The full dependency audit, combined-source integration, real provider/account lifecycle, physical accessibility and release acceptance remain open.

This lane did not download or rehash the run 41 archive or inspect its captures. Successful finalization/export/upload is established from the log and job steps. The [independent root observation](independent-root-observation.json) records a second metadata/log read and an exact raw-log hash match. The original log is **575,717 bytes**, SHA-256 `410e95fc7748fdd43e0e688f715af8b7852773197085f2c7df46ef5092cb9c0e`. The [retention manifest](retention-manifest.json) binds all four original observation files.

## Count-definition correction

Both sources contain 17 test methods. Development has **144 `XCTAssert` calls and six `XCTFail` calls**, or 150 combined assertion/failure sites. Publishing has **146 `XCTAssert` calls and seven `XCTFail` calls**, or 153 combined sites. Earlier direct comparisons of 144 with 153 mixed count definitions. The current explanatory documents correct that wording; original timestamped observations remain preserved. This correction changes documentation only, with no added, removed or weakened test assertion.
