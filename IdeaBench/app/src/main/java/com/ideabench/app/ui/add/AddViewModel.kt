package com.ideabench.app.ui.add

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ideabench.app.data.analysis.NoteBatchAnalyzer
import com.ideabench.app.data.analysis.ScreenshotAnalyzer
import com.ideabench.app.data.importer.FolderScanResult
import com.ideabench.app.data.importer.NoteImporter
import com.ideabench.app.data.importer.NoteSplitter
import com.ideabench.app.data.importer.PendingCombinedFile
import com.ideabench.app.data.importer.toItemEntity
import com.ideabench.app.data.local.ItemType
import com.ideabench.app.data.prefs.AppPreferences
import com.ideabench.app.data.prefs.SecurePrefs
import com.ideabench.app.data.repository.ItemRepository
import com.ideabench.app.data.screenshot.ScreenshotItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AddUiState(
    val hasApiKey: Boolean = false,
    val importFolderUri: String? = null,
    val scanning: Boolean = false,
    val readyCount: Int = 0,
    val pendingCombined: List<PendingCombinedFile> = emptyList(),
    val skippedFiles: List<String> = emptyList(),
    val importMessage: String? = null,
    val unanalyzedNoteCount: Int = 0,
    val analyzing: Boolean = false,
    val analyzedDone: Int = 0,
    val analyzedTotal: Int = 0,
    val analysisError: String? = null,
    val scanningGallery: Boolean = false,
    val screenshotsFound: List<ScreenshotItem> = emptyList(),
    val processingScreenshots: Boolean = false,
    val screenshotDone: Int = 0,
    val screenshotTotal: Int = 0,
    val screenshotCurrentName: String = "",
    val screenshotMessage: String? = null
)

class AddViewModel(
    private val repository: ItemRepository,
    private val noteImporter: NoteImporter,
    private val noteBatchAnalyzer: NoteBatchAnalyzer,
    private val screenshotAnalyzer: ScreenshotAnalyzer,
    private val appPreferences: AppPreferences,
    private val securePrefs: SecurePrefs
) : ViewModel() {

    private var pendingScan: FolderScanResult? = null

    private val _uiState = MutableStateFlow(
        AddUiState(
            hasApiKey = securePrefs.hasApiKey(),
            importFolderUri = appPreferences.importFolderUri
        )
    )
    val uiState: StateFlow<AddUiState> = _uiState.asStateFlow()

    init {
        refreshUnanalyzedCount()
        appPreferences.importFolderUri?.let { rescanFolder(Uri.parse(it)) }
    }

    fun refreshHasApiKey() {
        _uiState.update { it.copy(hasApiKey = securePrefs.hasApiKey()) }
    }

    private fun refreshUnanalyzedCount() {
        viewModelScope.launch {
            val count = repository.countUnanalyzedByType(ItemType.TEXT)
            _uiState.update { it.copy(unanalyzedNoteCount = count) }
        }
    }

    // ---- Folder import ----

    fun onFolderPicked(uri: Uri) {
        noteImporter.persistPermission(uri)
        appPreferences.importFolderUri = uri.toString()
        _uiState.update { it.copy(importFolderUri = uri.toString()) }
        rescanFolder(uri)
    }

    fun rescanFolder() {
        val uriString = _uiState.value.importFolderUri ?: return
        rescanFolder(Uri.parse(uriString))
    }

    private fun rescanFolder(uri: Uri) {
        _uiState.update { it.copy(scanning = true, importMessage = null) }
        viewModelScope.launch {
            val result = try {
                noteImporter.scanFolder(uri)
            } catch (e: Exception) {
                _uiState.update { it.copy(scanning = false, importMessage = "Couldn't read that folder: ${e.message}") }
                return@launch
            }
            pendingScan = result
            _uiState.update {
                it.copy(
                    scanning = false,
                    readyCount = result.readyToImport.size,
                    pendingCombined = result.pendingCombined,
                    skippedFiles = result.skippedFiles
                )
            }
        }
    }

    /** Imports every unambiguous single-note file found. Combined files need [confirmCombinedFile] first. */
    fun importReadyNotes() {
        val ready = pendingScan?.readyToImport.orEmpty()
        if (ready.isEmpty()) return
        viewModelScope.launch {
            val inserted = repository.insertAllNew(ready.map { it.toItemEntity() })
            _uiState.update {
                it.copy(
                    readyCount = 0,
                    importMessage = "Imported $inserted new note${if (inserted == 1) "" else "s"} " +
                        "(${ready.size - inserted} duplicate${if (ready.size - inserted == 1) "" else "s"} skipped)."
                )
            }
            pendingScan = pendingScan?.copy(readyToImport = emptyList())
            refreshUnanalyzedCount()
        }
    }

    fun confirmCombinedFile(file: PendingCombinedFile) {
        viewModelScope.launch {
            val inserted = repository.insertAllNew(file.allDrafts.map { it.toItemEntity() })
            _uiState.update { state ->
                state.copy(
                    pendingCombined = state.pendingCombined - file,
                    importMessage = "Imported $inserted note${if (inserted == 1) "" else "s"} from \"${file.fileName}\"."
                )
            }
            refreshUnanalyzedCount()
        }
    }

    fun skipCombinedFile(file: PendingCombinedFile) {
        _uiState.update { it.copy(pendingCombined = it.pendingCombined - file) }
    }

    // ---- Paste fallback ----

    fun importPastedText(raw: String) {
        val drafts = NoteSplitter.splitPasted(raw)
        if (drafts.isEmpty()) return
        viewModelScope.launch {
            val inserted = repository.insertAllNew(drafts.map { it.toItemEntity() })
            _uiState.update {
                it.copy(importMessage = "Added $inserted note${if (inserted == 1) "" else "s"} from paste.")
            }
            refreshUnanalyzedCount()
        }
    }

    // ---- Batch note analysis ----

    fun startOrResumeAnalysis() {
        if (_uiState.value.analyzing) return
        _uiState.update { it.copy(analyzing = true, analysisError = null) }
        viewModelScope.launch {
            val summary = noteBatchAnalyzer.analyzeAll { done, total ->
                _uiState.update { it.copy(analyzedDone = done, analyzedTotal = total) }
            }
            _uiState.update {
                it.copy(
                    analyzing = false,
                    analyzedDone = summary.analyzed,
                    analyzedTotal = summary.analyzed + summary.remaining,
                    analysisError = summary.errorMessage
                )
            }
            refreshUnanalyzedCount()
        }
    }

    // ---- Screenshot scan ----

    fun scanGalleryForScreenshots() {
        _uiState.update { it.copy(scanningGallery = true, screenshotMessage = null) }
        viewModelScope.launch {
            val found = screenshotAnalyzer.findUnprocessed()
            _uiState.update { it.copy(scanningGallery = false, screenshotsFound = found) }
        }
    }

    fun processScreenshots() {
        val screenshots = _uiState.value.screenshotsFound
        if (screenshots.isEmpty() || _uiState.value.processingScreenshots) return
        _uiState.update { it.copy(processingScreenshots = true, screenshotMessage = null) }
        viewModelScope.launch {
            val summary = screenshotAnalyzer.processAll(screenshots) { done, total, name ->
                _uiState.update { it.copy(screenshotDone = done, screenshotTotal = total, screenshotCurrentName = name) }
            }
            _uiState.update {
                it.copy(
                    processingScreenshots = false,
                    screenshotsFound = emptyList(),
                    screenshotMessage = "Processed ${summary.processed} screenshot${if (summary.processed == 1) "" else "s"}" +
                        if (summary.failed > 0) " (${summary.failed} failed — rescan to retry)." else "."
                )
            }
        }
    }
}
