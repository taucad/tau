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

echo ""
echo "### S2 — interactive PTY under the profiled bwrap (Phase B, sysctl untouched)"
if [[ -f "$DROP/s2.json" ]]; then
  python3 -I - "$DROP/s2.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
ctx = d.get("context", {})
checks = d.get("checks", {})
pty = d.get("pty", {})
verdict = d.get("verdict", "?")
ok = d.get("all_pass") is True
print(f"- {'✅' if ok else '❌'} verdict=`{verdict}` · all_pass=`{d.get('all_pass')}` "
      f"· run_as=`{ctx.get('run_as')}` · --new-session=`{ctx.get('new_session')}` "
      f"· apparmor_restrict_unprivileged_userns=`{ctx.get('apparmor_restrict_unprivileged_userns')}` "
      f"(left untouched=`{ctx.get('apparmor_restrict_sysctl_left_untouched')}`)")
labels = {"tty": "real tty (test -t 0/1)",
          "resize": "window resize (stty size)",
          "sigint": "Ctrl-C → SIGINT(130)",
          "jobcontrol": "Ctrl-Z/bg/fg job control",
          "unicode": "UTF-8 round-trip"}
for key in ("tty", "resize", "sigint", "jobcontrol", "unicode"):
    c = checks.get(key, {})
    mark = "✅" if c.get("pass") else "❌"
    extra = ""
    if key == "resize":
        extra = f" (initial=`{c.get('initial')}` → resized=`{c.get('resized')}`, requested=`{c.get('requested')}`)"
    elif key == "sigint":
        extra = f" (exit=`{c.get('exit_code')}`, prompt regained in `{c.get('elapsed_ms')}ms`)"
    elif key == "unicode":
        extra = f" (sent=`{c.get('sent')}` received=`{c.get('received')}`)"
    print(f"  - {mark} **{labels[key]}** → pass=`{c.get('pass')}`{extra}")
    print(f"    - {c.get('detail','')}")
PY
else
  echo "- **(no s2.json receipt)** — S2 phase did not produce a receipt (treated as not-proven)."
fi

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
