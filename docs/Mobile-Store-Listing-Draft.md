# Career Finder — mobile store listing draft

Original 17 November 2026 source baseline `918cfaa455b76f217b21c6c01fe862ea95ebe920`. Publisher draft only; no store submission, approval or availability is claimed. Copy reflects implemented behavior, including disabled live submission on the hosted preview. Historical review material remains dated evidence. Wording revised on 18 November 2026 against continuation candidate `2854daa8db9e9aa59b80df4a215f0909f376bce2`; this copy update does not establish new runtime or release acceptance.

| Platform | Current source configuration | Source |
| --- | --- | --- |
| iPhone | Version 1.1, build 7; `com.ahmadalayed.career` | `apple/AhmadCareer.xcodeproj/project.pbxproj` |
| Android | Version 0.6.0, version code 7; release base identity `com.saleh.careerfinder` | `android/app/build.gradle.kts` |

The native source supports English, Arabic and device-language selection. These settings identify the candidate source; signed distribution and the final store-record version remain unverified. The Android `.preview` and `.acceptance` suffixes identify test variants and must not be presented as the release package.

## Verified limits and exact counts

Counts include spaces, punctuation and internal LF line breaks; exclude headings, fences and a trailing newline. Keywords are ASCII, so their character and UTF-8 byte counts match. Apple specifies a 100-byte keyword limit.

| Field | Draft count | Official limit |
| --- | --- | --- |
| App name (both stores) | 13 characters | 30 characters |
| iPhone subtitle | 29 characters | 30 characters |
| iPhone promotional text | 136 characters | 170 characters |
| iPhone keywords | 96 characters / 96 bytes | 100 bytes |
| iPhone full description | 1692 characters | 4000 characters |
| Google Play short description | 70 characters | 80 characters |
| Google Play full description | 1826 characters | 4000 characters |

## Listing copy

### App name (both stores)

```text
Career Finder
```

### iPhone subtitle

```text
Search jobs. Save and prepare
```

### iPhone promotional text

```text
Search selected employer boards, save jobs and prepare applications. Search without an account, and sign in to save your profile online.
```

### iPhone keywords

```text
jobs,employment,resume,applications,shortlist,opportunities,job search,work,job tracker,planning
```

### iPhone full description

```text
Search jobs on selected employer boards, save job links and prepare applications with Career Finder.

Search selected employer boards
Search public Greenhouse and Lever boards by role, location or remote-work information. Choose up to four supported boards, see sources and check times, and open the original posting. Coverage is limited to the selected boards. Check location restrictions and work eligibility with the employer.

Save jobs and prepare your profile
Save opportunities or add an employer link. Start with a blank profile, add your experience and preferences, and select your PDF resume. Search does not require an account or use your profile or resume.

Connect a phone
Connect a hosted workspace through browser sign-in and a one-use code. Saving a connected profile sends its fields and selected PDF to that service. Phone drafts and hosted records have separate controls.

Review before applying
Review applicant details, the selected PDF and employer-specific answers before approving a supported application. Auto Apply requires an authorized employer integration and your explicit approval. Live submissions are currently disabled on the hosted preview; employer links remain available for manual applications.

Application records
Saving a job or recording a manual application does not prove employer receipt. A confirmed live receipt means a supported provider accepted the application, not that an interview or offer is guaranteed. Test and uncertain outcomes are identified separately.

Choose English, Arabic or your device language in Settings. Job postings and personal text stay in their original language. Job availability and employer requirements can change.
```

### Google Play short description

```text
Discover jobs on selected boards, save roles and prepare applications.
```

### Google Play full description

```text
Search jobs on selected employer boards, save job links and prepare applications with Career Finder.

Search selected employer boards
Search public Greenhouse and Lever boards by role, location or remote-work information. Choose up to four supported boards and see each result's source and check time. Coverage is limited to those boards. Confirm location restrictions and work eligibility with the employer.

Saved jobs and application records
Save a discovered role or add an employer link. Mark applications made on an employer's website as self-reported. Search your saved roles and filter receipt records by outcome. Saving or marking a role never creates a verified application receipt.

Application profile
Start with a blank profile, choose your preferences and select a PDF resume. Keep a draft on your phone. Public search does not require an account or use your profile or resume.

Connect and review
An optional hosted workspace connects through browser sign-in and a one-use code. Saving a connected profile sends its fields and selected PDF to that service. Review applicant details, the exact PDF and employer-specific answers before approving a supported application.

Auto Apply requires an authorized employer integration and your explicit approval. Live submissions are currently disabled on the hosted preview. Use employer links to apply manually where needed.

Application outcomes
A confirmed live receipt means a supported provider accepted the application, not that an interview or offer is guaranteed. Test and uncertain results remain separate. Review available account controls for recovery, export and cloud deletion.

Choose English, Arabic or your device language in Settings. Job postings and personal text stay in their original language. Job availability and employer requirements can change.
```

## Publisher review notes — not listing copy

- Review without signing in: launch with a blank profile, search selected boards, inspect source/availability details, save an opportunity, and select a reviewer-owned PDF. Saving and opening links must not send an application. Disabled live Auto Apply is expected in this preview; any test evidence must remain clearly labeled.
- For the optional connected flow, supply stable reviewer access and connection instructions privately in the store console. A five-minute pairing code alone is insufficient. Assess the actual enabled Google, LinkedIn and ChatGPT primary sign-in choices against Apple guideline 4.8, including an equivalent privacy-preserving login service or a documented applicable exception. An existing ChatGPT sign-in option alone does not establish the required equivalence. Account deletion and real provider success, denial and recovery remain separate acceptance gates; no login exception or approval is assumed.
- Publisher inputs: confirmed operator/legal name, monitored contact, final support/privacy URLs and disclosures, intended store records, authorized signing, release version/build, current screenshots, and completed release acceptance. Do not substitute the Android preview/acceptance identity for the intended release identity. Recheck this copy if service capabilities change before upload.

## Official references

Limits checked against [Apple app information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/), [Apple platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information) and [Google Play product details](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en). Publisher review: [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/) and [Google review preparation](https://support.google.com/googleplay/android-developer/answer/9859455?hl=en).

Implementation context: [current README](../README.md), [publishing handoff](Publishing-Handoff-2026-11-17.md) and [release integration checklist](Release-Integration-Checklist-2026-11-17.md). The publisher should resolve the current handoff's remaining inputs and match this draft to the actual signed release before submission. The [historical v6 handoff](HOSTED-RELEASE-HANDOFF.md) is retained as dated evidence.
