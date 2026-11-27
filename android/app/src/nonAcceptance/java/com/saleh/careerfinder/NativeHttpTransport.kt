package com.saleh.careerfinder

import javax.net.ssl.HttpsURLConnection

/** Ordinary preview/release: no fixture authority, routing override or headers. */
internal object NativeHttpTransport {
    val discoveryOrigin: String get() = ServicePages.DEFAULT_ORIGIN
    @Suppress("UNUSED_PARAMETER")
    fun configure(connection: HttpsURLConnection) = Unit
}
