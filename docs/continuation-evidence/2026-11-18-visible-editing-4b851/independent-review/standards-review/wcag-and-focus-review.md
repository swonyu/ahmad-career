# Bounded standards critique: Keep editing visibility

## Decision

**No additional application defect is established by the supplied evidence. Retain the current two-option correction.** Root reports immediate post-Enter measurements, before any revealing action: Cancel at 666.1459–715.1459 and dirty Delete at 759.1459–803.1459, within the dialog's 16–828 bounds and the 390×844 viewport; dialog scrollTop is 166 and the stage/note/date draft remains intact. This is evidence for those exercised cases, not all engines or physical assistive technology.

The earlier hidden target was a reproduced defect. The new claim that native focus may fail on another layout/browser is a hypothesis until a corresponding failure is captured. Grok assertions were supplied through root's summary; this review evaluates their attribution and reasoning, not unseen verbatim paragraphs.

## Standards distinction

| Guidance | Actual scope | Consequence here |
| --- | --- | --- |
| [WCAG 2.4.7, AA](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html) | A visible keyboard focus indicator. | Component bounds alone do not establish indicator visibility. Inspect the existing keyboard screenshot; do not invent a missing-ring defect. |
| [WCAG 2.4.11, AA](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) | Prevents complete hiding by author-created content; partial visibility can satisfy this minimum. | Heavy's minimum-versus-full distinction is correct. It does not lower the chosen product criterion. |
| [WCAG 2.4.12, AAA](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-enhanced.html) | Addresses any author-created obscuring of the focused component. | Full-target visibility is a suitable stronger acceptance rule for these small buttons, not proof of whole-app AAA conformance. |

The [normative WCAG 2.2 Recommendation](https://www.w3.org/TR/WCAG22/) confirms those levels and scopes. Its minimum criterion also contains qualifications for user-movable/user-opened content; this review does not issue a formal page-wide WCAG verdict from one rectangle.

[APG explicitly identifies itself as informative guidance](https://www.w3.org/WAI/ARIA/apg/about/introduction/), with illustrative examples. The [dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) guides initial focus and return on modal close. Here, Keep dismisses an inline alert while the dialog stays open, so opener restoration is a logical product choice rather than an exact APG-mandated handler.

## Native focus and explicit scrolling

[WHATWG HTML, focus method step 4](https://html.spec.whatwg.org/multipage/interaction.html#dom-focus), invokes the scrolling algorithm with auto/center/center when preventScroll is false. There is no partly-visible-target exception in that step. [MDN focus](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus) corroborates the default scrolling behavior. A viewport-only rationale does not account for clipping by the dialog's own scrollport.

The underlying [CSSOM View algorithm](https://drafts.csswg.org/cssom-view/#scroll-a-target-into-view) visits ancestor scrolling boxes and the viewport from inner to outer. This source is the **5 November 2026 Editor's Draft**, not a final Recommendation or proof of every browser implementation. Native focus is not inherently restricted to one dialog's scroll offset.

[MDN scrollIntoView](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView) documents all scrollable containers as its default scope. Adding that call does not itself guarantee an unchanged document offset. A different alignment/container policy is an implementation choice requiring its own evidence; no cited source requires that extra call for this working case.

## Attribution corrections

- The exact short wording **“The keyboard focus always remains visible.”** appears in the [APG modal example's explanatory content](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/dialog/), not as the normative text of SC 2.4.11 or 2.4.12.
- Do not attribute a full-target requirement to the AA minimum. Conversely, do not treat a partly visible component as automatically satisfying the separate focus-indicator requirement.
- The cited guidance does not prescribe zero document/main movement or zero short-form offset changes. Those can be product checks; they are not automatic evidence of nonconformance. The APG example even discusses mobile background movement as an implementation consideration.
- Do not present native focus, or an explicit scrolling call, as universal cross-browser/AT certification. Heavy is correct to keep physical AT acceptance separate.

## Bounded remaining checks

Continue the already-owned English/Arabic and supported browser/native acceptance. Preserve immediate post-recovery focus, visible bounds and draft checks. In the same runs, observe the actual keyboard focus indicator and any disruptive background/short-form movement. Record scroll offsets when investigating a concrete jump; a particular offset is not the desired outcome. Only a reproduced visibility, focus, or disruptive-movement failure justifies another correction.

No app/test edits, execution, native builds, Mac actions, or browser control were performed. `source-refs.json` contains exact source URLs, retrieved reference IDs, and status notes for root to reopen before citation. The separate peer review independently reached the same native-focus conclusion.
