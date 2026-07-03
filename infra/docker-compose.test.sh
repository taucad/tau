#!/usr/bin/env bash
# Smoke-check MinIO bootstrap: single bucket, seeded defaults + probe key, tau-api RW.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT}/infra/docker-compose.yml"

docker compose -f "${COMPOSE_FILE}" up -d minio minio-bootstrap

attempts=120
until [[ "$(docker inspect -f '{{.State.Status}}' tau-minio-bootstrap 2>/dev/null || echo missing)" == "exited" ]]; do
  attempts=$((attempts - 1))
  if [[ "${attempts}" -eq 0 ]]; then
    echo "timeout waiting for tau-minio-bootstrap to exit"
    docker logs tau-minio-bootstrap 2>&1 || true
    exit 1
  fi
  sleep 1
done

code="$(docker inspect -f '{{.State.ExitCode}}' tau-minio-bootstrap)"
if [[ "${code}" != "0" ]]; then
  echo "minio-bootstrap failed with exit ${code}"
  docker logs tau-minio-bootstrap 2>&1 || true
  exit 1
fi

docker compose -f "${COMPOSE_FILE}" run --rm \
  --entrypoint /bin/sh \
  minio-bootstrap \
  -c '
    set -eu
    mc alias set local http://minio:9000 "${MINIO_ROOT_USER:-tauminio}" "${MINIO_ROOT_PASSWORD:-tauminio-dev-secret}"
    mc ls local/tau-content/defaults/og.png
    mc ls local/tau-content/defaults/thumb.webp
    mc ls local/tau-content/__health/probe.txt
    mc anonymous get local/tau-content >/dev/null

    mc alias set apiLocal http://minio:9000 tau-api tau-api-dev-secret
    printf probe | mc cp - apiLocal/tau-content/blobs/smoke/ci-probe.bin
    mc rm --force apiLocal/tau-content/blobs/smoke/ci-probe.bin >/dev/null
    echo "minio smoke ok"
  '
