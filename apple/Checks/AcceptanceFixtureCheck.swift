import Foundation
import Darwin

/// Calls the same DEBUG-only factory as the app. No Keychain, network, simulator,
/// production folder or persisted language preference is accessed by this gate.
@MainActor
private final class AcceptanceFixtureSuite {
    var checks = 0
    var folders: [URL] = []
    func check(_ condition: @autoclosure () -> Bool, _ message: String) throws {
        guard condition() else { throw MobileApplicationError(message: "FAILED: " + message) }
        checks += 1
    }
    func folder() -> URL {
        let result = FileManager.default.temporaryDirectory.appendingPathComponent("career-acceptance-init-" + UUID().uuidString)
        folders.append(result); return result
    }
    func path(_ folder: URL) -> URL { folder.appendingPathComponent("phone-draft.json") }
    func read(_ folder: URL) throws -> PhoneApplicationState {
        try JSONDecoder().decode(PhoneApplicationState.self, from: Data(contentsOf: path(folder)))
    }
    func cleanup() { for folder in folders { try? FileManager.default.removeItem(at: folder) } }

    func run() async throws {
        // The exact two availability modes used by the UI suite both preserve a
        // real store write across repeated initialization with the same test ID.
        let availabilityModes: [Bool?] = [false, nil]
        for enabled in availabilityModes {
            let root = folder()
            let first = try CareerAppEnvironment.makeAvailabilityAcceptanceStore(folder: root, liveEnabled: enabled, includeOrphanRecord: true)
            let seeded = try read(root)
            try check(first.connected && first.profile.firstName.isEmpty && first.profile.resumeData == nil,
                      "A fresh availability fixture starts connected to its offline service with a blank profile")
            try check(seeded.applicationRecords.count == 1 && seeded.applicationRecords[0].scope.isLocal,
                      "The requested record-only history is seeded once in its original local scope")
            var profile = first.profile
            profile.firstName = "Saved"; profile.email = "saved@example.invalid"
            try profile.selectResume(SyntheticPDF.onePage, filename: "Private CV.pdf")
            try check(first.keepProfileDraft(profile, context: first.editContext), "The actual store saves a private profile and PDF draft")
            let unfinished = PhoneOpportunityDraft(url: "https://jobs.example.com/unfinished", title: "Unfinished role")
            try check(first.keepOpportunityDraft(unfinished), "The actual store saves unfinished opportunity text")
            let before = try Data(contentsOf: path(root))

            let reopened = try CareerAppEnvironment.makeAvailabilityAcceptanceStore(folder: root, liveEnabled: enabled, includeOrphanRecord: true)
            let after = try Data(contentsOf: path(root)), restored = try read(root)
            try check(after == before, "Relaunch initialization leaves every existing draft byte unchanged")
            try check(reopened.profile == profile && reopened.profileNeedsSync && reopened.opportunityDraft == unfinished,
                      "The saved profile, selected PDF and unfinished opportunity survive the real initializer")
            try check(restored.applicationRecords == seeded.applicationRecords && restored.workspaceDrafts == seeded.workspaceDrafts,
                      "Repeated seeding cannot replace, duplicate or move private records or inactive workspace drafts")
            let refreshed = await reopened.refresh()
            try check(refreshed && reopened.liveSubmissionEnabled == enabled && !reopened.submissionAvailable,
                      "The offline fixture reports disabled or unknown sending capability without enabling submission")
            try check(reopened.profile == profile && reopened.profileNeedsSync && reopened.opportunityDraft == unfinished,
                      "A blank offline server snapshot cannot overwrite a locally edited draft after relaunch")
            let refreshedState = try read(root)
            try check(refreshedState.applicationRecords == seeded.applicationRecords && refreshedState.profile.resumeData == SyntheticPDF.onePage,
                      "Refresh retains exact CV bytes and record-only history")

            let independentRoot = folder()
            let independent = try CareerAppEnvironment.makeAvailabilityAcceptanceStore(folder: independentRoot, liveEnabled: enabled)
            let independentState = try read(independentRoot)
            try check(independent.profile.firstName.isEmpty && independent.profile.resumeData == nil && !independent.opportunityDraft.hasContent,
                      "A different acceptance folder cannot inherit another folder's private work")
            try check(independentState.applicationRecords.isEmpty, "A fresh folder without the orphan option has no invented history")
            let independentBytes = try Data(contentsOf: path(independentRoot))
            _ = try CareerAppEnvironment.makeAvailabilityAcceptanceStore(folder: independentRoot, liveEnabled: enabled, includeOrphanRecord: true)
            let repeatedIndependentBytes = try Data(contentsOf: path(independentRoot))
            try check(repeatedIndependentBytes == independentBytes, "Changing seed options later cannot inject a record into an existing workspace")

            // Existing account scope and Stop intent are never reset to the
            // synthetic workspace just because an acceptance app relaunches.
            var scoped = refreshedState
            var serverProfile = PhoneApplicationProfile().payload()
            serverProfile["revision"] = .number(0); serverProfile["resume"] = .null
            scoped.connect(address: "https://second.example", workspace: "private-workspace-b", account: "private-account-b",
                           server: try ApplicationServerProfile(serverProfile))
            var secondProfile = scoped.profile; secondProfile.firstName = "Private B"
            scoped.retainDraft(secondProfile, basedOn: 0); scoped.holdSubmissions(["held-review-b"])
            let scopedBytes = try JSONEncoder().encode(scoped)
            try scopedBytes.write(to: path(root), options: .atomic)
            let otherScope = try CareerAppEnvironment.makeAvailabilityAcceptanceStore(folder: root, liveEnabled: enabled, includeOrphanRecord: true)
            let preservedScopeBytes = try Data(contentsOf: path(root))
            try check(preservedScopeBytes == scopedBytes && otherScope.workspaceScope == scoped.recordScope && otherScope.profile == secondProfile,
                      "Existing account identity, archived A draft and B profile remain exact on initializer re-entry")
            try check(otherScope.heldPlanIDs == ["held-review-b"], "Initializer re-entry preserves restrictive Stop intent")
            let mismatchedRefresh = await otherScope.refresh()
            let afterMismatchedRefresh = try Data(contentsOf: path(root))
            try check(!mismatchedRefresh && afterMismatchedRefresh == scopedBytes,
                      "An offline fixture response for another workspace fails closed without changing the existing account bytes")
        }

        // Corrupt and unsupported drafts must reach the real store's read-only
        // recovery state, rather than being replaced with a fresh fixture.
        var future = PhoneApplicationState(); future.applicationRecordSchema = 99
        let rejected: [(String, Data)] = [
            ("corrupt", Data([0xff, 0x00, 0x7b])),
            ("unsupported", try JSONEncoder().encode(future))
        ]
        for (name, bytes) in rejected {
            let root = folder()
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            try bytes.write(to: path(root), options: .withoutOverwriting)
            let store = try CareerAppEnvironment.makeAvailabilityAcceptanceStore(folder: root, liveEnabled: false, includeOrphanRecord: true)
            let preserved = try Data(contentsOf: path(root))
            try check(preserved == bytes && !store.connected, "The \(name) file is preserved without a synthetic replacement or connection")
            var replacement = PhoneApplicationProfile(); replacement.firstName = "Must not replace saved data"
            try check(!store.keepProfileDraft(replacement, context: store.editContext), "The real store rejects edits over a \(name) file")
            let afterRejectedWrite = try Data(contentsOf: path(root))
            try check(afterRejectedWrite == bytes, "A refused save leaves the \(name) bytes exact")
        }
    }
}

@main
struct AcceptanceFixtureCheck {
    @MainActor static func main() async {
        let suite = AcceptanceFixtureSuite(); defer { suite.cleanup() }
        do {
            try await suite.run()
            print("PASS \(suite.checks) actual acceptance-initializer preservation assertions")
        } catch {
            fputs(error.localizedDescription + "\n", stderr)
            exit(1)
        }
    }
}
