package com.saleh.careerfinder

import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Rect as AndroidRect
import android.os.SystemClock
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.Locale

/** Real controls only. Geometry, focus and a live system key precede every text edit. */
internal class NativeJourneyUi(
    private val compose: AndroidComposeTestRule<ActivityScenarioRule<MainActivity>, MainActivity>,
    private val runtime: NativeJourneyRuntime
) : AutoCloseable {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val automation = instrumentation.uiAutomation
    private val windows = PhoneWindowObservation()
    val strings = CareerStrings(compose.activity)
    private var lastKey: JSONObject? = null
    private var pickerPackage: String? = null
    private var pickerComponent: String? = null
    private var pickerNumber: Int = 0

    fun verifyPhoneConfiguration() {
        require(strings.locale.language == runtime.language)
        val configuration = compose.activity.resources.configuration
        require(kotlin.math.abs(configuration.fontScale - 1.8f) < .01f)
        val metrics = compose.activity.resources.displayMetrics
        require(metrics.widthPixels == 1080 && metrics.heightPixels == 1920)
        require(readLanguagePreference(compose.activity).value == runtime.language)
        require(compose.activity.getSharedPreferences(APPEARANCE_PREFERENCES, android.content.Context.MODE_PRIVATE)
            .getString(APPEARANCE_KEY, null) == "dark")
    }

    fun text(value: String): SemanticsMatcher = hasText(strings(value), substring = false)
    fun button(value: String): SemanticsMatcher = text(value) and hasClickAction()
    fun field(value: String): SemanticsMatcher = text(value) and hasSetTextAction()
    fun description(value: String): SemanticsMatcher = hasContentDescription(strings(value), substring = false)

    fun waitStrict(message: String, predicate: () -> Boolean) {
        val start = SystemClock.elapsedRealtime()
        val deadline = start + 5000
        while (SystemClock.elapsedRealtime() < deadline) {
            val matched = predicate()
            val end = SystemClock.elapsedRealtime()
            if (matched && end < deadline) return
            if (end >= deadline) break
            SystemClock.sleep(minOf(25, deadline - end))
        }
        throw AssertionError(message + " (strict five-second observation expired)")
    }

    fun unique(matcher: SemanticsMatcher): SemanticsNodeInteraction {
        val nodes = compose.onAllNodes(matcher).fetchSemanticsNodes()
        assertEquals("Exactly one actual control must match", 1, nodes.size)
        return compose.onNode(matcher)
    }

    fun present(matcher: SemanticsMatcher): Boolean = compose.onAllNodes(matcher).fetchSemanticsNodes().size == 1

    fun reveal(listTag: String, matcher: SemanticsMatcher) {
        compose.onNodeWithTag(listTag).performScrollToNode(matcher)
        assertFullyVisible(unique(matcher))
    }

    fun click(matcher: SemanticsMatcher, listTag: String? = null) {
        if (listTag != null) reveal(listTag, matcher)
        val target = unique(matcher)
        assertFullyVisible(target)
        target.assertIsEnabled().performTouchInput { click() }
    }

    fun tab(name: String) {
        require(name in setOf("jobs", "apply", "receipts", "profile", "settings"))
        val target = compose.onNodeWithTag("navigation-" + name).revealNavigationTab()
        assertFullyVisible(target)
        target.assertIsEnabled().performTouchInput { click() }
        target.assertIsSelected()
    }

    fun savedTab() {
        val target = unique(hasTestTag("jobs-saved-tab"))
        assertFullyVisible(target)
        target.assertIsEnabled().performTouchInput { click() }
        target.assertIsSelected()
        unique(hasTestTag("jobs-list")).assertExists()
    }

    fun discoveryTab() {
        val target = unique(hasTestTag("jobs-discover-tab"))
        assertFullyVisible(target)
        target.assertIsEnabled().performTouchInput { click() }
        target.assertIsSelected()
        unique(hasTestTag("discovery-list")).assertExists()
    }

    fun replace(listTag: String, matcher: SemanticsMatcher, value: String, captureName: String? = null) {
        reveal(listTag, matcher)
        replaceVisible(listTag, matcher, value, captureName)
    }

    fun replaceDialog(matcher: SemanticsMatcher, value: String, captureName: String) {
        assertFullyVisible(unique(matcher))
        replaceVisible(null, matcher, value, captureName)
    }

    private fun replaceVisible(listTag: String?, matcher: SemanticsMatcher, value: String, captureName: String?) {
        val target = unique(matcher)
        target.assertIsEnabled().performTouchInput { click() }
        waitStrict("The actual field must own focus before keyboard observation") {
            unique(matcher).fetchSemanticsNode().config.getOrNull(SemanticsProperties.Focused) == true
        }
        lastKey = observeRealKeyboardWithinFiveSeconds()
        assertTrue("A real keyboard key must be visible before typing", lastKey!!.getBoolean("readyWithinFiveSeconds"))
        val geometry = fieldGeometry(matcher, listTag)
        assertTrue("The focused full field must fit its actual parent and sit above the live IME before input",
            geometry.getBoolean("wholeFocusedFieldAboveIME"))
        if (captureName != null) capture(captureName, geometry)
        // This is the real TextField's editing action after a physical focus tap.
        // It never calls a model mutator or supplies a synthetic picker result.
        unique(matcher).performTextReplacement(value)
        unique(matcher).assertTextContains(value, substring = false)
    }

    fun dismissKeyboard() {
        if (!windows.imeVisible()) return
        instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
        waitStrict("The actual keyboard must close after Back") { !windows.imeVisible() }
    }

    fun wholeText(listTag: String, matcher: SemanticsMatcher, captureName: String) {
        reveal(listTag, matcher)
        assertFalse("Readable non-keyboard evidence must not be hidden by the IME", windows.imeVisible())
        capture(captureName, targetGeometry(matcher, listTag))
    }

    fun fieldGeometry(matcher: SemanticsMatcher, listTag: String?): JSONObject {
        val node = unique(matcher).fetchSemanticsNode()
        val full = full(node)
        val screen = fullScreen(node)
        val list = listTag?.let { unique(hasTestTag(it)).fetchSemanticsNode().boundsInRoot }
        val ime = actualWindows().filter { it.getInt("type") == AccessibilityWindowInfo.TYPE_INPUT_METHOD }
        val imeRect = if (ime.size == 1) ime.single().getJSONArray("boundsInScreen") else null
        val inParent = list == null || containsVisibleRect(list, full)
        val focused = node.config.getOrNull(SemanticsProperties.Focused) == true
        val enabled = !node.config.contains(SemanticsProperties.Disabled)
        val fits = node.layoutInfo.isPlaced && node.layoutInfo.coordinates.isAttached && focused && enabled &&
            containsVisibleRect(node.boundsInRoot, full) && inParent && imeRect != null &&
            screen.bottom <= imeRect.getDouble(1).toFloat() + 1f && screen.top >= 0 &&
            screen.left >= 0 && screen.right <= compose.activity.resources.displayMetrics.widthPixels + 1f
        return JSONObject().put("kind", "focused-field-before-input").put("fullBounds", full.json())
            .put("clippedBounds", node.boundsInRoot.json()).put("screenBounds", screen.json())
            .put("parentBounds", list?.json() ?: JSONObject.NULL).put("focused", focused).put("enabled", enabled)
            .put("placed", node.layoutInfo.isPlaced).put("attached", node.layoutInfo.coordinates.isAttached)
            .put("imeWindowCount", ime.size).put("imeBounds", imeRect ?: JSONObject.NULL)
            .put("wholeFocusedFieldAboveIME", fits)
    }

    fun targetGeometry(matcher: SemanticsMatcher, listTag: String? = null): JSONObject {
        val node = unique(matcher).fetchSemanticsNode()
        val bounds = full(node)
        val list = listTag?.let { unique(hasTestTag(it)).fetchSemanticsNode().boundsInRoot }
        val visible = node.layoutInfo.isPlaced && node.layoutInfo.coordinates.isAttached &&
            containsVisibleRect(node.boundsInRoot, bounds) && (list == null || containsVisibleRect(list, bounds))
        assertTrue("The complete named target must fit its actual clipped viewport", visible)
        return JSONObject().put("kind", "named-target").put("fullBounds", bounds.json())
            .put("clippedBounds", node.boundsInRoot.json()).put("screenBounds", fullScreen(node).json())
            .put("parentBounds", list?.json() ?: JSONObject.NULL).put("wholeTargetVisible", visible)
    }

    fun capture(name: String, geometry: JSONObject = JSONObject(), includeCompose: Boolean = true) {
        require(name.matches(Regex("[a-z0-9-]{1,80}")))
        val bitmap = checkNotNull(automation.takeScreenshot())
        val output = ByteArrayOutputStream()
        try { check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) } finally { bitmap.recycle() }
        runtime.durableBytes(File(runtime.directory, name + ".png"), output.toByteArray())
        val decor = compose.activity.window.decorView
        val insets = ViewCompat.getRootWindowInsets(decor)
        val imeInsets = insets?.getInsets(WindowInsetsCompat.Type.ime())
        geometry.put("schemaVersion", 1).put("testID", runtime.testID).put("phase", runtime.phase)
            .put("language", runtime.language).put("fontScale", compose.activity.resources.configuration.fontScale.toDouble())
            .put("observationElapsedNanos", SystemClock.elapsedRealtimeNanos()).put("process", runtime.process())
            .put("windowBounds", JSONArray(actualWindows())).put("keyboard", lastKey ?: JSONObject.NULL)
            .put("imeVisible", windows.imeVisible()).put("imeInsets", imeInsets?.let {
                JSONArray(listOf(it.left, it.top, it.right, it.bottom)) } ?: JSONObject.NULL)
            .put("pixelAndSemanticsAreSequential", true)
            .put("scope", "Actual MainActivity, actual clients and SecureVault; synthetic service and narrow connection bootstrap")
        runtime.durableJSON(File(runtime.directory, name + ".json"), geometry)
        val text = if (includeCompose) {
            val roots = compose.onAllNodes(isRoot(), useUnmergedTree = true)
            val count = roots.fetchSemanticsNodes().size
            check(count > 0)
            (0 until count).joinToString("\n\n") { index -> "ROOT " + index + "\n" + roots[index].printToString(Int.MAX_VALUE) }
        } else "COMPOSE_NOT_SAMPLED_WHILE_SYSTEM_PICKER_OWNS_WINDOW\n"
        runtime.durableBytes(File(runtime.directory, name + "-semantics.txt"), text.toByteArray(Charsets.UTF_8))
        runtime.durableJSON(File(runtime.directory, name + "-system-windows.json"), systemWindowTree())
    }

    fun preserveFailure(label: String, failure: Throwable) {
        try {
            capture("failure-" + label, JSONObject().put("failedStep", label)
                .put("throwableType", failure.javaClass.simpleName).put("originalFailureRethrown", true),
                includeCompose = pickerPackage == null)
        } catch (_: Throwable) {
            // Preservation must never replace or excuse the original failure.
            println("NATIVE_JOURNEY_FAILURE_CAPTURE_INCOMPLETE step=" + label)
        }
    }

    fun waitForDocumentPicker(): String {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/pdf")
        val resolved = checkNotNull(compose.activity.packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY))
        val activityInfo = resolved.activityInfo
        val packageName = activityInfo.packageName
        require(packageName in setOf("com.android.documentsui", "com.google.android.documentsui"))
        require(activityInfo.name.isNotBlank() && activityInfo.applicationInfo.flags and ApplicationInfo.FLAG_SYSTEM != 0)
        waitStrict("The actual system document picker must own a visible application window") {
            pickerWindows(packageName).size == 1
        }
        pickerPackage = packageName
        pickerComponent = packageName + "/" + activityInfo.name
        pickerNumber++
        runtime.durableJSON(File(runtime.directory, "picker-open-" + pickerNumber + ".json"),
            JSONObject().put("schemaVersion", 1).put("resolvedSystemComponent", pickerComponent)
                .put("visibleWindowPackage", packageName).put("visibleApplicationWindowCount", 1)
                .put("actualOpenDocumentIntent", true).put("syntheticChooserResult", false))
        return packageName
    }

    fun cancelDocumentPicker() {
        val expected = checkNotNull(pickerPackage)
        val component = checkNotNull(pickerComponent)
        require(pickerWindows(expected).size == 1)
        instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
        waitStrict("The real document picker must close after Cancel/Back") { pickerWindows(expected).isEmpty() }
        runtime.durableJSON(File(runtime.directory, "picker-back-" + pickerNumber + ".json"),
            JSONObject().put("schemaVersion", 1).put("resolvedSystemComponent", component)
                .put("actualBackKeyIssued", true).put("pickerWindowCountAfter", pickerWindows(expected).size)
                .put("pickerClosed", true).put("noModelInjection", true))
        pickerPackage = null
        pickerComponent = null
    }

    fun selectDocument(name: String) {
        require(name in setOf("CV-A.pdf", "CV-B.pdf"))
        val expected = checkNotNull(pickerPackage)
        val component = checkNotNull(pickerComponent)
        // Both independent live DocumentsUI target resolutions share the same first-observation budget.
        val started = SystemClock.elapsedRealtime()
        val deadline = started + 5000L
        var selected: JSONObject? = null
        while (SystemClock.elapsedRealtime() < deadline && selected == null) {
            selected = documentTarget(expected, name, deadline)
            if (selected == null) SystemClock.sleep(minOf(25L, (deadline - SystemClock.elapsedRealtime()).coerceAtLeast(1L)))
        }
        require(selected != null && SystemClock.elapsedRealtime() < deadline) {
            "Actual DocumentsUI target not uniquely visible inside the first five-second budget"
        }
        val firstResolutionElapsedMillis = SystemClock.elapsedRealtime() - started
        // Re-resolve immediately before the physical touch, without resetting the budget.
        val fresh = checkNotNull(documentTarget(expected, name, deadline))
        require(SystemClock.elapsedRealtime() < deadline) { "Second actual DocumentsUI resolution exceeded original budget" }
        val secondResolutionElapsedMillis = SystemClock.elapsedRealtime() - started
        require(fresh.getJSONArray("boundsInScreen").toString() == selected.getJSONArray("boundsInScreen").toString())
        val bounds = fresh.getJSONArray("boundsInScreen")
        val x = ((bounds.getDouble(0) + bounds.getDouble(2)) / 2).toFloat()
        val y = ((bounds.getDouble(1) + bounds.getDouble(3)) / 2).toFloat()
        require(SystemClock.elapsedRealtime() < deadline) { "No picker touch may begin after the original observation deadline" }
        val start = SystemClock.uptimeMillis()
        val down = MotionEvent.obtain(start, start, MotionEvent.ACTION_DOWN, x, y, 0)
        val up = MotionEvent.obtain(start, start + 50, MotionEvent.ACTION_UP, x, y, 0)
        try {
            require(automation.injectInputEvent(down, true))
            require(automation.injectInputEvent(up, true))
        } finally { down.recycle(); up.recycle() }
        waitStrict("The actual PDF selection must return from the system picker") { pickerWindows(expected).isEmpty() }
        runtime.durableJSON(File(runtime.directory, "picker-selected-" + name + ".json"),
            fresh.put("filename", name).put("singlePhysicalTouch", true).put("noModelInjection", true)
                .put("resolvedSystemComponent", component).put("firstTwoResolutionsWithinFiveSeconds", true)
                .put("firstResolutionElapsedMillis", firstResolutionElapsedMillis)
                .put("secondResolutionElapsedMillis", secondResolutionElapsedMillis)
                .put("selectionAndDismissalElapsedMillis", SystemClock.elapsedRealtime() - started)
                .put("pickerWindowCountAfter", pickerWindows(expected).size))
        pickerPackage = null
        pickerComponent = null
    }

    private fun pickerWindows(packageName: String): List<AccessibilityWindowInfo> = automation.windows.filter { window ->
        if (window.type != AccessibilityWindowInfo.TYPE_APPLICATION) false
        else window.root?.let { root -> try { root.packageName?.toString() == packageName } finally { root.recycle() } } == true
    }

    private fun documentTarget(packageName: String, filename: String, deadline: Long): JSONObject? {
        val windows = pickerWindows(packageName)
        if (SystemClock.elapsedRealtime() >= deadline || windows.size != 1) return null
        val window = windows.single()
        val windowBounds = AndroidRect().also(window::getBoundsInScreen)
        val root = window.root ?: return null
        val queue = java.util.ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        val targets = mutableListOf<JSONObject>()
        var count = 0
        try {
            while (queue.isNotEmpty() && count++ < 600 && SystemClock.elapsedRealtime() < deadline) {
                val node = queue.removeFirst()
                try {
                    if (node.packageName?.toString() == packageName && node.isVisibleToUser && node.text?.toString() == filename) {
                        var action = AccessibilityNodeInfo.obtain(node)
                        try {
                            var depth = 0
                            while (!action.isClickable && depth++ < 5) {
                                val parent = action.parent ?: break
                                action.recycle(); action = parent
                            }
                            val bounds = AndroidRect().also(action::getBoundsInScreen)
                            if (action.packageName?.toString() == packageName && action.isVisibleToUser && action.isEnabled &&
                                action.isClickable && bounds.width() > 0 && bounds.height() > 0 && windowBounds.contains(bounds)) {
                                targets += JSONObject().put("package", packageName).put("text", filename)
                                    .put("className", action.className?.toString()).put("resourceID", action.viewIdResourceName ?: JSONObject.NULL)
                                    .put("boundsInScreen", bounds.json()).put("windowBounds", windowBounds.json())
                                    .put("visible", true).put("enabled", true).put("clickable", true)
                            }
                        } finally { action.recycle() }
                    }
                    for (index in 0 until node.childCount) node.getChild(index)?.let(queue::add)
                } finally { node.recycle() }
            }
        } finally { while (queue.isNotEmpty()) queue.removeFirst().recycle() }
        if (SystemClock.elapsedRealtime() >= deadline) return null
        require(queue.isEmpty() && count < 600) { "The bounded system picker tree was incomplete" }
        return targets.singleOrNull()
    }

    private fun actualWindows(): List<JSONObject> = automation.windows.map { window ->
        JSONObject().put("id", window.id).put("type", window.type).put("active", window.isActive)
            .put("focused", window.isFocused).put("boundsInScreen", AndroidRect().also(window::getBoundsInScreen).json())
    }

    private fun systemWindowTree(): JSONObject {
        val allowedPackages = setOf(runtime.context.packageName, "com.android.documentsui", "com.google.android.documentsui")
        val result = JSONArray()
        for (window in automation.windows) {
            val root = window.root ?: continue
            val queue = java.util.ArrayDeque<AccessibilityNodeInfo>()
            queue.add(root)
            val nodes = JSONArray()
            var inspected = 0
            try {
                while (queue.isNotEmpty() && inspected++ < 600) {
                    val node = queue.removeFirst()
                    try {
                        val pkg = node.packageName?.toString().orEmpty()
                        if (pkg in allowedPackages || window.type == AccessibilityWindowInfo.TYPE_INPUT_METHOD) {
                            nodes.put(JSONObject().put("package", pkg).put("className", node.className?.toString())
                                .put("text", node.text?.toString()?.take(500) ?: JSONObject.NULL)
                                .put("description", node.contentDescription?.toString()?.take(500) ?: JSONObject.NULL)
                                .put("resourceID", node.viewIdResourceName ?: JSONObject.NULL)
                                .put("visible", node.isVisibleToUser).put("clickable", node.isClickable).put("editable", node.isEditable)
                                .put("boundsInScreen", AndroidRect().also(node::getBoundsInScreen).json()))
                            for (index in 0 until node.childCount) node.getChild(index)?.let(queue::add)
                        }
                    } finally { node.recycle() }
                }
            } finally { while (queue.isNotEmpty()) queue.removeFirst().recycle() }
            result.put(JSONObject().put("id", window.id).put("type", window.type)
                .put("boundsInScreen", AndroidRect().also(window::getBoundsInScreen).json()).put("nodes", nodes)
                .put("boundedTraversalLimit", 600).put("limitReached", inspected >= 600))
        }
        return JSONObject().put("schemaVersion", 1).put("elapsedNanos", SystemClock.elapsedRealtimeNanos()).put("windows", result)
    }

    private fun full(node: SemanticsNode): Rect = node.positionInRoot.let { Rect(it.x, it.y, it.x + node.size.width, it.y + node.size.height) }
    private fun fullScreen(node: SemanticsNode): Rect = node.positionOnScreen.let { Rect(it.x, it.y, it.x + node.size.width, it.y + node.size.height) }
    private fun Rect.json() = JSONArray(listOf(left, top, right, bottom))
    private fun AndroidRect.json() = JSONArray(listOf(left, top, right, bottom))
    override fun close() = windows.close()

    private fun observeRealKeyboardWithinFiveSeconds(): JSONObject {
        val start = SystemClock.elapsedRealtime()
        val deadline = start + 5_000
        var last = JSONObject()
        while (SystemClock.elapsedRealtime() < deadline) {
            val ime = windows.imeVisible()
            if (SystemClock.elapsedRealtime() >= deadline) return last.put("readyWithinFiveSeconds", false).put("late", true)
            val key = visibleKeyboardKey(deadline)
            val end = SystemClock.elapsedRealtime()
            last = JSONObject().put("key", key ?: JSONObject.NULL).put("imeVisible", ime)
                .put("elapsedMillis", end - start).put("late", end >= deadline)
                .put("readyWithinFiveSeconds", end < deadline && ime && key != null)
            if (last.getBoolean("readyWithinFiveSeconds") || end >= deadline) return last
            SystemClock.sleep(minOf(50, deadline - end))
        }
        return last.put("readyWithinFiveSeconds", false)
    }
    private fun visibleKeyboardKey(deadline: Long): JSONObject? {
        val windows = InstrumentationRegistry.getInstrumentation().uiAutomation.windows
        if (SystemClock.elapsedRealtime() >= deadline) return null
        for (window in windows) {
            if (SystemClock.elapsedRealtime() >= deadline) return null
            if (window.type != AccessibilityWindowInfo.TYPE_INPUT_METHOD) continue
            val windowBounds = AndroidRect().also(window::getBoundsInScreen)
            val root = window.root ?: continue
            val queue = java.util.ArrayDeque<AccessibilityNodeInfo>()
            queue.add(root)
            var inspected = 0
            try {
                while (queue.isNotEmpty() && inspected++ < 160 && SystemClock.elapsedRealtime() < deadline) {
                    val node = queue.removeFirst()
                    try {
                        val label = (node.contentDescription ?: node.text)?.toString()?.trim().orEmpty()
                        val bounds = AndroidRect().also(node::getBoundsInScreen)
                        val points = label.codePoints().toArray()
                        val namedKey = label.lowercase(Locale.ROOT) in setOf("delete", "backspace", "space", "spacebar", "enter", "return", "حذف", "مسافة", "إدخال")
                        val letterKey = points.size == 1 && Character.isLetterOrDigit(points[0])
                        if (SystemClock.elapsedRealtime() >= deadline) return null
                        if (node.isVisibleToUser && node.isClickable && !node.isEditable && (namedKey || letterKey) &&
                            bounds.width() > 0 && bounds.height() > 0 && AndroidRect.intersects(bounds, windowBounds)) {
                            return JSONObject().put("label", label).put("className", node.className?.toString())
                                .put("boundsInScreen", JSONArray(listOf(bounds.left, bounds.top, bounds.right, bounds.bottom)))
                                .put("imeWindowBoundsInScreen", JSONArray(listOf(windowBounds.left, windowBounds.top, windowBounds.right, windowBounds.bottom)))
                                .put("visibleToUser", true).put("clickable", true).put("windowType", window.type)
                        }
                        for (index in 0 until node.childCount) {
                            if (SystemClock.elapsedRealtime() >= deadline) break
                            node.getChild(index)?.let(queue::add)
                        }
                    } finally { node.recycle() }
                }
            } finally { while (queue.isNotEmpty()) queue.removeFirst().recycle() }
        }
        return null
    }
}
