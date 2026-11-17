# Career Finder — publishing and owner-acceptance handoff

**Status: engineering candidate; native corrections need fresh acceptance.** This document separates source acceptance, hosted availability, provider activation and store distribution. It is not permission to bypass a remaining gate.

## Source and ownership

| Item | Exact state |
| --- | --- |
| Development branch | `career-finder-phones-verified-apply-20261116` |
| Latest executed phone revision | `b07337632b002aafa05a04c5843b9f971cabca26` |
| Executed revision tree | `1135edecf4dd3385a41561587ed84fc6cf1727b1` |
| Current full CI | [Run 44020929694](https://github.com/swonyu/ahmad-career/actions/runs/44020929694); both service jobs and iPhone logic/unsigned Release passed; iPhone UI cancelled after the 25-minute deadline (8 passed, 1 failed, 1 interrupted, 3 unstarted); Android executed 97 ordinary cases with 95 passing and two failing; dedicated TLS cases not reached |
| Hosted source | `1135a3270435d3719c6f62f1a2e3a53e2c040146`, tree `379709814adf9fad26d4c17457b0b942d290c029`; the repository's 186 tracked hosted files are byte-identical |
| Hosted deployment | Public version **7**, deployment `appgdep_6afbcfe3a03881918b131992225ded31`, succeeded `2026-11-17T03:54:40.015318+00:00` |
| Protected release branch | `app-store/career-workspace-copy-20261117`, last verified `fd9c5399f2b7001b234b3b86bf72e2b36b5114c1`; unchanged by this continuation |
| Publishing owner | The separate [App Publishing continuation](https://chatgpt.com/c/6afbbd6f-cfa0-83eb-a63d-dc3fbb646fdd) owns shared signing, store records and release integration |

No shared Mac build, signing, store upload, submission, release tag or release-branch write was performed here. An isolated Git transfer used existing SSH authorization; it changed only the development branch, without a force push or new credentials. The shared build coordination path remains `/tmp/dot-ios-build.lock`; an absent lock does not reserve that machine. Obtain the publishing owner's scheduling acknowledgment before using it.

The release owner should integrate the tested development changes while preserving the release branch's own wording changes. Its earlier successful run on `fd9c539` does not contain or verify the later workspace/PDF isolation, durable Stop and provider/account changes. The full [continuation review](Continuation-Review-2026-11-17.md) records 28 finding groups and their evidence.

## Material behavior changes

- Each person starts with a blank profile. Country, role and work-mode preferences remain optional; discovery is a selected-board service with explicit coverage limits.
- Phone profiles, PDFs, private records, discovery drafts and recovery data stay bound to the relevant workspace. An account change cannot silently copy a previous person's profile or chosen PDF.
- Stop intent survives failed requests, expired sessions, restarts and re-pairing. Old approvals remain held until deliberately resolved. Provider cooldown and uncertain-response evidence cannot be erased by making a new review.
- Readable, credential-free exports and explicit import/recovery preserve records and conflicting history. Imported or self-entered outcomes do not become verified employer receipts or restored application approval.
- PDF selection/upload uses bounded readability checks and preserves the previous file on failure. Unused hosted PDFs have guarded deletion and recoverable failure states.
- Google OAuth and basic LinkedIn OIDC connection code are deployed with stable subject ownership, explicit linking, minimal scopes, bounded sessions, replay protections and account deletion fences. They remain inactive until the owner configures the provider applications.
- The interface distinguishes loading, validation, storage failure, cancellation, genuine confirmation and uncertainty. Screenshot-driven fixes improve success-message styling and large-text navigation without reducing text scaling or removing decisions.
- Android target-country selection is owned outside the lazy profile list and cannot apply a previous workspace's draft. The private-note layout uses the full available width, with strengthened final-line checks.
- The Android runner uses its own local ADB port and fresh emulator. Gradle is pinned to the free, security-patched **8.14.7** distribution with the official SHA-256; application dependencies and acceptance cases were retained.

## Evidence and limits

The preceding candidate `66669da8bd34943ad3fc9dae45e9a8288ff0d9e7` passed all **13 iPhone UI cases**, **120 boundary checks**, **503 lifecycle assertions across 77 scenarios**, **43 discovery assertions across 13 scenarios**, the remaining store checks and an **unsigned Release build**. Its Android production/instrumentation compilation and lint passed, but ADB startup prevented instrumentation. Revision b073376 repairs that runner startup and builds/lints on Gradle 8.14.7, then executes all 97 ordinary Android cases with two failures. The prepared four-file Android correction hoists and scope-binds the country picker and aligns note/accessibility widths; it preserves all 97+2 cases and needs its own complete run. The source-bound correction receipt distinguishes inference from observed failure.

The frozen hosted source passed 61 account/application groups, 19 phone groups / 164 Worker requests, 30 authentication groups / 15 auth Worker requests, 26 discovery groups, 64 frontend + 14 browser-transport tests, 33 vault groups, six PDF parser groups and the separate 17-request Worker gate. The complete hosted dependency audit reports zero findings. Companion checks passed 119 HTTP groups, 77 application-state groups and 12 TLS checks. These are scoped engineering tests, not real provider consent or employer acceptance.

Live v7 browser checks observed 50 public jobs, a saved bookmark surviving navigation, a prior synthetic local record surviving reload and the existing Account/Connect pages. Four anonymous production checks verified health and rejection of forged caller-identity headers. They did not upload, change or delete the existing user's cloud profile, PDF, connection codes or records.

Physical-device, VoiceOver/TalkBack and complete multi-account browser acceptance remain open. The cloud browser blocked access to its default-font settings; no enlarged-default-font browser pass is claimed. Native large-text and RTL evidence must remain separately identified by device, OS and commit.

## Owner actions for direct Google and LinkedIn

| Provider | Required setup | Exact callback |
| --- | --- | --- |
| Google | Authorized web OAuth client; `openid email profile`; production branding/domain requirements; managed `CAREER_GOOGLE_CLIENT_ID` and `CAREER_GOOGLE_CLIENT_SECRET` | `https://career-finder-service.jazzy-drake-8323.chatgpt.site/auth/google/callback` |
| LinkedIn | Authorized application with **Sign In with LinkedIn using OpenID Connect**; `openid profile`; managed `CAREER_LINKEDIN_CLIENT_ID` and `CAREER_LINKEDIN_CLIENT_SECRET` | `https://career-finder-service.jazzy-drake-8323.chatgpt.site/auth/linkedin/callback` |

The last observed managed environment is revision **0**, with both direct providers unconfigured. Enter secrets privately in the managed server environment; they do not belong in chat, Git, screenshots, native binaries or account exports. After activation, verify consenting-owner success, cancellation, explicit linking, wrong-account refusal, disconnect, sign-out and recovery. Use isolated test accounts for account export/deletion scenarios. `configured: true` alone is insufficient evidence.

Google's [production authentication guidance](https://developers.google.com/identity/verification/authentication-policy-compliance) requires brand/domain verification. Eligibility of the current shared hosted domain remains unverified. LinkedIn's [self-service OIDC product](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2) grants basic profile connection; its [Talent application integrations](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) are separate programs. No LinkedIn email, full résumé import, job API, legal identity verification or application rights are claimed.

## Supported free paths and distribution gates

The public [phone browser app](https://career-finder-service.jazzy-drake-8323.chatgpt.site/phone), existing ChatGPT account flow with its Google option, manual LinkedIn profile/search handoffs, employer posting links, private records and exports remain the supported alternatives while external integrations are unavailable. A saved LinkedIn URL is distinct from an authenticated connection.

Live Auto Apply remains disabled without an employer-authorized integration and current reviewed requirements. Do not send test applications to real employers. A genuine submitted result requires live employer acceptance and a nonempty application ID; opening a website, recording a manual stage or passing a synthetic test cannot establish it.

No purchases, paid APIs, subscriptions, domain purchases, upgrades, new enrollment payments or automatic paid overages are authorized. Capacity is finite: the service currently caps 250 accounts, five retained PDFs / 25 MiB per account and 4 GiB shared reserved PDF storage, with further record and connection limits. Do not advertise unlimited worldwide capacity or treat an external fee as free.

Store distribution remains with the publishing owner. Preserve existing signing identities and upgrade paths. A fresh CI debug signature is not evidence of compatibility with an installed historical Android preview; do not require uninstalling existing data merely to test a new build. iPhone simulator success and an unsigned build do not provide a signed install or TestFlight/App Store availability. The publishing owner also needs to assess the final login choices against applicable Apple review requirements.

Once the final exact-source CI and artifact review finish, update this handoff with terminal results and send it to the publishing owner. Record provider activation and physical-device/store gates separately. External approval dates remain outside the engineering estimate.
