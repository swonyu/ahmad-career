import Foundation
import CryptoKit
#if canImport(PDFKit)
import PDFKit
#endif
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
    /// English and Arabic keyboards use different commas for the same profile lists.
    static func profileListItems(_ text: String) -> [String] {
        text.split(whereSeparator: { $0 == "," || $0 == "،" })
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }
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
    private static func encodedNewURLSpelling(_ text: String) -> String {
        let hex = Array("0123456789ABCDEF".utf8)
        var bytes: [UInt8] = []; bytes.reserveCapacity(text.utf8.count)
        for byte in text.utf8 {
            if byte < 0x80 { bytes.append(byte) }
            else { bytes.append(0x25); bytes.append(hex[Int(byte >> 4)]); bytes.append(hex[Int(byte & 0x0f)]) }
        }
        return String(decoding: bytes, as: UTF8.self)
    }
    /// New opportunity entry keeps its input and encoded URL bound. Historical reads use jobURL.
    static func newJobURL(_ text: String) -> URL? {
        guard text.utf16.count <= 4_096, let accepted = jobURL(encodedNewURLSpelling(text)),
              var parts = URLComponents(url: accepted, resolvingAgainstBaseURL: false) else { return nil }
        // WHATWG HTTPS query serialization percent-encodes apostrophes; never measure an NFC-normalized path.
        parts.percentEncodedQuery = parts.percentEncodedQuery?.replacingOccurrences(of: "'", with: "%27")
        guard let url = parts.url, url.absoluteString.utf8.count <= 4_096 else { return nil }
        return url
    }
    /// New portfolio writes share the service's input and encoded URL bound.
    /// Stored historical profile values are retained separately without this write validation.
    static func newProfileWebsiteURL(_ text: String) -> URL? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.utf16.count <= 2_048,
              !text.unicodeScalars.contains(where: { $0.value < 0x20 || $0.value == 0x7f }),
              !trimmed.unicodeScalars.contains(where: { CharacterSet.whitespacesAndNewlines.contains($0) }),
              !trimmed.contains("\\"), let accepted = jobURL(encodedNewURLSpelling(trimmed)),
              var parts = URLComponents(url: accepted, resolvingAgainstBaseURL: false) else { return nil }
        parts.scheme = "https"; parts.host = parts.host?.lowercased(); parts.fragment = nil
        if parts.port == 443 { parts.port = nil }
        if parts.path.isEmpty { parts.path = "/" }
        parts.percentEncodedQuery = parts.percentEncodedQuery?.replacingOccurrences(of: "'", with: "%27")
        guard let canonical = parts.url, canonical.absoluteString.utf8.count <= 2_048 else { return nil }
        return canonical
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
        #if canImport(PDFKit)
        guard let document = PDFDocument(data: data), !document.isLocked, !document.isEncrypted else {
            return "This PDF cannot be read without a password. Export an unencrypted PDF CV and choose it again. Your previous CV is kept."
        }
        guard (1...200).contains(document.pageCount) else { return "Choose a readable PDF CV with between 1 and 200 pages." }
        for index in 0..<document.pageCount {
            guard let page = document.page(at: index) else { return "A page in this PDF could not be read. Export the CV again; your previous selection is kept." }
            let bounds = page.bounds(for: .mediaBox)
            guard bounds.width.isFinite, bounds.height.isFinite, bounds.width > 0, bounds.height > 0,
                  bounds.width <= 14_400, bounds.height <= 14_400 else {
                return "This PDF has an unsupported page size. Export it using a standard paper size."
            }
        }
        #else
        return "PDF readability checks are unavailable on this platform. Choose this file in the iPhone app before using it for an application."
        #endif
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
            && value["_careerHistoricalApplicationId"]?.bool != true
            && value["provider"]?.string == "lever"
            && ["live", "test"].contains(value["evidenceMode"]?.string ?? "")
            && !(value["applicationId"]?.string?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
    }
    /// Presentation only: a receipt without verifiable provider evidence needs checking.
    static func displayState(_ value: [String: ApplicationValue]) -> String {
        let state = value["state"]?.string ?? ""
        return state == "confirmed" && !isVerified(value) ? "uncertain" : state
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
        case "ready": return "Prepared draft"
        case "cancelled": return "Stopped"
        case "blocked": return "Action needed"
        default: return "Status unavailable"
        }
    }
    /// A self-entered filename is a private note, never a path, attachment or submission receipt.
    static func manualResumeNameIsValid(_ name: String?) -> Bool {
        guard let name else { return true }
        return name.utf16.count <= 180
            && !name.unicodeScalars.contains { $0.value < 0x20 || $0.value == 0x7f || [0x2f, 0x5c, 0x3a].contains($0.value) }
    }
    static let manualResumeNameError = "Use a filename of up to 180 characters without paths or control characters."
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

/// Historical details come only from the attempt or review being displayed.
/// In particular, there is no current-profile or document-hash lookup fallback.
struct ApplicationCVDetails: Equatable {
    let resumeName: String?
    let profileRevision: Int?
    init(attempt: [String: ApplicationValue]) {
        self.init(name: attempt["resumeName"], revision: attempt["profileRevision"], historical: attempt["_careerLegacyResumeName"]?.object)
    }
    init(reviewItem: [String: ApplicationValue], plan: [String: ApplicationValue]) {
        self.init(name: reviewItem["resume"]?.object["name"], revision: plan["profileRevision"], historical: reviewItem["_careerLegacyResumeName"]?.object)
    }
    private init(name: ApplicationValue?, revision: ApplicationValue?, historical: [String: ApplicationValue]?) {
        let historicalNameIsValid = historical?["filenameValid"] == .bool(true)
            && historical?["originalUTF16Count"]?.integer.map { (1...180).contains($0) } == true
        if let name = name?.string, !name.isEmpty, name == name.trimmingCharacters(in: .whitespacesAndNewlines),
           (historicalNameIsValid || MobileApplicationPolicy.manualResumeNameIsValid(name)), name.lowercased().hasSuffix(".pdf"), !name.hasPrefix(".") {
            resumeName = name
        } else { resumeName = nil }
        if let revision = revision?.integer, revision >= 0 { profileRevision = revision }
        else { profileRevision = nil }
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
        case "posting_closed" where statusCode == 409: detail = "The employer no longer lists this posting. No application was sent."
        case "uncertain": detail = "This application needs verification. It will not be sent again automatically."
        case "account_deleting": detail = "This hosted workspace is being deleted. New submissions are stopped. Open account management for its current status; your phone draft is kept."
        default: detail = message
        }
        throw MobileApplicationError(message: detail,
                                     statusCode: statusCode, code: code)
    }
}

// A read snapshot is a transport artifact, never an approval or a replacement for server evidence.
enum ApplicationReadWire {
    static let fragmentBytes = 4 * 1_024 * 1_024
    static let frameBytes = 6 * 1_024 * 1_024
    static let metadataBytes = 16 * 1_024
    static let assemblyBytes = 64 * 1_024 * 1_024 // Admission budget, not a historical-data maximum.
    static let kinds: Set<String> = ["workspace", "profile", "job", "plan", "plan-state", "receipts"]
    static func invalid(_ detail: String = "The recovery data could not be verified. Your earlier saved information is still here.") -> MobileApplicationError {
        MobileApplicationError(message: detail, code: "invalid_read_snapshot")
    }
    static func sha256(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
    static func exact(_ left: String, _ right: String) -> Bool { left.utf8.elementsEqual(right.utf8) }
    static func hash(_ value: String) -> Bool { value.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil }
    static func identifier(_ value: String, maximum: Int = 250) -> Bool {
        !value.isEmpty && value.utf16.count <= maximum && !value.unicodeScalars.contains { $0.value < 0x20 || $0.value == 0x7f }
    }
    static func workspaceID(_ value: String) -> Bool {
        value.range(of: "^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$", options: .regularExpression) != nil
    }
    static func cursor(_ value: String) -> Bool {
        value.utf8.count <= 2_048 && value.range(of: "^[-_A-Za-z0-9]+\\.[a-f0-9]{64}$", options: .regularExpression) != nil
    }
    static func date(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: value), formatter.string(from: date) == value else { return nil }
        return date
    }
    static func canonicalBase64(_ value: String) -> Data? {
        guard let data = Data(base64Encoded: value), data.base64EncodedString() == value else { return nil }
        return data
    }
    static func originalUnits(_ value: String) throws -> [UInt16] {
        guard let bytes = canonicalBase64(value), !bytes.isEmpty, bytes.count % 2 == 0 else { throw invalid() }
        let values = Array(bytes)
        return stride(from: 0, to: values.count, by: 2).map { UInt16(values[$0]) | UInt16(values[$0 + 1]) << 8 }
    }
    static func escapedDisplay(_ units: [UInt16]) -> (String, Bool) {
        var result = "", run: [UInt16] = [], malformed = false, index = 0
        func appendRun() { if !run.isEmpty { result += String(decoding: run, as: UTF16.self); run.removeAll(keepingCapacity: true) } }
        while index < units.count {
            let unit = units[index]
            if (0xd800...0xdbff).contains(unit), index + 1 < units.count, (0xdc00...0xdfff).contains(units[index + 1]) {
                run.append(unit); run.append(units[index + 1]); index += 2
            } else if (0xd800...0xdfff).contains(unit) {
                appendRun(); result += String(format: "\\u%04X", unit); malformed = true; index += 1
            } else { run.append(unit); index += 1 }
        }
        appendRun(); return (result, malformed)
    }
    static func originalFilenameValid(_ units: [UInt16]) -> Bool {
        let readable = String(decoding: units, as: UTF16.self)
        return !units.isEmpty && units.count <= 180 && units.first != 0x2e
            && !units.contains { $0 < 0x20 || $0 == 0x7f || [0x2f, 0x5c, 0x3a].contains($0) }
            && readable == readable.trimmingCharacters(in: .whitespacesAndNewlines)
            && readable.lowercased().hasSuffix(".pdf")
    }
    static func allowedLegacyPath(kind: String, path: [ApplicationReadPath]) -> Bool {
        func key(_ values: [ApplicationReadPath], _ offset: Int) -> String? {
            guard values.indices.contains(offset), case .key(let result) = values[offset] else { return nil }; return result
        }
        func index(_ values: [ApplicationReadPath], _ offset: Int) -> Bool {
            guard values.indices.contains(offset), case .index = values[offset] else { return false }; return true
        }
        func profile(_ p: [ApplicationReadPath]) -> Bool {
            (p.count == 1 && ["firstName", "lastName", "email", "phone", "city", "headline"].contains(key(p, 0) ?? ""))
                || (p.count == 2 && ["skills", "targetRoles"].contains(key(p, 0) ?? "") && index(p, 1))
                || (p.count == 2 && key(p, 0) == "resume" && key(p, 1) == "name")
        }
        func job(_ p: [ApplicationReadPath]) -> Bool {
            p.count == 1 && ["title", "company", "location", "sourceName", "summary", "reason"].contains(key(p, 0) ?? "")
        }
        func receipt(_ p: [ApplicationReadPath]) -> Bool {
            (p.count == 1 && ["title", "company", "resumeName", "applicationId", "requirementsRevision"].contains(key(p, 0) ?? ""))
                || (p.count == 2 && key(p, 0) == "error" && key(p, 1) == "message")
        }
        func plan(_ p: [ApplicationReadPath]) -> Bool {
            guard p.count >= 3, key(p, 0) == "items", index(p, 1) else { return false }
            let rest = Array(p.dropFirst(2))
            return (rest.count == 1 && ["title", "company", "reason", "applicationId", "requirementsRevision"].contains(key(rest, 0) ?? ""))
                || (rest.count == 2 && key(rest, 0) == "job" && job(Array(rest.dropFirst())))
                || (rest.count == 2 && key(rest, 0) == "payloadSummary" && ["name", "email", "phone", "comments"].contains(key(rest, 1) ?? ""))
                || (rest.count == 2 && key(rest, 0) == "resume" && key(rest, 1) == "name")
        }
        if kind == "workspace" {
            if key(path, 0) == "profile" { return profile(Array(path.dropFirst())) }
            if index(path, 1) {
                let rest = Array(path.dropFirst(2))
                if key(path, 0) == "jobs" { return job(rest) }
                if key(path, 0) == "attempts" { return receipt(rest) }
                if key(path, 0) == "recoverablePlans" { return plan(rest) }
            }
        }
        if kind == "profile", key(path, 0) == "profile" { return profile(Array(path.dropFirst())) }
        if kind == "job", key(path, 0) == "job" { return job(Array(path.dropFirst())) }
        if ["plan", "plan-state"].contains(kind), key(path, 0) == "plan" { return plan(Array(path.dropFirst())) }
        if kind == "plan-state", key(path, 0) == "attempts", index(path, 1) { return receipt(Array(path.dropFirst(2))) }
        if kind == "receipts", key(path, 0) == "receipts", index(path, 1) { return receipt(Array(path.dropFirst(2))) }
        return false
    }
    static func value(at path: [ApplicationReadPath], in root: ApplicationValue) -> ApplicationValue? {
        var current = root
        for part in path {
            switch part {
            case .key(let key): guard case .object(let fields) = current, let next = fields[key] else { return nil }; current = next
            case .index(let index): guard case .array(let items) = current, items.indices.contains(index) else { return nil }; current = items[index]
            }
        }
        return current
    }
    static func modifyObject(at path: [ApplicationReadPath], in root: inout ApplicationValue, _ change: (inout [String: ApplicationValue]) -> Void) {
        guard let first = path.first else { if case .object(var fields) = root { change(&fields); root = .object(fields) }; return }
        switch first {
        case .key(let key):
            guard case .object(var fields) = root, var child = fields[key] else { return }
            modifyObject(at: Array(path.dropFirst()), in: &child, change); fields[key] = child; root = .object(fields)
        case .index(let index):
            guard case .array(var items) = root, items.indices.contains(index) else { return }
            var child = items[index]; modifyObject(at: Array(path.dropFirst()), in: &child, change); items[index] = child; root = .array(items)
        }
    }
}

enum ApplicationReadPath: Codable, Hashable {
    case key(String), index(Int)
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let key = try? container.decode(String.self) { self = .key(key) }
        else if let index = try? container.decode(Int.self), index >= 0 { self = .index(index) }
        else { throw ApplicationReadWire.invalid() }
    }
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self { case .key(let key): try container.encode(key); case .index(let index): try container.encode(index) }
    }
    var key: String? { if case .key(let result) = self { return result }; return nil }
}

struct ApplicationLegacyText: Codable, Equatable {
    let path: [ApplicationReadPath]
    let utf16leBase64: String
    var originalUnits: [UInt16] { (try? ApplicationReadWire.originalUnits(utf16leBase64)) ?? [] }
    var display: String { ApplicationReadWire.escapedDisplay(originalUnits).0 }
    var repaired: String { String(decoding: originalUnits, as: UTF16.self) }
}

struct ApplicationReadMetadata: Codable, Equatable {
    let version: Int
    let kind: String
    let accountId: String
    let workspaceId: String
    let asOf: String
    let expiresAt: String
    let sha256: String
    let totalBytes: Int
    let offset: Int
    let byteLength: Int
    let nextCursor: String?
    let exportCursor: String
    init(_ value: [String: ApplicationValue]) throws {
        let keys: Set<String> = ["version", "kind", "accountId", "workspaceId", "asOf", "expiresAt", "sha256", "totalBytes", "offset", "byteLength", "nextCursor", "exportCursor"]
        guard Set(value.keys) == keys, value["version"]?.integer == 2,
              let kind = value["kind"]?.string, ApplicationReadWire.kinds.contains(kind),
              let account = value["accountId"]?.string, ApplicationReadWire.identifier(account),
              let workspace = value["workspaceId"]?.string, ApplicationReadWire.workspaceID(workspace),
              let asOf = value["asOf"]?.string, let start = ApplicationReadWire.date(asOf),
              let expiry = value["expiresAt"]?.string, let end = ApplicationReadWire.date(expiry), abs(end.timeIntervalSince(start) - 300) < 0.001,
              let hash = value["sha256"]?.string, ApplicationReadWire.hash(hash),
              let total = value["totalBytes"]?.integer, total > 0, total <= 9_007_199_254_740_991,
              let offset = value["offset"]?.integer, offset >= 0, offset < total, offset % ApplicationReadWire.fragmentBytes == 0,
              let length = value["byteLength"]?.integer, length == min(ApplicationReadWire.fragmentBytes, total - offset),
              let export = value["exportCursor"]?.string, ApplicationReadWire.cursor(export) else { throw ApplicationReadWire.invalid() }
        let next: String?
        if offset + length == total {
            guard value["nextCursor"] == .null else { throw ApplicationReadWire.invalid() }; next = nil
        } else {
            guard let cursor = value["nextCursor"]?.string, ApplicationReadWire.cursor(cursor) else { throw ApplicationReadWire.invalid() }; next = cursor
        }
        self.version = 2; self.kind = kind; accountId = account; workspaceId = workspace; self.asOf = asOf; expiresAt = expiry
        sha256 = hash; totalBytes = total; self.offset = offset; byteLength = length; nextCursor = next; exportCursor = export
    }
    func sameSnapshot(as other: Self) -> Bool {
        version == other.version && kind == other.kind && ApplicationReadWire.exact(accountId, other.accountId) && workspaceId == other.workspaceId
            && asOf == other.asOf && expiresAt == other.expiresAt && sha256 == other.sha256 && totalBytes == other.totalBytes
            && exportCursor == other.exportCursor
    }
}

struct ApplicationMutationIntent: Codable, Equatable {
    let journalID: String
    let route: String
    let workspaceId: String
    var valid: Bool {
        UUID(uuidString: journalID) != nil && ApplicationReadWire.workspaceID(workspaceId)
            && ["workspace", "profile", "jobs", "prepare", "submit", "advance", "stop", "session/revoke"].contains(route)
    }
}

struct ApplicationMutationAcknowledgement: Codable, Equatable {
    let journalID: String
    let kind: String
    let accountId: String
    let workspaceId: String
    let revision: Int?
    let jobId: String?
    let planId: String?
    let digest: String?
    let receivedAt: String
    init(_ value: [String: ApplicationValue], route: String, body: [String: ApplicationValue]?, journalID: String) throws {
        let expected = route
        let allowed: Set<String> = ["workspace", "profile", "jobs", "prepare", "submit", "advance", "stop", "session/revoke"]
        var keys: Set<String> = ["kind", "acknowledged", "accountId", "workspaceId"]
        if expected == "profile" { keys.insert("revision") }
        if expected == "jobs" { keys.insert("jobId") }
        if ["prepare", "submit", "advance", "stop"].contains(expected) { keys.formUnion(["planId", "digest"]) }
        guard allowed.contains(expected), Set(value.keys) == keys, value["kind"]?.string == expected,
              value["acknowledged"] == .bool(true), let account = value["accountId"]?.string, ApplicationReadWire.identifier(account),
              let workspace = value["workspaceId"]?.string, ApplicationReadWire.workspaceID(workspace) else { throw ApplicationReadWire.invalid() }
        let revision = value["revision"]?.integer, job = value["jobId"]?.string, plan = value["planId"]?.string, digest = value["digest"]?.string
        if expected == "profile" { guard let revision, revision >= 0, revision <= 9_007_199_254_740_991, body?["expectedRevision"]?.integer.map({ $0 < Int.max && revision == $0 + 1 }) ?? true else { throw ApplicationReadWire.invalid() } }
        if expected == "jobs" { guard let job, ApplicationReadWire.workspaceID(job) else { throw ApplicationReadWire.invalid() } }
        if ["prepare", "submit", "advance", "stop"].contains(expected) {
            guard let plan, ApplicationReadWire.workspaceID(plan), let digest, ApplicationReadWire.hash(digest) else { throw ApplicationReadWire.invalid() }
            if expected != "prepare" { guard body?["planId"]?.string == plan else { throw ApplicationReadWire.invalid() } }
            if expected == "submit" { guard body?["digest"]?.string == digest else { throw ApplicationReadWire.invalid() } }
        }
        self.journalID = journalID; kind = expected; accountId = account; workspaceId = workspace
        self.revision = revision; jobId = job; planId = plan; self.digest = digest
        receivedAt = ISO8601DateFormatter().string(from: Date())
    }
    var valid: Bool {
        guard UUID(uuidString: journalID) != nil, ApplicationReadWire.identifier(accountId), ApplicationReadWire.workspaceID(workspaceId),
              ISO8601DateFormatter().date(from: receivedAt) != nil,
              ["workspace", "profile", "jobs", "prepare", "submit", "advance", "stop", "session/revoke"].contains(kind) else { return false }
        if kind == "profile" { return revision.map { $0 >= 0 && $0 <= 9_007_199_254_740_991 } == true && jobId == nil && planId == nil && digest == nil }
        if kind == "jobs" { return jobId.map(ApplicationReadWire.workspaceID) == true && revision == nil && planId == nil && digest == nil }
        if ["prepare", "submit", "advance", "stop"].contains(kind) {
            return planId.map(ApplicationReadWire.workspaceID) == true && digest.map(ApplicationReadWire.hash) == true && revision == nil && jobId == nil
        }
        return revision == nil && jobId == nil && planId == nil && digest == nil
    }
}

final class ApplicationReadDocument {
    let file: URL
    let metadata: ApplicationReadMetadata?
    let kind: String
    let sha256: String
    let totalBytes: Int
    let mode: String
    let data: [String: ApplicationValue]
    let legacyText: [ApplicationLegacyText]
    let rawReason: String?
    private let ownsFile: Bool
    convenience init(file: URL, metadata: ApplicationReadMetadata, ownsFile: Bool = true) throws {
        try self.init(file: file, kind: metadata.kind, sha256: metadata.sha256, totalBytes: metadata.totalBytes, metadata: metadata, ownsFile: ownsFile)
    }
    init(file: URL, kind: String, sha256: String, totalBytes: Int, metadata: ApplicationReadMetadata? = nil, ownsFile: Bool = false) throws {
        self.file = file; self.kind = kind; self.sha256 = sha256; self.totalBytes = totalBytes
        self.metadata = metadata; self.ownsFile = ownsFile
        guard ApplicationReadWire.kinds.contains(kind), ApplicationReadWire.hash(sha256),
              totalBytes > 0, totalBytes <= ApplicationReadWire.assemblyBytes,
              (try FileManager.default.attributesOfItem(atPath: file.path)[.size] as? NSNumber)?.intValue == totalBytes else { throw ApplicationReadWire.invalid() }
        let bytes = try Data(contentsOf: file, options: .mappedIfSafe)
        guard bytes.count == totalBytes, ApplicationReadWire.sha256(bytes) == sha256,
              let root = try? JSONDecoder().decode([String: ApplicationValue].self, from: bytes), root["documentVersion"]?.integer == 1,
              let mode = root["mode"]?.string else { throw ApplicationReadWire.invalid() }
        self.mode = mode
        if mode == "raw-recovery" {
            guard Set(root.keys) == ["documentVersion", "mode", "reasonCode", "originalJSONBase64"],
                  let reason = root["reasonCode"]?.string, ["malformed_object_key", "malformed_url_or_control"].contains(reason),
                  let original = root["originalJSONBase64"]?.string, let raw = ApplicationReadWire.canonicalBase64(original), !raw.isEmpty else { throw ApplicationReadWire.invalid() }
            rawReason = reason; data = [:]; legacyText = []; return
        }
        guard mode == "view", Set(root.keys) == ["documentVersion", "mode", "data", "legacyText"],
              case .object(let data)? = root["data"], data["ok"] == .bool(true),
              case .array(let entries)? = root["legacyText"] else { throw ApplicationReadWire.invalid() }
        var legacy: [ApplicationLegacyText] = [], seen = Set<[ApplicationReadPath]>()
        for value in entries {
            guard case .object(let fields) = value, Set(fields.keys) == ["path", "utf16leBase64"],
                  let encoded = fields["utf16leBase64"]?.string,
                  let entry = try? JSONDecoder().decode(ApplicationLegacyText.self, from: JSONEncoder().encode(fields)),
                  ApplicationReadWire.allowedLegacyPath(kind: kind, path: entry.path), seen.insert(entry.path).inserted else { throw ApplicationReadWire.invalid() }
            let units = try ApplicationReadWire.originalUnits(encoded), display = ApplicationReadWire.escapedDisplay(units)
            guard display.1, let projected = ApplicationReadWire.value(at: entry.path, in: .object(data))?.string,
                  ApplicationReadWire.exact(projected, display.0) else { throw ApplicationReadWire.invalid() }
            legacy.append(entry)
        }
        self.data = data; legacyText = legacy; rawReason = nil
    }
    deinit { if ownsFile { try? FileManager.default.removeItem(at: file) } }
    var needsRecovery: Bool { mode != "view" || !legacyText.isEmpty }
    var profileEntries: [ApplicationLegacyText] { legacyText.filter { $0.path.first == .key("profile") } }
    func annotatedValue() -> [String: ApplicationValue] {
        var result: ApplicationValue = .object(data)
        for entry in legacyText {
            let path = entry.path
            var recordPath: [ApplicationReadPath] = [], itemPath: [ApplicationReadPath]?
            switch path.first {
            case .key("profile")?: recordPath = [.key("profile")]
            case .key("job")?: recordPath = [.key("job")]
            case .key("plan")?:
                recordPath = [.key("plan")]
                if path.count >= 3 { itemPath = Array(path.prefix(3)) }
            case .key("jobs")?, .key("attempts")?, .key("receipts")?: recordPath = Array(path.prefix(2))
            case .key("recoverablePlans")?:
                recordPath = Array(path.prefix(2))
                if path.count >= 4 { itemPath = Array(path.prefix(4)) }
            default: continue
            }
            let field = path.last?.key ?? "", originalCount = entry.originalUnits.count
            ApplicationReadWire.modifyObject(at: recordPath, in: &result) { fields in
                fields["_careerHistoricalText"] = .bool(true)
                fields["_careerRecoverySHA256"] = .string(sha256)
                if field == "applicationId" { fields["_careerHistoricalApplicationId"] = .bool(true) }
                if path.count == recordPath.count + 1 {
                    var lengths = fields["_careerOriginalLengths"]?.object ?? [:]
                    lengths[field] = .number(Double(originalCount)); fields["_careerOriginalLengths"] = .object(lengths)
                }
                if field == "resumeName" {
                    fields["_careerLegacyResumeName"] = .object(["originalUTF16Count": .number(Double(originalCount)), "filenameValid": .bool(ApplicationReadWire.originalFilenameValid(entry.originalUnits))])
                }
            }
            if let itemPath {
                ApplicationReadWire.modifyObject(at: itemPath, in: &result) { fields in
                    fields["_careerHistoricalText"] = .bool(true)
                    fields["_careerRecoverySHA256"] = .string(sha256)
                    if field == "applicationId" { fields["_careerHistoricalApplicationId"] = .bool(true) }
                    if path.count == itemPath.count + 1 {
                        var lengths = fields["_careerOriginalLengths"]?.object ?? [:]
                        lengths[field] = .number(Double(originalCount)); fields["_careerOriginalLengths"] = .object(lengths)
                    }
                    if Array(path.suffix(2)) == [.key("resume"), .key("name")] {
                        fields["_careerLegacyResumeName"] = .object(["originalUTF16Count": .number(Double(originalCount)), "filenameValid": .bool(ApplicationReadWire.originalFilenameValid(entry.originalUnits))])
                    }
                }
            }
        }
        return result.object
    }
}

struct ApplicationServiceResult {
    let value: [String: ApplicationValue]
    let document: ApplicationReadDocument?
    let operation: ApplicationMutationAcknowledgement?
    let intent: ApplicationMutationIntent?
    var mutationID: String? { operation?.journalID ?? intent?.journalID }
    subscript(_ key: String) -> ApplicationValue? { value[key] }
    init(value: [String: ApplicationValue], document: ApplicationReadDocument? = nil, operation: ApplicationMutationAcknowledgement? = nil, intent: ApplicationMutationIntent? = nil) {
        self.value = value; self.document = document; self.operation = operation; self.intent = intent
    }
}

struct ApplicationReadAfterMutationError: LocalizedError {
    let acknowledgement: ApplicationMutationAcknowledgement
    let cause: Error
    var errorDescription: String? {
        "The service acknowledged this change. Its complete updated view could not be loaded. Refresh to check the result; do not repeat the action."
    }
}

struct ApplicationRecoveryRequiredError: LocalizedError {
    let metadata: ApplicationReadMetadata
    let document: ApplicationReadDocument?
    var errorDescription: String? {
        "This historical workspace needs its complete recovery file. Your previous phone data is kept."
    }
}


@MainActor
protocol MobileApplicationServing: AnyObject {
    var origin: URL { get }
    var token: String? { get set }
    var expectedWorkspaceID: String? { get set }
    var acknowledgementObserver: ((ApplicationMutationAcknowledgement) throws -> Void)? { get set }
    var mutationIntentObserver: ((ApplicationMutationIntent) throws -> Void)? { get set }
    var mutationFinishedObserver: ((String) -> Void)? { get set }
    func response(_ route: String, method: String, body: [String: ApplicationValue]?) async throws -> ApplicationServiceResult
    func request(_ route: String, method: String, body: [String: ApplicationValue]?) async throws -> [String: ApplicationValue]
    func downloadRecovery(_ metadata: ApplicationReadMetadata, to file: URL) async throws
    func invalidate()
}

extension MobileApplicationServing {
    func downloadRecovery(_ metadata: ApplicationReadMetadata, to file: URL) async throws {
        throw MobileApplicationError(message: "This connection cannot download a complete recovery file.")
    }
    var expectedWorkspaceID: String? { get { nil } set {} }
    var acknowledgementObserver: ((ApplicationMutationAcknowledgement) throws -> Void)? { get { nil } set {} }
    var mutationIntentObserver: ((ApplicationMutationIntent) throws -> Void)? { get { nil } set {} }
    var mutationFinishedObserver: ((String) -> Void)? { get { nil } set {} }
    // Default arguments must forward through the full protocol requirement.
    // Calling the fallback implementation directly discards rich recovery metadata.
    func response(_ route: String, method: String = "GET") async throws -> ApplicationServiceResult {
        try await response(route, method: method, body: nil)
    }
    func response(_ route: String, method: String, body: [String: ApplicationValue]?) async throws -> ApplicationServiceResult {
        ApplicationServiceResult(value: try await request(route, method: method, body: body))
    }
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

#if DEBUG
/// A private, explicit acceptance transport. Production policy creates the request
/// first; only its transport origin and capability header may change here.
struct NativeJourneyTransport {
    private let origin: URL
    private let capability: String

    init(origin: URL, capability: String) throws {
        let environment = ProcessInfo.processInfo.environment
        guard ProcessInfo.processInfo.arguments.contains("-career-ui-acceptance"),
              environment["CAREER_UI_NATIVE_JOURNEY"] == "blank-profile",
              environment["CAREER_UI_TEST_ID"].flatMap(UUID.init(uuidString:)) != nil,
              let parts = URLComponents(url: origin, resolvingAgainstBaseURL: false),
              parts.scheme == "https", parts.host == "127.0.0.1", let port = parts.port,
              (1...65_535).contains(port), parts.user == nil, parts.password == nil,
              parts.query == nil, parts.fragment == nil, parts.path.isEmpty || parts.path == "/",
              capability.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
            throw MobileApplicationError(message: "The isolated native journey transport is unavailable.")
        }
        self.origin = origin
        self.capability = capability
    }

    func map(_ original: URLRequest, discovery: Bool) throws -> URLRequest {
        let allowed = discovery
            ? ["GET /api/discovery/sources", "GET /api/discovery/search"]
            : ["GET /api/apply/status", "GET /api/apply/workspace", "GET /api/apply/receipts",
               "GET /api/apply/read", "GET /api/apply/read-export",
               "PUT /api/apply/profile", "POST /api/apply/jobs", "POST /api/apply/prepare"]
        guard let url = original.url,
              let service = URLComponents(string: MobileApplicationPolicy.hostedServiceOrigin),
              var parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme == service.scheme, parts.host == service.host, parts.port == service.port,
              parts.user == nil, parts.password == nil, parts.fragment == nil,
              allowed.contains((original.httpMethod ?? "GET") + " " + parts.path),
              parts.path == "/api/discovery/search" || ["/api/apply/read", "/api/apply/read-export"].contains(parts.path) || parts.query == nil,
              original.value(forHTTPHeaderField: "x-native-journey-bridge") == nil,
              original.value(forHTTPHeaderField: "Cookie") == nil else {
            throw MobileApplicationError(message: "This action is unavailable in the isolated native journey.")
        }
        if ["/api/apply/read", "/api/apply/read-export"].contains(parts.path) {
            guard let query = parts.queryItems, query.count == 1, query[0].name == "cursor",
                  let cursor = query[0].value, ApplicationReadWire.cursor(cursor) else {
                throw MobileApplicationError(message: "This action is unavailable in the isolated native journey.")
            }
        }
        parts.scheme = origin.scheme; parts.host = origin.host; parts.port = origin.port
        guard let target = parts.url else {
            throw MobileApplicationError(message: "The isolated native journey address is unavailable.")
        }
        var request = original
        request.url = target
        request.setValue(capability, forHTTPHeaderField: "x-native-journey-bridge")
        return request
    }
}
#endif

@MainActor
final class MobileApplicationClient: MobileApplicationServing {
    let origin: URL
    var token: String? { didSet { if token != oldValue { transportGeneration = UUID(); verifiedAccountID = nil } } }
    var expectedWorkspaceID: String? { didSet { if expectedWorkspaceID != oldValue { transportGeneration = UUID() } } }
    var acknowledgementObserver: ((ApplicationMutationAcknowledgement) throws -> Void)?
    var mutationIntentObserver: ((ApplicationMutationIntent) throws -> Void)?
    var mutationFinishedObserver: ((String) -> Void)?
    private var transportGeneration = UUID()
    private var verifiedAccountID: String?
    private var invalidated = false
    private let session: URLSession
    private let recoverySession: URLSession
    #if DEBUG
    private var nativeJourneyTransport: NativeJourneyTransport?
    convenience init(nativeJourneyTransport: NativeJourneyTransport, token: String) throws {
        try self.init(origin: URL(string: MobileApplicationPolicy.hostedServiceOrigin)!, token: token)
        self.nativeJourneyTransport = nativeJourneyTransport
    }
    #endif
    init(origin: URL, token: String? = nil, configuration: URLSessionConfiguration? = nil) throws {
        guard let accepted = MobileApplicationPolicy.serviceURL(origin.absoluteString) else {
            throw MobileApplicationError(message: "The application service must use a secure HTTPS address.")
        }
        self.origin = accepted
        self.token = token
        let config = configuration ?? URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 25
        config.timeoutIntervalForResource = 40
        session = URLSession(configuration: config, delegate: ApplicationNoRedirect(), delegateQueue: nil)
        // A complete archive can exceed the bounded workspace view. Give only this
        // explicit read a longer total transfer window; normal mutations keep 40s.
        let recoveryConfig = URLSessionConfiguration.ephemeral
        recoveryConfig.protocolClasses = config.protocolClasses
        recoveryConfig.httpCookieStorage = nil
        recoveryConfig.urlCredentialStorage = nil
        recoveryConfig.urlCache = nil
        recoveryConfig.requestCachePolicy = .reloadIgnoringLocalCacheData
        recoveryConfig.timeoutIntervalForRequest = 25
        recoveryConfig.timeoutIntervalForResource = 600
        recoverySession = URLSession(configuration: recoveryConfig, delegate: ApplicationNoRedirect(), delegateQueue: nil)
    }
    deinit { session.invalidateAndCancel(); recoverySession.invalidateAndCancel() }
    func invalidate() {
        invalidated = true; transportGeneration = UUID()
        session.invalidateAndCancel(); recoverySession.invalidateAndCancel()
    }
    func request(_ route: String, method: String = "GET", body: [String: ApplicationValue]? = nil) async throws -> [String: ApplicationValue] {
        let result = try await response(route, method: method, body: body)
        if let document = result.document, document.needsRecovery, let metadata = document.metadata {
            throw ApplicationRecoveryRequiredError(metadata: metadata, document: document)
        }
        return result.value
    }
    private func responseBytes(_ request: URLRequest, maximum: Int, requireVersion2: Bool = false) async throws -> (Data, HTTPURLResponse) {
        #if canImport(FoundationNetworking)
        throw MobileApplicationError(message: "This device cannot load this saved information safely.")
        #else
        let (stream, response) = try await session.bytes(for: request)
        let task = stream.task
        defer { task.cancel() }
        guard let http = response as? HTTPURLResponse else { throw ApplicationReadWire.invalid() }
        let version = http.value(forHTTPHeaderField: "X-Career-Read-Version")
        guard version == nil || version == "2", !requireVersion2 || version == "2" else { throw ApplicationReadWire.invalid() }
        let byteLimit = version == "2" ? maximum : 12 * 1_024 * 1_024
        guard response.expectedContentLength <= Int64(byteLimit) else {
            throw ApplicationReadWire.invalid("There is too much information to load at once. Your earlier saved information is still here.")
        }
        return try await withTaskCancellationHandler(operation: {
            let data = try await Self.consumeBoundedBytes(stream, maximum: byteLimit,
                overflowMessage: "There is too much information to load at once. Your earlier saved information is still here.")
            return (data, http)
        }, onCancel: { task.cancel() })
        #endif
    }
    private func requestFor(_ route: String, method: String, body: [String: ApplicationValue]?, bearer: String?, cursor: String? = nil) throws -> URLRequest {
        var parts = URLComponents(url: origin.appendingPathComponent("api/apply").appendingPathComponent(route), resolvingAgainstBaseURL: false)!
        if let cursor {
            guard ["read", "read-export"].contains(route), method == "GET", body == nil, ApplicationReadWire.cursor(cursor) else { throw ApplicationReadWire.invalid() }
            parts.queryItems = [URLQueryItem(name: "cursor", value: cursor)]
        }
        guard let url = parts.url else { throw ApplicationReadWire.invalid() }
        var request = URLRequest(url: url); request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("2", forHTTPHeaderField: "X-Career-Read-Version")
        if let bearer { request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
        if let body { request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.httpBody = try JSONEncoder().encode(body) }
        #if DEBUG
        if let nativeJourneyTransport { request = try nativeJourneyTransport.map(request, discovery: false) }
        #endif
        return request
    }
    /// Explicit evidence download. It streams the exact document to a protected file without JSON materialization.
    func downloadRecovery(_ metadata: ApplicationReadMetadata, to file: URL) async throws {
        let generation = transportGeneration, bearer = token, workspace = expectedWorkspaceID
        guard workspace == metadata.workspaceId, verifiedAccountID.map({ ApplicationReadWire.exact($0, metadata.accountId) }) ?? true,
              !FileManager.default.fileExists(atPath: file.path) else { throw ApplicationReadWire.invalid() }
        try checkReadIdentity(generation, bearer: bearer, workspace: workspace)
        if let capacity = try? file.deletingLastPathComponent().resourceValues(forKeys: [.volumeAvailableCapacityKey]).volumeAvailableCapacity,
           metadata.totalBytes > capacity / 3 {
            throw MobileApplicationError(message: "Free more phone storage before exporting this complete historical recovery file.")
        }
        var request = try requestFor("read-export", method: "GET", body: nil, bearer: bearer, cursor: metadata.exportCursor)
        request.timeoutInterval = 25
        #if canImport(FoundationNetworking)
        throw MobileApplicationError(message: "This device cannot load this saved information safely.")
        #else
        let (stream, response) = try await recoverySession.bytes(for: request)
        let task = stream.task
        var completed = false
        defer { task.cancel(); if !completed { try? FileManager.default.removeItem(at: file) } }
        guard let http = response as? HTTPURLResponse else { throw ApplicationReadWire.invalid() }
        try await withTaskCancellationHandler(operation: {
            if http.statusCode != 200 {
                let failure = try await Self.consumeBoundedBytes(stream, maximum: ApplicationReadWire.frameBytes)
                _ = try MobileApplicationResponse.decode(failure, statusCode: http.statusCode)
                throw ApplicationReadWire.invalid()
            }
            guard http.value(forHTTPHeaderField: "X-Career-Read-Version") == "2",
                  http.value(forHTTPHeaderField: "Content-Type")?.lowercased().hasPrefix("application/json") == true,
                  http.value(forHTTPHeaderField: "X-Career-Read-SHA256") == metadata.sha256,
                  http.value(forHTTPHeaderField: "X-Career-Read-Bytes").flatMap(Int.init) == metadata.totalBytes,
                  http.value(forHTTPHeaderField: "X-Career-Read-Workspace-Id") == metadata.workspaceId,
                  http.value(forHTTPHeaderField: "X-Career-Read-Account-SHA256") == ApplicationReadWire.sha256(Data(metadata.accountId.utf8)),
                  response.expectedContentLength < 0 || response.expectedContentLength == Int64(metadata.totalBytes) else { throw ApplicationReadWire.invalid() }
            try checkReadIdentity(generation, bearer: bearer, workspace: workspace)
            #if os(iOS)
            let attributes: [FileAttributeKey: Any] = [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication, .posixPermissions: 0o600]
            #else
            let attributes: [FileAttributeKey: Any] = [.posixPermissions: 0o600]
            #endif
            guard FileManager.default.createFile(atPath: file.path, contents: nil, attributes: attributes) else { throw CocoaError(.fileWriteUnknown) }
            try await Self.consumeRecoveryBytes(stream, file: file, totalBytes: metadata.totalBytes,
                expectedSHA256: metadata.sha256) { [self] in
                    try checkReadIdentity(generation, bearer: bearer, workspace: workspace)
                }
            try checkReadIdentity(generation, bearer: bearer, workspace: workspace); try Task.checkCancellation()
            completed = true
        }, onCancel: { task.cancel() })
        #endif
    }

    #if !canImport(FoundationNetworking)
    // AsyncBytes advances once per byte. Keep this bounded work off MainActor;
    // request identity and published state remain owned by the client actor.
    nonisolated private static func consumeBoundedBytes(_ stream: URLSession.AsyncBytes, maximum: Int,
                                                        overflowMessage: String? = nil) async throws -> Data {
        var data = Data(); data.reserveCapacity(min(maximum, 64 * 1_024))
        for try await byte in stream {
            guard data.count < maximum else {
                if let overflowMessage { throw ApplicationReadWire.invalid(overflowMessage) }
                throw ApplicationReadWire.invalid()
            }
            data.append(byte)
            if data.count % (64 * 1_024) == 0 { try Task.checkCancellation(); await Task.yield() }
        }
        try Task.checkCancellation()
        return data
    }

    nonisolated private static func consumeRecoveryBytes(_ stream: URLSession.AsyncBytes, file: URL,
        totalBytes: Int, expectedSHA256: String,
        checkIdentity: @escaping @MainActor @Sendable () throws -> Void) async throws {
        try Task.checkCancellation(); try await checkIdentity()
        let handle = try FileHandle(forWritingTo: file); defer { try? handle.close() }
        var chunk = Data(), digest = SHA256(), count = 0
        chunk.reserveCapacity(64 * 1_024)
        for try await byte in stream {
            guard count < totalBytes else { throw ApplicationReadWire.invalid() }
            chunk.append(byte); count += 1
            if chunk.count == 64 * 1_024 {
                try Task.checkCancellation(); try await checkIdentity()
                try handle.write(contentsOf: chunk); digest.update(data: chunk); chunk.removeAll(keepingCapacity: true)
                await Task.yield()
            }
        }
        if !chunk.isEmpty {
            try Task.checkCancellation(); try await checkIdentity()
            try handle.write(contentsOf: chunk); digest.update(data: chunk)
        }
        guard count == totalBytes,
              digest.finalize().map({ String(format: "%02x", $0) }).joined() == expectedSHA256 else {
            throw ApplicationReadWire.invalid()
        }
        try handle.synchronize(); try Task.checkCancellation(); try await checkIdentity()
    }
    #endif

    private func checkReadIdentity(_ generation: UUID, bearer: String?, workspace: String?) throws {
        guard !invalidated, generation == transportGeneration, bearer == token, workspace == expectedWorkspaceID else { throw CancellationError() }
    }
    private func validateKind(_ kind: String, route: String) -> Bool {
        switch route {
        case "workspace": return kind == "workspace"
        case "profile": return kind == "profile"
        case "jobs": return kind == "job"
        case "prepare": return kind == "plan"
        case "submit", "advance", "stop": return kind == "plan-state"
        case "receipts": return kind == "receipts"
        default: return false
        }
    }
    func response(_ route: String, method: String = "GET", body: [String: ApplicationValue]? = nil) async throws -> ApplicationServiceResult {
        guard ["status", "session", "session/revoke", "workspace", "profile", "jobs", "prepare", "submit", "advance", "stop", "receipts"].contains(route) else {
            throw MobileApplicationError(message: "This application action is unavailable.")
        }
        guard method == "GET" || route == "session" || (acknowledgementObserver != nil && mutationIntentObserver != nil && mutationFinishedObserver != nil) else {
            throw MobileApplicationError(message: "The app could not check an earlier change. Reconnect and refresh before making another change.")
        }
        let generation = transportGeneration, bearer = token, workspace = expectedWorkspaceID, account = verifiedAccountID
        let observedAcknowledgement = acknowledgementObserver, observedIntent = mutationIntentObserver
        let finished = mutationFinishedObserver
        let original = try requestFor(route, method: method, body: body, bearer: bearer)
        let journalID = UUID().uuidString
        var intentRecorded = false
        defer { if intentRecorded { finished?(journalID) } }
        if method != "GET", route != "session" {
            try checkReadIdentity(generation, bearer: bearer, workspace: workspace); try Task.checkCancellation()
            guard let workspace else { throw ApplicationReadWire.invalid() }
            try observedIntent?(ApplicationMutationIntent(journalID: journalID, route: route, workspaceId: workspace))
            intentRecorded = true
        }
        var restarted = false
        while true {
            do {
                return try await readOnce(original, route: route, method: method, body: body, journalID: journalID,
                    generation: generation, bearer: bearer, workspace: workspace, account: account, observe: observedAcknowledgement)
            } catch {
                // A read-only retry starts a new snapshot. A mutation is never replayed, including its first response.
                if method == "GET", !restarted, let failure = error as? MobileApplicationError,
                   failure.statusCode == 409, ["snapshot_changed", "snapshot_expired"].contains(failure.code ?? "") {
                    try checkReadIdentity(generation, bearer: bearer, workspace: workspace)
                    try Task.checkCancellation(); restarted = true; continue
                }
                throw error
            }
        }
    }
    private func readOnce(_ original: URLRequest, route: String, method: String, body: [String: ApplicationValue]?, journalID: String,
                          generation: UUID, bearer: String?, workspace: String?, account: String?, observe: ((ApplicationMutationAcknowledgement) throws -> Void)?) async throws -> ApplicationServiceResult {
        try checkReadIdentity(generation, bearer: bearer, workspace: workspace)
        try Task.checkCancellation()
        var acknowledgement: ApplicationMutationAcknowledgement?
        var temporary: URL?
        var handle: FileHandle?
        defer { try? handle?.close(); if let temporary { try? FileManager.default.removeItem(at: temporary) } }
        do {
            let (bytes, http) = try await responseBytes(original, maximum: ApplicationReadWire.frameBytes)
            let envelope = try MobileApplicationResponse.decode(bytes, statusCode: http.statusCode)
            let version2 = http.value(forHTTPHeaderField: "X-Career-Read-Version") == "2"
            if envelope["read"] != nil || envelope["operation"] != nil { guard version2 else { throw ApplicationReadWire.invalid() } }
            if version2 {
                if method != "GET" { guard case .object? = envelope["operation"] else { throw ApplicationReadWire.invalid() } }
                else { guard envelope["operation"] == nil || envelope["operation"] == .null else { throw ApplicationReadWire.invalid() } }
            }
            if route == "session", envelope["read"] == .null, case .object(let operation)? = envelope["operation"] {
                let keys: Set<String> = ["kind", "acknowledged", "accountId", "workspaceId", "sessionToken", "expiresAt"]
                guard Set(envelope.keys) == ["ok", "read", "operation"], Set(operation.keys) == keys, operation["kind"]?.string == "session", operation["acknowledged"] == .bool(true),
                      let account = operation["accountId"]?.string, ApplicationReadWire.identifier(account),
                      let workspace = operation["workspaceId"]?.string, ApplicationReadWire.workspaceID(workspace),
                      let token = operation["sessionToken"]?.string, !token.isEmpty, ApplicationReadWire.hash(token),
                      let expiry = operation["expiresAt"]?.string, ApplicationReadWire.date(expiry) != nil else { throw ApplicationReadWire.invalid() }
                // Pairing credentials never enter a recovery document or operation journal.
                return ApplicationServiceResult(value: ["ok": .bool(true), "sessionToken": .string(token), "workspaceId": .string(workspace), "expiresAt": .string(expiry)])
            }
            if method != "GET", case .object(let operation)? = envelope["operation"] {
                let receipt = try ApplicationMutationAcknowledgement(operation, route: route, body: body, journalID: journalID)
                guard workspace == nil || receipt.workspaceId == workspace,
                      account.map({ ApplicationReadWire.exact($0, receipt.accountId) }) ?? true else { throw ApplicationReadWire.invalid() }
                acknowledgement = receipt
                // Synchronous durable observer runs even if the initiating UI/account generation has retired.
                // It must finish before any cancellation check or further awaited read.
                try observe?(receipt)
            }
            if envelope["read"] == .null {
                if let readError = envelope["readError"]?.object, let message = readError["message"]?.string {
                    guard Set(envelope.keys) == ["ok", "read", "operation", "readError"], Set(readError.keys) == ["code", "message"], readError["code"]?.string != nil else { throw ApplicationReadWire.invalid() }
                    throw MobileApplicationError(message: String(message.prefix(300)), code: readError["code"]?.string)
                }
                if route == "session/revoke", acknowledgement != nil, Set(envelope.keys) == ["ok", "read", "operation"] { return ApplicationServiceResult(value: ["ok": .bool(true)], operation: acknowledgement) }
                throw ApplicationReadWire.invalid()
            }
            guard case .object(let read)? = envelope["read"] else {
                // Older services still return ordinary bounded envelopes. This does not replay a request.
                guard envelope["operation"] == nil, envelope["readError"] == nil else { throw ApplicationReadWire.invalid() }
                try checkReadIdentity(generation, bearer: bearer, workspace: workspace)
                if method != "GET", route != "session", route != "session/revoke" {
                    if route == "profile" {
                        guard let expected = body?["expectedRevision"]?.integer, expected < Int.max,
                              envelope["profile"]?.object["revision"]?.integer == expected + 1 else { throw ApplicationReadWire.invalid() }
                    } else if route == "jobs" {
                        guard let url = envelope["job"]?.object["url"]?.string, let requested = body?["url"]?.string,
                              MobileApplicationPolicy.jobIdentity(url) == MobileApplicationPolicy.jobIdentity(requested) else { throw ApplicationReadWire.invalid() }
                    } else {
                        let plan = envelope["plan"]?.object ?? [:]
                        guard let id = plan["id"]?.string, ApplicationReadWire.workspaceID(id),
                              let digest = plan["digest"]?.string, ApplicationReadWire.hash(digest),
                              route == "prepare" || id == body?["planId"]?.string,
                              route != "submit" || digest == body?["digest"]?.string else { throw ApplicationReadWire.invalid() }
                    }
                }
                let intent = method != "GET" && route != "session" ? workspace.map { ApplicationMutationIntent(journalID: journalID, route: route, workspaceId: $0) } : nil
                return ApplicationServiceResult(value: envelope, intent: intent)
            }
            let first = try ApplicationReadMetadata(read)
            guard first.offset == 0, validateKind(first.kind, route: route), workspace == nil || first.workspaceId == workspace,
                  account.map({ ApplicationReadWire.exact($0, first.accountId) }) ?? true,
                  acknowledgement == nil || (acknowledgement.map({ ApplicationReadWire.exact($0.accountId, first.accountId) && $0.workspaceId == first.workspaceId }) == true) else { throw ApplicationReadWire.invalid() }
            try checkReadIdentity(generation, bearer: bearer, workspace: workspace)
            guard first.totalBytes <= ApplicationReadWire.assemblyBytes else { throw ApplicationRecoveryRequiredError(metadata: first, document: nil) }
            let target = FileManager.default.temporaryDirectory.appendingPathComponent("career-read-" + UUID().uuidString + ".json")
            #if os(iOS)
            let attributes: [FileAttributeKey: Any] = [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication, .posixPermissions: 0o600]
            #else
            let attributes: [FileAttributeKey: Any] = [.posixPermissions: 0o600]
            #endif
            guard FileManager.default.createFile(atPath: target.path, contents: nil, attributes: attributes) else { throw CocoaError(.fileWriteUnknown) }
            temporary = target; handle = try FileHandle(forWritingTo: target)
            var frame = first, value = envelope, offset = 0, pages = 0, digest = SHA256(), usedCursors = Set<String>()
            while true {
                try checkReadIdentity(generation, bearer: bearer, workspace: workspace)
                try Task.checkCancellation()
                guard Set(value.keys) == ["ok", "read", "payloadBase64", "operation"], frame.sameSnapshot(as: first), frame.offset == offset, pages < 16,
                      let encoded = value["payloadBase64"]?.string, encoded.utf8.count <= ((ApplicationReadWire.fragmentBytes + 2) / 3) * 4,
                      let fragment = ApplicationReadWire.canonicalBase64(encoded), fragment.count == frame.byteLength,
                      offset <= first.totalBytes - fragment.count else { throw ApplicationReadWire.invalid() }
                var metadataOnly = value; metadataOnly["payloadBase64"] = .string("")
                guard try JSONEncoder().encode(metadataOnly).count <= ApplicationReadWire.metadataBytes else { throw ApplicationReadWire.invalid() }
                try handle?.write(contentsOf: fragment); digest.update(data: fragment); offset += fragment.count; pages += 1
                guard let cursor = frame.nextCursor else { break }
                guard usedCursors.insert(cursor).inserted else { throw ApplicationReadWire.invalid() }
                let next = try requestFor("read", method: "GET", body: nil, bearer: bearer, cursor: cursor)
                let (nextBytes, nextHTTP) = try await responseBytes(next, maximum: ApplicationReadWire.frameBytes, requireVersion2: true)
                value = try MobileApplicationResponse.decode(nextBytes, statusCode: nextHTTP.statusCode)
                guard value["operation"] == .null || value["operation"] == nil, case .object(let fields)? = value["read"] else { throw ApplicationReadWire.invalid() }
                frame = try ApplicationReadMetadata(fields)
            }
            let observedHash = digest.finalize().map { String(format: "%02x", $0) }.joined()
            guard offset == first.totalBytes, observedHash == first.sha256 else { throw ApplicationReadWire.invalid() }
            try handle?.synchronize(); try handle?.close(); handle = nil
            let document = try ApplicationReadDocument(file: target, metadata: first)
            temporary = nil
            try checkReadIdentity(generation, bearer: bearer, workspace: workspace); try Task.checkCancellation()
            if document.mode == "raw-recovery" { throw ApplicationRecoveryRequiredError(metadata: first, document: document) }
            let logical = document.annotatedValue()
            if first.kind == "workspace" { guard logical["workspaceId"]?.string == first.workspaceId else { throw ApplicationReadWire.invalid() } }
            verifiedAccountID = first.accountId
            return ApplicationServiceResult(value: logical, document: document, operation: acknowledgement)
        } catch {
            if let acknowledgement { throw ApplicationReadAfterMutationError(acknowledgement: acknowledgement, cause: error) }
            throw error
        }
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
    var targetRoleShortcuts: [String] {
        var seen = Set<String>()
        return MobileApplicationPolicy.profileListItems(targetRoles).filter { seen.insert($0).inserted }
    }
    private func words(_ text: String) -> [ApplicationValue] {
        MobileApplicationPolicy.profileListItems(text).map(ApplicationValue.string)
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
