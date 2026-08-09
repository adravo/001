package com.ideabench.app.data.repository

import com.ideabench.app.data.local.CategoryCount
import com.ideabench.app.data.local.ItemDao
import com.ideabench.app.data.local.ItemEntity
import com.ideabench.app.data.local.ItemType
import kotlinx.coroutines.flow.Flow

/** Maximum number of distinct categories we ask the model to keep the taxonomy usable. */
const val MAX_CATEGORIES = 10

class ItemRepository(private val dao: ItemDao) {

    fun observeFiltered(query: String, category: String?, hideDone: Boolean): Flow<List<ItemEntity>> =
        dao.observeFiltered(query.trim(), category, hideDone)

    fun observeCategoryCounts(): Flow<List<CategoryCount>> = dao.observeCategoryCounts()

    fun observeUnanalyzedCount(): Flow<Int> = dao.observeUnanalyzedCount()

    fun observeFocusQueue(): Flow<List<ItemEntity>> = dao.observeFocusQueue()

    suspend fun getById(id: Long): ItemEntity? = dao.getById(id)

    suspend fun update(item: ItemEntity) = dao.update(item)

    suspend fun delete(item: ItemEntity) = dao.delete(item)

    suspend fun toggleDone(item: ItemEntity) = dao.update(item.copy(done = !item.done))

    /** Inserts unless [ItemEntity.contentHash] already exists. Returns true if it was a new item. */
    suspend fun insertIfNew(item: ItemEntity): Boolean {
        val id = dao.insert(item)
        return id != -1L
    }

    suspend fun insertAllNew(items: List<ItemEntity>): Int {
        var inserted = 0
        for (item in items) {
            if (insertIfNew(item)) inserted++
        }
        return inserted
    }

    suspend fun existsByHash(hash: String): Boolean = dao.existsByHash(hash)

    suspend fun getByHash(hash: String): ItemEntity? = dao.getByHash(hash)

    suspend fun getDistinctCategories(): List<String> = dao.getDistinctCategories()

    suspend fun getUnanalyzedBatch(limit: Int, type: ItemType = ItemType.TEXT): List<ItemEntity> =
        dao.getUnanalyzedBatch(type, limit)

    suspend fun countUnanalyzedByType(type: ItemType): Int = dao.countUnanalyzedByType(type)

    suspend fun countByType(type: ItemType): Int = dao.countByType(type)
}
