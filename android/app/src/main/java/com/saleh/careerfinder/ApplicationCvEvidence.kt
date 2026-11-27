package com.saleh.careerfinder

import org.json.JSONObject

/** Display evidence belongs to its immutable review/attempt or explicit private note, never today's profile. */
internal object ApplicationCvEvidence {
    const val MANUAL_NAME_ERROR = "Use a filename of up to 180 characters without paths or control characters."

    fun validManualName(value: String): Boolean = value.length <= 180 && BoundaryPolicy.validUnicode(value) &&
        value.none { it.code < 32 || it.code == 127 || it in "/\\:" }

    fun validRecordedName(value: String): Boolean = validManualName(value) && value.isNotEmpty() &&
        value == value.trim() && !value.startsWith(".") && value.endsWith(".pdf", ignoreCase = true)

    /** Historical names are display evidence; new manual names retain strict Unicode validation. */
    fun validHistoricalRecordedName(value: String): Boolean = value.length <= 180 && value.isNotEmpty() &&
        value.none { it.code < 32 || it.code == 127 || it in "/\\:" } &&
        value == value.trim() && !value.startsWith(".") && value.endsWith(".pdf", ignoreCase = true)

    fun manualName(value: JSONObject): String? {
        if (!value.has("manualResumeName") || value.isNull("manualResumeName")) return null
        val name = value.opt("manualResumeName")
        require(name is String && validManualName(name)) { MANUAL_NAME_ERROR }
        return name as String
    }

    fun putManualName(value: JSONObject, name: String?): JSONObject {
        require(name == null || validManualName(name)) { MANUAL_NAME_ERROR }
        if (name != null) value.put("manualResumeName", name)
        return value
    }

    fun recordedName(value: JSONObject): String? {
        if (!value.has("resumeName") || value.isNull("resumeName")) return null
        val name = value.opt("resumeName")
        serviceData(name is String && validHistoricalRecordedName(name))
        return name as String
    }

    fun profileRevision(value: JSONObject): Int? {
        if (!value.has("profileRevision") || value.isNull("profileRevision")) return null
        val revision = value.opt("profileRevision")
        serviceData(revision is Number && revision.toDouble().isFinite() && revision.toDouble() >= 0 &&
            revision.toDouble() <= Int.MAX_VALUE && revision.toDouble() == revision.toInt().toDouble())
        return (revision as Number).toInt()
    }
}
