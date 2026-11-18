# Complete Arabic expiry wording in the prepared review

This isolated successor starts at `2fac36f321005d9a2703e6db92acd7d7c14886c5`. The sealed connection-clearing candidate, its recovery branch and its bundle remain unchanged. The coordinator requested the follow-up on a separate branch so an active focused iPhone workflow cannot be cancelled by a newer push.

## Actual finding

The original `acceptance-prepared.png` from Android artifact `14343465949`, run `44114195156`, source `56784d740a25d07d2fbd4616f57e55cf0cb4453f`, visibly includes the English word “Expires” inside an otherwise Arabic application-review summary. The exact original image SHA-256 is `5f09d5433a780eb01771c4fc2adbcf7f667cd4981439e24ecef9a3691b671a33`. The attached visual audit records all 20 original Android screenshots and distinguishes full app fixtures from isolated production components. Images were inspected and hashed without editing their bytes. This source package references the original artifact; it does not pretend an unprovided image is embedded here.

`ApplyScreen` built the summary by concatenating the review-prefix copy, profile revision, English expiry suffix and localized timestamp. `Heading` passed the completed sentence to the fallback localization matcher. Its broad `This review uses profile version {0}` template matched the prefix and treated the rest—including “Expires”—as opaque argument content. The existing separate expiry translation was therefore never consulted.

## Change

The screen now formats the complete sentence explicitly with two arguments: the existing profile revision and existing localized expiry timestamp. The canonical English/Arabic copy catalog gains one complete template, and the normal generator updates all seven platform resource outputs. All earlier catalog entries remain unchanged. The date, approval deadline, profile version, request payloads, consent, test-service warnings, submission controls and receipt meanings are unchanged.

The existing English/Arabic localization test now checks the expiry wording and retention of the localized timestamp. The existing native synthetic-HTTPS approval journey now scrolls to and asserts the complete actual Arabic summary before capturing it, and rejects a missing Arabic expiry phrase or an English “Expires” fallback. Every earlier line and assertion in both test files remains in order. No journey was removed, skipped or replaced with a source-only test.

## Verification and remaining gate

The generator consistency check passes with 1,802 strings per language and 149 bounded templates. All eight existing generator tests pass. The complete-template match is ordered before the generic prefix; both placeholders remain distinct. The iPhone test source, hosted phone source and optional focused workflow are byte-identical to the sealed2fac base. No native build or runtime test was executed by this worker.

The source hashes, retained method names and exact local checks are in `verification.json`; raw local logs are adjacent. The required retest is the exact successor's full Android compile/lint/native job, including `NativeLocalizationAcceptanceTest` and the real native synthetic-HTTPS approval journey that produces the review screenshot. The complete five-job gate still applies to the final release candidate. A previous Android pass or an iPhone-only partial pass does not establish acceptance of this changed tree.

The original owner was rechecked at sealed `d97bc20` with clean native implementation paths. This scope is recorded in the existing private coordination artifact; the owner’s dirty documentation remains untouched. No push, workflow dispatch, Mac build, signing, store update, deployment, real applicant operation or employer request was performed by this integration worker.

## Independent review and research comparison

The separate peer review found no blocking source issue and verified all11 source hashes and retained native test lines. Its receipt is included. `research-dispositions.json` records the independently confirmed Grok expiry finding, corrects its version attribution of the Clear control, and explains why the reserved invalid origin is a same-origin parsing sentinel rather than an outgoing request endpoint.

The base2fac focused iPhone run44124734131 has now finished in failure: one test executed, zero passed, four unrelated jobs skipped. It failed at the profile email exact-value assertion before reaching the new Clear action. That failure remains open for a separate evidence-backed helper follow-up. No result from it establishes native acceptance of this Arabic correction.
