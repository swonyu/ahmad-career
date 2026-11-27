package com.saleh.careerfinder

import java.net.URI
import java.security.MessageDigest
import java.util.UUID
import javax.net.ssl.HttpsURLConnection

/** Compiled only in the separate acceptance APK; never relaxes normal TLS/auth. */
internal object NativeHttpTransport {
    private class Binding(val origin: String, val testID: String, val workspaceID: String,
        val bridgeCapability: String, val nativeTokenSHA256: String)
    @Volatile private var binding: Binding? = null
    private val allowed = setOf(
        "GET /api/apply/status", "GET /api/apply/workspace", "GET /api/apply/receipts",
        "PUT /api/apply/profile", "POST /api/apply/jobs", "POST /api/apply/prepare",
        "GET /api/discovery/sources", "GET /api/discovery/search")

    val discoveryOrigin: String get() = binding?.origin ?: ServicePages.DEFAULT_ORIGIN

    /** The opt-in participant installs one private, source-bound fixture lease per process. */
    @Synchronized fun install(origin: String, testID: String, workspaceID: String,
        bridgeCapability: String, nativeTokenSHA256: String) {
        check(binding == null) { "The native journey transport is already installed." }
        require(BuildConfig.APPLICATION_ID == "com.saleh.careerfinder.acceptance")
        require(BuildConfig.CAREER_ACCEPTANCE_DISCOVERY_ORIGIN.isNotEmpty() &&
            origin == BuildConfig.CAREER_ACCEPTANCE_DISCOVERY_ORIGIN)
        val uri = URI(origin)
        require(uri.scheme == "https" && uri.host == "10.0.2.2" && uri.port in 1024..65535 &&
            uri.rawUserInfo == null && uri.rawPath.isEmpty() && uri.rawQuery == null && uri.rawFragment == null &&
            origin == "https://10.0.2.2:${uri.port}")
        require(UUID.fromString(testID).toString().uppercase(java.util.Locale.ROOT) == testID)
        require(UUID.fromString(workspaceID).toString() == workspaceID.lowercase(java.util.Locale.ROOT))
        require(bridgeCapability.matches(Regex("[a-f0-9]{64}")) && nativeTokenSHA256.matches(Regex("[a-f0-9]{64}")))
        binding = Binding(origin, testID, workspaceID, bridgeCapability, nativeTokenSHA256)
    }

    fun configure(connection: HttpsURLConnection) {
        val current = binding ?: return
        val uri = connection.url.toURI()
        require(uri.scheme == "https" && uri.rawAuthority == URI(current.origin).rawAuthority &&
            uri.host == "10.0.2.2" && uri.rawUserInfo == null && uri.rawFragment == null &&
            uri.rawPath == uri.path && !uri.path.contains("..") && !uri.path.contains('\\')) {
            "The native journey request left its owned HTTPS origin."
        }
        require(connection.requestMethod + " " + uri.path in allowed &&
            (uri.rawQuery == null || uri.path == "/api/discovery/search")) {
            "This operation is outside the native journey."
        }
        val authorization = connection.getRequestProperty("Authorization")
        if (uri.path.startsWith("/api/apply/")) {
            require(authorization != null && authorization.startsWith("Bearer ") &&
                sha256(authorization.removePrefix("Bearer ").toByteArray(Charsets.UTF_8)) == current.nativeTokenSHA256) {
                "The native journey credential scope changed."
            }
        } else require(authorization == null) { "Public discovery must not receive a credential." }
        require(connection.getRequestProperty("X-Native-Journey-Bridge") == null)
        // The normal Authorization/body and the platform's TLS verification are untouched.
        connection.setRequestProperty("X-Native-Journey-Bridge", current.bridgeCapability)
    }

    private fun sha256(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes)
        .joinToString("") { "%02x".format(it) }
}
