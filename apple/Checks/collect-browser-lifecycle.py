#!/usr/bin/env python3
"""Copy only bounded, schema-checked DEBUG lifecycle traces from the owned CI app."""
import argparse
import hashlib
import itertools
import json
import math
import os
from pathlib import Path
import re
import stat
import subprocess
import uuid

MAX_BYTES = 64 * 1024
MAX_SCOPES = 64
MAX_RECORDS = 1024
LOG_NAME = "browser-lifecycle.jsonl"
FOCUS_LOG_NAME = "focus-lifecycle.jsonl"
BUNDLE_ID = "com.ahmadalayed.career"
NORMAL_FLAGS = {
    "requestedPresentation", "hasTrackedBrowser", "hasObservedController", "matchesTrackedBrowser",
    "dismissalReported", "dismantled", "hasDismissCallback", "presenterInWindow",
    "presenterIsBeingPresented", "presenterIsBeingDismissed", "presentedControllerIsObserved",
    "observedHasPresenter", "observedIsBeingPresented", "observedIsBeingDismissed", "observedViewInWindow",
}
NORMAL_EVENTS = {
    "binding_update", "presenter_did_appear", "detached_browser_observed", "present_requested",
    "present_completed", "delegate_did_finish", "presentation_did_dismiss", "report_dismissal_entered",
    "report_dismissal_applied", "dismantle_entered", "teardown_dismiss_requested", "dismantle_finished",
}
EVENT_FLAGS = {event: NORMAL_FLAGS for event in NORMAL_EVENTS}
EVENT_FLAGS.update({
    "binding_assigned_false": {"bindingPresented"},
    "teardown_dismiss_completed": {"hasObservedController", "observedHasPresenter", "observedIsBeingPresented", "observedIsBeingDismissed", "observedViewInWindow"},
    "capacity_reached": {"capacityReached"},
})
FOCUS_FIELDS = {"none", "url", "title", "company", "location", "unknown"}
FOCUS_NORMAL_FLAGS = {
    "bindingNone", "bindingURL", "bindingTitle", "bindingCompany", "bindingLocation", "bindingUnknown",
    "busy", "sceneActive", "hasNativeField", "nativeIsFirstResponder", "nativeHasWindow",
    "nativeEnabled", "nativeUserInteractionEnabled", "nativeIdentifierKnown",
}
FOCUS_NORMAL_EVENTS = {
    "editor_appeared", "focus_binding_changed", "text_editing_began", "text_editing_ended",
    "keyboard_will_show", "keyboard_did_show", "keyboard_will_hide", "keyboard_did_hide",
    "done_action_entered", "editor_disappeared",
}
FOCUS_EVENT_FLAGS = {event: FOCUS_NORMAL_FLAGS for event in FOCUS_NORMAL_EVENTS}
FOCUS_EVENT_FLAGS["capacity_reached"] = {"capacityReached"}
BOUNDARY = "Original diagnostic bytes only. Missing callbacks may reflect logging failure or capacity; these logs do not establish UI, timing, visual, or release acceptance."

class CollectionFailure(Exception):
    pass

def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise CollectionFailure("duplicate_json_key")
        result[key] = value
    return result

def trace_schema(kind):
    if kind == "browser":
        return LOG_NAME, EVENT_FLAGS
    if kind == "focus":
        return FOCUS_LOG_NAME, FOCUS_EVENT_FLAGS
    raise CollectionFailure("unknown_trace_kind")

def validate_log(data, kind="browser"):
    _, event_flags = trace_schema(kind)
    if not 0 < len(data) <= MAX_BYTES or not data.endswith(b"\n"):
        raise CollectionFailure("invalid_log_size_or_termination")
    try:
        lines = data.decode("utf-8").splitlines()
        if not 0 < len(lines) <= MAX_RECORDS:
            raise CollectionFailure("invalid_record_count")
        records = [json.loads(line, object_pairs_hook=unique_object) for line in lines]
    except (UnicodeError, ValueError, TypeError, RecursionError):
        raise CollectionFailure("invalid_json") from None
    for record in records:
        expected_fields = {"event", "uptime", "flags"} | ({"field"} if kind == "focus" else set())
        if not isinstance(record, dict) or set(record) != expected_fields:
            raise CollectionFailure("unexpected_record_fields")
        event, uptime, flags = record["event"], record["uptime"], record["flags"]
        if not isinstance(event, str) or event not in event_flags:
            raise CollectionFailure("unknown_event")
        if kind == "focus" and (not isinstance(record["field"], str) or record["field"] not in FOCUS_FIELDS):
            raise CollectionFailure("unknown_field")
        try:
            valid_uptime = type(uptime) in (int, float) and math.isfinite(uptime) and uptime >= 0
        except OverflowError:
            valid_uptime = False
        if not valid_uptime:
            raise CollectionFailure("invalid_uptime")
        if not isinstance(flags, dict) or set(flags) != event_flags[event] or any(type(value) is not bool for value in flags.values()):
            raise CollectionFailure("unexpected_flags")
        if event == "capacity_reached" and (flags["capacityReached"] is not True or
                                            (kind == "focus" and record["field"] != "none")):
            raise CollectionFailure("invalid_capacity_marker")
    return records

def bounded_read(path):
    first = path.lstat()
    if not stat.S_ISREG(first.st_mode) or not 0 < first.st_size <= MAX_BYTES:
        raise CollectionFailure("not_a_bounded_regular_log")
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as source:
        opened = os.fstat(source.fileno())
        if (opened.st_dev, opened.st_ino, opened.st_size) != (first.st_dev, first.st_ino, first.st_size):
            raise CollectionFailure("source_changed")
        data = source.read(MAX_BYTES + 1)
        after = os.fstat(source.fileno())
    if len(data) != first.st_size or (after.st_size, after.st_mtime_ns) != (first.st_size, first.st_mtime_ns):
        raise CollectionFailure("source_changed")
    return data

def collect(namespace, output, kind="browser"):
    log_name, _ = trace_schema(kind)
    output.mkdir(parents=True, exist_ok=False)
    result = {"schemaVersion": 1, "status": "no_logs", "files": [], "errors": [], "boundary": BOUNDARY}
    if not namespace.exists() and not namespace.is_symlink():
        return result
    if namespace.is_symlink() or not namespace.is_dir():
        result.update(status="failed_closed", errors=[{"code": "invalid_namespace"}]); return result
    with os.scandir(namespace) as entries:
        scopes = list(itertools.islice(entries, MAX_SCOPES + 1))
    if len(scopes) > MAX_SCOPES:
        result.update(status="failed_closed", errors=[{"code": "too_many_scopes"}]); return result
    seen = set()
    for entry in sorted(scopes, key=lambda item: item.name):
        try:
            scope = str(uuid.UUID(entry.name)).upper()
        except ValueError:
            continue
        if scope != entry.name.upper() or scope in seen:
            result["errors"].append({"code": "invalid_or_duplicate_scope"}); continue
        seen.add(scope)
        if entry.is_symlink() or not entry.is_dir(follow_symlinks=False):
            result["errors"].append({"scope": scope, "code": "invalid_scope_directory"}); continue
        source = Path(entry.path) / log_name
        if not source.exists() and not source.is_symlink():
            continue
        try:
            source_attributes = source.lstat()
            data = bounded_read(source)
            records = validate_log(data, kind=kind)
            if bounded_read(source) != data:
                raise CollectionFailure("source_changed")
            final_attributes = source.lstat()
            identity = lambda value: (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns)
            if identity(source_attributes) != identity(final_attributes):
                raise CollectionFailure("source_changed")
            target = output / (scope + ".jsonl")
            with target.open("xb") as saved:
                saved.write(data)
            target.chmod(0o444)
            result["files"].append({
                "file": target.name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                "records": len(records), "capacityReached": any(row["event"] == "capacity_reached" for row in records),
                "uptimeNondecreasing": all(left["uptime"] <= right["uptime"] for left, right in zip(records, records[1:])),
                "sourceReadTwiceMatched": True,
                "sourceModificationTimeNs": source_attributes.st_mtime_ns,
            })
        except CollectionFailure as error:
            result["errors"].append({"scope": scope, "code": str(error)})
        except OSError:
            result["errors"].append({"scope": scope, "code": "io_failure"})
    result["status"] = "failed_closed" if result["errors"] else ("copied" if result["files"] else "no_logs")
    return result

def validate_selection(selection, device, checkout):
    if not isinstance(selection, dict) or not isinstance(selection.get("createdDevice"), dict):
        raise CollectionFailure("invalid_selection")
    try:
        normalized = str(uuid.UUID(device)).upper()
    except (ValueError, TypeError, AttributeError):
        raise CollectionFailure("invalid_owned_device") from None
    created = selection.get("createdDevice", {})
    if normalized != device.upper() or str(created.get("udid", "")).upper() != normalized:
        raise CollectionFailure("owned_device_mismatch")
    if not re.fullmatch(r"[0-9a-fA-F]{40}", checkout or "") or selection.get("checkoutSHA") != checkout:
        raise CollectionFailure("checkout_mismatch")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--selection", required=True, type=Path)
    parser.add_argument("--device", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--kind", choices=("browser", "focus"), default="browser")
    args = parser.parse_args()
    output_was_absent = not args.output.exists() and not args.output.is_symlink()
    try:
        if not output_was_absent:
            raise CollectionFailure("existing_output_must_not_be_overwritten")
        if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("RUNNER_OS") != "macOS":
            raise CollectionFailure("disposable_macos_ci_required")
        selection = json.loads(args.selection.read_text())
        checkout = os.environ.get("GITHUB_SHA", "")
        validate_selection(selection, args.device, checkout)
        lookup = subprocess.run(["xcrun", "simctl", "get_app_container", args.device, BUNDLE_ID, "data"],
                                capture_output=True, text=True, timeout=15)
        if lookup.returncode or not lookup.stdout.strip():
            args.output.mkdir(parents=True, exist_ok=False)
            report = {"schemaVersion": 1, "status": "app_container_unavailable", "files": [], "errors": [], "boundary": BOUNDARY}
        else:
            lines = lookup.stdout.strip().splitlines()
            if len(lines) != 1 or not Path(lines[0]).is_absolute():
                raise CollectionFailure("invalid_container_lookup")
            namespace = Path(lines[0]) / "Library/Application Support/CareerFinderUIAcceptance"
            report = collect(namespace, args.output, kind=args.kind)
        report.update(checkoutSHA=checkout, ownedDevice=args.device.upper())
        (args.output / "manifest.json").write_text(json.dumps(report, indent=2) + "\n")
        print(args.kind.capitalize() + " lifecycle diagnostics: " + report["status"] +
              "; original logs: " + str(len(report["files"])))
        return 1 if report["status"] == "failed_closed" else 0
    except (CollectionFailure, OSError, ValueError, TypeError, OverflowError, RecursionError, subprocess.SubprocessError) as error:
        # Do not echo arbitrary payloads, source paths, URLs or subprocess errors.
        code = str(error) if isinstance(error, CollectionFailure) else "collection_unavailable"
        if output_was_absent:
            try:
                args.output.mkdir(parents=True, exist_ok=True)
                receipt = args.output / "manifest.json"
                with receipt.open("x") as saved:
                    saved.write(json.dumps({"schemaVersion": 1, "status": "failed_closed", "files": [],
                                           "errors": [{"code": code}], "boundary": BOUNDARY}, indent=2) + "\n")
            except OSError:
                pass
        print("Lifecycle collection could not retain validated originals.")
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
