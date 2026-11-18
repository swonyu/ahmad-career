# iPhone CI hardware selection recovery

Date: 18 November 2026. Base: `92266631b5eba3eb7d66810e6553535fe42cce86`.

## Observed problem

Exact-source [CI run 44316849501](https://github.com/swonyu/ahmad-career/actions/runs/44316849501), iPhone job `134845123744`, created a fresh iPhone Air on iOS 26.5. Its boot log ended with terminal status 3, `Data Migration Failed`, and no native UI journey ran. The strict boot gate correctly rejected it. Its three-minute step limit also expired while retaining the failure; a nonzero gate is required here.

The selector used newest runtime, compact display name, then reverse alphabetical model name. That makes `iPhone Air` outrank regular-size numbered Pro/standard models on the same runtime. Separate retained recovery evidence for fresh iPhone 17 Pro on iOS 26.5, device `48C27490-EEBF-4C79-BB62-866CCEAB1EF7`, has a passed strict boot receipt (SHA-256 `50af1d90aeb91d6e0679931c42b34818f441cf69f3e176c28cf2ea88367d4c5d`). This supports testing the alternative model; it does not establish that the Air model caused the migration failure or that any app journey passes.

## Change and boundaries

Select the newest eligible iOS runtime first, then retain compact-device preference and rank regular-size numbered Pro/standard iPhone device types numerically ahead of other compact types. On the observed inventory this selects iPhone 17 Pro. If only another compact type is available on the newest runtime, it remains eligible and must pass the same gate.

The minimum runtime is now iOS 17, matching the prepared UI-test deployment-target correction in `00d4bdc654107808c692304c0bd67b436b620ed4`. The production app minimum is unchanged by this patch.

Fresh creation, explicit type/runtime selection, unique UUID verification, cold Shutdown state, the strict Finished boot parser, all 17 UI journeys, command evidence retention, and boot/UI/job time limits remain unchanged. No simulator retry, erase, global shutdown, cancellation, assertion removal, or timeout extension was added. No local native build or simulator operation was performed.

## Verification

`verification.json` records actual results. The 12 selection fixture methods execute the real workflow block with mocked simctl responses. Against the unchanged base, the new cases produced six method failures; after the change all 12 pass. Coverage includes the Air-vs-Pro ordering, newest-runtime precedence, standard numbered fallback, numeric hardware generations, unavailable preferred devices, iOS 16 exclusion, exact fresh-device verification and creation failure.

All 11 unchanged boot-parser methods pass, including the recorded terminal migration failure. `actionlint` and `git diff --check` pass. Exact comparison confirms the workflow from the boot-parser step onward and the boot verifier are unchanged. An independent static review by `root/native_prepared_review` found no new blocker.

The remaining gate is the exact combined candidate's hosted strict boot followed by every required iPhone journey and the other platform checks. This patch is not installed-device evidence or release approval.
