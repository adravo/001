package com.ideabench.app.ui.focus

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.ideabench.app.ui.AppViewModelFactory
import com.ideabench.app.ui.components.categoryColor

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FocusScreen(factory: AppViewModelFactory) {
    val viewModel: FocusViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()
    val current = state.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(if (state.queue.isEmpty()) "Focus" else "Focus  ${state.index + 1}/${state.queue.size}")
                }
            )
        }
    ) { padding ->
        if (current == null) {
            Column(
                modifier = Modifier.fillMaxSize().padding(padding).padding(32.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    "Nothing open right now. Import or capture more ideas, or you're all caught up!",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            return@Scaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState())
        ) {
            Text(
                text = current.category.ifBlank { "Uncategorized" },
                style = MaterialTheme.typography.labelLarge,
                color = categoryColor(current.category)
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = current.title.ifBlank { "Untitled" },
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(12.dp))

            if (current.thumbnailPath != null) {
                AsyncImage(
                    model = current.thumbnailPath,
                    contentDescription = "Screenshot",
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(280.dp)
                )
                Spacer(modifier = Modifier.height(12.dp))
            }

            if (current.text.isNotBlank()) {
                Text(current.text, style = MaterialTheme.typography.bodyLarge)
                Spacer(modifier = Modifier.height(16.dp))
            }

            if (current.nextStep.isNotBlank()) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            "Suggested next step",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            current.nextStep,
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
            }

            if (current.tagList.isNotEmpty()) {
                Text(
                    current.tagList.joinToString(" · ") { "#$it" },
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary
                )
                Spacer(modifier = Modifier.height(16.dp))
            }

            Spacer(modifier = Modifier.height(24.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = viewModel::previous,
                    enabled = state.hasPrevious,
                    shape = RoundedCornerShape(12.dp)
                ) { Text("Previous") }

                OutlinedButton(
                    onClick = viewModel::next,
                    enabled = state.hasNext,
                    shape = RoundedCornerShape(12.dp)
                ) { Text("Next") }
            }
            Spacer(modifier = Modifier.height(8.dp))
            Button(
                onClick = { viewModel.markDoneAndAdvance(current) },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            ) { Text("Done, next") }
        }
    }
}
