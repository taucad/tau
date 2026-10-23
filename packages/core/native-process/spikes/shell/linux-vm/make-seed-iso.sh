#!/usr/bin/env bash
# Build the NoCloud "cidata" seed ISO for the Linux VM lane (Spike W2). cloud-init's NoCloud datasource
# reads user-data/meta-data from a filesystem labelled `cidata`, so a tiny ISO carrying just those two
# files drives provisioning. No secret: user-data holds only a synthetic VM-local console password.
set -euo pipefail

DROP="${DROP:?DROP is required}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
seed_src="$(mktemp -d)"
cp "$here/cloud-init/user-data" "$seed_src/user-data"
cp "$here/cloud-init/meta-data" "$seed_src/meta-data"

out="$DROP/seed.iso"
# Volume label `cidata` is what the NoCloud datasource scans for; -J/-r keep the file names intact.
xorriso -as mkisofs -J -r -V cidata -o "$out" "$seed_src"
echo "seed ISO: $out"
ls -l "$out"
