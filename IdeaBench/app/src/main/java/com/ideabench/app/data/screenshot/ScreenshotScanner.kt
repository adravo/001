package com.ideabench.app.data.screenshot

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.provider.MediaStore

data class ScreenshotItem(
    val uri: Uri,
    val displayName: String,
    val dateAddedMillis: Long
)

/** Finds gallery screenshots via MediaStore: Screenshots bucket, or filename containing "Screenshot". */
class ScreenshotScanner(private val context: Context) {

    fun findScreenshots(): List<ScreenshotItem> {
        val items = mutableListOf<ScreenshotItem>()
        val collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        val projection = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.DATE_ADDED
        )
        val selection = "${MediaStore.Images.Media.BUCKET_DISPLAY_NAME} LIKE ? OR " +
            "${MediaStore.Images.Media.DISPLAY_NAME} LIKE ? OR " +
            "${MediaStore.Images.Media.RELATIVE_PATH} LIKE ?"
        val args = arrayOf("%Screenshot%", "%Screenshot%", "%Screenshot%")
        val sortOrder = "${MediaStore.Images.Media.DATE_ADDED} DESC"

        context.contentResolver.query(collection, projection, selection, args, sortOrder)?.use { cursor ->
            val idCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
            val nameCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)
            val dateCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED)
            while (cursor.moveToNext()) {
                val id = cursor.getLong(idCol)
                val uri = ContentUris.withAppendedId(collection, id)
                items += ScreenshotItem(
                    uri = uri,
                    displayName = cursor.getString(nameCol) ?: "screenshot_$id.jpg",
                    dateAddedMillis = cursor.getLong(dateCol) * 1000L
                )
            }
        }
        return items
    }
}
