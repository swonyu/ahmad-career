# Career Finder: ten-pass research, design and review draft

**Coordinator handoff — 2026-11-18 13:12:00 UTC.**
**Source snapshot:** `ff21fd470a53710a2811ba2e34e5e0ebbfa7916f`. Hosted tree `e955a63e843e7035ea8ce71b2b37504c78577c9d`; Apple tree `c8080a217d0348ea738677619be5a3586d6887a2`.

## Current result

The review has produced concrete changes to the guest application route, search-source visibility, contact reuse, saved-profile role selection, application-record wording, focus recovery and the icon-aligned dark theme. Actual hosted browser checks cover the new manual guide in English and Arabic, saved records and Arabic note search, clipboard fallback and a synthetic copy, correction-dialog focus, a synthetic JSON export, and selected dark/light and narrow-layout states. Independent reviewers inspected the native source, canonical translations, generated resources, privacy boundaries and test changes. These are the outcomes supported by the retained evidence. [E02–E11]

**The ten-pass program remains open.** The ten sections below are distinct review scopes populated with work actually performed. They are not a claim that ten complete cross-platform end-to-end cycles have passed. The earlier list of ten research protocols remains planning history; this report does not turn it into execution. Shared receipts and overlapping test suites are referenced without multiplying their counts.

Two material items remain open. First, B16 is now a **validated recovery cleanup gap**: an intermediate stage autosave survives after “Keep” restores the original record and the editor closes cleanly; opening a new editor can accumulate an older copy. The assigned owner is preparing a narrow cleanup and encrypted-state regression checks. The main record remains preserved, but that does not make stale recovery copies acceptable or close the finding. Root will replay the exact browser cycle after the fix. [E07:B16, E19]

Second, the current seven-method focused iPhone attempt **stopped before compilation or tests**. Its boot log again ended “Data Migration Failed,” despite successful process exits and a Booted inventory state. The new verifier correctly rejected that false-green combination, and the owned simulator was shut down. All seven methods are unrun; no retry or native product pass is claimed. This verifies the gate’s negative path, not the cause of the earlier product-journey failures. [E21]

The last complete five-job run remains the failed historical run **44294650087** on `7b3f7761d69d`: three gates passed; iPhone finished **14 passed / 3 failed / 0 skipped / 0 unrun**; Android finished **112 passed / 2 failed / 0 skipped / 2 unrun**. No newer full combined CI acceptance exists. Merge, hosted deployment, signed installation and store availability remain separate outcomes. [E18]

After that blocked attempt, root authorized a fresh owned iOS 26.5 simulator diagnostic. Its result remains pending at this draft; the readiness gate is unchanged. The last observed focused outcome is still blocked before build/tests. Root has also preserved the current evidence files, four rendered-state screenshots and synthetic export in the repository documentation area, without committing them yet.

## Scope and evidence rules

The user requested useful, simple English and Arabic experiences and ten genuine critique/improvement passes, with UI and wording reviewed in each. Core use stays free; no paid research, API, upgrade, purchase or automatic paid overage is authorized. The original cutoff remains **19 November 2026, 01:26:12 Riyadh**. No real employer application or real-person acceptance data was used.

Lulu’s recorded abaya/category feedback belongs to Nulaya. Career Finder follows the broader preference for natural, practical English and Arabic. It does not import Nulaya’s product terms. The latest explicit Career Finder preference selects the existing icon’s navy/periwinkle direction; the earlier warm trial is retained only as superseded evidence.

The report distinguishes:

- **Source observation:** what the inspected implementation, catalog or test says.
- **Executed component/fixture check:** a retained real test result, with its scope and source-binding limit.
- **Actual browser observation:** a specific task or rendered state from the coordinator’s receipt.
- **Native execution:** a real current-source build or journey result. None is established by the blocked focused attempt.
- **Product inference:** a design choice informed by research, not a causal employment claim.
- **Pending work:** scenarios, fixes or checks that have not produced the required result.

A successful syntax check is not a native build. A passing resource generator is not Arabic usability. An HTTP preview cannot establish HTTPS discovery or provider acceptance. Nominal contrast ratios are not a full accessibility audit. No competitor feature page, survey or this review establishes that Career Finder is universally superior.

## Research and audience reasoning

The new research is a targeted delta to the existing repository’s **30 primary sources and 24 selected qualitative reviews**, plus the later competitor-capability report. Existing notes, stages, saved-note search, CSV and ICS were already present; this work does not claim to have invented them. The delta inspected twelve primary sources and used them to prioritize current, source-confirmed gaps. [E01]

Indeed’s September 2026 report describes a YouGov online survey of **1,501 US workers or temporarily unemployed people open to a new US job**, fielded 6–15 August and weighted to the US working population. It reports 46% abandoning an application because it was too long or tedious and 47% pausing a search because of overwhelm. These are self-reported US estimates, not worldwide or Gulf figures. They support investigating avoidable entry and navigation work; they do not prove that a particular change will create more interviews. [S02](https://www.indeed.com/news/releases/state-of-the-job-seeker-survey?co=US)

LinkedIn’s January 2026 release used separate Censuswide consumer and HR samples: **19,113 consumers** and **6,554 HR respondents**, fielded in November 2025 across listed markets including Saudi Arabia and the UAE. The pooled findings concern difficulty and uncertainty in job seeking. No usable Gulf-specific split or complete questionnaire is established by the retained source, and product rollout details cannot establish current entitlement or language availability. The useful inference is to show what was searched and what is known about the role, without inventing a personal fit score. [S01](https://news.linkedin.com/en-us/2026/LinkedIn-Research-Talent-2026)

Official help also reinforces a practical distinction: a person’s saved stage, a filled form and an employer-confirmed application are different events. Indeed documents limits on updates for external applications. Simplify’s Copilot guide separates filling, review and submission and provides manual fallbacks; it must not be generalized to its separate Autopilot product. Career Finder therefore retains explicit employer handoff, local-record wording and evidence-specific provider receipts. [S03](https://www.indeed.com/help/job-seekers/articles/4412589551757-my-jobs-managing-applied-jobs?co=US&hl=en) [S06](https://help.simplify.jobs/en/help/articles/2415391-use-copilot-to-autofill-applications)

### Comparison used for decisions

These are provider-documented capabilities and boundaries, not hands-on competitor benchmarks. Absence from a selected page is not proof that a competitor lacks a feature.

| Service | Useful documented lesson | Boundary relevant to Career Finder | Decision |
| --- | --- | --- | --- |
| LinkedIn | Role exploration and fit explanations respond to uncertainty. [S01](https://news.linkedin.com/en-us/2026/LinkedIn-Research-Talent-2026) | Announcement and vendor research do not establish current global rollout or hiring outcomes. | Make inputs and evidence visible; do not imply matching that the code does not perform. |
| Indeed | Personal stages and employer/platform updates have different meanings. [S03](https://www.indeed.com/help/job-seekers/articles/4412589551757-my-jobs-managing-applied-jobs?co=US&hl=en) | External applications may lack employer updates. | Keep a useful manual path and label the person’s record accurately. |
| Teal | A job-centered tracker brings bookmarks, notes, stages and related work together. [S04](https://www.tealhq.com/tools/job-tracker) | The selected page describes a free tracker and broader premium tools; it is not a reliability benchmark. | Reuse existing Saved and exports; avoid a second dashboard. |
| Huntr | Supported extraction/autofill still needs editable fallback for unsupported pages. [S05](https://help.huntr.co/en/articles/9859408-the-huntr-chrome-extension) | Form and page compatibility varies; mobile parity is not established here. | Keep manual preparation usable when automation is unavailable. |
| Simplify | Document choice, review and user correction matter in application reuse. [S06](https://help.simplify.jobs/en/help/articles/2415391-use-copilot-to-autofill-applications) | Copilot scope varies by form and is distinct from Autopilot. | Preserve exact CV identity and explicit submission boundaries. |
| Bayt | Location, experience and salary are visible regional search dimensions. [S07](https://apps.apple.com/sa/app/bayt-com-jobs-mena-job-search/id510893233) | Publisher scale/verification claims are not independently measured here. | Stored preferences must not suggest filters that are not applied. |
| GulfTalent | Role, industry and seniority distinctions matter alongside location. [S08](https://play.google.com/store/apps/details?hl=en&id=com.gulftalent.android.mobile) | Regional scope; the selected page does not establish Arabic UI or every entitlement. | Describe known fields and unknowns without a Gulf eligibility assumption. |
| Naukrigulf | English/Arabic, experience and freshness controls are regional expectations. [S09](https://apps.apple.com/sa/app/naukrigulf-job-search-app/id724241430) | Listing language metadata is not task-level localization or accessibility proof. | Inspect actual Arabic input, return and stale-state wording. |
| EURES / Europass | Official mobility and document resources can support regional decisions. [S10](https://eures.europa.eu/eures-services_en) | European scope; not a worldwide feed or a work-permission decision. | Prefer contextual official links over another tab or an invented integration. |

W3C’s writing guidance supports meaningful headings and links, clear instructions and ordinary language. The WCAG 2.2 criteria relevant to the web review include keyboard operation, reflow, language, unobscured focus, target size and avoiding redundant entry. Its AA target-size criterion is 24 CSS pixels with exceptions; that figure is not a native control-size rule. Reading either document does not constitute an accessibility test. [S11](https://www.w3.org/WAI/tips/writing/) [S12](https://www.w3.org/TR/WCAG22/)

## Design decisions and limits

| Decision | Why it addresses the actual task | Preserved limit |
| --- | --- | --- |
| Put manual employer application first for guests | The useful route existed but was hard to discover in Apply. | Private/provider operations still require their existing account and consent checks. |
| Show selected boards and sources of displayed results | People need to know what the bounded search represents. | Selected public boards do not mean every job, country or profession is covered. |
| Say “Job title or keyword” and identify searchable metadata | The server does not search every provider’s full description. | No new unbounded content fetch or added provider cost. |
| Let a saved role fill one field explicitly | It reduces entry while preserving the user’s current search intent. | It does not run search, change location/remote choice, rank by profile or establish work eligibility. |
| Copy one visible contact field on request | This is a small, reviewable response to repeated application entry. | No external form automation, automatic clipboard reads, CV transfer or submission. |
| Keep the existing active-CV model honest | Filename, size and review identity already exist. | No multi-CV library or automatic PDF-to-profile extraction is claimed. |
| Keep personal stages separate from provider receipts | It prevents ordinary organization from sounding like an employer outcome. | Clearing a mark does not withdraw an employer application. |
| Use the icon-aligned navy/periwinkle palette | It follows the user’s latest direction and coherent semantic roles. | Actual native appearance remains unverified; contrast calculations have a limited scope. |
| Preserve platform routes during this correction | Recovered documents deliberately distinguish the three navigation models. | Common exact labels would be a new architecture decision with migration and journey work. |

### Navigation provenance

The browser uses **Search / Saved / Apply / Profile / Settings**. iPhone uses **Start / Search / Apply / Saved / Settings**, with Profile through Settings and applicant editing also through Start/Apply. Android uses **Jobs / Apply / Receipts / Profile / Settings**; Jobs contains **Discover / Saved**.

The decisive recovered document is `docs/public-support-navigation-20261117/README.md:7–15`: it explicitly identifies describing the browser sections as the native sections as a support-copy error and records all three models. `docs/Continuation-Implementation-2026-11-17.md:152` introduces the five labels as the “candidate browser.” The General-Audience documents do not prescribe exact shared labels, and the release-candidate document promises five tabs without one common set. [E06]

The current request for simple consistent navigation is valid design direction. This review does not silently convert it into an old requirement violation or replace primary tabs without preserving Start, receipts, planning, profile and saved-record routes.

## Ten distinct review scopes

All ten scopes below include UI and English/Arabic wording work. They remain open at program level because the stated platform-specific checks, current native execution and complete combined CI are not finished. Shared evidence IDs point to the actual activity; they are not extra executions.

| Pass | Distinct question | Concrete work retained | Principal open proof |
| --- | --- | --- | --- |
| 1 | What does a job seeker need, and which existing routes should remain? | Primary research, guest-route finding, platform navigation recovery. | Any deliberate later alignment; no invented usability-study result. |
| 2 | Can a new user understand and control the search scope? | Visible board names, selected-versus-result source labels, explicit role prefill. | Actual HTTPS result binding and native role flow. |
| 3 | Can the person interpret a result and activate the right link? | Searchable-field wording, label-in-name correction, exact synthetic job details. | Live result scenarios and native cards. |
| 4 | Can a saved record survive return, edits and cancellation? | Real record reload/search, scoped Stage-focus correction, record-only iOS route. | B16 recovery cleanup and native record journeys. |
| 5 | Can profile reuse reduce typing without overstating automation? | Explicit field copy, denial fallback, Android write confirmation, honest CV scope. | Current native copy/PDF behavior. |
| 6 | Is manual application useful without confusing it with submission? | Manual-first guide and explicit save-before-employer instruction. | Native guest variants and external provider gates. |
| 7 | Are complete English and Arabic sentences natural and precise? | New-context copy review, help/stage correction, generated native bindings. | Current native rendering and unreplayed help details. |
| 8 | Does the interface remain usable with themes, narrow widths and large text? | Dark EN/AR, light AR, 269px focus/reflow, native wrapper review. | Actual native appearance and accessibility journeys. |
| 9 | Are interruption, ownership and export behavior truthful? | Identity/recovery source audit, real synthetic export, validated B16 gap. | B16 fix/retest and final combined recovery checks. |
| 10 | Does independent challenge survive integration and actual test evidence? | Cross-review, failed-media diagnosis, Android selector repair, fail-closed boot proof. | Healthy simulator, current native results and full five-job CI. |

### Pass 1 — Job-seeker goals, competitor evidence and navigation

**UI observations.** Inspected the guest Apply branch and retained navigation routes. The browser hid the manual option behind its guest sign-in branch; the final guide now appears first in the actual EN/AR browser flow (B01). Recovered the three actual navigation models. The17 November support correction explicitly distinguishes browser, iPhone and Android; no exact shared-label user contract was established.

**English wording.** Task names and instructions are preferred over success promises. The manual heading explains the actual employer-site route, and account purpose remains optional and specific.

**Arabic wording.** The guide uses التقديم على موقع جهة العمل and practical instructions. Natural Arabic does not import Nulaya's abaya vocabulary or imply that language/location proves work eligibility.

**Changes and decisions.** Prioritized discoverability, source honesty, explicit profile reuse and records over new dashboards or AI scores. Retained current platform routes; current iPhone README corrected its outdated Profile-tab description. Relevant source commits: `246e246bd0da`, `b6f499361279`, `74b8ab0009f3`, `a34e92d3c8da`, `b74245c87dc0`.

**Actual verification.** Reviewed12 primary sources and the two existing research reports; vendor claims, survey samples and product inference are separated (E01). Verified the navigation scope against exact repo documents/source (E06). B01/B02 establish the hosted manual-first UI and EN/AR instruction wording; this is not proof of a new representative usability study.

**Still open.** Keep any future cross-platform tab alignment as an explicit design decision with route/state mapping and actual native checks. No ten-pass completion count is derived from desk research or the earlier protocol list. Current native and full-CI acceptance remain open; this scope is not marked closed.

**Evidence:** E01; E06; E07:B01; E07:B02. Research: [S01](https://news.linkedin.com/en-us/2026/LinkedIn-Research-Talent-2026), [S02](https://www.indeed.com/news/releases/state-of-the-job-seeker-survey?co=US), [S03](https://www.indeed.com/help/job-seekers/articles/4412589551757-my-jobs-managing-applied-jobs?co=US&hl=en), [S04](https://www.tealhq.com/tools/job-tracker), [S05](https://help.huntr.co/en/articles/9859408-the-huntr-chrome-extension), [S06](https://help.simplify.jobs/en/help/articles/2415391-use-copilot-to-autofill-applications), [S07](https://apps.apple.com/sa/app/bayt-com-jobs-mena-job-search/id510893233), [S08](https://play.google.com/store/apps/details?hl=en&id=com.gulftalent.android.mobile), [S09](https://apps.apple.com/sa/app/naukrigulf-job-search-app/id724241430), [S10](https://eures.europa.eu/eures-services_en), [S11](https://www.w3.org/WAI/tips/writing/), [S12](https://www.w3.org/TR/WCAG22/).

### Pass 2 — First use, search setup and source coverage

**UI observations.** Added visible selected employer-board names outside the collapsed options and a separate Results from line for displayed results. Saved-profile role choices prefill only the query. B07 observed that Riyadh and remote-only choice remain and no search starts automatically. Default choices continue to represent a bounded selection of public boards, not all jobs or a geographic eligibility promise.

**English wording.** Selected employer boards:, Results from:, Job title or keyword, and Choose a job title from your saved profile describe their exact scope. The user still chooses Search jobs.

**Arabic wording.** صفحات التوظيف المختارة: and مصادر هذه النتائج: distinguish selection from result provenance. اختر مسمى وظيفيًا من ملفك المحفوظ is the verified chooser label; the helper says the title is only added to the search field.

**Changes and decisions.** Expose existing source data without a second provenance system. Change only the explicit keyword field when a saved role is selected; clarify chooser action in both languages. Relevant source commits: `246e246bd0da`, `6b21e2355fee`, `927b7c49f5cd`, `ff21fd470a53`.

**Actual verification.** Source checks cover query-only prefill, no dispatched search and preservation of location/remote filters; final local log includes this case (E10). B07 is an actual Arabic browser observation; native callsites and generated bindings were independently read at927b7c49 (E04). Existing discovery fixture group reports47 groups passed; it is modeled/Workerd evidence, not a live-source browser pass.

**Still open.** B08: local HTTP preview cannot validate the HTTPS-required discovery endpoints; preserve HTTPS protection. Verify changing sources without resubmitting cannot relabel old displayed results in the actual HTTPS client. Execute current native role-selection tasks in both languages. Current native and full-CI acceptance remain open; this scope is not marked closed.

**Evidence:** E01:CF2; E01:CF3; E04; E07:B07; E07:B08; E09; E10; E14. Research: [S01](https://news.linkedin.com/en-us/2026/LinkedIn-Research-Talent-2026), [S07](https://apps.apple.com/sa/app/bayt-com-jobs-mena-job-search/id510893233), [S08](https://play.google.com/store/apps/details?hl=en&id=com.gulftalent.android.mobile), [S09](https://apps.apple.com/sa/app/naukrigulf-job-search-app/id724241430).

### Pass 3 — Search results, job details and decision clarity

**UI observations.** The new job-link accessible name initially omitted its visible label; corrected name includes View job and exact job title while preserving href. Backend inspection established search matches titles, employers and available summaries; Greenhouse summaries are empty in the bounded listing response, so a description-only skill is not a supported match. B03 retained a mixed Arabic/English synthetic title, Riyadh and exact example.com hostname through the actual form. No employer page was opened.

**English wording.** Job title or keyword replaces Job title or skill. Searches titles, employers and available summaries. makes the limit visible. View job: {0} retains the visible action.

**Arabic wording.** المسمى الوظيفي أو كلمة مفتاحية; يشمل البحث المسميات وجهات العمل والملخصات المتاحة.; عرض الوظيفة: {0}. These retain action meaning and avoid an unsupported full-description search claim.

**Changes and decisions.** Correct the searchable-scope promise without adding provider traffic, unbounded descriptions or new costs. Preserve visible-label/accessible-name agreement and exact destination. Relevant source commits: `246e246bd0da`, `b6f499361279`.

**Actual verification.** The actual JobCard regression with production translation passed in the local focused set and checks EN/AR label inclusion, title, href and noopener noreferrer (E10). E02 inspected fixed upstream hosts, URL reconstruction, bounded responses/deadlines, no incoming credential forwarding, and separate stale/partial/unavailable states. B03 verified the synthetic record's title/location/hostname; it is not live job validation.

**Still open.** No live junior/senior/remote-restriction/salary scenario sweep has been established by these checks. Actual HTTPS search and current native result cards remain to verify. No screen-reader/voice-control session was executed by the source reviewers. Current native and full-CI acceptance remain open; this scope is not marked closed.

**Evidence:** E02; E07:B03; E07:B08; E10. Research: [S01](https://news.linkedin.com/en-us/2026/LinkedIn-Research-Talent-2026), [S07](https://apps.apple.com/sa/app/bayt-com-jobs-mena-job-search/id510893233), [S08](https://play.google.com/store/apps/details?hl=en&id=com.gulftalent.android.mobile), [S09](https://apps.apple.com/sa/app/naukrigulf-job-search-app/id724241430), [S10](https://eures.europa.eu/eures-services_en), [S11](https://www.w3.org/WAI/tips/writing/), [S12](https://www.w3.org/TR/WCAG22/).

### Pass 4 — Saved jobs, stages, follow-ups and return journeys

**UI observations.** B04 exercised actual stage/date/follow-up/private-note save and reload, Arabic note search and unmatched-query recovery. B12 found and rechecked a real focus loss: keeping the original applied stage removed the focused confirmation button inside an open modal. The corrected flow returns to Stage and retains applied state, dates and note. Independent iOS source review found that record-only users had Saved records but the guest Apply predicate sent them to Search; successor uses savedOpportunities.

**English wording.** Saved for later and Keep application record name the record action. The correction explicitly says it removes only the personal applied mark and does not withdraw an employer application.

**Arabic wording.** محفوظة للرجوع إليها; الاحتفاظ بسجل التقديم; هل تريد إلغاء علامة التقديم؟; إلغاء علامة التقديم. B13 confirmed the no-employer-withdrawal explanation in the rendered dialog.

**Changes and decisions.** Scope focus restoration to the same still-open enabled editor and lost focus only; do not change record persistence. Use Saved's real collection for the native guest route, including retained meaningful unbookmarked records. Relevant source commits: `927b7c49f5cd`, `ff21fd470a53`, `6b21e2355fee`, `246e246bd0da`, `b6f499361279`.

**Actual verification.** B04/B12/B13 are actual browser observations; final Keep returns to SELECT with value applied in EN and AR. E10 retained112 passing tests, including cancellation preservation and not stealing chosen focus/inactive/replaced editors. The existing iPhone private-record method now includes bookmark removal, guest navigation, retained note and no bookmark resurrection assertions; source verified but not yet run.

**Still open.** B16 is a validated cleanup gap awaiting correction: recovery retains the reverted intermediate stage after Keep/clean close. The main record was preserved; root will replay the exact cycle after the owner's fix. Current native record-only and large-text journeys must pass. Existing CSV/ICS/notes/stages are retained features, not counted as new implementations. Current native and full-CI acceptance remain open; this scope is not marked closed.

**Evidence:** E04; E05; E07:B03; E07:B04; E07:B12; E07:B13; E07:B16; E10; E17. Research: [S03](https://www.indeed.com/help/job-seekers/articles/4412589551757-my-jobs-managing-applied-jobs?co=US&hl=en), [S04](https://www.tealhq.com/tools/job-tracker), [S05](https://help.huntr.co/en/articles/9859408-the-huntr-chrome-extension).

### Pass 5 — Profile, CV handling and repeated application entry

**UI observations.** The active PDF filename/size and exact prepared document identity already existed; the review did not invent a missing filename feature or a multi-CV library. Added expandable, user-triggered copying of one displayed contact field. Values remain available after clipboard denial. B06 first observed a denied automation-triggered request and the fallback, then a real pointer click copied exactly the synthetic email. Native source uses vertical wrapping rows and explicit direction for email/phone/URLs. Android's unconditional Copied feedback was corrected to require its own fresh metadata marker, with exception/unconfirmed handling.

**English wording.** Reuse your contact details and Copy {0} describe a single chosen field. Native failure now says: Copy could not be confirmed. Copy the value from its profile field instead. No automatic extraction or submission is promised.

**Arabic wording.** Web uses استخدام بيانات التواصل في الطلبات and نسخ {0}; native failure is تعذّر تأكيد النسخ. انسخ القيمة من حقلها في الملف الشخصي. Instructions retain review before pasting/submission.

**Changes and decisions.** Reduce repeated typing using an explicit per-field action without external form access, automatic clipboard reads or broader profile transfer. Keep one active CV and existing document-review identity; defer multi-document packets and automated extraction. Confirm Android write using opaque operation metadata only, not clipboard text. Relevant source commits: `246e246bd0da`, `b6f499361279`, `927b7c49f5cd`, `ff21fd470a53`.

**Actual verification.** B06 records actual permission-denial fallback and successful synthetic pointer copy; no other user clipboard content was read. Source/test checks cover exact chosen value, exclusion of CV/roles, unchanged profile and selectable fallback (E03/E10). E05 independently accepted the native correction; added source cases cover silent ignored write, missing description and write/read exceptions. Author reports generator1,824 strings/149 templates,8 localization tests, plutil/diff and Swift syntax checks passed; these are not native builds.

**Still open.** Execute current native clipboard success/failure and profile-role journeys. Actual current PDF replace/cancel/last-valid-file/browser download cycle was not newly re-executed for this ten-pass scope; do not inherit an older run as current acceptance. No full autofill or automatic CV-to-profile parsing is implemented. Current native and full-CI acceptance remain open; this scope is not marked closed.

**Evidence:** E01:CF4; E03; E04; E05; E07:B06; E10; E16; E17. Research: [S02](https://www.indeed.com/news/releases/state-of-the-job-seeker-survey?co=US), [S05](https://help.huntr.co/en/articles/9859408-the-huntr-chrome-extension), [S06](https://help.simplify.jobs/en/help/articles/2415391-use-copilot-to-autofill-applications), [S12](https://www.w3.org/TR/WCAG22/).

### Pass 6 — Manual application and supported submission evidence

**UI observations.** The final Apply guide presents the manual employer route before optional online-account features in EN and AR. Review found a task gap: Step3 assumed the job was saved, although opening View job does not bookmark it. The guide now explicitly tells the user to save first. Native manual actions route existing screens; connected review/submission remains a separate permissioned path.

**English wording.** Choose and save a job; Save the job before opening the employer’s page. Check its requirements, location and deadline there.; Record what happened. The record is explicitly separate from employer confirmation.

**Arabic wording.** اختر وظيفة واحفظها; احفظ الوظيفة أولًا، ثم افتح صفحة جهة العمل لمراجعة المتطلبات والموقع وآخر موعد للتقديم.; سجّل ما أنجزته. The final sentence says the record is not employer confirmation.

**Changes and decisions.** Keep the free manual route reachable for guests while preserving account/identity guards around private/provider work. Do not infer application success from opening a job, copying data, saving a record or connecting a workspace. Relevant source commits: `246e246bd0da`, `b6f499361279`, `74b8ab0009f3`.

**Actual verification.** B01/B02 verify the manual-first order, collapsed optional-account disclosure, appropriate Saved navigation and save-first wording. E03 inspected locked/revalidating identity guards, CV metadata containment and unchanged navigation-only side effects. Existing local service/phone fixture groups preserve approval, no replay, uncertainty and Stop boundaries; no real employer application was sent.

**Still open.** Native guest flows need actual execution for zero jobs, bookmarked jobs and retained unbookmarked records. Live OAuth/provider submission acceptance remains an external gate; HTTP preview provider checks are explicitly not a pass. Employer sites may require their own account; no no-account promise is made about external forms. Current native and full-CI acceptance remain open; this scope is not marked closed.

**Evidence:** E03; E04; E05; E07:B01; E07:B02; E07:B08; E09. Research: [S02](https://www.indeed.com/news/releases/state-of-the-job-seeker-survey?co=US), [S03](https://www.indeed.com/help/job-seekers/articles/4412589551757-my-jobs-managing-applied-jobs?co=US&hl=en), [S05](https://help.huntr.co/en/articles/9859408-the-huntr-chrome-extension), [S06](https://help.simplify.jobs/en/help/articles/2415391-use-copilot-to-autofill-applications).

### Pass 7 — English/Arabic language, RTL and reading effort

**UI observations.** Read the new instructions in their actual hosted Apply, Search, Profile and correction context, and independently reviewed native source plus generated localization. B11 exposed a repeated English conjunction and stale stage label in help; corrected source and localization checks are retained, but every accordion was not replayed. Earlier copy cleanup at1194ded/7b3f776 is supporting history:33 native pairs and46 hosted pairs plus store copy/artwork. It is not re-counted as a newly executed ten-pass cycle.

**English wording.** Use task headings such as Search jobs, Saved jobs, Application receipts, Review application details and EXAMPLE SEARCHES. Remove vague next-step/success slogans while retaining factual privacy and submission limits.

**Arabic wording.** Use natural functional Arabic such as البحث عن وظائف, الوظائف المحفوظة, إيصالات التقديم, مراجعة بيانات التقديم and أمثلة للبحث. Fix the chooser wording and preserve the specific local applied-mark meaning. Nulaya-only Lulu terms remain out of Career Finder.

**Changes and decisions.** Correct full sentences as well as headings; preserve placeholders, whitespace-aware lookup and existing controls. Use the canonical native catalog and regenerated resource tables, not divergent hand edits. Keep current listing copy factual; no store upload or updated installed screenshots is inferred. Relevant source commits: `6b21e2355fee`, `927b7c49f5cd`, `ff21fd470a53`, `246e246bd0da`, `b6f499361279`, `1194ded6c561`, `7b3f7761d69d`.

**Actual verification.** E04 verified final chooser pair in both native callsites, all generated Apple/Android resources and lookup IDs at927b7c49. E11 contains78 passing language/task/theme checks; E10 includes the EN/AR rendered JobCard regression. B13 checks rendered Arabic correction copy; B15 checks final Arabic role/search wording in light theme. Historical feature artwork was rendered and visually inspected with matching fonts at the copy checkpoint.

**Still open.** Complete current native EN/AR rendered checks; source resource parity is insufficient. Replay any changed help accordion needed for final delivery; B11 only establishes source fix and relevant tests after edit. Bind current store screenshots/metadata to the eventual accepted native release; historical copy counts do not certify a later store state. Current native and full-CI acceptance remain open; this scope is not marked closed.

**Evidence:** E04; E07:B02; E07:B07; E07:B11; E07:B13; E07:B15; E10; E11; E15; E17. Research: [S09](https://apps.apple.com/sa/app/naukrigulf-job-search-app/id724241430), [S11](https://www.w3.org/WAI/tips/writing/), [S12](https://www.w3.org/TR/WCAG22/).

### Pass 8 — Visual consistency, accessibility and responsive layouts

**UI observations.** The latest user-directed palette uses midnight navy/periwinkle from the existing icon. The earlier warm trial is explicitly superseded. B09 checked aligned guide/disclosure widths and final dark EN/AR screenshots; B15 checked Arabic light appearance. B10 measured actual Chrome 500% zoom at269 CSS px: scrollWidth269 and focused actions above fixed navigation after the normal scroll settled. Native source retains44 pt iPhone and48/56 dp Android minimum actions, vertical wrapping, explicit structured-value direction and app-owned dark-mode List/Form styling.

**English wording.** Meaningful action labels remain attached to the visible controls; View job is included in its accessible name. Account disclosure, save action and record correction use concrete words rather than decorative headings.

**Arabic wording.** Long Arabic guide/chooser/correction text is allowed to wrap. Structured email/phone/URL values use left-to-right presentation while natural Arabic labels remain RTL. The actual269px and light/dark checks preserve their Arabic scope.

**Changes and decisions.** Apply semantic surface/text/action/error/outline roles; align the desktop guide and optional-account disclosure. Keep focus restorations narrow and responsive controls reachable; preserve intentional focus choices. Do not change UIKit appearance proxies or Safari controller behavior through the SwiftUI palette wrappers. Relevant source commits: `246e246bd0da`, `b6f499361279`, `6b21e2355fee`.

**Actual verification.** E08 measured19 opaque web color-role pairs above their declared text/outline thresholds; source values only, not composited pixels. B09/B10/B15 are actual rendered observations, with screenshot hashes retained in E07. E04 inspected native wrappers and calculated nominal ratios; no additional supported wrapper/layout defect was found.

**Still open.** Native dark/light, largest text and EN/AR rendering remains pending. No full screen-reader or physical-device accessibility audit was executed; no blanket WCAG/native certification. Current iPhone historical large-text/Safari/keyboard failures remain failures until the current source demonstrates the required outcomes. Current native and full-CI acceptance remain open; this scope is not marked closed.

**Evidence:** E04; E07:B05; E07:B09; E07:B10; E07:B12; E07:B15; E08; E13. Research: [S11](https://www.w3.org/WAI/tips/writing/), [S12](https://www.w3.org/TR/WCAG22/).

### Pass 9 — Failure recovery, privacy, data portability and performance

**UI observations.** Independent source review retained identity quarantine, owner-specific drafts, stale/partial search distinctions and no automatic replay. B05 rechecked profile-save focus recovery; B14 downloaded actual synthetic version 2 JSON containing the expected saved/recovery data, email/job/note. B16 is now independently validated: an intermediate stage autosave remains after Keep restores the original record and clean close; new editor IDs accumulate older copies. The main record preservation and successful export do not settle recovery cleanup. No new performance benchmark or expanded provider-fetch work was conducted; existing bounded requests/cache/deadlines remain.

**English wording.** Export phone data is described as a readable record, not an automatic restore file. Clipboard errors leave explicit fallback; clearing browser data can remove local drafts; private records and employer-held applications remain distinct.

**Arabic wording.** تصدير بيانات الهاتف and the existing explicit sentence ولا يمكن استعادتها تلقائيًا داخل التطبيق preserve the portability limit. Error/recovery wording must say what remains and the next valid action, without presenting old recovery state as a confirmed employer outcome.

**Changes and decisions.** Preserve existing data boundaries and bounded backend behavior; do not broaden fetches or add paid dependencies. Keep B16 open while the assigned owner implements the narrow PhoneApp cleanup correction and real encrypted safety regression tests; then root replays the exact browser cycle. Relevant source commits: `246e246bd0da`, `927b7c49f5cd`, `ff21fd470a53`.

**Actual verification.** E03 reviewed identity/CV guards, recovery/export boundaries and role/copy scope; no additional source-supported privacy blocker was found within that bounded review. B14 verifies the actual synthetic JSON download and content; file hash is in E07. E09 preserves passing local service/discovery/phone/vault groups, while source binding to later changes must remain explicit.

**Still open.** Bind B16's actual fix, encrypted-state regression and browser replay before closing this pass. Do not infer data loss or identical duplicate payloads. Final combined recovery and ownership tests/native journeys remain required. No whole-product security certification, live-provider acceptance or new performance claim follows from this review. Current native and full-CI acceptance remain open; this scope is not marked closed.

**Evidence:** E02:backendTrustAudit; E03; E05; E07:B05; E07:B06; E07:B14; E07:B16; E09; E19. Research: [S03](https://www.indeed.com/help/job-seekers/articles/4412589551757-my-jobs-managing-applied-jobs?co=US&hl=en), [S05](https://help.huntr.co/en/articles/9859408-the-huntr-chrome-extension), [S11](https://www.w3.org/WAI/tips/writing/).

### Pass 10 — Independent adversarial review and integrated end-to-end regression

**UI observations.** Three independent review lanes cover product/copy/layout, privacy/recovery and current integration/browser behavior. Findings are linked to exact files/commits, not just accepted verbally. Actual failed iPhone media/logs were reviewed: the first launch worked, the large-text Search tab failed immediate hittability, Safari remained visible after a Close tap, and keyboard-key hit-testing encountered an invalid frame while the keyboard still appeared. The raw boot log ended Data Migration Failed despite a green setup step, so the acceptance path now requires explicit boot evidence. Android action selectors now disambiguate a real clickable Search jobs control.

**English wording.** Plain labels can repeat as a heading and action; tests must use the correct existing semantics without weakening the user journey. Search jobs, Save draft and Safari Close remain real actions, not replaced by arbitrary first-match selectors.

**Arabic wording.** The same Arabic action meaning and current generated resources are retained. The failed Arabic large-text browser-return path is still failed until a new actual run shows return; translation presence alone cannot certify it.

**Changes and decisions.** Use a fail-closed boot verifier bound to selected UUID, raw terminal output, exits and available Booted inventory. Within the original5 second wait, require tab exists and is hittable together; filter nonfinite/empty/offscreen keyboard frames before querying hittability while retaining real dismissal assertions. Keep all17 iPhone and116 Android methods, assertions, selection, runtime ceilings and failed historical evidence; no retry/erase/skip/budget weakening. Defer Safari/coordinator instrumentation until a healthy-boot run demonstrates the need; no speculative product rewrite. Relevant source commits: `fc5cc80e0018`, `ead12355246f`, `56304712d8b4`, `e63b0dbb8abb`, `246e246bd0da`, `6b21e2355fee`, `927b7c49f5cd`, `ff21fd470a53`.

**Actual verification.** E12 records11 meaningful offline verifier tests, static syntax/YAML checks and independent CI-agent source acceptance bound tofc5cc80e. All17 iPhone method bodies and action/assertion counts were retained in the helper repair; native execution block and selection were unchanged. E18 remains FAILED:3/5 gates; iPhone14 pass / 3 fail / 0 skip / 0 unrun; Android112 pass / 2 fail / 0 skip / 2 unrun. The focused attempt on ff21fd47 began at 13:06:06Z and stopped before compilation/tests. Terminal Data Migration Failed was correctly rejected despite exits0 and Booted inventory; all seven selected methods are unrun. Shutdown was confirmed. This is gate verification, not native product acceptance (E21).

**Still open.** Resolve the simulator readiness blocker through the owned coordination route, then obtain actual focused results and current native UI artifacts without weakening the gate or user journeys. Freeze and verify the final combined five-job CI, all17 iPhone and116 Android outcomes, artifact hashes and visual review. Finish and verify B16; retain separate merge, deployment, signing and store gates. Current native and full-CI acceptance remain open; this scope is not marked closed.

**Evidence:** E04; E05; E07; E10; E12; E13; E17; E18; E19; E20; E21. Research: [S11](https://www.w3.org/WAI/tips/writing/), [S12](https://www.w3.org/TR/WCAG22/).

## Verification accounting

The local logs record real executions, but their units overlap and differ. Do not add them into a headline “total tests passed,” and do not automatically attach an earlier result to a later source change.

| Evidence | Observed outcome | What it establishes | What it does not establish |
| --- | --- | --- | --- |
| Hosted browser E07 | 16 recorded observations with individual outcomes; B08 environment-limited and B16 now a validated open finding | Specific tasks, rendered states, source hashes, screenshots and synthetic export | All browsers/devices, live HTTPS/OAuth, native acceptance or a completed ten-pass program |
| Full local log E09 | 6 PDF-source tests; 63 service groups; 47 discovery groups; 19 phone groups; 333 Node tests; 34 vault groups reported passing | The recorded command’s modeled/component/storage checks | Additive independent total or acceptance of every later commit |
| Later focus/task log E10 | 112 passed, 0 failed, 0 skipped | Recorded focused record, focus and task regressions | A replacement for full CI or actual native rendering |
| Language/task/theme log E11 | 78 passed, 0 failed, 0 skipped | Recorded localization/task/theme checks | All natural-language states or assistive-technology acceptance |
| Native author static checks E16/E17 | Generator check: 1,824 strings per language, 149 templates; 8 localization tests; plutil/diff and Swift parse checks | Resource consistency and bounded syntax/source validation | Native compilation, installed behavior or UI pass |
| Offline readiness checks E12 | 11 parser/fixture cases plus syntax and independent source review | Failed/malformed/mismatched readiness inputs are rejected under tested cases | A healthy simulator or a product journey pass |
| Current focused attempt E21 | Blocked at readiness; 0 executed / 7 unrun; Shutdown confirmed | Actual failed boot evidence correctly stops execution | Compilation, seven passing cases, or product causality |
| Complete historical CI E18 | Failed: 3/5 jobs; iPhone 14/17; Android 112 passed, 2 failed, 2 unrun | Exact historical candidate outcomes and retained artifacts | Acceptance of current source |

E07 binds the hosted browser work to the exact files and hosted tree in `ff21fd470a53`. Local logs alone do not supply every command/source relationship; the coordinator must retain those receipts and the final full CI. B16’s correction will create another source checkpoint and requires its own binding and relevant rechecks.

## Source lineage

| Role | Source commit | Integrated equivalent or qualification |
| --- | --- | --- |
| Earlier plain-copy foundation | `1194ded6c561` | Historical supporting work; not a new completed pass |
| Example-search copy follow-up / program baseline | `7b3f7761d69d` | Historical full CI failed |
| Android clickable search selector | `56304712d8b4` | `e63b0dbb8abb` |
| Native manual flow, reuse and theme | `b6f499361279` | `74b8ab0009f3` |
| Hosted task, wording and theme changes | `246e246bd0da` | Parent of later scoped fixes |
| Fail-closed readiness and bounded UI helpers | `fc5cc80e0018` | `ead12355246f` |
| Hosted Stage-focus and chooser wording | `6b21e2355fee` | Actual EN/AR Keep flow rechecked |
| Current native README | `a34e92d3c8da` | `b74245c87dc0` |
| Native chooser, retained-record and clipboard correction | `927b7c49f5cd` | `ff21fd470a53` |
| B16 recovery cleanup | Pending at this draft | Do not invent a fix commit or passing replay |

The source snapshot had no tracked source modification when inspected; it did have the coordinator’s untracked ten-pass documentation. The report therefore does not call the entire worktree clean.

## What must happen before closure

The next concrete product correction is B16’s cleanup. Retain the original synthetic export and browser observation, bind the narrow source change, run the real encrypted-state regression and repeat the exact stage-change / Save prompt / Keep / Cancel cycle. The expected result is correct recovery cleanup while the applied stage, dates and note remain intact; do not mask the gap through revised explanatory copy.

The native owner must resolve the simulator-readiness blocker through the existing ownership route before collecting current native results. The gate remains fail-closed. The retained Safari failure is not permission for a speculative coordinator rewrite, and a finite-frame guard is not proof that a visible keyboard dismissed. Any new result must preserve the real user action and its outcome.

After correction and bounded qualification, freeze one combined candidate and obtain its five ordinary CI jobs, complete 17-method iPhone and 116-method Android outcomes, source/artifact receipts and native visual review. Focused attempts diagnose and qualify changes; they do not replace that gate. The authorized merge still targets PR #1’s base `career-finder-phones-verified-apply-20261116`, not `main`.

Compatible HTTPS browser checks, actual consent/provider configuration, signing/physical-device checks and store processing remain distinct delivery gates. No current draft, local preview, saved Site version, unsigned build or screenshot is described as deployment or public release.

## Primary-source register

All twelve sources were retrieved on 18 November 2026. Exact retrieval refs, methodology fields and limitations are retained in the machine ledger and E01. The original research URLs and conclusions remain dated observations; no new paid or public research was performed to assemble this draft.

### S01 — LinkedIn

[LinkedIn Research: Nearly 80% of people feel unprepared to find a job in 2026](https://news.linkedin.com/en-us/2026/LinkedIn-Research-Talent-2026). Published/update observation: 2026-01-07. Consumer and HR samples are distinct. Pooled findings are not Saudi/UAE estimates; this page supplies no usable country split or complete questionnaire. January product rollout details do not prove November language/entitlement scope. Vendor outcome statistics are not adopted as causal evidence.

### S02 — Indeed

[What 1,500 Workers Revealed About Job Search Burnout](https://www.indeed.com/news/releases/state-of-the-job-seeker-survey?co=US). Published/update observation: 2026-09-29. US-only, self-reported, active and passive search population. No basis for applying the percentages worldwide or to Gulf job seekers. Does not prove a specific interface change improves hiring outcomes.

### S03 — Indeed

[My Jobs: Managing Applied Jobs](https://www.indeed.com/help/job-seekers/articles/4412589551757-my-jobs-managing-applied-jobs?co=US&hl=en). No reliable publication date was recorded. Product help documents scope, not a reliability benchmark. Do not infer employer rejection from silence or treat a personal status as employer confirmation.

### S04 — Teal

[Job Application Tracker](https://www.tealhq.com/tools/job-tracker). No reliable publication date was recorded. Vendor-described workflow. No independent causal evidence for faster hiring. Existing Career Finder tracking and export work should be reused, not rebuilt.

### S05 — Huntr

[The Huntr Chrome Extension](https://help.huntr.co/en/articles/9859408-the-huntr-chrome-extension). Published/update observation: 2025-11-12. This source does not establish pricing, every supported page or mobile parity. Support constraints make manual correction/fallback a core requirement.

### S06 — Simplify

[Use Copilot to autofill applications](https://help.simplify.jobs/en/help/articles/2415391-use-copilot-to-autofill-applications). Published/update observation: Page showed a relative update approximately 25 days earlier; no exact date inferred. Copilot guidance must not be generalized to the separate Autopilot service. Per-form support varies; this is not a claim that all competitors require manual final submission.

### S07 — Bayt.com

[Bayt.com Jobs: MENA Job Search](https://apps.apple.com/sa/app/bayt-com-jobs-mena-job-search/id510893233). No reliable publication date was recorded. Marketing claims of verified jobs, scale or superiority are not independent evidence. Store listing was used because the older mobile-promo page redirects inconsistently. Prior recovered research already documents bilingual support.

### S08 — GulfTalent

[GulfTalent - Job Search App](https://play.google.com/store/apps/details?hl=en&id=com.gulftalent.android.mobile). Published/update observation: Listing updated 2026-11-05. Vendor description, not tested experience. Regional inventory is not worldwide coverage; Arabic UI and exact free/paid entitlement were not established by this selected page.

### S09 — Info Edge / Naukrigulf

[Naukrigulf Job Search App](https://apps.apple.com/sa/app/naukrigulf-job-search-app/id724241430). No reliable publication date was recorded. Publisher metadata does not establish localization quality, employer response rates or accessibility. Missing declared accessibility features is not proof of inaccessibility.

### S10 — European Labour Authority / EURES

[EURES services](https://eures.europa.eu/eures-services_en). No reliable publication date was recorded. Useful regional alternative, not a worldwide board or an immigration eligibility decision. Linking to an official destination is not a Career Finder integration.

### S11 — W3C WAI

[Writing for Web Accessibility](https://www.w3.org/WAI/tips/writing/). No reliable publication date was recorded. Guidance is not a conformance audit. Apply natural English and Arabic independently; removing hype must preserve precise permissions, data scope and recovery instructions.

### S12 — W3C

[Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/). Published/update observation: 2024-12-12. Apply the actual criterion and exceptions. Web checks are not a claim of native accessibility conformance, and reading the standard is not an executed accessibility pass.

## Evidence register and integration notes

The companion JSON contains full hashes, original paths, source commits, per-pass evidence and open items. The files below are retained receipts, not new executions by this report author. Coordination updates are labeled as such until their underlying fix/result receipts are supplied.

| ID | Retained item | SHA-256 or provenance |
| --- | --- | --- |
| E01 | career-finder-research-delta-20261118-publication-review.json | `86d5144636d98600b4df23f7410fa380bd05ea6111b0e387dc92cbc6b11079ff` |
| E02 | hosted-task-guidance-source-critique-20261118.json | `942edc8eeeacdbcfeb245b79962050be997317f648831e7e0520ddbe4ea2df8e` |
| E03 | hosted-recovery-privacy-critique-20261118.json | `50a876b3a022f4528f5f09ada7efb98badcc457365edc71594ea183dd1f1acdb` |
| E04 | native-ui-wording-review-b6f4993.json | `e21635cfdd1cd8b5ad6cc536fc8891ce7d88cda658b4be09299bea80643ceb83` |
| E05 | native-feature-privacy-critique-20261118.json | `4afb16fa5c10a96c762dda5405a87903fa3ef73bd87366548d993b53d695f68d` |
| E06 | navigation-scope-review-927b7c49.json | `e6e88655ce9b27ecbb9857be331ff118c58c6b8f31de769fd7d186c1a0dee315` |
| E07 | hosted-browser-qa-20261118.json | `9a4272f54f631cc02c749a6b1f5b375eb560231cd3e9abfdfcfddf38fb971163` |
| E08 | career-finder-theme-contrast-20261118.json | `6a5a335db7a07470f2dc09a37756e7cdc5e948edf2508b2d7167fb90669cd6ba` |
| E09 | hosted-tenpass-final-full-tests.log | `2b7ae3b67c7709003cd28424fe67cefdd234420b57ecac71017cbd4637fb0ba7` |
| E10 | hosted-record-focus-tests.log | `80d5c625c5040692300b62f2809efa952972f960449a88f9e01cd0084b387865` |
| E11 | hosted-tenpass-final-copy-tests.log | `c41b740a2de0253bcff5a8e2bae3ead142d6c473e78334597b4e8ad7087bc88d` |
| E12 | iphone-readiness-repair-fc5cc80e.json | `b0b1136397354c5a56d57d6c5e1d3ae96010bd53d107e2db6485e3508e37c9cf` |
| E13 | iphone-failure-diagnosis-publication-review-44294650087.json | `893e8cf90f70df5cdab9d591b2673e88cfc6d488c4f2081345caf41e77943feb` |
| E14 | hosted-tenpass-improvements.json | `709d9c10af60ae8bf2db708e9764abca9b8fd8bf775873288b13c45536414aed` |
| E15 | Copy-Cleanup-2026-11-18.json | `d6a61e54243ece41d3436ae888609208ca8304fbea27b29d45d26db683e7a2c6` |
| E16 | native-task-handoff-b6f4993.json | `b229b9aca66b322222cb0a48234b980e992a7231212faf3c3e0158b9a09935b8` |
| E17 | native-resilience-927b7c49.json | `4262c40a5593678e7bd03764d69eea670396daf03710a38ac95b9f61ce3bcf86` |
| E18 | run-recovery-complete.json | `bf720bf0329358e73ad478e3665d988722343d274c2f6b412335390d1f03beb4` |
| E19 | B16 independent diagnosis accepted and narrow correction assigned | /root message to /root/publication_review after E07 was written |
| E20 | native_owner_execution_update | /root/recovery_review message |
| E21 | readiness-blocker-review.json | `68abe08d065e5c5e2439e9baf42872dba3263e028b19215789e0d2887f2e1109` |

The full coordinator source tree remains untouched by this author. This Markdown file and its structured ledger were prepared in scratch for root to review and place into the repository’s existing ten-pass documentation. Keep original evidence files and failed runs intact. Add the B16 fix/recheck, readiness resolution/current native outcomes and final source-bound CI before changing completion status.

No UI operation, product test, build, source modification, paid research call, external communication or deployment was performed to assemble these two documents.
