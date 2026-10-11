#!/usr/bin/env bash
# Run the app on the phone in Expo Go with hot reload: Metro serves this
# machine's code over USB (adb reverse), and saved edits show up on the phone.
#
#   scripts/dev-phone.sh [branch | dir]
#
# With no argument it serves this checkout. With a directory it serves that
# checkout. With a branch name it serves origin/<branch> from a worktree of its
# own, ../dev-<last part of the branch name>, which it creates or updates.
#
# Needs Expo Go (Play Store, SDK 57) on the phone. Expo Go keeps its own data,
# separate from the installed Spendlog app, which this script never touches.
# Environment: ANDROID_SERIAL (default RZGL31R7X6L), DEV_PORT (default 8081).
set -euo pipefail

EXPO_GO=host.exp.exponent
SERIAL=${ANDROID_SERIAL:-RZGL31R7X6L}
PORT=${DEV_PORT:-8081}
ROOT=$(cd "$(dirname "$0")/.." && pwd)

die() { echo "dev-phone: $*" >&2; exit 1; }
adb_() { adb -s "$SERIAL" "$@"; }

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
    dir="$(dirname "$ROOT")/dev-${target##*/}"
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

[ $# -le 1 ] || die "usage: $0 [branch | dir]"
dir=$(checkout_for "${1:-}")
echo "Serving $dir ($(git -C "$dir" log -1 --format='%h %s'))"

if [ ! -d "$dir/node_modules" ] || [ "$dir/package-lock.json" -nt "$dir/node_modules/.package-lock.json" ]; then
  (cd "$dir" && npm ci --ignore-scripts)
fi

[ "$(adb -s "$SERIAL" get-state 2>/dev/null)" = device ] \
  || die "phone $SERIAL is not connected (plug it in over USB, allow USB debugging, check 'adb devices')"
adb_ shell pm path "$EXPO_GO" > /dev/null \
  || die "Expo Go is not installed on the phone; install it from the Play Store"
adb_ reverse "tcp:$PORT" "tcp:$PORT" > /dev/null

url="exp://127.0.0.1:$PORT"
# Open the project in Expo Go once Metro answers.
(
  for _ in $(seq 120); do
    if curl -fs "http://127.0.0.1:$PORT/status" | grep -q running; then
      adb_ shell am start -a android.intent.action.VIEW -d "'$url'" "$EXPO_GO" > /dev/null \
        && echo "Opened $url in Expo Go (or enter that URL in Expo Go)"
      exit 0
    fi
    sleep 1
  done
) &

cd "$dir"
# "localhost" resolves to ::1 first on some hosts, but the bundle URLs Metro
# hands out (and adb reverse) use 127.0.0.1: make Metro listen on IPv4.
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--dns-result-order=ipv4first"
exec npx expo start --go --localhost --port "$PORT"
