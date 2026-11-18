# Hosted SSR integration — 18 November 2026

## What this checkpoint contains

This isolated integration is based on the sealed, pushed hosted checkpoint `28f1f11614beb9739d89df9e733a232adcc3e0bd`. It applies the publisher's frozen React/esbuild SSR migration from its dirty `a17999ce9f24d1e8c94a38c03dcda68101db4507` checkout, plus the public connector and PDF worker boundary correction reviewed in `f6f10f9581116b613fc2ed2f45653daa7dacb788`.

The latest hosted Saved filters, recovery ownership, Keep editing visibility, separated record actions and guarded export focus remain in the base. In `PhoneApp.tsx`, integration changes only the three existing hook-directive namespaces required by the migrated lint plugins. The current CSS and recovery harness are byte-identical to the sealed base. All existing service, OAuth, account, provider, storage and discovery handler sources remain unchanged. The existing five tabs, English/Arabic UI, deployment identity, DB and BUCKET bindings and Drizzle migrations are preserved.

The original hosted and publisher SSR working trees were not edited. The publisher snapshot contains 38 changed entries: 35 present files and 3 deletions. Its tracked patch, original file hashes and exact integration provenance are included here; complete frozen untracked source copies remain in the local evidence directory. A single extra blank line at EOF in imported `app/chatgpt-auth.ts` was removed after `git diff --check` identified it. Source-sensitive gates were then rerun.

## Actual execution and results

All commands ran in the isolated hosted directory with Node **24.22.3**, npm **11.20.0**, and its checked-in lockfile. The initial source-sensitive run and final run are both retained; they are not added together as extra test coverage.

| Gate | Observed result |
| --- | --- |
| Ordinary `npm ci` | Exit 0; 533 packages installed; no command flags, `ignore-scripts=false`, no omitted dependency categories |
| Lifecycle execution | npm's actual debug log records esbuild and workerd postinstall execution, both exit 0 |
| Full `npm audit --json` | Exit 0; 0 info/low/moderate/high/critical findings across 632 dependency entries; no omission or audit suppression flags |
| Typecheck | Exit 0 |
| Strict migrated lint | Exit 0; 188 files, 85 configured rules, 0 warnings and 0 errors |
| Existing `npm test` | Exit 0; 326 main Node tests and a separate 6 PDF parser tests; existing service, auth, discovery, phone and vault scripts also complete |
| Real local D1/R2 worker acceptance | Exit 0; 17 actual workerd requests; 0 real employer requests |
| Browser API and pairing tests | 14 passed, 0 failed/skipped/cancelled |
| Production build | Exit 0; 21 assets, self-contained Worker, 5,768,585 bytes |
| Public boundary and packaged SSR acceptance | 17 passed: 6 public-input boundary cases and 11 actual packaged-Worker SSR cases; 0 failed/skipped/cancelled |
| esbuild PDF browser fixture builder | Exit 0; 6 synthetic PDF files, source-hash checked actual PhoneApp handler extraction and one same-origin module worker |
| Whitespace validation | Source/workflow `git diff --check` passes after the bounded EOF cleanup; raw log and patch whitespace is preserved byte-for-byte |

The production Worker SHA-256 is `9a09b95840c669de91e365e289a465e44d585c8cbbb23d89f0a1173661f83633`. The complete build manifest binds the compiled output to current source hashes, public bytes, MIME types and PDF worker URL. The final gate chain completed at `2026-11-18T07:21:53.953197Z`.

The npm install printed deprecation notices for existing esbuild-kit packages and an advisory allowScripts notice for esbuild, fsevents and workerd. The warning was investigated against the installed npm implementation and its actual debug log: this policy reports unreviewed scripts but runs them. No allowScripts policy was changed, no all-scripts bypass was used, and no scripts were disabled. The recorded esbuild/workerd lifecycle completion closes the earlier publisher bootstrap evidence gap, whose install used `--ignore-scripts`.

The final source map contains 261 hosted/workflow files. During final gates, only the four expected generated verification JSON reports changed; application, build, test and dependency source hashes remained stable. Package and lockfile root dependency definitions agree. Next, Vite, Vinext, React Server Components tooling and eslint-config-next are absent from the migrated lockfile.

## Lint compatibility scope

The original ESLint effective configurations were evaluated read-only for PhoneApp, Worker, service MJS and a vendored UI file. All 1,174 global definitions match exactly. Normalized active rule mappings have no severity differences. The only absent active rules are the two documented Next router obligations, which no longer apply to ordinary anchor navigation and location assignment. The `no-img-element` exception is scoped to the two existing unoptimized local images; other accessibility rules remain active. Existing vendor exceptions remain scoped.

This is configuration coverage and bounded behavioral evidence, not a claim that two parsers and every rule implementation are universally equivalent. Identical synthetic sources exercise conditional hooks, missing effect dependencies, invalid ARIA values, missing JSX keys, unused TypeScript values and unused disable directives. Both engines reject all six under the strict gate, with the expected diagnostic family; both accept the valid control. Warning-only cases return failure under the candidate's zero-warning policy. The source fixtures, original diagnostics and candidate JSON diagnostics are retained.

## CI and release boundaries

The required hosted CI job still performs ordinary `npm ci`, typecheck, the full existing test chain, real D1/R2 and browser API/pairing tests, build and full audit. Its obsolete direct ESLint invocation is replaced by the actual strict `npm run lint`. Build is followed by `npm run test:ssr`, which includes both the reviewed public-input negatives and packaged runtime assertions. No CI run was dispatched by this lane. The integration branch does not match this workflow's push-trigger branches.

The current PDF browser artifacts are available under the external evidence directory as `pdf-browser-dist` and `pdf-browser-fixtures`. This lane built those artifacts; it does not claim a browser selected them or completed the cancellation/account-change flows. Fresh browser hydration, encrypted-vault reload, actual download focus, live providers, native device acceptance, deployment and store release remain separate delivery states for the coordinating owner. No live employer request, application submission, deployment, native build, CI dispatch or store action was performed here.

## Evidence layout

`gate-results.json` contains the initial install/audit and ordered source gates. `final-gate-results.json` contains the refreshed final source checks. Raw stdout/stderr files are kept for every command. `source-final.json`, `source-stability.json` and the included source maps bind the outcome to this tree. `publisher-before.json`, `publisher-tracked.patch`, `reviewed-public-boundary.patch` and `initial-integration-receipt.json` record provenance. `original-owner-preservation.json` records the final owner-preservation check. `lint-compatibility/` contains the bounded comparison cases and diagnostics.

All full raw logs, per-command before/after source maps, the ordinary npm debug log, frozen publisher source copies and generated PDF browser artifacts remain at:

`/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/resume-20261118-d60d62a70f26/hosted-ssr-integration`

This directory is a bounded text evidence selection. Its manifest records exact hashes; generated production bundles and synthetic upload binaries are deliberately outside the source/deployment tree.

Raw npm/Oxlint output and original patch context contain emitted trailing spaces or terminal blank lines. They are retained as evidence bytes, not reformatted to satisfy a source whitespace check. Source, workflow and authored README whitespace checks pass. The complete staged raw-output diagnostic remains in the external evidence directory.
