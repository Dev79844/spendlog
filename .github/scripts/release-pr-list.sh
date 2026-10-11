#!/usr/bin/env bash
# Prints the pull-request section of the release notes for $TAG: every PR
# merged between the previous published release and $TAG, one per line as
# `- <title> (#<number>) by @<author>`, using GitHub's release-notes generator.
#
# The previous release is the published (non-draft) release with the highest
# versionCode below $TAG's, ignoring $TAG itself. With none, GitHub lists every
# merged PR up to $TAG.
#
# Env: TAG (vMAJOR.MINOR.PATCH), GITHUB_REPOSITORY (owner/repo), and gh auth.
# Exits non-zero on any failure; the workflow then publishes without the list.
# Local dry run with a stubbed gh: .github/scripts/test-release-pr-list.sh
set -euo pipefail

version_code() {
  [[ "$1" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]?)\.(0|[1-9][0-9]?)$ ]] || return 0
  echo $(( BASH_REMATCH[1] * 10000 + BASH_REMATCH[2] * 100 + BASH_REMATCH[3] ))
}

code=$(version_code "$TAG")
if [ -z "$code" ]; then
  echo "$TAG is not vMAJOR.MINOR.PATCH" >&2
  exit 1
fi

published=$(gh release list --repo "$GITHUB_REPOSITORY" --limit 1000 \
  --json tagName,isDraft --jq '.[] | select(.isDraft | not) | .tagName')

previous=""
previous_code=-1
while read -r other; do
  if [ -z "$other" ] || [ "$other" = "$TAG" ]; then continue; fi
  other_code=$(version_code "$other")
  if [ -n "$other_code" ] && [ "$other_code" -lt "$code" ] && [ "$other_code" -gt "$previous_code" ]; then
    previous=$other
    previous_code=$other_code
  fi
done <<< "$published"

args=(-f "tag_name=$TAG")
if [ -n "$previous" ]; then
  args+=(-f "previous_tag_name=$previous")
  echo "Listing PRs merged after $previous up to $TAG" >&2
else
  echo "No earlier published release: listing every PR merged up to $TAG" >&2
fi

body=$(gh api --method POST "repos/$GITHUB_REPOSITORY/releases/generate-notes" "${args[@]}" --jq .body)

# The generator writes `* <title> by @<author> in https://github.com/<repo>/pull/<n>`;
# other lines (headings, New Contributors, Full Changelog) are dropped.
prs=$(sed -nE 's|^\* (.+) by @([^ ]+) in https://github\.com/[^ ]+/pull/([0-9]+)$|- \1 (#\3) by @\2|p' <<< "$body")

echo "## Pull requests"
echo
if [ -n "$prs" ]; then
  echo "$prs"
elif [ -n "$previous" ]; then
  echo "No pull requests merged since $previous."
else
  echo "No pull requests merged."
fi
