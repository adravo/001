package com.ideabench.app.data.prefs

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** Encrypted-at-rest storage for the user's Anthropic API key. */
class SecurePrefs(context: Context) {

    private val prefs: SharedPreferences = try {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    } catch (e: Exception) {
        // Falls back to a regular (still app-private) prefs file if the keystore is
        // unavailable, so the app remains usable rather than crashing on Settings.
        context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)
    }

    fun getApiKey(): String? = prefs.getString(KEY_API_KEY, null)

    fun setApiKey(apiKey: String) {
        prefs.edit().putString(KEY_API_KEY, apiKey.trim()).apply()
    }

    fun clearApiKey() {
        prefs.edit().remove(KEY_API_KEY).apply()
    }

    fun hasApiKey(): Boolean = !getApiKey().isNullOrBlank()

    companion object {
        private const val FILE_NAME = "idea_bench_secure_prefs"
        private const val KEY_API_KEY = "anthropic_api_key"
    }
}
