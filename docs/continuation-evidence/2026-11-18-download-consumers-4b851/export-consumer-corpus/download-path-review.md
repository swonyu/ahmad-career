# Current PhoneApp download path: bounded independent review

Reviewed 17 November 2026. Owner /root/export_consumer_review. Read-only production and fixture inspection. No product edits, fixture rebuild, listener, browser session, dependency install, native test or Calendar action was performed.

## Source binding and verdict

Production HEAD: 2884188263f3dad5753da7b2e507f6ba55e30eb0.
hosted/app/phone/PhoneApp.tsx SHA-256: cea98d8442f0dcb43cee2b1e3d5d5a2814a89130b7c18793ee50f4a8366d5368.

The download helper creates a Blob URL, creates/configures/appends an anchor directly to document.body, clicks it, removes it, then schedules URL revocation after 30 seconds.

There is a source-proven exceptional cleanup gap: any synchronous throw after createObjectURL succeeds and before the timer is scheduled leaves the Blob URL registered. If click() is forcibly replaced with a throwing function, the appended anchor also remains. This supports a low-priority defensive cleanup finding. It does not by itself establish a material customer failure in normal supported browsers or a release-blocking defect.

Grok's reported 31 extracted/ported-function tests were not executed or independently reproduced by this lane. Their count is not browser evidence.

## Failure semantics and recovery

| Situation | Current code behavior | Interpretation |
|---|---|---|
| Blob/createObjectURL throws before URL creation completes | No created URL or appended anchor to clean up; outer run catches and finally clears busy state | Source-level recovery is present; actual browser failure was not injected here |
| createElement, appendChild or a replaced click method throws after URL allocation | Outer run catches and clears busy, but download helper skips remaining anchor/URL cleanup | Defensive cleanup gap established by control flow; realistic trigger remains unproven |
| Ordinary native click succeeds | Anchor is removed synchronously; Blob URL revocation is scheduled at 30 seconds | Expected path; file receipt is still needed to verify delivery |
| Browser policy blocks download or user cancels the save | Native click is not a download-completion promise; browser denial/cancellation can return or occur asynchronously | Does not enter the generic catch merely because a file was not saved |
| Click event listener throws | DOM event dispatch reports the listener exception rather than normally propagating it to the click caller | A throwing click stub is materially different from a normal listener error |
| Async calendar generation finishes after ownership/record changes | Export checks generation/scope again and checks current record against captured record before download | The relevant identity and stale-record guards are present |

The outer run function uses try/catch/finally and unconditionally clears busyRef/busy in finally. Error notices render as alerts. CSV and ICS success notices say the download started, not that an application consumed it successfully. Browser file existence/content must be observed; a notice or a stubbed click count is insufficient.

The current inputs are a newly constructed Blob and a fresh native anchor appended to the mounted page body. No evidence was found that those standard calls are routinely replaced or fail in the supported page. A synchronous injected click failure is useful defensive coverage, but should not be promoted to demonstrated normal-browser breakage.

If root assigns this hardening later, make cleanup exception-safe while preserving the successful-path grace period for URL revocation. Ensure URL cleanup is scheduled even when anchor creation/clicking fails, and remove an allocated anchor in a finally block. Avoid introducing immediate successful-path revocation solely to satisfy a stub. Acceptance should include actual CSV/ICS download plus a focused explicitly labeled injected-failure resource-cleanup check. No product patch was made here.

## Existing actual PhoneApp fixture

Path:
 /Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/search-browser-fixture

It mounts the real PhoneApp with account=null, production React/hooks/storage/API helpers/translations/styles, and synthetic discovery GET endpoints. Product mutations/account routes are denied. Guest data stays in the guarded loopback origin. It does not seed application records automatically.

At inspection, public/build-metadata.json recorded:
- generatedAt: 2026-11-17T18:57:43.728Z
- commit: 9971b7f9367e5a8374890f1c6b8648742c3491b1
- node: v24.22.3
- current-matching PhoneApp/model/record-tools hashes.
- 31 of 33 recorded source hashes matched the current checkout.
- ProviderConnections.tsx and SignInOptions.tsx differed from their bundled copies.

Root was informed and owns the rebuild before calling the entire fixture current. build.mjs already pins the current PhoneApp hash. README's older expected hash is stale prose; the executable build guard and generated source metadata are the relevant evidence.

Existing root commands, shown only as instructions; not executed by this lane:

    /Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/toolchain/node_modules/node/bin/node /Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/search-browser-fixture/build.mjs

    /Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/toolchain/node_modules/node/bin/node /Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/search-browser-fixture/preflight.mjs

    /Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/toolchain/node_modules/node/bin/node /Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/search-browser-fixture/server.mjs --port 4181

Only root checks current process/port ownership and starts the listener. Never stop another owner's listener or clear unknown storage. The fixture refuses an origin containing unrecognized data/workers.

Supported healthy synthetic discovery URL:
 http://127.0.0.1:4181/?scenario=exhausted&lang=en

The exhausted scenario supplies exactly 200 synthetic matches in 50-row pages. There is no need to load all pages for a single export record. Other supported scenario IDs are capped, partial, partial-capped, stale, unavailable and provider-limit.

### Fast supported UI record path, without a backend

This path avoids needing search results and uses the product's own manual bookmark and record editors:

1. Open the fixture and choose the product Saved tab.
2. Choose Add job link.
3. Enter Job link https://example.org/career-finder-ui-export-20261117, Job title مُهندس, "أول" 🧭, Employer Synthetic employer / جهة تجريبية. Choose Save on this phone. Do not open the external job link.
4. On the saved card, choose Edit application record.
5. Keep Stage Saved. Enter Follow-up date 2026-11-24 and a conspicuously synthetic Private notes value, optionally beginning =1+1 to exercise formula protection. Choose Save record.
6. CSV: Settings → Your saved data → Spreadsheet export → Export application records (CSV).
7. ICS: Saved → the job-title button → Calendar reminder → Download follow-up reminder (.ics).
8. Switch the fixture's Product language control to Arabic and repeat the product export action.

An alternative is to run Search jobs in exhausted, save/open one visibly synthetic result, and use the same record editor.

Actual download filenames:
- Career-Finder-application-records.csv; MIME text/csv;charset=utf-8
- Career-Finder-follow-up.ics; MIME text/calendar;charset=utf-8

The fixture's document click interlock checks only anchors contained by fixture-product. The production helper appends its temporary anchor directly to document.body, outside fixture-product, so this interlock does not intercept those Blob downloads. This is a source-level assessment; root still must observe the real downloads.

Do not mistake these manually created UI records for the earlier 17-record corpus. Their runtime updatedAt values and fields differ; verify their actual content, not the earlier corpus's full-file hash.

## Official primary references

- https://html.spec.whatwg.org/multipage/interaction.html#dom-click — native click algorithm.
- https://dom.spec.whatwg.org/#concept-event-listener-invoke — listener exceptions are reported.
- https://html.spec.whatwg.org/multipage/links.html#downloading-resources — policy/sandbox download returns and asynchronous download outcome.

These references support the distinction between synchronous method exceptions and download acceptance. They are not execution evidence. No further generic browser research or additional synthetic suite was performed.
