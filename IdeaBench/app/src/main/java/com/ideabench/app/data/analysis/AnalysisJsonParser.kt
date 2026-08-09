package com.ideabench.app.data.analysis

import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/** Best-effort extraction of a JSON array/object from a model response that may be wrapped in markdown fences or chatter. */
object AnalysisJsonParser {

    val lenientJson = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
        explicitNulls = false
    }

    fun parseArray(raw: String): List<NoteAnalysisResult> {
        val jsonText = extractBetween(raw, '[', ']') ?: return emptyList()
        return try {
            lenientJson.decodeFromString(ListSerializer(NoteAnalysisResult.serializer()), jsonText)
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun parseObject(raw: String): ScreenshotAnalysisResult? {
        val jsonText = extractBetween(raw, '{', '}') ?: return null
        return try {
            lenientJson.decodeFromString(ScreenshotAnalysisResult.serializer(), jsonText)
        } catch (e: Exception) {
            null
        }
    }

    private fun extractBetween(raw: String, open: Char, close: Char): String? {
        val cleaned = raw.trim()
            .removePrefix("```json").removePrefix("```JSON").removePrefix("```")
            .removeSuffix("```")
            .trim()
        val start = cleaned.indexOf(open)
        val end = cleaned.lastIndexOf(close)
        if (start == -1 || end == -1 || end < start) return null
        return cleaned.substring(start, end + 1)
    }
}
