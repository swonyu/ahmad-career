package com.saleh.careerfinder

import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
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
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

/** Native navigation and local-only records under the production theme; all services are synthetic. */
class NavigationPhoneAcceptanceTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private class MemoryStore : PrivateStore {
        val records = ConcurrentHashMap<String, String>()
        override fun read(name: String) = records[name]?.let(::JSONObject)
        override fun write(name: String, value: JSONObject) { records[name] = value.toString() }
        override fun remove(name: String) { records.remove(name) }
        override fun startFreshPreservingExisting() { error("Not part of this fixture") }
    }
    private class Service : CareerService {
        val pairs = CopyOnWriteArrayList<Pair<String, String>>()
        val routes = CopyOnWriteArrayList<String>()
        override suspend fun pair(origin: String, code: String): Connection {
            pairs += origin to code
            return Connection(origin, "navigation-fixture", "synthetic-token", Instant.now().plusSeconds(3600).toString())
        }
        override suspend fun request(connection: Connection, method: String, route: String, body: JSONObject?): JSONObject {
            routes += route
            return when (route) {
                "workspace" -> JSONObject().put("ok", true).put("mode", "test").put("workspaceId", connection.workspaceId)
                    .put("profile", ProfileDraft().apiJson(includeLinkedIn = true).put("revision", 0).put("resume", JSONObject.NULL))
                    .put("jobs", JSONArray()).put("attempts", JSONArray()).put("activePlanIds", JSONArray()).put("recoverablePlans", JSONArray())
                    .put("capabilities", JSONObject().put("liveEnabled", false).put("linkedinProfile", true))
                "session/revoke", "stop" -> JSONObject().put("ok", true)
                else -> error("No application operation is allowed: $method $route")
            }
        }
    }
    private val store = MemoryStore()
    private val service = Service()
    private var owner = ViewModelStore()
    private lateinit var strings: CareerStrings
    private lateinit var model: CareerViewModel
    private lateinit var page: DiscoveryPage
    private val searches = CopyOnWriteArrayList<Pair<DiscoveryFilters, String?>>()
    private var catalogCalls = 0
    private lateinit var publicService: DiscoveryService
    @Before fun showPhone() {
        page = DiscoveryCodec.page(JSONObject(InstrumentationRegistry.getInstrumentation().context.assets.open("discovery-search-v1.json").bufferedReader().use { it.readText() }))
        publicService = object : DiscoveryService {
            override suspend fun sources(): DiscoveryCatalog { catalogCalls++; return DiscoveryCatalog(emptyList(), emptyList(), 4, "Synthetic") }
            override suspend fun search(filters: DiscoveryFilters, cursor: String?): DiscoveryPage { searches += filters to cursor; return page.copy(nextCursor = "old-cursor") }
        }
        createModel()
    }
    private fun createModel() {
        compose.activityRule.scenario.onActivity { activity ->
            strings = phoneAcceptanceStrings(activity)
            model = CareerViewModel(activity.application, store, service, discoveryService = publicService)
            owner.put("navigation-phone", model)
            activity.setContent { PhoneAcceptanceContent { CareerApp(model) } }
        }
        compose.waitUntil(5_000) { model.state.value.loaded && !model.state.value.busy }
    }
    @After fun clearPhone() { compose.runOnIdle { owner.clear() } }
    private fun hideKeyboard() {
        compose.runOnIdle {
            val activity = compose.activity
            (activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager)
                .hideSoftInputFromWindow(activity.window.decorView.windowToken, 0)
        }
        compose.waitForIdle()
    }
    private fun capture(name: String) {
        compose.waitForIdle()
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        instrumentation.uiAutomation.waitForIdle(500, 3_000)
        val bitmap = checkNotNull(instrumentation.uiAutomation.takeScreenshot())
        val directory = java.io.File(instrumentation.targetContext.cacheDir, "navigation-review-evidence").apply { mkdirs() }
        try { java.io.File(directory, "$name.png").outputStream().use { check(bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)) } }
        finally { bitmap.recycle() }
    }
    private fun addJob(): Opportunity {
        compose.runOnIdle { model.addOpportunity("https://example.invalid/navigation-role", "Synthetic care role", "Fixture employer", "", "") {} }
        compose.waitUntil(5_000) { !model.state.value.busy && model.state.value.jobs.size == 1 }
        return model.state.value.jobs.single()
    }
    private fun openRecord(job: Opportunity) {
        compose.onNodeWithTag("jobs-saved-tab").performClick()
        compose.onNodeWithTag("jobs-list").performScrollToNode(hasContentDescription(strings("Application record for ${job.title} at ${job.company}")))
        compose.onNodeWithContentDescription(strings("Application record for ${job.title} at ${job.company}")).performClick()
    }
    private fun stage(label: String) {
        compose.onNodeWithTag("application-record-editor").performScrollToNode(hasContentDescription(strings.format("Application stage: {0}", listOf(strings(label)))))
        compose.onNodeWithContentDescription(strings.format("Application stage: {0}", listOf(strings(label)))).performScrollTo().performClick()
        compose.runOnIdle { assertEquals(label, model.state.value.applicationRecordEditor?.draft?.stage?.label) }
    }
    private fun save() {
        compose.onNodeWithText(strings("Save record on this phone")).performClick()
        compose.waitUntil(5_000) { !model.state.value.busy }
    }

    @Test fun privateRecord_datesNotesAndFollowUp_areUsableAtLargeText_withoutCreatingAReceipt() {
        val job = addJob(); openRecord(job); stage("Applied")
        compose.runOnIdle { model.editApplicationRecordDraft({ it.copy(appliedDate = "2024-02-29", followUpDate = "2000-01-01") }) }
        compose.onNodeWithTag("application-record-editor").performScrollToNode(hasContentDescription(strings.format("Choose {0}", listOf(strings("Applied date (optional)")))))
        compose.onNodeWithContentDescription(strings.format("Choose {0}", listOf(strings("Applied date (optional)")))).performClick()
        compose.onNodeWithText(strings("Use date")).assertIsDisplayed()
        capture("private-record-date-picker")
        compose.onNodeWithText(strings("Cancel")).performClick()
        assertEquals("2024-02-29", model.state.value.applicationRecordEditor!!.draft.appliedDate)
        compose.onNodeWithContentDescription(strings.format("Choose {0}", listOf(strings("Applied date (optional)")))).performClick()
        compose.onNodeWithText(strings("Use date")).performClick()
        assertEquals("2024-02-29", model.state.value.applicationRecordEditor!!.draft.appliedDate)
        compose.onNodeWithTag("application-record-editor").performScrollToNode(hasText(strings("Private note (optional)")) and hasSetTextAction())
        compose.onNode(hasText(strings("Private note (optional)")) and hasSetTextAction()).performTextInput("Ask about the interview time.")
        hideKeyboard(); capture("private-record-editor")
        assertTrue(model.state.value.applicationRecords.isEmpty())
        save()
        compose.waitUntil(5_000) { model.state.value.applicationRecordEditor == null }
        val record = model.state.value.recordFor(job)!!
        assertEquals("Ask about the interview time.", record.current.record.note)
        assertEquals("2024-02-29", record.current.record.appliedDate)
        assertEquals("2000-01-01", record.current.record.followUpDate)
        assertTrue(job.id in model.state.value.manualApplied)
        compose.onNodeWithTag("jobs-list").performScrollToNode(hasText(strings("Follow-ups")))
        compose.onNodeWithText(strings("Follow-ups")).performClick()
        compose.onNodeWithTag("jobs-list").performScrollToNode(hasText(strings("Follow-up due:"), substring = true))
        compose.onNode(hasText(strings("Follow-up due:"), substring = true)).assertIsDisplayed()
        compose.onNodeWithTag("jobs-list").performScrollToNode(hasTestTag("private-follow-up-date"))
        compose.onNodeWithTag("private-follow-up-date").assertIsDisplayed()
        capture("private-follow-up-list")
        val saved = store.records.getValue("workspace-unpaired")
        compose.onNodeWithTag("jobs-list").performScrollToNode(hasContentDescription(strings("Application record for ${job.title} at ${job.company}")))
        compose.onNodeWithContentDescription(strings("Application record for ${job.title} at ${job.company}")).performClick()
        compose.onNodeWithTag("application-record-editor").performScrollToNode(hasText(strings("Private note (optional)")) and hasSetTextAction())
        compose.onNode(hasText(strings("Private note (optional)")) and hasSetTextAction()).performTextReplacement("Discard this edit")
        hideKeyboard(); compose.onNodeWithText(strings("Close record")).performClick()
        compose.onNodeWithText(strings("Keep your unfinished record?")).assertIsDisplayed()
        compose.onNodeWithText(strings("Discard unfinished changes")).performClick()
        compose.waitUntil(5_000) { !model.state.value.busy && model.state.value.applicationRecordEditor == null }
        assertEquals(JSONObject(saved).getJSONObject("applicationRecords").toString(), store.read("workspace-unpaired")!!.getJSONObject("applicationRecords").toString())
        assertTrue(model.state.value.recordDrafts.isEmpty())
        assertTrue(model.state.value.receipts.isEmpty()); assertTrue(service.routes.isEmpty())
    }

    @Test fun clearingAnAppliedRecord_requiresASeparateConfirmation_andKeepsEarlierHistory() {
        val job = addJob()
        compose.runOnIdle { model.markAppliedElsewhere(job.id, true) }
        compose.waitUntil(5_000) { !model.state.value.busy && job.id in model.state.value.manualApplied }
        openRecord(job); stage("Saved")
        val original = store.records.getValue("workspace-unpaired")
        save()
        compose.onNodeWithText(strings("Mark as not applied?")).assertIsDisplayed()
        capture("private-record-correction")
        assertEquals(JSONObject(original).getJSONObject("applicationRecords").toString(), store.read("workspace-unpaired")!!.getJSONObject("applicationRecords").toString())
        compose.onNodeWithText(strings("Keep application record")).performClick()
        assertTrue(job.id in model.state.value.manualApplied)
        assertEquals(JSONObject(original).getJSONObject("applicationRecords").toString(), store.read("workspace-unpaired")!!.getJSONObject("applicationRecords").toString())
        stage("Saved"); save()
        compose.onNodeWithText(strings("Mark not applied")).performClick()
        compose.waitUntil(5_000) { !model.state.value.busy && model.state.value.applicationRecordEditor == null }
        assertFalse(job.id in model.state.value.manualApplied)
        assertTrue(model.state.value.recordFor(job)!!.history.any { it.record.appliedElsewhere })
        assertTrue(model.state.value.receipts.isEmpty()); assertTrue(service.routes.isEmpty())
    }

    @Test fun connectionUsesTwoSteps_andPreservesTheChosenCustomAddressUnderAdvanced() {
        val removed = addJob()
        compose.runOnIdle { model.markAppliedElsewhere(removed.id, true) }
        compose.waitUntil(5_000) { !model.state.value.busy && removed.id in model.state.value.manualApplied }
        compose.runOnIdle { model.removeLocalOpportunity(removed.id) }
        compose.waitUntil(5_000) { !model.state.value.busy && model.state.value.jobs.isEmpty() }
        compose.onNodeWithTag("open-settings").performClick()
        compose.onNodeWithTag("settings-list").performScrollToNode(hasTestTag("settings-connection"))
        compose.onNodeWithTag("settings-connection").performClick()
        compose.onNodeWithTag("phone-connection").performScrollToNode(hasText(strings("1. Sign in and get a code")))
        compose.onNodeWithText(strings("1. Sign in and get a code")).assertIsDisplayed()
        compose.onNodeWithTag("phone-connection").performScrollToNode(hasText(strings("Sign in and get a code"), substring = false))
        compose.onNodeWithText(strings("Sign in and get a code")).assertIsDisplayed()
        capture("two-step-connection")
        compose.onNode(hasText(strings("HTTPS service address")) and hasSetTextAction()).assertDoesNotExist()
        compose.onNodeWithTag("phone-connection").performScrollToNode(hasText(strings("Advanced · use another service")))
        compose.onNodeWithText(strings("Advanced · use another service")).performClick()
        compose.onNodeWithTag("phone-connection").performScrollToNode(hasText(strings("HTTPS service address")) and hasSetTextAction())
        compose.onNode(hasText(strings("HTTPS service address")) and hasSetTextAction()).performTextReplacement("https://custom.example.invalid")
        hideKeyboard()
        compose.onNodeWithTag("phone-connection").performScrollToNode(hasText(strings("One-time code")) and hasSetTextAction())
        compose.onNode(hasText(strings("One-time code")) and hasSetTextAction()).performTextInput("SYNTHETIC-123")
        hideKeyboard()
        compose.onNodeWithTag("phone-connection").performScrollToNode(hasText(strings("Connect this phone"), substring = false))
        compose.onNodeWithText(strings("Connect this phone")).performClick()
        compose.waitUntil(5_000) { !model.state.value.busy && model.state.value.connection != null }
        assertEquals(listOf("https://custom.example.invalid" to "SYNTHETIC-123"), service.pairs.toList())
        assertTrue(service.routes.all { it == "workspace" })
        compose.onNodeWithTag("open-settings").performClick()
        compose.onNodeWithTag("settings-list").performScrollToNode(hasTestTag("settings-connection"))
        compose.onNodeWithTag("settings-connection").performClick()
        compose.onNodeWithTag("phone-connection").performScrollToNode(hasText(strings("HTTPS service address")) and hasSetTextAction())
        compose.onNode(hasText(strings("HTTPS service address")) and hasSetTextAction()).assertTextContains("https://custom.example.invalid")
        capture("custom-connection-address")
        compose.onNodeWithContentDescription(strings("Close ") + strings("Connect your phone")).performClick()
        compose.onNodeWithTag("navigation-profile").performClick()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText(strings("Review saved phone draft")))
        compose.onNodeWithText(strings("Review saved phone draft")).performClick()
        compose.onNodeWithTag("phone-import").performScrollToNode(hasText(strings.format("{0} · {1}", listOf(strings("0 saved links"), strings("1 private record")))))
        compose.onNodeWithText(strings.format("{0} · {1}", listOf(strings("0 saved links"), strings("1 private record")))).assertIsDisplayed()
        compose.onNodeWithTag("phone-import").performScrollToNode(hasText(strings("Copy saved links and private records")))
        compose.onNodeWithText(strings("Copy saved links and private records")).performClick()
        capture("record-only-phone-import")
        compose.onNodeWithTag("phone-import").performScrollToNode(hasText(strings("Copy selected drafts")))
        compose.onNodeWithText(strings("Copy selected drafts")).performClick()
        compose.waitUntil(5_000) { !model.state.value.busy && model.state.value.phoneImport == null }
        assertTrue(model.state.value.jobs.isEmpty())
        assertTrue(model.state.value.unbookmarkedRecords.single().appliedElsewhere)
        assertTrue(model.state.value.receipts.isEmpty())
        assertTrue(searches.isEmpty()); assertEquals(0, catalogCalls)
    }

    @Test fun settingsAppearance_survivesActivityRecreation_withoutChangingWorkspaceOrCallingService() {
        val preferences = compose.activity.getSharedPreferences(APPEARANCE_PREFERENCES, android.content.Context.MODE_PRIVATE)
        val previous = preferences.getString(APPEARANCE_KEY, null)
        try {
            compose.runOnIdle { preferences.edit().remove(APPEARANCE_KEY).commit() }
            val job = addJob()
            val scope = model.state.value.privateScope
            compose.onNodeWithTag("open-settings").performClick()
            compose.onNodeWithTag("settings-list").performScrollToNode(hasTestTag("appearance-system"))
            compose.onNodeWithTag("appearance-system").assertIsSelected()
            compose.onNodeWithTag("settings-list").performScrollToNode(hasTestTag("appearance-dark"))
            compose.onNodeWithTag("appearance-dark").performClick().assertIsSelected()
            assertEquals("dark", preferences.getString(APPEARANCE_KEY, null))
            capture("settings-dark")
            compose.runOnIdle { owner.clear(); owner = ViewModelStore() }
            compose.activityRule.scenario.recreate()
            createModel()
            compose.onNodeWithTag("navigation-settings").performClick().assertIsSelected()
            compose.onNodeWithTag("settings-list").performScrollToNode(hasTestTag("appearance-dark"))
            compose.onNodeWithTag("appearance-dark").assertIsSelected()
            assertEquals(scope, model.state.value.privateScope)
            assertEquals(job, model.state.value.jobs.single())
            compose.onNodeWithTag("settings-list").performScrollToNode(hasTestTag("appearance-light"))
            compose.onNodeWithTag("appearance-light").performClick().assertIsSelected()
            capture("settings-light")
            compose.onNodeWithTag("settings-list").performScrollToNode(hasTestTag("appearance-system"))
            compose.onNodeWithTag("appearance-system").performClick().assertIsSelected()
            compose.onNodeWithTag("navigation-profile").performClick()
            compose.onNodeWithTag("profile-list").assertIsDisplayed()
            assertTrue(service.pairs.isEmpty()); assertTrue(service.routes.isEmpty())
            assertTrue(searches.isEmpty()); assertEquals(0, catalogCalls)
        } finally {
            compose.runOnIdle {
                preferences.edit().apply { if (previous == null) remove(APPEARANCE_KEY) else putString(APPEARANCE_KEY, previous) }.commit()
            }
        }
    }

    @Test fun recreatedPhone_showsPreviousResults_andSearchAgainIsAnExplicitFreshRequest() {
        compose.onNodeWithTag("discovery-list").performScrollToNode(hasText(strings("Role, skill or keyword")) and hasSetTextAction())
        compose.onNode(hasText(strings("Role, skill or keyword")) and hasSetTextAction()).performTextInput("care")
        hideKeyboard()
        compose.onNodeWithTag("discovery-list").performScrollToNode(hasText(strings("Search jobs")))
        compose.onNodeWithText(strings("Search jobs")).performClick()
        compose.waitUntil(5_000) { !model.discovery.state.value.loading && model.discovery.state.value.jobs.size == 2 }
        runBlocking { withContext(Dispatchers.Main) { model.discovery.saveSearchNow(); model.discovery.stopPrivateSession(flush = true) } }
        compose.runOnIdle { owner.clear(); owner = ViewModelStore() }
        createModel()
        assertEquals(1, searches.size); assertEquals(0, catalogCalls)
        assertEquals("care", model.discovery.state.value.filters.query)
        assertEquals(page.generatedAt, model.discovery.state.value.generatedAt)
        assertNull(model.discovery.state.value.nextCursor)
        compose.onNodeWithTag("discovery-list").performScrollToNode(hasText(strings("Previous results")))
        compose.onNodeWithText(strings("Previous results")).assertIsDisplayed()
        compose.onNodeWithTag("discovery-list").performScrollToNode(hasText(strings("Search again")))
        compose.onNodeWithText(strings("Search again")).assertIsDisplayed()
        capture("previous-search-results")
        compose.onNodeWithTag("discovery-list").performScrollToNode(hasText(strings("Search again")))
        compose.onNodeWithText(strings("Search again")).performClick()
        compose.waitUntil(5_000) { !model.discovery.state.value.loading && searches.size == 2 }
        assertNull(searches.last().second)
        assertFalse(model.discovery.state.value.restoredSearch)
        assertTrue(service.routes.isEmpty())
    }
}
