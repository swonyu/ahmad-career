# Date-input browser-control addendum

Reviewed production commit: 2884188263f3dad5753da7b2e507f6ba55e30eb0.

This is a browser-control caveat, not a validated application date-loss defect. No product patch is justified by the observed fill-only behavior.

## Root's actual browser observations

The root browser owner reported this sequence; the export-review agent did not operate the browser:

1. The first real English CSV download was 479 bytes at 23:20:43 UTC on 17 November 2026. Its bilingual title and protected formula-like note were intact, but its follow-up-date cell was empty. The date input's value had not been captured immediately after the original fill action.
2. On reproduction, calling `.fill('2026-11-24')` and blurring showed a valid DOM date, but saving and reopening the record showed an empty date.
3. Using the actual native ArrowUp interaction changed the date to 2026-11-25; ArrowDown restored 2026-11-24.
4. Saving and reopening after those native interactions preserved 2026-11-24. The saved card displayed “Follow up Nov 24, 2026.”

This isolates the unsupported or ineffective fill-only event path. A valid DOM value alone did not establish that this browser-control action updated the controlled editor's state. The native-input save/reopen path retained the date. Root continued actual CSV/ICS download verification separately; those later results are not asserted here.

## Independent source inspection

The inspected production editor uses a native `input type="date"`, bound to `draft.followUpDate`, with `onChange` merging `e.target.value` into the draft. Save passes that draft to `updateRecord`. The model accepts either an empty optional value or a valid civil-date string; `updateRecord` preserves the follow-up-date field and changes only applied-state bookkeeping and the edit timestamp. No conversion or silent clearing from 2026-11-24 to an empty string was found.

The existing model, vault and export tests primarily seed date values directly. They do not establish that the browser-control tool's fill operation correctly drives the native date editor. No additional suite was run for this inspection.

Disposition: preserve this automation caveat in the browser receipt, use observed native date-control interaction for the current acceptance, and do not label the fill-only result as production data loss. No source, fixture or dependency edits were made.
