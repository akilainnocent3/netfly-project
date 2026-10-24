#!/bin/sh
# Boots an Android emulator, runs integration_test/app_test.dart against the local stack
# (http://localhost:8000 through `adb reverse`, as are the local S3 media URLs on :5005) in
# profile mode, and shuts the emulator down. Screenshots: screenshots/android/; frame timings:
# build/integration_response_data.json.
#
#   ANDROID_HOME=… AVD=pixel7 sh tool/run_integration.sh
set -eu
cd "$(dirname "$0")/.."
AVD=${AVD:-pixel7}
ADB="$ANDROID_HOME/platform-tools/adb"
API=${NETFLY_API_URL:-http://localhost:8000}
USER_NAME="it_$(date +%s)"
PASSWORD="stream-all-night-42"

curl -sf -X POST "$API/api/v1/auth/mobile/signup" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER_NAME\",\"full_name\":\"Integration Test\",\"password\":\"$PASSWORD\"}" >/dev/null

DEFINES="--dart-define=NETFLY_API_URL=$API --dart-define=E2E_USERNAME=$USER_NAME --dart-define=E2E_PASSWORD=$PASSWORD"
TITLE="E2E_TITLE=${E2E_TITLE:-Neon Tide}"

# Build before booting the emulator: Gradle and the emulator together don't fit in 16 GB.
# shellcheck disable=SC2086
flutter build apk --profile $DEFINES --dart-define="$TITLE" --target integration_test/app_test.dart
# Free the build daemons' memory for the emulator.
(cd android && ./gradlew --stop >/dev/null 2>&1) || true
pkill -f KotlinCompileDaemon >/dev/null 2>&1 || true

"$ADB" start-server
"$ANDROID_HOME/emulator/emulator" -avd "$AVD" -no-window -no-audio -no-boot-anim -no-snapshot \
  -gpu swiftshader_indirect -memory 3072 >/dev/null 2>&1 &
EMULATOR=$!
trap '"$ADB" emu kill >/dev/null 2>&1 || kill $EMULATOR 2>/dev/null || true' EXIT
"$ADB" wait-for-device
until [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 2; done
# A freshly booted image applies its theme overlays in the first minute, which restarts running
# activities (and with them the app under test): let it settle first.
sleep 60
"$ADB" reverse tcp:8000 tcp:8000
"$ADB" reverse tcp:5005 tcp:5005
"$ADB" uninstall app.netfly.netfly >/dev/null 2>&1 || true  # a clean keystore: start signed out

# shellcheck disable=SC2086
flutter drive --profile --no-dds $DEFINES --dart-define="$TITLE" \
  --use-application-binary build/app/outputs/flutter-apk/app-profile.apk \
  --driver test_driver/integration_test.dart --target integration_test/app_test.dart
