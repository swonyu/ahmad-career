# Career Finder dependency remedy — current source review

Review window: **18 November 2026, 01:36–01:42 Riyadh** (17 November, 22:36–22:42 UTC).

This is a read-only continuation review under saleh-app-workflow, excluding Good Spender. Development owner **5bc6158967e8** retains production dependency, lock and audit decisions. No installation, package/lock edit, probe, application test, build, CI dispatch, browser action or external message was performed. The original cutoff remains 18 November 22:26:12 UTC / 19 November 01:26:12 Riyadh.

## Decision

**No released compatible Picomatch fix is currently established.** A new open upstream proposal, **PR257**, is worth a bounded semantic review because it covers some repeated alternations absent from the earlier narrow candidate. It is neither released nor independently tested here, and it does not establish complete remediation.

The current publisher's dependency inputs are unchanged. The meaningful next work is an isolated review of PR257's actual capture/substring behavior and current caller options, owned or explicitly delegated by the dependency owner. Repeating the same audit, installing the same latest versions, applying a broad literalization rule, or relabelling a dependency does not resolve the remaining evidence.

## 1. Recovered ownership and latest source

Root checkout remains clean at **9d011492b50185aa74fddbf061a6357b1fb0568f**, branch continuation/feed-reliability-20261117-4b851. The development evidence branch remains at **636d79a808bd4ecdd7ebd386b0f98a16ab3d2a32**. No newer dependency-owner implementation or transfer of this scope was found in the retrieved PR1 comments.

An initial branch lookup found publishing-integrated at363ae84; that is not the newest reconciled tree. The native coordination helper subsequently identified **recovery/publishing-reconciled-20261117-d57** at **2884188263f3dad5753da7b2e507f6ba55e30eb0**.

I independently read these immutable files from288:

| File | Result |
| --- | --- |
| hosted/package-lock.json | Byte-identical to root9d; SHA-256 **2512e3bd6aebfc4377bbe036d3cf606c27e33613b35c8c58d28f0f3a0d596c99** |
| hosted/package.json | Byte-identical; SHA-256 **7e02d347153988f4e9180e6348ab4fa405ba98cae1cc85abd4c1ea7e5da85e7a** |
| .github/workflows/phone-quality.yml | Byte-identical; the explicit locked-dependency audit command remains required |

The installed resolutions remain **2.3.2**, **4.0.4** below tinyglobby, and **4.0.7** below Vite. Their dev flags are metadata, not evidence that the deployed application cannot reach matching code.

The native coordination helper reports full run43 / **44185640786** at288 ended with service, Android and unsigned iPhone build passed; iPhone16/17 failed one empty-search assertion; hosted failed its required audit after289/289 main Node tests and build. Its hosted log is preserved in sibling native-state-followthrough-20261117T2236Z/run43-hosted.log. This dependency lane did not independently inspect the audit artifact or execute that run. Parent/root should report its final exact counts from the CI reviewer.

Relevant owner thread: https://github.com/swonyu/ahmad-career/pull/1#issuecomment-6960074487

## 2. Direct registry and advisory evidence

At this review, direct public npm registry metadata returned:

| Package | Latest tag | Relevant dependency |
| --- | --- | --- |
| picomatch | **4.0.7** | No dependencies |
| micromatch | **4.0.8** | picomatch ^2.3.1 |
| tinyglobby | **0.2.17** | picomatch ^4.0.4 |
| vite | **8.3.8** | picomatch ^4.0.7 and tinyglobby ^0.2.17 |

Vite also has8.4.0-beta.1, but no compatible Picomatch repair was established by that tag. No prerelease installation or upgrade was attempted.

The direct GitHub advisory API reports:

- GHSA-fc5q-39xc-vjpf, severity high.
- Updated **2026-11-17T15:56:44Z**, reviewed **15:56:42Z**.
- Package picomatch, affected range **<=4.0.7**.
- **first_patched_version:null**, **withdrawn_at:null**.

The GitHub release API and release page identify4.0.7 as the newest release, published24August2026. Snyk still displays its revocation and maintainer-dispute amendment. These sources disagree; the recorded npm gate is still failed.

A search-engine result returned an older October unreviewed version of the advisory with unknown package/range. Direct page/API retrieval disproved that stale cached description. Do not report it as a new withdrawal.

Primary sources:

- https://registry.npmjs.org/picomatch
- https://registry.npmjs.org/micromatch
- https://registry.npmjs.org/tinyglobby
- https://registry.npmjs.org/vite
- https://api.github.com/advisories/GHSA-fc5q-39xc-vjpf
- https://github.com/advisories/GHSA-fc5q-39xc-vjpf
- https://security.snyk.io/vuln/SNYK-JS-PICOMATCH-21248802
- https://github.com/micromatch/picomatch/releases

## 3. Upstream proposals: what changed

PR237 and PR238 received new comments at21:28UTC. Their heads did not change into a released fix:

| Proposal | Current immutable head | State and meaning |
| --- | --- | --- |
| PR237 | 1bf0d04563cb9ce568cf36efc5f6b7187d9911d5 | Open, unmerged; the existing single-branch collapse proposal. |
| PR238 | 44f192261f312ddf236cb7bdc05d8f22663f98f9 | Open, unmerged; leading-quantifier guard that routes some valid patterns to existing literal fallback. |
| PR246 | f03bec2c02e46f063fbfdc161aae1d0f854b2565 | Open, unmerged; v2 proposal deliberately literalizes its covered patterns in capture mode. |
| **PR257** | **4e4892e0ac6c374ec3d9e4dc430101da9a20a37b** | **New proposal created17November20:08:47UTC; open, unmerged.** |

PR257's actual diff adds a star-led branch predicate and removes redundant outer repetition when every branch satisfies it. Its source covers a shape such as **+(*a|*b)**, where PR237 only considers a single branch. The author reports fuzzing and suite results, but those are attributed claims; I did not reproduce them and they are not Career Finder passes.

This is **not a strict superset of root's previous candidate**. PR257 requires a leading star, whereas the earlier root experiment also optimized a permitted shape such as +(a*)c. The proposals need comparison, not a blind replacement.

PR257's documented and source-visible limits remain material:

- Mixed branches such as +(*a|b) are left unchanged.
- Bracket syntax is excluded, including classes that might be safely constrained in a future design.
- Slash/globstar-containing branches are excluded.
- maxExtglobRecursion:false deliberately retains the old behavior.
- The diff has no capture/contains/custom-flags/prepend guard. Boolean language equivalence does not alone preserve capture arrays, substring choice, callbacks or all option behavior.
- The committed added tests assert regex source and Boolean matching; they do not demonstrate equivalence of returned capture arrays.

The earlier root candidate deliberately declined optimization for capture and related observable options; its2.3.2 capture:true timeout therefore remains a real unresolved case. PR257 should not be described as repairing it until actual capture outputs and bounds are independently checked.

PR238 is not an acceptable shortcut: its predicate does not mark a branch consisting only of a bare star, while marking other valid forms for literal fallback. PR246 explicitly changes capture-mode semantics through literalization. Those source strategies do not satisfy the established preservation contract.

Primary proposal URLs:

- https://github.com/micromatch/picomatch/pull/237
- https://github.com/micromatch/picomatch/pull/238
- https://github.com/micromatch/picomatch/pull/246
- https://github.com/micromatch/picomatch/pull/257

The web retrieval service could not fetch257, but the authorized GitHub API successfully returned its metadata, exact heads, diff and comments. observations.json preserves those actual responses. No execution of fetched code occurred.

## 4. Actual caller inspection, with limits

I inspected installed source after recovering current ownership and verifying the unchanged lock:

- **tinyglobby0.2.17:** buildCrawler constructs matchOptions with dot, nobrace, nocase, noextglob, noglobstar and posix:true. Its observed matcher, ignore matcher and partial matcher share that constructed object. This path does not set capture, contains, custom flags or prepend.
- **Vite8.3.8:** its compiled Node tooling imports picomatch, uses direct pm matchers and embeds caller paths that pass options onward. Observed uses include build filters, glob handling and server.fs.deny. The options-forwarding paths prevent a blanket conclusion from one fixed-option call.
- **micromatch4.0.8:** its public capture method explicitly invokes picomatch.makeRe with capture:true. That proves the API remains meaningful in the installed graph; it does not prove Career Finder calls it.
- The scoped app/server/scripts search found no direct imports of these three packages. This is only a bounded textual observation, not a complete transitive or deployed-runtime reachability proof.

The initial recursive Vite/tinyglobby search omitted ignored dist files and returned misleadingly empty matches. I corrected the search with --no-ignore and direct dist paths; the corrected results are preserved. No absence conclusion relies on the first search.

Post-read hashes still match the original package and lock. Root git status remained clean. The installed metadata lock SHA-256 is ae260128bd11993284c5b8319ad951027505920c2712ccfdaa38bd276e74b257.

## 5. Concrete next owner action

A useful non-overlapping next assignment is an **isolated semantic review of PR257**, not a production dependency edit:

1. Pin its exact head and preserve its license/source provenance. Review the diff against each installed major independently.
2. Reuse the prior short differential corpus and compare full regex-match/capture arrays, not only isMatch. Add star-led alternation, repeated short matches, captures and substring/options cases that the new proposal changes. Cases such as +(*a) with short repeated inputs should inspect the actual capture contents; an expected result must come from the unchanged baseline.
3. Only after short semantic checks pass, use the existing external process supervisor for a minimal set of named slow cases. Keep finite deadlines and a total budget; do not run the author's large fuzz workload or inline expensive tests blindly.
4. Reject a semantic mismatch or keep the relevant option fence explicit. A remaining fenced timeout means partial remediation, not success.
5. Complete the caller/exposure trace using actual entrypoints and emitted module evidence. Dev flags and package-name grep cannot replace that work.
6. Development5bc alone decides how a valid candidate is packaged, verifies all three installed resolutions through a reproducible clean install, and runs required regressions. Publisher retains native and CI scheduling. Neither the package identity nor the audit threshold should be changed merely to manufacture a green result.

If the required behavior cannot be preserved by a collapse, investigate an actual bounded execution boundary or a compatible matcher for the reachable contract. Such containment is separate from scanner status and does not automatically satisfy the existing full audit gate.

The released-upgrade route is currently unavailable; the new proposal provides a concrete research path, with meaningful remaining tests. Continue the independent application/native fixes while this owner-controlled gate is resolved.
