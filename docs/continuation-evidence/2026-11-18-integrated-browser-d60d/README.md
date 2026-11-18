# Actual integrated SSR browser acceptance

Hosted source: 963e871446b73c05c3be742f0b19cac91b7218d3; identical hosted source in combined cbe3b29d0b14f357cb6aab1b1b9f4425ef1fa83d. Node24.22.3 served the actual production Worker (5,768,585 bytes, SHA256 9a09b95840c669de91e365e289a465e44d585c8cbbb23d89f0a1173661f83633). All93 build-source inputs were matched against both the sealed hosted tree and combined tree before serving. No production source was altered for these checks.

## Actual Chrome app checks

The loopback-only production Worker ran with anonymous synthetic guest identity, ephemeral server storage and outbound requests blocked. Through visible UI, root created one clearly labeled synthetic job, saved a mixed Arabic/English multiline private note, reloaded, and observed the exact original note in the record editor. Root then edited the note, downloaded the unfinished record, verified both original and draft text in the real JSON download, and confirmed the enabled export button retained visible keyboard focus. Tab moved to the delete control and scrolled it into view. Cancel and Keep editing restored visible focus to Cancel; the draft was then deliberately saved. Arabic language persisted through reload; the newly saved note reopened exactly. English was restored at completion. Final console warning/error inspection was empty.

The measured actual integration viewport was390 CSS pixels wide and844 high, with no horizontal document overflow. An attempted320 override did not change this tab's measured390 width; it is retained as an unsuccessful size-control attempt and is not a320 pass. Earlier exact hosted PhoneApp/CSS acceptance at320 and enlarged action text remains separately documented in the record-actions evidence. Temporary viewport override was reset.

## Actual module-worker PDF checks

The separate test-only fixture used the exact current extracted PhoneApp.readPDF/assertCurrent handlers, actual PDF client and same-origin module worker, and bounded parser. Normal valid and compressed-object-stream PDFs were accepted as1 and2 pages. Malformed, truncated, password-encrypted and cyclic PDFs were rejected while preserving the previous CV and leaving the form unchanged. Cancel-after-worker-payload and synthetic owner invalidation-after-valid-result also preserved the prior CV. Eight real workers started and eight were terminated; no result left an active worker.

The fixture records one script-src eval denial before any file selection. Its original strict CSP was unchanged. All eight actual module-worker cases completed; browser warning/error log inspection was empty. The origin of that pre-selection eval attempt was not established, so no claim of a zero-violation CSP run is made.

## Limits and preserved sessions

These checks establish local production SSR/hydration, guest browser-storage roundtrip, record export/focus and the isolated PDF worker/handler cases. They do not establish real account sign-in, live providers, deployment ingress headers, native devices or assistive-technology traversal. Provider availability intentionally could not be confirmed in the outbound-blocked loopback setup. PDF owner change was synthetic.

The three existing Grok chats were retained without additional prompts after the user reported exhausted usage. The reviewed production preview was left available. Superseded owned browser fixture tabs were closed. The first direct Miniflare startup failed before using the project's tool-environment setup; applying that existing setup and starting from the hosted working directory produced the verified server, with no product-source correction.
