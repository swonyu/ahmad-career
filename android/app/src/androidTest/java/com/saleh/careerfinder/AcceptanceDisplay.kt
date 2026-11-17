package com.saleh.careerfinder

import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import java.util.UUID

private class AcceptanceDisplayContext(base: Context, val preferences: SharedPreferences) : ContextWrapper(base) {
    override fun getSharedPreferences(name: String, mode: Int): SharedPreferences =
        if (name == "career_display_language") preferences else super.getSharedPreferences(name, mode)
}

/**
 * Existing English journey fixtures state their display language explicitly.
 * The real language implementation still runs; no platform locale, account,
 * workspace or shared application preference is changed. Other tests continue
 * to exercise the forced Arabic/RTL platform and the explicit bilingual flows.
 */
@Composable
internal fun EnglishAcceptanceLanguage(content: @Composable () -> Unit) {
    val base = LocalContext.current
    val context = remember(base) {
        val preferences = base.getSharedPreferences("acceptance-display-" + UUID.randomUUID(), Context.MODE_PRIVATE)
        check(preferences.edit().putString("selection", "en").commit())
        AcceptanceDisplayContext(base, preferences)
    }
    DisposableEffect(context) { onDispose { check(context.preferences.edit().clear().commit()) } }
    CompositionLocalProvider(LocalContext provides context) { CareerLanguage(content) }
}
