# Career Finder: competitor capability and quality review

**Review date:** 17 November 2026.  
**Lane:** independent, read-only research; no app edits, builds, tests, account actions, applications, purchases, or additional browser/Grok sessions.  
**Repository baseline:** `ca3d3411d8b5b36fa7093dff782f4a7b931261c7` in `/Users/saleh/Developer/career-finder-feed-continuation-20261117-4b851318da2d`.  
**Recovered research baseline:** development evidence `636d79a808bd4ecdd7ebd386b0f98a16ab3d2a32`.  
**Evidence interpretation:** every acceptance criterion below is proposed work or a gate, not a test claimed as passed.

## 1. Decision

Career Finder does not yet demonstrate feature parity with the strongest capabilities across these nine competitors. It has credible, source-supported foundations for a more dependable bilingual workflow: explicit source coverage and freshness, private drafts, account-scoped recovery, distinction between personal tracking and employer receipts, and approval tied to a particular application payload. These are candidate advantages to measure, not proof that competing products lack those protections.

The highest-value continuation is to make the complete search → save → prepare → external application → tracking/recovery journey work consistently on iPhone, Android, and the hosted client. The existing export, saved-note search, and contextual reminder work should be completed and tested in real consumers, rather than presented as newly discovered features. Large additions such as an application-filling extension, an employer network, inbox integration, or AI interview coaching are separate engineering investments; copying their labels would not establish parity.

Several capabilities were missing from the earlier summary or needed correction:

- Simplify now documents a native iOS app and Safari Copilot, so autofill must not be described as desktop-only. [S8–S9]
- Jobscan's current Auto Apply page describes user approval before every submission. Approval alone is therefore not a unique Career Finder advantage. [S13]
- Naukrigulf's Arabic Android listing advertises AI CV preparation/analysis and interview preparation, in addition to job discovery. Those are vendor claims, not evaluated output quality. [S20]
- Teal's current policy documents optional Gmail, calendar, and selected Drive-file capabilities, with approvals for the described writes. Tracker export and application-specific resume attachments are also documented. [S2–S3]
- Bayt's former mobile-promo source returned HTTP 410. Current official store listings and the candidate pricing page provide working sources. [S17–S19]

The standard for “better” should be successful tasks, preserved information, relevant opportunities, clear limits, and fewer erroneous actions on matched scenarios. It should not be the number of features, an invented ATS score, or a promise of more interviews.

## 2. Recovered work and method

The existing nine-service set is **Teal, Huntr, Simplify, Jobscan, LinkedIn, Indeed, Bayt, Naukrigulf, and Saudi Jadarat**. The prior Product Review records 30 primary pages and 24 selected qualitative reviews. Those reviews help generate hypotheses, but are neither a representative sample nor evidence of current failure rates. This review reused that work and refreshed official product/help/privacy/store sources instead of restarting the survey. [R1]

The prior interoperability report and implementation log already document saved-note search, CSV export, and one contextual ICS follow-up file. CSV and ICS are hosted-web capabilities in that evidence; native saved-note search exists. The logs distinguish serializer checks, spreadsheet checks, and actual consumer gaps. This review preserves that distinction. [R2–R3]

Evidence levels used here:

1. **Source inspected:** current Career Finder code or explicit contract at the cited commit. This establishes implemented logic, not deployed behavior.
2. **Recorded execution:** a prior owner report identifies a particular execution. It does not establish a current integrated or physical-device pass.
3. **Vendor documented:** current official help, policy, pricing, or publisher store information. It establishes a published capability or limitation, not independent reliability.
4. **Not established:** the reviewed material does not settle a question. This is not evidence that a feature is absent.

This lane did not log into competitors or submit applications. No private APIs, scraping bypasses, paywall circumvention, or new credentials were used. Primary sources were checked on 17 November 2026; page-update dates are noted where useful. Indeed's official indexed help was readable while its older direct redirect failed. Some later HRDF fetches timed out; the earlier successful English extraction included eligibility, language, cost, and the matching statements discussed below.

Good Spender remains excluded. The continuation keeps the original cutoff of **19 November 2026, 01:26:12 Riyadh / 18 November 2026, 22:26:12 UTC**; this research does not start a new clock.

## 3. The nine competitors: verified capability matrix

All competitor behavior in this table is **vendor documented**, unless explicitly marked otherwise. “Free” describes the cited candidate-facing tier, not unlimited service capacity or a promise of permanent pricing.

| Service | Capability established by current official sources | Free boundary and material limit | What this means for Career Finder |
| --- | --- | --- | --- |
| **Teal** | Job tracking, notes, contacts, stages, browser clipping, resume matching; tracker help documents per-application resume attachments and report export. Its November 11 policy describes optional Gmail opportunity signals, approved replies/status changes, approved calendar changes, and selected Drive resume import. [S1–S3] | Tracker page advertises unlimited free jobs/contacts/companies; more extensive AI analysis and writing features belong to Teal+. | Local tracking is basic parity. Per-application document provenance and useful follow-up context matter. Export and human approval are not unique differentiators. |
| **Huntr** | Tracking plus job-specific application packets containing an editable tailored resume, cover letter, and follow-up draft. [S4–S5] | Current free tier lists 100 tracked jobs, two tailored resumes, two packets, unlimited base resumes/PDF exports and application autofills; broader packet/AI use is paid. | Career Finder's active PDF and approval binding address a different problem from maintaining several editable application packets. A truthful document-selection/return journey is the immediate need; packet authoring is a larger gap. |
| **Simplify** | Copilot fills supported application fields and the user reviews/submits. Separate paid Autopilot can submit supported jobs without that review step. Tracker supports manual entries, CSV import/export, and suggested status updates; iOS and Safari Copilot are documented. [S6–S10] | Basic autofill, manual resume building/export, tracker, and Gmail integration are available without Simplify+. Multiple uploaded resumes, AI writing, referrals, analytics, and Autopilot are paid features. Match countries are explicitly bounded; a remote-UAE job-board filter is not unrestricted UAE eligibility. [S7, S10] | Form filling, mobile Safari integration, document tooling, and inbox context are real capability gaps on Career Finder's current discovery/application surface. A direct employer-page route is a working alternative, but not equivalent automation. |
| **Jobscan** | Resume/job comparison with keyword and formatting feedback; free tracker; current Auto Apply describes ready-to-review answers, approval before each submission, and ATS-native sourcing. [S11–S13] | Initial Match Report is advertised free. Auto Apply's access/usage price was not established in this review; a free scanner CTA is not evidence that automation is free. The Match Rate is Jobscan's visualization, not the employer's ATS score. [S12] | Do not add an unexplained percentage to imitate this. Useful evidence is an editable, source-linked comparison of actual qualifications. Career Finder has no demonstrated parity with Jobscan's current assisted-application coverage. |
| **LinkedIn** | Tracker stages, notes, filters, and network context. Easy Apply can supply platform-observed progress; external applications require user updates. The official tracker help describes a one-year history window. [S14] | This review did not establish a complete Premium entitlement matrix. Existing tracker documentation is sufficient for the cited workflow; external completion is not automatically known. | Career Finder already exposes a LinkedIn search route. Personal records should remain useful for jobs found elsewhere. It does not reproduce the professional network or referrals; employer-confirmed receipts and manual records must remain distinct. |
| **Indeed** | My Jobs offers saved/applied/interview/archive organization. Official help describes a six-month visible history and manual updates for applications completed outside Indeed; older information can be requested separately. [S16] | The cited help does not establish every optional paid service, export format, or retention circumstance. Readable official indexed content was used because the former help URL redirected unsuccessfully. | Durable user-controlled records can help avoid dependence on a short visible history, but Career Finder has its own storage limits and backup obligations. No blanket claim of unlimited retention is justified. |
| **Bayt** | Gulf/MENA job discovery, filters, profile-based recommendations and alerts; official iOS/Android listings. iOS lists English, Arabic, and French. [S17–S19] | Basic candidate tier is $0 and lists job search, public profile, alerts and applicant insights; paid plans add promotion/visibility features. Core CV creation, search and application are advertised free. [S17–S19] | Arabic and Gulf discovery are competitive requirements, not unique selling points. Career Finder's selected-board coverage is materially narrower. Regional external search plus local tracking is an immediate free alternative. |
| **Naukrigulf** | Gulf location/industry/experience/freshness filters, recommendations, saves, applications and recruiter-related information. Arabic Android listing additionally advertises AI CV and interview tools; iPhone listing explicitly supports English and Arabic. [S20–S21] | Core app is listed free; resume writing/spotlight services can be paid. Listing counts differ between platform descriptions and are not a benchmark. Accessibility features are not declared on the reviewed iOS listing; this is not proof of inaccessibility. | Career Finder must earn Arabic/native quality through task evidence. It does not establish equivalent regional inventory, recruiter signals, or AI coaching. Free regional browsing/manual tracking is available without adding those systems now. |
| **Saudi Jadarat** | Official HRDF service links Saudi citizens to public/private opportunities through a professional profile and national sign-in; service metadata says free, Arabic and English. [S22–S23] | Citizenship and eligibility conditions matter. Documentation mentions profile-matching SMS while an FAQ says a matching tool will arrive later; exact current matching behavior remains unresolved. | A valuable external option for eligible Saudi users, not a universal substitute. Career Finder must not infer Jadarat eligibility, impersonate Nafath, or promise integration. Treat qualification/authorization uncertainty explicitly. |

## 4. What the current Career Finder source establishes

The newer hosted/native phone workflow and retained historical Saudi research surfaces must be described separately. The four-board limit below belongs to the newer public discovery service; it is not a claim that no other employer research or lead source exists anywhere in the repository.

### Search and matching

The public discovery contract accepts up to four selected Greenhouse/Lever boards, up to 500 jobs per source and 50 jobs per page. The phone view limits the accumulated set to 200 results and tells the user to refine or open an employer's complete listing. Source state includes fresh/cached/stale/unavailable, checked time, limited coverage and errors. The source uses a ten-minute freshness interval and a 24-hour retained-cache boundary. These are application rules, not a promise that an employer has not closed a job. [C1–C2]

The endpoint matches query words against title/company/summary, location text and explicit remote classification, then interleaves boards. It does not consume a CV or personal profile for personalized ranking. Unknown location/remote eligibility must not become inferred permission to work. [C1]

Retained iOS code additionally sorts a Saudi lead set by title relevance and date, preserves dated research assessments, and explicitly says historical assessments are not current personalized advice. This is relevant functionality and must not be erased from the comparison with a claim that the app has “no matching.” It is also not evidence of profile-aware matching parity with every competitor. [C7]

### Preparation, submission and records

The current phone model includes profile fields, one active PDF, job-specific employer comments/consents, and five application-record stages. Saved records contain personal notes and follow-up dates. The app distinguishes manually recorded applications from employer-confirmed submissions. The hosted Apply surface explicitly says that live Auto Apply is waiting for employer-authorized integrations and directs users to employer pages and Saved. [C2–C3, C6]

The documented integration boundary ties approval to the job, profile revision, PDF hash, answers and permissions. Unknown submission outcomes must not be retried as if nothing happened. Stop prevents unsent work; it does not withdraw an application already received by an employer. Unsupported employer questions remain a capability boundary, not something to bypass. [C6]

### Portability and recovery

Hosted CSV and ICS are implemented, as is saved-note search. The CSV is a useful report, not a complete restoration format. The ICS omits private notes. Native workspace transfer code exports scoped data, checks format/size, merges by identity and preserves restrictive Stop intent; imported receipts are historical evidence, not new dispatch authorization. Native export excludes tokens and active approvals. [C2–C5]

The implementation log records useful prior spreadsheet checks but also a remaining consumer issue: default spreadsheet import can coerce numeric-looking text. A text-preserving import setting preserved the recorded fixture, and JSON remains the original-value backup. Prior ICS parser round trips are not actual calendar-import acceptance. Cross-device and consumer acceptance must be attached to exact current artifacts. [R2–R3]

## 5. Cross-capability gap and acceptance matrix

**P0:** protect the current journey against loss, false status or blocked recovery. **P1:** high-value continuation polish/parity. **P2:** substantive feature investment to plan after current gates, not an instruction to start overlapping edits.

| Capability / competitor evidence | Current Career Finder evidence | Actual gap or potential stronger behavior | Measurable acceptance target, not a pass | Best documented free working alternative | Owner / priority |
| --- | --- | --- | --- | --- | --- |
| **Coverage and freshness:** regional services and broader aggregators [S7, S17, S20, S22] | Selected-board bounds, source state, retained results and external links [C1–C2] | Coverage is narrower; explicit partial/stale disclosure is a useful foundation, not proof others conceal it. | Same named fixtures on hosted/iOS/Android: zero-result vs all-unavailable are distinct; each stale source shows its checked time; expired/missing boards do not masquerade as current; 200-result ceiling has a working next step. | Open the employer directly; use Bayt/Naukrigulf core search or Jadarat when eligible, then save the real job URL. | Search owner `01a1ea9d107f`; root hosted; **P0**. |
| **Relevant matching and filters:** profile matching, freshness/experience filters [S7, S12, S17, S20] | Literal discovery filters plus separate dated Saudi research/relevance [C1, C7] | No evidence of comparable profile-aware ranking in the newer discovery endpoint. Unknown eligibility is honestly retained. | Label why each result matched; never turn missing country, salary or authorization into a positive claim. For any later ranker, evaluate a fixed human-labelled EN/AR corpus and report relevance separately from eligibility. | Read mandatory requirements on the official posting and record evidence/gaps in the existing note. | Search owner for present truth/labels; future ranking **P2**. |
| **CV and application packets:** Huntr/Teal per-job documents [S2, S5] | One active PDF; exact submitted-payload binding; record history [C2–C3, C6] | Strong payload provenance is plausible; multi-version editing and packet authoring are not equivalent capabilities. | Replace/cancel a PDF and return from a picker without losing a draft; review identifies the current file and revision; a prior approval cannot silently use a replacement document. Test with synthetic documents. | Keep job-specific PDFs in the user's files; select/review the intended one. Huntr's free limited packets or manual resume tools are optional external choices, not required uploads. | Recovery owner and existing native/publisher owner; **P0** for correctness, packet authoring **P2**. |
| **Autofill and automation:** Simplify and Jobscan [S6, S8–S10, S13] | Employer-page handoff; authorized adapter gated; supported-answer schema [C2–C3, C6] | Real breadth gap. A disabled capability must lead to a useful manual path. Approval is parity; exact uncertainty handling is the proposed quality advantage. | No silent dispatch; zero POST replay after timeout/uncertain outcome; manual return preserves job and draft; Saved “applied” stays user-entered until evidence exists. | Direct employer form, manual review and existing Saved record. Free supported Copilot is an optional third-party aid with its own permissions. | Root/Build1 account recovery, recovery owner, publisher for native; **P0/P1**. |
| **Pipeline and follow-up:** stages, notes, reminders, contacts [S1–S2, S5, S14, S16] | Five stages, notes, saved-note search, follow-up dates and hosted ICS [C2–C4] | Core parity is partly present. Recruiter contacts, inbox-derived updates and interview context are broader competitor capabilities. | Saved query finds Arabic/English notes without mutating originals; filters combine predictably; “no match” can be cleared; follow-up date survives restart/import; changing a date creates an identifiable, correct reminder. | Existing Saved plus a manually created calendar event; Teal's free tracker is an external option. | Root hosted; recovery/native owners for parity; **P1**. |
| **Duplicates and uncertain outcomes:** manual/observed status distinction [S6, S14, S16] | Canonical job identity, scope guards, revision checks, Stop/receipt distinctions [C2–C6] | Candidate strength is observable no-loss/no-replay behavior. Competitor duplicate guarantees were not established, so superiority is unproven. | Reimport twice, import after edits, switch account during a delayed request, then retry only the status read: no lost history, no cross-account disclosure, no new authorization or duplicate employer request. | Preserve JSON, compare existing records and check employer acknowledgement before another application. | Recovery `01a1ea9cfd25`; Build2 reviews fixtures; **P0**. |
| **Arabic, RTL and native access:** Bayt/Naukrigulf already bilingual; Simplify has iOS [S8–S9, S19, S21] | EN/AR resources, native Swift/Android views and existing account focus work [C2, C5, C7] | Language support alone is parity. Actual keyboard, screen-reader, scaling and recovery task completion could differentiate. | Both languages complete account → search → save → external return → recovery at large text; URLs/dates remain readable in RTL; error text is announced once with reachable recovery; no late focus theft. Record device/OS/AT and result per task. | Use the functioning hosted/native route while a specific client is repaired; preserve data first. | A11y owner `01a1ea56`, Build1 bounded review, publisher execution; **P0/P1**. |
| **Export and interoperability:** Teal/Simplify exports [S2, S7] | Hosted CSV/ICS, native JSON workspace transfer; consumer gaps recorded [C2–C5, R2–R3] | Exports exist; lossless native-to-native transfer and real file/calendar consumers remain evidence gates. Hosted CSV/ICS are not established native parity. | Actual Save/Share → reopen/import; compare original Unicode strings and dates; detect spreadsheet coercion; calendar event lands on the intended day without private notes. Repeat import causes no invented receipts/approval. | JSON as the restoration copy; spreadsheet text import for reports; manual calendar event if ICS import cannot complete. | Recovery owner, root hosted; publisher schedules device execution; **P0/P1**. |
| **Privacy, control and cost:** optional connected services and free tiers [S3–S4, S10, S24] | Guest preparation, explicit online save, scoped encrypted browser storage and bounded cloud quotas [C2–C3, C6] | Minimal-data use is a concrete choice; not a security certification. Browser keys do not defend against all XSS/unlocked-session threats. Free usage still has capacity limits. | Network evidence confirms guest discovery sends no CV/account payload; account switch locks old private material; export contents match disclosed scope; limits are explained before destructive choices. | Stay local/guest, keep an owned backup, and use public employer pages. No paid provider or new cloud dependency is required. | Root and recovery; dependency owner only if changes require it; **P0**. |
| **Network, coaching and intelligence:** contacts, referrals, interview preparation [S1, S10, S20] | Existing notes/research context and manual application steps [C2, C7] | This review does not establish equivalent networking, employer responses, interview practice or negotiation tools. Those gaps remain visible. | Before any new tool: define its user outcome, factual sources, privacy/data flow, cost and measurable output accuracy. Do not claim hiring-outcome improvement from generated text alone. | Existing notes, truthful achievement preparation and free official job/CV resources; any external upload remains an explicit user choice. | Heavy evaluates value; product/root sequences future work; **P2**. |

## 6. Five high-value actions inside the current continuation

These are refinements to already authorized journeys. They should be routed to the owners below, not implemented by a new competing lane.

### 1. Finish the search-and-fallback contract across all clients — P0

Treat source failures, incomplete coverage, empty matches, retained results and restored searches as separate states. The code already provides much of the required information; the task is to prove that users can act on it in English and Arabic. Search should always offer a concrete next step: change filters/boards, retry an eligible read, or open the relevant employer page.

Use the existing search fixture set rather than inventing a second suite. Add only uncovered material risks: a source closing between pages, a missing board with old cache, the client result ceiling, and a restored Arabic search. Every accepted improvement needs the source commit and executed per-client result. The discovery owner owns native/search strings; root owns hosted changes. This does not authorize increasing limits or adding private-feed adapters without a separate bounded design.

### 2. Close application and account recovery without replay — P0

Complete the end-to-end route even while authorized employer integration is unavailable: open the actual posting, preserve the selected job/profile/PDF, return, record the user's result, and recover interruptions. The working manual route is valuable only if it retains context and does not imply that opening a link submitted anything.

The existing recovery lane should exercise repeated imports, conflicting edits, account changes during delayed requests, replaced documents, and uncertain receipts. Read-only status retry must remain separate from mutation retry. The root's account focus/copy candidate belongs to this action and must retain its actual Chrome evidence; no additional native fix should compete with the publisher. A source review or model agreement does not replace device execution.

### 3. Complete portability in the user's real consumers — P1, P0 for data loss

Do not add “CSV export” or “calendar reminders” to the roadmap as absent features. Complete the browser/native save/share journey and verify the actual target consumer. Preserve the existing JSON format as the restoration artifact. A report CSV is not a backup contract and may be coerced by spreadsheet defaults.

Select the already agreed synthetic EN/AR fixture and verify literal strings, canonical links, leading zeros, date-only values, Arabic punctuation and formula-like notes. The earlier reported spreadsheet coercion must be either addressed or accompanied by an accurate text-import path, with the unchanged JSON retained. An ICS parser pass is insufficient: import the event into an actual free available calendar, verify day/time semantics and omission of private notes, then document duplicate-event behavior. Native CSV/ICS expansion, if desired, must be assigned explicitly to the existing native owner; it is not presumed complete.

### 4. Make bilingual accessibility a task-level acceptance gate — P1

Arabic support is already present in regional competitors. Differentiate through actual usability: visible focus, readable mixed-direction content, reachable recovery controls, adequate text scaling, correct names and state announcements, and continuity after a failed request.

Use the actual account/search/application/recovery tasks, not a screenshot-only score. Root's synchronous focus-preservation candidate should not be generalized into an automatic asynchronous focus policy. A user who moves away during a request must keep control. Physical VoiceOver/TalkBack results must identify the tested device and task. The existing a11y owner must reconcile its overlapping patches with search/recovery ownership before integration. This is an execution gate, not a claim of complete WCAG or store accessibility compliance.

### 5. Clarify current evidence and personal fit at the point of decision — P1

Retain the useful existing research and relevance signals while distinguishing their age and basis from current employer facts. On the newer discovery surface, keyword matches and selected-board coverage should be understandable without suggesting a personalized eligibility assessment. On retained Saudi research, older fit summaries should remain dated and qualified.

A narrow, source-driven explanation is useful now: source, last check, explicit location/work-mode information and which requirements still need confirmation. Preserve the user's own achievements and notes; do not fabricate experience, salary, permission to work or a universal ATS percentage. Deeper personalization, CV generation and interview coaching remain visible capability gaps for a later measured design. This action belongs to the current search/product owners and existing strings coordination.

## 7. Privacy and consent critique

The competitive comparison must avoid a false choice between useful automation and informed control. Simplify's current pricing guide distinguishes reviewed Copilot from paid Autopilot; Jobscan describes reviewed submissions; Teal describes approvals for particular connected-account actions. Career Finder must therefore demonstrate the exact scope of its approval and recovery boundaries, not merely display a confirmation button. [S3, S6, S10, S13]

Simplify's August 19 privacy policy allows its own matching/AI improvement using described profile and activity information, restricts providers' generalized-model training, and states separate exclusions for email/extension information and voluntary self-identification. It also provides account review/deletion choices. The practical comparison is which information a chosen workflow sends and retains, not a claim that every competitor “sells resumes.” [S24]

Career Finder's guest/public discovery and explicit online-save design can avoid unnecessary CV uploads for basic search. Local encryption does not eliminate browser compromise, wrong-account rendering, exported-file exposure, or unlocked-device risk. A competitor's published policy and an app-store privacy label are disclosures, not an independent security audit; Career Finder must be held to the same evidence standard. [C6, S19, S21]

No external resume, inbox connection, purchase, or application is required to finish these five actions. No competitor's API, help page or pricing plan grants permission to scrape its private service or bypass its limits.

## 8. Coordination and remaining evidence

| Work | Existing responsible lane | Routing rule |
| --- | --- | --- |
| Hosted behavior, integration and exact final evidence | Root continuation | Keep isolated root checkout; inspect actual changes before integration. |
| Native discovery, search states, central strings | `01a1ea9d107f` | Send specific acceptance gaps; do not create overlapping search patches. |
| Import/export, records, receipts and Stop/recovery | `01a1ea9cfd25` | Build2 can critique a golden fixture; the owner controls implementation. |
| Native accessibility | `01a1ea56` | Reconcile the reported overlapping patch set before applying it. |
| Shared native builds, hosted/store publishing and physical-device scheduling | Publisher `d57f4cd77813` | No parallel native builds or duplicate connection-address fix. |
| Dependencies/audit | Development `5bc6158967e8` | Route any required dependency work; do not add a package just to imitate a feature. |
| Competitor counter-review | Existing Grok Heavy | Review this delta against the already delivered source/audit; no package or image resend. |

Ask the existing Heavy lane to challenge three things: whether the source supports each claimed gap, whether a documented free alternative actually serves the targeted geography/device, and whether each proposed advantage has a falsifiable test. Keep vendor claims, source facts and executed outcomes in separate columns. Build1 should remain on its bounded account/accessibility review; Build2 should remain on recovery/import critique.

This report creates no new CI, hosted, native, store or release pass. It does not resolve the publisher's assertion failure or the account run that was in progress at an earlier check. Root must report those from the latest actual run IDs and commits. The old 16/17 journey result, isolated feed checks, and planned reruns cannot establish current readiness.

## 9. Source register

All public sources below were checked on **17 November 2026**. They are primary vendor or official service sources; capability claims were not independently exercised.

### Recovered project evidence

- **R1 — Product review:** https://github.com/swonyu/ahmad-career/blob/636d79a808bd4ecdd7ebd386b0f98a16ab3d2a32/docs/Product-Review-Research-2026-11-17.md
- **R2 — Open-source/interoperability review:** https://github.com/swonyu/ahmad-career/blob/636d79a808bd4ecdd7ebd386b0f98a16ab3d2a32/docs/Open-Source-and-Interoperability-Research-2026-11-17.md
- **R3 — Implementation/evidence log:** https://github.com/swonyu/ahmad-career/blob/636d79a808bd4ecdd7ebd386b0f98a16ab3d2a32/docs/Continuation-Implementation-2026-11-17.md

### Current Career Finder source

- **C1 — Discovery limits, filtering and source state:** https://github.com/swonyu/ahmad-career/blob/ca3d3411d8b5b36fa7093dff782f4a7b931261c7/hosted/server/discovery.mjs — notably limits at line 5, normalization around 110–125, failure/cache handling around 181–268, and matching/pagination around 272–281.
- **C2 — Hosted phone journey:** https://github.com/swonyu/ahmad-career/blob/ca3d3411d8b5b36fa7093dff782f4a7b931261c7/hosted/app/phone/PhoneApp.tsx — search around 303–320, export around 593–620, source/limit UI around 708–730, records/application fallback around 736–752.
- **C3 — Model and boundary schema:** https://github.com/swonyu/ahmad-career/blob/ca3d3411d8b5b36fa7093dff782f4a7b931261c7/hosted/app/phone/model.ts
- **C4 — CSV/ICS and comparison helpers:** https://github.com/swonyu/ahmad-career/blob/ca3d3411d8b5b36fa7093dff782f4a7b931261c7/hosted/app/phone/record-tools.ts
- **C5 — Native transfer:** https://github.com/swonyu/ahmad-career/blob/ca3d3411d8b5b36fa7093dff782f4a7b931261c7/apple/AhmadCareer/NativeApplicationsStore.swift (export/import around 1009–1088); https://github.com/swonyu/ahmad-career/blob/ca3d3411d8b5b36fa7093dff782f4a7b931261c7/android/app/src/main/java/com/saleh/careerfinder/WorkspaceTransfer.kt
- **C6 — Current repository contracts and boundaries:** https://github.com/swonyu/ahmad-career/blob/ca3d3411d8b5b36fa7093dff782f4a7b931261c7/README.md — historical test milestones are not treated here as new executions.
- **C7 — Retained Saudi research/relevance:** https://github.com/swonyu/ahmad-career/blob/ca3d3411d8b5b36fa7093dff782f4a7b931261c7/apple/AhmadCareer/NativeCareerStore.swift (requirements around 50–51, relevance/date sorting around 888–898); https://github.com/swonyu/ahmad-career/blob/ca3d3411d8b5b36fa7093dff782f4a7b931261c7/apple/AhmadCareer/NativeCareerViews.swift (dated evidence/personal-fit qualifications around 616–635).

### Competitors

- **S1 — Teal tracker/free boundaries:** https://www.tealhq.com/tools/job-tracker
- **S2 — Teal tracker workflow, resume attachments and report export:** https://help.tealhq.com/en/articles/14435727-how-to-track-your-job-applications
- **S3 — Teal policy/connected-account features:** https://www.tealhq.com/privacy-policy — updated November 11, 2026.
- **S4 — Huntr candidate pricing/free limits:** https://huntr.co/pricing
- **S5 — Huntr application packets:** https://help.huntr.co/en/articles/14367332-application-hub-and-packets — dated May 1, 2026.
- **S6 — Simplify reviewed Copilot flow:** https://help.simplify.jobs/en/help/articles/2415391-use-copilot-to-autofill-applications
- **S7 — Simplify tracker and regional scope:** https://help.simplify.jobs/en/help/articles/2140179-use-the-job-tracker ; https://help.simplify.jobs/en/help/articles/6895855-supported-countries-and-regions
- **S8 — Simplify iOS:** https://help.simplify.jobs/en/help/articles/3745882-get-started-with-the-simplify-ios-app
- **S9 — Simplify Safari/iPhone Copilot and permissions:** https://help.simplify.jobs/en/help/articles/8759839-turn-on-copilot-in-safari-on-iphone
- **S10 — Simplify free/paid feature boundary and Autopilot:** https://help.simplify.jobs/en/help/articles/5623502-whats-included-in-simplify-features-and-pricing — page indicated updated 25 days earlier.
- **S11 — Jobscan tracker:** https://www.jobscan.co/job-tracker
- **S12 — Jobscan scanner and score limitation:** https://www.jobscan.co/resume-scanner
- **S13 — Jobscan Auto Apply:** https://www.jobscan.co/auto-apply
- **S14 — LinkedIn application tracker:** https://www.linkedin.com/help/linkedin/answer/a8684146 — page indicated updated nine months earlier.
- **S15 — LinkedIn job alerts, retained baseline reference:** https://www.linkedin.com/help/linkedin/answer/a1420165
- **S16 — Indeed My Jobs:** https://www.indeed.com/help/job-seekers/articles/205332490-what-is-my-jobs?co=IN&hl=en ; official parallel help https://indeed.zendesk.com/hc/en-us/articles/205332490-What-Is-My-Jobs — indexed official content used; old direct help redirect failed.
- **S17 — Bayt basic/premium candidate tiers:** https://www.bayt.com/en/premium/
- **S18 — Bayt Android:** https://play.google.com/store/apps/details?hl=en_US&id=com.bayt
- **S19 — Bayt iOS/languages/privacy disclosure:** https://apps.apple.com/sa/app/bayt-com-jobs-mena-job-search/id510893233
- **S20 — Naukrigulf Arabic Android:** https://play.google.com/store/apps/details?hl=ar&id=com.naukriGulf.app
- **S21 — Naukrigulf iOS/languages/privacy disclosure:** https://apps.apple.com/sa/app/naukrigulf-job-search-app/id724241430
- **S22 — HRDF/Jadarat English service:** https://www.hrdf.org.sa/en/products-and-services/programs/individuals/other/jadarat/apply — successful initial extraction includes free/EN-AR metadata, citizenship category and differing matching statements; later fetches timed out.
- **S23 — HRDF/Jadarat Arabic service:** https://www.hrdf.org.sa/products-and-services/programs/individuals/other/jadarat/apply/ — official page retrieved; later targeted fetches timed out.
- **S24 — Simplify privacy:** https://simplify.jobs/privacy — updated August 19, 2026.

### Execution and preservation record

Only read-only source inspection and official web research were performed for this competitor lane. No test, native build, live competitor flow, employer application or account modification was executed. No code or dependency was changed. This evidence file is the sole new artifact from the lane; the earlier account-focus independent review remains separate.
