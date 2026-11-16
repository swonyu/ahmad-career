import Foundation
import CryptoKit
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

enum ApplicationServicePage: String, CaseIterable {
    case connect, privacy, support, account
}

/// Phone clients never infer submission from an HTTP status, a tap, or a local note.
enum MobileApplicationPolicy {
    static let maximumResumeBytes = 5 * 1024 * 1024
    static let hostedServiceOrigin = "https://career-finder-service.jazzy-drake-8323.chatgpt.site"
    static func connectionSetupAddress(_ existing: String) -> String {
        existing.isEmpty ? hostedServiceOrigin : existing
    }
    static func isHostedService(_ address: String) -> Bool {
        serviceURL(connectionSetupAddress(address))?.absoluteString == hostedServiceOrigin
    }
    static func servicePageURL(_ page: ApplicationServicePage, address: String) -> URL? {
        serviceURL(connectionSetupAddress(address))?.appendingPathComponent(page.rawValue)
    }
    static func serviceURL(_ text: String) -> URL? {
        guard var parts = URLComponents(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
              parts.scheme?.lowercased() == "https", let host = parts.host, !host.isEmpty,
              parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
              parts.path.isEmpty || parts.path == "/",
              parts.port == nil || (1...65535).contains(parts.port!) else { return nil }
        parts.scheme = "https"; parts.host = host.lowercased(); parts.path = ""
        if parts.port == 443 { parts.port = nil }
        return parts.url
    }
    static func jobURL(_ text: String) -> URL? {
        guard let parts = URLComponents(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
              parts.scheme?.lowercased() == "https", let host = parts.host, host.contains("."),
              parts.user == nil, parts.password == nil, host.lowercased() != "localhost",
              !host.lowercased().hasSuffix(".local"), !host.lowercased().hasSuffix(".localhost"),
              !host.lowercased().hasSuffix(".internal"), !host.lowercased().hasSuffix(".test"),
              !host.lowercased().hasSuffix(".invalid"), parts.port == nil || parts.port == 443,
              !host.contains(":"), host.range(of: #"^\d+\.\d+\.\d+\.\d+$"#, options: .regularExpression) == nil else { return nil }
        return parts.url
    }
    /// This is a user-supplied public profile link, not a LinkedIn session or ownership check.
    static func linkedInProfileURL(_ text: String) -> URL? {
        func isControl(_ scalar: Unicode.Scalar) -> Bool {
            scalar.value <= 0x1f || (0x7f...0x9f).contains(scalar.value) || scalar.properties.generalCategory == .format
        }
        guard !text.isEmpty, text.utf16.count <= 2_048,
              !text.unicodeScalars.contains(where: { $0.value <= 0x20 || $0.value == 0x7f }),
              !text.contains("\\"), let decoded = text.removingPercentEncoding,
              !decoded.unicodeScalars.contains(where: isControl),
              let separator = text.range(of: "://"),
              !text[separator.upperBound...].prefix(while: { $0 != "/" && $0 != "?" && $0 != "#" }).contains("%"),
              let parts = URLComponents(string: text), parts.scheme?.lowercased() == "https",
              let host = parts.host?.lowercased(),
              parts.percentEncodedHost?.contains("%") != true,
              host == "linkedin.com" || host == "www.linkedin.com"
                || host.range(of: #"^[a-z]{2,3}\.linkedin\.com$"#, options: .regularExpression) != nil,
              parts.user == nil, parts.password == nil, parts.port == nil || parts.port == 443,
              parts.percentEncodedPath.hasPrefix("/in/") else { return nil }
        var encodedSlug = String(parts.percentEncodedPath.dropFirst(4))
        if encodedSlug.hasSuffix("/") { encodedSlug.removeLast() }
        guard let slug = encodedSlug.removingPercentEncoding, !slug.isEmpty,
              slug != ".", slug != "..", !slug.contains("/"), !slug.contains("\\"), !slug.contains("%"),
              !slug.unicodeScalars.contains(where: { isControl($0) || CharacterSet.whitespacesAndNewlines.contains($0) }) else { return nil }
        let unreserved = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        guard let canonicalSlug = slug.addingPercentEncoding(withAllowedCharacters: unreserved) else { return nil }
        let canonical = "https://www.linkedin.com/in/" + canonicalSlug
        guard canonical.utf8.count <= 2_048 else { return nil }
        return URL(string: canonical)
    }
    /// Only the search words the user entered are included in this external handoff.
    static func linkedInJobSearchURL(keywords: String, location: String) -> URL? {
        let words = keywords.trimmingCharacters(in: .whitespacesAndNewlines)
        let place = location.trimmingCharacters(in: .whitespacesAndNewlines)
        guard words.utf16.count <= 120, place.utf16.count <= 100 else { return nil }
        var parts = URLComponents(string: "https://www.linkedin.com/jobs/search/")!
        let unreserved = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        var query: [String] = []
        if !words.isEmpty { query.append("keywords=" + (words.addingPercentEncoding(withAllowedCharacters: unreserved) ?? "")) }
        if !place.isEmpty { query.append("location=" + (place.addingPercentEncoding(withAllowedCharacters: unreserved) ?? "")) }
        if !query.isEmpty { parts.percentEncodedQuery = query.joined(separator: "&") }
        return parts.url
    }
    static func resumeError(_ data: Data, filename: String) -> String? {
        if data.count > maximumResumeBytes { return "Choose a PDF no larger than 5 MB." }
        if data.count < 8 || !data.starts(with: Data("%PDF-".utf8)) { return "This file is not a readable PDF. Choose your CV as a PDF." }
        if filename.isEmpty || filename.contains("/") || filename.contains("\\") || filename.contains(":")
            || filename.hasPrefix(".") || !filename.lowercased().hasSuffix(".pdf") || filename.count > 180 {
            return "Use a short PDF filename without path characters."
        }
        return nil
    }
    static func readResume(at url: URL) throws -> Data {
        let file = try FileHandle(forReadingFrom: url)
        defer { try? file.close() }
        var bytes = Data()
        while bytes.count <= maximumResumeBytes {
            let chunk = try file.read(upToCount: min(64 * 1024, maximumResumeBytes + 1 - bytes.count)) ?? Data()
            if chunk.isEmpty { break }
            bytes.append(chunk)
        }
        if let error = resumeError(bytes, filename: url.lastPathComponent) { throw MobileApplicationError(message: error) }
        return bytes
    }
    static func isFileSelectionCancelled(_ error: Error) -> Bool {
        let value = error as NSError
        return value.domain == NSCocoaErrorDomain && value.code == NSUserCancelledError
    }
    static func isVerified(_ value: [String: ApplicationValue]) -> Bool {
        value["state"]?.string == "confirmed"
            && value["provider"]?.string == "lever"
            && ["live", "test"].contains(value["evidenceMode"]?.string ?? "")
            && !(value["applicationId"]?.string?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
    }
    static func jobIdentity(_ text: String) -> String {
        guard var parts = URLComponents(string: text), let host = parts.host?.lowercased() else { return text }
        parts.scheme = parts.scheme?.lowercased(); parts.host = host; parts.fragment = nil
        if parts.port == 443 { parts.port = nil }
        if host == "jobs.lever.co" || host == "jobs.eu.lever.co" {
            let segments = parts.path.split(separator: "/")
            if segments.count >= 2 { return host + "/" + segments[0].lowercased() + "/" + segments[1].lowercased() }
        }
        parts.queryItems = parts.queryItems?.filter { !$0.name.lowercased().hasPrefix("utm_") && !["gclid", "fbclid"].contains($0.name.lowercased()) }
        if parts.queryItems?.isEmpty == true { parts.query = nil }
        while parts.path.hasSuffix("/") { parts.path.removeLast() }
        return parts.string ?? text
    }
    static func stateTitle(_ state: String, test: Bool = false) -> String {
        switch state {
        case "confirmed": return test ? "Test receipt" : "Confirmed"
        case "dispatching": return "Sending"
        case "uncertain": return "Needs verification"
        case "rate_limited": return "Waiting to retry"
        case "rejected": return "Not accepted"
        case "ready": return "Ready to review"
        case "cancelled": return "Stopped"
        case "blocked": return "Action needed"
        default: return "Status unavailable"
        }
    }
}

/// Small typed JSON boundary shared by the native client and executable contract checks.
enum ApplicationValue: Codable, Equatable {
    case string(String), number(Double), bool(Bool), object([String: ApplicationValue]), array([ApplicationValue]), null
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode([String: ApplicationValue].self) { self = .object(v) }
        else { self = .array(try c.decode([ApplicationValue].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }
    var string: String? { if case .string(let v) = self { return v }; return nil }
    var object: [String: ApplicationValue] { if case .object(let v) = self { return v }; return [:] }
    var array: [ApplicationValue] { if case .array(let v) = self { return v }; return [] }
    var int: Int { if case .number(let v) = self, v.isFinite, v >= Double(Int.min), v < Double(Int.max) { return Int(v) }; return 0 }
    var integer: Int? {
        if case .number(let v) = self, v.isFinite, v.rounded(.towardZero) == v,
           v >= Double(Int.min), v < Double(Int.max) { return Int(v) }
        return nil
    }
    var bool: Bool { if case .bool(let v) = self { return v }; return false }
    var display: String {
        switch self {
        case .string(let v): return v
        case .bool(let v): return v ? "Yes" : "No"
        case .number(let v): return String(v)
        case .null: return "Not provided"
        case .array(let v): return v.map(\.display).joined(separator: ", ")
        case .object: return "Additional details"
        }
    }
}

struct MobileApplicationError: LocalizedError {
    let message: String
    var statusCode: Int? = nil
    var code: String? = nil
    var errorDescription: String? { message }
}

enum MobileApplicationResponse {
    static func decode(_ data: Data, statusCode: Int) throws -> [String: ApplicationValue] {
        guard data.count <= 12 * 1024 * 1024 else {
            throw MobileApplicationError(message: "The service returned an unreadable response. Refresh to check the result.", statusCode: statusCode)
        }
        let envelope = try? JSONDecoder().decode([String: ApplicationValue].self, from: data)
        if (200..<300).contains(statusCode), let envelope, envelope["ok"]?.bool == true { return envelope }
        let code = envelope?["error"]?.object["code"]?.string
        let message: String
        switch statusCode {
        case 401: message = "Your connection has expired or been revoked. Open connection setup and request a new code for the same workspace. Your phone draft is kept."
        case 409: message = "The service has a newer profile or application status. Review the current version before continuing."
        case 413: message = "This file is too large. Choose a PDF up to 5 MB."
        case 429: message = "Please wait before trying this action again."
        default:
            message = String((envelope?["error"]?.object["message"]?.string
                ?? "The service returned an incomplete response. Refresh to check the result before trying again.").prefix(300))
        }
        let detail: String
        switch code {
        case "uncertain": detail = "This application needs verification. It will not be sent again automatically."
        case "account_deleting": detail = "This hosted workspace is being deleted. New submissions are stopped. Open account management for its current status; your phone draft is kept."
        default: detail = message
        }
        throw MobileApplicationError(message: detail,
                                     statusCode: statusCode, code: code)
    }
}

@MainActor
protocol MobileApplicationServing: AnyObject {
    var origin: URL { get }
    var token: String? { get set }
    func request(_ route: String, method: String, body: [String: ApplicationValue]?) async throws -> [String: ApplicationValue]
    func invalidate()
}

extension MobileApplicationServing {
    func request(_ route: String) async throws -> [String: ApplicationValue] {
        try await request(route, method: "GET", body: nil)
    }
}

private final class ApplicationNoRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        // A bearer token must never follow an endpoint to another origin.
        completionHandler(nil)
    }
}

@MainActor
final class MobileApplicationClient: MobileApplicationServing {
    let origin: URL
    var token: String?
    private let session: URLSession
    init(origin: URL, token: String? = nil) throws {
        guard let accepted = MobileApplicationPolicy.serviceURL(origin.absoluteString) else {
            throw MobileApplicationError(message: "The application service must use a secure HTTPS address.")
        }
        self.origin = accepted
        self.token = token
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 25
        config.timeoutIntervalForResource = 40
        session = URLSession(configuration: config, delegate: ApplicationNoRedirect(), delegateQueue: nil)
    }
    deinit { session.invalidateAndCancel() }
    func invalidate() { session.invalidateAndCancel() }
    func request(_ route: String, method: String = "GET", body: [String: ApplicationValue]? = nil) async throws -> [String: ApplicationValue] {
        guard ["status", "session", "session/revoke", "workspace", "profile", "jobs", "prepare", "submit", "advance", "stop", "receipts"].contains(route) else {
            throw MobileApplicationError(message: "This application action is unavailable.")
        }
        let url = origin.appendingPathComponent("api/apply").appendingPathComponent(route)
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw MobileApplicationError(message: "The service returned an unreadable response. Your submission status has not been changed.")
        }
        return try MobileApplicationResponse.decode(data, statusCode: http.statusCode)
    }
}

struct PhoneApplicationProfile: Codable, Equatable {
    var firstName = "", lastName = "", email = "", phone = "", city = "", country = ""
    var headline = "", skills = "", targetRoles = "", targetCountries = "", website = "", linkedin = ""
    var experienceLevel = "any"
    var remote = true, hybrid = true, onsite = true
    var resumeName = ""
    var resumeData: Data?
    var resumeChanged = false
    var resumeRemoved = false
    var resumeSize: Int?
    var resumeSHA256: String?
    init() {}
    private enum CodingKeys: String, CodingKey {
        case firstName, lastName, email, phone, city, country, headline, skills, targetRoles, targetCountries, website, linkedin
        case experienceLevel, remote, hybrid, onsite, resumeName, resumeData, resumeChanged, resumeRemoved, resumeSize, resumeSHA256
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        firstName = try c.decode(String.self, forKey: .firstName); lastName = try c.decode(String.self, forKey: .lastName)
        email = try c.decode(String.self, forKey: .email); phone = try c.decode(String.self, forKey: .phone)
        city = try c.decode(String.self, forKey: .city); country = try c.decode(String.self, forKey: .country)
        headline = try c.decode(String.self, forKey: .headline); skills = try c.decode(String.self, forKey: .skills)
        targetRoles = try c.decode(String.self, forKey: .targetRoles); targetCountries = try c.decode(String.self, forKey: .targetCountries)
        website = try c.decode(String.self, forKey: .website)
        if c.contains(.linkedin) { linkedin = try c.decode(String.self, forKey: .linkedin) }
        experienceLevel = try c.decode(String.self, forKey: .experienceLevel)
        remote = try c.decode(Bool.self, forKey: .remote); hybrid = try c.decode(Bool.self, forKey: .hybrid); onsite = try c.decode(Bool.self, forKey: .onsite)
        resumeName = try c.decode(String.self, forKey: .resumeName); resumeData = try c.decodeIfPresent(Data.self, forKey: .resumeData)
        resumeChanged = try c.decode(Bool.self, forKey: .resumeChanged); resumeRemoved = try c.decode(Bool.self, forKey: .resumeRemoved)
        resumeSize = try c.decodeIfPresent(Int.self, forKey: .resumeSize); resumeSHA256 = try c.decodeIfPresent(String.self, forKey: .resumeSHA256)
    }
    var hasContent: Bool {
        [firstName, lastName, email, phone, city, country, headline, skills, targetRoles, targetCountries, website, linkedin]
            .contains { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            || resumeData != nil || !resumeName.isEmpty || resumeRemoved
    }
    mutating func selectResume(_ data: Data, filename: String) throws {
        if let error = MobileApplicationPolicy.resumeError(data, filename: filename) { throw MobileApplicationError(message: error) }
        resumeData = data; resumeName = filename; resumeSize = data.count
        resumeSHA256 = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        resumeChanged = true; resumeRemoved = false
    }
    mutating func removeResume() {
        resumeData = nil; resumeName = ""; resumeSize = nil; resumeSHA256 = nil
        resumeChanged = true; resumeRemoved = true
    }
    mutating func adoptResumeMetadata(from other: PhoneApplicationProfile) {
        resumeName = other.resumeName; resumeSize = other.resumeSize; resumeSHA256 = other.resumeSHA256
        resumeData = nil; resumeChanged = false; resumeRemoved = false
    }
    private func words(_ text: String) -> [ApplicationValue] {
        text.split(separator: ",").map { .string($0.trimmingCharacters(in: .whitespacesAndNewlines)) }.filter { !($0.string ?? "").isEmpty }
    }
    func payload(includeLinkedIn: Bool = false) -> [String: ApplicationValue] {
        var fields: [String: ApplicationValue] = [
            "firstName": .string(firstName.trimmingCharacters(in: .whitespacesAndNewlines)),
            "lastName": .string(lastName.trimmingCharacters(in: .whitespacesAndNewlines)),
            "email": .string(email.trimmingCharacters(in: .whitespacesAndNewlines)),
            "phone": .string(phone.trimmingCharacters(in: .whitespacesAndNewlines)),
            "city": .string(city), "country": .string(country.uppercased()),
            "headline": .string(headline), "skills": .array(words(skills)),
            "targetRoles": .array(words(targetRoles)),
            "targetCountries": .array(words(targetCountries.uppercased())),
            "workModes": .array([(onsite ? "on-site" : nil), (hybrid ? "hybrid" : nil), (remote ? "remote" : nil)].compactMap { $0 }.map(ApplicationValue.string)),
            "experienceLevel": .string(experienceLevel), "website": .string(website)
        ]
        if includeLinkedIn { fields["linkedin"] = .string(linkedin) }
        if resumeRemoved { fields["resume"] = .null }
        else if resumeChanged, let resumeData {
            fields["resume"] = .object(["name": .string(resumeName), "mime": .string("application/pdf"), "dataBase64": .string(resumeData.base64EncodedString())])
        }
        return fields
    }
    mutating func updateFromServer(_ object: [String: ApplicationValue]) {
        firstName = object["firstName"]?.string ?? ""; lastName = object["lastName"]?.string ?? ""
        email = object["email"]?.string ?? ""; phone = object["phone"]?.string ?? ""
        city = object["city"]?.string ?? ""; country = object["country"]?.string ?? ""
        headline = object["headline"]?.string ?? ""; website = object["website"]?.string ?? ""
        linkedin = object["linkedin"]?.string.flatMap { $0.isEmpty ? "" : MobileApplicationPolicy.linkedInProfileURL($0)?.absoluteString } ?? ""
        skills = object["skills"]?.array.compactMap(\.string).joined(separator: ", ") ?? ""
        targetRoles = object["targetRoles"]?.array.compactMap(\.string).joined(separator: ", ") ?? ""
        targetCountries = object["targetCountries"]?.array.compactMap(\.string).joined(separator: ", ") ?? ""
        experienceLevel = object["experienceLevel"]?.string ?? "any"
        let modes = object["workModes"]?.array.compactMap(\.string) ?? []
        remote = modes.contains("remote"); hybrid = modes.contains("hybrid"); onsite = modes.contains("on-site")
        resumeName = object["resume"]?.object["name"]?.string ?? ""
        resumeSize = object["resume"]?.object["size"]?.integer
        resumeSHA256 = object["resume"]?.object["sha256"]?.string
        // Server metadata never reconstructs or substitutes résumé bytes.
        resumeData = nil; resumeChanged = false; resumeRemoved = false
    }
}
