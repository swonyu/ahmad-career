package com.saleh.careerfinder

import android.app.Activity
import android.content.Context
import android.content.SharedPreferences
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.style.TextDirection
import androidx.core.view.WindowCompat

internal const val APPEARANCE_PREFERENCES = "career-display-preferences"
internal const val APPEARANCE_KEY = "appearance"

internal enum class AppearancePreference(val value: String, val title: String) {
    SYSTEM("system", "System"), LIGHT("light", "Light"), DARK("dark", "Dark");

    companion object {
        fun fromStored(value: String?) = entries.firstOrNull { it.value == value } ?: SYSTEM
    }
}

internal fun readAppearancePreference(context: Context) = AppearancePreference.fromStored(
    context.getSharedPreferences(APPEARANCE_PREFERENCES, Context.MODE_PRIVATE).getString(APPEARANCE_KEY, null)
)

internal data class AppearanceController(val preference: AppearancePreference, val select: (AppearancePreference) -> Unit)
internal val LocalAppearance = staticCompositionLocalOf<AppearanceController> { error("CareerTheme is required") }

@Composable
internal fun CareerTheme(content: @Composable () -> Unit) {
    val context = LocalContext.current
    val preferences = remember(context.applicationContext) {
        context.applicationContext.getSharedPreferences(APPEARANCE_PREFERENCES, Context.MODE_PRIVATE)
    }
    var appearance by remember(preferences) {
        mutableStateOf(AppearancePreference.fromStored(preferences.getString(APPEARANCE_KEY, null)))
    }
    DisposableEffect(preferences) {
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
            if (key == null || key == APPEARANCE_KEY) {
                appearance = AppearancePreference.fromStored(preferences.getString(APPEARANCE_KEY, null))
            }
        }
        preferences.registerOnSharedPreferenceChangeListener(listener)
        onDispose { preferences.unregisterOnSharedPreferenceChangeListener(listener) }
    }
    val systemDark = isSystemInDarkTheme()
    val dark = when (appearance) {
        AppearancePreference.SYSTEM -> systemDark
        AppearancePreference.LIGHT -> false
        AppearancePreference.DARK -> true
    }
    val colors = if (dark) darkColorScheme(
        primary = Color(0xFFB6B0FF), onPrimary = Color(0xFF242044),
        primaryContainer = Color(0xFF36305A), onPrimaryContainer = Color(0xFFE8E5FF),
        secondary = Color(0xFFC5C6DC), onSecondary = Color(0xFF2D2E40),
        secondaryContainer = Color(0xFF303344), onSecondaryContainer = Color(0xFFE4E5F5),
        tertiary = Color(0xFFD1B9EF), onTertiary = Color(0xFF382447),
        tertiaryContainer = Color(0xFF4E3A5D), onTertiaryContainer = Color(0xFFF0DDFE),
        background = Color(0xFF10121B), onBackground = Color(0xFFE7E8F2),
        surface = Color(0xFF1B1E2B), onSurface = Color(0xFFE7E8F2),
        surfaceVariant = Color(0xFF292D3E), onSurfaceVariant = Color(0xFFBEC1D3),
        surfaceTint = Color(0xFFB6B0FF),
        surfaceDim = Color(0xFF10121B), surfaceBright = Color(0xFF353847),
        surfaceContainerLowest = Color(0xFF0D0F17), surfaceContainerLow = Color(0xFF171A25),
        surfaceContainer = Color(0xFF1B1E2B), surfaceContainerHigh = Color(0xFF252837),
        surfaceContainerHighest = Color(0xFF303343),
        outline = Color(0xFF8D91A6), outlineVariant = Color(0xFF41465C),
        inverseSurface = Color(0xFFE7E8F2), inverseOnSurface = Color(0xFF252837), inversePrimary = Color(0xFF5B50CE)
    ) else lightColorScheme(
        primary = Color(0xFF5B50CE), onPrimary = Color.White,
        primaryContainer = Color(0xFFE8E5FF), onPrimaryContainer = Color(0xFF262046),
        secondary = Color(0xFF555B75), onSecondary = Color.White,
        secondaryContainer = Color(0xFFE8EAF5), onSecondaryContainer = Color(0xFF292E42),
        tertiary = Color(0xFF715383), onTertiary = Color.White,
        tertiaryContainer = Color(0xFFF0DDFE), onTertiaryContainer = Color(0xFF382447),
        background = Color(0xFFF4F5FA), onBackground = Color(0xFF151824),
        surface = Color.White, onSurface = Color(0xFF151824),
        surfaceVariant = Color(0xFFE9EBF5), onSurfaceVariant = Color(0xFF52596E),
        surfaceTint = Color(0xFF5B50CE),
        surfaceDim = Color(0xFFDCDDE5), surfaceBright = Color.White,
        surfaceContainerLowest = Color.White, surfaceContainerLow = Color(0xFFF7F8FC),
        surfaceContainer = Color(0xFFF0F1F8), surfaceContainerHigh = Color(0xFFE9EBF5),
        surfaceContainerHighest = Color(0xFFE2E4EE),
        outline = Color(0xFF757C93), outlineVariant = Color(0xFFD5D9E8),
        inverseSurface = Color(0xFF292D3E), inverseOnSurface = Color(0xFFF4F5FA), inversePrimary = Color(0xFFB6B0FF)
    )
    val typography = Typography().run {
        copy(displayLarge = displayLarge.copy(textDirection = TextDirection.Content),
            displayMedium = displayMedium.copy(textDirection = TextDirection.Content),
            displaySmall = displaySmall.copy(textDirection = TextDirection.Content),
            headlineLarge = headlineLarge.copy(textDirection = TextDirection.Content),
            headlineMedium = headlineMedium.copy(textDirection = TextDirection.Content),
            headlineSmall = headlineSmall.copy(textDirection = TextDirection.Content),
            titleLarge = titleLarge.copy(textDirection = TextDirection.Content),
            titleMedium = titleMedium.copy(textDirection = TextDirection.Content),
            titleSmall = titleSmall.copy(textDirection = TextDirection.Content),
            bodyLarge = bodyLarge.copy(textDirection = TextDirection.Content),
            bodyMedium = bodyMedium.copy(textDirection = TextDirection.Content),
            bodySmall = bodySmall.copy(textDirection = TextDirection.Content),
            labelLarge = labelLarge.copy(textDirection = TextDirection.Content),
            labelMedium = labelMedium.copy(textDirection = TextDirection.Content),
            labelSmall = labelSmall.copy(textDirection = TextDirection.Content))
    }
    val view = LocalView.current
    if (!view.isInEditMode) SideEffect {
        (view.context as? Activity)?.window?.let { window ->
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !dark
                isAppearanceLightNavigationBars = !dark
            }
        }
    }
    CompositionLocalProvider(LocalAppearance provides AppearanceController(appearance) { selected ->
        appearance = selected
        preferences.edit().putString(APPEARANCE_KEY, selected.value).apply()
    }) {
        MaterialTheme(colorScheme = colors, typography = typography, content = content)
    }
}
