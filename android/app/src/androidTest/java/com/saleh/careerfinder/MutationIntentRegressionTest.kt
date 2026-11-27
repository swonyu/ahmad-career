package com.saleh.careerfinder

import android.app.Application
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
import java.util.concurrent.CopyOnWriteArrayList

/** Restart, cancellation and storage-failure checks; every service response is synthetic. */
class MutationIntentRegressionTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val owners = mutableListOf<ViewModelStore>()
    private val connection = Connection("https://fixture.invalid", "11111111-1111-4111-8111-111111111111",
        "f".repeat(64), Instant.now().plusSeconds(3600).toString(), accountId = "synthetic-owner")
    private val journal = "read-acks-" + BoundaryPolicy.workspaceKey(connection.origin, connection.workspaceId)

    private class Store : PrivateStore {
        val records = ConcurrentHashMap<String, String>()
        @Volatile var rejectIntents = false
        @Volatile var rejectAcknowledgments = false
        override fun read(name: String) = records[name]?.let(::JSONObject)
        override fun write(name: String, value: JSONObject) {
            if (name.startsWith("read-acks-")) {
                val entries = value.getJSONArray("entries")
                val phases = (0 until entries.length()).map { entries.getJSONObject(it).getString("phase") }
                if (rejectIntents && "intent" in phases || rejectAcknowledgments && "acknowledged" in phases)
                    throw java.io.IOException("Synthetic journal failure")
            }
            requirePrivateCapacity(value)
            records[name] = value.toString()
        }
        override fun names() = records.keys.toSet()
        override fun remove(name: String) { records.remove(name) }
        override fun startFreshPreservingExisting() = error("Not used by this fixture")
    }

    private class Service(private val connection: Connection) : CareerService {
        @Volatile var offline = false
        @Volatile var readCount = 0
        @Volatile var profileEntered = false
        @Volatile var acknowledgmentReturned = false
        var beforeCommit: CompletableDeferred<Unit>? = null
        var afterAcknowledgment: CompletableDeferred<Unit>? = null
        var profile = ProfileDraft(firstName = "Saved", email = "fixture@example.invalid", revision = 1)
        val writes = CopyOnWriteArrayList<String>()
        private fun profileJSON() = profile.apiJson().put("revision", profile.revision).put("resume", JSONObject.NULL)
        override suspend fun pair(origin: String, code: String) = connection
        override suspend fun request(connection: Connection, method: String, route: String, body: JSONObject?): JSONObject =
            requestWithAcknowledgment(connection, method, route, body) { }
        override suspend fun requestWithAcknowledgment(connection: Connection, method: String, route: String,
            body: JSONObject?, acknowledged: (JSONObject) -> Unit): JSONObject {
            if (method == "GET") {
                readCount++
                if (offline) throw java.io.IOException("Synthetic offline read")
                check(route == "workspace")
                return JSONObject().put("ok", true).put("mode", "test").put("workspaceId", connection.workspaceId)
                    .put("profile", profileJSON()).put("jobs", JSONArray()).put("attempts", JSONArray())
                    .put("activePlanIds", JSONArray()).put("recoverablePlans", JSONArray())
                    .put("capabilities", JSONObject().put("liveEnabled", false))
            }
            writes += route
            val operation = JSONObject().put("kind", route).put("acknowledged", true)
                .put("accountId", connection.accountId).put("workspaceId", connection.workspaceId)
            if (route == "profile") {
                profileEntered = true
                beforeCommit?.await()
                require(body!!.getInt("expectedRevision") == profile.revision)
                profile = ProfileDraft.fromJson(body.getJSONObject("profile")).copy(revision = profile.revision + 1)
                operation.put("revision", profile.revision)
                acknowledged(operation)
                acknowledgmentReturned = true
                afterAcknowledgment?.await()
                return JSONObject().put("ok", true).put("profile", profileJSON())
            }
            check(route == "stop")
            operation.put("planId", body!!.getString("planId")).put("digest", "a".repeat(64))
            acknowledged(operation)
            return JSONObject().put("ok", true)
        }
    }

    private fun main(block: () -> Unit) = instrumentation.runOnMainSync(block)
    private fun await(check: () -> Boolean) {
        val end = System.nanoTime() + 8_000_000_000
        while (!check() && System.nanoTime() < end) Thread.sleep(20)
        assertTrue("Expected synthetic state within eight seconds", check())
    }
    private fun store() = Store().apply { records["connection"] = connection.toJson().toString() }
    private fun model(store: Store, service: Service): CareerViewModel {
        lateinit var model: CareerViewModel
        main {
            model = CareerViewModel(instrumentation.targetContext.applicationContext as Application, store, service)
            owners += ViewModelStore().apply { put("fixture", model) }
        }
        await { model.state.value.loaded && !model.state.value.busy }
        return model
    }
    private fun entries(store: Store) = store.read(journal)?.getJSONArray("entries") ?: JSONArray()
    private fun editAndSave(model: CareerViewModel) = main {
        model.editProfile { it.copy(firstName = "Changed") }
        model.saveProfile()
    }
    @After fun clearModels() { main { owners.forEach(ViewModelStore::clear) }; owners.clear() }

    @Test fun failedPreflightDoesNotSendMutation() {
        val store = store(); val service = Service(connection); val model = model(store, service)
        store.rejectIntents = true
        editAndSave(model)
        await { !model.state.value.busy && model.state.value.error != null }
        assertTrue(service.writes.isEmpty())
        assertEquals(0, entries(store).length())
        assertEquals("Changed", model.state.value.profile.firstName)
    }

    @Test fun failedAcknowledgmentWriteSurvivesRestartAndRequiresRead() {
        val store = store(); val service = Service(connection); val first = model(store, service)
        store.rejectAcknowledgments = true
        editAndSave(first)
        await { !first.state.value.busy && first.state.value.readReconciliationRequired }
        assertEquals(1, service.writes.count { it == "profile" })
        assertEquals(2, service.profile.revision)
        assertEquals("intent", entries(store).getJSONObject(0).getString("phase"))
        assertFalse(entries(store).toString().contains("Changed"))
        assertFalse(entries(store).toString().contains(connection.token))
        clearModels()
        service.offline = true; store.rejectAcknowledgments = false
        val reopened = model(store, service)
        assertTrue(reopened.state.value.readReconciliationRequired)
        main { reopened.saveProfile() }
        await { !reopened.state.value.busy }
        assertEquals(1, service.writes.count { it == "profile" })
        service.offline = false
        main { reopened.refresh() }
        await { !reopened.state.value.busy && !reopened.state.value.readReconciliationRequired }
        assertEquals(0, entries(store).length())
        assertEquals(2, reopened.state.value.serverProfile?.revision)
        assertEquals(1, service.writes.count { it == "profile" })
    }

    @Test fun cancellationAfterAcknowledgmentKeepsStableJournalEntry() {
        val store = store(); val service = Service(connection); val first = model(store, service)
        val gate = CompletableDeferred<Unit>(); service.afterAcknowledgment = gate
        editAndSave(first)
        await { service.acknowledgmentReturned }
        val id = entries(store).getJSONObject(0).getString("id")
        assertEquals("acknowledged", entries(store).getJSONObject(0).getString("phase"))
        clearModels(); service.offline = true
        val reopened = model(store, service)
        assertTrue(reopened.state.value.readReconciliationRequired)
        assertEquals(id, entries(store).getJSONObject(0).getString("id"))
        main { reopened.saveProfile() }; await { !reopened.state.value.busy }
        assertEquals(1, service.writes.count { it == "profile" })
        service.offline = false; service.afterAcknowledgment = null
        main { reopened.refresh() }
        await { !reopened.state.value.busy && !reopened.state.value.readReconciliationRequired }
        assertEquals(0, entries(store).length())
        gate.complete(Unit)
    }

    @Test fun concurrentStopReadCannotClearAnInFlightMutationIntent() {
        val store = store(); val service = Service(connection); val model = model(store, service)
        val gate = CompletableDeferred<Unit>(); service.beforeCommit = gate
        editAndSave(model)
        await { service.profileEntered }
        val intentId = entries(store).getJSONObject(0).getString("id")
        main { model.stop("22222222-2222-4222-8222-222222222222") }
        await { service.readCount >= 2 && model.state.value.pendingReadAcknowledgments == 1 }
        assertEquals(1, entries(store).length())
        assertEquals(intentId, entries(store).getJSONObject(0).getString("id"))
        assertEquals("intent", entries(store).getJSONObject(0).getString("phase"))
        assertEquals(1, service.profile.revision)
        gate.complete(Unit)
        await { !model.state.value.busy && model.state.value.pendingReadAcknowledgments == 0 }
        assertEquals(1, service.writes.count { it == "profile" })
        assertEquals(1, service.writes.count { it == "stop" })
        assertEquals(2, model.state.value.serverProfile?.revision)
    }

    @Test fun overlappingModelCannotClearOlderWorkersIntent() {
        val store = store(); val service = Service(connection); val first = model(store, service)
        val gate = CompletableDeferred<Unit>(); service.beforeCommit = gate
        editAndSave(first); await { service.profileEntered }
        val id = entries(store).getJSONObject(0).getString("id")
        val replacement = model(store, service)
        assertTrue(replacement.state.value.readReconciliationRequired)
        assertEquals(id, entries(store).getJSONObject(0).getString("id"))
        assertEquals("intent", entries(store).getJSONObject(0).getString("phase"))
        gate.complete(Unit)
        await { !first.state.value.busy && first.state.value.pendingReadAcknowledgments == 0 }
        main { replacement.refresh() }
        await { !replacement.state.value.busy && !replacement.state.value.readReconciliationRequired }
        assertEquals(2, replacement.state.value.serverProfile?.revision)
        assertEquals(1, service.writes.count { it == "profile" })
    }
}
