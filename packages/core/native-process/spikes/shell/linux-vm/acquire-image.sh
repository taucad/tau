#!/usr/bin/env bash
# Fetch + digest-verify a STOCK cloud image for the Linux VM lane (Spike W2).
#
# The lane is image-agnostic; DISTRO selects which stock image to acquire:
#   ubuntu-2404 (default) → Ubuntu 24.04 LTS (noble) server cloud image
#   debian-13             → Debian 13 (trixie) generic amd64 cloud image
# IMAGE_URL / IMAGE_SHA256 still override the per-distro default + verification.
#
# Unlike the Win11 lane there is NO licensing obstacle: Ubuntu and Debian cloud images are freely
# redistributable and published with checksums, so this lane ships a working default URL per distro and
# verifies the download against the publisher's SHA{256,512}SUMS (trust-on-publish / observed-on-first-
# use — NO hard-pinned digest to go stale as the publisher re-rolls `latest`). An operator may override
# IMAGE_URL and pin IMAGE_SHA256 (a SHA-256 of the file, distro-agnostic) exactly; when IMAGE_SHA256 is
# set the download is refused on mismatch. The image is the genuine stock release — AppArmor untouched,
# apparmor_restrict_unprivileged_userns at its shipped value — which is the whole point of the lane.
#
# SSRF guard: IMAGE_URL is a free-form workflow_dispatch input, so before any fetch the scheme must be
# https and the host must be on the publisher allow-list (cloud-images.ubuntu.com, cloud.debian.org).
# The SUMS file is fetched from the SAME host (dirname of IMAGE_URL), so the one allow-list covers both.
# Anything else records an image-unavailable blocker rather than fetching it.
#
# Outputs: have_image=true + the image path on DROP, or have_image=false + an image-unavailable
# blocker receipt (DROP/image.json). It is never green without a real image.
set -euo pipefail

DROP="${DROP:?DROP is required}"
DISTRO="${DISTRO:-ubuntu-2404}"
IMAGE_SHA256="${IMAGE_SHA256:-}"
mkdir -p "$DROP"

# Per-distro stock defaults (used only when IMAGE_URL is not provided). The publisher's co-located SUMS
# file makes the `release`/`latest` path digest-stable without a hard-pinned hash. Debian publishes only
# SHA512SUMS in its cloud-image dir (no SHA256SUMS), so the SUMS file + algorithm are per-distro.
case "$DISTRO" in
  ubuntu-2404)
    DEFAULT_URL="https://cloud-images.ubuntu.com/releases/noble/release/ubuntu-24.04-server-cloudimg-amd64.img"
    SUMS_FILE="SHA256SUMS"; SUMS_ALGO="sha256"
    DISTRO_LABEL="Ubuntu 24.04 LTS (noble) server cloud image, stock security"
    ;;
  debian-13)
    DEFAULT_URL="https://cloud.debian.org/images/cloud/trixie/latest/debian-13-generic-amd64.qcow2"
    SUMS_FILE="SHA512SUMS"; SUMS_ALGO="sha512"
    DISTRO_LABEL="Debian 13 (trixie) generic amd64 cloud image, stock security"
    ;;
  *)
    echo "have_image=false" >> "${GITHUB_OUTPUT:-/dev/null}"
    echo "BLOCKER: unknown DISTRO=$DISTRO (expected ubuntu-2404 | debian-13)" >&2
    exit 1
    ;;
esac

IMAGE_URL="${IMAGE_URL:-$DEFAULT_URL}"

base="$(basename "$IMAGE_URL")"
img="$DROP/$base"
sums_url="$(dirname "$IMAGE_URL")/$SUMS_FILE"

echo "::group::Acquire stock cloud image ($DISTRO)"
echo "distro:  $DISTRO"
echo "url:     $IMAGE_URL"
record_blocker() {
  local reason="$1"
  python3 -I - "$DROP/image.json" "$IMAGE_URL" "$reason" "$DISTRO" <<'PY'
import json, sys
path, url, reason, distro = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
json.dump({"status": "image-unavailable", "distro": distro, "url": url, "reason": reason,
           "note": "Ubuntu/Debian cloud images are freely redistributable; this is a fetch/verify/allow-list failure, not a licensing block."},
          open(path, "w"), indent=2)
PY
  echo "have_image=false" >> "${GITHUB_OUTPUT:-/dev/null}"
  echo "BLOCKER: $reason" >&2
  echo "::endgroup::"
}

# ── SSRF allow-list: https scheme + a known publisher host only ─────────────────────────────────────
# IMAGE_URL is operator-supplied, so constrain it before any network call: the dispatch input must never
# be pointable at an internal / cloud-metadata host. The SUMS file comes from the same host (dirname).
url_host() { # scheme://[user@]host[:port]/path → host
  local u="$1" rest hostport
  rest="${u#*://}"; hostport="${rest%%/*}"; hostport="${hostport##*@}"; echo "${hostport%%:*}"
}
scheme="${IMAGE_URL%%://*}"
host="$(url_host "$IMAGE_URL")"
allowed=0
for h in cloud-images.ubuntu.com cloud.debian.org; do [[ "$host" == "$h" ]] && allowed=1; done
if [[ "$scheme" != "https" ]]; then
  record_blocker "refusing non-https image URL (scheme=$scheme)"
  exit 1
fi
if [[ "$allowed" -ne 1 ]]; then
  record_blocker "host '$host' is not on the image allow-list (cloud-images.ubuntu.com, cloud.debian.org)"
  exit 1
fi

if ! curl -fsSL --retry 3 --retry-delay 5 -o "$img" "$IMAGE_URL"; then
  record_blocker "download failed from $IMAGE_URL"
  exit 1
fi

# The operator pin (IMAGE_SHA256) is always a SHA-256 of the file (distro-agnostic); trust-on-publish
# uses the publisher's native SUMS file + its algorithm (sha256 for Ubuntu, sha512 for Debian).
actual_sha256="$(sha256sum "$img" | cut -d' ' -f1)"
actual="$("${SUMS_ALGO}sum" "$img" | cut -d' ' -f1)"
echo "sha256:  $actual_sha256"
[[ "$SUMS_ALGO" != sha256 ]] && echo "$SUMS_ALGO:  $actual"

if [[ -n "$IMAGE_SHA256" ]]; then
  if [[ "$actual_sha256" != "$IMAGE_SHA256" ]]; then
    record_blocker "digest mismatch: expected $IMAGE_SHA256, got $actual_sha256"
    exit 1
  fi
  echo "verify:  matches operator-pinned IMAGE_SHA256"
else
  # Trust-on-publish: verify against the publisher's SUMS file in the same directory. The checksum
  # line is `<sha>  <name>` (text) or `<sha> *<name>` (binary) — whitespace and a leading `*` vary, so
  # match the filename field with awk rather than a brittle fixed-space grep.
  if curl -fsSL --retry 3 -o "$DROP/$SUMS_FILE" "$sums_url"; then
    want="$(awk -v f="$base" '$2 ~ ("^[*]?" f "$") {print $1}' "$DROP/$SUMS_FILE" | head -1)"
    if [[ -z "$want" ]]; then
      record_blocker "$SUMS_FILE at $sums_url has no entry for $base (set IMAGE_SHA256 to pin manually)"
      exit 1
    elif [[ "$want" != "$actual" ]]; then
      record_blocker "digest does not match publisher $SUMS_FILE for $base (want=$want got=$actual)"
      exit 1
    fi
    echo "verify:  matches publisher $SUMS_FILE ($sums_url)"
  else
    record_blocker "could not fetch $SUMS_FILE from $sums_url (set IMAGE_SHA256 to pin manually)"
    exit 1
  fi
fi

# Record the exact image basis (no secrets) alongside the receipts.
python3 -I - "$DROP/image.json" "$IMAGE_URL" "$actual_sha256" "$base" "$DISTRO_LABEL" "$DISTRO" <<'PY'
import json, sys
path, url, sha, base, label, distro = sys.argv[1:7]
json.dump({"status": "ok", "distro": distro, "url": url, "file": base, "sha256": sha,
           "distro_label": label},
          open(path, "w"), indent=2)
PY
echo "image=$img" >> "${GITHUB_OUTPUT:-/dev/null}"
echo "have_image=true" >> "${GITHUB_OUTPUT:-/dev/null}"
ls -l "$img"
echo "::endgroup::"
