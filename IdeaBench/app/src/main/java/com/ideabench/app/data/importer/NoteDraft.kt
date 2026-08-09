package com.ideabench.app.data.importer

/** A note pulled from disk/paste/share, not yet written to Room or analyzed. */
data class NoteDraft(
    val title: String,
    val body: String,
    val sourceInfo: String
)

enum class SplitStrategy {
    DELIMITER_LINES,
    DATE_HEADERS,
    BLANK_LINES,
    NONE
}

data class SplitResult(
    val strategy: SplitStrategy,
    val drafts: List<NoteDraft>
)

/** A large file detected as containing many notes; needs user confirmation before import. */
data class PendingCombinedFile(
    val fileName: String,
    val strategy: SplitStrategy,
    val allDrafts: List<NoteDraft>
) {
    val preview: List<NoteDraft> get() = allDrafts.take(5)
}

data class FolderScanResult(
    val readyToImport: List<NoteDraft>,
    val pendingCombined: List<PendingCombinedFile>,
    val skippedFiles: List<String>
)
