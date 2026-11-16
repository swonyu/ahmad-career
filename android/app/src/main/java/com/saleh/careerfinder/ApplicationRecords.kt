package com.saleh.careerfinder

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

internal fun boundedApplicationNote(value: String): String = value.take(2_000).let {
    if (it.lastOrNull()?.let(Character::isHighSurrogate) == true) it.dropLast(1) else it
}

enum class ApplicationStage(val stored: String, val label: String) {
    SAVED("saved", "Saved"), APPLIED("applied", "Applied"), INTERVIEW("interview", "Interview"), OFFER("offer", "Offer"), CLOSED("closed", "Closed");
    companion object {
        fun decode(value: String) = entries.firstOrNull { it.stored == value }
            ?: throw IllegalArgumentException("This application record needs a newer app. Its saved file is preserved.")
    }
}

data class ApplicationRecordDraft(val stage: ApplicationStage = ApplicationStage.SAVED, val appliedDate: String = "",
    val followUpDate: String = "", val note: String = "") {
    fun validated(): ApplicationRecordDraft {
        BoundaryPolicy.civilDate(appliedDate); BoundaryPolicy.civilDate(followUpDate)
        require(note.length <= 2_000) { "Keep this private note within 2,000 characters." }
        require(note.toByteArray(Charsets.UTF_8).toString(Charsets.UTF_8) == note) { "Check the characters in this private note before saving." }
        return this
    }
}

data class ApplicationRecord(val stage: ApplicationStage = ApplicationStage.SAVED, val appliedDate: String = "",
    val followUpDate: String = "", val note: String = "", val appliedElsewhere: Boolean = false) {
    fun draft() = ApplicationRecordDraft(stage, appliedDate, followUpDate, note)
    fun json() = JSONObject().put("stage", stage.stored).put("appliedDate", appliedDate).put("followUpDate", followUpDate)
        .put("note", note).put("appliedElsewhere", appliedElsewhere)
    companion object {
        fun decode(value: JSONObject): ApplicationRecord {
            for (key in listOf("stage", "appliedDate", "followUpDate", "note")) require(value.opt(key) is String) { "The saved application record could not be read. It is preserved." }
            require(value.opt("appliedElsewhere") is Boolean) { "The saved application status could not be read. It is preserved." }
            val draft = ApplicationRecordDraft(ApplicationStage.decode(value.getString("stage")), value.getString("appliedDate"),
                value.getString("followUpDate"), value.getString("note")).validated()
            val applied = value.getBoolean("appliedElsewhere")
            require(draft.stage !in setOf(ApplicationStage.APPLIED, ApplicationStage.INTERVIEW, ApplicationStage.OFFER) || applied) {
                "The saved application status is inconsistent. Its file is preserved."
            }
            return ApplicationRecord(draft.stage, draft.appliedDate, draft.followUpDate, draft.note, applied)
        }
    }
}

data class ApplicationRecordVersion(val id: String, val record: ApplicationRecord, val savedAt: String, val source: String) {
    fun json() = JSONObject().put("id", id).put("record", record.json()).put("savedAt", savedAt).put("source", source)
    companion object {
        fun create(record: ApplicationRecord, source: String = "edited") = ApplicationRecordVersion(UUID.randomUUID().toString(), record, Instant.now().toString(), source)
        fun decode(value: JSONObject): ApplicationRecordVersion {
            for (key in listOf("id", "savedAt", "source")) require(value.opt(key) is String) { "A saved record version could not be read. It is preserved." }
            val id = value.getString("id")
            require(id.matches(Regex("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")))
            val time = value.getString("savedAt"); Instant.parse(time)
            val source = value.getString("source"); require(source in setOf("edited", "legacy", "copied", "corrected"))
            return ApplicationRecordVersion(id, ApplicationRecord.decode(value.getJSONObject("record")), time, source)
        }
    }
}

/** Private phone metadata. This never becomes an employer receipt or a provider payload. */
data class ApplicationRecordBundle(val job: Opportunity, val current: ApplicationRecordVersion, val revision: Int = 1,
    val alternatives: List<ApplicationRecordVersion> = emptyList(), val history: List<ApplicationRecordVersion> = emptyList(),
    val appliedElsewhere: Boolean = current.record.appliedElsewhere, val relatedURLs: List<String> = listOf(job.url)) {
    val identity: String get() = BoundaryPolicy.jobIdentity(job.url)
    val needsReview: Boolean get() = alternatives.isNotEmpty()
    val displayStage: ApplicationStage get() = if (current.record.stage == ApplicationStage.SAVED && appliedElsewhere) ApplicationStage.APPLIED else current.record.stage
    val activeDraft: ApplicationRecordDraft get() = current.record.draft().copy(stage = displayStage)
    fun followUpDue(today: LocalDate = LocalDate.now()): Boolean = current.record.followUpDate.isNotEmpty() && displayStage != ApplicationStage.CLOSED &&
        !LocalDate.parse(current.record.followUpDate).isAfter(today)
    fun json() = JSONObject().put("identity", identity).put("job", job.privateJson()).put("current", current.json()).put("revision", revision)
        .put("alternatives", JSONArray(alternatives.map(ApplicationRecordVersion::json))).put("history", JSONArray(history.map(ApplicationRecordVersion::json)))
        .put("appliedElsewhere", appliedElsewhere).put("relatedURLs", JSONArray(relatedURLs))

    /** An explicit import keeps the active version and stages differing incoming details for review. */
    fun merge(incoming: ApplicationRecordBundle, destinationJob: Opportunity = job): ApplicationRecordBundle {
        val candidates = (alternatives + incoming.current + incoming.alternatives)
            .filterNot { it.record == current.record }.distinctBy { it.record }
        val candidateIDs = candidates.map { it.id }.toSet()
        return copy(job = destinationJob, alternatives = candidates,
            history = (history + incoming.history + alternatives + incoming.current + incoming.alternatives)
                .filterNot { it.id == current.id || it.id in candidateIDs }.distinctBy { it.id },
            appliedElsewhere = appliedElsewhere || incoming.appliedElsewhere,
            relatedURLs = (relatedURLs + incoming.relatedURLs + destinationJob.url).distinct(), revision = Math.addExact(revision, 1))
    }

    /** Choosing details never silently clears application evidence. Explicit correction is separate. */
    fun choose(versionID: String): ApplicationRecordBundle {
        val selected = (listOf(current) + alternatives + history).firstOrNull { it.id == versionID }
            ?: throw IllegalArgumentException("That record version changed. Reopen the record and choose again.")
        // A corrected application flag must not return merely because an old note is restored.
        // Preserve the immutable earlier version and create safe restored details instead.
        val chosen = if (!appliedElsewhere && selected.record.appliedElsewhere && history.any { it.id == selected.id })
            ApplicationRecordVersion.create(selected.record.copy(stage = ApplicationStage.SAVED, appliedElsewhere = false), "corrected")
        else selected
        return copy(current = chosen, alternatives = emptyList(),
            history = (history + current + alternatives).filterNot { it.id == chosen.id }.distinctBy { it.id },
            appliedElsewhere = appliedElsewhere || chosen.record.appliedElsewhere, revision = Math.addExact(revision, 1))
    }

    fun edited(draft: ApplicationRecordDraft, confirmedNotApplied: Boolean): ApplicationRecordBundle {
        require(!needsReview) { "Review the saved versions before editing this record." }
        draft.validated()
        val clearing = draft.stage == ApplicationStage.SAVED && appliedElsewhere
        require(!clearing || confirmedNotApplied) { "Confirm before marking this job as not applied." }
        val applied = when (draft.stage) {
            ApplicationStage.SAVED -> false
            ApplicationStage.CLOSED -> appliedElsewhere
            else -> true
        }
        val record = ApplicationRecord(draft.stage, draft.appliedDate, draft.followUpDate, draft.note, applied)
        return copy(current = ApplicationRecordVersion.create(record, if (clearing) "corrected" else "edited"),
            history = if (clearing) (history + current).distinctBy { it.id } else history,
            appliedElsewhere = applied, revision = Math.addExact(revision, 1))
    }

    companion object {
        fun create(job: Opportunity, record: ApplicationRecord = ApplicationRecord(), source: String = "edited") =
            ApplicationRecordBundle(job, ApplicationRecordVersion.create(record, source))
        fun decode(value: JSONObject): ApplicationRecordBundle {
            require(value.opt("identity") is String && value.opt("revision") is Number && value.opt("appliedElsewhere") is Boolean)
            val revision = value.getDouble("revision"); require(revision >= 1 && revision <= Int.MAX_VALUE && revision == revision.toInt().toDouble())
            val jobValue = value.getJSONObject("job")
            for (key in listOf("id", "url", "title", "company", "location", "country")) require(jobValue.opt(key) is String)
            val job = Opportunity.fromJson(jobValue); BoundaryPolicy.opportunityURL(job.url)
            require(BoundaryPolicy.jobIdentity(job.url) == value.getString("identity")) { "The saved record identity could not be verified. Its file is preserved." }
            val current = ApplicationRecordVersion.decode(value.getJSONObject("current"))
            val alternatives = value.requiredObjects("alternatives").map(ApplicationRecordVersion::decode)
            val history = value.requiredObjects("history").map(ApplicationRecordVersion::decode)
            val urls = value.requiredStrings("relatedURLs"); urls.forEach { BoundaryPolicy.opportunityURL(it) }
            require(job.url in urls)
            val versions = listOf(current) + alternatives + history
            require(versions.map { it.id }.distinct().size == versions.size)
            val applied = value.getBoolean("appliedElsewhere")
            require((listOf(current) + alternatives).none { it.record.appliedElsewhere } || applied) {
                "Conflicting active records include an earlier application. Their saved file is preserved for recovery."
            }
            return ApplicationRecordBundle(job, current, revision.toInt(), alternatives, history, applied, urls)
        }
    }
}

object ApplicationRecordsCodec {
    fun encode(records: Map<String, ApplicationRecordBundle>) = JSONObject().put("schema", 1)
        .put("records", JSONArray(records.toSortedMap().values.map(ApplicationRecordBundle::json)))
    fun decode(value: JSONObject?): Map<String, ApplicationRecordBundle> {
        if (value == null) return emptyMap()
        require(value.opt("schema") == 1) { "These application records need a newer app. Their saved file is preserved." }
        val records = value.requiredObjects("records").map(ApplicationRecordBundle::decode)
        require(records.map { it.identity }.distinct().size == records.size)
        return records.associateBy { it.identity }
    }
    fun migrateLegacy(jobs: List<Opportunity>, appliedIDs: Set<String>, records: Map<String, ApplicationRecordBundle>): Map<String, ApplicationRecordBundle> {
        val result = records.toMutableMap()
        for (job in jobs) if (job.id in appliedIDs && BoundaryPolicy.jobIdentity(job.url) !in result) {
            val record = ApplicationRecordBundle.create(job, ApplicationRecord(stage = ApplicationStage.APPLIED, appliedElsewhere = true), "legacy")
            result[record.identity] = record
        }
        return result
    }
    fun appliedIDs(jobs: List<Opportunity>, records: Map<String, ApplicationRecordBundle>, previous: Set<String>): Set<String> =
        previous.filterTo(mutableSetOf()) { id -> jobs.none { it.id == id } }.apply {
            for (job in jobs) {
                val record = records[BoundaryPolicy.jobIdentity(job.url)]
                if (record?.appliedElsewhere == true || record == null && job.id in previous) add(job.id)
            }
        }
}

data class ApplicationRecordEditorState(val token: String = UUID.randomUUID().toString(), val scope: String,
    val identity: String, val job: Opportunity, val expectedRevision: Int, val draft: ApplicationRecordDraft,
    val pendingNotApplied: ApplicationRecordDraft? = null, val quickCorrection: Boolean = false)

enum class SavedOpportunityFilter(val label: String) {
    ALL("All"), FOLLOW_UP("Follow-ups"), APPLIED("Applied"), INTERVIEW("Interview"), OFFER("Offers"), CLOSED("Closed");
    fun includes(record: ApplicationRecordBundle?): Boolean = when (this) {
        ALL -> true
        FOLLOW_UP -> record != null && record.current.record.followUpDate.isNotEmpty() && record.displayStage != ApplicationStage.CLOSED
        APPLIED -> record?.appliedElsewhere == true
        INTERVIEW -> record?.displayStage == ApplicationStage.INTERVIEW
        OFFER -> record?.displayStage == ApplicationStage.OFFER
        CLOSED -> record?.displayStage == ApplicationStage.CLOSED
    }
}
