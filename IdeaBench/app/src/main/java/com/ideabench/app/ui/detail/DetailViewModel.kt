package com.ideabench.app.ui.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ideabench.app.data.local.ItemEntity
import com.ideabench.app.data.repository.ItemRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class DetailViewModel(private val repository: ItemRepository) : ViewModel() {

    private val _item = MutableStateFlow<ItemEntity?>(null)
    val item: StateFlow<ItemEntity?> = _item.asStateFlow()

    private val _deleted = MutableStateFlow(false)
    val deleted: StateFlow<Boolean> = _deleted.asStateFlow()

    fun load(id: Long) {
        viewModelScope.launch {
            _item.value = repository.getById(id)
        }
    }

    fun save(title: String, text: String, category: String, tagsCsv: String, nextStep: String) {
        val current = _item.value ?: return
        val updated = current.copy(
            title = title.trim(),
            text = text,
            category = category.trim(),
            tags = ItemEntity.joinTags(tagsCsv.split(",")),
            nextStep = nextStep.trim(),
            analyzed = true
        )
        _item.value = updated
        viewModelScope.launch { repository.update(updated) }
    }

    fun toggleDone() {
        val current = _item.value ?: return
        val updated = current.copy(done = !current.done)
        _item.value = updated
        viewModelScope.launch { repository.update(updated) }
    }

    fun delete() {
        val current = _item.value ?: return
        viewModelScope.launch {
            repository.delete(current)
            _deleted.value = true
        }
    }
}
