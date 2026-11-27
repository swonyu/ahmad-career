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
# Saved receipt history must survive restart without becoming live dispatch authority.
"$compiler" "${common[@]}" "$task_root/AhmadCareer/MobileApplicationClient.swift" \
  "$task_root/AhmadCareer/MobileApplicationState.swift" "$task_root/AhmadCareer/NativeApplicationsStore.swift" \
  "$task_root/Checks/OfflineApplicationHistoryCheck.swift" -o "$check_dir/offline-history-check"
"$check_dir/offline-history-check" "$check_dir/offline-history-fixtures" "$check_dir/offline-history-report.json"
# Preserve oversized historical records and export their complete recovery archive.
"$compiler" "${common[@]}" "$task_root/AhmadCareer/MobileApplicationClient.swift" \
  "$task_root/AhmadCareer/MobileApplicationState.swift" "$task_root/AhmadCareer/NativeApplicationsStore.swift" \
  "$task_root/Checks/HistoricalURLCheck.swift" -o "$check_dir/historical-url-check"
"$check_dir/historical-url-check" "$check_dir/historical-url-fixtures"
python3 - "$task_root/Checks/Fixtures" "$check_dir/historical-recovery-fixtures" <<'PY_FIXTURES'
import gzip, hashlib, json, pathlib, sys
source = pathlib.Path(sys.argv[1]); destination = pathlib.Path(sys.argv[2])
destination.mkdir(mode=0o700)
for fixture in json.loads((source / "manifest.json").read_text()):
    name = fixture["file"]
    assert pathlib.Path(name).name == name and name.endswith(".json.gz"), "Unexpected recovery fixture path"
    archive = source / name
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == fixture["gzipSHA256"], "Recovery archive changed"
    assert 0 < fixture["bytes"] <= 64 * 1024 * 1024, "Recovery fixture size is outside the admitted range"
    with gzip.open(archive, "rb") as compressed:
        raw = compressed.read(fixture["bytes"] + 1)
    assert len(raw) == fixture["bytes"] and hashlib.sha256(raw).hexdigest() == fixture["sha256"], "Recovery fixture changed"
    target = destination / name.removesuffix(".gz")
    with target.open("xb") as output: output.write(raw)
    target.chmod(0o600)
PY_FIXTURES
"$compiler" "${common[@]}" "$task_root/AhmadCareer/MobileApplicationClient.swift" \
  "$task_root/AhmadCareer/MobileApplicationState.swift" "$task_root/AhmadCareer/NativeApplicationsStore.swift" \
  "$task_root/Checks/HistoricalRecoveryCheck.swift" -o "$check_dir/historical-recovery-check"
"$check_dir/historical-recovery-check" "$check_dir/historical-recovery-data" "$check_dir/historical-recovery-fixtures"
# The preservation/import/export suite runs on the same source without an app target.
bash "$task_root/Checks/check-native-recovery.sh"
"$compiler" "${common[@]}" "$task_root/AhmadCareer/MobileApplicationClient.swift" \
  "$task_root/AhmadCareer/MobileApplicationState.swift" "$task_root/AhmadCareer/CareerDiscovery.swift" \
  "$task_root/Checks/DiscoveryCheck.swift" -o "$check_dir/discovery-check"
"$check_dir/discovery-check" "$task_root/Checks/Fixtures/discovery-search-v1.json"
# Execute the view's actual retry clock and all three retry modifiers on the host.
python3 "$task_root/Checks/check-discovery-cooldown.py"
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
