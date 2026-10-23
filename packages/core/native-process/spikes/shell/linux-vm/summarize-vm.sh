#!/usr/bin/env bash
# Render the Linux VM lane (Spike W2) into the GitHub step summary. Reads the receipts the guest dropped
# (or the blocker). Pure presentation; never changes a verdict.
set -euo pipefail
DROP="${DROP:?DROP is required}"

echo "## Spike W2 — Linux stock-VM netns + Tau-scoped AppArmor profile"
echo ""

if [[ -f "$DROP/context.json" ]]; then
  echo "### Guest security context (stock, untouched)"
  echo '```json'; cat "$DROP/context.json"; echo '```'
fi

echo "### Phase verdicts"
for row in LNX-VM-NOPROFILE LNX-VM-PROFILE LNX-VM-APPIMAGE; do
  pj="$DROP/$row.phase.json"
  if [[ -f "$pj" ]]; then
    python3 -I - "$pj" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
ok = d.get("verdict") in ("confirmed-blocked", "launches-with-sysctl-1", "blocked-no-profile-path")
print(f"- {'✅' if ok else '❌'} **{d['row']}** → verdict=`{d['verdict']}`")
print(f"  - expected: {d['expected']}")
print(f"  - direct loopback exit: `{d['loopback_direct_exit']}` · harness status: `{d['harness_status']}`")
PY
  else
    echo "- **$row**: (no phase receipt)"
  fi
done

echo ""
echo "### Direct bwrap loopback repro (the exact finding string)"
for tag in A-loopback-noprofile B-loopback-profile C-loopback-appimage; do
  if [[ -f "$DROP/$tag.txt" ]]; then
    echo "- \`$tag\`: $(grep -iE 'loopback|RTM_NEWADDR|exit=' "$DROP/$tag.txt" | tr '\n' ' ' | head -c 300)"
  fi
done

if [[ -f "$DROP/DONE" ]]; then
  echo ""
  echo "Sentinel: \`$(cat "$DROP/DONE")\`"
fi
if [[ -f "$DROP/blocker.json" ]]; then
  echo ""
  echo "### Blocker"
  echo '```json'; cat "$DROP/blocker.json"; echo '```'
fi
if [[ -f "$DROP/image.json" ]]; then
  echo ""
  echo "Image basis: \`$(cat "$DROP/image.json")\`"
fi
echo ""
echo "_The Tau-scoped AppArmor profile is in linux-vm/apparmor/tau-bwrap. The decisive proof is: Phase A blocked + Phase B launches, with apparmor_restrict_unprivileged_userns left at 1 in both (see context.json / apparmor_parser.log)._"
