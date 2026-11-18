# Saved job-link draft recovery — 18 November 2026

## Finding and corrected behavior

At base `ead12355246f1889f53f3d7bc3ff71cd42da4d92`, Saved → Add job link used uncontrolled inputs. Account lock unmounted that form while retaining only `{ kind: "add" }`. Original-account recovery reopened blank fields and incorrectly said the edits were back. Its URL, title, employer and location were also omitted from unfinished-edit exports and encrypted recovery.

This scoped change keeps all four fields in a dialog bound to the current account/workspace. Partial text, including an incomplete URL, is retained as a draft; ordinary public-HTTPS and job validation still run on explicit Save. New drafts use the existing encrypted recovery vault and its quotas, revision checks and reset fences. Existing profile and application-record recovery remains compatible.

Original-owner lock recovery and export include the entered fields. Opening a persisted recovery copy creates a separate editor identity, so saving or discarding one tab does not erase another tab's newer copy or the original source draft. Save and confirmed discard retire the current editor before removing its recovery copy; delayed autosaves cannot recreate it. A lock during cleanup cannot reopen a draft already saved or deliberately discarded. Failed, duplicate and wrong-scope saves retain the form and its recovery data. No bookmark is created by recovery itself.

The dialog adds an unfinished-job export action and localized recovery labels in English and Arabic. No theme, native navigation, employer integration, automatic submission or paid service changed.

## Verification

Pinned Node `v24.22.3` ran the seven named test files in `verification.json`: **190 cases passed, zero failed, skipped or cancelled**. This is the combined focused suite count, including existing tests and subtests, not 190 newly added scenarios. The new job-link groups exercise controlled JSX fields in both languages, incomplete-link retention, encrypted reconstruction, original-owner recovery/export, identity/workspace rejection, independent tab forks, cancellation, storage failure, duplicates, explicit export, delayed saves and lock during cleanup.

TypeScript `--noEmit`, the configured Oxlint gate (zero warnings/errors) and `git diff --check` passed. The exact modified-file SHA-256 values, command arguments and outcomes are in `verification.json`; the logs are retained alongside it. Dependencies used a temporary read-only reference to the coordinator's installation after byte-identical package-lock verification. No shared dependencies were installed or modified.

The first focused run found two test-harness adaptation errors, both retained in `targeted-tests-initial.log`: an existing test needed to install the newly named production discard handler, and the new lock test needed to await the same asynchronous recovery queue before reading through a separate instance. The assertions were preserved. A direct ESLint attempt was unconfigured; `eslint-unconfigured.log` records it, and the project's configured Oxlint command subsequently passed.

## Acceptance boundary

These are source, synthetic real-handler/storage and static JSX-render observations. They are not a browser, physical-device, native, live-provider, CI, deployment or release pass. The coordinator owns independent review, integrated regression and actual browser return/session-expiry verification. No real applicant details, account credentials, CV or employer submission was used.
