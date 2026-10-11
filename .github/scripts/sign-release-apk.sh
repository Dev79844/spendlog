#!/usr/bin/env bash
# Re-signs a release APK with APK Signature Scheme v3 key rotation, from the
# public template debug key to Spendlog's private release key (see "Signing"
# in AGENTS.md):
#
# - v2 and v3.0 (Android 7-12): the template key, which every install up to
#   v1.3.0 is signed with.
# - v3.1 (Android 13+): the private key, with android-signing/lineage.bin,
#   which proves the template key handed over to it, so Android installs the
#   APK over an app signed with the template key.
#
# Usage: sign-release-apk.sh <in.apk> <out.apk>
#
# Environment (all required, nothing is defaulted, so a missing secret fails):
#   APKSIGNER                    apksigner from the Android build-tools
#   LINEAGE                      android-signing/lineage.bin
#   TEMPLATE_KEYSTORE            the template debug.keystore (alias androiddebugkey,
#                                password android; public)
#   TEMPLATE_SIGNER_SHA256       its certificate SHA-256 (AA:BB:... or aabb...)
#   SPENDLOG_KEYSTORE            the private PKCS12 keystore (alias SPENDLOG_KEY_ALIAS)
#   SPENDLOG_KEYSTORE_PASSWORD   its password (also the key's password)
#   SPENDLOG_KEY_ALIAS           the key's alias
#   EXPECTED_SIGNER_SHA256       the private key's certificate SHA-256
#
# Never prints the password; apksigner reads it from the environment.
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "usage: $0 <in.apk> <out.apk>" >&2
  exit 2
fi
in=$1
out=$2

missing=()
for var in APKSIGNER LINEAGE TEMPLATE_KEYSTORE TEMPLATE_SIGNER_SHA256 SPENDLOG_KEYSTORE \
  SPENDLOG_KEYSTORE_PASSWORD SPENDLOG_KEY_ALIAS EXPECTED_SIGNER_SHA256; do
  [ -n "${!var:-}" ] || missing+=("$var")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "::error::Signing needs ${missing[*]} (are the SPENDLOG_KEYSTORE_* secrets set?)" >&2
  exit 1
fi
for file in "$in" "$LINEAGE" "$TEMPLATE_KEYSTORE" "$SPENDLOG_KEYSTORE"; do
  if [ ! -s "$file" ]; then
    echo "::error::$file is missing or empty" >&2
    exit 1
  fi
done

normalize() { tr -d ':' <<< "$1" | tr 'A-F' 'a-f'; }

# SHA-256 of the certificate under an alias, lowercase hex without colons;
# "unreadable" if keytool can't read it (wrong alias or password).
cert_sha256() {
  local cert
  if cert=$(keytool -exportcert -keystore "$1" -alias "$2" "${@:3}" 2>/dev/null | base64 -w 0) \
    && [ -n "$cert" ]; then
    base64 -d <<< "$cert" | sha256sum | cut -d ' ' -f 1
  else
    echo unreadable
  fi
}

# Each keystore must hold exactly the key the lineage and the verify step
# expect; apksigner would also refuse signers that are not in the lineage, but
# this names the wrong one.
template=$(cert_sha256 "$TEMPLATE_KEYSTORE" androiddebugkey -storepass android)
if [ "$template" != "$(normalize "$TEMPLATE_SIGNER_SHA256")" ]; then
  echo "::error::$TEMPLATE_KEYSTORE is not the template debug key (certificate SHA-256 '$template')" >&2
  exit 1
fi
private=$(cert_sha256 "$SPENDLOG_KEYSTORE" "$SPENDLOG_KEY_ALIAS" -storepass:env SPENDLOG_KEYSTORE_PASSWORD)
if [ "$private" != "$(normalize "$EXPECTED_SIGNER_SHA256")" ]; then
  echo "::error::The private keystore's '$SPENDLOG_KEY_ALIAS' certificate is '$private', expected $EXPECTED_SIGNER_SHA256 (wrong keystore, alias or password?)" >&2
  exit 1
fi

# Signers are listed oldest first. --rotation-min-sdk-version 33 (also the
# default) puts the private key in a v3.1 block, which Android 13+ reads and
# older versions skip; they use the v3.0 block, signed with the template key.
# Same schemes as Gradle with minSdk 24: no v1 (JAR signing, only read below
# Android 7), and no v4 (.idsig file, only used by incremental adb installs).
"$APKSIGNER" sign \
  --in "$in" --out "$out" \
  --lineage "$LINEAGE" \
  --rotation-min-sdk-version 33 \
  --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true \
  --v4-signing-enabled false \
  --ks "$TEMPLATE_KEYSTORE" --ks-key-alias androiddebugkey --ks-pass pass:android \
  --next-signer \
  --ks "$SPENDLOG_KEYSTORE" --ks-key-alias "$SPENDLOG_KEY_ALIAS" \
  --ks-pass env:SPENDLOG_KEYSTORE_PASSWORD

echo "Signed $out: v3.1 (Android 13+) $EXPECTED_SIGNER_SHA256, rotated from $TEMPLATE_SIGNER_SHA256"
