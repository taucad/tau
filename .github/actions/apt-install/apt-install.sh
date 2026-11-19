#!/usr/bin/env bash
#
# Install Ubuntu packages on a CI runner so that an apt mirror outage costs a retry, not a job.
#
# Every apt install in Tau's workflows and composite actions goes through this script (through
# `.github/actions/apt-install`), including Playwright's browser system dependencies, which
# `playwright install --with-deps` would otherwise fetch with one unretried `apt-get`. On
# 2026-11-19 the hosted runners' Azure mirror (azure.archive.ubuntu.com, reached through
# `mirror+file:/etc/apt/apt-mirrors.txt`) refused connections and fetched at 16.9 kB/s, and
# three merge-queue jobs failed with exit 100 (135562329370, 135559657198, 135539446511).
#
# Each attempt runs `apt-get update` and then `apt-get install -y <arguments>`, with apt's own
# per-fetch retries and timeouts. A failed attempt waits (exponential backoff), switches the
# runner's Azure mirror sources to the Ubuntu archive, and tries again. When every attempt
# fails the script exits non-zero: nothing is skipped.
#
# With APT_INSTALL_PLAYWRIGHT_BROWSERS set, it then asks Playwright which system packages those
# browsers still miss (`playwright install-deps --dry-run`, run in the current directory),
# installs them the same way, and fails unless Playwright then reports none missing. The
# browsers themselves are installed afterwards with `playwright install` (no `--with-deps`).
#
# Optional env vars:
#   APT_INSTALL_PLAYWRIGHT_BROWSERS  Space- or comma-separated Playwright browsers whose system dependencies to install
#   APT_INSTALL_ATTEMPTS             Attempts per install before failing (default: 4)
#   APT_INSTALL_BACKOFF_SECONDS      First wait between attempts, doubled after each (default: 15)
#   APT_INSTALL_PLAYWRIGHT           Playwright command (default: pnpm exec playwright)
#   APT_INSTALL_ETC                  apt configuration directory whose sources fall back (default: /etc/apt)
#   APT_INSTALL_FALLBACK_URI         Archive the Azure mirror sources switch to (default: the Ubuntu archive for the host)
#
# Usage:
#   apt-install.sh [apt-get install options] <package>...
#   APT_INSTALL_PLAYWRIGHT_BROWSERS='chromium firefox' apt-install.sh
#
# Exit codes:
#   0  Every package is installed
#   1  Bad arguments, or apt or Playwright still failed after every attempt

set -euo pipefail

attempts="${APT_INSTALL_ATTEMPTS:-4}"
backoff="${APT_INSTALL_BACKOFF_SECONDS:-15}"
apt_etc="${APT_INSTALL_ETC:-/etc/apt}"
browsers="${APT_INSTALL_PLAYWRIGHT_BROWSERS:-}"
browsers="${browsers//,/ }"
read -r -a playwright <<<"${APT_INSTALL_PLAYWRIGHT:-pnpm exec playwright}"

[[ "$attempts" =~ ^[1-9][0-9]*$ ]] || { echo "::error::APT_INSTALL_ATTEMPTS must be a positive integer" >&2; exit 1; }
[[ "$backoff" =~ ^[0-9]+$ ]] || { echo "::error::APT_INSTALL_BACKOFF_SECONDS must be a whole number" >&2; exit 1; }
if [ $# -eq 0 ] && [ -z "${browsers// /}" ]; then
  echo "::error::apt-install needs packages or APT_INSTALL_PLAYWRIGHT_BROWSERS" >&2
  exit 1
fi

# The hosted runners keep their Azure mirror for amd64; other architectures are served from ports.
if [ -z "${APT_INSTALL_FALLBACK_URI:-}" ]; then
  case "$(dpkg --print-architecture 2>/dev/null || echo amd64)" in
    amd64 | i386) APT_INSTALL_FALLBACK_URI='http://archive.ubuntu.com/ubuntu/' ;;
    *) APT_INSTALL_FALLBACK_URI='http://ports.ubuntu.com/ubuntu-ports/' ;;
  esac
fi

if [ "$(id -u)" -eq 0 ]; then sudo=(); else sudo=(sudo); fi

# apt retries each fetch itself and gives up on a stalled connection instead of waiting on it.
apt_options=(
  -o Acquire::Retries=5
  -o Acquire::http::Timeout=30
  -o Acquire::https::Timeout=30
  -o DPkg::Lock::Timeout=120
)

apt_get() {
  "${sudo[@]}" env DEBIAN_FRONTEND=noninteractive apt-get "${apt_options[@]}" "$@"
}

# With no arguments an attempt only refreshes the package lists.
update_and_install() {
  apt_get update || return
  [ $# -eq 0 ] || apt_get install -y "$@"
}

fallback_applied=false

# Point every source that reaches the Azure mirror (directly or through the mirror list) at the archive.
use_fallback_sources() {
  [ "$fallback_applied" = false ] || return 0
  fallback_applied=true
  local files=() file
  shopt -s nullglob
  for file in "$apt_etc/sources.list" "$apt_etc"/sources.list.d/*.list "$apt_etc"/sources.list.d/*.sources; do
    if [ -f "$file" ] && grep -qE 'mirror\+file:|azure\.archive\.ubuntu\.com' "$file"; then
      files+=("$file")
    fi
  done
  shopt -u nullglob
  if [ ${#files[@]} -eq 0 ]; then
    echo 'No apt source uses the Azure mirror; retrying the configured sources.'
    return 0
  fi
  echo "::warning::Switching apt sources from the Azure mirror to ${APT_INSTALL_FALLBACK_URI}: ${files[*]}"
  "${sudo[@]}" sed -i -E \
    -e "s#mirror\\+file:[^[:space:]]*#${APT_INSTALL_FALLBACK_URI}#g" \
    -e "s#https?://azure\\.archive\\.ubuntu\\.com/ubuntu/?#${APT_INSTALL_FALLBACK_URI}#g" \
    "${files[@]}"
}

with_retries() {
  local attempt=1 wait="$backoff"
  until update_and_install "$@"; do
    if [ "$attempt" -ge "$attempts" ]; then
      echo "::error::apt-get update and install $* failed after $attempt attempts" >&2
      return 1
    fi
    echo "::warning::apt attempt $attempt of $attempts failed; retrying in ${wait}s"
    sleep "$wait"
    use_fallback_sources
    attempt=$((attempt + 1))
    wait=$((wait * 2))
  done
}

# The packages `playwright install-deps --dry-run` reports missing; it exits 1 when it lists any.
# Anything other than its two report shapes (a new format, an unsupported host) fails here.
missing_playwright_packages() {
  local output status=0
  # shellcheck disable=SC2086 # the browser list is split on purpose
  output=$("${playwright[@]}" install-deps --dry-run $browsers) || status=$?
  if grep -q '^All system dependencies are installed\.$' <<<"$output" && [ "$status" -eq 0 ]; then
    return 0
  fi
  if grep -q '^Missing system dependencies ([0-9]*):$' <<<"$output"; then
    sed -n 's/^  \([a-z0-9][a-z0-9.+:-]*\)$/\1/p' <<<"$output"
    return 0
  fi
  printf '%s\n' "$output" >&2
  echo "::error::playwright install-deps --dry-run did not report the missing packages (exit $status)" >&2
  return 1
}

# The package lists are refreshed before Playwright's dry run, which simulates against them.
with_retries "$@"

if [ -n "${browsers// /}" ]; then
  packages=$(missing_playwright_packages)
  if [ -n "$packages" ]; then
    read -r -d '' -a missing <<<"$packages" || true
    echo "Installing ${#missing[@]} system packages for Playwright ($browsers)."
    with_retries --no-install-recommends "${missing[@]}"
    left=$(missing_playwright_packages)
    if [ -n "$left" ]; then
      echo "::error::Playwright still misses system packages after the install: ${left//$'\n'/ }" >&2
      exit 1
    fi
  fi
  echo "Playwright system dependencies are installed ($browsers)."
fi
