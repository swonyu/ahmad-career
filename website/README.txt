CAREER FINDER — LEGACY WEB WORKSPACE AND SHARED ASSETS

Current product development targets iPhone and Android phones. This directory
preserves the existing browser workspace, shared web assets and local application
companion. See ../README.md and ../docs/START-HERE.txt for the phone project.

Start locally: npm start (Node.js 22 or newer), then http://127.0.0.1:8778
Checks: npm test
Build: npm run build
The build emits a dependency-free Cloudflare-compatible Worker.
The generated discovery Worker serves the web assets and /api/live. The separate
application companion and hosted phone service have their own operating guides;
see applications/README.md and ../docs/HOSTED-RELEASE-HANDOFF.md.

FRESH WORKSPACES AND EXISTING RECORDS
New workspaces have a blank personal profile, no seeded recommendations and no
assumed country, city or planning currency. Experience, qualifications, skills,
achievements and pay preferences come only from the person's own entries.
Timestamp display uses the device time zone until a display zone is selected.
Choosing preferences does not add employer sources or establish eligibility.

Historical healthcare research checked on 9 October 2026 is retained only to
recover roles already linked to an existing saved or tracked job ID. It is not
shown as a new person's shortlist or personal fit assessment. Existing profile
details, city/pay choices, application history and receipt notes remain intact.
Legacy browser storage keys and migration identifiers are deliberately preserved.
Current employer pages remain authoritative; older postings need reconfirmation.

DISCOVERY COVERAGE
Live search checks six selected Saudi-oriented employer boards for supply-chain,
procurement and performance roles. Other countries and role families are outside
this build's live coverage. Country and role preferences filter available rows;
they do not provide worldwide job discovery. Bounded title and location searches
can miss suitable roles. Errors and source coverage are shown. Incomplete
searches share a short 30-second retry cooldown; their original timestamps and
errors remain visible. Complete snapshots may be reused for five minutes. Missing
results from incomplete sources retain their original employer-check dates. Exact
validated exclusions stay out of discovery without deleting saved history.

Salary guides are historical Saudi market context; no researched vacancy disclosed
salary. Planning amounts do not convert currencies or create verified pay evidence.
An optional profile or application note is self-entered, not credential verification.

LOCAL TRACKING AND APPLICATIONS
Entered profile details, saved jobs and application tracking remain device-local.
The legacy web workspace does not sync its records to the phone application
service. Export notes before clearing browser/app data.
A storage conflict preserves existing records and asks you to export pending notes
before reloading. Exported notes are readable copies, not an importable backup.
Search sends fixed employer queries, not your CV or entered profile. Application
links open the employer's own site; local status changes do not submit anything.

Repository and website access are configured independently. A source upload or
local build does not establish which version is deployed. The web assets contain
no private messages, CVs, credentials or personal application statuses.

Optional application dates and plain-text receipt notes are saved separately from
status. Unknown dates stay blank; metadata edit time is not submission time.
Needs attention derives deadline/requirement/date prompts from saved, tracked or
meaningful recorded roles. It never certifies eligibility or contacts employers.
Receipt notes appear only in full tracking exports, not preparation drafts.
Unsaved record drafts survive navigation for the current session and are labelled
in exports; export before closing. Conflicting or unreadable records are preserved.
Safe browser metadata saving requires Web Locks; unsupported browsers can export
drafts. Native app record files use atomic writes and stale-base detection within
its local storage; no cross-process transaction or cross-device sync is promised.
