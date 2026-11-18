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
private fun JSONObject.serviceLinkedIn(): String {
    if (!has("linkedin")) return ""
    val value = opt("linkedin")
    serviceData(value is String)
    if (value == "") return ""
    val canonical = runCatching { BoundaryPolicy.linkedinProfileURL(value as String) }.getOrNull()
    serviceData(canonical != null)
    return canonical!!
}
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

