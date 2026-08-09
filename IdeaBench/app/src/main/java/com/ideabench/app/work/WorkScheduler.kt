package com.ideabench.app.work

import android.content.Context
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Constraints
import java.util.concurrent.TimeUnit

object WorkScheduler {
    private const val NOTE_SCAN_WORK = "daily_note_folder_rescan"
    private const val SCREENSHOT_SCAN_WORK = "daily_screenshot_rescan"

    fun setDailyNoteRescan(context: Context, enabled: Boolean) {
        val workManager = WorkManager.getInstance(context)
        if (!enabled) {
            workManager.cancelUniqueWork(NOTE_SCAN_WORK)
            return
        }
        val request = PeriodicWorkRequestBuilder<NoteScanWorker>(1, TimeUnit.DAYS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.NOT_REQUIRED).build())
            .build()
        workManager.enqueueUniquePeriodicWork(NOTE_SCAN_WORK, ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    fun setDailyScreenshotRescan(context: Context, enabled: Boolean) {
        val workManager = WorkManager.getInstance(context)
        if (!enabled) {
            workManager.cancelUniqueWork(SCREENSHOT_SCAN_WORK)
            return
        }
        val request = PeriodicWorkRequestBuilder<ScreenshotScanWorker>(1, TimeUnit.DAYS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        workManager.enqueueUniquePeriodicWork(SCREENSHOT_SCAN_WORK, ExistingPeriodicWorkPolicy.UPDATE, request)
    }
}
