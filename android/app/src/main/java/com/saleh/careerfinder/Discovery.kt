package com.saleh.careerfinder

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.net.URL
import java.net.URLEncoder
import java.time.Instant
import javax.net.ssl.HttpsURLConnection

data class DiscoveryFilters(val query: String = "", val location: String = "", val remoteOnly: Boolean = false,
    val sources: List<String> = emptyList()) {
    fun cleaned() = copy(query = query.trim(), location = location.trim(), sources = sources.map(String::trim).filter(String::isNotBlank).distinct())
}
data class DiscoverySource(val id: String, val name: String, val provider: String, val region: String, val board: String, val boardUrl: String)
data class DiscoveryCatalog(val defaults: List<String>, val sources: List<DiscoverySource>, val maxSources: Int, val notice: String)
data class DiscoverySourceStatus(val id: String, val name: String, val provider: String, val boardUrl: String,
    val status: String, val checkedAt: String?, val availableCount: Int, val matchedCount: Int, val limited: Boolean, val error: String?)
data class DiscoveredJob(val id: String, val sourceId: String, val sourceName: String, val provider: String,
    val title: String, val company: String, val url: String, val location: String, val country: String?, val remote: Boolean?,
    val summary: String, val publishedAt: String?, val updatedAt: String?, val checkedAt: String, val stale: Boolean)
data class DiscoveryPage(val generatedAt: String, val status: String, val jobs: List<DiscoveredJob>,
    val sources: List<DiscoverySourceStatus>, val nextCursor: String?, val totalMatches: Int, val limited: Boolean, val notice: String)
data class DiscoveryUiState(val catalog: DiscoveryCatalog? = null, val catalogLoading: Boolean = false, val catalogError: String? = null,
    val filters: DiscoveryFilters = DiscoveryFilters(), val displayedFilters: DiscoveryFilters? = null,
    val jobs: List<DiscoveredJob> = emptyList(), val sources: List<DiscoverySourceStatus> = emptyList(),
    val status: String? = null, val generatedAt: String? = null, val nextCursor: String? = null, val totalMatches: Int = 0,
    val limited: Boolean = false, val notice: String = "", val loading: Boolean = false, val loadingMore: Boolean = false,
    val error: String? = null, val retryAtMillis: Long = 0, val cursorInvalid: Boolean = false) {
    val filtersChanged: Boolean get() = displayedFilters != null && displayedFilters != filters.cleaned()
}

class DiscoveryFailure(val status: Int, val code: String, override val message: String,
    val retryAfterSeconds: Int? = null) : Exception(message)

interface DiscoveryService {
    suspend fun sources(): DiscoveryCatalog
    suspend fun search(filters: DiscoveryFilters, cursor: String?): DiscoveryPage
}

/** Public discovery never receives a paired connection, bearer token, profile or PDF. */
object PublicDiscoveryService : DiscoveryService {
    private val boardHosts = setOf("boards.greenhouse.io", "job-boards.greenhouse.io", "jobs.lever.co", "jobs.eu.lever.co")
    fun supportedSource(input: String): Boolean =
        input.matches(Regex("(?:greenhouse:|lever:(?:global|eu):)[A-Za-z0-9_-]{1,80}")) || runCatching {
            val url = URI(BoundaryPolicy.opportunityURL(input))
            url.host.lowercase() in boardHosts && url.port == -1 && !url.path.isNullOrBlank() && url.path != "/"
        }.getOrDefault(false)

    fun searchURL(filters: DiscoveryFilters, cursor: String?): String {
        val clean = filters.cleaned()
        require(clean.query.length <= 120 && clean.location.length <= 100) { "Shorten the keywords or location and try again." }
        require(clean.sources.size <= 4 && clean.sources.all(::supportedSource)) { "Choose up to four public Lever or Greenhouse employer boards." }
        require(cursor == null || cursor.length in 1..8192) { "Start a fresh search to continue." }
        val values = clean.sources.map { "source" to it } + listOf("q" to clean.query, "location" to clean.location,
            "remote" to if (clean.remoteOnly) "remote" else "any") + listOfNotNull(cursor?.let { "cursor" to it })
        val query = values.joinToString("&") { (key, value) -> key + "=" + URLEncoder.encode(value, "UTF-8") }
        return ServicePages.DEFAULT_ORIGIN + "/api/discovery/search?" + query
    }

    override suspend fun sources() = DiscoveryCodec.catalog(get(ServicePages.DEFAULT_ORIGIN + "/api/discovery/sources"))
    override suspend fun search(filters: DiscoveryFilters, cursor: String?) = DiscoveryCodec.page(get(searchURL(filters, cursor)))

    private suspend fun get(address: String): JSONObject = withContext(Dispatchers.IO) {
        val socket = URL(address).openConnection() as HttpsURLConnection
        socket.instanceFollowRedirects = false
        socket.connectTimeout = 15_000
        socket.readTimeout = 25_000
        socket.useCaches = false
        socket.requestMethod = "GET"
        socket.setRequestProperty("Accept", "application/json")
        socket.setRequestProperty("Cache-Control", "no-store")
        socket.setRequestProperty("Cookie", "")
        try {
            val status = socket.responseCode
            val retry = socket.getHeaderField("Retry-After")?.toIntOrNull()?.coerceIn(0, 86_400)
            if (status in 300..399) throw DiscoveryFailure(status, "redirect", "The search service redirected its response. Try again later.")
            if (socket.contentType?.substringBefore(';')?.trim()?.lowercase() != "application/json")
                throw DiscoveryFailure(status, "invalid_response", "Job results could not be verified. Earlier results are still available.", retry)
            val stream = if (status in 200..299) socket.inputStream else socket.errorStream
            val bytes = stream?.use { BoundaryPolicy.readBounded(it, BoundaryPolicy.MAX_RESPONSE_BYTES) }
                ?: throw DiscoveryFailure(status, "empty_response", "The search service returned no results. Try again later.", retry)
            currentCoroutineContext().ensureActive()
            val response = try { JSONObject(String(bytes, Charsets.UTF_8)) }
                catch (_: Exception) { throw DiscoveryFailure(status, "invalid_response", "Job results could not be verified. Earlier results are still available.", retry) }
            if (status !in 200..299 || response.opt("ok") != true) {
                val error = response.optJSONObject("error")
                throw DiscoveryFailure(status, error?.safeString("code") ?: "search_failed",
                    error?.safeString("message")?.take(500)?.ifBlank { null } ?: "The search could not be completed. Try again later.", retry)
            }
            response
        } finally { socket.disconnect() }
    }
}

/** Strict response parsing prevents malformed results from replacing an earlier valid search. */
object DiscoveryCodec {
    private fun valid(value: Boolean) { require(value) { "Job results could not be verified. Earlier results are still available." } }
    private fun JSONObject.text(key: String, blank: Boolean = false): String {
        val value = opt(key); valid(value is String && (blank || value.isNotBlank())); return value as String
    }
    private fun JSONObject.nullableText(key: String): String? {
        valid(has(key)); if (isNull(key)) return null
        return text(key)
    }
    private fun JSONObject.integer(key: String): Int {
        val number = opt(key); valid(number is Number && number.toDouble() >= 0 && number.toDouble() <= Int.MAX_VALUE && number.toDouble() % 1.0 == 0.0)
        return (number as Number).toInt()
    }
    private fun JSONObject.flag(key: String): Boolean { valid(opt(key) is Boolean); return getBoolean(key) }
    private fun JSONObject.objects(key: String): List<JSONObject> {
        val array = opt(key); valid(array is JSONArray)
        return (0 until (array as JSONArray).length()).map { val item = array.opt(it); valid(item is JSONObject); item as JSONObject }
    }
    private fun instant(value: String?): String? { if (value != null) valid(runCatching { Instant.parse(value) }.isSuccess); return value }
    private fun https(value: String) = BoundaryPolicy.opportunityURL(value)
    private fun header(value: JSONObject) { valid(value.opt("ok") == true && value.opt("version") == 1) }
    fun catalog(value: JSONObject): DiscoveryCatalog {
        header(value)
        val sources = value.objects("sources").map { DiscoverySource(it.text("id"), it.text("name"), it.text("provider"),
            it.text("region", true), it.text("board"), https(it.text("boardUrl"))) }
        val defaults = value.requiredStrings("defaultSources")
        val limits = value.optJSONObject("limits"); valid(limits != null)
        val max = limits!!.integer("maxSources"); valid(max in 1..4 && sources.size <= 100 && defaults.size <= max)
        valid(sources.map { it.id }.distinct().size == sources.size && defaults.all { id -> sources.any { it.id == id } })
        return DiscoveryCatalog(defaults, sources, max, value.text("notice", true))
    }
    fun page(value: JSONObject): DiscoveryPage {
        header(value)
        val status = value.text("status"); valid(status in setOf("complete", "partial", "unavailable"))
        val jobs = value.objects("jobs").map { item ->
            val country = item.nullableText("country"); valid(country == null || country.matches(Regex("[A-Za-z]{2}")))
            valid(item.has("remote") && (item.isNull("remote") || item.opt("remote") is Boolean))
            DiscoveredJob(item.text("id"), item.text("sourceId"), item.text("sourceName"), item.text("provider"),
                item.text("title"), item.text("company"), https(item.text("url")), item.text("location", true), country,
                if (item.isNull("remote")) null else item.getBoolean("remote"), item.text("summary", true),
                instant(item.nullableText("publishedAt")), instant(item.nullableText("updatedAt")), instant(item.text("checkedAt"))!!, item.flag("stale"))
        }
        valid(jobs.size <= 50 && jobs.map { it.id }.distinct().size == jobs.size)
        val sources = value.objects("sources").map { item ->
            val state = item.text("status"); valid(state in setOf("fresh", "cached", "stale", "unavailable"))
            valid(item.has("error") && (item.isNull("error") || item.opt("error") is JSONObject))
            DiscoverySourceStatus(item.text("id"), item.text("name"), item.text("provider"), https(item.text("boardUrl")), state,
                instant(item.nullableText("checkedAt")), item.integer("availableCount"), item.integer("matchedCount"), item.flag("limited"),
                item.optJSONObject("error")?.text("message"))
        }
        valid(sources.size <= 4 && sources.map { it.id }.distinct().size == sources.size && jobs.all { job -> sources.any { it.id == job.sourceId } })
        val cursor = value.nullableText("nextCursor"); valid(cursor == null || cursor.length <= 8192)
        val total = value.integer("totalMatches"); valid(total >= jobs.size)
        return DiscoveryPage(instant(value.text("generatedAt"))!!, status, jobs, sources, cursor,
            total, value.flag("limited"), value.text("notice", true))
    }
}

class DiscoveryController(private val scope: CoroutineScope, private val service: DiscoveryService = PublicDiscoveryService) {
    private val mutable = MutableStateFlow(DiscoveryUiState())
    val state = mutable.asStateFlow()
    private var catalogJob: Job? = null
    private var searchJob: Job? = null
    private var generation = 0L

    fun loadSources() {
        if (state.value.catalog != null || catalogJob?.isActive == true) return
        mutable.update { it.copy(catalogLoading = true, catalogError = null) }
        catalogJob = scope.launch {
            try { val catalog = service.sources(); mutable.update { it.copy(catalog = catalog) } }
            catch (cancel: CancellationException) { throw cancel }
            catch (_: Exception) { mutable.update { it.copy(catalogError = "Employer boards could not be loaded. You can retry or search the recommended boards.") } }
            finally { mutable.update { it.copy(catalogLoading = false) } }
        }
    }
    fun editFilters(change: (DiscoveryFilters) -> DiscoveryFilters) {
        val next = change(state.value.filters).let { it.copy(query = it.query.take(120), location = it.location.take(100)) }
        if (next == state.value.filters) return
        generation++; searchJob?.cancel()
        mutable.update { it.copy(filters = next, loading = false, loadingMore = false, error = null) }
    }
    fun cancelSearch() {
        generation++; searchJob?.cancel()
        mutable.update { it.copy(loading = false, loadingMore = false, error = "Search stopped. Any earlier results are kept.") }
    }
    fun search(more: Boolean = false) {
        val current = state.value
        if (current.loading) return
        if (System.currentTimeMillis() < current.retryAtMillis) {
            mutable.update { it.copy(error = "The search service asked for a short wait. Try again after " + Instant.ofEpochMilli(it.retryAtMillis) + ".") }; return
        }
        val filters = current.filters.cleaned()
        val cursor = if (more) current.nextCursor?.takeIf { !current.filtersChanged && !current.cursorInvalid } ?: return else null
        try { PublicDiscoveryService.searchURL(filters, cursor) }
        catch (error: IllegalArgumentException) { mutable.update { it.copy(error = error.message) }; return }
        val request = ++generation
        searchJob?.cancel()
        mutable.update { it.copy(loading = true, loadingMore = more, error = null) }
        searchJob = scope.launch {
            try {
                val page = service.search(filters, cursor)
                currentCoroutineContext().ensureActive()
                if (request != generation || state.value.filters.cleaned() != filters) return@launch
                if (page.status == "unavailable") {
                    mutable.update { it.copy(sources = page.sources, status = page.status, notice = page.notice,
                        error = if (it.jobs.isEmpty()) "The selected employer boards could not be reached. Try again or choose other boards."
                            else "The selected employer boards could not be reached. Your earlier results are still shown.") }
                    return@launch
                }
                mutable.update { it.copy(jobs = ((if (more) it.jobs else emptyList()) + page.jobs).distinctBy(DiscoveredJob::id),
                    displayedFilters = filters, sources = page.sources, status = page.status, generatedAt = page.generatedAt,
                    nextCursor = page.nextCursor, totalMatches = page.totalMatches, limited = page.limited, notice = page.notice,
                    error = null, retryAtMillis = 0, cursorInvalid = false) }
            } catch (cancel: CancellationException) { throw cancel }
            catch (error: Exception) {
                if (request != generation) return@launch
                val changed = error is DiscoveryFailure && error.code == "discovery_changed"
                mutable.update { it.copy(error = when {
                    changed -> "These employer boards changed since the last page. Start a new search; your earlier results are still shown."
                    error is DiscoveryFailure || error is IllegalArgumentException -> error.message
                    else -> "The search could not be completed. Earlier results are kept; check your connection and try again."
                }, nextCursor = if (changed) null else it.nextCursor, cursorInvalid = changed || it.cursorInvalid,
                    retryAtMillis = if (error is DiscoveryFailure && error.retryAfterSeconds != null)
                        System.currentTimeMillis() + error.retryAfterSeconds * 1000L else it.retryAtMillis) }
            } finally { if (request == generation) mutable.update { it.copy(loading = false, loadingMore = false) } }
        }
    }
}
