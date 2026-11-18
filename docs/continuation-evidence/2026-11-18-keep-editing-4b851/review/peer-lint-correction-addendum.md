# Peer addendum: lint-only mock traversal correction

## Conclusion

**The correction is semantically equivalent for the supported FocusTarget instances and selectors. No assertion is weakened and no production behavior changes.** No further correction is requested by this narrow peer review.

This addendum updates the test identity recorded in the preserved final peer review under `review-v2/`; the earlier production-source conclusions remain applicable.

## Exact change reviewed

At `phone-recovery-isolation.mjs:512`, the old loop started at `this`. The final code checks `this` explicitly with the identical selector predicate, then starts the unchanged ancestor loop at `this.parent`.

Both versions therefore visit the same sequence in the same order: the current element, its parent, then each remaining ancestor. Both return the first matching node for `dialog` or `[hidden], [inert]`, and return null when none matches. A self-match still wins; ancestor disabling/visibility context is not skipped. The direct `let node = this` alias targeted by lint is removed.

The complete file comparison confirms that this replacement is the only difference from the previously reviewed test. Every assertion and test fixture remains unchanged. The original 33,835-byte baseline prefix is still byte-identical. PhoneApp, components, record-tools tests and the Arabic catalog are also byte-identical to the preserved prior candidate.

## Identities

| Artifact | SHA-256 |
|---|---|
| Previous recovery test, 50,031 bytes | `d0e4d77b1aa6fa1c245471aeac4ed1a577fdcc80765399d0b85f3d547eb3a027` |
| Final recovery test, 50,136 bytes | `be04a91f285aa9556e593af871e1b360e6e34ec2ce963d6528a63a32b0652206` |
| Correction patch, 658 bytes | `fb09267bbb6b6d673b4e8f16311d9f62972e5cbac64897a8614c514a4b93bd1f` |
| Unchanged PhoneApp | `57543cdbc0fbcb7a51cab725d65907e76af2a29ecf9f2022bffe6caaadc9da02` |

## Verification boundary

This reviewer performed offline source comparison and wrote only this addendum and its JSON counterpart. No tests, implementation scripts, builds, Mac/browser actions, or product/test edits were performed. Root remains the sole Mac writer and acceptance runner.

This is a source-equivalence finding, not a new lint/full-suite/browser pass. Existing execution receipts retain the source identities they actually tested; this addendum does not relabel earlier passes as execution of the final `be04a91f…` test bytes.
