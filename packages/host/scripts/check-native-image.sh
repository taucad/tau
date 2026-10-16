#!/usr/bin/env bash
#
# Prove a native host image offline (charter W19 and W22's Docker row): it runs as a non-root user, reports build123d
# `ready` under `docker run --network none`, evaluates a build123d model to a GLB inside the native sandbox, verifies its
# store offline and cannot reach the network. It also records the refusals the sandbox gives as root and without the
# security options, and the image's size.
#
# Optional env vars:
#   SANDBOX_OPTS   `docker run` options for the sandbox (default: as in build-native-image.sh)
#
# Usage:
#   packages/host/scripts/check-native-image.sh <image> <evidence-dir>
#
# Exit codes:
#   0  Every oracle line passed
#   1  An oracle line failed (see <evidence-dir>/summary.txt)
#   2  Usage

set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <image> <evidence-dir>" >&2
  exit 2
fi
image="$1"
evidence="$2"
SANDBOX_OPTS="${SANDBOX_OPTS:---security-opt seccomp=unconfined --security-opt apparmor=unconfined --security-opt systempaths=unconfined}"
mkdir -p "$evidence"
summary="$evidence/summary.txt"
failures=0
: >"$summary"

record() {
  printf '%s\n' "$*" | tee -a "$summary"
}
check() {
  local label="$1" verdict="$2"
  shift 2
  record "$([[ "$verdict" == pass ]] && echo PASS || echo FAIL) $label: $*"
  [[ "$verdict" == pass ]] || failures=$((failures + 1))
}

# tau <label> [docker options...] -- <tau arguments...>: one offline `tau` run; stdout and stderr go to the evidence.
tau() {
  local label="$1"
  shift
  local -a options=()
  while [[ "$1" != -- ]]; do
    options+=("$1")
    shift
  done
  shift
  local code=0 start
  start=$(date +%s.%N)
  # shellcheck disable=SC2086 # SANDBOX_OPTS is a word list
  docker run --rm --network none $SANDBOX_OPTS "${options[@]}" --entrypoint node "$image" /app/dist/bin/tau.mjs "$@" \
    >"$evidence/$label.out" 2>"$evidence/$label.err" || code=$?
  printf '%s exit=%s seconds=%.1f\n' "$label" "$code" "$(echo "$(date +%s.%N) - $start" | bc)" >>"$evidence/runs.txt"
  return "$code"
}

size=$(docker image inspect "$image" --format '{{.Size}}')
record "image $image size: $size B ($(awk "BEGIN { printf \"%.2f\", $size / 1e9 }") GB)"
docker history --no-trunc --format '{{.Size}}\t{{.CreatedBy}}' "$image" | cut -c1-160 >"$evidence/history.txt"
head -n 12 "$evidence/history.txt" | sed 's/^/  layer /' | tee -a "$summary"

user=$(docker image inspect "$image" --format '{{.Config.User}}')
uid=$(docker run --rm --network none --entrypoint id "$image" -u)
[[ "$user" == tau && "$uid" == 1001 ]] && verdict=pass || verdict=fail
check 'default user is not root' "$verdict" "Config.User=$user, id -u=$uid"

verdict=fail
if tau inspect -- prepare --inspect --json; then
  build123d=$(node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const c=r.closures.find((x)=>x.package==="@taucad/build123d");console.log(c?.state)' "$evidence/inspect.out")
  picogk=$(node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const c=r.closures.find((x)=>x.package==="@taucad/picogk");console.log(c?.state)' "$evidence/inspect.out")
  [[ "$build123d" == ready ]] && verdict=pass
fi
check 'prepare --inspect under --network none' "$verdict" "build123d=${build123d:-?} picogk=${picogk:-?} (PicoGK ships darwin-arm64 only)"

verdict=fail
tau prepare -- prepare build123d --json && grep -q '"status":"ready"' "$evidence/prepare.out" && verdict=pass
check 'prepare build123d (no fetch)' "$verdict" "$(head -c 300 "$evidence/prepare.out")"

workspace="$evidence/workspace"
mkdir -p "$workspace"
cat >"$workspace/main.py" <<'PY'
from dataclasses import dataclass

from build123d import Box


@dataclass(frozen=True)
class Params:
    width: float = 10.0


def main(params: Params):
    return Box(params.width, 20, 30)
PY
chmod 0777 "$workspace"
verdict=fail
if tau export --volume "$workspace:/workspace" --workdir /workspace -- export main.py --ext=glb --output=/workspace/main.glb --json; then
  [[ -s "$workspace/main.glb" ]] && head -c 4 "$workspace/main.glb" | grep -q glTF && verdict=pass
fi
check 'export main.py to GLB in the sandbox' "$verdict" "$(tail -c 300 "$evidence/export.out") $(tail -c 300 "$evidence/export.err" | tr '\n' ' ')"

verdict=fail
tau verify -- prepare build123d --verify --offline --json && grep -q '"intact"' "$evidence/verify.out" && verdict=pass
check 'prepare build123d --verify --offline' "$verdict" "$(head -c 300 "$evidence/verify.out")"

probe=$(docker run --rm --network none --entrypoint node "$image" -e \
  "fetch('https://pypi.org/simple/').then((r)=>console.log('reached',r.status),(e)=>console.log('no network:',e.cause?.code??e.message))")
[[ "$probe" == no\ network:* ]] && verdict=pass || verdict=fail
check 'no network in the container' "$verdict" "$probe"

# Recorded, not gated: the refusals the sandbox gives as root and under Docker's defaults.
code=0
tau export-root --user 0 --volume "$workspace:/workspace" --workdir /workspace -- export main.py --ext=glb --output=/workspace/root.glb --json || code=$?
record "INFO export as root: exit=$code $(grep -o 'apply-seccomp[^"]*' "$evidence/export-root."{out,err} | head -n 1)"
code=0
docker run --rm --network none --volume "$workspace:/workspace" --workdir /workspace --entrypoint node "$image" \
  /app/dist/bin/tau.mjs export main.py --ext=glb --output=/workspace/default.glb --json \
  >"$evidence/export-default.out" 2>"$evidence/export-default.err" || code=$?
record "INFO export under Docker's default security options: exit=$code $(tail -c 240 "$evidence/export-default.out" | tr '\n' ' ')"

cat "$evidence/runs.txt" | sed 's/^/  run /' | tee -a "$summary"
record "verdict: $([[ $failures -eq 0 ]] && echo pass || echo "fail ($failures)")"
[[ $failures -eq 0 ]]
