package com.saleh.careerfinder

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

internal fun civilDateLabel(value: String): String = runCatching {
    LocalDate.parse(BoundaryPolicy.civilDate(value)).format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(Locale.getDefault()))
}.getOrElse { "Date not set" }

@Composable
internal fun ApplicationRecordSummary(record: ApplicationRecordBundle?, open: () -> Unit, enabled: Boolean, description: String) {
    val l10n = rememberCareerStrings()
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (record != null) {
            StatusPill(if (record.displayStage == ApplicationStage.APPLIED) "Applied elsewhere · self-reported" else l10n.format("{0} · your record", listOf(l10n(record.displayStage.label))), false)
            if (record.current.record.followUpDate.isNotEmpty() && record.displayStage != ApplicationStage.CLOSED) {
                Text(l10n(if (record.followUpDue()) "Follow-up due:" else "Follow up:"), style = MaterialTheme.typography.labelMedium)
                // A separate paragraph preserves the native date order in both RTL and LTR.
                Text(l10n(l10n.civilDate(record.current.record.followUpDate)),
                    modifier = Modifier.testTag("private-follow-up-date"), style = MaterialTheme.typography.bodyMedium,
                    color = if (record.followUpDue()) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
            }
            if (record.needsReview) Text(l10n("Saved versions need your review. All are kept."), color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall)
        }
        OutlinedButton(onClick = open, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).semantics { contentDescription = l10n(description )}) {
            Text(l10n(if (record?.needsReview == true) "Review application records" else if (record == null) "Track this application" else "Update application record"))
        }
        Text(l10n("Your record · on this phone. Separate from verified employer receipts."), style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
internal fun RecordVersionCard(version: ApplicationRecordVersion, title: String, useLabel: String?, enabled: Boolean, choose: () -> Unit) {
    val l10n = rememberCareerStrings()
    var fullNote by remember(version.id) { mutableStateOf(false) }
    Panel {
        Text(l10n(title), style = MaterialTheme.typography.titleMedium)
        Text(l10n(version.record.stage.label) + if (version.record.appliedElsewhere) l10n(" · marked as applied") else "")
        if (version.record.appliedDate.isNotEmpty()) { Text(l10n("Applied date"), style = MaterialTheme.typography.labelMedium); Text(l10n(l10n.civilDate(version.record.appliedDate))) }
        if (version.record.followUpDate.isNotEmpty()) { Text(l10n("Follow-up date"), style = MaterialTheme.typography.labelMedium); Text(l10n(l10n.civilDate(version.record.followUpDate))) }
        // Keep the rendered paragraph and its accessibility layout at the same
        // width, including short multiline notes in an RTL interface.
        Text(version.record.note.ifBlank { l10n("No private note") }, Modifier.fillMaxWidth(),
            maxLines = if (fullNote) Int.MAX_VALUE else 4, style = MaterialTheme.typography.bodyMedium)
        if (version.record.note.isNotBlank()) TextButton(onClick = { fullNote = !fullNote }, modifier = Modifier.heightIn(min = 48.dp)) {
            Text(l10n(if (fullNote) "Show less" else "Read full note"))
        }
        Text(l10n("Version saved"), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(l10n(l10n.dateTime(version.savedAt)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (useLabel != null) OutlinedButton(onClick = choose, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n(useLabel)) }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun ApplicationRecordEditor(state: CareerUiState, model: CareerViewModel) {
    val l10n = rememberCareerStrings()
    val editor = state.applicationRecordEditor ?: return
    val record = state.applicationRecords[editor.identity]
    var dateField by remember(editor.token) { mutableStateOf<String?>(null) }
    var showHistory by remember(editor.token) { mutableStateOf(false) }
    var noteLimitSpoken by remember(editor.token) { mutableStateOf(false) }
    val change: ((ApplicationRecordDraft) -> ApplicationRecordDraft) -> Unit = { model.editApplicationRecordDraft(it, editor.token) }
    if (!editor.quickCorrection) FullScreenForm("Application record", { model.closeApplicationRecord(editor.token) }) {
        Column(Modifier.fillMaxSize()) {
            LazyColumn(Modifier.weight(1f).imePadding().testTag("application-record-editor"), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                item {
                    Text(editor.job.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                    Text(editor.job.company, color = MaterialTheme.colorScheme.primary)
                    Text(l10n("Your record · on this phone. Dates and notes stay private. This does not create a verified employer receipt."),
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (editor.restoredOlderRevision) item {
                    Panel {
                        Text(l10n("An unfinished edit was recovered"), style = MaterialTheme.typography.titleMedium)
                        Text(l10n("The saved record changed after this draft began. Compare the saved details before keeping your edits. No status change has been applied."),
                            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                        if (record != null) RecordVersionCard(record.current, "Current saved details", null, false) {}
                        Action("Keep draft against latest record", !state.busy) { model.rebaseApplicationRecordDraft(editor.token) }
                    }
                }
                if (record?.needsReview == true) {
                    item {
                        Column(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
                            Heading("Choose which details to keep.", "All versions are saved. Choosing notes or dates does not mark an earlier application as not applied.")
                        }
                    }
                    item { RecordVersionCard(record.current, "Current record", "Keep current details", !state.busy) { model.chooseApplicationRecordVersion(record.current.id, editor.token) } }
                    items(record.alternatives, key = { it.id }) { alternative ->
                        RecordVersionCard(alternative, "Copied record", "Use copied details", !state.busy) { model.chooseApplicationRecordVersion(alternative.id, editor.token) }
                    }
                } else {
                    item {
                        Text(l10n("Stage"), style = MaterialTheme.typography.labelLarge)
                        FlowRow(Modifier.fillMaxWidth().selectableGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            ApplicationStage.entries.forEach { stage ->
                                FilterChip(editor.draft.stage == stage, { change { it.copy(stage = stage) } }, label = { Text(l10n(stage.label)) }, enabled = !state.busy,
                                    modifier = Modifier.heightIn(min = 48.dp).semantics { role = Role.RadioButton; contentDescription = l10n.format("Application stage: {0}", listOf(l10n(stage.label)))})
                            }
                        }
                        if (editor.draft.stage == ApplicationStage.CLOSED && record?.appliedElsewhere == true)
                            Text(l10n("Closing keeps your earlier application on record."), style = MaterialTheme.typography.bodySmall)
                        if (editor.draft.stage == ApplicationStage.SAVED && record?.appliedElsewhere == true)
                            Text(l10n("Saving this change will ask you to confirm that the job should be marked as not applied."), style = MaterialTheme.typography.bodySmall)
                    }
                    item { RecordDateField("Applied date (optional)", editor.draft.appliedDate, !state.busy,
                        { dateField = "applied" }, { change { it.copy(appliedDate = "") } }) }
                    item { RecordDateField("Follow-up date (optional)", editor.draft.followUpDate, !state.busy,
                        { dateField = "follow-up" }, { change { it.copy(followUpDate = "") } }) }
                    item {
                        Field("Private note (optional)", editor.draft.note, { text ->
                            val bounded = boundedApplicationNote(text)
                            val cut = applicationNoteLength(text) > applicationNoteLength(bounded)
                            if (cut) noteLimitSpoken = true
                            else if (applicationNoteLength(bounded) < 2_000) noteLimitSpoken = false
                            change { it.copy(note = bounded) }
                        }, singleLine = false, enabled = !state.busy)
                        Text(l10n.format("{0} of 2,000 characters", listOf((applicationNoteLength(editor.draft.note)).toString())), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (noteLimitSpoken) Text(l10n("Keep this private note within 2,000 characters."), color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                    }
                    if (record?.history?.isNotEmpty() == true) {
                        item { TextButton(onClick = { showHistory = !showHistory }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                            Text(l10n(if (showHistory) "Hide saved versions" else "View saved versions (${record.history.size})"))
                        } }
                        if (showHistory) item { Text(l10n("Using earlier details keeps your current applied or not-applied choice. To change it, choose a stage and save."), style = MaterialTheme.typography.bodySmall) }
                        if (showHistory) items(record.history, key = { "history-" + it.id }) { version ->
                            RecordVersionCard(version, "Earlier version", "Use these details", !state.busy) { model.chooseApplicationRecordVersion(version.id, editor.token) }
                        }
                    }
                }
            }
            Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (state.error != null) Text(l10n.message(state.error), color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                Action("Save record on this phone", !state.busy && record?.needsReview != true && !state.storageBlocked && !editor.restoredOlderRevision) { model.saveApplicationRecord(expectedToken = editor.token) }
                TextButton(onClick = { model.closeApplicationRecord(editor.token) }, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Close record")) }
            }
        }
    }
    if (editor.confirmClose) AlertDialog(onDismissRequest = { model.continueApplicationRecord(editor.token) },
        title = { Text(l10n("Keep your unfinished record?")) },
        text = { Text(l10n("Keep this edit to continue later, or discard only these unfinished changes. Saved notes, history and application status stay as they are."), Modifier.verticalScroll(rememberScrollState())) },
        confirmButton = { TextButton(onClick = { model.keepApplicationRecordDraft(editor.token) }, enabled = !state.busy,
            modifier = Modifier.heightIn(min = 48.dp)) { Text(l10n("Keep draft")) } },
        dismissButton = { Column {
            TextButton(onClick = { model.continueApplicationRecord(editor.token) }, enabled = !state.busy,
                modifier = Modifier.heightIn(min = 48.dp)) { Text(l10n("Keep editing")) }
            TextButton(onClick = { model.discardApplicationRecordDraft(editor.token) }, enabled = !state.busy,
                modifier = Modifier.heightIn(min = 48.dp)) { Text(l10n("Discard unfinished changes")) }
        } })
    if (dateField != null && !editor.quickCorrection) {
        val current = if (dateField == "applied") editor.draft.appliedDate else editor.draft.followUpDate
        val selected = runCatching { LocalDate.parse(current) }.getOrElse { LocalDate.now() }
        val picker = rememberDatePickerState(initialSelectedDateMillis = selected.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
            yearRange = 1..9999,
            initialDisplayMode = if (LocalDensity.current.fontScale >= 1.5f) DisplayMode.Input else DisplayMode.Picker)
        DatePickerDialog(onDismissRequest = { dateField = null },
            confirmButton = { TextButton(onClick = {
                picker.selectedDateMillis?.let { millis ->
                    val date = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString()
                    if (dateField == "applied") change { it.copy(appliedDate = date) } else change { it.copy(followUpDate = date) }
                }
                dateField = null
            }, enabled = picker.selectedDateMillis != null) { Text(l10n("Use date")) } },
            dismissButton = { TextButton(onClick = { dateField = null }) { Text(l10n("Cancel")) } }) {
            CareerDisplayContent {
                DatePicker(state = picker, title = { Text(l10n(if (dateField == "applied") "Applied date" else "Follow-up date"), Modifier.padding(24.dp)) }, headline = null, showModeToggle = true)
            }
        }
    }
    if (editor.pendingNotApplied != null) AlertDialog(onDismissRequest = { model.keepApplicationRecord(editor.token) },
        title = { Text(l10n("Mark as not applied?")) },
        text = { Text(l10n("This changes only your record on this phone. Sent applications and confirmed receipts stay unchanged. The job may be included in a new Auto Apply review. Previous record versions are kept."), Modifier.verticalScroll(rememberScrollState())) },
        confirmButton = { TextButton(onClick = { model.saveApplicationRecord(true, editor.token) }, enabled = !state.busy,
            modifier = Modifier.heightIn(min = 48.dp)) { Text(l10n("Mark not applied")) } },
        dismissButton = { TextButton(onClick = { model.keepApplicationRecord(editor.token) }, enabled = !state.busy,
            modifier = Modifier.heightIn(min = 48.dp)) { Text(l10n("Keep application record")) } })
}

@Composable
private fun RecordDateField(label: String, date: String, enabled: Boolean, choose: () -> Unit, clear: () -> Unit) {
    val l10n = rememberCareerStrings()
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(l10n(label), style = MaterialTheme.typography.labelLarge)
        OutlinedButton(onClick = choose, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
            .semantics {
                contentDescription = l10n.format("Choose {0}", listOf(l10n(label)))
                if (date.isNotEmpty()) stateDescription = l10n(l10n.civilDate(date))
            }) { Text(l10n(if (date.isEmpty()) "Choose date" else l10n.civilDate(date))) }
        if (date.isNotEmpty()) TextButton(onClick = clear, enabled = enabled, modifier = Modifier.heightIn(min = 48.dp)
            .semantics { contentDescription = l10n.format("Clear {0}", listOf(l10n(label)))}) { Text(l10n("Clear date")) }
    }
}
