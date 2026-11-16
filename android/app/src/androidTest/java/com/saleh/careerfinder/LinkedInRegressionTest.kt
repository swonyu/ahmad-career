package com.saleh.careerfinder

import android.app.Application
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

/** Optional profile-link migration, compatibility and visible-approval protocol. No external requests. */
class LinkedInRegressionTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val owners = mutableListOf<ViewModelStore>()
    private val connection = Connection("https://fixture.invalid", "linkedin-fixture", "synthetic-token", Instant.now().plusSeconds(3600).toString())
    private val canonical = "https://www.linkedin.com/in/Jos%C3%A9-42"

    private class MemoryStore : PrivateStore {
        val records = ConcurrentHashMap<String, String>()
        override fun read(name: String): JSONObject? = records[name]?.let(::JSONObject)
        override fun write(name: String, value: JSONObject) { records[name] = value.toString() }
        override fun remove(name: String) { records.remove(name) }
        override fun startFreshPreservingExisting() { error("Not used by this fixture") }
    }

    private class Service : CareerService {
        var capability: Any? = true
        var failWorkspace = false
        var responseLinkedIn: Any? = null
        var reviewLinkedIn: String? = null
        var omitReviewLinkedIn = false
        var profile = ProfileDraft(firstName = "Synthetic", email = "profile@example.invalid", revision = 1,
            resume = Resume("Fixture.pdf", 20, "a".repeat(64)), website = "https://portfolio.example.invalid")
        val writes = mutableListOf<Pair<String, JSONObject>>()
        private fun profileData(): JSONObject = profile.apiJson(includeLinkedIn = capability == true || profile.linkedin.isNotEmpty())
            .put("revision", profile.revision).put("resume", profile.resume?.metadata() ?: JSONObject.NULL)
            .apply { responseLinkedIn?.let { put("linkedin", it) } }
        private fun item(): JSONObject = JSONObject().put("jobId", "fixture-job").put("state", "ready")
            .put("job", JSONObject().put("title", "Synthetic role").put("company", "Fixture employer").put("url", "https://example.invalid/job"))
            .put("payloadSummary", JSONObject().put("name", profile.firstName).put("email", profile.email).put("phone", "")
                .put("website", profile.website).apply { if (!omitReviewLinkedIn) put("linkedin", reviewLinkedIn ?: profile.linkedin) }.put("comments", "")
                .put("consentStore", true).put("consentMarketing", false))
            .put("resume", profile.resume!!.metadata())
        override suspend fun pair(origin: String, code: String): Connection = error("This fixture restores an isolated synthetic connection")
        override suspend fun request(connection: Connection, method: String, route: String, body: JSONObject?): JSONObject {
            if (method != "GET") writes += route to JSONObject(body.toString())
            return when (route) {
                "workspace" -> {
                    if (failWorkspace) throw ApiFailure(503, "fixture_unavailable", "Fixture unavailable")
                    JSONObject().put("ok", true).put("mode", "test").put("workspaceId", connection.workspaceId).put("profile", profileData())
                        .put("jobs", JSONArray(listOf(Opportunity("fixture-job", "https://example.invalid/job", "Synthetic role", "Fixture employer", "", "").privateJson())))
                        .put("attempts", JSONArray()).put("activePlanIds", JSONArray()).put("recoverablePlans", JSONArray())
                        .put("capabilities", JSONObject().put("liveEnabled", false).apply { capability?.let { put("linkedinProfile", it) } })
                }
                "profile" -> {
                    val input = body!!.getJSONObject("profile")
                    require(body.getInt("expectedRevision") == profile.revision)
                    profile = ProfileDraft.fromJson(input).copy(revision = profile.revision + 1, resume = profile.resume,
                        linkedin = if (input.has("linkedin")) input.getString("linkedin") else profile.linkedin)
                    JSONObject().put("ok", true).put("profile", profileData())
                }
                "prepare" -> JSONObject().put("ok", true).put("plan", JSONObject().put("id", "fixture-review").put("digest", "synthetic-digest")
                    .put("profileRevision", profile.revision).put("approvedAt", JSONObject.NULL)
                    .put("expiresAt", Instant.now().plusSeconds(600).toString()).put("items", JSONArray(listOf(item()))))
                "submit" -> JSONObject().put("ok", true).put("attempts", JSONArray())
                "stop", "session/revoke" -> JSONObject().put("ok", true)
                else -> error("Unexpected fixture route: $route")
            }
        }
    }

    private fun main(block: () -> Unit) = instrumentation.runOnMainSync(block)
    private fun await(check: () -> Boolean) {
        val deadline = System.nanoTime() + 5_000_000_000
        while (!check() && System.nanoTime() < deadline) Thread.sleep(20)
        assertTrue("Expected LinkedIn fixture state within five seconds", check())
    }
    private fun connectedStore() = MemoryStore().apply { records["connection"] = connection.toJson().toString() }
    private fun cacheKey() = "workspace-" + BoundaryPolicy.workspaceKey(connection.origin, connection.workspaceId)
    private fun model(store: MemoryStore, service: Service): CareerViewModel {
        lateinit var model: CareerViewModel
        main {
            model = CareerViewModel(instrumentation.targetContext.applicationContext as Application, store, service)
            owners += ViewModelStore().apply { put("linkedin-model", model) }
        }
        await { model.state.value.loaded && !model.state.value.busy }
        return model
    }
    private fun rejects(block: () -> Unit) {
        try { block(); fail("Malformed LinkedIn service data was accepted") }
        catch (_: IllegalArgumentException) { }
    }
    @After fun clearModels() { main { owners.forEach(ViewModelStore::clear) }; owners.clear() }

    @Test fun olderPrivateProfile_decodesWithoutLosingFields_andFreshProfileHasNoPersonalLink() {
        val original = ProfileDraft(firstName = "Single", website = "https://portfolio.example.invalid", resume = Resume("Own.pdf", 20, "b".repeat(64), "private-pdf-bytes"))
        val old = original.privateJson().apply { remove("linkedin") }
        assertEquals(original, ProfileDraft.fromJson(old))
        assertEquals("", ProfileDraft().linkedin)
        val updated = original.copy(linkedin = "unfinished /in/ link")
        assertEquals(updated, ProfileDraft.fromJson(updated.privateJson()))
        assertEquals("private-pdf-bytes", ProfileDraft.fromJson(old).resume?.dataBase64)
    }

    @Test fun localInvalidLink_isPreservedAcrossRecreation_thenCanonicalSaveKeepsWebsiteSeparate() {
        assertEquals("https://www.linkedin.com/in/Jose%CC%81", BoundaryPolicy.linkedinProfileURL("https://linkedin.com/in/Jose\u0301"))
        assertEquals("https://www.linkedin.com/in/Jose%CC%81", BoundaryPolicy.linkedinProfileURL("https://linkedin.com/in/Jose%CC%81"))
        val store = MemoryStore(); val service = Service(); val first = model(store, service)
        main { first.editProfile { it.copy(linkedin = "unfinished link", website = "https://portfolio.example.invalid") }; first.saveProfile() }
        await { !first.state.value.busy && first.state.value.error != null }
        assertEquals("unfinished link", store.read("workspace-unpaired")!!.getJSONObject("profile").getString("linkedin"))
        val second = model(store, service)
        assertEquals("unfinished link", second.state.value.profile.linkedin)
        main { second.editProfile { it.copy(linkedin = "https://sa.linkedin.com/in/Jos%C3%A9-42/?trk=phone#about") }; second.saveProfile() }
        await { !second.state.value.busy && !second.state.value.profileDirty }
        assertEquals(canonical, second.state.value.profile.linkedin)
        assertEquals("https://portfolio.example.invalid", second.state.value.profile.website)
        assertEquals(canonical, ProfileDraft.fromJson(store.read("workspace-unpaired")!!.getJSONObject("profile")).linkedin)
        assertTrue(service.writes.isEmpty())
    }

    @Test fun supportedService_savesCanonicalLink_thenExplicitlyClearsIt() {
        val store = connectedStore(); val service = Service(); val model = model(store, service)
        assertTrue(model.state.value.linkedinProfile)
        main { model.editProfile { it.copy(linkedin = "HTTPS://SA.LINKEDIN.COM:443/in/Jos%C3%A9-42/?trk=x#about") }; model.saveProfile() }
        await { !model.state.value.busy && !model.state.value.profileDirty }
        assertEquals(canonical, service.writes.single().second.getJSONObject("profile").getString("linkedin"))
        assertEquals(canonical, model.state.value.profile.linkedin)
        assertEquals("https://portfolio.example.invalid", model.state.value.profile.website)
        main { model.editProfile { it.copy(linkedin = "") }; model.saveProfile() }
        await { !model.state.value.busy && !model.state.value.profileDirty }
        assertEquals("", service.writes.last().second.getJSONObject("profile").getString("linkedin"))
        assertEquals("", model.state.value.serverProfile!!.linkedin)
    }

    @Test fun unknownOrDisabledService_neverDropsNewOrClearedLink_andLegacyBlankOmitsField() {
        for (capability in listOf(null, false)) {
            val store = connectedStore(); val service = Service().apply { this.capability = capability }; val model = model(store, service)
            main { model.editProfile { it.copy(linkedin = canonical) }; model.saveProfile() }
            await { !model.state.value.busy && model.state.value.error != null }
            assertTrue(service.writes.isEmpty())
            assertEquals(canonical, store.read(cacheKey())!!.getJSONObject("profile").getString("linkedin"))
            assertTrue(model.state.value.profileDirty)
            main { model.editProfile { it.copy(linkedin = "", firstName = "Legacy edit") }; model.saveProfile() }
            await { !model.state.value.busy && !model.state.value.profileDirty }
            assertFalse(service.writes.single().second.getJSONObject("profile").has("linkedin"))
        }
        val service = Service().apply { capability = false; profile = profile.copy(linkedin = canonical) }
        val model = model(connectedStore(), service)
        main { model.editProfile { it.copy(linkedin = "") }; model.saveProfile() }
        await { !model.state.value.busy && model.state.value.error != null }
        assertTrue(service.writes.isEmpty())
        assertEquals(canonical, service.profile.linkedin)
        assertEquals("", model.state.value.profile.linkedin)
        assertTrue(model.state.value.profileDirty)
    }

    @Test fun linkedReview_prepareAndVisibleApprovalSendSchema3_blankReviewUsesLegacyProtocol() {
        for (link in listOf(canonical, "")) {
            val service = Service().apply { profile = profile.copy(linkedin = link) }; val model = model(connectedStore(), service)
            main { model.toggleJob("fixture-job"); model.prepare() }
            await { !model.state.value.busy && model.state.value.plan != null }
            val prepare = service.writes.single { it.first == "prepare" }.second
            assertEquals(link.isNotEmpty(), prepare.has("reviewSchema"))
            if (link.isNotEmpty()) assertEquals(3, prepare.getInt("reviewSchema"))
            val plan = model.state.value.plan!!
            assertEquals(link, plan.items.single().payload.getString("linkedin"))
            main { model.submit(plan) }
            await { !model.state.value.busy && service.writes.any { it.first == "submit" } }
            val submit = service.writes.single { it.first == "submit" }.second
            assertEquals(link.isNotEmpty(), submit.has("reviewSchema"))
            if (link.isNotEmpty()) assertEquals(3, submit.getInt("reviewSchema"))
            assertTrue(submit.getBoolean("approved"))
        }
    }

    @Test fun malformedProfileReply_keepsPhoneDraftAndOriginalRevision() {
        val store = connectedStore(); val service = Service(); val model = model(store, service)
        service.responseLinkedIn = JSONObject.NULL
        main { model.editProfile { it.copy(linkedin = canonical) }; model.saveProfile() }
        await { !model.state.value.busy && model.state.value.error != null }
        assertTrue(model.state.value.profileDirty)
        assertEquals(canonical, model.state.value.profile.linkedin)
        assertEquals(1, model.state.value.profile.revision)
        assertEquals(canonical, store.read(cacheKey())!!.getJSONObject("profile").getString("linkedin"))
    }

    @Test fun missingOrMismatchedReviewLink_cannotPrepareResumeOrSubmit() {
        val service = Service().apply { profile = profile.copy(linkedin = canonical); omitReviewLinkedIn = true }
        val model = model(connectedStore(), service)
        main { model.toggleJob("fixture-job"); model.prepare() }
        await { !model.state.value.busy && model.state.value.error != null }
        assertNull(model.state.value.plan)
        service.omitReviewLinkedIn = false; service.reviewLinkedIn = "https://www.linkedin.com/in/another-person"
        main { model.prepare() }; await { !model.state.value.busy && model.state.value.error != null }
        assertNull(model.state.value.plan)
        service.reviewLinkedIn = null
        main { model.prepare() }; await { !model.state.value.busy && model.state.value.plan != null }
        val validPlan = model.state.value.plan!!
        val badPayload = JSONObject(validPlan.items.single().payload.toString()).put("linkedin", "")
        val mismatched = validPlan.copy(items = listOf(validPlan.items.single().copy(payload = badPayload)))
        main { model.reviewRecovered(mismatched) }
        assertNull(model.state.value.plan)
        assertNotNull(model.state.value.error)
        main { model.reviewRecovered(validPlan) }
        assertEquals(validPlan.id, model.state.value.plan!!.id)
        // Even a changed in-memory review cannot reach an approval request.
        validPlan.items.single().payload.put("linkedin", "https://www.linkedin.com/in/another-person")
        main { model.submit(validPlan) }; await { !model.state.value.busy && model.state.value.error != null }
        assertTrue(service.writes.none { it.first == "submit" })
    }

    @Test fun malformedOptionalFields_failClosed_andMissingFieldsRemainBackwardCompatible() {
        val valid = ProfileDraft().apiJson().put("resume", JSONObject.NULL).put("revision", 0)
        assertEquals("", ProfileDraft.fromServer(valid).linkedin)
        for (bad in listOf(JSONObject.NULL, true, 3, JSONObject(), "https://evil.example/in/a", "https://www.linkedin.com/in/a%2Fb", "https://www.linkedin.com/in/a\u202eb"))
            rejects { ProfileDraft.fromServer(JSONObject(valid.toString()).put("linkedin", bad)) }
        val payload = JSONObject().put("name", "Synthetic").put("email", "profile@example.invalid").put("phone", "").put("website", "").put("comments", "")
        val item = JSONObject().put("jobId", "blocked-job").put("state", "blocked").put("payloadSummary", payload)
        assertEquals("", ReviewItem.fromJson(item).payload.safeString("linkedin"))
        val exact = "https://sa.linkedin.com/in/example/?view=public#about"
        payload.put("linkedin", exact)
        assertEquals(exact, ReviewItem.fromJson(item).payload.getString("linkedin"))
        for (bad in listOf(JSONObject.NULL, true, JSONObject(), "javascript:alert(1)", "https://www.linkedin.com/in/a%E2%80%AEb")) {
            payload.put("linkedin", bad)
            rejects { ReviewItem.fromJson(item) }
        }
    }

    @Test fun supportCapability_isNotPersisted_andMalformedRefreshCannotReplaceProfile() {
        val store = connectedStore(); val service = Service().apply { profile = profile.copy(linkedin = canonical) }; val first = model(store, service)
        assertTrue(first.state.value.linkedinProfile)
        service.capability = "true"; service.profile = service.profile.copy(firstName = "Must not replace")
        main { first.refresh() }; await { !first.state.value.busy && first.state.value.error != null }
        assertEquals("Synthetic", first.state.value.profile.firstName)
        assertEquals(canonical, first.state.value.profile.linkedin)
        service.failWorkspace = true
        val reopened = model(store, service)
        assertFalse(reopened.state.value.linkedinProfile)
        assertEquals(canonical, reopened.state.value.profile.linkedin)
        main { reopened.toggleJob("fixture-job"); reopened.prepare() }
        await { !reopened.state.value.busy && reopened.state.value.error != null }
        assertTrue(service.writes.isEmpty())
    }
}
