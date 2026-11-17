# Publisher ToolchainProof288: independent read-only review

Observed 17 November 2026, 22:51–23:00 UTC. This review concerns the existing publisher-owned dependency proof. It is not a new dependency lane, an implementation, or an executed validation.

## Decision

**Preserve this as an unfinished dependency-graph feasibility proof. It is not yet a working replacement or an integration-ready patch.** The proposed lock genuinely removes the three Picomatch resolutions and their principal framework/tooling callers. No package rename, alternate tarball identity, advisory suppression or reduced audit policy appears in the reviewed diff. The separate functional gate is presently unmet: the unchanged installer, build runner, worker, lint configuration and several application imports still require removed packages.

No current proof execution receipt or audit result was found in the bounded locations reviewed. Do not call the proposed graph zero-audit, buildable or accepted. Older checked-in logs and run 43 apply to earlier source/dependency inputs.

## Ownership and source identity

- Publisher **d57f4cd77813** owns this proof and native integration/build/CI/store decisions.
- Development **5bc6158967e8** retains the established production dependency/audit decision lane. No owner transfer was observed.
- Worktree: `/Users/saleh/Library/Caches/Publishing-Continuation-20261117-d597fc87411f/Recovery-d57f4cd77813/SourceRecovery-20261117T1920Z/Career-ToolchainProof288`
- Branch: `recovery/toolchain-proof-20261117-d57`
- HEAD: **2884188263f3dad5753da7b2e507f6ba55e30eb0**
- Status at 22:51 UTC: only `hosted/package.json` and `hosted/package-lock.json` modified.
- Diff size: package.json +7/-8 lines; package-lock.json +4078/-7042 lines.
- Both proposed file hashes remained identical in the later readback.

| Input | HEAD SHA-256 | Proposed SHA-256 |
|---|---|---|
| hosted/package.json | 7e02d347153988f4e9180e6348ab4fa405ba98cae1cc85abd4c1ea7e5da85e7a | 3a9d133111d0a01b699f8040ee4764d4fdd644c106b65fbb69202634cd24182d |
| hosted/package-lock.json | 2512e3bd6aebfc4377bbe036d3cf606c27e33613b35c8c58d28f0f3a0d596c99 | a83a723aa9fb56015617ba5c95e972bb2661d9cb9eae9dc5207a5280b1c66fff |

Proposed sizes: package.json **3,261 bytes**; lock **360,607 bytes**. Lock format remains version 3.

## Actual proposal

The only changed top-level package.json fields are dependencies and devDependencies. Scripts, engines and overrides remain unchanged.

| Direct dependency removed | Version |
|---|---|
| next | 16.4.6 |
| @cloudflare/vite-plugin | 1.69.1 |
| @vitejs/plugin-react | 6.0.2 |
| @vitejs/plugin-rsc | 0.5.39 |
| eslint-config-next | 16.4.6 |
| react-server-dom-webpack | 19.3.1 |
| vinext | 1.4.6 |
| vite | 8.3.8 |

| Direct development dependency added | Version | Existing lock status before proposal |
|---|---|---|
| esbuild | 0.28.2 | Already transitive at same version |
| miniflare | 5.20261110.0-beta | Already transitive at same version |
| eslint-plugin-import | 2.32.0 | Already transitive at same version |
| eslint-plugin-jsx-a11y | 6.10.2 | Already transitive at same version |
| eslint-plugin-react | 7.37.5 | Already transitive at same version |
| eslint-plugin-react-hooks | 7.1.1 | Already transitive at same version |
| oxlint | 1.94.0 | Newly added |

Lock package entries, including the root entry, move from **831 to 632**: **219 removed, 20 added, 38 existing entries changed**. The 20 added entries are Oxlint and its 19 platform bindings. No existing package changes version in this lock diff. All nonempty resolved URLs in the proposed lock use the public npm registry; no file/git/renamed-fork resolution was found.

The actual removed resolutions include:

- `node_modules/picomatch` 2.3.2 and its Micromatch 4.0.8 caller.
- `node_modules/tinyglobby/node_modules/picomatch` 4.0.4 and Tinyglobby 0.2.17.
- `node_modules/vite/node_modules/picomatch` 4.0.7 and Vite 8.3.8.

This establishes removal from the proposed dependency graph. It does not establish that every remaining package contains no equivalent embedded vulnerable implementation, or that the application can operate with that graph. Neither a dev flag nor a negative literal-name search is a substitute for caller/bundle analysis.

## Concrete unresolved functional gates

These are source-confirmed missing-dependency paths. No failing command was executed by this review; the predicted failures are explicitly static findings.

| Gate | Current source dependency | Consequence for proposed lock |
|---|---|---|
| Standard install | `hosted/scripts/install-ci.mjs` checks local Vinext executable after npm ci | The unchanged installer reports unavailable Vinext and sets exit 69 if the graph is installed without it |
| Managed Linux install | `hosted/scripts/install-ci.sh` reads resolved, integrity-pinned Vinext from the lock | The unchanged script has an explicit failure/exit 65 path when the removed entry is absent |
| Development and build | `hosted/scripts/run-framework.mjs` imports Vite CLI in managed Linux or Vinext CLI otherwise; managed build delegates to build-verified.sh | Neither CLI is supplied by the proposed graph |
| Managed build | `hosted/scripts/build-verified.sh` requires and invokes local Vinext | Its current executable guard cannot be satisfied by the replacement graph |
| Framework configuration | `hosted/vite.config.ts` imports Vinext/Vite and dynamically imports Cloudflare Vite plugin | All three are removed; replacement bundling/hosting configuration is not present |
| Worker page rendering | `hosted/worker/index.ts` imports `vinext/server/fetch-handler` | API handlers alone cannot replace the unchanged page-rendering fallback |
| Application framework imports | Locale/layout/auth read Next headers; auth uses Next navigation redirect; artwork and SiteFrame use Next Image | These runtime contracts need a real equivalent implementation; deleting only metadata/types is insufficient |
| Typechecking | next.config.ts and page/layout metadata types use Next; tsconfig still names the Next plugin | Type resolution and runtime import replacements have not been demonstrated |
| Lint | eslint.config.mjs imports removed eslint-config-next/core-web-vitals and /typescript | Adding standalone plugins or Oxlint does not wire them into the unchanged ESLint command/config |
| PDF browser fixture | tests/build-pdf-browser.mjs resolves and imports Vite build | Its current fixture build path also needs a real replacement or retained compatible tool |
| Start/hosting output | npm start expects dist/server/wrangler.json | The proposal does not yet supply the builder that creates that deployment output |

There is no new build/worker implementation in this diff. Removing TypeScript ESLint and its parser alongside eslint-config-next also requires an explicit check-coverage decision: preserve relevant React/hooks/accessibility/import/TypeScript checks through working configuration. Merely having plugin packages installed does not preserve the old rule set.

For any substantive migration, preserve existing routing, English/Arabic initial language and RTL, assets/CSS/images, metadata, hydration, authenticated page recovery, verified request identity, no-store/security headers, request-scoped connector binding and Cloudflare storage/binding behavior. These are concrete responsibilities visible in the current source; they are not a claim that the candidate has already regressed them.

Key unchanged source hashes:

| File | SHA-256 |
|---|---|
| hosted/scripts/run-framework.mjs | 9bf9f41a29314cabe0238b8e9c540ec3f7b5a6adafc7c8fb6c3940722d061dca |
| hosted/scripts/install-ci.mjs | 4a5a92d60a08d0ba54effd8373da2da06284312c55b767287c68a0bec7200da7 |
| hosted/scripts/install-ci.sh | 10d8764a61be50351dc3496e13588270de7956f0aa5f1189c49cabb2d89fe5c0 |
| hosted/scripts/build-verified.sh | 2ae5329ac860076070c9217a43106a15cb5ecf907a0f7baeb9ef903f76b53c68 |
| hosted/worker/index.ts | c82a674ffc6fcebef3b1c48d577f0ec5b28a4a4c2b17462c50a7c0d1708ac09e |
| hosted/vite.config.ts | 22ff558b1636d251e076f74c1697c7166079861667af10922d6bc505cb8f8290 |
| hosted/eslint.config.mjs | eeda7faabe9560fa9fdb26675b0011fa78461ca7061989732f5da9245b87e315 |
| hosted/tsconfig.json | a4c1cc83b63ef9d39641d3babaefffa063dccbbc93338e18017b5013d713163e |

## Executed evidence and limits

This reviewer executed only read-only Git, file/hash/JSON analysis, filename discovery and scoped process inspection. Git HEAD/branch/status/diff reads exited 0. No package-manager, Node test, timing probe, application build, native build, CI dispatch, deployment or store operation was run.

The proof tree did not have a node_modules directory in the 22:51 inventory. No new proof result was located in:

- The proof tree, including ignored files, excluding .git/node_modules/.env.
- The provided publisher Recovery directory and parent cache evidence filenames.
- Adjacent CombinedR2 publishing/tests and EmptyState-UI288 publishing receipt locations.
- A bounded recent-name inventory of /tmp and relevant cache entries.

The full no-ignore proof filename scan found 309 matching historical files. None was modified after the checkout's initial 22:35:46 file population; these do not qualify the proposed package/lock changes from 22:35:46.743 and 22:35:54.529. The early default-ignore search was corrected using --no-ignore. This is a bounded discovery statement, not proof that no terminal output or receipt exists anywhere.

No publisher-authored purpose or executed-result statement for this exact proof was found in the inspected current PR 1 comments. The latest relevant root coordination comment, 6963355309, identifies it as an owned proof under review and makes no pass claim. The native reviewer separately confirms its run 43 hosted log predates this proof. Do not reuse run 43's 289/289 and build success as validation of these changed inputs.

A candidate process matched the path text during inventory, but executable/cwd inspection identified a Desktop Commander node process; it was not established as an installer or builder. No process was interrupted.

## Recommended non-overlapping next action

1. Send this exact review to the current publisher/dependency owners through root coordination. Ask them to state whether the branch is only graph/audit feasibility or the start of a full framework replacement. Preserve the current dirty proposal.
2. If only feasibility, retain its exact audit command/output and package/lock hashes as such. Do not integrate it as a functioning security remedy.
3. If pursuing replacement, the existing owner should complete the concrete installer/build/worker/framework/lint/PDF fixture contracts above in the same isolated lane. Keep source behavior and raw audit status separately visible.
4. Only after that source is coherent should the owner run the project-pinned **Node v24.22.3**, reproducible clean installation, resolution checks and the unchanged full audit, then typecheck, strict lint, full hosted tests, build, worker/API/transport and actual EN/AR hosted account/search/application regressions. Record exact source/lock hashes and actual command exits. Schedule native reruns through the publisher; do not launch competing builds.
5. If a broad framework migration is disproportionate or cannot preserve required behavior, retain the original dependency tree and continue the bounded upstream/caller remedy in the authorized development lane. Open upstream PR257 is an algorithm candidate, not a released compatible fix or proof of capture semantics. It is a different route from this graph removal and should not be mixed into this proof without a deliberate owner decision.

The latest direct registry/advisory review is in README.md/observations.json beside this report: Picomatch latest 4.0.7, GitHub High <=4.0.7 with no patched release; Snyk's dispute/revocation does not close GitHub/npm status. PR257 is open at 4e4892e0ac6c374ec3d9e4dc430101da9a20a37b. No new claim about a later release is made here.

Separate acceptance dimensions remain: **algorithm repair**, **actual caller exposure**, **application behavior**, and **raw scanner status**. Real dependency replacement can be a valid remedy when all required behavior and gates are established. Graph deletion alone has not established that result.

Good Spender remains excluded. No production source or other owner's files were changed by this reviewer. The original Career Finder cutoff remains 18 November 2026 22:26:12 UTC / 19 November 01:26:12 Riyadh.
