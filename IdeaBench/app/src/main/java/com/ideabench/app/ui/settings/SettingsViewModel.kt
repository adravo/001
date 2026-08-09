package com.ideabench.app.ui.settings

import androidx.lifecycle.ViewModel
import com.ideabench.app.data.prefs.AppPreferences
import com.ideabench.app.data.prefs.SecurePrefs
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class SettingsUiState(
    val apiKey: String = "",
    val hasSavedKey: Boolean = false,
    val dailyNoteRescan: Boolean = false,
    val dailyScreenshotScan: Boolean = false,
    val savedMessage: String? = null
)

class SettingsViewModel(
    private val securePrefs: SecurePrefs,
    private val appPreferences: AppPreferences
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        SettingsUiState(
            apiKey = securePrefs.getApiKey().orEmpty(),
            hasSavedKey = securePrefs.hasApiKey(),
            dailyNoteRescan = appPreferences.dailyNoteRescanEnabled,
            dailyScreenshotScan = appPreferences.dailyScreenshotScanEnabled
        )
    )
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    fun setApiKeyInput(value: String) {
        _uiState.value = _uiState.value.copy(apiKey = value, savedMessage = null)
    }

    fun saveApiKey() {
        val key = _uiState.value.apiKey.trim()
        if (key.isBlank()) return
        securePrefs.setApiKey(key)
        _uiState.value = _uiState.value.copy(hasSavedKey = true, savedMessage = "API key saved")
    }

    fun clearApiKey() {
        securePrefs.clearApiKey()
        _uiState.value = _uiState.value.copy(apiKey = "", hasSavedKey = false, savedMessage = "API key removed")
    }

    /** Returns the new value so the caller can (re)schedule/cancel the WorkManager job. */
    fun setDailyNoteRescan(enabled: Boolean): Boolean {
        appPreferences.dailyNoteRescanEnabled = enabled
        _uiState.value = _uiState.value.copy(dailyNoteRescan = enabled)
        return enabled
    }

    fun setDailyScreenshotScan(enabled: Boolean): Boolean {
        appPreferences.dailyScreenshotScanEnabled = enabled
        _uiState.value = _uiState.value.copy(dailyScreenshotScan = enabled)
        return enabled
    }
}
