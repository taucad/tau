#!/usr/bin/env bash
# Purpose: Spike S9 (native-dependency-resolution charter, W20/Q67). List the Windows
#   python-build-standalone install_only_stripped archives (x86_64, aarch64) as data:
#   link entries and bundled CRT DLLs (vcruntime*.dll, msvcp*.dll). Nothing is extracted or run.
# Why: decides whether a Windows closure needs a separate CRT payload and whether the
#   archive reader needs Windows link handling.
# Environment: bash, curl, sha256sum, tar; network to github.com release downloads.
# Usage: scripts/spikes/native-deps/linux/s9/list-windows-pbs.sh <out-dir>
# Exit codes: 0 both archives verified and listed, 1 download or digest failure, 2 usage.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <out-dir>" >&2
  exit 2
fi
out="$1"
mkdir -p "$out/downloads"
release=20260901
base="https://github.com/astral-sh/python-build-standalone/releases/download/${release}"
# Digests from the release's SHA256SUMS; the x86_64 install_only row equals the desktop manifest's pin.
archives=(
  "cpython-3.13.15+${release}-x86_64-pc-windows-msvc-install_only_stripped.tar.gz 63d263ab0162f34a241a56dc5b283c22d6e131f5516117e6a921350c69ba7d4f"
  "cpython-3.13.15+${release}-aarch64-pc-windows-msvc-install_only_stripped.tar.gz 8b31e1ddae9ebd339eae0549049546aa54484dbf92c81694b1e7510fee869413"
)

for row in "${archives[@]}"; do
  read -r name digest <<<"$row"
  path="$out/downloads/$name"
  curl -fsSL --retry 3 -o "$path" "${base}/${name//+/%2B}"
  echo "${digest}  ${path}" | sha256sum --check --quiet
  listing="$out/${name%.tar.gz}.tvf.txt"
  tar -tvzf "$path" >"$listing"
  entries=$(wc -l <"$listing")
  # GNU tar -tv: first column is the mode string; 'l' symlink, 'h' hard link. Also catch "link to"/"->".
  links=$(awk 'substr($1,1,1)=="l" || substr($1,1,1)=="h"' "$listing" | wc -l)
  arrows=$( (grep -E ' -> | link to ' "$listing" || true) | wc -l)
  crt=$( (grep -iE '/(vcruntime[^/]*|msvcp[^/]*|ucrtbase[^/]*|api-ms-win-crt[^/]*)\.dll$' "$listing" || true) | awk '{print $NF}')
  bytes=$(stat -c %s "$path")
  unpacked=$(awk '{sum += $3} END {print sum}' "$listing")
  {
    echo "archive=$name"
    echo "sha256=$digest (verified)"
    echo "bytes=$bytes"
    echo "unpacked_bytes=$unpacked"
    echo "entries=$entries"
    echo "link_entries=$links"
    echo "arrow_entries=$arrows"
    echo "crt_dlls:"
    if [[ -n "$crt" ]]; then echo "$crt" | sed 's/^/  /'; else echo "  (none)"; fi
    echo "python_exe:"
    (grep -E '/python[w]?\.exe$' "$listing" || true) | awk '{print "  " $NF}'
    echo "top_level:"
    awk '{print $NF}' "$listing" | cut -d/ -f1 | sort -u | sed 's/^/  /'
    echo
  } | tee -a "$out/summary.txt"
done
