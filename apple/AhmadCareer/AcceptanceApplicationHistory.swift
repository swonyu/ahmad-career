#if DEBUG
import Foundation

/// Fixed synthetic metadata for the separate CV-history UI journeys. This
/// service has no HTTP implementation; only its exact workspace read is allowed.
@MainActor
final class AcceptanceApplicationHistory: MobileApplicationServing {
    let origin = URL(string: "https://career-ui.example")!
    let workspaceID = "offline-cv-history-workspace"
    var token: String?
    private let root: URL
    private let recordedAt = "2026-11-21T18:00:00Z"
    // Historical attempts keep their fixed dates; this separate unsent review must remain current on every CI run.
    private let reviewExpiresAt = ISO8601DateFormatter().string(from: Date().addingTimeInterval(24 * 60 * 60))
    private let pdfHash = String(repeating: "a", count: 64)
    private let manualRecordID = "CFA00000-0000-4000-8000-000000000001"

    init(root: URL) { self.root = root }

    var profile: [String: ApplicationValue] {
        var value = PhoneApplicationProfile().payload()
        value["firstName"] = .string("Synthetic")
        value["lastName"] = .string("Applicant")
        value["email"] = .string("synthetic@example.invalid")
        value["revision"] = .number(8)
        value["resume"] = .object(resume("CV-B.pdf"))
        return value
    }
    private func resume(_ name: String) -> [String: ApplicationValue] {
        ["name": .string(name), "mime": .string("application/pdf"), "size": .number(512), "sha256": .string(pdfHash)]
    }
    private func job(_ id: String, title: String, location: String = "Amman") -> [String: ApplicationValue] {
        ["id": .string(id), "url": .string("https://example.com/synthetic/cv-history/" + id),
         "title": .string(title), "company": .string("Synthetic Harbor Studio"),
         "location": .string(location), "country": .string(location == "Toronto" ? "CA" : "JO")]
    }
    var manualJob: [String: ApplicationValue] { job("manual", title: "Manual research record") }
    private var reviewJob: [String: ApplicationValue] { job("review-b", title: "New review with CV-B", location: "Toronto") }
    private var plan: [String: ApplicationValue] {
        ["id": .string("cv-review-b"), "digest": .string("synthetic-cv-review-b-digest"),
         "profileRevision": .number(8), "createdAt": .string(recordedAt),
         "expiresAt": .string(reviewExpiresAt), "stopped": .bool(false), "approvedAt": .null,
         "items": .array([.object(["jobId": .string("review-b"), "state": .string("ready"),
             "job": .object(reviewJob), "resume": .object(resume("CV-B.pdf")),
             "payloadSummary": .object(["name": .string("Synthetic Applicant"),
                 "email": .string("synthetic@example.invalid"), "consentMarketing": .bool(false)])])])]
    }
    private func attempt(_ id: String, title: String, state: String, evidence: String = "test",
                         filename: String? = "CV-A.pdf", revision: Int? = 7) -> [String: ApplicationValue] {
        var value: [String: ApplicationValue] = ["id": .string(id), "attemptId": .string(id),
            "jobId": .string("job-" + id), "title": .string(title), "company": .string("Synthetic Harbor Studio"),
            "state": .string(state), "evidenceMode": .string(evidence), "provider": .string("lever"),
            "createdAt": .string(recordedAt)]
        if state != "ready" { value["dispatchedAt"] = .string(recordedAt) }
        if let filename { value["resumeName"] = .string(filename); value["resumeSHA256"] = .string(pdfHash) }
        if let revision { value["profileRevision"] = .number(Double(revision)) }
        if state == "confirmed" {
            // This is a fixed classification example, not an actual receipt.
            // The fixture and the whole workspace remain explicitly synthetic.
            value["applicationId"] = .string("synthetic-example-" + id)
            value["confirmedAt"] = .string(recordedAt)
        }
        return value
    }
    private var attempts: [[String: ApplicationValue]] {
        // The production activity list reverses service order, so old A is first.
        [attempt("legacy", title: "Legacy history without CV", state: "uncertain", filename: nil, revision: nil),
         attempt("confirmed", title: "Synthetic confirmed example", state: "confirmed", evidence: "live"),
         attempt("uncertain", title: "Uncertain history example", state: "uncertain"),
         attempt("test", title: "Synthetic test receipt", state: "confirmed"),
         attempt("prepared", title: "Earlier draft with CV-A", state: "ready")]
    }

    /// Seed only a new UUID-scoped phone folder. The same bytes compile in the
    /// genuine before app: unknown optional filename fields are ignored there.
    /// Relaunch never rewrites saved data or restores a discarded edit.
    func seedIfAbsent(folder: URL) throws {
        guard UUID(uuidString: root.lastPathComponent) != nil else { throw CocoaError(.fileWriteInvalidFileName) }
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let file = folder.appendingPathComponent("phone-draft.json")
        guard !FileManager.default.fileExists(atPath: file.path) else { return }
        var state = PhoneApplicationState()
        state.connect(address: origin.absoluteString, workspace: workspaceID,
                      account: "offline-cv-history", server: try ApplicationServerProfile(profile))
        var record = PhoneOpportunityRecord(scope: state.recordScope, job: PhoneRecordJob(manualJob))
        record.id = manualRecordID; record.updatedAt = recordedAt
        record.note = "Synthetic private reminder. No employer was contacted."
        state.applicationRecords = [record]
        state.recordDrafts = [PhoneRecordDraftCheckpoint(scope: state.recordScope, identity: record.identity,
            job: record.job, recordID: record.id, revision: record.revision, draft: PhoneRecordDraft(record))]
        var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(state)) as! [String: Any]
        var records = object["applicationRecords"] as! [[String: Any]]
        records[0]["manualResumeName"] = "Manual-CV-A.pdf"; object["applicationRecords"] = records
        var drafts = object["recordDrafts"] as! [[String: Any]], draft = drafts[0]["draft"] as! [String: Any]
        draft["manualResumeName"] = "Unfinished-CV-B.pdf"; drafts[0]["draft"] = draft; object["recordDrafts"] = drafts
        let bytes = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        do { try bytes.write(to: file, options: .withoutOverwriting) }
        catch let error as CocoaError where error.code == .fileWriteFileExists { /* Existing bytes belong to their initializer. */ }
    }

    private struct Receipt: Codable {
        let schemaVersion: Int
        let fixtureID: String
        let networkImplementation: Bool
        let currentResumeName: String
        let currentProfileRevision: Int
        var workspaceReads: Int
        var rejectedRequests: Int
    }
    private func record(accepted: Bool) throws {
        guard UUID(uuidString: root.lastPathComponent) != nil else { throw CocoaError(.fileWriteInvalidFileName) }
        let file = root.appendingPathComponent("cv-history-fixture.json")
        var value = Receipt(schemaVersion: 1, fixtureID: root.lastPathComponent, networkImplementation: false,
                            currentResumeName: "CV-B.pdf", currentProfileRevision: 8, workspaceReads: 0, rejectedRequests: 0)
        if FileManager.default.fileExists(atPath: file.path) {
            let bytes = try Data(contentsOf: file)
            guard bytes.count <= 8_192 else { throw CocoaError(.coderInvalidValue) }
            value = try JSONDecoder().decode(Receipt.self, from: bytes)
            guard value.schemaVersion == 1, value.fixtureID == root.lastPathComponent, !value.networkImplementation,
                  value.currentResumeName == "CV-B.pdf", value.currentProfileRevision == 8,
                  (0..<64).contains(value.workspaceReads), (0..<64).contains(value.rejectedRequests),
                  value.workspaceReads + value.rejectedRequests < 64 else { throw CocoaError(.coderInvalidValue) }
        }
        if accepted { value.workspaceReads += 1 } else { value.rejectedRequests += 1 }
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(value).write(to: file, options: .atomic)
    }
    func request(_ route: String, method: String, body: [String: ApplicationValue]?) async throws -> [String: ApplicationValue] {
        guard route == "workspace", method == "GET", body == nil else {
            try record(accepted: false)
            throw MobileApplicationError(message: "The synthetic CV-history fixture permits workspace reads only.")
        }
        try record(accepted: true)
        return ["ok": .bool(true), "workspaceId": .string(workspaceID), "profile": .object(profile),
            "jobs": .array([.object(reviewJob), .object(manualJob)]), "attempts": .array(attempts.map(ApplicationValue.object)),
            "recoverablePlans": .array([.object(plan)]), "activePlanIds": .array([]), "mode": .string("test"),
            "capabilities": .object(["liveEnabled": .bool(false), "linkedinProfile": .bool(true)])]
    }
    func invalidate() {}
}
#endif
