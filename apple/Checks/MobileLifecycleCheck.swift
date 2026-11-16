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
    let pdf = Data("%PDF-1.4\nsynthetic lifecycle fixture\n%%EOF".utf8)
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
    func server(_ revision: Int, name: String = "Example", resume: ApplicationValue = .null) -> [String: ApplicationValue] {
        var value = PhoneApplicationProfile(); value.firstName = name; value.email = "example@example.invalid"
        var object = value.payload(); object["revision"] = .number(Double(revision)); object["resume"] = resume
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
                   workspace: String = "workspace-a", resume: ApplicationValue = .null) -> [String: ApplicationValue] {
        ["ok": .bool(true), "workspaceId": .string(workspace), "profile": .object(server(revision, name: name, resume: resume)),
         "jobs": .array(jobs.map(ApplicationValue.object)), "attempts": .array(attempts.map(ApplicationValue.object)),
         "recoverablePlans": .array(plans.map(ApplicationValue.object)), "activePlanIds": .array([]), "mode": .string("test")]
    }
    func review(_ id: String, revision: Int = 3, approved: Bool = false, itemState: String = "ready") -> [String: ApplicationValue] {
        ["id": .string(id), "digest": .string("digest-" + id), "profileRevision": .number(Double(revision)),
         "expiresAt": .string(ISO8601DateFormatter().string(from: Date().addingTimeInterval(3600))),
         "stopped": .bool(false), "approvedAt": approved ? .string("2026-01-01T00:00:00Z") : .null,
         "items": .array([.object(["jobId": .string("job-1"), "state": .string(itemState),
                                  "job": .object(["title": .string("Synthetic role"), "company": .string("Fixture")]),
                                  "payloadSummary": .object(["consentMarketing": .bool(false)])])])]
    }
    func fixture(_ state: PhoneApplicationState, service: TestService, tokens: TestTokens? = nil,
                 factory: NativeApplicationsStore.ClientFactory? = nil) throws -> (NativeApplicationsStore, URL, TestTokens) {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("career-lifecycle-" + UUID().uuidString)
        folders.append(folder); try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try JSONEncoder().encode(state).write(to: folder.appendingPathComponent("phone-draft.json"))
        let tokens = tokens ?? TestTokens(); tokens.values[state.tokenAccount] = "synthetic-token"
        let create: NativeApplicationsStore.ClientFactory = factory ?? { _, token in service.token = token; return service }
        return (NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: create), folder, tokens)
    }
    func cleanup() { for folder in folders { try? FileManager.default.removeItem(at: folder) } }

    func run() async throws {
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
            for key in ["profileRevision", "latestServerRevision", "latestServerProfile", "connectionEnabled", "credentialAccount"] { old.removeValue(forKey: key) }
            try JSONSerialization.data(withJSONObject: old).write(to: folder.appendingPathComponent("phone-draft.json"))
            tokens.values[state.serviceAddress] = "legacy-synthetic-token"
            let store = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
            await store.refresh()
            try check(store.profile.firstName == "Legacy draft" && store.revision == nil, "Legacy dirty draft migrates with an unknown base")
            try check(store.profileHasConflict, "Legacy draft requires a deliberate conflict choice")
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
            await oldGET.value
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
                return self.workspace(0, jobs: [["id": .string("new-job"), "url": .string("https://jobs.example/new"), "title": .string("New role"), "company": .string("New company")]], workspace: "workspace-b")
            }
            let (store, _, _) = try fixture(state, service: oldService, factory: { url, token in
                let service = url.host == "second.example" ? newService : oldService; service.token = token; return service
            })
            let oldGET = Task { await store.refresh() }; try await waitUntil { gate.started }
            let connected = await store.connect(address: "https://SECOND.example:443/", code: "SYNTHETIC")
            try check(connected && store.serviceAddress == "https://second.example", "New connection uses a canonical service origin")
            if returnError { gate.fail(MobileApplicationError(message: "Old token expired", statusCode: 401)) }
            else { gate.finish(workspace(99, name: "Old reply", jobs: [["id": .string("old-job")]])) }
            await oldGET.value
            try check(store.connected && store.jobs.first?["id"]?.string == "new-job", "Obsolete connection response/error cannot repopulate or disconnect the new workspace")
            try check(store.profileNeedsSync && store.revision == 0 && store.profile.firstName == "Example", "Phone profile transfers only as an explicitly unsaved draft")
            try check(store.profile.resumeName.isEmpty && store.profile.payload()["resume"] == .null, "Foreign workspace CV metadata cannot silently select the new workspace's CV")
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
    }
}

@main
struct MobileLifecycleCheck {
    @MainActor static func main() async {
        let suite = LifecycleSuite(); defer { suite.cleanup() }
        do {
            try await suite.run()
            print("PASS \(suite.checks) application lifecycle assertions across \(suite.scenarios) scenarios")
        } catch {
            fputs(error.localizedDescription + "\n", stderr)
            exit(1)
        }
    }
}
