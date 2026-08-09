package com.ideabench.app.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.ideabench.app.IdeaBenchApp

/** Daily background scan + analysis of any new gallery screenshots, when an API key is set. */
class ScreenshotScanWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val container = (applicationContext as IdeaBenchApp).container
        if (!container.securePrefs.hasApiKey()) return Result.success()

        return try {
            val unprocessed = container.screenshotAnalyzer.findUnprocessed()
            container.screenshotAnalyzer.processAll(unprocessed)
            container.appPreferences.lastScreenshotScanAt = System.currentTimeMillis()
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}
