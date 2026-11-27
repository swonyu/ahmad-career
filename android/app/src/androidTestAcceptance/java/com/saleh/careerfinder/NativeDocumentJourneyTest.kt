package com.saleh.careerfinder

import android.os.SystemClock
import android.text.format.DateFormat
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelProvider
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.Description
import org.junit.runners.model.Statement
import java.io.File
import java.time.LocalDate
import java.util.Locale

/**
 * Acceptance-variant only, two required invocations in separate actual processes.
 * The normal MainActivity, clients, document launcher and encrypted store do the work.
 */
class NativeDocumentJourneyTest {
    private val runtime = NativeJourneyRuntime()
    private val compose = createAndroidComposeRule<MainActivity>()
    private val bootstrap = TestRule { base: Statement, _: Description ->
        object : Statement() {
            override fun evaluate() {
                runtime.start()
                base.evaluate()
            }
        }
    }
    @get:Rule val rules: TestRule = RuleChain.outerRule(bootstrap).around(compose)
    private lateinit var ui: NativeJourneyUi
    private lateinit var model: CareerViewModel
    private var step = "start"

    @Test fun nativeDocumentJourneyFirstProcess_usesActualPickerAndPersistsPreparedA() = guarded("first") {
        step("blank") {
            ready()
            assertTrue(model.state.value.profile.firstName.isEmpty())
            assertTrue(model.state.value.profile.email.isEmpty())
            assertNull(model.state.value.profile.resume)
            assertEquals(0, model.state.value.profile.revision)
            assertTrue(model.state.value.jobs.isEmpty() && model.state.value.receipts.isEmpty())
            assertTrue(model.state.value.applicationRecords.isEmpty() && model.state.value.selected.isEmpty())
            assertFalse(model.state.value.liveEnabled)
            assertTrue(model.state.value.testService)
            ui.tab("profile")
            ui.wholeText("profile-list", ui.field("First or single name"), "01-blank-profile")
            runtime.checkpoint("blank", model)
        }

        step("contact-saved") {
            ui.replace("profile-list", ui.field("First or single name"), "Jamie", "02-first-name-keyboard")
            ui.replace("profile-list", ui.field("Email"), "jamie.native@example.com", "02-email-keyboard")
            ui.dismissKeyboard()
            ui.click(ui.button("Save profile to workspace"), "profile-list")
            waitProfile(1, null)
            runtime.checkpoint("contactSaved", model)
        }

        step("job-saved") {
            ui.tab("jobs")
            ui.discoveryTab()
            ui.click(ui.button("Choose employer boards · recommended"), "discovery-list")
            ui.waitStrict("The real employer catalog must finish") {
                val value = model.discovery.state.value
                !value.catalogLoading && value.catalog?.defaults == listOf(NativeJourneyRuntime.SOURCE_ID) &&
                    value.catalog?.sources?.singleOrNull()?.id == NativeJourneyRuntime.SOURCE_ID
            }
            val board = ui.description("Search the public employer board for " + NativeJourneyRuntime.COMPANY)
            ui.reveal("discovery-sources", board)
            ui.unique(board).assertIsOn()
            ui.click(ui.button("Use selected boards"))
            ui.waitStrict("Explicit selected employer board must be applied") {
                model.discovery.state.value.filters.sources == listOf(NativeJourneyRuntime.SOURCE_ID)
            }
            ui.replace("discovery-list", ui.field("Job title or keyword"), NativeJourneyRuntime.PRIMARY_TITLE)
            ui.replace("discovery-list", ui.field("Location (optional)"), "Riyadh")
            ui.dismissKeyboard()
            searchAndWait(1)
            ui.wholeText("discovery-list", hasText(NativeJourneyRuntime.PRIMARY_TITLE, substring = false), "03-search-primary")
            val readDetails = hasContentDescription(ui.strings.format("Read details for {0}", listOf(NativeJourneyRuntime.PRIMARY_TITLE)))
            ui.click(readDetails, "discovery-list")
            ui.capture("03-job-details")
            saveDiscovered(NativeJourneyRuntime.PRIMARY_TITLE)
            ui.waitStrict("The real primary job POST and workspace refresh must finish") {
                val state = model.state.value
                !state.busy && state.jobs.size == 1 && state.jobs.single().url == NativeJourneyRuntime.PRIMARY_URL &&
                    !state.jobs.single().localOnly && state.error == null
            }
            ui.tab("jobs"); ui.savedTab()
            ui.wholeText("jobs-list", hasText(NativeJourneyRuntime.PRIMARY_TITLE, substring = false), "03-saved-primary")
            runtime.checkpoint("jobSaved", model)
        }

        step("picker-cancelled") {
            ui.tab("profile")
            val profileBefore = NativeJourneyRuntime.canonical(model.state.value.profile.privateJson())
            ui.click(ui.button("Choose PDF résumé"), "profile-list")
            ui.waitForDocumentPicker()
            ui.capture("04-real-picker-before-cancel", includeCompose = false)
            ui.cancelDocumentPicker()
            ui.waitStrict("Cancel must return to the unchanged real profile") {
                model.state.value.profile.resume == null && !model.state.value.busy &&
                    NativeJourneyRuntime.canonical(model.state.value.profile.privateJson()) == profileBefore
            }
            ui.wholeText("profile-list", ui.button("Choose PDF résumé"), "04-profile-after-cancel")
            runtime.checkpoint("pickerCancelled", model)
        }

        step("profile-a") {
            chooseAndSavePDF("CV-A.pdf", 2)
            ui.wholeText("profile-list", hasText("CV-A.pdf", substring = false), "05-current-cv-a")
            runtime.checkpoint("profileA", model)
        }

        step("prepared-a") {
            ui.tab("jobs"); ui.savedTab()
            val selection = ui.description("Select " + NativeJourneyRuntime.PRIMARY_TITLE + " at " +
                NativeJourneyRuntime.COMPANY + " for Auto Apply review")
            ui.reveal("jobs-list", selection)
            ui.unique(selection).assertIsOff()
            ui.click(selection)
            ui.unique(selection).assertIsOn()
            ui.click(ui.button("Continue to Auto Apply"), "jobs-list")
            ui.click(ui.button("Prepare application review"), "apply-list")
            ui.waitStrict("Actual prepare must return one unapproved test review with CV-A") {
                val state = model.state.value
                val plan = state.plan
                !state.busy && state.error == null && plan != null && plan.unapproved && plan.profileRevision == 2 &&
                    plan.items.size == 1 && plan.items.single().state == "ready" &&
                    plan.items.single().resume?.name == "CV-A.pdf" &&
                    plan.items.single().resume?.sha256 == NativeJourneyRuntime.PDF_SHA && state.activePlans.isEmpty()
            }
            val plan = checkNotNull(model.state.value.plan)
            val item = plan.items.single()
            val reviewKey = "review-" + model.state.value.privateScope + "-" + plan.id + "-" + item.jobId
            ui.click(hasTestTag("application-cv-details-" + reviewKey), "apply-list")
            ui.wholeText("apply-list", hasTestTag("application-cv-filename-" + reviewKey), "06-prepared-a-filename")
            ui.unique(hasTestTag("application-cv-filename-" + reviewKey)).assertTextEquals("CV-A.pdf")
            ui.wholeText("apply-list", hasTestTag("application-cv-revision-" + reviewKey), "06-prepared-a-revision")
            ui.unique(hasTestTag("application-cv-revision-" + reviewKey)).assertTextEquals("2")
            // No approval checkbox, submit, stop or continuation action is touched.
            ui.tab("receipts")
            ui.click(ui.button("Refresh outcomes"), "receipts-list")
            ui.waitStrict("Actual Refresh outcomes must fetch and persist the ready A attempt") {
                val state = model.state.value
                !state.busy && state.error == null && immutableA(state)
            }
            showHistoricalA("06-fetched-prepared-a")
            runtime.checkpoint("preparedA", model)
        }

        step("profile-b") {
            ui.tab("profile")
            chooseAndSavePDF("CV-B.pdf", 3)
            ui.wholeText("profile-list", hasText("CV-B.pdf", substring = false), "07-current-cv-b")
            assertTrue(immutableA(model.state.value))
            showHistoricalA("07-historical-a-after-b")
            runtime.checkpoint("profileB", model)
        }

        step("follow-up-saved") {
            ui.tab("jobs"); ui.savedTab()
            openPrimaryRecord()
            val followUpButton = hasContentDescription(ui.strings.format("Choose {0}",
                listOf(ui.strings("Follow-up date (optional)"))))
            ui.click(followUpButton, "application-record-editor")
            val dateRoot = isRoot() and hasAnyDescendant(ui.text("Follow-up date"))
            ui.waitStrict("The real date dialog must expose one actual input") {
                compose.onAllNodes(hasSetTextAction() and hasAnyAncestor(dateRoot)).fetchSemanticsNodes().size == 1
            }
            val dateInput = hasSetTextAction() and hasAnyAncestor(dateRoot)
            ui.replaceDialog(dateInput, dateInputDigits(runtime.followUpDay), "08-date-input-keyboard")
            ui.dismissKeyboard()
            ui.click(ui.button("Use date") and hasAnyAncestor(dateRoot))
            ui.waitStrict("The selected date must reach the actual record draft") {
                model.state.value.applicationRecordEditor?.draft?.followUpDate == runtime.followUpDay
            }
            ui.replace("application-record-editor", ui.field("Private note (optional)"), NativeJourneyRuntime.NOTE,
                "08-follow-up-note-keyboard")
            ui.dismissKeyboard()
            ui.click(ui.button("Save record on this phone"))
            ui.waitStrict("The real private record save must finish without marking an application") {
                val state = model.state.value
                !state.busy && state.applicationRecordEditor == null && validFollowUp(state)
            }
            ui.wholeText("jobs-list", hasTestTag("private-follow-up-date"), "08-saved-follow-up")
            runtime.checkpoint("followUpSaved", model)
        }

        step("close-secondary") {
            ui.tab("jobs"); ui.discoveryTab()
            searchAndWait(2)
            ui.wholeText("discovery-list", hasText(NativeJourneyRuntime.SECONDARY_TITLE, substring = false), "09-secondary-before-closure")
            runtime.checkpoint("closeSecondary", model)
        }

        step("closed-result") {
            saveDiscovered(NativeJourneyRuntime.SECONDARY_TITLE)
            ui.waitStrict("The closed posting must report its actual rejection while keeping the local saved row") {
                val state = model.state.value
                !state.busy && state.jobs.size == 2 &&
                    state.jobs.singleOrNull { it.url == NativeJourneyRuntime.SECONDARY_URL }?.localOnly == true &&
                    state.error == CLOSED_MESSAGE
            }
            val error = ui.text(CLOSED_MESSAGE)
            ui.waitStrict("The closure explanation must be present in the selected language") { ui.present(error) }
            assertFullyVisible(ui.unique(error))
            ui.capture("10-closed-posting", ui.targetGeometry(error))
            assertTrue(immutableA(model.state.value) && validFollowUp(model.state.value))
            runtime.checkpoint("closedResult", model)
        }

        step("outage") { runtime.checkpoint("outage", model) }
        step("outage-result") {
            ui.tab("jobs"); ui.discoveryTab()
            ui.click(ui.button("Search jobs"), "discovery-list")
            ui.waitStrict("The real unavailable employer result must retain both previous openings") {
                val discovery = model.discovery.state.value
                !discovery.loading && discovery.jobs.map { it.url }.toSet() ==
                    setOf(NativeJourneyRuntime.PRIMARY_URL, NativeJourneyRuntime.SECONDARY_URL) &&
                    discovery.sources.any { it.status == "stale" || it.status == "unavailable" || it.error != null }
            }
            val source = model.discovery.state.value.sources.single()
            val status = ui.text(DiscoveryPresentation.sourceAvailabilityKey(source.status, false))
            ui.wholeText("discovery-list", status, "12-completed-outage-source")
            runtime.checkpoint("outageResult", model)
        }

        step("network-disconnected") { runtime.checkpoint("networkDisconnected", model) }
        step("network-failure") {
            ui.tab("receipts")
            ui.click(ui.button("Refresh outcomes"), "receipts-list")
            ui.waitStrict("Refresh must fail after the actual owned HTTPS listener closes") {
                !model.state.value.busy && model.state.value.error == OFFLINE_MESSAGE
            }
            val error = ui.text(OFFLINE_MESSAGE)
            ui.waitStrict("Actual offline recovery copy must be visible") { ui.present(error) }
            assertFullyVisible(ui.unique(error))
            ui.capture("14-listener-offline-refresh", ui.targetGeometry(error))
            assertProfileBAndSavedA()
            runtime.checkpoint("networkFailure", model)
            runtime.finishFirstProcess()
        }
    }

    @Test fun nativeDocumentJourneyRestoredProcess_keepsAAndBOffline() = guarded("restore") {
        step("restarted") {
            ui.waitStrict("The new actual app process must finish its refused initial refresh without discarding durable work") {
                val state = model.state.value
                state.loaded && !state.busy && state.error == OFFLINE_MESSAGE &&
                    !state.storageBlocked && !state.requiresPairing
            }
            assertProfileBAndSavedA()
            val error = ui.text(OFFLINE_MESSAGE)
            ui.waitStrict("The restarted process must explain actual offline refresh failure") { ui.present(error) }
            assertFullyVisible(ui.unique(error))
            ui.capture("15-restarted-offline-feedback", ui.targetGeometry(error))
            ui.tab("profile")
            ui.wholeText("profile-list", hasText("CV-B.pdf", substring = false), "15-restarted-current-b")
            showHistoricalA("15-restarted-historical-a")
            ui.tab("jobs"); ui.savedTab()
            ui.wholeText("jobs-list", hasTestTag("private-follow-up-date"), "15-restarted-follow-up")
            openPrimaryRecord()
            ui.reveal("application-record-editor", ui.field("Private note (optional)"))
            ui.unique(ui.field("Private note (optional)")).assertTextContains(NativeJourneyRuntime.NOTE, substring = false)
            ui.capture("15-restarted-private-note", ui.targetGeometry(ui.field("Private note (optional)"), "application-record-editor"))
            ui.click(ui.button("Close record"))
            ui.waitStrict("Read-only record inspection must close without changing its saved values") {
                model.state.value.applicationRecordEditor == null && validFollowUp(model.state.value)
            }
            runtime.checkpoint("restarted", model)
        }
        step("finished") {
            assertProfileBAndSavedA()
            assertTrue(model.state.value.activePlans.isEmpty())
            assertTrue(model.state.value.receipts.none { it.verified || it.applicationId.isNotEmpty() })
            runtime.checkpoint("finished", model)
            runtime.finishRestoreProcess()
        }
    }

    private fun guarded(expectedPhase: String, body: () -> Unit) {
        require(runtime.phase == expectedPhase) { "Each explicit process phase must run exactly its named method" }
        model = ViewModelProvider(compose.activity)[CareerViewModel::class.java]
        ui = NativeJourneyUi(compose, runtime)
        try {
            ui.verifyPhoneConfiguration()
            body()
        } catch (failure: Throwable) {
            ui.preserveFailure(step, failure)
            throw failure
        } finally { ui.close() }
    }

    private fun step(name: String, body: () -> Unit) {
        step = name
        println("NATIVE_JOURNEY_STEP name=" + name + " phase=" + runtime.phase + " started=true")
        body()
        println("NATIVE_JOURNEY_STEP name=" + name + " phase=" + runtime.phase + " completed=true")
    }

    private fun ready() = ui.waitStrict("The actual blank paired workspace must finish loading") {
        val state = model.state.value
        state.loaded && !state.busy && !state.storageBlocked && !state.requiresPairing && state.error == null &&
            state.connection == runtime.connection
    }

    private fun waitProfile(revision: Int, filename: String?) = ui.waitStrict("The actual profile PUT must save its exact revision and PDF name") {
        val state = model.state.value
        !state.busy && state.error == null && !state.profileDirty && state.profile.revision == revision &&
            state.profile.firstName == "Jamie" && state.profile.email == "jamie.native@example.com" &&
            state.profile.resume?.name == filename &&
            (filename == null || state.profile.resume?.sha256 == NativeJourneyRuntime.PDF_SHA)
    }

    private fun chooseAndSavePDF(name: String, revision: Int) {
        runtime.provisionDocument(name)
        ui.click(ui.button(if (model.state.value.profile.resume == null) "Choose PDF résumé" else "Replace PDF résumé"), "profile-list")
        ui.waitForDocumentPicker()
        ui.capture(if (name == "CV-A.pdf") "05-real-picker-a" else "07-real-picker-b", includeCompose = false)
        ui.selectDocument(name)
        ui.waitStrict("The normal ContentResolver import must supply the selected PDF bytes and display name") {
            val resume = model.state.value.profile.resume
            !model.state.value.busy && resume?.name == name && resume.sha256 == NativeJourneyRuntime.PDF_SHA &&
                resume.size == NativeJourneyRuntime.PDF_BYTES.toLong() && model.state.value.profileDirty
        }
        ui.click(ui.button("Save profile to workspace"), "profile-list")
        waitProfile(revision, name)
    }

    private fun searchAndWait(number: Int) {
        ui.click(ui.button("Search jobs"), "discovery-list")
        ui.waitStrict("Actual search " + number + " must finish with the two fixed employer results") {
            val state = model.discovery.state.value
            !state.loading && state.error == null && state.filters.query == NativeJourneyRuntime.PRIMARY_TITLE &&
                state.filters.location == "Riyadh" && state.filters.sources == listOf(NativeJourneyRuntime.SOURCE_ID) &&
                state.jobs.map { it.url }.toSet() == setOf(NativeJourneyRuntime.PRIMARY_URL, NativeJourneyRuntime.SECONDARY_URL)
        }
    }

    private fun saveDiscovered(title: String) {
        val save = hasContentDescription(ui.strings.format("Save {0} at {1}", listOf(title, NativeJourneyRuntime.COMPANY)))
        ui.click(save, "discovery-list")
    }

    private fun showHistoricalA(captureName: String) {
        ui.tab("receipts")
        val state = model.state.value
        assertTrue("A must be an actual fetched, undispatched test attempt", immutableA(state))
        val receipt = state.receipts.single()
        val key = "receipt-" + state.privateScope + "-" + receipt.id
        val disclosure = hasTestTag("application-cv-details-" + key)
        ui.reveal("receipts-list", disclosure)
        val status = ui.unique(disclosure).fetchSemanticsNode().config[SemanticsProperties.StateDescription]
        if (status == ui.strings("Collapsed")) ui.click(disclosure)
        else assertEquals(ui.strings("Expanded"), status)
        ui.wholeText("receipts-list", hasTestTag("application-cv-filename-" + key), captureName + "-filename")
        ui.unique(hasTestTag("application-cv-filename-" + key)).assertTextEquals("CV-A.pdf")
        ui.wholeText("receipts-list", hasTestTag("application-cv-revision-" + key), captureName + "-revision")
        ui.unique(hasTestTag("application-cv-revision-" + key)).assertTextEquals("2")
        // Retain actual wording separately; a host fact is not evidence of rendered copy.
        ui.wholeText("receipts-list", hasText(ui.strings.format("Test receipt · {0}", listOf(ui.strings("Prepared"))), substring = false), captureName + "-status")
    }

    private fun immutableA(state: CareerUiState): Boolean = state.receipts.singleOrNull()?.let {
        it.state == "ready" && it.testMode && !it.verified && it.applicationId.isEmpty() &&
            it.resumeName == "CV-A.pdf" && it.profileRevision == 2 && it.resumeSHA256 == NativeJourneyRuntime.PDF_SHA
    } == true && state.activePlans.isEmpty()

    private fun validFollowUp(state: CareerUiState): Boolean {
        val record = state.applicationRecords[BoundaryPolicy.jobIdentity(NativeJourneyRuntime.PRIMARY_URL)] ?: return false
        return record.current.record.stage == ApplicationStage.SAVED && !record.appliedElsewhere &&
            !record.current.record.appliedElsewhere && record.current.record.appliedDate.isEmpty() &&
            record.current.record.followUpDate == runtime.followUpDay && record.current.record.note == NativeJourneyRuntime.NOTE &&
            record.alternatives.isEmpty()
    }

    private fun assertProfileBAndSavedA() {
        val state = model.state.value
        assertTrue(state.connection == runtime.connection && state.privateScope == "workspace-" + runtime.workspaceKey)
        assertTrue(state.profile.revision == 3 && state.profile.resume?.name == "CV-B.pdf" &&
            state.profile.resume?.sha256 == NativeJourneyRuntime.PDF_SHA && !state.profileDirty)
        assertTrue(immutableA(state) && validFollowUp(state))
        assertTrue(state.jobs.map { it.url }.toSet() == setOf(NativeJourneyRuntime.PRIMARY_URL, NativeJourneyRuntime.SECONDARY_URL))
        assertFalse(state.jobs.single { it.url == NativeJourneyRuntime.PRIMARY_URL }.localOnly)
        assertTrue(state.jobs.single { it.url == NativeJourneyRuntime.SECONDARY_URL }.localOnly)
        assertTrue(state.manualApplied.isEmpty() && state.activePlans.isEmpty())
    }

    private fun openPrimaryRecord() {
        ui.click(ui.description("Application record for " + NativeJourneyRuntime.PRIMARY_TITLE + " at " +
            NativeJourneyRuntime.COMPANY), "jobs-list")
        ui.waitStrict("The selected role's actual private record must open") {
            model.state.value.applicationRecordEditor?.identity == BoundaryPolicy.jobIdentity(NativeJourneyRuntime.PRIMARY_URL)
        }
    }

    private fun dateInputDigits(iso: String): String {
        val day = LocalDate.parse(iso)
        val pattern = DateFormat.getBestDateTimePattern(ui.strings.locale, "yMd")
        val order = pattern.filter { it == 'y' || it == 'M' || it == 'd' }.toList().distinct()
        require(order.size == 3 && order.toSet() == setOf('y', 'M', 'd'))
        runtime.durableJSON(File(runtime.directory, "date-input-observation.json"), JSONObject().put("schemaVersion", 1)
            .put("locale", ui.strings.locale.toLanguageTag()).put("platformDatePattern", pattern)
            .put("fieldOrder", order.joinToString("")).put("targetISO", iso)
            .put("realSelectedISOIsStillRequired", true))
        return order.joinToString("") { item -> when (item) {
            'y' -> String.format(Locale.ROOT, "%04d", day.year)
            'M' -> String.format(Locale.ROOT, "%02d", day.monthValue)
            else -> String.format(Locale.ROOT, "%02d", day.dayOfMonth)
        } }
    }

    companion object {
        private const val CLOSED_MESSAGE = "The employer no longer lists this posting. No application was sent."
        private const val OFFLINE_MESSAGE = "The request could not be completed. Your saved records remain available. For an application, refresh receipts before trying again."
    }
}
