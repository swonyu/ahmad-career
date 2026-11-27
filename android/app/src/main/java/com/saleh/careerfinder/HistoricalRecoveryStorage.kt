package com.saleh.careerfinder

import org.json.JSONObject
import java.io.InputStream
import java.io.OutputStream
import java.security.MessageDigest
import java.time.Instant
import java.util.Base64
import java.util.UUID

/** Account-scoped reference. It contains no credential, continuation cursor or approval authority. */
data class HistoricalRecoveryReference(val origin: String, val accountId: String, val workspaceId: String,
    val kind: String, val asOf: String, val sha256: String, val totalBytes: Long, val documentFileName: String) {
    fun json(): JSONObject = JSONObject().put("version", 1).put("origin", origin).put("accountId", accountId)
        .put("workspaceId", workspaceId).put("kind", kind).put("asOf", asOf).put("sha256", sha256)
        .put("totalBytes", totalBytes).put("documentFileName", documentFileName)

    companion object {
        fun decode(value: JSONObject, connection: Connection?): HistoricalRecoveryReference {
            HistoricalText.requireWellFormed(value)
            require(value.opt("version") == 1)
            require(value.keys().asSequence().toSet() == setOf("version", "origin", "accountId", "workspaceId", "kind", "asOf", "sha256", "totalBytes", "documentFileName"))
            val count = value.opt("totalBytes")
            require(count is Number && count.toDouble().isFinite() && count.toDouble() == count.toLong().toDouble() && count.toLong() in 1..9_007_199_254_740_991L)
            val reference = HistoricalRecoveryReference(value.getString("origin"), value.getString("accountId"),
                value.getString("workspaceId"), value.getString("kind"), value.getString("asOf"), value.getString("sha256"),
                value.getLong("totalBytes"), value.getString("documentFileName"))
            require(reference.origin == BoundaryPolicy.serviceOrigin(reference.origin) && reference.accountId.isNotBlank() && reference.accountId.length <= 250)
            require(connection == null || connection.origin == reference.origin && connection.workspaceId == reference.workspaceId &&
                (connection.accountId == null || connection.accountId == reference.accountId))
            require(reference.kind in setOf("workspace", "profile", "job", "plan", "plan-state", "receipts"))
            require(reference.workspaceId.matches(Regex("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")))
            require(reference.sha256.matches(Regex("[a-f0-9]{64}")) && reference.totalBytes > 0)
            val prefix = HistoricalRecoveryStorage.prefix(reference.origin, reference.workspaceId)
            require(reference.documentFileName.matches(Regex(Regex.escape(prefix) + "[a-f0-9]{16}")))
            require(reference.asOf.matches(Regex("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z")))
            Instant.parse(reference.asOf)
            return reference
        }
    }
}

/** Chunks use the existing encrypted atomic store. Publish the reference only after the full hash verifies. */
internal object HistoricalRecoveryStorage {
    private const val CHUNK = 4 * 1024 * 1024
    fun prefix(origin: String, workspace: String) = "recovery-" + BoundaryPolicy.workspaceKey(origin, workspace) + "-"
    private fun name(reference: HistoricalRecoveryReference, index: Long) = reference.documentFileName + "-" + index

    fun save(vault: PrivateStore, origin: String, metadata: JSONObject, input: InputStream): HistoricalRecoveryReference {
        val workspace = metadata.getString("workspaceId")
        CareerReadTransport.validateMetadata(metadata, workspace)
        val reference = HistoricalRecoveryReference(origin, metadata.getString("accountId"), workspace,
            metadata.getString("kind"), metadata.getString("asOf"), metadata.getString("sha256"), metadata.getLong("totalBytes"),
            prefix(origin, workspace) + UUID.randomUUID().toString().replace("-", "").take(16))
        require(reference.totalBytes / CHUNK < 1_000_000) { "The recovery file cannot be safely indexed on this phone." }
        vault.availableBytes()?.let { available ->
            require(reference.totalBytes <= (available - 16L * 1024 * 1024).coerceAtLeast(0) / 2) {
                "There is not enough free space for the complete recovery file. Free some space and try again; your earlier data is kept."
            }
        }
        val digest = MessageDigest.getInstance("SHA-256")
        val written = mutableListOf<String>()
        val existingNames = vault.names()
        try {
            var remaining = reference.totalBytes
            var index = 0L
            while (remaining > 0) {
                val bytes = ByteArray(minOf(CHUNK.toLong(), remaining).toInt())
                var offset = 0
                while (offset < bytes.size) {
                    val count = input.read(bytes, offset, bytes.size - offset)
                    require(count >= 0) { "The recovery download ended early. Your earlier phone data is intact." }
                    if (count == 0) {
                        val single = input.read(); require(single >= 0); bytes[offset++] = single.toByte()
                    } else offset += count
                }
                digest.update(bytes)
                val record = name(reference, index)
                require(record !in existingNames) { "The recovery destination already exists." }
                vault.write(record, JSONObject().put("version", 1).put("index", index)
                    .put("payloadBase64", Base64.getEncoder().encodeToString(bytes)))
                written += record
                bytes.fill(0)
                remaining -= offset; index++
            }
            require(input.read() == -1) { "The recovery download exceeded its advertised size." }
            require(digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) } == reference.sha256)
            return reference
        } catch (error: Throwable) {
            written.forEach { runCatching { vault.remove(it) } }
            throw error
        }
    }

    private fun walk(vault: PrivateStore, reference: HistoricalRecoveryReference, consume: (ByteArray) -> Unit) {
        var remaining = reference.totalBytes
        var index = 0L
        val digest = MessageDigest.getInstance("SHA-256")
        while (remaining > 0) {
            val value = vault.read(name(reference, index)) ?: error("The original recovery record is unavailable. Its reference is preserved.")
            require(value.keys().asSequence().toSet() == setOf("version", "index", "payloadBase64"))
            require(value.opt("version") == 1 && value.opt("index") is Number && value.getLong("index") == index && value.getDouble("index") == index.toDouble())
            val bytes = HistoricalText.canonicalBase64(value.getString("payloadBase64"), CHUNK)
            require(bytes.size.toLong() == minOf(CHUNK.toLong(), remaining))
            digest.update(bytes); consume(bytes); remaining -= bytes.size; index++; bytes.fill(0)
        }
        require(digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) } == reference.sha256)
    }

    fun verify(vault: PrivateStore, reference: HistoricalRecoveryReference) = walk(vault, reference) { }

    fun export(vault: PrivateStore, reference: HistoricalRecoveryReference, output: OutputStream) {
        // Complete verification precedes any external output. The second pass stays bounded.
        verify(vault, reference)
        val source = reference.json().apply { remove("version"); remove("documentFileName") }
        val envelope = JSONObject().put("format", "career-finder-raw-recovery").put("version", 1)
            .put("exportedAt", Instant.now().toString()).put("source", source)
        val prefix = envelope.toString().dropLast(1) + ",\"documentBase64\":\""
        output.write(prefix.toByteArray(Charsets.UTF_8))
        val nonClosingOutput = object : java.io.FilterOutputStream(output) { override fun close() { flush() } }
        Base64.getEncoder().wrap(nonClosingOutput).use { base64 -> walk(vault, reference) { base64.write(it) } }
        output.write("\"}".toByteArray(Charsets.UTF_8))
    }
}
