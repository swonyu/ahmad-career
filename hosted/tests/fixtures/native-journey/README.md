# Private native journey support

This directory is test support. Nothing starts on import. It is not wired into a
production entry point. The opt-in iPhone launcher starts only when explicitly
invoked with fresh installed app/runner containers. It does not launch a simulator,
install trust or start the native UI test.

## Opt-in iPhone host launcher

Run from the repository root after installing the isolated iOS app and UI runner:

```sh
node hosted/tests/fixtures/native-journey/serve-iphone.mjs \
  --app-container APP_DATA_CONTAINER --runner-container RUNNER_DATA_CONTAINER \
  --work-dir FRESH_PRIVATE_DIRECTORY --test-id UPPERCASE-UUID \
  --follow-up-day YYYY-MM-DD --port LOOPBACK_PORT
```

The work directory must be outside the repository, mode 0700 and empty. The
launcher pins the actual offline Worker inputs and a small controller source set,
creates one isolated test workspace, and writes the private bootstrap atomically
inside the app container. It publishes mode-0600 `ready.json` with only `caPath`
and complete `documents` URLs for `CV-A.pdf` and `CV-B.pdf`; the certificate is
below the private work directory. The caller passes those URLs and the test ID to
the iOS UI test. The launcher polls the unchanged sixteen-stage file controller
and writes sanitized mode-0600 `result.json`. `ok: true` requires all sixteen
verified checkpoints, zero dispatch and completed owned-resource cleanup. Signals
stop the launcher through that cleanup path. Checkpoint originals remain under
`control-<testID>` for comparison with the XCTest attachments.

## Boundary

`runtime.mjs` calls the current `createHostedApplicationHandler` with real isolated
D1/R2 and the existing provider adapter. The adapter is explicitly `mode: test`;
the real capability envelope remains `liveEnabled: false`. Both current native
clients permit preparation in test mode. There is no live-capability rewrite and
no second implementation of the profile, PDF, saved-job, preparation or attempt
ledger.

The only simulated inputs are one fictional initial identity edge, the fixed
catalog/provider GET responses, and explicit `open`, `closed` or `unavailable`
provider state. Closing removes only the second fictional posting from the board
and returns a real 404 for its posting GET. Unavailability returns 503. Controls
expire only this fixture's discovery cache, retaining prior rows so the actual
handler decides stale/partial behavior. They never edit jobs, profile revisions,
attempts or follow-ups.

The private initial `provision()` operation runs the actual account, pairing and
native-session endpoints once. It rejects an existing workspace and asserts the
result has a completely blank revision-zero profile, no PDF, no jobs and no
attempts. The real returned token is written only to a mode-0600 private connection
file. Subsequent native routes preserve their original Authorization header and
are authenticated by the actual native-session lookup. Caller browser identity,
cookie and control headers are rejected.

`contract.mjs` admits only GET status/workspace/receipts, PUT profile, POST
jobs/prepare, and GET discovery sources/search. Account, pairing and private
control paths are not exposed by the bridge. Both native and browser submit and
advance paths are explicitly refused before reaching the handler. Provider POST
and all real outbound requests independently fail. The combined proof requires
zero dispatch/approval counts, only ready test attempts, no application IDs and
the real host outbound counter. A Worker-only ledger observation is explicitly
incomplete without that host observation.

## Integration boundaries

1. Freeze every actual source input, migration and lockfile. The input map must
   cover the entire Worker build dependency closure plus this support, the fixed
   PDF and existing certificate factory. Build the Worker offline, review its
   hash, then provide that expected hash to `createNativeJourneyHarness`.
2. Choose a new private state directory outside the repository. The harness
   refuses existing state, claims an exclusive owner receipt, disables optional
   Cloudflare metadata/telemetry, isolates D1/R2/resources and blocks real outbound
   fetch. The opt-in launcher runs its migrations and single provision call.
3. Call `startNativeJourneyBridge` with a prechecked port and a cancellation signal.
   It binds only 127.0.0.1. Its certificate comes from the existing isolated CA
   factory and covers the iPhone loopback address and Android emulator host alias.
   It never installs trust. The owned-device wrapper handles that limited trust
   operation without changing the Mac's trust store or app production transport
   policy.
4. Put the returned transport capability and real native connection only in
   private fixture adapter configuration. The bridge capability limits access to
   this local transport; it grants no application identity. Native adapters must
   send the actual method, route, JSON and bearer token without replacing response
   data or capabilities. The native adapter and test class live in the iOS tree.
5. Deliver the two document paths to the real OS document-selection flow. They
   serve exactly the existing 609-byte synthetic PDF, SHA-256
   `fccbd3962e482d8b24bea10c69ec047e0879cc55cf3c3b3222909bd89108b86a`,
   under **CV-A.pdf** and **CV-B.pdf**. The document nonce is separate from every
   credential; these paths never carry native or bridge tokens. iPhone Safari
   Share/Save-to-Files feasibility still requires the owned-device observation.
6. Use actual UI actions to enter contacts, search/save, select A, save, prepare,
   select B with identical bytes, save, record a follow-up and restart. Setup must
   not seed these final states. The handler's immutable attempt snapshot supplies
   the historical A filename/revision. Local native follow-up and full process
   restart evidence must come from the real native persistence, not this server.
7. After requests settle, retain `bridge.evidence()` with original UI and native
   storage receipts. Its request log contains only fixed paths/methods, status,
   byte count, body hash and token-presence Boolean. It contains no bearer, pairing
   code, raw body or private request URL. Evidence never establishes UI acceptance
   by itself. The application ledger and original required native suite remain
   separate from this bounded journey.
8. Close the bridge, then await harness disposal. Only its own sockets, Miniflare
   resources and matching owner receipt are closed. All source pins, private
   connection/state, logs and originals remain retained. There is no signal-based
   process kill, automatic retry, stale-owner reclamation or production cleanup.

The pure `contract.test.mjs` file imports no harness or handler. It checks exact
routes, denied submission paths, separate token authority, unchanged native
authorization, identity-header rejection, UTF-8 body bounds, unchanged test
capabilities, blank initial state and complete zero-dispatch evidence. The local
launcher smoke verifies isolated startup, synthetic PDF delivery and signal cleanup.
Actual native chooser behavior requires the separate XCTest run and its attachments.
