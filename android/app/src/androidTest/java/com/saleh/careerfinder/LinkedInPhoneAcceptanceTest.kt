package com.saleh.careerfinder

import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import java.util.concurrent.ConcurrentHashMap

/** Production Compose components on an isolated synthetic phone; external links are never opened. */
class LinkedInPhoneAcceptanceTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private class MemoryStore : PrivateStore {
        val records = ConcurrentHashMap<String, String>()
        override fun read(name: String) = records[name]?.let(::JSONObject)
        override fun write(name: String, value: JSONObject) { records[name] = value.toString() }
        override fun remove(name: String) { records.remove(name) }
        override fun startFreshPreservingExisting() { error("Not used by this fixture") }
    }
    private val store = MemoryStore()
    private val owner = ViewModelStore()
    private lateinit var strings: CareerStrings
    private lateinit var model: CareerViewModel
    private var requests = 0
    @Before fun showPhone() {
        val service = object : CareerService {
            override suspend fun pair(origin: String, code: String): Connection = error("No pairing")
            override suspend fun request(connection: Connection, method: String, route: String, body: JSONObject?): JSONObject {
                requests++; error("No external application request is allowed")
            }
        }
        val discovery = object : DiscoveryService {
            override suspend fun sources(): DiscoveryCatalog = error("No discovery network request")
            override suspend fun search(filters: DiscoveryFilters, cursor: String?): DiscoveryPage = error("No discovery network request")
        }
        compose.activityRule.scenario.onActivity { activity ->
            strings = phoneAcceptanceStrings(activity)
            model = CareerViewModel(activity.application, store, service, discoveryService = discovery)
            owner.put("linkedin-phone", model)
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
        val directory = java.io.File(instrumentation.targetContext.cacheDir, "linkedin-review-evidence").apply { mkdirs() }
        try { java.io.File(directory, "$name.png").outputStream().use { check(bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)) } }
        finally { bitmap.recycle() }
    }

    @Test fun optionalProfileLink_isHonestEditableAndPrivatelySavedAtLargeText() {
        compose.onNodeWithTag("navigation-profile").performClick()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText(strings("Add experience and preferences")))
        compose.onNodeWithText(strings("Add experience and preferences")).performClick()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText(strings("LinkedIn profile (optional)")) and hasSetTextAction())
        compose.onNode(hasText(strings("LinkedIn profile (optional)")) and hasSetTextAction()).performTextInput("https://sa.linkedin.com/in/example-person/?trk=phone")
        hideKeyboard()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText(strings("A saved profile link, not a verified LinkedIn account connection. It is shared with an employer only when it appears in a review you approve."), substring = true))
        compose.onNode(hasText(strings("A saved profile link, not a verified LinkedIn account connection. It is shared with an employer only when it appears in a review you approve."), substring = true)).assertIsDisplayed()
        capture("linkedin-profile-guidance")
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText(strings("Open LinkedIn profile")))
        compose.onNodeWithText(strings("Open LinkedIn profile")).assertIsDisplayed()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText(strings("Save profile on this phone")))
        compose.onNodeWithText(strings("Save profile on this phone")).performClick()
        compose.waitUntil(5_000) { !model.state.value.busy && !model.state.value.profileDirty }
        assertEquals("https://www.linkedin.com/in/example-person", model.state.value.profile.linkedin)
        assertEquals("https://www.linkedin.com/in/example-person", store.read("workspace-unpaired")!!.getJSONObject("profile").getString("linkedin"))
        assertEquals(0, requests)
        assertTrue(model.state.value.receipts.isEmpty())
    }

    @Test fun exactApprovalLinkAndExternalSearch_areReadableWithoutClaimingSubmission() {
        val exact = "https://www.linkedin.com/in/example-person"
        val payload = JSONObject().put("name", "Synthetic applicant").put("email", "applicant@example.invalid").put("phone", "")
            .put("website", "https://portfolio.example.invalid").put("linkedin", exact).put("comments", "")
            .put("consentStore", true).put("consentMarketing", false)
        val item = ReviewItem("fixture-job", "ready", "", "Synthetic role", "Fixture employer", "https://example.invalid/job",
            payload, Resume("Fixture.pdf", 20, "a".repeat(64)), "", "")
        var opened: String? = null
        compose.activityRule.scenario.onActivity { activity ->
            activity.setContent {
                PhoneAcceptanceContent {
                    Surface(color = MaterialTheme.colorScheme.background) {
                        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().verticalScroll(rememberScrollState())
                            .padding(20.dp).testTag("linkedin-review-content"), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                            ReviewCard(item)
                            LinkedInSearchAction("Data & science", "Riyadh, SA") { opened = it }
                        }
                    }
                }
            }
        }
        compose.onNodeWithText(exact).performScrollTo().assertIsDisplayed()
        capture("linkedin-exact-review")
        compose.onNodeWithText(strings("Search LinkedIn")).performScrollTo().assertIsDisplayed()
        compose.onNodeWithText(strings("Search LinkedIn")).performClick()
        compose.onNode(hasText(strings("Opens LinkedIn with your keywords and location. LinkedIn manages its own sign-in and applications; opening a search does not submit an application."), substring = true)).performScrollTo().assertIsDisplayed()
        capture("linkedin-search-handoff")
        assertEquals("https://www.linkedin.com/jobs/search/?keywords=Data+%26+science&location=Riyadh%2C+SA", opened)
        assertEquals(0, requests)
        assertTrue(model.state.value.receipts.isEmpty())
    }
}
