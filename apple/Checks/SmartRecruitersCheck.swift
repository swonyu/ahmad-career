import Foundation

// Every URL is intercepted; these checks never contact an employer or open user storage.
final class SmartFixtureProtocol: URLProtocol {
    static var responses = [String: Data]()
    static var requested = [String]()
    static var inFlight = 0
    static var maximumInFlight = 0
    static let stateLock = NSLock()
    private var cancelled = false
    private var finished = false
    private let lock = NSLock()
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let url = request.url!
        Self.stateLock.lock()
        Self.requested.append(url.absoluteString)
        let data = Self.responses[url.absoluteString]
        Self.inFlight += 1; Self.maximumInFlight = max(Self.maximumInFlight, Self.inFlight)
        Self.stateLock.unlock()
        DispatchQueue.global().asyncAfter(deadline: .now() + 0.015) { [self] in
            lock.lock(); let stopped = cancelled; lock.unlock()
            if stopped { return }
            let response = HTTPURLResponse(url: url, statusCode: data == nil ? 403 : 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            if let data { client?.urlProtocol(self, didLoad: data) }
            complete()
            client?.urlProtocolDidFinishLoading(self)
        }
    }
    private func complete() {
        lock.lock(); let wasFinished = finished; finished = true; lock.unlock()
        if !wasFinished { Self.stateLock.lock(); Self.inFlight -= 1; Self.stateLock.unlock() }
    }
    override func stopLoading() { lock.lock(); cancelled = true; lock.unlock(); complete() }
}

@main struct SmartRecruitersCheck {
    static func expect(_ condition: Bool, _ message: String, file: StaticString = #file, line: UInt = #line) { precondition(condition, message, file: file, line: line) }
    @MainActor static func main() async throws {
        let fixture = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))) as! [String: Any]
        let boards = fixture["boards"] as! [String: [String: Any]]
        let source = CareerFeed.smartSources[0]
        let board = boards[source.board]!, list = board["list"] as! [String: Any], details = board["details"] as! [String: Any]
        let original = (list["content"] as! [[String: Any]])[0], id = original["id"] as! String, detail = details[id] as! [String: Any]
        let now = CareerFeed.isoDate("2026-11-09T16:00:00Z")!
        expect(CareerFeed.publicSources.count == 7 && CareerFeed.smartSources.count == 2 && CareerFeed.activeSourceNames.count == 9, "Existing source order is unchanged; two isolated additions")
        expect(source.url.absoluteString == "https://api.smartrecruiters.com/v1/companies/Devoteam/postings?country=sa&limit=100&offset=0", "Known endpoint only")
        func parse(_ rows: [Any], _ values: [String: Any] = details, total: Int? = nil) throws -> CareerFeed.SourceResult {
            try CareerFeed.parseSmartRecruiters(["content": rows, "offset": 0, "limit": 100, "totalFound": total ?? rows.count], source: source, details: values, now: now)
        }
        for item in CareerFeed.smartSources {
            let fixture = boards[item.board]!
            let result = try CareerFeed.parseSmartRecruiters(fixture["list"] as! [String: Any], source: item, details: fixture["details"] as! [String: Any], now: now)
            expect(result.jobs.count == 1 && result.status["ok"] as? Bool == true, "Synthetic fixture accepted")
            let job = result.jobs[0]
            expect(job["company"] as? String == item.name && job["location"] as? String == "Riyadh, Saudi Arabia", "Board name and country provenance preserved")
            expect(job["postedKind"] as? String == "last-published" && job["mode"] as? String == "On-site", "Publication/arrangement semantics")
            expect(job["employmentType"] as? String == (item.board == "Devoteam" ? "Internship" : "Full time"), "Employer employment label normalized")
            expect(job["applyUrl"] == nil && job["referralUrl"] == nil, "No application or referral endpoint stored")
            expect((job["requirementNotes"] as! [String]).contains("Eligible for Tamheer."), "Program qualification evidence is retained")
            expect((job["requirementNotes"] as! [String]).contains("Python experience required."), "Technology excerpts supplement primary qualifications")
        }
        let canonical = detail["postingUrl"] as! String
        for value in [canonical, canonical + "/", canonical.replacingOccurrences(of: "https://jobs.", with: "HTTPS://JOBS."), canonical.replacingOccurrences(of: ".com/", with: ".com:443/")] {
            expect(CareerFeed.smartPostingURL(value, source: source, id: id) != nil, "Canonical job URL accepted: \(value)")
            expect(CareerJob.safeURL(value) != nil, "Stored canonical job URL accepted")
        }
        for value in [canonical + "?oga=true", canonical + "#fragment", canonical.replacingOccurrences(of: "Devoteam", with: "devoteam"), canonical.replacingOccurrences(of: id + "-", with: "9999-"), canonical.replacingOccurrences(of: "https:", with: "http:"), canonical.replacingOccurrences(of: ".com/", with: ".com:444/"), canonical.replacingOccurrences(of: "jobs.", with: "user:password@jobs."), canonical.replacingOccurrences(of: "synthetic", with: "%73ynthetic"), canonical.replacingOccurrences(of: "smartrecruiters.com", with: "evil.example"), canonical + "/../other"] {
            expect(CareerFeed.smartPostingURL(value, source: source, id: id) == nil, "Unsafe/mismatched URL rejected: \(value)")
        }
        expect(CareerJob.safeURL("https://jobs.smartrecruiters.com/Other/1000-role") == nil, "Unknown board is not globally allowed")
        for value in ["1/evil", "1?x", "", String(repeating: "1", count: 21)] { expect(CareerFeed.smartDetailURL(value, source: source) == nil, "No URL construction from unsafe identifiers") }
        var mutated = original; mutated["ref"] = "https://evil.example/never-follow"
        expect(try parse([mutated]).jobs.count == 1, "Ref is ignored; detail URLs use validated IDs")

        let malformedLists: [[String: Any]] = [[:], ["content": [], "offset": 0, "limit": 100, "totalFound": 1], ["content": [], "offset": true, "limit": 100, "totalFound": 0], ["content": [], "offset": 1, "limit": 100, "totalFound": 0], ["content": [], "offset": 0, "limit": 101, "totalFound": 0], ["content": [], "offset": 0, "limit": 100, "totalFound": true], ["content": [original], "offset": 0, "limit": 100, "totalFound": 0]]
        for value in malformedLists { expect((try? CareerFeed.parseSmartRecruiters(value, source: source, details: details, now: now)) == nil, "Malformed list rejected without establishing absence") }
        expect(try parse([]).status["ok"] as? Bool == true, "Genuine empty feed is healthy")
        let badRows: [[String: Any]] = [["id": 1000], ["name": 42], ["company": ["identifier": "Other"]], ["location": ["city": "Riyadh", "country": ""]], ["location": ["country": "sa", "city": String(repeating: "x", count: 2001)]], ["releasedDate": "2026-02-30"], ["visibility": 42]]
        for changes in badRows {
            let invalid = original.merging(changes) { _, new in new }
            let result = try parse([invalid])
            expect(result.status["ok"] as? Bool == false && result.status["detailErrors"] as? Int == 1 && (result.status["excludedIds"] as! [String]).isEmpty, "Malformed row cannot exclude cached role")
        }
        for changes: [String: Any] in [["visibility": "PRIVATE"], ["name": "Senior Software Engineer"], ["location": ["country": "ae", "city": "Riyadh"]], ["releasedDate": "2099-01-01T00:00:00Z"]] {
            let excluded = original.merging(changes) { _, new in new }
            let result = try parse([excluded, [:]])
            expect(result.jobs.isEmpty && result.status["ok"] as? Bool == true && result.status["excludedIds"] as? [String] == ["devoteam-" + id], "Validated exclusion survives unrelated malformed rows")
            let duplicate = try parse([excluded, original])
            expect(duplicate.jobs.count == 1 && (duplicate.status["excludedIds"] as! [String]).isEmpty, "Included duplicate wins")
        }
        for changes: [String: Any] in [["active": false], ["name": "Senior Software Engineer"], ["location": ["country": "ae", "city": "Riyadh"]]] {
            let changed = detail.merging(changes) { _, new in new }
            expect(try parse([original], [id: changed]).status["excludedIds"] as? [String] == ["devoteam-" + id], "Current detail can explicitly exclude a previously eligible list entry")
        }
        for changes: [String: Any] in [["id": "999"], ["active": 1], ["location": ["country": "sa", "remote": 1]], ["postingUrl": canonical + "?bad=1"], ["experienceLevel": ["label": 1]], ["jobAd": ["sections": ["qualifications": ["text": 1]]]], ["jobAd": ["sections": ["qualifications": ["text": String(repeating: "x", count: 60001)], "jobDescription": ["text": String(repeating: "x", count: 60000)]]]]] {
            let changed = detail.merging(changes) { _, new in new }
            let result = try parse([original], [id: changed])
            expect(result.jobs.isEmpty && result.status["ok"] as? Bool == false && result.status["detailErrors"] as? Int == 1 && (result.status["excludedIds"] as! [String]).isEmpty, "Bad detail must retain prior evidence, not establish absence")
        }
        let unavailable = try parse([original], [:])
        expect(unavailable.status["ok"] as? Bool == false && unavailable.status["detailErrors"] as? Int == 1, "Detail outage is not healthy zero")
        var sparse = detail; sparse["jobAd"] = NSNull(); sparse["typeOfEmployment"] = NSNull(); sparse["experienceLevel"] = NSNull(); sparse["location"] = ["country": "sa"]
        let sparseJob = CareerFeed.smartDetailJob(sparse, id: id, source: source, now: now)!
        expect(sparseJob["mode"] as? String == "Not stated" && sparseJob["employmentType"] as? String == "Not stated" && (sparseJob["requirementNotes"] as! [String]).isEmpty, "Missing metadata is explicitly unknown")
        var context = detail; context["jobAd"] = ["sections": ["companyDescription": ["text": "Our company requires 50 years of experience."], "qualifications": ["text": "<p>GPA requirements apply.</p><p>Saudi National</p><p>Eligible for Tamheer.</p>"], "jobDescription": ["text": "<p>Strong SQL skills required.</p><p>Python programming knowledge.</p>"]]]
        let notes = CareerFeed.smartDetailJob(context, id: id, source: source, now: now)!["requirementNotes"] as! [String]
        expect(notes.count == 5 && !notes.joined().contains("50 years") && notes.contains("Saudi National"), "Primary program evidence and two technology lines retained; company history excluded")
        expect(notes.prefix(3) == ["GPA requirements apply.", "Saudi National", "Eligible for Tamheer."], "Qualification evidence precedes technology excerpts")
        for (location, expected): ([String: Any], String) in [(["country": "sa", "remote": true, "hybrid": true], "Remote / Hybrid"), (["country": "sa", "hybrid": true], "Hybrid"), (["country": "sa", "remote": false], "Not stated")] {
            var row = detail; row["location"] = location
            expect(CareerFeed.smartDetailJob(row, id: id, source: source, now: now)?["mode"] as? String == expected, "Work arrangement uses explicit booleans")
        }

        var many = [[String: Any]](), manyDetails = [String: Any]()
        for n in 0..<101 {
            let key = String(2000 + n)
            var row = original; row["id"] = key; row["ref"] = "https://evil.example/ignored"; many.append(row)
            var value = detail; value["id"] = key; value["postingUrl"] = "https://jobs.smartrecruiters.com/Devoteam/\(key)-synthetic"
            manyDetails[key] = value
        }
        let limited = try parse(many, manyDetails)
        expect(limited.jobs.count == 20 && limited.status["scanned"] as? Int == 100 && limited.status["limited"] as? Bool == true, "100-row and 20-detail bounds are explicit")
        expect(try parse([original], details, total: 2).status["limited"] as? Bool == true, "Unseen pagination is incomplete")
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [SmartFixtureProtocol.self]
        SmartFixtureProtocol.responses = [source.url.absoluteString: try JSONSerialization.data(withJSONObject: ["content": many, "offset": 0, "limit": 100, "totalFound": many.count])]
        for (id, value) in manyDetails { SmartFixtureProtocol.responses[CareerFeed.smartDetailURL(id, source: source)!.absoluteString] = try JSONSerialization.data(withJSONObject: value) }
        let session = URLSession(configuration: config)
        let fetched = await CareerFeed.fetchSmartRecruiters(source, session: session)
        let beforeUnknown = SmartFixtureProtocol.requested.count
        let unknown = await CareerFeed.fetchSmartRecruiters(CareerFeed.PublicSource(name: "Unknown", kind: "smartrecruiters", board: "Other"), session: session)
        expect(unknown.status["ok"] as? Bool == false && SmartFixtureProtocol.requested.count == beforeUnknown, "Unknown source cannot trigger a network request")
        session.invalidateAndCancel()
        expect(fetched.jobs.count == 20 && SmartFixtureProtocol.requested.count == 21, "Mocked transport requests only bounded list/detail routes")
        expect(SmartFixtureProtocol.maximumInFlight <= 4, "No more than four detail requests in flight")
        expect(SmartFixtureProtocol.requested.allSatisfy { $0.hasPrefix("https://api.smartrecruiters.com/v1/companies/Devoteam/postings") }, "Never follows employer-supplied ref/apply/referral links")

        let root = FileManager.default.temporaryDirectory.appendingPathComponent("career-smart-check-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = NativeCareerStore(researchURL: URL(fileURLWithPath: CommandLine.arguments[2]), storageURL: root.appendingPathComponent("workspace.json"))
        let initial = try parse([original])
        store.acceptLive(["checkedAt": "2026-11-09T10:00:00Z", "jobs": initial.jobs, "sources": [initial.status]], now: now)
        expect(store.liveJobs.count == 1, "Smart listing passes native store validation")
        let saved = store.liveJobs[0]; store.toggleSaved(saved); store.setStatus("Preparing", for: saved)
        store.acceptLive(["checkedAt": "2026-11-09T11:00:00Z", "jobs": unavailable.jobs, "sources": [unavailable.status]], now: now)
        expect(store.liveJobs.count == 1 && store.liveJobs[0].lastCheckedAt == "2026-11-09T10:00:00Z", "Detail failure retains dated cached evidence")
        var inactive = detail; inactive["active"] = false
        let closed = try parse([original], [id: inactive])
        store.acceptLive(["checkedAt": "2026-11-09T12:00:00Z", "jobs": closed.jobs, "sources": [closed.status]], now: now)
        expect(store.liveJobs.isEmpty && store.isSaved(saved) && store.status(for: saved) == "Preparing", "Exact exclusion removes discovery only; saved history remains")
        // A verified exclusion is still useful evidence when every other detail/source fails.
        let mixedStore = NativeCareerStore(researchURL: URL(fileURLWithPath: CommandLine.arguments[2]), storageURL: root.appendingPathComponent("mixed.json"))
        var otherRow = original; otherRow["id"] = "2000"
        let both = try parse([original, otherRow], [id: detail, "2000": manyDetails["2000"]!])
        mixedStore.acceptLive(["checkedAt": "2026-11-09T10:00:00Z", "jobs": both.jobs, "sources": [both.status]], now: now)
        expect(mixedStore.liveJobs.count == 2, "Mixed-exclusion regression starts with both dated roles")
        let old = mixedStore.liveJobs.first { $0.id == "devoteam-" + id }!
        mixedStore.toggleSaved(old); mixedStore.setStatus("Preparing", for: old)
        var privateRow = original; privateRow["visibility"] = "PRIVATE"
        let partial = try parse([privateRow, otherRow, [:]], [:])
        expect(partial.status["ok"] as? Bool == true && partial.status["detailErrors"] as? Int == 2, "Known exclusions count as evidence while errors preserve incompleteness")
        let failures: [[String: Any]] = CareerFeed.activeSourceNames.filter { $0 != source.name }.map { ["name": $0, "ok": false, "count": 0, "error": "Synthetic unavailable source"] }
        mixedStore.acceptLive(["checkedAt": "2026-11-09T11:00:00Z", "jobs": partial.jobs, "sources": [partial.status] + failures], now: now)
        expect(mixedStore.liveJobs.map(\.id) == ["devoteam-2000"] && mixedStore.liveJobs[0].lastCheckedAt == "2026-11-09T10:00:00Z", "All-other-sources outage removes explicit exclusion but retains unknown detail with original date")
        expect(mixedStore.isSaved(old) && mixedStore.status(for: old) == "Preparing", "Known exclusion never deletes saved tracking history")
        if CommandLine.arguments.count > 3 {
            let captures = URL(fileURLWithPath: CommandLine.arguments[3])
            for item in CareerFeed.smartSources {
                let listing = try JSONSerialization.jsonObject(with: Data(contentsOf: captures.appendingPathComponent(item.board.lowercased() + ".json"))) as! [String: Any]
                var snapshots = [String: Any]()
                for file in try FileManager.default.contentsOfDirectory(atPath: captures.path) where file.hasPrefix(item.board.lowercased() + "-") && file.hasSuffix(".json") && !file.hasSuffix("-meta.json") {
                    if let data = try? Data(contentsOf: captures.appendingPathComponent(file)), let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let id = object["id"] as? String { snapshots[id] = object }
                }
                let result = try CareerFeed.parseSmartRecruiters(listing, source: item, details: snapshots, now: now)
                print("Saved-capture replay: \(item.name), \(result.jobs.count) included, \(result.status["detailErrors"] ?? "?") unavailable details, no network.")
            }
        }
        print("SmartRecruiters checks passed: strict identity/country/URL/metadata, bounded pagination/detail/concurrency, qualified program and skill excerpts, mocked transport, safe failure retention and preserved synthetic history.")
    }
}
