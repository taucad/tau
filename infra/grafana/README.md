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

`pnpm grafana:up` starts local services. `pnpm grafana:sync` updates only a
loopback Grafana instance; Terraform is the sole writer to hosted Grafana.
The alert JSON and local provisioning YAML remain equivalent defaults, checked
by `pnpm nx run scripts:validate-grafana`. Hosted policy overrides are deliberate
and tested in the deployment repository.
