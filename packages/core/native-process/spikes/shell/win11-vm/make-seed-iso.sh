#!/usr/bin/env bash
# Build the autounattend "seed" CD for the Win11 unattended install (Spike W2). Windows Setup scans
# attached removable media for `autounattend.xml` at the volume root, so a tiny ISO carrying just that
# file drives the install. No secret: the file holds only a synthetic VM-local password.
set -euo pipefail

DROP="${DROP:?DROP is required}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
seed_src="$(mktemp -d)"
cp "$here/autounattend.xml" "$seed_src/autounattend.xml"

out="$DROP/seed.iso"
# Volume label AUTOUNATTEND is conventional; -J/-r give Joliet/RockRidge so the file name survives.
xorriso -as mkisofs -J -r -V AUTOUNATTEND -o "$out" "$seed_src"
echo "seed ISO: $out"
ls -l "$out"
