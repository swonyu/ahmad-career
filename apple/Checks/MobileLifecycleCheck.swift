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

    func run() async throws {
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
            for key in ["profileRevision", "latestServerRevision", "latestServerProfile", "connectionEnabled", "credentialAccount", "opportunityDraft"] { old.removeValue(forKey: key) }
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
            _ = await oldGET.value
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
        try await runLiveSubmissionCapability()
        try await runHostedContinuation()
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
            try check(changed && store.liveSubmissionEnabled == nil && !store.submissionAvailable && store.profile.resumeData == pdf,
                      "A new workspace without live capability stays unknown and preserves the explicitly kept CV draft")
            newer.handle = { call in
                if call.route == "session/revoke" { return ["ok": .bool(true)] }
                var response = self.workspace(0, workspace: "workspace-b", liveEnabled: .bool(true)); response["mode"] = .string("local"); return response
            }
            let newEnabled = await store.refresh()
            try check(newEnabled && store.liveSubmissionEnabled == true && store.submissionAvailable, "Only the new workspace can establish its own enabled capability")
            await store.disconnect()
            try check(!store.connected && store.liveSubmissionEnabled == nil && !store.submissionAvailable && store.profile.resumeData == pdf,
                      "Disconnect immediately clears verified capability while keeping the phone draft")
            let restored = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in newer })
            try check(!restored.connected && restored.liveSubmissionEnabled == nil && !restored.submissionAvailable && restored.profile.resumeData == pdf,
                      "A disconnected relaunch cannot resurrect another account's enabled capability")
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
            var tooLong = draft; tooLong.title = String(repeating: "x", count: 301)
            try check(!restored.keepOpportunityDraft(tooLong) && restored.opportunityDraft == draft, "Oversized edit cannot overwrite the last durable draft")
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
            try await suite.run()
            print("PASS \(suite.checks) application lifecycle assertions across \(suite.scenarios) scenarios")
        } catch {
            fputs(error.localizedDescription + "\n", stderr)
            exit(1)
        }
    }
}
