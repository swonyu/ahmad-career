# Career Finder account-component browser fixture

This is a disposable, loopback-only fixture for browser review of the actual current `SessionRecovery`, `SignInOptions`, `OAuthFeedback` and `ProviderConnections` components. It is not a hosted service, native build, live provider test, or release gate.

## Source fidelity and isolation

- The bundle imports the production components directly from the isolated continuation working tree, including the real API helper, provider revision/authorization/disconnect guards, translations and locale state.
- It uses the installed, locked React, React DOM, esbuild, PostCSS and Tailwind dependencies. No installation is performed.
- Both actual global CSS files, Arabic font files, Google font and Google artwork are included. Fixture CSS styles the harness only.
- The sole framework replacement is `next/image`: an ordinary browser image retains its source, alt text, width and height. Components, events, fetch, DOM, focus, location, and history are not mocked.
- React uses its production bundle, without a harness-added StrictMode wrapper.
- `public/build-metadata.json` records the repository HEAD, runtime/dependency versions and SHA-256 of every bundled non-dependency source. These hashes, not HEAD alone, identify the dirty working-tree code actually reviewed.
- All generated files and logs stay in this fixture folder. Rebuilding does not run the application build or modify the repository.
- The server binds only 127.0.0.1, rejects a different Host or Origin, and has a finite static file allowlist. Synthetic account IDs use `fixture-account-a` and `fixture-account-b`; the only email is under `example.invalid`.
- Sign-in anchors go to local inert stub pages. Connect responses deliberately contain a local URL rejected by the real production authorization guard. No external authorization URL, token, secret, account session or live provider response is supplied. Do not replace those URLs with real providers.

## Rebuild after reviewing a source change

Run this exact command on Saleh's Mac using the pinned verification runtime:

```sh
/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/toolchain/node_modules/node/bin/node /Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/grok-browser-fixture/build.mjs
```

The builder reads fresh production source and writes only this folder. Rebuild after the actual Grok patch is accepted; refresh the browser and verify build metadata hashes. The builder does not start a listener.

## Start only when the browser reviewer is ready

No listener was started by the fixture author.

```sh
/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/toolchain/node_modules/node/bin/node /Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/grok-browser-fixture/server.mjs --port 4179
```

Open **http://127.0.0.1:4179/** in the connected Mac Chrome browser. If that port is already occupied, choose another unprivileged port and update the URL; do not stop an unrelated listener. Stop only this fixture process when finished. The server uses one in-memory scenario for one reviewer; do not share it across parallel browser runs.

## Browser controls

Select a component, scenario and response delay, then **Apply scenario and mount**. Applying resets the synthetic account state and request ledger and remounts the real component. Language changes use the real locale preference API and update the document direction. The harness remains English/LTR to make control labels stable.

**Make next responses healthy** clears synthetic service errors without remounting the component or sending an auth request. Then activate the component's own retry. **Unmount component** removes the real component to inspect cleanup; mounting again uses the active scenario. The focus display is observational and never calls focus.

The ledger counts only `/api/auth/*` requests and shows synthetic request bodies, status, and observed client disconnection. GET refreshes on window focus, visibility changes or pageshow are legitimate production behavior. They must not be mistaken for mutation replay. The ledger retains the most recent 200 requests.

A 1500–4000 ms response delay makes busy states observable. 21000 ms deliberately exceeds the API helper's usual timeout; it is optional when a specific timeout question remains.

## Focused review matrix

1. **ProviderConnections / Healthy**, 1500 ms:
   - Tab to Disconnect Google and activate it. Confirm the two confirmation controls and their accessible names; inspect where keyboard focus lands.
   - Keep connected must make zero disconnect POSTs and return to a usable focus position.
   - Open confirmation again; Confirm disconnect must create exactly one POST with account A and the current connection ID.
   - Inspect visible and accessible busy wording, duplicate-activation prevention, and the status GET after success. Success is permitted only after readback shows disconnected.
   - Repeat LinkedIn and Arabic/RTL; compare narrow and wide viewports.
2. **ProviderConnections / Disconnect fails**, 1500 ms:
   - Confirm once, inspect alert/focus recovery and exactly one failed POST.
   - Make next responses healthy, then use the component's Check current connection. That action may GET status but must not resend the disconnect.
   - A fresh explicit disconnect confirmation is required for another POST.
3. **ProviderConnections / Disconnect POST succeeds; status still connected**:
   - Confirm once; readback remains connected. The UI must not claim the provider was disconnected.
   - The only-sign-in-method scenario should likewise retain connection truth after a 409.
4. **ProviderConnections / Configured providers, disconnected**:
   - Connect produces one POST, busy feedback, then the real invalid-authorization-URL error.
   - Browser location must remain on loopback. This is intentionally an error-path check, not successful OAuth.
5. **SignInOptions / Status unavailable**, 1500 ms:
   - Inspect checking/disabled state and status/error accessibility.
   - Make next responses healthy, then Check again. Provider availability recovers without mutation requests.
   - Verify LinkedIn connection-only does not expose direct LinkedIn sign-in.
   - Configured sign-in links and ChatGPT may be followed: only a clearly labeled local stub page opens.
6. **SessionRecovery / Session recovery fails**, 1500 ms:
   - Activate once; inspect visible/accessible busy state, disabled duplicate activation, failure announcement and keyboard recovery.
   - Make next responses healthy; explicitly activate recovery again. The safe response redirects to the local `/account?...fixture_return=recovered` shell.
   - Check exactly one signout POST per explicit activation and the expected synthetic account ID.
   - Also review the nested recovery control in SignInOptions / Expired session and ProviderConnections / Expired session.
7. **OAuthFeedback / verified connection or sign-in**:
   - Applying prepares return query parameters before mounting. The real component strips those parameters and verifies status before presenting success.
   - Unconfirmed or status-unavailable scenarios must not make a success claim.
   - Cancelled, failed and LinkedIn-email-required scenarios should show their appropriate messages without status verification.
   - Inspect Dismiss keyboard behavior, accessible naming and focus destination; Open Account remains a local shell.
8. **Account mismatch / lifecycle**:
   - ProviderConnections must refuse account B as the account A workspace.
   - Unmount or leave/return to the tab during a delayed operation. Observe the actual component's fencing and refresh behavior; no automatic mutation replay is expected.

Record actual keyboard, DOM accessibility, screenshot and request evidence for each exercised case. The fixture itself does not establish those passes.

## Limits

The response scenarios are synthetic and intentionally bounded. This fixture cannot establish real OAuth callbacks, cookie/session security, provider credentials/availability, deployment routing, native accessibility, native application workflows, actual screen-reader announcements, or store readiness. Use the app's existing suites and owned browser/native flows for those gates. An accessibility tree alone is not an audible screen-reader test.

Initial author validation consists of syntax checks and an actual esbuild/PostCSS bundle on Node 24; browser and HTTP-listener behavior remain for the reviewing owner. `preflight.json` preserves the commands/results, including any initial harness-only error and its subsequent correction.

## Follow-through evidence — 17 November 2026

The root reviewer used this fixture in actual connected Chrome with synthetic requests. The added **Supplied recovery account** control changes only the real SessionRecovery account prop (A/B) without remounting the harness or issuing a request. Applying a fresh scenario resets it to account A. The control was used to exercise A → B → A during a pending request; no automatic additional signout POST occurred and no late navigation was observed. Component unmount and explicit retry were also exercised. These observations do not establish cookie-jar behavior or real OAuth.

The final fixture source hash is `831422f1a4098558da19ee027a7ac1baffbe5bff12edb67ff2909b8ab384dc48`. Source hashes in build metadata bind the bundle to the actually imported production files. Final ProviderConnections hash `03c766b5bfe7b04f30ca545e78dac63225a1b371f8ae35d96a1a80dfaf6047c8` was rebuilt, but its final English/Arabic narrow-screen browser retest remains pending after the originating Browser context became unavailable. Earlier synchronous-heading focus behavior was actually observed on candidate 349; do not relabel that as final03c acceptance.

The sole owned account listener PID 36176 was checked against this exact server script and cleaned up at the end of the blocked browser cycle; `account-fixture-cleanup-20261117.json` is the authoritative process receipt. Preserve this fixture for a later authorized originating-browser review. Do not terminate an unrelated process or use a bypass control path.
