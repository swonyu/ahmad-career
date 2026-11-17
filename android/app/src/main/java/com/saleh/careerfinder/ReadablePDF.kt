package com.saleh.careerfinder

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import java.io.File

/** Checks a bounded document with Android's supported renderer before replacing the saved résumé. */
internal object ReadablePDF {
    fun validate(context: Context, bytes: ByteArray) {
        BoundaryPolicy.readPDF(bytes.inputStream())
        val temporary = File.createTempFile("resume-check-", ".pdf", context.cacheDir)
        try {
            temporary.outputStream().use { it.write(bytes) }
            ParcelFileDescriptor.open(temporary, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
                PdfRenderer(descriptor).use { renderer ->
                    require(renderer.pageCount > 0) { "Choose a PDF with at least one readable page." }
                    renderer.openPage(0).use { page ->
                        require(page.width > 0 && page.height > 0) { "The first PDF page could not be read." }
                        // Fixed-size rendering prevents a large page from allocating a full-page bitmap.
                        val bitmap = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888)
                        try {
                            bitmap.eraseColor(Color.WHITE)
                            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        } finally { bitmap.recycle() }
                    }
                }
            }
        } catch (error: Exception) {
            throw IllegalArgumentException("This PDF could not be opened as a readable document. Choose an unencrypted PDF with at least one page. Your previous résumé is kept.", error)
        } finally { temporary.delete() }
    }
}
