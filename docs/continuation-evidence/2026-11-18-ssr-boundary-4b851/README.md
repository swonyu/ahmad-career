# SSR public-bundle boundary correction — 18 November 2026

## Delivery state

This checkpoint preserves a reviewed five-file PATCH for the publisher's uncommitted SSR replacement. It does not integrate that migration into the product. The root product remains da68 on the f8 evidence lineage before this checkpoint; no publisher working file was changed.

The correction now includes the shared guard, both public build checks, both manifest checks in the full SSR test, and the required test:ssr command wiring. Apply public-bundle-boundary-complete.patch to the matching owner-controlled integration snapshot, not as a whole-file overwrite over newer work.

## Defect and fix

The original matcher appended a slash to the lib/connector- alternative, so actual lib/connector-context.ts and lib/connector-contract.mjs filenames evaded it. The SSR test repeated that mistake. The separately served PDF worker had no equivalent guard.

The new helper checks both browser and PDF metafiles before public assets are added, preserves the original private-directory exclusions, and is itself included in sourceHashes. The full recovered SSR test invokes the helper on both manifest arrays. package.json test:ssr explicitly invokes the new six-test file and the existing SSR suite; the existing hosted CI already runs that script after the build. Main tests, dependency declarations and the lockfile are unchanged.

## Actual verification

On Node24.22.3 / npm11.20.0, 18 November04:57:39 Riyadh:

| Check | Result |
|---|---|
| Identical six tests against the source-derived old guard | 3 pass / 3 fail; expected exit1 |
| Same six tests against the corrected helper | 6 pass / 0 fail; exit0 |
| Candidate builder syntax | exit0 |
| Corrected full SSR-test syntax | exit0 |

The complete patch also passed git apply --check and an actual application in a disposable cloud copy, whose five resulting files matched the candidate bytes exactly. Two independent source reviews found no concrete defect in the bounded correction. Grok Build2 separately matched the earlier four supplied file hashes and reproduced the focused result on Node22.23.3; that is additional evidence, not the pinned result above. Preliminary root Node24.22.1 evidence is retained separately.

No complete replacement build, SSR runtime suite, installation, audit, browser, native or store gate was executed for this corrected proposal.

## Existing manifest inspection

An independent direct-prefix check of the owner's existing manifest found 1,925 browser inputs and207 PDF inputs, with zero server/, worker/, scripts/ or lib/connector- entries in either. No absolute, dot-relative, parent-relative or backslash input names were observed.

Manifest SHA256:760b622e1fc1fc035df157223d681ff43af304467c2b9d21612328c98956abf4.
This establishes the absence of those prefixes in that observed manifest. It is not a broad secret audit, and no current emitted leak has been established.

## Exact source and patch identity

Frozen parent:a17999ce9f24d1e8c94a38c03dcda68101db4507.
Original builder SHA256:069cff27a155a4e6b4e05a24a97c0ad0329b48913823a7a837931a531317d517.
Original SSR-test SHA256:4692be0181aebed8dca2d91f3530b86b94d8c5f74e385a3053e4131a1ce3e529.
Original package SHA256:77b0016647cb32b712569c6d36710fad2f710a0748fd70096542cd0acad220eb.
Complete patch SHA256:a6e1a875128172f9f7a57bb5155b8b1a6f7fd481ed4ec8941ed6a1a04ece3b57.

pinned-check-receipt.json records exact candidate hashes, commands, times and output hashes. proposal/ preserves the candidate source. baseline/ contains only the source-derived old guard adapter and identical focused tests, not a complete project checkout.

## Remaining owner gates

Publisher d57f4cd77813 retains the SSR candidate, integration/native builds/CI/signing/stores. Development5bc6158967e8 retains production dependency remediation. Root owns this review and its hosted work. No competing migration or native build was started.

The replacement has real prior zero-audit/build/SSR receipts, but its actual install was npm ci --ignore-scripts; CI and install:ci use ordinary ci. Verify that intended installation route. The current root's19-high audit is a separate unresolved result. Preserve root da68's download cleanup and eight additional tests, plus newer accepted work; the old candidate289-test suite is not root's297.

Integrate from an immutable source snapshot and bind its package/lock/toolchain bytes to the built artifact. The builder first hashes source inputs after compilation, so its later stability comparison alone cannot prove exactly which bytes the compiler read. No source movement was observed.

After integration, run pinned focused and relevant full regressions, build/SSR, and the existing hosted/native EN/AR journeys through the current owners. Keep physical-device, assistive-technology, signing and store status separate. The latest checked CI remains iPhone simulator17/17 on a179, not a full combined-source pass.

The original cutoff, seven-stream count, free costs and Good Spender exclusion remain unchanged.
