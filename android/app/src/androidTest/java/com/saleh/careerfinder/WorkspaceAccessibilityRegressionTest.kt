package com.saleh.careerfinder

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.Density
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class WorkspaceAccessibilityRegressionTest {
    @get:Rule val compose = createComposeRule()

    @After fun captureNoteLayout() {
        runCatching {
            val instrumentation = InstrumentationRegistry.getInstrumentation()
            val directory = java.io.File(instrumentation.targetContext.cacheDir, "strict-review-evidence").apply { mkdirs() }
            val screenshot = checkNotNull(instrumentation.uiAutomation.takeScreenshot())
            try {
                java.io.File(directory, "expanded-private-note-large-text.png").outputStream().use {
                    check(screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it))
                }
            } finally { screenshot.recycle() }
        }.onFailure { android.util.Log.w("CareerPhoneAcceptance", "Optional note layout capture unavailable", it) }
    }

    @Test fun shortMultilineNote_canExpandAtLargeText_withoutClippingItsLastLine() {
        val note = "First\nSecond\nThird\nFourth\nFifth\nLast private line"
        val version = ApplicationRecordVersion.create(ApplicationRecord(note = note))
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 2f)) {
                CareerTheme {
                    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                        RecordVersionCard(version, "Earlier note", null, true) {}
                    }
                }
            }
        }
        compose.onNodeWithText("Read full note").assertExists().performScrollTo().performClick()
        compose.onNodeWithText("Show less").assertExists()
        val layouts = mutableListOf<TextLayoutResult>()
        compose.onNodeWithText(note).performSemanticsAction(SemanticsActions.GetTextLayoutResult) { it(layouts) }
        assertTrue(layouts.isNotEmpty())
        val layout = layouts.single()
        val diagnostics = "size=${layout.size}; paragraph=${layout.multiParagraph.width}x${layout.multiParagraph.height}; " +
            "maxLines=${layout.layoutInput.maxLines}; lines=${layout.lineCount}; " +
            "widthOverflow=${layout.didOverflowWidth}; heightOverflow=${layout.didOverflowHeight}"
        assertEquals(diagnostics, Int.MAX_VALUE, layout.layoutInput.maxLines)
        assertFalse(diagnostics, layout.hasVisualOverflow)
        assertTrue(diagnostics, layout.lineCount >= 6)
        val lastLine = layout.lineCount - 1
        assertEquals(diagnostics, note.length, layout.getLineEnd(lastLine, visibleEnd = true))
        assertFalse(diagnostics, layout.isLineEllipsized(lastLine))
        assertTrue(diagnostics, layout.getLineBottom(lastLine) <= layout.size.height)
        compose.onNodeWithText(note).performScrollTo().assertIsDisplayed()
    }
}
