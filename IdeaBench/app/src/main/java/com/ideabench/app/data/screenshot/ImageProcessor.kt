package com.ideabench.app.data.screenshot

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream

data class ProcessedImage(
    val base64Data: String,
    val mediaType: String,
    val thumbnailPath: String
)

/** Downscales a screenshot for the API call (max 1400px, JPEG) and saves a small local thumbnail. */
class ImageProcessor(private val context: Context) {

    fun process(uri: Uri, contentHash: String): ProcessedImage? {
        val full = decodeDownscaled(uri, MAX_DIMENSION) ?: return null
        try {
            val stream = ByteArrayOutputStream()
            full.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, stream)
            val base64 = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)

            val thumb = scale(full, THUMBNAIL_DIMENSION)
            val thumbPath = saveThumbnail(thumb, contentHash)
            if (thumb !== full) thumb.recycle()

            return ProcessedImage(base64Data = base64, mediaType = "image/jpeg", thumbnailPath = thumbPath)
        } finally {
            full.recycle()
        }
    }

    private fun decodeDownscaled(uri: Uri, maxDimension: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            ?: return null
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        var sampleSize = 1
        while (bounds.outWidth / sampleSize > maxDimension * 2 || bounds.outHeight / sampleSize > maxDimension * 2) {
            sampleSize *= 2
        }
        val opts = BitmapFactory.Options().apply { inSampleSize = sampleSize }
        val decoded = context.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, opts)
        } ?: return null

        return scale(decoded, maxDimension).also { if (it !== decoded) decoded.recycle() }
    }

    private fun scale(bitmap: Bitmap, maxDimension: Int): Bitmap {
        val largestSide = maxOf(bitmap.width, bitmap.height)
        if (largestSide <= maxDimension) return bitmap
        val ratio = maxDimension.toFloat() / largestSide
        val newWidth = (bitmap.width * ratio).toInt().coerceAtLeast(1)
        val newHeight = (bitmap.height * ratio).toInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true)
    }

    private fun saveThumbnail(bitmap: Bitmap, contentHash: String): String {
        val dir = File(context.filesDir, "thumbnails").apply { mkdirs() }
        val file = File(dir, "$contentHash.jpg")
        FileOutputStream(file).use { out -> bitmap.compress(Bitmap.CompressFormat.JPEG, THUMBNAIL_QUALITY, out) }
        return file.absolutePath
    }

    companion object {
        private const val MAX_DIMENSION = 1400
        private const val THUMBNAIL_DIMENSION = 320
        private const val JPEG_QUALITY = 82
        private const val THUMBNAIL_QUALITY = 70
    }
}
