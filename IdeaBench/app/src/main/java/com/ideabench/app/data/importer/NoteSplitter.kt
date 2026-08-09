package com.ideabench.app.data.importer

/**
 * Detects how a combined export (many notes concatenated in one file) is separated and
 * splits it into individual [NoteDraft]s. Three separator styles are recognized, in this
 * priority order: repeated-delimiter lines ("----", "===="), date/timestamp header lines
 * ("August 8", "2023-08-08"), and runs of 2+ blank lines. Whichever pattern occurs most
 * (and clears [minMatches]) wins; if none clears the bar, the whole text is returned as a
 * single note.
 */
object NoteSplitter {

    private val delimiterLineRegex = Regex("""^\s*([-=*_~])\1{2,}\s*$""")

    private val monthNames =
        "January|February|March|April|May|June|July|August|September|October|November|December|" +
            "Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec"

    private val dateHeaderRegex = Regex(
        """(?i)^\s*(($monthNames)\.?\s+\d{1,2}(st|nd|rd|th)?(,?\s*\d{4})?|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}/\d{1,2}/\d{2,4})\s*$"""
    )

    private val blankRunRegex = Regex("""\n[ \t]*\n[ \t]*\n+""")

    fun detectAndSplit(raw: String, sourceInfo: String, minMatches: Int = 2): SplitResult {
        val text = raw.replace("\r\n", "\n").replace('\r', '\n')
        if (text.isBlank()) return SplitResult(SplitStrategy.NONE, emptyList())

        val lines = text.split("\n")
        val delimiterIndices = lines.indices.filter { delimiterLineRegex.matches(lines[it]) }
        val dateHeaderIndices = lines.indices.filter { dateHeaderRegex.matches(lines[it].trim()) }
        val blankRunCount = blankRunRegex.findAll(text).count()

        return when {
            delimiterIndices.size >= minMatches ->
                SplitResult(
                    SplitStrategy.DELIMITER_LINES,
                    splitAtLines(lines, delimiterIndices, keepMatchedLine = false, sourceInfo = sourceInfo)
                )

            dateHeaderIndices.size >= minMatches ->
                SplitResult(
                    SplitStrategy.DATE_HEADERS,
                    splitAtLines(lines, dateHeaderIndices, keepMatchedLine = true, sourceInfo = sourceInfo)
                )

            blankRunCount >= minMatches ->
                SplitResult(
                    SplitStrategy.BLANK_LINES,
                    text.split(blankRunRegex)
                        .map { it.trim() }
                        .filter { it.isNotEmpty() }
                        .map { toDraft(it, sourceInfo) }
                )

            else -> SplitResult(SplitStrategy.NONE, listOf(toDraft(text.trim(), sourceInfo)))
        }
    }

    /** Paste-screen fallback: blank lines or a lone "---" line separate notes I type/paste. */
    fun splitPasted(raw: String): List<NoteDraft> {
        if (raw.isBlank()) return emptyList()
        val result = detectAndSplit(raw, sourceInfo = "Pasted", minMatches = 1)
        return if (result.strategy == SplitStrategy.NONE) {
            listOf(toDraft(raw.trim(), "Pasted"))
        } else {
            result.drafts
        }
    }

    private fun splitAtLines(
        lines: List<String>,
        matchIndices: List<Int>,
        keepMatchedLine: Boolean,
        sourceInfo: String
    ): List<NoteDraft> {
        val segments = mutableListOf<String>()
        var start = 0
        // Each segment ends right before the matched line. If the matched line is meaningful
        // content (a date header), it becomes part of the *next* segment instead of being
        // dropped like a pure delimiter line is.
        for (index in matchIndices) {
            if (index > start) {
                segments += lines.subList(start, index).joinToString("\n")
            }
            start = if (keepMatchedLine) index else index + 1
        }
        if (start < lines.size) {
            segments += lines.subList(start, lines.size).joinToString("\n")
        }
        return segments
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .map { toDraft(it, sourceInfo) }
    }

    private fun toDraft(body: String, sourceInfo: String): NoteDraft {
        val firstLine = body.lineSequence().firstOrNull { it.isNotBlank() }?.trim().orEmpty()
        val title = if (firstLine.length <= 60) firstLine else firstLine.take(57).trimEnd() + "…"
        return NoteDraft(title = title.ifBlank { "Untitled note" }, body = body, sourceInfo = sourceInfo)
    }
}
