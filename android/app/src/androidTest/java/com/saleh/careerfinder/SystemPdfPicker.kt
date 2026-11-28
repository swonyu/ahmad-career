package com.saleh.careerfinder

import android.accessibilityservice.AccessibilityServiceInfo
import android.app.Instrumentation
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Rect
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.system.Os
import android.system.OsConstants
import android.system.StructPollfd
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import androidx.activity.result.contract.ActivityResultContracts
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/** The same live DocumentsUI window, target and physical-touch checks in both phone journeys. */
internal class SystemPdfPicker(
    private val context: Context,
    private val evidence: (String, JSONObject) -> Unit
) : AutoCloseable {
    private companion object {
        const val RESOLVE_COMMAND =
            "cmd package resolve-activity --components --user 0 --query-flags 0x10000 -a android.intent.action.OPEN_DOCUMENT -t '*/*' --esa android.intent.extra.MIME_TYPES application/pdf"
        const val ANDROID_SYSTEM_COMMAND = "cmd package list packages -s --user 0 com.android.documentsui"
        const val GOOGLE_SYSTEM_COMMAND = "cmd package list packages -s --user 0 com.google.android.documentsui"
        val pickerPackages = setOf("com.android.documentsui", "com.google.android.documentsui")
    }
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val automation = instrumentation.uiAutomation
    val windows = PhoneWindowObservation()
    private val launchMonitor = object : Instrumentation.ActivityMonitor() {
        @Volatile var started: Intent? = null
        override fun onStartActivity(intent: Intent): Instrumentation.ActivityResult? {
            if (intent.action == Intent.ACTION_OPEN_DOCUMENT) started = Intent(intent)
            return null // Observe the app's real launch without blocking DocumentsUI.
        }
    }
    private var pickerPackage: String? = null
    private var pickerComponent: String? = null
    private var pickerNumber = 0
    val active get() = pickerPackage != null
    init { instrumentation.addMonitor(launchMonitor) }

    private fun waitStrict(message: String, predicate: () -> Boolean) {
        val deadline = SystemClock.elapsedRealtime() + 5000
        while (SystemClock.elapsedRealtime() < deadline) {
            val matched = predicate()
            val end = SystemClock.elapsedRealtime()
            if (matched && end < deadline) return
            if (end >= deadline) break
            SystemClock.sleep(minOf(25, deadline - end))
        }
        throw AssertionError(message + " (strict five-second observation expired)")
    }

    fun waitForDocumentPicker(): String {
        val expected = ActivityResultContracts.OpenDocument().createIntent(context, arrayOf("application/pdf"))
        require(expected.action == Intent.ACTION_OPEN_DOCUMENT && expected.type == "*/*" &&
            expected.getStringArrayExtra(Intent.EXTRA_MIME_TYPES)
                ?.contentEquals(arrayOf("application/pdf")) == true)
        waitStrict("The app must actually launch AndroidX OpenDocument for PDF") { launchMonitor.started != null }
        val launched = checkNotNull(launchMonitor.started)
        require(launched.filterEquals(expected) && launched.getStringArrayExtra(Intent.EXTRA_MIME_TYPES)
            ?.contentEquals(arrayOf("application/pdf")) == true) { "The observed picker launch must match AndroidX PDF intent" }
        launchMonitor.started = null
        val resolved = context.packageManager.resolveActivity(launched, PackageManager.MATCH_DEFAULT_ONLY)
        val component = if (resolved == null) {
            shellResolvedSystemComponent()
        } else {
            val info = resolved.activityInfo
            require(info.packageName in pickerPackages && info.name.isNotBlank() &&
                (info.applicationInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0)
            ComponentName(info.packageName, info.name)
        }
        val packageName = component.packageName
        val componentName = packageName + "/" + component.className
        val serviceInfo = requireNotNull(automation.serviceInfo)
        val interactiveFlag = AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
        val reapplyInteractiveFlag = serviceInfo.flags and interactiveFlag == 0
        if (reapplyInteractiveFlag) automation.serviceInfo = serviceInfo.apply { flags = flags or interactiveFlag }
        val opening = JSONObject().put("resolvedSystemComponent", componentName)
            .put("resolver", if (resolved == null) "shell-package-query" else "app-package-manager")
            .put("interactiveWindowFlagReapplied", reapplyInteractiveFlag)
        evidence("picker-opening-" + (pickerNumber + 1) + ".json", opening)
        var lastRoots: List<String?> = emptyList()
        var lastWindowTypes = emptyList<Int>()
        try {
            waitStrict("The actual system document picker must own a visible application window") {
                val allWindows = automation.windows
                lastWindowTypes = allWindows.map { it.type }
                lastRoots = allWindows.filter { it.type == AccessibilityWindowInfo.TYPE_APPLICATION }.map(::rootPackage)
                lastRoots.count { it == packageName } == 1
            }
        } catch (failure: AssertionError) {
            // Retain the last sampled window inventory without treating a later observation as a pass.
            try {
                val allowed = JSONObject()
                pickerPackages.forEach { candidate -> allowed.put(candidate, lastRoots.count { it == candidate }) }
                evidence("picker-window-failure-" + (pickerNumber + 1) + ".json", opening
                    .put("lastWindowCount", lastWindowTypes.size).put("lastWindowTypes", JSONArray(lastWindowTypes.take(16)))
                    .put("lastApplicationWindowCount", lastRoots.size)
                    .put("lastMissingRootCount", lastRoots.count { it == null }).put("lastPickerRoots", allowed))
            } catch (captureError: Exception) { failure.addSuppressed(captureError) }
            throw failure
        }
        pickerPackage = packageName
        pickerComponent = componentName
        pickerNumber++
        evidence("picker-open-" + pickerNumber + ".json",
            JSONObject().put("schemaVersion", 1).put("resolvedSystemComponent", pickerComponent)
                .put("visibleWindowPackage", packageName).put("visibleApplicationWindowCount", 1)
                .put("actualOpenDocumentIntent", true).put("syntheticChooserResult", false))
        return packageName
    }

    private fun shellResolvedSystemComponent(): ComponentName {
        val component = checkNotNull(ComponentName.unflattenFromString(readShell(RESOLVE_COMMAND))) {
            "The read-only package resolver did not return one Android component"
        }
        val systemCommand = when (component.packageName) {
            "com.android.documentsui" -> ANDROID_SYSTEM_COMMAND
            "com.google.android.documentsui" -> GOOGLE_SYSTEM_COMMAND
            else -> error("The document resolver is not an allowed system picker")
        }
        require(component.className.matches(Regex("[A-Za-z_.$][A-Za-z0-9_.$]*")) &&
            readShell(systemCommand) == "package:" + component.packageName) {
            "The resolved picker package must be installed as a system package"
        }
        return component
    }

    private fun readShell(command: String): String {
        require(command in setOf(RESOLVE_COMMAND, ANDROID_SYSTEM_COMMAND, GOOGLE_SYSTEM_COMMAND))
        val descriptor = automation.executeShellCommand(command)
        return ParcelFileDescriptor.AutoCloseInputStream(descriptor).use { input ->
            val poll = StructPollfd().apply {
                fd = descriptor.fileDescriptor
                events = (OsConstants.POLLIN or OsConstants.POLLHUP).toShort()
            }
            val deadline = SystemClock.elapsedRealtime() + 3000
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(128)
            while (true) {
                val remaining = deadline - SystemClock.elapsedRealtime()
                require(remaining > 0 && Os.poll(arrayOf(poll), remaining.toInt()) > 0) {
                    "The read-only package query exceeded its three-second limit"
                }
                require((poll.revents.toInt() and (OsConstants.POLLERR or OsConstants.POLLNVAL)) == 0) {
                    "The package query pipe failed"
                }
                val count = input.read(buffer)
                if (count < 0) return@use output.toString(Charsets.UTF_8.name()).trim()
                require(output.size() + count <= 512) { "The package query output exceeded 512 bytes" }
                output.write(buffer, 0, count)
            }
            error("Unreachable package query state")
        }
    }

    fun cancelDocumentPicker() {
        val expected = checkNotNull(pickerPackage)
        val component = checkNotNull(pickerComponent)
        require(pickerWindows(expected).size == 1)
        instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
        waitStrict("The real document picker must close after Cancel/Back") { pickerWindows(expected).isEmpty() }
        evidence("picker-back-" + pickerNumber + ".json",
            JSONObject().put("schemaVersion", 1).put("resolvedSystemComponent", component)
                .put("actualBackKeyIssued", true).put("pickerWindowCountAfter", pickerWindows(expected).size)
                .put("pickerClosed", true).put("noModelInjection", true))
        pickerPackage = null
        pickerComponent = null
    }

    fun selectDocument(name: String) {
        require(name in setOf("CV-A.pdf", "CV-B.pdf"))
        val expected = checkNotNull(pickerPackage)
        val component = checkNotNull(pickerComponent)
        // Both independent live DocumentsUI target resolutions share the same first-observation budget.
        val started = SystemClock.elapsedRealtime()
        val deadline = started + 5000L
        var selected: JSONObject? = null
        while (SystemClock.elapsedRealtime() < deadline && selected == null) {
            selected = documentTarget(expected, name, deadline)
            if (selected == null) SystemClock.sleep(minOf(25L, (deadline - SystemClock.elapsedRealtime()).coerceAtLeast(1L)))
        }
        require(selected != null && SystemClock.elapsedRealtime() < deadline) {
            "Actual DocumentsUI target not uniquely visible inside the first five-second budget"
        }
        val firstResolutionElapsedMillis = SystemClock.elapsedRealtime() - started
        // Re-resolve immediately before the physical touch, without resetting the budget.
        val fresh = checkNotNull(documentTarget(expected, name, deadline))
        require(SystemClock.elapsedRealtime() < deadline) { "Second actual DocumentsUI resolution exceeded original budget" }
        val secondResolutionElapsedMillis = SystemClock.elapsedRealtime() - started
        require(fresh.getJSONArray("boundsInScreen").toString() == selected.getJSONArray("boundsInScreen").toString())
        require(fresh.getJSONArray("filenameBoundsInScreen").toString() ==
            selected.getJSONArray("filenameBoundsInScreen").toString())
        val bounds = fresh.getJSONArray("filenameBoundsInScreen")
        val x = ((bounds.getDouble(0) + bounds.getDouble(2)) / 2).toFloat()
        val y = ((bounds.getDouble(1) + bounds.getDouble(3)) / 2).toFloat()
        evidence("picker-touch-requested-" + name + ".json",
            JSONObject(fresh.toString()).put("filename", name).put("resolvedSystemComponent", component)
                .put("touchX", x.toDouble()).put("touchY", y.toDouble())
                .put("inputSource", InputDevice.SOURCE_TOUCHSCREEN)
                .put("selectionAcceptance", "pending"))
        val downTime = SystemClock.uptimeMillis()
        val touchSource = InputDevice.SOURCE_TOUCHSCREEN
        val deviceID = InputDevice.getDeviceIds().firstOrNull { InputDevice.getDevice(it)?.supportsSource(touchSource) == true } ?: 0
        val finger = MotionEvent.PointerProperties().apply { id = 0; toolType = MotionEvent.TOOL_TYPE_FINGER }
        val point = MotionEvent.PointerCoords().apply { this.x = x; this.y = y; size = 1f }
        fun sendTouch(action: Int, pressure: Float) {
            point.pressure = pressure
            val event = MotionEvent.obtain(downTime, SystemClock.uptimeMillis(), action, 1, arrayOf(finger), arrayOf(point),
                0, 0, 1f, 1f, deviceID, 0, touchSource, 0)
            try { require(automation.injectInputEvent(event, true)) }
            finally { event.recycle() }
        }
        require(SystemClock.elapsedRealtime() < deadline) { "No picker touch may begin after the original observation deadline" }
        sendTouch(MotionEvent.ACTION_DOWN, 1f)
        SystemClock.sleep(50)
        sendTouch(MotionEvent.ACTION_UP, 0f)
        waitStrict("The actual PDF selection must return from the system picker") { pickerWindows(expected).isEmpty() }
        evidence("picker-selected-" + name + ".json",
            fresh.put("filename", name).put("singlePhysicalTouch", true).put("noModelInjection", true)
                .put("resolvedSystemComponent", component).put("firstTwoResolutionsWithinFiveSeconds", true)
                .put("firstResolutionElapsedMillis", firstResolutionElapsedMillis)
                .put("secondResolutionElapsedMillis", secondResolutionElapsedMillis)
                .put("selectionAndDismissalElapsedMillis", SystemClock.elapsedRealtime() - started)
                .put("pickerWindowCountAfter", pickerWindows(expected).size))
        pickerPackage = null
        pickerComponent = null
    }

    private fun rootPackage(window: AccessibilityWindowInfo): String? = window.root?.let { root ->
        try { root.packageName?.toString() } finally { root.recycle() }
    }

    private fun pickerWindows(packageName: String): List<AccessibilityWindowInfo> = automation.windows.filter { window ->
        window.type == AccessibilityWindowInfo.TYPE_APPLICATION && rootPackage(window) == packageName
    }

    private fun documentTarget(packageName: String, filename: String, deadline: Long): JSONObject? {
        val windows = pickerWindows(packageName)
        if (SystemClock.elapsedRealtime() >= deadline || windows.size != 1) return null
        val window = windows.single()
        val windowBounds = Rect().also(window::getBoundsInScreen)
        val root = window.root ?: return null
        val queue = java.util.ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        val targets = mutableListOf<JSONObject>()
        var count = 0
        try {
            while (queue.isNotEmpty() && count++ < 600 && SystemClock.elapsedRealtime() < deadline) {
                val node = queue.removeFirst()
                try {
                    if (node.packageName?.toString() == packageName && node.isVisibleToUser && node.text?.toString() == filename) {
                        val filenameBounds = Rect().also(node::getBoundsInScreen)
                        var action = AccessibilityNodeInfo.obtain(node)
                        try {
                            var depth = 0
                            while (!action.isClickable && depth++ < 5) {
                                val parent = action.parent ?: break
                                action.recycle(); action = parent
                            }
                            val bounds = Rect().also(action::getBoundsInScreen)
                            if (action.packageName?.toString() == packageName && action.isVisibleToUser && action.isEnabled &&
                                action.isClickable && bounds.width() > 0 && bounds.height() > 0 && windowBounds.contains(bounds) &&
                                filenameBounds.width() > 0 && filenameBounds.height() > 0 &&
                                bounds.contains(filenameBounds) && windowBounds.contains(filenameBounds)) {
                                targets += JSONObject().put("package", packageName).put("text", filename)
                                    .put("className", action.className?.toString()).put("resourceID", action.viewIdResourceName ?: JSONObject.NULL)
                                    .put("boundsInScreen", bounds.json()).put("filenameBoundsInScreen", filenameBounds.json())
                                    .put("windowBounds", windowBounds.json())
                                    .put("visible", true).put("enabled", true).put("clickable", true)
                            }
                        } finally { action.recycle() }
                    }
                    for (index in 0 until node.childCount) node.getChild(index)?.let(queue::add)
                } finally { node.recycle() }
            }
        } finally { while (queue.isNotEmpty()) queue.removeFirst().recycle() }
        if (SystemClock.elapsedRealtime() >= deadline) return null
        require(queue.isEmpty() && count < 600) { "The bounded system picker tree was incomplete" }
        return targets.singleOrNull()
    }

    private fun Rect.json() = JSONArray(listOf(left, top, right, bottom))
    override fun close() {
        try { instrumentation.removeMonitor(launchMonitor) }
        finally { windows.close() }
    }
}
