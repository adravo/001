package com.ideabench.app.data.util

import java.security.MessageDigest

object Hashing {
    /** Stable content hash used to skip duplicate notes/screenshots on (re-)import. */
    fun sha256(input: String): String {
        val normalized = input.trim()
        val digest = MessageDigest.getInstance("SHA-256").digest(normalized.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    fun sha256(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        return digest.joinToString("") { "%02x".format(it) }
    }
}
