package com.ideabench.app.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CenterFocusStrong
import androidx.compose.material.icons.filled.List
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.NavType
import androidx.compose.runtime.getValue
import com.ideabench.app.ui.AppViewModelFactory
import com.ideabench.app.ui.add.AddScreen
import com.ideabench.app.ui.browse.BrowseScreen
import com.ideabench.app.ui.detail.DetailScreen
import com.ideabench.app.ui.focus.FocusScreen
import com.ideabench.app.ui.settings.SettingsScreen

private data class BottomTab(val destination: Destination, val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)

private val bottomTabs = listOf(
    BottomTab(Destination.Browse, "Browse", Icons.Filled.List),
    BottomTab(Destination.Focus, "Focus", Icons.Filled.CenterFocusStrong),
    BottomTab(Destination.Add, "Add", Icons.Filled.Add)
)

@Composable
fun IdeaBenchNavHost(factory: AppViewModelFactory) {
    val navController = rememberNavController()

    Scaffold(
        bottomBar = {
            val backStackEntry by navController.currentBackStackEntryAsState()
            val currentRoute = backStackEntry?.destination

            NavigationBar {
                bottomTabs.forEach { tab ->
                    val selected = currentRoute?.hierarchy?.any { it.route == tab.destination.route } == true
                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            navController.navigate(tab.destination.route) {
                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label) }
                    )
                }
            }
        }
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = Destination.Browse.route,
            modifier = androidx.compose.ui.Modifier.padding(padding)
        ) {
            composable(Destination.Browse.route) {
                BrowseScreen(
                    factory = factory,
                    onItemClick = { id -> navController.navigate(Destination.Detail.route(id)) },
                    onSettingsClick = { navController.navigate(Destination.Settings.route) }
                )
            }
            composable(Destination.Focus.route) {
                FocusScreen(factory = factory)
            }
            composable(Destination.Add.route) {
                AddScreen(factory = factory)
            }
            composable(Destination.Settings.route) {
                SettingsScreen(factory = factory, onBack = { navController.popBackStack() })
            }
            composable(
                route = Destination.Detail.route,
                arguments = listOf(navArgument("itemId") { type = NavType.LongType })
            ) { backStackEntry ->
                val itemId = backStackEntry.arguments?.getLong("itemId") ?: return@composable
                DetailScreen(factory = factory, itemId = itemId, onBack = { navController.popBackStack() })
            }
        }
    }
}
