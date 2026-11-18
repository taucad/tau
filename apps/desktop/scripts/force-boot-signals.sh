#!/usr/bin/env bash
#
# Force the two desktop boot signals T-R9.3 looks for, once each, from a built Tau desktop app.
#
# Desktop resilient startup blueprint, R9 and D5: `desktop-boot-unhealthy` (main process) and
# `file_service.start_failed` (renderer, sent to main over IPC and filed by main in `tau-desktop`).
# The staging probe (`apps/ui-e2e/src/observability.staging.test.ts`, T-R9.3) then asserts each
# arrived exactly once for the release. The script adds no code path to the app; it only arranges
# the profile and the launches, as a person's machine would:
#
#   1. Launch A over an empty profile and SIGKILL it as soon as its boot-health ledger records a
#      stage before `home-ready`: a launch with no clean end, which the ledger counts unhealthy.
#   2. Launch B over the same profile. It reads A's record and reports `desktop-boot-unhealthy`
#      once. It must reach `home-ready`, so no later launch counts B unhealthy too, then quits.
#   3. Make Home (`<user-data-dir>/home`) unreadable and launch C. The file service cannot admit
#      Home, configuration rejects with HOME_ROOT_UNAVAILABLE and the renderer reports
#      `file_service.start_failed` once for its machine. Nothing launches after C, so however C's
#      boot ends it is never reported.
#
# Run it on a disposable runner only: it deletes <user-data-dir> first, and on macOS a release build
# ignores `--user-data-dir`, so the directory must be the one the build uses
# (`~/Library/Application Support/Tau Staging` for a staging release). Block the update feed before
# running it, so B cannot install a newer build between launches. Only stages, counts and exit
# statuses are printed; the app's own output stays in <out-dir>.
#
# Optional env vars:
#   TAU_FORCE_HOME_READY_TIMEOUT  Seconds B may take to reach `home-ready` (default: 300)
#   TAU_FORCE_SEND_SECONDS        Seconds each reporting launch keeps running to send (default: 45)
#
# Usage:
#   apps/desktop/scripts/force-boot-signals.sh <executable> <user-data-dir> <out-dir>
#   apps/desktop/scripts/force-boot-signals.sh "$RUNNER_TEMP/app/Tau.app/Contents/MacOS/Tau" \
#     "$HOME/Library/Application Support/Tau Staging" "$RUNNER_TEMP/boot-signals"
#
# Exit codes:
#   0  Both signals were forced
#   1  A launch did not behave as the forcing needs (no ledger, A reached Home, B did not)
#   2  Bad arguments
#   3  Missing dependency (jq)

set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Usage: $0 <executable> <user-data-dir> <out-dir>" >&2
  exit 2
fi
executable=$1
user_data=$2
out_dir=$3
if [[ ! -x "$executable" ]]; then
  echo "Not an executable: $executable" >&2
  exit 2
fi
if [[ -z "$user_data" || "$user_data" == "/" || "$user_data" == "$HOME" ]]; then
  echo "Refusing user data directory: $user_data" >&2
  exit 2
fi
if ! command -v jq > /dev/null; then
  echo 'jq is required' >&2
  exit 3
fi

home_ready_timeout=${TAU_FORCE_HOME_READY_TIMEOUT:-300}
send_seconds=${TAU_FORCE_SEND_SECONDS:-45}
ledger="$user_data/boot-health.json"
# Helpers live under the bundle's Contents on macOS and beside the executable elsewhere.
if [[ "$executable" == */Contents/MacOS/* ]]; then
  app_root=${executable%/MacOS/*}
else
  app_root=$(dirname "$executable")
fi

mkdir -p "$out_dir"
pid=

stage() {
  jq -r '.last.stage // empty' "$ledger" 2> /dev/null || true
}

unhealthy_count() {
  jq -r '.unhealthyCount // empty' "$ledger" 2> /dev/null || true
}

launch() {
  local name=$1
  # Chromium's own log goes to the launch's file, for the counts below.
  "$executable" --enable-logging=stderr > "$out_dir/launch-$name.log" 2>&1 &
  pid=$!
  echo "Launch $name started"
}

kill_tree() {
  kill -KILL "$pid" 2> /dev/null || true
  # Chromium's helpers (`--type=renderer`, `--type=utility`, ...); never this script, whose arguments name the app.
  pkill -KILL -f "${app_root}.*--type=" 2> /dev/null || true
  wait "$pid" 2> /dev/null || true
}

stop() {
  local waited=0
  kill -TERM "$pid" 2> /dev/null || true
  while kill -0 "$pid" 2> /dev/null && ((waited < 30)); do
    sleep 1
    waited=$((waited + 1))
  done
  kill_tree
}

cleanup() {
  if [[ -n "$pid" ]]; then
    kill_tree
  fi
  chmod 700 "$user_data/home" 2> /dev/null || true
}
trap cleanup EXIT

rm -rf "$user_data"

# 1. A: killed before `home-ready`.
launch A
deadline=$((SECONDS + 120))
while :; do
  current=$(stage)
  if [[ -n "$current" ]]; then
    break
  fi
  if ! kill -0 "$pid" 2> /dev/null || ((SECONDS >= deadline)); then
    echo '::error::Launch A wrote no boot-health ledger; this build predates boot health (WP6) or did not start.'
    exit 1
  fi
  sleep 0.1
done
kill_tree
pid=
if [[ "$current" == home-ready ]]; then
  echo '::error::Launch A reached home-ready before it could be killed; it is not an unhealthy launch.'
  exit 1
fi
echo "Launch A killed at stage $current"

# 2. B: reports A, reaches `home-ready`, quits.
launch B
deadline=$((SECONDS + home_ready_timeout))
count=
while [[ "$(stage)" != home-ready ]]; do
  if [[ -z "$count" ]]; then
    count=$(unhealthy_count)
  fi
  if ! kill -0 "$pid" 2> /dev/null || ((SECONDS >= deadline)); then
    echo "::error::Launch B did not reach home-ready (stage $(stage)); a later launch would count it unhealthy too."
    exit 1
  fi
  sleep 1
done
echo "Launch B reached home-ready (unhealthy count at start: ${count:-unknown})"
sleep "$send_seconds"
stop
pid=
reported=$(cat "$user_data"/logs/desktop*.log 2> /dev/null | grep -c 'main.boot-unhealthy' || true)
echo "Launch B logged main.boot-unhealthy ${reported} time(s)"

# 3. C: Home cannot be admitted.
chmod 000 "$user_data/home"
launch C
sleep "$send_seconds"
if ! kill -0 "$pid" 2> /dev/null; then
  echo '::warning::Launch C ended before its send window closed.'
fi
stop
pid=
chmod 700 "$user_data/home"
failures=$(grep -c '\[FileManager\] error' "$out_dir/launch-C.log" || true)
echo "Launch C logged ${failures} file-manager failure line(s); the staging probe counts the reports."
