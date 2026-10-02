#!/usr/bin/env bash
# Install a checksum-pinned CI tool from DEPS.json with bounded acquisition retry.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
manifest="$script_dir/../DEPS.json"
destination="$script_dir/../.ci-tools"
tool=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --tool) tool="$2"; shift 2 ;;
    --dest) destination="$2"; shift 2 ;;
    --manifest) manifest="$2"; shift 2 ;;
    *) echo "ERROR: unknown flag: $1" >&2; exit 2 ;;
  esac
done

case "$tool" in actionlint|shellcheck|vale) ;; *) echo "ERROR: unsupported --tool: $tool" >&2; exit 2 ;; esac

case "${@@CREATE_REPO_env-prefix@@_CI_TOOL_PLATFORM:-$(uname -s)-$(uname -m)}" in
  Darwin-arm64) platform=darwin-arm64 ;;
  Linux-x86_64) platform=linux-amd64 ;;
  Linux-aarch64) platform=linux-arm64 ;;
  darwin-arm64|linux-amd64|linux-arm64) platform="${@@CREATE_REPO_env-prefix@@_CI_TOOL_PLATFORM}" ;;
  *) echo "ERROR: unsupported CI-tool platform" >&2; exit 1 ;;
esac

read_tool() {
  CI_TOOL_FIELD="$1" \
  CI_TOOL_MANIFEST="$manifest" \
  CI_TOOL_NAME="$tool" \
  CI_TOOL_PLATFORM="$platform" \
    node -e '
      const { readFileSync } = require("node:fs");
      const entry = JSON.parse(readFileSync(process.env.CI_TOOL_MANIFEST, "utf8")).ci_tools[process.env.CI_TOOL_NAME];
      const value = ["version", "base_url"].includes(process.env.CI_TOOL_FIELD)
        ? entry?.[process.env.CI_TOOL_FIELD]
        : entry?.platforms?.[process.env.CI_TOOL_PLATFORM]?.[process.env.CI_TOOL_FIELD];
      if (value === undefined) throw new Error("missing CI tool field: " + process.env.CI_TOOL_FIELD);
      process.stdout.write(String(value));
    '
}

version="$(read_tool version)"
base_url="$(read_tool base_url)"
filename="$(read_tool filename)"
archive_sha="$(read_tool sha256)"
binary_sha="$(read_tool binary_sha256)"
binary="$destination/bin/$tool"

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'; else shasum -a 256 "$1" | awk '{print $1}'; fi
}

if [ -x "$binary" ] && [ "$(sha256 "$binary")" = "$binary_sha" ]; then
  echo "$tool $version already verified at $binary"
  exit 0
fi

archive="$(mktemp -t "$tool.XXXXXX")"
extract_dir="$(mktemp -d -t "$tool.XXXXXX")"
trap 'rm -rf "$archive" "$extract_dir"' EXIT

curl -sSL \
  --retry 5 \
  --retry-all-errors \
  --retry-delay 0 \
  --retry-max-time 300 \
  --connect-timeout 30 \
  -o "$archive" "$base_url/$filename"

actual_archive_sha="$(sha256 "$archive")"
test "$actual_archive_sha" = "$archive_sha" || {
  echo "ERROR: $tool archive checksum mismatch: expected $archive_sha, got $actual_archive_sha" >&2
  exit 1
}

tar -xf "$archive" -C "$extract_dir"
source_binary="$(find "$extract_dir" -type f -name "$tool" -print -quit)"
test -n "$source_binary"
actual_binary_sha="$(sha256 "$source_binary")"
test "$actual_binary_sha" = "$binary_sha" || {
  echo "ERROR: $tool binary checksum mismatch: expected $binary_sha, got $actual_binary_sha" >&2
  exit 1
}

mkdir -p "$(dirname "$binary")"
install -m 0755 "$source_binary" "$binary"
