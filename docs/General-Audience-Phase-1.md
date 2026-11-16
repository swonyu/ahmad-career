# Career Finder — isolated local-experience candidate

Prepared from source `bcc4aae3258099b6e2277abdf07fa839d31dbee9` on 15 November 2026.

## Implemented in the candidate

- Generic start screen with optional profile setup, source-coverage explanation and access to existing saved records.
- New profiles have no personal biography, qualifications, assumed city or seeded recommendations. Application-note drafts no longer inherit a bundled professional role.
- The bundled personal biography was removed. Historical job evidence is a separate recovery-only collection, used only when an existing saved/status ID lacks a retained snapshot. New users receive no such records.
- Existing native storage paths, browser keys, job IDs, profile fields, application-record schema, per-record storage and checklist IDs remain unchanged. Saved snapshots are preserved rather than overwritten by the recovery seed. Existing Riyadh and monthly SAR preferences retain their original meaning.
- Carried checklist completion records preparation, not completion of new obligations for every application. The CV item says “Prepare your CV materials”; per-application tailoring remains guidance. Selected role/deadline labels and a recheck reminder prevent retained checks from implying future verification. Completion bits and keys are preserved.
- Visible product titles use Career Finder. Binary native icon assets, bundle identifier, signing configuration and Apple records are unchanged.
- Hosted and embedded web assets remain synchronized.

## Scope that remains unfinished

This is the first local-experience phase, not a worldwide job-search conversion or a release candidate. Live search still uses fixed queries against bounded samples from six selected Saudi employer sources for supply-chain, procurement and performance roles. Unsupported countries or role families must not be represented as zero job availability.

Generic country/city/role controls, independent currency/pay-period and time-zone handling, localization, comprehensive accessibility, production support/privacy hosting and runtime/device validation still require implementation and verification. The remaining local salary/date controls retain their explicit Saudi semantics. Historical salary references do not establish worldwide or job-specific pay.

No feed adapters, API/Worker contracts, request fields, source providers, URL validators or WebKit bridge policies changed. Profile and discovery criteria remain excluded from search requests. The original required Postman API-engineer workflow remains unresolved; the Newman automation skill is a different workflow.

## Verification boundaries

Cloud JavaScript checks exercise fixtures, local storage, exports, source boundaries and the generated Worker locally. New production-bundle checks cover a blank new-user experience, recovery of only saved legacy IDs, retained profile/checklist/receipt data, preservation of newer snapshots, and failed/corrupt migration behavior. The long-standing historical research scenarios remain explicit test fixtures separate from the production bundle.

One original redraw test depended on a real dated vacancy still being unexpired. Its fixture now has no deadline so the test measures accepted-correction redraw rather than changing availability over time.

Native store checks were extended for generic defaults and legacy-ID recovery. They have not been compiled or run in this isolated Linux preparation. No native build, simulator session, real-device test, VoiceOver run or visual browser QA was performed for this candidate. The original Mac checkout remains untouched until ownership is confirmed.

No code was pushed, build uploaded, App Review submission made, or public release performed. Existing Apple record `6820749119` must be reused after all applicable gates pass.
