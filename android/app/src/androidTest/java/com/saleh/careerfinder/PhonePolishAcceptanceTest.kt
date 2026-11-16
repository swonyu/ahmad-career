package com.saleh.careerfinder

import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import java.util.concurrent.ConcurrentHashMap

/** Actual Compose flows, isolated private storage and synthetic discovery. No service traffic. */
class PhonePolishAcceptanceTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private class MemoryStore : PrivateStore {
        val records = ConcurrentHashMap<String, String>()
        override fun read(name: String) = records[name]?.let(::JSONObject)
        override fun write(name: String, value: JSONObject) { records[name] = value.toString() }
        override fun remove(name: String) { records.remove(name) }
        override fun startFreshPreservingExisting() { error("Not part of this UX fixture") }
    }
    private class NoApplicationService : CareerService {
        var requests = 0
        override suspend fun pair(origin: String, code: String): Connection { error("No pairing in this fixture") }
        override suspend fun request(connection: Connection, method: String, route: String, body: JSONObject?): JSONObject {
            requests++; error("This phone-only flow must not call application APIs")
        }
    }
    private val store = MemoryStore()
    private val service = NoApplicationService()
    private val owner = ViewModelStore()
    private lateinit var model: CareerViewModel
    private lateinit var discovery: DiscoveryPage

    private fun closeSoftKeyboard() {
        compose.runOnIdle {
            val activity = compose.activity
            (activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager)
                .hideSoftInputFromWindow(activity.window.decorView.windowToken, 0)
        }
        compose.waitForIdle()
    }

    @Before fun showPhone() {
        val text = InstrumentationRegistry.getInstrumentation().context.assets.open("discovery-search-v1.json").bufferedReader().use { it.readText() }
        discovery = DiscoveryCodec.page(JSONObject(text))
        val publicService = object : DiscoveryService {
            override suspend fun sources() = DiscoveryCatalog(emptyList(), emptyList(), 4, "Synthetic fixture")
            override suspend fun search(filters: DiscoveryFilters, cursor: String?) = discovery
        }
        compose.activityRule.scenario.onActivity { activity ->
            model = CareerViewModel(activity.application, store, service, discoveryService = publicService)
            owner.put("isolated-phone-polish", model)
            activity.setContent { MaterialTheme { CareerApp(model) } }
        }
        compose.waitUntil(5_000) { model.state.value.loaded && !model.state.value.busy }
    }
    @After fun clearPhone() { compose.runOnIdle { owner.clear() } }

    @Test fun profileEssentials_andCountrySelection_preserveSingleNamesAndCancelledChoices() {
        compose.onNodeWithText("Profile").performClick()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText("First or single name") and hasSetTextAction())
        compose.onNode(hasText("First or single name") and hasSetTextAction()).performTextInput("Single")
        closeSoftKeyboard()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText("Email") and hasSetTextAction())
        compose.onNode(hasText("Email") and hasSetTextAction()).performTextInput("single@example.invalid")
        closeSoftKeyboard()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText("2 of 3 application essentials ready"))
        compose.onNodeWithText("2 of 3 application essentials ready").assertIsDisplayed()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText("Choose PDF résumé"))
        compose.onNodeWithText("Choose PDF résumé").assertIsDisplayed()
        assertEquals("", model.state.value.profile.lastName)
        assertNull(model.state.value.profile.resume)
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText("Add experience and preferences"))
        compose.onNodeWithText("Add experience and preferences").performClick()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasContentDescription("Choose target countries"))
        compose.onNodeWithContentDescription("Choose target countries").performClick()
        compose.onNode(hasText("Search target countries") and hasSetTextAction()).performTextInput("JP")
        compose.onNode(hasText("Search target countries") and hasSetTextAction()).performImeAction()
        android.util.Log.i("CareerPhoneAcceptance", "Country picker: JP Done completed")
        compose.onNodeWithTag("target-countries").performScrollToNode(hasText(" · JP", substring = true))
        compose.onNode(hasText(" · JP", substring = true)).performClick()
        assertEquals("", model.state.value.profile.targetCountries)
        compose.onNodeWithText("Use selected countries").performClick()
        assertEquals("JP", model.state.value.profile.targetCountries)
        compose.onNodeWithTag("profile-list").performScrollToNode(hasContentDescription("Choose target countries"))
        compose.onNodeWithContentDescription("Choose target countries").performClick()
        compose.onNode(hasText("Search target countries") and hasSetTextAction()).performTextInput("FR")
        compose.onNode(hasText("Search target countries") and hasSetTextAction()).performImeAction()
        android.util.Log.i("CareerPhoneAcceptance", "Country picker: FR Done completed")
        compose.onNodeWithTag("target-countries").performScrollToNode(hasText(" · FR", substring = true))
        compose.onNode(hasText(" · FR", substring = true)).performClick()
        compose.onNodeWithContentDescription("Close Target countries").performClick()
        assertEquals("JP", model.state.value.profile.targetCountries)
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText("Save profile on this phone"))
        compose.onNodeWithText("Save profile on this phone").performClick()
        compose.waitUntil(5_000) { !model.state.value.busy && !model.state.value.profileDirty }
        assertEquals("Single", model.state.value.profile.firstName)
        assertEquals("JP", model.state.value.profile.targetCountries)
        assertEquals(0, service.requests)
    }

    @Test fun discoveredRole_savesPrivately_andManualApplicationRemainsSelfReported() {
        val job = discovery.jobs.first()
        compose.onNodeWithText("Search jobs").performScrollTo().performClick()
        compose.waitUntil(5_000) { model.discovery.state.value.jobs.size == 2 && !model.discovery.state.value.loading }
        compose.onNodeWithTag("discovery-list").performScrollToNode(hasContentDescription("Save ${job.title} at ${job.company}"))
        compose.onNodeWithContentDescription("Save ${job.title} at ${job.company}").performClick()
        compose.waitUntil(5_000) { model.state.value.jobs.size == 1 && !model.state.value.busy }
        val saved = model.state.value.jobs.single()
        assertEquals(job.url, saved.url)
        assertEquals("", saved.country)
        assertTrue(saved.localOnly)
        compose.onNodeWithTag("jobs-saved-tab").performClick()
        compose.onNodeWithTag("jobs-list").performScrollToNode(hasContentDescription("I applied on the employer’s site for ${job.title} at ${job.company}"))
        compose.onNodeWithContentDescription("I applied on the employer’s site for ${job.title} at ${job.company}").performClick()
        compose.waitUntil(5_000) { !model.state.value.busy && saved.id in model.state.value.manualApplied }
        compose.onNodeWithTag("jobs-list").performScrollToNode(hasText("Applied elsewhere · self-reported"))
        compose.onNodeWithText("Applied elsewhere · self-reported").assertIsDisplayed()
        assertTrue(model.state.value.receipts.isEmpty())
        assertEquals(0, service.requests)
        assertTrue(store.read("workspace-unpaired")!!.getJSONArray("manualApplied").strings().contains(saved.id))
    }
}
