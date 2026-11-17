import XCTest

/// Artifact capture only. This class is isolated on the auxiliary capture branch.
/// It launches the ordinary Release app and never uses acceptance dependencies.
final class CareerFinderStoreCaptureTests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    @MainActor
    private func capture(_ name: String, app: XCUIApplication) {
        XCTAssertFalse(app.staticTexts["acceptance.offline"].exists, "Store captures must use the ordinary app")
        XCTAssertFalse(app.staticTexts["TEST WORKSPACE"].exists, "A synthetic workspace cannot supply store assets")
        XCTAssertFalse(app.keyboards.firstMatch.exists, "Store captures must not contain an open keyboard")
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    private func tab(_ name: String, app: XCUIApplication) {
        let button = app.tabBars.buttons[name]
        XCTAssertTrue(button.waitForExistence(timeout: 5))
        XCTAssertTrue(button.isHittable, "The requested tab must be reachable")
        button.tap()
        let selected = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in button.isSelected }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [selected], timeout: 5), .completed, "The requested tab must actually open")
    }

    @MainActor
    private func reveal(_ element: XCUIElement, app: XCUIApplication, swipes: Int = 10) {
        for _ in 0..<swipes {
            if element.exists && element.isHittable { return }
            app.swipeUp()
        }
        XCTAssertTrue(element.exists && element.isHittable, "The ordinary screen must expose the required control")
    }

    @MainActor
    func testCaptureOrdinaryScreens() {
        XCUIDevice.shared.orientation = .portrait
        let app = XCUIApplication()
        app.launchEnvironment = [:]
        app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US",
                               "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launch()
        let createProfile = app.buttons["home.applicationProfile"]
        XCTAssertTrue(createProfile.waitForExistence(timeout: 10))
        XCTAssertTrue(createProfile.label.contains("Create your application profile"), "The disposable phone must start with a blank profile")
        XCTAssertTrue(app.buttons["home.discover"].isHittable)
        capture("store-01-start", app: app)

        // The production discovery client performs public GETs without account or CV data.
        tab("Search", app: app)
        let search = app.buttons["discovery.search"]
        reveal(search, app: app)
        search.tap()
        let results = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "discovery.job."))
        let problem = app.descendants(matching: .any).matching(identifier: "discovery.error").firstMatch
        let finished = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            problem.exists || !results.allElementsBoundByIndex.isEmpty
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [finished], timeout: 40), .completed,
                       "The single public search must return actual roles; fixtures or invented results are not permitted")
        XCTAssertFalse(problem.exists, "A service error cannot be presented as a successful store capture")
        let firstRole = results.firstMatch
        XCTAssertTrue(firstRole.exists, "At least one actual public role is required")
        reveal(firstRole, app: app)
        capture("store-02-public-search", app: app)

        firstRole.tap()
        XCTAssertTrue(app.navigationBars["Opportunity"].waitForExistence(timeout: 5))
        capture("store-03-public-opportunity", app: app)

        // Only the disconnected local save is used. Never tap an employer link,
        // account/pairing control, review/submit action, or external browser link.
        let save = app.buttons["discovery.saveOpportunity"]
        reveal(save, app: app, swipes: 12)
        save.tap()
        let saved = app.descendants(matching: .any).matching(identifier: "discovery.saved").firstMatch
        XCTAssertTrue(saved.waitForExistence(timeout: 5), "The real public role must be saved locally")
        let openWorkspace = app.buttons["Open application workspace"]
        reveal(openWorkspace, app: app)
        openWorkspace.tap()
        let applyTab = app.tabBars.buttons["Apply"]
        let selectedApply = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in applyTab.isSelected }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [selectedApply], timeout: 5), .completed)
        let localRecord = app.staticTexts["Saved on this phone"]
        reveal(localRecord, app: app)
        let setup = app.buttons["applications.review"]
        XCTAssertTrue(setup.isHittable)
        XCTAssertEqual(setup.label, "Set up Auto Apply", "The phone must remain disconnected throughout capture")
        capture("store-04-application-workspace", app: app)
    }
}
