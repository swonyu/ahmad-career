# Synthetic local Career Finder journey

This separate fixture leaves the original `build-phone-viewport.mjs` baseline available. It runs the real PhoneApp and Account page, translations/CSS, encrypted vault, PDF worker/parser and HTTP response validation. A local workerd runs the actual discovery and hosted application handlers against isolated D1/R2 data. All applicants, jobs, files, provider responses and account identities are fictional. No employer or OAuth endpoint is contacted.

## Run

From `hosted`, with compatible existing dependencies:

```sh
node tests/journey-fixture.mjs --evidence-dir /absolute/fresh/check-output
node tests/journey-fixture-body.mjs
node tests/journey-account-fixture.mjs --evidence-dir /absolute/fresh/account-check-output
node tests/journey-search-sequence.mjs --evidence-dir /absolute/fresh/search-sequence-check-output
node tests/build-journey-browser.mjs --source-root /absolute/hosted --output-dir /absolute/fresh/journey-output
node tests/serve-journey-browser.mjs --output-dir /absolute/journey-output --state-dir /absolute/isolated/journey-state
```

Output and state must be outside the hosted source tree. The server chooses a fresh loopback-only port and prints its exact origin, PID, source-manifest hash and command. It writes `server-receipt.json`. Do not replace an existing owner's server or storage. Stop only this owned process gracefully before restarting with its same state directory. To retain the browser vault's origin during that owned restart, pass `--port` with the former port after it is released; an occupied port fails without takeover. A new port is a different browser storage origin. A surviving `runtime-owner.json` requires owner inspection; the harness never removes another process's lock or resets data automatically. Miniflare optional Cloudflare metadata fetch and telemetry are disabled. Unknown worker outbound requests are denied; the browser wrapper blocks unrelated fetches/navigation and declares a same-origin CSP, not a browser-wide network firewall.

The wrapper `index.html` labels the synthetic mode and provides controls. For an isolated browser at the capture dimensions, use `frame.html?actor=guest#search`, `frame.html?actor=a#search`, or `frame.html?actor=b#search`; append `&lang=ar` before the hash for Arabic. Direct-frame captures must retain synthetic provenance and the source-manifest hash in their evidence receipt; the fixture does not add test controls inside the product UI.

## Read-only Account view

Use the wrapper’s Page view selector or `frame.html?view=account&actor=a&lang=ar`. This renders the actual `app/account/page.tsx`, SiteFrame, AccountPanel, provider cards and sign-out control. Its page context stays fixed to the initial synthetic actor; changing response actor exercises the production identity-mismatch guard. The page introduction and its interactive children follow the real locale preference.

This view admits only `GET /api/account` and `GET /api/auth/status` through the real handlers. Its account details, CV metadata and usage come from the same isolated D1/R2 data. Provider configuration remains unavailable in the fixture. All account-view nonfragment navigation, including download links, is blocked; sign-in, export, deletion, upload recovery, disconnect and sign-out requests are denied. Confirmation panels can be opened and cancelled, but this view does not pretend those backend actions succeeded. The browser guard also excludes phone mutations while this view is mounted.

`journey-account-fixture.mjs` uses a fresh isolated state directory, sets up two fictional profiles through existing phone handlers, and checks guest/header-spoof denial, owner-specific Account/PDF reads, and unchanged private rows after denied account/auth routes. It records zero provider requests/outbound attempts. This is handler evidence; browser layout, interaction, locale switching and identity-change captures remain separate.

## Fictional data and normal journey

- `a`: Alex Example, `alex.journey@example.com`; `b`: Sam Example, `sam.journey@example.com`. Both start without a workspace. These are modeled edge identities, not OAuth verification.
- Board: `lever:global:synthetic-harbor-research`. Six jobs include identical Service Designer titles in Amman and Toronto, a nurse in Toronto, an accountant in Cairo, a teacher in Amman, and a remote software engineer. The actual discovery normalizer removes an intentionally duplicated upstream row.
- Equivalent supported source-ID, board-URL or posting-URL forms are allowed only when the actual source parser canonicalizes each to that exact synthetic board. The fixture preserves repeated forms in the request, letting the actual parser reject canonical duplicates. Other boards, regions, providers and hosts are rejected before any provider fetch.
- Posting IDs are `10000000-0000-4000-8000-000000000001` through `...000006`. All apparent Lever addresses are intercepted locally. External link/window navigation is blocked.
- A manual-link case can use `https://example.com/synthetic/harbor/service-designer-amman`; `.test` hosts are intentionally rejected by production public-link validation.
- Download and select `fixture-pdfs/Synthetic-Journey-CV.pdf` with the real file picker. Malformed and protected fixtures are also supplied. PDF bytes go through the actual browser worker and server validation; there is no fake PDF success.
- Search, open Details, save a job, visit Saved, edit the profile and select the synthetic PDF. Use the real local-save control. Creating an account workspace intentionally changes storage scope and reloads; use the app's explicit recovery/import path for a former draft. Save the fictional profile online, select jobs, answer required employer questions and prepare a review. Nothing is dispatched until explicit approval and continuation.
- Job 1 and job 6 return test receipts. Job 2 can be closed by its control. Job 3 yields uncertain transport. Job 4 rejects its first dispatch with a real ten-second cooldown and can return a test receipt only after the actual fresh-approval rules permit it. Job 5 returns an explicit rejection.

## Controls and fidelity

The wrapper controls board state, network loss and account recheck. The browser exposes `window.__careerJourney.control(action, value)`, `.metrics()` and `.state()` solely for fixture operation. Supported actions are `board` (`open`, `closed`, `empty`, `unavailable`), `outcome` (`by-job`, `confirmed`, `uncertain`, `rate_limited`, `rejected`), `sequence` (`journey`, `ab`, `bc`, `cb`), `actor` (`guest`, `a`, `b`), `offline`, `online`, `lose-next-mutation-response`, `hold-recheck`, and `release-recheck`. Language/text-size controls call real preference handling or documented CSS stress sizing. The latter is not OS accessibility text sizing.

### Search-history sequence

The default `journey` sequence keeps the original six application fixtures. Selecting `ab`, `bc`, or `cb` returns separate search-only roles from the same exact synthetic board: A is Service Designer in Amman (`...000101`), B is Service Designer in Toronto (`...000102`), and C is Senior Service Designer in Remote (`...000103`). Use `Designer` with a blank location and remote-only off to observe both rows. The actual discovery normalizer sorts and deduplicates them, so `cb` changes provider order without changing identities. No fixture computes or inserts a newness flag.

For these three sequences only, the injected discovery clock is fixed at `2026-11-21T18:00:00.000Z`; application, review and account clocks stay unchanged. Each board/sequence control expires only this synthetic board's cache, retaining prior rows for actual stale/error behavior. `board: unavailable` then `board: open` exercises outage/recovery. Search-only posting GETs are synthetic; their application requirements are deliberately not configured and POSTs are denied.

The equivalent operator request is `POST /__journey/control` with `{ "sequence": "ab" }` (or `bc`, `cb`, `journey`) on the exact owned loopback origin, with its matching Origin header. This also permits an immutable older browser bundle to be compared against the new sequence-enabled runtime; record both browser-manifest and runtime-worker hashes. Controls reset to `journey` on worker restart. They do not erase D1/R2 or the browser vault. `journey-search-sequence.mjs` checks the actual discovery response identities, fixed timestamps, reordering, stale outage/recovery, unchanged six-job default and outbound denial in separate isolated state.

Changing response actor triggers the real account-lock/recovery logic; it does not adopt the other account. Opening a selected actor reloads with that synthetic server-side account prop. The real vault and safety stores use separate journey-only namespaces, also distinct from the baseline fixture. No production guest/account data is opened.

`lose-next-mutation-response` lets the actual local handler complete, then rejects its browser response. No mutation is automatically retried by the fixture. The offline switch rejects before contacting even the local handler. A board-state change expires only this fictional board's cache lease/freshness and retains old rows, letting the real discovery handler distinguish stale, unavailable and verified-empty results. Provider controls and counters reset on worker restart; D1/R2 account/profile/job/plan/receipt data persist.

**Explicit capability seam:** the actual handler's adapter runs in `mode: test`, where its production `liveEnabled` value is false. Only the named fixture response envelope changes that value to true so the unchanged UI guard can reach review/approval/Stop. Every attempt and receipt retains `mode: test` and `evidenceMode: test`. The server receipt and request counters disclose that distinction. This is not proof that production Auto Apply is enabled or that a real application was sent.

The auth-status handler is real, but identity is supplied by an allowlisted synthetic edge. There is no login, credential, consent or provider-connection acceptance in this fixture. The employer catalog is synthetic; actual search normalization/cache/filtering and application handlers run with an injected provider. The HTTP bridge accepts only its exact `127.0.0.1:port` Host/Origin, no cross-site fetch, no arbitrary identity headers/cookies, and only named test routes. No public tunnel is supported.

`journey-fixture.mjs` checks these server seams, actual dispatch/duplicate/uncertain/cooldown/Stop behavior and persistence across a harness restart. `journey-fixture-body.mjs` verifies the actual bridge body reader across every byte split of Arabic/emoji JSON, a one-byte stream, the exact byte limit, oversized input and malformed UTF-8. It does not start a worker or use network. These checks do not prove browser interactions, physical-device behavior, screen-reader acceptance, live provider readiness or release readiness. Browser walkthroughs and screenshot receipts are separate evidence.
