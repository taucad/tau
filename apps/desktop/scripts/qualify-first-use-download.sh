#!/usr/bin/env bash
#
# Qualify first-use download of the native kernels under a notarised Tau.app on macOS.
#
# Charter W12 (native dependency resolution, go-live DSK-6): before the desktop stops bundling
# its Python and .NET runtimes, prove on a clean Mac that the closures a notarised Tau.app
# downloads run. The desktop does not prepare into the payload store yet (W6), so the script
# runs the preparation entry point the app will call, `tau prepare` and `tau export` from this
# checkout's built CLI, inside the notarised Tau binary as Node (ELECTRON_RUN_AS_NODE=1). The
# notarised binary is then the process that downloads and writes every byte, and the parent of
# every sandboxed worker.
#
# Cells, each PASS, FAIL or UNOBSERVABLE in <out-dir>/cells.json and <out-dir>/summary.md:
#   download     both closures prepare from their origins into an empty store
#   quarantine   `xattr -p com.apple.quarantine` exits non-zero on every store file
#   ready        both workers evaluate a model to a GLB inside sandbox-exec (the model raises
#                if the worker can open a socket, so success also shows the sandbox held)
#   syspolicy    scoped worker logs show no denial; actual unscoped UI alerts fail closed
#   negative     a quarantined clone of the store is refused; only observable with SIP on
#                (GitHub-hosted runners report SIP disabled, ruling X19)
#   golden       build123d's treeIntegrity and closureIntegrity equal tau-plugin.golden.json
#
# Optional env vars:
#   TAU_CONFIG_DIR   Config directory whose `payloads` is the store (default: the macOS default,
#                    ~/Library/Application Support/tau). The store must not exist yet.
#   W12_ANNOTATE     1 to print GitHub check annotations (default: 0)
#
# Usage:
#   pnpm nx run cli:build
#   apps/desktop/scripts/qualify-first-use-download.sh /path/to/Tau.app out/w12
#
# Exit codes:
#   0  Every observable cell passed
#   1  A cell failed
#   2  Bad arguments or the store already exists
#   3  Missing dependency (not macOS, CLI not built)

set -euo pipefail

if [[ $# -ne 2 ]]; then
  printf 'Usage: %s <Tau.app> <out-dir>\n' "$0" >&2
  exit 2
fi
[[ "$(uname -s)" == Darwin ]] || { echo "ERROR: macOS only" >&2; exit 3; }

REPO_ROOT="$(git rev-parse --show-toplevel)"
TAU_APP="$(cd "$1" && pwd -P)"
mkdir -p "$2"
OUT="$(cd "$2" && pwd -P)"
EVIDENCE="$REPO_ROOT/apps/desktop/scripts/first-use-evidence.mts"
ADDONS="$REPO_ROOT/apps/desktop/scripts/first-use-native-addons.mts"
TAU_BIN="$TAU_APP/Contents/MacOS/Tau"
CLI="$REPO_ROOT/packages/cli/dist/bin/tau.mjs"
GOLDEN="$REPO_ROOT/packages/plugins/build123d/tau-plugin.golden.json"
ANNOTATE="${W12_ANNOTATE:-0}"

[[ -x "$TAU_BIN" ]] || { echo "ERROR: no Tau binary at $TAU_BIN" >&2; exit 2; }
[[ -f "$CLI" ]] || { echo "ERROR: build the CLI first (pnpm nx run cli:build)" >&2; exit 3; }
command -v node >/dev/null || { echo "ERROR: node required" >&2; exit 3; }

CONFIG_DIR="${TAU_CONFIG_DIR:-$HOME/Library/Application Support/tau}"
STORE="$CONFIG_DIR/payloads"
if [[ -e "$STORE" ]]; then
  echo "ERROR: the store $STORE already exists; qualification starts from an empty store (set TAU_CONFIG_DIR)" >&2
  exit 2
fi
Q_CONFIG="$(mktemp -d "$OUT/quarantined.XXXXXX")"

# The CLI inside the notarised binary, as Node. The preload uses only matching release-signed
# Sharp native code; checkout addons have another Team ID and cannot load in this hardened app.
# The store comes from TAU_CONFIG_DIR or the default.
tau() {
  ELECTRON_RUN_AS_NODE=1 "$TAU_BIN" --import "$ADDONS" "$CLI" "$@"
}

# A JSON field from the last JSON line of a file, or "" when absent.
field() {
  node -e '
    let record = {};
    try {
      const lines = require("node:fs").readFileSync(process.argv[1], "utf8").trim().split("\n").filter((l) => l.startsWith("{"));
      record = lines.length === 0 ? {} : JSON.parse(lines.at(-1));
    } catch {}
    const value = process.argv[2].split(".").reduce((v, k) => (v == null ? undefined : v[k]), record);
    process.stdout.write(value == null ? "" : String(value));
  ' "$1" "$2"
}

CELLS="$OUT/cells.jsonl"
: >"$CELLS"
cell() {
  # name, verdict (PASS|FAIL|UNOBSERVABLE), detail
  node "$EVIDENCE" cell "$CELLS" "$1" "$2" "$3"
  printf '%s %s: %s\n' "$2" "$1" "$3"
}

finish() {
  local status=$?
  trap - EXIT
  if [[ $status -ne 0 ]]; then printf 'Harness exited %s before normal completion.\n' "$status" >>"$OUT/harness-error.txt"; fi
  rm -rf "$Q_CONFIG"
  node "$EVIDENCE" summary "$OUT" "$ANNOTATE" || status=1
  cat "$OUT/summary.md"
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

stamp() { date '+%Y-%m-%d %H:%M:%S'; }

# --- Host facts ------------------------------------------------------------------------------
echo "→ host facts"
{
  sw_vers
  echo "SIP: $(csrutil status 2>&1 || true)"
  echo "Gatekeeper: $(spctl --status 2>&1 || true)"
  echo "--- spctl assessment of Tau.app"
  spctl -a -vvv -t execute "$TAU_APP" 2>&1 || true
  echo "--- stapler"
  # xcrun opens an install dialog on a Mac without the developer tools.
  if xcode-select -p >/dev/null 2>&1; then xcrun stapler validate "$TAU_APP" 2>&1 || true; else echo "no developer tools"; fi
  echo "--- codesign integrity"
  codesign --verify --deep --strict "$TAU_APP" 2>&1
  echo "--- codesign"
  codesign -dv --verbose=2 "$TAU_APP" 2>&1 | grep -E '^(Identifier|Authority|TeamIdentifier|Timestamp|Runtime Version|Notarization Ticket)' || true
  echo "--- Tau.app quarantine: $(xattr -p com.apple.quarantine "$TAU_APP" 2>&1 || true)"
  echo "--- parent"
  ELECTRON_RUN_AS_NODE=1 "$TAU_BIN" -e 'console.log(JSON.stringify({ execPath: process.execPath, electron: process.versions.electron, node: process.versions.node }))'
} >"$OUT/host-facts.txt" 2>&1
cat "$OUT/host-facts.txt"
SIP_ENABLED=false
if csrutil status 2>/dev/null | grep -q 'status: enabled'; then SIP_ENABLED=true; fi
NOTARISED=$(grep -c 'source=Notarized Developer ID' "$OUT/host-facts.txt" || true)
cell facts "$([[ "$NOTARISED" -ge 1 ]] && echo PASS || echo FAIL)" "$(sw_vers -productVersion) ($(sw_vers -buildVersion)); SIP enabled: $SIP_ENABLED; spctl: $(grep -m1 -E '^.*: (accepted|rejected)' "$OUT/host-facts.txt" | sed 's/^.*: //'); $(grep -m1 '^source=' "$OUT/host-facts.txt" || echo 'no notarisation source'); parent $(tail -1 "$OUT/host-facts.txt")"

# --- Models ----------------------------------------------------------------------------------
MODELS="$OUT/models"
mkdir -p "$MODELS/py" "$MODELS/cs"
cat >"$MODELS/py/main.py" <<'PY'
import socket
from dataclasses import dataclass

from build123d import Box


@dataclass(frozen=True)
class Params:
    width: float = 10.0


def main(params: Params):
    try:
        socket.create_connection(("1.1.1.1", 53), timeout=5).close()
    except PermissionError:
        return Box(params.width, 20, 30)
    raise RuntimeError("worker egress allowed")
PY
cat >"$MODELS/cs/main.cs" <<'CS'
using System;
using System.Net.Sockets;
using System.Numerics;
using PicoGK;

try
{
    using var client = new TcpClient();
    client.Connect("1.1.1.1", 53);
    throw new InvalidOperationException("worker egress allowed");
}
catch (SocketException error) when (error.SocketErrorCode == SocketError.AccessDenied)
{
}

Library.Go(1.0f, () =>
{
    Library.oViewer().Add(Voxels.voxSphere(Vector3.Zero, 20.0f));
});
CS

WINDOW_START="$(stamp)"

# --- Download ------------------------------------------------------------------------------
echo "→ prepare both kernels into $STORE under the notarised binary"
download_ok=true
download_detail=""
for kernel in build123d picogk; do
  started=$(date +%s)
  set +e
  tau prepare "$kernel" --json >"$OUT/prepare-$kernel.json" 2>"$OUT/prepare-$kernel.stderr.txt"
  status=$?
  set -e
  seconds=$(($(date +%s) - started))
  readiness=$(field "$OUT/prepare-$kernel.json" status)
  if [[ $status -ne 0 || "$readiness" != ready ]]; then download_ok=false; fi
  download_detail+="$kernel exit $status, status '${readiness:-none}' in ${seconds} s, $(field "$OUT/prepare-$kernel.json" byteLength) bytes, closureIntegrity $(field "$OUT/prepare-$kernel.json" closureIntegrity); "
  tail -5 "$OUT/prepare-$kernel.stderr.txt" || true
done
closures=0
if [[ -d "$STORE/closures" ]]; then closures=$(find "$STORE/closures" -mindepth 2 -maxdepth 2 -type d | wc -l | tr -d ' '); fi
download_detail+="sealed closures in the store: $closures"
cell download "$($download_ok && echo PASS || echo FAIL)" "$download_detail"

# --- Quarantine ----------------------------------------------------------------------------
echo "→ xattr -p com.apple.quarantine on every store file"
find "$STORE" -type f >"$OUT/store-files.txt" 2>/dev/null || true
files=$(wc -l <"$OUT/store-files.txt" | tr -d ' ')
# xattr -p exits 0 only when the attribute exists; every file that has it is listed.
tr '\n' '\0' <"$OUT/store-files.txt" | xargs -0 -n 400 -P 4 sh -c 'for f; do if xattr -p com.apple.quarantine "$f" >/dev/null 2>&1; then printf "%s\n" "$f"; fi; done' _ >"$OUT/quarantined-files.txt" || true
quarantined=$(wc -l <"$OUT/quarantined-files.txt" | tr -d ' ')
{
  echo "# xattr listing of the launched helpers (store $STORE)"
  while IFS= read -r helper; do
    [[ -n "$helper" ]] || continue
    set +e
    xattr -p com.apple.quarantine "$helper" >/dev/null 2>&1
    probe=$?
    set -e
    echo "## ${helper#"$STORE"/}"
    echo "xattr -p com.apple.quarantine exit: $probe"
    xattr -l "$helper" 2>&1 | sed 's/^/  /'
  done < <(
    find "$STORE/closures" -type f \( -path '*/bin/python3*' -o -name dotnet -o -name 'libhostfxr.dylib' -o -name 'libhostpolicy.dylib' -o -name 'Tau.PicoGK.Worker.dll' -o -name 'PicoGK.dll' -o -name 'picogk*.dylib' \) 2>/dev/null | sort
  )
} >"$OUT/xattr-helpers.txt"
helpers=$(grep -c '^## ' "$OUT/xattr-helpers.txt" || true)
helper_hits=$(grep -c 'quarantine exit: 0' "$OUT/xattr-helpers.txt" || true)
verdict=FAIL
if [[ "$files" -gt 0 && "$quarantined" -eq 0 && "$helpers" -gt 0 && "$helper_hits" -eq 0 ]]; then verdict=PASS; fi
cell quarantine "$verdict" "$files store files probed, $quarantined carry com.apple.quarantine; $helpers launched helpers, every xattr -p exit non-zero: $([[ "$helper_hits" -eq 0 ]] && echo yes || echo no)"

# --- Ready inside sandbox-exec ---------------------------------------------------------------
# A sampler records the worker processes, each with its parent's executable, while each export
# runs. sandbox-exec applies the profile and then executes the worker in its own process, so the
# worker's parent is the process that spawned sandbox-exec.
sample() {
  local parent=$1
  while :; do
    ps -axo pid=,ppid=,command= | awk -v parent="$parent" '$2 == parent' | while read -r pid ppid command; do
      printf '%s pid %s parent %s (%s): %s\n' "$(date +%T)" "$pid" "$ppid" "$(ps -o comm= -p "$ppid" 2>/dev/null || echo gone)" "$command"
    done || true
    sleep 0.2
  done
}
export_model() {
  # label, config dir, model file, glb
  local label=$1 config=$2 model=$3 glb=$4 status
  local started tau_pid sampler
  started=$(date +%s)
  TAU_CONFIG_DIR="$config" ELECTRON_RUN_AS_NODE=1 "$TAU_BIN" --import "$ADDONS" "$CLI" export "$model" --ext glb --output "$glb" --json >"$OUT/export-$label.json" 2>"$OUT/export-$label.stderr.txt" &
  tau_pid=$!
  sample "$tau_pid" >"$OUT/ps-$label.txt" 2>/dev/null &
  sampler=$!
  status=0
  wait "$tau_pid" || status=$?
  kill "$sampler" 2>/dev/null || true
  wait "$sampler" 2>/dev/null || true
  echo "$status $(($(date +%s) - started))"
}
echo "→ evaluate both models inside the sandbox under the notarised binary"
ready_ok=true
ready_detail=""
for pair in build123d:py picogk:cs; do
  kernel=${pair%%:*}
  ext=${pair##*:}
  read -r status seconds < <(export_model "$kernel" "$CONFIG_DIR" "$MODELS/$ext/main.$ext" "$OUT/$kernel.glb")
  bytes=$(stat -f %z "$OUT/$kernel.glb" 2>/dev/null || echo 0)
  workers=$(grep -cE 'python3|dotnet' "$OUT/ps-$kernel.txt" || true)
  under_tau=$(grep -cF "(${TAU_BIN})" "$OUT/ps-$kernel.txt" || true)
  if [[ $status -ne 0 || "$bytes" -eq 0 || "$under_tau" -eq 0 ]]; then ready_ok=false; fi
  ready_detail+="$kernel export exit $status in ${seconds} s, GLB $bytes bytes, worker samples $workers, of them with the Tau.app binary as parent $under_tau; "
  tail -3 "$OUT/export-$kernel.stderr.txt" || true
done
WINDOW_END="$(stamp)"
cell ready "$($ready_ok && echo PASS || echo FAIL)" "${ready_detail}each model raises if its worker can open a socket"

# --- syspolicyd -----------------------------------------------------------------------------
echo "→ unified log for $WINDOW_START .. $WINDOW_END"
sleep 2
log_status=0
/usr/bin/log show --start "$WINDOW_START" --end "$(stamp)" --info --debug --style compact \
  --predicate 'subsystem BEGINSWITH "com.apple.syspolicy" OR process == "syspolicyd" OR process == "CoreServicesUIAgent"' \
  >"$OUT/syspolicy-log.txt" 2>&1 || log_status=$?
node "$EVIDENCE" policy "$OUT" "$TAU_APP" "$STORE" "$log_status"

# --- Quarantined copy -----------------------------------------------------------------------
echo "→ quarantined clone of the store"
mkdir -p "$Q_CONFIG"
cp -c -R "$STORE" "$Q_CONFIG/payloads"
xattr -r -w com.apple.quarantine "0081;$(printf '%x' "$(date +%s)");Safari;" "$Q_CONFIG/payloads"
q_helper=$(find "$Q_CONFIG/payloads" -type f -path '*/bin/python3*' -print -quit)
q_marked=$(xattr -p com.apple.quarantine "$q_helper")
Q_START="$(stamp)"
negative_detail="quarantine set ('$q_marked'); "
refused=0
for pair in build123d:py picogk:cs; do
  kernel=${pair%%:*}
  ext=${pair##*:}
  read -r status seconds < <(export_model "q-$kernel" "$Q_CONFIG" "$MODELS/$ext/main.$ext" "$OUT/q-$kernel.glb")
  message=$(field "$OUT/export-q-$kernel.json" message)
  [[ -n "$message" ]] || message=$(tail -1 "$OUT/export-q-$kernel.stderr.txt" 2>/dev/null || true)
  # A module-load or argument failure is not a successful quarantine refusal.
  if [[ $status -ne 0 && ! -s "$OUT/q-$kernel.glb" && "$(field "$OUT/export-q-$kernel.json" code)" == RUNTIME ]]; then
    if [[ "$message" == *"Build123d Python exited (SIGKILL)."* || "$message" == *"PicoGK C# exited (130)."* ]]; then
      refused=$((refused + 1))
    fi
  fi
  negative_detail+="$kernel exit $status in ${seconds} s, message '${message:0:300}'; "
done
sleep 2
/usr/bin/log show --start "$Q_START" --end "$(stamp)" --info --debug --style compact \
  --predicate 'subsystem BEGINSWITH "com.apple.syspolicy" OR process == "syspolicyd" OR process == "CoreServicesUIAgent"' \
  >"$OUT/syspolicy-log-quarantined.txt" 2>&1 || true
if $SIP_ENABLED; then
  cell negative "$([[ $refused -eq 2 ]] && echo PASS || echo FAIL)" "$negative_detail"
else
  cell negative UNOBSERVABLE "SIP is disabled on this host, so Gatekeeper does not enforce quarantine on the launch (ruling X19); needs a SIP-enabled Mac. Observed: $negative_detail"
fi
rm -rf "$Q_CONFIG"

# --- Golden ---------------------------------------------------------------------------------
echo "→ golden receipt"
golden_tree=$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))["darwin-arm64"].treeIntegrity)' "$GOLDEN")
golden_closure=$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))["darwin-arm64"].closureIntegrity)' "$GOLDEN")
tree=$(field "$OUT/prepare-build123d.json" treeIntegrity)
closure=$(field "$OUT/prepare-build123d.json" closureIntegrity)
verdict=FAIL
if [[ -n "$tree" && "$tree" == "$golden_tree" && "$closure" == "$golden_closure" ]]; then verdict=PASS; fi
cell golden "$verdict" "build123d treeIntegrity $tree (golden $golden_tree), closureIntegrity $closure (golden $golden_closure); picogk treeIntegrity $(field "$OUT/prepare-picogk.json" treeIntegrity), closureIntegrity $(field "$OUT/prepare-picogk.json" closureIntegrity) (no PicoGK golden is checked in)"

# The EXIT trap writes a structured report even if a prerequisite or command failed mid-run.
node "$EVIDENCE" summary "$OUT" 0
echo "✓ W12 qualification: every observable cell passed"
