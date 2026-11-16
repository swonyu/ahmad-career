# Career Finder application service

This dependency-free Node service supplies the native iOS and Android clients with personal profiles, PDF résumé storage, opportunities, reviewed submission plans and provider receipts. It uses Node's built-in SQLite module (Node 22.13 or newer; tested with Node 24.22).

## Start locally

From `website/`, run `node applications/server.mjs`. The API binds only to `127.0.0.1:8780`. `CAREER_APPLY_PORT`, `CAREER_APPLY_DATA_DIR` and `CAREER_APPLY_ORIGIN` configure the local port, private ledger directory and exact authorized request origin. No connector is enabled by default.

The native clients require HTTPS. A future operator-controlled HTTPS gateway must forward to the loopback service and preserve the configured exact Host. For example, the service's authorized origin can be `https://apply.example.com`, with the gateway forwarding to `127.0.0.1:8780`. There is no wildcard Host, no forwarded-header trust, and no bundled TLS bypass. This change does not deploy that gateway, establish a public service, or supply an employer credential.

Do not expose the Node listener directly. Public hosting also requires operational authentication, backups, abuse controls, privacy/support publication and appropriate operator review. Anonymous browser creation is disabled when the authorized origin is HTTPS; phones require explicit pairing.

## Pair a phone

After the service has initialized its private ledger, the operator runs:

```sh
node applications/pair.mjs --data-dir /absolute/private/application-data
```

To connect a second device to an existing workspace, append `--workspace EXISTING_WORKSPACE_ID`. Omit that option for a new blank workspace. The code is private, single-use and expires in five minutes. It is never issued through an unauthenticated HTTP endpoint.

The phone posts `{ "pairingCode": "THE-CODE" }` to `/api/apply/session`. Success returns `sessionToken`, `workspaceId`, `expiresAt` and the profile. The token is stored in the phone's secure credential storage. Subsequent requests use `Authorization: Bearer TOKEN`; they do not need browser Origin or CSRF headers. The server stores only the token's SHA-256 digest. Tokens expire after 30 days. `POST /api/apply/session/revoke` with `{}` revokes the current phone token and preserves application records.

## Authorized Lever connector

`CAREER_APPLY_CONFIG` points to a JSON file outside the static web folder. The configuration contains employer requirements and an environment-variable **name**, never a literal API key. Example structure:

```json
{
  "version": 1,
  "connectors": [{
    "provider": "lever",
    "region": "global",
    "site": "employer-site",
    "apiKeyEnv": "CAREER_LEVER_EMPLOYER_KEY",
    "postings": {
      "00000000-0000-4000-8000-000000000001": {
        "revision": "employer-reviewed-form-revision",
        "reviewedAt": "2026-11-16T00:00:00.000Z",
        "expiresAt": "2026-11-17T00:00:00.000Z",
        "hasCustomQuestions": false,
        "requiredFields": ["name", "email", "resume"],
        "privacyPolicyUrl": "https://example.com/privacy"
      }
    }
  }]
}
```

The example is not a usable employer configuration. An authorized employer administrator must supply the key and accurately reviewed posting requirements. Reviews may remain valid for at most seven days. Unknown/custom questions, missing keys, an unreviewed posting or an expired review prevent dispatch. Global and EU employers are separate configurations.

The supported required fields are `name`, `email`, `resume`, `phone`, `urls`, `comments`, `consentStore` and `consentMarketing`. Consent is never inferred. A required storage-consent field also requires the employer's privacy-policy URL. The Lever API does not expose every custom question, so a public posting GET alone does not establish that a form is supported.

## What verification means

An attempt is saved durably before sending. Only Lever's documented HTTP 200 response with `ok: true` and a nonempty `applicationId` becomes confirmed. This establishes API acceptance, not recruiter review, assessment success or employment. The service uploads actual PDF bytes as multipart form data and records the applicant/profile revision, CV hash, reviewed payload hash, requirements revision and response hash.

Timeouts, redirects, malformed success bodies and ambiguous server failures become uncertain and block automatic resubmission. A crash with an in-flight ledger entry also becomes uncertain on restart. A confirmed or uncertain attempt blocks duplicates by stable workspace identity and normalized applicant email. An explicit 429 records cooldown and permits at most three dispatches on the same approved attempt. Creating another plan cannot bypass the waiting attempt. Stop cancels only jobs not yet dispatched.

Test mode uses a separate ledger marker and local loopback upstream. Every mock attempt/receipt includes `evidenceMode: "test"`. Real connector receipts use `evidenceMode: "live"`. Phone UI must label test receipts separately and exclude them from real application totals.

## Executed local verification

`node applications-check.mjs` runs actual HTTP requests through the real service and a synthetic local Lever upstream. It checks profile/CV validation, exact multipart bytes, sessions and mobile pairing, duplicate handling, approval changes, provider failure responses, cooldown, persistence failures, restart recovery, session isolation and receipt redaction. It makes no live employer POSTs. The formal Postman collection and simulated dependency live under the repository's `postman/` directory.

See `docs/Verified-Applications-Contract.md` for the request/response contract. Local passing tests do not establish live employer compatibility or production mobile deployment.
