package com.saleh.careerfinder

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import java.time.LocalDate

@Composable
internal fun WorkspaceDataDialog(state: CareerUiState, model: CareerViewModel, editOpportunity: () -> Unit, close: () -> Unit) {
    val scope = state.privateScope
    var includePDF by rememberSaveable(scope) { mutableStateOf(false) }
    var exportingScope by rememberSaveable { mutableStateOf<String?>(null) }
    var exportingPDF by rememberSaveable { mutableStateOf(false) }
    var importingScope by rememberSaveable { mutableStateOf<String?>(null) }
    var deletingScope by remember { mutableStateOf<String?>(null) }
    var deletingRecovery by remember { mutableStateOf<PreservedWorkspace?>(null) }
    val export = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val captured = exportingScope
        exportingScope = null
        if (uri != null && captured != null) model.exportWorkspace(uri, captured, exportingPDF)
    }
    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val captured = importingScope
        importingScope = null
        if (uri != null && captured != null) model.inspectWorkspaceImport(uri, captured)
    }
    FullScreenForm("Phone data and recovery", { if (!state.busy) close() }) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item {
                Heading("Your private workspace", if (state.connection == null) "Separate phone draft" else "Connected to ${state.connection.origin}")
                Text("These actions apply to the workspace currently open on this phone.")
                Text("${state.jobs.size} saved jobs · ${state.applicationRecords.size} private application records · ${state.recordDrafts.size + state.recordDraftAlternatives.size} unfinished record edits")
            }
            if (state.error != null) item { Text(state.error, color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
            item { Panel {
                Text("Export a phone backup", style = MaterialTheme.typography.titleLarge)
                Text("Includes your profile, saved jobs, notes, dates, history, unfinished edits, receipt copies and last search. This JSON file is readable by anyone who has it. Store it somewhere you trust.")
                Text("Connection tokens, account passwords and application approval authority are excluded. Only PDF bytes already held by this phone can be included.", style = MaterialTheme.typography.bodySmall)
                CheckLine("Include PDF résumé bytes", includePDF, { includePDF = it }, !state.busy && state.profile.resume?.dataBase64 != null)
                Action("Export phone workspace", !state.busy) {
                    exportingScope = scope; exportingPDF = includePDF
                    export.launch("Career-Finder-Phone-" + LocalDate.now() + ".json")
                }
            } }
            item { Panel {
                Text("Recover or merge a backup", style = MaterialTheme.typography.titleLarge)
                Text("Review a Career Finder iPhone or Android backup before merging it here. You choose whether to replace profile fields or the last search. Existing notes and conflicting history versions are kept.")
                Action("Choose phone backup", !state.busy) { importingScope = scope; importLauncher.launch(arrayOf("application/json", "text/plain", "application/octet-stream")) }
            } }
            if (state.preservedWorkspaceCopies.isNotEmpty()) item { Text("Earlier connection address copies", style = MaterialTheme.typography.titleLarge) }
            items(state.preservedWorkspaceCopies, key = { it }) { name ->
                Panel {
                    Text("Preserved private workspace copy")
                    Text("An earlier equivalent service address used a separate storage name. Review and merge its data; the original copy is kept.", style = MaterialTheme.typography.bodySmall)
                    Action("Review preserved copy", !state.busy) { model.inspectPreservedWorkspace(name, scope) }
                }
            }
            if (state.preservedRecoveryWorkspaces.isNotEmpty()) item { Text("Earlier recovery areas", style = MaterialTheme.typography.titleLarge) }
            items(state.preservedRecoveryWorkspaces, key = { it.id }) { copy -> Panel {
                Text(if (copy.record == "workspace-unpaired") "Earlier phone draft" else "Earlier connected workspace", style = MaterialTheme.typography.titleMedium)
                Text("Kept when a new private storage area was created. Review it before merging; the earlier encrypted file stays preserved until you explicitly delete this copy.")
                Action("Review earlier recovery copy", !state.busy) { model.inspectRecoveryWorkspace(copy, scope) }
                TextButton(onClick = { deletingRecovery = copy }, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Delete this earlier copy…") }
            } }
            if (state.recordDrafts.isNotEmpty()) item { Text("Unfinished record edits", style = MaterialTheme.typography.titleLarge) }
            items(state.recordDrafts.values.toList(), key = { "draft-" + it.identity }) { checkpoint -> Panel {
                Text(checkpoint.job.title, style = MaterialTheme.typography.titleMedium)
                Text(checkpoint.job.company)
                Text(checkpoint.draft.stage.label + " · unfinished; saved status unchanged")
                Action("Resume record edit", !state.busy) { model.openApplicationRecord(checkpoint.job, scope); close() }
            } }
            if (state.recordDraftAlternatives.isNotEmpty()) item { Text("Other recovered edit versions", style = MaterialTheme.typography.titleLarge) }
            items(state.recordDraftAlternatives) { checkpoint -> Panel {
                Text(checkpoint.job.title, style = MaterialTheme.typography.titleMedium)
                Text(checkpoint.draft.stage.label)
                if (checkpoint.draft.appliedDate.isNotEmpty()) Text("Applied date: " + civilDateLabel(checkpoint.draft.appliedDate))
                if (checkpoint.draft.followUpDate.isNotEmpty()) Text("Follow-up: " + civilDateLabel(checkpoint.draft.followUpDate))
                Text(checkpoint.draft.note.ifBlank { "No private note" })
                Action("Use this unfinished edit", !state.busy) { model.useRecoveredRecordDraft(checkpoint, scope) }
                Text("The current unfinished edit is kept as another version.", style = MaterialTheme.typography.bodySmall)
            } }
            if (state.recoveredOpportunityDrafts.isNotEmpty()) item { Text("Recovered opportunity drafts", style = MaterialTheme.typography.titleLarge) }
            items(state.recoveredOpportunityDrafts.indices.toList()) { index ->
                val draft = state.recoveredOpportunityDrafts[index]
                Panel {
                    Text(draft.title.ifBlank { "Unfinished opportunity" }, style = MaterialTheme.typography.titleMedium)
                    Text(draft.company); Text(draft.url)
                    Action("Continue this opportunity", !state.busy) { model.restoreOpportunityDraft(index, scope) { close(); editOpportunity() } }
                }
            }
            if (state.importedReceipts.isNotEmpty()) item { Panel {
                Text("Imported receipt copies", style = MaterialTheme.typography.titleLarge)
                Text("${state.importedReceipts.size} file records are kept for reference. They are not counted as verified applications. Connect to the original account and refresh service receipts to recover provider evidence.")
            } }
            items(state.importedReceipts, key = { "archive-" + it.id + "|" + it.applicationId }) { receipt -> Panel {
                Text("Unverified imported copy", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(receipt.title, style = MaterialTheme.typography.titleMedium); Text(receipt.company)
                Text("Recorded state: " + receipt.state)
                if (receipt.applicationId.isNotBlank()) Text("Recorded reference: " + receipt.applicationId)
                Text(dateLabel(receipt.date))
            } }
            item { Panel {
                Text("Delete this workspace from this phone", style = MaterialTheme.typography.titleLarge)
                Text("Deletes this scope's phone profile, résumé, saved jobs, notes, drafts, local receipt copies, search and known equivalent-address copies. Export a backup first if you want to keep them.")
                Text("Other phone workspaces, older preserved recovery areas, exported files, cloud records and employer applications are separate. Manage cloud account deletion in the account page.", style = MaterialTheme.typography.bodySmall)
                if (state.activePlans.isNotEmpty()) Text("Stop active Auto Apply work and refresh receipts before deleting this phone workspace.", color = MaterialTheme.colorScheme.error)
                OutlinedButton(onClick = { deletingScope = scope }, enabled = !state.busy && state.activePlans.isEmpty(),
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Delete this phone workspace…") }
            } }
        }
    }
    deletingRecovery?.let { copy -> AlertDialog(onDismissRequest = { deletingRecovery = null },
        title = { Text("Delete this earlier recovery copy?") },
        text = { Text("This removes the selected earlier phone workspace, its saved search and its known equivalent-address copies from the earlier storage area. It cannot be undone without a backup. The current workspace, other recovery copies and cloud records are kept.", Modifier.verticalScroll(rememberScrollState())) },
        confirmButton = { TextButton(onClick = { deletingRecovery = null; model.deleteRecoveryWorkspace(copy, scope) }, enabled = !state.busy,
            modifier = Modifier.heightIn(min = 48.dp)) { Text("Delete earlier copy") } },
        dismissButton = { TextButton(onClick = { deletingRecovery = null }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Keep copy") } }) }
    deletingScope?.let { captured -> AlertDialog(onDismissRequest = { deletingScope = null },
        title = { Text("Delete this phone workspace?") },
        text = { Text("This removes the selected workspace's local files and connection from this phone. It cannot be undone without an exported backup. Other workspaces, older preserved recovery areas, cloud data and employer applications remain separate.", Modifier.verticalScroll(rememberScrollState())) },
        confirmButton = { TextButton(onClick = { deletingScope = null; model.deleteLocalWorkspace(captured) }, enabled = !state.busy,
            modifier = Modifier.heightIn(min = 48.dp)) { Text("Delete local workspace") } },
        dismissButton = { TextButton(onClick = { deletingScope = null }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Keep workspace") } }) }
}

@Composable
internal fun WorkspaceImportDialog(state: CareerUiState, model: CareerViewModel) {
    val preview = state.workspaceImport ?: return
    val incoming = preview.snapshot
    var profile by remember(preview.token) { mutableStateOf(false) }
    var pdf by remember(preview.token) { mutableStateOf(false) }
    var records by remember(preview.token) { mutableStateOf(true) }
    var search by remember(preview.token) { mutableStateOf(false) }
    var details by remember(preview.token) { mutableStateOf(false) }
    FullScreenForm("Review phone backup", model::closeWorkspaceImport) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item { Heading("Merge into this workspace?", "From ${preview.sourceLabel} · ${preview.sourcePlatform}") }
            item { Text("Destination: " + (state.connection?.origin ?: "Separate phone draft")) }
            item { Text("${incoming.jobs.size} saved jobs · ${incoming.applicationRecords.size} application records · ${incoming.recordDrafts.size + incoming.recordDraftAlternatives.size} unfinished record edits. No employer application will be submitted.") }
            item { Panel {
                CheckLine("Merge saved jobs, records, drafts and receipt copies", records, { records = it }, !state.busy)
                Text("Existing history is kept. Conflicting saved versions need your review. Imported receipt copies remain unverified. Employer consent checkboxes are cleared.", style = MaterialTheme.typography.bodySmall)
                CheckLine("Replace profile fields with this private draft", profile, { profile = it; if (!it) pdf = false }, !state.busy)
                Text("The current résumé stays selected unless you also choose to replace its bytes. Cloud profiles are not changed until you explicitly save.", style = MaterialTheme.typography.bodySmall)
                CheckLine("Replace résumé with the backup PDF", pdf, { pdf = it }, !state.busy && profile && incoming.profile.resume?.dataBase64 != null && preview.pdfProblem == null)
                preview.pdfProblem?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                if (incoming.profile.resume != null && incoming.profile.resume.dataBase64 == null) Text("The backup has résumé metadata only. Choose the actual PDF again if needed.")
                if (preview.search != null) CheckLine("Replace this workspace's last search", search, { search = it }, !state.busy)
            } }
            item { Panel {
                Text("Incoming profile", style = MaterialTheme.typography.titleLarge)
                Text(listOf(incoming.profile.firstName, incoming.profile.lastName).filter(String::isNotBlank).joinToString(" ").ifBlank { "Blank individual profile" })
                Text(incoming.profile.email.ifBlank { "No email entered" })
                Text(incoming.profile.resume?.name ?: "No résumé in backup")
                TextButton(onClick = { details = !details }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(if (details) "Hide incoming details" else "Review all incoming details") }
                if (details) {
                    listOf("Phone" to incoming.profile.phone, "City" to incoming.profile.city, "Country" to incoming.profile.country,
                        "Headline" to incoming.profile.headline, "Skills" to incoming.profile.skills, "Roles" to incoming.profile.targetRoles,
                        "Target countries" to incoming.profile.targetCountries, "Work preferences" to incoming.profile.workModes.joinToString(", "),
                        "Experience" to incoming.profile.experienceLevel, "Website" to incoming.profile.website, "LinkedIn profile link" to incoming.profile.linkedin)
                        .forEach { (label, value) -> Text(label + ": " + value.ifBlank { "Not entered" }) }
                }
            } }
            if (details) items(incoming.applicationRecords.values.toList(), key = { it.identity }) { record -> Panel {
                Text(record.job.title, style = MaterialTheme.typography.titleMedium); Text(record.job.company)
                Text(record.displayStage.label + " · self-reported")
                Text(record.current.record.note.ifBlank { "No private note" })
                Text("${record.alternatives.size} conflicting versions · ${record.history.size} history versions")
            } }
            if (state.error != null) item { Text(state.error, color = MaterialTheme.colorScheme.error) }
            item { Action("Merge selected data on this phone", !state.busy && (profile || records || search)) {
                model.importWorkspace(preview.token, profile, pdf, records, search)
            } }
            item { TextButton(onClick = model::closeWorkspaceImport, enabled = !state.busy,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Keep current workspace") } }
        }
    }
}
