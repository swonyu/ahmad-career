#!/bin/bash
set -euo pipefail
ulimit -c 0
task_root="$(cd "$(dirname "$0")/.." && pwd)"
check_dir="$(mktemp -d "${TMPDIR:-/tmp}/career-mobile-check.XXXXXX")"
trap 'rm -rf "$check_dir"' EXIT
compiler="$(xcrun --sdk macosx --find swiftc)"
mac_sdk="$(xcrun --sdk macosx --show-sdk-path)"
common=(-swift-version 5 -Onone -sdk "$mac_sdk" -module-cache-path "$check_dir/module-cache")
"$compiler" "${common[@]}" "$task_root/AhmadCareer/MobileApplicationClient.swift" \
  "$task_root/Checks/MobileApplicationCheck.swift" -o "$check_dir/policy-check"
"$check_dir/policy-check"
"$compiler" "${common[@]}" "$task_root/AhmadCareer/MobileApplicationClient.swift" \
  "$task_root/AhmadCareer/MobileApplicationState.swift" "$task_root/AhmadCareer/NativeApplicationsStore.swift" \
  "$task_root/Checks/MobileLifecycleCheck.swift" -o "$check_dir/lifecycle-check"
"$check_dir/lifecycle-check"
"$compiler" "${common[@]}" "$task_root/AhmadCareer/CareerFeed.swift" \
  "$task_root/AhmadCareer/NativeCareerStore.swift" "$task_root/Checks/NativeStoreCheck.swift" -o "$check_dir/legacy-store-check"
"$check_dir/legacy-store-check" "$task_root/AhmadCareer/CareerResearch.json"
