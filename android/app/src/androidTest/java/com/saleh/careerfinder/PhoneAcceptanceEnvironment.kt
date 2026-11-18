package com.saleh.careerfinder

import android.content.Context
import android.view.View
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue

/** The dedicated CI phone remains Arabic, RTL and at least 180% text.
 * ComponentActivity fixtures must perform the same platform-preference sync as
 * MainActivity before mounting the production content. No OS setting is changed.
 */
internal fun phoneAcceptanceStrings(context: Context): CareerStrings {
    synchronizePlatformLanguage(context)
    val configuration = context.resources.configuration
    assertEquals("Acceptance must retain Arabic app resources", "ar", configuration.locales[0].language)
    assertEquals("Acceptance must retain RTL resources", View.LAYOUT_DIRECTION_RTL, configuration.layoutDirection)
    assertTrue("Acceptance must retain at least 180% text", configuration.fontScale >= 1.79f)
    return CareerStrings(context)
}

/** Assert the rendered composition as well as the emulator's recorded settings. */
@Composable
internal fun PhoneAcceptanceContent(content: @Composable () -> Unit) {
    CareerLanguage {
        val strings = rememberCareerStrings()
        val direction = LocalLayoutDirection.current
        val configuration = LocalConfiguration.current
        SideEffect {
            assertEquals("The rendered acceptance content must be Arabic", "ar", strings.locale.language)
            assertEquals("The rendered acceptance content must be RTL", LayoutDirection.Rtl, direction)
            assertTrue("The rendered acceptance content must retain enlarged text", configuration.fontScale >= 1.79f)
        }
        CareerTheme(content = content)
    }
}
