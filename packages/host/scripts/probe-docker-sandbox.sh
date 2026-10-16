#!/usr/bin/env bash
#
# Record which `docker run` options let Tau's Linux native sandbox start inside a container.
#
# The sandbox is bubblewrap with a new user and PID namespace, a fresh /proc and dropped capabilities, and inside it
# `apply-seccomp` (from @anthropic-ai/sandbox-runtime) unshares a nested user namespace and maps its own uid. The probe
# runs that same shape (`unshare --user --map-current-user` stands in for apply-seccomp) in a small Debian image, as
# uid 1001 and as root, under each set of options, with the host's Ubuntu 24.04 user-namespace restriction on and
# off, and also inside a `docker build` step. It leaves the restriction off, as the native image needs.
#
# Usage:
#   packages/host/scripts/probe-docker-sandbox.sh <evidence-dir>
#
# Exit codes:
#   0  Probe recorded (the verdicts are in <evidence-dir>/probe.txt)
#   2  Usage
#   3  Missing dependency

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <evidence-dir>" >&2
  exit 2
fi
command -v docker >/dev/null || { echo "ERROR: docker is required" >&2; exit 3; }
evidence="$1"
mkdir -p "$evidence"
out="$evidence/probe.txt"
: >"$out"

sandbox='bwrap --ro-bind / / --dev /dev --unshare-pid --unshare-user --cap-drop ALL --proc /proc -- unshare --user --map-current-user true'
docker build --quiet --tag tau-sandbox-probe - >/dev/null <<DOCKER
FROM debian:trixie-slim
RUN apt-get update && apt-get install --yes --no-install-recommends bubblewrap util-linux && rm -rf /var/lib/apt/lists/* && \
    useradd --uid 1001 --create-home tau
USER tau
DOCKER

restriction=kernel.apparmor_restrict_unprivileged_userns
declare -a option_sets=(
  ''
  '--security-opt seccomp=unconfined'
  '--security-opt seccomp=unconfined --security-opt apparmor=unconfined'
  '--security-opt seccomp=unconfined --security-opt apparmor=unconfined --security-opt systempaths=unconfined'
  '--security-opt apparmor=unconfined --security-opt systempaths=unconfined'
  '--privileged'
)
for value in 1 0; do
  if sysctl -n "$restriction" >/dev/null 2>&1; then
    sudo sysctl -q -w "$restriction=$value"
  fi
  for user in 1001 0; do
    for options in "${option_sets[@]}"; do
      code=0
      # shellcheck disable=SC2086 # the option set is a word list
      message=$(docker run --rm --network none --user "$user" $options tau-sandbox-probe sh -c "$sandbox" 2>&1) || code=$?
      printf 'restrict_userns=%s user=%s options=[%s] -> %s %s\n' "$value" "$user" "$options" \
        "$([[ $code -eq 0 ]] && echo PASS || echo "FAIL($code)")" "$(printf '%s' "$message" | tr '\n' ' ' | cut -c1-160)" | tee -a "$out"
    done
  done
done

code=0
message=$(docker build --no-cache --progress=plain - 2>&1 <<DOCKER
FROM tau-sandbox-probe
RUN $sandbox
DOCKER
) || code=$?
printf 'docker build RUN as uid 1001 -> %s %s\n' "$([[ $code -eq 0 ]] && echo PASS || echo "FAIL($code)")" \
  "$(printf '%s' "$message" | grep -iE 'bwrap|unshare|error' | tr '\n' ' ' | cut -c1-200)" | tee -a "$out"
