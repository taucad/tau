#!/usr/bin/env bash
# Render the Spike W2 WIN11 row into the GitHub step summary. Reads the receipts the guest dropped
# (or the blocker receipt). Pure presentation; never changes a verdict.
set -euo pipefail
DROP="${DROP:?DROP is required}"
w="$DROP/WIN11"

echo "## Spike W2 — consumer Win11 standard-user Bash (WIN11)"
echo ""
if [[ -f "$DROP/image.json" || -f "$w/image.json" ]]; then
  echo "Image basis recorded in artifact (image.json)."
fi

print_one() {
  local f="$1" label="$2"
  [[ -f "$f" ]] || { echo "- $label: (no receipt)"; return; }
  python3 -I - "$f" "$label" <<'PY'
import json, sys
f, label = sys.argv[1], sys.argv[2]
d = json.load(open(f))
status = d.get("status", "ok")
print(f"- **{label}**: verdict=`{d.get('verdict','?')}` status=`{status}`")
if status not in ("ok",):
    print(f"  - {d.get('reason','')}")
for c in d.get("checks", []):
    mark = "✅" if c.get("verdict") == "pass" else "❌"
    print(f"  - {mark} `{c.get('id')}` — {c.get('expect')} → observed: `{str(c.get('observed'))[:160]}`")
PY
}

print_one "$w/s0.json" "S0 (filesystem mask)"
print_one "$w/s1.json" "S1 (isolation/network/descendants/cancellation)"

if [[ -f "$w/run-context.json" ]]; then
  echo ""
  echo "Run context (fixture placement proof):"
  echo '```json'
  cat "$w/run-context.json"
  echo '```'
fi
echo ""
echo "_The decisive S0 check is \`s0.outside-read\`: with the fixture in the invoking standard user's %USERPROFILE% (RUNNER_TEMP unset), a PASS means srt-sandbox could NOT read this user's out-of-profile file — isolating the hosted-runner read as a Users-readable-workspace artifact. A FAIL means the read reproduced even under consumer profile isolation._"
