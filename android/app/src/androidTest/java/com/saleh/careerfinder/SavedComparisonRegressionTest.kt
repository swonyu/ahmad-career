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
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

/** Local facts and read-only comparison ownership. All service responses are fixed in memory. */
class SavedComparisonRegressionTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val owners = mutableListOf<ViewModelStore>()
    private val riyadh = Opportunity("compare-riyadh", "https://example.invalid/openings?city=riyadh", "Research specialist",
        "Example Research", "Riyadh · الرياض", "SA", true, "Example Careers", "2026-11-20T12:00:00Z")
    private val jeddah = Opportunity("compare-jeddah", "https://example.invalid/openings?city=jeddah", riyadh.title,
        riyadh.company, "Jeddah · جدة", "SA", true)
    private val connection = Connection("https://compare.example.invalid", "compare-workspace", "synthetic-no-authority", "2099-12-31T00:00:00Z")
    private fun record(job: Opportunity, stage: ApplicationStage = ApplicationStage.INTERVIEW, date: String = "2026-12-08") =
        ApplicationRecordBundle.create(job, ApplicationRecord(stage = stage, followUpDate = date,
            appliedElsewhere = stage != ApplicationStage.SAVED, manualResumeName = "CV-A.pdf"))
    private fun state(jobs: List<Opportunity> = listOf(riyadh, jeddah), records: List<ApplicationRecordBundle> = emptyList()) =
        CareerUiState(loaded = true, jobs = jobs, selected = setOf(riyadh.id),
            applicationRecords = records.associateBy { it.identity })
    private fun identity(job: Opportunity) = BoundaryPolicy.jobIdentity(job.url)
    private fun key(state: CareerUiState, job: Opportunity, recordOnly: Boolean = false) =
        requireNotNull(SavedComparisonPolicy.key(state, job, recordOnly))
    private fun reject(block: () -> Unit) {
        try { block() } catch (_: Exception) { return }
        fail("Malformed optional posting facts must be rejected")
    }

    private class MemoryStore : PrivateStore {
        val values = ConcurrentHashMap<String, String>()
        @Volatile var failWrites = false
        override fun read(name: String) = values[name]?.let(::JSONObject)
        override fun write(name: String, value: JSONObject) {
            if (failWrites) throw java.io.IOException("Synthetic storage failure")
            values[name] = value.toString()
        }
        override fun remove(name: String) { values.remove(name) }
        override fun startFreshPreservingExisting() { error("No reset in comparison fixtures") }
    }
    private class Service(var jobs: List<Opportunity> = emptyList()) : CareerService {
        val calls = CopyOnWriteArrayList<String>()
        val jobBodies = CopyOnWriteArrayList<String>()
        override suspend fun pair(origin: String, code: String): Connection = error("No pairing")
        override suspend fun request(connection: Connection, method: String, route: String, body: JSONObject?): JSONObject {
            calls += method + " " + route
            return when {
                method == "GET" && route == "workspace" && body == null -> {
                    val profile = ProfileDraft(firstName = "Synthetic", email = "compare@example.invalid", revision = 1)
                    JSONObject().put("ok", true).put("mode", "test").put("workspaceId", connection.workspaceId)
                        .put("profile", profile.apiJson(includeLinkedIn = true).put("resume", JSONObject.NULL).put("revision", 1))
                        .put("jobs", JSONArray(jobs.map(Opportunity::privateJson))).put("attempts", JSONArray())
                        .put("activePlanIds", JSONArray()).put("recoverablePlans", JSONArray())
                        .put("capabilities", JSONObject().put("liveEnabled", false).put("linkedinProfile", true))
                }
                method == "POST" && route == "jobs" && body != null -> {
                    require(body.keys().asSequence().toSet() == setOf("url", "title", "company", "location", "country"))
                    jobBodies += body.toString()
                    val synced = Opportunity.fromServer(JSONObject(body.toString()).put("id", "compare-synced"))
                    jobs = listOf(synced)
                    JSONObject().put("ok", true).put("job", synced.privateJson())
                }
                else -> error("No provider, employer or other service action in this fixture")
            }
        }
    }
    private fun main(block: () -> Unit) = instrumentation.runOnMainSync(block)
    private fun await(check: () -> Boolean) {
        val deadline = System.nanoTime() + 5_000_000_000
        while (System.nanoTime() < deadline) {
            if (check()) return
            Thread.sleep(10)
        }
        fail("Expected synthetic state within five seconds")
    }
    private fun model(store: MemoryStore, service: Service = Service()): CareerViewModel {
        lateinit var model: CareerViewModel
        main {
            val discovery = object : DiscoveryService {
                override suspend fun sources() = DiscoveryCatalog(emptyList(), emptyList(), 4, "Synthetic comparison")
                override suspend fun search(filters: DiscoveryFilters, cursor: String?): DiscoveryPage = error("No discovery network")
            }
            model = CareerViewModel(instrumentation.targetContext.applicationContext as Application, store, service,
                discoveryService = discovery, waitForPoll = { awaitCancellation() })
            owners += ViewModelStore().apply { put("comparison-model", model) }
        }
        await { model.state.value.loaded && !model.state.value.busy }
        return model
    }
    @After fun cleanup() { main { owners.forEach(ViewModelStore::clear) }; owners.clear() }

    @Test fun identicalTitlesKeepDistinctCitiesCanonicalLinksStagesAndFollowUps() {
        val first = record(riyadh, ApplicationStage.INTERVIEW, "2026-12-08")
        val second = record(jeddah, ApplicationStage.SAVED, "2026-12-10")
        val current = state(records = listOf(first, second))
        val pair = requireNotNull(SavedComparisonPolicy.pair(current, listOf(key(current, riyadh), key(current, jeddah))))
        assertEquals(listOf(riyadh.title, riyadh.title), pair.map { it.job.title })
        assertEquals(listOf(riyadh.location, jeddah.location), pair.map { it.job.location })
        assertEquals(listOf(riyadh.url, jeddah.url), pair.map { it.job.url })
        assertNotEquals(pair[0].key.identity, pair[1].key.identity)
        assertEquals(listOf(ApplicationStage.INTERVIEW, ApplicationStage.SAVED), pair.map { it.stage })
        assertEquals(listOf("2026-12-08", "2026-12-10"), pair.map { it.followUpDate })
    }

    @Test fun absentFactsStayUnknownAndNoRecordMeansSavedWithoutFollowUp() {
        val current = state()
        val item = requireNotNull(SavedComparisonPolicy.item(current, key(current, jeddah)))
        assertNull(item.job.sourceName); assertNull(item.job.checkedAt)
        assertEquals(ApplicationStage.SAVED, item.stage); assertNull(item.followUpDate)
        assertFalse(item.recordOnly); assertFalse(item.conflictingRecords)
        assertNull(Opportunity.fromJson(jeddah.privateJson().put("sourceName", JSONObject.NULL).put("checkedAt", JSONObject.NULL)).sourceName)
    }

    @Test fun optionalFactsRejectWrongTypesInvalidTimeControlsAndOversize() {
        for (value in listOf<Any>(7, true, JSONObject(), JSONArray())) {
            reject { Opportunity.fromJson(riyadh.privateJson().put("sourceName", value)) }
            reject { Opportunity.fromJson(riyadh.privateJson().put("checkedAt", value)) }
        }
        for (name in listOf("x".repeat(151), "Board\nName", "x\u0000y", "x\uD800y"))
            reject { Opportunity.fromJson(riyadh.privateJson().put("sourceName", name)) }
        for (time in listOf("", "tomorrow", "2026-13-01T12:00:00Z", "x".repeat(65)))
            reject { Opportunity.fromJson(riyadh.privateJson().put("checkedAt", time)) }
        assertTrue(SavedJobMetadata.valid("س".repeat(150), "2026-11-20T12:00:00Z"))
    }

    @Test fun serviceContractHasOnlyFiveFieldsAndDoesNotInventDiscoveryMetadata() {
        assertEquals(setOf("url", "title", "company", "location", "country"), riyadh.inputJson().keys().asSequence().toSet())
        val fromWorkspace = Opportunity.fromServer(riyadh.privateJson())
        assertNull(fromWorkspace.sourceName); assertNull(fromWorkspace.checkedAt)
        assertFalse(fromWorkspace.localOnly)
    }

    @Test fun samePostingRetainsKnownSourceAndNewestObservedTimeOnly() {
        val old = riyadh.copy(checkedAt = "2026-11-19T12:00:00Z")
        val preferred = riyadh.copy(url = riyadh.url + "&utm_source=fixture", sourceName = null, checkedAt = null)
        assertEquals(riyadh.sourceName, SavedJobMetadata.preserving(preferred, riyadh).sourceName)
        assertEquals(riyadh.checkedAt, SavedJobMetadata.preserving(old, riyadh).checkedAt)
        assertEquals(riyadh.checkedAt, SavedJobMetadata.preserving(riyadh, old).checkedAt)
        assertEquals(jeddah, SavedJobMetadata.preserving(jeddah, riyadh))
        assertEquals(preferred, SavedJobMetadata.preserving(preferred, listOf(riyadh, riyadh.copy(id = "duplicate"))))
    }

    @Test fun duplicateRowIdentityCannotBeResolvedOrComparedAsTwoOpenings() {
        val current = state(jobs = listOf(riyadh, riyadh.copy(url = jeddah.url)))
        assertNull(SavedComparisonPolicy.key(current, riyadh))
        val normal = state()
        val first = key(normal, riyadh)
        assertNull(SavedComparisonPolicy.pair(normal, listOf(first, first)))
        assertNull(SavedComparisonPolicy.pair(normal, listOf(first)))
    }

    @Test fun selectionIsBoundToWorkspaceSessionAndActualRowUrl() {
        val current = state()
        val selected = listOf(key(current, riyadh), key(current, jeddah))
        val foreign = current.copy(connection = connection)
        val newSession = current.copy(comparisonSession = "other-session")
        val substituted = current.copy(jobs = listOf(riyadh.copy(url = "https://example.invalid/different"), jeddah))
        for (next in listOf(foreign, newSession, substituted, current.copy(storageBlocked = true), current.copy(loaded = false))) {
            assertNull(SavedComparisonPolicy.pair(next, selected))
        }
        assertEquals(emptyList<SavedComparisonKey>(), SavedComparisonPolicy.available(newSession, selected))
        val connected = current.copy(connection = connection)
        val oldKey = key(connected, riyadh)
        assertNull(SavedComparisonPolicy.item(connected.copy(connection = connection.copy(token = "rotated-synthetic-token")), oldKey))
        assertFalse(oldKey.toString().contains(connection.token))
    }

    @Test fun staleRemovalAndReplacementDoNotReuseAnEarlierSelection() {
        val current = state()
        val selected = listOf(key(current, riyadh), key(current, jeddah))
        val removed = current.copy(jobs = listOf(jeddah))
        assertEquals(listOf(selected[1]), SavedComparisonPolicy.available(removed, selected))
        assertNull(SavedComparisonPolicy.pair(removed, selected))
        val replacement = current.copy(jobs = listOf(riyadh.copy(id = "new-row"), jeddah))
        assertNull(SavedComparisonPolicy.item(replacement, selected[0]))
    }

    @Test fun selectionIsLimitedToTwoAndIndependentOfApplyChoices() {
        val third = jeddah.copy(id = "third", url = "https://example.invalid/third", location = "Dammam")
        val current = state(listOf(riyadh, jeddah, third))
        val a = key(current, riyadh); val b = key(current, jeddah); val c = key(current, third)
        val before = WorkspaceStorage.encode(current).toString()
        var selected = SavedComparisonPolicy.toggle(current, emptyList(), a)
        selected = SavedComparisonPolicy.toggle(current, selected, b)
        assertEquals(selected, SavedComparisonPolicy.toggle(current, selected, c))
        assertEquals(listOf(b), SavedComparisonPolicy.toggle(current, selected, a))
        assertNotNull(SavedComparisonPolicy.pair(current, selected))
        assertEquals(setOf(riyadh.id), current.selected)
        assertEquals(before, WorkspaceStorage.encode(current).toString())
    }

    @Test fun retainedRecordOnlyRowsKeepFactsAndDiscloseConflictingVersions() {
        val original = record(riyadh)
        val alternative = ApplicationRecordVersion.create(ApplicationRecord(ApplicationStage.OFFER, followUpDate = "2026-12-11", appliedElsewhere = true))
        val ambiguous = original.copy(alternatives = listOf(alternative))
        val current = state(listOf(jeddah), listOf(ambiguous))
        val item = requireNotNull(SavedComparisonPolicy.item(current, key(current, riyadh, true)))
        assertTrue(item.recordOnly); assertTrue(item.conflictingRecords)
        assertNull(item.stage); assertNull(item.followUpDate)
        assertEquals(riyadh.sourceName, item.job.sourceName); assertEquals(riyadh.checkedAt, item.job.checkedAt)
        assertEquals("CV-A.pdf", current.applicationRecords.getValue(identity(riyadh)).current.record.manualResumeName)
    }

    @Test fun privateAndPortableBackupsRoundTripFactsWithoutComparisonSelection() {
        val original = state(records = listOf(record(riyadh))).copy(profile = ProfileDraft(resume = Resume("CV-B.pdf", 20, "b".repeat(64))))
        val local = WorkspaceStorage.decode(WorkspaceStorage.encode(original), null)
        assertEquals(riyadh, local.jobs.first())
        assertNotEquals(original.comparisonSession, local.comparisonSession)
        val common = WorkspaceTransfer.export(original, search = null, includePDF = false).apply { remove("extensions") }
        val portable = WorkspaceTransfer.decode(common, "workspace-unpaired").snapshot
        assertEquals(riyadh.sourceName, portable.jobs.first().sourceName)
        assertEquals(riyadh.checkedAt, portable.applicationRecords.getValue(identity(riyadh)).job.checkedAt)
        assertEquals("CV-A.pdf", portable.applicationRecords.getValue(identity(riyadh)).current.record.manualResumeName)
        assertFalse(common.toString().contains(original.comparisonSession))
        assertFalse(common.toString().contains("comparison"))
        assertNull(SavedComparisonPolicy.item(local, key(original, riyadh)))
    }

    @Test fun recordMergePreservesFactsAndAllEarlierCvVersions() {
        val original = record(riyadh.copy(sourceName = null, checkedAt = null))
        val incoming = record(riyadh, ApplicationStage.OFFER, "2026-12-15")
        val merged = original.merge(incoming, original.job)
        assertEquals(riyadh.sourceName, merged.job.sourceName); assertEquals(riyadh.checkedAt, merged.job.checkedAt)
        assertEquals(original.current, merged.current)
        assertEquals(incoming.current, merged.alternatives.single())
        assertEquals("CV-A.pdf", merged.current.record.manualResumeName)
    }

    @Test fun discoverySaveUsesActualObservedFactsAndDoesNotSetCurrentTime() {
        val store = MemoryStore(); val service = Service(); val model = model(store, service)
        val discovered = DiscoveredJob("greenhouse:fixture:1", "greenhouse:fixture", "Example Careers", "greenhouse",
            riyadh.title, riyadh.company, riyadh.url, riyadh.location, "SA", null, "", null, null, "2026-11-20T12:00:00Z", false)
        main { model.addDiscoveredOpportunity(discovered) {} }
        await { model.state.value.jobs.size == 1 && !model.state.value.busy }
        val saved = model.state.value.jobs.single()
        assertEquals(discovered.sourceName, saved.sourceName); assertEquals(discovered.checkedAt, saved.checkedAt)
        assertTrue(service.calls.isEmpty())
        assertEquals(saved.checkedAt, WorkspaceStorage.decode(store.read("workspace-unpaired")!!, null).jobs.single().checkedAt)
    }

    @Test fun removingAndRestoringBookmarkRetainsOnlyItsScopedObservedFacts() {
        val store = MemoryStore()
        val old = record(riyadh.copy(sourceName = null, checkedAt = "2026-11-19T12:00:00Z"))
        store.write("workspace-unpaired", WorkspaceStorage.encode(state(records = listOf(old))))
        val model = model(store)
        main { model.removeLocalOpportunity(riyadh.id) }
        await { !model.state.value.busy && model.state.value.jobs.none { it.id == riyadh.id } }
        val retained = model.state.value.applicationRecords.getValue(identity(riyadh))
        assertEquals(riyadh.checkedAt, retained.job.checkedAt); assertEquals(riyadh.sourceName, retained.job.sourceName)
        assertEquals(old.current, retained.current); assertEquals(old.revision + 1, retained.revision)
        main { model.restoreRecordedOpportunity(identity(riyadh), model.state.value.privateScope) }
        await { !model.state.value.busy && model.state.value.jobs.size == 2 }
        assertEquals(riyadh.checkedAt, model.state.value.jobs.single { identity(it) == identity(riyadh) }.checkedAt)
    }

    @Test fun failedBookmarkRemovalRollsBackRecordMetadataWithTheLink() {
        val store = MemoryStore(); val old = record(riyadh.copy(sourceName = null, checkedAt = null))
        store.write("workspace-unpaired", WorkspaceStorage.encode(state(records = listOf(old))))
        val model = model(store); val before = store.values.getValue("workspace-unpaired")
        store.failWrites = true
        main { model.removeLocalOpportunity(riyadh.id) }
        await { !model.state.value.busy && model.state.value.error != null }
        assertEquals(listOf(riyadh, jeddah), model.state.value.jobs)
        assertEquals(old, model.state.value.applicationRecords.getValue(identity(riyadh)))
        assertEquals(before, store.values.getValue("workspace-unpaired"))
    }

    @Test fun syncAndRefreshKeepFactsLocallyButNeverSendThem() {
        val store = MemoryStore(); val service = Service()
        store.write("connection", connection.toJson())
        val scope = "workspace-" + BoundaryPolicy.workspaceKey(connection.origin, connection.workspaceId)
        store.write(scope, WorkspaceStorage.encode(state(listOf(riyadh)).copy(connection = connection)))
        val model = model(store, service)
        main { model.syncOpportunity(model.state.value.jobs.single()) }
        await { !model.state.value.busy && model.state.value.jobs.singleOrNull()?.localOnly == false }
        assertEquals(riyadh.checkedAt, model.state.value.jobs.single().checkedAt)
        assertEquals(setOf("url", "title", "company", "location", "country"), JSONObject(service.jobBodies.single()).keys().asSequence().toSet())
        main { model.refresh() }
        await { !model.state.value.busy }
        assertEquals(riyadh.sourceName, model.state.value.jobs.single().sourceName)
        assertEquals(riyadh.checkedAt, model.state.value.jobs.single().checkedAt)
        val calls = service.calls.toList()
        val current = model.state.value
        assertNotNull(SavedComparisonPolicy.item(current, key(current, current.jobs.single())))
        assertEquals(calls, service.calls.toList())
    }
}
