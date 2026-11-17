# Career Finder publishing recovery integration

**State: isolated source integration and local web/service verification complete; native verification and store delivery remain pending.**

This checkpoint deliberately combines publishing successor `8bfd3136227ce79625df8e2b57678de5fbfa201e` with account continuation `880e878f6f528d903c42951f10a8b216094c889c`. The merge base is `859b84a4bb184cbc9bb5039be34e35ad4ca17356`. The publishing parent contains remote checkpoint `842472684b194e993355f632902ccc81366c164c`, its historical branch integrations, and the recovered unpushed iPhone input correction. Both histories are preserved.

## Ownership, preservation and clock

Work was performed only in an independent `--no-hardlinks` clone at `/workspace/scratch/d57f4cd77813/career`, branch `recovery/publishing-integrated-20261117-d57f4`. No original workspace, shared Mac project, signing configuration, store record, public deployment or existing branch was changed. The old publishing clone was clean at `8bfd3136`; its small bundle matched SHA-256 `18cb58824d511a218d17e4a4cd8aacff85ebbe50e1bab9af1a5512927d638a8f`.

The account workspace had uncommitted documentation and acceptance evidence. Its pinned commit was imported without changing those files. A separate private recovery copy preserves 40 existing documentation/evidence files with stable before/after hashes; it is intentionally outside this commit and has not been screened for external disclosure. The coordinator has its exact location and digest.

The original 24 active engineering-hour programme is not restarted. Its recorded elapsed scheduling checkpoint is 17 November 2026 22:26:12 UTC / 18 November 01:26:12 Riyadh. Prior evidence identifies that as a derived checkpoint, not an agreed hard deadline. Remaining active effort is unknown. Lumina, HalalTag and Career Finder precede StockSage. Work remains free-only and excludes the Good Spender workflow.

## Deliberate conflict decisions

| Area | Preserved result and reason |
| --- | --- |
| Android selected language | Publishing's `LocalCareerDisplayLanguage` and `CareerDisplayContent` preserve selected copy, locale and RTL through native dialog windows. This includes the account branch's nested-copy correction and additionally preserves window configuration. |
| Android journey tests | Account's real Arabic/RTL/180% environment and translated selectors replace the older English-only fixtures. Publishing's real scroll-to-visible navigation and the native profile-height assertion remain. Both branches' additional language tests remain. |
| iPhone fixture persistence | Publishing's tested helper seeds an absent fixture with exclusive creation and preserves existing or unreadable data. It implements the account branch's seed-once correction while also protecting the concurrent-create window. |
| iPhone text replacement | Account's native Select All/Delete interaction, reachable keyboard, empty-field check, and exact-value wait remain. Publishing's no-retype opportunity-value observation and exact equality remain. Keyboard completion checks all keys, the keyboard container and the Done action before another field is touched. The large-text Arabic email field is revealed before its existing equality assertion. |
| Private hosted discovery | Account's same-origin credential option allows the existing private hosting session on approved local discovery GETs. Foreign paths, redirects and discovery writes remain rejected. The server creates fresh public employer headers and does not forward browser cookies or identity. |
| Recovery notice | English and Arabic now say the download started, avoiding a claim that dispatching a download link proves a completed file save. |
| Existing publishing work | Privacy declarations, legacy-data compatibility, five-tab product contract, recovery behavior, required CI workflow and historical source evidence remain. Separate public-support branches are not overlaid on app source. |

All 125 native test method names from the union of the two parents remain, with no duplicate methods or imports in the inspected changed sources. This is a source-preservation audit, not 125 executed native tests. Some equivalent assertions are consolidated into shared helpers; semantic conditions remain, and the independent review counted 149 iPhone assertion call sites compared with 143 and 147 in the parents. Counts do not substitute for runtime acceptance.

## Actual local verification

The existing locked dependencies were reused only after identical package-lock hashes were verified. Hosted dependencies were copied independently; companion installation completed from the local npm cache. No dependency upgrade or paid service was introduced.

| Gate | Observed result |
| --- | --- |
| Hosted TypeScript | Passed |
| Hosted app/Worker ESLint, zero-warning gate | Passed |
| Full hosted regression command | Passed; 164 aggregate Node cases, separate six PDF parser cases, 55 authentication groups, 63 application-handler groups, 26 discovery groups, and the command's separate auth-Worker, phone and vault suites |
| Actual application handler in local workerd with D1/R2 | Passed, 17 checks |
| Browser transport/pairing modules | Passed, 14 cases |
| Hosted production build | Passed |
| Existing website, state, recovery and legacy compatibility | Passed; includes 15 merged compatibility groups |
| Synthetic companion HTTP application regression | Passed, 119 groups |
| Synthetic TLS, consent, receipt and retry boundaries | Passed, 12 checks |
| Native localization generator contracts | Passed, eight existing Python tests |
| Shipping source whitespace/conflict check | Passed; no unresolved merge markers |
| New staged-file credential signature/filename screen | No matches in its documented scope; not a guarantee against every possible secret format |

`hosted-gates.json`, `service-gates.json` and their logs record exact commands, exit states and durations. `source-under-test.json` binds non-generated source/test inputs to SHA-256 hashes, checked again after verification. Existing test-generated verification JSON files are updated to the observed run. Raw historical CI logs from the account commit are retained byte-for-byte, including their original whitespace; they are not rewritten to make a whitespace report look clean.

## Critique and remaining findings

The author reviewed branch-loss, localization, test-input, fixture-relaunch, credential-forwarding and release-evidence risks before resolving the nine conflicted paths. An independent read-only reviewer, `/root/lumina_recovery`, inspected the staged integration against both parents and found no concrete new blocking defect in its scope. Its source hashes and exact limitations are recorded in `peer-review.json`. The reviewer verified that the account branch's three native product fixes survive in the publishing implementations. It did not perform a native build or runtime test.

| Finding | Disposition and retest |
| --- | --- |
| Diverged histories could discard publishing compatibility and account repairs | Combined in one controlled merge; both ancestry paths and test-method union verified. |
| Same-origin discovery cookies were omitted on private hosting | Account repair retained; real local handler, API and discovery regressions passed; no new live provider/browser claim. |
| Recovery copy claimed completed export too early | Truthful English/Arabic initiation notice retained; localization and hosted regressions passed. |
| Native typing replacement could leave an existing suffix | Real Select All interaction and exact-value checks retained; combined native runtime remains pending. |
| Arabic/large-text controls could be queried before being reachable | Localized selectors, scroll-before-touch, email reveal and height assertion retained; combined native runtime remains pending. |
| Relaunch fixtures could overwrite saved drafts or corrupt evidence | Exclusive seed-once publishing helper retained; its existing Swift fixture gate remains required and has not run on this Linux integration. |
| Required store/native/device evidence is incomplete | Open release blocker. No signed install, store upload, submission or release was attempted. |

## Required next execution

The coordinator must review and push the exact checkpoint, then run the required five-job workflow against the combined commit, without duplicating an active run for the same candidate. Account run `44101210921` belongs to `880e878f` and cannot establish an integrated pass. Any later account repair must be compared before further integration.

Native Android/iPhone execution, physical-device and assistive-technology acceptance, actual provider/disposable-account journeys, signing, App Store/TestFlight and release evidence remain separate gates. Historical UI screenshots under the imported CI evidence depict their recorded parent candidate; they are not presented as screenshots of this merged tree. GitHub preview releases and local build success do not establish an App Store release.
