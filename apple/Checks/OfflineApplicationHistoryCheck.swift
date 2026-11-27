import Foundation
import Darwin

@MainActor
private final class HistoryTokens: ApplicationTokenStore {
    var values = ["history-account": "synthetic-local-token", "rotated-account": "synthetic-rotated-token"]
    func load(account: String) throws -> String? { values[account] }
    func save(_ token: String, account: String) throws { values[account] = token }
    func remove(account: String) throws { values.removeValue(forKey: account) }
}
@MainActor
private final class HistoryService: MobileApplicationServing {
    let origin = URL(string: MobileApplicationPolicy.hostedServiceOrigin)!
    var token: String?
    var snapshot: [String: ApplicationValue]
    var offline = false
    var calls: [String] = []
    var delayedWorkspace: (() async throws -> [String: ApplicationValue])?
    init(_ snapshot: [String: ApplicationValue]) { self.snapshot = snapshot }
    func request(_ route: String, method: String, body: [String: ApplicationValue]?) async throws -> [String: ApplicationValue] {
        calls.append(method + " " + route)
        guard (method == "GET" && ["workspace", "receipts"].contains(route) && body == nil)
                || (method == "POST" && route == "revoke") else {
            throw MobileApplicationError(message: "Unexpected mutation in isolated history check")
        }
        if route == "workspace", let delayedWorkspace { return try await delayedWorkspace() }
        if offline { throw URLError(.cannotConnectToHost) }
        return route == "workspace" ? snapshot : ["ok": .bool(true)]
    }
    func invalidate() {}
}
@MainActor
private final class HistoryGate {
    var started = false
    var continuation: CheckedContinuation<[String: ApplicationValue], Error>?
    func wait() async throws -> [String: ApplicationValue] {
        try await withCheckedThrowingContinuation { continuation = $0; started = true }
    }
    func finish(_ value: [String: ApplicationValue]) { continuation?.resume(returning: value); continuation = nil }
}

@MainActor
private final class HistorySuite {
    let root: URL
    let origin = MobileApplicationPolicy.hostedServiceOrigin
    let workspaceID = "10000000-0000-4000-8000-000000000001"
    let jobID = "20000000-0000-4000-8000-000000000001"
    let attemptID = "30000000-0000-4000-8000-000000000001"
    let planID = "40000000-0000-4000-8000-000000000001"
    let fingerprint = "fccbd3962e482d8b24bea10c69ec047e0879cc55cf3c3b3222909bd89108b86a"
    var assertions = 0
    var scenarios: [String] = []
    init(root: URL) { self.root = root }
    func check(_ condition: @autoclosure () throws -> Bool, _ message: String) throws {
        guard try condition() else { throw MobileApplicationError(message: "FAILED: " + message) }
        assertions += 1
    }
    var job: [String: ApplicationValue] {
        ["id": .string(jobID), "url": .string("https://jobs.lever.co/synthetic-native-journey/" + jobID),
         "title": .string("Service Designer"), "company": .string("Synthetic Native Journey Studio"), "location": .string("Riyadh")]
    }
    func profile(_ revision: Int = 8, filename: String? = "CV-B.pdf") -> [String: ApplicationValue] {
        var profile = PhoneApplicationProfile(); profile.firstName = "Jamie"; profile.email = "jamie.native@example.com"
        var value = profile.payload(); value["revision"] = .number(Double(revision))
        if let filename {
            value["resume"] = .object(["name": .string(filename), "mime": .string("application/pdf"), "size": .number(609), "sha256": .string(fingerprint)])
        } else { value["resume"] = .null }
        return value
    }
    func attempt(id: String? = nil, state: String = "ready", evidence: String = "test") -> [String: ApplicationValue] {
        var value: [String: ApplicationValue] = ["id": .string(id ?? attemptID), "attemptId": .string(id ?? attemptID),
            "planId": .string(planID), "jobId": .string(jobID), "title": job["title"]!, "company": job["company"]!, "url": job["url"]!,
            "state": .string(state), "provider": .string("lever"), "mode": .string(evidence), "evidenceMode": .string(evidence),
            "createdAt": .string("2026-11-21T18:00:00Z"), "dispatchedAt": .null, "confirmedAt": .null,
            "resumeName": .string("CV-A.pdf"), "profileRevision": .number(7), "resumeSHA256": .string(fingerprint),
            "payloadSHA256": .string(String(repeating: "a", count: 64)), "dispatchCount": .number(0),
            "error": .object(["message": .string("PRIVATE_ERROR_BODY_CANARY")]), "answers": .object(["note": .string("PRIVATE_ANSWER_CANARY")])]
        if state == "confirmed" {
            value["applicationId"] = .string("synthetic-provider-receipt")
            value["dispatchedAt"] = .string("2026-11-21T18:00:01Z"); value["confirmedAt"] = .string("2026-11-21T18:00:02Z")
        }
        return value
    }
    func snapshot(_ attempts: [[String: ApplicationValue]], revision: Int = 8, workspace: String? = nil) -> [String: ApplicationValue] {
        ["ok": .bool(true), "workspaceId": .string(workspace ?? workspaceID), "profile": .object(profile(revision)),
         "jobs": .array([.object(job)]), "attempts": .array(attempts.map(ApplicationValue.object)),
         "recoverablePlans": .array([]), "activePlanIds": .array([]), "mode": .string("test"),
         "capabilities": .object(["liveEnabled": .bool(false)])]
    }
    func initial() throws -> PhoneApplicationState {
        var value = PhoneApplicationState()
        value.connect(address: origin, workspace: workspaceID, account: "history-account", server: try ApplicationServerProfile(profile(0, filename: nil)))
        return value
    }
    func fixture(_ name: String, bytes: Data? = nil, snapshot value: [String: ApplicationValue]? = nil, offline: Bool = false) throws -> (NativeApplicationsStore, HistoryService, URL, HistoryTokens) {
        let folder = root.appendingPathComponent(name + "-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
        try (bytes ?? JSONEncoder().encode(initial())).write(to: folder.appendingPathComponent("phone-draft.json"))
        let service = HistoryService(value ?? snapshot([attempt()])); service.offline = offline
        let tokens = HistoryTokens()
        let store = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, token in service.token = token; return service })
        return (store, service, folder, tokens)
    }
    func bytes(_ folder: URL) throws -> Data { try Data(contentsOf: folder.appendingPathComponent("phone-draft.json")) }
    func object(_ data: Data) throws -> [String: Any] {
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw CocoaError(.coderInvalidValue) }
        return value
    }
    func encoded(_ object: [String: Any]) throws -> Data { try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]) }
    func label(_ row: [String: ApplicationValue]) -> String {
        MobileApplicationPolicy.stateTitle(MobileApplicationPolicy.displayState(row),
            test: row["evidenceMode"]?.string == "test")
    }
    func closedCopy() throws {
        scenarios.append("code-specific closed-posting copy and preserved response boundaries")
        let closed = "The employer no longer lists this posting. No application was sent."
        let conflict = "The service has a newer profile or application status. Review the current version before continuing."
        let cases: [(String, Int, String, String)] = [
            ("posting_closed", 409, closed, closed), ("posting_closed", 409, "PRIVATE_PROVIDER_MESSAGE_CANARY", closed),
            ("conflict", 409, closed, conflict), ("posting_mismatch", 409, closed, conflict), ("POSTING_CLOSED", 409, closed, conflict),
            ("posting_closed", 401, closed, "Your connection has expired or been revoked. Open connection setup and request a new code for the same workspace. Your phone draft is kept."),
            ("posting_closed", 503, "Existing non409 message", "Existing non409 message"),
            ("uncertain", 409, closed, "This application needs verification. It will not be sent again automatically."),
            ("account_deleting", 409, closed, "This hosted workspace is being deleted. New submissions are stopped. Open account management for its current status; your phone draft is kept.")
        ]
        for (code, status, raw, expected) in cases {
            let data = try JSONSerialization.data(withJSONObject: ["ok": false, "error": ["code": code, "message": raw]])
            do { _ = try MobileApplicationResponse.decode(data, statusCode: status); throw CocoaError(.coderInvalidValue) }
            catch let error as MobileApplicationError {
                try check(error.message == expected && error.statusCode == status && error.code == code, "exact response boundary for " + code + "/" + String(status))
            }
        }
        let accepted = try MobileApplicationResponse.decode(Data("{\"ok\":true,\"sentinel\":\"unchanged\"}".utf8), statusCode: 200)
        try check(accepted["sentinel"]?.string == "unchanged", "successful response remains unchanged")
    }
    func actualOfflineRestart() async throws -> Data {
        scenarios.append("actual-store failed refresh and offline restart preserve A/B and private follow-up without authority")
        let (store, service, folder, _) = try fixture("restart")
        let refreshed = await store.refresh()
        try check(refreshed && store.profile.resumeName == "CV-B.pdf" && store.revision == 8, "fresh profile B is received by actual store")
        try check(store.displayAttempts.count == 1 && ApplicationCVDetails(attempt: store.displayAttempts[0]).resumeName == "CV-A.pdf", "immutable A is the displayed attempt")
        guard let context = store.recordEditContext(for: job) else { throw CocoaError(.coderInvalidValue) }
        var draft = PhoneRecordDraft(); draft.followUpOn = "2026-12-01"; draft.note = "Synthetic private follow-up"; draft.manualResumeName = "Self-entered-CV.pdf"
        try check(store.saveRecord(draft, context: context), "private follow-up saved through actual record function")
        let good = try bytes(folder)
        let again = await store.refresh()
        try check(again && (try bytes(folder)) == good, "same snapshot does not rewrite private state or its saved time")
        let cache = try object(good)["savedApplicationHistory"] as! [String: Any]
        let projected = try encoded(cache)
        let text = String(data: projected, encoding: .utf8)!
        try check(!text.contains("PRIVATE_ERROR_BODY_CANARY") && !text.contains("PRIVATE_ANSWER_CANARY") && !text.contains("synthetic-local-token")
            && !text.contains("planId") && !text.contains("jobId"), "display cache excludes tokens, errors, answers and operational references")
        service.offline = true
        let failed = await store.refresh()
        try check(!failed && store.showingSavedApplicationHistory && store.displayAttempts.count == 1, "failed refresh keeps labelled saved history")
        try check(!store.canExportApplicationReceipts && (try bytes(folder)) == good, "failed refresh cannot expose export or rewrite the snapshot")
        let (reopened, offline, reopenedFolder, _) = try fixture("reopened", bytes: good, offline: true)
        let offlineRefresh = await reopened.refresh()
        try check(!offlineRefresh && reopened.profile.resumeName == "CV-B.pdf" && reopened.revision == 8, "offline current profile remains B")
        try check(reopened.displayAttempts.count == 1 && ApplicationCVDetails(attempt: reopened.displayAttempts[0]) == ApplicationCVDetails(attempt: attempt()), "offline display preserves exact historical A/revision7")
        try check(reopened.showingSavedApplicationHistory && reopened.applicationHistorySavedAt != nil, "restored cache has explicit saved-snapshot provenance")
        try check(reopened.followUpDay(for: job) == "2026-12-01" && reopened.currentRecord(for: job)?.manualResumeName == "Self-entered-CV.pdf"
            && reopened.currentRecord(for: job)?.appliedElsewhere == false, "private manual note and follow-up remain separate from employer evidence")
        try check(reopened.attempts.isEmpty && reopened.plan == nil && reopened.recoverablePlans.isEmpty && reopened.activePlanIDs.isEmpty
            && !reopened.submissionAvailable && !reopened.canExportApplicationReceipts, "restored display cache carries no operational authority")
        let beforeActions = offline.calls
        let resumed = reopened.resumeReview(["id": .string(planID), "digest": .string("not-authority")])
        let submitted = await reopened.submitReviewed()
        await reopened.stopAndCheckReceipt(planID: planID, attemptID: attemptID)
        try check(!resumed && !submitted && offline.calls == beforeActions, "cached rows cannot resume, submit or Stop a receipt")
        let export = await reopened.exportReceipts()
        try check(export == nil && !FileManager.default.fileExists(atPath: reopenedFolder.appendingPathComponent("Career-Finder-Application-Receipts.json").path)
            && offline.calls == beforeActions + ["GET receipts"], "receipt export requires a fresh service result and never serializes the cache")
        try check((try bytes(reopenedFolder)) == good, "offline actions preserve exact saved private bytes")
        return good
    }
    func statusReplacement(_ good: Data) async throws {
        scenarios.append("authenticated newer status and empty history replace the saved projection")
        let confirmed = attempt(state: "confirmed", evidence: "live")
        let (store, service, folder, _) = try fixture("status", bytes: good, snapshot: snapshot([confirmed]))
        let fresh = await store.refresh()
        try check(fresh && label(store.displayAttempts[0]) == "Confirmed" && !store.showingSavedApplicationHistory, "current authenticated confirmation replaces prior preparation")
        let confirmedBytes = try bytes(folder)
        service.snapshot = snapshot([attempt(state: "uncertain", evidence: "live")])
        let changed = await store.refresh()
        try check(changed && label(store.displayAttempts[0]) == "Needs verification", "later authenticated uncertainty never keeps stale confirmation")
        let uncertainBytes = try bytes(folder)
        try check(uncertainBytes != confirmedBytes, "changed status is durably replaced")
        service.offline = true; _ = await store.refresh()
        let (offline, _, _, _) = try fixture("status-restart", bytes: uncertainBytes, offline: true)
        try check(label(offline.displayAttempts[0]) == "Needs verification" && offline.attempts.isEmpty, "restarted cached classification stays honest")
        service.offline = false; service.snapshot = snapshot([confirmed], revision: 7)
        let stale = await store.refresh()
        try check(!stale && label(store.displayAttempts[0]) == "Needs verification" && (try bytes(folder)) == uncertainBytes, "older profile response cannot replace newer history")
        service.snapshot = snapshot([], revision: 8)
        let empty = await store.refresh()
        try check(empty && store.displayAttempts.isEmpty && !store.showingSavedApplicationHistory && !store.canExportApplicationReceipts, "fresh empty history is authoritative")
        let emptyBytes = try bytes(folder)
        let (emptyOffline, _, _, _) = try fixture("empty-restart", bytes: emptyBytes, offline: true)
        try check(emptyOffline.displayAttempts.isEmpty, "empty saved history never falls back to former A")
        service.snapshot = snapshot([attempt()], workspace: "10000000-0000-4000-8000-000000000002")
        let other = await store.refresh()
        try check(!other && store.displayAttempts.isEmpty && (try bytes(folder)) == emptyBytes, "other workspace response cannot cross the owner boundary")
    }
    func classifications(_ good: Data) async throws {
        scenarios.append("prepared, uncertain, live confirmation, test receipt and absent legacy CV remain distinct")
        var legacy = attempt(id: "legacy", state: "confirmed", evidence: "live")
        legacy.removeValue(forKey: "resumeName"); legacy.removeValue(forKey: "profileRevision"); legacy.removeValue(forKey: "applicationId")
        let rows = [attempt(id: "prepared"), attempt(id: "uncertain", state: "uncertain", evidence: "live"),
                    attempt(id: "confirmed", state: "confirmed", evidence: "live"), attempt(id: "test", state: "confirmed"), legacy]
        let (store, _, folder, _) = try fixture("classifications", bytes: good, snapshot: snapshot(rows))
        let read = await store.refresh(); try check(read, "classification fixture is accepted by actual snapshot path")
        try check(store.displayConfirmedApplicationCount == 1 && store.displayUncertainApplicationCount == 2,
            "Fresh counts include only a live verified receipt and every row displayed as needing verification")
        try check(store.attempts == rows && !store.showingSavedApplicationHistory && store.applicationHistorySavedAt == nil,
            "Presentation classification neither rewrites raw evidence nor labels a fresh snapshot as cached")
        let (offline, _, _, _) = try fixture("classification-restart", bytes: bytes(folder), offline: true)
        try check(offline.displayConfirmedApplicationCount == 1 && offline.displayUncertainApplicationCount == 2,
            "Restarted saved-history counts agree with the exact displayed receipt classifications")
        try check(offline.attempts.isEmpty && !offline.canExportApplicationReceipts && offline.showingSavedApplicationHistory
            && offline.applicationHistorySavedAt.flatMap(ApplicationReviewPolicy.date) != nil,
            "Saved counts retain their snapshot timestamp and never become operational receipts or export authority")
        try check(offline.displayAttempts[4]["state"]?.string == "confirmed"
            && MobileApplicationPolicy.displayState(offline.displayAttempts[4]) == "uncertain",
            "A legacy confirmed value remains raw historical evidence while its display truth stays unverified")
        try check(offline.displayAttempts.map(label) == ["Prepared draft", "Needs verification", "Confirmed", "Test receipt", "Needs verification"], "all receipt distinctions use unchanged production classification")
        try check(ApplicationCVDetails(attempt: offline.displayAttempts[4]).resumeName == nil
            && ApplicationCVDetails(attempt: offline.displayAttempts[4]).profileRevision == nil, "legacy absence never falls back to current B")
        try check(offline.displayAttempts.prefix(4).allSatisfy { ApplicationCVDetails(attempt: $0).resumeName == "CV-A.pdf" }
            && offline.profile.resumeName == "CV-B.pdf", "all recorded names stay immutable beside current B")
        var blank = attempt(id: "legacy-empty")
        for key in ["resumeName", "resumeSHA256", "payloadSHA256", "createdAt", "dispatchedAt", "confirmedAt", "applicationId"] { blank[key] = .string("") }
        guard let projected = PhoneApplicationHistoryEntry(projecting: blank) else { throw CocoaError(.coderInvalidValue) }
        try check(ApplicationCVDetails(attempt: projected.value).resumeName == nil
            && projected.value["resumeSHA256"] == nil && projected.value["confirmedAt"] == nil, "incoming exact legacy blanks are normalized only to unknown")
        var malformed = blank; malformed["resumeName"] = .string("../bad.pdf")
        try check(PhoneApplicationHistoryEntry(projecting: malformed) == nil, "a positive malformed name is not normalized")
        var storedBlank = projected.value; storedBlank["resumeName"] = .string("")
        let rawBlank = try JSONEncoder().encode(ApplicationValue.object(storedBlank))
        try check((try? JSONDecoder().decode(PhoneApplicationHistoryEntry.self, from: rawBlank)) == nil, "stored raw blanks remain rejected, not normalized")
    }
    func rejectedCaches(_ good: Data) throws {
        scenarios.append("malformed, wrong-owner, duplicate and oversized optional caches do not block valid private drafts")
        let rootObject = try object(good)
        let original = rootObject["savedApplicationHistory"] as! [String: Any]
        let rows = original["entries"] as! [[String: Any]]
        var cases: [(String, [String: Any])] = []
        var value = original; value["schemaVersion"] = 2; cases.append(("version", value))
        value = original; value["credentialAccount"] = "rotated-account"; cases.append(("credential", value))
        value = original; var scope = value["scope"] as! [String: Any]; scope["origin"] = "https://other.example"; value["scope"] = scope; cases.append(("origin", value))
        value = original; scope = value["scope"] as! [String: Any]; scope["workspaceID"] = "10000000-0000-4000-8000-000000000002"; value["scope"] = scope; cases.append(("workspace", value))
        value = original; value["entries"] = rows + rows; cases.append(("duplicate", value))
        value = original; var row = rows[0]; row["profileRevision"] = "7"; value["entries"] = [row]; cases.append(("revision-type", value))
        value = original; row = rows[0]; row["resumeName"] = "../private.pdf"; value["entries"] = [row]; cases.append(("filename", value))
        value = original; row = rows[0]; row["resumeName"] = ""; value["entries"] = [row]; cases.append(("stored-empty", value))
        value = original; row = rows[0]; row["responseBody"] = "PRIVATE_BODY_CANARY"; value["entries"] = [row]; cases.append(("unknown-field", value))
        value = original; value["entries"] = (0...500).map { index -> [String: Any] in
            var row = rows[0]; row["id"] = "row-\(index)"; row["attemptId"] = "row-\(index)"; return row
        }; cases.append(("count", value))
        value = original; value["entries"] = (0..<500).map { index -> [String: Any] in
            var row = rows[0]; row["id"] = "large-\(index)"; row["attemptId"] = "large-\(index)"
            row["title"] = String(repeating: "𐐀", count: 250); row["company"] = String(repeating: "𐐀", count: 250)
            row["applicationId"] = String(repeating: "x", count: 500); return row
        }
        try check((try encoded(value)).count > PhoneApplicationHistoryCache.maximumBytes, "byte-limit fixture exceeds the total bound while each display string stays bounded")
        cases.append(("bytes", value))
        for (name, cache) in cases {
            var modified = rootObject; modified["savedApplicationHistory"] = cache
            let data = try encoded(modified)
            let (store, service, folder, _) = try fixture("bad-" + name, bytes: data, offline: true)
            try check(store.profile.resumeName == "CV-B.pdf" && store.followUpDay(for: job) == "2026-12-01"
                && store.message == nil && store.displayAttempts.isEmpty && !store.canExportApplicationReceipts,
                "invalid cache is isolated from private data: " + name)
            try check((try bytes(folder)) == data && service.calls.isEmpty, "cache load neither overwrites original bytes nor calls a service: " + name)
        }
        var old = rootObject; old.removeValue(forKey: "savedApplicationHistory")
        let oldData = try encoded(old)
        let (oldStore, _, oldFolder, _) = try fixture("old-compatible", bytes: oldData, offline: true)
        try check(oldStore.profile.resumeName == "CV-B.pdf" && oldStore.displayAttempts.isEmpty && (try bytes(oldFolder)) == oldData, "old absent-cache phone drafts remain compatible")
        var fallback = rootObject; fallback.removeValue(forKey: "credentialAccount")
        let (legacy, _, _, _) = try fixture("no-origin-fallback", bytes: encoded(fallback), offline: true)
        try check(legacy.displayAttempts.isEmpty && legacy.profile.resumeName == "CV-B.pdf", "legacy origin token-account fallback never binds a display cache")
    }
    func connectionChanges(_ good: Data) async throws {
        scenarios.append("owner and credential changes invalidate history while private work remains scoped")
        var state = try JSONDecoder().decode(PhoneApplicationState.self, from: good)
        state.connect(address: origin, workspace: workspaceID, account: "rotated-account", server: try ApplicationServerProfile(profile()))
        try check(state.savedApplicationHistory == nil, "same workspace with a new explicit credential invalidates old cache")
        let (rotated, _, _, _) = try fixture("rotated", bytes: JSONEncoder().encode(state), offline: true)
        try check(rotated.displayAttempts.isEmpty && rotated.profile.resumeName == "CV-B.pdf", "credential rotation cannot restore old history")
        state = try JSONDecoder().decode(PhoneApplicationState.self, from: good)
        state.connect(address: origin, workspace: "10000000-0000-4000-8000-000000000002", account: "rotated-account", server: try ApplicationServerProfile(profile(0, filename: nil)))
        try check(state.savedApplicationHistory == nil && state.profile.resumeName.isEmpty && state.workspaceDrafts.contains { $0.scope.workspaceID == workspaceID }, "another workspace keeps its own draft without the prior history")
        let (store, _, folder, _) = try fixture("disconnect", bytes: good)
        await store.disconnect()
        let disconnected = try JSONDecoder().decode(PhoneApplicationState.self, from: bytes(folder))
        try check(!store.connected && store.displayAttempts.isEmpty && disconnected.savedApplicationHistory == nil
            && disconnected.profile.resumeName == "CV-B.pdf", "explicit disconnect clears only cached history authority, keeping profile work")
        let portable = disconnected.activeDraft
        let exportData = try JSONEncoder().encode(portable)
        try check(!String(data: exportData, encoding: .utf8)!.contains("savedApplicationHistory"), "portable workspace drafts exclude the remote display cache")
    }
    func failedWrite(_ good: Data) async throws {
        scenarios.append("failed atomic save does not advertise a newly durable status")
        let (store, _, folder, _) = try fixture("failed-write", bytes: good, snapshot: snapshot([attempt(state: "confirmed", evidence: "live")]))
        let path = folder.appendingPathComponent("phone-draft.json"), retained = folder.appendingPathComponent("retained-original.json")
        try FileManager.default.moveItem(at: path, to: retained)
        try FileManager.default.createDirectory(at: path, withIntermediateDirectories: false)
        let result = await store.refresh()
        try check(!result && store.attempts.isEmpty && store.showingSavedApplicationHistory && label(store.displayAttempts[0]) == "Prepared draft", "failed write preserves last durable A rather than advertising new confirmation")
        try check(!store.canExportApplicationReceipts && (try Data(contentsOf: retained)) == good, "failed write retains original bytes and no fresh export affordance")
        try FileManager.default.removeItem(at: path); try FileManager.default.moveItem(at: retained, to: path)
    }
    func lateOldSession(_ good: Data) async throws {
        scenarios.append("late old-session response cannot repopulate disconnected history")
        let (store, service, folder, _) = try fixture("late-session", bytes: good)
        let gate = HistoryGate(); service.delayedWorkspace = { try await gate.wait() }
        let response = snapshot([attempt(state: "confirmed", evidence: "live")])
        let task = Task { await store.refresh() }
        for _ in 0..<1000 {
            if gate.started { break }
            try await Task.sleep(nanoseconds: 1_000_000)
        }
        try check(gate.started, "late-session check reached the actual async request")
        await store.disconnect()
        gate.finish(response)
        let accepted = await task.value
        let state = try JSONDecoder().decode(PhoneApplicationState.self, from: bytes(folder))
        try check(!accepted && !store.connected && store.displayAttempts.isEmpty && store.attempts.isEmpty
            && state.savedApplicationHistory == nil, "old authenticated response cannot cross a rotated session guard")
    }
    func invalidFreshHistory(_ good: Data) async throws {
        scenarios.append("uncacheable fresh history never falls back to an older snapshot or stale Export")
        var malformed = attempt(); malformed["resumeName"] = .string("../bad.pdf")
        let (store, service, folder, _) = try fixture("bad-fresh", bytes: good, snapshot: snapshot([malformed]))
        let fresh = await store.refresh()
        try check(fresh && store.attempts.count == 1, "existing authenticated response behavior remains unchanged")
        let stored = try JSONDecoder().decode(PhoneApplicationState.self, from: bytes(folder))
        try check(stored.savedApplicationHistory == nil, "malformed presentation metadata is never cached")
        service.offline = true; let failed = await store.refresh()
        try check(!failed && store.displayAttempts.isEmpty && !store.canExportApplicationReceipts && store.attempts.count == 1,
            "failed refresh with no cache shows neither stale rows nor stale Export")
    }
    func run() async throws {
        try closedCopy()
        let good = try await actualOfflineRestart()
        try await statusReplacement(good)
        try await classifications(good)
        try rejectedCaches(good)
        try await connectionChanges(good)
        try await failedWrite(good)
        try await lateOldSession(good)
        try await invalidFreshHistory(good)
    }
}
@main
struct OfflineApplicationHistoryCheck {
    @MainActor static func main() async {
        do {
            guard CommandLine.arguments.count == 3 else { throw CocoaError(.coderInvalidValue) }
            let root = URL(fileURLWithPath: CommandLine.arguments[1])
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: false)
            let suite = HistorySuite(root: root); try await suite.run()
            let report: [String: Any] = ["schemaVersion": 1, "assertions": suite.assertions, "scenarios": suite.scenarios,
                "network": false, "keychain": false, "nativeUIAcceptance": false, "usesActualStoreAndDecoder": true]
            let data = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: URL(fileURLWithPath: CommandLine.arguments[2]), options: .atomic)
            print(String(data: data, encoding: .utf8)!)
            print("PASS \(suite.assertions) offline-history assertions across \(suite.scenarios.count) focused scenarios")
        } catch { fputs(error.localizedDescription + "\n", stderr); exit(1) }
    }
}
