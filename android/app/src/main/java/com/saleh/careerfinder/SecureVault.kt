package com.saleh.careerfinder

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

interface PrivateStore {
    fun read(name: String): JSONObject?
    fun write(name: String, value: JSONObject)
    fun remove(name: String)
    fun startFreshPreservingExisting()
}

/** A fresh area keeps every earlier encrypted file and Keystore key intact. */
class SecureVault(context: Context, namespace: String? = null) : PrivateStore {
    init { require(namespace == null || namespace.matches(Regex("[a-z0-9-]{1,50}"))) }
    private val suffix = namespace?.let { "-$it" }.orEmpty()
    private val root = File(context.noBackupFilesDir, "career-private$suffix").apply { mkdirs() }
    private val legacyAlias = "career-finder-v1$suffix"
    private data class Area(val directory: File, val alias: String)

    private fun activeArea(): Area {
        val pointer = AtomicFile(File(root, "active-area"))
        if (!pointer.baseFile.exists() && !File(root, "active-area.bak").exists()) return Area(root, legacyAlias)
        val id = pointer.openRead().use { String(BoundaryPolicy.readBounded(it, 40), Charsets.UTF_8) }
        require(id.matches(Regex("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"))) { "The private storage index could not be read." }
        val directory = File(root, "areas/$id")
        check(directory.isDirectory) { "The selected private storage area is unavailable." }
        return Area(directory, "$legacyAlias-$id")
    }

    @Synchronized private fun key(area: Area, create: Boolean): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(area.alias, null) as? SecretKey)?.let { return it }
        check(create) { "The key for this private record is unavailable. The file is preserved." }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(KeyGenParameterSpec.Builder(area.alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build())
        return generator.generateKey()
    }

    private fun file(area: Area, name: String): AtomicFile {
        require(name.matches(Regex("[a-z0-9-]{1,100}"))) { "Invalid private record name." }
        return AtomicFile(File(area.directory, "$name.enc"))
    }

    @Synchronized override fun read(name: String): JSONObject? {
        val area = activeArea()
        val target = file(area, name)
        if (!target.baseFile.exists() && !File(area.directory, "$name.enc.bak").exists()) return null
        val bytes = target.openRead().use { BoundaryPolicy.readBounded(it, 10 * 1024 * 1024) }
        require(bytes.size >= 30 && bytes[0] == 1.toByte()) { "The saved private record cannot be read. It has been preserved." }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(area, create = false), GCMParameterSpec(128, bytes.copyOfRange(1, 13)))
        cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
        val clear = cipher.doFinal(bytes.copyOfRange(13, bytes.size))
        return try { JSONObject(String(clear, Charsets.UTF_8)) } finally { clear.fill(0) }
    }

    @Synchronized override fun write(name: String, value: JSONObject) = write(activeArea(), name, value)

    private fun write(area: Area, name: String, value: JSONObject) {
        val clear = value.toString().toByteArray(Charsets.UTF_8)
        require(clear.size <= 9 * 1024 * 1024) { "This private record is too large to save." }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key(area, create = true))
        cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
        val ciphertext = try { cipher.doFinal(clear) } finally { clear.fill(0) }
        check(cipher.iv.size == 12)
        check(area.directory.isDirectory || area.directory.mkdirs()) { "Private storage is unavailable." }
        val target = file(area, name)
        val output = target.startWrite()
        try {
            output.write(byteArrayOf(1)); output.write(cipher.iv); output.write(ciphertext)
            target.finishWrite(output)
        } catch (error: Exception) { target.failWrite(output); throw error }
    }

    @Synchronized override fun remove(name: String) { file(activeArea(), name).delete() }

    @Synchronized override fun startFreshPreservingExisting() {
        val id = UUID.randomUUID().toString()
        val area = Area(File(root, "areas/$id"), "$legacyAlias-$id")
        // Verify encryption and an atomic record write before selecting the new area.
        write(area, "workspace-unpaired", JSONObject().put("schema", 1))
        val pointer = AtomicFile(File(root, "active-area"))
        if (pointer.baseFile.exists()) {
            val preserved = File(root, "preserved-index-$id")
            pointer.baseFile.copyTo(preserved, overwrite = false)
        }
        val output = pointer.startWrite()
        try {
            output.write(id.toByteArray(Charsets.UTF_8))
            pointer.finishWrite(output)
        } catch (error: Exception) { pointer.failWrite(output); throw error }
    }
}
