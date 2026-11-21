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
import androidx.compose.foundation.text.selection.SelectionContainer
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
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDirection
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
    var profileRolesExpanded by rememberSaveable(workspace.privateScope) { mutableStateOf(false) }
    val profileRoleShortcuts = workspace.profile.targetRoles.parts()
    val search: () -> Unit = { keyboard?.hide(); controller.search() }
    val outcomeStatus = when {
        state.status != null -> state.status
        state.error != null && state.lastAttemptedFilters != null -> "unavailable"
        else -> null
    }
    val showEmpty = !state.loading && state.jobs.isEmpty() && outcomeStatus != null
    val showGettingStarted = state.status == null && !state.loading && state.lastAttemptedFilters == null
    val fallbackBoards = if (state.sources.isEmpty() && state.error != null && state.status == null)
        recoveryBoards(state.lastAttemptedFilters?.sources.orEmpty()) else emptyList()
    LazyColumn(Modifier.fillMaxSize().imePadding().testTag("discovery-list"), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        if (state.restoringSearch) item {
            LinearProgressIndicator(Modifier.fillMaxWidth())
            Text(l10n("Opening your last search…"), modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
        }
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
        item { Heading("Search jobs", "Search selected public employer boards. No account or résumé upload is needed.") }
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
            DiscoveryInput("Job title or keyword", state.filters.query, { value -> controller.editFilters { it.copy(query = value) } }, search)
            Text(l10n("Searches titles, employers and available summaries."), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (profileRoleShortcuts.isNotEmpty()) item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { keyboard?.hide(); profileRolesExpanded = !profileRolesExpanded },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("discovery.profileRoles")
                        .semantics { stateDescription = l10n(if (profileRolesExpanded) "Expanded" else "Collapsed") }) {
                    Text(l10n("Choose a job title from your saved profile"))
                }
                if (profileRolesExpanded) {
                    profileRoleShortcuts.forEachIndexed { index, role ->
                        OutlinedButton(onClick = { keyboard?.hide(); controller.editFilters { it.copy(query = role) } },
                            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("discovery.profileRole." + index)) {
                            Text(role)
                        }
                    }
                    Text(l10n("This fills the job title only. Choose Search jobs to run the search."),
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
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
        val catalogIssue = state.catalogError
        if (catalogIssue != null && !chooseSources) item {
            Text(l10n.message(catalogIssue), color = MaterialTheme.colorScheme.error,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("discovery.catalogError"))
            OutlinedButton(onClick = controller::loadSources, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("discovery.retryCatalog")) {
                Text(l10n("Retry employer catalog"))
            }
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
                Text(l10n.message(state.error.orEmpty()), color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("discovery.error"))
                if (state.canRetrySubmittedSearch) OutlinedButton(onClick = controller::retrySubmittedSearch, enabled = !state.loading && !waiting,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("discovery-retry")) { Text(l10n("Retry this search")) }
                if (state.cursorInvalid) OutlinedButton(onClick = search, enabled = !state.loading && !waiting, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Start a fresh search")) }
                else if (!state.canRetrySubmittedSearch) {
                    OutlinedButton(onClick = search, enabled = !state.loading && !waiting,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("discovery.retrySearch")) { Text(l10n("Search again")) }
                }
                if (waiting) Text(l10n.format("Try again after {0}.", listOf(l10n.dateTime(java.time.Instant.ofEpochMilli(state.retryAtMillis).toString()))),
                    style = MaterialTheme.typography.bodySmall)
                fallbackBoards.forEach { identity ->
                    EmployerBoardLink(identity, "Open the employer board", l10n.format("Open employer board for {0}", listOf(identity.board)))
                }
            }
        }
        if (state.canRetrySubmittedSearch && state.error == null) item {
            OutlinedButton(onClick = controller::retrySubmittedSearch, enabled = !state.loading,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("discovery-retry")) { Text(l10n("Retry this search")) }
        }
        if (state.filtersChanged) item {
            StatusPill("Filters changed · search to update results", true)
            Text(l10n.format("Earlier search: {0}{1}", listOf(((state.displayedFilters?.query?.ifBlank { l10n("Any role") } ?: "")).toString(), (state.displayedFilters?.location?.takeIf(String::isNotBlank)?.let { " · " + it }.orEmpty()).toString())), style = MaterialTheme.typography.bodySmall)
        }
        if (state.sources.isNotEmpty()) item { DiscoverySourceSummary(state) }
        if (state.hasSearchComparison) item {
            Panel(Modifier.testTag("discovery.newComparison")) {
                Text(l10n("New since my last search"), style = MaterialTheme.typography.titleMedium)
                Text(l10n.format(if (state.newJobCount == 1) "{0} role new to this search" else "{0} roles new to this search",
                    listOf(state.newJobCount.toString())), style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.testTag("discovery.newCount").semantics { liveRegion = LiveRegionMode.Polite })
                Text(l10n("First seen in this search, based on history saved on this phone."), style = MaterialTheme.typography.bodySmall)
                CheckLine("New only", state.showNewOnly, controller::setShowNewOnly)
                if (state.newResult?.coverageLimited == true) Text(
                    l10n("This count covers the boards we could compare. Other results may need a complete check first."),
                    style = MaterialTheme.typography.bodySmall)
            }
        }
        if (state.newResult?.baselineReset == true) item {
            Text(l10n("Older search history reached this phone’s limit. A fresh baseline is kept without marking old openings as new."),
                style = MaterialTheme.typography.bodySmall, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
        }
        if (state.status != null && state.status != "unavailable") item {
            Text(if (state.showNewOnly) l10n.format("{0} of {1} shown", listOf(state.visibleJobs.size.toString(), state.jobs.size.toString()))
                else l10n.format("Showing {0} of {1} matches within these boards", listOf((state.jobs.size).toString(), (state.totalMatches).toString())),
                style = MaterialTheme.typography.titleMedium, modifier = Modifier.testTag("discovery.resultCount"))
            if (state.limited) Text(l10n("Some boards have more openings than this search can include. Narrow your search or open the original board."), style = MaterialTheme.typography.bodySmall)
        }
        if (showEmpty) item {
            EmptyState(DiscoveryPresentation.emptyTitle(outcomeStatus), DiscoveryPresentation.emptyDetail(outcomeStatus))
        }
        if (state.showNewOnly && state.jobs.isNotEmpty() && state.visibleJobs.isEmpty()) item {
            Panel {
                Text(l10n("No openings are new in the results compared."), style = MaterialTheme.typography.bodyMedium)
                TextButton(onClick = { controller.setShowNewOnly(false) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                    Text(l10n("Show all results"))
                }
            }
        }
        items(state.visibleJobs, key = DiscoveredJob::id) { job ->
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (job.id in state.newJobIds) StatusPill("New to this search", false, Modifier.testTag("discovery.new." + job.id))
                DiscoveryJobCard(job, workspace.jobs.any { it.url == job.url }, workspace.busy, saved) {
                    model.addOpportunity(job.url, job.title, job.company, job.location, job.country.orEmpty()) {}
                }
            }
        }
        if (state.nextCursor != null && !state.cursorInvalid) item {
            OutlinedButton(onClick = { controller.search(more = true) }, enabled = !state.loading && !state.filtersChanged,
                modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text(l10n(if (state.loadingMore) "Loading more roles…" else "Load more roles")) }
        }
        if (showGettingStarted) item { GettingStartedPanel(workspace, profile, connect) }
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
        if (destination == null) Text(l10n("Shorten the keywords or location to open LinkedIn search."),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("discovery.linkedinIssue"))
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
    Panel {
        Text(l10n(when (state.status) { "partial" -> "Partial results from selected boards"; "unavailable" -> "Employer boards are unavailable"; else -> "Sources checked for this search" }),
            style = MaterialTheme.typography.titleMedium)
        if (state.status == "partial") Text(l10n("Some sources are unavailable, cached or limited. The details below explain the coverage."), style = MaterialTheme.typography.bodySmall)
        TextButton(onClick = { expanded = !expanded }, modifier = Modifier.heightIn(min = 48.dp)) { Text(l10n(if (expanded) "Hide source details" else "Show source details")) }
        if (expanded) state.sources.forEach { source ->
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(source.name, fontWeight = FontWeight.SemiBold)
                Text(l10n(DiscoveryPresentation.sourceAvailabilityKey(source.status, state.restoredSearch)), style = MaterialTheme.typography.bodySmall)
                source.checkedAt?.let { Text(l10n.format("Last checked: {0}", listOf((l10n.dateTime(it)).toString())), style = MaterialTheme.typography.bodySmall) }
                source.error?.let { Text(l10n(it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                if (source.limited) Text(l10n("Only part of this board was included."), style = MaterialTheme.typography.bodySmall)
                PublicDiscoveryService.canonicalBoard(source.boardUrl)?.let { identity ->
                    EmployerBoardLink(identity, "Open original employer board", l10n.format("Open employer board for {0}", listOf(source.name)))
                }
            }
        }
    }
}

private fun recoveryBoards(sources: List<String>): List<DiscoveryBoardIdentity> {
    val seen = HashSet<String>()
    val result = ArrayList<DiscoveryBoardIdentity>()
    for (raw in sources) {
        val identity = PublicDiscoveryService.canonicalBoard(raw) ?: continue
        if (seen.add(identity.id)) result.add(identity)
    }
    return result
}

@Composable
private fun EmployerBoardLink(identity: DiscoveryBoardIdentity, label: String, description: String) {
    val l10n = rememberCareerStrings()
    val context = LocalContext.current
    TextButton(onClick = { openLink(context, identity.boardUrl) }, modifier = Modifier.heightIn(min = 48.dp)
        .testTag("discovery-board-" + identity.id)
        .semantics { contentDescription = description }) { Text(l10n(label)) }
    SelectionContainer {
        Text(identity.boardUrl, style = MaterialTheme.typography.bodySmall.merge(TextStyle(textDirection = TextDirection.Ltr)))
    }
    Text(l10n("Opening this public board in your browser does not submit an application or confirm the listings are still open."),
        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
                val catalogIssue = state.catalogError
                if (catalogIssue != null) item {
                    Text(l10n.message(catalogIssue), color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("discovery.catalogError"))
                    OutlinedButton(onClick = controller::loadSources, modifier = Modifier.heightIn(min = 48.dp).testTag("discovery.retryCatalog")) { Text(l10n("Retry employer catalog")) }
                }
                item { Field("Find an employer in the catalog", query, { query = it }) }
                val catalog = state.catalog?.sources.orEmpty()
                val filtered = catalog.filter { (it.name + " " + it.provider + " " + it.region).contains(query, true) }
                if (catalog.isNotEmpty() && filtered.isEmpty()) item { Text(l10n("No catalog employers match. You can add a supported board link below.")) }
                items(filtered, key = DiscoverySource::id) { source ->
                    val selected = draft.any { PublicDiscoveryService.sameBoard(it, source.id) }
                    Column {
                        CheckLine(source.name, selected, { checked ->
                            touched = true
                            draft = if (checked) draft.filterNot { PublicDiscoveryService.sameBoard(it, source.id) }.toSet() + source.id
                                else draft.filterNot { PublicDiscoveryService.sameBoard(it, source.id) }.toSet()
                        }, selected || draft.size < limit, accessibilityLabel = "Search the public employer board for " + source.name)
                        Text(l10n.format("{0} · {1}", listOf((source.provider.replaceFirstChar(Char::uppercase)).toString(), (source.region).toString())), style = MaterialTheme.typography.bodySmall)
                    }
                }
                items(draft.filter { id -> catalog.none { PublicDiscoveryService.sameBoard(it.id, id) } }.toList(), key = { "custom-" + it }) { source ->
                    CheckLine(PublicDiscoveryService.canonicalBoard(source)?.boardUrl ?: source, true, {
                        touched = true
                        draft = draft.filterNot { PublicDiscoveryService.sameBoard(it, source) }.toSet()
                    }, accessibilityLabel = "Remove selected employer source " + source)
                }
                item {
                    HorizontalDivider()
                    Text(l10n("Add another employer"), style = MaterialTheme.typography.titleMedium)
                    Field("Public Lever or Greenhouse board link", custom, { custom = it; customError = null }, KeyboardType.Uri)
                    Text(l10n("A supported employer board or individual posting URL can be used. Other job links can still be added in Saved."), style = MaterialTheme.typography.bodySmall)
                    OutlinedButton(onClick = {
                        val identity = PublicDiscoveryService.canonicalBoard(custom.trim())
                        if (identity == null) {
                            customError = "Use a supported employer board or its public board URL."
                            return@OutlinedButton
                        }
                        when {
                            draft.any { PublicDiscoveryService.sameBoard(it, identity.id) } -> customError = "Choose each employer board only once."
                            draft.size >= limit -> customError = "Choose up to four public Lever or Greenhouse employer boards."
                            else -> { touched = true; draft = draft + identity.id; custom = ""; customError = null }
                        }
                    }, enabled = custom.isNotBlank(), modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Add employer board")) }
                    customError?.let { issue ->
                        Text(l10n.message(issue), color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("discovery.boardIssue"))
                    }
                }
            }
            Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp)) {
                Action("Use selected boards", draft.isNotEmpty() && draft.size <= limit) {
                    controller.editFilters { it.copy(sources = PublicDiscoveryService.canonicalSources(draft.toList())) }
                    close()
                }
                TextButton(onClick = { controller.editFilters { it.copy(sources = emptyList()) }; close() }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Use recommended boards")) }
            }
        }
    }
}
