#!/usr/bin/env bash
#
# Start the desktop-e2e infrastructure (PostgreSQL 17, a Redis-compatible server, MinIO) as host processes on a
# GitHub-hosted windows-2025 runner. Its Docker runs Windows containers only, so the Compose stack cannot start; the
# Windows packaged gate (`desktop-packaged-windows.yml`) then runs with TAU_E2E_SERVICES=host, exactly as the macOS
# gate does with `start-macos-services.sh`. Ports, users, buckets and credentials match infra/docker-compose.yml and
# apps/api/.env.example (development placeholders, never secrets).
#
# - PostgreSQL 17 is the runner image's own install (PGBIN; its superuser is `postgres`, PGUSER/PGPASSWORD set by the
#   image). Its service is disabled by default and is started here.
# - Redis has no upstream Windows build. Memurai Developer (Redis 7 compatible, free for development and testing) is
#   installed from Chocolatey and runs as a service on 6379. The API needs GETDEL (Redis 6.2+), EVAL and pub/sub.
# - MinIO no longer publishes binaries (dl.min.io answers 410), so `minio` and `mc` are built from their Go modules
#   at pinned pseudo-versions; the Go checksum database verifies the sources. A directory that already holds both
#   (an actions/cache hit) is reused.
#
# Required env vars:
#   PGBIN          The runner image's PostgreSQL bin directory
# Optional env vars:
#   RUNNER_TEMP     Where MinIO keeps its data and the services their logs (default: /tmp)
#   TAU_MINIO_BIN   Directory holding (or receiving) minio.exe and mc.exe (default: $RUNNER_TEMP/minio-bin)
#   GITHUB_PATH     When set (GitHub Actions), PostgreSQL's bin directory is added to later steps' PATH
#
# Usage:
#   apps/desktop-e2e/scripts/start-windows-services.sh
#
# Exit codes:
#   0  PostgreSQL, Redis and MinIO answer and the buckets exist
#   1  A service did not start
#   3  Not Windows, or PGBIN, Chocolatey or Go is missing

set -euo pipefail

case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) ;;
  *)
    echo "ERROR: start-windows-services.sh runs on Windows (Git Bash) only" >&2
    exit 3
    ;;
esac
[ -n "${PGBIN:-}" ] || { echo "ERROR: PGBIN is required (the runner image's PostgreSQL)" >&2; exit 3; }
command -v choco >/dev/null || { echo "ERROR: Chocolatey required" >&2; exit 3; }
command -v go >/dev/null || { echo "ERROR: Go required to build MinIO" >&2; exit 3; }

# Pinned module versions (`go list -m github.com/minio/minio@latest` on 2026-11-17; MinIO is source-only).
readonly MINIO_MODULE='github.com/minio/minio@v0.0.0-20260212201848-7aac2a2c5b7c'
readonly MC_MODULE='github.com/minio/mc@v0.0.0-20251106162529-77f82e18b540'

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TEMP_ROOT="$(cygpath -u "${RUNNER_TEMP:-/tmp}")"
WORK="$TEMP_ROOT/desktop-e2e-services"
MINIO_BIN="$(cygpath -u "${TAU_MINIO_BIN:-$TEMP_ROOT/minio-bin}")"
mkdir -p "$WORK/minio" "$MINIO_BIN"

wait_for() {
  local what=$1
  shift
  for _ in $(seq 1 90); do
    if "$@" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "ERROR: $what did not answer within 90 s" >&2
  exit 1
}

pg="$(cygpath -u "$PGBIN")"

# PostgreSQL: start the image's service, then the compose role and database as the image's superuser.
powershell.exe -NoProfile -NonInteractive -Command \
  '$s = Get-Service -Name "postgresql*" | Select-Object -First 1; Set-Service -InputObject $s -StartupType Manual; Start-Service -InputObject $s'
wait_for PostgreSQL "$pg/pg_isready" -h localhost -p 5432
"$pg/psql" -h localhost -U "${PGUSER:-postgres}" -d postgres -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dev_user') THEN
    CREATE ROLE dev_user LOGIN SUPERUSER PASSWORD 'dev_password';
  END IF;
END $$;
SQL
"$pg/psql" -h localhost -U "${PGUSER:-postgres}" -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'tau_dev'" \
  | grep -q 1 || "$pg/createdb" -h localhost -U "${PGUSER:-postgres}" -O dev_user tau_dev

# The suite's account helpers run `psql` as dev_user (TAU_E2E_SERVICES=host); the workflow sets its password.
if [ -n "${GITHUB_PATH:-}" ]; then
  echo "$PGBIN" >> "$GITHUB_PATH"
fi

# Redis-compatible server on 6379, as a Windows service.
choco install memurai-developer --yes --no-progress --limit-output > "$WORK/memurai-install.log" 2>&1 \
  || { cat "$WORK/memurai-install.log" >&2; exit 1; }
memurai_cli="$(cygpath -u "${ProgramFiles:-C:\\Program Files}")/Memurai/memurai-cli.exe"
wait_for Redis "$memurai_cli" -h 127.0.0.1 -p 6379 ping

# MinIO and mc from source, unless a cached build is already here.
if [ ! -x "$MINIO_BIN/minio.exe" ] || [ ! -x "$MINIO_BIN/mc.exe" ]; then
  GOBIN="$(cygpath -w "$MINIO_BIN")" CGO_ENABLED=0 go install "$MINIO_MODULE" "$MC_MODULE" 2>&1 \
    | tee "$WORK/minio-build.log"
fi
"$MINIO_BIN/minio.exe" --version
"$MINIO_BIN/mc.exe" --version

# MinIO with the compose root user, on loopback only, then the bootstrap the compose minio-bootstrap service runs.
# Start-Process detaches it from this step's shell, as `brew services` does on macOS; it inherits the root user.
MINIO_ROOT_USER=tauminio MINIO_ROOT_PASSWORD=tauminio-dev-secret MINIO_EXE="$(cygpath -w "$MINIO_BIN/minio.exe")" \
  MINIO_DATA="$(cygpath -w "$WORK/minio")" MINIO_LOG="$(cygpath -w "$WORK/minio.log")" \
  MINIO_ERR="$(cygpath -w "$WORK/minio.err.log")" powershell.exe -NoProfile -NonInteractive -Command \
  'Start-Process -FilePath $env:MINIO_EXE -WindowStyle Hidden -RedirectStandardOutput $env:MINIO_LOG -RedirectStandardError $env:MINIO_ERR -ArgumentList @("server", $env:MINIO_DATA, "--address", "127.0.0.1:9000", "--console-address", "127.0.0.1:9001")'
wait_for MinIO curl -fs http://127.0.0.1:9000/minio/health/live
mc() { "$MINIO_BIN/mc.exe" --config-dir "$(cygpath -w "$WORK/mc")" "$@"; }
mc alias set local http://127.0.0.1:9000 tauminio tauminio-dev-secret
mc mb --ignore-existing local/tau-content
mc anonymous set download local/tau-content
mc mb --ignore-existing local/tau-content-private
mc mb --ignore-existing local/tau-content-restore
mc admin user add local tau-api tau-api-dev-secret || true
mc admin policy attach local readwrite --user tau-api || true
mc cp "$(cygpath -w "$REPO_ROOT/infra/seed/default-og.png")" local/tau-content/defaults/og.png
mc cp "$(cygpath -w "$REPO_ROOT/infra/seed/default-thumb.webp")" local/tau-content/defaults/thumb.webp
printf 'ok\n' | mc pipe local/tau-content/__health/probe.txt

echo "✓ PostgreSQL, Redis (Memurai) and MinIO are up on the host"
