# Career Finder research handoff implementation

## Outcome and source

This continuation read the saved **Career-Finder-ChatGPT-Handoff-2026-11-17.txt**, **Career-Finder-Research-and-Critique-2026-11-17.html**, the focused workflow audit and app knowledge brief. It implements the three bounded workflow findings on top of [PR #1](https://github.com/swonyu/ahmad-career/pull/1), observed at `859b84a4bb184cbc9bb5039be34e35ad4ca17356` on `continuation/account-acceptance-20261117`.

The implementation branch is `continuation/research-handoff-fixes-20261117`. It is a focused follow-up to the existing candidate. It changes no signing, store configuration, provider credentials, native code, release branch or public deployment. Other ongoing work in the original owner's checkout was inspected and left intact. Shared source inspection is not direct cross-chat acknowledgment.

The research's ten-product comparison, 48 sampled review items and twelve technical choices inform the existing product direction; these are qualitative evidence, not proof of superiority or all Internet reviews. This change preserves Search, Saved, Apply, Profile and Settings, English/Arabic, the existing visual system and free operation.

## Implemented findings

### WF-01: a due-follow-up shortcut reveals its promised records

The Search shortcut now clears the unrelated Saved text query before selecting Follow-ups and navigating. The ordinary Saved query behavior remains unchanged elsewhere. Notes, stages, dates and account scope are not edited by navigation.

A regression executes the actual production handler and Saved selector. On the original source, a due Designer role is still hidden by the earlier query `portfolio`; the test fails with zero rows instead of one. With the correction, that record appears. A new ordinary query still filters it normally. The Follow-ups section continues to include scheduled future follow-ups as before.

### WF-02: search failure, incomplete results and healthy empty results have distinct copy

The empty-result component now uses the actual discovery status:

| Status | Meaning shown |
| --- | --- |
| `unavailable` | Current openings could not be checked. |
| `partial` | No matches in the results that could be checked; the search is incomplete. |
| `complete` | No matching jobs in the selected boards, with the existing search guidance. |

The partial explanation deliberately also covers stale sources, result limits and errors. It does not assert that every partial search contains an entirely unavailable board.

The unavailable and partial states offer **Retry this search**. It repeats the submitted job query, location, remote selection and board set from page one, using the existing generation/identity safeguards. It is disabled while an action is busy. If the user has started editing another search, those unfinished form values remain intact and are persisted separately from the completed search's filters. The existing changed-filter notice remains meaningful. No filters or source scope are broadened automatically.

All new copy has Arabic translations. Regression checks render all three states in both languages, verify retry availability/busy behavior, and execute the actual retry action with deliberately different submitted and draft filters.

### WF-03: removing a bookmark keeps useful location context

Web application records may now retain a bounded optional location. New records capture the saved job location. Removing a bookmark preserves the latest nonblank location from the current saved bookmark, including for older records and re-bookmarked jobs; a blank location does not replace useful retained metadata. The retained record row uses that location for the existing Saved search.

This makes a `Riyadh` search continue to find a retained record after its bookmark is removed. The saved bookmark is the metadata source; stale dialog metadata cannot override it. No job is re-fetched or re-bookmarked. Original snapshots remain unchanged on rejected storage writes or account/scope mismatch.

The current client reads older records without this optional field. Already-unbookmarked legacy records with no remaining location stay unknown. Native clients already keep job metadata in their record bundles; the hosted server schema and native formats are unchanged. CSV columns are unchanged, while JSON export retains the supplemental field.

**Rollback boundary:** an older encrypted-vault reader's `parsePreserving` check rejects unknown fields as unsupported and keeps the original bytes. Do not promise that an older web build can open new location-bearing drafts. Its plain model parser alone is not the supported vault persistence path. Preserve the established export/recovery process when considering a rollout or rollback.

## Validation and independent critique

[Verification receipt and source hashes](strict-review-evidence/research-handoff-2026-11-17/verification.json) accompany the logs.

| Check | Result |
| --- | --- |
| Focused model, record, search workflow and localization tests | 62 passed, 0 failed |
| Encrypted storage, scope, recovery and export checks | 34 passed |
| TypeScript | Passed |
| App/Worker ESLint | Passed |
| Production build | Passed; existing sourcemap/route-classification warnings remain |
| Original-source due-shortcut reproduction | Failed as expected; original bug preserved in the log |
| Interactive browser acceptance | Not completed |
| Physical devices / new native CI | Not performed by this continuation |

Independent review found and corrected two edge cases before this checkpoint: a retry overwriting unfinished form edits, and a re-bookmarked role retaining an empty or older location. The final focused regressions cover both.

The code used the existing lock-matching dependency installation; no dependency was added or upgraded. The new search regression file is included in the existing `npm test` command. To repeat the scoped checks, run from `hosted`:

```sh
node --test tests/phone-search-workflows.mjs tests/phone-record-tools.mjs tests/phone-model.mjs tests/i18n.mjs tests/phone-localization.mjs
node tests/phone-vault.mjs
npm run typecheck
npx eslint app worker --max-warnings 0
npm run build
```

Standalone Chromium could not create its required socket in this execution environment. The supported cloud browser then could not connect to the isolated loopback preview. No screenshot, browser save, calendar import or live account acceptance is inferred from component rendering. The temporary synthetic fixture was built outside production output and is not part of this patch.

## Remaining continuation work

**WF-04 remains open:** real browser downloads and spreadsheet/calendar consumer acceptance. Use only synthetic Arabic, multiline, quoted and formula-like fields; check actual saved files and the all-day date, repeated import behavior and absence of private notes or attendees in calendar files. Existing asynchronous export identity tests remain part of the focused suite. CSV/ICS generation does not establish calendar synchronization or native export parity.

The previously running [native CI run 44062756461](https://github.com/swonyu/ahmad-career/actions/runs/44062756461) is now terminal. Both service jobs and the iPhone logic/unsigned-build job passed. Android compilation/lint passed, but ordinary instrumentation had **92/103 pass and 11 failures**; later TLS suites were not reached. iPhone UI had **14/17 pass and 3 failures**. Those outcomes belong to head `859b84a` tested through merge checkout `fdab7f1181ab236be8f8085c562b357d9cfb4874`.

The original owner's Android follow-up patches address localized selectors and a real dialog language-context inconsistency. Their available receipt did not establish emulator acceptance; avoid duplicating or treating them as passed. The iPhone review identified a DEBUG fixture that overwrites saved profile state on relaunch, an expensive/stale keyboard readiness scan, and a focus acquisition failure while preparing a test role before the largest-text journey. Keep the original assertions and diagnose/validate those native fixes on the owner's integrated candidate.

Real Google/LinkedIn consent, account lifecycle, physical-device/accessibility checks and release integration remain separate gates. This continuation sends no employer applications and establishes no production, installation or store-release result.
