#!/usr/bin/env bash
# Acquire + digest-verify the operator-supplied Windows 11 ISO, or record the image-unavailable
# blocker (Spike W2).
#
# No secret and no hardcoded dynamic URL lives here (see README.md "Image + license basis"). The ISO
# is passed at dispatch via ISO_URL + ISO_SHA256. With no ISO supplied (the default, and every
# pull_request run) this writes a precise image-unavailable blocker receipt into the drop and fails —
# the lane is NEVER green without a real VM run (desktop-spike testing rule 6).
set -euo pipefail

DROP="${DROP:?DROP is required}"
mkdir -p "$DROP/WIN11"

emit_blocker() {
  local reason="$1"
  cat > "$DROP/WIN11/s0.json" <<JSON
{
  "spike": "S0",
  "status": "image-unavailable",
  "row": "WIN11",
  "verdict": "fail",
  "reason": $(printf '%s' "$reason" | python3 -I -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "note": "No consumer Win11 VM was run. A genuine standard-user receipt is owed. See win11-vm/README.md for the license/acquisition basis and supply iso_url + iso_sha256 via workflow_dispatch to produce a real receipt."
}
JSON
  cp "$DROP/WIN11/s0.json" "$DROP/WIN11/s1.json"
  # s1 carries its own spike label.
  sed -i 's/"spike": "S0"/"spike": "S1"/' "$DROP/WIN11/s1.json"
  echo "have_iso=false" >> "${GITHUB_OUTPUT:-/dev/null}"
  echo "IMAGE BLOCKER RECORDED: $reason" >&2
}

if [[ -z "${ISO_URL:-}" ]]; then
  emit_blocker "iso_url not supplied: no stable, digest-pinnable, license-clean public consumer Win11 ISO URL exists; supply a Win11 Enterprise evaluation ISO (90-day eval license) at dispatch time."
  # Never green without a real receipt (desktop-spike testing rule 6). The recorded blocker is a
  # valid spike OUTCOME, but the row stays RED to signal the consumer standard-user receipt is still
  # owed; the receipt + summary (uploaded via always()) explain why. Supply iso_url+iso_sha256 via
  # workflow_dispatch to produce a real run.
  exit 1
fi

if [[ -z "${ISO_SHA256:-}" ]]; then
  echo "iso_sha256 is REQUIRED when iso_url is set — refusing to boot an unverified image." >&2
  emit_blocker "iso_url supplied without iso_sha256; the image digest must be pinned."
  exit 1
fi

echo "::group::Download + verify ISO"
iso="$DROP/win11.iso"
# Honor the agent/CI proxy; never disable TLS verification.
curl -fSL --retry 3 --retry-delay 5 -o "$iso" "$ISO_URL"
actual="$(sha256sum "$iso" | cut -d' ' -f1)"
echo "expected: $ISO_SHA256"
echo "actual:   $actual"
if [[ "$actual" != "$(printf '%s' "$ISO_SHA256" | tr '[:upper:]' '[:lower:]')" ]]; then
  echo "ISO SHA-256 mismatch — refusing to boot." >&2
  emit_blocker "ISO SHA-256 mismatch: expected $ISO_SHA256 got $actual"
  exit 1
fi
echo "::endgroup::"

# Record the exact image basis into the drop for the receipt bundle (no secret: a public URL+digest).
cat > "$DROP/WIN11/image.json" <<JSON
{
  "isoUrl": $(printf '%s' "$ISO_URL" | python3 -I -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))'),
  "isoSha256": "$actual",
  "licenseBasis": "operator-supplied; Win11 Enterprise evaluation ISO carries a 90-day Microsoft evaluation license. SKU is immaterial to per-user %USERPROFILE% NTFS isolation.",
  "acquiredBy": "acquire-iso.sh"
}
JSON
echo "have_iso=true" >> "${GITHUB_OUTPUT:-/dev/null}"
echo "ISO verified and recorded."
