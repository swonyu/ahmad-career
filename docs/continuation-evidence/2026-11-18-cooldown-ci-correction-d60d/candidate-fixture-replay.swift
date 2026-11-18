import Foundation

/// Release builds always use the existing production storage and services.
/// Debug UI acceptance uses a UUID-scoped simulator folder and offline dependencies.
@MainActor
enum CareerAppEnvironment {
    private static var acceptanceRoot: URL? {
        #if DEBUG
        guard ProcessInfo.processInfo.arguments.contains("-career-ui-acceptance"),
              let raw = ProcessInfo.processInfo.environment["CAREER_UI_TEST_ID"], let id = UUID(uuidString: raw) else { return nil }
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("CareerFinderUIAcceptance", isDirectory: true).appendingPathComponent(id.uuidString, isDirectory: true)
        #else
        return nil
        #endif
    }
    static var isUIAcceptance: Bool { acceptanceRoot != nil }
    static func makeCareerStore() -> NativeCareerStore {
        NativeCareerStore(storageURL: acceptanceRoot?.appendingPathComponent("planning.json"))
    }
    static func makeApplicationsStore() -> NativeApplicationsStore {
        #if DEBUG
        if let root = acceptanceRoot {
            if let availability = ProcessInfo.processInfo.environment["CAREER_UI_APPLICATION_AVAILABILITY"],
               ["disabled", "unverified"].contains(availability) {
                let folder = root.appendingPathComponent("applications", isDirectory: true)
                do {
                    return try makeAvailabilityAcceptanceStore(folder: folder, liveEnabled: availability == "disabled" ? false : nil,
                        includeOrphanRecord: ProcessInfo.processInfo.environment["CAREER_UI_ORPHAN_RECORD"] == "1")
                } catch { preconditionFailure("The isolated availability fixture could not be prepared.") }
            }
            return NativeApplicationsStore(folder: root.appendingPathComponent("applications", isDirectory: true),
                credentials: AcceptanceCredentials(), clientFactory: { _, _ in
                    throw MobileApplicationError(message: "UI acceptance is offline. No application connection was made.")
                })
        }
        #endif
        return NativeApplicationsStore()
    }
    #if DEBUG
    /// Seed a new isolated fixture once. Relaunch must exercise the saved draft,
    /// including the store's normal fail-closed handling of unreadable files.
    static func makeAvailabilityAcceptanceStore(folder: URL, liveEnabled: Bool?, includeOrphanRecord: Bool = false) throws -> NativeApplicationsStore {
        let service = AcceptanceApplicationAvailability(liveEnabled: liveEnabled)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let path = folder.appendingPathComponent("phone-draft.json")
        if !FileManager.default.fileExists(atPath: path.path) {
            var state = PhoneApplicationState()
            state.connect(address: service.origin.absoluteString, workspace: service.workspaceID,
                          account: "offline-acceptance", server: try ApplicationServerProfile(service.profile))
            if includeOrphanRecord {
                let job: [String: ApplicationValue] = ["url": .string("https://jobs.example.com/retained-record"),
                    "title": .string("Record without a bookmark"), "company": .string("Synthetic employer")]
                var record = PhoneOpportunityRecord(scope: PhoneRecordScope(), job: PhoneRecordJob(job))
                record.stage = .applied; record.appliedElsewhere = true; record.note = "My private retained note"
                state.applicationRecords = [record]
            }
            do {
                // Exclusive creation also protects an existing file that appeared
                // after the check. Foundation forbids combining this with .atomic.
                try JSONEncoder().encode(state).write(to: path, options: .withoutOverwriting)
            } catch let error as CocoaError where error.code == .fileWriteFileExists {
                // Another initializer owns the existing bytes; the store reads them.
            }
        }
        return NativeApplicationsStore(folder: folder, credentials: AcceptanceCredentials(connected: true),
            clientFactory: { _, _ in service })
    }
    #endif
    static func makeDiscoveryStore() -> CareerDiscoveryStore {
        #if DEBUG
        if let root = acceptanceRoot {
            return CareerDiscoveryStore(file: root.appendingPathComponent("discovery.json"), service: AcceptanceDiscovery())
        }
        #endif
        return CareerDiscoveryStore()
    }
}

#if DEBUG
@MainActor
private final class AcceptanceCredentials: ApplicationTokenStore {
    private let connected: Bool
    init(connected: Bool = false) { self.connected = connected }
    func load(account: String) throws -> String? { connected ? "offline-synthetic-token" : nil }
    func save(_ token: String, account: String) throws { throw MobileApplicationError(message: "UI acceptance does not save credentials.") }
    func remove(account: String) throws {}
}

/// Offline visibility checks only. No request can leave this DEBUG-only fixture.
@MainActor
private final class AcceptanceApplicationAvailability: MobileApplicationServing {
    let origin = URL(string: "https://career-ui.example")!
    let workspaceID = "offline-availability-workspace"
    var token: String?
    let liveEnabled: Bool?
    init(liveEnabled: Bool?) { self.liveEnabled = liveEnabled }
    var profile: [String: ApplicationValue] {
        var value = PhoneApplicationProfile().payload()
        value["revision"] = .number(0); value["resume"] = .null
        return value
    }
    func request(_ route: String, method: String, body: [String: ApplicationValue]?) async throws -> [String: ApplicationValue] {
        guard route == "workspace", method == "GET", body == nil else {
            throw MobileApplicationError(message: "UI acceptance is offline. No application was sent.")
        }
        var value: [String: ApplicationValue] = ["ok": .bool(true), "workspaceId": .string(workspaceID),
            "profile": .object(profile), "jobs": .array([]), "attempts": .array([]),
            "recoverablePlans": .array([]), "activePlanIds": .array([]), "mode": .string("local")]
        if let liveEnabled { value["capabilities"] = .object(["liveEnabled": .bool(liveEnabled)]) }
        return value
    }
    func invalidate() {}
}

@MainActor
private final class AcceptanceDiscovery: CareerDiscoveryServing {
    // A separately enabled offline journey fails this matching search once,
    // then returns real matching fixture results on the user's Retry action.
    // The existing permanent-failure fixture and Release service are unchanged.
    private var recoveryFailurePending = ProcessInfo.processInfo.environment["CAREER_UI_DISCOVERY_RETRY_ONCE"] == "1"
    // Structured offline failures exercise the same deadline contract as HTTP
    // Retry-After: 0 and a short future wait; no employer request is made.
    private var rateLimitDelay: TimeInterval? = ["0": 0, "30": 30][ProcessInfo.processInfo.environment["CAREER_UI_DISCOVERY_RATE_LIMIT_ONCE"] ?? ""]
    private let source = DiscoverySource(id: "lever:global:career-fixture", name: "Synthetic employer", provider: "lever",
        region: "global", board: "career-fixture", boardUrl: "https://jobs.lever.co/career-fixture")
    func catalog() async throws -> DiscoveryCatalog {
        DiscoveryCatalog(ok: true, version: 1, defaultSources: [source.id], sources: [source],
            limits: DiscoveryLimits(maxSources: 4, pageSize: 50, maxJobsPerSource: 500), notice: "Offline synthetic UI acceptance. No employer requests.")
    }
    func search(_ query: DiscoveryQuery, cursor: String?) async throws -> DiscoveryPage {
        if query.keywords == "offline error" { throw URLError(.notConnectedToInternet) }
        if let delay = rateLimitDelay, query.keywords == "Interface designer", cursor == nil {
            rateLimitDelay = nil
            throw DiscoveryFailure(message: "Search is temporarily busy. Wait before trying again.",
                retryAfter: Date().addingTimeInterval(delay))
        }
        if recoveryFailurePending && query.keywords == "Interface designer" && cursor == nil {
            recoveryFailurePending = false
            throw URLError(.notConnectedToInternet)
        }
        let checked = ISO8601DateFormatter().string(from: Date())
        let all = [
            DiscoveryJob(id: "fixture-design", sourceId: source.id, sourceName: source.name, provider: "lever",
                title: "Interface designer", company: "Synthetic employer", url: "https://jobs.lever.co/career-fixture/11111111-1111-4111-8111-111111111111",
                location: "Remote · eligible locations to confirm", country: nil, remote: true,
                summary: "Synthetic job for offline UI acceptance. Review an employer's actual requirements before applying.",
                publishedAt: nil, updatedAt: nil, checkedAt: checked, stale: false),
            DiscoveryJob(id: "fixture-engineer", sourceId: source.id, sourceName: source.name, provider: "lever",
                title: "Software engineer", company: "Synthetic employer", url: "https://jobs.lever.co/career-fixture/22222222-2222-4222-8222-222222222222",
                location: "Toronto, Canada", country: "CA", remote: nil,
                summary: "Synthetic job for offline UI acceptance. No application is sent by this fixture.",
                publishedAt: nil, updatedAt: nil, checkedAt: checked, stale: false)
        ]
        let jobs = all.filter {
            (query.keywords.isEmpty || ($0.title + " " + $0.company).localizedCaseInsensitiveContains(query.keywords))
                && (query.location.isEmpty || $0.location.localizedCaseInsensitiveContains(query.location))
                && (!query.remoteOnly || $0.remote == true)
        }
        return DiscoveryPage(ok: true, version: 1, generatedAt: checked, status: "complete", jobs: jobs,
            sources: [DiscoverySourceStatus(id: source.id, name: source.name, provider: source.provider, boardUrl: source.boardUrl,
                status: "fresh", checkedAt: checked, availableCount: all.count, matchedCount: jobs.count, limited: false, error: nil)],
            nextCursor: nil, totalMatches: jobs.count, limited: false, notice: "Offline synthetic fixture; no employer requests.")
    }
}
#endif

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



@main
private struct TimingReplay {
    @MainActor static func main() async {
        var checks = 0
        var failures = 0
        func check(_ condition: Bool, _ message: String) {
            checks += 1
            if !condition { failures += 1; print("FAIL: " + message) }
        }
        for mode in ["0", "30"] {
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
