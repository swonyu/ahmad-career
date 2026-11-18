#!/usr/bin/env python3
"""Validate retained simctl evidence without booting or modifying a simulator."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys

UUID = r"[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}"
MONITOR = re.compile(r"^Monitoring boot status for .+ \((" + UUID + r")\)\.$")
STATUS = re.compile(
    r"^\[[^\]\r\n]+\] Status=(\d+), isTerminal=(YES|NO), Elapsed=([0-9:]+)\.$"
)
SUCCESS = 4294967295


def verify(boot_log, inventory, device_id, process_results):
    """A zero exit code or Booted inventory state alone cannot establish readiness."""
    reasons = []
    if not re.fullmatch(UUID, device_id):
        reasons.append("The selected device identifier is invalid.")
    for name in ("boot", "log", "inventory"):
        if process_results.get(name) != 0:
            reasons.append(f"The {name} command did not complete successfully.")

    lines = [line.strip() for line in boot_log.splitlines() if line.strip()]
    monitors = []
    for line in lines:
        match = MONITOR.fullmatch(line)
        if match:
            monitors.append(match.group(1))
        elif line.startswith("Monitoring boot status"):
            reasons.append("The boot log contains an unrecognized device-identification line.")
    if len(monitors) != 1 or monitors[0].upper() != device_id.upper():
        reasons.append("The boot log must identify only the exact selected device.")
    records = []
    for index, line in enumerate(lines):
        match = STATUS.fullmatch(line)
        if match:
            records.append({
                "line": index, "status": int(match.group(1)),
                "terminal": match.group(2) == "YES", "elapsed": match.group(3),
            })
        elif "Status=" in line:
            reasons.append("The boot log contains an unrecognized status record.")
    if re.search(r"\b(?:failed|failure)\b|^error:|^An error was encountered",
                 boot_log, re.IGNORECASE | re.MULTILINE):
        reasons.append("The boot log reports a failure.")
    terminals = [record for record in records if record["terminal"]]
    if len(terminals) != 1:
        reasons.append("Exactly one terminal boot status is required.")
    if any(record["status"] not in {0, 1, 2, 4, SUCCESS} for record in records):
        reasons.append("The boot log contains a failed or unknown status.")
    if any(record["status"] == SUCCESS and not record["terminal"] for record in records):
        reasons.append("A Finished status must be terminal.")
    final = records[-1] if records else None
    if not final or not final["terminal"] or final["status"] != SUCCESS:
        reasons.append("The final boot status must be terminal Finished.")
    elif lines[final["line"] + 1:] != ["Finished"]:
        reasons.append("The final status must end with an explicit Finished result.")

    matches = []
    devices = inventory.get("devices") if isinstance(inventory, dict) else None
    if not isinstance(devices, dict):
        reasons.append("The device inventory has no valid devices object.")
    else:
        for runtime, entries in devices.items():
            if not isinstance(entries, list) or any(not isinstance(item, dict) for item in entries):
                reasons.append("The device inventory contains an invalid device list.")
                continue
            for device in entries:
                if str(device.get("udid", "")).upper() == device_id.upper():
                    matches.append({"runtime": runtime, **device})
    if len(matches) != 1:
        reasons.append("The inventory must contain exactly one selected device.")
    selected = matches[0] if len(matches) == 1 else None
    if selected:
        if selected.get("isAvailable") is not True or selected.get("availabilityError"):
            reasons.append("The selected simulator is unavailable.")
        if selected.get("state") != "Booted":
            reasons.append("The selected simulator is not Booted.")
    return {
        "passed": not reasons,
        "reasons": list(dict.fromkeys(reasons)),
        "selectedDeviceID": device_id,
        "selectedDevice": {
            key: selected.get(key) for key in
            ("udid", "name", "runtime", "state", "isAvailable", "availabilityError")
        } if selected else None,
        "processResults": process_results,
        "bootObservation": {
            "monitoredDeviceIDs": monitors,
            "statusRecordCount": len(records),
            "terminalStatusCount": len(terminals),
            "finalStatus": final,
            "explicitFinished": bool(final and lines[final["line"] + 1:] == ["Finished"]),
        },
    }


def read_evidence(path, reasons):
    try:
        data = path.read_bytes()
        return data.decode("utf-8"), {
            "path": str(path), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()
        }
    except (OSError, UnicodeError) as error:
        reasons.append(f"Cannot read {path.name}: {error}")
        return "", {"path": str(path), "bytes": None, "sha256": None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", required=True)
    parser.add_argument("--boot-log", type=Path, required=True)
    parser.add_argument("--inventory", type=Path, required=True)
    parser.add_argument("--boot-exit", type=int, required=True)
    parser.add_argument("--log-exit", type=int, required=True)
    parser.add_argument("--inventory-exit", type=int, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    input_reasons = []
    boot_log, boot_file = read_evidence(args.boot_log, input_reasons)
    inventory_text, inventory_file = read_evidence(args.inventory, input_reasons)
    try:
        inventory = json.loads(inventory_text)
    except (ValueError, TypeError) as error:
        input_reasons.append(f"The device inventory is not valid JSON: {error}")
        inventory = None
    result = verify(boot_log, inventory, args.device, {
        "boot": args.boot_exit, "log": args.log_exit, "inventory": args.inventory_exit
    })
    result["reasons"] = input_reasons + result["reasons"]
    result["passed"] = not result["reasons"]
    receipt = {
        "schemaVersion": 1,
        "checkedUTC": datetime.now(timezone.utc).isoformat(),
        "runID": os.environ.get("GITHUB_RUN_ID"),
        "runAttempt": os.environ.get("GITHUB_RUN_ATTEMPT"),
        "checkoutSHA": os.environ.get("GITHUB_SHA"),
        **result,
        "inputs": {"bootLog": boot_file, "deviceInventory": inventory_file},
        "verifierSHA256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "scope": "Simulator boot evidence only; this is not native journey acceptance.",
    }
    args.output.write_text(json.dumps(receipt, indent=2) + "\n")
    print("iPhone simulator boot readiness: " + ("passed" if receipt["passed"] else "FAILED"))
    for reason in receipt["reasons"]:
        print("- " + reason)
    return 0 if receipt["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
