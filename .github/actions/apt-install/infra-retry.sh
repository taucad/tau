#!/usr/bin/env bash
#
# Run one infrastructure setup command (a download, a browser install) with a bounded number of attempts and
# backoff, and record every retry as a job-level event the CI health report can count.
#
# An infrastructure step retries three times with backoff, and each retry is an event (taucad/tau#2792). This is
# for setup steps only, never a test, a task or a job. A command that fails every attempt fails the step.
#
# Each failed attempt that is retried writes one warning annotation, and a step that runs out of attempts writes
# one error annotation, both titled `infra-retry` with a stable message shape (parsed by `infraRetryEvents` in
# `scripts/src/ci-queue-health.ts`):
#
#   ::warning title=infra-retry::<step> attempt <n> of <attempts> failed: <signature>; retrying in <s>s
#   ::error title=infra-retry::<step> failed after <attempts> attempts: <signature>
#
# The signature is a fixed word from the attempt's exit status and output (see `infra_signature`), so the same
# outage counts as the same event wherever it happens. apt-install.sh sources this file for the same annotations;
# it lives beside it so that jobs which side-load the installer at `.tau-ci` carry it too.
#
# Optional env vars:
#   INFRA_RETRY_ATTEMPTS        Attempts before the step fails (default: 3)
#   INFRA_RETRY_BACKOFF         Seconds to wait before each retry, space-separated; the last repeats (default: "10 30")
#   INFRA_RETRY_ATTEMPT_SECONDS Deadline for one attempt, after which its process group is stopped (default: 0, none;
#                               needs perl, and is not applied on Windows)
#
# Usage:
#   infra-retry.sh <step> <command> [arguments...]
#   e.g. infra-retry.sh pnpm-install pnpm install --frozen-lockfile
#
# Exit codes:
#   0  The command succeeded on some attempt
#   1  Bad arguments
#   *  The last attempt's exit status, after every attempt failed

# The stable signature of a failed attempt, from its exit status and the file holding its output.
infra_signature() {
  local status="$1" log="$2"
  if [ "$status" -eq 124 ] || [ "$status" -eq 137 ]; then
    echo timeout
  elif grep -qE "dpkg was interrupted" "$log" 2>/dev/null; then
    echo dpkg-interrupted
  elif grep -qE "Could not get lock|Unable to acquire the dpkg frontend lock" "$log" 2>/dev/null; then
    echo dpkg-lock
  elif grep -qE "Hash Sum mismatch|checksum mismatch|integrity checksum failed|EINTEGRITY" "$log" 2>/dev/null; then
    echo checksum-mismatch
  elif grep -qiE "Temporary failure resolving|Could not resolve|ENOTFOUND|EAI_AGAIN|getaddrinfo" "$log" 2>/dev/null; then
    echo dns
  elif grep -qiE "ECONNRESET|socket hang up|Connection reset|TypeError: terminated|unexpected EOF" "$log" 2>/dev/null; then
    echo connection-reset
  elif grep -qiE "Could not connect|Connection failed|connection timed out|ETIMEDOUT|ECONNREFUSED|Connection refused|Could not wait for server fd|Failed to connect" "$log" 2>/dev/null; then
    echo connection-failed
  elif grep -qiE "\b50[0-9] (Internal|Bad Gateway|Service Unavailable|Gateway Time)|status code:? (50[0-9]|429)|HTTP( error)? (50[0-9]|429)|\b429 Too Many" "$log" 2>/dev/null; then
    echo http-server-error
  elif grep -qiE "Failed to fetch|Download failed|Failed to download|failed to download|E: Unable to fetch" "$log" 2>/dev/null; then
    echo download-failed
  else
    echo "exit-$status"
  fi
}

# The job-level event for a failed attempt that will be retried.
infra_retry_event() {
  local step="$1" attempt="$2" attempts="$3" signature="$4" wait="$5"
  echo "::warning title=infra-retry::$step attempt $attempt of $attempts failed: $signature; retrying in ${wait}s"
}

# The job-level event for a step that failed every attempt.
infra_retry_exhausted() {
  local step="$1" attempts="$2" signature="$3"
  echo "::error title=infra-retry::$step failed after $attempts attempts: $signature" >&2
}

# The wait before retry number $1 (1-based) from a space-separated backoff list whose last value repeats.
infra_retry_wait() {
  local index="$1" list=()
  read -r -a list <<<"$2"
  [ ${#list[@]} -gt 0 ] || list=(0)
  if [ "$index" -gt ${#list[@]} ]; then index=${#list[@]}; fi
  echo "${list[$((index - 1))]}"
}

# Run "$@", stopping its process group after $INFRA_RETRY_ATTEMPT_SECONDS (exit 124) when that is set.
infra_retry_bounded() {
  local seconds="${INFRA_RETRY_ATTEMPT_SECONDS:-0}"
  if [ "$seconds" = 0 ] || [ "${RUNNER_OS:-}" = Windows ] || ! command -v perl >/dev/null; then
    "$@"
    return
  fi
  perl -e '
    my $seconds = shift;
    my $pid = fork() // die "fork: $!";
    if ($pid == 0) { setpgrp(0, 0); exec { $ARGV[0] } @ARGV or die "exec: $!"; }
    local $SIG{ALRM} = sub {
      print STDERR "no result after ${seconds}s; stopping this attempt\n";
      kill "TERM", -$pid; sleep 10; kill "KILL", -$pid; waitpid($pid, 0); exit 124;
    };
    alarm $seconds;
    waitpid($pid, 0);
    exit($? & 127 ? 128 + ($? & 127) : $? >> 8);
  ' "$seconds" "$@"
}

infra_retry_main() {
  set -uo pipefail
  if [ $# -lt 2 ]; then
    echo "::error::usage: infra-retry.sh <step> <command> [arguments...]" >&2
    return 1
  fi
  local step="$1"
  shift
  local attempts="${INFRA_RETRY_ATTEMPTS:-3}" backoff="${INFRA_RETRY_BACKOFF:-10 30}"
  [[ "$attempts" =~ ^[1-9][0-9]*$ ]] || { echo "::error::INFRA_RETRY_ATTEMPTS must be a positive integer" >&2; return 1; }
  [[ "$backoff" =~ ^[0-9\ ]*$ ]] || { echo "::error::INFRA_RETRY_BACKOFF must be whole seconds" >&2; return 1; }
  [[ "${INFRA_RETRY_ATTEMPT_SECONDS:-0}" =~ ^[0-9]+$ ]] ||
    { echo "::error::INFRA_RETRY_ATTEMPT_SECONDS must be a whole number" >&2; return 1; }

  local log attempt=1 status signature wait
  log=$(mktemp -t infra-retry.XXXXXX)
  while :; do
    infra_retry_bounded "$@" 2>&1 | tee "$log"
    status=${PIPESTATUS[0]}
    if [ "$status" -eq 0 ]; then
      rm -f "$log"
      return 0
    fi
    signature=$(infra_signature "$status" "$log")
    if [ "$attempt" -ge "$attempts" ]; then
      infra_retry_exhausted "$step" "$attempts" "$signature"
      rm -f "$log"
      return "$status"
    fi
    wait=$(infra_retry_wait "$attempt" "$backoff")
    infra_retry_event "$step" "$attempt" "$attempts" "$signature" "$wait"
    sleep "$wait"
    attempt=$((attempt + 1))
  done
}

# Sourced (apt-install.sh) it only defines the functions; run, it retries its command.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  infra_retry_main "$@"
  exit
fi
