package com.saleh.careerfinder

import android.app.LocaleManager
import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.os.LocaleList
import android.os.Process
import android.os.SystemClock
import android.provider.MediaStore
import android.system.Os
import android.system.OsConstants
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.URI
import java.net.URL
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.time.Instant
import java.time.LocalDate
import java.util.Locale
import java.util.UUID
import javax.net.ssl.HttpsURLConnection

/** Private participant for the actual acceptance APK. No final workspace state is injected. */
internal class NativeJourneyRuntime {
    companion object {
        const val PDF_SHA = "fccbd3962e482d8b24bea10c69ec047e0879cc55cf3c3b3222909bd89108b86a"
        const val PDF_BYTES = 609
        const val SOURCE_ID = "lever:global:synthetic-native-journey"
        const val COMPANY = "Synthetic Native Journey Studio"
        const val PRIMARY_TITLE = "Service Designer"
        const val SECONDARY_TITLE = "Senior Service Designer"
        const val PRIMARY_URL = "https://jobs.lever.co/synthetic-native-journey/20000000-0000-4000-8000-000000000001"
        const val SECONDARY_URL = "https://jobs.lever.co/synthetic-native-journey/20000000-0000-4000-8000-000000000002"
        const val NOTE = "Synthetic follow-up: review the role and my questions."
        val CHECKPOINTS = listOf("blank", "contactSaved", "jobSaved", "pickerCancelled", "profileA",
            "preparedA", "profileB", "followUpSaved", "closeSecondary", "closedResult", "outage",
            "outageResult", "networkDisconnected", "networkFailure", "restarted", "finished")
        private val PROCESS_NONCE = UUID.randomUUID().toString().uppercase(Locale.ROOT)
        fun sha(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes)
            .joinToString("") { String.format(Locale.ROOT, "%02x", it.toInt() and 255) }
        fun fileSHA(file: File): String {
            val digest = MessageDigest.getInstance("SHA-256")
            FileInputStream(file).use { input ->
                val buffer = ByteArray(65536)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    if (count > 0) digest.update(buffer, 0, count)
                }
            }
            return digest.digest().joinToString("") { String.format(Locale.ROOT, "%02x", it.toInt() and 255) }
        }
        // Reject malformed UTF-8 instead of allowing replacement characters to alter identities or hashes.
        private fun strictUTF8(bytes: ByteArray): String = Charsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(bytes)).toString()

        // A deterministic JSON string encoder: never optionally escape '/', preserve UTF-16 content.
        private fun jsonQuoted(value: String): String = buildString {
            require(BoundaryPolicy.validUnicode(value))
            append('"')
            for (unit in value) when (unit) {
                '"' -> append("\\\"")
                '\\' -> append("\\\\")
                '\b' -> append("\\b")
                '\u000C' -> append("\\f")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                else -> if (unit.code < 0x20) {
                    append("\\u")
                    append(unit.code.toString(16).padStart(4, '0'))
                } else append(unit)
            }
            append('"')
        }
        fun canonical(value: Any?): String = when (value) {
            null, JSONObject.NULL -> "null"
            // Kotlin String.compareTo compares UTF-16 code units; JSON object keys use that same order.
            is JSONObject -> value.keys().asSequence().toList().sortedWith { a, b -> a.compareTo(b) }
                .joinToString(",", "{", "}") { jsonQuoted(it) + ":" + canonical(value.get(it)) }
            is JSONArray -> (0 until value.length()).joinToString(",", "[", "]") { canonical(value.get(it)) }
            is String -> jsonQuoted(value)
            is Boolean -> value.toString()
            is Number -> {
                val number = value.toDouble()
                require(number.isFinite() && number == value.toLong().toDouble() &&
                    number >= -9_007_199_254_740_991.0 && number <= 9_007_199_254_740_991.0)
                value.toLong().toString()
            }
            else -> error("Unsupported private witness value")
        }
    }

    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    val context: Context = instrumentation.targetContext
    private val args = InstrumentationRegistry.getArguments()
    val phase = args.getString("career_native_journey_phase").also { require(it == "first" || it == "restore") }!!
    val testID = args.getString("career_native_journey_test_id").orEmpty().also {
        require(it.matches(Regex("[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}")))
        require(UUID.fromString(it).toString().uppercase(Locale.ROOT) == it)
    }
    private val privateRoot = File(context.filesDir, "native-journey-private")
    private lateinit var config: JSONObject
    lateinit var directory: File
        private set
    lateinit var connection: Connection
        private set
    lateinit var language: String
        private set
    lateinit var followUpDay: String
        private set
    lateinit var vault: SecureVault
        private set
    lateinit var workspaceKey: String
        private set
    private lateinit var source: JSONObject
    private var nextSequence = if (phase == "first") 1 else 15
    private val initialRecordHashes = linkedMapOf<String, String>()
    private val provisionedDocuments = linkedSetOf<String>()
    private var started = false

    fun start() {
        check(!started); started = true
        require(args.getString("career_native_journey") == "true")
        require(context.packageName == "com.saleh.careerfinder.acceptance")
        require(BuildConfig.BUILD_TYPE == "acceptance" && BuildConfig.CAREER_ACCEPTANCE_DISCOVERY_ORIGIN.isNotEmpty())
        ownedDirectory(privateRoot, create = false)
        val configBytes = protectedRead(File(privateRoot, "config.json"), 65536)
        val expectedConfigSHA = args.getString("career_native_journey_config_sha256").orEmpty()
        require(expectedConfigSHA.matches(Regex("[a-f0-9]{64}")) && sha(configBytes) == expectedConfigSHA)
        config = JSONObject(strictUTF8(configBytes))
        val configKeys = setOf("schemaVersion", "testID", "language", "origin", "workspaceID", "sessionToken",
            "expiresAt", "bridgeCapability", "documents", "followUpDay", "sourceManifestSHA256",
            "appAPKsha256", "testAPKsha256", "workerSHA256", "bootstrapSHA256")
        require(config.keys().asSequence().toSet() == configKeys &&
            config.get("schemaVersion") is Int && config.getInt("schemaVersion") == 1 &&
            config.get("documents") is JSONObject)
        val expectedStrings = configKeys - setOf("schemaVersion", "documents")
        require(expectedStrings.all { config.get(it) is String })
        require(config.getString("testID") == testID)
        language = config.getString("language").also { require(it == "en" || it == "ar") }
        followUpDay = config.getString("followUpDay").also { require(LocalDate.parse(it).toString() == it) }
        val origin = config.getString("origin")
        require(origin == BuildConfig.CAREER_ACCEPTANCE_DISCOVERY_ORIGIN)
        val uri = URI(origin)
        require(uri.scheme == "https" && uri.host == "10.0.2.2" && uri.port in 1024..65535 &&
            uri.rawUserInfo == null && uri.rawPath.isEmpty() && uri.rawQuery == null && uri.rawFragment == null)
        val token = config.getString("sessionToken")
        require(token.isNotEmpty() && token.length <= 4096 && token.none { it <= ' ' || it.code == 127 })
        connection = Connection(origin, config.getString("workspaceID"), token, config.getString("expiresAt"))
        require(connection.workspaceId.matches(Regex("[A-Za-z0-9_-]{1,128}")))
        require(Instant.parse(connection.expiresAt).isAfter(Instant.now()))
        for (name in listOf("sourceManifestSHA256", "appAPKsha256", "testAPKsha256", "workerSHA256", "bootstrapSHA256"))
            require(config.getString(name).matches(Regex("[a-f0-9]{64}")))
        require(fileSHA(File(context.applicationInfo.sourceDir)) == config.getString("appAPKsha256"))
        require(fileSHA(File(instrumentation.context.applicationInfo.sourceDir)) == config.getString("testAPKsha256"))
        source = JSONObject().put("sourceManifestSHA256", config.getString("sourceManifestSHA256"))
            .put("appAPKsha256", config.getString("appAPKsha256")).put("testAPKsha256", config.getString("testAPKsha256"))
            .put("workerSHA256", config.getString("workerSHA256")).put("bootstrapSHA256", config.getString("bootstrapSHA256"))
        NativeHttpTransport.install(origin, testID, connection.workspaceId, config.getString("bridgeCapability"),
            sha(token.toByteArray(Charsets.UTF_8)))
        workspaceKey = BoundaryPolicy.workspaceKey(origin, connection.workspaceId)
        vault = SecureVault(context)
        val vaultRoot = File(context.noBackupFilesDir, "career-private")
        require(!File(vaultRoot, "active-area").exists())
        directory = File(File(context.filesDir, "native-journey"), testID)
        ownedDirectory(directory.parentFile!!, create = phase == "first")
        ownedDirectory(directory, create = phase == "first")
        if (phase == "first") {
            require(vault.names().isEmpty() && directory.list().orEmpty().isEmpty())
            require(config.getJSONObject("documents").keys().asSequence().toSet() == setOf("CV-A.pdf", "CV-B.pdf"))
            // The host already provisioned this genuine synthetic native session.
            // This is the sole bootstrap write: no profile, job, search, outcome or record.
            vault.write("connection", connection.toJson())
            require(vault.names() == setOf("connection"))
            require(context.getSharedPreferences("career_display_language", Context.MODE_PRIVATE).edit()
                .putString("selection", language).putBoolean("platform_migrated", true).commit())
            require(context.getSharedPreferences(APPEARANCE_PREFERENCES, Context.MODE_PRIVATE).edit()
                .putString(APPEARANCE_KEY, "dark").commit())
            if (Build.VERSION.SDK_INT >= 33)
                context.getSystemService(LocaleManager::class.java).applicationLocales = LocaleList.forLanguageTags(language)
        } else {
            require(Connection.fromJson(checkNotNull(vault.read("connection"))) == connection)
            require(context.getSharedPreferences("career_display_language", Context.MODE_PRIVATE)
                .getString("selection", null) == language)
            require(context.getSharedPreferences(APPEARANCE_PREFERENCES, Context.MODE_PRIVATE)
                .getString(APPEARANCE_KEY, null) == "dark")
            verifyProcessBoundaryBeforeActivity()
        }
        require(Connection.fromJson(checkNotNull(vault.read("connection"))) == connection)
        durableJSON(File(directory, phase + "-process-start.json"), process().put("phase", phase)
            .put("source", source).put("configSHA256", expectedConfigSHA)
            .put("bootstrapScope", "Only provisioned Connection before first actual Activity; no pairing UI or finished-state seed"))
    }

    fun process(): JSONObject {
        val stat = File("/proc/self/stat").readText()
        val closing = stat.lastIndexOf(')')
        require(closing > 0)
        val fields = stat.substring(closing + 1).trim().split(Regex("\\s+"))
        require(fields.size > 19 && fields[19].matches(Regex("[0-9]+")))
        return JSONObject().put("pid", Process.myPid()).put("startTicks", fields[19]).put("nonce", PROCESS_NONCE)
    }

    private fun verifyProcessBoundaryBeforeActivity() {
        val boundaryFile = File(privateRoot, "process-boundary.json")
        val bytes = protectedRead(boundaryFile, 16384)
        require(sha(bytes) == args.getString("career_native_journey_boundary_sha256"))
        val boundary = JSONObject(strictUTF8(bytes))
        require(boundary.keys().asSequence().toSet() == setOf("schemaVersion", "testID", "seedProcess", "forceStopIssued",
            "noTargetPIDObserved", "postStopCiphertexts", "seedHandoffSHA256"))
        require(boundary.get("schemaVersion") is Int && boundary.getInt("schemaVersion") == 1 &&
            boundary.get("testID") is String && boundary.getString("testID") == testID &&
            boundary.get("forceStopIssued") is Boolean && boundary.get("noTargetPIDObserved") is Boolean &&
            boundary.get("seedProcess") is JSONObject && boundary.get("postStopCiphertexts") is JSONObject &&
            boundary.get("seedHandoffSHA256") is String)
        require(boundary.getBoolean("forceStopIssued") && boundary.getBoolean("noTargetPIDObserved"))
        val seedBytes = protectedRead(File(directory, "first-process-complete.json"), 32768)
        require(sha(seedBytes) == boundary.getString("seedHandoffSHA256"))
        val seed = JSONObject(strictUTF8(seedBytes))
        require(canonical(seed.getJSONObject("process")) == canonical(boundary.getJSONObject("seedProcess")))
        val current = process(); val previous = boundary.getJSONObject("seedProcess")
        require(current.getInt("pid") != previous.getInt("pid") &&
            current.getString("startTicks") != previous.getString("startTicks") &&
            current.getString("nonce") != previous.getString("nonce"))
        val hashes = boundary.getJSONObject("postStopCiphertexts")
        val expected = setOf("connection", "workspace-" + workspaceKey, "search-" + workspaceKey)
        require(hashes.keys().asSequence().toSet() == expected && vault.names() == expected)
        for (name in expected) {
            val actual = sha(protectedRead(File(context.noBackupFilesDir, "career-private/" + name + ".enc"), 2_097_152))
            require(actual == hashes.getString(name))
            initialRecordHashes[name] = actual
        }
        durableJSON(File(directory, "restore-pre-activity.json"), JSONObject().put("schemaVersion", 1).put("testID", testID)
            .put("process", current).put("seedProcess", previous).put("ciphertexts", hashes)
            .put("boundarySHA256", sha(bytes)).put("noReseed", true).put("activityStarted", false))
    }

    fun provisionDocument(name: String): android.net.Uri {
        require(phase == "first" && name in setOf("CV-A.pdf", "CV-B.pdf") && provisionedDocuments.add(name))
        val path = config.getJSONObject("documents").getString(name)
        require(path.matches(Regex("/__native-journey-documents/[a-f0-9]{48}/CV-[AB]\\.pdf")) &&
            path.substringAfterLast('/') == name)
        val request = URL(connection.origin + path).openConnection() as HttpsURLConnection
        request.instanceFollowRedirects = false
        request.connectTimeout = 5000; request.readTimeout = 5000
        request.useCaches = false; request.requestMethod = "GET"
        request.setRequestProperty("Accept", "application/pdf")
        val bytes: ByteArray
        try {
            require(request.responseCode == 200)
            require(request.getHeaderField("Content-Type")?.substringBefore(';')?.trim() == "application/pdf")
            require(request.getHeaderField("Content-Disposition") == "attachment; filename=\"" + name + "\"")
            require(request.contentLengthLong == PDF_BYTES.toLong())
            bytes = request.inputStream.use { input -> input.readBytesBounded(PDF_BYTES + 1) }
            require(bytes.size == PDF_BYTES && sha(bytes) == PDF_SHA)
            BoundaryPolicy.readPDF(bytes.inputStream())
        } finally { request.disconnect() }
        require(Build.VERSION.SDK_INT >= 29)
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/CareerFinder-" + testID)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val target = checkNotNull(resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values))
        try {
            android.os.ParcelFileDescriptor.AutoCloseOutputStream(checkNotNull(resolver.openFileDescriptor(target, "w"))).use { output ->
                output.write(bytes); output.fd.sync()
            }
            require(resolver.update(target, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null) == 1)
            val stored = checkNotNull(resolver.openInputStream(target)).use { it.readBytesBounded(PDF_BYTES + 1) }
            require(stored.contentEquals(bytes))
            durableJSON(File(directory, "document-" + name + ".json"), JSONObject().put("schemaVersion", 1)
                .put("testID", testID).put("filename", name).put("bytes", bytes.size).put("sha256", sha(bytes))
                .put("mediaStoreURI", target.toString()).put("realPickerSelectionRequired", true)
                .put("transport", "default TLS; exact private document route; no bearer/cookie/bridge capability"))
        } finally { bytes.fill(0) }
        return target
    }

    private fun java.io.InputStream.readBytesBounded(limit: Int): ByteArray {
        val output = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(4096)
        while (output.size() <= limit) {
            val n = read(buffer, 0, minOf(buffer.size, limit + 1 - output.size()))
            if (n < 0) return output.toByteArray()
            if (n > 0) output.write(buffer, 0, n)
        }
        error("Bounded private read exceeded")
    }

    fun checkpoint(name: String, model: CareerViewModel): JSONObject {
        require(nextSequence in 1..CHECKPOINTS.size && CHECKPOINTS[nextSequence - 1] == name)
        val sequence = nextSequence
        val prefix = String.format(Locale.ROOT, "%03d", sequence)
        val witness = witness(sequence, name, model)
        durableJSON(File(directory, prefix + "-android-witness.json"), witness)
        val request = JSONObject().put("schemaVersion", 1).put("testID", testID).put("sequence", sequence).put("checkpoint", name)
        val responseFile = File(directory, prefix + "-response.json")
        require(!responseFile.exists())
        val requestBytes = (request.toString(2) + "\n").toByteArray(Charsets.UTF_8)
        val witnessBytes = protectedRead(File(directory, prefix + "-android-witness.json"), 2_097_152)
        val start = SystemClock.elapsedRealtime()
        val startNanos = SystemClock.elapsedRealtimeNanos()
        val deadline = start + 5000
        durableJSON(File(directory, prefix + "-publication.json"), JSONObject().put("schemaVersion", 1)
            .put("testID", testID).put("sequence", sequence).put("checkpoint", name).put("process", process())
            .put("uiBudgetStartedElapsedMillis", start).put("uiBudgetStartedElapsedNanos", startNanos)
            .put("uiDeadlineElapsedMillis", deadline)
            .put("witnessFinishedElapsedNanos", witness.getJSONObject("observation").getLong("finishedElapsedNanos"))
            .put("requestSHA256", sha(requestBytes)).put("witnessSHA256", sha(witnessBytes))
            .put("publicationOrder", "ciphertexts_then_witness_then_budget_marker_then_request_last"))
        durableBytes(File(directory, prefix + "-request.json"), requestBytes)
        while (SystemClock.elapsedRealtime() < deadline && !Files.exists(responseFile.toPath(), LinkOption.NOFOLLOW_LINKS))
            SystemClock.sleep(minOf(20, (deadline - SystemClock.elapsedRealtime()).coerceAtLeast(1)))
        require(SystemClock.elapsedRealtime() < deadline) { "Private checkpoint exceeded its original five-second deadline" }
        val response = JSONObject(strictUTF8(protectedRead(responseFile, 16384)))
        require(SystemClock.elapsedRealtime() < deadline) { "A late checkpoint response is never accepted" }
        require(response.keys().asSequence().toSet() == setOf("schemaVersion", "testID", "sequence", "checkpoint", "ok", "facts"))
        require(response.get("schemaVersion") is Int && response.get("sequence") is Int &&
            response.get("testID") is String && response.get("checkpoint") is String &&
            response.get("ok") is Boolean && response.get("facts") is JSONObject)
        require(response.getInt("schemaVersion") == 1 && response.getString("testID") == testID &&
            response.getInt("sequence") == sequence && response.getString("checkpoint") == name && response.getBoolean("ok"))
        val facts = response.getJSONObject("facts")
        val required = setOf("zeroDispatch", "sourceAndOwnerBound", "profileRevision", "resumeName", "resumeSHA256", "jobCount", "attemptCount")
        val optional = setOf("planID", "attemptID", "jobID", "immutableAUnchanged", "pickerCancelUnchanged", "persistedRestartUnchanged", "followUpDay")
        require(facts.keys().asSequence().toSet().containsAll(required) && facts.keys().asSequence().all { it in required + optional })
        require(facts.get("zeroDispatch") is Boolean && facts.get("sourceAndOwnerBound") is Boolean &&
            facts.getBoolean("zeroDispatch") && facts.getBoolean("sourceAndOwnerBound"))
        for (key in listOf("profileRevision", "jobCount", "attemptCount")) {
            val number = facts.get(key)
            require((number is Int || number is Long) && facts.getLong(key) in 0..Int.MAX_VALUE.toLong())
        }
        require((facts.get("resumeName") == JSONObject.NULL || facts.get("resumeName") is String) &&
            (facts.get("resumeSHA256") == JSONObject.NULL || facts.get("resumeSHA256") is String))
        require(facts.getInt("profileRevision") == model.state.value.profile.revision)
        require((if (facts.isNull("resumeName")) null else facts.getString("resumeName")) == model.state.value.profile.resume?.name)
        require((if (facts.isNull("resumeSHA256")) null else facts.getString("resumeSHA256")) == model.state.value.profile.resume?.sha256)
        for (key in optional.intersect(facts.keys().asSequence().toSet())) {
            val value = facts.get(key)
            if (key in setOf("immutableAUnchanged", "pickerCancelUnchanged", "persistedRestartUnchanged")) {
                require(value is Boolean && value)
            } else require(value is String && value.isNotEmpty() && value.length <= 256 &&
                BoundaryPolicy.validUnicode(value) && value.none { it.code < 32 || it.code == 127 })
        }
        require(SystemClock.elapsedRealtime() < deadline) { "Checkpoint validation completed after its original deadline" }
        nextSequence++
        println("NATIVE_JOURNEY_CHECKPOINT sequence=" + sequence + " name=" + name + " accepted=true elapsedMillis=" + (SystemClock.elapsedRealtime() - start))
        return facts
    }

    fun witness(sequence: Int, checkpoint: String, model: CareerViewModel): JSONObject {
        val start = SystemClock.elapsedRealtimeNanos()
        val current = model.state.value
        require(current.connection == connection && current.privateScope == "workspace-" + workspaceKey)
        val prefix = String.format(Locale.ROOT, "%03d", sequence)
        val storage = JSONObject()
        for ((kind, name) in listOf("connection" to "connection", "workspace" to current.privateScope, "search" to "search-" + workspaceKey)) {
            val file = File(context.noBackupFilesDir, "career-private/" + name + ".enc")
            if (!Files.exists(file.toPath(), LinkOption.NOFOLLOW_LINKS)) {
                require(kind != "connection")
                storage.put(kind, JSONObject.NULL); continue
            }
            val before = protectedRead(file, 2_097_152)
            val value = checkNotNull(vault.read(name))
            val after = protectedRead(file, 2_097_152)
            require(before.contentEquals(after)) { "Durable store changed during the single witness read" }
            val meta = JSONObject().put("recordName", name).put("bytes", before.size).put("sha256", sha(before))
                .put("evidenceFile", prefix + "-" + kind + ".enc")
            if (kind == "connection") require(Connection.fromJson(value) == connection)
            else {
                if (kind == "workspace") WorkspaceStorage.decode(value, connection, current.privateScope)
                else DiscoverySnapshotCodec.decode(value)
                meta.put("value", value).put("canonicalSHA256", sha(canonical(value).toByteArray(Charsets.UTF_8)))
            }
            durableBytes(File(directory, prefix + "-" + kind + ".enc"), before)
            storage.put(kind, meta)
        }
        val discovery = model.discovery.state.value
        val live = JSONObject().put("loaded", current.loaded).put("busy", current.busy).put("storageBlocked", current.storageBlocked)
            .put("requiresPairing", current.requiresPairing).put("privateScope", current.privateScope).put("profileDirty", current.profileDirty)
            .put("profile", current.profile.privateJson()).put("receiptIDs", JSONArray(current.receipts.map { it.id }))
            .put("activePlanIDs", JSONArray(current.activePlans)).put("selectedIDs", JSONArray(current.selected.toList().sorted()))
            .put("planID", current.plan?.id ?: JSONObject.NULL).put("recordEditorOpen", current.applicationRecordEditor != null)
            .put("errorPresent", current.error != null).put("testService", current.testService).put("liveEnabled", current.liveEnabled)
            .put("discovery", JSONObject().put("filters", filters(discovery.filters)).put("status", discovery.status ?: JSONObject.NULL)
                .put("loading", discovery.loading).put("restoredSearch", discovery.restoredSearch).put("errorPresent", discovery.error != null)
                .put("jobs", JSONArray(discovery.jobs.map { JSONObject().put("id", it.id).put("sourceID", it.sourceId)
                    .put("url", it.url).put("stale", it.stale) }))
                .put("sources", JSONArray(discovery.sources.map { JSONObject().put("id", it.id).put("status", it.status)
                    .put("checkedAt", it.checkedAt ?: JSONObject.NULL).put("errorPresent", it.error != null) })))
        return JSONObject().put("schemaVersion", 1).put("platform", "android").put("testID", testID)
            .put("sequence", sequence).put("checkpoint", checkpoint).put("language", language)
            .put("observation", JSONObject().put("startedElapsedNanos", start).put("finishedElapsedNanos", SystemClock.elapsedRealtimeNanos())
                .put("wallTime", Instant.now().toString()).put("sequentialNotAtomicUIAndDisk", true))
            .put("process", process()).put("source", source)
            .put("scope", JSONObject().put("origin", connection.origin).put("workspaceID", connection.workspaceId)
                .put("workspaceKey", workspaceKey).put("nativeTokenSHA256", sha(connection.token.toByteArray(Charsets.UTF_8))))
            .put("storage", storage).put("live", live)
    }

    private fun filters(value: DiscoveryFilters) = JSONObject().put("query", value.query).put("location", value.location)
        .put("remoteOnly", value.remoteOnly).put("sources", JSONArray(value.sources))

    fun finishFirstProcess() {
        require(phase == "first" && nextSequence == 15)
        durableJSON(File(directory, "first-process-complete.json"), JSONObject().put("schemaVersion", 1).put("testID", testID)
            .put("process", process()).put("lastCheckpoint", 14).put("expectedNextCheckpoint", 15)
            .put("beforeOnStopCiphertextsAreNotClaimedStable", true).put("source", source))
    }

    fun finishRestoreProcess() {
        require(phase == "restore" && nextSequence == 17)
        durableJSON(File(directory, "restore-process-complete.json"), JSONObject().put("schemaVersion", 1).put("testID", testID)
            .put("process", process()).put("lastCheckpoint", 16).put("initialPostStopCiphertexts", JSONObject(initialRecordHashes.toMap()))
            .put("noReseed", true).put("source", source))
    }

    fun durableJSON(file: File, value: JSONObject) = durableBytes(file, (value.toString(2) + "\n").toByteArray(Charsets.UTF_8))

    fun durableBytes(file: File, bytes: ByteArray) {
        require(file.parentFile == directory && file.name.matches(Regex("[A-Za-z0-9_.-]{1,150}")) && bytes.size <= 8_388_608)
        ownedDirectory(directory, create = false)
        require(!Files.exists(file.toPath(), LinkOption.NOFOLLOW_LINKS)) { "Never overwrite retained native evidence" }
        val temporary = File(directory, "." + file.name + ".writing")
        val descriptor = Os.open(temporary.path, OsConstants.O_WRONLY or OsConstants.O_CREAT or OsConstants.O_EXCL or OsConstants.O_NOFOLLOW, 384)
        FileOutputStream(descriptor).use { output -> output.write(bytes); output.fd.sync() }
        require(!Files.exists(file.toPath(), LinkOption.NOFOLLOW_LINKS))
        Files.move(temporary.toPath(), file.toPath(), StandardCopyOption.ATOMIC_MOVE)
        val directoryFD = Os.open(directory.path, OsConstants.O_RDONLY or OsConstants.O_DIRECTORY or OsConstants.O_NOFOLLOW, 0)
        try { Os.fsync(directoryFD) } finally { Os.close(directoryFD) }
    }

    private fun ownedDirectory(file: File, create: Boolean) {
        if (!Files.exists(file.toPath(), LinkOption.NOFOLLOW_LINKS)) {
            require(create && file.mkdir())
            Os.chmod(file.path, 448)
        }
        val status = Os.lstat(file.path)
        require(OsConstants.S_ISDIR(status.st_mode) && status.st_uid == Process.myUid() && (status.st_mode and 511) == 448)
    }

    fun protectedRead(file: File, maximumBytes: Int): ByteArray {
        val before = Os.lstat(file.path)
        require(OsConstants.S_ISREG(before.st_mode) && before.st_uid == Process.myUid() &&
            (before.st_mode and 63) == 0 && before.st_size in 1..maximumBytes.toLong())
        val descriptor = Os.open(file.path, OsConstants.O_RDONLY or OsConstants.O_NOFOLLOW, 0)
        val bytes = FileInputStream(descriptor).use { input ->
            val opened = Os.fstat(descriptor)
            require(opened.st_dev == before.st_dev && opened.st_ino == before.st_ino && opened.st_size == before.st_size)
            input.readBytesBounded(maximumBytes)
        }
        val after = Os.lstat(file.path)
        require(before.st_dev == after.st_dev && before.st_ino == after.st_ino && before.st_size == after.st_size &&
            before.st_mtime == after.st_mtime && bytes.size.toLong() == after.st_size)
        return bytes
    }
}
