package com.saleh.careerfinder
import org.json.JSONObject
interface PrivateStore {
    fun read(name: String): JSONObject?
    fun write(name: String, value: JSONObject)
    fun remove(name: String)
    fun startFreshPreservingExisting()
    fun names(): Set<String> = emptySet()
    fun preservedWorkspaces(): List<PreservedWorkspace> = emptyList()
    fun readPreserved(area: String, name: String): JSONObject? = throw IllegalArgumentException("This storage provider cannot open earlier recovery areas.")
    fun removePreserved(area: String, names: Set<String>): Unit = throw IllegalArgumentException("This storage provider cannot remove earlier recovery areas.")
}

data class PreservedWorkspace(val area: String, val record: String) {
    val id: String get() = "$area/$record"
}

