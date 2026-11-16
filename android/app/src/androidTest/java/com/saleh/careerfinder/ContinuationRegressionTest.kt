package com.saleh.careerfinder

import android.app.Application
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

/** The real foreground continuation cycle with controlled network/storage boundaries. */
class ContinuationRegressionTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val owners = mutableListOf<ViewModelStore>()
    private val jobs = mutableListOf<Deferred<Boolean>>()
    private val gates = mutableListOf<CompletableDeferred<Unit>>()
    private val connection = Connection("https://fixture.invalid", "first-workspace", "fixture-token", Instant.now().plusSeconds(3600).toString())

    private class MemoryStore : PrivateStore {
        val records = ConcurrentHashMap<String, String>()
        override fun read(name: String) = records[name]?.let(::JSONObject)
        override fun write(name: String, value: JSONObject) { records[name] = value.toString() }
        override fun remove(name: String) { records.remove(name) }
        override fun startFreshPreservingExisting() { error("Not used by continuation checks") }
    }

    private data class Write(val workspace: String, val route: String, val body: JSONObject)
    private class Service(var pairTarget: Connection) : CareerService {
        @Volatile var capability: String? = "client"
        @Volatile var activePlans = listOf("approved-a", "approved-b")
        @Volatile var recovered = emptyList<JSONObject>()
        @Volatile var receipts = emptyList<JSONObject>()
        @Volatile var failRoute: String? = null
        @Volatile var failStop = false
        @Volatile var workspaceCalls = 0
        @Volatile var workspaceWaiting = false
        @Volatile var advanceWaiting = false
        var workspaceGate: CompletableDeferred<Unit>? = null
        var advanceGate: CompletableDeferred<Unit>? = null
        val writes = CopyOnWriteArrayList<Write>()
        override suspend fun pair(origin: String, code: String) = pairTarget
        override suspend fun request(connection: Connection, method: String, route: String, body: JSONObject?): JSONObject {
            if (method != "GET") writes += Write(connection.workspaceId, route, JSONObject(body.toString()))
            if (route == "workspace") workspaceCalls++
            if (failRoute == route) throw ApiFailure(401, "unauthorized", "Fixture expired session")
            return when (route) {
                "workspace" -> {
                    val profile = ProfileDraft(firstName = "Fixture", email = "fixture@example.invalid", revision = 1)
                    val response = JSONObject().put("ok", true).put("workspaceId", connection.workspaceId).put("mode", "local")
                        .put("profile", profile.apiJson().put("revision", 1).put("resume", JSONObject.NULL))
                        .put("jobs", JSONArray()).put("attempts", JSONArray(receipts)).put("activePlanIds", JSONArray(activePlans))
                        .put("recoverablePlans", JSONArray(recovered)).put("capabilities", JSONObject().put("liveEnabled", false).apply {
                            capability?.let { put("dispatchContinuation", it) }
                        })
                    val deferred = workspaceGate
                    workspaceGate = null
                    if (deferred != null) {
                        workspaceWaiting = true
                        // A real socket may return after its caller is cancelled.
                        withContext(NonCancellable) { deferred.await() }
                    }
                    response
                }
                "advance" -> {
                    val deferred = advanceGate
                    advanceGate = null
                    if (deferred != null) {
                        advanceWaiting = true
                        withContext(NonCancellable) { deferred.await() }
                    }
                    JSONObject().put("ok", true)
                }
                "stop" -> {
                    if (failStop) throw java.io.IOException("Fixture lost stop response")
                    activePlans = activePlans.filterNot { it == body!!.getString("planId") }
                    JSONObject().put("ok", true)
                }
                "session/revoke" -> JSONObject().put("ok", true)
                else -> error("Unexpected route $route: an automatic submit would fail this check")
            }
        }
    }

    private data class Harness(val model: CareerViewModel, val store: MemoryStore, val service: Service)
    private fun create(store: MemoryStore, service: Service): Harness {
        lateinit var model: CareerViewModel
        val manualTicks = Channel<Unit>(Channel.RENDEZVOUS)
        main {
            model = CareerViewModel(instrumentation.targetContext.applicationContext as Application, store, service) { manualTicks.receive() }
            owners += ViewModelStore().apply { put("fixture-model", model) }
        }
        await { model.state.value.loaded && !model.state.value.busy }
        return Harness(model, store, service)
    }
    private fun harness(configure: (Service) -> Unit = {}): Harness {
        val store = MemoryStore().apply { records["connection"] = connection.toJson().toString() }
        val service = Service(connection).apply(configure)
        return create(store, service)
    }
    private fun main(block: () -> Unit) = instrumentation.runOnMainSync(block)
    private fun await(check: () -> Boolean) {
        val deadline = System.nanoTime() + 5_000_000_000
        while (!check() && System.nanoTime() < deadline) Thread.sleep(10)
        assertTrue("Expected fixture boundary was not reached", check())
    }
    private fun foreground(h: Harness) = main { h.model.setForeground(true) }
    private fun poll(h: Harness): Boolean = runBlocking { withTimeout(5_000) { withContext(Dispatchers.Main) { h.model.pollOnce() } } }
    private fun pollLater(h: Harness): Deferred<Boolean> = CoroutineScope(SupervisorJob() + Dispatchers.Main).async { h.model.pollOnce() }.also(jobs::add)
    private fun gate() = CompletableDeferred<Unit>().also(gates::add)
    private fun finish(job: Deferred<Boolean>): Boolean = runBlocking { withTimeout(5_000) { job.await() } }
    private fun advances(h: Harness) = h.service.writes.filter { it.route == "advance" }
    private fun recovered(id: String, state: String) = JSONObject().put("id", id).put("digest", "fixture-digest")
        .put("profileRevision", 1).put("approvedAt", Instant.now().toString()).put("expiresAt", Instant.now().plusSeconds(600).toString())
        .put("items", JSONArray(listOf(JSONObject().put("jobId", id + "-job").put("state", state)
            .put("retryAt", Instant.now().minusSeconds(10).toString()).put("resume", JSONObject.NULL)
            .put("payloadSummary", JSONObject().put("name", "Fixture").put("email", "fixture@example.invalid")
                .put("phone", "").put("website", "").put("comments", "")))))

    @After fun cleanUp() {
        gates.forEach { it.complete(Unit) }
        jobs.forEach { it.cancel() }
        runBlocking { withTimeout(5_000) { jobs.forEach { it.join() } } }
        main { owners.forEach(ViewModelStore::clear) }
    }

    @Test fun setupPages_preservePairedOrigin_andNeverAttachTheSession() {
        assertEquals("https://career-finder-service.jazzy-drake-8323.chatgpt.site", ServicePages.initialOrigin(null))
        assertEquals(connection.origin, ServicePages.initialOrigin(connection))
        for (page in listOf("connect", "privacy", "support", "account")) {
            val url = ServicePages.url(connection.origin, page)
            assertEquals(connection.origin + "/" + page, url)
            assertFalse(url.contains(connection.token))
        }
        for (origin in listOf("http://fixture.invalid", "https://token@fixture.invalid", "https://fixture.invalid/other")) {
            try { ServicePages.url(origin, "connect"); fail("Unsafe setup origin was accepted") }
            catch (_: IllegalArgumentException) { }
        }
    }

    @Test fun freshEligiblePlans_advanceOnePerCycle_withoutAnyImplicitApproval() {
        val h = harness(); foreground(h)
        main { h.model.refresh() }; await { !h.model.state.value.busy }
        assertTrue("A plain workspace GET must not dispatch", h.service.writes.isEmpty())
        assertTrue(poll(h))
        assertEquals(listOf("approved-a"), advances(h).map { it.body.getString("planId") })
        assertTrue(poll(h))
        assertEquals(listOf("approved-a", "approved-b"), advances(h).map { it.body.getString("planId") })
        assertTrue(h.service.writes.all { it.route == "advance" && !it.body.has("approved") && it.workspace == connection.workspaceId })
        assertEquals(6, h.service.workspaceCalls) // initial + manual GET + before/after each advance
    }

    @Test fun absentCapability_andFreshCooldownOrUncertainState_neverAdvance() {
        val h = harness { it.capability = null }; foreground(h)
        assertTrue(poll(h))
        assertTrue(h.service.writes.isEmpty())
        h.service.capability = "client"
        h.service.activePlans = emptyList()
        h.service.recovered = listOf(recovered("cooldown", "rate_limited"), recovered("unknown", "uncertain"),
            recovered("unapproved", "blocked").put("approvedAt", JSONObject.NULL))
        assertTrue(poll(h))
        assertTrue(h.model.state.value.clientContinuation)
        assertTrue(h.model.state.value.activePlans.isEmpty())
        assertEquals(3, h.model.state.value.recoverablePlans.size)
        assertTrue("Cooldown expiry does not authorize a submit or advance", h.service.writes.isEmpty())
    }

    @Test fun lostStopResponse_keepsContinuationHeldAcrossRestart() {
        val h = harness { it.activePlans = listOf("approved-stop"); it.failStop = true }; foreground(h)
        main { h.model.stop("approved-stop") }
        await { h.model.state.value.error != null }
        assertTrue(poll(h))
        assertTrue(advances(h).isEmpty())
        val key = "workspace-" + BoundaryPolicy.workspaceKey(connection.origin, connection.workspaceId)
        assertEquals("approved-stop", h.store.read(key)!!.getJSONArray("continuationHolds").getString(0))
        main { h.model.setForeground(false) }
        val restored = create(h.store, h.service); foreground(restored)
        assertTrue(poll(restored))
        assertTrue(advances(restored).isEmpty())
        assertTrue("approved-stop" in restored.model.state.value.continuationHolds)
    }

    @Test fun unauthorizedReadOrAdvance_stopsAllFurtherAutomaticRequests() {
        for (route in listOf("workspace", "advance")) {
            val h = harness { it.activePlans = listOf("approved-auth") }; foreground(h)
            h.service.failRoute = route
            assertFalse(poll(h))
            assertTrue(h.model.state.value.requiresPairing)
            assertEquals(if (route == "advance") 1 else 0, advances(h).size)
            val reads = h.service.workspaceCalls
            val writes = h.service.writes.size
            h.service.failRoute = null
            main { h.model.setForeground(false); h.model.setForeground(true); h.model.stop("approved-auth") }
            assertFalse(poll(h))
            assertEquals(reads, h.service.workspaceCalls)
            assertEquals(writes, h.service.writes.size)
        }
    }

    @Test fun lateEligibilityFromAnotherWorkspace_cannotAdvanceOrReplaceTheCurrentWorkspace() {
        val h = harness(); foreground(h)
        val deferred = gate(); h.service.workspaceGate = deferred
        val old = pollLater(h); await { h.service.workspaceWaiting }
        val other = connection.copy(origin = "https://second.invalid", workspaceId = "second-workspace", token = "second-token")
        h.service.pairTarget = other
        h.service.activePlans = emptyList()
        main { h.model.pair(other.origin, "fixture-one-use-code") {} }
        await { !h.model.state.value.busy && h.model.state.value.connection == other }
        deferred.complete(Unit)
        assertFalse(finish(old))
        assertEquals(other, h.model.state.value.connection)
        assertTrue(h.model.state.value.activePlans.isEmpty())
        assertTrue(advances(h).isEmpty())
    }

    @Test fun cancellationDuringDispatch_requiresFreshEligibilityBeforeAnyNextAttempt() {
        val h = harness { it.activePlans = listOf("approved-once") }; foreground(h)
        val deferred = gate(); h.service.advanceGate = deferred
        val old = pollLater(h); await { h.service.advanceWaiting }
        main { h.model.setForeground(false) }
        old.cancel()
        h.service.activePlans = emptyList()
        h.service.receipts = listOf(JSONObject().put("id", "attempt-uncertain").put("state", "uncertain")
            .put("createdAt", Instant.now().toString()).put("evidenceMode", "test"))
        main { h.model.setForeground(true) }
        val resumed = pollLater(h)
        deferred.complete(Unit)
        assertTrue(finish(resumed))
        assertTrue(old.isCancelled)
        assertEquals(1, advances(h).size)
        assertTrue(h.model.state.value.activePlans.isEmpty())
        assertEquals("uncertain", h.model.state.value.receipts.single().state)
        assertFalse(h.service.writes.any { it.route == "submit" })
    }
}
