#!/usr/bin/env bash
# Purpose: Re-emit a spike's summary text as GitHub notice annotations, so the numbers are readable
#   through the check-runs REST API where artifact and log downloads are unavailable.
# Environment: a GitHub Actions step with Node.js (workflow commands on stdout). At most 9 notices per call.
# Usage: scripts/spikes/native-deps/linux/annotate.sh <title> <file>
# Exit codes: 0 always once the arguments are valid, 2 usage.
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <title> <file>" >&2
  exit 2
fi
title="$(node --input-type=module - "$1" <<'NODE'
const escapeData = (text) => text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
process.stdout.write(escapeData(process.argv[2]).replaceAll(':', '%3A').replaceAll(',', '%2C'));
NODE
)"
file="$2"
[[ -f "$file" ]] || { echo "::warning title=${title}::no summary file ${file}"; exit 0; }
work="$(mktemp -d)"
# Use the workflow's Node runtime to keep line and UTF-8 boundaries on both macOS and Linux.
node --input-type=module - "$file" "$work/part-" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';

const summary = readFileSync(process.argv[2]);
let part = 0;
for (let offset = 0; offset < summary.length;) {
  let end = Math.min(offset + 3800, summary.length);
  if (end < summary.length) {
    const newline = summary.lastIndexOf(10, end - 1);
    if (newline >= offset) end = newline + 1;
    else while ((summary[end] & 0xc0) === 0x80) end -= 1;
  }
  writeFileSync(`${process.argv[3]}${String(part++).padStart(6, '0')}`, summary.subarray(offset, end));
  offset = end;
}
NODE
index=0
for part in "$work"/part-*; do
  [[ -f "$part" ]] || continue
  index=$((index + 1))
  if [[ "$index" -gt 9 ]]; then
    echo "::warning title=${title}::summary truncated after 9 notices"
    break
  fi
  body="$(node --input-type=module - "$part" <<'NODE'
import { readFileSync } from 'node:fs';
process.stdout.write(readFileSync(process.argv[2], 'utf8').replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A'));
NODE
)"
  echo "::notice title=${title} (${index})::${body}"
done
rm -rf "$work"
