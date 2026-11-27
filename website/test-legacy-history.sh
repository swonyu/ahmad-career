#!/usr/bin/env bash
set -euo pipefail

# The original web checks also read their matching Apple bundle and project.
website_dir="$(cd "$(dirname "$0")" && pwd)"
snapshot="$(mktemp -d "${TMPDIR:-/tmp}/career-public-1.3.XXXXXX")"
trap 'rm -rf -- "$snapshot"' EXIT

git -C "$website_dir/.." archive d12fb82566ce8d3ebb4eded77506f4f01e303450 -- website apple | tar -x -C "$snapshot"
npm --prefix "$snapshot/website" test
