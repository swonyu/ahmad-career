package com.saleh.careerfinder

import com.saleh.careerfinder.HistoricalDisplayText as Text

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp

@Stable
internal class SavedComparisonSelection(val owner: SavedComparisonOwner) {
    var choosing by mutableStateOf(false)
    var selected by mutableStateOf<List<SavedComparisonKey>>(emptyList())
    var presented by mutableStateOf<List<SavedComparisonKey>?>(null)

    fun keys(state: CareerUiState) = if (owner == SavedComparisonPolicy.owner(state))
        SavedComparisonPolicy.available(state, selected) else emptyList()

    fun toggle(state: CareerUiState, key: SavedComparisonKey) {
        if (owner == SavedComparisonPolicy.owner(state) && !state.busy)
            selected = SavedComparisonPolicy.toggle(state, selected, key)
    }

    fun show(state: CareerUiState) {
        if (owner != SavedComparisonPolicy.owner(state) || state.busy) return
        val current = keys(state)
        if (SavedComparisonPolicy.pair(state, current) != null) presented = current
    }

    fun leave() { choosing = false; selected = emptyList(); presented = null }
}

@Composable
internal fun rememberSavedComparisonSelection(state: CareerUiState): SavedComparisonSelection {
    val owner = SavedComparisonPolicy.owner(state)
    val selection = remember(owner) { SavedComparisonSelection(owner) }
    LaunchedEffect(state.jobs, state.applicationRecords, state.loaded, state.storageBlocked) {
        selection.selected = selection.keys(state)
        if (!state.loaded || state.storageBlocked) selection.leave()
    }
    return selection
}

/** The compact selection toolbar stays reachable while the existing Saved list scrolls. */
@Composable
internal fun SavedComparisonBar(state: CareerUiState, selection: SavedComparisonSelection, current: () -> CareerUiState) {
    val l10n = rememberCareerStrings()
    val keys = selection.keys(state)
    Surface(tonalElevation = 2.dp, modifier = Modifier.fillMaxWidth().testTag("saved-comparison-toolbar")) {
        Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(l10n.format("{0} of 2 selected", listOf(keys.size.toString())),
                    Modifier.weight(1f).testTag("saved-comparison-count").semantics { liveRegion = LiveRegionMode.Polite },
                    style = MaterialTheme.typography.titleSmall)
                IconButton(onClick = selection::leave, modifier = Modifier.testTag("saved-comparison-exit")) {
                    Icon(Icons.Default.Close, l10n("Back to Saved"))
                }
            }
            if (keys.isEmpty()) Text(l10n("Choose two saved openings."), style = MaterialTheme.typography.bodySmall)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedButton(onClick = { selection.selected = emptyList() }, enabled = keys.isNotEmpty(),
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp).testTag("saved-comparison-clear")) {
                    Text(l10n("Clear selection"))
                }
                Button(onClick = { selection.show(current()) }, enabled = keys.size == 2 && !state.busy,
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp).testTag("saved-comparison-open")) {
                    Text(l10n("Compare two"))
                }
            }
        }
    }
}

@Composable
internal fun SavedComparisonToggle(state: CareerUiState, selection: SavedComparisonSelection, job: Opportunity,
    recordOnly: Boolean, current: () -> CareerUiState) {
    if (!selection.choosing) return
    val l10n = rememberCareerStrings()
    val key = SavedComparisonPolicy.key(state, job, recordOnly) ?: return
    val selected = selection.keys(state)
    val checked = key in selected
    val enabled = !state.busy && (checked || selected.size < 2 && selected.none { it.identity == key.identity })
    val location = listOf(job.location, job.country).filter(String::isNotBlank).joinToString(" · ")
        .ifBlank { l10n("Location not recorded") }
    val description = l10n.format("Compare {0} at {1} in {2}", listOf(job.title, job.company, location))
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp)
        .toggleable(value = checked, enabled = enabled, role = Role.Checkbox,
            onValueChange = { selection.toggle(current(), key) })
        .testTag("saved-compare-toggle-" + key.rowId)
        .semantics(mergeDescendants = true) { contentDescription = description },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Checkbox(checked = checked, onCheckedChange = null, enabled = enabled)
        Text(l10n("Compare"), style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
private fun ComparisonFact(label: String, value: String, tag: String, authored: Boolean = false) {
    val l10n = rememberCareerStrings()
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(l10n(label), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, modifier = Modifier.fillMaxWidth().testTag(tag),
            style = MaterialTheme.typography.bodyLarge.copy(textDirection = if (authored) TextDirection.Content else TextDirection.Unspecified))
    }
}

@Composable
internal fun SavedComparisonDialog(state: CareerUiState, keys: List<SavedComparisonKey>, current: () -> CareerUiState, close: () -> Unit) {
    val l10n = rememberCareerStrings()
    val context = LocalContext.current
    val pair = SavedComparisonPolicy.pair(state, keys)
    FullScreenForm("Compare two openings", close) {
        LazyColumn(Modifier.fillMaxSize().testTag("saved-comparison-list"), contentPadding = PaddingValues(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)) {
            if (pair == null) item {
                Text(l10n("A selected opening is no longer in Saved. Choose the two openings again."),
                    Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("saved-comparison-unavailable"))
            } else {
                item { Text(l10n("Stages and follow-up dates are your own records."), style = MaterialTheme.typography.bodySmall) }
                pair.forEachIndexed { index, entry ->
                    item(key = "comparison-" + index) {
                        Panel(Modifier.testTag("saved-comparison-card-" + index)) {
                            Text(entry.job.company, style = MaterialTheme.typography.labelLarge.copy(textDirection = TextDirection.Content))
                            Text(entry.job.title, Modifier.testTag("saved-comparison-title-" + index).semantics { heading() },
                                style = MaterialTheme.typography.titleLarge.copy(textDirection = TextDirection.Content))
                            if (entry.recordOnly) Text(l10n("Application record · bookmark removed"), style = MaterialTheme.typography.bodySmall)
                            val location = listOf(entry.job.location, entry.job.country).filter(String::isNotBlank).joinToString(" · ")
                            ComparisonFact("Location", location.ifBlank { l10n("Location not recorded") },
                                "saved-comparison-location-" + index, true)
                            ComparisonFact("Source", entry.job.sourceName?.takeIf(String::isNotBlank) ?: l10n("Not recorded"),
                                "saved-comparison-source-" + index, true)
                            ComparisonFact("Last checked", entry.job.checkedAt?.let(l10n::dateTime) ?: l10n("Not recorded"),
                                "saved-comparison-checked-" + index)
                            if (entry.conflictingRecords) Text(l10n("Record versions need review."),
                                Modifier.testTag("saved-comparison-conflict-" + index), color = MaterialTheme.colorScheme.error)
                            ComparisonFact("Stage", entry.stage?.let { l10n(it.label) } ?: l10n("Not recorded"),
                                "saved-comparison-stage-" + index)
                            ComparisonFact("Follow-up date", when {
                                entry.conflictingRecords -> l10n("Not recorded")
                                entry.followUpDate != null -> l10n.civilDate(entry.followUpDate)
                                else -> l10n("No follow-up scheduled")
                            }, "saved-comparison-follow-up-" + index)
                            Text(entry.job.url, Modifier.fillMaxWidth().testTag("saved-comparison-url-" + index),
                                style = MaterialTheme.typography.bodySmall.copy(textDirection = TextDirection.Ltr))
                            OutlinedButton(onClick = {
                                // Resolve this same owned row again before an explicit external-link action.
                                SavedComparisonPolicy.pair(current(), keys)?.getOrNull(index)?.let { live ->
                                    if (live.key == entry.key) openLink(context, live.job.url)
                                }
                            }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("saved-comparison-link-" + index)) {
                                Text(l10n.format("Open job: {0} in {1}", listOf(entry.job.title,
                                    location.ifBlank { l10n("Location not recorded") })))
                            }
                        }
                    }
                }
            }
            item {
                OutlinedButton(onClick = close, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("saved-comparison-back")) {
                    Text(l10n("Back to Saved"))
                }
            }
        }
    }
}
