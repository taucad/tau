#!/usr/bin/env bash
#
# Re-emit a spike job's console tail, summary and raw records as GitHub check annotations.
#
# Why: the spike results must be readable through the REST check-run annotations API by an
# operator or agent whose network cannot reach the Actions log and artifact blob storage.
# Each annotation carries at most ~60 KB; records are compacted and split across annotations.
#
# Required env vars:
#   RUNNER_TEMP   GitHub runner temporary directory (holds console.log and out/)
#   SPIKE_ID      Spike identifier, e.g. S1 (optional in the producer job)
#
# Usage:
#   scripts/spikes/native-deps/annotate.sh
#
# Exit codes:
#   0  Always (annotation is best effort)
set -uo pipefail
: "${RUNNER_TEMP:?set RUNNER_TEMP}"
spike="${SPIKE_ID:-producer}"
lower="$(printf '%s' "$spike" | tr '[:upper:]' '[:lower:]')"
out="$RUNNER_TEMP/out"

emit() {
  # $1 level, $2 title, stdin message; workflow-command escaping for %, CR and LF.
  local message
  message="$(cat | head -c 60000 | sed -e 's/%/%25/g' | awk 'BEGIN { ORS = "%0A" } { gsub(/\r/, "%0D"); print }')"
  printf '::%s title=%s::%s\n' "$1" "$2" "$message"
}

if [ -f "$RUNNER_TEMP/console.log" ]; then
  tail -c 50000 "$RUNNER_TEMP/console.log" | emit notice "$spike console tail"
fi
if [ -f "$out/$lower-summary.json" ]; then
  jq -c 'del(.host)' "$out/$lower-summary.json" | emit notice "$spike summary"
  jq -c '.host' "$out/$lower-summary.json" | emit notice "$spike host"
fi
for extra in "$out"/*.json; do
  [ -f "$extra" ] || continue
  case "$extra" in *-summary.json) continue ;; esac
  jq -c 'del(.host)' "$extra" | emit notice "$spike $(basename "$extra")"
done
if [ -d "$out/$lower" ]; then
  jq -c 'del(.host)' "$out/$lower"/*.json | split -b 55000 - "$RUNNER_TEMP/records-"
  index=0
  for part in "$RUNNER_TEMP"/records-*; do
    index=$((index + 1))
    emit notice "$spike records $index" < "$part"
  done
fi
exit 0
