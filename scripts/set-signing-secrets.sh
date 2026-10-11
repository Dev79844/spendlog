#!/usr/bin/env bash
# Stores Spendlog's private release key as the GitHub Actions secrets the
# release workflow signs with (see "Signing" in AGENTS.md):
#
#   SPENDLOG_KEYSTORE_B64       base64 of the PKCS12 keystore
#   SPENDLOG_KEYSTORE_PASSWORD  its password (also the key's password)
#
# Usage: scripts/set-signing-secrets.sh [signing dir]
#
# The signing dir (default ~/.config/spendlog-signing) holds
# spendlog-release.p12 and keystore-password. Before setting anything, this
# checks that the keystore opens with that password and that its "spendlog"
# certificate is the EXPECTED_SIGNER_SHA256 in android-release.yml. Values go
# to `gh secret set` on stdin and are never printed.
set -euo pipefail

dir=${1:-$HOME/.config/spendlog-signing}
keystore="$dir/spendlog-release.p12"
password_file="$dir/keystore-password"
repo=Dev79844/spendlog
workflow="$(dirname "$0")/../.github/workflows/android-release.yml"

for file in "$keystore" "$password_file"; do
  if [ ! -s "$file" ]; then
    echo "Missing $file" >&2
    exit 1
  fi
done

expected=$(sed -n 's/^ *EXPECTED_SIGNER_SHA256: *\([0-9A-Fa-f:]*\) *$/\1/p' "$workflow" \
  | tr -d ':' | tr 'A-F' 'a-f')
if [ -z "$expected" ]; then
  echo "No EXPECTED_SIGNER_SHA256 in $workflow" >&2
  exit 1
fi

SPENDLOG_KEYSTORE_PASSWORD=$(head -n 1 "$password_file")
export SPENDLOG_KEYSTORE_PASSWORD
if ! cert=$(keytool -exportcert -keystore "$keystore" -alias spendlog \
  -storepass:env SPENDLOG_KEYSTORE_PASSWORD 2>/dev/null | base64 -w 0) || [ -z "$cert" ]; then
  echo "Cannot read the 'spendlog' key from $keystore with the password in $password_file" >&2
  exit 1
fi
actual=$(base64 -d <<< "$cert" | sha256sum | cut -d ' ' -f 1)
if [ "$actual" != "$expected" ]; then
  echo "$keystore holds certificate $actual, but the workflow expects $expected" >&2
  exit 1
fi

base64 -w 0 "$keystore" | gh secret set SPENDLOG_KEYSTORE_B64 --repo "$repo" --app actions
printf '%s' "$SPENDLOG_KEYSTORE_PASSWORD" | gh secret set SPENDLOG_KEYSTORE_PASSWORD --repo "$repo" --app actions
gh secret list --repo "$repo" --app actions
