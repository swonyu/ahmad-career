package com.saleh.careerfinder

import android.content.ContentValues
import android.graphics.Bitmap
import android.os.Bundle
import android.provider.MediaStore
import android.util.Base64
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModelProvider
import androidx.test.filters.SdkSuppress
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.rules.TestWatcher
import org.junit.runner.Description
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import javax.net.ssl.SSLException

class TlsBoundaryAcceptanceTest {
    @Test fun normalPreview_refusesTheIsolatedFixtureCertificate() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val origin = InstrumentationRegistry.getArguments().getString("fixtureOrigin")
        assumeTrue(origin != null && instrumentation.targetContext.packageName == "com.saleh.careerfinder.preview")
        val error = runBlocking { runCatching { HttpsCareerService.pair(origin!!, "INVALID-FIXTURE-CODE") }.exceptionOrNull() }
        assertNotNull("The ordinary preview must not trust the acceptance CA", error)
        assertTrue("Failure must be certificate/TLS rejection, not a network outage",
            generateSequence(error) { it.cause }.any { it is SSLException })
    }
}

/** Only the separate acceptance variant can reach the isolated synthetic HTTPS provider fixture. */
@SdkSuppress(minSdkVersion = 29)
class NativeHttpsAcceptanceTest {
    private val compose = createAndroidComposeRule<MainActivity>()
    private lateinit var strings: CareerStrings
    private var diagnosticModel: CareerViewModel? = null
    private var expectedResumeHash: String? = null
    private var fixtureDiagnosticsAllowed = false
    private var lastPhase = "not-started"
    private var failedStep: String? = null
    @get:Rule val acceptanceRules: TestRule = RuleChain.outerRule(object : TestWatcher() {
        override fun starting(description: Description) { phase("activity-rule:starting") }
        override fun failed(error: Throwable, description: Description) { phase("activity-rule:failed") }
        override fun finished(description: Description) { phase("activity-rule:finished") }
    }).around(compose)
    private val approval get() = strings("I reviewed these details and authorize sending the ready applications to the employers shown above.")

    @Test fun nativeReviewAndApproval_preserveExactPDFConsent_andUncertainRetryBoundaries() {
        phase("test-body:entered")
        try {
            exerciseNativeReviewAndApproval()
            phase("test-body:completed")
        } catch (error: Throwable) {
            // Preserve the live app before Compose's rule disposes the activity.
            val failedPhase = failedStep ?: lastPhase
            phase("test-body:failed:${error.javaClass.simpleName}")
            captureFailureEvidence(error, failedPhase)
            throw error
        }
    }

    private fun exerciseNativeReviewAndApproval() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val args = InstrumentationRegistry.getArguments()
        val origin = args.getString("fixtureOrigin")
        assumeTrue(origin != null && instrumentation.targetContext.packageName == "com.saleh.careerfinder.acceptance")
        fixtureDiagnosticsAllowed = true
        val code = requireNotNull(args.getString("pairingCode"))
        val bytes = Base64.decode(requireNotNull(args.getString("fixtureResumeBase64")), Base64.DEFAULT)
        val expectedHash = BoundaryPolicy.sha256(bytes)
        expectedResumeHash = expectedHash
        val urls = listOf(requireNotNull(args.getString("successUrl")), requireNotNull(args.getString("timeoutUrl")),
            requireNotNull(args.getString("cooldownUrl")))
        lateinit var model: CareerViewModel
        step("activity-model") { compose.activityRule.scenario.onActivity {
            strings = phoneAcceptanceStrings(it)
            model = ViewModelProvider(it)[CareerViewModel::class.java]
            diagnosticModel = model
        } }
        step("workspace-readiness") { await { model.state.value.loaded && !model.state.value.busy } }
        step("pair-request") { compose.runOnIdle { model.pair(origin!!, code) {} } }
        step("pair-result") { await { !model.state.value.busy && model.state.value.connection != null } }
        assertNull(model.state.value.error)
        assertTrue(model.state.value.testService)

        val resolver = instrumentation.targetContext.contentResolver
        val file = step("pdf-document-create") {
            requireNotNull(resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, "Career-Finder-Acceptance.pdf")
                put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }))
        }
        try {
            step("pdf-document-write") {
                resolver.openOutputStream(file)!!.use { it.write(bytes) }
                resolver.update(file, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
            }
            step("profile-tab") { compose.onNodeWithTag("navigation-profile").revealNavigationTab().performClick() }
            step("profile-name-scroll") { compose.onNodeWithTag("profile-list").performScrollToNode(hasText(strings("First or single name"))) }
            step("profile-name-edit") { compose.onNode(hasText(strings("First or single name")) and hasSetTextAction()).performTextInput("Single") }
            step("profile-name-keyboard-dismiss") { closeSoftKeyboard() }
            step("profile-email-scroll") { compose.onNodeWithTag("profile-list").performScrollToNode(hasText(strings("Email"))) }
            step("profile-email-edit") { compose.onNode(hasText(strings("Email")) and hasSetTextAction()).performTextInput("native-fixture@example.invalid") }
            step("profile-email-keyboard-dismiss") { closeSoftKeyboard() }
            step("pdf-select") { compose.runOnIdle { model.choosePDF(file) } }
            step("pdf-ready") { await { !model.state.value.busy && model.state.value.profile.resume?.sha256 == expectedHash } }
            step("profile-content-reachable") {
                compose.onNodeWithTag("profile-list").assertHeightIsAtLeast(120.dp).assertIsDisplayed()
            }
            step("profile-content-capture") { capture("acceptance-profile-large-text.png") }
            step("profile-save-scroll") { compose.onNodeWithTag("profile-list").performScrollToNode(hasText(strings("Save profile to workspace"))) }
            step("profile-save-prerequisites") {
                val state = model.state.value
                assertTrue("The isolated fixture must remain connected and ready", state.loaded && !state.busy && state.connection != null && state.testService)
                assertFalse("Private storage must remain available before saving", state.storageBlocked)
                assertTrue("No request error or profile conflict may precede saving", state.error == null && state.profileConflict == null)
                assertTrue("The typed synthetic first name must reach the model", state.profile.firstName == "Single")
                assertTrue("The single-name fixture must keep the last name empty", state.profile.lastName.isEmpty())
                assertTrue("The typed synthetic email must reach the model", state.profile.email == "native-fixture@example.invalid")
                assertTrue("The exact synthetic PDF must remain selected",
                    state.profile.resume?.let { it.sha256 == expectedHash && it.size == bytes.size.toLong() && it.dataBase64 != null } == true)
                assertTrue("The synthetic profile must pass the real validation contract", ProfileValidation.errors(state.profile).isEmpty())
                assertTrue("The edited synthetic profile must still be an unsaved draft", state.profileDirty)
            }
            step("profile-save-click") { compose.onNodeWithText(strings("Save profile to workspace")).assertIsEnabled().performClick() }
            step("profile-saved") { await { !model.state.value.busy && !model.state.value.profileDirty && model.state.value.profile.revision > 0 } }
            assertEquals("", model.state.value.profile.lastName)
            assertEquals(expectedHash, model.state.value.profile.resume?.sha256)

            urls.forEachIndexed { index, url ->
                step("opportunity-${index + 1}-add") { compose.runOnIdle { model.addOpportunity(url, "Fixture role", "Fixture employer", "", "") {} } }
                step("opportunity-${index + 1}-ready") { await { !model.state.value.busy } }
                assertNull(model.state.value.error)
            }
            assertEquals(3, model.state.value.jobs.size)
            step("application-answers") { compose.runOnIdle {
                model.state.value.jobs.forEach { job ->
                    model.toggleJob(job.id)
                    model.editAnswers(job.id) { JobAnswers("First reviewed message", consentStore = true, consentMarketing = false) }
                }
            } }
            step("apply-tab") { compose.onNodeWithTag("navigation-apply").revealNavigationTab().performClick() }
            clickInApply("Prepare application review")
            step("initial-review-ready") { await { !model.state.value.busy && model.state.value.plan != null } }
            val earlier = model.state.value.plan!!
            assertEquals(3, earlier.items.count { it.state == "ready" })
            // Changing tabs keeps the explicit No answer, and changing a message
            // invalidates the earlier unapproved review without submitting it.
            step("jobs-tab") { compose.onNodeWithTag("navigation-jobs").revealNavigationTab().performClick() }
            step("apply-tab-return") { compose.onNodeWithTag("navigation-apply").revealNavigationTab().performClick() }
            assertTrue(model.state.value.answers.values.all { it.consentMarketing == false })
            val changed = model.state.value.jobs.first().id
            step("review-message-edit") { compose.runOnIdle { model.editAnswers(changed) { it.copy(comments = "Updated reviewed message") } } }
            clickInApply("Stop earlier review and prepare update")
            step("replacement-review-ready") { await { !model.state.value.busy && model.state.value.plan != null } }
            val plan = model.state.value.plan!!
            assertNotEquals(earlier.id, plan.id)
            assertEquals(3, plan.items.count { it.state == "ready" })
            plan.items.forEach {
                assertEquals("Single", it.payload.getString("name"))
                assertEquals(true, it.payload.getBoolean("consentStore"))
                assertEquals(false, it.payload.getBoolean("consentMarketing"))
                assertEquals(expectedHash, it.resume?.sha256)
            }
            step("review-summary-scroll") { compose.onNodeWithTag("apply-list").performScrollToNode(hasText(strings("Review what will be shared."))) }
            step("review-summary-visible") { compose.onNodeWithText(strings("Review what will be shared.")).assertIsDisplayed() }
            val reviewSummary = strings.format("This review uses profile version {0}. Expires {1}.",
                listOf(plan.profileRevision.toString(), strings.dateTime(plan.expiresAt)))
            assertTrue("Arabic review must explain when its approval expires", reviewSummary.contains("تنتهي الصلاحية في"))
            assertFalse("Arabic review must not retain the English expiry label", reviewSummary.contains("Expires"))
            step("review-summary-localized") {
                compose.onNodeWithTag("apply-list").performScrollToNode(hasText(reviewSummary))
                compose.onNodeWithText(reviewSummary).assertIsDisplayed()
            }
            step("review-capture") { capture("acceptance-prepared.png") }
            step("initial-approval") { approve() }
            step("initial-outcomes") { await(30_000) {
                model.state.value.receipts.any { it.state == "uncertain" } &&
                    model.state.value.receipts.any { it.state == "confirmed" } &&
                    model.state.value.receipts.any { it.state == "rate_limited" }
            } }
            assertEquals(0, model.state.value.receipts.count(ApplicationReceipt::verified))
            assertTrue(model.state.value.receipts.all(ApplicationReceipt::testMode))
            val recovered = model.state.value.recoverablePlans.first { it.id == plan.id }
            step("recover-review") { compose.runOnIdle { model.reviewRecovered(recovered) } }
            step("recovered-review-ready") { await { model.state.value.plan?.id == plan.id } }
            step("recovered-approval-scroll") { compose.onNodeWithTag("apply-list").performScrollToNode(hasText(approval)) }
            step("recovered-approval-unchecked") { compose.onNodeWithText(approval).assertIsOff() }
            step("cooldown-approval") { approve() }
            step("cooldown-outcomes") { await(30_000) { model.state.value.receipts.count { it.state == "confirmed" } == 2 } }
            assertEquals(1, model.state.value.receipts.count { it.state == "uncertain" })
            assertEquals(0, model.state.value.receipts.count(ApplicationReceipt::verified))
            step("receipts-tab") { compose.onNodeWithTag("navigation-receipts").revealNavigationTab().performClick() }
            step("receipt-count-scroll") { compose.onNodeWithTag("receipts-list").performScrollToNode(hasText(strings("verified application receipts"))) }
            step("receipt-count-visible") { compose.onNodeWithText(strings("verified application receipts")).assertIsDisplayed() }
            step("receipts-capture") { capture("acceptance-receipts.png") }

            val timeout = model.state.value.jobs.first { it.url == urls[1] }
            step("uncertain-job-select") { compose.runOnIdle { model.state.value.selected.filter { it != timeout.id }.forEach(model::toggleJob) } }
            step("uncertain-apply-tab") { compose.onNodeWithTag("navigation-apply").revealNavigationTab().performClick() }
            clickInApply("Prepare application review")
            step("uncertain-review-ready") { await { !model.state.value.busy && model.state.value.plan != null } }
            assertEquals("blocked", model.state.value.plan!!.items.single().state)
            assertEquals(0, model.state.value.plan!!.items.count(ReviewItem::canSubmitNow))
            assertEquals(1, model.state.value.receipts.count { it.state == "uncertain" })
        } finally { step("pdf-document-remove") { resolver.delete(file, null, null) } }
    }

    // Fixed phase names only: no pairing arguments, profile values, PDF bytes or tokens.
    private fun phase(name: String) {
        lastPhase = name
        android.util.Log.i("CareerPhoneAcceptance", "HTTPS phase: $name")
        runCatching {
            InstrumentationRegistry.getInstrumentation().sendStatus(2, Bundle().apply {
                putString("stream", "\nHTTPS phase: $name\n")
            })
        }.onFailure { android.util.Log.w("CareerPhoneAcceptance", "HTTPS phase status delivery unavailable") }
    }

    private fun <T> step(name: String, action: () -> T): T {
        phase("$name:before")
        try {
            val result = action()
            phase("$name:after")
            return result
        } catch (error: Throwable) {
            // Finally-block cleanup has its own phases; retain the first failed operation.
            if (failedStep == null) failedStep = name
            throw error
        }
    }

    // Fixed flags and codes only. Never log profile text, connection data, PDF bytes,
    // raw service errors, or a semantics tree. A diagnostic failure cannot replace the test failure.
    private fun captureFailureEvidence(error: Throwable, failedPhase: String) {
        if (!fixtureDiagnosticsAllowed) return
        runCatching {
            val state = diagnosticModel?.state?.value
            val snapshot = JSONObject().put("schemaVersion", 1).put("phase", failedPhase)
                .put("failureClass", error.javaClass.simpleName.take(80)).put("modelAvailable", state != null)
            state?.let {
                val validation = ProfileValidation.errors(it.profile)
                val errorCode = when {
                    it.error == null -> "none"
                    validation.isNotEmpty() && it.error == validation.values.joinToString(" ") -> "profile-validation"
                    it.error == "This connection has expired. Pair this phone again to reconnect to your workspace." -> "connection-expired"
                    it.error == "A newer profile was saved elsewhere. Your edits are safe. Compare the versions below before choosing what to keep." -> "stale-profile"
                    it.error == "The service returned incomplete or invalid data. Your phone draft was kept. Refresh before trying again." -> "invalid-service-data"
                    else -> "other"
                }
                val noticeCode = when (it.notice) {
                    null -> "none"
                    "Profile saved to your connected workspace." -> "profile-saved"
                    "The earlier profile was saved. Your newer edits are still a draft." -> "newer-draft"
                    else -> "other"
                }
                snapshot.put("loaded", it.loaded).put("busy", it.busy).put("profileDirty", it.profileDirty)
                    .put("profileRevision", it.profile.revision).put("storageBlocked", it.storageBlocked)
                    .put("requiresPairing", it.requiresPairing).put("connected", it.connection != null)
                    .put("testService", it.testService).put("profileConflict", it.profileConflict != null)
                    .put("errorCode", errorCode).put("noticeCode", noticeCode)
                    .put("validationFields", JSONArray(validation.keys.sorted()))
                    .put("fixtureFirstNameMatches", it.profile.firstName == "Single")
                    .put("fixtureEmailMatches", it.profile.email == "native-fixture@example.invalid")
                    .put("fixturePdfMatches", expectedResumeHash != null && it.profile.resume?.sha256 == expectedResumeHash)
                    .put("pdfBytesPresent", it.profile.resume?.dataBase64 != null)
            }
            val message = "HTTPS failure state: $snapshot"
            android.util.Log.e("CareerPhoneAcceptance", message)
            InstrumentationRegistry.getInstrumentation().sendStatus(2, Bundle().apply {
                putString("stream", "\n$message\n")
            })
        }.onFailure { android.util.Log.w("CareerPhoneAcceptance", "HTTPS failure state unavailable") }
        // No Compose idle wait: the failing operation may itself leave Compose busy.
        runCatching { capture("acceptance-native-failure.png", waitForIdle = false) }
            .onFailure { android.util.Log.w("CareerPhoneAcceptance", "HTTPS live failure screenshot unavailable") }
    }

    private fun closeSoftKeyboard() {
        compose.runOnIdle {
            val activity = compose.activity
            (activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager)
                .hideSoftInputFromWindow(activity.window.decorView.windowToken, 0)
        }
        compose.waitForIdle()
    }

    private fun clickInApply(label: String) {
        step("apply-action-scroll") { compose.onNodeWithTag("apply-list").performScrollToNode(hasText(strings(label))) }
        step("apply-action-click") { compose.onNodeWithText(strings(label)).performClick() }
    }
    private fun approve() {
        step("approval-scroll") { compose.onNodeWithTag("apply-list").performScrollToNode(hasText(approval)) }
        step("approval-check") { compose.onNodeWithText(approval).performClick() }
        clickInApply("Run approved test applications")
    }
    private fun await(timeout: Long = 10_000, check: () -> Boolean) = compose.waitUntil(timeoutMillis = timeout, condition = check)
    private fun capture(name: String, waitForIdle: Boolean = true) {
        if (waitForIdle) compose.waitForIdle()
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val image = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
        try { File(instrumentation.targetContext.filesDir, name).outputStream().use { image.compress(Bitmap.CompressFormat.PNG, 100, it) } }
        finally { image.recycle() }
    }
}
