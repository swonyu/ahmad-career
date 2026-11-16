#if os(iOS)
import Foundation
import SwiftUI
import Security

@MainActor
final class NativeApplicationsStore: ObservableObject {
    @Published var profile = PhoneApplicationProfile()
    @Published var jobs: [[String: ApplicationValue]] = []
    @Published var attempts: [[String: ApplicationValue]] = []
    @Published var plan: [String: ApplicationValue]?
    @Published var activePlanIDs: [String] = []
    @Published var recoverablePlans: [[String: ApplicationValue]] = []
    @Published var connected = false
    @Published var busy = false
    @Published var message: String?
    @Published var profileNeedsSync = false
    @Published var mode = "local"
    @Published var selected = Set<String>()
    @Published var serviceAddress = ""
    @Published var answers: [String: [String: ApplicationValue]] = [:]
    @Published private(set) var revision = 0
    private var client: MobileApplicationClient?
    private var storageReadable = true
    private var workspaceID = ""
    private var refreshRunning = false
    private var localJobs: [[String: ApplicationValue]] = []
    private var remoteJobs: [[String: ApplicationValue]] = []
    private let folder: URL
    private let keychainService = "CareerFinder.VerifiedApplications"
    private struct LocalState: Codable {
        var profile: PhoneApplicationProfile
        var profileNeedsSync: Bool
        var jobs: [[String: ApplicationValue]]
        var serviceAddress: String
        var workspaceID: String?
    }

    init() {
        folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("VerifiedApplications", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true,
                                                   attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
            let path = folder.appendingPathComponent("phone-draft.json")
            if FileManager.default.fileExists(atPath: path.path) {
                let saved = try JSONDecoder().decode(LocalState.self, from: Data(contentsOf: path))
                profile = saved.profile; profileNeedsSync = saved.profileNeedsSync
                localJobs = saved.jobs; jobs = saved.jobs; serviceAddress = saved.serviceAddress
                workspaceID = saved.workspaceID ?? ""
            }
            if let url = MobileApplicationPolicy.serviceURL(serviceAddress), let token = loadToken() {
                client = try MobileApplicationClient(origin: url, token: token)
                connected = true
            }
        } catch {
            storageReadable = false
            message = "Your saved application draft could not be read. It has been preserved. Avoid replacing it until it can be recovered."
        }
    }
    private func saveLocal() throws {
        guard storageReadable else {
            throw MobileApplicationError(message: "The existing phone draft could not be read. It is preserved and cannot be overwritten.")
        }
        let value = LocalState(profile: profile, profileNeedsSync: profileNeedsSync, jobs: localJobs, serviceAddress: serviceAddress, workspaceID: workspaceID)
        try JSONEncoder().encode(value).write(to: folder.appendingPathComponent("phone-draft.json"),
                                             options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    private func loadToken() -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                   kSecAttrService as String: keychainService,
                                   kSecAttrAccount as String: serviceAddress,
                                   kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    private func saveToken(_ token: String, account: String) throws {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                   kSecAttrService as String: keychainService, kSecAttrAccount as String: account]
        let update: [String: Any] = [kSecValueData as String: Data(token.utf8),
                                    kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        var status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            status = SecItemAdd(query.merging(update) { _, new in new } as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw MobileApplicationError(message: "The secure connection could not be saved on this phone.") }
    }
    func connect(address: String, code: String) async -> Bool {
        guard !busy, let origin = MobileApplicationPolicy.serviceURL(address) else {
            message = "Enter the HTTPS address provided with your application-service invitation."
            return false
        }
        busy = true; defer { busy = false }
        do {
            let candidate = try MobileApplicationClient(origin: origin)
            let response = try await candidate.request("session", method: "POST", body: ["pairingCode": .string(code.trimmingCharacters(in: .whitespacesAndNewlines))])
            guard let token = response["sessionToken"]?.string, !token.isEmpty else {
                throw MobileApplicationError(message: "The connection was not confirmed. Request a new invitation code.")
            }
            try saveToken(token, account: origin.absoluteString)
            serviceAddress = origin.absoluteString; candidate.token = token
            client = candidate; connected = true
            // A saved phone draft is never silently sent to a newly connected service.
            let newWorkspace = response["workspaceId"]?.string ?? ""
            if newWorkspace != workspaceID && profile.resumeData == nil { profile.resumeName = ""; profile.resumeChanged = false; profile.resumeRemoved = false }
            workspaceID = newWorkspace
            let localFields = [profile.firstName, profile.lastName, profile.email, profile.phone, profile.city, profile.country,
                               profile.headline, profile.skills, profile.targetRoles, profile.targetCountries, profile.website]
            profileNeedsSync = profileNeedsSync || localFields.contains { !$0.isEmpty } || profile.resumeData != nil
            try saveLocal()
            await refresh()
            message = profileNeedsSync ? "Connected. Review and save your application details before applying." : "Your application workspace is connected."
            return true
        } catch { message = error.localizedDescription; return false }
    }
    func disconnect() async {
        guard !busy else { return }
        busy = true; defer { busy = false }
        do {
            if let client { _ = try await client.request("session/revoke", method: "POST", body: [:]) }
        } catch {
            message = "The service could not revoke this phone connection. \(error.localizedDescription)"
            return
        }
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                   kSecAttrService as String: keychainService, kSecAttrAccount as String: serviceAddress]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            message = "The secure connection could not be removed. Please try again."
            return
        }
        client = nil; connected = false; remoteJobs = []; jobs = localJobs
        attempts = []; plan = nil; activePlanIDs = []; recoverablePlans = []; selected = []
        message = "Disconnected on this phone. Existing submissions remain with the application service."
    }
    func refresh() async {
        guard let client, !refreshRunning else { return }
        refreshRunning = true; defer { refreshRunning = false }
        do {
            let value = try await client.request("workspace")
            let remoteProfile = value["profile"]?.object ?? [:]
            revision = remoteProfile["revision"]?.int ?? 0
            if !profileNeedsSync { profile.updateFromServer(remoteProfile) }
            remoteJobs = value["jobs"]?.array.map(\.object) ?? []
            attempts = value["attempts"]?.array.map(\.object) ?? []
            activePlanIDs = value["activePlanIds"]?.array.compactMap(\.string) ?? []
            recoverablePlans = value["recoverablePlans"]?.array.map(\.object) ?? []
            mode = value["mode"]?.string ?? value["capabilities"]?.object["mode"]?.string ?? "local"
            jobs = remoteJobs + localJobs.filter { local in
                !remoteJobs.contains { MobileApplicationPolicy.jobIdentity($0["url"]?.string ?? "") == MobileApplicationPolicy.jobIdentity(local["url"]?.string ?? "") }
            }
            selected.formIntersection(Set(jobs.compactMap { $0["id"]?.string }))
            try saveLocal()
        } catch { message = error.localizedDescription }
    }
    func saveProfile(_ draft: PhoneApplicationProfile, expectedRevision: Int) async -> Bool {
        guard !busy else { return false }
        busy = true; defer { busy = false }
        do {
            let old = profile
            profile = draft; profileNeedsSync = true
            do { try saveLocal() } catch { profile = old; throw error }
            guard let client else {
                message = "Your application details are saved on this phone."
                return true
            }
            let saved = try await client.request("profile", method: "PUT",
                                        body: ["expectedRevision": .number(Double(expectedRevision)), "profile": .object(draft.payload())])
            revision = saved["profile"]?.object["revision"]?.int ?? revision
            profileNeedsSync = false; plan = nil
            await refresh()
            message = "Application details saved. Review each application before sending."
            return true
        } catch {
            message = "Your phone draft is kept. \(error.localizedDescription)"
            return false
        }
    }
    func addJob(url: String, title: String, company: String, location: String, country: String) async -> Bool {
        guard !busy, let valid = MobileApplicationPolicy.jobURL(url) else {
            message = "Use a complete public HTTPS job link."
            return false
        }
        busy = true; defer { busy = false }
        var fields: [String: ApplicationValue] = ["url": .string(valid.absoluteString)]
        for (key, value) in [("title", title), ("company", company), ("location", location), ("country", country.uppercased())] where !value.isEmpty {
            fields[key] = .string(value)
        }
        do {
            if let client {
                _ = try await client.request("jobs", method: "POST", body: fields)
                await refresh()
            } else {
                guard !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                      !company.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    throw MobileApplicationError(message: "Add the role and employer so you can recognize this opportunity offline.")
                }
                guard !localJobs.contains(where: {
                    MobileApplicationPolicy.jobIdentity($0["url"]?.string ?? "") == MobileApplicationPolicy.jobIdentity(valid.absoluteString)
                }) else {
                    throw MobileApplicationError(message: "This opportunity is already in your workspace.")
                }
                fields["id"] = .string("local-" + UUID().uuidString)
                fields["localOnly"] = .bool(true)
                localJobs.append(fields)
                do { try saveLocal() } catch { localJobs.removeLast(); throw error }
                jobs = remoteJobs + localJobs
            }
            message = "Opportunity saved."
            return true
        } catch { message = error.localizedDescription; return false }
    }
    func prepare(manualAppliedURLs: Set<String> = []) async {
        guard !busy, let client else { message = "Connect your application service to review automatic submissions."; return }
        guard !profileNeedsSync else { message = "Save your current application details before preparing applications."; return }
        guard !selected.isEmpty else { message = "Select the opportunities you want to review."; return }
        busy = true; defer { busy = false }
        do {
            var ids: [String] = []
            var manualIDs: [String] = []
            var mappedAnswers: [String: ApplicationValue] = [:]
            let manualIdentities = Set(manualAppliedURLs.map(MobileApplicationPolicy.jobIdentity))
            for job in jobs where selected.contains(job["id"]?.string ?? "") {
                var id = job["id"]?.string ?? ""
                if job["localOnly"]?.bool == true {
                    let fields = job.filter { ["url", "title", "company", "location", "country"].contains($0.key) }
                    let result = try await client.request("jobs", method: "POST", body: fields)
                    let imported = result["job"]?.object ?? [:]
                    guard let savedID = imported["id"]?.string else { throw MobileApplicationError(message: "An opportunity could not be synchronized. No application was sent.") }
                    id = savedID
                }
                ids.append(id)
                if let answer = answers[id] ?? answers[job["id"]?.string ?? ""] { mappedAnswers[id] = .object(answer) }
                if manualIdentities.contains(MobileApplicationPolicy.jobIdentity(job["url"]?.string ?? "")) { manualIDs.append(id) }
            }
            let value = try await client.request("prepare", method: "POST", body: [
                "jobIds": .array(ids.map(ApplicationValue.string)),
                "answers": .object(mappedAnswers),
                "manualAppliedJobIds": .array(manualIDs.map(ApplicationValue.string))
            ])
            guard let prepared = value["plan"]?.object, prepared["id"]?.string != nil, prepared["digest"]?.string != nil else {
                throw MobileApplicationError(message: "The application review could not be prepared.")
            }
            plan = prepared
            await refresh()
            selected = Set(ids)
        } catch { message = error.localizedDescription }
    }
    func submitReviewed() async {
        guard !profileNeedsSync else { message = "Save your current application details before approving a submission."; return }
        guard !busy, let client, let plan, let id = plan["id"]?.string, let digest = plan["digest"]?.string else { return }
        busy = true; defer { busy = false }
        do {
            _ = try await client.request("submit", method: "POST", body: ["planId": .string(id), "digest": .string(digest), "approved": .bool(true)])
            self.plan = nil
            message = "Your approved applications are processing. Confirmed receipts will appear here."
        } catch {
            // A lost response does not mean the server failed to start. Never repeat this POST automatically.
            self.plan = nil
            message = "Checking the result before any further submission. \(error.localizedDescription)"
        }
        await refresh()
    }
    func stop() async {
        guard let client, !busy else { return }
        busy = true; defer { busy = false }
        do {
            for id in activePlanIDs {
                _ = try await client.request("stop", method: "POST", body: ["planId": .string(id)])
            }
            await refresh()
            message = "Unsent applications were stopped. Applications already sending will keep their actual result."
        } catch { message = error.localizedDescription }
    }
    @discardableResult
    func resumeReview(_ review: [String: ApplicationValue]) -> Bool {
        guard !profileNeedsSync else { message = "Save your current application details before continuing a review."; return false }
        plan = review
        for item in review["items"]?.array.map(\.object) ?? [] {
            guard let id = item["jobId"]?.string else { continue }
            answers[id] = (item["payloadSummary"]?.object ?? [:]).filter { ["comments", "consentStore", "consentMarketing"].contains($0.key) }
        }
        selected = Set(review["items"]?.array.compactMap { $0.object["jobId"]?.string } ?? [])
        return true
    }
    func stopReview(_ id: String) async {
        guard let client, !busy else { return }
        busy = true; defer { busy = false }
        do {
            _ = try await client.request("stop", method: "POST", body: ["planId": .string(id)])
            plan = nil
            await refresh()
            message = "This review was stopped. Provider cooldowns still apply to rejected attempts."
        } catch { message = error.localizedDescription }
    }
    func exportReceipts() async -> URL? {
        guard let client else { return nil }
        do {
            let value = try await client.request("receipts")
            let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let output = folder.appendingPathComponent("Career-Finder-Application-Receipts.json")
            try encoder.encode(value).write(to: output, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            return output
        } catch { message = error.localizedDescription; return nil }
    }
}
#endif
