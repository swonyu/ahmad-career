package com.saleh.careerfinder

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
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
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
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
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { CareerTheme { CareerApp(model) } }
    }
    override fun onStart() { super.onStart(); model.setForeground(true) }
    override fun onStop() { model.setForeground(false); super.onStop() }
}

@Composable
private fun CareerTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val colors = if (dark) darkColorScheme(
        primary = Color(0xFFABD7B5), onPrimary = Color(0xFF113625), primaryContainer = Color(0xFF244A35),
        onPrimaryContainer = Color(0xFFDCECDF), secondaryContainer = Color(0xFF354B37), onSecondaryContainer = Color(0xFFD6E9CD),
        secondary = Color(0xFFC8D9BB), background = Color(0xFF101713), surface = Color(0xFF172019),
        onSurface = Color(0xFFE3EBE2), surfaceVariant = Color(0xFF2A372D), onSurfaceVariant = Color(0xFFC0CBBE),
        outline = Color(0xFF8C9B8C), outlineVariant = Color(0xFF465447)
    ) else lightColorScheme(
        primary = Color(0xFF236247), onPrimary = Color.White, primaryContainer = Color(0xFFDCECDF),
        onPrimaryContainer = Color(0xFF143C2B), secondary = Color(0xFF526B42), background = Color(0xFFF6F7F1),
        surface = Color(0xFFFFFEFA), onSurface = Color(0xFF1D2B22), surfaceVariant = Color(0xFFE8EDE3),
        onSurfaceVariant = Color(0xFF465346), secondaryContainer = Color(0xFFE0ECD7), onSecondaryContainer = Color(0xFF263D24),
        outline = Color(0xFF738275), outlineVariant = Color(0xFFCBD3C6)
    )
    val typography = Typography().run {
        copy(displayLarge = displayLarge.copy(textDirection = TextDirection.Content),
            displayMedium = displayMedium.copy(textDirection = TextDirection.Content),
            displaySmall = displaySmall.copy(textDirection = TextDirection.Content),
            headlineLarge = headlineLarge.copy(textDirection = TextDirection.Content),
            headlineMedium = headlineMedium.copy(textDirection = TextDirection.Content),
            headlineSmall = headlineSmall.copy(textDirection = TextDirection.Content),
            titleLarge = titleLarge.copy(textDirection = TextDirection.Content),
            titleMedium = titleMedium.copy(textDirection = TextDirection.Content),
            titleSmall = titleSmall.copy(textDirection = TextDirection.Content),
            bodyLarge = bodyLarge.copy(textDirection = TextDirection.Content),
            bodyMedium = bodyMedium.copy(textDirection = TextDirection.Content),
            bodySmall = bodySmall.copy(textDirection = TextDirection.Content),
            labelLarge = labelLarge.copy(textDirection = TextDirection.Content),
            labelMedium = labelMedium.copy(textDirection = TextDirection.Content),
            labelSmall = labelSmall.copy(textDirection = TextDirection.Content))
    }
    MaterialTheme(colorScheme = colors, typography = typography, content = content)
}

private data class Destination(val title: String, val icon: ImageVector)

@Composable
private fun PhoneNavigation(tabs: List<Destination>, selectedIndex: Int, select: (Int) -> Unit) {
    BoxWithConstraints {
        if (maxWidth < 420.dp && LocalDensity.current.fontScale >= 1.5f) {
            Surface(color = MaterialTheme.colorScheme.surface) {
                Column(Modifier.navigationBarsPadding().padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    tabs.chunked(2).forEach { row ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            row.forEach { item ->
                                val index = tabs.indexOf(item)
                                OutlinedButton(onClick = { select(index) },
                                    modifier = Modifier.weight(1f).heightIn(min = 56.dp).semantics {
                                        role = Role.Tab; selected = selectedIndex == index
                                    },
                                    colors = ButtonDefaults.outlinedButtonColors(
                                        containerColor = if (selectedIndex == index) MaterialTheme.colorScheme.primaryContainer else Color.Transparent,
                                        contentColor = MaterialTheme.colorScheme.onSurface),
                                    shape = RoundedCornerShape(16.dp), contentPadding = PaddingValues(horizontal = 8.dp, vertical = 10.dp)) {
                                    Icon(item.icon, contentDescription = null, modifier = Modifier.size(20.dp))
                                    Spacer(Modifier.width(8.dp))
                                    Text(item.title, style = MaterialTheme.typography.labelLarge)
                                }
                            }
                        }
                    }
                }
            }
        } else NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
            tabs.forEachIndexed { index, item ->
                NavigationBarItem(selected = selectedIndex == index, onClick = { select(index) },
                    icon = { Icon(item.icon, contentDescription = null) }, label = { Text(item.title) })
            }
        }
    }
}

@Composable
fun CareerApp(model: CareerViewModel) {
    val state by model.state.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var showConnect by rememberSaveable { mutableStateOf(false) }
    var showAdd by rememberSaveable { mutableStateOf(false) }
    val tabs = listOf(Destination("Jobs", Icons.Default.Search), Destination("Auto Apply", Icons.AutoMirrored.Filled.Send),
        Destination("Receipts", Icons.AutoMirrored.Filled.List), Destination("Profile", Icons.Default.Person))
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(model::choosePDF) }
    val exporter = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri -> uri?.let(model::exportReceipts) }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            Surface(color = MaterialTheme.colorScheme.background) {
                Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 20.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("CAREER FINDER", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                        Text("Your next chapter.", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                    }
                    IconButton(onClick = { showConnect = true }, modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp)) {
                        Icon(Icons.Default.Settings, contentDescription = "Connection and privacy settings")
                    }
                }
            }
        },
        bottomBar = { PhoneNavigation(tabs, tab) { tab = it } }
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (state.busy || !state.loaded) LinearProgressIndicator(Modifier.fillMaxWidth())
            if (state.error != null || state.notice != null) MessageBanner(state.error ?: state.notice.orEmpty(), state.error != null, model::dismissMessage)
            if (state.testService) MessageBanner("Test service: applications and receipts are simulated.", true, null)
            Box(Modifier.weight(1f)) {
                if (!state.loaded) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Opening your private workspace…") }
                else if (state.storageBlocked) StorageRecoveryScreen(state, model)
                else when (tab) {
                    0 -> JobsScreen(state, model, { showAdd = true }, { tab = 1 })
                    1 -> ApplyScreen(state, model, { showConnect = true }, { tab = 2 })
                    2 -> ReceiptsScreen(state, model) { exporter.launch("Career-Finder-Receipts-" + LocalDate.now() + ".json") }
                    3 -> ProfileScreen(state, model) { picker.launch(arrayOf("application/pdf")) }
                }
            }
        }
    }
    if (showConnect && !state.storageBlocked) ConnectionDialog(state, model) { showConnect = false }
    if (showAdd && !state.storageBlocked) AddOpportunityDialog(state, model) { showAdd = false }
    if (state.phoneImport != null && !state.storageBlocked) PhoneImportDialog(state, model)
}

@Composable
private fun StorageRecoveryScreen(state: CareerUiState, model: CareerViewModel) {
    var confirmFresh by remember { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize().testTag("storage-recovery"), contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Heading("Your private files are preserved.", "Saving is paused while this phone’s encrypted storage is unavailable.") }
        item {
            Panel {
                Text("Try storage again", style = MaterialTheme.typography.titleLarge)
                Text("A temporary device or storage problem may recover. Retrying does not resend an application.")
                Action("Retry private storage", !state.busy, model::retryStorage)
            }
        }
        item {
            Panel {
                Text("Start a separate phone workspace", style = MaterialTheme.typography.titleLarge)
                Text("If the saved data cannot be opened, you can create a new encrypted workspace. Earlier files and keys stay on this phone; they are not deleted or replaced.")
                Text("The new workspace starts empty. Service records remain on the service. You will need a new pairing code to reconnect.", style = MaterialTheme.typography.bodyMedium)
                OutlinedButton(onClick = { confirmFresh = true }, enabled = !state.busy,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text("Preserve files and start fresh") }
            }
        }
    }
    if (confirmFresh) AlertDialog(onDismissRequest = { confirmFresh = false },
        title = { Text("Create a new private workspace?") },
        text = { Text("This opens an empty local workspace while preserving the existing encrypted files. It does not recover unreadable drafts or revoke any earlier service session. Your server records stay unchanged.") },
        confirmButton = { TextButton(onClick = { confirmFresh = false; model.startFreshPrivateWorkspace() }) { Text("Create new workspace") } },
        dismissButton = { TextButton(onClick = { confirmFresh = false }) { Text("Keep current workspace") } })
}

@Composable
private fun ProfileSummary(profile: ProfileDraft) {
    listOf(
        "Name" to listOf(profile.firstName, profile.lastName).filter(String::isNotBlank).joinToString(" "),
        "Email" to profile.email, "Phone" to profile.phone,
        "Location" to listOf(profile.city, profile.country).filter(String::isNotBlank).joinToString(" · "),
        "Headline" to profile.headline, "Website" to profile.website, "Skills" to profile.skills,
        "Target roles" to profile.targetRoles, "Target countries" to profile.targetCountries,
        "Work preferences" to profile.workModes.sorted().joinToString(", "), "Experience" to profile.experienceLevel
    ).forEach { (label, value) ->
        Column {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value.ifBlank { "Not provided" }, style = MaterialTheme.typography.bodyMedium)
        }
    }
    Text("Résumé: " + (profile.resume?.name ?: "No PDF"), fontWeight = FontWeight.SemiBold)
    profile.resume?.let { Text(it.sha256, style = MaterialTheme.typography.bodySmall) }
}

@Composable
private fun ProfileConflictPanel(state: CareerUiState, model: CareerViewModel) {
    val newer = state.profileConflict ?: return
    var compare by remember { mutableStateOf(false) }
    var confirmation by remember { mutableStateOf<ProfileDraft?>(null) }
    Panel {
        StatusPill("A newer saved profile is available", true)
        Text("Your edited fields are safe on this phone. Compare them with saved version " + newer.revision + " before choosing what to keep.")
        TextButton(onClick = { compare = !compare }, modifier = Modifier.heightIn(min = 48.dp)) { Text(if (compare) "Hide comparison" else "Compare both profiles") }
        if (compare) {
            Text("Your phone draft", style = MaterialTheme.typography.titleMedium)
            ProfileSummary(state.profile)
            HorizontalDivider()
            Text("Latest saved profile", style = MaterialTheme.typography.titleMedium)
            ProfileSummary(newer)
        }
        OutlinedButton(onClick = { confirmation = newer }, enabled = !state.busy,
            modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text("Keep my edited fields") }
        Text("This keeps a private draft. It does not overwrite the service until you save again.", style = MaterialTheme.typography.bodySmall)
    }
    confirmation?.let { reviewed ->
        AlertDialog(onDismissRequest = { confirmation = null }, title = { Text("Keep your edits for review?") },
            text = {
                Column(Modifier.heightIn(max = 320.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Your draft fields will be kept against saved version " + reviewed.revision + ". You can review everything before saving.")
                    Text(when {
                        state.profile.removeResume -> "Your request to remove the PDF is kept."
                        state.profile.resume?.dataBase64 != null -> "Your newly selected PDF is kept: " + state.profile.resume.name
                        else -> "The latest saved PDF will be used: " + (reviewed.resume?.name ?: "No PDF") + ". The older file is not stored on this phone."
                    })
                    if (state.profile.resume?.dataBase64 == null && !state.profile.removeResume)
                        reviewed.resume?.let { Text("Latest file fingerprint: " + it.sha256, style = MaterialTheme.typography.bodySmall) }
                }
            },
            confirmButton = { TextButton(onClick = { confirmation = null; model.keepDraftWithLatestProfile(reviewed.revision) }) { Text("Keep as private draft") } },
            dismissButton = { TextButton(onClick = { confirmation = null }) { Text("Keep comparing") } })
    }
}

@Composable
private fun PhoneImportDialog(state: CareerUiState, model: CareerViewModel) {
    val phone = state.phoneImport ?: return
    var profile by remember { mutableStateOf(false) }
    var jobs by remember { mutableStateOf(false) }
    FullScreenForm("Review phone draft", model::closePhoneImport) {
        LazyColumn(Modifier.fillMaxSize().testTag("phone-import"), contentPadding = PaddingValues(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item { Heading("Bring your work with you.", "Choose what to copy into a private draft for this connected workspace. The original phone draft stays intact.") }
            item {
                Panel {
                    Text("Saved phone profile", style = MaterialTheme.typography.titleLarge)
                    ProfileSummary(phone.profile)
                    CheckLine("Copy this profile into the workspace draft", profile, { profile = it }, !state.busy)
                    Text("This replaces the profile draft currently shown. It is shared with the service only when you save the connected profile.", style = MaterialTheme.typography.bodySmall)
                }
            }
            if (phone.jobs.isNotEmpty()) item {
                Panel {
                    Text("Saved opportunities", style = MaterialTheme.typography.titleLarge)
                    phone.jobs.forEach { Text(it.title + " · " + it.company, style = MaterialTheme.typography.bodyMedium) }
                    CheckLine("Copy saved opportunities", jobs, { jobs = it }, !state.busy)
                    Text("Existing links are skipped. Each copied opportunity stays local until you choose Sync.", style = MaterialTheme.typography.bodySmall)
                }
            }
            if (state.profileConflict != null) item { Text("Resolve the current profile conflict before copying this draft.", color = MaterialTheme.colorScheme.error) }
            item { Action("Copy selected drafts", (profile || jobs) && !state.busy && state.profileConflict == null) { model.importPhoneDraft(profile, jobs) } }
            item { Text("Copying never applies to an employer. Your application review and approval are still required.", style = MaterialTheme.typography.bodySmall) }
        }
    }
}

@Composable
private fun MessageBanner(text: String, error: Boolean, dismiss: (() -> Unit)?) {
    Surface(color = if (error) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer) {
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, top = 10.dp, bottom = 10.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(text, Modifier.weight(1f).semantics { liveRegion = LiveRegionMode.Polite },
                style = MaterialTheme.typography.bodyMedium,
                color = if (error) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onPrimaryContainer)
            if (dismiss != null) IconButton(onClick = dismiss) { Icon(Icons.Default.Close, "Dismiss message") }
        }
    }
}

@Composable
private fun Heading(title: String, subtitle: String) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() })
        Text(subtitle, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun Panel(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Surface(modifier.fillMaxWidth(), shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
    }
}

@Composable
private fun Action(label: String, enabled: Boolean = true, onClick: () -> Unit) {
    Button(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp), shape = RoundedCornerShape(16.dp)) { Text(label) }
}

@Composable
private fun EmptyState(title: String, body: String, icon: ImageVector = Icons.Default.Search, action: String? = null, onClick: () -> Unit = {}) {
    Panel {
        Box(Modifier.size(64.dp).background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(20.dp)), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(28.dp))
        }
        Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
        Text(body, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (action != null) Action(action, onClick = onClick)
    }
}

@Composable
private fun JobsScreen(state: CareerUiState, model: CareerViewModel, add: () -> Unit, review: () -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    val filtered = state.jobs.filter { (it.title + " " + it.company + " " + it.location + " " + it.country).contains(query, ignoreCase = true) }
    val context = LocalContext.current
    LazyColumn(Modifier.fillMaxSize().testTag("jobs-list"), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Heading("Make room for possibility.", "Save opportunities in any country or profession. Build a search that fits you.") }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedButton(onClick = add, modifier = Modifier.weight(1f).heightIn(min = 52.dp)) { Icon(Icons.Default.Add, null); Spacer(Modifier.width(8.dp)); Text("Add opportunity") }
                if (state.connection != null) IconButton(onClick = model::refresh, enabled = !state.busy) { Icon(Icons.Default.Refresh, "Refresh saved opportunities") }
            }
        }
        if (state.jobs.isNotEmpty()) item { Field("Search saved opportunities", query, { query = it }, type = KeyboardType.Text) }
        if (state.jobs.isEmpty()) item { EmptyState("Start with one good opportunity.", "Paste an employer’s job link and save its details. Your list starts empty, and your private profile is yours to create.", action = "Save your first opportunity", onClick = add) }
        else if (filtered.isEmpty()) item { EmptyState("No saved opportunities match.", "Try another title, company or location. Your saved roles are still here.") }
        items(filtered, key = Opportunity::id) { job ->
            Panel {
                Text(job.company.ifBlank { "Employer" }, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
                Text(job.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                Text(listOf(job.location, job.country).filter(String::isNotBlank).joinToString(" · ").ifBlank { "Location not recorded" }, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(if (job.localOnly) "Saved on this phone" else "Saved to your workspace", style = MaterialTheme.typography.labelMedium)
                if (job.id in state.manualApplied) StatusPill("Applied elsewhere", false)
                OutlinedButton(onClick = { openLink(context, job.url) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Open employer page") }
                if (job.localOnly && state.connection != null) TextButton(onClick = { model.syncOpportunity(job) }, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Sync this opportunity") }
                if (!job.localOnly) {
                    CheckLine("Select for Auto Apply review", job.id in state.selected, { model.toggleJob(job.id) }, !state.busy)
                    if (job.id in state.selected) TextButton(onClick = review, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Continue to Auto Apply") }
                }
            }
        }
        item { Text("Saving a link does not verify its availability or submit an application. Automatic applications depend on a supported employer integration.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

@Composable
private fun ApplyScreen(state: CareerUiState, model: CareerViewModel, connect: () -> Unit, receipts: () -> Unit) {
    val context = LocalContext.current
    val plan = state.plan
    var approved by remember(plan?.id, plan?.digest) { mutableStateOf(false) }
    val selectedJobs = state.jobs.filter { it.id in state.selected && !it.localOnly }
    LazyColumn(Modifier.fillMaxSize().imePadding().testTag("apply-list"), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Heading("A clear review. A real receipt.", "Auto Apply sends the exact details you approve to supported employers. You stay in control of every batch.") }
        if (state.connection == null || state.requiresPairing) item {
            EmptyState("Connect when you’re ready.", "Keep building your profile and saved roles on this phone. Securely pair a service to review and submit supported applications.", Icons.Default.Lock, "Connect service", connect)
        }
        if (state.activePlans.isNotEmpty()) item {
            Panel {
                Text("Applications are in progress", style = MaterialTheme.typography.titleLarge)
                Text("A stop request cancels jobs that have not been dispatched. Receipts show the actual outcome for anything already sent.")
                if (state.clientContinuation) Text("Keep Career Finder open to continue the approved batch. Leaving the app pauses the next request; an application already sent may still finish.", style = MaterialTheme.typography.bodySmall)
                if (state.activePlans.any { it in state.continuationHolds }) Text("Continuation is paused on this phone for a stop request. Refresh receipts to check the service outcome, or request Stop again if needed.", style = MaterialTheme.typography.bodySmall)
                state.activePlans.forEach { id -> OutlinedButton(onClick = { model.stop(id) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Stop remaining applications") } }
                TextButton(onClick = receipts, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("View receipts") }
            }
        }
        items(state.recoverablePlans.filter { it.id != plan?.id && !(it.unapproved && it.id in state.obsoleteReviews) }, key = { "recovery-" + it.id }) { savedPlan ->
            Panel {
                Text("Continue an earlier review", style = MaterialTheme.typography.titleLarge)
                Text("Review the original application details, then approve again. Requests with an uncertain outcome cannot be resumed.")
                savedPlan.items.filter { it.state == "rate_limited" }.forEach { Text(it.title + " · Wait until " + dateLabel(it.retryAt), style = MaterialTheme.typography.bodySmall) }
                OutlinedButton(onClick = { model.reviewRecovered(savedPlan) }, enabled = !state.busy && !savedPlan.expired(), modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Review remaining applications") }
            }
        }
        if (state.connection != null && selectedJobs.isEmpty() && plan == null) item { EmptyState("Choose your opportunities.", "Select synced jobs in the Jobs tab, then return here for a personal, employer-by-employer review.", Icons.Default.Check) }
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
                if (!reviewed?.privacyPolicyUrl.isNullOrBlank()) TextButton(onClick = { openLink(context, reviewed.privacyPolicyUrl) }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Read this employer’s privacy policy") }
                if (reviewed?.state == "blocked") {
                    StatusPill("Needs attention", true)
                    Text(reviewed.reason, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    OutlinedButton(onClick = { openLink(context, job.url) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Complete on employer site") }
                }
            }
        }
        if (selectedJobs.isNotEmpty() && !state.reviewingRecoveredPlan) item {
            if (state.profileDirty) Text("Save your profile before preparing the review.", color = MaterialTheme.colorScheme.error)
            Action(if (state.obsoleteReviews.isNotEmpty() || plan?.unapproved == true) "Stop earlier review and prepare update" else "Prepare application review",
                state.connection != null && !state.busy && !state.profileDirty && !state.requiresPairing, model::prepare)
            Text("Preparing sends nothing to employers. Required custom questions or an unavailable connector will be shown clearly.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (plan != null) {
            item { Heading("Review what will be shared.", "This review uses profile version " + plan.profileRevision + ". Expires " + dateLabel(plan.expiresAt) + ".") }
            items(plan.items, key = { "review-" + it.jobId }) { item -> ReviewCard(item) }
            item {
                Panel {
                    val ready = plan.items.count(ReviewItem::canSubmitNow)
                    Text(ready.toString() + if (ready == 1) " application ready" else " applications ready", style = MaterialTheme.typography.titleLarge)
                    if (state.testService) Text("This is a test service. Any generated receipt is simulated and does not count as a real application.", color = MaterialTheme.colorScheme.error)
                    CheckLine("I reviewed these details and authorize sending the ready applications to the employers shown above.", approved, { approved = it }, !state.busy)
                    Action(if (state.testService) "Run approved test applications" else "Approve and Auto Apply",
                        approved && ready > 0 && !state.busy && !plan.expired() && !state.profileDirty && !state.requiresPairing) { model.submit(plan) }
                    if (plan.items.any { it.state == "rate_limited" }) TextButton(onClick = model::refresh, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Refresh cooldown availability") }
                    OutlinedButton(onClick = { model.stop(plan.id) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Stop this batch") }
                    Text("Confirmed means the provider accepted the application. It does not mean recruiter review, an interview or an offer.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun ReviewCard(item: ReviewItem) {
    var fingerprint by remember(item.jobId) { mutableStateOf(false) }
    val context = LocalContext.current
    Panel {
        StatusPill(if (item.canSubmitNow()) "Ready for your approval" else "Not ready to send", !item.canSubmitNow())
        Text(item.title, style = MaterialTheme.typography.titleLarge)
        Text(item.company, color = MaterialTheme.colorScheme.primary)
        listOf("name" to "Name", "email" to "Email", "phone" to "Phone", "website" to "Website", "comments" to "Message").forEach { (key, label) ->
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(item.payload.safeString(key).ifBlank { "Not shared" })
            }
        }
        Text("Application data processing: " + consentLabel(item.payload.opt("consentStore")))
        Text("Future opportunities: " + consentLabel(item.payload.opt("consentMarketing")))
        if (item.privacyPolicyUrl.isNotBlank()) TextButton(onClick = { openLink(context, item.privacyPolicyUrl) },
            modifier = Modifier.heightIn(min = 48.dp)) { Text("Read employer privacy policy") }
        HorizontalDivider()
        Text(item.resume?.name ?: "No PDF selected", fontWeight = FontWeight.SemiBold)
        if (item.resume != null) {
            Text(fileSize(item.resume.size) + " · PDF résumé", style = MaterialTheme.typography.bodySmall)
            TextButton(onClick = { fingerprint = !fingerprint }, modifier = Modifier.heightIn(min = 48.dp)) { Text(if (fingerprint) "Hide file fingerprint" else "Check file fingerprint") }
            if (fingerprint) Text(item.resume.sha256, style = MaterialTheme.typography.bodySmall)
        }
        if (item.reason.isNotBlank()) Text(item.reason, color = MaterialTheme.colorScheme.error)
        if (item.state == "rate_limited") Text("Provider cooldown: " + dateLabel(item.retryAt), style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun ReceiptsScreen(state: CareerUiState, model: CareerViewModel, export: () -> Unit) {
    val real = state.receipts.count(ApplicationReceipt::verified)
    LazyColumn(Modifier.fillMaxSize().testTag("receipts-list"), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Heading("Every application, accounted for.", "Confirmed receipts, pending outcomes and stopped applications stay separate.") }
        item {
            Panel {
                Text(real.toString(), style = MaterialTheme.typography.displayMedium, color = MaterialTheme.colorScheme.primary)
                Text(if (real == 1) "verified application receipt" else "verified application receipts", style = MaterialTheme.typography.titleMedium)
                Text("Only live provider acceptance with a receipt ID is counted. Test results and uncertain requests are excluded.", style = MaterialTheme.typography.bodySmall)
                if (state.connection != null) {
                    OutlinedButton(onClick = model::refresh, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Refresh outcomes") }
                    TextButton(onClick = export, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Export receipt records") }
                }
            }
        }
        if (state.receipts.isEmpty()) item { EmptyState("Your first receipt belongs here.", "A saved job or opened employer link does not create a receipt. After an approved application, its actual outcome appears here.", Icons.AutoMirrored.Filled.List) }
        items(state.receipts, key = ApplicationReceipt::id) { receipt ->
            Panel {
                StatusPill(receiptLabel(receipt), receipt.state in setOf("uncertain", "rejected", "rate_limited") || receipt.testMode)
                Text(receipt.title, style = MaterialTheme.typography.titleLarge)
                Text(receipt.company, color = MaterialTheme.colorScheme.primary)
                Text(dateLabel(receipt.date), style = MaterialTheme.typography.bodySmall)
                Text(when {
                    receipt.testMode -> "Test evidence only. No real employer application is claimed."
                    receipt.verified -> "The provider accepted this application. Receipt: " + receipt.applicationId
                    receipt.state == "uncertain" -> "Acceptance could not be confirmed. Check the employer’s records before considering another application. Automatic resubmission is blocked."
                    receipt.state == "dispatching" -> "The service has dispatched the application. A provider outcome is still pending."
                    receipt.state == "rate_limited" -> "The provider requested a wait. A fresh review can continue only when the service’s cooldown permits it."
                    receipt.state == "cancelled" -> "Remaining work was stopped. Any earlier provider outcome is preserved."
                    receipt.state == "ready" -> "Prepared and waiting; not yet dispatched."
                    receipt.state == "confirmed" -> "This record lacks verified live evidence and is not counted as a live application."
                    else -> "Review the recorded outcome before preparing another application."
                })
                if (receipt.error.isNotBlank()) Text(receipt.error, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        items(state.activePlans) { id -> OutlinedButton(onClick = { model.stop(id) }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Stop remaining applications") } }
    }
}

@Composable
private fun ProfileScreen(state: CareerUiState, model: CareerViewModel, choosePDF: () -> Unit) {
    val profile = state.profile
    var reload by remember { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize().imePadding().testTag("profile-list"), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Heading("A profile that is yours.", "Start with your own experience and preferences. Save a PDF résumé before preparing applications.") }
        item {
            Panel {
                Text(if (state.profileDirty) "You have a profile draft" else if (state.connection == null) "Private on this phone" else "Your connected profile", style = MaterialTheme.typography.titleMedium)
                Text(if (state.connection == null) "Edits are kept as an encrypted draft on this phone. After pairing, you can review and copy this draft into the connected workspace." else "Edits stay in an encrypted draft on this phone until you save to the service. Employers receive only the fields shown in an approved review.", style = MaterialTheme.typography.bodySmall)
                if (state.connection != null) OutlinedButton(onClick = model::inspectPhoneDraft, enabled = !state.busy,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Review saved phone draft") }
            }
        }
        if (state.profileConflict != null) item { ProfileConflictPanel(state, model) }
        item { Field("First or single name", profile.firstName, { model.editProfile { p -> p.copy(firstName = it) } }, enabled = !state.busy) }
        item { Field("Last name (optional)", profile.lastName, { model.editProfile { p -> p.copy(lastName = it) } }, enabled = !state.busy) }
        item { Field("Email", profile.email, { model.editProfile { p -> p.copy(email = it) } }, KeyboardType.Email, enabled = !state.busy) }
        item { Field("Phone (optional)", profile.phone, { model.editProfile { p -> p.copy(phone = it) } }, KeyboardType.Phone, enabled = !state.busy) }
        item { Field("Professional headline (optional)", profile.headline, { model.editProfile { p -> p.copy(headline = it) } }, enabled = !state.busy) }
        item { CountryChooser("Your country (optional)", profile.country, !state.busy) { model.editProfile { p -> p.copy(country = it) } } }
        item { Field("City (optional)", profile.city, { model.editProfile { p -> p.copy(city = it) } }, enabled = !state.busy) }
        item { Field("Website or portfolio (optional)", profile.website, { model.editProfile { p -> p.copy(website = it) } }, KeyboardType.Uri, enabled = !state.busy) }
        item {
            Panel {
                Text("Your résumé", style = MaterialTheme.typography.titleLarge)
                Text(profile.resume?.name ?: "Choose your own PDF. No template or personal details are prefilled.")
                if (profile.resume != null) Text(fileSize(profile.resume.size) + " · PDF", style = MaterialTheme.typography.bodySmall)
                Action(if (profile.resume == null) "Choose PDF résumé" else "Replace PDF résumé", !state.busy, choosePDF)
                if (profile.resume != null) TextButton(onClick = model::removePDF, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Remove selected résumé") }
                Text("Up to 5 MiB. The exact file name and fingerprint appear in the application review.", style = MaterialTheme.typography.bodySmall)
            }
        }
        item { Field("Skills (separate with commas)", profile.skills, { model.editProfile { p -> p.copy(skills = it) } }, singleLine = false, enabled = !state.busy) }
        item { Field("Roles you want (separate with commas)", profile.targetRoles, { model.editProfile { p -> p.copy(targetRoles = it) } }, singleLine = false, enabled = !state.busy) }
        item { Field("Target country codes (optional, e.g. SA, GB)", profile.targetCountries, { model.editProfile { p -> p.copy(targetCountries = it.uppercase()) } }, enabled = !state.busy) }
        item {
            Panel {
                Text("Work preferences", style = MaterialTheme.typography.titleLarge)
                listOf("on-site" to "On site", "hybrid" to "Hybrid", "remote" to "Remote").forEach { (value, label) ->
                    CheckLine(label, value in profile.workModes, { checked -> model.editProfile { p -> p.copy(workModes = if (checked) p.workModes + value else p.workModes - value) } }, !state.busy)
                }
                Text("Experience level", style = MaterialTheme.typography.labelLarge)
                Row(Modifier.horizontalScroll(rememberScrollState()).selectableGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("any" to "Any", "entry" to "Entry", "mid" to "Mid", "senior" to "Senior").forEach { (value, label) ->
                        FilterChip(selected = profile.experienceLevel == value, onClick = { model.editProfile { it.copy(experienceLevel = value) } }, label = { Text(label) }, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp).semantics { role = Role.RadioButton })
                    }
                }
            }
        }
        item {
            Action(if (state.connection == null) "Save profile on this phone" else "Save profile to workspace",
                !state.busy && !state.storageBlocked && state.profileConflict == null, model::saveProfile)
            if (state.profileDirty && state.connection != null) TextButton(onClick = { reload = true }, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Reload saved profile") }
        }
    }
    if (reload) AlertDialog(onDismissRequest = { reload = false }, title = { Text("Reload the saved profile?") },
        text = { Text("This replaces the edits currently shown with the saved version.") },
        confirmButton = { TextButton(onClick = { reload = false; model.reloadProfile() }) { Text("Reload") } },
        dismissButton = { TextButton(onClick = { reload = false }) { Text("Keep editing") } })
}

@Composable
private fun Field(label: String, value: String, changed: (String) -> Unit, type: KeyboardType = KeyboardType.Text, singleLine: Boolean = true, enabled: Boolean = true) {
    OutlinedTextField(value = value, onValueChange = { changed(it.take(if (singleLine) 2000 else 5000)) }, label = { Text(label) },
        modifier = Modifier.fillMaxWidth(), singleLine = singleLine, minLines = if (singleLine) 1 else 3,
        keyboardOptions = KeyboardOptions(keyboardType = type), enabled = enabled, shape = RoundedCornerShape(14.dp))
}

@Composable
private fun CheckLine(label: String, checked: Boolean, changed: (Boolean) -> Unit, enabled: Boolean = true) {
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp)
        .toggleable(value = checked, enabled = enabled, role = Role.Checkbox, onValueChange = changed)
        .semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked, null, enabled = enabled, modifier = Modifier.clearAndSetSemantics {})
        Text(label, Modifier.padding(start = 8.dp).weight(1f), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun ConsentChoice(label: String, value: Boolean?, enabled: Boolean, changed: (Boolean?) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Row(Modifier.horizontalScroll(rememberScrollState()).selectableGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(null to "Not decided", true to "Yes", false to "No").forEach { (choice, text) ->
                FilterChip(value == choice, { changed(choice) }, label = { Text(text) }, enabled = enabled,
                    modifier = Modifier.heightIn(min = 48.dp).semantics { role = Role.RadioButton; contentDescription = label + ": " + text })
            }
        }
    }
}

@Composable
private fun CountryChooser(label: String, value: String, enabled: Boolean = true, changed: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    var search by remember { mutableStateOf("") }
    val countries = remember { Locale.getISOCountries().map { it to Locale.Builder().setRegion(it).build().displayCountry }.sortedBy { it.second } }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, style = MaterialTheme.typography.labelLarge)
        OutlinedButton(onClick = { open = true }, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp), shape = RoundedCornerShape(14.dp)) {
            Text(if (value.isBlank()) "Not selected" else countries.find { it.first == value }?.second ?: value, Modifier.weight(1f))
            Icon(Icons.Default.ArrowDropDown, null)
        }
    }
    if (open) AlertDialog(onDismissRequest = { open = false }, title = { Text("Choose a country") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Field("Search countries", search, { search = it })
                LazyColumn(Modifier.heightIn(max = 320.dp)) {
                    item { TextButton(onClick = { changed(""); open = false }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Not selected") } }
                    items(countries.filter { (it.first + " " + it.second).contains(search, true) }, key = { it.first }) { (code, name) ->
                        TextButton(onClick = { changed(code); open = false; search = "" }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(name + " · " + code) }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { open = false }) { Text("Close") } })
}

@Composable
private fun StatusPill(label: String, caution: Boolean) {
    Surface(shape = RoundedCornerShape(10.dp), color = if (caution) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.primaryContainer) {
        Text(label, Modifier.padding(horizontal = 10.dp, vertical = 7.dp), style = MaterialTheme.typography.labelMedium,
            color = if (caution) MaterialTheme.colorScheme.onSecondaryContainer else MaterialTheme.colorScheme.onPrimaryContainer)
    }
}

@Composable
private fun FullScreenForm(title: String, close: () -> Unit, content: @Composable () -> Unit) {
    Dialog(onDismissRequest = close, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column(Modifier.safeDrawingPadding().imePadding()) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = close) { Icon(Icons.Default.Close, "Close " + title) }
                    Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(start = 8.dp))
                }
                content()
            }
        }
    }
}

@Composable
private fun ConnectionDialog(state: CareerUiState, model: CareerViewModel, close: () -> Unit) {
    val context = LocalContext.current
    var origin by rememberSaveable(state.connection?.origin) { mutableStateOf(ServicePages.initialOrigin(state.connection)) }
    var code by remember { mutableStateOf("") }
    var removeLocally by remember { mutableStateOf(false) }
    val validOrigin = remember(origin) { runCatching { BoundaryPolicy.serviceOrigin(origin.trim()) }.getOrNull() }
    val informationOrigin = state.connection?.origin ?: validOrigin
    FullScreenForm("Private connection", close) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item { Heading("Your phone. Your workspace.", "Open secure setup in your browser, sign in there and create a one-time pairing code. Return here to connect this phone. Your password and employer API keys stay out of the app.") }
            if (state.connection != null) item {
                Panel {
                    Text("Connected service", style = MaterialTheme.typography.titleMedium)
                    Text(state.connection.origin)
                    Text("Session expires " + dateLabel(state.connection.expiresAt), style = MaterialTheme.typography.bodySmall)
                    OutlinedButton(onClick = model::disconnect, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Revoke connection on this phone") }
                    Text("Revocation requires the service to be reachable. It keeps your application records.", style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = { removeLocally = true }, enabled = !state.busy,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Remove connection locally") }
                }
            }
            item { Field("HTTPS service address", origin, { origin = it }, KeyboardType.Uri, enabled = !state.busy) }
            item {
                OutlinedButton(onClick = { validOrigin?.let { openLink(context, ServicePages.url(it, "connect")) } },
                    enabled = validOrigin != null && !state.busy,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Open secure connection setup") }
                Text(if (validOrigin == ServicePages.DEFAULT_ORIGIN)
                    "The hosted setup page uses ChatGPT sign-in in your browser. Create a fresh code, then paste it below."
                    else "Use this service’s setup page, or request a one-time code from its operator. Check the address before pairing.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            item {
                OutlinedTextField(code, { code = it.take(64) }, label = { Text("One-time pairing code") }, modifier = Modifier.fillMaxWidth(),
                    singleLine = true, enabled = !state.busy, visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters), shape = RoundedCornerShape(14.dp))
            }
            item { Action("Pair this phone", !state.busy && validOrigin != null && code.isNotBlank() && !state.storageBlocked) { model.pair(origin, code) { code = ""; close() } } }
            if (state.error != null) item { Text(state.error, color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
            item {
                Panel {
                    Text("Built around your privacy", style = MaterialTheme.typography.titleLarge)
                    Text("Connection tokens and saved phone drafts are encrypted with Android Keystore and excluded from backup. Saving a connected profile uploads its fields and PDF to the selected service. Synced opportunities and application receipts are also stored there.")
                    Text("The hosted service keeps this data in your cloud workspace. Employers receive application data only through an approved review and an enabled employer integration. A confirmed receipt is required before an application counts as verified.")
                    Text("After pairing, Profile lets you review and copy your saved phone draft. Nothing is uploaded by pairing alone.", style = MaterialTheme.typography.bodySmall)
                    if (informationOrigin != null) {
                        Text("Service information: $informationOrigin", style = MaterialTheme.typography.bodySmall)
                        TextButton(onClick = { openLink(context, ServicePages.url(informationOrigin, "privacy")) },
                            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Privacy and data use") }
                        TextButton(onClick = { openLink(context, ServicePages.url(informationOrigin, "support")) },
                            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Help and support") }
                        TextButton(onClick = { openLink(context, ServicePages.url(informationOrigin, "account")) },
                            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Account, recovery and deletion") }
                        Text("Account actions open in your browser. Removing this phone’s connection does not delete cloud records or applications already sent to employers.", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
    if (removeLocally) AlertDialog(onDismissRequest = { removeLocally = false },
        title = { Text("Remove this phone’s connection?") },
        text = { Text("This removes the local token and returns to your phone draft. It does not revoke the remote session or stop approved applications. Your connected workspace draft stays encrypted on this phone for a future pairing.") },
        confirmButton = { TextButton(onClick = { removeLocally = false; model.removeConnectionLocally() }) { Text("Remove locally") } },
        dismissButton = { TextButton(onClick = { removeLocally = false }) { Text("Keep connection") } })
}

@Composable
private fun AddOpportunityDialog(state: CareerUiState, model: CareerViewModel, close: () -> Unit) {
    var url by rememberSaveable { mutableStateOf("") }
    var title by rememberSaveable { mutableStateOf("") }
    var company by rememberSaveable { mutableStateOf("") }
    var location by rememberSaveable { mutableStateOf("") }
    var country by rememberSaveable { mutableStateOf("") }
    FullScreenForm("Add opportunity", close) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item { Heading("Keep the possibilities close.", "Save a role from any country or profession. Use the employer’s HTTPS page.") }
            item { Field("Employer job link", url, { url = it }, KeyboardType.Uri, enabled = !state.busy) }
            item { Field("Role title", title, { title = it }, enabled = !state.busy) }
            item { Field("Employer", company, { company = it }, enabled = !state.busy) }
            item { Field("City or location (optional)", location, { location = it }, enabled = !state.busy) }
            item { CountryChooser("Country (optional)", country, !state.busy) { country = it } }
            item { Action("Save opportunity", !state.busy && url.isNotBlank() && title.isNotBlank() && company.isNotBlank()) { model.addOpportunity(url, title, company, location, country, close) } }
            if (state.error != null) item { Text(state.error, color = MaterialTheme.colorScheme.error) }
            item { Text("Saving keeps a private record. It does not verify the vacancy or send an application. Unsupported employers remain available for manual application.", style = MaterialTheme.typography.bodySmall) }
        }
    }
}

private fun openLink(context: Context, url: String) {
    try { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(BoundaryPolicy.opportunityURL(url)))) }
    catch (_: Exception) { Toast.makeText(context, "This HTTPS link could not be opened.", Toast.LENGTH_LONG).show() }
}
private fun fileSize(bytes: Long): String = String.format(Locale.getDefault(), "%.1f MiB", bytes / (1024.0 * 1024.0))
private fun dateLabel(value: String): String = try { DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM).withLocale(Locale.getDefault()).withZone(ZoneId.systemDefault()).format(Instant.parse(value)) } catch (_: Exception) { "Time not recorded" }
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
