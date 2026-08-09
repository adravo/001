package com.ideabench.app.data.local

import androidx.room.TypeConverter

class Converters {
    @TypeConverter
    fun fromItemType(value: ItemType): String = value.name

    @TypeConverter
    fun toItemType(value: String): ItemType = ItemType.valueOf(value)
}
