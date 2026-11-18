from pathlib import Path
import concurrent.futures
import datetime
import hashlib
import json
import re
import subprocess
import tempfile

root = Path("/Users/saleh/Developer/career-finder-cooldown-acceptance-20261118-d60d62a70f26")
evidence = Path(__file__).resolve().parent
base = "d8d2e999d0348eb07942472a1d9e87d2fc4498a2"
source_folder = root / "apple/AhmadCareer"
compiler = subprocess.check_output(["xcrun", "--sdk", "macosx", "--find", "swiftc"], text=True).strip()
sdk = subprocess.check_output(["xcrun", "--sdk", "macosx", "--show-sdk-path"], text=True).strip()
receipts = []

def run(name, command):
    with (evidence / (name + ".log")).open("w") as log:
        result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT)
    receipt = {"name": name, "command": command, "exit_code": result.returncode,
               "at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    receipts.append(receipt)
    print(name, result.returncode, flush=True)
    print((evidence / (name + ".log")).read_text(), flush=True)
    return result.returncode

assert run("clock-host", ["python3", str(root / "apple/Checks/check-discovery-cooldown.py"),
                         "--generated", str(evidence / "clock-product-generated.swift")]) == 0
clock = (evidence / "clock-product-generated.swift").read_text()
clock = clock[clock.index("@MainActor\nprivate final class DiscoveryState"):clock.index("@MainActor\nprivate final class Suite")]
probe = r'''
import Darwin
__CLOCK__

@main
private struct TimingReplay {
    @MainActor static func main() async {
        var checks = 0
        var failures = 0
        func check(_ condition: Bool, _ message: String) {
            checks += 1
            if !condition { failures += 1; print("FAIL: " + message) }
        }
        for mode in ["0", "__FUTURE_MODE__"] {
            setenv("CAREER_UI_DISCOVERY_RATE_LIMIT_ONCE", mode, 1)
            unsetenv("CAREER_UI_DISCOVERY_RETRY_ONCE")
            let service = AcceptanceDiscovery()
            var query = DiscoveryQuery()
            query.keywords = "Interface designer"
            let before = Date()
            var failure: DiscoveryFailure?
            do { _ = try await service.search(query, cursor: nil) }
            catch let actual as DiscoveryFailure { failure = actual }
            catch { print("Unexpected fixture error: \(error)") }
            let after = Date()
            check(failure != nil, "configured " + mode + " fixture must fail once")
            guard let failure else { continue }
            check(failure.message == "Search is temporarily busy. Wait before trying again.", "original service failure is retained")
            guard let deadline = failure.retryAfter else {
                check(false, "fixture must supply a real deadline"); continue
            }
            let seconds = Double(mode)!
            check(deadline >= before.addingTimeInterval(seconds) && deadline <= after.addingTimeInterval(seconds),
                  "fixture must create its configured deadline at the request")
            let elapsed = mode == "0" ? after.timeIntervalSince(before) : 19.13
            // Time-translate the actual service deadline to the captured CI
            // observation interval. This is a host timing replay, not a UI run.
            let remaining = deadline.timeIntervalSince(before) - elapsed
            let view = ViewClock(clock: Date(), deadline: Date().addingTimeInterval(remaining))
            var observed: [Bool]
            if remaining <= 0 {
                await view.runDeadlineTask()
                observed = view.disabled
            } else {
                let pending = Task { await view.runDeadlineTask() }
                for _ in 0..<3 { await Task.yield() }
                observed = view.disabled
                pending.cancel()
                await pending.value
            }
            print("Timing replay mode=\(mode), elapsed=\(elapsed), remaining=\(remaining), disabled=\(observed)")
            for (index, disabled) in observed.enumerated() {
                check(disabled == (mode != "0"), "control \(index) must match the intended observation phase for mode " + mode)
            }
            do {
                let page = try await service.search(query, cursor: nil)
                check(page.jobs.count == 1 && page.jobs[0].id == "fixture-design",
                      "the next exact request returns matching fixture results")
            } catch { check(false, "the one-shot fixture must recover on the next exact request") }
        }
        unsetenv("CAREER_UI_DISCOVERY_RATE_LIMIT_ONCE")
        print("Captured-timing replay: \(checks) assertions, 2 scenarios, \(failures) failures.")
        if failures > 0 { exit(1) }
    }
}
'''
core = ["MobileApplicationClient.swift", "MobileApplicationState.swift", "NativeApplicationsStore.swift",
        "CareerFeed.swift", "NativeCareerStore.swift", "CareerDiscovery.swift"]

def fixture_replay(kind):
    if kind == "baseline":
        environment = subprocess.check_output(["git", "-C", str(root), "show", base + ":apple/AhmadCareer/CareerAppEnvironment.swift"], text=True)
        ui_test = subprocess.check_output(["git", "-C", str(root), "show", base + ":apple/UITests/CareerFinderUITests.swift"], text=True)
    else:
        environment = (source_folder / "CareerAppEnvironment.swift").read_text()
        ui_test = (root / "apple/UITests/CareerFinderUITests.swift").read_text()
    modes = re.findall(r'for delay in \["0", "(\d+)"\]', ui_test)
    assert len(modes) == 1, modes
    generated = environment + probe.replace("__CLOCK__", clock).replace("__FUTURE_MODE__", modes[0])
    generated = "\n".join(line.rstrip() for line in generated.splitlines()) + "\n"
    swift = evidence / (kind + "-fixture-replay.swift")
    swift.write_text(generated)
    with tempfile.TemporaryDirectory(prefix="career-cooldown-replay-" + kind + "-") as temporary:
        command = [compiler, "-swift-version", "5", "-Onone", "-sdk", sdk, "-D", "DEBUG",
                   "-module-cache-path", temporary + "/module-cache"]
        command += [str(source_folder / name) for name in core] + [str(swift), "-o", temporary + "/replay"]
        compiled = run(kind + "-fixture-compile", command)
        if compiled != 0:
            return compiled
        return run(kind + "-timing-replay", [temporary + "/replay"])

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    result = dict(zip(["baseline", "candidate"], pool.map(fixture_replay, ["baseline", "candidate"])))
assert result == {"baseline": 1, "candidate": 0}, result

ios_sdk = subprocess.check_output(["xcrun", "--sdk", "iphoneos", "--show-sdk-path"], text=True).strip()
assert run("ios-source-parse", [compiler, "-frontend", "-parse", "-sdk", ios_sdk, "-target", "arm64-apple-ios16.0",
                               str(root / "apple/UITests/CareerFinderUITests.swift")]) == 0
assert run("diff-check", ["git", "-C", str(root), "diff", "--check"]) == 0
files = ["apple/AhmadCareer/CareerAppEnvironment.swift", "apple/UITests/CareerFinderUITests.swift",
         "apple/AhmadCareer/NativeDiscoveryViews.swift", "apple/Checks/check-discovery-cooldown.py",
         "apple/AhmadCareer/CareerDiscovery.swift", "apple/Checks/DiscoveryCheck.swift"]
(evidence / "source-sha256.json").write_text(json.dumps({name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in files}, indent=2) + "\n")
(evidence / "qualification-receipts.json").write_text(json.dumps(receipts, indent=2) + "\n")
print("All bounded qualifications complete. Native UI rerun remains pending.")
