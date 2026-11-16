package com.saleh.careerfinder

import android.content.ContentValues
import android.graphics.Bitmap
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
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private val approval = "I reviewed these details and authorize sending the ready applications to the employers shown above."

    @Test fun nativeReviewAndApproval_preserveExactPDFConsent_andUncertainRetryBoundaries() {
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
        compose.activityRule.scenario.onActivity { model = ViewModelProvider(it)[CareerViewModel::class.java] }
        await { model.state.value.loaded && !model.state.value.busy }
        compose.runOnIdle { model.pair(origin!!, code) {} }
        await { !model.state.value.busy && model.state.value.connection != null }
        assertNull(model.state.value.error)
        assertTrue(model.state.value.testService)

        val resolver = instrumentation.targetContext.contentResolver
        val file = requireNotNull(resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, "Career-Finder-Acceptance.pdf")
            put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }))
        try {
            resolver.openOutputStream(file)!!.use { it.write(bytes) }
            resolver.update(file, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
            compose.onNodeWithText("Profile").performClick()
            compose.onNodeWithTag("profile-list").performScrollToNode(hasText("First or single name"))
            compose.onNode(hasText("First or single name") and hasSetTextAction()).performTextInput("Single")
            compose.onNodeWithTag("profile-list").performScrollToNode(hasText("Email"))
            compose.onNode(hasText("Email") and hasSetTextAction()).performTextInput("native-fixture@example.invalid")
            compose.runOnIdle { model.choosePDF(file) }
            await { !model.state.value.busy && model.state.value.profile.resume?.sha256 == expectedHash }
            compose.onNodeWithTag("profile-list").performScrollToNode(hasText("Save profile to workspace"))
            compose.onNodeWithText("Save profile to workspace").performClick()
            await { !model.state.value.busy && !model.state.value.profileDirty && model.state.value.profile.revision > 0 }
            assertEquals("", model.state.value.profile.lastName)
            assertEquals(expectedHash, model.state.value.profile.resume?.sha256)

            urls.forEach { url ->
                compose.runOnIdle { model.addOpportunity(url, "Fixture role", "Fixture employer", "", "") {} }
                await { !model.state.value.busy }
                assertNull(model.state.value.error)
            }
            assertEquals(3, model.state.value.jobs.size)
            compose.runOnIdle {
                model.state.value.jobs.forEach { job ->
                    model.toggleJob(job.id)
                    model.editAnswers(job.id) { JobAnswers("First reviewed message", consentStore = true, consentMarketing = false) }
                }
            }
            compose.onNodeWithText("Auto Apply").performClick()
            clickInApply("Prepare application review")
            await { !model.state.value.busy && model.state.value.plan != null }
            val earlier = model.state.value.plan!!
            assertEquals(3, earlier.items.count { it.state == "ready" })
            // Changing tabs keeps the explicit No answer, and changing a message
            // invalidates the earlier unapproved review without submitting it.
            compose.onNodeWithText("Jobs").performClick()
            compose.onNodeWithText("Auto Apply").performClick()
            assertTrue(model.state.value.answers.values.all { it.consentMarketing == false })
            val changed = model.state.value.jobs.first().id
            compose.runOnIdle { model.editAnswers(changed) { it.copy(comments = "Updated reviewed message") } }
            clickInApply("Stop earlier review and prepare update")
            await { !model.state.value.busy && model.state.value.plan != null }
            val plan = model.state.value.plan!!
            assertNotEquals(earlier.id, plan.id)
            assertEquals(3, plan.items.count { it.state == "ready" })
            plan.items.forEach {
                assertEquals("Single", it.payload.getString("name"))
                assertEquals(true, it.payload.getBoolean("consentStore"))
                assertEquals(false, it.payload.getBoolean("consentMarketing"))
                assertEquals(expectedHash, it.resume?.sha256)
            }
            compose.onNodeWithTag("apply-list").performScrollToNode(hasText("Review what will be shared."))
            compose.onNodeWithText("Review what will be shared.").assertIsDisplayed()
            capture("acceptance-prepared.png")
            approve()
            await(30_000) {
                model.state.value.receipts.any { it.state == "uncertain" } &&
                    model.state.value.receipts.any { it.state == "confirmed" } &&
                    model.state.value.receipts.any { it.state == "rate_limited" }
            }
            assertEquals(0, model.state.value.receipts.count(ApplicationReceipt::verified))
            assertTrue(model.state.value.receipts.all(ApplicationReceipt::testMode))
            val recovered = model.state.value.recoverablePlans.first { it.id == plan.id }
            compose.runOnIdle { model.reviewRecovered(recovered) }
            await { model.state.value.plan?.id == plan.id }
            compose.onNodeWithTag("apply-list").performScrollToNode(hasText(approval))
            compose.onNodeWithText(approval).assertIsOff()
            approve()
            await(30_000) { model.state.value.receipts.count { it.state == "confirmed" } == 2 }
            assertEquals(1, model.state.value.receipts.count { it.state == "uncertain" })
            assertEquals(0, model.state.value.receipts.count(ApplicationReceipt::verified))
            compose.onNodeWithText("Receipts").performClick()
            compose.onNodeWithTag("receipts-list").performScrollToNode(hasText("verified application receipts"))
            compose.onNodeWithText("verified application receipts").assertIsDisplayed()
            capture("acceptance-receipts.png")

            val timeout = model.state.value.jobs.first { it.url == urls[1] }
            compose.runOnIdle { model.state.value.selected.filter { it != timeout.id }.forEach(model::toggleJob) }
            compose.onNodeWithText("Auto Apply").performClick()
            clickInApply("Prepare application review")
            await { !model.state.value.busy && model.state.value.plan != null }
            assertEquals("blocked", model.state.value.plan!!.items.single().state)
            assertEquals(0, model.state.value.plan!!.items.count(ReviewItem::canSubmitNow))
            assertEquals(1, model.state.value.receipts.count { it.state == "uncertain" })
        } finally { resolver.delete(file, null, null) }
    }

    private fun clickInApply(label: String) {
        compose.onNodeWithTag("apply-list").performScrollToNode(hasText(label))
        compose.onNodeWithText(label).performClick()
    }
    private fun approve() {
        compose.onNodeWithTag("apply-list").performScrollToNode(hasText(approval))
        compose.onNodeWithText(approval).performClick()
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
