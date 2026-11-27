import XCTest

/// Separate synthetic Saved-only acceptance. Comparison does not edit records,
/// select Apply jobs, open employer links, or perform a service request.
@MainActor
class SavedComparisonUITestCase: XCTestCase {
    enum ObservationFailure: Error { case failed }
    var fixtureID = ""
    var language = "en"
    var phase = ""
    var modalTitle: String?
    var failureCount = 0
    let a = "local-comparison-a"
    let b = "local-comparison-b"
    let c = "local-comparison-c"
    let role = "Service Designer"
    let employer = "Synthetic Harbor Studio"
    override func setUpWithError() throws { continueAfterFailure = false }
    func localized(_ en: String, _ ar: String) -> String { language == "ar" ? ar : en }
    func normalized(_ text: String) -> String {
        text.replacingOccurrences(of: "\u{2068}", with: "").replacingOccurrences(of: "\u{2069}", with: "")
    }
    func button(_ id: String, app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "identifier == %@", id)).element
    }
    func item(_ id: String, app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "identifier == %@", id)).element
    }
    func row(_ city: String, app: XCUIApplication) -> XCUIElement {
        let title = city == "Amman" ? "Support coordinator" : role
        let displayCity = city == "Riyadh" ? localized("Riyadh", "الرياض") : city
        // The same real navigation link exists in both builds. Exclude the
        // candidate's separately identified Compare action, never choose first.
        return app.buttons.matching(NSPredicate(format:
            "label CONTAINS %@ AND label CONTAINS %@ AND label CONTAINS %@ AND NOT (identifier BEGINSWITH %@)",
            title, employer, displayCity, "saved.comparison.")).element
    }
    func fact(_ id: String, _ suffix: String, app: XCUIApplication) -> XCUIElement {
        item("saved.comparison." + id + "." + suffix, app: app)
    }
    func bars(_ title: String, app: XCUIApplication) -> XCUIElementQuery {
        app.navigationBars.matching(NSPredicate(format: "identifier == %@", title))
    }
    func viewport(_ app: XCUIApplication) -> CGRect {
        let frame = app.frame
        var top = frame.minY + 8, bottom = frame.maxY - 8
        if let modalTitle {
            let query = bars(modalTitle, app: app)
            guard query.count == 1 else { return .null }
            let bar = query.element.frame
            guard finite(bar) else { return .null }
            top = max(top, bar.maxY + 4)
        } else {
            guard app.navigationBars.count <= 1, app.tabBars.count <= 1 else { return .null }
            if app.navigationBars.count == 1 { top = max(top, app.navigationBars.element.frame.maxY + 4) }
            if app.tabBars.count == 1 { bottom = min(bottom, app.tabBars.element.frame.minY - 8) }
        }
        return CGRect(x: frame.minX + 8, y: top, width: frame.width - 16, height: bottom - top)
    }
    func finite(_ frame: CGRect) -> Bool {
        [frame.minX, frame.minY, frame.width, frame.height].allSatisfy(\.isFinite) && frame.width > 0 && frame.height > 0
    }
    func fits(_ element: XCUIElement, app: XCUIApplication, chrome: Bool = false) -> Bool {
        guard element.exists else { return false }
        let frame = element.frame, bounds = chrome ? app.frame : viewport(app)
        return finite(frame) && finite(bounds) && bounds.height > 120 && bounds.contains(frame)
    }
    func whole(_ element: XCUIElement, app: XCUIApplication, chrome: Bool = false) -> Bool {
        fits(element, app: app, chrome: chrome) && element.isHittable
    }
    func record(_ name: String, app: XCUIApplication, anchor: XCUIElement? = nil) {
        let prefix = "saved-comparison-\(language)-\(phase)-\(name)"
        let png = XCTAttachment(screenshot: app.screenshot()); png.name = prefix; png.lifetime = .keepAlways; add(png)
        let ax = XCTAttachment(string: app.debugDescription); ax.name = prefix + "-original-AX"; ax.lifetime = .keepAlways; add(ax)
        var ids = ["saved.filter", "saved.comparison.count", "saved.comparison.open", "saved.comparison.clear", "saved.comparison.close"]
        for id in [a, b, c] { ids.append("saved.comparison.select." + id) }
        for id in [a, b] {
            for field in ["title", "location", "source", "checkedAt", "stage", "followUp", "employer"] {
                ids.append("saved.comparison." + id + "." + field)
            }
        }
        var elements: [[String: String]] = []
        for id in ids {
            let query = app.descendants(matching: .any).matching(NSPredicate(format: "identifier == %@", id))
            guard query.count == 1 else { elements.append(["identifier": id, "count": String(query.count)]); continue }
            let element = query.element
            elements.append(["identifier": id, "count": "1", "type": String(describing: element.elementType),
                "frame": String(describing: element.frame), "label": element.label, "value": element.value as? String ?? "",
                "enabled": String(element.isEnabled), "selected": String(element.isSelected), "liveHittable": String(element.isHittable)])
        }
        var value: [String: Any] = ["schemaVersion": 1, "fixtureID": fixtureID, "language": language, "phase": phase,
            "appFrame": String(describing: app.frame), "contentViewport": String(describing: viewport(app)),
            "keyboardExists": app.keyboards.count != 0, "elements": elements,
            "scope": "Contextual same-content/phone/locale comparison. No cross-phase pixel-alignment, keyboard, VoiceOver, provider or release acceptance."]
        if let anchor {
            value["captureAnchor"] = ["label": anchor.label, "identifier": anchor.identifier,
                "frame": String(describing: anchor.frame), "liveHittable": String(anchor.isHittable)]
        }
        if let bytes = try? JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]),
           let string = String(data: bytes, encoding: .utf8) {
            let geometry = XCTAttachment(string: string); geometry.name = prefix + "-geometry"; geometry.lifetime = .keepAlways; add(geometry)
        }
    }
    func require(_ value: Bool, _ message: String, app: XCUIApplication) throws {
        if !value { failureCount += 1; record("failure-\(failureCount)", app: app); XCTFail(message); throw ObservationFailure.failed }
        XCTAssertTrue(value, message)
    }
    func wait(_ message: String, app: XCUIApplication, _ condition: () -> Bool) throws {
        let started = ProcessInfo.processInfo.systemUptime, deadline = started + 5
        while ProcessInfo.processInfo.systemUptime < deadline {
            let matched = condition(), finished = ProcessInfo.processInfo.systemUptime
            if matched && finished <= deadline { print("Saved-comparison observation passed in \(finished - started)s: \(message)"); return }
            if finished >= deadline { break }
            RunLoop.current.run(until: Date().addingTimeInterval(min(0.1, deadline - finished)))
        }
        try require(false, message + " (no accepted observation inside five seconds)", app: app)
    }
    func scroll(_ distance: CGFloat, app: XCUIApplication) throws {
        let bounds = viewport(app), frame = app.frame
        try require(finite(bounds) && bounds.height > 120, "Scrolling needs the current finite content viewport", app: app)
        let amount = min(abs(distance), min(180, bounds.height * 0.45)) * (distance < 0 ? -1 : 1)
        let origin = app.coordinate(withNormalizedOffset: .zero)
        let from = origin.withOffset(CGVector(dx: bounds.midX - frame.minX, dy: bounds.midY - frame.minY + amount / 2))
        let to = origin.withOffset(CGVector(dx: bounds.midX - frame.minX, dy: bounds.midY - frame.minY - amount / 2))
        from.press(forDuration: 0.05, thenDragTo: to)
    }
    func reveal(_ element: XCUIElement, app: XCUIApplication, forward: Bool = true, disabledObservation: Bool = false) throws {
        for _ in 0..<24 {
            if disabledObservation ? fits(element, app: app) : whole(element, app: app) { return }
            let bounds = viewport(app), frame = element.exists ? element.frame : .zero
            let known = finite(frame)
            try scroll((known ? (frame.midY < bounds.midY ? -1 : 1) : (forward ? 1 : -1)) * 170, app: app)
        }
        try require(false, "The exact requested element must be wholly observable", app: app)
    }
    func tap(_ element: XCUIElement, app: XCUIApplication, forward: Bool = true) throws {
        try reveal(element, app: app, forward: forward)
        try require(whole(element, app: app), "A touch needs fresh whole geometry and current live hittability", app: app)
        element.tap()
    }
    func chromeTap(_ element: XCUIElement, app: XCUIApplication) throws {
        try wait("The unique navigation/menu control is whole and hittable", app: app) { whole(element, app: app, chrome: true) }
        try require(whole(element, app: app, chrome: true), "The navigation/menu control remains valid before one touch", app: app)
        element.tap()
    }
    func capture(_ name: String, anchor: XCUIElement, app: XCUIApplication, companions: [XCUIElement] = []) throws {
        try reveal(anchor, app: app)
        try require(whole(anchor, app: app), "The original capture has a current whole visible anchor", app: app)
        for companion in companions { try require(whole(companion, app: app), "The requested facts are whole in the same original capture", app: app) }
        try require(app.keyboards.count == 0, "This Saved-only journey does not focus or type into a field", app: app)
        record(name, app: app, anchor: anchor)
    }
    func launch() throws -> XCUIApplication {
        modalTitle = nil
        let app = XCUIApplication()
        app.launchArguments = ["-career-ui-acceptance", "-AppleLanguages", "(\(language))", "-AppleLocale", language == "ar" ? "ar_JO" : "en_US",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launchEnvironment["CAREER_UI_TEST_ID"] = fixtureID
        app.launchEnvironment["CAREER_UI_SAVED_COMPARISON"] = "two-openings"
        app.launch()
        try wait("The launched app identifies isolated offline acceptance", app: app) { item("acceptance.offline", app: app).exists }
        try require(app.tabBars.buttons.count == 5, "The real five-tab navigation remains intact", app: app)
        try chromeTap(app.tabBars.buttons.matching(NSPredicate(format: "label == %@", localized("Saved", "المحفوظات"))).element, app: app)
        try wait("Saved opens its actual shortlist", app: app) { bars(localized("Saved opportunities", "الفرص المحفوظة"), app: app).count == 1 }
        return app
    }
    func showApplied(_ app: XCUIApplication) throws {
        try tap(button("saved.filter", app: app), app: app, forward: false)
        try chromeTap(app.buttons.matching(NSPredicate(format: "label == %@", localized("Applied", "تم التقديم"))).element, app: app)
        try wait("The chosen real Saved filter is Applied", app: app) {
            let filter = button("saved.filter", app: app)
            return normalized(filter.label + " " + (filter.value as? String ?? "")).contains(localized("Applied", "تم التقديم"))
        }
    }
    func assertCount(_ expected: Int, app: XCUIApplication) throws {
        let count = item("saved.comparison.count", app: app)
        try reveal(count, app: app, forward: false)
        let number = expected.formatted(.number.locale(Locale(identifier: language)))
        let value = localized(number + " of 2 selected", "الفرص المحددة: " + number + " من ٢")
        try wait("The current comparison count is \(expected)", app: app) { whole(count, app: app) && normalized(count.label) == value }
    }
    func choose(_ id: String, selected: Bool, count: Int, app: XCUIApplication) throws {
        let control = button("saved.comparison.select." + id, app: app)
        try tap(control, app: app)
        try wait("The exact row's Compare action reflects its touch", app: app) { control.isSelected == selected }
        try assertCount(count, app: app)
    }
    func day(_ year: Int, _ month: Int, _ day: Int) -> String {
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = .current
        let value = calendar.date(from: DateComponents(year: year, month: month, day: day, hour: 12))!
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: language); formatter.calendar = calendar
        formatter.dateStyle = .medium; formatter.timeStyle = .none
        return formatter.string(from: value)
    }
    func checked() -> String {
        let value = ISO8601DateFormatter().date(from: "2026-11-21T18:00:00Z")!
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: language); formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateStyle = .medium; formatter.timeStyle = .short
        return formatter.string(from: value)
    }
    func compare(_ app: XCUIApplication, prefix: String, order: [String]) throws {
        let open = button("saved.comparison.open", app: app)
        try reveal(open, app: app, forward: false)
        let savedFrame = open.frame
        try tap(open, app: app)
        modalTitle = localized("Compare two openings", "مقارنة فرصتين")
        try wait("The real comparison sheet opens with its own navigation and content", app: app) {
            bars(modalTitle!, app: app).count == 1 && item("saved.comparison.content", app: app).exists
        }
        // The sheet preserves actual touch order. Traverse that same order so
        // an earlier lazy row is not sought by scrolling farther forward.
        try require(order == [b, a] || order == [a, b], "The expected pair order matches the actual selection sequence", app: app)
        let riyadh = (a, localized("Riyadh", "الرياض"), localized("Applied", "تم التقديم"), day(2030, 1, 10), "Synthetic Harbor board", checked())
        let jeddah = (b, "Jeddah", localized("Interview", "مقابلة"), day(2030, 2, 20), localized("Not recorded", "غير مسجّل"), localized("Not recorded", "غير مسجّل"))
        for (id, city, stage, followUp, source, check) in (order == [b, a] ? [jeddah, riyadh] : [riyadh, jeddah]) {
            let title = fact(id, "title", app: app)
            try reveal(title, app: app)
            try require(normalized(title.label) == role, "The compared role retains its original title", app: app)
            for (suffix, value) in [("location", city), ("source", source), ("checkedAt", check), ("stage", stage), ("followUp", followUp)] {
                let valueElement = fact(id, suffix, app: app)
                try reveal(valueElement, app: app)
                try require(normalized(valueElement.label + " " + (valueElement.value as? String ?? "")).contains(value),
                    "The exact row keeps its own \(suffix), including explicit unknown values", app: app)
                if suffix == "checkedAt" {
                    try capture(prefix + (id == a ? "-riyadh-facts" : "-jeddah-facts"), anchor: valueElement, app: app,
                        companions: [title, fact(id, "location", app: app), fact(id, "source", app: app)])
                }
            }
            let link = button("saved.comparison." + id + ".employer", app: app)
            try reveal(link, app: app)
            try require(whole(link, app: app), "Each opening keeps one reachable employer-link control; it is never activated", app: app)
            // Each row has two contextual captures. They do not force every
            // fact into one viewport or impose a cross-phase scroll pose.
            try capture(prefix + (id == a ? "-riyadh-tracking" : "-jeddah-tracking"), anchor: link, app: app,
                companions: [fact(id, "stage", app: app), fact(id, "followUp", app: app)])
        }
        try chromeTap(button("saved.comparison.close", app: app), app: app)
        let closedTitle = modalTitle!
        try wait("Back to Saved dismisses the actual sheet", app: app) {
            bars(closedTitle, app: app).count == 0 && !item("saved.comparison.content", app: app).exists
        }
        modalTitle = nil
        try wait("Back keeps the observed Saved scroll position", app: app) {
            whole(open, app: app) && abs(open.frame.minY - savedFrame.minY) <= 12
        }
        try assertCount(2, app: app)
    }
    func begin(language: String, phase: String) {
        self.language = language; self.phase = phase; fixtureID = UUID().uuidString
        XCUIDevice.shared.orientation = .portrait
        print("Saved-comparison fixture \(fixtureID), \(language), \(phase)")
        let value: [String: Any] = ["schemaVersion": 1, "fixtureID": fixtureID, "language": language, "phase": phase,
            "expectedRequests": 0, "networkImplementation": false, "receiptFile": "saved-comparison-fixture.json",
            "expectedBookmarks": 3, "expectedPrivateRecords": 2, "expectedSavedRows": 3,
            "expectedPhoneDraftUnchanged": true, "expectedStoredComparisonSelection": false,
            "note": "Raw original receipt and phone-draft SHA must be verified separately. Local seeded records are not provider receipts. Comparison scope switching is covered by host tests; no keyboard or employer action is performed here."]
        let bytes = try! JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys])
        let attachment = XCTAttachment(string: String(data: bytes, encoding: .utf8)!)
        attachment.name = "saved-comparison-\(language)-\(phase)-fixture-expectation"; attachment.lifetime = .keepAlways; add(attachment)
    }
    func before(language: String) throws {
        begin(language: language, phase: "before")
        let app = try launch()
        try require(!button("saved.comparison.open", app: app).exists, "The genuine before app has no comparison action", app: app)
        try showApplied(app)
        try capture("saved-riyadh", anchor: row("Riyadh", app: app), app: app)
        try capture("saved-jeddah", anchor: row("Jeddah", app: app), app: app)
        app.terminate()
    }
    func after(language: String) throws {
        begin(language: language, phase: "after")
        var app = try launch()
        try assertCount(0, app: app)
        try choose(a, selected: true, count: 1, app: app)
        try choose(b, selected: true, count: 2, app: app)
        let third = button("saved.comparison.select." + c, app: app)
        // A deliberately disabled control is inspected geometrically only.
        // No touch is admitted without the separate whole + live-hit gate.
        try reveal(third, app: app, disabledObservation: true)
        try require(fits(third, app: app) && !third.isEnabled, "A third distinct opening is visibly disabled at the two-selection limit", app: app)
        try choose(a, selected: false, count: 1, app: app)
        try choose(a, selected: true, count: 2, app: app)
        try showApplied(app)
        try capture("saved-riyadh", anchor: row("Riyadh", app: app), app: app)
        try capture("saved-jeddah", anchor: row("Jeddah", app: app), app: app)
        try compare(app, prefix: "comparison", order: [b, a])
        let filter = button("saved.filter", app: app)
        try require(normalized(filter.label + " " + (filter.value as? String ?? "")).contains(localized("Applied", "تم التقديم")),
            "Closing comparison preserves the chosen Saved filter", app: app)
        try capture("returned-saved", anchor: button("saved.comparison.open", app: app), app: app)
        app.terminate()
        app = try launch()
        try assertCount(0, app: app)
        try capture("restart-saved", anchor: item("saved.comparison.count", app: app), app: app)
        try choose(a, selected: true, count: 1, app: app)
        try choose(b, selected: true, count: 2, app: app)
        try compare(app, prefix: "restart-comparison", order: [a, b])
        try tap(button("saved.comparison.clear", app: app), app: app, forward: false)
        try assertCount(0, app: app)
        app.terminate()
    }
}

// The before-only class is absent from ordinary candidate test discovery.
// This condition selects test support only; it never changes the app view.
#if CAREER_SAVED_COMPARISON_BEFORE
@MainActor
final class CareerFinderSavedComparisonBeforeUITests: SavedComparisonUITestCase {
    func testBeforeEnglish() throws { try before(language: "en") }
    func testBeforeArabic() throws { try before(language: "ar") }
}
#else
@MainActor
final class CareerFinderSavedComparisonAfterUITests: SavedComparisonUITestCase {
    func testAfterEnglish() throws { try after(language: "en") }
    func testAfterArabic() throws { try after(language: "ar") }

    func testSavedOpeningSharesPublicDetailsAndCanCancel() throws {
        begin(language: "en", phase: "share")
        let app = try launch()
        try tap(row("Riyadh", app: app), app: app)
        try wait("The selected Saved opening is on screen", app: app) { bars("Saved opportunity", app: app).count == 1 }
        try tap(app.buttons["Share job with a friend"], app: app)
        let publicText = [role, employer, "Synthetic Harbor board",
                          "https://example.com/synthetic/saved-comparison/riyadh"].joined(separator: "\n")
        let preview = app.staticTexts[publicText]
        try capture("public-preview", anchor: preview, app: app)
        try tap(app.buttons["Share job link"], app: app)

        // Observe the system's Copy action without choosing it or any destination.
        let sheet = app.otherElements["ActivityListView"]
        let copy = sheet.cells.matching(NSPredicate(format: "identifier == %@ AND label == %@", "actionGroupCell", "Copy")).element
        try wait("The system share sheet offers Copy", app: app) { copy.isHittable }
        record("system-share-sheet", app: app)
        let close = sheet.buttons["Close"]
        if close.exists {
            try chromeTap(close, app: app)
        } else {
            let dismissRegion = app.otherElements["PopoverDismissRegion"]
            let region = dismissRegion.frame, sheetFrame = sheet.frame
            try require(finite(region) && finite(sheetFrame) && dismissRegion.isHittable,
                        "The system share popup exposes its outside dismiss region", app: app)
            let outside = CGPoint(x: region.midX, y: (region.minY + sheetFrame.minY) / 2)
            try require(region.contains(outside) && app.frame.contains(outside) && !sheetFrame.contains(outside),
                        "The cancellation touch stays outside the share sheet", app: app)
            dismissRegion.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(
                dx: outside.x - region.minX, dy: outside.y - region.minY)).tap()
        }
        try wait("Cancelling returns to the same public preview", app: app) {
            !sheet.exists && bars("Saved opportunity", app: app).count == 1 && preview.exists
        }
    }
}
#endif
