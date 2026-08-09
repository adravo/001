package com.ideabench.app.ui.navigation

sealed class Destination(val route: String) {
    data object Browse : Destination("browse")
    data object Focus : Destination("focus")
    data object Add : Destination("add")
    data object Settings : Destination("settings")
    data object Detail : Destination("detail/{itemId}") {
        fun route(itemId: Long) = "detail/$itemId"
    }
}
