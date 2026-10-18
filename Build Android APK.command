#!/bin/bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"
finish() {
  status=$?
  if [ "$status" -ne 0 ]; then
    printf '\nBuild failed. Keep this error output and share it for troubleshooting.\n'
  fi
  if [ -t 0 ]; then
    printf '\nPress Return to close this window.'
    read -r _ || true
  fi
  exit "$status"
}
trap finish EXIT
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
export PATH="$JAVA_HOME/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
printf 'Building Kalvimurasu with Java 21…\n'
if [ ! -d node_modules/@capacitor/cli ]; then
  npm ci
fi
npm run build:android
mkdir -p dist
cp android/app/build/outputs/apk/debug/app-debug.apk dist/Kalvimurasu-NMMS-debug.apk
printf '\nAPK ready:\n%s/dist/Kalvimurasu-NMMS-debug.apk\n' "$PROJECT_DIR"
printf '\nTransfer this APK to your Android phone to install the test build.\n'
