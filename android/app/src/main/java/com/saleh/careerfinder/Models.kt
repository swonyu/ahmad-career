package com.saleh.careerfinder

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

fun JSONObject.safeString(key: String, fallback: String = ""): String = if (isNull(key)) fallback else optString(key, fallback)
fun JSONArray?.objects(): List<JSONObject> = if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }
fun JSONArray?.strings(): List<String> = if (this == null) emptyList() else (0 until length()).mapNotNull { optString(it).takeIf(String::isNotBlank) }
fun String.parts(): List<String> = split(',').map(String::trim).filter(String::isNotBlank).distinct()

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
    }
}

data class Opportunity(val id: String, val url: String, val title: String, val company: String, val location: String, val country: String, val localOnly: Boolean = false) {
    fun inputJson() = JSONObject().put("url", url).put("title", title).put("company", company).put("location", location).put("country", country)
    fun privateJson() = inputJson().put("id", id).put("localOnly", localOnly)
    companion object {
        fun fromJson(value: JSONObject, local: Boolean = false) = Opportunity(value.safeString("id"), value.safeString("url"), value.safeString("title"), value.safeString("company"), value.safeString("location"), value.safeString("country"), local || value.optBoolean("localOnly"))
    }
}

data class ReviewItem(val jobId: String, val state: String, val reason: String, val title: String, val company: String,
    val url: String, val payload: JSONObject, val resume: Resume?, val privacyPolicyUrl: String, val retryAt: String) {
    fun canSubmitNow(): Boolean = state == "ready" || state == "rate_limited" &&
        try { !Instant.parse(retryAt).isAfter(Instant.now()) } catch (_: Exception) { false }
    companion object {
        fun fromJson(value: JSONObject): ReviewItem {
            val job = value.optJSONObject("job") ?: JSONObject()
            return ReviewItem(value.safeString("jobId"), value.safeString("state"), value.safeString("reason"),
                value.safeString("title", job.safeString("title")), value.safeString("company", job.safeString("company")), job.safeString("url"),
                value.optJSONObject("payloadSummary") ?: JSONObject(), Resume.fromJson(value.optJSONObject("resume")), value.safeString("privacyPolicyUrl"), value.safeString("retryAt"))
        }
    }
}

data class ReviewPlan(val id: String, val digest: String, val profileRevision: Int, val expiresAt: String, val items: List<ReviewItem>) {
    fun expired(): Boolean = try { !Instant.parse(expiresAt).isAfter(Instant.now()) } catch (_: Exception) { true }
    companion object { fun fromJson(value: JSONObject) = ReviewPlan(value.getString("id"), value.getString("digest"), value.getInt("profileRevision"), value.getString("expiresAt"), value.optJSONArray("items").objects().map(ReviewItem::fromJson)) }
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
    }
}

data class JobAnswers(val comments: String = "", val consentStore: Boolean? = null, val consentMarketing: Boolean? = null) {
    fun json() = JSONObject().put("comments", comments.trim()).apply {
        consentStore?.let { put("consentStore", it) }
        consentMarketing?.let { put("consentMarketing", it) }
    }
}

data class CareerUiState(
    val loaded: Boolean = false, val connection: Connection? = null, val requiresPairing: Boolean = false,
    val profile: ProfileDraft = ProfileDraft(), val profileDirty: Boolean = false, val jobs: List<Opportunity> = emptyList(),
    val receipts: List<ApplicationReceipt> = emptyList(), val selected: Set<String> = emptySet(), val plan: ReviewPlan? = null,
    val activePlans: List<String> = emptyList(), val busy: Boolean = false, val error: String? = null, val notice: String? = null,
    val liveEnabled: Boolean = false, val storageBlocked: Boolean = false, val testService: Boolean = false,
    val manualApplied: Set<String> = emptySet(), val recoverablePlans: List<ReviewPlan> = emptyList()
)
