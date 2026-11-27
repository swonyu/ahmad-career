"""Run one isolated document-picker journey on a fresh GitHub Actions simulator."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import socket
import stat
import subprocess
import time
import uuid


CAPTURES = """blank-profile search-input-keyboard opening-details saved-deduplicated picker-cancelled
safari-save-to-files-CV-A.pdf os-picker-CV-A.pdf selected-CV-A.pdf unapproved-review-a prepared-a
safari-save-to-files-CV-B.pdf os-picker-CV-B.pdf selected-CV-B.pdf history-a-current-b followup-editor
followup-saved connection-status closed-posting board-outage-retained network-loss-message
network-loss-saved-history network-loss-prepared-a restart-current-b restart-saved-history
restart-prepared-a restart-followup""".split()
CHECKPOINTS = """blank contactSaved jobSaved pickerCancelled profileA preparedA profileB followUpSaved
closeSecondary closedResult outage outageResult networkDisconnected networkFailure restarted finished""".split()


def read_json(path):
    return json.loads(path.read_bytes())


def publish_private(path, value):
    payload = (json.dumps(value, sort_keys=True) + "\n").encode()
    temporary = path.with_name(".pending-" + path.name + "-" + uuid.uuid4().hex)
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
        os.link(temporary, path, follow_symlinks=False)
    finally:
        temporary.unlink(missing_ok=True)


def runtime_runner_container(parent, test_id):
    matches = []
    for candidate in parent.iterdir():
        if not re.fullmatch(r"[A-Fa-f0-9]{8}(?:-[A-Fa-f0-9]{4}){3}-[A-Fa-f0-9]{12}", candidate.name):
            continue
        control = candidate / "Documents" / "NativeJourneyControl" / test_id
        try:
            info = control.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISDIR(info.st_mode) and not control.is_symlink() and candidate.resolve(strict=True) == candidate:
            matches.append(candidate)
    assert len(matches) <= 1, "More than one runtime Runner owns this exact test ID"
    return matches[0] if matches else None


def verify_attachments(output, control, device, language, test_id, method):
    groups = read_json(output / "manifest.json")
    expected = f"CareerFinderNativeJourneyUITests/{method}()"
    assert [group["testIdentifier"] for group in groups] == [expected], "Unexpected XCTest selection"
    prefix = f"native-journey-{language}-"
    items = {}
    for attachment in groups[0]["attachments"]:
        name = attachment["suggestedHumanReadableName"]
        if name.startswith(prefix):
            tag = name[len(prefix):].split("_", 1)[0]
            filename = attachment["exportedFileName"]
            assert filename == Path(filename).name and tag not in items
            assert attachment["deviceId"].upper() == device
            items[tag] = output / filename
    images = [items.pop(tag) for tag in CAPTURES]
    png_check = """import fs from 'node:fs';
        import {inspectPNG} from './android/checks/screenshot-evidence.mjs';
        for (const file of process.argv.slice(1)) inspectPNG(fs.readFileSync(file));"""
    subprocess.run(["node", "--input-type=module", "--eval", png_check, *images], check=True)
    for tag in CAPTURES:
        assert items.pop(tag + "-original-AX").stat().st_size > 0, tag
        geometry = read_json(items.pop(tag + "-geometry"))
        assert (geometry["testID"], geometry["language"]) == (test_id, language), tag
        assert 0 <= geometry["checkpointSequence"] <= len(CHECKPOINTS), tag
    for sequence, checkpoint in enumerate(CHECKPOINTS, 1):
        number = f"{sequence:03}"
        observed = read_json(items.pop(f"checkpoint-{number}-{checkpoint}"))
        response = (control / (number + "-response.json")).read_bytes()
        verified = read_json(control / (number + "-verification.json"))
        assert observed == json.loads(response) and observed["ok"] is True
        assert (observed["testID"], observed["sequence"], observed["checkpoint"]) == (test_id, sequence, checkpoint)
        assert observed["facts"]["zeroDispatch"] is True and observed["facts"]["sourceAndOwnerBound"] is True
        assert verified["completedWithinHostDeadline"] is True
        assert verified["responseSHA256"] == hashlib.sha256(response).hexdigest()
    assert not items, "Unexpected native journey attachment"


def run(language):
    temp = Path(os.environ["RUNNER_TEMP"]).resolve()
    selection = read_json(temp / "career-iphone-selection.json")
    device = os.environ["CAREER_UI_DEVICE"].upper()
    assert os.environ["GITHUB_ACTIONS"] == "true" and selection["runID"] == os.environ["GITHUB_RUN_ID"]
    assert selection["checkoutSHA"] == os.environ["GITHUB_SHA"]
    assert selection["createdDevice"]["udid"].upper() == device != selection["sourceDevice"]["udid"].upper()
    tomorrow = datetime.date.today() + datetime.timedelta(days=1)
    derived = temp / "career-ui-derived"
    build = ["xcodebuild", "-project", "apple/AhmadCareer.xcodeproj", "-scheme", "CareerFinderAcceptance",
             "-configuration", "Debug", "-destination", f"platform=iOS Simulator,id={device},arch={selection['architecture']}",
             "-derivedDataPath", str(derived), "-parallel-testing-enabled", "NO", "-maximum-concurrent-test-simulator-destinations", "1",
             "ONLY_ACTIVE_ARCH=YES", "CODE_SIGNING_ALLOWED=NO", "CODE_SIGNING_REQUIRED=NO",
             "SWIFT_ACTIVE_COMPILATION_CONDITIONS=$(inherited) DEBUG CAREER_NATIVE_JOURNEY"]
    log_path = temp / "career-iphone-ui.log"
    simctl = ["xcrun", "simctl"]
    with log_path.open("wb") as log:
        subprocess.run([*build, "build-for-testing"], stdout=log, stderr=subprocess.STDOUT, check=True, timeout=600)
        containers, bundle_ids = [], []
        for bundle in ["Career Finder.app", "CareerFinderUITests-Runner.app"]:
            product = derived / "Build/Products/Debug-iphonesimulator" / bundle
            bundle_id = plistlib.loads((product / "Info.plist").read_bytes())["CFBundleIdentifier"]
            bundle_ids.append(bundle_id)
            subprocess.run([*simctl, "install", device, product], check=True)
            container = subprocess.check_output([*simctl, "get_app_container", device, bundle_id, "data"], text=True)
            containers.append(str(Path(container.strip()).resolve(strict=True)))
        private = temp / "career-document-private"
        private.mkdir(mode=0o700)
        test_id = str(uuid.uuid4()).upper()
        runtime_runner_id = runtime_app_id = None
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = str(sock.getsockname()[1])
        args = ["node", "hosted/tests/fixtures/native-journey/serve-iphone.mjs", "--work-dir", str(private),
                "--app-container", containers[0], "--runner-container", containers[1], "--test-id", test_id,
                "--follow-up-day", tomorrow.isoformat(), "--port", port]
        fixture = subprocess.Popen(args)
        try:
            deadline = time.monotonic() + 90
            while not (private / "ready.json").is_file():
                if fixture.poll() is not None or time.monotonic() >= deadline:
                    raise RuntimeError("The local document fixture failed to start")
                time.sleep(0.1)
            ready = read_json(private / "ready.json")
            ca = Path(ready["caPath"]).resolve(strict=True)
            assert ca.is_relative_to(private)
            subprocess.run([*simctl, "keychain", device, "add-root-cert", ca], check=True)
            env = {**os.environ, "TEST_RUNNER_CAREER_NATIVE_JOURNEY_FOLLOWUP_DAY": tomorrow.isoformat(),
                   "TEST_RUNNER_CAREER_NATIVE_JOURNEY_ID_" + language.upper(): test_id}
            for letter in ("A", "B"):
                url = ready["documents"][f"CV-{letter}.pdf"]
                assert re.fullmatch(rf"https://127\.0\.0\.1:{port}/__native-journey-documents/[a-f0-9]{{48}}/CV-{letter}\.pdf", url)
                env[f"TEST_RUNNER_CAREER_NATIVE_JOURNEY_PDF_{letter}_{language.upper()}"] = url
            method = "testBlankProfileJourney" + {"en": "English", "ar": "Arabic"}[language]
            result = temp / "CareerFinderUI.xcresult"
            test_command = [*build, "-resultBundlePath", result,
                            "-only-testing:CareerFinderUITests/CareerFinderNativeJourneyUITests/" + method,
                            "test-without-building"]
            test = subprocess.Popen(test_command, env=env, stdout=log, stderr=subprocess.STDOUT)
            controller_ready = False
            try:
                deadline = time.monotonic() + 1800
                runner_parent = Path(containers[1]).parent
                while test.poll() is None:
                    if runtime_runner_id is None:
                        runtime_runner = runtime_runner_container(runner_parent, test_id)
                        if runtime_runner is not None:
                            runtime_app = Path(subprocess.check_output(
                                [*simctl, "get_app_container", device, bundle_ids[0], "data"], text=True).strip()).resolve(strict=True)
                            runtime_runner_id, runtime_app_id = runtime_runner.name, runtime_app.name
                            publish_private(private / "runner-container-handoff.json", {
                                "schemaVersion": 1, "testID": test_id,
                                "appContainer": str(runtime_app), "runnerContainer": str(runtime_runner),
                            })
                    if runtime_runner_id is not None and not controller_ready:
                        marker = private / "controller-ready.json"
                        if marker.is_file():
                            bound = read_json(marker)
                            assert bound == {"schemaVersion": 1, "testID": test_id,
                                             "runnerContainerID": runtime_runner_id}
                            controller_ready = True
                    if fixture.poll() not in (None, 0):
                        raise RuntimeError("The owned fixture rejected the runtime Runner handoff")
                    if time.monotonic() >= deadline:
                        raise subprocess.TimeoutExpired(test_command, 1800)
                    time.sleep(0.2)
                if test.returncode != 0:
                    raise subprocess.CalledProcessError(test.returncode, test_command)
                assert runtime_runner_id is not None and controller_ready
            finally:
                if test.poll() is None:
                    test.terminate()
                    try:
                        test.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        test.kill()
                        test.wait()
            assert fixture.wait(timeout=30) == 0
            proof = read_json(private / "result.json")
            assert proof["ok"] is True and proof["testID"] == test_id and proof["zeroDispatch"] is True
            assert proof["checkpoints"] == len(CHECKPOINTS)
            observed = re.findall(r"Test Case '-\[CareerFinderUITests\.(\w+) (test\w+)\]' (passed|failed) \(", log_path.read_text(errors="replace"))
            assert observed == [("CareerFinderNativeJourneyUITests", method, "passed")], observed
            exported = temp / "career-ui-screenshots"
            subprocess.run(["xcrun", "xcresulttool", "export", "attachments", "--path", result, "--output-path", exported], check=True)
            verify_attachments(exported, private / ("control-" + test_id), device, language, test_id, method)
            receipt = {"commit": selection["checkoutSHA"], "testID": test_id, "method": method, "language": language,
                       "device": device, "checkpoints": len(CHECKPOINTS), "screenshots": len(CAPTURES), "zeroDispatch": True,
                       "runtimeRunnerContainerID": runtime_runner_id}
            (temp / "career-document-journey.json").write_text(json.dumps(receipt, indent=2) + "\n")
            print(f"{method} passed with {len(CHECKPOINTS)} verified checkpoints and {len(CAPTURES)} screenshots.")
        finally:
            if fixture.poll() is None:
                fixture.terminate()
                try:
                    fixture.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    fixture.kill()
                    fixture.wait()
            receipt = temp / "career-document-journey.json"
            if not receipt.exists():
                try:
                    host = read_json(private / "result.json")
                except (OSError, ValueError):
                    host = {}
                if not isinstance(host, dict):
                    host = {}
                failure = host.get("failure") if isinstance(host.get("failure"), dict) else {}
                diagnostic = host.get("diagnostic") if isinstance(host.get("diagnostic"), dict) else {}
                def safe_code(value):
                    return value if isinstance(value, str) and re.fullmatch(r"[a-z][a-z0-9_]{0,79}", value) else None
                receipt.write_text(json.dumps({
                    "ok": False, "commit": selection["checkoutSHA"], "language": language,
                    "testID": test_id, "expectedRunnerContainerID": Path(containers[1]).name,
                    "runtimeRunnerContainerID": runtime_runner_id, "runtimeAppContainerID": runtime_app_id,
                    "host": {
                        "failureStage": safe_code(failure.get("stage")),
                        "failureCode": safe_code(failure.get("code")),
                        "checkpoints": host.get("checkpoints") if type(host.get("checkpoints")) is int else None,
                        "controlDirectorySeen": diagnostic.get("controlDirectorySeen") is True,
                        "requestsObserved": diagnostic.get("requestsObserved") if type(diagnostic.get("requestsObserved")) is int else None,
                        "controllerFailureCode": safe_code(diagnostic.get("controllerFailureCode")),
                        "failureRetention": safe_code(diagnostic.get("failureRetention")),
                    },
                }, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("language", choices=("en", "ar"))
    run(parser.parse_args().language)
