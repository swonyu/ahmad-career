import XCTest

final class CareerFinderUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    @MainActor
    private func launch(id: String = UUID().uuidString, largeText: Bool = false, availability: String? = nil, orphanRecord: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-career-ui-acceptance", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launchEnvironment["CAREER_UI_TEST_ID"] = id
        if let availability { app.launchEnvironment["CAREER_UI_APPLICATION_AVAILABILITY"] = availability }
        if orphanRecord { app.launchEnvironment["CAREER_UI_ORPHAN_RECORD"] = "1" }
        if largeText { app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"] }
        app.launch()
        XCTAssertTrue(app.staticTexts["acceptance.offline"].waitForExistence(timeout: 10), "Acceptance must use an isolated offline workspace")
        return app
    }
    @MainActor
    private func tab(_ name: String, in app: XCUIApplication) {
        let button = app.tabBars.buttons[name]
        XCTAssertTrue(button.waitForExistence(timeout: 5), "Missing tab: \(name)")
        XCTAssertTrue(button.isHittable, "Tab must be reachable: \(name)")
        button.tap()
    }
    @MainActor
    private func reveal(_ element: XCUIElement, in app: XCUIApplication, swipes: Int = 10) {
        for attempt in 0...swipes {
            let exists = element.exists
            if exists && element.isHittable {
                if element.elementType != .button { return }
                let viewport = contentViewport(in: app), frame = element.frame
                // A partially visible List button can report hittable while its tap
                // point is underneath the floating tab bar. Reveal the whole action.
                if frame.minY >= viewport.minY && frame.maxY <= viewport.maxY { return }
            }
            if attempt == swipes { break }
            if exists && element.elementType == .button {
                let viewport = contentViewport(in: app), frame = element.frame
                XCTAssertGreaterThan(viewport.height, 120, "A control needs a usable content viewport")
                let downward = frame.midY < viewport.midY
                let distance = min(180, viewport.height * 0.36)
                let origin = app.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
                let from = origin.withOffset(CGVector(dx: viewport.midX, dy: viewport.midY + (downward ? -distance / 2 : distance / 2)))
                let to = origin.withOffset(CGVector(dx: viewport.midX, dy: viewport.midY + (downward ? distance / 2 : -distance / 2)))
                from.press(forDuration: 0.05, thenDragTo: to)
            } else { app.swipeUp() }
        }
        capture("control-not-fully-reachable", app: app)
        print(app.debugDescription)
        XCTFail("Expected a reachable control inside the visible content: \(element)")
    }
    @MainActor
    private func contentViewport(in app: XCUIApplication) -> CGRect {
        var top = app.frame.minY + 12, bottom = app.frame.maxY - 12
        let navigation = app.navigationBars.firstMatch, tabs = app.tabBars.firstMatch
        if navigation.exists && navigation.isHittable { top = max(top, navigation.frame.maxY + 8) }
        if tabs.exists && tabs.isHittable { bottom = min(bottom, tabs.frame.minY - 12) }
        return CGRect(x: app.frame.minX + 12, y: top, width: app.frame.width - 24, height: bottom - top)
    }
    @MainActor
    private func revealInApplicationContent(_ target: XCUIElement, app: XCUIApplication) {
        let scroll = app.scrollViews["applications.content"]
        XCTAssertTrue(scroll.waitForExistence(timeout: 5))
        for _ in 0..<24 {
            var viewport = scroll.frame.intersection(app.frame)
            let navigation = app.navigationBars.firstMatch, tabs = app.tabBars.firstMatch
            let top = max(viewport.minY, navigation.exists ? navigation.frame.maxY + 8 : viewport.minY + 8)
            var bottom = min(viewport.maxY, tabs.exists ? tabs.frame.minY - 8 : viewport.maxY - 8)
            let action = app.buttons["applications.review"]
            if action.exists && action.isHittable { bottom = min(bottom, action.frame.minY - 12) }
            viewport = CGRect(x: viewport.minX + 12, y: top, width: viewport.width - 24, height: bottom - top)
            XCTAssertGreaterThan(viewport.height, 120, "Application content must have a usable touch viewport")
            let targetFrame = target.exists ? target.frame : .null
            let visible = targetFrame.intersection(viewport)
            if !visible.isNull && visible.height >= min(targetFrame.height, 44) && target.isHittable {
                // Action labels must be fully visible; long explanatory headings may span a screen.
                if target.elementType != .button || targetFrame.minY >= viewport.minY && targetFrame.maxY <= viewport.maxY { return }
            }
            let downward = !targetFrame.isNull && targetFrame.midY < viewport.midY
            let distance = min(180, viewport.height * 0.36)
            let center = viewport.midY
            let origin = app.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
            let from = origin.withOffset(CGVector(dx: viewport.midX, dy: center + (downward ? -distance / 2 : distance / 2)))
            let to = origin.withOffset(CGVector(dx: viewport.midX, dy: center + (downward ? distance / 2 : -distance / 2)))
            from.press(forDuration: 0.05, thenDragTo: to)
        }
        capture("application-control-not-reachable", app: app)
        print(app.debugDescription)
        XCTFail("Expected an application control inside the visible scroll area: \(target)")
    }
    @MainActor
    private func replace(_ field: XCUIElement, with text: String) {
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        let previous = field.value as? String ?? ""
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: previous.count) + text)
    }
    @MainActor
    private func capture(_ name: String, app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
    @MainActor
    private func element(_ id: String, app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }
    @MainActor
    private func top(_ app: XCUIApplication) { for _ in 0..<4 { app.swipeDown() } }
    @MainActor
    private func addLocalOpportunity(in app: XCUIApplication, title: String, company: String = "Example employer") {
        let add = app.buttons["home.addOpportunity"]; reveal(add, in: app); add.tap()
        for (id, value) in [("opportunity.url", "https://careers.example.com/jobs/private-record"), ("opportunity.title", title), ("opportunity.company", company)] {
            let field = app.textFields[id]; reveal(field, in: app); replace(field, with: value)
            if app.buttons["Done typing"].exists { app.buttons["Done typing"].tap() }
        }
        app.buttons["opportunity.save"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 5))
    }
    @MainActor
    private func chooseMenu(_ label: String, in app: XCUIApplication) {
        let matches = app.buttons.matching(NSPredicate(format: "label == %@", label))
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            matches.allElementsBoundByIndex.contains { $0.exists && $0.isHittable }
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 5), .completed)
        guard let choice = matches.allElementsBoundByIndex.first(where: { $0.exists && $0.isHittable }) else {
            XCTFail("Missing reachable menu choice: \(label)"); return
        }
        choice.tap()
    }
    @MainActor
    private func searchFromKeyboard(in app: XCUIApplication, usingReturnKey: Bool = false) {
        let keyboard = app.keyboards.firstMatch
        XCTAssertTrue(keyboard.waitForExistence(timeout: 5))
        let keyReady = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            keyboard.keys.allElementsBoundByIndex.contains { $0.exists && $0.isHittable }
        }, object: nil)
        let keyReadiness = XCTWaiter.wait(for: [keyReady], timeout: 5)
        if keyReadiness != .completed { print(app.debugDescription) }
        XCTAssertEqual(keyReadiness, .completed, "A real keyboard key must be visible before submitting")
        guard keyboard.keys.allElementsBoundByIndex.contains(where: { $0.exists && $0.isHittable }) else {
            print(app.debugDescription)
            XCTFail("No reachable keyboard key was presented"); return
        }
        let search = app.buttons["discovery.keyboardSearch"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        XCTAssertTrue(search.isHittable, "Search must be reachable while the keyboard is open")
        if usingReturnKey {
            app.textFields["discovery.keywords"].typeText("\n")
        } else {
            search.tap()
        }
        // Query the current collections: resolving a retained, vanished element retries
        // internally and can consume the wait before the absence has been reported.
        let dismissed = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            let keys = app.keyboards.keys.allElementsBoundByIndex
            let toolbarActions = app.buttons.matching(identifier: "discovery.keyboardSearch").allElementsBoundByIndex
            return !keys.contains(where: { $0.isHittable }) && !toolbarActions.contains(where: { $0.isHittable })
        }, object: nil)
        let dismissal = XCTWaiter.wait(for: [dismissed], timeout: 5)
        if dismissal != .completed { print(app.debugDescription) }
        XCTAssertEqual(dismissal, .completed, "Submitting a search must dismiss the visible keyboard and its toolbar")
    }

    @MainActor
    func testFreshStartAndFiveTabs() {
        let app = launch()
        XCTAssertTrue(app.tabBars.buttons["Start"].isSelected)
        XCTAssertTrue(app.buttons["home.discover"].exists)
        XCTAssertFalse(app.staticTexts["Ahmad Career"].exists)
        capture("01-fresh-start", app: app)
        tab("Search", in: app)
        XCTAssertTrue(app.textFields["discovery.keywords"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["discovery.search"].exists)
        capture("02-discovery-empty", app: app)
        tab("Saved", in: app)
        XCTAssertTrue(app.staticTexts["Make a shortlist of your own."].waitForExistence(timeout: 5))
        tab("Profile", in: app)
        XCTAssertTrue(app.buttons["profile.applicationProfile"].waitForExistence(timeout: 5))
        tab("Apply", in: app)
        XCTAssertTrue(app.buttons["applications.profile"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["applications.review"].exists)
        capture("03-application-workspace-empty", app: app)
    }

    @MainActor
    func testApplicationDraftSurvivesCancelAndRelaunch() {
        let id = UUID().uuidString
        var app = launch(id: id)
        let profile = app.buttons["home.applicationProfile"]; reveal(profile, in: app); profile.tap()
        let name = app.textFields["application.firstName"]
        let opened = name.waitForExistence(timeout: 5)
        if !opened { capture("profile-initial-open-failure", app: app); print(app.debugDescription) }
        XCTAssertTrue(opened, "One tap on Start must open the application profile before any draft editing")
        XCTAssertTrue(["", "First or single name"].contains(name.value as? String ?? ""), "A fresh profile must not contain another person's name")
        replace(name, with: "Taylor")
        replace(app.textFields["application.email"], with: "taylor@example.com")
        app.navigationBars.buttons["Cancel"].tap()
        XCTAssertTrue(app.buttons["Save draft on this phone"].waitForExistence(timeout: 5))
        app.buttons["Save draft on this phone"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 5))
        app.terminate(); app = launch(id: id)
        let reopened = app.buttons["home.applicationProfile"]; reveal(reopened, in: app); reopened.tap()
        XCTAssertTrue(app.textFields["application.firstName"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.textFields["application.firstName"].value as? String, "Taylor")
        XCTAssertEqual(app.textFields["application.email"].value as? String, "taylor@example.com")
        capture("04-restored-phone-profile-draft", app: app)
    }

    @MainActor
    func testLinkedInProfileDraftAndExternalSearchChoice() {
        let id = UUID().uuidString
        var app = launch(id: id)
        let open = app.buttons["home.applicationProfile"]; reveal(open, in: app); open.tap()
        let field = app.textFields["application.linkedin"]
        reveal(field, in: app)
        XCTAssertTrue(["", "LinkedIn profile (optional)"].contains(field.value as? String ?? ""), "A new user has no seeded LinkedIn identity")
        replace(field, with: "https://sa.linkedin.com/in/example-profile/?tracking=discard#about")
        app.buttons["Done typing"].tap()
        XCTAssertTrue(app.buttons["application.openLinkedIn"].exists || app.links["application.openLinkedIn"].exists,
                      "A valid saved profile offers an explicit external open action")
        app.navigationBars.buttons["Save"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 5))
        app.terminate(); app = launch(id: id)
        let reopened = app.buttons["home.applicationProfile"]; reveal(reopened, in: app); reopened.tap()
        let restored = element("application.linkedin", app: app); reveal(restored, in: app)
        XCTAssertEqual(restored.value as? String, "https://www.linkedin.com/in/example-profile", "A saved LinkedIn link is canonical and survives relaunch")
        capture("16-linkedin-profile-link", app: app)
        app.navigationBars.buttons["Cancel"].tap()
        tab("Search", in: app)
        let search = element("discovery.linkedin", app: app); reveal(search, in: app)
        XCTAssertTrue(search.isHittable, "LinkedIn search must be a deliberate external action")
        capture("17-linkedin-search-choice", app: app)
    }

    @MainActor
    func testPrivateApplicationRecordPersistsAndCorrectionIsExplicit() {
        let id = UUID().uuidString, title = "Private record opportunity"
        var app = launch(id: id)
        addLocalOpportunity(in: app, title: title)
        tab("Saved", in: app); let row = app.staticTexts[title]; reveal(row, in: app); row.tap()
        let edit = app.buttons["record.edit"]; reveal(edit, in: app); edit.tap()
        let stage = element("record.stage", app: app); stage.tap(); chooseMenu("Applied", in: app)
        let followUp = app.switches["record.hasFollowUp"]; reveal(followUp, in: app)
        // SwiftUI exposes a full-row Switch wrapper and a separate native thumb.
        // Touch the visible control, then prove the selected state before saving.
        let followUpControl = followUp.switches.firstMatch
        XCTAssertTrue(followUpControl.waitForExistence(timeout: 5) && followUpControl.isHittable)
        followUpControl.tap()
        XCTAssertTrue(element("record.followUpDate", app: app).waitForExistence(timeout: 5))
        XCTAssertEqual(followUp.value as? String, "1", "The follow-up must be enabled before saving its date")
        let note = app.textViews["record.note"]; reveal(note, in: app); replace(note, with: "Prepare a thoughtful follow-up.")
        app.buttons["Done typing"].tap(); app.buttons["record.save"].tap()
        XCTAssertTrue(app.buttons["record.edit"].waitForExistence(timeout: 5))
        app.terminate(); app = launch(id: id)
        tab("Saved", in: app); let restoredRow = app.staticTexts[title]; reveal(restoredRow, in: app); restoredRow.tap()
        let summary = element("record.stageSummary", app: app); reveal(summary, in: app)
        XCTAssertEqual(summary.label, "You marked: Applied")
        XCTAssertTrue(app.staticTexts["Prepare a thoughtful follow-up."].exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Follow-up date · ")).firstMatch.exists,
                      "The selected follow-up date must survive relaunch")
        capture("18-private-record-restored", app: app)
        let reopen = app.buttons["record.edit"]; reveal(reopen, in: app); reopen.tap()
        element("record.stage", app: app).tap(); chooseMenu("Saved", in: app)
        XCTAssertTrue(element("record.stage", app: app).label.contains("Saved"))
        app.buttons["record.save"].tap()
        XCTAssertTrue(app.buttons["Keep application record"].waitForExistence(timeout: 5))
        app.buttons["Keep application record"].tap()
        app.navigationBars.buttons["Cancel"].tap(); app.buttons["Discard changes"].tap()
        XCTAssertEqual(element("record.stageSummary", app: app).label, "You marked: Applied", "Canceling a correction preserves the saved applied record")
        let again = app.buttons["record.edit"]; reveal(again, in: app); again.tap()
        element("record.stage", app: app).tap(); chooseMenu("Saved", in: app); app.buttons["record.save"].tap()
        app.buttons["Mark not applied"].tap()
        XCTAssertTrue(app.buttons["record.edit"].waitForExistence(timeout: 5))
        XCTAssertEqual(element("record.stageSummary", app: app).label, "You marked: Saved")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        element("saved.filter", app: app).tap(); chooseMenu("Follow-ups", in: app)
        XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 5), "The private follow-up remains available after an explicit applied-mark correction")
        capture("19-private-follow-up-filter", app: app)
    }

    @MainActor
    func testSavedLinkRemovalAtLargestTextKeepsCancelReachable() {
        let id = UUID().uuidString
        let title = "Accessibility removal opportunity with a long role title for a broad and varied career path"
        let company = "An example employer with a long organization name for accessible confirmation checks"
        var app = launch(id: id); addLocalOpportunity(in: app, title: title, company: company)
        app.terminate(); app = launch(id: id, largeText: true)
        tab("Saved", in: app); let row = app.staticTexts[title]; reveal(row, in: app, swipes: 25); row.tap()
        let remove = app.buttons["saved.removeLink"]; reveal(remove, in: app, swipes: 25); remove.tap()
        let confirm = app.buttons["opportunity.confirmRemove"]; reveal(confirm, in: app, swipes: 25)
        let keep = app.buttons["opportunity.keepSaved"]; reveal(keep, in: app, swipes: 25)
        XCTAssertTrue(confirm.isHittable && keep.isHittable, "Both removal choices must remain reachable at the largest text size")
        capture("20-saved-link-removal-accessibility", app: app)
        keep.tap()
        XCTAssertTrue(remove.waitForExistence(timeout: 5), "Canceling preserves the saved opportunity")
        reveal(remove, in: app, swipes: 25); remove.tap()
        let finalConfirm = app.buttons["opportunity.confirmRemove"]; reveal(finalConfirm, in: app, swipes: 25); finalConfirm.tap()
        XCTAssertTrue(app.staticTexts["This opportunity is no longer available here."].waitForExistence(timeout: 5))
    }

    @MainActor
    func testProfileReadinessAndSimpleConnectionSetup() {
        let app = launch()
        let profile = app.buttons["home.applicationProfile"]; reveal(profile, in: app); profile.tap()
        replace(app.textFields["application.firstName"], with: "Alex")
        replace(app.textFields["application.email"], with: "invalid-email")
        app.navigationBars.buttons["Save"].tap()
        tab("Apply", in: app)
        let email = element("profile.essential.email", app: app); reveal(email, in: app)
        XCTAssertEqual(email.label, "Check your email")
        XCTAssertEqual(element("profile.essential.name", app: app).label, "Name added")
        XCTAssertEqual(element("profile.essential.resume", app: app).label, "PDF CV needed")
        capture("21-profile-readiness", app: app)
        let setup = app.buttons["applications.review"]
        XCTAssertTrue(setup.isEnabled && setup.isHittable, "The visible setup action must be enabled")
        setup.tap()
        let opened = app.navigationBars["Application connection"].waitForExistence(timeout: 5)
        if !opened { capture("connection-setup-did-not-open", app: app); print(app.debugDescription) }
        XCTAssertTrue(opened, "One tap on Set up Auto Apply must open connection setup")
        XCTAssertFalse(app.textFields["connection.address"].exists, "Default setup needs no service-address editing")
        let code = app.secureTextFields["connection.code"]; reveal(code, in: app); replace(code, with: "SYNTHETIC")
        app.buttons["Done typing"].tap()
        let advanced = app.buttons["Use another service"]; reveal(advanced, in: app); advanced.tap()
        let address = app.textFields["connection.address"]; reveal(address, in: app)
        replace(address, with: "https://custom.example.com"); app.buttons["Done typing"].tap()
        top(app); reveal(code, in: app)
        XCTAssertTrue(["", "One-time connection code"].contains(code.value as? String ?? ""), "Changing destination clears the unsent code")
        let reset = app.buttons["Use Career Finder"]; reveal(reset, in: app); reset.tap()
        XCTAssertFalse(app.textFields["connection.address"].exists)
        capture("22-simple-default-connection", app: app)
        app.navigationBars.buttons["Done"].tap()
    }

    @MainActor
    func testOpportunityDraftKeepSaveAndRestore() {
        let id = UUID().uuidString
        var app = launch(id: id)
        app.buttons["home.addOpportunity"].tap()
        replace(app.textFields["opportunity.url"], with: "https://careers.example.com/jobs/designer")
        replace(app.textFields["opportunity.title"], with: "Product designer")
        app.navigationBars.buttons["Cancel"].tap()
        let keepButtons = app.buttons.matching(NSPredicate(format: "label == %@", "Keep editing"))
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            keepButtons.allElementsBoundByIndex.contains { $0.exists && $0.isHittable }
        }, object: nil)
        let readiness = XCTWaiter.wait(for: [ready], timeout: 8)
        if readiness != .completed { print(app.debugDescription) }
        XCTAssertEqual(readiness, .completed, "The visible Keep editing action must become tappable")
        guard let keepEditing = keepButtons.allElementsBoundByIndex.first(where: { $0.exists && $0.isHittable }) else {
            print(app.debugDescription)
            XCTFail("No reachable Keep editing action was presented"); return
        }
        capture("05a-explicit-keep-editing-choice", app: app)
        keepEditing.tap()
        XCTAssertEqual(app.textFields["opportunity.title"].value as? String, "Product designer")
        XCTAssertEqual(app.textFields["opportunity.url"].value as? String, "https://careers.example.com/jobs/designer")
        app.navigationBars.buttons["Cancel"].tap()
        app.buttons["Save draft on this phone"].tap()
        app.terminate(); app = launch(id: id)
        app.buttons["home.addOpportunity"].tap()
        XCTAssertEqual(app.textFields["opportunity.title"].value as? String, "Product designer")
        XCTAssertEqual(app.textFields["opportunity.url"].value as? String, "https://careers.example.com/jobs/designer")
        replace(app.textFields["opportunity.company"], with: "Example employer")
        app.buttons["opportunity.save"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 5))
        tab("Saved", in: app)
        XCTAssertTrue(app.staticTexts["Product designer"].waitForExistence(timeout: 5))
        capture("05-saved-manual-opportunity", app: app)
        tab("Start", in: app); app.buttons["home.addOpportunity"].tap()
        XCTAssertTrue(["", "Role title"].contains(app.textFields["opportunity.title"].value as? String ?? ""), "A successful add consumes only the submitted draft")
    }

    @MainActor
    func testOpportunityDiscardRequiresExplicitChoice() {
        let app = launch()
        app.buttons["home.addOpportunity"].tap()
        replace(app.textFields["opportunity.title"], with: "Discard this synthetic draft")
        app.navigationBars.buttons["Cancel"].tap()
        XCTAssertTrue(app.buttons["Discard draft"].waitForExistence(timeout: 5))
        app.buttons["Discard draft"].tap()
        app.buttons["home.addOpportunity"].tap()
        XCTAssertTrue(["", "Role title"].contains(app.textFields["opportunity.title"].value as? String ?? ""))
        XCTAssertFalse(app.staticTexts["Discard this synthetic draft"].exists)
    }

    @MainActor
    func testDiscoverySaveFlowsIntoSavedAndApply() {
        let app = launch(); tab("Search", in: app)
        app.buttons["discovery.search"].tap()
        let role = element("discovery.job.fixture-design", app: app)
        reveal(role, in: app); role.tap()
        let save = app.buttons["discovery.saveOpportunity"]; reveal(save, in: app); save.tap()
        XCTAssertTrue(element("discovery.saved", app: app).waitForExistence(timeout: 5))
        capture("06-discovered-role-saved", app: app)
        tab("Saved", in: app)
        let saved = app.staticTexts["Interface designer"]
        XCTAssertTrue(saved.waitForExistence(timeout: 5)); saved.tap()
        XCTAssertTrue(app.buttons["Open application workspace"].waitForExistence(timeout: 5))
        app.buttons["Open application workspace"].tap()
        XCTAssertTrue(app.tabBars.buttons["Apply"].isSelected)
        let select = app.buttons["Interface designer at Synthetic employer"]
        reveal(select, in: app)
        XCTAssertTrue(select.exists, "The discovered role must be in the actual application workspace")
        capture("07-discovery-to-application-workspace", app: app)
    }

    @MainActor
    func testSearchEmptyAndFailurePreservesPreviousResults() {
        let app = launch(); tab("Search", in: app)
        replace(app.textFields["discovery.keywords"], with: "nothing matches")
        searchFromKeyboard(in: app)
        let empty = element("discovery.empty", app: app)
        reveal(empty, in: app)
        XCTAssertTrue(empty.label.contains("No roles match this search."), "The empty state must describe the completed search")
        capture("08a-completed-search-with-no-matches", app: app)
        top(app)
        replace(app.textFields["discovery.keywords"], with: "")
        searchFromKeyboard(in: app, usingReturnKey: true)
        let role = element("discovery.job.fixture-design", app: app); reveal(role, in: app)
        top(app)
        replace(app.textFields["discovery.keywords"], with: "offline error")
        searchFromKeyboard(in: app)
        let issue = element("discovery.error", app: app); reveal(issue, in: app)
        XCTAssertTrue(issue.label.contains("Search could not finish."))
        XCTAssertTrue(issue.label.contains("previous results are kept."))
        reveal(role, in: app); XCTAssertTrue(role.exists)
        capture("08-offline-search-keeps-results", app: app)
    }

    @MainActor
    func testAccessibilityTextKeepsCoreControlsReachable() {
        let app = launch(largeText: true)
        capture("09-start-accessibility-text", app: app)
        let profile = app.buttons["home.applicationProfile"]; reveal(profile, in: app)
        XCTAssertLessThan(profile.frame.maxY, app.tabBars.firstMatch.frame.minY,
                          "The Start action must be above the floating tab bar before it is tapped")
        capture("09a-start-profile-fully-visible", app: app)
        profile.tap()
        let opened = app.navigationBars["Application profile"].waitForExistence(timeout: 5)
        if !opened { capture("large-text-profile-did-not-open", app: app); print(app.debugDescription) }
        XCTAssertTrue(opened, "The fully visible Start profile action must open its sheet with one tap")
        let name = app.textFields["application.firstName"]; reveal(name, in: app); replace(name, with: "Alex")
        XCTAssertTrue(app.navigationBars.buttons["Cancel"].isHittable)
        capture("10-profile-accessibility-keyboard", app: app)
        app.navigationBars.buttons["Cancel"].tap()
        app.buttons["Save draft on this phone"].tap()
        tab("Search", in: app)
        let boards = app.buttons["discovery.chooseBoards"]; reveal(boards, in: app); boards.tap()
        XCTAssertTrue(app.navigationBars.buttons["Done"].waitForExistence(timeout: 5))
        capture("11-employer-boards-accessibility-text", app: app)
        app.navigationBars.buttons["Done"].tap()
        tab("Apply", in: app)
        let review = app.buttons["applications.review"]
        XCTAssertTrue(review.isHittable)
        XCTAssertEqual(review.label, "Set up Auto Apply")
        capture("12-application-workspace-accessibility-text", app: app)
        review.tap()
        let connection = app.navigationBars["Application connection"]
        XCTAssertTrue(connection.waitForExistence(timeout: 5), "The application CTA must open connection setup")
        let done = connection.buttons["Done"]
        XCTAssertTrue(done.isHittable, "Connection setup must have a reachable dismiss control at accessibility text sizes")
        capture("13-application-connection-accessibility-text", app: app)
        done.tap()
        let dismissed = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            !connection.exists && review.isHittable
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 5), .completed,
                       "Dismissing connection setup must return to the application CTA")
    }

    @MainActor
    func testConnectedWorkspaceExplainsUnavailableSubmissionAtLargeText() {
        for (availability, heading) in [("disabled", "Auto Apply is not activated"), ("unverified", "Submission availability is unverified")] {
            let app = launch(largeText: true, availability: availability)
            tab("Apply", in: app)
            let review = app.buttons["applications.review"]
            XCTAssertTrue(review.waitForExistence(timeout: 5))
            XCTAssertEqual(review.label, "Select opportunities to check", "Connection alone must not promise live submission")
            XCTAssertFalse(review.isEnabled, "An empty workspace cannot start an application review")
            let explanation = element("applications.availability.heading", app: app)
            let content = app.scrollViews["applications.content"]
            XCTAssertTrue(content.waitForExistence(timeout: 5))
            XCTAssertLessThan(review.frame.height, app.frame.height * 0.4,
                              "The largest text setting must leave most of the phone available for scrolling content")
            XCTAssertGreaterThan(review.frame.minY - app.navigationBars.firstMatch.frame.maxY, app.frame.height * 0.45,
                                 "The fixed application action must leave a usable scrolling viewport above it")
            revealInApplicationContent(explanation, app: app)
            XCTAssertTrue(explanation.exists && explanation.isHittable, "Availability must be reachable inside the application workspace")
            XCTAssertEqual(explanation.label, heading)
            capture("14-\(availability)-submission-explained", app: app)
            let refresh = app.buttons["applications.availability.refresh"]
            revealInApplicationContent(refresh, app: app)
            XCTAssertTrue(refresh.exists && refresh.isHittable, "Availability refresh must remain reachable at the largest text setting")
            refresh.tap()
            XCTAssertTrue(explanation.exists, "Refreshing an offline service must preserve its explicit availability state")
            capture("15-\(availability)-refresh-reachable", app: app)
            app.terminate()
        }
    }

    @MainActor
    func testRetainedRecordAssociationNeedsConfirmationWithoutRestoringBookmark() {
        let app = launch(availability: "disabled", orphanRecord: true)
        tab("Saved", in: app)
        let role = app.staticTexts["Record without a bookmark"]; reveal(role, in: app); role.tap()
        let associate = app.buttons["record.keepWithWorkspace"]; reveal(associate, in: app); associate.tap()
        let cancel = app.buttons["Keep separate on this phone"]
        XCTAssertTrue(cancel.waitForExistence(timeout: 5)); cancel.tap()
        XCTAssertTrue(associate.exists, "Cancel leaves the retained record separate from the connected workspace")
        capture("22-retained-record-cancel", app: app)
        reveal(associate, in: app); associate.tap()
        let confirm = app.buttons["Keep with this workspace"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5)); confirm.tap()
        top(app)
        let note = app.staticTexts["My private retained note"]; reveal(note, in: app)
        XCTAssertTrue(note.exists, "Confirmed association keeps the note on this phone")
        XCTAssertFalse(app.buttons["record.keepWithWorkspace"].exists, "The record is now associated with this workspace")
        XCTAssertFalse(app.buttons["saved.removeLink"].exists, "Association must not recreate a removed bookmark")
        capture("23-retained-record-associated", app: app)
    }
}
