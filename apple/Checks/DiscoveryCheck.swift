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
            let service = DiscoveryStub(fixture); let (model, file) = store(service)
            model.query.keywords = "Unsent role"; model.query.location = "Tokyo"; model.query.remoteOnly = true
            let reopened = CareerDiscoveryStore(file: file, service: service)
            try check(reopened.query == model.query && service.calls.isEmpty, "Unsent search fields persist on edit without making a request")
            await reopened.search()
            reopened.query.keywords = "Failed new query"
            service.handle = { _, _ in throw URLError(.notConnectedToInternet) }; await reopened.search()
            let failed = CareerDiscoveryStore(file: file, service: service)
            try check(failed.query.keywords == "Failed new query" && failed.jobs == fixture.jobs && failed.restoredResults,
                      "A failed search preserves both the newest fields and older attributed results across relaunch")
            scenarios += 1
        }
        do {
            let service = DiscoveryStub(fixture); let (model, file) = store(service)
            let a = PhoneRecordScope(origin: "https://first.example", workspaceID: "a")
            let b = PhoneRecordScope(origin: "https://second.example", workspaceID: "b")
            model.query.keywords = "Unpaired search"
            model.attach(to: a); model.query.keywords = "Private A"; await model.search()
            let gate = DiscoveryGate(); service.handle = { _, _ in try await gate.wait() }
            let pending = Task { await model.search() }; try await waitUntil { gate.started }
            model.attach(to: b)
            try check(model.query.keywords.isEmpty && model.jobs.isEmpty && !model.isSearching, "A new workspace cannot display A's search fields or results")
            gate.finish(fixture); await pending.value
            try check(model.jobs.isEmpty && model.query.keywords.isEmpty, "A delayed A result cannot populate workspace B")
            model.query.keywords = "Private B"; model.attach(to: a)
            try check(model.query.keywords == "Private A" && model.jobs == fixture.jobs && model.restoredResults,
                      "Returning to A restores its exact previous search without refetching")
            let reopened = CareerDiscoveryStore(file: file, service: service); reopened.attach(to: b)
            try check(reopened.query.keywords == "Private B" && reopened.jobs.isEmpty, "B's unfinished search persists independently across relaunch")
            reopened.attach(to: PhoneRecordScope())
            try check(reopened.query.keywords == "Unpaired search", "Legacy/unpaired search remains separately recoverable")
            scenarios += 1
        }
        do {
            let service = DiscoveryStub(fixture); let (model, _) = store(service)
            model.query.keywords = "Exported search"; await model.search(); let backup = try model.exportSnapshot()
            try model.clearCurrentScope()
            try check(model.query.keywords.isEmpty && model.jobs.isEmpty, "Explicit search clear removes fields and results for the active scope")
            try model.importSnapshot(backup)
            try check(model.query.keywords == "Exported search" && model.jobs == fixture.jobs && !model.canLoadMore,
                      "Search backup restores attributed results without reusable pagination authority")
            var future = try JSONSerialization.jsonObject(with: backup) as! [String: Any]; future["schemaVersion"] = 99
            var refused = false
            do { try model.importSnapshot(JSONSerialization.data(withJSONObject: future)) } catch { refused = true }
            try check(refused && model.jobs == fixture.jobs && model.query.keywords == "Exported search", "Unknown search backup versions preserve the current data")
            scenarios += 1
        }
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
            model.retrySavedSearch()
            let retried = try Data(contentsOf: file)
            try check(retried == original && model.savedSearchRestoreBlocked && model.storageNotice != nil,
                      "Retry leaves an unreadable search file untouched")
            scenarios += 1
        }
        do {
            let service = DiscoveryStub(fixture); let (healthy, file) = store(service)
            healthy.query.keywords = "Nurse"
            let recovered = try Data(contentsOf: file)
            try Data("unrecognized prior discovery data".utf8).write(to: file)
            let blocked = CareerDiscoveryStore(file: file, service: service)
            try check(blocked.savedSearchRestoreBlocked && blocked.query.keywords.isEmpty, "A damaged search file is not adopted")
            try recovered.write(to: file)
            blocked.retrySavedSearch()
            try check(!blocked.savedSearchRestoreBlocked && blocked.storageNotice == nil && blocked.query.keywords == "Nurse",
                      "Retry reads a repaired search file without starting a request")
            scenarios += 1
        }
        do {
            let service = DiscoveryStub(fixture); let (model, file) = store(service)
            model.query.keywords = "Nurse"
            let preserved = try Data(contentsOf: file)
            model.query.keywords = String(repeating: "ن", count: 121)
            try check(model.storageNotice == "These search fields exceed the supported limits. Earlier saved search data is kept."
                      && !model.savedSearchRestoreBlocked, "Oversized search fields explain why saving stopped")
            model.retrySavedSearch()
            let afterRetry = try Data(contentsOf: file)
            try check(afterRetry == preserved, "Retry does not replace the earlier saved search while fields are too long")
            model.query.keywords = "Nurse"
            try check(model.storageNotice == nil, "A corrected search is saved again")
            let reopened = CareerDiscoveryStore(file: file, service: service)
            try check(reopened.query.keywords == "Nurse" && reopened.storageNotice == nil, "The corrected search is still there after relaunch")
            scenarios += 1
        }
        do {
            let service = DiscoveryStub(fixture); let (model, file) = store(service)
            model.query.keywords = "Nurse"
            let parent = file.deletingLastPathComponent()
            try FileManager.default.removeItem(at: parent)
            try Data("not a directory".utf8).write(to: parent)
            model.query.keywords = "Pharmacist"
            try check(model.storageNotice == "These search results are available now, but could not be saved on this phone."
                      && !model.savedSearchRestoreBlocked, "A failed save stays on screen without hiding the search")
            model.retrySavedSearch()
            try check(model.storageNotice != nil, "Retry reports the save is still unavailable")
            try FileManager.default.removeItem(at: parent)
            try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
            model.retrySavedSearch()
            try check(model.storageNotice == nil, "Retry saves the search when storage is available again")
            let reopened = CareerDiscoveryStore(file: file, service: service)
            try check(reopened.query.keywords == "Pharmacist", "The retried save survives relaunch")
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
