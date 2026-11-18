# Independent review of Grok Build1 Saved-stage candidate

## Disposition

**One validated source-level usability defect remains: the zero-item view can retain a hidden stage filter while omitting the Clear action that its own message tells the user to use.** Correct that boundary and add a rendered regression before accepting the candidate. I found no second concrete regression in the reviewed stage/view/search composition, applied-mark handling, follow-up ordering, localization additions or storage boundary.

This is an independent source and test-review result. I did not edit product files, run the candidate, run tests/builds, use a browser/Mac, post externally or change owner work. The 42-pass stdout belongs to Grok's reported execution and is not an independent rerun. Actual rendered phone/browser and assistive-technology acceptance remains with the coordinator.

## Exact source binding

Original five-section patch SHA-256: `ecc8b6a6c306cb57051d6cd504a0d9978cceaeb8e6c8df02447b1cec6cfcd245`.

I verified every old/context line of the PhoneApp and record-tools sections against the exact f8 review copies and reconstructed their candidate bytes in memory. No working source file was patched. The resulting hashes match the hashes in Grok's reply:

| Path | Base SHA-256 | Candidate SHA-256 | Candidate bytes |
|---|---|---|---:|
| `hosted/app/phone/PhoneApp.tsx` | `5b1f3db0063b062f21209870274b83a3def83cb6bb056c987fd7dac0653e6352` | `4e92296fa0ccc8650cfc8a45f39ccc3258d49018ec9fe7bdbba6446b775f8221` | 121261 |
| `hosted/app/phone/record-tools.ts` | `910dae464cd8504ed225fe5f68fa6b0750c7b7a9c7b18c6454ff4504a772e9a9` | `7394ea75959f766053f4b6373a4c1687fa0e095c5cec7c0d887571ffb9908494` | 6587 |

The other three patch sections were read directly: one CSS class addition, six Arabic message additions, and three new focused test groups plus the existing selector test adaptation. Root owns complete five-file applicability/hash verification. Machine-readable independent source binding is in `independent-stage-source-binding.json`.

## STAGE-EMPTY-001 — Clear is unavailable after the last record-only item is deleted

**Scope:** medium usability/recovery defect; no data-loss or security claim. The path is established by the exact source control flow, not an executed browser session.

### Reachable user sequence

1. In a guest workspace, retain one application record in Interview and no other items. Its bookmark may already have been removed. The existing Remove bookmark flow expressly retains the record, so this is a normal supported state.
2. Select Application stage = Interview. The record-only item remains visible because `recordJobs` synthesizes its display job and the predicate uses the stored record's stage.
3. Open Edit application record and choose Delete this private record, then confirm. The editor resolves the existing record by canonical identity and sets `dialog.existed = true`, so the Delete control is available. In a guest workspace there is no active server plan to block this operation.
4. The deletion handler persists the snapshot with that record removed, closes the dialog and clears the editor draft. It neither reloads the page nor resets `savedStage`. The model permits empty jobs and records arrays.

The resulting source state is `jobs=[]`, `records=[]`, `savedQuery=""`, `savedFilter="all"`, `savedStage="interview"`.

### Why the UI cannot follow its own recovery instruction

| Candidate code | Consequence in that state |
|---|---|
| `record-tools.ts` 29–36, the non-All stage branch | Returns the stage-specific empty message with `clear: true` and tells the user to clear search/filters. |
| `PhoneApp.tsx` 756 | Stage selector is hidden because both item arrays are empty. |
| `PhoneApp.tsx` 758, Clear condition | Clear is hidden by `(jobs.length > 0 || records.length > 0)`, despite `savedEmpty.clear` being true. |
| `PhoneApp.tsx` 758, Explore condition | Explore is hidden because `!savedEmpty.clear` is false. |
| `PhoneApp.tsx` 814, unchanged deletion flow | No `setSavedStage` or reload removes the hidden restriction. |

The three view buttons remain, but choosing All changes only `savedFilter`; it cannot clear the hidden stage. The overall app is still navigable through Search/Add job link, so this is not a total application dead end. The defect is the unavailable promised recovery action and misleading empty view. On the prior All/no-query view, the true zero-item state displayed Explore jobs.

`clearPhoneData` is **not** the reproducer: its existing success path reloads the document, which resets the view state. I did not rely on a speculative account/workspace transition either.

### Smallest correction and meaningful retest

Keep the Clear control available whenever `savedEmpty.clear` is true, including when there are zero items. Its existing handler already resets query, view and stage. After clearing, the existing true-empty branch can show Explore jobs. A broader reset during unrelated data/account transitions is unnecessary for this bounded correction.

Add a regression that renders the actual Saved empty-state JSX with zero jobs/records and a non-All stage, asserts that the promised Clear control is present, invokes the actual handler, then verifies All/default state and the true-empty Explore recovery. The existing test invokes a Clear handler extracted from source even if the real render condition would hide the button; therefore its passing result cannot catch this defect. A rendered condition test is needed, followed by the coordinator's actual browser sequence.

## Other reviewed contracts

| Area | Assessment |
|---|---|
| All / Applied / Follow-ups | Preserved. Applied still means the explicit `appliedElsewhere` mark, including a closed record whose mark remains true. It is not narrowed to stage Applied. |
| Stage intersection | The helper combines existing query/view conditions with the selected stage. Bare bookmarks count as Saved without record creation. Invalid control values are ignored. |
| Follow-up ordering | Existing date ordering remains; closed records stay excluded from Follow-ups. There is no added `updatedAt` sort. |
| Shortcuts and Clear | Both reset the new stage in source; the defect above concerns whether Clear is rendered in a reachable zero-item state. Ordinary tab changes do not reset filters. |
| Record-only items and identity | The merge, canonical identity lookup and record-only synthesis are unchanged. The candidate's corpus includes record-only entries. |
| Storage and exports | New state is React view state. The selector callback only updates that state. Record save, approval, export selection and schema are unchanged. The added export assertion still checks all records, rather than only the visible stage. |
| Unsaved/failed/stale changes | Selector reads stored records, not the editor draft. Existing save freshness/scope checks remain. The new handler test exercises failed persistence, stale rejection and successful stage save. It does not establish the actual React editor/browser lifecycle. |
| Localization | All six new English source messages have Arabic additions in the patch; stage options reuse the existing translated stage names. No missing added key or mismatched placeholder was found in the inspected diff. |
| Accessibility | A visible wrapping label names a native select, with ordinary option values. Existing shared control sizing/focus styles apply. This supports the source design; it does not prove keyboard, VoiceOver/TalkBack, zoom or RTL layout success. |

## Test evidence and remaining acceptance

The captured stdout reports **42 tests passed / 0 failed**. It does not itself contain the command, process exit or Node version; those are supplied separately in Grok's reply. No broad/full hosted or native pass is inferred from it.

The new groups cover the 22-item corpus, stage intersections, bare bookmarks, record-only entries, closed/applied combinations, follow-up ordering, Arabic query, source-bound Clear/due handlers, statically rendered select options, successful/failed/stale save and export independence. This is useful coverage, but the missing empty-render guard above is real despite those passes.

The unsaved/cancelled test name should be interpreted narrowly: it checks stored-list behavior and invokes the extracted discard handler. It does not type into a rendered RecordEditor, switch language while editing or exercise a real modal keyboard interaction. Root's pinned integrated regressions and actual EN/AR phone-browser acceptance remain necessary. No additional native build is requested from this helper.

The candidate fixture has 15 marked-applied records: four each in Applied, Interview and Offer, plus three marked Closed records. Do not introduce an assumed count of 16, an `updatedAt` order, or a reset on every tab change; none is part of the preserved contract.

After the correction, review the exact revised hashes, run the targeted red/green rendered regression and the required pinned/full gates, then record the real zero-item browser result. This report does not declare integration or release readiness.
