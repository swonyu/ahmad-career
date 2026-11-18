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
        if sources.count > 4 { return "Choose up to four different employer boards." }
        if sources.contains(where: { DiscoveryPolicy.canonicalBoard($0) == nil }) { return "Use a supported employer board or its public board URL." }
        let identities = sources.compactMap { DiscoveryPolicy.canonicalBoard($0)?.id }
        if Set(identities).count != identities.count { return "Choose each employer board only once." }
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

struct DiscoveryBoardIdentity: Identifiable, Equatable {
    let id: String
    let provider: String
    let region: String
    let board: String
    let boardUrl: String
}

enum DiscoveryPresentation {
    static func sourceAvailabilityKey(status: String, restored: Bool) -> String {
        switch status {
        case "fresh": return restored ? "Saved result from an earlier check" : "Fetched for this search"
        case "cached": return "Recent cached result"
        case "stale": return "Earlier cached result — recheck employer"
        default: return "Unavailable — this does not mean there are no openings"
        }
    }
    static func emptyTitle(searching: Bool, pageStatus: String?) -> String {
        if searching { return "Checking employer boards…" }
        switch pageStatus {
        case "unavailable": return "Current openings could not be checked."
        case "partial": return "No matches in the results we could check."
        case "complete": return "No matching jobs in these boards."
        case nil: return "Start a job search"
        default: return "No roles match this search."
        }
    }
    static func emptyDetail(pageStatus: String?) -> String {
        switch pageStatus {
        case "unavailable": return "The selected boards did not return results. Retry the same search, or review the source details."
        case "partial": return "This search is incomplete. Review the source details, or retry the same search."
        case "complete": return "Try a broader job title, another location, or a different employer board."
        case nil: return "Use a role or skill, add a location if you want, and choose up to four Greenhouse or Lever employer boards. Tap Search jobs when you are ready."
        default: return "Try fewer keywords, another location or a different employer board. Results cover the selected boards, not every employer or country. Your saved opportunities are unchanged."
        }
    }
    static func offersSubmittedRetry(status: String?) -> Bool { status == "partial" || status == "unavailable" }
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
    /// Same acceptance rules as the committed hosted parseDiscoverySource. A nil result is not a supported board.
    static func canonicalBoard(_ raw: String) -> DiscoveryBoardIdentity? {
        if raw.count > 2048 { return nil }
        if raw.unicodeScalars.contains(where: { scalar in
            scalar.value <= 0x1f || scalar.value == 0x7f || scalar == "\\" || Character(scalar).isWhitespace
        }) { return nil }
        if raw.lowercased().hasPrefix("https://") { return canonicalHTTPSBoard(raw) }
        let parts = raw.split(separator: ":", omittingEmptySubsequences: false).map(String.init)
        if parts.count == 2, parts[0] == "greenhouse" { return finishBoard(provider: "greenhouse", region: "global", board: parts[1]) }
        if parts.count == 3, parts[0] == "lever", parts[1] == "global" || parts[1] == "eu" {
            return finishBoard(provider: "lever", region: parts[1], board: parts[2])
        }
        return nil
    }
    static func canonicalSources(_ sources: [String]) -> [String] {
        var seen = Set<String>()
        var result: [String] = []
        for raw in sources {
            let token = canonicalBoard(raw)?.id ?? raw
            if seen.insert(token).inserted { result.append(token) }
        }
        return result
    }
    static func serviceQuery(_ query: DiscoveryQuery) -> DiscoveryQuery {
        var copy = query
        let mapped = query.sources.map { canonicalBoard($0)?.id }
        if mapped.allSatisfy({ $0 != nil }) { copy.sources = mapped.compactMap { $0 } }
        return copy
    }
    private static func canonicalHTTPSBoard(_ raw: String) -> DiscoveryBoardIdentity? {
        let headEnd = raw.firstIndex(where: { $0 == "?" || $0 == "#" }) ?? raw.endIndex
        let head = String(raw[..<headEnd])
        if head.range(of: #"(?:/\.{1,2}(?:/|$)|%)"#, options: .regularExpression) != nil { return nil }
        guard let components = URLComponents(string: raw), components.scheme?.lowercased() == "https",
              components.user == nil, components.password == nil, components.port == nil,
              components.fragment?.isEmpty != false,
              !components.percentEncodedPath.contains("%"),
              let host = components.host?.lowercased() else { return nil }
        let path = components.percentEncodedPath
        let pairs = rawQueryPairs(raw)
        guard let pairs else { return nil }
        if host == "boards.greenhouse.io" || host == "job-boards.greenhouse.io" {
            if path == "/embed/job_board" {
                let tokens = pairs.filter { $0.0 == "for" }
                guard pairs.allSatisfy({ $0.0 == "for" }), tokens.count == 1, let board = tokens.first?.1 else { return nil }
                return finishBoard(provider: "greenhouse", region: "global", board: board)
            }
            let pieces = pathPieces(path)
            let directJob = pieces.count == 3 && pieces[1] == "jobs" && pieces[2].range(of: #"^\d{1,20}$"#, options: .regularExpression) != nil
            guard pieces.count == 1 || directJob else { return nil }
            guard trackingAllowed(pairs) else { return nil }
            return finishBoard(provider: "greenhouse", region: "global", board: pieces[0])
        }
        if host == "jobs.lever.co" || host == "jobs.eu.lever.co" {
            let pieces = pathPieces(path)
            let uuid = #"^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$"#
            let posting = pieces.count == 2 && pieces[1].range(of: uuid, options: .regularExpression) != nil
            let apply = pieces.count == 3 && pieces[1].range(of: uuid, options: .regularExpression) != nil && pieces[2] == "apply"
            guard pieces.count == 1 || posting || apply else { return nil }
            guard trackingAllowed(pairs) else { return nil }
            return finishBoard(provider: "lever", region: host == "jobs.eu.lever.co" ? "eu" : "global", board: pieces[0])
        }
        return nil
    }
    private static func trackingAllowed(_ pairs: [(String, String)]) -> Bool {
        pairs.allSatisfy { key, _ in
            key.range(of: #"^utm_[a-zA-Z0-9_]+$"#, options: .regularExpression) != nil
                || key == "gh_jid" || key == "lever-source" || key == "lever-origin" || key == "source"
        }
    }
    private static func rawQueryPairs(_ raw: String) -> [(String, String)]? {
        guard let queryStart = raw.firstIndex(of: "?") else { return [] }
        var query = String(raw[raw.index(after: queryStart)...])
        if let hash = query.firstIndex(of: "#") { query = String(query[..<hash]) }
        if query.isEmpty { return [] }
        var pairs: [(String, String)] = []
        for part in query.split(separator: "&", omittingEmptySubsequences: false) {
            let piece = String(part)
            let key: String
            let value: String
            if let separator = piece.firstIndex(of: "=") {
                key = String(piece[..<separator])
                value = String(piece[piece.index(after: separator)...])
            } else {
                key = piece
                value = ""
            }
            if key.contains("%") { return nil }
            guard let decoded = value.removingPercentEncoding else { return nil }
            pairs.append((key, decoded))
        }
        return pairs
    }
    private static func pathPieces(_ path: String) -> [String] {
        var trimmed = path
        if trimmed.count > 1, trimmed.hasSuffix("/") { trimmed.removeLast() }
        var parts = trimmed.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        if parts.first == "" { parts.removeFirst() }
        return parts
    }
    private static func finishBoard(provider: String, region: String, board: String) -> DiscoveryBoardIdentity? {
        guard board.range(of: #"^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$"#, options: .regularExpression) != nil else { return nil }
        let token = board.lowercased()
        let id = provider == "greenhouse" ? "greenhouse:\(token)" : "lever:\(region):\(token)"
        let host = provider == "greenhouse" ? "job-boards.greenhouse.io" : (region == "eu" ? "jobs.eu.lever.co" : "jobs.lever.co")
        return DiscoveryBoardIdentity(id: id, provider: provider, region: region, board: token, boardUrl: "https://\(host)/\(token)")
    }
    static func request(route: String, query: DiscoveryQuery? = nil, cursor: String? = nil) throws -> URLRequest {
        guard ["sources", "search"].contains(route) else { throw DiscoveryFailure(message: "This search action is unavailable.") }
        var parts = URLComponents(string: MobileApplicationPolicy.hostedServiceOrigin + "/api/discovery/" + route)!
        if let query {
            if let issue = query.validationError { throw DiscoveryFailure(message: issue) }
            let outgoing = serviceQuery(query)
            parts.queryItems = outgoing.sources.map { URLQueryItem(name: "source", value: $0) }
                + [URLQueryItem(name: "q", value: outgoing.keywords), URLQueryItem(name: "location", value: outgoing.location),
                   URLQueryItem(name: "remote", value: outgoing.remoteOnly ? "remote" : "any")]
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
    @Published private(set) var catalogError: String?
    @Published private(set) var storageNotice: String?
    var savedSearchRestoreBlocked: Bool { !storageReadable }
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
    /// In-memory only. A relaunch retries the last saved search through lastQuery.
    private var submittedQuery: DiscoveryQuery?
    @Published private var submittedSearchFailed = false
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
        persist(); requestID = nil; requestTask?.cancel(); requestTask = nil; isSearching = false; submittedQuery = nil
        scope = target
        let key = SHA256.hash(data: Data((target.origin + "\u{0}" + target.workspaceID).utf8)).map { String(format: "%02x", $0) }.joined()
        file = target.isLocal ? baseFile : baseFile.deletingLastPathComponent().appendingPathComponent("discovery-" + key + ".json")
        restoring = true; query = DiscoveryQuery(); lastQuery = nil; page = nil; jobs = []; restoredResults = false
        needsNewSearch = false; retryAfter = nil; error = nil; storageNotice = nil; storageReadable = true; submittedQuery = nil; submittedSearchFailed = false; restoring = false
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
        try write(bytes); requestID = nil; requestTask?.cancel(); requestTask = nil; isSearching = false; submittedQuery = nil; submittedSearchFailed = false
        restore(); needsNewSearch = true; retryAfter = nil
    }
    func clearCurrentScope() throws {
        let bytes = try JSONEncoder().encode(DiscoverySavedState())
        try write(bytes); requestID = nil; requestTask?.cancel(); requestTask = nil; isSearching = false; submittedQuery = nil; submittedSearchFailed = false
        storageReadable = true; storageNotice = nil; error = nil; needsNewSearch = false; retryAfter = nil
        restore()
    }
    private func repaired(_ original: DiscoveryQuery) -> DiscoveryQuery {
        var copy = original
        copy.sources = DiscoveryPolicy.canonicalSources(original.sources)
        return copy
    }
    private func restore() {
        guard FileManager.default.fileExists(atPath: file.path) else { return }
        restoring = true
        var persistRepair = false
        defer { restoring = false; if persistRepair { persist() } }
        do {
            let data = try Data(contentsOf: file)
            guard data.count <= 12 * 1_024 * 1_024 else { throw CocoaError(.coderInvalidValue) }
            let saved = try JSONDecoder().decode(DiscoverySavedState.self, from: data)
            guard saved.schemaVersion == 1, saved.jobs.count <= DiscoveryPolicy.maximumStoredJobs,
                  saved.jobs.allSatisfy({ MobileApplicationPolicy.jobURL($0.url) != nil }),
                  Set(saved.jobs.map(\.id)).count == saved.jobs.count else { throw CocoaError(.coderReadCorrupt) }
            if let page = saved.page { try DiscoveryPolicy.validate(page) }
            // A failed same-scope read must keep the live submitted search and its retry state.
            submittedQuery = nil; submittedSearchFailed = false
            storageReadable = true; storageNotice = nil
            let repairedQuery = repaired(saved.query)
            let repairedLast = saved.lastQuery.map(repaired)
            query = repairedQuery; lastQuery = repairedLast; page = saved.page; jobs = saved.jobs
            restoredResults = saved.page != nil || !saved.jobs.isEmpty
            if repairedQuery.validationError != nil || repairedLast?.validationError != nil {
                storageNotice = "These search fields exceed the supported limits. Earlier saved search data is kept."
            } else if repairedQuery.sources != saved.query.sources || repairedLast?.sources != saved.lastQuery?.sources {
                persistRepair = true
            }
        } catch {
            storageReadable = false; storageNotice = "The previous search file could not be read. It is preserved; new searches will stay in memory."
        }
    }
    /// Try the failed read or save again. An unreadable file is left in place until it can be read.
    func retrySavedSearch() {
        if !storageReadable {
            restore()
            if !storageReadable && !FileManager.default.fileExists(atPath: file.path) {
                storageReadable = true; storageNotice = nil
            }
        }
        guard storageReadable else { return }
        persist()
    }
    var canLoadMore: Bool { page?.nextCursor != nil && lastQuery == query && !isSearching && !restoredResults && !needsNewSearch }
    var criteriaChanged: Bool { lastQuery != nil && lastQuery != query }
    func loadCatalog() async {
        guard catalog == nil, !loadingCatalog else { return }
        loadingCatalog = true; catalogError = nil; defer { loadingCatalog = false }
        do {
            let result = try await service.catalog(); try DiscoveryPolicy.validate(result); catalog = result
        } catch {
            catalogError = "Employer boards could not be loaded. You can retry or search the recommended boards."
        }
    }
    func boardSelected(_ raw: String) -> Bool {
        if let id = DiscoveryPolicy.canonicalBoard(raw)?.id {
            return query.sources.contains { DiscoveryPolicy.canonicalBoard($0)?.id == id }
        }
        return query.sources.contains(raw)
    }
    func boardDisplay(_ raw: String) -> String { DiscoveryPolicy.canonicalBoard(raw)?.boardUrl ?? raw }
    func canonicalBoardURL(_ raw: String) -> URL? {
        guard let identity = DiscoveryPolicy.canonicalBoard(raw) else { return nil }
        return URL(string: identity.boardUrl)
    }
    var recoveryBoardFallbacks: [DiscoveryBoardIdentity] {
        guard page == nil, error != nil, let sources = submittedQuery?.sources else { return [] }
        var seen = Set<String>()
        return sources.compactMap { raw in
            guard let identity = DiscoveryPolicy.canonicalBoard(raw), seen.insert(identity.id).inserted else { return nil }
            return identity
        }
    }
    var canRetrySubmittedSearch: Bool {
        guard !isSearching, (submittedQuery ?? lastQuery) != nil else { return false }
        if submittedSearchFailed { return true }
        if let status = page?.status { return DiscoveryPresentation.offersSubmittedRetry(status: status) }
        return error != nil
    }
    func addBoard(_ input: String) -> Bool {
        let value = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let identity = DiscoveryPolicy.canonicalBoard(value) else {
            error = "Paste a public Greenhouse or Lever employer board URL."; return false
        }
        if boardSelected(identity.id) { return true }
        guard query.sources.count < 4 else { error = "Choose up to four employer boards per search."; return false }
        query.sources.append(identity.id); persist(); return true
    }
    func toggleSource(_ id: String) {
        if boardSelected(id) {
            if let canonical = DiscoveryPolicy.canonicalBoard(id)?.id {
                query.sources.removeAll { DiscoveryPolicy.canonicalBoard($0)?.id == canonical }
            } else { query.sources.removeAll { $0 == id } }
        } else if query.sources.count < 4 {
            query.sources.append(DiscoveryPolicy.canonicalBoard(id)?.id ?? id)
        } else { error = "Choose up to four employer boards per search."; return }
        persist()
    }
    func useDefaultSources() { query.sources = []; persist() }
    func cancelSearch() {
        requestID = nil; requestTask?.cancel(); requestTask = nil; isSearching = false; submittedSearchFailed = false
        error = "Search stopped. Previous results and saved opportunities are kept."
    }
    func retrySubmittedSearch() async {
        guard canRetrySubmittedSearch, let captured = submittedQuery ?? lastQuery else { return }
        if let retryAfter, retryAfter > Date() { return }
        await execute(captured: captured, more: false, ignoreDraftEdits: true)
    }
    func search(more: Bool = false) async {
        // Preserve the provider error; the view presents a separate localized deadline.
        if let retryAfter, retryAfter > Date() { return }
        if more {
            guard !isSearching, canLoadMore else { return }
            await execute(captured: query, more: true, ignoreDraftEdits: false)
            return
        }
        if let issue = query.validationError { error = issue; return }
        if isSearching {
            requestID = nil; requestTask?.cancel(); requestTask = nil; isSearching = false
        }
        await execute(captured: query, more: false, ignoreDraftEdits: false)
    }
    private func execute(captured: DiscoveryQuery, more: Bool, ignoreDraftEdits: Bool) async {
        if let retryAfter, retryAfter > Date() { return }
        if let issue = captured.validationError { error = issue; return }
        let cursor = more ? page?.nextCursor : nil, ticket = UUID()
        requestID = ticket; isSearching = true; error = nil; retryAfter = nil; submittedSearchFailed = false
        if !more { submittedQuery = captured }
        let outgoing = DiscoveryPolicy.serviceQuery(captured)
        let task = Task { try await service.search(outgoing, cursor: cursor) }
        requestTask = task
        do {
            let result = try await task.value
            guard requestID == ticket else { return }
            try DiscoveryPolicy.validate(result)
            if !ignoreDraftEdits && query != captured {
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
            submittedSearchFailed = !more
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
