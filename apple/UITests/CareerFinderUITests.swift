import XCTest

final class CareerFinderUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    @MainActor
    private func launch(id: String = UUID().uuidString, largeText: Bool = false, availability: String? = nil, orphanRecord: Bool = false, languages: String = "(en)", recoverableRetry: Bool = false, rateLimitDelay: String? = nil) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-career-ui-acceptance", "-AppleLanguages", languages, "-AppleLocale", "en_US"]
        app.launchEnvironment["CAREER_UI_TEST_ID"] = id
        if let availability { app.launchEnvironment["CAREER_UI_APPLICATION_AVAILABILITY"] = availability }
        if orphanRecord { app.launchEnvironment["CAREER_UI_ORPHAN_RECORD"] = "1" }
        if recoverableRetry { app.launchEnvironment["CAREER_UI_DISCOVERY_RETRY_ONCE"] = "1" }
        if let rateLimitDelay { app.launchEnvironment["CAREER_UI_DISCOVERY_RATE_LIMIT_ONCE"] = rateLimitDelay }
        if largeText { app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"] }
        app.launch()
        XCTAssertTrue(app.staticTexts["acceptance.offline"].waitForExistence(timeout: 10), "Acceptance must use an isolated offline workspace")
        return app
    }
    @MainActor
    private func tab(_ name: String, in app: XCUIApplication) {
        let button = app.tabBars.buttons[name]
        // A tab may exist behind a dismissing sheet. Use the existing wait for
        // both requirements before the same real navigation tap.
        let reachable = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            button.exists && button.isHittable
        }, object: nil)
        let readiness = XCTWaiter.wait(for: [reachable], timeout: 5)
        if readiness != .completed {
            captureObservation("tab-not-reachable", app: app, details: "Tab: \(name)")
        }
        XCTAssertTrue(button.exists, "Missing tab: \(name)")
        XCTAssertTrue(readiness == .completed && button.isHittable, "Tab must be reachable: \(name)")
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
    private func contentViewport(in app: XCUIApplication, includingNavigation: Bool = false) -> CGRect {
        var top = app.frame.minY + 12, bottom = app.frame.maxY - 12
        let navigation = app.navigationBars.firstMatch, tabs = app.tabBars.firstMatch
        if !includingNavigation && navigation.exists && navigation.isHittable { top = max(top, navigation.frame.maxY + 8) }
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
            let reviewAction = app.buttons["applications.review"]
            let action = reviewAction.exists ? reviewAction : app.buttons["applications.manual"]
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
    private func hasVisibleHittableFrame(_ element: XCUIElement, in app: XCUIApplication) -> Bool {
        guard element.exists else { return false }
        let frame = element.frame
        // XCTest can retain keyboard keys with an infinite, empty frame during
        // dismissal. Do not ask that non-visible element for a hit point.
        guard frame.origin.x.isFinite, frame.origin.y.isFinite,
              frame.width.isFinite, frame.height.isFinite,
              frame.width > 0, frame.height > 0 else { return false }
        let viewport = app.frame
        guard viewport.origin.x.isFinite, viewport.origin.y.isFinite,
              viewport.width.isFinite, viewport.height.isFinite,
              viewport.width > 0, viewport.height > 0,
              frame.intersects(viewport) else { return false }
        return element.isHittable
    }
    private struct UIObservationTrace {
        let stage: String
        let startedAt: TimeInterval
        let completedAt: TimeInterval
        let matched: Bool?
    }
    @MainActor
    private func reportObservationTrace(_ name: String, deadline: TimeInterval, timeout: TimeInterval,
                                        traces: [UIObservationTrace]) {
        let origin = deadline - timeout
        for (index, trace) in traces.enumerated() {
            let match = trace.matched.map { $0 ? "true" : "false" } ?? "n/a"
            print("UI observation \(name) #\(index + 1): stage=\(trace.stage); start=\(trace.startedAt - origin); end=\(trace.completedAt - origin); matched=\(match); late=\(trace.completedAt > deadline)")
        }
    }
    @MainActor
    private func typingKeyIsVisible(_ deleteKey: XCUIElement, in app: XCUIApplication,
                                    record: ((UIObservationTrace) -> Void)? = nil) -> Bool {
        // Resolve the viewport first, leaving the fresh key snapshot and live
        // hit test adjacent without another element query between them.
        let viewportStartedAt = ProcessInfo.processInfo.systemUptime
        let viewport = app.frame
        let viewportCompletedAt = ProcessInfo.processInfo.systemUptime
        record?(UIObservationTrace(stage: "app viewport", startedAt: viewportStartedAt,
                                   completedAt: viewportCompletedAt, matched: nil))
        guard viewport.origin.x.isFinite, viewport.origin.y.isFinite,
              viewport.width.isFinite, viewport.height.isFinite,
              viewport.width > 0, viewport.height > 0 else { return false }
        // Reuse the exact system-key query for this keyboard presentation.
        // One fresh snapshot resolves presence and geometry together, avoiding
        // separate accessibility round trips inside the unchanged deadline.
        let snapshotStartedAt = ProcessInfo.processInfo.systemUptime
        let currentSnapshot = try? deleteKey.snapshot()
        let snapshotCompletedAt = ProcessInfo.processInfo.systemUptime
        record?(UIObservationTrace(stage: "key snapshot", startedAt: snapshotStartedAt,
                                   completedAt: snapshotCompletedAt, matched: currentSnapshot != nil))
        guard let snapshot = currentSnapshot,
              snapshot.elementType == .key, snapshot.identifier == "delete" else { return false }
        let frame = snapshot.frame
        guard frame.origin.x.isFinite, frame.origin.y.isFinite,
              frame.width.isFinite, frame.height.isFinite,
              frame.width > 0, frame.height > 0,
              frame.intersects(viewport) else { return false }
        // A snapshot cannot establish current hittability; always ask the live key.
        let hitStartedAt = ProcessInfo.processInfo.systemUptime
        let hittable = deleteKey.isHittable
        let hitCompletedAt = ProcessInfo.processInfo.systemUptime
        record?(UIObservationTrace(stage: "live key hittability", startedAt: hitStartedAt,
                                   completedAt: hitCompletedAt, matched: hittable))
        return hittable
    }
    @MainActor
    private func revealForTyping(_ field: XCUIElement, in app: XCUIApplication) -> Bool {
        guard field.waitForExistence(timeout: 5) else {
            XCTFail("The field must exist before a real typing interaction"); return false
        }
        // SwiftUI searchable fields occupy the navigation bar, unlike Form fields.
        // Include that region only for an actual search field; keyboard/accessory
        // exclusion still applies through the same viewport calculation.
        let fieldType = field.elementType
        let includingNavigation = fieldType == .searchField
        let scrollableInput = fieldType == .textField || fieldType == .textView || fieldType == .secureTextField
        var containingScroll: XCUIElement?
        var resolvedScrollQuery = false
        for attempt in 0...10 {
            let viewport = profileViewport(in: app, includingNavigation: includingNavigation)
            let frame = field.frame
            let finite = frame.minX.isFinite && frame.minY.isFinite
                && frame.width.isFinite && frame.height.isFinite
            if finite && !frame.isEmpty && viewport.contains(frame) && field.isHittable { return true }
            guard attempt < 10, viewport.height > 120 else { break }
            // Correct an identified Form/List input's observed overflow on its
            // own scroll surface. Navigation search fields keep their existing
            // path because their editor is outside the list's content hierarchy.
            if scrollableInput && finite && !frame.isEmpty && frame.height <= viewport.height,
               frame.minX >= viewport.minX && frame.maxX <= viewport.maxX,
               frame.minY < viewport.minY || frame.maxY > viewport.maxY {
                if !resolvedScrollQuery {
                    let identifier = field.identifier
                    if !identifier.isEmpty {
                        containingScroll = app.collectionViews.containing(fieldType, identifier: identifier).firstMatch
                    }
                    resolvedScrollQuery = true
                }
                if let scroll = containingScroll, scroll.exists {
                    // Cache only the query relationship; resolve current bounds
                    // again for every admitted drag, never a retained viewport.
                    let surface = scroll.frame.intersection(viewport).insetBy(dx: 4, dy: 4)
                    if !surface.isNull, surface.minX.isFinite, surface.minY.isFinite,
                       surface.width.isFinite, surface.height.isFinite,
                       surface.width > 16, surface.height > 48,
                       let x = [surface.minX + 8, surface.maxX - 8].first(where: {
                           $0 <= frame.minX - 8 || $0 >= frame.maxX + 8
                       }) {
                        let downward = frame.minY < viewport.minY
                        let correction = downward ? viewport.minY - frame.minY + 8 : frame.maxY - viewport.maxY + 8
                        let containmentRoom = downward ? viewport.maxY - frame.maxY : frame.minY - viewport.minY
                        // Keep the existing coarse reach for distant inputs.
                        // Near an edge, use observed overflow with a 32-point
                        // pan floor; the opposite edge and surface still cap it.
                        let maximumDistance = min(min(180, viewport.height * 0.36), surface.height - 16)
                        let distance = min(max(32, correction), min(maximumDistance, containmentRoom))
                        if distance >= 32 {
                            let origin = app.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
                            let from = origin.withOffset(CGVector(dx: x, dy: surface.midY + (downward ? -distance / 2 : distance / 2)))
                            let to = origin.withOffset(CGVector(dx: x, dy: surface.midY + (downward ? distance / 2 : -distance / 2)))
                            from.press(forDuration: 0.05, thenDragTo: to, withVelocity: .slow, thenHoldForDuration: 0.2)
                            continue
                        }
                    }
                }
            }
            // A field can be hittable while its tap center is under the keyboard
            // accessory. Scroll inside the actual content viewport before tapping.
            let downward = finite && frame.midY < viewport.midY
            let distance = min(180, viewport.height * 0.36)
            let origin = app.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
            let from = origin.withOffset(CGVector(dx: viewport.midX, dy: viewport.midY + (downward ? -distance / 2 : distance / 2)))
            let to = origin.withOffset(CGVector(dx: viewport.midX, dy: viewport.midY + (downward ? distance / 2 : -distance / 2)))
            from.press(forDuration: 0.05, thenDragTo: to)
        }
        captureObservation("typing-target-obscured", app: app,
                           details: "Field=\(field.frame); typing viewport=\(profileViewport(in: app, includingNavigation: includingNavigation))")
        XCTFail("The whole field must be reachable above the keyboard and its accessory before tapping")
        return false
    }
    @MainActor
    private func waitForObservation(timeout: TimeInterval, _ observation: () -> Bool) -> XCTWaiter.Result {
        // Observe immediately without an outer XCTest waiter cancelling nested
        // accessibility reads. Keep the caller's admission and acceptance window:
        // an in-flight read may finish later, but a late result never passes.
        let deadline = ProcessInfo.processInfo.systemUptime + timeout
        var traces: [UIObservationTrace] = []
        defer { reportObservationTrace("bounded condition", deadline: deadline, timeout: timeout, traces: traces) }
        while ProcessInfo.processInfo.systemUptime < deadline {
            let observationStartedAt = ProcessInfo.processInfo.systemUptime
            let ready = observation()
            let observedAt = ProcessInfo.processInfo.systemUptime
            traces.append(UIObservationTrace(stage: "condition", startedAt: observationStartedAt,
                                             completedAt: observedAt, matched: ready))
            if ready && observedAt <= deadline { return .completed }
            let remaining = deadline - observedAt
            guard remaining > 0 else { break }
            RunLoop.current.run(until: Date(timeIntervalSinceNow: min(0.05, remaining)))
        }
        return .timedOut
    }
    @MainActor
    private func replace(_ field: XCUIElement, with text: String, in app: XCUIApplication, clearWith clearButton: XCUIElement? = nil) {
        guard revealForTyping(field, in: app) else { return }
        field.tap()
        // A cold system keyboard can still be opening after the field is focused.
        // Wait for that presentation before starting the unchanged real-key gate.
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5),
                      "The native keyboard must appear before checking its typing key")
        let deleteKey = app.keyboards.firstMatch.keys.matching(identifier: "delete").firstMatch
        // XCUI reads wait for their own accessibility replies. An outer XCTest
        // waiter can time out inside isHittable and interrupt those nested reads.
        // Keep the same five-second acceptance window without cancelling a read.
        let keyboardDeadline = ProcessInfo.processInfo.systemUptime + 5
        var readiness = XCTWaiter.Result.timedOut
        var keyboardTraces: [UIObservationTrace] = []
        while ProcessInfo.processInfo.systemUptime < keyboardDeadline {
            let observationStartedAt = ProcessInfo.processInfo.systemUptime
            let keyIsReady = self.typingKeyIsVisible(deleteKey, in: app) { keyboardTraces.append($0) }
            let observedAt = ProcessInfo.processInfo.systemUptime
            keyboardTraces.append(UIObservationTrace(stage: "keyboard condition", startedAt: observationStartedAt,
                                                      completedAt: observedAt, matched: keyIsReady))
            if keyIsReady && observedAt <= keyboardDeadline {
                readiness = .completed
                break
            }
            let remaining = keyboardDeadline - observedAt
            guard remaining > 0 else { break }
            RunLoop.current.run(until: Date(timeIntervalSinceNow: min(0.05, remaining)))
        }
        reportObservationTrace("keyboard readiness", deadline: keyboardDeadline, timeout: 5, traces: keyboardTraces)
        if readiness != .completed { print(app.debugDescription) }
        XCTAssertEqual(readiness, .completed, "A real keyboard key must be visible before typing")
        guard readiness == .completed else { return }
        let placeholder = field.placeholderValue
        let isSecure = field.elementType == .secureTextField
        guard let value = field.value as? String else {
            capture("replacement-value-unavailable", app: app)
            print(app.debugDescription)
            XCTFail("The actual field value must be readable before editing"); return
        }
        let previous = value == placeholder ? "" : value
        if isSecure {
            field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: previous.count) + text)
        } else {
            if !previous.isEmpty {
                if let clearButton {
                    // The service-address row offers a real user-facing Clear action.
                    // Dismiss the floating keyboard toolbar before revealing its full target.
                    finishTyping(in: app)
                    XCTAssertTrue(clearButton.waitForExistence(timeout: 5), "The field's Clear action must exist")
                    reveal(clearButton, in: app)
                    XCTAssertTrue(clearButton.isEnabled && clearButton.isHittable, "The visible Clear action must be enabled")
                    clearButton.tap()
                } else {
                    // A tap can place the caret inside existing text. Use the real
                    // Select All action rather than assuming backward-delete starts at the end.
                    field.press(forDuration: 1.1)
                    let names = ["Select All", "تحديد الكل"]
                    let predicate = NSPredicate(format: "label IN %@ OR identifier IN %@", names, names)
                    let choices = [app.menuItems.matching(predicate), app.buttons.matching(predicate)]
                    let selectable = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
                        choices.flatMap { $0.allElementsBoundByIndex }.contains { $0.exists && $0.isHittable }
                    }, object: nil)
                    let selectionReady = XCTWaiter.wait(for: [selectable], timeout: 5)
                    if selectionReady != .completed {
                        capture("replacement-select-all-unavailable", app: app)
                        print(app.debugDescription)
                    }
                    XCTAssertEqual(selectionReady, .completed, "Existing text must expose a reachable Select All edit action")
                    guard let selectAll = choices.flatMap({ $0.allElementsBoundByIndex }).first(where: { $0.exists && $0.isHittable }) else {
                        XCTFail("Missing reachable Select All edit action"); return
                    }
                    selectAll.tap()
                    field.typeText(XCUIKeyboardKey.delete.rawValue)
                }
                var lastClearValue = "No value observation completed"
                let cleared = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
                    let observed = field.value
                    lastClearValue = String(reflecting: observed)
                    guard let value = observed as? String else { return false }
                    return value.isEmpty || value == placeholder
                }, object: nil)
                let clearResult = XCTWaiter.wait(for: [cleared], timeout: 5)
                if clearResult != .completed {
                    capture("replacement-did-not-clear-whole-field", app: app)
                    print("Last actual field value after clearing: \(lastClearValue)")
                    print(app.debugDescription)
                }
                XCTAssertEqual(clearResult, .completed,
                               "The native editing action must clear the whole field before replacement")
                if clearButton != nil {
                    field.tap()
                    XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5),
                                  "The native keyboard must reappear after clearing before checking its typing key")
                    let reopenedDeleteKey = app.keyboards.firstMatch.keys.matching(identifier: "delete").firstMatch
                    let keyboardAfterClear = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
                        self.typingKeyIsVisible(reopenedDeleteKey, in: app)
                    }, object: nil)
                    XCTAssertEqual(XCTWaiter.wait(for: [keyboardAfterClear], timeout: 5), .completed,
                                   "A real keyboard key must be visible after clearing before replacement")
                }
            }
            if !text.isEmpty { field.typeText(text) }
        }
        if !isSecure {
            var lastEditedValue = "No value observation completed"
            let editResult = waitForObservation(timeout: 5) {
                // Each evaluation reads the real AX value once. Placeholder/type
                // queries can consume this bounded wait after a keyboard change.
                let observed = field.value
                lastEditedValue = String(reflecting: observed)
                guard let value = observed as? String else { return false }
                // Entered text may legitimately equal the placeholder itself.
                return text.isEmpty ? (value.isEmpty || value == placeholder) : value == text
            }
            if editResult != .completed {
                capture("replacement-did-not-match-exact-value", app: app)
                print("Expected exact field value: \(String(reflecting: text)); last observed: \(lastEditedValue)")
                print(app.debugDescription)
            }
            XCTAssertEqual(editResult, .completed,
                           "Typing must update this field to the exact requested value")
        }
    }
    @MainActor
    private func finishTyping(in app: XCUIApplication) {
        let done = app.buttons["Done typing"]
        guard done.exists else {
            XCTAssertFalse(app.keyboards.keys.allElementsBoundByIndex.contains { self.hasVisibleHittableFrame($0, in: app) },
                           "An open editor keyboard must expose its Done action")
            return
        }
        XCTAssertTrue(hasVisibleHittableFrame(done, in: app), "Done typing must be reachable")
        done.tap()
        let keyboard = app.keyboards.firstMatch
        let keys = app.keyboards.keys
        let actions = app.buttons.matching(identifier: "Done typing")
        // Each remote accessibility query can take seconds on the CI simulator.
        // Observe the three original requirements serially so one expensive
        // collection lookup cannot consume another condition's entire wait.
        let observations: [(String, () -> Bool)] = [
            ("keyboard container", { !self.hasVisibleHittableFrame(keyboard, in: app) }),
            ("typing keys", { !keys.allElementsBoundByIndex.contains { self.hasVisibleHittableFrame($0, in: app) } }),
            ("Done actions", { !actions.allElementsBoundByIndex.contains { self.hasVisibleHittableFrame($0, in: app) } })
        ]
        for (stage, isDismissed) in observations {
            var lastObserved = false
            let dismissed = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
                lastObserved = isDismissed()
                return lastObserved
            }, object: nil)
            let result = XCTWaiter.wait(for: [dismissed], timeout: 5)
            if result != .completed {
                captureObservation("keyboard-dismissal-incomplete", app: app,
                                   details: "Dismissal stage: \(stage); last observed dismissed: \(lastObserved)")
            }
            XCTAssertEqual(result, .completed,
                           "Finish dismissing \(stage) before moving to the next field")
            guard result == .completed else { return }
        }
    }
    @MainActor
    private func capture(_ name: String, app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
    @MainActor
    private func captureObservation(_ name: String, app: XCUIApplication, details: String) {
        capture(name, app: app)
        let evidence = XCTAttachment(string: details + "\n\n" + app.debugDescription)
        evidence.name = "\(name)-geometry-and-original-AX"; evidence.lifetime = .keepAlways; add(evidence)
    }
    @MainActor
    private func profileViewport(in app: XCUIApplication, includingNavigation: Bool = false) -> CGRect {
        var viewport = contentViewport(in: app, includingNavigation: includingNavigation)
        let keyboard = app.keyboards.firstMatch
        var bottom = viewport.maxY
        if keyboard.exists && keyboard.isHittable { bottom = min(bottom, keyboard.frame.minY - 8) }
        for title in ["Done typing", "انتهيت من الكتابة"] {
            let accessory = app.toolbars.containing(.button, identifier: title).firstMatch
            if hasVisibleHittableFrame(accessory, in: app) {
                bottom = min(bottom, accessory.frame.minY - 8)
            }
            let done = app.buttons[title]
            if hasVisibleHittableFrame(done, in: app) { bottom = min(bottom, done.frame.minY - 8) }
        }
        viewport.size.height = max(0, bottom - viewport.minY)
        return viewport
    }
    @MainActor
    private func assertProfileLabel(_ app: XCUIApplication, fieldID: String, title: String,
                                    value: String, screenshot: String, keyboardExpected: Bool = false,
                                    fieldOverride: XCUIElement? = nil) {
        let field = fieldOverride ?? app.textFields[fieldID], label = app.staticTexts[fieldID + ".label"]
        // Scroll the actual label/field pair together, including the real keyboard
        // boundary. Retain the original pose/AX before any final failure.
        for _ in 0..<20 {
            let viewport = profileViewport(in: app)
            let pair = label.exists && field.exists ? label.frame.union(field.frame) : CGRect.null
            if !pair.isNull && pair.width > 0 && pair.height > 0 && viewport.contains(pair) && field.isHittable { break }
            if viewport.height <= 120 { break }
            guard !pair.isNull, pair.width > 0, pair.height > 0 else { break }
            // Correct only the observed overflow. A fixed large swipe can fling
            // this already-small pair past the opposite boundary on every attempt.
            let correction: CGFloat
            if pair.minY < viewport.minY { correction = viewport.minY - pair.minY + 8 }
            else if pair.maxY > viewport.maxY { correction = viewport.maxY - pair.maxY - 8 }
            else { break }
            let scroll = fieldOverride == nil
                ? app.collectionViews.containing(.textField, identifier: fieldID).firstMatch
                : app.collectionViews.containing(field.elementType, identifier: fieldID).firstMatch
            guard scroll.exists else { break }
            let surface = scroll.frame.intersection(viewport).insetBy(dx: 4, dy: 4)
            guard !surface.isNull, surface.width > 16, surface.height > 40 else { break }
            // The recorded 10-point drag did not pan; keep near-edge corrections
            // above that observed dead zone while retaining the surface-based cap.
            let distance = min(max(32, abs(correction)), min(80, surface.height * 0.25))
            // Stay on this Form's visible padding, outside the editable value,
            // and hold the end of the real drag so it does not become a fling.
            let x = max(surface.minX + 8, min(pair.minX - 8, surface.maxX - 8))
            let downward = correction > 0
            let origin = app.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
            let from = origin.withOffset(CGVector(dx: x, dy: surface.midY + (downward ? -distance / 2 : distance / 2)))
            let to = origin.withOffset(CGVector(dx: x, dy: surface.midY + (downward ? distance / 2 : -distance / 2)))
            from.press(forDuration: 0.05, thenDragTo: to, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        let viewport = profileViewport(in: app)
        captureObservation(screenshot, app: app,
                           details: "field=\(fieldID)\nlabel=\(label.frame)\nfieldFrame=\(field.frame)\nviewport=\(viewport)\nkeyboardExpected=\(keyboardExpected)")
        XCTAssertTrue(label.exists && field.exists && field.isHittable, "Both visible field name and editable value must be reachable")
        XCTAssertEqual(label.label, title, "The persistent field label must use the selected language")
        XCTAssertEqual(field.label, title, "The native field keeps its original accessible name")
        XCTAssertEqual(field.value as? String, value, "Adding a visible label must not alter the user's exact value")
        XCTAssertGreaterThan(label.frame.height, 0)
        XCTAssertTrue(viewport.contains(label.frame) && viewport.contains(field.frame), "The full label and value must fit above navigation/keyboard boundaries")
        XCTAssertLessThanOrEqual(label.frame.maxY, field.frame.minY + 1, "The separate label must not overlap the editable value")
        if keyboardExpected {
            XCTAssertTrue(app.keyboards.firstMatch.exists && app.keyboards.firstMatch.isHittable, "The retained pose must include the actual editing keyboard")
        }
    }
    @MainActor
    private func assertProfileReadingDirection(_ app: XCUIApplication, fieldID: String, rightToLeft: Bool,
                                               fieldOverride: XCUIElement? = nil) {
        // Observe the already-captured label pose without moving focus or scrolling.
        // The caller supplies the expected language direction independently of the app.
        let labelFrame = app.staticTexts[fieldID + ".label"].frame
        let fieldFrame = (fieldOverride ?? app.textFields[fieldID]).frame
        let navigation = app.navigationBars[rightToLeft ? "ملف التقديم" : "Application profile"]
        let cancelFrame = navigation.buttons[rightToLeft ? "إلغاء" : "Cancel"].frame
        let saveFrame = navigation.buttons[rightToLeft ? "حفظ" : "Save"].frame
        let frames = [labelFrame, fieldFrame, cancelFrame, saveFrame]
        XCTAssertTrue(frames.allSatisfy { frame in
            !frame.isNull && !frame.isEmpty && frame.minX.isFinite && frame.minY.isFinite
                && frame.width.isFinite && frame.height.isFinite
        }, "Profile direction must be checked against real, finite label, field and navigation frames")
        if rightToLeft {
            XCTAssertEqual(labelFrame.maxX, fieldFrame.maxX, accuracy: 2,
                           "The Arabic persistent label must align with the field's right edge")
            XCTAssertGreaterThan(cancelFrame.midX, saveFrame.midX,
                                 "Arabic profile cancellation must appear to the right of Save")
        } else {
            XCTAssertEqual(labelFrame.minX, fieldFrame.minX, accuracy: 2,
                           "The English persistent label must align with the field's left edge")
            XCTAssertLessThan(cancelFrame.midX, saveFrame.midX,
                              "English profile cancellation must appear to the left of Save")
        }
    }
    @MainActor
    private func assertHostedBrowserReturn(_ app: XCUIApplication, code: XCUIElement,
                                           connectionTitle: String, doneTitle: String,
                                           browserDoneTitle: String = "Done", screenshot: String) {
        let enteredCode = code.value as? String ?? ""
        captureObservation(screenshot + "-before-browser", app: app,
                           details: "Unsent code AX value: \(String(reflecting: enteredCode)); placeholder: \(String(reflecting: code.placeholderValue)); connect enabled: \(app.buttons["connection.connect"].isEnabled)")
        XCTAssertFalse(enteredCode.isEmpty || enteredCode == code.placeholderValue,
                       "The return check requires an existing unsent synthetic code")
        let signIn = app.buttons["connection.signIn"]; top(app); reveal(signIn, in: app)
        XCTAssertTrue(signIn.isEnabled && signIn.isHittable)
        signIn.tap()
        let browser = app.otherElements["hostedService.browser"]
        let appeared = browser.waitForExistence(timeout: 10)
        // App launch-language overrides do not change the separately hosted
        // Safari service's system language. Keep its expected label explicit.
        let doneQuery = app.buttons.matching(NSPredicate(format: "label == %@", browserDoneTitle))
        // A cold Safari remote service took over 14 seconds to expose controls
        // in the retained runner recording. Keep checking the real unique,
        // localized Done action through service startup.
        let toolbarReady = waitForObservation(timeout: 20) {
            doneQuery.allElementsBoundByIndex.filter { $0.exists && $0.isHittable }.count == 1
        }
        // Keep original screen and AX evidence even when a remote Safari
        // accessibility hierarchy differs from this expected lookup.
        capture(screenshot, app: app)
        let observed = XCTAttachment(string: app.debugDescription)
        observed.name = "\(screenshot)-original-AX"; observed.lifetime = .keepAlways; add(observed)
        XCTAssertTrue(appeared, "Observe the actual visible Safari controller, not its empty presentation anchor")
        XCTAssertEqual(app.state, .runningForeground, "Hosted setup must keep this app in the foreground")
        XCTAssertEqual(toolbarReady, .completed, "Safari needs one reachable standard localized Done action")
        let choices = doneQuery.allElementsBoundByIndex.filter { $0.exists && $0.isHittable }
        XCTAssertEqual(choices.count, 1)
        guard let browserDone = choices.first, choices.count == 1 else { return }
        XCTAssertTrue(app.frame.contains(browserDone.frame), "Safari's complete Done control must fit in the app window")
        let connection = app.navigationBars[connectionTitle]
        XCTAssertFalse(connection.buttons[doneTitle].isHittable,
                       "The underlying connection Done must not be the browser's visible action")
        // Presentation and return only: never sign in, create a code, pair the
        // phone, mutate an account, or submit an employer application here.
        // Safari's circular Done control overlaps the address AX frame.
        // XCTest chose an outside corner in the retained event; touch the
        // verified control's center while preserving the actual Done action.
        browserDone.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        let returned = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            !browser.exists && connection.exists && connection.buttons[doneTitle].isHittable
        }, object: nil)
        let returnedState = XCTWaiter.wait(for: [returned], timeout: 5)
        if returnedState != .completed {
            capture("\(screenshot)-return-failed", app: app)
            let failure = XCTAttachment(string: app.debugDescription)
            failure.name = "\(screenshot)-return-original-AX"; failure.lifetime = .keepAlways; add(failure)
        }
        XCTAssertEqual(returnedState, .completed, "Safari must disappear before the connection form is considered restored")
        XCTAssertEqual(app.state, .runningForeground)
        reveal(code, in: app)
        XCTAssertTrue(code.exists && code.isHittable)
        // SecureField may expose a mask. This proves visible pending-code
        // retention; it does not expose or claim to compare plaintext secrets.
        XCTAssertEqual(code.value as? String, enteredCode, "The visible pending-code representation must remain unchanged")
        XCTAssertFalse(app.textFields["connection.address"].exists, "Returning must preserve the default hosted destination")
        let connect = app.buttons["connection.connect"]; reveal(connect, in: app)
        XCTAssertTrue(connect.isEnabled && connect.isHittable, "The retained code must keep the connection action available")
        capture("\(screenshot)-returned", app: app)
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
            let field = app.textFields[id]; reveal(field, in: app); replace(field, with: value, in: app)
            // One native typing event can still be delivering characters when
            // typeText returns. Observe its exact result without typing again.
            let entered = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
                field.exists && (field.value as? String) == value
            }, object: nil)
            let entry = XCTWaiter.wait(for: [entered], timeout: 5)
            if entry != .completed {
                capture("opportunity-input-incomplete-\(id)", app: app)
                print(app.debugDescription)
            }
            XCTAssertEqual(entry, .completed, "The single typing event must deliver the exact fixture text within the readiness window")
            XCTAssertEqual(field.value as? String, value, "The intended field must receive the exact fixture text")
            finishTyping(in: app)
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
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        let deleteKey = app.keyboards.firstMatch.keys.matching(identifier: "delete").firstMatch
        let keyReady = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            self.typingKeyIsVisible(deleteKey, in: app)
        }, object: nil)
        let keyReadiness = XCTWaiter.wait(for: [keyReady], timeout: 5)
        if keyReadiness != .completed { print(app.debugDescription) }
        XCTAssertEqual(keyReadiness, .completed, "A real keyboard key must be visible before submitting")
        guard typingKeyIsVisible(deleteKey, in: app) else {
            print(app.debugDescription)
            XCTFail("No reachable keyboard key was presented"); return
        }
        let search = app.buttons["discovery.keyboardSearch"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        XCTAssertTrue(hasVisibleHittableFrame(search, in: app), "Search must be reachable while the keyboard is open")
        if usingReturnKey {
            app.textFields["discovery.keywords"].typeText("\n")
        } else {
            search.tap()
        }
        // Query the current collections: resolving a retained, vanished element retries
        // internally and can consume the wait before the absence has been reported.
        var lastVisibleTypingKey: Bool?
        var lastVisibleSearchAction: Bool?
        let dismissed = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            let keys = app.keyboards.keys.allElementsBoundByIndex
            let toolbarActions = app.buttons.matching(identifier: "discovery.keyboardSearch").allElementsBoundByIndex
            lastVisibleTypingKey = keys.contains { self.hasVisibleHittableFrame($0, in: app) }
            lastVisibleSearchAction = toolbarActions.contains { self.hasVisibleHittableFrame($0, in: app) }
            return lastVisibleTypingKey == false && lastVisibleSearchAction == false
        }, object: nil)
        let dismissal = XCTWaiter.wait(for: [dismissed], timeout: 5)
        if dismissal != .completed {
            captureObservation("search-keyboard-dismissal-incomplete", app: app,
                               details: "Visible typing key: \(String(describing: lastVisibleTypingKey)); visible search action: \(String(describing: lastVisibleSearchAction))")
        }
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
        XCTAssertTrue(app.staticTexts["No saved jobs yet"].waitForExistence(timeout: 5))
        tab("Settings", in: app)
        XCTAssertTrue(app.buttons["settings.profile"].waitForExistence(timeout: 5))
        app.buttons["settings.profile"].tap()
        XCTAssertTrue(app.buttons["profile.applicationProfile"].waitForExistence(timeout: 5))
        tab("Apply", in: app)
        XCTAssertTrue(app.buttons["applications.profile"].waitForExistence(timeout: 5))
        let manual = app.buttons["applications.manual"]
        XCTAssertTrue(manual.exists && manual.isEnabled && manual.isHittable)
        XCTAssertEqual(manual.label, "Search jobs")
        manual.tap()
        XCTAssertTrue(app.textFields["discovery.keywords"].waitForExistence(timeout: 5),
                      "A guest can search for a job without connecting an application service")
        tab("Apply", in: app)
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
        replace(name, with: "Taylor", in: app)
        replace(app.textFields["application.email"], with: "taylor@example.com", in: app)
        finishTyping(in: app)
        let city = app.textFields["application.city"]; reveal(city, in: app)
        replace(city, with: "Riyadh", in: app)
        finishTyping(in: app)
        let roles = app.textFields["application.targetRoles"]; reveal(roles, in: app)
        replace(roles, with: "Research", in: app)
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
        assertProfileLabel(app, fieldID: "application.firstName", title: "First or single name",
                           value: "Taylor", screenshot: "04a-restored-first-name-label")
        assertProfileReadingDirection(app, fieldID: "application.firstName", rightToLeft: false)
        assertProfileLabel(app, fieldID: "application.email", title: "Email",
                           value: "taylor@example.com", screenshot: "04b-restored-email-label")
        let restoredCity = app.textFields["application.city"]; reveal(restoredCity, in: app)
        assertProfileLabel(app, fieldID: "application.city", title: "City (optional)",
                           value: "Riyadh", screenshot: "04c-restored-city-label")
        assertProfileReadingDirection(app, fieldID: "application.city", rightToLeft: false)
        let restoredRoles = element("application.targetRoles", app: app); reveal(restoredRoles, in: app)
        assertProfileLabel(app, fieldID: "application.targetRoles", title: "Target roles, separated by commas",
                           value: "Research", screenshot: "04d-restored-target-roles-label", fieldOverride: restoredRoles)
        assertProfileReadingDirection(app, fieldID: "application.targetRoles", rightToLeft: false,
                                      fieldOverride: restoredRoles)
    }

    @MainActor
    func testLinkedInProfileDraftAndExternalSearchChoice() {
        let id = UUID().uuidString
        var app = launch(id: id)
        let open = app.buttons["home.applicationProfile"]; reveal(open, in: app); open.tap()
        let field = app.textFields["application.linkedin"]
        reveal(field, in: app)
        XCTAssertTrue(["", "LinkedIn profile (optional)"].contains(field.value as? String ?? ""), "A new user has no seeded LinkedIn identity")
        replace(field, with: "https://sa.linkedin.com/in/example-profile/?tracking=discard#about", in: app)
        app.buttons["Done typing"].tap()
        XCTAssertTrue(app.buttons["application.openLinkedIn"].exists || app.links["application.openLinkedIn"].exists,
                      "A valid saved profile offers an explicit external open action")
        let roles = app.textFields["application.targetRoles"]; reveal(roles, in: app)
        replace(roles, with: "Research", in: app)
        finishTyping(in: app)
        app.navigationBars.buttons["Save"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 5))
        app.terminate(); app = launch(id: id)
        let reopened = app.buttons["home.applicationProfile"]; reveal(reopened, in: app); reopened.tap()
        let restored = element("application.linkedin", app: app); reveal(restored, in: app)
        XCTAssertEqual(restored.value as? String, "https://www.linkedin.com/in/example-profile", "A saved LinkedIn link is canonical and survives relaunch")
        capture("16-linkedin-profile-link", app: app)
        app.navigationBars.buttons["Cancel"].tap()
        tab("Search", in: app)
        let profileRoles = app.buttons["discovery.profileRoles"]; reveal(profileRoles, in: app); profileRoles.tap()
        let role = app.buttons["discovery.profileRole.0"]; reveal(role, in: app); role.tap()
        XCTAssertEqual(app.textFields["discovery.keywords"].value as? String, "Research")
        XCTAssertTrue(["", "Location text (optional)"].contains(app.textFields["discovery.location"].value as? String ?? ""))
        XCTAssertEqual(app.switches["discovery.remote"].value as? String, "0", "Choosing a role must not infer remote eligibility")
        capture("30-profile-role-shortcut", app: app)
        reveal(profileRoles, in: app); profileRoles.tap()
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
        let note = app.textViews["record.note"]; reveal(note, in: app); replace(note, with: "Prepare a thoughtful follow-up.", in: app)
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
        element("record.stage", app: app).tap(); chooseMenu("Saved for later", in: app)
        XCTAssertTrue(element("record.stage", app: app).label.contains("Saved"))
        app.buttons["record.save"].tap()
        XCTAssertTrue(app.buttons["Keep application record"].waitForExistence(timeout: 5))
        app.buttons["Keep application record"].tap()
        app.navigationBars.buttons["Cancel"].tap(); app.buttons["Discard changes"].tap()
        XCTAssertEqual(element("record.stageSummary", app: app).label, "You marked: Applied", "Canceling a correction preserves the saved applied record")
        let again = app.buttons["record.edit"]; reveal(again, in: app); again.tap()
        element("record.stage", app: app).tap(); chooseMenu("Saved for later", in: app); app.buttons["record.save"].tap()
        app.buttons["Mark not applied"].tap()
        XCTAssertTrue(app.buttons["record.edit"].waitForExistence(timeout: 5))
        XCTAssertEqual(element("record.stageSummary", app: app).label, "You marked: Saved for later")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        element("saved.filter", app: app).tap(); chooseMenu("Follow-ups", in: app)
        XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 5), "The private follow-up remains available after an explicit applied-mark correction")
        capture("19-private-follow-up-filter", app: app)
        let retainedRow = app.staticTexts[title]; reveal(retainedRow, in: app); retainedRow.tap()
        let remove = app.buttons["saved.removeLink"]; reveal(remove, in: app); remove.tap()
        let confirm = app.buttons["opportunity.confirmRemove"]; reveal(confirm, in: app); confirm.tap()
        let removalClosed = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            !app.buttons["opportunity.confirmRemove"].exists
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [removalClosed], timeout: 5), .completed)
        app.navigationBars.buttons.element(boundBy: 0).tap()
        tab("Apply", in: app)
        let manual = app.buttons["applications.manual"]
        XCTAssertTrue(manual.waitForExistence(timeout: 5) && manual.isEnabled && manual.isHittable)
        XCTAssertEqual(manual.label, "Open saved jobs", "A meaningful retained record remains reachable without its bookmark")
        manual.tap()
        let kept = app.staticTexts[title]; reveal(kept, in: app); kept.tap()
        XCTAssertTrue(app.staticTexts["Prepare a thoughtful follow-up."].exists)
        XCTAssertFalse(app.buttons["saved.removeLink"].exists, "Manual navigation must not restore a removed bookmark")
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
        replace(app.textFields["application.firstName"], with: "Alex", in: app)
        replace(app.textFields["application.email"], with: "invalid-email", in: app)
        finishTyping(in: app)
        let reuse = app.buttons["profile.reuse"]; reveal(reuse, in: app); reuse.tap()
        let copyName = app.buttons["profile.copy.firstName"]; reveal(copyName, in: app)
        XCTAssertEqual(copyName.value as? String, "Alex", "Only the chosen visible field is offered for copying")
        copyName.tap()
        let copied = app.staticTexts["profile.copy.confirmation"]
        // Form feedback below the copied fields may not exist in the accessibility
        // tree until real scrolling brings that row into view.
        reveal(copied, in: app)
        XCTAssertTrue(copied.waitForExistence(timeout: 5))
        capture("31-profile-contact-reuse", app: app)
        app.navigationBars.buttons["Save"].tap()
        tab("Apply", in: app)
        let email = element("profile.essential.email", app: app); reveal(email, in: app)
        XCTAssertEqual(email.label, "Check your email")
        XCTAssertEqual(element("profile.essential.name", app: app).label, "Name added")
        XCTAssertEqual(element("profile.essential.resume", app: app).label, "PDF CV needed")
        capture("21-profile-readiness", app: app)
        let setup = app.buttons["applications.connect"]
        revealInApplicationContent(setup, app: app)
        XCTAssertTrue(setup.isEnabled && setup.isHittable, "The visible setup action must be enabled")
        setup.tap()
        let opened = app.navigationBars["Application connection"].waitForExistence(timeout: 5)
        if !opened { capture("connection-setup-did-not-open", app: app); print(app.debugDescription) }
        XCTAssertTrue(opened, "One tap on Connect application workspace must open connection setup")
        XCTAssertFalse(app.textFields["connection.address"].exists, "Default setup needs no service-address editing")
        let code = app.secureTextFields["connection.code"]; reveal(code, in: app); replace(code, with: "SYNTHETIC", in: app)
        app.buttons["Done typing"].tap()
        assertHostedBrowserReturn(app, code: code, connectionTitle: "Application connection",
                                  doneTitle: "Done", screenshot: "23-in-app-hosted-connection-browser")
        // Reopen the same browser after complete dismissal to exercise the
        // presentation state reset without signing in or sending the code.
        assertHostedBrowserReturn(app, code: code, connectionTitle: "Application connection",
                                  doneTitle: "Done", screenshot: "23a-in-app-hosted-connection-reopened")
        let advanced = app.buttons["Use another service"]; reveal(advanced, in: app); advanced.tap()
        let address = app.textFields["connection.address"]; reveal(address, in: app)
        replace(address, with: "https://custom.example.com", in: app, clearWith: app.buttons["connection.clearAddress"])
        finishTyping(in: app)
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
        replace(app.textFields["opportunity.url"], with: "https://careers.example.com/jobs/designer", in: app)
        replace(app.textFields["opportunity.title"], with: "Product designer", in: app)
        finishTyping(in: app)
        let company = app.textFields["opportunity.company"]; reveal(company, in: app)
        replace(company, with: "Draft employer", in: app)
        finishTyping(in: app)
        let location = app.textFields["opportunity.location"]; reveal(location, in: app)
        replace(location, with: "Riyadh", in: app)
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
        // Editing the last row leaves a lower scroll pose. Return to the top
        // before reading the earlier fields, then inspect the draft in order.
        top(app)
        XCTAssertEqual(app.textFields["opportunity.title"].value as? String, "Product designer")
        XCTAssertEqual(app.textFields["opportunity.url"].value as? String, "https://careers.example.com/jobs/designer")
        reveal(app.textFields["opportunity.company"], in: app)
        XCTAssertEqual(app.textFields["opportunity.company"].value as? String, "Draft employer")
        reveal(app.textFields["opportunity.location"], in: app)
        XCTAssertEqual(app.textFields["opportunity.location"].value as? String, "Riyadh")
        app.navigationBars.buttons["Cancel"].tap()
        app.buttons["Save draft on this phone"].tap()
        app.terminate(); app = launch(id: id)
        app.buttons["home.addOpportunity"].tap()
        XCTAssertEqual(app.textFields["opportunity.title"].value as? String, "Product designer")
        XCTAssertEqual(app.textFields["opportunity.url"].value as? String, "https://careers.example.com/jobs/designer")
        reveal(app.textFields["opportunity.title"], in: app)
        assertProfileLabel(app, fieldID: "opportunity.title", title: "Role title",
                           value: "Product designer", screenshot: "05b-restored-opportunity-title-label")
        reveal(app.textFields["opportunity.company"], in: app)
        assertProfileLabel(app, fieldID: "opportunity.company", title: "Employer",
                           value: "Draft employer", screenshot: "05c-restored-opportunity-employer-label")
        reveal(app.textFields["opportunity.location"], in: app)
        assertProfileLabel(app, fieldID: "opportunity.location", title: "Location or remote",
                           value: "Riyadh", screenshot: "05d-restored-opportunity-location-label")
        // The restored draft is clean, so a whole-sheet downward swipe can dismiss it.
        // Let replace reveal the field directionally inside the content viewport.
        replace(app.textFields["opportunity.company"], with: "Example employer", in: app)
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
        replace(app.textFields["opportunity.title"], with: "Discard this synthetic draft", in: app)
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
        let app = launch(recoverableRetry: true); tab("Search", in: app)
        replace(app.textFields["discovery.keywords"], with: "nothing matches", in: app)
        searchFromKeyboard(in: app)
        let empty = element("discovery.empty", app: app)
        reveal(empty, in: app)
        XCTAssertTrue(empty.label.contains("No matching jobs in these boards."), "The empty state must describe the completed search")
        XCTAssertTrue(empty.label.contains("Try a broader job title, another location, or a different employer board."),
                      "A completed empty search must explain how to broaden the submitted search")
        capture("08a-completed-search-with-no-matches", app: app)
        top(app)
        replace(app.textFields["discovery.keywords"], with: "", in: app)
        searchFromKeyboard(in: app, usingReturnKey: true)
        let role = element("discovery.job.fixture-design", app: app); reveal(role, in: app)
        top(app)
        replace(app.textFields["discovery.keywords"], with: "offline error", in: app)
        searchFromKeyboard(in: app)
        let issue = element("discovery.error", app: app); reveal(issue, in: app)
        XCTAssertTrue(issue.label.contains("Search could not finish."))
        XCTAssertTrue(issue.label.contains("previous results are kept."))
        reveal(role, in: app); XCTAssertTrue(role.exists)
        capture("08-offline-search-keeps-results", app: app)
        // Keep the permanent-failure checks above. This independent recovery
        // fixture proves the visible Retry action uses the failed submitted
        // search while preserving a newer, deliberately different field draft.
        top(app)
        replace(app.textFields["discovery.keywords"], with: "Interface designer", in: app)
        searchFromKeyboard(in: app)
        reveal(issue, in: app)
        XCTAssertTrue(issue.exists && issue.label.contains("Search could not finish."))
        top(app)
        replace(app.textFields["discovery.keywords"], with: "nothing matches", in: app)
        finishTyping(in: app)
        let retry = app.buttons["discovery.retry"]; reveal(retry, in: app)
        XCTAssertTrue(retry.isEnabled && retry.isHittable)
        captureObservation("08a-retry-before-newer-draft", app: app, details: "submitted=Interface designer\nnewerDraft=nothing matches")
        retry.tap()
        let recovered = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            !issue.exists && role.exists
        }, object: nil)
        let retryResult = XCTWaiter.wait(for: [recovered], timeout: 5)
        captureObservation("08b-retry-recovered-submitted-search", app: app, details: "retryWait=\(retryResult)")
        XCTAssertEqual(retryResult, .completed, "Retry must actually replace the failure with the matching submitted search result")
        XCTAssertFalse(app.buttons["discovery.retry"].exists)
        XCTAssertFalse(element("discovery.job.fixture-engineer", app: app).exists, "Retry must use the submitted matching query, not the earlier broad result set")
        top(app)
        XCTAssertEqual(app.textFields["discovery.keywords"].value as? String, "nothing matches", "Successful Retry must not replace the newer input draft")
        app.terminate()

        // Observe the active controls before slow accessibility traversal. The
        // hosted run took 19 seconds from tap to its old 10-second assertion.
        // A 30-second fixture leaves a bounded observation window while still
        // proving real expiry and successful retry in this existing journey.
        for delay in ["0", "30"] {
            let limited = launch(rateLimitDelay: delay); tab("Search", in: limited)
            replace(limited.textFields["discovery.keywords"], with: "Interface designer", in: limited)
            let searchHelperStarted = Date()
            searchFromKeyboard(in: limited)
            let searchHelperReturned = Date()
            let again = limited.buttons["discovery.retrySearch"]
            let exactRetry = limited.buttons["discovery.retry"]
            if !again.exists || !exactRetry.exists { limited.swipeUp() }
            XCTAssertTrue(again.waitForExistence(timeout: 5) && exactRetry.waitForExistence(timeout: 5))
            let againInitiallyEnabled = again.isEnabled
            let exactInitiallyEnabled = exactRetry.isEnabled
            let controlsObserved = Date()
            let timing = "syntheticRetryAfterSeconds=\(delay)\nsearchHelperSeconds=\(searchHelperReturned.timeIntervalSince(searchHelperStarted))\ncontrolLookupSeconds=\(controlsObserved.timeIntervalSince(searchHelperReturned))"
            if delay == "30" {
                XCTAssertFalse(againInitiallyEnabled, "Search again must wait for the active deadline; " + timing)
                XCTAssertFalse(exactInitiallyEnabled, "Exact retry must visibly wait, rather than accept a no-op tap; " + timing)
            }
            let released = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
                again.exists && exactRetry.exists && again.isEnabled && exactRetry.isEnabled
            }, object: nil)
            let releaseWait: TimeInterval = delay == "0" ? 15 : 35
            XCTAssertEqual(XCTWaiter.wait(for: [released], timeout: releaseWait), .completed,
                           "Both retry actions must become enabled after a zero or elapsed deadline")
            let rateIssue = element("discovery.error", app: limited)
            XCTAssertTrue(rateIssue.waitForExistence(timeout: 5))
            XCTAssertTrue(rateIssue.label.contains("Search is temporarily busy."),
                          "The original failure must remain visible until a real retry succeeds")
            captureObservation("08c-rate-limit-" + delay, app: limited, details: timing)
            let action = delay == "0" ? again : exactRetry
            reveal(action, in: limited); action.tap()
            let result = element("discovery.job.fixture-design", app: limited)
            let recoveredRateLimit = waitForObservation(timeout: 5) {
                !rateIssue.exists && result.exists
            }
            XCTAssertEqual(recoveredRateLimit, .completed,
                           "The enabled retry must recover matching results, not only change the control state")
            limited.terminate()
        }
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
        let name = app.textFields["application.firstName"]; reveal(name, in: app); replace(name, with: "Alex", in: app)
        XCTAssertTrue(app.navigationBars.buttons["Cancel"].isHittable)
        capture("10-profile-accessibility-keyboard", app: app)
        assertProfileLabel(app, fieldID: "application.firstName", title: "First or single name",
                           value: "Alex", screenshot: "10a-first-name-label-accessibility-keyboard", keyboardExpected: true)
        assertProfileReadingDirection(app, fieldID: "application.firstName", rightToLeft: false)
        finishTyping(in: app)
        let profileEmail = app.textFields["application.email"]; reveal(profileEmail, in: app)
        replace(profileEmail, with: "alex@example.invalid", in: app)
        assertProfileLabel(app, fieldID: "application.email", title: "Email",
                           value: "alex@example.invalid", screenshot: "10b-email-label-accessibility-keyboard", keyboardExpected: true)
        finishTyping(in: app)
        let profileCity = app.textFields["application.city"]; reveal(profileCity, in: app)
        replace(profileCity, with: "Riyadh", in: app)
        assertProfileLabel(app, fieldID: "application.city", title: "City (optional)",
                           value: "Riyadh", screenshot: "10c-city-label-accessibility-keyboard", keyboardExpected: true)
        assertProfileReadingDirection(app, fieldID: "application.city", rightToLeft: false)
        app.navigationBars.buttons["Cancel"].tap()
        app.buttons["Save draft on this phone"].tap()
        tab("Search", in: app)
        let boards = app.buttons["discovery.chooseBoards"]; reveal(boards, in: app); boards.tap()
        XCTAssertTrue(app.navigationBars.buttons["Done"].waitForExistence(timeout: 5))
        capture("11-employer-boards-accessibility-text", app: app)
        app.navigationBars.buttons["Done"].tap()
        tab("Apply", in: app)
        let manual = app.buttons["applications.manual"]
        XCTAssertTrue(manual.isHittable && manual.isEnabled)
        XCTAssertEqual(manual.label, "Search jobs")
        let review = app.buttons["applications.connect"]
        revealInApplicationContent(review, app: app)
        XCTAssertTrue(review.isHittable)
        XCTAssertEqual(review.label, "Connect application workspace")
        capture("12-application-workspace-accessibility-text", app: app)
        review.tap()
        let connection = app.navigationBars["Application connection"]
        XCTAssertTrue(connection.waitForExistence(timeout: 5), "The application CTA must open connection setup")
        let done = connection.buttons["Done"]
        XCTAssertTrue(done.isHittable, "Connection setup must have a reachable dismiss control at accessibility text sizes")
        capture("13-application-connection-accessibility-text", app: app)
        let code = app.secureTextFields["connection.code"]; reveal(code, in: app)
        replace(code, with: "SYNTHETIC", in: app)
        finishTyping(in: app)
        assertHostedBrowserReturn(app, code: code, connectionTitle: "Application connection",
                                  doneTitle: "Done", screenshot: "13a-hosted-browser-accessibility-text")
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
            let content = app.scrollViews["applications.content"]
            XCTAssertTrue(content.waitForExistence(timeout: 5))
            // These controls belong to this scroll view. A typed, scoped query
            // avoids repeatedly resolving every element in the application.
            let explanation = content.staticTexts["applications.availability.heading"]
            XCTAssertLessThan(review.frame.height, app.frame.height * 0.4,
                              "The largest text setting must leave most of the phone available for scrolling content")
            XCTAssertGreaterThan(review.frame.minY - app.navigationBars.firstMatch.frame.maxY, app.frame.height * 0.45,
                                 "The fixed application action must leave a usable scrolling viewport above it")
            revealInApplicationContent(explanation, app: app)
            XCTAssertTrue(explanation.exists && explanation.isHittable, "Availability must be reachable inside the application workspace")
            XCTAssertEqual(explanation.label, heading)
            capture("14-\(availability)-submission-explained", app: app)
            let refresh = content.buttons["applications.availability.refresh"]
            revealInApplicationContent(refresh, app: app)
            XCTAssertTrue(refresh.exists && refresh.isHittable, "Availability refresh must remain reachable at the largest text setting")
            refresh.tap()
            XCTAssertTrue(explanation.exists, "Refreshing an offline service must preserve its explicit availability state")
            capture("15-\(availability)-refresh-reachable", app: app)
            app.terminate()
        }
    }

    @MainActor
    func testSettingsAppearanceSurvivesRelaunchAndKeepsProfileReachable() {
        let id = UUID().uuidString
        var app = launch(id: id, largeText: true)
        let gear = app.buttons["navigation.settings"]
        XCTAssertTrue(gear.waitForExistence(timeout: 5) && gear.isHittable)
        gear.tap()
        XCTAssertTrue(app.tabBars.buttons["Settings"].isSelected, "Gear and tab must open the same Settings destination")
        let system = app.buttons["settings.appearance.system"]
        reveal(system, in: app)
        XCTAssertTrue(system.isSelected, "A new isolated workspace follows the system appearance")
        let dark = app.buttons["settings.appearance.dark"]
        reveal(dark, in: app); dark.tap()
        XCTAssertTrue(dark.isSelected)
        capture("24-settings-dark-large-text", app: app)
        app.terminate()

        app = launch(id: id, largeText: true)
        tab("Settings", in: app)
        let restored = app.buttons["settings.appearance.dark"]
        reveal(restored, in: app)
        XCTAssertTrue(restored.isSelected, "Appearance must survive an app relaunch")
        let restoredTabs = ["Start", "Search", "Apply", "Saved", "Settings"].map { app.tabBars.buttons[$0] }
        let tabsReady = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            restoredTabs.allSatisfy { $0.exists && $0.isHittable && !$0.frame.isEmpty && app.frame.contains($0.frame) }
                && app.tabBars.buttons["Settings"].isSelected && restored.isSelected
        }, object: nil)
        let settled = XCTWaiter.wait(for: [tabsReady], timeout: 5)
        captureObservation("24a-settings-dark-restored-large-text", app: app,
                           details: "post-relaunch=true\nselectedDark=\(restored.isSelected)\nwindow=\(app.frame)\ntabs=\(restoredTabs.map { "\($0.label):\($0.frame)" })")
        XCTAssertEqual(settled, .completed, "Retain a post-relaunch dark pose with every actual tab visible before changing appearance")
        let light = app.buttons["settings.appearance.light"]
        reveal(light, in: app); light.tap()
        XCTAssertTrue(light.isSelected)
        capture("25-settings-light-large-text", app: app)
        let automatic = app.buttons["settings.appearance.system"]
        reveal(automatic, in: app); automatic.tap()
        XCTAssertTrue(automatic.isSelected)
        let profile = app.buttons["settings.profile"]
        reveal(profile, in: app); profile.tap()
        XCTAssertTrue(app.buttons["profile.applicationProfile"].waitForExistence(timeout: 5), "Settings must retain access to the existing profile editor")
        capture("26-settings-profile-reachable", app: app)
    }

    @MainActor
    func testArabicLanguagePersistsAndKeepsSavedProfileValuesAtLargeText() {
        let id = UUID().uuidString
        var app = launch(id: id, largeText: true, availability: "disabled")
        let profile = app.buttons["home.applicationProfile"]; reveal(profile, in: app); profile.tap()
        replace(app.textFields["application.firstName"], with: "Saved", in: app)
        replace(app.textFields["application.email"], with: "saved@example.invalid", in: app)
        finishTyping(in: app)
        let city = app.textFields["application.city"]; reveal(city, in: app)
        replace(city, with: "Riyadh", in: app)
        finishTyping(in: app)
        let roles = app.textFields["application.targetRoles"]; reveal(roles, in: app)
        replace(roles, with: "Research", in: app)
        app.navigationBars.buttons["Cancel"].tap()
        XCTAssertTrue(app.buttons["Save draft on this phone"].waitForExistence(timeout: 5))
        app.buttons["Save draft on this phone"].tap()
        tab("Settings", in: app)
        let arabic = app.buttons["settings.language.ar"]; reveal(arabic, in: app); arabic.tap()
        XCTAssertTrue(arabic.isSelected)
        XCTAssertTrue(app.tabBars.buttons["الإعدادات"].waitForExistence(timeout: 5))
        let start = app.tabBars.buttons["البداية"], settings = app.tabBars.buttons["الإعدادات"]
        XCTAssertTrue(start.exists && settings.exists)
        XCTAssertGreaterThan(start.frame.midX, settings.frame.midX, "Arabic navigation follows right-to-left order")
        capture("27-settings-arabic-large-text", app: app)
        app.terminate()

        app = launch(id: id, largeText: true, availability: "disabled")
        XCTAssertTrue(app.tabBars.buttons["الإعدادات"].waitForExistence(timeout: 5), "Explicit Arabic survives a relaunch on an English device")
        let reopen = app.buttons["home.applicationProfile"]; reveal(reopen, in: app); reopen.tap()
        XCTAssertTrue(app.textFields["application.firstName"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.textFields["application.firstName"].value as? String, "Saved", "User text equal to an English label stays verbatim")
        reveal(app.textFields["application.email"], in: app)
        XCTAssertEqual(app.textFields["application.email"].value as? String, "saved@example.invalid")
        capture("28-arabic-profile-original-values", app: app)
        top(app)
        reveal(app.textFields["application.firstName"], in: app)
        assertProfileLabel(app, fieldID: "application.firstName", title: "الاسم الأول أو الاسم الوحيد",
                           value: "Saved", screenshot: "28a-arabic-first-name-label-accessibility")
        assertProfileReadingDirection(app, fieldID: "application.firstName", rightToLeft: true)
        assertProfileLabel(app, fieldID: "application.email", title: "البريد الإلكتروني",
                           value: "saved@example.invalid", screenshot: "28b-arabic-email-label-accessibility")
        assertProfileReadingDirection(app, fieldID: "application.email", rightToLeft: true)
        let restoredCity = app.textFields["application.city"]; reveal(restoredCity, in: app)
        assertProfileLabel(app, fieldID: "application.city", title: "المدينة (اختياري)",
                           value: "Riyadh", screenshot: "28e-arabic-city-label-accessibility")
        assertProfileReadingDirection(app, fieldID: "application.city", rightToLeft: true)
        let restoredRoles = element("application.targetRoles", app: app); reveal(restoredRoles, in: app)
        assertProfileLabel(app, fieldID: "application.targetRoles", title: "الوظائف المستهدفة، مفصولة بفواصل",
                           value: "Research", screenshot: "28f-arabic-target-roles-label-accessibility", fieldOverride: restoredRoles)
        assertProfileReadingDirection(app, fieldID: "application.targetRoles", rightToLeft: true,
                                      fieldOverride: restoredRoles)
        app.navigationBars.buttons["إلغاء"].tap()
        tab("الإعدادات", in: app)
        let english = app.buttons["settings.language.en"]; reveal(english, in: app); english.tap()
        XCTAssertTrue(app.tabBars.buttons["Settings"].waitForExistence(timeout: 5))
        XCTAssertTrue(english.isSelected)
        tab("Apply", in: app)
        let availability = app.scrollViews["applications.content"].staticTexts["applications.availability.heading"]
        revealInApplicationContent(availability, app: app)
        XCTAssertEqual(availability.label, "Auto Apply is not activated")
        capture("29-english-restored-submission-disabled", app: app)

        // Complete the existing Arabic-to-English and Apply availability journey
        // at AX5 before observing the separate normal-size Arabic label poses.
        tab("Settings", in: app)
        let normalArabic = app.buttons["settings.language.ar"]; reveal(normalArabic, in: app); normalArabic.tap()
        app.terminate()
        app = launch(id: id, availability: "disabled")
        let normalArabicProfile = app.buttons["home.applicationProfile"]; reveal(normalArabicProfile, in: app); normalArabicProfile.tap()
        assertProfileLabel(app, fieldID: "application.firstName", title: "الاسم الأول أو الاسم الوحيد",
                           value: "Saved", screenshot: "28c-arabic-first-name-label-normal")
        assertProfileReadingDirection(app, fieldID: "application.firstName", rightToLeft: true)
        assertProfileLabel(app, fieldID: "application.email", title: "البريد الإلكتروني",
                           value: "saved@example.invalid", screenshot: "28d-arabic-email-label-normal")
        assertProfileReadingDirection(app, fieldID: "application.email", rightToLeft: true)
        app.navigationBars.buttons["إلغاء"].tap()
    }

    @MainActor
    func testDeviceLanguageUsesAnOrderedSupportedFallbackAndAllowsEnglishOverride() {
        let id = UUID().uuidString
        var app = launch(id: id, languages: "(fr, ar)")
        XCTAssertTrue(app.tabBars.buttons["الإعدادات"].waitForExistence(timeout: 5), "System chooses Arabic after an unsupported preferred language")
        tab("الإعدادات", in: app)
        let system = app.buttons["settings.language.system"]; reveal(system, in: app)
        XCTAssertTrue(system.isSelected)
        let english = app.buttons["settings.language.en"]; reveal(english, in: app); english.tap()
        XCTAssertTrue(app.tabBars.buttons["Settings"].waitForExistence(timeout: 5))
        app.terminate()
        app = launch(id: id, languages: "(fr, ar)")
        XCTAssertTrue(app.tabBars.buttons["Settings"].waitForExistence(timeout: 5), "Explicit English remains separate from device-language fallback")

        // Use a fresh isolated Arabic-app workspace at the largest text size.
        // This launch override does not change the simulator's English system
        // Safari service; verify its real label separately from the Arabic form.
        app.terminate()
        app = launch(largeText: true, languages: "(ar)")
        tab("التقديم", in: app)
        let review = app.buttons["applications.connect"]
        revealInApplicationContent(review, app: app)
        XCTAssertTrue(review.waitForExistence(timeout: 5) && review.isEnabled && review.isHittable)
        review.tap()
        let connection = app.navigationBars["اتصال التقديم"]
        XCTAssertTrue(connection.waitForExistence(timeout: 5))
        let code = app.secureTextFields["connection.code"]; reveal(code, in: app)
        replace(code, with: "SYNTHETIC", in: app)
        captureObservation("29a-arabic-code-before-blur", app: app,
                           details: "Secure field value: \(String(reflecting: code.value)); connect enabled: \(app.buttons["connection.connect"].isEnabled)")
        let typingDone = app.buttons["انتهيت من الكتابة"]
        XCTAssertTrue(typingDone.waitForExistence(timeout: 5) && typingDone.isHittable)
        typingDone.tap()
        assertHostedBrowserReturn(app, code: code, connectionTitle: "اتصال التقديم",
                                  doneTitle: "تم", browserDoneTitle: "Done",
                                  screenshot: "29a-arabic-hosted-browser-accessibility-text")
        XCTAssertTrue(connection.buttons["تم"].isHittable)
        connection.buttons["تم"].tap()
        XCTAssertTrue(review.isHittable, "Arabic browser and connection dismissal must return to the application action")
    }

    @MainActor
    func testSavedSearchFindsArabicNotesAndKeepsOriginalText() {
        let id = UUID().uuidString, title = "Synthetic engineering role"
        let originalNote = "تَوَاصُل مع جــهة التوظيف CaseTracker"
        var app = launch(id: id)
        addLocalOpportunity(in: app, title: title, company: "Élan")
        tab("Saved", in: app)
        let row = app.staticTexts[title]; reveal(row, in: app); row.tap()
        let edit = app.buttons["record.edit"]; reveal(edit, in: app); edit.tap()
        let note = app.textViews["record.note"]; reveal(note, in: app); replace(note, with: originalNote, in: app)
        app.buttons["Done typing"].tap(); app.buttons["record.save"].tap()
        XCTAssertTrue(app.buttons["record.edit"].waitForExistence(timeout: 5))
        app.terminate(); app = launch(id: id)
        tab("Saved", in: app); top(app)
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        replace(search, with: "casetracker تواصل جهة", in: app)
        XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 5), "Existing saved search includes original private notes with comparison-only Arabic normalization")
        replace(search, with: "private-record", in: app)
        XCTAssertTrue(app.staticTexts["No saved roles match this view."].waitForExistence(timeout: 5), "Opaque URL paths are not a search index")
        replace(search, with: "e\u{0301}lan casetracker", in: app)
        let result = app.staticTexts[title]; reveal(result, in: app); result.tap()
        XCTAssertTrue(app.staticTexts[originalNote].waitForExistence(timeout: 5), "Matching must preserve the exact saved note")
        capture("30-saved-search-arabic-notes", app: app)
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
