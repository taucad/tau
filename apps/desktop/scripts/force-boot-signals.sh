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
#   3. Replace Home (`<user-data-dir>/home`) with a link to Tau's own filesystem-authority directory
#      beside it, and launch C. Main's bootstrap still finds a directory there, but the node host
#      refuses a root that overlaps the authority directory (`AUTHORITY_ROOT_OVERLAP`, the same
#      refusal R6 gives a picked folder), so Home cannot be admitted, configuration rejects with
#      HOME_ROOT_UNAVAILABLE and the renderer reports `file_service.start_failed` once for its
#      machine. C must mount the shell and must not reach `home-ready`. Nothing launches after C, so
#      however C's boot ends it is never reported.
#
#      Making Home unreadable (`chmod 000`) does not force it on macOS: admission only resolves the
#      path (`realpath`, which needs search permission on the parents) and arms an FSEvents watch,
#      which observes by path without opening the directory, so an unreadable Home is admitted.
#
# Run it on a disposable runner only: it deletes <user-data-dir> first, and on macOS a release build
# ignores `--user-data-dir`, so the directory must be the one the build uses
# (`~/Library/Application Support/Tau Staging` for a staging release). Block the update feed before
# running it, so B cannot install a newer build between launches. Only stages, counts and exit
# statuses are printed; the app's own output stays in <out-dir>. After B and after C it also prints,
# as counts, whether main's Sentry SDK started (its cache directory exists), how many envelopes it
# could not send (left in its offline queue) and how many times main logged that reporting failed to
# start, so a probe that finds nothing can tell an app that never sent from an ingest that dropped.
#
# Optional env vars:
#   TAU_FORCE_HOME_READY_TIMEOUT  Seconds B may take to reach `home-ready` (default: 300)
#   TAU_FORCE_SEND_SECONDS        Seconds each reporting launch keeps running to send, B after
#                                 `home-ready` and C after `shell-mounted` (default: 45)
#
# Usage:
#   apps/desktop/scripts/force-boot-signals.sh <executable> <user-data-dir> <out-dir>
#   apps/desktop/scripts/force-boot-signals.sh "$RUNNER_TEMP/app/Tau.app/Contents/MacOS/Tau" \
#     "$HOME/Library/Application Support/Tau Staging" "$RUNNER_TEMP/boot-signals"
#
# Exit codes:
#   0  Both signals were forced
#   1  A launch did not behave as the forcing needs (no ledger, A reached Home, B did not, C
#      did not mount the shell or reached Home)
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

launch_id() {
  jq -r '.last.launchId // empty' "$ledger" 2> /dev/null || true
}

unhealthy_count() {
  jq -r '.unhealthyCount // empty' "$ledger" 2> /dev/null || true
}

# `@sentry/electron` keeps its session and offline queue under `<user-data-dir>/sentry`; an envelope
# it could not send waits in `queue/` beside the queue's own `queue-v2.json`. Counts only.
sentry_state() {
  local name=$1 cache=no queued=0 failed
  if [[ -d "$user_data/sentry" ]]; then
    cache=yes
  fi
  if [[ -d "$user_data/sentry/queue" ]]; then
    queued=$(find "$user_data/sentry/queue" -type f ! -name 'queue-v2.json' | wc -l | tr -d ' ')
  fi
  failed=$(cat "$user_data"/logs/desktop*.log 2> /dev/null | grep -c 'main.error-reporting-failed' || true)
  echo "After launch $name: Sentry cache present: ${cache}; unsent envelopes queued: ${queued}; main.error-reporting-failed lines: ${failed}"
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
  if [[ -L "$user_data/home" ]]; then
    rm -f "$user_data/home"
  fi
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
launch_b=$(launch_id)
sleep "$send_seconds"
stop
pid=
reported=$(cat "$user_data"/logs/desktop*.log 2> /dev/null | grep -c 'main.boot-unhealthy' || true)
echo "Launch B logged main.boot-unhealthy ${reported} time(s)"
sentry_state B

# 3. C: Home cannot be admitted. A relative link, so it stays inside the profile.
rm -rf "${user_data:?}/home"
mkdir -p "$user_data/filesystem-authority"
ln -s filesystem-authority "$user_data/home"
launch C
started=$SECONDS
# Until the shell mounts, as long as B may take to reach Home; then the send window, counted from the mount, since
# the renderer reports only once its file service has failed.
deadline=$((SECONDS + home_ready_timeout))
reached=
mounted_after=
while ((SECONDS < deadline)); do
  # Until C writes its own record, the ledger's last launch is still B's.
  current=
  if [[ "$(launch_id)" != "$launch_b" ]]; then
    current=$(stage)
  fi
  if [[ "$current" == home-ready ]]; then
    reached=home-ready
    break
  fi
  if [[ "$current" == shell-mounted && -z "$reached" ]]; then
    reached=shell-mounted
    mounted_after=$((SECONDS - started))
    deadline=$((SECONDS + send_seconds))
  fi
  if ! kill -0 "$pid" 2> /dev/null; then
    echo '::warning::Launch C ended before its send window closed.'
    break
  fi
  sleep 1
done
current=
if [[ "$(launch_id)" != "$launch_b" ]]; then
  current=$(stage)
fi
stop
pid=
rm -f "$user_data/home"
# Counts only: the lines themselves can carry the profile's path.
failures=$(grep -c '\[FileManager\] error' "$out_dir/launch-C.log" || true)
refusals=$(cat "$out_dir/launch-C.log" "$user_data"/logs/desktop*.log 2> /dev/null | grep -c 'AUTHORITY_ROOT_OVERLAP\|HOME_ROOT_UNAVAILABLE' || true)
echo "Launch C reached stage ${current:-none} (shell mounted after ${mounted_after:-?} s); logged ${failures} file-manager failure line(s) and ${refusals} Home refusal line(s)"
sentry_state C
if [[ "$reached" == home-ready || "$current" == home-ready ]]; then
  echo '::error::Launch C reached home-ready: Home was admitted, so no file_service.start_failed was forced.'
  exit 1
fi
if [[ "$reached" != shell-mounted ]]; then
  echo '::error::Launch C never mounted the shell, so its file service never started and nothing was forced.'
  exit 1
fi
echo 'Launch C mounted the shell without Home; the staging probe counts the reports.'
