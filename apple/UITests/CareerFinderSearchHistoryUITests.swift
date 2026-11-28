import XCTest

/// Separate synthetic journeys. The existing 17 acceptance methods are not
/// inherited, edited, selected or counted by these focused before/after runs.
@MainActor
class SearchHistoryUITestCase: XCTestCase {
    enum ObservationFailure: Error { case failed }
    let source = "lever:global:synthetic-harbor-research"
    var fixtureID = ""
    var language = "en"
    var phase = ""
    var failureCount = 0

    override func setUpWithError() throws { continueAfterFailure = false }
    func roleID(_ number: Int) -> String { source + ":10000000-0000-4000-8000-" + String(format: "%012d", number) }
    func item(_ id: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "identifier == %@", id)).element
    }
    func role(_ number: Int, in app: XCUIApplication) -> XCUIElement { item("discovery.job." + roleID(number), in: app) }
    func normalized(_ text: String) -> String {
        text.replacingOccurrences(of: "\u{2068}", with: "").replacingOccurrences(of: "\u{2069}", with: "")
    }
    func countLabel(_ count: Int) -> String {
        if language == "ar" { return count == 1 ? "فرصة جديدة في هذا البحث: 1" : "فرص جديدة في هذا البحث: \(count)" }
        return count == 1 ? "1 role new to this search" : "\(count) roles new to this search"
    }
    var badgeLabel: String { language == "ar" ? "جديدة في هذا البحث" : "New to this search" }

    func record(_ name: String, app: XCUIApplication) {
        let prefix = "history-\(language)-\(phase)-\(name)"
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = prefix; screenshot.lifetime = .keepAlways; add(screenshot)
        let ax = XCTAttachment(string: app.debugDescription)
        ax.name = prefix + "-original-AX"; ax.lifetime = .keepAlways; add(ax)
        let identifiers = ["discovery.summary", "discovery.newCount", "discovery.newOnly", "discovery.error", "discovery.showAll"]
            + [101, 102, 103].map { "discovery.job." + roleID($0) }
        let elements: [[String: String]] = identifiers.map { identifier in
            let element = item(identifier, in: app)
            guard element.exists else { return ["identifier": identifier, "exists": "false"] }
            return ["identifier": identifier, "exists": "true", "frame": String(describing: element.frame),
                    "label": element.label, "value": element.value as? String ?? "",
                    "liveHittable": String(element.isHittable)]
        }
        let receipt: [String: Any] = ["schemaVersion": 1, "fixtureID": fixtureID, "language": language,
            "phase": phase, "appFrame": String(describing: app.frame), "contentViewport": String(describing: viewport(app)),
            "keyboardExists": app.keyboards.firstMatch.exists, "elements": elements,
            "scope": "Synthetic simulator capture; not VoiceOver, a physical device, provider readiness or release acceptance."]
        if let bytes = try? JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys]),
           let text = String(data: bytes, encoding: .utf8) {
            let geometry = XCTAttachment(string: text)
            geometry.name = prefix + "-geometry"; geometry.lifetime = .keepAlways; add(geometry)
        }
    }
    func require(_ condition: Bool, _ message: String, app: XCUIApplication) throws {
        if !condition {
            failureCount += 1; record("failure-\(failureCount)", app: app)
            XCTFail(message); throw ObservationFailure.failed
        }
        XCTAssertTrue(condition, message)
    }
    func wait(_ message: String, app: XCUIApplication, _ condition: () -> Bool) throws {
        let start = ProcessInfo.processInfo.systemUptime, deadline = start + 5
        while ProcessInfo.processInfo.systemUptime < deadline {
            let matched = condition(), finished = ProcessInfo.processInfo.systemUptime
            if matched && finished <= deadline {
                print("Search-history observation passed in \(finished - start)s: \(message)"); return
            }
            if finished >= deadline { break }
            RunLoop.current.run(until: Date().addingTimeInterval(min(0.1, deadline - finished)))
        }
        try require(false, message + " (no accepted observation inside five seconds)", app: app)
    }
    func viewport(_ app: XCUIApplication) -> CGRect {
        let frame = app.frame
        var top = frame.minY + 8, bottom = frame.maxY - 8
        if app.navigationBars.firstMatch.exists { top = max(top, app.navigationBars.firstMatch.frame.maxY + 4) }
        if app.tabBars.firstMatch.exists { bottom = min(bottom, app.tabBars.firstMatch.frame.minY - 8) }
        return CGRect(x: frame.minX + 8, y: top, width: frame.width - 16, height: bottom - top)
    }
    func whole(_ element: XCUIElement, app: XCUIApplication) -> Bool {
        guard element.exists else { return false }
        let frame = element.frame, bounds = viewport(app)
        guard [frame.minX, frame.minY, frame.width, frame.height, bounds.minX, bounds.minY, bounds.width, bounds.height].allSatisfy(\.isFinite),
              frame.width > 0, frame.height > 0, bounds.width > 0, bounds.height > 120 else { return false }
        return bounds.contains(frame) && element.isHittable
    }
    func scroll(_ distance: CGFloat, app: XCUIApplication) throws {
        let bounds = viewport(app), frame = app.frame
        try require([bounds.minX, bounds.minY, bounds.width, bounds.height].allSatisfy(\.isFinite)
                    && bounds.height > 120 && bounds.width > 0, "A fresh usable viewport is required before scrolling", app: app)
        let amount = min(abs(distance), min(180, bounds.height * 0.45)) * (distance < 0 ? -1 : 1)
        let origin = app.coordinate(withNormalizedOffset: .zero)
        let from = origin.withOffset(CGVector(dx: bounds.midX - frame.minX, dy: bounds.midY - frame.minY + amount / 2))
        let to = origin.withOffset(CGVector(dx: bounds.midX - frame.minX, dy: bounds.midY - frame.minY - amount / 2))
        from.press(forDuration: 0.05, thenDragTo: to)
    }
    func reveal(_ element: XCUIElement, app: XCUIApplication, forward: Bool = true) throws {
        for _ in 0..<16 {
            if whole(element, app: app) { return }
            let bounds = viewport(app)
            let frame = element.exists ? element.frame : .zero
            let known = frame.width > 0 && frame.height > 0 && frame.midY.isFinite
            let direction: CGFloat = known ? (frame.midY < bounds.midY ? -1 : 1) : (forward ? 1 : -1)
            try scroll(direction * 170, app: app)
        }
        try require(false, "The requested control must be wholly visible and currently hittable", app: app)
    }
    func tap(_ element: XCUIElement, app: XCUIApplication, forward: Bool = true) throws {
        try reveal(element, app: app, forward: forward)
        try require(whole(element, app: app), "No action is admitted on a clipped or non-hittable control", app: app)
        element.tap()
    }
    func captureRole(_ name: String, number: Int, app: XCUIApplication, matchedAnchor: Bool = false) throws {
        let element = role(number, in: app)
        try reveal(element, app: app)
        if matchedAnchor {
            // The unchanged B card is the shared final row. Align its lower
            // edge with the natural list endpoint observed in both locales;
            // an arbitrary C-center target can lie beyond the scroll limit.
            let anchor = role(102, in: app)
            try reveal(anchor, app: app)
            for _ in 0..<12 {
                let difference = anchor.frame.maxY - (viewport(app).maxY - 12)
                if abs(difference) <= 12 && whole(anchor, app: app) && whole(element, app: app) { break }
                try scroll(difference, app: app)
            }
            try require(abs(anchor.frame.maxY - (viewport(app).maxY - 12)) <= 12,
                        "The matched B-card lower edge must agree within 12 points", app: app)
            try require(whole(anchor, app: app), "The shared B-card capture anchor is wholly visible and hittable", app: app)
        }
        try require(whole(element, app: app), "The capture anchor is wholly visible", app: app)
        try require(!app.keyboards.firstMatch.exists, "This journey must never focus or type into a field", app: app)
        record(name, app: app)
    }
    func launch(sequence: String) throws -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-career-ui-acceptance", "-AppleLanguages", "(\(language))", "-AppleLocale", language == "ar" ? "ar_JO" : "en_US",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launchEnvironment["CAREER_UI_TEST_ID"] = fixtureID
        app.launchEnvironment["CAREER_UI_DISCOVERY_SEQUENCE"] = sequence
        app.launch()
        try wait("The launch must expose offline acceptance provenance", app: app) { app.staticTexts["acceptance.offline"].exists }
        try require(app.tabBars.buttons.count == 5, "The real five-tab navigation remains present", app: app)
        let tab = app.tabBars.buttons[language == "ar" ? "البحث" : "Search"]
        try wait("The localized Search tab is reachable", app: app) { tab.exists && tab.isHittable }
        tab.tap()
        try wait("The real Search screen opened", app: app) { item("discovery.search", in: app).exists }
        return app
    }
    func search(_ app: XCUIApplication) throws {
        try tap(item("discovery.search", in: app), app: app)
    }
    func count(_ expected: Int, app: XCUIApplication) throws {
        let element = item("discovery.newCount", in: app)
        try reveal(element, app: app)
        try wait("The localized new-role count is exactly \(expected)", app: app) { normalized(element.label) == countLabel(expected) }
    }
    func defaultSummary(_ app: XCUIApplication) throws {
        let summary = item("discovery.summary", in: app)
        try reveal(summary, app: app, forward: false)
        let expected = language == "ar" ? "جميع الوظائف · أي موقع · أي نمط عمل" : "All roles · Any location · Any work arrangement"
        try require(normalized(summary.label) == expected, "The actual default search summary is localized in \(language)", app: app)
    }
    func onlyCIsNew(_ app: XCUIApplication) throws {
        try count(1, app: app)
        try reveal(role(103, in: app), app: app)
        try require(role(103, in: app).label.contains(badgeLabel), "Only the newly observed C card announces newness", app: app)
        try reveal(role(102, in: app), app: app)
        try require(!role(102, in: app).label.contains(badgeLabel), "The previously observed B card is not labeled new", app: app)
    }
    func newOnly(_ on: Bool, app: XCUIApplication) throws {
        let toggle = app.switches.matching(NSPredicate(format: "identifier == %@", "discovery.newOnly")).element
        try reveal(toggle, app: app, forward: false)
        try require(normalized(toggle.label) == (language == "ar" ? "الجديد فقط" : "New only"), "The native local-filter control has localized copy", app: app)
        // SwiftUI exposes a labeled wrapper and a native switch descendant.
        // The wrapper center can be blank space, so act on its unique control.
        let nativeSwitches = toggle.descendants(matching: .switch)
        try require(nativeSwitches.count == 1, "The identified filter has exactly one native switch control", app: app)
        let nativeSwitch = nativeSwitches.element
        let currentValue = toggle.value as? String
        try require(currentValue == "0" || currentValue == "1", "The native filter exposes an actual on/off state", app: app)
        if currentValue != (on ? "1" : "0") {
            try require(whole(toggle, app: app), "The identified filter remains wholly visible and currently hittable", app: app)
            try reveal(nativeSwitch, app: app, forward: false)
            try require(whole(nativeSwitch, app: app), "The native switch thumb is wholly visible and currently hittable", app: app)
            // A touch at the edge left the visible switch off in both locales.
            // Slide between the thumb centers, mirrored in the Arabic layout.
            let thumbOnLeft = (currentValue == "1") == (language == "ar")
            let fromX: CGFloat = thumbOnLeft ? 0.3 : 0.7
            let from = nativeSwitch.coordinate(withNormalizedOffset: CGVector(dx: fromX, dy: 0.5))
            let to = nativeSwitch.coordinate(withNormalizedOffset: CGVector(dx: 1 - fromX, dy: 0.5))
            from.press(forDuration: 0.05, thenDragTo: to)
        }
        let expectedValue = on ? "1" : "0"
        try wait("The local New-only filter has the requested state", app: app) {
            // Observe both values in one live control snapshot under the same deadline.
            guard let snapshot = try? toggle.snapshot(), snapshot.elementType == .switch,
                  snapshot.identifier == "discovery.newOnly", snapshot.value as? String == expectedValue else { return false }
            var descendants = snapshot.children
            var switchValue: String?
            while let child = descendants.popLast() {
                if child.elementType == .switch {
                    guard switchValue == nil, let value = child.value as? String else { return false }
                    switchValue = value
                }
                descendants.append(contentsOf: child.children)
            }
            return switchValue == expectedValue
        }
    }
    func expectation(_ sequences: [String]) {
        let expected: [String: Any] = ["schemaVersion": 1, "fixtureID": fixtureID, "language": language, "phase": phase,
            "expectedSearchSequences": sequences, "expectedSearchCount": sequences.count,
            "expectedRejectedRequests": 0, "fixtureNetworkImplementation": false,
            "receiptFile": "search-history-fixture.json",
            "receiptVerificationRequired": true,
            "note": "The owned runner must compare this expectation with original app-container receipts. UI screenshots alone do not prove request counts."]
        let text = String(data: try! JSONSerialization.data(withJSONObject: expected, options: [.prettyPrinted, .sortedKeys]), encoding: .utf8)!
        let attachment = XCTAttachment(string: text)
        attachment.name = "history-\(language)-\(phase)-fixture-expectation"; attachment.lifetime = .keepAlways; add(attachment)
    }
    func begin(language: String, phase: String) {
        self.language = language; self.phase = phase; fixtureID = UUID().uuidString
        XCUIDevice.shared.orientation = .portrait
        print("Search-history fixture \(fixtureID), \(language), \(phase)")
    }
    func before(language: String) throws {
        begin(language: language, phase: "before")
        expectation(["ab", "bc"])
        var app = try launch(sequence: "ab")
        try search(app); try reveal(role(101, in: app), app: app); try reveal(role(102, in: app), app: app)
        app.terminate()
        app = try launch(sequence: "bc")
        try search(app); try reveal(role(103, in: app), app: app)
        try require(!item("discovery.newCount", in: app).exists, "The genuine pre-feature app has no newness count", app: app)
        try captureRole("bc-matched", number: 103, app: app, matchedAnchor: true)
        app.terminate()
    }
    func after(language: String) throws {
        begin(language: language, phase: "after")
        expectation(["ab", "bc", "unavailable", "cb"])
        var app = try launch(sequence: "ab")
        try search(app); try reveal(role(101, in: app), app: app); try reveal(role(102, in: app), app: app)
        try require(!item("discovery.newCount", in: app).exists && !item("discovery.newOnly", in: app).exists,
                    "The first successful baseline stays silent", app: app)
        try require(!role(101, in: app).label.contains(badgeLabel) && !role(102, in: app).label.contains(badgeLabel),
                    "An initial result is not advertised as newly found", app: app)
        try defaultSummary(app)
        try captureRole("ab-silent", number: 102, app: app)
        app.terminate()

        app = try launch(sequence: "bc")
        try search(app); try onlyCIsNew(app)
        try captureRole("bc-matched", number: 103, app: app, matchedAnchor: true)
        try newOnly(true, app: app)
        try captureRole("bc-new-only", number: 103, app: app)
        try require(!role(102, in: app).exists, "The local New-only result list excludes B", app: app)
        let shown = language == "ar" ? "المعروض: 1 من 2" : "1 of 2 shown"
        try require(app.staticTexts.allElementsBoundByIndex.contains { normalized($0.label) == shown },
                    "The local filter honestly reports one shown of two retained results", app: app)
        app.terminate()

        app = try launch(sequence: "unavailable")
        try onlyCIsNew(app)
        try captureRole("restart-keeps-c", number: 103, app: app)
        // The restored filter starts at All; the saved comparison itself survives.
        try newOnly(false, app: app)
        try tap(item("discovery.search", in: app), app: app, forward: false)
        try wait("The actual store explains the unavailable board", app: app) { item("discovery.error", in: app).exists }
        try onlyCIsNew(app)
        try captureRole("outage-keeps-c", number: 103, app: app)
        app.terminate()

        app = try launch(sequence: "unavailable")
        try onlyCIsNew(app)
        try require(!item("discovery.storageNotice", in: app).exists, "A failed coverage envelope cannot make the saved successful comparison unreadable", app: app)
        try captureRole("outage-restart-keeps-c", number: 103, app: app)
        app.terminate()

        app = try launch(sequence: "cb")
        try search(app); try count(0, app: app)
        try reveal(role(102, in: app), app: app)
        try require(!role(102, in: app).label.contains(badgeLabel), "Reordering does not make B new", app: app)
        try reveal(role(103, in: app), app: app)
        try require(!role(103, in: app).label.contains(badgeLabel), "Reordering does not make C new", app: app)
        try captureRole("reorder-zero-new", number: 103, app: app)
        try newOnly(true, app: app)
        let showAll = item("discovery.showAll", in: app)
        try reveal(showAll, app: app)
        try require(!role(102, in: app).exists && !role(103, in: app).exists, "Zero newness produces an honest empty filtered list", app: app)
        record("reorder-empty-new-only", app: app)
        try tap(showAll, app: app)
        try reveal(role(102, in: app), app: app); try reveal(role(103, in: app), app: app)
        app.terminate()
    }
}

// The same fixture/test bytes are registered in both builds. This condition
// selects capture-only methods in the genuine old-source checkout; it is not an
// app feature flag. Normal product builds compile only the two acceptance tests.
#if CAREER_SEARCH_HISTORY_BEFORE
final class CareerFinderSearchHistoryBeforeCaptureTests: SearchHistoryUITestCase {
    func testEnglishBeforeCapture() throws { try before(language: "en") }
    func testArabicBeforeCapture() throws { try before(language: "ar") }
}
#else
final class CareerFinderSearchHistoryUITests: SearchHistoryUITestCase {
    func testEnglishSearchHistoryAcceptance() throws { try after(language: "en") }
    func testArabicSearchHistoryAcceptance() throws { try after(language: "ar") }
}
#endif
