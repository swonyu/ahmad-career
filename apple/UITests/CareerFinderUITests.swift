import XCTest

final class CareerFinderUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    @MainActor
    private func launch(id: String = UUID().uuidString, largeText: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-career-ui-acceptance", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launchEnvironment["CAREER_UI_TEST_ID"] = id
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
        for _ in 0..<swipes {
            if element.exists && element.isHittable { return }
            app.swipeUp()
        }
        XCTAssertTrue(element.exists && element.isHittable, "Expected a reachable control: \(element)")
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
        XCTAssertTrue(name.waitForExistence(timeout: 5))
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
    func testOpportunityDraftKeepSaveAndRestore() {
        let id = UUID().uuidString
        var app = launch(id: id)
        app.buttons["home.addOpportunity"].tap()
        replace(app.textFields["opportunity.url"], with: "https://careers.example.com/jobs/designer")
        replace(app.textFields["opportunity.title"], with: "Product designer")
        app.navigationBars.buttons["Cancel"].tap()
        app.buttons["Keep editing"].tap()
        XCTAssertEqual(app.textFields["opportunity.title"].value as? String, "Product designer")
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
        app.buttons["discovery.search"].tap()
        let empty = app.staticTexts["No roles match this search."]
        reveal(empty, in: app); XCTAssertTrue(empty.exists)
        top(app)
        replace(app.textFields["discovery.keywords"], with: "")
        app.buttons["discovery.search"].tap()
        let role = element("discovery.job.fixture-design", app: app); reveal(role, in: app)
        top(app)
        replace(app.textFields["discovery.keywords"], with: "offline error")
        app.buttons["discovery.search"].tap()
        let issue = element("discovery.error", app: app); reveal(issue, in: app)
        XCTAssertTrue(issue.exists)
        reveal(role, in: app); XCTAssertTrue(role.exists)
        capture("08-offline-search-keeps-results", app: app)
    }

    @MainActor
    func testAccessibilityTextKeepsCoreControlsReachable() {
        let app = launch(largeText: true)
        capture("09-start-accessibility-text", app: app)
        let profile = app.buttons["home.applicationProfile"]; reveal(profile, in: app); profile.tap()
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
        XCTAssertTrue(app.buttons["applications.review"].isHittable)
        capture("12-application-workspace-accessibility-text", app: app)
    }
}
