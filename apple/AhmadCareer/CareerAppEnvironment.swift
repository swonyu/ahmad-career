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
                let service = AcceptanceApplicationAvailability(liveEnabled: availability == "disabled" ? false : nil)
                do {
                    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                    var state = PhoneApplicationState()
                    state.connect(address: service.origin.absoluteString, workspace: service.workspaceID,
                                  account: "offline-acceptance", server: try ApplicationServerProfile(service.profile))
                    try JSONEncoder().encode(state).write(to: folder.appendingPathComponent("phone-draft.json"), options: .atomic)
                } catch { preconditionFailure("The isolated availability fixture could not be prepared.") }
                return NativeApplicationsStore(folder: folder, credentials: AcceptanceCredentials(connected: true),
                    clientFactory: { _, _ in service })
            }
            return NativeApplicationsStore(folder: root.appendingPathComponent("applications", isDirectory: true),
                credentials: AcceptanceCredentials(), clientFactory: { _, _ in
                    throw MobileApplicationError(message: "UI acceptance is offline. No application connection was made.")
                })
        }
        #endif
        return NativeApplicationsStore()
    }
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
    private let source = DiscoverySource(id: "lever:global:career-fixture", name: "Synthetic employer", provider: "lever",
        region: "global", board: "career-fixture", boardUrl: "https://jobs.lever.co/career-fixture")
    func catalog() async throws -> DiscoveryCatalog {
        DiscoveryCatalog(ok: true, version: 1, defaultSources: [source.id], sources: [source],
            limits: DiscoveryLimits(maxSources: 4, pageSize: 50, maxJobsPerSource: 500), notice: "Offline synthetic UI acceptance. No employer requests.")
    }
    func search(_ query: DiscoveryQuery, cursor: String?) async throws -> DiscoveryPage {
        if query.keywords == "offline error" { throw URLError(.notConnectedToInternet) }
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
