
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
    private var waitingForRetry: Bool {
        (discovery.retryAfter ?? .distantPast) > searchClock
    }
    var disabled: [Bool] { [waitingForRetry, waitingForRetry, waitingForRetry] }
    func runDeadlineTask() async {

            searchClock = Date()
            guard let retry = discovery.retryAfter else { return }
            let remaining = retry.timeIntervalSince(searchClock)
            guard remaining > 0 else { return }
            do { try await Task.sleep(nanoseconds: UInt64(remaining * 1_000_000_000)) }
            catch { return }
            searchClock = retry

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
