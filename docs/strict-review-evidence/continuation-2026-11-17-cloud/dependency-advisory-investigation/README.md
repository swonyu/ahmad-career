# Picomatch dependency gate investigation

**Disposition: open release blocker. No compatible remedy has been verified against the unchanged audit gate.**

Source `63eecda5c5c57805aeae1f5ba8e22af65e38ceee` failed the Hosted dependency audit in [run 40](https://github.com/swonyu/ahmad-career/actions/runs/44139018005). The raw audit is retained with that run. Its 19 high entries propagate from one underlying advisory, [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), affecting Picomatch through 4.0.7. The current primary advisory lists no patched release; the registry query returned 4.0.7 as latest. The earlier run 38 zero-audit result is dated evidence, not a current safety guarantee.

## What was actually tested

The independent [review receipt](reviewer-receipt.json) records the source hashes, primary references and limits. [Bounded local evidence](bounded-inmemory-guard.json) contains 66 child-process executions across the three installed versions, with a hard one-second limit per execution. The installed parser and application files remained unchanged.

Selected adverse patterns timed out on the baseline. An in-memory rejection guard completed those cases, but the [existing upstream compatibility assertion](upstream-compatibility-check.json) changed from true to false. That counterexample is enough to reject this candidate; the full upstream test suite was not run and is not claimed to pass. The guard is evidence of an unsuccessful repair attempt, not an installed mitigation or an approved workaround.

The official [4.0.7 source archive](picomatch-4.0.7-official.tar.gz) is retained solely to preserve the exact reviewed upstream test source. Its SHA-256 is `5f9d5c0f6d890b88bfa7844a1b7b3c9496ed07208f0e3e09f4946d2f76ca86f9`. Its [MIT license](UPSTREAM-LICENSE.txt) is retained. None of this archive or experimental guard is wired into the application, package resolution or build.

## Why the apparent shortcuts were rejected

- Upgrading every copy to 4.0.7 leaves the advisory and reproduced issue.
- The referenced open PR does not establish a complete repair for the pure-star examples.
- The tested recursion setting does not prevent the reproduced timeout.
- Global syntax rejection changes valid consumer behavior; the local guard fails a pre-existing upstream assertion.
- The audit's force-downgrade suggestions replace major parts of the pinned Next/worker toolchain without compatibility evidence.
- Renaming a package, omitting development dependencies or changing the audit threshold would not repair the issue.

All three locked Picomatch entries are marked as development dependencies. The limited source and QA6 build inspection found no direct application usage or mapped Picomatch module. This supports a tooling classification; it is not a deployed reachability proof and does not close the required gate.

A separate, non-waiving [production-only audit](production-only-audit.json) completed at 18:23:00 UTC on the unchanged source and lock: `npm audit --omit=dev --json` exited 0 and reported zero vulnerabilities. Its [receipt](production-only-audit-receipt.json) preserves the command, time, output hash and warning. This narrows the dependency classification; the required full audit still fails, no audit policy was changed, and zero production-only advisories do not prove that affected code cannot enter a built bundle.

## Safe continuation

Keep this gate open and preserve the other source-bound results. A maintained compatible release can be evaluated when available. An independently maintained MIT fork would require a real semantic repair, version-specific compatibility, upstream and adversarial testing, all downstream gates, exact provenance and explicit advisory tracking. A zero advisory count for a newly named fork would not establish safety.

No package, lockfile, workflow, installed dependency, deployment, provider account, shared Mac build, signing or store state changed in this investigation. The [owner coordination](https://github.com/swonyu/ahmad-career/pull/1#issuecomment-6956153315) records the blocker without transferring another owner's write scope.
