#!/usr/bin/env bash
set -euo pipefail
task_android_root="$(cd "$(dirname "$0")/.." && pwd)"
task_compile_dir="$(mktemp -d)"
trap 'rm -rf "$task_compile_dir"' EXIT
if command -v javac >/dev/null 2>&1; then
  task_compiler=(javac)
  task_language=(--release 17)
else
  task_compiler=(java --module jdk.compiler/com.sun.tools.javac.Main)
  task_language=(--source 17 --target 17)
fi
"${task_compiler[@]}" "${task_language[@]}" -d "$task_compile_dir" \
  "$task_android_root/app/src/main/java/com/saleh/careerfinder/BoundaryPolicy.java" \
  "$task_android_root/app/src/main/java/com/saleh/careerfinder/ProfileContract.java" \
  "$task_android_root/checks/BoundaryPolicyCheck.java" \
  "$task_android_root/checks/HistoricalURLBoundaryCheck.java" \
  "$task_android_root/checks/ApplicationResponseBoundaryCheck.java"
java -cp "$task_compile_dir" com.saleh.careerfinder.BoundaryPolicyCheck
java -cp "$task_compile_dir" com.saleh.careerfinder.HistoricalURLBoundaryCheck
# The response check executes the Java reader and separately checks Kotlin source wiring.
java -cp "$task_compile_dir" ApplicationResponseBoundaryCheck \
  "$task_android_root/checks/fixtures/large-workspace.json.gz" \
  "$task_android_root/app/src/main/java/com/saleh/careerfinder/CareerApi.kt" \
  "$task_android_root/app/src/main/java/com/saleh/careerfinder/Discovery.kt"
