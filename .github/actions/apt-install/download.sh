#!/usr/bin/env bash
#
# Download one pinned file on a CI runner so that a DNS or origin blip costs retries, not a job.
#
# Every `curl` that fetches a file in Tau's workflows and composite actions goes through this script
# (scripts/src/pinned-download.test.ts pins it). A name-resolution failure lasts longer than curl's own `--retry`
# (which never retries exit 6, "Could not resolve host") or a 10 s + 30 s backoff: merge-queue job 136608512967
# failed "Install Pandoc for reference conversion" on 2026-11-20 with `curl: (6) Could not resolve host:
# release-assets.githubusercontent.com`, and job 138868659888 failed its kernel seeds on 2026-11-24 on `ENOTFOUND`
# for a python-build-standalone release asset. In-process downloads take the same schedule from
# `unattendedFetchRetry` in @taucad/archive-core.
#
# Each attempt removes any earlier partial file and runs curl into `<output>.partial.<pid>`; curl gives up on a
# transfer that moves less than 1 KiB/s for 60 s. Every failed attempt (DNS, connect, TLS, reset, stall, HTTP error)
# is retried through infra-retry.sh: 8 attempts with waits of 2, 4, 8, 16, 30, 30 and 30 s, so about two minutes of
# failed resolution is outlasted, and each retry is an `infra-retry` annotation the CI health report counts. Once an
# attempt succeeds the file is checked against its pinned digest and only then renamed to `<output>`, so `<output>`
# never holds a partial or unverified file. When every attempt fails, or the digest does not match, the script exits
# non-zero: nothing is skipped.
#
# Optional env vars:
#   DOWNLOAD_ATTEMPTS  Attempts before the step fails (default: 8)
#   DOWNLOAD_BACKOFF   Seconds to wait before each retry, space-separated; the last repeats (default: "2 4 8 16 30")
#   DOWNLOAD_CURL      curl command (default: curl)
#
# Usage:
#   download.sh <step> <url> <output> <sha256|sha512>:<hex digest>
#   e.g. download.sh pandoc-download https://github.com/…/pandoc.deb "$RUNNER_TEMP/pandoc.deb" sha256:9190…
#
# Exit codes:
#   0  <output> holds the verified file
#   1  Bad arguments, or the downloaded file does not match its digest
#   *  The last curl attempt's exit status, after every attempt failed

# No errexit: infra_retry_main reads each failed attempt's status itself, and every failure below exits explicitly.
set -uo pipefail

# infra_retry_main: the bounded retry loop and the job-level retry events the CI health report counts.
# shellcheck source=infra-retry.sh
source "$(dirname "${BASH_SOURCE[0]}")/infra-retry.sh"

if [ $# -ne 4 ]; then
  echo "::error::usage: download.sh <step> <url> <output> <sha256|sha512>:<hex digest>" >&2
  exit 1
fi
step="$1" url="$2" output="$3" pin="$4"
algorithm="${pin%%:*}" expected="${pin#*:}"
case "$algorithm" in
  sha256) [[ "$expected" =~ ^[0-9a-f]{64}$ ]] ;;
  sha512) [[ "$expected" =~ ^[0-9a-f]{128}$ ]] ;;
  *) false ;;
esac || {
  echo "::error::download.sh needs a pin of the form sha256:<64 hex> or sha512:<128 hex>, not '$pin'" >&2
  exit 1
}
read -r -a curl_command <<<"${DOWNLOAD_CURL:-curl}"

partial="$output.partial.$$"
trap 'rm -f "$partial"' EXIT

# One attempt: a fresh partial file every time, so a retry never appends to or trusts an interrupted transfer.
download_attempt() {
  rm -f "$partial"
  "${curl_command[@]}" --fail --silent --show-error --location --connect-timeout 30 \
    --speed-limit 1024 --speed-time 60 --output "$partial" "$url"
}

# The digest of a file in lowercase hex: sha256sum/sha512sum on Linux, shasum on macOS.
file_digest() {
  local bits="${algorithm#sha}"
  if command -v "${algorithm}sum" >/dev/null; then
    "${algorithm}sum" "$1" | cut -d' ' -f1
  else
    shasum -a "$bits" "$1" | cut -d' ' -f1
  fi
}

mkdir -p "$(dirname "$output")"
status=0
# The attempt is a shell function, so no per-attempt process-group deadline (curl's speed limit bounds a stall).
INFRA_RETRY_ATTEMPTS="${DOWNLOAD_ATTEMPTS:-8}" INFRA_RETRY_BACKOFF="${DOWNLOAD_BACKOFF:-2 4 8 16 30}" \
  INFRA_RETRY_ATTEMPT_SECONDS=0 infra_retry_main "$step" download_attempt || status=$?
if [ "$status" -ne 0 ]; then
  exit "$status"
fi

actual=$(file_digest "$partial")
if [ "$actual" != "$expected" ]; then
  echo "::error title=pinned-download::$step: $url has $algorithm $actual; its pin is $expected" >&2
  exit 1
fi
mv -f "$partial" "$output"
