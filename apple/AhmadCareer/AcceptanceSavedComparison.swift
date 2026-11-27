#if DEBUG
import Foundation
import CryptoKit

/// A separately enabled UUID fixture for Saved comparison. It owns no HTTP
/// implementation, accepts no request, and never rewrites an existing draft.
@MainActor
final class AcceptanceSavedComparison: MobileApplicationServing {
    let origin = URL(string: "https://career-ui.example")!
    var token: String?
    private let root: URL
    private let recordedAt = "2026-11-21T18:00:00Z"
    private let recordA = "CF300000-0000-4000-8000-000000000001"
    private let recordB = "CF300000-0000-4000-8000-000000000002"

    init(root: URL) { self.root = root }

    private func job(_ id: String, city: String, title: String = "Service Designer") -> [String: ApplicationValue] {
        ["id": .string(id), "url": .string("https://example.com/synthetic/saved-comparison/" + city.lowercased()),
         "title": .string(title), "company": .string("Synthetic Harbor Studio"), "location": .string(city),
         "country": .string(city == "Amman" ? "JO" : "SA"), "localOnly": .bool(true)]
    }
    private func seedBytes() throws -> Data {
        var a = job("local-comparison-a", city: "Riyadh")
        a["sourceName"] = .string("Synthetic Harbor board"); a["checkedAt"] = .string(recordedAt)
        let b = job("local-comparison-b", city: "Jeddah")
        let c = job("local-comparison-c", city: "Amman", title: "Support coordinator")
        var state = PhoneApplicationState()
        state.jobs = [a, b, c]
        var first = PhoneOpportunityRecord(scope: PhoneRecordScope(), job: PhoneRecordJob(a))
        first.id = recordA; first.updatedAt = recordedAt
        first.stage = .applied; first.appliedElsewhere = true
        first.appliedOn = "2026-11-20"; first.followUpOn = "2030-01-10"
        var second = PhoneOpportunityRecord(scope: PhoneRecordScope(), job: PhoneRecordJob(b))
        second.id = recordB; second.updatedAt = recordedAt
        second.stage = .interview; second.appliedElsewhere = true
        second.appliedOn = "2026-11-19"; second.followUpOn = "2030-02-20"
        state.applicationRecords = [first, second]
        // Add the same optional public facts to both builds' encoded fixture.
        // The genuine before record decoder does not expose these new fields.
        var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(state)) as! [String: Any]
        var records = object["applicationRecords"] as! [[String: Any]]
        var firstJob = records[0]["job"] as! [String: Any]
        firstJob["sourceName"] = "Synthetic Harbor board"; firstJob["checkedAt"] = recordedAt
        records[0]["job"] = firstJob; object["applicationRecords"] = records
        return try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    }

    private struct Receipt: Codable {
        let schemaVersion: Int
        let fixtureID: String
        let networkImplementation: Bool
        let seedSHA256: String
        let seedBytes: Int
        var rejectedRequests: Int
    }
    private var receiptFile: URL { root.appendingPathComponent("saved-comparison-fixture.json") }
    private func readReceipt() throws -> Receipt {
        let bytes = try Data(contentsOf: receiptFile)
        guard bytes.count <= 8_192 else { throw CocoaError(.coderInvalidValue) }
        let value = try JSONDecoder().decode(Receipt.self, from: bytes)
        guard value.schemaVersion == 1, value.fixtureID == root.lastPathComponent,
              !value.networkImplementation, (0..<64).contains(value.rejectedRequests),
              value.seedSHA256.count == 64, value.seedBytes > 0 else { throw CocoaError(.coderInvalidValue) }
        return value
    }
    func seedIfAbsent(folder: URL) throws {
        guard UUID(uuidString: root.lastPathComponent) != nil else { throw CocoaError(.fileWriteInvalidFileName) }
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let bytes = try seedBytes(), hash = SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
        let file = folder.appendingPathComponent("phone-draft.json")
        if FileManager.default.fileExists(atPath: file.path) {
            let receipt = try readReceipt()
            guard receipt.seedSHA256 == hash, receipt.seedBytes == bytes.count else { throw CocoaError(.coderInvalidValue) }
            return
        }
        guard !FileManager.default.fileExists(atPath: receiptFile.path) else { throw CocoaError(.fileWriteFileExists) }
        try bytes.write(to: file, options: .withoutOverwriting)
        let value = Receipt(schemaVersion: 1, fixtureID: root.lastPathComponent, networkImplementation: false,
                            seedSHA256: hash, seedBytes: bytes.count, rejectedRequests: 0)
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(value).write(to: receiptFile, options: .withoutOverwriting)
    }
    func request(_ route: String, method: String, body: [String: ApplicationValue]?) async throws -> [String: ApplicationValue] {
        var receipt = try readReceipt()
        guard receipt.rejectedRequests < 63 else { throw CocoaError(.coderInvalidValue) }
        receipt.rejectedRequests += 1
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(receipt).write(to: receiptFile, options: .atomic)
        throw MobileApplicationError(message: "The synthetic Saved comparison is offline. No service request is permitted.")
    }
    func invalidate() {}
}
#endif
