# Career Finder record export focus candidate

## Evidence and scope

Root reproduced the defect with a direct DOM CUA click at 06:26:32 UTC on 18 November 2026: Export unfinished record downloaded correct JSON and retained the dirty record, but BODY remained focused with the modal open and its controls enabled. No download-event wait or reconnect was involved in that reproduction.

This candidate starts from root's hosted PhoneApp action-wrapper SHA 0deaf9a6a9423ba5753cef6e0e2acfc670a161c423bd0a6d2db105803d7fc1b0, on ac6a0b8651c8f5348f7976ee8a84d8a10890a082 plus uncommitted action-wrapper changes. Only isolated copies were edited. The original shared checkout was not modified by this reviewer.

## Implementation

A record-export-only handler captures the button, dialog, editor form, record recovery identity and epoch. It awaits the existing run wrapper without changing run, download, exportUnfinished, errors, drafts or persistence. One animation frame restores native visible focus only when the same enabled action and editor still exist and focus is lost. It checks account/generation changes, newer busy or identity work, a reopened discard prompt, replaced or disconnected forms, disabled/hidden/inert ancestry and intentional focus. It also leaves an inactive document alone (document.hasFocus must be true). It does not call closed-modal recovery or focus the background page heading.

## Actual host checks

Pinned Node v24.22.3, existing tests/phone-recovery-isolation.mjs, identical new assertions on baseline and candidate:

- Baseline: 60 tests, 57 pass, 3 fail. The three failures are actual missing focus restoration after success/error and missing redirect triggered by the absent restoration. No missing helper or module error remains in the final baseline.
- Candidate: 60 tests, 60 pass, 0 fail, 0 skipped.

The harness executes the real button handler (baseline inline or candidate named handler), run, exportUnfinished and unfinished functions. DOM ports model the reproduced disable-to-BODY behavior; downloads capture only synthetic JSON. It checks unchanged draft/export content, error reporting, account/editor identity, no late focus steal and inherited unavailable state.

An initial harness omitted the production z export needed by message() on the error path. This was corrected identically for baseline and candidate; initial logs and patch are preserved under initial-harness. It was a test-environment correction, not a production finding.

## Remaining acceptance

Root owns integration, required type/lint/full hosted gates, and actual EN/AR browser acceptance. These have not been run by this reviewer. Check immediate active element, document.hasFocus, button visibility within the modal, same dirty fields and correct download after a direct click/Enter without reconnect. If Chrome's download UI makes document.hasFocus false, distinguish browser focus transfer before changing that guard. No native pass, live-provider pass, deployment or release is claimed.

See source-receipt.json, verification-receipt.json, final-preservation-receipt.json and the baseline/candidate stdout/stderr logs for exact hashes, commands and outcomes.
