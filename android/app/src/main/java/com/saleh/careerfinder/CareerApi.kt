package com.saleh.careerfinder

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.URL
import java.net.URLEncoder
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.launch
import kotlin.coroutines.CoroutineContext
import javax.net.ssl.HttpsURLConnection

object ServicePages {
    const val DEFAULT_ORIGIN = "https://career-finder-service.jazzy-drake-8323.chatgpt.site"
    fun initialOrigin(connection: Connection?): String = connection?.origin ?: DEFAULT_ORIGIN
    fun url(origin: String, page: String): String {
        require(page in setOf("connect", "privacy", "support", "account"))
        return BoundaryPolicy.serviceOrigin(origin.trim()) + "/" + page
    }
}

data class Connection(val origin: String, val workspaceId: String, val token: String, val expiresAt: String,
    val legacyOrigins: Set<String> = emptySet(), val accountId: String? = null) {
    fun toJson() = JSONObject().put("origin", origin).put("workspaceId", workspaceId).put("token", token).put("expiresAt", expiresAt)
        .put("legacyOrigins", org.json.JSONArray(legacyOrigins.toList())).apply { accountId?.let { put("accountId", it) } }
    fun legacyKeys(): Set<String> {
        val canonical = BoundaryPolicy.serviceOrigin(origin)
        val candidates = legacyOrigins + origin + if (java.net.URI(canonical).port == -1) setOf(canonical + ":443") else emptySet()
        return candidates.filter { BoundaryPolicy.serviceOrigin(it) == canonical }.map {
            BoundaryPolicy.legacyWorkspaceKey(it, workspaceId)
        }.filter { it != BoundaryPolicy.workspaceKey(canonical, workspaceId) }.toSet()
    }
    companion object {
        fun fromJson(value: JSONObject): Connection {
            listOf("origin", "workspaceId", "token", "expiresAt").forEach { require(value.opt(it) is String) { "The saved connection is invalid. Its file is preserved." } }
            val raw = value.getString("origin")
            val canonical = BoundaryPolicy.serviceOrigin(raw)
            val aliases = if (value.has("legacyOrigins")) value.requiredStrings("legacyOrigins").toSet() else emptySet()
            require(aliases.all { BoundaryPolicy.serviceOrigin(it) == canonical })
            require(!value.has("accountId") || value.opt("accountId") is String)
            val account = if (value.has("accountId")) value.getString("accountId").also {
                require(it.isNotBlank() && it.length <= 250 && BoundaryPolicy.validUnicode(it))
            } else null
            return Connection(canonical, value.getString("workspaceId"), value.getString("token"), value.getString("expiresAt"),
                (aliases + BoundaryPolicy.legacyServiceOrigin(raw)).filter { it != canonical }.toSet(), account)
        }
    }
}

class ApiFailure(val status: Int, val code: String, override val message: String) : Exception(message)

interface CareerService {
    suspend fun pair(origin: String, code: String): Connection
    suspend fun request(connection: Connection, method: String, route: String, body: JSONObject? = null): JSONObject
    suspend fun requestWithAcknowledgment(connection: Connection, method: String, route: String, body: JSONObject?,
        acknowledged: (JSONObject) -> Unit): JSONObject = request(connection, method, route, body)
}

object HttpsCareerService : CareerService {
    override suspend fun pair(origin: String, code: String) = CareerApi.pair(origin, code)
    override suspend fun request(connection: Connection, method: String, route: String, body: JSONObject?) =
        CareerApi(connection).request(method, route, body)
    override suspend fun requestWithAcknowledgment(connection: Connection, method: String, route: String, body: JSONObject?,
        acknowledged: (JSONObject) -> Unit) = CareerApi(connection).request(method, route, body, acknowledged)
}

/** Read snapshots may restart once; acknowledged mutations are never retried. No redirects or cookies. */
class CareerApi(private val connection: Connection) {
    suspend fun request(method: String, route: String, body: JSONObject? = null,
        acknowledged: (JSONObject) -> Unit = {}): JSONObject =
        call(connection.origin, connection.token, connection.workspaceId, connection.accountId, method, route, body, acknowledged)

    companion object {
        suspend fun pair(origin: String, code: String): Connection {
            val base = BoundaryPolicy.serviceOrigin(origin.trim())
            require(code.trim().isNotEmpty()) { "Enter the one-time pairing code from your service." }
            val response = call(base, null, null, null, "POST", "session", JSONObject().put("pairingCode", code.trim()))
            val token = response.getString("sessionToken")
            val workspace = response.getString("workspaceId")
            require(token.isNotBlank() && workspace.isNotBlank()) { "The service did not return a valid private session." }
            return Connection(base, workspace, token, response.getString("expiresAt"),
                setOf(BoundaryPolicy.legacyServiceOrigin(origin.trim())).filter { it != base }.toSet(), response.safeString("accountId").ifBlank { null })
        }

        private suspend fun call(origin: String, token: String?, workspace: String?, accountId: String?, method: String, route: String,
            body: JSONObject?, acknowledged: (JSONObject) -> Unit = {}): JSONObject {
            require(route in setOf("session", "session/revoke", "status", "workspace", "profile", "jobs", "prepare", "submit", "advance", "stop", "receipts"))
            require(method in setOf("GET", "POST", "PUT"))
            if (body != null) HistoricalText.requireWellFormed(body)
            val parent = currentCoroutineContext()
            return withContext(Dispatchers.IO) {
                var restarts = 0
                while (true) {
                    parent.ensureActive()
                    var operation: JSONObject? = null
                    var recovery: ReadRecoveryRequest? = null
                    try {
                        val initial = exchange(origin, token, method, route, body, parent)
                        operation = CareerReadTransport.operation(initial.optJSONObject("operation"), route, workspace, body)
                        require(method != "GET" || operation == null)
                        require(operation == null || accountId == null || operation.opt("accountId") == accountId)
                        if (operation != null && route != "session") acknowledged(operation)
                        if (route == "session" && operation != null) {
                            require(initial.isNull("read"))
                            require(operation.opt("sessionToken") is String && operation.opt("expiresAt") is String)
                            return@withContext JSONObject(operation.toString()).put("ok", true)
                        }
                        val read = initial.optJSONObject("read")
                        if (read == null) {
                            if (operation != null && initial.has("readError")) throw IllegalStateException("The acknowledged result is waiting for a fresh read.")
                            return@withContext initial
                        }
                        require(workspace != null && (method == "GET" || operation != null))
                        require(accountId == null || read.opt("accountId") == accountId) { "The response belongs to a different account." }
                        require(read.opt("kind") == CareerReadTransport.expectedKind(route)) { "The service returned a different kind of record." }
                        require(operation == null || operation.opt("accountId") == read.opt("accountId") && operation.opt("workspaceId") == read.opt("workspaceId"))
                        recovery = ReadRecoveryRequest(origin, workspace, CareerReadTransport.validateMetadata(read, workspace))
                        val result = CareerReadTransport.assemble(origin, workspace, initial) { cursor ->
                            parent.ensureActive()
                            exchange(origin, token, "GET", "read?cursor=" + URLEncoder.encode(cursor, "UTF-8"), null, parent)
                        }
                        CareerReadTransport.validateMutationView(result, operation, body)
                        if (result.document.legacyStrings.isNotEmpty() && route != "workspace") throw ReadRecoveryRequired(requireNotNull(recovery))
                        parent.ensureActive()
                        return@withContext result
                    } catch (error: Throwable) {
                        if (operation != null && route != "session") throw ReadAfterMutationFailure(operation, recovery, error)
                        if (method == "GET" && restarts == 0 && error is ApiFailure && error.code in setOf("snapshot_changed", "snapshot_expired")) {
                            restarts++; continue
                        }
                        if (error is IllegalArgumentException || error is org.json.JSONException) throw ApiFailure(502,
                            "invalid_read_snapshot", "The recovery data could not be verified. Your earlier saved information is still here.")
                        throw error
                    }
                }
                @Suppress("UNREACHABLE_CODE") error("Read did not complete.")
            }
        }

        private fun socket(origin: String, token: String?, method: String, route: String): HttpsURLConnection {
            val url = URL(BoundaryPolicy.serviceOrigin(origin) + "/api/apply/" + route)
            return (url.openConnection() as HttpsURLConnection).apply {
                instanceFollowRedirects = false; connectTimeout = 15_000; readTimeout = 25_000
                requestMethod = method; useCaches = false
                setRequestProperty("Accept", "application/json"); setRequestProperty("Cache-Control", "no-store")
                setRequestProperty("X-Career-Read-Version", "2")
                if (token != null) setRequestProperty("Authorization", "Bearer $token")
                NativeHttpTransport.configure(this)
            }
        }

        private fun exchange(origin: String, token: String?, method: String, route: String, body: JSONObject?, parent: CoroutineContext): JSONObject {
            val socket = socket(origin, token, method, route)
            val cancellation = CoroutineScope(parent + Dispatchers.IO).launch(start = CoroutineStart.UNDISPATCHED) {
                try { awaitCancellation() } finally { socket.disconnect() }
            }
            try {
                parent.ensureActive()
                if (body != null) {
                    val encoded = body.toString().toByteArray(Charsets.UTF_8)
                    require(encoded.size <= 8 * 1024 * 1024) { "The application data is too large." }
                    socket.doOutput = true
                    socket.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    socket.setFixedLengthStreamingMode(encoded.size)
                    socket.outputStream.use { it.write(encoded) }
                }
                parent.ensureActive()
                val status = socket.responseCode
                if (status in 300..399) throw ApiFailure(status, "redirect", "The service redirected this request. Verify its address before reconnecting.")
                val contentType = socket.contentType?.substringBefore(';')?.trim()?.lowercase()
                if (contentType != "application/json") throw ApiFailure(status, "invalid_response", "The service response could not be verified. Check receipts before trying an application again.")
                val stream = if (status in 200..299) socket.inputStream else socket.errorStream
                val version = socket.getHeaderField("X-Career-Read-Version")
                val followup = route.startsWith("read?cursor=")
                val limit = if (version == "2" || followup) CareerReadTransport.MAX_FRAME_BYTES else BoundaryPolicy.MAX_APPLICATION_RESPONSE_BYTES
                val raw = stream?.use { input ->
                    val output = java.io.ByteArrayOutputStream(minOf(limit, 8192))
                    val buffer = ByteArray(8192)
                    while (true) {
                        parent.ensureActive()
                        val count = input.read(buffer)
                        if (count < 0) break
                        require(count <= limit - output.size()) { "The service response exceeds its allowed size." }
                        output.write(buffer, 0, count)
                    }
                    output.toByteArray()
                }
                    ?: throw ApiFailure(status, "empty_response", "The service returned an empty response. Check receipts before retrying.")
                val response = try { JSONObject(CareerReadTransport.utf8(raw)) }
                    catch (_: Exception) { throw ApiFailure(status, "invalid_response", "The service response could not be verified. Check receipts before retrying.") }
                if (status !in 200..299 || response.opt("ok") != true) {
                    val error = response.optJSONObject("error")
                    throw ApiFailure(status, error?.safeString("code") ?: "request_failed",
                        error?.safeString("message")?.take(500)?.ifBlank { null } ?: "The service could not complete this request.")
                }
                require((!followup && !response.has("read")) || version == "2") { "The read response version could not be verified." }
                return response
            } finally { cancellation.cancel(); socket.disconnect() }
        }

        /** The receiver streams to protected storage and verifies the complete advertised digest before publication. */
        internal suspend fun recoveryStream(connection: Connection, request: ReadRecoveryRequest, receive: (java.io.InputStream) -> Unit) {
            require(connection.origin == request.origin && connection.workspaceId == request.workspaceId)
            val metadata = CareerReadTransport.validateMetadata(request.metadata, connection.workspaceId)
            val socket = socket(connection.origin, connection.token, "GET", "read-export?cursor=" + URLEncoder.encode(CareerReadTransport.cursor(request.cursor), "UTF-8"))
            val parent = currentCoroutineContext()
            val cancellation = CoroutineScope(parent + Dispatchers.IO).launch(start = CoroutineStart.UNDISPATCHED) {
                try { awaitCancellation() } finally { socket.disconnect() }
            }
            try {
                parent.ensureActive()
                val status = socket.responseCode
                if (status !in 200..299) throw ApiFailure(status, "recovery_unavailable", "The recovery snapshot is unavailable or expired. Refresh and open recovery export again.")
                require(socket.contentType?.substringBefore(';')?.trim()?.lowercase() == "application/json" &&
                    socket.getHeaderField("X-Career-Read-Version") == "2" &&
                    socket.getHeaderField("X-Career-Read-SHA256") == metadata.getString("sha256") &&
                    socket.getHeaderField("X-Career-Read-Bytes") == metadata.getLong("totalBytes").toString() &&
                    socket.getHeaderField("X-Career-Read-Workspace-Id") == connection.workspaceId &&
                    socket.getHeaderField("X-Career-Read-Account-SHA256") == BoundaryPolicy.sha256(metadata.getString("accountId").toByteArray(Charsets.UTF_8)))
                socket.inputStream.use { input ->
                    receive(object : java.io.FilterInputStream(input) {
                        override fun read(): Int { parent.ensureActive(); return super.read() }
                        override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                            parent.ensureActive(); return super.read(buffer, offset, length)
                        }
                    })
                }
            } finally { cancellation.cancel(); socket.disconnect() }
        }
    }
}
