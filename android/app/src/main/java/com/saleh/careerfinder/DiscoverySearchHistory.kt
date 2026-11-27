package com.saleh.careerfinder

import org.json.JSONArray
import org.json.JSONObject
import java.text.Normalizer
import java.util.Locale

data class DiscoveryHistoryBoard(val sourceId: String, val seenIds: List<String>, val ready: Boolean)
data class DiscoveryHistorySearch(val key: String, val lastUsedAt: Long, val boards: List<DiscoveryHistoryBoard>)
data class DiscoverySearchHistory(val version: Int = 1, val searches: List<DiscoveryHistorySearch> = emptyList())
data class DiscoveryNewResult(val key: String, val newIds: List<String>, val comparedSourceIds: List<String>,
    val baselinedSourceIds: List<String>, val pendingSourceIds: List<String>, val coverageLimited: Boolean, val baselineReset: Boolean)
data class DiscoveryHistoryEvaluation(val history: DiscoverySearchHistory, val result: DiscoveryNewResult?, val sourceIds: List<String>)

/** JavaScript String.trim whitespace shared by the hosted search and profile contracts. */
internal fun jsWhitespace(char: Char): Boolean = char.code in 9..13 || char.code in 0x2000..0x200a ||
    char.code in setOf(0x20, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff)

/** Local first-observation evidence. Employer posting dates and closure are separate facts. */
object DiscoveryHistoryPolicy {
    const val MAX_QUERIES = 8
    const val MAX_BOARD_IDS = 1000
    const val MAX_TOTAL_IDS = 4000
    const val MAX_TIME = 9_007_199_254_740_991L
    private const val MAX_BOARDS = 4
    private val controls = Regex("[\\x00-\\x1f\\x7f]")
    private val marks = Regex("\\p{M}")

    private fun validId(value: String) = value.isNotEmpty() && value.length <= 250 && !controls.containsMatchIn(value)
    private fun belongs(id: String, source: String) = id.startsWith("$source:") && id.length > source.length + 1
    private fun canonical(values: List<String>): List<String>? {
        if (values.isEmpty() || values.size > MAX_BOARDS) return null
        val ids = values.map { PublicDiscoveryService.canonicalBoard(it)?.id ?: return null }
        return ids.distinct().sorted()
    }
    fun sourceIds(filters: DiscoveryFilters, defaults: List<String>): List<String>? =
        canonical(if (filters.sources.isEmpty()) defaults else filters.sources)

    private fun fold(value: String) = marks.replace(
        Normalizer.normalize(value.trim(::jsWhitespace), Normalizer.Form.NFKD), "").lowercase(Locale.ROOT)

    // Match JSON.stringify's compact string encoding, including lone UTF-16 surrogates.
    private fun quote(value: String): String = buildString {
        append('"')
        var index = 0
        while (index < value.length) {
            val char = value[index]
            when (char) {
                '"' -> append("\\\"")
                '\\' -> append("\\\\")
                '\b' -> append("\\b")
                '\t' -> append("\\t")
                '\n' -> append("\\n")
                '\u000c' -> append("\\f")
                '\r' -> append("\\r")
                else -> when {
                    char.code < 0x20 -> append("\\u").append(char.code.toString(16).padStart(4, '0'))
                    char.isHighSurrogate() && index + 1 < value.length && value[index + 1].isLowSurrogate() -> {
                        append(char).append(value[++index])
                    }
                    char.isSurrogate() -> append("\\u").append(char.code.toString(16).padStart(4, '0'))
                    else -> append(char)
                }
            }
            index++
        }
        append('"')
    }
    fun key(filters: DiscoveryFilters, resolvedSources: List<String> = filters.sources): String? {
        if (filters.query.length > 120 || filters.location.length > 100 ||
            controls.containsMatchIn(filters.query + filters.location)) return null
        val sources = sourceIds(filters, resolvedSources) ?: return null
        val value = "[1," + quote(fold(filters.query)) + "," + quote(fold(filters.location)) + "," +
            filters.remoteOnly + "," + sources.joinToString(",", "[", "]", transform = ::quote) + "]"
        return value.takeIf { it.length <= 8192 }
    }
    fun valid(history: DiscoverySearchHistory): Boolean {
        if (history.version != 1 || history.searches.size > MAX_QUERIES ||
            history.searches.map { it.key }.distinct().size != history.searches.size) return false
        var total = 0
        for (search in history.searches) {
            if (search.key.isEmpty() || search.key.length > 8192 || search.lastUsedAt !in 0..MAX_TIME ||
                search.boards.size > MAX_BOARDS || search.boards.map { it.sourceId }.distinct().size != search.boards.size) return false
            for (board in search.boards) {
                if (PublicDiscoveryService.canonicalBoard(board.sourceId)?.id != board.sourceId ||
                    board.seenIds.size > MAX_BOARD_IDS || board.seenIds.distinct().size != board.seenIds.size ||
                    board.seenIds.any { !validId(it) || !belongs(it, board.sourceId) }) return false
                total += board.seenIds.size
                if (total > MAX_TOTAL_IDS) return false
            }
        }
        return true
    }
    fun validSources(sources: List<String>) = canonical(sources) == sources
    fun valid(result: DiscoveryNewResult, filters: DiscoveryFilters, sources: List<String>,
              jobs: List<DiscoveredJob>, history: DiscoverySearchHistory): Boolean {
        if (!valid(history) || !validSources(sources) || result.key != key(filters, sources)) return false
        if (filters.sources.isNotEmpty() && sourceIds(filters, emptyList()) != sources) return false
        val search = history.searches.singleOrNull { it.key == result.key } ?: return false
        if (search.boards.any { it.sourceId !in sources }) return false
        val currentIds = jobs.map { it.id }.toSet()
        if (result.newIds.size > DiscoverySnapshotCodec.MAX_JOBS || result.newIds.distinct().size != result.newIds.size ||
            result.newIds.any { id -> !validId(id) || id !in currentIds ||
                jobs.singleOrNull { it.id == id }?.let { it.sourceId in sources && belongs(id, it.sourceId) } != true }) return false
        for (ids in listOf(result.comparedSourceIds, result.baselinedSourceIds, result.pendingSourceIds)) {
            if (ids.size > MAX_BOARDS || ids.distinct().size != ids.size || ids.any { it !in sources }) return false
        }
        if (result.baselineReset && result.newIds.isNotEmpty()) return false
        // A zero-new comparison still claims a completed prior baseline.
        // Older reset metadata can carry suppressed compared IDs; it has no claim.
        if (!result.baselineReset && result.comparedSourceIds.any { source ->
                search.boards.none { it.sourceId == source && it.ready } }) return false
        return result.newIds.all { id ->
            result.comparedSourceIds.any { source -> belongs(id, source) &&
                search.boards.any { it.sourceId == source && it.ready && id in it.seenIds } }
        }
    }

    /** Normalize only after the complete snapshot has passed its existing validation.
     * Legacy resets may have retained comparison metadata but never valid new IDs. */
    fun restoredResult(result: DiscoveryNewResult): DiscoveryNewResult =
        if (result.baselineReset) result.copy(newIds = emptyList(), comparedSourceIds = emptyList(), coverageLimited = true) else result

    /** page.jobs is the accumulated bounded result; previous belongs only to More in this cycle. */
    fun evaluate(input: DiscoverySearchHistory, filters: DiscoveryFilters, page: DiscoveryPage, now: Long,
                 previous: DiscoveryNewResult? = null, resolvedSources: List<String>? = null): DiscoveryHistoryEvaluation {
        require(now in 0..MAX_TIME) { "A safe search observation time is required." }
        val inputValid = valid(input)
        val copied = if (inputValid) input.copy(searches = input.searches.map { search ->
            search.copy(boards = search.boards.map { it.copy(seenIds = it.seenIds.toList()) })
        }) else DiscoverySearchHistory()
        val sources = sourceIds(filters, resolvedSources ?: page.sources.map { it.id })
            ?: return DiscoveryHistoryEvaluation(copied, null, emptyList())
        val key = key(filters, sources) ?: return DiscoveryHistoryEvaluation(copied, null, emptyList())
        val prior = previous?.takeIf { it.key == key }
        var baselineReset = !inputValid || prior?.baselineReset == true
        var coverageLimited = page.limited || baselineReset
        val currentIds = mutableSetOf<String>()
        val observed = sources.associateWith { mutableSetOf<String>() }
        val uncertain = mutableSetOf<String>()
        for (job in page.jobs) {
            val source = job.sourceId.takeIf { it in sources && validId(job.id) && belongs(job.id, it) }
            if (source == null) {
                coverageLimited = true
                // Conflicting identity cannot establish complete coverage for
                // either the declared board or the board named by the ID.
                uncertain += sources.filter { it == job.sourceId || belongs(job.id, it) }
                continue
            }
            currentIds += job.id
            if (job.stale) uncertain += source else observed.getValue(source) += job.id
        }
        if (page.jobs.size > DiscoverySnapshotCodec.MAX_JOBS) return DiscoveryHistoryEvaluation(copied,
            DiscoveryNewResult(key, emptyList(), emptyList(), emptyList(), sources, true, baselineReset), sources)

        val searches = copied.searches.toMutableList()
        val existing = searches.singleOrNull { it.key == key }
        val mismatched = existing?.boards?.any { it.sourceId !in sources } == true
        if (mismatched) { searches.remove(existing); baselineReset = true }
        val query = existing?.takeUnless { mismatched } ?: DiscoveryHistorySearch(key, now, emptyList())
        val boards = query.boards.toMutableList()
        val compared = prior?.comparedSourceIds.orEmpty().filter { it in sources }.toMutableSet()
        val baselined = prior?.baselinedSourceIds.orEmpty().filter { it in sources }.toMutableSet()
        val newIds = prior?.newIds.orEmpty().filter { it in currentIds }.toMutableSet()
        for (sourceId in sources) {
            var index = boards.indexOfFirst { it.sourceId == sourceId }
            if (index < 0) { boards += DiscoveryHistoryBoard(sourceId, emptyList(), false); index = boards.lastIndex }
            val board = boards[index]
            val source = page.sources.singleOrNull { it.id == sourceId }
            val eligible = source != null && source.status in setOf("fresh", "cached") && source.error == null
            if (!eligible) { coverageLimited = true; continue }
            val ids = observed.getValue(sourceId)
            val complete = !source!!.limited && sourceId !in uncertain &&
                source.matchedCount in 0..500 && ids.size == source.matchedCount
            if (!complete) coverageLimited = true
            val seen = board.seenIds.toMutableSet()
            if (board.ready && sourceId !in baselined && !baselineReset) {
                compared += sourceId
                newIds += ids.filter { it !in seen }
            }
            seen += ids
            if (seen.size > MAX_BOARD_IDS) {
                boards[index] = board.copy(seenIds = ids.sorted(), ready = complete)
                baselineReset = true
                if (complete) baselined += sourceId
            } else {
                boards[index] = board.copy(seenIds = seen.sorted(), ready = board.ready || complete)
                if (!board.ready && complete) baselined += sourceId
            }
        }
        val updated = query.copy(lastUsedAt = now, boards = boards)
        searches.removeAll { it.key == key }; searches += updated
        while (searches.size > MAX_QUERIES || searches.sumOf { it.boards.sumOf { board -> board.seenIds.size } } > MAX_TOTAL_IDS) {
            val oldest = searches.filter { it.key != key }.minWithOrNull(compareBy<DiscoveryHistorySearch> { it.lastUsedAt }.thenBy { it.key })
                ?: error("Search history bounds could not be maintained.")
            searches.remove(oldest); baselineReset = true
        }
        // Suppress the whole comparison for the rest of this search cycle.
        if (baselineReset) { newIds.clear(); compared.clear(); coverageLimited = true }
        val history = DiscoverySearchHistory(searches = searches.sortedWith(compareByDescending<DiscoveryHistorySearch> { it.lastUsedAt }.thenBy { it.key }))
        return DiscoveryHistoryEvaluation(history, DiscoveryNewResult(key, newIds.sorted(), compared.sorted(), baselined.sorted(),
            sources.filter { source -> boards.none { it.sourceId == source && it.ready } }, coverageLimited, baselineReset), sources)
    }

    fun encode(history: DiscoverySearchHistory): JSONObject {
        require(valid(history))
        return JSONObject().put("version", 1).put("searches", JSONArray(history.searches.map { query ->
            JSONObject().put("key", query.key).put("lastUsedAt", query.lastUsedAt).put("boards", JSONArray(query.boards.map { board ->
                JSONObject().put("sourceId", board.sourceId).put("seenIds", JSONArray(board.seenIds)).put("ready", board.ready)
            }))
        }))
    }
    fun encode(result: DiscoveryNewResult): JSONObject = JSONObject().put("key", result.key)
        .put("newIds", JSONArray(result.newIds)).put("comparedSourceIds", JSONArray(result.comparedSourceIds))
        .put("baselinedSourceIds", JSONArray(result.baselinedSourceIds)).put("pendingSourceIds", JSONArray(result.pendingSourceIds))
        .put("coverageLimited", result.coverageLimited).put("baselineReset", result.baselineReset)
    private fun strings(value: JSONObject, key: String, limit: Int): List<String> {
        val raw = value.opt(key); require(raw is JSONArray && raw.length() <= limit)
        return (0 until raw.length()).map { index -> val item = raw.opt(index); require(item is String); item }
    }
    private fun text(value: JSONObject, key: String): String {
        val raw = value.opt(key); require(raw is String); return raw
    }
    private fun flag(value: JSONObject, key: String): Boolean {
        val raw = value.opt(key); require(raw is Boolean); return raw
    }
    fun decodeHistory(value: JSONObject): DiscoverySearchHistory {
        require(value.opt("version") == 1)
        val raw = value.opt("searches"); require(raw is JSONArray && raw.length() <= MAX_QUERIES)
        val searches = (0 until raw.length()).map { index ->
            val query = raw.opt(index); require(query is JSONObject)
            val time = query.opt("lastUsedAt")
            require(time is Number && time.toDouble().isFinite() && time.toDouble() >= 0 &&
                time.toDouble() <= MAX_TIME.toDouble() && time.toDouble() % 1.0 == 0.0)
            val boards = query.opt("boards"); require(boards is JSONArray && boards.length() <= MAX_BOARDS)
            DiscoveryHistorySearch(text(query, "key"), time.toLong(), (0 until boards.length()).map { at ->
                val board = boards.opt(at); require(board is JSONObject)
                DiscoveryHistoryBoard(text(board, "sourceId"), strings(board, "seenIds", MAX_BOARD_IDS), flag(board, "ready"))
            })
        }
        return DiscoverySearchHistory(searches = searches).also { require(valid(it)) }
    }
    fun decodeResult(value: JSONObject) = DiscoveryNewResult(text(value, "key"), strings(value, "newIds", DiscoverySnapshotCodec.MAX_JOBS),
        strings(value, "comparedSourceIds", MAX_BOARDS), strings(value, "baselinedSourceIds", MAX_BOARDS),
        strings(value, "pendingSourceIds", MAX_BOARDS), flag(value, "coverageLimited"), flag(value, "baselineReset"))
}
