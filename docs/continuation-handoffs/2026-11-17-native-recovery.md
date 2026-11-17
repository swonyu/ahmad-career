# Terminal session 2 — Native data preservation, receipts and recovery

Continue Career Finder only. Apply Saleh Alayed's full saleh-app-workflow; exclude Good Spender. This is authorized continuation, with strict research, critique, fixes and retesting. Preserve the original start 2026-11-16T22:26:12Z and the recovered extended cutoff 2026-11-18T22:26:12Z (19 November 2026, 01:26:12 Riyadh). Do not restart a separate 24-hour clock. Active effort remaining is unknown.

Repository: https://github.com/swonyu/ahmad-career
Interrupted-chat context: https://chatgpt.com/c/6afc73d0-92e0-83ed-9b67-6dd671b8fab5
Coordination: https://github.com/swonyu/ahmad-career/pull/1

Before editing, recover current owners, remote heads, dirty files, worktrees, processes, locks and CI. Register your session ID, branch and exact write set in the existing PR thread. Use your own isolated checkout/worktree; preserve every other owner's dirty files and processes. If newer work overlaps, reconcile the overlapping path with that owner while continuing unblocked research, tests and non-overlapping work. Do not infer build permission from an absent lock.

Current verified evidence, which you must refresh:
- Publisher d57f4cd77813 owns integrated source, native acceptance/build scheduling, signing and stores. Last verified integrated head was 0f0c6f1f591ff173e51671599cbbb6aeff4a69e4 on recovery/publishing-integrated-20261117-d57f4. A separate publisher CI-finalization branch exists; inspect it before proposing workflow work.
- Original development 5bc6158967e8 sealed 21f08f5c4509bd1fdbe9112003224bf2316edd2a. Full run 44130275991 passed all five jobs: Android 104 ordinary + 1 TLS + 1 synthetic HTTPS, iPhone 17/17, normal xcodebuild completion, exported/uploaded evidence. This validates that exact source, not every later integrated tree.
- Publisher focused run 44129604009 at 0f0c6f1 passed exactly one connection test with export/upload; four other jobs were skipped. Earlier run 44124734131 at 2fac36f3 failed. Earlier account run 44122504831 logged 17 passing cases but failed result finalization. Keep those outcomes distinct.
- Continuation 4b851318da2d owns hosted response/feed reliability and the current hosted follow-up. Safe checkpoint d534a6c23bbe81615b8f7a40d3fb4204bb991781 is pushed on continuation/feed-reliability-20261117-4b851. All seven hosted gates passed on Node v24.22.3, including 47 discovery groups, new provider/frontend cleanup tests, build and dependency audit. Its newer PhoneApp recovery/search changes are still being reviewed: do not copy or edit that live checkout.
- Read the latest comments, especially 6954889472, 6955496651, 6955617360 and 6955748053. Treat later owner updates as authoritative after verification.

Grok coordination stays with continuation 4b851318da2d. The separate Build task is https://grok.com/c/adc8cfe9-ed35-4fcd-9961-d1fc081daef0 . It has the four-component account/accessibility lane and a heavy read-only whole-app critique. The publisher reports the prior source packages and 39 images were received. Do not resend those packages/images or start a duplicate Grok task; send findings through the coordination thread for the current Grok coordinator.

Use the project's actual pinned toolchains. CI pins Node major 24; the engines minimum is not the pin. A read-only reusable Node v24.22.3 executable exists at /Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/toolchain/node_modules/node/bin/node . Do not replace the user's system runtime. Read the repository's current native toolchain requirements. Leave the continuation's loopback account fixture on port 4179 and its test processes alone.

Do not edit .github workflows, existing iPhone exact-value helpers, hosted app/server files, signing material, store metadata or other apps. Do not start competing xcodebuild/Gradle/emulator/simulator/signing jobs. Coordinate one native build reservation with the publisher; use isolated output directories and only your own processes. A safe branch push does not authorize a duplicate full CI dispatch. Prefer a continuation/* branch and coordinate before opening a PR that would trigger native CI.

Preserve secrets, credentials, all unfinished work and original evidence. Use only synthetic accounts/data for new fixtures. Do not submit real employer applications, activate live auto-apply, delete a real account, add paid services or deploy publicly. Push safe reviewable checkpoints; never force-push or move another owner's branch. Report exact commits, source hashes, commands, results, failed attempts, remaining blockers and limits. Planned tests are not passes; source review is not native or physical-device acceptance. Do not claim 100%, release readiness or store submission without evidence.

## Your exclusive implementation lane

Use branch continuation/native-recovery-20261117-<your-session-id>. Coordinate with the publisher, then own only:
- apple/AhmadCareer/NativeApplicationsStore.swift
- apple/AhmadCareer/NativeApplicationsViews.swift
- apple/AhmadCareer/MobileApplicationState.swift
- android/app/src/main/java/com/saleh/careerfinder/CareerViewModel.kt
- android/app/src/main/java/com/saleh/careerfinder/Models.kt
- android/app/src/main/java/com/saleh/careerfinder/MainActivity.kt, limited to receipt/profile/recovery paths
- android/app/src/main/java/com/saleh/careerfinder/WorkspaceTransfer.kt
- Focused receipt, persistence, workspace-interchange and recovery tests/fixtures.

Do not edit CareerDiscovery.swift, NativeDiscoveryViews.swift, Discovery.kt or DiscoveryScreen.kt: those belong to terminal session 1. Session 1 is the single writer for central native-copy resources and generated localization outputs. Reuse existing labels where possible; send it any new strings rather than editing the same resource files. Do not edit shared native test runners or connection-test helpers without coordination.

## Priority findings to validate, fix and retest

1. **An interrupted native dispatch can remain “Sending” with no reachable reconciliation action.**
   Source-confirmed at the reviewed base: when a plan expires or its profile revision becomes stale, activePlanIds/recoverablePlans no longer expose it. Workspace GET deliberately does not reconcile expired dispatch leases; advance rejects stale plans. Existing explicit Stop can safely change an expired dispatch to uncertain while retaining live claims and preventing resend.
   Web PhoneApp.stopAndCheckReceipt is the existing behavioral reference. iPhone's NativeApplicationReceipt is display-only. Android ReceiptsScreen offers Stop only for activePlans, and ApplicationReceipt drops planId.
   Preserve and validate planId, then add an explicit localized receipt-specific “Stop unsent work and check” path through current-workspace and durable Stop-hold logic. Do not auto-mutate on refresh or auto-resend.
   Test a dispatching receipt with empty activePlanIds/recoverablePlans: one explicit Stop, zero submit/advance, expired lease becomes uncertain, live lease remains dispatching, late real result stays intact, lost-response Stop hold survives restart, and account/reconnect races cannot target another workspace.

2. **iPhone import silently omits distinct unfinished notes from a valid Android backup.**
   Android exports current record drafts and recordDraftAlternatives into the common recordDrafts array. iPhone mergeBackup appends only when no destination draft has that scope/job identity.
   Two distinct unfinished notes for one job therefore import only the first; an existing destination draft causes both to be skipped. The original backup file remains intact, so describe this accurately as an import omission.
   Preserve all distinct alternatives with a deliberate review path, or present an explicit conflict/partial-import choice before other replacement. Importing drafts must not adopt applied status, approval or provider evidence.
   Test empty and existing destinations, two alternatives for one identity, restart, re-export, deliberate selection/save, old backup compatibility and damaged input. Keep the original file and current data safe throughout.

3. **Native profile-conflict comparisons expose raw/English controlled values in Arabic.**
   iPhone serverProfile passes experienceLevel directly and builds work preferences with English labels. Android ProfileSummary directly renders workModes and experienceLevel.
   Map only app-owned enum/mode display values through existing localized labels. Preserve wire values, booleans and arbitrary user-entered text. The hosted comparison dialog is a useful reference.
   Test both versions in an Arabic conflict with entry/mid and multiple work modes, English human-readable labels, and each keep-version action preserving exact persisted data.

4. **Investigate deeply nested external JSON before claiming a crash.**
   Android limits bytes and validates UTF-8, then calls JSONTokener.nextValue before schema validation. The inspected Android parser is recursive without an inspected nesting bound. A supported-runtime failure has not yet been reproduced.
   Run an owned, invalid deeply nested backup below the byte cap. Require bounded rejection, no process termination, unchanged saved data and edits, and acceptance of valid Arabic/escaped-string backups.
   If reproduced, use a correct bounded parse/preflight design. Do not broadly catch Throwable as the solution and do not claim the hypothesis as a demonstrated defect before execution.

## Research and acceptance

Read the existing production policy and fixtures, particularly hosted/tests/hosted-applications.mjs's expiredStopPlan cases, the native workspace-interchange fixtures and current Stop-hold persistence. Do not edit hosted code; the server already has the targeted explicit-Stop behavior and the coordinator owns the hosted lane.

Use primary Apple/Android/provider sources for uncertain contracts. Critique lifecycle races, restart recovery, duplicate/uncertain receipts, account isolation, file-loss handling and Arabic recovery decisions. Preserve conservative submission truth and all existing generations, revision checks, encryption, backup compatibility and Stop holds.

Run narrow meaningful checks first, then coordinate native UI/device execution through the publisher's single build reservation. Include both languages, RTL/large text and actual recovery interactions; source inspection does not prove physical VoiceOver/TalkBack behavior.

Return exact branch/commits, changed files, baseline and candidate evidence, source/runtime hashes, failed attempts, pending acceptance, safe user alternatives and integration notes. Keep the source/head fixed for any claimed full CI pass. Do not claim release or store readiness; no store/account deletion or real employer action is included.
