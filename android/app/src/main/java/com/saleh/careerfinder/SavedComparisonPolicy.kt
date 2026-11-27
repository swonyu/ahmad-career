package com.saleh.careerfinder

import org.json.JSONObject
import java.time.Instant

/** Optional observed facts stay local. Saving or comparing never manufactures a check time. */
object SavedJobMetadata {
    fun valid(sourceName: String?, checkedAt: String?): Boolean {
        if (sourceName != null && (sourceName.length > 150 || sourceName.any {
                it.isISOControl() || Character.getType(it) == Character.FORMAT.toInt()
            } || sourceName.codePoints().anyMatch { it in 0xD800..0xDFFF })) return false
        return checkedAt == null || checkedAt.length <= 64 &&
            runCatching { Instant.parse(checkedAt) }.isSuccess
    }

    fun valid(job: Opportunity) = valid(job.sourceName, job.checkedAt)

    fun optional(value: JSONObject, key: String): String? {
        if (!value.has(key) || value.isNull(key)) return null
        require(value.opt(key) is String)
        return value.getString(key)
    }

    fun requireValid(sourceName: String?, checkedAt: String?) {
        require(valid(sourceName, checkedAt))
    }

    /** Only facts for this exact canonical posting can fill gaps in a preferred row. */
    fun preserving(preferred: Opportunity, previous: Opportunity): Opportunity {
        if (!valid(preferred) || !valid(previous) || !samePosting(preferred, previous)) return preferred
        val previousDate = previous.checkedAt?.let { Instant.parse(it) }
        val nextDate = preferred.checkedAt?.let { Instant.parse(it) }
        return preferred.copy(
            sourceName = preferred.sourceName?.takeIf { it.isNotBlank() } ?: previous.sourceName,
            checkedAt = if (previousDate != null && (nextDate == null || previousDate > nextDate))
                previous.checkedAt else preferred.checkedAt)
    }

    fun samePosting(first: Opportunity, second: Opportunity): Boolean = runCatching {
        BoundaryPolicy.historicalOpportunityURL(first.url)
        BoundaryPolicy.historicalOpportunityURL(second.url)
        BoundaryPolicy.jobIdentity(first.url) == BoundaryPolicy.jobIdentity(second.url)
    }.getOrDefault(false)

    /** A refreshed service row retains facts from one unambiguous local posting only. */
    fun preserving(preferred: Opportunity, previous: List<Opportunity>): Opportunity {
        val matches = previous.filter { samePosting(preferred, it) }
        return matches.singleOrNull()?.let { preserving(preferred, it) } ?: preferred
    }
}

/** Ephemeral identities have no codec and never enter Apply selection or a backup. */
data class SavedComparisonOwner(val scope: String, val session: String, private val connection: Connection?) {
    // Session equality can reject a rotated connection without exposing credentials in diagnostics.
    override fun toString() = "SavedComparisonOwner(scope=" + scope + ", session=" + session + ")"
}
data class SavedComparisonKey(val owner: SavedComparisonOwner, val rowId: String, val identity: String)
data class SavedComparisonItem(val key: SavedComparisonKey, val job: Opportunity, val recordOnly: Boolean,
    val stage: ApplicationStage?, val followUpDate: String?, val conflictingRecords: Boolean)

object SavedComparisonPolicy {
    private data class Row(val rowId: String, val job: Opportunity, val recordOnly: Boolean)
    fun owner(state: CareerUiState) = SavedComparisonOwner(state.privateScope, state.comparisonSession, state.connection)

    private fun rows(state: CareerUiState): List<Row> =
        state.jobs.map { Row(it.id, it, false) } +
            state.unbookmarkedRecords.map { Row("record-" + it.identity, it.job, true) }

    fun key(state: CareerUiState, job: Opportunity, recordOnly: Boolean = false): SavedComparisonKey? {
        if (!state.loaded || state.storageBlocked) return null
        val identity = runCatching {
            BoundaryPolicy.historicalOpportunityURL(job.url)
            BoundaryPolicy.jobIdentity(job.url)
        }.getOrNull() ?: return null
        val rowId = if (recordOnly) "record-" + identity else job.id
        if (rowId.isBlank()) return null
        val row = rows(state).filter { it.rowId == rowId }.singleOrNull() ?: return null
        if (row.recordOnly != recordOnly || !SavedJobMetadata.samePosting(row.job, job) || !SavedJobMetadata.valid(row.job)) return null
        return SavedComparisonKey(owner(state), rowId, identity)
    }

    fun item(state: CareerUiState, key: SavedComparisonKey): SavedComparisonItem? {
        if (!state.loaded || state.storageBlocked || key.owner != owner(state)) return null
        val row = rows(state).filter { it.rowId == key.rowId }.singleOrNull() ?: return null
        val verified = this.key(state, row.job, row.recordOnly) ?: return null
        if (verified != key) return null
        val record = state.applicationRecords[key.identity]
        val facts = record?.let { SavedJobMetadata.preserving(row.job, it.job) } ?: row.job
        val conflict = record?.needsReview == true
        return SavedComparisonItem(key, facts, row.recordOnly,
            if (conflict) null else record?.displayStage ?: ApplicationStage.SAVED,
            if (conflict) null else record?.current?.record?.followUpDate?.takeIf { it.isNotBlank() }, conflict)
    }

    fun available(state: CareerUiState, keys: List<SavedComparisonKey>): List<SavedComparisonKey> =
        keys.filter { item(state, it) != null }.distinctBy { it.identity }.take(2)

    fun toggle(state: CareerUiState, selected: List<SavedComparisonKey>, key: SavedComparisonKey): List<SavedComparisonKey> {
        val current = available(state, selected)
        if (key in current) return current - key
        if (current.size == 2 || current.any { it.identity == key.identity } || item(state, key) == null) return current
        return current + key
    }

    /** Fresh read only: neither this lookup nor the comparison view invokes a service. */
    fun pair(state: CareerUiState, keys: List<SavedComparisonKey>): List<SavedComparisonItem>? {
        if (keys.size != 2 || keys[0].identity == keys[1].identity) return null
        val result = keys.mapNotNull { item(state, it) }
        return result.takeIf { it.size == 2 }
    }
}
