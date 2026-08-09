package com.ideabench.app.data.prefs

import android.content.Context

/** Plain (non-sensitive) app settings: folder permission, WorkManager toggles, last-scan times. */
class AppPreferences(context: Context) {

    private val prefs = context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    var importFolderUri: String?
        get() = prefs.getString(KEY_IMPORT_FOLDER_URI, null)
        set(value) = prefs.edit().putString(KEY_IMPORT_FOLDER_URI, value).apply()

    var dailyNoteRescanEnabled: Boolean
        get() = prefs.getBoolean(KEY_DAILY_NOTE_RESCAN, false)
        set(value) = prefs.edit().putBoolean(KEY_DAILY_NOTE_RESCAN, value).apply()

    var dailyScreenshotScanEnabled: Boolean
        get() = prefs.getBoolean(KEY_DAILY_SCREENSHOT_SCAN, false)
        set(value) = prefs.edit().putBoolean(KEY_DAILY_SCREENSHOT_SCAN, value).apply()

    var lastNoteScanAt: Long
        get() = prefs.getLong(KEY_LAST_NOTE_SCAN, 0L)
        set(value) = prefs.edit().putLong(KEY_LAST_NOTE_SCAN, value).apply()

    var lastScreenshotScanAt: Long
        get() = prefs.getLong(KEY_LAST_SCREENSHOT_SCAN, 0L)
        set(value) = prefs.edit().putLong(KEY_LAST_SCREENSHOT_SCAN, value).apply()

    companion object {
        private const val FILE_NAME = "idea_bench_app_prefs"
        private const val KEY_IMPORT_FOLDER_URI = "import_folder_uri"
        private const val KEY_DAILY_NOTE_RESCAN = "daily_note_rescan_enabled"
        private const val KEY_DAILY_SCREENSHOT_SCAN = "daily_screenshot_scan_enabled"
        private const val KEY_LAST_NOTE_SCAN = "last_note_scan_at"
        private const val KEY_LAST_SCREENSHOT_SCAN = "last_screenshot_scan_at"
    }
}
