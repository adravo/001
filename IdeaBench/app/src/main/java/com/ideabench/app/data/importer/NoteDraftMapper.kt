package com.ideabench.app.data.importer

import com.ideabench.app.data.local.ItemEntity
import com.ideabench.app.data.local.ItemType
import com.ideabench.app.data.util.Hashing

fun NoteDraft.toItemEntity(): ItemEntity = ItemEntity(
    type = ItemType.TEXT,
    text = body,
    title = title,
    createdAt = System.currentTimeMillis(),
    sourceInfo = sourceInfo,
    contentHash = Hashing.sha256("$title\n$body")
)
