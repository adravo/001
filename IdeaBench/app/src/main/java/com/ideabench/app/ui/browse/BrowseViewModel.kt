package com.ideabench.app.ui.browse

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ideabench.app.data.local.CategoryCount
import com.ideabench.app.data.local.ItemEntity
import com.ideabench.app.data.repository.ItemRepository
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class BrowseUiState(
    val query: String = "",
    val selectedCategory: String? = null,
    val hideDone: Boolean = false,
    val categoryCounts: List<CategoryCount> = emptyList(),
    val items: List<ItemEntity> = emptyList()
)

@OptIn(ExperimentalCoroutinesApi::class)
class BrowseViewModel(private val repository: ItemRepository) : ViewModel() {

    private val query = MutableStateFlow("")
    private val selectedCategory = MutableStateFlow<String?>(null)
    private val hideDone = MutableStateFlow(false)

    private val filters = combine(query, selectedCategory, hideDone) { q, cat, hide -> Triple(q, cat, hide) }

    private val items = filters.flatMapLatest { (q, cat, hide) ->
        repository.observeFiltered(q, cat, hide)
    }

    val uiState: StateFlow<BrowseUiState> = combine(
        query, selectedCategory, hideDone, repository.observeCategoryCounts(), items
    ) { q, cat, hide, counts, list ->
        BrowseUiState(
            query = q,
            selectedCategory = cat,
            hideDone = hide,
            categoryCounts = counts,
            items = list
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), BrowseUiState())

    fun setQuery(value: String) {
        query.value = value
    }

    fun selectCategory(category: String?) {
        selectedCategory.value = if (selectedCategory.value == category) null else category
    }

    fun setHideDone(value: Boolean) {
        hideDone.value = value
    }

    fun toggleDone(item: ItemEntity) {
        viewModelScope.launch { repository.toggleDone(item) }
    }
}
