# Career Finder — Independent Picomatch Remedy Review

## Outcome and evidence status

**Recommendation:** Keep the dependency gate open. The most useful next repair experiment is a narrowly scoped, pinned patch based on the algebraic collapse approach in upstream PRs #237 and #246, with independent compatibility and timeout tests. Neither proposal is currently an accepted Career Finder fix, and neither should be copied blindly.

Research checked: **2026-11-17 19:25:24 UTC / 2026-11-17 22:25:24 Asia/Riyadh**.

Reviewer: `/root/audit_remedy_research`, independent read-only research and critique lane. Parent/root owns hosted integration and browser acceptance. Development owner `5bc6158967e8` owns package/dependency remediation. Publishing owner `d57f4cd77813` owns native builds, CI/signing and stores. Good Spender is excluded. Original continuation cutoff remains 2026-11-18 22:26:12 UTC / 2026-11-19 01:26:12 Asia/Riyadh; this research does not restart it.

**Execution boundary:** No repository/package changes, installation, application tests, vulnerability probes, builds, native runs, browser control, or external messages were performed by this reviewer. Three short read-only Python/rg processes inspected source/lock data and finished. The later authorized action writes this report only. Proposed checks below remain unexecuted.

## 1. Exact source baseline

- Repository: `/Users/saleh/Developer/career-finder-feed-continuation-20261117-4b851318da2d`
- Branch supplied by root: `continuation/feed-reliability-20261117-4b851`
- HEAD independently read: `ca3d3411d8b5b36fa7093dff782f4a7b931261c7`
- Manifest independently read: `hosted/package.json`, package `career-finder-phone-service@0.6.0`
- Lockfile independently read: `hosted/package-lock.json`
- Lockfile SHA-256: `2512e3bd6aebfc4377bbe036d3cf606c27e33613b35c8c58d28f0f3a0d596c99`
- Root-supplied project verification runtime: **Node 24.22.3**. This reviewer did not execute Node or repeat project tests.
- Root-supplied latest audit result: **19 high entries**. This reviewer did not rerun npm audit and does not treat that supplied count as a fresh execution.
- No root or hosted `AGENTS.md` file was present in the two exact paths checked. The saleh-app-workflow v4.2.1 and its platform/dependency reference were read.

The source inspection is tied to the above HEAD and lock hash, not to whichever integrated branch may advance afterward.

## 2. Current upstream status and disagreement

The retrieved [GitHub advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) is GitHub Reviewed, High, updated 17 November 2026. It lists npm `picomatch <=4.0.7` as affected and no patched version.

The [upstream releases page](https://github.com/micromatch/picomatch/releases) still labels 4.0.7 as its latest release. The npm registry's `latest` endpoint could not be retrieved through the research tool; therefore this is specifically a verified GitHub-release observation, not a separate registry verification.

[Snyk's corresponding advisory](https://security.snyk.io/vuln/SNYK-JS-PICOMATCH-21248802) has been revoked and no longer classifies any package version as affected. It attributes the disagreement to the maintainer's position concerning untrusted patterns. The original maintainer discussion was not successfully retrieved, so that attribution is Snyk's account rather than an independently read maintainer statement.

These sources conflict. Snyk's revocation does not remove GitHub's active reviewed advisory or prove Career Finder's usage is unreachable. Conversely, an advisory label alone does not establish a reachable production denial-of-service path in this application.

Keep three separate conclusions:

1. **Scanner status:** advisory mapping, affected package/version identities and raw audit result.
2. **Source behavior:** exact implementation, relevant grammar/options and demonstrated matching behavior.
3. **Application exposure:** actual call paths, pattern/input provenance, deployment artifact contents and execution boundary.

## 3. Fresh dependency and source observations

| Resolution relative to hosted/ | Version | Immediate dependent | Lock classification |
|---|---:|---|---|
| node_modules/picomatch | 2.3.2 | micromatch@4.0.8 | dev:true |
| node_modules/tinyglobby/node_modules/picomatch | 4.0.4 | tinyglobby@0.2.17 | dev:true |
| node_modules/vite/node_modules/picomatch | 4.0.7 | vite@8.3.8 | dev:true |

Further lockfile edges:

- `micromatch@4.0.8` is required by `fast-glob@3.3.1` and by the `fast-glob@3.3.3` nested under `vite-plugin-dynamic-import`.
- `tinyglobby@0.2.17` is required by `@typescript-eslint/typescript-estree@8.73.0`, `eslint-import-resolver-typescript@3.10.1`, and `vite@8.3.8`.
- Vite 8.3.8 is a direct development dependency in the hosted manifest.
- Existing overrides do not include Picomatch.

A source-name search of existing hosted application, library, script, worker, source and configuration paths found no direct `picomatch`, `micromatch`, or `tinyglobby` references. A separate search with ignore rules explicitly disabled examined 112 built JavaScript/MJS files and found none of the literal names `picomatch`, `analyzeRepeatedExtglob`, or `isSelfRepeatingStarBranch`.

**Limits:** These are literal searches, not whole-program reachability analysis. Minification, dynamic loading, generated imports, tool configuration and build-time input remain material. An initial built-directory search had not disabled ignore rules; it was corrected before reporting the 112-file result. Neither that corrected search nor `dev:true` establishes complete exclusion from the deployed service.

The 19 supplied high audit entries should not be called 19 independently demonstrated exploitable bugs. npm [calculates meta-vulnerabilities through dependency relationships](https://docs.npmjs.com/cli/v11/commands/npm-audit/). Preserve the raw report and identify the underlying advisory and resolution chains separately.

## 4. Strict review of actual upstream candidates

### PR #194 — not a complete remedy

[PR #194](https://github.com/micromatch/picomatch/pull/194) addresses leading-question-mark extglob parsing and a related heuristic. Its author explicitly states that `+(*a)` remains costly and that the broader issue is outside the change's scope. Its presence in the advisory's references does not make it a complete patch. Do not select it merely because the advisory links to it.

### PR #238 — partial literalization with changed semantics

[PR #238](https://github.com/micromatch/picomatch/pull/238) literalizes certain single-branch bodies beginning with bare quantifiers. It intentionally retains bare `+(*)` and literal-prefixed forms such as `+(a*)`. Literalization can change valid matching results. A narrow leading-quantifier heuristic is not a general complexity proof.

**Unexecuted review question:** Exercise preserved forms with failing suffixes in a supervised process, for example a pattern such as `+(a*)c`. A literal prefix does not, by itself, justify a universal conclusion that repeated internal wildcard partitions are harmless. This is a source-informed test proposal, not a reproduced project failure.

### PR #237 — useful collapse approach, additional scrutiny required

- [Conversation](https://github.com/micromatch/picomatch/pull/237)
- [Actual diff](https://github.com/micromatch/picomatch/pull/237/files)
- Commit identified from the page's commit-link target: `1bf0d04563cb9ce568cf36efc5f6b7187d9911d5`

The proposal removes an outer repetition when a restricted star-containing branch can absorb subsequent repetitions. Its tests include the exact positive regression `isMatch("abc", "+(*)c")`.

The diff's branch scanner handles escapes and character classes but does not track quoted-string state; its collapse path does not separately guard capture mode. Its expensive timing assertion runs matching inline and only checks elapsed time afterward. These are source-review concerns, not tests executed here.

The immutable commit URL could not be fetched through the research tool; the full ID came from its observed link target and the PR diff was read. The implementation owner should independently fetch and verify the chosen commit before use.

### PR #246 — narrower v2 adaptation, not full semantic preservation

- [Conversation](https://github.com/micromatch/picomatch/pull/246)
- [Actual diff](https://github.com/micromatch/picomatch/pull/246/files)
- Commit identified from the page's commit-link target: `f03bec2c02e46f063fbfdc161aae1d0f854b2565`

This v2 proposal excludes quotes, escapes, paths, globstars and several complex forms from collapse. It places expensive regression matching in a subprocess with a deadline and includes short differential cases.

It deliberately falls back to literal matching when `capture:true`, which changes results for valid patterns; excluded syntax and the explicit `maxExtglobRecursion:false` opt-out retain their existing behavior. Thus it is a better bounded experiment starting point, not an API-wide compatibility or security guarantee.

As above, its commit ID came from a link target; the PR diff was read, but an immutable commit fetch was unavailable.

### Shared candidate limits

All four proposals remained open in the retrieved pages. Their authors' reported test counts are not Career Finder results.

The algebraic collapse idea is promising for a defined grammar and option set because it can retain useful glob semantics instead of turning the glob into a literal. That reasoning cannot automatically be extended to every syntax or capture behavior supported by Picomatch.

**Unexecuted quote/capture check:** Compare repeated quoted literal-star bodies such as `+("*"a)`, and compare capture arrays as well as Boolean results. This is a proposed counterexample search, not a confirmed bug in an accepted patch.

## 5. Repair and containment alternatives

| Route | Useful outcome | Remaining limitation |
|---|---|---|
| A suitable released upstream fix | Simplest eventual version update after project validation | No such release verified here |
| A pinned, reviewed patched fork for the actual 2.x and 4.x resolutions | Can repair demonstrated behavior with controlled provenance | Scanner mapping may remain red or may not recognize the fork; neither scanner outcome proves correctness |
| Compatible changes removing affected dependencies through their parents | Can remove implementations from the dependency tree | No compatible replacement versions verified; replacing the build stack is a large change |
| Restrict grammar at a real controlled entry point | Can prevent prohibited shapes reaching matching | Does not repair other callers and can break required glob behavior |
| Isolate matching/build work with an external deadline | Can bound a stalled task and keep a supervisor responsive | Does not remove the package or clear a raw audit gate |
| Replace the regex engine or matcher | May support stronger bounds for a defined subset | Requires syntax, API, options and performance compatibility work |
| Filter the report, change audit threshold, omit dev dependencies, or rename without repair | Changes reporting/policy | Does not fix matching behavior |

npm supports [root-level scoped overrides and replacement packages/forks](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#overrides). A real replacement must cover all actual resolution paths. Overriding one top-level copy is insufficient evidence.

Picomatch documents [noextglob and its other options](https://github.com/micromatch/picomatch#options). Disabling extended globs changes the supported matching contract. The [4.0.7 parser source](https://github.com/micromatch/picomatch/blob/4.0.7/lib/parse.js) also shows that the recursion safeguard is narrower than a universal complexity bound and can be disabled explicitly.

A timeout or Promise.race on the same blocked event loop cannot interrupt synchronous regex evaluation. Use an execution boundary with the supervising deadline outside that boundary. [Node's event-loop guidance](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop) explains why regex mismatch paths can block progress.

[Node 24.22.3 worker documentation](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html) states that termination is asynchronous and describes resource limits applying to specified JavaScript engine resources. They do not cover every resource or prevent all global out-of-memory failures. Bound queues and parallel workers too.

[RE2's syntax reference](https://github.com/google/re2/wiki/Syntax) excludes lookahead and lookbehind. Picomatch-generated expressions can contain assertions, so RE2 is not an unqualified replacement for its RegExp output. Node also warns about compatibility differences when changing engines. A matcher replacement needs a declared supported grammar.

## 6. Proposed acceptance plan — no checks in this section have been executed

1. **Freeze the dependency experiment.** Use the dependency owner's isolated tree. Record package and lock hashes, pinned Node 24.22.3, upstream provenance and candidate source hashes. Preserve the existing audit record.

2. **Trace actual caller behavior.** For each dependent, identify option sets, capture use, Bash/Windows behavior, dotfile rules, raw regex features and safeguard opt-outs. Establish provenance of both patterns and candidate strings: reviewed configuration, filenames, package metadata, pull requests, runtime requests or other sources.

3. **Preserve the known valid match.** Require `isMatch("abc", "+(*)c") === true`. Include positive and negative cases for `+(*a)`, `*(*a)`, `+(a*b)`, and `*(*.js)`. Keep exact patterns in test fixtures.

4. **Use short differential corpora.** Compare baseline and candidate on safe, bounded inputs across the supported options. Cover prefixes/suffixes, empty strings, dotfiles, slash/backslash boundaries, quoted and escaped stars, classes, nested groups, alternation and malformed syntax. Compare captures and other public results actually consumed by dependencies.

5. **Supervise expensive probes.** Use owner-created child processes or workers with an external hard deadline and verified termination. Limit concurrent probes. Do not rely on inline post-hoc elapsed-time assertions. Record generated-expression checks and actual execution independently; neither proves all syntax safe.

6. **Verify failure semantics.** A matching timeout must surface explicitly, release its execution slot, and allow healthy follow-up work. It must not return an empty match list that silently omits files from a build, scan or lint run.

7. **Verify reproducible installation and every resolution.** After a clean project installation, check that each immediate dependent resolves to reviewed source. Verify source hashes. An untracked edit to one node_modules file is not a reproducible remedy.

8. **Run the project's required hosted gates.** Type, lint, application, worker/API and build checks must pass on the combined candidate. Preserve the raw audit result. Native verification remains coordinated with the publisher; this review does not authorize a duplicate native run.

9. **Review the complete disposition.** A missing advisory match caused by a fork's new package identity is not a safety proof. A still-flagged version whose code changed needs source and execution evidence, not a fabricated scanner pass. Explicitly separate repaired behavior, residual grammar limitations, application exposure and scanner status.

The [npm audit documentation](https://docs.npmjs.com/cli/v11/commands/npm-audit/) explains that audit-level changes affect the failure threshold rather than filtering or fixing the underlying report. No reporting adjustment is accepted here as remediation.

## 7. Recommended coordination outcome

Give development owner 5bc6158967e8 the exact candidate links, the positive-match regression, capture/quote caveats and advisory disagreement. Ask for a bounded experiment tied to actual dependency resolution and supported options, not a broad upgrade or automatic cherry-pick.

Continue independent account, search, recovery, bilingual and native work while the dependency gate remains open. This report establishes no dependency fix, audit pass, production nonreachability or release readiness.

## 8. Proposed PR1 coordination update — draft only, not posted

Dependency owner 5bc6158967e8 — independent read-only Picomatch review, checked 17 November 2026 at 22:25 Riyadh. Root remains responsible for hosted integration/browser acceptance; publisher d57f4cd77813 retains native/build/store ownership. No package changes, installs, tests, builds, or vulnerability probes were performed by this reviewer.

Baseline is ca3d3411d8b5b36fa7093dff782f4a7b931261c7. Lock SHA-256: 2512e3bd6aebfc4377bbe036d3cf606c27e33613b35c8c58d28f0f3a0d596c99. Confirmed resolutions are micromatch4.0.8→picomatch2.3.2, tinyglobby0.2.17→4.0.4, and vite8.3.8→4.0.7; all are dev:true. Negative source/bundle literal-name searches are limited evidence, not proof of production nonreachability.

GitHub’s reviewed advisory remains High, <=4.0.7, patched=None. Snyk has revoked its corresponding advisory and reports a maintainer dispute. Preserve that disagreement; it does not clear the current npm gate.

Please evaluate a bounded candidate based on upstream PR237 (1bf0d04563cb9ce568cf36efc5f6b7187d9911d5) and the narrower v2 adaptation PR246 (f03bec2c02e46f063fbfdc161aae1d0f854b2565). Both remain open, not released fixes. PR237 includes the exact positive regression isMatch("abc", "+(*)c"), but its capture/quote handling needs scrutiny and its inline expensive timing test should not run unsupervised. PR246 adds subprocess deadlines and narrower syntax, but intentionally changes capture:true matching and leaves excluded syntax/explicit safeguard opt-outs unchanged.

Before acceptance, trace actual caller options, preserve valid matches/captures, use short differential corpora, supervise expensive probes externally, verify all three installed resolutions after clean installation, and run required hosted gates on pinned Node24.22.3. Report raw audit results separately from source repair and exposure analysis. No renamed-package green audit, omission, or threshold change should substitute for repair evidence.

Please retain the rejected guard as a documented failed candidate, including its valid-match regression. Any replacement must preserve the current free-cost, Arabic/English and privacy contracts, avoid changing native ownership, and show how later upstream updates can replace the temporary patch reproducibly.

Primary sources: https://github.com/advisories/GHSA-fc5q-39xc-vjpf ; https://security.snyk.io/vuln/SNYK-JS-PICOMATCH-21248802 ; https://github.com/micromatch/picomatch/pull/237/files ; https://github.com/micromatch/picomatch/pull/246/files . These are proposed checks, not executed results; continue independent unblocked work while this gate remains open.

## 9. Primary-source index and retrieval limits

- GitHub advisory: https://github.com/advisories/GHSA-fc5q-39xc-vjpf
- Snyk advisory and amendment: https://security.snyk.io/vuln/SNYK-JS-PICOMATCH-21248802
- Upstream releases: https://github.com/micromatch/picomatch/releases
- Upstream request for fix/release guidance: https://github.com/micromatch/picomatch/issues/247
- Upstream broader issue: https://github.com/micromatch/picomatch/issues/234
- PR194: https://github.com/micromatch/picomatch/pull/194
- PR238: https://github.com/micromatch/picomatch/pull/238
- PR237 and diff: https://github.com/micromatch/picomatch/pull/237 ; https://github.com/micromatch/picomatch/pull/237/files
- PR246 and diff: https://github.com/micromatch/picomatch/pull/246 ; https://github.com/micromatch/picomatch/pull/246/files
- Picomatch4.0.7 parser: https://github.com/micromatch/picomatch/blob/4.0.7/lib/parse.js
- Picomatch options: https://github.com/micromatch/picomatch#options
- npm audit11 documentation: https://docs.npmjs.com/cli/v11/commands/npm-audit/
- npm overrides11 documentation: https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#overrides
- Node24 worker documentation: https://nodejs.org/docs/latest-v24.x/api/worker_threads.html
- Node event-loop guidance: https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop
- RE2 syntax: https://github.com/google/re2/wiki/Syntax

The research tool could not retrieve the npm registry latest endpoint, raw.githubusercontent parser endpoint, issue235 or the immutable PR commit pages. The rendered 4.0.7 source, PR diffs, advisory, release and documentation pages above were read. Failed fetches are not evidence of absence. This report contains no invented executed test or upstream maintainer approval.
