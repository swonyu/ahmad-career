package com.saleh.careerfinder

import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject

/** Local JSON is untrusted too. A present malformed value must never turn into an empty draft. */
internal object WorkspaceStorage {
    private const val INVALID = "The saved workspace could not be read completely. Its encrypted file is preserved."
    private fun requireType(ok: Boolean) = require(ok) { INVALID }
    private fun JSONObject.strings(key: String, legacy: Set<String> = emptySet()): List<String> {
        if (!has(key)) return emptyList()
        requireType(opt(key) is JSONArray)
        return (0 until getJSONArray(key).length()).map { index ->
            val item = getJSONArray(key).opt(index); requireType(item is String && (BoundaryPolicy.validUnicode(item) || item in legacy)); item as String
        }
    }
    private fun JSONObject.objects(key: String): List<JSONObject> {
        if (!has(key)) return emptyList()
        requireType(opt(key) is JSONArray)
        return (0 until getJSONArray(key).length()).map { index ->
            val item = getJSONArray(key).opt(index); requireType(item is JSONObject); item as JSONObject
        }
    }
    private fun JSONObject.textFields(vararg fields: String, legacy: Set<String> = emptySet()) {
        fields.forEach { requireType(!has(it) || opt(it) is String && (BoundaryPolicy.validUnicode(getString(it)) || getString(it) in legacy)) }
    }
    private fun JSONObject.booleanFields(vararg fields: String) {
        fields.forEach { requireType(!has(it) || opt(it) is Boolean) }
    }
    private fun JSONObject.optionalObject(key: String, nullable: Boolean = false): JSONObject? {
        if (!has(key) || nullable && isNull(key)) return null
        requireType(opt(key) is JSONObject)
        return getJSONObject(key)
    }
    private fun integer(value: Any?, minimum: Long = 0): Long {
        requireType(value is Number && value.toDouble().isFinite() && value.toDouble() >= minimum &&
            value.toDouble() <= Int.MAX_VALUE && value.toDouble() == value.toLong().toDouble())
        return (value as Number).toLong()
    }
    internal fun profile(value: JSONObject): ProfileDraft = profile(value, emptySet())
    private fun profile(value: JSONObject, legacy: Set<String>): ProfileDraft {
        value.textFields("firstName", "lastName", "email", "phone", "city", "country", "headline", "experienceLevel", "website", "linkedin",
            "draftSkills", "draftTargetRoles", "draftTargetCountries", legacy = legacy)
        listOf("skills", "targetRoles", "targetCountries", "workModes").forEach { value.strings(it, legacy) }
        value.booleanFields("removeResume")
        if (value.has("revision")) integer(value.opt("revision"))
        for (key in listOf("draftResume", "resume")) value.optionalObject(key, nullable = true)?.let { resume ->
            listOf("name", "mime", "sha256").forEach { requireType(resume.opt(it) is String) }
            val size = integer(resume.opt("size"), 8)
            requireType(size <= BoundaryPolicy.MAX_PDF_BYTES && resume.getString("mime") == "application/pdf" &&
                resume.getString("sha256").matches(Regex("[a-f0-9]{64}")) &&
                ApplicationCvEvidence.validHistoricalRecordedName(resume.getString("name")) &&
                (BoundaryPolicy.validUnicode(resume.getString("name")) || resume.getString("name") in legacy))
            if (resume.has("dataBase64")) {
                requireType(resume.opt("dataBase64") is String)
                val encoded = resume.getString("dataBase64")
                requireType(encoded.length <= ((BoundaryPolicy.MAX_PDF_BYTES + 2) / 3) * 4)
                val bytes = Base64.decode(encoded, Base64.NO_WRAP)
                try {
                    requireType(Base64.encodeToString(bytes, Base64.NO_WRAP) == encoded && bytes.size.toLong() == size &&
                        BoundaryPolicy.sha256(bytes) == resume.getString("sha256"))
                    BoundaryPolicy.readPDF(bytes.inputStream())
                } finally { bytes.fill(0) }
            }
        }
        return ProfileDraft.fromJson(value)
    }
    internal fun job(value: JSONObject): Opportunity {
        listOf("id", "url", "title", "company", "location", "country").forEach { requireType(value.opt(it) is String) }
        value.booleanFields("localOnly")
        val job = Opportunity.fromJson(value)
        requireType(job.id.isNotBlank())
        BoundaryPolicy.historicalOpportunityURL(job.url)
        return job
    }
    private fun receipt(value: JSONObject, legacy: Set<String>): ApplicationReceipt {
        value.textFields("attemptId", "id", "title", "employer", "company", "state", "applicationId", "createdAt", "confirmedAt",
            "evidenceMode", "mode", "resumeSHA256", "provider", legacy = legacy)
        requireType(value.opt("attemptId") is String || value.opt("id") is String)
        requireType(value.opt("state") is String && (value.opt("createdAt") is String || value.opt("confirmedAt") is String))
        if (value.has("planId") && !value.isNull("planId")) requireType(value.opt("planId") is String)
        value.optionalObject("job", nullable = true)?.textFields("title", "company", "url", legacy = legacy)
        if (value.has("error") && !value.isNull("error")) {
            requireType(value.opt("error") is String || value.opt("error") is JSONObject)
            value.optJSONObject("error")?.textFields("message", "code", legacy = legacy)
        }
        return ApplicationReceipt.fromJson(value).also { requireType(it.id.isNotBlank() && it.state.isNotBlank()) }
    }
    fun decode(stored: JSONObject?, connection: Connection?, expectedScope: String? = null): CareerUiState {
        if (stored == null) return CareerUiState(loaded = true, connection = connection)
        requireType(!stored.has("historicalText") || stored.opt("historicalText") is JSONObject)
        val evidence = stored.optJSONObject("historicalText")
        if (evidence != null) requireType(evidence.opt("version") == 1 && evidence.keys().asSequence().toSet() == setOf("version", "reference", "entries"))
        val reference = evidence?.getJSONObject("reference")?.let { HistoricalRecoveryReference.decode(it, connection) }
        val projection = JSONObject(stored.toString()).apply { remove("historicalText") }
        val restored = if (evidence != null) HistoricalText.restore(projection, evidence.getJSONArray("entries"), authorityPaths = false)
            else projection to emptySet()
        val value = restored.first
        val historical = restored.second
        requireType(value.opt("schema") == 1)
        val known = setOf("schema", "profile", "profileDirty", "opportunityDraft", "applicationRecords", "recordDrafts", "recordDraftAlternatives", "jobs", "activePlans", "manualApplied",
            "selected", "obsoleteReviews", "continuationHolds", "serverProfile", "answers", "receipts", "importedReceipts", "recoveredOpportunityDrafts")
        requireType(value.keys().asSequence().all { it in known })
        value.booleanFields("profileDirty")
        val jobs = value.objects("jobs").map(::job)
        requireType(jobs.map { it.id }.distinct().size == jobs.size)
        val legacy = value.strings("manualApplied").toSet()
        val records = ApplicationRecordsCodec.migrateLegacy(jobs, legacy, ApplicationRecordsCodec.decode(value.optionalObject("applicationRecords")))
        val drafts = value.objects("recordDrafts").map(RecordDraftCheckpoint::decode)
        val alternatives = value.objects("recordDraftAlternatives").map(RecordDraftCheckpoint::decode)
        requireType(drafts.map { it.identity }.distinct().size == drafts.size)
        val scope = expectedScope ?: CareerUiState(connection = connection).privateScope
        requireType((drafts + alternatives).all { it.scope == scope })
        val answers = value.optionalObject("answers")?.let { map -> map.keys().asSequence().associateWith { id ->
            requireType(map.opt(id) is JSONObject)
            val answer = map.getJSONObject(id)
            answer.textFields("comments", legacy = historical); answer.booleanFields("consentStore", "consentMarketing")
            JobAnswers.fromJson(answer)
        } }.orEmpty()
        return CareerUiState(loaded = true, connection = connection,
            profile = value.optionalObject("profile")?.let { profile(it, historical) } ?: ProfileDraft(), profileDirty = value.optBoolean("profileDirty"),
            serverProfile = value.optionalObject("serverProfile", nullable = true)?.let { profile(it, historical) },
            opportunityDraft = value.optionalObject("opportunityDraft")?.let(OpportunityDraft::fromJson) ?: OpportunityDraft(),
            recoveredOpportunityDrafts = value.objects("recoveredOpportunityDrafts").map(OpportunityDraft::fromJson),
            applicationRecords = records, recordDrafts = drafts.associateBy { it.identity }, recordDraftAlternatives = alternatives, jobs = jobs,
            manualApplied = ApplicationRecordsCodec.appliedIDs(jobs, records, legacy), answers = answers,
            receipts = value.objects("receipts").map { receipt(it, historical) }, importedReceipts = value.objects("importedReceipts").map { receipt(it, historical).copy(evidenceMode = "imported") },
            activePlans = value.strings("activePlans"), selected = value.strings("selected").toSet(),
            obsoleteReviews = value.strings("obsoleteReviews").toSet(), continuationHolds = value.strings("continuationHolds").toSet(),
            historicalRecovery = reference, historicalRawStrings = historical)
    }
    fun receiptJson(receipt: ApplicationReceipt) = JSONObject().put("attemptId", receipt.id).put("title", receipt.title)
        .put("employer", receipt.company).put("state", receipt.state).put("applicationId", receipt.applicationId)
        .put("createdAt", receipt.date).put("error", receipt.error).put("evidenceMode", receipt.evidenceMode)
        .put("resumeSHA256", receipt.resumeSHA256).put("provider", receipt.provider)
        .apply {
            if (receipt.planId.isNotEmpty()) put("planId", receipt.planId)
            receipt.resumeName?.let { serviceData(ApplicationCvEvidence.validHistoricalRecordedName(it)); put("resumeName", it) }
            receipt.profileRevision?.let { serviceData(it >= 0); put("profileRevision", it) }
        }
    fun hasHistoricalValues(snapshot: CareerUiState): Boolean = HistoricalText.malformedStrings(rawEncode(snapshot)).isNotEmpty()
    fun encode(snapshot: CareerUiState): JSONObject {
        val value = rawEncode(snapshot)
        val (projected, entries) = HistoricalText.project(value, snapshot.historicalRawStrings)
        if (entries.length() > 0 || snapshot.historicalRecovery != null) {
            val reference = requireNotNull(snapshot.historicalRecovery) { "The original historical text record is unavailable. Your earlier file is kept." }
            projected.put("historicalText", JSONObject().put("version", 1).put("reference", reference.json()).put("entries", entries))
        }
        return projected
    }
    private fun rawEncode(snapshot: CareerUiState): JSONObject = JSONObject().put("schema", 1)
        .put("profile", snapshot.profile.privateJson()).put("profileDirty", snapshot.profileDirty)
        .put("opportunityDraft", snapshot.opportunityDraft.privateJson())
        .put("recoveredOpportunityDrafts", JSONArray(snapshot.recoveredOpportunityDrafts.map(OpportunityDraft::privateJson)))
        .put("applicationRecords", ApplicationRecordsCodec.encode(snapshot.applicationRecords))
        .put("recordDrafts", JSONArray(snapshot.recordDrafts.values.map(RecordDraftCheckpoint::json)))
        .put("recordDraftAlternatives", JSONArray(snapshot.recordDraftAlternatives.map(RecordDraftCheckpoint::json)))
        .put("jobs", JSONArray(snapshot.jobs.map(Opportunity::privateJson)))
        .put("activePlans", JSONArray(snapshot.activePlans)).put("manualApplied", JSONArray(snapshot.manualApplied.toList()))
        .put("selected", JSONArray(snapshot.selected.toList())).put("obsoleteReviews", JSONArray(snapshot.obsoleteReviews.toList()))
        .put("continuationHolds", JSONArray(snapshot.continuationHolds.toList()))
        .put("serverProfile", snapshot.serverProfile?.privateJson() ?: JSONObject.NULL)
        .put("answers", JSONObject().apply { snapshot.answers.forEach { (id, answer) -> put(id, answer.json()) } })
        .put("receipts", JSONArray(snapshot.receipts.map(::receiptJson)))
        .put("importedReceipts", JSONArray(snapshot.importedReceipts.map(::receiptJson)))
}

/** An unfinished edit has no effect on the saved application status or employer approval. */
data class RecordDraftCheckpoint(val scope: String, val identity: String, val job: Opportunity, val baseRevision: Int,
    val draft: ApplicationRecordDraft) {
    fun json(): JSONObject {
        require(applicationNoteLength(draft.note) <= 2_000 && draft.note.toByteArray(Charsets.UTF_8).toString(Charsets.UTF_8) == draft.note) { "Check this unfinished note before saving. The earlier saved file is kept." }
        return JSONObject().put("scope", scope).put("identity", identity).put("job", job.privateJson()).put("baseRevision", baseRevision)
        .put("stage", draft.stage.stored).put("appliedDate", draft.appliedDate).put("followUpDate", draft.followUpDate).put("note", draft.note)
        .also { ApplicationCvEvidence.putManualName(it, draft.manualResumeName) }
    }
    companion object {
        fun decode(value: JSONObject): RecordDraftCheckpoint {
            listOf("scope", "identity", "stage", "appliedDate", "followUpDate", "note").forEach { require(value.opt(it) is String) }
            val revision = value.opt("baseRevision")
            require(revision is Number && revision.toDouble() >= 0 && revision.toDouble() <= Int.MAX_VALUE && revision.toDouble() == revision.toInt().toDouble())
            val job = WorkspaceStorage.job(value.getJSONObject("job"))
            require(value.getString("identity") == BoundaryPolicy.jobIdentity(job.url))
            val draft = ApplicationRecordDraft(ApplicationStage.decode(value.getString("stage")), value.getString("appliedDate"),
                value.getString("followUpDate"), value.getString("note"), ApplicationCvEvidence.manualName(value))
            require(applicationNoteLength(draft.note) <= 2_000 && draft.note.toByteArray(Charsets.UTF_8).toString(Charsets.UTF_8) == draft.note)
            return RecordDraftCheckpoint(value.getString("scope"), value.getString("identity"), job, (revision as Number).toInt(), draft)
        }
    }
}
