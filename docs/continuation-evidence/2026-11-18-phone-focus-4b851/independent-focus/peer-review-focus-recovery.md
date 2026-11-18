# Independent peer review: modal and Saved Clear focus recovery

## Decision and scope

**No blocking source defect or weakened assertion was found in the reviewed candidate.** The candidate is suitable to take through the root owner's pinned TypeScript/full-suite and real-browser checks. This source review does not certify those executions, accessibility acceptance, integration, or release readiness.

Base commit: `3fb5d97ec6f3568f2c8b27f148281926272a92fe`. Review was entirely read-only against local baseline/candidate source, except this review evidence. No product or fixture changes, test/script execution, installation, build, Mac call, or browser action was performed by this reviewer.

## Production behavior

The new `recoverPhoneFocus` helper in `components.tsx:8–24` defers its decision with requestAnimationFrame, then reads current focus and connection state. This covers an invoker or Clear button removed later in the React commit rather than trusting its connection state during cleanup.

The helper rejects recovery while the owning shell is disconnected, the closing dialog has reopened, another dialog is open in the same shell, or a connected focus target outside the closing dialog has already acquired focus. It therefore preserves native return to a surviving invoker and intentional focus moved elsewhere. It checks eligibility again after attempting invoker focus, preserving focus redirected by that focus event and allowing the heading fallback when the invoker cannot actually receive focus.

Heading lookup stays inside the captured PhoneApp shell and targets the existing `#phone-main .phone-page-heading h1[tabindex='-1']`. The lookup is independent of English/Arabic label text. Both explicit focus operations use preventScroll. The fallback is not a document-wide first heading.

`Modal` captures the actual pre-open invoker and closest phone shell before calling showModal. Cleanup still closes the native dialog, then schedules recovery using that captured scope. The open-state guard prevents a queued cleanup from stealing focus after the same dialog reopens or a replacement becomes active. Native cancel, busy, identity-check and form behavior are unchanged.

The PhoneApp diff is limited to the helper import and the existing Saved Clear handler. The three filter resets remain in their original order and are followed by recovery scoped through the existing heading ref. No record, bookmark, account, storage or deletion-message logic was changed in this candidate.

## Test validity

`phone-recovery-isolation.mjs` preserves the baseline contents and appends ten focus groups plus their controlled DOM/frame ports. The tests extract the actual Modal layout-effect callback and actual exported helper through TypeScript AST, and obtain the actual Clear handler through the existing production-handler extractor. Recovery logic is not duplicated in the test implementation.

The optional absent helper permits the old native-only source to execute as a meaningful red baseline; it does not inject a fake recovery implementation. The cases exercise surviving native/manual invoker return, removal before/after cleanup, failed focus on a connected invoker, live inside/outside focus chosen before close or recovery, focus redirected by the invoker event, reopened/replacement dialogs, disconnected scope/heading, and lost focus representations. Clear cases exercise actual state setters and button disappearance, plus later focus/modal/unmount boundaries.

The full `phone-record-tools.mjs` baseline/candidate diff contains only six lines to load/extract the real helper and two additions to existing handler bindings. All prior assertions remain unchanged, including actual rendered-button checks and the all-non-default query/view/stage reset case. The supplied null heading deliberately keeps these existing non-DOM tests focused on reset/render behavior; it calls the real helper's no-scope branch rather than replacing it with a success stub. Actual non-null heading behavior is exercised separately by the new focus tests.

One minor precision point is not a coverage blocker: the new Clear-focus fixture starts its query and view at their defaults, so that new case alone does not demonstrate their reset. The unchanged record-tools case starts all three filters non-default and still checks their resets strictly.

## Remaining acceptance boundaries

The fake DOM ports model connection state, native return, focus refusal/redirection, and scheduled frames. They do not prove the browser's actual native-dialog behavior, inertness, rendering/commit timing, viewport behavior, or focus/announcement experience. Root's browser reproduction should confirm the two observed paths: deleting the last record-only item and clearing the now-active Saved filters, while also confirming a surviving invoker and later user-chosen focus remain undisturbed.

The parent reports a separate bounded red/green runner using Node 24.22.1 and built-in TypeScript stripping because the full TypeScript dependency was unavailable there. This reviewer did not run or independently validate that runner. It is not the project's pinned/full AST test execution; those gates remain with root. No new broad test expansion is requested by this peer review.

## Exact reviewed source identities

| Path | Baseline SHA-256 | Candidate SHA-256 |
|---|---|---|
| `hosted/app/phone/components.tsx` | `c7614e923223d427e3a218f9c8d1038e4d90f244de9da8707bb92bf8dce90c52` | `c18753ee7c8b342831864cecc2694708f09fee6019a76c530b2c2ae743446424` |
| `hosted/app/phone/PhoneApp.tsx` | `77b3f3bd43f7a7fab19b68807118fba41bb95409701d054ed8232bc139a7dcba` | `2e9024fab451f70bff40872e3090b3ab13c07a312fa1c48b999cd43890a33ac4` |
| `hosted/tests/phone-recovery-isolation.mjs` | `56114b76ab4db6b5abb964e755bc89773f3043ce0451a020c36bbe4838881e06` | `11eb0b7ff330b1b9c40c7dee656ae4968f3e482aed7e8f94a01cf1530739749e` |
| `hosted/tests/phone-record-tools.mjs` | `a383e178f53782529ec4ff35a111113a7e13a752ceea22a0e24b351039686015` | `965af62fc693ed788bd487ea9f18aea8d2af2e54a4242d70331569d16632feb2` |
