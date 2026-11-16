package com.saleh.careerfinder

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.URL
import javax.net.ssl.HttpsURLConnection

object ServicePages {
    const val DEFAULT_ORIGIN = "https://career-finder-service.jazzy-drake-8323.chatgpt.site"
    fun initialOrigin(connection: Connection?): String = connection?.origin ?: DEFAULT_ORIGIN
    fun url(origin: String, page: String): String {
        require(page in setOf("connect", "privacy", "support", "account"))
        return BoundaryPolicy.serviceOrigin(origin.trim()) + "/" + page
    }
}

data class Connection(val origin: String, val workspaceId: String, val token: String, val expiresAt: String) {
    fun toJson() = JSONObject().put("origin", origin).put("workspaceId", workspaceId).put("token", token).put("expiresAt", expiresAt)
    companion object {
        fun fromJson(value: JSONObject) = Connection(BoundaryPolicy.serviceOrigin(value.getString("origin")),
            value.getString("workspaceId"), value.getString("token"), value.getString("expiresAt"))
    }
}

class ApiFailure(val status: Int, val code: String, override val message: String) : Exception(message)

interface CareerService {
    suspend fun pair(origin: String, code: String): Connection
    suspend fun request(connection: Connection, method: String, route: String, body: JSONObject? = null): JSONObject
}

object HttpsCareerService : CareerService {
    override suspend fun pair(origin: String, code: String) = CareerApi.pair(origin, code)
    override suspend fun request(connection: Connection, method: String, route: String, body: JSONObject?) =
        CareerApi(connection).request(method, route, body)
}

/** No retries, redirects, cookies or trust overrides. The server owns application outcomes. */
class CareerApi(private val connection: Connection) {
    suspend fun request(method: String, route: String, body: JSONObject? = null): JSONObject =
        call(connection.origin, connection.token, method, route, body)

    companion object {
        suspend fun pair(origin: String, code: String): Connection {
            val base = BoundaryPolicy.serviceOrigin(origin.trim())
            require(code.trim().isNotEmpty()) { "Enter the one-time pairing code from your service." }
            val response = call(base, null, "POST", "session", JSONObject().put("pairingCode", code.trim()))
            val token = response.getString("sessionToken")
            val workspace = response.getString("workspaceId")
            require(token.isNotBlank() && workspace.isNotBlank()) { "The service did not return a valid private session." }
            return Connection(base, workspace, token, response.getString("expiresAt"))
        }

        private suspend fun call(origin: String, token: String?, method: String, route: String, body: JSONObject?): JSONObject = withContext(Dispatchers.IO) {
            require(route in setOf("session", "session/revoke", "status", "workspace", "profile", "jobs", "prepare", "submit", "advance", "stop", "receipts"))
            require(method in setOf("GET", "POST", "PUT"))
            val url = URL(BoundaryPolicy.serviceOrigin(origin) + "/api/apply/" + route)
            val socket = url.openConnection() as HttpsURLConnection
            socket.instanceFollowRedirects = false
            socket.connectTimeout = 15_000
            socket.readTimeout = 25_000
            socket.requestMethod = method
            socket.useCaches = false
            socket.setRequestProperty("Accept", "application/json")
            socket.setRequestProperty("Cache-Control", "no-store")
            if (token != null) socket.setRequestProperty("Authorization", "Bearer $token")
            try {
                if (body != null) {
                    val encoded = body.toString().toByteArray(Charsets.UTF_8)
                    require(encoded.size <= 8 * 1024 * 1024) { "The application data is too large." }
                    socket.doOutput = true
                    socket.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    socket.setFixedLengthStreamingMode(encoded.size)
                    socket.outputStream.use { it.write(encoded) }
                }
                val status = socket.responseCode
                if (status in 300..399) throw ApiFailure(status, "redirect", "The service redirected this request. Verify its address before reconnecting.")
                val contentType = socket.contentType?.substringBefore(';')?.trim()?.lowercase()
                if (contentType != "application/json") throw ApiFailure(status, "invalid_response", "The service response could not be verified. Check receipts before trying an application again.")
                val stream = if (status in 200..299) socket.inputStream else socket.errorStream
                val raw = stream?.use { BoundaryPolicy.readBounded(it, BoundaryPolicy.MAX_RESPONSE_BYTES) }
                    ?: throw ApiFailure(status, "empty_response", "The service returned an empty response. Check receipts before retrying.")
                val response = try { JSONObject(String(raw, Charsets.UTF_8)) }
                    catch (_: Exception) { throw ApiFailure(status, "invalid_response", "The service response could not be verified. Check receipts before retrying.") }
                if (status !in 200..299 || response.opt("ok") != true) {
                    val error = response.optJSONObject("error")
                    throw ApiFailure(status, error?.safeString("code") ?: "request_failed",
                        error?.safeString("message")?.take(500)?.ifBlank { null } ?: "The service could not complete this request.")
                }
                response
            } finally { socket.disconnect() }
        }
    }
}
