package com.saleh.careerfinder

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay

@Composable
internal fun JobsScreen(state: CareerUiState, model: CareerViewModel, add: () -> Unit, review: () -> Unit,
    profile: () -> Unit, connect: () -> Unit, section: Int, selectSection: (Int) -> Unit) {
    val l10n = rememberCareerStrings()
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp).selectableGroup(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            val savedCount = state.jobs.size + state.unbookmarkedRecords.size
            listOf("Discover", if (savedCount == 0) "Saved" else "Saved ($savedCount)").forEachIndexed { index, title ->
                FilterChip(section == index, { selectSection(index) }, label = { Text(l10n(title)) },
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp).testTag(if (index == 0) "jobs-discover-tab" else "jobs-saved-tab")
                        .semantics { role = Role.Tab })
            }
        }
        Box(Modifier.weight(1f)) {
            if (section == 0) DiscoveryScreen(state, model, profile, connect) { selectSection(1) }
            else SavedJobsScreen(state, model, add, review) { selectSection(0) }
        }
    }
}

@Composable
private fun DiscoveryScreen(workspace: CareerUiState, model: CareerViewModel, profile: () -> Unit, connect: () -> Unit, saved: () -> Unit) {
    val l10n = rememberCareerStrings()
    val state by model.discovery.state.collectAsStateWithLifecycle()
    val controller = model.discovery
    val context = LocalContext.current
    val keyboard = LocalSoftwareKeyboardController.current
    var chooseSources by remember { mutableStateOf(false) }
    val search: () -> Unit = { keyboard?.hide(); controller.search() }
    LazyColumn(Modifier.fillMaxSize().imePadding().testTag("discovery-list"), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        if (state.restoringSearch) item { LinearProgressIndicator(Modifier.fillMaxWidth()); Text(l10n("Opening your last search…")) }
        if (state.restoredSearch) item {
            Panel {
                Text(l10n(if (state.status == null) "Last search restored" else "Previous results"), style = MaterialTheme.typography.titleMedium)
                state.generatedAt?.let { checkedAt ->
                    Text(l10n("Last checked"), style = MaterialTheme.typography.labelSmall)
                    Text(l10n(l10n.dateTime(checkedAt)), style = MaterialTheme.typography.bodySmall)
                }
                Text(l10n(if (state.generatedAt == null) "Your keywords and filters are ready." else "Search again for current openings."), style = MaterialTheme.typography.bodyMedium)
                OutlinedButton(onClick = search, enabled = !state.loading && !state.restoringSearch, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Search again")) }
            }
        }
        item { Heading("Find your next role.", "Search selected public employer boards. No account or résumé upload is needed.") }
        if (state.searchStorageError != null) item {
            Panel {
                Text(l10n.message(state.searchStorageError.orEmpty()), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                OutlinedButton(onClick = controller::retrySavedSearch, enabled = !state.restoringSearch, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                    Text(l10n(if (state.searchRestoreBlocked) "Retry previous search" else "Retry saving search"))
                }
            }
        }
        item {
            DiscoveryInput("Role, skill or keyword", state.filters.query, { value -> controller.editFilters { it.copy(query = value) } }, search)
        }
        item {
            DiscoveryInput("Location (optional)", state.filters.location, { value -> controller.editFilters { it.copy(location = value) } }, search)
        }
        item {
            OutlinedButton(onClick = { chooseSources = true; controller.loadSources() }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Text(l10n(if (state.filters.sources.isEmpty()) "Choose employer boards · recommended" else "Employer boards · ${state.filters.sources.size} selected"))
            }
            CheckLine("Remote listings only", state.filters.remoteOnly, { checked -> controller.editFilters { it.copy(remoteOnly = checked) } })
            Text(l10n("Remote labels describe the posting. Check the employer’s location and work-authorization requirements."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        item {
            Action(if (state.loading) "Searching employer boards…" else "Search jobs", !state.loading && !state.restoringSearch, search)
            if (state.loading) {
                LinearProgressIndicator(Modifier.fillMaxWidth().padding(top = 12.dp))
                TextButton(onClick = controller::cancelSearch, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Cancel search")) }
            }
            Text(l10n("Only your search terms and filters are sent. Your profile and PDF are not used for discovery."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        item {
            LinkedInSearchAction(state.filters.query, state.filters.location) { openLink(context, it) }
        }
        if (state.error != null) item {
            var nowMillis by remember(state.retryAtMillis) { mutableLongStateOf(System.currentTimeMillis()) }
            LaunchedEffect(state.retryAtMillis) {
                val remaining = state.retryAtMillis - System.currentTimeMillis()
                if (remaining > 0) {
                    delay(remaining)
                    nowMillis = maxOf(System.currentTimeMillis(), state.retryAtMillis)
                }
            }
            val waiting = nowMillis < state.retryAtMillis
            Panel {
                Text(l10n.message(state.error.orEmpty()), color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                if (state.cursorInvalid) OutlinedButton(onClick = search, enabled = !state.loading, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Start a fresh search")) }
                else {
                    OutlinedButton(onClick = search, enabled = !state.loading && !waiting,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("discovery.retrySearch")) { Text(l10n("Search again")) }
                    if (waiting) Text(l10n.format("Try again after {0}.", listOf(l10n.dateTime(java.time.Instant.ofEpochMilli(state.retryAtMillis).toString()))),
                        style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        if (state.filtersChanged) item {
            StatusPill("Filters changed · search to update results", true)
            Text(l10n.format("Earlier search: {0}{1}", listOf(((state.displayedFilters?.query?.ifBlank { l10n("Any role") } ?: "")).toString(), (state.displayedFilters?.location?.takeIf(String::isNotBlank)?.let { " · " + it }.orEmpty()).toString())), style = MaterialTheme.typography.bodySmall)
        }
        if (state.sources.isNotEmpty()) item { DiscoverySourceSummary(state) }
        if (state.status != null && state.status != "unavailable") item {
            Text(l10n.format("Showing {0} of {1} matches within these boards", listOf((state.jobs.size).toString(), (state.totalMatches).toString())), style = MaterialTheme.typography.titleMedium)
            if (state.limited) Text(l10n("Some boards have more openings than this search can include. Narrow your search or open the original board."), style = MaterialTheme.typography.bodySmall)
        }
        if (state.status != null && state.jobs.isEmpty() && !state.loading && state.status != "unavailable") item {
            EmptyState("No roles match this search.", "Try a broader title, another location or different employer boards. This search does not cover every employer.",
                action = "Clear search filters", onClick = { controller.editFilters { DiscoveryFilters(sources = it.sources) } })
        }
        items(state.jobs, key = DiscoveredJob::id) { job ->
            DiscoveryJobCard(job, workspace.jobs.any { it.url == job.url }, workspace.busy, saved) {
                model.addOpportunity(job.url, job.title, job.company, job.location, job.country.orEmpty()) {}
            }
        }
        if (state.nextCursor != null && !state.cursorInvalid) item {
            OutlinedButton(onClick = { controller.search(more = true) }, enabled = !state.loading && !state.filtersChanged,
                modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text(l10n(if (state.loadingMore) "Loading more roles…" else "Load more roles")) }
        }
        if (state.status == null && !state.loading) item { GettingStartedPanel(workspace, profile, connect) }
        item {
            Text(l10n(state.notice.ifBlank { "Discovery covers selected public Lever and Greenhouse employer boards. You can add supported employer boards or save a job link from any other website." }),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            TextButton(onClick = { openLink(context, ServicePages.url(ServicePages.DEFAULT_ORIGIN, "privacy")) }, modifier = Modifier.heightIn(min = 48.dp)) { Text(l10n("Search privacy and data use")) }
        }
    }
    if (chooseSources) DiscoverySourcesDialog(state, controller) { chooseSources = false }
}

@Composable
internal fun LinkedInSearchAction(keywords: String, location: String, open: (String) -> Unit) {
    val l10n = rememberCareerStrings()
    val destination = runCatching { BoundaryPolicy.linkedinJobSearchURL(keywords, location) }.getOrNull()
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        OutlinedButton(onClick = { destination?.let(open) }, enabled = destination != null,
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Search LinkedIn")) }
        Text(l10n("Opens LinkedIn with your keywords and location. LinkedIn manages its own sign-in and applications; opening a search does not submit an application."),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (destination == null) Text(l10n("Shorten the keywords or location to open LinkedIn search."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
    }
}

@Composable
private fun DiscoveryInput(label: String, value: String, changed: (String) -> Unit, search: () -> Unit) {
    val l10n = rememberCareerStrings()
    OutlinedTextField(value, changed, label = { Text(l10n(label)) }, modifier = Modifier.fillMaxWidth(), singleLine = true,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { search() }),
        trailingIcon = if (value.isNotBlank()) { { IconButton(onClick = { changed("") }) { Icon(Icons.Default.Close, l10n("Clear ") + l10n(label)) } } } else null,
        shape = RoundedCornerShape(14.dp))
}

@Composable
private fun DiscoverySourceSummary(state: DiscoveryUiState) {
    val l10n = rememberCareerStrings()
    var expanded by remember(state.generatedAt, state.status) { mutableStateOf(state.status != "complete") }
    val context = LocalContext.current
    Panel {
        Text(l10n(when (state.status) { "partial" -> "Partial results from selected boards"; "unavailable" -> "Employer boards are unavailable"; else -> "Sources checked for this search" }),
            style = MaterialTheme.typography.titleMedium)
        if (state.status == "partial") Text(l10n("Some sources are unavailable, cached or limited. The details below explain the coverage."), style = MaterialTheme.typography.bodySmall)
        TextButton(onClick = { expanded = !expanded }, modifier = Modifier.heightIn(min = 48.dp)) { Text(l10n(if (expanded) "Hide source details" else "Show source details")) }
        if (expanded) state.sources.forEach { source ->
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(source.name, fontWeight = FontWeight.SemiBold)
                Text(l10n(when (source.status) { "fresh" -> "Fetched for this search"; "cached" -> "Recent cached results"; "stale" -> "Earlier cached results · refresh unavailable"; else -> "Could not be reached" }), style = MaterialTheme.typography.bodySmall)
                source.checkedAt?.let { Text(l10n.format("Last checked: {0}", listOf((l10n.dateTime(it)).toString())), style = MaterialTheme.typography.bodySmall) }
                source.error?.let { Text(l10n(it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                if (source.limited) Text(l10n("Only part of this board was included."), style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = { openLink(context, source.boardUrl) }, modifier = Modifier.heightIn(min = 48.dp)
                    .semantics { contentDescription = l10n.format("Open employer board for {0}", listOf((source.name).toString()))}) { Text(l10n("Open original employer board")) }
            }
        }
    }
}

@Composable
private fun DiscoveryJobCard(job: DiscoveredJob, saved: Boolean, busy: Boolean, openSaved: () -> Unit, save: () -> Unit) {
    val l10n = rememberCareerStrings()
    val context = LocalContext.current
    var expanded by rememberSaveable(job.id) { mutableStateOf(false) }
    Panel {
        Text(job.company, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
        Text(job.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() })
        Text(job.location.ifBlank { l10n("Location not specified") }, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (job.remote == true) StatusPill("Remote label · check location limits", false)
        if (job.stale) StatusPill("Earlier cached listing", true)
        Text(l10n.format("Source: {0} · {1}", listOf((job.sourceName).toString(), (job.provider.replaceFirstChar(Char::uppercase)).toString())), style = MaterialTheme.typography.bodySmall)
        Text(l10n.format("Checked {0}", listOf((l10n.dateTime(job.checkedAt)).toString())), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (job.summary.isNotBlank()) {
            Text(job.summary, maxLines = if (expanded) Int.MAX_VALUE else 3, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
            TextButton(onClick = { expanded = !expanded }, modifier = Modifier.heightIn(min = 48.dp)
                .semantics { contentDescription = l10n.format(if (expanded) "Hide details for {0}" else "Read details for {0}", listOf(job.title))}) { Text(l10n(if (expanded) "Show less" else "Read details")) }
        }
        OutlinedButton(onClick = { openLink(context, job.url) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
            .semantics { contentDescription = l10n.format("Open {0} at {1} on the employer’s site", listOf((job.title).toString(), (job.company).toString()))}) { Text(l10n("Open employer posting")) }
        if (saved) OutlinedButton(onClick = openSaved, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Saved · view in your shortlist")) }
        else Button(onClick = save, enabled = !busy, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)
            .semantics { contentDescription = l10n.format("Save {0} at {1}", listOf((job.title).toString(), (job.company).toString()))}) { Text(l10n("Save opportunity")) }
        Text(l10n("Saving does not apply or verify that the vacancy is still open."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun DiscoverySourcesDialog(state: DiscoveryUiState, controller: DiscoveryController, close: () -> Unit) {
    val l10n = rememberCareerStrings()
    var draft by remember { mutableStateOf(state.filters.sources.toSet()) }
    var touched by remember { mutableStateOf(state.filters.sources.isNotEmpty()) }
    var query by remember { mutableStateOf("") }
    var custom by remember { mutableStateOf("") }
    var customError by remember { mutableStateOf<String?>(null) }
    val limit = state.catalog?.maxSources ?: 4
    LaunchedEffect(state.catalog) { if (!touched) draft = state.catalog?.defaults?.toSet() ?: emptySet() }
    FullScreenForm("Choose employer boards", close) {
        Column(Modifier.fillMaxSize()) {
            LazyColumn(Modifier.weight(1f).testTag("discovery-sources"), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item { Text(l10n.format("Choose up to {0} public employer boards. This is a starting catalog, not a complete list of employers or professions.", listOf((limit).toString()))) }
                item { Text(l10n.format("{0} of {1} selected", listOf((draft.size).toString(), (limit).toString())), style = MaterialTheme.typography.labelLarge) }
                if (state.catalogLoading) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
                if (state.catalogError != null) item {
                    Text(l10n.message(state.catalogError), color = MaterialTheme.colorScheme.error)
                    OutlinedButton(onClick = controller::loadSources, modifier = Modifier.heightIn(min = 48.dp)) { Text(l10n("Retry employer catalog")) }
                }
                item { Field("Find an employer in the catalog", query, { query = it }) }
                val catalog = state.catalog?.sources.orEmpty()
                val filtered = catalog.filter { (it.name + " " + it.provider + " " + it.region).contains(query, true) }
                if (catalog.isNotEmpty() && filtered.isEmpty()) item { Text(l10n("No catalog employers match. You can add a supported board link below.")) }
                items(filtered, key = DiscoverySource::id) { source ->
                    Column {
                        CheckLine(source.name, source.id in draft, { selected -> touched = true; draft = if (selected) draft + source.id else draft - source.id },
                            source.id in draft || draft.size < limit, accessibilityLabel = "Search the public employer board for " + source.name)
                        Text(l10n.format("{0} · {1}", listOf((source.provider.replaceFirstChar(Char::uppercase)).toString(), (source.region).toString())), style = MaterialTheme.typography.bodySmall)
                    }
                }
                items(draft.filter { id -> catalog.none { it.id == id } }, key = { "custom-" + it }) { source ->
                    CheckLine(source, true, { touched = true; draft = draft - source }, accessibilityLabel = "Remove selected employer source " + source)
                }
                item {
                    HorizontalDivider()
                    Text(l10n("Add another employer"), style = MaterialTheme.typography.titleMedium)
                    Field("Public Lever or Greenhouse board link", custom, { custom = it; customError = null }, KeyboardType.Uri, error = customError)
                    Text(l10n("A supported employer board or individual posting URL can be used. Other job links can still be added in Saved."), style = MaterialTheme.typography.bodySmall)
                    OutlinedButton(onClick = {
                        val value = custom.trim()
                        if (!PublicDiscoveryService.supportedSource(value)) customError = "Use a public jobs.lever.co, jobs.eu.lever.co, boards.greenhouse.io or job-boards.greenhouse.io link."
                        else { touched = true; draft = draft + value; custom = ""; customError = null }
                    }, enabled = custom.isNotBlank() && draft.size < limit, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Add employer board")) }
                }
            }
            Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp)) {
                Action("Use selected boards", draft.isNotEmpty() && draft.size <= limit) { controller.editFilters { it.copy(sources = draft.toList()) }; close() }
                TextButton(onClick = { controller.editFilters { it.copy(sources = emptyList()) }; close() }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Use recommended boards")) }
            }
        }
    }
}
