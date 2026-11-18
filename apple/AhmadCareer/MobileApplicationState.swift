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
        if let linkedin = value["linkedin"] {
            guard let text = linkedin.string, text.isEmpty || MobileApplicationPolicy.linkedInProfileURL(text) != nil else {
                throw MobileApplicationError(message: "The service returned an invalid LinkedIn profile link. Your phone draft is preserved.")
            }
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
    let linkedInProfileSupported: Bool?
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
        var linkedInSupported: Bool?
        if let capabilities = value["capabilities"] {
            guard case .object(let fields) = capabilities else { throw invalid() }
            if let declared = fields["liveEnabled"] {
                guard case .bool(let enabled) = declared else { throw invalid() }
                liveEnabled = enabled
            }
            if let declared = fields["linkedinProfile"] {
                guard case .bool(let supported) = declared else { throw invalid() }
                linkedInSupported = supported
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
        linkedInProfileSupported = linkedInSupported
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
        guard url.count <= 4_096, title.count <= 500, company.count <= 500, location.count <= 500, country.count <= 2 else {
            return "Keep the link under 4,096 characters and each opportunity detail under 500 characters."
        }
        return nil
    }
}

enum PhoneApplicationStage: String, Codable, CaseIterable, Identifiable {
    case saved, applied, interview, offer, closed
    var id: String { rawValue }
    var title: String {
        switch self {
        case .saved: return "Saved for later"
        case .applied: return "Applied"
        case .interview: return "Interview"
        case .offer: return "Offer"
        case .closed: return "Closed"
        }
    }
    var marksApplied: Bool { [.applied, .interview, .offer].contains(self) }
}

/// An application date is a civil day, not a timestamp that changes with the display time zone.
enum PhoneRecordDay {
    static func calendar(zone: TimeZone = .current) -> Calendar {
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = zone
        return calendar
    }
    static func date(_ value: String, zone: TimeZone = .current) -> Date? {
        guard value.range(of: #"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"#, options: .regularExpression) != nil else { return nil }
        let parts = value.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, parts[0] >= 1, (1...12).contains(parts[1]) else { return nil }
        let leap = parts[0] % 4 == 0 && (parts[0] % 100 != 0 || parts[0] % 400 == 0)
        let days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        guard (1...days[parts[1] - 1]).contains(parts[2]) else { return nil }
        let calendar = calendar(zone: zone)
        guard let date = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12)),
              string(date, zone: zone) == value else { return nil }
        return date
    }
    static func valid(_ value: String) -> Bool { value.isEmpty || date(value, zone: TimeZone(secondsFromGMT: 0)!) != nil }
    static func string(_ date: Date, zone: TimeZone = .current) -> String {
        let parts = calendar(zone: zone).dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }
}

struct PhoneRecordScope: Codable, Equatable {
    var origin = ""
    var workspaceID = ""
    var isLocal: Bool { origin.isEmpty && workspaceID.isEmpty }
    var valid: Bool {
        isLocal || (!workspaceID.isEmpty && workspaceID.utf16.count <= 256
            && !workspaceID.unicodeScalars.contains { CharacterSet.controlCharacters.contains($0) }
            && MobileApplicationPolicy.serviceURL(origin)?.absoluteString == origin)
    }
}

/// A parked unfinished opportunity. Scope stops it appearing in another workspace.
struct PhoneRecoveredOpportunity: Codable, Equatable {
    var scope: PhoneRecordScope
    var draft: PhoneOpportunityDraft
    var valid: Bool { scope.valid && draft.hasContent && draft.storageError == nil }
}

struct PhoneRecordJob: Codable, Equatable {
    var url: String
    var title: String
    var company: String
    var location: String
    var country: String
    init(_ job: [String: ApplicationValue]) {
        url = job["url"]?.string ?? ""
        title = String((job["title"]?.string ?? "Opportunity").prefix(500))
        company = String((job["company"]?.string ?? "").prefix(500))
        location = String((job["location"]?.string ?? "").prefix(500))
        country = String((job["country"]?.string ?? "").prefix(2))
    }
    var identity: String { MobileApplicationPolicy.jobIdentity(url) }
    var valid: Bool {
        MobileApplicationPolicy.jobURL(url) != nil && url.utf16.count <= 4_096
            && [title, company, location].allSatisfy { $0.count <= 500 }
            && country.count <= 2
    }
    func applicationJob(id: String) -> [String: ApplicationValue] {
        ["id": .string(id), "url": .string(url), "title": .string(title), "company": .string(company),
         "location": .string(location), "country": .string(country), "recordOnly": .bool(true)]
    }
}

struct PhoneOpportunityRecord: Codable, Equatable, Identifiable {
    var id = UUID().uuidString
    var scope: PhoneRecordScope
    var job: PhoneRecordJob
    var stage = PhoneApplicationStage.saved
    var appliedElsewhere = false
    var appliedOn = ""
    var followUpOn = ""
    var note = ""
    var revision = 1
    var archived = false
    var updatedAt = ISO8601DateFormatter().string(from: Date())
    var identity: String { job.identity }
    var meaningful: Bool {
        stage != .saved || appliedElsewhere || !appliedOn.isEmpty || !followUpOn.isEmpty
            || !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    var valid: Bool {
        UUID(uuidString: id) != nil && scope.valid && job.valid && revision > 0 && revision < Int.max
            && PhoneRecordDay.valid(appliedOn) && PhoneRecordDay.valid(followUpOn)
            && note.unicodeScalars.count <= 2_000
            && !note.unicodeScalars.contains { $0.value < 0x20 && ![0x09, 0x0a, 0x0d].contains($0.value) || $0.value == 0x7f }
            && ApplicationReviewPolicy.date(updatedAt) != nil
            && (!stage.marksApplied || appliedElsewhere)
    }
}

struct PhoneRecordDraft: Codable, Equatable {
    var stage = PhoneApplicationStage.saved
    var appliedOn = ""
    var followUpOn = ""
    var note = ""
    init(_ record: PhoneOpportunityRecord? = nil) {
        if let record { stage = record.stage; appliedOn = record.appliedOn; followUpOn = record.followUpOn; note = record.note }
    }
}

/// A checkpoint is an unfinished edit, never an applied mark or provider receipt.
struct PhoneRecordDraftCheckpoint: Codable, Equatable {
    var scope: PhoneRecordScope
    var identity: String
    var job: PhoneRecordJob
    var recordID: String?
    var revision: Int?
    var draft: PhoneRecordDraft
    var valid: Bool {
        scope.valid && job.valid && identity == job.identity && draft.note.unicodeScalars.count <= 2_000
            && PhoneRecordDay.valid(draft.appliedOn) && PhoneRecordDay.valid(draft.followUpOn)
            && (recordID == nil || UUID(uuidString: recordID!) != nil)
            && (revision == nil || revision! > 0)
    }
}

struct PhoneSubmissionHold: Codable, Equatable {
    var scope: PhoneRecordScope
    var planID: String
    var valid: Bool { scope.valid && !scope.isLocal && !planID.isEmpty && planID.utf16.count <= 256 }
}

/// Only inactive drafts are archived. Tokens and server approval are never copied here.
struct PhoneWorkspaceDraft: Codable, Equatable {
    var scope: PhoneRecordScope
    var profile: PhoneApplicationProfile
    var profileNeedsSync: Bool
    var profileRevision: Int?
    var latestServerRevision: Int?
    var latestServerProfile: PhoneApplicationProfile?
    var jobs: [[String: ApplicationValue]]
    var opportunityDraft: PhoneOpportunityDraft
    var valid: Bool {
        scope.valid && jobs.count <= 200 && jobs.allSatisfy { job in
            guard let url = job["url"]?.string, MobileApplicationPolicy.jobURL(url) != nil, url.utf16.count <= 4_096 else { return false }
            return ["title", "company", "location"].allSatisfy { (job[$0]?.string?.utf16.count ?? 0) <= 500 }
                && (job["country"]?.string?.count ?? 0) <= 2
        }
            && opportunityDraft.storageError == nil
            && (profile.resumeData?.count ?? 0) <= MobileApplicationPolicy.maximumResumeBytes
            && (profileRevision == nil || profileRevision! >= 0)
    }
}

struct PhoneWorkspaceActionContext: Equatable {
    let scope: PhoneRecordScope
    let connection: UUID
    let content: UUID
}

struct PhoneWorkspaceBackup: Codable {
    var schemaVersion = 1
    var exportedAt = ISO8601DateFormatter().string(from: Date())
    var draft: PhoneWorkspaceDraft
    var records: [PhoneOpportunityRecord]
    var recordDrafts: [PhoneRecordDraftCheckpoint]
    var submissionHolds: [PhoneSubmissionHold]
    var discoverySnapshot: Data?
    /// Unfinished opportunities parked beside the current draft. Empty stays off the wire.
    var recoveredOpportunityDrafts: [PhoneOpportunityDraft] = []
    init(draft: PhoneWorkspaceDraft, records: [PhoneOpportunityRecord], recordDrafts: [PhoneRecordDraftCheckpoint],
         submissionHolds: [PhoneSubmissionHold], discoverySnapshot: Data? = nil, recoveredOpportunityDrafts: [PhoneOpportunityDraft] = []) {
        self.draft = draft; self.records = records; self.recordDrafts = recordDrafts
        self.submissionHolds = submissionHolds; self.discoverySnapshot = discoverySnapshot
        self.recoveredOpportunityDrafts = recoveredOpportunityDrafts
    }
    var valid: Bool {
        schemaVersion == 1 && ApplicationReviewPolicy.date(exportedAt) != nil && draft.valid
            && records.count <= 1_000 && records.allSatisfy { $0.valid && $0.scope == draft.scope }
            && Set(records.map(\.id)).count == records.count
            && recordDrafts.count <= 200 && recordDrafts.allSatisfy { $0.valid && $0.scope == draft.scope }
            && submissionHolds.count <= 500 && submissionHolds.allSatisfy { $0.valid && $0.scope == draft.scope }
            && recoveredOpportunityDrafts.count <= 200
            && recoveredOpportunityDrafts.allSatisfy { $0.hasContent && $0.storageError == nil }
            && (discoverySnapshot?.count ?? 0) <= 12 * 1_024 * 1_024
    }
    /// Common iPhone/Android wire format. Platform extensions contain no reusable authentication or approval.
    private struct Source: Codable {
        var scope: String
        var serviceOrigin: String?
        var workspaceId: String?
        var value: PhoneRecordScope? {
            if scope == "unpaired", serviceOrigin == nil, workspaceId == nil { return PhoneRecordScope() }
            guard scope == "workspace", let serviceOrigin, let workspaceId else { return nil }
            let value = PhoneRecordScope(origin: serviceOrigin, workspaceID: workspaceId)
            return value.valid && !value.isLocal ? value : nil
        }
    }
    private struct Resume: Codable {
        var name: String; var mime: String; var size: Int; var sha256: String; var dataBase64: String?
    }
    private struct Profile: Codable {
        var firstName: String; var lastName: String; var email: String; var phone: String; var city: String; var country: String
        var headline: String; var skills: [String]; var targetRoles: [String]; var targetCountries: [String]; var workModes: [String]
        var experienceLevel: String; var website: String; var linkedin: String; var resume: Resume?
        init(_ p: PhoneApplicationProfile) {
            func list(_ text: String) -> [String] { text.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty } }
            firstName = p.firstName; lastName = p.lastName; email = p.email; phone = p.phone; city = p.city; country = p.country
            headline = p.headline; skills = list(p.skills); targetRoles = list(p.targetRoles); targetCountries = list(p.targetCountries)
            workModes = [(p.remote ? "remote" : nil), (p.hybrid ? "hybrid" : nil), (p.onsite ? "on-site" : nil)].compactMap { $0 }
            experienceLevel = p.experienceLevel; website = p.website; linkedin = p.linkedin
            if !p.resumeRemoved, let size = p.resumeSize, let hash = p.resumeSHA256, !p.resumeName.isEmpty {
                resume = Resume(name: p.resumeName, mime: "application/pdf", size: size, sha256: hash, dataBase64: p.resumeData?.base64EncodedString())
            }
        }
        func decoded() throws -> PhoneApplicationProfile {
            let strings = [firstName, lastName, email, phone, city, country, headline, website, linkedin]
            guard strings.allSatisfy({ $0.utf16.count <= 10_000 }), skills.count <= 30, targetRoles.count <= 30, targetCountries.count <= 30,
                  (skills + targetRoles + targetCountries).allSatisfy({ $0.utf16.count <= 1_000 }),
                  workModes.count <= 3, Set(workModes).count == workModes.count,
                  workModes.allSatisfy({ ["remote", "hybrid", "on-site"].contains($0) }),
                  ["entry", "mid", "senior", "any"].contains(experienceLevel) else {
                throw MobileApplicationError(message: "The backup profile is outside supported limits. Existing phone data is unchanged.")
            }
            var p = PhoneApplicationProfile()
            p.firstName = firstName; p.lastName = lastName; p.email = email; p.phone = phone; p.city = city; p.country = country
            p.headline = headline; p.skills = skills.joined(separator: ", "); p.targetRoles = targetRoles.joined(separator: ", ")
            p.targetCountries = targetCountries.joined(separator: ", "); p.remote = workModes.contains("remote")
            p.hybrid = workModes.contains("hybrid"); p.onsite = workModes.contains("on-site")
            p.experienceLevel = experienceLevel; p.website = website; p.linkedin = linkedin
            if let resume {
                guard resume.mime == "application/pdf", (8...MobileApplicationPolicy.maximumResumeBytes).contains(resume.size),
                      resume.sha256.range(of: #"^[a-f0-9]{64}$"#, options: .regularExpression) != nil else {
                    throw MobileApplicationError(message: "The backup contains invalid CV metadata.")
                }
                p.resumeName = resume.name; p.resumeSize = resume.size; p.resumeSHA256 = resume.sha256
                if let encoded = resume.dataBase64 {
                    guard let bytes = Data(base64Encoded: encoded), bytes.base64EncodedString() == encoded else {
                        throw MobileApplicationError(message: "The backup CV encoding is invalid.")
                    }
                    try p.selectResume(bytes, filename: resume.name)
                    guard p.resumeSize == resume.size, p.resumeSHA256 == resume.sha256 else { throw MobileApplicationError(message: "The backup CV does not match its fingerprint.") }
                }
            }
            return p
        }
    }
    private struct Record: Codable {
        var id: String; var job: PhoneRecordJob; var stage: PhoneApplicationStage; var appliedElsewhere: Bool
        var appliedOn: String; var followUpOn: String; var note: String; var revision: Int; var archived: Bool; var updatedAt: String
        init(_ r: PhoneOpportunityRecord) {
            id = r.id; job = r.job; stage = r.stage; appliedElsewhere = r.appliedElsewhere; appliedOn = r.appliedOn
            followUpOn = r.followUpOn; note = r.note; revision = r.revision; archived = r.archived; updatedAt = r.updatedAt
        }
        func decoded(scope: PhoneRecordScope) -> PhoneOpportunityRecord {
            var r = PhoneOpportunityRecord(scope: scope, job: job)
            r.id = id; r.stage = stage; r.appliedElsewhere = appliedElsewhere; r.appliedOn = appliedOn; r.followUpOn = followUpOn
            r.note = note; r.revision = revision; r.archived = archived; r.updatedAt = updatedAt; return r
        }
    }
    private struct RecordDraft: Codable {
        var job: PhoneRecordJob; var recordID: String?; var revision: Int?; var draft: PhoneRecordDraft
    }
    private struct Job: Codable {
        var url: String; var title: String; var company: String; var location: String; var country: String
        init(_ value: [String: ApplicationValue]) {
            url = value["url"]?.string ?? ""; title = value["title"]?.string ?? ""; company = value["company"]?.string ?? ""
            location = value["location"]?.string ?? ""; country = value["country"]?.string ?? ""
        }
        func decoded(index: Int) -> [String: ApplicationValue] {
            ["id": .string("local-import-\(index)"), "localOnly": .bool(true), "url": .string(url), "title": .string(title),
             "company": .string(company), "location": .string(location), "country": .string(country)]
        }
    }
    private struct Contents: Codable {
        var profile: Profile
        var jobs: [Job]
        var applicationRecords: [Record]
        var recordDrafts: [RecordDraft]
        var opportunityDraft: PhoneOpportunityDraft
        var continuationHolds: [String]
    }
    private struct IOS: Codable { var discoverySnapshotBase64: String? }
    private struct AndroidExtension: Codable {
        var recoveredOpportunityDrafts: [PhoneOpportunityDraft] = []
        init(recoveredOpportunityDrafts: [PhoneOpportunityDraft] = []) { self.recoveredOpportunityDrafts = recoveredOpportunityDrafts }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            recoveredOpportunityDrafts = try c.decodeIfPresent([PhoneOpportunityDraft].self, forKey: .recoveredOpportunityDrafts) ?? []
        }
        private enum CodingKeys: String, CodingKey { case recoveredOpportunityDrafts }
    }
    private struct Extensions: Codable {
        var ios: IOS?
        var android: AndroidExtension?
        init(ios: IOS?, android: AndroidExtension?) { self.ios = ios; self.android = android }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            ios = try c.decodeIfPresent(IOS.self, forKey: .ios)
            android = try c.decodeIfPresent(AndroidExtension.self, forKey: .android)
        }
        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encodeIfPresent(ios, forKey: .ios)
            try c.encodeIfPresent(android, forKey: .android)
        }
        private enum CodingKeys: String, CodingKey { case ios, android }
    }
    private struct Envelope: Codable {
        var format: String; var version: Int; var platform: String; var exportedAt: String; var source: Source; var data: Contents; var extensions: Extensions?
    }
    init(from decoder: Decoder) throws {
        let envelope = try Envelope(from: decoder)
        guard envelope.format == "career-finder-phone-workspace", envelope.version == 1,
              ["ios", "android"].contains(envelope.platform), let scope = envelope.source.value else {
            throw MobileApplicationError(message: "This is not a supported Career Finder phone workspace backup. Existing files are unchanged.")
        }
        schemaVersion = envelope.version; exportedAt = envelope.exportedAt
        let contents = envelope.data
        draft = PhoneWorkspaceDraft(scope: scope, profile: try contents.profile.decoded(), profileNeedsSync: true,
            profileRevision: nil, latestServerRevision: nil, latestServerProfile: nil,
            jobs: contents.jobs.enumerated().map { $0.element.decoded(index: $0.offset) }, opportunityDraft: contents.opportunityDraft)
        records = contents.applicationRecords.map { $0.decoded(scope: scope) }
        recordDrafts = contents.recordDrafts.map { PhoneRecordDraftCheckpoint(scope: scope, identity: $0.job.identity, job: $0.job,
            recordID: $0.recordID, revision: $0.revision, draft: $0.draft) }
        submissionHolds = contents.continuationHolds.map { PhoneSubmissionHold(scope: scope, planID: $0) }
        recoveredOpportunityDrafts = envelope.extensions?.android?.recoveredOpportunityDrafts ?? []
        if let encoded = envelope.extensions?.ios?.discoverySnapshotBase64 {
            guard let data = Data(base64Encoded: encoded), data.base64EncodedString() == encoded else {
                throw MobileApplicationError(message: "The saved search in this backup is unreadable.")
            }
            discoverySnapshot = data
        }
        guard valid else { throw MobileApplicationError(message: "This backup contains invalid or unsupported phone data. Nothing was replaced.") }
    }
    func encode(to encoder: Encoder) throws {
        let scope = draft.scope
        let source = Source(scope: scope.isLocal ? "unpaired" : "workspace", serviceOrigin: scope.isLocal ? nil : scope.origin,
            workspaceId: scope.isLocal ? nil : scope.workspaceID)
        let contents = Contents(profile: Profile(draft.profile), jobs: draft.jobs.map(Job.init),
            applicationRecords: records.map(Record.init),
            recordDrafts: recordDrafts.map { RecordDraft(job: $0.job, recordID: $0.recordID, revision: $0.revision, draft: $0.draft) },
            opportunityDraft: draft.opportunityDraft, continuationHolds: submissionHolds.map(\.planID))
        let android = recoveredOpportunityDrafts.isEmpty ? nil : AndroidExtension(recoveredOpportunityDrafts: recoveredOpportunityDrafts)
        try Envelope(format: "career-finder-phone-workspace", version: schemaVersion, platform: "ios", exportedAt: exportedAt,
            source: source, data: contents, extensions: Extensions(ios: IOS(discoverySnapshotBase64: discoverySnapshot?.base64EncodedString()), android: android)).encode(to: encoder)
    }
}

struct PhoneRecordEditContext: Equatable {
    let scope: PhoneRecordScope
    let identity: String
    let job: PhoneRecordJob
    let connection: UUID
    let recordID: String?
    let revision: Int?
}

struct PhoneRecordChoiceContext: Equatable {
    let scope: PhoneRecordScope
    let identity: String
    let connection: UUID
    let versions: [String: Int]
}

struct PhoneRecordAdoptionContext: Equatable {
    let identity: String
    let destination: PhoneRecordScope
    let connection: UUID
    let sourceVersions: [String: Int]
    let destinationVersions: [String: Int]
}

struct PhoneLocalRemovalContext: Identifiable {
    let id: String
    let identity: String
    let connection: UUID
    let title: String
    let company: String
    let keepsRecord: Bool
}

struct ApplicationProfileReadiness {
    let profile: PhoneApplicationProfile
    var nameReady: Bool {
        !profile.firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && profile.firstName.utf16.count <= 150
            && !profile.firstName.unicodeScalars.contains { $0.value < 0x20 || $0.value == 0x7f }
    }
    var emailReady: Bool {
        let value = profile.email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return profile.email.utf16.count <= 254 && !profile.email.unicodeScalars.contains { $0.value < 0x20 || $0.value == 0x7f }
            && (value.split(separator: "@", omittingEmptySubsequences: false).first?.utf16.count ?? 0) <= 64
            && value.range(of: #"^[^\s@<>]{1,64}@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$"#, options: .regularExpression) != nil
    }
    var resumeReady: Bool {
        guard !profile.resumeRemoved else { return false }
        if let data = profile.resumeData { return MobileApplicationPolicy.resumeError(data, filename: profile.resumeName) == nil }
        guard !profile.resumeChanged else { return false }
        return !profile.resumeName.isEmpty && profile.resumeName.lowercased().hasSuffix(".pdf")
            && (profile.resumeSize.map { (8...MobileApplicationPolicy.maximumResumeBytes).contains($0) } ?? false)
            && profile.resumeSHA256?.range(of: #"^[a-fA-F0-9]{64}$"#, options: .regularExpression) != nil
    }
    var ready: Bool { nameReady && emailReady && resumeReady }
    var emailEssentialLabel: String {
        emailReady ? "Email added" : profile.email.isEmpty ? "Email needed" : "Check your email"
    }
    var emailNeedsCorrection: Bool { !profile.email.isEmpty && !emailReady }
    var nextAction: String {
        !nameReady ? "Add your name" : !emailReady ? (profile.email.isEmpty ? "Add your email" : "Check your email")
            : !resumeReady ? "Choose a PDF CV" : "Review your application profile"
    }
    var summary: String { ready ? "Name, email and PDF CV added" : nextAction }
}

/// The draft's base revision is deliberately independent of the latest server revision.
/// Old files without a revision migrate to an unknown base, which requires an explicit conflict choice.
struct PhoneApplicationState: Codable, Equatable {
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
    var applicationRecordSchema = 1
    var applicationRecords: [PhoneOpportunityRecord] = []
    var workspaceDraftSchema = 1
    var workspaceDrafts: [PhoneWorkspaceDraft] = []
    var recordDrafts: [PhoneRecordDraftCheckpoint] = []
    /// Distinct unfinished edits for a job already holding a current draft. Never an applied mark.
    var recordDraftAlternatives: [PhoneRecordDraftCheckpoint] = []
    /// Unfinished opportunities that differ from the current draft. Filtered by workspace scope.
    var recoveredOpportunityDrafts: [PhoneRecoveredOpportunity] = []
    var submissionHolds: [PhoneSubmissionHold] = []

    init() {}
    private enum CodingKeys: String, CodingKey {
        case profile, profileNeedsSync, jobs, opportunityDraft, serviceAddress, workspaceID, profileRevision
        case latestServerRevision, latestServerProfile, connectionEnabled, credentialAccount
        case applicationRecordSchema, applicationRecords
        case workspaceDraftSchema, workspaceDrafts, recordDrafts, recordDraftAlternatives, recoveredOpportunityDrafts, submissionHolds
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
        workspaceDraftSchema = try c.decodeIfPresent(Int.self, forKey: .workspaceDraftSchema) ?? 1
        workspaceDrafts = try c.decodeIfPresent([PhoneWorkspaceDraft].self, forKey: .workspaceDrafts) ?? []
        recordDrafts = try c.decodeIfPresent([PhoneRecordDraftCheckpoint].self, forKey: .recordDrafts) ?? []
        recordDraftAlternatives = try c.decodeIfPresent([PhoneRecordDraftCheckpoint].self, forKey: .recordDraftAlternatives) ?? []
        recoveredOpportunityDrafts = try c.decodeIfPresent([PhoneRecoveredOpportunity].self, forKey: .recoveredOpportunityDrafts) ?? []
        submissionHolds = try c.decodeIfPresent([PhoneSubmissionHold].self, forKey: .submissionHolds) ?? []
        guard workspaceDraftSchema == 1, workspaceDrafts.count <= 32, workspaceDrafts.allSatisfy(\.valid),
              recordDrafts.count + recordDraftAlternatives.count <= 200,
              recordDrafts.allSatisfy(\.valid), recordDraftAlternatives.allSatisfy(\.valid),
              recoveredOpportunityDrafts.count <= 200, recoveredOpportunityDrafts.allSatisfy(\.valid),
              submissionHolds.count <= 500, submissionHolds.allSatisfy(\.valid) else {
            throw MobileApplicationError(message: "These workspace drafts need a compatible app version. The original phone data has been preserved.")
        }
        for (index, draft) in workspaceDrafts.enumerated() {
            guard draft.scope != recordScope, !workspaceDrafts.prefix(index).contains(where: { $0.scope == draft.scope }) else {
                throw MobileApplicationError(message: "Conflicting workspace drafts were preserved without choosing or replacing either version.")
            }
        }
        if c.contains(.applicationRecordSchema) || c.contains(.applicationRecords) {
            applicationRecordSchema = try c.decode(Int.self, forKey: .applicationRecordSchema)
            applicationRecords = try c.decode([PhoneOpportunityRecord].self, forKey: .applicationRecords)
            guard applicationRecordSchema == 1, applicationRecords.count <= 1_000,
                  applicationRecords.allSatisfy(\.valid), Set(applicationRecords.map(\.id)).count == applicationRecords.count else {
                throw MobileApplicationError(message: "These saved application records need a compatible app version. The original phone data has been preserved.")
            }
        }
    }
    var tokenAccount: String { credentialAccount ?? serviceAddress }
    var recordScope: PhoneRecordScope {
        workspaceID.isEmpty ? PhoneRecordScope() : PhoneRecordScope(origin: MobileApplicationPolicy.serviceURL(serviceAddress)?.absoluteString ?? serviceAddress, workspaceID: workspaceID)
    }
    var hasProfileConflict: Bool {
        profileNeedsSync && latestServerRevision != nil && profileRevision != latestServerRevision
    }
    var activeDraft: PhoneWorkspaceDraft {
        PhoneWorkspaceDraft(scope: recordScope, profile: profile, profileNeedsSync: profileNeedsSync,
            profileRevision: profileRevision, latestServerRevision: latestServerRevision,
            latestServerProfile: latestServerProfile, jobs: jobs, opportunityDraft: opportunityDraft)
    }
    mutating func loadDraft(_ draft: PhoneWorkspaceDraft) {
        profile = draft.profile; profileNeedsSync = draft.profileNeedsSync; profileRevision = draft.profileRevision
        latestServerRevision = draft.latestServerRevision; latestServerProfile = draft.latestServerProfile
        jobs = draft.jobs; opportunityDraft = draft.opportunityDraft
    }
    func holdsSubmission(_ id: String) -> Bool {
        submissionHolds.contains { $0.scope == recordScope && $0.planID == id }
    }
    mutating func holdSubmissions(_ ids: [String]) {
        for id in ids where !holdsSubmission(id) { submissionHolds.append(PhoneSubmissionHold(scope: recordScope, planID: id)) }
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
            let previous = activeDraft, target = PhoneRecordScope(origin: address, workspaceID: workspace)
            let restored = workspaceDrafts.first { $0.scope == target }
            workspaceDrafts.removeAll { $0.scope == previous.scope || $0.scope == target }
            workspaceDrafts.append(previous)
            if let restored { loadDraft(restored) }
            else {
                profile = PhoneApplicationProfile(); profileNeedsSync = false; profileRevision = nil
                latestServerRevision = nil; latestServerProfile = nil; jobs = []; opportunityDraft = PhoneOpportunityDraft()
            }
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

/// Display labels for app-owned career-stage and work-mode values. Unknown text stays raw.
enum PhoneProfileDisplay {
    static func experienceLabel(for stored: String) -> String? {
        switch stored {
        case "any", "Any / not specified": return "Any / not specified"
        case "entry", "Entry level": return "Entry level"
        case "mid", "Mid level": return "Mid level"
        case "senior", "Senior": return "Senior"
        default: return nil
        }
    }
    static func workPreferenceLabels(remote: Bool, hybrid: Bool, onsite: Bool) -> [String] {
        var labels: [String] = []
        if remote { labels.append("Remote") }
        if hybrid { labels.append("Hybrid") }
        if onsite { labels.append("On site") }
        return labels
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
        guard let id = value["id"]?.string, !id.isEmpty, value["digest"]?.string != nil,
              ApplicationReviewPolicy.validLinkedInDetails(value) else { return nil }
        self.value = value; self.id = id
    }
    var items: [[String: ApplicationValue]] { value["items"]?.array.map(\.object) ?? [] }
    var title: String { items.first?["job"]?.object["title"]?.string ?? "Application review" }
}

enum ApplicationReviewPolicy {
    static func validLinkedInDetails(_ plan: [String: ApplicationValue]) -> Bool {
        guard case .array(let items)? = plan["items"] else { return false }
        return items.allSatisfy { item in
            guard case .object(let fields) = item else { return false }
            guard let summary = fields["payloadSummary"] else { return true }
            guard case .object(let details) = summary else { return false }
            guard let linkedin = details["linkedin"] else { return true }
            guard let text = linkedin.string else { return false }
            return text.isEmpty || MobileApplicationPolicy.linkedInProfileURL(text) != nil
        }
    }
    static func includesLinkedIn(_ plan: [String: ApplicationValue]) -> Bool {
        plan["items"]?.array.contains { !($0.object["payloadSummary"]?.object["linkedin"]?.string ?? "").isEmpty } == true
    }
    static func linkedInMatchesProfile(_ plan: [String: ApplicationValue], link: String) -> Bool {
        guard validLinkedInDetails(plan) else { return false }
        return plan["items"]?.array.allSatisfy { value in
            let item = value.object
            guard ["ready", "rate_limited"].contains(item["state"]?.string ?? "") else { return true }
            return (item["payloadSummary"]?.object["linkedin"]?.string ?? "") == link
        } == true
    }
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
