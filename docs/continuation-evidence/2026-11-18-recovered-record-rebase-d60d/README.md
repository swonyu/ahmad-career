# Explicit recovered-record review

Base: 4f72947dbda76ca5176fa42645337c6c739e6a2a. Expert engineering finding 3.

An explicit selection now prepares recovered values against the current saved record before the editor opens. The original recovered checkpoint and the displaced unfinished version remain alternatives. Ambiguous current records must be compared first; capacity and private-workspace boundaries remain enforced. Normal editor restoration and save revision guards remain unchanged. Selection writes no application record and sends no service request.

The exact same recovery harness failed on the unchanged source because selected older text did not restore, then passed 201 assertions across 61 scenarios after the correction. The added cases cover current revision binding, exact Arabic/multiline note restoration, restart/export preservation, deliberate save, stale context, conflicting saved records, capacity refusal, private scope, and a draft without a saved record. These are macOS host checks, not native UI or device acceptance.
