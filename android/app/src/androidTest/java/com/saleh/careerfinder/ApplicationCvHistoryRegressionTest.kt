package com.saleh.careerfinder

import android.app.Application
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.awaitCancellation
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

/** Synthetic, offline historical metadata and ownership checks. No PDF upload, provider or employer requests. */
class ApplicationCvHistoryRegressionTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val owners = mutableListOf<ViewModelStore>()
    private val job = Opportunity("cv-history-job", "https://example.invalid/cv-history", "Care role · دور رعاية",
        "Example Care", "Amman · عمّان", "JO", true)
    private val profileA = ProfileDraft(firstName = "Synthetic", email = "cv-history@example.invalid",
        resume = Resume("CV-A.pdf", 20, "a".repeat(64)), revision = 1)
    private val profileB = profileA.copy(resume = Resume("CV-B.pdf", 20, "b".repeat(64)), revision = 2)

    private class MemoryStore : PrivateStore {
        val records = ConcurrentHashMap<String, String>()
        @Volatile var failWrites = false
        override fun read(name: String): JSONObject? = records[name]?.let(::JSONObject)
        override fun write(name: String, value: JSONObject) {
            if (failWrites) throw java.io.IOException("Synthetic write failure")
            records[name] = value.toString()
        }
        override fun remove(name: String) { records.remove(name) }
        override fun startFreshPreservingExisting() { error("No storage reset in the CV fixture") }
    }
    private class Service : CareerService {
        val responses = ConcurrentHashMap<String, String>()
        val requests = CopyOnWriteArrayList<String>()
        override suspend fun pair(origin: String, code: String): Connection = error("No pairing in this fixture")
        override suspend fun request(connection: Connection, method: String, route: String, body: JSONObject?): JSONObject {
            require(method == "GET" && route == "workspace" && body == null) { "No writes or outbound operations in this fixture" }
            requests += method + " " + route
            return JSONObject(responses[connection.workspaceId] ?: error("No synthetic workspace response"))
        }
    }
    private fun main(block: () -> Unit) = instrumentation.runOnMainSync(block)
    private fun await(check: () -> Boolean) {
        val deadline = System.nanoTime() + 5_000_000_000
        while (System.nanoTime() < deadline) {
            if (check()) return
            Thread.sleep(10)
        }
        fail("Expected the synthetic state within five seconds")
    }
    private fun model(store: MemoryStore, service: Service = Service()): CareerViewModel {
        lateinit var model: CareerViewModel
        main {
            val discovery = object : DiscoveryService {
                override suspend fun sources() = DiscoveryCatalog(emptyList(), emptyList(), 4, "Synthetic CV history")
                override suspend fun search(filters: DiscoveryFilters, cursor: String?): DiscoveryPage = error("No discovery request in CV fixtures")
            }
            model = CareerViewModel(instrumentation.targetContext.applicationContext as Application, store, service,
                discoveryService = discovery, waitForPoll = { awaitCancellation() })
            owners += ViewModelStore().apply { put("cv-history-model", model) }
        }
        await { model.state.value.loaded && !model.state.value.busy }
        return model
    }
    private fun closeModels() { main { owners.forEach(ViewModelStore::clear) }; owners.clear() }
    @After fun cleanup() = closeModels()
    private fun reject(block: () -> Unit) {
        try { block() } catch (_: Exception) { return }
        fail("Malformed or unauthorized synthetic evidence must be rejected")
    }
    private fun receipt(name: Any? = "CV-A.pdf", revision: Any? = 1, state: String = "confirmed",
        evidence: String = "test", id: String = "cv-attempt-a"): JSONObject =
        JSONObject().put("id", id).put("planId", "cv-plan-a").put("jobId", job.id).put("title", job.title)
            .put("company", job.company).put("state", state).put("applicationId", if (state == "confirmed") "synthetic-reference" else "")
            .put("createdAt", "2026-11-21T12:00:00Z").put("evidenceMode", evidence).put("provider", "lever")
            .put("resumeName", name ?: JSONObject.NULL).put("profileRevision", revision ?: JSONObject.NULL)
            .put("resumeSHA256", "a".repeat(64))
    private fun review(profile: ProfileDraft) = JSONObject().put("id", "cv-plan-" + profile.revision)
        .put("digest", "d".repeat(64)).put("profileRevision", profile.revision).put("approvedAt", JSONObject.NULL)
        .put("expiresAt", Instant.now().plusSeconds(600).toString())
        .put("items", JSONArray(listOf(JSONObject().put("jobId", job.id).put("state", "ready")
            .put("job", job.privateJson()).put("resume", profile.resume!!.metadata())
            .put("payloadSummary", JSONObject().put("name", profile.firstName).put("email", profile.email)
                .put("phone", "").put("website", "").put("comments", "")))))
    private fun response(connection: Connection, profile: ProfileDraft, receipts: List<JSONObject>) = JSONObject()
        .put("ok", true).put("mode", "test").put("workspaceId", connection.workspaceId)
        .put("profile", profile.apiJson(includeLinkedIn = true).put("resume", profile.resume!!.metadata()).put("revision", profile.revision))
        .put("jobs", JSONArray(listOf(job.privateJson().put("localOnly", false))))
        .put("attempts", JSONArray(receipts)).put("activePlanIds", JSONArray()).put("recoverablePlans", JSONArray())
        .put("capabilities", JSONObject().put("liveEnabled", false).put("linkedinProfile", true))
    private fun state(receipts: List<ApplicationReceipt> = emptyList(), records: Map<String, ApplicationRecordBundle> = emptyMap()) =
        CareerUiState(loaded = true, profile = profileB, jobs = listOf(job), receipts = receipts, applicationRecords = records)
    private fun record(name: String?, note: String = "") =
        ApplicationRecordBundle.create(job, ApplicationRecord(note = note, manualResumeName = name))
    private fun scope(connection: Connection) = "workspace-" + BoundaryPolicy.workspaceKey(connection.origin, connection.workspaceId)

    @Test fun missingAndNullOldReceiptEvidence_staysMissingWithoutCurrentProfileFallback() {
        val old = receipt().apply { remove("resumeName"); remove("profileRevision") }
        for (raw in listOf(old, receipt(null, null))) {
            val decoded = ApplicationReceipt.fromServer(raw)
            assertNull(decoded.resumeName); assertNull(decoded.profileRevision)
            val restored = WorkspaceStorage.decode(WorkspaceStorage.encode(state(listOf(decoded))), null)
            assertEquals("CV-B.pdf", restored.profile.resume!!.name)
            assertNull(restored.receipts.single().resumeName)
            assertNull(restored.receipts.single().profileRevision)
        }
    }

    @Test fun filenameAndRevision_areIndependentOptionalHistoricalFacts() {
        val onlyName = ApplicationReceipt.fromServer(receipt("CV-A.pdf", null))
        val onlyRevision = ApplicationReceipt.fromServer(receipt(null, 0))
        assertEquals("CV-A.pdf", onlyName.resumeName); assertNull(onlyName.profileRevision)
        assertNull(onlyRevision.resumeName); assertEquals(0, onlyRevision.profileRevision)
        val decoded = WorkspaceStorage.decode(WorkspaceStorage.encode(state(listOf(onlyName, onlyRevision.copy(id = "second")))), null)
        assertEquals(listOf(onlyName, onlyRevision.copy(id = "second")), decoded.receipts)
    }

    @Test fun historicalPdfNames_requireExactPlainValidPdfName() {
        for (name in listOf("CV-A.pdf", "السيرة الذاتية-A.PDF", "A".repeat(176) + ".pdf")) {
            assertTrue(ApplicationCvEvidence.validRecordedName(name))
            assertEquals(name, ApplicationReceipt.fromServer(receipt(name)).resumeName)
        }
        // Historical receipt text is displayed exactly, including legacy unpaired surrogates;
        // the stricter name check still governs newly selected and manually entered PDFs.
        for (name in listOf("x\uD800.pdf", "x\uDC00.pdf")) {
            assertFalse(ApplicationCvEvidence.validRecordedName(name))
            assertTrue(ApplicationCvEvidence.validHistoricalRecordedName(name))
            assertEquals(name, ApplicationReceipt.fromServer(receipt(name)).resumeName)
        }
        val bad: List<Any> = listOf("", ".hidden.pdf", "CV.txt", "../CV.pdf", "folder/CV.pdf", "C:\\CV.pdf",
            "CV:A.pdf", " CV.pdf", "CV.pdf ", "CV\nA.pdf", "CV\u007fA.pdf",
            "A".repeat(177) + ".pdf", 7, true, JSONObject(), JSONArray())
        for (name in bad) reject { ApplicationReceipt.fromServer(receipt(name)) }
    }

    @Test fun historicalRevision_rejectsPresentMalformedValuesAndOverflow() {
        for (revision in listOf<Any>(-1, 0.5, "2", true, Int.MAX_VALUE.toLong() + 1, JSONObject(), JSONArray())) {
            reject { ApplicationReceipt.fromServer(receipt(revision = revision)) }
        }
        assertEquals(Int.MAX_VALUE, ApplicationReceipt.fromServer(receipt(revision = Int.MAX_VALUE)).profileRevision)
    }

    @Test fun reviewedAReceipt_survivesProfileBLocalStorageAndFreshModel() {
        val original = ApplicationReceipt.fromServer(receipt())
        val store = MemoryStore()
        store.write("workspace-unpaired", WorkspaceStorage.encode(state(listOf(original))))
        val first = model(store)
        assertEquals("CV-B.pdf", first.state.value.profile.resume!!.name)
        assertEquals("CV-A.pdf", first.state.value.receipts.single().resumeName)
        assertEquals(1, first.state.value.receipts.single().profileRevision)
        assertEquals("cv-plan-a", first.state.value.receipts.single().planId)
        closeModels()
        val reloaded = model(store)
        assertEquals(original, reloaded.state.value.receipts.single())
        assertEquals("CV-B.pdf", reloaded.state.value.profile.resume!!.name)
    }

    @Test fun laterReviewUsesB_earlierReviewAndReceiptStillUseA() {
        val first = ReviewPlan.fromJson(review(profileA))
        val oldAttempt = ApplicationReceipt.fromServer(receipt())
        val next = ReviewPlan.fromJson(review(profileB))
        assertEquals("CV-A.pdf", first.items.single().resume!!.name)
        assertEquals(1, first.profileRevision)
        assertEquals("CV-B.pdf", next.items.single().resume!!.name)
        assertEquals(2, next.profileRevision)
        assertEquals("CV-A.pdf", oldAttempt.resumeName)
        assertEquals(1, oldAttempt.profileRevision)
        reject { ReviewPlan.fromJson(review(profileA).apply {
            getJSONArray("items").getJSONObject(0).getJSONObject("resume").put("name", "../CV.pdf")
        }) }
    }

    @Test fun equalPdfHashesDoNotCollapseDistinctReviewedDisplayFilenames() {
        val a = ApplicationReceipt.fromServer(receipt("CV-A.pdf", 1, id = "same-content-a"))
        val b = ApplicationReceipt.fromServer(receipt("CV-B.pdf", 2, id = "same-content-b").put("planId", "cv-plan-b"))
        assertEquals(a.resumeSHA256, b.resumeSHA256)
        val restored = WorkspaceStorage.decode(WorkspaceStorage.encode(state(listOf(a, b))), null)
        assertEquals(listOf("CV-A.pdf", "CV-B.pdf"), restored.receipts.map { it.resumeName })
        assertEquals(listOf(1, 2), restored.receipts.map { it.profileRevision })
        assertEquals(listOf("cv-plan-a", "cv-plan-b"), restored.receipts.map { it.planId })
        assertEquals(listOf(a.id, b.id), restored.receipts.map { it.id })
    }

    @Test fun metadataNeverChangesPreparedUncertainTestOrConfirmedAuthority() {
        val ready = ApplicationReceipt.fromServer(receipt(state = "ready"))
        val uncertain = ApplicationReceipt.fromServer(receipt(state = "uncertain", evidence = "live"))
        val rejected = ApplicationReceipt.fromServer(receipt(state = "rejected", evidence = "live"))
        val synthetic = ApplicationReceipt.fromServer(receipt())
        val confirmed = ApplicationReceipt.fromServer(receipt(evidence = "live"))
        assertFalse(ready.verified); assertFalse(uncertain.verified); assertFalse(rejected.verified); assertFalse(synthetic.verified)
        assertTrue(confirmed.verified)
        for (item in listOf(ready, uncertain, rejected, synthetic, confirmed)) {
            assertEquals(item.verified, item.copy(resumeName = null, profileRevision = null).verified)
            assertEquals(item.state, WorkspaceStorage.decode(WorkspaceStorage.encode(state(listOf(item))), null).receipts.single().state)
        }
    }

    @Test fun malformedReceiptInSavedWorkspace_preservesOriginalAndBlocksIncompleteRestore() {
        val raw = WorkspaceStorage.encode(state(listOf(ApplicationReceipt.fromServer(receipt()))))
        raw.getJSONArray("receipts").getJSONObject(0).put("profileRevision", "not-an-integer")
        val store = MemoryStore().apply { records["workspace-unpaired"] = raw.toString() }
        val original = store.records.getValue("workspace-unpaired")
        val loaded = model(store)
        assertTrue(loaded.state.value.storageBlocked)
        assertEquals(original, store.records.getValue("workspace-unpaired"))
        assertTrue(loaded.state.value.receipts.isEmpty())
    }

    @Test fun twoAccountScopes_doNotExposeEachOthersFilenames() {
        val a = Connection("https://cv-fixture.example.invalid", "account-a", "synthetic-a", "2099-12-31T00:00:00Z")
        val b = a.copy(workspaceId = "account-b", token = "synthetic-b")
        val service = Service().apply {
            responses[a.workspaceId] = response(a, profileB, listOf(receipt())).toString()
            responses[b.workspaceId] = response(b, profileA, listOf(receipt("CV-Other.pdf", 3, id = "other-attempt"))).toString()
        }
        val store = MemoryStore().apply { write("connection", a.toJson()) }
        val first = model(store, service)
        assertEquals("CV-A.pdf", first.state.value.receipts.single().resumeName)
        closeModels()
        store.write("connection", b.toJson())
        val second = model(store, service)
        assertEquals(scope(b), second.state.value.privateScope)
        assertEquals(listOf("CV-Other.pdf"), second.state.value.receipts.map { it.resumeName })
        assertFalse(second.state.value.receipts.any { it.resumeName == "CV-A.pdf" })
        closeModels()
        store.write("connection", a.toJson())
        val returned = model(store, service)
        assertEquals(listOf("CV-A.pdf"), returned.state.value.receipts.map { it.resumeName })
        assertEquals(3, service.requests.size)
    }

    @Test fun malformedRefreshDoesNotReplaceEarlierHistoricalEvidence() {
        val connection = Connection("https://cv-fixture.example.invalid", "account-a", "synthetic-a", "2099-12-31T00:00:00Z")
        val service = Service().apply { responses[connection.workspaceId] = response(connection, profileB, listOf(receipt())).toString() }
        val store = MemoryStore().apply { write("connection", connection.toJson()) }
        val loaded = model(store, service)
        val original = store.records.getValue(scope(connection))
        service.responses[connection.workspaceId] = response(connection, profileB, listOf(receipt("../private/CV.pdf"))).toString()
        main { loaded.refresh() }; await { !loaded.state.value.busy && loaded.state.value.error != null }
        assertEquals("CV-A.pdf", loaded.state.value.receipts.single().resumeName)
        assertEquals(original, store.records.getValue(scope(connection)))
        assertFalse(loaded.state.value.storageBlocked)
    }

    @Test fun manualFilenameOnly_isMeaningfulAndExplicitSaveTrimsIt() {
        val draft = ApplicationRecordDraft(manualResumeName = "  CV-personal-note  ")
        assertEquals("  CV-personal-note  ", draft.validated().manualResumeName)
        val saved = ApplicationRecordBundle.create(job).edited(draft, false)
        assertEquals("CV-personal-note", saved.current.record.manualResumeName)
        assertEquals(ApplicationStage.SAVED, saved.displayStage)
        assertFalse(saved.appliedElsewhere)
        assertNull(saved.edited(draft.copy(manualResumeName = "   "), false).current.record.manualResumeName)
        assertNull(ApplicationRecord.decode(ApplicationRecord().json()).manualResumeName)
        assertNull(ApplicationRecord.decode(ApplicationRecord().json().put("manualResumeName", JSONObject.NULL)).manualResumeName)
    }

    @Test fun manualNamesAllowNonPdfAndBoundUtf16WithoutSilentTruncation() {
        for (name in listOf("", "ملف السيرة A", "notes.docx", "A".repeat(180), "😀".repeat(90))) {
            assertTrue(ApplicationCvEvidence.validManualName(name))
            assertEquals(name, ApplicationRecordDraft(manualResumeName = name).validated().manualResumeName)
        }
        for (name in listOf("A".repeat(181), "😀".repeat(91), "/tmp/CV", "C:\\CV", "A:B", "A\nB", "A\tB", "A\u007fB", "\uD800")) {
            assertFalse(ApplicationCvEvidence.validManualName(name))
            reject { ApplicationRecordDraft(manualResumeName = name).validated() }
        }
        for (value in listOf<Any>(3, true, JSONObject(), JSONArray())) reject {
            ApplicationRecord.decode(ApplicationRecord().json().put("manualResumeName", value))
        }
    }

    @Test fun unfinishedCheckpointPreservesValidSpacingAndNullableOldEvidence() {
        val checkpoint = RecordDraftCheckpoint("workspace-unpaired", BoundaryPolicy.jobIdentity(job.url), job, 0,
            ApplicationRecordDraft(manualResumeName = "  CV-A draft  "))
        assertEquals(checkpoint, RecordDraftCheckpoint.decode(checkpoint.json()))
        assertNull(RecordDraftCheckpoint.decode(checkpoint.json().apply { remove("manualResumeName") }).draft.manualResumeName)
        reject { RecordDraftCheckpoint.decode(checkpoint.json().put("manualResumeName", "../CV")) }
        reject { RecordDraftCheckpoint.decode(checkpoint.json().put("manualResumeName", 5)) }
    }

    @Test fun conflictingManualFilenamesRemainSeparateAndCorrectionKeepsArchive() {
        val a = record("CV-A.pdf").edited(ApplicationRecordDraft(stage = ApplicationStage.APPLIED, manualResumeName = "CV-A.pdf"), false)
        val b = record("CV-B.pdf")
        val merged = a.merge(b)
        assertTrue(merged.needsReview)
        assertEquals("CV-A.pdf", merged.current.record.manualResumeName)
        assertEquals("CV-B.pdf", merged.alternatives.single().record.manualResumeName)
        val chosen = merged.choose(b.current.id)
        assertTrue(chosen.appliedElsewhere)
        val corrected = chosen.edited(chosen.activeDraft.copy(stage = ApplicationStage.SAVED), true)
        assertFalse(corrected.appliedElsewhere)
        assertTrue(corrected.history.any { it.record.manualResumeName == "CV-A.pdf" })
        assertEquals("CV-B.pdf", corrected.current.record.manualResumeName)
        assertEquals(corrected, ApplicationRecordBundle.decode(corrected.json()))
    }

    @Test fun portableCommonBackupPreservesCurrentAlternateArchivedAndDraftFilenames() {
        val a = record("CV-A.pdf")
        val b = record("CV-B.pdf")
        val archived = ApplicationRecordVersion.create(ApplicationRecord(manualResumeName = "CV-earlier.pdf"))
        val merged = a.merge(b).copy(history = listOf(archived))
        val checkpoint = RecordDraftCheckpoint("workspace-unpaired", merged.identity, job, 1,
            ApplicationRecordDraft(manualResumeName = "  unfinished filename  "))
        val source = state(records = mapOf(merged.identity to merged)).copy(recordDrafts = mapOf(merged.identity to checkpoint))
        val portable = WorkspaceTransfer.export(source, null, false)
        portable.remove("extensions")
        val restored = WorkspaceTransfer.decode(portable, "workspace-destination").snapshot
        val record = restored.applicationRecords.getValue(merged.identity)
        assertEquals("CV-A.pdf", record.current.record.manualResumeName)
        assertEquals("CV-B.pdf", record.alternatives.single().record.manualResumeName)
        assertEquals("CV-earlier.pdf", record.history.single().record.manualResumeName)
        assertEquals("  unfinished filename  ", restored.recordDrafts.getValue(merged.identity).draft.manualResumeName)
        assertEquals("workspace-destination", restored.recordDrafts.getValue(merged.identity).scope)
        assertTrue(restored.receipts.isEmpty())
        assertTrue(restored.importedReceipts.isEmpty())
    }

    @Test fun contradictoryPortableFilenameEvidence_isRejectedInsteadOfChoosingAnExtension() {
        val current = record("CV-A.pdf")
        val portable = WorkspaceTransfer.export(state(records = mapOf(current.identity to current)), null, false)
        portable.getJSONObject("data").getJSONArray("applicationRecords").getJSONObject(0).put("manualResumeName", "CV-other.pdf")
        reject { WorkspaceTransfer.decode(portable, "workspace-destination") }
    }

    @Test fun portableReceiptCopyKeepsFilenameButCannotBecomeLiveOrRetainPlanAuthority() {
        val original = ApplicationReceipt.fromServer(receipt(evidence = "live"))
        assertTrue(original.verified)
        val restored = WorkspaceTransfer.decode(WorkspaceTransfer.export(state(listOf(original)), null, false), "workspace-destination").snapshot
        assertTrue(restored.receipts.isEmpty())
        val archived = restored.importedReceipts.single()
        assertEquals("CV-A.pdf", archived.resumeName)
        assertEquals(1, archived.profileRevision)
        assertEquals("", archived.planId)
        assertEquals("imported", archived.evidenceMode)
        assertFalse(archived.verified)
        assertEquals(archived, WorkspaceStorage.decode(WorkspaceStorage.encode(restored), null, "workspace-destination").importedReceipts.single())
    }

    @Test fun invalidEditorInputKeepsLastValidDraftWithoutBlockingWorkspace() {
        val store = MemoryStore().apply { write("workspace-unpaired", WorkspaceStorage.encode(state())) }
        val service = Service()
        val loaded = model(store, service)
        main { loaded.openApplicationRecord(job) }
        main { loaded.editApplicationRecordDraft({ it.copy(manualResumeName = " CV-A note ") }) }
        assertEquals(" CV-A note ", loaded.state.value.applicationRecordEditor!!.draft.manualResumeName)
        main { loaded.editApplicationRecordDraft({ it.copy(manualResumeName = "../private/CV") }) }
        assertEquals(" CV-A note ", loaded.state.value.applicationRecordEditor!!.draft.manualResumeName)
        assertEquals(ApplicationCvEvidence.MANUAL_NAME_ERROR, loaded.state.value.error)
        assertFalse(loaded.state.value.storageBlocked)
        main { loaded.editApplicationRecordDraft({ it.copy(manualResumeName = " CV-B note ") }) }
        assertNull(loaded.state.value.error)
        main { loaded.saveApplicationRecord() }; await { !loaded.state.value.busy }
        assertEquals("CV-B note", loaded.state.value.recordFor(job)!!.current.record.manualResumeName)
        assertTrue(service.requests.isEmpty())
        assertTrue(loaded.state.value.receipts.isEmpty())
        assertNull(loaded.state.value.plan)
    }

    @Test fun failedManualSaveKeepsEarlierFilenameAndOriginalPrivateFile() {
        val original = record("CV-A.pdf")
        val store = MemoryStore().apply { write("workspace-unpaired", WorkspaceStorage.encode(state(records = mapOf(original.identity to original)))) }
        val loaded = model(store)
        val before = store.records.getValue("workspace-unpaired")
        main { loaded.openApplicationRecord(job) }
        store.failWrites = true
        main {
            loaded.editApplicationRecordDraft({ it.copy(manualResumeName = "CV-B.pdf") })
            loaded.saveApplicationRecord()
        }
        await { !loaded.state.value.busy }
        assertNotNull(loaded.state.value.error)
        assertEquals("CV-A.pdf", loaded.state.value.recordFor(job)!!.current.record.manualResumeName)
        assertEquals(before, store.records.getValue("workspace-unpaired"))
    }
}
