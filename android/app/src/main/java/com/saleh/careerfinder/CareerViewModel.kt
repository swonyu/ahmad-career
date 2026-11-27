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

internal fun cvChangeAcknowledged(requested: ProfileDraft, saved: ProfileDraft): Boolean {
    if (requested.removeResume) return saved.resume == null
    val selected = requested.resume?.takeIf { it.dataBase64 != null } ?: return true
    val expectedName = selected.name.trim(::jsWhitespace)
    return saved.resume?.let { it.name == expectedName && it.size == selected.size && it.sha256 == selected.sha256 } == true
}

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

    private suspend fun writePrivate(name: String, value: JSONObject) {
        // Validation and capacity are recoverable draft errors, not a broken encryption store.
        requirePrivateCapacity(value)
        try { withContext(Dispatchers.IO) { vault.write(name, value) } }
        catch (cancel: CancellationException) { throw cancel }
        catch (error: PrivateCapacityException) { throw error }
        catch (error: Exception) { throw PrivateStorageFailure(StorageProblem(name, true), error) }
    }

    private fun holdsName(connection: Connection?) = connection?.let { "holds-" + BoundaryPolicy.workspaceKey(it.origin, it.workspaceId) } ?: "holds-unpaired"

    private fun holdsJournal(planIds: Collection<String>, receiptPlanIds: Map<String, String>): JSONObject {
        val plans = JSONObject()
        for ((id, plan) in receiptPlanIds) {
            if (id.isNotBlank() && id.length <= 200 && plan.isNotBlank() && plan.length <= 200) plans.put(id, plan)
        }
        return JSONObject().put("schema", 1).put("planIds", JSONArray(planIds.toList())).put("receiptPlanIds", plans)
    }

    private fun readableReceiptPlanIds(journal: JSONObject?): Map<String, String> {
        val raw = journal?.opt("receiptPlanIds")
        if (raw !is JSONObject) return emptyMap()
        val plans = mutableMapOf<String, String>()
        val keys = raw.keys()
        while (keys.hasNext()) {
            val id = keys.next()
            val plan = raw.opt(id)
            if (id.isNotBlank() && id.length <= 200 && plan is String && plan.isNotBlank() && plan.length <= 200) plans[id] = plan
        }
        return plans
    }

    /** Caller already holds diskMutex. A missing or unreadable journal does not block the Stop write. */
    private suspend fun replaceHoldsJournal(connection: Connection?, planIds: Collection<String>, extraReceiptPlans: Map<String, String> = emptyMap()) {
        val cached = try { readableReceiptPlanIds(readPrivate(holdsName(connection))) }
        catch (cancel: CancellationException) { throw cancel }
        catch (_: Exception) { emptyMap() }
        writePrivate(holdsName(connection), holdsJournal(planIds, cached + extraReceiptPlans))
    }

    private suspend fun savedWorkspace(connection: Connection?): CareerUiState {
        val name = workspaceName(connection)
        var stored = readPrivate(name)
        val aliases = connection?.legacyKeys().orEmpty().map { "workspace-$it" }
        val existingNames = try { withContext(Dispatchers.IO) { vault.names() } }
            catch (error: Exception) { throw PrivateStorageFailure(StorageProblem(name, false), error) }
        val preserved = aliases.filter { it in existingNames }.toMutableList()
        // A legacy alias is copied only when no canonical workspace exists. Originals are retained.
        if (stored == null) {
            val copies = aliases.mapNotNull { alias -> readPrivate(alias)?.let { alias to it } }
            preserved.addAll(copies.map { it.first })
            if (copies.size == 1 || copies.isNotEmpty() && copies.map { it.second.toString() }.distinct().size == 1) {
                val (alias, old) = copies.first()
                try { WorkspaceStorage.decode(old, connection) }
                catch (error: Exception) { throw PrivateStorageFailure(StorageProblem(alias, false), error) }
                writePrivate(name, old)
                val legacyKey = alias.removePrefix("workspace-")
                for (prefix in listOf("search-", "holds-")) {
                    val destination = prefix + name.removePrefix("workspace-")
                    if (readPrivate(destination) == null) readPrivate(prefix + legacyKey)?.let {
                        if (prefix == "search-") DiscoverySnapshotCodec.decode(it)
                        else { require(it.opt("schema") == 1); it.requiredStrings("planIds") }
                        writePrivate(destination, it)
                    }
                }
                stored = old
            }
        }
        return try {
            val saved = WorkspaceStorage.decode(stored, connection)
            val journal = readPrivate(holdsName(connection))
            val holds = if (journal == null) emptySet() else {
                require(journal.opt("schema") == 1)
                journal.requiredStrings("planIds").toSet()
            }
            val cachedPlans = readableReceiptPlanIds(journal)
            val receipts = saved.receipts.map { receipt ->
                val cached = cachedPlans[receipt.id]
                if (receipt.planId.isBlank() && cached != null && receipt.id.length <= 200) receipt.copy(planId = cached) else receipt
            }
            saved.copy(receipts = receipts, continuationHolds = saved.continuationHolds + holds,
                preservedWorkspaceCopies = preserved.distinct(),
                preservedRecoveryWorkspaces = withContext(Dispatchers.IO) { vault.preservedWorkspaces() },
                notice = if (stored == null && preserved.isNotEmpty()) "Earlier connection copies were preserved. Open phone data settings to review and merge the copy you want." else null)
        } catch (error: PrivateStorageFailure) { throw error }
        catch (error: Exception) { throw PrivateStorageFailure(StorageProblem(name, false), error) }
    }

    private suspend fun loadSavedWorkspace() {
        val connection = readPrivate("connection")?.let {
            try { Connection.fromJson(it) }
            catch (error: Exception) { throw PrivateStorageFailure(StorageProblem("connection", false), error) }
        }
        val saved = savedWorkspace(connection)
        discovery.stopPrivateSession(flush = true)
        mutable.value = saved.copy(busy = true, continuationHolds = saved.continuationHolds + state.value.takeIf { it.privateScope == saved.privateScope }?.continuationHolds.orEmpty())
        discovery.attachPrivateSession(vault, searchName(connection))
        try { if (connection != null) refreshInternal() }
        finally { mutable.update { it.copy(busy = false) } }
    }

    private suspend fun persist(allowBlocked: Boolean = false) = diskMutex.withLock {
        check(allowBlocked || !state.value.storageBlocked) { "Private storage is unavailable; the original files are preserved." }
        val snapshot = state.value
        val envelope = WorkspaceStorage.encode(snapshot)
        requirePrivateCapacity(envelope)
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
                    preservedRecoveryWorkspaces = withContext(Dispatchers.IO) { vault.preservedWorkspaces() },
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
        mutable.value = saved.copy(busy = true, continuationHolds = saved.continuationHolds + state.value.takeIf { it.privateScope == saved.privateScope }?.continuationHolds.orEmpty(),
            notice = "Phone paired. Review your saved phone draft in Profile to copy it deliberately.")
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

    fun choosePDF(uri: Uri, expectedScope: String = state.value.privateScope) = action {
        require(state.value.privateScope == expectedScope) { "The workspace changed while choosing a PDF. Choose it again from the intended profile." }
        draftSave?.cancel()
        val resume = withContext(Dispatchers.IO) {
            val resolver = getApplication<Application>().contentResolver
            val name = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }?.let { BoundaryPolicy.pdfName(it) } ?: "Resume.pdf"
            val bytes = resolver.openInputStream(uri)?.use { BoundaryPolicy.readPDF(it) }
                ?: throw IllegalArgumentException("This document could not be opened. Choose it again from Files.")
            try {
                ReadablePDF.validate(getApplication(), bytes)
                Resume(name, bytes.size.toLong(), BoundaryPolicy.sha256(bytes), Base64.encodeToString(bytes, Base64.NO_WRAP))
            } finally { bytes.fill(0) }
        }
        val before = state.value
        val next = before.copy(profile = before.profile.copy(resume = resume, removeResume = false), profileDirty = true, plan = null,
            reviewGeneration = before.reviewGeneration + 1, reviewingRecoveredPlan = false,
            obsoleteReviews = before.obsoleteReviews + listOfNotNull(before.plan?.takeIf(ReviewPlan::unapproved)?.id))
        val envelope = WorkspaceStorage.encode(next)
        requirePrivateCapacity(envelope)
        diskMutex.withLock { writePrivate(workspaceName(before.connection), envelope) }
        mutable.update { it.copy(profile = next.profile, profileDirty = true, plan = null, reviewGeneration = next.reviewGeneration,
            reviewingRecoveredPlan = false, obsoleteReviews = next.obsoleteReviews,
            notice = "PDF kept in your private draft. Save the connected profile when you are ready to share it.") }
    }

    fun removePDF() { editProfile { it.copy(resume = null, removeResume = true) } }

    fun saveProfile() = action {
        draftSave?.cancel()
        val captured = state.value.profile
        // Keep even invalid or unsupported edits before validation or a service request.
        persist()
        val connection = state.value.connection
        if (connection != null) ProfileValidation.requireValid(captured)
        val linkedin = if (captured.linkedin.isEmpty()) "" else BoundaryPolicy.linkedinProfileURL(captured.linkedin)
        if (connection == null) {
            mutable.update { it.copy(profile = it.profile.copy(linkedin = linkedin), profileDirty = false) }
            try { persist() } catch (error: Exception) { mutable.update { it.copy(profile = captured, profileDirty = true) }; throw error }
            mutable.update { it.copy(notice = if (ProfileValidation.errors(captured).isEmpty()) "Profile saved privately on this phone." else "Unfinished profile saved privately. Review the field guidance before sharing it.") }
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
            require(cvChangeAcknowledged(captured, saved)) {
                "The service did not confirm the CV change. Refresh the online profile and review your draft."
            }
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

    /** Keep the destination's current opportunity text. Park a different incoming draft, and do not grow past 200. */
    private fun mergeOpportunityDrafts(current: OpportunityDraft, recovered: List<OpportunityDraft>,
        incoming: OpportunityDraft, incomingRecovered: List<OpportunityDraft>): Pair<OpportunityDraft, List<OpportunityDraft>> {
        if (!incoming.hasContent && incomingRecovered.none { it.hasContent }) return current to recovered
        val adopted = if (!current.hasContent && incoming.hasContent) incoming else current
        val parkedIncoming = incomingRecovered.filter { it.hasContent && it != adopted } +
            listOfNotNull(incoming.takeIf { current.hasContent && incoming.hasContent && incoming != adopted })
        val stored = (recovered + parkedIncoming).distinct().let { merged ->
            if (adopted.hasContent) merged.filter { it != adopted } else merged
        }
        require(stored.size <= 200 || stored.size <= recovered.distinct().size) { unfinishedEditLimitMessage }
        return adopted to stored
    }

    fun inspectPhoneDraft() = action {
        require(state.value.connection != null) { "Pair a workspace before copying a phone draft." }
        val phone = savedWorkspace(null)
        val hasOpportunity = phone.opportunityDraft.hasContent || phone.recoveredOpportunityDrafts.any { it.hasContent }
        if (phone.profile == ProfileDraft() && phone.jobs.isEmpty() && phone.applicationRecords.isEmpty() && !hasOpportunity) {
            mutable.update { it.copy(notice = "There is no saved phone draft to copy.") }
        } else mutable.update { it.copy(phoneImport = PhoneImport(phone.profile, phone.jobs, phone.manualApplied, phone.applicationRecords,
            phone.opportunityDraft, phone.recoveredOpportunityDrafts)) }
    }

    fun closePhoneImport() { mutable.update { it.copy(phoneImport = null) } }

    fun importPhoneDraft(includeProfile: Boolean, includeJobs: Boolean) = action {
        val current = state.value
        require(current.connection != null) { "Reconnect before copying this draft." }
        require(current.profileConflict == null) { "Resolve the profile conflict before copying a phone draft." }
        val phone = current.phoneImport ?: throw IllegalArgumentException("Review the saved phone draft first.")
        val hasOpportunity = phone.opportunityDraft.hasContent || phone.recoveredOpportunityDrafts.any { it.hasContent }
        require(includeProfile || includeJobs || hasOpportunity) { "Choose what to copy." }
        val jobs = if (includeJobs) {
            // Copying would keep the first title and drop the second. Refuse before the destination changes.
            val incomingIdentities = phone.jobs.mapIndexed { index, job ->
                runCatching { BoundaryPolicy.jobIdentity(job.url) }.getOrElse { "unidentified-$index" }
            }
            require(incomingIdentities.distinct().size == incomingIdentities.size) { "The backup contains duplicate saved links." }
            val existing = current.jobs.map { BoundaryPolicy.jobIdentity(it.url) }.toMutableSet()
            phone.jobs.filter { existing.add(BoundaryPolicy.jobIdentity(it.url)) }
                .map { source -> source to source.copy(id = "local-" + UUID.randomUUID(), localOnly = true) }
        } else emptyList()
        val profile = if (includeProfile) phone.profile.copy(revision = current.profile.revision,
            removeResume = phone.profile.resume == null) else current.profile
        if (includeProfile && profile.resume != null) require(profile.resume.dataBase64 != null) { "Choose the PDF again before copying this profile." }
        val allJobs = jobs.map { pair -> pair.second } + current.jobs.map { job ->
            if (includeJobs) SavedJobMetadata.preserving(job, phone.jobs) else job
        }
        // An existing over-200 list is not shrunk. A profile-only copy adds no links.
        // Copying links is refused only when the merged list would grow past 200.
        if (includeJobs) require(allJobs.size <= 200 || allJobs.size <= current.jobs.size) {
            "The merged shortlist exceeds 200 links. Nothing was replaced."
        }
        val records = current.applicationRecords.toMutableMap()
        if (includeJobs) for ((identity, incoming) in phone.applicationRecords) {
            // Removed bookmarks can still have meaningful notes/history. Copy those records
            // explicitly without inventing a new saved link in the destination workspace.
            val destination = allJobs.firstOrNull { BoundaryPolicy.jobIdentity(it.url) == identity }
                ?: records[identity]?.job ?: incoming.job.copy(localOnly = true)
            records[identity] = records[identity]?.merge(incoming, destination)
                ?: incoming.copy(job = SavedJobMetadata.preserving(destination, incoming.job), relatedURLs = (incoming.relatedURLs + destination.url).distinct())
        }
        requireApplicationStatusChangesAllowed(current, records)
        val (opportunity, recovered) = mergeOpportunityDrafts(current.opportunityDraft, current.recoveredOpportunityDrafts,
            phone.opportunityDraft, phone.recoveredOpportunityDrafts)
        val legacyApplied = current.manualApplied + jobs.filter { pair -> pair.first.id in phone.manualApplied }.map { pair -> pair.second.id }
        val next = current.copy(profile = profile, profileDirty = includeProfile || current.profileDirty,
            jobs = allJobs, applicationRecords = records,
            opportunityDraft = opportunity, recoveredOpportunityDrafts = recovered,
            manualApplied = ApplicationRecordsCodec.appliedIDs(allJobs, records, legacyApplied),
            phoneImport = null, plan = null, reviewingRecoveredPlan = false, reviewGeneration = current.reviewGeneration + 1)
        val envelope = WorkspaceStorage.encode(next); requirePrivateCapacity(envelope)
        draftSave?.cancel()
        diskMutex.withLock { writePrivate(workspaceName(current.connection), envelope) }
        mutable.value = next.copy(continuationHolds = state.value.continuationHolds + next.continuationHolds)
        mutable.update { it.copy(notice = if (records.values.any { record -> record.needsReview })
            "Copied on this phone. Review the saved record versions in Saved; all were kept."
            else "Copied into a private workspace draft. Save the profile and sync each opportunity when ready. Nothing was sent to employers.") }
    }

    private fun recordsChanged(current: CareerUiState, records: Map<String, ApplicationRecordBundle>) = current.copy(
        applicationRecords = records,
        manualApplied = ApplicationRecordsCodec.appliedIDs(current.jobs, records, current.manualApplied),
        plan = null, reviewingRecoveredPlan = false, reviewGeneration = current.reviewGeneration + 1,
        obsoleteReviews = current.obsoleteReviews + listOfNotNull(current.plan?.takeIf(ReviewPlan::unapproved)?.id))

    private val unfinishedEditLimitMessage = "This phone already keeps 200 unfinished edits. Existing drafts were kept."
    private val opportunityDraftLimitMessage = "Keep the link under 4,096 characters and each opportunity detail under 500 characters."
    private val readableNoteMessage = "Keep the note to 2,000 characters and use readable plain text. Your draft is kept."
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

    private suspend fun persistRecordChange(records: Map<String, ApplicationRecordBundle>, editor: ApplicationRecordEditorState?, clearDraftIdentity: String? = null) {
        val before = state.value
        requireApplicationStatusChangesAllowed(before, records)
        draftSave?.cancel()
        mutable.update { recordsChanged(it, records).copy(applicationRecordEditor = editor,
            recordDrafts = if (clearDraftIdentity == null) it.recordDrafts else it.recordDrafts - clearDraftIdentity) }
        try { persist() }
        catch (error: Exception) {
            if (state.value.privateScope == before.privateScope) mutable.update { it.copy(applicationRecords = before.applicationRecords,
                manualApplied = before.manualApplied, applicationRecordEditor = before.applicationRecordEditor, recordDrafts = before.recordDrafts) }
            throw error
        }
    }

    fun openApplicationRecord(job: Opportunity, expectedScope: String = state.value.privateScope) {
        val current = state.value
        if (!current.loaded || current.busy || current.storageBlocked || current.privateScope != expectedScope) return
        val identity = BoundaryPolicy.jobIdentity(job.url)
        val record = current.applicationRecords[identity]
        if (current.jobs.none { it.id == job.id && BoundaryPolicy.jobIdentity(it.url) == identity } && record == null && identity !in current.recordDrafts) return
        val checkpoint = current.recordDrafts[identity]
        val savedDraft = record?.activeDraft ?: ApplicationRecordDraft()
        mutable.update { it.copy(error = null, applicationRecordEditor = ApplicationRecordEditorState(scope = expectedScope,
            identity = identity, job = job, expectedRevision = checkpoint?.baseRevision ?: record?.revision ?: 0,
            draft = checkpoint?.draft ?: savedDraft, initialDraft = savedDraft,
            restoredOlderRevision = checkpoint != null && checkpoint.baseRevision != (record?.revision ?: 0))) }
    }

    /** A new job identity is another unfinished edit. Replacing the draft already counted for that job does not grow the list. */
    private fun canStoreNewRecordDraft(identity: String): Boolean {
        val current = state.value
        if (identity in current.recordDrafts) return true
        return current.recordDrafts.size + current.recordDraftAlternatives.size < 200
    }

    private fun clearEditLimit(current: CareerUiState) = if (current.error == unfinishedEditLimitMessage) null else current.error

    /** A kept plain note drops a stale control refusal. A note that still contains a control keeps that sentence. */
    private fun clearKeptDraftStatus(current: CareerUiState, note: String): String? {
        val cleared = clearEditLimit(current)
        return if (cleared == readableNoteMessage && readablePlainNote(note)) null else cleared
    }

    private fun withinPhoneDraftLimits(draft: OpportunityDraft) = draft.url.length <= 4_096 && draft.title.length <= 500 &&
        draft.company.length <= 500 && draft.location.length <= 500 && draft.country.length <= 2

    /** A shorter field may repair a draft that is already over the shared limit. A longer field may not cross it. */
    private fun canReplacePhoneDraft(next: OpportunityDraft, previous: OpportunityDraft): Boolean {
        fun field(updated: String, prior: String, limit: Int) = updated.length <= limit || updated.length <= prior.length
        return field(next.url, previous.url, 4_096) && field(next.title, previous.title, 500) &&
            field(next.company, previous.company, 500) && field(next.location, previous.location, 500) &&
            field(next.country, previous.country, 2)
    }

    private fun opportunityDraftError(current: String?, draft: OpportunityDraft) = when {
        withinPhoneDraftLimits(draft) -> if (current == opportunityDraftLimitMessage) null else current
        current == null || current == opportunityDraftLimitMessage -> opportunityDraftLimitMessage
        else -> current
    }

    /** iPhone rejects these scalars in a saved note. Tab, newline, and return stay allowed. */
    private fun disallowedNoteCodes(note: String): List<Int> = buildList {
        for (character in note) {
            val code = character.code
            if ((code < 0x20 && code != 0x09 && code != 0x0A && code != 0x0D) || code == 0x7F) add(code)
        }
    }

    private fun readablePlainNote(note: String) = disallowedNoteCodes(note).isEmpty()

    /** Deleting a control, or text around one, is a repair. Inserting a new control is not. */
    private fun canRepairNote(next: String, previous: String): Boolean {
        val prior = disallowedNoteCodes(previous).groupingBy { it }.eachCount().toMutableMap()
        for (code in disallowedNoteCodes(next)) {
            val remaining = prior[code] ?: return false
            if (remaining == 0) return false
            prior[code] = remaining - 1
        }
        return true
    }

    private fun noteEditorError(current: String?, note: String): String? {
        val cleared = if (current == unfinishedEditLimitMessage) null else current
        return when {
            readablePlainNote(note) -> if (cleared == readableNoteMessage) null else cleared
            cleared == null || cleared == readableNoteMessage -> readableNoteMessage
            else -> cleared
        }
    }

    fun editApplicationRecordDraft(change: (ApplicationRecordDraft) -> ApplicationRecordDraft, expectedToken: String? = null) {
        if (state.value.busy || state.value.storageBlocked) return
        val editor = state.value.applicationRecordEditor ?: return
        if (editor.scope != state.value.privateScope || expectedToken != null && editor.token != expectedToken) return
        val updated = editor.copy(draft = change(editor.draft), pendingNotApplied = null, confirmClose = false)
        if (!canStoreNewRecordDraft(updated.identity)) {
            mutable.update { it.copy(error = unfinishedEditLimitMessage) }
            return
        }
        if (!canRepairNote(updated.draft.note, editor.draft.note)) {
            mutable.update { it.copy(error = readableNoteMessage) }
            return
        }
        if (updated.draft.manualResumeName?.let { !ApplicationCvEvidence.validManualName(it) } == true) {
            mutable.update { it.copy(error = ApplicationCvEvidence.MANUAL_NAME_ERROR) }
            return
        }
        val checkpoint = RecordDraftCheckpoint(updated.scope, updated.identity, updated.job, updated.expectedRevision, updated.draft)
        mutable.update { it.copy(error = noteEditorError(it.error, updated.draft.note)?.takeUnless { message -> message == ApplicationCvEvidence.MANUAL_NAME_ERROR }, applicationRecordEditor = updated,
            recordDrafts = it.recordDrafts + (updated.identity to checkpoint)) }
        queuePrivateSave()
    }

    /** Back, close, and Cancel all make the same explicit keep/discard choice. */
    fun closeApplicationRecord(expectedToken: String? = null) {
        if (state.value.busy) return
        val editor = state.value.applicationRecordEditor ?: return
        if (expectedToken != null && editor.token != expectedToken) return
        mutable.update { it.copy(applicationRecordEditor = if (editor.hasChanges && !editor.quickCorrection) editor.copy(confirmClose = true) else null) }
    }

    fun continueApplicationRecord(expectedToken: String) {
        mutable.update { if (it.applicationRecordEditor?.token == expectedToken) it.copy(applicationRecordEditor = it.applicationRecordEditor.copy(confirmClose = false)) else it }
    }

    fun keepApplicationRecordDraft(expectedToken: String) = action {
        val editor = state.value.applicationRecordEditor ?: return@action
        require(editor.token == expectedToken && editor.scope == state.value.privateScope) { "The workspace changed. Reopen this record." }
        draftSave?.cancel()
        require(canStoreNewRecordDraft(editor.identity)) { unfinishedEditLimitMessage }
        val checkpoint = RecordDraftCheckpoint(editor.scope, editor.identity, editor.job, editor.expectedRevision, editor.draft)
        mutable.update { it.copy(recordDrafts = it.recordDrafts + (editor.identity to checkpoint)) }
        persist()
        mutable.update { it.copy(applicationRecordEditor = null, notice = "Unfinished record kept on this phone. Its saved application status is unchanged.") }
    }

    fun discardApplicationRecordDraft(expectedToken: String) = action {
        val before = state.value
        val editor = before.applicationRecordEditor ?: return@action
        require(editor.token == expectedToken && editor.scope == before.privateScope) { "The workspace changed. Reopen this record." }
        draftSave?.cancel()
        mutable.update { it.copy(recordDrafts = it.recordDrafts - editor.identity) }
        try { persist() } catch (error: Exception) { mutable.update { it.copy(recordDrafts = before.recordDrafts) }; throw error }
        mutable.update { it.copy(applicationRecordEditor = null, notice = "Unfinished changes discarded. Saved notes, history and application status are kept.") }
    }

    fun rebaseApplicationRecordDraft(expectedToken: String) {
        if (state.value.busy || state.value.storageBlocked) return
        val editor = state.value.applicationRecordEditor ?: return
        if (editor.token != expectedToken || editor.scope != state.value.privateScope) return
        val record = state.value.applicationRecords[editor.identity]
        val updated = editor.copy(expectedRevision = record?.revision ?: 0, initialDraft = record?.activeDraft ?: ApplicationRecordDraft(),
            restoredOlderRevision = false, pendingNotApplied = null)
        if (!canStoreNewRecordDraft(editor.identity)) {
            mutable.update { it.copy(error = unfinishedEditLimitMessage) }
            return
        }
        mutable.update { it.copy(error = clearKeptDraftStatus(it, updated.draft.note), applicationRecordEditor = updated, recordDrafts = it.recordDrafts + (editor.identity to
            RecordDraftCheckpoint(editor.scope, editor.identity, editor.job, updated.expectedRevision, updated.draft))) }
        queuePrivateSave()
    }

    private fun checkedRecordEditor(expectedToken: String? = null): Pair<ApplicationRecordEditorState, ApplicationRecordBundle?> {
        val editor = state.value.applicationRecordEditor ?: throw IllegalArgumentException("Reopen the application record before saving.")
        require(editor.scope == state.value.privateScope && (expectedToken == null || editor.token == expectedToken)) {
            "The workspace changed. Reopen the correct application record before saving."
        }
        val record = state.value.applicationRecords[editor.identity]
        require((record?.revision ?: 0) == editor.expectedRevision) { "This application record changed. Close this editor and review the saved version before saving." }
        require(record != null || editor.identity in state.value.recordDrafts || state.value.jobs.any { it.id == editor.job.id && BoundaryPolicy.jobIdentity(it.url) == editor.identity }) {
            "This saved link changed. Close this editor and reopen its record."
        }
        return editor to record
    }

    fun saveApplicationRecord(confirmedNotApplied: Boolean = false, expectedToken: String? = null) = action {
        val (editor, existing) = checkedRecordEditor(expectedToken)
        require(readablePlainNote(editor.draft.note)) { readableNoteMessage }
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
        persistRecordChange(state.value.applicationRecords + (editor.identity to updated), null, if (editor.quickCorrection) null else editor.identity)
        mutable.update { it.copy(notice = "Record saved on this phone.") }
    }

    fun keepApplicationRecord(expectedToken: String? = null) {
        if (state.value.busy || state.value.storageBlocked) return
        val current = state.value.applicationRecordEditor ?: return
        if (expectedToken != null && current.token != expectedToken || current.scope != state.value.privateScope) return
        if (current.quickCorrection) { mutable.update { it.copy(applicationRecordEditor = null) }; return }
        val updated = current.copy(pendingNotApplied = null,
            draft = current.draft.copy(stage = state.value.applicationRecords[current.identity]?.displayStage ?: current.draft.stage))
        if (!canStoreNewRecordDraft(updated.identity)) {
            mutable.update { it.copy(error = unfinishedEditLimitMessage) }
            return
        }
        val checkpoint = RecordDraftCheckpoint(updated.scope, updated.identity, updated.job, updated.expectedRevision, updated.draft)
        mutable.update { it.copy(error = clearKeptDraftStatus(it, updated.draft.note), applicationRecordEditor = updated, recordDrafts = it.recordDrafts + (updated.identity to checkpoint)) }
        queuePrivateSave()
    }

    fun chooseApplicationRecordVersion(versionID: String, expectedToken: String) = action {
        val (editor, existing) = checkedRecordEditor(expectedToken)
        val record = existing ?: throw IllegalArgumentException("This saved record is no longer available.")
        require(!editor.hasChanges) { "Keep or discard your unfinished edits before choosing a saved version." }
        val updated = record.choose(versionID)
        persistRecordChange(state.value.applicationRecords + (editor.identity to updated),
            editor.copy(expectedRevision = updated.revision, draft = updated.activeDraft, initialDraft = updated.activeDraft, pendingNotApplied = null), editor.identity)
        mutable.update { it.copy(notice = "Selected details kept on this phone. Other versions remain in record history.") }
    }

    fun restoreRecordedOpportunity(identity: String, expectedScope: String) = action {
        require(state.value.privateScope == expectedScope) { "The workspace changed. Open the correct application record again." }
        val job = state.value.applicationRecords[identity]?.job ?: throw IllegalArgumentException("That application record is no longer available.")
        addOpportunityInternal(job.url, job.title, job.company, job.location, job.country, null, {},
            job.sourceName, job.checkedAt)
    }

    fun editOpportunityDraft(change: (OpportunityDraft) -> OpportunityDraft) {
        if (!state.value.loaded || state.value.storageBlocked || state.value.busy) return
        val previous = state.value.opportunityDraft
        val next = change(previous)
        if (!canReplacePhoneDraft(next, previous)) {
            mutable.update { it.copy(error = opportunityDraftLimitMessage) }
            return
        }
        mutable.update { it.copy(opportunityDraft = next, error = opportunityDraftError(it.error, next)) }
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

    fun addDiscoveredOpportunity(job: DiscoveredJob, done: () -> Unit) = action {
        // These facts came from the actual discovery response, not the save clock.
        SavedJobMetadata.requireValid(job.sourceName, job.checkedAt)
        addOpportunityInternal(job.url, job.title, job.company, job.location, job.country.orEmpty(), null, done,
            job.sourceName, job.checkedAt)
    }

    private suspend fun addOpportunityInternal(url: String, title: String, company: String, location: String, country: String,
        completingDraft: OpportunityDraft?, done: () -> Unit, sourceName: String? = null, checkedAt: String? = null) {
        val normalized = BoundaryPolicy.opportunityURL(url.trim())
        require(title.trim().isNotBlank() && company.trim().isNotBlank()) { "Add the role title and employer so the saved opportunity is clear." }
        require(ProfileContract.countryError(country) == null) { "Choose a recognized country or region, or leave it blank." }
        for ((label, value) in listOf("Role title" to title, "Employer" to company, "Location" to location))
            require(ProfileContract.textError(value, label, 500) == null) { "$label must be on one line with no more than 500 characters. Your unfinished draft is kept." }
        if (state.value.jobs.any { BoundaryPolicy.jobIdentity(it.url) == BoundaryPolicy.jobIdentity(normalized) }) {
            mutable.update { it.copy(notice = if (completingDraft == null) "This opportunity is already in your saved list."
                else "This link is already saved. Your unfinished draft is kept so you can review its details or change the link.") }
            if (completingDraft != null) { draftSave?.cancel(); persist() }
            done()
            return
        }
        require(state.value.jobs.size < 200) { "The merged shortlist exceeds 200 links. Nothing was replaced." }
        SavedJobMetadata.requireValid(sourceName, checkedAt)
        val job = Opportunity("local-" + UUID.randomUUID(), normalized, title.trim(), company.trim(), location.trim(), country.trim().uppercase(),
            true, sourceName, checkedAt)
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
        val removed = previous.jobs.single { it.id == id }
        val records = previous.applicationRecords.toMutableMap()
        val identity = BoundaryPolicy.jobIdentity(removed.url)
        records[identity]?.let { record ->
            val facts = SavedJobMetadata.preserving(removed, record.job)
            val retained = record.job.copy(sourceName = facts.sourceName, checkedAt = facts.checkedAt)
            if (retained != record.job) records[identity] = record.copy(job = retained, revision = Math.addExact(record.revision, 1))
        }
        draftSave?.cancel()
        mutable.update { it.copy(jobs = it.jobs.filterNot { job -> job.id == id }, selected = it.selected - id,
            applicationRecords = records, answers = it.answers - id, manualApplied = it.manualApplied - id,
            reviewGeneration = it.reviewGeneration + 1) }
        try { persist() }
        catch (error: Exception) {
            mutable.update { it.copy(jobs = previous.jobs, selected = previous.selected, answers = previous.answers,
                applicationRecords = previous.applicationRecords, manualApplied = previous.manualApplied, reviewGeneration = previous.reviewGeneration) }
            throw error
        }
        mutable.update { it.copy(notice = "Saved link removed. Your private application record, connected records and receipts are kept.") }
        done()
    }

    fun syncOpportunity(job: Opportunity) = action { syncInternal(job) }

    private suspend fun syncInternal(job: Opportunity) {
        val connection = state.value.connection ?: throw IllegalArgumentException("Connect your phone to sync this opportunity.")
        require(job.url.length <= 2048 && job.company.length <= 250) { "This saved link remains on your phone. The connected service accepts employer names up to 250 characters and links up to 2,048 characters; use the employer website or add a shorter corrected link to sync." }
        val sourceIdentity = BoundaryPolicy.jobIdentity(job.url)
        if (job.localOnly && state.value.applicationRecords[sourceIdentity]?.appliedElsewhere == true)
            requireApplicationStatusChangesAllowed(state.value, setOf(sourceIdentity))
        val response = service.request(connection, "POST", "jobs", job.inputJson())
        val synced = SavedJobMetadata.preserving(Opportunity.fromServer(response.getJSONObject("job")), job)
        require(synced.id.isNotBlank()) { "The service did not return the saved opportunity identity." }
        val destinationIdentity = BoundaryPolicy.jobIdentity(synced.url)
        val records = state.value.applicationRecords.toMutableMap()
        records[sourceIdentity]?.let { source ->
            records[destinationIdentity] = if (sourceIdentity != destinationIdentity && records[destinationIdentity] != null)
                records.getValue(destinationIdentity).merge(source, synced)
            else source.copy(job = SavedJobMetadata.preserving(synced, source.job), relatedURLs = (source.relatedURLs + synced.url).distinct())
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
        diskMutex.withLock { replaceHoldsJournal(connection, state.value.continuationHolds) }
        persist()
        require(plan.id !in state.value.continuationHolds) { "Stop was requested while preparing to send. Review receipts before approving again." }
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
        val captured = state.value
        val connection = captured.connection ?: return
        if (!captured.loaded || planId.isBlank()) return
        // Stop is a local safety decision even after a 401 or while another operation is busy.
        // A small independent journal keeps this decision durable even when the main draft is full.
        val holds = captured.continuationHolds + planId
        mutable.update { current ->
            if (current.privateScope == captured.privateScope) current.copy(continuationHolds = current.continuationHolds + planId) else current
        }
        viewModelScope.launch {
            try {
                diskMutex.withLock {
                    val retained = if (state.value.privateScope == captured.privateScope) state.value.continuationHolds + holds else holds
                    replaceHoldsJournal(connection, retained)
                }
                if (state.value.connection != connection) return@launch
                if (state.value.requiresPairing) {
                    mutable.update { it.copy(notice = "Stop is saved on this phone. Reconnect to request the server stop and recover receipts. An already dispatched application can still finish.") }
                    return@launch
                }
                service.request(connection, "POST", "stop", JSONObject().put("planId", planId))
                if (state.value.connection != connection) return@launch
                mutable.update { it.copy(plan = null, obsoleteReviews = it.obsoleteReviews - planId,
                    notice = "Stop requested. Jobs already dispatched still need a confirmed outcome.") }
                refreshInternal()
            } catch (cancel: CancellationException) { throw cancel }
            catch (error: Exception) { if (state.value.connection == connection) report(error) }
        }
    }

    /** Explicit Stop for one dispatching receipt. Does not submit, advance, or invent an uncertain outcome. */
    fun stopAndCheckReceipt(attemptId: String, planId: String) {
        val captured = state.value
        val connection = captured.connection ?: return
        if (!captured.loaded || planId.isBlank() || planId.length > 200 || attemptId.isBlank() || attemptId.length > 200) return
        if (captured.receipts.none { it.id == attemptId && it.state == "dispatching" && it.planId == planId }) return
        val holds = captured.continuationHolds + planId
        mutable.update { current ->
            if (current.privateScope == captured.privateScope) current.copy(continuationHolds = current.continuationHolds + planId) else current
        }
        viewModelScope.launch {
            try {
                diskMutex.withLock {
                    val sameWorkspace = state.value.connection == connection && state.value.privateScope == captured.privateScope
                    val retained = if (sameWorkspace) state.value.continuationHolds + holds else holds
                    replaceHoldsJournal(connection, retained, mapOf(attemptId to planId))
                }
                if (state.value.connection != connection || state.value.privateScope != captured.privateScope) return@launch
                if (state.value.requiresPairing) {
                    mutable.update { it.copy(notice = "Stop is saved on this phone. Reconnect to request the server stop and recover receipts. An already dispatched application can still finish.") }
                    return@launch
                }
                service.request(connection, "POST", "stop", JSONObject().put("planId", planId).put("onlyIfUnapproved", false))
                if (state.value.connection != connection || state.value.privateScope != captured.privateScope) return@launch
                mutable.update { it.copy(plan = it.plan?.takeIf { plan -> plan.id != planId }, obsoleteReviews = it.obsoleteReviews - planId,
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
            .map { SavedJobMetadata.preserving(it, state.value.jobs) }
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
        rememberObservedReceiptPlans(connection)
        startPolling()
        return true
    }

    /** Remembers dispatching plan ids beside the Stop holds. A failed journal write leaves the receipt snapshot in place. */
    private suspend fun rememberObservedReceiptPlans(connection: Connection) {
        val observed = state.value.receipts.mapNotNull { receipt ->
            if (receipt.state == "dispatching" && receipt.id.isNotBlank() && receipt.id.length <= 200 &&
                receipt.planId.isNotBlank() && receipt.planId.length <= 200) receipt.id to receipt.planId else null
        }.toMap()
        try {
            diskMutex.withLock {
                if (state.value.connection != connection) return@withLock
                val name = holdsName(connection)
                val journal = try { readPrivate(name) }
                catch (cancel: CancellationException) { throw cancel }
                catch (_: Exception) { null }
                if (journal == null && observed.isEmpty()) return@withLock
                val cached = readableReceiptPlanIds(journal)
                val merged = cached + observed
                val planIds = try {
                    if (journal != null && journal.opt("schema") == 1) journal.requiredStrings("planIds").toSet() else state.value.continuationHolds
                } catch (cancel: CancellationException) { throw cancel }
                catch (_: Exception) { state.value.continuationHolds }
                if (journal != null && merged == cached && journal.opt("receiptPlanIds") is JSONObject) return@withLock
                writePrivate(name, holdsJournal(planIds, merged))
            }
        } catch (cancel: CancellationException) { throw cancel }
        catch (_: Exception) { }
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

    fun exportWorkspace(uri: Uri, expectedScope: String, includePDF: Boolean) = action {
        require(state.value.privateScope == expectedScope) { "The workspace changed while choosing the export destination. Open export again for the workspace you want." }
        val snapshot = state.value
        require(snapshot.jobs.size <= 200) { "The merged shortlist exceeds 200 links. Nothing was replaced." }
        // Refresh keeps a phone-only row beside the same service link. The count stays legal,
        // but import rejects the pair. Write nothing and delete nothing.
        val identities = snapshot.jobs.mapIndexed { index, job ->
            runCatching { BoundaryPolicy.jobIdentity(job.url) }.getOrElse { "unidentified-$index" }
        }
        require(identities.distinct().size == identities.size) { "The backup contains duplicate saved links." }
        // Decode rejects the whole file when unfinished edits exceed 200. Write nothing.
        require(snapshot.recordDrafts.size + snapshot.recordDraftAlternatives.size <= 200) { unfinishedEditLimitMessage }
        require(snapshot.recoveredOpportunityDrafts.size <= 200) { unfinishedEditLimitMessage }
        // iPhone rejects the whole backup when an unfinished link is past these limits. Write nothing.
        require(withinPhoneDraftLimits(snapshot.opportunityDraft) && snapshot.recoveredOpportunityDrafts.all { withinPhoneDraftLimits(it) }) {
            opportunityDraftLimitMessage
        }
        // A saved note with a disallowed control makes iPhone reject the whole backup. Checkpoints may still export. Write nothing.
        require(snapshot.applicationRecords.values.all { bundle ->
            (listOf(bundle.current) + bundle.alternatives + bundle.history).all { readablePlainNote(it.record.note) }
        }) { readableNoteMessage }
        val data = WorkspaceTransfer.export(snapshot, discovery.exportSnapshot(), includePDF).toString().toByteArray(Charsets.UTF_8)
        withContext(Dispatchers.IO) {
            try {
                getApplication<Application>().contentResolver.openOutputStream(uri, "w")?.use { it.write(data) }
                    ?: throw IllegalArgumentException("The export destination could not be opened. Your phone data is unchanged.")
            } finally { data.fill(0) }
        }
        mutable.update { it.copy(notice = "Phone workspace exported. The file contains private data${if (includePDF) " and any PDF bytes held on this phone" else " without PDF bytes"}. Keep it somewhere you trust; connection tokens and approval authority are excluded.") }
    }

    fun inspectWorkspaceImport(uri: Uri, expectedScope: String) = action {
        require(state.value.privateScope == expectedScope) { "The workspace changed while choosing a backup. Choose the file again from the destination workspace." }
        val preview = withContext(Dispatchers.IO) {
            val bytes = getApplication<Application>().contentResolver.openInputStream(uri)?.use { BoundaryPolicy.readBounded(it, WorkspaceTransfer.MAX_BYTES) }
                ?: throw IllegalArgumentException("The backup could not be opened. Choose it again from Files.")
            try {
                val decoder = Charsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
                    .onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT)
                val text = decoder.decode(java.nio.ByteBuffer.wrap(bytes)).toString()
                WorkspaceTransfer.rejectExcessiveNesting(text)
                val parser = org.json.JSONTokener(text)
                val value = parser.nextValue()
                require(value is JSONObject && parser.nextClean() == '\u0000') { "Choose a complete JSON phone workspace backup." }
                val decoded = WorkspaceTransfer.decode(value, expectedScope)
                val pdfIssue = decoded.snapshot.profile.resume?.dataBase64?.let { encoded ->
                    val pdf = Base64.decode(encoded, Base64.NO_WRAP)
                    try { runCatching { ReadablePDF.validate(getApplication(), pdf) }.exceptionOrNull()?.message }
                    finally { pdf.fill(0) }
                }
                decoded.copy(pdfProblem = pdfIssue)
            } finally { bytes.fill(0) }
        }
        require(state.value.privateScope == expectedScope) { "The destination workspace changed. Review the backup again." }
        mutable.update { it.copy(workspaceImport = preview) }
    }

    fun inspectPreservedWorkspace(name: String, expectedScope: String) = action {
        require(state.value.privateScope == expectedScope && name in state.value.preservedWorkspaceCopies) { "Reopen phone data settings for the current workspace." }
        val value = readPrivate(name) ?: throw IllegalArgumentException("This preserved copy is no longer available.")
        val source = WorkspaceStorage.decode(value, state.value.connection)
        val search = readPrivate("search-" + name.removePrefix("workspace-"))
        val preview = WorkspaceTransfer.decode(WorkspaceTransfer.export(source, search, true), expectedScope)
        mutable.update { it.copy(workspaceImport = preview) }
    }

    fun inspectRecoveryWorkspace(copy: PreservedWorkspace, expectedScope: String) = action {
        require(state.value.privateScope == expectedScope && copy in state.value.preservedRecoveryWorkspaces) { "The workspace changed. Reopen recovery settings." }
        val preview = withContext(Dispatchers.IO) {
            val value = vault.readPreserved(copy.area, copy.record) ?: throw IllegalArgumentException("This earlier workspace is no longer available.")
            val savedConnection = vault.readPreserved(copy.area, "connection")?.let { runCatching { Connection.fromJson(it) }.getOrNull() }
            val sourceConnection = savedConnection?.takeIf { connection -> copy.record == workspaceName(connection) ||
                copy.record.removePrefix("workspace-") in connection.legacyKeys() }
            val source = WorkspaceStorage.decode(value, sourceConnection, expectedScope = copy.record)
            val journal = vault.readPreserved(copy.area, "holds-" + copy.record.removePrefix("workspace-"))
            val held = if (journal == null) emptySet() else { require(journal.opt("schema") == 1); journal.requiredStrings("planIds").toSet() }
            val search = vault.readPreserved(copy.area, "search-" + copy.record.removePrefix("workspace-"))
            search?.let(DiscoverySnapshotCodec::decode)
            val transfer = WorkspaceTransfer.export(source.copy(continuationHolds = source.continuationHolds + held), search, true)
            WorkspaceTransfer.decode(transfer, expectedScope)
        }
        mutable.update { it.copy(workspaceImport = preview) }
    }

    fun deleteRecoveryWorkspace(copy: PreservedWorkspace, expectedScope: String) = action {
        require(state.value.privateScope == expectedScope && copy in state.value.preservedRecoveryWorkspaces) { "The workspace changed. Reopen recovery settings." }
        withContext(Dispatchers.IO) {
            val savedConnection = vault.readPreserved(copy.area, "connection")?.let { runCatching { Connection.fromJson(it) }.getOrNull() }
            val matched = savedConnection?.takeIf { copy.record == workspaceName(it) || copy.record.removePrefix("workspace-") in it.legacyKeys() }
            val names = mutableSetOf(copy.record, "search-" + copy.record.removePrefix("workspace-"), "holds-" + copy.record.removePrefix("workspace-"))
            matched?.let { connection ->
                names += "connection"
                (connection.legacyKeys() + BoundaryPolicy.workspaceKey(connection.origin, connection.workspaceId)).forEach { key ->
                    names += setOf("workspace-$key", "search-$key", "holds-$key")
                }
            }
            vault.removePreserved(copy.area, names)
        }
        val remaining = withContext(Dispatchers.IO) { vault.preservedWorkspaces() }
        mutable.update { it.copy(preservedRecoveryWorkspaces = remaining,
            notice = "The selected earlier recovery copy and its known equivalent-address files were deleted. Your current workspace, other recovery copies, exported files and cloud records are unchanged.") }
    }

    fun closeWorkspaceImport() { if (!state.value.busy) mutable.update { it.copy(workspaceImport = null) } }

    fun importWorkspace(token: String, includeProfile: Boolean, includePDF: Boolean, includeRecords: Boolean, includeSearch: Boolean) = action {
        val before = state.value
        val preview = before.workspaceImport ?: throw IllegalArgumentException("Choose and review a backup first.")
        require(preview.token == token && preview.expectedScope == before.privateScope) { "The destination changed. Review the backup again." }
        require(includeProfile || includeRecords || includeSearch) { "Choose what to import." }
        if (includeSearch) require(preview.search != null) { "This backup has no compatible saved search." }
        if (includeProfile) require(before.profileConflict == null) { "Resolve the saved profile comparison before importing another draft." }
        if (includePDF) require(includeProfile && preview.pdfProblem == null && preview.snapshot.profile.resume?.dataBase64 != null) { "Choose a readable PDF before replacing your current résumé." }
        val incoming = preview.snapshot
        val jobs = before.jobs.toMutableList()
        val idMap = mutableMapOf<String, String>()
        if (includeRecords) for (job in incoming.jobs) {
            val identity = BoundaryPolicy.jobIdentity(job.url)
            val existingIndex = jobs.indexOfFirst { BoundaryPolicy.jobIdentity(it.url) == identity }
            val destination = if (existingIndex >= 0) SavedJobMetadata.preserving(jobs[existingIndex], job).also { jobs[existingIndex] = it }
                else job.copy(id = "local-" + UUID.randomUUID(), localOnly = true).also { jobs.add(it) }
            idMap[job.id] = destination.id
        }
        // Refresh can already hold 200 service links plus phone-only rows. Keep that list.
        // Refuse only a merge that grows it past 200, and write nothing when this require fails.
        require(jobs.size <= 200 || jobs.size <= before.jobs.size) { "The merged shortlist exceeds 200 links. Nothing was replaced." }
        val records = before.applicationRecords.toMutableMap()
        if (includeRecords) for ((identity, record) in incoming.applicationRecords) {
            val destination = jobs.firstOrNull { BoundaryPolicy.jobIdentity(it.url) == identity }
                ?: records[identity]?.job ?: record.job.copy(id = "local-" + UUID.randomUUID(), localOnly = true)
            records[identity] = records[identity]?.merge(record, destination)
                ?: record.copy(job = SavedJobMetadata.preserving(destination, record.job), relatedURLs = (record.relatedURLs + destination.url).distinct())
        }
        requireApplicationStatusChangesAllowed(before, records)
        val drafts = before.recordDrafts.toMutableMap()
        val alternatives = before.recordDraftAlternatives.toMutableList()
        if (includeRecords) for (checkpoint in incoming.recordDrafts.values + incoming.recordDraftAlternatives) {
            val destination = jobs.firstOrNull { BoundaryPolicy.jobIdentity(it.url) == checkpoint.identity }
                ?: records[checkpoint.identity]?.job ?: checkpoint.job.copy(id = "local-" + UUID.randomUUID(), localOnly = true)
            val candidate = checkpoint.copy(scope = before.privateScope, job = SavedJobMetadata.preserving(destination, checkpoint.job))
            val existing = drafts[candidate.identity]
            if (existing == null) drafts[candidate.identity] = candidate
            else if (existing.draft != candidate.draft || existing.baseRevision != candidate.baseRevision) alternatives += candidate
        }
        val storedAlternatives = if (includeRecords) alternatives.distinct() else alternatives
        val beforeEdits = before.recordDrafts.size + before.recordDraftAlternatives.distinct().size
        val storedEdits = drafts.size + storedAlternatives.size
        require(!includeRecords || storedEdits <= 200 || storedEdits <= beforeEdits) { unfinishedEditLimitMessage }
        val (opportunity, recovered) = if (includeRecords) mergeOpportunityDrafts(before.opportunityDraft, before.recoveredOpportunityDrafts,
            incoming.opportunityDraft, incoming.recoveredOpportunityDrafts)
            else before.opportunityDraft to before.recoveredOpportunityDrafts
        val answers = before.answers.toMutableMap()
        if (includeRecords) for ((oldID, answer) in incoming.answers) idMap[oldID]?.let { destination ->
            // Employer consents are never recovered as fresh authorization.
            if (destination !in answers) answers[destination] = answer.copy(consentStore = null, consentMarketing = null)
        }
        val profile = if (includeProfile) incoming.profile.copy(revision = before.profile.revision,
            resume = if (includePDF) incoming.profile.resume else before.profile.resume,
            removeResume = if (includePDF) false else before.profile.removeResume) else before.profile
        val next = before.copy(profile = profile, profileDirty = includeProfile || before.profileDirty,
            jobs = jobs, applicationRecords = records, recordDrafts = drafts, recordDraftAlternatives = storedAlternatives,
            opportunityDraft = opportunity, recoveredOpportunityDrafts = recovered, answers = answers,
            selected = before.selected + if (includeRecords) incoming.selected.mapNotNull { idMap[it] } else emptyList(),
            manualApplied = ApplicationRecordsCodec.appliedIDs(jobs, records, before.manualApplied),
            importedReceipts = (before.importedReceipts + if (includeRecords) incoming.importedReceipts else emptyList()).distinctBy { it.id + "|" + it.applicationId },
            continuationHolds = before.continuationHolds + if (preview.matches(before.connection)) incoming.continuationHolds else emptySet(),
            workspaceImport = null, plan = null, reviewingRecoveredPlan = false, reviewGeneration = before.reviewGeneration + 1,
            obsoleteReviews = before.obsoleteReviews + listOfNotNull(before.plan?.takeIf(ReviewPlan::unapproved)?.id))
        val envelope = WorkspaceStorage.encode(next)
        requirePrivateCapacity(envelope)
        draftSave?.cancel()
        diskMutex.withLock { writePrivate(workspaceName(before.connection), envelope) }
        mutable.value = next.copy(continuationHolds = state.value.continuationHolds + next.continuationHolds, notice = "Backup merged privately. Other workspaces and the original file are kept. Review conflicting notes and drafts in phone data settings. Imported receipt copies are unverified; refresh service receipts to recover evidence.")
        if (includeSearch) {
            discovery.stopPrivateSession(flush = true)
            try { writePrivate(searchName(before.connection), checkNotNull(preview.search)) }
            catch (cancel: CancellationException) { throw cancel }
            catch (_: Exception) { mutable.update { it.copy(error = "The selected phone records were merged, but the saved search could not be replaced. Its earlier file is preserved. Retry the search import from your backup.") } }
            finally { discovery.attachPrivateSession(vault, searchName(before.connection)) }
        }
    }

    fun restoreOpportunityDraft(index: Int, expectedScope: String, done: () -> Unit) = action {
        val before = state.value
        require(before.privateScope == expectedScope) { "The workspace changed. Review its drafts again." }
        val restored = before.recoveredOpportunityDrafts.getOrNull(index) ?: throw IllegalArgumentException("This unfinished opportunity changed. Reopen the draft list.")
        // Parking an over-limit current draft would make the next export unreadable on iPhone. Shorten it in the editor first. Write nothing.
        if (before.opportunityDraft.hasContent && before.opportunityDraft != restored && !withinPhoneDraftLimits(before.opportunityDraft)) {
            throw IllegalArgumentException(opportunityDraftLimitMessage)
        }
        val kept = before.recoveredOpportunityDrafts.filterIndexed { item, _ -> item != index } + listOfNotNull(before.opportunityDraft.takeIf { it.hasContent && it != restored })
        val next = before.copy(opportunityDraft = restored, recoveredOpportunityDrafts = kept.distinct())
        val envelope = WorkspaceStorage.encode(next); requirePrivateCapacity(envelope)
        diskMutex.withLock { writePrivate(workspaceName(before.connection), envelope) }
        mutable.value = next.copy(continuationHolds = state.value.continuationHolds + next.continuationHolds); done()
    }

    fun useRecoveredRecordDraft(checkpoint: RecordDraftCheckpoint, expectedScope: String) = action {
        val before = state.value
        require(before.privateScope == expectedScope && checkpoint in before.recordDraftAlternatives) { "This draft list changed. Open it again." }
        val previous = before.recordDrafts[checkpoint.identity]
        val alternatives = before.recordDraftAlternatives - checkpoint + listOfNotNull(previous?.takeIf { it != checkpoint })
        val next = before.copy(recordDrafts = before.recordDrafts + (checkpoint.identity to checkpoint), recordDraftAlternatives = alternatives.distinct(), applicationRecordEditor = null)
        val envelope = WorkspaceStorage.encode(next); requirePrivateCapacity(envelope)
        diskMutex.withLock { writePrivate(workspaceName(before.connection), envelope) }
        mutable.value = next.copy(continuationHolds = state.value.continuationHolds + next.continuationHolds, notice = "Recovered edit selected. Open its record to review and save; earlier draft versions are kept.")
    }

    fun deleteLocalWorkspace(expectedScope: String) = action {
        val before = state.value
        require(before.privateScope == expectedScope) { "The workspace changed. Review the deletion choice again." }
        require(before.activePlans.isEmpty()) { "Stop active Auto Apply work and refresh receipts before deleting this workspace from the phone." }
        draftSave?.cancel(); polling?.cancel()
        discovery.stopPrivateSession(flush = false)
        val aliases = before.connection?.legacyKeys().orEmpty()
        val names = listOf(workspaceName(before.connection), searchName(before.connection), holdsName(before.connection)) +
            aliases.flatMap { listOf("workspace-$it", "search-$it", "holds-$it") }
        try {
            diskMutex.withLock { withContext(Dispatchers.IO) {
                if (before.connection != null) vault.remove("connection")
                names.distinct().forEach(vault::remove)
            } }
        } catch (error: Exception) {
            throw PrivateStorageFailure(StorageProblem(workspaceName(before.connection), false), error)
        }
        // Only this selected scope and its known equivalent-address aliases are erased.
        mutable.value = savedWorkspace(null).copy(busy = true,
            notice = "This workspace was removed from the phone. Other phone workspaces, older preserved recovery areas, exported files, cloud records and employer applications were not deleted.")
        discovery.attachPrivateSession(vault, searchName(null))
    }

    fun exportReceipts(uri: Uri, expectedScope: String = state.value.privateScope) = action {
        require(state.value.privateScope == expectedScope) { "The workspace changed while choosing the export destination. Export again from the intended account." }
        val connection = state.value.connection ?: throw IllegalArgumentException("Connect to export the current service receipts.")
        val data = service.request(connection, "GET", "receipts").toString(2).toByteArray(Charsets.UTF_8)
        withContext(Dispatchers.IO) {
            getApplication<Application>().contentResolver.openOutputStream(uri, "w")?.use { it.write(data) }
                ?: throw IllegalArgumentException("The selected destination could not be opened.")
        }
        mutable.update { it.copy(notice = "Receipt export saved. It contains application evidence, not your PDF or connection token.") }
    }
}
