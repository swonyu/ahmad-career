package com.saleh.careerfinder

import android.app.Application
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.util.Base64
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.awaitCancellation
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.File
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/** Real local state and renderer boundaries. No employer, account-provider or public-service requests. */
class WorkspaceSafetyRegressionTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val application = instrumentation.targetContext.applicationContext as Application
    private val owners = mutableListOf<ViewModelStore>()
    private val files = mutableListOf<File>()
    private val job = Opportunity("local-fixture", "https://jobs.example.org/role?id=7", "Fixture role", "Fixture employer", "", "", true)
    private val connection = Connection("https://fixture.example.org", "workspace-one", "never-export-this-token", Instant.now().plusSeconds(3600).toString())

    private class Store : PrivateStore {
        val values = ConcurrentHashMap<String, String>()
        val writes = AtomicInteger()
        override fun read(name: String) = values[name]?.let(::JSONObject)
        override fun write(name: String, value: JSONObject) { requirePrivateCapacity(value); values[name] = value.toString(); writes.incrementAndGet() }
        override fun remove(name: String) { values.remove(name) }
        override fun names() = values.keys.toSet()
        override fun startFreshPreservingExisting() { error("Not used by these fixtures") }
    }
    private class Service(var connection: Connection) : CareerService {
        val writes = AtomicInteger()
        override suspend fun pair(origin: String, code: String) = connection
        override suspend fun request(connection: Connection, method: String, route: String, body: JSONObject?): JSONObject {
            if (method != "GET") { writes.incrementAndGet(); error("This fixture does not authorize service writes: $route") }
            require(route == "workspace")
            return JSONObject().put("workspaceId", connection.workspaceId).put("mode", "local")
                .put("profile", ProfileDraft().apiJson().put("revision", 0).put("resume", JSONObject.NULL))
                .put("jobs", JSONArray()).put("attempts", JSONArray()).put("activePlanIds", JSONArray())
                .put("recoverablePlans", JSONArray()).put("capabilities", JSONObject().put("liveEnabled", false))
        }
    }
    private fun main(block: () -> Unit) = instrumentation.runOnMainSync(block)
    private fun await(check: () -> Boolean) {
        val until = System.nanoTime() + 10_000_000_000
        while (!check() && System.nanoTime() < until) Thread.sleep(10)
        assertTrue("Expected local fixture state", check())
    }
    private fun model(store: Store, service: Service = Service(connection)): CareerViewModel {
        lateinit var model: CareerViewModel
        main {
            model = CareerViewModel(application, store, service, waitForPoll = { awaitCancellation() })
            owners += ViewModelStore().apply { put("workspace-safety", model) }
        }
        await { model.state.value.loaded && !model.state.value.busy }
        return model
    }
    private fun file(bytes: ByteArray, suffix: String = ".json") = File.createTempFile("workspace-fixture-", suffix, application.cacheDir)
        .also { it.writeBytes(bytes); files += it }
    private fun pdf(pages: Int = 1): ByteArray {
        val document = PdfDocument()
        try {
            val paint = Paint().apply { textSize = 10f }
            repeat(pages) { index ->
                val page = document.startPage(PdfDocument.PageInfo.Builder(120, 120, index + 1).create())
                page.canvas.drawText("Synthetic page ${index + 1}", 8f, 30f, paint)
                document.finishPage(page)
            }
            return ByteArrayOutputStream().use { output -> document.writeTo(output); output.toByteArray() }
        } finally {
            document.close()
        }
    }
    private fun resume(bytes: ByteArray, name: String = "Original.pdf") = Resume(name, bytes.size.toLong(), BoundaryPolicy.sha256(bytes), Base64.encodeToString(bytes, Base64.NO_WRAP))
    private fun expectInvalid(block: () -> Unit) {
        try { block(); fail("Expected malformed data to be refused") } catch (_: IllegalArgumentException) { }
    }
    @After fun cleanup() { main { owners.forEach(ViewModelStore::clear) }; files.forEach(File::delete) }

    @Test fun malformedNestedLocalValues_preserveOriginalFile_andPreventAnyRewrite() {
        val mutations = listOf<(JSONObject) -> Unit>(
            { it.put("jobs", "not-an-array") },
            { it.put("jobs", JSONArray().put(job.privateJson()).put("not-a-job")) },
            { it.put("jobs", JSONArray().put(job.privateJson().put("title", 42))) },
            { it.put("profile", JSONObject().put("firstName", false)) },
            { it.put("profile", JSONObject().put("skills", JSONArray().put("valid").put(7))) },
            { it.put("selected", JSONArray().put(job.id).put(7)) },
            { it.put("profileDirty", "true") },
            { it.put("answers", JSONObject().put(job.id, "not-an-answer")) },
            { it.put("answers", JSONObject().put(job.id, JSONObject().put("comments", false))) },
            { it.put("receipts", JSONArray().put("not-a-receipt")) },
            { it.put("applicationRecords", JSONObject.NULL) },
            { it.put("futureUnrecognizedField", JSONObject().put("privateData", "keep me")) }
        )
        for (mutate in mutations) {
            val original = JSONObject().put("schema", 1).apply(mutate).toString()
            val store = Store().apply { values["workspace-unpaired"] = original }
            val model = model(store)
            assertTrue(model.state.value.storageBlocked)
            main { model.editProfile { it.copy(firstName = "Must not replace malformed data") }; model.saveProfile() }
            assertEquals(original, store.values["workspace-unpaired"])
            assertEquals(0, store.writes.get())
        }
    }

    @Test fun partialLegacyProfileAndBlankNewProfile_remainSupported() {
        val legacy = JSONObject().put("schema", 1).put("profile", JSONObject().put("firstName", "Single name").put("draftResume", JSONObject.NULL))
        val restored = WorkspaceStorage.decode(legacy, null)
        assertEquals("Single name", restored.profile.firstName)
        assertFalse(restored.storageBlocked)
        val blank = WorkspaceStorage.decode(null, null)
        assertEquals(ProfileDraft(), blank.profile)
        assertTrue(blank.jobs.isEmpty()); assertTrue(blank.applicationRecords.isEmpty()); assertTrue(blank.receipts.isEmpty())
    }

    @Test fun unreadablePDF_preservesEarlierBytes_andValidRenderedPDFCanReplaceIt() {
        val old = resume(pdf())
        val store = Store().apply { values["workspace-unpaired"] = WorkspaceStorage.encode(CareerUiState(profile = ProfileDraft(resume = old))).toString() }
        val model = model(store); val original = store.values["workspace-unpaired"]
        val invalid = file("%PDF-123".toByteArray(), ".pdf")
        main { model.choosePDF(Uri.fromFile(invalid)) }; await { !model.state.value.busy }
        assertNotNull(model.state.value.error); assertFalse(model.state.value.storageBlocked)
        assertEquals(old, model.state.value.profile.resume); assertEquals(original, store.values["workspace-unpaired"])
        val replacement = pdf(2); val valid = file(replacement, ".pdf")
        main { model.choosePDF(Uri.fromFile(valid)) }; await { !model.state.value.busy }
        assertNull(model.state.value.error); assertEquals(BoundaryPolicy.sha256(replacement), model.state.value.profile.resume!!.sha256)
    }

    @Test fun PDFCapacityFailure_isRecoverable_andNeverReplacesTheEarlierResume() {
        val old = resume(pdf())
        val before = CareerUiState(profile = ProfileDraft(headline = "x".repeat(BoundaryPolicy.MAX_PRIVATE_BYTES - 15_000), resume = old))
        val stored = WorkspaceStorage.encode(before); requirePrivateCapacity(stored)
        val store = Store().apply { values["workspace-unpaired"] = stored.toString() }
        val model = model(store); val original = store.values["workspace-unpaired"]
        val replacement = file(pdf(200), ".pdf")
        main { model.choosePDF(Uri.fromFile(replacement)) }; await { !model.state.value.busy }
        assertNotNull(model.state.value.error); assertFalse(model.state.value.storageBlocked)
        assertEquals(old, model.state.value.profile.resume); assertEquals(original, store.values["workspace-unpaired"])
        main { model.editProfile { it.copy(headline = "Shorter private draft") }; model.saveProfile() }; await { !model.state.value.busy }
        assertFalse(model.state.value.storageBlocked)
        main { model.choosePDF(Uri.fromFile(replacement)) }; await { !model.state.value.busy }
        assertNull(model.state.value.error); assertNotEquals(old.sha256, model.state.value.profile.resume!!.sha256)
    }

    @Test fun dirtyRecordDismissal_requiresChoice_andKeepDraftSurvivesRestartWithoutChangingStatus() {
        val store = Store().apply { values["workspace-unpaired"] = WorkspaceStorage.encode(CareerUiState(jobs = listOf(job))).toString() }
        val model = model(store)
        main {
            model.openApplicationRecord(job)
            model.editApplicationRecordDraft({ it.copy(stage = ApplicationStage.APPLIED, note = "Unsaved private detail") })
            model.closeApplicationRecord()
        }
        val editor = model.state.value.applicationRecordEditor!!
        assertTrue(editor.confirmClose); assertTrue(model.state.value.applicationRecords.isEmpty()); assertTrue(model.state.value.manualApplied.isEmpty())
        main { model.keepApplicationRecordDraft(editor.token) }; await { !model.state.value.busy }
        assertNull(model.state.value.applicationRecordEditor)
        val restarted = model(store)
        main { restarted.openApplicationRecord(job) }
        assertEquals("Unsaved private detail", restarted.state.value.applicationRecordEditor!!.draft.note)
        assertEquals(ApplicationStage.APPLIED, restarted.state.value.applicationRecordEditor!!.draft.stage)
        assertTrue(restarted.state.value.applicationRecords.isEmpty()); assertTrue(restarted.state.value.receipts.isEmpty())
        main { restarted.discardApplicationRecordDraft(restarted.state.value.applicationRecordEditor!!.token) }; await { !restarted.state.value.busy }
        assertTrue(model(store).state.value.recordDrafts.isEmpty())
    }

    @Test fun equivalentOriginCopies_migrateWithoutOverwritingLegacy_andKeepAccountIsolation() {
        val raw = "https://fixture.example.org:00443"
        val legacyKey = "workspace-" + BoundaryPolicy.legacyWorkspaceKey(raw, connection.workspaceId)
        val canonicalKey = "workspace-" + BoundaryPolicy.workspaceKey(connection.origin, connection.workspaceId)
        val original = WorkspaceStorage.encode(CareerUiState(profile = ProfileDraft(firstName = "Earlier private draft"), profileDirty = true)).toString()
        val anotherKey = "workspace-" + BoundaryPolicy.workspaceKey(connection.origin, "different-person")
        val store = Store().apply {
            values["connection"] = connection.toJson().put("origin", raw).toString()
            values[legacyKey] = original; values[anotherKey] = "do not touch this other account"
        }
        val model = model(store)
        assertEquals(connection.origin, model.state.value.connection!!.origin)
        assertEquals("Earlier private draft", model.state.value.profile.firstName)
        assertEquals(original, store.values[legacyKey]); assertTrue(store.values.containsKey(canonicalKey))
        assertEquals("do not touch this other account", store.values[anotherKey])
        assertTrue(legacyKey in model.state.value.preservedWorkspaceCopies)
    }

    @Test fun portableBackup_preservesHistoryUnicodeAndDrafts_withoutCredentialsOrApprovalAuthority() {
        val record = ApplicationRecordBundle.create(job, ApplicationRecord(ApplicationStage.APPLIED, "2024-02-29", "2026-12-01", "😀".repeat(2_000), true))
            .edited(ApplicationRecordDraft(ApplicationStage.SAVED, note = "Explicit correction"), true)
        val scope = CareerUiState(connection = connection).privateScope
        val draft = RecordDraftCheckpoint(scope, record.identity, job, record.revision, ApplicationRecordDraft(note = "Unfinished"))
        val receipt = ApplicationReceipt("attempt-fixture", "Fixture role", "Fixture employer", "confirmed", "provider-fixture", Instant.now().toString(), "", "live", "a".repeat(64), "lever")
        val snapshot = CareerUiState(connection = connection, profile = ProfileDraft(firstName = "Individual"), jobs = listOf(job),
            applicationRecords = mapOf(record.identity to record), recordDrafts = mapOf(record.identity to draft), receipts = listOf(receipt),
            continuationHolds = setOf("stop-kept"), activePlans = listOf("never-import-this-active-plan"))
        val exported = WorkspaceTransfer.export(snapshot, null, false)
        val text = exported.toString()
        assertFalse(text.contains(connection.token)); assertFalse(text.contains("never-import-this-active-plan")); assertFalse(text.contains("approvedAt"))
        val preview = WorkspaceTransfer.decode(exported, "workspace-unpaired")
        val restored = preview.snapshot.applicationRecords.getValue(record.identity)
        assertEquals(record.current.id, restored.current.id); assertEquals(record.history.map { it.id }, restored.history.map { it.id })
        assertEquals("😀".repeat(2_000), restored.history.single().record.note)
        assertEquals("Unfinished", preview.snapshot.recordDrafts.getValue(record.identity).draft.note)
        assertTrue(preview.snapshot.receipts.isEmpty()); assertFalse(preview.snapshot.importedReceipts.single().verified)
        assertTrue(preview.snapshot.activePlans.isEmpty()); assertNull(preview.snapshot.plan)
        // A common iPhone file has no Android extension; every record version still survives.
        exported.put("platform", "ios").put("extensions", JSONObject())
        val common = WorkspaceTransfer.decode(exported, "workspace-unpaired")
        assertEquals(2, common.snapshot.applicationRecords.getValue(record.identity).let { 1 + it.history.size + it.alternatives.size })
        assertEquals(ProfileDraft(firstName = "Individual"), common.snapshot.profile)
    }

    @Test fun sharedIPhoneAndroidWireFixture_decodesNewRecordDraftPDFHistoryAndHolds() {
        val fixture = instrumentation.context.assets.open("phone-workspace-v1.json").bufferedReader().use { JSONObject(it.readText()) }
        val preview = WorkspaceTransfer.decode(fixture, "workspace-unpaired")
        assertEquals(2, preview.snapshot.jobs.size)
        assertEquals(4_096, preview.snapshot.jobs.first().url.length)
        assertEquals(500, preview.snapshot.jobs.first().company.length)
        val record = preview.snapshot.applicationRecords.values.single()
        assertEquals(1, record.history.size); assertFalse(record.appliedElsewhere)
        val draft = preview.snapshot.recordDrafts.values.single()
        assertEquals(0, draft.baseRevision)
        assertEquals(setOf("portable-stop-fixture"), preview.snapshot.continuationHolds)
        val bytes = Base64.decode(preview.snapshot.profile.resume!!.dataBase64, Base64.NO_WRAP)
        try { ReadablePDF.validate(application, bytes) } finally { bytes.fill(0) }
        val exported = WorkspaceTransfer.export(preview.snapshot, null, false)
        val newDraft = exported.getJSONObject("data").getJSONArray("recordDrafts").getJSONObject(0)
        assertFalse(newDraft.has("recordID")); assertFalse(newDraft.has("revision"))
        // Optional null values from another JSON encoder have the same absent meaning.
        fixture.getJSONObject("data").getJSONArray("recordDrafts").getJSONObject(0).put("recordID", JSONObject.NULL).put("revision", JSONObject.NULL)
        assertEquals(0, WorkspaceTransfer.decode(fixture, "workspace-unpaired").snapshot.recordDrafts.values.single().baseRevision)
    }

    @Test fun importIsAnExplicitLocalMerge_foreignHoldsAndEmployerConsentsAreNotAdopted() {
        val record = ApplicationRecordBundle.create(job, ApplicationRecord(note = "Imported private note"))
        val source = CareerUiState(connection = connection, jobs = listOf(job), applicationRecords = mapOf(record.identity to record),
            answers = mapOf(job.id to JobAnswers("Personal draft answer", true, true)), continuationHolds = setOf("foreign-plan"))
        val backup = file(WorkspaceTransfer.export(source, null, false).toString().toByteArray())
        val store = Store(); val service = Service(connection); val model = model(store, service)
        main { model.inspectWorkspaceImport(Uri.fromFile(backup), "workspace-unpaired") }; await { !model.state.value.busy }
        assertTrue(model.state.value.jobs.isEmpty()); assertTrue(model.state.value.applicationRecords.isEmpty())
        val token = model.state.value.workspaceImport!!.token
        main { model.importWorkspace(token, false, false, true, false) }; await { !model.state.value.busy }
        assertEquals("Imported private note", model.state.value.applicationRecords.getValue(record.identity).current.record.note)
        val answer = model.state.value.answers.getValue(model.state.value.jobs.single().id)
        assertEquals("Personal draft answer", answer.comments); assertNull(answer.consentStore); assertNull(answer.consentMarketing)
        assertTrue(model.state.value.continuationHolds.isEmpty()); assertEquals(0, service.writes.get())
    }

    @Test fun malformedBackupAndStalePickerScope_doNotMutateTheCurrentWorkspace() {
        val exported = WorkspaceTransfer.export(CareerUiState(), null, false)
        exported.getJSONObject("data").put("activePlans", JSONArray().put("unauthorized-plan"))
        expectInvalid { WorkspaceTransfer.decode(exported, "workspace-unpaired") }
        val store = Store().apply { values["workspace-unpaired"] = WorkspaceStorage.encode(CareerUiState(profile = ProfileDraft(firstName = "Kept"))).toString() }
        val model = model(store); val original = store.values["workspace-unpaired"]
        val replacement = file(pdf(), ".pdf")
        main { model.choosePDF(Uri.fromFile(replacement), "workspace-that-is-not-current") }; await { !model.state.value.busy }
        assertEquals("Kept", model.state.value.profile.firstName); assertNull(model.state.value.profile.resume)
        assertEquals(original, store.values["workspace-unpaired"])
    }

    @Test fun localDeletion_isScoped_andStaleConfirmationCannotDeleteAnotherWorkspace() {
        val current = "workspace-" + BoundaryPolicy.workspaceKey(connection.origin, connection.workspaceId)
        val other = "workspace-" + BoundaryPolicy.workspaceKey(connection.origin, "another-person")
        val phone = WorkspaceStorage.encode(CareerUiState(profile = ProfileDraft(firstName = "Separate phone draft"))).toString()
        val store = Store().apply {
            values["connection"] = connection.toJson().toString(); values[current] = WorkspaceStorage.encode(CareerUiState(connection = connection)).toString()
            values[other] = "preserve every other-account byte"; values["workspace-unpaired"] = phone
        }
        val model = model(store)
        main { model.deleteLocalWorkspace("workspace-unpaired") }; await { !model.state.value.busy }
        assertTrue(store.values.containsKey(current)); assertTrue(store.values.containsKey("connection"))
        main { model.deleteLocalWorkspace(current) }; await { !model.state.value.busy }
        assertFalse(store.values.containsKey(current)); assertFalse(store.values.containsKey("connection"))
        assertEquals("preserve every other-account byte", store.values[other]); assertEquals(phone, store.values["workspace-unpaired"])
        assertEquals("Separate phone draft", model.state.value.profile.firstName)
    }
}
