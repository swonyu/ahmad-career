# Open-source and interoperability research — 17 November 2026

## Decision

Career Finder should improve the work a person already does in Search, Saved, Apply, Profile and Settings. The selected follow-up work is better search within saved records, a spreadsheet view of those records, and one calendar file for a follow-up date the person has already chosen. These fit the existing model and require no paid service, extra account connection or new top-level screen.

This report complements the [nine-service product and review study](Product-Review-Research-2026-11-17.md) and the [provider, security, accessibility and release research](Research-Audit-2026-11-17.md). It examines six public open-source projects, their documented workflows and licenses, plus the primary standards needed for the proposed additions. It is not a comparative runtime benchmark, an audit of all their code, or evidence that Career Finder produces better employment outcomes. No competitor code, branding, résumé templates or translations were copied into the application in this pass.

At this checkpoint, the integrated redesign/localization/security candidate is `eebe748cb5afca0efcb9389255400a00cf5a480a`, preserved in [draft PR 1](https://github.com/swonyu/ahmad-career/pull/1). The record improvements below are being implemented in separate isolated follow-ups. A research recommendation is not a completed feature until its implementation receipt identifies the integrated source and tests.

**Development scope:** Saved-note search, CSV and calendar-file exports are hosted-web follow-ups. Native saved-note search code has also been written, but compilation and CI verification are pending. CSV and calendar-file additions are currently hosted-web only. None of this changes hosted version 7 or establishes a store release. The new disclosures have not had rendered browser acceptance, and completed file saves and calendar imports remain unverified; the implementation receipt must preserve those limits.

## 1. Scope and source quality

The primary evidence is the repositories' own README, license, release history and official documentation, retrieved on 17 November 2026. A README demonstrates the maintainer's intended behavior. It does not demonstrate that a particular build handles every account, device, input or browser safely. Stars, commits and issue counts were deliberately excluded from the ranking: they do not establish a maintained security boundary or suitability for an Arabic phone interface.

The six projects cover three different jobs: composing a résumé, maintaining a personal application record, and operating a broader hosted career workspace. Those jobs overlap without being interchangeable. A browser-only tracker can be excellent for a single person and still lack the account lifecycle that Career Finder must support. A full résumé platform may offer many useful controls while requiring more services, permissions and operational work than this task permits.

Search results for similarly named résumé projects were resolved to their canonical repositories. In particular, this report's OpenResume is `xitanggg/open-resume`, and Reactive Resume is `reactive-resume/reactive-resume`. Forks and unrelated products with similar names were not treated as the same project.

## 2. Six-project comparison

| Project | Documented useful behavior | License observed | Decision for Career Finder |
| --- | --- | --- | --- |
| [Reactive Resume](https://github.com/reactive-resume/reactive-resume) | Résumé and application work share context; versions, local recovery, notes, dated next steps, exports, language and appearance choices are documented. Its official application guide separates tracking stages and next actions. | [MIT](https://github.com/reactive-resume/reactive-resume/blob/main/LICENSE). | Learn the contextual workflow and recovery expectations. Keep Career Finder's narrower existing screens. No wholesale platform or AI-provider adoption. |
| [OpenResume](https://github.com/xitanggg/open-resume) | Browser-local editing and PDF import without an account, with an inspectable résumé parser. The stated design orientation is U.S. résumés. | [AGPL-3.0](https://github.com/xitanggg/open-resume/blob/main/LICENSE). | Learn from local processing and readable output. Do not equate PDF structural validation with an ATS score or copy its layout as a universal Arabic résumé standard. |
| [waddington/job-application-tracker](https://github.com/waddington/job-application-tracker) | Self-hosted application organization with stages, contacts, interviews, follow-ups and local/plain-file-oriented ownership. | [Apache-2.0](https://github.com/waddington/job-application-tracker/blob/main/LICENSE). | Keep personal tracking portable and explicit. A local file workflow is not a substitute for account isolation or encrypted browser recovery. |
| [hmwheele/job-tracker](https://github.com/hmwheele/job-tracker) | A small browser tracker puts a calendar-file action beside an already scheduled date; optional local JSON persistence is documented. | [MIT](https://github.com/hmwheele/job-tracker/blob/main/LICENSE). | A contextual calendar export can provide value without a calendar dashboard or OAuth access. Avoid adopting every board, statistics or linking feature. |
| [mquadros/job-tracker](https://github.com/mquadros/job-tracker) | Self-hosted job records include notes and document associations, search/filtering, CSV export and separate user lists. | [MIT](https://github.com/mquadros/job-tracker/blob/main/LICENSE). | Export the current person's records with a clear scope. Do not turn internal charts or agent access into prerequisites for ordinary tracking. |
| [Simplificatedd/JobApplicationTracker](https://github.com/Simplificatedd/JobApplicationTracker) | Cloudflare-hosted tracking, per-user data boundaries, JSON/CSV portability, responsive cards, an attention filter and optional analytics under Settings are documented. | [MIT](https://github.com/Simplificatedd/JobApplicationTracker/blob/main/LICENSE). | Progressive disclosure is useful: keep secondary tools where they are needed. Its published device checklist is also a reminder that responsive source code is not physical-device acceptance. |

These are limited, paraphrased observations. None of these installations was signed into or subjected to adversarial testing here. Statements about their privacy are descriptions of their documented architecture, not a certification of a deployed instance.

### License and reuse decision

MIT and Apache projects still carry notice and license requirements when code is reused. OpenResume's AGPL is a different reuse constraint, including terms relevant to modified network software. The license texts above, rather than a search-engine label, were checked. Any future imported component needs a pinned source revision, its applicable license/notice, an integration review and its own validation. A whole repository's top-level license is not evidence that every third-party dependency or asset has that same license.

This implementation uses independently written record utilities and the relevant interchange standards. It borrows workflow ideas, not source or visual identity. Existing official Google assets and open-font files have separate provenance and license receipts in `docs/branding/2026-11-17-indigo/`.

### Cost decision

Reactive Resume explicitly distinguishes its free code/product from optional hosting and AI-provider usage costs in its [README](https://github.com/reactive-resume/reactive-resume). That distinction applies to this comparison: open source does not make an external API, inference request, storage service or private runner free.

The selected changes run locally over already available records. They introduce no LLM call, scraping subscription, search API, email delivery service, calendar API or browser extension. Existing hosting/provider quotas still apply. No claim of unlimited or perpetual free infrastructure is made.

## 3. Maintenance evidence changes the critique priorities

Reactive Resume's [release history](https://github.com/reactive-resume/reactive-resume/releases) documents fixes involving mobile navigation and sheet sizing, Android return from browser sign-in, provider unlinking, requests after sign-out, incomplete translations, document handling and exact-release CI. These are maintainer-reported changes, not independently reproduced current vulnerabilities.

The useful inference is about where to spend verification effort. A modern appearance is insufficient if changing accounts, returning from a picker, or enlarging text loses the work. Career Finder's acceptance matrix therefore gives those transitions a concrete place:

| Transition | Failure to prevent | Evidence required in this project |
| --- | --- | --- |
| Language or theme change while editing | Draft reset, translated user text, changed workspace authority | Same original profile/record values and scope before and after; no unintended request. |
| Account invalidation during an export or PDF read | Old private data appearing under a new account | Capture and recheck generation, scope and confirmed identity before presenting or downloading. |
| Provider disconnect/reconnect while a response is pending | A stale response unlinking or labeling the wrong connection | Server connection-generation guard and client stale-result rejection. |
| File-picker interruption or invalid file | Previously valid CV replaced or unfinished text discarded | Retain the last accepted document and draft; parser cancellation/limit tests and real-device return checks. |
| Narrow width with large Arabic text | Fragmented words, inaccessible actions or obscured focus | Rendered layout measurements, focus checks and physical assistive-technology acceptance. |
| Saved record outlives its bookmark | Notes/stage disappear from search or export | Include retained active records without inventing an employer-confirmed submission. |

Several of these already have source and synthetic/browser evidence in the current candidate. Physical VoiceOver/TalkBack and provider/device acceptance remain separate open gates. The research does not convert those open gates into passes.

## 4. Search: improve the existing field

The product-review study supports organization and recoverable context. The exact matching policy is our design decision for this bilingual app, not a feature-performance claim derived from reviews.

The implementation policy is deliberately narrow. Apply NFC to comparison strings; ignore tatweel `U+0640`, Arabic vowel marks `U+064B–U+0652`, and superscript alef `U+0670` only for matching. Retain hamza, maddah, ta marbuta/heh and ya/alef maqsura distinctions. Use stable case handling so an employer's capitalization does not make a record disappear. Match all whitespace-separated query terms across the existing job fields and the current scoped saved note. Do not store normalized text, change a canonical job URL, or search another account's recovery/archived data.

[Unicode's normalization guidance](https://www.unicode.org/faq/normalization.html) explains canonical equivalence and the information loss possible with compatibility normalization. [Unicode's Arabic character discussion](https://www.unicode.org/standard/versions/Unicode13.0.0/ch09.pdf) explains why hamza and maddah require care. Neither source prescribes this application's search equivalences; the explicit restricted list above is the product decision.

Search acceptance should include a note-only match, mixed Arabic/Latin text, vowels and tatweel, canonical-equivalent text, preserved distinct letters, multiple terms across fields, whitespace-only input and an empty-result reset. The same input must not alter stored notes or account scope. It remains a search of personal records, not a broader employer index or semantic matching model.

## 5. CSV: a readable record, with a deliberate safety contract

CSV belongs beside existing data tools in Settings. The primary action remains the complete readable export; the spreadsheet option is secondary. Its compact rows can contain job title, employer, canonical public job URL, self-entered stage, dates, private note and last update. A retained record without a bookmark must still be represented. Credentials, provider tokens, account identifiers, CV bytes and unrelated profile details do not belong in it.

[RFC 4180](https://datatracker.ietf.org/doc/rfc4180/) supplies the basic field/record conventions: quote fields containing delimiters or line breaks, double embedded quotation marks, and use consistent record boundaries. UTF-8 preserves Arabic; a BOM is an interoperability choice for common spreadsheet importers, not a guarantee of every program's behavior.

Quoting alone does not stop formula interpretation. [OWASP's CSV injection guidance](https://community.owasp.org/attacks/CSV_Injection) covers formula-leading characters, whitespace/control prefixes, full-width variants and the risk that a spreadsheet changes escaping after saving and reopening. It explicitly warns that there is no universal sanitization strategy for every downstream consumer.

The proposed export prefixes potentially executable cells with visible literal text rather than relying only on an apostrophe hidden by an importer. This changes the exported cell's presentation, not the stored record. Explain that choice in the export disclosure and retain the full JSON record for exact raw values. Test independent CSV parsing, quotes, commas, multiline notes, Arabic, dangerous prefixes and excluded private fields. Do not advertise universal spreadsheet safety or round-trip restoration until the actual supported consumers have been checked.

## 6. Calendar file: one chosen date, no new calendar system

The useful pattern is a small action in the existing job detail, visible when a valid saved follow-up date exists. It generates a file locally. It does not request calendar access, schedule a server job, send a message, create an employer meeting or automatically update a calendar.

[RFC 5545](https://www.rfc-editor.org/rfc/inline-errata/rfc5545.html) is the implementation reference for the file. A civil follow-up uses `DATE`, rather than a local-midnight timestamp converted through UTC. A one-day duration avoids inventing a meeting time. Text values need escaping, content lines use CRLF, and long lines fold by UTF-8 octet count without splitting characters. The normal line-length recommendation is 75 octets excluding CRLF. A stable identifier for the same exported job/date can reduce duplicate treatment by clients, but actual import behavior still requires testing.

The file should contain only the minimum job context and canonical public job URL. The candidate puts job title/employer in SUMMARY, the link in URL, and a generic personal-follow-up explanation in DESCRIPTION. It uses the saved record, not unfinished editor text. Canonical links remove known tracking parameters and normalize the stored job identity; they do not preserve every byte of an originally pasted URL. Private notes, email, résumé and workspace identifiers are excluded. The current identity/scope must remain authorized through any asynchronous identifier calculation. A later edit to Career Finder does not silently update an already imported file; the calendar's own settings determine notifications.

Tests should unfold and parse the file independently, check Arabic/emoji boundaries, hostile line-break text, leap dates, end-of-month/year values, repeat export identity and absence of sensitive fields. Actual Apple/Google/Outlook calendar import is a separate interoperability check. A syntactically valid file does not establish that a notification will appear on a particular phone.

## 7. What earns a place, and what does not yet

| Idea | Decision | Reason |
| --- | --- | --- |
| Private-note search and careful Arabic matching | Implement within the current field | Removes a retrieval problem without adding navigation. |
| CSV for current records | Implement as a secondary data action | Makes existing work useful elsewhere with an explicit scope. |
| Calendar file for a saved follow-up | Implement contextually | Uses an existing date without a new permission or notification system. |
| A second application board or another dashboard | Defer | Duplicates the existing record model and increases phone density. |
| A generic ATS or hire-probability percentage | Defer | No evidence here establishes a calibrated employer outcome measure. |
| Automatic application submission copied from another product | Keep the existing authorization gate | A public job page, extension or competing product is not an employer integration grant. |
| Inbox sync, recruiter CRM or a browser autofill extension | Defer | Adds data access and ongoing maintenance beyond the selected local improvements. |
| A complete résumé editor or multi-provider AI assistant | Defer | A distinct product surface; optional model/hosting charges conflict with the current free-only direction unless separately resolved. |
| Theme, bilingual typography, an opaque icon and clear settings | Preserve and verify | Already part of the requested redesign; quality depends on working layouts and state continuity. |

The comparison is useful when it removes friction, not when it maximizes a checklist. An improvement must fit an existing task, preserve original information, have an understandable failure state and carry source-bound verification. That is how this project will judge a better experience; this research cannot establish that it is superior to every competing product.

## 8. Next acceptance receipt

The follow-up receipt must identify exact integrated source, conservative search rules, CSV/ICS disclosure text, independent parser tests, privacy/identity race tests and any native parity differences. It must retain failed attempts and external limits rather than replacing them with a generic pass. The current PR is a development checkpoint; hosted version 7 and Publishing's branch remain distinct. The report does not authorize merging, signing, real employer tests or claiming that a rate-limited publishing handoff was received.
