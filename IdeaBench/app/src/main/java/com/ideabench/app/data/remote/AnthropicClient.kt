package com.ideabench.app.data.remote

import kotlinx.coroutines.delay
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.io.IOException
import java.util.concurrent.TimeUnit

sealed class AnthropicResult {
    data class Success(val text: String) : AnthropicResult()
    data class Failure(val message: String, val retryable: Boolean) : AnthropicResult()
}

/**
 * Thin wrapper around the Anthropic Messages API with exponential backoff on
 * rate limits (429) and transient server errors (5xx).
 */
class AnthropicClient(
    private val apiKeyProvider: () -> String?,
    private val baseUrl: String = "https://api.anthropic.com/"
) {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
    }

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .addInterceptor(HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC })
        .build()

    private val api: AnthropicApi = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(httpClient)
        .addConverterFactory(json.asConverterFactory("application/json; charset=UTF-8".toMediaType()))
        .build()
        .create(AnthropicApi::class.java)

    suspend fun sendMessage(
        content: JsonElement,
        maxTokens: Int = 4096,
        model: String = DEFAULT_MODEL,
        system: String? = null
    ): AnthropicResult {
        val apiKey = apiKeyProvider()?.trim()
        if (apiKey.isNullOrBlank()) {
            return AnthropicResult.Failure("No Anthropic API key set. Add one in Settings.", retryable = false)
        }

        val request = AnthropicRequest(
            model = model,
            maxTokens = maxTokens,
            messages = listOf(AnthropicMessage(role = "user", content = content)),
            system = system
        )

        var attempt = 0
        var lastError = "Unknown error"
        while (attempt < MAX_RETRIES) {
            try {
                val response = api.createMessage(apiKey = apiKey, request = request)
                val text = response.content
                    .filter { it.type == "text" }
                    .joinToString("\n") { it.text.orEmpty() }
                return if (text.isBlank()) {
                    AnthropicResult.Failure("Model returned an empty response.", retryable = true)
                } else {
                    AnthropicResult.Success(text)
                }
            } catch (e: HttpException) {
                val code = e.code()
                val errorMessage = parseErrorMessage(e) ?: e.message()
                if (code == 429 || code in 500..599) {
                    lastError = "HTTP $code: $errorMessage"
                    attempt++
                    if (attempt < MAX_RETRIES) delay(backoffMillis(attempt))
                } else {
                    val hint = if (code == 401) "Invalid API key." else errorMessage
                    return AnthropicResult.Failure("HTTP $code: $hint", retryable = false)
                }
            } catch (e: IOException) {
                lastError = "Network error: ${e.message ?: "no connection"}"
                attempt++
                if (attempt < MAX_RETRIES) delay(backoffMillis(attempt))
            } catch (e: SerializationException) {
                return AnthropicResult.Failure("Malformed response from API: ${e.message}", retryable = false)
            }
        }
        return AnthropicResult.Failure(lastError, retryable = true)
    }

    private fun parseErrorMessage(e: HttpException): String? {
        val body = e.response()?.errorBody()?.string() ?: return null
        return try {
            json.decodeFromString(AnthropicErrorEnvelope.serializer(), body).error?.message
        } catch (parseError: Exception) {
            null
        }
    }

    private fun backoffMillis(attempt: Int): Long =
        (BASE_BACKOFF_MS * (1L shl (attempt - 1))).coerceAtMost(MAX_BACKOFF_MS)

    companion object {
        const val DEFAULT_MODEL = "claude-sonnet-4-6"
        private const val MAX_RETRIES = 5
        private const val BASE_BACKOFF_MS = 1000L
        private const val MAX_BACKOFF_MS = 20_000L
    }
}
