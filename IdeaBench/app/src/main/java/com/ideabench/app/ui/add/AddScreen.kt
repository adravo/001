package com.ideabench.app.ui.add

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import com.ideabench.app.data.importer.PendingCombinedFile
import com.ideabench.app.ui.AppViewModelFactory

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddScreen(factory: AppViewModelFactory) {
    val viewModel: AddViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(Unit) { viewModel.refreshHasApiKey() }

    val folderPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocumentTree()
    ) { uri -> uri?.let(viewModel::onFolderPicked) }

    val imagesPermission = if (Build.VERSION.SDK_INT >= 33) {
        Manifest.permission.READ_MEDIA_IMAGES
    } else {
        Manifest.permission.READ_EXTERNAL_STORAGE
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> if (granted) viewModel.scanGalleryForScreenshots() }

    Scaffold(topBar = { TopAppBar(title = { Text("Add") }) }) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxWidth().padding(padding).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            if (!state.hasApiKey) {
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                        Text(
                            "Add your Anthropic API key in Settings before importing — new items are saved right away but won't be analyzed until a key is set.",
                            modifier = Modifier.padding(16.dp),
                            color = MaterialTheme.colorScheme.onErrorContainer
                        )
                    }
                }
            }

            item { SectionTitle("Import notes from a folder") }
            item {
                Column {
                    Text(
                        state.importFolderUri?.let { "Folder connected." } ?: "Pick your notes export folder.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { folderPicker.launch(null) }) {
                            Text(if (state.importFolderUri == null) "Choose folder" else "Change folder")
                        }
                        if (state.importFolderUri != null) {
                            OutlinedButton(onClick = viewModel::rescanFolder, enabled = !state.scanning) {
                                Text(if (state.scanning) "Scanning…" else "Re-scan folder")
                            }
                        }
                    }
                    if (state.readyCount > 0) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("${state.readyCount} note(s) ready to import.")
                        Spacer(modifier = Modifier.height(4.dp))
                        Button(onClick = viewModel::importReadyNotes) { Text("Import ${state.readyCount} notes") }
                    }
                    if (state.skippedFiles.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            "${state.skippedFiles.size} file(s) skipped (unsupported format).",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    state.importMessage?.let {
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }

            items(state.pendingCombined, key = { it.fileName }) { pending ->
                CombinedFilePreview(
                    pending = pending,
                    onConfirm = { viewModel.confirmCombinedFile(pending) },
                    onSkip = { viewModel.skipCombinedFile(pending) }
                )
            }

            item { HorizontalDivider() }

            item { SectionTitle("Analyze notes") }
            item {
                Column {
                    Text("${state.unanalyzedNoteCount} note(s) waiting to be analyzed.", style = MaterialTheme.typography.bodyMedium)
                    Spacer(modifier = Modifier.height(8.dp))
                    if (state.analyzing) {
                        LinearProgressIndicator(
                            progress = { if (state.analyzedTotal > 0) state.analyzedDone / state.analyzedTotal.toFloat() else 0f },
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text("${state.analyzedDone} / ${state.analyzedTotal} analyzed")
                    } else {
                        Button(
                            onClick = viewModel::startOrResumeAnalysis,
                            enabled = state.hasApiKey && state.unanalyzedNoteCount > 0
                        ) {
                            Text(if (state.analysisError != null) "Resume analysis" else "Analyze notes")
                        }
                    }
                    state.analysisError?.let {
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }

            item { HorizontalDivider() }

            item { SectionTitle("Screenshots") }
            item {
                Column {
                    Button(onClick = {
                        if (ContextCompat.checkSelfPermission(context, imagesPermission) ==
                            android.content.pm.PackageManager.PERMISSION_GRANTED
                        ) {
                            viewModel.scanGalleryForScreenshots()
                        } else {
                            permissionLauncher.launch(imagesPermission)
                        }
                    }, enabled = !state.scanningGallery) {
                        Text(if (state.scanningGallery) "Scanning gallery…" else "Scan gallery for screenshots")
                    }

                    if (state.screenshotsFound.isNotEmpty() && !state.processingScreenshots) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(
                            onClick = viewModel::processScreenshots,
                            enabled = state.hasApiKey
                        ) { Text("Process ${state.screenshotsFound.size} screenshots") }
                    }

                    if (state.processingScreenshots) {
                        Spacer(modifier = Modifier.height(8.dp))
                        val progress = if (state.screenshotTotal > 0) state.screenshotDone / state.screenshotTotal.toFloat() else 0f
                        LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
                        Spacer(modifier = Modifier.height(4.dp))
                        Text("${state.screenshotDone} / ${state.screenshotTotal} — ${state.screenshotCurrentName}")
                    }

                    state.screenshotMessage?.let {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }

            item { HorizontalDivider() }

            item { SectionTitle("Paste or type a note") }
            item { PasteArea(onSubmit = viewModel::importPastedText) }
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleMedium)
}

@Composable
private fun CombinedFilePreview(
    pending: PendingCombinedFile,
    onConfirm: () -> Unit,
    onSkip: () -> Unit
) {
    Card {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("\"${pending.fileName}\" looks like ${pending.allDrafts.size} notes", style = MaterialTheme.typography.titleSmall)
            Spacer(modifier = Modifier.height(8.dp))
            pending.preview.forEach { draft ->
                Text("• ${draft.title}", style = MaterialTheme.typography.bodyMedium)
            }
            if (pending.allDrafts.size > pending.preview.size) {
                Text("… and ${pending.allDrafts.size - pending.preview.size} more", style = MaterialTheme.typography.bodySmall)
            }
            Spacer(modifier = Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onConfirm) { Text("Looks right — import all") }
                OutlinedButton(onClick = onSkip) { Text("Skip this file") }
            }
        }
    }
}

@Composable
private fun PasteArea(onSubmit: (String) -> Unit) {
    var text by remember { mutableStateOf("") }
    Column {
        Text(
            "Blank lines or a lone \"---\" line split pasted text into separate notes.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(8.dp))
        OutlinedTextField(
            value = text,
            onValueChange = { text = it },
            modifier = Modifier.fillMaxWidth().height(160.dp),
            placeholder = { Text("Paste or type here…") }
        )
        Spacer(modifier = Modifier.height(8.dp))
        Button(
            onClick = {
                onSubmit(text)
                text = ""
            },
            enabled = text.isNotBlank()
        ) { Text("Add") }
    }
}
