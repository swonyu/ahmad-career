package com.saleh.careerfinder

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.performScrollTo
import org.junit.Assert.assertTrue

/** Reveal the actual tab before the caller's existing touch action. */
internal fun SemanticsNodeInteraction.revealNavigationTab(): SemanticsNodeInteraction {
    val node = fetchSemanticsNode("The requested navigation tab must exist")
    val scrollAncestor = generateSequence(node.parent) { it.parent }.firstOrNull {
        it.config.contains(SemanticsProperties.HorizontalScrollAxisRange)
    }
    if (scrollAncestor != null) {
        assertTrue("The horizontal navigation must support real scrolling",
            scrollAncestor.config.contains(SemanticsActions.ScrollBy))
        performScrollTo()
    }
    // The regular navigation bar has no scroll ancestor and must already be visible.
    return assertIsDisplayed()
}
