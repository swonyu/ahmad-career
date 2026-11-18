package com.saleh.careerfinder

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

data class WorkspaceImportPreview(val token: String = UUID.randomUUID().toString(), val expectedScope: String,
    val sourceOrigin: String?, val sourceWorkspaceId: String?, val sourcePlatform: String, val snapshot: CareerUiState,
    val search: JSONObject? = null, val pdfProblem: String? = null) {
    val sourceLabel: String get() = sourceOrigin ?: "Private phone draft"
    fun matches(connection: Connection?): Boolean = sourceOrigin != null && connection != null &&
        sourceOrigin == BoundaryPolicy.serviceOrigin(connection.origin) && sourceWorkspaceId == connection.workspaceId
}

/** Credential-free iPhone/Android interchange. Files are data, never approval or receipt authority. */
internal object WorkspaceTransfer {
    const val FORMAT = "career-finder-phone-workspace"
    const val MAX_BYTES = 24 * 1024 * 1024
    private fun objectOnly(value: JSONObject, names: Set<String>) {
        require(value.keys().asSequence().all { it in names }) { "This backup contains unsupported fields. Keep the file and use a compatible app version." }
    }
    private fun strings(value: JSONObject, vararg keys: String) {
        keys.forEach { require(value.opt(it) is String) { "The backup contains an invalid $it field." } }
    }
    private fun jobJson(job: Opportunity) = job.inputJson()
    private fun job(value: JSONObject): Opportunity {
        strings(value, "url", "title", "company", "location", "country")
        BoundaryPolicy.opportunityURL(value.getString("url"))
        require(listOf("title", "company", "location").all { value.getString(it).length <= 500 }) { "Saved job details in this backup exceed the common 500-character limit." }
        return Opportunity("local-" + UUID.randomUUID(), value.getString("url"), value.getString("title"), value.getString("company"),
            value.getString("location"), value.getString("country"), true)
    }
    private fun draftJson(checkpoint: RecordDraftCheckpoint, recordID: String?) = JSONObject()
        .put("job", jobJson(checkpoint.job)).apply {
            if (checkpoint.baseRevision > 0) put("revision", checkpoint.baseRevision)
            recordID?.let { put("recordID", it) }
        }
        .put("draft", JSONObject().put("stage", checkpoint.draft.stage.stored).put("appliedOn", checkpoint.draft.appliedDate)
            .put("followUpOn", checkpoint.draft.followUpDate).put("note", checkpoint.draft.note))
    private fun versionJson(job: Opportunity, version: ApplicationRecordVersion, revision: Int, archived: Boolean) = JSONObject()
        .put("id", version.id).put("job", jobJson(job)).put("stage", version.record.stage.stored)
        .put("appliedElsewhere", version.record.appliedElsewhere).put("appliedOn", version.record.appliedDate)
        .put("followUpOn", version.record.followUpDate).put("note", version.record.note).put("revision", revision)
        .put("archived", archived).put("updatedAt", version.savedAt)

    fun export(snapshot: CareerUiState, search: JSONObject?, includePDF: Boolean): JSONObject {
        val profile = snapshot.profile.apiJson(includeLinkedIn = false).put("linkedin", snapshot.profile.linkedin)
        // Preserve unfinished fields without turning them into a provider payload.
        for (key in listOf("firstName", "lastName", "email", "phone", "city", "country", "headline", "website"))
            profile.put(key, snapshot.profile.privateJson().get(key))
        profile.put("resume", snapshot.profile.resume?.let { if (includePDF) it.privateJson() else it.metadata() } ?: JSONObject.NULL)
        val versions = snapshot.applicationRecords.values.flatMap { record ->
            listOf(versionJson(record.job, record.current, record.revision, false)) +
                record.alternatives.map { versionJson(record.job, it, record.revision, false) } +
                record.history.map { versionJson(record.job, it, record.revision, true) }
        }
        val data = JSONObject().put("profile", profile).put("jobs", JSONArray(snapshot.jobs.map(::jobJson)))
            .put("applicationRecords", JSONArray(versions)).put("opportunityDraft", snapshot.opportunityDraft.privateJson())
            .put("recordDrafts", JSONArray((snapshot.recordDrafts.values + snapshot.recordDraftAlternatives).map {
                draftJson(it, snapshot.applicationRecords[it.identity]?.current?.id)
            })).put("continuationHolds", JSONArray(snapshot.continuationHolds.toList()))
        val rawProfile = snapshot.profile.privateJson().apply { remove("draftResume"); remove("resume") }
        val extension = JSONObject().put("rawProfile", rawProfile)
            .put("applicationRecords", ApplicationRecordsCodec.encode(snapshot.applicationRecords))
            .put("answers", JSONArray(snapshot.jobs.mapNotNull { job -> snapshot.answers[job.id]?.let { answer ->
                JSONObject().put("url", job.url).put("value", answer.json())
            } }))
            .put("selectedURLs", JSONArray(snapshot.jobs.filter { it.id in snapshot.selected }.map { it.url }))
            .put("receiptArchive", JSONArray((snapshot.receipts + snapshot.importedReceipts).map(WorkspaceStorage::receiptJson)))
            .put("recoveredOpportunityDrafts", JSONArray(snapshot.recoveredOpportunityDrafts.map(OpportunityDraft::privateJson)))
            .put("search", search ?: JSONObject.NULL)
        val source = JSONObject().put("scope", if (snapshot.connection == null) "unpaired" else "workspace")
        snapshot.connection?.let { source.put("serviceOrigin", BoundaryPolicy.serviceOrigin(it.origin)).put("workspaceId", it.workspaceId) }
        return JSONObject().put("format", FORMAT).put("version", 1).put("platform", "android").put("exportedAt", Instant.now().toString())
            .put("source", source).put("data", data).put("extensions", JSONObject().put("android", extension)).also {
                require(it.toString().toByteArray(Charsets.UTF_8).size <= MAX_BYTES) { "This export is too large. Export without PDF bytes, then save the PDF separately." }
            }
    }

    fun decode(value: JSONObject, destinationScope: String): WorkspaceImportPreview {
        require(value.toString().toByteArray(Charsets.UTF_8).size <= MAX_BYTES) { "Choose a phone workspace backup no larger than 24 MiB." }
        objectOnly(value, setOf("format", "version", "platform", "exportedAt", "source", "data", "extensions"))
        require(value.opt("format") == FORMAT && value.opt("version") == 1) { "Choose a supported Career Finder phone workspace backup." }
        strings(value, "platform", "exportedAt")
        require(value.getString("platform") in setOf("ios", "android")); Instant.parse(value.getString("exportedAt"))
        val source = value.getJSONObject("source")
        objectOnly(source, setOf("scope", "serviceOrigin", "workspaceId"))
        val connected = source.opt("scope") == "workspace"
        require(connected || source.opt("scope") == "unpaired")
        val origin = if (connected) {
            strings(source, "serviceOrigin", "workspaceId")
            require(source.getString("workspaceId").isNotBlank())
            BoundaryPolicy.serviceOrigin(source.getString("serviceOrigin"))
        } else {
            require(!source.has("serviceOrigin") && !source.has("workspaceId")); null
        }
        val data = value.getJSONObject("data")
        objectOnly(data, setOf("profile", "jobs", "applicationRecords", "recordDrafts", "opportunityDraft", "continuationHolds"))
        val profileJson = data.getJSONObject("profile")
        strings(profileJson, "firstName", "lastName", "email", "phone", "city", "country", "headline", "experienceLevel", "website", "linkedin")
        listOf("skills", "targetRoles", "targetCountries", "workModes").forEach { profileJson.requiredStrings(it) }
        require(profileJson.has("resume") && (profileJson.isNull("resume") || profileJson.opt("resume") is JSONObject))
        var profile = WorkspaceStorage.profile(JSONObject(profileJson.toString()).put("draftResume", profileJson.opt("resume") ?: JSONObject.NULL).put("revision", 0))
        val jobs = data.requiredObjects("jobs").map(::job)
        require(jobs.map { BoundaryPolicy.jobIdentity(it.url) }.distinct().size == jobs.size) { "The backup contains duplicate saved links." }
        val byIdentity = jobs.associateBy { BoundaryPolicy.jobIdentity(it.url) }
        val flattened = data.requiredObjects("applicationRecords").map { item ->
            strings(item, "id", "stage", "appliedOn", "followUpOn", "note", "updatedAt")
            require(item.opt("appliedElsewhere") is Boolean && item.opt("archived") is Boolean)
            val revision = item.opt("revision")
            require(revision is Number && revision.toDouble() >= 1 && revision.toDouble() <= Int.MAX_VALUE && revision.toDouble() == revision.toInt().toDouble())
            val importedJob = job(item.getJSONObject("job")); val identity = BoundaryPolicy.jobIdentity(importedJob.url)
            val record = ApplicationRecord.decode(JSONObject().put("stage", item.getString("stage"))
                .put("appliedDate", item.getString("appliedOn")).put("followUpDate", item.getString("followUpOn"))
                .put("note", item.getString("note")).put("appliedElsewhere", item.getBoolean("appliedElsewhere")))
            val version = ApplicationRecordVersion.decode(JSONObject().put("id", UUID.fromString(item.getString("id")).toString()).put("record", record.json())
                .put("savedAt", item.getString("updatedAt")).put("source", "copied"))
            FlatVersion(byIdentity[identity] ?: importedJob, version, (revision as Number).toInt(), item.getBoolean("archived"))
        }
        require(flattened.map { it.version.id }.distinct().size == flattened.size) { "The backup contains repeated record version identifiers." }
        var records = flattened.groupBy { BoundaryPolicy.jobIdentity(it.job.url) }.mapValues { (_, entries) ->
            val active = entries.filterNot { it.archived }
            val current = active.firstOrNull()?.version ?: ApplicationRecordVersion.create(ApplicationRecord(), "copied")
            ApplicationRecordBundle(entries.first().job, current, entries.maxOf { it.revision }, active.drop(1).map { it.version },
                entries.filter { it.archived }.map { it.version }, active.any { it.version.record.appliedElsewhere }, entries.map { it.job.url }.distinct())
        }
        val checkpoints = data.requiredObjects("recordDrafts").map { entry ->
            val draftJob = job(entry.getJSONObject("job")); val identity = BoundaryPolicy.jobIdentity(draftJob.url)
            if (entry.has("recordID") && !entry.isNull("recordID")) { strings(entry, "recordID"); UUID.fromString(entry.getString("recordID")) }
            val revision = if (entry.has("revision") && !entry.isNull("revision")) entry.opt("revision") else 0
            require(revision is Number && revision.toDouble() >= 0 && revision.toDouble() <= Int.MAX_VALUE && revision.toDouble() == revision.toInt().toDouble())
            val draft = entry.getJSONObject("draft"); strings(draft, "stage", "appliedOn", "followUpOn", "note")
            RecordDraftCheckpoint(destinationScope, identity, byIdentity[identity] ?: records[identity]?.job ?: draftJob, (revision as Number).toInt(),
                ApplicationRecordDraft(ApplicationStage.decode(draft.getString("stage")), draft.getString("appliedOn"),
                    draft.getString("followUpOn"), draft.getString("note")).validated())
        }
        val opportunityDraft = OpportunityDraft.fromJson(data.getJSONObject("opportunityDraft"))
        val holds = data.requiredStrings("continuationHolds").toSet()
        require(holds.all { it.isNotBlank() && it.length <= 200 })
        val extension = value.optJSONObject("extensions")?.optJSONObject("android")
        var answers = emptyMap<String, JobAnswers>(); var selected = emptySet<String>()
        var receipts = emptyList<ApplicationReceipt>(); var recovered = emptyList<OpportunityDraft>(); var search: JSONObject? = null
        if (extension != null) {
            extension.optJSONObject("rawProfile")?.let { raw ->
                profile = WorkspaceStorage.profile(JSONObject(raw.toString()).put("draftResume", profile.resume?.privateJson() ?: JSONObject.NULL)).copy(revision = 0)
            }
            extension.optJSONObject("applicationRecords")?.let { exact ->
                val decoded = ApplicationRecordsCodec.decode(exact)
                val exactIDs = decoded.values.flatMap { listOf(it.current) + it.alternatives + it.history }.map { it.id }.toSet()
                require(exactIDs == flattened.map { it.version.id }.toSet()) { "The backup's common and Android record histories disagree." }
                records = decoded.mapValues { (identity, bundle) -> bundle.copy(job = byIdentity[identity] ?: bundle.job.copy(id = "local-" + UUID.randomUUID(), localOnly = true)) }
            }
            if (extension.has("answers")) answers = extension.requiredObjects("answers").mapNotNull { entry ->
                strings(entry, "url"); val identity = BoundaryPolicy.jobIdentity(entry.getString("url"))
                val answer = entry.getJSONObject("value")
                require(answer.opt("comments") is String)
                listOf("consentStore", "consentMarketing").forEach { require(!answer.has(it) || answer.opt(it) is Boolean) }
                byIdentity[identity]?.id?.let { it to JobAnswers.fromJson(answer) }
            }.toMap()
            if (extension.has("selectedURLs")) selected = extension.requiredStrings("selectedURLs").mapNotNull { url -> byIdentity[BoundaryPolicy.jobIdentity(url)]?.id }.toSet()
            if (extension.has("receiptArchive")) {
                val envelope = JSONObject().put("schema", 1).put("receipts", extension.get("receiptArchive"))
                receipts = WorkspaceStorage.decode(envelope, null).receipts.map { it.copy(evidenceMode = "imported") }
            }
            if (extension.has("recoveredOpportunityDrafts")) recovered = extension.requiredObjects("recoveredOpportunityDrafts").map(OpportunityDraft::fromJson)
            if (extension.has("search") && !extension.isNull("search")) {
                search = extension.getJSONObject("search"); DiscoverySnapshotCodec.decode(search)
            }
        }
        val drafts = checkpoints.groupBy { it.identity }
        val snapshot = CareerUiState(loaded = true, profile = profile, profileDirty = true, jobs = jobs, applicationRecords = records,
            opportunityDraft = opportunityDraft, recoveredOpportunityDrafts = recovered,
            recordDrafts = drafts.mapValues { it.value.first() }, recordDraftAlternatives = drafts.values.flatMap { it.drop(1) },
            manualApplied = ApplicationRecordsCodec.appliedIDs(jobs, records, emptySet()), answers = answers, selected = selected,
            continuationHolds = holds, importedReceipts = receipts)
        return WorkspaceImportPreview(expectedScope = destinationScope, sourceOrigin = origin,
            sourceWorkspaceId = if (connected) source.getString("workspaceId") else null, sourcePlatform = value.getString("platform"), snapshot = snapshot, search = search)
    }
    private data class FlatVersion(val job: Opportunity, val version: ApplicationRecordVersion, val revision: Int, val archived: Boolean)
}
