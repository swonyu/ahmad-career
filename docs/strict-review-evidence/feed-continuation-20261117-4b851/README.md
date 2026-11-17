# Feed reliability continuation — 17 November 2026

## Scope and source

This is a reviewable continuation checkpoint, based on integrated source `0f0c6f1f591ff173e51671599cbbb6aeff4a69e4`. It does not move the publishing branch, dispatch native CI, deploy a service, sign a build, or submit to a store.

The original independent patch at `/tmp/career-feed-review-dot-evidence-20261117/discovery-body-cleanup.patch` was preserved. Its SHA-256 is `bbce0663f7849e7d3afac3082432366017431e51e2ac36732d432ae5e6b40b12`. The change was reviewed against the current integrated tree and exercised through the production handler with actual local D1 and the production phone response schema.

## Reproduced problems and corrections

1. Discovery rejected MIME/declared size before releasing its response body. Oversized stream cleanup could also delay or replace the validation error. Rejection now requests cancellation without awaiting unbounded cleanup, preserves the original error, and releases acquired readers. Late responses arriving after timeout are also cancelled.
2. The provider adapter awaited oversized-body cancellation. A never-settling cleanup could retain an uncertain submission indefinitely. Cleanup no longer gates its conservative outcome. No request is replayed and no provider receipt is invented.
3. Both browser API readers could leave unfinished bodies owned after early failure. They now distinguish fully consumed bodies from unfinished reads, release unfinished transports/readers, and retain existing API errors, caller-abort and timeout semantics.
4. A transient failure on a later Lever page discarded all previously validated pages. The handler now retains only the new validated prefix and exposes the original error as partial coverage. It preserves source deadlines, request budgets, job/byte limits, cursor invalidation and the durable lease compare-and-swap.
5. A later-page body disconnect originally escaped as a raw stream error, bypassing that bounded recovery. Only reader transport rejection is normalized to source timeout/unavailability. Malformed JSON/schema, redirects and missing boards retain their prior failure paths.

A transient interruption does **not** set the count/data-cap flag. It makes the response partial through its source error. A captured absolute retry time is persisted once, without sliding on reads. Freshness ends at the earlier of the normal freshness boundary and retry eligibility; a long provider cooldown still allows data to become stale and eventually unavailable. The handler never combines a new prefix with an older cached tail.

No dependencies, source catalog entries, provider credentials, native files, or owner-managed PhoneApp/translation files changed.

## Verification

Pinned CI major: Node 24. Executed runtime: **v24.22.3**. The isolated runtime did not replace the user's system Node. See `gates.json` for source hashes, exact commands, execution times, log hashes, and preserved before/after hash equality.

Baseline reproductions:

- Discovery early-rejection test failed because cancellation count was 0 instead of 1.
- A later-page body disconnect returned unavailable instead of retaining the 100 validated jobs as partial.
- Provider cleanup baseline: 8 passed, 2 failed with pending cleanup.
- Frontend cleanup baseline: 8 passed, 7 failed.

Candidate evidence:

| Gate | Actual result |
| --- | --- |
| Production discovery handler + local D1 | 47 groups passed; 8 bundled-workerd requests; 97 phone-schema response validations |
| Provider cleanup tests | 10 passed |
| Frontend cleanup tests | 15 passed; 39 passed together with existing browser/phone API tests in targeted execution |
| Hosted `npm test` | Exit 0, including the new tests; 223 Node test cases in the final unit-test chain and 6 PDF tests, plus standalone integration groups |
| Authentication integration | 55 groups; separate actual-workerd auth fixture 30 requests / 12 synthetic provider requests |
| Application integration | 63 groups; 12 synthetic provider POSTs; zero real employer requests |
| Phone integration | 19 groups; 164 actual-workerd requests; 2 synthetic provider POSTs; zero real employer requests |
| Vault regression | 34 groups |
| Additional production-worker gate | 17 actual-workerd requests passed |
| Additional browser API/pairing gate | 14 passed |
| Typecheck and app/worker lint | Exit 0; max-warnings 0 |
| Production hosted build | Exit 0 |
| Locked dependency audit | Exit 0; 0 reported vulnerabilities |
| Website regression gates | All existing record/feed/state regressions passed; application regression 119 groups; synthetic TLS 12 checks |

Counts describe different suites and requests; they are not combined into a fabricated single total. Synthetic employer operations are never represented as live applications.

The seven hosted gates ran from 17:14:55 to 17:16:05 UTC on 17 November. All eight modified source/test/package hashes were unchanged throughout the run. The production discovery regression is wired into the existing integration test; both new cleanup test files are wired into `npm test`.

## Real public-source observations and limitation

A single local production-handler probe, using isolated D1 and public GETs only, completed Canonical, DoorDash, Spotify, Freenome, Duolingo and Zoox. Lyra timed out during later pagination in that observation. A subsequent single Lyra check on this candidate timed out before its first response headers after approximately 5.1 seconds. No valid prefix existed to retain.

Therefore this checkpoint establishes bounded cleanup/recovery behavior, **not** a live reliability guarantee for Lyra, a deployed-service pass, or a native acceptance pass. Public provider observations and source hashes are preserved in `provider-probes.json`. A provider outage must remain visible; the app cannot manufacture an empty successful result. Its employer-board route is a possible user fallback, but a full browser journey through that route was not established in these probes.

## Independent critique and ownership

The provider change and frontend changes each received independent source/test review by a different reviewer. The pagination review identified body-disconnect classification, retry anchoring, old-cursor invalidation, later malformed/redirected pages, budget exhaustion, and long cooldown as concrete risks; all are covered in the final 47 groups.

Publisher retains integration, native acceptance, signing and store work. Development retains PhoneApp/translation changes and its sealed source. Grok has an isolated four-component account/accessibility lane; its patch is not included here. Broader native search, receipt recovery, profile-comparison localization and hosted draft-recovery findings are recorded in the coordination thread and remain open until their owners fix and retest them.

Coordination:
- https://github.com/swonyu/ahmad-career/pull/1#issuecomment-6954689974
- https://github.com/swonyu/ahmad-career/pull/1#issuecomment-6954889472
- https://github.com/swonyu/ahmad-career/pull/1#issuecomment-6955496651

## Native and release evidence is separate

Focused publisher run `44129604009` at `0f0c6f1` passed exactly one connection test and completed xcodebuild, evidence export and artifact upload. Four other jobs were skipped. It is explicitly a partial regression, not a full integrated pass.

Earlier full account run `44122504831` at `d97bc209` logged 17 passing iPhone cases but failed at the execution timeout before finalizing its result bundle. It remains a failed gate. The account owner's later `21f08f5` includes its bounded step/job timeout correction and runs separately from this checkpoint.

No store submission or release readiness is claimed. Real provider/account callbacks and physical VoiceOver/TalkBack acceptance remain separate requirements.

## Research basis

- Node/Undici documents the need to consume or cancel response bodies to release connection resources: https://github.com/nodejs/undici/blob/main/README.md
- The Streams standard separates stream cancellation from asynchronous underlying-source cleanup: https://streams.spec.whatwg.org/
- Lever documents company-scoped pagination, supported GET parameters, application receipts, and hosted-form alternatives: https://github.com/lever/postings-api
- GitHub documents workflow concurrency and timeout behavior: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax

The implementation decisions above are based on the reproduced production-code failures and bounded acceptance cases, with those primary sources used to check the external contracts.
