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
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

internal object DiscoveryHistoryFixture {
    const val BOARD = "greenhouse:career-feature-fixture"
    const val OTHER = "greenhouse:career-feature-other"
    val filters = DiscoveryFilters("care", "", false, listOf(BOARD))
    fun id(letter: String, board: String = BOARD) = "$board:$letter"
    fun page(vararg letters: String, board: String = BOARD, matched: Int = letters.size,
             sourceStatus: String = "fresh", sourceError: String? = null, limited: Boolean = false,
             cursor: String? = null, stale: Boolean = false): DiscoveryPage {
        val checked = "2026-11-21T00:00:00Z"
        val jobs = letters.map { letter -> DiscoveredJob(id(letter, board), board, "Synthetic care board", "greenhouse",
            "Care role $letter · دور رعاية", "Example Care", "https://example.invalid/new-search/$letter",
            "Amman · عمّان", "JO", null, "Synthetic role for local discovery checks.", null, null, checked, stale) }
        val source = DiscoverySourceStatus(board, "Synthetic care board", "greenhouse",
            "https://job-boards.greenhouse.io/" + board.substringAfter(':'), sourceStatus, checked,
            maxOf(matched, jobs.size), matched, limited, sourceError)
        return DiscoveryPage(checked, if (sourceStatus == "unavailable") "unavailable" else "complete",
            jobs, listOf(source), cursor, maxOf(matched, jobs.size), limited, "Synthetic boards only.")
    }
    fun combine(vararg pages: DiscoveryPage) = pages.first().copy(
        jobs = pages.flatMap { it.jobs }, sources = pages.flatMap { it.sources },
        totalMatches = pages.sumOf { it.totalMatches }, limited = pages.any { it.limited },
        status = if (pages.any { it.status == "unavailable" }) "partial" else "complete")
}
internal class DiscoveryHistoryMemoryStore : PrivateStore {
    val records = ConcurrentHashMap<String, String>()
    @Volatile var failWrites = false
    override fun read(name: String) = records[name]?.let(::JSONObject)
    override fun write(name: String, value: JSONObject) {
        if (failWrites) throw IOException("Synthetic private write unavailable")
        records[name] = value.toString()
    }
    override fun remove(name: String) { records.remove(name) }
    override fun startFreshPreservingExisting() { error("No storage reset is permitted") }
}
internal class DiscoveryHistoryService(@Volatile var result: DiscoveryPage = DiscoveryHistoryFixture.page("A", "B")) : DiscoveryService {
    val requests = CopyOnWriteArrayList<Pair<DiscoveryFilters, String?>>()
    @Volatile var next: CompletableDeferred<DiscoveryPage>? = null
    @Volatile var failure: Exception? = null
    @Volatile var lateReturned = false
    override suspend fun sources() = DiscoveryCatalog(listOf(DiscoveryHistoryFixture.BOARD), emptyList(), 4, "Synthetic only")
    override suspend fun search(filters: DiscoveryFilters, cursor: String?): DiscoveryPage {
        requests += filters to cursor
        next?.let { pending -> next = null; return withContext(NonCancellable) { pending.await().also { lateReturned = true } } }
        failure?.let { throw it }
        return result
    }
}

/** Bounded search evidence and ownership checks; every service and record is synthetic. */
class DiscoverySearchHistoryRegressionTest {
    private val fixture = DiscoveryHistoryFixture
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val scopes = mutableListOf<CoroutineScope>()
    private val gates = mutableListOf<CompletableDeferred<DiscoveryPage>>()
    private fun evaluate(history: DiscoverySearchHistory = DiscoverySearchHistory(), page: DiscoveryPage = fixture.page("A", "B"),
                         filters: DiscoveryFilters = fixture.filters, time: Long = 1, prior: DiscoveryNewResult? = null) =
        DiscoveryHistoryPolicy.evaluate(history, filters, page, time, prior)
    private fun baseline() = evaluate()
    private fun controller(service: DiscoveryHistoryService): DiscoveryController {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main); scopes += scope
        return DiscoveryController(scope, service)
    }
    private fun main(block: () -> Unit) = instrumentation.runOnMainSync(block)
    private fun suspendMain(block: suspend () -> Unit) = runBlocking { withContext(Dispatchers.Main) { block() } }
    private fun await(check: () -> Boolean) {
        val deadline = System.nanoTime() + 5_000_000_000L
        while (!check() && System.nanoTime() < deadline) Thread.sleep(10)
        assertTrue("Expected bounded synthetic discovery state", check())
    }
    private fun search(controller: DiscoveryController, more: Boolean = false) {
        main { controller.search(more) }; await { !controller.state.value.loading }
    }
    private fun reject(block: () -> Unit) {
        try { block(); fail("Malformed evidence was accepted") } catch (_: IllegalArgumentException) { }
    }
    @After fun releaseOnlySyntheticWork() { gates.forEach { it.complete(fixture.page("A", "B")) }; scopes.forEach { it.cancel() } }

    @Test fun firstCompleteSearchIsSilent_thenOnlyCIsNew() {
        val first = baseline()
        assertTrue(first.result!!.newIds.isEmpty()); assertTrue(first.result!!.comparedSourceIds.isEmpty())
        assertEquals(listOf(fixture.BOARD), first.result!!.baselinedSourceIds)
        val second = evaluate(first.history, fixture.page("B", "C"), time = 2)
        assertEquals(listOf(fixture.id("C")), second.result!!.newIds)
        assertEquals(listOf(fixture.BOARD), second.result!!.comparedSourceIds)
        assertEquals(listOf(fixture.id("A"), fixture.id("B"), fixture.id("C")), second.history.searches.single().boards.single().seenIds)
        assertEquals(listOf(fixture.id("A"), fixture.id("B")), first.history.searches.single().boards.single().seenIds)
    }
    @Test fun reorderedAndReappearingPostingsAreNotNewOrClosed() {
        val second = evaluate(baseline().history, fixture.page("B", "C"), time = 2)
        val reordered = evaluate(second.history, fixture.page("C", "B"), time = 3)
        assertTrue(reordered.result!!.newIds.isEmpty())
        val returned = evaluate(reordered.history, fixture.page("A", "B"), time = 4)
        assertTrue(returned.result!!.newIds.isEmpty())
        assertTrue(fixture.id("C") in returned.history.searches.single().boards.single().seenIds)
    }
    @Test fun equivalentKeysUseCanonicalBoardsAndTheServerFold_withoutCollapsingSpaces() {
        val left = DiscoveryFilters("  SÃO  PAULO  ", "\u00a0عَمّان\u00a0", false,
            listOf("https://job-boards.greenhouse.io/career-feature-fixture", fixture.OTHER))
        val right = DiscoveryFilters("sao  paulo", "عمان", false, listOf(fixture.OTHER, fixture.BOARD))
        assertEquals(DiscoveryHistoryPolicy.key(left), DiscoveryHistoryPolicy.key(right))
        assertNotEquals(DiscoveryHistoryPolicy.key(right), DiscoveryHistoryPolicy.key(right.copy(query = "sao paulo")))
        assertNotEquals(DiscoveryHistoryPolicy.key(right), DiscoveryHistoryPolicy.key(right.copy(remoteOnly = true)))
        assertNotEquals(DiscoveryHistoryPolicy.key(right), DiscoveryHistoryPolicy.key(right.copy(location = "another")))
        assertNotEquals(DiscoveryHistoryPolicy.key(right), DiscoveryHistoryPolicy.key(right.copy(sources = listOf(fixture.BOARD))))
        assertEquals("[1,\"care\",\"\",false,[\"greenhouse:career-feature-fixture\"]]", DiscoveryHistoryPolicy.key(fixture.filters))
    }
    @Test fun unresolvedOrInvalidSearchCriteriaCannotCreateComparisonKeys() {
        assertNull(DiscoveryHistoryPolicy.key(DiscoveryFilters()))
        assertNull(DiscoveryHistoryPolicy.key(fixture.filters.copy(query = "a\nb")))
        assertNull(DiscoveryHistoryPolicy.key(fixture.filters.copy(query = "x".repeat(121))))
        assertNull(DiscoveryHistoryPolicy.key(fixture.filters.copy(sources = listOf("https://example.invalid/board"))))
        assertNull(DiscoveryHistoryPolicy.key(fixture.filters.copy(sources = (1..5).map { "greenhouse:board-$it" })))
        reject { evaluate(time = -1) }; reject { evaluate(time = DiscoveryHistoryPolicy.MAX_TIME + 1) }
    }
    @Test fun firstPaginatedBaselineRemainsSilentUntilAllMatchingIdsAreObserved() {
        val first = evaluate(page = fixture.page("A", matched = 2, cursor = "page-2"))
        assertEquals(listOf(fixture.BOARD), first.result!!.pendingSourceIds)
        assertFalse(first.history.searches.single().boards.single().ready)
        val more = evaluate(first.history, fixture.page("A", "B"), time = 2, prior = first.result)
        assertTrue(more.result!!.newIds.isEmpty()); assertTrue(more.result!!.comparedSourceIds.isEmpty())
        assertTrue(more.history.searches.single().boards.single().ready)
        val repeat = evaluate(more.history, fixture.page("B", "C"), time = 3)
        assertEquals(listOf(fixture.id("C")), repeat.result!!.newIds)
    }
    @Test fun moreRetainsThisCyclesMarkers_butFreshSearchDoesNotReuseThem() {
        val repeat = evaluate(baseline().history, fixture.page("B", "C", matched = 3, cursor = "page-2"), time = 2)
        assertEquals(listOf(fixture.id("C")), repeat.result!!.newIds)
        assertTrue(repeat.result!!.coverageLimited)
        val more = evaluate(repeat.history, fixture.page("A", "B", "C"), time = 3, prior = repeat.result)
        assertEquals(listOf(fixture.id("C")), more.result!!.newIds)
        val fresh = evaluate(more.history, fixture.page("A", "C", "B"), time = 4)
        assertTrue(fresh.result!!.newIds.isEmpty())
    }
    @Test fun anUnavailableBoardRetainsItsSuccessfulBaselineThroughRecovery() {
        val first = baseline()
        val outage = evaluate(first.history, fixture.page(sourceStatus = "unavailable", sourceError = "Synthetic timeout"), time = 2)
        assertEquals(first.history.searches.single().boards, outage.history.searches.single().boards)
        assertTrue(outage.result!!.coverageLimited)
        val recovery = evaluate(outage.history, fixture.page("B", "A"), time = 3)
        assertTrue(recovery.result!!.newIds.isEmpty())
    }
    @Test fun staleAndErrorEvidenceNeverAddsUnknownIds_cachedSuccessCan() {
        val first = baseline()
        for (bad in listOf(fixture.page("B", "C", stale = true), fixture.page("B", "C", sourceError = "Synthetic error"))) {
            val result = evaluate(first.history, bad, time = 2)
            assertTrue(result.result!!.newIds.isEmpty())
            assertFalse(fixture.id("C") in result.history.searches.single().boards.single().seenIds)
            assertTrue(result.result!!.coverageLimited)
        }
        val cached = evaluate(first.history, fixture.page("B", "C", sourceStatus = "cached"), time = 2)
        assertEquals(listOf(fixture.id("C")), cached.result!!.newIds)
    }
    @Test fun partialCoverageComparesOnlyEligibleBoards_andDoesNotResetOtherBoards() {
        val filters = fixture.filters.copy(sources = listOf(fixture.BOARD, fixture.OTHER))
        val first = evaluate(filters = filters, page = fixture.combine(fixture.page("A"), fixture.page("B", board = fixture.OTHER)))
        val partial = evaluate(first.history, fixture.combine(fixture.page("A", "C"),
            fixture.page(board = fixture.OTHER, sourceStatus = "unavailable", sourceError = "Synthetic timeout")), filters, 2)
        assertEquals(listOf(fixture.id("C")), partial.result!!.newIds)
        assertEquals(listOf(fixture.BOARD), partial.result!!.comparedSourceIds)
        assertEquals(first.history.searches.single().boards.last(), partial.history.searches.single().boards.last())
        val recovery = evaluate(partial.history, fixture.combine(fixture.page("A", "C"), fixture.page("B", board = fixture.OTHER)), filters, 3)
        assertTrue(recovery.result!!.newIds.isEmpty())
    }
    @Test fun incompleteAndDuplicateSourceStatusesAreConservative() {
        val first = baseline()
        val limited = evaluate(first.history, fixture.page("B", "C", matched = 20, limited = true), time = 2)
        assertEquals(listOf(fixture.id("C")), limited.result!!.newIds); assertTrue(limited.result!!.coverageLimited)
        val fresh = fixture.page("B", "C")
        val duplicate = evaluate(first.history, fresh.copy(sources = fresh.sources + fresh.sources), time = 2)
        assertTrue(duplicate.result!!.newIds.isEmpty())
        assertEquals(first.history.searches.single().boards, duplicate.history.searches.single().boards)
    }
    @Test fun conflictingJobBoardIdentityCannotPolluteOrCompleteABaseline() {
        val filters = fixture.filters.copy(sources = listOf(fixture.BOARD, fixture.OTHER))
        val first = evaluate(filters = filters,
            page = fixture.combine(fixture.page("A"), fixture.page("B", board = fixture.OTHER)))
        val honestPage = fixture.combine(fixture.page("C"), fixture.page("B", board = fixture.OTHER))
        val crossed = honestPage.copy(jobs = honestPage.jobs.map { job ->
            if (job.id == fixture.id("C")) job.copy(sourceId = fixture.OTHER) else job
        })
        // The existing response codec admits this structurally valid two-board
        // row; observation history must still reject the conflicting identity.
        val decoded = DiscoverySnapshotCodec.decode(DiscoverySnapshotCodec.encode(
            DiscoverySnapshot(filters, filters, crossed))).page!!
        val compared = evaluate(first.history, decoded, filters, 2)
        assertTrue(compared.result!!.coverageLimited)
        assertTrue(compared.result!!.newIds.isEmpty())
        assertEquals(first.history.searches.single().boards, compared.history.searches.single().boards)
        val initial = evaluate(page = decoded, filters = filters, time = 3)
        assertTrue(initial.history.searches.single().boards.none { it.ready })
        assertEquals(listOf(fixture.BOARD, fixture.OTHER).sorted(), initial.result!!.pendingSourceIds)
        val honest = evaluate(first.history, honestPage, filters, 4)
        assertEquals(listOf(fixture.id("C")), honest.result!!.newIds)
        reject { DiscoverySnapshotCodec.encode(DiscoverySnapshot(filters, filters, crossed,
            honest.history, honest.result, honest.sourceIds)) }
    }
    @Test fun unknownAndOverLimitResultsCannotPopulateUnsupportedMarkers() {
        val first = baseline()
        val invalid = fixture.page("C").let { it.copy(jobs = listOf(it.jobs.single().copy(id = "unscoped-C"))) }
        val result = evaluate(first.history, invalid, time = 2)
        assertTrue(result.result!!.newIds.isEmpty()); assertTrue(result.result!!.coverageLimited)
        val tooMany = evaluate(first.history, fixture.page(*(0..200).map { "$it" }.toTypedArray()), time = 2)
        assertEquals(first.history, tooMany.history)
        assertTrue(tooMany.result!!.newIds.isEmpty()); assertEquals(listOf(fixture.BOARD), tooMany.result!!.pendingSourceIds)
    }
    @Test fun boardOverflowResetsTheWholeBaselineAndSilencesTheRestOfTheCycle() {
        val key = DiscoveryHistoryPolicy.key(fixture.filters)!!
        val large = DiscoverySearchHistory(searches = listOf(DiscoveryHistorySearch(key, 1,
            listOf(DiscoveryHistoryBoard(fixture.BOARD, (0 until 1000).map { fixture.id("old-$it") }, true)))))
        val reset = evaluate(large, fixture.page("C"), time = 2)
        assertTrue(reset.result!!.baselineReset); assertTrue(reset.result!!.newIds.isEmpty())
        assertEquals(listOf(fixture.id("C")), reset.history.searches.single().boards.single().seenIds)
        val more = evaluate(reset.history, fixture.page("C", "D"), time = 3, prior = reset.result)
        assertTrue(more.result!!.baselineReset); assertTrue(more.result!!.newIds.isEmpty())
    }
    @Test fun queryAndTotalIdBoundsEvictWholeQueriesWithoutMarkingOldJobsNew() {
        var history = DiscoverySearchHistory()
        for (number in 0 until 8) history = evaluate(history, filters = fixture.filters.copy(query = "role-$number"), time = number.toLong()).history
        val ninth = evaluate(history, filters = fixture.filters.copy(query = "role-8"), time = 9)
        assertEquals(8, ninth.history.searches.size); assertTrue(ninth.result!!.baselineReset)
        assertFalse(ninth.history.searches.any { it.key == DiscoveryHistoryPolicy.key(fixture.filters.copy(query = "role-0")) })
        val full = DiscoverySearchHistory(searches = (0 until 4).map { number ->
            DiscoveryHistorySearch(DiscoveryHistoryPolicy.key(fixture.filters.copy(query = "full-$number"))!!, number.toLong(),
                listOf(DiscoveryHistoryBoard(fixture.BOARD, (0 until 1000).map { fixture.id("id-$it") }, true)))
        })
        val bounded = evaluate(full, fixture.page("C"), time = 10)
        assertTrue(bounded.result!!.baselineReset)
        assertTrue(bounded.history.searches.sumOf { it.boards.sumOf { board -> board.seenIds.size } } <= 4000)
        assertTrue(DiscoveryHistoryPolicy.valid(bounded.history))
    }
    @Test fun malformedHistoryAndMismatchedOpaqueKeysResetSilently() {
        val first = baseline().history
        val query = first.searches.single(); val board = query.boards.single()
        val bad = listOf(first.copy(version = 99), first.copy(searches = listOf(query, query)),
            first.copy(searches = listOf(query.copy(lastUsedAt = -1))),
            first.copy(searches = listOf(query.copy(boards = listOf(board.copy(seenIds = listOf("wrong:A")))))),
            first.copy(searches = listOf(query.copy(boards = listOf(board, board)))))
        for (input in bad) {
            assertFalse(DiscoveryHistoryPolicy.valid(input))
            val reset = evaluate(input, fixture.page("A", "B"), time = 2)
            assertTrue(reset.result!!.baselineReset); assertTrue(reset.result!!.newIds.isEmpty())
        }
        val mismatch = first.copy(searches = listOf(query.copy(boards = listOf(
            DiscoveryHistoryBoard(fixture.OTHER, listOf(fixture.id("A", fixture.OTHER)), true)))))
        assertTrue(DiscoveryHistoryPolicy.valid(mismatch))
        val reset = evaluate(mismatch, fixture.page("A", "B"), time = 2)
        assertTrue(reset.result!!.baselineReset)
        assertEquals(listOf(fixture.BOARD), reset.history.searches.single().boards.map { it.sourceId })
    }
    @Test fun optionalSnapshotMetadataRoundTrips_andOldSchemaOneStillOpens() {
        val repeat = evaluate(baseline().history, fixture.page("B", "C"), time = 2)
        val stored = DiscoverySnapshot(fixture.filters, fixture.filters, fixture.page("B", "C"),
            repeat.history, repeat.result, repeat.sourceIds)
        assertEquals(stored, DiscoverySnapshotCodec.decode(DiscoverySnapshotCodec.encode(stored)))
        val old = DiscoverySnapshotCodec.encode(DiscoverySnapshot(fixture.filters, fixture.filters, fixture.page()))
        old.remove("searchHistory"); old.remove("newResult"); old.remove("lastSearchSourceIds")
        val decoded = DiscoverySnapshotCodec.decode(old)
        assertNull(decoded.searchHistory); assertNull(decoded.newResult); assertNull(decoded.lastSearchSourceIds)
    }
    @Test fun forgedOrUnboundStoredMarkersAreRejected_withoutRewritingOriginalEvidence() {
        val repeat = evaluate(baseline().history, fixture.page("B", "C"), time = 2)
        val base = DiscoverySnapshotCodec.encode(DiscoverySnapshot(fixture.filters, fixture.filters, fixture.page("B", "C"),
            repeat.history, repeat.result, repeat.sourceIds)).toString()
        for (mutate in listOf<(JSONObject) -> Unit>(
            { it.getJSONObject("newResult").put("key", "wrong") },
            { it.getJSONObject("newResult").put("newIds", org.json.JSONArray(listOf(fixture.id("Z")))) },
            { it.getJSONObject("newResult").put("baselineReset", true) },
            { it.getJSONObject("newResult").put("comparedSourceIds", org.json.JSONArray()) },
            { it.put("searchHistory", JSONObject.NULL) },
            { it.getJSONObject("searchHistory").put("version", 99) })) {
            val invalid = JSONObject(base); mutate(invalid); val before = invalid.toString()
            reject { DiscoverySnapshotCodec.decode(invalid) }
            assertEquals(before, invalid.toString())
        }
    }

    @Test fun privateScopeAndRecreationKeepHistoryAndMarkersWithTheirOwner() {
        val store = DiscoveryHistoryMemoryStore(); val service = DiscoveryHistoryService(); val current = controller(service)
        suspendMain { current.attachPrivateSession(store, "search-A") }
        main { current.editFilters { fixture.filters } }; search(current)
        service.result = fixture.page("B", "C"); search(current)
        assertEquals(1, current.state.value.newJobCount)
        suspendMain { current.stopPrivateSession(flush = true); current.attachPrivateSession(store, "search-B") }
        main { current.editFilters { fixture.filters } }; search(current)
        assertFalse(current.state.value.hasSearchComparison); assertEquals(0, current.state.value.newJobCount)
        val calls = service.requests.size
        suspendMain { current.stopPrivateSession(flush = true); current.attachPrivateSession(store, "search-A") }
        assertEquals(1, current.state.value.newJobCount); assertFalse(current.state.value.showNewOnly)
        assertEquals(listOf(fixture.id("B"), fixture.id("C")), current.state.value.jobs.map { it.id })
        assertEquals(calls, service.requests.size)
    }
    @Test fun failedSaveClearsUnsupportedMarkersAndRetainsTheLastPrivateFile() {
        val store = DiscoveryHistoryMemoryStore(); val service = DiscoveryHistoryService(); val current = controller(service)
        suspendMain { current.attachPrivateSession(store, "search-A") }; main { current.editFilters { fixture.filters } }
        search(current); val original = store.records.getValue("search-A")
        store.failWrites = true; service.result = fixture.page("B", "C"); search(current)
        assertEquals(original, store.records["search-A"])
        assertNull(current.state.value.newResult); assertFalse(current.state.value.showNewOnly)
        assertNotNull(current.state.value.searchStorageError)
        assertEquals(listOf(fixture.id("B"), fixture.id("C")), current.state.value.jobs.map { it.id })
        store.failWrites = false; search(current)
        assertEquals(listOf(fixture.id("C")), current.state.value.newResult!!.newIds)
    }
    @Test fun failedDefaultBoardRefreshRetainsResolvedIdentityAndRestoresHonestMarkers() {
        val store = DiscoveryHistoryMemoryStore(); val service = DiscoveryHistoryService(); val current = controller(service)
        suspendMain { current.attachPrivateSession(store, "search-A") }
        main { current.editFilters { it.copy(query = "care") } }; search(current)
        service.result = fixture.page("B", "C"); search(current)
        main { current.setShowNewOnly(true) }
        val before = current.exportSnapshot().toString()
        service.result = fixture.page(board = fixture.OTHER, sourceStatus = "unavailable", sourceError = "Synthetic timeout")
        search(current)
        assertEquals(1, current.state.value.newJobCount); assertTrue(current.state.value.showNewOnly)
        suspendMain { current.saveSearchNow(); current.stopPrivateSession(flush = true); current.attachPrivateSession(store, "search-A") }
        assertEquals(1, current.state.value.newJobCount)
        assertEquals(listOf(fixture.BOARD), DiscoverySnapshotCodec.decode(current.exportSnapshot()).lastSearchSourceIds)
        assertEquals(before, current.exportSnapshot().toString())
    }
    @Test fun aNewFilterDraftDoesNotRebindTheDisplayedComparisonOrTriggerARequest() {
        val store = DiscoveryHistoryMemoryStore(); val service = DiscoveryHistoryService(); val current = controller(service)
        suspendMain { current.attachPrivateSession(store, "search-A") }; main { current.editFilters { fixture.filters } }
        search(current); service.result = fixture.page("B", "C"); search(current)
        val calls = service.requests.size; val result = current.state.value.newResult
        main { current.editFilters { it.copy(location = "Toronto") }; current.setShowNewOnly(true) }
        suspendMain { current.saveSearchNow() }
        assertEquals(result, current.state.value.newResult); assertEquals(calls, service.requests.size)
        assertEquals(listOf(fixture.id("C")), current.state.value.visibleJobs.map { it.id })
        assertEquals(2, current.state.value.jobs.size)
        val stored = DiscoverySnapshotCodec.decode(current.exportSnapshot())
        assertEquals("Toronto", stored.filters.location); assertEquals("", stored.displayedFilters!!.location)
    }
    @Test fun latestToggleIntentWinsWhileMoreIsInFlight_inBothDirections() {
        for (latest in listOf(false, true)) {
            val store = DiscoveryHistoryMemoryStore(); val service = DiscoveryHistoryService(); val current = controller(service)
            suspendMain { current.attachPrivateSession(store, "search-$latest") }; main { current.editFilters { fixture.filters } }
            search(current); service.result = fixture.page("B", "C", matched = 3, cursor = "page-2"); search(current)
            main { current.setShowNewOnly(!latest) }
            val gate = CompletableDeferred<DiscoveryPage>(); gates += gate; service.next = gate
            main { current.search(more = true) }; await { service.requests.size == 3 }
            main { current.setShowNewOnly(latest) }
            gate.complete(fixture.page("A", "B", "C")); await { !current.state.value.loading }
            assertEquals(latest, current.state.value.showNewOnly)
            assertEquals(listOf(fixture.id("C")), current.state.value.newResult!!.newIds)
            assertEquals(3, current.state.value.jobs.size); assertEquals(3, service.requests.size)
        }
    }
    @Test fun cancelledOldScopeResponseCannotPublishIntoTheNextAccount() {
        val store = DiscoveryHistoryMemoryStore(); val service = DiscoveryHistoryService(); val current = controller(service)
        suspendMain { current.attachPrivateSession(store, "search-A") }; main { current.editFilters { fixture.filters } }
        search(current); val gate = CompletableDeferred<DiscoveryPage>(); gates += gate; service.next = gate
        main { current.search() }; await { service.requests.size == 2 }
        suspendMain { current.stopPrivateSession(flush = true); current.attachPrivateSession(store, "search-B") }
        main { current.editFilters { fixture.filters } }; service.result = fixture.page("B", "C"); search(current)
        val b = current.exportSnapshot().toString()
        gate.complete(fixture.page("Z")); await { service.lateReturned }
        instrumentation.waitForIdleSync()
        assertEquals(b, current.exportSnapshot().toString())
        assertFalse(current.state.value.hasSearchComparison); assertEquals(0, current.state.value.newJobCount)
        assertFalse(store.records.getValue("search-B").contains(fixture.id("Z")))
    }
}
