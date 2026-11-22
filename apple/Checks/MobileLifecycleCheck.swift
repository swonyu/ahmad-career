import Foundation
import Darwin

@MainActor
private final class TestTokens: ApplicationTokenStore {
    var values: [String: String] = [:]
    var failLoad = false
    func load(account: String) throws -> String? {
        if failLoad { throw MobileApplicationError(message: "Keychain temporarily locked") }
        return values[account]
    }
    func save(_ token: String, account: String) throws { values[account] = token }
    func remove(account: String) throws { values.removeValue(forKey: account) }
}

@MainActor
private final class TestService: MobileApplicationServing {
    struct Call { let route: String; let method: String; let body: [String: ApplicationValue]? }
    let origin: URL
    var token: String?
    var calls: [Call] = []
    var invalidations = 0
    var handle: (Call) async throws -> [String: ApplicationValue] = { _ in ["ok": .bool(true)] }
    init(_ origin: String = "https://first.example") { self.origin = URL(string: origin)! }
    func request(_ route: String, method: String, body: [String: ApplicationValue]?) async throws -> [String: ApplicationValue] {
        let call = Call(route: route, method: method, body: body); calls.append(call)
        return try await handle(call)
    }
    func invalidate() { invalidations += 1 }
}

@MainActor
private final class DelayedResponse {
    var started = false
    var continuation: CheckedContinuation<[String: ApplicationValue], Error>?
    func wait() async throws -> [String: ApplicationValue] {
        try await withCheckedThrowingContinuation { continuation = $0; started = true }
    }
    func finish(_ value: [String: ApplicationValue]) { continuation?.resume(returning: value); continuation = nil }
    func fail(_ error: Error) { continuation?.resume(throwing: error); continuation = nil }
}

@MainActor
private final class LifecycleSuite {
    var checks = 0
    var scenarios = 0
    var folders: [URL] = []
    let pdf = SyntheticPDF.onePage
    func check(_ condition: @autoclosure () -> Bool, _ message: String) throws {
        guard condition() else { throw MobileApplicationError(message: "FAILED: " + message) }
        checks += 1
    }
    func waitUntil(_ condition: () -> Bool) async throws {
        for _ in 0..<2000 {
            if condition() { return }
            try await Task.sleep(nanoseconds: 1_000_000)
        }
        throw MobileApplicationError(message: "Timed out waiting for a deterministic fixture")
    }
    func server(_ revision: Int, name: String = "Example", resume: ApplicationValue = .null, linkedin: String? = nil) -> [String: ApplicationValue] {
        var value = PhoneApplicationProfile(); value.firstName = name; value.email = "example@example.invalid"
        var object = value.payload(); object["revision"] = .number(Double(revision)); object["resume"] = resume
        if let linkedin { object["linkedin"] = .string(linkedin) }
        return object
    }
    func metadata(_ profile: PhoneApplicationProfile) -> ApplicationValue {
        .object(["name": .string(profile.resumeName), "mime": .string("application/pdf"),
                 "size": .number(Double(profile.resumeSize ?? 0)), "sha256": .string(profile.resumeSHA256 ?? "")])
    }
    func initial(_ revision: Int = 3) throws -> PhoneApplicationState {
        var state = PhoneApplicationState(); state.acknowledge(try ApplicationServerProfile(server(revision)))
        state.serviceAddress = "https://first.example"; state.workspaceID = "workspace-a"
        state.connectionEnabled = true; state.credentialAccount = "fixture-account"
        return state
    }
    func workspace(_ revision: Int, name: String = "Example", jobs: [[String: ApplicationValue]] = [],
                   attempts: [[String: ApplicationValue]] = [], plans: [[String: ApplicationValue]] = [],
                   workspace: String = "workspace-a", resume: ApplicationValue = .null,
                   active: [String] = [], continuation: ApplicationValue? = nil,
                   liveEnabled: ApplicationValue? = nil, linkedInSupport: ApplicationValue? = nil, linkedin: String? = nil) -> [String: ApplicationValue] {
        var value: [String: ApplicationValue] = ["ok": .bool(true), "workspaceId": .string(workspace), "profile": .object(server(revision, name: name, resume: resume, linkedin: linkedin)),
         "jobs": .array(jobs.map(ApplicationValue.object)), "attempts": .array(attempts.map(ApplicationValue.object)),
         "recoverablePlans": .array(plans.map(ApplicationValue.object)), "activePlanIds": .array(active.map(ApplicationValue.string)), "mode": .string("test")]
        var capabilities: [String: ApplicationValue] = [:]
        if let continuation { capabilities["dispatchContinuation"] = continuation }
        if let liveEnabled { capabilities["liveEnabled"] = liveEnabled }
        if let linkedInSupport { capabilities["linkedinProfile"] = linkedInSupport }
        if !capabilities.isEmpty { value["capabilities"] = .object(capabilities) }
        return value
    }
    func review(_ id: String, revision: Int = 3, approved: Bool = false, itemState: String = "ready") -> [String: ApplicationValue] {
        ["id": .string(id), "digest": .string("digest-" + id), "profileRevision": .number(Double(revision)),
         "expiresAt": .string(ISO8601DateFormatter().string(from: Date().addingTimeInterval(3600))),
         "stopped": .bool(false), "approvedAt": approved ? .string("2026-01-01T00:00:00Z") : .null,
         "items": .array([.object(["jobId": .string("job-1"), "state": .string(itemState),
                                  "job": .object(["title": .string("Synthetic role"), "company": .string("Fixture")]),
                                  "payloadSummary": .object(["consentMarketing": .bool(false)])])])]
    }
    func linkedInReview(_ value: ApplicationValue?, state: String = "ready") -> [String: ApplicationValue] {
        var plan = review("linkedin-review", itemState: state)
        var item = plan["items"]!.array[0].object, summary = item["payloadSummary"]!.object
        if let value { summary["linkedin"] = value }
        item["payloadSummary"] = .object(summary); plan["items"] = .array([.object(item)])
        return plan
    }
    func fixture(_ state: PhoneApplicationState, service: TestService, tokens: TestTokens? = nil,
                 factory: NativeApplicationsStore.ClientFactory? = nil,
                 clock: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) throws -> (NativeApplicationsStore, URL, TestTokens) {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("career-lifecycle-" + UUID().uuidString)
        folders.append(folder); try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try JSONEncoder().encode(state).write(to: folder.appendingPathComponent("phone-draft.json"))
        let tokens = tokens ?? TestTokens(); tokens.values[state.tokenAccount] = "synthetic-token"
        let create: NativeApplicationsStore.ClientFactory = factory ?? { _, token in service.token = token; return service }
        return (NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: create, monotonicTime: clock), folder, tokens)
    }
    func cleanup() { for folder in folders { try? FileManager.default.removeItem(at: folder) } }

    func sharedPortableFixture(_ url: URL) throws {
        let backup = try NativeApplicationsStore.readWorkspaceBackup(at: url)
        try check(backup.valid && backup.draft.scope.origin == "https://fixture.example.org"
                  && backup.draft.scope.workspaceID == "portable-fixture-workspace",
                  "The exact shared Android fixture decodes into its declared workspace scope")
        try check(backup.recordDrafts.count == 1 && backup.recordDrafts[0].recordID == nil
                  && backup.recordDrafts[0].revision == nil && backup.recordDrafts[0].draft.note.hasPrefix("New unfinished edit:"),
                  "A new record checkpoint with absent recordID and revision imports without inventing an existing-record base")
        try check(backup.records.count == 2 && backup.records.filter(\.archived).count == 1
                  && backup.records.contains { $0.archived && $0.appliedElsewhere && $0.appliedOn == "2024-02-29" },
                  "Current private notes and archived self-reported history retain their distinct meanings")
        try check(backup.records.contains { $0.note.unicodeScalars.contains { $0.value == 0x301 } && $0.note.contains("مرحبا") && $0.note.contains("😀") },
                  "Cross-platform notes preserve combining accents, Arabic and emoji")
        try check(backup.draft.jobs.first?["url"]?.string?.utf16.count == 4_096
                  && backup.draft.jobs.first?["title"]?.string?.utf16.count == 500,
                  "The common URL and title boundary lengths remain portable")
        try check(backup.draft.profile.resumeData?.count == 624
                  && backup.draft.profile.resumeSHA256 == "bb5c2715eb26f653ce4b8ac581bdb54322bb9c4976e07bcab17c100776006b4b",
                  "The fixture's actual readable PDF survives exact byte and hash validation")
        let service = TestService()
        let (store, folder, _) = try fixture(PhoneApplicationState(), service: service)
        try check(store.mergeBackup(backup, context: store.workspaceActionContext), "The shared fixture merges into an explicitly selected phone workspace")
        let saved = try JSONDecoder().decode(PhoneApplicationState.self, from: Data(contentsOf: folder.appendingPathComponent("phone-draft.json")))
        try check(saved.applicationRecords.count == 2 && saved.recordDrafts.count == 1 && saved.submissionHolds.isEmpty
                  && !saved.connectionEnabled && service.calls.isEmpty,
                  "Cross-account import retains private drafts/history without importing service holds, credentials or sending an application")
        scenarios += 1
    }


    func savedComparisonLifecycle() async throws {
        let url = "https://jobs.lever.co/synthetic-harbor/comparison-a"
        let source = "Synthetic Harbor board", checked = "2026-11-21T18:00:00Z"
        var remote: [String: ApplicationValue] = ["id": .string("service-compare-a"), "url": .string(url),
            "title": .string("Canonical Service Designer"), "company": .string("Synthetic Harbor"),
            "location": .string("Riyadh"), "country": .string("SA")]
        let service = TestService()
        service.handle = { call in
            if call.route == "jobs" && call.method == "POST" { return ["ok": .bool(true), "job": .object(remote)] }
            if call.route == "workspace" && call.method == "GET" { return self.workspace(3, jobs: [remote]) }
            throw MobileApplicationError(message: "Unexpected synthetic comparison route")
        }
        let (store, folder, tokens) = try fixture(initial(), service: service)
        let saved = await store.addJob(url: url + "/apply?utm_source=fixture", title: "Service Designer",
            company: "Synthetic Harbor", location: "Riyadh", country: "SA", sourceName: source, checkedAt: checked)
        try check(saved && store.jobs.count == 1 && store.jobs[0]["id"]?.string == "service-compare-a",
                  "Actual save/import/refresh retains one canonical opportunity")
        let posts = service.calls.filter { $0.method == "POST" }
        try check(posts.count == 1 && posts[0].route == "jobs"
                  && Set(posts[0].body!.keys) == ["url", "title", "company", "location", "country"],
                  "New local source/check metadata never changes the five-field public job POST")
        try check(store.jobs[0]["sourceName"]?.string == source && store.jobs[0]["checkedAt"]?.string == checked
                  && store.jobs[0]["title"] == remote["title"], "Service canonical details and local observed facts both survive synchronization")
        let path = folder.appendingPathComponent("phone-draft.json")
        let savedState = try JSONDecoder().decode(PhoneApplicationState.self, from: Data(contentsOf: path))
        try check(savedState.jobs[0]["sourceName"]?.string == source && savedState.jobs[0]["checkedAt"]?.string == checked,
                  "rememberImported durably retains comparison metadata in the local backup row")
        let reopened = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
        try check(reopened.jobs[0]["checkedAt"]?.string == checked && reopened.jobs[0]["sourceName"]?.string == source,
                  "A real store reopen retains the observed facts before any new request")
        let key = store.savedComparisonKey(for: store.jobs[0])!
        remote["id"] = .string("service-compare-replacement")
        let refreshed = await store.refresh()
        try check(refreshed && store.savedComparisonItem(for: key) == nil
                  && store.jobs[0]["checkedAt"]?.string == checked,
                  "A changed row ID invalidates the captured comparison instead of silently substituting a same-posting row")
        scenarios += 1

        let offline = TestService(); offline.handle = { _ in throw URLError(.notConnectedToInternet) }
        let (offlineStore, offlineFolder, offlineTokens) = try fixture(initial(), service: offline)
        let kept = await offlineStore.addJob(url: "https://careers.example.com/offline-comparison", title: "Nurse",
            company: "Synthetic clinic", location: "Toronto", country: "CA", sourceName: source, checkedAt: checked)
        let restored = NativeApplicationsStore(folder: offlineFolder, credentials: offlineTokens, clientFactory: { _, _ in offline })
        try check(kept && restored.jobs.first?["sourceName"]?.string == source && restored.jobs.first?["checkedAt"]?.string == checked,
                  "A failed network save preserves source/check facts across restart")
        let before = try Data(contentsOf: offlineFolder.appendingPathComponent("phone-draft.json")), calls = offline.calls.count
        let invalid = await restored.addJob(url: "https://careers.example.com/invalid-comparison", title: "Nurse",
            company: "Synthetic clinic", location: "Toronto", country: "CA", sourceName: source, checkedAt: "not-a-date")
        let after = try Data(contentsOf: offlineFolder.appendingPathComponent("phone-draft.json"))
        try check(!invalid && before == after && offline.calls.count == calls,
                  "Invalid new metadata fails before any file mutation or outbound request")
        scenarios += 1

        let first = TestService(), second = TestService("https://second.example")
        first.handle = { _ in ["ok": .bool(true)] }
        var other = remote; other["location"] = .string("Jeddah")
        second.handle = { call in
            if call.route == "session" {
                return ["sessionToken": .string("synthetic-second-token"), "workspaceId": .string("workspace-b"),
                        "profile": .object(self.server(0, name: "Synthetic B"))]
            }
            if call.route == "workspace" { return self.workspace(0, name: "Synthetic B", jobs: [other], workspace: "workspace-b") }
            throw MobileApplicationError(message: "Unexpected synthetic owner route")
        }
        var initialState = try initial()
        var local = remote; local["localOnly"] = .bool(true); local["sourceName"] = .string(source); local["checkedAt"] = .string(checked)
        initialState.jobs = [local]
        let (switching, switchFolder, _) = try fixture(initialState, service: first,
            factory: { origin, _ in origin.host == "second.example" ? second : first })
        let captured = switching.savedComparisonKey(for: local)!
        let connected = await switching.connect(address: "https://second.example", code: "synthetic-fixture-code")
        try check(connected && switching.workspaceScope.workspaceID == "workspace-b"
                  && switching.savedComparisonItem(for: captured) == nil, "Actual workspace switching invalidates the old comparison owner")
        let switched = try JSONDecoder().decode(PhoneApplicationState.self, from: Data(contentsOf: switchFolder.appendingPathComponent("phone-draft.json")))
        let parked = switched.workspaceDrafts.first { $0.scope.workspaceID == "workspace-a" }
        try check(parked?.jobs.first?["checkedAt"]?.string == checked && parked?.jobs.first?["sourceName"]?.string == source
                  && switching.jobs.first?["location"]?.string == "Jeddah" && switching.jobs.first?["sourceName"] == nil,
                  "Account A's parked facts remain intact and never enrich account B's coincident row ID")
        scenarios += 1
    }

    func run() async throws {
        try await savedComparisonLifecycle()
        // Both keyboard commas describe the same lists in sharing, shortcuts and portable backups.
        do {
            func backupData(_ profile: PhoneApplicationProfile) throws -> Data {
                var state = PhoneApplicationState(); state.profile = profile
                return try JSONEncoder().encode(PhoneWorkspaceBackup(draft: state.activeDraft, records: [], recordDrafts: [], submissionHolds: []))
            }
            var profile = PhoneApplicationProfile()
            profile.skills = " Swift، Kotlin, العربية ، Swift "
            profile.targetRoles = "محاسب، محلل بيانات,,\u{00a0}مصمم\u{00a0}، محاسب"
            profile.targetCountries = " sa ، US, ae "
            let encoded = try backupData(profile)
            let document = try JSONSerialization.jsonObject(with: encoded) as! [String: Any]
            let data = document["data"] as! [String: Any]
            let savedProfile = data["profile"] as! [String: Any]
            try check(savedProfile["skills"] as? [String] == ["Swift", "Kotlin", "العربية", "Swift"],
                      "Portable export splits both commas without dropping duplicate skills")
            try check(savedProfile["targetRoles"] as? [String] == ["محاسب", "محلل بيانات", "مصمم", "محاسب"],
                      "Portable export preserves separate Arabic target roles and their order")
            try check(savedProfile["targetCountries"] as? [String] == ["sa", "US", "ae"],
                      "Portable export retains existing country spelling while separating either comma")
            let restored = try JSONDecoder().decode(PhoneWorkspaceBackup.self, from: encoded).draft.profile
            try check(restored.payload() == profile.payload() && restored.targetRoleShortcuts == profile.targetRoleShortcuts,
                      "Portable restore keeps the same shared profile and distinct search shortcuts")
            profile.targetRoles = (0..<30).map { "وظيفة \($0)" }.joined(separator: "،")
            let atLimit = try JSONDecoder().decode(PhoneWorkspaceBackup.self, from: backupData(profile))
            try check(atLimit.draft.profile.targetRoleShortcuts.count == 30, "All 30 Arabic-delimited roles survive the existing portable backup limit")
            profile.targetRoles += "،وظيفة 30"
            let aboveLimit = try backupData(profile)
            try check((try? JSONDecoder().decode(PhoneWorkspaceBackup.self, from: aboveLimit)) == nil,
                      "Arabic delimiters cannot evade the portable backup's 30-item limit")
            try check(profile.payload()["targetRoles"]?.array.count == 31,
                      "An over-limit draft is not silently truncated before service validation")
            profile.targetRoles = Array(repeating: "محاسب", count: 31).joined(separator: "،")
            let duplicateLimit = try backupData(profile)
            try check((try? JSONDecoder().decode(PhoneWorkspaceBackup.self, from: duplicateLimit)) == nil,
                      "Portable backup limits continue counting duplicate iPhone entries")
            profile.targetRoles = "محاسب"
            profile.skills = "Swift،" + String(repeating: "م", count: 1_000)
            let maximumEntry = try JSONDecoder().decode(PhoneWorkspaceBackup.self, from: backupData(profile))
            try check(maximumEntry.draft.profile.payload()["skills"]?.array.count == 2,
                      "Portable backups retain the existing 1000-unit per-entry draft allowance")
            profile.skills += "م"
            let oversizedEntry = try backupData(profile)
            try check((try? JSONDecoder().decode(PhoneWorkspaceBackup.self, from: oversizedEntry)) == nil,
                      "Arabic-delimited oversized entries still fail portable backup validation")
            scenarios += 1
        }
        // Cross-account switches preserve the exact A draft, and never display or upload it as B.
        do {
            var state = try initial(), draft = PhoneApplicationProfile()
            draft.firstName = "Private A"; draft.email = "a@example.invalid"; try draft.selectResume(pdf, filename: "A.pdf")
            state.retainDraft(draft, basedOn: 3)
            state.opportunityDraft = PhoneOpportunityDraft(url: "https://jobs.example.com/a", title: "Private unfinished A")
            state.jobs = [["id": .string("local-a"), "url": .string("https://jobs.example.com/a"), "title": .string("A role"), "company": .string("A employer"), "localOnly": .bool(true)]]
            let original = state.activeDraft
            state.connect(address: "https://second.example", workspace: "workspace-b", account: "b", server: try ApplicationServerProfile(server(0, name: "Person B")))
            try check(state.profile.firstName == "Person B" && state.profile.resumeData == nil && !state.profileNeedsSync && state.jobs.isEmpty && !state.opportunityDraft.hasContent,
                      "A fresh B workspace contains none of A's draft, PDF, links or unfinished opportunity")
            var b = state.profile; b.city = "B-only city"; state.retainDraft(b, basedOn: 0)
            state = try JSONDecoder().decode(PhoneApplicationState.self, from: JSONEncoder().encode(state))
            state.connect(address: "https://first.example", workspace: "workspace-a", account: "a-again", server: try ApplicationServerProfile(server(3)))
            try check(state.profile == original.profile && state.jobs == original.jobs && state.opportunityDraft == original.opportunityDraft && state.profileNeedsSync,
                      "A to B to relaunch to A restores A's exact selected PDF and all unfinished work")
            state.connect(address: "https://second.example", workspace: "workspace-b", account: "b-again", server: try ApplicationServerProfile(server(0, name: "Person B")))
            try check(state.profile.city == "B-only city" && state.profile.firstName == "Person B", "B's independently saved draft also survives switching back")
            scenarios += 1
        }
        // Stop intent survives offline failure, 401, process restart and deliberate pairing to the same account.
        for unauthorized in [false, true] {
            let service = TestService(), heldReview = review("held-review", approved: true)
            service.handle = { call in
                if call.route == "stop" {
                    if unauthorized { throw MobileApplicationError(message: "Expired", statusCode: 401) }
                    throw URLError(.notConnectedToInternet)
                }
                if call.route == "session" { return ["sessionToken": .string("fresh-token"), "workspaceId": .string("workspace-a"), "profile": .object(self.server(3))] }
                return self.workspace(3, plans: [heldReview], active: ["held-review"], continuation: .string("client"))
            }
            let (store, folder, tokens) = try fixture(initial(), service: service)
            await store.refresh()
            if unauthorized { await store.stopReview("held-review") } else { await store.stop() }
            let persisted = try JSONDecoder().decode(PhoneApplicationState.self, from: Data(contentsOf: folder.appendingPathComponent("phone-draft.json")))
            try check(persisted.holdsSubmission("held-review"), "Stop is durable before a failed or unauthorized server response")
            let reopened = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
            if unauthorized { _ = await reopened.connect(address: "https://first.example", code: "REPAIR") }
            await reopened.pollApprovedApplications()
            try check(!service.calls.contains(where: { $0.route == "advance" }), "A fresh server active-plan list cannot resume a held review after restart or re-pair")
            try check(!reopened.resumeReview(heldReview), "A held approved review cannot be reopened as permission to send")
            scenarios += 1
        }
        // Explicit unpaired import is destination-bound; portable recovery preserves removed bookmarks and history.
        do {
            var state = PhoneApplicationState(); var local = state.profile
            local.firstName = "Unpaired person"; try local.selectResume(pdf, filename: "Unpaired.pdf"); state.retainDraft(local, basedOn: nil)
            let savedJob: [String: ApplicationValue] = ["id": .string("local-recovery"), "url": .string("https://jobs.example.com/recovery"), "title": .string("Recovery role"), "company": .string("Synthetic employer"), "localOnly": .bool(true)]
            var retained = PhoneOpportunityRecord(scope: PhoneRecordScope(), job: PhoneRecordJob(savedJob))
            retained.stage = .applied; retained.appliedElsewhere = true; retained.note = "Retained without bookmark"
            state.applicationRecords = [retained]
            let service = TestService()
            service.handle = { call in
                if call.route == "session" { return ["sessionToken": .string("fresh-token"), "workspaceId": .string("workspace-a"), "profile": .object(self.server(0, name: ""))] }
                return self.workspace(0, name: "")
            }
            let (store, _, _) = try fixture(state, service: service)
            _ = await store.connect(address: "https://first.example", code: "PAIR")
            try check(store.profile.firstName.isEmpty && store.profile.resumeData == nil && store.hasUnpairedDraft,
                      "Connecting leaves the original unpaired profile and PDF separate")
            let stale = store.workspaceActionContext
            _ = store.keepOpportunityDraft(PhoneOpportunityDraft(title: "A newer edit"))
            try check(!store.importUnpairedDraft(context: stale), "A stale import confirmation cannot replace a newer destination draft")
            try check(store.importUnpairedDraft(context: store.workspaceActionContext) && store.profile == local,
                      "Only an explicit current-target import copies the unpaired person's exact draft")
            guard let exported = store.exportWorkspace(context: store.workspaceActionContext) else { throw MobileApplicationError(message: "Missing workspace export") }
            let backup = try NativeApplicationsStore.readWorkspaceBackup(at: exported)
            try check(backup.records.count == 1 && backup.records[0].note == retained.note && backup.draft.jobs.isEmpty,
                      "Export retains private record-only history without recreating a removed bookmark")
            let exportedBytes = try Data(contentsOf: exported)
            var wire = try JSONSerialization.jsonObject(with: exportedBytes) as! [String: Any]
            try check(wire["format"] as? String == "career-finder-phone-workspace" && wire["version"] as? Int == 1,
                      "Native export uses the shared versioned iPhone and Android envelope")
            try check(!String(decoding: exportedBytes, as: UTF8.self).contains("fresh-token") && wire["credentialAccount"] == nil,
                      "Portable export contains neither pairing credentials nor the active token")
            wire["platform"] = "android"; wire["extensions"] = ["android": ["receiptArchive": ["evidenceMode": "imported"]]]
            let portable = try JSONDecoder().decode(PhoneWorkspaceBackup.self, from: JSONSerialization.data(withJSONObject: wire))
            try check(portable.records.map(\.note) == backup.records.map(\.note) && portable.draft.profile.resumeData == pdf,
                      "Common Android envelope fields recover private history and exact CV without reading platform receipt claims")
            var unknown = backup; unknown.schemaVersion = 99
            let before = store.profile
            try check(!store.mergeBackup(unknown, context: store.workspaceActionContext) && store.profile == before,
                      "Future backup schema cannot alter a phone workspace")
            try check(store.clearWorkspaceOnPhone(context: store.workspaceActionContext) && store.profile.firstName.isEmpty && !store.connected,
                      "Explicit local clear disables the connection and removes only this scope's personal draft")
            try check(store.hasUnpairedDraft, "Clearing the connected scope preserves the separate unpaired original")
            try check(store.mergeBackup(backup, context: store.workspaceActionContext) && store.profile.firstName == local.firstName,
                      "The exported backup restores the local draft without reconnecting or approving anything")
            try check(!service.calls.contains(where: { ["profile", "submit", "advance"].contains($0.route) }),
                      "Import, export and local recovery send no profile or employer application")
            scenarios += 1
        }
        // Clearing personal phone data cannot erase a Stop barrier for an active service review.
        do {
            var state = try initial(); state.holdSubmissions(["held-after-clear"])
            let service = TestService(); service.handle = { _ in self.workspace(3, active: ["held-after-clear"], continuation: .string("client")) }
            let (store, folder, tokens) = try fixture(state, service: service)
            await store.refresh()
            try check(store.clearWorkspaceOnPhone(context: store.workspaceActionContext), "A target-bound local clear succeeds")
            let saved = try JSONDecoder().decode(PhoneApplicationState.self, from: Data(contentsOf: folder.appendingPathComponent("phone-draft.json")))
            try check(saved.holdsSubmission("held-after-clear") && !saved.connectionEnabled && saved.profile.firstName.isEmpty,
                      "A clear removes personal draft content while keeping restrictive Stop intent")
            let reopened = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
            await reopened.pollApprovedApplications()
            try check(!reopened.connected && !service.calls.contains(where: { $0.route == "advance" }), "Relaunch after clearing cannot revive an approved queue")
            scenarios += 1
        }
        // Unfinished private notes recover with their exact base revision; an explicit discard is durable.
        do {
            var state = PhoneApplicationState()
            let job: [String: ApplicationValue] = ["id": .string("local-note"), "url": .string("https://jobs.example.com/note"), "title": .string("Note role"), "company": .string("Synthetic"), "localOnly": .bool(true)]
            state.jobs = [job]
            let service = TestService(); let (store, folder, tokens) = try fixture(state, service: service)
            guard let context = store.recordEditContext(for: job) else { throw MobileApplicationError(message: "Missing draft context") }
            var draft = PhoneRecordDraft(); draft.note = "Unfinished private note"; draft.followUpOn = "2026-12-01"
            try check(store.keepRecordDraft(draft, context: context), "Background checkpoint stores an unfinished record without committing its stage")
            let reopened = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
            guard let restoredContext = reopened.recordEditContext(for: job) else { throw MobileApplicationError(message: "Missing restored context") }
            try check(reopened.restoredRecordDraft(for: restoredContext) == draft && reopened.currentRecord(for: job) == nil,
                      "Relaunch restores the note editor while the saved application mark remains unchanged")
            try check(reopened.discardRecordDraft(context: restoredContext) && reopened.restoredRecordDraft(for: restoredContext) == nil,
                      "Discard clears the unfinished checkpoint without changing saved records")
            scenarios += 1
        }
        // Older stored drafts gain an empty LinkedIn field without changing their existing data.
        do {
            var state = try initial(); var draft = state.profile
            draft.firstName = "Legacy person"; try draft.selectResume(pdf, filename: "Legacy.pdf")
            state.retainDraft(draft, basedOn: 3)
            let service = TestService(); let (_, folder, tokens) = try fixture(state, service: service)
            var json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(state)) as! [String: Any]
            for key in ["profile", "latestServerProfile"] {
                if var old = json[key] as? [String: Any] { old.removeValue(forKey: "linkedin"); json[key] = old }
            }
            try JSONSerialization.data(withJSONObject: json).write(to: folder.appendingPathComponent("phone-draft.json"))
            let restored = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
            try check(restored.profile == draft && restored.profile.linkedin.isEmpty && restored.profileNeedsSync,
                      "Profiles from before LinkedIn migrate with exact pending PDF bytes and original fields")
            try check(restored.latestServerProfile?.linkedin == "" && restored.linkedInProfileSupported == nil,
                      "Historical server profiles migrate without manufacturing current service capability")
            scenarios += 1
        }
        // Unknown or explicitly unsupported services cannot silently drop a new link or a removal.
        let unsupportedLinkedInServices: [ApplicationValue?] = [nil, .bool(false)]
        for capability in unsupportedLinkedInServices {
            let service = TestService()
            service.handle = { _ in self.workspace(3, linkedInSupport: capability) }
            let (store, folder, tokens) = try fixture(initial(), service: service)
            await store.refresh()
            var draft = store.profile; draft.linkedin = "https://sa.linkedin.com/in/Jos%C3%A9-42/?trk=discard"; draft.firstName = "Kept draft"
            try draft.selectResume(pdf, filename: "LinkedIn.pdf")
            let accepted = await store.saveProfile(draft, context: store.editContext)
            try check(!accepted && !service.calls.contains(where: { $0.route == "profile" }), "An unsupported service receives no profile PUT containing a new link")
            try check(store.profile.linkedin == "https://www.linkedin.com/in/Jos%C3%A9-42" && store.profile.resumeData == pdf && store.profileNeedsSync,
                      "A refused LinkedIn sync keeps the canonical link, profile changes and exact CV bytes locally")
            let restored = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
            try check(restored.profile == store.profile && restored.profileNeedsSync, "Unsupported-service drafts survive relaunch")
            scenarios += 1
        }
        do {
            let link = "https://www.linkedin.com/in/example-profile"
            var state = try initial(); state.acknowledge(try ApplicationServerProfile(server(3, linkedin: link)))
            let service = TestService(); service.handle = { _ in self.workspace(3, linkedin: link) }
            let (store, _, _) = try fixture(state, service: service)
            await store.refresh(); var draft = store.profile; draft.linkedin = ""
            let accepted = await store.saveProfile(draft, context: store.editContext)
            try check(!accepted && store.profile.linkedin.isEmpty && store.profileNeedsSync && !service.calls.contains(where: { $0.route == "profile" }),
                      "Removing a known link on an unverified service remains an explicit preserved draft")
            scenarios += 1
        }
        // Supported updates send exactly one canonical value and require that value in the acknowledgement.
        for omitAcknowledgement in [false, true] {
            let link = "https://www.linkedin.com/in/Jos%C3%A9-42"
            let service = TestService()
            service.handle = { call in
                if call.route == "profile" { return ["ok": .bool(true), "profile": .object(self.server(4, linkedin: omitAcknowledgement ? nil : link))] }
                return self.workspace(3, linkedInSupport: .bool(true))
            }
            let (store, _, _) = try fixture(initial(), service: service)
            await store.refresh(); var draft = store.profile; draft.linkedin = "https://SA.linkedin.com:443/in/Jos%C3%A9-42/?tracking=discard#about"
            let accepted = await store.saveProfile(draft, context: store.editContext)
            let updates = service.calls.filter { $0.route == "profile" }
            try check(updates.count == 1 && updates[0].body?["profile"]?.object["linkedin"] == .string(link),
                      "A supported service receives exactly the canonical profile URL, without tracking or credentials")
            try check(accepted == !omitAcknowledgement && store.profile.linkedin == link && store.profileNeedsSync == omitAcknowledgement,
                      "A missing LinkedIn acknowledgement cannot erase the locally retained new link")
            scenarios += 1
        }
        do {
            let link = "https://www.linkedin.com/in/example-profile"
            let service = TestService()
            service.handle = { call in
                if call.route == "profile" { return ["ok": .bool(true), "profile": .object(self.server(4, linkedin: ""))] }
                return self.workspace(3, linkedInSupport: .bool(true), linkedin: link)
            }
            let (store, _, _) = try fixture(initial(), service: service)
            await store.refresh(); var draft = store.profile; draft.linkedin = ""
            let accepted = await store.saveProfile(draft, context: store.editContext)
            try check(accepted && store.profile.linkedin.isEmpty && !store.profileNeedsSync,
                      "A confirmed service supports explicit LinkedIn link removal")
            try check(service.calls.last?.body?["profile"]?.object["linkedin"] == .string(""), "Removal sends an explicit empty profile field")
            scenarios += 1
        }
        // A malformed new field or capability rejects the entire response and preserves previous evidence.
        do {
            let link = "https://www.linkedin.com/in/example-profile"
            let service = TestService(); var response = workspace(3, linkedInSupport: .bool(true), linkedin: link)
            service.handle = { _ in response }
            let (store, folder, tokens) = try fixture(initial(), service: service)
            await store.refresh()
            let before = try Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))
            for invalid in [ApplicationValue.null, .number(1), .string("true"), .array([]), .object([:])] {
                response = workspace(4, name: "Must not replace", linkedInSupport: invalid, linkedin: link)
                let accepted = await store.refresh()
                try check(!accepted && store.linkedInProfileSupported == true && store.profile.firstName == "Example" && store.revision == 3,
                          "Malformed LinkedIn capability cannot partially install a newer workspace")
            }
            for invalid in [ApplicationValue.null, .bool(false), .number(1), .string("https://linkedin.com.evil.example/in/person"), .string("https://www.linkedin.com/in/a%2Fb")] {
                response = workspace(4, linkedInSupport: .bool(true))
                var profile = response["profile"]!.object; profile["linkedin"] = invalid; response["profile"] = .object(profile)
                let accepted = await store.refresh()
                try check(!accepted && store.profile.linkedin == link && store.revision == 3,
                          "Invalid server LinkedIn profile values are rejected without discarding the previous profile")
            }
            let after = try Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))
            try check(after == before,
                      "Rejected LinkedIn snapshots do not overwrite the saved phone workspace")
            let restored = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
            try check(restored.profile.linkedin == link && restored.linkedInProfileSupported == nil,
                      "Relaunch retains the profile link but requires fresh capability confirmation")
            response = workspace(3, linkedin: link); await store.refresh()
            try check(store.linkedInProfileSupported == nil, "Missing capability clears previously verified support")
            response = workspace(3, linkedInSupport: .bool(true), linkedin: link); await store.refresh(); await store.disconnect()
            try check(store.linkedInProfileSupported == nil && store.profile.linkedin == link, "Disconnect clears LinkedIn service capability while keeping the person's draft")
            scenarios += 1
        }
        // Reviews must display the exact link and both prepare and approval negotiate schema three.
        do {
            let link = "https://www.linkedin.com/in/example-profile", ready = linkedInReview(.string("https://www.linkedin.com/in/example-profile"))
            let job: [String: ApplicationValue] = ["id": .string("job-1"), "url": .string("https://jobs.example/role"), "title": .string("Role"), "company": .string("Fixture")]
            let service = TestService(); var prepared = false, approved = false
            service.handle = { call in
                if call.route == "prepare" { prepared = true; return ["ok": .bool(true), "plan": .object(ready)] }
                if call.route == "submit" { approved = true; return ["ok": .bool(true)] }
                return self.workspace(3, jobs: [job], plans: prepared && !approved ? [ready] : [], linkedInSupport: .bool(true), linkedin: link)
            }
            let (store, _, _) = try fixture(initial(), service: service)
            await store.refresh(); store.selected = ["job-1"]; await store.prepare()
            try check(store.plan == ready && service.calls.first(where: { $0.route == "prepare" })?.body?["reviewSchema"] == .number(3),
                      "Preparing with LinkedIn advertises the review field and retains the exact visible plan")
            let submitted = await store.submitReviewed()
            try check(submitted && service.calls.first(where: { $0.route == "submit" })?.body?["reviewSchema"] == .number(3),
                      "Approval explicitly supports the LinkedIn field in the exact reviewed payload")
            try check(service.calls.filter { $0.route == "submit" }.count == 1, "LinkedIn approval never creates an extra submission")
            scenarios += 1
        }
        let unsafeLinkedInReviews: [ApplicationValue?] = [nil, .string(""), .string("https://www.linkedin.com/in/different-person"), .null, .bool(true), .string("https://evil.example/in/person")]
        for candidate in unsafeLinkedInReviews {
            let link = "https://www.linkedin.com/in/example-profile", plan = linkedInReview(candidate)
            let service = TestService(); service.handle = { _ in self.workspace(3, plans: [plan], linkedInSupport: .bool(true), linkedin: link) }
            let (store, _, _) = try fixture(initial(), service: service)
            await store.refresh()
            try check(!store.resumeReview(plan), "An omitted, different or malformed LinkedIn summary cannot be reopened for approval")
            let submitted = await store.submitReviewed()
            try check(!submitted && !service.calls.contains(where: { $0.route == "submit" }), "Unsafe LinkedIn review data produces no application approval")
            scenarios += 1
        }
        // A dirty revision must survive disk reload; a later GET cannot silently rebase it.
        do {
            var state = try initial(7); var draft = state.profile; draft.firstName = "Phone draft"
            try draft.selectResume(pdf, filename: "Chosen.pdf"); state.retainDraft(draft, basedOn: 7)
            let service = TestService(); service.handle = { _ in self.workspace(8, name: "Other device") }
            let (store, folder, tokens) = try fixture(state, service: service)
            await store.refresh()
            try check(store.profile.firstName == "Phone draft" && store.profile.resumeData == pdf, "Refresh preserves dirty fields and exact CV bytes")
            try check(store.revision == 7 && store.latestServerRevision == 8 && store.profileHasConflict, "Dirty base stays at revision seven")
            let restored = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
            try check(restored.revision == 7 && restored.profileHasConflict, "Conflict base and latest revision persist across reload")
            let refused = await restored.saveProfile(restored.profile, context: restored.editContext)
            try check(!refused && !service.calls.contains(where: { $0.route == "profile" }), "Unresolved conflict performs no PUT")
            try check(restored.keepDraftAfterReview(restored.profile, context: restored.editContext, serverRevision: 8), "Explicit version choice rebases the kept draft")
            try check(restored.revision == 8 && restored.profile.resumeData == pdf && restored.profileNeedsSync, "Rebase keeps pending PDF bytes")
            service.handle = { call in
                if call.route == "profile" { return ["ok": .bool(true), "profile": .object(self.server(9, name: "Phone draft", resume: self.metadata(draft)))] }
                throw URLError(.notConnectedToInternet)
            }
            let saved = await restored.saveProfile(restored.profile, context: restored.editContext)
            try check(saved && restored.revision == 9 && !restored.profileNeedsSync, "Successful PUT is reconciled without a second GET")
            try check(restored.profile.resumeData == nil && restored.profile.resumeSHA256 == draft.resumeSHA256, "Acknowledgement replaces pending bytes with exact server metadata")
            let persisted = try JSONDecoder().decode(PhoneApplicationState.self, from: Data(contentsOf: folder.appendingPathComponent("phone-draft.json")))
            try check(persisted.profileRevision == 9 && !persisted.profileNeedsSync, "Successful acknowledgement is durable before returning")
            var reduced = persisted; reduced.receive(try ApplicationServerProfile(server(2)))
            try check(reduced.profileRevision == 9 && reduced.latestServerRevision == 9, "State reducer never regresses a confirmed revision within one workspace")
            try check(service.calls.last?.body?["expectedRevision"]?.integer == 8, "The explicitly reviewed base is sent")
            scenarios += 1
        }
        // Existing drafts without the new revision field are preserved, never assumed to be revision zero.
        do {
            var state = try initial(4); state.profileNeedsSync = true; state.profile.firstName = "Legacy draft"
            let service = TestService(); service.handle = { _ in self.workspace(6) }
            let (_, folder, tokens) = try fixture(state, service: service)
            var old = try JSONSerialization.jsonObject(with: JSONEncoder().encode(state)) as! [String: Any]
            for key in ["profileRevision", "latestServerRevision", "latestServerProfile", "connectionEnabled", "credentialAccount", "opportunityDraft", "applicationRecordSchema", "applicationRecords"] { old.removeValue(forKey: key) }
            try JSONSerialization.data(withJSONObject: old).write(to: folder.appendingPathComponent("phone-draft.json"))
            tokens.values[state.serviceAddress] = "legacy-synthetic-token"
            let store = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
            await store.refresh()
            try check(store.profile.firstName == "Legacy draft" && store.revision == nil, "Legacy dirty draft migrates with an unknown base")
            try check(store.profileHasConflict, "Legacy draft requires a deliberate conflict choice")
            try check(!store.opportunityDraft.hasContent, "Older files receive an empty opportunity draft without seeded identity")
            scenarios += 1
        }
        // An older GET or its 401 error must not roll back a completed PUT or newer receipts.
        for returnError in [false, true] {
            let service = TestService(); let gate = DelayedResponse(); var first = true
            var selectedPDF = PhoneApplicationProfile(); try selectedPDF.selectResume(pdf, filename: "Current.pdf")
            let receipt: [String: ApplicationValue] = ["id": .string("receipt-attempt"), "state": .string("confirmed"), "applicationId": .string("synthetic-receipt"), "provider": .string("lever"), "evidenceMode": .string("test")]
            service.handle = { call in
                if call.route == "profile" { return ["ok": .bool(true), "profile": .object(self.server(4, name: "Saved", resume: self.metadata(selectedPDF)))] }
                if first { first = false; return try await gate.wait() }
                return self.workspace(4, name: "Saved", attempts: [receipt], resume: self.metadata(selectedPDF))
            }
            let (store, _, _) = try fixture(initial(), service: service)
            let oldGET = Task { await store.refresh() }; try await waitUntil { gate.started }
            var draft = store.profile; draft.firstName = "Saved"; try draft.selectResume(pdf, filename: "Current.pdf")
            let saved = await store.saveProfile(draft, context: store.editContext); try check(saved, "PUT completes while an obsolete GET is suspended")
            await store.refresh()
            if returnError { gate.fail(MobileApplicationError(message: "Old connection expired", statusCode: 401)) }
            else { gate.finish(workspace(3, name: "Old", attempts: [["state": .string("dispatching")]])) }
            _ = await oldGET.value
            try check(store.connected && store.revision == 4 && store.profile.firstName == "Saved", "Obsolete GET response/error cannot change acknowledged profile or authentication")
            try check(store.profile.resumeName == "Current.pdf" && store.profile.resumeData == nil, "Obsolete GET cannot restore stale PDF metadata or bytes")
            try check(store.attempts.first?["state"]?.string == "confirmed", "Confirmed receipt cannot regress to in-flight from an older GET")
            scenarios += 1
        }
        // Switching connections rejects old data and old authorization errors, and cannot reuse another workspace's PDF.
        for returnError in [false, true] {
            var state = try initial(9)
            var oldPDF = state.profile; try oldPDF.selectResume(pdf, filename: "Old-workspace.pdf")
            state.acknowledge(try ApplicationServerProfile(server(9, resume: metadata(oldPDF))))
            let oldService = TestService(); let newService = TestService("https://second.example"); let gate = DelayedResponse()
            oldService.handle = { call in
                if call.route == "session/revoke" { return ["ok": .bool(true)] }; return try await gate.wait()
            }
            newService.handle = { call in
                if call.route == "session" { return ["ok": .bool(true), "sessionToken": .string("new-synthetic-token"), "workspaceId": .string("workspace-b"), "profile": .object(self.server(0, name: "Different person", resume: self.metadata(oldPDF)))] }
                return self.workspace(0, name: "Different person", jobs: [["id": .string("new-job"), "url": .string("https://jobs.example/new"), "title": .string("New role"), "company": .string("New company")]],
                    attempts: [["id": .string("shared-attempt-id"), "state": .string("ready"), "resumeName": .string("Workspace-B.pdf"), "profileRevision": .number(0)]], workspace: "workspace-b")
            }
            let (store, folder, _) = try fixture(state, service: oldService, factory: { url, token in
                let service = url.host == "second.example" ? newService : oldService; service.token = token; return service
            })
            let oldGET = Task { await store.refresh() }; try await waitUntil { gate.started }
            let connected = await store.connect(address: "https://SECOND.example:443/", code: "SYNTHETIC")
            try check(connected && store.serviceAddress == "https://second.example", "New connection uses a canonical service origin")
            if returnError { gate.fail(MobileApplicationError(message: "Old token expired", statusCode: 401)) }
            else { gate.finish(workspace(99, name: "Old reply", jobs: [["id": .string("old-job")]],
                attempts: [["id": .string("shared-attempt-id"), "state": .string("ready"), "resumeName": .string("Workspace-A.pdf"), "profileRevision": .number(99)]])) }
            _ = await oldGET.value
            try check(store.connected && store.jobs.first?["id"]?.string == "new-job", "Obsolete connection response/error cannot repopulate or disconnect the new workspace")
            try check(store.attempts.count == 1 && ApplicationCVDetails(attempt: store.attempts[0]).resumeName == "Workspace-B.pdf"
                      && ApplicationCVDetails(attempt: store.attempts[0]).profileRevision == 0,
                      "A delayed old-owner attempt cannot replace the new workspace's filename even when its attempt ID matches")
            try check(!store.profileNeedsSync && store.revision == 0 && store.profile.firstName == "Different person", "A different workspace displays only its own profile without adopting the previous person's draft")
            try check(store.profile.resumeName.isEmpty && store.profile.resumeData == nil
                      && store.profile.resumeSize == nil && store.profile.resumeSHA256 == nil,
                      "The new workspace's no-CV acknowledgement contains none of the previous workspace's CV metadata or bytes")
            try check(!store.profile.resumeChanged && !store.profile.resumeRemoved && store.profile.payload()["resume"] == nil,
                      "Acknowledging the new workspace does not fabricate a CV upload or an explicit deletion")
            let persisted = try JSONDecoder().decode(PhoneApplicationState.self, from: Data(contentsOf: folder.appendingPathComponent("phone-draft.json")))
            try check(persisted.workspaceDrafts.first(where: { $0.scope == state.recordScope })?.profile == state.profile,
                      "The original workspace's profile and CV metadata remain intact in their own archive")
            scenarios += 1
        }
        // Local disconnect remains usable offline, and an expired session cannot remain visually connected.
        do {
            var state = try initial(); var draft = state.profile; try draft.selectResume(pdf, filename: "Kept.pdf"); state.retainDraft(draft, basedOn: 3)
            let service = TestService(); service.handle = { _ in throw URLError(.notConnectedToInternet) }
            let (store, folder, tokens) = try fixture(state, service: service)
            await store.disconnect()
            try check(!store.connected && tokens.values.isEmpty, "Offline disconnect removes the local token immediately")
            let stored = try JSONDecoder().decode(PhoneApplicationState.self, from: Data(contentsOf: folder.appendingPathComponent("phone-draft.json")))
            try check(!stored.connectionEnabled && stored.profile.resumeData == pdf, "Offline disconnect persists disabled connection and keeps the draft")
            let reopened = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
            try check(!reopened.connected, "Relaunch does not resurrect an offline-disconnected session")
            let expired = TestService(); expired.handle = { _ in throw MobileApplicationError(message: "Expired", statusCode: 401) }
            let (expiredStore, _, expiredTokens) = try fixture(state, service: expired)
            await expiredStore.refresh()
            try check(!expiredStore.connected && expiredTokens.values.isEmpty, "401 expires the active session and removes its token")
            try check(expiredStore.profile.resumeData == pdf && expiredStore.revision == 3, "401 retains draft bytes and conflict base for recovery")
            scenarios += 1
        }
        // Public links survive failed network saves, and canonical remapping retains explicit choices.
        do {
            let service = TestService(); service.handle = { _ in throw URLError(.notConnectedToInternet) }
            let (store, folder, _) = try fixture(initial(), service: service)
            let saved = await store.addJob(url: "https://jobs.example/one", title: "Engineer", company: "Fixture", location: "Remote", country: "NZ")
            try check(saved && store.jobs.count == 1 && store.jobs[0]["localOnly"]?.bool == true, "Connected network failure still keeps the explicit saved job locally")
            let persisted = try JSONDecoder().decode(PhoneApplicationState.self, from: Data(contentsOf: folder.appendingPathComponent("phone-draft.json")))
            try check(persisted.jobs.count == 1, "Saved link survives relaunch after network failure")
            let local: [String: ApplicationValue] = ["id": .string("local-a"), "url": .string("https://jobs.lever.co/fixture/posting/apply?utm_source=phone"), "localOnly": .bool(true)]
            let remote: [String: ApplicationValue] = ["id": .string("remote-a"), "url": .string("https://jobs.lever.co/fixture/posting")]
            let merged = ApplicationJobMerge(remote: [remote], local: [local], selected: ["local-a"], answers: ["local-a": ["consentMarketing": .bool(false)]])
            try check(merged.jobs.count == 1 && merged.selected == ["remote-a"], "Canonical local-to-server merge preserves selection without duplicate cards")
            try check(merged.answers["remote-a"]?["consentMarketing"] == .bool(false), "Explicit negative marketing choice survives identity remapping")
            scenarios += 1
        }
        // All reviews remain reachable. Replacement stops only an unapproved plan, atomically at the server.
        do {
            let service = TestService(); var plans = [review("first"), review("second")]
            let job: [String: ApplicationValue] = ["id": .string("job-1"), "url": .string("https://jobs.example/one"), "title": .string("Role"), "company": .string("Fixture")]
            service.handle = { call in
                if call.route == "stop" { plans.removeAll { $0["id"] == call.body?["planId"] }; return ["ok": .bool(true)] }
                if call.route == "prepare" { let new = self.review("replacement"); plans.append(new); return ["ok": .bool(true), "plan": .object(new)] }
                return self.workspace(3, jobs: [job], plans: plans)
            }
            let (store, _, _) = try fixture(initial(), service: service); await store.refresh()
            try check(store.availableReviews.count == 2, "Every recoverable plan is exposed to the view")
            try check(store.resumeReview(plans[1]) && store.plan?["id"]?.string == "second", "A review other than the first can be resumed")
            await store.prepare(replacingUnapprovedReview: true)
            let mutations = service.calls.filter { $0.method == "POST" }
            try check(mutations.map(\.route) == ["stop", "prepare"], "Explicit replacement stops old review before preparing new one")
            try check(mutations.first?.body?["onlyIfUnapproved"] == .bool(true), "Replacement uses the atomic unapproved guard")
            try check(store.plan?["id"]?.string == "replacement" && !store.availableReviews.contains(where: { $0.id == "second" }), "Obsolete review is removed and replacement is current")
            let preparedCount = service.calls.filter { $0.route == "prepare" }.count
            service.handle = { call in
                if call.route == "stop" { plans = [self.review("replacement", approved: true, itemState: "rate_limited")]; throw MobileApplicationError(message: "Already approved", statusCode: 409, code: "review_already_approved") }
                return self.workspace(3, jobs: [job], plans: plans)
            }
            await store.prepare(replacingUnapprovedReview: true)
            try check(service.calls.filter { $0.route == "prepare" }.count == preparedCount, "Approval race prevents replacement prepare")
            try check(store.plan?["approvedAt"]?.string != nil && store.plan?["items"]?.array.first?.object["state"]?.string == "rate_limited", "Conflict refresh retains the approved cooldown review")
            let stoppedCount = service.calls.filter { $0.route == "stop" }.count
            await store.prepare(replacingUnapprovedReview: true)
            try check(service.calls.filter { $0.route == "stop" }.count == stoppedCount, "Known approved review is never implicitly stopped")
            let stale = store.plan!
            service.handle = { _ in self.workspace(3, jobs: [job]) }; await store.refresh()
            try check(store.plan == nil && !store.resumeReview(stale), "Expired or completed review cannot remain open or be resumed from stale UI data")
            scenarios += 1
        }
        // Changing any preparation inputs while awaiting the service cannot install an approvable old snapshot.
        for changeSelection in [false, true] {
            let service = TestService(), gate = DelayedResponse()
            let job: [String: ApplicationValue] = ["id": .string("job-1"), "url": .string("https://jobs.example/one"), "title": .string("Role"), "company": .string("Fixture")]
            service.handle = { call in
                if call.route == "prepare" { return try await gate.wait() }
                if call.route == "stop" { return ["ok": .bool(true)] }
                return self.workspace(3, jobs: [job])
            }
            let (store, _, _) = try fixture(initial(), service: service); await store.refresh()
            store.selected = ["job-1"]; store.answers["job-1"] = ["consentMarketing": .bool(false)]
            let preparing = Task { await store.prepare() }; try await waitUntil { gate.started }
            if changeSelection { store.selected = [] }
            else { store.answers["job-1"]?["comments"] = .string("A newer explicit choice") }
            gate.finish(["ok": .bool(true), "plan": .object(review("obsolete"))]); await preparing.value
            try check(store.plan == nil, "Obsolete selection or answer response cannot become the current review")
            try check(service.calls.contains(where: { $0.route == "stop" && $0.body?["planId"]?.string == "obsolete" && $0.body?["onlyIfUnapproved"] == .bool(true) }), "Obsolete unapproved review is retired with the atomic guard")
            try check(!service.calls.contains(where: { $0.route == "submit" }), "Input changes never cause a submission")
            scenarios += 1
        }
        // Malformed success envelopes cannot erase current jobs, receipts, reviews, or persisted profile data.
        do {
            let service = TestService()
            let job: [String: ApplicationValue] = ["id": .string("job-1"), "url": .string("https://jobs.example/one"), "title": .string("Role"), "company": .string("Fixture")]
            let attempt: [String: ApplicationValue] = ["id": .string("known-receipt"), "state": .string("confirmed")]
            let good = workspace(3, jobs: [job], attempts: [attempt], plans: [review("known-review")])
            service.handle = { _ in good }
            let (store, folder, _) = try fixture(initial(), service: service); await store.refresh()
            let before = try Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))
            var cases: [[String: ApplicationValue]] = []
            for key in ["workspaceId", "jobs", "attempts", "activePlanIds", "recoverablePlans"] {
                var bad = good; bad.removeValue(forKey: key); bad["profile"] = .object(server(8, name: "Invalid snapshot")); cases.append(bad)
            }
            var wrongWorkspace = good; wrongWorkspace["workspaceId"] = .string("another-workspace"); cases.append(wrongWorkspace)
            var wrongArray = good; wrongArray["attempts"] = .array([.string("not an attempt")]); cases.append(wrongArray)
            var badCV = good; badCV["profile"] = .object(server(8, resume: .object(["name": .string("Unknown.pdf")]))); cases.append(badCV)
            for bad in cases {
                service.handle = { _ in bad }; await store.refresh()
                let after = try Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))
                try check(store.jobs == [job] && store.attempts == [attempt] && store.availableReviews.count == 1,
                          "Malformed workspace preserves the prior visible evidence")
                try check(store.revision == 3 && after == before, "Malformed profile/workspace never reaches persistence")
            }
            scenarios += 1
        }
        // Background checkpointing preserves edits; an explicit discard adopts the latest server version.
        do {
            let service = TestService(); service.handle = { _ in self.workspace(4, name: "Latest service") }
            let (store, _, _) = try fixture(initial(), service: service)
            let context = store.editContext, original = store.profile
            var changed = original; changed.firstName = "Unsaved editor"; try changed.selectResume(pdf, filename: "Background.pdf")
            try check(store.keepProfileDraft(changed, context: context), "Background checkpoint saves exact editor state locally")
            await store.refresh()
            try check(store.profile.firstName == "Unsaved editor" && store.profile.resumeData == pdf && store.revision == 3, "Background refresh preserves checkpointed fields, CV, and base")
            let approved = await store.submitReviewed()
            try check(!approved && !service.calls.contains(where: { $0.route == "submit" }), "Pending draft cannot approve an old review")
            try check(store.discardCheckpoint(restoring: original, wasDirty: false, context: context), "Explicit discard can resolve a checkpoint")
            try check(store.profile.firstName == "Latest service" && store.revision == 4 && !store.profileNeedsSync, "Discard uses current service profile instead of reverting its newer revision")
            scenarios += 1
        }
        // Failed disk writes must never report a durable profile confirmation; corrupted drafts remain untouched.
        do {
            let service = TestService(); let (store, folder, _) = try fixture(initial(), service: service)
            let path = folder.appendingPathComponent("phone-draft.json")
            service.handle = { _ in
                try FileManager.default.removeItem(at: path); try FileManager.default.createDirectory(at: path, withIntermediateDirectories: false)
                return ["ok": .bool(true), "profile": .object(self.server(4, name: "Saved remotely"))]
            }
            var draft = store.profile; draft.firstName = "Saved remotely"
            let saved = await store.saveProfile(draft, context: store.editContext)
            try check(!saved && store.profileNeedsSync && store.revision == 3, "Failed acknowledgement persistence keeps the draft pending")
            try check(store.message?.contains("service saved") == true, "Write failure distinguishes remote save from missing phone confirmation")
            try FileManager.default.removeItem(at: path); let corrupted = Data("not valid JSON".utf8); try corrupted.write(to: path)
            let reopened = NativeApplicationsStore(folder: folder, credentials: TestTokens(), clientFactory: { _, _ in service })
            let refused = await reopened.saveProfile(PhoneApplicationProfile(), context: reopened.editContext)
            let after = try Data(contentsOf: path)
            try check(!refused && after == corrupted, "Unreadable existing draft is never overwritten")
            scenarios += 1
        }
        // A temporary Keychain lock is not corruption of an otherwise writable draft file.
        do {
            let service = TestService(); let tokens = TestTokens(); tokens.failLoad = true
            let (store, _, _) = try fixture(initial(), service: service, tokens: tokens)
            var draft = store.profile; draft.firstName = "Kept while locked"
            try check(!store.connected && store.keepProfileDraft(draft, context: store.editContext), "Locked credentials do not block local draft persistence")
            tokens.failLoad = false; service.handle = { _ in self.workspace(3) }; await store.refresh()
            try check(store.connected && store.profile.firstName == "Kept while locked", "Foreground refresh can restore unlocked credentials without losing the draft")
            scenarios += 1
        }
        try await runLiveSubmissionCapability()
        try await runHostedContinuation()
        try await runReviewedCVHistory()
        try await runPrivateRecords()
    }

    func runReviewedCVHistory() async throws {
        var cvA = PhoneApplicationProfile(); try cvA.selectResume(pdf, filename: "CV-A.pdf")
        var cvB = PhoneApplicationProfile(); try cvB.selectResume(pdf, filename: "CV-B.pdf")
        try check(cvA.resumeSHA256 == cvB.resumeSHA256, "The fixture deliberately uses identical PDF bytes under different display filenames")
        let jobA: [String: ApplicationValue] = ["id": .string("cv-job-a"), "url": .string("https://jobs.example/cv-a"), "title": .string("Designer A"), "company": .string("Synthetic Studio")]
        let jobB: [String: ApplicationValue] = ["id": .string("cv-job-b"), "url": .string("https://jobs.example/cv-b"), "title": .string("Designer B"), "company": .string("Synthetic Studio")]
        func cvReview(_ id: String, profile: PhoneApplicationProfile, revision: Int, job: [String: ApplicationValue]) -> [String: ApplicationValue] {
            var plan = review(id, revision: revision), item = review(id, revision: revision)["items"]!.array[0].object
            item["jobId"] = job["id"]; item["job"] = .object(job); item["resume"] = metadata(profile)
            plan["items"] = .array([.object(item)]); return plan
        }
        let planA = cvReview("cv-plan-a", profile: cvA, revision: 3, job: jobA)
        let planB = cvReview("cv-plan-b", profile: cvB, revision: 4, job: jobB)
        let attemptA: [String: ApplicationValue] = ["id": .string("cv-attempt-a"), "planId": .string("cv-plan-a"), "state": .string("ready"),
            "jobId": jobA["id"]!, "resumeName": .string("CV-A.pdf"), "profileRevision": .number(3), "evidenceMode": .string("test")]
        let attemptB: [String: ApplicationValue] = ["id": .string("cv-attempt-b"), "planId": .string("cv-plan-b"), "state": .string("ready"),
            "jobId": jobB["id"]!, "resumeName": .string("CV-B.pdf"), "profileRevision": .number(4), "evidenceMode": .string("test")]
        let legacy: [String: ApplicationValue] = ["id": .string("legacy-attempt"), "state": .string("uncertain")]
        let service = TestService(); var savedB = false, preparedA = false, preparedB = false
        service.handle = { call in
            switch call.route {
            case "profile":
                guard call.method == "PUT", call.body?["expectedRevision"] == .number(3),
                      call.body?["profile"]?.object["resume"]?.object["name"]?.string == "CV-B.pdf" else {
                    throw MobileApplicationError(message: "Unexpected synthetic CV profile update")
                }
                savedB = true; return ["ok": .bool(true), "profile": .object(self.server(4, resume: self.metadata(cvB)))]
            case "prepare":
                if savedB { preparedB = true } else { preparedA = true }
                return ["ok": .bool(true), "plan": .object(savedB ? planB : planA)]
            case "workspace":
                return self.workspace(savedB ? 4 : 3, jobs: [jobA, jobB],
                    attempts: (preparedA ? [attemptA] : []) + (preparedB ? [attemptB] : []) + [legacy],
                    plans: (preparedA ? [planA] : []) + (preparedB ? [planB] : []), resume: self.metadata(savedB ? cvB : cvA))
            default: throw MobileApplicationError(message: "Unexpected synthetic CV history request")
            }
        }
        let (store, folder, tokens) = try fixture(initial(), service: service)
        let loaded = await store.refresh(); try check(loaded, "The scoped CV-A fixture loads through the real workspace parser")
        store.selected = ["cv-job-a"]; await store.prepare()
        try check(store.plan == planA && ApplicationCVDetails(reviewItem: store.plan!["items"]!.array[0].object, plan: store.plan!).resumeName == "CV-A.pdf",
                  "The native prepare path retains the CV-A name from its actual review item")
        var selectedB = store.profile; try selectedB.selectResume(pdf, filename: "CV-B.pdf")
        let saved = await store.saveProfile(selectedB, context: store.editContext)
        try check(saved && store.profile.resumeName == "CV-B.pdf" && store.revision == 4, "Changing the selected filename records the new profile revision")
        await store.refresh()
        try check(ApplicationCVDetails(attempt: store.attempts.first { $0["id"] == attemptA["id"] }!).resumeName == "CV-A.pdf"
                  && ApplicationCVDetails(attempt: attemptA).profileRevision == 3,
                  "The earlier attempt keeps CV-A and its reviewed revision after the current profile becomes CV-B")
        try check(!store.resumeReview(planA), "Historical filename visibility does not make a stale review approvable")
        let staleSubmit = await store.submitReviewed()
        try check(!staleSubmit && !service.calls.contains { $0.route == "submit" }, "The stale review sends no approval request")
        store.selected = ["cv-job-b"]; await store.prepare()
        try check(store.plan == planB && ApplicationCVDetails(reviewItem: store.plan!["items"]!.array[0].object, plan: store.plan!).resumeName == "CV-B.pdf",
                  "A new review uses CV-B without rewriting CV-A's attempt")
        let reopened = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
        try check(reopened.attempts.isEmpty, "Restart does not invent an unscoped local attempt cache")
        let reloaded = await reopened.refresh()
        let details = reopened.attempts.map { ApplicationCVDetails(attempt: $0) }
        try check(reloaded && details.map(\.resumeName) == ["CV-A.pdf", "CV-B.pdf", nil]
                  && details.map(\.profileRevision) == [3, 4, nil] && reopened.profile.resumeName == "CV-B.pdf",
                  "An authenticated reload restores both immutable filenames and leaves missing historical metadata absent")
        try check(service.calls.filter { $0.route == "prepare" }.count == 2
                  && service.calls.allSatisfy { ["workspace", "profile", "prepare"].contains($0.route) }
                  && reopened.attempts.allSatisfy { !MobileApplicationPolicy.isVerified($0) },
                  "Filename display and reload add no submission, upload, approval or verified receipt")
        scenarios += 1
    }

    func runPrivateRecords() async throws {
        let publicURL = "https://careers.example.com/roles/designer"
        let localJob: [String: ApplicationValue] = ["id": .string("local-record-job"), "url": .string(publicURL),
            "title": .string("Product designer"), "company": .string("Example employer"), "localOnly": .bool(true)]
        let now = ISO8601DateFormatter().date(from: "2026-11-17T12:00:00Z")!
        // Readiness uses actual required field and selected-file rules; it never verifies a person or application.
        do {
            var profile = PhoneApplicationProfile()
            try check(!ApplicationProfileReadiness(profile: profile).ready && ApplicationProfileReadiness(profile: profile).nextAction == "Add your name", "A fresh applicant sees the first missing essential")
            try check(ApplicationProfileReadiness(profile: profile).emailEssentialLabel == "Email needed", "A fresh profile still needs an email")
            profile.firstName = "  نور  "; profile.email = "PERSON@EXAMPLE.COM"
            try check(ApplicationProfileReadiness(profile: profile).nameReady && ApplicationProfileReadiness(profile: profile).emailReady && ApplicationProfileReadiness(profile: profile).emailEssentialLabel == "Email added", "Single and Unicode names and a normalizable email are accepted")
            profile.email = ""
            try check(ApplicationProfileReadiness(profile: profile).emailEssentialLabel == "Email needed" && ApplicationProfileReadiness(profile: profile).nextAction == "Add your email", "An empty email asks for an address")
            profile.email = "invalid-email"
            try check(ApplicationProfileReadiness(profile: profile).emailEssentialLabel == "Check your email" && ApplicationProfileReadiness(profile: profile).nextAction == "Check your email" && ApplicationProfileReadiness(profile: profile).emailNeedsCorrection, "A typed invalid email asks for a check without blocking the draft")
            profile.email = " "
            try check(ApplicationProfileReadiness(profile: profile).emailEssentialLabel == "Check your email" && ApplicationProfileReadiness(profile: profile).emailNeedsCorrection, "Whitespace in the email field is not treated as empty")
            profile.email = "person+jobs@example.org"
            try check(ApplicationProfileReadiness(profile: profile).emailEssentialLabel == "Email added" && ApplicationProfileReadiness(profile: profile).emailReady && !ApplicationProfileReadiness(profile: profile).emailNeedsCorrection, "A reply address is marked added")
            for bad in ["person", "a@localhost", "a b@example.com", "a@example.com\n", String(repeating: "a", count: 65) + "@example.com"] {
                profile.email = bad
                let readiness = ApplicationProfileReadiness(profile: profile)
                try check(!readiness.emailReady && readiness.emailEssentialLabel == "Check your email" && readiness.emailNeedsCorrection, "Invalid email is visible before a server review fails")
            }
            profile.email = "person@example.com"; try profile.selectResume(pdf, filename: "Resume.pdf")
            try check(ApplicationProfileReadiness(profile: profile).ready, "A valid selected PDF completes the three essentials")
            profile.resumeData = nil
            try check(!ApplicationProfileReadiness(profile: profile).resumeReady, "Unresolved changed-CV state cannot pass the metadata-only readiness check")
            profile.resumeChanged = false
            try check(ApplicationProfileReadiness(profile: profile).resumeReady, "Validated service CV metadata is useful without reconstructing bytes")
            profile.resumeRemoved = true
            try check(!ApplicationProfileReadiness(profile: profile).resumeReady, "An explicitly removed CV is not ready")
            scenarios += 1
        }
        // Civil dates survive time zones and reject normalization of impossible days.
        do {
            for value in ["1500-02-29", "1900-02-29", "2026-02-29", "2026-02-30", "2026-13-01", "2026-01-00", "2026-1-01", "0000-01-01", "2026-11-17T00:00:00Z"] {
                try check(!PhoneRecordDay.valid(value), "Invalid civil date is not normalized into another day")
            }
            for zone in ["Pacific/Kiritimati", "America/Los_Angeles", "Asia/Riyadh", "America/New_York"] {
                let zone = TimeZone(identifier: zone)!
                for value in ["2024-02-29", "2026-03-08", "2026-11-01", "2026-11-17"] {
                    let date = PhoneRecordDay.date(value, zone: zone)!
                    try check(PhoneRecordDay.string(date, zone: zone) == value, "The chosen Gregorian day remains literal across DST and time zones")
                }
            }
            try check(MobileApplicationPolicy.jobIdentity("HTTPS://CAREERS.example.com:443/roles/designer/?utm_source=a#top") == MobileApplicationPolicy.jobIdentity(publicURL), "Existing URL identity unifies host/default-port/tracking variants for private records")
            scenarios += 1
        }
        // Local stage/date/note data is durable, canceled edits do nothing, and clearing applied is deliberate.
        do {
            var state = PhoneApplicationState(); state.jobs = [localJob]
            state.opportunityDraft.title = "Unrelated draft"
            let service = TestService(); let (store, folder, tokens) = try fixture(state, service: service)
            let context = store.recordEditContext(for: localJob)!
            var draft = PhoneRecordDraft(); draft.stage = .applied; draft.appliedOn = "2026-11-16"; draft.followUpOn = "2026-11-20"; draft.note = "Private follow-up note"
            draft.manualResumeName = "Manual-CV-A.pdf"
            let before = try Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))
            let canceled = draft; _ = canceled
            let unchanged = try Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))
            try check(before == unchanged && store.currentRecord(for: localJob) == nil, "Editing and canceling a value draft leaves the persisted record unchanged")
            try check(store.saveRecord(draft, context: context, now: now), "A local application record saves without an account")
            try check(store.isMarkedApplied(localJob) && store.attempts.isEmpty && service.calls.isEmpty, "A self-reported application creates no receipt or external request")
            let restored = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
            try check(restored.currentRecord(for: localJob)?.note == draft.note && restored.followUpDay(for: localJob) == "2026-11-20", "Private note and civil follow-up date survive a real disk reload")
            try check(restored.currentRecord(for: localJob)?.manualResumeName == "Manual-CV-A.pdf", "An applied record retains its self-entered filename on reload")
            try check(restored.opportunityDraft.title == "Unrelated draft", "Saving an application record preserves an unrelated opportunity draft")
            var closed = draft; closed.stage = .closed
            try check(store.saveRecord(closed, context: store.recordEditContext(for: localJob)!, now: now) && store.isMarkedApplied(localJob), "Closing an applied application retains duplicate protection")
            try check(store.followUpDay(for: localJob) == nil, "Closed records do not appear as active follow-ups")
            var saved = closed; saved.stage = .saved
            let correctionContext = store.recordEditContext(for: localJob)!
            let beforeCorrection = try Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))
            try check(!store.saveRecord(saved, context: correctionContext, now: now), "Saved cannot clear an applied mark without explicit confirmation")
            let afterCanceledCorrection = try Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))
            try check(beforeCorrection == afterCanceledCorrection, "Canceling the not-applied correction keeps every persisted field unchanged")
            try check(store.saveRecord(saved, context: correctionContext, confirmNotApplied: true, now: now) && !store.isMarkedApplied(localJob), "Explicit not-applied confirmation clears only the local duplicate mark")
            try check(!store.saveRecord(draft, context: context, now: now), "An earlier editor revision cannot overwrite a newer saved record")
            scenarios += 1
        }
        // Bad dates/notes and unreadable future record formats never overwrite existing phone data.
        do {
            var state = PhoneApplicationState(); state.jobs = [localJob]
            let service = TestService(); let (store, folder, tokens) = try fixture(state, service: service)
            let context = store.recordEditContext(for: localJob)!
            for bad in ["2026-02-30", "2026-11-19"] {
                var draft = PhoneRecordDraft(); draft.appliedOn = bad
                try check(!store.saveRecord(draft, context: context, now: now), "Impossible and newly future application dates cannot save")
            }
            var badNote = PhoneRecordDraft(); badNote.note = String(repeating: "x", count: 2_001)
            try check(!store.saveRecord(badNote, context: context, now: now), "An oversized private note is kept in the editor, not written to storage")
            var data = try JSONSerialization.jsonObject(with: Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))) as! [String: Any]
            data["applicationRecordSchema"] = 2
            let future = try JSONSerialization.data(withJSONObject: data)
            try future.write(to: folder.appendingPathComponent("phone-draft.json"))
            let reopened = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
            try check(!reopened.keepOpportunityDraft(PhoneOpportunityDraft(url: publicURL)), "A future private-record schema blocks overwrite rather than resetting the workspace")
            let kept = try Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))
            try check(kept == future, "Future-format phone data remains byte-for-byte intact")
            scenarios += 1
        }
        // Removing a bookmark is distinct from deleting useful private application history.
        do {
            var state = PhoneApplicationState(); state.jobs = [localJob]
            let service = TestService(); let (store, folder, _) = try fixture(state, service: service)
            let path = folder.appendingPathComponent("phone-draft.json"), context = store.recordEditContext(for: localJob)!
            let originalBytes = try Data(contentsOf: path)
            try FileManager.default.removeItem(at: path); try FileManager.default.createDirectory(at: path, withIntermediateDirectories: false)
            var draft = PhoneRecordDraft(); draft.note = "Do not lose this value draft"
            try check(!store.saveRecord(draft, context: context, now: now) && store.currentRecord(for: localJob) == nil,
                      "A real atomic-file write failure leaves the live saved record unchanged")
            try FileManager.default.removeItem(at: path); try originalBytes.write(to: path)
            try check(store.saveRecord(draft, context: context, now: now) && store.currentRecord(for: localJob)?.note == draft.note,
                      "The same editor value remains saveable after a recoverable storage failure")
            scenarios += 1
        }
        do {
            var state = PhoneApplicationState(); state.jobs = [localJob]
            state.opportunityDraft.title = "Keep this separate draft"
            let service = TestService(); let (store, folder, _) = try fixture(state, service: service)
            var draft = PhoneRecordDraft(); draft.stage = .interview; draft.note = "Interview preparation"
            try check(store.saveRecord(draft, context: store.recordEditContext(for: localJob)!, now: now), "A meaningful private record exists before bookmark removal")
            store.selected = ["local-record-job"]; store.answers["local-record-job"] = ["comments": .string("Unsent answer")]
            let captured = store.removalContext("local-record-job")!
            let before = try Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))
            try check(captured.keepsRecord && store.jobs.count == 1 && store.selected.count == 1, "Removal confirmation captures the role while leaving selection and storage untouched")
            let afterCancel = try Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))
            try check(before == afterCancel, "Canceling removal changes no file")
            try check(store.removeLocalJob(captured) && store.jobs.isEmpty && store.selected.isEmpty && store.answers.isEmpty, "Confirm removes only the captured local bookmark and its unsent selection")
            let retained = store.savedOpportunities.first!
            try check(retained["recordOnly"] == .bool(true) && store.currentRecord(for: retained)?.note == "Interview preparation", "A meaningful private record remains visible after the bookmark is removed")
            try check(store.opportunityDraft.title == "Keep this separate draft" && service.calls.isEmpty, "Bookmark removal does not touch other drafts or a service")
            scenarios += 1
        }
        // A removed bookmark is not needed to associate an unpaired record with a connected workspace.
        do {
            var state = PhoneApplicationState(); state.jobs = [localJob]
            var local = PhoneOpportunityRecord(scope: PhoneRecordScope(), job: PhoneRecordJob(localJob))
            local.stage = .applied; local.appliedElsewhere = true; local.note = "Orphan phone note"; local.followUpOn = "2026-11-20"
            var earlier = local; earlier.id = UUID().uuidString; earlier.archived = true; earlier.note = "Earlier orphan note"
            let destinationScope = try initial().recordScope
            var existing = PhoneOpportunityRecord(scope: destinationScope, job: PhoneRecordJob(localJob)); existing.note = "Existing account note"
            state.applicationRecords = [local, earlier, existing]
            var remoteJob = localJob; remoteJob["id"] = .string("existing-remote-role"); remoteJob.removeValue(forKey: "localOnly")
            let first = TestService(), second = TestService(); var destination = first
            first.handle = { call in
                if call.route == "session" { return ["ok": .bool(true), "sessionToken": .string("first-token"), "workspaceId": .string("workspace-a"), "profile": .object(self.server(3))] }
                if call.route == "session/revoke" { return ["ok": .bool(true)] }
                return self.workspace(3, jobs: [remoteJob])
            }
            second.handle = { call in
                if call.route == "session" { return ["ok": .bool(true), "sessionToken": .string("second-token"), "workspaceId": .string("workspace-b"), "profile": .object(self.server(3))] }
                if call.route == "session/revoke" { return ["ok": .bool(true)] }
                return self.workspace(3, jobs: [remoteJob], workspace: "workspace-b")
            }
            let (store, folder, _) = try fixture(state, service: first, factory: { _, token in destination.token = token; return destination })
            try check(store.removeLocalJob(store.removalContext("local-record-job")!), "The original local bookmark can be deliberately removed while keeping its record")
            let orphanID = "record-" + local.id
            try check(store.recordAdoptionContext(for: store.savedOpportunity(orphanID)!) == nil, "An unpaired record cannot be associated before a workspace is connected")
            let paired = await store.connect(address: first.origin.absoluteString, code: "PAIR")
            let orphan = store.savedOpportunity(orphanID)!
            let captured = store.recordAdoptionContext(for: orphan)!
            let path = folder.appendingPathComponent("phone-draft.json"), beforeCancel = try Data(contentsOf: path)
            try check(paired && store.currentRecord(for: orphan)?.note == local.note && !store.isMarkedApplied(remoteJob),
                      "Pairing preserves the separate orphan record even when the service already has its job")
            let afterCancel = try Data(contentsOf: path)
            try check(beforeCancel == afterCancel, "Keeping a private record separate cancels association without changing any saved data")
            var edited = PhoneRecordDraft(store.currentRecord(for: orphan)); edited.note = "Updated orphan phone note"
            try check(store.saveRecord(edited, context: store.recordEditContext(for: orphan)!, now: now), "An orphan record remains editable before association")
            try check(!store.adoptUnpairedRecord(captured), "A confirmation captured before a record edit cannot associate stale versions")
            let current = store.recordAdoptionContext(for: orphan)!, calls = first.calls.count
            try check(store.adoptUnpairedRecord(current), "Explicit confirmation associates an orphan record without importing or recreating its bookmark")
            let stored = try JSONDecoder().decode(PhoneApplicationState.self, from: Data(contentsOf: path))
            try check(stored.jobs.isEmpty && stored.applicationRecords.count == 3
                && stored.applicationRecords.allSatisfy({ $0.scope == destinationScope }),
                      "The removed bookmark stays removed and every active/archived record belongs to the exact chosen workspace")
            try check(store.recordVersions(for: remoteJob).count == 3 && store.recordEditContext(for: remoteJob) == nil
                && store.isMarkedApplied(remoteJob) && Set(store.recordVersions(for: remoteJob).map(\.note)) == Set([edited.note, earlier.note, existing.note]),
                      "Colliding notes and historical versions are retained for explicit comparison while their applied marks remain protected")
            try check(first.calls.count == calls, "Private record association uploads no note, job, profile, approval or application request")
            destination = second; let switched = await store.connect(address: second.origin.absoluteString, code: "PAIR-B")
            try check(switched && store.recordVersions(for: remoteJob).isEmpty && !store.adoptUnpairedRecord(current),
                      "A different account at the same origin cannot inherit the orphan notes or reuse the previous confirmation")
            destination = first; let returned = await store.connect(address: first.origin.absoluteString, code: "PAIR-A")
            try check(returned && store.recordVersions(for: remoteJob).count == 3 && store.isMarkedApplied(remoteJob),
                      "Returning to the chosen workspace restores all associated orphan record versions")
            scenarios += 1
        }
        // Association and job import cannot change an applied mark under an already approved queue.
        do {
            var state = try initial()
            var record = PhoneOpportunityRecord(scope: PhoneRecordScope(), job: PhoneRecordJob(localJob))
            record.stage = .applied; record.appliedElsewhere = true; record.note = "Keep this removed-link note"
            state.applicationRecords = [record]; state.opportunityDraft.title = "Keep this other pending job draft"
            var approved = review("orphan-approved", approved: true, itemState: "ready")
            var item = approved["items"]!.array[0].object; item["jobId"] = .string("approved-job"); item["job"] = .object(localJob)
            approved["items"] = .array([.object(item)])
            let service = TestService(); var active = true
            service.handle = { call in
                if call.route == "stop" { active = false; return ["ok": .bool(true)] }
                return self.workspace(3, plans: active ? [approved] : [], active: active ? ["orphan-approved"] : [])
            }
            let (store, folder, tokens) = try fixture(state, service: service)
            await store.refresh(); let orphan = store.savedOpportunity("record-" + record.id)!
            let captured = store.recordAdoptionContext(for: orphan)!, path = folder.appendingPathComponent("phone-draft.json")
            let before = try Data(contentsOf: path)
            try check(!store.adoptUnpairedRecord(captured), "A matching approved queue must be stopped before an orphan applied mark can join the account")
            let blockedAdd = await store.addJob(url: publicURL, title: "Product designer", company: "Example employer", location: "", country: "")
            let after = try Data(contentsOf: path)
            try check(!blockedAdd && before == after && service.calls.allSatisfy({ $0.method == "GET" }),
                      "The normal job-import path is also blocked before network or bookmark changes; all orphan data stays intact")
            var note = PhoneRecordDraft(store.currentRecord(for: orphan)); note.note = "Updated private preparation"
            try check(store.saveRecord(note, context: store.recordEditContext(for: orphan)!, now: now),
                      "Editing notes without changing the applied flag remains available during the approved queue")
            await store.stop()
            let calls = service.calls.count
            try check(store.activePlanIDs.isEmpty && store.adoptUnpairedRecord(store.recordAdoptionContext(for: orphan)!),
                      "After explicit Stop is confirmed, the record can join the connected workspace")
            let stored = try JSONDecoder().decode(PhoneApplicationState.self, from: Data(contentsOf: path))
            try check(stored.jobs.isEmpty && stored.applicationRecords.first?.note == note.note
                && stored.applicationRecords.first?.scope == stored.recordScope && service.calls.count == calls,
                      "Association after Stop preserves a record-only role and never recreates the removed bookmark")
            let reopened = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
            let retained = reopened.savedOpportunity("record-" + record.id)!
            try check(retained["recordOnly"]?.bool == true && reopened.isMarkedApplied(retained)
                && reopened.currentRecord(for: retained)?.note == note.note, "Associated record-only history and duplicate protection survive relaunch")
            scenarios += 1
        }
        // Restored manual evidence must also guard continuation without requiring a new record edit.
        do {
            var state = try initial(); state.jobs = [localJob]
            var record = PhoneOpportunityRecord(scope: state.recordScope, job: PhoneRecordJob(localJob))
            record.stage = .applied; record.appliedElsewhere = true; record.note = "Already applied before restoring this phone"
            state.applicationRecords = [record]
            var approved = review("restored-record-queue", approved: true)
            var item = approved["items"]!.array[0].object; item["jobId"] = localJob["id"]; item["job"] = .object(localJob)
            approved["items"] = .array([.object(item)])
            let service = TestService(); var target = approved
            service.handle = { call in
                if call.route == "advance" { return ["ok": .bool(true)] }
                return self.workspace(3, plans: [target], active: ["restored-record-queue"], continuation: .string("client"))
            }
            let (store, _, _) = try fixture(state, service: service)
            await store.pollApprovedApplications()
            try check(!service.calls.contains(where: { $0.route == "advance" || $0.route == "stop" })
                && store.activePlanIDs == ["restored-record-queue"], "Restored applied evidence blocks continuation without pretending the server queue was stopped")
            item["jobId"] = .string("unknown-job"); item["job"] = .object(["title": .string("Unknown target"), "company": .string("Fixture")])
            target["items"] = .array([.object(item)]); await store.pollApprovedApplications()
            try check(!service.calls.contains(where: { $0.route == "advance" }), "Unknown active targets fail closed when the phone has manual applied evidence")
            var other = localJob; other["id"] = .string("another-job"); other["url"] = .string("https://careers.example.com/roles/another-role")
            item["jobId"] = other["id"]; item["job"] = .object(other); target["items"] = .array([.object(item)])
            await store.pollApprovedApplications()
            try check(service.calls.filter { $0.route == "advance" }.count == 1
                && !service.calls.contains(where: { $0.route == "stop" || $0.route == "submit" }), "A known unrelated approved plan remains eligible without a false stop or new approval")
            scenarios += 1
        }
        // A first pairing alone does not move records; explicit import does, and other accounts do not inherit them.
        do {
            let localID = "local-record-job", remoteID = "service-record-job"
            var state = PhoneApplicationState(); state.jobs = [localJob]
            var record = PhoneOpportunityRecord(scope: PhoneRecordScope(), job: PhoneRecordJob(localJob)); record.stage = .applied; record.appliedElsewhere = true; record.note = "Private local applicant note"
            record.manualResumeName = "Private-CV-A.pdf"
            state.applicationRecords = [record]
            var remoteJob = localJob; remoteJob["id"] = .string(remoteID); remoteJob.removeValue(forKey: "localOnly")
            let first = TestService(), second = TestService(); var destination = first, imported = false
            var blocked = review("manual-record-review", itemState: "blocked")
            var item = blocked["items"]!.array[0].object; item["jobId"] = .string(remoteID); item["job"] = .object(remoteJob); blocked["items"] = .array([.object(item)])
            first.handle = { call in
                if call.route == "session" { return ["ok": .bool(true), "sessionToken": .string("first-token"), "workspaceId": .string("workspace-a"), "profile": .object(self.server(3))] }
                if call.route == "session/revoke" { return ["ok": .bool(true)] }
                if call.route == "jobs" { imported = true; return ["ok": .bool(true), "job": .object(remoteJob)] }
                if call.route == "prepare" { return ["ok": .bool(true), "plan": .object(blocked)] }
                return self.workspace(3, jobs: imported ? [remoteJob] : [], plans: imported ? [blocked] : [])
            }
            second.handle = { call in
                if call.route == "session" { return ["ok": .bool(true), "sessionToken": .string("second-token"), "workspaceId": .string("workspace-b"), "profile": .object(self.server(3))] }
                if call.route == "session/revoke" { return ["ok": .bool(true)] }
                return self.workspace(3, jobs: [remoteJob], workspace: "workspace-b")
            }
            let (store, folder, _) = try fixture(state, service: first, factory: { _, token in destination.token = token; return destination })
            let beforePairRemoval = store.removalContext(localID)!
            let paired = await store.connect(address: first.origin.absoluteString, code: "PAIR")
            let afterPair = try JSONDecoder().decode(PhoneApplicationState.self, from: Data(contentsOf: folder.appendingPathComponent("phone-draft.json")))
            try check(paired && afterPair.applicationRecords[0].scope.isLocal, "Pairing never silently assigns an unpaired private record to an account")
            try check(!store.removeLocalJob(beforePairRemoval) && store.jobs.isEmpty, "A removal captured before a connection change cannot touch the separately archived unpaired link")
            try check(store.importUnpairedDraft(context: store.workspaceActionContext), "A separate explicit choice copies the unpaired link and record into this workspace")
            store.selected = Set(store.jobs.compactMap { $0["id"]?.string }); await store.prepare()
            let request = first.calls.first(where: { $0.route == "prepare" })!
            try check(request.body?["manualAppliedJobIds"]?.array == [.string(remoteID)], "Explicit local-to-service import maps the durable manual mark to the actual service job ID")
            let serializedBody = String(data: try JSONEncoder().encode(request.body), encoding: .utf8)!
            try check(!serializedBody.contains(record.note) && !serializedBody.contains("followUp") && !serializedBody.contains("appliedOn"), "Only duplicate-prevention IDs leave the phone; private record contents stay local")
            try check(!serializedBody.contains("manualResumeName") && !serializedBody.contains(record.manualResumeName!), "The self-entered filename never becomes employer payload or an attachment")
            let afterImport = try JSONDecoder().decode(PhoneApplicationState.self, from: Data(contentsOf: folder.appendingPathComponent("phone-draft.json")))
            try check(afterImport.applicationRecords.contains(where: { $0.scope.workspaceID == "workspace-a" && $0.note == record.note })
                && afterImport.applicationRecords.contains(where: { $0.scope.isLocal && $0.note == record.note }) && store.isMarkedApplied(remoteJob),
                      "Explicit import keeps a protected account copy and preserves the separate unpaired original")
            let oldEditor = store.recordEditContext(for: remoteJob)!
            destination = second; let switched = await store.connect(address: second.origin.absoluteString, code: "PAIR-B")
            try check(switched && !store.isMarkedApplied(remoteJob) && store.currentRecord(for: remoteJob) == nil, "Another workspace at the same origin cannot see or use the first account's record")
            try check(!store.saveRecord(PhoneRecordDraft(record), context: oldEditor, now: now), "An editor from the previous workspace cannot write after an account switch")
            destination = first; let returned = await store.connect(address: first.origin.absoluteString, code: "PAIR-A")
            try check(returned && store.currentRecord(for: remoteJob)?.note == record.note && store.isMarkedApplied(remoteJob), "Returning to the original workspace restores its private record without re-creating it")
            try check(store.currentRecord(for: remoteJob)?.manualResumeName == "Private-CV-A.pdf", "The private filename returns only with its original record scope")
            scenarios += 1
        }
        // Conflicting copies retain both versions and conservatively keep the applied mark until explicit correction.
        do {
            var state = try initial(); state.jobs = [localJob]
            var current = PhoneOpportunityRecord(scope: state.recordScope, job: PhoneRecordJob(localJob)); current.note = "Current note"
            var copied = PhoneOpportunityRecord(scope: state.recordScope, job: PhoneRecordJob(localJob)); copied.stage = .applied; copied.appliedElsewhere = true; copied.note = "Copied note"; copied.followUpOn = "2026-11-20"
            state.applicationRecords = [current, copied]
            let service = TestService(); let (store, folder, tokens) = try fixture(state, service: service)
            try check(store.recordEditContext(for: localJob) == nil && store.isMarkedApplied(localJob), "Ambiguous active records must be compared and keep duplicate protection")
            let choice = store.recordChoiceContext(for: localJob)
            try check(store.useRecordVersion(current.id, context: choice), "Choosing a current note/date version is explicit")
            try check(store.recordVersions(for: localJob).count == 2 && store.currentRecord(for: localJob)?.note == "Current note" && store.isMarkedApplied(localJob), "Selecting Saved-stage details cannot silently erase another version's applied mark or note")
            try check(!store.useRecordVersion(copied.id, context: choice), "An old conflict-choice revision cannot replace a newer decision")
            var edit = PhoneRecordDraft(store.currentRecord(for: localJob)); edit.note = "Edited current note"
            try check(store.saveRecord(edit, context: store.recordEditContext(for: localJob)!, now: now) && store.isMarkedApplied(localJob), "An ordinary note edit does not clear a conservatively retained applied mark")
            try check(store.saveRecord(edit, context: store.recordEditContext(for: localJob)!, confirmNotApplied: true, now: now) && !store.isMarkedApplied(localJob), "A deliberate not-applied correction can clear the retained mark")
            let restored = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
            try check(!restored.isMarkedApplied(localJob) && restored.recordVersions(for: localJob).contains(where: { $0.archived && $0.note == "Copied note" }), "Archived applied history remains available but does not reassert an explicitly cleared current mark after restart")
            let originalHistory = restored.recordVersions(for: localJob).first { $0.id == copied.id }!
            let selected = restored.useRecordVersion(copied.id, context: restored.recordChoiceContext(for: localJob))
            try check(selected && !restored.isMarkedApplied(localJob) && restored.currentRecord(for: localJob)?.stage == .saved,
                      "Restoring older details cannot reverse an explicit not-applied correction")
            try check(restored.currentRecord(for: localJob)?.note == copied.note && restored.currentRecord(for: localJob)?.followUpOn == copied.followUpOn
                && restored.currentRecord(for: localJob)?.id != copied.id
                && restored.recordVersions(for: localJob).first(where: { $0.id == copied.id }) == originalHistory,
                      "Restored notes and dates use a new current record while the original archived version remains byte-for-byte equivalent")
            let afterRestore = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
            try check(!afterRestore.isMarkedApplied(localJob), "The explicit correction survives another restart after restoring history")
            var fresh = PhoneRecordDraft(afterRestore.currentRecord(for: localJob)); fresh.stage = .interview
            try check(afterRestore.saveRecord(fresh, context: afterRestore.recordEditContext(for: localJob)!, now: now)
                && afterRestore.isMarkedApplied(localJob), "A new explicit Interview stage save may mark the opportunity applied again")
            scenarios += 1
        }
        // Stale removal and manual-record changes cannot approve a recovered ready plan.
        do {
            var state = try initial(); state.jobs = [localJob]
            let service = TestService(); service.handle = { _ in self.workspace(3, active: ["already-approved"]) }
            let (store, _, _) = try fixture(state, service: service)
            await store.refresh(); let context = store.recordEditContext(for: localJob)!
            var draft = PhoneRecordDraft(); draft.stage = .applied; draft.note = "Keep this private note"
            try check(!store.saveRecord(draft, context: context, now: now) && !store.isMarkedApplied(localJob),
                      "An applied-mark change cannot pretend to cancel an already approved queue")
            draft.stage = .saved
            try check(store.saveRecord(draft, context: context, now: now) && store.currentRecord(for: localJob)?.note == draft.note,
                      "Notes and dates remain usable while an unrelated service queue is active")
            try check(service.calls.allSatisfy { $0.method == "GET" }, "Editing private records never stops, prepares, approves or sends an application")
            scenarios += 1
        }
        do {
            var state = try initial(); state.jobs = [localJob]
            var ready = review("private-ready"); var item = ready["items"]!.array[0].object
            item["jobId"] = localJob["id"]; item["job"] = .object(localJob); ready["items"] = .array([.object(item)])
            let service = TestService(); var showReview = false
            service.handle = { _ in self.workspace(3, plans: showReview ? [ready] : []) }
            let (store, _, _) = try fixture(state, service: service)
            await store.refresh(); let captured = store.removalContext("local-record-job")!
            showReview = true; await store.refresh()
            try check(!store.removeLocalJob(captured) && store.jobs.count == 1, "A newly linked review prevents a stale removal confirmation")
            try check(store.resumeReview(ready), "An untouched review is initially resumable")
            var draft = PhoneRecordDraft(); draft.stage = .applied
            try check(store.saveRecord(draft, context: store.recordEditContext(for: localJob)!, now: now) && store.plan == nil, "Marking an external application invalidates its current unapproved review")
            try check(!store.resumeReview(ready), "The same recovered review cannot be approved after a private applied mark")
            let submitted = await store.submitReviewed()
            try check(!submitted && !service.calls.contains(where: { $0.route == "submit" }), "A new manual applied mark produces no approval or submission request")
            scenarios += 1
        }
    }

    func runLiveSubmissionCapability() async throws {
        // Only a typed workspace declaration determines availability; it is never restored as cached authority.
        do {
            let service = TestService()
            let (store, folder, tokens) = try fixture(initial(), service: service)
            try check(store.connected && store.liveSubmissionEnabled == nil, "Restored credentials do not imply verified live submission availability")
            let declarations: [(ApplicationValue?, Bool?)] = [(.bool(true), true), (.bool(false), false), (.bool(true), true), (nil, nil)]
            for (declared, expected) in declarations {
                var response = workspace(3, continuation: .string("client"), liveEnabled: declared)
                response["mode"] = .string("live")
                let snapshot = try ApplicationWorkspaceSnapshot(response, workspaceID: "workspace-a")
                try check(snapshot.liveSubmissionEnabled == expected && snapshot.requiresClientContinuation,
                          "Boolean or missing live availability remains independent of client continuation and mode")
                service.handle = { _ in response }
                let refreshed = await store.refresh()
                try check(refreshed && store.liveSubmissionEnabled == expected && store.requiresClientContinuation,
                          "Each valid refresh replaces the prior live availability, including true-to-false and true-to-unknown")
            }
            let absentCapabilities: [ApplicationValue?] = [nil, .object([:])]
            for absent in absentCapabilities {
                service.handle = { _ in self.workspace(3, liveEnabled: .bool(true)) }
                let enabled = await store.refresh()
                try check(enabled && store.liveSubmissionEnabled == true, "A confirmed enabled value precedes the missing-capabilities check")
                var response = workspace(3)
                if let absent { response["capabilities"] = absent }
                let snapshot = try ApplicationWorkspaceSnapshot(response, workspaceID: "workspace-a")
                try check(snapshot.liveSubmissionEnabled == nil && !snapshot.requiresClientContinuation,
                          "Absent and empty capability envelopes remain unknown without inventing continuation authority")
                service.handle = { _ in response }
                let refreshed = await store.refresh()
                try check(refreshed && store.liveSubmissionEnabled == nil, "A valid missing capability clears a previously enabled value")
            }
            service.handle = { _ in self.workspace(3, liveEnabled: .bool(true)) }
            let refreshed = await store.refresh()
            try check(refreshed && store.liveSubmissionEnabled == true, "Live availability can be confirmed again by this workspace")
            let saved = try JSONSerialization.jsonObject(with: Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))) as! [String: Any]
            try check(saved["capabilities"] == nil && saved["liveSubmissionEnabled"] == nil, "Live capability is not persisted as authority in the phone draft")
            let restored = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
            try check(restored.connected && restored.liveSubmissionEnabled == nil, "Relaunch requires a fresh capability read despite a previously enabled session")
            try check(service.calls.allSatisfy { $0.route == "workspace" && $0.method == "GET" }, "Capability checks perform workspace reads only")
            scenarios += 1
        }
        // A current ready plan is insufficient when live submission is false or unknown outside explicit test mode.
        let submissionCases: [(String, ApplicationValue?, Bool)] = [
            ("local", .bool(false), false), ("local", nil, false),
            ("live", .bool(false), false), ("live", nil, false),
            ("local", .bool(true), true), ("live", .bool(true), true),
            ("test", nil, true), ("test", .bool(false), true), ("test", .bool(true), true)
        ]
        for (mode, capability, permitted) in submissionCases {
            let ready = review("capability-review")
            let service = TestService(); var submitted = false
            service.handle = { call in
                if call.route == "submit" { submitted = true; return ["ok": .bool(true)] }
                var response = self.workspace(3, plans: submitted ? [] : [ready], liveEnabled: capability)
                response["mode"] = .string(mode); return response
            }
            let (store, folder, _) = try fixture(initial(), service: service)
            let refreshed = await store.refresh()
            try check(refreshed && store.submissionAvailable == permitted && store.resumeReview(ready),
                      "The capability gate is exercised with a valid current ready review and synchronized profile")
            let before = try Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))
            let approved = await store.submitReviewed()
            try check(approved == permitted && !store.busy, "Review approval obeys verified live capability or explicit test mode")
            let posts = service.calls.filter { $0.method == "POST" }
            if permitted {
                try check(posts.count == 1 && posts[0].route == "submit"
                          && posts[0].body == ["planId": .string("capability-review"), "digest": ready["digest"]!, "approved": .bool(true)],
                          "Permitted approval sends exactly the reviewed plan, digest, and explicit approval once")
                try check(store.plan == nil && service.calls.map(\.route) == ["workspace", "submit", "workspace"],
                          "Permitted approval retains the existing result reconciliation behavior")
            } else {
                try check(!submitted && posts.isEmpty && store.plan == ready && service.calls.count == 1,
                          "Unavailable approval keeps the exact ready review and performs no POST or other request")
                let after = try Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))
                try check(after == before, "Unavailable approval does not change the persisted draft")
            }
            scenarios += 1
        }
        // Malformed truthy values must reject the entire snapshot before any draft, evidence, or known capability changes.
        for known in [false, true] {
            var state = try initial(); var draft = state.profile; draft.firstName = "Kept capability draft"
            try draft.selectResume(pdf, filename: "Capability.pdf"); state.retainDraft(draft, basedOn: 3)
            let job: [String: ApplicationValue] = ["id": .string("job-1"), "url": .string("https://jobs.example/one"), "title": .string("Role"), "company": .string("Fixture")]
            let receipt: [String: ApplicationValue] = ["id": .string("kept-receipt"), "state": .string("confirmed")]
            var good = workspace(3, jobs: [job], attempts: [receipt], plans: [review("kept-review")],
                                 continuation: .string("client"), liveEnabled: .bool(known))
            good["mode"] = .string("local")
            let service = TestService(); service.handle = { _ in good }
            let (store, folder, _) = try fixture(state, service: service)
            let refreshed = await store.refresh()
            try check(refreshed && store.liveSubmissionEnabled == known, "A valid workspace establishes the capability that malformed data must preserve")
            let before = try Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))
            let invalidValues: [ApplicationValue] = [.string("true"), .string("false"), .number(1), .number(0), .null,
                                                      .array([.bool(true)]), .object(["enabled": .bool(true)])]
            var cases: [[String: ApplicationValue]] = invalidValues.map { invalid in
                self.workspace(8, name: "Untrusted reply", continuation: .string("client"), liveEnabled: invalid)
            }
            let invalidEnvelopes: [ApplicationValue] = [.bool(true), .null, .string("enabled"), .array([.bool(true)])]
            for invalid in invalidEnvelopes {
                var response = workspace(8, name: "Untrusted reply"); response["capabilities"] = invalid; cases.append(response)
            }
            for response in cases {
                var rejected = false
                do { _ = try ApplicationWorkspaceSnapshot(response, workspaceID: "workspace-a") }
                catch { rejected = true }
                try check(rejected, "A non-Boolean liveEnabled or non-object capabilities envelope is not an accepted workspace")
                service.handle = { _ in response }
                let accepted = await store.refresh()
                try check(!accepted && store.connected && store.mode == "local" && store.liveSubmissionEnabled == known && store.requiresClientContinuation,
                          "Malformed availability cannot establish new authority or replace the last verified capability")
                try check(store.profile.firstName == "Kept capability draft" && store.profile.resumeData == pdf
                          && store.profileNeedsSync && store.revision == 3 && store.latestServerRevision == 3,
                          "Malformed capability preserves unsaved profile fields, exact CV bytes, and the acknowledged revision")
                try check(store.jobs == [job] && store.attempts == [receipt] && store.availableReviews.count == 1,
                          "Malformed capability cannot erase existing application evidence")
                let after = try Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))
                try check(after == before, "Rejected capability leaves the persisted phone draft byte-for-byte unchanged")
            }
            scenarios += 1
        }
        // A connection change clears true before the new workspace reply; a delayed old reply cannot restore it.
        do {
            var state = try initial(); var draft = state.profile; try draft.selectResume(pdf, filename: "Account-switch.pdf")
            state.retainDraft(draft, basedOn: 3)
            let old = TestService(); let newer = TestService("https://second.example")
            let oldGate = DelayedResponse(), newGate = DelayedResponse(); var delayOld = false
            old.handle = { call in
                if call.route == "session/revoke" { return ["ok": .bool(true)] }
                if delayOld { return try await oldGate.wait() }
                var response = self.workspace(3, liveEnabled: .bool(true)); response["mode"] = .string("local"); return response
            }
            newer.handle = { call in
                if call.route == "session" {
                    return ["ok": .bool(true), "sessionToken": .string("new-capability-token"), "workspaceId": .string("workspace-b"),
                            "profile": .object(self.server(0)), "capabilities": .object(["liveEnabled": .bool(true)])]
                }
                return try await newGate.wait()
            }
            let (store, folder, tokens) = try fixture(state, service: old, factory: { url, token in
                let service = url.host == "second.example" ? newer : old; service.token = token; return service
            })
            let enabled = await store.refresh()
            try check(enabled && store.liveSubmissionEnabled == true, "The original account has confirmed live availability")
            delayOld = true
            let oldRefresh = Task { await store.refresh() }; try await waitUntil { oldGate.started }
            let changing = Task { await store.connect(address: "https://second.example", code: "SYNTHETIC") }
            try await waitUntil { newGate.started }
            try check(store.connected && store.serviceAddress == "https://second.example" && store.liveSubmissionEnabled == nil && !store.submissionAvailable,
                      "New connection has unknown availability until its workspace is validated, even if its session response advertises true")
            oldGate.finish(workspace(99, name: "Old account reply", liveEnabled: .bool(true)))
            let oldAccepted = await oldRefresh.value
            try check(!oldAccepted && store.connected && store.liveSubmissionEnabled == nil && !store.submissionAvailable,
                      "Delayed enabled capability from the old account cannot repopulate the new account")
            var unknown = workspace(0, workspace: "workspace-b"); unknown["mode"] = .string("local")
            newGate.finish(unknown)
            let changed = await changing.value
            try check(changed && store.liveSubmissionEnabled == nil && !store.submissionAvailable && store.profile.resumeData == nil,
                      "A new workspace without live capability stays unknown and never adopts the previous person's CV")
            newer.handle = { call in
                if call.route == "session/revoke" { return ["ok": .bool(true)] }
                var response = self.workspace(0, workspace: "workspace-b", liveEnabled: .bool(true)); response["mode"] = .string("local"); return response
            }
            let newEnabled = await store.refresh()
            try check(newEnabled && store.liveSubmissionEnabled == true && store.submissionAvailable, "Only the new workspace can establish its own enabled capability")
            await store.disconnect()
            try check(!store.connected && store.liveSubmissionEnabled == nil && !store.submissionAvailable && store.profile.resumeData == nil,
                      "Disconnect clears verified capability without showing a previous workspace's CV")
            let restored = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in newer })
            let scopedSaved = try JSONDecoder().decode(PhoneApplicationState.self, from: Data(contentsOf: folder.appendingPathComponent("phone-draft.json")))
            try check(!restored.connected && restored.liveSubmissionEnabled == nil && !restored.submissionAvailable && restored.profile.resumeData == nil
                && scopedSaved.workspaceDrafts.contains(where: { $0.scope.workspaceID == "workspace-a" && $0.profile.resumeData == pdf }),
                      "Disconnected relaunch keeps the old CV in its own archived scope and cannot resurrect its capability")
            scenarios += 1
        }
        // Revocation and the account-deletion barrier reset availability without destroying a local draft.
        for (status, code) in [(401, "revoked"), (409, "account_deleting")] {
            var state = try initial(); var draft = state.profile; try draft.selectResume(pdf, filename: "Reset.pdf")
            state.retainDraft(draft, basedOn: 3)
            let service = TestService(); service.handle = { _ in
                var response = self.workspace(3, liveEnabled: .bool(true)); response["mode"] = .string("local"); return response
            }
            let (store, folder, _) = try fixture(state, service: service)
            let enabled = await store.refresh()
            try check(enabled && store.liveSubmissionEnabled == true, "Reset regression begins with confirmed live availability")
            service.handle = { _ in throw MobileApplicationError(message: "Synthetic workspace reset", statusCode: status, code: code) }
            let refreshed = await store.refresh()
            try check(!refreshed && store.liveSubmissionEnabled == nil && !store.submissionAvailable && store.connected == (status != 401),
                      "Revocation or account deletion clears stale enabled availability under the existing connection rules")
            let saved = try JSONDecoder().decode(PhoneApplicationState.self, from: Data(contentsOf: folder.appendingPathComponent("phone-draft.json")))
            try check(saved.profile.resumeData == pdf && saved.profileNeedsSync && saved.profileRevision == 3,
                      "Availability reset preserves the persisted CV draft and its revision")
            scenarios += 1
        }
    }

    func runHostedContinuation() async throws {
        // Offering the hosted address must not create an account, mutate an existing connection, or send a draft.
        do {
            let service = TestService()
            let (fresh, folder, _) = try fixture(PhoneApplicationState(), service: service)
            try check(fresh.connectionSetupAddress == MobileApplicationPolicy.hostedServiceOrigin && fresh.serviceAddress.isEmpty,
                      "The new-service preset is presentation only")
            try check(!fresh.connected && service.calls.isEmpty, "Opening a new phone workspace makes no hosted request")
            let stored = try JSONDecoder().decode(PhoneApplicationState.self, from: Data(contentsOf: folder.appendingPathComponent("phone-draft.json")))
            try check(stored.serviceAddress.isEmpty && !stored.connectionEnabled, "The preset does not persist a connection without pairing")
            let (existing, _, _) = try fixture(initial(), service: service)
            try check(existing.connectionSetupAddress == "https://first.example" && existing.serviceAddress == "https://first.example",
                      "An existing companion origin is preserved exactly")
            scenarios += 1
        }
        // Node companions and unknown future capabilities keep their existing GET-only polling behavior.
        do {
            let capabilities: [ApplicationValue?] = [nil, .string("server"), .string("future-version")]
            for capability in capabilities {
                let service = TestService()
                service.handle = { _ in self.workspace(3, active: ["server-owned-plan"], continuation: capability) }
                let (store, _, _) = try fixture(initial(), service: service)
                await store.pollApprovedApplications()
                try check(!store.requiresClientContinuation && service.calls.map(\.route) == ["workspace"],
                          "Only the exact client capability can request advance")
            }
            scenarios += 1
        }
        // Each advance uses fresh server authority, carries no approval, and trusts only the subsequent workspace receipt.
        do {
            let service = TestService(); var now: TimeInterval = 100; var advances = 0
            service.handle = { call in
                if call.route == "advance" {
                    advances += 1
                    return ["ok": .bool(true), "attempts": .array([.object(["id": .string("ignored"), "state": .string("confirmed"),
                            "provider": .string("lever"), "applicationId": .string("not-a-workspace-receipt"), "evidenceMode": .string("live")])])]
                }
                var attempt: [String: ApplicationValue] = ["id": .string("attempt-1"), "state": .string(advances == 0 ? "ready" : advances == 1 ? "dispatching" : "confirmed"),
                                                            "provider": .string("lever"), "evidenceMode": .string("test")]
                if advances >= 2 { attempt["applicationId"] = .string("workspace-receipt") }
                var value = self.workspace(3, attempts: [attempt], plans: [self.review("unapproved-review")],
                                           active: advances < 2 ? ["server-approved-plan"] : [], continuation: .string("client"))
                value["mode"] = .string("local")
                return value
            }
            let (store, folder, tokens) = try fixture(initial(), service: service, clock: { now })
            store.selected = ["a-different-local-choice"]
            await store.pollApprovedApplications()
            try check(service.calls.map(\.route) == ["workspace", "advance", "workspace"], "Advance is bracketed by authenticated workspace reads")
            try check(service.calls[1].method == "POST" && service.calls[1].body == ["planId": .string("server-approved-plan")],
                      "Continuation contains only the server's active plan ID, never approval or local choices")
            try check(service.token == "synthetic-token" && store.mode == "local" && store.requiresClientContinuation,
                      "Hosted continuation uses the paired client even when the service mode remains local")
            try check(store.attempts.first?["state"]?.string == "dispatching" && !MobileApplicationPolicy.isVerified(store.attempts.first ?? [:]),
                      "An advance response cannot fabricate a receipt before the workspace confirms it")
            await store.pollApprovedApplications(); now = 103.999; await store.pollApprovedApplications()
            try check(advances == 1, "A four-second completion gap prevents a tight continuation loop")
            now = 104; await store.pollApprovedApplications()
            try check(advances == 2 && store.activePlanIDs.isEmpty && store.attempts.first?["applicationId"]?.string == "workspace-receipt",
                      "The next eligible poll adopts only the service's durable receipt")
            now = 200; await store.pollApprovedApplications()
            try check(advances == 2 && !service.calls.contains(where: { ["prepare", "submit"].contains($0.route) }),
                      "Polling never prepares or approves another application")
            let saved = try JSONSerialization.jsonObject(with: Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))) as! [String: Any]
            try check(["approvedAt", "activePlanIds", "recoverablePlans", "capabilities"].allSatisfy { saved[$0] == nil },
                      "Approval and dispatch authority are never persisted as local phone state")
            let restored = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
            try check(restored.activePlanIDs.isEmpty && !restored.requiresClientContinuation,
                      "Relaunch requires a fresh server workspace before any continuation")
            scenarios += 1
        }
        // The user can stop while a request is running; another poll cannot overlap it.
        do {
            let service = TestService(); let gate = DelayedResponse(); var stopped = false
            service.handle = { call in
                if call.route == "advance" { return try await gate.wait() }
                if call.route == "stop" { stopped = true; return ["ok": .bool(true)] }
                return self.workspace(3, active: stopped ? [] : ["approved"], continuation: .string("client"))
            }
            let (store, _, _) = try fixture(initial(), service: service)
            let sending = Task { await store.pollApprovedApplications() }; try await waitUntil { gate.started }
            try check(store.advancingApprovedApplication && !store.busy, "Approved progress is visible while Stop remains usable")
            let count = service.calls.count
            await store.pollApprovedApplications(); let refreshed = await store.refresh()
            try check(service.calls.count == count && !refreshed, "Concurrent polling cannot overlap an advance or install an older GET")
            await store.stop()
            try check(stopped && service.calls.filter { $0.route == "advance" }.count == 1, "Explicit Stop reaches the server during continuation")
            gate.finish(["ok": .bool(true)]); await sending.value
            try check(store.activePlanIDs.isEmpty && !store.advancingApprovedApplication, "Completion refresh respects the server's stopped queue")
            scenarios += 1
        }
        // A cached active plan is insufficient if its fresh workspace read fails or is malformed.
        do {
            let service = TestService(); var outcome = "valid"
            service.handle = { _ in
                if outcome == "offline" { throw URLError(.notConnectedToInternet) }
                return self.workspace(3, active: ["approved"], continuation: outcome == "malformed" ? .bool(true) : .string("client"))
            }
            let (store, _, _) = try fixture(initial(), service: service)
            await store.refresh()
            try check(store.activePlanIDs == ["approved"] && store.requiresClientContinuation, "A valid workspace initially exposes the approved queue")
            outcome = "offline"; await store.pollApprovedApplications()
            outcome = "malformed"; await store.pollApprovedApplications()
            try check(!service.calls.contains(where: { $0.route == "advance" }), "Neither an offline GET nor malformed capability permits use of cached authority")
            try check(store.activePlanIDs == ["approved"] && store.profile.firstName == "Example", "Rejected envelopes preserve existing visible evidence")
            scenarios += 1
        }
        // A timeout is reconciled by GET; an uncertain outcome never enters a client retry path.
        do {
            let service = TestService(); var attempted = false; var now: TimeInterval = 100
            service.handle = { call in
                if call.route == "advance" { attempted = true; throw URLError(.timedOut) }
                return self.workspace(3, attempts: attempted ? [["id": .string("uncertain-attempt"), "state": .string("uncertain")]] : [],
                                      active: attempted ? [] : ["approved"], continuation: .string("client"))
            }
            let (store, _, _) = try fixture(initial(), service: service, clock: { now })
            await store.pollApprovedApplications(); now = 200; await store.pollApprovedApplications()
            try check(store.attempts.first?["state"]?.string == "uncertain" && store.activePlanIDs.isEmpty,
                      "Timeout recovery displays uncertainty from the service")
            try check(service.calls.filter { $0.route == "advance" }.count == 1 && !service.calls.contains(where: { $0.route == "submit" }),
                      "Uncertain attempts are never automatically retried or reapproved")
            scenarios += 1
        }
        // Unapproved and rate-limited reviews require the visible approval path, even after a cooldown ends.
        do {
            let service = TestService(); var explicitlyApproved = false; var advances = 0
            var held = review("cooldown", approved: true, itemState: "rate_limited")
            var item = held["items"]!.array[0].object
            item["retryAt"] = .string("2026-01-01T00:00:00Z"); held["items"] = .array([.object(item)])
            service.handle = { call in
                if call.route == "submit" { explicitlyApproved = call.body?["approved"] == .bool(true); return ["ok": .bool(true)] }
                if call.route == "advance" { advances += 1; return ["ok": .bool(true)] }
                return self.workspace(3, plans: [self.review("not-approved"), held],
                                      active: explicitlyApproved && advances == 0 ? ["cooldown"] : [], continuation: .string("client"))
            }
            let (store, _, _) = try fixture(initial(), service: service)
            await store.pollApprovedApplications()
            try check(advances == 0 && !service.calls.contains(where: { $0.route == "submit" }),
                      "Neither an unapproved review nor an elapsed 429 cooldown starts automatically")
            try check(store.resumeReview(held), "A cooldown review remains available for deliberate review")
            let approved = await store.submitReviewed()
            try check(approved && explicitlyApproved && advances == 0, "Visible submit records a fresh server approval before continuation")
            await store.pollApprovedApplications()
            try check(advances == 1 && service.calls.filter { $0.route == "submit" }.count == 1,
                      "Only the server's newly active cooldown plan is continued")
            scenarios += 1
        }
        // Old connection completions and 401 errors cannot disturb a newer connection's running request.
        for oldFails in [false, true] {
            let old = TestService(); let newer = TestService("https://second.example")
            let oldGate = DelayedResponse(), newGate = DelayedResponse(); var newFinished = false
            old.handle = { call in
                if call.route == "session/revoke" { return ["ok": .bool(true)] }
                if call.route == "advance" { return try await oldGate.wait() }
                return self.workspace(3, active: ["old-approved"], continuation: .string("client"))
            }
            newer.handle = { call in
                if call.route == "session" { return ["ok": .bool(true), "sessionToken": .string("new-token"), "workspaceId": .string("workspace-b"), "profile": .object(self.server(0))] }
                if call.route == "advance" { return try await newGate.wait() }
                return self.workspace(0, workspace: "workspace-b", active: newFinished ? [] : ["new-approved"], continuation: .string("client"))
            }
            let (store, _, _) = try fixture(initial(), service: old, factory: { url, token in
                let service = url.host == "second.example" ? newer : old; service.token = token; return service
            })
            let oldTask = Task { await store.pollApprovedApplications() }; try await waitUntil { oldGate.started }
            let changed = await store.connect(address: "https://second.example", code: "SYNTHETIC")
            try check(changed && store.connected && store.activePlanIDs == ["new-approved"], "Changing connection retires the old continuation authority")
            let newTask = Task { await store.pollApprovedApplications() }; try await waitUntil { newGate.started }
            if oldFails { oldGate.fail(MobileApplicationError(message: "Old token expired", statusCode: 401)) }
            else { oldGate.finish(["ok": .bool(true), "activePlanIds": .array([.string("old-approved")])]) }
            await oldTask.value
            try check(store.connected && store.advancingApprovedApplication && store.activePlanIDs == ["new-approved"],
                      "Old continuation results/errors cannot disconnect or clear newer in-flight state")
            newFinished = true; newGate.finish(["ok": .bool(true)]); await newTask.value
            try check(!store.advancingApprovedApplication && store.activePlanIDs.isEmpty && newer.calls.filter { $0.route == "advance" }.count == 1,
                      "The new connection independently reconciles its own continuation")
            scenarios += 1
        }
        // Partly entered job links survive dismissal and relaunch without contacting a service.
        do {
            let service = TestService(); let (store, folder, tokens) = try fixture(PhoneApplicationState(), service: service)
            let draft = PhoneOpportunityDraft(url: "https://careers.example.com/jobs/one", title: "Designer", company: "", location: "Toronto", country: "CA")
            try check(store.keepOpportunityDraft(draft), "Incomplete add-link details can be saved as a local draft")
            let restored = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
            try check(restored.opportunityDraft == draft && restored.jobs.isEmpty && service.calls.isEmpty, "Draft survives reload without a job import or submission")
            var boundary = draft; boundary.title = String(repeating: "x", count: 500)
            try check(restored.keepOpportunityDraft(boundary) && restored.opportunityDraft == boundary, "The shared 500-character opportunity detail limit is accepted")
            var tooLong = boundary; tooLong.title = String(repeating: "x", count: 501)
            try check(!restored.keepOpportunityDraft(tooLong) && restored.opportunityDraft == boundary, "Oversized edit cannot overwrite the last durable draft")
            try check(restored.keepOpportunityDraft(PhoneOpportunityDraft()), "Explicit discard clears the draft")
            let discarded = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
            try check(!discarded.opportunityDraft.hasContent && discarded.jobs.isEmpty, "Deliberate discard persists without creating a job")
            scenarios += 1
        }
        // Adding the edited job consumes that exact draft in the same durable write as the new local link.
        do {
            let service = TestService(); let (store, folder, tokens) = try fixture(PhoneApplicationState(), service: service)
            let draft = PhoneOpportunityDraft(url: "https://careers.example.com/jobs/one", title: "Designer", company: "Example", location: "Toronto", country: "CA")
            try check(store.keepOpportunityDraft(draft), "Submitted draft is retained before attempting the add")
            let added = await store.addJob(url: draft.url, title: draft.title, company: draft.company, location: draft.location, country: draft.country)
            try check(added && store.jobs.count == 1 && !store.opportunityDraft.hasContent, "Successful local add consumes its matching draft")
            let restored = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
            try check(restored.jobs.count == 1 && !restored.opportunityDraft.hasContent && service.calls.isEmpty, "Job and consumed draft survive restart atomically without network use")
            try check(restored.containsOpportunity(url: draft.url + "?utm_source=search"), "Discovery and earlier records use canonical opportunity identity for handoff")
            let other = PhoneOpportunityDraft(url: "https://careers.example.com/jobs/later", title: "Later draft")
            try check(restored.keepOpportunityDraft(other), "Another unfinished draft can be retained")
            let second = await restored.addJob(url: "https://careers.example.com/jobs/two", title: "Analyst", company: "Example", location: "", country: "")
            try check(second && restored.opportunityDraft == other, "Saving a discovered opportunity cannot erase a different unfinished manual draft")
            scenarios += 1
        }
        // Pending account deletion stops continuation immediately; later token revocation retains the phone draft.
        do {
            let service = TestService(); var deleting = false; var revoked = false
            service.handle = { call in
                if revoked { throw MobileApplicationError(message: "Revoked", statusCode: 401) }
                if call.route == "advance" { deleting = true }
                if deleting { throw MobileApplicationError(message: "Workspace is being deleted", statusCode: 409, code: "account_deleting") }
                return self.workspace(3, active: ["approved"], continuation: .string("client"))
            }
            let (store, _, tokens) = try fixture(initial(), service: service)
            await store.pollApprovedApplications()
            try check(store.connected && store.activePlanIDs.isEmpty && !store.requiresClientContinuation && store.plan == nil,
                      "Pending account deletion clears dispatch/review authority without discarding the phone draft")
            revoked = true; await store.refresh()
            try check(!store.connected && tokens.values.isEmpty && store.profile.firstName == "Example", "Completed deletion revokes the phone token and preserves its draft")
            await store.pollApprovedApplications()
            try check(service.calls.filter { $0.route == "advance" }.count == 1, "A deleted account cannot continue from cached authority")
            scenarios += 1
        }
    }
}

@main
struct MobileLifecycleCheck {
    @MainActor static func main() async {
        let suite = LifecycleSuite(); defer { suite.cleanup() }
        do {
            guard CommandLine.arguments.count == 2 else {
                throw MobileApplicationError(message: "Pass the shared phone-workspace-v1.json fixture path to the lifecycle check.")
            }
            try suite.sharedPortableFixture(URL(fileURLWithPath: CommandLine.arguments[1]))
            try await suite.run()
            print("PASS \(suite.checks) application lifecycle assertions across \(suite.scenarios) scenarios")
        } catch {
            fputs(error.localizedDescription + "\n", stderr)
            exit(1)
        }
    }
}
