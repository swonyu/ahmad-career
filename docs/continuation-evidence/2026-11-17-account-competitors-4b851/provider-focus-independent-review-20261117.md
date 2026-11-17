# Provider action focus — independent source review

Reviewed 17 November 2026, 22:38 Riyadh (19:38 UTC).

## Decision and scope

**Bounded source approval for the candidate. No integration-blocking defect was found in the reviewed diff.** Actual Chrome acceptance, bilingual appearance, and project gates remain with the integrating owner. This review does not establish VoiceOver/TalkBack behavior, real OAuth, native acceptance, WCAG conformance, or release readiness.

Reviewer: /root/account_failure_focus_review. The reviewer read source and primary documentation, and ran a whitespace-only git diff check. No product files were edited; no application tests, builds, browser actions, native operations, dependency changes, process termination, or external coordination messages were performed. This report is the sole authorized evidence write.

## Source identity

Repository: /Users/saleh/Developer/career-finder-feed-continuation-20261117-4b851318da2d

Base HEAD: ca3d3411d8b5b36fa7093dff782f4a7b931261c7

Reviewed file: hosted/app/components/ProviderConnections.tsx

Baseline SHA-256: 596d32d1ef51408040e3482204579adf74363653ef75541b35e49f3da9dc4b2a

Candidate SHA-256: 349647af29ff63768e342e4ffd96a5efdecbd2828a4867befedd6d7c6f761e5c

The candidate was dirty source above the stated clean baseline when read. The exact candidate hash, rather than HEAD alone, identifies this review. Its diff adds the stable heading ref, a synchronous focused-action helper, currentTarget arguments, retry focus handoffs, and a message/control semantic boundary. Git diff --check for this file exited 0; that is only whitespace validation.

Related files inspected: provider-change.ts, provider-auth.ts, account-recovery-lifecycle.mjs, provider-connections.mjs, relevant AccountPanel source and global/i18n CSS selectors.

## Observed problem and evidence qualification

The following browser observations were supplied by root; this reviewer did not independently operate the browser:

- Baseline Disconnect confirmation receives focus correctly; native Tab reaches Confirm then Keep; Keep restores Disconnect with zero mutation.
- In the exact delayed POST503 case, all action buttons become disabled and focus is already BODY during busy state.
- After the 503 error, a native current-focus Tab reaches Disconnect Google, skipping the earlier Check current connection control.
- In the separate POST200/status-still-connected case, native Tab instead reaches Check current connection. Therefore BODY is not sufficient evidence that every recovery path has broken next-key order.
- Failure stays visible and announced through an alert. A later explicit status retry performs GET without replaying the disconnect POST.

The supported finding is loss of persistent visible action focus and an undesirable forward-navigation destination in the exact503 path. It is not an account-security defect or a completely blocked recovery. The broad claim that BODY always proves WCAG2.4.3 failure was rejected.

## Why the candidate is appropriately bounded

1. **Synchronous ownership.** preserveActionFocus compares document.activeElement with the actual initiating HTMLButtonElement. It does not infer user intent later from BODY. event.currentTarget is evaluated synchronously and passed as an element; no synthetic event object is retained across an await.

2. **Stable target.** The h2 has tabIndex=-1, uses the existing translated heading text, and remains rendered through checking, success, error, and provider-row replacement. It is not added to ordinary sequential tab stops. The actual globals.css includes a general :focus-visible rule, so the new heading is covered by the authored focus styling; a visual browser check is still required.

3. **No late focus capture.** No completion, catch, finally, timeout, effect cleanup, or readback branch calls the new helper. A user who moves away after explicit activation should therefore remain away when the request resolves. No document-wide listener or second operation lifecycle was added.

4. **Existing mutation safeguards unchanged.** The early busy/view guard still precedes the new focus handoff. provider-change.ts still enforces its exact account, revision, connection, operation identity, visibility, and abort checks. The candidate does not change request payloads, authorization URL validation, stale-result suppression, or the status readback needed before disconnection success.

5. **Retry remains a status refresh.** Both retry handlers only add an immediate focused-control handoff before their existing cancel/clear/refresh sequence. No POST path or automatic mutation replay was added.

6. **Existing confirmation behavior remains.** The activeDisconnect layout effect still focuses the explanation on opening. Keep connected still uses restoreDisconnect to restore the provider's Disconnect button. The added stable heading ref does not change the effect's dependency or target identity.

7. **No new window-focus revalidation path is apparent.** DOM element focus events do not bubble. The existing window focus listeners use the normal non-capture registration, not focusin or a capture listener. Focusing the heading inside the already active document therefore does not create a source-supported recursive status refresh or cancellation path. The browser request ledger should nevertheless confirm the expected request count.

8. **Live-region boundary is clearer.** The outer visual alert wrapper is now a div; the explanatory p alone has role=alert or role=status; Check current connection is a sibling. The change preserves message tone and retry labeling, and does not autofocus the live region.

## Residual checks and possible visual difference

Changing the notice from a direct card>p to a div means the old .card>p margin-bottom rule no longer applies to the wrapper. The following provider-row already has 1.25rem top margin and padding. This is a limited visual-spacing difference to inspect in narrow English and Arabic, not a demonstrated layout defect.

Expected meaningful browser checks on the exact candidate:

- Exact503: keyboard Confirm transfers focus immediately to the stable heading; it remains visible during busy state; after failure the next native Tab reaches Check current connection.
- Moved-away variant: move to a stable outside control during the delay; completion does not restore focus.
- Retry: heading handoff survives the checking render; exactly one extra status GET and zero extra disconnect POSTs.
- Success and POST200/status-still-connected: truthfulness remains unchanged; focus is not moved by completion.
- Keep connected: original confirmation/cancellation focus behavior and zero POST remain.
- Keyboard Connect: heading handoff does not change one-request behavior or the invalid-authorization-URL guard.
- English/Arabic narrow layouts: readable heading ring, no clipped feedback/control, and sensible spacing.
- Unmount/account revision change: no new late focus movement or mutation replay.

The existing controller suite and SessionRecovery/OAuth lifecycle suite do not establish mounted ProviderConnections DOM focus behavior. Actual browser checks are decisive for this repair. Do not create a hand-written browser DOM merely to claim this gap is covered.

## Primary-source basis and limits

### Focus persistence

WAI's keyboard-interface guidance describes the importance of persistent visible focus and warns that removing a focused control can move focus to BODY. This supports the usability concern; APG guidance is not itself a blanket WCAG failure determination.

https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/

### Focus order

WCAG2.4.3 evaluates meaningful, operable sequential order and permits different logical orders. The different next-Tab outcomes in the two baseline scenarios must remain in the evidence instead of being collapsed into one universal claim.

https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html

### HTML sequential focus navigation

The HTML standard includes a sequential focus navigation starting point. activeElement alone does not completely describe the browser's next sequential navigation target.

https://html.spec.whatwg.org/multipage/interaction.html#sequential-focus-navigation

### Alert semantics

WAI's alert pattern is intended to convey important information without taking keyboard focus. WAI-ARIA defines alert as assertive and atomic. Neither source establishes an unconditional ban on every descendant control. Moving the retry outside the message is a bounded semantic improvement, not a separately proven screen-reader fix or a reason to introduce alertdialog.

https://www.w3.org/WAI/ARIA/apg/patterns/alert/
https://www.w3.org/TR/wai-aria-1.2/#alert

### Event interaction

UI Events lists focus as non-bubbling and focusin as bubbling. This supports the assessment of the unchanged non-capture window-focus listeners; it is not a substitute for observing the candidate's actual ledger.

https://www.w3.org/TR/uievents/#event-type-focus

## Final review status

Approved at source-review scope for candidate SHA-256 349647af29ff63768e342e4ffd96a5efdecbd2828a4867befedd6d7c6f761e5c, contingent on root's targeted browser and project checks. No test result is asserted by this review. The result is bounded to the inspected diff and current baseline; later changes require proportionate re-review.

## Addendum — SignInOptions expired-session captions

### Decision and identity

**Bounded source approval; no integration-blocking finding.** This is low-impact semantic polish for the account recovery view, not an authentication or security repair.

Reviewed on 17 November 2026 against base ca3d3411d8b5b36fa7093dff782f4a7b931261c7.

File: hosted/app/components/SignInOptions.tsx

Candidate SHA-256: fa9818300bdd6c0316befcd04c9fb53ec1aa02282f5acfdbeffb611ac0e731fc

The source remained dirty above the stated baseline when reviewed. A file-scoped git diff --check exited 0; no TypeScript compiler, application test, browser, build or assistive-technology run was performed by this reviewer.

### Supplied reproduction

Root reported that actual Chrome's invalid_session/401 scenario showed the actionable Clear-expired-session explanation while the disabled Google and LinkedIn choices still displayed Availability could not be confirmed. Grok Build1 independently identified the controlling source expression. These are supplied observations, not new executions by this reviewer.

The old captions were literally uncertainty statements, so they should not be described as an explicit claim that a provider outage was proven. Their removal narrows distracting availability wording when the view already identifies an expired-session recovery action.

### Diff assessment

- unavailable now becomes null only for errorCode === invalid_session. In every other state, the previous checking, error/missing-status, and awaiting-setup precedence remains intact.
- The two caption elements render only when unavailable is non-null/truthy. The expression is a fixed nonempty string union or null, so this guard neither emits a stray numeric value nor calls the translator with null. This is source-level narrowing reasoning, not a typecheck result.
- Google configured-state logic is unchanged. LinkedIn still requires both configured and signInSupported === true before presenting a direct sign-in link. A connection-only provider does not become a login method.
- Both disabled-button branches remain disabled. Google keeps its existing accessible name; LinkedIn keeps its existing visible label. The candidate does not imply those routes have become available.
- SessionRecovery still renders under the existing invalid_session guard. Its account/recovery behavior is not edited.
- The ChatGPT destination, target, and explanatory text are unchanged.
- Ordinary non-invalid-session errors retain the same translated alert message and Check again refresh handler. Only the styled wrapper becomes a div, with the alert role on a message-only paragraph and the control as its sibling. No new mutation, retry loop, provider route or silent error swallowing is introduced.
- No translated key or wire value changes. Arabic/English consistency follows the same state predicate, subject to root's actual layout and wording check.

### Acceptance limits

Root should verify the actual candidate's 401 view has the recovery explanation, disabled provider choices and no redundant availability captions; a 503 still has those captions, its visible alert and explicit Check again action; successful refresh restores only the provider links allowed by the real status payload. The retry request ledger should remain GET-only. Both languages and narrow wrapping remain browser checks.

The previous alert-semantics caveat still applies: separating the button from the atomic live-region message clarifies intent, but this review does not claim that the old descendant button alone was an unconditional ARIA violation or that screen-reader behavior has been independently verified.

Source-review approval is limited to SHA-256 fa9818300bdd6c0316befcd04c9fb53ec1aa02282f5acfdbeffb611ac0e731fc. Actual Chrome results and the project's required type/lint/regression checks remain with root.
