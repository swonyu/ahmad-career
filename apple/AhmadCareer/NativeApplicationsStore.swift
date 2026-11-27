#if canImport(Combine)
import Foundation
import Combine
import Security

@MainActor
protocol ApplicationTokenStore {
    func load(account: String) throws -> String?
    func save(_ token: String, account: String) throws
    func remove(account: String) throws
}

@MainActor
private final class ApplicationKeychain: ApplicationTokenStore {
    private let service = "CareerFinder.VerifiedApplications"
    private func query(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }
    func load(account: String) throws -> String? {
        var query = query(account)
        query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data else {
            throw MobileApplicationError(message: "Unlock this phone to restore its secure application connection.")
        }
        return String(data: data, encoding: .utf8)
    }
    func save(_ token: String, account: String) throws {
        let query = query(account)
        let update: [String: Any] = [kSecValueData as String: Data(token.utf8),
                                    kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        var status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound { status = SecItemAdd(query.merging(update) { _, new in new } as CFDictionary, nil) }
        guard status == errSecSuccess else { throw MobileApplicationError(message: "The secure connection could not be saved on this phone.") }
    }
    func remove(account: String) throws {
        guard !account.isEmpty else { return }
        let status = SecItemDelete(query(account) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw MobileApplicationError(message: "The saved connection token could not be removed from this phone.")
        }
    }
}

@MainActor
final class NativeApplicationsStore: ObservableObject {
    typealias ClientFactory = (URL, String?) throws -> any MobileApplicationServing
    @Published private var state = PhoneApplicationState()
    @Published private(set) var jobs: [[String: ApplicationValue]] = []
    @Published private(set) var attempts: [[String: ApplicationValue]] = []
    @Published private var hasFreshApplicationHistory = false
    @Published private(set) var plan: [String: ApplicationValue]?
    @Published private(set) var activePlanIDs: [String] = []
    @Published private(set) var recoverablePlans: [[String: ApplicationValue]] = []
    @Published private(set) var connected = false
    @Published private(set) var busy = false
    @Published var message: String?
    @Published private(set) var mode = "local"
    @Published private(set) var liveSubmissionEnabled: Bool?
    @Published private(set) var linkedInProfileSupported: Bool?
    @Published private(set) var requiresClientContinuation = false
    @Published private(set) var advancingApprovedApplication = false
    @Published var selected = Set<String>()
    @Published var answers: [String: [String: ApplicationValue]] = [:]
    @Published var profileEditing = false
    private var client: (any MobileApplicationServing)?
    private var storageReadable = true
    private var sessionGeneration = UUID()
    private var contentGeneration = UUID()
    private var workspaceMutation = UUID()
    private var refreshTicket: UUID?
    private var operationTicket: UUID?
    private var continuationTicket: UUID?
    private var nextContinuationTime: TimeInterval = 0
    private var remoteJobs: [[String: ApplicationValue]] = []
    private let folder: URL
    private let credentials: any ApplicationTokenStore
    private let clientFactory: ClientFactory
    private let monotonicTime: () -> TimeInterval

    /// Cached rows are only a presentation source. Operational arrays above stay empty after restart.
    private var boundHistory: PhoneApplicationHistoryCache? {
        guard let history = state.savedApplicationHistory, history.matches(state) else { return nil }
        return history
    }
    var displayAttempts: [[String: ApplicationValue]] {
        hasFreshApplicationHistory ? attempts : boundHistory?.entries.map(\.value) ?? []
    }
    var showingSavedApplicationHistory: Bool { !hasFreshApplicationHistory && boundHistory != nil }
    var canExportApplicationReceipts: Bool { hasFreshApplicationHistory && !attempts.isEmpty }
    var applicationHistorySavedAt: String? { showingSavedApplicationHistory ? boundHistory?.savedAt : nil }
    /// These counts describe the same display projection as Activity, never dispatch authority.
    var displayConfirmedApplicationCount: Int {
        displayAttempts.filter { MobileApplicationPolicy.isVerified($0) && $0["evidenceMode"]?.string == "live" }.count
    }
    var displayUncertainApplicationCount: Int {
        displayAttempts.filter { MobileApplicationPolicy.displayState($0) == "uncertain" }.count
    }
    var profile: PhoneApplicationProfile { state.profile }
    var opportunityDraft: PhoneOpportunityDraft { state.opportunityDraft }
    var profileNeedsSync: Bool { state.profileNeedsSync }
    var revision: Int? { state.profileRevision }
    var latestServerRevision: Int? { state.latestServerRevision }
    var latestServerProfile: PhoneApplicationProfile? { state.latestServerProfile }
    var profileHasConflict: Bool { state.hasProfileConflict }
    var serviceAddress: String { state.serviceAddress }
    var connectionSetupAddress: String { MobileApplicationPolicy.connectionSetupAddress(state.serviceAddress) }
    var submissionAvailable: Bool { connected && (mode == "test" || liveSubmissionEnabled == true) }
    var workspaceScope: PhoneRecordScope { state.recordScope }
    var heldPlanIDs: [String] { state.submissionHolds.filter { $0.scope == state.recordScope }.map(\.planID) }
    var hasSubmissionHold: Bool { activePlanIDs.contains(where: state.holdsSubmission) }
    var workspaceActionContext: PhoneWorkspaceActionContext {
        PhoneWorkspaceActionContext(scope: state.recordScope, connection: sessionGeneration, content: workspaceMutation)
    }
    var hasUnpairedDraft: Bool {
        !state.recordScope.isLocal && state.workspaceDrafts.contains { $0.scope.isLocal && ($0.profile.hasContent || !$0.jobs.isEmpty || $0.opportunityDraft.hasContent) }
    }
    var savedWorkspaceScopes: [PhoneRecordScope] { state.workspaceDrafts.map(\.scope) }
    var unfinishedRecordDrafts: [PhoneRecordDraftCheckpoint] {
        state.recordDrafts.filter { $0.scope == state.recordScope }
    }
    var recoveredRecordDrafts: [PhoneRecordDraftCheckpoint] {
        state.recordDraftAlternatives.filter { $0.scope == state.recordScope }
    }
    var recoveredOpportunityDrafts: [PhoneOpportunityDraft] {
        state.recoveredOpportunityDrafts.filter { $0.scope == state.recordScope }.map(\.draft)
    }
    var profileReadiness: ApplicationProfileReadiness { ApplicationProfileReadiness(profile: profile) }
    private func recordScope(for job: [String: ApplicationValue]) -> PhoneRecordScope {
        if let id = job["id"]?.string, id.hasPrefix("record-"),
           let record = state.applicationRecords.first(where: { "record-" + $0.id == id }) { return record.scope }
        let identity = MobileApplicationPolicy.jobIdentity(job["url"]?.string ?? "")
        if job["localOnly"]?.bool == true && !state.recordScope.isLocal,
           !state.applicationRecords.contains(where: { $0.scope == state.recordScope && $0.identity == identity }),
           state.applicationRecords.contains(where: { $0.scope.isLocal && $0.identity == identity }) { return PhoneRecordScope() }
        return state.recordScope
    }
    func recordVersions(for job: [String: ApplicationValue]) -> [PhoneOpportunityRecord] {
        let identity = MobileApplicationPolicy.jobIdentity(job["url"]?.string ?? ""), scope = recordScope(for: job)
        return state.applicationRecords.filter { $0.scope == scope && $0.identity == identity }
            .sorted { $0.updatedAt == $1.updatedAt ? $0.id < $1.id : $0.updatedAt > $1.updatedAt }
    }
    func currentRecord(for job: [String: ApplicationValue]) -> PhoneOpportunityRecord? {
        let active = recordVersions(for: job).filter { !$0.archived }
        return active.count == 1 ? active[0] : nil
    }
    func isMarkedApplied(_ job: [String: ApplicationValue]) -> Bool {
        recordVersions(for: job).contains { !$0.archived && $0.appliedElsewhere }
    }
    func followUpDay(for job: [String: ApplicationValue]) -> String? {
        recordVersions(for: job).filter { !$0.archived && $0.stage != .closed && !$0.followUpOn.isEmpty }
            .map(\.followUpOn).sorted().first
    }
    var savedOpportunities: [[String: ApplicationValue]] {
        var values = jobs
        let visible = state.applicationRecords.filter { record in
            (record.scope == state.recordScope || record.scope.isLocal) && !record.archived &&
                (record.meaningful || state.applicationRecords.contains { $0.archived && $0.meaningful && $0.scope == record.scope && $0.identity == record.identity })
        }
        for record in visible {
            if !values.contains(where: { MobileApplicationPolicy.jobIdentity($0["url"]?.string ?? "") == record.identity
                && recordScope(for: $0) == record.scope }) {
                values.append(record.job.applicationJob(id: "record-" + record.id))
            }
        }
        return values
    }
    func savedOpportunity(_ id: String) -> [String: ApplicationValue]? { savedOpportunities.first { $0["id"]?.string == id } }
    var savedComparisonOwner: PhoneSavedComparisonOwner {
        PhoneSavedComparisonOwner(scope: state.recordScope, connection: sessionGeneration)
    }
    func savedComparisonKey(for job: [String: ApplicationValue]) -> PhoneSavedComparisonKey? {
        guard let id = job["id"]?.string, !id.isEmpty, let url = job["url"]?.string,
              MobileApplicationPolicy.jobURL(url) != nil else { return nil }
        let matches = savedOpportunities.filter { $0["id"]?.string == id }
        guard matches.count == 1, MobileApplicationPolicy.jobIdentity(matches[0]["url"]?.string ?? "") == MobileApplicationPolicy.jobIdentity(url),
              PhoneSavedJobMetadata.valid(matches[0]) else { return nil }
        return PhoneSavedComparisonKey(owner: savedComparisonOwner, recordScope: recordScope(for: matches[0]),
            rowID: id, identity: MobileApplicationPolicy.jobIdentity(url))
    }
    func savedComparisonItem(for key: PhoneSavedComparisonKey) -> PhoneSavedComparisonItem? {
        guard key.owner == savedComparisonOwner else { return nil }
        let matches = savedOpportunities.filter { $0["id"]?.string == key.rowID }
        guard matches.count == 1, let row = matches.first,
              MobileApplicationPolicy.jobIdentity(row["url"]?.string ?? "") == key.identity,
              recordScope(for: row) == key.recordScope, PhoneSavedJobMetadata.valid(row) else { return nil }
        let active = recordVersions(for: row).filter { !$0.archived }
        let record = active.count == 1 ? active[0] : nil
        let facts = record.map { PhoneSavedJobMetadata.preserving(row, from: $0.job.applicationJob(id: key.rowID)) } ?? row
        let job = PhoneRecordJob(facts)
        guard job.valid else { return nil }
        return PhoneSavedComparisonItem(key: key, job: job, recordOnly: row["recordOnly"]?.bool == true,
            stage: active.count > 1 ? nil : record?.stage ?? .saved,
            followUpOn: record?.followUpOn.isEmpty == false ? record?.followUpOn : nil,
            conflictingRecords: active.count > 1)
    }
    /// Reads only: opening a comparison cannot select Apply jobs, write drafts, or contact a service.
    func savedComparisonItems(_ keys: [PhoneSavedComparisonKey]) -> [PhoneSavedComparisonItem]? {
        guard keys.count == 2, keys[0].identity != keys[1].identity else { return nil }
        let items = keys.compactMap(savedComparisonItem)
        return items.count == 2 ? items : nil
    }
    private var localAppliedIdentities: Set<String> {
        Set(jobs.filter(isMarkedApplied).compactMap { $0["url"]?.string }.map(MobileApplicationPolicy.jobIdentity))
    }
    private func planContainsMarkedApplication(_ value: [String: ApplicationValue]) -> Bool {
        value["items"]?.array.contains { raw in
            let item = raw.object
            guard ["ready", "rate_limited"].contains(item["state"]?.string ?? "") else { return false }
            let job = jobs.first { $0["id"] == item["jobId"] } ?? item["job"]?.object ?? [:]
            return isMarkedApplied(job)
        } == true
    }
    private func continuationConflictsWithPrivateRecords(_ id: String) -> Bool {
        let applied = Set(state.applicationRecords.filter { $0.scope == state.recordScope && !$0.archived && $0.appliedElsewhere }
            .map(\.identity)).union(localAppliedIdentities)
        guard !applied.isEmpty else { return false }
        guard let review = ([plan].compactMap { $0 } + recoverablePlans).first(where: { $0["id"]?.string == id }),
              let items = review["items"]?.array, !items.isEmpty else { return true }
        for raw in items {
            let item = raw.object
            guard ["ready", "rate_limited"].contains(item["state"]?.string ?? "") else { continue }
            let known = jobs.first(where: { $0["id"] == item["jobId"] })
            guard let url = item["job"]?.object["url"]?.string ?? known?["url"]?.string,
                  MobileApplicationPolicy.jobURL(url) != nil else { return true }
            if applied.contains(MobileApplicationPolicy.jobIdentity(url)) { return true }
        }
        return false
    }
    func recordEditContext(for job: [String: ApplicationValue]) -> PhoneRecordEditContext? {
        let active = recordVersions(for: job).filter { !$0.archived }
        guard active.count <= 1 else { return nil }
        let snapshot = PhoneRecordJob(job)
        guard snapshot.valid else { return nil }
        return PhoneRecordEditContext(scope: recordScope(for: job), identity: snapshot.identity, job: snapshot,
            connection: sessionGeneration, recordID: active.first?.id, revision: active.first?.revision)
    }
    func recordChoiceContext(for job: [String: ApplicationValue]) -> PhoneRecordChoiceContext {
        PhoneRecordChoiceContext(scope: recordScope(for: job), identity: MobileApplicationPolicy.jobIdentity(job["url"]?.string ?? ""),
            connection: sessionGeneration, versions: Dictionary(uniqueKeysWithValues: recordVersions(for: job).map { ($0.id, $0.revision) }))
    }
    private func activeApplicationBlocksRecordChange(_ identity: String) -> Bool {
        let reviews = [plan].compactMap { $0 } + recoverablePlans
        for id in activePlanIDs {
            guard let review = reviews.first(where: { $0["id"]?.string == id }),
                  let items = review["items"]?.array, !items.isEmpty else { return true }
            for raw in items {
                let item = raw.object
                let job = item["job"]?.object ?? [:]
                let known = jobs.first(where: { $0["id"] == item["jobId"] })
                guard let url = job["url"]?.string ?? known?["url"]?.string,
                      MobileApplicationPolicy.jobURL(url) != nil else { return true }
                if MobileApplicationPolicy.jobIdentity(url) == identity { return true }
            }
        }
        return false
    }
    private func checkUnpairedRecordAdoption(_ identity: String) throws {
        guard !state.recordScope.isLocal else { return }
        let alreadyApplied = state.applicationRecords.contains { $0.scope == state.recordScope && $0.identity == identity && !$0.archived && $0.appliedElsewhere }
        let incomingApplied = state.applicationRecords.contains { $0.scope.isLocal && $0.identity == identity && !$0.archived && $0.appliedElsewhere }
        if incomingApplied && !alreadyApplied && activeApplicationBlocksRecordChange(identity) {
            throw MobileApplicationError(message: "Stop the approved application in Apply before associating this applied record. Its notes, dates and earlier versions stay on this phone.")
        }
    }
    func recordAdoptionContext(for job: [String: ApplicationValue]) -> PhoneRecordAdoptionContext? {
        guard connected, !busy, !state.recordScope.isLocal, recordScope(for: job).isLocal else { return nil }
        let identity = MobileApplicationPolicy.jobIdentity(job["url"]?.string ?? "")
        let source = state.applicationRecords.filter { $0.scope.isLocal && $0.identity == identity }
        guard !source.isEmpty else { return nil }
        let destination = state.applicationRecords.filter { $0.scope == state.recordScope && $0.identity == identity }
        return PhoneRecordAdoptionContext(identity: identity, destination: state.recordScope, connection: sessionGeneration,
            sourceVersions: Dictionary(uniqueKeysWithValues: source.map { ($0.id, $0.revision) }),
            destinationVersions: Dictionary(uniqueKeysWithValues: destination.map { ($0.id, $0.revision) }))
    }
    @discardableResult
    func adoptUnpairedRecord(_ context: PhoneRecordAdoptionContext) -> Bool {
        guard connected, !busy, context.connection == sessionGeneration,
              context.destination == state.recordScope, !context.destination.isLocal else {
            message = "The connection changed. Your separate phone record is kept; reopen it before choosing a workspace."; return false
        }
        let source = state.applicationRecords.filter { $0.scope.isLocal && $0.identity == context.identity }
        let destination = state.applicationRecords.filter { $0.scope == context.destination && $0.identity == context.identity }
        guard !source.isEmpty, Dictionary(uniqueKeysWithValues: source.map { ($0.id, $0.revision) }) == context.sourceVersions,
              Dictionary(uniqueKeysWithValues: destination.map { ($0.id, $0.revision) }) == context.destinationVersions else {
            message = "These private records changed. They are kept; compare their current versions before choosing a workspace."; return false
        }
        do {
            try checkUnpairedRecordAdoption(context.identity)
            var next = state
            for index in next.applicationRecords.indices where context.sourceVersions[next.applicationRecords[index].id] != nil {
                next.applicationRecords[index].scope = context.destination
                next.applicationRecords[index].revision += 1
            }
            try persist(next)
            plan = nil; contentGeneration = UUID(); refreshTicket = nil
            message = "This private record is now kept with the connected workspace on this phone. Its bookmark was not changed, and no notes were uploaded."
            return true
        } catch { message = error.localizedDescription; return false }
    }
    @discardableResult
    func saveRecord(_ draft: PhoneRecordDraft, context: PhoneRecordEditContext, confirmNotApplied: Bool = false, now: Date = Date()) -> Bool {
        guard !busy, context.connection == sessionGeneration else {
            message = "The connection changed or is busy. Your record draft is kept; reopen this opportunity before saving."; return false
        }
        guard savedOpportunities.contains(where: { MobileApplicationPolicy.jobIdentity($0["url"]?.string ?? "") == context.identity
            && recordScope(for: $0) == context.scope }) else {
            message = "This opportunity changed or was removed. Your record draft is kept; reopen its current details before saving."; return false
        }
        let active = state.applicationRecords.filter { $0.scope == context.scope && $0.identity == context.identity && !$0.archived }
        let base = active.first
        guard active.count <= 1, base?.id == context.recordID, base?.revision == context.revision else {
            message = "This record changed. Your draft is kept; compare the saved version before replacing it."; return false
        }
        guard PhoneRecordDay.valid(draft.appliedOn), PhoneRecordDay.valid(draft.followUpOn),
              draft.appliedOn.isEmpty || draft.appliedOn == base?.appliedOn || draft.appliedOn <= PhoneRecordDay.string(now) else {
            message = "Choose a real date. The application date can be blank, or today or earlier."; return false
        }
        let applied = draft.stage.marksApplied || (base?.appliedElsewhere == true &&
            (draft.stage == .closed || draft.stage == .saved && base?.stage == .saved && !confirmNotApplied))
        if base?.appliedElsewhere == true && !applied && !confirmNotApplied {
            message = "Confirm Mark as not applied before clearing your applied record."; return false
        }
        if applied != (base?.appliedElsewhere ?? false), activeApplicationBlocksRecordChange(context.identity) {
            message = "Stop your queued applications in Apply before changing the applied mark. Your notes draft is kept."; return false
        }
        var record = base ?? PhoneOpportunityRecord(scope: context.scope, job: context.job)
        let facts = PhoneSavedJobMetadata.preserving(context.job.applicationJob(id: "record"), from: record.job.applicationJob(id: "record"))
        record.job.sourceName = facts["sourceName"]?.string; record.job.checkedAt = facts["checkedAt"]?.string
        record.stage = draft.stage; record.appliedElsewhere = applied; record.appliedOn = draft.appliedOn
        record.followUpOn = draft.followUpOn; record.note = draft.note
        guard MobileApplicationPolicy.manualResumeNameIsValid(draft.manualResumeName) else {
            message = MobileApplicationPolicy.manualResumeNameError; return false
        }
        let manualName = draft.manualResumeName?.trimmingCharacters(in: .whitespacesAndNewlines)
        record.manualResumeName = manualName?.isEmpty == false ? manualName : nil
        record.revision = (base?.revision ?? 0) + 1; record.updatedAt = ISO8601DateFormatter().string(from: now)
        guard record.valid else { message = "Keep the note to 2,000 characters and use readable plain text. Your draft is kept."; return false }
        do {
            var next = state
            next.applicationRecords.removeAll { $0.id == record.id }; next.applicationRecords.append(record)
            next.recordDrafts.removeAll { $0.scope == context.scope && $0.identity == context.identity }
            guard next.applicationRecords.count <= 1_000 else { throw MobileApplicationError(message: "This phone has reached its private record limit. Your existing records and this draft are kept.") }
            try persist(next)
            if applied != (base?.appliedElsewhere ?? false) { plan = nil; contentGeneration = UUID(); refreshTicket = nil }
            message = "Your application record is saved on this phone. No employer was contacted."
            return true
        } catch { message = error.localizedDescription; return false }
    }
    @discardableResult
    func useRecordVersion(_ id: String, context: PhoneRecordChoiceContext) -> Bool {
        guard !busy, context.connection == sessionGeneration else { message = "The connection changed. Reopen this record before choosing a version."; return false }
        let versions = state.applicationRecords.filter { $0.scope == context.scope && $0.identity == context.identity }
        guard Dictionary(uniqueKeysWithValues: versions.map { ($0.id, $0.revision) }) == context.versions,
              let chosen = versions.first(where: { $0.id == id }) else {
            message = "These records changed. Review their latest versions before choosing."; return false
        }
        // Choosing historical notes and dates never reverses a deliberate not-applied correction.
        // Only a new explicit stage edit or job import can introduce a new applied mark.
        let applied = versions.contains { !$0.archived && $0.appliedElsewhere }
        do {
            var next = state
            let updatedAt = ISO8601DateFormatter().string(from: Date())
            for index in next.applicationRecords.indices where context.versions[next.applicationRecords[index].id] != nil
                && !next.applicationRecords[index].archived {
                next.applicationRecords[index].archived = chosen.archived || next.applicationRecords[index].id != id
                next.applicationRecords[index].revision += 1
                next.applicationRecords[index].updatedAt = updatedAt
                if next.applicationRecords[index].id == id { next.applicationRecords[index].appliedElsewhere = applied }
            }
            if chosen.archived {
                var restored = chosen
                restored.id = UUID().uuidString; restored.archived = false; restored.revision = 1; restored.updatedAt = updatedAt
                restored.appliedElsewhere = applied
                if !applied && chosen.appliedElsewhere { restored.stage = .saved }
                next.applicationRecords.append(restored)
            }
            guard next.applicationRecords.count <= 1_000 else {
                throw MobileApplicationError(message: "This phone has reached its private record limit. Your current record and earlier versions were kept unchanged.")
            }
            try persist(next); plan = nil; contentGeneration = UUID(); refreshTicket = nil
            message = "Your chosen record is current. Earlier versions are kept on this phone."
            return true
        } catch { message = error.localizedDescription; return false }
    }
    func removalContext(_ id: String) -> PhoneLocalRemovalContext? {
        guard !busy, let job = jobs.first(where: { $0["id"]?.string == id }), job["localOnly"]?.bool == true,
              state.jobs.contains(where: { $0["id"]?.string == id }), activePlanIDs.isEmpty else { return nil }
        let identity = MobileApplicationPolicy.jobIdentity(job["url"]?.string ?? "")
        let references = ([plan].compactMap { $0 } + recoverablePlans).contains { review in
            review["items"]?.array.contains { item in
                item.object["jobId"]?.string == id || item.object["job"]?.object["url"]?.string.map(MobileApplicationPolicy.jobIdentity) == identity
            } == true
        }
        guard !references else { return nil }
        return PhoneLocalRemovalContext(id: id, identity: identity, connection: sessionGeneration,
            title: job["title"]?.string ?? "Opportunity", company: job["company"]?.string ?? "",
            keepsRecord: recordVersions(for: job).contains(where: \.meaningful))
    }
    @discardableResult
    func removeLocalJob(_ context: PhoneLocalRemovalContext) -> Bool {
        guard context.connection == sessionGeneration, let current = removalContext(context.id), current.identity == context.identity else {
            message = "This opportunity changed or is part of a review. It was kept; refresh before removing it."; return false
        }
        do {
            var next = state
            if let job = jobs.first(where: { $0["id"]?.string == context.id }) {
                let scope = recordScope(for: job)
                for index in next.applicationRecords.indices where next.applicationRecords[index].scope == scope
                    && next.applicationRecords[index].identity == context.identity && !next.applicationRecords[index].archived {
                    var snapshot = next.applicationRecords[index].job
                    let facts = PhoneSavedJobMetadata.preserving(job, from: snapshot.applicationJob(id: context.id))
                    snapshot.sourceName = facts["sourceName"]?.string; snapshot.checkedAt = facts["checkedAt"]?.string
                    if snapshot != next.applicationRecords[index].job {
                        next.applicationRecords[index].job = snapshot
                        next.applicationRecords[index].revision += 1
                        next.applicationRecords[index].updatedAt = ISO8601DateFormatter().string(from: Date())
                    }
                }
            }
            next.jobs.removeAll { $0["id"]?.string == context.id }; try persist(next)
            selected.remove(context.id); answers.removeValue(forKey: context.id); mergeJobs()
            message = current.keepsRecord ? "Saved link removed. Your application record is kept on this phone." : "Saved link removed."
            return true
        } catch { message = error.localizedDescription; return false }
    }
    var availableReviews: [ApplicationReviewSummary] {
        recoverablePlans.compactMap(ApplicationReviewSummary.init).filter { !activePlanIDs.contains($0.id) }
    }
    var editContext: ApplicationProfileEditContext {
        ApplicationProfileEditContext(serviceAddress: state.serviceAddress, workspaceID: state.workspaceID, revision: state.profileRevision)
    }

    /// Dependency injection exercises this same store on macOS without an app build, Keychain access, or live networking.
    init(folder: URL? = nil, credentials: (any ApplicationTokenStore)? = nil, clientFactory: ClientFactory? = nil,
         monotonicTime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.folder = folder ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("VerifiedApplications", isDirectory: true)
        self.credentials = credentials ?? ApplicationKeychain()
        self.clientFactory = clientFactory ?? { try MobileApplicationClient(origin: $0, token: $1) }
        self.monotonicTime = monotonicTime
        do {
            #if os(iOS)
            try FileManager.default.createDirectory(at: self.folder, withIntermediateDirectories: true,
                                                   attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
            #else
            try FileManager.default.createDirectory(at: self.folder, withIntermediateDirectories: true)
            #endif
            let path = self.folder.appendingPathComponent("phone-draft.json")
            if FileManager.default.fileExists(atPath: path.path) {
                let data = try Data(contentsOf: path)
                guard data.count <= 64 * 1_024 * 1_024 else { throw CocoaError(.coderInvalidValue) }
                state = try JSONDecoder().decode(PhoneApplicationState.self, from: data)
            }
            jobs = state.jobs
        } catch {
            storageReadable = false
            message = (error as? MobileApplicationError)?.message
                ?? "Your saved application draft could not be read. It has been preserved and will not be overwritten."
        }
        restoreConnection()
    }
    private func restoreConnection() {
        guard storageReadable, client == nil, state.connectionEnabled,
              let origin = MobileApplicationPolicy.serviceURL(state.serviceAddress) else { return }
        do {
            if let token = try credentials.load(account: state.tokenAccount) {
                client = try clientFactory(origin, token); connected = true
            }
        } catch { message = error.localizedDescription }
    }
    private func persist(_ next: PhoneApplicationState) throws {
        guard storageReadable else { throw MobileApplicationError(message: "The existing phone draft is preserved because it could not be read.") }
        guard next.jobs.allSatisfy(PhoneSavedJobMetadata.valid),
              next.applicationRecordSchema == 1, next.applicationRecords.count <= 1_000,
              next.applicationRecords.allSatisfy(\.valid), Set(next.applicationRecords.map(\.id)).count == next.applicationRecords.count,
              next.workspaceDraftSchema == 1, next.workspaceDrafts.count <= 32, next.workspaceDrafts.allSatisfy(\.valid),
              next.recordDrafts.count + next.recordDraftAlternatives.count <= 200,
              next.recordDrafts.allSatisfy(\.valid), next.recordDraftAlternatives.allSatisfy(\.valid),
              next.recoveredOpportunityDrafts.count <= 200, next.recoveredOpportunityDrafts.allSatisfy(\.valid),
              next.submissionHolds.count <= 500, next.submissionHolds.allSatisfy(\.valid),
              next.savedApplicationHistory.map({ $0.valid && $0.matches(next) }) ?? true else {
            throw MobileApplicationError(message: "The saved application records could not be updated. Your existing phone data is preserved.")
        }
        // Encoder key order is not stable. An unchanged workspace must not rewrite the phone file.
        if next == state { return }
        let data = try JSONEncoder().encode(next)
        guard data.count <= 64 * 1_024 * 1_024 else {
            throw MobileApplicationError(message: "This phone reached its private workspace storage limit. Existing drafts were kept; export and clear an unused workspace before adding another.")
        }
        #if os(iOS)
        try data.write(to: folder.appendingPathComponent("phone-draft.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: folder.appendingPathComponent("phone-draft.json"), options: [.atomic])
        #endif
        if next.profile != state.profile || next.profileRevision != state.profileRevision || next.jobs != state.jobs
            || next.applicationRecords != state.applicationRecords || next.opportunityDraft != state.opportunityDraft
            || next.recordDrafts != state.recordDrafts || next.recordDraftAlternatives != state.recordDraftAlternatives
            || next.recoveredOpportunityDrafts != state.recoveredOpportunityDrafts
            || next.workspaceDrafts != state.workspaceDrafts
            || next.submissionHolds != state.submissionHolds { workspaceMutation = UUID() }
        state = next
    }
    private func beginOperation() -> UUID? {
        guard !busy else { return nil }
        let ticket = UUID(); operationTicket = ticket; busy = true
        contentGeneration = UUID(); refreshTicket = nil
        return ticket
    }
    private func finishOperation(_ ticket: UUID) {
        if operationTicket == ticket { operationTicket = nil; busy = false }
    }
    private func mergeJobs() {
        let merged = ApplicationJobMerge(remote: remoteJobs, local: state.jobs, selected: selected, answers: answers)
        jobs = merged.jobs; selected = merged.selected; answers = merged.answers
    }
    private func clearRemoteViews() {
        remoteJobs = []; jobs = state.jobs; attempts = []; plan = nil
        hasFreshApplicationHistory = false
        activePlanIDs = []; recoverablePlans = []; selected = []; answers = [:]; mode = "local"
        requiresClientContinuation = false
        liveSubmissionEnabled = nil
        linkedInProfileSupported = nil
    }
    private func rotateConnection() {
        sessionGeneration = UUID(); contentGeneration = UUID(); refreshTicket = nil
        operationTicket = nil; busy = false
        continuationTicket = nil; advancingApprovedApplication = false; nextContinuationTime = 0
    }
    private func acceptError(_ error: Error, generation: UUID) {
        guard generation == sessionGeneration else { return }
        if (error as? MobileApplicationError)?.statusCode == 401 {
            let retired = detachLocally()
            retired?.invalidate()
            message = error.localizedDescription
        } else if !(error is CancellationError) {
            if (error as? MobileApplicationError)?.code == "account_deleting" {
                activePlanIDs = []; recoverablePlans = []; plan = nil; requiresClientContinuation = false; liveSubmissionEnabled = nil; linkedInProfileSupported = nil
            }
            message = error.localizedDescription
        }
    }
    @discardableResult
    private func detachLocally() -> (any MobileApplicationServing)? {
        let retired = client
        client = nil; connected = false; rotateConnection()
        var next = state; next.connectionEnabled = false; next.savedApplicationHistory = nil
        var issues: [String] = []
        do { try credentials.remove(account: state.tokenAccount); next.credentialAccount = nil }
        catch { issues.append(error.localizedDescription) }
        do { try persist(next) }
        catch {
            state = next
            issues.append("The phone draft file could not record this change. Its existing contents are preserved.")
        }
        clearRemoteViews()
        message = issues.isEmpty ? "Disconnected on this phone. Existing applications remain with the service."
            : "Disconnected for this session. " + issues.joined(separator: " ")
        return retired
    }
    func connect(address: String, code: String) async -> Bool {
        guard let origin = MobileApplicationPolicy.serviceURL(address), let operation = beginOperation() else {
            message = "Enter the HTTPS address from your application-service invitation."; return false
        }
        defer { finishOperation(operation) }
        let generation = sessionGeneration
        var candidate: (any MobileApplicationServing)?
        var savedAccount: String?
        do {
            let created = try clientFactory(origin, nil); candidate = created
            let response = try await created.request("session", method: "POST",
                body: ["pairingCode": .string(code.trimmingCharacters(in: .whitespacesAndNewlines))])
            guard generation == sessionGeneration else { created.invalidate(); return false }
            guard let token = response["sessionToken"]?.string, !token.isEmpty,
                  let workspace = response["workspaceId"]?.string, !workspace.isEmpty else {
                throw MobileApplicationError(message: "The service did not confirm this workspace. Request a new invitation.")
            }
            created.token = token
            let profileObject: [String: ApplicationValue]
            if response["profile"]?.object["revision"] != nil { profileObject = response["profile"]?.object ?? [:] }
            else {
                let workspaceResponse = try await created.request("workspace")
                guard workspaceResponse["workspaceId"]?.string == nil || workspaceResponse["workspaceId"]?.string == workspace else {
                    throw MobileApplicationError(message: "The service returned a different workspace. The connection was not saved.")
                }
                profileObject = workspaceResponse["profile"]?.object ?? [:]
            }
            guard generation == sessionGeneration else { created.invalidate(); return false }
            let server = try ApplicationServerProfile(profileObject)
            let account = "workspace/" + workspace + "/" + UUID().uuidString
            try credentials.save(token, account: account); savedAccount = account
            var next = state
            next.connect(address: origin.absoluteString, workspace: workspace, account: account, server: server)
            let oldClient = client; let oldAccount = state.tokenAccount
            try persist(next)
            client = created; connected = true; rotateConnection(); clearRemoteViews()
            if oldAccount != account { try? credentials.remove(account: oldAccount) }
            if let oldClient { retireRemotely(oldClient, reportWhenDisconnected: false) }
            message = profileNeedsSync ? "Connected. Your phone draft is kept; review and save it before applying."
                : "Your application workspace is connected."
            await refresh()
            return true
        } catch {
            if let savedAccount { try? credentials.remove(account: savedAccount) }
            if let candidate, candidate.token != nil { retireRemotely(candidate, reportWhenDisconnected: false) }
            else { candidate?.invalidate() }
            if generation == sessionGeneration { message = error.localizedDescription }
            return false
        }
    }
    private func retireRemotely(_ retired: any MobileApplicationServing, reportWhenDisconnected: Bool) {
        let generation = sessionGeneration
        Task {
            defer { retired.invalidate() }
            do { _ = try await retired.request("session/revoke", method: "POST", body: [:]) }
            catch {
                if reportWhenDisconnected && generation == sessionGeneration && !connected {
                    message = "Disconnected on this phone. The service could not confirm remote revocation; existing applications and the old session remain governed by that service."
                }
            }
        }
    }
    func disconnect() async {
        if let retired = detachLocally() { retireRemotely(retired, reportWhenDisconnected: true) }
    }
    @discardableResult
    func refresh() async -> Bool {
        guard !busy, continuationTicket == nil else { return false }
        restoreConnection()
        guard let client, refreshTicket == nil else { return false }
        let ticket = UUID(); refreshTicket = ticket
        let generation = sessionGeneration, content = contentGeneration
        defer { if refreshTicket == ticket { refreshTicket = nil } }
        do {
            let value = try await client.request("workspace")
            guard generation == sessionGeneration, content == contentGeneration else { return false }
            let snapshot = try ApplicationWorkspaceSnapshot(value, workspaceID: state.workspaceID)
            let server = snapshot.profile
            guard server.revision >= (state.latestServerRevision ?? 0) else {
                throw MobileApplicationError(message: "The service returned an older profile. Your current draft and review are preserved.")
            }
            var next = state; next.receive(server)
            var history = next.credentialAccount.flatMap { account in
                PhoneApplicationHistoryCache(scope: next.recordScope, credentialAccount: account,
                    attempts: snapshot.attempts, savedAt: ISO8601DateFormatter().string(from: Date()))
            }
            // Keep the actual saved-snapshot time while unchanged reads avoid needless disk writes.
            if let existing = next.savedApplicationHistory, let candidate = history,
               existing.sameProjection(as: candidate) { history = existing }
            next.savedApplicationHistory = history // A successful empty snapshot replaces old history too.
            try persist(next)
            remoteJobs = snapshot.jobs; attempts = snapshot.attempts; hasFreshApplicationHistory = true
            activePlanIDs = snapshot.activePlanIDs; recoverablePlans = snapshot.recoverablePlans; mode = snapshot.mode
            requiresClientContinuation = snapshot.requiresClientContinuation
            liveSubmissionEnabled = snapshot.liveSubmissionEnabled
            linkedInProfileSupported = snapshot.linkedInProfileSupported
            mergeJobs()
            if let id = plan?["id"]?.string {
                if !profileNeedsSync, let current = recoverablePlans.first(where: { $0["id"]?.string == id }),
                   ApplicationReviewPolicy.current(current, revision: revision),
                   ApplicationReviewPolicy.linkedInMatchesProfile(current, link: profile.linkedin),
                   !planContainsMarkedApplication(current) { plan = current }
                else { plan = nil }
            }
            return true
        } catch {
            if content == contentGeneration && generation == sessionGeneration {
                hasFreshApplicationHistory = false
                acceptError(error, generation: generation)
            }
            return false
        }
    }
    /// Only a fresh authenticated workspace can authorize continuation of an already approved queue.
    /// This endpoint cannot approve a review, and its response never creates a local receipt.
    func pollApprovedApplications() async {
        guard !Task.isCancelled, continuationTicket == nil, await refresh() else { return }
        guard !Task.isCancelled, !busy, requiresClientContinuation,
              monotonicTime() >= nextContinuationTime, !activePlanIDs.isEmpty,
              let client else { return }
        guard let id = activePlanIDs.first(where: { !state.holdsSubmission($0) && !continuationConflictsWithPrivateRecords($0) }) else {
            message = hasSubmissionHold ? "Sending is paused on this phone because you requested Stop. Retry Stop to confirm it with the service; this phone will not resume the held review."
                : "A queued application conflicts with a job you marked applied, or its target could not be checked. Review your phone record and stop unsent applications in Apply before continuing."
            return
        }
        let ticket = UUID(), generation = sessionGeneration
        continuationTicket = ticket; advancingApprovedApplication = true
        contentGeneration = UUID(); refreshTicket = nil
        let content = contentGeneration
        func finish() {
            guard continuationTicket == ticket else { return }
            continuationTicket = nil; advancingApprovedApplication = false
            nextContinuationTime = monotonicTime() + 4
        }
        defer { finish() }
        do {
            _ = try await client.request("advance", method: "POST", body: ["planId": .string(id)])
        } catch {
            if content == contentGeneration && !Task.isCancelled { acceptError(error, generation: generation) }
        }
        finish()
        guard generation == sessionGeneration, !Task.isCancelled else { return }
        await refresh()
    }
    func hasConflict(for context: ApplicationProfileEditContext) -> Bool {
        !context.matches(state) || (connected && (state.latestServerRevision == nil || context.revision != state.latestServerRevision))
    }
    @discardableResult
    func keepProfileDraft(_ draft: PhoneApplicationProfile, context: ApplicationProfileEditContext) -> Bool {
        guard context.matches(state), !busy else {
            message = "The workspace changed. Keep this editor open and reconnect to the original workspace before saving its draft."; return false
        }
        do {
            var next = state; next.retainDraft(draft, basedOn: context.revision)
            try persist(next); plan = nil
            return true
        } catch { message = error.localizedDescription; return false }
    }
    func discardCheckpoint(restoring original: PhoneApplicationProfile, wasDirty: Bool, context: ApplicationProfileEditContext) -> Bool {
        guard context.matches(state), !busy else { return false }
        do {
            var next = state
            if wasDirty { next.retainDraft(original, basedOn: context.revision) }
            else if !next.useLatestProfile() { next.profile = original; next.profileNeedsSync = false; next.profileRevision = context.revision }
            try persist(next)
            return true
        } catch { message = error.localizedDescription; return false }
    }
    func useLatestProfile(context: ApplicationProfileEditContext) -> Bool {
        guard context.matches(state), !busy else { return false }
        do {
            var next = state
            guard next.useLatestProfile() else { throw MobileApplicationError(message: "Refresh the service profile before replacing your draft.") }
            try persist(next); plan = nil; return true
        } catch { message = error.localizedDescription; return false }
    }
    func keepDraftAfterReview(_ draft: PhoneApplicationProfile, context: ApplicationProfileEditContext, serverRevision: Int) -> Bool {
        guard context.matches(state), !busy else { return false }
        do {
            var next = state; next.retainDraft(draft, basedOn: context.revision)
            guard next.keepDraft(afterReviewing: serverRevision) else {
                throw MobileApplicationError(message: "The service profile changed again. Refresh and review its latest version.")
            }
            try persist(next); plan = nil; return true
        } catch { message = error.localizedDescription; return false }
    }
    func saveProfile(_ draft: PhoneApplicationProfile, context: ApplicationProfileEditContext) async -> Bool {
        guard context.matches(state), let operation = beginOperation() else { return false }
        defer { finishOperation(operation) }
        let generation = sessionGeneration
        do {
            var draft = draft
            if !draft.linkedin.isEmpty {
                guard let link = MobileApplicationPolicy.linkedInProfileURL(draft.linkedin) else {
                    throw MobileApplicationError(message: "Use an HTTPS LinkedIn personal profile link, such as https://www.linkedin.com/in/your-name. Your edits are kept in this editor.")
                }
                draft.linkedin = link.absoluteString
            }
            if draft.resumeChanged, !draft.resumeRemoved {
                guard let data = draft.resumeData else { throw MobileApplicationError(message: "Choose your PDF again before saving this draft.") }
                if let error = MobileApplicationPolicy.resumeError(data, filename: draft.resumeName) { throw MobileApplicationError(message: error) }
            }
            var next = state; next.retainDraft(draft, basedOn: context.revision)
            try persist(next); plan = nil
            guard let client else { message = "Your application draft is saved on this phone."; return true }
            guard linkedInProfileSupported == true || (draft.linkedin.isEmpty && (state.latestServerProfile?.linkedin.isEmpty ?? true)) else {
                throw MobileApplicationError(message: "This service has not confirmed support for LinkedIn profile links. Your edits are kept on this phone. Refresh the connection or ask its operator to update the service.")
            }
            guard let expected = context.revision, !hasConflict(for: context) else {
                throw MobileApplicationError(message: "Your phone draft is kept. Compare the latest service profile and choose which version to keep.")
            }
            let saved = try await client.request("profile", method: "PUT",
                body: ["expectedRevision": .number(Double(expected)), "profile": .object(draft.payload(includeLinkedIn: linkedInProfileSupported == true))])
            guard generation == sessionGeneration else { return false }
            let server = try ApplicationServerProfile(saved["profile"]?.object ?? [:])
            guard server.revision == expected + 1 else {
                throw MobileApplicationError(message: "The service did not confirm the expected profile version. Your phone draft is kept.")
            }
            guard linkedInProfileSupported != true || server.profile.linkedin == draft.linkedin else {
                throw MobileApplicationError(message: "The service did not confirm your LinkedIn profile change. Your phone draft is kept; refresh before applying.")
            }
            guard draft.confirmsResumeChange(in: server.profile) else {
                throw MobileApplicationError(message: "The service did not confirm the CV change. Refresh the online profile and review your draft.")
            }
            var acknowledged = state; acknowledged.acknowledge(server)
            do { try persist(acknowledged) }
            catch {
                message = "The service saved your profile, but this phone could not save the confirmation. Your draft is preserved; refresh before applying."
                return false
            }
            recoverablePlans = []; plan = nil
            message = "Application details saved. Review each application before sending."
            return true
        } catch {
            acceptError(error, generation: generation)
            finishOperation(operation)
            if (error as? MobileApplicationError)?.statusCode == 409 { await refresh() }
            return false
        }
    }
    private func rememberImported(_ imported: [String: ApplicationValue], localID: String) throws {
        guard let index = state.jobs.firstIndex(where: { $0["id"]?.string == localID }) else { return }
        guard let importedURL = imported["url"]?.string, MobileApplicationPolicy.jobURL(importedURL) != nil,
              MobileApplicationPolicy.jobIdentity(importedURL) == MobileApplicationPolicy.jobIdentity(state.jobs[index]["url"]?.string ?? "") else {
            throw MobileApplicationError(message: "The service returned a different opportunity. Your saved link and private record are kept.")
        }
        try checkUnpairedRecordAdoption(MobileApplicationPolicy.jobIdentity(importedURL))
        var next = state
        var backup = imported.filter { ["url", "title", "company", "location", "country", "provider", "workMode"].contains($0.key) }
        backup = PhoneSavedJobMetadata.preserving(backup, from: state.jobs[index])
        backup["id"] = .string(localID); backup["localOnly"] = .bool(true)
        next.jobs[index] = backup
        // Synchronizing a bookmark never moves a separate person's private records.
        // Copy/association has its own captured-scope confirmation and preserves conflicts.
        try persist(next)
    }
    @discardableResult
    func keepOpportunityDraft(_ draft: PhoneOpportunityDraft) -> Bool {
        if let error = draft.storageError { message = error; return false }
        do {
            var next = state; next.opportunityDraft = draft; try persist(next)
            return true
        } catch { message = error.localizedDescription; return false }
    }
    func containsOpportunity(url: String) -> Bool {
        let identity = MobileApplicationPolicy.jobIdentity(url)
        return jobs.contains { MobileApplicationPolicy.jobIdentity($0["url"]?.string ?? "") == identity }
    }
    func addJob(url: String, title: String, company: String, location: String, country: String,
                sourceName: String? = nil, checkedAt: String? = nil) async -> Bool {
        guard let valid = MobileApplicationPolicy.jobURL(url), let operation = beginOperation() else {
            message = "Use a complete public HTTPS job link."; return false
        }
        defer { finishOperation(operation) }
        let generation = sessionGeneration
        var fields: [String: ApplicationValue] = ["url": .string(valid.absoluteString)]
        for (key, value) in [("title", title), ("company", company), ("location", location), ("country", country.uppercased())]
            where !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            fields[key] = .string(value.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        do {
            let identity = MobileApplicationPolicy.jobIdentity(valid.absoluteString)
            guard !jobs.contains(where: { MobileApplicationPolicy.jobIdentity($0["url"]?.string ?? "") == identity }) else {
                throw MobileApplicationError(message: "This opportunity is already in your workspace.")
            }
            if client != nil { try checkUnpairedRecordAdoption(identity) }
            let lever = ["jobs.lever.co", "jobs.eu.lever.co"].contains(valid.host?.lowercased() ?? "")
            if client == nil || !lever {
                guard fields["title"]?.string != nil, fields["company"]?.string != nil else {
                    throw MobileApplicationError(message: "Add the role and employer so you can recognize this opportunity offline.")
                }
            }
            // Service jobs in the merged list are not part of this phone's backup. Count the draft.
            guard state.jobs.count < 200 else {
                throw MobileApplicationError(message: "The merged shortlist exceeds 200 links. Nothing was replaced.")
            }
            let localID = "local-" + UUID().uuidString
            var local = fields; local["id"] = .string(localID); local["localOnly"] = .bool(true)
            if let sourceName { local["sourceName"] = .string(sourceName) }
            if let checkedAt { local["checkedAt"] = .string(checkedAt) }
            guard PhoneSavedJobMetadata.valid(local) else {
                throw MobileApplicationError(message: "The saved application records could not be updated. Your existing phone data is preserved.")
            }
            var next = state; next.jobs.append(local)
            let submitted = PhoneOpportunityDraft(url: url, title: title, company: company, location: location, country: country)
            if next.opportunityDraft == submitted { next.opportunityDraft = PhoneOpportunityDraft() }
            try persist(next); mergeJobs()
            guard let client else { message = "Opportunity saved on this phone."; return true }
            do {
                let response = try await client.request("jobs", method: "POST", body: fields)
                guard generation == sessionGeneration else { return true }
                let imported = response["job"]?.object ?? [:]
                guard imported["id"]?.string != nil else { throw MobileApplicationError(message: "The service did not confirm this opportunity.") }
                try rememberImported(imported, localID: localID)
                message = "Opportunity saved."
                finishOperation(operation); await refresh()
            } catch {
                acceptError(error, generation: generation)
                if generation == sessionGeneration { message = "The link is saved on this phone. " + error.localizedDescription }
            }
            return true
        } catch { acceptError(error, generation: generation); return false }
    }
    func removeLocalJob(_ id: String) {
        if let context = removalContext(id) { _ = removeLocalJob(context) }
    }
    func prepare(manualAppliedURLs: Set<String> = [], replacingUnapprovedReview: Bool = false) async {
        guard let client else { message = "Connect your application service to review automatic submissions."; return }
        guard !profileNeedsSync, !profileEditing else { message = "Save or close your profile draft before preparing applications."; return }
        guard profile.linkedin.isEmpty || linkedInProfileSupported == true else {
            message = "Refresh the service connection before preparing an application with a LinkedIn profile link."; return
        }
        guard !selected.isEmpty, let operation = beginOperation() else { message = "Select the opportunities you want to review."; return }
        defer { finishOperation(operation) }
        let generation = sessionGeneration
        let previousPlan = plan
        var replacementStopAcknowledged = false
        let chosen = jobs.filter { selected.contains($0["id"]?.string ?? "") }
        let chosenAnswers = answers, chosenSelection = selected, chosenProfile = profile, chosenRevision = revision
        let chosenAppliedIdentities = localAppliedIdentities
        func inputsAreCurrent() -> Bool {
            generation == sessionGeneration && chosenAnswers == answers && chosenSelection == selected
                && chosenProfile == profile && chosenRevision == revision && !profileNeedsSync && !profileEditing
                && chosenAppliedIdentities == localAppliedIdentities
        }
        do {
            if replacingUnapprovedReview {
                guard let previousPlan, previousPlan["approvedAt"]?.string == nil,
                      let previousID = previousPlan["id"]?.string,
                      ApplicationReviewPolicy.current(previousPlan, revision: revision),
                      previousPlan["items"]?.array.allSatisfy({ ["ready", "blocked"].contains($0.object["state"]?.string ?? "") }) == true else {
                    throw MobileApplicationError(message: "This review has already started or changed. Stop it explicitly before creating a different review.")
                }
                guard retainStopHolds([previousID], clearReview: false) else { return }
                _ = try await client.request("stop", method: "POST", body: ["planId": .string(previousID), "onlyIfUnapproved": .bool(true)])
                guard generation == sessionGeneration else { return }
                replacementStopAcknowledged = true
            }
            // Keep the disabled, held review mounted until its exact replacement is ready.
            // A transient nil would dismiss the review sheet during the network request.
            if !replacingUnapprovedReview { plan = nil }
            var ids: [String] = []; var manualIDs: [String] = []
            var mappedAnswers: [String: ApplicationValue] = [:]
            let manualIdentities = Set(manualAppliedURLs.map(MobileApplicationPolicy.jobIdentity)).union(chosenAppliedIdentities)
            for job in chosen {
                var id = job["id"]?.string ?? ""
                if job["localOnly"]?.bool == true {
                    try checkUnpairedRecordAdoption(MobileApplicationPolicy.jobIdentity(job["url"]?.string ?? ""))
                    let fields = job.filter { ["url", "title", "company", "location", "country"].contains($0.key) }
                    let result = try await client.request("jobs", method: "POST", body: fields)
                    guard generation == sessionGeneration else { return }
                    let imported = result["job"]?.object ?? [:]
                    guard let savedID = imported["id"]?.string else { throw MobileApplicationError(message: "An opportunity could not be synchronized. No application was sent.") }
                    try rememberImported(imported, localID: id); id = savedID
                }
                guard !id.isEmpty, !ids.contains(id) else { continue }
                ids.append(id)
                if let answer = chosenAnswers[id] ?? chosenAnswers[job["id"]?.string ?? ""] { mappedAnswers[id] = .object(answer) }
                if manualIdentities.contains(MobileApplicationPolicy.jobIdentity(job["url"]?.string ?? "")) { manualIDs.append(id) }
            }
            guard !ids.isEmpty, ids.count <= 20 else { throw MobileApplicationError(message: "Choose from one to twenty current opportunities.") }
            guard inputsAreCurrent() else {
                throw MobileApplicationError(message: "Your choices changed while this review was being prepared. Review the current selection again.")
            }
            var body: [String: ApplicationValue] = [
                "jobIds": .array(ids.map(ApplicationValue.string)), "answers": .object(mappedAnswers),
                "manualAppliedJobIds": .array(manualIDs.map(ApplicationValue.string))
            ]
            if !chosenProfile.linkedin.isEmpty { body["reviewSchema"] = .number(3) }
            let value = try await client.request("prepare", method: "POST", body: body)
            guard generation == sessionGeneration else { return }
            guard inputsAreCurrent() else {
                if let obsoleteID = value["plan"]?.object["id"]?.string {
                    if retainStopHolds([obsoleteID]) {
                        _ = try? await client.request("stop", method: "POST", body: ["planId": .string(obsoleteID), "onlyIfUnapproved": .bool(true)])
                    }
                }
                guard generation == sessionGeneration else { return }
                plan = nil; message = "Your choices changed. The older review will not be approved; prepare your current selection again."
                finishOperation(operation); await refresh()
                return
            }
            guard let prepared = value["plan"]?.object, prepared["id"]?.string != nil, prepared["digest"]?.string != nil,
                  ApplicationReviewPolicy.current(prepared, revision: revision),
                  ApplicationReviewPolicy.linkedInMatchesProfile(prepared, link: chosenProfile.linkedin) else {
                throw MobileApplicationError(message: "The application review could not be prepared with your current profile.")
            }
            plan = prepared; selected = Set(ids)
            finishOperation(operation); await refresh()
        } catch {
            // Once Stop was acknowledged, the old review is no longer current.
            // Return to Apply with the error and retained choices for an explicit retry.
            // A delayed failure from a retired session cannot clear another owner's review.
            if replacementStopAcknowledged, generation == sessionGeneration { plan = nil }
            acceptError(error, generation: generation)
            finishOperation(operation)
            if (error as? MobileApplicationError)?.statusCode == 409 { await refresh() }
        }
    }
    @discardableResult
    func submitReviewed() async -> Bool {
        guard submissionAvailable else {
            message = "Automatic submission is unavailable for this connection. Refresh availability or apply on the employer's website."
            return false
        }
        guard !profileNeedsSync, !profileEditing else { message = "Save your current application details before approving a submission."; return false }
        if let plan, planContainsMarkedApplication(plan) {
            message = "You marked a job in this review as already applied. Prepare a new review before continuing."; return false
        }
        guard let client, let plan, ApplicationReviewPolicy.current(plan, revision: revision),
              ApplicationReviewPolicy.linkedInMatchesProfile(plan, link: profile.linkedin),
              let id = plan["id"]?.string, let digest = plan["digest"]?.string,
              !state.holdsSubmission(id),
              plan["items"]?.array.contains(where: { ApplicationReviewPolicy.eligible($0.object) }) == true,
              let operation = beginOperation() else { message = "Refresh this review before approving it."; return false }
        defer { finishOperation(operation) }
        let generation = sessionGeneration
        do {
            var body: [String: ApplicationValue] = ["planId": .string(id), "digest": .string(digest), "approved": .bool(true)]
            if ApplicationReviewPolicy.includesLinkedIn(plan) { body["reviewSchema"] = .number(3) }
            _ = try await client.request("submit", method: "POST", body: body)
            guard generation == sessionGeneration else { return false }
            self.plan = nil
            message = "Your approved applications are processing. Confirmed receipts will appear here."
        } catch {
            guard generation == sessionGeneration else { return false }
            self.plan = nil
            acceptError(error, generation: generation)
            if connected { message = "Checking the result before any further submission. " + error.localizedDescription }
        }
        finishOperation(operation); await refresh()
        return true
    }
    func stop() async {
        let ids = activePlanIDs
        guard retainStopHolds(ids), let client, let operation = beginOperation() else { return }
        defer { finishOperation(operation) }
        let generation = sessionGeneration
        do {
            for id in ids {
                _ = try await client.request("stop", method: "POST", body: ["planId": .string(id)])
                guard generation == sessionGeneration else { return }
            }
            message = "Unsent applications were stopped. Applications already sending will keep their actual result."
            finishOperation(operation); await refresh()
        } catch { acceptError(error, generation: generation) }
    }
    @discardableResult
    func resumeReview(_ review: [String: ApplicationValue]) -> Bool {
        if let id = review["id"]?.string, state.holdsSubmission(id) {
            message = "This review is held because you requested Stop. Retry Stop to confirm it with the service, then prepare a new review if you still want to apply."; return false
        }
        guard !busy, !profileNeedsSync, !profileEditing else { message = "Save or close your profile draft before continuing a review."; return false }
        guard let id = review["id"]?.string,
              !state.holdsSubmission(id),
              let current = recoverablePlans.first(where: { $0["id"]?.string == id && $0["digest"] == review["digest"] }),
              ApplicationReviewPolicy.current(current, revision: revision),
              ApplicationReviewPolicy.linkedInMatchesProfile(current, link: profile.linkedin),
              !planContainsMarkedApplication(current) else {
            message = "This review is no longer current. Refresh your applications."; return false
        }
        plan = current
        for item in current["items"]?.array.map(\.object) ?? [] {
            guard let id = item["jobId"]?.string else { continue }
            answers[id] = (item["payloadSummary"]?.object ?? [:]).filter { ["comments", "consentStore", "consentMarketing"].contains($0.key) }
        }
        selected = Set(current["items"]?.array.compactMap { $0.object["jobId"]?.string } ?? [])
        return true
    }
    func stopReview(_ id: String) async {
        guard retainStopHolds([id]), let client, let operation = beginOperation() else { return }
        defer { finishOperation(operation) }
        let generation = sessionGeneration
        do {
            _ = try await client.request("stop", method: "POST", body: ["planId": .string(id)])
            guard generation == sessionGeneration else { return }
            if plan?["id"]?.string == id { plan = nil }
            message = "This review was stopped. Provider cooldowns still apply to rejected attempts."
            finishOperation(operation); await refresh()
        } catch { acceptError(error, generation: generation) }
    }
    /// Explicit receipt Stop. The hold is saved first. The receipt state changes only when a later workspace read says so.
    func stopAndCheckReceipt(planID: String, attemptID: String) async {
        let serving = client
        let generation = sessionGeneration
        let scope = state.recordScope
        guard !scope.isLocal, !planID.isEmpty, planID.utf16.count <= 200,
              !attemptID.isEmpty, attemptID.utf16.count <= 200, let serving else { return }
        guard attempts.contains(where: { row in
            let id = row["attemptId"]?.string ?? row["id"]?.string ?? ""
            return id == attemptID && row["state"]?.string == "dispatching" && row["planId"]?.string == planID
        }) else { return }
        guard retainStopHolds([planID]) else { return }
        guard sessionGeneration == generation, (client as AnyObject?) === (serving as AnyObject), state.recordScope == scope else { return }
        guard let operation = beginOperation() else { return }
        defer { finishOperation(operation) }
        do {
            _ = try await serving.request("stop", method: "POST", body: [
                "planId": .string(planID), "onlyIfUnapproved": .bool(false)])
            guard sessionGeneration == generation, (client as AnyObject?) === (serving as AnyObject), state.recordScope == scope else { return }
            message = "Stop requested. Jobs already dispatched still need a confirmed outcome."
            finishOperation(operation)
            if sessionGeneration == generation && !busy { await refresh() }
        } catch {
            acceptError(error, generation: generation)
        }
    }
    /// Persist intent before networking. A lost response or 401 never restores local permission to send.
    private func retainStopHolds(_ ids: [String], clearReview: Bool = true) -> Bool {
        guard !state.recordScope.isLocal, !ids.isEmpty else { return false }
        do {
            var next = state; next.holdSubmissions(ids); try persist(next)
            if clearReview, let id = plan?["id"]?.string, ids.contains(id) { plan = nil }
            message = "Sending is paused on this phone. Checking whether the service stopped unsent work."
            return true
        } catch {
            state.holdSubmissions(ids)
            let retired = detachLocally(); retired?.invalidate()
            message = "Stop could not be saved safely, so this phone disconnected and sent no Stop request. Use Account to revoke the connection or retry after storage is available. " + error.localizedDescription
            return false
        }
    }
    private func actionMatches(_ context: PhoneWorkspaceActionContext) -> Bool {
        context == workspaceActionContext && !busy && !profileEditing
    }
    func restoredRecordDraft(for context: PhoneRecordEditContext) -> PhoneRecordDraft? {
        state.recordDrafts.first { $0.scope == context.scope && $0.identity == context.identity
            && $0.recordID == context.recordID && $0.revision == context.revision }?.draft
    }
    private func draftVersionMatches(_ left: PhoneRecordDraftCheckpoint, _ right: PhoneRecordDraftCheckpoint) -> Bool {
        left.scope == right.scope && left.identity == right.identity && left.draft == right.draft && left.revision == right.revision
    }
    private func storesDraftVersion(_ state: PhoneApplicationState, _ draft: PhoneRecordDraftCheckpoint) -> Bool {
        state.recordDrafts.contains { draftVersionMatches($0, draft) } || state.recordDraftAlternatives.contains { draftVersionMatches($0, draft) }
    }
    private func retainDistinctDraft(_ draft: PhoneRecordDraftCheckpoint, into next: inout PhoneApplicationState) {
        guard draft.valid, !storesDraftVersion(next, draft) else { return }
        if next.recordDrafts.contains(where: { $0.scope == draft.scope && $0.identity == draft.identity }) {
            next.recordDraftAlternatives.append(draft)
        } else {
            next.recordDrafts.append(draft)
        }
    }
    @discardableResult
    func keepRecordDraft(_ draft: PhoneRecordDraft, context: PhoneRecordEditContext) -> Bool {
        guard context.connection == sessionGeneration else { return false }
        guard MobileApplicationPolicy.manualResumeNameIsValid(draft.manualResumeName) else {
            message = MobileApplicationPolicy.manualResumeNameError; return false
        }
        let checkpoint = PhoneRecordDraftCheckpoint(scope: context.scope, identity: context.identity, job: context.job,
            recordID: context.recordID, revision: context.revision, draft: draft)
        guard checkpoint.valid else { message = "This unfinished record could not be saved. Keep the note within 2,000 characters and use valid dates."; return false }
        do {
            var next = state
            next.recordDraftAlternatives.removeAll { draftVersionMatches($0, checkpoint) }
            if let index = next.recordDrafts.firstIndex(where: { $0.scope == context.scope && $0.identity == context.identity }) {
                let current = next.recordDrafts[index]
                if !draftVersionMatches(current, checkpoint) {
                    next.recordDrafts[index] = checkpoint
                    if !storesDraftVersion(next, current) { next.recordDraftAlternatives.append(current) }
                }
            } else {
                next.recordDrafts.append(checkpoint)
            }
            guard next.recordDrafts.count + next.recordDraftAlternatives.count <= 200 else {
                throw MobileApplicationError(message: "This phone already keeps 200 unfinished edits. Existing drafts were kept.")
            }
            try persist(next); return true
        } catch { message = error.localizedDescription; return false }
    }
    @discardableResult
    func discardRecordDraft(context: PhoneRecordEditContext) -> Bool {
        guard context.connection == sessionGeneration else { return false }
        do {
            var next = state
            next.recordDrafts.removeAll { $0.scope == context.scope && $0.identity == context.identity }
            try persist(next); return true
        } catch { message = error.localizedDescription; return false }
    }
    @discardableResult
    func useRecoveredRecordDraft(_ checkpoint: PhoneRecordDraftCheckpoint) -> Bool {
        guard !busy, checkpoint.valid, checkpoint.scope == state.recordScope,
              state.recordDraftAlternatives.contains(checkpoint) else { return false }
        let active = state.applicationRecords.filter {
            $0.scope == checkpoint.scope && $0.identity == checkpoint.identity && !$0.archived
        }
        guard active.count <= 1 else {
            message = "Compare the saved record versions before editing this opportunity."
            return false
        }
        // Explicit selection prepares these values for review against the current record.
        // Keep the original base as an alternative; ordinary editor/save revision guards stay strict.
        var selected = checkpoint
        selected.recordID = active.first?.id
        selected.revision = active.first?.revision
        do {
            var next = state
            next.recordDraftAlternatives.removeAll { $0 == checkpoint || draftVersionMatches($0, selected) }
            if let index = next.recordDrafts.firstIndex(where: { $0.scope == checkpoint.scope && $0.identity == checkpoint.identity }) {
                let current = next.recordDrafts[index]
                next.recordDrafts[index] = selected
                retainDistinctDraft(current, into: &next)
            } else {
                next.recordDrafts.append(selected)
            }
            retainDistinctDraft(checkpoint, into: &next)
            guard next.recordDrafts.count + next.recordDraftAlternatives.count <= 200 else {
                throw MobileApplicationError(message: "This phone already keeps 200 unfinished edits. Existing drafts were kept.")
            }
            try persist(next)
            message = "Recovered edit selected. Open its record to review and save; earlier draft versions are kept."
            return true
        } catch { message = error.localizedDescription; return false }
    }
    @discardableResult
    func restoreRecoveredOpportunityDraft(_ draft: PhoneOpportunityDraft) -> Bool {
        let scope = state.recordScope
        guard state.recoveredOpportunityDrafts.contains(where: { $0.scope == scope && $0.draft == draft }) else {
            message = "This unfinished opportunity changed. Reopen the draft list."
            return false
        }
        // An old phone file can still hold an over-limit current link. Parking it would make the next launch unloadable.
        if state.opportunityDraft.hasContent, state.opportunityDraft != draft, let error = state.opportunityDraft.storageError {
            message = error
            return false
        }
        do {
            var next = state
            next.recoveredOpportunityDrafts.removeAll { $0.scope == scope && $0.draft == draft }
            if next.opportunityDraft.hasContent && next.opportunityDraft != draft {
                let parked = PhoneRecoveredOpportunity(scope: scope, draft: next.opportunityDraft)
                if !next.recoveredOpportunityDrafts.contains(parked) { next.recoveredOpportunityDrafts.append(parked) }
            }
            next.opportunityDraft = draft
            guard next.recoveredOpportunityDrafts.count <= 200 else {
                throw MobileApplicationError(message: "This phone already keeps 200 unfinished edits. Existing drafts were kept.")
            }
            try persist(next)
            message = "Unfinished opportunity kept on this phone."
            return true
        } catch { message = error.localizedDescription; return false }
    }
    @discardableResult
    func importUnpairedDraft(context: PhoneWorkspaceActionContext) -> Bool {
        guard actionMatches(context), !state.recordScope.isLocal,
              let source = state.workspaceDrafts.first(where: { $0.scope.isLocal }) else {
            message = "The destination or its draft changed. Review the import again."; return false
        }
        let backup = PhoneWorkspaceBackup(draft: source, records: state.applicationRecords.filter { $0.scope.isLocal },
            recordDrafts: state.recordDrafts.filter { $0.scope.isLocal } + state.recordDraftAlternatives.filter { $0.scope.isLocal }, submissionHolds: [],
            recoveredOpportunityDrafts: state.recoveredOpportunityDrafts.filter { $0.scope.isLocal }.map(\.draft))
        return mergeBackup(backup, context: context, replaceProfile: source.profile.hasContent)
    }
    @discardableResult
    func openPhoneWorkspace(_ scope: PhoneRecordScope, context: PhoneWorkspaceActionContext) -> Bool {
        guard actionMatches(context), scope != state.recordScope,
              let restored = state.workspaceDrafts.first(where: { $0.scope == scope }) else {
            message = "The saved workspace changed. Reopen its current details."; return false
        }
        do {
            var next = state; let previous = next.activeDraft, account = next.tokenAccount, retired = client
            next.workspaceDrafts.removeAll { $0.scope == scope || $0.scope == previous.scope }
            next.workspaceDrafts.append(previous); next.loadDraft(restored)
            next.serviceAddress = scope.origin; next.workspaceID = scope.workspaceID
            next.connectionEnabled = false; next.credentialAccount = nil
            try persist(next)
            client = nil; connected = false; rotateConnection(); clearRemoteViews()
            try? credentials.remove(account: account)
            if let retired { retireRemotely(retired, reportWhenDisconnected: false) }
            message = "Opened the saved phone workspace. Connect it again to access its service; no data was copied between workspaces."
            return true
        } catch { message = error.localizedDescription; return false }
    }
    /// This export includes only this scope; no tokens, active approvals, or invented provider receipts.
    func exportWorkspace(context: PhoneWorkspaceActionContext, discoverySnapshot: Data? = nil) -> URL? {
        guard actionMatches(context) else { message = "The workspace changed. Review the export target again."; return nil }
        // An unreadable phone file stays on disk. Do not write a backup of the empty in-memory workspace.
        guard storageReadable else {
            if message == nil { message = "The existing phone draft is preserved because it could not be read." }
            return nil
        }
        do {
            guard state.jobs.count <= 200 else {
                throw MobileApplicationError(message: "The merged shortlist exceeds 200 links. Nothing was replaced.")
            }
            // A saved draft can already hold two locals with the same identity.
            // Import would keep the first title and drop the second. Write nothing and delete nothing.
            var seenJobIdentities = Set<String>()
            for (index, job) in state.jobs.enumerated() {
                let identity = job["url"]?.string.map(MobileApplicationPolicy.jobIdentity) ?? "unidentified-\(index)"
                guard seenJobIdentities.insert(identity).inserted else {
                    throw MobileApplicationError(message: "The backup contains duplicate saved links.")
                }
            }
            let scope = state.recordScope
            let scopedDrafts = state.recordDrafts.filter { $0.scope == scope } + state.recordDraftAlternatives.filter { $0.scope == scope }
            guard scopedDrafts.count <= 200 else {
                throw MobileApplicationError(message: "This phone already keeps 200 unfinished edits. Existing drafts were kept.")
            }
            let scopedRecovered = state.recoveredOpportunityDrafts.filter { $0.scope == scope }
            guard scopedRecovered.count <= 200 else {
                throw MobileApplicationError(message: "This phone already keeps 200 unfinished edits. Existing drafts were kept.")
            }
            // One over-long unfinished link makes the importer reject the whole file. Write nothing.
            if let error = state.opportunityDraft.storageError ?? scopedRecovered.compactMap(\.draft.storageError).first {
                throw MobileApplicationError(message: error)
            }
            let backup = PhoneWorkspaceBackup(draft: state.activeDraft,
                records: state.applicationRecords.filter { $0.scope == scope },
                recordDrafts: scopedDrafts,
                submissionHolds: state.submissionHolds.filter { $0.scope == scope }, discoverySnapshot: discoverySnapshot,
                recoveredOpportunityDrafts: scopedRecovered.map(\.draft))
            let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let bytes = try encoder.encode(backup)
            guard bytes.count <= 64 * 1_024 * 1_024 else { throw MobileApplicationError(message: "This backup exceeds the supported 64 MiB size. Existing phone data is unchanged.") }
            let output = folder.appendingPathComponent("Career-Finder-Phone-Workspace-" + UUID().uuidString + ".json")
            #if os(iOS)
            try bytes.write(to: output, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            #else
            try bytes.write(to: output, options: .atomic)
            #endif
            return output
        } catch { message = error.localizedDescription; return nil }
    }
    nonisolated static func readWorkspaceBackup(at url: URL) throws -> PhoneWorkspaceBackup {
        let file = try FileHandle(forReadingFrom: url); defer { try? file.close() }
        let bytes = try file.read(upToCount: 64 * 1_024 * 1_024 + 1) ?? Data()
        guard bytes.count <= 64 * 1_024 * 1_024 else { throw MobileApplicationError(message: "This backup exceeds the 64 MiB import limit. Existing phone data is unchanged.") }
        let backup = try JSONDecoder().decode(PhoneWorkspaceBackup.self, from: bytes)
        guard backup.valid else { throw MobileApplicationError(message: "This file is damaged or uses an unsupported backup version. Existing phone data is unchanged.") }
        if let pdf = backup.draft.profile.resumeData {
            var verified = backup.draft.profile
            try verified.selectResume(pdf, filename: verified.resumeName)
            guard verified.resumeSHA256 == backup.draft.profile.resumeSHA256, verified.resumeSize == backup.draft.profile.resumeSize else {
                throw MobileApplicationError(message: "The backup's CV does not match its recorded fingerprint. Existing phone data is unchanged.")
            }
        }
        return backup
    }
    /// Keep this workspace's current opportunity text. Park a different incoming draft here and leave other workspaces alone.
    private func retainOpportunityDrafts(from backup: PhoneWorkspaceBackup, into next: inout PhoneApplicationState) throws {
        let scope = next.recordScope
        let incoming = backup.draft.opportunityDraft
        var current = next.opportunityDraft
        if !current.hasContent, incoming.hasContent, incoming.storageError == nil { current = incoming }
        var parked = next.recoveredOpportunityDrafts
        for draft in backup.recoveredOpportunityDrafts + (current.hasContent ? [incoming] : []) {
            guard draft.hasContent, draft.storageError == nil, draft != current else { continue }
            let recovered = PhoneRecoveredOpportunity(scope: scope, draft: draft)
            guard !parked.contains(recovered) else { continue }
            parked.append(recovered)
        }
        guard parked.count <= 200, parked.filter({ $0.scope == scope }).count <= 200 else {
            throw MobileApplicationError(message: "This phone already keeps 200 unfinished edits. Existing drafts were kept.")
        }
        next.opportunityDraft = current
        next.recoveredOpportunityDrafts = parked
    }
    /// The confirmation explicitly replaces the local profile, merges links/history and uploads nothing.
    @discardableResult
    func mergeBackup(_ backup: PhoneWorkspaceBackup, context: PhoneWorkspaceActionContext, replaceProfile: Bool = true) -> Bool {
        guard actionMatches(context), backup.valid else {
            message = "The destination changed or the backup is not supported. Nothing was imported."; return false
        }
        guard activePlanIDs.isEmpty else {
            message = "Stop active applications before replacing this phone's profile with a backup. Existing data is unchanged."; return false
        }
        // Skipping a repeated identity would drop that row's title. Reject the file before any edit.
        var seenIncomingJobs = Set<String>()
        for job in backup.draft.jobs {
            let identity = MobileApplicationPolicy.jobIdentity(job["url"]?.string ?? "")
            guard seenIncomingJobs.insert(identity).inserted else {
                message = "The backup contains duplicate saved links."; return false
            }
        }
        do {
            var next = state, imported = backup.draft.profile
            if imported.resumeData == nil { imported.removeResume() }
            else { imported.resumeChanged = true; imported.resumeRemoved = false }
            if replaceProfile { next.retainDraft(imported, basedOn: next.latestServerRevision ?? next.profileRevision) }
            var existing = Set(next.jobs.compactMap { $0["url"]?.string }.map(MobileApplicationPolicy.jobIdentity))
            for job in backup.draft.jobs where existing.insert(MobileApplicationPolicy.jobIdentity(job["url"]?.string ?? "")).inserted {
                var local = job.filter { ["url", "title", "company", "location", "country", "sourceName", "checkedAt"].contains($0.key) }
                local["id"] = .string("local-" + UUID().uuidString); local["localOnly"] = .bool(true); next.jobs.append(local)
            }
            // An already-loaded shortlist can take a profile or a repeated link. A new link past 200 is refused.
            guard next.jobs.count <= 200 || next.jobs.count <= state.jobs.count else {
                throw MobileApplicationError(message: "The merged shortlist exceeds 200 links. Nothing was replaced.")
            }
            try retainOpportunityDrafts(from: backup, into: &next)
            var importedIDs: [String: String] = [:]
            for original in backup.records {
                var record = original; record.scope = next.recordScope
                if let same = next.applicationRecords.first(where: { old in var comparable = old; comparable.id = record.id; return comparable == record }) {
                    importedIDs[original.id] = same.id; continue
                }
                if next.applicationRecords.contains(where: { $0.id == record.id }) { record.id = UUID().uuidString }
                importedIDs[original.id] = record.id; next.applicationRecords.append(record)
            }
            for original in backup.recordDrafts {
                var draft = original; draft.scope = next.recordScope
                if let id = draft.recordID, let replacement = importedIDs[id] { draft.recordID = replacement }
                retainDistinctDraft(draft, into: &next)
            }
            guard next.recordDrafts.count + next.recordDraftAlternatives.count <= 200 else {
                throw MobileApplicationError(message: "This phone already keeps 200 unfinished edits. Existing drafts were kept.")
            }
            // Restore only restrictive Stop intent; importing can never authorize dispatch.
            if !next.recordScope.isLocal && backup.draft.scope == next.recordScope {
                for hold in backup.submissionHolds { next.holdSubmissions([hold.planID]) }
            }
            if next == state {
                message = "Phone data imported. Review the profile before saving online. Saved links and record history were merged; no application was approved or sent."
                return true
            }
            try persist(next); plan = nil; selected = []; answers = [:]; mergeJobs()
            contentGeneration = UUID(); refreshTicket = nil
            message = "Phone data imported. Review the profile before saving online. Saved links and record history were merged; no application was approved or sent."
            return true
        } catch { message = error.localizedDescription; return false }
    }
    @discardableResult
    func clearWorkspaceOnPhone(context: PhoneWorkspaceActionContext) -> Bool {
        guard actionMatches(context) else { message = "The workspace changed. Review the clear action again."; return false }
        do {
            var next = state
            // Retain every Stop hold, including active service plans, across a deliberate local clear.
            if !next.recordScope.isLocal { next.holdSubmissions(activePlanIDs) }
            next.profile = PhoneApplicationProfile(); next.profileNeedsSync = false; next.profileRevision = nil
            next.latestServerRevision = nil; next.latestServerProfile = nil; next.jobs = []; next.opportunityDraft = PhoneOpportunityDraft()
            next.applicationRecords.removeAll { $0.scope == context.scope }
            next.recordDrafts.removeAll { $0.scope == context.scope }
            next.recordDraftAlternatives.removeAll { $0.scope == context.scope }
            next.recoveredOpportunityDrafts.removeAll { $0.scope == context.scope }
            next.workspaceDrafts.removeAll { $0.scope == context.scope }
            next.connectionEnabled = false; next.savedApplicationHistory = nil
            let account = state.tokenAccount, retired = client
            try persist(next)
            client = nil; connected = false; rotateConnection(); clearRemoteViews()
            do { try credentials.remove(account: account) }
            catch { message = "Phone data cleared and reconnect disabled. Secure token removal needs another attempt: " + error.localizedDescription; retired?.invalidate(); return true }
            if let retired { retireRemotely(retired, reportWhenDisconnected: false) }
            message = "This workspace's private phone data was cleared and its phone connection disabled. Other workspaces, exported files and employer/cloud records are unchanged. Stop holds were retained."
            return true
        } catch { message = error.localizedDescription; return false }
    }
    func exportReceipts() async -> URL? {
        guard let client, let operation = beginOperation() else { return nil }
        defer { finishOperation(operation) }
        let generation = sessionGeneration
        do {
            let value = try await client.request("receipts")
            guard generation == sessionGeneration else { return nil }
            let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let output = folder.appendingPathComponent("Career-Finder-Application-Receipts.json")
            #if os(iOS)
            try encoder.encode(value).write(to: output, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            #else
            try encoder.encode(value).write(to: output, options: [.atomic])
            #endif
            return output
        } catch { acceptError(error, generation: generation); return nil }
    }
}
#endif
