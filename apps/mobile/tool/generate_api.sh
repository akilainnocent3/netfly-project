#!/bin/sh
# Regenerates the Dart API client from packages/api-client/openapi.json (run by `pnpm api:generate`).
# Skips quietly where Flutter isn't installed (web-only machines and CI jobs).
set -e
cd "$(dirname "$0")/.."
if ! command -v dart >/dev/null 2>&1; then
  echo "apps/mobile: dart not found, skipping the Dart client (install Flutter to regenerate it)."
  exit 0
fi
dart run tool/prepare_openapi.dart
rm -rf lib/api/generated
dart run swagger_parser
dart run build_runner build --delete-conflicting-outputs
dart format -l 120 lib/api/generated >/dev/null
