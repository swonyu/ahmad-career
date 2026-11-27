package com.saleh.careerfinder

import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp

/** Accept only the posting's public fields; records, profile and CV have no route into the intent. */
@Composable
internal fun JobShareAction(title: String, employer: String, board: String?, url: String) {
    val l10n = rememberCareerStrings()
    val context = LocalContext.current
    val shareText = remember(title, employer, board, url) {
        runCatching { BoundaryPolicy.jobShareText(title, employer, board, url) }.getOrNull()
    }
    var preview by rememberSaveable(title, employer, board, url) { mutableStateOf(false) }
    if (shareText == null) {
        Text(l10n("Sharing is disabled for this link. Use a public job posting link without private access details."),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        return
    }
    OutlinedButton(onClick = { preview = true }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("job-share-open")) {
        Text(l10n("Share job with a friend"))
    }
    if (preview) AlertDialog(
        onDismissRequest = { preview = false },
        title = { Text(l10n("Share job with a friend")) },
        text = {
            Column(Modifier.heightIn(max = 440.dp).verticalScroll(rememberScrollState())) {
                Text(l10n("Review the job details and link below before sharing. Only share public posting links, not personal invitations. Your application record and CV are not included."),
                    style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 12.dp))
                Text(l10n("Job share preview"), style = MaterialTheme.typography.labelMedium)
                SelectionContainer {
                    Text(shareText, modifier = Modifier.fillMaxWidth().testTag("job-share-preview"),
                        style = MaterialTheme.typography.bodyMedium.merge(TextStyle(textDirection = TextDirection.Content)))
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, shareText)
                }
                try {
                    context.startActivity(Intent.createChooser(send, l10n("Share job link")))
                    preview = false
                } catch (_: Exception) {
                    Toast.makeText(context, l10n("Sharing is unavailable. Select and copy the preview instead."), Toast.LENGTH_LONG).show()
                }
            }, modifier = Modifier.heightIn(min = 48.dp).testTag("job-share-chooser")) {
                Text(l10n("Share job link"))
            }
        },
        dismissButton = {
            TextButton(onClick = { preview = false }, modifier = Modifier.heightIn(min = 48.dp)) { Text(l10n("Cancel")) }
        },
    )
}
