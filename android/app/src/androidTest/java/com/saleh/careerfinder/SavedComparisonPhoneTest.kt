package com.saleh.careerfinder

import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Rect as AndroidRect
import android.os.Build
import android.os.LocaleList
import android.os.SystemClock
import android.view.KeyEvent
import android.view.WindowManager
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.LayoutDirection
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.awaitCancellation
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import java.io.File
import java.io.FileOutputStream
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

/** Default candidate acceptance; an explicit before phase is a separate old-APK diagnostic. */
class SavedComparisonPhoneTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private class MemoryStore : PrivateStore {
        val values = ConcurrentHashMap<String, String>()
        override fun read(name: String) = values[name]?.let(::JSONObject)
        override fun write(name: String, value: JSONObject) { values[name] = value.toString() }
        override fun remove(name: String) { values.remove(name) }
        override fun startFreshPreservingExisting() { error("No storage reset in comparison fixtures") }
    }
    private class DisplayContext(base: Context, private val preferences: SharedPreferences) : ContextWrapper(base) {
        override fun getSharedPreferences(name: String, mode: Int): SharedPreferences =
            if (name == "career_display_language") preferences else super.getSharedPreferences(name, mode)
        override fun getSystemService(name: String): Any? =
            if (Build.VERSION.SDK_INT >= 33 && name == Context.LOCALE_SERVICE) null else super.getSystemService(name)
    }
    private val connection = Connection("https://comparison-phone.example.invalid", "comparison-phone-fixture",
        "synthetic-no-authority", "2099-12-31T00:00:00Z")
    private val title = "Research specialist · اختصاصي أبحاث"
    private val employer = "Example Research · جهة تجريبية"
    private fun job(id: String, city: String, local: Boolean, observed: Boolean): JSONObject =
        JSONObject().put("id", id).put("url", "https://example.invalid/openings?city=" + city.lowercase(Locale.ROOT))
            .put("title", title).put("company", employer).put("location", city).put("country", "SA").put("localOnly", local)
            .apply { if (observed) { put("sourceName", "Example Careers · المصدر التجريبي"); put("checkedAt", "2026-11-20T12:00:00Z") } }
    // Existing decoder entry point keeps the before branch independent of new constructor signatures.
    private val riyadhJson = job("comparison-riyadh", "Riyadh", false, true)
    private val jeddahJson = job("comparison-jeddah", "Jeddah", true, false)
    private val retainedJson = job("comparison-retained", "Dammam", true, false)
        .put("title", "Research advisor · مستشار أبحاث")
    private val riyadh get() = Opportunity.fromJson(riyadhJson)
    private val jeddah get() = Opportunity.fromJson(jeddahJson)
    private val retained get() = Opportunity.fromJson(retainedJson)
    private val phase = InstrumentationRegistry.getArguments().getString("career_feature3_phase", "after")
        .also { require(it == "before" || it == "after") }
    private val fieldDiagnostics = InstrumentationRegistry.getArguments()
        .getString("career_feature3_field_diagnostics", "false").let {
            require(it == "false" || it == "true")
            it == "true"
        }
    private val expectedTheme = InstrumentationRegistry.getArguments()
        .getString("career_feature3_expected_theme", "observe").also { require(it in setOf("observe", "dark", "light")) }
    private val store = MemoryStore()
    private val owner = ViewModelStore()
    private lateinit var model: CareerViewModel
    private lateinit var preferences: SharedPreferences
    private lateinit var displayContext: Context
    private lateinit var strings: CareerStrings
    private lateinit var windows: PhoneWindowObservation
    private var renderedLanguage: String? = null
    private var renderedDirection: LayoutDirection? = null
    private var renderedScale = 0f
    private var renderedNightMode = 0
    private var renderedAppearance: String? = null
    private var renderedBackgroundArgb = 0
    private var renderedBackgroundIsDark = false
    private var lastKeyObservation: JSONObject? = null
    private var savedPose: JSONObject? = null
    private val calls = CopyOnWriteArrayList<String>()
    private val service = object : CareerService {
        override suspend fun pair(origin: String, code: String): Connection = error("No pairing in comparison fixtures")
        override suspend fun request(connection: Connection, method: String, route: String, body: JSONObject?): JSONObject {
            require(connection == this@SavedComparisonPhoneTest.connection && method == "GET" && route == "workspace" && body == null)
            calls += "GET workspace"
            val profile = ProfileDraft(firstName = "Synthetic", email = "comparison@example.invalid",
                revision = 2, resume = Resume("CV-B.pdf", 20, "b".repeat(64)))
            return JSONObject().put("ok", true).put("mode", "test").put("workspaceId", connection.workspaceId)
                .put("profile", profile.apiJson(includeLinkedIn = true).put("resume", profile.resume!!.metadata()).put("revision", 2))
                .put("jobs", JSONArray(listOf(riyadh.inputJson().put("id", riyadh.id))))
                .put("attempts", JSONArray()).put("activePlanIds", JSONArray()).put("recoverablePlans", JSONArray())
                .put("capabilities", JSONObject().put("liveEnabled", false).put("linkedinProfile", true))
        }
    }

    @Before fun prepareOnlySyntheticOwnedState() {
        windows = PhoneWindowObservation()
        val records = listOf(
            ApplicationRecordBundle.create(riyadh, ApplicationRecord(ApplicationStage.INTERVIEW,
                followUpDate = "2026-12-08", appliedElsewhere = true, manualResumeName = "CV-A.pdf")),
            ApplicationRecordBundle.create(jeddah, ApplicationRecord(ApplicationStage.SAVED,
                followUpDate = "2026-12-10", manualResumeName = "CV-A.pdf")),
            ApplicationRecordBundle.create(retained, ApplicationRecord(ApplicationStage.CLOSED,
                followUpDate = "2026-12-12", appliedElsewhere = true, manualResumeName = "CV-A.pdf")))
        val seed = JSONObject().put("schema", 1).put("jobs", JSONArray(listOf(riyadhJson, jeddahJson)))
            .put("selected", JSONArray(listOf(riyadh.id))).put("applicationRecords", ApplicationRecordsCodec.encode(records.associateBy { it.identity }))
        store.write("connection", connection.toJson())
        store.write("workspace-" + BoundaryPolicy.workspaceKey(connection.origin, connection.workspaceId), seed)
        store.write("workspace-unpaired", JSONObject().put("schema", 1))
        compose.activityRule.scenario.onActivity { activity ->
            activity.enableEdgeToEdge()
            activity.window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
            preferences = activity.getSharedPreferences("saved-comparison-" + UUID.randomUUID(), Context.MODE_PRIVATE)
            displayContext = DisplayContext(activity, preferences)
            val discovery = object : DiscoveryService {
                override suspend fun sources() = DiscoveryCatalog(emptyList(), emptyList(), 4, "Synthetic comparison")
                override suspend fun search(filters: DiscoveryFilters, cursor: String?): DiscoveryPage = error("No discovery network")
            }
            model = CareerViewModel(activity.application, store, service, discoveryService = discovery, waitForPoll = { awaitCancellation() })
            owner.put("saved-comparison", model)
        }
    }

    @After fun releaseOnlyOwnedFixtureState() {
        compose.runOnIdle { owner.clear(); if (::preferences.isInitialized) check(preferences.edit().clear().commit()) }
        if (::windows.isInitialized) windows.close()
    }

    private fun mount(language: String) {
        check(preferences.edit().putString("selection", language).commit())
        val config = Configuration(displayContext.resources.configuration).apply { setLocales(LocaleList(Locale.forLanguageTag(language))) }
        strings = CareerStrings(displayContext.createConfigurationContext(config))
        compose.activityRule.scenario.onActivity { activity ->
            activity.setContent {
                CompositionLocalProvider(LocalContext provides displayContext) {
                    CareerLanguage {
                        val current = rememberCareerStrings()
                        val direction = LocalLayoutDirection.current
                        val scale = LocalConfiguration.current.fontScale
                        CareerTheme {
                            val nightMode = LocalConfiguration.current.uiMode and Configuration.UI_MODE_NIGHT_MASK
                            val appearance = LocalAppearance.current.preference.value
                            val background = MaterialTheme.colorScheme.background
                            SideEffect {
                                renderedLanguage = current.locale.language; renderedDirection = direction; renderedScale = scale
                                renderedNightMode = nightMode; renderedAppearance = appearance
                                renderedBackgroundArgb = background.toArgb(); renderedBackgroundIsDark = background.luminance() < 0.5f
                            }
                            CareerApp(model)
                        }
                    }
                }
            }
        }
        compose.waitUntil(5_000) { model.state.value.loaded && !model.state.value.busy && renderedLanguage == language }
        assertNull(model.state.value.error)
        assertEquals(if (language == "ar") LayoutDirection.Rtl else LayoutDirection.Ltr, renderedDirection)
        assertTrue("Retain at least180% text", renderedScale >= 1.79f)
        println("Saved comparison appearance: expected=$expectedTheme; preference=$renderedAppearance; uiMode=$renderedNightMode; backgroundARGB=$renderedBackgroundArgb; backgroundIsDark=$renderedBackgroundIsDark")
        if (expectedTheme != "observe") {
            val expectedNightMode = if (expectedTheme == "dark") Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO
            assertEquals("The actual composition must receive the requested night configuration", expectedNightMode, renderedNightMode)
            assertEquals("This fresh fixture must follow the system appearance without a stored override", "system", renderedAppearance)
            assertEquals("The actual CareerTheme background must match the requested appearance before any journey interaction", expectedTheme == "dark", renderedBackgroundIsDark)
        }
        assertEquals(listOf("GET workspace"), calls.toList())
    }

    private fun reveal(list: String, matcher: SemanticsMatcher): SemanticsNodeInteraction {
        compose.onNodeWithTag(list).performScrollToNode(matcher)
        val nodes = compose.onAllNodes(matcher).fetchSemanticsNodes()
        assertEquals("One exact target is required", 1, nodes.size)
        return compose.onNode(matcher).also { assertFullyVisible(it) }
    }
    private fun click(list: String, matcher: SemanticsMatcher) = reveal(list, matcher).performClick()
    private fun fixedClick(tag: String) = compose.onNodeWithTag(tag).also { assertFullyVisible(it) }.performClick()
    private fun choose(job: Opportunity, recordOnly: Boolean = false) =
        click("jobs-list", hasTestTag("saved-compare-toggle-" + if (recordOnly) "record-" + BoundaryPolicy.jobIdentity(job.url) else job.id))
    private fun showComparison() {
        compose.onNodeWithTag("saved-comparison-count").assertTextEquals(strings.format("{0} of 2 selected", listOf("2")))
        fixedClick("saved-comparison-open")
        compose.onNodeWithTag("saved-comparison-list").assertIsDisplayed()
    }
    private fun back() = click("saved-comparison-list", hasTestTag("saved-comparison-back"))
    private fun pose(matcher: SemanticsMatcher): JSONObject {
        val node = compose.onNode(matcher).fetchSemanticsNode()
        val list = compose.onNodeWithTag("jobs-list").fetchSemanticsNode()
        val range = list.config[SemanticsProperties.VerticalScrollAxisRange]
        val p = node.positionInRoot
        return JSONObject().put("scrollValue", range.value()).put("fullTargetBounds",
            Rect(p.x, p.y, p.x + node.size.width, p.y + node.size.height).json()).put("listBounds", list.boundsInRoot.json())
    }

    @Test fun englishSavedComparison_keepsDistinctOpeningsAndPrivateScope() = exercise("en")
    @Test fun arabicSavedComparison_keepsDistinctOpeningsAndPrivateScope() = exercise("ar")

    private fun exercise(language: String) {
        mount(language)
        compose.onNodeWithTag("navigation-jobs").revealNavigationTab().performClick()
        fixedClick("jobs-saved-tab")
        compose.onNodeWithTag("jobs-saved-tab").assertIsSelected()
        compose.onNodeWithTag("jobs-list").assertIsDisplayed()
        val search = hasText(strings("Search saved opportunities")) and hasSetTextAction()
        val field = reveal("jobs-list", search)
        field.performClick()
        lastKeyObservation = observeRealKeyboardWithinFiveSeconds()
        if (lastKeyObservation?.optBoolean("readyWithinFiveSeconds") != true) {
            retain(language, "keyboard-not-ready", JSONObject().put("keyboard", lastKeyObservation))
            fail("A real keyboard key must be observed within five seconds before Saved search input")
            return
        }
        field.assertIsFocused()
        try {
            assertFullyVisible(field)
        } catch (original: Throwable) {
            if (fieldDiagnostics) {
                try {
                    retain(language, "field-visibility-failure",
                        fieldDiagnostic().put("failureClass", original.javaClass.name))
                } catch (captureFailure: Throwable) {
                    original.addSuppressed(captureFailure)
                }
            }
            throw original
        }
        if (fieldDiagnostics) retain(language, "field-after-visibility-assert", fieldDiagnostic())
        field.performTextInput("Research")
        assertTrue(windows.imeVisible())
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
        compose.waitUntil(5_000) { !windows.imeVisible() }
        click("jobs-list", hasText(strings("Follow-ups")) and hasClickAction())
        compose.onNode(hasText(strings("Follow-ups")) and hasClickAction()).assertIsSelected()
        capture(language, "shortlist-riyadh", "jobs-list", hasText("Riyadh · SA"))
        capture(language, "shortlist-jeddah", "jobs-list", hasText("Jeddah · SA"))
        assertEquals(setOf(riyadh.id), model.state.value.selected)
        assertEquals("CV-B.pdf", model.state.value.profile.resume!!.name)
        assertTrue(model.state.value.applicationRecords.values.all { it.current.record.manualResumeName == "CV-A.pdf" })
        if (phase == "before") {
            compose.onNodeWithTag("saved-comparison-start").assertDoesNotExist()
            assertEquals(listOf("GET workspace"), calls.toList())
            return
        }

        val beforeReadOnly = WorkspaceStorage.encode(model.state.value).toString()
        click("jobs-list", hasTestTag("saved-comparison-start"))
        choose(riyadh); choose(jeddah)
        val returnTarget = hasTestTag("saved-compare-toggle-" + jeddah.id)
        savedPose = pose(returnTarget)
        showComparison()
        for ((index, city) in listOf("Riyadh", "Jeddah").withIndex()) {
            capture(language, "compare-" + city.lowercase(Locale.ROOT) + "-location", "saved-comparison-list",
                hasTestTag("saved-comparison-location-" + index))
            compose.onNodeWithTag("saved-comparison-location-" + index).assertTextEquals(city + " · SA")
            capture(language, "compare-" + city.lowercase(Locale.ROOT) + "-source", "saved-comparison-list",
                hasTestTag("saved-comparison-source-" + index))
            compose.onNodeWithTag("saved-comparison-source-" + index).assertTextEquals(
                if (index == 0) "Example Careers · المصدر التجريبي" else strings("Not recorded"))
            reveal("saved-comparison-list", hasTestTag("saved-comparison-checked-" + index)).assertTextEquals(
                if (index == 0) strings.dateTime("2026-11-20T12:00:00Z") else strings("Not recorded"))
            reveal("saved-comparison-list", hasTestTag("saved-comparison-stage-" + index)).assertTextEquals(
                strings(if (index == 0) "Interview" else "Saved for later"))
            reveal("saved-comparison-list", hasTestTag("saved-comparison-follow-up-" + index)).assertTextEquals(
                strings.civilDate(if (index == 0) "2026-12-08" else "2026-12-10"))
            capture(language, "compare-" + city.lowercase(Locale.ROOT) + "-link", "saved-comparison-list",
                hasTestTag("saved-comparison-link-" + index))
            reveal("saved-comparison-list", hasTestTag("saved-comparison-url-" + index)).assertTextEquals(if (index == 0) riyadh.url else jeddah.url)
        }
        back()
        val returned = pose(returnTarget)
        assertEquals(savedPose!!.getDouble("scrollValue"), returned.getDouble("scrollValue"), 1.0)
        val previousBounds = savedPose!!.getJSONArray("fullTargetBounds")
        val currentBounds = returned.getJSONArray("fullTargetBounds")
        repeat(4) { assertEquals(previousBounds.getDouble(it), currentBounds.getDouble(it), 1.0) }
        capture(language, "back-shortlist", "jobs-list", returnTarget, revealFirst = false)
        reveal("jobs-list", search).assertTextContains("Research")
        reveal("jobs-list", hasText(strings("Follow-ups")) and hasClickAction()).assertIsSelected()
        assertEquals(beforeReadOnly, WorkspaceStorage.encode(model.state.value).toString())
        assertEquals(listOf("GET workspace"), calls.toList())

        click("jobs-list", hasText(strings("All")) and hasClickAction())
        fixedClick("saved-comparison-clear")
        choose(riyadh); choose(retained, true); showComparison()
        reveal("saved-comparison-list", hasTestTag("saved-comparison-stage-1")).assertTextEquals(strings("Closed"))
        capture(language, "retained-record", "saved-comparison-list", hasText(strings("Application record · bookmark removed")))
        back()
        fixedClick("saved-comparison-clear")
        choose(riyadh); choose(jeddah); showComparison()
        compose.runOnIdle { model.removeLocalOpportunity(jeddah.id) }
        compose.waitUntil(5_000) { !model.state.value.busy && model.state.value.jobs.none { it.id == jeddah.id } }
        assertNull(model.state.value.error)
        capture(language, "stale-selection", "saved-comparison-list", hasTestTag("saved-comparison-unavailable"))
        compose.onNodeWithTag("saved-comparison-card-0").assertDoesNotExist()
        compose.runOnIdle { model.removeConnectionLocally(connection) }
        compose.waitUntil(5_000) { !model.state.value.busy && model.state.value.connection == null }
        compose.onNodeWithTag("saved-comparison-list").assertDoesNotExist()
        compose.onNodeWithTag("saved-comparison-toolbar").assertDoesNotExist()
        compose.onNodeWithTag("navigation-jobs").revealNavigationTab().performClick()
        capture(language, "scope-cleared", "jobs-list", hasText(strings("No saved jobs yet")))
        assertTrue(model.state.value.jobs.isEmpty()); assertTrue(model.state.value.applicationRecords.isEmpty())
        assertTrue(model.state.value.selected.isEmpty()); assertNull(model.state.value.profile.resume)
        assertEquals(listOf("GET workspace"), calls.toList())
    }

    /** Passive diagnostics only: no scrolling, focus request, input, retries or changed guard. */
    private fun fieldDiagnostic(): JSONObject {
        val started = SystemClock.elapsedRealtimeNanos()
        val result = JSONObject().put("diagnosticOnly", true)
            .put("observationStartedElapsedNanos", started)
            .put("timingLimit", "Capture occurs only after the unchanged full-field guard passes or throws. The real-key deadline and visibility guard run first; geometry and pixels are sequential observations.")
        val fields = if (::strings.isInitialized) compose.onAllNodes(
            hasText(strings("Search saved opportunities")) and hasSetTextAction()).fetchSemanticsNodes()
        else emptyList()
        fun nodeGeometry(node: androidx.compose.ui.semantics.SemanticsNode): JSONObject {
            val root = node.positionInRoot
            val screen = node.positionOnScreen
            val fullRoot = Rect(root.x, root.y, root.x + node.size.width, root.y + node.size.height)
            val fullScreen = Rect(screen.x, screen.y, screen.x + node.size.width, screen.y + node.size.height)
            val bounds = node.boundsInRoot
            return JSONObject().put("semanticsId", node.id)
                .put("fullBoundsInRoot", fullRoot.json()).put("clippedBoundsInRoot", bounds.json())
                .put("fullBoundsOnScreen", fullScreen.json()).put("clippedBoundsInWindow", node.boundsInWindow.json())
                .put("placed", node.layoutInfo.isPlaced).put("attached", node.layoutInfo.coordinates.isAttached)
                .put("fullInsideClippedBounds", containsVisibleRect(bounds, fullRoot))
                .put("focused", node.config.contains(SemanticsProperties.Focused) && node.config[SemanticsProperties.Focused])
                .put("enabled", !node.config.contains(SemanticsProperties.Disabled))
        }
        result.put("fieldCount", fields.size).put("fields", JSONArray(fields.map(::nodeGeometry)))
        val lists = compose.onAllNodes(hasTestTag("jobs-list")).fetchSemanticsNodes()
        result.put("listCount", lists.size).put("lists", JSONArray(lists.map(::nodeGeometry)))
        var window = JSONObject()
        compose.runOnIdle {
            val decor = compose.activity.window.decorView
            val insets = ViewCompat.getRootWindowInsets(decor)
            val ime = insets?.getInsets(WindowInsetsCompat.Type.ime())
            val bars = insets?.getInsets(WindowInsetsCompat.Type.systemBars())
            val position = IntArray(2).also(decor::getLocationOnScreen)
            val visible = AndroidRect().also(decor::getWindowVisibleDisplayFrame)
            val metrics = compose.activity.resources.displayMetrics
            window = JSONObject().put("decorWidthPx", decor.width).put("decorHeightPx", decor.height)
                .put("decorScreenX", position[0]).put("decorScreenY", position[1])
                .put("screenWidthPx", metrics.widthPixels).put("screenHeightPx", metrics.heightPixels)
                .put("imeInsetsAvailable", ime != null)
                .put("imeVisible", insets?.isVisible(WindowInsetsCompat.Type.ime()) == true)
                .put("imeInsets", if (ime == null) JSONObject.NULL else JSONArray(listOf(ime.left, ime.top, ime.right, ime.bottom)))
                .put("systemBarInsets", if (bars == null) JSONObject.NULL else JSONArray(listOf(bars.left, bars.top, bars.right, bars.bottom)))
                .put("visibleDisplayFrame", JSONArray(listOf(visible.left, visible.top, visible.right, visible.bottom)))
                .put("softInputMode", compose.activity.window.attributes.softInputMode)
        }
        val accessibilityWindows = InstrumentationRegistry.getInstrumentation().uiAutomation.windows
        result.put("window", window).put("accessibilityWindows", JSONArray(accessibilityWindows.map { item ->
            val bounds = AndroidRect().also(item::getBoundsInScreen)
            JSONObject().put("id", item.id).put("type", item.type).put("active", item.isActive).put("focused", item.isFocused)
                .put("boundsInScreen", JSONArray(listOf(bounds.left, bounds.top, bounds.right, bounds.bottom)))
        }))
        return result.put("observationFinishedElapsedNanos", SystemClock.elapsedRealtimeNanos())
    }

    private fun capture(language: String, name: String, listTag: String, matcher: SemanticsMatcher, revealFirst: Boolean = true) {
        if (revealFirst) compose.onNodeWithTag(listTag).performScrollToNode(matcher)
        compose.waitForIdle()
        val nodes = compose.onAllNodes(matcher).fetchSemanticsNodes()
        val node = nodes.singleOrNull()
        val full = node?.let { val p = it.positionInRoot; Rect(p.x, p.y, p.x + it.size.width, p.y + it.size.height) }
        val viewport = compose.onNodeWithTag(listTag).fetchSemanticsNode().boundsInRoot
        val fits = node != null && full != null && node.layoutInfo.isPlaced && node.layoutInfo.coordinates.isAttached &&
            containsVisibleRect(node.boundsInRoot, full) && containsVisibleRect(viewport, full)
        val evidence = JSONObject().put("targetCount", nodes.size).put("fullTargetBounds", full?.json() ?: JSONObject.NULL)
            .put("clippedTargetBounds", node?.boundsInRoot?.json() ?: JSONObject.NULL).put("listBounds", viewport.json())
            .put("wholeTargetVisible", fits).put("imeVisible", windows.imeVisible()).put("savedPoseBeforeComparison", savedPose ?: JSONObject.NULL)
        retain(language, name, evidence)
        assertTrue("The complete named target must fit the actual clipped list viewport", fits)
        assertFullyVisible(compose.onNode(matcher))
        assertFalse("Non-keyboard evidence must not be obscured by an IME", evidence.getBoolean("imeVisible"))
    }

    private fun retain(language: String, name: String, evidence: JSONObject) {
        compose.waitForIdle()
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val bitmap = checkNotNull(instrumentation.uiAutomation.takeScreenshot())
        val directory = File(instrumentation.targetContext.cacheDir, "saved-comparison-evidence").apply { mkdirs() }
        val prefix = language + "-" + phase + "-" + name
        check(listOf(".png", ".json", "-semantics.txt").none { File(directory, prefix + it).exists() }) { "Never overwrite earlier originals" }
        val current = model.state.value
        evidence.put("phase", phase).put("language", language).put("fontScale", renderedScale).put("layoutDirection", renderedDirection.toString())
            .put("appearanceObservation", JSONObject().put("expected", expectedTheme)
                .put("configurationNightMode", renderedNightMode).put("preference", renderedAppearance ?: JSONObject.NULL)
                .put("backgroundARGB", String.format(Locale.ROOT, "%08x", renderedBackgroundArgb))
                .put("backgroundIsDark", renderedBackgroundIsDark))
            .put("serviceCalls", JSONArray(calls.toList())).put("outboundNetworkImplementation", false)
            .put("selectedForApply", JSONArray(current.selected.toList().sorted())).put("keyboard", lastKeyObservation ?: JSONObject.NULL)
            .put("currentProfileFilename", current.profile.resume?.name ?: JSONObject.NULL)
            .put("jobs", JSONArray(current.jobs.map(Opportunity::privateJson)))
            .put("records", ApplicationRecordsCodec.encode(current.applicationRecords))
            .put("scope", if (current.connection == null) "synthetic-unpaired" else "synthetic-connected")
            .put("sourceCommitClaimedByRunner", InstrumentationRegistry.getArguments().getString("career_source_sha", "not supplied"))
            .put("screenshotWidth", bitmap.width).put("screenshotHeight", bitmap.height)
            .put("evidenceScope", "Actual CareerApp in ComponentActivity with production edge-to-edge/adjustResize; isolated synthetic memory store; no process restart or provider action")
        try {
            FileOutputStream(File(directory, prefix + ".png")).use { output ->
                check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)); output.fd.sync()
            }
        } finally { bitmap.recycle() }
        durableText(File(directory, prefix + ".json"), evidence.toString(2))
        val roots = compose.onAllNodes(isRoot(), useUnmergedTree = true)
        val count = roots.fetchSemanticsNodes().size
        check(count > 0)
        durableText(File(directory, prefix + "-semantics.txt"), (0 until count).joinToString("\n\n") { index ->
            "ROOT " + index + "\n" + roots[index].printToString(Int.MAX_VALUE)
        })
    }
    private fun durableText(file: File, text: String) {
        check(!file.exists()) { "Never overwrite an earlier capture" }
        FileOutputStream(file).use { output -> output.write(text.toByteArray(Charsets.UTF_8)); output.fd.sync() }
    }
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
    private fun Rect.json() = JSONArray(listOf(left, top, right, bottom))
}
