# Independent review: Saved empty-state correction and regression

## Disposition

**The product correction is valid and narrowly scoped. The strengthened v2 regression addresses the concrete false-positive gap found during this review. The four search-harness substitutions preserve existing assertions and strengthen reset-state coverage.** No additional product defect was established in this bounded review.

This is a read-only review of cloud files. I did not edit product or fixture source, run tests/builds, use the Mac/browser, stop a process, dispatch CI or post externally. The coordinator owns actual pinned execution and its receipts. This report does not certify a full suite, browser journey, integration or release outcome.

## Exact reviewed inputs

| Source | SHA-256 |
|---|---|
| Original Grok candidate `PhoneApp.tsx` | `4e92296fa0ccc8650cfc8a45f39ccc3258d49018ec9fe7bdbba6446b775f8221` |
| Corrected `PhoneApp.tsx` | `77b3f3bd43f7a7fab19b68807118fba41bb95409701d054ed8232bc139a7dcba` |
| Unchanged candidate/corrected `record-tools.ts` | `7394ea75959f766053f4b6373a4c1687fa0e095c5cec7c0d887571ffb9908494` |
| Initial added regression file, before strengthening | `6c3eadd0837d08703836544b97b32d68fff574b3c894716c4348f3a3b0be6b09` |
| Final corrected `phone-record-tools.mjs` | `a383e178f53782529ec4ff35a111113a7e13a752ceea22a0e24b351039686015` |
| Original complete `phone-search-workflows.mjs` | `6fa41727abc01ea9675fdf0c7d36d6659dab9a82bfd35cb0504909ae495e9061` |
| Amended complete `phone-search-workflows.mjs` | `87131e6186faf9169932c131b5f03d27909b5b6b27c08f0a0eed9b60a71b83a5` |
| Final six-file patch | `238849f4a6ae7744346d2321a0e756ddea7471dd3a4ab2b70e4ea7c1cc43a312` |

The files are in `candidate/`, `baseline/` and `corrected/` under this report's directory. The original fragment remains `empty-recovery-regression.mjs.fragment`; the strengthened fragment is `empty-recovery-regression-v2.mjs.fragment`. The six-file patch and its receipt identify the complete integration proposal; this review focuses on the correction and test amendments requested by root.

## Product correction: STAGE-EMPTY-001

Static byte comparison confirms that the corrected `PhoneApp.tsx` equals the original candidate with exactly one 43-byte item-count condition removed before `savedEmpty.clear`. There are no other changes between those two PhoneApp versions.

The previous condition required both an active empty-state recovery and at least one job/record. After deleting the last record-only item, the application can retain `savedStage = "interview"` with empty jobs and records. The stage selector and search input are then hidden; `savedListEmptyMessage` truthfully indicates an active filter and requests Clear, while the count condition hides that action. Explore is also hidden because `savedEmpty.clear` remains true.

The corrected condition renders Clear whenever `savedEmpty.clear` is true. Its unchanged real handler resets query, Saved view and stage. The helper then returns the default empty state, which renders Explore. Clearing is view-state-only; this correction does not call persistence, change jobs/records, delete data or broaden application/submission authority.

| State | Effect of correction |
|---|---|
| Items exist and a filtered empty view requests Clear | Existing Clear behavior remains. |
| No items and an active filter requests Clear | Clear becomes available. This is the intended correction. |
| No items and all filters are default | Clear remains absent and Explore remains available. |
| No filtered-empty section is rendered | No behavior changes. |

Retaining the existing selector/search visibility condition is consistent with this bounded fix because the newly available Clear action resets their hidden state. No unrelated record-deletion or account transition reset is needed to establish this recovery route.

## Regression review and resolved test finding

The regression extracts the actual Saved empty-state JSX and actual Clear handler from the source AST. It uses the actual helper and translation implementation, supplies empty jobs/records, renders the section, invokes the source-derived handler through bound setters, and renders the resulting default state. It covers English and Arabic for stage-only, query-only, Applied-view and combined Follow-ups/Closed restrictions.

### STAGE-TEST-001 — v1 label assertion could be satisfied by explanatory text

The initial regression used `filtered.includes(t(language)("Clear search and filters"))` on the complete HTML. Both stage-specific detail messages contain that same label substring in English and Arabic. In Arabic the button label `مسح البحث وعوامل التصفية` is also a substring of the detail's `امسح البحث وعوامل التصفية`.

Consequently the stage-only case could satisfy its Clear-presence assertion with a paragraph even when the button was absent, then directly invoke the extracted hidden handler. The aggregate original red result could arise from a later query/view case and did not, by itself, establish a valid button assertion for the exact stage-only defect.

The coordinator accepted this finding and replaced all four action-label assertions. V2 derives labels only from rendered `<button>` elements:

```js
const buttonLabels = markup => Array.from(
  markup.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g),
  match => match[1].replace(/<[^>]*>/g, '')
);
```

It checks actual Clear presence and Explore absence before invoking the handler, verifies the exact default filter tuple, then checks actual Clear absence and Explore presence. For this controlled rendered fragment, the action labels are plain English/Arabic text and the icon components are stubbed to null; paragraph text cannot satisfy those button-only assertions.

With the original item-count gate and the first `en / all / interview` zero-item case, no button is rendered in this section. The v2 presence assertion therefore rejects that source path before direct handler invocation. This is a source-level determination; the actual new red/green receipt remains the coordinator's execution evidence.

**Finding status:** closed in the reviewed v2 test source; latest actual pinned execution and real-browser acceptance are outside this review's certification.

## Search-harness amendment

The full original/amended files were supplied and read. Their complete diff contains exactly the four substitutions shown in `run-pinned-gates-rerun-1.py`:

1. Add initial `savedStage: "closed"` to the existing unrelated-query state.
2. Bind the actual new `records.matchesSavedList` helper in place of the obsolete `matchesSavedSearch` binding used by the extracted selector.
3. Supply the real shortcut's stage setter, updating the state object.
4. Replace tab-only equality with exact equality of query, view, stage and tab after the shortcut.

The test continues extracting the actual `jobs`, `records`, `recordsByID`, `recordJobs` and `shownJobs` declarations and the real follow-up shortcut handler from `PhoneApp.tsx`. The helper name matches the corrected production import/call. The `select()` closure re-spreads the current state on every invocation, so it observes the handler's updated stage and other filters rather than stale values.

All surrounding assertions remain: initially no visible record, then exactly the expected due record and URL after the shortcut, unchanged private snapshot, successful saved-note query and continued rejection of an unrelated query. The newly explicit closed starting stage makes a missing stage reset observable; full-state equality strengthens the former tab-only check. No assertion was deleted or weakened to conceal a product failure.

The source-substitution script verifies the original complete file hash and exactly one occurrence of each replaced string before writing. Those guards support reviewable applicability; they are not substitutes for test execution. This reviewer did not execute that script.

## Limits and next owner evidence

This regression renders a source-derived empty section and invokes its source-derived handler. It does not perform the entire React record-deletion journey, keyboard focus movement, native accessibility interaction or browser storage lifecycle. The source-level reachability analysis in `independent-stage-review.md` supports the injected zero-data state; the coordinator should retain the actual EN/AR browser sequence and normal acceptance evidence separately.

Earlier run outcomes and the later generated-verification-timestamp reconciliation were reported by root. Their Mac receipts were not opened in this cloud-only review, and the final strengthened-test run was announced rather than observed here. This review therefore makes no full-suite pass claim. Preserve the original stopped receipts and document any generated-evidence reconciliation against exact source hashes without silently reclassifying it.

No further source correction is requested from this reviewer for the inspected v2 proposal. Complete the owner-controlled pinned regression/full gates and record their exact outcomes, followed by the outstanding actual interaction checks.

## Independent harness peer check

A separate read-only reviewer verified both complete search-harness hashes and that the four guarded substitutions produce the amended bytes exactly. It independently confirmed fresh post-click state propagation and preservation of every surrounding assertion/fixture. Its final evidence is `harness-four-substitutions-peer-review.md` (SHA `3954a78f519102b4b9b39225d0b4706446644c4d31421795ee16f7ef5a5c5968`) and JSON receipt SHA `2ba2db34ddff1bb0ea166d867e381252608e9fea08df5af1b3bd3adf8a0726e7`. That reviewer also ran no tests/builds/remote actions and made no product or fixture edits.
