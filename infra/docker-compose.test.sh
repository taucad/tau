#!/usr/bin/env bash
# Smoke-check MinIO bootstrap: single bucket, seeded defaults + probe key, tau-api RW.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT}/infra/docker-compose.yml"

# Every published host port must name 127.0.0.1. A bare host:container mapping and an
# explicit 0.0.0.0 (or any other host address) listen beyond loopback. Short syntax and
# the long `host_ip` form are both checked, including single- and double-quoted values
# and a flow sequence that continues onto later lines.
require_loopback_ports() {
  local file=$1
  local unbound
  unbound="$(
    awk -f - "${file}" <<'AWK'
function trim(s) {
  gsub(/^[[:space:]]+|[[:space:]]+$/, "", s)
  return s
}
function unquote(s, q) {
  s = trim(s)
  q = substr(s, 1, 1)
  if ((q == "\"" || q == "'") && length(s) >= 2 && substr(s, length(s), 1) == q) {
    return substr(s, 2, length(s) - 2)
  }
  return s
}
function strip_comment(s, q, rest, close_at) {
  if (s ~ /^["']/) {
    q = substr(s, 1, 1)
    rest = substr(s, 2)
    close_at = index(rest, q)
    if (close_at > 0) return substr(s, 1, close_at + 1)
  }
  sub(/[[:space:]]*#.*/, "", s)
  return s
}
function fail(n, text) {
  problems = problems n ": " text "\n"
}
function flush_long(   host) {
  if (!long_open) return
  host = unquote(trim(long_host))
  if (host != "127.0.0.1") fail(long_line, "long-form port host_ip is not 127.0.0.1")
  long_open = 0
  long_host = ""
}
function check_short(n, raw,   mapping) {
  mapping = unquote(trim(strip_comment(trim(raw))))
  if (mapping == "" || mapping == "~" || mapping == "null") return
  if (mapping !~ /^127\.0\.0\.1:/) fail(n, mapping)
}
function check_flow(n, raw,   inner, i, nitems) {
  inner = trim(raw)
  sub(/^\[/, "", inner)
  sub(/\].*$/, "", inner)
  nitems = split(inner, items, /,/)
  for (i = 1; i <= nitems; i++) check_short(n, items[i])
}
function open_flow(n, raw) {
  flow_line = n
  flow_text = trim(raw)
  if (index(raw, "]") > 0) {
    check_flow(flow_line, flow_text)
    flow_open = 0
    in_ports = 0
  } else {
    flow_open = 1
  }
}
BEGIN { in_ports = 0; long_open = 0; flow_open = 0; flow_text = ""; flow_line = 0; problems = "" }
{
  line = $0
  if (flow_open) {
    flow_text = flow_text " " trim(line)
    if (index(line, "]") > 0) {
      check_flow(flow_line, flow_text)
      flow_open = 0
      in_ports = 0
    }
    next
  }
  if (in_ports && long_open && line ~ /^[[:space:]]*-[[:space:]]/) flush_long()
  if (match(line, /^[[:space:]]*ports:[[:space:]]*/)) {
    flush_long()
    in_ports = 1
    rest = trim(substr(line, RLENGTH + 1))
    if (rest ~ /^\[/) open_flow(NR, rest)
    next
  }
  if (!in_ports) next
  if (line ~ /^[[:space:]]*\[/) {
    open_flow(NR, line)
    next
  }
  if (line ~ /^[[:space:]]*$/ || line ~ /^[[:space:]]*#/) next
  if (line ~ /^[[:space:]]*[A-Za-z0-9_-]+:[[:space:]]*/ && line !~ /^[[:space:]]*-/) {
    if (long_open && line ~ /^[[:space:]]+(target|published|host_ip|protocol|mode|name|app_protocol):/) {
      if (line ~ /^[[:space:]]*host_ip:[[:space:]]*/) {
        long_host = line
        sub(/^[[:space:]]*host_ip:[[:space:]]*/, "", long_host)
        long_host = strip_comment(long_host)
      }
      next
    }
    flush_long()
    in_ports = 0
    next
  }
  if (line ~ /^[[:space:]]*-[[:space:]]/) {
    flush_long()
    item = line
    sub(/^[[:space:]]*-[[:space:]]*/, "", item)
    item = strip_comment(item)
    key = item
    sub(/:.*/, "", key)
    if (key ~ /^(target|published|host_ip|protocol|mode|name|app_protocol)$/) {
      long_open = 1
      long_line = NR
      long_host = ""
      if (item ~ /^host_ip:[[:space:]]*/) {
        long_host = item
        sub(/^host_ip:[[:space:]]*/, "", long_host)
      }
      next
    }
    check_short(NR, item)
    next
  }
  if (long_open && line ~ /^[[:space:]]*host_ip:[[:space:]]*/) {
    long_host = line
    sub(/^[[:space:]]*host_ip:[[:space:]]*/, "", long_host)
    long_host = strip_comment(long_host)
  }
}
END {
  flush_long()
  if (flow_open) fail(flow_line, "unclosed flow-style ports sequence")
  printf "%s", problems
}
AWK
  )"
  if [[ -n "${unbound}" ]]; then
    echo "ERROR: ${file} publishes a port that is not bound to 127.0.0.1" >&2
    printf '%s\n' "${unbound}" >&2
    exit 1
  fi
}

require_loopback_ports "${COMPOSE_FILE}"

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
    printf probe | mc pipe apiLocal/tau-content/blobs/smoke/ci-probe.bin
    mc rm --force apiLocal/tau-content/blobs/smoke/ci-probe.bin >/dev/null
    echo "minio smoke ok"
  '
