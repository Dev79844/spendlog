#!/usr/bin/env bash
# Dry run of the release-notes logic with a stubbed gh: no network, nothing is
# published. Runs release-pr-list.sh, and the "Write release notes" step taken
# from the workflow file itself, against canned GitHub responses (the
# generate-notes bodies are the real ones for this repo).
#
# Usage: .github/scripts/test-release-pr-list.sh   (needs bash, git, jq, python3 + PyYAML)
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
failures=0

# --- gh stub -------------------------------------------------------------------
# `gh release list ... --jq EXPR` applies EXPR to $STUB_RELEASES (JSON).
# `gh api --method POST .../generate-notes -f tag_name=T [-f previous_tag_name=P]`
# logs its fields and answers from $STUB_NOTES/<T>..<P or none>.json, or fails
# when $STUB_FAIL is set.
mkdir -p "$work/bin" "$work/notes"
cat > "$work/bin/gh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
jq_expr=""; fields=(); args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  case "${args[i]}" in
    --jq) jq_expr=${args[i + 1]}; i=$((i + 1)) ;;
    -f) fields+=("${args[i + 1]}"); i=$((i + 1)) ;;
  esac
done
if [ "$1 $2" = "release list" ]; then
  jq -r "$jq_expr" <<< "$STUB_RELEASES"
elif [ "$1" = api ] && [[ "$*" == *releases/generate-notes* ]]; then
  printf '%s\n' "${fields[@]}" > "$STUB_LOG"
  [ -z "${STUB_FAIL:-}" ] || { echo "HTTP 502: Bad Gateway" >&2; exit 1; }
  tag=""; prev=none
  for f in "${fields[@]}"; do
    case "$f" in tag_name=*) tag=${f#*=} ;; previous_tag_name=*) prev=${f#*=} ;; esac
  done
  jq -r "$jq_expr" "$STUB_NOTES/$tag..$prev.json"
else
  echo "gh stub: unexpected call: gh $*" >&2; exit 1
fi
STUB
chmod +x "$work/bin/gh"
export PATH="$work/bin:$PATH" GITHUB_REPOSITORY=Dev79844/spendlog STUB_NOTES="$work/notes" STUB_LOG="$work/gh-api.log"

notes() { jq -n --arg body "$2" '{name: "x", body: $body}' > "$work/notes/$1.json"; }
url=https://github.com/Dev79844/spendlog
notes 'v1.1.0..v1.0.0' "## What's Changed
* ci: fix signer check rejecting v2-only signed APKs by @Dev79844 in $url/pull/6
* CSV export and import of expenses and categories by @Dev79844 in $url/pull/5


**Full Changelog**: $url/compare/v1.0.0...v1.1.0"
notes 'v1.0.0..none' "## What's Changed
* docs: add AGENTS.md for coding agents by @Dev79844 in $url/pull/1
* ci: build and publish a release APK when a vX.Y.Z tag is pushed by @Dev79844 in $url/pull/4

## New Contributors
* @someone made their first contribution in $url/pull/4

**Full Changelog**: $url/commits/v1.0.0"
notes 'v1.2.0..v1.1.0' "## What's Changed
* Store dates as epoch ms with a versioned migration by @Dev79844 in $url/pull/3
* chore: upgrade to Expo SDK 57 by @Dev79844 in $url/pull/2


**Full Changelog**: $url/compare/v1.1.0...v1.2.0"
notes 'v1.10.0..v1.9.0' "**Full Changelog**: $url/compare/v1.9.0...v1.10.0"

releases() { # tag[:draft] ...
  local json='[]' t
  for t in "$@"; do
    json=$(jq -c --arg t "${t%:draft}" --argjson d "$([[ $t == *:draft ]] && echo true || echo false)" \
      '. + [{tagName: $t, isDraft: $d}]' <<< "$json")
  done
  export STUB_RELEASES=$json
}

check() { # name, expected, actual
  if [ "$2" == "$3" ]; then
    echo "ok   $1"
  else
    echo "FAIL $1"; { diff <(echo "$2") <(echo "$3") || true; } | sed 's/^/     /'; failures=$((failures + 1))
  fi
}

# Never aborts the harness: a failing run prints its exit status instead, so
# the check that follows reports it. Clears the gh call log first.
run_list() {
  : > "$STUB_LOG"
  local status=0
  TAG=$1 bash "$here/release-pr-list.sh" 2> "$work/stderr" || status=$?
  [ "$status" -eq 0 ] || echo "<exit $status: $(tail -n 1 "$work/stderr")>"
}

# --- release-pr-list.sh --------------------------------------------------------
releases v1.0.0
check 'v1.1.0 vs v1.0.0 lists #6 and #5' "## Pull requests

- ci: fix signer check rejecting v2-only signed APKs (#6) by @Dev79844
- CSV export and import of expenses and categories (#5) by @Dev79844" "$(run_list v1.1.0)"
check '  ...asks GitHub for v1.0.0..v1.1.0' $'tag_name=v1.1.0\nprevious_tag_name=v1.0.0' "$(cat "$STUB_LOG")"

releases v1.1.0 v1.0.0
run_list v1.1.0 > /dev/null
check 'rebuild of a published tag ignores the tag itself' $'tag_name=v1.1.0\nprevious_tag_name=v1.0.0' "$(cat "$STUB_LOG")"

releases v1.10.0:draft v1.1.0 nightly v0.9.0 v1.0.0
check 'v1.2.0 picks v1.1.0 (drafts and non-version tags ignored)' "## Pull requests

- Store dates as epoch ms with a versioned migration (#3) by @Dev79844
- chore: upgrade to Expo SDK 57 (#2) by @Dev79844" "$(run_list v1.2.0)"

releases v1.2.0 v1.9.0 v1.1.0
run_list v1.10.0 > /dev/null
check 'v1.10.0 picks v1.9.0 by versionCode, not text order' $'tag_name=v1.10.0\nprevious_tag_name=v1.9.0' "$(cat "$STUB_LOG")"
check '  ...and says so when nothing was merged' $'## Pull requests\n\nNo pull requests merged since v1.9.0.' "$(run_list v1.10.0)"

releases
check 'first release lists every PR up to the tag (no New Contributors)' "## Pull requests

- docs: add AGENTS.md for coding agents (#1) by @Dev79844
- ci: build and publish a release APK when a vX.Y.Z tag is pushed (#4) by @Dev79844" "$(run_list v1.0.0)"
check '  ...without a previous_tag_name' 'tag_name=v1.0.0' "$(cat "$STUB_LOG")"

releases v1.0.0
check 'API failure exits non-zero' '<exit 1: HTTP 502: Bad Gateway>' "$(STUB_FAIL=1 run_list v1.1.0)"

# --- the workflow's "Write release notes" step -----------------------------------
# Runs the step's script exactly as written in android-release.yml, in a scratch
# git repo standing in for the checkout.
step=$(python3 - "$root/.github/workflows/android-release.yml" <<'PY'
import sys, yaml
steps = yaml.safe_load(open(sys.argv[1]))['jobs']['build']['steps']
print(next(s for s in steps if s.get('name') == 'Write release notes')['run'])
PY
)
repo="$work/checkout"
git init -q "$repo"
git -C "$repo" -c user.name=t -c user.email=t@t commit -q --allow-empty -m 'old tag, no script'
old_sha=$(git -C "$repo" rev-parse HEAD)
mkdir -p "$repo/.github/scripts"
cp "$here/release-pr-list.sh" "$repo/.github/scripts/"
git -C "$repo" add . && git -C "$repo" -c user.name=t -c user.email=t@t commit -q -m 'workflow commit'
new_sha=$(git -C "$repo" rev-parse HEAD)

run_step() { # GITHUB_SHA, extra env...
  rm -f "$repo/notes.md" "$repo/pr-list.md"
  (cd "$repo" && env GITHUB_SHA="$1" RUNNER_TEMP="$work" TAG=v1.1.0 EXPECTED_PACKAGE=com.spendlog.app \
    EXPECTED_SIGNER_SHA256=FA:C6 VERSION_CODE=10100 VERSION_NAME=1.1.0 COMMIT=d835082 \
    APK=spendlog-1.1.0.apk SIZE_MB=30 "${@:2}" bash -eo pipefail -c "$step" > "$work/step.out" 2>&1)
  cat "$repo/notes.md"
}

releases v1.0.0
out=$(run_step "$new_sha")
check 'step: notes start with the PR list' "## Pull requests

- ci: fix signer check rejecting v2-only signed APKs (#6) by @Dev79844
- CSV export and import of expenses and categories (#5) by @Dev79844

Release APK for \`com.spendlog.app\`, arm64-v8a only." "$(head -n 7 <<< "$out")"
check '  ...followed by the build info and install commands' 'adb install -r spendlog-1.1.0.apk' "$(grep -m1 'adb install' <<< "$out")"

out=$(run_step "$new_sha" STUB_FAIL=1)
check 'step: API failure falls back to build info only' 'Release APK for `com.spendlog.app`, arm64-v8a only.' "$(head -n 1 <<< "$out")"
check '  ...with a warning' 1 "$(grep -c '^::warning::Could not list the merged pull requests' "$work/step.out")"

out=$(run_step "$old_sha")
check 'step: workflow commit without the script falls back too' 'Release APK for `com.spendlog.app`, arm64-v8a only.' "$(head -n 1 <<< "$out")"

echo
if [ "$failures" -gt 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "all checks passed"
