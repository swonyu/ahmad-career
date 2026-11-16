package com.saleh.careerfinder

import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import java.net.URI
import java.util.concurrent.CopyOnWriteArrayList

/** Public discovery only: no applicant session, real employer request or application. */
class DiscoveryRegressionTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val scopes = mutableListOf<CoroutineScope>()
    private val gates = mutableListOf<CompletableDeferred<DiscoveryPage>>()
    private fun fixture() = JSONObject(instrumentation.context.assets.open("discovery-search-v1.json").bufferedReader().use { it.readText() })
    private fun page() = DiscoveryCodec.page(fixture())
    private class Service(var result: DiscoveryPage) : DiscoveryService {
        val searches = CopyOnWriteArrayList<Pair<DiscoveryFilters, String?>>()
        var next: CompletableDeferred<DiscoveryPage>? = null
        var failure: Exception? = null
        @Volatile var lateResultReturned = false
        @Volatile var catalogCalls = 0
        override suspend fun sources(): DiscoveryCatalog {
            catalogCalls++
            return DiscoveryCatalog(listOf("greenhouse:example-board"), listOf(DiscoverySource("greenhouse:example-board", "Synthetic board",
                "greenhouse", "global", "example-board", "https://job-boards.greenhouse.io/example-board")), 4, "Synthetic fixture")
        }
        override suspend fun search(filters: DiscoveryFilters, cursor: String?): DiscoveryPage {
            searches += filters to cursor
            val gate = next; next = null
            if (gate != null) return withContext(NonCancellable) { gate.await().also { lateResultReturned = true } }
            failure?.let { throw it }
            return result
        }
    }
    private fun controller(service: Service): DiscoveryController {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main); scopes += scope
        return DiscoveryController(scope, service)
    }
    private fun main(block: () -> Unit) = instrumentation.runOnMainSync(block)
    private fun await(check: () -> Boolean) {
        val deadline = System.nanoTime() + 5_000_000_000
        while (!check() && System.nanoTime() < deadline) Thread.sleep(10)
        assertTrue("Expected discovery state was not reached", check())
    }
    private fun search(controller: DiscoveryController, more: Boolean = false) {
        main { controller.search(more) }; await { !controller.state.value.loading }
    }
    @After fun clear() { gates.forEach { it.complete(page()) }; scopes.forEach { it.cancel() } }

    @Test fun sharedContract_preservesUnknownEligibilityAndExplicitStaleEvidence() {
        val parsed = page()
        assertEquals("partial", parsed.status)
        assertNull(parsed.jobs.first().country)
        assertNull(parsed.jobs.first().remote)
        assertEquals(true, parsed.jobs.last().remote)
        assertTrue(parsed.jobs.last().stale)
        assertEquals("2026-11-16T14:30:00.000Z", parsed.jobs.last().checkedAt)
        assertEquals("stale", parsed.sources.last().status)
        assertNotNull(parsed.sources.last().error)
        assertNull(parsed.jobs.last().publishedAt)
        for (field in listOf("remote", "url", "checkedAt")) {
            val invalid = fixture()
            invalid.getJSONArray("jobs").getJSONObject(0).put(field, when (field) { "url" -> "javascript:alert(1)"; "remote" -> "yes"; else -> "yesterday" })
            try { DiscoveryCodec.page(invalid); fail("Malformed $field was accepted") } catch (_: IllegalArgumentException) { }
        }
    }

    @Test fun searchIsExplicit_andUsesOnlyPublicFiltersAtTheFixedOrigin() {
        val service = Service(page()); val controller = controller(service)
        main { controller.loadSources(); controller.editFilters { it.copy(query = "clinic & care", location = "São Paulo", remoteOnly = true) } }
        await { controller.state.value.catalog != null }
        assertTrue(service.searches.isEmpty())
        search(controller)
        assertEquals(1, service.searches.size)
        assertEquals("clinic & care", service.searches.single().first.query)
        val url = URI(PublicDiscoveryService.searchURL(service.searches.single().first, null))
        assertEquals(URI(ServicePages.DEFAULT_ORIGIN).host, url.host)
        assertEquals("/api/discovery/search", url.path)
        assertTrue(url.rawQuery.contains("q=clinic+%26+care"))
        assertTrue(url.rawQuery.endsWith("remote=remote"))
        assertFalse(url.rawQuery.contains("token"))
        for (source in listOf("https://evil.invalid/board", "https://jobs.lever.co.evil.invalid/board", "https://user@jobs.lever.co/board", "https://jobs.lever.co:443/board", "http://jobs.lever.co/board"))
            assertFalse(source, PublicDiscoveryService.supportedSource(source))
        assertTrue(PublicDiscoveryService.supportedSource("https://jobs.eu.lever.co/example-board/00000000-0000-4000-8000-000000000001"))
        try { PublicDiscoveryService.searchURL(DiscoveryFilters(sources = (1..5).map { "greenhouse:board-$it" }), null); fail("Too many sources") }
        catch (_: IllegalArgumentException) { }
    }

    @Test fun lateCancelledResponse_cannotReplaceNewerSearchResults() {
        val service = Service(page()); val controller = controller(service)
        val old = CompletableDeferred<DiscoveryPage>(); gates += old; service.next = old
        main { controller.editFilters { it.copy(query = "old") }; controller.search() }; await { service.searches.size == 1 }
        service.result = page().copy(jobs = listOf(page().jobs.first().copy(title = "New query fixture")))
        main { controller.editFilters { it.copy(query = "new") } }
        search(controller)
        assertEquals("New query fixture", controller.state.value.jobs.single().title)
        old.complete(page()); await { service.lateResultReturned }; instrumentation.waitForIdleSync()
        assertEquals("new", controller.state.value.displayedFilters?.query)
        assertEquals("New query fixture", controller.state.value.jobs.single().title)
        assertFalse(controller.state.value.loading)
    }

    @Test fun errorsAndUnavailableBoards_preserveEarlierResultsWithoutCallingThemZeroMatches() {
        val service = Service(page()); val controller = controller(service); search(controller)
        val earlier = controller.state.value.jobs
        service.failure = java.io.IOException("Fixture offline"); search(controller)
        assertEquals(earlier, controller.state.value.jobs)
        assertNotNull(controller.state.value.error)
        service.failure = null
        service.result = page().copy(status = "unavailable", jobs = emptyList(), totalMatches = 0,
            sources = page().sources.map { it.copy(status = "unavailable", checkedAt = null) })
        search(controller)
        assertEquals(earlier, controller.state.value.jobs)
        assertEquals("unavailable", controller.state.value.status)
        assertTrue(controller.state.value.error.orEmpty().contains("earlier results"))
    }

    @Test fun paginationDeduplicates_andChangedSnapshotRequiresExplicitRestart() {
        val first = page().copy(jobs = listOf(page().jobs.first()), nextCursor = "fixture-cursor")
        val service = Service(first); val controller = controller(service); search(controller)
        service.result = page(); search(controller, more = true)
        assertEquals(2, controller.state.value.jobs.size)
        assertEquals("fixture-cursor", service.searches.last().second)
        service.result = first; search(controller)
        service.failure = DiscoveryFailure(409, "discovery_changed", "Fixture changed")
        search(controller, more = true)
        assertEquals(first.jobs, controller.state.value.jobs)
        assertTrue(controller.state.value.cursorInvalid)
        assertNull(controller.state.value.nextCursor)
        val calls = service.searches.size
        search(controller, more = true)
        assertEquals(calls, service.searches.size)
        service.failure = null; service.result = page(); search(controller)
        assertNull(service.searches.last().second)
        assertFalse(controller.state.value.cursorInvalid)
    }

    @Test fun cancellingSearch_keepsDisplayedResults_andNeverRetriesByItself() {
        val service = Service(page()); val controller = controller(service); search(controller)
        val earlier = controller.state.value.jobs
        val pending = CompletableDeferred<DiscoveryPage>(); gates += pending; service.next = pending
        main { controller.search() }; await { service.searches.size == 2 }
        main { controller.cancelSearch() }
        pending.complete(page().copy(jobs = emptyList())); await { service.lateResultReturned }; instrumentation.waitForIdleSync()
        assertEquals(earlier, controller.state.value.jobs)
        assertFalse(controller.state.value.loading)
        assertEquals(2, service.searches.size)
    }

    @Test fun retryAfterPreventsAnImmediateRepeatedRequest() {
        val service = Service(page()); val controller = controller(service); search(controller)
        service.failure = DiscoveryFailure(429, "rate_limited", "Fixture budget", 60)
        search(controller)
        val calls = service.searches.size
        assertTrue(controller.state.value.retryAtMillis > System.currentTimeMillis())
        search(controller)
        assertEquals(calls, service.searches.size)
        assertEquals(page().jobs, controller.state.value.jobs)
    }
}
