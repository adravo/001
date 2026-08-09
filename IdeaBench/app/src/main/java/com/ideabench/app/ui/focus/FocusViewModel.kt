package com.ideabench.app.ui.focus

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ideabench.app.data.local.ItemEntity
import com.ideabench.app.data.repository.ItemRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class FocusUiState(
    val queue: List<ItemEntity> = emptyList(),
    val index: Int = 0
) {
    val current: ItemEntity? get() = queue.getOrNull(index)
    val hasPrevious: Boolean get() = index > 0
    val hasNext: Boolean get() = index < queue.size - 1
}

/** Walks through open (not-done) items one at a time, Previous / Next / "Done, next". */
class FocusViewModel(private val repository: ItemRepository) : ViewModel() {

    private val index = MutableStateFlow(0)

    val uiState: StateFlow<FocusUiState> = combine(repository.observeFocusQueue(), index) { queue, idx ->
        FocusUiState(queue = queue, index = idx.coerceIn(0, (queue.size - 1).coerceAtLeast(0)))
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), FocusUiState())

    fun previous() {
        index.value = (index.value - 1).coerceAtLeast(0)
    }

    fun next() {
        val size = uiState.value.queue.size
        index.value = (index.value + 1).coerceAtMost((size - 1).coerceAtLeast(0))
    }

    fun markDoneAndAdvance(item: ItemEntity) {
        viewModelScope.launch {
            repository.update(item.copy(done = true))
            // The queue Flow drops the completed item automatically (done = 0 filter);
            // index stays put so the next item slides into this position.
        }
    }
}
