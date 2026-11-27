#if CAREER_SAVED_COMPARISON_LAYOUT
import XCTest

/// Opt-in visual checks for the actual Saved comparison sheet. The normal
/// feature acceptance and its helpers remain unchanged in their original file.
@MainActor
final class CareerFinderSavedComparisonLayoutUITests: SavedComparisonUITestCase {
    private var accessibilityText = false

    override func launch() throws -> XCUIApplication {
        modalTitle = nil
        let app = XCUIApplication()
        app.launchArguments = ["-career-ui-acceptance", "-AppleLanguages", "(\(language))",
            "-AppleLocale", language == "ar" ? "ar_JO" : "en_US",
            "-UIPreferredContentSizeCategoryName",
            accessibilityText ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"]
        app.launchEnvironment["CAREER_UI_TEST_ID"] = fixtureID
        app.launchEnvironment["CAREER_UI_SAVED_COMPARISON"] = "two-openings"
        app.launch()
        try wait("The layout check opens the actual isolated Saved fixture", app: app) {
            item("acceptance.offline", app: app).exists
        }
        try require(app.tabBars.buttons.count == 5, "The actual five-tab app is present", app: app)
        try chromeTap(app.tabBars.buttons.matching(NSPredicate(format: "label == %@", localized("Saved", "المحفوظات"))).element, app: app)
        try wait("The actual Saved screen is open", app: app) {
            bars(localized("Saved opportunities", "الفرص المحفوظة"), app: app).count == 1
        }
        return app
    }

    private func exercise(language: String, accessibilityText: Bool) throws {
        self.accessibilityText = accessibilityText
        begin(language: language, phase: accessibilityText ? "layout-accessibility" : "layout-standard")
        let app = try launch()
        try choose(b, selected: true, count: 1, app: app)
        try choose(a, selected: true, count: 2, app: app)
        try showApplied(app)
        let open = button("saved.comparison.open", app: app)
        try reveal(open, app: app, forward: true)
        let savedFrame = open.frame
        try tap(open, app: app)
        modalTitle = localized("Compare two openings", "مقارنة فرصتين")
        try wait("The actual comparison sheet is open", app: app) {
            bars(modalTitle!, app: app).count == 1 && item("saved.comparison.content", app: app).exists
        }
        let cases = [
            (b, "Jeddah", localized("Interview", "مقابلة"), day(2030, 2, 20),
             localized("Not recorded", "غير مسجّل"), localized("Not recorded", "غير مسجّل")),
            (a, localized("Riyadh", "الرياض"), localized("Applied", "تم التقديم"), day(2030, 1, 10),
             "Synthetic Harbor board", checked())
        ]
        let suffixes = ["title", "location", "source", "checkedAt", "stage", "followUp", "employer"]

        if !accessibilityText {
            // No scrolling is performed before these checks. Both complete
            // openings must fit in the natural sheet opening at standard text.
            for (id, _, _, _, _, _) in cases {
                for suffix in suffixes + ["company"] {
                    let element = suffix == "employer"
                        ? button("saved.comparison." + id + ".employer", app: app)
                        : fact(id, suffix, app: app)
                    try require(whole(element, app: app),
                        "Both openings keep their whole \(suffix) in the first comparison viewport", app: app)
                }
                try require(normalized(fact(id, "company", app: app).label) == employer,
                    "Each column retains the actual employer", app: app)
            }
            for suffix in suffixes {
                let left = (suffix == "employer" ? button("saved.comparison." + b + ".employer", app: app) : fact(b, suffix, app: app)).frame
                let right = (suffix == "employer" ? button("saved.comparison." + a + ".employer", app: app) : fact(a, suffix, app: app)).frame
                try require(language == "ar" ? left.minX >= right.maxX : left.maxX <= right.minX,
                    "The two \(suffix) cells are separate and follow the app's reading direction", app: app)
                try require(abs(left.minY - right.minY) <= 2,
                    "The two \(suffix) values share a comparison row", app: app)
            }
        }

        for (id, city, stage, followUp, source, check) in cases {
            let title = fact(id, "title", app: app)
            if accessibilityText { try reveal(title, app: app) }
            try require(whole(title, app: app) && normalized(title.label) == role,
                "Each opening retains its wholly readable original role", app: app)
            if accessibilityText { try capture(id + "-title", anchor: title, app: app) }
            for (suffix, value) in [("location", city), ("source", source), ("checkedAt", check),
                                    ("stage", stage), ("followUp", followUp)] {
                let element = fact(id, suffix, app: app)
                if accessibilityText { try reveal(element, app: app) }
                try require(whole(element, app: app)
                    && normalized(element.label + " " + (element.value as? String ?? "")).contains(value),
                    "The correct opening retains its readable \(suffix)", app: app)
                if !accessibilityText && suffix != "location" {
                    try require(normalized(element.label).contains(city),
                        "A shared-row accessible fact identifies its own location", app: app)
                }
                if accessibilityText && suffix == "checkedAt" {
                    try capture(id + "-checked", anchor: element, app: app)
                }
            }
            let link = button("saved.comparison." + id + ".employer", app: app)
            if accessibilityText { try reveal(link, app: app) }
            try require(whole(link, app: app) && link.frame.height >= 44,
                "Each opening retains a whole employer-link target at least44points high", app: app)
            let linkCity = id == a ? "Riyadh" : "Jeddah"
            try require(normalized(link.label).contains(linkCity),
                "Each employer link identifies its own original location", app: app)
            if accessibilityText { try capture(id + "-link", anchor: link, app: app) }
        }
        if !accessibilityText {
            let companions = [b, a].flatMap { id in suffixes.map { suffix in
                suffix == "employer" ? button("saved.comparison." + id + ".employer", app: app)
                    : fact(id, suffix, app: app)
            } }
            try capture("both-openings", anchor: fact(b, "title", app: app), app: app, companions: companions)
        }
        try chromeTap(button("saved.comparison.close", app: app), app: app)
        let closedTitle = modalTitle!
        try wait("Closing comparison returns to the mounted Saved screen", app: app) {
            bars(closedTitle, app: app).count == 0 && !item("saved.comparison.content", app: app).exists
        }
        modalTitle = nil
        try wait("Closing preserves the Saved scroll anchor", app: app) {
            whole(open, app: app) && abs(open.frame.minY - savedFrame.minY) <= 12
        }
        try assertCount(2, app: app)
        let filter = button("saved.filter", app: app)
        try reveal(filter, app: app, forward: false)
        try require(whole(filter, app: app)
            && normalized(filter.label + " " + (filter.value as? String ?? "")).contains(localized("Applied", "تم التقديم")),
            "The Applied filter remains selected", app: app)
        app.terminate()
    }

    func testStandardEnglishShowsBothOpenings() throws { try exercise(language: "en", accessibilityText: false) }
    func testStandardArabicShowsBothOpenings() throws { try exercise(language: "ar", accessibilityText: false) }
    func testAccessibilityEnglishKeepsFactsReachable() throws { try exercise(language: "en", accessibilityText: true) }
    func testAccessibilityArabicKeepsFactsReachable() throws { try exercise(language: "ar", accessibilityText: true) }
}
#endif
