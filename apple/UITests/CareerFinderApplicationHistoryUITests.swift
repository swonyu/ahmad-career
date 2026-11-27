import XCTest

/// Focused metadata/read-only-service journeys, separate from the existing 17
/// acceptance methods. No employer link, upload, approval or send is activated.
@MainActor
class ApplicationHistoryUITestCase: XCTestCase {
    enum ObservationFailure: Error { case failed }
    var fixtureID = ""
    var language = "en"
    var phase = ""
    var failureCount = 0
    var modalNavigationTitle: String?
    let recordID = "CFA00000-0000-4000-8000-000000000001"
    let preparedTitle = "Earlier draft with CV-A"
    let manualTitle = "Manual research record"
    let reviewTitle = "New review with CV-B"
    override func setUpWithError() throws { continueAfterFailure = false }

    func localized(_ en: String, _ ar: String) -> String { language == "ar" ? ar : en }
    func revisionText(_ value: Int) -> String { value.formatted(.number.locale(Locale(identifier: language))) }
    func normalized(_ text: String) -> String {
        text.replacingOccurrences(of: "\u{2068}", with: "").replacingOccurrences(of: "\u{2069}", with: "")
    }
    func item(_ id: String, app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "identifier == %@", id)).element
    }
    func text(_ value: String, app: XCUIApplication) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label == %@", value)).element
    }
    func detail(_ context: String, suffix: String = "", app: XCUIApplication) -> XCUIElement {
        let identifier = "application.details." + context + suffix
        let type: XCUIElement.ElementType = suffix.isEmpty ? .button : .any
        if context.hasPrefix("review.") {
            return reviewContent(app).descendants(matching: type).matching(NSPredicate(format: "identifier == %@", identifier)).element
        }
        return app.descendants(matching: type).matching(NSPredicate(format: "identifier == %@", identifier)).element
    }
    func navigationBars(_ title: String, app: XCUIApplication) -> XCUIElementQuery {
        app.navigationBars.matching(NSPredicate(format: "identifier == %@", title))
    }
    func reviewContainers(_ app: XCUIApplication) -> XCUIElementQuery {
        app.collectionViews.matching(NSPredicate(format: "identifier == %@", "application.review.content"))
    }
    func reviewContent(_ app: XCUIApplication) -> XCUIElement { reviewContainers(app).element }
    func modalIsClosed(_ title: String, app: XCUIApplication) -> Bool {
        navigationBars(title, app: app).count == 0
    }
    func viewport(_ app: XCUIApplication) -> CGRect {
        let frame = app.frame
        var top = frame.minY + 8, bottom = frame.maxY - 8
        if let title = modalNavigationTitle {
            let bars = navigationBars(title, app: app)
            guard bars.count == 1 else { return .null }
            let bar = bars.element.frame
            guard [bar.minX, bar.minY, bar.width, bar.height].allSatisfy(\.isFinite),
                  bar.width > 0, bar.height > 0 else { return .null }
            top = max(top, bar.maxY + 4)
            // A presented sheet covers the underlying tab bar. Its own exact
            // navigation bar supplies the top boundary, never the background.
        } else {
            guard app.navigationBars.count <= 1, app.tabBars.count <= 1 else { return .null }
            if app.navigationBars.count == 1 { top = max(top, app.navigationBars.element.frame.maxY + 4) }
            if app.tabBars.count == 1 { bottom = min(bottom, app.tabBars.element.frame.minY - 8) }
        }
        return CGRect(x: frame.minX + 8, y: top, width: frame.width - 16, height: bottom - top)
    }
    func whole(_ element: XCUIElement, app: XCUIApplication, chrome: Bool = false) -> Bool {
        guard element.exists else { return false }
        let frame = element.frame, bounds = chrome ? app.frame : viewport(app)
        guard [frame.minX, frame.minY, frame.width, frame.height, bounds.minX, bounds.minY, bounds.width, bounds.height].allSatisfy(\.isFinite),
              frame.width > 0, frame.height > 0, bounds.width > 0, bounds.height > 120 else { return false }
        return bounds.contains(frame) && element.isHittable
    }
    func record(_ name: String, app: XCUIApplication, anchor: XCUIElement? = nil) {
        let prefix = "cv-history-\(language)-\(phase)-\(name)"
        let image = XCTAttachment(screenshot: app.screenshot()); image.name = prefix; image.lifetime = .keepAlways; add(image)
        let ax = XCTAttachment(string: app.debugDescription); ax.name = prefix + "-original-AX"; ax.lifetime = .keepAlways; add(ax)
        let contexts = ["attempt.prepared", "attempt.test", "attempt.uncertain", "attempt.confirmed", "attempt.legacy",
                        "review.cv-review-b.review-b", "record." + recordID]
        var identifiers: [String] = []
        for context in contexts {
            let base = "application.details." + context
            identifiers += [base, base + ".resume", base + ".revision"]
        }
        identifiers += ["record.manualResumeName", "record.stageSummary", "record.edit"]
        var elements: [[String: String]] = []
        for id in identifiers {
            let query = app.descendants(matching: .any).matching(NSPredicate(format: "identifier == %@", id))
            guard query.count == 1 else { elements.append(["identifier": id, "count": String(query.count)]); continue }
            let element = query.element
            elements.append(["identifier": id, "count": "1", "frame": String(describing: element.frame),
                "label": element.label, "value": element.value as? String ?? "", "liveHittable": String(element.isHittable)])
        }
        var value: [String: Any] = ["schemaVersion": 1, "fixtureID": fixtureID, "language": language, "phase": phase,
            "appFrame": String(describing: app.frame), "contentViewport": String(describing: viewport(app)),
            "keyboardExists": app.keyboards.count != 0, "elements": elements,
            "scope": "Synthetic metadata UI only. No real PDF upload, employer application, provider receipt, VoiceOver or release acceptance."]
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
        let start = ProcessInfo.processInfo.systemUptime, deadline = start + 5
        while ProcessInfo.processInfo.systemUptime < deadline {
            let matched = condition(), finished = ProcessInfo.processInfo.systemUptime
            if matched && finished <= deadline { print("CV-history observation passed in \(finished - start)s: \(message)"); return }
            if finished >= deadline { break }
            RunLoop.current.run(until: Date().addingTimeInterval(min(0.1, deadline - finished)))
        }
        try require(false, message + " (no accepted observation inside five seconds)", app: app)
    }
    func scroll(_ distance: CGFloat, app: XCUIApplication) throws {
        let bounds = viewport(app), frame = app.frame
        try require([bounds.minX, bounds.minY, bounds.width, bounds.height].allSatisfy(\.isFinite)
            && bounds.height > 120 && bounds.width > 0, "Scrolling needs a fresh finite viewport", app: app)
        let amount = min(abs(distance), min(180, bounds.height * 0.45)) * (distance < 0 ? -1 : 1)
        let origin = app.coordinate(withNormalizedOffset: .zero)
        let from = origin.withOffset(CGVector(dx: bounds.midX - frame.minX, dy: bounds.midY - frame.minY + amount / 2))
        let to = origin.withOffset(CGVector(dx: bounds.midX - frame.minX, dy: bounds.midY - frame.minY - amount / 2))
        from.press(forDuration: 0.05, thenDragTo: to)
    }
    func reveal(_ element: XCUIElement, app: XCUIApplication, forward: Bool = true) throws {
        for _ in 0..<24 {
            if whole(element, app: app) { return }
            let bounds = viewport(app), frame = element.exists ? element.frame : .zero
            let known = frame.width > 0 && frame.height > 0 && frame.midY.isFinite
            try scroll((known ? (frame.midY < bounds.midY ? -1 : 1) : (forward ? 1 : -1)) * 170, app: app)
        }
        try require(false, "The requested control must be wholly visible and currently hittable", app: app)
    }
    func tap(_ element: XCUIElement, app: XCUIApplication, forward: Bool = true) throws {
        try reveal(element, app: app, forward: forward)
        try require(whole(element, app: app), "No touch is admitted on a clipped or non-hittable control", app: app)
        element.tap()
    }
    func chromeTap(_ element: XCUIElement, app: XCUIApplication) throws {
        try wait("The unique navigation control is wholly visible and hittable", app: app) { whole(element, app: app, chrome: true) }
        try require(whole(element, app: app, chrome: true), "The navigation control is still valid before its single touch", app: app)
        element.tap()
    }
    func nav(_ label: String, app: XCUIApplication) throws {
        let bars = modalNavigationTitle.map { navigationBars($0, app: app) } ?? app.navigationBars
        try chromeTap(bars.buttons.matching(NSPredicate(format: "label == %@", label)).element, app: app)
    }
    func tab(_ en: String, _ ar: String, app: XCUIApplication) throws {
        try chromeTap(app.tabBars.buttons.matching(NSPredicate(format: "label == %@", localized(en, ar))).element, app: app)
    }
    func capture(_ name: String, anchor: XCUIElement, app: XCUIApplication, matched: Bool = false,
                 companions: [XCUIElement] = []) throws {
        try reveal(anchor, app: app)
        if matched {
            for _ in 0..<12 {
                let distance = anchor.frame.minY - (viewport(app).minY + 24)
                if abs(distance) <= 12 && whole(anchor, app: app) { break }
                try scroll(distance, app: app)
            }
            try require(abs(anchor.frame.minY - (viewport(app).minY + 24)) <= 12,
                "The unchanged title anchor agrees within 12 points", app: app)
        }
        try require(whole(anchor, app: app), "The original capture has a whole visible anchor", app: app)
        for companion in companions {
            try require(whole(companion, app: app), "The historical metadata is wholly visible in the same original capture", app: app)
        }
        try require(app.keyboards.count == 0, "This metadata journey never focuses or types into a field", app: app)
        record(name, app: app, anchor: anchor)
    }
    func captureManual(_ name: String, app: XCUIApplication, after: Bool) throws {
        // This shorter page is a contextual comparison. The main prepared-A
        // and review-B images use the separately checked matched title anchor.
        let stage = item("record.stageSummary", app: app)
        try reveal(stage, app: app, forward: false)
        let companions = after ? [detail("record." + recordID, suffix: ".resume", app: app)] : []
        try capture(name, anchor: stage, app: app, companions: companions)
    }
    func launch() throws -> XCUIApplication {
        modalNavigationTitle = nil
        let app = XCUIApplication()
        app.launchArguments = ["-career-ui-acceptance", "-AppleLanguages", "(\(language))", "-AppleLocale", language == "ar" ? "ar_JO" : "en_US",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launchEnvironment["CAREER_UI_TEST_ID"] = fixtureID
        app.launchEnvironment["CAREER_UI_APPLICATION_HISTORY"] = "cv-details"
        app.launch()
        let frame = app.frame
        try require(frame.width.isFinite && frame.height.isFinite && frame.width > 0 && frame.height > frame.width,
            "The actual application-history screen is portrait", app: app)
        try wait("The launch identifies offline synthetic acceptance", app: app) { item("acceptance.offline", app: app).exists }
        try require(app.tabBars.buttons.count == 5, "The real five-tab navigation remains present", app: app)
        try tab("Apply", "التقديم", app: app)
        try wait("The actual workspace read supplies its recoverable review", app: app) { reviewButton(app).exists }
        return app
    }
    func reviewButton(_ app: XCUIApplication) -> XCUIElement {
        // The localized template uses bidi isolation around source values.
        // Scope by the exact unique fixture title and existing review action.
        let query = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", reviewTitle))
        return query.element
    }
    func activity(_ app: XCUIApplication) throws {
        let pickers = app.segmentedControls.matching(NSPredicate(format: "identifier == %@", "applications.viewPicker"))
        let content = app.scrollViews.matching(NSPredicate(format: "identifier == %@", "applications.content"))
        let review = app.buttons.matching(NSPredicate(format: "identifier == %@", "applications.review"))
        let picker = pickers.element
        let segments = picker.buttons.matching(NSPredicate(format: "label == %@", localized("Activity", "النشاط")))
        let segment = segments.element
        func finite(_ frame: CGRect) -> Bool {
            [frame.minX, frame.minY, frame.width, frame.height].allSatisfy(\.isFinite)
                && frame.width > 0 && frame.height > 0
        }
        func usableBounds() -> CGRect? {
            guard content.count == 1, review.count <= 1 else { return nil }
            let frame = content.element.frame
            guard finite(frame) else { return nil }
            var bounds = viewport(app).intersection(frame)
            if review.count == 1 {
                let fixed = review.element.frame
                guard finite(fixed) else { return nil }
                // The existing safe-area bar has 12 points above its button.
                // Keep the same 8-point clear margin used below the tab bar.
                bounds.size.height = min(bounds.maxY, fixed.minY - 12 - 8) - bounds.minY
            }
            return finite(bounds) && bounds.height > 120 ? bounds : nil
        }
        func reachable() -> Bool {
            guard pickers.count == 1, segments.count == 1, let bounds = usableBounds() else { return false }
            let pickerFrame = picker.frame, segmentFrame = segment.frame
            return finite(pickerFrame) && finite(segmentFrame) && bounds.contains(pickerFrame)
                && bounds.contains(segmentFrame) && picker.isHittable && segment.isHittable
        }
        try require(pickers.count == 1 && segments.count == 1 && content.count == 1,
            "Activity belongs to one exact picker in one actual application content view", app: app)
        for _ in 0..<24 {
            if reachable() { break }
            guard let bounds = usableBounds() else {
                try require(false, "Activity scrolling needs a fresh unoccluded content viewport", app: app)
                throw ObservationFailure.failed
            }
            let frame = content.element.frame, target = picker.frame
            try require(finite(frame) && finite(target), "Activity scrolling uses current finite content and picker frames", app: app)
            let amount: CGFloat = min(170, bounds.height * 0.45) * (target.minY < bounds.minY ? -1 : 1)
            let origin = content.element.coordinate(withNormalizedOffset: .zero)
            let from = origin.withOffset(CGVector(dx: bounds.midX - frame.minX, dy: bounds.midY - frame.minY + amount / 2))
            let to = origin.withOffset(CGVector(dx: bounds.midX - frame.minX, dy: bounds.midY - frame.minY - amount / 2))
            from.press(forDuration: 0.05, thenDragTo: to)
        }
        try wait("Activity is wholly outside the fixed review bar and currently hittable", app: app) { reachable() }
        print("CV-history Activity pre-touch picker=\(picker.frame), segment=\(segment.frame), usable=\(String(describing: usableBounds()))")
        try require(reachable(), "The unique Activity target remains unoccluded before its single touch", app: app)
        segment.tap()
        try wait("Activity exposes the earlier immutable attempt", app: app) {
            segments.count == 1 && segment.isSelected && text(preparedTitle, app: app).exists
        }
    }
    func currentCV(_ app: XCUIApplication) throws {
        let profile = item("applications.profile", app: app)
        try reveal(profile, app: app, forward: false)
        try require(whole(profile, app: app), "The application profile row is visible and hittable", app: app)
        // Exercise the empty space between the profile title and chevron.
        let gapX: CGFloat = language == "ar" ? 0.2 : 0.8
        profile.coordinate(withNormalizedOffset: CGVector(dx: gapX, dy: 0.5)).tap()
        let modalTitle = localized("Application profile", "ملف التقديم")
        modalNavigationTitle = modalTitle
        try wait("The actual profile editor has one identified navigation bar", app: app) {
            navigationBars(modalTitle, app: app).count == 1
        }
        let button = app.buttons.matching(NSPredicate(format: "label == %@", "CV-B.pdf")).element
        try reveal(button, app: app)
        try require(whole(button, app: app), "The actual current profile holds CV-B while older activity uses CV-A", app: app)
        record("current-profile-b", app: app)
        try nav(localized("Cancel", "إلغاء"), app: app)
        try wait("The unchanged profile editor closes without saving", app: app) {
            modalIsClosed(modalTitle, app: app) && item("applications.profile", app: app).exists
        }
        modalNavigationTitle = nil
    }
    func openDetails(_ context: String, filename: String?, revision: String?, app: XCUIApplication) throws {
        let group = detail(context, app: app)
        try tap(group, app: app)
        let name = detail(context, suffix: ".resume", app: app)
        try wait("The chosen historical metadata disclosure opens", app: app) { name.exists }
        try reveal(name, app: app)
        let expected = filename ?? localized("CV not recorded", "لم يُسجّل ملف السيرة الذاتية")
        try require(normalized(name.label).contains(expected), "This record displays its own filename, or explicitly records its absence", app: app)
        if let revision {
            let version = detail(context, suffix: ".revision", app: app)
            try reveal(version, app: app)
            try require(normalized(version.label).contains(localized("Profile version", "نسخة الملف الشخصي"))
                && normalized(version.label + " " + (version.value as? String ?? "")).contains(revision), "The recorded profile revision is shown with its own metadata", app: app)
        } else {
            try require(!detail(context, suffix: ".revision", app: app).exists, "Missing or self-entered metadata never borrows a current profile revision", app: app)
        }
    }
    func openManual(_ app: XCUIApplication) throws {
        try tab("Saved", "المحفوظات", app: app)
        try tap(text(manualTitle, app: app), app: app)
        try wait("The actual saved record detail is open", app: app) {
            navigationBars(localized("Saved opportunity", "فرصة محفوظة"), app: app).count == 1
                && item("record.edit", app: app).exists
        }
    }
    func review(_ app: XCUIApplication, after: Bool) throws {
        try tap(reviewButton(app), app: app, forward: false)
        let modalTitle = localized("Review applications", "مراجعة الطلبات")
        modalNavigationTitle = modalTitle
        let titles = reviewContent(app).staticTexts.matching(NSPredicate(format: "label == %@", reviewTitle))
        let oldFilename = reviewContent(app).staticTexts.matching(NSPredicate(format: "label == %@", "CV-B.pdf")).element
        try wait("The actual saved review opens", app: app) {
            navigationBars(modalTitle, app: app).count == 1 && reviewContainers(app).count == 1 && titles.count == 1
        }
        if after { try openDetails("review.cv-review-b.review-b", filename: "CV-B.pdf", revision: revisionText(8), app: app) }
        else { try reveal(oldFilename, app: app) }
        let companions = after ? [detail("review.cv-review-b.review-b", suffix: ".resume", app: app),
            detail("review.cv-review-b.review-b", suffix: ".revision", app: app)] : [oldFilename]
        // Compare the same real review/CV on the same phone and locale. The
        // lazy List need not keep its title loaded at an artificial scroll pose.
        let captureAnchor = after ? detail("review.cv-review-b.review-b", suffix: ".resume", app: app) : oldFilename
        try capture("review-b-context", anchor: captureAnchor, app: app, companions: companions)
        try nav(localized("Back", "رجوع"), app: app)
        try wait("The unapproved review closes without a request", app: app) {
            modalIsClosed(modalTitle, app: app) && reviewContainers(app).count == 0
                && item("applications.profile", app: app).exists
        }
        modalNavigationTitle = nil
    }
    func begin(language: String, phase: String) {
        self.language = language; self.phase = phase; fixtureID = UUID().uuidString
        if XCUIDevice.shared.orientation != .portrait { XCUIDevice.shared.orientation = .portrait }
        print("CV-history fixture \(fixtureID), \(language), \(phase)")
        let value: [String: Any] = ["schemaVersion": 1, "fixtureID": fixtureID, "language": language, "phase": phase,
            "expectedWorkspaceReads": phase == "before" ? 1 : 2, "expectedRejectedRequests": 0,
            "fixtureNetworkImplementation": false, "receiptFile": "cv-history-fixture.json", "receiptVerificationRequired": true,
            "expectedCurrentResumeName": "CV-B.pdf", "expectedCurrentRevision": 8,
            "expectedSavedManualName": phase == "before" ? NSNull() as Any : "Manual-CV-A.pdf", "expectedSavedAppliedMark": false,
            "expectedRemainingDrafts": phase == "before" ? 1 : 0,
            "note": "Original fixture receipts and phone-draft bytes must be verified separately. Confirmed is only a synthetic classification example, never real employer evidence."]
        let bytes = try! JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys])
        let attachment = XCTAttachment(string: String(data: bytes, encoding: .utf8)!)
        attachment.name = "cv-history-\(language)-\(phase)-fixture-expectation"; attachment.lifetime = .keepAlways; add(attachment)
    }
    func before(language: String) throws {
        begin(language: language, phase: "before")
        let app = try launch()
        try currentCV(app); try activity(app)
        try require(!detail("attempt.prepared", app: app).exists, "The genuine pre-feature activity has no new Application-details disclosure", app: app)
        try capture("prepared-a-matched", anchor: text(preparedTitle, app: app), app: app, matched: true)
        try review(app, after: false)
        try openManual(app)
        try require(!detail("record." + recordID, app: app).exists, "The genuine pre-feature manual record has no filename disclosure", app: app)
        try captureManual("manual-a-context", app: app, after: false)
        app.terminate()
    }
    func after(language: String) throws {
        begin(language: language, phase: "after")
        var app = try launch()
        try currentCV(app); try activity(app)
        let cases: [(String, String, String, String?, String?)] = [
            ("prepared", preparedTitle, localized("Prepared draft", "مسودة جاهزة للمراجعة"), "CV-A.pdf", revisionText(7)),
            ("test", "Synthetic test receipt", localized("Test receipt", "إيصال اختباري"), "CV-A.pdf", revisionText(7)),
            ("uncertain", "Uncertain history example", localized("Needs verification", "تحتاج إلى تحقق"), "CV-A.pdf", revisionText(7)),
            ("confirmed", "Synthetic confirmed example", localized("Confirmed", "تم تأكيد الإرسال"), "CV-A.pdf", revisionText(7)),
            ("legacy", "Legacy history without CV", localized("Needs verification", "تحتاج إلى تحقق"), nil, nil)]
        for (id, title, status, name, revision) in cases {
            let state = item("application.state.attempt." + id, app: app)
            try reveal(state, app: app)
            try require(normalized(state.label) == status, "Filename metadata preserves the distinct delivery classification for \(id)", app: app)
            try openDetails("attempt." + id, filename: name, revision: revision, app: app)
            var companions = [state, detail("attempt." + id, suffix: ".resume", app: app)]
            if revision != nil { companions.append(detail("attempt." + id, suffix: ".revision", app: app)) }
            try capture(id == "prepared" ? "prepared-a-matched" : "history-" + id,
                anchor: text(title, app: app), app: app, matched: id == "prepared", companions: companions)
        }
        try review(app, after: true)
        try openManual(app)
        try openDetails("record." + recordID, filename: "Manual-CV-A.pdf", revision: nil, app: app)
        try captureManual("manual-a-context", app: app, after: true)
        try tap(item("record.edit", app: app), app: app)
        let editorTitle = localized("Your application record", "سجل تقديمك")
        modalNavigationTitle = editorTitle
        try wait("The actual record editor has one identified navigation bar", app: app) {
            navigationBars(editorTitle, app: app).count == 1
        }
        let field = item("record.manualResumeName", app: app)
        try reveal(field, app: app)
        try require((field.value as? String) == "Unfinished-CV-B.pdf", "The unfinished filename remains separate from the saved manual record", app: app)
        try capture("unfinished-manual-b", anchor: field, app: app)
        try nav(localized("Cancel", "إلغاء"), app: app)
        let discard = app.alerts.buttons.matching(NSPredicate(format: "label == %@", localized("Discard changes", "تجاهل التغييرات"))).element
        try chromeTap(discard, app: app)
        try wait("Discarding the unfinished edit returns to the original record", app: app) {
            modalIsClosed(editorTitle, app: app) && !field.exists
                && item("record.edit", app: app).exists && app.alerts.count == 0
        }
        modalNavigationTitle = nil
        app.terminate()

        app = try launch(); try activity(app)
        try openDetails("attempt.prepared", filename: "CV-A.pdf", revision: revisionText(7), app: app)
        try capture("restart-old-a", anchor: text(preparedTitle, app: app), app: app)
        try openManual(app)
        try openDetails("record." + recordID, filename: "Manual-CV-A.pdf", revision: nil, app: app)
        try capture("restart-manual-a", anchor: item("record.stageSummary", app: app), app: app)
        try tap(item("record.edit", app: app), app: app)
        modalNavigationTitle = editorTitle
        try wait("The restored record editor has one identified navigation bar", app: app) {
            navigationBars(editorTitle, app: app).count == 1
        }
        let restored = item("record.manualResumeName", app: app)
        try reveal(restored, app: app)
        try require((restored.value as? String) == "Manual-CV-A.pdf", "A fresh launch cannot resurrect the discarded B filename", app: app)
        try nav(localized("Cancel", "إلغاء"), app: app)
        try wait("An unchanged record editor closes without a discard decision", app: app) {
            modalIsClosed(editorTitle, app: app) && !restored.exists
                && item("record.edit", app: app).exists && app.alerts.count == 0
        }
        modalNavigationTitle = nil
        app.terminate()
    }
}

// Identical test/fixture support in both builds; only genuine-before captures
// are selected by this test-target condition. It never changes the app view.
#if CAREER_CV_HISTORY_BEFORE
final class CareerFinderApplicationHistoryBeforeCaptureTests: ApplicationHistoryUITestCase {
    func testEnglishBeforeCapture() throws { try before(language: "en") }
    func testArabicBeforeCapture() throws { try before(language: "ar") }
}
#else
final class CareerFinderApplicationHistoryUITests: ApplicationHistoryUITestCase {
    func testEnglishApplicationHistoryAcceptance() throws { try after(language: "en") }
    func testArabicApplicationHistoryAcceptance() throws { try after(language: "ar") }
}
#endif
