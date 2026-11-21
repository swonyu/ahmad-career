package com.saleh.careerfinder

import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import android.content.res.Configuration
import android.graphics.Bitmap
import android.os.Build
import android.os.LocaleList
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.LayoutDirection
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
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
import java.util.concurrent.atomic.AtomicInteger

/** Actual production phone UI with fixed public results and no outbound implementation. */
class DiscoveryNewSearchPhoneTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private class NoApplicationService : CareerService {
        val calls = AtomicInteger()
        override suspend fun pair(origin: String, code: String): Connection {
            calls.incrementAndGet(); error("No pairing is allowed")
        }
        override suspend fun request(connection: Connection, method: String, route: String, body: JSONObject?): JSONObject {
            calls.incrementAndGet(); error("No application API is allowed")
        }
    }
    private class DisplayContext(base: Context, private val preferences: SharedPreferences) : ContextWrapper(base) {
        override fun getSharedPreferences(name: String, mode: Int): SharedPreferences =
            if (name == "career_display_language") preferences else super.getSharedPreferences(name, mode)
        override fun getSystemService(name: String): Any? =
            if (Build.VERSION.SDK_INT >= 33 && name == Context.LOCALE_SERVICE) null else super.getSystemService(name)
    }
    private val fixture = DiscoveryHistoryFixture
    private val store = DiscoveryHistoryMemoryStore()
    private val discovery = DiscoveryHistoryService()
    private val application = NoApplicationService()
    private var owner = ViewModelStore()
    private lateinit var model: CareerViewModel
    private lateinit var preferences: SharedPreferences
    private lateinit var displayContext: Context
    private lateinit var strings: CareerStrings
    private var renderedLanguage: String? = null
    private var renderedDirection: LayoutDirection? = null
    private var renderedScale = 0f
    private lateinit var windows: PhoneWindowObservation
    private val phase = InstrumentationRegistry.getArguments().getString("career_feature1_phase", "after")
        .also { require(it == "before" || it == "after") }

    @Before fun prepareOnlyOwnedSyntheticState() {
        windows = PhoneWindowObservation()
        compose.activityRule.scenario.onActivity { activity ->
            activity.enableEdgeToEdge()
            activity.window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
            preferences = activity.getSharedPreferences("new-search-" + UUID.randomUUID(), Context.MODE_PRIVATE)
            displayContext = DisplayContext(activity, preferences)
            model = CareerViewModel(activity.application, store, application, discoveryService = discovery)
            owner.put("new-search", model)
        }
    }
    @After fun releaseOnlyOwnedState() {
        if (::preferences.isInitialized) compose.runOnIdle { owner.clear(); check(preferences.edit().clear().commit()) }
        if (::windows.isInitialized) windows.close()
    }
    private fun mount(language: String) {
        check(preferences.edit().putString("selection", language).commit())
        val configuration = Configuration(displayContext.resources.configuration).apply {
            setLocales(LocaleList(Locale.forLanguageTag(language)))
        }
        strings = CareerStrings(displayContext.createConfigurationContext(configuration))
        compose.activityRule.scenario.onActivity { activity ->
            activity.setContent {
                CompositionLocalProvider(LocalContext provides displayContext) {
                    CareerLanguage {
                        val current = rememberCareerStrings()
                        val direction = LocalLayoutDirection.current
                        val scale = LocalConfiguration.current.fontScale
                        SideEffect { renderedLanguage = current.locale.language; renderedDirection = direction; renderedScale = scale }
                        CareerTheme { CareerApp(model) }
                    }
                }
            }
        }
        compose.waitUntil(5_000) { model.state.value.loaded && !model.state.value.busy &&
            !model.discovery.state.value.restoringSearch && renderedLanguage == language }
        assertEquals(if (language == "ar") LayoutDirection.Rtl else LayoutDirection.Ltr, renderedDirection)
        assertTrue("Keep at least 180% text", renderedScale >= 1.79f)
        assertEquals(ProfileDraft(), model.state.value.profile); assertNull(model.state.value.connection)
    }
    private fun list() = compose.onNodeWithTag("discovery-list")
    private fun title(letter: String) = fixture.page(letter).jobs.single().title
    private fun titleMatcher(letter: String) = hasText(title(letter))
    private fun fullyReveal(matcher: SemanticsMatcher): SemanticsNodeInteraction {
        list().performScrollToNode(matcher)
        return compose.onNode(matcher).also { assertFullyVisible(it) }
    }
    private fun searchFromVisibleAction(expectedRequestCount: Int) {
        val action = hasText(strings("Search jobs")) and hasClickAction()
        fullyReveal(action).performClick()
        compose.waitUntil(5_000) { discovery.requests.size == expectedRequestCount && !model.discovery.state.value.loading }
        assertNull(model.discovery.state.value.error)
    }
    private fun snapshot(): JSONObject {
        lateinit var result: JSONObject
        compose.runOnIdle { result = model.discovery.exportSnapshot() }
        return result
    }
    private fun mappedIndex(letter: String): Int {
        val node = list().fetchSemanticsNode()
        assertTrue("Observe the actual lazy-list key map", node.config.contains(SemanticsProperties.IndexForKey))
        return node.config[SemanticsProperties.IndexForKey].invoke(fixture.id(letter))
    }
    private fun capture(language: String, name: String, matcher: SemanticsMatcher) {
        list().performScrollToNode(matcher)
        compose.waitForIdle()
        val node = compose.onNode(matcher).fetchSemanticsNode()
        val position = node.positionInRoot
        val full = Rect(position.x, position.y, position.x + node.size.width, position.y + node.size.height)
        val viewport = list().fetchSemanticsNode().boundsInRoot
        val fits = node.layoutInfo.isPlaced && node.layoutInfo.coordinates.isAttached &&
            containsVisibleRect(node.boundsInRoot, full) && containsVisibleRect(viewport, full)
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        instrumentation.uiAutomation.waitForIdle(250, 2_000)
        val bitmap = checkNotNull(instrumentation.uiAutomation.takeScreenshot())
        val directory = File(instrumentation.targetContext.cacheDir, "discovery-new-search-evidence").apply { mkdirs() }
        val prefix = "$language-$phase-$name"
        val evidence = JSONObject().put("phase", phase).put("language", language).put("fontScale", renderedScale)
            .put("layoutDirection", renderedDirection.toString()).put("fullTargetBounds", full.json())
            .put("clippedTargetBounds", node.boundsInRoot.json()).put("listBounds", viewport.json())
            .put("wholeTargetVisible", fits).put("imeVisible", windows.imeVisible())
            .put("requestCount", discovery.requests.size).put("applicationServiceCalls", application.calls.get())
            .put("profileBlank", model.state.value.profile == ProfileDraft()).put("receiptCount", model.state.value.receipts.size)
            .put("planPresent", model.state.value.plan != null).put("snapshot", snapshot())
            .put("sourceCommitClaimedByRunner", InstrumentationRegistry.getArguments().getString("career_source_sha", "not supplied"))
            .put("screenshotWidth", bitmap.width).put("screenshotHeight", bitmap.height)
        try { File(directory, "$prefix.png").outputStream().use { check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)) } }
        finally { bitmap.recycle() }
        File(directory, "$prefix.json").writeText(evidence.toString(2))
        File(directory, "$prefix-semantics.txt").writeText(compose.onRoot(useUnmergedTree = true).printToString(Int.MAX_VALUE))
        assertTrue("The whole screenshot target must fit its visible list", fits)
        assertFalse("Search-result captures must not be obscured by an IME", evidence.getBoolean("imeVisible"))
    }
    private fun Rect.json() = JSONArray(listOf(left, top, right, bottom))

    @Test fun englishReturningSearch_keepsCountsAndFiltersOnlyNewResults() = exercise("en")
    @Test fun arabicReturningSearch_keepsCountsAndFiltersOnlyNewResults() = exercise("ar")

    private fun exercise(language: String) {
        mount(language)
        compose.runOnIdle { model.discovery.editFilters { fixture.filters } }
        searchFromVisibleAction(1)
        compose.onNodeWithTag("discovery.newCount").assertDoesNotExist()
        capture(language, "first-search-a", titleMatcher("A"))

        discovery.result = fixture.page("B", "C")
        searchFromVisibleAction(2)
        assertEquals(listOf(fixture.id("B"), fixture.id("C")), model.discovery.state.value.jobs.map { it.id })
        capture(language, "repeat-search-b", titleMatcher("B"))
        capture(language, "repeat-search-c", titleMatcher("C"))
        if (phase == "before") {
            // The old APK is a source-bound before capture, never feature acceptance.
            compose.onNodeWithTag("discovery.newCount").assertDoesNotExist()
            capture(language, "repeat-count", hasText(strings.format("Showing {0} of {1} matches within these boards", listOf("2", "2"))))
            assertTrue(snapshot().optJSONObject("newResult") == null)
            assertEquals(2, discovery.requests.size); assertEquals(0, application.calls.get())
            return
        }

        val newCount = hasTestTag("discovery.newCount")
        val toggle = hasText(strings("New only")) and hasClickAction()
        capture(language, "repeat-count", newCount)
        compose.onNode(newCount).assertTextEquals(strings.format("{0} role new to this search", listOf("1")))
        val all = snapshot()
        assertEquals(listOf(fixture.id("C")), all.getJSONObject("newResult").requiredStrings("newIds"))

        fullyReveal(toggle).performClick()
        compose.onNode(toggle).assertIsOn()
        assertEquals(-1, mappedIndex("B")); assertTrue(mappedIndex("C") >= 0)
        capture(language, "new-only-c", titleMatcher("C"))
        assertEquals(all.toString(), snapshot().toString())
        assertEquals(2, discovery.requests.size)
        fullyReveal(toggle).performClick()
        compose.onNode(toggle).assertIsOff()
        assertTrue(mappedIndex("B") >= 0); assertTrue(mappedIndex("C") >= 0)
        capture(language, "all-results-b", titleMatcher("B"))
        assertEquals(all.toString(), snapshot().toString()); assertEquals(2, discovery.requests.size)

        // Recreate the actual model/view using the same isolated private store.
        // This proves persisted model restoration, not a physical process restart.
        runBlocking { withContext(Dispatchers.Main) {
            model.discovery.saveSearchNow()
            model.discovery.stopPrivateSession(flush = true)
        } }
        compose.runOnIdle { owner.clear(); owner = ViewModelStore() }
        compose.activityRule.scenario.onActivity { activity ->
            model = CareerViewModel(activity.application, store, application, discoveryService = discovery)
            owner.put("new-search-restored", model)
        }
        mount(language)
        assertEquals(2, discovery.requests.size)
        capture(language, "restored-count", newCount)
        compose.onNode(newCount).assertTextEquals(strings.format("{0} role new to this search", listOf("1")))
        assertEquals(listOf(fixture.id("C")), snapshot().getJSONObject("newResult").requiredStrings("newIds"))

        discovery.result = fixture.page("C", "B")
        searchFromVisibleAction(3)
        fullyReveal(newCount).assertTextEquals(strings.format("{0} roles new to this search", listOf("0")))
        fullyReveal(toggle).performClick()
        assertEquals(-1, mappedIndex("B")); assertEquals(-1, mappedIndex("C"))
        capture(language, "reordered-zero", hasText(strings("No openings are new in the results compared.")))
        assertEquals(2, model.discovery.state.value.jobs.size)
        assertTrue(snapshot().getJSONObject("newResult").requiredStrings("newIds").isEmpty())
        assertEquals(3, discovery.requests.size); assertEquals(0, application.calls.get())
        assertEquals(ProfileDraft(), model.state.value.profile)
        assertTrue(model.state.value.jobs.isEmpty() && model.state.value.receipts.isEmpty())
        assertNull(model.state.value.plan)
    }
}
