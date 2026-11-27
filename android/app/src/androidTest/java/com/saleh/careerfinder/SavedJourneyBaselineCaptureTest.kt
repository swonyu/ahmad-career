package com.saleh.careerfinder

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.Build
import android.os.LocaleList
import android.os.SystemClock
import android.view.WindowManager
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.geometry.Rect as ComposeRect
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.LayoutDirection
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import java.io.File
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Focused, synthetic before/after reproduction. Retains evidence before asserting
 * chronological order or keyboard reachability; a defective baseline must fail.
 * This is separate from the existing 23-image acceptance capture contract.
 */
class SavedJourneyBaselineCaptureTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    private class MemoryStore : PrivateStore {
        val values = ConcurrentHashMap<String, String>()
        override fun read(name: String) = values[name]?.let(::JSONObject)
        override fun write(name: String, value: JSONObject) { values[name] = value.toString() }
        override fun remove(name: String) { values.remove(name) }
        override fun startFreshPreservingExisting() { error("No existing data in this isolated fixture") }
    }

    private class NoService : CareerService {
        var calls = 0
        override suspend fun pair(origin: String, code: String): Connection {
            calls++; error("No pairing is allowed in the Saved baseline fixture")
        }
        override suspend fun request(connection: Connection, method: String, route: String, body: JSONObject?): JSONObject {
            calls++; error("No application API is allowed in the Saved baseline fixture")
        }
    }

    private class DisplayContext(base: Context, private val preferences: SharedPreferences) : ContextWrapper(base) {
        override fun getSharedPreferences(name: String, mode: Int): SharedPreferences =
            if (name == "career_display_language") preferences else super.getSharedPreferences(name, mode)
        override fun getSystemService(name: String): Any? =
            if (Build.VERSION.SDK_INT >= 33 && name == Context.LOCALE_SERVICE) null else super.getSystemService(name)
    }

    private val store = MemoryStore()
    private val service = NoService()
    private val owner = ViewModelStore()
    private lateinit var model: CareerViewModel
    private lateinit var preferences: SharedPreferences
    private lateinit var displayContext: Context
    private lateinit var strings: CareerStrings
    private var renderedDirection: LayoutDirection? = null
    private var renderedLanguage: String? = null
    private var renderedFontScale = 0f
    private var originalAutomationFlags: Int? = null

    private val futureTitle = "Archive coordinator · منسق أرشيف"
    private val overdueTitle = "Care assistant · مساعد رعاية"
    private val commonNote = "Synthetic follow-up متابعة — no message or application"

    @Before fun preparePrivateFixture() {
        val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
        val info = automation.serviceInfo
        originalAutomationFlags = info.flags
        info.flags = info.flags or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
        automation.serviceInfo = info
        compose.activityRule.scenario.onActivity { activity ->
            // Match MainActivity's actual edge-to-edge and adjustResize window policy.
            activity.enableEdgeToEdge()
            activity.window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
            preferences = activity.getSharedPreferences("saved-baseline-" + UUID.randomUUID(), Context.MODE_PRIVATE)
            displayContext = DisplayContext(activity, preferences)
            val discovery = object : DiscoveryService {
                override suspend fun sources() = DiscoveryCatalog(emptyList(), emptyList(), 4, "Synthetic baseline")
                override suspend fun search(filters: DiscoveryFilters, cursor: String?): DiscoveryPage =
                    error("No discovery search is needed for this Saved-only fixture")
            }
            model = CareerViewModel(activity.application, store, service, discoveryService = discovery)
            owner.put("saved-baseline", model)
        }
    }

    @After fun releaseOnlyFixtureState() {
        if (::preferences.isInitialized) compose.runOnIdle {
            owner.clear()
            check(preferences.edit().clear().commit())
        }
        originalAutomationFlags?.let { flags ->
            val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
            val info = automation.serviceInfo
            info.flags = flags
            automation.serviceInfo = info
        }
    }

    @Test fun englishSavedFollowUpsAndKeyboard_keepRetainedRecordsReachable() = exercise("en")
    @Test fun arabicSavedFollowUpsAndKeyboard_keepRetainedRecordsReachable() = exercise("ar")

    private fun mount(language: String) {
        check(preferences.edit().putString("selection", language).commit())
        val config = Configuration(displayContext.resources.configuration).apply {
            setLocales(LocaleList(Locale.forLanguageTag(language)))
        }
        strings = CareerStrings(displayContext.createConfigurationContext(config))
        compose.activityRule.scenario.onActivity { activity ->
            activity.setContent {
                CompositionLocalProvider(LocalContext provides displayContext) {
                    CareerLanguage {
                        val direction = LocalLayoutDirection.current
                        val currentStrings = rememberCareerStrings()
                        val fontScale = LocalConfiguration.current.fontScale
                        SideEffect {
                            renderedDirection = direction
                            renderedLanguage = currentStrings.locale.language
                            renderedFontScale = fontScale
                        }
                        CareerTheme { CareerApp(model) }
                    }
                }
            }
        }
        compose.waitUntil(5_000) { model.state.value.loaded && !model.state.value.busy && renderedLanguage == language }
        assertEquals(if (language == "ar") LayoutDirection.Rtl else LayoutDirection.Ltr, renderedDirection)
        assertTrue("The baseline must retain at least 180% text", renderedFontScale >= 1.79f)
        assertEquals(ProfileDraft(), model.state.value.profile)
        assertNull(model.state.value.connection)
    }

    private fun addRecord(url: String, title: String, company: String, location: String, country: String, day: String): Opportunity {
        compose.runOnIdle { model.addOpportunity(url, title, company, location, country) {} }
        compose.waitUntil(5_000) { !model.state.value.busy && model.state.value.jobs.any { it.url == url } }
        val job = model.state.value.jobs.single { it.url == url }
        compose.runOnIdle {
            model.openApplicationRecord(job)
            val token = checkNotNull(model.state.value.applicationRecordEditor).token
            model.editApplicationRecordDraft({ it.copy(stage = ApplicationStage.SAVED, followUpDate = day, note = commonNote) }, token)
            model.saveApplicationRecord(expectedToken = token)
        }
        compose.waitUntil(5_000) { !model.state.value.busy && model.state.value.applicationRecordEditor == null }
        assertEquals(day, model.state.value.recordFor(job)?.current?.record?.followUpDate)
        return job
    }

    private fun exercise(language: String) {
        mount(language)
        val future = addRecord("https://example.invalid/career-baseline/future", futureTitle,
            "Example Archive", "Toronto · تورونتو", "CA", "2099-12-31")
        val overdue = addRecord("https://example.invalid/career-baseline/overdue", overdueTitle,
            "Example Care", "Amman · عمّان", "JO", "2000-01-01")
        compose.runOnIdle { model.removeLocalOpportunity(overdue.id) }
        compose.waitUntil(5_000) { !model.state.value.busy && model.state.value.jobs.size == 1 }
        assertEquals(2, model.state.value.applicationRecords.size)
        assertEquals(1, model.state.value.unbookmarkedRecords.size)
        val retained = model.state.value.unbookmarkedRecords.single()
        compose.runOnIdle { model.dismissMessage() }

        compose.onNodeWithTag("jobs-saved-tab").performClick()
        val list = compose.onNodeWithTag("jobs-list")
        list.performScrollToNode(hasText(strings("Follow-ups")))
        compose.onNodeWithText(strings("Follow-ups")).performClick()
        list.performScrollToIndex(0)

        val observedOrder = mutableListOf<String>()
        val orderSteps = JSONArray()
        val orderObservationProblems = mutableListOf<String>()
        // Observe production LazyColumn keys; do not infer order from fixture seed
        // order or from a fling that can skip an entire title at large text.
        val indexForKey = list.fetchSemanticsNode().config.getOrNull(SemanticsProperties.IndexForKey)
        val indexedTitles = listOf(
            futureTitle to future.id,
            overdueTitle to "record-${retained.identity}"
        ).map { (title, key) -> Triple(title, key, indexForKey?.invoke(key) ?: -1) }
        val distinctIndices = indexedTitles.map { it.third }.toSet()
        val keyObservationComplete = indexForKey != null && indexedTitles.all { it.third >= 0 } &&
            distinctIndices.size == indexedTitles.size
        orderSteps.put(JSONObject().put("phase", "actual_list_key_indices")
            .put("entries", JSONArray(indexedTitles.map { (title, key, index) ->
                JSONObject().put("title", title).put("key", key).put("index", index)
            })))
        if (!keyObservationComplete) {
            orderObservationProblems += "The two actual list keys did not have distinct nonnegative indices"
        } else {
            for ((position, entry) in indexedTitles.sortedBy { it.third }.withIndex()) {
                val (title, key, index) = entry
                list.performScrollToIndex(index)
                compose.waitForIdle()
                val listSnapshot = list.fetchSemanticsNode()
                val currentIndex = listSnapshot.config.getOrNull(SemanticsProperties.IndexForKey)?.invoke(key) ?: -1
                val titleNodes = compose.onAllNodesWithText(title, useUnmergedTree = true).fetchSemanticsNodes()
                val titleNode = titleNodes.singleOrNull()
                val fullTitle = titleNode?.let { node ->
                    val p = node.positionInRoot
                    ComposeRect(p.x, p.y, p.x + node.size.width, p.y + node.size.height)
                }
                val titleFullyVisible = titleNode != null && fullTitle != null &&
                    titleNode.layoutInfo.isPlaced && titleNode.layoutInfo.coordinates.isAttached &&
                    containsVisibleRect(titleNode.boundsInRoot, fullTitle) &&
                    containsVisibleRect(listSnapshot.boundsInRoot, fullTitle)
                if (currentIndex != index) orderObservationProblems += "A list key changed index before its capture"
                if (!titleFullyVisible) orderObservationProblems += "The unique full title was not visible for capture $position"
                observedOrder += title
                val observation = JSONObject().put("phase", "indexed_title_capture")
                    .put("title", title).put("key", key).put("observedIndex", index)
                    .put("indexAtCapture", currentIndex).put("titleNodeCount", titleNodes.size)
                    .put("titleFullyVisible", titleFullyVisible)
                    .put("fullTitleBoundsInRoot", fullTitle?.json() ?: JSONObject.NULL)
                    .put("clippedTitleBoundsInRoot", titleNode?.boundsInRoot?.json() ?: JSONObject.NULL)
                    .put("listBoundsInRoot", listSnapshot.boundsInRoot.json())
                    .put("observedOrder", JSONArray(observedOrder))
                orderSteps.put(observation)
                // Retain both prescribed states even when actual chronology is wrong.
                retainCapture("$language-followups-${position + 1}", observation)
            }
        }
        val orderObservationComplete = keyObservationComplete && orderObservationProblems.isEmpty() &&
            observedOrder.size == 2

        list.performScrollToNode(hasText(strings("All")))
        compose.onNodeWithText(strings("All"), substring = false).performClick()
        list.performScrollToNode(hasText(strings("Search saved opportunities")) and hasSetTextAction())
        val search = compose.onNode(hasText(strings("Search saved opportunities")) and hasSetTextAction())
        search.performClick()
        val keyboard = observeRealKeyboardWithinFiveSeconds()
        if (!keyboard.optBoolean("readyWithinFiveSeconds")) {
            retainCapture("$language-saved-keyboard-unready", JSONObject().put("keyboard", keyboard)
                .put("observedOrder", JSONArray(observedOrder)))
            fail("A real visible keyboard key was not observed within five seconds; no text input was performed")
            return
        }
        search.performTextInput("follow-up متابعة")
        retainCapture("$language-saved-search-keyboard", JSONObject().put("keyboard", keyboard)
            .put("searchBoundsInWindow", search.fetchSemanticsNode().boundsInWindow.json()))

        val targetLabel = strings("Save opportunity again")
        list.performScrollToNode(hasText(targetLabel))
        val target = compose.onAllNodes(hasText(targetLabel) and hasClickAction()).fetchSemanticsNodes().singleOrNull()
        val control = target?.boundsInWindow
        val fullControlInRoot = target?.let { node ->
            val p = node.positionInRoot
            ComposeRect(p.x, p.y, p.x + node.size.width, p.y + node.size.height)
        }
        val fullControlOnScreen = target?.let { node ->
            val p = node.positionOnScreen
            ComposeRect(p.x, p.y, p.x + node.size.width, p.y + node.size.height)
        }
        val window = windowObservation()
        val imeTop = window.getInt("decorScreenY") + window.getInt("decorHeightPx") - window.getInt("imeBottomPx")
        val listBounds = list.fetchSemanticsNode().boundsInRoot
        val parentBoundsFit = target != null && fullControlInRoot != null &&
            target.layoutInfo.isPlaced && target.layoutInfo.coordinates.isAttached &&
            containsVisibleRect(target.boundsInRoot, fullControlInRoot) &&
            containsVisibleRect(listBounds, fullControlInRoot)
        val visibleScreen = ComposeRect(0f, 0f, window.getInt("screenWidthPx").toFloat(),
            if (window.getBoolean("imeVisible")) imeTop.toFloat() else window.getInt("screenHeightPx").toFloat())
        val controlFitsVisibleArea = parentBoundsFit && fullControlOnScreen != null &&
            containsVisibleRect(visibleScreen, fullControlOnScreen)
        val controlAboveKeyboard = window.getBoolean("imeVisible") && controlFitsVisibleArea
        val state = model.state.value
        val receipt = JSONObject()
            .put("language", language)
            .put("expectedChronologicalOrder", JSONArray(listOf(overdueTitle, futureTitle)))
            .put("observedOrder", JSONArray(observedOrder))
            .put("orderSteps", orderSteps)
            .put("orderObservationComplete", orderObservationComplete)
            .put("orderObservationProblems", JSONArray(orderObservationProblems))
            .put("keyboardReadiness", keyboard)
            .put("window", window)
            .put("controlLabel", targetLabel)
            .put("controlBoundsInWindow", control?.json() ?: JSONObject.NULL)
            .put("controlAboveKeyboard", controlAboveKeyboard)
            .put("controlFitsVisibleArea", controlFitsVisibleArea)
            .put("fullControlBoundsInRoot", fullControlInRoot?.json() ?: JSONObject.NULL)
            .put("fullControlBoundsOnScreen", fullControlOnScreen?.json() ?: JSONObject.NULL)
            .put("controlClippedBoundsInRoot", target?.boundsInRoot?.json() ?: JSONObject.NULL)
            .put("parentBoundsFit", parentBoundsFit)
            .put("listBoundsInRoot", listBounds.json())
            .put("actionCoverage", "geometry only; no activation or live hit point was exercised")
            .put("actionCaptureKeyboardState", if (window.getBoolean("imeVisible")) "keyboard_open" else "keyboard_dismissed_during_scroll")
            .put("bookmarkCount", state.jobs.size)
            .put("retainedRecordOnlyCount", state.unbookmarkedRecords.size)
            .put("privateRecordCount", state.applicationRecords.size)
            .put("profileBlank", state.profile == ProfileDraft())
            .put("outboundServiceCalls", service.calls)
            .put("receiptCount", state.receipts.size)
            .put("sourceCommitClaimedByRunner", InstrumentationRegistry.getArguments().getString("career_source_sha", "not supplied"))
        retainCapture("$language-retained-action-keyboard", receipt)
        evidenceDirectory().resolve("$language-journey-receipt.json").writeText(receipt.toString(2))

        // All original evidence is retained before evaluating the desired repaired behavior.
        val failures = mutableListOf<String>()
        if (!orderObservationComplete) failures += "Follow-up order observation incomplete: ${orderObservationProblems.joinToString("; ")}"
        else if (observedOrder != listOf(overdueTitle, futureTitle)) failures += "Follow-ups did not put the overdue retained record before the future bookmark"
        if (!keyboard.optBoolean("readyWithinFiveSeconds")) failures += "A real visible keyboard key was not observed within five seconds"
        if (!controlFitsVisibleArea) failures += "The retained-record action did not fit the observed visible content area"
        if (state.jobs.size != 1 || state.unbookmarkedRecords.size != 1 || state.applicationRecords.size != 2) failures += "The two private records were not preserved"
        if (state.profile != ProfileDraft() || state.receipts.isNotEmpty() || service.calls != 0) failures += "The isolated blank-profile/no-service boundary changed"
        assertTrue(failures.joinToString("; "), failures.isEmpty())
    }

    private fun observeRealKeyboardWithinFiveSeconds(): JSONObject {
        val start = SystemClock.elapsedRealtime()
        val deadline = start + 5_000
        var last = JSONObject()
        while (SystemClock.elapsedRealtime() < deadline) {
            val window = windowObservation()
            if (SystemClock.elapsedRealtime() >= deadline) return last.put("readyWithinFiveSeconds", false).put("late", true)
            val key = visibleKeyboardKey(deadline)
            val end = SystemClock.elapsedRealtime()
            last = JSONObject().put("window", window).put("key", key ?: JSONObject.NULL)
                .put("elapsedMillis", end - start).put("late", end >= deadline)
                .put("readyWithinFiveSeconds", end < deadline && window.getBoolean("imeVisible") && key != null)
            if (last.getBoolean("readyWithinFiveSeconds") || end >= deadline) return last
            SystemClock.sleep(minOf(50, deadline - end))
        }
        return last.put("readyWithinFiveSeconds", false)
    }

    private fun visibleKeyboardKey(deadline: Long): JSONObject? {
        val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
        val windows = automation.windows
        if (SystemClock.elapsedRealtime() >= deadline) return null
        for (window in windows) {
            if (SystemClock.elapsedRealtime() >= deadline) return null
            if (window.type != AccessibilityWindowInfo.TYPE_INPUT_METHOD) continue
            val windowBounds = Rect().also(window::getBoundsInScreen)
            val root = window.root ?: continue
            val queue = java.util.ArrayDeque<AccessibilityNodeInfo>()
            queue.add(root)
            var inspected = 0
            try {
                while (queue.isNotEmpty() && inspected++ < 160 && SystemClock.elapsedRealtime() < deadline) {
                    val node = queue.removeFirst()
                    try {
                        val label = (node.contentDescription ?: node.text)?.toString()?.trim().orEmpty()
                        val bounds = Rect().also(node::getBoundsInScreen)
                        val points = label.codePoints().toArray()
                        val namedKey = label.lowercase(Locale.ROOT) in setOf("delete", "backspace", "space", "spacebar", "enter", "return", "حذف", "مسافة", "إدخال")
                        val letterKey = points.size == 1 && Character.isLetterOrDigit(points[0])
                        if (SystemClock.elapsedRealtime() >= deadline) return null
                        if (node.isVisibleToUser && node.isClickable && !node.isEditable && (namedKey || letterKey) &&
                            bounds.width() > 0 && bounds.height() > 0 && Rect.intersects(bounds, windowBounds)) {
                            return JSONObject().put("label", label).put("className", node.className?.toString())
                                .put("boundsInScreen", bounds.json()).put("imeWindowBoundsInScreen", windowBounds.json())
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

    private fun windowObservation(): JSONObject {
        var observation = JSONObject()
        compose.runOnIdle {
            val view = compose.activity.window.decorView
            val insets = ViewCompat.getRootWindowInsets(view)
            val ime = insets?.getInsets(WindowInsetsCompat.Type.ime())
            val visible = Rect().also(view::getWindowVisibleDisplayFrame)
            val screenPosition = IntArray(2).also(view::getLocationOnScreen)
            val metrics = compose.activity.resources.displayMetrics
            observation = JSONObject().put("decorWidthPx", view.width).put("decorHeightPx", view.height)
                .put("decorScreenX", screenPosition[0]).put("decorScreenY", screenPosition[1])
                .put("screenWidthPx", metrics.widthPixels).put("screenHeightPx", metrics.heightPixels)
                .put("imeVisible", insets?.isVisible(WindowInsetsCompat.Type.ime()) == true)
                .put("imeBottomPx", ime?.bottom ?: 0).put("visibleDisplayFrame", visible.json())
                .put("softInputMode", compose.activity.window.attributes.softInputMode)
                .put("fontScale", renderedFontScale).put("language", renderedLanguage)
                .put("layoutDirection", renderedDirection.toString()).put("edgeToEdgeConfigured", true)
        }
        return observation
    }

    private fun retainCapture(name: String, observation: JSONObject) {
        compose.waitForIdle()
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val directory = evidenceDirectory()
        val bitmap = checkNotNull(instrumentation.uiAutomation.takeScreenshot())
        try {
            directory.resolve("$name.png").outputStream().use { output ->
                check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output))
            }
            observation.put("screenshotWidth", bitmap.width).put("screenshotHeight", bitmap.height)
        } finally { bitmap.recycle() }
        observation.put("capturedAtUptimeMillis", SystemClock.uptimeMillis())
        directory.resolve("$name.json").writeText(observation.toString(2))
        directory.resolve("$name-semantics.txt").writeText(compose.onRoot(useUnmergedTree = true).printToString())
    }

    private fun evidenceDirectory(): File =
        File(InstrumentationRegistry.getInstrumentation().targetContext.cacheDir, "saved-baseline-evidence").apply { mkdirs() }

    private fun Rect.json() = JSONArray(listOf(left, top, right, bottom))
    private fun ComposeRect.json() = JSONArray(listOf(left, top, right, bottom))
}
