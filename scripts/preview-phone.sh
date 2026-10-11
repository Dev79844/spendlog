#!/usr/bin/env bash
# Try a branch on the phone in "Spendlog Preview" (com.spendlog.app.preview),
# a development build that lives next to the real app and has its own, separate
# data. Its JavaScript comes from Metro on this machine over USB (adb reverse).
#
#   scripts/preview-phone.sh install <apk>           install the preview dev build
#   scripts/preview-phone.sh start [branch | dir]    serve a branch to the phone
#
# `start` with no argument serves this checkout. With a directory it serves that
# checkout. With a branch name it serves origin/<branch> from a worktree of its
# own, ../preview-<last part of the branch name>, which it creates or updates.
#
# This script never installs, opens or changes the real app (com.spendlog.app).
# Environment: ANDROID_SERIAL (default RZGL31R7X6L), PREVIEW_PORT (default 8082).
set -euo pipefail

PACKAGE=com.spendlog.app.preview
SCHEME=spendlog-preview
SERIAL=${ANDROID_SERIAL:-RZGL31R7X6L}
PORT=${PREVIEW_PORT:-8082}
ROOT=$(cd "$(dirname "$0")/.." && pwd)

die() { echo "preview-phone: $*" >&2; exit 1; }
adb_() { adb -s "$SERIAL" "$@"; }

need_phone() {
  [ "$(adb -s "$SERIAL" get-state 2>/dev/null)" = device ] \
    || die "phone $SERIAL is not connected (plug it in over USB, allow USB debugging, check 'adb devices')"
}

install_apk() {
  local apk=$1 info
  [ -f "$apk" ] || die "no such file: $apk"
  info=$(python3 "$ROOT/scripts/apk-info.py" "$apk")
  echo "$info"
  # Refuse anything that would replace the real app and its data.
  [ "$(jq -r .package <<< "$info")" = "$PACKAGE" ] \
    || die "refusing to install: package is not $PACKAGE"
  [ "$(jq -r .devClient <<< "$info")" = true ] \
    || die "refusing to install: not an expo-dev-client build"
  need_phone
  adb_ install -r "$apk"
}

# Prints the checkout directory to serve for $1 (empty: this checkout).
checkout_for() {
  local target=${1:-} dir sha
  if [ -z "$target" ]; then
    echo "$ROOT"
  elif [ -d "$target" ]; then
    (cd "$target" && pwd)
  else
    git -C "$ROOT" fetch --quiet origin "$target" \
      || die "no branch '$target' on origin"
    # FETCH_HEAD is per worktree, so pass the commit itself.
    sha=$(git -C "$ROOT" rev-parse FETCH_HEAD)
    dir="$(dirname "$ROOT")/preview-${target##*/}"
    if [ -d "$dir" ]; then
      [ -z "$(git -C "$dir" status --porcelain --untracked-files=no)" ] \
        || die "$dir has local changes; commit or discard them first"
      git -C "$dir" checkout --quiet --detach "$sha" >&2
    else
      git -C "$ROOT" worktree add --quiet --detach "$dir" "$sha" >&2
    fi
    echo "$dir"
  fi
}

start_metro() {
  local dir url
  dir=$(checkout_for "${1:-}")
  echo "Serving $dir ($(git -C "$dir" log -1 --format='%h %s'))"

  # A branch from before this script has no preview config; without it Metro
  # would describe the real app. Copy ours in, untracked.
  if [ ! -f "$dir/app.config.ts" ]; then
    cp "$ROOT/app.config.ts" "$dir/app.config.ts"
    echo "Copied app.config.ts into $dir (untracked; delete it before committing there)"
  fi
  if [ ! -d "$dir/node_modules" ] || [ "$dir/package-lock.json" -nt "$dir/node_modules/.package-lock.json" ]; then
    (cd "$dir" && npm ci --ignore-scripts)
  fi

  need_phone
  adb_ shell pm path "$PACKAGE" > /dev/null \
    || die "$PACKAGE is not installed; run: $0 install <apk>"
  adb_ reverse "tcp:$PORT" "tcp:$PORT" > /dev/null

  url="$SCHEME://expo-development-client/?url=$(printf 'http%%3A%%2F%%2Flocalhost%%3A%s' "$PORT")"
  # Open the preview app on this server once Metro answers.
  (
    for _ in $(seq 120); do
      if curl -fs "http://127.0.0.1:$PORT/status" | grep -q running; then
        adb_ shell am start -a android.intent.action.VIEW -d "'$url'" "$PACKAGE" > /dev/null \
          && echo "Opened Spendlog Preview on the phone (or open it and pick http://localhost:$PORT)"
        exit 0
      fi
      sleep 1
    done
  ) &

  cd "$dir"
  # "localhost" resolves to ::1 first on some hosts, but the bundle URLs Metro
  # hands out (and adb reverse) use 127.0.0.1: make Metro listen on IPv4.
  export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--dns-result-order=ipv4first"
  APP_VARIANT=preview exec npx expo start --dev-client --localhost --port "$PORT"
}

case "${1:-}" in
  install) [ $# -eq 2 ] || die "usage: $0 install <apk>"; install_apk "$2" ;;
  start) [ $# -le 2 ] || die "usage: $0 start [branch | dir]"; start_metro "${2:-}" ;;
  *) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
