package com.ideabench.app.data.analysis

import com.ideabench.app.data.local.ItemEntity
import com.ideabench.app.data.local.ItemType
import com.ideabench.app.data.remote.AnthropicClient
import com.ideabench.app.data.remote.AnthropicResult
import com.ideabench.app.data.remote.textContent
import com.ideabench.app.data.repository.ItemRepository
import com.ideabench.app.data.repository.MAX_CATEGORIES
import kotlinx.coroutines.delay

/**
 * Sends unanalyzed notes to the Anthropic API in batches of [DEFAULT_BATCH_SIZE], resumable
 * across app restarts because progress is persisted to Room after every batch (never held only
 * in memory). Call [analyzeAll] again after an interruption/failure and it continues where it
 * left off, since it only ever pulls rows where `analyzed = 0`.
 */
class NoteBatchAnalyzer(
    private val repository: ItemRepository,
    private val client: AnthropicClient
) {
    suspend fun analyzeAll(
        batchSize: Int = DEFAULT_BATCH_SIZE,
        onProgress: (done: Int, total: Int) -> Unit = { _, _ -> }
    ): NoteAnalysisSummary {
        val total = repository.countUnanalyzedByType(ItemType.TEXT)
        var done = 0
        onProgress(done, total)

        while (true) {
            val batch = repository.getUnanalyzedBatch(batchSize, ItemType.TEXT)
            if (batch.isEmpty()) break

            val existingCategories = repository.getDistinctCategories()
            when (val result = client.sendMessage(
                content = textContent(buildPrompt(batch, existingCategories)),
                maxTokens = 4096,
                system = SYSTEM_PROMPT
            )) {
                is AnthropicResult.Success -> {
                    val parsed = AnalysisJsonParser.parseArray(result.text)
                    val applied = applyResults(batch, parsed)
                    done += applied
                    onProgress(done, total)
                    if (applied == 0) {
                        return NoteAnalysisSummary(
                            analyzed = done,
                            remaining = total - done,
                            errorMessage = "Couldn't read the model's response for this batch. Your progress is saved — tap Resume to try again."
                        )
                    }
                }
                is AnthropicResult.Failure -> {
                    onProgress(done, total)
                    return NoteAnalysisSummary(analyzed = done, remaining = total - done, errorMessage = result.message)
                }
            }
            delay(BETWEEN_BATCH_DELAY_MS)
        }
        return NoteAnalysisSummary(analyzed = done, remaining = 0, errorMessage = null)
    }

    /** Returns how many notes in [batch] were successfully matched and updated. */
    private suspend fun applyResults(batch: List<ItemEntity>, results: List<NoteAnalysisResult>): Int {
        if (results.isEmpty()) return 0
        val byId = results.associateBy { it.id }
        var applied = 0
        batch.forEachIndexed { index, item ->
            val result = byId[index] ?: return@forEachIndexed
            repository.update(
                item.copy(
                    title = result.title.ifBlank { item.title }.take(120),
                    category = result.category.ifBlank { "Uncategorized" }.take(40).trim(),
                    tags = ItemEntity.joinTags(result.tags),
                    nextStep = result.nextStep.take(200),
                    analyzed = true,
                    analysisFailed = false
                )
            )
            applied++
        }
        return applied
    }

    private fun buildPrompt(batch: List<ItemEntity>, existingCategories: List<String>): String {
        val categoriesLine = if (existingCategories.isEmpty()) {
            "(none yet — choose sensible short categories)"
        } else {
            existingCategories.joinToString(", ")
        }
        val notesBlock = batch.mapIndexed { index, item ->
            "[$index] ${item.text.take(4000)}"
        }.joinToString("\n\n")

        return """
            Analyze the ${batch.size} personal notes below. Return a JSON array with exactly one object per note (any order), shaped exactly like:
            {"id": <the number in brackets before the note>, "title": "3-7 word title", "category": "one category", "tags": ["2-4 lowercase tags"], "nextStep": "one-line concrete next action"}

            Existing categories in my idea bank — reuse one whenever it reasonably fits, and keep the total distinct categories across my whole collection to about $MAX_CATEGORIES or fewer, only inventing a new one if nothing existing fits: $categoriesLine

            Respond with ONLY the JSON array. No markdown fences, no commentary, no trailing text before or after it.

            Notes:
            $notesBlock
        """.trimIndent()
    }

    companion object {
        const val DEFAULT_BATCH_SIZE = 18
        private const val BETWEEN_BATCH_DELAY_MS = 400L
        private const val SYSTEM_PROMPT =
            "You organize a person's raw notes into a searchable personal idea bank. " +
                "Always respond with strict, valid JSON only — no markdown fences, no commentary, no extra text."
    }
}
