import Foundation
import Darwin

@MainActor
private final class DiscoveryStub: CareerDiscoveryServing {
    let directory: DiscoveryCatalog
    var catalogCalls = 0
    var calls: [(DiscoveryQuery, String?)] = []
    var handle: (DiscoveryQuery, String?) async throws -> DiscoveryPage
    init(_ fixture: DiscoveryPage) {
        directory = DiscoveryCatalog(ok: true, version: 1, defaultSources: [fixture.sources[0].id],
            sources: fixture.sources.map { DiscoverySource(id: $0.id, name: $0.name, provider: $0.provider,
                region: $0.id.contains(":eu:") ? "eu" : "global", board: "example-board", boardUrl: $0.boardUrl) },
            limits: DiscoveryLimits(maxSources: 4, pageSize: 50, maxJobsPerSource: 500), notice: "Synthetic directory")
        handle = { _, _ in fixture }
    }
    func catalog() async throws -> DiscoveryCatalog { catalogCalls += 1; return directory }
    func search(_ query: DiscoveryQuery, cursor: String?) async throws -> DiscoveryPage {
        calls.append((query, cursor)); return try await handle(query, cursor)
    }
}
@MainActor
private final class DiscoveryGate {
    var started = false
    var continuation: CheckedContinuation<DiscoveryPage, Error>?
    func wait() async throws -> DiscoveryPage {
        try await withCheckedThrowingContinuation { continuation = $0; started = true }
    }
    func finish(_ page: DiscoveryPage) { continuation?.resume(returning: page); continuation = nil }
}
@MainActor
private final class DiscoverySuite {
    var assertions = 0
    var scenarios = 0
    var folders: [URL] = []
    let fixture: DiscoveryPage
    init(_ fixture: DiscoveryPage) { self.fixture = fixture }
    func check(_ value: @autoclosure () -> Bool, _ message: String) throws {
        guard value() else { throw DiscoveryFailure(message: "FAILED: " + message) }; assertions += 1
    }
    func waitUntil(_ condition: () -> Bool) async throws {
        for _ in 0..<2_000 { if condition() { return }; await Task.yield() }
        throw DiscoveryFailure(message: "Timed out waiting for discovery fixture")
    }
    func store(_ service: DiscoveryStub) -> (CareerDiscoveryStore, URL) {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("career-discovery-" + UUID().uuidString)
        folders.append(folder)
        let file = folder.appendingPathComponent("discovery.json")
        return (CareerDiscoveryStore(file: file, service: service), file)
    }
    func page(jobs: [DiscoveryJob]? = nil, status: String? = nil, cursor: String? = nil) -> DiscoveryPage {
        DiscoveryPage(ok: true, version: 1, generatedAt: fixture.generatedAt, status: status ?? fixture.status,
            jobs: jobs ?? fixture.jobs, sources: fixture.sources, nextCursor: cursor, totalMatches: fixture.totalMatches,
            limited: fixture.limited, notice: fixture.notice)
    }
    func run() async throws {
        do {
            let query = DiscoveryQuery(sources: ["lever:eu:example-board", "https://job-boards.greenhouse.io/example-board"],
                keywords: "clinic operations", location: "London", remoteOnly: true)
            let request = try DiscoveryPolicy.request(route: "search", query: query, cursor: "opaque+/=")
            let components = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!
            try check(request.url!.absoluteString.hasPrefix(MobileApplicationPolicy.hostedServiceOrigin + "/api/discovery/search?"), "Discovery uses only the fixed public service")
            try check(request.httpMethod == "GET" && request.httpBody == nil && !request.httpShouldHandleCookies, "Public search is a body-free GET with cookie handling disabled")
            try check(request.value(forHTTPHeaderField: "Authorization") == nil && request.value(forHTTPHeaderField: "Cookie") == nil, "No account token or cookie enters the request")
            try check(Set(components.queryItems!.map(\.name)) == Set(["source", "q", "location", "remote", "cursor"]), "Request has only the explicit discovery parameters")
            try check(components.queryItems!.filter { $0.name == "source" }.count == 2 && components.queryItems!.last?.value == "opaque+/=", "Repeated sources and opaque cursor survive URL encoding")
            try check(DiscoveryQuery(location: String(repeating: "x", count: 101)).validationError != nil, "Provider location bound is enforced before a request")
            try check(DiscoveryPolicy.supportedBoardURL("https://jobs.eu.lever.co/example-board/123") != nil
                && DiscoveryPolicy.supportedBoardURL("https://jobs.lever.co.evil.example/board") == nil
                && DiscoveryPolicy.supportedBoardURL("https://user:password@jobs.lever.co/board") == nil, "Board input accepts exact supported HTTPS hosts and rejects impersonation/credentials")
            scenarios += 1
        }
        do {
            try DiscoveryPolicy.validate(fixture)
            try check(fixture.jobs[0].country == nil && fixture.jobs[0].remote == nil, "Unknown country and work arrangement stay unknown")
            try check(fixture.jobs[1].country == "GB" && fixture.jobs[1].remote == true && fixture.jobs[1].stale, "Provider geography and stale evidence remain explicit")
            let service = DiscoveryStub(fixture), (model, _) = store(DiscoveryStub(fixture))
            try DiscoveryPolicy.validate(service.directory)
            try check(model.jobs.isEmpty && model.query.sources.isEmpty && !model.isSearching, "Fresh discovery has no assumed personal criteria or seeded jobs")
            scenarios += 1
        }
        do {
            let service = DiscoveryStub(fixture), (model, file) = store(DiscoveryStub(fixture))
            let actual = CareerDiscoveryStore(file: file, service: service)
            actual.query.sources = ["lever:eu:example-board"]
            await actual.loadCatalog()
            try check(service.catalogCalls == 1 && service.calls.isEmpty, "Directory loading does not start a job search")
            try check(actual.query.sources == ["lever:eu:example-board"], "Directory response cannot overwrite explicit board choices")
            await actual.search()
            try check(actual.jobs.count == 2 && actual.page?.status == "partial", "Public fixture becomes attributed results including partial coverage")
            let restored = CareerDiscoveryStore(file: file, service: service)
            try check(restored.jobs == actual.jobs && restored.restoredResults && !restored.canLoadMore, "Cached results survive relaunch and require a fresh search before pagination")
            try check(service.calls.count == 1 && model.jobs.isEmpty, "Restoration makes no automatic search or cross-workspace mutation")
            scenarios += 1
        }
        do {
            let service = DiscoveryStub(fixture); let (model, _) = store(service)
            await model.search(); let gate = DiscoveryGate(); service.handle = { _, _ in try await gate.wait() }
            let request = Task { await model.search() }; try await waitUntil { gate.started }
            model.query.location = "Toronto"; gate.finish(page(jobs: [])); await request.value
            try check(model.jobs == fixture.jobs && model.lastQuery?.location == "", "Delayed result cannot replace rows after search inputs change")
            try check(!model.isSearching && model.criteriaChanged && model.error != nil, "Stale criteria require visible explicit search")
            scenarios += 1
        }
        do {
            let service = DiscoveryStub(fixture); let (model, _) = store(service); let gate = DiscoveryGate()
            service.handle = { _, _ in try await gate.wait() }
            let old = Task { await model.search() }; try await waitUntil { gate.started }; model.cancelSearch()
            service.handle = { _, _ in self.fixture }; await model.search()
            gate.finish(page(jobs: [])); await old.value
            try check(model.jobs == fixture.jobs && !model.isSearching, "Cancelled noncooperative response cannot replace a newer successful search")
            scenarios += 1
        }
        do {
            let service = DiscoveryStub(fixture); let (model, _) = store(service)
            service.handle = { _, cursor in cursor == nil ? self.page(jobs: [self.fixture.jobs[0]], cursor: "page-two") : self.page() }
            await model.search(); try check(model.canLoadMore, "Cursor enables explicit next page")
            await model.search(more: true)
            try check(model.jobs.count == 2 && Set(model.jobs.map(\.id)).count == 2, "Pagination deduplicates stable posting IDs")
            try check(service.calls[1].1 == "page-two" && service.calls[1].0 == service.calls[0].0, "Paging preserves the exact search and opaque cursor")
            service.handle = { _, _ in self.page(cursor: "old-cursor") }; await model.search()
            service.handle = { _, _ in throw DiscoveryFailure(message: "Changed", code: "discovery_changed") }
            await model.search(more: true); let count = service.calls.count; await model.search(more: true)
            try check(model.jobs == fixture.jobs && model.needsNewSearch && !model.canLoadMore && service.calls.count == count, "Changed cursor retains results and blocks repeated paging until explicit new search")
            scenarios += 1
        }
        do {
            let service = DiscoveryStub(fixture); let (model, _) = store(service); await model.search()
            service.handle = { _, _ in self.page(jobs: [self.fixture.jobs[0], self.fixture.jobs[0]]) }; await model.search()
            try check(model.jobs == fixture.jobs && model.error != nil, "Malformed duplicate-ID response preserves previous results")
            service.handle = { _, _ in self.page(jobs: [], status: "unavailable") }; await model.search()
            try check(model.jobs == fixture.jobs && model.restoredResults && model.needsNewSearch, "All-provider unavailability retains prior evidence and is never treated as zero jobs")
            scenarios += 1
        }
        do {
            let service = DiscoveryStub(fixture); let (model, _) = store(service); await model.search()
            service.handle = { _, _ in throw DiscoveryFailure(message: "Wait", retryAfter: Date().addingTimeInterval(60)) }
            await model.search(); let count = service.calls.count; await model.search()
            try check(model.jobs == fixture.jobs && service.calls.count == count && model.retryAfter != nil, "Rate-limit retry time prevents an early repeat request without dropping results")
            scenarios += 1
        }
        do {
            let service = DiscoveryStub(fixture); let (model, _) = store(service)
            for board in ["one", "two", "three", "four"] { try check(model.addBoard("https://jobs.lever.co/" + board), "A supported custom board is saved") }
            try check(!model.addBoard("https://jobs.lever.co/five") && model.query.sources.count == 4, "Fifth board is refused without replacing selected boards")
            model.useDefaultSources(); try check(model.query.sources.isEmpty, "Explicit reset restores suggested-source behavior")
            try check(!model.addBoard("https://127.0.0.1/private") && model.query.sources.isEmpty, "Unsupported private URL never becomes a board")
            scenarios += 1
        }
        do {
            let service = DiscoveryStub(fixture); let (_, file) = store(service)
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            let original = Data("unrecognized prior discovery data".utf8); try original.write(to: file)
            let model = CareerDiscoveryStore(file: file, service: service); await model.search()
            let preserved = try Data(contentsOf: file)
            try check(preserved == original && model.jobs.count == 2, "Unreadable storage is preserved while new results remain usable in memory")
            scenarios += 1
        }
    }
}

@main
struct DiscoveryCheck {
    @MainActor static func main() async {
        do {
            let fixture = try JSONDecoder().decode(DiscoveryPage.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
            let suite = DiscoverySuite(fixture)
            defer { for folder in suite.folders { try? FileManager.default.removeItem(at: folder) } }
            try await suite.run()
            print("PASS \(suite.assertions) public discovery assertions across \(suite.scenarios) scenarios")
        } catch { fputs(error.localizedDescription + "\n", stderr); exit(1) }
    }
}
