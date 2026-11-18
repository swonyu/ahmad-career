# Focused search and bilingual follow-up — 17 November 2026

This follow-up addresses three findings independently verified against application source `880e878f6f528d903c42951f10a8b216094c889c`, after reading the publishing coordination comments. The current source hashes and command results are in [verification.json](verification.json). Source ownership was declared in [PR comment 6951193348](https://github.com/swonyu/ahmad-career/pull/1#issuecomment-6951193348).

## Changes and reasons

### Preserve search drafts and make incomplete results recoverable

Previously, every completed search or pagination request called `setFilters(requested)`. Search fields remain editable while a request runs, so a late response could overwrite newer filter edits. Existing per-source warnings were present, but a person could not retry the displayed partial search independently of their changed form. An empty unavailable response also used the successful-empty-search heading.

The request handler now separates three actions:

| Action | Filters submitted | Cursor | Visible form after response |
| --- | --- | --- | --- |
| Search | Copy of the current draft and selected boards | None | Keeps the person's latest edits |
| Load more | Copy of the last submitted search | Current continuation cursor | Keeps the person's latest edits |
| Retry this search | Copy of the last submitted search | None | Keeps the person's latest edits |

Retry appears only inside the existing incomplete-results notice. It keeps prior results visible while the request is pending and after cancellation or failure. Successful replies still pass current-account/generation checks; pagination retains URL-identity deduplication and the 200-result bound. A retry does not bypass the backend cache, cooldown or source limits. The cancellation controller is cleared in `finally` only when it is still the current request's controller.

Visible drafts and durable search history remain distinct. The app persists the last completed submitted search; this change does not promise to save every filter keystroke for reload.

### Isolate dynamic Arabic/English text

Saved cards, online-bookmark copies, Apply selections/legends, receipt titles/employers, detail locations, recovery/deletion labels, profile names and CV filenames now use appropriate `dir="auto"` or individual `<bdi>` boundaries. Inline dates and account email are isolated from surrounding translated text. Search title/location inputs also choose their direction from entered text.

This changes presentation only. Original user, employer, location, filename and private-note strings are neither translated nor modified in storage or exports. Existing good isolation in search cards and review details is retained.

### Clarify spreadsheet importing without adding another panel

The existing Settings export disclosure now explains how to preserve leading zeros and numeric-looking text by importing quoted fields as text or setting text columns to Text. The English/Arabic catalog contains this guidance. The serializer and original values are unchanged. The new [independent engine check](../csv-text-import/README.md) reproduces default-import coercion and verifies the documented option.

## Verification

- **66 focused tests passed**, zero failures, cancellations or skips. These include actual search/run/persistence handlers with synthetic transport, current-account rejection, cancellation, pagination limits, English/Arabic results markup, Settings privacy and existing record-export checks.
- The search/localization author's first focused run passed **20/20**, then the broader 66-case group also passed. These are overlapping runs and must not be added together as 86 independent cases.
- `npm run typecheck` passed on the source hashes in the receipt.
- Full `npm run lint` passed. A preceding wider lint invocation found three test-only identifier classifications; [initial-full-lint.json](initial-full-lint.json) preserves them. The CI's earlier narrower `eslint app worker` pass is not contradicted by the wider check.
- Local test identifiers were renamed without suppressing lint rules or removing assertions. The existing i18n fixture builds/imports now finish before test and teardown registration, addressing the publishing owner's reported temporary-directory cleanup race. [test-harness-cleanup.json](test-harness-cleanup.json) records unchanged test/assertion inventories and before/after hashes.

The tests use the real production handler and rendered markup, with network/storage ports replaced by explicit synthetic fixtures. This is not a fresh visual browser session, real provider callback, physical-device/accessibility acceptance, or a pass of the separate native CI gates. No new primary screen or navigation item was added.
