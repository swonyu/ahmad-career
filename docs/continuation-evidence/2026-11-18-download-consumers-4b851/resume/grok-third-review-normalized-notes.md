# Grok third-review follow-through — normalized observations

Recorded by the root continuation on 17 November 2026, after the browser session ended. This is a normalized record of replies that were read in the active browser session. It is **not a raw transcript**, a Grok runner download, or new execution evidence. The raw third-reply buffers did not survive the originating-browser-context interruption. Earlier saved replies remain in grok-second-review-responses-20261118.json and the two named text files.

## Browser sessions and ownership

- Build 1: https://grok.com/c/adc8cfe9-ed35-4fcd-9961-d1fc081daef0 — actual Build mode was checked.
- Build 2: https://grok.com/c/abe34c88-8973-4ecb-aacc-9a7e595c33ef — actual Build mode was checked.
- Heavy: https://grok.com/c/3bf518a8-10be-40cd-9d0e-7a811c512a74 — actual Heavy mode was checked.
- All three third replies had finished and were read before the browser context became unavailable again. No continuous subsequent progress is established.
- The earlier full source packages and 39 images were not resent.

## Build 1: download failure and retry review

Grok clarified that its portability runner had been an unsaved stdin script. It cited only a 204-byte terminal log in its own environment, then supplied an inline extraction/assertion runner. It reported five simulated cases: empty-result retry, unavailable download API retry, serialization retry, repeated busy action and forced click failure recovery. These reports are not root-executed browser results and the unsaved runner was not independently retrieved.

Grok corrected its earlier overly absolute claim that a normal download click cannot throw. Its source review identified a defensive cleanup gap when DOM operations throw synchronously after an object URL has been created. It supplied no product patch and demonstrated no ordinary customer download failure.

Root independently inspected the production helper, reproduced injected cleanup failures against the parent source, implemented a minimal try/finally cleanup, and exercised the actual AST-extracted production helper and both actual export handlers. Product checkpoint: da68bbfbdcc6429d72d1faa28b5809a554142c57. Root's final targeted result was 39/39, including eight new meaningful tests. Full source gates and their limitations are recorded separately. A normal click return is not proof that a file was saved; browser download acceptance for the new helper remains pending.

## Build 2: employer-page return and native assertion review

Grok reviewed the supplied parent-288 source hashes and did not demonstrate a new material hosted employer-return defect. Its source findings were:

- External employer links use a separate browsing context with noopener/noreferrer.
- Opening an employer page does not automatically mark the application as submitted.
- Signed-in return paths use focus, pageshow and visibility reconciliation.
- Private status reads do not overwrite the preserved local snapshot.
- Non-401 failures preserve edits and require explicit retry.
- A 401 or account change quarantines state rather than adopting another account's workspace.
- Approved batch work pauses while hidden or identity is unverified and does not automatically replay or advance.

This was source review, not actual installed-phone acceptance. Signed-in cookie lifecycle, external-app return, retained PDF/document selection, actual phone state restoration and physical assistive technology remain separate gates.

Grok also reviewed publisher a17999ce9f24d1e8c94a38c03dcda68101db4507: matching the full production complete-empty title and detail in the English native UI fixture is a valid source-level correction. This is not evidence that the rerun passed.

## Heavy: corrections and competitor proposal

Grok accepted that dependency audit entries are not demonstrated runtime reachability; PR257 and capture behavior remain unproven as a complete remedy; same-UID calendar reimport is consumer-specific; and five previously suggested improvements were already implemented or already assigned.

Grok then proposed an optional free-text contact field, based on an apparent gap in the high-level README. Root checked actual source and rejected that as a new capability: hosted/app/phone/components.tsx already provides private record notes with guidance for people to contact, interview details or the next step; notes support up to 5,000 characters and are already searched through the record tools and PhoneApp. A second free-text field would not establish parity with structured, reusable contacts linked to multiple jobs.

Official Huntr and Teal feature documentation does establish structured contact management as a competitor capability. Career Finder's existing notes are useful but are not evidence of that same linked-contact model. The measured gap should be retained in the roadmap rather than filled with an unreviewed duplicate text box.

The correction about existing notes **was not sent back to Heavy** because the browser context was unavailable. Send it in the existing Heavy conversation after reconnection; do not claim acknowledgement.

Heavy's toolchain-graph critique agreed that removing dependencies from a lockfile is not a complete migration while existing build/runtime/lint contracts still require those packages. It did not supply or validate an installed, buildable migration.

## Evidence boundaries

- Root browser account and actual CSV/ICS downloads were exercised on parent 2884188263f3dad5753da7b2e507f6ba55e30eb0.
- The newer cleanup helper has meaningful source tests and full hosted gates, but its browser rerun remains pending.
- The exact downloaded CSVs were independently imported by installed LibreOffice using the documented text-import route; receipts identify the parent source and exact bytes.
- No actual Calendar import/reimport, physical iPhone/Android export handoff, live OAuth, real employer application, store upload or release is established here.
