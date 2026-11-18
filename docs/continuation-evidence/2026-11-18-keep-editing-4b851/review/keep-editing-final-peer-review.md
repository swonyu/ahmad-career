# Final independent peer review: Keep editing focus recovery

## Decision

**No outstanding production-source defect or weakened assertion was found in the final corrected snapshot.** The correction remains within Keep editing focus recovery and is suitable for root's pinned full-project and real-browser validation. No further implementation or test expansion is requested by this peer review.

Reviewed final identities:

- PhoneApp: `57543cdbc0fbcb7a51cab725d65907e76af2a29ecf9f2022bffe6caaadc9da02`.
- Recovery test: `d0e4d77b1aa6fa1c245471aeac4ed1a577fdcc80765399d0b85f3d547eb3a027` (50,031 bytes).
- Baseline: the supplied `578d99c` source packet, with PhoneApp SHA `0ee2f855083ad5933dbbca1161372e8e6e3c8b393c1fd6033b2858c59dacfd94`.

This reviewer read source, comparisons, existing receipts/logs and the source-slice runner; only these peer-review artifacts were written. No project tests, implementation scripts, builds, installations, browser actions or remote calls were executed, and no production/test source was edited.

## Production assessment

Relative to Grok's original proposal, only the keepEditing body changes, by a net 213 bytes. Opener capture, clean-close behavior and dirty-delete entry semantics are retained.

The handler captures the current form before clearing confirmation. Its deferred check requires the same connected/open dialog, the same connected form within that dialog, removal of the old Keep control, and absence of a currently connected discard heading. It also rejects hidden/inert form ancestry. These conditions prevent an old queued action from being applied to a replaced editor or a reopened confirmation.

Focus recovery still runs only when focus is lost: absent, disconnected, on the document root/body, or on the dialog root. A connected editor field, outside control or account-recheck button is preserved. The eligibility check rejects effective :disabled state and hidden/inert ancestry; this covers disabling inherited from Modal's fieldset. The handler retains a valid opener, checks current state again after trying it, and otherwise selects the first eligible control within the captured form. It does not change dirty flags, drafts, records, recovery ownership or storage.

The existing page/modal recovery helper in components.tsx remains byte-identical. Its open-dialog protection is preserved. The corrected change does not route an open editor's focus to a page heading or relax native modal/identity restrictions.

The same-form, reopened-prompt and eligibility cases are bounded robustness protections. This review does not recast the previously unobserved races as additional demonstrated live browser defects or claim that native focus previously exposed hidden private fields.

## Test validity and preservation

The complete 33,835-byte baseline recovery-test file remains a byte-identical prefix. Ten new groups follow it; no prior assertions were changed. The existing record-tools test and Arabic catalog are also unchanged.

The new tests invoke the actual Keep JSX handler. A baseline inline handler is executable without requiring the new keepEditing declaration; a candidate identifier is bound to its actual declaration. Queue flushing permits the baseline's zero frames, so the baseline can reach the focus-result assertion rather than fail due to a missing symbol or required frame count. Entry-handler checks likewise install the new helper only when present and still execute the actual original request-close/delete handlers.

The previous DOM-order oracle is corrected: when Stage disappears, a surviving textarea remains discoverable; the genuine no-target case removes every matching field. The ports model parent connection state, disabled fieldset inheritance, hidden/inert ancestry and actual form ownership. They do not provide a replacement focus algorithm.

Coverage includes record and add-job forms, preserved opener return, fallback order, intentional later focus, focus redirected by an opener event, closed/unmounted/replaced editor boundaries, pending old/reopened alerts, inherited disabled/hidden identity states, and unchanged drafts/dirty state/recovery ownership. The reopened fixture now sets confirmation true and verifies that the old deferred action preserves true. This resolves the preliminary fixture-fidelity issue without changing production code.

These remain controlled DOM/frame tests. They do not substitute for real React rendering, browser modal/focus behavior, bilingual interaction, or assistive-technology acceptance.

## Existing bounded execution evidence reviewed

The parent's final receipts and logs report the following on **Node v24.22.1**, using an explicitly preliminary actual-source-slice adapter:

| Source variant | Passed | Failed | Exit |
|---|---:|---:|---:|
| Baseline 578 | 3 | 7 | 1 |
| Grok original | 6 | 4 | 1 |
| Corrected final | 10 | 0 | 0 |

The failure logs show assertion failures in the behavioral groups, not missing-declaration, ReferenceError or syntax failures. The recorded PhoneApp hashes match the three reviewed variants. I independently compared the runner's harness/assertion body with the final project fragment: they are byte-identical, 15,550 bytes, SHA `c68dfa001d89d15e5f4f4275f03b7b5bd1e0ada79e1ca7a89b63041ad6988545`.

Runner SHA: `6c977bbda31c22e1a261d2a8f41f6f6841763dc2b2389a83525a2eae45a96a01`. Final fragment SHA: `855943991ba44932197e087d2f36ccd320f3c5a12c35267d57c56c95207604e4`.

The adapter substitutes unique bounded source extraction and Node's TypeScript stripping for the project's TypeScript-AST extractor. This evidence supports bounded red/green behavior; it is **not** the required Node v24.22.3 full-project AST run, browser acceptance, integrated CI, native proof or release readiness. Those remain with root and the existing owners.

## Unchanged adjacent sources

| Path | SHA-256, identical across baseline/Grok/corrected |
|---|---|
| `hosted/app/phone/components.tsx` | `c18753ee7c8b342831864cecc2694708f09fee6019a76c530b2c2ae743446424` |
| `hosted/tests/phone-record-tools.mjs` | `965af62fc693ed788bd487ea9f18aea8d2af2e54a4242d70331569d16632feb2` |
| `hosted/app/i18n/messages.ar.json` | `46ec9674ec1186d8bc3016c78739eda38542a7beca033a0f0617256b6cc154e9` |
