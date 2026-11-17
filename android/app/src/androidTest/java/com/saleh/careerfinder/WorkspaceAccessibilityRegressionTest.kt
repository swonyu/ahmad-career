package com.saleh.careerfinder

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.Density
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class WorkspaceAccessibilityRegressionTest {
    @get:Rule val compose = createComposeRule()

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
        assertFalse(layouts.single().hasVisualOverflow)
        assertTrue(layouts.single().lineCount >= 6)
    }
}
