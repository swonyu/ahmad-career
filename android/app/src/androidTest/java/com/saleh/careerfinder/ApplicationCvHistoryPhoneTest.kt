package com.saleh.careerfinder

import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Paint
import android.graphics.Rect as AndroidRect
import android.graphics.pdf.PdfDocument
import android.os.Build
import android.os.LocaleList
import android.os.SystemClock
import android.util.Base64
import android.view.WindowManager
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
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
import kotlinx.coroutines.awaitCancellation
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.time.Instant
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

/** Source-bound before/candidate phone evidence. Every service operation is handled in memory. */
class ApplicationCvHistoryPhoneTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private class MemoryStore : PrivateStore {
        val values = ConcurrentHashMap<String, String>()
        override fun read(name: String) = values[name]?.let(::JSONObject)
        override fun write(name: String, value: JSONObject) { values[name] = value.toString() }
        override fun remove(name: String) { values.remove(name) }
        override fun startFreshPreservingExisting() { error("No storage reset in this fixture") }
    }
    private class DisplayContext(base: Context, private val preferences: SharedPreferences) : ContextWrapper(base) {
        override fun getSharedPreferences(name: String, mode: Int): SharedPreferences =
            if (name == "career_display_language") preferences else super.getSharedPreferences(name, mode)
        override fun getSystemService(name: String): Any? =
            if (Build.VERSION.SDK_INT >= 33 && name == Context.LOCALE_SERVICE) null else super.getSystemService(name)
    }
    private class Service(private val connection: Connection, val jobs: List<Opportunity>, val a: Resume, val b: Resume) : CareerService {
        val calls = CopyOnWriteArrayList<String>()
        val plans = ConcurrentHashMap<String, String>()
        val attempts = CopyOnWriteArrayList<String>()
        var profile = ProfileDraft(firstName = "Synthetic", email = "cv-fixture@example.invalid", resume = a.copy(dataBase64 = null), revision = 1)
        val legacyID = "cv-legacy-no-evidence"
        init {
            attempts += JSONObject().put("id", legacyID).put("planId", "cv-legacy-plan")
                .put("title", "Older care role · دور سابق").put("company", "Example Care")
                .put("state", "cancelled").put("createdAt", "2026-11-20T12:00:00Z").put("evidenceMode", "test").put("provider", "lever").toString()
        }
        override suspend fun pair(origin: String, code: String): Connection = error("Pairing is denied")
        private fun profileJson() = profile.apiJson(includeLinkedIn = true).put("resume", profile.resume!!.metadata()).put("revision", profile.revision)
        private fun workspace() = JSONObject().put("ok", true).put("mode", "test").put("workspaceId", connection.workspaceId)
            .put("profile", profileJson()).put("jobs", JSONArray(jobs.map(Opportunity::privateJson)))
            .put("attempts", JSONArray(attempts.map(::JSONObject))).put("activePlanIds", JSONArray()).put("recoverablePlans", JSONArray())
            .put("capabilities", JSONObject().put("liveEnabled", false).put("linkedinProfile", true))
        override suspend fun request(connection: Connection, method: String, route: String, body: JSONObject?): JSONObject {
            require(connection == this.connection) { "Wrong synthetic account" }
            require(body?.toString()?.contains("manualResumeName") != true) { "A private filename must never enter service requests" }
            calls += method + " " + route
            return when {
                method == "GET" && route == "workspace" && body == null -> workspace()
                method == "PUT" && route == "profile" -> {
                    val request = requireNotNull(body)
                    require(profile.revision == 1 && request.getInt("expectedRevision") == 1)
                    val sent = request.getJSONObject("profile").getJSONObject("resume")
                    require(sent.getString("name") == b.name && sent.getString("mime") == "application/pdf")
                    val bytes = Base64.decode(sent.getString("dataBase64"), Base64.NO_WRAP)
                    try {
                        require(BoundaryPolicy.sha256(bytes) == b.sha256)
                        BoundaryPolicy.readPDF(bytes.inputStream())
                    } finally { bytes.fill(0) }
                    profile = profile.copy(resume = b.copy(dataBase64 = null), revision = 2)
                    JSONObject().put("ok", true).put("profile", profileJson())
                }
                method == "POST" && route == "prepare" -> {
                    val selected = body!!.requiredStrings("jobIds")
                    require(selected == listOf(jobs[profile.revision - 1].id))
                    val job = jobs.single { it.id == selected.single() }
                    val plan = JSONObject().put("id", "cv-plan-" + profile.revision).put("digest", "d".repeat(64))
                        .put("profileRevision", profile.revision).put("approvedAt", JSONObject.NULL)
                        .put("expiresAt", Instant.now().plusSeconds(600).toString())
                        .put("items", JSONArray(listOf(JSONObject().put("jobId", job.id).put("state", "ready")
                            .put("job", job.privateJson()).put("resume", profile.resume!!.metadata())
                            .put("payloadSummary", JSONObject().put("name", profile.firstName).put("email", profile.email)
                                .put("phone", "").put("website", "").put("linkedin", "").put("comments", "")))))
                    plans[plan.getString("id")] = plan.toString()
                    JSONObject().put("ok", true).put("plan", plan)
                }
                method == "POST" && route == "submit" -> {
                    require(body!!.getBoolean("approved") && body.getString("digest") == "d".repeat(64))
                    val plan = JSONObject(plans[body.getString("planId")] ?: error("No reviewed synthetic snapshot"))
                    val item = plan.getJSONArray("items").getJSONObject(0)
                    val job = item.getJSONObject("job")
                    val revision = plan.getInt("profileRevision")
                    val result = JSONObject().put("id", "cv-attempt-" + revision).put("planId", plan.getString("id"))
                        .put("jobId", job.getString("id")).put("title", job.getString("title")).put("company", job.getString("company"))
                        .put("state", if (revision == 1) "confirmed" else "uncertain")
                        .put("applicationId", if (revision == 1) "synthetic-test-reference" else "")
                        .put("createdAt", "2026-11-21T12:00:00Z").put("evidenceMode", "test").put("provider", "lever")
                        .put("resumeName", item.getJSONObject("resume").getString("name"))
                        .put("resumeSHA256", item.getJSONObject("resume").getString("sha256"))
                        .put("profileRevision", revision)
                    require(attempts.none { JSONObject(it).optString("id") == result.getString("id") })
                    attempts += result.toString()
                    JSONObject().put("ok", true).put("attempts", JSONArray(listOf(result)))
                }
                else -> error("Denied synthetic route")
            }
        }
    }
    private val store = MemoryStore()
    private var owner = ViewModelStore()
    private lateinit var model: CareerViewModel
    private lateinit var service: Service
    private lateinit var preferences: SharedPreferences
    private lateinit var displayContext: Context
    private lateinit var strings: CareerStrings
    private lateinit var windows: PhoneWindowObservation
    private val connection = Connection("https://cv-phone.example.invalid", "cv-phone-fixture", "synthetic-no-authority", "2099-12-31T00:00:00Z")
    private val jobs = listOf(
        Opportunity("cv-role-a", "https://example.invalid/cv-role-a", "Care role A · دور رعاية", "Example Care", "Amman · عمّان", "JO"),
        Opportunity("cv-role-b", "https://example.invalid/cv-role-b", "Care role B · دور رعاية", "Example Care", "Amman · عمّان", "JO"))
    private var renderedLanguage: String? = null
    private var renderedDirection: LayoutDirection? = null
    private var renderedScale = 0f
    private var lastKeyObservation: JSONObject? = null
    private var fieldBeforeInput: JSONObject? = null
    private val phase = InstrumentationRegistry.getArguments().getString("career_feature2_phase", "after")
        .also { require(it == "before" || it == "after") }

    private fun pdf(name: String): Resume {
        val document = PdfDocument()
        val bytes = try {
            val page = document.startPage(PdfDocument.PageInfo.Builder(240, 100, 1).create())
            page.canvas.drawText("Synthetic CV fixture " + name, 10f, 30f, Paint())
            document.finishPage(page)
            ByteArrayOutputStream().use { document.writeTo(it); it.toByteArray() }
        } finally { document.close() }
        try {
            BoundaryPolicy.readPDF(bytes.inputStream())
            return Resume(name, bytes.size.toLong(), BoundaryPolicy.sha256(bytes), Base64.encodeToString(bytes, Base64.NO_WRAP))
        } finally { bytes.fill(0) }
    }
    private fun makeModel(application: android.app.Application) {
        val discovery = object : DiscoveryService {
            override suspend fun sources() = DiscoveryCatalog(emptyList(), emptyList(), 4, "Synthetic CV fixture")
            override suspend fun search(filters: DiscoveryFilters, cursor: String?): DiscoveryPage = error("No discovery is allowed")
        }
        model = CareerViewModel(application, store, service, discoveryService = discovery, waitForPoll = { awaitCancellation() })
        owner.put("cv-phone-fixture", model)
    }
    @Before fun setupOnlySyntheticState() {
        windows = PhoneWindowObservation()
        service = Service(connection, jobs, pdf("CV-A.pdf"), pdf("CV-B.pdf"))
        val seed = JSONObject().put("schema", 1).put("profile", service.profile.privateJson())
            .put("jobs", JSONArray(jobs.map(Opportunity::privateJson))).put("selected", JSONArray(listOf(jobs[0].id)))
        store.write("connection", connection.toJson())
        store.write("workspace-" + BoundaryPolicy.workspaceKey(connection.origin, connection.workspaceId), seed)
        compose.activityRule.scenario.onActivity { activity ->
            activity.enableEdgeToEdge()
            activity.window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
            preferences = activity.getSharedPreferences("cv-history-" + UUID.randomUUID(), Context.MODE_PRIVATE)
            displayContext = DisplayContext(activity, preferences)
            makeModel(activity.application)
        }
    }
    @After fun cleanupOnlyOwnedState() {
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
                        SideEffect { renderedLanguage = current.locale.language; renderedDirection = direction; renderedScale = scale }
                        CareerTheme { CareerApp(model) }
                    }
                }
            }
        }
        compose.waitUntil(5_000) { model.state.value.loaded && !model.state.value.busy && renderedLanguage == language }
        assertNull(model.state.value.error)
        assertEquals(if (language == "ar") LayoutDirection.Rtl else LayoutDirection.Ltr, renderedDirection)
        assertTrue("Keep at least180% text", renderedScale >= 1.79f)
    }
    private fun recreateModelAndView(language: String) {
        compose.activityRule.scenario.onActivity { activity -> activity.setContent {}; owner.clear() }
        compose.waitForIdle()
        owner = ViewModelStore()
        compose.activityRule.scenario.onActivity { makeModel(it.application) }
        mount(language)
    }
    private fun tab(name: String) = compose.onNodeWithTag("navigation-" + name).revealNavigationTab().performClick()
    private fun reveal(listTag: String, matcher: SemanticsMatcher): SemanticsNodeInteraction {
        compose.onNodeWithTag(listTag).performScrollToNode(matcher)
        return compose.onNode(matcher).also { assertFullyVisible(it) }
    }
    private fun click(listTag: String, matcher: SemanticsMatcher) { reveal(listTag, matcher).performClick() }
    private fun detailsKey(prefix: String, id: String) = prefix + "-" + model.state.value.privateScope + "-" + id
    private fun showDetails(listTag: String, key: String) {
        click(listTag, hasTestTag("application-cv-details-" + key))
        compose.onNodeWithTag("application-cv-details-" + key).assert(SemanticsMatcher.expectValue(
            SemanticsProperties.StateDescription, strings("Expanded")))
    }
    private fun cvTarget(key: String) = hasTestTag("application-cv-filename-" + key)
    private fun prepareVisible(expectedRevision: Int) {
        click("apply-list", hasText(strings("Prepare application review")) and hasClickAction())
        compose.waitUntil(5_000) { !model.state.value.busy && model.state.value.plan?.profileRevision == expectedRevision }
        assertNull(model.state.value.error)
    }
    private fun approveVisible(expectedAttempt: String) {
        val approval = hasText(strings("I reviewed these details and authorize sending the ready applications to the employers shown above.")) and hasClickAction()
        click("apply-list", approval)
        compose.onNode(approval).assertIsOn()
        click("apply-list", hasText(strings("Run approved test applications")) and hasClickAction())
        compose.waitUntil(5_000) { !model.state.value.busy && model.state.value.receipts.any { it.id == expectedAttempt } }
        assertNull(model.state.value.error)
        assertTrue(model.state.value.receipts.none(ApplicationReceipt::verified))
    }
    private fun receiptEvidence(id: String): JSONObject =
        WorkspaceStorage.receiptJson(model.state.value.receipts.single { it.id == id })

    @Test fun englishCvHistory_preservesReviewedFilenameAndPrivateManualNote() = exercise("en")
    @Test fun arabicCvHistory_preservesReviewedFilenameAndPrivateManualNote() = exercise("ar")

    private fun exercise(language: String) {
        mount(language)
        tab("apply")
        prepareVisible(1)
        val firstPlan = checkNotNull(model.state.value.plan)
        assertEquals("CV-A.pdf", firstPlan.items.single().resume!!.name)
        val firstKey = detailsKey("review", firstPlan.id + "-" + jobs[0].id)
        if (phase == "after") showDetails("apply-list", firstKey)
        capture(language, "review-a", "apply-list", if (phase == "after") cvTarget(firstKey) else hasText("CV-A.pdf"))
        approveVisible("cv-attempt-1")

        compose.runOnIdle {
            model.editProfile { it.copy(resume = service.b, removeResume = false) }
            model.saveProfile()
        }
        compose.waitUntil(5_000) { !model.state.value.busy && !model.state.value.profileDirty && model.state.value.profile.revision == 2 }
        assertNull(model.state.value.error)
        recreateModelAndView(language)
        assertEquals("CV-B.pdf", model.state.value.profile.resume!!.name)
        tab("receipts")
        val aKey = detailsKey("receipt", "cv-attempt-1")
        if (phase == "after") {
            showDetails("receipts-list", aKey)
            assertEquals("CV-A.pdf", receiptEvidence("cv-attempt-1").getString("resumeName"))
            assertEquals(1, receiptEvidence("cv-attempt-1").getInt("profileRevision"))
        } else compose.onNodeWithTag("application-cv-details-" + aKey).assertDoesNotExist()
        capture(language, "receipt-a-after-profile-b", "receipts-list", if (phase == "after") cvTarget(aKey) else hasText(jobs[0].title))

        compose.runOnIdle { model.toggleJob(jobs[0].id); model.toggleJob(jobs[1].id) }
        assertEquals(setOf(jobs[1].id), model.state.value.selected)
        tab("apply")
        prepareVisible(2)
        val secondPlan = checkNotNull(model.state.value.plan)
        assertEquals("CV-B.pdf", secondPlan.items.single().resume!!.name)
        assertEquals("CV-A.pdf", firstPlan.items.single().resume!!.name)
        val secondKey = detailsKey("review", secondPlan.id + "-" + jobs[1].id)
        if (phase == "after") showDetails("apply-list", secondKey)
        capture(language, "review-b", "apply-list", if (phase == "after") cvTarget(secondKey) else hasText("CV-B.pdf"))
        approveVisible("cv-attempt-2")
        assertEquals("uncertain", model.state.value.receipts.single { it.id == "cv-attempt-2" }.state)
        tab("receipts")
        val bKey = detailsKey("receipt", "cv-attempt-2")
        if (phase == "after") showDetails("receipts-list", bKey)
        capture(language, "uncertain-b", "receipts-list", if (phase == "after") cvTarget(bKey) else hasText(jobs[1].title))
        val oldKey = detailsKey("receipt", service.legacyID)
        if (phase == "after") {
            showDetails("receipts-list", oldKey)
            compose.onNode(cvTarget(oldKey)).assertTextEquals(strings("CV not recorded"))
            assertFalse(receiptEvidence(service.legacyID).has("resumeName"))
        }
        capture(language, "legacy-no-cv", "receipts-list", if (phase == "after") cvTarget(oldKey) else hasText("Older care role · دور سابق"))

        compose.runOnIdle { model.openApplicationRecord(jobs[0], model.state.value.privateScope) }
        compose.waitUntil(5_000) { model.state.value.applicationRecordEditor != null }
        if (phase == "before") {
            compose.onNodeWithTag("application-record-manual-cv").assertDoesNotExist()
            capture(language, "manual-record-no-field", "application-record-editor", hasText(strings("Stage")))
            // The three durable prepare/profile intents now reconcile through workspace reads.
            assertEquals(7, service.calls.count { it == "GET workspace" })
            assertServiceCounts()
            return
        }
        val field = hasTestTag("application-record-manual-cv") and hasSetTextAction()
        reveal("application-record-editor", field).performClick()
        val key = observeRealKeyboardWithinFiveSeconds()
        lastKeyObservation = key
        if (!key.optBoolean("readyWithinFiveSeconds")) {
            retain(language, "manual-keyboard-unready", JSONObject().put("keyboard", key))
            fail("A real visible keyboard key must be observed within five seconds before entering the manual filename")
            return
        }
        val focus = observeField(field, "application-record-editor")
        fieldBeforeInput = focus
        if (!focus.getBoolean("focused") || !focus.getBoolean("enabled") || !focus.getBoolean("wholeFieldAboveKeyboard")) {
            retain(language, "manual-field-obscured-before-input", JSONObject().put("field", focus))
            fail("The touched filename field must be focused, enabled and wholly above the keyboard before input")
            return
        }
        compose.onNode(field).performTextInput("Manual-CV-A.pdf")
        compose.onNode(field).assertTextContains("Manual-CV-A.pdf")
        capture(language, "manual-filename-keyboard", "application-record-editor", field, allowIme = true)
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK)
        compose.waitUntil(5_000) { !windows.imeVisible() }
        val save = compose.onNode(hasText(strings("Save record on this phone")) and hasClickAction())
        assertFullyVisible(save); save.performClick()
        compose.waitUntil(5_000) { !model.state.value.busy && model.state.value.applicationRecordEditor == null }
        assertNull(model.state.value.error)
        compose.runOnIdle { model.openApplicationRecord(jobs[0], model.state.value.privateScope) }
        val record = checkNotNull(model.state.value.recordFor(jobs[0]))
        val manualKey = detailsKey("record", record.current.id)
        showDetails("application-record-editor", manualKey)
        capture(language, "manual-saved", "application-record-editor", cvTarget(manualKey))
        compose.onNode(cvTarget(manualKey)).assertTextEquals("Manual-CV-A.pdf")
        assertFalse(record.appliedElsewhere)
        assertEquals(2, service.calls.count { it == "POST submit" })
        compose.runOnIdle { model.closeApplicationRecord() }
        recreateModelAndView(language)
        compose.runOnIdle { model.openApplicationRecord(jobs[0], model.state.value.privateScope) }
        val restored = checkNotNull(model.state.value.recordFor(jobs[0]))
        val restoredKey = detailsKey("record", restored.current.id)
        showDetails("application-record-editor", restoredKey)
        capture(language, "manual-restored", "application-record-editor", cvTarget(restoredKey))
        compose.onNode(cvTarget(restoredKey)).assertTextEquals("Manual-CV-A.pdf")
        assertEquals("CV-A.pdf", receiptEvidence("cv-attempt-1").getString("resumeName"))
        assertEquals("CV-B.pdf", model.state.value.profile.resume!!.name)
        assertEquals(8, service.calls.count { it == "GET workspace" })
        assertServiceCounts()
    }
    private fun assertServiceCounts() {
        assertEquals(2, service.calls.count { it == "POST prepare" })
        assertEquals(2, service.calls.count { it == "POST submit" })
        assertEquals(1, service.calls.count { it == "PUT profile" })
        assertTrue(service.calls.all { it in setOf("GET workspace", "POST prepare", "POST submit", "PUT profile") })
        assertTrue(model.state.value.receipts.none(ApplicationReceipt::verified))
    }
    private fun observeField(matcher: SemanticsMatcher, listTag: String): JSONObject {
        compose.waitForIdle()
        val nodes = compose.onAllNodes(matcher).fetchSemanticsNodes()
        val node = nodes.singleOrNull()
        val root = node?.let { val p = it.positionInRoot; Rect(p.x, p.y, p.x + it.size.width, p.y + it.size.height) }
        val screen = node?.let { val p = it.positionOnScreen; Rect(p.x, p.y, p.x + it.size.width, p.y + it.size.height) }
        val viewport = compose.onNodeWithTag(listTag).fetchSemanticsNode().boundsInRoot
        // The record form is a Dialog with its own window. Observe the real IME
        // window in screen coordinates instead of borrowing the activity's insets.
        val imeWindows = InstrumentationRegistry.getInstrumentation().uiAutomation.windows
            .filter { it.type == AccessibilityWindowInfo.TYPE_INPUT_METHOD }
            .map { window -> AndroidRect().also(window::getBoundsInScreen) }.filterNot(AndroidRect::isEmpty)
        val imeBounds = imeWindows.singleOrNull()
        val imeVisible = imeBounds != null
        val imeTop = imeBounds?.top ?: 0
        val screenWidth = compose.activity.resources.displayMetrics.widthPixels
        val parentFit = node != null && root != null && node.layoutInfo.isPlaced && node.layoutInfo.coordinates.isAttached &&
            containsVisibleRect(node.boundsInRoot, root) && containsVisibleRect(viewport, root)
        val focused = node != null && node.config.contains(SemanticsProperties.Focused) && node.config[SemanticsProperties.Focused]
        return JSONObject().put("nodeCount", nodes.size).put("fullBoundsInRoot", root?.json() ?: JSONObject.NULL)
            .put("fullBoundsOnScreen", screen?.json() ?: JSONObject.NULL).put("listBoundsInRoot", viewport.json())
            .put("focused", focused).put("enabled", node != null && !node.config.contains(SemanticsProperties.Disabled))
            .put("imeTop", imeTop).put("imeVisible", imeVisible).put("imeWindowCount", imeWindows.size)
            .put("imeBoundsOnScreen", imeBounds?.let { JSONArray(listOf(it.left, it.top, it.right, it.bottom)) } ?: JSONObject.NULL)
            .put("parentBoundsFit", parentFit)
            .put("wholeFieldAboveKeyboard", imeVisible && parentFit && screen != null &&
                containsVisibleRect(Rect(0f, 0f, screenWidth.toFloat(), imeTop.toFloat()), screen))
    }
    private fun capture(language: String, name: String, listTag: String, matcher: SemanticsMatcher, allowIme: Boolean = false) {
        compose.onNodeWithTag(listTag).performScrollToNode(matcher)
        compose.waitForIdle()
        val nodes = compose.onAllNodes(matcher).fetchSemanticsNodes()
        val node = nodes.singleOrNull()
        val full = node?.let { val p = it.positionInRoot; Rect(p.x, p.y, p.x + it.size.width, p.y + it.size.height) }
        val viewport = compose.onNodeWithTag(listTag).fetchSemanticsNode().boundsInRoot
        val fits = node != null && full != null && node.layoutInfo.isPlaced && node.layoutInfo.coordinates.isAttached &&
            containsVisibleRect(node.boundsInRoot, full) && containsVisibleRect(viewport, full)
        val evidence = JSONObject().put("targetCount", nodes.size).put("fullTargetBounds", full?.json() ?: JSONObject.NULL)
            .put("clippedTargetBounds", node?.boundsInRoot?.json() ?: JSONObject.NULL).put("listBounds", viewport.json())
            .put("wholeTargetVisible", fits).put("imeVisible", windows.imeVisible())
            .put("allowImeForThisCapture", allowIme).put("keyboard", lastKeyObservation ?: JSONObject.NULL)
        if (allowIme) evidence.put("fieldAboveKeyboard", observeField(matcher, listTag))
        retain(language, name, evidence)
        if (allowIme) assertTrue("The complete filename field must remain above the IME", evidence.getJSONObject("fieldAboveKeyboard").getBoolean("wholeFieldAboveKeyboard"))
        assertTrue("The complete title, filename, count or field target must fit its actual visible list", fits)
        if (!allowIme) assertFalse("Non-keyboard evidence must not be obscured by an IME", evidence.getBoolean("imeVisible"))
    }
    private fun retain(language: String, name: String, evidence: JSONObject) {
        compose.waitForIdle()
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val bitmap = checkNotNull(instrumentation.uiAutomation.takeScreenshot())
        val directory = File(instrumentation.targetContext.cacheDir, "application-cv-history-evidence").apply { mkdirs() }
        val prefix = "$language-$phase-$name"
        evidence.put("phase", phase).put("language", language).put("fontScale", renderedScale).put("layoutDirection", renderedDirection.toString())
            .put("currentProfileFilename", model.state.value.profile.resume?.name ?: JSONObject.NULL)
            .put("currentProfileRevision", model.state.value.profile.revision)
            .put("receiptMetadata", JSONArray(model.state.value.receipts.map(WorkspaceStorage::receiptJson)))
            .put("serviceCalls", JSONArray(service.calls.toList())).put("allOutcomesSynthetic", true)
            .put("verifiedLiveReceiptCount", model.state.value.receipts.count(ApplicationReceipt::verified))
            .put("fieldBeforeInput", fieldBeforeInput ?: JSONObject.NULL)
            .put("recreationScope", "Actual ViewModel and Compose content recreated with the same isolated private store; not process restart")
            .put("sourceCommitClaimedByRunner", InstrumentationRegistry.getArguments().getString("career_source_sha", "not supplied"))
            .put("screenshotWidth", bitmap.width).put("screenshotHeight", bitmap.height)
        try {
            FileOutputStream(File(directory, "$prefix.png")).use { output ->
                check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)); output.fd.sync()
            }
        } finally { bitmap.recycle() }
        durableText(File(directory, "$prefix.json"), evidence.toString(2))
        val roots = compose.onAllNodes(isRoot(), useUnmergedTree = true)
        val rootCount = roots.fetchSemanticsNodes().size
        check(rootCount > 0)
        durableText(File(directory, "$prefix-semantics.txt"), (0 until rootCount).joinToString("\n\n") { index ->
            "ROOT " + index + "\n" + roots[index].printToString(Int.MAX_VALUE)
        })
    }
    private fun durableText(file: File, text: String) {
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
