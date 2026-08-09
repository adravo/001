package com.ideabench.app.data.analysis

import kotlinx.serialization.Serializable

@Serializable
data class NoteAnalysisResult(
    val id: Int = -1,
    val title: String = "",
    val category: String = "",
    val tags: List<String> = emptyList(),
    val nextStep: String = ""
)

@Serializable
data class ScreenshotAnalysisResult(
    val title: String = "",
    val category: String = "",
    val tags: List<String> = emptyList(),
    val nextStep: String = "",
    val extractedText: String = ""
)

data class NoteAnalysisSummary(
    val analyzed: Int,
    val remaining: Int,
    val errorMessage: String?
)

data class ScreenshotAnalysisSummary(
    val processed: Int,
    val failed: Int
)
