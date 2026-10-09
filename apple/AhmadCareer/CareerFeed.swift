import Foundation
import CoreFoundation

struct WorkdaySource {
    let name: String
    let host: String
    let tenant: String
    let board: String

    var baseURL: URL { URL(string: "https://\(host)/wday/cxs/\(tenant)/\(board)")! }
}

enum CareerFeed {
    static let sourceBudgetNanoseconds: UInt64 = 45_000_000_000
    static let sources = [
        WorkdaySource(name: "Alcon", host: "alcon.wd5.myworkdayjobs.com", tenant: "alcon", board: "careers_alcon"),
        WorkdaySource(name: "Novartis", host: "novartis.wd3.myworkdayjobs.com", tenant: "novartis", board: "Novartis_Careers"),
        WorkdaySource(name: "Johnson & Johnson", host: "jj.wd5.myworkdayjobs.com", tenant: "jj", board: "JJ"),
        WorkdaySource(name: "GSK", host: "gsk.wd5.myworkdayjobs.com", tenant: "gsk", board: "GSKCareers"),
        WorkdaySource(name: "BD", host: "bdx.wd1.myworkdayjobs.com", tenant: "bdx", board: "EXTERNAL_CAREER_SITE_SAUDI_ARABIA"),
        WorkdaySource(name: "Roche", host: "roche.wd3.myworkdayjobs.com", tenant: "roche", board: "roche-ext")
    ]

    static func detailURL(_ path: String, source: WorkdaySource) -> URL? {
        guard path.hasPrefix("/job/"), let decoded = path.removingPercentEncoding,
              !decoded.contains("?"), !decoded.contains("#"), !decoded.contains("\\"),
              !decoded.contains("%"), !decoded.unicodeScalars.contains(where: { $0.value < 32 || $0.value == 127 }), !decoded.split(separator: "/").contains(where: { $0 == ".." || $0 == "." }) else { return nil }
        return URL(string: source.baseURL.absoluteString + path)
    }

    static func relevant(_ title: String) -> Bool { relevance(title) > 0 }

    static func relevance(_ title: String) -> Int {
        let excluded = "\\bintern(ship)?\\b|trainee|graduate|early[ -]in[ -]career|early[ -]career|sales|account[ -]+manager|clinical|chemist|scientist|engineer|financial[ -]+analyst|qa[ /-]*ra"
        guard title.range(of: excluded, options: [.regularExpression, .caseInsensitive]) == nil else { return 0 }
        if title.range(of: "supply[ -]?chain|procurement|purchas|tender|logistic|warehous|demand[ -]?plan|supply[ -]?plan|inventory|supplier", options: [.regularExpression, .caseInsensitive]) != nil {
            return title.range(of: "manager|director|head|lead", options: [.regularExpression, .caseInsensitive]) != nil ? 90 : 65
        }
        if title.range(of: "performance|operational[ -]+excellence|continuous[ -]+improvement|transformation|operations?[ -]+manager", options: [.regularExpression, .caseInsensitive]) != nil { return 80 }
        return title.range(of: "business[ -]value[ -]partner", options: [.regularExpression, .caseInsensitive]) != nil ? 65 : 0
    }

    static func qiddiyaJob(_ listing: [String: Any], now: Date = Date()) -> [String: Any]? {
        guard listing["state"] as? String == "published", listing["isInternal"] as? Bool == false,
              let code = listing["shortcode"] as? String, !code.isEmpty,
              code.range(of: "^[A-Za-z0-9]+$", options: .regularExpression) != nil,
              let title = listing["title"] as? String,
              relevant(title),
              let location = listing["location"] as? [String: Any], location["countryCode"] as? String == "SA",
              let published = listing["published"] as? String,
              let date = isoDate(published), date <= now else { return nil }
        let city = location["city"] as? String ?? "Saudi Arabia"
        return [
            "id": "qiddiya-\(code)", "title": title, "company": "Qiddiya", "location": city == "Saudi Arabia" ? city : city + ", Saudi Arabia",
            "url": "https://apply.workable.com/qiddiya-investment-company-1/j/\(code)/",
            "posted": published, "closes": NSNull(), "status": "live", "salary": NSNull(),
            "kind": "live", "fit": "Needs review",
            "summary": "New employer listing. Review full requirements before applying."
        ]
    }

    static func saudiDay(_ date: Date) -> String {
        let format = dayFormatter()
        return format.string(from: date)
    }

    private static func dayFormatter() -> DateFormatter {
        let format = DateFormatter()
        format.locale = Locale(identifier: "en_US_POSIX")
        format.calendar = Calendar(identifier: .gregorian)
        format.timeZone = TimeZone(identifier: "Asia/Riyadh")
        format.dateFormat = "yyyy-MM-dd"
        format.isLenient = false
        return format
    }

    static func parsedDate(_ value: String) -> Date? {
        if value.count != 10 { return isoDate(value) }
        let format = dayFormatter()
        guard let date = format.date(from: value), format.string(from: date) == value else { return nil }
        return date
    }

    static func isoDate(_ value: String) -> Date? {
        let grammar = "^[0-9]{4}-[0-9]{2}-[0-9]{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\\.[0-9]+)?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])\\z"
        guard value.count <= 80, value.range(of: grammar, options: .regularExpression) != nil,
              parsedDate(String(value.prefix(10))) != nil else { return nil }
        let format = ISO8601DateFormatter()
        format.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return format.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    static func dateIsEligible(_ value: String, now: Date, closing: Bool) -> Bool {
        if value.isEmpty { return true }
        guard let parsed = parsedDate(value) else { return false }
        if value.count == 10 { return closing ? value >= saudiDay(now) : value <= saudiDay(now) }
        return closing ? parsed >= now : parsed <= now
    }

    private static func strictBool(_ value: Any?) -> Bool? {
        guard let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() else { return nil }
        return number.boolValue
    }

    private static func validOptionalDate(_ value: Any?) -> Bool {
        guard let value, !(value is NSNull) else { return true }
        guard let text = value as? String else { return false }
        return text.isEmpty || parsedDate(text) != nil
    }

    private static func validDetail(_ detail: [String: Any]) -> Bool {
        guard let title = detail["title"] as? String, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let id = detail["jobReqId"] as? String, !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              strictBool(detail["canApply"]) != nil,
              validOptionalDate(detail["startDate"]), validOptionalDate(detail["endDate"]) else { return false }
        if let posted = detail["posted"], !(posted is NSNull), strictBool(posted) == nil { return false }
        if let location = detail["location"], !(location is NSNull), !(location is String) { return false }
        if let country = detail["country"], !(country is NSNull) {
            guard let fields = country as? [String: Any] else { return false }
            if let descriptor = fields["descriptor"], !(descriptor is NSNull), !(descriptor is String) { return false }
        }
        return true
    }

    static func job(_ detail: [String: Any], externalPath: String, source: WorkdaySource, now: Date = Date()) -> [String: Any]? {
        guard validDetail(detail), detailURL(externalPath, source: source) != nil,
              strictBool(detail["canApply"]) == true,
              detail["posted"] as? Bool != false,
              let title = detail["title"] as? String, relevant(title),
              let identifier = detail["jobReqId"] as? String, !identifier.isEmpty else { return nil }
        let location = detail["location"] as? String ?? ""
        let country = ((detail["country"] as? [String: Any])?["descriptor"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let saudiCountry = ["saudi arabia", "kingdom of saudi arabia", "sa", "sau", "السعودية", "المملكة العربية السعودية"].contains(country.lowercased())
        // Country is authoritative; a title slug mentioning Saudi is not geography.
        if !country.isEmpty {
            guard saudiCountry else { return nil }
        } else {
            guard location.range(of: "Saudi|Riyadh|Jeddah|Dammam|Khobar|\\bSAU\\b|الرياض|جدة|السعودية", options: [.regularExpression, .caseInsensitive]) != nil else { return nil }
        }
        let deadline = detail["endDate"] as? String
        if let deadline, !dateIsEligible(deadline, now: now, closing: true) { return nil }
        let startDate = detail["startDate"] as? String ?? ""
        guard dateIsEligible(startDate, now: now, closing: false) else { return nil }
        var displayLocation = location.isEmpty ? country : location
        if saudiCountry,
           displayLocation.range(of: "Saudi|Riyadh|Jeddah|Dammam|Khobar|\\bSAU\\b|الرياض|جدة|السعودية", options: [.regularExpression, .caseInsensitive]) == nil {
            displayLocation += ", Saudi Arabia"
        }
        let fallback = "https://\(source.host)/en-US/\(source.board)\(externalPath)"
        let candidate = (detail["externalUrl"] as? String).flatMap(URL.init(string:))
        let url = candidate?.scheme == "https" && candidate?.host == source.host ? candidate!.absoluteString : fallback
        return [
            "id": "\(source.tenant)-\(identifier)", "title": title, "company": source.name,
            "location": displayLocation, "url": url,
            "posted": startDate, "closes": deadline.flatMap { $0.isEmpty ? nil : $0 } as Any? ?? NSNull(),
            "status": "live", "salary": NSNull(), "kind": "live", "fit": "Needs review",
            "healthcare": true, "leadership": title.range(of: "\\b(manager|director|head|lead)\\b", options: [.regularExpression, .caseInsensitive]) != nil, "relevance": relevance(title),
            "summary": "New employer listing. Review full requirements before applying."
        ]
    }

    static func refresh() async -> [String: Any] {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 20
        configuration.timeoutIntervalForResource = 45
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.httpShouldSetCookies = false
        let session = URLSession(configuration: configuration, delegate: NoRedirects(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let results = await withTaskGroup(of: SourceResult.self, returning: [SourceResult].self) { group in
            for source in sources {
                group.addTask {
                    await boundedSource(name: source.name) { await fetch(source, session: session) }
                }
            }
            var results: [SourceResult] = []
            for await result in group { results.append(result) }
            return results.sorted { $0.name < $1.name }
        }
        return [
            "checkedAt": ISO8601DateFormatter().string(from: Date()),
            "jobs": results.flatMap(\.jobs), "sources": results.map(\.status)
        ]
    }

    struct SourceResult {
        let name: String
        let jobs: [[String: Any]]
        let status: [String: Any]
    }

    private enum SourceEvent {
        case finished(SourceResult), deadline, cancelled
    }

    static func boundedSource(name: String, budgetNanoseconds: UInt64 = sourceBudgetNanoseconds,
                              operation: @escaping @Sendable () async -> SourceResult) async -> SourceResult {
        await withTaskGroup(of: SourceEvent.self) { group in
            group.addTask { .finished(await operation()) }
            group.addTask {
                do { try await Task.sleep(nanoseconds: budgetNanoseconds); return .deadline }
                catch { return .cancelled }
            }
            var completed: SourceResult?
            var timedOut = false
            while completed == nil, let event = await group.next() {
                switch event {
                case .finished(let result): completed = result; group.cancelAll()
                case .deadline: timedOut = true; group.cancelAll()
                case .cancelled: break
                }
            }
            guard let result = completed else {
                return SourceResult(name: name, jobs: [], status: ["name": name, "ok": false, "count": 0, "error": "Employer search was cancelled."])
            }
            guard timedOut else { return result }
            var status = result.status
            status["timedOut"] = true
            status["incomplete"] = true
            status["limited"] = true
            status["error"] = "Employer search reached its time limit; results may be incomplete."
            return SourceResult(name: result.name, jobs: result.jobs, status: status)
        }
    }

    static func fetchQiddiya(session: URLSession) async -> SourceResult {
        let endpoint = URL(string: "https://apply.workable.com/api/v3/accounts/qiddiya-investment-company-1/jobs")!
        var jobs: [String: [String: Any]] = [:]
        var scanned = 0
        var limited = false
        var failures = 0
        var successfulQueries = 0
        for query in ["healthcare", "procurement", "performance"] {
            var token: String?
            var receivedPage = false
            do {
                for _ in 0..<2 {
                    guard !Task.isCancelled else { throw CancellationError() }
                    var request = URLRequest(url: endpoint)
                    request.httpMethod = "POST"
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.setValue("application/json", forHTTPHeaderField: "Accept")
                    var body: [String: Any] = ["query": query, "location": [], "department": [], "worktype": [], "remote": []]
                    if let token { body["token"] = token }
                    request.httpBody = try JSONSerialization.data(withJSONObject: body)
                    let page = try await json(request, session: session)
                    guard let rows = page["results"] as? [[String: Any]] else { throw FeedError.invalidResponse }
                    receivedPage = true
                    scanned += rows.count
                    for row in rows {
                        if let match = qiddiyaJob(row), let id = match["id"] as? String { jobs[id] = match }
                    }
                    token = (page["nextPage"] as? String).flatMap { $0.isEmpty ? nil : $0 }
                    if token == nil { break }
                }
                limited = limited || token != nil
            } catch { failures += 1 }
            if receivedPage { successfulQueries += 1 }
        }
        var status: [String: Any] = ["name": "Qiddiya", "ok": successfulQueries > 0, "count": jobs.count, "scanned": scanned, "limited": limited, "queryErrors": failures, "incomplete": limited || failures > 0]
        if failures > 0 { status["error"] = "\(failures) Qiddiya searches failed; results may be incomplete." }
        return SourceResult(name: "Qiddiya", jobs: jobs.keys.sorted().compactMap { jobs[$0] }, status: status)
    }

    static func fetch(_ source: WorkdaySource, session: URLSession) async -> SourceResult {
        do {
            var request = URLRequest(url: source.baseURL.appendingPathComponent("jobs"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            let facets: [String: [String]] = source.tenant == "novartis" ? ["locationCountry": ["50423b5190ad49bb89e94cd58dfaad69"]] : [:]
            request.httpBody = try JSONSerialization.data(withJSONObject: ["appliedFacets": facets, "limit": 20, "offset": 0, "searchText": source.tenant == "novartis" ? "" : "Saudi"])
            let listing = try await json(request, session: session)
            guard let postings = listing["jobPostings"] as? [Any], let total = listing["total"] as? Int, total >= postings.count, (total == 0 || !postings.isEmpty), strictBool(listing["total"]) == nil else { throw FeedError.invalidResponse }
            let sampled = postings.prefix(20)
            let valid = sampled.compactMap { row -> [String:Any]? in
                guard let posting=row as? [String:Any],let title=posting["title"] as? String,!title.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,
                      let path=posting["externalPath"] as? String,detailURL(path,source:source) != nil else {return nil}
                return posting
            }
            let candidates = valid.filter { relevant($0["title"] as! String) }
            var jobs: [[String: Any]] = []
            var failures = sampled.count-valid.count
            var successfulDetails = 0
            var excludedIds = [String]()
            for (index, posting) in candidates.enumerated() {
                guard !Task.isCancelled else { failures += candidates.count - index; break }
                guard let path = posting["externalPath"] as? String,
                      let url = detailURL(path, source: source) else { failures += 1; continue }
                do {
                    let response = try await json(URLRequest(url: url), session: session)
                    guard let detail = response["jobPostingInfo"] as? [String: Any], validDetail(detail) else { throw FeedError.invalidResponse }
                    let id=source.tenant+"-"+(detail["jobReqId"] as! String)
                    guard id.count<=256 else {throw FeedError.invalidResponse}
                    successfulDetails += 1
                    if let match = job(detail, externalPath: path, source: source) { jobs.append(match) } else {excludedIds.append(id)}
                } catch {
                    failures += 1
                    if Task.isCancelled { failures += candidates.count - index - 1; break }
                }
            }
            var status: [String: Any] = ["name": source.name, "ok": successfulDetails > 0 || candidates.isEmpty && (!valid.isEmpty || sampled.isEmpty), "count": jobs.count, "scanned": min(postings.count, 20), "total": total, "limited": total > 20 || postings.count > 20, "detailErrors": failures, "excludedIds": excludedIds, "incomplete": total > 20 || postings.count > 20 || failures > 0]
            if failures > 0 { status["error"] = "\(failures) listing checks failed; results may be incomplete." }
            return SourceResult(name: source.name, jobs: jobs, status: status)
        } catch {
            return SourceResult(name: source.name, jobs: [], status: ["name": source.name, "ok": false, "count": 0, "scanned": 0, "limited": false, "error": error.localizedDescription])
        }
    }

    private static func json(_ request: URLRequest, session: URLSession) async throws -> [String: Any] {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw FeedError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw FeedError.http(http.statusCode) }
        guard data.count <= 8_000_000, let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw FeedError.invalidResponse }
        return value
    }

    private enum FeedError: LocalizedError {
        case invalidResponse, http(Int)
        var errorDescription: String? {
            switch self {
            case .invalidResponse: return "The employer returned an unreadable response."
            case .http(let status): return "Employer request failed (HTTP \(status))."
            }
        }
    }

    private final class NoRedirects: NSObject, URLSessionTaskDelegate {
        func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
            completionHandler(nil)
        }
    }
}
