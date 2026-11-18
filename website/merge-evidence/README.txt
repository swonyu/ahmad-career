Career Finder legacy compatibility integration — isolated web slice

Baseline: b613ab5a08c757f375591733d3c54e9d27f4cb23 (same web source as eebe748cb5afca0efcb9389255400a00cf5a480a).
Legacy source: d12fb82566ce8d3ebb4eded77506f4f01e303450.
Scope: website/** and apple/AhmadCareer/Web/** only. No Git index or branch mutations by this author.

Resolution
Retain current neutral v2 preferences, six primary navigation destinations, current branding and six active employer sources. Preserve imported-only application receipts and next actions, exact empty-sidecar precedence, strict unknown-data protection, optimistic cross-tab checks, portable metadata, additive backup and recovery copy. Earlier tasks and backups are contextual; next-action editing is a collapsed disclosure unless a meaningful record or unsaved draft exists. Legacy nine-provider adapters remain explicitly named and are not production refresh.

Backup schemas
Schema1's original seven-field reference profile remains accepted, including {}. Schema2 permits the fourteen current fields, validates supplied preferences, and rejects unknown keys or versions. Neither schema restores profile or checklist automatically. This local workspace is separate from connected phone/account workspaces.

Test preservation
The original 77 state groups from first await check through EOF remain byte-identical to the baseline; only the DOM/storage harness gained required stubs. Exact historical copies of thirty legacy source/check files remain in historical/public1.3. Obsolete personalized/technology-only review assertions are retained there rather than asserting that a newer neutral product must restore old personalized defaults. The active backup unknown-version check moves 2 to 3 because 2 is explicitly supported.

Evidence
- offline-integration-attempt2.log and attempt3.log retain the real intermediate failures.
- offline-integration-attempt4.log: all77 original state groups, original follow-up checks, backup checks and all15 compatibility groups passed.
- offline-compatibility-no-git.log: the compatibility entry point passed all77 imported state groups and all15 compatibility groups with PATH excluding Git and cwd=/tmp. No repository history is needed at runtime.
- compatibility-source-pins.json pins three baseline fixture files and eight checked historical files by source commit, path, exact byte count, SHA256 and Git blob SHA1. The baseline fixtures reproduce the actual pre-correction imported-map loss.
- web-freeze-before-portability-review.json and the corresponding prior review patch preserve the initial freeze.
- web-freeze.json gives the final reviewed hashes; web-compatibility-review.patch is a focused diff against the pinned baseline, not a replacement for the complete Git merge diff.
- pre-resolution-owned-paths.zip and manifest preserve the original conflicted worktree bytes.

Limitations
These are isolated Node DOM/storage stubs and injected mock transport results. No browser rendering, physical device, VoiceOver/TalkBack, Swift/native compilation, Android build, signed-in provider acceptance, signing, upload, Apple review or public release is proved. The main npm test is intentionally not run here because its server check invokes a build. The old composition script is an intermediate record and must not be rerun over the final freeze.
