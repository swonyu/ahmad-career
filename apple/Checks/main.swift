import Foundation

let webRoot = URL(fileURLWithPath: "/Applications/Ahmad Career.app/Contents/Resources/Web", isDirectory: true)
func route(_ value: String, tapped: Bool = true) -> CareerNavigation {
    CareerPolicy.navigation(URL(string: value)!, webRoot: webRoot, userInitiated: tapped)
}

precondition(CareerPolicy.acceptsRefresh(["action": "refresh"]), "The dedicated refresh action must be accepted")
precondition(!CareerPolicy.acceptsRefresh(["action": "refresh", "url": "https://attacker.example"]), "Extra bridge arguments must be rejected")
precondition(!CareerPolicy.acceptsRefresh(["action": "open"]), "Unknown actions must be rejected")
precondition(!CareerPolicy.acceptsRefresh("refresh"), "Unstructured messages must be rejected")
precondition(route("file:///Applications/Ahmad%20Career.app/Contents/Resources/Web/index.html") == .bundled)
precondition(route("file:///Applications/Ahmad%20Career.app/Contents/Resources/Web/sub/page.html") == .bundled)
precondition(route("file:///Applications/Ahmad%20Career.app/Contents/Resources/Web/../secret.txt") == .blocked)
precondition(route("file:///Applications/Ahmad%20Career.app/Contents/Resources/Web-other/index.html") == .blocked)
precondition(route("file://remote.example/Applications/Ahmad%20Career.app/Contents/Resources/Web/index.html") == .blocked)
precondition(route("https://careers.example.com/job/1") == .external)
precondition(route("http://careers.example.com/job/1") == .external)
precondition(route("mailto:hello@example.com") == .external)
precondition(route("mailto:hello@example.com", tapped: false) == .blocked)
precondition(route("javascript:alert(1)") == .blocked)
precondition(route("data:text/html,hello") == .blocked)
precondition(route("custom-app://open") == .blocked)
print("PASS: strict refresh bridge and bundled/external navigation boundaries")

let source = WorkdaySource(name: "Employer", host: "example.myworkdayjobs.com", tenant: "example", board: "careers")
let path = "/job/Saudi-Arabia/Procurement-Lead_R123"
let now = ISO8601DateFormatter().date(from: "2026-10-08T10:00:00Z")!
var detail: [String: Any] = [
    "title": "Procurement Lead", "location": "Riyadh, Saudi Arabia",
    "country": ["descriptor": "Saudi Arabia"], "canApply": true,
    "jobReqId": "R123", "startDate": "2026-10-01", "endDate": "2026-10-09",
    "externalUrl": "https://example.myworkdayjobs.com/en-US/careers/job/Saudi-Arabia/Procurement-Lead_R123"
]
precondition(CareerFeed.detailURL(path, source: source)?.absoluteString == "https://example.myworkdayjobs.com/wday/cxs/example/careers/job/Saudi-Arabia/Procurement-Lead_R123")
precondition(CareerFeed.detailURL("https://attacker.example", source: source) == nil)
precondition(CareerFeed.detailURL("/job/../secrets", source: source) == nil)
precondition(CareerFeed.detailURL("/job/%2e%2e/secrets", source: source) == nil)
precondition(CareerFeed.detailURL("/job/a?redirect=https://attacker.example", source: source) == nil)
let accepted = CareerFeed.job(detail, externalPath: path, source: source, now: now)
precondition(accepted?["id"] as? String == "example-R123", "Native and web IDs must use the same tenant prefix")
precondition(accepted?["salary"] is NSNull, "Unpublished salary must stay unknown")
detail["canApply"] = false
precondition(CareerFeed.job(detail, externalPath: path, source: source, now: now) == nil)
detail["canApply"] = true
detail["endDate"] = "2026-10-07"
precondition(CareerFeed.job(detail, externalPath: path, source: source, now: now) == nil)
detail["endDate"] = "2026-10-08"
precondition(CareerFeed.job(detail, externalPath: path, source: source, now: now) != nil, "A date-only deadline remains open through that Saudi calendar day")
detail["endDate"] = "unparseable"
precondition(CareerFeed.job(detail, externalPath: path, source: source, now: now) == nil)
detail.removeValue(forKey: "endDate")
detail["location"] = "Remote"
detail["country"] = ["descriptor": "Unknown"]
precondition(CareerFeed.job(detail, externalPath: "/job/Remote/Procurement-Lead_R123", source: source, now: now) == nil)
detail["country"] = ["descriptor": "Saudi Arabia"]
detail["title"] = "Clinical Scientist"
precondition(CareerFeed.job(detail, externalPath: path, source: source, now: now) == nil)
print("PASS: fixed employer URLs, live-job eligibility, expiry, and unknown-salary handling")

var qiddiya: [String: Any] = ["shortcode": "ABC123", "title": "Healthcare Performance Manager", "location": ["city": "Riyadh", "country": "Saudi Arabia", "countryCode": "SA"], "state": "published", "isInternal": false, "published": "2026-10-01T09:00:00Z"]
precondition(CareerFeed.qiddiyaJob(qiddiya, now: now)?["id"] as? String == "qiddiya-ABC123")
qiddiya["published"] = "2027-01-01T09:00:00Z"
precondition(CareerFeed.qiddiyaJob(qiddiya, now: now) == nil)
qiddiya["published"] = "2026-10-01T09:00:00Z"
qiddiya["isInternal"] = true
precondition(CareerFeed.qiddiyaJob(qiddiya, now: now) == nil)
qiddiya["isInternal"] = false
qiddiya["location"] = ["city": "London", "countryCode": "GB"]
precondition(CareerFeed.qiddiyaJob(qiddiya, now: now) == nil)
qiddiya["location"] = ["city": "Riyadh", "countryCode": "SA"]
qiddiya["shortcode"] = "../other"
precondition(CareerFeed.qiddiyaJob(qiddiya, now: now) == nil)
print("PASS: Qiddiya public Saudi listing boundaries and future-date exclusion")

for title in ["Supplier Manager", "Purchasing Lead", "Demand Planner", "Supply Planning Manager", "Inventory Manager", "Continuous Improvement Lead", "Transformation Director", "Operations Manager"] {
    precondition(CareerFeed.relevant(title), "Relevant title must be included: \(title)")
}
for title in ["Supply Chain Intern", "Procurement Internship", "Procurement Trainee", "Supply Chain Graduate", "Sales Operations Manager", "Account Manager, Procurement", "Clinical Supply Chain Manager", "Procurement Chemist", "Supply Chain Scientist", "Procurement Engineer", "Financial Analyst - Supply Chain", "QA-RA Operations Manager", "Healthcare Director"] {
    precondition(!CareerFeed.relevant(title), "Mismatched title must be excluded: \(title)")
}
qiddiya["shortcode"] = "ABC123"
qiddiya["title"] = "Healthcare Director"
precondition(CareerFeed.qiddiyaJob(qiddiya, now: now) == nil, "Healthcare alone must not qualify a Qiddiya role")
print("PASS: web-aligned title relevance and clinical/qualification mismatch exclusions")
precondition(CareerFeed.relevant("Regulatory Operations Manager") && CareerFeed.relevant("Operation Manager"))


precondition(!CareerFeed.relevant("Early-in-Career Supply Chain Programme"))
precondition(!CareerFeed.relevant("Early Career Procurement Programme"))
precondition(CareerFeed.relevant("Business Value Partner"))
detail["title"] = "Business Value Partner"
detail["location"] = "2 Locations"
detail["startDate"] = "2026-10-01"
detail["posted"] = true
precondition(CareerFeed.job(detail, externalPath: path, source: source, now: now)?["location"] as? String == "2 Locations, Saudi Arabia")
detail["posted"] = false
precondition(CareerFeed.job(detail, externalPath: path, source: source, now: now) == nil)
detail["posted"] = true
detail["startDate"] = "2026-10-09"
precondition(CareerFeed.job(detail, externalPath: path, source: source, now: now) == nil)
detail["startDate"] = "2026-10-08T11:00:00Z"
precondition(CareerFeed.job(detail, externalPath: path, source: source, now: now) == nil)
print("PASS: cross-platform IDs, early-career exclusion, posted/start-date gates, and explicit Saudi geography")

// Country must outweigh job-title text in a URL slug.
detail["title"]="Supply Chain Manager"
detail["location"]="Dubai"
detail["country"]=["descriptor":"United Arab Emirates"]
detail["startDate"]="2026-10-01"
precondition(CareerFeed.job(detail, externalPath:"/job/Dubai/Supply-Chain-Manager-Saudi-Market_R123", source:source, now:now)==nil)
qiddiya["title"]="Procurement Manager"
qiddiya["location"]=["city":"Tabuk","countryCode":"SA"]
precondition((CareerFeed.qiddiyaJob(qiddiya,now:now)?["location"] as? String)?.contains("Saudi Arabia")==true)
print("PASS: authoritative Saudi country evidence, foreign title-slug rejection and Tabuk retention")

// Malformed detail data must not masquerade as valid zero-result employer coverage.
detail["location"]="Remote";detail["country"]=["descriptor":"Saudi Arabia"]
for (country, expected) in [("Saudi Arabia",true),(" SAU ",true),("SA",true),("Kingdom of Saudi Arabia",true),("السعودية",true),("المملكة العربية السعودية",true),("Not Saudi Arabia",false),("United Arab Emirates",false)] {
    detail["country"]=["descriptor":country]
    precondition((CareerFeed.job(detail,externalPath:path,source:source,now:now) != nil)==expected, "Country must be an exact supported Saudi descriptor")
}
detail["country"]=["descriptor":"Saudi Arabia"]
for field in ["startDate","endDate"] {
    for invalid: Any in ["2026-02-30T00:00:00Z", "2026-10-01T00:00:00Zgarbage", 42] {
        detail[field]=invalid
        precondition(CareerFeed.job(detail,externalPath:path,source:source,now:now)==nil,"Reject malformed date fields")
    }
    detail.removeValue(forKey:field)
}
detail["startDate"]="2024-02-29T00:00:00.123+03:00"
precondition(CareerFeed.job(detail,externalPath:path,source:source,now:now) != nil)
detail["canApply"]=1
precondition(CareerFeed.job(detail,externalPath:path,source:source,now:now)==nil,"A JSON number is not application permission")
detail["canApply"]=true
detail["title"]="Business Value Partner"
let healthcare=CareerFeed.job(detail,externalPath:path,source:CareerFeed.sources[0],now:now)
precondition(healthcare?["healthcare"] as? Bool == true && healthcare?["leadership"] as? Bool == false)
precondition(CareerFeed.isoDate("2026-10-01T00:00:00Z\n") == nil)
precondition(CareerFeed.isoDate("2026-10-01T25:00:00Z") == nil)
let saudiMidnight=ISO8601DateFormatter().date(from:"2026-10-08T21:00:00Z")!
precondition(CareerFeed.dateIsEligible("2026-10-08",now:saudiMidnight.addingTimeInterval(-1),closing:true))
precondition(!CareerFeed.dateIsEligible("2026-10-08",now:saudiMidnight,closing:true))
detail["location"]="Riyadh";detail["country"]=["descriptor":"United Arab Emirates"]
precondition(CareerFeed.job(detail,externalPath:path,source:source,now:now)==nil)
print("PASS: strict native dates, Saudi country descriptors and healthcare bridge metadata")

// Real URLSession parsing and cancellation, with local responses instead of employer traffic.
final class EmployerFixture: URLProtocol {
    static var scenario = "partial"
    private var pending: DispatchWorkItem?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let scenario = Self.scenario
        let path = request.url!.path
        var status = 200
        var body: [String: Any]
        if request.url!.host == "apply.workable.com" {
            var requestData = request.httpBody ?? Data()
            if requestData.isEmpty, let stream = request.httpBodyStream {
                stream.open()
                var buffer = [UInt8](repeating: 0, count: 1024)
                while stream.hasBytesAvailable {
                    let count = stream.read(&buffer, maxLength: buffer.count)
                    if count <= 0 { break }
                    requestData.append(contentsOf: buffer.prefix(count))
                }
                stream.close()
            }
            let input = (try? JSONSerialization.jsonObject(with: requestData)) as? [String: Any]
            let query = input?["query"] as? String ?? ""
            if scenario == "qiddiyaAllFailed" || query == "procurement" {
                status = 503; body = [:]
            } else {
                let rows: [[String: Any]] = query == "healthcare" ? [["shortcode": "TEST123", "title": "Procurement Manager", "location": ["city": "Riyadh", "countryCode": "SA"], "state": "published", "isInternal": false, "published": "2020-01-01T00:00:00Z"]] : []
                body = ["results": rows]
            }
        } else if path.hasSuffix("/jobs") {
            body = ["total": 2, "jobPostings": [["title": "Procurement Manager", "externalPath": "/job/Riyadh/Procurement_R1"], ["title": "Procurement Manager", "externalPath": "/job/Riyadh/Procurement_R2"]]]
        } else if scenario == "allFailed" || (scenario == "partial" && path.hasSuffix("R2")) {
            status = 503; body = [:]
        } else {
            body = ["jobPostingInfo": ["title": "Procurement Manager", "location": "Riyadh", "country": ["descriptor": "Saudi Arabia"], "canApply": scenario != "closed", "jobReqId": path.hasSuffix("R1") ? "R1" : "R2", "startDate": "2020-01-01"]]
            if scenario == "malformed" || (scenario == "mixedMalformed" && path.hasSuffix("R2")) { body = ["jobPostingInfo": [:]] }
            if scenario == "missingID" { body = ["jobPostingInfo": ["title":"Procurement Manager","canApply":true,"location":"Riyadh"]] }
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        let bytes = try! JSONSerialization.data(withJSONObject: body)
        let send = { [weak self] in
            guard let self, self.pending?.isCancelled != true else { return }
            self.client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            self.client?.urlProtocol(self, didLoad: bytes)
            self.client?.urlProtocolDidFinishLoading(self)
        }
        if scenario == "deadline" && path.hasSuffix("R2") {
            let work = DispatchWorkItem(block: send)
            pending = work
            DispatchQueue.global().asyncAfter(deadline: .now() + 2, execute: work)
        } else { send() }
    }
    override func stopLoading() { pending?.cancel() }
}

let fixtureConfiguration = URLSessionConfiguration.ephemeral
fixtureConfiguration.protocolClasses = [EmployerFixture.self]
let fixtureSession = URLSession(configuration: fixtureConfiguration)
let employer = CareerFeed.sources[0]
EmployerFixture.scenario = "partial"
let partial = await CareerFeed.fetch(employer, session: fixtureSession)
precondition(partial.jobs.count == 1 && partial.status["ok"] as? Bool == true, "One failed detail must not discard a verified employer lead")
precondition(partial.status["detailErrors"] as? Int == 1 && partial.status["error"] != nil)
EmployerFixture.scenario = "allFailed"
let failed = await CareerFeed.fetch(employer, session: fixtureSession)
precondition(failed.status["ok"] as? Bool == false && failed.status["detailErrors"] as? Int == 2)
EmployerFixture.scenario = "malformed"
let malformed = await CareerFeed.fetch(employer, session: fixtureSession)
precondition(malformed.status["ok"] as? Bool == false && malformed.status["detailErrors"] as? Int == 2)
EmployerFixture.scenario = "missingID"
let missingID = await CareerFeed.fetch(employer, session: fixtureSession)
precondition(missingID.status["ok"] as? Bool == false && missingID.status["detailErrors"] as? Int == 2)
EmployerFixture.scenario = "mixedMalformed"
let mixedMalformed = await CareerFeed.fetch(employer, session: fixtureSession)
precondition(mixedMalformed.jobs.count == 1 && mixedMalformed.status["detailErrors"] as? Int == 1)
EmployerFixture.scenario = "closed"
let closed = await CareerFeed.fetch(employer, session: fixtureSession)
precondition(closed.status["ok"] as? Bool == true && closed.jobs.isEmpty, "Fetched but ineligible details are a successful zero-result search")
EmployerFixture.scenario = "qiddiyaPartial"
let workable = await CareerFeed.fetchQiddiya(session: fixtureSession)
precondition(workable.status["ok"] as? Bool == true && workable.jobs.count == 1 && workable.status["queryErrors"] as? Int == 1)
EmployerFixture.scenario = "qiddiyaAllFailed"
let workableFailure = await CareerFeed.fetchQiddiya(session: fixtureSession)
precondition(workableFailure.status["ok"] as? Bool == false)
EmployerFixture.scenario = "deadline"
let clock = ContinuousClock()
let started = clock.now
let bounded = await CareerFeed.boundedSource(name: employer.name, budgetNanoseconds: 100_000_000) {
    await CareerFeed.fetch(employer, session: fixtureSession)
}
precondition(started.duration(to: clock.now) < .seconds(1), "A source deadline must cancel its pending URLSession request promptly")
precondition(bounded.jobs.count == 1 && bounded.status["ok"] as? Bool == true && bounded.status["timedOut"] as? Bool == true, "Deadline must retain completed leads with explicit incomplete status")
precondition(CareerFeed.sourceBudgetNanoseconds <= 50_000_000_000)
fixtureSession.invalidateAndCancel()
print("PASS: partial employer success, zero-eligible success, all-details failure, partial Workable queries, and prompt deadline cancellation preserving completed leads")
