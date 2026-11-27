import Foundation
import CryptoKit
import Darwin

/// Diagnostic milestones are retained separately from the one final result JSON.
private enum RecoveryProgress {
    static let lock = NSLock()
    static var file: URL?
    static var startedAt: TimeInterval = 0
    static var events: [[String: Any]] = []
    static func configure(root: URL) throws {
        lock.lock(); defer { lock.unlock() }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        file = root.appendingPathComponent("recovery-progress.json")
        startedAt = ProcessInfo.processInfo.systemUptime
    }
    static func record(_ stage: String, _ details: [String: String] = [:]) {
        lock.lock(); defer { lock.unlock() }
        guard let file else { return }
        events.append(["sequence": events.count + 1, "stage": stage,
            "elapsedSeconds": ProcessInfo.processInfo.systemUptime - startedAt,
            "mainThread": Thread.isMainThread, "details": details])
        do {
            try JSONSerialization.data(withJSONObject: events, options: [.sortedKeys]).write(to: file, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        } catch {
            fputs("Recovery progress could not be retained: \(error)\n", stderr); exit(1)
        }
    }
}

/// Every URL is intercepted; this check has no usable external transport.
private final class RecoveryProtocol: URLProtocol {
    struct Reply {
        var status = 200
        var headers = ["X-Career-Read-Version": "2", "Content-Type": "application/json"]
        var data: Data
        var chunkSize = 64 * 1_024
        var chunkDelay: TimeInterval = 0
        var pauseAfterFirstChunk = false
    }
    static let lock = NSLock()
    static var handler: ((URLRequest) throws -> Reply)?
    static var requests: [URLRequest] = []
    static var stops = 0
    private let stateLock = NSLock()
    private var stopped = false
    private var pending: DispatchWorkItem?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            Self.lock.lock(); Self.requests.append(request); let handler = Self.handler; Self.lock.unlock()
            guard let handler else { throw URLError(.unsupportedURL) }
            RecoveryProgress.record("protocol.request", ["path": request.url!.path, "method": request.httpMethod ?? "GET"])
            let reply = try handler(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: "HTTP/1.1", headerFields: reply.headers)!
            RecoveryProgress.record("protocol.response.ready", ["bytes": String(reply.data.count)])
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            if reply.chunkDelay == 0 && !reply.pauseAfterFirstChunk {
                var offset = 0
                while offset < reply.data.count {
                    let end = min(offset + reply.chunkSize, reply.data.count)
                    client?.urlProtocol(self, didLoad: reply.data.subdata(in: offset..<end)); offset = end
                }
                client?.urlProtocolDidFinishLoading(self)
                RecoveryProgress.record("protocol.body.delivered", ["bytes": String(reply.data.count)])
            } else {
                deliver(reply, offset: 0)
            }
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    private func deliver(_ reply: Reply, offset: Int) {
        stateLock.lock()
        guard !stopped else { stateLock.unlock(); return }
        stateLock.unlock()
        let end = min(offset + reply.chunkSize, reply.data.count)
        client?.urlProtocol(self, didLoad: reply.data.subdata(in: offset..<end))
        if end == reply.data.count { client?.urlProtocolDidFinishLoading(self); return }
        if reply.pauseAfterFirstChunk { return }
        let work = DispatchWorkItem { [weak self] in self?.deliver(reply, offset: end) }
        stateLock.lock()
        guard !stopped else { stateLock.unlock(); work.cancel(); return }
        pending = work
        stateLock.unlock()
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + reply.chunkDelay, execute: work)
    }
    override func stopLoading() {
        stateLock.lock(); stopped = true; pending?.cancel(); pending = nil; stateLock.unlock()
        Self.lock.lock(); Self.stops += 1; Self.lock.unlock()
    }
    static func install(_ value: @escaping (URLRequest) throws -> Reply) {
        lock.lock(); requests = []; stops = 0; handler = value; lock.unlock()
    }
    static func captured() -> [URLRequest] { lock.lock(); defer { lock.unlock() }; return requests }
    static func stopCount() -> Int { lock.lock(); defer { lock.unlock() }; return stops }
}

@MainActor private final class RecoveryTokens: ApplicationTokenStore {
    var values: [String: String] = [:]
    func load(account: String) throws -> String? { values[account] }
    func save(_ token: String, account: String) throws { values[account] = token }
    func remove(account: String) throws { values.removeValue(forKey: account) }
}

@MainActor private final class RecoveryService: MobileApplicationServing {
    let origin = URL(string: "https://service.example.com")!
    var token: String?
    var expectedWorkspaceID: String?
    var acknowledgementObserver: ((ApplicationMutationAcknowledgement) throws -> Void)?
    var mutationIntentObserver: ((ApplicationMutationIntent) throws -> Void)?
    var mutationFinishedObserver: ((String) -> Void)?
    var calls: [String] = []
    var handle: (String, String, [String: ApplicationValue]?) async throws -> ApplicationServiceResult = { _, _, _ in throw URLError(.unsupportedURL) }
    func response(_ route: String, method: String, body: [String: ApplicationValue]?) async throws -> ApplicationServiceResult {
        calls.append(method + " " + route); return try await handle(route, method, body)
    }
    func request(_ route: String, method: String, body: [String: ApplicationValue]?) async throws -> [String: ApplicationValue] {
        try await response(route, method: method, body: body).value
    }
    func invalidate() {}
}

@MainActor private final class RecoverySuite {
    let root: URL
    let fixtures: URL
    var count = 0
    var scenarios: [String] = []
    var recoveryTransfers: [[String: Any]] = []
    nonisolated let workspace = "11111111-1111-4111-8111-111111111111"
    nonisolated let account = "synthetic-account"
    nonisolated let planID = "22222222-2222-4222-8222-222222222222"
    nonisolated let jobID = "33333333-3333-4333-8333-333333333333"
    nonisolated let asOf = "2026-11-23T00:00:00.000Z"
    init(root: URL, fixtures: URL) { self.root = root; self.fixtures = fixtures }
    func check(_ value: Bool, _ message: String) throws {
        guard value else { throw MobileApplicationError(message: "FAILED: " + message) }; count += 1
    }
    func failing(_ name: String, _ body: () throws -> Void) throws {
        do { try body() } catch { count += 1; return }
        throw MobileApplicationError(message: "FAILED: " + name)
    }
    func failingAsync(_ name: String, _ body: () async throws -> Void) async throws {
        do { try await body() } catch { count += 1; return }
        throw MobileApplicationError(message: "FAILED: " + name)
    }
    func folder(_ name: String) throws -> URL {
        let file = root.appendingPathComponent(name + "-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: file, withIntermediateDirectories: true); return file
    }
    nonisolated func encode(_ value: [String: ApplicationValue]) throws -> Data {
        let encoder = JSONEncoder(); encoder.outputFormatting = .sortedKeys; return try encoder.encode(value)
    }
    func units(_ values: [UInt16]) -> String {
        Data(values.flatMap { [UInt8($0 & 255), UInt8($0 >> 8)] }).base64EncodedString()
    }
    func profile(revision: Int = 1) -> [String: ApplicationValue] {
        var value = PhoneApplicationProfile(); value.firstName = "Synthetic"; value.lastName = "Applicant"
        value.email = "synthetic@example.invalid"; value.country = "SA"
        var data = value.payload(includeLinkedIn: true); data["resume"] = .null; data["revision"] = .number(Double(revision)); return data
    }
    func workspaceValue(profile p: [String: ApplicationValue]? = nil) -> [String: ApplicationValue] {
        ["ok": .bool(true), "workspaceId": .string(workspace), "profile": .object(p ?? profile()), "mode": .string("test"),
         "jobs": .array([]), "attempts": .array([]), "recoverablePlans": .array([]), "activePlanIds": .array([]),
         "capabilities": .object(["linkedinProfile": .bool(true), "liveEnabled": .bool(false), "dispatchContinuation": .string("client")])]
    }
    func documentBytes(_ value: [String: ApplicationValue], legacy: [ApplicationLegacyText] = []) throws -> Data {
        let sidecar = try JSONDecoder().decode(ApplicationValue.self, from: JSONEncoder().encode(legacy))
        return try encode(["documentVersion": .number(1), "mode": .string("view"), "data": .object(value), "legacyText": sidecar])
    }
    nonisolated func cursor(_ offset: Int) -> String { "offset_" + String(offset) + "." + String(repeating: "a", count: 64) }
    nonisolated func metadata(_ bytes: Data, kind: String, workspaceID: String? = nil, offset: Int = 0, accountID: String? = nil) -> [String: ApplicationValue] {
        let size = min(ApplicationReadWire.fragmentBytes, bytes.count - offset)
        return ["version": .number(2), "kind": .string(kind), "accountId": .string(accountID ?? account),
            "workspaceId": .string(workspaceID ?? workspace), "asOf": .string(asOf), "expiresAt": .string("2026-11-23T00:05:00.000Z"),
            "sha256": .string(ApplicationReadWire.sha256(bytes)), "totalBytes": .number(Double(bytes.count)), "offset": .number(Double(offset)),
            "byteLength": .number(Double(size)), "nextCursor": offset + size == bytes.count ? .null : .string(cursor(offset + size)),
            "exportCursor": .string(cursor(0))]
    }
    nonisolated func frame(_ bytes: Data, kind: String = "workspace", workspaceID: String? = nil, offset: Int = 0,
               operation: ApplicationValue = .null, accountID: String? = nil) throws -> Data {
        let end = min(bytes.count, offset + ApplicationReadWire.fragmentBytes)
        return try encode(["ok": .bool(true), "read": .object(metadata(bytes, kind: kind, workspaceID: workspaceID, offset: offset, accountID: accountID)),
                           "payloadBase64": .string(bytes.subdata(in: offset..<end).base64EncodedString()), "operation": operation])
    }
    func document(_ bytes: Data, kind: String = "workspace", workspaceID: String? = nil) throws -> ApplicationReadDocument {
        let file = root.appendingPathComponent("read-" + UUID().uuidString + ".json"); try bytes.write(to: file)
        return try ApplicationReadDocument(file: file, metadata: ApplicationReadMetadata(metadata(bytes, kind: kind, workspaceID: workspaceID)), ownsFile: false)
    }
    func client(workspaceID: String? = nil) throws -> MobileApplicationClient {
        let configuration = URLSessionConfiguration.ephemeral; configuration.protocolClasses = [RecoveryProtocol.self]
        let client = try MobileApplicationClient(origin: URL(string: "https://service.example.com")!, token: String(repeating: "b", count: 64), configuration: configuration)
        client.expectedWorkspaceID = workspaceID ?? workspace; return client
    }
    func acknowledge(_ revision: Int = 2, id: String? = nil) throws -> ApplicationMutationAcknowledgement {
        let value: [String: ApplicationValue] = ["kind": .string("profile"), "acknowledged": .bool(true), "accountId": .string(account),
            "workspaceId": .string(workspace), "revision": .number(Double(revision))]
        return try ApplicationMutationAcknowledgement(value, route: "profile", body: ["expectedRevision": .number(Double(revision - 1))], journalID: id ?? UUID().uuidString)
    }
    func operation(_ revision: Int = 2) -> ApplicationValue {
        .object(["kind": .string("profile"), "acknowledged": .bool(true), "accountId": .string(account), "workspaceId": .string(workspace), "revision": .number(Double(revision))])
    }
    func initialState() throws -> PhoneApplicationState {
        var state = PhoneApplicationState(); state.serviceAddress = "https://service.example.com"; state.workspaceID = workspace
        state.connectionEnabled = true; state.credentialAccount = "synthetic-credential"; state.acknowledge(try ApplicationServerProfile(profile())); return state
    }
    func store(_ service: RecoveryService, directory: URL) throws -> (NativeApplicationsStore, RecoveryTokens) {
        let state = try initialState(); try JSONEncoder().encode(state).write(to: directory.appendingPathComponent("phone-draft.json"))
        let tokens = RecoveryTokens(); tokens.values[state.tokenAccount] = String(repeating: "b", count: 64)
        let store = NativeApplicationsStore(folder: directory, credentials: tokens, clientFactory: { _, token in service.token = token; return service })
        return (store, tokens)
    }

    func codecAndEvidence() throws {
        scenarios.append("lossless sidecar validation, original filename length and unverified historical receipt")
        let nameUnits = Array(repeating: UInt16(0xd800), count: 176) + Array(".pdf".utf16)
        let name = ApplicationReadWire.escapedDisplay(nameUnits).0
        let legacyName = ApplicationLegacyText(path: [.key("attempts"), .index(0), .key("resumeName")], utf16leBase64: units(nameUnits))
        let legacyID = ApplicationLegacyText(path: [.key("attempts"), .index(0), .key("applicationId")], utf16leBase64: units([0xd800]))
        let legacyFirst = ApplicationLegacyText(path: [.key("profile"), .key("firstName")], utf16leBase64: units([0x65, 0x301, 0xd800]))
        var p = profile(); p["firstName"] = .string(legacyFirst.display)
        var value = workspaceValue(profile: p)
        value["attempts"] = .array([.object(["id": .string("attempt-synthetic"), "state": .string("confirmed"), "provider": .string("lever"), "mode": .string("test"), "evidenceMode": .string("test"), "applicationId": .string(legacyID.display), "resumeName": .string(name), "profileRevision": .number(1), "title": .string("Synthetic role"), "company": .string("Synthetic employer")])])
        let bytes = try documentBytes(value, legacy: [legacyFirst, legacyName, legacyID]); let doc = try document(bytes)
        let annotated = doc.annotatedValue(), attempt = annotated["attempts"]!.array[0].object
        try check(doc.legacyText.count == 3 && doc.data["profile"]!.object["firstName"]!.string!.utf16.elementsEqual([0x65, 0x301, 0x5c, 0x75, 0x44, 0x38, 0x30, 0x30]), "decomposed display spelling preserved exactly")
        try check(name.utf16.count > 180 && ApplicationCVDetails(attempt: attempt).resumeName == name, "historical filename validates its original 180 units")
        try check(!MobileApplicationPolicy.isVerified(attempt) && MobileApplicationPolicy.displayState(attempt) == "uncertain", "projected application ID never creates verified evidence")
        try check(PhoneApplicationHistoryEntry(projecting: attempt) != nil, "bounded display cache accepts original filename length metadata")
        let directory = try folder("evidence"); let reference = PhoneRecoveryReference(origin: "https://service.example.com", metadata: doc.metadata!)
        try PhoneRecoveryStorage.retain(reference, file: doc.file, in: directory)
        let restored = try reference.document(in: directory)
        try check(restored.legacyText == doc.legacyText && restored.sha256 == doc.sha256, "protected reference reopens exact sidecar and hash")
        let exported = try PhoneRecoveryStorage.export(reference, in: directory)
        let envelope = try JSONDecoder().decode([String: ApplicationValue].self, from: Data(contentsOf: exported))
        try check(envelope["format"]?.string == "career-finder-raw-recovery" && Data(base64Encoded: envelope["documentBase64"]!.string!) == bytes, "self-contained raw export retains exact complete document")
        try check(Set(envelope.keys) == ["format", "version", "exportedAt", "source", "documentBase64"], "export has no token or cursor")
        try failing("ordinary portable import rejects evidence export") { _ = try NativeApplicationsStore.readWorkspaceBackup(at: exported) }
        var wrong = value; var wrongProfile = p; wrongProfile["firstName"] = .string("é\\uD800"); wrong["profile"] = .object(wrongProfile)
        try failing("canonically equivalent NFC display is not exact source spelling") { _ = try document(documentBytes(wrong, legacy: [legacyFirst, legacyName, legacyID])) }
        try failing("duplicate sidecar path rejected") { _ = try document(documentBytes(value, legacy: [legacyFirst, legacyFirst, legacyName, legacyID])) }
        let forbidden = ApplicationLegacyText(path: [.key("profile"), .key("website")], utf16leBase64: units([0xd800]))
        var unsafe = workspaceValue(); var unsafeProfile = profile(); unsafeProfile["website"] = .string(forbidden.display); unsafe["profile"] = .object(unsafeProfile)
        try failing("URL fields cannot be projected") { _ = try document(documentBytes(unsafe, legacy: [forbidden])) }
        try Data("corrupt".utf8).write(to: directory.appendingPathComponent(reference.documentFileName))
        try failing("corrupt protected document cannot be reopened") { _ = try reference.document(in: directory) }
        try failing("corrupt protected document cannot be exported") { _ = try PhoneRecoveryStorage.export(reference, in: directory) }
    }

    func rawFallbackAndBudget() throws {
        scenarios.append("raw malformed-key evidence and honest admission budget")
        let original = Data(#"{"ok":true,"\ud800":"raw key"}"#.utf8)
        let raw = try encode(["documentVersion": .number(1), "mode": .string("raw-recovery"), "reasonCode": .string("malformed_object_key"), "originalJSONBase64": .string(original.base64EncodedString())])
        let doc = try document(raw)
        try check(doc.mode == "raw-recovery" && doc.data.isEmpty && doc.needsRecovery, "raw key data is evidence only")
        var bad = metadata(raw, kind: "workspace"); bad["totalBytes"] = .number(Double(ApplicationReadWire.assemblyBytes + 1))
        bad["byteLength"] = .number(Double(ApplicationReadWire.fragmentBytes)); bad["nextCursor"] = .string(cursor(ApplicationReadWire.fragmentBytes))
        let admitted = try ApplicationReadMetadata(bad)
        try check(admitted.totalBytes > ApplicationReadWire.assemblyBytes, "metadata can describe a complete export beyond the in-memory admission budget")
        var unsafeAck = operation().object; unsafeAck["revision"] = .number(9_007_199_254_740_992)
        try failing("profile acknowledgment revision is a safe JavaScript integer") {
            _ = try ApplicationMutationAcknowledgement(unsafeAck, route: "profile", body: nil, journalID: UUID().uuidString)
        }
        var date = metadata(raw, kind: "workspace"); date["asOf"] = .string("2026-11-23T00:00:00Z")
        try failing("snapshot dates must use canonical milliseconds") { _ = try ApplicationReadMetadata(date) }
    }

    func transportAndLargeFixtures() async throws {
        scenarios.append("actual byte-stream transport reads retained backend fixtures atomically")
        for name in ["valid_unicode", "surrogate", "legacy_url"] {
            RecoveryProgress.record("fixture.begin", ["fixture": name])
            let bytes = try Data(contentsOf: fixtures.appendingPathComponent(name + "-recovery.json"))
            RecoveryProgress.record("fixture.bytes.loaded", ["fixture": name, "bytes": String(bytes.count)])
            let logical = try JSONDecoder().decode([String: ApplicationValue].self, from: bytes)["data"]!.object
            RecoveryProgress.record("fixture.logical.decoded", ["fixture": name])
            let workspaceID = logical["workspaceId"]!.string!
            RecoveryProtocol.install { request in
                guard request.value(forHTTPHeaderField: "X-Career-Read-Version") == "2", request.httpMethod == "GET" else { throw URLError(.unsupportedURL) }
                let offset: Int
                if request.url!.path == "/api/apply/workspace" { offset = 0 }
                else {
                    guard request.url!.path == "/api/apply/read", let value = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?.first?.value,
                          let parsed = Int(value.split(separator: ".")[0].dropFirst(7)) else { throw URLError(.unsupportedURL) }
                    offset = parsed
                }
                RecoveryProgress.record("fixture.frame.encode.begin", ["fixture": name, "offset": String(offset)])
                let frame = try self.frame(bytes, workspaceID: workspaceID, offset: offset)
                RecoveryProgress.record("fixture.frame.encode.end", ["fixture": name, "offset": String(offset), "bytes": String(frame.count)])
                return RecoveryProtocol.Reply(data: frame)
            }
            let transport = try client(workspaceID: workspaceID); defer { transport.invalidate() }
            RecoveryProgress.record("fixture.response.await", ["fixture": name])
            let result = try await transport.response("workspace")
            RecoveryProgress.record("fixture.response.returned", ["fixture": name])
            let snapshot = try ApplicationWorkspaceSnapshot(result.value, workspaceID: workspaceID)
            RecoveryProgress.record("fixture.snapshot.validated", ["fixture": name])
            try check(snapshot.jobs.count == 200 && snapshot.attempts.count == 500 && snapshot.recoverablePlans.count == 20, name + " full cardinality")
            try check(result.document?.sha256 == ApplicationReadWire.sha256(bytes) && result.document?.totalBytes == bytes.count, name + " complete hash and byte count")
            try check(RecoveryProtocol.captured().count == (bytes.count + ApplicationReadWire.fragmentBytes - 1) / ApplicationReadWire.fragmentBytes, name + " exact bounded pages")
            if name == "legacy_url" {
                let website = logical["profile"]!.object["website"]!.string!
                try check(bytes.count > 12 * 1_024 * 1_024 && website.utf16.count == 18_272, "full legacy URL capacity fixture exceeds the old cap")
                try check(snapshot.profile.profile.website.utf16.elementsEqual(website.utf16), "full legacy profile preserves exact URL code units")
                try check(result.document?.data == logical && result.document?.legacyText.isEmpty == true, "well-formed legacy snapshot needs no text projection")
                try check(snapshot.recoverablePlans.map { $0["digest"] } == logical["recoverablePlans"]!.array.map { $0.object["digest"] }, "legacy URL plan digests remain unchanged")
            }
            if name == "surrogate" {
                try check(bytes.count > 12 * 1_024 * 1_024 && result.document?.legacyText.count == 5_316, "original over-limit malformed fixture retained completely")
                try check(snapshot.attempts.allSatisfy { !MobileApplicationPolicy.isVerified($0) || $0["_careerHistoricalApplicationId"] == nil }, "historical IDs do not become verified through display")
                let originalDigests = logical["recoverablePlans"]!.array.map { $0.object["digest"] }
                try check(snapshot.recoverablePlans.map { $0["digest"] } == originalDigests, "immutable plan digests are unchanged")
            }
        }
    }

    func headersIdentityAndRetry() async throws {
        scenarios.append("version headers, snapshot identity and GET-only restart")
        var value = workspaceValue(); value["padding"] = .string(String(repeating: "x", count: 4 * 1_024 * 1_024 + 100))
        let bytes = try documentBytes(value), first = try frame(bytes), tail = try frame(bytes, offset: ApplicationReadWire.fragmentBytes)
        var starts = 0
        RecoveryProtocol.install { request in
            if request.url!.path.hasSuffix("/workspace") { starts += 1; return RecoveryProtocol.Reply(data: first) }
            if starts == 1 { return RecoveryProtocol.Reply(status: 409, data: try self.encode(["ok": .bool(false), "error": .object(["code": .string("snapshot_changed"), "message": .string("changed")])])) }
            return RecoveryProtocol.Reply(data: tail)
        }
        let retry = try client(); _ = try await retry.response("workspace"); retry.invalidate()
        try check(starts == 2 && RecoveryProtocol.captured().count == 4, "one full GET restart, never partial publication")
        RecoveryProtocol.install { request in
            if request.url!.path.hasSuffix("/workspace") { return RecoveryProtocol.Reply(data: first) }
            return RecoveryProtocol.Reply(data: try self.frame(bytes, offset: ApplicationReadWire.fragmentBytes, accountID: "different-account"))
        }
        let mismatch = try client(); defer { mismatch.invalidate() }
        try await failingAsync("mixed account fragments rejected") { _ = try await mismatch.response("workspace") }
        RecoveryProtocol.install { _ in RecoveryProtocol.Reply(headers: ["Content-Type": "application/json"], data: first) }
        let unlabelled = try client(); defer { unlabelled.invalidate() }
        try await failingAsync("unlabelled v2 frame rejected") { _ = try await unlabelled.response("workspace") }
        var old = workspaceValue(); old["padding"] = .string(String(repeating: "v", count: 7 * 1_024 * 1_024))
        let legacy = try encode(old)
        RecoveryProtocol.install { _ in RecoveryProtocol.Reply(headers: ["Content-Type": "application/json"], data: legacy) }
        let fallback = try client(); defer { fallback.invalidate() }
        let result = try await fallback.response("workspace")
        try check(result.document == nil && result["padding"]?.string?.count == 7 * 1_024 * 1_024, "v1 retains prior 12 MiB streamed compatibility limit")
        RecoveryProtocol.install { _ in RecoveryProtocol.Reply(headers: ["X-Career-Read-Version": "2", "Content-Length": "100000000"], data: Data()) }
        let oversized = try client(); defer { oversized.invalidate() }
        try await failingAsync("oversized claimed body rejected before assembly") { _ = try await oversized.response("workspace") }
    }

    nonisolated func exportHeaders(_ description: ApplicationReadMetadata) -> [String: String] {
        ["X-Career-Read-Version": "2", "Content-Type": "application/json",
         "Content-Length": String(description.totalBytes), "X-Career-Read-Bytes": String(description.totalBytes),
         "X-Career-Read-SHA256": description.sha256, "X-Career-Read-Workspace-Id": description.workspaceId,
         "X-Career-Read-Account-SHA256": ApplicationReadWire.sha256(Data(description.accountId.utf8))]
    }

    func installExport(_ bytes: Data, description: ApplicationReadMetadata, chunkSize: Int = 64 * 1_024,
                       delay: TimeInterval = 0, pause: Bool = false) {
        let headers = exportHeaders(description)
        RecoveryProtocol.install { request in
            guard request.httpMethod == "GET", request.url?.path == "/api/apply/read-export",
                  request.value(forHTTPHeaderField: "Authorization") == "Bearer " + String(repeating: "b", count: 64),
                  request.value(forHTTPHeaderField: "X-Career-Read-Version") == "2",
                  request.value(forHTTPHeaderField: "Cookie") == nil,
                  URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems == [URLQueryItem(name: "cursor", value: description.exportCursor)] else {
                throw URLError(.unsupportedURL)
            }
            return RecoveryProtocol.Reply(headers: headers, data: bytes, chunkSize: chunkSize, chunkDelay: delay, pauseAfterFirstChunk: pause)
        }
    }

    func waitForPartial(_ file: URL) async throws {
        let limit = ProcessInfo.processInfo.systemUptime + 5
        while ProcessInfo.processInfo.systemUptime < limit {
            if let values = try? file.resourceValues(forKeys: [.fileSizeKey]), (values.fileSize ?? 0) >= 64 * 1_024 { return }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        throw MobileApplicationError(message: "FAILED: streamed recovery did not produce the expected private partial file")
    }

    func verifiedExport(_ file: URL, description: ApplicationReadMetadata) throws {
        let input = try FileHandle(forReadingFrom: file); defer { try? input.close() }
        var hash = SHA256(), bytes = 0
        while let chunk = try input.read(upToCount: 64 * 1_024), !chunk.isEmpty { hash.update(data: chunk); bytes += chunk.count }
        try check(bytes == description.totalBytes, "downloaded archive retains every byte")
        try check(hash.finalize().map { String(format: "%02x", $0) }.joined() == description.sha256, "downloaded archive hash equals the selected server document")
        let attributes = try FileManager.default.attributesOfItem(atPath: file.path)
        try check((attributes[.posixPermissions] as? NSNumber)?.intValue == 0o600, "downloaded archive is private")
        try check(RecoveryProtocol.captured().count == 1, "explicit recovery uses one GET and never replays a write")
    }

    func completeRecoveryDownload() async throws {
        scenarios.append("complete raw export over the 64 MiB view budget streams to a private file")
        var bytes = Data(#"{"documentVersion":1,"mode":"raw-recovery","reasonCode":"synthetic_capacity","originalJSONBase64":""#.utf8)
        bytes.append(Data(repeating: 65, count: 65 * 1_024 * 1_024))
        bytes.append(Data(#""}"#.utf8))
        let description = try ApplicationReadMetadata(metadata(bytes, kind: "workspace"))
        try check(description.totalBytes > ApplicationReadWire.assemblyBytes, "fixture exceeds view assembly budget")
        installExport(bytes, description: description)
        let transport = try client(); defer { transport.invalidate() }
        let file = try folder("large-export").appendingPathComponent("archive.json")
        let start = ProcessInfo.processInfo.systemUptime
        try await transport.downloadRecovery(description, to: file)
        try verifiedExport(file, description: description)
        recoveryTransfers.append(["kind": "over-64-MiB", "bytes": description.totalBytes,
                                  "seconds": ProcessInfo.processInfo.systemUptime - start])
    }

    func progressingRecoveryDownload() async throws {
        scenarios.append("progressing recovery stream completes beyond forty seconds")
        var bytes = Data("[\"".utf8)
        bytes.append(Data(repeating: 97, count: 17 * 1_024 - 4)); bytes.append(Data("\"]".utf8))
        let description = try ApplicationReadMetadata(metadata(bytes, kind: "workspace"))
        installExport(bytes, description: description, chunkSize: 1_024, delay: 2.75)
        let transport = try client(); defer { transport.invalidate() }
        let file = try folder("slow-export").appendingPathComponent("archive.json")
        let start = ProcessInfo.processInfo.systemUptime
        try await transport.downloadRecovery(description, to: file)
        let elapsed = ProcessInfo.processInfo.systemUptime - start
        try check(elapsed > 41 && elapsed < 90, "slow fixture progressed beyond forty seconds within its test bound")
        try verifiedExport(file, description: description)
        recoveryTransfers.append(["kind": "progressing-over-40s", "bytes": description.totalBytes, "seconds": elapsed])
    }

    func cancelledRecoveryDownloads() async throws {
        scenarios.append("cancellation, invalidation and account change remove incomplete recovery files")
        let bytes = Data(repeating: 32, count: 3 * 64 * 1_024)
        let description = try ApplicationReadMetadata(metadata(bytes, kind: "workspace"))
        for action in ["cancel", "invalidate", "account-change"] {
            installExport(bytes, description: description, delay: action == "account-change" ? 1 : 0,
                          pause: action != "account-change")
            let transport = try client()
            let file = try folder(action + "-export").appendingPathComponent("partial.json")
            let work = Task { try await transport.downloadRecovery(description, to: file) }
            do { try await waitForPartial(file) }
            catch { work.cancel(); transport.invalidate(); _ = try? await work.value; throw error }
            let start = ProcessInfo.processInfo.systemUptime
            if action == "cancel" { work.cancel() }
            else if action == "invalidate" { transport.invalidate() }
            else { transport.token = String(repeating: "c", count: 64) }
            var failed = false
            do { try await work.value } catch { failed = true }
            transport.invalidate()
            try check(failed, action + " prevents archive publication")
            try check(!FileManager.default.fileExists(atPath: file.path), action + " removes the partial file")
            try check(ProcessInfo.processInfo.systemUptime - start < 5, action + " stops promptly")
            try check(RecoveryProtocol.captured().count == 1, action + " never restarts the recovery request")
        }
        scenarios.append("corrupt recovery bytes are rejected without retaining a misleading archive")
        var corrupted = bytes; corrupted[0] = 33
        installExport(corrupted, description: description)
        let transport = try client(); defer { transport.invalidate() }
        let file = try folder("corrupt-export").appendingPathComponent("archive.json")
        try await failingAsync("wrong archive checksum rejected") { try await transport.downloadRecovery(description, to: file) }
        try check(!FileManager.default.fileExists(atPath: file.path), "checksum failure removes the incomplete archive")
        try check(RecoveryProtocol.captured().count == 1, "checksum failure does not retry or write")
    }

    func acknowledgementBeforeCancellation() async throws {
        scenarios.append("synchronous durable ACK precedes cancellation and mutation never replays")
        let directory = try folder("journal"), journal = PhoneOperationJournal(folder: root, origin: "https://service.example.com", workspace: workspace)
        let bytes = try documentBytes(["ok": .bool(true), "profile": .object(profile(revision: 2))])
        let packet = try frame(bytes, kind: "profile", operation: operation())
        RecoveryProtocol.install { _ in RecoveryProtocol.Reply(data: packet) }
        let transport = try client(); defer { transport.invalidate() }
        var running: Task<ApplicationServiceResult, Error>?
        transport.mutationIntentObserver = { try journal.begin($0) }
        transport.mutationFinishedObserver = { PhoneOperationJournal.inFlightIDs.remove($0) }
        transport.acknowledgementObserver = { receipt in try journal.append(receipt); running?.cancel() }
        running = Task { try await transport.response("profile", method: "PUT", body: ["expectedRevision": .number(1), "profile": .object(self.profile())]) }
        do { _ = try await running!.value; throw MobileApplicationError(message: "FAILED: cancellation was not observed") }
        catch let error as ApplicationReadAfterMutationError {
            try check(error.acknowledgement.kind == "profile" && !journal.read().isEmpty, "acknowledgment is on disk before cancelled read propagates")
        }
        try check(RecoveryProtocol.captured().count == 1 && RecoveryProtocol.captured()[0].httpMethod == "PUT", "cancelled mutation executed once")
        let old = try acknowledge(2), later = try acknowledge(3)
        let isolated = PhoneOperationJournal(folder: directory, origin: "https://service.example.com", workspace: workspace)
        try isolated.append(old); let captured = Set(try isolated.read().map(\.journalID)); try isolated.append(later)
        try isolated.clear(capturedIDs: captured, account: account)
        try check(try isolated.read().map(\.journalID) == [later.journalID], "fresh snapshot clears only IDs captured before its GET")
        let failure = try encode(["ok": .bool(true), "read": .null, "operation": operation(), "readError": .object(["code": .string("read_unavailable"), "message": .string("synthetic read failure")])])
        RecoveryProtocol.install { _ in RecoveryProtocol.Reply(data: failure) }
        let incomplete = try client(); defer { incomplete.invalidate() }; incomplete.acknowledgementObserver = { try journal.append($0) }
        incomplete.mutationIntentObserver = { try journal.begin($0) }
        incomplete.mutationFinishedObserver = { PhoneOperationJournal.inFlightIDs.remove($0) }
        do { _ = try await incomplete.response("profile", method: "PUT", body: ["expectedRevision": .number(1)]); throw MobileApplicationError(message: "FAILED: missing read accepted") }
        catch is ApplicationReadAfterMutationError { count += 1 }
        try check(RecoveryProtocol.captured().count == 1, "acknowledged read failure never replays PUT")
        let active = ApplicationMutationIntent(journalID: UUID().uuidString, route: "profile", workspaceId: workspace)
        try isolated.begin(active)
        try check(try !isolated.captureReconciliableIDs().contains(active.journalID), "concurrent GET cannot capture an in-flight intent")
        try isolated.clear(capturedIDs: [active.journalID], account: account)
        try check(try isolated.pendingIDs().contains(active.journalID), "clear rechecks active intents")
        PhoneOperationJournal.inFlightIDs.remove(active.journalID)
        try isolated.clear(capturedIDs: [active.journalID], account: account)
        try check(try !isolated.pendingIDs().contains(active.journalID), "orphaned intent reconciles after a fresh snapshot")
        RecoveryProtocol.install { _ in RecoveryProtocol.Reply(data: packet) }
        let prevented = try client(); defer { prevented.invalidate() }
        prevented.mutationIntentObserver = { _ in throw CocoaError(.fileWriteNoPermission) }
        prevented.acknowledgementObserver = { _ in }
        prevented.mutationFinishedObserver = { _ in }
        try await failingAsync("failed intent write prevents network mutation") { _ = try await prevented.response("profile", method: "PUT", body: ["expectedRevision": .number(1)]) }
        try check(RecoveryProtocol.captured().isEmpty, "no HTTP request follows failed preflight durability")
        let lostAckFolder = try folder("failed-ack-write")
        let lostAckJournal = PhoneOperationJournal(folder: lostAckFolder, origin: "https://service.example.com", workspace: workspace)
        let lostAck = try client(); defer { lostAck.invalidate() }
        lostAck.mutationIntentObserver = { try lostAckJournal.begin($0) }
        lostAck.mutationFinishedObserver = { PhoneOperationJournal.inFlightIDs.remove($0) }
        lostAck.acknowledgementObserver = { _ in throw CocoaError(.fileWriteNoPermission) }
        try await failingAsync("failed ack replacement retains intent") { _ = try await lostAck.response("profile", method: "PUT", body: ["expectedRevision": .number(1)]) }
        try check(try lostAckJournal.read().isEmpty && lostAckJournal.pendingIDs().count == 1, "preflight intent survives acknowledged mutation and failed disk replacement")

    }

    func storeRestartAndWriteGates() async throws {
        scenarios.append("store recovery persistence, explicit repair, portable gates and journal reconciliation")
        let malformed = ApplicationLegacyText(path: [.key("profile"), .key("firstName")], utf16leBase64: units([0xd800]))
        var p = profile(); p["firstName"] = .string(malformed.display)
        let oldDocument = try document(documentBytes(workspaceValue(profile: p), legacy: [malformed]))
        let service = RecoveryService(), directory = try folder("store")
        service.handle = { route, _, _ in
            if route == "workspace" { return ApplicationServiceResult(value: oldDocument.annotatedValue(), document: oldDocument) }
            return ApplicationServiceResult(value: ["ok": .bool(true)])
        }
        let (store, tokens) = try store(service, directory: directory)
        try check(await store.refresh(), "historical workspace publishes only after durable evidence")
        RecoveryProgress.record("store.refreshed", ["historicalTextMatches": String(store.profile.firstName == malformed.display),
            "profileNeedsHistoricalRepair": String(store.profileNeedsHistoricalRepair), "hasHistoricalRecovery": String(store.hasHistoricalRecovery)])
        try check(store.profile.firstName == malformed.display && store.profileNeedsHistoricalRepair && store.hasHistoricalRecovery, "projection is visible and write-gated")
        let calls = service.calls.count
        try check(!(await store.saveProfile(store.profile, context: store.editContext)) && service.calls.count == calls, "unchanged escaped profile never reaches PUT")
        try check(store.exportWorkspace(context: store.workspaceActionContext) == nil, "portable v1 cannot silently export projected profile")
        let raw = await store.exportHistoricalRecovery(); try check(raw != nil, "separate complete recovery export available")
        let restarted = NativeApplicationsStore(folder: directory, credentials: tokens, clientFactory: { _, token in service.token = token; return service })
        try check(restarted.profileNeedsHistoricalRepair && restarted.profile.firstName == malformed.display, "restart preserves raw provenance and write gate")
        var repaired = restarted.repairedHistoricalProfileDraft(restarted.profile)
        try check(repaired.firstName == "�" && restarted.profile.firstName == malformed.display, "explicit repair affects only the editor draft")
        repaired.firstName = "Repaired synthetic"
        let receipt = try acknowledge(2)
        service.handle = { route, method, _ in
            if route == "profile", method == "PUT" {
                try service.mutationIntentObserver?(ApplicationMutationIntent(journalID: receipt.journalID, route: "profile", workspaceId: self.workspace))
                defer { service.mutationFinishedObserver?(receipt.journalID) }
                try service.acknowledgementObserver?(receipt)
                throw ApplicationReadAfterMutationError(acknowledgement: receipt, cause: CancellationError())
            }
            return ApplicationServiceResult(value: oldDocument.annotatedValue(), document: oldDocument)
        }
        try check(!(await restarted.saveProfile(repaired, context: restarted.editContext)) && restarted.reconciliationRequired, "cancelled acknowledged save blocks the next non-Stop write")
        let reopened = NativeApplicationsStore(folder: directory, credentials: tokens, clientFactory: { _, token in service.token = token; return service })
        try check(reopened.reconciliationRequired, "durable pending journal survives reopening")
        let acknowledgedDocument = try document(documentBytes(workspaceValue(profile: profile(revision: 2))))
        service.handle = { _, _, _ in ApplicationServiceResult(value: acknowledgedDocument.annotatedValue(), document: acknowledgedDocument) }
        try check(await reopened.refresh(), "fresh validated workspace reconciles pending acknowledgment")
        try check(!reopened.reconciliationRequired, "captured pending acknowledgment cleared after publication")
        try check(service.calls.filter { $0 == "PUT profile" }.count == 1, "reopen and reconciliation never replay profile write")
    }

    func run() async throws {
        try RecoveryProgress.configure(root: root)
        RecoveryProgress.record("codecAndEvidence.begin"); try codecAndEvidence(); RecoveryProgress.record("codecAndEvidence.end")
        RecoveryProgress.record("rawFallbackAndBudget.begin"); try rawFallbackAndBudget(); RecoveryProgress.record("rawFallbackAndBudget.end")
        RecoveryProgress.record("transportAndLargeFixtures.begin"); try await transportAndLargeFixtures(); RecoveryProgress.record("transportAndLargeFixtures.end")
        RecoveryProgress.record("headersIdentityAndRetry.begin"); try await headersIdentityAndRetry(); RecoveryProgress.record("headersIdentityAndRetry.end")
        RecoveryProgress.record("acknowledgementBeforeCancellation.begin"); try await acknowledgementBeforeCancellation(); RecoveryProgress.record("acknowledgementBeforeCancellation.end")
        RecoveryProgress.record("storeRestartAndWriteGates.begin"); try await storeRestartAndWriteGates(); RecoveryProgress.record("storeRestartAndWriteGates.end")
        RecoveryProgress.record("completeRecoveryDownload.begin"); try await completeRecoveryDownload(); RecoveryProgress.record("completeRecoveryDownload.end")
        RecoveryProgress.record("progressingRecoveryDownload.begin"); try await progressingRecoveryDownload(); RecoveryProgress.record("progressingRecoveryDownload.end")
        RecoveryProgress.record("cancelledRecoveryDownloads.begin"); try await cancelledRecoveryDownloads(); RecoveryProgress.record("cancelledRecoveryDownloads.end")
        let result: [String: Any] = ["status": "passed", "assertions": count, "scenarios": scenarios,
            "recoveryTransfers": recoveryTransfers,
            "recoveryTransferScope": "Synthetic URLProtocol stream behavior; does not reproduce the old resource timeout or establish real-network throughput",
            "evidence": "actual-source offline host check; no iOS UI, VoiceOver, app launch, provider or production-network acceptance"]
        print(String(data: try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), encoding: .utf8)!)
    }
}

@main struct HistoricalRecoveryCheck {
    @MainActor static func main() async {
        do {
            guard CommandLine.arguments.count == 3 else { throw MobileApplicationError(message: "Provide owned work and extracted fixture directories.") }
            let root = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
            let fixtures = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
            try await RecoverySuite(root: root, fixtures: fixtures).run()
        } catch { fputs("HistoricalRecoveryCheck: \(error)\n", stderr); exit(1) }
    }
}
