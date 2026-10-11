#!/usr/bin/env bash
# Fails unless an APK is signed the way sign-release-apk.sh signs it:
#
# - the v3.1 block (Android 13+) is signed with the private release key,
# - every other signature (v3.0, v2, v1 if any) with the template debug key,
# - the signing lineage in the APK is exactly template key -> private key.
#
# Any other signer, a missing v3.1 block, or a lineage with other keys fails.
#
# Usage: verify-apk-signers.sh <apk>
# Environment: APKSIGNER, EXPECTED_SIGNER_SHA256 (private key),
# TEMPLATE_SIGNER_SHA256 (template debug key), as AA:BB:... or aabb...
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <apk>" >&2
  exit 2
fi
apk=$1
: "${APKSIGNER:?}" "${EXPECTED_SIGNER_SHA256:?}" "${TEMPLATE_SIGNER_SHA256:?}"

normalize() { tr -d ':' <<< "$1" | tr 'A-F' 'a-f'; }
private=$(normalize "$EXPECTED_SIGNER_SHA256")
template=$(normalize "$TEMPLATE_SIGNER_SHA256")
fail() {
  echo "::error::$*" >&2
  exit 1
}

# All schemes, for every Android version the APK supports (its minSdk up).
certs=$("$APKSIGNER" verify -v --print-certs "$apk" | grep -v '^WARNING:') \
  || fail "apksigner does not verify $apk"
echo "$certs"
for scheme in v2 v3 v3.1; do
  grep -q "^Verified using $scheme scheme .*: true$" <<< "$certs" \
    || fail "$apk is not signed with the $scheme scheme"
done

# Signer lines look like "V3.1 Signer: (minSdkVersion=33, ...) certificate
# SHA-256 digest: <hex>", "V2 Signer: certificate SHA-256 digest: <hex>" or,
# for v1, "Signer #1 certificate SHA-256 digest: <hex>". The v2 signer only
# shows when v3 does not apply, so also list the signers up to Android 8.1.
legacy=$("$APKSIGNER" verify --print-certs --max-sdk-version 27 "$apk" | grep -v '^WARNING:') \
  || fail "apksigner does not verify $apk for Android 8.1 and older"
v31=0
while read -r label digest; do
  [ -n "$label" ] || continue
  digest=$(tr 'A-F' 'a-f' <<< "$digest")
  if [ "$label" = V3.1 ]; then
    v31=$((v31 + 1))
    [ "$digest" = "$private" ] || fail "v3.1 signer is $digest, expected the private key $private"
  else
    [ "$digest" = "$template" ] || fail "$label signer is $digest, expected the template key $template"
  fi
done < <(printf '%s\n%s\n' "$certs" "$legacy" \
  | sed -n 's/^\(V[0-9.]*\|\)[ ]*Signer.* certificate SHA-256 digest: *\([0-9a-fA-F]*\)$/\1 \2/p' \
  | sed 's/^ /v1 /')
[ "$v31" -gt 0 ] || fail "$apk has no v3.1 signer"

# The proof of rotation: oldest first, template key then private key, nothing else.
lineage=$("$APKSIGNER" lineage --in "$apk" --print-certs \
  | sed -n 's/^Signer #[0-9]* in lineage certificate SHA-256 digest: *\([0-9a-fA-F]*\)$/\1/p' \
  | tr 'A-F' 'a-f' | paste -sd ' ') || fail "Could not read the signing lineage of $apk"
[ "$lineage" = "$template $private" ] \
  || fail "Signing lineage is [$lineage], expected [$template $private]"

echo "Signers OK: v3.1 $private (rotated from $template), v3.0/v2 $template"
