# Historical ordinary-screen capture

These files preserve the published `career-finder-store-capture-20261116` branch at `6a29c0817b87d5baa36188a232222422020b8a35`. The branch is a real merge parent of the publishing integration; the original branch and all commits remain intact.

The original workflow is stored as `historical-phone-quality-20261116.yml` outside `.github/workflows`, so it cannot replace or run alongside the five-job quality workflow. Its original bytes, the capture script and the capture test are recorded in `historical-source-pins.json`.

The capture guard deliberately pins production source and project inputs to `0a56340fee907ffab0e4e5f25ac252de76a23c9c`. Those pins were not changed. It will reject the newer integrated source. This historical material does not certify current screenshots, privacy, localization or release readiness.

`CareerFinderStoreCaptureTests.swift` remains preserved at its original path, but it is not registered in the current primary UI-test target. The ordinary acceptance target and five quality jobs remain unchanged. This prevents the historical live-discovery capture from unexpectedly running during normal acceptance testing.

Any new current-source capture requires a separately reviewed source manifest, ordinary-app checks and coordinated native ownership. Reusing older screenshots or weakening source guards is not an acceptable substitute. No capture was run as part of this merge.
