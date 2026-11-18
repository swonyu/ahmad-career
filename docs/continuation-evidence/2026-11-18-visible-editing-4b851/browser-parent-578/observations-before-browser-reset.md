# Actual browser observations at 578d99c

Source: `578d99c8f225a72ca7cc0cf10ff474bb19aaaebc`. PhoneApp SHA-256 `0ee2f855083ad5933dbbca1161372e8e6e3c8b393c1fd6033b2858c59dacfd94`.

This report reconstructs the root coordinator's actual tool observations from this conversation before a browser connection reset. It is **not** a recovered raw event log. The in-browser observation array was lost in that reset. No per-case timestamps are invented, and these grouped observations are not an automated test count. The matching fixture was built on 18 November 2026 at 03:18:30–31 UTC. These observations occurred after that build and before the export-related connection interruption. This report was written after reconnection on 18 November.

## Environment and limits

Connected Chrome, 390 × 844 CSS viewport, owned synthetic guest fixture at `http://127.0.0.1:4182`. The fixture bundles actual production components and uses production local-vault operations with an exclusive fixture marker and empty-guest seeding checks. No real account, CV, employer application, OAuth provider or native device was used. Account-provider unavailability in this synthetic fixture is expected and is not evidence of an actual OAuth failure.

The source-bound fixture receipt is retained at `resume-20261118-0410/browser-recovery-20261118T0310Z/fixture-build-receipt.json` under the root Mac evidence directory. Fixture metadata SHA-256: `1ac3499b344d286fa1f90acdea5ffe17007c20eaaacedfcd7c80645014ed1a8b`.

## Observed corrected deletion and Clear behavior

1. English keyboard typeahead `i` selected Interview and left focus on the stage SELECT.
2. English record-editor Cancel activated with Enter returned focus to the original Edit application record button.
3. English record-only deletion displayed the corrected conditional bookmark confirmation. After deletion, there were zero cards, a visible Clear button, no stage control, the corrected conditional toast, and focus on the phone H1, “Your next moves.”
4. From that H1, Tab traversal reached Clear via Dismiss message, Add job link, All, Applied and Follow-ups. Enter on Clear removed Clear, restored the default Explore action, and returned focus to the H1.
5. The equivalent Arabic record-only flow showed the corrected Arabic confirmation and toast, returned Cancel to the invoking Edit control, and returned post-deletion focus to “خطواتك المقبلة.” Clear remained reachable by Tab and its activation restored the default view and H1 focus.

Screenshots preserve the actual dialogs: `english-deletion-dialog.jpg` SHA-256 `64cba0d7b46f4bb9d7a82629451978df1356279775af1449f45140d598c4fc0a`; `arabic-deletion-dialog.jpg` SHA-256 `b90b604249e4aca6c3eaa47f9a7221aedc0096352fce203845f656c4dd6b7b33`. Both are original JPEG bytes, 390 × 844 pixels.

## Observed stage, search and view composition

The seeded corpus contained 22 visible jobs: 17 bookmarks, 20 private records, five record-only jobs and two bare bookmarks. Before the later committed edit, stage counts were All 22, Saved 6, Applied 4, Interview 4, Offer 4 and Closed 4. These counts were observed in both English and Arabic using the actual stage control.

- Applied + Closed showed three marked jobs (Closed 0, 3 and 2), excluding unmarked Closed 1. Applied + All showed 15.
- Follow-ups + All showed four jobs in date order: Role saved 0 (2 November), Role offer 0 (18 November), Role applied 0 (20 November), Role interview 0 (2 December). The Closed record's earlier follow-up was excluded. Follow-ups + Closed produced an empty view with Clear. Clear restored 22 and All.
- Search “Nurse” + Interview showed Nurse clinic; the same query + Offer initially showed zero with Clear available. Clearing recovered the results.
- Arabic note search “متابعة” found the record-only Role interview 2.
- The Arabic main view measured RTL, left 0, right 390, document scroll width 390 and viewport width 390: no horizontal overflow in that inspected state.

## Keyboard acceptance left unresolved

Semantic stage selection worked in Arabic. Attempts using Home and ArrowDown/Enter left All selected; a later English ArrowDown/Enter control probe also left All. The browser control rejected a literal Arabic character key as unsupported. No stage-arrow cancellation was found in the inspected production/fixture source. The observations do not establish whether native popup interaction, automation delivery or the product caused this behavior. **Arabic/native arrow-key acceptance remains unverified.** Only the English ASCII typeahead observation above passed.

## New validated Keep editing defect

In the Nurse clinic record editor, Stage was changed from Interview to Offer and the note to `UNSAVED_SYNTHETIC_NOTE`. Cancel displayed the discard confirmation and focused its heading. Activating **Keep editing** preserved those draft values but left focus on BODY, outside the still-open dialog. This is a real observed defect in 578d99c and was assigned to the existing Grok Build 1 lane for a bounded fix and independent review.

Cancel followed by Discard changes closed the modal and returned focus to Edit. Reopening verified the saved record was still Interview with `note interview1`; the abandoned draft had not been committed.

## Committed synthetic record used for export checks

A subsequent deliberate UI save changed Nurse clinic to Offer and the exact note below. Entry of follow-up 2026-11-30 was attempted, but the first actual JSON/CSV exports and reopened editor later proved that the date had not been committed. The earlier working summary's saved-date claim was therefore corrected; it was not an export omission.

```text
=SYNTHETIC("مرحبا، عالم")
Line two, "quoted"; follow-up
```

The UI reported the private record was saved on this phone and notes were not uploaded. Nurse disappeared from the still-active Interview query view, with focus on H1. Selecting Offer showed Nurse clinic again. Expected subsequent counts are Interview 3 and Offer 5; all other stage totals remain unchanged. The record count remains 20 and visible-job count 22. These expected updated totals were not all re-counted before the connection reset. The initial four follow-ups remained four until the date was actually committed after reconnection.

Settings then opened normally. There was no unsaved draft at the reset. Navigation-state retention and reload persistence still required subsequent checks.

## Export interruption

An attempt to await and click Export phone data timed out in the browser connection and erased the browser-control bindings. The settings H1 remained active on reconnection, and a bounded filesystem search found no new `Career-Finder*.json`, CSV or ICS files in Downloads during the checked interval. The click's outcome was therefore **unverified**, not a product pass or proven product failure. No export bytes, spreadsheet import, calendar import or native file handoff are established by this report.

A later attempt to inspect the internal downloads page was rejected by the browser URL policy. That route was abandoned; no alternate mechanism was used to access the blocked internal page or browser-private state.
