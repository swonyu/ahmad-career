#!/bin/bash
set -euo pipefail
task_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$task_root"
mkdir -p BuildLogs
swiftc AhmadCareer/CareerPolicy.swift AhmadCareer/CareerFeed.swift Checks/main.swift -o BuildLogs/check-policy
BuildLogs/check-policy
if [[ "${1:-}" == "--live" ]]; then
    swiftc AhmadCareer/CareerFeed.swift Checks/LiveFeedCheck.swift -o BuildLogs/check-live
    BuildLogs/check-live
fi
swiftc AhmadCareer/CareerFeed.swift AhmadCareer/NativeCareerStore.swift Checks/NativeStoreCheck.swift -o BuildLogs/check-store
BuildLogs/check-store AhmadCareer/CareerResearch.json
