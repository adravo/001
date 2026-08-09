package com.ideabench.app.data.importer

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

/** Parses a Google Keep Takeout .json note export (one object per file, occasionally an array). */
object KeepJsonParser {

    fun parse(raw: String, sourceInfo: String): List<NoteDraft> {
        val element = try {
            Json.parseToJsonElement(raw)
        } catch (e: Exception) {
            return emptyList()
        }
        val objects = when (element) {
            is JsonArray -> element.filterIsInstance<JsonObject>()
            is JsonObject -> listOf(element)
            else -> emptyList()
        }
        return objects.mapNotNull { toDraft(it, sourceInfo) }
    }

    private fun toDraft(obj: JsonObject, sourceInfo: String): NoteDraft? {
        val isTrashed = (obj["isTrashed"] as? JsonPrimitive)?.booleanOrNull ?: false
        if (isTrashed) return null

        val title = (obj["title"] as? JsonPrimitive)?.contentOrNull.orEmpty()
        val textContent = (obj["textContent"] as? JsonPrimitive)?.contentOrNull.orEmpty()
        val listContent = (obj["listContent"] as? JsonArray)?.mapNotNull { item ->
            val itemObj = item as? JsonObject ?: return@mapNotNull null
            val text = (itemObj["text"] as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
            val checked = (itemObj["isChecked"] as? JsonPrimitive)?.booleanOrNull ?: false
            (if (checked) "[x] " else "[ ] ") + text
        }?.joinToString("\n").orEmpty()

        val body = listOf(textContent, listContent).filter { it.isNotBlank() }.joinToString("\n\n")
        if (title.isBlank() && body.isBlank()) return null

        val resolvedTitle = title.ifBlank {
            body.lineSequence().firstOrNull { it.isNotBlank() }?.take(60) ?: "Untitled note"
        }
        return NoteDraft(
            title = resolvedTitle,
            body = body.ifBlank { title },
            sourceInfo = sourceInfo
        )
    }
}
