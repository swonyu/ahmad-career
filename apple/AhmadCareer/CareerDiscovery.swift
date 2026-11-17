import Foundation
import Combine
import CryptoKit

struct DiscoverySource: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let provider: String
    let region: String
    let board: String
    let boardUrl: String
}

struct DiscoveryLimits: Codable { let maxSources: Int; let pageSize: Int; let maxJobsPerSource: Int }
struct DiscoveryCatalog: Codable {
    let ok: Bool
    let version: Int
    let defaultSources: [String]
    let sources: [DiscoverySource]
    let limits: DiscoveryLimits
    let notice: String
}
struct DiscoveryProviderIssue: Codable, Equatable { let code: String; let message: String }
struct DiscoverySourceStatus: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let provider: String
    let boardUrl: String
    let status: String
    let checkedAt: String?
    let availableCount: Int
    let matchedCount: Int
    let limited: Bool
    let error: DiscoveryProviderIssue?
}
struct DiscoveryJob: Codable, Identifiable, Equatable {
    let id: String
    let sourceId: String
    let sourceName: String
    let provider: String
    let title: String
    let company: String
    let url: String
    let location: String
    let country: String?
    let remote: Bool?
    let summary: String
    let publishedAt: String?
    let updatedAt: String?
    let checkedAt: String
    let stale: Bool
}
struct DiscoveryPage: Codable {
    let ok: Bool
    let version: Int
    let generatedAt: String
    let status: String
    let jobs: [DiscoveryJob]
    let sources: [DiscoverySourceStatus]
    let nextCursor: String?
    let totalMatches: Int
    let limited: Bool
    let notice: String
}
struct DiscoveryQuery: Codable, Equatable {
    var sources: [String] = []
    var keywords = ""
    var location = ""
    var remoteOnly = false
    var validationError: String? {
        if sources.count > 4 || Set(sources).count != sources.count { return "Choose up to four different employer boards." }
        if sources.contains(where: { $0.isEmpty || $0.count > 2_048 }) { return "Use a supported employer board or its public board URL." }
        if keywords.count > 120 || location.count > 100 { return "Use up to 120 characters for role words and 100 for location." }
        return nil
    }
    var summary: String {
        [keywords.isEmpty ? "All roles" : keywords, location.isEmpty ? "Any location" : location,
         remoteOnly ? "Remote evidence" : "Any work arrangement"].joined(separator: " · ")
    }
}
struct DiscoveryFailure: LocalizedError {
    let message: String
    var code: String? = nil
    var retryAfter: Date? = nil
    var errorDescription: String? { message }
}

enum DiscoveryPolicy {
    static let maximumSources = 4
    static let maximumStoredJobs = 2_000
    static func supportedBoardURL(_ raw: String) -> URL? {
        guard let url = MobileApplicationPolicy.jobURL(raw),
              ["boards.greenhouse.io", "job-boards.greenhouse.io", "jobs.lever.co", "jobs.eu.lever.co"].contains(url.host?.lowercased() ?? ""),
              !url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")).isEmpty else { return nil }
        return url
    }
    static func request(route: String, query: DiscoveryQuery? = nil, cursor: String? = nil) throws -> URLRequest {
        guard ["sources", "search"].contains(route) else { throw DiscoveryFailure(message: "This search action is unavailable.") }
        var parts = URLComponents(string: MobileApplicationPolicy.hostedServiceOrigin + "/api/discovery/" + route)!
        if let query {
            if let issue = query.validationError { throw DiscoveryFailure(message: issue) }
            parts.queryItems = query.sources.map { URLQueryItem(name: "source", value: $0) }
                + [URLQueryItem(name: "q", value: query.keywords), URLQueryItem(name: "location", value: query.location),
                   URLQueryItem(name: "remote", value: query.remoteOnly ? "remote" : "any")]
            if let cursor { parts.queryItems?.append(URLQueryItem(name: "cursor", value: cursor)) }
        }
        guard let url = parts.url else { throw DiscoveryFailure(message: "Check the search fields and try again.") }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 25)
        request.httpMethod = "GET"; request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }
    static func validate(_ catalog: DiscoveryCatalog) throws {
        let ids = catalog.sources.map(\.id)
        guard catalog.ok, catalog.version == 1, catalog.sources.count <= 100, Set(ids).count == ids.count,
              (1...4).contains(catalog.limits.maxSources), (1...50).contains(catalog.limits.pageSize),
              (1...500).contains(catalog.limits.maxJobsPerSource), catalog.defaultSources.count <= 4,
              Set(catalog.defaultSources).isSubset(of: Set(ids)),
              catalog.sources.allSatisfy({ !$0.id.isEmpty && !$0.name.isEmpty && ["lever", "greenhouse"].contains($0.provider)
                  && supportedBoardURL($0.boardUrl) != nil }) else {
            throw DiscoveryFailure(message: "The employer directory was incomplete. Your saved boards are unchanged.")
        }
    }
    static func validate(_ page: DiscoveryPage) throws {
        let sourceIDs = Set(page.sources.map(\.id))
        guard page.ok, page.version == 1, ["complete", "partial", "unavailable"].contains(page.status),
              ApplicationReviewPolicy.date(page.generatedAt) != nil, page.jobs.count <= 50,
              page.sources.count <= 4, sourceIDs.count == page.sources.count,
              Set(page.jobs.map(\.id)).count == page.jobs.count, page.totalMatches >= page.jobs.count,
              (page.nextCursor?.count ?? 0) <= 8_192,
              page.sources.allSatisfy({ !$0.id.isEmpty && !$0.name.isEmpty && ["lever", "greenhouse"].contains($0.provider)
                  && ["fresh", "cached", "stale", "unavailable"].contains($0.status)
                  && supportedBoardURL($0.boardUrl) != nil && $0.availableCount >= 0 && $0.matchedCount >= 0 }),
              page.jobs.allSatisfy({ !$0.id.isEmpty && !$0.title.isEmpty && !$0.company.isEmpty && sourceIDs.contains($0.sourceId)
                  && ["lever", "greenhouse"].contains($0.provider) && supportedBoardURL($0.url) != nil
                  && ($0.country == nil || $0.country!.range(of: "^[A-Z]{2}$", options: .regularExpression) != nil)
                  && ApplicationReviewPolicy.date($0.checkedAt) != nil }) else {
            throw DiscoveryFailure(message: "The search response was incomplete. Previous results are still available.")
        }
    }
}

@MainActor
protocol CareerDiscoveryServing: AnyObject {
    func catalog() async throws -> DiscoveryCatalog
    func search(_ query: DiscoveryQuery, cursor: String?) async throws -> DiscoveryPage
}
private final class DiscoveryNoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
@MainActor
final class CareerDiscoveryClient: CareerDiscoveryServing {
    private let session: URLSession
    init() {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil; config.httpShouldSetCookies = false; config.urlCredentialStorage = nil
        config.urlCache = nil; config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 25; config.timeoutIntervalForResource = 35
        session = URLSession(configuration: config, delegate: DiscoveryNoRedirect(), delegateQueue: nil)
    }
    deinit { session.invalidateAndCancel() }
    private func fetch<T: Decodable>(_ request: URLRequest, as type: T.Type) async throws -> T {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, data.count <= 4 * 1_024 * 1_024 else {
            throw DiscoveryFailure(message: "The discovery service returned an unreadable response. Try again later.")
        }
        guard (200...299).contains(http.statusCode) else {
            let fields = (try? JSONDecoder().decode([String: ApplicationValue].self, from: data)) ?? [:]
            let error = fields["error"]?.object ?? [:]
            let code = error["code"]?.string ?? fields["code"]?.string
            let seconds = http.value(forHTTPHeaderField: "Retry-After").flatMap(Double.init)
            let retry = seconds.flatMap { $0.isFinite && $0 >= 0 ? Date().addingTimeInterval(min($0, 3_600)) : nil }
            let message = http.statusCode == 409 ? "These results changed while you were browsing. Start a new search; the previous results are still here."
                : http.statusCode == 429 ? "Search is temporarily busy. Wait before trying again."
                : http.statusCode == 400 ? "Check your board URLs and search fields. Only supported public employer boards can be searched."
                : "The discovery service is unavailable. Your saved opportunities are still on this phone."
            throw DiscoveryFailure(message: message, code: code, retryAfter: retry)
        }
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw DiscoveryFailure(message: "The discovery response could not be read. Previous results are preserved.") }
    }
    func catalog() async throws -> DiscoveryCatalog {
        let result = try await fetch(DiscoveryPolicy.request(route: "sources"), as: DiscoveryCatalog.self)
        try DiscoveryPolicy.validate(result); return result
    }
    func search(_ query: DiscoveryQuery, cursor: String?) async throws -> DiscoveryPage {
        let result = try await fetch(DiscoveryPolicy.request(route: "search", query: query, cursor: cursor), as: DiscoveryPage.self)
        try DiscoveryPolicy.validate(result); return result
    }
}

private struct DiscoverySavedState: Codable {
    var schemaVersion = 1
    var query = DiscoveryQuery()
    var lastQuery: DiscoveryQuery?
    var page: DiscoveryPage?
    var jobs: [DiscoveryJob] = []
    init(query: DiscoveryQuery = DiscoveryQuery(), lastQuery: DiscoveryQuery? = nil, page: DiscoveryPage? = nil, jobs: [DiscoveryJob] = []) {
        self.query = query; self.lastQuery = lastQuery; self.page = page; self.jobs = jobs
    }
    private enum CodingKeys: String, CodingKey { case schemaVersion, query, lastQuery, page, jobs }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try c.decodeIfPresent(Int.self, forKey: .schemaVersion) ?? 1
        query = try c.decode(DiscoveryQuery.self, forKey: .query)
        lastQuery = try c.decodeIfPresent(DiscoveryQuery.self, forKey: .lastQuery)
        page = try c.decodeIfPresent(DiscoveryPage.self, forKey: .page)
        jobs = try c.decode([DiscoveryJob].self, forKey: .jobs)
    }
}

@MainActor
final class CareerDiscoveryStore: ObservableObject {
    @Published var query = DiscoveryQuery() { didSet { if !restoring { persist() } } }
    @Published private(set) var catalog: DiscoveryCatalog?
    @Published private(set) var jobs: [DiscoveryJob] = []
    @Published private(set) var page: DiscoveryPage?
    @Published private(set) var lastQuery: DiscoveryQuery?
    @Published private(set) var isSearching = false
    @Published private(set) var loadingCatalog = false
    @Published private(set) var restoredResults = false
    @Published private(set) var error: String?
    @Published private(set) var storageNotice: String?
    @Published private(set) var retryAfter: Date?
    @Published private(set) var needsNewSearch = false
    private let service: any CareerDiscoveryServing
    private let baseFile: URL
    private var file: URL
    private var scope = PhoneRecordScope()
    private var restoring = false
    private var storageReadable = true
    private var requestTask: Task<DiscoveryPage, Error>?
    private var requestID: UUID?
    init(file: URL? = nil, service: (any CareerDiscoveryServing)? = nil) {
        self.service = service ?? CareerDiscoveryClient()
        self.file = file ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("CareerFinder/discovery-v1.json")
        self.baseFile = self.file
        restore()
    }
    /// The legacy unscoped file remains the unpaired search; connecting never adopts it implicitly.
    func attach(to target: PhoneRecordScope) {
        guard target.valid, target != scope else { return }
        persist(); requestID = nil; requestTask?.cancel(); requestTask = nil; isSearching = false
        scope = target
        let key = SHA256.hash(data: Data((target.origin + "\u{0}" + target.workspaceID).utf8)).map { String(format: "%02x", $0) }.joined()
        file = target.isLocal ? baseFile : baseFile.deletingLastPathComponent().appendingPathComponent("discovery-" + key + ".json")
        restoring = true; query = DiscoveryQuery(); lastQuery = nil; page = nil; jobs = []; restoredResults = false
        needsNewSearch = false; retryAfter = nil; error = nil; storageNotice = nil; storageReadable = true; restoring = false
        restore()
    }
    func saveDraft() { persist() }
    nonisolated static func validateBackup(_ bytes: Data) throws {
        guard bytes.count <= 12 * 1_024 * 1_024 else { throw CocoaError(.coderInvalidValue) }
        let saved = try JSONDecoder().decode(DiscoverySavedState.self, from: bytes)
        guard saved.schemaVersion == 1, saved.query.validationError == nil, saved.lastQuery?.validationError == nil,
              saved.jobs.count <= DiscoveryPolicy.maximumStoredJobs,
              saved.jobs.allSatisfy({ MobileApplicationPolicy.jobURL($0.url) != nil }),
              Set(saved.jobs.map(\.id)).count == saved.jobs.count else { throw CocoaError(.coderInvalidValue) }
        if let page = saved.page { try DiscoveryPolicy.validate(page) }
    }
    func exportSnapshot() throws -> Data {
        guard storageReadable else { throw DiscoveryFailure(message: "The saved search is unreadable and has been preserved. Clear it deliberately or recover its original file before exporting a new workspace backup.") }
        let bytes = try JSONEncoder().encode(DiscoverySavedState(query: query, lastQuery: lastQuery, page: page, jobs: jobs))
        try Self.validateBackup(bytes); return bytes
    }
    func importSnapshot(_ bytes: Data) throws {
        try Self.validateBackup(bytes)
        guard storageReadable else { throw DiscoveryFailure(message: "The earlier search file is unreadable and was preserved. It was not replaced by the backup.") }
        try write(bytes); requestID = nil; requestTask?.cancel(); requestTask = nil; isSearching = false
        restore(); needsNewSearch = true; retryAfter = nil
    }
    func clearCurrentScope() throws {
        let bytes = try JSONEncoder().encode(DiscoverySavedState())
        try write(bytes); requestID = nil; requestTask?.cancel(); requestTask = nil; isSearching = false
        storageReadable = true; storageNotice = nil; error = nil; needsNewSearch = false; retryAfter = nil
        restore()
    }
    private func restore() {
        guard FileManager.default.fileExists(atPath: file.path) else { return }
        restoring = true; defer { restoring = false }
        do {
            let data = try Data(contentsOf: file)
            try Self.validateBackup(data)
            let saved = try JSONDecoder().decode(DiscoverySavedState.self, from: data)
            query = saved.query; lastQuery = saved.lastQuery; page = saved.page; jobs = saved.jobs
            restoredResults = !jobs.isEmpty
        } catch {
            storageReadable = false; storageNotice = "The previous search file could not be read. It is preserved; new searches will stay in memory."
        }
    }
    var canLoadMore: Bool { page?.nextCursor != nil && lastQuery == query && !isSearching && !restoredResults && !needsNewSearch }
    var criteriaChanged: Bool { lastQuery != nil && lastQuery != query }
    func loadCatalog() async {
        guard catalog == nil, !loadingCatalog else { return }
        loadingCatalog = true; defer { loadingCatalog = false }
        do {
            let result = try await service.catalog(); try DiscoveryPolicy.validate(result); catalog = result
        } catch { self.error = error.localizedDescription }
    }
    func addBoard(_ input: String) -> Bool {
        let value = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard DiscoveryPolicy.supportedBoardURL(value) != nil else {
            error = "Paste a public Greenhouse or Lever employer board URL."; return false
        }
        guard query.sources.count < 4 else { error = "Choose up to four employer boards per search."; return false }
        guard !query.sources.contains(value) else { return true }
        query.sources.append(value); persist(); return true
    }
    func toggleSource(_ id: String) {
        if query.sources.contains(id) { query.sources.removeAll { $0 == id } }
        else if query.sources.count < 4 { query.sources.append(id) }
        else { error = "Choose up to four employer boards per search."; return }
        persist()
    }
    func useDefaultSources() { query.sources = []; persist() }
    func cancelSearch() {
        requestID = nil; requestTask?.cancel(); requestTask = nil; isSearching = false
        error = "Search stopped. Previous results and saved opportunities are kept."
    }
    func search(more: Bool = false) async {
        guard !isSearching else { return }
        if let retryAfter, retryAfter > Date() {
            error = "Try again after " + retryAfter.formatted(date: .omitted, time: .shortened) + "."; return
        }
        if let issue = query.validationError { error = issue; return }
        if more && !canLoadMore { return }
        let captured = query, cursor = more ? page?.nextCursor : nil, ticket = UUID()
        requestID = ticket; isSearching = true; error = nil; retryAfter = nil
        let task = Task { try await service.search(captured, cursor: cursor) }; requestTask = task
        do {
            let result = try await task.value
            guard requestID == ticket else { return }
            try DiscoveryPolicy.validate(result)
            guard query == captured else {
                isSearching = false; requestID = nil; requestTask = nil
                error = "Your search changed. Search again to use the current fields; previous results are kept."; return
            }
            if !more && result.status == "unavailable" && result.jobs.isEmpty && !jobs.isEmpty {
                page = result; restoredResults = true; needsNewSearch = true
                isSearching = false; requestID = nil; requestTask = nil
                error = "The selected boards could not be checked. Previous results are kept; start a new search when the service is available."
                persist(); return
            }
            var merged = more ? jobs : []
            var ids = Set(merged.map(\.id))
            for job in result.jobs where ids.insert(job.id).inserted { merged.append(job) }
            guard merged.count <= DiscoveryPolicy.maximumStoredJobs else { throw DiscoveryFailure(message: "This search reached its result limit. Narrow the role or location and search again.") }
            jobs = merged; page = result; lastQuery = captured; restoredResults = false; needsNewSearch = false
            isSearching = false; requestID = nil; requestTask = nil; persist()
        } catch {
            guard requestID == ticket else { return }
            isSearching = false; requestID = nil; requestTask = nil
            if let failure = error as? DiscoveryFailure {
                self.error = failure.message; retryAfter = failure.retryAfter
                if failure.code == "discovery_changed" { needsNewSearch = true }
            }
            else if error is CancellationError || (error as? URLError)?.code == .cancelled {
                self.error = "Search stopped. Previous results are kept."
            } else { self.error = "Search could not finish. Check your connection and try again; previous results are kept." }
        }
    }
    private func persist() {
        guard storageReadable, !restoring else { return }
        guard query.validationError == nil else {
            storageNotice = "These search fields exceed the supported limits. Earlier saved search data is kept."; return
        }
        do {
            let saved = DiscoverySavedState(query: query, lastQuery: lastQuery, page: page, jobs: jobs)
            let data = try JSONEncoder().encode(saved)
            try Self.validateBackup(data); try write(data)
            storageNotice = nil
        } catch { storageNotice = "These search results are available now, but could not be saved on this phone." }
    }
    private func write(_ bytes: Data) throws {
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        #if os(iOS)
        try bytes.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try bytes.write(to: file, options: .atomic)
        #endif
    }
}
