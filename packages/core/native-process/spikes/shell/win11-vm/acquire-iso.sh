#!/usr/bin/env bash
# Acquire the Windows 11 ISO for Spike W2, or record the image-unavailable blocker.
#
# Operator ergonomics (one input): iso_url is the only required dispatch input; iso_sha256 is
# OPTIONAL. Two provenance modes, both fail-closed:
#   * iso_sha256 SUPPLIED  -> pre-pinned digest; download, verify, fail on mismatch.
#   * iso_sha256 ABSENT    -> provenance is the Microsoft-host allowlist + TLS (NOT a pre-pinned
#                             hash). iso_url's host (and the effective URL host after redirects) must
#                             be an exact Microsoft download host; anything else is refused (SSRF
#                             guard). The SHA-256 is computed on first download and recorded as
#                             observed-on-first-use.
#
# ISO caching: DISABLED by choice. A Win11 Enterprise eval ISO is ~5-7 GB; GitHub's per-repo Actions
# cache cap is ~10 GB, so a single ISO entry would evict the other spike lanes' caches (and itself)
# under LRU. The ISO is re-downloaded per run instead; this decision is recorded in image.json.
#
# With no iso_url (there is no default; workflow_dispatch requires it) this records a precise blocker
# and fails — the lane is NEVER green without a real VM run (desktop-spike testing rule 6).
set -euo pipefail

DROP="${DROP:?DROP is required}"
mkdir -p "$DROP/WIN11"

# Exact Microsoft download hosts (verified names). prss.microsoft.com is Microsoft's PRSS download
# CDN; www.microsoft.com is the Evaluation Center. Suffix match covers the prss CDN shards.
MS_HOST_EXACT=("software.download.prss.microsoft.com" "software-static.download.prss.microsoft.com" "www.microsoft.com")
MS_HOST_SUFFIX=".download.prss.microsoft.com"

host_of() { # strip scheme, userinfo, port and path -> bare host, lowercased
  printf '%s' "$1" | sed -E 's#^[a-zA-Z]+://##; s#^[^/@]*@##; s#[/?].*$##; s#:[0-9]+$##' | tr '[:upper:]' '[:lower:]'
}

host_allowed() {
  local h="$1" e
  for e in "${MS_HOST_EXACT[@]}"; do [[ "$h" == "$e" ]] && return 0; done
  [[ "$h" == *"$MS_HOST_SUFFIX" ]] && return 0
  return 1
}

emit_blocker() {
  local reason="$1"
  cat > "$DROP/WIN11/s0.json" <<JSON
{
  "spike": "S0",
  "status": "image-unavailable",
  "row": "WIN11",
  "verdict": "fail",
  "reason": $(printf '%s' "$reason" | python3 -I -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "note": "No consumer Win11 VM was run. A genuine standard-user receipt is owed. Dispatch with iso_url set to a Microsoft download host (iso_sha256 optional); see win11-vm/README.md."
}
JSON
  cp "$DROP/WIN11/s0.json" "$DROP/WIN11/s1.json"
  sed -i 's/"spike": "S0"/"spike": "S1"/' "$DROP/WIN11/s1.json"
  echo "have_iso=false" >> "${GITHUB_OUTPUT:-/dev/null}"
  echo "IMAGE BLOCKER RECORDED: $reason" >&2
}

if [[ -z "${ISO_URL:-}" ]]; then
  emit_blocker "iso_url not supplied."
  exit 1
fi

scheme="$(printf '%s' "$ISO_URL" | sed -E 's#^([a-zA-Z]+)://.*#\1#' | tr '[:upper:]' '[:lower:]')"
if [[ "$scheme" != "https" ]]; then
  emit_blocker "iso_url must be https (got scheme '$scheme')."
  exit 1
fi

req_host="$(host_of "$ISO_URL")"
pinned="${ISO_SHA256:-}"
provenance=""
if [[ -z "$pinned" ]]; then
  # No pinned hash: the Microsoft-host allowlist is the provenance. Guard the request host now, and
  # the effective (post-redirect) host after download.
  if ! host_allowed "$req_host"; then
    emit_blocker "iso_sha256 omitted and iso_url host '$req_host' is not a Microsoft download host; refusing (SSRF guard). Allowed: ${MS_HOST_EXACT[*]} or *$MS_HOST_SUFFIX."
    exit 1
  fi
  provenance="ms-host-allowlist+tls (observed-on-first-use digest; NOT a pre-pinned hash)"
else
  provenance="operator-pinned sha256"
fi

echo "::group::Download ISO ($provenance)"
iso="$DROP/win11.iso"
# Honor the agent/CI proxy; never disable TLS verification. --proto =https forbids a redirect that
# downgrades to http. Capture the effective URL to re-check the host after redirects.
eff="$(curl -fSL --proto '=https' --retry 3 --retry-delay 5 -o "$iso" -w '%{url_effective}' "$ISO_URL")"
eff_host="$(host_of "$eff")"
echo "requested host: $req_host"
echo "effective host: $eff_host"

if [[ -z "$pinned" ]] && ! host_allowed "$eff_host"; then
  echo "effective URL host '$eff_host' left the Microsoft allowlist after redirect — refusing." >&2
  emit_blocker "redirect left the Microsoft allowlist: effective host '$eff_host' (SSRF guard)."
  rm -f "$iso"
  exit 1
fi

actual="$(sha256sum "$iso" | cut -d' ' -f1)"
echo "computed sha256: $actual"
if [[ -n "$pinned" ]]; then
  if [[ "$actual" != "$(printf '%s' "$pinned" | tr '[:upper:]' '[:lower:]')" ]]; then
    echo "ISO SHA-256 mismatch — refusing to boot." >&2
    emit_blocker "ISO SHA-256 mismatch: expected $pinned got $actual"
    rm -f "$iso"
    exit 1
  fi
fi
echo "::endgroup::"

cat > "$DROP/WIN11/image.json" <<JSON
{
  "isoUrl": $(printf '%s' "$ISO_URL" | python3 -I -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))'),
  "effectiveUrl": $(printf '%s' "$eff" | python3 -I -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))'),
  "requestHost": "$req_host",
  "effectiveHost": "$eff_host",
  "isoSha256": "$actual",
  "sha256Provenance": "$provenance",
  "isoCache": "disabled: a ~5-7GB Win11 eval ISO vs GitHub's ~10GB/repo Actions cache cap would evict the other spike lanes' caches (and itself) under LRU; re-downloaded per run instead.",
  "licenseBasis": "operator-supplied; Win11 Enterprise evaluation ISO carries a 90-day Microsoft evaluation license. SKU is immaterial to per-user %USERPROFILE% NTFS isolation.",
  "acquiredBy": "acquire-iso.sh"
}
JSON
echo "have_iso=true" >> "${GITHUB_OUTPUT:-/dev/null}"
echo "ISO acquired ($provenance), sha256=$actual"
