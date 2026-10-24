# Grafana definitions

Tau owns instrumentation, reusable dashboards, alert expressions and the local
Grafana stack. Hosted deployment, datasource credentials, environment selection,
alert policy and notification recipients belong to the deployment repository.

`bundle.json` indexes the canonical JSON files with SHA-256 hashes. Deployment
fetches that index and its files at one immutable Git commit, verifies the hashes,
and renders the definitions. It never clones application history or executes
application code. Run `pnpm nx run scripts:grafana-bundle` after changing JSON;
the ordinary validator rejects a stale index. Promotion and rollback change the
pinned commit in the deployment repository.

## Binding contract (version 1)

- Dashboard PromQL uses `app=~"$app"`. Local `$app` is `.*`, which also matches
  series without an app label. Hosted provisioning must bind it to one app.
- Alert PromQL uses `app=~".*"`; hosted provisioning replaces that exact matcher
  with an equality matcher for one application, before creating each rule.
- Datasource UIDs are logical names. Deployment maps them to existing datasources.
- Local collector metrics (`postgresql_*`, `redis_*` except
  `redis_connection_state`, and `system_*`) need the corresponding collectors.
  A deployment without them must exclude those panels explicitly.
- Loki, Tempo and Pyroscope require their own ingestion paths. A datasource's
  existence alone does not prove ingestion. Fly stdout logs use different labels
  from local OTLP logs; deployment owns that translation.
- Stable dashboard/rule UIDs identify resources. Deployment may namespace them
  per environment, within Grafana's 40-character limit, and must preserve that
  mapping across upgrades.

## Binding contract (version 2)

Storage spans three Fly apps per environment: the API, the database-free
`tau-storage` worker and the `tau-mirror` copier. Version 2 adds one binding per
app and keeps everything in version 1.

| App           | Dashboard matcher     | Local default | Rule matcher         |
| ------------- | --------------------- | ------------- | -------------------- |
| `tau-api`     | `app=~"$app"`         | `.*`          | `app=~".*"`          |
| `tau-storage` | `app=~"$storage_app"` | `.*storage.*` | `app=~".*storage.*"` |
| `tau-mirror`  | `app=~"$mirror_app"`  | `.*mirror.*`  | `app=~".*mirror.*"`  |

- Hosted provisioning replaces each exact matcher with an equality matcher for
  that environment's app. Any other `app` matcher, including a hard-coded app or
  a combined one such as `app=~"tau-api.*|.*storage.*"`, is refused at plan.
- One selector reads one app. A `service_name` alternation over two services
  (`service_name=~"tau-api|tau-storage"`) is also refused. A panel or rule that
  compares apps uses one query per app.
- `tau_mirror_*` series exist only in `tau-mirror`, so their selectors use the
  mirror binding. A `service_name` naming `tau-storage` or `tau-mirror` must use
  that app's binding.
- Rule labels: `severity` is `critical` (page), `warning` (notify) or `info`.
  `info` rules are triggers, routed to email only. They carry `kind=trigger`, a
  `trigger` id and the `package` they charter. Every rule's
  `annotations.runbook_url` is a `docs/handbooks/cloud/**.md` path.
- Hosted rule UIDs keep the first 20 characters of the source UID plus a hash.
  New UIDs must differ within those 20 characters; the four
  `billing-funded-operation-*` rules predate the rule and are listed in the
  validator.
- Locally, the API's series carry no `app` label, which `.*` matches. The
  collector's `tau-storage` job sets `app="tau-storage"` so `.*storage.*`
  matches; DC1's worker serves its metrics on port 9467.

`pnpm nx run scripts:validate-grafana` enforces the rule labels, runbooks and
UID prefixes. `pnpm nx test telemetry` enforces the selectors and variables. It
also enforces three storage-family rules for `tau.sync`, `tau.storage`,
`tau.git`, `tau.r2`, `tau.mirror`, `tau.migration`, `tau.lfs`, `tau.compute` and
`tau.db` instruments:

- No label names a project, owner, user, device, oid, digest or request id.
- No label admits a free-form string.
- Every instrument is read by at least one dashboard panel.

Pending exceptions are listed in `grafana-contract.test.ts` with the package that
removes them. `node scripts/src/validate-grafana.ts --log-sample <file>...`
checks a captured storage log sample for grant headers, receipt signatures and
`X-Amz-Signature` values. It reports the line and field, never the value.

`pnpm grafana:up` starts local services. `pnpm grafana:sync` updates only a
loopback Grafana instance; Terraform is the sole writer to hosted Grafana.
The alert JSON and local provisioning YAML remain equivalent defaults, checked
by `pnpm nx run scripts:validate-grafana`. Hosted policy overrides are deliberate
and tested in the deployment repository.
