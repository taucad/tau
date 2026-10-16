#!/usr/bin/env bash
#
# Start the desktop-e2e infrastructure (PostgreSQL 17, Redis, MinIO) as host processes on a
# GitHub-hosted macOS runner, which has no Docker. The packaged suite (`test:e2e:packaged`)
# then runs with TAU_E2E_SERVICES=host, so ensure-services.sh skips Docker Compose and only
# migrates. Ports, users, buckets and credentials match infra/docker-compose.yml and
# apps/api/.env.example (development placeholders, never secrets).
#
# Charter W15 (native dependency resolution): the packaged desktop suite runs nightly.
#
# Required env vars:
#   None
# Optional env vars:
#   RUNNER_TEMP   Where MinIO keeps its data and the services their logs (default: /tmp)
#
# Usage:
#   apps/desktop-e2e/scripts/start-macos-services.sh
#
# Exit codes:
#   0  PostgreSQL, Redis and MinIO answer and the buckets exist
#   1  A service did not start
#   3  Not macOS or Homebrew is missing

set -euo pipefail

[ "$(uname -s)" = Darwin ] || { echo "ERROR: start-macos-services.sh runs on macOS only" >&2; exit 3; }
command -v brew >/dev/null || { echo "ERROR: Homebrew required" >&2; exit 3; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORK="${RUNNER_TEMP:-/tmp}/desktop-e2e-services"
mkdir -p "$WORK/minio"

export HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1
brew install postgresql@17 redis minio minio-mc

wait_for() {
  local what=$1
  shift
  for _ in $(seq 1 60); do
    if "$@" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "ERROR: $what did not answer within 60 s" >&2
  exit 1
}

# PostgreSQL: the compose superuser and database.
pg="$(brew --prefix postgresql@17)/bin"
brew services start postgresql@17
wait_for PostgreSQL "$pg/pg_isready" -h localhost -p 5432
"$pg/psql" -h localhost -d postgres -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dev_user') THEN
    CREATE ROLE dev_user LOGIN SUPERUSER PASSWORD 'dev_password';
  END IF;
END $$;
SQL
"$pg/psql" -h localhost -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'tau_dev'" | grep -q 1 \
  || "$pg/createdb" -h localhost -O dev_user tau_dev

brew services start redis
wait_for Redis redis-cli -h localhost ping

# MinIO with the compose root user, then the bootstrap the compose minio-bootstrap service runs.
MINIO_ROOT_USER=tauminio MINIO_ROOT_PASSWORD=tauminio-dev-secret \
  nohup minio server "$WORK/minio" --address :9000 --console-address :9001 > "$WORK/minio.log" 2>&1 &
wait_for MinIO curl -fs http://localhost:9000/minio/health/live
mc alias set local http://localhost:9000 tauminio tauminio-dev-secret
mc mb --ignore-existing local/tau-content
mc anonymous set download local/tau-content
mc mb --ignore-existing local/tau-content-private
mc mb --ignore-existing local/tau-content-restore
mc admin user add local tau-api tau-api-dev-secret || true
mc admin policy attach local readwrite --user tau-api || true
mc cp "$REPO_ROOT/infra/seed/default-og.png" local/tau-content/defaults/og.png
mc cp "$REPO_ROOT/infra/seed/default-thumb.webp" local/tau-content/defaults/thumb.webp
printf 'ok\n' | mc pipe local/tau-content/__health/probe.txt

echo "✓ PostgreSQL, Redis and MinIO are up on the host"
