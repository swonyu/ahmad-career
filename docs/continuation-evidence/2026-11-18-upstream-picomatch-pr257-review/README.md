# Picomatch PR 257 — focused semantic compatibility finding

**Evidence captured:** 18 November 2026 around 00:04 UTC. **Scope:** independent root-coordinator source research only, not dependency-owner remediation, native build, audit waiver or production patch.

The current upstream [micromatch/picomatch PR 257](https://github.com/micromatch/picomatch/pull/257) (`4e4892e0ac6c374ec3d9e4dc430101da9a20a37b`, **open/unmerged** at readback) optimizes star-led repeated extglobs. The upstream tag list and `npm view picomatch version` still return **4.0.7**. No released project-validated security remedy was observed. The reviewed vulnerability is [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) (Oct 19, with OSV revision Nov 17).

## Actual bounded experiment

An isolated **4.0.7 npm package snapshot** already committed under `docs/continuation-evidence/2026-11-17-account-competitors-4b851/picomatch-candidate-review-20261117/baseline/4.0.7` was copied outside all owner checkouts. The exact upstream PR diff (`gh pr diff 257 --repo micromatch/picomatch`) was applied **only to `lib/parse.js`**, with `git apply --include='lib/parse.js' --check` first. The upstream test-file hunk was deliberately excluded because the committed npm snapshot does not contain upstream test files; this is NOT a pass of PR 257's upstream test suite or a proof against its current master. Patch SHA-256: `0fcb6b01d51f6bcbbbffa8dceacc2c02fd48c52f0754f318839cac81e40b38dc`. Isolated patched `lib/parse.js` SHA-256: `350e4f7e0336ef364bf5ecd9944ec05c8896d872e7f4834a0017da979b586779`.

Using pinned Node v24.22.3, ten **short-input** `picomatch.makeRe(...,{capture})` regex executions were compared. For all five sample cases, capture=false had identical match results; with capture=true, **four of five cases returned different capture-group values** after the PR transformation. Example for `+(*a)` against `aa`:

- Baseline 4.0.7 `.exec` prefix: `["aa", "aa", ""]`
- PR-patched 4.0.7 `.exec` prefix: `["aa", "aa", "a"]`

Another example `+(*a)` against `aba` changes the final group from `"b"` to `"ab"`. The PR edits the quantifier used by the regex even with `options.capture=true`, so the difference is consistent with its code. The output is in `short-capture-output.jsonl`; reproduce with `node reproduce.cjs <baseline-package-dir> <isolated-patched-dir>`. These tests do NOT exercise dangerous long inputs, actual project integration, or the unchanged full npm audit.

**Disposition:** A new, reproducible **capture-compatibility risk** in an unmerged upstream candidate. Do not promote PR 257 to a released safe drop-in patch without checking whether the consuming project relies on capture-group values, and preserving full semantics or explicitly accepting a documented change. Simply disabling the optimization for capture mode would leave its ReDoS concern there, so that is not a complete fix. This finding does **not** prove a Career Finder exploit, nor does it imply PR 257 is the same as the root's earlier experimental candidate. Development owner `5bc6158967e8` retains any dependency/audit/package remedy; publisher `d57f4cd77813` retains integration/CI. Nothing in package.json or lock was changed.
