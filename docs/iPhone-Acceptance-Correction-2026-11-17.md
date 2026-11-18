# iPhone acceptance correction — 17 November 2026

Status: prepared source and independent source review only. The corrected source has not been compiled, run on a simulator or tested on a physical device. The historical eight-branch integration at `ddc1881a4ec6855854784f581e0b8cb7136bfc11` remains preserved.

## Observed failures

The development owner's [run 44062756461](https://github.com/swonyu/ahmad-career/actions/runs/44062756461) tested head `859b84a4bb184cbc9bb5039be34e35ad4ca17356` through GitHub's pull-request merge checkout. Its iPhone logic and unsigned build passed. Its separate iPhone UI job finished with 17 tests, 14 passing and 3 failing. These results do not cover the integrated publishing source.

| Failing method | What the evidence establishes | Limit of the result |
| --- | --- | --- |
| `testArabicLanguagePersistsAndKeepsSavedProfileValuesAtLargeText` | Arabic selection survived relaunch. The later saved-first-name assertion expected `Saved` but found the empty field's Arabic placeholder. The actual DEBUG availability factory unconditionally wrote a new `phone-draft.json` on every launch. | This failure does not show that the language preference was lost. The fixture erased the saved profile before the real store loaded it. |
| `testSavedLinkRemovalAtLargestTextKeepsCancelReachable` | In normal-text setup, the helper tapped Done after the URL field, tapped the title field, then failed to type because no element had keyboard focus. | The test stopped before the largest-text relaunch or removal/cancel checks. The missing transition barrier is a source/log-supported synchronization diagnosis, pending runtime confirmation. |
| `testSearchEmptyAndFailurePreservesPreviousResults` | The first search's empty state and the next search's restored results were reached. Before the third search submission, key readiness timed out while indexed key proxies were repeatedly resolved. The final accessibility tree contains six zero-size `Padding-Left`/`Padding-Right` keys before visible letter keys. | The error query was not submitted. This failure does not establish a defect in retaining prior results after a search error. |

The downloaded UI evidence archive's SHA-256 is `f47c75f9b68b145839f82b9252a0fe2f8fbd5e13f4418e97d0e02a1098a2ad51`. The failed run and its original logs remain preserved; they are not relabeled as passing evidence.

## Source correction

The app's DEBUG availability initializer now delegates to one internal factory, also called by a new offline check. It seeds an absent draft file using Foundation's exclusive `withoutOverwriting` option. It never replaces an existing file, including malformed or unsupported saved data. If another initializer creates the file after the existence check, only the file-exists error is accepted; the real application store reads and validates those existing bytes. Other errors still fail fixture preparation. This is exclusive initial creation, not a claim of general interprocess locking or transactional fixture setup.

[Apple documents](https://developer.apple.com/documentation/foundation/nsdata/writingoptions/withoutoverwriting) that `withoutOverwriting` fails when the destination already exists and cannot be combined with `atomic`. The normal production store and its ordinary atomic writes are unchanged. Release builds contain neither the new fixture factory nor its synthetic services. The launch flag, UUID validation, per-test folder boundary, offline service and credential behavior are unchanged.

The keyboard helpers keep their existing five-second budgets and single field taps. Opportunity setup now waits for the Done keyboard/toolbar transition, verifies that no real key remains tappable, and waits for a real key after the next field tap before entering text. It also checks the exact value in each intended field. There are no retry taps, fixed sleeps, injected text values, simulated success paths or operating-system keyboard setting changes.

Search readiness resolves a fresh scoped key query instead of materializing all indexed key proxies. It excludes only the two observed zero-size padding labels and still requires an existing, hittable real key. The original toolbar reachability, actual Return/action submission and visible keyboard-plus-toolbar dismissal checks remain byte-identical. The test continues to fail if the real keyboard is unavailable.

## Regression and review evidence

All 17 original UI test method bodies are byte-identical to the eight-branch baseline. All 134 original `XCTAssert` calls remain; the shared helpers add three assertions, for 137 calls in source. No test is removed or skipped. No original assertion, timeout, text expectation, navigation order or accessibility-size requirement is relaxed.

The existing `check-mobile.sh` bytes remain an exact prefix of the updated script. The append-only gate compiles the actual DEBUG application environment and its existing store/service dependencies, then runs `AcceptanceFixtureCheck.swift`. Its 19 assertion sites cover both availability modes and both rejected-file cases, for 38 expected assertion executions if every scenario reaches completion. They check:

- A first seed starts with a blank private profile and only the explicitly requested record-only fixture.
- Actual store writes of the profile, exact PDF bytes and unfinished opportunity survive the same initializer, byte for byte before refresh.
- Refresh retains a dirty local profile and its records while disabled or unknown submission capability remains unavailable.
- Separate acceptance folders do not share private drafts, and changing an orphan-seed option cannot inject data into an existing folder.
- An existing account scope, inactive workspace draft and restrictive Stop hold survive initializer re-entry. A mismatched offline workspace response refuses to replace them.
- Corrupt and unsupported files remain exact, disconnected and protected from a subsequent attempted save by the real store.

These new Swift assertions have not yet executed. Source preservation checks, shell syntax checking and `git diff --check` passed. An independent reviewer found no definite Swift/API or data-preservation blocker and recommended the additional real-key absence condition, which was applied. This review does not substitute for compilation or runtime acceptance.

## Ownership and next verification

The 11:19 UTC read-only GitHub observation still showed the same eight published branch heads and draft PR 1 at `859b84a`. The development owner's work and publishing release branch remain preserved. The publishing coordination comment is [posted on PR 1](https://github.com/swonyu/ahmad-career/pull/1#issuecomment-6945535051); no owner acknowledgment is claimed.

One coordinated run of all five existing CI jobs is required on the final integrated source, including the 105 ordinary Android methods, later TLS checks, the new offline initializer gate, and the unchanged 17 iPhone UI methods. Physical-device behavior, provider activation and real consent, signing, upload, Apple review and public release remain separate open gates. No CI dispatch, native build, provider change, signing or store action was performed for this correction.
