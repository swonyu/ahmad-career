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
    @Published private(set) var plan: [String: ApplicationValue]?
    @Published private(set) var activePlanIDs: [String] = []
    @Published private(set) var recoverablePlans: [[String: ApplicationValue]] = []
    @Published private(set) var connected = false
    @Published private(set) var busy = false
    @Published var message: String?
    @Published private(set) var mode = "local"
    @Published private(set) var requiresClientContinuation = false
    @Published private(set) var advancingApprovedApplication = false
    @Published var selected = Set<String>()
    @Published var answers: [String: [String: ApplicationValue]] = [:]
    @Published var profileEditing = false
    private var client: (any MobileApplicationServing)?
    private var storageReadable = true
    private var sessionGeneration = UUID()
    private var contentGeneration = UUID()
    private var refreshTicket: UUID?
    private var operationTicket: UUID?
    private var continuationTicket: UUID?
    private var nextContinuationTime: TimeInterval = 0
    private var remoteJobs: [[String: ApplicationValue]] = []
    private let folder: URL
    private let credentials: any ApplicationTokenStore
    private let clientFactory: ClientFactory
    private let monotonicTime: () -> TimeInterval

    var profile: PhoneApplicationProfile { state.profile }
    var profileNeedsSync: Bool { state.profileNeedsSync }
    var revision: Int? { state.profileRevision }
    var latestServerRevision: Int? { state.latestServerRevision }
    var latestServerProfile: PhoneApplicationProfile? { state.latestServerProfile }
    var profileHasConflict: Bool { state.hasProfileConflict }
    var serviceAddress: String { state.serviceAddress }
    var connectionSetupAddress: String { MobileApplicationPolicy.connectionSetupAddress(state.serviceAddress) }
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
                state = try JSONDecoder().decode(PhoneApplicationState.self, from: Data(contentsOf: path))
            }
            jobs = state.jobs
        } catch {
            storageReadable = false
            message = "Your saved application draft could not be read. It has been preserved and will not be overwritten."
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
        let data = try JSONEncoder().encode(next)
        #if os(iOS)
        try data.write(to: folder.appendingPathComponent("phone-draft.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: folder.appendingPathComponent("phone-draft.json"), options: [.atomic])
        #endif
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
        activePlanIDs = []; recoverablePlans = []; selected = []; answers = [:]; mode = "local"
        requiresClientContinuation = false
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
                activePlanIDs = []; recoverablePlans = []; plan = nil; requiresClientContinuation = false
            }
            message = error.localizedDescription
        }
    }
    @discardableResult
    private func detachLocally() -> (any MobileApplicationServing)? {
        let retired = client
        client = nil; connected = false; rotateConnection()
        var next = state; next.connectionEnabled = false
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
            var next = state; next.receive(server); try persist(next)
            remoteJobs = snapshot.jobs; attempts = snapshot.attempts
            activePlanIDs = snapshot.activePlanIDs; recoverablePlans = snapshot.recoverablePlans; mode = snapshot.mode
            requiresClientContinuation = snapshot.requiresClientContinuation
            mergeJobs()
            if let id = plan?["id"]?.string {
                if !profileNeedsSync, let current = recoverablePlans.first(where: { $0["id"]?.string == id }),
                   ApplicationReviewPolicy.current(current, revision: revision) { plan = current }
                else { plan = nil }
            }
            return true
        } catch {
            if content == contentGeneration { acceptError(error, generation: generation) }
            return false
        }
    }
    /// Only a fresh authenticated workspace can authorize continuation of an already approved queue.
    /// This endpoint cannot approve a review, and its response never creates a local receipt.
    func pollApprovedApplications() async {
        guard !Task.isCancelled, continuationTicket == nil, await refresh() else { return }
        guard !Task.isCancelled, !busy, requiresClientContinuation,
              monotonicTime() >= nextContinuationTime, let id = activePlanIDs.first,
              let client else { return }
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
            if draft.resumeChanged, !draft.resumeRemoved {
                guard let data = draft.resumeData else { throw MobileApplicationError(message: "Choose your PDF again before saving this draft.") }
                if let error = MobileApplicationPolicy.resumeError(data, filename: draft.resumeName) { throw MobileApplicationError(message: error) }
            }
            var next = state; next.retainDraft(draft, basedOn: context.revision)
            try persist(next); plan = nil
            guard let client else { message = "Your application draft is saved on this phone."; return true }
            guard let expected = context.revision, !hasConflict(for: context) else {
                throw MobileApplicationError(message: "Your phone draft is kept. Compare the latest service profile and choose which version to keep.")
            }
            let saved = try await client.request("profile", method: "PUT",
                body: ["expectedRevision": .number(Double(expected)), "profile": .object(draft.payload())])
            guard generation == sessionGeneration else { return false }
            let server = try ApplicationServerProfile(saved["profile"]?.object ?? [:])
            guard server.revision == expected + 1 else {
                throw MobileApplicationError(message: "The service did not confirm the expected profile version. Your phone draft is kept.")
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
        var next = state
        var backup = imported.filter { ["url", "title", "company", "location", "country", "provider", "workMode"].contains($0.key) }
        backup["id"] = .string(localID); backup["localOnly"] = .bool(true)
        next.jobs[index] = backup; try persist(next)
    }
    func addJob(url: String, title: String, company: String, location: String, country: String) async -> Bool {
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
            let lever = ["jobs.lever.co", "jobs.eu.lever.co"].contains(valid.host?.lowercased() ?? "")
            if client == nil || !lever {
                guard fields["title"]?.string != nil, fields["company"]?.string != nil else {
                    throw MobileApplicationError(message: "Add the role and employer so you can recognize this opportunity offline.")
                }
            }
            let localID = "local-" + UUID().uuidString
            var local = fields; local["id"] = .string(localID); local["localOnly"] = .bool(true)
            var next = state; next.jobs.append(local); try persist(next); mergeJobs()
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
        guard !busy, state.jobs.contains(where: { $0["id"]?.string == id }),
              jobs.first(where: { $0["id"]?.string == id })?["localOnly"]?.bool == true else { return }
        do {
            var next = state; next.jobs.removeAll { $0["id"]?.string == id }; try persist(next)
            selected.remove(id); answers.removeValue(forKey: id); mergeJobs()
        } catch { message = error.localizedDescription }
    }
    func prepare(manualAppliedURLs: Set<String> = [], replacingUnapprovedReview: Bool = false) async {
        guard let client else { message = "Connect your application service to review automatic submissions."; return }
        guard !profileNeedsSync, !profileEditing else { message = "Save or close your profile draft before preparing applications."; return }
        guard !selected.isEmpty, let operation = beginOperation() else { message = "Select the opportunities you want to review."; return }
        defer { finishOperation(operation) }
        let generation = sessionGeneration
        let previousPlan = plan
        let chosen = jobs.filter { selected.contains($0["id"]?.string ?? "") }
        let chosenAnswers = answers, chosenSelection = selected, chosenProfile = profile, chosenRevision = revision
        func inputsAreCurrent() -> Bool {
            generation == sessionGeneration && chosenAnswers == answers && chosenSelection == selected
                && chosenProfile == profile && chosenRevision == revision && !profileNeedsSync && !profileEditing
        }
        do {
            if replacingUnapprovedReview {
                guard let previousPlan, previousPlan["approvedAt"]?.string == nil,
                      let previousID = previousPlan["id"]?.string,
                      ApplicationReviewPolicy.current(previousPlan, revision: revision),
                      previousPlan["items"]?.array.allSatisfy({ ["ready", "blocked"].contains($0.object["state"]?.string ?? "") }) == true else {
                    throw MobileApplicationError(message: "This review has already started or changed. Stop it explicitly before creating a different review.")
                }
                _ = try await client.request("stop", method: "POST", body: ["planId": .string(previousID), "onlyIfUnapproved": .bool(true)])
                guard generation == sessionGeneration else { return }
            }
            plan = nil
            var ids: [String] = []; var manualIDs: [String] = []
            var mappedAnswers: [String: ApplicationValue] = [:]
            let manualIdentities = Set(manualAppliedURLs.map(MobileApplicationPolicy.jobIdentity))
            for job in chosen {
                var id = job["id"]?.string ?? ""
                if job["localOnly"]?.bool == true {
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
            let value = try await client.request("prepare", method: "POST", body: [
                "jobIds": .array(ids.map(ApplicationValue.string)), "answers": .object(mappedAnswers),
                "manualAppliedJobIds": .array(manualIDs.map(ApplicationValue.string))
            ])
            guard generation == sessionGeneration else { return }
            guard inputsAreCurrent() else {
                if let obsoleteID = value["plan"]?.object["id"]?.string {
                    _ = try? await client.request("stop", method: "POST", body: ["planId": .string(obsoleteID), "onlyIfUnapproved": .bool(true)])
                }
                guard generation == sessionGeneration else { return }
                plan = nil; message = "Your choices changed. The older review will not be approved; prepare your current selection again."
                finishOperation(operation); await refresh()
                return
            }
            guard let prepared = value["plan"]?.object, prepared["id"]?.string != nil, prepared["digest"]?.string != nil,
                  ApplicationReviewPolicy.current(prepared, revision: revision) else {
                throw MobileApplicationError(message: "The application review could not be prepared with your current profile.")
            }
            plan = prepared; selected = Set(ids)
            finishOperation(operation); await refresh()
        } catch {
            acceptError(error, generation: generation)
            finishOperation(operation)
            if (error as? MobileApplicationError)?.statusCode == 409 { await refresh() }
        }
    }
    @discardableResult
    func submitReviewed() async -> Bool {
        guard !profileNeedsSync, !profileEditing else { message = "Save your current application details before approving a submission."; return false }
        guard let client, let plan, ApplicationReviewPolicy.current(plan, revision: revision),
              let id = plan["id"]?.string, let digest = plan["digest"]?.string,
              plan["items"]?.array.contains(where: { ApplicationReviewPolicy.eligible($0.object) }) == true,
              let operation = beginOperation() else { message = "Refresh this review before approving it."; return false }
        defer { finishOperation(operation) }
        let generation = sessionGeneration
        do {
            _ = try await client.request("submit", method: "POST", body: ["planId": .string(id), "digest": .string(digest), "approved": .bool(true)])
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
        guard let client, let operation = beginOperation() else { return }
        defer { finishOperation(operation) }
        let generation = sessionGeneration, ids = activePlanIDs
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
        guard !busy, !profileNeedsSync, !profileEditing else { message = "Save or close your profile draft before continuing a review."; return false }
        guard let id = review["id"]?.string,
              let current = recoverablePlans.first(where: { $0["id"]?.string == id && $0["digest"] == review["digest"] }),
              ApplicationReviewPolicy.current(current, revision: revision) else {
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
        guard let client, let operation = beginOperation() else { return }
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
