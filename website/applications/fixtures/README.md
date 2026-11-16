# Native HTTPS acceptance fixture

This fixture connects the real phone network client to the actual application service over TLS and then to the existing synthetic Lever HTTP dependency. It never loads a live connector, contacts Lever, or changes system certificate trust. Every receipt is marked `evidenceMode: "test"`.

## Prepare the isolated certificate

Run from the repository root with Node 22.13 or newer and OpenSSL available:

```sh
node website/applications/fixtures/tls-fixture.mjs \
  --runtime-dir /absolute/private/career-native-fixture --init-only
```

The runtime directory must be outside the source tree. It is private and contains a three-day CA and TLS key, a public `ca.pem`, and later the isolated ledger. No private key belongs in Git or an APK. The certificate covers only `10.0.2.2` (the Android emulator host alias) and `127.0.0.1` (the local diagnostic client).

The Android **acceptance** build may copy only this public CA into a generated resource and trust it only for `10.0.2.2`. Normal debug and release builds must retain system roots and reject this certificate. No permissive trust manager, hostname-verifier override, cleartext exception, device-wide CA installation or public hosting is needed. Use a separate acceptance application ID so it cannot replace the user's preview app or read its saved data.

## Run the fixture

```sh
node website/applications/fixtures/tls-fixture.mjs \
  --runtime-dir /absolute/private/career-native-fixture \
  --port 4943 --mock-port 4944
```

Both listeners bind exclusively to `127.0.0.1`. The phone's origin is `https://10.0.2.2:4943`, and the service checks that exact Host without rewriting it. The constructor permits this emulator origin only with `NODE_ENV=test`, `testOnly.enabled`, an explicitly local mock upstream and `testOnly.allowEmulatorTLS`. The normal server has no switch that enables this exception.

The ready event prints the control-file path, never the pairing code or private key. The private `control.private.json` file contains `origin`, `pairingCode`, `pairingExpiresAt`, `caPath`, `dataDir`, a synthetic PDF, and `jobs` URLs for success, no receipt, server error, timeout, cooldown, rejection and redirect. The code is single-use and valid for five minutes. Start the service shortly before running instrumentation. To pair another phone or simulate reauthentication into an existing synthetic workspace, the normal local `applications/pair.mjs` operator command can issue another code against `dataDir`.

Each fixture start gets a fresh ledger and fresh mock request counters while reusing its short-lived CA, so an acceptance APK need not be rebuilt for every run. An existing listener on either port causes startup to fail. The mock's observation endpoint is separate loopback HTTP and never exposed through the TLS application listener. Stop with SIGINT or SIGTERM; the fixture stops only its own child process and records sanitized multipart/request-count evidence in its run directory. Remove the private runtime directory after acceptance work finishes.

## Exercise the boundary

```sh
node website/applications/fixtures/tls-check.mjs
```

This diagnostic uses normal TLS certificate and hostname checks, authenticates with a pairing code, saves a single-name profile and PDF, imports a posting, prepares a review with marketing declined, approves it, polls the real durable receipt and replays approval without another POST. It also checks an untrusted CA, a wrong Host, timeout uncertainty after reauthentication, and recovery/continuation of a rate-limited plan. It only claims service/TLS evidence. Separate Android instrumentation must prove the real native client uses this path successfully and that the ordinary preview build rejects the fixture CA.
