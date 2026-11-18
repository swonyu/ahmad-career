package com.saleh.careerfinder

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import android.os.PersistableBundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat
import androidx.core.net.toUri
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

class MainActivity : ComponentActivity() {
    private val model: CareerViewModel by viewModels()
    override fun onCreate(savedInstanceState: Bundle?) {
        synchronizePlatformLanguage(this)
        setTheme(when (readAppearancePreference(this)) {
            AppearancePreference.SYSTEM -> R.style.Theme_CareerFinder
            AppearancePreference.LIGHT -> R.style.CareerFinderLightTheme
            AppearancePreference.DARK -> R.style.CareerFinderDarkTheme
        })
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { CareerLanguage { CareerTheme { CareerApp(model) } } }
    }
    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        synchronizePlatformLanguage(this)
    }
    override fun onStart() { super.onStart(); model.setForeground(true) }
    override fun onStop() { model.setForeground(false); super.onStop() }
}

private data class Destination(val key: String, val title: String, val icon: ImageVector)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PhoneNavigation(tabs: List<Destination>, selectedIndex: Int, select: (Int) -> Unit) {
    val l10n = rememberCareerStrings()
    BoxWithConstraints {
        if (maxWidth < 420.dp && LocalDensity.current.fontScale >= 1.5f) {
            val labels = tabs.map { l10n(it.title) }
            val fontScale = LocalDensity.current.fontScale
            val direction = LocalLayoutDirection.current
            Surface(color = MaterialTheme.colorScheme.surface) {
                // Recreate only the tab row's scroll position after display geometry changes.
                // Material's row then brings the still-selected destination into view.
                key(maxWidth, fontScale, direction, labels) {
                    PrimaryScrollableTabRow(selectedTabIndex = selectedIndex,
                        modifier = Modifier.navigationBarsPadding().testTag("phone-navigation-scroll"),
                        containerColor = MaterialTheme.colorScheme.surface,
                        contentColor = MaterialTheme.colorScheme.primary, edgePadding = 12.dp) {
                        tabs.forEachIndexed { index, item ->
                            Tab(selected = selectedIndex == index, onClick = { select(index) },
                                modifier = Modifier.heightIn(min = 56.dp).testTag("navigation-" + item.key),
                                selectedContentColor = MaterialTheme.colorScheme.primary,
                                unselectedContentColor = MaterialTheme.colorScheme.onSurface) {
                                Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                                    verticalAlignment = Alignment.CenterVertically) {
                                    Icon(item.icon, contentDescription = null, modifier = Modifier.size(20.dp))
                                    Spacer(Modifier.width(8.dp))
                                    Text(labels[index], style = MaterialTheme.typography.labelLarge, maxLines = 1)
                                }
                            }
                        }
                    }
                }
            }
        } else NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
            tabs.forEachIndexed { index, item ->
                NavigationBarItem(selected = selectedIndex == index, onClick = { select(index) }, modifier = Modifier.testTag("navigation-" + item.key),
                    icon = { Icon(item.icon, contentDescription = null) }, label = { Text(l10n(item.title)) })
            }
        }
    }
}

@Composable
fun CareerApp(model: CareerViewModel) {
    val l10n = rememberCareerStrings()
    val state by model.state.collectAsStateWithLifecycle()
    val focus = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var jobsSection by rememberSaveable { mutableIntStateOf(0) }
    var showConnect by rememberSaveable { mutableStateOf(false) }
    var showAdd by rememberSaveable { mutableStateOf(false) }
    var showPhoneData by rememberSaveable { mutableStateOf(false) }
    val tabs = listOf(Destination("jobs", "Jobs", Icons.Default.Search), Destination("apply", "Apply", Icons.AutoMirrored.Filled.Send),
        Destination("receipts", "Receipts", Icons.AutoMirrored.Filled.List), Destination("profile", "Profile", Icons.Default.Person),
        Destination("settings", "Settings", Icons.Default.Settings))
    val selectTab: (Int) -> Unit = { selected -> focus.clearFocus(); keyboard?.hide(); tab = selected }
    var pdfScope by rememberSaveable { mutableStateOf<String?>(null) }
    var receiptExportScope by rememberSaveable { mutableStateOf<String?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val captured = pdfScope; pdfScope = null
        if (uri != null && captured != null) model.choosePDF(uri, captured)
    }
    val exporter = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val captured = receiptExportScope; receiptExportScope = null
        if (uri != null && captured != null) model.exportReceipts(uri, captured)
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            Surface(color = MaterialTheme.colorScheme.background) {
                Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 20.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(l10n("Career Finder"), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                    }
                    FilledTonalIconButton(onClick = { selectTab(4) }, modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp).testTag("open-settings")) {
                        Icon(Icons.Default.Settings, contentDescription = l10n("Open settings"))
                    }
                }
            }
        },
        bottomBar = { PhoneNavigation(tabs, tab, selectTab) }
    ) { padding ->
        BoxWithConstraints(Modifier.fillMaxSize().padding(padding)) {
            val messageHeightLimit = maxHeight * 0.35f
            Column(Modifier.fillMaxSize()) {
                if (state.busy || !state.loaded) LinearProgressIndicator(Modifier.fillMaxWidth())
                if (state.error != null || state.notice != null || state.testService) {
                    // Long notices remain scrollable while the main screen keeps usable height.
                    Column(Modifier.fillMaxWidth().heightIn(max = messageHeightLimit)
                        .verticalScroll(rememberScrollState()).testTag("workspace-messages")) {
                        if (state.testService) MessageBanner("Test service: applications and receipts are simulated.", true, null)
                        if (state.error != null || state.notice != null) MessageBanner(state.error ?: state.notice.orEmpty(), state.error != null, model::dismissMessage)
                    }
                }
                Box(Modifier.weight(1f).testTag("workspace-content")) {
                    if (tab == 4) SettingsScreen(state, { showConnect = true }, { showPhoneData = true }, { selectTab(3) })
                    else if (!state.loaded) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text(l10n("Opening your private workspace…")) }
                    else if (state.storageBlocked) StorageRecoveryScreen(state, model)
                    else when (tab) {
                        0 -> JobsScreen(state, model, { showAdd = true }, { tab = 1 }, { tab = 3 }, { showConnect = true }, jobsSection) { jobsSection = it }
                        1 -> ApplyScreen(state, model, { showConnect = true }, { tab = 2 }, { tab = 3 }, { tab = 0; jobsSection = 1 })
                        2 -> ReceiptsScreen(state, model, { tab = 0; jobsSection = 0 }) { receiptExportScope = state.privateScope; exporter.launch("Career-Finder-Receipts-" + LocalDate.now() + ".json") }
                        3 -> ProfileScreen(state, model) { pdfScope = state.privateScope; picker.launch(arrayOf("application/pdf")) }
                    }
                }
            }
        }
    }
    if (showConnect && !state.storageBlocked) ConnectionDialog(state, model, { showConnect = false; showPhoneData = true }) { showConnect = false }
    if (showPhoneData && !state.storageBlocked) WorkspaceDataDialog(state, model, { showAdd = true }) { showPhoneData = false }
    if (state.workspaceImport != null && !state.storageBlocked) WorkspaceImportDialog(state, model)
    if (showAdd && !state.storageBlocked) AddOpportunityDialog(state, model) { showAdd = false }
    if (state.phoneImport != null && !state.storageBlocked) PhoneImportDialog(state, model)
    if (state.applicationRecordEditor != null && !state.storageBlocked) ApplicationRecordEditor(state, model)
}

@Composable
private fun SettingsScreen(state: CareerUiState, connect: () -> Unit, phoneData: () -> Unit, profile: () -> Unit) {
    val l10n = rememberCareerStrings()
    val appearance = LocalAppearance.current
    val language = LocalCareerLanguage.current
    val context = LocalContext.current
    val origin = ServicePages.initialOrigin(state.connection)
    val version = remember(context) {
        runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull() ?: "—"
    }
    val workspaceAvailable = state.loaded && !state.storageBlocked
    LazyColumn(Modifier.fillMaxSize().testTag("settings-list"), contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp)) {
        item { Heading("Settings", "Choose your language and appearance, and manage saved data.") }
        item {
            Panel {
                Text(l10n("Language"), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
                Column(Modifier.selectableGroup()) {
                    LanguagePreference.entries.forEach { option ->
                        Row(Modifier.fillMaxWidth().heightIn(min = 56.dp)
                            .selectable(selected = language.preference == option, onClick = { language.select(option) }, role = Role.RadioButton)
                            .testTag("language-" + option.value).padding(horizontal = 4.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            RadioButton(selected = language.preference == option, onClick = null)
                            Text(l10n(option.title), style = MaterialTheme.typography.bodyLarge)
                        }
                    }
                }
                Text(l10n("Language changes only this app’s display. Your saved data and account stay the same."),
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item {
            Panel {
                Text(l10n("Appearance"), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
                Column(Modifier.selectableGroup()) {
                    AppearancePreference.entries.forEach { option ->
                        Row(Modifier.fillMaxWidth().heightIn(min = 56.dp)
                            .selectable(selected = appearance.preference == option, onClick = { appearance.select(option) }, role = Role.RadioButton)
                            .testTag("appearance-" + option.value).padding(horizontal = 4.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            RadioButton(selected = appearance.preference == option, onClick = null)
                            Text(l10n(option.title), style = MaterialTheme.typography.bodyLarge)
                        }
                    }
                }
                Text(l10n("System follows your device appearance. This choice is saved only on this phone."),
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item {
            Panel {
                Text(l10n("Your workspace"), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
                OutlinedButton(onClick = profile, enabled = workspaceAvailable, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) {
                    Text(l10n("Profile and résumé"))
                }
                OutlinedButton(onClick = connect, enabled = workspaceAvailable && !state.busy,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).testTag("settings-connection")) {
                    Text(l10n("Application connection"))
                }
                OutlinedButton(onClick = phoneData, enabled = workspaceAvailable && !state.busy,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).testTag("settings-phone-data")) {
                    Text(l10n("Phone data, backup and recovery"))
                }
                val workspaceNote = if (state.storageBlocked) "Your private files are preserved. Return to Jobs to retry storage or review recovery options."
                    else "Your profile, application records and appearance preference remain separate. Connecting never submits an application."
                Text(l10n(workspaceNote),
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = if (state.storageBlocked) Modifier.semantics { liveRegion = LiveRegionMode.Polite } else Modifier)
            }
        }
        item {
            Panel {
                Text(l10n("Privacy and support"), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
                TextButton(onClick = { openLink(context, ServicePages.url(origin, "privacy")) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Privacy and data use")) }
                TextButton(onClick = { openLink(context, ServicePages.url(origin, "support")) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Help and support")) }
                TextButton(onClick = { openLink(context, ServicePages.url(origin, "account")) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Account, recovery and deletion")) }
                Text(l10n("Account actions open in your browser. Your appearance choice stays on this phone and is never sent to employers."),
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item { Text(l10n.format("Career Finder · {0}", listOf((version).toString())), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

@Composable
private fun StorageRecoveryScreen(state: CareerUiState, model: CareerViewModel) {
    val l10n = rememberCareerStrings()
    var confirmFresh by remember { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize().testTag("storage-recovery"), contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item {
            Column(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
                Heading("Your private files are preserved.", "Saving is paused while this phone’s encrypted storage is unavailable.")
            }
        }
        item {
            Panel {
                Text(l10n("Try storage again"), style = MaterialTheme.typography.titleLarge)
                Text(l10n("A temporary device or storage problem may recover. Retrying does not resend an application."))
                Action("Retry private storage", !state.busy, model::retryStorage)
            }
        }
        item {
            Panel {
                Text(l10n("Start a separate phone workspace"), style = MaterialTheme.typography.titleLarge)
                Text(l10n("If the saved data cannot be opened, you can create a new encrypted workspace. Earlier files and keys stay on this phone; they are not deleted or replaced."))
                Text(l10n("The new workspace starts empty. Service records remain on the service. You will need a new pairing code to reconnect."), style = MaterialTheme.typography.bodyMedium)
                OutlinedButton(onClick = { confirmFresh = true }, enabled = !state.busy,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text(l10n("Preserve files and start fresh")) }
            }
        }
    }
    if (confirmFresh) AlertDialog(onDismissRequest = { confirmFresh = false },
        title = { Text(l10n("Create a new private workspace?")) },
        text = { Text(l10n("This opens an empty local workspace while preserving the existing encrypted files. It does not recover unreadable drafts or revoke any earlier service session. Your server records stay unchanged.")) },
        confirmButton = { TextButton(onClick = { confirmFresh = false; model.startFreshPrivateWorkspace() }) { Text(l10n("Create new workspace")) } },
        dismissButton = { TextButton(onClick = { confirmFresh = false }) { Text(l10n("Keep current workspace")) } })
}

@Composable
private fun ProfileSummary(profile: ProfileDraft) {
    val l10n = rememberCareerStrings()
    listOf(
        "Name" to listOf(profile.firstName, profile.lastName).filter(String::isNotBlank).joinToString(" "),
        "Email" to profile.email, "Phone" to profile.phone,
        "Location" to listOf(profile.city, profile.country).filter(String::isNotBlank).joinToString(" · "),
        "Headline" to profile.headline, "Website" to profile.website, "LinkedIn profile" to profile.linkedin, "Skills" to profile.skills,
        "Target roles" to profile.targetRoles, "Target countries" to profile.targetCountries,
        "Work preferences" to profile.workModes.sorted().joinToString(", ") { displayedWorkMode(it, l10n) },
        "Experience" to displayedExperience(profile.experienceLevel, l10n)
    ).forEach { (label, value) ->
        Column {
            Text(l10n(label), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value.ifBlank { l10n("Not provided") }, style = MaterialTheme.typography.bodyMedium)
        }
    }
    Text(l10n.format("Résumé: {0}", listOf(((profile.resume?.name ?: l10n("No PDF"))).toString())), fontWeight = FontWeight.SemiBold)
    profile.resume?.let { Text(it.sha256, style = MaterialTheme.typography.bodySmall) }
}

private fun displayedExperience(stored: String, l10n: CareerStrings): String {
    val label = when (stored) {
        "any", "Any", "Any / not specified" -> "Any / not specified"
        "entry", "Entry", "Entry level" -> "Entry level"
        "mid", "Mid", "Mid level" -> "Mid level"
        "senior", "Senior" -> "Senior"
        else -> null
    } ?: return stored
    return l10n(label)
}

private fun displayedWorkMode(stored: String, l10n: CareerStrings): String {
    val label = when (stored) {
        "remote", "Remote" -> "Remote"
        "hybrid", "Hybrid" -> "Hybrid"
        "on-site", "On site" -> "On site"
        else -> null
    } ?: return stored
    return l10n(label)
}

@Composable
private fun ProfileConflictPanel(state: CareerUiState, model: CareerViewModel) {
    val l10n = rememberCareerStrings()
    val newer = state.profileConflict ?: return
    var compare by remember { mutableStateOf(false) }
    var confirmation by remember { mutableStateOf<ProfileDraft?>(null) }
    Panel {
        StatusPill("A newer saved profile is available", true, Modifier.semantics { liveRegion = LiveRegionMode.Polite })
        Text(l10n.format("Your edited fields are safe on this phone. Compare them with saved version {0} before choosing what to keep.", listOf((newer.revision).toString())))
        TextButton(onClick = { compare = !compare }, modifier = Modifier.heightIn(min = 48.dp)) { Text(l10n(if (compare) "Hide comparison" else "Compare both profiles")) }
        if (compare) {
            Text(l10n("Your phone draft"), style = MaterialTheme.typography.titleMedium)
            ProfileSummary(state.profile)
            HorizontalDivider()
            Text(l10n("Latest saved profile"), style = MaterialTheme.typography.titleMedium)
            ProfileSummary(newer)
        }
        OutlinedButton(onClick = { confirmation = newer }, enabled = !state.busy,
            modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text(l10n("Keep my edited fields")) }
        Text(l10n("This keeps a private draft. It does not overwrite the service until you save again."), style = MaterialTheme.typography.bodySmall)
    }
    confirmation?.let { reviewed ->
        AlertDialog(onDismissRequest = { confirmation = null }, title = { Text(l10n("Keep your edits for review?")) },
            text = {
                Column(Modifier.heightIn(max = 320.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(l10n.format("Your draft fields will be kept against saved version {0}. You can review everything before saving.", listOf((reviewed.revision).toString())))
                    Text(l10n(when {
                        state.profile.removeResume -> "Your request to remove the PDF is kept."
                        state.profile.resume?.dataBase64 != null -> "Your newly selected PDF is kept: " + state.profile.resume.name
                        else -> "The latest saved PDF will be used: " + (reviewed.resume?.name ?: "No PDF") + ". The older file is not stored on this phone."
                    }))
                    if (state.profile.resume?.dataBase64 == null && !state.profile.removeResume)
                        reviewed.resume?.let { Text(l10n.format("Latest file fingerprint: {0}", listOf((it.sha256).toString())), style = MaterialTheme.typography.bodySmall) }
                }
            },
            confirmButton = { TextButton(onClick = { confirmation = null; model.keepDraftWithLatestProfile(reviewed.revision) }) { Text(l10n("Keep as private draft")) } },
            dismissButton = { TextButton(onClick = { confirmation = null }) { Text(l10n("Keep comparing")) } })
    }
}

@Composable
private fun PhoneImportDialog(state: CareerUiState, model: CareerViewModel) {
    val l10n = rememberCareerStrings()
    val phone = state.phoneImport ?: return
    var profile by remember { mutableStateOf(false) }
    var jobs by remember { mutableStateOf(false) }
    FullScreenForm("Review phone draft", model::closePhoneImport) {
        LazyColumn(Modifier.fillMaxSize().testTag("phone-import"), contentPadding = PaddingValues(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item { Heading("Copy your phone draft", "Choose what to copy into a private draft for this connected workspace. The original phone draft stays intact.") }
            item {
                Panel {
                    Text(l10n("Saved phone profile"), style = MaterialTheme.typography.titleLarge)
                    ProfileSummary(phone.profile)
                    CheckLine("Copy this profile into the workspace draft", profile, { profile = it }, !state.busy)
                    Text(l10n("This replaces the profile draft currently shown. It is shared with the service only when you save the connected profile."), style = MaterialTheme.typography.bodySmall)
                }
            }
            val unfinishedCurrent = phone.opportunityDraft.takeIf { it.hasContent }
            val unfinishedParked = phone.recoveredOpportunityDrafts.filter { it.hasContent }
            if (unfinishedCurrent != null) item {
                Panel {
                    Text(l10n("Unfinished opportunity"), style = MaterialTheme.typography.titleLarge)
                    Text(unfinishedCurrent.title.ifBlank { l10n("Unfinished opportunity") }, style = MaterialTheme.typography.bodyMedium)
                    if (unfinishedCurrent.company.isNotBlank()) Text(unfinishedCurrent.company, style = MaterialTheme.typography.bodySmall)
                }
            }
            if (unfinishedParked.isNotEmpty()) item {
                Panel {
                    Text(l10n("Recovered opportunity drafts"), style = MaterialTheme.typography.titleLarge)
                    unfinishedParked.forEach { draft ->
                        Text(draft.title.ifBlank { l10n("Unfinished opportunity") }, style = MaterialTheme.typography.bodyMedium)
                        if (draft.company.isNotBlank()) Text(draft.company, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            if (phone.jobs.isNotEmpty() || phone.applicationRecords.isNotEmpty()) item {
                Panel {
                    Text(l10n("Saved links and private records"), style = MaterialTheme.typography.titleLarge)
                    val linkCount = if (phone.jobs.size == 1) "1 saved link" else "${phone.jobs.size} saved links"
                    val recordCount = if (phone.applicationRecords.size == 1) "1 private record" else "${phone.applicationRecords.size} private records"
                    Text(l10n.format("{0} · {1}", listOf(l10n(linkCount), l10n(recordCount))), style = MaterialTheme.typography.bodySmall)
                    phone.jobs.forEach { Text(it.title + " · " + it.company, style = MaterialTheme.typography.bodyMedium) }
                    val linked = phone.jobs.map { BoundaryPolicy.jobIdentity(it.url) }.toSet()
                    phone.applicationRecords.values.filter { it.identity !in linked }.forEach {
                        Text(l10n.format("Record only: {0} · {1}", listOf((it.job.title).toString(), (it.job.company).toString())), style = MaterialTheme.typography.bodyMedium)
                    }
                    CheckLine("Copy saved links and private records", jobs, { jobs = it }, !state.busy)
                    Text(l10n("Matching links are kept once. Different record details stay available for review. Removed links stay removed."), style = MaterialTheme.typography.bodySmall)
                    Text(l10n("Records stay private on this phone. Copied links stay here until you choose Sync."), style = MaterialTheme.typography.bodySmall)
                }
            }
            if (state.profileConflict != null) item {
                Text(l10n("Resolve the current profile conflict before copying this draft."), color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
            }
            item { Action("Copy selected drafts", (profile || jobs || unfinishedCurrent != null || unfinishedParked.isNotEmpty()) && !state.busy && state.profileConflict == null) { model.importPhoneDraft(profile, jobs) } }
            item { Text(l10n("Copying never applies to an employer. Your application review and approval are still required."), style = MaterialTheme.typography.bodySmall) }
        }
    }
}

@Composable
private fun MessageBanner(text: String, error: Boolean, dismiss: (() -> Unit)?) {
    val l10n = rememberCareerStrings()
    Surface(color = if (error) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer) {
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, top = 10.dp, bottom = 10.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(if (error) l10n.message(text) else l10n(text), Modifier.weight(1f).heightIn(max = 150.dp).verticalScroll(rememberScrollState()).semantics { liveRegion = LiveRegionMode.Polite },
                style = MaterialTheme.typography.bodyMedium,
                color = if (error) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onPrimaryContainer)
            if (dismiss != null) IconButton(onClick = dismiss) { Icon(Icons.Default.Close, l10n("Dismiss message")) }
        }
    }
}

@Composable
internal fun Heading(title: String, subtitle: String) {
    val l10n = rememberCareerStrings()
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(l10n(title), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() })
        Text(l10n(subtitle), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
internal fun Panel(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val l10n = rememberCareerStrings()
    Surface(modifier.fillMaxWidth(), shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
    }
}

@Composable
internal fun Action(label: String, enabled: Boolean = true, onClick: () -> Unit) {
    val l10n = rememberCareerStrings()
    Button(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp), shape = RoundedCornerShape(16.dp)) { Text(l10n(label)) }
}

@Composable
internal fun EmptyState(title: String, body: String, icon: ImageVector = Icons.Default.Search, action: String? = null, onClick: () -> Unit = {}) {
    val l10n = rememberCareerStrings()
    Panel {
        Box(Modifier.size(64.dp).background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(20.dp)), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(28.dp))
        }
        Text(l10n(title), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
        Text(l10n(body), color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (action != null) Action(action, onClick = onClick)
    }
}

@Composable
internal fun SavedJobsScreen(state: CareerUiState, model: CareerViewModel, add: () -> Unit, review: () -> Unit, discover: () -> Unit) {
    val l10n = rememberCareerStrings()
    var query by rememberSaveable(state.privateScope) { mutableStateOf("") }
    var filter by rememberSaveable(state.privateScope) { mutableStateOf(SavedOpportunityFilter.ALL) }
    var removingID by rememberSaveable(state.privateScope) { mutableStateOf<String?>(null) }
    val searchTerms = remember(query) { SavedSearch.terms(query) }
    val matchingJobs = state.jobs.filter { savedOpportunityMatches(it, state.recordFor(it), searchTerms) && filter.includes(state.recordFor(it)) }
    val filtered = if (filter == SavedOpportunityFilter.FOLLOW_UP) matchingJobs.sortedBy { state.recordFor(it)?.current?.record?.followUpDate } else matchingJobs
    val orphaned = state.unbookmarkedRecords.filter { savedOpportunityMatches(it.job, it, searchTerms) && filter.includes(it) }
        .let { if (filter == SavedOpportunityFilter.FOLLOW_UP) it.sortedBy { record -> record.current.record.followUpDate } else it }
    val hasRecords = state.jobs.isNotEmpty() || state.applicationRecords.isNotEmpty()
    val context = LocalContext.current
    LazyColumn(Modifier.fillMaxSize().testTag("jobs-list"), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Heading("Saved jobs", "Keep the roles you want to come back to, and track the applications you complete yourself.") }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedButton(onClick = add, modifier = Modifier.weight(1f).heightIn(min = 52.dp)) {
                    Icon(Icons.Default.Add, null); Spacer(Modifier.width(8.dp))
                    Text(l10n(if (state.opportunityDraft.hasContent) "Continue job draft" else "Add opportunity"))
                }
                if (state.connection != null) IconButton(onClick = model::refresh, enabled = !state.busy) { Icon(Icons.Default.Refresh, l10n("Refresh saved opportunities")) }
            }
        }
        if (hasRecords) {
            item { Field("Search saved opportunities", query, { query = it }, type = KeyboardType.Text) }
            item {
                Row(Modifier.fillMaxWidth().selectableGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(SavedOpportunityFilter.ALL, SavedOpportunityFilter.FOLLOW_UP).forEach { choice ->
                        FilterChip(filter == choice, { filter = choice }, label = { Text(l10n(choice.label)) },
                            modifier = Modifier.heightIn(min = 48.dp).semantics { role = Role.RadioButton })
                    }
                }
                if (filter == SavedOpportunityFilter.FOLLOW_UP) Text(l10n("Dates you set in your private records. Closed applications are hidden here."), style = MaterialTheme.typography.bodySmall)
            }
        }
        if (!hasRecords) item { EmptyState("No saved jobs yet", "Save a role from Discover, or add an employer link from anywhere. Saving never sends an application.", action = "Discover jobs", onClick = discover) }
        else if (filtered.isEmpty() && orphaned.isEmpty()) item { EmptyState(if (filter == SavedOpportunityFilter.FOLLOW_UP) "No follow-ups match." else "No saved opportunities match.",
            if (filter == SavedOpportunityFilter.FOLLOW_UP) "Add a follow-up date in an application record to see it here." else "Your saved roles are still here. Clear the search to see them again.",
            action = "Show all saved opportunities", onClick = { query = ""; filter = SavedOpportunityFilter.ALL }) }
        items(filtered, key = Opportunity::id) { job ->
            Panel {
                Text(job.company.ifBlank { l10n("Employer") }, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
                Text(job.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                Text(listOf(job.location, job.country).filter(String::isNotBlank).joinToString(" · ").ifBlank { l10n("Location not recorded") }, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(l10n(if (job.localOnly) "Saved on this phone" else "Saved to your workspace"), style = MaterialTheme.typography.labelMedium)
                OutlinedButton(onClick = { openLink(context, job.url) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                    .semantics { contentDescription = l10n.format("Open employer page for {0} at {1}", listOf((job.title).toString(), (job.company).toString()))}) { Text(l10n("Open employer page")) }
                ApplicationRecordSummary(state.recordFor(job), { model.openApplicationRecord(job, state.privateScope) }, !state.busy,
                    "Application record for ${job.title} at ${job.company}")
                if (job.localOnly && state.connection != null) TextButton(onClick = { model.syncOpportunity(job) }, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Sync this opportunity")) }
                if (job.localOnly) TextButton(onClick = { removingID = job.id }, enabled = !state.busy,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                        .semantics { contentDescription = l10n.format("Remove saved link for {0} at {1}", listOf((job.title).toString(), (job.company).toString()))}) { Text(l10n("Remove saved link")) }
                if (!job.localOnly) {
                    CheckLine("Select for Auto Apply review", job.id in state.selected, { model.toggleJob(job.id) }, !state.busy,
                        accessibilityLabel = "Select ${job.title} at ${job.company} for Auto Apply review")
                    if (job.id in state.selected) TextButton(onClick = review, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Continue to Auto Apply")) }
                }
            }
        }
        items(orphaned, key = { "record-" + it.identity }) { record ->
            Panel {
                Text(record.job.company.ifBlank { l10n("Employer") }, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
                Text(record.job.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                Text(l10n("Application record · saved link removed"), style = MaterialTheme.typography.labelMedium)
                ApplicationRecordSummary(record, { model.openApplicationRecord(record.job, state.privateScope) }, !state.busy,
                    "Application record for ${record.job.title} at ${record.job.company}")
                OutlinedButton(onClick = { openLink(context, record.job.url) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Open employer page")) }
                TextButton(onClick = { model.restoreRecordedOpportunity(record.identity, state.privateScope) }, enabled = !state.busy,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Save opportunity again")) }
            }
        }
        item { Text(l10n("Saving a link does not verify its availability or submit an application. Automatic applications depend on a supported employer integration."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
    state.jobs.firstOrNull { it.id == removingID && it.localOnly }?.let { job ->
        AlertDialog(onDismissRequest = { if (!state.busy) removingID = null },
            title = { Text(l10n("Remove saved link?")) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(l10n.format("{0} at {1}", listOf((job.title).toString(), (job.company).toString())))
                    Text(l10n("This removes the saved link and its preparation choices. Your private application record and notes are kept."))
                    Text(l10n("Connected records and receipts stay saved."))
                }
            },
            confirmButton = {
                TextButton(onClick = { model.removeLocalOpportunity(job.id) { removingID = null } }, enabled = !state.busy,
                    modifier = Modifier.heightIn(min = 48.dp).testTag("confirm-remove-opportunity")) { Text(l10n("Remove saved link")) }
            },
            dismissButton = { TextButton(onClick = { removingID = null }, enabled = !state.busy,
                modifier = Modifier.heightIn(min = 48.dp)) { Text(l10n("Keep opportunity")) } })
    }
}

@Composable
private fun ApplyScreen(state: CareerUiState, model: CareerViewModel, connect: () -> Unit, receipts: () -> Unit,
    profile: () -> Unit, jobs: () -> Unit) {
    val l10n = rememberCareerStrings()
    val context = LocalContext.current
    val plan = state.plan
    var approved by remember(plan?.id, plan?.digest) { mutableStateOf(false) }
    val selectedJobs = state.jobs.filter { it.id in state.selected && !it.localOnly }
    LazyColumn(Modifier.fillMaxSize().imePadding().testTag("apply-list"), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Heading("Applications", "Prepare your details, choose a role and review your application options.") }
        if (state.connection == null || state.requiresPairing) item {
            Panel {
                Text(l10n("Apply on the employer’s website"), style = MaterialTheme.typography.titleLarge)
                Text(l10n("Save the job before opening the employer’s page. Check its requirements, location and deadline there."))
                Button(onClick = jobs, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).testTag("apply.manual")) {
                    Text(l10n("Open saved jobs"))
                }
                TextButton(onClick = profile, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                    Text(l10n("Review profile and CV"))
                }
                TextButton(onClick = connect, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("apply.connect")) {
                    Text(l10n("Connect application workspace"))
                }
            }
        }
        if (state.connection != null && !state.requiresPairing && !state.liveEnabled && !state.testService) item {
            Panel {
                StatusPill("Automatic sending is not enabled", true, Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                Text(l10n("You can discover and save jobs, then apply directly on each employer’s site. A custom service needs an activated, authorized employer integration and your approval of the reviewed details. Preparing a review does not enable automatic sending."))
                OutlinedButton(onClick = jobs, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Open saved opportunities")) }
            }
        }
        if (!state.profile.essentialsComplete || state.profileDirty || state.profileConflict != null) item {
            Panel {
                Text(l10n("Before your application review"), style = MaterialTheme.typography.titleMedium)
                ProfileEssentials(state.profile)
                if (state.profileDirty) Text(l10n("Save your latest profile draft before preparing a review."), style = MaterialTheme.typography.bodySmall)
                OutlinedButton(onClick = profile, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Review profile and résumé")) }
            }
        }
        if (state.activePlans.isNotEmpty()) item {
            Panel {
                Text(l10n("Applications are in progress"), style = MaterialTheme.typography.titleLarge)
                Text(l10n("A stop request cancels jobs that have not been dispatched. Receipts show the actual outcome for anything already sent."))
                if (state.clientContinuation) Text(l10n("Keep Career Finder open to continue the approved batch. Leaving the app pauses the next request; an application already sent may still finish."), style = MaterialTheme.typography.bodySmall)
                if (state.activePlans.any { it in state.continuationHolds }) Text(l10n("Continuation is paused on this phone for a stop request. Refresh receipts to check the service outcome, or request Stop again if needed."), style = MaterialTheme.typography.bodySmall)
                state.activePlans.forEach { id -> OutlinedButton(onClick = { model.stop(id) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Stop remaining applications")) } }
                TextButton(onClick = receipts, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("View receipts")) }
            }
        }
        val earlierReviews = state.recoverablePlans.filter { it.id != plan?.id && !(it.unapproved && it.id in state.obsoleteReviews) }
        val firstExpiredReview = earlierReviews.firstOrNull { it.expired() }?.id
        items(earlierReviews, key = { "recovery-" + it.id }) { savedPlan ->
            Panel {
                Text(l10n("Continue an earlier review"), style = MaterialTheme.typography.titleLarge)
                Text(l10n("Review the original application details, then approve again. Requests with an uncertain outcome cannot be resumed."))
                savedPlan.items.filter { it.state == "rate_limited" }.forEach { Text(l10n.format("{0} · Wait until {1}", listOf((it.title).toString(), (l10n.dateTime(it.retryAt)).toString())), style = MaterialTheme.typography.bodySmall) }
                if (savedPlan.expired()) Text(l10n("This review is out of date. Refresh the workspace before continuing."),
                    color = MaterialTheme.colorScheme.error,
                    modifier = if (savedPlan.id == firstExpiredReview) Modifier.semantics { liveRegion = LiveRegionMode.Polite } else Modifier)
                OutlinedButton(onClick = { model.reviewRecovered(savedPlan) }, enabled = !state.busy && !savedPlan.expired(), modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Review remaining applications")) }
            }
        }
        if (state.connection != null && selectedJobs.isEmpty() && plan == null) item { EmptyState("Choose your opportunities.", "Select synced roles in Saved to review the details for each employer.", Icons.Default.Check, "Choose saved opportunities", jobs) }
        items(if (state.reviewingRecoveredPlan) emptyList() else selectedJobs, key = { "answer-" + it.id }) { job ->
            val answer = state.answers[job.id] ?: JobAnswers()
            val reviewed = plan?.items?.find { it.jobId == job.id }
            Panel {
                Text(job.company, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
                Text(job.title, style = MaterialTheme.typography.titleLarge)
                CheckLine("I already applied outside Career Finder", job.id in state.manualApplied,
                    { model.markAppliedElsewhere(job.id, it) }, enabled = !state.busy)
                Field("Message for this employer (optional)", answer.comments, {
                    model.editAnswers(job.id) { value -> value.copy(comments = it.take(5000)) }
                }, singleLine = false, enabled = !state.busy)
                ConsentChoice("Allow this employer to store and process my application", answer.consentStore, !state.busy) {
                    model.editAnswers(job.id) { value -> value.copy(consentStore = it) }
                }
                ConsentChoice("Allow contact about future opportunities (optional)", answer.consentMarketing, !state.busy) {
                    model.editAnswers(job.id) { value -> value.copy(consentMarketing = it) }
                }
                if (!reviewed?.privacyPolicyUrl.isNullOrBlank()) TextButton(onClick = { openLink(context, reviewed.privacyPolicyUrl) }, modifier = Modifier.heightIn(min = 48.dp)) { Text(l10n("Read this employer’s privacy policy")) }
                if (reviewed?.state == "blocked") {
                    StatusPill("Needs attention", true)
                    Text(l10n(reviewed.reason), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    OutlinedButton(onClick = { openLink(context, job.url) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Complete on employer site")) }
                }
            }
        }
        if (selectedJobs.isNotEmpty() && !state.reviewingRecoveredPlan) item {
            if (state.profileDirty) Text(l10n("Save your profile before preparing the review."), color = MaterialTheme.colorScheme.error,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
            Action(if (state.obsoleteReviews.isNotEmpty() || plan?.unapproved == true) "Stop earlier review and prepare update" else "Prepare application review",
                state.connection != null && !state.busy && !state.profileDirty && !state.requiresPairing && state.profile.essentialsComplete, model::prepare)
            Text(l10n("Preparing sends nothing to employers. Required custom questions or an unavailable connector will be shown clearly."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (plan != null) {
            item { Heading("Review what will be shared.", l10n.format("This review uses profile version {0}. Expires {1}.",
                listOf(plan.profileRevision.toString(), l10n.dateTime(plan.expiresAt)))) }
            items(plan.items, key = { "review-" + it.jobId }) { item -> ReviewCard(item) }
            item {
                Panel {
                    val ready = plan.items.count(ReviewItem::canSubmitNow)
                    Text(l10n.format("Ready applications: {0}", listOf((ready).toString())), style = MaterialTheme.typography.titleLarge)
                    if (state.testService) Text(l10n("This is a test service. Any generated receipt is simulated and does not count as a real application."), color = MaterialTheme.colorScheme.error)
                    CheckLine("I reviewed these details and authorize sending the ready applications to the employers shown above.", approved, { approved = it }, !state.busy)
                    Action(if (state.testService) "Run approved test applications" else "Approve and Auto Apply",
                        approved && ready > 0 && !state.busy && !plan.expired() && !state.profileDirty && !state.requiresPairing &&
                            (state.liveEnabled || state.testService)) { model.submit(plan) }
                    if (plan.expired()) Text(l10n("This review has expired or your profile changed. Prepare it again."),
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                    if (plan.items.any { it.state == "rate_limited" }) TextButton(onClick = model::refresh, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Refresh cooldown availability")) }
                    OutlinedButton(onClick = { model.stop(plan.id) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Stop this batch")) }
                    Text(l10n("Confirmed means the provider accepted the application. It does not mean recruiter review, an interview or an offer."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
internal fun ReviewCard(item: ReviewItem) {
    val l10n = rememberCareerStrings()
    var fingerprint by remember(item.jobId) { mutableStateOf(false) }
    val context = LocalContext.current
    Panel {
        StatusPill(if (item.canSubmitNow()) "Ready for your approval" else "Not ready to send", !item.canSubmitNow())
        Text(item.title, style = MaterialTheme.typography.titleLarge)
        Text(item.company, color = MaterialTheme.colorScheme.primary)
        listOf("name" to "Name", "email" to "Email", "phone" to "Phone", "website" to "Website", "linkedin" to "LinkedIn profile", "comments" to "Message").forEach { (key, label) ->
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(l10n(label), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(item.payload.safeString(key).ifBlank { l10n("Not shared") })
            }
        }
        Text(l10n.format("Application data processing: {0}", listOf(l10n(consentLabel(item.payload.opt("consentStore"))))))
        Text(l10n.format("Future opportunities: {0}", listOf(l10n(consentLabel(item.payload.opt("consentMarketing"))))))
        if (item.privacyPolicyUrl.isNotBlank()) TextButton(onClick = { openLink(context, item.privacyPolicyUrl) },
            modifier = Modifier.heightIn(min = 48.dp)) { Text(l10n("Read employer privacy policy")) }
        HorizontalDivider()
        Text(item.resume?.name ?: l10n("No PDF selected"), fontWeight = FontWeight.SemiBold)
        if (item.resume != null) {
            Text(l10n.format("{0} · PDF résumé", listOf((fileSize(item.resume.size, l10n.locale)).toString())), style = MaterialTheme.typography.bodySmall)
            TextButton(onClick = { fingerprint = !fingerprint }, modifier = Modifier.heightIn(min = 48.dp)) { Text(l10n(if (fingerprint) "Hide file fingerprint" else "Check file fingerprint")) }
            if (fingerprint) Text(item.resume.sha256, style = MaterialTheme.typography.bodySmall)
        }
        if (item.reason.isNotBlank()) Text(l10n.message(item.reason), color = MaterialTheme.colorScheme.error)
        if (item.state == "rate_limited") Text(l10n.format("Provider cooldown: {0}", listOf((l10n.dateTime(item.retryAt)).toString())), style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun ReceiptsScreen(state: CareerUiState, model: CareerViewModel, browse: () -> Unit, export: () -> Unit) {
    val l10n = rememberCareerStrings()
    val real = state.receipts.count(ApplicationReceipt::verified)
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf(ReceiptFilter.ALL) }
    val visible = state.receipts.filter { filter.includes(it) &&
        (it.title + " " + it.company + " " + it.applicationId + " " + it.id).contains(query.trim(), ignoreCase = true) }
    LazyColumn(Modifier.fillMaxSize().testTag("receipts-list"), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Heading("Application records", "Confirmed receipts, pending outcomes and stopped applications stay separate.") }
        item {
            Panel {
                Text(l10n(real.toString()), style = MaterialTheme.typography.displayMedium, color = MaterialTheme.colorScheme.primary)
                Text(l10n(if (real == 1) "verified application receipt" else "verified application receipts"), style = MaterialTheme.typography.titleMedium)
                Text(l10n("Only live provider acceptance with a receipt ID is counted. Test results and uncertain requests are excluded."), style = MaterialTheme.typography.bodySmall)
                if (state.connection != null) {
                    OutlinedButton(onClick = model::refresh, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Refresh outcomes")) }
                    TextButton(onClick = export, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Export receipt records")) }
                }
            }
        }
        if (state.receipts.isNotEmpty()) {
            item { Field("Search receipts by role, employer or reference", query, { query = it }) }
            item {
                Row(Modifier.horizontalScroll(rememberScrollState()).selectableGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ReceiptFilter.entries.forEach { choice ->
                        FilterChip(filter == choice, { filter = choice }, label = { Text(l10n(choice.label)) },
                            modifier = Modifier.heightIn(min = 48.dp).semantics { role = Role.RadioButton })
                    }
                }
            }
            item { Text(l10n.format("Showing {0} of {1} records", listOf((visible.size).toString(), (state.receipts.size).toString())), style = MaterialTheme.typography.labelLarge) }
        }
        if (state.receipts.isEmpty()) item { EmptyState("No receipts yet", "A saved job, self-reported application or opened employer link does not create a receipt. An approved application’s actual outcome appears here.", Icons.AutoMirrored.Filled.List, "Discover opportunities", browse) }
        else if (visible.isEmpty()) item { EmptyState("No receipts match these filters.", "Your other application records are still available.", action = "Show all receipts", onClick = { query = ""; filter = ReceiptFilter.ALL }) }
        items(visible, key = ApplicationReceipt::id) { receipt ->
            Panel {
                StatusPill(receiptLabel(receipt), receipt.state in setOf("uncertain", "rejected", "rate_limited") || receipt.testMode)
                Text(receipt.title, style = MaterialTheme.typography.titleLarge)
                Text(receipt.company, color = MaterialTheme.colorScheme.primary)
                Text(l10n(l10n.dateTime(receipt.date)), style = MaterialTheme.typography.bodySmall)
                Text(l10n(when {
                    receipt.testMode -> "Test evidence only. No real employer application is claimed."
                    receipt.verified -> "The provider accepted this application. Receipt: " + receipt.applicationId
                    receipt.state == "uncertain" -> "Acceptance could not be confirmed. Check the employer’s records before considering another application. Automatic resubmission is blocked."
                    receipt.state == "dispatching" -> "The service has dispatched the application. A provider outcome is still pending."
                    receipt.state == "rate_limited" -> "The provider requested a wait. A fresh review can continue only when the service’s cooldown permits it."
                    receipt.state == "cancelled" -> "Remaining work was stopped. Any earlier provider outcome is preserved."
                    receipt.state == "ready" -> "Prepared and waiting; not yet dispatched."
                    receipt.state == "confirmed" -> "This record lacks verified live evidence and is not counted as a live application."
                    else -> "Review the recorded outcome before preparing another application."
                }))
                if (receipt.state == "dispatching" && receipt.planId.isNotBlank() && receipt.planId.length <= 200 && receipt.id.length <= 200) {
                    OutlinedButton(onClick = { model.stopAndCheckReceipt(receipt.id, receipt.planId) },
                        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text(l10n("Stop")) }
                }
                if (receipt.error.isNotBlank()) Text(l10n.message(receipt.error), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        items(state.activePlans) { id -> OutlinedButton(onClick = { model.stop(id) }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text(l10n("Stop remaining applications")) } }
    }
}

@Composable
internal fun ProfileEssentials(profile: ProfileDraft) {
    val l10n = rememberCareerStrings()
    Text(l10n.format("Application essentials ready: {0} / 3", listOf((profile.essentialCount).toString())), style = MaterialTheme.typography.labelLarge)
    EssentialStatus(profile.hasApplicationName, l10n("Name") + l10n(if (profile.hasApplicationName) " · Ready" else " · Needed"), null)
    val emailStatus = ProfileContract.emailEssentialLabel(profile.email)
    EssentialStatus(emailStatus == "Email added", l10n(emailStatus), "profile.essential.email")
    EssentialStatus(profile.hasApplicationPDF, l10n("PDF résumé") + l10n(if (profile.hasApplicationPDF) " · Ready" else " · Needed"), null)
}

@Composable
private fun EssentialStatus(ready: Boolean, spoken: String, tag: String?) {
    Row(Modifier.fillMaxWidth().let { if (tag == null) it else it.testTag(tag) }.semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Icon(if (ready) Icons.Default.Check else Icons.Default.Info, contentDescription = null,
            tint = if (ready) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(20.dp))
        Text(spoken, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
internal fun GettingStartedPanel(state: CareerUiState, profile: () -> Unit, connect: () -> Unit) {
    val l10n = rememberCareerStrings()
    if (state.profile.essentialsComplete && state.connection != null) return
    Panel {
        Text(l10n("Prepare your profile"), style = MaterialTheme.typography.titleMedium)
        Text(l10n("You can search without an account. Add your own profile when you’re ready to prepare applications."), style = MaterialTheme.typography.bodyMedium)
        ProfileEssentials(state.profile)
        OutlinedButton(onClick = profile, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Set up my profile")) }
        if (state.connection == null) TextButton(onClick = connect, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
            Text(l10n("Connect a workspace (optional)"))
        }
    }
}

@Composable
private fun ProfileScreen(state: CareerUiState, model: CareerViewModel, choosePDF: () -> Unit) {
    val l10n = rememberCareerStrings()
    val profile = state.profile
    val reusableContact = contactReuseFields(profile)
    val errors = ProfileValidation.errors(profile)
    var reload by remember { mutableStateOf(false) }
    var details by rememberSaveable { mutableStateOf(false) }
    var choosingTargetCountries by rememberSaveable(state.privateScope) { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize().imePadding().testTag("profile-list"), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Heading("Profile", "Start with the essentials. Everything else is optional, and you can save an unfinished draft.") }
        item {
            Panel {
                ProfileEssentials(profile)
                Text(l10n(if (state.connection == null) "Your draft is encrypted on this phone. Pairing alone does not upload it."
                    else "Edits stay on this phone until you save to the workspace. Employers receive only the details in an approved review."), style = MaterialTheme.typography.bodySmall)
                if (state.profileDirty) StatusPill(if (state.connection == null) "Private phone draft" else "Unsaved workspace changes", false)
                if (state.connection != null) TextButton(onClick = model::inspectPhoneDraft, enabled = !state.busy,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Review saved phone draft")) }
            }
        }
        if (state.profileConflict != null) item { ProfileConflictPanel(state, model) }
        item { Field("First or single name", profile.firstName, { model.editProfile { p -> p.copy(firstName = it) } }, enabled = !state.busy, error = errors["firstName"]) }
        item { Field("Last name (optional)", profile.lastName, { model.editProfile { p -> p.copy(lastName = it) } }, enabled = !state.busy, error = errors["lastName"]) }
        item { Field("Email", profile.email, { model.editProfile { p -> p.copy(email = it) } }, KeyboardType.Email, enabled = !state.busy,
            error = errors["email"]) }
        if (reusableContact.isNotEmpty()) item {
            ProfileContactReuse(reusableContact, !state.busy, state.privateScope)
        }
        item {
            Panel {
                Text(l10n("Your résumé"), style = MaterialTheme.typography.titleLarge)
                Text(profile.resume?.name ?: l10n("Choose your own PDF. No personal information is prefilled."))
                if (profile.resume != null) Text(l10n.format("{0} · PDF", listOf((fileSize(profile.resume.size, l10n.locale)).toString())), style = MaterialTheme.typography.bodySmall)
                Action(if (profile.resume == null) "Choose PDF résumé" else "Replace PDF résumé", !state.busy, choosePDF)
                if (profile.resume != null) TextButton(onClick = model::removePDF, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text(l10n("Remove selected résumé")) }
                Text(l10n("Up to 5 MiB. The exact file and fingerprint appear in the application review."), style = MaterialTheme.typography.bodySmall)
            }
        }
        item {
            OutlinedButton(onClick = { details = !details }, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)
                .semantics { stateDescription = l10n(if (details) "Expanded" else "Collapsed" )}) {
                Text(l10n(if (details) "Hide optional profile details" else "Add experience and preferences"))
            }
        }
        if (details) {
            item { Field("Phone (optional)", profile.phone, { model.editProfile { p -> p.copy(phone = it) } }, KeyboardType.Phone, enabled = !state.busy, error = errors["phone"]) }
            item { Field("Professional headline (optional)", profile.headline, { model.editProfile { p -> p.copy(headline = it) } }, enabled = !state.busy, error = errors["headline"]) }
            item { CountryChooser("Your country (optional)", profile.country, !state.busy) { model.editProfile { p -> p.copy(country = it) } } }
            item { Field("City (optional)", profile.city, { model.editProfile { p -> p.copy(city = it) } }, enabled = !state.busy, error = errors["city"]) }
            item { Field("Website or portfolio (optional)", profile.website, { model.editProfile { p -> p.copy(website = it) } }, KeyboardType.Uri, enabled = !state.busy, error = errors["website"]) }
            item {
                val context = LocalContext.current
                val link = profile.linkedin.takeIf(String::isNotEmpty)?.let { runCatching { BoundaryPolicy.linkedinProfileURL(it) }.getOrNull() }
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Field("LinkedIn profile (optional)", profile.linkedin, { model.editProfile { p -> p.copy(linkedin = it) } }, KeyboardType.Uri,
                        enabled = !state.busy, error = if (profile.linkedin.isNotEmpty() && link == null) "Use your HTTPS LinkedIn personal profile link, beginning with /in/." else null)
                    Text(l10n("A saved profile link, not a verified LinkedIn account connection. It is shared with an employer only when it appears in a review you approve."),
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (link != null) TextButton(onClick = { openLink(context, link) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Open LinkedIn profile")) }
                }
            }
            item { Field("Skills (separate with commas)", profile.skills, { model.editProfile { p -> p.copy(skills = it) } }, singleLine = false, enabled = !state.busy, error = errors["skills"]) }
            item { Field("Roles you want (separate with commas)", profile.targetRoles, { model.editProfile { p -> p.copy(targetRoles = it) } }, singleLine = false, enabled = !state.busy, error = errors["targetRoles"]) }
            item { TargetCountryChooser(profile.targetCountries.parts().toSet(), !state.busy) { choosingTargetCountries = true }
                errors["targetCountries"]?.let { Text(l10n(it), color = MaterialTheme.colorScheme.error) } }
            item {
                Panel {
                    Text(l10n("Work preferences"), style = MaterialTheme.typography.titleLarge)
                    listOf("on-site" to "On site", "hybrid" to "Hybrid", "remote" to "Remote").forEach { (value, label) ->
                        CheckLine(label, value in profile.workModes, { checked -> model.editProfile { p -> p.copy(workModes = if (checked) p.workModes + value else p.workModes - value) } }, !state.busy)
                    }
                    Text(l10n("Experience level"), style = MaterialTheme.typography.labelLarge)
                    Row(Modifier.horizontalScroll(rememberScrollState()).selectableGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("any" to "Any", "entry" to "Entry", "mid" to "Mid", "senior" to "Senior").forEach { (value, label) ->
                            FilterChip(selected = profile.experienceLevel == value, onClick = { model.editProfile { it.copy(experienceLevel = value) } }, label = { Text(l10n(label)) }, enabled = !state.busy,
                                modifier = Modifier.heightIn(min = 48.dp).semantics { role = Role.RadioButton; contentDescription = l10n.format("Experience level: {0}", listOf(l10n(label)))})
                        }
                    }
                    Text(l10n("Only a role you choose on Search fills the job-title field. Other preferences do not filter results or establish work authorization."), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        item {
            if (errors.isNotEmpty()) Text(l10n.format("Your draft is kept. Before sharing it: {0}", listOf((errors.values.joinToString(" ") { l10n.message(it) }).toString())),
                color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
            Action(if (state.connection == null) "Save profile on this phone" else "Save profile to workspace",
                !state.busy && !state.storageBlocked && state.profileConflict == null, model::saveProfile)
            if (state.profileDirty && state.connection != null) TextButton(onClick = { reload = true }, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Reload saved profile")) }
        }
    }
    // A lazy item can leave composition when the keyboard changes the viewport.
    // Keep the modal and its unfinished selection owned by the profile screen.
    if (choosingTargetCountries) {
        val pickerScope = state.privateScope
        key(pickerScope) {
            TargetCountryPicker(profile.targetCountries.parts().toSet(), { choosingTargetCountries = false }) { values ->
                if (model.state.value.privateScope == pickerScope) {
                    model.editProfile { p -> p.copy(targetCountries = values.sorted().joinToString(", ")) }
                }
            }
        }
    }
    if (reload) AlertDialog(onDismissRequest = { reload = false }, title = { Text(l10n("Reload the saved profile?")) },
        text = { Text(l10n("This replaces the edits currently shown with the saved version.")) },
        confirmButton = { TextButton(onClick = { reload = false; model.reloadProfile() }) { Text(l10n("Reload")) } },
        dismissButton = { TextButton(onClick = { reload = false }) { Text(l10n("Keep editing")) } })
}

private data class ContactReuseField(val id: String, val label: String, val value: String, val leftToRight: Boolean = false)

private fun contactReuseFields(profile: ProfileDraft): List<ContactReuseField> = listOf(
    ContactReuseField("firstName", "First or single name", profile.firstName),
    ContactReuseField("lastName", "Last name", profile.lastName),
    ContactReuseField("email", "Email", profile.email, true),
    ContactReuseField("phone", "Phone", profile.phone, true),
    ContactReuseField("city", "City", profile.city),
    ContactReuseField("website", "Website or portfolio", profile.website, true),
    ContactReuseField("linkedin", "LinkedIn profile", profile.linkedin, true)
).filter { it.value.isNotBlank() }

private const val CONTACT_COPY_OPERATION = "com.saleh.careerfinder.contact-copy-operation"

internal fun copyContactField(label: String, value: String, writeClip: (ClipData) -> Unit,
    readDescription: () -> ClipDescription?): Boolean = runCatching {
    val operation = java.util.UUID.randomUUID().toString()
    val clip = ClipData.newPlainText(label, value)
    clip.description.extras = PersistableBundle().apply {
        putBoolean("android.content.extra.IS_SENSITIVE", true)
        putString(CONTACT_COPY_OPERATION, operation)
    }
    writeClip(clip)
    // Check only our fresh operation marker, never clipboard text or other metadata.
    readDescription()?.extras?.getString(CONTACT_COPY_OPERATION) == operation
}.getOrDefault(false)

@Composable
private fun ProfileContactReuse(fields: List<ContactReuseField>, enabled: Boolean, scope: String) {
    val l10n = rememberCareerStrings()
    val clipboard = LocalContext.current.getSystemService(ClipboardManager::class.java)
    var expanded by rememberSaveable(scope) { mutableStateOf(false) }
    var copySucceeded by remember(scope, fields) { mutableStateOf<Boolean?>(null) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = { expanded = !expanded }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
            .testTag("profile.reuse").semantics { stateDescription = l10n(if (expanded) "Expanded" else "Collapsed") }) {
            Text(l10n("Reuse your contact details"))
        }
        if (expanded) {
            fields.forEach { field ->
                OutlinedButton(onClick = {
                    // The chosen field only; no account, form or network operation.
                    copySucceeded = clipboard?.let { manager ->
                        copyContactField(l10n(field.label), field.value, manager::setPrimaryClip) {
                            manager.primaryClipDescription
                        }
                    } ?: false
                }, enabled = enabled && clipboard != null,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("profile.copy." + field.id)) {
                    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(l10n.format("Copy {0}", listOf(l10n(field.label))))
                        Text(field.value, style = MaterialTheme.typography.bodySmall.copy(
                            textDirection = if (field.leftToRight) TextDirection.Ltr else TextDirection.Content),
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            copySucceeded?.let { succeeded ->
                Text(l10n(if (succeeded) "Copied. Paste it into the employer’s form and check it before submitting."
                    else "Copy could not be confirmed. Copy the value from its profile field instead."),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (succeeded) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.error,
                    modifier = Modifier.testTag(if (succeeded) "profile.copy.confirmation" else "profile.copy.unavailable")
                        .semantics { liveRegion = LiveRegionMode.Polite })
            }
        }
    }
}

@Composable
private fun TargetCountryChooser(value: Set<String>, enabled: Boolean, choose: () -> Unit) {
    val l10n = rememberCareerStrings()
    val countries = remember(l10n.locale) { ProfileContract.COUNTRIES.map { it to Locale.Builder().setRegion(it).build().getDisplayCountry(l10n.locale) }.sortedBy { it.second } }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(l10n("Target countries (optional)"), style = MaterialTheme.typography.labelLarge)
        OutlinedButton(onClick = choose, enabled = enabled,
            modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).semantics { contentDescription = l10n("Choose target countries" )}) {
            Text(if (value.isEmpty()) l10n("No country preference") else value.sorted().joinToString(", ") { code -> countries.find { it.first == code }?.second ?: code })
        }
    }
}

@Composable
private fun TargetCountryPicker(value: Set<String>, close: () -> Unit, changed: (Set<String>) -> Unit) {
    val l10n = rememberCareerStrings()
    val countries = remember(l10n.locale) { ProfileContract.COUNTRIES.map { it to Locale.Builder().setRegion(it).build().getDisplayCountry(l10n.locale) }.sortedBy { it.second } }
    var draft by rememberSaveable { mutableStateOf(value.toList()) }
    var search by rememberSaveable { mutableStateOf("") }
    FullScreenForm("Target countries", close) {
        val focus = LocalFocusManager.current
        val keyboard = LocalSoftwareKeyboardController.current
        Column(Modifier.fillMaxSize().padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(search, { search = it.take(2000) }, label = { Text(l10n("Search target countries")) },
                modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(14.dp),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { focus.clearFocus(); keyboard?.hide() }))
            val filtered = countries.filter { (it.first + " " + it.second).contains(search, true) }
            LazyColumn(Modifier.weight(1f).testTag("target-countries")) {
                item { Text(l10n.format("Selected: {0} / 30 · Leave empty for no preference.", listOf((draft.size).toString())), style = MaterialTheme.typography.bodyMedium) }
                item { TextButton(onClick = { draft = emptyList() }, modifier = Modifier.heightIn(min = 48.dp)) { Text(l10n("Clear selection")) } }
                if (filtered.isEmpty()) item { Text(l10n("No countries match this search."), Modifier.padding(vertical = 16.dp)) }
                items(filtered, key = { it.first }) { (code, name) ->
                    CheckLine(name + " · " + code, code in draft, { selected ->
                        if (!selected) draft = draft - code
                        else if (code in draft || draft.size < ProfileContract.MAX_ITEMS) draft = (draft + code).distinct()
                    },
                        enabled = code in draft || draft.size < ProfileContract.MAX_ITEMS)
                }
            }
            Action("Use selected countries", draft.size <= ProfileContract.MAX_ITEMS) { changed(draft.toSet()); close() }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
internal fun Field(label: String, value: String, changed: (String) -> Unit, type: KeyboardType = KeyboardType.Text, singleLine: Boolean = true,
    enabled: Boolean = true, error: String? = null) {
    val l10n = rememberCareerStrings()
    OutlinedTextField(value = value, onValueChange = changed, label = { Text(l10n(label)) },
        modifier = Modifier.fillMaxWidth(), singleLine = singleLine, minLines = if (singleLine) 1 else 3,
        textStyle = MaterialTheme.typography.bodyLarge.copy(textDirection = if (type in setOf(KeyboardType.Email, KeyboardType.Uri, KeyboardType.Phone, KeyboardType.Ascii)) TextDirection.Ltr else TextDirection.Content),
        keyboardOptions = KeyboardOptions(keyboardType = type), enabled = enabled, shape = RoundedCornerShape(14.dp),
        isError = error != null, supportingText = if (error != null) { { Text(l10n.message(error)) } } else null)
}

@Composable
internal fun CheckLine(label: String, checked: Boolean, changed: (Boolean) -> Unit, enabled: Boolean = true,
    accessibilityLabel: String? = null) {
    val l10n = rememberCareerStrings()
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp)
        .toggleable(value = checked, enabled = enabled, role = Role.Checkbox, onValueChange = changed)
        .semantics(mergeDescendants = true) { accessibilityLabel?.let { contentDescription = l10n(it )} }, verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked, null, enabled = enabled, modifier = Modifier.clearAndSetSemantics {})
        Text(l10n(label), Modifier.padding(start = 8.dp).weight(1f), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun ConsentChoice(label: String, value: Boolean?, enabled: Boolean, changed: (Boolean?) -> Unit) {
    val l10n = rememberCareerStrings()
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(l10n(label), style = MaterialTheme.typography.bodyMedium)
        Row(Modifier.horizontalScroll(rememberScrollState()).selectableGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(null to "Not decided", true to "Yes", false to "No").forEach { (choice, text) ->
                FilterChip(value == choice, { changed(choice) }, label = { Text(l10n(text)) }, enabled = enabled,
                    modifier = Modifier.heightIn(min = 48.dp).semantics { role = Role.RadioButton; contentDescription = l10n(label) + ": " + l10n(text)})
            }
        }
    }
}

@Composable
private fun CountryChooser(label: String, value: String, enabled: Boolean = true, changed: (String) -> Unit) {
    val l10n = rememberCareerStrings()
    var open by remember { mutableStateOf(false) }
    var search by remember { mutableStateOf("") }
    val countries = remember(l10n.locale) { ProfileContract.COUNTRIES.map { it to Locale.Builder().setRegion(it).build().getDisplayCountry(l10n.locale) }.sortedBy { it.second } }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(l10n(label), style = MaterialTheme.typography.labelLarge)
        OutlinedButton(onClick = { open = true }, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)
            .semantics { contentDescription = l10n(label) + ": " + (countries.find { it.first == value }?.second ?: l10n("Not selected"))}, shape = RoundedCornerShape(14.dp)) {
            Text(if (value.isBlank()) l10n("Not selected") else countries.find { it.first == value }?.second ?: value, Modifier.weight(1f))
            Icon(Icons.Default.ArrowDropDown, null)
        }
    }
    if (open) AlertDialog(onDismissRequest = { open = false }, title = { Text(l10n("Choose a country")) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Field("Search countries", search, { search = it })
                LazyColumn(Modifier.heightIn(max = 320.dp)) {
                    item { TextButton(onClick = { changed(""); open = false }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Not selected")) } }
                    if (countries.none { (it.first + " " + it.second).contains(search, true) }) item { Text(l10n("No countries match this search."), Modifier.padding(vertical = 12.dp)) }
                    items(countries.filter { (it.first + " " + it.second).contains(search, true) }, key = { it.first }) { (code, name) ->
                        TextButton(onClick = { changed(code); open = false; search = "" }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(name + " · " + code) }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { open = false }) { Text(l10n("Close")) } })
}

@Composable
internal fun StatusPill(label: String, caution: Boolean, modifier: Modifier = Modifier) {
    val l10n = rememberCareerStrings()
    Surface(shape = RoundedCornerShape(10.dp), color = if (caution) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.primaryContainer) {
        Text(l10n(label), modifier.padding(horizontal = 10.dp, vertical = 7.dp), style = MaterialTheme.typography.labelMedium,
            color = if (caution) MaterialTheme.colorScheme.onSecondaryContainer else MaterialTheme.colorScheme.onPrimaryContainer)
    }
}

@Composable
internal fun FullScreenForm(title: String, close: () -> Unit, content: @Composable () -> Unit) {
    val l10n = rememberCareerStrings()
    Dialog(onDismissRequest = close, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        CareerDisplayContent {
            val view = LocalView.current
            val lightBackground = MaterialTheme.colorScheme.background.luminance() > 0.5f
            SideEffect {
                (view.parent as? DialogWindowProvider)?.window?.let { window ->
                    WindowCompat.getInsetsController(window, view).apply {
                        isAppearanceLightStatusBars = lightBackground
                        isAppearanceLightNavigationBars = lightBackground
                    }
                }
            }
            Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                Column(Modifier.safeDrawingPadding().imePadding()) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = close) { Icon(Icons.Default.Close, l10n("Close ") + l10n(title)) }
                        Text(l10n(title), style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(start = 8.dp))
                    }
                    content()
                }
            }
        }
    }
}

@Composable
private fun ConnectionDialog(state: CareerUiState, model: CareerViewModel, phoneData: () -> Unit, close: () -> Unit) {
    val l10n = rememberCareerStrings()
    val context = LocalContext.current
    var origin by rememberSaveable(state.connection?.origin) { mutableStateOf(ServicePages.initialOrigin(state.connection)) }
    var code by remember { mutableStateOf("") }
    var advanced by rememberSaveable(state.connection?.origin) { mutableStateOf(ServicePages.initialOrigin(state.connection) != ServicePages.DEFAULT_ORIGIN) }
    var details by rememberSaveable { mutableStateOf(false) }
    var phoneOptions by rememberSaveable(state.connection?.origin) { mutableStateOf(false) }
    var removeLocally by remember { mutableStateOf<Connection?>(null) }
    var disconnecting by remember { mutableStateOf<Connection?>(null) }
    val validOrigin = remember(origin) { runCatching { BoundaryPolicy.serviceOrigin(origin.trim()) }.getOrNull() }
    val informationOrigin = state.connection?.origin ?: validOrigin
    FullScreenForm("Connect your phone", { if (!state.busy) close() }) {
        LazyColumn(Modifier.fillMaxSize().imePadding().testTag("phone-connection"), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item { Text(l10n("Sign in in your browser, then return with a one-time code."), style = MaterialTheme.typography.bodyMedium) }
            if (state.connection != null) item {
                Panel {
                    Text(l10n(if (state.requiresPairing) "Reconnect this phone" else "This phone is connected"), style = MaterialTheme.typography.titleMedium,
                        modifier = if (state.requiresPairing) Modifier.semantics { liveRegion = LiveRegionMode.Polite } else Modifier)
                    Text(l10n(if (state.connection.origin == ServicePages.DEFAULT_ORIGIN) "Career Finder" else state.connection.origin))
                    OutlinedButton(onClick = { openLink(context, ServicePages.url(state.connection.origin, "account")) },
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Manage account")) }
                    TextButton(onClick = { phoneOptions = !phoneOptions }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Phone connection options")) }
                    if (phoneOptions) {
                        Text(l10n.format("Connected address: {0}", listOf((state.connection.origin).toString())), style = MaterialTheme.typography.bodySmall)
                        Text(l10n.format("Connection expires {0}", listOf((l10n.dateTime(state.connection.expiresAt)).toString())), style = MaterialTheme.typography.bodySmall)
                        OutlinedButton(onClick = { disconnecting = state.connection }, enabled = !state.busy,
                            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Disconnect this phone")) }
                        TextButton(onClick = { removeLocally = state.connection }, enabled = !state.busy,
                            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Remove connection locally")) }
                    }
                }
            }
            item {
                Panel {
                    Text(l10n("1. Sign in and get a code"), style = MaterialTheme.typography.titleLarge)
                    Action("Sign in and get a code", validOrigin != null && !state.busy) {
                        validOrigin?.let { openLink(context, ServicePages.url(it, "connect")) }
                    }
                    Text(l10n("Choose one of the sign-in options shown on the service page, then create a one-time phone code."), style = MaterialTheme.typography.bodyMedium)
                    if (validOrigin != null && validOrigin != ServicePages.DEFAULT_ORIGIN) Text(l10n.format("Destination: {0}", listOf((validOrigin).toString())), style = MaterialTheme.typography.bodySmall)
                    Text(l10n("Use the same account to return to your saved workspace."), style = MaterialTheme.typography.bodySmall)
                }
            }
            item {
                Panel {
                    Text(l10n("2. Connect this phone"), style = MaterialTheme.typography.titleLarge)
                    OutlinedTextField(code, { code = it.take(64) }, label = { Text(l10n("One-time code")) }, modifier = Modifier.fillMaxWidth(),
                        singleLine = true, enabled = !state.busy, visualTransformation = PasswordVisualTransformation(),
                        textStyle = MaterialTheme.typography.bodyLarge.copy(textDirection = TextDirection.Ltr),
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters), shape = RoundedCornerShape(14.dp))
                    Action("Connect this phone", !state.busy && validOrigin != null && code.isNotBlank() && !state.storageBlocked) {
                        model.pair(origin, code) { code = ""; close() }
                    }
                    Text(l10n("Connecting does not upload your phone draft. You choose when to save your profile to the workspace."), style = MaterialTheme.typography.bodySmall)
                }
            }
            if (state.error != null) item {
                Text(l10n.message(state.error), color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("connection.issue"))
            }
            item {
                TextButton(onClick = { advanced = !advanced }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                    Text(l10n(if (advanced) "Hide advanced setup" else "Advanced · use another service"))
                }
                if (advanced) Panel {
                    Text(l10n("Service address"), style = MaterialTheme.typography.titleMedium)
                    Field("HTTPS service address", origin, { origin = it; code = "" }, KeyboardType.Uri, enabled = !state.busy,
                        error = if (origin.isNotBlank() && validOrigin == null) "Use the HTTPS address without a page path, query or sign-in details." else null)
                    Text(l10n("Only change this if you use another Career Finder service. Get a new code from that service’s own setup page."), style = MaterialTheme.typography.bodySmall)
                    if (origin != ServicePages.DEFAULT_ORIGIN) TextButton(onClick = { origin = ServicePages.DEFAULT_ORIGIN; code = "" }, enabled = !state.busy,
                        modifier = Modifier.heightIn(min = 48.dp)) { Text(l10n("Use Career Finder")) }
                }
            }
            item {
                Panel {
                    Text(l10n("Your privacy"), style = MaterialTheme.typography.titleLarge)
                    OutlinedButton(onClick = phoneData, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Phone data, backup and recovery")) }
                    Text(l10n("Application notes and follow-up dates stay in your phone workspace unless you export a backup. Employers receive only the details in a review you approve."), style = MaterialTheme.typography.bodyMedium)
                    TextButton(onClick = { details = !details }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n(if (details) "Hide storage details" else "How your data is stored")) }
                    if (details) {
                        Text(l10n("Phone drafts, private records and the last search are encrypted and excluded from device backup. Saving a connected profile uploads its fields and PDF to your selected service. Synced jobs and application receipts are stored there too."), style = MaterialTheme.typography.bodySmall)
                        Text(l10n("After connecting, Profile lets you review and copy a separate phone draft. Employers need an enabled integration and your approval before Career Finder can send an application."), style = MaterialTheme.typography.bodySmall)
                    }
                    if (informationOrigin != null) {
                        TextButton(onClick = { openLink(context, ServicePages.url(informationOrigin, "privacy")) },
                            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Privacy and data use")) }
                        TextButton(onClick = { openLink(context, ServicePages.url(informationOrigin, "support")) },
                            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Help and support")) }
                        TextButton(onClick = { openLink(context, ServicePages.url(informationOrigin, "account")) },
                            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Account, recovery and deletion")) }
                        Text(l10n("Account actions open in your browser. Disconnecting does not delete cloud records or employer applications."), style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
    disconnecting?.let { captured -> AlertDialog(onDismissRequest = { disconnecting = null },
        title = { Text(l10n("Disconnect this phone?")) },
        text = { Text(l10n("You will need a new code to reconnect. Your saved records stay available, and applications already sent to employers are unchanged."), Modifier.verticalScroll(rememberScrollState())) },
        confirmButton = { TextButton(onClick = { disconnecting = null; model.disconnect(captured) }, enabled = !state.busy) { Text(l10n("Disconnect")) } },
        dismissButton = { TextButton(onClick = { disconnecting = null }) { Text(l10n("Keep connected")) } }) }
    removeLocally?.let { captured -> AlertDialog(onDismissRequest = { removeLocally = null },
        title = { Text(l10n("Remove this phone’s connection?")) },
        text = { Text(l10n("This removes the local token and returns to your phone draft. It does not revoke the remote session or stop approved applications. Your connected workspace draft stays encrypted on this phone for a future pairing."), Modifier.verticalScroll(rememberScrollState())) },
        confirmButton = { TextButton(onClick = { removeLocally = null; model.removeConnectionLocally(captured) }) { Text(l10n("Remove locally")) } },
        dismissButton = { TextButton(onClick = { removeLocally = null }) { Text(l10n("Keep connection")) } }) }
}

@Composable
private fun AddOpportunityDialog(state: CareerUiState, model: CareerViewModel, close: () -> Unit) {
    val l10n = rememberCareerStrings()
    val draft = state.opportunityDraft
    var confirmClose by rememberSaveable { mutableStateOf(false) }
    val requestClose = {
        if (!state.busy) {
            if (draft.hasContent) confirmClose = true else close()
        }
    }
    FullScreenForm("Add opportunity", requestClose) {
        LazyColumn(Modifier.fillMaxSize().testTag("opportunity-editor"), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item { Heading("Save a job link", "Save a role from any country or profession. Use the employer’s HTTPS page.") }
            item { Field("Employer job link", draft.url, { value -> model.editOpportunityDraft { it.copy(url = value) } }, KeyboardType.Uri, enabled = !state.busy) }
            item { Field("Role title", draft.title, { value -> model.editOpportunityDraft { it.copy(title = value.take(200)) } }, enabled = !state.busy) }
            item { Field("Employer", draft.company, { value -> model.editOpportunityDraft { it.copy(company = value.take(200)) } }, enabled = !state.busy) }
            item { Field("City or location (optional)", draft.location, { value -> model.editOpportunityDraft { it.copy(location = value.take(200)) } }, enabled = !state.busy) }
            item { CountryChooser("Country (optional)", draft.country, !state.busy) { value -> model.editOpportunityDraft { it.copy(country = value) } } }
            item { Action("Save opportunity", !state.busy && draft.url.isNotBlank() && draft.title.isNotBlank() && draft.company.isNotBlank()) { model.saveOpportunityDraft(close) } }
            if (state.error != null) item {
                Text(l10n.message(state.error), color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("opportunity.error"))
            }
            item { Text(l10n("You can close this form and keep an unfinished draft on this phone, even if some fields are blank."), style = MaterialTheme.typography.bodySmall) }
            item { Text(l10n("Saving keeps a private record. It does not verify the vacancy or send an application. Unsupported employers remain available for manual application."), style = MaterialTheme.typography.bodySmall) }
        }
    }
    if (confirmClose) AlertDialog(onDismissRequest = { if (!state.busy) confirmClose = false },
        title = { Text(l10n("Keep this draft?")) },
        text = { Text(l10n("Keep the unfinished form on this phone, or discard it."), Modifier.verticalScroll(rememberScrollState())) },
        confirmButton = {
            Column(Modifier.fillMaxWidth()) {
                TextButton(onClick = { model.keepOpportunityDraft { confirmClose = false; close() } }, enabled = !state.busy,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Keep draft")) }
                TextButton(onClick = { model.discardOpportunityDraft { confirmClose = false; close() } }, enabled = !state.busy,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Discard")) }
                TextButton(onClick = { confirmClose = false }, enabled = !state.busy,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(l10n("Keep editing")) }
            }
        })
}

internal fun openLink(context: Context, url: String) {
    try { context.startActivity(Intent(Intent.ACTION_VIEW, BoundaryPolicy.opportunityURL(url).toUri())) }
    catch (_: Exception) { Toast.makeText(context, CareerStrings(context)("This HTTPS link could not be opened."), Toast.LENGTH_LONG).show() }
}
private fun fileSize(bytes: Long, locale: Locale): String = when {
    bytes < 1024L -> String.format(locale, "%d B", bytes)
    bytes < 1024L * 1024L -> String.format(locale, "%.1f KiB", bytes / 1024.0)
    else -> String.format(locale, "%.1f MiB", bytes / (1024.0 * 1024.0))
}
internal fun dateLabel(value: String): String = try { DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM).withLocale(Locale.getDefault()).withZone(ZoneId.systemDefault()).format(Instant.parse(value)) } catch (_: Exception) { "Time not recorded" }
private fun consentLabel(value: Any?): String = when (value) { true -> "Yes"; false -> "No"; else -> "Not provided" }
private fun receiptLabel(receipt: ApplicationReceipt): String {
    val label = when {
        receipt.verified -> "Confirmed by provider"
        receipt.state == "confirmed" && !receipt.testMode -> "Unverified record"
        receipt.state == "uncertain" -> "Outcome uncertain"
        receipt.state == "dispatching" -> "Awaiting outcome"
        receipt.state == "rate_limited" -> "Waiting for provider"
        receipt.state == "rejected" -> "Rejected by provider"
        receipt.state == "cancelled" -> "Stopped"
        receipt.state == "ready" -> "Prepared"
        else -> receipt.state.replaceFirstChar { it.titlecase() }
    }
    return if (receipt.testMode) "Test receipt · " + label else label
}
