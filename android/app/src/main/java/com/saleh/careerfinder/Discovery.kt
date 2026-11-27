package com.saleh.careerfinder

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.URI
import java.net.URL
import java.net.URLEncoder
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.time.Instant
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.HttpsURLConnection

data class DiscoveryFilters(val query: String = "", val location: String = "", val remoteOnly: Boolean = false,
    val sources: List<String> = emptyList()) {
    fun cleaned() = copy(query = query.trim(), location = location.trim(), sources = PublicDiscoveryService.canonicalSources(sources))
}
data class DiscoveryBoardIdentity(val id: String, val provider: String, val region: String, val board: String, val boardUrl: String)
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
    val error: String? = null, val retryAtMillis: Long = 0, val cursorInvalid: Boolean = false,
    val restoringSearch: Boolean = false, val restoredSearch: Boolean = false, val searchStorageError: String? = null,
    val searchRestoreBlocked: Boolean = false, val lastAttemptedFilters: DiscoveryFilters? = null,
    val submittedSearchFailed: Boolean = false, val newResult: DiscoveryNewResult? = null,
    val showNewOnly: Boolean = false) {
    val newJobIds: Set<String> get() = newResult?.takeUnless { it.baselineReset }?.newIds.orEmpty().toSet()
    val newJobCount: Int get() = jobs.count { it.id in newJobIds }
    val hasSearchComparison: Boolean get() = !newResult?.comparedSourceIds.isNullOrEmpty() && newResult?.baselineReset != true
    val visibleJobs: List<DiscoveredJob> get() = if (showNewOnly && hasSearchComparison) jobs.filter { it.id in newJobIds } else jobs
    val filtersChanged: Boolean get() = displayedFilters != null && displayedFilters != filters.cleaned()
    val canRetrySubmittedSearch: Boolean get() {
        if (loading || restoringSearch || (lastAttemptedFilters ?: displayedFilters) == null) return false
        if (submittedSearchFailed) return true
        val current = status
        if (current != null) return current == "partial" || current == "unavailable"
        // editFilters clears the error, but the submitted search stays retryable.
        return true
    }
}

/** Catalog keys only. The view localizes each one once. */
object DiscoveryPresentation {
    fun sourceAvailabilityKey(status: String, restored: Boolean) = when (status) {
        "fresh" -> if (restored) "Saved result from an earlier check" else "Fetched for this search"
        "cached" -> "Recent cached results"
        "stale" -> "Earlier cached results · refresh unavailable"
        else -> "Could not be reached"
    }
    fun emptyTitle(status: String?) = when (status) {
        "unavailable" -> "Current openings could not be checked."
        "partial" -> "No matches in the results we could check."
        "complete" -> "No matching jobs in these boards."
        else -> "No roles match this search."
    }
    fun emptyDetail(status: String?) = when (status) {
        "unavailable" -> "The selected boards did not return results. Retry the same search, or review the source details."
        "partial" -> "This search is incomplete. Review the source details, or retry the same search."
        "complete" -> "Try a broader job title, another location, or a different employer board."
        else -> "Try a broader title, another location or different employer boards. This search does not cover every employer."
    }
    fun offersSubmittedRetry(status: String?) = status == "partial" || status == "unavailable"
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

    /** Same acceptance rules as the committed hosted parseDiscoverySource. A null result is not a supported board. */
    fun canonicalBoard(raw: String): DiscoveryBoardIdentity? {
        if (raw.length > 2048) return null
        for (character in raw) {
            val code = character.code
            if (code <= 0x1f || code == 0x7f || character == '\\' || character.isWhitespace()) return null
        }
        if (raw.lowercase(Locale.ROOT).startsWith("https://")) return canonicalHttpsBoard(raw)
        val parts = splitKeep(raw, ':')
        if (parts.size == 2 && parts[0] == "greenhouse") return finishBoard("greenhouse", "global", parts[1])
        if (parts.size == 3 && parts[0] == "lever" && (parts[1] == "global" || parts[1] == "eu")) return finishBoard("lever", parts[1], parts[2])
        return null
    }

    fun canonicalSources(sources: List<String>): List<String> {
        val seen = HashSet<String>()
        val result = ArrayList<String>(sources.size)
        for (raw in sources) {
            val trimmed = raw.trim()
            if (trimmed.isEmpty()) continue
            val token = canonicalBoard(trimmed)?.id ?: trimmed
            if (seen.add(token)) result.add(token)
        }
        return result
    }

    fun hasDuplicateCanonical(sources: List<String>): Boolean {
        val seen = HashSet<String>()
        for (raw in sources) {
            val id = canonicalBoard(raw.trim())?.id ?: continue
            if (!seen.add(id)) return true
        }
        return false
    }

    fun sameBoard(left: String, right: String): Boolean {
        val leftId = canonicalBoard(left)?.id
        val rightId = canonicalBoard(right)?.id
        return if (leftId != null && rightId != null) leftId == rightId else left == right
    }

    fun searchURL(filters: DiscoveryFilters, cursor: String?): String {
        val clean = filters.cleaned()
        require(clean.query.length <= 120 && clean.location.length <= 100) { "Shorten the keywords or location and try again." }
        require(clean.sources.size <= 4) { "Choose up to four public Lever or Greenhouse employer boards." }
        require(clean.sources.all { canonicalBoard(it) != null }) { "Use a supported employer board or its public board URL." }
        require(cursor == null || cursor.length in 1..8192) { "Start a fresh search to continue." }
        val values = clean.sources.map { "source" to it } + listOf("q" to clean.query, "location" to clean.location,
            "remote" to if (clean.remoteOnly) "remote" else "any") + listOfNotNull(cursor?.let { "cursor" to it })
        val query = values.joinToString("&") { (key, value) -> key + "=" + URLEncoder.encode(value, "UTF-8") }
        return NativeHttpTransport.discoveryOrigin + "/api/discovery/search?" + query
    }

    private fun canonicalHttpsBoard(raw: String): DiscoveryBoardIdentity? {
        val headEnd = raw.indexOfAny(charArrayOf('?', '#')).let { if (it < 0) raw.length else it }
        val head = raw.substring(0, headEnd)
        if (Regex("""(?:/\.{1,2}(?:/|$)|%)""").containsMatchIn(head)) return null
        val uri = runCatching { URI(raw) }.getOrNull() ?: return null
        if (uri.scheme?.lowercase(Locale.ROOT) != "https" || uri.userInfo != null || uri.port != -1) return null
        if (!uri.fragment.isNullOrEmpty()) return null
        val rawPath = uri.rawPath ?: return null
        if (rawPath.contains('%')) return null
        val host = uri.host?.lowercase(Locale.ROOT) ?: return null
        val pairs = rawQueryPairs(raw) ?: return null
        if (host == "boards.greenhouse.io" || host == "job-boards.greenhouse.io") {
            if (rawPath == "/embed/job_board") {
                val tokens = pairs.filter { it.first == "for" }
                if (pairs.any { it.first != "for" } || tokens.size != 1) return null
                return finishBoard("greenhouse", "global", tokens[0].second)
            }
            val pieces = pathPieces(rawPath)
            val directJob = pieces.size == 3 && pieces[1] == "jobs" && Regex("""\d{1,20}""").matches(pieces[2])
            if (pieces.size != 1 && !directJob) return null
            if (!trackingAllowed(pairs)) return null
            return finishBoard("greenhouse", "global", pieces[0])
        }
        if (host == "jobs.lever.co" || host == "jobs.eu.lever.co") {
            val pieces = pathPieces(rawPath)
            val uuid = Regex("""[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}""")
            val posting = pieces.size == 2 && uuid.matches(pieces[1])
            val apply = pieces.size == 3 && uuid.matches(pieces[1]) && pieces[2] == "apply"
            if (pieces.size != 1 && !posting && !apply) return null
            if (!trackingAllowed(pairs)) return null
            return finishBoard("lever", if (host == "jobs.eu.lever.co") "eu" else "global", pieces[0])
        }
        return null
    }

    private fun trackingAllowed(pairs: List<Pair<String, String>>) = pairs.all { (key, _) ->
        Regex("""utm_[A-Za-z0-9_]+""").matches(key) || key == "gh_jid" || key == "lever-source" || key == "lever-origin" || key == "source"
    }

    private fun rawQueryPairs(raw: String): List<Pair<String, String>>? {
        val queryStart = raw.indexOf('?')
        if (queryStart < 0) return emptyList()
        var query = raw.substring(queryStart + 1)
        val hash = query.indexOf('#')
        if (hash >= 0) query = query.substring(0, hash)
        if (query.isEmpty()) return emptyList()
        val pairs = ArrayList<Pair<String, String>>()
        for (part in splitKeep(query, '&')) {
            val separator = part.indexOf('=')
            val key = if (separator < 0) part else part.substring(0, separator)
            val value = if (separator < 0) "" else part.substring(separator + 1)
            if (key.contains('%')) return null
            pairs.add(key to (percentDecode(value) ?: return null))
        }
        return pairs
    }

    private fun pathPieces(path: String): List<String> {
        val trimmed = if (path.length > 1 && path.endsWith('/')) path.dropLast(1) else path
        val parts = splitKeep(trimmed, '/')
        return if (parts.firstOrNull() == "") parts.drop(1) else parts
    }

    private fun splitKeep(value: String, separator: Char): List<String> {
        val parts = ArrayList<String>()
        var start = 0
        for (index in value.indices) {
            if (value[index] == separator) {
                parts.add(value.substring(start, index))
                start = index + 1
            }
        }
        parts.add(value.substring(start))
        return parts
    }

    private fun percentDecode(value: String): String? {
        val decoded = ByteArrayOutputStream(value.length)
        var index = 0
        while (index < value.length) {
            val character = value[index]
            if (character == '%') {
                if (index + 2 >= value.length) return null
                val high = Character.digit(value[index + 1], 16)
                val low = Character.digit(value[index + 2], 16)
                if (high < 0 || low < 0) return null
                decoded.write((high shl 4) + low)
                index += 3
            } else {
                decoded.write(character.toString().toByteArray(Charsets.UTF_8))
                index += 1
            }
        }
        return try {
            Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(decoded.toByteArray())).toString()
        } catch (_: CharacterCodingException) { null }
    }

    private fun finishBoard(provider: String, region: String, board: String): DiscoveryBoardIdentity? {
        if (!Regex("""[A-Za-z0-9][A-Za-z0-9_-]{0,79}""").matches(board)) return null
        val token = board.lowercase(Locale.ROOT)
        val id = if (provider == "greenhouse") "greenhouse:$token" else "lever:$region:$token"
        val host = if (provider == "greenhouse") "job-boards.greenhouse.io" else if (region == "eu") "jobs.eu.lever.co" else "jobs.lever.co"
        return DiscoveryBoardIdentity(id, provider, region, token, "https://$host/$token")
    }

    override suspend fun sources() = DiscoveryCodec.catalog(get(NativeHttpTransport.discoveryOrigin + "/api/discovery/sources"))
    override suspend fun search(filters: DiscoveryFilters, cursor: String?) = DiscoveryCodec.page(get(searchURL(filters, cursor)))

    private suspend fun get(address: String): JSONObject = withContext(Dispatchers.IO) {
        val socket = URL(address).openConnection() as HttpsURLConnection
        socket.instanceFollowRedirects = false
        // Idle gaps stay 15s connect / 25s read. The daemon only bounds a trickling body.
        socket.connectTimeout = 15_000
        socket.readTimeout = 25_000
        socket.useCaches = false
        socket.requestMethod = "GET"
        socket.setRequestProperty("Accept", "application/json")
        socket.setRequestProperty("Cache-Control", "no-store")
        socket.setRequestProperty("Cookie", "")
        val timedOut = AtomicBoolean(false)
        val watchdog = Thread({
            try {
                Thread.sleep(30_000)
                timedOut.set(true)
                socket.disconnect()
            } catch (_: InterruptedException) {
                // The request finished or was cancelled before the total deadline.
            }
        }, "discovery-total-deadline")
        watchdog.isDaemon = true
        watchdog.start()
        val completion = currentCoroutineContext()[Job]?.invokeOnCompletion { cause ->
            if (cause != null) socket.disconnect()
        }
        try {
            NativeHttpTransport.configure(socket)
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
        } catch (error: IOException) {
            currentCoroutineContext().ensureActive()
            if (timedOut.get()) throw DiscoveryFailure(0, "deadline", "The search could not be completed. Try again later.")
            throw error
        } finally {
            completion?.dispose()
            watchdog.interrupt()
            socket.disconnect()
        }
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
    fun page(value: JSONObject, maxJobs: Int = 50): DiscoveryPage {
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
        valid(maxJobs in 1..DiscoverySnapshotCodec.MAX_JOBS && jobs.size <= maxJobs && jobs.map { it.id }.distinct().size == jobs.size)
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
    internal fun exportSnapshot(): JSONObject = DiscoverySnapshotCodec.encode(DiscoverySnapshot(state.value.filters, lastDisplayedFilters, lastPage,
        searchHistory, lastNewResult, lastSearchSourceIds))
    val state = mutable.asStateFlow()
    private var catalogJob: Job? = null
    private var searchJob: Job? = null
    private var generation = 0L
    private var privateStore: PrivateStore? = null
    private var privateKey: String? = null
    private var storageGeneration = 0L
    private var saveJob: Job? = null
    private val storageMutex = Mutex()
    private val observationMutex = Mutex()
    private var maySaveSearch = false
    private var lastPage: DiscoveryPage? = null
    private var lastDisplayedFilters: DiscoveryFilters? = null
    private var searchHistory = DiscoverySearchHistory()
    private var lastNewResult: DiscoveryNewResult? = null
    private var lastSearchSourceIds: List<String>? = null

    /** Display-only filtering never changes the stored result, baseline or request. */
    fun setShowNewOnly(value: Boolean) {
        mutable.update { it.copy(showNewOnly = value && it.hasSearchComparison) }
    }
    private fun clearUnsupportedMarkers() {
        lastNewResult = null; lastSearchSourceIds = null
        mutable.update { it.copy(newResult = null, showNewOnly = false) }
    }

    /** Canonicalize saved board ids only. A trailing-space query stays as it was saved. */
    private fun repairSources(filters: DiscoveryFilters): DiscoveryFilters {
        val repaired = PublicDiscoveryService.canonicalSources(filters.sources)
        if (repaired == filters.sources) return filters
        return filters.copy(sources = repaired)
    }

    suspend fun attachPrivateSession(store: PrivateStore, key: String) {
        val sameSession = privateStore === store && privateKey == key
        if (sameSession && state.value.restoringSearch) return
        if (!sameSession) {
            stopPrivateSession(flush = true)
            privateStore = store; privateKey = key
        }
        val request = storageGeneration
        mutable.update { it.copy(restoringSearch = true) }
        try {
            val saved = withContext(Dispatchers.IO) { store.read(key) }
            if (request != storageGeneration || privateStore !== store || privateKey != key) return
            val snapshot = saved?.let(DiscoverySnapshotCodec::decode)
            // Disappearance makes storage writable again without erasing this session's work.
            if (sameSession && snapshot == null) {
                mutable.update { it.copy(restoringSearch = false, searchRestoreBlocked = false, searchStorageError = null) }
                maySaveSearch = true
                scheduleSearchSave()
                return
            }
            if (sameSession) {
                generation++; searchJob?.cancel(); catalogJob?.cancel()
            }
            val repairedFilters = snapshot?.filters?.let(::repairSources) ?: DiscoveryFilters()
            val repairedDisplayed = snapshot?.displayedFilters?.let(::repairSources)
            lastPage = snapshot?.page; lastDisplayedFilters = repairedDisplayed
            searchHistory = snapshot?.searchHistory ?: DiscoverySearchHistory()
            lastNewResult = snapshot?.newResult?.let(DiscoveryHistoryPolicy::restoredResult); lastSearchSourceIds = snapshot?.lastSearchSourceIds
            val page = snapshot?.page
            mutable.value = DiscoveryUiState(filters = repairedFilters, displayedFilters = repairedDisplayed,
                jobs = page?.jobs.orEmpty(), sources = page?.sources.orEmpty(), status = page?.status, generatedAt = page?.generatedAt,
                totalMatches = page?.totalMatches ?: 0, limited = page?.limited ?: false, notice = page?.notice.orEmpty(),
                nextCursor = null, restoredSearch = snapshot != null && (snapshot.page != null || snapshot.filters != DiscoveryFilters()),
                newResult = lastNewResult)
            maySaveSearch = true
            val sourcesChanged = snapshot != null && (repairedFilters.sources != snapshot.filters.sources ||
                repairedDisplayed?.sources != snapshot.displayedFilters?.sources)
            if (sourcesChanged) scheduleSearchSave()
        } catch (cancel: CancellationException) { throw cancel }
        catch (_: Exception) {
            if (request == storageGeneration && privateStore === store && privateKey == key) {
                maySaveSearch = false
                mutable.update { it.copy(restoringSearch = false, searchRestoreBlocked = true,
                    searchStorageError = "Your previous search could not be opened. Its saved file is preserved. You can search now; new results stay in this session until saved-search recovery succeeds.") }
            }
        }
    }

    /** Drain old writes before storage-area rotation or an account change. */
    suspend fun stopPrivateSession(flush: Boolean) {
        saveJob?.cancelAndJoin(); saveJob = null
        if (flush) saveSearchNow()
        storageGeneration++; generation++
        searchJob?.cancel(); catalogJob?.cancel()
        storageMutex.withLock { privateStore = null; privateKey = null; maySaveSearch = false }
        lastPage = null; lastDisplayedFilters = null
        searchHistory = DiscoverySearchHistory(); lastNewResult = null; lastSearchSourceIds = null
        mutable.value = DiscoveryUiState()
    }

    private fun scheduleSearchSave() {
        if (!maySaveSearch || privateStore == null || privateKey == null) return
        saveJob?.cancel()
        saveJob = scope.launch { delay(350); saveSearchNow() }
    }

    suspend fun saveSearchNow() {
        observationMutex.lock()
        try { persistSearchNow() } finally { observationMutex.unlock() }
    }

    /** Serialize observations through the write: a later response must compare
     * against the history that actually survived the earlier private write. */
    private suspend fun persistObservation(request: Long, snapshot: DiscoverySnapshot, commit: () -> Unit): Boolean {
        val store = privateStore ?: return false
        val key = privateKey ?: return false
        val owner = storageGeneration
        if (!maySaveSearch) return false
        return try {
            var committed = false
            storageMutex.withLock {
                if (request != generation || owner != storageGeneration || privateStore !== store || privateKey != key || !maySaveSearch)
                    return@withLock
                val encoded = DiscoverySnapshotCodec.encode(snapshot)
                withContext(Dispatchers.IO) { store.write(key, encoded) }
                if (owner == storageGeneration && privateStore === store && privateKey == key) {
                    commit()
                    committed = true
                }
            }
            if (committed) mutable.update { current ->
                // The newer request may fail before it has a result. Keep this
                // just-saved comparison on the rows it actually describes.
                val sameDisplayedPage = current.jobs == snapshot.page?.jobs && current.displayedFilters == snapshot.displayedFilters
                current.copy(searchStorageError = if (request == generation) null else current.searchStorageError,
                    newResult = if (sameDisplayedPage) snapshot.newResult else current.newResult)
            }
            committed
        } catch (cancel: CancellationException) { throw cancel }
        catch (_: Exception) {
            if (owner == storageGeneration && request == generation && privateStore === store && privateKey == key) {
                mutable.update { it.copy(searchStorageError =
                    "This search is available in this session but could not be saved. The earlier saved search is preserved. Retry saving when private storage is available.") }
            }
            false
        }
    }

    private suspend fun persistSearchNow(): Boolean {
        val store = privateStore ?: return false
        val key = privateKey ?: return false
        if (!maySaveSearch) return false
        val request = storageGeneration
        val observationGeneration = generation
        val filters = state.value.filters
        if (filters.query.length > 120 || filters.location.length > 100) {
            // The snapshot cannot store this text. Leave the earlier file alone and keep what was typed on screen.
            if (request == storageGeneration && observationGeneration == generation && privateKey == key && state.value.filters == filters) {
                clearUnsupportedMarkers()
                mutable.update { it.copy(
                    searchStorageError = "These search fields exceed the supported limits. Earlier saved search data is kept.") }
            }
            return false
        }
        return try {
            var written = false
            storageMutex.withLock {
                if (request != storageGeneration || observationGeneration != generation || privateStore !== store || privateKey != key) return@withLock
                // Capture after acquiring the write lock: a queued save cannot
                // reinstate metadata that an earlier failed write cleared.
                val snapshot = DiscoverySnapshotCodec.encode(DiscoverySnapshot(state.value.filters, lastDisplayedFilters, lastPage,
                    searchHistory, lastNewResult, lastSearchSourceIds))
                withContext(Dispatchers.IO) { store.write(key, snapshot) }
                written = true
            }
            val currentOwner = request == storageGeneration && observationGeneration == generation && privateStore === store && privateKey == key
            if (written && currentOwner) mutable.update { it.copy(searchStorageError = null) }
            written && currentOwner
        } catch (cancel: CancellationException) { throw cancel }
        catch (_: Exception) {
            if (request == storageGeneration && observationGeneration == generation && privateStore === store && privateKey == key) {
                clearUnsupportedMarkers()
                mutable.update { it.copy(
                    searchStorageError = "This search is available in this session but could not be saved. The earlier saved search is preserved. Retry saving when private storage is available.") }
            }
            false
        }
    }

    fun saveSearchBeforeBackground() {
        saveJob?.cancel()
        saveJob = scope.launch { saveSearchNow() }
    }

    fun retrySavedSearch() {
        if (state.value.restoringSearch) return
        val store = privateStore ?: return; val key = privateKey ?: return
        scope.launch { if (state.value.searchRestoreBlocked) attachPrivateSession(store, key) else saveSearchNow() }
    }

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
        if (state.value.restoringSearch) return
        val next = change(state.value.filters)
        if (next == state.value.filters) return
        generation++; searchJob?.cancel()
        mutable.update { it.copy(filters = next, loading = false, loadingMore = false, error = null) }
        scheduleSearchSave()
    }
    fun cancelSearch() {
        generation++; searchJob?.cancel()
        mutable.update { it.copy(loading = false, loadingMore = false, submittedSearchFailed = false, error = "Search stopped. Any earlier results are kept.") }
    }
    fun search(more: Boolean = false, submitted: DiscoveryFilters? = null, ignoreDraft: Boolean = false) {
        val current = state.value
        if (current.restoringSearch) return
        if (more && current.loading) return
        if (System.currentTimeMillis() < current.retryAtMillis) {
            mutable.update { it.copy(error = "The search service asked for a short wait. Try again after " + Instant.ofEpochMilli(it.retryAtMillis) + ".") }; return
        }
        val raw = submitted ?: current.filters
        if (!more && PublicDiscoveryService.hasDuplicateCanonical(raw.sources)) {
            mutable.update { it.copy(error = "Choose each employer board only once.") }; return
        }
        val filters = raw.cleaned()
        val cursor = if (more) current.nextCursor?.takeIf { !current.filtersChanged && !current.cursorInvalid } ?: return else null
        try { PublicDiscoveryService.searchURL(filters, cursor) }
        catch (error: IllegalArgumentException) { mutable.update { it.copy(error = error.message) }; return }
        val request = ++generation
        searchJob?.cancel()
        mutable.update { it.copy(loading = true, loadingMore = more, error = null, submittedSearchFailed = false,
            lastAttemptedFilters = if (more) it.lastAttemptedFilters else filters) }
        searchJob = scope.launch {
            try {
                val page = service.search(filters, cursor)
                currentCoroutineContext().ensureActive()
                if (request != generation || (!ignoreDraft && state.value.filters.cleaned() != filters)) return@launch
                observationMutex.lock()
                try {
                    currentCoroutineContext().ensureActive()
                    if (request != generation || (!ignoreDraft && state.value.filters.cleaned() != filters)) return@launch
                    if (page.status == "unavailable") {
                        mutable.update { current -> current.copy(sources = page.sources, status = page.status, notice = page.notice,
                            nextCursor = null, cursorInvalid = true,
                            error = if (current.jobs.isEmpty()) "The selected employer boards could not be reached. Try again or choose other boards."
                                else "The selected employer boards could not be reached. Your earlier results are still shown.") }
                        return@launch
                    }
                    val all = ((if (more) state.value.jobs else emptyList()) + page.jobs).distinctBy(DiscoveredJob::id)
                    val reachedLimit = all.size > DiscoverySnapshotCodec.MAX_JOBS ||
                        all.size == DiscoverySnapshotCodec.MAX_JOBS && page.nextCursor != null
                    val visible = all.take(DiscoverySnapshotCodec.MAX_JOBS)
                    val notice = page.notice + if (reachedLimit) " Up to ${DiscoverySnapshotCodec.MAX_JOBS} results are kept on this phone. Narrow the search or open an employer board for more." else ""
                    val displayedPage = page.copy(jobs = visible, nextCursor = null, limited = page.limited || reachedLimit, notice = notice)
                    val familiarity = DiscoveryHistoryPolicy.evaluate(searchHistory, filters, displayedPage, System.currentTimeMillis(),
                        previous = if (more) lastNewResult else null,
                        resolvedSources = if (more) lastSearchSourceIds else null)
                    val candidateHistory = if (familiarity.result != null) familiarity.history else searchHistory
                    val candidateSources = familiarity.sourceIds.takeIf { familiarity.result != null }
                    val candidate = DiscoverySnapshot(state.value.filters, filters, displayedPage,
                        candidateHistory, familiarity.result, candidateSources)
                    // A reset page must not keep the previous page's count, badges
                    // or New-only filter visible while the private write is pending.
                    val comparisonContinues = more && familiarity.result?.baselineReset == false
                    mutable.update { it.copy(jobs = visible,
                        displayedFilters = filters, sources = page.sources, status = page.status, generatedAt = page.generatedAt,
                        nextCursor = if (reachedLimit) null else page.nextCursor, totalMatches = page.totalMatches, limited = page.limited || reachedLimit, notice = notice,
                        error = null, retryAtMillis = 0, cursorInvalid = false, restoredSearch = false,
                        newResult = if (comparisonContinues) it.newResult else null,
                        showNewOnly = comparisonContinues && it.showNewOnly) }
                    // Publish new markers only after their history and displayed result
                    // are saved together under this session's existing ownership guard.
                    saveJob?.cancel(); saveJob = null
                    // A synchronous encrypted write may finish even after the user
                    // starts another request. Complete and commit it before the next
                    // response evaluates; cancellation cannot invent or lose history.
                    val saved = withContext(NonCancellable) {
                        persistObservation(request, candidate) {
                            searchHistory = candidateHistory; lastNewResult = familiarity.result
                            lastSearchSourceIds = candidateSources
                            lastDisplayedFilters = filters; lastPage = displayedPage
                        }
                    }
                    if (request != generation) return@launch
                    if (saved) {
                        mutable.update { it.copy(newResult = familiarity.result,
                            showNewOnly = more && it.showNewOnly && !familiarity.result?.comparedSourceIds.isNullOrEmpty() && familiarity.result?.baselineReset != true) }
                    } else {
                        lastDisplayedFilters = filters; lastPage = displayedPage
                        clearUnsupportedMarkers()
                    }
                } finally { observationMutex.unlock() }
            } catch (cancel: CancellationException) { throw cancel }
            catch (error: Exception) {
                if (request != generation) return@launch
                val changed = error is DiscoveryFailure && error.code == "discovery_changed"
                mutable.update { it.copy(error = when {
                    changed -> "These employer boards changed since the last page. Start a new search; your earlier results are still shown."
                    error is DiscoveryFailure || error is IllegalArgumentException -> error.message
                    else -> "The search could not be completed. Earlier results are kept; check your connection and try again."
                }, submittedSearchFailed = !more, nextCursor = if (changed) null else it.nextCursor, cursorInvalid = changed || it.cursorInvalid,
                    retryAtMillis = if (error is DiscoveryFailure && error.retryAfterSeconds != null)
                        System.currentTimeMillis() + error.retryAfterSeconds * 1000L else it.retryAtMillis) }
            } finally { if (request == generation) mutable.update { it.copy(loading = false, loadingMore = false) } }
        }
    }

    /** Retries the submitted search and leaves a newer filter draft in place. */
    fun retrySubmittedSearch() {
        val submitted = state.value.lastAttemptedFilters ?: state.value.displayedFilters ?: return
        search(submitted = submitted, ignoreDraft = true)
    }
}
