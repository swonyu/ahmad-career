package com.saleh.careerfinder

import android.app.Application
import android.util.Base64
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.CompletableDeferred
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

/** Real ViewModel behavior with isolated storage/network doubles; no employer requests. */
class WorkspaceRegressionTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val owners = mutableListOf<ViewModelStore>()
    private val connection = Connection("https://fixture.invalid", "test-workspace", "test-session", Instant.now().plusSeconds(3600).toString())

    private class MemoryStore : PrivateStore {
        val records = ConcurrentHashMap<String, String>()
        @Volatile var failReads = false
        @Volatile var failWrites = false
        override fun read(name: String): JSONObject? {
            if (failReads) throw java.io.IOException("Fixture read failure")
            return records[name]?.let(::JSONObject)
        }
        override fun write(name: String, value: JSONObject) {
            if (failWrites) throw java.io.IOException("Fixture write failure")
            records[name] = value.toString()
        }
        override fun remove(name: String) { records.remove(name) }
        override fun startFreshPreservingExisting() { error("Storage rotation is tested against real Android Keystore separately.") }
    }

    private class Service(private val connection: Connection) : CareerService {
        var mode = "test"
        var profile = ProfileDraft(firstName = "Saved", email = "fixture@example.invalid", revision = 1,
            resume = Resume("Old.pdf", 20, "a".repeat(64)))
        var jobs = listOf(Opportunity("job-a", "https://example.invalid/job-a", "Role A", "Employer", "", ""),
            Opportunity("job-b", "https://example.invalid/job-b", "Role B", "Employer", "", ""))
        val writes = mutableListOf<Pair<String, JSONObject>>()
        var gate: CompletableDeferred<Unit>? = null
        var preparing = false
        var nextWorkspaceGate: CompletableDeferred<Unit>? = null
        var workspaceWaiting = false
        @Volatile var deferredReadReturned = false
        var malformedProfileReply = false
        var malformedWorkspace = false
        var rejectGuardedStop = false
        var prepareCount = 0
        private fun profileData() = profile.apiJson().put("revision", profile.revision)
            .put("resume", profile.resume?.metadata() ?: JSONObject.NULL)
        override suspend fun pair(origin: String, code: String) = connection
        override suspend fun request(connection: Connection, method: String, route: String, body: JSONObject?): JSONObject {
            if (method != "GET") writes += route to JSONObject(body.toString())
            return when (route) {
                "workspace" -> {
                    val response = JSONObject().put("ok", true).put("mode", mode).put("workspaceId", connection.workspaceId).put("profile", profileData())
                        .put("jobs", if (malformedWorkspace) JSONObject.NULL else JSONArray(jobs.map(Opportunity::privateJson))).put("attempts", JSONArray())
                        .put("activePlanIds", JSONArray()).put("recoverablePlans", JSONArray()).put("capabilities", JSONObject().put("liveEnabled", false))
                    val deferred = nextWorkspaceGate
                    nextWorkspaceGate = null
                    if (deferred != null) { workspaceWaiting = true; deferred.await(); deferredReadReturned = true }
                    response
                }
                "profile" -> {
                    if (body!!.getInt("expectedRevision") != profile.revision) throw ApiFailure(409, "stale_profile", "Fixture conflict")
                    val input = body.getJSONObject("profile")
                    var saved = ProfileDraft.fromJson(input).copy(revision = profile.revision + 1)
                    saved = saved.copy(resume = when {
                        !input.has("resume") -> profile.resume
                        input.isNull("resume") -> null
                        else -> {
                            val pdf = input.getJSONObject("resume")
                            val bytes = Base64.decode(pdf.getString("dataBase64"), Base64.DEFAULT)
                            Resume(pdf.getString("name"), bytes.size.toLong(), BoundaryPolicy.sha256(bytes))
                        }
                    })
                    profile = saved
                    JSONObject().put("ok", true).put("profile", if (malformedProfileReply) JSONObject() else profileData())
                }
                "jobs" -> {
                    val saved = Opportunity.fromJson(body!!.put("id", "synced-job"))
                    jobs = listOf(saved) + jobs.filterNot { it.id == saved.id }
                    JSONObject().put("ok", true).put("job", saved.privateJson())
                }
                "prepare" -> {
                    val revision = profile.revision
                    prepareCount++
                    preparing = true
                    gate?.await()
                    JSONObject().put("ok", true).put("plan", JSONObject()
                        .put("id", "review-" + prepareCount).put("digest", "fixture-digest").put("profileRevision", revision)
                        .put("approvedAt", JSONObject.NULL).put("expiresAt", Instant.now().plusSeconds(600).toString()).put("items", JSONArray()))
                }
                "stop" -> {
                    if (rejectGuardedStop && body?.optBoolean("onlyIfUnapproved") == true)
                        throw ApiFailure(409, "review_already_approved", "Fixture approval race")
                    JSONObject().put("ok", true)
                }
                "session/revoke" -> JSONObject().put("ok", true)
                else -> error("Unexpected fixture route: $route")
            }
        }
    }

    private fun model(store: MemoryStore, service: Service): CareerViewModel {
        lateinit var model: CareerViewModel
        instrumentation.runOnMainSync {
            model = CareerViewModel(instrumentation.targetContext.applicationContext as Application, store, service)
            owners += ViewModelStore().apply { put("fixture-model", model) }
        }
        await { model.state.value.loaded && !model.state.value.busy }
        return model
    }
    private fun main(block: () -> Unit) = instrumentation.runOnMainSync(block)
    private fun await(check: () -> Boolean) {
        val end = System.nanoTime() + 5_000_000_000
        while (!check() && System.nanoTime() < end) Thread.sleep(20)
        assertTrue("Expected state was not reached within five seconds", check())
    }
    private fun connectedStore() = MemoryStore().apply { records["connection"] = connection.toJson().toString() }
    private fun cacheKey() = "workspace-" + BoundaryPolicy.workspaceKey(connection.origin, connection.workspaceId)

    @After fun clearModels() { main { owners.forEach(ViewModelStore::clear) }; owners.clear() }

    @Test fun storageReadAndWriteFailures_canRetry_withoutLosingTheDraft() {
        val store = MemoryStore().apply { failReads = true }
        val service = Service(connection)
        val model = model(store, service)
        assertTrue(model.state.value.storageBlocked)
        store.failReads = false
        main { model.retryStorage() }
        await { !model.state.value.storageBlocked && !model.state.value.busy }
        store.failWrites = true
        main { model.editProfile { it.copy(firstName = "Kept draft") }; model.saveProfile() }
        await { model.state.value.storageBlocked && !model.state.value.busy }
        assertEquals("Kept draft", model.state.value.profile.firstName)
        store.failWrites = false
        main { model.retryStorage() }
        await { !model.state.value.storageBlocked && !model.state.value.busy }
        assertEquals("Kept draft", store.read("workspace-unpaired")!!.getJSONObject("profile").getString("firstName"))
        assertTrue(service.writes.isEmpty())
    }

    @Test fun profileConflict_keepsOriginalRevision_untilExplicitChoice_andUsesLatestRemotePDF() {
        val store = connectedStore(); val service = Service(connection); val model = model(store, service)
        main { model.editProfile { it.copy(firstName = "My edits") } }
        service.profile = service.profile.copy(firstName = "Another device", revision = 2, resume = Resume("Latest.pdf", 30, "b".repeat(64)))
        main { model.saveProfile() }
        await { !model.state.value.busy && model.state.value.profileConflict != null }
        assertEquals(1, service.writes.first { it.first == "profile" }.second.getInt("expectedRevision"))
        assertEquals("My edits", model.state.value.profile.firstName)
        assertEquals(1, model.state.value.profile.revision)
        main { model.keepDraftWithLatestProfile(2) }
        await { !model.state.value.busy && model.state.value.profileConflict == null }
        assertEquals("My edits", model.state.value.profile.firstName)
        assertEquals("b".repeat(64), model.state.value.profile.resume?.sha256)
        assertTrue(model.state.value.profileDirty)
        assertEquals(1, service.writes.count { it.first == "profile" })
        main { model.saveProfile() }
        await { !model.state.value.busy && !model.state.value.profileDirty }
        assertEquals(2, service.writes.last { it.first == "profile" }.second.getInt("expectedRevision"))
        assertEquals("My edits", service.profile.firstName)
    }

    @Test fun copyingPhoneDraft_isPrivate_preservesOriginal_andMigratesManualAppliedIdentityOnSync() {
        val store = connectedStore(); val service = Service(connection)
        val bytes = "%PDF-1.4 fixture".toByteArray()
        val phone = ProfileDraft(firstName = "Single", email = "single@example.invalid",
            resume = Resume("Own.pdf", bytes.size.toLong(), BoundaryPolicy.sha256(bytes), Base64.encodeToString(bytes, Base64.NO_WRAP)))
        val job = Opportunity("local-phone", "https://example.invalid/import", "Saved role", "Saved employer", "", "", true)
        val original = JSONObject().put("schema", 1).put("profile", phone.privateJson())
            .put("jobs", JSONArray(listOf(job.privateJson()))).put("manualApplied", JSONArray(listOf(job.id))).toString()
        store.records["workspace-unpaired"] = original
        val model = model(store, service)
        main { model.inspectPhoneDraft() }; await { model.state.value.phoneImport != null && !model.state.value.busy }
        main { model.importPhoneDraft(includeProfile = true, includeJobs = true) }
        await { !model.state.value.busy && model.state.value.profile.firstName == "Single" }
        assertEquals("", model.state.value.profile.lastName)
        assertTrue(model.state.value.profileDirty)
        assertTrue(service.writes.isEmpty())
        assertEquals(original, store.records["workspace-unpaired"])
        val imported = model.state.value.jobs.first { it.url == job.url }
        assertTrue(imported.id in model.state.value.manualApplied)
        main { model.syncOpportunity(imported) }; await { !model.state.value.busy && model.state.value.jobs.any { it.id == "synced-job" } }
        assertTrue("synced-job" in model.state.value.manualApplied)
        assertFalse(imported.id in model.state.value.manualApplied)
        assertEquals(original, store.records["workspace-unpaired"])
    }

    @Test fun explicitNoAndSelections_surviveModelRecreation_withoutRestoringApproval() {
        val store = connectedStore(); val service = Service(connection); val first = model(store, service)
        main {
            first.toggleJob("job-a")
            first.editAnswers("job-a") { JobAnswers("My message", consentStore = false, consentMarketing = false) }
        }
        await { store.records[cacheKey()]?.contains("My message") == true }
        val second = model(store, service)
        assertEquals(setOf("job-a"), second.state.value.selected)
        assertEquals(false, second.state.value.answers["job-a"]?.consentStore)
        assertEquals(false, second.state.value.answers["job-a"]?.consentMarketing)
        assertNull(second.state.value.plan)
        assertTrue(service.writes.isEmpty())
    }

    @Test fun backgroundProfileChange_cannotRestoreAStalePreparedPlan() {
        val store = connectedStore(); val service = Service(connection); val model = model(store, service)
        main { model.toggleJob("job-a") }
        service.gate = CompletableDeferred()
        main { model.prepare() }; await { service.preparing }
        service.profile = service.profile.copy(revision = 2)
        main { model.stop("fixture-active-plan") }
        await { model.state.value.profile.revision == 2 }
        service.gate!!.complete(Unit)
        await { !model.state.value.busy }
        assertNull(model.state.value.plan)
        assertTrue(model.state.value.notice.orEmpty().contains("changed while preparing"))
    }

    @Test fun oldWorkspaceResponse_cannotRegressAnAcknowledgedProfileSave() {
        val store = connectedStore(); val service = Service(connection); val model = model(store, service)
        val oldRead = CompletableDeferred<Unit>()
        service.nextWorkspaceGate = oldRead
        main { model.stop("fixture-active-plan") }; await { service.workspaceWaiting }
        val bytes = "%PDF-1.4 new exact file".toByteArray()
        main {
            model.editProfile { it.copy(firstName = "New saved name",
                resume = Resume("New.pdf", bytes.size.toLong(), BoundaryPolicy.sha256(bytes), Base64.encodeToString(bytes, Base64.NO_WRAP))) }
            model.saveProfile()
        }
        await { !model.state.value.busy && model.state.value.profile.revision == 2 }
        oldRead.complete(Unit)
        await { service.deferredReadReturned }
        instrumentation.waitForIdleSync()
        assertEquals(2, model.state.value.profile.revision)
        assertEquals("New saved name", model.state.value.profile.firstName)
        assertEquals(BoundaryPolicy.sha256(bytes), model.state.value.profile.resume?.sha256)
    }

    @Test fun localDisconnect_preservesWorkspaceDraft_andIgnoresItsLateResponse() {
        val store = connectedStore(); val service = Service(connection); val model = model(store, service)
        val oldRead = CompletableDeferred<Unit>()
        service.nextWorkspaceGate = oldRead
        main { model.stop("fixture-active-plan") }; await { service.workspaceWaiting }
        main { model.editProfile { it.copy(firstName = "Preserved connected draft") }; model.removeConnectionLocally() }
        await { !model.state.value.busy && model.state.value.connection == null }
        oldRead.complete(Unit)
        await { service.deferredReadReturned }
        instrumentation.waitForIdleSync()
        assertNull(model.state.value.connection)
        assertEquals("", model.state.value.profile.firstName)
        assertEquals("Preserved connected draft", JSONObject(store.records[cacheKey()]!!).getJSONObject("profile").getString("firstName"))
        assertNull(store.records["connection"])
        assertFalse(service.writes.any { it.first == "session/revoke" })
    }

    @Test fun malformedSuccessfulResponses_doNotReplaceThePhoneDraftOrJobList() {
        val store = connectedStore(); val service = Service(connection); val model = model(store, service)
        service.malformedProfileReply = true
        main { model.editProfile { it.copy(firstName = "Still here") }; model.saveProfile() }
        await { !model.state.value.busy && model.state.value.error != null }
        assertEquals("Still here", model.state.value.profile.firstName)
        assertEquals(1, model.state.value.profile.revision)
        assertTrue(model.state.value.profileDirty)
        val jobs = model.state.value.jobs
        service.malformedWorkspace = true
        main { model.refresh() }; await { !model.state.value.busy }
        assertEquals(jobs, model.state.value.jobs)
        assertEquals("Still here", model.state.value.profile.firstName)
    }

    @Test fun editedReview_stopsOnlyTheUnapprovedPlan_onDeliberatePrepareUpdate() {
        val store = connectedStore(); val service = Service(connection); val model = model(store, service)
        main { model.toggleJob("job-a"); model.prepare() }; await { !model.state.value.busy && model.state.value.plan != null }
        val old = model.state.value.plan!!.id
        main { model.editAnswers("job-a") { JobAnswers("New explicit choice", true, false) } }
        assertTrue(old in model.state.value.obsoleteReviews)
        assertFalse(service.writes.any { it.first == "stop" })
        main { model.prepare() }; await { !model.state.value.busy && model.state.value.plan != null }
        val stop = service.writes.first { it.first == "stop" }.second
        assertEquals(old, stop.getString("planId"))
        assertTrue(stop.getBoolean("onlyIfUnapproved"))
        assertEquals(2, service.prepareCount)
        assertFalse(old in model.state.value.obsoleteReviews)
    }

    @Test fun concurrentApproval_preventsAutomaticReplacementOfTheOldPlan() {
        val store = connectedStore(); val service = Service(connection); val model = model(store, service)
        main { model.toggleJob("job-a"); model.prepare() }; await { !model.state.value.busy && model.state.value.plan != null }
        main { model.editAnswers("job-a") { JobAnswers("Changed message", true, false) } }
        service.rejectGuardedStop = true
        main { model.prepare() }; await { !model.state.value.busy && model.state.value.error != null }
        assertEquals(1, service.prepareCount)
        assertNull(model.state.value.plan)
        assertTrue(model.state.value.error.orEmpty().contains("approved elsewhere"))
    }

    @Test fun savingTheSameLink_keepsItsIdentity_andManualTrackingInvalidatesAnEarlierReview() {
        val store = connectedStore(); val service = Service(connection); val model = model(store, service)
        val original = model.state.value.jobs.first()
        var closed = false
        main { model.addOpportunity(original.url, "Repeated discovery title", "Repeated employer", "", "") { closed = true } }
        await { !model.state.value.busy && closed }
        assertEquals(2, model.state.value.jobs.size)
        assertEquals(original, model.state.value.jobs.first())
        assertFalse(service.writes.any { it.first == "jobs" })
        main { model.toggleJob(original.id); model.prepare() }; await { !model.state.value.busy && model.state.value.plan != null }
        val earlier = model.state.value.plan!!.id
        main { model.markAppliedElsewhere(original.id, true) }; await { !model.state.value.busy }
        assertTrue(original.id in model.state.value.manualApplied)
        assertNull(model.state.value.plan)
        assertTrue(earlier in model.state.value.obsoleteReviews)
        assertTrue(model.state.value.receipts.isEmpty())
        assertFalse(service.writes.any { it.first in setOf("submit", "advance", "stop") })
        assertTrue(store.read(cacheKey())!!.getJSONArray("manualApplied").strings().contains(original.id))
    }

    @Test fun disabledLiveSending_blocksApprovalBeforeAnySubmissionRequest() {
        val service = Service(connection).apply { mode = "local" }
        val model = model(connectedStore(), service)
        main { model.toggleJob("job-a"); model.prepare() }; await { !model.state.value.busy && model.state.value.plan != null }
        val plan = model.state.value.plan!!
        main { model.submit(plan) }; await { !model.state.value.busy && model.state.value.error != null }
        assertTrue(model.state.value.error.orEmpty().contains("not enabled"))
        assertTrue(model.state.value.activePlans.isEmpty())
        assertFalse(service.writes.any { it.first in setOf("submit", "advance") })
    }
}
