package com.saleh.careerfinder

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore

/** Publish only caller-owned synthetic PDF bytes for a real DocumentsUI selection. */
internal fun publishSyntheticPdf(context: Context, name: String, bytes: ByteArray, namespace: String): Uri {
    require(Build.VERSION.SDK_INT >= 29)
    require(name in setOf("CV-A.pdf", "CV-B.pdf"))
    require(namespace.matches(Regex("[A-Za-z0-9-]{1,80}")))
    BoundaryPolicy.readPDF(bytes.inputStream())
    val resolver = context.contentResolver
    val values = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, name)
        put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
        put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/CareerFinder-" + namespace)
        put(MediaStore.MediaColumns.IS_PENDING, 1)
    }
    val target = checkNotNull(resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values))
    try {
        android.os.ParcelFileDescriptor.AutoCloseOutputStream(checkNotNull(resolver.openFileDescriptor(target, "w"))).use { output ->
            output.write(bytes); output.fd.sync()
        }
        require(resolver.update(target, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null) == 1)
        val stored = checkNotNull(resolver.openInputStream(target)).use { BoundaryPolicy.readBounded(it, bytes.size + 1) }
        require(stored.contentEquals(bytes))
        return target
    } catch (error: Throwable) {
        resolver.delete(target, null, null)
        throw error
    }
}
