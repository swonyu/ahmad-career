package com.saleh.careerfinder

import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.UUID

class VaultAcceptanceTest {
    @Test fun storedToken_isEncrypted_andBoundToItsRecordName() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val vault = SecureVault(context)
        val first = "check-" + UUID.randomUUID()
        val second = "check-" + UUID.randomUUID()
        val token = "instrumented-fixture-" + UUID.randomUUID()
        try {
            vault.write(first, JSONObject().put("token", token))
            assertEquals(token, vault.read(first)!!.getString("token"))
            val directory = File(context.noBackupFilesDir, "career-private")
            val ciphertext = File(directory, "$first.enc").readBytes()
            assertFalse(String(ciphertext, Charsets.ISO_8859_1).contains(token))
            File(directory, "$second.enc").writeBytes(ciphertext)
            try { vault.read(second); fail("Moving an encrypted record must fail its authenticated name check.") }
            catch (_: java.security.GeneralSecurityException) { }
        } finally { vault.remove(first); vault.remove(second) }
    }

    @Test fun freshPrivateArea_preservesUnreadableBytes_andUsesANewKeystoreKey() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val namespace = UUID.randomUUID().toString()
        val root = File(context.noBackupFilesDir, "career-private-$namespace")
        val vault = SecureVault(context, namespace)
        val keyPrefix = "career-finder-v1-$namespace"
        try {
            vault.write("profile", JSONObject().put("firstName", "Private fixture"))
            val original = File(root, "profile.enc")
            val damaged = original.readBytes().apply { this[lastIndex] = (this[lastIndex].toInt() xor 1).toByte() }
            original.writeBytes(damaged)
            try { vault.read("profile"); fail("Corrupt ciphertext must be refused.") }
            catch (_: java.security.GeneralSecurityException) { }
            vault.startFreshPreservingExisting()
            assertArrayEquals(damaged, original.readBytes())
            assertNull(vault.read("profile"))
            vault.write("profile", JSONObject().put("firstName", "New private draft"))
            assertEquals("New private draft", vault.read("profile")!!.getString("firstName"))
            val keys = java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            assertTrue(keys.containsAlias(keyPrefix))
            assertTrue(keys.aliases().asSequence().count { it.startsWith(keyPrefix) } >= 2)
            File(root, "active-area").writeText("-".repeat(36))
            try { vault.read("profile"); fail("A damaged storage index must not silently open an empty area.") }
            catch (_: IllegalArgumentException) { }
            vault.startFreshPreservingExisting()
            assertNull(vault.read("profile"))
            assertArrayEquals(damaged, original.readBytes())
        } finally {
            root.deleteRecursively()
            val keys = java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            keys.aliases().asSequence().filter { it.startsWith(keyPrefix) }.toList().forEach(keys::deleteEntry)
        }
    }

    @Test fun originalSchemaOneEnvelope_remainsReadableWithoutAStorageAreaPointer() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val namespace = UUID.randomUUID().toString()
        val root = File(context.noBackupFilesDir, "career-private-$namespace").apply { mkdirs() }
        val alias = "career-finder-v1-$namespace"
        val record = "workspace-unpaired"
        try {
            // Independently reproduce the v0.1 record layout and Keystore parameters.
            val generator = javax.crypto.KeyGenerator.getInstance(android.security.keystore.KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            generator.init(android.security.keystore.KeyGenParameterSpec.Builder(alias,
                android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or android.security.keystore.KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true).build())
            val cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(javax.crypto.Cipher.ENCRYPT_MODE, generator.generateKey())
            cipher.updateAAD(record.toByteArray(Charsets.UTF_8))
            val legacy = JSONObject().put("schema", 1).put("profileDirty", true)
                .put("profile", JSONObject().put("firstName", "Legacy single name").put("lastName", "")
                    .put("revision", 0).put("draftResume", JSONObject.NULL))
                .put("jobs", org.json.JSONArray()).put("receipts", org.json.JSONArray())
            val bytes = byteArrayOf(1) + cipher.iv + cipher.doFinal(legacy.toString().toByteArray(Charsets.UTF_8))
            File(root, "$record.enc").writeBytes(bytes)
            assertFalse(File(root, "active-area").exists())
            val read = SecureVault(context, namespace).read(record)!!
            assertEquals(1, read.getInt("schema"))
            assertTrue(read.getBoolean("profileDirty"))
            assertEquals("Legacy single name", ProfileDraft.fromJson(read.getJSONObject("profile")).firstName)
            assertArrayEquals(bytes, File(root, "$record.enc").readBytes())
        } finally {
            root.deleteRecursively()
            java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry(alias) }
        }
    }
}
