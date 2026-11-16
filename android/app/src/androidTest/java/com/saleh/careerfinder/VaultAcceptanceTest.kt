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
}
