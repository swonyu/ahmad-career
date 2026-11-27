package com.saleh.careerfinder

import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.security.MessageDigest
import java.util.Base64

/** Exact synthetic handler documents on Android's real JSON/UTF-16/storage runtime. No employer traffic. */
class CareerReadTransportRegressionTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val origin = "https://fixture.invalid"

    private class MemoryStore : PrivateStore {
        val records = mutableMapOf<String, String>()
        override fun read(name: String) = records[name]?.let(::JSONObject)
        override fun write(name: String, value: JSONObject) { requirePrivateCapacity(value); records[name] = value.toString() }
        override fun remove(name: String) { records.remove(name) }
        override fun names() = records.keys.toSet()
        override fun startFreshPreservingExisting() = error("Not used by this fixture.")
    }

    private fun fixtureInput(name: String, suffix: String): InputStream =
        instrumentation.context.assets.open("read-v2/$name.${suffix.removeSuffix(".gz")}")

    private fun fixture(name: String, suffix: String): ByteArray {
        // This build packages these source .gz fixtures as decoded bytes without that suffix.
        val limit = if (suffix.endsWith(".gz")) CareerReadTransport.MAX_ASSEMBLY_BYTES else 64 * 1024
        return fixtureInput(name, suffix).use { BoundaryPolicy.readBounded(it, limit) }
    }

    private data class FixtureInfo(val size: Int, val sha256: String)

    private fun inspectFixture(name: String): FixtureInfo {
        val digest = MessageDigest.getInstance("SHA-256")
        var total = 0
        fixtureInput(name, "recovery.json.gz").use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val count = input.read(buffer)
                if (count == -1) break
                check(count > 0 && total <= CareerReadTransport.MAX_ASSEMBLY_BYTES - count)
                digest.update(buffer, 0, count)
                total += count
            }
        }
        check(total > 0)
        return FixtureInfo(total, digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) })
    }

    private fun fixtureFrame(name: String, metadata: JSONObject, total: Int, offset: Int): JSONObject {
        check(offset in 0 until total)
        val count = minOf(CareerReadTransport.MAX_FRAGMENT_BYTES, total - offset)
        val payload = ByteArray(count)
        fixtureInput(name, "recovery.json.gz").use { input ->
            var remaining = offset.toLong()
            val discard = ByteArray(64 * 1024)
            while (remaining > 0) {
                val skipped = input.skip(remaining)
                check(skipped in 0..remaining)
                if (skipped > 0) remaining -= skipped
                else {
                    val read = input.read(discard, 0, minOf(discard.size.toLong(), remaining).toInt())
                    check(read > 0) { "Fixture ended before its requested offset." }
                    remaining -= read
                }
            }
            var filled = 0
            while (filled < count) {
                val read = input.read(payload, filled, count - filled)
                check(read > 0) { "Fixture ended before its complete frame." }
                filled += read
            }
            if (offset + count == total) assertEquals("Fixture has no unmeasured trailing bytes", -1, input.read())
        }
        return JSONObject().put("ok", true).put("operation", JSONObject.NULL)
            .put("read", JSONObject(metadata.toString()).put("offset", offset).put("byteLength", count)
                .put("nextCursor", if (offset + count < total) "fixture-${offset + count}" else JSONObject.NULL))
            .put("payloadBase64", Base64.getEncoder().encodeToString(payload))
    }

    private fun heapState(): String {
        val runtime = Runtime.getRuntime()
        return "maxBytes=${runtime.maxMemory()}, allocatedBytes=${runtime.totalMemory()}, freeBytes=${runtime.freeMemory()}"
    }

    private suspend fun assembleFixture(name: String, metadata: JSONObject, size: Int,
        onFollow: () -> Unit): CareerReadResponse {
        val initial = fixtureFrame(name, metadata, size, 0)
        try {
            return CareerReadTransport.assemble(origin, metadata.getString("workspaceId"), initial) { cursor ->
                onFollow()
                fixtureFrame(name, metadata, size, cursor.removePrefix("fixture-").toInt())
            }
        } catch (failure: ReadRecoveryRequired) {
            throw AssertionError("Fixture read required recovery (documentBytes=$size, ${heapState()}).", failure)
        }
    }

    private fun frame(bytes: ByteArray, metadata: JSONObject, offset: Int): JSONObject {
        val count = minOf(CareerReadTransport.MAX_FRAGMENT_BYTES, bytes.size - offset)
        return JSONObject().put("ok", true).put("operation", JSONObject.NULL)
            .put("read", JSONObject(metadata.toString()).put("offset", offset).put("byteLength", count)
                .put("nextCursor", if (offset + count < bytes.size) "fixture-${offset + count}" else JSONObject.NULL))
            .put("payloadBase64", Base64.getEncoder().encodeToString(bytes.copyOfRange(offset, offset + count)))
    }

    private fun equalJSON(expected: Any?, actual: Any?, path: String = "$", depth: Int = 0) {
        assertTrue("JSON depth at $path", depth < 64)
        when (expected) {
            is JSONObject -> {
                assertTrue("object at $path", actual is JSONObject)
                actual as JSONObject
                assertEquals("keys at $path", expected.keys().asSequence().toSet(), actual.keys().asSequence().toSet())
                expected.keys().asSequence().forEach { equalJSON(expected.opt(it), actual.opt(it), "$path.$it", depth + 1) }
            }
            is JSONArray -> {
                assertTrue("array at $path", actual is JSONArray); actual as JSONArray
                assertEquals("length at $path", expected.length(), actual.length())
                (0 until expected.length()).forEach { equalJSON(expected.opt(it), actual.opt(it), "$path[$it]", depth + 1) }
            }
            is Number -> { assertTrue(actual is Number); assertEquals(expected.toDouble(), (actual as Number).toDouble(), 0.0) }
            else -> assertEquals("exact UTF-16/value at $path", expected, actual)
        }
    }

    private fun capacityCase(name: String) = runBlocking {
        val oracle = JSONObject(CareerReadTransport.utf8(fixture(name, "metadata.json")))
        val metadata = oracle.getJSONObject("read")
        val fixtureInfo = inspectFixture(name)
        assertEquals(metadata.getLong("totalBytes"), fixtureInfo.size.toLong())
        assertEquals(metadata.getString("sha256"), fixtureInfo.sha256)
        var followups = 0
        val response = assembleFixture(name, metadata, fixtureInfo.size) { followups++ }
        assertEquals((fixtureInfo.size - 1) / CareerReadTransport.MAX_FRAGMENT_BYTES, followups)
        val expected = JSONObject(CareerReadTransport.utf8(fixture(name, "expected-v1.json.gz")))
        equalJSON(expected, response)
        assertEquals(200, response.getJSONArray("jobs").length())
        assertEquals(500, response.getJSONArray("attempts").length())
        assertEquals(20, response.getJSONArray("recoverablePlans").length())
        val connection = Connection(origin, metadata.getString("workspaceId"), "f".repeat(64), "2030-01-01T00:00:00Z", accountId = metadata.getString("accountId"))
        val profile = ProfileDraft.fromServer(response.getJSONObject("profile"))
        val jobs = response.requiredObjects("jobs").map(Opportunity::fromServer)
        val receipts = response.requiredObjects("attempts").map(ApplicationReceipt::fromServer)
        val plans = response.requiredObjects("recoverablePlans").map(ReviewPlan::fromJson)
        val store = MemoryStore()
        val reference = if (response.document.legacyStrings.isNotEmpty()) fixtureInput(name, "recovery.json.gz").use {
            HistoricalRecoveryStorage.save(store, origin, metadata, it)
        } else null
        val state = CareerUiState(loaded = true, connection = connection, profile = profile, serverProfile = profile,
            jobs = jobs, receipts = receipts, recoverablePlans = plans, historicalRecovery = reference,
            historicalRawStrings = response.document.legacyStrings + HistoricalText.malformedStrings(profile.privateJson()))
        val encoded = WorkspaceStorage.encode(state)
        HistoricalText.requireWellFormed(encoded)
        requirePrivateCapacity(encoded)
        store.write("workspace", encoded)
        val reopened = WorkspaceStorage.decode(store.read("workspace"), connection)
        assertEquals(profile, reopened.profile)
        assertEquals(jobs, reopened.jobs)
        assertEquals(receipts, reopened.receipts)
        if (reference != null) {
            assertEquals(reference, reopened.historicalRecovery)
            HistoricalRecoveryStorage.verify(store, reference)
            assertTrue(plans.any(ReviewPlan::hasHistoricalText))
            assertTrue(receipts.filter { !BoundaryPolicy.validUnicode(it.applicationId) }.none(ApplicationReceipt::verified))
            expectFailure { WorkspaceTransfer.export(reopened, null, false) }
        } else {
            val exported = WorkspaceTransfer.export(reopened, null, false)
            val imported = WorkspaceTransfer.decode(exported, reopened.privateScope)
            assertEquals(profile.website, imported.snapshot.profile.website)
            assertEquals(jobs.map { it.url }, imported.snapshot.jobs.map { it.url })
        }
        println("PASS Android exact-handler fixture $name: ${fixtureInfo.size} bytes, ${followups + 1} pages, 200 jobs, 500 attempts, 20 reviews; Java heap=${Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory()}")
    }

    @Test fun actualHandlerValidUnicode() = capacityCase("valid_unicode")
    @Test fun actualHandlerHistoricalSurrogates() = capacityCase("surrogate")
    @Test fun actualHandlerLegacyURL() = capacityCase("legacy_url")

    private fun small(): Pair<ByteArray, JSONObject> {
        val data = JSONObject().put("ok", true).put("profile", JSONObject().put("firstName", "A\uD800B"))
        val (projection, entries) = HistoricalText.project(data, setOf("A\uD800B"))
        val document = JSONObject().put("documentVersion", 1).put("mode", "view").put("data", projection).put("legacyText", entries)
        val bytes = document.toString().toByteArray(Charsets.UTF_8)
        return bytes to JSONObject().put("version", 2).put("kind", "workspace").put("accountId", "synthetic-owner")
            .put("workspaceId", "11111111-1111-4111-8111-111111111111").put("asOf", "2026-11-23T07:00:00.000Z")
            .put("expiresAt", "2026-11-23T07:05:00.000Z").put("sha256", BoundaryPolicy.sha256(bytes)).put("totalBytes", bytes.size)
            .put("offset", 0).put("byteLength", bytes.size).put("nextCursor", JSONObject.NULL).put("exportCursor", "synthetic-export")
    }

    private fun expectFailure(block: () -> Unit) {
        var rejected = false
        try { block() } catch (_: Exception) { rejected = true }
        assertTrue("invalid data must fail without replacement", rejected)
    }

    @Test fun rejectsCorruptFramesAndUnboundSidecars() = runBlocking {
        val (bytes, metadata) = small()
        val workspace = metadata.getString("workspaceId")
        val good = frame(bytes, metadata, 0)
        for (bad in listOf(
            JSONObject(good.toString()).apply { getJSONObject("read").put("offset", 1) },
            JSONObject(good.toString()).apply { getJSONObject("read").put("sha256", "a".repeat(64)) },
            JSONObject(good.toString()).apply { getJSONObject("read").put("workspaceId", "22222222-2222-4222-8222-222222222222") },
            JSONObject(good.toString()).apply { getJSONObject("read").put("totalBytes", CareerReadTransport.MAX_ASSEMBLY_BYTES + 1L) },
            JSONObject(good.toString()).apply { getJSONObject("read").put("expiresAt", "2026-11-23T07:04:59.000Z") },
            JSONObject(good.toString()).put("payloadBase64", good.getString("payloadBase64") + "\n")
        )) {
            var failed = false
            try { CareerReadTransport.assemble(origin, workspace, bad) { error("must not follow") } }
            catch (_: Exception) { failed = true }
            assertTrue(failed)
        }
        val document = JSONObject(CareerReadTransport.utf8(bytes))
        val entries = document.getJSONArray("legacyText")
        val data = document.getJSONObject("data")
        val duplicate = JSONArray().put(entries.get(0)).put(entries.get(0))
        expectFailure { HistoricalText.restore(data, duplicate) }
        val wrong = JSONArray().put(JSONObject(entries.getJSONObject(0).toString()).put("path", JSONArray(listOf("workspaceId"))))
        expectFailure { HistoricalText.restore(JSONObject(data.toString()).put("workspaceId", "A\\uD800B"), wrong) }
        equalJSON(data, document.getJSONObject("data"))
        val restored = HistoricalText.restore(data, entries).first
        assertEquals("A\uD800B", restored.getJSONObject("profile").getString("firstName"))
        expectFailure { HistoricalText.requireWellFormed(restored) }
        assertEquals("A\\uD800B", HistoricalText.display("A\uD800B"))
        assertEquals("مرحبا 😀 � \\uD800", HistoricalText.display("مرحبا 😀 � \\uD800"))
    }

    @Test fun protectedRecoveryExportAndStorageFailureKeepOriginal() {
        val (bytes, metadata) = small()
        val store = MemoryStore()
        store.write("workspace", JSONObject().put("schema", 1))
        val original = store.records.getValue("workspace")
        val reference = HistoricalRecoveryStorage.save(store, origin, metadata, bytes.inputStream())
        val output = ByteArrayOutputStream()
        HistoricalRecoveryStorage.export(store, reference, output)
        val exported = JSONObject(CareerReadTransport.utf8(output.toByteArray()))
        assertEquals("career-finder-raw-recovery", exported.getString("format"))
        assertArrayEquals(bytes, HistoricalText.canonicalBase64(exported.getString("documentBase64"), bytes.size))
        assertFalse(exported.toString().contains("sessionToken"))
        assertFalse(exported.toString().contains("exportCursor"))
        expectFailure { WorkspaceTransfer.decode(exported, "workspace-unpaired") }
        expectFailure { HistoricalRecoveryStorage.save(store, origin, JSONObject(metadata.toString()).put("sha256", "b".repeat(64)), bytes.inputStream()) }
        assertEquals(original, store.records.getValue("workspace"))
        HistoricalRecoveryStorage.verify(store, reference)
        expectFailure { requirePrivateCapacity(JSONObject().put("draft", "new\uDFFF")) }
        assertEquals(original, store.records.getValue("workspace"))
    }

    @Test fun malformedReceiptDoesNotBecomeVerifiedAndNewURLsStayStrict() {
        assertFalse(BoundaryPolicy.isLiveReceipt("live", "lever", "confirmed", "old\uD800-id"))
        assertTrue(BoundaryPolicy.isLiveReceipt("live", "lever", "confirmed", "actual-id"))
        val long = "https://example.com/" + "%E7%95%8C".repeat(2028)
        assertEquals(18272, long.length)
        assertEquals(long, BoundaryPolicy.historicalOpportunityURL(long))
        expectFailure { BoundaryPolicy.serviceOpportunityURL(long) }
        expectFailure { BoundaryPolicy.serviceOpportunityURL("https://example.com/" + "e\u0301".repeat(300)) }
        val (bytes, metadata) = small()
        val operation = JSONObject().put("kind", "session/revoke").put("acknowledged", true)
            .put("accountId", metadata.getString("accountId")).put("workspaceId", metadata.getString("workspaceId"))
        assertNotNull(CareerReadTransport.operation(operation, "session/revoke", metadata.getString("workspaceId")))
        expectFailure { CareerReadTransport.operation(JSONObject(operation.toString()).put("sessionToken", "x"), "session/revoke", metadata.getString("workspaceId")) }
        assertTrue(bytes.isNotEmpty())
    }

    @Test fun encryptedRecoverySurvivesReopenAndStorageAreaRotation() {
        val context = instrumentation.targetContext
        val namespace = "v2-test-" + java.util.UUID.randomUUID().toString().replace("-", "")
        val root = java.io.File(context.noBackupFilesDir, "career-private-$namespace")
        val alias = "career-finder-v1-$namespace"
        try {
            val (bytes, metadata) = small()
            val vault = SecureVault(context, namespace)
            val reference = HistoricalRecoveryStorage.save(vault, origin, metadata, bytes.inputStream())
            vault.write("workspace-unpaired", JSONObject().put("schema", 1).put("reference", reference.json()))
            val reopened = SecureVault(context, namespace)
            val decoded = HistoricalRecoveryReference.decode(reopened.read("workspace-unpaired")!!.getJSONObject("reference"), null)
            assertEquals(reference, decoded)
            HistoricalRecoveryStorage.verify(reopened, decoded)
            val output = ByteArrayOutputStream()
            HistoricalRecoveryStorage.export(reopened, decoded, output)
            val exported = JSONObject(CareerReadTransport.utf8(output.toByteArray()))
            assertArrayEquals(bytes, HistoricalText.canonicalBase64(exported.getString("documentBase64"), bytes.size))
            assertTrue(root.listFiles().orEmpty().filter { it.name.endsWith(".enc") }.all { file ->
                !String(file.readBytes(), Charsets.ISO_8859_1).contains("synthetic-owner")
            })
            reopened.startFreshPreservingExisting()
            assertTrue(reopened.namesPreserved("original").any { it.startsWith(reference.documentFileName) })
            assertEquals(reference.json().toString(), reopened.readPreserved("original", "workspace-unpaired")!!.getJSONObject("reference").toString())
            assertNull(reopened.read("workspace-unpaired")!!.optJSONObject("reference"))
        } finally {
            root.deleteRecursively()
            val keys = java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            keys.aliases().toList().filter { it == alias || it.startsWith("$alias-") }.forEach(keys::deleteEntry)
        }
    }

    @Test fun acknowledgmentAndReadMustMatchTheRequestedAction() {
        val (_, metadata) = small(); val workspace = metadata.getString("workspaceId")
        val base = JSONObject().put("acknowledged", true).put("accountId", metadata.getString("accountId")).put("workspaceId", workspace)
        val planID = "22222222-2222-4222-8222-222222222222"; val digest = "a".repeat(64)
        val request = JSONObject().put("planId", planID).put("digest", digest)
        val operation = JSONObject(base.toString()).put("kind", "submit").put("planId", planID).put("digest", digest)
        assertNotNull(CareerReadTransport.operation(operation, "submit", workspace, request))
        expectFailure { CareerReadTransport.operation(JSONObject(operation.toString()).put("planId", workspace), "submit", workspace, request) }
        expectFailure { CareerReadTransport.operation(JSONObject(operation.toString()).put("digest", "b".repeat(64)), "submit", workspace, request) }
        val good = JSONObject().put("plan", JSONObject().put("id", planID).put("digest", digest))
        CareerReadTransport.validateMutationView(good, operation, request)
        expectFailure { CareerReadTransport.validateMutationView(JSONObject(good.toString()).apply { getJSONObject("plan").put("id", workspace) }, operation, request) }
        expectFailure { CareerReadTransport.validateMutationView(JSONObject(good.toString()).apply { getJSONObject("plan").put("digest", "b".repeat(64)) }, operation, request) }
        val profile = JSONObject(base.toString()).put("kind", "profile").put("revision", 2)
        assertNotNull(CareerReadTransport.operation(profile, "profile", workspace, JSONObject().put("expectedRevision", 1)))
        expectFailure { CareerReadTransport.operation(profile, "profile", workspace, JSONObject().put("expectedRevision", 2)) }
        expectFailure { CareerReadTransport.validateMutationView(JSONObject().put("profile", JSONObject().put("revision", 3)), profile, null) }
        val job = JSONObject(base.toString()).put("kind", "jobs").put("jobId", planID)
        val view = JSONObject().put("job", JSONObject().put("id", planID).put("url", "https://example.invalid/a"))
        CareerReadTransport.validateMutationView(view, job, JSONObject().put("url", "https://example.invalid/a"))
        expectFailure { CareerReadTransport.validateMutationView(view, job, JSONObject().put("url", "https://example.invalid/b")) }
        expectFailure { CareerReadTransport.validateMutationView(JSONObject(view.toString()).apply { getJSONObject("job").put("id", workspace) }, job, null) }
    }

    /** Dedicated 192 MiB proof; ordinary CI selects this separately from the original regressions. */
    @Test fun historicalRecoveryUnderRetainedHeapPressurePreservesEarlierWorkspace() = runBlocking {
        org.junit.Assume.assumeTrue("Dedicated pressure proof requires careerRecoveryPressure192MiB=true; an assumption is not a pass.",
            InstrumentationRegistry.getArguments().getString("careerRecoveryPressure192MiB") == "true")
        assertEquals("The dedicated pressure proof requires the reviewed 192 MiB app heap; do not enlarge it.",
            192L * 1024 * 1024, Runtime.getRuntime().maxMemory())
        val name = "surrogate"
        val metadata = JSONObject(CareerReadTransport.utf8(fixture(name, "metadata.json"))).getJSONObject("read")
        val info = inspectFixture(name)
        assertEquals(20_373_220, info.size)
        assertEquals(info.size.toLong(), metadata.getLong("totalBytes"))
        assertEquals(info.sha256, metadata.getString("sha256"))
        val initial = fixtureFrame(name, metadata, info.size, 0)
        val expectedReadMetadata = JSONObject(initial.getJSONObject("read").toString())
        assertEquals(CareerReadTransport.MAX_FRAGMENT_BYTES, initial.getJSONObject("read").getInt("byteLength"))

        val context = instrumentation.targetContext
        val namespace = "pressure-" + java.util.UUID.randomUUID().toString().replace("-", "")
        val root = java.io.File(context.noBackupFilesDir, "career-private-$namespace")
        val alias = "career-finder-v1-$namespace"
        val pressure = mutableListOf<ByteArray>()
        val owner = androidx.lifecycle.ViewModelStore()
        try {
            val vault = SecureVault(context, namespace)
            val connection = Connection(origin, metadata.getString("workspaceId"), "f".repeat(64),
                "2030-01-01T00:00:00Z", accountId = metadata.getString("accountId"))
            val draft = OpportunityDraft(url = "https://example.invalid/pending", title = "Earlier unfinished role")
            val earlier = CareerUiState(loaded = true, connection = connection,
                profile = ProfileDraft(firstName = "Earlier saved draft", headline = "Keep these private edits"),
                profileDirty = true, opportunityDraft = draft)
            val workspaceName = "workspace-" + BoundaryPolicy.workspaceKey(origin, connection.workspaceId)
            vault.write("connection", connection.toJson())
            vault.write(workspaceName, WorkspaceStorage.encode(earlier))
            vault.write("workspace-unpaired", WorkspaceStorage.encode(earlier.copy(connection = null)))
            val earlierJSON = vault.read(workspaceName)!!.toString()
            val earlierPhoneJSON = vault.read("workspace-unpaired")!!.toString()
            val earlierCipher = java.io.File(root, "$workspaceName.enc").readBytes()
            val earlierPhoneCipher = java.io.File(root, "workspace-unpaired.enc").readBytes()

            // Retained bytes alone guarantee refusal even if ordinary GC happens naturally.
            // This is bounded pressure on the existing heap, never a heap-size or guard change.
            val oneMiB = 1024 * 1024
            val requiredAvailable = info.size.toLong() * 6 + 8L * oneMiB
            val requestedPressure = (Runtime.getRuntime().maxMemory() - requiredAvailable + 8L * oneMiB)
                .coerceAtLeast(8L * oneMiB)
            val pressureBlockCount = (requestedPressure + oneMiB - 1) / oneMiB
            assertTrue("The reviewed recovery pressure is bounded to 96 MiB", pressureBlockCount in 1L..96L)
            val pressureBlocks = pressureBlockCount.toInt()
            repeat(pressureBlocks) { index -> pressure += ByteArray(oneMiB).apply {
                this[0] = (index + 1).toByte(); this[lastIndex] = (index xor 0x5a).toByte()
            } }
            var followups = 0
            val refusal = try {
                CareerReadTransport.assemble(origin, connection.workspaceId, initial) {
                    followups++; error("The memory guard must refuse before requesting another page.")
                }
                throw AssertionError("The retained heap pressure did not exercise the recovery guard.")
            } catch (required: ReadRecoveryRequired) { required }
            assertEquals(0, followups)
            equalJSON(expectedReadMetadata, refusal.recovery.metadata)

            // Routing proof: feed the real captured refusal into the injected service refresh.
            // The full recovery HTTP transport and Android document chooser are separate evidence.
            val reads = java.util.concurrent.atomic.AtomicInteger()
            val service = object : CareerService {
                override suspend fun pair(origin: String, code: String): Connection = error("No pairing in this fixture.")
                override suspend fun request(connection: Connection, method: String, route: String, body: JSONObject?): JSONObject {
                    check(method == "GET" && route == "workspace" && body == null)
                    reads.incrementAndGet()
                    throw refusal
                }
            }
            lateinit var model: CareerViewModel
            instrumentation.runOnMainSync {
                model = CareerViewModel(context.applicationContext as android.app.Application, vault, service)
                owner.put("pressure-fixture", model)
            }
            val readyBy = System.nanoTime() + 5_000_000_000
            while ((!model.state.value.loaded || model.state.value.busy || model.state.value.readRecoveryRequest == null) &&
                System.nanoTime() < readyBy) Thread.sleep(20)
            assertTrue("The ViewModel must offer recovery after the captured refusal", model.state.value.loaded &&
                !model.state.value.busy && model.state.value.readRecoveryRequest != null)
            assertEquals(1, reads.get())
            assertEquals(refusal.recovery, model.state.value.readRecoveryRequest)
            assertEquals(earlier.profile, model.state.value.profile)
            assertTrue(model.state.value.profileDirty)
            assertEquals(draft, model.state.value.opportunityDraft)

            val reference = fixtureInput(name, "recovery.json.gz").use {
                HistoricalRecoveryStorage.save(vault, origin, refusal.recovery.metadata, it)
            }
            assertEquals(info.size.toLong(), reference.totalBytes)
            assertEquals(info.sha256, reference.sha256)
            vault.write("pressure-reference", reference.json())
            val reopened = SecureVault(context, namespace)
            val recovered = HistoricalRecoveryReference.decode(reopened.read("pressure-reference")!!, connection)
            assertEquals(reference, recovered)
            HistoricalRecoveryStorage.verify(reopened, recovered)
            val exported = java.io.File(root, "pressure-recovery.json")
            exported.outputStream().buffered(64 * 1024).use { HistoricalRecoveryStorage.export(reopened, recovered, it) }
            verifyStreamedRecoveryExport(exported, name, recovered)

            assertEquals(earlierJSON, reopened.read(workspaceName)!!.toString())
            assertEquals(earlierPhoneJSON, reopened.read("workspace-unpaired")!!.toString())
            assertArrayEquals(earlierCipher, java.io.File(root, "$workspaceName.enc").readBytes())
            assertArrayEquals(earlierPhoneCipher, java.io.File(root, "workspace-unpaired.enc").readBytes())
            val savedAgain = WorkspaceStorage.decode(reopened.read(workspaceName), connection)
            assertEquals(earlier.profile, savedAgain.profile)
            assertTrue(savedAgain.profileDirty)
            assertEquals(draft, savedAgain.opportunityDraft)
            assertEquals(pressureBlocks.toLong() * oneMiB, pressure.sumOf { it.size.toLong() })
            pressure.forEachIndexed { index, bytes ->
                assertEquals((index + 1).toByte(), bytes[0])
                assertEquals((index xor 0x5a).toByte(), bytes[bytes.lastIndex])
            }
            println("PASS Android protected recovery under retained pressure: ${info.size} exact bytes, $pressureBlocks MiB retained; original workspace and draft unchanged")
        } finally {
            instrumentation.runOnMainSync { owner.clear() }
            pressure.forEach { it.fill(0) }
            pressure.clear()
            root.deleteRecursively()
            val keys = java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            keys.aliases().toList().filter { it == alias || it.startsWith("$alias-") }.forEach(keys::deleteEntry)
        }
    }

    /** Decode the exported envelope in bounded chunks and compare every original asset byte. */
    private fun verifyStreamedRecoveryExport(file: java.io.File, name: String, reference: HistoricalRecoveryReference) {
        file.inputStream().buffered(64 * 1024).use { input ->
            val headerBytes = ByteArrayOutputStream()
            val marker = ",\"documentBase64\":\""
            var header: String
            while (true) {
                val byte = input.read()
                check(byte >= 0 && headerBytes.size() < 64 * 1024) { "Missing bounded recovery export header." }
                headerBytes.write(byte)
                header = headerBytes.toString(Charsets.UTF_8.name())
                if (header.endsWith(marker)) break
            }
            val envelope = JSONObject(header.removeSuffix(marker) + "}")
            assertEquals(setOf("format", "version", "exportedAt", "source"), envelope.keys().asSequence().toSet())
            assertEquals("career-finder-raw-recovery", envelope.getString("format"))
            assertEquals(1, envelope.getInt("version"))
            java.time.Instant.parse(envelope.getString("exportedAt"))
            val expectedSource = reference.json().apply { remove("version"); remove("documentFileName") }
            equalJSON(expectedSource, envelope.getJSONObject("source"))
            val digest = MessageDigest.getInstance("SHA-256")
            val encodedSize = ((reference.totalBytes + 2) / 3) * 4
            var remaining = encodedSize
            var decodedSize = 0L
            fixtureInput(name, "recovery.json.gz").use { original ->
                while (remaining > 0) {
                    val encoded = ByteArray(minOf(64L * 1024, remaining).toInt())
                    check(encoded.size % 4 == 0)
                    readFixtureBytesExactly(input, encoded)
                    val decoded = Base64.getDecoder().decode(encoded)
                    val expected = ByteArray(decoded.size)
                    readFixtureBytesExactly(original, expected)
                    assertArrayEquals("Every reopened recovery byte matches the exact handler asset", expected, decoded)
                    digest.update(decoded)
                    decodedSize += decoded.size
                    remaining -= encoded.size
                }
                assertEquals(-1, original.read())
            }
            assertEquals(reference.totalBytes, decodedSize)
            assertEquals(reference.sha256, digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) })
            assertEquals('"'.code, input.read())
            assertEquals('}'.code, input.read())
            assertEquals(-1, input.read())
            assertEquals(headerBytes.size().toLong() + encodedSize + 2, file.length())
        }
    }

    private fun readFixtureBytesExactly(input: InputStream, bytes: ByteArray) {
        var offset = 0
        while (offset < bytes.size) {
            val count = input.read(bytes, offset, bytes.size - offset)
            check(count > 0) { "The exact recovery fixture/export ended early or made no progress." }
            offset += count
        }
    }

}
