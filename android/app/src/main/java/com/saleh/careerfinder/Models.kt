package com.saleh.careerfinder

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

fun JSONObject.safeString(key: String, fallback: String = ""): String = if (isNull(key)) fallback else optString(key, fallback)
fun JSONArray?.objects(): List<JSONObject> = if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }
fun JSONArray?.strings(): List<String> = if (this == null) emptyList() else (0 until length()).mapNotNull { optString(it).takeIf(String::isNotBlank) }
fun String.parts(): List<String> = split(',').map(String::trim).filter(String::isNotBlank).distinct()
private const val INVALID_SERVICE_DATA = "The service returned incomplete or invalid data. Your phone draft was kept. Refresh before trying again."
fun serviceData(check: Boolean) { require(check) { INVALID_SERVICE_DATA } }
fun JSONObject.requiredObjects(key: String): List<JSONObject> {
    val array = opt(key)
    serviceData(array is JSONArray)
    return (0 until (array as JSONArray).length()).map { index ->
        val value = array.opt(index); serviceData(value is JSONObject); value as JSONObject
    }
}
fun JSONObject.requiredStrings(key: String): List<String> {
    val array = opt(key)
    serviceData(array is JSONArray)
    return (0 until (array as JSONArray).length()).map { index ->
        val value = array.opt(index); serviceData(value is String); value as String
    }
}

data class Resume(val name: String, val size: Long, val sha256: String, val dataBase64: String? = null) {
    fun metadata() = JSONObject().put("name", name).put("mime", "application/pdf").put("size", size).put("sha256", sha256)
    fun privateJson() = metadata().apply { dataBase64?.let { put("dataBase64", it) } }
    companion object {
        fun fromJson(value: JSONObject?): Resume? = value?.let { Resume(it.safeString("name"), it.optLong("size"), it.safeString("sha256"), it.safeString("dataBase64").ifBlank { null }) }
    }
}

data class ProfileDraft(
    val firstName: String = "", val lastName: String = "", val email: String = "", val phone: String = "",
    val city: String = "", val country: String = "", val headline: String = "", val skills: String = "",
    val targetRoles: String = "", val targetCountries: String = "", val workModes: Set<String> = emptySet(),
    val experienceLevel: String = "any", val website: String = "", val resume: Resume? = null,
    val removeResume: Boolean = false, val revision: Int = 0
) {
    fun apiJson(): JSONObject = JSONObject().put("firstName", firstName.trim()).put("lastName", lastName.trim())
        .put("email", email.trim()).put("phone", phone.trim()).put("city", city.trim()).put("country", country.trim().uppercase())
        .put("headline", headline.trim()).put("skills", JSONArray(skills.parts())).put("targetRoles", JSONArray(targetRoles.parts()))
        .put("targetCountries", JSONArray(targetCountries.parts().map(String::uppercase)))
        .put("workModes", JSONArray(workModes.toList().sorted())).put("experienceLevel", experienceLevel).put("website", website.trim())
        .apply {
            if (removeResume) put("resume", JSONObject.NULL)
            else resume?.dataBase64?.let { put("resume", JSONObject().put("name", resume.name).put("mime", "application/pdf").put("dataBase64", it)) }
        }
    fun privateJson() = apiJson().apply { remove("resume") }.put("revision", revision).put("draftResume", resume?.privateJson() ?: JSONObject.NULL).put("removeResume", removeResume)
    companion object {
        fun fromJson(value: JSONObject): ProfileDraft = ProfileDraft(
            value.safeString("firstName"), value.safeString("lastName"), value.safeString("email"), value.safeString("phone"),
            value.safeString("city"), value.safeString("country"), value.safeString("headline"), value.optJSONArray("skills").strings().joinToString(", "),
            value.optJSONArray("targetRoles").strings().joinToString(", "), value.optJSONArray("targetCountries").strings().joinToString(", "),
            value.optJSONArray("workModes").strings().toSet(), value.safeString("experienceLevel", "any"), value.safeString("website"),
            Resume.fromJson(value.optJSONObject("draftResume") ?: value.optJSONObject("resume")), value.optBoolean("removeResume"), value.optInt("revision")
        )
        fun fromServer(value: JSONObject): ProfileDraft {
            listOf("firstName", "lastName", "email", "phone", "city", "country", "headline", "experienceLevel", "website")
                .forEach { serviceData(value.opt(it) is String) }
            listOf("skills", "targetRoles", "targetCountries", "workModes").forEach { value.requiredStrings(it) }
            val revision = value.opt("revision")
            serviceData(revision is Number && revision.toDouble() >= 0 && revision.toDouble() <= Int.MAX_VALUE &&
                revision.toDouble() == revision.toInt().toDouble())
            serviceData(value.has("resume") && (value.isNull("resume") || value.opt("resume") is JSONObject))
            val resume = value.optJSONObject("resume")?.let { metadata ->
                val name = metadata.opt("name")
                val size = metadata.opt("size")
                val hash = metadata.opt("sha256")
                serviceData(name is String && name.isNotBlank() && name.length <= 180 && !name.startsWith(".") &&
                    name.endsWith(".pdf", ignoreCase = true) && !name.any { it.code < 32 || it.code == 127 || it in "/\\:" })
                serviceData(metadata.opt("mime") == "application/pdf" && size is Number && size.toDouble() >= 8 &&
                    size.toDouble() <= BoundaryPolicy.MAX_PDF_BYTES && size.toDouble() == size.toLong().toDouble())
                serviceData(hash is String && hash.matches(Regex("[a-f0-9]{64}")))
                Resume(name as String, (size as Number).toLong(), hash as String)
            }
            return fromJson(value).copy(resume = resume, removeResume = false, revision = (revision as Number).toInt())
        }
    }
}

data class Opportunity(val id: String, val url: String, val title: String, val company: String, val location: String, val country: String, val localOnly: Boolean = false) {
    fun inputJson() = JSONObject().put("url", url).put("title", title).put("company", company).put("location", location).put("country", country)
    fun privateJson() = inputJson().put("id", id).put("localOnly", localOnly)
    companion object {
        fun fromJson(value: JSONObject, local: Boolean = false) = Opportunity(value.safeString("id"), value.safeString("url"), value.safeString("title"), value.safeString("company"), value.safeString("location"), value.safeString("country"), local || value.optBoolean("localOnly"))
        fun fromServer(value: JSONObject): Opportunity {
            listOf("id", "url", "title", "company", "location", "country").forEach { serviceData(value.opt(it) is String) }
            serviceData(value.getString("id").isNotBlank())
            BoundaryPolicy.opportunityURL(value.getString("url"))
            return fromJson(value).copy(localOnly = false)
        }
    }
}

data class ReviewItem(val jobId: String, val state: String, val reason: String, val title: String, val company: String,
    val url: String, val payload: JSONObject, val resume: Resume?, val privacyPolicyUrl: String, val retryAt: String) {
    fun canSubmitNow(): Boolean = state == "ready" || state == "rate_limited" &&
        try { !Instant.parse(retryAt).isAfter(Instant.now()) } catch (_: Exception) { false }
    companion object {
        fun fromJson(value: JSONObject): ReviewItem {
            val job = value.optJSONObject("job") ?: JSONObject()
            val payload = value.optJSONObject("payloadSummary")
            serviceData(payload != null)
            listOf("name", "email", "phone", "website", "comments").forEach { serviceData(payload!!.opt(it) is String) }
            listOf("consentStore", "consentMarketing").forEach { serviceData(!payload!!.has(it) || payload.opt(it) is Boolean) }
            val resume = Resume.fromJson(value.optJSONObject("resume"))
            if (value.opt("state") == "ready") serviceData(resume != null && resume.size in 8..BoundaryPolicy.MAX_PDF_BYTES &&
                resume.sha256.matches(Regex("[a-f0-9]{64}")) && value.optJSONObject("resume")?.opt("mime") == "application/pdf" &&
                payload!!.getString("name").isNotBlank() && payload.getString("email").isNotBlank())
            return ReviewItem(value.safeString("jobId"), value.safeString("state"), value.safeString("reason"),
                value.safeString("title", job.safeString("title")), value.safeString("company", job.safeString("company")), job.safeString("url"),
                payload!!, resume, value.safeString("privacyPolicyUrl"), value.safeString("retryAt"))
        }
    }
}

data class ReviewPlan(val id: String, val digest: String, val profileRevision: Int, val expiresAt: String, val items: List<ReviewItem>,
    val unapproved: Boolean = false) {
    fun expired(): Boolean = try { !Instant.parse(expiresAt).isAfter(Instant.now()) } catch (_: Exception) { true }
    companion object { fun fromJson(value: JSONObject): ReviewPlan {
        val items = value.requiredObjects("items").map(ReviewItem::fromJson)
        serviceData(items.all { it.jobId.isNotBlank() } && items.map(ReviewItem::jobId).distinct().size == items.size)
        return ReviewPlan(value.getString("id"), value.getString("digest"), value.getInt("profileRevision"), value.getString("expiresAt"), items,
            value.has("approvedAt") && value.isNull("approvedAt"))
    } }
}

data class ApplicationReceipt(val id: String, val title: String, val company: String, val state: String, val applicationId: String,
    val date: String, val error: String, val evidenceMode: String, val resumeSHA256: String, val provider: String) {
    val testMode: Boolean get() = evidenceMode == "test"
    val verified: Boolean get() = BoundaryPolicy.isLiveReceipt(evidenceMode, provider, state, applicationId)
    companion object {
        fun fromJson(value: JSONObject): ApplicationReceipt {
            val job = value.optJSONObject("job") ?: JSONObject()
            val error = value.opt("error")
            return ApplicationReceipt(value.safeString("attemptId", value.safeString("id")),
                value.safeString("title", job.safeString("title", "Application")),
                value.safeString("employer", value.safeString("company", job.safeString("company"))),
                value.safeString("state"), value.safeString("applicationId"), value.safeString("confirmedAt", value.safeString("createdAt")),
                if (error is JSONObject) error.safeString("message") else if (error is String) error else "",
                value.safeString("evidenceMode", if (value.safeString("mode") == "test") "test" else "unknown"), value.safeString("resumeSHA256"), value.safeString("provider"))
        }
        fun fromServer(value: JSONObject): ApplicationReceipt {
            serviceData((value.opt("id") is String || value.opt("attemptId") is String) &&
                value.opt("state") is String && value.opt("createdAt") is String)
            val receipt = fromJson(value)
            serviceData(receipt.id.isNotBlank() && receipt.state.isNotBlank())
            return receipt
        }
    }
}

data class JobAnswers(val comments: String = "", val consentStore: Boolean? = null, val consentMarketing: Boolean? = null) {
    fun json() = JSONObject().put("comments", comments.trim()).apply {
        consentStore?.let { put("consentStore", it) }
        consentMarketing?.let { put("consentMarketing", it) }
    }
    companion object {
        fun fromJson(value: JSONObject) = JobAnswers(value.safeString("comments"),
            value.opt("consentStore") as? Boolean, value.opt("consentMarketing") as? Boolean)
    }
}

data class StorageProblem(val record: String, val writing: Boolean)
data class PhoneImport(val profile: ProfileDraft, val jobs: List<Opportunity>, val manualApplied: Set<String>)

data class CareerUiState(
    val loaded: Boolean = false, val connection: Connection? = null, val requiresPairing: Boolean = false,
    val profile: ProfileDraft = ProfileDraft(), val profileDirty: Boolean = false, val jobs: List<Opportunity> = emptyList(),
    val receipts: List<ApplicationReceipt> = emptyList(), val selected: Set<String> = emptySet(), val plan: ReviewPlan? = null,
    val activePlans: List<String> = emptyList(), val busy: Boolean = false, val error: String? = null, val notice: String? = null,
    val liveEnabled: Boolean = false, val storageBlocked: Boolean = false, val testService: Boolean = false,
    val manualApplied: Set<String> = emptySet(), val recoverablePlans: List<ReviewPlan> = emptyList(),
    val answers: Map<String, JobAnswers> = emptyMap(), val reviewGeneration: Long = 0,
    val serverProfile: ProfileDraft? = null, val storageProblem: StorageProblem? = null,
    val phoneImport: PhoneImport? = null, val reviewingRecoveredPlan: Boolean = false,
    val obsoleteReviews: Set<String> = emptySet()
) {
    val profileConflict: ProfileDraft? get() = serverProfile?.takeIf { profileDirty && it.revision != profile.revision }
}
