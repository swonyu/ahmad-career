#if DEBUG
import Foundation
import CryptoKit

/// Connection-only bootstrap for the explicitly granted, isolated native journey.
/// The owner wrapper writes this file privately after real hosted pairing. It does
/// not contain or inject a completed profile, PDF, job, plan, attempt, or record.
@MainActor
struct AcceptanceNativeJourney {
    private struct Bootstrap: Decodable {
        let schemaVersion: Int
        let testID: String
        let connection: Connection
        let transport: Transport
    }
    private struct Connection: Decodable {
        let ok: Bool
        let origin: String
        let workspaceId: String
        let sessionToken: String
        let expiresAt: String
        let initialWorkspace: [String: ApplicationValue]
    }
    private struct Transport: Decodable {
        let origin: String
        let capability: String
    }
    private struct SeedReceipt: Codable, Equatable {
        let schemaVersion: Int
        let testID: String
        let bootstrapSHA256: String
        let initialStateSHA256: String
        let onlyBlankConnection: Bool
    }

    private let root: URL
    private let configuration: Bootstrap
    private let bootstrapSHA256: String
    let transport: NativeJourneyTransport

    private static func rejected() -> MobileApplicationError {
        MobileApplicationError(message: "The isolated blank-profile journey configuration is unavailable.")
    }
    private static func digest(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
    private static func readPrivate(_ url: URL, maximum: Int) throws -> Data {
        let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        guard values.isRegularFile == true, values.isSymbolicLink == false,
              let size = values.fileSize, size > 0, size <= maximum,
              (attributes[.posixPermissions] as? NSNumber)?.intValue == 0o600 else { throw rejected() }
        let data = try Data(contentsOf: url)
        guard data.count == size, data.count <= maximum else { throw rejected() }
        return data
    }
    private static func writePrivate(_ data: Data, to url: URL) throws {
        try data.write(to: url, options: .withoutOverwriting)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }

    init(root: URL) throws {
        let environment = ProcessInfo.processInfo.environment
        guard ProcessInfo.processInfo.arguments.contains("-career-ui-acceptance"),
              environment["CAREER_UI_NATIVE_JOURNEY"] == "blank-profile",
              let raw = environment["CAREER_UI_TEST_ID"], let id = UUID(uuidString: raw),
              root.lastPathComponent == id.uuidString else { throw Self.rejected() }
        let bytes = try Self.readPrivate(root.appendingPathComponent("native-journey-bootstrap.private.json"), maximum: 65_536)
        let configuration = try JSONDecoder().decode(Bootstrap.self, from: bytes)
        let connection = configuration.connection
        guard configuration.schemaVersion == 1, configuration.testID == id.uuidString,
              connection.ok, connection.origin == MobileApplicationPolicy.hostedServiceOrigin,
              UUID(uuidString: connection.workspaceId) != nil,
              connection.sessionToken.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              let expiry = ApplicationReviewPolicy.date(connection.expiresAt), expiry > Date(),
              let bridge = URL(string: configuration.transport.origin) else { throw Self.rejected() }
        let initial = connection.initialWorkspace
        let snapshot = try ApplicationWorkspaceSnapshot(initial, workspaceID: connection.workspaceId)
        let profile = initial["profile"]?.object ?? [:]
        guard initial["mode"]?.string == "test",
              initial["capabilities"]?.object["mode"]?.string == "test",
              initial["capabilities"]?.object["liveEnabled"]?.bool == false,
              snapshot.profile.revision == 0, profile["resume"] == .null,
              ["firstName", "lastName", "email", "phone", "city", "country", "headline", "website", "linkedin"]
                .allSatisfy({ profile[$0]?.string == "" }),
              ["skills", "targetRoles", "targetCountries", "workModes"]
                .allSatisfy({ profile[$0] == .array([]) }),
              profile["experienceLevel"]?.string == "any",
              snapshot.jobs.isEmpty, snapshot.attempts.isEmpty,
              snapshot.recoverablePlans.isEmpty, snapshot.activePlanIDs.isEmpty else { throw Self.rejected() }
        self.root = root
        self.configuration = configuration
        bootstrapSHA256 = Self.digest(bytes)
        transport = try NativeJourneyTransport(origin: bridge, capability: configuration.transport.capability)
    }

    private var credentialAccount: String { "native-journey." + configuration.testID }

    func makeApplicationsStore() throws -> NativeApplicationsStore {
        let folder = root.appendingPathComponent("applications", isDirectory: true)
        let path = folder.appendingPathComponent("phone-draft.json")
        let receiptPath = root.appendingPathComponent("native-journey-seed-receipt.json")
        let manager = FileManager.default
        let hasDraft = manager.fileExists(atPath: path.path)
        let hasReceipt = manager.fileExists(atPath: receiptPath.path)
        guard hasDraft == hasReceipt else { throw Self.rejected() }
        if hasDraft {
            let receipt = try JSONDecoder().decode(SeedReceipt.self, from: Self.readPrivate(receiptPath, maximum: 4_096))
            guard receipt.schemaVersion == 1, receipt.testID == configuration.testID,
                  receipt.bootstrapSHA256 == bootstrapSHA256, receipt.onlyBlankConnection,
                  receipt.initialStateSHA256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
                throw Self.rejected()
            }
            // The normal store reads the current draft. Never reseed on restart,
            // including when its bytes are corrupt or newer than the bootstrap.
        } else {
            try manager.createDirectory(at: folder, withIntermediateDirectories: true)
            guard try manager.contentsOfDirectory(atPath: folder.path).isEmpty else { throw Self.rejected() }
            let connection = configuration.connection
            var state = PhoneApplicationState()
            state.connect(address: connection.origin, workspace: connection.workspaceId, account: credentialAccount,
                server: try ApplicationServerProfile(connection.initialWorkspace["profile"]?.object ?? [:]))
            guard state.jobs.isEmpty, state.applicationRecords.isEmpty, state.recordDrafts.isEmpty,
                  state.profile.resumeData == nil, state.profile.resumeName.isEmpty else { throw Self.rejected() }
            let bytes = try JSONEncoder().encode(state)
            try Self.writePrivate(bytes, to: path)
            let receipt = SeedReceipt(schemaVersion: 1, testID: configuration.testID,
                bootstrapSHA256: bootstrapSHA256, initialStateSHA256: Self.digest(bytes), onlyBlankConnection: true)
            try Self.writePrivate(JSONEncoder().encode(receipt), to: receiptPath)
        }
        let token = configuration.connection.sessionToken, logicalOrigin = configuration.connection.origin
        let credentials = NativeJourneyCredentials(account: credentialAccount, token: token)
        let transport = self.transport
        return NativeApplicationsStore(folder: folder, credentials: credentials, clientFactory: { origin, savedToken in
            guard origin.absoluteString == logicalOrigin, savedToken == token else { throw Self.rejected() }
            return try MobileApplicationClient(nativeJourneyTransport: transport, token: token)
        })
    }
    func makeDiscoveryStore() -> CareerDiscoveryStore {
        CareerDiscoveryStore(file: root.appendingPathComponent("discovery.json"),
            service: CareerDiscoveryClient(nativeJourneyTransport: transport))
    }
}

@MainActor
private final class NativeJourneyCredentials: ApplicationTokenStore {
    private let account: String
    private let token: String
    init(account: String, token: String) { self.account = account; self.token = token }
    func load(account: String) throws -> String? {
        guard account == self.account else {
            throw MobileApplicationError(message: "The isolated journey connection does not match this workspace.")
        }
        return token
    }
    func save(_ token: String, account: String) throws {
        throw MobileApplicationError(message: "The isolated journey cannot create another connection.")
    }
    func remove(account: String) throws {
        throw MobileApplicationError(message: "The isolated journey cannot remove its connection.")
    }
}
#endif
