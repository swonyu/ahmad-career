#!/usr/bin/env python3
"""Drive two test-only Files selections on one disposable GitHub simulator."""

import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time


RUNNER_BUNDLE = "com.ahmadalayed.career.UITests.xctrunner"
REQUESTS = ("career-finder-hid-CV-A.json", "career-finder-hid-CV-B.json")
KEYS = {"x", "y", "width", "height"}
DEADLINE_SECONDS = 660


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: drive-picker-hid.py SIMULATOR_UUID IDB_CLI IDB_COMPANION")
    device, cli, companion = sys.argv[1:]
    if os.environ.get("GITHUB_ACTIONS") != "true":
        raise SystemExit("GITHUB_ACTIONS=true is required")
    if not re.fullmatch(r"[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}", device):
        raise SystemExit("invalid simulator UUID")
    for executable in (cli, companion):
        if not Path(executable).is_file() or not os.access(executable, os.X_OK):
            raise SystemExit(f"missing executable: {executable}")

    deadline = time.monotonic() + DEADLINE_SECONDS

    def remaining() -> float:
        left = deadline - time.monotonic()
        if left <= 0:
            raise TimeoutError("660-second HID diagnostic deadline reached")
        return left

    container = None
    while container is None:
        result = subprocess.run(
            ["xcrun", "simctl", "get_app_container", device, RUNNER_BUNDLE, "data"],
            capture_output=True, text=True, timeout=min(15, remaining()), check=False,
        )
        if result.returncode == 0:
            candidate = Path(result.stdout.strip())
            if candidate.is_absolute() and candidate.is_dir():
                container = candidate
                break
        time.sleep(min(1, remaining()))

    documents = container / "Documents"
    first, second = (documents / name for name in REQUESTS)
    for index, request in enumerate((first, second)):
        while not request.exists():
            if index == 0 and second.exists():
                raise ValueError("CV-B request appeared before CV-A")
            time.sleep(min(1, remaining()))
        if not request.is_file() or (index == 0 and second.exists()):
            raise ValueError(f"out-of-order or non-file request: {request.name}")
        frame = json.loads(request.read_text())
        if not isinstance(frame, dict) or frame.keys() != KEYS or any(type(frame[k]) is not int for k in KEYS):
            raise ValueError(f"invalid request keys or types: {request.name}")
        x, y, width, height = (frame[k] for k in ("x", "y", "width", "height"))
        if not (0 <= x < width <= 10000 and 0 <= y < height <= 10000):
            raise ValueError(f"point outside finite positive frame: {request.name}")
        print(f"HID_REQUEST file={request.name} device={device} point={x},{y} frame={width}x{height}", flush=True)
        tap = subprocess.run(
            [cli, "--companion-path", companion, "ui", "tap", "--udid", device, "--api", "hid", str(x), str(y)],
            capture_output=True, text=True, timeout=min(30, remaining()), check=False,
        )
        if tap.returncode != 0:
            raise RuntimeError(f"idb tap failed for {request.name}: exit {tap.returncode}: {tap.stderr[-500:]}")
        print(f"HID_TAP_SUCCESS file={request.name} device={device} point={x},{y}", flush=True)


if __name__ == "__main__":
    main()
