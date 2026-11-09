# Saleh Career Finder 1.4

A career workspace with public employer discovery, saved opportunities, application tracking, search-result comparisons, and private next-action planning. The current discovery adapters focus on paid software, Python and AI opportunities in Saudi Arabia. Users enter their own experience, education, skills and preferences.

This is the generic distribution variant. No personal profile, CV, application ledger, local notes, credentials, or installation receipts are bundled. Existing repository history is preserved; this branch does not change the remote main branch.

## Run and check

Web: `cd website && npm start`, then open `http://127.0.0.1:8779`. It binds locally by default. Checks: `npm test && npm run build`.

Apple: open `apple/AhmadCareer.xcodeproj`. Internal target names and the existing `com.ahmadalayed.career` bundle identifier are retained for compatibility; the visible app name is Saleh Career Finder. Set your own signing configuration for device builds. Run `cd apple && bash Checks/check.sh --web` for isolated checks.

Records stay on each device; web, iPhone and Mac do not sync. Existing Ahmad app storage identifiers are preserved for update compatibility. The separate personalized Saleh installation is not modified by this source publication.

Discovery is limited to configured public employer sources. Listing responses do not establish eligibility, salary, application success, or newly opened vacancies. No automatic application, external message, or notification is sent. A source publication or build check does not establish App Store/TestFlight distribution or device installation.

## Private backup update 1.4

Adds portable private JSON export and preview-first additive restore of saved jobs, stages, receipt notes and next actions. Existing values are preserved. Profile and checklist are exported for reference only and never restored. No cache, comparison history, theme or unsaved drafts are included. Files are unencrypted and must be kept private.

Strict schema, safe-link, reference and date validation applies, with a 4 MiB portable envelope and 1,000 retained-role limit. Preview and commit reject stale revisions, unreadable/orphaned records, excessive combined data and failed recovery writes. Restored receipt/task maps commit atomically with the workspace. Both web and native tests cover cross-format imports and stale-window protection.

Close older app versions before restoring. Do not downgrade after importing receipts/tasks: older versions do not understand their fallback maps. Save a portable backup first. Restore does not confirm a submission or current vacancy, and never sends messages or applications. The original Ahmad storage namespace and bundle identifier remain unchanged. TestFlight upload is not part of this update.

## Discovery and role review 1.5

Version 1.5/build 16 adds Devoteam and Delivery Hero, bringing selected official sources to nine. SmartRecruiters parsing checks public active Saudi listings, exact source identity and URLs, and bounded list/detail requests. Incomplete checks preserve dated prior evidence; known exclusions remove discovery while retaining saved history. Web sources have a 40-second deadline/14-second requests; native retains 45-second source, 20-second request and 45-second resource budgets.

Role-family filters, broader requirement-text search, and literal technology overlap with self-entered skills help review opportunities. Education, student, program/GPA, experience, work-authorization and unpaid wording remains quoted with qualifiers. No score or eligibility verdict is produced; excerpts are always partial or missing. The Mac/web interface also compares up to three roles temporarily without changing saved roles or local stages. Native iPhone includes review and filtering, not side-by-side comparison in this release.

Existing bundle identity, storage namespaces, backups and self-entered profiles remain intact. No personal profile, CV, private application ledger, local installation receipt or credentials are included. No application, message, notification or TestFlight upload is performed by this update. Physical-device QA remains separate from compilation and isolated checks.
