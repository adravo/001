package com.ideabench.app

import android.app.Application
import com.ideabench.app.data.analysis.NoteBatchAnalyzer
import com.ideabench.app.data.analysis.ScreenshotAnalyzer
import com.ideabench.app.data.importer.NoteImporter
import com.ideabench.app.data.importer.ShareIntentHandler
import com.ideabench.app.data.local.AppDatabase
import com.ideabench.app.data.prefs.AppPreferences
import com.ideabench.app.data.prefs.SecurePrefs
import com.ideabench.app.data.remote.AnthropicClient
import com.ideabench.app.data.repository.ItemRepository

/**
 * Hand-rolled DI container: this app is small enough that a Hilt/Dagger graph would add build
 * complexity without real benefit, so [Container] just constructs the singletons once, lazily.
 */
class IdeaBenchApp : Application() {

    lateinit var container: Container
        private set

    override fun onCreate() {
        super.onCreate()
        container = Container(this)
    }
}

class Container(app: Application) {
    val database: AppDatabase by lazy { AppDatabase.get(app) }
    val repository: ItemRepository by lazy { ItemRepository(database.itemDao()) }
    val securePrefs: SecurePrefs by lazy { SecurePrefs(app) }
    val appPreferences: AppPreferences by lazy { AppPreferences(app) }

    val anthropicClient: AnthropicClient by lazy {
        AnthropicClient(apiKeyProvider = { securePrefs.getApiKey() })
    }

    val noteImporter: NoteImporter by lazy { NoteImporter(app) }

    val shareIntentHandler: ShareIntentHandler by lazy { ShareIntentHandler(app) }

    val noteBatchAnalyzer: NoteBatchAnalyzer by lazy { NoteBatchAnalyzer(repository, anthropicClient) }

    val screenshotAnalyzer: ScreenshotAnalyzer by lazy { ScreenshotAnalyzer(app, repository, anthropicClient) }
}
