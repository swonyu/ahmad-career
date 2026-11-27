import Foundation
import CryptoKit
import Darwin

@MainActor
private final class HistoricalURLTokens: ApplicationTokenStore {
    var values: [String: String] = [:]
    func load(account: String) throws -> String? { values[account] }
    func save(_ token: String, account: String) throws { values[account] = token }
    func remove(account: String) throws { values.removeValue(forKey: account) }
}

@MainActor
private final class HistoricalURLService: MobileApplicationServing {
    struct Call { let route: String; let method: String; let body: [String: ApplicationValue]? }
    let origin = URL(string: "https://service.example.com")!
    var token: String?
    var calls: [Call] = []
    var handle: (Call) throws -> [String: ApplicationValue] = { _ in ["ok": .bool(true)] }
    func request(_ route: String, method: String, body: [String: ApplicationValue]?) async throws -> [String: ApplicationValue] {
        let call = Call(route: route, method: method, body: body); calls.append(call)
        return try handle(call)
    }
    func invalidate() {}
}

@MainActor
private final class HistoricalURLSuite {
    let root: URL
    var folders: [URL] = []
    var checks = 0
    var scenarios: [String] = []
    let prefix = "https://example.com/"
    // Exact pre-BA02 fixture: 2,048 UTF-16 units became 18,272 ASCII URL characters.
    var legacyInput: String { prefix + String(repeating: "界", count: 2_028) }
    var legacyWebsite: String { prefix + String(repeating: "%E7%95%8C", count: 2_028) }
    var legacyJobURL: String { "https://careers.example.com/roles/" + String(repeating: "%E7%95%8C", count: 600) }
    var job: [String: ApplicationValue] {
        ["id": .string("historical-job"), "url": .string(legacyJobURL), "title": .string("Synthetic designer — مصمم"),
         "company": .string("Synthetic employer"), "location": .string("الرياض"), "country": .string("SA"),
         "provider": .string("manual")]
    }
    init(root: URL) { self.root = root }
    func check(_ value: Bool, _ message: String) throws {
        guard value else { throw MobileApplicationError(message: "FAILED: " + message) }
        checks += 1
    }
    func folder(_ name: String) throws -> URL {
        let result = root.appendingPathComponent(name + "-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: result, withIntermediateDirectories: true)
        folders.append(result)
        return result
    }
    func cleanup() { for path in folders { try? FileManager.default.removeItem(at: path) } }
    func serverProfile(_ website: String, revision: Int = 17) -> [String: ApplicationValue] {
        var profile = PhoneApplicationProfile()
        profile.firstName = "Synthetic"; profile.lastName = "Applicant"
        profile.email = "synthetic@example.invalid"; profile.country = "SA"; profile.website = website
        var value = profile.payload(includeLinkedIn: true)
        value["resume"] = .null; value["revision"] = .number(Double(revision))
        return value
    }
    func initialState() throws -> PhoneApplicationState {
        var state = PhoneApplicationState()
        state.serviceAddress = "https://service.example.com"; state.workspaceID = "historical-workspace"
        state.connectionEnabled = true; state.credentialAccount = "synthetic-url-account"
        state.acknowledge(try ApplicationServerProfile(serverProfile("", revision: 16)))
        return state
    }
    func workspace() -> [String: ApplicationValue] {
        let plan: [String: ApplicationValue] = [
            "id": .string("immutable-historical-review"), "digest": .string("original-opaque-review-digest"),
            "profileRevision": .number(17), "expiresAt": .string(ISO8601DateFormatter().string(from: Date().addingTimeInterval(3_600))),
            "stopped": .bool(false), "approvedAt": .null,
            "items": .array([.object(["jobId": .string("historical-job"), "state": .string("blocked"),
                                     "job": .object(job), "payloadSHA256": .string(String(repeating: "a", count: 64)),
                                     "payloadSummary": .object(["website": .string(legacyWebsite)])])])
        ]
        return ["ok": .bool(true), "workspaceId": .string("historical-workspace"), "mode": .string("test"),
                "profile": .object(serverProfile(legacyWebsite)), "jobs": .array([.object(job)]), "attempts": .array([]),
                "recoverablePlans": .array([.object(plan)]), "activePlanIds": .array([]),
                "capabilities": .object(["linkedinProfile": .bool(true), "liveEnabled": .bool(false)])]
    }
    func fixture(_ state: PhoneApplicationState, service: HistoricalURLService, name: String) throws -> (NativeApplicationsStore, URL, HistoricalURLTokens) {
        let path = try folder(name)
        try JSONEncoder().encode(state).write(to: path.appendingPathComponent("phone-draft.json"), options: .atomic)
        let tokens = HistoricalURLTokens(); tokens.values[state.tokenAccount] = "synthetic-url-token"
        let store = NativeApplicationsStore(folder: path, credentials: tokens, clientFactory: { _, token in
            service.token = token; return service
        })
        return (store, path, tokens)
    }
    func bytes(_ path: URL) throws -> Data { try Data(contentsOf: path.appendingPathComponent("phone-draft.json")) }

    func readAndWriteBoundaries() throws {
        scenarios.append("exact historical URL reads and independent new-write bounds")
        try check(legacyInput.utf16.count == 2_048 && legacyWebsite.utf8.count == 18_272, "fixture matches retained backend proof")
        try check(MobileApplicationPolicy.jobURL(legacyWebsite) != nil, "historical long website remains navigable")
        try check(MobileApplicationPolicy.jobURL(legacyJobURL) != nil && legacyJobURL.utf16.count > 4_096, "historical long job passes unchanged public URL security")
        try check(MobileApplicationPolicy.newProfileWebsiteURL(legacyInput) == nil, "short Unicode input cannot produce oversized new portfolio URL")
        let decomposed = prefix + String(repeating: "e\u{0301}", count: 300)
        try check(decomposed.utf16.count == 620, "decomposed URL fixture retains its original units")
        try check(MobileApplicationPolicy.newProfileWebsiteURL(decomposed) == nil, "decomposed canonical URL cannot be accepted through NFC undercount")
        let queryExpansion = prefix + "?q=" + String(repeating: "'", count: 700)
        try check(queryExpansion.utf16.count < 2_048 && MobileApplicationPolicy.newProfileWebsiteURL(queryExpansion) == nil, "special-query apostrophe expansion is measured")
        try check(MobileApplicationPolicy.newJobURL(prefix + "?q=" + String(repeating: "'", count: 1_400)) == nil, "new job encoded-query expansion obeys 4096")
        let decomposedShort = MobileApplicationPolicy.newProfileWebsiteURL(prefix + "e\u{0301}")?.absoluteString
        try check(decomposedShort == prefix + "e%CC%81", "new URL serialization preserves decomposed spelling")

        try check(MobileApplicationPolicy.newProfileWebsiteURL(legacyWebsite) == nil, "long historical URL is not a new portfolio write")
        try check(MobileApplicationPolicy.newJobURL(legacyJobURL) == nil, "historical saved job is not admitted as a new oversized link")
        let newUnicodeJob = "https://careers.example.com/roles/" + String(repeating: "界", count: 600)
        try check(newUnicodeJob.utf16.count < 4_096 && MobileApplicationPolicy.newJobURL(newUnicodeJob) == nil, "new job checks encoded output as well as input")
        let websiteAtLimit = prefix + String(repeating: "x", count: 2_048 - prefix.utf16.count)
        try check(MobileApplicationPolicy.newProfileWebsiteURL(websiteAtLimit)?.absoluteString == websiteAtLimit, "new portfolio canonical boundary is accepted exactly")
        try check(MobileApplicationPolicy.newProfileWebsiteURL(websiteAtLimit + "x") == nil, "new portfolio input above boundary is rejected")
        let jobAtLimit = prefix + String(repeating: "x", count: 4_096 - prefix.utf16.count)
        try check(MobileApplicationPolicy.newJobURL(jobAtLimit)?.absoluteString == jobAtLimit, "new job canonical boundary is accepted exactly")
        try check(MobileApplicationPolicy.newJobURL(jobAtLimit + "x") == nil, "new job input above boundary is rejected")
        let encoded = MobileApplicationPolicy.newProfileWebsiteURL("HTTPS://EXAMPLE.COM:443/界#discard")?.absoluteString
        try check(encoded == "https://example.com/%E7%95%8C", "new portfolio normalizes only its write representation")
        for unsafe in ["http://example.com/", "https://user:secret@example.com/", "https://example.com:8443/",
                       "https://localhost/", "https://127.0.0.1/", "https://example.internal/", "https://[::1]/"] {
            let long = unsafe + String(repeating: "x", count: 5_000)
            try check(MobileApplicationPolicy.jobURL(long) == nil, "historical URL compatibility retains security for " + unsafe)
            var row = job; row["url"] = .string(long)
            try check(!PhoneRecordJob(row).valid, "unsafe stored private job remains invalid")
        }
        for bad in ["https://example.com/a b", "https://example.com/a\\b", "https://example.com/a\nb"] {
            try check(MobileApplicationPolicy.newProfileWebsiteURL(bad) == nil, "new portfolio rejects whitespace/control/backslash")
        }
    }

    func portableRoundTrips() throws {
        scenarios.append("portable profile, bookmark, private record and parked workspace round trips")
        var state = try initialState()
        state.acknowledge(try ApplicationServerProfile(serverProfile(legacyWebsite)))
        var saved = job; saved["localOnly"] = .bool(true); state.jobs = [saved]
        let copiedJob = PhoneRecordJob(saved)
        try check(copiedJob.valid && copiedJob.url == legacyJobURL, "private record keeps exact historical job URL")
        var record = PhoneOpportunityRecord(scope: state.recordScope, job: copiedJob)
        record.note = "Synthetic note · ملاحظة · e\u{0301} · 😀"
        var edit = PhoneRecordDraft(record); edit.followUpOn = "2026-12-01"
        let checkpoint = PhoneRecordDraftCheckpoint(scope: state.recordScope, identity: copiedJob.identity, job: copiedJob,
            recordID: record.id, revision: record.revision, draft: edit)
        let backup = PhoneWorkspaceBackup(draft: state.activeDraft, records: [record], recordDrafts: [checkpoint], submissionHolds: [])
        try check(backup.valid, "historical long URLs are valid in portable workspace")
        let data = try JSONEncoder().encode(backup)
        let restored = try JSONDecoder().decode(PhoneWorkspaceBackup.self, from: data)
        try check(restored.valid && restored.draft.profile.website == legacyWebsite, "18,272-character website survives portable import exactly")
        try check(restored.draft.jobs.first?["url"]?.string == legacyJobURL, "saved bookmark URL survives portable import exactly")
        try check(restored.records.first?.job.url == legacyJobURL && restored.records.first?.note == record.note, "private record and mixed Unicode note survive exactly")
        try check(restored.recordDrafts.first?.job.url == legacyJobURL && restored.recordDrafts.first?.draft.followUpOn == "2026-12-01", "unfinished private record keeps its original link")
        try check(restored.draft.profileNeedsSync && restored.draft.profileRevision == nil, "portable import does not manufacture a service revision")
        var parked = state.activeDraft
        parked.scope = PhoneRecordScope(origin: "https://second.example.com", workspaceID: "parked-history")
        state.workspaceDrafts = [parked]; state.applicationRecords = [record]
        let stateData = try JSONEncoder().encode(state)
        let reopened = try JSONDecoder().decode(PhoneApplicationState.self, from: stateData)
        try check(reopened.profile.website == legacyWebsite && reopened.applicationRecords.first?.job.url == legacyJobURL, "phone state persistence retains full historical strings")
        try check(reopened.workspaceDrafts.first?.jobs.first?["url"]?.string == legacyJobURL, "archived workspace retains long job URL")
        var unfinished = state.activeDraft
        unfinished.profile.website = String(repeating: "draft", count: 2_000)
        let unfinishedBackup = PhoneWorkspaceBackup(draft: unfinished, records: [], recordDrafts: [], submissionHolds: [])
        let unfinishedData = try JSONEncoder().encode(unfinishedBackup)
        let unfinishedRead = try JSONDecoder().decode(PhoneWorkspaceBackup.self, from: unfinishedData)
        try check(unfinishedRead.draft.profile.website == unfinished.profile.website, "existing short unfinished website draft remains recoverable")
        unfinished.profile.website = "javascript:" + String(repeating: "x", count: 10_001)
        let badWebsite = try JSONEncoder().encode(PhoneWorkspaceBackup(draft: unfinished, records: [], recordDrafts: [], submissionHolds: []))
        try check((try? JSONDecoder().decode(PhoneWorkspaceBackup.self, from: badWebsite)) == nil, "only safe public historical URLs get longer read compatibility")
        unfinished.profile.website = legacyWebsite; unfinished.profile.firstName = String(repeating: "x", count: 10_001)
        let badOtherField = try JSONEncoder().encode(PhoneWorkspaceBackup(draft: unfinished, records: [], recordDrafts: [], submissionHolds: []))
        try check((try? JSONDecoder().decode(PhoneWorkspaceBackup.self, from: badOtherField)) == nil, "unrelated scalar limits remain intact")
    }

    func actualStoreRecovery() async throws {
        scenarios.append("actual store refresh, Saved comparison, private record, restart, export and import")
        let service = HistoricalURLService(); service.handle = { _ in self.workspace() }
        let (store, path, tokens) = try fixture(initialState(), service: service, name: "history")
        let refreshed = await store.refresh()
        try check(refreshed && store.profile.website == legacyWebsite, "actual refresh accepts exact historical website")
        try check(store.jobs.first?["url"]?.string == legacyJobURL, "actual refresh preserves exact historical job URL")
        guard let key = store.savedComparisonKey(for: job), let comparison = store.savedComparisonItem(for: key),
              let context = store.recordEditContext(for: job) else { throw MobileApplicationError(message: "Historical Saved/private record could not be opened") }
        try check(comparison.job.url == legacyJobURL, "Saved comparison preserves full link")
        var note = PhoneRecordDraft(); note.note = "Synthetic private note · الرياض"; note.followUpOn = "2026-12-01"
        try check(store.saveRecord(note, context: context), "actual private-record write accepts historical job reference")
        let review = store.recoverablePlans.first
        try check(review?["digest"]?.string == "original-opaque-review-digest", "review digest is never recomputed for read compatibility")
        let item = review?["items"]?.array.first?.object
        try check(item?["payloadSummary"]?.object["website"]?.string == legacyWebsite, "immutable review retains original website")
        try check(item?["payloadSHA256"]?.string == String(repeating: "a", count: 64), "recorded payload fingerprint remains exact")
        let reopened = NativeApplicationsStore(folder: path, credentials: tokens, clientFactory: { _, _ in service })
        try check(reopened.profile.website == legacyWebsite && reopened.recordVersions(for: job).first?.job.url == legacyJobURL, "actual restart retains website and private job")
        guard let output = reopened.exportWorkspace(context: reopened.workspaceActionContext) else {
            throw MobileApplicationError(message: "Historical workspace export failed: " + (reopened.message ?? "unknown"))
        }
        let backup = try NativeApplicationsStore.readWorkspaceBackup(at: output)
        try check(backup.draft.profile.website == legacyWebsite && backup.records.first?.job.url == legacyJobURL, "actual exported backup reads back without truncation")
        let (destination, destinationPath, destinationTokens) = try fixture(initialState(), service: HistoricalURLService(), name: "import")
        try check(destination.mergeBackup(backup, context: destination.workspaceActionContext), "actual import retains historical profile and record")
        let importedAgain = NativeApplicationsStore(folder: destinationPath, credentials: destinationTokens, clientFactory: { _, _ in HistoricalURLService() })
        try check(importedAgain.profile.website == legacyWebsite && importedAgain.recordVersions(for: job).first?.job.url == legacyJobURL, "imported history survives another restart exactly")
        try check(service.calls.allSatisfy { $0.method == "GET" && $0.route == "workspace" }, "history viewing and private recovery send no mutations")
    }

    func actualNewWriteChecks() async throws {
        scenarios.append("actual new-entry and profile writer reject expansion before any service mutation")
        let service = HistoricalURLService()
        service.handle = { call in
            if call.route == "profile" {
                var profile = call.body?["profile"]?.object ?? [:]
                profile["revision"] = .number(18); profile["resume"] = .null
                return ["ok": .bool(true), "profile": .object(profile)]
            }
            return self.workspace()
        }
        let (store, path, _) = try fixture(initialState(), service: service, name: "new-writes")
        _ = await store.refresh()
        let originalBytes = try bytes(path)
        let added = await store.addJob(url: legacyJobURL, title: "Synthetic", company: "Fixture", location: "", country: "")
        try check(!added && !service.calls.contains(where: { $0.route == "jobs" }), "oversized new opportunity never reaches the service")
        let afterRejectedJob = try bytes(path)
        try check(afterRejectedJob == originalBytes, "rejected new job leaves historical storage bytes unchanged")
        var draft = store.profile; draft.website = legacyInput; draft.headline = "Retained in editor"
        let saved = await store.saveProfile(draft, context: store.editContext)
        try check(!saved && !service.calls.contains(where: { $0.route == "profile" }), "oversized encoded portfolio never reaches PUT")
        let afterRejectedProfile = try bytes(path)
        try check(afterRejectedProfile == originalBytes && store.profile.website == legacyWebsite, "rejected new write cannot normalize or overwrite old historical value")
        draft = store.profile; draft.website = "HTTPS://EXAMPLE.COM:443/界#discard"
        let accepted = await store.saveProfile(draft, context: store.editContext)
        let writes = service.calls.filter { $0.route == "profile" }
        try check(accepted && writes.count == 1, "explicit valid replacement performs one profile write")
        try check(writes.first?.body?["profile"]?.object["website"]?.string == "https://example.com/%E7%95%8C", "profile PUT contains bounded canonical replacement only")
        try check(store.profile.website == "https://example.com/%E7%95%8C" && !store.profileNeedsSync, "replacement is accepted only with service profile acknowledgement")
        try check(!service.calls.contains(where: { ["prepare", "submit", "advance", "stop"].contains($0.route) }), "URL recovery checks never prepare or submit an application")
    }

    func run() async throws {
        try readAndWriteBoundaries()
        try portableRoundTrips()
        try await actualStoreRecovery()
        try await actualNewWriteChecks()
        let receipt: [String: Any] = ["status": "passed", "assertions": checks, "scenarios": scenarios,
            "legacyWebsiteUTF16Units": legacyWebsite.utf16.count, "legacyJobURLUTF16Units": legacyJobURL.utf16.count,
            "legacyWebsiteSHA256": SHA256.hash(data: Data(legacyWebsite.utf8)).map { String(format: "%02x", $0) }.joined(),
            "noOutboundNetwork": true, "noApplicationsPreparedOrSubmitted": true]
        let data = try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys])
        print(String(decoding: data, as: UTF8.self))
    }
}

@main
struct HistoricalURLCheck {
    @MainActor static func main() async {
        guard CommandLine.arguments.count == 2 else {
            fputs("Pass one owned scratch fixture directory.\n", stderr); exit(2)
        }
        let suite = HistoricalURLSuite(root: URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true))
        defer { suite.cleanup() }
        do { try await suite.run() }
        catch { suite.cleanup(); fputs(error.localizedDescription + "\n", stderr); exit(1) }
    }
}
