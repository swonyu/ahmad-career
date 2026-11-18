@file:OptIn(kotlinx.coroutines.InternalCoroutinesApi::class)
package host

import kotlinx.coroutines.MainCoroutineDispatcher
import kotlinx.coroutines.internal.MainDispatcherFactory
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference
import kotlin.coroutines.CoroutineContext

// JVM-only main-loop adapter: no Android Looper, Context, emulator or device.
object HostMain {
    private val thread = AtomicReference<Thread>()
    private val executor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "discovery-host-main").apply { isDaemon = true; thread.set(this) }
    }
    val dispatcher = object : MainCoroutineDispatcher() {
        override val immediate: MainCoroutineDispatcher get() = this
        override fun dispatch(context: CoroutineContext, block: Runnable) { executor.execute(block) }
    }
    fun sync(block: () -> Unit) {
        if (Thread.currentThread() === thread.get()) block()
        else executor.submit { block() }.get()
    }
}
class HostMainDispatcherFactory : MainDispatcherFactory {
    override val loadPriority: Int get() = Int.MAX_VALUE
    override fun createDispatcher(allFactories: List<MainDispatcherFactory>): MainCoroutineDispatcher = HostMain.dispatcher
    override fun hintOnError(): String = "Standalone discovery host main-loop adapter"
}
