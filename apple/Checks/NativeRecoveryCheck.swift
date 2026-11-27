import Foundation
import Darwin

/// Recovery checks for an explicit receipt Stop, distinct unfinished drafts, and profile display labels.
/// This file is intentionally outside the shared check runners and has its own entry point.

@MainActor
private final class TestTokens: ApplicationTokenStore {
    var values: [String: String] = [:]
    func load(account: String) throws -> String? { values[account] }
    func save(_ token: String, account: String) throws { values[account] = token }
    func remove(account: String) throws { values.removeValue(forKey: account) }
}

@MainActor
private final class TestService: MobileApplicationServing {
    struct Call: Equatable { let route: String; let method: String; let body: [String: ApplicationValue]? }
    let origin: URL
    var token: String?
    var calls: [Call] = []
    var handle: (Call) async throws -> [String: ApplicationValue] = { _ in ["ok": .bool(true)] }
    init(_ origin: String = "https://first.example") { self.origin = URL(string: origin)! }
    func request(_ route: String, method: String, body: [String: ApplicationValue]?) async throws -> [String: ApplicationValue] {
        let call = Call(route: route, method: method, body: body); calls.append(call)
        return try await handle(call)
    }
    func invalidate() {}
    func count(_ route: String) -> Int { calls.filter { $0.route == route }.count }
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
private final class RecoverySuite {
    var checks = 0
    var scenarios = 0
    var folders: [URL] = []
    let success = "Stop requested. Jobs already dispatched still need a confirmed outcome."
    let unsupported = "The destination changed or the backup is not supported. Nothing was imported."
    let draftLimit = "This phone already keeps 200 unfinished edits. Existing drafts were kept."
    let shortlistLimit = "The merged shortlist exceeds 200 links. Nothing was replaced."
    let duplicateLinks = "The backup contains duplicate saved links."
    let opportunityLimit = "Keep the link under 4,096 characters and each opportunity detail under 500 characters."
    let readableNote = "Keep the note to 2,000 characters and use readable plain text. Your draft is kept."
    let invalidBackup = "This backup contains invalid or unsupported phone data. Nothing was replaced."
    let recoveredEdit = "Recovered edit selected. Open its record to review and save; earlier draft versions are kept."
    let keptOpportunity = "Unfinished opportunity kept on this phone."
    let staleOpportunity = "This unfinished opportunity changed. Reopen the draft list."
    let abandonedPlan = "abandoned-plan"
    let abandonedAttempt = "attempt-abandoned"
    let livePlan = "live-plan"
    let liveAttempt = "attempt-live"

    func check(_ condition: Bool, _ message: String) throws {
        guard condition else { throw MobileApplicationError(message: "FAILED: " + message) }
        checks += 1
    }
    func waitUntil(_ condition: () -> Bool) async throws {
        for _ in 0..<2000 {
            if condition() { return }
            try await Task.sleep(nanoseconds: 1_000_000)
        }
        throw MobileApplicationError(message: "Timed out waiting for a deterministic fixture")
    }
    func server(_ revision: Int, name: String = "Example") -> [String: ApplicationValue] {
        var value = PhoneApplicationProfile(); value.firstName = name; value.email = "example@example.invalid"
        var object = value.payload(); object["revision"] = .number(Double(revision)); object["resume"] = .null
        return object
    }
    func workspace(_ revision: Int, attempts: [[String: ApplicationValue]] = [], plans: [[String: ApplicationValue]] = [],
                   active: [String] = [], continuation: String? = nil) -> [String: ApplicationValue] {
        var value: [String: ApplicationValue] = [
            "ok": .bool(true), "workspaceId": .string("workspace-a"), "profile": .object(server(revision)),
            "jobs": .array([]), "attempts": .array(attempts.map(ApplicationValue.object)),
            "recoverablePlans": .array(plans.map(ApplicationValue.object)),
            "activePlanIds": .array(active.map(ApplicationValue.string)), "mode": .string("test")]
        if let continuation { value["capabilities"] = .object(["dispatchContinuation": .string(continuation)]) }
        return value
    }
    func review(_ id: String) -> [String: ApplicationValue] {
        ["id": .string(id), "digest": .string("digest-" + id), "profileRevision": .number(3),
         "expiresAt": .string(ISO8601DateFormatter().string(from: Date().addingTimeInterval(3600))),
         "stopped": .bool(false), "approvedAt": .null,
         "items": .array([.object(["jobId": .string("job-1"), "state": .string("ready"),
            "job": .object(["title": .string("Synthetic role"), "company": .string("Fixture")]),
            "payloadSummary": .object(["consentMarketing": .bool(false)])])])]
    }
    func attempt(_ id: String, _ state: String, plan: String) -> [String: ApplicationValue] {
        ["id": .string(id), "attemptId": .string(id), "state": .string(state), "planId": .string(plan)]
    }
    func initial(_ revision: Int = 3) throws -> PhoneApplicationState {
        var state = PhoneApplicationState(); state.acknowledge(try ApplicationServerProfile(server(revision)))
        state.serviceAddress = "https://first.example"; state.workspaceID = "workspace-a"
        state.connectionEnabled = true; state.credentialAccount = "fixture-account"
        return state
    }
    func scope() -> PhoneRecordScope { PhoneRecordScope(origin: "https://first.example", workspaceID: "workspace-a") }
    func jobMap(_ name: String, noteTitle: String = "Role") -> [String: ApplicationValue] {
        ["url": .string("https://jobs.example.com/" + name), "title": .string(noteTitle), "company": .string("Fixture Co"),
         "location": .string("Riyadh"), "country": .string("SA")]
    }
    func checkpoint(_ name: String, note: String, revision: Int? = nil, stage: PhoneApplicationStage = .saved, recordID: String? = nil) -> PhoneRecordDraftCheckpoint {
        let job = PhoneRecordJob(jobMap(name, noteTitle: note))
        var draft = PhoneRecordDraft(); draft.note = note; draft.stage = stage
        return PhoneRecordDraftCheckpoint(scope: scope(), identity: job.identity, job: job, recordID: recordID, revision: revision, draft: draft)
    }
    func opportunity(_ title: String, url: String) -> PhoneOpportunityDraft {
        PhoneOpportunityDraft(url: url, title: title, company: "Fixture Co", location: "Riyadh", country: "SA")
    }
    func opportunityBackup(current: PhoneOpportunityDraft = PhoneOpportunityDraft(), recovered: [PhoneOpportunityDraft] = []) -> PhoneWorkspaceBackup {
        var value = backup([])
        value.draft.opportunityDraft = current
        value.recoveredOpportunityDrafts = recovered
        return value
    }
    func backup(_ drafts: [PhoneRecordDraftCheckpoint], jobs: [[String: ApplicationValue]] = [], schema: Int = 1) -> PhoneWorkspaceBackup {
        let draft = PhoneWorkspaceDraft(scope: scope(), profile: PhoneApplicationProfile(), profileNeedsSync: false,
            profileRevision: nil, latestServerRevision: nil, latestServerProfile: nil, jobs: jobs, opportunityDraft: PhoneOpportunityDraft())
        var value = PhoneWorkspaceBackup(draft: draft, records: [], recordDrafts: drafts, submissionHolds: [])
        value.schemaVersion = schema
        return value
    }
    func fixture(_ state: PhoneApplicationState, service: TestService) throws -> (NativeApplicationsStore, URL, TestTokens) {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("career-recovery-" + UUID().uuidString)
        folders.append(folder); try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try JSONEncoder().encode(state).write(to: folder.appendingPathComponent("phone-draft.json"))
        let tokens = TestTokens(); tokens.values[state.tokenAccount] = "synthetic-token"
        let store = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, token in service.token = token; return service })
        return (store, folder, tokens)
    }
    func savedState(_ folder: URL) throws -> PhoneApplicationState {
        try JSONDecoder().decode(PhoneApplicationState.self, from: Data(contentsOf: folder.appendingPathComponent("phone-draft.json")))
    }
    func cleanup() { for folder in folders { try? FileManager.default.removeItem(at: folder) } }

    func profileLabels() throws {
        try check(PhoneProfileDisplay.experienceLabel(for: "entry") == "Entry level", "entry displays as Entry level")
        try check(PhoneProfileDisplay.experienceLabel(for: "mid") == "Mid level", "mid displays as Mid level")
        try check(PhoneProfileDisplay.experienceLabel(for: "Entry level") == "Entry level" && PhoneProfileDisplay.experienceLabel(for: "Mid level") == "Mid level",
                  "English human-readable labels map to themselves")
        try check(PhoneProfileDisplay.experienceLabel(for: "Entry") == nil && PhoneProfileDisplay.experienceLabel(for: "ملاحظة خاصة") == nil,
                  "Short chip words and arbitrary text stay unmapped on iPhone")
        try check(PhoneProfileDisplay.workPreferenceLabels(remote: true, hybrid: true, onsite: false) == ["Remote", "Hybrid"],
                  "Work-mode labels stay Remote then Hybrid")
        var state = try initial()
        state.profile.experienceLevel = "entry"; state.profile.remote = true; state.profile.hybrid = true; state.profile.onsite = false
        state.profile.firstName = "أحمد"; state.profileNeedsSync = true; state.profileRevision = 3; state.latestServerRevision = 4
        var serverProfile = PhoneApplicationProfile()
        serverProfile.firstName = "Server"; serverProfile.experienceLevel = "mid"
        serverProfile.remote = false; serverProfile.hybrid = false; serverProfile.onsite = true
        state.latestServerProfile = serverProfile
        let service = TestService()
        let (store, folder, _) = try fixture(state, service: service)
        let draft = store.profile
        try check(store.editContext.revision == 3, "The keep action starts from the stored draft revision")
        try check(store.keepDraftAfterReview(draft, context: store.editContext, serverRevision: 4), "Keeping the phone version succeeds")
        try check(store.profile.experienceLevel == "entry" && store.profile.firstName == "أحمد"
                  && store.profile.remote && store.profile.hybrid && !store.profile.onsite,
                  "Keep version preserves the stored wire value, Arabic name and work-mode booleans")
        try check(store.profile.experienceLevel != "Entry level" && store.profile.experienceLevel != "مبتدئ",
                  "The persisted experience value is not a display label")
        try check(store.useLatestProfile(context: store.editContext), "Using the latest service profile succeeds")
        try check(store.profile.experienceLevel == "mid" && store.profile.firstName == "Server"
                  && !store.profile.remote && !store.profile.hybrid && store.profile.onsite,
                  "Use latest stores the service wire value and booleans")
        let saved = try savedState(folder)
        try check(saved.profile.experienceLevel == "mid" && saved.profile.firstName == "Server" && service.calls.isEmpty,
                  "The chosen profile is what restart would read, and neither choice contacted the service")
        scenarios += 1
    }

    func receipts() async throws {
        let dispatching = workspace(3, attempts: [attempt(abandonedAttempt, "dispatching", plan: abandonedPlan)])
        let service = TestService()
        service.handle = { _ in dispatching }
        let (store, _, _) = try fixture(try initial(), service: service)
        try check(await store.refresh(), "A workspace refresh reads the dispatching receipt")
        try check(store.activePlanIDs.isEmpty && store.recoverablePlans.isEmpty, "An expired dispatch is absent from active and recoverable plans")
        try check(service.count("stop") == 0 && service.count("submit") == 0 && service.count("advance") == 0,
                  "Refresh does not stop, submit or advance")
        let long = String(repeating: "p", count: 201)
        await store.stopAndCheckReceipt(planID: long, attemptID: abandonedAttempt)
        await store.stopAndCheckReceipt(planID: abandonedPlan, attemptID: long)
        try check(service.count("stop") == 0, "Over-long receipt ids send no Stop")

        service.handle = { call in
            if call.route == "stop" { return ["ok": .bool(true)] }
            return dispatching
        }
        await store.stopAndCheckReceipt(planID: abandonedPlan, attemptID: abandonedAttempt)
        try check(service.count("stop") == 1 && service.count("submit") == 0 && service.count("advance") == 0, "One explicit Stop and no submit or advance")
        let stop = service.calls.first { $0.route == "stop" }
        try check(stop?.method == "POST" && stop?.body == ["planId": .string(self.abandonedPlan), "onlyIfUnapproved": .bool(false)],
                  "The receipt Stop sends planId and onlyIfUnapproved false")
        try check(store.attempts.first?["state"]?.string == "dispatching" && store.message == success,
                  "The receipt stays dispatching when the following read still says dispatching")
        scenarios += 1

        let gate = DelayedResponse()
        var reads = 0
        let uncertain = TestService()
        uncertain.handle = { call in
            if call.route == "stop" { return ["ok": .bool(true)] }
            reads += 1
            if reads == 1 { return dispatching }
            return try await gate.wait()
        }
        let (uncertainStore, _, _) = try fixture(try initial(), service: uncertain)
        try check(await uncertainStore.refresh(), "The uncertain fixture loads the dispatching receipt first")
        let stopping = Task { await uncertainStore.stopAndCheckReceipt(planID: self.abandonedPlan, attemptID: self.abandonedAttempt) }
        try await waitUntil { gate.started }
        try check(uncertainStore.attempts.first?["state"]?.string == "dispatching", "Stop does not locally invent uncertain before the workspace read returns")
        gate.finish(workspace(3, attempts: [attempt(abandonedAttempt, "uncertain", plan: abandonedPlan)]))
        await stopping.value
        try check(uncertainStore.attempts.first?["state"]?.string == "uncertain", "Uncertain appears only when the following workspace read says uncertain")
        scenarios += 1

        let liveService = TestService()
        let liveSnapshot = workspace(3, attempts: [attempt(abandonedAttempt, "dispatching", plan: abandonedPlan), attempt(liveAttempt, "dispatching", plan: livePlan)],
                                      plans: [review(livePlan)], active: [livePlan])
        liveService.handle = { call in
            if call.route == "stop" { return ["ok": .bool(true)] }
            return liveSnapshot
        }
        let (liveStore, _, _) = try fixture(try initial(), service: liveService)
        try check(await liveStore.refresh(), "The live-lease fixture loads both receipts")
        await liveStore.stopAndCheckReceipt(planID: abandonedPlan, attemptID: abandonedAttempt)
        try check(liveService.calls.first { $0.route == "stop" }?.body?["planId"]?.string == abandonedPlan, "Stop targets the receipt plan, not the live plan")
        try check(liveStore.activePlanIDs == [livePlan], "The live lease remains active")
        try check(liveStore.attempts.contains { ($0["attemptId"]?.string ?? "") == self.liveAttempt && $0["state"]?.string == "dispatching" },
                  "The live receipt stays dispatching")
        scenarios += 1

        var lateReads = 0
        let late = TestService()
        late.handle = { call in
            if call.route == "stop" { return ["ok": .bool(true)] }
            lateReads += 1
            if lateReads == 1 { return dispatching }
            return self.workspace(3, attempts: [self.attempt(self.abandonedAttempt, "submitted", plan: self.abandonedPlan)])
        }
        let (lateStore, _, _) = try fixture(try initial(), service: late)
        try check(await lateStore.refresh(), "The late-result fixture loads the dispatching receipt")
        await lateStore.stopAndCheckReceipt(planID: abandonedPlan, attemptID: abandonedAttempt)
        try check(lateStore.attempts.first?["state"]?.string == "submitted", "A later real submitted result replaces the dispatching snapshot")
        scenarios += 1

        var failedReads = 0
        let failing = TestService()
        failing.handle = { call in
            if call.route == "stop" { return ["ok": .bool(true)] }
            failedReads += 1
            if failedReads == 1 { return dispatching }
            throw URLError(.notConnectedToInternet)
        }
        let (failedStore, _, _) = try fixture(try initial(), service: failing)
        try check(await failedStore.refresh(), "The failed-read fixture loads the dispatching receipt")
        await failedStore.stopAndCheckReceipt(planID: abandonedPlan, attemptID: abandonedAttempt)
        try check(failedStore.attempts.first?["state"]?.string == "dispatching" && failedStore.message != success,
                  "A workspace read that fails after Stop leaves the last dispatching snapshot and does not keep the success sentence")
        scenarios += 1

        let lost = TestService()
        lost.handle = { call in
            if call.route == "stop" { throw URLError(.notConnectedToInternet) }
            return dispatching
        }
        let (lostStore, folder, tokens) = try fixture(try initial(), service: lost)
        try check(await lostStore.refresh(), "The lost-response fixture loads the dispatching receipt")
        let readsBefore = lost.count("workspace")
        await lostStore.stopAndCheckReceipt(planID: abandonedPlan, attemptID: abandonedAttempt)
        try check(lost.count("stop") == 1 && lost.count("workspace") == readsBefore && lost.count("advance") == 0,
                  "A lost Stop response records the request and does not refresh or advance")
        try check(lostStore.attempts.first?["state"]?.string == "dispatching", "The receipt stays dispatching when Stop's response is lost")
        try check(try savedState(folder).submissionHolds.contains { $0.planID == self.abandonedPlan }, "The Stop hold is on disk before any retry")
        let resumed = TestService()
        resumed.handle = { call in
            if call.route == "advance" { return ["ok": .bool(true)] }
            return self.workspace(3, attempts: [self.attempt(self.abandonedAttempt, "dispatching", plan: self.abandonedPlan)],
                                   plans: [self.review(self.abandonedPlan)], active: [self.abandonedPlan], continuation: "client")
        }
        let reopened = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, token in resumed.token = token; return resumed })
        await reopened.pollApprovedApplications()
        try check(resumed.count("advance") == 0 && reopened.heldPlanIDs.contains(abandonedPlan),
                  "After restart the held plan is not advanced")
        scenarios += 1

        let race = TestService()
        let (raceStore, _, _) = try fixture(try initial(), service: race)
        race.handle = { call in
            if call.route == "stop" {
                await raceStore.disconnect()
                return ["ok": .bool(true)]
            }
            if call.route == "session/revoke" { return ["ok": .bool(true)] }
            return dispatching
        }
        try check(await raceStore.refresh(), "The account-race fixture loads the dispatching receipt")
        let workspaceReads = race.count("workspace")
        await raceStore.stopAndCheckReceipt(planID: abandonedPlan, attemptID: abandonedAttempt)
        try await waitUntil { race.calls.contains { $0.route == "session/revoke" } }
        try check(raceStore.message != success && race.count("stop") == 1 && race.count("workspace") == workspaceReads,
                  "Disconnect during Stop drops the success sentence and sends no later workspace read")
        await raceStore.stopAndCheckReceipt(planID: abandonedPlan, attemptID: abandonedAttempt)
        try check(race.count("stop") == 1, "A disconnected phone does not send Stop to another workspace")
        scenarios += 1

        let busyService = TestService()
        let busyGate = DelayedResponse()
        busyService.handle = { call in
            if call.route == "session" { return try await busyGate.wait() }
            return dispatching
        }
        let (busyStore, busyFolder, _) = try fixture(try initial(), service: busyService)
        try check(await busyStore.refresh(), "The busy fixture loads the dispatching receipt")
        let connecting = Task { await busyStore.connect(address: "https://first.example", code: "fixture-code") }
        try await waitUntil { busyGate.started && busyStore.busy }
        await busyStore.stopAndCheckReceipt(planID: abandonedPlan, attemptID: abandonedAttempt)
        try check(busyService.count("stop") == 0, "Stop during an in-flight connection sends no request")
        try check(try savedState(busyFolder).submissionHolds.contains { $0.planID == self.abandonedPlan }, "The busy Stop still saves the hold")
        busyGate.fail(URLError(.cancelled))
        _ = await connecting.value
        try check(!busyStore.busy, "The connection attempt finishes after its fixture is released")
        scenarios += 1
    }


    func recoveredDraftRebase() throws {
        let service = TestService()
        let role = jobMap("older-base")
        var record = PhoneOpportunityRecord(scope: scope(), job: PhoneRecordJob(role))
        record.revision = 2; record.note = "Saved revision two"
        let current = checkpoint("older-base", note: "Current unfinished edit", revision: 2, recordID: record.id)
        let older = checkpoint("older-base", note: "النص المختار من نسخة قديمة\nChosen older text", revision: 1, recordID: record.id)
        var initialState = try initial()
        initialState.applicationRecords = [record]
        initialState.recordDrafts = [current]; initialState.recordDraftAlternatives = [older]
        let (store, folder, tokens) = try fixture(initialState, service: service)
        try check(store.useRecoveredRecordDraft(older), "An explicit selection accepts an older-base recovered edit")
        let job = store.savedOpportunities.first { MobileApplicationPolicy.jobIdentity($0["url"]?.string ?? "") == older.identity }!
        let edit = store.recordEditContext(for: job)!
        try check(store.restoredRecordDraft(for: edit) == older.draft,
                  "Opening the current record restores the explicitly chosen older text, not the saved note")
        let selected = try savedState(folder)
        try check(selected.applicationRecords == [record], "Choosing an unfinished edit does not change the saved record")
        try check(selected.recordDrafts.count == 1 && selected.recordDrafts[0].recordID == record.id
                  && selected.recordDrafts[0].revision == 2 && selected.recordDrafts[0].draft == older.draft,
                  "The selected draft is based on the current record for deliberate review")
        try check(selected.recordDraftAlternatives.contains(older) && selected.recordDraftAlternatives.contains(current),
                  "Both the original recovered base and the displaced current edit remain available")
        let reopened = NativeApplicationsStore(folder: folder, credentials: tokens,
            clientFactory: { _, token in service.token = token; return service })
        let reopenedEdit = reopened.recordEditContext(for: job)!
        try check(reopened.restoredRecordDraft(for: reopenedEdit) == older.draft,
                  "Restart keeps the selected older text available in the current editor context")
        let exported = reopened.exportWorkspace(context: reopened.workspaceActionContext)!
        let exportedBackup = try NativeApplicationsStore.readWorkspaceBackup(at: exported)
        try check(exportedBackup.recordDrafts.contains(older) && exportedBackup.recordDrafts.contains(current)
                  && exportedBackup.recordDrafts.contains { $0.recordID == record.id && $0.revision == 2 && $0.draft == older.draft },
                  "Backup preserves the review draft and both original unfinished versions")
        try check(reopened.saveRecord(reopened.restoredRecordDraft(for: reopenedEdit)!, context: reopenedEdit),
                  "The deliberately reviewed recovered text saves against the current record")
        let saved = try savedState(folder)
        try check(saved.applicationRecords.count == 1 && saved.applicationRecords[0].revision == 3
                  && saved.applicationRecords[0].note == older.draft.note && !saved.applicationRecords[0].appliedElsewhere,
                  "Saving writes the chosen note at the next revision without inventing an applied mark")
        try check(saved.recordDrafts.isEmpty && saved.recordDraftAlternatives.contains(older)
                  && saved.recordDraftAlternatives.contains(current),
                  "Saving consumes only the reviewed draft and preserves the earlier unfinished versions")
        try check(service.calls.isEmpty, "Selecting, reviewing and saving recovered phone text sends no service request")
        scenarios += 1

        try check(reopened.useRecoveredRecordDraft(older), "A retained original can be selected again for review")
        let staleEdit = reopened.recordEditContext(for: job)!
        var newer = PhoneRecordDraft(); newer.note = "An intentional newer save"
        try check(reopened.saveRecord(newer, context: staleEdit), "The current record can advance after an editor opened")
        let beforeStale = try Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))
        try check(!reopened.saveRecord(older.draft, context: staleEdit),
                  "A stale editor cannot overwrite the newer saved revision after recovered selection")
        try check(try Data(contentsOf: folder.appendingPathComponent("phone-draft.json")) == beforeStale,
                  "The stale save leaves the newer record and retained alternatives unchanged")
        scenarios += 1

        var conflicting = initialState
        var competing = record; competing.id = UUID().uuidString; competing.note = "Competing saved version"
        conflicting.applicationRecords.append(competing)
        let (conflictStore, conflictFolder, _) = try fixture(conflicting, service: TestService())
        let conflictBefore = try Data(contentsOf: conflictFolder.appendingPathComponent("phone-draft.json"))
        try check(!conflictStore.useRecoveredRecordDraft(older),
                  "Selection waits for comparison when more than one saved record is active")
        try check(try Data(contentsOf: conflictFolder.appendingPathComponent("phone-draft.json")) == conflictBefore
                  && conflictStore.recoveredRecordDrafts.contains(older),
                  "Ambiguous selection preserves every saved and unfinished version")
        scenarios += 1

        var full = initialState
        full.recordDrafts += (0..<198).map { checkpoint("capacity-\($0)", note: "kept \($0)") }
        let (fullStore, fullFolder, _) = try fixture(full, service: TestService())
        let fullBefore = try Data(contentsOf: fullFolder.appendingPathComponent("phone-draft.json"))
        try check(!fullStore.useRecoveredRecordDraft(older) && fullStore.message == draftLimit,
                  "Rebasing refuses when retaining all original versions would exceed 200 unfinished edits")
        try check(try Data(contentsOf: fullFolder.appendingPathComponent("phone-draft.json")) == fullBefore
                  && fullStore.unfinishedRecordDrafts.contains(current) && fullStore.recoveredRecordDrafts.contains(older),
                  "Capacity refusal leaves the current draft and original recovered text unchanged")
        scenarios += 1

        var foreign = older
        foreign.scope = PhoneRecordScope(origin: "https://second.example", workspaceID: "workspace-b")
        var scoped = initialState
        scoped.recordDraftAlternatives = [foreign]
        let (scopedStore, scopedFolder, _) = try fixture(scoped, service: TestService())
        let scopedBefore = try Data(contentsOf: scopedFolder.appendingPathComponent("phone-draft.json"))
        try check(!scopedStore.useRecoveredRecordDraft(foreign), "Recovered selection cannot cross a private workspace scope")
        try check(try Data(contentsOf: scopedFolder.appendingPathComponent("phone-draft.json")) == scopedBefore,
                  "A foreign-workspace selection leaves the phone file unchanged")
        scenarios += 1
    }

    func drafts() throws {
        let service = TestService()
        let (store, folder, tokens) = try fixture(try initial(), service: service)
        let applied = checkpoint("role", note: "نسخة مطبقة {ليست إيصالاً}", revision: 1, stage: .applied)
        let other = checkpoint("role", note: "نسخة ثانية {أقواس} و \\u007b داخل النص", revision: 2)
        let jobs = [jobMap("role")]
        try check(store.mergeBackup(backup([applied, other], jobs: jobs), context: store.workspaceActionContext), "An empty phone accepts two distinct drafts for one job")
        try check(store.unfinishedRecordDrafts.count == 1 && store.recoveredRecordDrafts.count == 1, "One draft stays current and the other is kept as an alternative")
        try check(store.unfinishedRecordDrafts[0].draft.note == applied.draft.note && store.recoveredRecordDrafts[0].draft.note == other.draft.note,
                  "Import order keeps the first distinct draft current")
        try check(try savedState(folder).applicationRecords.isEmpty, "An applied-stage draft does not become an application record")
        let exported = store.exportWorkspace(context: store.workspaceActionContext)
        let exportedBackup = try NativeApplicationsStore.readWorkspaceBackup(at: exported!)
        try check(exportedBackup.recordDrafts.map(\.draft.note) == [applied.draft.note, other.draft.note],
                  "Re-export writes the current draft before its alternative, including Arabic text and braces")
        let reopened = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, token in service.token = token; return service })
        try check(reopened.unfinishedRecordDrafts.map(\.draft.note) == [applied.draft.note]
                  && reopened.recoveredRecordDrafts.map(\.draft.note) == [other.draft.note],
                  "Restart keeps both unfinished drafts and their notes")
        let alternative = reopened.recoveredRecordDrafts[0]
        try check(reopened.useRecoveredRecordDraft(alternative) && reopened.message == recoveredEdit, "Selecting a recovered edit reports that earlier versions stay")
        try check(reopened.unfinishedRecordDrafts.map(\.draft.note) == [other.draft.note]
                  && reopened.unfinishedRecordDrafts[0].revision == nil
                  && reopened.recoveredRecordDrafts.contains(applied) && reopened.recoveredRecordDrafts.contains(other),
                  "Selection rebases a new-record edit and keeps both original unfinished versions")
        let job = reopened.savedOpportunities.first { MobileApplicationPolicy.jobIdentity($0["url"]?.string ?? "") == applied.identity }
        let edit = job.flatMap { reopened.recordEditContext(for: $0) }
        try check(edit != nil && reopened.restoredRecordDraft(for: edit!) == other.draft,
                  "A recovered edit without a saved record opens with the selected text")
        var saving = PhoneRecordDraft(); saving.stage = .saved; saving.note = "حفظ متعمد"
        try check(edit != nil && reopened.saveRecord(saving, context: edit!), "A deliberate save of the selected draft succeeds")
        let saved = try savedState(folder)
        try check(saved.applicationRecords.count == 1 && saved.applicationRecords[0].stage == .saved
                  && saved.applicationRecords[0].appliedElsewhere == false && saved.applicationRecords[0].note == "حفظ متعمد",
                  "Saving stage saved does not mark the job applied or invent provider evidence")
        scenarios += 1

        var existing = try initial()
        let current = checkpoint("role", note: "المسودة الحالية", revision: 1)
        existing.recordDrafts = [current]
        let (existingStore, existingFolder, _) = try fixture(existing, service: TestService())
        let incomingA = checkpoint("role", note: "بديل أول", revision: 2)
        let incomingB = checkpoint("role", note: "بديل ثان", revision: 3)
        try check(existingStore.mergeBackup(backup([incomingA, incomingB], jobs: jobs), context: existingStore.workspaceActionContext),
                  "An existing destination accepts distinct incoming drafts")
        try check(existingStore.unfinishedRecordDrafts.map(\.draft.note) == ["المسودة الحالية"], "The destination's current draft stays current")
        try check(Set(existingStore.recoveredRecordDrafts.map(\.draft.note)) == Set(["بديل أول", "بديل ثان"]),
                  "Two distinct incoming drafts become alternatives")
        try check(try savedState(existingFolder).applicationRecords.isEmpty, "Incoming alternatives do not create application records")
        scenarios += 1

        let (sameStore, _, _) = try fixture(try initial(), service: TestService())
        let left = checkpoint("role", note: "نفس النص", revision: 4, recordID: UUID().uuidString)
        var right = left; right.recordID = UUID().uuidString
        try check(sameStore.mergeBackup(backup([left, right]), context: sameStore.workspaceActionContext), "Identical draft content can be offered twice")
        try check(sameStore.unfinishedRecordDrafts.count == 1 && sameStore.recoveredRecordDrafts.isEmpty,
                  "The same identity, draft and revision is not stored twice")
        let changed = checkpoint("role", note: "نفس النص", revision: 5)
        try check(sameStore.mergeBackup(backup([changed]), context: sameStore.workspaceActionContext), "A different revision is a distinct unfinished edit")
        try check(sameStore.unfinishedRecordDrafts.count == 1 && sameStore.recoveredRecordDrafts.count == 1
                  && sameStore.recoveredRecordDrafts[0].revision == 5, "A different revision is kept as an alternative")
        scenarios += 1

        var old = try initial()
        old.recordDrafts = [checkpoint("legacy", note: "old backup")]
        var text = String(data: try JSONEncoder().encode(old), encoding: .utf8)!
        try check(text.contains("\"recordDraftAlternatives\":[]"), "A current phone draft encodes an empty alternatives list")
        text = text.replacingOccurrences(of: "\"recordDraftAlternatives\":[],", with: "")
        let decoded = try JSONDecoder().decode(PhoneApplicationState.self, from: Data(text.utf8))
        try check(decoded.recordDraftAlternatives.isEmpty && decoded.recordDrafts.count == 1 && decoded.recordDrafts[0].draft.note == "old backup",
                  "A phone draft written before alternatives existed decodes with the current draft intact")
        scenarios += 1

        let (damagedStore, damagedFolder, _) = try fixture(try initial(), service: TestService())
        let before = try Data(contentsOf: damagedFolder.appendingPathComponent("phone-draft.json"))
        var damaged = backup([checkpoint("damaged", note: "do not import")])
        damaged.schemaVersion = 99
        let source = damagedFolder.appendingPathComponent("source-backup.json")
        let sourceBytes = try JSONEncoder().encode(damaged)
        try sourceBytes.write(to: source)
        try check(!damagedStore.mergeBackup(damaged, context: damagedStore.workspaceActionContext) && damagedStore.message == unsupported,
                  "Backup schema 99 uses the generic unsupported message")
        try check(try Data(contentsOf: damagedFolder.appendingPathComponent("phone-draft.json")) == before, "A rejected backup leaves the phone draft unchanged")
        do {
            _ = try NativeApplicationsStore.readWorkspaceBackup(at: source)
            try check(false, "A schema 99 file is not accepted as a backup")
        } catch {
            try check(error.localizedDescription.contains("unchanged"), "Reading a damaged backup reports that existing files stay unchanged")
        }
        try check(try Data(contentsOf: source) == sourceBytes, "Reading or rejecting a backup does not modify the source file")
        scenarios += 1

        let tooMany = (0..<201).map { checkpoint("bulk-\($0)", note: "draft \($0)") }
        let (limitStore, limitFolder, _) = try fixture(try initial(), service: TestService())
        let limitBefore = try Data(contentsOf: limitFolder.appendingPathComponent("phone-draft.json"))
        try check(!limitStore.mergeBackup(backup(tooMany), context: limitStore.workspaceActionContext) && limitStore.message == unsupported,
                  "A backup that itself contains 201 drafts is rejected as unsupported")
        try check(try Data(contentsOf: limitFolder.appendingPathComponent("phone-draft.json")) == limitBefore, "An oversized backup does not change the phone")
        scenarios += 1

        var full = try initial()
        full.recordDrafts = (0..<200).map { checkpoint("full-\($0)", note: "kept \($0)") }
        let (fullStore, fullFolder, _) = try fixture(full, service: TestService())
        let fullBefore = try Data(contentsOf: fullFolder.appendingPathComponent("phone-draft.json"))
        try check(!fullStore.mergeBackup(backup([checkpoint("one-more", note: "one more")]), context: fullStore.workspaceActionContext)
                  && fullStore.message == draftLimit, "A phone that already keeps 200 drafts rejects one more with the draft-limit message")
        try check(fullStore.unfinishedRecordDrafts.count == 200 && fullStore.recoveredRecordDrafts.isEmpty, "The existing 200 drafts stay in place")
        try check(try Data(contentsOf: fullFolder.appendingPathComponent("phone-draft.json")) == fullBefore, "The rejected extra draft is not written")
        scenarios += 1

        let (staleStore, staleFolder, _) = try fixture(try initial(), service: TestService())
        try check(staleStore.mergeBackup(backup([checkpoint("stale", note: "base")], jobs: [jobMap("stale")]), context: staleStore.workspaceActionContext),
                  "The stale-context fixture imports one draft and its job")
        let context = staleStore.workspaceActionContext
        let staleJob = staleStore.savedOpportunities.first { ($0["url"]?.string ?? "").contains("/stale") }
        let staleEdit = staleJob.flatMap { staleStore.recordEditContext(for: $0) }
        var localEdit = PhoneRecordDraft(); localEdit.note = "تعديل محلي"
        try check(staleEdit != nil && staleStore.keepRecordDraft(localEdit, context: staleEdit!), "A local edit changes the workspace after the captured context")
        let staleBefore = try Data(contentsOf: staleFolder.appendingPathComponent("phone-draft.json"))
        try check(!staleStore.mergeBackup(backup([checkpoint("other", note: "should not land")]), context: context) && staleStore.message == unsupported,
                  "A stale workspace context cannot import into the changed phone")
        try check(try Data(contentsOf: staleFolder.appendingPathComponent("phone-draft.json")) == staleBefore, "The failed import leaves the edited phone draft unchanged")
        scenarios += 1
    }

    func localJob(_ name: String) -> [String: ApplicationValue] {
        var job = jobMap(name)
        job["id"] = .string("local-" + name)
        job["localOnly"] = .bool(true)
        return job
    }

    func shortlistCap() async throws {
        var full = try initial()
        full.jobs = (0..<200).map { localJob("kept-\($0)") }
        let service = TestService()
        let (store, folder, _) = try fixture(full, service: service)
        let before = try Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))
        let added = await store.addJob(url: "https://jobs.example.com/one-more", title: "One more", company: "Fixture Co", location: "Riyadh", country: "SA")
        try check(!added && store.message == shortlistLimit, "The 201st saved link is refused with the shortlist sentence")
        try check(try Data(contentsOf: folder.appendingPathComponent("phone-draft.json")) == before, "Refusing the 201st link does not write the phone draft")
        try check(service.count("jobs") == 0 && service.count("submit") == 0 && service.count("advance") == 0, "A refused link is not sent")
        let duplicate = await store.addJob(url: "https://jobs.example.com/kept-0", title: "Role", company: "Fixture Co", location: "Riyadh", country: "SA")
        let afterDuplicate = try Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))
        try check(!duplicate && store.message == "This opportunity is already in your workspace.", "A duplicate of a full shortlist still uses the existing notice")
        try check(afterDuplicate == before && service.count("jobs") == 0, "The duplicate notice does not write or send")
        scenarios += 1

        var almost = try initial()
        almost.jobs = (0..<199).map { localJob("open-\($0)") }
        let openService = TestService()
        openService.handle = { call in
            if call.route == "jobs" {
                return ["ok": .bool(true), "job": .object(["id": .string("server-last"), "url": .string("https://jobs.example.com/last"),
                    "title": .string("Last"), "company": .string("Fixture Co")])]
            }
            return self.workspace(3)
        }
        let (openStore, openFolder, _) = try fixture(almost, service: openService)
        let opened = await openStore.addJob(url: "https://jobs.example.com/last", title: "Last", company: "Fixture Co", location: "Riyadh", country: "SA")
        let openedDraft = try savedState(openFolder)
        try check(opened && openedDraft.jobs.count == 200, "The 200th saved link is kept")
        try check(openedDraft.jobs.contains { $0["url"]?.string == "https://jobs.example.com/last" }, "The accepted link is the one the phone saved")
        scenarios += 1

        let remoteJobs = (0..<200).map { index -> [String: ApplicationValue] in
            ["id": .string("server-\(index)"), "url": .string("https://jobs.example.com/server-\(index)"),
             "title": .string("Server"), "company": .string("Fixture Co")]
        }
        var remoteWorkspace = workspace(3)
        remoteWorkspace["jobs"] = .array(remoteJobs.map(ApplicationValue.object))
        let remoteService = TestService()
        remoteService.handle = { call in
            if call.route == "jobs" {
                return ["ok": .bool(true), "job": .object(["id": .string("server-extra"), "url": .string("https://jobs.example.com/phone-only"),
                    "title": .string("Phone"), "company": .string("Fixture Co")])]
            }
            return remoteWorkspace
        }
        let (remoteStore, remoteFolder, _) = try fixture(try initial(), service: remoteService)
        try check(await remoteStore.refresh(), "A full service shortlist loads for display")
        let remoteDraft = try savedState(remoteFolder)
        try check(remoteStore.jobs.count == 200 && remoteDraft.jobs.isEmpty, "Service jobs stay out of the phone draft")
        let localSaved = await remoteStore.addJob(url: "https://jobs.example.com/phone-only", title: "Phone", company: "Fixture Co", location: "Riyadh", country: "SA")
        let phoneDraft = try savedState(remoteFolder)
        try check(localSaved && phoneDraft.jobs.count == 1, "A full service list does not consume the phone draft budget")
        scenarios += 1

        var overflow = try initial()
        overflow.jobs = (0..<201).map { localJob("overflow-\($0)") }
        let (exportStore, exportFolder, _) = try fixture(overflow, service: TestService())
        let exportBefore = try Data(contentsOf: exportFolder.appendingPathComponent("phone-draft.json"))
        let refused = exportStore.exportWorkspace(context: exportStore.workspaceActionContext)
        let written = try FileManager.default.contentsOfDirectory(at: exportFolder, includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.hasPrefix("Career-Finder-Phone-Workspace-") }
        let exportAfter = try Data(contentsOf: exportFolder.appendingPathComponent("phone-draft.json"))
        try check(refused == nil && exportStore.message == shortlistLimit, "Export refuses a shortlist the backup cannot import")
        try check(written.isEmpty && exportAfter == exportBefore, "A refused export writes no file and leaves the phone draft unchanged")
        scenarios += 1

        var exact = try initial()
        exact.jobs = (0..<200).map { localJob("export-\($0)") }
        let (exactStore, _, _) = try fixture(exact, service: TestService())
        try check(exactStore.exportWorkspace(context: exactStore.workspaceActionContext) != nil, "Exactly 200 saved links still export")
        scenarios += 1

        let preservedDrafts = "These workspace drafts need a compatible app version. The original phone data has been preserved."
        var exactDrafts = try initial()
        exactDrafts.recordDrafts = (0..<200).map { checkpoint("export-draft-\($0)", note: "kept \($0)") }
        let (exactDraftStore, _, _) = try fixture(exactDrafts, service: TestService())
        try check(exactDraftStore.exportWorkspace(context: exactDraftStore.workspaceActionContext) != nil, "Exactly 200 unfinished edits still export")
        scenarios += 1

        var overflowDrafts = try initial()
        overflowDrafts.recordDrafts = (0..<201).map { checkpoint("overflow-draft-\($0)", note: "kept \($0)") }
        let (overflowDraftStore, overflowDraftFolder, _) = try fixture(overflowDrafts, service: TestService())
        let overflowDraftBefore = try Data(contentsOf: overflowDraftFolder.appendingPathComponent("phone-draft.json"))
        let overflowDraftRefused = overflowDraftStore.exportWorkspace(context: overflowDraftStore.workspaceActionContext)
        let overflowDraftWritten = try FileManager.default.contentsOfDirectory(at: overflowDraftFolder, includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.hasPrefix("Career-Finder-Phone-Workspace-") }
        let overflowDraftAfter = try Data(contentsOf: overflowDraftFolder.appendingPathComponent("phone-draft.json"))
        try check(overflowDraftRefused == nil && overflowDraftStore.message == preservedDrafts
                  && overflowDraftStore.unfinishedRecordDrafts.isEmpty, "A phone file with 201 unfinished edits is kept and not exported")
        try check(overflowDraftWritten.isEmpty && overflowDraftAfter == overflowDraftBefore,
                  "The unread draft file is not replaced and no backup is written")
        scenarios += 1

        var overflowRecovered = try initial()
        overflowRecovered.recoveredOpportunityDrafts = (0..<201).map { index in
            PhoneRecoveredOpportunity(scope: scope(), draft: opportunity("Parked \(index)", url: "https://jobs.example.com/export-parked-\(index)"))
        }
        let (overflowRecoveredStore, overflowRecoveredFolder, _) = try fixture(overflowRecovered, service: TestService())
        let overflowRecoveredBefore = try Data(contentsOf: overflowRecoveredFolder.appendingPathComponent("phone-draft.json"))
        let overflowRecoveredRefused = overflowRecoveredStore.exportWorkspace(context: overflowRecoveredStore.workspaceActionContext)
        let overflowRecoveredWritten = try FileManager.default.contentsOfDirectory(at: overflowRecoveredFolder, includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.hasPrefix("Career-Finder-Phone-Workspace-") }
        let overflowRecoveredAfter = try Data(contentsOf: overflowRecoveredFolder.appendingPathComponent("phone-draft.json"))
        try check(overflowRecoveredRefused == nil && overflowRecoveredStore.message == preservedDrafts
                  && overflowRecoveredStore.recoveredOpportunityDrafts.isEmpty, "A phone file with 201 parked opportunities is kept and not exported")
        try check(overflowRecoveredWritten.isEmpty && overflowRecoveredAfter == overflowRecoveredBefore,
                  "The unread parked-opportunity file is not replaced and no backup is written")
        scenarios += 1

        var paired = try initial()
        let first = localJob("paired")
        var second = localJob("paired-copy")
        second["url"] = first["url"] ?? .string("")
        second["title"] = .string("Different title")
        paired.jobs = [first, second]
        let (pairStore, pairFolder, _) = try fixture(paired, service: TestService())
        let pairBefore = try Data(contentsOf: pairFolder.appendingPathComponent("phone-draft.json"))
        let pairRefused = pairStore.exportWorkspace(context: pairStore.workspaceActionContext)
        let pairWritten = try FileManager.default.contentsOfDirectory(at: pairFolder, includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.hasPrefix("Career-Finder-Phone-Workspace-") }
        let pairAfter = try Data(contentsOf: pairFolder.appendingPathComponent("phone-draft.json"))
        try check(pairRefused == nil && pairStore.message == duplicateLinks, "Export refuses two saved links with the same address")
        try check(pairWritten.isEmpty && pairAfter == pairBefore, "A duplicate-link export writes no file and leaves the phone draft unchanged")
        try check(pairStore.jobs.count == 2, "Refusing the export keeps both saved links")
        scenarios += 1

        var tracked = try initial()
        let plain = localJob("tracked")
        var tagged = localJob("tracked-utm")
        tagged["url"] = .string("https://jobs.example.com/tracked?utm_source=phone")
        tagged["title"] = .string("Tracked title")
        tracked.jobs = [plain, tagged]
        let (trackStore, trackFolder, _) = try fixture(tracked, service: TestService())
        let trackBefore = try Data(contentsOf: trackFolder.appendingPathComponent("phone-draft.json"))
        let trackRefused = trackStore.exportWorkspace(context: trackStore.workspaceActionContext)
        let trackWritten = try FileManager.default.contentsOfDirectory(at: trackFolder, includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.hasPrefix("Career-Finder-Phone-Workspace-") }
        let trackAfter = try Data(contentsOf: trackFolder.appendingPathComponent("phone-draft.json"))
        try check(trackRefused == nil && trackStore.message == duplicateLinks, "Export refuses a tracking-parameter copy of a saved link")
        try check(trackWritten.isEmpty && trackAfter == trackBefore, "The tracking-parameter refusal writes nothing and leaves both rows")
        scenarios += 1

        let (sameStore, sameFolder, _) = try fixture(try initial(), service: TestService())
        let sameBefore = try Data(contentsOf: sameFolder.appendingPathComponent("phone-draft.json"))
        var sameCopy = localJob("incoming-copy")
        sameCopy["url"] = localJob("incoming")["url"] ?? .string("")
        sameCopy["title"] = .string("Second title")
        try check(!sameStore.mergeBackup(backup([], jobs: [localJob("incoming"), sameCopy]), context: sameStore.workspaceActionContext)
                  && sameStore.message == duplicateLinks, "Import refuses a backup whose own saved links repeat")
        try check(try Data(contentsOf: sameFolder.appendingPathComponent("phone-draft.json")) == sameBefore, "The refused duplicate backup does not change the phone")
        scenarios += 1

        let (utmStore, utmFolder, _) = try fixture(try initial(), service: TestService())
        let utmBefore = try Data(contentsOf: utmFolder.appendingPathComponent("phone-draft.json"))
        var utmCopy = localJob("incoming-utm")
        utmCopy["url"] = .string("https://jobs.example.com/incoming-plain?utm_source=phone")
        utmCopy["title"] = .string("Tracked incoming")
        try check(!utmStore.mergeBackup(backup([], jobs: [localJob("incoming-plain"), utmCopy]), context: utmStore.workspaceActionContext)
                  && utmStore.message == duplicateLinks, "Import refuses a tracking-parameter copy inside one backup")
        try check(try Data(contentsOf: utmFolder.appendingPathComponent("phone-draft.json")) == utmBefore, "The tracking-parameter backup leaves the phone unchanged")
        scenarios += 1

        let (distinctStore, distinctFolder, _) = try fixture(try initial(), service: TestService())
        try check(distinctStore.mergeBackup(backup([], jobs: [localJob("alpha"), localJob("beta")]), context: distinctStore.workspaceActionContext),
                  "Two different saved links in one backup still import")
        let distinctSaved = try savedState(distinctFolder)
        try check(distinctSaved.jobs.count == 2
                  && distinctSaved.jobs.contains { $0["title"]?.string == "Role" && ($0["url"]?.string ?? "").hasSuffix("/alpha") }
                  && distinctSaved.jobs.contains { ($0["url"]?.string ?? "").hasSuffix("/beta") },
                  "Both distinct incoming links are kept")
        scenarios += 1

        var crowded = try initial()
        crowded.jobs = (0..<201).map { localJob("crowded-\($0)") }
        let (crowdedStore, crowdedFolder, _) = try fixture(crowded, service: TestService())
        let crowdedBefore = try Data(contentsOf: crowdedFolder.appendingPathComponent("phone-draft.json"))
        var profileOnly = backup([])
        profileOnly.draft.profile.firstName = "Imported"
        try check(crowdedStore.mergeBackup(profileOnly, context: crowdedStore.workspaceActionContext),
                  "A phone that already keeps 201 links can import a profile without adding a link")
        let crowdedSaved = try savedState(crowdedFolder)
        try check(crowdedSaved.jobs.count == 201 && crowdedStore.jobs.count == 201
                  && crowdedSaved.profile.firstName == "Imported"
                  && crowdedSaved.jobs.contains { ($0["url"]?.string ?? "").hasSuffix("/crowded-0") }
                  && crowdedSaved.jobs.contains { ($0["url"]?.string ?? "").hasSuffix("/crowded-200") },
                  "The profile import keeps every existing link")
        try check(try Data(contentsOf: crowdedFolder.appendingPathComponent("phone-draft.json")) != crowdedBefore,
                  "The profile import is written")
        scenarios += 1

        let (growthStore, growthFolder, _) = try fixture(crowded, service: TestService())
        let growthBefore = try Data(contentsOf: growthFolder.appendingPathComponent("phone-draft.json"))
        let growthRefused = growthStore.mergeBackup(backup([], jobs: [localJob("one-more")]), context: growthStore.workspaceActionContext, replaceProfile: false)
        let growthAfter = try Data(contentsOf: growthFolder.appendingPathComponent("phone-draft.json"))
        try check(!growthRefused && growthStore.message == shortlistLimit && growthStore.jobs.count == 201,
                  "Adding one link to 201 saved links is refused")
        try check(growthAfter == growthBefore, "The refused add leaves the 201-link phone file unchanged")
        scenarios += 1

        var exactFull = try initial()
        exactFull.jobs = (0..<200).map { localJob("full-\($0)") }
        let (fullMergeStore, fullMergeFolder, _) = try fixture(exactFull, service: TestService())
        let fullMergeBefore = try Data(contentsOf: fullMergeFolder.appendingPathComponent("phone-draft.json"))
        let fullMergeRefused = fullMergeStore.mergeBackup(backup([], jobs: [localJob("past-full")]), context: fullMergeStore.workspaceActionContext, replaceProfile: false)
        let fullMergeAfter = try Data(contentsOf: fullMergeFolder.appendingPathComponent("phone-draft.json"))
        try check(!fullMergeRefused && fullMergeStore.message == shortlistLimit && fullMergeStore.jobs.count == 200,
                  "A 200-link phone still refuses one more link from a backup")
        try check(fullMergeAfter == fullMergeBefore, "Refusing that backup leaves the 200-link phone file unchanged")
        scenarios += 1

        let (sameLinksStore, sameLinksFolder, _) = try fixture(crowded, service: TestService())
        let sameLinksBefore = try Data(contentsOf: sameLinksFolder.appendingPathComponent("phone-draft.json"))
        let sameLinks = sameLinksStore.mergeBackup(backup([], jobs: [localJob("crowded-0")]), context: sameLinksStore.workspaceActionContext, replaceProfile: false)
        let sameLinksAfter = try Data(contentsOf: sameLinksFolder.appendingPathComponent("phone-draft.json"))
        try check(sameLinks && sameLinksStore.jobs.count == 201 && sameLinksAfter == sameLinksBefore,
                  "A backup that only repeats a saved link leaves the 201-link phone unchanged")
        scenarios += 1
    }

    func opportunityDrafts() throws {
        let otherScope = PhoneRecordScope(origin: "https://second.example", workspaceID: "workspace-b")
        let adopted = opportunity("Adopted", url: "https://jobs.example.com/adopted")
        let (emptyStore, emptyFolder, _) = try fixture(try initial(), service: TestService())
        try check(emptyStore.mergeBackup(opportunityBackup(current: adopted, recovered: [adopted]), context: emptyStore.workspaceActionContext, replaceProfile: false),
                  "An empty phone adopts the incoming opportunity draft")
        let emptySaved = try savedState(emptyFolder)
        try check(emptyStore.opportunityDraft == adopted && emptyStore.recoveredOpportunityDrafts.isEmpty
                  && emptySaved.opportunityDraft == adopted && emptySaved.recoveredOpportunityDrafts.isEmpty,
                  "Adopting that draft does not also park a copy of it")
        scenarios += 1

        var occupied = try initial()
        let kept = opportunity("Keep me", url: "https://jobs.example.com/keep")
        let already = opportunity("Already parked", url: "https://jobs.example.com/already")
        let parkedIncoming = opportunity("Parked incoming", url: "https://jobs.example.com/parked")
        occupied.opportunityDraft = kept
        occupied.recoveredOpportunityDrafts = [PhoneRecoveredOpportunity(scope: scope(), draft: already)]
        let (occupiedStore, occupiedFolder, _) = try fixture(occupied, service: TestService())
        let occupiedContext = occupiedStore.workspaceActionContext
        try check(occupiedStore.mergeBackup(opportunityBackup(current: parkedIncoming, recovered: [already, parkedIncoming]), context: occupiedContext, replaceProfile: false),
                  "A phone that already has opportunity text keeps it and parks the other draft")
        let occupiedSaved = try savedState(occupiedFolder)
        try check(occupiedStore.opportunityDraft == kept && occupiedStore.recoveredOpportunityDrafts == [already, parkedIncoming],
                  "The parked draft is stored once, after the draft this workspace already kept")
        try check(occupiedSaved.opportunityDraft == kept
                  && occupiedSaved.recoveredOpportunityDrafts.map(\.draft) == [already, parkedIncoming]
                  && occupiedSaved.recoveredOpportunityDrafts.allSatisfy { $0.scope == scope() },
                  "The parked opportunity survives reload and stays bound to this workspace")
        let occupiedAfter = occupiedStore.workspaceActionContext
        try check(occupiedContext.connection == occupiedAfter.connection && occupiedContext.content != occupiedAfter.content,
                  "Parking an opportunity rotates the workspace content token and keeps the connection")
        try check(!occupiedStore.mergeBackup(backup([]), context: occupiedContext, replaceProfile: false)
                  && occupiedStore.message == unsupported,
                  "A context captured before the parked opportunity does not apply again")
        scenarios += 1

        var sameDraft = try initial()
        sameDraft.opportunityDraft = kept
        sameDraft.recoveredOpportunityDrafts = [PhoneRecoveredOpportunity(scope: scope(), draft: already)]
        let (sameDraftStore, sameDraftFolder, _) = try fixture(sameDraft, service: TestService())
        let sameDraftBefore = try Data(contentsOf: sameDraftFolder.appendingPathComponent("phone-draft.json"))
        try check(sameDraftStore.mergeBackup(opportunityBackup(current: kept, recovered: [kept, already]), context: sameDraftStore.workspaceActionContext, replaceProfile: false),
                  "An identical incoming opportunity can be offered again")
        try check(sameDraftStore.opportunityDraft == kept && sameDraftStore.recoveredOpportunityDrafts == [already],
                  "Copies of the current draft and the already parked draft are not stored again")
        try check(try Data(contentsOf: sameDraftFolder.appendingPathComponent("phone-draft.json")) == sameDraftBefore,
                  "An identical opportunity import does not rewrite the phone file")
        scenarios += 1

        let (androidSource, androidFolder, _) = try fixture(occupied, service: TestService())
        let exportedAndroid = androidSource.exportWorkspace(context: androidSource.workspaceActionContext)
        var androidObject = try JSONSerialization.jsonObject(with: Data(contentsOf: exportedAndroid!)) as! [String: Any]
        androidObject["platform"] = "android"
        var androidData = androidObject["data"] as! [String: Any]
        androidData["opportunityDraft"] = ["url": "https://jobs.example.com/android-current", "title": "Android current",
                                            "company": "Fixture Co", "location": "Riyadh", "country": "SA"]
        androidObject["data"] = androidData
        androidObject["extensions"] = ["android": [
            "recoveredOpportunityDrafts": [["url": "https://jobs.example.com/android-parked", "title": "Android parked",
                                            "company": "Fixture Co", "location": "Riyadh", "country": "SA"]],
            "receiptArchive": ["evidenceMode": "imported"]]]
        let androidBackup = try JSONDecoder().decode(PhoneWorkspaceBackup.self, from: try JSONSerialization.data(withJSONObject: androidObject))
        try check(androidBackup.draft.opportunityDraft.title == "Android current"
                  && androidBackup.recoveredOpportunityDrafts.map(\.title) == ["Android parked"]
                  && androidBackup.discoverySnapshot == nil,
                  "An Android backup decodes its current and parked opportunity drafts and ignores receipt archive data")
        let (androidStore, androidSavedFolder, _) = try fixture(occupied, service: TestService())
        try check(androidStore.mergeBackup(androidBackup, context: androidStore.workspaceActionContext, replaceProfile: false),
                  "The Android opportunity backup merges into the occupied phone")
        let androidSaved = try savedState(androidSavedFolder)
        try check(androidStore.opportunityDraft == kept
                  && androidSaved.recoveredOpportunityDrafts.map(\.draft.title) == ["Already parked", "Android parked", "Android current"],
                  "The destination draft stays and the Android drafts are parked after the one already kept")
        _ = androidFolder
        scenarios += 1

        let restored = androidStore.recoveredOpportunityDrafts[1]
        let androidCurrent = opportunity("Android current", url: "https://jobs.example.com/android-current")
        try check(androidStore.restoreRecoveredOpportunityDraft(restored) && androidStore.message == keptOpportunity,
                  "Continuing a parked opportunity reports that it stays on this phone")
        try check(androidStore.opportunityDraft == restored
                  && androidStore.recoveredOpportunityDrafts == [already, androidCurrent, kept],
                  "Continue swaps that draft in and parks the previous current text")
        let (reopenedOpportunity, _, _) = try fixture(try savedState(androidSavedFolder), service: TestService())
        try check(reopenedOpportunity.opportunityDraft == restored && reopenedOpportunity.recoveredOpportunityDrafts == [already, androidCurrent, kept],
                  "Restart keeps the continued opportunity and the draft it replaced")
        scenarios += 1

        let restoredBytes = try Data(contentsOf: androidSavedFolder.appendingPathComponent("phone-draft.json"))
        let ghost = opportunity("Ghost", url: "https://jobs.example.com/ghost")
        try check(!androidStore.restoreRecoveredOpportunityDraft(ghost) && androidStore.message == staleOpportunity,
                  "A draft that is no longer in this workspace's list is refused")
        try check(try Data(contentsOf: androidSavedFolder.appendingPathComponent("phone-draft.json")) == restoredBytes
                  && androidStore.opportunityDraft == restored,
                  "The stale draft leaves the phone file and the current opportunity unchanged")
        scenarios += 1

        let continuedExport = androidStore.exportWorkspace(context: androidStore.workspaceActionContext)
        let continuedBackup = try NativeApplicationsStore.readWorkspaceBackup(at: continuedExport!)
        let continuedText = String(decoding: try Data(contentsOf: continuedExport!), as: UTF8.self)
        try check(continuedText.contains("recoveredOpportunityDrafts")
                  && continuedBackup.recoveredOpportunityDrafts == androidStore.recoveredOpportunityDrafts,
                  "Export writes this workspace's parked opportunity drafts")
        scenarios += 1

        let (plainStore, plainFolder, _) = try fixture(try initial(), service: TestService())
        let plainExport = plainStore.exportWorkspace(context: plainStore.workspaceActionContext)
        let plainRoot = try JSONSerialization.jsonObject(with: Data(contentsOf: plainExport!)) as! [String: Any]
        let plainExtensions = plainRoot["extensions"] as? [String: Any]
        let plainText = String(decoding: try Data(contentsOf: plainExport!), as: UTF8.self)
        try check(plainExtensions?["android"] == nil && !plainText.contains("recoveredOpportunityDrafts"),
                  "A phone with no parked opportunity omits that Android extension")
        _ = plainFolder
        scenarios += 1

        var mixed = try initial()
        let visible = opportunity("Visible parked", url: "https://jobs.example.com/visible")
        let otherDraft = opportunity("Other workspace", url: "https://jobs.example.com/other-workspace")
        mixed.opportunityDraft = kept
        mixed.recoveredOpportunityDrafts = [PhoneRecoveredOpportunity(scope: scope(), draft: visible),
                                            PhoneRecoveredOpportunity(scope: otherScope, draft: otherDraft)]
        let (mixedStore, mixedFolder, _) = try fixture(mixed, service: TestService())
        try check(mixedStore.recoveredOpportunityDrafts == [visible], "This workspace's list hides another workspace's parked opportunity")
        let mixedExport = mixedStore.exportWorkspace(context: mixedStore.workspaceActionContext)
        let mixedBackup = try NativeApplicationsStore.readWorkspaceBackup(at: mixedExport!)
        let mixedText = String(decoding: try Data(contentsOf: mixedExport!), as: UTF8.self)
        try check(mixedBackup.recoveredOpportunityDrafts == [visible] && !mixedText.contains("Other workspace"),
                  "Export contains only this workspace's parked opportunity")
        try check(mixedStore.clearWorkspaceOnPhone(context: mixedStore.workspaceActionContext), "Clearing this workspace succeeds")
        let mixedSaved = try savedState(mixedFolder)
        try check(!mixedSaved.opportunityDraft.hasContent
                  && mixedSaved.recoveredOpportunityDrafts == [PhoneRecoveredOpportunity(scope: otherScope, draft: otherDraft)],
                  "Clear removes only this workspace's parked opportunity and keeps the other workspace's draft")
        scenarios += 1

        var unpaired = try initial()
        let localCurrent = opportunity("Local current", url: "https://jobs.example.com/local-current")
        let localParked = opportunity("Local parked", url: "https://jobs.example.com/local-parked")
        unpaired.workspaceDrafts = [PhoneWorkspaceDraft(scope: PhoneRecordScope(), profile: PhoneApplicationProfile(), profileNeedsSync: false,
            profileRevision: nil, latestServerRevision: nil, latestServerProfile: nil, jobs: [], opportunityDraft: localCurrent)]
        unpaired.recoveredOpportunityDrafts = [PhoneRecoveredOpportunity(scope: PhoneRecordScope(), draft: localParked)]
        let (unpairedStore, unpairedFolder, _) = try fixture(unpaired, service: TestService())
        try check(unpairedStore.importUnpairedDraft(context: unpairedStore.workspaceActionContext), "Copying the unpaired opportunity draft succeeds")
        let unpairedSaved = try savedState(unpairedFolder)
        try check(unpairedStore.opportunityDraft == localCurrent, "The empty destination adopts the unpaired current draft")
        try check(unpairedSaved.recoveredOpportunityDrafts.contains(PhoneRecoveredOpportunity(scope: scope(), draft: localParked))
                  && unpairedSaved.recoveredOpportunityDrafts.contains(PhoneRecoveredOpportunity(scope: PhoneRecordScope(), draft: localParked)),
                  "The copy keeps a destination-scoped parked draft and the original local one")
        try check(unpairedSaved.workspaceDrafts.contains { $0.scope.isLocal && $0.opportunityDraft == localCurrent },
                  "The original unpaired opportunity draft remains on the phone")
        scenarios += 1

        var capped = try initial()
        capped.opportunityDraft = kept
        capped.recoveredOpportunityDrafts = (0..<200).map { index in
            PhoneRecoveredOpportunity(scope: scope(), draft: opportunity("Parked \(index)", url: "https://jobs.example.com/parked-\(index)"))
        }
        let (cappedStore, cappedFolder, _) = try fixture(capped, service: TestService())
        let cappedBefore = try Data(contentsOf: cappedFolder.appendingPathComponent("phone-draft.json"))
        try check(!cappedStore.mergeBackup(opportunityBackup(current: parkedIncoming), context: cappedStore.workspaceActionContext, replaceProfile: false)
                  && cappedStore.message == draftLimit, "Two hundred parked drafts in this workspace refuse one more")
        try check(try Data(contentsOf: cappedFolder.appendingPathComponent("phone-draft.json")) == cappedBefore
                  && cappedStore.recoveredOpportunityDrafts.count == 200 && cappedStore.opportunityDraft == kept,
                  "The refused opportunity leaves the current draft and all two hundred parked drafts")
        scenarios += 1

        var otherFull = try initial()
        otherFull.opportunityDraft = kept
        otherFull.recoveredOpportunityDrafts = (0..<200).map { index in
            PhoneRecoveredOpportunity(scope: otherScope, draft: opportunity("Other \(index)", url: "https://jobs.example.com/other-\(index)"))
        }
        let (otherFullStore, otherFullFolder, _) = try fixture(otherFull, service: TestService())
        let otherFullBefore = try Data(contentsOf: otherFullFolder.appendingPathComponent("phone-draft.json"))
        try check(!otherFullStore.mergeBackup(opportunityBackup(current: parkedIncoming), context: otherFullStore.workspaceActionContext, replaceProfile: false)
                  && otherFullStore.message == draftLimit, "Two hundred parked drafts across workspaces refuse one more")
        let otherFullSaved = try savedState(otherFullFolder)
        try check(try Data(contentsOf: otherFullFolder.appendingPathComponent("phone-draft.json")) == otherFullBefore
                  && otherFullStore.recoveredOpportunityDrafts.isEmpty && otherFullStore.opportunityDraft == kept
                  && otherFullSaved.recoveredOpportunityDrafts.count == 200
                  && otherFullSaved.recoveredOpportunityDrafts.allSatisfy { $0.scope == otherScope },
                  "The cross-workspace refusal writes nothing and keeps every other workspace draft")
        scenarios += 1

        let (invalidStore, invalidFolder, _) = try fixture(try initial(), service: TestService())
        let invalidBefore = try Data(contentsOf: invalidFolder.appendingPathComponent("phone-draft.json"))
        var invalidDraft = opportunity("Too long", url: "https://jobs.example.com/too-long")
        invalidDraft.country = "SAU"
        try check(!invalidStore.mergeBackup(opportunityBackup(recovered: [invalidDraft]), context: invalidStore.workspaceActionContext)
                  && invalidStore.message == unsupported, "A parked draft with an invalid country is refused as an unsupported backup")
        try check(try Data(contentsOf: invalidFolder.appendingPathComponent("phone-draft.json")) == invalidBefore,
                  "The invalid parked draft does not change the phone")
        scenarios += 1

        var isolated = try initial()
        let isolatedCurrent = opportunity("Workspace A draft", url: "https://jobs.example.com/workspace-a")
        let isolatedParked = opportunity("Workspace A parked", url: "https://jobs.example.com/workspace-a-parked")
        isolated.opportunityDraft = isolatedCurrent
        isolated.recoveredOpportunityDrafts = [PhoneRecoveredOpportunity(scope: scope(), draft: isolatedParked)]
        isolated.connect(address: "https://second.example", workspace: "workspace-b", account: "person-b",
                         server: try ApplicationServerProfile(server(0, name: "Person B")))
        try check(isolated.recordScope == otherScope && !isolated.opportunityDraft.hasContent
                  && isolated.recoveredOpportunityDrafts == [PhoneRecoveredOpportunity(scope: scope(), draft: isolatedParked)]
                  && isolated.recoveredOpportunityDrafts.filter { $0.scope == isolated.recordScope }.isEmpty,
                  "Opening a fresh workspace does not retarget or display the other workspace's parked opportunity")
        isolated.connect(address: "https://first.example", workspace: "workspace-a", account: "fixture-account",
                         server: try ApplicationServerProfile(server(3)))
        try check(isolated.opportunityDraft == isolatedCurrent
                  && isolated.recoveredOpportunityDrafts == [PhoneRecoveredOpportunity(scope: scope(), draft: isolatedParked)],
                  "Returning to the first workspace restores its current opportunity and parked draft")
        scenarios += 1
    }


    func savedComparisonMetadata() throws {
        var a = jobMap("comparison-riyadh", noteTitle: "Service Designer")
        a["id"] = .string("local-compare-a"); a["localOnly"] = .bool(true)
        a["sourceName"] = .string("Synthetic Harbor board")
        a["checkedAt"] = .string("2026-11-21T18:00:00Z")
        var b = jobMap("comparison-jeddah", noteTitle: "Service Designer")
        b["id"] = .string("local-compare-b"); b["localOnly"] = .bool(true); b["location"] = .string("Jeddah")
        let old = try JSONDecoder().decode(PhoneRecordJob.self, from: JSONEncoder().encode(PhoneRecordJob(b)))
        try check(old.sourceName == nil && old.checkedAt == nil && old.valid, "Old rows keep missing source/check facts absent")
        var newer = a; newer["title"] = .string("Current provider title")
        newer["checkedAt"] = .string("2026-11-21T19:00:00Z"); newer.removeValue(forKey: "sourceName")
        let enriched = PhoneSavedJobMetadata.preserving(newer, from: a)
        try check(enriched["title"] == newer["title"] && enriched["sourceName"] == a["sourceName"]
                  && enriched["checkedAt"] == newer["checkedAt"], "Same-posting metadata preservation keeps current title and latest observed check")
        var older = newer; older["checkedAt"] = .string("2026-11-20T18:00:00Z")
        try check(PhoneSavedJobMetadata.preserving(older, from: a)["checkedAt"] == a["checkedAt"],
                  "An older check cannot replace a newer observed check")
        try check(PhoneSavedJobMetadata.preserving(b, from: a) == b, "Matching titles/employers never copy facts across different posting URLs")
        var alias = a; alias["url"] = .string("https://jobs.example.com/comparison-riyadh/?utm_source=fixture#role")
        alias.removeValue(forKey: "checkedAt"); alias.removeValue(forKey: "sourceName")
        try check(PhoneSavedJobMetadata.preserving(alias, from: a)["checkedAt"] == a["checkedAt"],
                  "Canonical URL aliases preserve this posting's known facts")
        let merge = ApplicationJobMerge(remote: [newer], local: [a, b], selected: ["local-compare-a"],
                                        answers: ["local-compare-a": ["note": .string("private-answer")]])
        try check(merge.jobs[0]["sourceName"] == a["sourceName"] && merge.jobs[1] == b
                  && merge.selected == ["local-compare-a"] && merge.answers["local-compare-a"]?["note"]?.string == "private-answer",
                  "Metadata enrichment preserves existing Apply selection/answer mapping and the other city")
        scenarios += 1

        var transfer = backup([], jobs: [a, b])
        var record = PhoneOpportunityRecord(scope: scope(), job: PhoneRecordJob(a)); record.note = "Private note"; record.manualResumeName = "CV-A.pdf"
        transfer.records = [record]
        var draft = PhoneRecordDraft(); draft.note = "Unfinished"; draft.manualResumeName = "CV-B.pdf"
        transfer.recordDrafts = [PhoneRecordDraftCheckpoint(scope: scope(), identity: record.identity, job: record.job,
                                                           recordID: record.id, revision: record.revision, draft: draft)]
        let bytes = try JSONEncoder().encode(transfer)
        let restored = try JSONDecoder().decode(PhoneWorkspaceBackup.self, from: bytes)
        try check(restored.valid && restored.draft.jobs[0]["sourceName"] == a["sourceName"]
                  && restored.draft.jobs[0]["checkedAt"] == a["checkedAt"] && restored.draft.jobs[1]["sourceName"] == nil,
                  "Common backup keeps known listing facts and does not invent missing facts")
        try check(restored.records[0].job == record.job && restored.recordDrafts[0].job == record.job
                  && restored.records[0].manualResumeName == "CV-A.pdf" && restored.recordDrafts[0].draft.manualResumeName == "CV-B.pdf",
                  "Record and unfinished-record snapshots preserve listing facts alongside immutable CV notes")
        let service = TestService(), (imported, folder, tokens) = try fixture(PhoneApplicationState(), service: service)
        try check(imported.mergeBackup(restored, context: imported.workspaceActionContext, replaceProfile: false),
                  "The common backup imports through the existing explicit local merge")
        let reopened = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
        let importedA = reopened.jobs.first { $0["url"] == a["url"] }!
        try check(importedA["sourceName"] == a["sourceName"] && importedA["checkedAt"] == a["checkedAt"]
                  && reopened.currentRecord(for: importedA)?.manualResumeName == "CV-A.pdf" && service.calls.isEmpty,
                  "Actual persisted import/reopen retains facts without contacting a service")
        scenarios += 1

        for (key, value) in [("sourceName", ApplicationValue.string(String(repeating: "x", count: 151))),
                             ("sourceName", .string("Board\nhidden")), ("sourceName", .number(7)),
                             ("checkedAt", .string("not-a-date")), ("checkedAt", .bool(true)),
                             ("checkedAt", .string(String(repeating: "2", count: 65)))] {
            var malformed = a; malformed[key] = value
            try check(!PhoneSavedJobMetadata.valid(malformed), "Malformed optional listing metadata is rejected")
            var invalidState = PhoneApplicationState(); invalidState.jobs = [malformed]
            let invalidBytes = try JSONEncoder().encode(invalidState)
            var rejected = false
            do { _ = try JSONDecoder().decode(PhoneApplicationState.self, from: invalidBytes) } catch { rejected = true }
            try check(rejected && !backup([], jobs: [malformed]).valid, "Malformed facts cannot enter active storage or a portable backup")
        }
        var nullable = b; nullable["sourceName"] = .null; nullable["checkedAt"] = .null
        try check(PhoneSavedJobMetadata.valid(nullable), "Missing or explicit null optional facts remain compatible")
        scenarios += 1
    }

    func savedComparisonIsolation() async throws {
        var a = jobMap("compare-a", noteTitle: "Service Designer")
        a["id"] = .string("local-compare-a"); a["localOnly"] = .bool(true)
        a["sourceName"] = .string("Synthetic Harbor board"); a["checkedAt"] = .string("2026-11-21T18:00:00Z")
        var b = jobMap("compare-b", noteTitle: "Service Designer")
        b["id"] = .string("local-compare-b"); b["localOnly"] = .bool(true); b["location"] = .string("Jeddah")
        var state = try initial(); state.jobs = [a, b]
        var recordA = PhoneOpportunityRecord(scope: scope(), job: PhoneRecordJob(a))
        recordA.stage = .applied; recordA.appliedElsewhere = true; recordA.followUpOn = "2026-11-22"; recordA.note = "Riyadh private"
        var recordB = PhoneOpportunityRecord(scope: scope(), job: PhoneRecordJob(b))
        recordB.stage = .interview; recordB.appliedElsewhere = true; recordB.followUpOn = "2026-11-29"; recordB.manualResumeName = "CV-A.pdf"
        let otherScope = PhoneRecordScope(origin: "https://second.example", workspaceID: "workspace-b")
        var other = recordA; other.id = UUID().uuidString; other.scope = otherScope; other.stage = .offer; other.followUpOn = "2026-12-31"
        state.applicationRecords = [recordA, recordB, other]
        let service = TestService(), (store, folder, tokens) = try fixture(state, service: service)
        store.selected = ["local-compare-b"]; store.answers = ["local-compare-b": ["note": .string("Apply sentinel")]]
        let path = folder.appendingPathComponent("phone-draft.json"), priorBytes = try Data(contentsOf: path)
        let keys = [store.savedComparisonKey(for: a)!, store.savedComparisonKey(for: b)!]
        let pair = store.savedComparisonItems(keys)!
        try check(pair.map(\.job.location) == ["Riyadh", "Jeddah"] && pair.map(\.job.url) == [a["url"]!.string!, b["url"]!.string!],
                  "Same-title same-employer roles retain separate city and employer-link identities")
        try check(pair.map(\.stage) == [.applied, .interview] && pair.map(\.followUpOn) == ["2026-11-22", "2026-11-29"],
                  "Each role reads only its own active record and ignores another account's stage/date")
        try check(pair[0].job.sourceName == "Synthetic Harbor board" && pair[1].job.sourceName == nil && pair[1].job.checkedAt == nil,
                  "The comparison projects known and unknown source/check facts truthfully")
        try check(store.savedComparisonItems([]) == nil && store.savedComparisonItems([keys[0]]) == nil
                  && store.savedComparisonItems([keys[0], keys[0]]) == nil && store.savedComparisonItems(keys + [keys[0]]) == nil,
                  "A comparison requires exactly two different canonical openings")
        try check(try Data(contentsOf: path) == priorBytes && service.calls.isEmpty
                  && store.selected == ["local-compare-b"] && store.answers["local-compare-b"]?["note"]?.string == "Apply sentinel"
                  && store.profile == state.profile && store.plan == nil && store.attempts.isEmpty,
                  "Read-only comparison changes no file, Apply state, profile, receipt, or request")
        scenarios += 1

        var duplicateState = state, alias = a
        alias["id"] = .string("local-alias"); alias["url"] = .string("https://jobs.example.com/compare-a/?utm_source=fixture#same")
        duplicateState.jobs.append(alias)
        let (duplicate, _, _) = try fixture(duplicateState, service: TestService())
        try check(duplicate.savedComparisonItems([duplicate.savedComparisonKey(for: a)!, duplicate.savedComparisonKey(for: alias)!]) == nil,
                  "Two saved rows for the same canonical posting cannot masquerade as two openings")
        var conflictState = state, conflict = recordA
        conflict.id = UUID().uuidString; conflict.stage = .offer; conflict.followUpOn = "2026-12-20"
        conflictState.applicationRecords.append(conflict)
        let (conflicted, _, _) = try fixture(conflictState, service: TestService())
        let uncertain = conflicted.savedComparisonItem(for: conflicted.savedComparisonKey(for: a)!)!
        try check(uncertain.conflictingRecords && uncertain.stage == nil && uncertain.followUpOn == nil,
                  "Competing private versions remain explicitly unresolved rather than choosing a stage or earliest date")
        scenarios += 1

        // An older record snapshot must retain newly known facts when its bookmark is deliberately removed.
        var removalState = state
        removalState.applicationRecords[0].job.sourceName = nil; removalState.applicationRecords[0].job.checkedAt = nil
        var archived = removalState.applicationRecords[0]; archived.id = UUID().uuidString; archived.archived = true
        removalState.applicationRecords.append(archived)
        let (removing, removalFolder, removalTokens) = try fixture(removalState, service: TestService())
        let oldKey = removing.savedComparisonKey(for: a)!, oldEdit = removing.recordEditContext(for: a)!
        try check(removing.removeLocalJob(removing.removalContext("local-compare-a")!), "The existing explicit bookmark removal still succeeds")
        try check(removing.savedComparisonItem(for: oldKey) == nil, "A removed row is not silently replaced by a retained-record row")
        let retained = removing.savedOpportunities.first { $0["recordOnly"]?.bool == true }!
        let retainedItem = removing.savedComparisonItem(for: removing.savedComparisonKey(for: retained)!)!
        try check(retainedItem.recordOnly && retainedItem.job.sourceName == a["sourceName"]?.string
                  && retainedItem.job.checkedAt == a["checkedAt"]?.string && retainedItem.stage == .applied
                  && retainedItem.followUpOn == "2026-11-22", "Retained records keep observed listing facts and their own private stage/date")
        let removalSaved = try savedState(removalFolder)
        try check(removalSaved.applicationRecords.first { $0.id == archived.id } == archived
                  && removalSaved.applicationRecords.first { $0.id == other.id } == other,
                  "Metadata retention changes neither archived record history nor another account's records")
        try check(!removing.saveRecord(PhoneRecordDraft(recordA), context: oldEdit),
                  "A record context captured before metadata retention cannot overwrite the revised snapshot")
        let relaunched = NativeApplicationsStore(folder: removalFolder, credentials: removalTokens, clientFactory: { _, _ in TestService() })
        try check(relaunched.savedOpportunities.contains { $0["recordOnly"]?.bool == true && $0["checkedAt"] == a["checkedAt"] },
                  "Retained comparison facts survive a real store reopen")
        scenarios += 1

        var stateB = state; stateB.workspaceID = "workspace-b"; stateB.serviceAddress = "https://second.example"
        let (second, _, _) = try fixture(stateB, service: TestService("https://second.example"))
        try check(second.savedComparisonItems(keys) == nil && second.savedComparisonItem(for: keys[0]) == nil,
                  "Captured comparison keys cannot cross owners even if the row IDs and titles coincide")
        let resumed = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
        try check(resumed.savedComparisonItems(keys) == nil, "Ephemeral comparison keys cannot survive a different connection instance")
        await store.disconnect()
        try check(store.savedComparisonItems(keys) == nil, "Disconnecting invalidates already captured comparison keys")
        scenarios += 1
    }

    func run() async throws {
        try savedComparisonMetadata()
        try await savedComparisonIsolation()
        try manualCVNames()
        try recoveredDraftRebase()
        try profileLabels()
        try await receipts()
        try drafts()
        try await shortlistCap()
        try opportunityDrafts()
        try oversizedOpportunityExport()
        try oversizedCurrentRestore()
        try savedNoteControls()
    }

    /// The optional filename is a private note; every persistence path keeps that meaning.
    func manualCVNames() throws {
        var job = jobMap("manual-cv", noteTitle: "Synthetic designer")
        job["id"] = .string("local-manual-cv"); job["localOnly"] = .bool(true)
        var initialState = PhoneApplicationState(); initialState.jobs = [job]
        let service = TestService(), (store, folder, tokens) = try fixture(initialState, service: service)
        let path = folder.appendingPathComponent("phone-draft.json")
        var draft = PhoneRecordDraft(); draft.manualResumeName = "  CV-A.pdf  "
        let edit = store.recordEditContext(for: job)!
        try check(store.saveRecord(draft, context: edit), "A filename-only private record can be saved without an account or attachment")
        let original = store.currentRecord(for: job)!
        try check(original.manualResumeName == "CV-A.pdf" && original.meaningful && !original.appliedElsewhere
                  && original.stage == .saved && store.attempts.isEmpty && service.calls.isEmpty,
                  "Saving trims the filename note but creates no application mark, receipt or request")
        try check(PhoneRecordDraft(original).manualResumeName == "CV-A.pdf", "Opening a saved record retains its own filename note")
        scenarios += 1

        var edited = PhoneRecordDraft(original); edited.manualResumeName = "سيرة-ب.pdf"
        let current = store.recordEditContext(for: job)!
        try check(store.keepRecordDraft(edited, context: current), "An unfinished filename edit is checkpointed separately")
        try check(store.discardRecordDraft(context: current) && store.currentRecord(for: job)?.manualResumeName == "CV-A.pdf",
                  "Canceling the checkpoint leaves the saved filename unchanged")
        try check(store.keepRecordDraft(edited, context: current), "The same filename edit can be checkpointed again")
        let reopened = NativeApplicationsStore(folder: folder, credentials: tokens, clientFactory: { _, _ in service })
        let reopenedContext = reopened.recordEditContext(for: job)!
        try check(reopened.currentRecord(for: job)?.manualResumeName == "CV-A.pdf"
                  && reopened.restoredRecordDraft(for: reopenedContext)?.manualResumeName == "سيرة-ب.pdf",
                  "A disk reload keeps saved and unfinished filenames distinct")
        guard let url = reopened.exportWorkspace(context: reopened.workspaceActionContext) else {
            throw MobileApplicationError(message: "A filename-bearing workspace could not be exported")
        }
        let portable = try NativeApplicationsStore.readWorkspaceBackup(at: url)
        try check(portable.records.map(\.manualResumeName) == ["CV-A.pdf"]
                  && portable.recordDrafts.map(\.draft.manualResumeName) == ["سيرة-ب.pdf"],
                  "The common backup explicitly round-trips the record adapter and unfinished filename")
        let (imported, importedFolder, _) = try fixture(PhoneApplicationState(), service: service)
        try check(imported.mergeBackup(portable, context: imported.workspaceActionContext), "An explicit backup import accepts the optional filename")
        let importedState = try savedState(importedFolder)
        try check(importedState.applicationRecords.map(\.manualResumeName) == ["CV-A.pdf"]
                  && importedState.recordDrafts.map(\.draft.manualResumeName) == ["سيرة-ب.pdf"]
                  && imported.attempts.isEmpty && !imported.connected && service.calls.isEmpty,
                  "Import retains private filename notes without importing receipt or connection authority")
        scenarios += 1

        let preserved = try Data(contentsOf: path)
        for bad in ["/Users/example/CV.pdf", "CV\\copy.pdf", "CV:copy.pdf", "CV\ncopy.pdf", String(repeating: "x", count: 181)] {
            var invalid = edited; invalid.manualResumeName = bad
            try check(!reopened.saveRecord(invalid, context: reopenedContext)
                      && reopened.message == MobileApplicationPolicy.manualResumeNameError,
                      "An unsafe filename cannot overwrite the saved record")
            try check(!reopened.keepRecordDraft(invalid, context: reopenedContext)
                      && (try Data(contentsOf: path)) == preserved,
                      "Invalid filename checkpoints preserve the preceding saved record and recoverable draft bytes")
        }
        try check(reopened.saveRecord(edited, context: reopenedContext)
                  && reopened.currentRecord(for: job)?.manualResumeName == "سيرة-ب.pdf"
                  && !reopened.isMarkedApplied(job), "An explicit recovered filename save remains self-entered and unapplied")
        scenarios += 1

        // Old common-format records/drafts omit the optional key and must remain readable.
        var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(portable)) as! [String: Any]
        var contents = object["data"] as! [String: Any]
        var records = contents["applicationRecords"] as! [[String: Any]]
        records[0].removeValue(forKey: "manualResumeName"); contents["applicationRecords"] = records
        var drafts = contents["recordDrafts"] as! [[String: Any]], oldDraft = drafts[0]["draft"] as! [String: Any]
        oldDraft.removeValue(forKey: "manualResumeName"); drafts[0]["draft"] = oldDraft; contents["recordDrafts"] = drafts; object["data"] = contents
        let old = try JSONDecoder().decode(PhoneWorkspaceBackup.self, from: JSONSerialization.data(withJSONObject: object))
        try check(old.valid && old.records[0].manualResumeName == nil && old.recordDrafts[0].draft.manualResumeName == nil,
                  "An old backup never fabricates a filename from the current profile")
        var invalidPortable = portable; invalidPortable.records[0].manualResumeName = "/private/CV.pdf"
        try check(!invalidPortable.valid, "A path in an imported saved filename fails the existing whole-backup validation")
        scenarios += 1

        // A filename alone is useful history even after its bookmark is removed.
        try check(reopened.removeLocalJob(reopened.removalContext("local-manual-cv")!), "Removing a bookmark keeps its filename-only private record")
        try check(reopened.jobs.isEmpty && reopened.savedOpportunities.count == 1
                  && reopened.currentRecord(for: reopened.savedOpportunities[0])?.manualResumeName == "سيرة-ب.pdf",
                  "The retained record still exposes its own filename after bookmark removal")
        var versionState = try savedState(folder), archived = original
        archived.id = UUID().uuidString; archived.archived = true; versionState.applicationRecords.append(archived)
        let (versions, _, _) = try fixture(versionState, service: service)
        let retained = versions.savedOpportunities[0]
        try check(versions.useRecordVersion(archived.id, context: versions.recordChoiceContext(for: retained)),
                  "Selecting an archived private version restores that version's filename")
        try check(versions.currentRecord(for: retained)?.manualResumeName == "CV-A.pdf"
                  && !versions.isMarkedApplied(retained) && versions.attempts.isEmpty && service.calls.isEmpty,
                  "Version selection keeps the filename distinct from applied marks and submission evidence")
        scenarios += 1
    }

    /// An unfinished link past the shared limit must not become a backup iPhone would reject entirely.
    func oversizedOpportunityExport() throws {
        var crowded = try initial()
        crowded.opportunityDraft = PhoneOpportunityDraft(url: String(repeating: "a", count: 4_097), title: "Kept",
            company: "Fixture Co", location: "Riyadh", country: "SA")
        let (store, folder, _) = try fixture(crowded, service: TestService())
        let before = try Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))
        let refused = store.exportWorkspace(context: store.workspaceActionContext)
        let written = try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.hasPrefix("Career-Finder-Phone-Workspace-") }
        let after = try Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))
        try check(store.opportunityDraft.url.count == 4_097, "An existing over-long unfinished link still loads")
        try check(refused == nil && store.message == opportunityLimit, "Export refuses an unfinished link that would make iPhone reject the whole backup")
        try check(written.isEmpty && after == before, "The refused export writes nothing and leaves the long draft on the phone")
        scenarios += 1

        let repaired = PhoneOpportunityDraft(url: String(repeating: "b", count: 4_096), title: "Kept",
            company: "Fixture Co", location: "Riyadh", country: "SA")
        try check(store.keepOpportunityDraft(repaired) && store.opportunityDraft == repaired,
                  "A link at the shared 4,096-character limit replaces the over-long draft")
        guard let exported = store.exportWorkspace(context: store.workspaceActionContext) else {
            throw MobileApplicationError(message: "FAILED: The repaired draft did not export")
        }
        let backup = try JSONDecoder().decode(PhoneWorkspaceBackup.self, from: Data(contentsOf: exported))
        try check(backup.valid && backup.draft.opportunityDraft.url.count == 4_096,
                  "The repaired draft exports as a backup iPhone can import")
        scenarios += 1
    }

    /// Continuing a parked draft must not park an over-limit current link into the recovered list.
    func oversizedCurrentRestore() throws {
        let parked = opportunity("Parked", url: "https://jobs.example.com/parked-legal")
        var loaded = try initial()
        loaded.opportunityDraft = PhoneOpportunityDraft(url: String(repeating: "a", count: 4_097), title: "Current",
            company: "Fixture Co", location: "Riyadh", country: "SA")
        loaded.recoveredOpportunityDrafts = [PhoneRecoveredOpportunity(scope: scope(), draft: parked)]
        let (store, folder, _) = try fixture(loaded, service: TestService())
        let before = try Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))
        try check(store.opportunityDraft.url.count == 4_097 && store.recoveredOpportunityDrafts == [parked],
                  "An over-long current link still loads beside a parked draft")
        try check(!store.restoreRecoveredOpportunityDraft(parked) && store.message == opportunityLimit,
                  "Restore refuses to park the over-long current link and names the shared limit")
        try check(try Data(contentsOf: folder.appendingPathComponent("phone-draft.json")) == before
                  && store.opportunityDraft.url.count == 4_097 && store.recoveredOpportunityDrafts == [parked],
                  "The refused restore leaves the long link and the parked draft on the phone")
        scenarios += 1

        let repaired = PhoneOpportunityDraft(url: String(repeating: "b", count: 4_096), title: "Current",
            company: "Fixture Co", location: "Riyadh", country: "SA")
        try check(store.keepOpportunityDraft(repaired) && store.opportunityDraft == repaired,
                  "Shortening the current link to 4,096 characters keeps it")
        try check(store.restoreRecoveredOpportunityDraft(parked) && store.message == keptOpportunity,
                  "Restore continues the parked draft after the current link is within the limit")
        let saved = try savedState(folder)
        try check(store.opportunityDraft == parked
                  && store.recoveredOpportunityDrafts == [repaired]
                  && saved.opportunityDraft == parked
                  && saved.recoveredOpportunityDrafts == [PhoneRecoveredOpportunity(scope: scope(), draft: repaired)],
                  "The repaired current link is parked and the continued draft is saved")
        scenarios += 1
    }

    /// iPhone already rejects a saved note that contains a disallowed control. An unfinished checkpoint may still hold one so it can be shortened.
    func savedNoteControls() throws {
        let bell = "قبل\u{0007}بعد"
        var poisoned = PhoneOpportunityRecord(scope: scope(), job: PhoneRecordJob(jobMap("noted")))
        poisoned.note = bell
        var cleaned = poisoned
        cleaned.note = "قبلبعد"
        var deleted = cleaned
        deleted.note = "x\u{007F}y"
        try check(!poisoned.valid && cleaned.valid && !deleted.valid,
                  "A saved note rejects U+0007 and U+007F, and the same note without the control is valid")
        var poisonedBackup = backup([], jobs: [jobMap("noted")])
        poisonedBackup.records = [poisoned]
        try check(!poisonedBackup.valid, "One saved note with a disallowed control makes the whole backup invalid")
        let (store, folder, _) = try fixture(try initial(), service: TestService())
        let before = try Data(contentsOf: folder.appendingPathComponent("phone-draft.json"))
        try check(!store.mergeBackup(poisonedBackup, context: store.workspaceActionContext) && store.message == unsupported,
                  "Import refuses a saved note with a disallowed control")
        try check(try Data(contentsOf: folder.appendingPathComponent("phone-draft.json")) == before,
                  "The refused control-character backup leaves the phone file unchanged")
        let poisonedFile = folder.appendingPathComponent("control-note.json")
        try JSONEncoder().encode(poisonedBackup).write(to: poisonedFile)
        do {
            _ = try NativeApplicationsStore.readWorkspaceBackup(at: poisonedFile)
            try check(false, "A backup file with a disallowed control in a saved note is not accepted")
        } catch {
            try check(error.localizedDescription == invalidBackup,
                      "Reading that backup reports that nothing was replaced")
        }
        scenarios += 1

        var cleanBackup = backup([], jobs: [jobMap("noted")])
        cleanBackup.records = [cleaned]
        let cleanFile = folder.appendingPathComponent("clean-note.json")
        try JSONEncoder().encode(cleanBackup).write(to: cleanFile)
        let decoded = try NativeApplicationsStore.readWorkspaceBackup(at: cleanFile)
        try check(decoded.valid && decoded.records.map(\.note) == ["قبلبعد"]
                  && store.mergeBackup(decoded, context: store.workspaceActionContext),
                  "Removing the control makes the same saved note importable")
        try check(try savedState(folder).applicationRecords.map(\.note) == ["قبلبعد"],
                  "The imported note is the control-free text")
        let spacedNote = "سطر\n\tتبويب\r"
        var spaced = cleaned
        spaced.id = UUID().uuidString
        spaced.job = PhoneRecordJob(jobMap("spaced"))
        spaced.note = spacedNote
        var spacedBackup = backup([], jobs: [jobMap("spaced")])
        spacedBackup.records = [spaced]
        let spacedFile = folder.appendingPathComponent("spaced-note.json")
        try JSONEncoder().encode(spacedBackup).write(to: spacedFile)
        let spacedDecoded = try NativeApplicationsStore.readWorkspaceBackup(at: spacedFile)
        try check(spaced.valid && spacedDecoded.records.map(\.note) == [spacedNote]
                  && store.mergeBackup(spacedDecoded, context: store.workspaceActionContext),
                  "Tab, newline, and return survive a saved-note backup")
        try check(try savedState(folder).applicationRecords.map(\.note).contains(spacedNote),
                  "The imported saved note keeps tab, newline, and return exactly")
        scenarios += 1

        let draftNote = "مسودة\u{0007}مؤقتة"
        let draft = checkpoint("drafted", note: draftNote)
        let draftBackup = backup([draft], jobs: [jobMap("drafted")])
        try check(draft.valid && draftBackup.valid, "An unfinished checkpoint may hold a disallowed control")
        let (draftStore, _, _) = try fixture(try initial(), service: TestService())
        try check(draftStore.mergeBackup(draftBackup, context: draftStore.workspaceActionContext),
                  "An unfinished note with a control still imports")
        try check(draftStore.unfinishedRecordDrafts.map(\.draft.note) == [draftNote],
                  "The imported unfinished note keeps the control")
        guard let exported = draftStore.exportWorkspace(context: draftStore.workspaceActionContext) else {
            throw MobileApplicationError(message: "FAILED: The unfinished control-character note did not export")
        }
        let exportedBackup = try NativeApplicationsStore.readWorkspaceBackup(at: exported)
        try check(exportedBackup.recordDrafts.map(\.draft.note) == [draftNote],
                  "Export still writes an unfinished note that contains a control")
        scenarios += 1

        let editable = jobMap("editable")
        let identity = PhoneRecordJob(editable).identity
        let (saveStore, saveFolder, _) = try fixture(try initial(), service: TestService())
        try check(saveStore.mergeBackup(backup([], jobs: [editable]), context: saveStore.workspaceActionContext),
                  "A saved link is available before editing its note")
        let job = saveStore.savedOpportunities.first { MobileApplicationPolicy.jobIdentity($0["url"]?.string ?? "") == identity }
        let edit = job.flatMap { saveStore.recordEditContext(for: $0) }
        var plain = PhoneRecordDraft(); plain.stage = .saved; plain.note = "ملاحظة نظيفة"
        try check(edit != nil && saveStore.saveRecord(plain, context: edit!), "A plain saved note is stored")
        let blocked = job.flatMap { saveStore.recordEditContext(for: $0) }
        var added = PhoneRecordDraft(); added.stage = .saved; added.note = "ملاحظة نظيفة\u{0007}"
        try check(blocked != nil && !saveStore.saveRecord(added, context: blocked!) && saveStore.message == readableNote,
                  "Saving a newly added control is refused with the plain-text sentence")
        let held = job.flatMap { saveStore.recordEditContext(for: $0) }
        var remaining = PhoneRecordDraft(); remaining.stage = .saved; remaining.note = "ملاحظة\u{0007}"
        try check(held != nil && !saveStore.saveRecord(remaining, context: held!) && saveStore.message == readableNote,
                  "A shorter note that still contains the control is not saved")
        let kept = try savedState(saveFolder)
        try check(kept.applicationRecords.map(\.note) == ["ملاحظة نظيفة"]
                  && kept.applicationRecords.allSatisfy { !$0.appliedElsewhere && !$0.archived },
                  "Both refused saves leave the plain note, with no applied mark")
        let opened = job.flatMap { saveStore.recordEditContext(for: $0) }
        var shortened = PhoneRecordDraft(); shortened.stage = .saved; shortened.note = "ملاحظة"
        try check(opened != nil && saveStore.saveRecord(shortened, context: opened!),
                  "Removing the control lets the shorter note save")
        try check(try savedState(saveFolder).applicationRecords.map(\.note) == ["ملاحظة"],
                  "The phone keeps the shortened plain note")
        scenarios += 1
    }
}

@main
struct NativeRecoveryCheck {
    @MainActor static func main() async {
        let suite = RecoverySuite(); defer { suite.cleanup() }
        do {
            try await suite.run()
            print("PASS \(suite.checks) native recovery assertions across \(suite.scenarios) scenarios")
        } catch {
            fputs(error.localizedDescription + "\n", stderr)
            exit(1)
        }
    }
}
