package com.ideabench.app.data.local

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

data class CategoryCount(val category: String, val count: Int)

@Dao
interface ItemDao {

    /** Returns -1 when the insert was skipped because [ItemEntity.contentHash] already exists. */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(item: ItemEntity): Long

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertAll(items: List<ItemEntity>): List<Long>

    @Update
    suspend fun update(item: ItemEntity)

    @Delete
    suspend fun delete(item: ItemEntity)

    @Query("SELECT * FROM items WHERE id = :id")
    suspend fun getById(id: Long): ItemEntity?

    @Query("SELECT * FROM items WHERE id = :id")
    fun observeById(id: Long): Flow<ItemEntity?>

    @Query("SELECT * FROM items WHERE contentHash = :hash LIMIT 1")
    suspend fun getByHash(hash: String): ItemEntity?

    @Query("SELECT EXISTS(SELECT 1 FROM items WHERE contentHash = :hash)")
    suspend fun existsByHash(hash: String): Boolean

    @Query(
        """
        SELECT * FROM items
        WHERE (:hideDone = 0 OR done = 0)
        AND (:category IS NULL OR category = :category)
        AND (
            :query = '' OR
            title LIKE '%' || :query || '%' OR
            text LIKE '%' || :query || '%' OR
            tags LIKE '%' || :query || '%' OR
            category LIKE '%' || :query || '%'
        )
        ORDER BY createdAt DESC
        """
    )
    fun observeFiltered(query: String, category: String?, hideDone: Boolean): Flow<List<ItemEntity>>

    @Query("SELECT category, COUNT(*) as count FROM items WHERE category != '' GROUP BY category ORDER BY count DESC")
    fun observeCategoryCounts(): Flow<List<CategoryCount>>

    @Query("SELECT DISTINCT category FROM items WHERE category != '' ORDER BY category")
    suspend fun getDistinctCategories(): List<String>

    @Query("SELECT * FROM items WHERE analyzed = 0 AND type = :type ORDER BY createdAt ASC LIMIT :limit")
    suspend fun getUnanalyzedBatch(type: ItemType, limit: Int): List<ItemEntity>

    @Query("SELECT COUNT(*) FROM items WHERE analyzed = 0")
    fun observeUnanalyzedCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM items WHERE analyzed = 0 AND type = :type")
    suspend fun countUnanalyzedByType(type: ItemType): Int

    @Query("SELECT COUNT(*) FROM items WHERE type = :type")
    suspend fun countByType(type: ItemType): Int

    @Query("SELECT * FROM items WHERE done = 0 ORDER BY createdAt ASC")
    fun observeFocusQueue(): Flow<List<ItemEntity>>
}
