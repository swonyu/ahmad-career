# Picomatch candidate experiment — bounded partial remedy

## Outcome

**The narrow candidate improved the four covered repeated-star cases across all three installed source versions while preserving the exercised short matching/capture results. It remains an incomplete remediation.**

The candidate deliberately retains existing capture behavior. A candidate 2.3.2 capture-mode probe still exceeded its 750 ms external process deadline. No production integration, package installation, audit, application suite, CI or native build was performed.

This is isolated implementation/research evidence for development owner `5bc6158967e8`. Root owns integration/browser work; publisher `d57f4cd77813` retains native/build/store ownership. No competing production dependency edit was made.

## Exact baseline and runtime

- Repository HEAD: `ca3d3411d8b5b36fa7093dff782f4a7b931261c7`.
- Repository: `/Users/saleh/Developer/career-finder-feed-continuation-20261117-4b851318da2d`.
- Lock SHA-256: `2512e3bd6aebfc4377bbe036d3cf606c27e33613b35c8c58d28f0f3a0d596c99`.
- Node independently executed: **v24.22.3**.
- Node executable: `/Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/toolchain/node_modules/node/bin/node`.
- Experiment began **2026-11-17T19:52:27.585856Z**, finished **2026-11-17T19:52:31.221369Z**; **22:52:27–22:52:31 Asia/Riyadh**.
- Supervisor elapsed time: **3.635489791s**.
- Allocated external child deadlines: **21.0s**, below the authorized 30 s maximum budget.
- One child at a time; no queue or parallel stress work.
- Supervisor exit: **0**, meaning this bounded experiment completed. It does not mean the advisory or application gate passed.
- Result state: `covered-probes-completed-with-unresolved-scope`.
- `remediationComplete: false`.

The source copies retain the original package name `picomatch`, original version and included LICENSE. Only `candidate/<version>/lib/parse.js` differs from its corresponding baseline. The experiment copied 29 source/metadata/license/readme files in total, individually hashed in `source-manifest.json`.

| Version | Original installed resolution relative to hosted/ | Baseline parser SHA-256 | Candidate parser SHA-256 |
|---|---|---|---|
|2.3.2|node_modules/picomatch|3a91656f440069aa8f8e15c9d695b9f6b2209df1eab2be8127c72cbcca45ff5f|b4b99cdece05efcdd1293bb28a05b3067c9241a70ee004436151dc1b31314e32|
|4.0.4|node_modules/tinyglobby/node_modules/picomatch|ce57c04e04994b83e2ca566170fa192e6fe19d710bea6da00ce2f76d01c0dea4|300e912a0ee94b4cf3c4de1851d799e392fb1c329ab67e750f467f1b93e700e9|
|4.0.7|node_modules/vite/node_modules/picomatch|4e1e05447668aa1e94366c5516a2bcd8f5fff800cc92b1d0cd7d77703b8618c4|d154c262379061c6272e5cbdd95a224f5fa3f2ad605378aa838779a6732be11a|

## Candidate provenance and scope

Actual upstream diff pages were reviewed:

- [PR237](https://github.com/micromatch/picomatch/pull/237/files), commit-link identity `1bf0d04563cb9ce568cf36efc5f6b7187d9911d5`.
- [PR246](https://github.com/micromatch/picomatch/pull/246/files), commit-link identity `f03bec2c02e46f063fbfdc161aae1d0f854b2565`.

These remain proposals, not verified released fixes. This experiment is an adaptation of their repeated-star collapse idea, not an unmodified cherry-pick. Immutable commit pages were unavailable through the research tool; full IDs were read from the observed commit-link targets and actual PR diff pages were read.

The candidate recognizes exactly one branch containing an ordinary star, excludes consecutive globstars, and excludes backslashes, slashes, both quote characters, question marks, brackets, braces, parentheses, alternation and other extended-glob operators. It additionally declines optimization for truthy capture, contains, flags or prepend options.

For an eligible plus repetition, it removes the outer repetition. For an eligible star repetition, it changes the outer repetition to optionality. Existing parser behavior handles every excluded case unchanged. The explicit `maxExtglobRecursion:false` opt-out remains unchanged.

The narrower option guard was selected before executing tests. Capture behavior is preserved by declining optimization, rather than using PR246's literal fallback. Contains/custom flags/prepend are excluded because Boolean language equivalence alone would not prove preservation of observable substring/capture results.

**This optimization is not a general regex safety proof.** Quoted/escaped/complex syntax, captures, explicit opt-outs and excluded option combinations have not been repaired by it.

## Actual checks and results

### Syntax and short compatibility

- Four syntax checks exited 0: the probe script and each of the three candidate parsers.
- Each version passed seven explicit required matching cases, including `isMatch("abc", "+(*)c") === true`.
- Each version passed **288 short differential case/options comparisons**: 32 fixed handpicked cases × 9 option sets.
- Each comparison checked the Boolean matching result and the returned regex-match/capture array against that version's untouched baseline.
- Maximum input length in this short corpus was 8 characters.
- Option sets exercised: default, dot, Windows, Bash, capture, contains, case-insensitive, noextglob and explicit safeguard opt-out.
- The corpus includes quoted and escaped stars, paths, dotfiles, classes, nesting, alternation and malformed syntax.
- These are dependency-specific matrix cells, not application journeys or full upstream/project test suites.
- Custom flags/prepend combinations were excluded in source but were not separate matrix option sets; their general behavior was not established by execution here.

| Version | Required cases | Differential comparisons | Short semantic child exit |
|---|---:|---:|---:|
|2.3.2|7 passed|288 matched baseline|0|
|4.0.4|7 passed|288 matched baseline|0|
|4.0.7|7 passed|288 matched baseline|0|

### Externally supervised longer probes

Every probe ran in a separate owned Node process with a 750 ms external deadline. The fixed input was 30 `a` characters followed by `b` (31 characters total). The supervisor used `Popen.communicate(timeout=...)`, sent SIGTERM on timeout, and waited for termination. A SIGKILL escalation path exists but was not needed.

| Source variant | Version | Pattern/mode | Observed outcome |
|---|---|---|---|
|Baseline|2.3.2|`+(*a)`, default|Process exceeded 750 ms; SIGTERM; exit -15; termination verified by wait|
|Baseline|4.0.4|`+(*a)`, default|Process exceeded 750 ms; SIGTERM; exit -15; termination verified by wait|
|Baseline|4.0.7|`+(*a)`, default|Process exceeded 750 ms; SIGTERM; exit -15; termination verified by wait|
|Candidate|all three|`+(*a)`, `*(*a)`, `+(*)c`, `+(a*)c`, default|All 12 processes exited 0, returned false correctly and completed within deadline|
|Candidate|2.3.2|`+(*a)`, capture:true|Process exceeded 750 ms; SIGTERM; exit -15; termination verified by wait|

Candidate covered-probe process durations were **27.987–40.460ms**, including Node startup and module loading. The measured matching calls inside those successful processes took **0.169–0.456ms**. These are single observations on this machine, not performance guarantees.

The baseline timeout measures the whole probe process, not a separately instrumented 750 ms matching-only interval. Capture mode was tested on candidate 2.3.2 only after its residual risk was demonstrated; it was not repeated unnecessarily on the other two versions.

### Integrity and process evidence

The supervisor verified after all tests:

- Every one of the 29 original installed source/metadata files remained unchanged.
- Every baseline copy and candidate source remained unchanged during testing.
- The original hosted lockfile remained unchanged.
- Every child reached a terminal exit state, verified by waiting on the exact owned process.
- No repo/node_modules files were edited. No installation, package-identity change, external publication, native build, CI dispatch or production deployment occurred.

The captured raw JSON records include full argv, working directory, PID, deadline, exit code, termination method, stdout, stderr and result for every child.

## What the result means

**Supported:** On these exact source hashes and pinned Node runtime, the narrow noncapturing candidate preserved the exercised short semantics and removed the observed deadline failure from its four tested default-mode shapes across all three versions.

**Not supported:** Complete CVE remediation, arbitrary-pattern safety, capture-mode repair, all-option compatibility, real application exposure analysis, a clean install of an accepted dependency solution, project regressions, npm audit success, hosted/native journey success or release readiness.

The remaining capture timeout is concrete evidence that this candidate cannot be promoted as a full Picomatch security fix. Silently literalizing the valid capture patterns would change the contract and is not an accepted next step.

## Earlier rejected guard

The parent handoff reports a previous simplistic guard was rejected because it broke the valid `isMatch("abc", "+(*)c")` result. That prior candidate and its evidence were not removed or modified. This experiment did not rerun that old guard; it retained the exact positive regression as one of its required cases, which passed for the new narrow candidate.

## Next owner decision — proposed, unexecuted

1. Development owner 5bc should inspect these exact patches and trace actual options used by micromatch, tinyglobby and Vite callers. Determine whether the supported simple noncapturing subset is useful for a real scoped repair and whether any externally influenced matching reaches the uncovered modes.
2. Preserve capture and quoted/complex syntax semantics. Any extension needs a specific semantic proof and bounded independent tests, not a broad literalization rule.
3. If uncovered behavior is reachable, evaluate a real execution boundary with external deadlines or an alternative matcher supporting the required contract. Such containment does not itself remove the advisory or produce a successful audit.
4. Only the production dependency owner should decide on install/override packaging, clean-install verification and required hosted regressions. Publisher retains native verification.
5. Keep raw scanner status, repaired source behavior and application exposure as distinct evidence. Do not rename a package or weaken the audit threshold to manufacture success.

No additional expensive probes or broad fuzzing were run after the concrete covered-case improvement and capture limitation were established.

## Artifacts and exact execution

- `prepare-candidate.py`: verifies baseline parser hashes/runtime, copies the finite package sources, applies the bounded adaptation and emits patches/manifest.
- `baseline/<version>/`: untouched installed source copies, with package identities and licenses.
- `candidate/<version>/`: copied sources with only the parser adaptation.
- `candidate-2.3.2.patch`, `candidate-4.0.4.patch`, `candidate-4.0.7.patch`: exact unified diffs.
- `probe.cjs`: bounded fixed semantic corpus and individual longer cases.
- `run-supervised.py`: sequential external-deadline supervisor.
- `prepare.log`: preparation result and exit 0.
- `source-manifest.json`: exact installed/copy paths, all source hashes, runtime, baseline and upstream references.
- `process-records.jsonl`: raw record per child.
- `results.json`: complete terminal result, source-integrity checks and limitations.

Preparation invoked the saved preparation script with Python3; it exited 0. The actual experiment command was:

```sh
python3 /Users/saleh/Developer/career-finder-feed-evidence-20261117-4b851318da2d/picomatch-candidate-review-20261117/run-supervised.py
```

Every exact Node child command is recorded in `process-records.jsonl` and `results.json`; no shell expansion or package-manager install is required.

The scripts intentionally refuse to overwrite source copies or a previous result. To reproduce, copy only the three scripts into a new empty sibling evidence directory, retain the pinned runtime/source expectations, and invoke preparation followed by supervision there. A changed installed source hash must be reviewed rather than bypassed.

### Key artifact SHA-256

| Artifact | SHA-256 |
|---|---|
|prepare-candidate.py|82f61586e8731c7f51b4afb07e98fefa0b79e3fbad9e86ab7118beaca3e1bb2b|
|probe.cjs|6c09f8bc6eb92416216f4609e1eeda6f3e42c965186d6334a980af24802c2a0c|
|run-supervised.py|9e6fc84c313c58ce97285190703ea99d21d56a61126fc7687cd548f4146ebb78|
|source-manifest.json|edc28a8e3f4b5c69943b18b889fd1f91220f701d07025acb1dff5c7029635cb2|
|results.json|c919db806ca8b552a2f34a5bf1967f36422109b3d002d4b273630cfa816c62ce|
|process-records.jsonl|25e9a6aa1488679decd8fcc664c15e9e691d5159406f7c551c091487b1c108a4|
|candidate-2.3.2.patch|b2dc4a4a2794b48d24d630095a93ab695aeef23a8e6c24d5919b475d93408842|
|candidate-4.0.4.patch|cd822d5dd0fee999063e878cb63b7ed8306fa50488739d742b23fecad860e5ba|
|candidate-4.0.7.patch|a0cb6d1cb12a132dca11efc01c9215165de25c6d319e5bc1365f261dcd5b8df5|

## Advisory context

The earlier read-only research report is `../picomatch-remedy-independent-review-20261117.md`, checked at 19:25 UTC before this later authorized experiment. Its no-tests statement describes that earlier research phase; this document records the subsequently executed isolated dependency experiment.

[GitHub's reviewed advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) and [Snyk's revoked counterpart](https://security.snyk.io/vuln/SNYK-JS-PICOMATCH-21248802) remain distinct source positions as retrieved in that research. This experiment supplies behavior evidence and does not resolve scanner classification or production exposure.

The continuation clock, free-cost/privacy constraints, Good Spender exclusion and current ownership are unchanged.
