#!/usr/bin/env bash
#
# Prove the managed seed round trip and the offline audit for one native kernel (charter D25, D26, W19; spike S26).
#
# Machine A prepares the kernel from its manifest's origins and exports a seed bundle with `tau prepare --bundle`.
# Machine B is a second store run inside a network namespace with no route out (`unshare --net`, loopback only): it
# checks the bundle with `--verify-seed`, prepares from it with `--seed` under `TAU_ACQUISITION=locked`, and audits the
# closure with `--audit`. B's receipt must equal A's (closure and tree identity and every file row), and every step on
# B must pass with the network denied. A tampered copy of the bundle must be refused by `--verify-seed`.
#
# Required: Linux, passwordless sudo (for unshare), util-linux `setpriv`, iproute2, the Linux sandbox prerequisites
#   (.github/actions/setup-linux-sandbox) and the workspace installed.
#
# Usage:
#   packages/cli/scripts/seed-round-trip.sh <kernel> <work-dir> <evidence-dir>
#
# Exit codes: 0 every check passed, 1 a check failed, 2 usage.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

if [[ $# -ne 3 ]]; then
  echo "Usage: $0 <kernel> <work-dir> <evidence-dir>" >&2
  exit 2
fi
kernel="$1"
work="$2"
evidence="$3"
mkdir -p "$work" "$evidence"
summary="$evidence/summary.txt"
: >"$summary"
failures=0

record() {
  local verdict="$1"
  shift
  echo "$verdict $*" | tee -a "$summary"
  [[ "$verdict" == PASS ]] || failures=$((failures + 1))
}

tau_cli=(node --import tsx "$REPO_ROOT/packages/cli/src/bin.ts")

# run_a <label> -- <tau arguments>: machine A, with the network.
run_a() {
  local label="$1"
  shift 2
  local code=0
  (cd "$REPO_ROOT" && env TAU_CONFIG_DIR="$work/a" "${tau_cli[@]}" "$@") \
    >"$evidence/$label.out" 2>"$evidence/$label.err" || code=$?
  echo "$code"
}

# run_b <label> -- <command>: machine B, in a fresh network namespace with only loopback up, as this user.
run_b() {
  local label="$1"
  shift 2
  local code=0
  sudo --preserve-env=PATH,HOME unshare --net -- bash -c '
    ip link set lo up
    exec setpriv --reuid="$1" --regid="$2" --init-groups -- "${@:3}"
  ' bash "$(id -u)" "$(id -g)" env -u HTTPS_PROXY -u HTTP_PROXY -u https_proxy -u http_proxy \
    TAU_CONFIG_DIR="$work/b" TAU_ACQUISITION=locked "$@" \
    >"$evidence/$label.out" 2>"$evidence/$label.err" || code=$?
  echo "$code"
}

# --- A: online prepare and export -------------------------------------------------------------------------------
code=$(run_a a-bundle -- prepare "$kernel" --bundle "$work/bundle" --json)
[[ "$code" == 0 ]] && record PASS "A: tau prepare $kernel --bundle exit 0" ||
  record FAIL "A: tau prepare $kernel --bundle exit $code: $(tail -c 600 "$evidence/a-bundle.err")"
du -sb "$work/bundle" | tee "$evidence/bundle-size.txt"
code=$(run_a a-audit -- prepare --audit --json)
[[ "$code" == 0 ]] && record PASS "A: tau prepare --audit exit 0" ||
  record FAIL "A: tau prepare --audit exit $code: $(head -c 1200 "$evidence/a-audit.out")"

# --- B: no network --------------------------------------------------------------------------------------------
code=$(run_b b-network-probe -- node -e "
  fetch('https://pypi.org/simple/').then(
    () => { console.log('reachable'); process.exit(1); },
    (error) => console.log('no network:', error.cause?.code ?? error.message),
  );")
[[ "$code" == 0 ]] && record PASS "B: network denied ($(cat "$evidence/b-network-probe.out"))" ||
  record FAIL "B: the namespace reached the network: $(cat "$evidence/b-network-probe.out" "$evidence/b-network-probe.err")"
code=$(run_b b-verify-seed -- "${tau_cli[@]}" prepare --verify-seed "$work/bundle" --json)
[[ "$code" == 0 ]] && record PASS "B: tau prepare --verify-seed exit 0" ||
  record FAIL "B: tau prepare --verify-seed exit $code: $(head -c 1200 "$evidence/b-verify-seed.out")"
code=$(run_b b-seed -- "${tau_cli[@]}" prepare --seed "$work/bundle" --json)
[[ "$code" == 0 ]] && record PASS "B: tau prepare --seed exit 0" ||
  record FAIL "B: tau prepare --seed exit $code: $(tail -c 800 "$evidence/b-seed.out" "$evidence/b-seed.err")"
code=$(run_b b-audit -- "${tau_cli[@]}" prepare --audit --json)
[[ "$code" == 0 ]] && record PASS "B: tau prepare --audit exit 0" ||
  record FAIL "B: tau prepare --audit exit $code: $(head -c 1200 "$evidence/b-audit.out")"

# --- Identical receipts (S26) ---------------------------------------------------------------------------------
if node --input-type=module - "$work/a/payloads" "$work/b/payloads" >"$evidence/receipts.json" <<'NODE'; then
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const receipts = (store) => {
  const root = join(store, 'closures', 'sha256');
  return readdirSync(root).map((hex) => JSON.parse(readFileSync(join(root, hex, 'receipt.json'), 'utf8')));
};
const identity = ({ package: name, dependency, target, closureIntegrity, treeIntegrity, files, tauVersion }) =>
  JSON.stringify({ name, dependency, target, closureIntegrity, treeIntegrity, files, tauVersion });
const [a, b] = [receipts(process.argv[2]), receipts(process.argv[3])];
const rows = a.map((receipt) => {
  const other = b.find((candidate) => candidate.closureIntegrity === receipt.closureIntegrity);
  return {
    package: receipt.package,
    dependency: receipt.dependency,
    closureIntegrity: receipt.closureIntegrity,
    treeIntegrity: receipt.treeIntegrity,
    files: receipt.files.length,
    identical: other !== undefined && identity(other) === identity(receipt),
    acquiredFrom: [...new Set((other?.payloads ?? []).map(({ acquiredFrom }) => acquiredFrom.kind))],
  };
});
console.log(JSON.stringify({ a: a.length, b: b.length, rows }, undefined, 2));
process.exit(a.length > 0 && a.length === b.length && rows.every((row) => row.identical) ? 0 : 1);
NODE
  record PASS "S26: receipts identical: $(tr -d '\n ' <"$evidence/receipts.json" | head -c 700)"
else
  record FAIL "S26: receipts differ: $(tr -d '\n ' <"$evidence/receipts.json" | head -c 700)"
fi

# --- A tampered bundle is refused -----------------------------------------------------------------------------
cp -r "$work/bundle" "$work/tampered"
victim=$(find "$work/tampered/blobs/sha256" -type f | sort | head -1)
printf '\0' | dd of="$victim" bs=1 seek=0 count=1 conv=notrunc status=none
code=$(run_b b-verify-tampered -- "${tau_cli[@]}" prepare --verify-seed "$work/tampered" --json)
if [[ "$code" == 3 ]] && grep -q "$(basename "$victim")" "$evidence/b-verify-tampered.out"; then
  record PASS "B: a tampered blob is refused (exit 3, names $(basename "$victim"))"
else
  record FAIL "B: tampered bundle exit $code: $(head -c 800 "$evidence/b-verify-tampered.out")"
fi

echo "failures: $failures" | tee -a "$summary"
[[ "$failures" == 0 ]]
