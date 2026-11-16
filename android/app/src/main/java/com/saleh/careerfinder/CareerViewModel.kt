package com.saleh.careerfinder

import android.app.Application
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class CareerViewModel(application: Application) : AndroidViewModel(application) {
    private val vault = SecureVault(application)
    private val mutable = MutableStateFlow(CareerUiState())
    val state = mutable.asStateFlow()
    private var polling: Job? = null
    private var foreground = false
    private val diskMutex = Mutex()

    init {
        viewModelScope.launch {
            try {
                val connection = withContext(Dispatchers.IO) { vault.read("connection")?.let(Connection::fromJson) }
                mutable.update { it.copy(connection = connection) }
                restore()
                mutable.update { it.copy(loaded = true) }
                if (connection != null) refresh()
            } catch (_: Exception) {
                mutable.update { it.copy(loaded = true, storageBlocked = true, error = "Private data could not be read. The original encrypted files are preserved; saving is paused.") }
            }
        }
    }

    private fun workspaceName(connection: Connection? = state.value.connection): String = connection?.let {
        "workspace-" + BoundaryPolicy.workspaceKey(it.origin, it.workspaceId)
    } ?: "workspace-unpaired"

    private suspend fun restore() {
        val stored = withContext(Dispatchers.IO) { vault.read(workspaceName()) }
        require(stored == null || stored.optInt("schema") == 1) { "This saved workspace needs a newer app. Its data is preserved." }
        val saved = stored ?: JSONObject()
        mutable.update { it.copy(
            profile = saved.optJSONObject("profile")?.let(ProfileDraft::fromJson) ?: ProfileDraft(),
            profileDirty = saved.optBoolean("profileDirty"),
            jobs = saved.optJSONArray("jobs").objects().map { job -> Opportunity.fromJson(job) },
            receipts = saved.optJSONArray("receipts").objects().map(ApplicationReceipt::fromJson),
            activePlans = saved.optJSONArray("activePlans").strings(), selected = emptySet(), plan = null,
            manualApplied = saved.optJSONArray("manualApplied").strings().toSet()
        ) }
    }

    private suspend fun persist() = diskMutex.withLock {
        check(!state.value.storageBlocked) { "Private storage is unavailable; the original files are preserved." }
        val snapshot = state.value
        val envelope = JSONObject().put("schema", 1).put("profile", snapshot.profile.privateJson()).put("profileDirty", snapshot.profileDirty)
            .put("jobs", JSONArray(snapshot.jobs.map(Opportunity::privateJson)))
            .put("activePlans", JSONArray(snapshot.activePlans))
            .put("manualApplied", JSONArray(snapshot.manualApplied.toList()))
            .put("receipts", JSONArray(snapshot.receipts.map {
                JSONObject().put("attemptId", it.id).put("title", it.title).put("employer", it.company).put("state", it.state)
                    .put("applicationId", it.applicationId).put("createdAt", it.date).put("error", it.error)
                    .put("evidenceMode", it.evidenceMode).put("resumeSHA256", it.resumeSHA256).put("provider", it.provider)
            }))
        val name = workspaceName(snapshot.connection)
        withContext(Dispatchers.IO) { vault.write(name, envelope) }
    }

    private fun message(error: Throwable): String = when (error) {
        is ApiFailure -> if (error.status == 401) "This connection has expired. Pair this phone again to reconnect to your workspace." else error.message
        is IllegalArgumentException -> error.message ?: "Check the entered information."
        else -> "The request could not be completed. Your saved records remain available. For an application, refresh receipts before trying again."
    }

    private fun action(block: suspend () -> Unit) {
        if (state.value.busy || state.value.storageBlocked) return
        mutable.update { it.copy(busy = true, error = null, notice = null) }
        viewModelScope.launch {
            try { block() }
            catch (cancel: CancellationException) { throw cancel }
            catch (error: Exception) { mutable.update { it.copy(error = message(error), requiresPairing = it.requiresPairing || error is ApiFailure && error.status == 401) } }
            finally { mutable.update { it.copy(busy = false) } }
        }
    }

    fun dismissMessage() { mutable.update { it.copy(error = null, notice = null) } }

    fun pair(origin: String, code: String, done: () -> Unit) = action {
        val connection = CareerApi.pair(origin, code)
        withContext(Dispatchers.IO) { vault.write("connection", connection.toJson()) }
        polling?.cancel()
        mutable.value = CareerUiState(loaded = true, busy = true, connection = connection)
        restore()
        refreshInternal()
        mutable.update { it.copy(notice = "Phone paired. This workspace is separate from your offline draft.") }
        done()
    }

    fun disconnect() = action {
        polling?.cancel()
        val connection = state.value.connection
        if (connection != null) {
            // Only remove the token after the server confirms revocation.
            try { CareerApi(connection).request("POST", "session/revoke", JSONObject()) }
            catch (error: ApiFailure) { if (error.status != 401) throw error }
        }
        withContext(Dispatchers.IO) { vault.remove("connection") }
        mutable.value = CareerUiState(loaded = true, busy = true)
        restore()
        mutable.update { it.copy(notice = "Phone disconnected. Your separate offline draft is available.") }
    }

    fun editProfile(change: (ProfileDraft) -> ProfileDraft) {
        mutable.update { it.copy(profile = change(it.profile), profileDirty = true, plan = null) }
    }

    fun choosePDF(uri: Uri) = action {
        val resume = withContext(Dispatchers.IO) {
            val resolver = getApplication<Application>().contentResolver
            val name = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }?.let { BoundaryPolicy.pdfName(it) } ?: "Resume.pdf"
            val bytes = resolver.openInputStream(uri)?.use { BoundaryPolicy.readPDF(it) }
                ?: throw IllegalArgumentException("This document could not be opened. Choose it again from Files.")
            Resume(name, bytes.size.toLong(), BoundaryPolicy.sha256(bytes), Base64.encodeToString(bytes, Base64.NO_WRAP))
        }
        mutable.update { it.copy(profile = it.profile.copy(resume = resume, removeResume = false), profileDirty = true, plan = null,
            notice = "PDF selected. Save your profile to keep it.") }
    }

    fun removePDF() { editProfile { it.copy(resume = null, removeResume = true) } }

    fun saveProfile() = action {
        val captured = state.value.profile
        if (captured.country.isNotBlank()) require(captured.country.trim().matches(Regex("[A-Za-z]{2}"))) { "Use a two-letter country code, such as SA or GB." }
        if (captured.website.isNotBlank()) BoundaryPolicy.opportunityURL(captured.website.trim())
        val connection = state.value.connection
        if (connection == null) {
            mutable.update { it.copy(profileDirty = false) }
            try { persist() } catch (error: Exception) { mutable.update { it.copy(profileDirty = true) }; throw error }
            mutable.update { it.copy(notice = "Profile saved privately on this phone.") }
        } else {
            persist()
            val response = CareerApi(connection).request("PUT", "profile", JSONObject().put("expectedRevision", captured.revision).put("profile", captured.apiJson()))
            val saved = ProfileDraft.fromJson(response.getJSONObject("profile"))
            mutable.update {
                if (it.profile == captured) it.copy(profile = saved, profileDirty = false, plan = null, notice = "Profile saved to your connected workspace.")
                else it.copy(profile = it.profile.copy(revision = saved.revision), profileDirty = true, plan = null,
                    notice = "The earlier profile was saved. Your newer edits are still a draft.")
            }
            persist()
        }
    }

    fun reloadProfile() = action {
        if (state.value.connection == null) restore() else refreshInternal(forceProfile = true)
    }

    fun addOpportunity(url: String, title: String, company: String, location: String, country: String, done: () -> Unit) = action {
        val normalized = BoundaryPolicy.opportunityURL(url.trim())
        require(title.trim().isNotBlank() && company.trim().isNotBlank()) { "Add the role title and employer so the saved opportunity is clear." }
        require(country.isBlank() || country.trim().matches(Regex("[A-Za-z]{2}"))) { "Use a two-letter country code or leave it blank." }
        val job = Opportunity("local-" + UUID.randomUUID(), normalized, title.trim().take(200), company.trim().take(200), location.trim().take(200), country.trim().uppercase(), true)
        mutable.update { it.copy(jobs = listOf(job) + it.jobs) }
        try { persist() } catch (error: Exception) { mutable.update { it.copy(jobs = it.jobs.filterNot { pending -> pending.id == job.id }) }; throw error }
        mutable.update { it.copy(notice = "Opportunity saved on this phone.") }
        done()
        if (state.value.connection != null) syncInternal(job)
    }

    fun syncOpportunity(job: Opportunity) = action { syncInternal(job) }

    private suspend fun syncInternal(job: Opportunity) {
        val connection = state.value.connection ?: throw IllegalArgumentException("Connect your phone to sync this opportunity.")
        CareerApi(connection).request("POST", "jobs", job.inputJson())
        mutable.update { it.copy(jobs = it.jobs.filterNot { existing -> existing.id == job.id }, plan = null) }
        refreshInternal()
        mutable.update { it.copy(notice = "Opportunity saved to your workspace. No application was sent.") }
    }

    fun toggleJob(id: String) { mutable.update { it.copy(selected = if (id in it.selected) it.selected - id else it.selected + id, plan = null) } }
    fun invalidatePlan() { mutable.update { it.copy(plan = null) } }
    fun reviewRecovered(plan: ReviewPlan) {
        if (state.value.profileDirty) { mutable.update { it.copy(error = "Save or reload your profile before opening this saved review.") }; return }
        mutable.update { it.copy(plan = plan, notice = "Review the original details before approving any remaining application. Nothing was resumed automatically.") }
    }
    fun markAppliedElsewhere(id: String, applied: Boolean) = action {
        mutable.update { it.copy(manualApplied = if (applied) it.manualApplied + id else it.manualApplied - id, plan = null) }
        persist()
    }

    fun prepare(jobAnswers: Map<String, JobAnswers>) = action {
        val current = state.value
        val connection = current.connection ?: throw IllegalArgumentException("Pair this phone with your service to prepare an application.")
        require(!current.profileDirty) { "Save your profile first, so the review shows the exact saved details and PDF." }
        val ids = current.jobs.filter { !it.localOnly && it.id in current.selected }.map(Opportunity::id)
        require(ids.isNotEmpty()) { "Select at least one synced opportunity." }
        val answers = JSONObject()
        ids.forEach { answers.put(it, (jobAnswers[it] ?: JobAnswers()).json()) }
        val response = CareerApi(connection).request("POST", "prepare", JSONObject().put("jobIds", JSONArray(ids)).put("answers", answers).put("manualAppliedJobIds", JSONArray(current.manualApplied.filter { it in ids })))
        mutable.update { it.copy(plan = ReviewPlan.fromJson(response.getJSONObject("plan")), notice = "Review prepared. Nothing has been submitted.") }
    }

    fun submit(plan: ReviewPlan) = action {
        val current = state.value
        require(current.plan?.id == plan.id && current.plan.digest == plan.digest) { "Prepare a fresh review before applying." }
        require(!plan.expired() && !current.profileDirty && current.profile.revision == plan.profileRevision) { "This review has expired or your profile changed. Prepare it again." }
        require(plan.items.any(ReviewItem::canSubmitNow)) { "There are no applications ready to send. A rate-limited application must finish its cooldown first." }
        val connection = current.connection ?: throw IllegalArgumentException("Reconnect before applying.")
        val response = try {
            CareerApi(connection).request("POST", "submit", JSONObject().put("planId", plan.id).put("digest", plan.digest).put("approved", true))
        } catch (error: Exception) {
            mutable.update { it.copy(plan = null, activePlans = (it.activePlans + plan.id).distinct()) }
            throw error
        }
        mutable.update { it.copy(plan = null, activePlans = (it.activePlans + plan.id).distinct(),
            receipts = response.optJSONArray("attempts").objects().map(ApplicationReceipt::fromJson).ifEmpty { it.receipts },
            notice = "The service is processing your approved applications. Receipts show each actual outcome.") }
        persist()
        refreshInternal()
        startPolling()
    }

    fun stop(planId: String) {
        val connection = state.value.connection ?: return
        viewModelScope.launch {
            try {
                CareerApi(connection).request("POST", "stop", JSONObject().put("planId", planId))
                if (state.value.connection != connection) return@launch
                mutable.update { it.copy(plan = null, notice = "Stop requested. Jobs already dispatched still need a confirmed outcome.") }
                refreshInternal()
            } catch (cancel: CancellationException) { throw cancel }
            catch (error: Exception) { mutable.update { it.copy(error = message(error)) } }
        }
    }

    fun refresh() = action { refreshInternal() }

    private suspend fun refreshInternal(forceProfile: Boolean = false) {
        val connection = state.value.connection ?: return
        val response = CareerApi(connection).request("GET", "workspace")
        if (state.value.connection != connection) return
        val serverProfile = ProfileDraft.fromJson(response.getJSONObject("profile"))
        val serverJobs = response.optJSONArray("jobs").objects().map { Opportunity.fromJson(it) }
        mutable.update { it.copy(
            profile = if (it.profileDirty && !forceProfile) it.profile else serverProfile,
            profileDirty = it.profileDirty && !forceProfile,
            jobs = serverJobs + it.jobs.filter(Opportunity::localOnly),
            receipts = response.optJSONArray("attempts").objects().map(ApplicationReceipt::fromJson),
            activePlans = response.optJSONArray("activePlanIds").strings(),
            recoverablePlans = response.optJSONArray("recoverablePlans").objects().map(ReviewPlan::fromJson),
            liveEnabled = response.optJSONObject("capabilities")?.optBoolean("liveEnabled") ?: false,
            testService = response.safeString("mode") == "test",
            requiresPairing = false,
            plan = it.plan?.takeIf { plan -> plan.profileRevision == serverProfile.revision && !plan.expired() }
        ) }
        persist()
        startPolling()
    }

    fun setForeground(active: Boolean) {
        foreground = active
        if (!active) { polling?.cancel(); polling = null } else startPolling()
    }

    private fun startPolling() {
        if (!foreground || state.value.activePlans.isEmpty() || polling?.isActive == true) return
        polling = viewModelScope.launch {
            while (foreground && state.value.activePlans.isNotEmpty()) {
                delay(4_000)
                try { refreshInternal() }
                catch (cancel: CancellationException) { throw cancel }
                catch (_: Exception) {
                    mutable.update { it.copy(error = "The latest outcome is not available. Refresh receipts when connected; an interrupted request is not a failed application.") }
                    break
                }
            }
        }
    }

    fun exportReceipts(uri: Uri) = action {
        val connection = state.value.connection ?: throw IllegalArgumentException("Connect to export the current service receipts.")
        val data = CareerApi(connection).request("GET", "receipts").toString(2).toByteArray(Charsets.UTF_8)
        withContext(Dispatchers.IO) {
            getApplication<Application>().contentResolver.openOutputStream(uri, "w")?.use { it.write(data) }
                ?: throw IllegalArgumentException("The selected destination could not be opened.")
        }
        mutable.update { it.copy(notice = "Receipt export saved. It contains application evidence, not your PDF or connection token.") }
    }
}
