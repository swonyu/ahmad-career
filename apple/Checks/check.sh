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
BuildLogs/check-store Checks/ResearchFixture.json

swiftc AhmadCareer/CareerFeed.swift Checks/PublicProviderCheck.swift -o BuildLogs/check-public
BuildLogs/check-public ../website/fixtures/public-boards.json
swiftc AhmadCareer/CareerFeed.swift AhmadCareer/NativeCareerStore.swift Checks/EmployerMetadataCheck.swift -o BuildLogs/check-metadata
BuildLogs/check-metadata ../website/fixtures/public-boards.json Checks/ResearchFixture.json
swiftc AhmadCareer/CareerFeed.swift AhmadCareer/NativeCareerStore.swift Checks/PublicRetentionCheck.swift -o BuildLogs/check-retention
BuildLogs/check-retention Checks/ResearchFixture.json ../website/fixtures/public-boards.json
swiftc AhmadCareer/CareerFeed.swift AhmadCareer/NativeCareerStore.swift Checks/NativeUpgradeCheck.swift -o BuildLogs/check-upgrade
BuildLogs/check-upgrade Checks/ResearchFixture.json
swiftc -DCAREER_PREVIEW AhmadCareer/CareerFeed.swift AhmadCareer/NativeCareerStore.swift Checks/NativeUpgradeCheck.swift -o BuildLogs/check-upgrade-preview
BuildLogs/check-upgrade-preview Checks/ResearchFixture.json
swiftc AhmadCareer/CareerFeed.swift AhmadCareer/NativeCareerStore.swift Checks/SearchChangesCheck.swift -o BuildLogs/check-search-changes
BuildLogs/check-search-changes Checks/ResearchFixture.json
if [[ "${1:-}" == "--web" ]]; then
    (cd ../website && node public-provider-check.mjs ../apple/BuildLogs/native-ui-fixture.json)
    swiftc AhmadCareer/CareerPolicy.swift AhmadCareer/CareerFeed.swift AhmadCareer/CareerWebView.swift Checks/WebRuntimeCheck.swift -o BuildLogs/check-web
    BuildLogs/check-web AhmadCareer/Web BuildLogs/native-ui-fixture.json
fi
swiftc AhmadCareer/CareerFeed.swift AhmadCareer/NativeCareerStore.swift Checks/NextActionCheck.swift -o BuildLogs/check-next-action
BuildLogs/check-next-action Checks/ResearchFixture.json

swiftc AhmadCareer/CareerFeed.swift Checks/TransportCheck.swift -o BuildLogs/check-transport
BuildLogs/check-transport

swiftc AhmadCareer/CareerFeed.swift AhmadCareer/NativeCareerStore.swift Checks/NativeBackupCheck.swift -o BuildLogs/check-backup
BuildLogs/check-backup Checks/ResearchFixture.json BuildLogs/native-backup-export.json ../website/fixtures/web-backup.json
