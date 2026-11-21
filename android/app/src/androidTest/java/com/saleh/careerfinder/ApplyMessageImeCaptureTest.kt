package com.saleh.careerfinder

import android.accessibilityservice.AccessibilityServiceInfo
import android.graphics.Bitmap
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.pdf.PdfDocument
import android.os.SystemClock
import android.util.Base64
import android.view.WindowManager
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.geometry.Rect as ComposeRect
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.LayoutDirection
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger

/** Synthetic Apply keyboard regression. No network, preparation, sending or real private data. */
class ApplyMessageImeCaptureTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    private class MemoryStore : PrivateStore {
        private val values = ConcurrentHashMap<String, String>()
        override fun read(name: String) = values[name]?.let(::JSONObject)
        override fun write(name: String, value: JSONObject) { values[name] = value.toString() }
        override fun remove(name: String) { values.remove(name) }
        override fun startFreshPreservingExisting() { error("No storage reset in this fixture") }
    }

    private class FixedWorkspaceService(private val response: JSONObject) : CareerService {
        val requests = CopyOnWriteArrayList<String>()
        val deniedOperations = AtomicInteger()
        override suspend fun pair(origin: String, code: String): Connection {
            deniedOperations.incrementAndGet()
            error("Pairing is not allowed in this fixture")
        }
        override suspend fun request(connection: Connection, method: String, route: String, body: JSONObject?): JSONObject {
            if (method != "GET" || route != "workspace" || body != null || connection.workspaceId != "apply-ime-fixture") {
                deniedOperations.incrementAndGet()
                error("Only the fixed synthetic workspace read is allowed")
            }
            requests += "$method $route"
            return JSONObject(response.toString())
        }
    }

    private val store = MemoryStore()
    private val owner = ViewModelStore()
    private lateinit var model: CareerViewModel
    private lateinit var service: FixedWorkspaceService
    private lateinit var strings: CareerStrings
    private lateinit var syntheticProfile: ProfileDraft
    private lateinit var syntheticJob: Opportunity
    private var originalAutomationFlags: Int? = null
    private var renderedDirection: LayoutDirection? = null
    private var renderedLanguage: String? = null
    private var renderedFontScale = 0f

    @Before fun mountOnlySyntheticWorkspace() {
        val document = PdfDocument()
        val pdfBytes = try {
            val page = document.startPage(PdfDocument.PageInfo.Builder(240, 100, 1).create())
            page.canvas.drawText("Synthetic Apply keyboard fixture", 10f, 30f, Paint())
            document.finishPage(page)
            ByteArrayOutputStream().use { output -> document.writeTo(output); output.toByteArray() }
        } finally { document.close() }
        assertArrayEquals(pdfBytes, BoundaryPolicy.readPDF(pdfBytes.inputStream()))
        val resume = Resume("Synthetic-Apply-IME.pdf", pdfBytes.size.toLong(), BoundaryPolicy.sha256(pdfBytes),
            Base64.encodeToString(pdfBytes, Base64.NO_WRAP))
        syntheticProfile = ProfileDraft(firstName = "Synthetic", email = "apply-ime@example.invalid", resume = resume, revision = 1)
        syntheticJob = Opportunity("apply-ime-role", "https://example.invalid/apply-ime-role",
            "Care assistant · مساعد رعاية", "Example Care", "Amman · عمّان", "JO")
        val connection = Connection("https://apply-fixture.example.invalid", "apply-ime-fixture",
            "synthetic-no-authority", "2099-12-31T00:00:00Z")
        val seed = CareerUiState(loaded = true, connection = connection, profile = syntheticProfile,
            serverProfile = syntheticProfile, jobs = listOf(syntheticJob), selected = setOf(syntheticJob.id))
        store.write("connection", connection.toJson())
        store.write(seed.privateScope, WorkspaceStorage.encode(seed))
        service = FixedWorkspaceService(JSONObject().put("ok", true).put("mode", "local")
            .put("workspaceId", connection.workspaceId)
            .put("profile", syntheticProfile.apiJson(includeLinkedIn = true).put("revision", 1).put("resume", resume.metadata()))
            .put("jobs", JSONArray(listOf(syntheticJob.privateJson())))
            .put("attempts", JSONArray()).put("activePlanIds", JSONArray()).put("recoverablePlans", JSONArray())
            .put("capabilities", JSONObject().put("liveEnabled", false).put("linkedinProfile", true)))
        val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
        val info = automation.serviceInfo
        originalAutomationFlags = info.flags
        info.flags = info.flags or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
        automation.serviceInfo = info
        compose.activityRule.scenario.onActivity { activity ->
            activity.enableEdgeToEdge()
            activity.window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
            strings = phoneAcceptanceStrings(activity)
            val discovery = object : DiscoveryService {
                override suspend fun sources() = DiscoveryCatalog(emptyList(), emptyList(), 4, "Synthetic Apply fixture")
                override suspend fun search(filters: DiscoveryFilters, cursor: String?): DiscoveryPage =
                    error("No discovery search is allowed in this fixture")
            }
            model = CareerViewModel(activity.application, store, service, discoveryService = discovery)
            owner.put("apply-ime-fixture", model)
            activity.setContent {
                PhoneAcceptanceContent {
                    val language = rememberCareerStrings().locale.language
                    val direction = LocalLayoutDirection.current
                    val scale = LocalConfiguration.current.fontScale
                    SideEffect { renderedLanguage = language; renderedDirection = direction; renderedFontScale = scale }
                    CareerApp(model)
                }
            }
        }
        compose.waitUntil(5_000) { model.state.value.loaded && !model.state.value.busy && renderedLanguage == "ar" }
        assertNull(model.state.value.error)
        assertTrue(model.state.value.profile.essentialsComplete)
        assertFalse(model.state.value.profileDirty)
        assertEquals(syntheticProfile.resume?.sha256, model.state.value.profile.resume?.sha256)
        assertEquals(setOf(syntheticJob.id), model.state.value.selected)
        assertEquals(listOf("GET workspace"), service.requests.toList())
    }

    @After fun clearOnlyOwnedFixture() {
        compose.runOnIdle { owner.clear() }
        originalAutomationFlags?.let { flags ->
            val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
            val info = automation.serviceInfo
            info.flags = flags
            automation.serviceInfo = info
        }
    }

    @Test fun arabicApplyMessageAndReviewAction_remainReachableWithKeyboard() {
        val originalAnswers = model.state.value.answers[syntheticJob.id] ?: JobAnswers()
        val originalConsent = originalAnswers.consentStore to originalAnswers.consentMarketing
        compose.onNodeWithTag("navigation-apply").revealNavigationTab().performClick()
        val list = compose.onNodeWithTag("apply-list")
        val fieldMatcher = hasText(strings("Message for this employer (optional)")) and hasSetTextAction()
        list.performScrollToNode(fieldMatcher)
        val field = compose.onNode(fieldMatcher)
        val beforeTap = observeControl(fieldMatcher)
        retainCapture("apply-field-before-tap", JSONObject().put("control", beforeTap))
        if (!beforeTap.getBoolean("wholeControlFitsVisibleArea") || !beforeTap.getBoolean("enabled")) {
            fail("The whole employer message field must be visible and enabled before the touch; no tap or text input was performed")
            return
        }
        field.performClick()
        val keyboard = observeRealKeyboardWithinFiveSeconds()
        if (!keyboard.optBoolean("readyWithinFiveSeconds")) {
            retainCapture("apply-ime-keyboard-unready", JSONObject().put("keyboard", keyboard))
            fail("A real visible keyboard key was not observed within five seconds; no text input was performed")
            return
        }
        // performTextInput can request focus itself. Prove that the preceding
        // touch reached this visible field before allowing semantic text input.
        val beforeInput = observeControl(fieldMatcher)
        retainCapture("apply-field-before-input", JSONObject().put("keyboard", keyboard).put("control", beforeInput))
        if (!beforeInput.getBoolean("focused") || !beforeInput.getBoolean("wholeControlAboveKeyboard") ||
            !beforeInput.getBoolean("enabled")) {
            fail("The touched employer message field must be focused and wholly above the keyboard before text input; no text input was performed")
            return
        }
        val message = "Synthetic متابعة"
        field.performTextInput(message)
        val fieldObservation = observeControl(fieldMatcher)
        retainCapture("apply-message-keyboard", JSONObject().put("keyboard", keyboard).put("control", fieldObservation))

        val actionMatcher = hasText(strings("Prepare application review")) and hasClickAction()
        list.performScrollToNode(actionMatcher)
        val actionObservation = observeControl(actionMatcher)
        val state = model.state.value
        val finalAnswers = state.answers[syntheticJob.id] ?: JobAnswers()
        val finalConsent = finalAnswers.consentStore to finalAnswers.consentMarketing
        val receipt = JSONObject().put("keyboard", keyboard).put("messageField", fieldObservation)
            .put("fieldBeforeTap", beforeTap).put("fieldBeforeInput", beforeInput)
            .put("originalConsent", JSONObject().put("store", originalConsent.first ?: JSONObject.NULL)
                .put("marketing", originalConsent.second ?: JSONObject.NULL))
            .put("finalConsent", JSONObject().put("store", finalConsent.first ?: JSONObject.NULL)
                .put("marketing", finalConsent.second ?: JSONObject.NULL))
            .put("consentUnchanged", finalConsent == originalConsent)
            .put("reviewAction", actionObservation)
            .put("profileReady", state.profile.essentialsComplete).put("selectedJobCount", state.selected.size)
            .put("syntheticPDFSHA256", state.profile.resume?.sha256)
            .put("messagePreserved", state.answers[syntheticJob.id]?.comments == message)
            .put("fixedWorkspaceReads", service.requests.size).put("deniedOperations", service.deniedOperations.get())
            .put("networkBoundary", "Adapter returns only the fixed workspace JSON; it has no network implementation")
            .put("receiptCount", state.receipts.size).put("planPresent", state.plan != null)
            .put("activePlanCount", state.activePlans.size)
            .put("actionCoverage", "Fresh whole-action geometry only; prepare and send were never activated")
            .put("sourceCommitClaimedByRunner", InstrumentationRegistry.getArguments().getString("career_source_sha", "not supplied"))
        retainCapture("apply-review-action-keyboard", receipt)
        evidenceDirectory().resolve("apply-ime-receipt.json").writeText(receipt.toString(2))

        val failures = mutableListOf<String>()
        if (!fieldObservation.getBoolean("wholeControlAboveKeyboard")) failures += "The whole employer message field was not above the open keyboard"
        if (!actionObservation.getBoolean("wholeControlAboveKeyboard")) failures += "The whole review action was not above the open keyboard"
        if (!actionObservation.getBoolean("enabled")) failures += "The synthetic ready-profile review action was not enabled"
        if (state.answers[syntheticJob.id]?.comments != message) failures += "The synthetic message was not preserved"
        if (state.plan != null || state.activePlans.isNotEmpty() || state.receipts.isNotEmpty()) failures += "No plan, send or receipt is allowed"
        if (service.requests.toList() != listOf("GET workspace") || service.deniedOperations.get() != 0) failures += "An unexpected service operation was attempted"
        if (finalConsent != originalConsent) failures += "No consent choice may change"
        assertTrue(failures.joinToString("; "), failures.isEmpty())
    }

    private fun observeControl(matcher: SemanticsMatcher): JSONObject {
        compose.waitForIdle()
        val nodes = compose.onAllNodes(matcher).fetchSemanticsNodes()
        val node = nodes.singleOrNull()
        val fullRoot = node?.let { item ->
            val p = item.positionInRoot
            ComposeRect(p.x, p.y, p.x + item.size.width, p.y + item.size.height)
        }
        val fullScreen = node?.let { item ->
            val p = item.positionOnScreen
            ComposeRect(p.x, p.y, p.x + item.size.width, p.y + item.size.height)
        }
        val listBounds = compose.onNodeWithTag("apply-list").fetchSemanticsNode().boundsInRoot
        val window = windowObservation()
        val imeTop = window.getInt("decorScreenY") + window.getInt("decorHeightPx") - window.getInt("imeBottomPx")
        val visible = ComposeRect(0f, 0f, window.getInt("screenWidthPx").toFloat(), imeTop.toFloat())
        val parentFit = node != null && fullRoot != null && node.layoutInfo.isPlaced && node.layoutInfo.coordinates.isAttached &&
            containsVisibleRect(node.boundsInRoot, fullRoot) && containsVisibleRect(listBounds, fullRoot)
        val above = window.getBoolean("imeVisible") && parentFit && fullScreen != null && containsVisibleRect(visible, fullScreen)
        val fits = parentFit && fullScreen != null && containsVisibleRect(visible, fullScreen)
        val focused = node != null && node.config.contains(SemanticsProperties.Focused) && node.config[SemanticsProperties.Focused]
        val selection = if (node != null && node.config.contains(SemanticsProperties.TextSelectionRange))
            node.config[SemanticsProperties.TextSelectionRange].toString() else null
        return JSONObject().put("nodeCount", nodes.size).put("window", window)
            .put("fullBoundsInRoot", fullRoot?.json() ?: JSONObject.NULL)
            .put("fullBoundsOnScreen", fullScreen?.json() ?: JSONObject.NULL)
            .put("clippedBoundsInRoot", node?.boundsInRoot?.json() ?: JSONObject.NULL)
            .put("listBoundsInRoot", listBounds.json()).put("parentBoundsFit", parentFit)
            .put("enabled", node != null && !node.config.contains(SemanticsProperties.Disabled))
            .put("focused", focused).put("textSelectionRange", selection ?: JSONObject.NULL)
            .put("wholeControlFitsVisibleArea", fits)
            .put("wholeControlAboveKeyboard", above)
    }

    private fun observeRealKeyboardWithinFiveSeconds(): JSONObject {
        val start = SystemClock.elapsedRealtime()
        val deadline = start + 5_000
        var last = JSONObject()
        while (SystemClock.elapsedRealtime() < deadline) {
            val window = windowObservation()
            if (SystemClock.elapsedRealtime() >= deadline) return last.put("readyWithinFiveSeconds", false).put("late", true)
            val key = visibleKeyboardKey(deadline)
            val end = SystemClock.elapsedRealtime()
            last = JSONObject().put("window", window).put("key", key ?: JSONObject.NULL)
                .put("elapsedMillis", end - start).put("late", end >= deadline)
                .put("readyWithinFiveSeconds", end < deadline && window.getBoolean("imeVisible") && key != null)
            if (last.getBoolean("readyWithinFiveSeconds") || end >= deadline) return last
            SystemClock.sleep(minOf(50, deadline - end))
        }
        return last.put("readyWithinFiveSeconds", false)
    }

    private fun visibleKeyboardKey(deadline: Long): JSONObject? {
        val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
        val windows = automation.windows
        if (SystemClock.elapsedRealtime() >= deadline) return null
        for (window in windows) {
            if (SystemClock.elapsedRealtime() >= deadline) return null
            if (window.type != AccessibilityWindowInfo.TYPE_INPUT_METHOD) continue
            val windowBounds = Rect().also(window::getBoundsInScreen)
            val root = window.root ?: continue
            val queue = java.util.ArrayDeque<AccessibilityNodeInfo>()
            queue.add(root)
            var inspected = 0
            try {
                while (queue.isNotEmpty() && inspected++ < 160 && SystemClock.elapsedRealtime() < deadline) {
                    val node = queue.removeFirst()
                    try {
                        val label = (node.contentDescription ?: node.text)?.toString()?.trim().orEmpty()
                        val bounds = Rect().also(node::getBoundsInScreen)
                        val points = label.codePoints().toArray()
                        val namedKey = label.lowercase(Locale.ROOT) in setOf("delete", "backspace", "space", "spacebar", "enter", "return", "حذف", "مسافة", "إدخال")
                        val letterKey = points.size == 1 && Character.isLetterOrDigit(points[0])
                        if (SystemClock.elapsedRealtime() >= deadline) return null
                        if (node.isVisibleToUser && node.isClickable && !node.isEditable && (namedKey || letterKey) &&
                            bounds.width() > 0 && bounds.height() > 0 && Rect.intersects(bounds, windowBounds)) {
                            return JSONObject().put("label", label).put("className", node.className?.toString())
                                .put("boundsInScreen", bounds.json()).put("imeWindowBoundsInScreen", windowBounds.json())
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

    private fun windowObservation(): JSONObject {
        var observation = JSONObject()
        compose.runOnIdle {
            val view = compose.activity.window.decorView
            val insets = ViewCompat.getRootWindowInsets(view)
            val ime = insets?.getInsets(WindowInsetsCompat.Type.ime())
            val visible = Rect().also(view::getWindowVisibleDisplayFrame)
            val screenPosition = IntArray(2).also(view::getLocationOnScreen)
            val metrics = compose.activity.resources.displayMetrics
            observation = JSONObject().put("decorWidthPx", view.width).put("decorHeightPx", view.height)
                .put("decorScreenX", screenPosition[0]).put("decorScreenY", screenPosition[1])
                .put("screenWidthPx", metrics.widthPixels).put("screenHeightPx", metrics.heightPixels)
                .put("imeVisible", insets?.isVisible(WindowInsetsCompat.Type.ime()) == true)
                .put("imeBottomPx", ime?.bottom ?: 0).put("visibleDisplayFrame", visible.json())
                .put("softInputMode", compose.activity.window.attributes.softInputMode)
                .put("fontScale", renderedFontScale).put("language", renderedLanguage)
                .put("layoutDirection", renderedDirection.toString()).put("edgeToEdgeConfigured", true)
        }
        return observation
    }

    private fun retainCapture(name: String, observation: JSONObject) {
        compose.waitForIdle()
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val directory = evidenceDirectory()
        val bitmap = checkNotNull(instrumentation.uiAutomation.takeScreenshot())
        try {
            directory.resolve("$name.png").outputStream().use { output ->
                check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output))
            }
            observation.put("screenshotWidth", bitmap.width).put("screenshotHeight", bitmap.height)
        } finally { bitmap.recycle() }
        observation.put("capturedAtUptimeMillis", SystemClock.uptimeMillis())
        directory.resolve("$name.json").writeText(observation.toString(2))
        directory.resolve("$name-semantics.txt").writeText(compose.onRoot(useUnmergedTree = true).printToString())
    }

    private fun evidenceDirectory(): File =
        File(InstrumentationRegistry.getInstrumentation().targetContext.cacheDir, "apply-ime-evidence").apply { mkdirs() }

    private fun Rect.json() = JSONArray(listOf(left, top, right, bottom))
    private fun ComposeRect.json() = JSONArray(listOf(left, top, right, bottom))
}
