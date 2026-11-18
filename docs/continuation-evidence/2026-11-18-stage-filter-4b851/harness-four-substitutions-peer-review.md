# Independent review of the four search-workflow harness substitutions

## Bounded conclusion

The four substitutions in `run-pinned-gates-rerun-1.py:11–14` are justified by the observed production changes. They restore the real matcher binding and strengthen the due-shortcut state assertion. **No weakened assertion or invalid accommodation is evident in these four substitutions.** This is a source review only; it is not a full-suite pass or an endorsement of the separately reviewed empty-state regression harness.

The complete original and amended `phone-search-workflows.mjs` files were subsequently supplied locally and inspected. Their hashes match the expected baseline and corrected identities below. The full file diff contains exactly the four guarded substitutions; all other bytes, assertions, and fixtures are preserved. The corrected local counterpart is source evidence, not proof of the final Mac checkout or an executed gate.

## Substitution-by-substitution assessment

| Script line | Change | Effect on the check |
|---|---|---|
| 11 | Add `savedStage: 'closed'` to the pre-click state | Establishes a non-default stage. A missing stage reset can no longer pass merely because the starting stage was already `all`. |
| 12 | Bind `matchesSavedList: records.matchesSavedList` in place of the old search-only binding | Matches the actual function imported and called by the current PhoneApp. It supplies a real module function, not a forced passing predicate or a mock result. |
| 13 | Add a `setSavedStage` setter that records the supplied value in state | Supports the newly added production setter call using the same pattern as the existing query/view setters. It records the argument supplied by production; it does not force the expected `all` value. |
| 14 | Replace tab-only equality with exact state equality | Preserves the `tab: 'saved'` requirement and adds `savedQuery: ''`, `savedFilter: 'followups'`, and `savedStage: 'all'`. A missing or wrong reset is observable through the final assertion. |

## Source binding

In the corrected `hosted/app/phone/PhoneApp.tsx`, line 19 imports `matchesSavedList` from `./record-tools`; line 684 calls it with `(job, record, savedQuery, savedFilter, savedStage)`. `record-tools.ts:23–26` implements that function as existing text matching **and** view matching **and** stage matching. The previous text-search predicate remains part of the real implementation, so the new binding does not bypass search semantics.

The previous PhoneApp performed text matching and inline view filtering at line 684. The corrected due-shortcut handler at line 734 clears the query, selects follow-ups, resets stage to `all`, and navigates to Saved. The new four-field assertion corresponds directly to this behavior while starting with a non-default stage.

The script requires the old harness SHA-256 `6fa41727abc01ea9675fdf0c7d36d6659dab9a82bfd35cb0504909ae495e9061`, preserves a baseline copy, and requires exactly one occurrence of each old string before replacement. Offline source comparison confirms each old string occurs once and applying those four literal substitutions to the supplied baseline produces the supplied corrected bytes exactly. The file remains 460 lines; its byte length increases from 31,133 to 31,276.

The surrounding machinery also binds correctly. The harness reads and transpiles the actual `record-tools.ts` at lines 11–23, reads the actual PhoneApp at 27–28, and extracts its production declarations at 31–39. The due shortcut's actual onClick expression is located at 304–313. The `select()` closure at 317–319 constructs a fresh scope with `snapshot, ...state` on every call, so the setters' post-click values are propagated into the recomputed actual shownJobs declarations. There is no stale savedStage value held in a persistent selection context.

The preserved assertions at 320 and 326–330 require no initial results, the exact intended job after navigation, an unchanged private snapshot, a matching recruiter-note search, and rejection of the unrelated portfolio search. `assert` is imported from `node:assert/strict` at line 1, so the new full-state assertion uses strict deep equality. The new binding does not replace these behavioral oracles with a call-count or a constant result.

## Execution boundary and remaining acceptance

No scripts, tests, builds, Mac calls, browser actions, product edits, or fixture edits were performed by this reviewer. No execution outcome is certified here. In particular, this source comparison does not certify a full-gate result or reconcile generated verification-file changes reported by the owner.

The requested full-diff and post-click context checks are complete at source level. No further harness correction or broad rerun is requested by this review. The existing owner's exact source binding and actual gate receipts must determine execution status. The separate rendered empty-state button assertions remain outside this review's scope.

## Observed source identities

| File | SHA-256 |
|---|---|
| `run-pinned-gates-rerun-1.py` | `d89cde1c4e31b434f92c091ede0bcf0e75a2c6c71bb12ce6f9cf033e135bcbf4` |
| `baseline/hosted/app/phone/PhoneApp.tsx` | `5b1f3db0063b062f21209870274b83a3def83cb6bb056c987fd7dac0653e6352` |
| `corrected/hosted/app/phone/PhoneApp.tsx` | `77b3f3bd43f7a7fab19b68807118fba41bb95409701d054ed8232bc139a7dcba` |
| `corrected/hosted/app/phone/record-tools.ts` | `7394ea75959f766053f4b6373a4c1687fa0e095c5cec7c0d887571ffb9908494` |
| `baseline/hosted/tests/phone-search-workflows.mjs` | `6fa41727abc01ea9675fdf0c7d36d6659dab9a82bfd35cb0504909ae495e9061` |
| `corrected/hosted/tests/phone-search-workflows.mjs` | `87131e6186faf9169932c131b5f03d27909b5b6b27c08f0a0eed9b60a71b83a5` |
