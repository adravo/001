package com.ideabench.app.data.remote

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

@Serializable
data class AnthropicRequest(
    val model: String,
    @SerialName("max_tokens") val maxTokens: Int,
    val messages: List<AnthropicMessage>,
    val system: String? = null,
    val temperature: Double? = null
)

@Serializable
data class AnthropicMessage(
    val role: String,
    val content: JsonElement
)

@Serializable
data class AnthropicResponse(
    val id: String? = null,
    val type: String? = null,
    val role: String? = null,
    val content: List<ResponseBlock> = emptyList(),
    val model: String? = null,
    @SerialName("stop_reason") val stopReason: String? = null
)

@Serializable
data class ResponseBlock(
    val type: String = "",
    val text: String? = null
)

@Serializable
data class AnthropicErrorEnvelope(
    val type: String? = null,
    val error: AnthropicErrorDetail? = null
)

@Serializable
data class AnthropicErrorDetail(
    val type: String? = null,
    val message: String? = null
)

/** Builds a `content` array with a single text block. */
fun textContent(text: String): JsonElement = buildJsonArray {
    add(buildJsonObject {
        put("type", "text")
        put("text", text)
    })
}

/** Builds a `content` array with an image block followed by an instruction text block. */
fun imageAndTextContent(base64Data: String, mediaType: String, text: String): JsonElement = buildJsonArray {
    add(buildJsonObject {
        put("type", "image")
        putJsonObject("source") {
            put("type", "base64")
            put("media_type", mediaType)
            put("data", base64Data)
        }
    })
    add(buildJsonObject {
        put("type", "text")
        put("text", text)
    })
}
