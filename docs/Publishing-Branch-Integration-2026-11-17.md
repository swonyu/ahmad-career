# Career Finder: published-branch integration, 17 November 2026

This is an isolated publishing integration of the existing `swonyu/ahmad-career` repository. It does not replace the developer's working branch, draft PR, hosted deployment, signing configuration or store submission. Original published branches remain intact. The publishing 24-hour deadline is owned by the parent continuation; the separate development-session budget is not a replacement deadline.

## Ownership and exact source boundaries

The initial read-only inventory found seven published branches. The latest continuation owner was visibly active through draft PR [#1](https://github.com/swonyu/ahmad-career/pull/1). Its initial head was `eebe748cb5afca0efcb9389255400a00cf5a480a`; it advanced during this integration to `859b84a4bb184cbc9bb5039be34e35ad4ca17356`. That follow-up must remain part of the final ancestry proof. No assertion is made that the developer or earlier publishing owner stopped. A GitHub connector coordination comment returned 403; no comment was posted and no owner acknowledgment was obtained.

| Published branch | Pinned head |
| --- | --- |
| main | `303ee73e0e6389593f6cb08eba285405d60f19cb` |
| app-store/career-privacy-and-qa-20261116 | `0d665aae3447707149b61566d7ba135351c8da42` |
| app-store/career-workspace-copy-20261117 | `fd9c5399f2b7001b234b3b86bf72e2b36b5114c1` |
| career-finder-phones-verified-apply-20261116 | `949ce0ad327beab79fa7033423b462ebc7bd98be` |
| career-finder-public-1.3-20261109 | `d12fb82566ce8d3ebb4eded77506f4f01e303450` |
| career-finder-store-capture-20261116 | `6a29c0817b87d5baa36188a232222422020b8a35` |
| continuation/account-acceptance-20261117 | `859b84a4bb184cbc9bb5039be34e35ad4ca17356` (advanced from `eebe748…`) |

The integration uses a fresh sole-owned cloud clone. It does not mutate the inherited development checkout or any Mac working tree. All merge resolution is local. A receipt outside the repository records final commit/tree hashes and ancestry checks to avoid a self-referential commit ID.

## Conflict decisions

**Privacy and publishing wording.** The newer bilingual implementation already carried the publishing branch's truthful connection label and disabled-hosted-submission wording. It also had the richer current privacy/account explanation and a synthetic live-record fixture whose deadline is dynamically in the future. These current implementations were preserved. The safer live-submission guard, Stop behavior, large-text layout and current UI assertions were not replaced by older code.

**Public 1.3 stored data.** An ordinary save in the unmodified continuation reproduced loss of `importedApplicationRecords` and `importedNextActions`. The integrated stores preserve both maps and known employer metadata. Explicit sidecar records take precedence, including intentionally empty tombstones. A cleared note/task cannot reappear from an older imported fallback. Unknown stored formats remain untouched and block incompatible writes. Native raw-JSON comparisons detect external writes before replacing the file; these are optimistic conflict checks, not a cross-process locking guarantee.

**Portable backups.** Legacy `saleh-career-workspace` schema 1 remains supported. Schema 2 carries the explicit newer preference fields, so supported data is preserved without silently changing the old schema 1 contract. Restore remains additive: existing role/status/receipt/task values win, and incoming profile/checklist fields are reference-only. No account credentials, application approvals or signed-in workspace ownership are imported. A recovery copy precedes the record-changing write. Both current phone-workspace backups and earlier local planning backups remain visibly separate.

**Useful access without extra primary navigation.** Existing role details expose the earlier private next action, and existing data/recovery controls expose earlier backups. The legacy web view keeps its six primary navigation items; contextual routes and progressive disclosures provide old record/backup functionality. The modern five-tab iPhone/Android/hosted navigation remains current. English and Arabic note exports both retain private next-action text and unsaved drafts.

**Discovery, branding and recovered research.** Current neutral profiles, worldwide preference fields, device time-zone defaults, current brand/icon and recovery-only research are retained. The historical fixed Saudi technology product is not substituted for current general discovery. Older adapters and specialized tests/source are preserved with their original provenance; the legacy web's existing six active Workday sources stay its active contract. Current primary phone Search remains the separate general discovery implementation. The native JSON transport retains the stronger streamed 8 MB cap and exact-boundary regression coverage.

**Current-owner follow-up.** The later 859b84 source is integrated as a real merge parent, preserving its Saved-note search, Arabic comparison rules, account-scope query reset, provider-generation safety, optional CSV/calendar exports, monochrome Android icon and offline in-app language packaging. Any overlapping compiler/theme fix is resolved to the owner's current intent while retaining the additional legacy-data protection.

**Historical store capture.** Its branch deliberately replaced the quality workflow with an artifact-only capture job pinned to an older source/project inventory. The integration preserves that script, test and original workflow as historical/manual material; it does not register the obsolete capture class in the primary test target or replace the real five-job quality workflow. Those screenshots do not certify this integrated source.

## Evidence and current limits

- Initial continuation CI [44057279267](https://github.com/swonyu/ahmad-career/actions/runs/44057279267) passed the two service jobs and failed the two iPhone jobs plus Android. The iPhone source errors involved private cross-file references and a removed color symbol. The downloaded Android lint ZIP matched its published SHA256 and contained five errors: two style cycles, two API27-only attributes used in the API26 base resources, and one missing translation for the product name. Source corrections are prepared; this is not a claim of passing native execution.
- The owner's later run [44062756461](https://github.com/swonyu/ahmad-career/actions/runs/44062756461) belongs to 859b84. At the recorded check, iPhone logic/unsigned build and both service jobs passed. Android compilation/lint passed, but ordinary-phone instrumentation ran 103 tests with 11 failures involving scrolling, large-text controls, visible actions and touch injection. The iPhone UI job was still running. This owner-branch result does not validate the additional integration changes; consult the final receipt for the latest observed conclusion. The required minimum of 97 tests was not reduced, and failed assertions were not suppressed.
- Web tests exercise original continuation data loss, imported-only receipt/task roundtrip, tombstones, invalid/future formats, stale editors, metadata, schema 1/2 and current source/primary-navigation boundaries. All 77 original state test bodies are retained. Failed attempts and passing receipts are preserved under `website/merge-evidence`.
- Native regression source is added to the existing logic gate for imported data, backup roundtrip, tombstones, stale/cold-load unknown fields and streamed response limits. Native tests, new UI controls, VoiceOver/TalkBack, physical devices and unsigned/signed archives remain unverified for this merged source until explicitly run and recorded.
- Localization generation is local and deterministic; it does not use a paid service or send user content. Arabic/English resource equivalence and placeholders were checked at source level. This does not replace visual RTL, Dynamic Type or accessibility audits.

Only one final integrated CI candidate should be published after source review and head recheck. The existing push filters do not run CI for a local `integration/*` branch; a new PR or explicit dispatch can run the complete five-job gate once authorized. No CI dispatch, remote merge, force push, default/release-branch overwrite, signing, native Mac build, provider activation, hosted production deployment or store submission was performed by this integration task.
