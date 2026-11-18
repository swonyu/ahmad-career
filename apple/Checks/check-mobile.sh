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
  "$task_root/Checks/SyntheticPDF.swift" \
  "$task_root/Checks/MobileApplicationCheck.swift" -o "$check_dir/policy-check"
"$check_dir/policy-check"
"$compiler" "${common[@]}" "$task_root/AhmadCareer/MobileApplicationClient.swift" \
  "$task_root/Checks/SyntheticPDF.swift" \
  "$task_root/AhmadCareer/MobileApplicationState.swift" "$task_root/AhmadCareer/NativeApplicationsStore.swift" \
  "$task_root/Checks/MobileLifecycleCheck.swift" -o "$check_dir/lifecycle-check"
"$check_dir/lifecycle-check" "$task_root/../android/app/src/androidTest/assets/phone-workspace-v1.json"
# The preservation/import/export suite runs on the same source without an app target.
bash "$task_root/Checks/check-native-recovery.sh"
"$compiler" "${common[@]}" "$task_root/AhmadCareer/MobileApplicationClient.swift" \
  "$task_root/AhmadCareer/MobileApplicationState.swift" "$task_root/AhmadCareer/CareerDiscovery.swift" \
  "$task_root/Checks/DiscoveryCheck.swift" -o "$check_dir/discovery-check"
"$check_dir/discovery-check" "$task_root/Checks/Fixtures/discovery-search-v1.json"
"$compiler" "${common[@]}" "$task_root/AhmadCareer/CareerFeed.swift" \
  "$task_root/AhmadCareer/NativeCareerStore.swift" "$task_root/Checks/NativeStoreCheck.swift" -o "$check_dir/legacy-store-check"
"$check_dir/legacy-store-check" "$task_root/AhmadCareer/CareerResearch.json"
"$compiler" "${common[@]}" "$task_root/AhmadCareer/MobileApplicationClient.swift" \
  "$task_root/AhmadCareer/NativeLocalization.swift" \
  "$task_root/Checks/SavedSearchCheck.swift" -o "$check_dir/saved-search-check"
"$check_dir/saved-search-check" "$task_root/../android/app/src/androidTest/assets/native-saved-search-v1.json"

# Published-branch compatibility: restored data, sidecar tombstones and stale-file protection.
for compatibility_check in NextActionCheck NativeBackupCheck NativeMergeCompatibilityCheck; do
  "$compiler" "${common[@]}" "$task_root/AhmadCareer/CareerFeed.swift" \
    "$task_root/AhmadCareer/NativeCareerStore.swift" "$task_root/Checks/$compatibility_check.swift" -o "$check_dir/$compatibility_check"
  "$check_dir/$compatibility_check" "$task_root/Checks/ResearchFixture.json"
done
"$compiler" "${common[@]}" "$task_root/AhmadCareer/CareerFeed.swift" \
  "$task_root/Checks/NativeTransportLimitCheck.swift" -o "$check_dir/transport-check"
"$check_dir/transport-check"

# Exercise the app's actual DEBUG fixture initializer, including relaunch and
# unreadable-file preservation. Existing release-policy checks above stay intact.
"$compiler" "${common[@]}" -D DEBUG \
  "$task_root/AhmadCareer/MobileApplicationClient.swift" \
  "$task_root/AhmadCareer/MobileApplicationState.swift" "$task_root/AhmadCareer/NativeApplicationsStore.swift" \
  "$task_root/AhmadCareer/CareerFeed.swift" "$task_root/AhmadCareer/NativeCareerStore.swift" \
  "$task_root/AhmadCareer/CareerDiscovery.swift" "$task_root/AhmadCareer/CareerAppEnvironment.swift" \
  "$task_root/Checks/SyntheticPDF.swift" "$task_root/Checks/AcceptanceFixtureCheck.swift" -o "$check_dir/acceptance-fixture-check"
"$check_dir/acceptance-fixture-check"
