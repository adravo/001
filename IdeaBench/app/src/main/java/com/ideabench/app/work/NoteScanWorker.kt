package com.ideabench.app.work

import android.content.Context
import android.net.Uri
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.ideabench.app.IdeaBenchApp
import com.ideabench.app.data.importer.toItemEntity

/** Daily re-scan of the imported notes folder for new files. Combined-export files that need a
 *  user-confirmed preview are intentionally skipped here — only unambiguous one-file-per-note
 *  content is auto-imported in the background. */
class NoteScanWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val container = (applicationContext as IdeaBenchApp).container
        val folderUriString = container.appPreferences.importFolderUri ?: return Result.success()
        val uri = Uri.parse(folderUriString)

        return try {
            val scan = container.noteImporter.scanFolder(uri)
            val entities = scan.readyToImport.map { it.toItemEntity() }
            container.repository.insertAllNew(entities)
            container.appPreferences.lastNoteScanAt = System.currentTimeMillis()
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}
