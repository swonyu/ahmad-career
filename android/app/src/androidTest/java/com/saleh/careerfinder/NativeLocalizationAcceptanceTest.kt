package com.saleh.careerfinder

import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import android.content.res.Configuration
import android.os.LocaleList
import android.os.Build
import android.app.LocaleManager
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
 * UI choices and external preference changes use an isolated preference file. The
 * Android locale service is absent only in this test context, so the runner's Arabic
 * platform locale remains unchanged. Physical OS picker acceptance is separate.
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
        override fun getSystemService(name: String): Any? =
            if (Build.VERSION.SDK_INT >= 33 && name == Context.LOCALE_SERVICE) null else super.getSystemService(name)
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

    @Test fun systemLanguage_usesTheFirstSupportedFallback_andDoesNotAliasAramaic() {
        assertEquals("ar", supportedCareerLanguage(listOf("fr-FR", "arc", "ar-SA", "en-US")))
        assertEquals("en", supportedCareerLanguage(listOf("fr-FR", "en-GB", "ar")))
        assertEquals("en", supportedCareerLanguage(listOf("arc", "fr")))
        display("system")
        assertEquals(LanguagePreference.SYSTEM, readLanguagePreference(context))
        assertEquals(0, service.calls)
    }

    @Test fun openDialog_keepsHeadingAndNestedActionsInTheSelectedLanguage() {
        val scope = model.state.value.privateScope
        val originalProfile = model.state.value.profile
        compose.onNodeWithTag("open-settings").performClick()
        compose.onNodeWithTag("settings-list").performScrollToNode(hasTestTag("settings-connection"))
        compose.onNodeWithTag("settings-connection").performClick()
        compose.onNodeWithTag("phone-connection").performScrollToNode(hasText("1. Sign in and get a code"))
        compose.onNodeWithText("1. Sign in and get a code").assertIsDisplayed()
        // The retained CI failure reached the English heading but could not find
        // this action. The old nested helper read the dialog's Android context.
        compose.onNodeWithTag("phone-connection").performScrollToNode(hasText("Sign in and get a code"))
        compose.onNodeWithText("Sign in and get a code").assertIsDisplayed()
        display("ar")
        val ar = strings("ar")
        compose.onNodeWithTag("phone-connection").performScrollToNode(hasText(ar("1. Sign in and get a code")))
        compose.onNodeWithText(ar("1. Sign in and get a code")).assertIsDisplayed()
        compose.onNodeWithTag("phone-connection").performScrollToNode(hasText(ar("Sign in and get a code")))
        compose.onNodeWithText(ar("Sign in and get a code")).assertIsDisplayed()
        compose.onNodeWithText("Sign in and get a code").assertDoesNotExist()
        assertEquals(LayoutDirection.Rtl, direction)
        display("en")
        compose.onNodeWithTag("phone-connection").performScrollToNode(hasText("Sign in and get a code"))
        compose.onNodeWithText("Sign in and get a code").assertIsDisplayed()
        assertEquals(LayoutDirection.Ltr, direction)
        assertEquals(scope, model.state.value.privateScope)
        assertEquals(originalProfile, model.state.value.profile)
        assertNull(model.state.value.connection)
        assertTrue(model.state.value.receipts.isEmpty())
        assertEquals(0, service.calls)
    }

    @Test fun languageButtons_preserveTheUnfinishedProfileAndPrivateScope() {
        val platform = if (Build.VERSION.SDK_INT >= 33) compose.activity.getSystemService(LocaleManager::class.java) else null
        val platformBefore = if (Build.VERSION.SDK_INT >= 33) platform?.applicationLocales?.toLanguageTags() else null
        val sharedPreferences = compose.activity.getSharedPreferences("career_display_language", Context.MODE_PRIVATE)
        val sharedBefore = sharedPreferences.all.toMap()
        val scope = model.state.value.privateScope
        compose.onNodeWithTag("navigation-profile").performClick()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText("First or single name") and hasSetTextAction())
        compose.onNode(hasText("First or single name") and hasSetTextAction()).performTextInput("Unfinished اسم")
        compose.onNodeWithTag("open-settings").performClick()
        compose.onNodeWithTag("settings-list").performScrollToNode(hasTestTag("language-ar"))
        compose.onNodeWithTag("language-ar").performClick()
        compose.waitUntil(5_000) { selection == LanguagePreference.ARABIC && direction == LayoutDirection.Rtl }
        compose.onNodeWithTag("language-ar").assertIsSelected()
        assertEquals(LanguagePreference.ARABIC, readLanguagePreference(context))
        assertEquals("Unfinished اسم", model.state.value.profile.firstName)
        assertEquals(scope, model.state.value.privateScope)
        mount()
        compose.waitUntil(5_000) { selection == LanguagePreference.ARABIC && direction == LayoutDirection.Rtl }
        compose.onNodeWithTag("open-settings").performClick()
        compose.onNodeWithTag("settings-list").performScrollToNode(hasTestTag("language-en"))
        compose.onNodeWithTag("language-en").performClick()
        compose.waitUntil(5_000) { selection == LanguagePreference.ENGLISH && direction == LayoutDirection.Ltr }
        compose.onNodeWithTag("language-en").assertIsSelected()
        compose.onNodeWithTag("navigation-profile").performClick()
        compose.onNodeWithTag("profile-list").performScrollToNode(hasText("First or single name") and hasSetTextAction())
        compose.onNode(hasText("First or single name") and hasSetTextAction()).assertTextContains("Unfinished اسم")
        assertEquals(scope, model.state.value.privateScope)
        assertTrue(model.state.value.profileDirty)
        assertEquals(sharedBefore, sharedPreferences.all.toMap())
        if (Build.VERSION.SDK_INT >= 33) assertEquals(platformBefore, platform?.applicationLocales?.toLanguageTags())
        assertTrue(model.state.value.receipts.isEmpty())
        assertEquals(0, service.calls)
    }
}
