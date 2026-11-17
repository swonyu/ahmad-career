package com.saleh.careerfinder

import android.content.ContentValues
import android.graphics.Bitmap
import android.os.Bundle
import android.provider.MediaStore
import android.util.Base64
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
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
    @get:Rule val acceptanceRules: TestRule = RuleChain.outerRule(object : TestWatcher() {
        override fun starting(description: Description) { phase("activity-rule:starting") }
        override fun failed(error: Throwable, description: Description) { phase("activity-rule:failed") }
        override fun finished(description: Description) { phase("activity-rule:finished") }
    }).around(compose)
    private val approval = "I reviewed these details and authorize sending the ready applications to the employers shown above."

    @Test fun nativeReviewAndApproval_preserveExactPDFConsent_andUncertainRetryBoundaries() {
        phase("test-body:entered")
        try {
            exerciseNativeReviewAndApproval()
            phase("test-body:completed")
        } catch (error: Throwable) {
            // Record a body failure before Compose's rule cleanup can block.
            phase("test-body:failed:${error.javaClass.simpleName}")
            throw error
        }
    }

    private fun exerciseNativeReviewAndApproval() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val args = InstrumentationRegistry.getArguments()
        val origin = args.getString("fixtureOrigin")
        assumeTrue(origin != null && instrumentation.targetContext.packageName == "com.saleh.careerfinder.acceptance")
        val code = requireNotNull(args.getString("pairingCode"))
        val bytes = Base64.decode(requireNotNull(args.getString("fixtureResumeBase64")), Base64.DEFAULT)
        val expectedHash = BoundaryPolicy.sha256(bytes)
        val urls = listOf(requireNotNull(args.getString("successUrl")), requireNotNull(args.getString("timeoutUrl")),
            requireNotNull(args.getString("cooldownUrl")))
        lateinit var model: CareerViewModel
        step("activity-model") { compose.activityRule.scenario.onActivity { model = ViewModelProvider(it)[CareerViewModel::class.java] } }
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
            step("profile-tab") { compose.onNodeWithText("Profile").performClick() }
            step("profile-name-scroll") { compose.onNodeWithTag("profile-list").performScrollToNode(hasText("First or single name")) }
            step("profile-name-edit") { compose.onNode(hasText("First or single name") and hasSetTextAction()).performTextInput("Single") }
            step("profile-name-keyboard-dismiss") { closeSoftKeyboard() }
            step("profile-email-scroll") { compose.onNodeWithTag("profile-list").performScrollToNode(hasText("Email")) }
            step("profile-email-edit") { compose.onNode(hasText("Email") and hasSetTextAction()).performTextInput("native-fixture@example.invalid") }
            step("profile-email-keyboard-dismiss") { closeSoftKeyboard() }
            step("pdf-select") { compose.runOnIdle { model.choosePDF(file) } }
            step("pdf-ready") { await { !model.state.value.busy && model.state.value.profile.resume?.sha256 == expectedHash } }
            step("profile-save-scroll") { compose.onNodeWithTag("profile-list").performScrollToNode(hasText("Save profile to workspace")) }
            step("profile-save-click") { compose.onNodeWithText("Save profile to workspace").performClick() }
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
            step("apply-tab") { compose.onNodeWithText("Auto Apply").performClick() }
            clickInApply("Prepare application review")
            step("initial-review-ready") { await { !model.state.value.busy && model.state.value.plan != null } }
            val earlier = model.state.value.plan!!
            assertEquals(3, earlier.items.count { it.state == "ready" })
            // Changing tabs keeps the explicit No answer, and changing a message
            // invalidates the earlier unapproved review without submitting it.
            step("jobs-tab") { compose.onNodeWithText("Jobs").performClick() }
            step("apply-tab-return") { compose.onNodeWithText("Auto Apply").performClick() }
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
            step("review-summary-scroll") { compose.onNodeWithTag("apply-list").performScrollToNode(hasText("Review what will be shared.")) }
            step("review-summary-visible") { compose.onNodeWithText("Review what will be shared.").assertIsDisplayed() }
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
            step("receipts-tab") { compose.onNodeWithText("Receipts").performClick() }
            step("receipt-count-scroll") { compose.onNodeWithTag("receipts-list").performScrollToNode(hasText("verified application receipts")) }
            step("receipt-count-visible") { compose.onNodeWithText("verified application receipts").assertIsDisplayed() }
            step("receipts-capture") { capture("acceptance-receipts.png") }

            val timeout = model.state.value.jobs.first { it.url == urls[1] }
            step("uncertain-job-select") { compose.runOnIdle { model.state.value.selected.filter { it != timeout.id }.forEach(model::toggleJob) } }
            step("uncertain-apply-tab") { compose.onNodeWithText("Auto Apply").performClick() }
            clickInApply("Prepare application review")
            step("uncertain-review-ready") { await { !model.state.value.busy && model.state.value.plan != null } }
            assertEquals("blocked", model.state.value.plan!!.items.single().state)
            assertEquals(0, model.state.value.plan!!.items.count(ReviewItem::canSubmitNow))
            assertEquals(1, model.state.value.receipts.count { it.state == "uncertain" })
        } finally { step("pdf-document-remove") { resolver.delete(file, null, null) } }
    }

    // Fixed phase names only: no pairing arguments, profile values, PDF bytes or tokens.
    private fun phase(name: String) {
        android.util.Log.i("CareerPhoneAcceptance", "HTTPS phase: $name")
        runCatching {
            InstrumentationRegistry.getInstrumentation().sendStatus(2, Bundle().apply {
                putString("stream", "\nHTTPS phase: $name\n")
            })
        }.onFailure { android.util.Log.w("CareerPhoneAcceptance", "HTTPS phase status delivery unavailable") }
    }

    private fun <T> step(name: String, action: () -> T): T {
        phase("$name:before")
        val result = action()
        phase("$name:after")
        return result
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
        step("apply-action-scroll") { compose.onNodeWithTag("apply-list").performScrollToNode(hasText(label)) }
        step("apply-action-click") { compose.onNodeWithText(label).performClick() }
    }
    private fun approve() {
        step("approval-scroll") { compose.onNodeWithTag("apply-list").performScrollToNode(hasText(approval)) }
        step("approval-check") { compose.onNodeWithText(approval).performClick() }
        clickInApply("Run approved test applications")
    }
    private fun await(timeout: Long = 10_000, check: () -> Boolean) = compose.waitUntil(timeoutMillis = timeout, condition = check)
    private fun capture(name: String) {
        compose.waitForIdle()
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val image = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
        File(instrumentation.targetContext.filesDir, name).outputStream().use { image.compress(Bitmap.CompressFormat.PNG, 100, it) }
        image.recycle()
    }
}
