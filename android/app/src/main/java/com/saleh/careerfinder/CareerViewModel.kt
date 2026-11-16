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
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
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

class CareerViewModel internal constructor(application: Application, private val vault: PrivateStore,
    private val service: CareerService,
    discoveryService: DiscoveryService = PublicDiscoveryService,
    private val waitForPoll: suspend () -> Unit = { delay(4_000) }) : AndroidViewModel(application) {
    constructor(application: Application) : this(application, SecureVault(application), HttpsCareerService)
    private val mutable = MutableStateFlow(CareerUiState())
    val state = mutable.asStateFlow()
    val discovery = DiscoveryController(viewModelScope, discoveryService)
    private var polling: Job? = null
    private var foreground = false
    private val diskMutex = Mutex()
    private var draftSave: Job? = null
    private var refreshSequence = 0L
    private var acceptedRefresh = 0L
    private var profileSaveGeneration = 0L
    private val pollMutex = Mutex()
    private var foregroundGeneration = 0L
    private var lastAdvancedPlan: String? = null
    private class PrivateStorageFailure(val problem: StorageProblem, cause: Throwable) : Exception(cause)

    init {
        viewModelScope.launch {
            try { loadSavedWorkspace() }
            catch (error: Exception) { report(error) }
        }
    }

    private fun workspaceName(connection: Connection? = state.value.connection): String = connection?.let {
        "workspace-" + BoundaryPolicy.workspaceKey(it.origin, it.workspaceId)
    } ?: "workspace-unpaired"
    private fun searchName(connection: Connection?) = connection?.let { "search-" + BoundaryPolicy.workspaceKey(it.origin, it.workspaceId) } ?: "search-unpaired"

    private suspend fun readPrivate(name: String): JSONObject? = try {
        withContext(Dispatchers.IO) { vault.read(name) }
    } catch (cancel: CancellationException) { throw cancel }
    catch (error: Exception) { throw PrivateStorageFailure(StorageProblem(name, false), error) }

    private suspend fun writePrivate(name: String, value: JSONObject) = try {
        withContext(Dispatchers.IO) { vault.write(name, value) }
    } catch (cancel: CancellationException) { throw cancel }
    catch (error: Exception) { throw PrivateStorageFailure(StorageProblem(name, true), error) }

    private suspend fun savedWorkspace(connection: Connection?): CareerUiState {
        val name = workspaceName(connection)
        val stored = readPrivate(name)
        if (stored != null && stored.optInt("schema") != 1)
            throw PrivateStorageFailure(StorageProblem(name, false), IllegalArgumentException("A newer app is needed for this saved workspace."))
        val saved = stored ?: JSONObject()
        return try {
            val jobs = saved.optJSONArray("jobs").objects().map { job -> Opportunity.fromJson(job) }
            val legacyApplied = saved.optJSONArray("manualApplied").strings().toSet()
            require(!saved.has("applicationRecords") || saved.opt("applicationRecords") is JSONObject) { "The saved application records could not be read. Their file is preserved." }
            val records = ApplicationRecordsCodec.migrateLegacy(jobs, legacyApplied, ApplicationRecordsCodec.decode(saved.optJSONObject("applicationRecords")))
            CareerUiState(loaded = true, connection = connection,
            profile = saved.optJSONObject("profile")?.let(ProfileDraft::fromJson) ?: ProfileDraft(),
            profileDirty = saved.optBoolean("profileDirty"),
            opportunityDraft = if (saved.has("opportunityDraft")) OpportunityDraft.fromJson(saved.getJSONObject("opportunityDraft")) else OpportunityDraft(),
            jobs = jobs,
            receipts = saved.optJSONArray("receipts").objects().map(ApplicationReceipt::fromJson),
            activePlans = saved.optJSONArray("activePlans").strings(),
            selected = saved.optJSONArray("selected").strings().toSet(),
            manualApplied = ApplicationRecordsCodec.appliedIDs(jobs, records, legacyApplied),
            applicationRecords = records,
            obsoleteReviews = saved.optJSONArray("obsoleteReviews").strings().toSet(),
            continuationHolds = saved.optJSONArray("continuationHolds").strings().toSet(),
            serverProfile = saved.optJSONObject("serverProfile")?.let(ProfileDraft::fromJson),
            answers = saved.optJSONObject("answers")?.let { answers ->
                answers.keys().asSequence().mapNotNull { id -> answers.optJSONObject(id)?.let { id to JobAnswers.fromJson(it) } }.toMap()
            } ?: emptyMap()
        ) } catch (error: Exception) { throw PrivateStorageFailure(StorageProblem(name, false), error) }
    }

    private suspend fun loadSavedWorkspace() {
        val connection = readPrivate("connection")?.let {
            try { Connection.fromJson(it) }
            catch (error: Exception) { throw PrivateStorageFailure(StorageProblem("connection", false), error) }
        }
        val saved = savedWorkspace(connection)
        discovery.stopPrivateSession(flush = true)
        mutable.value = saved.copy(busy = true)
        discovery.attachPrivateSession(vault, searchName(connection))
        try { if (connection != null) refreshInternal() }
        finally { mutable.update { it.copy(busy = false) } }
    }

    private suspend fun persist(allowBlocked: Boolean = false) = diskMutex.withLock {
        check(allowBlocked || !state.value.storageBlocked) { "Private storage is unavailable; the original files are preserved." }
        val snapshot = state.value
        val envelope = JSONObject().put("schema", 1).put("profile", snapshot.profile.privateJson()).put("profileDirty", snapshot.profileDirty)
            .put("opportunityDraft", snapshot.opportunityDraft.privateJson())
            .put("applicationRecords", ApplicationRecordsCodec.encode(snapshot.applicationRecords))
            .put("jobs", JSONArray(snapshot.jobs.map(Opportunity::privateJson)))
            .put("activePlans", JSONArray(snapshot.activePlans))
            .put("manualApplied", JSONArray(snapshot.manualApplied.toList()))
            .put("selected", JSONArray(snapshot.selected.toList()))
            .put("obsoleteReviews", JSONArray(snapshot.obsoleteReviews.toList()))
            .put("continuationHolds", JSONArray(snapshot.continuationHolds.toList()))
            .put("serverProfile", snapshot.serverProfile?.privateJson() ?: JSONObject.NULL)
            .put("answers", JSONObject().apply { snapshot.answers.forEach { (id, value) -> put(id, value.json()) } })
            .put("receipts", JSONArray(snapshot.receipts.map {
                JSONObject().put("attemptId", it.id).put("title", it.title).put("employer", it.company).put("state", it.state)
                    .put("applicationId", it.applicationId).put("createdAt", it.date).put("error", it.error)
                    .put("evidenceMode", it.evidenceMode).put("resumeSHA256", it.resumeSHA256).put("provider", it.provider)
            }))
        val name = workspaceName(snapshot.connection)
        writePrivate(name, envelope)
    }

    private fun message(error: Throwable): String = when (error) {
        is ApiFailure -> if (error.status == 401) "This connection has expired. Pair this phone again to reconnect to your workspace." else error.message
        is IllegalArgumentException -> error.message ?: "Check the entered information."
        else -> "The request could not be completed. Your saved records remain available. For an application, refresh receipts before trying again."
    }

    private fun action(block: suspend () -> Unit) {
        if (!state.value.loaded || state.value.busy || state.value.storageBlocked) return
        mutable.update { it.copy(busy = true, error = null, notice = null) }
        viewModelScope.launch {
            try { block() }
            catch (cancel: CancellationException) { throw cancel }
            catch (error: Exception) { report(error) }
            finally { mutable.update { it.copy(busy = false) } }
        }
    }

    private fun report(error: Throwable) {
        if (error is CancellationException) throw error
        if (error is PrivateStorageFailure) {
            draftSave?.cancel()
            polling?.cancel()
            mutable.update { it.copy(loaded = true, storageBlocked = true, storageProblem = error.problem,
                error = "Private storage is unavailable. Your earlier encrypted files are preserved. Retry storage or choose a new local workspace.") }
        } else mutable.update { it.copy(loaded = true, error = message(error),
            requiresPairing = it.requiresPairing || error is ApiFailure && error.status == 401) }
    }

    private fun queuePrivateSave(immediate: Boolean = false) {
        draftSave?.cancel()
        draftSave = viewModelScope.launch {
            if (!immediate) delay(350)
            try { persist() }
            catch (cancel: CancellationException) { throw cancel }
            catch (error: Exception) { report(error) }
        }
    }

    private fun editReview(change: (CareerUiState) -> CareerUiState) {
        if (!state.value.loaded || state.value.storageBlocked || state.value.busy) return
        mutable.update { change(it).copy(plan = null, reviewingRecoveredPlan = false, reviewGeneration = it.reviewGeneration + 1,
            obsoleteReviews = it.obsoleteReviews + listOfNotNull(it.plan?.takeIf(ReviewPlan::unapproved)?.id)) }
        queuePrivateSave()
    }

    fun retryStorage() {
        if (state.value.busy || !state.value.storageBlocked) return
        mutable.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            try {
                val issue = state.value.storageProblem
                if (issue?.writing == true && issue.record == workspaceName()) {
                    persist(allowBlocked = true)
                    mutable.update { it.copy(storageBlocked = false, storageProblem = null,
                        notice = "Private saving is available again. Review your draft before sharing it.") }
                    startPolling()
                } else loadSavedWorkspace()
            } catch (error: Exception) { report(error) }
            finally { mutable.update { it.copy(busy = false) } }
        }
    }

    fun startFreshPrivateWorkspace() {
        if (state.value.busy || !state.value.storageBlocked) return
        mutable.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            try {
                draftSave?.cancel(); polling?.cancel()
                discovery.stopPrivateSession(flush = false)
                diskMutex.withLock { withContext(Dispatchers.IO) { vault.startFreshPreservingExisting() } }
                mutable.value = CareerUiState(loaded = true,
                    notice = "A new private workspace is ready. Earlier encrypted files and service records were preserved.")
                discovery.attachPrivateSession(vault, searchName(null))
            } catch (error: Exception) { report(PrivateStorageFailure(StorageProblem("connection", true), error)) }
            finally { mutable.update { it.copy(busy = false) } }
        }
    }

    fun dismissMessage() { mutable.update { it.copy(error = null, notice = null) } }

    fun pair(origin: String, code: String, done: () -> Unit) = action {
        draftSave?.cancel()
        persist()
        val connection = service.pair(origin, code)
        val saved = try {
            val restored = savedWorkspace(connection)
            writePrivate("connection", connection.toJson())
            restored
        } catch (error: Exception) {
            // The previous phone workspace remains selected if the new session cannot be stored.
            try { service.request(connection, "POST", "session/revoke", JSONObject()) } catch (_: Exception) { }
            throw error
        }
        polling?.cancel()
        discovery.stopPrivateSession(flush = true)
        mutable.value = saved.copy(busy = true, notice = "Phone paired. Review your saved phone draft in Profile to copy it deliberately.")
        discovery.attachPrivateSession(vault, searchName(connection))
        done()
        refreshInternal()
    }

    fun disconnect(expectedConnection: Connection? = state.value.connection) = action {
        require(state.value.connection == expectedConnection) { "The connection changed. Review the current phone connection before disconnecting." }
        draftSave?.cancel()
        persist()
        polling?.cancel()
        val connection = state.value.connection
        if (connection != null) {
            // Only remove the token after the server confirms revocation.
            try { service.request(connection, "POST", "session/revoke", JSONObject()) }
            catch (error: ApiFailure) { if (error.status != 401) throw error }
        }
        try { withContext(Dispatchers.IO) { vault.remove("connection") } }
        catch (error: Exception) { throw PrivateStorageFailure(StorageProblem("connection", true), error) }
        discovery.stopPrivateSession(flush = true)
        mutable.value = savedWorkspace(null).copy(busy = true)
        discovery.attachPrivateSession(vault, searchName(null))
        mutable.update { it.copy(notice = "Phone disconnected. Your separate offline draft is available.") }
    }

    fun removeConnectionLocally(expectedConnection: Connection? = state.value.connection) = action {
        require(state.value.connection == expectedConnection) { "The connection changed. Review the current phone connection before removing it." }
        draftSave?.cancel()
        persist()
        polling?.cancel()
        try { withContext(Dispatchers.IO) { vault.remove("connection") } }
        catch (error: Exception) { throw PrivateStorageFailure(StorageProblem("connection", true), error) }
        discovery.stopPrivateSession(flush = true)
        mutable.value = savedWorkspace(null).copy(busy = true,
            notice = "Connection removed from this phone. The remote session and any approved work were not revoked or stopped. Your saved workspace draft is preserved.")
        discovery.attachPrivateSession(vault, searchName(null))
    }

    fun editProfile(change: (ProfileDraft) -> ProfileDraft) = editReview { it.copy(profile = change(it.profile), profileDirty = true) }

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
            reviewGeneration = it.reviewGeneration + 1, reviewingRecoveredPlan = false,
            obsoleteReviews = it.obsoleteReviews + listOfNotNull(it.plan?.takeIf(ReviewPlan::unapproved)?.id)) }
        persist()
        mutable.update { it.copy(notice = "PDF kept in your private draft. Save the connected profile when you are ready to share it.") }
    }

    fun removePDF() { editProfile { it.copy(resume = null, removeResume = true) } }

    fun saveProfile() = action {
        draftSave?.cancel()
        val captured = state.value.profile
        // Keep even invalid or unsupported edits before validation or a service request.
        persist()
        if (captured.country.isNotBlank()) require(captured.country.trim().matches(Regex("[A-Za-z]{2}"))) { "Use a two-letter country code, such as SA or GB." }
        if (captured.website.isNotBlank()) BoundaryPolicy.opportunityURL(captured.website.trim())
        val linkedin = if (captured.linkedin.isEmpty()) "" else BoundaryPolicy.linkedinProfileURL(captured.linkedin)
        val connection = state.value.connection
        if (connection == null) {
            mutable.update { it.copy(profile = it.profile.copy(linkedin = linkedin), profileDirty = false) }
            try { persist() } catch (error: Exception) { mutable.update { it.copy(profile = captured, profileDirty = true) }; throw error }
            mutable.update { it.copy(notice = "Profile saved privately on this phone.") }
        } else {
            val supportsLinkedIn = state.value.linkedinProfile
            require(supportsLinkedIn || (linkedin.isEmpty() && state.value.serverProfile?.linkedin.isNullOrEmpty())) {
                "This service has not confirmed support for LinkedIn profile links. Your edits are kept on this phone. Refresh the connection or ask its operator to update the service."
            }
            val response = try {
                service.request(connection, "PUT", "profile", JSONObject().put("expectedRevision", captured.revision)
                    .put("profile", captured.apiJson(includeLinkedIn = supportsLinkedIn)))
            } catch (error: ApiFailure) {
                if (error.status == 409 && error.code == "stale_profile") {
                    refreshInternal()
                    mutable.update { it.copy(error = "A newer profile was saved elsewhere. Your edits are safe. Compare the versions below before choosing what to keep.") }
                    return@action
                }
                throw error
            }
            val saved = ProfileDraft.fromServer(response.getJSONObject("profile"))
            serviceData(saved.revision == captured.revision + 1)
            profileSaveGeneration++
            mutable.update {
                if (it.profile == captured) it.copy(profile = saved, serverProfile = saved, profileDirty = false, plan = null,
                    reviewingRecoveredPlan = false, reviewGeneration = it.reviewGeneration + 1, notice = "Profile saved to your connected workspace.")
                else it.copy(profile = it.profile.copy(revision = saved.revision), serverProfile = saved, profileDirty = true, plan = null,
                    notice = "The earlier profile was saved. Your newer edits are still a draft.")
            }
            persist()
        }
    }

    fun reloadProfile() = action {
        draftSave?.cancel()
        if (state.value.connection == null) mutable.value = savedWorkspace(null).copy(busy = true)
        else refreshInternal(forceProfile = true)
    }

    fun keepDraftWithLatestProfile(expectedRevision: Int) = action {
        val newer = state.value.profileConflict ?: throw IllegalArgumentException("Refresh to compare the latest saved profile.")
        require(newer.revision == expectedRevision) { "The saved profile changed again. Review the latest comparison before keeping your edits." }
        val draft = state.value.profile
        // An unchanged server PDF exists only as metadata on the phone. Rebase it to
        // the newer saved PDF explicitly; a newly picked local PDF keeps its bytes.
        val resume = if (draft.removeResume || draft.resume?.dataBase64 != null) draft.resume else newer.resume
        mutable.update { it.copy(profile = draft.copy(revision = newer.revision, resume = resume),
            profileDirty = true, plan = null, reviewingRecoveredPlan = false, reviewGeneration = it.reviewGeneration + 1,
            notice = "Your edited fields are kept as a private draft. Review the résumé, then save when ready.") }
        persist()
    }

    fun inspectPhoneDraft() = action {
        require(state.value.connection != null) { "Pair a workspace before copying a phone draft." }
        val phone = savedWorkspace(null)
        if (phone.profile == ProfileDraft() && phone.jobs.isEmpty() && phone.applicationRecords.isEmpty()) {
            mutable.update { it.copy(notice = "There is no saved phone draft to copy.") }
        } else mutable.update { it.copy(phoneImport = PhoneImport(phone.profile, phone.jobs, phone.manualApplied, phone.applicationRecords)) }
    }

    fun closePhoneImport() { mutable.update { it.copy(phoneImport = null) } }

    fun importPhoneDraft(includeProfile: Boolean, includeJobs: Boolean) = action {
        val current = state.value
        require(current.connection != null) { "Reconnect before copying this draft." }
        require(current.profileConflict == null) { "Resolve the profile conflict before copying a phone draft." }
        require(includeProfile || includeJobs) { "Choose what to copy." }
        val phone = current.phoneImport ?: throw IllegalArgumentException("Review the saved phone draft first.")
        val existing = current.jobs.map { BoundaryPolicy.jobIdentity(it.url) }.toMutableSet()
        val jobs = if (includeJobs) phone.jobs.filter { existing.add(BoundaryPolicy.jobIdentity(it.url)) }
            .map { source -> source to source.copy(id = "local-" + UUID.randomUUID(), localOnly = true) } else emptyList()
        val profile = if (includeProfile) phone.profile.copy(revision = current.profile.revision,
            removeResume = phone.profile.resume == null) else current.profile
        if (includeProfile && profile.resume != null) require(profile.resume.dataBase64 != null) { "Choose the PDF again before copying this profile." }
        val allJobs = jobs.map { pair -> pair.second } + current.jobs
        val records = current.applicationRecords.toMutableMap()
        if (includeJobs) for ((identity, incoming) in phone.applicationRecords) {
            // Removed bookmarks can still have meaningful notes/history. Copy those records
            // explicitly without inventing a new saved link in the destination workspace.
            val destination = allJobs.firstOrNull { BoundaryPolicy.jobIdentity(it.url) == identity }
                ?: records[identity]?.job ?: incoming.job.copy(localOnly = true)
            records[identity] = records[identity]?.merge(incoming, destination)
                ?: incoming.copy(job = destination, relatedURLs = (incoming.relatedURLs + destination.url).distinct())
        }
        requireApplicationStatusChangesAllowed(current, records)
        val legacyApplied = current.manualApplied + jobs.filter { pair -> pair.first.id in phone.manualApplied }.map { pair -> pair.second.id }
        mutable.update { it.copy(profile = profile, profileDirty = includeProfile || it.profileDirty,
            jobs = allJobs, applicationRecords = records,
            manualApplied = ApplicationRecordsCodec.appliedIDs(allJobs, records, legacyApplied),
            phoneImport = null, plan = null, reviewingRecoveredPlan = false, reviewGeneration = it.reviewGeneration + 1) }
        persist()
        mutable.update { it.copy(notice = if (records.values.any { record -> record.needsReview })
            "Copied on this phone. Review the saved record versions in Saved; all were kept."
            else "Copied into a private workspace draft. Save the profile and sync each opportunity when ready. Nothing was sent to employers.") }
    }

    private fun recordsChanged(current: CareerUiState, records: Map<String, ApplicationRecordBundle>) = current.copy(
        applicationRecords = records,
        manualApplied = ApplicationRecordsCodec.appliedIDs(current.jobs, records, current.manualApplied),
        plan = null, reviewingRecoveredPlan = false, reviewGeneration = current.reviewGeneration + 1,
        obsoleteReviews = current.obsoleteReviews + listOfNotNull(current.plan?.takeIf(ReviewPlan::unapproved)?.id))

    private val activeApplicationStatusMessage = "Stop active Auto Apply work and refresh receipts before changing whether this job is marked as applied. Your note and date edits are kept."
    private val alreadyAppliedReviewMessage = "This review includes a job marked as applied on this phone. Stop the earlier review and prepare a new one, or explicitly correct your private record first."

    private fun trackedApplied(current: CareerUiState, identity: String): Boolean = current.applicationRecords[identity]?.appliedElsewhere
        ?: current.jobs.any { it.id in current.manualApplied && BoundaryPolicy.jobIdentity(it.url) == identity }

    private fun requireApplicationStatusChangesAllowed(current: CareerUiState, records: Map<String, ApplicationRecordBundle>) {
        val identities = current.applicationRecords.keys + records.keys
        val changed = identities.filterTo(mutableSetOf()) { trackedApplied(current, it) != (records[it]?.appliedElsewhere == true) }
        requireApplicationStatusChangesAllowed(current, changed, records)
    }

    /** A local mark cannot cancel a provider request. A confirmed Stop must come first. */
    private fun requireApplicationStatusChangesAllowed(current: CareerUiState, changed: Set<String>,
        records: Map<String, ApplicationRecordBundle> = current.applicationRecords) {
        if (changed.isEmpty() || current.activePlans.isEmpty()) return
        val known = (current.recoverablePlans + listOfNotNull(current.plan)).distinctBy(ReviewPlan::id).associateBy(ReviewPlan::id)
        require(current.activePlans.all { it in known }) { activeApplicationStatusMessage }
        val knownJobs = (current.jobs + current.applicationRecords.values.map { it.job } + records.values.map { it.job }).map { it.id }.toSet()
        require(current.activePlans.all { id -> known.getValue(id).items.let { items -> items.isNotEmpty() && items.all { item ->
            item.jobId in knownJobs || runCatching { BoundaryPolicy.jobIdentity(item.url) }.isSuccess
        } } }) { activeApplicationStatusMessage }
        val related = (current.applicationRecords.values + records.values).filter { it.identity in changed }
        val identities = changed + related.flatMap { record -> record.relatedURLs.map { BoundaryPolicy.jobIdentity(it) } }
        val jobIDs = (current.jobs + related.map { it.job }).filter { BoundaryPolicy.jobIdentity(it.url) in identities }.map { it.id }.toSet()
        require(current.activePlans.none { id -> known.getValue(id).items.any { item ->
            item.jobId in jobIDs || runCatching { BoundaryPolicy.jobIdentity(item.url) in identities }.getOrDefault(false)
        } }) { activeApplicationStatusMessage }
    }

    private fun reviewIncludesTrackedApplication(current: CareerUiState, plan: ReviewPlan): Boolean {
        val applied = current.applicationRecords.values.filter(ApplicationRecordBundle::appliedElsewhere)
        val identities = applied.flatMap { it.relatedURLs + it.job.url }.map { BoundaryPolicy.jobIdentity(it) }.toSet() +
            current.jobs.filter { it.id in current.manualApplied }.map { BoundaryPolicy.jobIdentity(it.url) }
        val ids = current.manualApplied + current.jobs.filter { BoundaryPolicy.jobIdentity(it.url) in identities }.map { it.id } + applied.map { it.job.id }
        return plan.items.filter { it.state in setOf("ready", "rate_limited") }.any { item ->
            item.jobId in ids || runCatching { BoundaryPolicy.jobIdentity(item.url) in identities }.getOrDefault(false)
        }
    }

    private fun reviewTargetsKnown(current: CareerUiState, plan: ReviewPlan): Boolean {
        val knownIDs = (current.jobs + current.applicationRecords.values.map { it.job }).map { it.id }.toSet()
        return plan.items.isNotEmpty() && plan.items.all { item ->
            item.jobId in knownIDs || runCatching { BoundaryPolicy.jobIdentity(item.url) }.isSuccess
        }
    }

    private suspend fun persistRecordChange(records: Map<String, ApplicationRecordBundle>, editor: ApplicationRecordEditorState?) {
        val before = state.value
        requireApplicationStatusChangesAllowed(before, records)
        draftSave?.cancel()
        mutable.update { recordsChanged(it, records).copy(applicationRecordEditor = editor) }
        try { persist() }
        catch (error: Exception) {
            if (state.value.privateScope == before.privateScope) mutable.update { it.copy(applicationRecords = before.applicationRecords,
                manualApplied = before.manualApplied, applicationRecordEditor = before.applicationRecordEditor) }
            throw error
        }
    }

    fun openApplicationRecord(job: Opportunity, expectedScope: String = state.value.privateScope) {
        val current = state.value
        if (!current.loaded || current.busy || current.storageBlocked || current.privateScope != expectedScope) return
        val identity = BoundaryPolicy.jobIdentity(job.url)
        val record = current.applicationRecords[identity]
        if (current.jobs.none { it.id == job.id && BoundaryPolicy.jobIdentity(it.url) == identity } && record == null) return
        mutable.update { it.copy(error = null, applicationRecordEditor = ApplicationRecordEditorState(scope = expectedScope,
            identity = identity, job = job, expectedRevision = record?.revision ?: 0, draft = record?.activeDraft ?: ApplicationRecordDraft())) }
    }

    fun editApplicationRecordDraft(change: (ApplicationRecordDraft) -> ApplicationRecordDraft, expectedToken: String? = null) {
        if (state.value.busy || state.value.storageBlocked) return
        if (expectedToken != null && state.value.applicationRecordEditor?.token != expectedToken) return
        mutable.update { it.copy(applicationRecordEditor = it.applicationRecordEditor?.let { editor ->
            editor.copy(draft = change(editor.draft), pendingNotApplied = null)
        }) }
    }

    fun closeApplicationRecord(expectedToken: String? = null) {
        if (!state.value.busy && (expectedToken == null || state.value.applicationRecordEditor?.token == expectedToken)) mutable.update { it.copy(applicationRecordEditor = null) }
    }

    private fun checkedRecordEditor(expectedToken: String? = null): Pair<ApplicationRecordEditorState, ApplicationRecordBundle?> {
        val editor = state.value.applicationRecordEditor ?: throw IllegalArgumentException("Reopen the application record before saving.")
        require(editor.scope == state.value.privateScope && (expectedToken == null || editor.token == expectedToken)) {
            "The workspace changed. Reopen the correct application record before saving."
        }
        val record = state.value.applicationRecords[editor.identity]
        require((record?.revision ?: 0) == editor.expectedRevision) { "This application record changed. Close this editor and review the saved version before saving." }
        require(record != null || state.value.jobs.any { it.id == editor.job.id && BoundaryPolicy.jobIdentity(it.url) == editor.identity }) {
            "This saved link changed. Close this editor and reopen its record."
        }
        return editor to record
    }

    fun saveApplicationRecord(confirmedNotApplied: Boolean = false, expectedToken: String? = null) = action {
        val (editor, existing) = checkedRecordEditor(expectedToken)
        val draft = editor.draft.validated()
        require(existing?.needsReview != true) { "Choose which saved version to use before editing this record." }
        val wasApplied = trackedApplied(state.value, editor.identity)
        val willBeApplied = when (draft.stage) { ApplicationStage.SAVED -> false; ApplicationStage.CLOSED -> wasApplied; else -> true }
        if (wasApplied != willBeApplied) requireApplicationStatusChangesAllowed(state.value, setOf(editor.identity))
        val clearing = draft.stage == ApplicationStage.SAVED && existing?.appliedElsewhere == true
        if (clearing && !confirmedNotApplied) {
            mutable.update { it.copy(applicationRecordEditor = editor.copy(pendingNotApplied = draft)) }
            return@action
        }
        if (confirmedNotApplied) require(expectedToken != null && editor.pendingNotApplied == draft && clearing) {
            "The correction changed. Review the application record and confirm again."
        }
        val base = existing ?: ApplicationRecordBundle.create(editor.job).copy(revision = 0)
        val updated = base.edited(draft, confirmedNotApplied)
        persistRecordChange(state.value.applicationRecords + (editor.identity to updated), null)
        mutable.update { it.copy(notice = "Record saved on this phone.") }
    }

    fun keepApplicationRecord(expectedToken: String? = null) {
        if (state.value.busy) return
        if (expectedToken != null && state.value.applicationRecordEditor?.token != expectedToken) return
        mutable.update { state ->
            val editor = state.applicationRecordEditor ?: return@update state
            if (editor.quickCorrection) state.copy(applicationRecordEditor = null)
            else state.copy(applicationRecordEditor = editor.copy(pendingNotApplied = null,
                draft = editor.draft.copy(stage = state.applicationRecords[editor.identity]?.displayStage ?: editor.draft.stage)))
        }
    }

    fun chooseApplicationRecordVersion(versionID: String, expectedToken: String) = action {
        val (editor, existing) = checkedRecordEditor(expectedToken)
        val record = existing ?: throw IllegalArgumentException("This saved record is no longer available.")
        val updated = record.choose(versionID)
        persistRecordChange(state.value.applicationRecords + (editor.identity to updated),
            editor.copy(expectedRevision = updated.revision, draft = updated.activeDraft, pendingNotApplied = null))
        mutable.update { it.copy(notice = "Selected details kept on this phone. Other versions remain in record history.") }
    }

    fun restoreRecordedOpportunity(identity: String, expectedScope: String) = action {
        require(state.value.privateScope == expectedScope) { "The workspace changed. Open the correct application record again." }
        val job = state.value.applicationRecords[identity]?.job ?: throw IllegalArgumentException("That application record is no longer available.")
        addOpportunityInternal(job.url, job.title, job.company, job.location, job.country, null) {}
    }

    fun editOpportunityDraft(change: (OpportunityDraft) -> OpportunityDraft) {
        if (!state.value.loaded || state.value.storageBlocked || state.value.busy) return
        mutable.update { it.copy(opportunityDraft = change(it.opportunityDraft)) }
        queuePrivateSave()
    }

    fun keepOpportunityDraft(done: () -> Unit) = action {
        draftSave?.cancel()
        persist()
        mutable.update { it.copy(notice = "Unfinished opportunity kept on this phone.") }
        done()
    }

    fun discardOpportunityDraft(done: () -> Unit) = action {
        draftSave?.cancel()
        val previous = state.value.opportunityDraft
        mutable.update { it.copy(opportunityDraft = OpportunityDraft()) }
        try { persist() }
        catch (error: Exception) {
            mutable.update { it.copy(opportunityDraft = previous) }
            throw error
        }
        mutable.update { it.copy(notice = "Unfinished opportunity discarded. Saved opportunities are unchanged.") }
        done()
    }

    fun saveOpportunityDraft(done: () -> Unit) = action {
        val draft = state.value.opportunityDraft
        addOpportunityInternal(draft.url, draft.title, draft.company, draft.location, draft.country, draft, done)
    }

    fun addOpportunity(url: String, title: String, company: String, location: String, country: String, done: () -> Unit) = action {
        addOpportunityInternal(url, title, company, location, country, null, done)
    }

    private suspend fun addOpportunityInternal(url: String, title: String, company: String, location: String, country: String,
        completingDraft: OpportunityDraft?, done: () -> Unit) {
        val normalized = BoundaryPolicy.opportunityURL(url.trim())
        require(title.trim().isNotBlank() && company.trim().isNotBlank()) { "Add the role title and employer so the saved opportunity is clear." }
        require(country.isBlank() || country.trim().matches(Regex("[A-Za-z]{2}"))) { "Use a two-letter country code or leave it blank." }
        if (state.value.jobs.any { BoundaryPolicy.jobIdentity(it.url) == BoundaryPolicy.jobIdentity(normalized) }) {
            mutable.update { it.copy(notice = if (completingDraft == null) "This opportunity is already in your saved list."
                else "This link is already saved. Your unfinished draft is kept so you can review its details or change the link.") }
            if (completingDraft != null) { draftSave?.cancel(); persist() }
            done()
            return
        }
        val job = Opportunity("local-" + UUID.randomUUID(), normalized, title.trim().take(200), company.trim().take(200), location.trim().take(200), country.trim().uppercase(), true)
        draftSave?.cancel()
        val previousDraft = state.value.opportunityDraft
        // Only completing this editor may consume its draft. Saving a discovery result or
        // a failed remote sync must not overwrite an unrelated unfinished opportunity.
        mutable.update { it.copy(jobs = listOf(job) + it.jobs,
            manualApplied = ApplicationRecordsCodec.appliedIDs(listOf(job) + it.jobs, it.applicationRecords, it.manualApplied),
            opportunityDraft = if (completingDraft != null && it.opportunityDraft == completingDraft) OpportunityDraft() else it.opportunityDraft) }
        try { persist() }
        catch (error: Exception) {
            mutable.update { it.copy(jobs = it.jobs.filterNot { pending -> pending.id == job.id }, opportunityDraft = previousDraft) }
            throw error
        }
        mutable.update { it.copy(notice = "Opportunity saved on this phone.") }
        done()
        if (state.value.connection != null) syncInternal(job)
    }

    fun removeLocalOpportunity(id: String, done: () -> Unit = {}) = action {
        val previous = state.value
        require(previous.jobs.firstOrNull { it.id == id }?.localOnly == true) {
            "Only a link saved on this phone can be removed here. Connected records are preserved."
        }
        require((previous.recoverablePlans + listOfNotNull(previous.plan)).none { plan -> plan.items.any { it.jobId == id } }) {
            "This opportunity is linked to an application review. Its saved record and application activity are preserved."
        }
        draftSave?.cancel()
        mutable.update { it.copy(jobs = it.jobs.filterNot { job -> job.id == id }, selected = it.selected - id,
            answers = it.answers - id, manualApplied = it.manualApplied - id, reviewGeneration = it.reviewGeneration + 1) }
        try { persist() }
        catch (error: Exception) {
            mutable.update { it.copy(jobs = previous.jobs, selected = previous.selected, answers = previous.answers,
                manualApplied = previous.manualApplied, reviewGeneration = previous.reviewGeneration) }
            throw error
        }
        mutable.update { it.copy(notice = "Saved link removed. Your private application record, connected records and receipts are kept.") }
        done()
    }

    fun syncOpportunity(job: Opportunity) = action { syncInternal(job) }

    private suspend fun syncInternal(job: Opportunity) {
        val connection = state.value.connection ?: throw IllegalArgumentException("Connect your phone to sync this opportunity.")
        val sourceIdentity = BoundaryPolicy.jobIdentity(job.url)
        if (job.localOnly && state.value.applicationRecords[sourceIdentity]?.appliedElsewhere == true)
            requireApplicationStatusChangesAllowed(state.value, setOf(sourceIdentity))
        val response = service.request(connection, "POST", "jobs", job.inputJson())
        val synced = Opportunity.fromServer(response.getJSONObject("job"))
        require(synced.id.isNotBlank()) { "The service did not return the saved opportunity identity." }
        val destinationIdentity = BoundaryPolicy.jobIdentity(synced.url)
        val records = state.value.applicationRecords.toMutableMap()
        records[sourceIdentity]?.let { source ->
            records[destinationIdentity] = if (sourceIdentity != destinationIdentity && records[destinationIdentity] != null)
                records.getValue(destinationIdentity).merge(source, synced)
            else source.copy(job = synced, relatedURLs = (source.relatedURLs + synced.url).distinct())
            if (sourceIdentity != destinationIdentity) records.remove(sourceIdentity)
        }
        requireApplicationStatusChangesAllowed(state.value, records)
        mutable.update { it.copy(jobs = listOf(synced) + it.jobs.filterNot { existing -> existing.id == job.id || existing.id == synced.id },
            applicationRecords = records,
            manualApplied = ApplicationRecordsCodec.appliedIDs(listOf(synced) + it.jobs.filterNot { existing -> existing.id == job.id || existing.id == synced.id },
                records, (it.manualApplied - job.id).let { ids -> if (job.id in it.manualApplied) ids + synced.id else ids }),
            selected = (it.selected - job.id).let { ids -> if (job.id in it.selected) ids + synced.id else ids },
            answers = (it.answers - job.id).let { answers -> it.answers[job.id]?.let { value -> answers + (synced.id to value) } ?: answers },
            plan = null, reviewingRecoveredPlan = false, reviewGeneration = it.reviewGeneration + 1) }
        persist()
        refreshInternal()
        mutable.update { it.copy(notice = "Opportunity saved to your workspace. No application was sent.") }
    }

    fun toggleJob(id: String) = editReview { it.copy(selected = if (id in it.selected) it.selected - id else it.selected + id) }
    fun editAnswers(id: String, change: (JobAnswers) -> JobAnswers) = editReview {
        it.copy(answers = it.answers + (id to change(it.answers[id] ?: JobAnswers())))
    }
    fun invalidatePlan() = editReview { it }
    private fun linkedReviewMatchesProfile(plan: ReviewPlan, profile: ProfileDraft): Boolean = profile.linkedin.isEmpty() ||
        plan.items.filter { it.state in setOf("ready", "rate_limited") }.all { it.payload.safeString("linkedin") == profile.linkedin }
    private val mismatchedLinkedInReview = "The review does not show your saved LinkedIn profile correctly. Refresh and prepare a new review before approving."
    fun reviewRecovered(plan: ReviewPlan) {
        if (state.value.busy || state.value.storageBlocked || state.value.requiresPairing) return
        if (plan.unapproved && plan.id in state.value.obsoleteReviews) {
            mutable.update { it.copy(error = "This earlier review was changed. Prepare the updated choices instead.") }; return
        }
        if (state.value.profileDirty) { mutable.update { it.copy(error = "Save or reload your profile before opening this saved review.") }; return }
        if (plan.expired() || plan.profileRevision != state.value.profile.revision) {
            mutable.update { it.copy(error = "This review is out of date. Refresh the workspace before continuing.") }; return
        }
        if (!linkedReviewMatchesProfile(plan, state.value.profile)) {
            mutable.update { it.copy(plan = null, error = mismatchedLinkedInReview) }; return
        }
        if (reviewIncludesTrackedApplication(state.value, plan)) {
            mutable.update { it.copy(plan = null, error = alreadyAppliedReviewMessage) }; return
        }
        mutable.update { it.copy(plan = plan, reviewingRecoveredPlan = true,
            notice = "Review the original details before approving any remaining application. Nothing was resumed automatically.") }
    }
    fun markAppliedElsewhere(id: String, applied: Boolean) = action {
        val current = state.value
        val job = current.jobs.firstOrNull { it.id == id } ?: throw IllegalArgumentException("This saved opportunity changed. Reopen its record.")
        val identity = BoundaryPolicy.jobIdentity(job.url)
        val existing = current.applicationRecords[identity]
        if (!applied && (existing?.appliedElsewhere == true || id in current.manualApplied)) {
            requireApplicationStatusChangesAllowed(current, setOf(identity))
            val draft = (existing?.activeDraft ?: ApplicationRecordDraft()).copy(stage = ApplicationStage.SAVED)
            mutable.update { it.copy(applicationRecordEditor = ApplicationRecordEditorState(scope = current.privateScope, identity = identity,
                job = job, expectedRevision = existing?.revision ?: 0, draft = draft, pendingNotApplied = draft, quickCorrection = true)) }
            return@action
        }
        val base = existing ?: ApplicationRecordBundle.create(job).copy(revision = 0)
        val updated = base.edited(base.activeDraft.copy(stage = if (applied) ApplicationStage.APPLIED else ApplicationStage.SAVED), false)
        persistRecordChange(current.applicationRecords + (identity to updated), null)
    }

    fun prepare() = action {
        val current = state.value
        val connection = current.connection ?: throw IllegalArgumentException("Pair this phone with your service to prepare an application.")
        require(!current.profileDirty) { "Save your profile first, so the review shows the exact saved details and PDF." }
        require(current.profile.linkedin.isEmpty() || current.linkedinProfile) { "Refresh the service connection before preparing an application with a LinkedIn profile link." }
        val ids = current.jobs.filter { !it.localOnly && it.id in current.selected }.map(Opportunity::id)
        require(ids.isNotEmpty()) { "Select at least one synced opportunity." }
        require(ids.size <= 20) { "Review up to 20 opportunities in one batch." }
        val answers = JSONObject()
        ids.forEach { answers.put(it, (current.answers[it] ?: JobAnswers()).json()) }
        persist()
        val obsolete = current.obsoleteReviews + listOfNotNull(current.plan?.takeIf(ReviewPlan::unapproved)?.id)
        // The button explicitly says that the earlier unapproved review will stop.
        // The service checks approval and dispatch atomically; a second phone cannot
        // turn this into an automatic stop of an approved/cooldown application.
        for (id in obsolete) {
            try { service.request(connection, "POST", "stop", JSONObject().put("planId", id).put("onlyIfUnapproved", true)) }
            catch (error: ApiFailure) {
                if (error.code == "review_already_approved") {
                    refreshInternal()
                    mutable.update { it.copy(plan = null, obsoleteReviews = it.obsoleteReviews - id,
                        error = "An earlier review was approved elsewhere. Review its original outcome before starting another batch.") }
                    persist()
                    return@action
                }
                if (error.status != 404) throw error
            }
            mutable.update { it.copy(obsoleteReviews = it.obsoleteReviews - id) }
        }
        persist()
        val request = JSONObject().put("jobIds", JSONArray(ids)).put("answers", answers)
            .put("manualAppliedJobIds", JSONArray(current.manualApplied.filter { it in ids }))
            .apply { if (current.profile.linkedin.isNotEmpty()) put("reviewSchema", 3) }
        val response = service.request(connection, "POST", "prepare", request)
        val prepared = ReviewPlan.fromJson(response.getJSONObject("plan"))
        val latest = state.value
        if (latest.connection != connection || latest.reviewGeneration != current.reviewGeneration ||
            latest.profile != current.profile || latest.profileDirty || latest.selected != current.selected) {
            if (latest.connection == connection) {
                mutable.update { it.copy(plan = null, obsoleteReviews = it.obsoleteReviews + listOfNotNull(prepared.takeIf(ReviewPlan::unapproved)?.id),
                    notice = "Your details changed while preparing. Prepare a new review before applying.") }
                persist()
            }
            return@action
        }
        require(linkedReviewMatchesProfile(prepared, current.profile)) { mismatchedLinkedInReview }
        if (reviewIncludesTrackedApplication(current, prepared)) {
            mutable.update { it.copy(plan = null, obsoleteReviews = it.obsoleteReviews + listOfNotNull(prepared.takeIf(ReviewPlan::unapproved)?.id)) }
            throw IllegalArgumentException(alreadyAppliedReviewMessage)
        }
        mutable.update { it.copy(plan = prepared, reviewingRecoveredPlan = false,
            recoverablePlans = it.recoverablePlans.filterNot { previous -> previous.id in obsolete },
            notice = "Review prepared. Nothing has been submitted.") }
    }

    fun submit(plan: ReviewPlan) = action {
        val current = state.value
        require(current.liveEnabled || current.testService) { "Automatic employer sending is not enabled for this service. You can still apply directly on the employer’s site." }
        require(current.plan?.id == plan.id && current.plan.digest == plan.digest) { "Prepare a fresh review before applying." }
        require(!plan.expired() && !current.profileDirty && current.profile.revision == plan.profileRevision) { "This review has expired or your profile changed. Prepare it again." }
        require(linkedReviewMatchesProfile(plan, current.profile)) { mismatchedLinkedInReview }
        require(!reviewIncludesTrackedApplication(current, plan)) { alreadyAppliedReviewMessage }
        require(plan.items.any(ReviewItem::canSubmitNow)) { "There are no applications ready to send. A rate-limited application must finish its cooldown first." }
        val connection = current.connection ?: throw IllegalArgumentException("Reconnect before applying.")
        // Only a new visible approval can supersede this phone's earlier stop intent.
        // Do this before the request so a simultaneous Stop always wins locally.
        mutable.update { it.copy(continuationHolds = it.continuationHolds - plan.id) }
        persist()
        val incoming = try {
            service.request(connection, "POST", "submit", JSONObject().put("planId", plan.id).put("digest", plan.digest).put("approved", true)
                .apply { if (plan.items.any { it.payload.safeString("linkedin").isNotEmpty() }) put("reviewSchema", 3) })
                .requiredObjects("attempts").map(ApplicationReceipt::fromServer)
        } catch (error: Exception) {
            mutable.update { it.copy(plan = null, activePlans = (it.activePlans + plan.id).distinct()) }
            persist()
            startPolling()
            throw error
        }
        mutable.update { it.copy(plan = null, activePlans = (it.activePlans + plan.id).distinct(),
            receipts = (incoming + it.receipts).distinctBy(ApplicationReceipt::id),
            notice = "The service is processing your approved applications. Receipts show each actual outcome.") }
        persist()
        refreshInternal()
        startPolling()
    }

    fun stop(planId: String) {
        val connection = state.value.connection ?: return
        if (!state.value.loaded || state.value.storageBlocked || state.value.requiresPairing) return
        // Preserve the stop intent even when the response is lost or the phone restarts.
        // An already dispatched request can still finish; it is never resent here.
        mutable.update { it.copy(continuationHolds = it.continuationHolds + planId) }
        viewModelScope.launch {
            try {
                persist()
                if (state.value.connection != connection) return@launch
                service.request(connection, "POST", "stop", JSONObject().put("planId", planId))
                if (state.value.connection != connection) return@launch
                mutable.update { it.copy(plan = null, obsoleteReviews = it.obsoleteReviews - planId,
                    notice = "Stop requested. Jobs already dispatched still need a confirmed outcome.") }
                refreshInternal()
            } catch (cancel: CancellationException) { throw cancel }
            catch (error: Exception) { if (state.value.connection == connection) report(error) }
        }
    }

    fun refresh() = action { refreshInternal() }

    private suspend fun refreshInternal(forceProfile: Boolean = false): Boolean {
        val connection = state.value.connection ?: return false
        val sequence = ++refreshSequence
        val saveGeneration = profileSaveGeneration
        val response = try { service.request(connection, "GET", "workspace") }
        catch (cancel: CancellationException) { throw cancel }
        catch (error: Exception) {
            if (state.value.connection != connection || sequence < acceptedRefresh || saveGeneration != profileSaveGeneration) return false
            throw error
        }
        currentCoroutineContext().ensureActive()
        if (state.value.connection != connection || sequence < acceptedRefresh || saveGeneration != profileSaveGeneration) return false
        serviceData(response.opt("workspaceId") == connection.workspaceId)
        val serverProfile = ProfileDraft.fromServer(response.getJSONObject("profile"))
        if (serverProfile.revision < (state.value.serverProfile?.revision ?: 0)) return false
        val serverJobs = response.requiredObjects("jobs").map(Opportunity::fromServer)
        val receipts = response.requiredObjects("attempts").map(ApplicationReceipt::fromServer)
        val activePlans = response.requiredStrings("activePlanIds")
        val recovered = response.requiredObjects("recoverablePlans").map(ReviewPlan::fromJson)
        serviceData(serverJobs.map(Opportunity::id).distinct().size == serverJobs.size &&
            receipts.map(ApplicationReceipt::id).distinct().size == receipts.size)
        val capabilities = response.optJSONObject("capabilities")
        serviceData(capabilities?.opt("liveEnabled") is Boolean && response.opt("mode") in setOf("test", "local"))
        serviceData(!capabilities!!.has("linkedinProfile") || capabilities.opt("linkedinProfile") is Boolean)
        acceptedRefresh = sequence
        val nextJobs = serverJobs + state.value.jobs.filter(Opportunity::localOnly)
        mutable.update { it.copy(
            profile = if (it.profileDirty && !forceProfile) it.profile else serverProfile,
            serverProfile = serverProfile,
            profileDirty = it.profileDirty && !forceProfile,
            jobs = nextJobs,
            manualApplied = ApplicationRecordsCodec.appliedIDs(nextJobs, it.applicationRecords, it.manualApplied),
            receipts = receipts,
            activePlans = activePlans,
            recoverablePlans = recovered,
            liveEnabled = capabilities!!.getBoolean("liveEnabled"),
            clientContinuation = capabilities.opt("dispatchContinuation") == "client",
            linkedinProfile = capabilities.opt("linkedinProfile") == true,
            testService = response.safeString("mode") == "test",
            requiresPairing = false,
            notice = if (activePlans.isEmpty() && it.notice == "The service is processing your approved applications. Receipts show each actual outcome.")
                "Latest application outcomes are available in Receipts." else it.notice,
            selected = it.selected.intersect(serverJobs.map(Opportunity::id).toSet()),
            plan = it.plan?.takeIf { plan -> plan.profileRevision == serverProfile.revision && !plan.expired() }
        ) }
        persist()
        startPolling()
        return true
    }

    fun setForeground(active: Boolean) {
        if (foreground != active) foregroundGeneration++
        foreground = active
        if (!active) {
            polling?.cancel(); polling = null
            discovery.saveSearchBeforeBackground()
            if (state.value.loaded && !state.value.busy && !state.value.storageBlocked && draftSave?.isActive == true)
                queuePrivateSave(immediate = true)
        } else startPolling()
    }

    private fun canPoll(connection: Connection?, generation: Long): Boolean = foreground &&
        foregroundGeneration == generation && connection != null && state.value.connection == connection &&
        state.value.loaded && !state.value.busy && !state.value.storageBlocked && !state.value.requiresPairing

    private suspend fun pollApprovedWork(connection: Connection, generation: Long) = pollMutex.withLock {
        if (!canPoll(connection, generation)) return@withLock
        // Cached active IDs and a GET by itself never initiate an application. Only
        // this foreground continuation cycle may act on fresh server eligibility.
        if (!refreshInternal() || !canPoll(connection, generation)) return@withLock
        currentCoroutineContext().ensureActive()
        val current = state.value
        if (!current.clientContinuation) return@withLock
        val knownPlans = (current.recoverablePlans + listOfNotNull(current.plan)).distinctBy(ReviewPlan::id).associateBy(ReviewPlan::id)
        val hasTrackedApplications = current.manualApplied.isNotEmpty() || current.applicationRecords.values.any(ApplicationRecordBundle::appliedElsewhere)
        val eligible = current.activePlans.filterNot { id ->
            if (id in current.continuationHolds) true
            else if (hasTrackedApplications && (knownPlans[id]?.let { !reviewTargetsKnown(current, it) || reviewIncludesTrackedApplication(current, it) } != false)) {
                mutable.update { it.copy(error = "Auto Apply is paused on this phone because an application record needs review. Stop active work and refresh receipts. This does not stop the service or another phone.") }
                true
            } else false
        }
        if (eligible.isEmpty()) return@withLock
        val next = ((lastAdvancedPlan?.let(eligible::indexOf) ?: -1) + 1) % eligible.size
        val planId = eligible[next]
        lastAdvancedPlan = planId
        try {
            // The server rechecks approval, stop state, duplicates and cooldown
            // atomically. This route cannot approve or restart an uncertain attempt.
            service.request(connection, "POST", "advance", JSONObject().put("planId", planId))
        } catch (cancel: CancellationException) { throw cancel }
        catch (error: Exception) {
            if (!canPoll(connection, generation)) return@withLock
            if (error is ApiFailure && error.status in setOf(404, 409)) {
                refreshInternal()
                return@withLock
            }
            throw error
        }
        currentCoroutineContext().ensureActive()
        // Never adopt an advance response into another workspace. A subsequent
        // read is authoritative, including after a provider timeout or rate limit.
        if (canPoll(connection, generation)) refreshInternal()
    }

    internal suspend fun pollOnce(): Boolean {
        currentCoroutineContext().ensureActive()
        val connection = state.value.connection ?: return false
        val generation = foregroundGeneration
        return try {
            pollApprovedWork(connection, generation)
            state.value.connection == connection && foregroundGeneration == generation &&
                !state.value.requiresPairing && !state.value.storageBlocked
        } catch (cancel: CancellationException) { throw cancel }
        catch (error: Exception) {
            if (state.value.connection == connection && foregroundGeneration == generation) {
                if (error is PrivateStorageFailure || error is ApiFailure && error.status == 401) report(error)
                else mutable.update { it.copy(error = "The latest outcome is not available. Refresh receipts when connected; an interrupted request is not a failed application.") }
            }
            false
        }
    }

    private fun startPolling() {
        val connection = state.value.connection ?: return
        if (!foreground || state.value.requiresPairing || state.value.storageBlocked ||
            state.value.activePlans.isEmpty() || polling?.isActive == true) return
        val generation = foregroundGeneration
        polling = viewModelScope.launch {
            while (foreground && foregroundGeneration == generation && state.value.connection == connection && state.value.activePlans.isNotEmpty() &&
                !state.value.requiresPairing && !state.value.storageBlocked) {
                waitForPoll()
                if (!pollOnce()) break
            }
        }
    }

    fun exportReceipts(uri: Uri) = action {
        val connection = state.value.connection ?: throw IllegalArgumentException("Connect to export the current service receipts.")
        val data = service.request(connection, "GET", "receipts").toString(2).toByteArray(Charsets.UTF_8)
        withContext(Dispatchers.IO) {
            getApplication<Application>().contentResolver.openOutputStream(uri, "w")?.use { it.write(data) }
                ?: throw IllegalArgumentException("The selected destination could not be opened.")
        }
        mutable.update { it.copy(notice = "Receipt export saved. It contains application evidence, not your PDF or connection token.") }
    }
}
