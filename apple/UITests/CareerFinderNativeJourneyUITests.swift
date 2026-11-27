#if CAREER_NATIVE_JOURNEY
import XCTest

/// Opt-in only: actual production clients, hosted handlers and OS document UI.
/// The host owns fresh private bootstrap/TLS/board controls; this test never sees
/// API credentials, changes a store, or supplies a completed profile or PDF.
@MainActor
final class CareerFinderNativeJourneyUITests: ApplicationHistoryUITestCase {
    private struct HostReply: Decodable {
        let schemaVersion: Int
        let testID: String
        let sequence: Int
        let checkpoint: String
        let ok: Bool
        let facts: Facts
    }
    private struct Facts: Decodable {
        let zeroDispatch: Bool
        let sourceAndOwnerBound: Bool
        let profileRevision: Int
        let resumeName: String?
        let resumeSHA256: String?
        let jobCount: Int
        let attemptCount: Int
        let planID: String?
        let attemptID: String?
        let jobID: String?
        let immutableAUnchanged: Bool?
        let pickerCancelUnchanged: Bool?
        let persistedRestartUnchanged: Bool?
        let followUpDay: String?
    }
    private enum Checkpoint: String {
        case blank, contactSaved, jobSaved, pickerCancelled, profileA, preparedA, profileB
        case followUpSaved, closeSecondary, closedResult, outage, outageResult, networkDisconnected, networkFailure, restarted, finished
    }
    private var sequence = 0
    private var documentURLs: [String: URL] = [:]
    private var followUpDay = ""
    private var controlDirectory: URL!
    private var runnerContainerID = ""
    private let sourceID = "lever:global:synthetic-native-journey"
    private let primaryID = "20000000-0000-4000-8000-000000000001"
    private let secondaryID = "20000000-0000-4000-8000-000000000002"
    private let titleA = "Service Designer"
    private let titleB = "Senior Service Designer"
    private let pdfSHA = "fccbd3962e482d8b24bea10c69ec047e0879cc55cf3c3b3222909bd89108b86a"
    private let note = "Synthetic follow-up: review the role and my questions."
    private var currentFilename: String?
    private var profileVersionA = 0
    private var prepared: Facts?

    private func finite(_ frame: CGRect) -> Bool {
        [frame.minX, frame.minY, frame.width, frame.height].allSatisfy(\.isFinite)
            && frame.width > 0 && frame.height > 0
    }
    override func viewport(_ app: XCUIApplication) -> CGRect {
        var bounds = super.viewport(app)
        guard finite(bounds) else { return .null }
        if app.keyboards.count == 1 {
            let keyboard = app.keyboards.element.frame
            guard finite(keyboard) else { return .null }
            bounds.size.height = min(bounds.maxY, keyboard.minY - 8) - bounds.minY
        } else if app.keyboards.count > 1 { return .null }
        if modalNavigationTitle == nil {
            let review = app.buttons.matching(NSPredicate(format: "identifier == %@", "applications.review"))
            if review.count == 1 {
                let frame = review.element.frame
                guard finite(frame) else { return .null }
                bounds.size.height = min(bounds.maxY, frame.minY - 20) - bounds.minY
            } else if review.count > 1 { return .null }
        }
        return bounds
    }
    override func record(_ name: String, app: XCUIApplication, anchor: XCUIElement? = nil) {
        let prefix = "native-journey-\(language)-\(name)"
        if name.hasPrefix("failure-") { attachGlobalScreen(prefix + "-global-screen") }
        let png = XCTAttachment(screenshot: app.screenshot()); png.name = prefix; png.lifetime = .keepAlways; add(png)
        let ax = XCTAttachment(string: app.debugDescription); ax.name = prefix + "-original-AX"; ax.lifetime = .keepAlways; add(ax)
        var value: [String: Any] = ["schemaVersion": 1, "testID": fixtureID, "language": language,
            "appFrame": String(describing: app.frame), "contentViewport": String(describing: viewport(app)),
            "keyboardCount": app.keyboards.count, "checkpointSequence": sequence,
            "runnerContainerID": runnerContainerID,
            "scope": "Actual synthetic UI/OS/hosted journey. No application approval or dispatch; provider, VoiceOver and release acceptance excluded."]
        if let anchor {
            value["anchor"] = ["identifier": anchor.identifier, "type": String(describing: anchor.elementType),
                "label": anchor.label, "value": anchor.value as? String ?? "", "frame": String(describing: anchor.frame),
                "liveHittable": String(anchor.isHittable)]
        }
        let data = try! JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys])
        let geometry = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        geometry.name = prefix + "-geometry"; geometry.lifetime = .keepAlways; add(geometry)
    }
    private func attachGlobalScreen(_ name: String) {
        let image = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        image.name = name; image.lifetime = .keepAlways; add(image)
    }
    private func attachPickerHierarchy(_ name: String, app: XCUIApplication) {
        attachGlobalScreen(name + "-global-screen")
        let hierarchy = XCTAttachment(string: app.debugDescription)
        hierarchy.name = name + "-AX"; hierarchy.lifetime = .keepAlways; add(hierarchy)
    }
    private func exactButton(_ label: String, app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label == %@", label)).element
    }
    private func identifiedButton(_ id: String, app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "identifier == %@", id)).element
    }
    private func systemText(_ label: String, app: XCUIApplication) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label == %@", label)).element
    }
    private func configure(_ language: String) throws {
        self.language = language; phase = "actual-journey"; sequence = 0
        let environment = ProcessInfo.processInfo.environment
        let suffix = language.uppercased()
        guard let raw = environment["CAREER_NATIVE_JOURNEY_ID_" + suffix], let id = UUID(uuidString: raw),
              let day = environment["CAREER_NATIVE_JOURNEY_FOLLOWUP_DAY"],
              day.range(of: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$", options: .regularExpression) != nil else {
            throw ObservationFailure.failed
        }
        let dayFormat = DateFormatter(); dayFormat.calendar = Calendar(identifier: .gregorian)
        dayFormat.locale = Locale(identifier: "en_US_POSIX"); dayFormat.dateFormat = "yyyy-MM-dd"
        guard let date = dayFormat.date(from: day), dayFormat.string(from: date) == day,
              date > Calendar(identifier: .gregorian).startOfDay(for: Date()),
              Calendar(identifier: .gregorian).isDate(date, equalTo: Date(), toGranularity: .month) else {
            throw ObservationFailure.failed
        }
        fixtureID = id.uuidString; followUpDay = day
        for name in ["CV-A.pdf", "CV-B.pdf"] {
            let key = "CAREER_NATIVE_JOURNEY_" + (name == "CV-A.pdf" ? "PDF_A_" : "PDF_B_") + suffix
            guard let raw = environment[key], let url = URL(string: raw),
                  let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
                  parts.scheme == "https", parts.host == "127.0.0.1", parts.port != nil,
                  parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
                  parts.path.range(of: "^/__native-journey-documents/[a-f0-9]{48}/" + name.replacingOccurrences(of: ".", with: "\\.") + "$",
                    options: .regularExpression) != nil else { throw ObservationFailure.failed }
            documentURLs[name] = url
        }
        guard documentURLs["CV-A.pdf"]?.deletingLastPathComponent() == documentURLs["CV-B.pdf"]?.deletingLastPathComponent() else {
            throw ObservationFailure.failed
        }
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        runnerContainerID = UUID(uuidString: documents.deletingLastPathComponent().lastPathComponent)?.uuidString ?? "unavailable"
        controlDirectory = documents
            .appendingPathComponent("NativeJourneyControl", isDirectory: true).appendingPathComponent(fixtureID, isDirectory: true)
        try FileManager.default.createDirectory(at: controlDirectory, withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700])
        guard try FileManager.default.contentsOfDirectory(atPath: controlDirectory.path).isEmpty else {
            throw ObservationFailure.failed
        }
        if XCUIDevice.shared.orientation != .portrait { XCUIDevice.shared.orientation = .portrait }
    }
    private func checkpoint(_ name: Checkpoint, app: XCUIApplication) throws -> Facts {
        sequence += 1
        try require((1...16).contains(sequence), "Only the sixteen fixed journey checkpoints are admitted", app: app)
        let prefix = String(format: "%03d", sequence)
        let request = controlDirectory.appendingPathComponent(prefix + "-request.json")
        let response = controlDirectory.appendingPathComponent(prefix + "-response.json")
        let fields: [String: Any] = ["schemaVersion": 1, "testID": fixtureID, "sequence": sequence, "checkpoint": name.rawValue]
        let bytes = try JSONSerialization.data(withJSONObject: fields, options: [.sortedKeys])
        let pending = controlDirectory.appendingPathComponent(".pending-" + prefix + "-" + UUID().uuidString + ".json")
        try bytes.write(to: pending, options: .withoutOverwriting)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: pending.path)
        let replyDeadline = ProcessInfo.processInfo.systemUptime + 5
        try FileManager.default.moveItem(at: pending, to: request)
        try wait("The owned host verifies checkpoint " + name.rawValue, app: app) {
            FileManager.default.fileExists(atPath: response.path)
        }
        let resource = try response.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
        try require(resource.isRegularFile == true && resource.isSymbolicLink == false
            && (resource.fileSize ?? 0) > 0 && (resource.fileSize ?? 0) <= 16_384,
            "A host reply is a bounded regular private file", app: app)
        let attributes = try FileManager.default.attributesOfItem(atPath: response.path)
        try require((attributes[.posixPermissions] as? NSNumber)?.intValue == 0o600,
            "The owned response has private file permissions", app: app)
        let data = try Data(contentsOf: response)
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let factObject = object?["facts"] as? [String: Any]
        let allowedFacts = Set(["zeroDispatch", "sourceAndOwnerBound", "profileRevision", "resumeName", "resumeSHA256",
            "jobCount", "attemptCount", "planID", "attemptID", "jobID", "immutableAUnchanged", "pickerCancelUnchanged",
            "persistedRestartUnchanged", "followUpDay"])
        try require(data.count <= 16_384 && Set(object?.keys.map { $0 } ?? []) ==
            Set(["schemaVersion", "testID", "sequence", "checkpoint", "ok", "facts"])
            && factObject != nil && Set(factObject!.keys).isSubset(of: allowedFacts),
            "Only the fixed safe host reply schema is accepted", app: app)
        let reply = try JSONDecoder().decode(HostReply.self, from: data)
        try require(reply.schemaVersion == 1 && reply.testID == fixtureID && reply.sequence == sequence
            && reply.checkpoint == name.rawValue && reply.ok && reply.facts.zeroDispatch && reply.facts.sourceAndOwnerBound
            && reply.facts.profileRevision >= 0 && (0...200).contains(reply.facts.jobCount)
            && (0...500).contains(reply.facts.attemptCount)
            && [reply.facts.planID, reply.facts.attemptID, reply.facts.jobID].compactMap({ $0 }).allSatisfy({ UUID(uuidString: $0) != nil }),
            "Only this owned source-bound, zero-dispatch checkpoint can advance", app: app)
        try require(ProcessInfo.processInfo.systemUptime <= replyDeadline,
            "The complete bounded host reply is validated inside the same five-second deadline", app: app)
        let evidence = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        evidence.name = "native-journey-" + language + "-checkpoint-" + prefix + "-" + name.rawValue
        evidence.lifetime = .keepAlways; add(evidence)
        return reply.facts
    }
    override func launch() throws -> XCUIApplication {
        modalNavigationTitle = nil
        let app = XCUIApplication()
        app.launchArguments = ["-career-ui-acceptance", "-AppleLanguages", "(\(language))",
            "-AppleLocale", language == "ar" ? "ar_JO" : "en_US",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launchEnvironment["CAREER_UI_TEST_ID"] = fixtureID
        app.launchEnvironment["CAREER_UI_NATIVE_JOURNEY"] = "blank-profile"
        app.launch()
        var readyFrame: CGRect?
        try wait("The actual isolated app opens with five tabs", app: app) {
            guard let snapshot = try? app.snapshot() else { return false }
            var pending: [any XCUIElementSnapshot] = [snapshot]
            var offlineMarkers = 0
            var tabBars: [any XCUIElementSnapshot] = []
            while let element = pending.popLast() {
                if element.elementType == .staticText && element.identifier == "acceptance.offline" {
                    offlineMarkers += 1
                }
                if element.elementType == .tabBar { tabBars.append(element) }
                pending.append(contentsOf: element.children)
            }
            guard offlineMarkers == 1, tabBars.count == 1 else { return false }
            pending = tabBars[0].children
            var tabButtons = 0
            while let element = pending.popLast() {
                if element.elementType == .button { tabButtons += 1 }
                pending.append(contentsOf: element.children)
            }
            guard tabButtons == 5 else { return false }
            readyFrame = snapshot.frame
            return true
        }
        try require(readyFrame.map { finite($0) && $0.height > $0.width } == true,
            "The actual isolated app is portrait", app: app)
        return app
    }
    private func realKeyboard(_ app: XCUIApplication, bounds: CGRect) throws {
        let start = ProcessInfo.processInfo.systemUptime, deadline = start + 5
        let label = localized("delete", "حذف")
        let keyboard = app.keyboards.firstMatch
        let keys = keyboard.keys.matching(NSPredicate(
            format: "identifier == %@ AND label == %@", "delete", label))
        while ProcessInfo.processInfo.systemUptime < deadline {
            // One snapshot and one live query use the same OS keyboard. A
            // separate key snapshot can exhaust the strict five-second gate.
            let observed = try? keyboard.snapshot()
            let keyboardSnapshotEnd = ProcessInfo.processInfo.systemUptime
            guard keyboardSnapshotEnd < deadline else { break }
            var frames: [CGRect] = []
            if let observed, observed.elementType == .keyboard {
                var pending: [any XCUIElementSnapshot] = [observed]
                while let element = pending.popLast() {
                    if element.elementType == .key && element.identifier == "delete" && element.label == label {
                        frames.append(element.frame)
                    }
                    pending.append(contentsOf: element.children.reversed())
                }
            }
            print("Native journey keyboard identities: exact=\(frames.count); snapshot=\(keyboardSnapshotEnd - start)")
            let positions = frames.count == 1 ? [0] : frames.count == 2 ? [1, 0] : []
            for index in positions where finite(frames[index]) && frames[index].intersects(bounds) {
                guard ProcessInfo.processInfo.systemUptime < deadline else { break }
                let hit = keys.element(boundBy: index).isHittable
                let finished = ProcessInfo.processInfo.systemUptime
                print("Native journey real-key observation: index=\(index); snapshot=\(keyboardSnapshotEnd - start); end=\(finished - start); hit=\(hit); late=\(finished > deadline)")
                if hit && finished <= deadline { return }
            }
            let remaining = deadline - ProcessInfo.processInfo.systemUptime
            if remaining > 0 { RunLoop.current.run(until: Date().addingTimeInterval(min(0.1, remaining))) }
        }
        try require(false, "A fresh exact real delete key must be visible and currently hittable inside five seconds", app: app)
    }
    private func enterEmpty(_ field: XCUIElement, text: String, app: XCUIApplication) throws {
        // The app's portrait frame is stable across focusing a text field.
        // Capture it before the touch; the later key snapshot and live hit test
        // still verify the focused OS keyboard inside the original five seconds.
        let bounds = app.frame
        try require(finite(bounds) && bounds.height > bounds.width,
            "The app has a finite portrait frame before keyboard focus", app: app)
        try tap(field, app: app)
        try realKeyboard(app, bounds: bounds)
        try require(whole(field, app: app), "The focused field is wholly above the keyboard before typing", app: app)
        let old = field.value as? String ?? ""
        try require(old.isEmpty || old == field.placeholderValue,
            "This blank-profile journey never replaces an unexpected existing value", app: app)
        field.typeText(text)
        try wait("The actual field contains the exact fictional input", app: app) { (field.value as? String) == text }
    }
    private func endTyping(_ app: XCUIApplication) throws {
        try chromeTap(exactButton(localized("Done typing", "انتهيت من الكتابة"), app: app), app: app)
        try wait("The actual keyboard dismisses", app: app) { app.keyboards.count == 0 }
    }
    private func openProfile(_ app: XCUIApplication) throws {
        try tab("Apply", "التقديم", app: app)
        try tap(item("applications.profile", app: app), app: app, forward: false)
        modalNavigationTitle = localized("Application profile", "ملف التقديم")
        try wait("The unique actual profile editor opens", app: app) {
            navigationBars(modalNavigationTitle!, app: app).count == 1 && item("application.firstName", app: app).exists
        }
    }
    private func closeProfile(_ app: XCUIApplication, save: Bool) throws {
        let title = modalNavigationTitle!
        try nav(save ? localized("Save", "حفظ") : localized("Cancel", "إلغاء"), app: app)
        try wait("The profile editor closes through its actual action", app: app) {
            modalIsClosed(title, app: app) && !item("application.firstName", app: app).exists
        }
        modalNavigationTitle = nil
    }
    private func choosePDFButton(_ app: XCUIApplication) -> XCUIElement {
        exactButton(currentFilename ?? localized("Choose your PDF CV", "اختيار سيرتك الذاتية بصيغة PDF"), app: app)
    }
    private func probeArabicFilesBrowseAfterCancelTimeout(_ app: XCUIApplication) {
        guard language == "ar" else { return }
        let root = app.otherElements.matching(NSPredicate(format: "identifier == %@",
            "DOC.browsingRoot Source: com.apple.DocumentManager.RecentDocuments, Title: الحديثة"))
        let tabs = app.tabBars.matching(NSPredicate(format: "identifier == %@", "DOC.browsingModeTabBar"))
        let browse = tabs.buttons.matching(NSPredicate(format: "label == %@", "تصفح"))
        let deadline = ProcessInfo.processInfo.systemUptime + 5
        var ready = false
        while ProcessInfo.processInfo.systemUptime < deadline {
            let matched = root.count == 1 && tabs.count == 1 && browse.count == 1
                && whole(browse.element, app: app, chrome: true)
            let finished = ProcessInfo.processInfo.systemUptime
            if matched && finished <= deadline { ready = true; break }
            if finished >= deadline { break }
            RunLoop.current.run(until: Date().addingTimeInterval(min(0.1, deadline - finished)))
        }
        attachPickerHierarchy("native-journey-ar-files-recent-probe", app: app)
        guard ready, whole(browse.element, app: app, chrome: true) else { return }
        browse.element.tap()
        attachPickerHierarchy("native-journey-ar-files-browse-probe", app: app)
    }
    private func waitForFilesPresentation(_ app: XCUIApplication) throws {
        let rootID = "DOC.browsingRoot Source: com.apple.DocumentManager.RecentDocuments, Title: "
            + localized("Recents", "الحديثة")
        let navID = "FullDocumentManagerViewControllerNavigationBar"
        let start = ProcessInfo.processInfo.systemUptime, deadline = start + 20
        func exactFilesHierarchy(_ description: String) -> Bool {
            let lines = description.split(separator: "\n")
            let roots = lines.enumerated().filter { _, line in
                let element = line.trimmingCharacters(in: .whitespaces)
                return element.hasPrefix("Other,") && element.contains("identifier: '\(rootID)'")
            }
            guard roots.count == 1 else { return false }
            let (rootIndex, rootLine) = roots[0]
            let rootIndent = rootLine.prefix(while: { $0 == " " }).count
            var navigationBars = 0
            for line in lines.dropFirst(rootIndex + 1) {
                let indent = line.prefix(while: { $0 == " " }).count
                if indent <= rootIndent { break }
                let element = line.trimmingCharacters(in: .whitespaces)
                if element.hasPrefix("NavigationBar,") && element.contains("identifier: '\(navID)'") {
                    navigationBars += 1
                }
            }
            return navigationBars == 1
        }
        var presented = false
        while ProcessInfo.processInfo.systemUptime < deadline {
            // A remote Files view can be absent from app.snapshot() while it is
            // present in the live AX hierarchy. Inspect one hierarchy per poll.
            let hierarchy = app.debugDescription
            if exactFilesHierarchy(hierarchy) && ProcessInfo.processInfo.systemUptime <= deadline {
                presented = true; break
            }
            let remaining = deadline - ProcessInfo.processInfo.systemUptime
            if remaining > 0 { RunLoop.current.run(until: Date().addingTimeInterval(min(0.1, remaining))) }
        }
        try require(presented, "The exact OS Files Recent root and navigation appear inside twenty seconds", app: app)
    }
    private func cancelPicker(_ app: XCUIApplication) throws {
        try openProfile(app)
        try tap(choosePDFButton(app), app: app)
        modalNavigationTitle = nil
        try waitForFilesPresentation(app)
        let cancel = app.navigationBars.matching(NSPredicate(format: "identifier == %@", "FullDocumentManagerViewControllerNavigationBar")).buttons.matching(NSPredicate(format: "label == %@", localized("Cancel", "إلغاء"))).element
        let start = ProcessInfo.processInfo.systemUptime, deadline = start + 5
        var cancelReady = false
        while ProcessInfo.processInfo.systemUptime < deadline {
            let matched = whole(cancel, app: app, chrome: true)
            let finished = ProcessInfo.processInfo.systemUptime
            if matched && finished <= deadline { cancelReady = true; break }
            if finished >= deadline { break }
            RunLoop.current.run(until: Date().addingTimeInterval(min(0.1, deadline - finished)))
        }
        if !cancelReady {
            probeArabicFilesBrowseAfterCancelTimeout(app)
            try require(false, "The exact OS picker Cancel is wholly visible and hittable (no accepted observation inside five seconds)", app: app)
        }
        try require(whole(cancel, app: app, chrome: true),
            "The exact OS picker Cancel remains visible and hittable before its single touch", app: app)
        cancel.tap()
        modalNavigationTitle = localized("Application profile", "ملف التقديم")
        try wait("Picker cancellation returns without selecting a PDF", app: app) { choosePDFButton(app).exists }
        try capture("picker-cancelled", anchor: choosePDFButton(app), app: app)
        try closeProfile(app, save: false)
        let facts = try checkpoint(.pickerCancelled, app: app)
        try require(facts.resumeName == nil && facts.pickerCancelUnchanged == true,
            "OS picker cancellation changes neither the profile nor stored document bytes", app: app)
    }
    private func saveFromSafari(_ name: String, app: XCUIApplication) throws {
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        // This disposable-device Safari is explicitly English for both product
        // locales. No app token or bridge capability accompanies a PDF request.
        safari.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        safari.open(documentURLs[name]!)
        // The observed compact Safari layout renders this PDF inline. Its
        // unfocused address shows only the host, so verify the full current URL
        // through the actual address editor before opening its Share menu.
        let tips = safari.otherElements.matching(NSPredicate(format: "identifier == %@", "TipView"))
        let tipClose = tips.buttons.matching(NSPredicate(format: "identifier == %@ AND label == %@", "xmark.circle.fill", "Close"))
        let compactAddress = safari.textFields.matching(NSPredicate(format: "identifier == %@ AND label == %@", "TabBarItemTitle", "Address"))
        let startPages = safari.collectionViews.matching(NSPredicate(format: "identifier == %@", "StartPageCollectionView"))
        let onboardingCards = startPages.cells.matching(NSPredicate(format: "identifier == %@",
            "onboardingItemIdentifierContent-CustomizeStartPage"))
        let onboardingClose = onboardingCards.buttons.matching(NSPredicate(format: "label == %@", "close"))
        enum FirstUse { case onboarding, tip, address }
        var firstUse: FirstUse?
        func touchIfStillLive(_ controls: XCUIElementQuery) -> Bool {
            let deadline = ProcessInfo.processInfo.systemUptime + 5
            guard controls.count == 1 && ProcessInfo.processInfo.systemUptime <= deadline else { return false }
            let control = controls.element
            guard whole(control, app: safari, chrome: true),
                  ProcessInfo.processInfo.systemUptime <= deadline else { return false }
            control.tap()
            return true
        }
        try wait("Safari exposes its observed first-use control or compact address", app: safari) {
            if startPages.count == 1 && onboardingCards.count == 1 && onboardingClose.count == 1
                && whole(onboardingClose.element, app: safari, chrome: true) {
                firstUse = .onboarding; return true
            }
            if tips.count == 1 && tipClose.count == 1 && whole(tipClose.element, app: safari, chrome: true) {
                firstUse = .tip; return true
            }
            if tips.count == 0 && compactAddress.count == 1 && whole(compactAddress.element, app: safari, chrome: true) {
                firstUse = .address; return true
            }
            return false
        }
        if firstUse == .onboarding {
            // Safari can replace this card with its separate TipView while an
            // AX query is in flight. A disappeared card receives no touch.
            _ = touchIfStillLive(onboardingClose)
            try wait("Safari exposes its observed tip or compact address after onboarding", app: safari) {
                if tips.count == 1 && tipClose.count == 1 && whole(tipClose.element, app: safari, chrome: true) {
                    firstUse = .tip; return true
                }
                if tips.count == 0 && compactAddress.count == 1 && whole(compactAddress.element, app: safari, chrome: true) {
                    firstUse = .address; return true
                }
                return false
            }
        }
        if firstUse == .tip { _ = touchIfStillLive(tipClose) }
        try chromeTap(compactAddress.element, app: safari)
        let address = safari.textFields.matching(NSPredicate(format: "identifier == %@ AND label == %@", "URL", "Address"))
        let requestedURL = documentURLs[name]!.absoluteString
        try wait("Safari's current full address exactly identifies the requested PDF", app: safari) {
            address.count == 1 && address.element.value as? String == requestedURL
                && whole(address.element, app: safari, chrome: true)
        }
        try require(address.count == 1 && address.element.value as? String == requestedURL,
            "The full PDF URL is unchanged before closing its address editor", app: safari)
        try chromeTap(identifiedButton("CancelBarItemButton", app: safari), app: safari)
        try chromeTap(identifiedButton("MoreMenuButton", app: safari), app: safari)
        let share = safari.otherElements.matching(NSPredicate(format: "identifier == %@", "TabBarMoreMenu"))
            .buttons.matching(NSPredicate(format: "identifier == %@ AND label == %@", "ShareButton", "Share"))
        try chromeTap(share.element, app: safari)
        let shareSheets = safari.otherElements.matching(NSPredicate(format: "identifier == %@", "ActivityListView"))
        let shareName = shareSheets.otherElements.matching(NSPredicate(format: "identifier == %@ AND label == %@",
            "LP.CaptionBar.TopCaption", String(name.dropLast(4))))
        let shareMetadata = shareSheets.otherElements.matching(NSPredicate(format: "identifier == %@ AND label == %@",
            "LP.CaptionBar.BottomCaption", "PDF Document · 609 bytes"))
        func exactSharedPDF() -> Bool {
            shareSheets.count == 1 && shareName.count == 1 && shareMetadata.count == 1
                && whole(shareName.element, app: safari, chrome: true) && whole(shareMetadata.element, app: safari, chrome: true)
        }
        try wait("The actual Share sheet names this PDF and its 609-byte size", app: safari) { exactSharedPDF() }
        let viewMore = shareSheets.cells.matching(NSPredicate(format: "identifier == %@ AND label == %@", "actionGroupCell", "View More"))
        try chromeTap(viewMore.element, app: safari)
        let saveToFiles = shareSheets.cells.matching(NSPredicate(format: "identifier == %@ AND label == %@", "actionGroupCell", "Save to Files"))
        try wait("The exact named PDF exposes its observed Save to Files action", app: safari) {
            exactSharedPDF() && saveToFiles.count == 1 && whole(saveToFiles.element, app: safari, chrome: true)
        }
        try require(exactSharedPDF() && saveToFiles.count == 1 && whole(saveToFiles.element, app: safari, chrome: true),
            "The same PDF and unique Save to Files action remain valid before their single touch", app: safari)
        saveToFiles.element.tap()
        let localDestinations = safari.otherElements.matching(NSPredicate(format: "identifier == %@",
            "DOC.browsingRoot Source: com.apple.FileProvider.LocalStorage, Title: Downloads"))
        let destinationBars = localDestinations.navigationBars.matching(NSPredicate(format: "identifier == %@",
            "FullDocumentManagerViewControllerNavigationBar"))
        let filenames = safari.textFields.matching(NSPredicate(format: "identifier == %@", "DOCPicker.filenameTextField"))
        let saveButtons = destinationBars.buttons.matching(NSPredicate(format: "label == %@", "Save"))
        func exactLocalPDF() -> Bool {
            localDestinations.count == 1 && destinationBars.count == 1 && filenames.count == 1 && saveButtons.count == 1
                && (filenames.element.value as? String) == String(name.dropLast(4))
                && whole(destinationBars.element, app: safari, chrome: true)
                && whole(filenames.element, app: safari, chrome: true) && whole(saveButtons.element, app: safari, chrome: true)
        }
        try wait("Save to Files names the real local destination and this exact PDF", app: safari) { exactLocalPDF() }
        let destination = destinationBars.element
        try require(exactLocalPDF(),
            "The real local destination, exact filename and unique Save control are whole and currently reachable", app: safari)
        record("safari-save-to-files-" + name, app: safari, anchor: destination)
        try wait("The same local PDF and Save control remain ready", app: safari) { exactLocalPDF() }
        try require(exactLocalPDF(),
            "The same local destination, exact filename and unique Save control remain valid before their single touch", app: safari)
        saveButtons.element.tap()
        try wait("The OS Save to Files sheet closes", app: safari) {
            safari.navigationBars.buttons.matching(NSPredicate(format: "label == %@", "Save")).count == 0
        }
        app.activate()
        try wait("The existing app resumes without a seed or profile change", app: app) { item("applications.profile", app: app).exists }
    }
    private func importPDF(_ name: String, app: XCUIApplication) throws {
        try saveFromSafari(name, app: app)
        try openProfile(app); try tap(choosePDFButton(app), app: app)
        modalNavigationTitle = nil
        let stem = String(name.dropLast(4))
        let pickerRoots = app.otherElements.matching(NSPredicate(format: "identifier == %@",
            "DOC.browsingRoot Source: com.apple.DocumentManager.RecentDocuments, Title: "
                + localized("Recents", "الحديثة")))
        let fileViews = pickerRoots.collectionViews.matching(NSPredicate(format: "identifier == %@", "File View"))
        let documents = fileViews.cells.matching(NSPredicate(format: "identifier == %@", stem + ", pdf"))
        let filenames = documents.staticTexts.matching(NSPredicate(format: "label == %@ OR label == %@", name, stem))
        func exactDocument() -> Bool {
            guard pickerRoots.count == 1, fileViews.count == 1, documents.count == 1, filenames.count == 1 else { return false }
            return documents.element.isEnabled
                && whole(documents.element, app: app, chrome: true)
                && whole(filenames.element, app: app, chrome: true)
        }
        try wait("The actual OS picker exposes the uniquely named PDF", app: app) { exactDocument() }
        try require(exactDocument(), "The exact system document cell and filename are wholly visible and hittable", app: app)
        record("os-picker-" + name, app: app, anchor: documents.element)
        try require(exactDocument(),
            "The same unique system PDF cell and filename remain valid before their single touch", app: app)
        documents.element.tap()
        modalNavigationTitle = localized("Application profile", "ملف التقديم")
        currentFilename = name
        try wait("The normal fileImporter and PDF validator accept the selected filename", app: app) {
            navigationBars(modalNavigationTitle!, app: app).count == 1 && choosePDFButton(app).exists
        }
        try capture("selected-" + name, anchor: choosePDFButton(app), app: app)
        try closeProfile(app, save: true)
    }
    private func search(_ app: XCUIApplication, first: Bool) throws {
        try tab("Search", "البحث", app: app)
        if navigationBars(localized("Opportunity", "فرصة"), app: app).count == 1 {
            try chromeTap(app.navigationBars.buttons.matching(NSPredicate(format: "label == %@", localized("Search jobs", "البحث عن وظائف"))).element, app: app)
        }
        if first {
            try tap(identifiedButton("discovery.chooseBoards", app: app), app: app)
            modalNavigationTitle = localized("Employer boards", "صفحات وظائف جهات العمل")
            let board = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Synthetic Native Journey Studio")).element
            try wait("The actual directory exposes the one synthetic employer board", app: app) { board.exists }
            try tap(board, app: app)
            try wait("The actual board selection is enabled", app: app) {
                (board.value as? String) == localized("Selected", "محدد")
            }
            try nav(localized("Done", "تم"), app: app)
            let boardTitle = modalNavigationTitle!
            try wait("The employer-board sheet closes", app: app) { modalIsClosed(boardTitle, app: app) }
            modalNavigationTitle = nil
            try enterEmpty(item("discovery.keywords", app: app), text: titleA, app: app); try endTyping(app)
            try enterEmpty(item("discovery.location", app: app), text: "Riyadh", app: app)
            record("search-input-keyboard", app: app, anchor: item("discovery.location", app: app)); try endTyping(app)
        }
        try tap(identifiedButton("discovery.search", app: app), app: app, forward: false)
        try wait("The actual search finishes", app: app) { !identifiedButton("discovery.cancel", app: app).exists }
    }
    private func discoveryRow(_ id: String, app: XCUIApplication) -> XCUIElement {
        identifiedButton("discovery.job." + sourceID + ":" + id, app: app)
    }
    private func openDiscovery(_ id: String, app: XCUIApplication) throws {
        try tap(discoveryRow(id, app: app), app: app)
        try wait("The exact discovery detail opens", app: app) { navigationBars(localized("Opportunity", "فرصة"), app: app).count == 1 }
    }
    private func showActivity(_ app: XCUIApplication) throws {
        try tab("Apply", "التقديم", app: app)
        let picker = app.segmentedControls.matching(NSPredicate(format: "identifier == %@", "applications.viewPicker")).element
        let activity = picker.buttons.matching(NSPredicate(format: "label == %@", localized("Activity", "النشاط"))).element
        try tap(activity, app: app)
        try wait("The actual Activity selection is active", app: app) { activity.isSelected }
    }
    private func historicalA(_ app: XCUIApplication, name: String) throws {
        try showActivity(app)
        let context = "attempt." + prepared!.attemptID!
        let state = item("application.state." + context, app: app)
        try reveal(state, app: app)
        try require(normalized(state.label) == localized("Prepared draft", "مسودة جاهزة للمراجعة"),
            "The unapproved attempt remains a prepared draft", app: app)
        let draftDetails = exactButton(localized("Draft details", "تفاصيل المسودة"), app: app)
        try reveal(draftDetails, app: app)
        try require(whole(draftDetails, app: app)
            && !exactButton(localized("Receipt details", "تفاصيل إيصال الإرسال"), app: app).exists,
            "An unapproved prepared draft is not labelled as a delivery receipt", app: app)
        let resume = detail(context, suffix: ".resume", app: app)
        if !resume.exists { try openDetails(context, filename: "CV-A.pdf", revision: revisionText(profileVersionA), app: app) }
        else {
            try reveal(resume, app: app)
            try require(normalized(resume.label).contains("CV-A.pdf"), "An already expanded disclosure retains A", app: app)
            let revision = detail(context, suffix: ".revision", app: app)
            try reveal(revision, app: app)
            try require(normalized(revision.label + " " + (revision.value as? String ?? "")).contains(revisionText(profileVersionA)),
                "The already expanded immutable revision remains A", app: app)
        }
        try capture(name, anchor: detail(context, suffix: ".resume", app: app), app: app,
            companions: [detail(context, suffix: ".revision", app: app)])
    }
    private func savedRecord(_ app: XCUIApplication) throws {
        try tab("Saved", "المحفوظات", app: app)
        let row = app.buttons.matching(NSPredicate(format:
            "label BEGINSWITH %@ AND NOT (identifier BEGINSWITH %@)", titleA, "saved.comparison.")).element
        try tap(row, app: app)
        try wait("The actual saved detail opens", app: app) { item("record.edit", app: app).exists }
    }
    private func followUp(_ app: XCUIApplication) throws {
        try savedRecord(app); try tap(item("record.edit", app: app), app: app)
        modalNavigationTitle = localized("Your application record", "سجل تقديمك")
        try wait("The actual private record editor opens", app: app) { navigationBars(modalNavigationTitle!, app: app).count == 1 }
        let wrapper = item("record.hasFollowUp", app: app)
        try reveal(wrapper, app: app)
        let control = wrapper.descendants(matching: .switch).element
        try require(wrapper.descendants(matching: .switch).count == 1,
            "The exact follow-up wrapper has one actual native switch", app: app)
        try tap(control, app: app)
        try wait("The actual follow-up switch enables its date", app: app) { item("record.followUpDate", app: app).exists }
        try tap(item("record.followUpDate", app: app), app: app)
        let format = DateFormatter(); format.locale = Locale(identifier: "en_US_POSIX"); format.dateFormat = "yyyy-MM-dd"
        guard let day = format.date(from: followUpDay) else { throw ObservationFailure.failed }
        let labels = ["en_US", "ar_JO"].map { locale -> String in
            let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: locale); formatter.dateStyle = .full
            return formatter.string(from: day)
        }
        let dayButton = app.buttons.matching(NSPredicate(format: "label IN %@", labels)).element
        try chromeTap(dayButton, app: app)
        // The system calendar's exact full-date label remains an explicit runtime
        // prerequisite. No date binding, store mutation or guessed coordinate.
        let dismissCalendar = exactButton(localized("Done", "تم"), app: app)
        try chromeTap(dismissCalendar, app: app)
        try enterEmpty(item("record.note", app: app), text: note, app: app); try endTyping(app)
        record("followup-editor", app: app, anchor: item("record.note", app: app))
        try chromeTap(identifiedButton("record.save", app: app), app: app)
        let modal = modalNavigationTitle!
        try wait("The actual record save completes", app: app) { modalIsClosed(modal, app: app) && item("record.edit", app: app).exists }
        modalNavigationTitle = nil
        let facts = try checkpoint(.followUpSaved, app: app)
        try require(facts.followUpDay == followUpDay && facts.immutableAUnchanged == true,
            "The private follow-up persists without changing employer review data", app: app)
        try capture("followup-saved", anchor: item("record.stageSummary", app: app), app: app)
    }
    private func savedHistory(_ app: XCUIApplication, captureName: String) throws {
        try showActivity(app)
        let notice = app.staticTexts.matching(NSPredicate(format: "identifier == %@", "applications.savedHistoryNotice")).element
        try reveal(notice, app: app)
        let label = normalized(notice.label)
        try require(whole(notice, app: app)
            && label.hasPrefix(localized("Saved history from ", "سجل محفوظ بتاريخ "))
            && label.hasSuffix(localized(". Connect and refresh to check the latest status.", ". اتصل وحدّث للتحقق من أحدث حالة."))
            && !exactButton(localized("Export application receipts", "تصدير إيصالات التقديم"), app: app).exists,
            "Saved history is visibly labelled as last known and offers no fresh receipt export", app: app)
        try capture(captureName, anchor: notice, app: app)
    }
    private func loseNetwork(_ app: XCUIApplication) throws {
        try showActivity(app)
        let header = text(localized("TEST WORKSPACE", "مساحة عمل اختبارية"), app: app)
        try reveal(header, app: app, forward: false)
        let message = app.staticTexts.matching(NSPredicate(format: "identifier == %@", "applications.message")).element
        if message.exists {
            try tap(exactButton(localized("Dismiss message", "إخفاء الرسالة"), app: app), app: app, forward: false)
            try wait("Only the existing Dismiss action clears the old message", app: app) { !message.exists }
        }
        try reveal(header, app: app, forward: false)
        let content = app.scrollViews.matching(NSPredicate(format: "identifier == %@", "applications.content"))
        let bounds = viewport(app)
        try require(!message.exists && whole(header, app: app) && content.count == 1
            && finite(content.element.frame) && content.element.frame.contains(bounds) && content.element.isHittable,
            "The actual Applications scroll view and top header are reachable before one refresh pull", app: app)
        let disconnected = try checkpoint(.networkDisconnected, app: app)
        try require(disconnected.profileRevision == 3 && disconnected.resumeName == "CV-B.pdf"
            && disconnected.immutableAUnchanged == true, "Only the owned listener closes; the real saved workspace is unchanged", app: app)
        // One genuine downward pull in the measured content viewport invokes
        // production .refreshable; no model method, injected result or retry.
        try require(whole(header, app: app) && content.count == 1 && content.element.isHittable,
            "The same fresh UI target remains reachable after listener closure", app: app)
        try scroll(-170, app: app)
        try wait("The real offline URLSession refresh reports a new visible failure", app: app) {
            message.exists && !normalized(message.label).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                && whole(message, app: app)
        }
        let failed = try checkpoint(.networkFailure, app: app)
        try require(failed.profileRevision == 3 && failed.resumeName == "CV-B.pdf" && failed.immutableAUnchanged == true,
            "A real transport failure leaves the hosted and private saved state unchanged", app: app)
        try capture("network-loss-message", anchor: message, app: app)
        try savedHistory(app, captureName: "network-loss-saved-history")
        try historicalA(app, name: "network-loss-prepared-a")
    }
    private func restoredFollowUp(_ app: XCUIApplication) throws {
        let parts = followUpDay.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3,
              let day = Calendar(identifier: .gregorian).date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12)) else {
            throw ObservationFailure.failed
        }
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: language)
        formatter.calendar = Calendar(identifier: .gregorian); formatter.dateStyle = .medium; formatter.timeStyle = .none
        let prefix = localized("Follow-up date · ", "تاريخ المتابعة · ")
        let date = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", prefix)).element
        try reveal(date, app: app)
        try require(whole(date, app: app) && normalized(date.label) == prefix + formatter.string(from: day),
            "The actual returning-user record displays the same private follow-up day", app: app)
        let savedNote = text(note, app: app)
        try reveal(savedNote, app: app)
        try require(whole(savedNote, app: app), "The actual returning-user record displays the exact original private note", app: app)
        try capture("restart-followup", anchor: item("record.stageSummary", app: app), app: app, companions: [date, savedNote])
    }
    private func connectionStatus(_ app: XCUIApplication) throws {
        try tab("Settings", "الإعدادات", app: app)
        try tap(item("settings.connection", app: app), app: app)
        modalNavigationTitle = localized("Application connection", "اتصال التقديم")
        let status = text(localized("Your application workspace is connected.", "مساحة التقديم متصلة."), app: app)
        try wait("The existing connection is shown without signing in or changing it", app: app) { status.exists }
        try capture("connection-status", anchor: status, app: app)
        try nav(localized("Done", "تم"), app: app)
        let title = modalNavigationTitle!
        try wait("Read-only connection inspection closes", app: app) { modalIsClosed(title, app: app) }
        modalNavigationTitle = nil
    }
    private func journey(_ language: String) throws {
        try configure(language)
        var app = try launch()
        try tab("Apply", "التقديم", app: app)
        let blank = try checkpoint(.blank, app: app)
        try require(blank.profileRevision == 0 && blank.resumeName == nil && blank.jobCount == 0 && blank.attemptCount == 0,
            "Only a real blank connection exists before UI work", app: app)
        try capture("blank-profile", anchor: item("profile.essential.name", app: app), app: app)
        try openProfile(app)
        try enterEmpty(item("application.firstName", app: app), text: "Jamie", app: app); try endTyping(app)
        try enterEmpty(item("application.email", app: app), text: "jamie.native@example.com", app: app); try endTyping(app)
        try closeProfile(app, save: true)
        let contact = try checkpoint(.contactSaved, app: app)
        try require(contact.profileRevision > 0 && contact.resumeName == nil, "Actual contact save does not invent a CV", app: app)
        try search(app, first: true); try openDiscovery(primaryID, app: app)
        try capture("opening-details", anchor: text(titleA, app: app), app: app)
        try tap(identifiedButton("discovery.saveOpportunity", app: app), app: app)
        try wait("The real saved state replaces Save with an honest status", app: app) { app.staticTexts.matching(identifier: "discovery.saved").element.exists }
        try require(!identifiedButton("discovery.saveOpportunity", app: app).exists,
            "The same detail cannot save a second duplicate", app: app)
        try capture("saved-deduplicated", anchor: app.staticTexts.matching(identifier: "discovery.saved").element, app: app)
        let saved = try checkpoint(.jobSaved, app: app)
        try require(saved.jobCount == 1, "Exactly one canonical job is saved by the real handler", app: app)
        try cancelPicker(app)
        try importPDF("CV-A.pdf", app: app)
        let a = try checkpoint(.profileA, app: app)
        try require(a.resumeName == "CV-A.pdf" && a.resumeSHA256 == pdfSHA && a.profileRevision > contact.profileRevision,
            "The actual chooser A produces the exact uploaded bytes and a new profile revision", app: app)
        profileVersionA = a.profileRevision
        let opportunity = app.buttons.matching(NSPredicate(format: "label CONTAINS %@ AND value == %@",
            titleA, localized("Not selected", "غير محدد"))).element
        try tap(opportunity, app: app)
        try chromeTap(identifiedButton("applications.review", app: app), app: app)
        modalNavigationTitle = localized("Review applications", "مراجعة الطلبات")
        try wait("The actual unapproved review opens", app: app) { reviewContainers(app).count == 1 }
        let preparedA = try checkpoint(.preparedA, app: app)
        try require(preparedA.attemptCount == 1 && preparedA.planID != nil && preparedA.jobID != nil && preparedA.attemptID != nil,
            "Prepare created one real synthetic unapproved attempt", app: app)
        prepared = preparedA
        let reviewContext = "review." + preparedA.planID! + "." + preparedA.jobID!
        try openDetails(reviewContext, filename: "CV-A.pdf", revision: revisionText(profileVersionA), app: app)
        try capture("unapproved-review-a", anchor: detail(reviewContext, suffix: ".resume", app: app), app: app,
            companions: [detail(reviewContext, suffix: ".revision", app: app)])
        try nav(localized("Back", "رجوع"), app: app)
        let reviewTitle = modalNavigationTitle!
        try wait("Back closes the unapproved review", app: app) { modalIsClosed(reviewTitle, app: app) }
        modalNavigationTitle = nil
        try historicalA(app, name: "prepared-a")
        try importPDF("CV-B.pdf", app: app)
        let b = try checkpoint(.profileB, app: app)
        try require(b.resumeName == "CV-B.pdf" && b.resumeSHA256 == pdfSHA && b.profileRevision > profileVersionA
            && b.attemptCount == 1 && b.immutableAUnchanged == true,
            "Same bytes with filename B update only the current profile; immutable prepared A survives", app: app)
        try historicalA(app, name: "history-a-current-b")
        try followUp(app); try connectionStatus(app)
        try search(app, first: false); try openDiscovery(secondaryID, app: app)
        _ = try checkpoint(.closeSecondary, app: app)
        try tap(identifiedButton("discovery.saveOpportunity", app: app), app: app)
        try wait("The closed link is retained locally while its hosted synchronization is checked", app: app) {
            app.staticTexts.matching(identifier: "discovery.saved").element.exists && !identifiedButton("discovery.saveOpportunity", app: app).exists
        }
        let closed = try checkpoint(.closedResult, app: app)
        try require(closed.jobCount == 1 && closed.immutableAUnchanged == true,
            "The rejected hosted save keeps the earlier server job, local closed link and immutable review", app: app)
        let closedMessage = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@",
            localized("The employer no longer lists this posting. No application was sent.",
                "لم تعد جهة العمل تعرض هذه الوظيفة. لم يُرسل أي طلب تقديم."))).element
        try wait("The rejected posting is explained as closed, not as a profile conflict", app: app) { closedMessage.exists }
        try capture("closed-posting", anchor: closedMessage, app: app)
        _ = try checkpoint(.outage, app: app)
        try search(app, first: false)
        let unavailable = try checkpoint(.outageResult, app: app)
        try require(unavailable.jobCount == 1 && unavailable.resumeName == "CV-B.pdf"
            && unavailable.immutableAUnchanged == true, "A board outage cannot erase private career work", app: app)
        try wait("The completed unavailable-board request reports retained or earlier results", app: app) {
            !item("discovery.cancel", app: app).exists
                && (item("discovery.error", app: app).exists || discoveryRow(primaryID, app: app).exists)
        }
        record("board-outage-retained", app: app)
        try loseNetwork(app)
        app.terminate()
        try wait("The target process actually stops before restart", app: app) { app.state == .notRunning }
        app = try launch()
        let restored = try checkpoint(.restarted, app: app)
        try require(restored.persistedRestartUnchanged == true && restored.resumeName == "CV-B.pdf" && restored.profileRevision == 3
            && restored.immutableAUnchanged == true && restored.followUpDay == followUpDay,
            "A new offline app process retains B3, original A2 and the private follow-up without reseeding", app: app)
        try openProfile(app)
        try capture("restart-current-b", anchor: choosePDFButton(app), app: app); try closeProfile(app, save: false)
        try savedHistory(app, captureName: "restart-saved-history")
        try historicalA(app, name: "restart-prepared-a")
        try savedRecord(app)
        try restoredFollowUp(app)
        _ = try checkpoint(.finished, app: app)
        app.terminate()
    }

    func testBlankProfileJourneyEnglish() throws { try journey("en") }
    func testBlankProfileJourneyArabic() throws { try journey("ar") }
}
#endif
