package com.ideabench.app.data.importer

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Scans a user-picked notes export folder (Storage Access Framework) and turns whatever it
 * finds into [NoteDraft]s: one file per note, a single combined export, .html, or Google Keep
 * Takeout .json. See [FolderScanResult] — files detected as "combined" need user confirmation
 * (via the preview) before they're actually imported.
 */
class NoteImporter(private val context: Context) {

    fun persistPermission(uri: Uri) {
        context.contentResolver.takePersistableUriPermission(
            uri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION
        )
    }

    fun hasPersistedPermission(uri: Uri): Boolean =
        context.contentResolver.persistedUriPermissions.any { it.uri == uri && it.isReadPermission }

    suspend fun scanFolder(treeUri: Uri): FolderScanResult = withContext(Dispatchers.IO) {
        val root = DocumentFile.fromTreeUri(context, treeUri)
            ?: return@withContext FolderScanResult(emptyList(), emptyList(), emptyList())

        val files = mutableListOf<DocumentFile>()
        collectFiles(root, files, depth = 0)

        val ready = mutableListOf<NoteDraft>()
        val pending = mutableListOf<PendingCombinedFile>()
        val skipped = mutableListOf<String>()

        for (file in files) {
            val name = file.name ?: continue
            try {
                when {
                    name.endsWith(".json", ignoreCase = true) -> {
                        val raw = readText(file.uri)
                        val drafts = KeepJsonParser.parse(raw, name)
                        if (drafts.isEmpty() && raw.isNotBlank()) skipped += name else ready += drafts
                    }

                    name.endsWith(".html", ignoreCase = true) || name.endsWith(".htm", ignoreCase = true) -> {
                        val stripped = HtmlStripper.strip(readText(file.uri))
                        handleTextLike(stripped, name, ready, pending)
                    }

                    name.endsWith(".txt", ignoreCase = true) ||
                        name.endsWith(".md", ignoreCase = true) ||
                        name.endsWith(".markdown", ignoreCase = true) -> {
                        val raw = readText(file.uri)
                        handleTextLike(raw, name, ready, pending, singleFileTitle = name.substringBeforeLast('.'))
                    }

                    else -> skipped += name
                }
            } catch (e: Exception) {
                skipped += name
            }
        }

        FolderScanResult(ready, pending, skipped)
    }

    /** Commits a previously-previewed combined file's notes into the ready-to-import list. */
    fun confirm(pendingFile: PendingCombinedFile): List<NoteDraft> = pendingFile.allDrafts

    private fun handleTextLike(
        raw: String,
        fileName: String,
        ready: MutableList<NoteDraft>,
        pending: MutableList<PendingCombinedFile>,
        singleFileTitle: String? = null
    ) {
        if (raw.isBlank()) return
        val result = NoteSplitter.detectAndSplit(raw, sourceInfo = fileName, minMatches = 2)
        if (result.strategy == SplitStrategy.NONE) {
            val body = result.drafts.firstOrNull()?.body ?: raw.trim()
            val title = singleFileTitle?.takeIf { it.isNotBlank() } ?: result.drafts.firstOrNull()?.title.orEmpty()
            ready += NoteDraft(title = title.ifBlank { "Untitled note" }, body = body, sourceInfo = fileName)
        } else {
            pending += PendingCombinedFile(fileName = fileName, strategy = result.strategy, allDrafts = result.drafts)
        }
    }

    private fun collectFiles(dir: DocumentFile, out: MutableList<DocumentFile>, depth: Int) {
        if (depth > MAX_DEPTH) return
        for (child in dir.listFiles()) {
            when {
                child.isDirectory -> collectFiles(child, out, depth + 1)
                child.isFile -> out += child
            }
        }
    }

    private fun readText(uri: Uri): String {
        context.contentResolver.openInputStream(uri)?.use { stream ->
            return stream.bufferedReader(Charsets.UTF_8).readText()
        }
        return ""
    }

    companion object {
        private const val MAX_DEPTH = 4
    }
}
