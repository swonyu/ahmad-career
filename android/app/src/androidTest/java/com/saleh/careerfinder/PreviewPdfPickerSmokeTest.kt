package com.saleh.careerfinder

import android.graphics.Bitmap
import android.net.Uri
import android.util.Base64
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelProvider
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import java.io.File
import java.util.UUID

/** Explicitly scoped Preview smoke: local synthetic bytes, real DocumentsUI and a new process. */
class PreviewPdfPickerSmokeTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val inserted = mutableListOf<Uri>()

    private fun model(): CareerViewModel {
        lateinit var result: CareerViewModel
        compose.activityRule.scenario.onActivity { result = ViewModelProvider(it)[CareerViewModel::class.java] }
        compose.waitUntil(5_000) { result.state.value.loaded && !result.state.value.busy }
        assertNull("This smoke must use the private unpaired phone workspace", result.state.value.connection)
        assertFalse(result.state.value.storageBlocked)
        return result
    }

    private fun syntheticPdf(): ByteArray {
        val fixture = JSONObject(instrumentation.context.assets.open("phone-workspace-v1.json")
            .bufferedReader().use { it.readText() }).getJSONObject("data").getJSONObject("profile").getJSONObject("resume")
        val bytes = Base64.decode(fixture.getString("dataBase64"), Base64.DEFAULT)
        assertEquals("application/pdf", fixture.getString("mime"))
        assertEquals(fixture.getLong("size"), bytes.size.toLong())
        assertEquals(fixture.getString("sha256"), BoundaryPolicy.sha256(bytes))
        BoundaryPolicy.readPDF(bytes.inputStream())
        return bytes
    }

    private fun profile(strings: CareerStrings) {
        val tab = compose.onNodeWithTag("navigation-profile").revealNavigationTab()
        assertFullyVisible(tab)
        tab.assertIsEnabled().performTouchInput { click() }
        tab.assertIsSelected()
        compose.onNodeWithTag("profile-list").assertExists()
        assertEquals("ar", strings.locale.language)
    }

    private fun action(strings: CareerStrings, english: String) {
        val matcher = hasText(strings(english), substring = false) and hasClickAction()
        compose.onNodeWithTag("profile-list").performScrollToNode(matcher)
        assertEquals("Exactly one live profile action must match", 1, compose.onAllNodes(matcher).fetchSemanticsNodes().size)
        val target = compose.onNode(matcher)
        assertFullyVisible(target)
        target.assertIsEnabled().performTouchInput { click() }
    }

    private fun openPicker(strings: CareerStrings, model: CareerViewModel, picker: SystemPdfPicker) {
        action(strings, if (model.state.value.profile.resume == null) "Choose PDF résumé" else "Replace PDF résumé")
        picker.waitForDocumentPicker()
    }

    private fun assertBytes(resume: Resume?, expected: ByteArray) {
        val actual = Base64.decode(checkNotNull(resume?.dataBase64), Base64.NO_WRAP)
        try { assertArrayEquals("The exact selected PDF bytes must survive", expected, actual) }
        finally { actual.fill(0) }
    }

    private fun assertSelected(model: CareerViewModel, name: String, hash: String, bytes: ByteArray) {
        compose.waitUntil(5_000) {
            val state = model.state.value
            !state.busy && state.profile.resume?.let {
                it.name == name && it.sha256 == hash && it.size == bytes.size.toLong() && it.dataBase64 != null
            } == true
        }
        assertNull(model.state.value.connection)
        assertTrue("Selection must remain an unsaved private phone draft", model.state.value.profileDirty)
        assertNull(model.state.value.error)
        assertBytes(model.state.value.profile.resume, bytes)
    }

    private fun savePrivate(strings: CareerStrings, model: CareerViewModel, name: String, hash: String, bytes: ByteArray) {
        action(strings, "Save profile on this phone")
        compose.waitUntil(5_000) { !model.state.value.busy && !model.state.value.profileDirty }
        assertNull(model.state.value.connection)
        assertEquals(name, model.state.value.profile.resume?.name)
        val saved = WorkspaceStorage.decode(SecureVault(compose.activity).read("workspace-unpaired"), null)
        assertEquals(name, saved.profile.resume?.name)
        assertEquals(hash, saved.profile.resume?.sha256)
        assertEquals(bytes.size.toLong(), saved.profile.resume?.size)
        assertBytes(saved.profile.resume, bytes)
        assertFalse(saved.profileDirty)
    }

    @Test fun previewPdfPickerSeed_cancelThenSelectAReplaceBAndSave() {
        val model = model()
        val strings = phoneAcceptanceStrings(compose.activity)
        val bytes = syntheticPdf()
        val hash = BoundaryPolicy.sha256(bytes)
        val namespace = UUID.randomUUID().toString()
        val picker = SystemPdfPicker(compose.activity) { name, value ->
            println("PREVIEW_PDF_PICKER_EVIDENCE " + name + " " + value)
        }
        var failure: Throwable? = null
        try {
            profile(strings)
            val before = model.state.value
            assertEquals("The cleared Preview workspace must start with an empty profile", ProfileDraft(), before.profile)
            assertFalse(before.profileDirty)
            openPicker(strings, model, picker)
            picker.cancelDocumentPicker()
            compose.waitUntil(5_000) { !model.state.value.busy }
            assertEquals("Cancel must retain the prior PDF", before.profile.resume, model.state.value.profile.resume)
            assertEquals("Cancel must retain the prior save state", before.profileDirty, model.state.value.profileDirty)

            inserted += publishSyntheticPdf(compose.activity, "CV-A.pdf", bytes, namespace)
            openPicker(strings, model, picker)
            picker.selectDocument("CV-A.pdf")
            assertSelected(model, "CV-A.pdf", hash, bytes)
            savePrivate(strings, model, "CV-A.pdf", hash, bytes)

            inserted += publishSyntheticPdf(compose.activity, "CV-B.pdf", bytes, namespace)
            openPicker(strings, model, picker)
            picker.selectDocument("CV-B.pdf")
            assertSelected(model, "CV-B.pdf", hash, bytes)
            savePrivate(strings, model, "CV-B.pdf", hash, bytes)
            println("PREVIEW_PDF_PICKER_SEED saved=CV-B.pdf sameBytes=true privateLocal=true")
        } catch (error: Throwable) {
            failure = error
            // Keep the actual failure-time screen before deleting this smoke's MediaStore rows.
            try {
                val screenshot = checkNotNull(instrumentation.uiAutomation.takeScreenshot())
                try {
                    File(compose.activity.cacheDir, "preview-pdf-picker-failure.png").outputStream().use {
                        check(screenshot.compress(Bitmap.CompressFormat.PNG, 100, it))
                    }
                } finally { screenshot.recycle() }
            } catch (captureError: Throwable) { error.addSuppressed(captureError) }
            throw error
        } finally {
            val cleanupFailures = inserted.mapNotNull { uri ->
                runCatching { assertEquals("Delete only this smoke's inserted URI", 1,
                    compose.activity.contentResolver.delete(uri, null, null)) }.exceptionOrNull()
            }.toMutableList()
            bytes.fill(0)
            runCatching { picker.close() }.exceptionOrNull()?.let(cleanupFailures::add)
            val original = failure
            if (original != null) cleanupFailures.forEach(original::addSuppressed)
            else if (cleanupFailures.isNotEmpty()) throw AssertionError("Synthetic PDF URI cleanup failed").apply {
                cleanupFailures.forEach(::addSuppressed)
            }
        }
    }

    @Test fun previewPdfPickerRestore_readsSavedBInNewProcess() {
        val model = model()
        val strings = phoneAcceptanceStrings(compose.activity)
        val bytes = syntheticPdf()
        try {
            val state = model.state.value
            assertNull(state.connection)
            assertFalse(state.profileDirty)
            assertEquals("CV-B.pdf", state.profile.resume?.name)
            assertEquals(bytes.size.toLong(), state.profile.resume?.size)
            assertEquals(BoundaryPolicy.sha256(bytes), state.profile.resume?.sha256)
            assertBytes(state.profile.resume, bytes)
            profile(strings)
            compose.onNodeWithTag("profile-list").performScrollToNode(hasText("CV-B.pdf", substring = false))
            val name = compose.onNodeWithText("CV-B.pdf", substring = false)
            assertFullyVisible(name)
            name.assertIsDisplayed()
            println("PREVIEW_PDF_PICKER_RESTORE saved=CV-B.pdf newProcess=true privateLocal=true")
        } finally {
            bytes.fill(0)
        }
    }
}
