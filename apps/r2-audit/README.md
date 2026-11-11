# r2-audit

The `tau-r2-audit-<env>` Cloudflare Worker: R2 write alarms for Tau Cloud. The design is the R2 storage blast-radius blueprint (`docs/research/r2-storage-blast-radius-blueprint.md`, "Write alarms" and phase 9). tau-cloud's `modules/cloudflare-r2-audit` deploys it.

It has two handlers, and both only log:

- **`queue`** consumes the locked dependency bucket's R2 event notifications. Each create is recorded in KV by key, with its eTag and time. Each notification is then checked:
  - A create for a key already recorded is an overwrite. A redelivery has the same eTag and time, so it writes nothing.
  - A key outside `blobs/sha256/<64 lowercase hex>` is a layout breach.
  - Any delete (`DeleteObject`, `LifecycleDeletion`) is a lock failure.
  - An unreadable message, or a create that KV could not record, is retried and then lands in the dead-letter queue.
- **`scheduled`** runs every 5 minutes. It queries the Workers Observability telemetry API for the `r2` dataset (R2 Data Access Logs) over the last 10 minutes, keeping six actions: `PutObject`, `CopyObject`, `CompleteMultipartUpload`, `DeleteObject`, `DeleteObjects` and `DeleteObjectsByPrefix`.
  - Events on a bucket listed in `AUDIT_FOREIGN_BUCKETS` are skipped before any check or KV mark: environments can share a Cloudflare account, and the telemetry is account-wide, so the other environment's Worker audits its own buckets. A bucket this Worker watches itself (an `AUDIT_EXPECTED_WRITERS` entry or the dependency bucket) is never skipped, and any other bucket with no entry still alarms as `unknown-bucket`.
  - Each event id is marked in KV for an hour, so the overlapping windows report each event once.
  - Each event is compared with its bucket's expected writers. An `S3` write must come from a listed token id (`actor.accessKeyId`), and a `Workers` write from a listed script (`scriptName`). An `interface = API` write is never expected, and neither is a write to a bucket with no entry.
  - A `DeleteObjects` or `DeleteObjectsByPrefix` on the dependency bucket alarms as a delete attempt, whoever made it.
  - Without `AUDIT_QUERY_TOKEN` the poll is skipped and the heartbeat says so.

Every pass ends with one heartbeat line.

## Bindings

These are fixed in tau-cloud `modules/cloudflare-r2-audit/main.tf`. Renaming one is a coordinated change. There is no R2 binding.

| Binding                   | Type           | Value                                                                                                         |
| ------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------- |
| `AUDIT_KV`                | `kv_namespace` | `object:<key>` create records; `seen:<event id>` poll marks (1 h TTL)                                         |
| `AUDIT_ENVIRONMENT`       | `plain_text`   | `staging` or `prod-us`                                                                                        |
| `AUDIT_DEPENDENCY_BUCKET` | `plain_text`   | the watched dependency bucket (`-` for none)                                                                  |
| `AUDIT_ACCOUNT_ID`        | `plain_text`   | the account the telemetry query reads                                                                         |
| `AUDIT_EXPECTED_WRITERS`  | `secret_text`  | JSON `{"<bucket>": {"token_ids": [...], "scripts": [...]}}`; malformed reads as no buckets                    |
| `AUDIT_QUERY_TOKEN`       | `secret_text`  | Workers Observability Write token; only behind `query_token_enabled`                                          |
| `AUDIT_FOREIGN_BUCKETS`   | `plain_text`   | optional JSON `["<bucket>", ...]`: the other environment's buckets, skipped by the poll; malformed skips none |

## Logs

Each line is one JSON object on `console.log`. The Worker's OTLP logs export sends it to Grafana Cloud Loki as `service_name="tau-r2-audit-<env>"`. `infra/grafana/alerts/tau-storage-integrity.json` reads the lines with `{service_name="tau-r2-audit"} | json | event="…"`, and Tau Cloud binds that selector per environment. These field names are the contract with those rules.

| `event`                              | Written when                                                 | Alert                              |
| ------------------------------------ | ------------------------------------------------------------ | ---------------------------------- |
| `r2_audit.heartbeat`                 | end of every pass (`pass` = `scheduled` or `queue`)          | `storage-audit-silent` (scheduled) |
| `r2_audit.dependency_created`        | first create of a key                                        | none                               |
| `r2_audit.dependency_overwritten`    | create of a recorded key                                     | `storage-dependency-overwritten`   |
| `r2_audit.dependency_layout_breach`  | create of a key outside `blobs/sha256/<64 hex>`              | `storage-dependency-overwritten`   |
| `r2_audit.dependency_deleted`        | any delete notification                                      | `storage-dependency-deleted`       |
| `r2_audit.dependency_delete_attempt` | polled bulk delete on the dependency bucket                  | `storage-dependency-bulk-delete`   |
| `r2_audit.unexpected_writer`         | polled write or delete outside the bucket's expected writers | `storage-unexpected-writer`        |

Record lines carry these fields:

- Always: `environment`, `source` (`notification` or `data-access-log`), `bucket` and `action`.
- When the event has them: `key`, `eTag`, `previousEtag` (overwrites), `eventTime`, `accessKeyId`, `interface` and `scriptName`.
- On an unexpected writer: `reason`, which is `api-interface`, `unknown-bucket` or `unknown-actor`.

Heartbeats carry:

- Always: `pass`, `expectedWritersValid`, `alarms` and `durationMilliseconds`.
- On a queue pass: `messages` and `retried`.
- On a scheduled pass: `poll` (`ok`, `skipped` or `failed`), `pollDetail` (`no-query-token`, `http-<status>`, `api-error`, `network` or `kv`), `eventsSeen`, `eventsNew` and `truncated`.
- On a scheduled pass with `AUDIT_FOREIGN_BUCKETS` set: `foreignBucketsValid`, and with an `ok` poll, `eventsForeign` (window events on foreign buckets, skipped; `eventsSeen` includes them).

No line carries the query token, the expected-writer list, an actor's e-mail or a response body. Token ids and script names are identifiers, not secrets.

## Build and deploy

```bash
pnpm nx run r2-audit:bundle   # or r2-audit:build
```

This writes `apps/r2-audit/dist/r2-audit-worker.mjs`, its `.map` and `r2-audit-worker.mjs.sha256`, and prints the module's SHA-256. The build is deterministic in the same way as the files Worker's (`apps/files/README.md`). The module has only a default export, `{ queue, scheduled }`. CI builds it in the affected `build` lane.

Deployment is by Terraform only. tau-cloud commits the bundle as `bundles/r2-audit-worker-<tau-sha12>.mjs` and pins it with `content_sha256`. Nothing in this repository deploys it, and the project carries no `deploy:` tag.

## Tests

```bash
pnpm nx test r2-audit
pnpm nx typecheck r2-audit
pnpm nx lint r2-audit
```

The tests run in plain Vitest on Node, with a fake KV namespace (`src/testing/fake-kv.ts`) and a stubbed `fetch`. `src/bundle.test.ts` imports the built module and runs its `scheduled` handler.
