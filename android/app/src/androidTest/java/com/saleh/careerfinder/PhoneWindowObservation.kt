package com.saleh.careerfinder

import android.accessibilityservice.AccessibilityServiceInfo
import android.graphics.Rect as AndroidRect
import android.view.accessibility.AccessibilityWindowInfo
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertTrue

/** Observes the real windows of the disposable fixture; it never hides the keyboard for the test. */
internal class PhoneWindowObservation : AutoCloseable {
    private val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
    private val originalFlags = requireNotNull(automation.serviceInfo).flags

    init {
        automation.serviceInfo = requireNotNull(automation.serviceInfo).apply {
            flags = flags or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
        }
    }

    fun imeVisible(): Boolean {
        val windows = automation.windows
        assertTrue("Interactive application windows must be observable before checking the IME",
            windows.isNotEmpty() && windows.any { it.type == AccessibilityWindowInfo.TYPE_APPLICATION })
        return windows.any { window ->
            val bounds = AndroidRect()
            window.getBoundsInScreen(bounds)
            window.type == AccessibilityWindowInfo.TYPE_INPUT_METHOD && !bounds.isEmpty
        }
    }

    override fun close() {
        automation.serviceInfo = requireNotNull(automation.serviceInfo).apply { flags = originalFlags }
    }
}

internal fun containsVisibleRect(visible: Rect, full: Rect, tolerance: Float = 1f): Boolean =
    full.width > 0f && full.height > 0f &&
        listOf(full.left, full.top, full.right, full.bottom).all(Float::isFinite) &&
        full.left >= visible.left - tolerance && full.top >= visible.top - tolerance &&
        full.right <= visible.right + tolerance && full.bottom <= visible.bottom + tolerance

/** A partially clipped semantics node is insufficient evidence of a reachable touch target. */
internal fun assertFullyVisible(interaction: SemanticsNodeInteraction) {
    interaction.assertIsDisplayed()
    val node = interaction.fetchSemanticsNode()
    assertTrue("The control must belong to a placed, attached layout",
        node.layoutInfo.isPlaced && node.layoutInfo.coordinates.isAttached)
    val position = node.positionInRoot
    val full = Rect(position.x, position.y,
        position.x + node.size.width, position.y + node.size.height)
    assertTrue("The whole control must be inside its clipped visible bounds",
        containsVisibleRect(node.boundsInRoot, full))
    val screen = node.positionOnScreen
    val metrics = InstrumentationRegistry.getInstrumentation().targetContext.resources.displayMetrics
    assertTrue("The whole control must be inside the physical display",
        containsVisibleRect(Rect(0f, 0f, metrics.widthPixels.toFloat(), metrics.heightPixels.toFloat()),
            Rect(screen.x, screen.y, screen.x + node.size.width, screen.y + node.size.height)))
}
