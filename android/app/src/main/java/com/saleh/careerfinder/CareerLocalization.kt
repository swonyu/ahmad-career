package com.saleh.careerfinder

import android.app.LocaleManager
import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import android.content.res.Configuration
import android.content.res.Resources
import android.os.Build
import android.os.LocaleList
import android.text.BidiFormatter
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import org.json.JSONArray
import java.text.Normalizer
import java.time.LocalDate
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/** Comparison-only matching; original fields, URLs and opaque identities never change. */
internal object SavedSearch {
    fun normalized(value: String): String {
        val canonical = Normalizer.normalize(value, Normalizer.Form.NFC)
        val cleaned = buildString {
            for (character in canonical) {
                if (character != '\u0640' && character !in '\u064B'..'\u0652' && character != '\u0670') append(character)
            }
        }
        return Normalizer.normalize(cleaned.lowercase(Locale.ROOT), Normalizer.Form.NFC)
    }
    fun terms(query: String): List<String> {
        val terms = mutableListOf<String>()
        val current = StringBuilder()
        for (character in normalized(query)) {
            if (character.isWhitespace()) {
                if (current.isNotEmpty()) { terms += current.toString(); current.setLength(0) }
            } else current.append(character)
        }
        if (current.isNotEmpty()) terms += current.toString()
        return terms
    }
    fun matches(fields: List<String>, query: String): Boolean = matches(fields, terms(query))
    fun matches(fields: List<String>, requested: List<String>): Boolean {
        if (requested.isEmpty()) return true
        val searchable = normalized(fields.joinToString(" "))
        return requested.all { searchable.contains(it) }
    }
}

/** Inputs come only from the displayed workspace's already-scoped record bundle. */
internal fun savedOpportunityMatches(job: Opportunity, record: ApplicationRecordBundle?, query: String): Boolean {
    return savedOpportunityMatches(job, record, SavedSearch.terms(query))
}
internal fun savedOpportunityMatches(job: Opportunity, record: ApplicationRecordBundle?, terms: List<String>): Boolean {
    val notes = record?.takeIf { it.identity == BoundaryPolicy.jobIdentity(job.url) }?.let { listOf(it.current.record.note) + it.alternatives.map { version -> version.record.note } }.orEmpty()
    return SavedSearch.matches(listOf(job.title, job.company, job.location, job.country) + notes, terms)
}

internal enum class LanguagePreference(val value: String, val title: String) {
    SYSTEM("system", "Device language"), ENGLISH("en", "English"), ARABIC("ar", "العربية");
    companion object { fun fromStored(value: String?) = entries.firstOrNull { it.value == value } ?: SYSTEM }
}
/** Ordered device-language fallback, without treating Aramaic (arc) as Arabic. */
internal fun supportedCareerLanguage(languages: List<String>): String =
    languages.map { Locale.forLanguageTag(it.replace('_', '-')).language }.firstOrNull { it == "ar" || it == "en" } ?: "en"

private const val LANGUAGE_FILE = "career_display_language"
private const val LANGUAGE_KEY = "selection"
private const val LANGUAGE_MIGRATED = "platform_migrated"
internal fun readLanguagePreference(context: Context) = LanguagePreference.fromStored(
    context.getSharedPreferences(LANGUAGE_FILE, Context.MODE_PRIVATE).getString(LANGUAGE_KEY, null))

/** Synchronize Android 13's per-app setting; the preference file contains no account or workspace data. */
internal fun synchronizePlatformLanguage(context: Context) {
    if (Build.VERSION.SDK_INT < 33) return
    val preferences = context.getSharedPreferences(LANGUAGE_FILE, Context.MODE_PRIVATE)
    val manager = context.getSystemService(LocaleManager::class.java) ?: return
    if (!preferences.getBoolean(LANGUAGE_MIGRATED, false)) {
        val previous = readLanguagePreference(context)
        preferences.edit().putBoolean(LANGUAGE_MIGRATED, true).apply()
        if (manager.applicationLocales.isEmpty && previous != LanguagePreference.SYSTEM) {
            manager.applicationLocales = LocaleList.forLanguageTags(previous.value)
        }
    }
    val selected = if (manager.applicationLocales.isEmpty) LanguagePreference.SYSTEM
        else LanguagePreference.fromStored(manager.applicationLocales[0].language)
    if (readLanguagePreference(context) != selected) preferences.edit().putString(LANGUAGE_KEY, selected.value).apply()
}

private fun chooseLanguage(context: Context, choice: LanguagePreference) {
    context.getSharedPreferences(LANGUAGE_FILE, Context.MODE_PRIVATE).edit().putString(LANGUAGE_KEY, choice.value).apply()
    if (Build.VERSION.SDK_INT >= 33) {
        context.getSystemService(LocaleManager::class.java)?.applicationLocales =
            if (choice == LanguagePreference.SYSTEM) LocaleList.getEmptyLocaleList() else LocaleList.forLanguageTags(choice.value)
    }
}

internal data class LanguageController(val preference: LanguagePreference, val select: (LanguagePreference) -> Unit)
internal val LocalCareerLanguage = staticCompositionLocalOf<LanguageController> { error("CareerLanguage is required") }

private class LocalizedDisplayContext(base: Context, private val localizedResources: Resources) : ContextWrapper(base) {
    override fun getResources(): Resources = localizedResources
    override fun getAssets() = localizedResources.assets
}

/** Locale changes recompose display only. The ViewModel, saveable state and open draft owners are preserved. */
@Composable
internal fun CareerLanguage(content: @Composable () -> Unit) {
    val context = LocalContext.current
    val systemConfiguration = LocalConfiguration.current
    val preferences = remember(context) { context.getSharedPreferences(LANGUAGE_FILE, Context.MODE_PRIVATE) }
    var selection by remember(preferences) { mutableStateOf(readLanguagePreference(context)) }
    DisposableEffect(preferences) {
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
            if (key == LANGUAGE_KEY) selection = readLanguagePreference(context)
        }
        preferences.registerOnSharedPreferenceChangeListener(listener)
        onDispose { preferences.unregisterOnSharedPreferenceChangeListener(listener) }
    }
    val deviceLocales = if (Build.VERSION.SDK_INT >= 33) {
        context.getSystemService(LocaleManager::class.java)?.systemLocales ?: Resources.getSystem().configuration.locales
    } else Resources.getSystem().configuration.locales
    val language = if (selection == LanguagePreference.SYSTEM) {
        supportedCareerLanguage((0 until deviceLocales.size()).map { deviceLocales[it].toLanguageTag() })
    } else selection.value
    val locale = remember(language) { Locale.forLanguageTag(language) }
    val configuration = remember(systemConfiguration, language) {
        Configuration(systemConfiguration).apply { setLocales(LocaleList(locale)); setLayoutDirection(locale) }
    }
    val localizedContext = remember(context, configuration) {
        LocalizedDisplayContext(context, context.createConfigurationContext(configuration).resources)
    }
    CompositionLocalProvider(
        LocalContext provides localizedContext,
        LocalConfiguration provides configuration,
        LocalLayoutDirection provides if (language == "ar") LayoutDirection.Rtl else LayoutDirection.Ltr,
        LocalCareerLanguage provides LanguageController(selection) { chooseLanguage(context, it) },
    ) { content() }
}

@Composable
internal fun rememberCareerStrings(): CareerStrings {
    val context = LocalContext.current
    val configuration = LocalConfiguration.current
    return remember(context, configuration.locales.toLanguageTags()) { CareerStrings(context) }
}

/** Explicit UI-copy boundary; employer content, profile values, URLs and wire enums remain unchanged. */
internal class CareerStrings(private val context: Context) {
    val locale: Locale = context.resources.configuration.locales[0]
    private val arabic = locale.language == "ar"
    private data class Template(val key: String, val parts: List<String>, val arguments: Int)
    private val templates by lazy {
        val source = context.resources.openRawResource(R.raw.native_copy_templates).bufferedReader().use { it.readText() }
        val entries = JSONArray(source)
        (0 until entries.length()).mapNotNull { index ->
            val item = entries.getJSONObject(index)
            val arguments = item.getInt("arguments")
            val pieces = item.getJSONArray("parts")
            val parts = (0 until pieces.length()).map { pieces.getString(it) }
            if (arguments !in 1..12 || parts.size != arguments + 1 || parts.drop(1).dropLast(1).any { it.isEmpty() } || parts.sumOf { it.length } < 6) null
            else Template(item.getString("key"), parts, arguments)
        }
    }
    private fun match(text: String, template: Template): List<String>? {
        if (!text.startsWith(template.parts[0])) return null
        var cursor = template.parts[0].length
        val values = mutableListOf<String>()
        for (index in 1..template.arguments) {
            val delimiter = template.parts[index]
            if (delimiter.isEmpty() && index == template.arguments) {
                values += text.substring(cursor); cursor = text.length
            } else if (index == template.arguments) {
                if (!text.endsWith(delimiter)) return null
                val start = text.length - delimiter.length
                if (start < cursor) return null
                values += text.substring(cursor, start); cursor = text.length
            } else {
                val found = text.indexOf(delimiter, cursor)
                if (found < 0) return null
                values += text.substring(cursor, found); cursor = found + delimiter.length
            }
        }
        return values.takeIf { cursor == text.length }
    }
    private fun value(key: String): String? = nativeStringIds[key]?.let { context.getString(it) }
    private fun interpolate(format: String, arguments: List<String>): String = Regex("\\{([0-9]+)\\}").replace(format) { match ->
        val index = match.groupValues[1].toIntOrNull()
        val argument = index?.let { arguments.getOrNull(it) } ?: return@replace match.value
        if (arabic) BidiFormatter.getInstance(locale).unicodeWrap(argument) else argument
    }
    operator fun invoke(text: String): String {
        if (!arabic) return text
        value(text)?.let { return it }
        if (text.length > 12_000) return text
        for (template in templates) {
            val arguments = match(text, template) ?: continue
            val translated = value(template.key) ?: continue
            return interpolate(translated, arguments)
        }
        return text
    }
    fun format(key: String, arguments: List<String>): String = interpolate(if (arabic) value(key) ?: key else key, arguments)
    /** Unknown details remain original beneath a general localized prefix. */
    fun message(text: String): String {
        val translated = invoke(text)
        return if (arabic && translated == text && text.none { it in '\u0600'..'\u06ff' } && text.any { it in 'A'..'Z' || it in 'a'..'z' })
            invoke("This action could not be completed. Original details:") + "\n" + BidiFormatter.getInstance(locale).unicodeWrap(text) else translated
    }
    fun date(value: LocalDate): String = value.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale))
    fun civilDate(value: String): String = runCatching { date(LocalDate.parse(BoundaryPolicy.civilDate(value))) }
        .getOrElse { invoke("Date not set") }
    fun dateTime(value: String): String = runCatching {
        DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM).withLocale(locale).withZone(ZoneId.systemDefault()).format(Instant.parse(value))
    }.getOrElse { invoke("Time not recorded") }
}
