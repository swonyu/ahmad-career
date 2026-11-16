import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Phone clients never infer submission from an HTTP status, a tap, or a local note.
enum MobileApplicationPolicy {
    static let maximumResumeBytes = 5 * 1024 * 1024
    static func serviceURL(_ text: String) -> URL? {
        guard let parts = URLComponents(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
              parts.scheme?.lowercased() == "https", let host = parts.host, !host.isEmpty,
              parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
              parts.path.isEmpty || parts.path == "/" else { return nil }
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
    static func resumeError(_ data: Data, filename: String) -> String? {
        if data.count > maximumResumeBytes { return "Choose a PDF no larger than 5 MB." }
        if data.count < 8 || !data.starts(with: Data("%PDF-".utf8)) { return "This file is not a readable PDF. Choose your CV as a PDF." }
        if filename.isEmpty || filename.contains("/") || filename.contains("\\") || filename.contains(":")
            || filename.hasPrefix(".") || !filename.lowercased().hasSuffix(".pdf") || filename.count > 180 {
            return "Use a short PDF filename without path characters."
        }
        return nil
    }
    static func isVerified(_ value: [String: ApplicationValue]) -> Bool {
        value["state"]?.string == "confirmed"
            && value["provider"]?.string == "lever"
            && ["live", "test"].contains(value["evidenceMode"]?.string ?? "")
            && !(value["applicationId"]?.string?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
    }
    static func jobIdentity(_ text: String) -> String {
        guard var parts = URLComponents(string: text), let host = parts.host?.lowercased() else { return text }
        parts.fragment = nil
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
    var errorDescription: String? { message }
}

private final class ApplicationNoRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        // A bearer token must never follow an endpoint to another origin.
        completionHandler(nil)
    }
}

final class MobileApplicationClient {
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
    func request(_ route: String, method: String = "GET", body: [String: ApplicationValue]? = nil) async throws -> [String: ApplicationValue] {
        guard ["status", "session", "session/revoke", "workspace", "profile", "jobs", "prepare", "submit", "stop", "receipts"].contains(route) else {
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
        guard let http = response as? HTTPURLResponse, data.count <= 12 * 1024 * 1024 else {
            throw MobileApplicationError(message: "The service returned an unreadable response. Your submission status has not been changed.")
        }
        guard let envelope = try? JSONDecoder().decode([String: ApplicationValue].self, from: data) else {
            throw MobileApplicationError(message: "The service did not return a valid application receipt. Refresh your applications before trying anything again.")
        }
        guard (200..<300).contains(http.statusCode), envelope["ok"]?.bool == true else {
            let code = envelope["error"]?.object["code"]?.string ?? ""
            let message: String
            switch http.statusCode {
            case 401: message = "Your connection has expired. Connect again to view your existing applications."
            case 409: message = "Your application details changed or this job already has an attempt. Refresh and review its current status."
            case 413: message = "This file is too large. Choose a PDF up to 5 MB."
            case 429: message = "Please wait before trying this action again."
            default:
                let supplied = envelope["error"]?.object["message"]?.string ?? "This action could not be completed."
                message = String(supplied.prefix(300))
            }
            throw MobileApplicationError(message: code == "uncertain" ? "This application needs verification. It will not be sent again automatically." : message)
        }
        return envelope
    }
}

struct PhoneApplicationProfile: Codable, Equatable {
    var firstName = "", lastName = "", email = "", phone = "", city = "", country = ""
    var headline = "", skills = "", targetRoles = "", targetCountries = "", website = ""
    var experienceLevel = "any"
    var remote = true, hybrid = true, onsite = true
    var resumeName = ""
    var resumeData: Data?
    var resumeChanged = false
    var resumeRemoved = false
    private func words(_ text: String) -> [ApplicationValue] {
        text.split(separator: ",").map { .string($0.trimmingCharacters(in: .whitespacesAndNewlines)) }.filter { !($0.string ?? "").isEmpty }
    }
    func payload() -> [String: ApplicationValue] {
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
        skills = object["skills"]?.array.compactMap(\.string).joined(separator: ", ") ?? ""
        targetRoles = object["targetRoles"]?.array.compactMap(\.string).joined(separator: ", ") ?? ""
        targetCountries = object["targetCountries"]?.array.compactMap(\.string).joined(separator: ", ") ?? ""
        experienceLevel = object["experienceLevel"]?.string ?? "any"
        let modes = object["workModes"]?.array.compactMap(\.string) ?? []
        remote = modes.contains("remote"); hybrid = modes.contains("hybrid"); onsite = modes.contains("on-site")
        resumeName = object["resume"]?.object["name"]?.string ?? ""
        // Server metadata never reconstructs or substitutes résumé bytes.
        resumeData = nil; resumeChanged = false; resumeRemoved = false
    }
}
