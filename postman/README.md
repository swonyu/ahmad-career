# Submission contract checks

These files use the exact official Postman API-engineer workflow. The companion
is the real application under test; only its Lever HTTP dependency is simulated.
All fixture applicants, postings, credentials and receipts are visibly synthetic.
No request in this suite submits to a real employer.

The maintained application contract is
[`docs/Verified-Applications-Contract.md`](../docs/Verified-Applications-Contract.md).
The provider contract is [Lever's official Postings API](https://github.com/lever/postings-api).
The collection and fixture expectations must change with that contract. The
collection refuses to mutate a server unless its status reports `mode: test` and
`liveEnabled: false`, and restricts its effective base URL to loopback.

## Run locally

Use Postman CLI 1.90.0 or later and a Node version supporting `node:sqlite`.
Run from the repository root. No Postman login, workspace or cloud upload is
needed:

```sh
node postman/fixtures/run-acceptance.mjs
```

If the CLI is outside PATH, set `CAREER_POSTMAN_CLI` to its absolute executable
path for this command. The runner starts the dependency simulation and the real
companion on loopback, uses a fresh temporary database and a current fixture
requirements manifest, supplies a one-use synthetic phone pairing code, runs the
collection with event reporting disabled, and stops only the processes it started.
It prints the result and a temporary report directory. The default ports are
4907 and 4908; `CAREER_FIXTURE_MOCK_PORT` and `CAREER_FIXTURE_PORT` can select
other distinct loopback ports. Occupied ports cause failure rather than takeover.

For an isolated structural check:

```sh
postman collection lint postman/collections/verified-applications
```

The underlying simulation and app can also run in separate terminals using
`postman simulation run postman/simulations/lever/lever.sim.yaml --port 4907
--output ndjson --no-history` and `node postman/fixtures/start-companion.mjs`.
Use the runner for the complete collection: it provides the temporary pairing
code without storing it in repository files.

## What the evidence can establish

The collection exercises private session bootstrap, Origin/CSRF protection,
blank applicant defaults, versioned profile/CV saves, a worldwide manual
opportunity, supported posting import, immutable review, rejection of a forged
client receipt, automatic dispatch, a valid provider ID, uncertainty when the ID
is missing, replay protection, receipt redaction, multipart PDF transmission, native one-use pairing, bearer-session isolation and rejection of unpaired/invalid native access.
The local mock exposes sanitized test-only observations to confirm actual POST
counts. This control endpoint is not a Lever API feature.

The mock also models a server error, delayed response, a single rate-limit
response, definite rejection and redirect. See `fixtures/jobs.json` for their
IDs. These are available to the companion integration tests; the initial
collection concentrates on confirmed and uncertain outcomes. It does not assert
that those defensive failure models were observed against real Lever servers.

Passing these checks proves application behavior against the modeled protocol.
It does not establish live provider acceptance, employer authorization, native
phone UI behavior or production readiness. Real integration keys are scoped to
authorized employer sites, and current standard-field requirements must be
reviewed before live automatic submission. Custom-question requirements cannot
be inferred from the public Postings API.

## Workflow recovery evidence

On 16 November 2026, the official `postmanlabs/postman-plugin` API-engineer,
API-documentation, API-testing, API-discovery, API-mocking, API-simulation and
collection-schema-v3 guidance was read. The CLI was downloaded from the official
endpoint referenced by Postman's inspected installer. The macOS binary passed
Apple-anchored signature verification for Postman Team `H7H8Q7M5CK` and reports
version 1.90.0. An isolated `CI=true postman init --json` completed locally with
`cloud.skipReason: ci`; no workspace or account was created. No global plugin
installation, global instruction modification or shell startup change was made.

Postman status reported signed out, so authenticated owner-mock searches and
Context Graph discovery were skipped as the official skill instructs. Orbit's
documented unauthenticated discovery call returned HTTP 403 and yielded no
integration resource IDs. The current official Lever documentation supplied the
provider contract instead. This is a tooling/discovery limitation, not evidence
that a live integration exists.

See `verification.json` for checks actually executed. Keep mocked evidence
separate from live evidence, and update the adjacent simulation context after
meaningful application-through-mock runs.
