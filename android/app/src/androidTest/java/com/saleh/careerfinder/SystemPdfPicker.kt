package com.saleh.careerfinder

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Rect
import android.os.SystemClock
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject

/** The same live DocumentsUI window, target and physical-touch checks in both phone journeys. */
internal class SystemPdfPicker(
    private val context: Context,
    private val evidence: (String, JSONObject) -> Unit
) : AutoCloseable {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val automation = instrumentation.uiAutomation
    val windows = PhoneWindowObservation()
    private var pickerPackage: String? = null
    private var pickerComponent: String? = null
    private var pickerNumber = 0
    val active get() = pickerPackage != null

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
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/pdf")
        val resolved = checkNotNull(context.packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY))
        val activityInfo = resolved.activityInfo
        val packageName = activityInfo.packageName
        require(packageName in setOf("com.android.documentsui", "com.google.android.documentsui"))
        require(activityInfo.name.isNotBlank() && activityInfo.applicationInfo.flags and ApplicationInfo.FLAG_SYSTEM != 0)
        waitStrict("The actual system document picker must own a visible application window") {
            pickerWindows(packageName).size == 1
        }
        pickerPackage = packageName
        pickerComponent = packageName + "/" + activityInfo.name
        pickerNumber++
        evidence("picker-open-" + pickerNumber + ".json",
            JSONObject().put("schemaVersion", 1).put("resolvedSystemComponent", pickerComponent)
                .put("visibleWindowPackage", packageName).put("visibleApplicationWindowCount", 1)
                .put("actualOpenDocumentIntent", true).put("syntheticChooserResult", false))
        return packageName
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
        val bounds = fresh.getJSONArray("boundsInScreen")
        val x = ((bounds.getDouble(0) + bounds.getDouble(2)) / 2).toFloat()
        val y = ((bounds.getDouble(1) + bounds.getDouble(3)) / 2).toFloat()
        require(SystemClock.elapsedRealtime() < deadline) { "No picker touch may begin after the original observation deadline" }
        val start = SystemClock.uptimeMillis()
        val down = MotionEvent.obtain(start, start, MotionEvent.ACTION_DOWN, x, y, 0)
        val up = MotionEvent.obtain(start, start + 50, MotionEvent.ACTION_UP, x, y, 0)
        try {
            require(automation.injectInputEvent(down, true))
            require(automation.injectInputEvent(up, true))
        } finally { down.recycle(); up.recycle() }
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

    private fun pickerWindows(packageName: String): List<AccessibilityWindowInfo> = automation.windows.filter { window ->
        if (window.type != AccessibilityWindowInfo.TYPE_APPLICATION) false
        else window.root?.let { root -> try { root.packageName?.toString() == packageName } finally { root.recycle() } } == true
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
                        var action = AccessibilityNodeInfo.obtain(node)
                        try {
                            var depth = 0
                            while (!action.isClickable && depth++ < 5) {
                                val parent = action.parent ?: break
                                action.recycle(); action = parent
                            }
                            val bounds = Rect().also(action::getBoundsInScreen)
                            if (action.packageName?.toString() == packageName && action.isVisibleToUser && action.isEnabled &&
                                action.isClickable && bounds.width() > 0 && bounds.height() > 0 && windowBounds.contains(bounds)) {
                                targets += JSONObject().put("package", packageName).put("text", filename)
                                    .put("className", action.className?.toString()).put("resourceID", action.viewIdResourceName ?: JSONObject.NULL)
                                    .put("boundsInScreen", bounds.json()).put("windowBounds", windowBounds.json())
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
    override fun close() = windows.close()
}
