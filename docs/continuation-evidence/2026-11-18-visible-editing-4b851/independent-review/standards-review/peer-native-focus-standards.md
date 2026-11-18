# Native focus scrolling: independent standards cross-check

Reviewed 18 November 2026 by `/root/dependency_state_0410/ssr_contract_review`. Scope: HTML focus algorithm, its CSSOM scrolling operation, and MDN API documentation. No app, test, browser, Mac, installation, or build actions were performed.

## Decision

**The reviewed sources do not require an additional `scrollIntoView()` call after `focus({ preventScroll: false })`.** The native focus operation already invokes scrolling. An explicit call can implement a different alignment or containment policy, or address a reproduced browser defect; it is a separate design decision. Grok's suggestion that partial viewport visibility alone defeats native focus scrolling is not a rule found in these algorithms. No additional app defect is established by this standards review.

## Primary-source findings

### 1. WHATWG HTML: focus management APIs

Source: <https://html.spec.whatwg.org/multipage/interaction.html#dom-focus>

The default `preventScroll` value is false. Once the focus call is permitted, its method steps perform focusing and then invoke scroll-target-into-view with behavior auto and both alignments center. There is no partly-visible exception in that step.

Short attributable excerpt: “scroll a target into view given this, "auto", "center", and "center".”

Evidence: focus method step 4, retrieved lines 1561–1568; default dictionary, lines 1345–1350. The live page identified itself as updated 17 November 2026. Citations: genui{"citation":{"refs":["turn114131587view0","turn451645164view0"]}}

### 2. CSSOM View: the underlying scroll operation

Source: <https://drafts.csswg.org/cssom-view/#scroll-a-target-into-view>

This is the CSSWG Editor's Draft, dated 5 November 2026, not a final published Recommendation. The operation considers ancestor scrolling boxes and the viewport from inner to outer, stopping at a cross-origin boundary or a supplied container boundary. HTML's focus invocation supplies no container boundary. Center alignment computes a target position; scroll bounds and snap behavior can affect the result.

Short attributable excerpt: “in order of innermost to outermost scrolling box”.

Evidence: section 6.1, retrieved lines 1367–1456. Citations: genui{"citation":{"refs":["turn194974438view1","turn194974438view2","turn194974438view3"]}}

### 3. MDN: HTMLElement.focus()

Source: <https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus>

MDN corroborates the default scrolling behavior and distinguishes it from focus indication. The method returns undefined; this API description does not provide an awaitable completion result.

Short attributable excerpt: “By default the browser will scroll the element into view after focusing it”.

Evidence: introduction, preventScroll parameter, and return value, retrieved lines 187–219. Citation: genui{"citation":{"ref":"turn170042566view1"}}

### 4. MDN: Element.scrollIntoView()

Source: <https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView>

The explicit method offers alignment and container choices. Its defaults are block start, inline nearest, and all containers. Nearest alignment minimizes movement; nearest container limits the affected container. These are different options. MDN cautions that some parts have varying support; this review did not establish support for a particular native device fleet.

Short attributable excerpt for the all-container choice: “All scrollable containers are impacted (including the viewport).”

Evidence: retrieved lines 180–252. Citations: genui{"citation":{"refs":["turn170042566view3","turn194974438view4"]}}

## Application to the proposal

- **Partial visibility:** the normative focus step requests center alignment without testing whether a portion is already visible. A failure on a particular engine would require actual reproduction; it cannot be inferred solely from the control being partly visible.
- **Document scrolling:** native focus is not specified as dialog-only. A generic additional `scrollIntoView()` call also does not promise an unchanged document offset. Treat a no-document-scroll requirement as an explicit product policy with its own acceptance evidence.
- **Short forms:** the algorithms do not promise zero movement whenever the control is already visible. A no-short-form-scroll policy would also be a separate choice, not a standard-derived prerequisite for the present fix.
- **Visibility guarantee:** requesting the scrolling algorithm is not proof of the final pixels on every browser, after later layout changes, or under unrelated occlusion. An element larger than its viewing area cannot fit fully. Neither an extra API call nor this review replaces measured acceptance.

These conclusions are inferences from the cited API contracts, not newly observed application failures.

## Observed result and remaining evidence boundary

Parent relayed root's actual English browser result for PhoneApp SHA `e3454df4c4a4189475097d5bcc0ac2e2bf1fe53447d3046513c6eb780a9cd998`: Keep via Enter returned Cancel, with its vertical bounds 666.1459–715.1459 inside dialog bounds 16–828 at viewport 390×844; dialog scrollTop was 166. Delete was also visible at 759.1459–803.1459. Stage, note, and date survived, and no intervening action revealed the target. This reviewer did not capture those observations independently.

That report supports the exact exercised English case. It does not establish Arabic, every engine, keyboard/zoom condition, or all native devices. Grok's broader concern remains a hypothesis unless a concrete failure is produced. The narrow two-option correction has no additional blocker established by these primary sources.

Root must open the supplied sources itself before citing them in its final answer. Machine-readable source refs and exact URLs are in the companion JSON.
