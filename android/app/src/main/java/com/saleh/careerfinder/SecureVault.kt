package com.saleh.careerfinder

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Tokens and local drafts are encrypted with an unexportable Android Keystore key. */
class SecureVault(context: Context) {
    private val directory = File(context.noBackupFilesDir, "career-private").apply { mkdirs() }
    private val alias = "career-finder-v1"

    @Synchronized private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build())
        return generator.generateKey()
    }

    private fun file(name: String): AtomicFile {
        require(name.matches(Regex("[a-z0-9-]{1,100}"))) { "Invalid private record name." }
        return AtomicFile(File(directory, "$name.enc"))
    }

    @Synchronized fun read(name: String): JSONObject? {
        val target = file(name)
        if (!target.baseFile.exists()) return null
        val bytes = target.openRead().use { BoundaryPolicy.readBounded(it, 10 * 1024 * 1024) }
        require(bytes.size >= 30 && bytes[0] == 1.toByte()) { "The saved private record cannot be read. It has been preserved." }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(1, 13)))
        cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
        val clear = cipher.doFinal(bytes.copyOfRange(13, bytes.size))
        return try { JSONObject(String(clear, Charsets.UTF_8)) } finally { clear.fill(0) }
    }

    @Synchronized fun write(name: String, value: JSONObject) {
        val clear = value.toString().toByteArray(Charsets.UTF_8)
        require(clear.size <= 9 * 1024 * 1024) { "This private record is too large to save." }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
        val ciphertext = try { cipher.doFinal(clear) } finally { clear.fill(0) }
        check(cipher.iv.size == 12)
        val target = file(name)
        val output = target.startWrite()
        try {
            output.write(byteArrayOf(1)); output.write(cipher.iv); output.write(ciphertext)
            target.finishWrite(output)
        } catch (error: Exception) { target.failWrite(output); throw error }
    }

    @Synchronized fun remove(name: String) { file(name).delete() }
}
