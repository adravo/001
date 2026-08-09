package com.ideabench.app.data.importer

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.IntentCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Turns an incoming ACTION_SEND / ACTION_SEND_MULTIPLE share intent into [NoteDraft]s. */
class ShareIntentHandler(private val context: Context) {

    suspend fun extractDrafts(intent: Intent): List<NoteDraft> = withContext(Dispatchers.IO) {
        when (intent.action) {
            Intent.ACTION_SEND -> fromSingleSend(intent)
            Intent.ACTION_SEND_MULTIPLE -> fromMultipleSend(intent)
            else -> emptyList()
        }
    }

    private fun fromSingleSend(intent: Intent): List<NoteDraft> {
        val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
        if (!sharedText.isNullOrBlank()) {
            return NoteSplitter.splitPasted(sharedText).map { it.copy(sourceInfo = "Shared") }
        }
        val uri = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
        return uri?.let { readAsDraft(it) }?.let { listOf(it) } ?: emptyList()
    }

    private fun fromMultipleSend(intent: Intent): List<NoteDraft> {
        val uris = IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
        if (!uris.isNullOrEmpty()) {
            return uris.mapNotNull { readAsDraft(it) }
        }
        val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
        return if (!sharedText.isNullOrBlank()) {
            NoteSplitter.splitPasted(sharedText).map { it.copy(sourceInfo = "Shared") }
        } else {
            emptyList()
        }
    }

    private fun readAsDraft(uri: Uri): NoteDraft? {
        val raw = try {
            context.contentResolver.openInputStream(uri)?.use { it.bufferedReader(Charsets.UTF_8).readText() }
        } catch (e: Exception) {
            null
        } ?: return null
        if (raw.isBlank()) return null

        val name = queryDisplayName(uri) ?: "Shared note"
        val body = if (name.endsWith(".html", true) || name.endsWith(".htm", true)) HtmlStripper.strip(raw) else raw
        val title = name.substringBeforeLast('.').ifBlank { "Shared note" }
        return NoteDraft(title = title, body = body.trim(), sourceInfo = "Shared: $name")
    }

    private fun queryDisplayName(uri: Uri): String? {
        return try {
            context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                val index = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
            }
        } catch (e: Exception) {
            null
        }
    }
}
