#if DEBUG
import Foundation

/// A launch-selected, UUID-scoped transport for the separate search-history UI
/// journeys. It never constructs an HTTP client or reads production storage.
@MainActor
final class AcceptanceDiscoveryHistory: CareerDiscoveryServing {
    enum Sequence: String, Codable { case ab, bc, cb, unavailable }
    private struct Event: Codable {
        let kind: String
        let sequence: Sequence
        let returnedIDs: [String]
    }
    private struct Receipt: Codable {
        let schemaVersion: Int
        let fixtureID: String
        let sourceID: String
        let networkImplementation: Bool
        var events: [Event]
    }

    private let root: URL
    private let sequence: Sequence
    private let checked = "2026-11-21T18:00:00.000Z"
    private let source = DiscoverySource(id: "lever:global:synthetic-harbor-research",
        name: "Synthetic Harbor Research Studio", provider: "lever", region: "global",
        board: "synthetic-harbor-research", boardUrl: "https://jobs.lever.co/synthetic-harbor-research")

    init(root: URL, sequence: Sequence) { self.root = root; self.sequence = sequence }

    private func record(_ kind: String, returnedIDs: [String] = []) throws {
        guard UUID(uuidString: root.lastPathComponent) != nil else {
            throw DiscoveryFailure(message: "The synthetic search fixture requires its isolated UUID folder.")
        }
        let file = root.appendingPathComponent("search-history-fixture.json")
        var receipt = Receipt(schemaVersion: 1, fixtureID: root.lastPathComponent, sourceID: source.id,
                              networkImplementation: false, events: [])
        if FileManager.default.fileExists(atPath: file.path) {
            let bytes = try Data(contentsOf: file)
            guard bytes.count <= 64 * 1_024 else { throw CocoaError(.coderInvalidValue) }
            receipt = try JSONDecoder().decode(Receipt.self, from: bytes)
            guard receipt.schemaVersion == 1, receipt.fixtureID == root.lastPathComponent,
                  receipt.sourceID == source.id, !receipt.networkImplementation,
                  receipt.events.count < 64 else { throw CocoaError(.coderInvalidValue) }
        }
        receipt.events.append(Event(kind: kind, sequence: sequence, returnedIDs: returnedIDs))
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(receipt).write(to: file, options: .atomic)
    }

    func catalog() async throws -> DiscoveryCatalog {
        try record("catalog")
        return DiscoveryCatalog(ok: true, version: 1, defaultSources: [source.id], sources: [source],
            limits: DiscoveryLimits(maxSources: 4, pageSize: 50, maxJobsPerSource: 500),
            notice: "Offline synthetic search-history fixture. No employer requests.")
    }

    func search(_ query: DiscoveryQuery, cursor: String?) async throws -> DiscoveryPage {
        guard cursor == nil, query.keywords.isEmpty, query.location.isEmpty, !query.remoteOnly,
              query.sources.isEmpty || query.sources == [source.id] else {
            try record("rejected")
            throw DiscoveryFailure(message: "The synthetic search fixture rejected an unexpected request.")
        }
        let all = [
            job(101, title: "Service Designer", location: "Amman", country: "JO", remote: false),
            job(102, title: "Service Designer", location: "Toronto", country: "CA", remote: false),
            job(103, title: "Senior Service Designer", location: "Remote", country: "GB", remote: true)
        ]
        let jobs: [DiscoveryJob]
        switch sequence {
        case .ab: jobs = [all[0], all[1]]
        // The matched web response also places the Senior role first. The next
        // sequence deliberately changes order without introducing an identity.
        case .bc: jobs = [all[2], all[1]]
        case .cb: jobs = [all[1], all[2]]
        case .unavailable: jobs = []
        }
        try record("search", returnedIDs: jobs.map(\.id))
        let unavailable = sequence == .unavailable
        return DiscoveryPage(ok: true, version: 1, generatedAt: checked,
            status: unavailable ? "unavailable" : "complete", jobs: jobs,
            sources: [DiscoverySourceStatus(id: source.id, name: source.name, provider: source.provider,
                boardUrl: source.boardUrl, status: unavailable ? "unavailable" : "fresh",
                checkedAt: unavailable ? nil : checked, availableCount: jobs.count, matchedCount: jobs.count,
                limited: false, error: unavailable ? DiscoveryProviderIssue(code: "provider_unavailable",
                    message: "Synthetic employer board is unavailable.") : nil)],
            nextCursor: nil, totalMatches: jobs.count, limited: false,
            notice: "Offline synthetic search-history fixture. No employer requests.")
    }

    private func job(_ number: Int, title: String, location: String, country: String, remote: Bool) -> DiscoveryJob {
        let posting = "10000000-0000-4000-8000-" + String(format: "%012d", number)
        return DiscoveryJob(id: source.id + ":" + posting, sourceId: source.id, sourceName: source.name,
            provider: source.provider, title: title, company: source.name, url: source.boardUrl + "/" + posting,
            location: location, country: country, remote: remote,
            summary: "Fictional search-history observation only. No real employer receives requests.",
            publishedAt: nil, updatedAt: nil, checkedAt: checked, stale: false)
    }
}
#endif
