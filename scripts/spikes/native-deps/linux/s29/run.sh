#!/usr/bin/env bash
# Purpose: Spike S29 (native-dependency-resolution charter): a static `python -m http.server` directory is a complete
#   payload mirror under TAU_PAYLOAD_MIRROR + no-fallback (zero non-mirror requests, G5 receipts), and an image with a
#   baked store answers `ready` under `docker run --network none`. Spike code only; nothing ships.
# Usage:
#   scripts/spikes/native-deps/linux/s29/run.sh mirror <work-dir> <evidence-dir> <baked-config-dir>
#   scripts/spikes/native-deps/linux/s29/run.sh image  <work-dir> <evidence-dir> <baked-config-dir>
# Environment: Linux with the Tau workspace installed, the Linux sandbox prerequisites, python3; `image` needs Docker.
#   <baked-config-dir> must be /config for `image`, because the baked store is used at the path it was sealed at.
# Exit codes: 0 phases ran (verdicts are in the evidence), 1 a phase could not run, 2 usage.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd)"
SPIKE_DIR="$REPO_ROOT/scripts/spikes/native-deps/linux/s29"
GUARD_URL="file://$REPO_ROOT/scripts/spikes/native-deps/linux/fetch-guard.ts"

if [[ $# -ne 4 ]]; then
  echo "Usage: $0 mirror|image <work-dir> <evidence-dir> <baked-config-dir>" >&2
  exit 2
fi
phase="$1"
work="$2"
evidence="$3"
baked="$4"
mkdir -p "$work" "$evidence" "$baked"

# run_tau <label> [NAME=value ...] -- <tau arguments>: `tau` from source with the fetch guard; records exit code and
# wall time, never fails the script.
run_tau() {
  local label="$1"
  shift
  local -a assignments=()
  while [[ "$1" != -- ]]; do
    assignments+=("$1")
    shift
  done
  shift
  local start end code=0
  start=$(date +%s.%N)
  (cd "$REPO_ROOT" && env "${assignments[@]}" NODE_OPTIONS="--import=$GUARD_URL" \
    node --import tsx "$REPO_ROOT/packages/cli/src/bin.ts" "$@") >"$evidence/$label.out" 2>"$evidence/$label.err" || code=$?
  end=$(date +%s.%N)
  echo "{\"label\":\"$label\",\"exit\":$code,\"seconds\":$(echo "$end - $start" | bc)}" | tee -a "$evidence/runs.jsonl"
}

serve_mirror() {
  local dir="$1" port="$2" log="$3"
  python3 -m http.server "$port" --bind 127.0.0.1 --directory "$dir" >"$log" 2>&1 &
  echo $! >"$work/http-$port.pid"
  for _ in $(seq 1 50); do
    curl -fsS -o /dev/null "http://127.0.0.1:$port/" && return 0
    sleep 0.2
  done
  echo "mirror on $port did not start" >&2
  return 1
}

# Every variable that makes a non-loopback request fail (S7: the switch plus a dead proxy), loopback exempt (S7 F1).
offline_proxy=(HTTPS_PROXY=http://127.0.0.1:9 HTTP_PROXY=http://127.0.0.1:9 NO_PROXY=127.0.0.1,localhost NODE_USE_ENV_PROXY=1)

case "$phase" in
  mirror)
    # A: online prepare from the manifest's own origins, every origin recorded.
    run_tau a-prepare TAU_CONFIG_DIR="$work/a" SPIKE_FETCH_LOG="$evidence/a-fetch.jsonl" -- prepare build123d --json
    node "$SPIKE_DIR/receipts.ts" tally "$evidence/a-fetch.jsonl" >"$evidence/a-tally.json"

    # The mirror: a plain directory of the URL-origin blobs the online receipts name.
    node "$SPIKE_DIR/receipts.ts" mirror "$work/a/payloads" "$work/mirror" | tee "$evidence/mirror.json"
    du -sb "$work/mirror" | tee "$evidence/mirror-size.txt"
    serve_mirror "$work/mirror" 8729 "$evidence/mirror-http.log"

    # B: no-fallback prepare from the mirror; every other origin throws, and a dead proxy catches anything else.
    mirror_b=("${offline_proxy[@]}" TAU_CONFIG_DIR="$baked" TAU_PAYLOAD_MIRROR=http://127.0.0.1:8729/
      TAU_PAYLOAD_MIRROR_NO_FALLBACK=1 SPIKE_ALLOWED_ORIGINS=http://127.0.0.1:8729 SPIKE_FETCH_LOG="$evidence/b-fetch.jsonl")
    run_tau b-inspect-before "${mirror_b[@]}" -- prepare --inspect --json
    run_tau b-prepare "${mirror_b[@]}" -- prepare build123d --json
    run_tau b-inspect-after "${mirror_b[@]}" -- prepare --inspect --json
    node "$SPIKE_DIR/receipts.ts" tally "$evidence/b-fetch.jsonl" http://127.0.0.1:8729 >"$evidence/b-tally.json"
    node "$SPIKE_DIR/receipts.ts" compare "$work/a/payloads" "$baked/payloads" >"$evidence/g5-compare.json"
    grep -c '"GET ' "$evidence/mirror-http.log" >"$evidence/mirror-http-gets.txt" || true
    grep -c '" 200 ' "$evidence/mirror-http.log" >"$evidence/mirror-http-200.txt" || true

    # N: the same with one blob missing from the mirror: a typed refusal, still zero non-mirror requests.
    node "$SPIKE_DIR/receipts.ts" mirror "$work/a/payloads" "$work/mirror-n" --omit 0 | tee "$evidence/mirror-n.json"
    serve_mirror "$work/mirror-n" 8730 "$evidence/mirror-n-http.log"
    run_tau n-prepare "${offline_proxy[@]}" TAU_CONFIG_DIR="$work/n" TAU_PAYLOAD_MIRROR=http://127.0.0.1:8730/ \
      TAU_PAYLOAD_MIRROR_NO_FALLBACK=1 SPIKE_ALLOWED_ORIGINS=http://127.0.0.1:8730 SPIKE_FETCH_LOG="$evidence/n-fetch.jsonl" \
      -- prepare build123d --json
    node "$SPIKE_DIR/receipts.ts" tally "$evidence/n-fetch.jsonl" http://127.0.0.1:8730 >"$evidence/n-tally.json"
    kill "$(cat "$work/http-8729.pid")" "$(cat "$work/http-8730.pid")" || true
    ;;
  image)
    [[ "$baked" == /config ]] || { echo "image needs the store baked at /config" >&2; exit 2; }
    # No W19 seed stage exists yet: the smallest throwaway image that has the shape (pruned CLI + baked store).
    (cd "$REPO_ROOT" && pnpm nx build cli --outputStyle=static) >"$evidence/image-build-cli.log" 2>&1
    rm -rf "$work/image"
    mkdir -p "$work/image"
    (cd "$REPO_ROOT" && pnpm --filter=@taucad/cli --prod deploy "$work/image/app" --legacy) >"$evidence/image-deploy.log" 2>&1
    cp -a "$baked" "$work/image/config"
    cat >"$work/image/Dockerfile" <<'DOCKER'
FROM node:24-slim
# X6: the OCP extension links libGL.so.1 and libX11.so.6.
RUN apt-get update && apt-get install --yes --no-install-recommends libgl1 libx11-6 && rm -rf /var/lib/apt/lists/*
COPY app /app
COPY config /config
ENV TAU_CONFIG_DIR=/config TAU_ACQUISITION=locked NODE_ENV=production
ENTRYPOINT ["node", "/app/dist/bin/tau.mjs"]
DOCKER
    docker build -t tau-s29-seed "$work/image" >"$evidence/image-docker-build.log" 2>&1
    docker image inspect tau-s29-seed --format '{{.Size}} {{.Id}}' | tee "$evidence/image-size.txt"
    docker image inspect node:24-slim --format '{{index .RepoDigests 0}}' | tee "$evidence/image-base.txt"
    du -sb "$work/image/app" "$work/image/config" | tee "$evidence/image-layers.txt"
    for step in "image-inspect prepare --inspect --json" "image-prepare prepare build123d --json" "image-verify prepare build123d --verify --offline --json"; do
      read -r label args <<<"$step"
      code=0
      start=$(date +%s.%N)
      # shellcheck disable=SC2086 # word splitting of the step's arguments is intended
      docker run --rm --network none tau-s29-seed $args >"$evidence/$label.out" 2>"$evidence/$label.err" || code=$?
      echo "{\"label\":\"$label\",\"exit\":$code,\"seconds\":$(echo "$(date +%s.%N) - $start" | bc)}" | tee -a "$evidence/runs.jsonl"
    done
    docker run --rm --network none --entrypoint node tau-s29-seed -e \
      "fetch('https://pypi.org/simple/').then(r=>console.log('reached',r.status),e=>console.log('no network:',e.cause?.code??e.message))" \
      | tee "$evidence/image-network-probe.txt"
    ;;
  *)
    echo "Usage: $0 mirror|image <work-dir> <evidence-dir> <baked-config-dir>" >&2
    exit 2
    ;;
esac
