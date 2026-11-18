# Synthetic responsive and private-state review

Build the actual current phone UI into an external, isolated test artifact:

```sh
node tests/build-phone-viewport.mjs --source-root /absolute/path/to/hosted --output-dir /absolute/external/test-output
```

Serve that directory with the already authorized single managed preview daemon. Do not start a second server. The output is not a production route and must never be deployed. `index.html` provides viewport controls around `frame.html`; all displayed accounts and job records are explicitly synthetic.

## Isolation

The builder uses the actual PhoneApp, components, schemas, encrypted vault and recovery code, and compiles the actual CSS with the installed Tailwind/PostCSS configuration. It substitutes only HTTP, PDF selection (refused in this visual test), the standalone Next image adapter, and storage namespaces at build time. The output refuses real HTTP adapters and original storage names. HTTP has no fetch fallback; CSP also blocks connections and workers. Online mutations and external link navigation are refused.

The fixture uses separate `career-finder-synthetic-responsive-vault`, `career-finder-synthetic-responsive-safety`, and `career-finder:test:responsive:appearance:v1` stores. It never opens or changes the existing production guest draft, account vault or appearance key. `source-manifest.json` records the real component/CSS hashes and test bundle hash.

## Review flows

- Compare 320, 390, 768 and 1200 CSS pixel iframe widths. Use **Check layout and focus** to record rendered scroll width and horizontal overflow.
- **Text 200%** changes the fixture root font size to 200% for a separate text-resize stress check. This is not evidence of native browser zoom, physical Dynamic Type or a real phone viewport. Check actual browser zoom separately when that UI is available.
- Use the actual header Settings button and navigation Settings section. Check keyboard focus, each appearance choice, dialogs, labels and controls in light/dark modes.
- From **Synthetic account A**, hold the account recheck. Private Settings content must disappear. Resolve it to restore the same account, or switch the response to B to exercise the real account-lock behavior.
- **Initial account check fails** supplies an original synthetic account prop, then rejects both initial workspace and auth-status requests with 401. No current account is confirmed. The fixture mounts after `pageshow`, matching hydration that completes after load, so a later visibility recheck cannot mask the initial failure. No focus or visibility event is removed. The visible evidence records the first synthetic email render, if any. Inspect whether the old email appears in Settings; this is the regression scenario, not an authorized live account.
- For sticky-nav focus, use actual Tab/Shift+Tab through the iframe. Let the authored smooth scroll settle before measuring. The visible evidence reports the focused control's bounds versus the fixed nav bounds; a focused body is excluded from overlap claims. Partial overlap and total obscuring are reported separately; WCAG AA's minimum and AAA's enhanced criterion must not be conflated.

For dialog opener-focus restoration, also open the generated `frame.html` directly in the same managed preview. Wrapper iframe tab boundaries are not evidence of a top-level modal focus trap. Verify both Escape and the Close button return focus to the opener.

These checks do not establish live provider consent, real account isolation, physical-device acceptance, screen-reader acceptance or release readiness.
