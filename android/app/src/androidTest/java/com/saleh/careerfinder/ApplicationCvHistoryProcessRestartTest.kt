package com.saleh.careerfinder

import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.os.Build
import android.os.LocaleList
import android.util.Base64
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


/** Two distinct target processes, one real isolated encrypted store, no network implementation.
 * Phase 1 creates attempt A through actual review/approval/test-submit, saves profile B,
 * then creates an uncertain B test attempt. The pre-existing stopped record has no CV evidence.
 * Phase 2 must read that disk state; it cannot seed or obtain a service workspace.
 * The wrapper, not an Activity recreation, supplies the force-stop/process boundary.
 */
class ApplicationCvHistoryProcessRestartTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private class DisplayContext(base: Context, private val preferences: SharedPreferences) : ContextWrapper(base) {
        override fun getSharedPreferences(name: String, mode: Int): SharedPreferences =
            if (name == "career_display_language") preferences else super.getSharedPreferences(name, mode)
        override fun getSystemService(name: String): Any? =
            if (Build.VERSION.SDK_INT >= 33 && name == Context.LOCALE_SERVICE) null else super.getSystemService(name)
    }
    private class SeedService(private val connection: Connection, val jobs: List<Opportunity>, val a: Resume, val b: Resume) : CareerService {
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

    private val arguments = InstrumentationRegistry.getArguments()
    private val phase = requireNotNull(arguments.getString("career_cv_restart_phase")).also {
        require(it == "seed" || it == "restore")
    }
    private val namespace = requireNotNull(arguments.getString("career_cv_restart_namespace")).also {
        require(it.matches(Regex("cv-restart-[a-f0-9]{32}")))
    }
    private val invocationNonce = UUID.randomUUID().toString()
    private val processID = android.os.Process.myPid()
    private val processStartElapsedMillis = android.os.Process.getStartElapsedRealtime().also { require(it >= 0) }
    private val connection = Connection("https://cv-restart.example.invalid", "cv-restart-fixture",
        "synthetic-no-authority", "2099-12-31T00:00:00Z")
    private val jobs = listOf(
        Opportunity("cv-role-a", "https://example.invalid/cv-role-a", "Care role A · دور رعاية", "Example Care", "Amman · عمّان", "JO"),
        Opportunity("cv-role-b", "https://example.invalid/cv-role-b", "Care role B · دور رعاية", "Example Care", "Amman · عمّان", "JO"))
    private val workspaceName = "workspace-" + BoundaryPolicy.workspaceKey(connection.origin, connection.workspaceId)
    private var owner = ViewModelStore()
    private lateinit var vault: SecureVault
    private lateinit var vaultRoot: File
    private lateinit var encryptedWorkspace: File
    private lateinit var evidenceDirectory: File
    private lateinit var model: CareerViewModel
    private lateinit var activeService: CareerService
    private var seedService: SeedService? = null
    private val deniedCalls = CopyOnWriteArrayList<String>()
    private lateinit var preferences: SharedPreferences
    private lateinit var displayContext: Context
    private lateinit var strings: CareerStrings
    private lateinit var windows: PhoneWindowObservation
    private var renderedLanguage: String? = null
    private var renderedDirection: LayoutDirection? = null
    private var renderedScale = 0f
    private var seedProof: JSONObject? = null
    private val observedStatusLabels = JSONArray()
    private val sourceClaim = requireNotNull(arguments.getString("career_source_sha")).also {
        require(it.matches(Regex("[a-f0-9]{40}")))
    }

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

    private fun shaFile(file: File): String {
        require(file.isFile && file.length() in 1L..10_485_760L)
        val bytes = file.readBytes()
        return try { BoundaryPolicy.sha256(bytes) } finally { bytes.fill(0) }
    }
    private fun writeDurably(file: File, text: String) {
        require(!file.exists()) { "Never overwrite earlier process evidence" }
        FileOutputStream(file).use { output -> output.write(text.toByteArray(Charsets.UTF_8)); output.fd.sync() }
    }
    private fun makeModel(application: android.app.Application) {
        val discovery = object : DiscoveryService {
            override suspend fun sources() = DiscoveryCatalog(emptyList(), emptyList(), 4, "Synthetic restart fixture")
            override suspend fun search(filters: DiscoveryFilters, cursor: String?): DiscoveryPage = error("Discovery denied")
        }
        model = CareerViewModel(application, vault, activeService, discoveryService = discovery,
            waitForPoll = { awaitCancellation() })
        owner.put("cv-restart-fixture", model)
    }
    @Before fun prepareOwnedPhaseOnly() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        require(context.packageName == "com.saleh.careerfinder.preview")
        windows = PhoneWindowObservation()
        vaultRoot = File(context.noBackupFilesDir, "career-private-" + namespace)
        encryptedWorkspace = File(vaultRoot, workspaceName + ".enc")
        evidenceDirectory = File(context.cacheDir, "application-cv-restart-evidence-" + namespace)
        val alias = "career-finder-v1-" + namespace
        val keys = java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (phase == "seed") {
            require(!vaultRoot.exists() && !evidenceDirectory.exists() && !keys.containsAlias(alias)) {
                "A seed phase requires an entirely fresh owned namespace"
            }
            require(evidenceDirectory.mkdirs())
            vault = SecureVault(context, namespace)
            val service = SeedService(connection, jobs, pdf("CV-A.pdf"), pdf("CV-B.pdf"))
            seedService = service
            activeService = service
            // Only base profile A/jobs are seeded on disk. A/B attempts require actual review and explicit test approval.
            val base = JSONObject().put("schema", 1).put("profile", service.profile.privateJson())
                .put("jobs", JSONArray(jobs.map(Opportunity::privateJson)))
                .put("selected", JSONArray(listOf(jobs[0].id)))
            vault.write("connection", connection.toJson())
            vault.write(workspaceName, base)
        } else {
            require(vaultRoot.isDirectory && evidenceDirectory.isDirectory && keys.containsAlias(alias)) {
                "Restore must use the existing encrypted namespace and key"
            }
            val proofFile = File(evidenceDirectory, "seed-process.json")
            require(proofFile.isFile && proofFile.length() in 1L..65_536L)
            val proof = JSONObject(proofFile.readText())
            require(proof.getInt("schema") == 1 && proof.getString("namespace") == namespace)
            require(proof.getString("sourceCommitClaimedByRunner") == sourceClaim)
            require(proof.getString("phase") == "seed" && proof.getBoolean("realModelTransitionsCompleted"))
            require(proof.getString("invocationNonce") != invocationNonce)
            require(proof.getInt("processID") != processID || proof.getLong("processStartElapsedMillis") != processStartElapsedMillis) {
                "This is not a fresh application process"
            }
            require(shaFile(encryptedWorkspace) == proof.getString("encryptedWorkspaceSHA256")) {
                "Restore cannot replace or reseed the encrypted workspace"
            }
            seedProof = proof
            vault = SecureVault(context, namespace)
            activeService = object : CareerService {
                override suspend fun pair(origin: String, code: String): Connection = error("Pairing denied")
                override suspend fun request(connection: Connection, method: String, route: String, body: JSONObject?): JSONObject {
                    deniedCalls += method + " " + route
                    require(connection == this@ApplicationCvHistoryProcessRestartTest.connection)
                    require(method == "GET" && route == "workspace" && body == null) { "No mutation after restart" }
                    throw java.io.IOException("Synthetic offline restart observation")
                }
            }
        }
        compose.activityRule.scenario.onActivity { activity ->
            activity.enableEdgeToEdge()
            activity.window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
            preferences = activity.getSharedPreferences("cv-restart-display-" + namespace, Context.MODE_PRIVATE)
            displayContext = DisplayContext(activity, preferences)
            makeModel(activity.application)
        }
    }
    @After fun closeOwnedViewOnly() {
        compose.runOnIdle { owner.clear() }
        if (::windows.isInitialized) windows.close()
        // The synthetic namespace/evidence remain for transfer/recovery. No default storage or other key is touched.
    }
    private fun mount(language: String, restoring: Boolean) {
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
        assertFalse(model.state.value.storageBlocked)
        if (!restoring) assertNull(model.state.value.error)
        assertEquals(if (language == "ar") LayoutDirection.Rtl else LayoutDirection.Ltr, renderedDirection)
        assertTrue("Keep at least 180% text", renderedScale >= 1.79f)
        if (model.state.value.error != null) {
            require(restoring)
            val dismiss = compose.onNodeWithContentDescription(strings("Dismiss message"))
            assertFullyVisible(dismiss)
            dismiss.performClick()
            compose.waitUntil(5_000) { model.state.value.error == null }
        }
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


    private fun observePreparedNoticeAndWarning() {
        assertEquals("ar", renderedLanguage)
        assertEquals("Review prepared. Nothing has been submitted.", model.state.value.notice)
        assertTrue(model.state.value.testService)
        val viewport = compose.onNodeWithTag("workspace-messages").fetchSemanticsNode()
        val scroll = viewport.config[SemanticsProperties.VerticalScrollAxisRange]
        assertEquals("The current notice must start visible without a test scroll", 0f, scroll.value(), 0.5f)
        val notice = hasText(strings("Review prepared. Nothing has been submitted."))
        val dismiss = hasContentDescription(strings("Dismiss message")) and hasClickAction()
        compose.onNode(dismiss).assertIsEnabled()
        capture("ar", "prepared-status-banner", "workspace-messages", notice, scrollToTarget = false, companion = dismiss)
        val warning = hasText(strings("Test service: applications and receipts are simulated."))
        compose.onNode(warning).performScrollTo()
        capture("ar", "test-service-warning", "workspace-messages", warning, scrollToTarget = false)
        assertEquals("The persistent test warning must not erase the current notice",
            "Review prepared. Nothing has been submitted.", model.state.value.notice)
        val close = compose.onNode(dismiss).performScrollTo()
        assertFullyVisible(close)
        close.assertIsEnabled().performClick()
        compose.waitUntil(5_000) { model.state.value.notice == null }
        assertTrue("Dismissing a current notice must retain the test-service warning", model.state.value.testService)
    }
    private fun assertRestoredFacts() {
        assertEquals(connection, model.state.value.connection)
        assertEquals("CV-B.pdf", model.state.value.profile.resume?.name)
        assertEquals(2, model.state.value.profile.revision)
        assertFalse(model.state.value.profileDirty)
        val expected = mapOf(
            "cv-attempt-1" to Triple("confirmed", "CV-A.pdf", 1),
            "cv-attempt-2" to Triple("uncertain", "CV-B.pdf", 2),
            "cv-legacy-no-evidence" to Triple("cancelled", null, null))
        assertEquals(expected.keys, model.state.value.receipts.map(ApplicationReceipt::id).toSet())
        assertEquals(expected.size, model.state.value.receipts.size)
        val decoded = WorkspaceStorage.decode(vault.read(workspaceName), connection)
        assertEquals("CV-B.pdf", decoded.profile.resume?.name)
        assertEquals(2, decoded.profile.revision)
        assertEquals(expected.size, decoded.receipts.size)
        for ((id, value) in expected) {
            for (receipt in listOf(model.state.value.receipts.single { it.id == id }, decoded.receipts.single { it.id == id })) {
                assertEquals(value.first, receipt.state)
                assertEquals(value.second, receipt.resumeName)
                assertEquals(value.third, receipt.profileRevision)
                assertEquals("test", receipt.evidenceMode)
                assertTrue(receipt.testMode)
                assertFalse(receipt.verified)
            }
        }
        assertTrue(model.state.value.receipts.none(ApplicationReceipt::verified))
    }
    private fun observeDistinctReceiptStatuses(language: String) {
        tab("receipts")
        val cases = listOf(
            Triple("cv-attempt-1", "confirmed", "Confirmed"),
            Triple("cv-attempt-2", "uncertain", "Outcome uncertain"),
            Triple("cv-legacy-no-evidence", "cancelled", "Stopped"))
        val labels = cases.map { strings.format("Test receipt · {0}", listOf(strings(it.third))) }
        assertEquals("Different outcomes must retain different displayed labels", cases.size, labels.toSet().size)
        for ((index, value) in cases.withIndex()) {
            val receipt = model.state.value.receipts.single { it.id == value.first }
            assertEquals(value.second, receipt.state)
            assertTrue(receipt.testMode)
            assertFalse(receipt.verified)
            val expectedLabel = labels[index]
            if (language == "ar") {
                assertNotEquals("An Arabic status must not retain the English leaf", value.third, strings(value.third))
                assertFalse("Known Arabic test-status labels must not contain English letters",
                    expectedLabel.any { it in 'A'..'Z' || it in 'a'..'z' })
            }
            val matcher = hasText(expectedLabel) and hasAnyAncestor(hasTestTag("receipts-list"))
            reveal("receipts-list", matcher).assertTextEquals(expectedLabel)
            observedStatusLabels.put(JSONObject().put("language", language).put("receiptID", value.first)
                .put("state", value.second).put("displayedLabel", expectedLabel).put("testMode", true).put("verified", false))
            capture(language, "status-" + value.second, "receipts-list", matcher)
        }
    }
    private fun showOldAndCurrent(language: String) {
        tab("receipts")
        val key = detailsKey("receipt", "cv-attempt-1")
        showDetails("receipts-list", key)
        compose.onNode(cvTarget(key)).assertTextEquals("CV-A.pdf")
        capture(language, "historical-a", "receipts-list", cvTarget(key))
        tab("profile")
        capture(language, "current-b", "profile-list", hasText("CV-B.pdf"))
        compose.onNode(hasText("CV-B.pdf")).assertTextEquals("CV-B.pdf")
    }
    @Test fun seedReviewedA_thenSaveProfileBInEncryptedStore() {
        require(phase == "seed")
        mount("ar", restoring = false)
        tab("apply")
        prepareVisible(1)
        observePreparedNoticeAndWarning()
        val firstPlan = checkNotNull(model.state.value.plan)
        assertEquals("CV-A.pdf", firstPlan.items.single().resume?.name)
        showDetails("apply-list", detailsKey("review", firstPlan.id + "-" + jobs[0].id))
        compose.onNode(cvTarget(detailsKey("review", firstPlan.id + "-" + jobs[0].id))).assertTextEquals("CV-A.pdf")
        reveal("apply-list", hasText(strings("Prepared draft"))).assertTextEquals(strings("Prepared draft"))
        approveVisible("cv-attempt-1")
        val service = requireNotNull(seedService)
        compose.runOnIdle {
            model.editProfile { it.copy(resume = service.b, removeResume = false) }
            model.saveProfile()
        }
        compose.waitUntil(5_000) { !model.state.value.busy && !model.state.value.profileDirty && model.state.value.profile.revision == 2 }
        assertNull(model.state.value.error)
        assertEquals("CV-A.pdf", firstPlan.items.single().resume?.name)
        compose.runOnIdle { model.toggleJob(jobs[0].id); model.toggleJob(jobs[1].id) }
        assertEquals(setOf(jobs[1].id), model.state.value.selected)
        tab("apply")
        prepareVisible(2)
        val secondPlan = checkNotNull(model.state.value.plan)
        assertEquals("CV-B.pdf", secondPlan.items.single().resume?.name)
        assertEquals("CV-A.pdf", firstPlan.items.single().resume?.name)
        val secondKey = detailsKey("review", secondPlan.id + "-" + jobs[1].id)
        showDetails("apply-list", secondKey)
        compose.onNode(cvTarget(secondKey)).assertTextEquals("CV-B.pdf")
        reveal("apply-list", hasText(strings("Prepared draft"))).assertTextEquals(strings("Prepared draft"))
        approveVisible("cv-attempt-2")
        assertRestoredFacts()
        // Each prepare and the profile save now reconcile its durable mutation intent.
        assertEquals(6, service.calls.count { it == "GET workspace" })
        assertEquals(2, service.calls.count { it == "POST prepare" })
        assertEquals(2, service.calls.count { it == "POST submit" })
        assertEquals(1, service.calls.count { it == "PUT profile" })
        assertEquals(11, service.calls.size)
        showOldAndCurrent("ar")
        assertRestoredFacts()
        val proof = processProof().put("realModelTransitionsCompleted", true)
            .put("encryptedWorkspaceSHA256", shaFile(encryptedWorkspace))
            .put("receiptA", receiptEvidence("cv-attempt-1"))
            .put("receiptB", receiptEvidence("cv-attempt-2"))
            .put("legacyReceipt", receiptEvidence("cv-legacy-no-evidence"))
            .put("currentProfileFilename", model.state.value.profile.resume?.name)
            .put("currentProfileRevision", model.state.value.profile.revision)
        writeDurably(File(evidenceDirectory, "seed-process.json"), proof.toString(2))
        println("CAREER_CV_PROCESS_SEED " + proof.toString())
    }
    @Test fun restoreHistoricalA_afterOwnedPackageProcessRestart() {
        require(phase == "restore")
        mount("en", restoring = true)
        assertRestoredFacts()
        assertEquals(listOf("GET workspace"), deniedCalls.toList())
        assertEquals(seedProof!!.getString("encryptedWorkspaceSHA256"), shaFile(encryptedWorkspace))
        showOldAndCurrent("en")
        observeDistinctReceiptStatuses("en")
        // The same restored model renders both languages; there is only one process boundary.
        compose.activityRule.scenario.onActivity { it.setContent {} }
        compose.waitForIdle()
        mount("ar", restoring = true)
        assertRestoredFacts()
        showOldAndCurrent("ar")
        observeDistinctReceiptStatuses("ar")
        assertEquals(6, observedStatusLabels.length())
        assertEquals(listOf("GET workspace"), deniedCalls.toList())
        assertEquals(seedProof!!.getString("encryptedWorkspaceSHA256"), shaFile(encryptedWorkspace))
        val proof = processProof().put("seedProcessID", seedProof!!.getInt("processID"))
            .put("seedProcessStartElapsedMillis", seedProof!!.getLong("processStartElapsedMillis"))
            .put("encryptedWorkspaceSHA256", shaFile(encryptedWorkspace))
            .put("receiptA", receiptEvidence("cv-attempt-1"))
            .put("receiptB", receiptEvidence("cv-attempt-2"))
            .put("legacyReceipt", receiptEvidence("cv-legacy-no-evidence"))
            .put("currentProfileFilename", model.state.value.profile.resume?.name)
            .put("currentProfileRevision", model.state.value.profile.revision)
            .put("restoredWithoutSeedOrServiceResponse", true)
        writeDurably(File(evidenceDirectory, "restored-process.json"), proof.toString(2))
        println("CAREER_CV_PROCESS_RESTORED " + proof.toString())
    }
    private fun processProof() = JSONObject().put("schema", 1).put("phase", phase).put("namespace", namespace)
        .put("processID", processID).put("processStartElapsedMillis", processStartElapsedMillis).put("invocationNonce", invocationNonce)
        .put("sourceCommitClaimedByRunner", sourceClaim).put("allOutcomesSynthetic", true)
        .put("verifiedLiveReceiptCount", model.state.value.receipts.count(ApplicationReceipt::verified))
        .put("serviceCalls", JSONArray(seedService?.calls?.toList() ?: deniedCalls.toList()))
        .put("observedStatusLabels", observedStatusLabels)
    private fun capture(language: String, name: String, listTag: String, matcher: SemanticsMatcher,
        scrollToTarget: Boolean = true, companion: SemanticsMatcher? = null) {
        if (scrollToTarget) compose.onNodeWithTag(listTag).performScrollToNode(matcher)
        compose.waitForIdle()
        val nodes = compose.onAllNodes(matcher).fetchSemanticsNodes()
        val node = nodes.singleOrNull()
        val full = node?.let { val p = it.positionInRoot; Rect(p.x, p.y, p.x + it.size.width, p.y + it.size.height) }
        val viewport = compose.onNodeWithTag(listTag).fetchSemanticsNode().boundsInRoot
        val fits = node != null && full != null && node.layoutInfo.isPlaced && node.layoutInfo.coordinates.isAttached &&
            containsVisibleRect(node.boundsInRoot, full) && containsVisibleRect(viewport, full)
        val companionNodes = companion?.let { compose.onAllNodes(it).fetchSemanticsNodes() }.orEmpty()
        val companionNode = companionNodes.singleOrNull()
        val companionFull = companionNode?.let { val p = it.positionInRoot; Rect(p.x, p.y, p.x + it.size.width, p.y + it.size.height) }
        val companionFits = companion == null || (companionNode != null && companionFull != null &&
            companionNode.layoutInfo.isPlaced && companionNode.layoutInfo.coordinates.isAttached &&
            containsVisibleRect(companionNode.boundsInRoot, companionFull) && containsVisibleRect(viewport, companionFull))
        val proof = processProof().put("language", language).put("fontScale", renderedScale)
            .put("layoutDirection", renderedDirection.toString()).put("targetCount", nodes.size)
            .put("fullTargetBounds", full?.json() ?: JSONObject.NULL)
            .put("clippedTargetBounds", node?.boundsInRoot?.json() ?: JSONObject.NULL)
            .put("listBounds", viewport.json()).put("wholeTargetVisible", fits).put("imeVisible", windows.imeVisible())
            .put("testScrolledTargetBeforeCapture", scrollToTarget)
            .put("companionRequired", companion != null).put("companionCount", companionNodes.size)
            .put("companionFullBounds", companionFull?.json() ?: JSONObject.NULL)
            .put("companionClippedBounds", companionNode?.boundsInRoot?.json() ?: JSONObject.NULL)
            .put("wholeCompanionVisible", companionFits)
            .put("currentProfileFilename", model.state.value.profile.resume?.name)
            .put("currentProfileRevision", model.state.value.profile.revision)
            .put("receiptMetadata", JSONArray(model.state.value.receipts.map(WorkspaceStorage::receiptJson)))
        val prefix = "$phase-$language-$name"
        val screenshot = checkNotNull(InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot())
        try {
            val path = File(evidenceDirectory, "$prefix.png")
            require(!path.exists())
            FileOutputStream(path).use { output ->
                check(screenshot.compress(Bitmap.CompressFormat.PNG, 100, output)); output.fd.sync()
            }
        } finally { screenshot.recycle() }
        writeDurably(File(evidenceDirectory, "$prefix.json"), proof.toString(2))
        val roots = compose.onAllNodes(isRoot(), useUnmergedTree = true).fetchSemanticsNodes()
        val forest = roots.indices.joinToString("\n\n") { index ->
            "ROOT $index\n" + compose.onAllNodes(isRoot(), useUnmergedTree = true)[index].printToString(Int.MAX_VALUE)
        }
        writeDurably(File(evidenceDirectory, "$prefix-semantics.txt"), forest)
        assertTrue("The complete filename or status target must fit its actual visible list", fits)
        assertTrue("The complete accompanying action must fit the same visible viewport", companionFits)
        assertFalse("Restart evidence must not be obscured by an IME", proof.getBoolean("imeVisible"))
    }
    private fun Rect.json() = JSONArray(listOf(left, top, right, bottom))
}
