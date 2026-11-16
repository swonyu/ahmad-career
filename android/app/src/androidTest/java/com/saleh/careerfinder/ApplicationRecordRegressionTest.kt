package com.saleh.careerfinder

import android.app.Application
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.util.TimeZone
import java.util.concurrent.ConcurrentHashMap

/** Local record ownership, civil dates, merge preservation and explicit correction. No employer calls. */
class ApplicationRecordRegressionTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val owners = mutableListOf<ViewModelStore>()
    private val connection = Connection("https://fixture.invalid", "record-workspace", "synthetic-token", Instant.now().plusSeconds(3600).toString())
    private val localJob = Opportunity("local-record", "https://jobs.example.invalid/role?id=42", "Synthetic role", "Fixture employer", "", "", true)

    private class MemoryStore : PrivateStore {
        val records = ConcurrentHashMap<String, String>()
        @Volatile var failWrites = false
        override fun read(name: String): JSONObject? = records[name]?.let(::JSONObject)
        override fun write(name: String, value: JSONObject) { if (failWrites) throw java.io.IOException("Fixture write failure"); records[name] = value.toString() }
        override fun remove(name: String) { records.remove(name) }
        override fun startFreshPreservingExisting() { error("Not used by record fixtures") }
    }
    private class Service(var nextConnection: Connection) : CareerService {
        var jobs = emptyList<Opportunity>()
        var failJobSave = false
        var returnedURL: String? = null
        var activeIDs = emptyList<String>()
        var reviews = emptyList<JSONObject>()
        var clientContinuation = false
        var preparedPlan: JSONObject? = null
        val writes = mutableListOf<Pair<String, JSONObject>>()
        private val profile = ProfileDraft(firstName = "Synthetic", email = "record@example.invalid", revision = 1,
            resume = Resume("Fixture.pdf", 20, "a".repeat(64)))
        override suspend fun pair(origin: String, code: String) = nextConnection
        override suspend fun request(connection: Connection, method: String, route: String, body: JSONObject?): JSONObject {
            if (method != "GET") writes += route to JSONObject(body.toString())
            return when (route) {
                "workspace" -> JSONObject().put("ok", true).put("mode", "test").put("workspaceId", connection.workspaceId)
                    .put("profile", profile.apiJson(includeLinkedIn = true).put("resume", profile.resume!!.metadata()).put("revision", profile.revision))
                    .put("jobs", JSONArray(jobs.map(Opportunity::privateJson))).put("attempts", JSONArray())
                    .put("activePlanIds", JSONArray(activeIDs)).put("recoverablePlans", JSONArray(reviews))
                    .put("capabilities", JSONObject().put("liveEnabled", false).put("linkedinProfile", true)
                        .apply { if (clientContinuation) put("dispatchContinuation", "client") })
                "jobs" -> {
                    if (failJobSave) throw ApiFailure(503, "fixture_unavailable", "Synthetic job save unavailable")
                    val saved = Opportunity.fromJson(JSONObject(body.toString()).put("id", "synced-record-job").apply { returnedURL?.let { put("url", it) } })
                    jobs = listOf(saved) + jobs.filterNot { it.id == saved.id || it.url == saved.url }
                    JSONObject().put("ok", true).put("job", saved.privateJson())
                }
                "prepare" -> JSONObject().put("ok", true).put("plan", preparedPlan ?: JSONObject().put("id", "record-review").put("digest", "synthetic-digest")
                    .put("profileRevision", 1).put("approvedAt", JSONObject.NULL).put("expiresAt", Instant.now().plusSeconds(600).toString()).put("items", JSONArray()))
                "stop" -> {
                    val id = body!!.getString("planId"); activeIDs = activeIDs.filterNot { it == id }; reviews = reviews.filterNot { it.getString("id") == id }
                    JSONObject().put("ok", true)
                }
                "advance", "session/revoke" -> JSONObject().put("ok", true)
                else -> error("Unexpected synthetic route: $route")
            }
        }
    }
    private fun main(block: () -> Unit) = instrumentation.runOnMainSync(block)
    private fun await(check: () -> Boolean) {
        val deadline = System.nanoTime() + 5_000_000_000
        while (!check() && System.nanoTime() < deadline) Thread.sleep(15)
        assertTrue("Expected private-record state within five seconds", check())
    }
    private fun model(store: MemoryStore, service: Service = Service(connection)): CareerViewModel {
        lateinit var model: CareerViewModel
        main {
            model = CareerViewModel(instrumentation.targetContext.applicationContext as Application, store, service, waitForPoll = { awaitCancellation() })
            owners += ViewModelStore().apply { put("private-record-model", model) }
        }
        await { model.state.value.loaded && !model.state.value.busy }
        return model
    }
    private fun identity(job: Opportunity = localJob) = BoundaryPolicy.jobIdentity(job.url)
    private fun key(connection: Connection) = "workspace-" + BoundaryPolicy.workspaceKey(connection.origin, connection.workspaceId)
    private fun workspace(jobs: List<Opportunity> = listOf(localJob), records: List<ApplicationRecordBundle> = emptyList(), manual: Set<String> = emptySet()) =
        JSONObject().put("schema", 1).put("jobs", JSONArray(jobs.map(Opportunity::privateJson))).put("manualApplied", JSONArray(manual.toList()))
            .put("applicationRecords", ApplicationRecordsCodec.encode(records.associateBy { it.identity }))
    private fun savedRecord(note: String, stage: ApplicationStage = ApplicationStage.APPLIED, job: Opportunity = localJob) =
        ApplicationRecordBundle.create(job, ApplicationRecord(stage, "2024-02-29", "2026-12-01", note, stage != ApplicationStage.SAVED))
    private fun review(job: Opportunity, id: String = "active-record-review", state: String = "ready", approved: Boolean = true) =
        JSONObject().put("id", id).put("digest", "synthetic-digest").put("profileRevision", 1)
            .put("approvedAt", if (approved) Instant.now().toString() else JSONObject.NULL).put("expiresAt", Instant.now().plusSeconds(600).toString())
            .put("items", JSONArray(listOf(JSONObject().put("jobId", job.id).put("state", state).put("retryAt", Instant.now().minusSeconds(5).toString())
                .put("job", job.privateJson()).put("resume", Resume("Fixture.pdf", 20, "a".repeat(64)).metadata())
                .put("payloadSummary", JSONObject().put("name", "Synthetic").put("email", "record@example.invalid").put("phone", "")
                    .put("website", "").put("linkedin", "").put("comments", "")))))
    private fun poll(model: CareerViewModel) = runBlocking { withContext(Dispatchers.Main) { model.pollOnce() } }
    private fun edit(model: CareerViewModel, change: (ApplicationRecordDraft) -> ApplicationRecordDraft) {
        main { model.editApplicationRecordDraft(change) }
    }
    private fun save(model: CareerViewModel) {
        main { model.saveApplicationRecord() }; await { !model.state.value.busy }
    }
    @After fun clearModels() { main { owners.forEach(ViewModelStore::clear) }; owners.clear() }

    @Test fun legacyAppliedFlag_migratesWithoutInventedDates_orChangingTheSavedFile() {
        val store = MemoryStore()
        val original = workspace(manual = setOf(localJob.id)).apply { remove("applicationRecords"); put("profile", ProfileDraft(firstName = "Single").privateJson()) }.toString()
        store.records["workspace-unpaired"] = original
        val model = model(store)
        val record = model.state.value.applicationRecords.getValue(identity())
        assertTrue(record.appliedElsewhere)
        assertEquals(ApplicationStage.APPLIED, record.displayStage)
        assertEquals("", record.current.record.appliedDate)
        assertEquals("", record.current.record.followUpDate)
        assertEquals("Single", model.state.value.profile.firstName)
        assertEquals(original, store.records["workspace-unpaired"])
        assertTrue(model.state.value.receipts.isEmpty())
        assertTrue(model(MemoryStore()).state.value.applicationRecords.isEmpty())
    }

    @Test fun saveAndCancel_arePrivate_andCivilDatesSurviveRestartAndTimeZoneChange() {
        val store = MemoryStore().apply { records["workspace-unpaired"] = workspace().toString() }; val service = Service(connection); val model = model(store, service)
        val original = store.records["workspace-unpaired"]
        main { model.openApplicationRecord(localJob) }
        edit(model) { it.copy(stage = ApplicationStage.APPLIED, appliedDate = "2024-02-29", followUpDate = "2026-12-01", note = "Private interview note") }
        main { model.closeApplicationRecord() }
        assertEquals(original, store.records["workspace-unpaired"])
        assertTrue(model.state.value.applicationRecords.isEmpty())
        main { model.openApplicationRecord(localJob) }
        edit(model) { it.copy(stage = ApplicationStage.APPLIED, appliedDate = "2024-02-29", followUpDate = "2026-12-01", note = "Private interview note") }
        save(model)
        assertNull(model.state.value.applicationRecordEditor)
        assertTrue(localJob.id in model.state.value.manualApplied)
        val zone = TimeZone.getDefault()
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("Pacific/Honolulu"))
            val restarted = model(store, service)
            val record = restarted.state.value.applicationRecords.getValue(identity())
            assertEquals("2024-02-29", record.current.record.appliedDate)
            assertEquals("2026-12-01", record.current.record.followUpDate)
            assertEquals("Private interview note", record.current.record.note)
            assertFalse(record.followUpDue(LocalDate.of(2026, 11, 30)))
            assertTrue(record.followUpDue(LocalDate.of(2026, 12, 1)))
        } finally { TimeZone.setDefault(zone) }
        assertTrue(service.writes.isEmpty())
        assertTrue(model.state.value.receipts.isEmpty())
    }

    @Test fun closedKeepsAppliedEvidence_andSavedRequiresAnUnchangedExplicitConfirmation() {
        val record = savedRecord("Keep this note")
        val store = MemoryStore().apply { records["workspace-unpaired"] = workspace(records = listOf(record)).toString() }
        val model = model(store)
        main { model.openApplicationRecord(localJob) }; edit(model) { it.copy(stage = ApplicationStage.CLOSED) }; save(model)
        assertTrue(model.state.value.applicationRecords.getValue(identity()).appliedElsewhere)
        assertTrue(localJob.id in model.state.value.manualApplied)
        assertFalse(SavedOpportunityFilter.FOLLOW_UP.includes(model.state.value.applicationRecords.getValue(identity())))
        val before = store.records["workspace-unpaired"]
        main { model.openApplicationRecord(localJob) }; edit(model) { it.copy(stage = ApplicationStage.SAVED) }; save(model)
        assertNotNull(model.state.value.applicationRecordEditor!!.pendingNotApplied)
        assertEquals(before, store.records["workspace-unpaired"])
        main { model.keepApplicationRecord(model.state.value.applicationRecordEditor!!.token) }
        assertEquals(before, store.records["workspace-unpaired"])
        assertTrue(model.state.value.applicationRecords.getValue(identity()).appliedElsewhere)
        edit(model) { it.copy(stage = ApplicationStage.SAVED) }; save(model)
        val token = model.state.value.applicationRecordEditor!!.token
        edit(model) { it.copy(note = "Changed after confirmation opened") }
        main { model.saveApplicationRecord(true, token) }; await { !model.state.value.busy }
        assertEquals(before, store.records["workspace-unpaired"])
        assertTrue(model.state.value.applicationRecords.getValue(identity()).appliedElsewhere)
        save(model)
        main { model.saveApplicationRecord(true, token) }; await { !model.state.value.busy }
        val corrected = model.state.value.applicationRecords.getValue(identity())
        assertFalse(corrected.appliedElsewhere)
        assertFalse(localJob.id in model.state.value.manualApplied)
        assertTrue(corrected.history.any { it.record.appliedElsewhere })
        assertFalse(model(store).state.value.applicationRecords.getValue(identity()).appliedElsewhere)
        val historical = corrected.history.first { it.record.appliedElsewhere }
        main { model.openApplicationRecord(localJob) }
        val restoredToken = model.state.value.applicationRecordEditor!!.token
        main { model.chooseApplicationRecordVersion(historical.id, restoredToken) }; await { !model.state.value.busy }
        val restored = model.state.value.applicationRecords.getValue(identity())
        assertFalse(restored.appliedElsewhere)
        assertEquals(ApplicationStage.SAVED, restored.displayStage)
        assertEquals(historical.record.note, restored.current.record.note)
        assertEquals(historical.record.appliedDate, restored.current.record.appliedDate)
        assertEquals(historical, restored.history.first { it.id == historical.id })
        assertFalse(localJob.id in model.state.value.manualApplied)
        assertFalse(model(store).state.value.applicationRecords.getValue(identity()).appliedElsewhere)
        edit(model) { it.copy(stage = ApplicationStage.INTERVIEW) }; save(model)
        assertTrue(localJob.id in model.state.value.manualApplied)
    }

    @Test fun futureRecordSchema_isPreservedAndNeverReplacedWithAnEmptyWorkspace() {
        val store = MemoryStore()
        val original = workspace(records = listOf(savedRecord("Future private note"))).apply { getJSONObject("applicationRecords").put("schema", 2) }.toString()
        store.records["workspace-unpaired"] = original
        val model = model(store)
        assertTrue(model.state.value.storageBlocked)
        assertEquals(original, store.records["workspace-unpaired"])
        main { model.retryStorage() }; await { !model.state.value.busy }
        assertTrue(model.state.value.storageBlocked)
        assertEquals(original, store.records["workspace-unpaired"])
    }

    @Test fun explicitImportKeepsBothConflictingVersions_andAChoiceCannotClearAppliedEvidence() {
        val serverJob = localJob.copy(id = "server-job", localOnly = false)
        val current = savedRecord("Current private note", ApplicationStage.SAVED, serverJob)
        val copied = savedRecord("Copied private note")
        val store = MemoryStore().apply {
            records["connection"] = connection.toJson().toString()
            records[key(connection)] = workspace(listOf(serverJob), listOf(current)).toString()
            records["workspace-unpaired"] = workspace(records = listOf(copied)).toString()
        }
        val service = Service(connection).apply { jobs = listOf(serverJob) }; val model = model(store, service)
        assertEquals("Current private note", model.state.value.applicationRecords.getValue(identity()).current.record.note)
        assertFalse(model.state.value.applicationRecords.getValue(identity()).appliedElsewhere)
        val originalPhone = store.records["workspace-unpaired"]
        main { model.inspectPhoneDraft() }; await { !model.state.value.busy && model.state.value.phoneImport != null }
        main { model.importPhoneDraft(false, true) }; await { !model.state.value.busy }
        val merged = model.state.value.applicationRecords.getValue(identity())
        assertTrue(merged.needsReview)
        assertEquals("Current private note", merged.current.record.note)
        assertEquals("Copied private note", merged.alternatives.single().record.note)
        assertTrue(merged.appliedElsewhere)
        assertTrue(serverJob.id in model.state.value.manualApplied)
        assertEquals(originalPhone, store.records["workspace-unpaired"])
        main { model.openApplicationRecord(serverJob) }
        val token = model.state.value.applicationRecordEditor!!.token
        main { model.chooseApplicationRecordVersion(merged.current.id, token) }; await { !model.state.value.busy }
        val chosen = model.state.value.applicationRecords.getValue(identity())
        assertFalse(chosen.needsReview)
        assertTrue(chosen.appliedElsewhere)
        assertTrue(chosen.history.any { it.record.note == "Copied private note" })
        edit(model) { it.copy(stage = ApplicationStage.SAVED) }; save(model)
        main { model.saveApplicationRecord(true, token) }; await { !model.state.value.busy }
        assertFalse(model.state.value.applicationRecords.getValue(identity()).appliedElsewhere)
        main { model.inspectPhoneDraft() }; await { !model.state.value.busy && model.state.value.phoneImport != null }
        main { model.importPhoneDraft(false, true) }; await { !model.state.value.busy }
        assertTrue(model.state.value.applicationRecords.getValue(identity()).appliedElsewhere)
        assertTrue(service.writes.isEmpty())
    }

    @Test fun recordOnlyPhoneDraft_importsWithoutRestoringBookmarks_andKeepsConflicts() {
        val copied = savedRecord("Retained after removing the phone bookmark")
        val destination = savedRecord("Earlier destination note", ApplicationStage.SAVED)
        val store = MemoryStore().apply {
            records["connection"] = connection.toJson().toString()
            records[key(connection)] = workspace(emptyList(), listOf(destination)).toString()
            records["workspace-unpaired"] = workspace(emptyList(), listOf(copied)).toString()
        }
        val originalPhone = store.records["workspace-unpaired"]; val service = Service(connection); val model = model(store, service)
        main { model.inspectPhoneDraft() }; await { !model.state.value.busy && model.state.value.phoneImport != null }
        assertTrue(model.state.value.phoneImport!!.jobs.isEmpty())
        assertEquals(1, model.state.value.phoneImport!!.applicationRecords.size)
        main { model.importPhoneDraft(false, true) }; await { !model.state.value.busy }
        val merged = model.state.value.applicationRecords.getValue(identity())
        assertTrue(model.state.value.jobs.isEmpty())
        assertTrue(merged.appliedElsewhere); assertTrue(merged.needsReview)
        assertEquals("Earlier destination note", merged.current.record.note)
        assertEquals(copied.current.record.note, merged.alternatives.single().record.note)
        assertEquals(merged, model.state.value.unbookmarkedRecords.single())
        assertEquals(originalPhone, store.records["workspace-unpaired"])
        val another = connection.copy(workspaceId = "another-record-scope")
        service.nextConnection = another
        main { model.pair(another.origin, "SYNTHETIC") {} }; await { !model.state.value.busy && model.state.value.connection == another }
        assertTrue(model.state.value.applicationRecords.isEmpty())
        main { model.inspectPhoneDraft() }; await { !model.state.value.busy && model.state.value.phoneImport != null }
        main { model.importPhoneDraft(false, true) }; await { !model.state.value.busy }
        assertTrue(model.state.value.jobs.isEmpty())
        assertEquals(copied.current.record.note, model.state.value.unbookmarkedRecords.single().current.record.note)
        assertEquals(originalPhone, store.records["workspace-unpaired"])
        assertTrue(service.writes.isEmpty())
    }

    @Test fun activeReview_allowsNotesButRequiresConfirmedStopBeforeAppliedChanges() {
        val job = localJob.copy(id = "server-record", localOnly = false)
        val record = savedRecord("Original private note", ApplicationStage.SAVED, job)
        val store = MemoryStore().apply {
            records["connection"] = connection.toJson().toString(); records[key(connection)] = workspace(listOf(job), listOf(record)).toString()
            records["workspace-unpaired"] = workspace(emptyList(), listOf(savedRecord("Copied applied record", job = job))).toString()
        }
        val service = Service(connection).apply { jobs = listOf(job); activeIDs = listOf("active-record-review"); reviews = listOf(review(job)) }
        val model = model(store, service); val original = store.records[key(connection)]
        main { model.openApplicationRecord(job) }; edit(model) { it.copy(stage = ApplicationStage.APPLIED, note = "Kept editor draft") }; save(model)
        assertTrue(model.state.value.error.orEmpty().contains("Stop active Auto Apply"))
        assertEquals(original, store.records[key(connection)])
        assertEquals("Kept editor draft", model.state.value.applicationRecordEditor!!.draft.note)
        assertFalse(job.id in model.state.value.manualApplied)
        edit(model) { it.copy(stage = ApplicationStage.SAVED) }; save(model)
        assertEquals("Kept editor draft", model.state.value.recordFor(job)!!.current.record.note)
        main { model.markAppliedElsewhere(job.id, true) }; await { !model.state.value.busy }
        assertFalse(job.id in model.state.value.manualApplied)
        main { model.inspectPhoneDraft() }; await { !model.state.value.busy && model.state.value.phoneImport != null }
        main { model.importPhoneDraft(false, true) }; await { !model.state.value.busy }
        assertFalse(job.id in model.state.value.manualApplied); assertNotNull(model.state.value.phoneImport)
        main { model.closePhoneImport(); model.stop("active-record-review") }
        await { model.state.value.activePlans.isEmpty() }
        main { model.markAppliedElsewhere(job.id, true) }; await { !model.state.value.busy }
        assertTrue(job.id in model.state.value.manualApplied)
        assertTrue(model.state.value.receipts.isEmpty())
    }

    @Test fun restoredAppliedEvidence_pausesOnlyMatchingContinuation_andUnknownTargetsFailClosed() {
        val job = localJob.copy(id = "server-record", localOnly = false)
        val other = job.copy(id = "other-job", url = "https://jobs.example.invalid/other", title = "Other synthetic role")
        val record = savedRecord("Already applied outside the app", job = job)
        val store = MemoryStore().apply { records["connection"] = connection.toJson().toString(); records[key(connection)] = workspace(listOf(job), listOf(record)).toString() }
        val service = Service(connection).apply {
            jobs = listOf(job, other); clientContinuation = true
            activeIDs = listOf("matching-active", "other-active")
            reviews = listOf(review(job.copy(id = "old-job-id", url = job.url + "&utm_source=phone"), "matching-active"), review(other, "other-active"))
        }
        val model = model(store, service)
        main { model.setForeground(true) }; assertTrue(poll(model))
        assertEquals(listOf("other-active"), service.writes.filter { it.first == "advance" }.map { it.second.getString("planId") })
        assertTrue(model.state.value.error.orEmpty().contains("does not stop the service"))
        assertTrue(model.state.value.continuationHolds.isEmpty())
        service.activeIDs = listOf("unknown-active"); service.reviews = emptyList()
        assertTrue(poll(model))
        assertEquals(1, service.writes.count { it.first == "advance" })
        service.reviews = listOf(review(job.copy(id = "unknown-target", url = ""), "unknown-active", "rate_limited"))
        assertTrue(poll(model))
        assertEquals(1, service.writes.count { it.first == "advance" })
        main { model.markAppliedElsewhere(job.id, false) }; await { !model.state.value.busy }
        assertNull(model.state.value.applicationRecordEditor)
        assertTrue(job.id in model.state.value.manualApplied)
        main { model.setForeground(false) }
    }

    @Test fun activeDestination_blocksAppliedSyncAdoption_withoutLosingEitherRecord() {
        val destination = localJob.copy(id = "destination-job", url = "https://jobs.example.invalid/canonical/42", localOnly = false)
        val source = savedRecord("Source record"); val existing = savedRecord("Destination record", ApplicationStage.SAVED, destination)
        val store = MemoryStore().apply { records["connection"] = connection.toJson().toString(); records[key(connection)] = workspace(listOf(localJob), listOf(source, existing)).toString() }
        val service = Service(connection).apply { jobs = listOf(destination); returnedURL = destination.url; activeIDs = listOf("active-record-review"); reviews = listOf(review(destination)) }
        val model = model(store, service); val before = model.state.value.applicationRecords
        main { model.syncOpportunity(localJob) }; await { !model.state.value.busy }
        assertTrue(model.state.value.error.orEmpty().contains("Stop active Auto Apply"))
        assertEquals(before, model.state.value.applicationRecords)
        assertTrue(model.state.value.jobs.any { it.id == localJob.id })
        main { model.stop("active-record-review") }; await { model.state.value.activePlans.isEmpty() }
        main { model.syncOpportunity(localJob) }; await { !model.state.value.busy }
        val merged = model.state.value.applicationRecords.getValue(identity(destination))
        assertTrue(merged.appliedElsewhere); assertTrue(merged.needsReview)
        assertEquals("Destination record", merged.current.record.note)
        assertEquals("Source record", merged.alternatives.single().record.note)
        assertTrue(service.writes.none { it.first == "submit" || it.first == "advance" })
    }

    @Test fun manuallyAppliedCooldown_cannotBeRecoveredOrPreparedAsAReadyApplication() {
        val job = localJob.copy(id = "server-record", localOnly = false)
        val record = savedRecord("Earlier draft", ApplicationStage.SAVED, job)
        val store = MemoryStore().apply { records["connection"] = connection.toJson().toString(); records[key(connection)] = workspace(listOf(job), listOf(record)).toString() }
        val cooldown = review(job.copy(id = "earlier-job-id", url = job.url + "&utm_source=linkedin"), state = "rate_limited")
        val service = Service(connection).apply { jobs = listOf(job); reviews = listOf(cooldown) }
        val model = model(store, service)
        assertTrue(model.state.value.activePlans.isEmpty())
        main { model.markAppliedElsewhere(job.id, true) }; await { !model.state.value.busy }
        val earlier = model.state.value.recoverablePlans.single()
        main { model.reviewRecovered(earlier) }
        assertNull(model.state.value.plan); assertTrue(model.state.value.error.orEmpty().contains("marked as applied"))
        main { model.submit(earlier) }; await { !model.state.value.busy }
        assertTrue(service.writes.none { it.first == "submit" })
        service.preparedPlan = review(job, id = "ignored-manual-mark", approved = false)
        main { model.toggleJob(job.id); model.prepare() }; await { !model.state.value.busy }
        assertNull(model.state.value.plan)
        assertTrue("ignored-manual-mark" in model.state.value.obsoleteReviews)
        assertTrue(service.writes.last { it.first == "prepare" }.second.getJSONArray("manualAppliedJobIds").strings().contains(job.id))
        assertTrue(service.writes.none { it.first == "submit" || it.first == "advance" })
    }

    @Test fun activeAlternativeEvidence_mustNotDecodeAsUnapplied_butCorrectedHistoryRemainsValid() {
        val current = savedRecord("Current saved details", ApplicationStage.SAVED)
        val applied = ApplicationRecordVersion.create(ApplicationRecord(ApplicationStage.APPLIED, appliedElsewhere = true))
        val inconsistent = current.copy(alternatives = listOf(applied), appliedElsewhere = false)
        val store = MemoryStore().apply { records["workspace-unpaired"] = workspace(records = listOf(inconsistent)).toString() }
        val original = store.records["workspace-unpaired"]; val blocked = model(store)
        assertTrue(blocked.state.value.storageBlocked)
        assertEquals(original, store.records["workspace-unpaired"])
        val corrected = current.copy(history = listOf(applied), appliedElsewhere = false)
        val validStore = MemoryStore().apply { records["workspace-unpaired"] = workspace(records = listOf(corrected)).toString() }
        val valid = model(validStore)
        assertFalse(valid.state.value.storageBlocked)
        assertFalse(localJob.id in valid.state.value.manualApplied)
        assertEquals(applied, valid.state.value.recordFor(localJob)!!.history.single())
    }

    @Test fun failedAndSuccessfulJobSync_preserveRecordAcrossCanonicalLeverIdentityAndNewID() {
        val tracked = localJob.copy(url = "https://JOBS.LEVER.CO/Example/00000000-0000-4000-8000-000000000001/apply?utm_source=phone")
        val record = savedRecord("LinkedIn follow-up", job = tracked)
        val store = MemoryStore().apply { records["connection"] = connection.toJson().toString(); records[key(connection)] = workspace(listOf(tracked), listOf(record)).toString() }
        val service = Service(connection).apply { failJobSave = true; returnedURL = "https://jobs.lever.co/example/00000000-0000-4000-8000-000000000001" }
        val model = model(store, service)
        main { model.syncOpportunity(tracked) }; await { !model.state.value.busy }
        assertEquals("LinkedIn follow-up", model.state.value.applicationRecords.getValue(identity(tracked)).current.record.note)
        assertTrue(model.state.value.jobs.any { it.id == tracked.id })
        service.failJobSave = false
        main { model.syncOpportunity(tracked) }; await { !model.state.value.busy && model.state.value.jobs.any { it.id == "synced-record-job" } }
        assertEquals(1, model.state.value.applicationRecords.size)
        assertEquals("LinkedIn follow-up", model.state.value.applicationRecords.getValue(identity(tracked)).current.record.note)
        assertTrue("synced-record-job" in model.state.value.manualApplied)
        assertFalse(tracked.id in model.state.value.manualApplied)
        assertTrue(model.state.value.receipts.isEmpty())
    }

    @Test fun syncIdentityCollision_retainsBothVersionsForReview() {
        val destination = localJob.copy(id = "destination-job", url = "https://jobs.example.invalid/canonical/42", localOnly = false)
        val source = savedRecord("Source note")
        val existing = savedRecord("Destination note", ApplicationStage.SAVED, destination)
        val store = MemoryStore().apply { records["connection"] = connection.toJson().toString(); records[key(connection)] = workspace(listOf(localJob), listOf(source, existing)).toString() }
        val service = Service(connection).apply { jobs = listOf(destination); returnedURL = destination.url }
        val model = model(store, service)
        main { model.openApplicationRecord(destination) }; edit(model) { it.copy(note = "Stale destination editor") }
        main { model.syncOpportunity(localJob) }; await { !model.state.value.busy }
        val merged = model.state.value.applicationRecords.getValue(identity(destination))
        assertEquals("Destination note", merged.current.record.note)
        assertEquals("Source note", merged.alternatives.single().record.note)
        assertTrue(merged.relatedURLs.containsAll(listOf(localJob.url, destination.url)))
        assertTrue(merged.appliedElsewhere)
        assertFalse(model.state.value.applicationRecords.containsKey(identity(localJob)))
        save(model)
        assertEquals(merged, model.state.value.applicationRecords.getValue(identity(destination)))
        assertEquals("Stale destination editor", model.state.value.applicationRecordEditor!!.draft.note)
    }

    @Test fun removingBookmark_keepsMeaningfulRecordAndRestoringTheLinkKeepsItsApplicationGuard() {
        val record = savedRecord("Keep after bookmark removal")
        val store = MemoryStore().apply { records["workspace-unpaired"] = workspace(records = listOf(record)).toString() }
        val model = model(store)
        main { model.removeLocalOpportunity(localJob.id) }; await { !model.state.value.busy }
        assertTrue(model.state.value.jobs.isEmpty())
        assertEquals("Keep after bookmark removal", model.state.value.unbookmarkedRecords.single().current.record.note)
        assertFalse(localJob.id in model.state.value.manualApplied)
        main { model.restoreRecordedOpportunity(identity(), model.state.value.privateScope) }; await { !model.state.value.busy && model.state.value.jobs.size == 1 }
        val restored = model.state.value.jobs.single()
        assertNotEquals(localJob.id, restored.id)
        assertTrue(restored.id in model.state.value.manualApplied)
        assertTrue(model.state.value.unbookmarkedRecords.isEmpty())
        assertTrue(model.state.value.receipts.isEmpty())
    }

    @Test fun failedRecordSave_keepsEarlierFileAndEditorDraft_forRecovery() {
        val record = savedRecord("Earlier note")
        val store = MemoryStore().apply { records["workspace-unpaired"] = workspace(records = listOf(record)).toString() }
        val model = model(store); val original = store.records["workspace-unpaired"]
        main { model.openApplicationRecord(localJob) }; edit(model) { it.copy(note = "Unsaved edit") }
        store.failWrites = true; save(model)
        assertTrue(model.state.value.storageBlocked)
        assertEquals(original, store.records["workspace-unpaired"])
        assertEquals("Earlier note", model.state.value.applicationRecords.getValue(identity()).current.record.note)
        assertEquals("Unsaved edit", model.state.value.applicationRecordEditor!!.draft.note)
        store.failWrites = false
        main { model.retryStorage() }; await { !model.state.value.busy && !model.state.value.storageBlocked }
        save(model)
        assertEquals("Unsaved edit", model.state.value.applicationRecords.getValue(identity()).current.record.note)
    }

    @Test fun invalidDatesAndStaleEditorRevision_doNotOverwriteTheRecord() {
        assertEquals("x".repeat(1_999), boundedApplicationNote("x".repeat(1_999) + "\uD83D\uDE00"))
        assertEquals("x".repeat(1_998) + "\uD83D\uDE00", boundedApplicationNote("x".repeat(1_998) + "\uD83D\uDE00"))
        val record = savedRecord("Current note")
        val store = MemoryStore().apply { records["workspace-unpaired"] = workspace(records = listOf(record)).toString() }
        val model = model(store); val original = store.records["workspace-unpaired"]
        main { model.openApplicationRecord(localJob) }; edit(model) { it.copy(appliedDate = "2025-02-29") }; save(model)
        assertEquals(original, store.records["workspace-unpaired"])
        edit(model) { it.copy(appliedDate = "2024-02-29", note = "Malformed \uD800") }; save(model)
        assertEquals(original, store.records["workspace-unpaired"])
        edit(model) { it.copy(appliedDate = "2024-02-29", note = "Old editor draft") }
        main { model.markAppliedElsewhere(localJob.id, true) }; await { !model.state.value.busy }
        assertNull(model.state.value.applicationRecordEditor)
        main { model.saveApplicationRecord() }; await { !model.state.value.busy }
        assertEquals("Current note", model.state.value.applicationRecords.getValue(identity()).current.record.note)
    }

    @Test fun closedRecord_reachesManualAppliedPreparationInput_withoutAProviderReceipt() {
        val serverJob = localJob.copy(id = "server-job", localOnly = false)
        val closed = savedRecord("Already completed externally", ApplicationStage.CLOSED, serverJob)
        val store = MemoryStore().apply { records["connection"] = connection.toJson().toString(); records[key(connection)] = workspace(listOf(serverJob), listOf(closed)).toString() }
        val service = Service(connection).apply { jobs = listOf(serverJob) }; val model = model(store, service)
        main { model.toggleJob(serverJob.id); model.prepare() }; await { !model.state.value.busy && model.state.value.plan != null }
        assertEquals(listOf(serverJob.id), service.writes.single { it.first == "prepare" }.second.getJSONArray("manualAppliedJobIds").strings())
        assertTrue(model.state.value.receipts.isEmpty())
    }

    @Test fun workspaceSwitch_invalidatesOldCorrectionAndDisconnectIntent() {
        val serverJob = localJob.copy(id = "server-job", localOnly = false)
        val store = MemoryStore().apply {
            records["connection"] = connection.toJson().toString()
            records[key(connection)] = workspace(listOf(serverJob), listOf(savedRecord("Connected note", job = serverJob))).toString()
            records["workspace-unpaired"] = workspace(records = listOf(savedRecord("Phone-only note"))).toString()
        }
        val service = Service(connection).apply { jobs = listOf(serverJob) }; val model = model(store, service)
        main { model.openApplicationRecord(serverJob) }; edit(model) { it.copy(stage = ApplicationStage.SAVED) }; save(model)
        val staleToken = model.state.value.applicationRecordEditor!!.token
        main { model.removeConnectionLocally(connection) }; await { !model.state.value.busy && model.state.value.connection == null }
        main { model.openApplicationRecord(localJob) }; edit(model) { it.copy(stage = ApplicationStage.SAVED) }; save(model)
        val originalPhone = store.records["workspace-unpaired"]
        main { model.saveApplicationRecord(true, staleToken) }; await { !model.state.value.busy }
        assertEquals(originalPhone, store.records["workspace-unpaired"])
        assertTrue(model.state.value.applicationRecords.getValue(identity()).appliedElsewhere)
        main { model.disconnect(connection) }; await { !model.state.value.busy }
        assertTrue(service.writes.none { it.first == "session/revoke" })
        assertTrue(model.state.value.receipts.isEmpty())
    }
}
