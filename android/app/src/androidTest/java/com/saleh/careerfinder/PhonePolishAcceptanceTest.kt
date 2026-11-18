package com.saleh.careerfinder

import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasTestTag
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
    private lateinit var strings: CareerStrings
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

    private fun captureConfirmation(name: String) {
        compose.waitForIdle()
        runCatching {
            val instrumentation = InstrumentationRegistry.getInstrumentation()
            val directory = java.io.File(instrumentation.targetContext.cacheDir, "strict-review-evidence").apply { mkdirs() }
            // Compose idleness does not wait for Android's dialog-window fade.
            instrumentation.uiAutomation.waitForIdle(500, 3_000)
            val screenshot = checkNotNull(instrumentation.uiAutomation.takeScreenshot())
            try {
                java.io.File(directory, "$name.png").outputStream().use {
                    check(screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it))
                }
            } finally { screenshot.recycle() }
        }.onFailure { android.util.Log.w("CareerPhoneAcceptance", "Optional confirmation capture unavailable: $name", it) }
    }

    @Before fun showPhone() {
        val text = InstrumentationRegistry.getInstrumentation().context.assets.open("discovery-search-v1.json").bufferedReader().use { it.readText() }
        discovery = DiscoveryCodec.page(JSONObject(text))
        val publicService = object : DiscoveryService {
            override suspend fun sources() = DiscoveryCatalog(emptyList(), emptyList(), 4, "Synthetic fixture")
            override suspend fun search(filters: DiscoveryFilters, cursor: String?) = discovery
        }
        compose.activityRule.scenario.onActivity { activity ->
            strings = phoneAcceptanceStrings(activity)
            model = CareerViewModel(activity.application, store, service, discoveryService = publicService)
            owner.put("isolated-phone-polish", model)
            activity.setContent { PhoneAcceptanceContent { CareerApp(model) } }
        }
        compose.waitUntil(5_000) { model.state.value.loaded && !model.state.value.busy }
    }
    @After fun clearPhone() { compose.runOnIdle { owner.clear() } }

    @Test fun profileEssentials_andCountrySelection_preserveSingleNamesAndCancelledChoices() {
        var ownedClip: android.content.ClipData? = null
        assertTrue(copyContactField("Name", "Exact chosen field", { ownedClip = it }, { ownedClip?.description }))
        assertEquals("Exact chosen field", ownedClip?.getItemAt(0)?.text?.toString())
        val previousClip = ownedClip
        assertFalse("A void setter returning without writing must not report copied",
            copyContactField("Name", "Denied replacement", {}, { ownedClip?.description }))
        assertSame(previousClip, ownedClip)
        assertFalse("Missing description cannot confirm a copy",
            copyContactField("Name", "Unconfirmed replacement", {}, { null }))
        var readAfterDeniedWrite = false
        assertFalse(copyContactField("Name", "Denied field", { throw SecurityException("Synthetic write denial") },
            { readAfterDeniedWrite = true; ownedClip?.description }))
        assertFalse(readAfterDeniedWrite)
        assertFalse("A description read exception must stay unconfirmed",
            copyContactField("Name", "Unconfirmed field", {}, { throw SecurityException("Synthetic read denial") }))
        compose.onNodeWithTag("navigation-profile").revealNavigationTab().performClick()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText(strings("First or single name")) and hasSetTextAction())
        compose.onNode(hasText(strings("First or single name")) and hasSetTextAction()).performTextInput("Single")
        closeSoftKeyboard()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText(strings("Email")) and hasSetTextAction())
        compose.onNode(hasText(strings("Email")) and hasSetTextAction()).performTextInput("single@example.invalid")
        closeSoftKeyboard()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText(strings("Application essentials ready: 2 / 3")))
        compose.onNodeWithText(strings("Application essentials ready: 2 / 3")).assertIsDisplayed()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText(strings("Choose PDF résumé")))
        compose.onNodeWithText(strings("Choose PDF résumé")).assertIsDisplayed()
        assertEquals("", model.state.value.profile.lastName)
        assertNull(model.state.value.profile.resume)
        compose.onNodeWithTag("profile-list").performScrollToNode(hasTestTag("profile.reuse"))
        compose.onNodeWithTag("profile.reuse").performClick()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasTestTag("profile.copy.firstName"))
        compose.onNodeWithTag("profile.copy.firstName").performClick()
        compose.runOnIdle {
            val clipboard = compose.activity.getSystemService(android.content.ClipboardManager::class.java)
            assertEquals("Single", clipboard.primaryClip?.getItemAt(0)?.text?.toString())
            assertTrue(clipboard.primaryClip?.description?.extras?.getBoolean("android.content.extra.IS_SENSITIVE") == true)
            assertEquals("single@example.invalid", model.state.value.profile.email)
            assertEquals(0, service.requests)
        }
        compose.onNodeWithTag("profile-list").performScrollToNode(hasTestTag("profile.copy.confirmation"))
        compose.onNodeWithTag("profile.copy.confirmation").assertIsDisplayed()
        captureConfirmation("profile-contact-copy")
        compose.onNodeWithTag("profile-list").performScrollToNode(hasTestTag("profile.reuse"))
        compose.onNodeWithTag("profile.reuse").performClick()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText(strings("Add experience and preferences")))
        compose.onNodeWithText(strings("Add experience and preferences")).performClick()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasContentDescription(strings("Choose target countries")))
        compose.onNodeWithContentDescription(strings("Choose target countries")).performClick()
        compose.onNode(hasText(strings("Search target countries")) and hasSetTextAction()).performTextInput("JP")
        compose.onNode(hasText(strings("Search target countries")) and hasSetTextAction()).performImeAction()
        android.util.Log.i("CareerPhoneAcceptance", "Country picker: JP Done completed")
        compose.onNodeWithContentDescription(strings("Close ") + strings("Target countries")).assertIsDisplayed()
        compose.onNodeWithTag("target-countries").performScrollToNode(hasText(" · JP", substring = true))
        compose.onNode(hasText(" · JP", substring = true)).performClick()
        assertEquals("", model.state.value.profile.targetCountries)
        captureConfirmation("target-country-jp-draft-after-ime")
        compose.onNodeWithText(strings("Use selected countries")).performClick()
        assertEquals("JP", model.state.value.profile.targetCountries)
        compose.onNodeWithTag("profile-list").performScrollToNode(hasContentDescription(strings("Choose target countries")))
        compose.onNodeWithContentDescription(strings("Choose target countries")).performClick()
        compose.onNode(hasText(strings("Search target countries")) and hasSetTextAction()).performTextInput("FR")
        compose.onNode(hasText(strings("Search target countries")) and hasSetTextAction()).performImeAction()
        android.util.Log.i("CareerPhoneAcceptance", "Country picker: FR Done completed")
        compose.onNodeWithContentDescription(strings("Close ") + strings("Target countries")).assertIsDisplayed()
        compose.onNodeWithTag("target-countries").performScrollToNode(hasText(" · FR", substring = true))
        compose.onNode(hasText(" · FR", substring = true)).performClick()
        compose.onNodeWithContentDescription(strings("Close ") + strings("Target countries")).performClick()
        assertEquals("JP", model.state.value.profile.targetCountries)
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText(strings("Save profile on this phone")))
        compose.onNodeWithText(strings("Save profile on this phone")).performClick()
        compose.waitUntil(5_000) { !model.state.value.busy && !model.state.value.profileDirty }
        assertEquals("Single", model.state.value.profile.firstName)
        assertEquals("JP", model.state.value.profile.targetCountries)
        assertEquals(0, service.requests)
    }

    @Test fun discoveredRole_savesPrivately_andManualApplicationRemainsSelfReported() {
        val job = discovery.jobs.first()
        val searchAction = hasText(strings("Search jobs")) and hasClickAction()
        compose.onNodeWithTag("discovery-list").performScrollToNode(searchAction)
        compose.onNode(searchAction).performClick()
        compose.waitUntil(5_000) { model.discovery.state.value.jobs.size == 2 && !model.discovery.state.value.loading }
        compose.onNodeWithTag("discovery-list").performScrollToNode(hasContentDescription(strings.format("Save {0} at {1}", listOf(job.title, job.company))))
        compose.onNodeWithContentDescription(strings.format("Save {0} at {1}", listOf(job.title, job.company))).performClick()
        compose.waitUntil(5_000) { model.state.value.jobs.size == 1 && !model.state.value.busy }
        val saved = model.state.value.jobs.single()
        assertEquals(job.url, saved.url)
        assertEquals("", saved.country)
        assertTrue(saved.localOnly)
        compose.onNodeWithTag("jobs-saved-tab").performClick()
        compose.onNodeWithTag("jobs-list").performScrollToNode(hasContentDescription(strings("Application record for ${job.title} at ${job.company}")))
        compose.onNodeWithContentDescription(strings("Application record for ${job.title} at ${job.company}")).performClick()
        compose.onNodeWithTag("application-record-editor").performScrollToNode(hasContentDescription(strings.format("Application stage: {0}", listOf(strings("Applied")))))
        compose.onNodeWithContentDescription(strings.format("Application stage: {0}", listOf(strings("Applied")))).performScrollTo().performClick()
        compose.runOnIdle { assertEquals("Applied stage must be selected before saving", ApplicationStage.APPLIED, model.state.value.applicationRecordEditor?.draft?.stage) }
        compose.onNodeWithText(strings("Save record on this phone")).performClick()
        compose.waitUntil(5_000) { !model.state.value.busy && saved.id in model.state.value.manualApplied }
        compose.onNodeWithTag("jobs-list").performScrollToNode(hasText(strings("Applied elsewhere · self-reported")))
        compose.onNodeWithText(strings("Applied elsewhere · self-reported")).assertIsDisplayed()
        assertTrue(model.state.value.receipts.isEmpty())
        assertEquals(0, service.requests)
        assertTrue(store.read("workspace-unpaired")!!.getJSONArray("manualApplied").strings().contains(saved.id))
    }

    @Test fun unfinishedOpportunity_closeChoicesKeepAndDiscardOnlyTheDraft() {
        compose.onNodeWithTag("jobs-saved-tab").performClick()
        compose.onNodeWithTag("jobs-list").performScrollToNode(hasText(strings("Add opportunity")))
        compose.onNodeWithText(strings("Add opportunity")).performClick()
        compose.onNodeWithTag("opportunity-editor").performScrollToNode(hasText(strings("Employer job link")) and hasSetTextAction())
        compose.onNode(hasText(strings("Employer job link")) and hasSetTextAction()).performTextInput("https://example.invalid/later")
        closeSoftKeyboard()
        compose.onNodeWithTag("opportunity-editor").performScrollToNode(hasText(strings("Role title")) and hasSetTextAction())
        compose.onNode(hasText(strings("Role title")) and hasSetTextAction()).performTextInput("Unfinished role")
        closeSoftKeyboard()
        compose.onNodeWithContentDescription(strings("Close ") + strings("Add opportunity")).performClick()
        captureConfirmation("unfinished-opportunity-choices")
        compose.onNodeWithText(strings("Keep editing")).performClick()
        compose.onNodeWithTag("opportunity-editor").performScrollToNode(hasText(strings("Role title")) and hasSetTextAction())
        compose.onNode(hasText(strings("Role title")) and hasSetTextAction()).assertTextContains("Unfinished role")

        compose.onNodeWithContentDescription(strings("Close ") + strings("Add opportunity")).performClick()
        compose.onNodeWithText(strings("Keep draft")).performClick()
        compose.waitUntil(5_000) { !model.state.value.busy && store.read("workspace-unpaired")?.has("opportunityDraft") == true }
        compose.onNodeWithTag("jobs-list").performScrollToNode(hasText(strings("Continue job draft")))
        compose.onNodeWithText(strings("Continue job draft")).performClick()
        compose.onNodeWithTag("opportunity-editor").performScrollToNode(hasText(strings("Role title")) and hasSetTextAction())
        compose.onNode(hasText(strings("Role title")) and hasSetTextAction()).assertTextContains("Unfinished role")
        compose.onNodeWithContentDescription(strings("Close ") + strings("Add opportunity")).performClick()
        compose.onNodeWithText(strings("Discard")).performClick()
        compose.waitUntil(5_000) { !model.state.value.busy && !model.state.value.opportunityDraft.hasContent }
        compose.onNodeWithTag("jobs-list").performScrollToNode(hasText(strings("Add opportunity")))
        compose.onNodeWithText(strings("Add opportunity")).assertIsDisplayed()
        assertTrue(model.state.value.jobs.isEmpty())
        assertFalse(OpportunityDraft.fromJson(store.read("workspace-unpaired")!!.getJSONObject("opportunityDraft")).hasContent)
        assertEquals(0, service.requests)
    }

    @Test fun localOpportunityRemoval_requiresConfirmation_andPreservesOtherSavedRoles() {
        compose.runOnIdle { model.addOpportunity("https://example.invalid/remove", "Remove fixture", "Employer", "", "") {} }
        compose.waitUntil(5_000) { !model.state.value.busy && model.state.value.jobs.size == 1 }
        val removable = model.state.value.jobs.single()
        compose.runOnIdle { model.addOpportunity("https://example.invalid/keep", "Keep fixture", "Employer", "", "") {} }
        compose.waitUntil(5_000) { !model.state.value.busy && model.state.value.jobs.size == 2 }
        compose.runOnIdle { model.markAppliedElsewhere(removable.id, true) }
        compose.waitUntil(5_000) { !model.state.value.busy && removable.id in model.state.value.manualApplied }
        compose.onNodeWithTag("jobs-saved-tab").performClick()
        val remove = strings.format("Remove saved link for {0} at {1}", listOf(removable.title, removable.company))
        compose.onNodeWithTag("jobs-list").performScrollToNode(hasContentDescription(remove))
        compose.onNodeWithContentDescription(remove).performClick()
        compose.onNodeWithText(strings("Connected records and receipts stay saved.")).performScrollTo().assertIsDisplayed()
        captureConfirmation("remove-local-opportunity-confirmation")
        compose.onNodeWithText(strings("Keep opportunity")).performClick()
        assertEquals(2, model.state.value.jobs.size)
        assertTrue(removable.id in model.state.value.manualApplied)
        compose.onNodeWithContentDescription(remove).performClick()
        compose.onNodeWithTag("confirm-remove-opportunity").performClick()
        compose.waitUntil(5_000) { !model.state.value.busy && model.state.value.jobs.size == 1 }
        assertEquals("https://example.invalid/keep", model.state.value.jobs.single().url)
        assertFalse(removable.id in model.state.value.manualApplied)
        assertTrue(model.state.value.receipts.isEmpty())
        assertEquals(0, service.requests)
    }
}
