#!/usr/bin/env bash
#
# Idempotent Grafana dashboard & alert sync.
#
# Pushes all dashboard JSONs and alert rule groups from infra/grafana/ to any
# Grafana instance via the HTTP API. Safe to run repeatedly — uses overwrite
# mode for dashboards and the rule-group PUT endpoint for alerts.
#
# Environment variables:
#   GRAFANA_URL      Base URL (default: http://localhost:6100)
#   GRAFANA_API_KEY  Service account token for Bearer auth.
#                    When unset, falls back to Basic admin:admin (local dev).
#
# Usage:
#   ./apps/api/scripts/sync-grafana-dashboards.sh
#   GRAFANA_URL=https://mystack.grafana.net GRAFANA_API_KEY=glsa_... ./apps/api/scripts/sync-grafana-dashboards.sh

set -euo pipefail

GRAFANA_URL="${GRAFANA_URL:-http://localhost:6100}"
GRAFANA_URL="${GRAFANA_URL%/}"

if [[ -n "${GRAFANA_API_KEY:-}" ]]; then
  AUTH_HEADER="Authorization: Bearer ${GRAFANA_API_KEY}"
else
  AUTH_HEADER="Authorization: Basic $(printf 'admin:admin' | base64)"
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
DASHBOARDS_DIR="${REPO_ROOT}/infra/grafana/dashboards"
ALERTS_DIR="${REPO_ROOT}/infra/grafana/alerts"

FOLDER_UID="tau"
FOLDER_TITLE="Tau"
ALERTS_FOLDER_UID="tau-alerts"
ALERTS_FOLDER_TITLE="Tau Alerts"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

errors=0

ensure_folder() {
  local uid="$1" title="$2"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${GRAFANA_URL}/api/folders" \
    -H "Content-Type: application/json" \
    -H "${AUTH_HEADER}" \
    -d "{\"uid\":\"${uid}\",\"title\":\"${title}\"}")

  if [[ "$status" == "200" ]]; then
    echo -e "${GREEN}✓${NC} Created folder: ${title}"
  elif [[ "$status" == "409" || "$status" == "412" ]]; then
    echo -e "${CYAN}·${NC} Folder exists:  ${title}"
  else
    echo -e "${RED}✗${NC} Folder failed:  ${title} (HTTP ${status})"
    errors=$((errors + 1))
  fi
}

sync_dashboards() {
  local file dashboard_json payload title uid status response

  for file in "${DASHBOARDS_DIR}"/*.json; do
    [[ -f "$file" ]] || continue

    title=$(grep -o '"title"[[:space:]]*:[[:space:]]*"[^"]*"' "$file" | head -1 | sed 's/.*: *"//;s/"$//')
    uid=$(grep -o '"uid"[[:space:]]*:[[:space:]]*"[^"]*"' "$file" | head -1 | sed 's/.*: *"//;s/"$//')

    dashboard_json=$(cat "$file")

    payload=$(printf '{"dashboard":%s,"folderUid":"%s","overwrite":true,"message":"Synced from infra/grafana/dashboards"}' \
      "$dashboard_json" "$FOLDER_UID")

    response=$(curl -s -w "\n%{http_code}" \
      -X POST "${GRAFANA_URL}/api/dashboards/db" \
      -H "Content-Type: application/json" \
      -H "${AUTH_HEADER}" \
      -d "$payload")

    status=$(echo "$response" | tail -1)
    local body
    body=$(echo "$response" | sed '$d')

    if [[ "$status" == "200" ]]; then
      echo -e "${GREEN}✓${NC} Dashboard: ${title} (${uid})"
    else
      echo -e "${RED}✗${NC} Dashboard: ${title} (${uid}) — HTTP ${status}"
      echo "  ${body}" | head -3
      errors=$((errors + 1))
    fi
  done
}

delete_alert_rule() {
  local uid="$1"
  curl -s -o /dev/null -w "%{http_code}" \
    -X DELETE "${GRAFANA_URL}/api/v1/provisioning/alert-rules/${uid}" \
    -H "${AUTH_HEADER}" \
    -H "X-Disable-Provenance: true"
}

sync_alert_rule_groups() {
  local file group_name status response rule_uids uid

  for file in "${ALERTS_DIR}"/*.json; do
    [[ -f "$file" ]] || continue

    group_name=$(grep -o '"title"[[:space:]]*:[[:space:]]*"[^"]*"' "$file" | head -1 | sed 's/.*: *"//;s/"$//')

    # Delete existing rules by UID first to clear any provenance conflicts
    rule_uids=$(grep -o '"uid"[[:space:]]*:[[:space:]]*"[^"]*"' "$file" | sed 's/.*: *"//;s/"$//')
    for uid in $rule_uids; do
      delete_alert_rule "$uid" >/dev/null 2>&1 || true
    done

    response=$(curl -s -w "\n%{http_code}" \
      -X PUT "${GRAFANA_URL}/api/v1/provisioning/folder/${ALERTS_FOLDER_UID}/rule-groups/${group_name}" \
      -H "Content-Type: application/json" \
      -H "${AUTH_HEADER}" \
      -H "X-Disable-Provenance: true" \
      -d @"$file")

    status=$(echo "$response" | tail -1)
    local body
    body=$(echo "$response" | sed '$d')

    if [[ "$status" == "200" || "$status" == "201" || "$status" == "202" ]]; then
      echo -e "${GREEN}✓${NC} Alert group: ${group_name}"
    elif [[ "$status" == "409" ]] && echo "$body" | grep -q "provenanceMismatch"; then
      echo -e "${CYAN}·${NC} Alert group: ${group_name} (managed by file provisioning, skipped)"
    else
      echo -e "${RED}✗${NC} Alert group: ${group_name} — HTTP ${status}"
      echo "  ${body}" | head -3
      errors=$((errors + 1))
    fi
  done
}

echo ""
echo -e "${CYAN}Syncing Grafana dashboards & alerts${NC}"
echo -e "${CYAN}Target: ${GRAFANA_URL}${NC}"
echo ""

echo -e "${YELLOW}── Folders ──${NC}"
ensure_folder "$FOLDER_UID" "$FOLDER_TITLE"
ensure_folder "$ALERTS_FOLDER_UID" "$ALERTS_FOLDER_TITLE"
echo ""

echo -e "${YELLOW}── Dashboards ──${NC}"
sync_dashboards
echo ""

echo -e "${YELLOW}── Alert Rule Groups ──${NC}"
sync_alert_rule_groups
echo ""

if [[ "$errors" -gt 0 ]]; then
  echo -e "${RED}Done with ${errors} error(s).${NC}"
  exit 1
else
  echo -e "${GREEN}Done. All resources synced successfully.${NC}"
  exit 0
fi
