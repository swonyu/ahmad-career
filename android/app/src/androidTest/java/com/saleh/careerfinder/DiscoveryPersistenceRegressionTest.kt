package com.saleh.careerfinder

import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

/** Private last-search storage, independent of application APIs and live public boards. */
class DiscoveryPersistenceRegressionTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val scopes = mutableListOf<CoroutineScope>()
    private val gates = mutableListOf<CompletableDeferred<DiscoveryPage>>()
    private fun page() = DiscoveryCodec.page(JSONObject(instrumentation.context.assets.open("discovery-search-v1.json").bufferedReader().use { it.readText() }))
    private class MemoryStore : PrivateStore {
        val records = ConcurrentHashMap<String, String>()
        @Volatile var failReads = false
        @Volatile var failWrites = false
        override fun read(name: String): JSONObject? {
            if (failReads) throw java.io.IOException("Synthetic private storage unavailable")
            return records[name]?.let(::JSONObject)
        }
        override fun write(name: String, value: JSONObject) {
            if (failWrites) throw java.io.IOException("Synthetic private write unavailable")
            records[name] = value.toString()
        }
        override fun remove(name: String) { records.remove(name) }
        override fun startFreshPreservingExisting() { error("No storage reset in these fixtures") }
    }
    private class Service(var result: DiscoveryPage) : DiscoveryService {
        val searches = CopyOnWriteArrayList<Pair<DiscoveryFilters, String?>>()
        @Volatile var catalogCalls = 0
        var failure: Exception? = null
        var next: CompletableDeferred<DiscoveryPage>? = null
        @Volatile var lateReturned = false
        override suspend fun sources(): DiscoveryCatalog { catalogCalls++; return DiscoveryCatalog(emptyList(), emptyList(), 4, "Synthetic") }
        override suspend fun search(filters: DiscoveryFilters, cursor: String?): DiscoveryPage {
            searches += filters to cursor
            next?.let { pending -> next = null; return withContext(NonCancellable) { pending.await().also { lateReturned = true } } }
            failure?.let { throw it }
            return result
        }
    }
    private fun controller(service: Service): DiscoveryController {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main); scopes += scope
        return DiscoveryController(scope, service)
    }
    private fun main(block: () -> Unit) = instrumentation.runOnMainSync(block)
    private fun suspendMain(block: suspend () -> Unit) = runBlocking { withContext(Dispatchers.Main) { block() } }
    private fun await(check: () -> Boolean) {
        val deadline = System.nanoTime() + 5_000_000_000
        while (!check() && System.nanoTime() < deadline) Thread.sleep(10)
        assertTrue("Expected saved-search state within five seconds", check())
    }
    private fun search(controller: DiscoveryController, more: Boolean = false) {
        main { controller.search(more) }; await { !controller.state.value.loading }
    }
    private fun snapshot(filters: DiscoveryFilters, result: DiscoveryPage = page()) = DiscoverySnapshotCodec.encode(DiscoverySnapshot(filters, filters.cleaned(), result)).toString()
    @After fun clear() { gates.forEach { it.complete(page()) }; scopes.forEach { it.cancel() } }

    @Test fun recreatedController_restoresExactFiltersAndEvidence_withoutAnyRequestOrOldCursor() {
        val store = MemoryStore(); val service = Service(page().copy(nextCursor = "must-not-resume")); val first = controller(service)
        suspendMain { first.attachPrivateSession(store, "search-A") }
        val filters = DiscoveryFilters("clinic & care", "São Paulo", true, listOf("greenhouse:example-board"))
        main { first.editFilters { filters } }; search(first)
        suspendMain { first.saveSearchNow(); first.stopPrivateSession(flush = true) }
        val raw = store.records.getValue("search-A")
        assertFalse(raw.contains("must-not-resume"))
        for (privateKey in listOf("profile", "resume", "token", "workspaceId", "connection", "applicationRecords")) assertFalse(JSONObject(raw).has(privateKey))
        val restoredService = Service(page()); val restored = controller(restoredService)
        suspendMain { restored.attachPrivateSession(store, "search-A") }
        assertEquals(filters, restored.state.value.filters)
        assertEquals(page().jobs, restored.state.value.jobs)
        assertEquals(page().sources, restored.state.value.sources)
        assertEquals(page().generatedAt, restored.state.value.generatedAt)
        assertEquals(page().jobs.last().checkedAt, restored.state.value.jobs.last().checkedAt)
        assertNull(restored.state.value.nextCursor)
        assertTrue(restored.state.value.restoredSearch)
        assertTrue(restoredService.searches.isEmpty()); assertEquals(0, restoredService.catalogCalls)
        search(restored)
        assertNull(restoredService.searches.single().second)
        assertFalse(restored.state.value.restoredSearch)
    }

    @Test fun failedRefresh_keepsEarlierResultEvidence_besideNewUnsavedSearchFilters() {
        val store = MemoryStore(); val service = Service(page()); val first = controller(service)
        suspendMain { first.attachPrivateSession(store, "search-A") }
        main { first.editFilters { it.copy(query = "earlier") } }; search(first)
        main { first.editFilters { it.copy(query = "new query") } }
        service.failure = java.io.IOException("Synthetic offline"); search(first)
        service.failure = null
        service.result = page().copy(status = "unavailable", jobs = emptyList(), totalMatches = 0,
            sources = page().sources.map { it.copy(status = "unavailable", checkedAt = null) })
        search(first)
        suspendMain { first.saveSearchNow() }
        val stored = DiscoverySnapshotCodec.decode(JSONObject(store.records.getValue("search-A")))
        assertEquals("new query", stored.filters.query)
        assertEquals("earlier", stored.displayedFilters?.query)
        assertEquals(page().jobs, stored.page?.jobs)
        assertEquals(page().sources, stored.page?.sources)
        assertEquals(page().generatedAt, stored.page?.generatedAt)
        assertTrue(first.state.value.filtersChanged)
    }

    @Test fun futureSavedSearch_isPreservedAndNewResultsStayInMemory_untilExplicitRecovery() {
        val store = MemoryStore(); val original = JSONObject(snapshot(DiscoveryFilters(query = "original"))).put("schema", 99).toString()
        store.records["search-A"] = original
        val service = Service(page()); val controller = controller(service)
        suspendMain { controller.attachPrivateSession(store, "search-A") }
        assertTrue(controller.state.value.searchRestoreBlocked)
        assertNotNull(controller.state.value.searchStorageError)
        main { controller.editFilters { it.copy(query = "temporary") } }; search(controller)
        suspendMain { controller.saveSearchNow() }
        assertEquals(original, store.records["search-A"])
        assertEquals(page().jobs, controller.state.value.jobs)
        main { controller.retrySavedSearch() }; await { !controller.state.value.restoringSearch }
        assertTrue(controller.state.value.searchRestoreBlocked)
        assertEquals(original, store.records["search-A"])
        assertEquals(1, service.searches.size)
    }

    @Test fun writeFailure_keepsEarlierFile_andExplicitRetrySavesCurrentResult() {
        val store = MemoryStore(); val original = snapshot(DiscoveryFilters(query = "earlier")); store.records["search-A"] = original
        val service = Service(page().copy(jobs = listOf(page().jobs.first().copy(title = "Fresh synthetic result"))))
        val controller = controller(service); suspendMain { controller.attachPrivateSession(store, "search-A") }
        store.failWrites = true
        main { controller.editFilters { it.copy(query = "current") } }; search(controller)
        suspendMain { controller.saveSearchNow() }
        assertEquals(original, store.records["search-A"])
        assertNotNull(controller.state.value.searchStorageError)
        store.failWrites = false
        main { controller.retrySavedSearch() }; await { controller.state.value.searchStorageError == null }
        val saved = DiscoverySnapshotCodec.decode(JSONObject(store.records.getValue("search-A")))
        assertEquals("current", saved.filters.query)
        assertEquals("Fresh synthetic result", saved.page!!.jobs.single().title)
    }

    @Test fun accountChange_cancelsLateSearch_andCannotWriteAcrossPrivateScopes() {
        val store = MemoryStore(); store.records["search-B"] = snapshot(DiscoveryFilters(query = "workspace B"))
        val service = Service(page()); val controller = controller(service)
        suspendMain { controller.attachPrivateSession(store, "search-A") }
        val pending = CompletableDeferred<DiscoveryPage>(); gates += pending; service.next = pending
        main { controller.editFilters { it.copy(query = "workspace A") }; controller.search() }
        await { service.searches.size == 1 }
        suspendMain { controller.attachPrivateSession(store, "search-B") }
        val originalB = store.records.getValue("search-B")
        pending.complete(page().copy(jobs = listOf(page().jobs.first().copy(title = "Late workspace A"))))
        await { service.lateReturned }; instrumentation.waitForIdleSync()
        assertEquals("workspace B", controller.state.value.filters.query)
        assertEquals(page().jobs, controller.state.value.jobs)
        assertEquals(originalB, store.records["search-B"])
        assertEquals("workspace A", DiscoverySnapshotCodec.decode(JSONObject(store.records.getValue("search-A"))).filters.query)
        assertNull(DiscoverySnapshotCodec.decode(JSONObject(store.records.getValue("search-A"))).page)
        assertEquals(1, service.searches.size)
    }

    @Test fun paginationHasABoundedRestorableWindow_andDoesNotReuseItsCursor() {
        fun batch(index: Int) = page().copy(jobs = (1..50).map { n -> page().jobs.first().copy(id = "synthetic-${index * 50 + n}") },
            nextCursor = "page-${index + 1}", totalMatches = 250, limited = false)
        val store = MemoryStore(); val service = Service(batch(0)); val controller = controller(service)
        suspendMain { controller.attachPrivateSession(store, "search-A") }; search(controller)
        for (index in 1..3) { service.result = batch(index); search(controller, more = true) }
        assertEquals(200, controller.state.value.jobs.size)
        assertNull(controller.state.value.nextCursor)
        assertTrue(controller.state.value.limited)
        assertTrue(controller.state.value.notice.contains("200 results"))
        search(controller, more = true); assertEquals(4, service.searches.size)
        suspendMain { controller.saveSearchNow() }
        val restored = DiscoverySnapshotCodec.decode(JSONObject(store.records.getValue("search-A")))
        assertEquals(200, restored.page!!.jobs.size); assertNull(restored.page.nextCursor)
        try {
            DiscoverySnapshotCodec.encode(DiscoverySnapshot(DiscoveryFilters(), DiscoveryFilters(), restored.page.copy(jobs = restored.page.jobs + page().jobs.first())))
            fail("A larger result window must not be written")
        } catch (_: IllegalArgumentException) { }
        service.result = batch(0).copy(totalMatches = 200); search(controller)
        for (index in 1..3) {
            service.result = batch(index).copy(totalMatches = 200, nextCursor = if (index == 3) null else "page-${index + 1}")
            search(controller, more = true)
        }
        assertEquals(200, controller.state.value.jobs.size)
        assertNull(controller.state.value.nextCursor)
        assertFalse("Exactly 200 complete results must not claim additional results were omitted", controller.state.value.limited)
    }

    @Test fun oversizedAndMalformedSnapshots_cannotReplaceAnExistingSavedSearch() {
        val oversized = page().copy(jobs = listOf(page().jobs.first().copy(summary = "x".repeat(DiscoverySnapshotCodec.MAX_BYTES))))
        try { DiscoverySnapshotCodec.encode(DiscoverySnapshot(DiscoveryFilters(), DiscoveryFilters(), oversized)); fail("Oversized snapshot accepted") }
        catch (_: IllegalArgumentException) { }
        val malformed = JSONObject(snapshot(DiscoveryFilters())).apply { getJSONObject("filters").put("remoteOnly", "yes") }.toString()
        val store = MemoryStore().apply { records["search-A"] = malformed }; val controller = controller(Service(page()))
        suspendMain { controller.attachPrivateSession(store, "search-A"); controller.saveSearchNow() }
        assertTrue(controller.state.value.searchRestoreBlocked)
        assertEquals(malformed, store.records["search-A"])
    }

    @Test fun transientReadFailure_canBeRetriedWithoutDiscardingEarlierEvidence() {
        val store = MemoryStore().apply { records["search-A"] = snapshot(DiscoveryFilters(query = "previous")); failReads = true }
        val original = store.records["search-A"]; val service = Service(page()); val controller = controller(service)
        suspendMain { controller.attachPrivateSession(store, "search-A") }
        assertTrue(controller.state.value.searchRestoreBlocked)
        main { controller.editFilters { it.copy(query = "temporary") } }; search(controller)
        suspendMain { controller.saveSearchNow() }; assertEquals(original, store.records["search-A"])
        store.failReads = false
        main { controller.retrySavedSearch() }
        await { !controller.state.value.restoringSearch && !controller.state.value.searchRestoreBlocked }
        assertEquals("previous", controller.state.value.filters.query)
        assertEquals(page().jobs, controller.state.value.jobs)
        assertEquals(original, store.records["search-A"])
        assertEquals(1, service.searches.size)
    }

    @Test fun restoredEmptyCompletePage_staysRestoredUntilASuccessfulSearch_andRepairsEquivalentBoards() {
        val empty = page().copy(jobs = emptyList(), status = "complete", totalMatches = 0, nextCursor = null)
        val filters = DiscoveryFilters("saved", "", false, listOf("https://boards.greenhouse.io/example-board", "greenhouse:example-board"))
        val store = MemoryStore(); store.records["search-A"] = snapshot(filters, empty)
        val service = Service(page()); val controller = controller(service)
        suspendMain { controller.attachPrivateSession(store, "search-A") }
        assertEquals(listOf("greenhouse:example-board"), controller.state.value.filters.sources)
        assertEquals(listOf("greenhouse:example-board"), controller.state.value.displayedFilters?.sources)
        assertTrue(controller.state.value.jobs.isEmpty())
        assertEquals("complete", controller.state.value.status)
        assertTrue(controller.state.value.restoredSearch)
        assertEquals("Saved result from an earlier check", DiscoveryPresentation.sourceAvailabilityKey("fresh", controller.state.value.restoredSearch))
        assertFalse(controller.state.value.canRetrySubmittedSearch)
        service.failure = java.io.IOException("Synthetic offline")
        search(controller)
        assertTrue(controller.state.value.jobs.isEmpty())
        assertTrue(controller.state.value.restoredSearch)
        assertEquals("complete", controller.state.value.status)
        assertNotNull(controller.state.value.error)
        assertEquals("saved", controller.state.value.displayedFilters?.query)
        service.failure = null
        search(controller)
        assertFalse(controller.state.value.restoredSearch)
        assertEquals(page().jobs, controller.state.value.jobs)
        assertEquals(listOf("greenhouse:example-board"), controller.state.value.filters.sources)
    }
}
