package com.ideabench.app.data.analysis

import android.content.Context
import com.ideabench.app.data.screenshot.ScreenshotScanner
import com.ideabench.app.data.local.ItemEntity
import com.ideabench.app.data.local.ItemType
import com.ideabench.app.data.remote.AnthropicClient
import com.ideabench.app.data.remote.AnthropicResult
import com.ideabench.app.data.remote.imageAndTextContent
import com.ideabench.app.data.repository.ItemRepository
import com.ideabench.app.data.repository.MAX_CATEGORIES
import com.ideabench.app.data.screenshot.ImageProcessor
import com.ideabench.app.data.screenshot.ScreenshotItem
import com.ideabench.app.data.util.Hashing

/**
 * Processes newly found screenshots one at a time: downscale/compress/base64, send to the
 * Anthropic API for extraction + categorization, save a thumbnail, and persist. A failure on
 * one image (bad decode, API error) is recorded on that item and does not stop the batch.
 */
class ScreenshotAnalyzer(
    context: Context,
    private val repository: ItemRepository,
    private val client: AnthropicClient
) {
    private val imageProcessor = ImageProcessor(context)
    private val scanner = ScreenshotScanner(context)

    /** Gallery screenshots that don't yet have a fully-analyzed row in the DB. */
    suspend fun findUnprocessed(): List<ScreenshotItem> =
        scanner.findScreenshots().filter { item ->
            val hash = Hashing.sha256(item.uri.toString())
            repository.getByHash(hash)?.analyzed != true
        }

    suspend fun processAll(
        screenshots: List<ScreenshotItem>,
        onProgress: (done: Int, total: Int, currentName: String) -> Unit = { _, _, _ -> }
    ): ScreenshotAnalysisSummary {
        val total = screenshots.size
        var done = 0
        var failed = 0

        for (screenshot in screenshots) {
            onProgress(done, total, screenshot.displayName)
            val hash = Hashing.sha256(screenshot.uri.toString())

            val existing = repository.getByHash(hash)
            if (existing != null && existing.analyzed) {
                // Already fully processed in a prior run — never re-send it.
                done++
                continue
            }
            if (existing == null) {
                val placeholder = ItemEntity(
                    type = ItemType.SCREENSHOT,
                    text = "",
                    title = screenshot.displayName,
                    createdAt = screenshot.dateAddedMillis.takeIf { it > 0 } ?: System.currentTimeMillis(),
                    sourceInfo = screenshot.uri.toString(),
                    contentHash = hash
                )
                repository.insertIfNew(placeholder)
            }
            // else: a placeholder from a previously-failed attempt exists — retry it.

            val processed = try {
                imageProcessor.process(screenshot.uri, hash)
            } catch (e: Exception) {
                null
            }
            if (processed == null) {
                markFailed(hash, thumbnailPath = null)
                failed++
                done++
                onProgress(done, total, screenshot.displayName)
                continue
            }

            val existingCategories = repository.getDistinctCategories()
            val content = imageAndTextContent(processed.base64Data, processed.mediaType, buildPrompt(existingCategories))

            when (val result = client.sendMessage(content = content, maxTokens = 1200, system = SYSTEM_PROMPT)) {
                is AnthropicResult.Success -> {
                    val parsed = AnalysisJsonParser.parseObject(result.text)
                    if (parsed != null) {
                        applyResult(hash, processed.thumbnailPath, parsed)
                    } else {
                        markFailed(hash, processed.thumbnailPath)
                        failed++
                    }
                }
                is AnthropicResult.Failure -> {
                    markFailed(hash, processed.thumbnailPath)
                    failed++
                }
            }
            done++
            onProgress(done, total, screenshot.displayName)
        }

        return ScreenshotAnalysisSummary(processed = done, failed = failed)
    }

    private suspend fun applyResult(hash: String, thumbnailPath: String, result: ScreenshotAnalysisResult) {
        val current = repository.getByHash(hash) ?: return
        repository.update(
            current.copy(
                title = result.title.ifBlank { current.title }.take(120),
                category = result.category.ifBlank { "Uncategorized" }.take(40).trim(),
                tags = ItemEntity.joinTags(result.tags),
                nextStep = result.nextStep.take(200),
                text = result.extractedText,
                thumbnailPath = thumbnailPath,
                analyzed = true,
                analysisFailed = false
            )
        )
    }

    private suspend fun markFailed(hash: String, thumbnailPath: String?) {
        val current = repository.getByHash(hash) ?: return
        repository.update(
            current.copy(
                analyzed = false,
                analysisFailed = true,
                thumbnailPath = thumbnailPath ?: current.thumbnailPath
            )
        )
    }

    private fun buildPrompt(existingCategories: List<String>): String {
        val categoriesLine = if (existingCategories.isEmpty()) {
            "(none yet — choose sensible short categories)"
        } else {
            existingCategories.joinToString(", ")
        }
        return """
            This image is a phone screenshot. Extract the useful information in it (visible text, names, numbers, links, steps — whatever is actually there), then summarize it for my personal idea bank.

            Existing categories — reuse one whenever it reasonably fits, and keep the total distinct categories across my whole collection to about $MAX_CATEGORIES or fewer, only inventing a new one if nothing existing fits: $categoriesLine

            Respond with ONLY a single JSON object shaped exactly like:
            {"title": "3-7 word title", "category": "one category", "tags": ["2-4 lowercase tags"], "nextStep": "one-line concrete next action", "extractedText": "the useful text/info pulled from the screenshot"}

            No markdown fences, no commentary, no trailing text before or after it.
        """.trimIndent()
    }

    companion object {
        private const val SYSTEM_PROMPT =
            "You extract and organize useful information from personal phone screenshots into a searchable idea bank. " +
                "Always respond with strict, valid JSON only — no markdown fences, no commentary, no extra text."
    }
}
