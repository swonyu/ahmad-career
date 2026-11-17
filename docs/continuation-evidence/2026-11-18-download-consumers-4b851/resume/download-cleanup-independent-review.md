# Independent review: download resource cleanup

## Conclusion

**No material issue was found in the inspected implementation or regression-test diff.** The narrowly scoped download-helper change is suitable to retain. No corrective product change was requested by this review.

This was a source-only independent review. The reviewer did not execute tests, installation, builds, CI, browser actions or production mutations, and did not interact with root's running full-gate process.

## Exact inspected source

Inspection time: **17 November 2026, 23:37:33 UTC**.

Checkout: `/Users/saleh/Developer/career-finder-feed-continuation-20261117-4b851318da2d`

HEAD during inspection: **2884188263f3dad5753da7b2e507f6ba55e30eb0**. The reviewed changes were then present as a working-tree diff.

| File | Inspected SHA-256 | Bytes |
|---|---|---:|
| hosted/app/phone/PhoneApp.tsx | 5b1f3db0063b062f21209870274b83a3def83cb6bb056c987fd7dac0653e6352 | 121348 |
| hosted/tests/phone-record-tools.mjs | 15ef941aae32725a097e4a88d8d245eb5611738cd41c216eddbd65118c0319a6 | 30116 |

Read-only Git and file/hash reads succeeded. The review evaluated the actual diff, not a proposed patch or copied implementation.

## Implementation assessment

The product diff changes only the existing download helper.

- Normal execution remains synchronous. It assigns the same Blob URL and filename, appends the anchor, calls click once, removes the anchor and schedules revocation after **30,000 milliseconds**. There is no added await, automatic retry, duplicate activation, serialization change or state mutation.
- The detached anchor is created before URL allocation. If element creation fails, no URL was allocated; if URL allocation fails, nothing was attached.
- An append failure or the injected pre-activation click failure removes the temporary anchor and immediately revokes the allocated URL.
- The nested finally still schedules URL revocation if removal throws after click returns normally.
- Exceptions continue to propagate. The helper does not convert failure into a successful return, so the existing CSV and calendar actions do not reach their subsequent download-started notices after the injected failure.
- The name **clickReturned** accurately identifies a synchronous control-flow boundary. It does not claim that the browser completed a file save.

The helper still accepts serialized string data and constructs its Blob with the existing MIME behavior.

## Regression-test assessment

The existing AST extractor now supports the actual top-level production helper while preserving its prior component-declaration extraction path. The new tests execute that helper in a small DOM/URL boundary harness; they do not copy its implementation.

The eight added cases cover:

1. Normal byte content, MIME, filename and delayed URL release.
2. URL-allocation failure.
3. Element-creation failure.
4. Append failure.
5. Injected pre-activation click failure.
6. Removal failure after normal click return.
7. CSV action failure propagation, unchanged snapshot, withheld notice and successful explicit retry.
8. Calendar action failure propagation, unchanged snapshot, withheld notice and successful explicit retry.

The normal-path byte assertion uses Blob.arrayBuffer(), preserving the BOM in the comparison. An absent optional notice error property is correctly treated as false.

Root's reported parent comparison, **33 passing and six failing checks against parent 288**, is consistent with the six cleanup cases the old helper violates: create, append, click, removal and the two export-handler cleanup cases. Normal operation and allocation failure remain useful passing controls. This consistency assessment is source reasoning; the reviewer did not execute or independently verify those runs.

## Qualifications

- The tests establish cleanup under injected synchronous failures. They do **not** establish that ordinary browser-blocked or canceled downloads throw, or that users experienced this failure.
- In the deliberately failing removal stub, the test establishes eventual URL cleanup. It does not claim that a removal operation which throws successfully detached the anchor.
- A normal click return is not evidence of completed file saving.
- The successful browser-download evidence preceding this change belongs to parent **2884188**. Acceptance of the revised helper in the actual browser remains pending as reported at review.
- Initial test-only BOM-decoding and optional-error-property expectation corrections are harness corrections, not product defects.
- No broader download-policy fallback, UI error-message redesign or automatic retry was requested by this review.

## Subsequent root-reported verification

After the independent source review, root reported the change pushed at **da68bbfbdcc6429d72d1faa28b5809a554142c57** and supplied these completed results:

| Check | Result reported by root |
|---|---|
| Typecheck | Exit 0 |
| Strict lint | Exit 0 |
| Full npm test chain | Exit 0 |
| Main Node test group | 297/297 passed |
| PDF test group | 6/6 passed |
| Targeted record-tools group | 39/39 passed; a subset of the broader verification |
| Hosted build | Exit 0 |
| Full dependency audit | Exit 1, with 19 high affected-package entries |

These are **attributed root results**, received after this review. This reviewer did not rerun the gates or independently inspect their complete execution logs. The test scopes must not be added together as if they were disjoint. The dependency audit remains a separate unresolved gate; this resource-cleanup change is not its remedy.

## Review scope and preservation

Reviewer: `/root/current_dependency_remedy`, acting only as an independent download-helper reviewer for this task.

The reviewer did not change product code, tests, packages, locks, ownership, processes or browser state. This evidence artifact is the only write authorized for the save follow-up. Existing publisher/dependency ownership and the separate native/browser acceptance work remain unchanged.
