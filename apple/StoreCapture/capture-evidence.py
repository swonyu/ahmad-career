#!/usr/bin/env python3
"""Guard and retain ordinary simulator captures; never edit screenshot pixels."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import struct
import subprocess
import sys
from datetime import datetime, timezone
import zlib

BASE = "0a56340fee907ffab0e4e5f25ac252de76a23c9c"
PROJECT = "apple/AhmadCareer.xcodeproj/project.pbxproj"
SCHEMES = "apple/AhmadCareer.xcodeproj/xcshareddata/xcschemes"
CAPTURE_TEST = "apple/UITests/CareerFinderStoreCaptureTests.swift"
ALLOWED_CHANGES = {PROJECT, CAPTURE_TEST, ".github/workflows/phone-quality.yml", "apple/StoreCapture/capture-evidence.py"}
NEW_BUILD = "C10000000000000000000001"
NEW_FILE = "C20000000000000000000001"
MEDIUM_DEVICES = ["iPhone 17 Pro", "iPhone 16 Pro", "iPhone 15 Pro", "iPhone 17", "iPhone 16", "iPhone 15", "iPhone 14 Pro", "iPhone 18 Pro"]
SIZES = {(1179, 2556), (1206, 2622)}
NAMES = ["store-01-start", "store-02-public-search", "store-03-public-opportunity", "store-04-application-workspace"]
TEST_IDENTIFIER = "CareerFinderStoreCaptureTests/testCaptureOrdinaryScreens()"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def run(arguments, *, cwd=None, data=None, timeout=60):
    return subprocess.run(arguments, cwd=cwd, input=data, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, timeout=timeout, check=True).stdout


def sha(data):
    return hashlib.sha256(data).hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n")


def git(repo, *arguments):
    return run(["git", *arguments], cwd=repo)


def baseline_files(repo, prefix):
    records = {}
    for entry in git(repo, "ls-tree", "-rz", "--full-tree", BASE, "--", prefix).split(b"\0"):
        if not entry:
            continue
        metadata, raw_path = entry.split(b"\t", 1)
        mode, kind, blob = metadata.decode().split()
        require(kind == "blob" and mode in {"100644", "100755"}, "Unsupported baseline file type")
        path = raw_path.decode("utf-8")
        data = git(repo, "cat-file", "blob", blob)
        records[path] = {"path": path, "mode": mode, "gitBlobSHA": blob, "bytes": len(data), "sha256": sha(data)}
    require(records, "Baseline file inventory is empty: " + prefix)
    actual = {}
    for path in (repo / prefix).rglob("*"):
        require(not path.is_symlink(), "A source or resource must not be a symlink")
        if path.is_file():
            data = path.read_bytes()
            actual[path.relative_to(repo).as_posix()] = (len(data), sha(data))
    require(set(actual) == set(records), "Production or scheme file inventory differs from the pinned baseline")
    for path, entry in records.items():
        require(actual[path] == (entry["bytes"], entry["sha256"]), "Baseline byte mismatch: " + path)
    return [records[path] for path in sorted(records)]


def parse_project(data):
    return json.loads(run(["plutil", "-convert", "json", "-o", "-", "-"], data=data))


def expected_capture_project(baseline):
    expected = copy.deepcopy(baseline)
    objects = expected["objects"]
    require(NEW_BUILD not in objects and NEW_FILE not in objects, "Capture object identifiers already exist")
    objects[NEW_BUILD] = {"isa": "PBXBuildFile", "fileRef": NEW_FILE}
    objects[NEW_FILE] = {"isa": "PBXFileReference", "lastKnownFileType": "sourcecode.swift",
                         "path": "CareerFinderStoreCaptureTests.swift", "sourceTree": "<group>"}
    objects["B30000000000000000000001"]["children"].append(NEW_FILE)
    objects["B40000000000000000000001"]["files"].append(NEW_BUILD)
    return expected


def verify_source(repo, output):
    require(git(repo, "rev-parse", BASE + "^{commit}").decode().strip() == BASE, "Pinned baseline unavailable")
    git(repo, "merge-base", "--is-ancestor", BASE, "HEAD")
    require(not git(repo, "status", "--porcelain=v1", "--untracked-files=all"), "Capture checkout must be clean")
    changed = {p.decode() for p in git(repo, "diff", "--name-only", "-z", BASE, "HEAD").split(b"\0") if p}
    require(changed == ALLOWED_CHANGES, "Only the four reviewed auxiliary capture files may differ")
    original = git(repo, "show", BASE + ":" + PROJECT)
    current = (repo / PROJECT).read_bytes()
    require(parse_project(current) == expected_capture_project(parse_project(original)),
            "Project differs beyond the precise new UI-test references; app/project settings must remain identical")
    source_files = baseline_files(repo, "apple/AhmadCareer")
    schemes = baseline_files(repo, SCHEMES)
    workflow = (repo / ".github/workflows/phone-quality.yml").read_text()
    require("career-store-capture-${{ github.run_id }}" in workflow and "cancel-in-progress: false" in workflow,
            "Capture workflow must have separate non-cancelling concurrency")
    evidence = {"schemaVersion": 1, "recordedAt": now(), "purpose": "Ordinary iPhone screenshot capture only; not a quality gate",
                "baselineCommit": BASE, "captureCommit": git(repo, "rev-parse", "HEAD").decode().strip(),
                "baselineTree": git(repo, "rev-parse", BASE + "^{tree}").decode().strip(),
                "productionSourceAndResources": source_files, "unchangedSchemes": schemes,
                "baselineProjectSHA256": sha(original), "captureProjectSHA256": sha(current),
                "projectGuard": "Entire parsed project equals baseline plus exactly two UI-test references and their membership entries",
                "allowedAuxiliaryChanges": sorted(changed), "appIdentityAndBuildSettingsChanged": False,
                "captureOnly": True, "qualityGate": False, "storePublication": False}
    write_json(output / "source-evidence.json", evidence)
    print("Verified", len(source_files), "production files and", len(schemes), "schemes against", BASE)


def create_simulator(output):
    inventory = json.loads(run(["xcrun", "simctl", "list", "--json"]))
    runtimes = [r for r in inventory["runtimes"] if r.get("isAvailable") and ".iOS-" in r["identifier"]]
    runtimes.sort(key=lambda r: tuple(int(p) for p in re.findall(r"\d+", r["version"])), reverse=True)
    types = {d["name"]: d for d in inventory["devicetypes"] if d["name"] in MEDIUM_DEVICES}
    require(runtimes and types, "No accepted medium iPhone Simulator is available")
    runtime = runtimes[0]
    supported = runtime.get("supportedDeviceTypes")
    allowed_ids = {d["identifier"] for d in supported} if supported else None
    device = next((types[name] for name in MEDIUM_DEVICES if name in types and
                   (allowed_ids is None or types[name]["identifier"] in allowed_ids)), None)
    require(device is not None, "The installed iOS runtime has no supported medium capture device")
    suffix = os.environ.get("GITHUB_RUN_ID", "")
    require(suffix.isdigit(), "This capture helper requires an isolated GitHub-hosted run")
    plan = {"runtime": runtime["identifier"], "runtimeVersion": runtime["version"],
            "deviceType": device["identifier"], "deviceName": device["name"], "createdForRun": suffix,
            "appearancePolicy": "Unmodified fresh simulator default; not forced or measured"}
    write_json(output / "simulator-plan.json", plan)
    identifier = run(["xcrun", "simctl", "create", "CareerFinderStoreCapture-" + suffix,
                      device["identifier"], runtime["identifier"]]).decode().strip()
    require(re.fullmatch(r"[A-Fa-f0-9-]{36}", identifier), "Simulator creation did not return a valid identifier")
    with open(os.environ["GITHUB_ENV"], "a") as env:
        env.write("CAPTURE_DEVICE=" + identifier + "\n")
    plan["deviceId"] = identifier
    write_json(output / "simulator-plan.json", plan)
    run(["xcrun", "simctl", "boot", identifier])
    run(["xcrun", "simctl", "bootstatus", identifier, "-b"], timeout=180)
    print("Created isolated medium simulator:", device["name"], runtime["version"])


def verify_product(output, derived, settings_path):
    settings = json.loads(settings_path.read_text())
    app_settings = [s["buildSettings"] for s in settings if s["target"] == "AhmadCareer"]
    require(len(app_settings) == 1, "Expected one production app build-settings record")
    s = app_settings[0]
    require(s["CONFIGURATION"] == "Release" and s["PLATFORM_NAME"] == "iphonesimulator", "Capture must build ordinary Release for Simulator")
    require(s.get("CODE_SIGNING_ALLOWED") == "NO" and s.get("CODE_SIGNING_REQUIRED") == "NO", "Capture must not use signing")
    require("DEBUG" not in s.get("SWIFT_ACTIVE_COMPILATION_CONDITIONS", "").split(), "Release capture must not enable DEBUG fixtures")
    require(s["PRODUCT_BUNDLE_IDENTIFIER"] == "com.ahmadalayed.career", "App bundle identity changed")
    product = derived / "Build/Products/Release-iphonesimulator/Career Finder.app"
    info = plistlib.loads((product / "Info.plist").read_bytes())
    require(info["CFBundleIdentifier"] == "com.ahmadalayed.career" and info["UIDeviceFamily"] == [1], "Built product identity or device family changed")
    require(info["CFBundleDisplayName"] == "Career Finder" and info["CFBundleName"] == "Career Finder", "Built public name changed")
    require(info["CFBundleSupportedPlatforms"] == ["iPhoneSimulator"], "Built product is not an iPhone Simulator app")
    executable = info["CFBundleExecutable"]
    require(Path(executable).name == executable, "Invalid executable name")
    binary = (product / executable).read_bytes()
    write_json(output / "product-evidence.json", {"recordedAt": now(), "configuration": "Release", "signingAllowed": False,
               "bundleIdentifier": info["CFBundleIdentifier"], "displayName": info["CFBundleDisplayName"],
               "version": info["CFBundleShortVersionString"], "build": info["CFBundleVersion"],
               "platform": info["CFBundleSupportedPlatforms"], "deviceFamily": info["UIDeviceFamily"],
               "executableBytes": len(binary), "executableSHA256": sha(binary), "settingsSHA256": sha(settings_path.read_bytes())})
    print("Verified ordinary unsigned Release simulator product")


def png_details(data):
    require(data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) <= 50 * 1024 * 1024, "Invalid PNG signature or size")
    offset, chunks, header = 8, [], None
    while offset < len(data):
        require(offset + 12 <= len(data), "Truncated PNG chunk")
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        end = offset + 12 + length
        require(end <= len(data), "Truncated PNG payload")
        payload = data[offset + 8:offset + 8 + length]
        checksum = struct.unpack(">I", data[offset + 8 + length:end])[0]
        require(zlib.crc32(kind + payload) & 0xffffffff == checksum, "PNG checksum mismatch")
        if not chunks:
            require(kind == b"IHDR" and length == 13, "PNG must begin with IHDR")
            header = struct.unpack(">IIBBBBB", payload)
        else:
            require(kind != b"IHDR", "Duplicate PNG header")
        require(kind != b"tRNS", "Store screenshots must not contain transparency")
        chunks.append(kind)
        offset = end
        if kind == b"IEND":
            require(length == 0 and offset == len(data), "Invalid PNG end")
            break
    require(header is not None and b"IDAT" in chunks and chunks[-1] == b"IEND", "Incomplete PNG")
    width, height, depth, color, compression, filtering, interlace = header
    require((width, height) in SIZES, "Screenshot is not an accepted native medium portrait size")
    require(depth == 8 and color == 2, "Expected an original RGB PNG without alpha")
    require(compression == 0 and filtering == 0 and interlace in {0, 1}, "Unsupported PNG encoding")
    return {"width": width, "height": height, "bitDepth": depth, "colorType": color, "alpha": False}


def collect_screenshots(output):
    require((output / "test-exit-code.txt").read_text().strip() == "0", "Capture test did not finish successfully")
    source = json.loads((output / "source-evidence.json").read_text())
    product = json.loads((output / "product-evidence.json").read_text())
    device = json.loads((output / "simulator-plan.json").read_text())
    require(source["baselineCommit"] == BASE and product["configuration"] == "Release", "Missing verified source/product provenance")
    directory = output / "attachments"
    manifest = json.loads((directory / "manifest.json").read_text())
    require(isinstance(manifest, list), "Unknown xcresult attachment manifest format")
    found = {}
    for group in manifest:
        for attachment in group.get("attachments", []):
            suggested = attachment.get("suggestedHumanReadableName", "")
            matched = [name for name in NAMES if suggested == name + ".png" or
                       suggested.startswith(name + "_") and suggested.endswith(".png")]
            if not matched:
                require(not suggested.startswith("store-"), "Unexpected named store capture")
                continue
            name = matched[0]
            require(group.get("testIdentifier") == TEST_IDENTIFIER, "Capture came from an unexpected test")
            require(name not in found and attachment.get("isAssociatedWithFailure") is False, "Duplicate or failed store capture")
            filename = attachment.get("exportedFileName", "")
            require(filename and Path(filename).name == filename and filename.endswith(".png"), "Unsafe attachment path")
            path = directory / filename
            require(path.is_file() and not path.is_symlink(), "Missing original PNG")
            data = path.read_bytes()
            details = png_details(data)
            found[name] = {"name": name, "originalFileName": filename, "path": "screenshots/" + name + ".png",
                           "capturedAtEpochSeconds": attachment.get("timestamp"), "test": group["testIdentifier"],
                           "deviceId": attachment.get("deviceId"), "deviceName": attachment.get("deviceName"),
                           "bytes": len(data), "sha256": sha(data), **details}
    require(set(found) == set(NAMES), "Exactly four successful named captures are required")
    require(len({(v["width"], v["height"]) for v in found.values()}) == 1, "Capture dimensions must be consistent")
    images = output / "screenshots"
    images.mkdir(exist_ok=False)
    for name in NAMES:
        entry = found[name]
        target = output / entry["path"]
        shutil.copyfile(directory / entry["originalFileName"], target)
        require(sha(target.read_bytes()) == entry["sha256"], "Original screenshot bytes changed while retaining them")
    write_json(output / "capture-manifest.json", {"schemaVersion": 1, "recordedAt": now(), "baselineCommit": BASE,
               "captureCommit": source["captureCommit"], "scope": "Ordinary Release simulator screens; public discovery and local save only",
               "sourceEvidenceSHA256": sha((output / "source-evidence.json").read_bytes()),
               "productEvidenceSHA256": sha((output / "product-evidence.json").read_bytes()),
               "simulator": device, "images": [found[name] for name in NAMES],
               "pixelsEdited": False, "resized": False, "captureOnly": True, "qualityGate": False,
               "networkTraceCaptured": False,
               "interactionBoundary": "The reviewed capture test never taps employer links, account/pairing controls or application submission. The fresh simulator is disconnected and uses ordinary public discovery GETs plus a local save.",
               "visualReviewRequired": True, "storePublication": False})
    print("Retained exactly four unchanged RGB PNGs at an accepted native medium size; visual review remains required")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["verify-source", "create-simulator", "verify-product", "collect-screenshots"])
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--derived", type=Path)
    parser.add_argument("--settings", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    try:
        if args.command == "verify-source":
            verify_source(args.repo.resolve(), args.output)
        elif args.command == "create-simulator":
            create_simulator(args.output)
        elif args.command == "verify-product":
            require(args.derived is not None and args.settings is not None, "Product verification needs derived data and settings")
            verify_product(args.output, args.derived, args.settings)
        else:
            collect_screenshots(args.output)
    except Exception as error:
        write_json(args.output / (args.command + "-failure.json"), {"recordedAt": now(), "stage": args.command,
                   "status": "failed", "message": str(error), "captureOnly": True, "qualityGate": False})
        raise


if __name__ == "__main__":
    main()
