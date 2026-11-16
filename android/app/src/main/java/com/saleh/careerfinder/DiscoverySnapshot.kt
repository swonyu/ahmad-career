package com.saleh.careerfinder

import org.json.JSONArray
import org.json.JSONObject

data class DiscoverySnapshot(val filters: DiscoveryFilters, val displayedFilters: DiscoveryFilters?, val page: DiscoveryPage?)

/** A bounded encrypted last search. There is deliberately no account, profile, PDF or cursor field. */
object DiscoverySnapshotCodec {
    const val MAX_JOBS = 200
    const val MAX_BYTES = 2 * 1024 * 1024
    private fun filters(value: DiscoveryFilters) = JSONObject().put("query", value.query).put("location", value.location)
        .put("remoteOnly", value.remoteOnly).put("sources", JSONArray(value.sources))
    private fun filters(value: JSONObject): DiscoveryFilters {
        require(value.opt("query") is String && value.opt("location") is String && value.opt("remoteOnly") is Boolean)
        val result = DiscoveryFilters(value.getString("query"), value.getString("location"), value.getBoolean("remoteOnly"), value.requiredStrings("sources"))
        require(result.query.length <= 120 && result.location.length <= 100 && result.sources.size <= 4 && result.sources.distinct().size == result.sources.size)
        require(result.sources.all(PublicDiscoveryService::supportedSource))
        return result
    }
    private fun page(value: DiscoveryPage) = JSONObject().put("ok", true).put("version", 1).put("generatedAt", value.generatedAt)
        .put("status", value.status).put("totalMatches", value.totalMatches).put("limited", value.limited).put("notice", value.notice)
        .put("nextCursor", JSONObject.NULL)
        .put("jobs", JSONArray(value.jobs.map { job -> JSONObject().put("id", job.id).put("sourceId", job.sourceId).put("sourceName", job.sourceName)
            .put("provider", job.provider).put("title", job.title).put("company", job.company).put("url", job.url).put("location", job.location)
            .put("country", job.country ?: JSONObject.NULL).put("remote", job.remote ?: JSONObject.NULL).put("summary", job.summary)
            .put("publishedAt", job.publishedAt ?: JSONObject.NULL).put("updatedAt", job.updatedAt ?: JSONObject.NULL).put("checkedAt", job.checkedAt).put("stale", job.stale) }))
        .put("sources", JSONArray(value.sources.map { source -> JSONObject().put("id", source.id).put("name", source.name).put("provider", source.provider)
            .put("boardUrl", source.boardUrl).put("status", source.status).put("checkedAt", source.checkedAt ?: JSONObject.NULL)
            .put("availableCount", source.availableCount).put("matchedCount", source.matchedCount).put("limited", source.limited)
            .put("error", source.error?.let { JSONObject().put("message", it) } ?: JSONObject.NULL) }))
    fun encode(value: DiscoverySnapshot): JSONObject {
        require((value.page?.jobs?.size ?: 0) <= MAX_JOBS)
        val result = JSONObject().put("schema", 1).put("filters", filters(value.filters))
            .put("displayedFilters", value.displayedFilters?.let(::filters) ?: JSONObject.NULL).put("page", value.page?.let(::page) ?: JSONObject.NULL)
        require(result.toString().toByteArray(Charsets.UTF_8).size <= MAX_BYTES) { "This search is too large to keep on the phone. Narrow the search to save it." }
        // Never replace a valid private file with a snapshot this version cannot reopen.
        decode(result)
        return result
    }
    fun decode(value: JSONObject): DiscoverySnapshot {
        require(value.toString().toByteArray(Charsets.UTF_8).size <= MAX_BYTES)
        require(value.opt("schema") == 1) { "This saved search needs a newer app. Its file is preserved." }
        require(value.has("displayedFilters") && value.has("page"))
        val restoredFilters = filters(value.getJSONObject("filters"))
        val displayed = if (value.isNull("displayedFilters")) null else filters(value.getJSONObject("displayedFilters"))
        val page = if (value.isNull("page")) null else DiscoveryCodec.page(value.getJSONObject("page"), MAX_JOBS).copy(nextCursor = null)
        require((displayed == null) == (page == null))
        return DiscoverySnapshot(restoredFilters, displayed, page)
    }
}
