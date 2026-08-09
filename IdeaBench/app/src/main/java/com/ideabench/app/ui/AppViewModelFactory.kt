package com.ideabench.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.CreationExtras
import com.ideabench.app.Container
import com.ideabench.app.ui.add.AddViewModel
import com.ideabench.app.ui.browse.BrowseViewModel
import com.ideabench.app.ui.detail.DetailViewModel
import com.ideabench.app.ui.focus.FocusViewModel
import com.ideabench.app.ui.settings.SettingsViewModel

/** Simple hand-rolled ViewModel factory matching [Container]'s manual DI. */
class AppViewModelFactory(private val container: Container) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T {
        return when {
            modelClass.isAssignableFrom(BrowseViewModel::class.java) -> BrowseViewModel(container.repository)
            modelClass.isAssignableFrom(FocusViewModel::class.java) -> FocusViewModel(container.repository)
            modelClass.isAssignableFrom(AddViewModel::class.java) -> AddViewModel(
                container.repository,
                container.noteImporter,
                container.noteBatchAnalyzer,
                container.screenshotAnalyzer,
                container.appPreferences,
                container.securePrefs
            )
            modelClass.isAssignableFrom(DetailViewModel::class.java) -> DetailViewModel(container.repository)
            modelClass.isAssignableFrom(SettingsViewModel::class.java) -> SettingsViewModel(
                container.securePrefs,
                container.appPreferences
            )
            else -> throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
        } as T
    }
}
