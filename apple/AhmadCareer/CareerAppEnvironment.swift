import Foundation

/// Release builds always use the existing production storage and services.
/// Debug UI acceptance uses a UUID-scoped simulator folder and offline dependencies.
@MainActor
enum CareerAppEnvironment {
    private static var acceptanceRoot: URL? {
        #if DEBUG
        guard ProcessInfo.processInfo.arguments.contains("-career-ui-acceptance"),
              let raw = ProcessInfo.processInfo.environment["CAREER_UI_TEST_ID"], let id = UUID(uuidString: raw) else { return nil }
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("CareerFinderUIAcceptance", isDirectory: true).appendingPathComponent(id.uuidString, isDirectory: true)
        #else
        return nil
        #endif
    }
    static var isUIAcceptance: Bool { acceptanceRoot != nil }

    #if DEBUG
    enum BrowserLifecycleEvent: String {
        case bindingUpdate = "binding_update"
        case presenterDidAppear = "presenter_did_appear"
        case detachedBrowserObserved = "detached_browser_observed"
        case presentRequested = "present_requested"
        case presentCompleted = "present_completed"
        case delegateDidFinish = "delegate_did_finish"
        case presentationDidDismiss = "presentation_did_dismiss"
        case reportDismissalEntered = "report_dismissal_entered"
        case reportDismissalApplied = "report_dismissal_applied"
        case bindingAssignedFalse = "binding_assigned_false"
        case dismantleEntered = "dismantle_entered"
        case teardownDismissRequested = "teardown_dismiss_requested"
        case teardownDismissCompleted = "teardown_dismiss_completed"
        case dismantleFinished = "dismantle_finished"
        case capacityReached = "capacity_reached"
    }
    enum BrowserLifecycleFlag: String {
        case requestedPresentation, hasTrackedBrowser, hasObservedController, matchesTrackedBrowser
        case dismissalReported, dismantled, hasDismissCallback, presenterInWindow
        case presenterIsBeingPresented, presenterIsBeingDismissed, presentedControllerIsObserved
        case observedHasPresenter, observedIsBeingPresented, observedIsBeingDismissed, observedViewInWindow
        case bindingPresented, capacityReached
    }
    private static var browserLifecycleLoggingStopped = false

    /// The existing UUID-scoped acceptance root is the only destination. The
    /// payload has fixed event/flag names, uptime and booleans; no user text.
    /// Failure or capacity exhaustion must never change a presentation action.
    static func recordBrowserLifecycle(_ event: BrowserLifecycleEvent, flags: [BrowserLifecycleFlag: Bool]) {
        guard !browserLifecycleLoggingStopped, let root = acceptanceRoot else { return }
        let observedAt = ProcessInfo.processInfo.systemUptime
        let maximumBytes: UInt64 = 64 * 1024
        func encoded(_ event: BrowserLifecycleEvent, _ flags: [BrowserLifecycleFlag: Bool], uptime: TimeInterval) throws -> Data {
            let state = Dictionary(uniqueKeysWithValues: flags.map { ($0.key.rawValue, $0.value) })
            var bytes = try JSONSerialization.data(withJSONObject: [
                "event": event.rawValue, "uptime": uptime, "flags": state
            ], options: [.sortedKeys])
            bytes.append(0x0A)
            return bytes
        }
        do {
            let file = root.appendingPathComponent("browser-lifecycle.jsonl")
            let manager = FileManager.default
            try manager.createDirectory(at: root, withIntermediateDirectories: true)
            if !manager.fileExists(atPath: file.path) {
                guard manager.createFile(atPath: file.path, contents: Data(), attributes: [.posixPermissions: 0o600]) else {
                    browserLifecycleLoggingStopped = true; return
                }
            }
            let attributes = try manager.attributesOfItem(atPath: file.path)
            guard let kind = attributes[.type] as? FileAttributeType, kind == .typeRegular else {
                browserLifecycleLoggingStopped = true; return
            }
            let handle = try FileHandle(forWritingTo: file)
            defer { try? handle.close() }
            let size = try handle.seekToEnd()
            guard size <= maximumBytes else { browserLifecycleLoggingStopped = true; return }
            let bytes = try encoded(event, flags, uptime: observedAt)
            // Reserve room for a fixed marker so a capped trace is explicit.
            if size + UInt64(bytes.count) > maximumBytes - 512 {
                let marker = try encoded(.capacityReached, [.capacityReached: true], uptime: ProcessInfo.processInfo.systemUptime)
                if size + UInt64(marker.count) <= maximumBytes { try handle.write(contentsOf: marker) }
                browserLifecycleLoggingStopped = true
                return
            }
            try handle.write(contentsOf: bytes)
        } catch {
            browserLifecycleLoggingStopped = true
        }
    }

    enum OpportunityFocusEvent: String {
        case editorAppeared = "editor_appeared"
        case focusBindingChanged = "focus_binding_changed"
        case textEditingBegan = "text_editing_began"
        case textEditingEnded = "text_editing_ended"
        case keyboardWillShow = "keyboard_will_show"
        case keyboardDidShow = "keyboard_did_show"
        case keyboardWillHide = "keyboard_will_hide"
        case keyboardDidHide = "keyboard_did_hide"
        case doneActionEntered = "done_action_entered"
        case editorDisappeared = "editor_disappeared"
        case capacityReached = "capacity_reached"
    }
    enum OpportunityFocusField: String {
        case none, url, title, company, location, unknown
        init(binding: String?) {
            switch binding {
            case nil: self = .none
            case "url": self = .url
            case "title": self = .title
            case "company": self = .company
            case "location": self = .location
            default: self = .unknown
            }
        }
        init(nativeIdentifier: String?) {
            switch nativeIdentifier {
            case "opportunity.url": self = .url
            case "opportunity.title": self = .title
            case "opportunity.company": self = .company
            case "opportunity.location": self = .location
            default: self = .unknown
            }
        }
    }
    enum OpportunityFocusFlag: String {
        case bindingNone, bindingURL, bindingTitle, bindingCompany, bindingLocation, bindingUnknown
        case busy, sceneActive, hasNativeField, nativeIsFirstResponder, nativeHasWindow
        case nativeEnabled, nativeUserInteractionEnabled, nativeIdentifierKnown, capacityReached
    }
    private static var opportunityFocusLoggingStopped = false

    /// Passive, bounded observations for the existing UUID-scoped offline UI
    /// fixture only. No text/value, notification userInfo or raw identifier is
    /// serialized. Diagnostics failure never changes focus or an editor action.
    static func recordOpportunityFocus(_ event: OpportunityFocusEvent, field: OpportunityFocusField,
                                       flags: [OpportunityFocusFlag: Bool]) {
        guard !opportunityFocusLoggingStopped, let root = acceptanceRoot else { return }
        let observedAt = ProcessInfo.processInfo.systemUptime
        guard observedAt.isFinite, observedAt >= 0 else { opportunityFocusLoggingStopped = true; return }
        let maximumBytes: UInt64 = 64 * 1024
        func encoded(_ event: OpportunityFocusEvent, field: OpportunityFocusField,
                     flags: [OpportunityFocusFlag: Bool]) throws -> Data {
            let state = Dictionary(uniqueKeysWithValues: flags.map { ($0.key.rawValue, $0.value) })
            var bytes = try JSONSerialization.data(withJSONObject: [
                "event": event.rawValue, "field": field.rawValue, "uptime": observedAt, "flags": state
            ], options: [.sortedKeys])
            bytes.append(0x0A)
            return bytes
        }
        do {
            let file = root.appendingPathComponent("focus-lifecycle.jsonl")
            let manager = FileManager.default
            try manager.createDirectory(at: root, withIntermediateDirectories: true)
            if !manager.fileExists(atPath: file.path) {
                guard manager.createFile(atPath: file.path, contents: Data(), attributes: [.posixPermissions: 0o600]) else {
                    opportunityFocusLoggingStopped = true; return
                }
            }
            let attributes = try manager.attributesOfItem(atPath: file.path)
            guard let kind = attributes[.type] as? FileAttributeType, kind == .typeRegular else {
                opportunityFocusLoggingStopped = true; return
            }
            let handle = try FileHandle(forWritingTo: file)
            defer { try? handle.close() }
            let size = try handle.seekToEnd()
            guard size <= maximumBytes else { opportunityFocusLoggingStopped = true; return }
            let bytes = try encoded(event, field: field, flags: flags)
            if size + UInt64(bytes.count) > maximumBytes - 512 {
                let marker = try encoded(.capacityReached, field: .none, flags: [.capacityReached: true])
                if size + UInt64(marker.count) <= maximumBytes { try handle.write(contentsOf: marker) }
                opportunityFocusLoggingStopped = true
                return
            }
            try handle.write(contentsOf: bytes)
        } catch {
            opportunityFocusLoggingStopped = true
        }
    }
    #endif
    static func makeCareerStore() -> NativeCareerStore {
        NativeCareerStore(storageURL: acceptanceRoot?.appendingPathComponent("planning.json"))
    }
    static func makeApplicationsStore() -> NativeApplicationsStore {
        #if DEBUG
        if let root = acceptanceRoot {
            if ProcessInfo.processInfo.environment["CAREER_UI_NATIVE_JOURNEY"] == "blank-profile" {
                do { return try AcceptanceNativeJourney(root: root).makeApplicationsStore() }
                catch { preconditionFailure("The isolated blank-profile journey could not be opened.") }
            }
            if ProcessInfo.processInfo.environment["CAREER_UI_SAVED_COMPARISON"] == "two-openings" {
                let folder = root.appendingPathComponent("applications", isDirectory: true)
                let service = AcceptanceSavedComparison(root: root)
                do { try service.seedIfAbsent(folder: folder) }
                catch { preconditionFailure("The isolated Saved-comparison fixture could not be prepared.") }
                return NativeApplicationsStore(folder: folder, credentials: AcceptanceCredentials(),
                    clientFactory: { _, _ in service })
            }
            if ProcessInfo.processInfo.environment["CAREER_UI_APPLICATION_HISTORY"] == "cv-details" {
                let folder = root.appendingPathComponent("applications", isDirectory: true)
                let service = AcceptanceApplicationHistory(root: root)
                do { try service.seedIfAbsent(folder: folder) }
                catch { preconditionFailure("The isolated CV-history fixture could not be prepared.") }
                return NativeApplicationsStore(folder: folder, credentials: AcceptanceCredentials(connected: true),
                    clientFactory: { _, _ in service })
            }
            if let availability = ProcessInfo.processInfo.environment["CAREER_UI_APPLICATION_AVAILABILITY"],
               ["disabled", "unverified"].contains(availability) {
                let folder = root.appendingPathComponent("applications", isDirectory: true)
                do {
                    return try makeAvailabilityAcceptanceStore(folder: folder, liveEnabled: availability == "disabled" ? false : nil,
                        includeOrphanRecord: ProcessInfo.processInfo.environment["CAREER_UI_ORPHAN_RECORD"] == "1")
                } catch { preconditionFailure("The isolated availability fixture could not be prepared.") }
            }
            return NativeApplicationsStore(folder: root.appendingPathComponent("applications", isDirectory: true),
                credentials: AcceptanceCredentials(), clientFactory: { _, _ in
                    throw MobileApplicationError(message: "UI acceptance is offline. No application connection was made.")
                })
        }
        #endif
        return NativeApplicationsStore()
    }
    #if DEBUG
    /// Seed a new isolated fixture once. Relaunch must exercise the saved draft,
    /// including the store's normal fail-closed handling of unreadable files.
    static func makeAvailabilityAcceptanceStore(folder: URL, liveEnabled: Bool?, includeOrphanRecord: Bool = false) throws -> NativeApplicationsStore {
        let service = AcceptanceApplicationAvailability(liveEnabled: liveEnabled)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let path = folder.appendingPathComponent("phone-draft.json")
        if !FileManager.default.fileExists(atPath: path.path) {
            var state = PhoneApplicationState()
            state.connect(address: service.origin.absoluteString, workspace: service.workspaceID,
                          account: "offline-acceptance", server: try ApplicationServerProfile(service.profile))
            if includeOrphanRecord {
                let job: [String: ApplicationValue] = ["url": .string("https://jobs.example.com/retained-record"),
                    "title": .string("Record without a bookmark"), "company": .string("Synthetic employer")]
                var record = PhoneOpportunityRecord(scope: PhoneRecordScope(), job: PhoneRecordJob(job))
                record.stage = .applied; record.appliedElsewhere = true; record.note = "My private retained note"
                state.applicationRecords = [record]
            }
            do {
                // Exclusive creation also protects an existing file that appeared
                // after the check. Foundation forbids combining this with .atomic.
                try JSONEncoder().encode(state).write(to: path, options: .withoutOverwriting)
            } catch let error as CocoaError where error.code == .fileWriteFileExists {
                // Another initializer owns the existing bytes; the store reads them.
            }
        }
        return NativeApplicationsStore(folder: folder, credentials: AcceptanceCredentials(connected: true),
            clientFactory: { _, _ in service })
    }
    #endif
    static func makeDiscoveryStore() -> CareerDiscoveryStore {
        #if DEBUG
        if let root = acceptanceRoot {
            if ProcessInfo.processInfo.environment["CAREER_UI_NATIVE_JOURNEY"] == "blank-profile" {
                do { return try AcceptanceNativeJourney(root: root).makeDiscoveryStore() }
                catch { preconditionFailure("The isolated blank-profile discovery transport could not be opened.") }
            }
            if let raw = ProcessInfo.processInfo.environment["CAREER_UI_DISCOVERY_SEQUENCE"],
               let sequence = AcceptanceDiscoveryHistory.Sequence(rawValue: raw) {
                return CareerDiscoveryStore(file: root.appendingPathComponent("discovery.json"),
                    service: AcceptanceDiscoveryHistory(root: root, sequence: sequence))
            }
            return CareerDiscoveryStore(file: root.appendingPathComponent("discovery.json"), service: AcceptanceDiscovery())
        }
        #endif
        return CareerDiscoveryStore()
    }
}

#if DEBUG
@MainActor
private final class AcceptanceCredentials: ApplicationTokenStore {
    private let connected: Bool
    init(connected: Bool = false) { self.connected = connected }
    func load(account: String) throws -> String? { connected ? "offline-synthetic-token" : nil }
    func save(_ token: String, account: String) throws { throw MobileApplicationError(message: "UI acceptance does not save credentials.") }
    func remove(account: String) throws {}
}

/// Offline visibility checks only. No request can leave this DEBUG-only fixture.
@MainActor
private final class AcceptanceApplicationAvailability: MobileApplicationServing {
    let origin = URL(string: "https://career-ui.example")!
    let workspaceID = "offline-availability-workspace"
    var token: String?
    let liveEnabled: Bool?
    init(liveEnabled: Bool?) { self.liveEnabled = liveEnabled }
    var profile: [String: ApplicationValue] {
        var value = PhoneApplicationProfile().payload()
        value["revision"] = .number(0); value["resume"] = .null
        return value
    }
    func request(_ route: String, method: String, body: [String: ApplicationValue]?) async throws -> [String: ApplicationValue] {
        guard route == "workspace", method == "GET", body == nil else {
            throw MobileApplicationError(message: "UI acceptance is offline. No application was sent.")
        }
        var value: [String: ApplicationValue] = ["ok": .bool(true), "workspaceId": .string(workspaceID),
            "profile": .object(profile), "jobs": .array([]), "attempts": .array([]),
            "recoverablePlans": .array([]), "activePlanIds": .array([]), "mode": .string("local")]
        if let liveEnabled { value["capabilities"] = .object(["liveEnabled": .bool(liveEnabled)]) }
        return value
    }
    func invalidate() {}
}

@MainActor
private final class AcceptanceDiscovery: CareerDiscoveryServing {
    // A separately enabled offline journey fails this matching search once,
    // then returns real matching fixture results on the user's Retry action.
    // The existing permanent-failure fixture and Release service are unchanged.
    private var recoveryFailurePending = ProcessInfo.processInfo.environment["CAREER_UI_DISCOVERY_RETRY_ONCE"] == "1"
    // Structured offline failures exercise the same deadline contract as HTTP
    // Retry-After: 0 and a short future wait; no employer request is made.
    private var rateLimitDelay: TimeInterval? = ["0": 0, "30": 30][ProcessInfo.processInfo.environment["CAREER_UI_DISCOVERY_RATE_LIMIT_ONCE"] ?? ""]
    private let source = DiscoverySource(id: "lever:global:career-fixture", name: "Synthetic employer", provider: "lever",
        region: "global", board: "career-fixture", boardUrl: "https://jobs.lever.co/career-fixture")
    func catalog() async throws -> DiscoveryCatalog {
        DiscoveryCatalog(ok: true, version: 1, defaultSources: [source.id], sources: [source],
            limits: DiscoveryLimits(maxSources: 4, pageSize: 50, maxJobsPerSource: 500), notice: "Offline synthetic UI acceptance. No employer requests.")
    }
    func search(_ query: DiscoveryQuery, cursor: String?) async throws -> DiscoveryPage {
        if query.keywords == "offline error" { throw URLError(.notConnectedToInternet) }
        if let delay = rateLimitDelay, query.keywords == "Interface designer", cursor == nil {
            rateLimitDelay = nil
            throw DiscoveryFailure(message: "Search is temporarily busy. Wait before trying again.",
                retryAfter: Date().addingTimeInterval(delay))
        }
        if recoveryFailurePending && query.keywords == "Interface designer" && cursor == nil {
            recoveryFailurePending = false
            throw URLError(.notConnectedToInternet)
        }
        let checked = ISO8601DateFormatter().string(from: Date())
        let all = [
            DiscoveryJob(id: "fixture-design", sourceId: source.id, sourceName: source.name, provider: "lever",
                title: "Interface designer", company: "Synthetic employer", url: "https://jobs.lever.co/career-fixture/11111111-1111-4111-8111-111111111111",
                location: "Remote · eligible locations to confirm", country: nil, remote: true,
                summary: "Synthetic job for offline UI acceptance. Review an employer's actual requirements before applying.",
                publishedAt: nil, updatedAt: nil, checkedAt: checked, stale: false),
            DiscoveryJob(id: "fixture-engineer", sourceId: source.id, sourceName: source.name, provider: "lever",
                title: "Software engineer", company: "Synthetic employer", url: "https://jobs.lever.co/career-fixture/22222222-2222-4222-8222-222222222222",
                location: "Toronto, Canada", country: "CA", remote: nil,
                summary: "Synthetic job for offline UI acceptance. No application is sent by this fixture.",
                publishedAt: nil, updatedAt: nil, checkedAt: checked, stale: false)
        ]
        let jobs = all.filter {
            (query.keywords.isEmpty || ($0.title + " " + $0.company).localizedCaseInsensitiveContains(query.keywords))
                && (query.location.isEmpty || $0.location.localizedCaseInsensitiveContains(query.location))
                && (!query.remoteOnly || $0.remote == true)
        }
        return DiscoveryPage(ok: true, version: 1, generatedAt: checked, status: "complete", jobs: jobs,
            sources: [DiscoverySourceStatus(id: source.id, name: source.name, provider: source.provider, boardUrl: source.boardUrl,
                status: "fresh", checkedAt: checked, availableCount: all.count, matchedCount: jobs.count, limited: false, error: nil)],
            nextCursor: nil, totalMatches: jobs.count, limited: false, notice: "Offline synthetic fixture; no employer requests.")
    }
}
#endif
