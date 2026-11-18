#!/bin/bash
# Focused macOS host regression suite; no app target, signing or device build.
set -euo pipefail
ulimit -c 0
task_root="$(cd "$(dirname "$0")/.." && pwd)"
check_dir="$(mktemp -d "${TMPDIR:-/tmp}/career-native-recovery-check.XXXXXX")"
trap 'rm -rf "$check_dir"' EXIT
compiler="$(xcrun --sdk macosx --find swiftc)"
mac_sdk="$(xcrun --sdk macosx --show-sdk-path)"
"$compiler" -swift-version 5 -Onone -sdk "$mac_sdk" -module-cache-path "$check_dir/module-cache" \
  "$task_root/AhmadCareer/MobileApplicationClient.swift" \
  "$task_root/AhmadCareer/MobileApplicationState.swift" \
  "$task_root/AhmadCareer/NativeApplicationsStore.swift" \
  "$task_root/Checks/NativeRecoveryCheck.swift" -o "$check_dir/native-recovery-check"
"$check_dir/native-recovery-check"
