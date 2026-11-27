#!/usr/bin/env python3
"""Execute the actual Android controller and history policy in an isolated JVM harness.

Only Android transport, private JSON serialization, and UI runtime bindings are
stubbed. No Android SDK, emulator, network, or canonical checkout is used.
"""

from pathlib import Path
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
DISCOVERY = Path("android/app/src/main/java/com/saleh/careerfinder/Discovery.kt")
HISTORY = Path("android/app/src/main/java/com/saleh/careerfinder/DiscoverySearchHistory.kt")
gradle_cache = Path(os.environ.get("GRADLE_USER_HOME", Path.home() / ".gradle"))
libraries = sorted(gradle_cache.glob("wrapper/dists/gradle-*/*/gradle-*/lib"), reverse=True)
if os.environ.get("GRADLE_HOME"):
    libraries.insert(0, Path(os.environ["GRADLE_HOME"]) / "lib")
for LIB in libraries:
    compiler_jars = list(LIB.glob("kotlin-compiler-embeddable-*.jar"))
    standard = list(LIB.glob("kotlin-stdlib-[0-9]*.jar"))
    coroutines = list(LIB.glob("kotlinx-coroutines-core-jvm-*.jar"))
    if compiler_jars and len(standard) == len(coroutines) == 1:
        break
else:
    raise SystemExit("Set GRADLE_HOME to a Gradle installation with its bundled Kotlin compiler, standard library and coroutines.")
java_home = os.environ.get("JAVA_HOME")
if not java_home and sys.platform == "darwin" and shutil.which("brew"):
    prefix = subprocess.run(["brew", "--prefix", "openjdk@17"], capture_output=True, text=True)
    if prefix.returncode == 0 and (Path(prefix.stdout.strip()) / "bin/java").is_file():
        java_home = prefix.stdout.strip()
JAVA = str(Path(java_home) / "bin/java") if java_home else shutil.which("java")
if not JAVA:
    raise SystemExit("Set JAVA_HOME to a JDK supported by the local Gradle Kotlin compiler (Java 17 is tested).")
RUNTIME = os.pathsep.join(map(str, [standard[0], coroutines[0]]))


def read(path: Path, baseline: bool) -> str:
    if baseline:
        return subprocess.check_output(["git", "show", f"HEAD:{path}"], cwd=ROOT, text=True)
    return (ROOT / path).read_text()


def extract(discovery: str, history: str) -> str:
    models = discovery[discovery.index("data class DiscoveryFilters("):discovery.index("/** Public discovery never receives")]
    controller = discovery[discovery.index("class DiscoveryController("):]
    policy = history[history.index("data class DiscoveryHistoryBoard("):history.index("    fun encode(history: DiscoverySearchHistory)")]
    return """package com.saleh.careerfinder
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.sync.*
import org.json.JSONObject
import java.time.Instant
import java.text.Normalizer
import java.util.Locale
""" + models + "\n" + policy + "}\n" + controller


JSON_STUB = """package org.json
class JSONObject(val value: Any?)
"""

HARNESS = r'''package com.saleh.careerfinder

import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

data class DiscoverySnapshot(val filters: DiscoveryFilters, val displayedFilters: DiscoveryFilters?, val page: DiscoveryPage?,
    val searchHistory: DiscoverySearchHistory? = null, val newResult: DiscoveryNewResult? = null,
    val lastSearchSourceIds: List<String>? = null)

object DiscoverySnapshotCodec {
    const val MAX_JOBS = 200
    fun encode(value: DiscoverySnapshot): JSONObject {
        if (value.newResult != null) check(DiscoveryHistoryPolicy.valid(value.newResult,
            value.displayedFilters!!, value.lastSearchSourceIds!!, value.page!!.jobs, value.searchHistory!!))
        return JSONObject(value)
    }
    fun decode(value: JSONObject) = value.value as DiscoverySnapshot
}

interface PrivateStore {
    fun read(name: String): JSONObject?
    fun write(name: String, value: JSONObject)
}

private const val BOARD = "greenhouse:career-feature-fixture"
object PublicDiscoveryService : DiscoveryService {
    fun canonicalSources(values: List<String>) = values
    fun canonicalBoard(value: String): DiscoveryBoardIdentity? = value.takeIf { it == BOARD }?.let {
        DiscoveryBoardIdentity(it, "greenhouse", "", it.substringAfter(':'), "https://example.invalid")
    }
    fun hasDuplicateCanonical(values: List<String>) = values.size != values.distinct().size
    fun searchURL(filters: DiscoveryFilters, cursor: String?) = "synthetic:$filters:$cursor"
    override suspend fun sources() = DiscoveryCatalog(listOf(BOARD), emptyList(), 4, "Synthetic")
    override suspend fun search(filters: DiscoveryFilters, cursor: String?): DiscoveryPage = error("Injected service required")
}

private fun page(vararg names: String): DiscoveryPage {
    val date = "2026-11-21T00:00:00Z"
    val jobs = names.map { name -> DiscoveredJob("$BOARD:$name", BOARD, "Synthetic", "greenhouse",
        "Role $name", "Example", "https://example.invalid/$name", "", "JO", null, "", null, null, date, false) }
    val source = DiscoverySourceStatus(BOARD, "Synthetic", "greenhouse", "https://example.invalid", "fresh",
        date, names.size, names.size, false, null)
    return DiscoveryPage(date, "complete", jobs, listOf(source), null, jobs.size, false, "Synthetic")
}

private class Store : PrivateStore {
    val records = ConcurrentHashMap<String, JSONObject>()
    @Volatile var entered: CountDownLatch? = null
    @Volatile var release: CountDownLatch? = null
    @Volatile var failOnce = false
    override fun read(name: String) = records[name]
    override fun write(name: String, value: JSONObject) {
        val gate = release
        if (gate != null) {
            entered?.countDown()
            check(gate.await(8, TimeUnit.SECONDS))
        }
        if (failOnce) { failOnce = false; throw IOException("Synthetic pending write failure") }
        records[name] = value
    }
}

private class Service : DiscoveryService {
    @Volatile var result = page("A", "B")
    @Volatile var failure: Exception? = null
    val calls = AtomicInteger()
    override suspend fun sources() = DiscoveryCatalog(listOf(BOARD), emptyList(), 4, "Synthetic")
    override suspend fun search(filters: DiscoveryFilters, cursor: String?): DiscoveryPage {
        calls.incrementAndGet()
        failure?.let { throw it }
        return result
    }
}

private suspend fun await(check: () -> Boolean) {
    withTimeout(5_000) { while (!check()) delay(10) }
}

private suspend fun scenario(failFirst: Boolean, outageNext: Boolean = false, failureNext: Boolean = false) {
    val dispatcher = Executors.newSingleThreadExecutor().asCoroutineDispatcher()
    val scope = CoroutineScope(SupervisorJob() + dispatcher)
    val store = Store()
    val service = Service()
    val controller = DiscoveryController(scope, service)
    try {
        withContext(dispatcher) {
            controller.attachPrivateSession(store, "search")
            controller.editFilters { DiscoveryFilters("care", "", false, listOf(BOARD)) }
            controller.search()
        }
        await { !controller.state.value.loading && store.records.containsKey("search") }
        val before = store.records.getValue("search")
        service.result = page("B", "C")
        store.entered = CountDownLatch(1)
        store.release = CountDownLatch(1)
        store.failOnce = failFirst
        withContext(dispatcher) { controller.search() }
        check(store.entered!!.await(5, TimeUnit.SECONDS)) { "First pending write did not enter" }
        check(store.records.getValue("search") === before)
        if (outageNext) service.result = page().copy(status = "unavailable", sources = listOf(
            page().sources.single().copy(status = "unavailable", error = "Synthetic timeout")))
        if (failureNext) service.failure = IOException("Synthetic network failure")
        withContext(dispatcher) { controller.search() }
        await { service.calls.get() == 3 }
        withContext(dispatcher) { yield() }
        store.release!!.countDown()
        store.release = null
        store.entered = null
        await { !controller.state.value.loading && store.records.getValue("search") !== before }
        withContext(dispatcher) { yield() }
        val expected = if (failFirst || outageNext || failureNext) listOf("$BOARD:C") else emptyList()
        val actual = controller.state.value.newResult?.newIds
        check(actual == expected) { "firstWriteFails=$failFirst outageNext=$outageNext failureNext=$failureNext expected=$expected actual=$actual" }
        val saved = DiscoverySnapshotCodec.decode(store.records.getValue("search"))
        check(saved.newResult!!.newIds == expected)
        check(saved.searchHistory!!.searches.single().boards.single().seenIds ==
            listOf("$BOARD:A", "$BOARD:B", "$BOARD:C"))
        println("PASS firstWriteFails=$failFirst outageNext=$outageNext failureNext=$failureNext newIds=$actual")
    } finally {
        store.release?.countDown()
        scope.cancel()
        dispatcher.close()
    }
}

private suspend fun outageAndReset(resetChecks: Boolean = true) {
    val filters = DiscoveryFilters("care", "", false, listOf(BOARD))
    val seed = DiscoveryHistoryPolicy.evaluate(DiscoverySearchHistory(), filters, page("A", "B"), 1)
    val repeat = DiscoveryHistoryPolicy.evaluate(seed.history, filters, page("B", "C"), 2)
    check(repeat.result!!.newIds == listOf("$BOARD:C"))
    if (resetChecks) {
        val saturated = DiscoverySearchHistory(searches = listOf(DiscoveryHistorySearch(
            DiscoveryHistoryPolicy.key(filters)!!, 1,
            listOf(DiscoveryHistoryBoard(BOARD, (0 until 1000).map { "$BOARD:old-$it" }, true)))))
        val reset = DiscoveryHistoryPolicy.evaluate(saturated, filters, page("C"), 3)
        check(reset.result!!.baselineReset && reset.result!!.newIds.isEmpty() && reset.result!!.comparedSourceIds.isEmpty())
        val more = DiscoveryHistoryPolicy.evaluate(reset.history, filters, page("C", "D"), 4, reset.result)
        check(more.result!!.baselineReset && more.result!!.newIds.isEmpty() && more.result!!.comparedSourceIds.isEmpty())
    }

    val dispatcher = Executors.newSingleThreadExecutor().asCoroutineDispatcher()
    val scope = CoroutineScope(SupervisorJob() + dispatcher)
    val store = Store()
    val service = Service()
    val controller = DiscoveryController(scope, service)
    try {
        withContext(dispatcher) { controller.attachPrivateSession(store, "search"); controller.editFilters { filters }; controller.search() }
        await { !controller.state.value.loading && store.records.containsKey("search") }
        val incomplete = page("B", "C")
        service.result = incomplete.copy(nextCursor = "page-2", sources =
            listOf(incomplete.sources.single().copy(matchedCount = 3, availableCount = 3)))
        withContext(dispatcher) { controller.search() }
        await { !controller.state.value.loading && controller.state.value.newResult?.newIds == listOf("$BOARD:C") }
        check(controller.state.value.nextCursor == "page-2")
        val saved = store.records.getValue("search")
        service.result = page().copy(status = "unavailable", sources = listOf(
            page().sources.single().copy(status = "unavailable", error = "Synthetic timeout")))
        withContext(dispatcher) { controller.search() }
        await { !controller.state.value.loading }
        check(controller.state.value.newResult!!.newIds == listOf("$BOARD:C"))
        check(store.records.getValue("search") === saved)
        check(controller.state.value.nextCursor == null && controller.state.value.cursorInvalid) {
            "Stale More cursor remained available after full outage"
        }
        val beforeMore = service.calls.get()
        withContext(dispatcher) { controller.search(more = true) }
        check(service.calls.get() == beforeMore) { "Old More cursor triggered a request after outage" }
        service.result = page("B", "C")
        withContext(dispatcher) { controller.search() }
        await { !controller.state.value.loading && controller.state.value.newResult?.newIds?.isEmpty() == true }
        check(!controller.state.value.cursorInvalid && service.calls.get() == beforeMore + 1)
        println("PASS baseline, outage cursor invalidation, blocked More, fresh recovery" +
            if (resetChecks) ", whole-board reset" else "")
    } finally { scope.cancel(); dispatcher.close() }
}

private fun comparisonEvidence(skipUnready: Boolean = false) {
    val filters = DiscoveryFilters("care", "", false, listOf(BOARD))
    val page = page("A", "B")
    val baseline = DiscoveryHistoryPolicy.evaluate(DiscoverySearchHistory(), filters, page, 1)
    val repeated = DiscoveryHistoryPolicy.evaluate(baseline.history, filters, page, 2)
    val zero = repeated.result!!
    check(zero.newIds.isEmpty() && zero.comparedSourceIds == listOf(BOARD))
    check(DiscoveryHistoryPolicy.valid(zero, filters, repeated.sourceIds, page.jobs, repeated.history))
    val query = repeated.history.searches.single()
    val unready = repeated.history.copy(searches = listOf(query.copy(boards =
        listOf(query.boards.single().copy(ready = false)))))
    val missing = repeated.history.copy(searches = listOf(query.copy(boards = emptyList())))
    if (!skipUnready) check(!DiscoveryHistoryPolicy.valid(zero, filters, repeated.sourceIds, page.jobs, unready)) {
        "Unready board falsely validates a zero-new comparison"
    }
    check(!DiscoveryHistoryPolicy.valid(zero, filters, repeated.sourceIds, page.jobs, missing)) {
        "Missing board falsely validates a zero-new comparison"
    }
    val legacy = zero.copy(baselineReset = true, newIds = emptyList(), coverageLimited = false)
    check(DiscoveryHistoryPolicy.valid(legacy, filters, repeated.sourceIds, page.jobs, unready))
    check(DiscoveryHistoryPolicy.valid(legacy, filters, repeated.sourceIds, page.jobs, missing))
    println("PASS zero-new ready board accepted; unready/missing rejected; legacy resets readable")
}

fun main(args: Array<String>) = runBlocking {
    if ("--outage-only" in args) {
        scenario(false, outageNext = true)
        return@runBlocking
    }
    if ("--validation-only" in args) {
        comparisonEvidence()
        return@runBlocking
    }
    if ("--missing-only" in args) {
        comparisonEvidence(skipUnready = true)
        return@runBlocking
    }
    if ("--cursor-only" in args) {
        outageAndReset(resetChecks = false)
        return@runBlocking
    }
    scenario(true)
    scenario(false)
    scenario(false, outageNext = true)
    scenario(false, failureNext = true)
    outageAndReset()
    comparisonEvidence()
}
'''


def main() -> int:
    baseline = "--baseline" in sys.argv
    discovery = read(DISCOVERY, baseline)
    history = read(HISTORY, baseline)
    with tempfile.TemporaryDirectory(prefix="android-search-observation-") as directory:
        temp = Path(directory)
        (temp / "ActualSources.kt").write_text(extract(discovery, history))
        (temp / "JsonStub.kt").write_text(JSON_STUB)
        (temp / "Harness.kt").write_text(HARNESS)
        classes = temp / "classes"
        classes.mkdir()
        compiler = [str(JAVA), "-cp", str(LIB / "*"), "org.jetbrains.kotlin.cli.jvm.K2JVMCompiler",
            "-no-stdlib", "-no-reflect", "-jvm-target", "17", "-classpath", RUNTIME,
            "-d", str(classes), *(str(temp / name) for name in ("ActualSources.kt", "JsonStub.kt", "Harness.kt"))]
        subprocess.run(compiler, check=True)
        command = [str(JAVA), "-cp", os.pathsep.join((str(classes), RUNTIME)), "com.saleh.careerfinder.HarnessKt"]
        if "--outage-only" in sys.argv:
            command.append("--outage-only")
        if "--validation-only" in sys.argv:
            command.append("--validation-only")
        if "--missing-only" in sys.argv:
            command.append("--missing-only")
        if "--cursor-only" in sys.argv:
            command.append("--cursor-only")
        return subprocess.run(command).returncode


if __name__ == "__main__":
    raise SystemExit(main())
