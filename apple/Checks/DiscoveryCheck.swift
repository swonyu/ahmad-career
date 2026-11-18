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
            scenarios += 1
        }
        do {
            let service = DiscoveryStub(fixture); let (model, file) = store(service)
            service.handle = { _, _ in self.page(jobs: [], status: "complete") }
            await model.search()
            let restored = CareerDiscoveryStore(file: file, service: service)
            try check(restored.jobs.isEmpty && restored.restoredResults && restored.page?.status == "complete", "A saved empty search is historical after relaunch")
            service.handle = { _, _ in throw URLError(.notConnectedToInternet) }
            await restored.search()
            try check(restored.restoredResults && restored.jobs.isEmpty && restored.error != nil, "A failed refresh keeps an empty saved search historical")
            service.handle = { _, _ in self.fixture }
            await restored.search()
            try check(!restored.restoredResults && restored.jobs == self.fixture.jobs, "A successful new search replaces the historical empty page")
            for status in ["fresh", "cached", "stale", "unavailable"] {
                for historical in [false, true] {
                    try check(DiscoveryPresentation.sourceAvailabilityKey(status: status, restored: historical) != "Checked now", "Freshness copy never says the check just happened")
                }
            }
            try check(DiscoveryPresentation.sourceAvailabilityKey(status: "fresh", restored: true) == "Saved result from an earlier check"
                && DiscoveryPresentation.sourceAvailabilityKey(status: "fresh", restored: false) == "Fetched for this search", "A restored fresh source stays marked as an earlier check")
            try check(DiscoveryPresentation.emptyTitle(searching: false, pageStatus: "complete") == "No matching jobs in these boards."
                && DiscoveryPresentation.emptyTitle(searching: false, pageStatus: "partial") == "No matches in the results we could check."
                && DiscoveryPresentation.emptyTitle(searching: false, pageStatus: "unavailable") == "Current openings could not be checked.", "Empty outcomes stay distinct")
            try check(DiscoveryPresentation.offersSubmittedRetry(status: "partial") && DiscoveryPresentation.offersSubmittedRetry(status: "unavailable")
                && !DiscoveryPresentation.offersSubmittedRetry(status: "complete"), "Only an incomplete search offers the submitted retry")
            scenarios += 1
        }
        do {
            let same = DiscoveryPolicy.canonicalBoard("greenhouse:canonical")
            let legacy = DiscoveryPolicy.canonicalBoard("https://boards.greenhouse.io/canonical")
            let current = DiscoveryPolicy.canonicalBoard("https://job-boards.greenhouse.io/Canonical/")
            let posting = DiscoveryPolicy.canonicalBoard("https://job-boards.greenhouse.io/canonical/jobs/123?utm_source=mail&gh_jid=9")
            let embed = DiscoveryPolicy.canonicalBoard("https://boards.greenhouse.io/embed/job_board?for=Canonical")
            try check(same?.id == "greenhouse:canonical" && legacy?.id == same?.id && current?.id == same?.id && posting?.id == same?.id && embed?.id == same?.id, "Greenhouse spellings share one board id")
            try check(same?.boardUrl == "https://job-boards.greenhouse.io/canonical", "Stored board links use the public Greenhouse host")
            try check(DiscoveryPolicy.canonicalBoard("https://jobs.lever.co/spotify")?.id == "lever:global:spotify"
                && DiscoveryPolicy.canonicalBoard("https://jobs.eu.lever.co/spotify/")?.id == "lever:eu:spotify"
                && DiscoveryPolicy.canonicalBoard("https://jobs.lever.co/spotify/00000000-0000-4000-8000-000000000001/apply")?.id == "lever:global:spotify", "Lever regions stay distinct and a posting keeps its board")
            try check(DiscoveryPolicy.canonicalBoard("https://jobs.eu.lever.co/example-board/123") == nil
                && DiscoveryPolicy.supportedBoardURL("https://jobs.eu.lever.co/example-board/123") != nil, "A loose board-host check is not treated as a canonical board")
            let rejected = ["https://jobs.lever.co.evil.example/board", "https://user:password@jobs.lever.co/board", "https://jobs.lever.co:443/board", "http://jobs.lever.co/board",
                            "https://jobs.lever.co/board%2Fhidden", "https://job-boards.greenhouse.io/canonical/../other", "https://job-boards.greenhouse.io/canonical?extra=1",
                            "https://boards.greenhouse.io/embed/job_board?for=one&for=two", "lever:GLOBAL:board", "https://job-boards.greenhouse.io/canonical#section"]
            try check(rejected.allSatisfy { DiscoveryPolicy.canonicalBoard($0) == nil }, "Unsafe board URLs and region spellings are refused")
            try check(DiscoveryPolicy.canonicalBoard("greenhouse:Canonical")?.id == "greenhouse:canonical", "A short board id folds only the board token")
            let service = DiscoveryStub(fixture); let (model, _) = store(service)
            try check(model.addBoard("https://boards.greenhouse.io/canonical") && model.addBoard("greenhouse:canonical") && model.addBoard("https://job-boards.greenhouse.io/canonical/"), "Equivalent board URLs are the same selection")
            try check(model.query.sources == ["greenhouse:canonical"], "Equivalent boards are stored once as the canonical id")
            scenarios += 1
        }
        do {
            let service = DiscoveryStub(fixture); let (model, _) = store(service)
            model.query.keywords = "old"; await model.search()
            model.query.keywords = "newer draft"; await model.retrySubmittedSearch()
            try check(model.query.keywords == "newer draft" && service.calls.last?.0.keywords == "old", "Retry repeats the submitted search and leaves the newer draft")
            let gate = DiscoveryGate(); service.handle = { _, _ in try await gate.wait() }
            let retry = Task { await model.retrySubmittedSearch() }; try await waitUntil { gate.started }
            service.handle = { _, _ in self.page(status: "complete") }
            model.query.keywords = "explicit"; await model.search()
            gate.finish(self.page(jobs: [], status: "partial")); await retry.value
            try check(model.query.keywords == "explicit" && model.jobs == self.fixture.jobs && service.calls.last?.0.keywords == "explicit", "A newer explicit search wins over a late submitted retry")
            scenarios += 1
        }
        for hasPreviousResults in [false, true] {
            let service = DiscoveryStub(fixture); let (model, file) = store(service)
            let submitted = DiscoveryQuery(sources: ["lever:eu:example-board"], keywords: "submitted role", location: "Riyadh", remoteOnly: true)
            model.query = submitted
            if hasPreviousResults { await model.search() }
            let retryTime = Date().addingTimeInterval(60)
            service.handle = { _, _ in throw DiscoveryFailure(message: "Wait", retryAfter: retryTime) }
            await model.search()
            let retainedJobs = model.jobs, retainedQuery = model.lastQuery, retainedStatus = model.page?.status
            let callCount = service.calls.count
            let newerDraft = DiscoveryQuery(sources: ["greenhouse:draft-board"], keywords: "newer draft", location: "Tokyo", remoteOnly: false)
            model.query = newerDraft
            let savedBeforeRetry = try Data(contentsOf: file)
            try check(model.canRetrySubmittedSearch, "A failed or partial submitted search has an explicit retry action")
            service.handle = { _, _ in self.page(status: "complete") }
            await model.retrySubmittedSearch()
            try check(service.calls.count == callCount, "Submitted retry must not contact the service before Retry-After, including a failed first search")
            try check(model.retryAfter == retryTime && model.error?.hasPrefix("Try again after ") == true && !model.isSearching,
                      "An early submitted retry keeps the cooldown and reports the waiting state")
            try check(model.query == newerDraft && model.jobs == retainedJobs && model.lastQuery == retainedQuery && model.page?.status == retainedStatus,
                      "Blocked retry preserves newer draft fields and prior result attribution")
            let savedAfterRetry = try Data(contentsOf: file)
            try check(savedAfterRetry == savedBeforeRetry, "Blocked retry does not rewrite saved search data")
            scenarios += 1
        }
        do {
            let service = DiscoveryStub(fixture); let (model, _) = store(service)
            let submitted = DiscoveryQuery(sources: ["lever:eu:example-board"], keywords: "submitted role", location: "Riyadh", remoteOnly: true)
            model.query = submitted
            service.handle = { _, _ in throw DiscoveryFailure(message: "Wait", retryAfter: Date().addingTimeInterval(-1)) }
            await model.search()
            let newerDraft = DiscoveryQuery(sources: ["greenhouse:draft-board"], keywords: "newer draft", location: "Tokyo", remoteOnly: false)
            model.query = newerDraft
            service.handle = { _, _ in self.fixture }
            await model.retrySubmittedSearch()
            try check(service.calls.count == 2 && service.calls.last?.0 == submitted && service.calls.last?.1 == nil,
                      "An expired cooldown allows retry of the exact submitted filters, not the newer form draft")
            try check(model.query == newerDraft && model.lastQuery == submitted && model.jobs == fixture.jobs && model.retryAfter == nil && model.error == nil,
                      "Successful retry after cooldown preserves draft edits and attributes results to the submitted search")
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
