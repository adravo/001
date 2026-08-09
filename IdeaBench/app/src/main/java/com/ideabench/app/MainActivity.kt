package com.ideabench.app

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import com.ideabench.app.data.importer.toItemEntity
import com.ideabench.app.ui.AppViewModelFactory
import com.ideabench.app.ui.navigation.IdeaBenchNavHost
import com.ideabench.app.ui.theme.IdeaBenchTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val container: Container by lazy { (application as IdeaBenchApp).container }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        handleIncomingIntent(intent)

        setContent {
            IdeaBenchTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val factory = remember { AppViewModelFactory(container) }
                    IdeaBenchNavHost(factory = factory)
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingIntent(intent)
    }

    private fun handleIncomingIntent(intent: Intent?) {
        if (intent == null) return
        if (intent.action != Intent.ACTION_SEND && intent.action != Intent.ACTION_SEND_MULTIPLE) return

        lifecycleScope.launch {
            val drafts = container.shareIntentHandler.extractDrafts(intent)
            if (drafts.isEmpty()) return@launch
            val inserted = container.repository.insertAllNew(drafts.map { it.toItemEntity() })
            Toast.makeText(
                this@MainActivity,
                "Saved $inserted note${if (inserted == 1) "" else "s"} to Idea Bench",
                Toast.LENGTH_SHORT
            ).show()
        }
    }
}
