# Terminal session 1 — Native search, truthful coverage and provider recovery

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

Use branch continuation/native-search-20261117-<your-session-id>. Coordinate with the publisher, then own only:
- apple/AhmadCareer/CareerDiscovery.swift
- apple/AhmadCareer/NativeDiscoveryViews.swift
- android/app/src/main/java/com/saleh/careerfinder/Discovery.kt
- android/app/src/main/java/com/saleh/careerfinder/DiscoveryScreen.kt
- Focused discovery tests and fixtures, including the existing DiscoveryCheck / DiscoveryRegression / DiscoveryPersistence paths when appropriate.
- Central native localization additions and their generator-produced outputs, if required. You are the single localization writer for these two new sessions; session 2 should send you any new copy requirements. Do not hand-edit generated files independently of their source.

Do not edit NativeApplicationsStore.swift, NativeApplicationsViews.swift, MobileApplicationState.swift, CareerViewModel.kt, Models.kt, MainActivity.kt or WorkspaceTransfer.kt: those belong to terminal session 2's separate recovery lane. Do not edit shared test runners while another owner is using them; agree on runner wiring with the publisher.

## Priority findings to validate, fix and retest

1. **Incomplete-empty results are described as healthy empty results on both native apps.**
   At the reviewed source, Android DiscoveryScreen and iPhone NativeDiscoveryViews fall through partial + zero jobs to “No roles match this search.” The hosted DiscoveryEmptyState already distinguishes complete, partial and unavailable.
   Keep those three outcomes distinct in visible and accessible EN/AR copy. Offer retry of the submitted search while preserving any newer filter draft. Test complete-empty, partial-empty from a source outage/stale data/provider cap, and unavailable; verify no old response overwrites a newer search.

2. **iPhone restores an empty historical search as if it were current.**
   CareerDiscovery sets restoredResults from !jobs.isEmpty even when a saved page exists. Its source presentation can say “Checked now” for persisted fresh data and omit the recorded checkedAt.
   Treat any restored page, including zero results, as historical. Show the actual check time and preserve clear freshness/coverage meaning. Verify empty and nonempty restart, failed refresh, successful new refresh and EN/AR date presentation.

3. **Equivalent board addresses can be selected twice and then rejected by the server.**
   Native validation/dedup operates on raw strings. For example greenhouse:canonical and https://boards.greenhouse.io/canonical describe the same board, while the server canonicalizes and rejects the duplicate query.
   Match the current production parseDiscoverySource contract for add/select/remove and persistence. Cover old/new Greenhouse hosts, case, trailing slash, direct job URLs, tracking parameters, Lever global/EU identity, invalid paths and credentials/ports. Preserve order and newer drafts. Do not weaken server validation or add arbitrary upstream URLs.

4. **Investigate Android transport cancellation before selecting a fix.**
   Discovery uses blocking HttpsURLConnection inside withContext(IO). Generation guards prevent stale UI adoption, but prompt socket cancellation and a total deadline for a trickling body have not been demonstrated.
   This is a hypothesis, not a proven native crash or leak. Use an owned slow/trickling HTTPS fixture to measure cancel/replacement behavior and resource release. If reproduced, implement a bounded cancellation/deadline solution and retest without weakening TLS or increasing every timeout.

5. **Make the existing employer-board route usable during API failures.**
   A real public diagnostic observed intermittent Lyra API timeouts, while its employer board returned HTTP 200. The feed patch preserves validated earlier pages as explicitly partial, but cannot create results when the first page fails.
   Android already has an Open employer board action; iPhone's reviewed source does not expose boardUrl. Provide a validated, explicit iPhone employer-board fallback from source coverage/error details with natural EN/AR text. It must not submit an application or claim provider verification. Confirm the precise URL and stale/error context.

## Research and acceptance

Read actual current source and existing tests first; deduplicate findings already fixed by another owner. Use primary provider/platform sources for uncertain behavior, especially Lever's documented pagination and Android cancellation semantics. Critique missing coverage, keyboard/reader status, RTL, large text, persistence and retry behavior; fix and retest every validated finding within your lane.

First run narrow meaningful logic/fixture checks, including cross-generation races and persisted empty searches. Arrange actual iPhone/Android acceptance through the publisher's single build reservation. Include EN/AR, RTL and large-text search/retry/board-selection journeys. Physical VoiceOver/TalkBack results remain separate unless actually exercised.

Return a compact handoff with your exact branch/commits, changed files, before/after failures, successful test commands, source/runtime identity, pending native gates, any requested localization changes and integration risks. Keep all original failed evidence. Do not duplicate the publisher's connection-address/email assertion fix or CI work.
