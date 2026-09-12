# Tau Grafana Alerts

JSON files in this directory are alert **rule groups** synced to any Grafana
instance via `apps/api/scripts/sync-grafana-dashboards.sh`. Each file defines
one rule group; each rule inside a group has a stable `uid` so re-runs are
idempotent (the sync script deletes by UID before re-uploading to clear
provenance conflicts).

## Datasource UID assumptions

Rules reference datasources by `datasourceUid`. The sync script does **not**
remap UIDs — they must already exist on the target Grafana instance.

| `datasourceUid` | Required type | Where it lives                                                                                                                                                                                                                                                                                                        |
| --------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prometheus`    | Prometheus    | Local: `infra/grafana/provisioning/datasources/datasources.yaml`. Prod: provisioned in Grafana Cloud as `prometheus`.                                                                                                                                                                                                 |
| `loki`          | Loki          | Local: same provisioning file. **Prod note:** Grafana Cloud's logs datasource UID is typically `grafanacloud-logs`. Re-create it as `loki` (or update the rule UIDs) before syncing `tau-critical.json`'s `database-startup-failure` rule, otherwise the rule will fail to evaluate with `failed to find datasource`. |
| `__expr__`      | Expression    | Built-in to Grafana, always available.                                                                                                                                                                                                                                                                                |

## Rule groups

| File                | Severity                   | Rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tau-critical.json` | P0 — page on-call          | `redis-connection-lost` (Prometheus), `database-startup-failure` (Loki LogQL — fires on `Database connectivity probe failed` / `Database migration failed`), `billing-ledger-drift` (C12 money invariant — non-zero drift pages).                                                                                                                                                                                                                                                               |
| `tau-warning.json`  | P1 — notify Slack, no page | `rpc-failure-rate`, `ws-disconnect-storm`, `llm-error-rate`, `high-5xx-rate`, `gen-ai-prompt-cache-hit-rate-low`, plus the funded-LLM recovery pack (B9 W4): `billing-funded-operation-occupancy`, `billing-funded-operation-limit`, `billing-funded-operation-recovery-failed`, `billing-funded-operation-due-age`, `billing-funded-operation-recovery-provider-execution` (all Prometheus). The B2-era reservation/commit/negative-balance/clawback rules were removed with the Redis ledger. |

Webhook **settlement lag** (top-up created → settled) has no first-party metric;
monitor it via Stripe Dashboard → Developers → Webhooks (delivery latency +
failure rate on the Tau endpoint) — part of the launch-checklist click-ops.

## Adding a new alert

1. Append a new object to the `rules` array of the appropriate file.
2. Pick a stable, kebab-case `uid`; the sync script uses it for delete/replace.
3. Use `severity: critical` for P0, `severity: warning` for P1.
4. Re-run `apps/api/scripts/sync-grafana-dashboards.sh` (locally or via CI).

## Adding a new Loki LogQL alert

Loki rules need three `data` entries: a `range` Loki query, a `reduce`
expression (`__expr__`), and a `threshold` expression (`__expr__`). The
`condition` field at the rule top-level must reference the threshold's
`refId`. See `database-startup-failure` in `tau-critical.json` for the
canonical shape.
