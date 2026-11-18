#!/usr/bin/env python3
"""Execute the actual discovery deadline task and retry-button predicates on macOS.

This host gate does not render SwiftUI. It extracts the bounded, Foundation-only
task and modifiers from the view so its assertions exercise production code, not
a rewritten clock. The native UI journey remains a separate required gate.
"""
import argparse
import hashlib
from pathlib import Path
import re
import subprocess
import tempfile


def body_after(text, marker, opening="{", closing="}"):
    if text.count(marker) != 1:
        raise ValueError("Expected exactly one source marker: " + marker)
    start = text.index(opening, text.index(marker) + len(marker))
    depth = 1
    for index in range(start + 1, len(text)):
        if text[index] == opening:
            depth += 1
        elif text[index] == closing:
            depth -= 1
            if depth == 0:
                return text[start + 1:index]
    raise ValueError("Unclosed source block: " + marker)


def disabled_expression(modifiers):
    if ".disabled(" not in modifiers:
        return "false"  # SwiftUI's default when this button has no modifier.
    return body_after(modifiers, ".disabled", "(", ")")


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parents[1] / "AhmadCareer/NativeDiscoveryViews.swift")
parser.add_argument("--generated", type=Path, help="Keep the exact generated Swift harness as evidence.")
args = parser.parse_args()
source = args.source.read_text()
task = body_after(source, ".task(id: discovery.retryAfter)")
helper_marker = "private var waitingForRetry: Bool"
helper = helper_marker + " {" + body_after(source, helper_marker) + "}" if helper_marker in source else ""
search = re.findall(r'Button\(l10n\("Search again"\), action: beginSearch\)(.*?)\.accessibilityIdentifier\("discovery.retrySearch"\)', source, re.S)
exact = re.findall(r'Button\(l10n\("Retry this search"\)\) \{ Task \{ await discovery.retrySubmittedSearch\(\) \} \}(.*?)\.accessibilityIdentifier\("discovery.retry"\)', source, re.S)
if len(search) != 1 or len(exact) != 2:
    raise ValueError("Expected Search again and both exact submitted-search retry controls.")
predicates = [disabled_expression(modifiers) for modifiers in search + exact]
template = r'''
import Foundation
import Darwin

@MainActor
private final class DiscoveryState {
    var retryAfter: Date?
    init(_ retryAfter: Date?) { self.retryAfter = retryAfter }
}

@MainActor
private final class ViewClock {
    let discovery: DiscoveryState
    var searchClock: Date
    init(clock: Date, deadline: Date?) {
        searchClock = clock
        discovery = DiscoveryState(deadline)
    }
    __HELPER__
    var disabled: [Bool] { [__PREDICATES__] }
    func runDeadlineTask() async {
        __TASK__
    }
}

@MainActor
private final class Suite {
    var assertions = 0
    var failures = 0
    func check(_ actual: Bool, _ expected: Bool, _ message: String) {
        assertions += 1
        if actual != expected {
            failures += 1
            print("FAIL: \(message) (actual=\(actual), expected=\(expected))")
        }
    }
    func controls(_ view: ViewClock, disabled: Bool, _ scenario: String) {
        for (index, actual) in view.disabled.enumerated() {
            let names = ["Search again", "error-section exact retry", "coverage-section exact retry"]
            check(actual, disabled, scenario + " / " + names[index])
        }
    }
    func run() async {
        // HTTP Retry-After: 0 can be newer than the view's initial clock even
        // though it has already expired by the time SwiftUI starts the task.
        let zero = ViewClock(clock: Date().addingTimeInterval(-10), deadline: Date())
        await zero.runDeadlineTask()
        controls(zero, disabled: false, "zero-second deadline")

        // All three controls must block during a real future interval, then
        // become enabled when the actual asynchronous task finishes.
        let futureDeadline = Date().addingTimeInterval(0.10)
        let future = ViewClock(clock: Date().addingTimeInterval(-10), deadline: futureDeadline)
        controls(future, disabled: true, "active short cooldown")
        await future.runDeadlineTask()
        check(Date() >= futureDeadline, true, "future task cannot complete before the deadline")
        controls(future, disabled: false, "short cooldown elapsed")

        // SwiftUI cancellation must not set the UI clock to a future deadline.
        let cancelledDeadline = Date().addingTimeInterval(60)
        let cancelled = ViewClock(clock: Date().addingTimeInterval(-10), deadline: cancelledDeadline)
        let pending = Task { await cancelled.runDeadlineTask() }
        for _ in 0..<3 { await Task.yield() }
        pending.cancel()
        await pending.value
        check(cancelled.searchClock < cancelledDeadline, true, "cancelled task cannot advance the clock to its future deadline")
        check(cancelled.discovery.retryAfter == cancelledDeadline, true, "UI task leaves model deadline intact")
        controls(cancelled, disabled: true, "cancelled future task")

        // A view task can restart after the deadline (for example on returning
        // to the screen). An old UI clock must not leave the actions disabled.
        let restarted = ViewClock(clock: Date().addingTimeInterval(-60), deadline: Date().addingTimeInterval(-1))
        await restarted.runDeadlineTask()
        controls(restarted, disabled: false, "task restarted after expiry")

        // Clearing a failed search's deadline must also release all controls.
        cancelled.discovery.retryAfter = nil
        await cancelled.runDeadlineTask()
        controls(cancelled, disabled: false, "deadline cleared")
        print("Discovery cooldown UI host gate: \(assertions) assertions, 5 scenarios, \(failures) failures.")
    }
}

@main
private struct Main {
    @MainActor static func main() async {
        let suite = Suite()
        await suite.run()
        if suite.failures > 0 { exit(1) }
    }
}
'''
generated = template.replace("__HELPER__", helper).replace("__PREDICATES__", ", ".join(predicates)).replace("__TASK__", task)
generated = "\n".join(line.rstrip() for line in generated.splitlines()) + "\n"
if args.generated:
    args.generated.parent.mkdir(parents=True, exist_ok=True)
    args.generated.write_text(generated)
print("UI source:", args.source.resolve(), flush=True)
print("UI source SHA-256:", hashlib.sha256(source.encode()).hexdigest(), flush=True)
print("Gate SHA-256:", hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), flush=True)
compiler = subprocess.check_output(["xcrun", "--sdk", "macosx", "--find", "swiftc"], text=True).strip()
sdk = subprocess.check_output(["xcrun", "--sdk", "macosx", "--show-sdk-path"], text=True).strip()
with tempfile.TemporaryDirectory(prefix="career-discovery-clock-") as temporary:
    folder = Path(temporary)
    swift = folder / "DiscoveryCooldownCheck.swift"
    swift.write_text(generated)
    executable = folder / "discovery-cooldown-check"
    subprocess.run([compiler, "-swift-version", "5", "-Onone", "-parse-as-library", "-sdk", sdk,
                    "-module-cache-path", str(folder / "module-cache"), str(swift), "-o", str(executable)], check=True)
    result = subprocess.run([str(executable)], timeout=10)
    raise SystemExit(result.returncode)
