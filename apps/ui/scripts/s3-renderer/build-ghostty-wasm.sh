#!/usr/bin/env bash
# Builds ghostty-web's WASM on Ghostty v1.3.1 for the S3 `ghostty131` candidate (Q3 attempt 3).
#
# ghostty-web 0.4.0-next.20 pins Ghostty 5714ed0, which predates Ghostty's scrollback page leak fix
# (ghostty-org/ghostty#10251). The patch is ghostty-web's `patches/ghostty-wasm-api.patch` as rebased by
# coder/ghostty-web#172, plus the row-clearing fix from coder/ghostty-web#180. Needs Zig 0.15.2 on PATH.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../../.." && pwd)"
commit=332b2aefc6e72d363aa93ab6ecfc86eeeeb5ed28
work="$root/out/s3-renderer/wasm"
src="$work/ghostty"

mkdir -p "$work"
if [ ! -d "$src/.git" ]; then
  git init -q "$src"
  git -C "$src" remote add origin https://github.com/ghostty-org/ghostty.git
fi
git -C "$src" fetch -q --depth 1 origin "$commit"
git -C "$src" checkout -q --force "$commit"
git -C "$src" clean -fdq
git -C "$src" apply "$here/ghostty-1.3.1-wasm-api.patch"
(cd "$src" && zig build lib-vt -Dtarget=wasm32-freestanding -Doptimize=ReleaseSmall)
cp "$src/zig-out/bin/ghostty-vt.wasm" "$work/ghostty-vt-1.3.1.wasm"
sha256sum "$work/ghostty-vt-1.3.1.wasm"
