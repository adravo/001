package com.ideabench.app.ui.components

import androidx.compose.ui.graphics.Color
import kotlin.math.abs

private val categoryPalette = listOf(
    Color(0xFF5B4FE9), // indigo
    Color(0xFF00897B), // teal
    Color(0xFFEF6C00), // orange
    Color(0xFFD81B60), // pink
    Color(0xFF3949AB), // blue
    Color(0xFF00ACC1), // cyan
    Color(0xFF7CB342), // green
    Color(0xFFC0A000), // amber
    Color(0xFF8E24AA), // purple
    Color(0xFF546E7A)  // slate
)

/** Deterministic color per category name so the same category always renders the same chip color. */
fun categoryColor(category: String): Color {
    if (category.isBlank()) return Color(0xFF9E9E9E)
    val index = abs(category.trim().lowercase().hashCode()) % categoryPalette.size
    return categoryPalette[index]
}
