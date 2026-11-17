# iPhone connection regression follow-up

The combined source commit `56784d740a25d07d2fbd4616f57e55cf0cb4453f` completed [Phone quality run 44114195156](https://github.com/swonyu/ahmad-career/actions/runs/44114195156) with four of five jobs successful. The iPhone suite executed all 17 journeys: 16 passed, and `testProfileReadinessAndSimpleConnectionSetup` failed because the existing service address was not fully cleared.

The exact run's original before/after PNGs and accessibility snapshots were inspected. The field remained focused at the same frame before and after the triple tap; both snapshots are byte-identical. The subsequent real Delete action removed one hyphen. The whole-field-empty assertion correctly rejected this. No skipped journey, queued result, previous branch pass, or synthetic receipt establishes release acceptance.

## Focused CI support

The existing workflow now offers a manual `acceptance_scope` choice. `full` is the default and preserves every existing job and the full iPhone test invocation. Push and pull-request triggers remain unchanged. `iphone-connection` runs the exact existing connection journey once, names its job and artifact PARTIAL, and requires a single passing outcome for that named method. The other four jobs are explicitly skipped in focused mode. A partial success cannot establish five-job release readiness. Invalid scopes fail before invoking the build command.

The workflow YAML and shell syntax were checked. A shell command stub verified that full mode supplies the same arguments as the previous workflow and focused mode adds only the exact one-test selector. This is routing verification, not native execution. No dispatch or native build was invoked by this change.

## Ownership and next gate

The original account source owner is actively preparing a real, localized service-address Clear control and its actual UI journey. The recovery workspace leaves those native files untouched until the owner seals a commit. The eventual integrated candidate requires a focused native connection run, then the full release gates. The strict keyboard, whole-field-empty, and exact-replacement checks remain mandatory.

The original work budget was extended explicitly by the user for another 24 hours, with the original start retained. The extended cutoff is `2026-11-18T22:26:12Z` (19 November 01:26:12 Riyadh); active-effort accounting remains separately unresolved. Free-only constraints remain in effect.
