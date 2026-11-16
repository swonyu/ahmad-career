import Foundation

struct ApplicationServerProfile {
    let profile: PhoneApplicationProfile
    let revision: Int
    init(_ value: [String: ApplicationValue]) throws {
        guard let revision = value["revision"]?.integer, revision >= 0,
              ["firstName", "lastName", "email", "phone", "city", "country", "headline", "experienceLevel", "website"]
                .allSatisfy({ value[$0]?.string != nil }),
              ["skills", "targetRoles", "targetCountries", "workModes"].allSatisfy({ key in
                  if case .array(let items)? = value[key] { return items.allSatisfy { $0.string != nil } }; return false
              }), value["resume"] != nil else {
            throw MobileApplicationError(message: "The service returned an incomplete profile. Your phone draft is preserved.")
        }
        if value["resume"] != .null {
            guard case .object(let resume)? = value["resume"], let name = resume["name"]?.string,
                  !name.isEmpty, name.lowercased().hasSuffix(".pdf"), resume["mime"]?.string == "application/pdf",
                  let size = resume["size"]?.integer, (8...MobileApplicationPolicy.maximumResumeBytes).contains(size),
                  let hash = resume["sha256"]?.string, hash.range(of: "^[a-fA-F0-9]{64}$", options: .regularExpression) != nil else {
                throw MobileApplicationError(message: "The service returned incomplete CV metadata. Your current file choice is preserved.")
            }
        }
        var profile = PhoneApplicationProfile(); profile.updateFromServer(value)
        self.profile = profile; self.revision = revision
    }
}

struct ApplicationWorkspaceSnapshot {
    let profile: ApplicationServerProfile
    let jobs: [[String: ApplicationValue]]
    let attempts: [[String: ApplicationValue]]
    let recoverablePlans: [[String: ApplicationValue]]
    let activePlanIDs: [String]
    let mode: String
    let liveSubmissionEnabled: Bool?
    let requiresClientContinuation: Bool
    init(_ value: [String: ApplicationValue], workspaceID: String) throws {
        func invalid() -> MobileApplicationError {
            MobileApplicationError(message: "The service returned an incomplete workspace. Your current draft and application activity are preserved.")
        }
        func objects(_ key: String) throws -> [[String: ApplicationValue]] {
            guard case .array(let values)? = value[key] else { throw invalid() }
            return try values.map { value in
                guard case .object(let object) = value else { throw invalid() }
                return object
            }
        }
        guard value["ok"]?.bool == true, !workspaceID.isEmpty, value["workspaceId"]?.string == workspaceID,
              case .object(let profile)? = value["profile"], case .array(let active)? = value["activePlanIds"],
              active.allSatisfy({ !($0.string?.isEmpty ?? true) }), let mode = value["mode"]?.string, !mode.isEmpty else { throw invalid() }
        var continuation: String?
        var liveEnabled: Bool?
        if let capabilities = value["capabilities"] {
            guard case .object(let fields) = capabilities else { throw invalid() }
            if let declared = fields["liveEnabled"] {
                guard case .bool(let enabled) = declared else { throw invalid() }
                liveEnabled = enabled
            }
            if let declared = fields["dispatchContinuation"] {
                guard let name = declared.string else { throw invalid() }
                continuation = name
            }
        }
        let jobs = try objects("jobs"), attempts = try objects("attempts"), plans = try objects("recoverablePlans")
        guard jobs.allSatisfy({ !($0["id"]?.string?.isEmpty ?? true) && $0["url"]?.string != nil
                    && $0["title"]?.string != nil && $0["company"]?.string != nil }),
              attempts.allSatisfy({ !($0["id"]?.string?.isEmpty ?? $0["attemptId"]?.string?.isEmpty ?? true) && $0["state"]?.string != nil }),
              plans.allSatisfy({ plan in
                  guard ApplicationReviewSummary(plan) != nil, plan["profileRevision"]?.integer != nil,
                        ApplicationReviewPolicy.date(plan["expiresAt"]?.string) != nil,
                        case .array(let items)? = plan["items"] else { return false }
                  return items.allSatisfy { if case .object(let item) = $0 { return item["jobId"]?.string != nil && item["state"]?.string != nil }; return false }
              }) else { throw invalid() }
        self.profile = try ApplicationServerProfile(profile); self.jobs = jobs; self.attempts = attempts
        recoverablePlans = plans; activePlanIDs = active.compactMap(\.string); self.mode = mode
        liveSubmissionEnabled = liveEnabled
        requiresClientContinuation = continuation == "client"
    }
}

struct PhoneOpportunityDraft: Codable, Equatable {
    var url = ""
    var title = ""
    var company = ""
    var location = ""
    var country = ""
    var hasContent: Bool { [url, title, company, location, country].contains { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } }
    var storageError: String? {
        guard url.count <= 4_096, title.count <= 300, company.count <= 300, location.count <= 300, country.count <= 2 else {
            return "Keep the link under 4,096 characters and each opportunity detail under 300 characters."
        }
        return nil
    }
}

/// The draft's base revision is deliberately independent of the latest server revision.
/// Old files without a revision migrate to an unknown base, which requires an explicit conflict choice.
struct PhoneApplicationState: Codable {
    var profile = PhoneApplicationProfile()
    var profileNeedsSync = false
    var jobs: [[String: ApplicationValue]] = []
    var opportunityDraft = PhoneOpportunityDraft()
    var serviceAddress = ""
    var workspaceID = ""
    var profileRevision: Int?
    var latestServerRevision: Int?
    var latestServerProfile: PhoneApplicationProfile?
    var connectionEnabled = false
    var credentialAccount: String?

    init() {}
    private enum CodingKeys: String, CodingKey {
        case profile, profileNeedsSync, jobs, opportunityDraft, serviceAddress, workspaceID, profileRevision
        case latestServerRevision, latestServerProfile, connectionEnabled, credentialAccount
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        profile = try c.decode(PhoneApplicationProfile.self, forKey: .profile)
        profileNeedsSync = try c.decodeIfPresent(Bool.self, forKey: .profileNeedsSync) ?? false
        jobs = try c.decodeIfPresent([[String: ApplicationValue]].self, forKey: .jobs) ?? []
        opportunityDraft = try c.decodeIfPresent(PhoneOpportunityDraft.self, forKey: .opportunityDraft) ?? PhoneOpportunityDraft()
        serviceAddress = try c.decodeIfPresent(String.self, forKey: .serviceAddress) ?? ""
        workspaceID = try c.decodeIfPresent(String.self, forKey: .workspaceID) ?? ""
        profileRevision = try c.decodeIfPresent(Int.self, forKey: .profileRevision)
        latestServerRevision = try c.decodeIfPresent(Int.self, forKey: .latestServerRevision)
        latestServerProfile = try c.decodeIfPresent(PhoneApplicationProfile.self, forKey: .latestServerProfile)
        connectionEnabled = try c.decodeIfPresent(Bool.self, forKey: .connectionEnabled) ?? !serviceAddress.isEmpty
        credentialAccount = try c.decodeIfPresent(String.self, forKey: .credentialAccount)
    }
    var tokenAccount: String { credentialAccount ?? serviceAddress }
    var hasProfileConflict: Bool {
        profileNeedsSync && latestServerRevision != nil && profileRevision != latestServerRevision
    }
    mutating func retainDraft(_ draft: PhoneApplicationProfile, basedOn revision: Int?) {
        profile = draft; profileRevision = revision; profileNeedsSync = true
    }
    mutating func receive(_ server: ApplicationServerProfile) {
        if let latestServerRevision, server.revision < latestServerRevision { return }
        latestServerRevision = server.revision; latestServerProfile = server.profile
        if !profileNeedsSync { acknowledge(server) }
    }
    mutating func acknowledge(_ server: ApplicationServerProfile) {
        if let latestServerRevision, server.revision < latestServerRevision { return }
        profile = server.profile; profileRevision = server.revision; profileNeedsSync = false
        latestServerRevision = server.revision; latestServerProfile = server.profile
    }
    mutating func connect(address: String, workspace: String, account: String, server: ApplicationServerProfile) {
        let same = workspaceID == workspace && MobileApplicationPolicy.serviceURL(serviceAddress)?.absoluteString == address
        if !same {
            latestServerRevision = nil; latestServerProfile = nil
            if profileNeedsSync || profile.hasContent {
                // Metadata from another workspace cannot silently select that workspace's CV.
                if profile.resumeData == nil { profile.removeResume() }
                else { profile.resumeChanged = true; profile.resumeRemoved = false }
                profileNeedsSync = true; profileRevision = server.revision
            } else { acknowledge(server) }
        }
        serviceAddress = address; workspaceID = workspace; credentialAccount = account; connectionEnabled = true
        receive(server)
    }
    mutating func useLatestProfile() -> Bool {
        guard let latestServerProfile, let latestServerRevision else { return false }
        profile = latestServerProfile; profileRevision = latestServerRevision; profileNeedsSync = false
        return true
    }
    mutating func keepDraft(afterReviewing revision: Int) -> Bool {
        guard profileNeedsSync, latestServerRevision == revision, let latestServerProfile else { return false }
        if !profile.resumeChanged && !profile.resumeRemoved { profile.adoptResumeMetadata(from: latestServerProfile) }
        profileRevision = revision
        return true
    }
}

struct ApplicationProfileEditContext: Equatable {
    let serviceAddress: String
    let workspaceID: String
    let revision: Int?
    func matches(_ state: PhoneApplicationState) -> Bool {
        workspaceID == state.workspaceID && MobileApplicationPolicy.serviceURL(serviceAddress)?.absoluteString
            == MobileApplicationPolicy.serviceURL(state.serviceAddress)?.absoluteString
    }
}

struct ApplicationJobMerge {
    let jobs: [[String: ApplicationValue]]
    let selected: Set<String>
    let answers: [String: [String: ApplicationValue]]
    init(remote: [[String: ApplicationValue]], local: [[String: ApplicationValue]],
         selected: Set<String>, answers: [String: [String: ApplicationValue]]) {
        var byIdentity: [String: String] = [:]
        for job in remote {
            if let id = job["id"]?.string, let url = job["url"]?.string { byIdentity[MobileApplicationPolicy.jobIdentity(url)] = id }
        }
        var ids = selected; var mappedAnswers = answers
        for job in local {
            guard let old = job["id"]?.string, let url = job["url"]?.string,
                  let replacement = byIdentity[MobileApplicationPolicy.jobIdentity(url)], old != replacement else { continue }
            if ids.remove(old) != nil { ids.insert(replacement) }
            if mappedAnswers[replacement] == nil, let value = mappedAnswers[old] { mappedAnswers[replacement] = value }
        }
        jobs = remote + local.filter { byIdentity[MobileApplicationPolicy.jobIdentity($0["url"]?.string ?? "")] == nil }
        ids.formIntersection(Set(jobs.compactMap { $0["id"]?.string }))
        self.selected = ids; self.answers = mappedAnswers
    }
}

struct ApplicationReviewSummary: Identifiable {
    let value: [String: ApplicationValue]
    let id: String
    init?(_ value: [String: ApplicationValue]) {
        guard let id = value["id"]?.string, !id.isEmpty, value["digest"]?.string != nil else { return nil }
        self.value = value; self.id = id
    }
    var items: [[String: ApplicationValue]] { value["items"]?.array.map(\.object) ?? [] }
    var title: String { items.first?["job"]?.object["title"]?.string ?? "Application review" }
}

enum ApplicationReviewPolicy {
    static func date(_ value: String?) -> Date? {
        guard let value else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }
    static func eligible(_ item: [String: ApplicationValue], at now: Date = Date()) -> Bool {
        if item["state"]?.string == "ready" { return true }
        return item["state"]?.string == "rate_limited" && (date(item["retryAt"]?.string).map { $0 <= now } ?? false)
    }
    static func current(_ plan: [String: ApplicationValue], revision: Int?, at now: Date = Date()) -> Bool {
        !plan["stopped", default: .bool(false)].bool && revision != nil && plan["profileRevision"]?.integer == revision
            && (date(plan["expiresAt"]?.string).map { $0 > now } ?? false)
    }
}
