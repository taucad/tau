#!/usr/bin/env bash
# Fetch + digest-verify the STOCK Ubuntu 24.04 cloud image for the Linux VM lane (Spike W2).
#
# Unlike the Win11 lane there is NO licensing obstacle: Ubuntu cloud images are freely redistributable
# and published with checksums, so this lane ships a working default URL and verifies the download
# against Ubuntu's published SHA256SUMS (trust-on-publish). An operator may override IMAGE_URL and pin
# IMAGE_SHA256 exactly; when IMAGE_SHA256 is set the download is refused on mismatch. The image is the
# genuine stock release — AppArmor untouched, apparmor_restrict_unprivileged_userns at its shipped
# value — which is the whole point of the lane.
#
# Outputs: have_image=true + the image path on DROP, or have_image=false + an image-unavailable
# blocker receipt (DROP/image.json). It is never green without a real image.
set -euo pipefail

DROP="${DROP:?DROP is required}"
# A dated release path is digest-stable; the generic 'release' symlink moves on point releases.
IMAGE_URL="${IMAGE_URL:-https://cloud-images.ubuntu.com/releases/noble/release/ubuntu-24.04-server-cloudimg-amd64.img}"
IMAGE_SHA256="${IMAGE_SHA256:-}"
mkdir -p "$DROP"

base="$(basename "$IMAGE_URL")"
img="$DROP/$base"
sums_url="$(dirname "$IMAGE_URL")/SHA256SUMS"

echo "::group::Acquire stock Ubuntu 24.04 cloud image"
echo "url:     $IMAGE_URL"
record_blocker() {
  local reason="$1"
  python3 -I - "$DROP/image.json" "$IMAGE_URL" "$reason" <<'PY'
import json, sys
path, url, reason = sys.argv[1], sys.argv[2], sys.argv[3]
json.dump({"status": "image-unavailable", "url": url, "reason": reason,
           "note": "Ubuntu cloud images are freely redistributable; this is a fetch/verify failure, not a licensing block."},
          open(path, "w"), indent=2)
PY
  echo "have_image=false" >> "${GITHUB_OUTPUT:-/dev/null}"
  echo "BLOCKER: $reason" >&2
  echo "::endgroup::"
}

if ! curl -fsSL --retry 3 --retry-delay 5 -o "$img" "$IMAGE_URL"; then
  record_blocker "download failed from $IMAGE_URL"
  exit 1
fi

actual="$(sha256sum "$img" | cut -d' ' -f1)"
echo "sha256:  $actual"

if [[ -n "$IMAGE_SHA256" ]]; then
  if [[ "$actual" != "$IMAGE_SHA256" ]]; then
    record_blocker "digest mismatch: expected $IMAGE_SHA256, got $actual"
    exit 1
  fi
  echo "verify:  matches operator-pinned IMAGE_SHA256"
else
  # Trust-on-publish: verify against Ubuntu's SHA256SUMS from the same directory.
  if curl -fsSL --retry 3 -o "$DROP/SHA256SUMS" "$sums_url" && grep -qi "  \*\?$base\$" "$DROP/SHA256SUMS"; then
    if grep -qi "^$actual  \*\?$base\$" "$DROP/SHA256SUMS"; then
      echo "verify:  matches Ubuntu SHA256SUMS ($sums_url)"
    else
      record_blocker "digest does not match Ubuntu SHA256SUMS for $base"
      exit 1
    fi
  else
    record_blocker "could not fetch/parse SHA256SUMS from $sums_url (set IMAGE_SHA256 to pin manually)"
    exit 1
  fi
fi

# Record the exact image basis (no secrets) alongside the receipts.
python3 -I - "$DROP/image.json" "$IMAGE_URL" "$actual" "$base" <<'PY'
import json, sys
path, url, sha, base = sys.argv[1:5]
json.dump({"status": "ok", "url": url, "file": base, "sha256": sha,
           "distro": "Ubuntu 24.04 LTS (noble) server cloud image, stock security"},
          open(path, "w"), indent=2)
PY
echo "image=$img" >> "${GITHUB_OUTPUT:-/dev/null}"
echo "have_image=true" >> "${GITHUB_OUTPUT:-/dev/null}"
ls -l "$img"
echo "::endgroup::"
