package androidx.test.platform.app

import host.HostMain
import java.io.File
import java.io.InputStream

// The actual existing tests use only assets and main-loop synchronization here.
object InstrumentationRegistry {
    private val instrumentation = HostInstrumentation()
    fun getInstrumentation() = instrumentation
}
class HostInstrumentation {
    val context = HostContext()
    fun runOnMainSync(block: () -> Unit) = HostMain.sync(block)
    fun waitForIdleSync() = HostMain.sync {}
}
class HostContext { val assets = HostAssets() }
class HostAssets {
    fun open(name: String): InputStream {
        require(name == "discovery-search-v1.json")
        return File(System.getProperty("career.host.assets"), name).inputStream()
    }
}
