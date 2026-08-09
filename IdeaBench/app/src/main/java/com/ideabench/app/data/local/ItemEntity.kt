package com.ideabench.app.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

enum class ItemType {
    TEXT,
    SCREENSHOT
}

/**
 * A single captured idea: an imported/pasted/shared note, or a scanned screenshot.
 * [contentHash] is unique so re-imports and re-scans can cheaply skip duplicates.
 */
@Entity(
    tableName = "items",
    indices = [Index(value = ["contentHash"], unique = true)]
)
data class ItemEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val type: ItemType,
    val text: String,
    val title: String = "",
    val category: String = "",
    val tags: String = "",
    val nextStep: String = "",
    val done: Boolean = false,
    val createdAt: Long,
    val sourceInfo: String? = null,
    val contentHash: String,
    val thumbnailPath: String? = null,
    val analyzed: Boolean = false,
    val analysisFailed: Boolean = false
) {
    val tagList: List<String>
        get() = tags.split(",").map { it.trim() }.filter { it.isNotEmpty() }

    companion object {
        fun joinTags(tags: List<String>): String =
            tags.map { it.trim().lowercase() }.filter { it.isNotEmpty() }.distinct().joinToString(",")
    }
}
