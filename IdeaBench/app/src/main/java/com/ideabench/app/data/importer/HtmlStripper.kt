package com.ideabench.app.data.importer

import android.text.Html

object HtmlStripper {
    fun strip(html: String): String {
        val spanned = Html.fromHtml(html, Html.FROM_HTML_MODE_LEGACY)
        return spanned.toString().trim()
    }
}
