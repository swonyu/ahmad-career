# Clacku feedback and current-source map — 18 November 2026

## Purpose and evidence boundary

This note compares user-supplied qualitative feedback with the implemented Career Finder source. It records current support, remaining gaps, release wording implications and future investigation priorities. It does not add release gates, certify build or deployment readiness, establish employer availability, or authorize new feature implementation.

The exact reviewed commit is `d8d2e999d0348eb07942472a1d9e87d2fc4498a2` in the integrated Career Finder checkout. The primary reviewed experience is [the hosted phone app](../hosted/app/phone/PhoneApp.tsx). Source links below are relative to this document; their reviewed behavior is bound to that commit. Later native corrective work does not broaden this hosted-source review.

## Feedback provenance and deduplication

The source material is the two screenshots supplied by the user in this conversation:

- `IMG_0139.PNG`
- `IMG_0140.PNG`

The coordinating reviewer visually inspected both screenshots. This repository note retains paraphrased themes and filenames only. Respondent names and raw screenshots are not copied into the repository.

The long comment about repeated forms, CV entry and matching appears in full in both images and is treated as one contribution. The Easy Apply comment is fully visible in `IMG_0140.PNG` and partially visible at the bottom of `IMG_0139.PNG`; those appearances are also treated as one contribution. A repeated or partial appearance is not an additional respondent or independent corroboration.

This is a small qualitative sample. It supports hypotheses and investigation questions, not percentages, prevalence estimates, representative conclusions or a statistically ranked demand list. No respondents were contacted for this review.

## Current support and remaining gaps

| Feedback theme | Support in the reviewed source | Remaining gap and boundary | Source |
|---|---|---|---|
| Repeated application forms and separate employer accounts | A private profile and CV can be saved locally or online. Supported integrations prepare an exact application payload from saved details, with per-employer answers and explicit approval. | Employer accounts and arbitrary ATS forms remain separate. The configured submission connector supports authorized Lever postings with current reviewed requirements. Unsupported or custom questions require the employer site. This is not universal ATS autofill. | [PhoneApp: saveOnlineProfile, prepare and Apply](../hosted/app/phone/PhoneApp.tsx); [provider: loadConfiguration, connectorFor and submit](../hosted/server/provider.mjs) |
| The CV does not automatically populate profile fields | PDF selection validates a supported file, page count, size and fingerprint, then stores its bytes and metadata. | The reviewed path does not extract name, employment history, experience or skills into the profile. The readPDF handler updates the resume field. Uploading a CV must not imply automatic form completion. | [PDF validation and readCheckedPDF](../hosted/app/phone/pdf.ts); [PhoneApp: readPDF](../hosted/app/phone/PhoneApp.tsx); [profile schema](../hosted/app/phone/model.ts) |
| No reusable, verified universal profile | An editable profile, explicit local/online saves, revisions and profile comparison are implemented. | Reuse within Career Finder does not establish acceptance by every employer or verified qualifications and employment history. Account or email checks are not career-credential verification. | [profileSchema and profileRequest](../hosted/app/phone/model.ts); [profile save and comparison UI](../hosted/app/phone/PhoneApp.tsx) |
| Stale and reposted adverts | Discovery exposes source status, check timestamps, earlier-result warnings, bounded caching and refresh failures. Provider IDs and canonical URLs reduce exact duplicate identities. | A recent fetch does not prove that an employer is still hiring. No semantic repost or evergreen-ad detector is established by these paths. A repost with a new ID may remain a separate result. | [discovery: normalizeDiscoveryJob, retrieve and sourceJobs](../hosted/server/discovery.mjs); [jobIdentity](../hosted/app/phone/model.ts); [search provenance and job details](../hosted/app/phone/PhoneApp.tsx) |
| Entry-level/experience mismatch and recommendations below the applicant's experience | The profile stores an experience preference. Discovery accepts explicit keywords, location, remote-only and selected boards. | Experience is not part of the discovery request. Results use keyword/location/remote filtering and board interleaving, not personalized seniority ranking or eligibility verification. Saved profile preferences must not be presented as a matching engine. | [profileSchema, filtersSchema and discoveryPath](../hosted/app/phone/model.ts); [discovery result filtering and round-robin construction](../hosted/server/discovery.mjs) |
| No employer replies or meaningful application status | Private stages, dates, notes, follow-ups, calendar export and supported submission receipts are implemented. | Private stages are self-reported. A confirmed receipt means the provider returned an application ID, not recruiter review, a reply, an interview or a job offer. No universal employer-status synchronization is established. | [Saved, job details and Submission receipts](../hosted/app/phone/PhoneApp.tsx); [receiptLabel and receiptSchema](../hosted/app/phone/model.ts); [receipts endpoint](../hosted/server/applications.mjs) |
| Purported recruitment becomes a paid CV-writing upsell | Discovery retains source/employer links. Supported submission requires an authorized connector and explicit review. | Public HTTPS validation does not establish a legitimate vacancy or recruiter. No dedicated paid-upsell detection, listing-report workflow or employer-vetting feature was found in the reviewed paths. Do not claim scam-free listings or verified hiring. | [publicURL](../hosted/app/phone/model.ts); [discovery source handling](../hosted/server/discovery.mjs); [connector authorization](../hosted/server/provider.mjs) |
| One search across government, semi-government and private employers | Discovery combines up to four selected Greenhouse/Lever boards. Other public job links can be saved manually. LinkedIn search is an external handoff. | The seven-board seed catalog and supported providers do not establish comprehensive government or semi-government coverage. Country preferences and worldwide UI scope are not source-coverage guarantees. | [CATALOG_INPUT, DISCOVERY_LIMITS and parseDiscoverySource](../hosted/server/discovery.mjs); [Search options and Add job link](../hosted/app/phone/PhoneApp.tsx) |
| A reply describes the research post as sounding like ChatGPT | This is feedback about the research invitation's voice, not an implemented feature. | Revise future research wording plainly and ask about a recent concrete application experience. The reply does not establish who wrote the original post or create a separate product capability requirement. | User-supplied screenshots identified above. |

## Release messaging implications

Lead with the implemented user value: searching selected public employer boards, keeping a shortlist and private application records, reusing a Career Finder profile, reviewing exact details before supported submissions, and seeing explicit freshness and outcome information.

The existing app already explains selected-board coverage, manual application fallback, self-reported records and receipt meaning. Release descriptions should retain those boundaries:

- **Search:** name the sources covered and show when they were checked. Avoid all-jobs, all-employers or comprehensive public-sector claims.
- **Profile and CV:** describe editable saved details and PDF storage/validation. Avoid automatic CV extraction, universal profile acceptance or verified qualifications unless those capabilities are separately implemented and evidenced.
- **Applying:** keep submission conditional on an available employer-authorized integration and a reviewed application. Opening an external page or marking a private record as applied does not submit an application.
- **Outcomes:** distinguish self-reported progress, a provider submission receipt and recruiter/hiring decisions. Synthetic receipts do not establish a real employer result.
- **Trust:** describe source provenance and application safeguards precisely. Supported HTTPS links and authorization checks are not an assurance that every advert is genuine.

Useful existing references are the [support explanation of application records and receipts](../hosted/app/support/page.tsx) and the [privacy explanation of discovery sources, requests and caching](../hosted/app/privacy/page.tsx).

## Future investigation priorities

These are candidate investigations, not silently added release requirements.

1. **Reduce repeated entry.** Observe where applicants repeat information and which employer systems are involved. Prototype optional CV extraction into an editable preview, with explicit confirmation before replacing fields. Evaluate extraction accuracy and correction effort before making an autofill claim. Employer-specific accounts and unsupported ATS forms remain a separate integration problem.
2. **Improve fit and transparent coverage.** Investigate explicit experience filters with a visible unknown state when requirements are absent. Expand documented official sources deliberately and describe coverage by the sources actually integrated. Evaluate semantic repost detection separately from exact URL/provider-ID deduplication.
3. **Make questionable recruitment reportable.** Consider a clear listing-report or flag path and visible source provenance for suspicious payment or CV-service requests. Validate the review process before adding verification badges.
4. **Investigate useful outcome tracking.** Ask which milestones applicants can actually observe and where those updates originate. Preserve private notes and follow-ups while assessing any employer-authorized status integration; do not infer recruiter progress from a submission receipt.
5. **Improve the next research invitation.** Use plain first-person language, describe the current product honestly, and ask for a recent example rather than agreement with a proposed solution. Track unique contributions so repeated screenshots do not inflate the evidence.

## Review disposition

The feedback reinforces the value of organization and transparency while exposing unmet needs in automation, matching, coverage and trust. It does not show that the current release has already solved those needs.

This note is a research-to-source comparison. The review made no product changes, ran no tests or CI, and did not contact respondents. Build, native/device, accessibility, provider and release acceptance remain attached to their separately recorded evidence and exact source versions.
