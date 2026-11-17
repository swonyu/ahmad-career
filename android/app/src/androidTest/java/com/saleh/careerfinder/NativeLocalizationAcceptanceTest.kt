package com.saleh.careerfinder

import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import android.content.res.Configuration
import android.os.LocaleList
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.LayoutDirection
import androidx.lifecycle.ViewModelStore
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import java.time.LocalDate
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** Production Compose, resource and language helpers, with synthetic memory data.
 * Preference writes model an external display-language change without changing the
 * instrumentation host's Android per-app locale. Physical OS picker acceptance is separate.
 */
class NativeLocalizationAcceptanceTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private class Store : PrivateStore {
        val records = ConcurrentHashMap<String, String>()
        override fun read(name: String) = records[name]?.let(::JSONObject)
        override fun write(name: String, value: JSONObject) { records[name] = value.toString() }
        override fun remove(name: String) { records.remove(name) }
        override fun startFreshPreservingExisting() { error("Not part of this isolated language fixture") }
    }
    private class NoService : CareerService {
        var calls = 0
        override suspend fun pair(origin: String, code: String): Connection { calls++; error("No pairing in this fixture") }
        override suspend fun request(connection: Connection, method: String, route: String, body: JSONObject?): JSONObject { calls++; error("No application API in this fixture") }
    }
    private class IsolatedDisplayContext(base: Context, private val preferences: SharedPreferences) : ContextWrapper(base) {
        override fun getSharedPreferences(name: String, mode: Int): SharedPreferences =
            if (name == "career_display_language") preferences else super.getSharedPreferences(name, mode)
    }
    private val store = Store()
    private val service = NoService()
    private val owner = ViewModelStore()
    private lateinit var model: CareerViewModel
    private lateinit var preferences: SharedPreferences
    private lateinit var context: Context
    private var direction: LayoutDirection? = null
    private var selection: LanguagePreference? = null
    private fun mount() {
        compose.activityRule.scenario.onActivity { activity ->
            activity.setContent {
                CompositionLocalProvider(LocalContext provides context) {
                    CareerLanguage {
                        val currentDirection = LocalLayoutDirection.current
                        val currentSelection = LocalCareerLanguage.current.preference
                        SideEffect { direction = currentDirection; selection = currentSelection }
                        CareerTheme { CareerApp(model) }
                    }
                }
            }
        }
    }
    @Before fun setup() {
        compose.activityRule.scenario.onActivity { activity ->
            preferences = activity.getSharedPreferences("native-language-acceptance-" + UUID.randomUUID(), Context.MODE_PRIVATE)
            preferences.edit().putString("selection", "en").commit()
            context = IsolatedDisplayContext(activity, preferences)
            val discovery = object : DiscoveryService {
                override suspend fun sources(): DiscoveryCatalog { error("No search in language fixture") }
                override suspend fun search(filters: DiscoveryFilters, cursor: String?): DiscoveryPage { error("No search in language fixture") }
            }
            model = CareerViewModel(activity.application, store, service, discoveryService = discovery)
            owner.put("language-fixture", model)
        }
        mount()
        compose.waitUntil(5_000) { model.state.value.loaded && !model.state.value.busy }
    }
    @After fun cleanup() { compose.runOnIdle { owner.clear(); preferences.edit().clear().commit() } }
    private fun display(language: String) {
        compose.runOnIdle { preferences.edit().putString("selection", language).commit() }
        compose.waitUntil(5_000) { selection?.value == language }
        compose.waitForIdle()
    }
    private fun strings(language: String): CareerStrings {
        val config = Configuration(context.resources.configuration).apply { setLocales(LocaleList(Locale.forLanguageTag(language))) }
        return CareerStrings(context.createConfigurationContext(config))
    }

    @Test fun arabicDisplay_keepsProfileAndPrivateScope_andPersistsWithoutServiceCalls() {
        compose.onNodeWithTag("navigation-profile").performClick()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText("First or single name") and hasSetTextAction())
        compose.onNode(hasText("First or single name") and hasSetTextAction()).performTextInput("Saved")
        val scope = model.state.value.privateScope
        display("ar")
        compose.onNode(hasText(strings("ar")("First or single name")) and hasSetTextAction()).assertTextContains("Saved")
        assertEquals(LayoutDirection.Rtl, direction)
        assertEquals("Saved", model.state.value.profile.firstName)
        assertEquals(scope, model.state.value.privateScope)
        assertEquals(LanguagePreference.ARABIC, readLanguagePreference(context))
        compose.onNodeWithTag("open-settings").performClick()
        compose.onNodeWithTag("settings-list").performScrollToNode(hasTestTag("language-ar"))
        compose.onNodeWithTag("language-ar").assertIsSelected()
        // A fresh composition reads the saved preference; the model remains the same owner.
        mount()
        compose.waitForIdle()
        compose.waitUntil(5_000) { direction == LayoutDirection.Rtl }
        assertEquals("Saved", model.state.value.profile.firstName)
        display("en")
        assertEquals(LayoutDirection.Ltr, direction)
        compose.onNodeWithTag("navigation-profile").performClick()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText("First or single name") and hasSetTextAction())
        compose.onNode(hasText("First or single name") and hasSetTextAction()).assertTextContains("Saved")
        assertEquals(0, service.calls)
        assertTrue(model.state.value.receipts.isEmpty())
    }

    @Test fun unknownErrorsAndUserTemplateText_arePreserved_andDatesStayGregorian() {
        val ar = strings("ar")
        val identity = "Saved {1} / person@example.invalid"
        val employer = "Remote {0}"
        val formatted = ar.format("Source: {0} · {1}", listOf(identity, employer))
        assertTrue(formatted.contains(identity)); assertTrue(formatted.contains(employer))
        assertTrue(formatted.contains("المصدر"))
        val unknown = "Encryption device key unavailable: fixture-only E123"
        assertTrue(ar.message(unknown).contains(unknown))
        assertFalse(ar.message(unknown).contains("check your connection", ignoreCase = true))
        val receipt = "ID-{0}-original"
        assertTrue(ar("The provider accepted this application. Receipt: " + receipt).contains(receipt))
        val civil = ar.civilDate("2024-02-29")
        assertEquals(ar.date(LocalDate.of(2024, 2, 29)), civil)
        assertTrue(civil.contains("2024") || civil.contains("٢٠٢٤"))
        assertEquals("Raw employer title {0}", ar("Raw employer title {0}"))
        assertEquals(0, service.calls)
    }

    @Test fun selectedLanguage_remainsConsistentInsideAnOpenDialog_withoutLosingItsDraft() {
        // CI deliberately keeps the activity's per-app locale Arabic while this
        // isolated display preference starts in English. A Dialog must not fall
        // back to its window Context for nested Field/Heading/Action copy.
        assertEquals("The acceptance activity must retain its Arabic platform locale", "ar",
            compose.activity.resources.configuration.locales[0].language)
        val rawTitle = "Saved {0} عنوان"
        val scope = model.state.value.privateScope
        compose.onNodeWithTag("jobs-saved-tab").performClick()
        compose.onNodeWithTag("jobs-list").performScrollToNode(hasText("Add opportunity"))
        compose.onNodeWithText("Add opportunity").performClick()
        compose.onNodeWithTag("opportunity-editor").performScrollToNode(hasText("Role title") and hasSetTextAction())
        compose.onNode(hasText("Role title") and hasSetTextAction()).performTextInput(rawTitle)
        compose.runOnIdle {
            val activity = compose.activity
            (activity.getSystemService(Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager)
                .hideSoftInputFromWindow(activity.window.decorView.windowToken, 0)
        }
        compose.onNodeWithTag("opportunity-editor").performScrollToNode(hasText("Save opportunity"))
        compose.onNodeWithText("Save opportunity").assertIsDisplayed()
        display("ar")
        val ar = strings("ar")
        compose.onNodeWithTag("opportunity-editor").performScrollToNode(hasText(ar("Save opportunity")))
        compose.onNodeWithText(ar("Save opportunity")).assertIsDisplayed()
        compose.onNodeWithTag("opportunity-editor").performScrollToNode(hasText(ar("Role title")) and hasSetTextAction())
        compose.onNode(hasText(ar("Role title")) and hasSetTextAction()).assertTextContains(rawTitle)
        compose.onNodeWithContentDescription(ar("Close ") + ar("Add opportunity")).assertIsDisplayed()
        assertEquals(LayoutDirection.Rtl, direction)
        assertEquals(rawTitle, model.state.value.opportunityDraft.title)
        assertEquals(scope, model.state.value.privateScope)
        display("en")
        compose.onNode(hasText("Role title") and hasSetTextAction()).assertTextContains(rawTitle)
        assertEquals(LayoutDirection.Ltr, direction)
        assertEquals(rawTitle, model.state.value.opportunityDraft.title)
        assertTrue(model.state.value.jobs.isEmpty())
        assertTrue(model.state.value.receipts.isEmpty())
        assertEquals(0, service.calls)
    }

    @Test fun systemLanguage_usesTheFirstSupportedFallback_andDoesNotAliasAramaic() {
        assertEquals("ar", supportedCareerLanguage(listOf("fr-FR", "arc", "ar-SA", "en-US")))
        assertEquals("en", supportedCareerLanguage(listOf("fr-FR", "en-GB", "ar")))
        assertEquals("en", supportedCareerLanguage(listOf("arc", "fr")))
        display("system")
        assertEquals(LanguagePreference.SYSTEM, readLanguagePreference(context))
        assertEquals(0, service.calls)
    }
}
