package com.saleh.careerfinder

import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest
import java.time.Instant
import java.util.Base64

internal const val HISTORICAL_TEXT_NOTICE = "Some historical text contains incomplete characters. Its original values are preserved. Export the recovery record before repairing affected fields; affected reviews cannot be approved or continued."
internal const val HISTORICAL_BACKUP_NOTICE = "This workspace contains historical text that an ordinary phone backup cannot preserve. Export the recovery record instead. Your phone data is unchanged."

/** One acknowledgment is retained even when its following read is interrupted. Never replay its mutation. */
class ReadAfterMutationFailure(val operation: JSONObject, val recovery: ReadRecoveryRequest?, cause: Throwable) :
    Exception("The service acknowledged this action, but its updated records could not be loaded. Refresh to read the current outcome; do not repeat the action.", cause)

class ReadRecoveryRequired(val recovery: ReadRecoveryRequest, cause: Throwable? = null) :
    Exception("This historical workspace needs a recovery export before it can be opened on this phone. Your earlier phone data is intact.", cause)

data class ReadRecoveryRequest(val origin: String, val workspaceId: String, val metadata: JSONObject) {
    val cursor: String get() = metadata.getString("exportCursor")
}

internal data class VerifiedReadDocument(val metadata: JSONObject, val bytes: ByteArray, val legacyStrings: Set<String>)
internal class CareerReadResponse(source: JSONObject, val document: VerifiedReadDocument) :
    JSONObject(source, source.keys().asSequence().toList().toTypedArray())

/** Shared pure text codec. Only unpaired UTF-16 units are escaped; ordinary text stays byte-for-byte equivalent. */
internal object HistoricalText {
    private val forbidden = setOf("id", "accountId", "workspaceId", "jobId", "planId", "digest", "sha256", "payloadHash",
        "resumeSHA256", "sessionToken", "token", "state", "status", "url", "website", "linkedin", "privacyPolicyUrl", "origin")

    private fun allowedPath(kind: String, path: List<Any>): Boolean {
        fun index(value: Any?) = value is Number && value.toDouble() >= 0 && value.toDouble() == value.toInt().toDouble()
        fun profile(p: List<Any>) = p.size == 1 && p[0] in setOf("firstName", "lastName", "email", "phone", "city", "headline") ||
            p.size == 2 && (p[0] in setOf("skills", "targetRoles") && index(p[1]) || p[0] == "resume" && p[1] == "name")
        fun job(p: List<Any>) = p.size == 1 && p[0] in setOf("title", "company", "location", "sourceName", "summary", "reason")
        fun receipt(p: List<Any>) = p.size == 1 && p[0] in setOf("title", "company", "resumeName", "applicationId", "requirementsRevision") ||
            p.size == 2 && p[0] == "error" && p[1] == "message"
        fun plan(p: List<Any>): Boolean {
            if (p.size < 3 || p[0] != "items" || !index(p[1])) return false
            val rest = p.drop(2)
            return rest.size == 1 && rest[0] in setOf("title", "company", "reason", "applicationId", "requirementsRevision") ||
                rest.size == 2 && (rest[0] == "job" && job(rest.drop(1)) ||
                    rest[0] == "payloadSummary" && rest[1] in setOf("name", "email", "phone", "comments") ||
                    rest[0] == "resume" && rest[1] == "name")
        }
        if (path.isEmpty()) return false
        if (kind == "workspace") return when {
            path[0] == "profile" -> profile(path.drop(1))
            path.size >= 2 && path[0] == "jobs" && index(path[1]) -> job(path.drop(2))
            path.size >= 2 && path[0] == "attempts" && index(path[1]) -> receipt(path.drop(2))
            path.size >= 2 && path[0] == "recoverablePlans" && index(path[1]) -> plan(path.drop(2))
            else -> false
        }
        return kind == "profile" && path[0] == "profile" && profile(path.drop(1)) ||
            kind == "job" && path[0] == "job" && job(path.drop(1)) ||
            kind in setOf("plan", "plan-state") && path[0] == "plan" && plan(path.drop(1)) ||
            kind == "plan-state" && path.size >= 2 && path[0] == "attempts" && index(path[1]) && receipt(path.drop(2)) ||
            kind == "receipts" && path.size >= 2 && path[0] == "receipts" && index(path[1]) && receipt(path.drop(2))
    }

    fun display(value: String): String {
        if (BoundaryPolicy.validUnicode(value)) return value
        val result = StringBuilder()
        var index = 0
        while (index < value.length) {
            val unit = value[index]
            if (unit.isHighSurrogate() && index + 1 < value.length && value[index + 1].isLowSurrogate()) {
                result.append(unit).append(value[index + 1]); index += 2
            } else {
                if (unit.isSurrogate()) result.append("\\u").append(unit.code.toString(16).uppercase().padStart(4, '0'))
                else result.append(unit)
                index++
            }
        }
        return result.toString()
    }

    fun rawBytes(value: String): ByteArray = ByteArray(value.length * 2).also { bytes ->
        value.forEachIndexed { index, character -> bytes[index * 2] = character.code.toByte(); bytes[index * 2 + 1] = (character.code ushr 8).toByte() }
    }
    fun rawString(encoded: String): String {
        val bytes = canonicalBase64(encoded, CareerReadTransport.MAX_ASSEMBLY_BYTES)
        require(bytes.isNotEmpty() && bytes.size % 2 == 0) { "Invalid historical text evidence." }
        return CharArray(bytes.size / 2) { index ->
            ((bytes[index * 2].toInt() and 255) or ((bytes[index * 2 + 1].toInt() and 255) shl 8)).toChar()
        }.concatToString().also { require(!BoundaryPolicy.validUnicode(it)) { "Historical text evidence does not contain an incomplete character." } }
    }

    fun canonicalBase64(value: String, maximum: Int): ByteArray {
        require(value.length.toLong() <= ((maximum.toLong() + 2) / 3) * 4 && value.length % 4 == 0)
        require(value.all { it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9' || it == '+' || it == '/' || it == '=' })
        val decoded = Base64.getDecoder().decode(value)
        require(decoded.size <= maximum && Base64.getEncoder().encodeToString(decoded) == value)
        return decoded
    }

    fun requireWellFormed(value: Any?, depth: Int = 0) {
        require(depth <= 64) { "The data is nested too deeply." }
        when (value) {
            is String -> require(BoundaryPolicy.validUnicode(value)) { "Correct incomplete characters before sending this information. Your historical records are preserved." }
            is JSONObject -> value.keys().asSequence().forEach { key ->
                requireWellFormed(key, depth + 1); requireWellFormed(value.opt(key), depth + 1)
            }
            is JSONArray -> (0 until value.length()).forEach { requireWellFormed(value.opt(it), depth + 1) }
        }
    }

    fun malformedStrings(value: Any?, depth: Int = 0): Set<String> {
        require(depth <= 64)
        return when (value) {
            is String -> if (BoundaryPolicy.validUnicode(value)) emptySet() else setOf(value)
            is JSONObject -> value.keys().asSequence().flatMap { malformedStrings(value.opt(it), depth + 1).asSequence() }.toSet()
            is JSONArray -> (0 until value.length()).flatMap { malformedStrings(value.opt(it), depth + 1) }.toSet()
            else -> emptySet()
        }
    }

    /** The returned object contains original code units. Mutation bodies still must pass requireWellFormed. */
    fun restore(data: JSONObject, entries: JSONArray, authorityPaths: Boolean = true, kind: String = "workspace"): Pair<JSONObject, Set<String>> {
        requireWellFormed(data)
        fun copy(item: Any?): Any? = when (item) {
            is JSONObject -> JSONObject().apply { item.keys().asSequence().forEach { put(it, copy(item.opt(it))) } }
            is JSONArray -> JSONArray().apply { (0 until item.length()).forEach { put(copy(item.opt(it))) } }
            else -> item
        }
        // Copy containers, not complete JSON text/UTF-8 representations. String values are immutable.
        val output = copy(data) as JSONObject
        val seen = mutableSetOf<String>()
        val originals = mutableSetOf<String>()
        for (index in 0 until entries.length()) {
            val entry = entries.getJSONObject(index)
            require(entry.keys().asSequence().toSet() == setOf("path", "utf16leBase64"))
            val path = entry.getJSONArray("path")
            require(path.length() in 1..64)
            if (authorityPaths) require(allowedPath(kind, (0 until path.length()).map { path.get(it) }))
            require(seen.add(path.toString())) { "Repeated historical text evidence." }
            var parent: Any = output
            for (step in 0 until path.length() - 1) parent = child(parent, path.opt(step))
            val key = path.opt(path.length() - 1)
            if (key is String) require(key !in forbidden) { "Historical identity fields need a raw recovery export." }
            val shown = child(parent, key)
            require(shown is String)
            val raw = rawString(entry.getString("utf16leBase64"))
            require(display(raw) == shown) { "Historical text evidence does not match its displayed field." }
            when (parent) {
                is JSONObject -> parent.put(key as String, raw)
                is JSONArray -> parent.put(numberIndex(key), raw)
                else -> error("Invalid historical text path.")
            }
            originals += raw
        }
        return output to originals
    }

    private fun numberIndex(value: Any?): Int {
        require(value is Number && value.toDouble().isFinite() && value.toDouble() >= 0 &&
            value.toDouble() <= Int.MAX_VALUE && value.toDouble() == value.toInt().toDouble())
        return value.toInt()
    }
    private fun child(parent: Any, key: Any?): Any = when (parent) {
        is JSONObject -> { require(key is String && parent.has(key) && key !in setOf("__proto__", "prototype", "constructor")); parent.get(key) }
        is JSONArray -> { val index = numberIndex(key); require(index < parent.length()); parent.get(index) }
        else -> error("Historical text path is not a container.")
    }

    /** Local ciphertext stores a well-formed projection and exact sidecar, never lossy UTF-8. */
    fun project(value: JSONObject, allowed: Set<String>): Pair<JSONObject, JSONArray> {
        val entries = JSONArray()
        fun walk(item: Any?, path: List<Any>, depth: Int): Any? {
            require(depth <= 64)
            return when (item) {
                is String -> if (BoundaryPolicy.validUnicode(item)) item else {
                    require(item in allowed) { "A draft contains an incomplete character. Correct it before saving; the earlier file is kept." }
                    entries.put(JSONObject().put("path", JSONArray(path)).put("utf16leBase64", Base64.getEncoder().encodeToString(rawBytes(item))))
                    display(item)
                }
                is JSONObject -> JSONObject().apply { item.keys().asSequence().forEach { key ->
                    require(BoundaryPolicy.validUnicode(key)); put(key, walk(item.opt(key), path + key, depth + 1))
                } }
                is JSONArray -> JSONArray().apply { (0 until item.length()).forEach { put(walk(item.opt(it), path + it, depth + 1)) } }
                else -> item
            }
        }
        return walk(value, emptyList(), 0) as JSONObject to entries
    }
}

internal object CareerReadTransport {
    const val MAX_FRAME_BYTES = 6 * 1024 * 1024
    const val MAX_FRAGMENT_BYTES = 4 * 1024 * 1024
    const val MAX_ASSEMBLY_BYTES = 64 * 1024 * 1024
    private val kinds = setOf("workspace", "profile", "job", "plan", "plan-state", "receipts")
    private val uuid = Regex("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")
    private val isoMillis = Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z")
    fun expectedKind(route: String): String? = when (route) {
        "workspace" -> "workspace"
        "profile" -> "profile"
        "jobs" -> "job"
        "prepare" -> "plan"
        "submit", "advance", "stop" -> "plan-state"
        "receipts" -> "receipts"
        else -> null
    }
    private val immutable = listOf("version", "kind", "accountId", "workspaceId", "asOf", "expiresAt", "sha256", "totalBytes", "exportCursor")

    fun utf8(raw: ByteArray): String = Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
        .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(raw)).toString()

    fun cursor(value: String): String {
        require(value.length in 1..2048 && value.all { it.code in 0x21..0x7e })
        return value
    }

    fun validateMetadata(value: JSONObject, expectedWorkspace: String): JSONObject {
        HistoricalText.requireWellFormed(value)
        require(value.toString().toByteArray(Charsets.UTF_8).size <= 16 * 1024)
        require(value.keys().asSequence().toSet() == setOf("version", "kind", "accountId", "workspaceId", "asOf", "expiresAt", "sha256", "totalBytes", "offset", "byteLength", "nextCursor", "exportCursor"))
        require(value.opt("version") == 2 && value.opt("kind") in kinds && value.opt("workspaceId") == expectedWorkspace && expectedWorkspace.matches(uuid))
        val account = value.opt("accountId")
        require(account is String && account.isNotBlank() && account.length <= 250)
        val hash = value.opt("sha256")
        require(hash is String && hash.matches(Regex("[a-f0-9]{64}")))
        require(value.getString("asOf").matches(isoMillis) && value.getString("expiresAt").matches(isoMillis))
        val asOf = Instant.parse(value.getString("asOf")); val expires = Instant.parse(value.getString("expiresAt"))
        require(java.time.Duration.between(asOf, expires).toMillis() == 300_000L)
        require(value.opt("exportCursor") is String)
        cursor(value.getString("exportCursor"))
        val total = integer(value, "totalBytes", 1, Long.MAX_VALUE)
        val offset = integer(value, "offset", 0, total - 1)
        val length = integer(value, "byteLength", 1, MAX_FRAGMENT_BYTES.toLong())
        require(offset % MAX_FRAGMENT_BYTES == 0L && length <= total - offset)
        val following = value.opt("nextCursor")
        if (offset + length == total) require(following == JSONObject.NULL)
        else { require(following is String && length == MAX_FRAGMENT_BYTES.toLong()); cursor(following) }
        return JSONObject(value.toString())
    }

    private fun integer(value: JSONObject, key: String, minimum: Long, maximum: Long): Long {
        val number = value.opt(key)
        require(number is Number && number.toDouble().isFinite() && number.toDouble() >= minimum.toDouble() &&
            number.toDouble() <= maximum.toDouble() && number.toDouble() <= 9_007_199_254_740_991.0 &&
            number.toDouble() == number.toLong().toDouble())
        return number.toLong()
    }

    fun operation(value: JSONObject?, route: String, workspace: String?, requestBody: JSONObject? = null): JSONObject? {
        if (value == null) return null
        HistoricalText.requireWellFormed(value)
        require(value.toString().toByteArray(Charsets.UTF_8).size <= 16 * 1024)
        require(value.opt("acknowledged") == true && value.opt("kind") == route)
        require(value.opt("accountId") is String && value.getString("accountId").isNotBlank() && value.getString("accountId").length <= 250)
        require(value.opt("workspaceId") is String && value.getString("workspaceId").matches(uuid) && (workspace == null || value.getString("workspaceId") == workspace))
        val base = setOf("kind", "acknowledged", "accountId", "workspaceId")
        val additional = when (route) {
            "workspace", "session/revoke" -> emptySet()
            "profile" -> { integer(value, "revision", 0, Long.MAX_VALUE); setOf("revision") }
            "jobs" -> { require(value.opt("jobId") is String && value.getString("jobId").matches(uuid)); setOf("jobId") }
            "prepare", "submit", "advance", "stop" -> {
                require(value.opt("planId") is String && value.getString("planId").matches(uuid))
                require(value.opt("digest") is String && value.getString("digest").matches(Regex("[a-f0-9]{64}")))
                setOf("planId", "digest")
            }
            "session" -> {
                require(value.opt("sessionToken") is String && value.getString("sessionToken").matches(Regex("[a-f0-9]{64}")))
                require(value.getString("expiresAt").matches(isoMillis)); Instant.parse(value.getString("expiresAt")); setOf("sessionToken", "expiresAt")
            }
            else -> error("Unexpected mutation acknowledgment.")
        }
        require(value.keys().asSequence().toSet() == base + additional)
        if (requestBody != null) {
            if (route == "profile") {
                val expected = integer(requestBody, "expectedRevision", 0, 9_007_199_254_740_990L)
                require(integer(value, "revision", 0, Long.MAX_VALUE) == expected + 1)
            }
            if (route in setOf("submit", "advance", "stop")) require(value.opt("planId") == requestBody.opt("planId"))
            if (route == "submit") require(value.opt("digest") == requestBody.opt("digest"))
        }
        return JSONObject(value.toString())
    }

    fun validateMutationView(value: JSONObject, operation: JSONObject?, requestBody: JSONObject?) {
        if (operation == null) return
        when (operation.getString("kind")) {
            "profile" -> require(value.getJSONObject("profile").opt("revision") == operation.opt("revision"))
            "jobs" -> {
                val job = value.getJSONObject("job")
                require(job.opt("id") == operation.opt("jobId"))
                requestBody?.getString("url")?.let { requested ->
                    require(BoundaryPolicy.jobIdentity(job.getString("url")) == BoundaryPolicy.jobIdentity(requested))
                }
            }
            "prepare", "submit", "advance", "stop" -> {
                val plan = value.getJSONObject("plan")
                require(plan.opt("id") == operation.opt("planId") && plan.opt("digest") == operation.opt("digest"))
            }
            "workspace" -> require(value.opt("workspaceId") == operation.opt("workspaceId"))
        }
    }

    suspend fun assemble(origin: String, workspace: String, initial: JSONObject,
        follow: suspend (String) -> JSONObject): CareerReadResponse {
        val metadata = validateMetadata(initial.getJSONObject("read"), workspace)
        val recovery = ReadRecoveryRequest(origin, workspace, metadata)
        val total = integer(metadata, "totalBytes", 1, Long.MAX_VALUE)
        val runtime = Runtime.getRuntime()
        val available = runtime.maxMemory() - (runtime.totalMemory() - runtime.freeMemory())
        // Reserve room for decoded strings/containers and the existing coherent workspace.
        // Lower-memory phones use the complete streaming recovery path instead of risking their old state.
        if (total > MAX_ASSEMBLY_BYTES || total > (available - 8L * 1024 * 1024).coerceAtLeast(0) / 6) throw ReadRecoveryRequired(recovery)
        val output = ByteArray(total.toInt())
        var filled = 0
        val digest = MessageDigest.getInstance("SHA-256")
        var frame = initial
        var count = 0
        while (true) {
            currentCoroutineContext().ensureActive()
            require(++count <= (MAX_ASSEMBLY_BYTES + MAX_FRAGMENT_BYTES - 1) / MAX_FRAGMENT_BYTES)
            require(frame.opt("ok") == true && frame.keys().asSequence().toSet() == setOf("ok", "read", "payloadBase64", "operation"))
            val next = validateMetadata(frame.getJSONObject("read"), workspace)
            require(immutable.all { next.opt(it) == metadata.opt(it) }) { "The workspace changed during its read." }
            require(integer(next, "offset", 0, total) == filled.toLong())
            val length = integer(next, "byteLength", 1, MAX_FRAGMENT_BYTES.toLong()).toInt()
            val payload = HistoricalText.canonicalBase64(frame.getString("payloadBase64"), MAX_FRAGMENT_BYTES)
            require(payload.size == length && length.toLong() <= total - filled)
            payload.copyInto(output, filled); filled += payload.size; digest.update(payload)
            val cursor = next.opt("nextCursor")
            if (filled.toLong() == total) { require(cursor == JSONObject.NULL); break }
            require(cursor is String && length == MAX_FRAGMENT_BYTES)
            frame = follow(cursor(cursor))
            require(frame.opt("operation") == JSONObject.NULL) { "A following read must not acknowledge another action." }
        }
        val bytes = output
        val hash = digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
        require(hash == metadata.getString("sha256")) { "The historical workspace checksum did not match." }
        val document = JSONObject(utf8(bytes))
        require(document.opt("documentVersion") == 1)
        HistoricalText.requireWellFormed(document)
        if (document.opt("mode") == "raw-recovery") {
            require(document.keys().asSequence().toSet() == setOf("documentVersion", "mode", "reasonCode", "originalJSONBase64"))
            require(document.opt("reasonCode") in setOf("malformed_object_key", "malformed_url_or_control"))
            require(document.opt("originalJSONBase64") is String)
            val encoded = document.getString("originalJSONBase64")
            require(encoded.isNotEmpty() && encoded.length % 4 == 0)
            val padding = encoded.takeLast(2).count { it == '=' }
            require((0 until encoded.length - padding).all { index -> encoded[index].let { it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9' || it == '+' || it == '/' } })
            HistoricalText.canonicalBase64(encoded.takeLast(4), 3)
            throw ReadRecoveryRequired(recovery)
        }
        require(document.opt("mode") == "view" && document.keys().asSequence().toSet() == setOf("documentVersion", "mode", "data", "legacyText"))
        val (data, originals) = HistoricalText.restore(document.getJSONObject("data"), document.getJSONArray("legacyText"), kind = metadata.getString("kind"))
        require(data.opt("ok") == true)
        return CareerReadResponse(data, VerifiedReadDocument(metadata, bytes, originals))
    }
}
