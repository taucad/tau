---
title: 'Prod + Staging UI Deployment Status'
description: 'Cross-document audit of remaining scriptable and manual deployment tasks for the Tau UI (Netlify) and supporting API (Fly.io) across staging and production, consolidating outstanding recommendations from every deployment-related research document.'
status: superseded
created: '2026-04-20'
updated: '2026-05-14'
category: audit
superseded_by: docs/research/tau-cloud-activation-status.md
changelog:
  - date: '2026-05-14'
    note: 'Superseded by `tau-cloud-activation-status.md`. Tau Cloud activation residuals (M1–M14) absorbed; orthogonal observability/Docker/COI scriptable tasks remain tracked by `production-observability-readiness.md`, `observability-implementation-status.md`, `api-docker-build-optimization.md`, and `runtime-cross-origin-isolation-distribution.md`.'
  - date: '2026-05-05'
    note: 'Netlify/DNS recommendation rows (R1/R10 of `netlify-ui-deployment-strategy.md`) adjusted for `repos/tau-cloud` ownership + registrar→Cloudflare NS migration; superseded provisioning-script narrative removed from matrices.'
  - date: '2026-04-20'
    note: 'S2 (`.dockerignore` exclusion of `tarballs/{experiments,comparisons,package,active}`) landed; verified that the four root `tarballs/*.tgz` referenced by `package.json` `file:` deps remain inside the Docker build context.'
  - date: '2026-04-20'
    note: 'S5 (R6 OCJS smoke trail third gate) landed: `probeGltfScene` now also warns with `byteLength` + `childrenCount` + `bbox` when GLTFLoader produces a scene whose world bbox is non-finite (NaN/Infinity), closing the coordinate-transform-regression branch from staging-audit Finding 7. S18 (`scripts/src/repos/` `--branch` arg ordering) closed out separately in a sibling change.'
related:
  - docs/research/tau-cloud-activation-status.md
  - docs/research/staging-cors-coep-safari-rendering-audit.md
  - docs/research/netlify-ui-deployment-strategy.md
  - docs/research/production-observability-readiness.md
  - docs/research/observability-implementation-status.md
  - docs/research/runtime-cross-origin-isolation-distribution.md
  - docs/research/safari-cross-origin-isolation.md
  - docs/research/api-docker-build-optimization.md
  - docs/research/websocket-resilience.md
  - docs/research/socketio-production-resilience.md
---

> **Superseded.** Tau Cloud activation residuals (M1–M14 in the prior body) are consolidated into [`docs/research/tau-cloud-activation-status.md`](tau-cloud-activation-status.md). The orthogonal scriptable tasks catalogued here (observability instrumentation S1/S3/S4/S11–S13, Docker S2/S19/S20, COI S6–S9) remain tracked by their parent research docs: `production-observability-readiness.md`, `observability-implementation-status.md`, `api-docker-build-optimization.md`, `runtime-cross-origin-isolation-distribution.md`. Treat the body below as a historical scorecard.

# Prod + Staging UI Deployment Status

Consolidated, evidence-based audit of every deployment-related research document in `docs/research/`, reconciled against the current state of the codebase, infrastructure config, and CI workflows. The goal is a single source of truth for "what still needs to happen for Tau's prod + staging UI deployment to be considered fully landed", separating tasks that can be solved with code/config changes inside this repo from one-time human operations that can never be scripted.

## Executive Summary

The Netlify-fronted UI and Fly.io-fronted API are **green on staging (`taucad.dev`) and production (`tau.new`) with respect to deployed application codepaths**, **while DNS sovereignty is mid-migration**: Terraform shells + record declarations live in **`repos/tau-cloud`**, gated by registrar nameserver flips tracked in **`repos/tau-cloud/docs/dns-migration-plan.md`**. The staging incident root-caused in [`staging-cors-coep-safari-rendering-audit.md`](./staging-cors-coep-safari-rendering-audit.md) remains closed, and [`netlify-ui-deployment-strategy.md`](./netlify-ui-deployment-strategy.md) stays the functional reference for CI workflows even as Netlify/dashboard operations shift into Terraform modules.

What remains is a long tail of **observability gaps, defense-in-depth follow-ups, and inherently manual operator tasks**:

1. **Production OTLP plumbing is not wired** — `OTEL_EXPORTER_OTLP_ENDPOINT` is missing from both `fly.prod.toml` and `fly.staging.toml`, so Grafana Cloud receives no traces or logs from either environment despite the full SDK + auto-instrumentation pipeline being in place. The local `grafana/otel-lgtm` dev stack works; prod and staging are blind on traces and logs.
2. ~~**`.dockerignore` does not yet exclude `tarballs/{experiments,comparisons,package,active}`**~~ — **landed**. The four entries are now present in `.dockerignore`; verified via a `busybox`/`COPY tarballs/` scratch build that the four root-level `*.tgz` referenced by `package.json` `file:` deps survive the filter and the four subdirectories do not. See [Verification Evidence](#verification-evidence).
3. **Client-side telemetry instrumentation for 4 of 6 ingest events never wired** — the API ingest schema, validation, and metric recording are complete for `WEBSOCKET_RECONNECTION`, `EDITOR_LOAD`, `WASM_MODULE_LOAD`, and `INDEXEDDB_OPERATION`; no `apps/ui/` code POSTs to `/v1/telemetry/ingest` for any of them.
4. **Cross-origin-isolation distribution is partial** — `@taucad/runtime/cross-origin-isolation` Tier 1+2 shipped (used by Vite plugin and React Router adapter); the Tier 3 service-worker fallback and the public docs page never landed.
5. **Manual operator tasks** — Netlify PAT minting remains interactive; registrar **nameserver** delegation toggles authoritative DNS toward Cloudflare; OAuth URI verification / Let's Encrypt wait / subjective smoke judgement remain inherently human paced.

The remaining work is sized small and prioritised in [Recommendations](#recommendations) below.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Source Documents Inventoried](#source-documents-inventoried)
- [Implementation Status Matrix](#implementation-status-matrix)
- [Outstanding Scriptable Tasks](#outstanding-scriptable-tasks)
- [Outstanding Manual Operator Tasks](#outstanding-manual-operator-tasks)
- [Recommendations](#recommendations)
- [Verification Evidence](#verification-evidence)
- [References](#references)

## Problem Statement

Multiple research documents authored over the last six weeks each capture a slice of the deployment story (Netlify cutover, staging API observability, production observability readiness, Safari COI, Docker build optimization, WebSocket resilience). No single document answers "what is left for the Prod + Staging UI deployment to be done?". This audit fills that gap by enumerating every recommendation across every relevant research doc, marking each as DONE / PARTIAL / OUTSTANDING / EXCLUDED based on direct inspection of the codebase, and surfacing the residual tasks (scriptable and manual) with their rationale.

## Methodology

1. Inventoried every research document under `docs/research/` with a deployment, observability, infrastructure, or platform-correctness scope (see [Source Documents Inventoried](#source-documents-inventoried)).
2. For each document, extracted its numbered recommendations and findings.
3. Verified current implementation state by reading the relevant source files: `apps/api/Dockerfile`, `.dockerignore`, `apps/api/fly.{prod,staging}.toml`, `apps/api/app/database/database.service.ts`, `apps/api/app/main.ts`, `apps/api/app/telemetry/otel.ts`, `apps/api/app/api/chat/middleware/*`, `apps/ui/netlify.toml`, `apps/ui/netlify.prod.toml`, `apps/ui/app/machines/file-manager.{machine,worker}.ts`, `apps/ui/app/hooks/use-file-manager.tsx`, `infra/grafana/alerts/*.json`, `.github/workflows/{ci,deploy,prod-deploy-ui}.yml`, `scripts/src/smoke-cors.sh`, `packages/runtime/src/cross-origin-isolation/`, `packages/telemetry/src/registry.ts`.
4. Reconciled discrepancies between document-level `status` frontmatter and actual repo state (some docs marked `active` / `code-complete` predate subsequent regressions or partial reverts).
5. Categorised remaining work as **scriptable** (a code/config change in this repo unblocks it) or **manual** (requires a human action against a third-party console, registrar, OAuth provider, or judgement call).

## Source Documents Inventoried

| Document                                                                                             | Status (frontmatter) | Deployment Relevance | Reconciled state                                                                                                          |
| ---------------------------------------------------------------------------------------------------- | -------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [`staging-cors-coep-safari-rendering-audit.md`](./staging-cors-coep-safari-rendering-audit.md)       | active               | P0 staging incident  | Substantially landed; R6/R8/R10 explicitly excluded by operator; OPFS mount kept (R7 excluded)                            |
| [`netlify-ui-deployment-strategy.md`](./netlify-ui-deployment-strategy.md)                           | active               | Netlify cutover      | Code-complete; M1–M5 are inherent operator steps                                                                          |
| [`production-observability-readiness.md`](./production-observability-readiness.md)                   | draft                | Prod telemetry       | OTLP endpoint, sampling, secrets, datasources still outstanding                                                           |
| [`observability-implementation-status.md`](./observability-implementation-status.md)                 | active               | OTEL/Grafana audit   | G1, G2, G7, R2 done since publication; G3, G5, G6, G8–G15 still open                                                      |
| [`runtime-cross-origin-isolation-distribution.md`](./runtime-cross-origin-isolation-distribution.md) | draft                | COI distribution     | R1–R5 done; R6 (SW fallback), R7 (docs), R8 (boot logging) outstanding                                                    |
| [`safari-cross-origin-isolation.md`](./safari-cross-origin-isolation.md)                             | active               | Safari COI           | R1, R2 done; R3 (Vite CORP) and R4 (browser-conditional) deferred                                                         |
| [`api-docker-build-optimization.md`](./api-docker-build-optimization.md)                             | draft                | API image build      | R1–R6, R11, R12 landed; R1 has missing `.dockerignore` entries; R7 reverted with explicit rationale; R8–R10, R13 deferred |
| [`websocket-resilience.md`](./websocket-resilience.md)                                               | draft                | Transport resilience | Landscape document; no concrete repo-level R# tasks tracked here                                                          |
| [`socketio-production-resilience.md`](./socketio-production-resilience.md)                           | draft                | Socket.IO prod       | Largely subsumed by Redis Streams migration (already shipped); residual items folded into observability gaps              |
| [`grafana-observability-gaps.md`](./grafana-observability-gaps.md)                                   | superseded           | Historical           | Superseded by `observability-implementation-status.md`                                                                    |
| [`observability-architecture.md`](./observability-architecture.md)                                   | superseded           | Historical           | Superseded by `observability-architecture-v2.md`                                                                          |
| [`safari-svg-rendering-compatibility.md`](./safari-svg-rendering-compatibility.md)                   | active               | Safari rendering     | Out of deployment scope (rendering correctness, not deploy plumbing)                                                      |

## Implementation Status Matrix

Per-document scorecard. Status legend: ✅ DONE • 🟡 PARTIAL • ⏳ OUTSTANDING • 🚫 EXCLUDED (operator decision, kept for traceability).

### `staging-cors-coep-safari-rendering-audit.md`

| #   | Recommendation                                                                 | Status | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Pino `{ err: error }` logging + cause-preserving rethrow in `runMigrations`    | ✅     | `apps/api/app/database/database.service.ts` — uses `this.logger.error({ err, hint }, …)` and `new Error('Migration failed', { cause: error })`                                                                                                                                                                                                                                                                                                                                         |
| R2  | Pre-migration `SELECT 1` connectivity probe with hint mapping                  | ✅     | `probeDatabaseConnectivity()` + `mapPostgresErrorToHint` in `apps/api/app/database/postgres-error-hint.utils.ts`                                                                                                                                                                                                                                                                                                                                                                       |
| R3  | Grafana log-content alert on `Database (connectivity probe\|migration) failed` | ✅     | `infra/grafana/alerts/tau-critical.json` → `database-startup-failure` alert (Loki query, 5m window)                                                                                                                                                                                                                                                                                                                                                                                    |
| R4  | Per-incident remediation (unpause Supabase)                                    | ✅     | One-time operator action confirmed; pattern is now self-documenting through R1–R3 logs                                                                                                                                                                                                                                                                                                                                                                                                 |
| R5  | Add `https://api.taucad.dev wss://api.taucad.dev` to CSP `connect-src`         | ✅     | `apps/ui/netlify.toml` (staging) and `apps/ui/netlify.prod.toml` (`api.tau.new wss://api.tau.new`)                                                                                                                                                                                                                                                                                                                                                                                     |
| R6  | 3-line diagnostic probe in `convertReplicadGeometriesToGltf` / model-viewer    | ✅     | Kernel-side: `convertReplicadGeometriesToGltf` debug-logs `format`/`nodeCount`/`byteLength` (`packages/runtime/src/kernels/replicad/utils/replicad-to-gltf.ts:129`). UI-side: `probeGltfScene` (`apps/ui/app/components/geometry/graphics/three/react/gltf-mesh.tsx`) warns with the full probe payload on **both** the empty-children gate (gate 2) and the non-finite-bbox gate (gate 3), silent on the happy path. Test coverage: `gltf-mesh.test.tsx`, `replicad-to-gltf.test.ts`. |
| R7  | Remove OPFS `/node_modules` mount entirely                                     | 🚫     | Excluded — OPFS mount retained per operator decision; falls through to IndexedDB on Safari                                                                                                                                                                                                                                                                                                                                                                                             |
| R8  | Wire `sharedWorker` opt-in in `connectWorkerActor`                             | ✅     | `apps/ui/app/hooks/use-file-manager.tsx:107-117` passes `parentWorker`/`parentFilePoolBuffer` into `fileManagerMachine` context                                                                                                                                                                                                                                                                                                                                                        |
| R9  | Vite plugin to silently stub `fs`/`path` warnings                              | 🚫     | Excluded — warnings are cosmetic; not a functional regression                                                                                                                                                                                                                                                                                                                                                                                                                          |
| R10 | Demote `Initializing kernel: …` from `debug` to `trace`                        | ⏳     | Not landed (low-impact noise reduction)                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| R11 | Switch CSP from Report-Only to enforcing                                       | 🚫     | Excluded — leaves report-only as monitoring channel                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| R12 | Move `api.taucad.dev` Fly cert from `tau-api` to `tau-api-staging`             | ✅     | Confirmed via `flyctl certs list` evidence in source doc; certificate now bound to staging app                                                                                                                                                                                                                                                                                                                                                                                         |
| R13 | Post-deploy CORS smoke test in CI for both staging and production              | ✅     | `scripts/src/smoke-cors.sh` invoked from `.github/workflows/{deploy,prod-deploy-ui}.yml`                                                                                                                                                                                                                                                                                                                                                                                               |

### `netlify-ui-deployment-strategy.md`

| #   | Recommendation                                                                              | Status | Evidence                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Provision `taucad-prod` Netlify site                                                        | 🟡     | Operational site + domain pairing continues; infra-of-record is **`repos/tau-cloud`** (`modules/netlify-site` + **`repos/tau-cloud/docs/dns-migration-plan.md`**), superseding ad-hoc shell bootstrapping |
| R2  | Repair env vars on existing `taucad` site (consistent staging endpoints)                    | ✅     | Netlify dashboard env aligned with `netlify.toml`                                                                                                                                                         |
| R3  | Configure env vars on `taucad-prod` (production endpoints)                                  | ✅     | `apps/ui/netlify.prod.toml` + Netlify dashboard env                                                                                                                                                       |
| R4  | Verify per-PR deploy previews still work on `taucad`                                        | ✅     | Confirmed via PR deploy history                                                                                                                                                                           |
| R5  | Add `.github/workflows/prod-deploy-ui.yml` (workflow_dispatch, environment: production)     | ✅     | File present; uses `netlify-cli` with `--prod --site $NETLIFY_PROD_SITE_ID`                                                                                                                               |
| R6  | Pin `netlify-cli` version in CI                                                             | ✅     | Pinned in `prod-deploy-ui.yml`                                                                                                                                                                            |
| R7  | Update `apps/api/fly.staging.toml` `ADDITIONAL_CORS_ORIGINS` (Netlify default + main alias) | ✅     | `["https://deploy-preview-*--taucad.netlify.app","https://taucad.netlify.app"]`                                                                                                                           |
| R8  | Update `apps/api/fly.prod.toml` `ADDITIONAL_CORS_ORIGINS`                                   | ✅     | `["https://deploy-preview-*--taucad-prod.netlify.app","https://taucad-prod.netlify.app"]`                                                                                                                 |
| R9  | Audit Helmet `crossOriginResourcePolicy: 'cross-origin'`                                    | ✅     | `apps/api/app/main.ts:78-80` uses `apiHeaders['Cross-Origin-Resource-Policy']`                                                                                                                            |
| R10 | Attach custom domains (`taucad.dev`, `tau.new`) to Netlify sites + DNS cutover              | 🟡     | Netlify attachments live; apex DNS authoritative migration executes via **`repos/tau-cloud/docs/dns-migration-plan.md`**                                                                                  |
| R11 | Decommission redundant Fly UI deploys (`apps/ui/fly.*.toml`, `deploy-ui-staging`)           | ⏳     | Files still present; Fly UI machines may still serve traffic for the same hostname (verify + cleanup)                                                                                                     |
| R12 | Update `review.yml` (drop UI half if Netlify deploy previews fully replace `tau-ui-pr-*`)   | ⏳     | Pending verification with R11                                                                                                                                                                             |
| R13 | Add `NETLIFY_AUTH_TOKEN` + `NETLIFY_PROD_SITE_ID` to GitHub `production` env                | ✅     | Secrets configured; workflow consumes them                                                                                                                                                                |
| R14 | Sanity-test Better Auth callback URLs for Netlify origins                                   | ✅     | Auth flows live on both `taucad.dev` and `tau.new`                                                                                                                                                        |
| R15 | File follow-up bug: `scripts/src/repos/` `--branch` arg ordering                            | ⏳     | Not filed yet                                                                                                                                                                                             |
| R16 | Document deployment topology under `docs/architecture/`                                     | ✅     | `docs/architecture/ui-deployment-topology.md` exists                                                                                                                                                      |

### `production-observability-readiness.md`

| #   | Recommendation                                                                      | Status        | Evidence                                                                                       |
| --- | ----------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------- |
| R1  | Add `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_TRACES_SAMPLER` to `fly.*.toml`           | ⏳            | Both files only set `OTEL_METRICS_PORT` and `OTEL_EXPORTER_OTLP_COMPRESSION` — endpoint absent |
| R2  | Set OTLP auth header via `fly secrets set OTEL_EXPORTER_OTLP_HEADERS=…`             | ⏳ (operator) | Cannot verify from repo; required after R1                                                     |
| R3  | Create Grafana Cloud datasources with matching UIDs (`prometheus`, `loki`, `tempo`) | ⏳ (operator) | Required for dashboards/alerts to be functional in Grafana Cloud                               |
| R4  | Add CI dashboard sync step (`pnpm grafana:sync` in `deploy.yml`)                    | ⏳            | No `grafana:sync` step in `.github/workflows/deploy.yml`                                       |
| R5  | Add PostgreSQL + Redis datasources in Grafana Cloud                                 | ⏳ (operator) | Datasources provisioned in local LGTM stack; not in Grafana Cloud                              |
| R6  | Add `GRAFANA_URL` + `GRAFANA_API_KEY` to GH environments                            | ⏳ (operator) | Required for R4                                                                                |
| R7  | Create `infra/fly-secrets.md` checklist                                             | ⏳            | Not present                                                                                    |
| R8  | Extend sync script with datasource provisioning                                     | ⏳            | `sync-grafana-dashboards.sh` only handles dashboards                                           |
| R9  | Deploy Fly Log Shipper                                                              | ⏳            | No `infra/fly-log-shipper/` config                                                             |
| R10 | Integrate Supabase Prometheus metrics                                               | ⏳ (operator) | Optional/P3                                                                                    |

### `observability-implementation-status.md`

| #   | Gap                                                                       | Status        | Evidence                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | `sse.events` metric never recorded                                        | ✅            | `apps/api/app/api/chat/chat.controller.ts:255-261` (`createSseEventCountTransform`) records `metricsService.sseEvents.add(1, …)`                                                    |
| G2  | LLM error rate alert non-functional (no `error_type` recorded on failure) | ✅            | `apps/api/app/api/chat/middleware/llm-timing.middleware.ts:56-62` records `genAiOperationDuration` with `ERROR_TYPE` in catch path                                                  |
| G3  | Client-side instrumentation for 4 new event types not wired               | ⏳            | Server schema + recording present; no `apps/ui/` POSTs for `WEBSOCKET_RECONNECTION`, `EDITOR_LOAD`, `WASM_MODULE_LOAD`, `INDEXEDDB_OPERATION`                                       |
| G4  | Staging environment has no observability                                  | ✅            | `apps/api/fly.staging.toml` now defines `[[http_service.checks]]`, `[metrics]`, OTEL env                                                                                            |
| G5  | Redis deep-dive dashboard                                                 | ⏳            | Datasource provisioned locally; no dashboard JSON                                                                                                                                   |
| G6  | PostgreSQL deep-dive dashboard                                            | ⏳            | Datasource provisioned locally; no dashboard JSON                                                                                                                                   |
| G7  | `gen_ai.provider.name` attribute not recorded                             | ✅            | `agent-safeguards`, `usage-tracking`, `llm-timing`, `agent-iterations`, `ttft-callback` middleware all set `AttributeKey.GEN_AI_PROVIDER_NAME` when `otelProviderName` is available |
| G8  | Histogram exemplar configuration                                          | ⏳            | `OTEL_METRICS_EXEMPLAR_FILTER=trace_based` set in `otel.ts`; PrometheusExporter exemplar wiring not validated end-to-end                                                            |
| G9  | Grafana SLO App not installed                                             | ⏳ (operator) | Optional/P3                                                                                                                                                                         |
| G10 | W3C trace context extraction unused (`withExtractedContext()`)            | ⏳            | Inject path used; extract path absent in production gateway                                                                                                                         |
| G11 | `TracerService.withSpan()` unused in production                           | ⏳            | Only used in tests                                                                                                                                                                  |
| G12 | Fly.io Prometheus federation                                              | ⏳ (operator) | Configure scrape job in Grafana Cloud                                                                                                                                               |
| G13 | File operation metrics not in registry                                    | ⏳            | Requires client-side IndexedDB/FS worker instrumentation                                                                                                                            |
| G14 | OTEL SDK loaded via import, not `--require`                               | ⏳            | `apps/api/app/main.ts` side-effect imports `#telemetry/otel.js`; Dockerfile note flags doubling risk if both used                                                                   |
| G15 | Grafana Faro (client-side RUM)                                            | ⏳ (operator) | Optional/P3                                                                                                                                                                         |

### `runtime-cross-origin-isolation-distribution.md`

| #   | Recommendation                                                               | Status | Evidence                                                                             |
| --- | ---------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| R1  | `@taucad/runtime/cross-origin-isolation` (Tier 1)                            | ✅     | `packages/runtime/src/cross-origin-isolation/index.ts`                               |
| R2  | Reimplement Vite plugin on Tier 1                                            | ✅     | `packages/runtime/src/vite/index.ts`                                                 |
| R3  | React Router adapter + adopt in `apps/ui`                                    | ✅     | `packages/runtime/src/react-router/index.ts`                                         |
| R4  | API helmet aligned with `apiHeaders['Cross-Origin-Resource-Policy']`         | ✅     | `apps/api/app/main.ts:74-81`                                                         |
| R5  | Express / Fastify / Hono / Edge adapters (Tier 2)                            | 🟡     | React Router adapter present; verify whether further framework adapters exist        |
| R6  | Vendor `coi-serviceworker.js` as `@taucad/runtime/cross-origin-isolation/sw` | ⏳     | No SW vendor in `packages/runtime/src/cross-origin-isolation/`                       |
| R7  | Document under `apps/ui/content/docs/(runtime)/`                             | ⏳     | No `cross-origin-isolation` doc page found                                           |
| R8  | Boot-time visibility (`crossOriginIsolated === false` warning)               | ⏳     | `inspectCrossOriginIsolation` exists; not invoked at runtime client boot for warning |

### `safari-cross-origin-isolation.md`

| #   | Recommendation                                                           | Status | Evidence                                                                    |
| --- | ------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------- |
| R1  | Universal `require-corp` in Vite plugin and Netlify                      | ✅     | `apps/ui/netlify*.toml` use `Cross-Origin-Embedder-Policy = "require-corp"` |
| R2  | Code-level SAB fallbacks                                                 | ✅     | Already in place in `runtime-client.ts`, `file-manager.machine.ts`          |
| R3  | Add `Cross-Origin-Resource-Policy: same-origin` to Vite plugin responses | ⏳     | No CORP header in Vite plugin source                                        |
| R4  | Browser-conditional headers via Netlify Edge Function (`credentialless`) | 🚫     | Deferred — universal `require-corp` works for Tau                           |

### `api-docker-build-optimization.md`

| #   | Recommendation                                                                                                                                                      | Status | Evidence                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Extend `.dockerignore` to exclude `tarballs/{experiments,comparisons,package,active}`, `apps/api/reports`, `packages/runtime/{reports,occt-reports}`, `**/.netlify` | ✅     | All entries present in `.dockerignore`; root-level `tarballs/*.tgz` (consumed by `package.json` `file:` deps) verified to remain inside the build context |
| R2  | Remove redundant `COPY package.json ./`                                                                                                                             | ✅     | Single `COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./` line                                                                                     |
| R3  | Split deps stage from build stage (`COPY --parents */*/package.json ./`)                                                                                            | ✅     | Dockerfile lines 41-53                                                                                                                                    |
| R4  | Pin pnpm in base via `npm install -g pnpm@…` (drop Corepack)                                                                                                        | ✅     | Dockerfile line 37                                                                                                                                        |
| R5  | Add Nx cache mount on build step                                                                                                                                    | ✅     | `--mount=type=cache,id=nx,target=/app/.nx/cache`                                                                                                          |
| R6  | `pnpm install --frozen-lockfile --prefer-offline`                                                                                                                   | ✅     | Dockerfile line 53                                                                                                                                        |
| R7  | `pnpm install --filter=@taucad/api...`                                                                                                                              | 🚫     | Reverted with explicit rationale — Nx project-graph plugins load every workspace `vite.config.ts` at startup                                              |
| R8  | Wire `NX_CLOUD_ACCESS_TOKEN` as Fly.io build secret                                                                                                                 | 🟡     | `--mount=type=secret,id=nx_cloud_token,env=NX_CLOUD_ACCESS_TOKEN` present; CI secret plumbing not verified                                                |
| R9  | Drop `pnpm fetch`                                                                                                                                                   | ✅     | Removed (deviation noted in Dockerfile header)                                                                                                            |
| R10 | Switch runtime base to alpine / distroless                                                                                                                          | ⏳     | Stays on `node:24-slim` pending `@pyroscope/nodejs` musl smoke test                                                                                       |
| R11 | Add non-root `nestjs` user                                                                                                                                          | ✅     | Dockerfile lines 75-78                                                                                                                                    |
| R12 | Add HEALTHCHECK directive                                                                                                                                           | ✅     | Dockerfile lines 90-91                                                                                                                                    |
| R13 | Set up registry-backed BuildKit cache                                                                                                                               | ⏳     | Not configured                                                                                                                                            |

## Outstanding Scriptable Tasks

Tasks below are bounded code/config changes inside this repo. Numbered sequentially across all source documents; each preserves the original document reference for traceability.

| #       | Task                                                                                                                                                                | Source                     | Files / Surface                                                                                                                         | Priority | Effort | Rationale                                                                                                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1      | Add `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_TRACES_SAMPLER` (+ `OTEL_TRACES_SAMPLER_ARG`) to `[env]` of both Fly TOMLs                                                | prod-observability R1      | `apps/api/fly.prod.toml`, `apps/api/fly.staging.toml`                                                                                   | P0       | XS     | Without an endpoint, the `OTLPTraceExporter`/`OTLPLogExporter` initialise without a target — Grafana Cloud receives no traces or logs. Sampling pin prevents tail-end cost surprise.                                             |
| ~~S2~~  | ~~Add `tarballs/experiments`, `tarballs/comparisons`, `tarballs/package`, `tarballs/active` to `.dockerignore`~~ — **DONE 2026-04-20**                              | api-docker R1              | `.dockerignore`                                                                                                                         | —        | —      | Landed; verified that the four root-level `tarballs/*.tgz` consumed by `package.json` `file:` deps remain inside the Docker build context (see [Verification Evidence](#verification-evidence)).                                 |
| S3      | Add CI dashboard sync step `pnpm grafana:sync` to `.github/workflows/deploy.yml` (gated on `secrets.GRAFANA_URL` + `GRAFANA_API_KEY` presence)                      | prod-observability R4 + R6 | `.github/workflows/deploy.yml`                                                                                                          | P1       | S      | Dashboards-as-code only ship if CI runs the sync. Today changes to `infra/grafana/dashboards/` require manual `pnpm grafana:sync`.                                                                                               |
| S4      | Wire client-side instrumentation for `WEBSOCKET_RECONNECTION`, `EDITOR_LOAD`, `WASM_MODULE_LOAD`, `INDEXEDDB_OPERATION` ingest events                               | observability G3           | `apps/ui/app/hooks/use-chat-rpc-socket.tsx`, FM machine, runtime worker init paths                                                      | P1       | M      | Server pipeline is complete; UI does not POST to `/v1/telemetry/ingest` for these events, so dashboards show no data.                                                                                                            |
| ~~S5~~  | ~~Add diagnostic probe in `convertReplicadGeometriesToGltf` and model viewer (log GLB byteLength, `gltf.scene.children.length`, world bbox)~~ — **DONE 2026-04-20** | staging-audit R6           | `packages/runtime/src/kernels/replicad/utils/replicad-to-gltf.ts`, `apps/ui/app/components/geometry/graphics/three/react/gltf-mesh.tsx` | —        | —      | Three R6 gates now covered: kernel-side debug log (gate 1: byteLength==0), UI `probeGltfScene` warns on childrenCount==0 (gate 2) and on non-finite world bbox (gate 3 — coordinate-transform regression). Silent on happy path. |
| S6      | Vendor `coi-serviceworker.js` as `@taucad/runtime/cross-origin-isolation/sw` + `register()` helper                                                                  | runtime-coi R6             | `packages/runtime/src/cross-origin-isolation/sw.ts` (new)                                                                               | P2       | S      | Enables external runtime consumers on static hosts (GitHub Pages, S3) where header control is unavailable.                                                                                                                       |
| S7      | Add `apps/ui/content/docs/(runtime)/cross-origin-isolation` page with copy-paste recipe per layer                                                                   | runtime-coi R7             | `apps/ui/content/docs/(runtime)/`                                                                                                       | P2       | M      | Tier 1 + Tier 2 surfaces exist but external consumers cannot find them.                                                                                                                                                          |
| S8      | Call `inspectCrossOriginIsolation()` at runtime client boot when `crossOriginIsolated === false` and emit a structured warning                                      | runtime-coi R8             | `packages/runtime/src/client/runtime-client.ts`                                                                                         | P2       | XS     | Today the runtime silently degrades on misconfigured hosts; consumers debug for hours.                                                                                                                                           |
| S9      | Add `Cross-Origin-Resource-Policy: same-origin` to `@taucad/vite/cross-origin-isolation` plugin responses                                                           | safari-coi R3              | `packages/runtime/src/vite/index.ts` (or matching Vite plugin)                                                                          | P2       | XS     | Ensures Vite-served assets pass CORP checks under COEP `require-corp`; closes a foot-gun for runtime consumers.                                                                                                                  |
| S10     | Demote `Initializing kernel: …` log statements from `logger.debug` to `logger.trace`                                                                                | staging-audit R10          | `packages/runtime/src/kernels/*/`                                                                                                       | P3       | XS     | Reduces console noise when multiple FM workers are alive; trivial.                                                                                                                                                               |
| S11     | Wire `withExtractedContext()` in chat RPC gateway so client→server trace context propagates                                                                         | observability G10          | `apps/api/app/api/chat/chat-rpc.gateway.ts`                                                                                             | P2       | S      | Today traces are inject-only (server→client). Round-trip continuity unblocks correlated UI→API debugging.                                                                                                                        |
| S12     | Build Redis deep-dive dashboard JSON using the provisioned Redis datasource                                                                                         | observability G5           | `infra/grafana/dashboards/`                                                                                                             | P2       | M      | Datasource is wired locally but no dashboard consumes it — stream length, consumer lag, slow log invisible.                                                                                                                      |
| S13     | Build PostgreSQL deep-dive dashboard JSON using the provisioned PostgreSQL datasource                                                                               | observability G6           | `infra/grafana/dashboards/`                                                                                                             | P2       | M      | `pg_stat_statements` slow query analysis unavailable today.                                                                                                                                                                      |
| S14     | Decommission Fly UI deploys: remove `apps/ui/fly.{prod,staging}.toml`, drop `deploy-ui-staging` job in `ci.yml`, remove UI half of `review.yml`                     | netlify R11 + R12          | `apps/ui/fly.*.toml`, `.github/workflows/{ci,review,deploy}.yml`                                                                        | P1       | M      | Netlify has been stable for ≥1 week (per netlify-strategy doc); leaving the Fly path live is dead surface area.                                                                                                                  |
| S15     | Create `infra/fly-secrets.md` checklist documenting every required Fly secret per environment                                                                       | prod-observability R7      | `infra/fly-secrets.md` (new)                                                                                                            | P2       | S      | Prevents knowledge loss when secrets rotate or new environments are stood up.                                                                                                                                                    |
| S16     | Extend `sync-grafana-dashboards.sh` with `ensure_datasource()` to provision Prometheus/Loki/Tempo/Postgres/Redis datasources via Grafana API                        | prod-observability R8      | `apps/api/scripts/sync-grafana-dashboards.sh`                                                                                           | P3       | M      | Full IaC datasource management; today datasource provisioning is a manual one-time step per env.                                                                                                                                 |
| S17     | Author `infra/fly-log-shipper/fly.toml` for platform log export                                                                                                     | prod-observability R9      | `infra/fly-log-shipper/` (new)                                                                                                          | P3       | M      | Captures Fly platform-level logs (machine lifecycle, builder events) absent from app stdout.                                                                                                                                     |
| ~~S18~~ | ~~File follow-up bug fix for `scripts/src/repos/` `--branch` arg ordering~~ — **DONE 2026-04-20** (resolved out-of-band in a sibling change)                        | netlify R15                | `scripts/src/repos/`                                                                                                                    | —        | —      | Bug closed elsewhere; `pnpm repos add ... --clone -b <branch>` is no longer arg-order-sensitive.                                                                                                                                 |
| S19     | Validate `NX_CLOUD_ACCESS_TOKEN` Fly build secret plumbing end-to-end (CI sets it, Dockerfile receives it, build step uses it)                                      | api-docker R8              | `.github/workflows/deploy.yml`, `apps/api/Dockerfile`                                                                                   | P2       | S      | Mount syntax present; verify the secret actually flows from GH → Fly builder → BuildKit secret → Nx Cloud auth.                                                                                                                  |
| S20     | Smoke-test `node:24-alpine` runtime base in `fly.staging.toml` (R10 of api-docker), gated on `@pyroscope/nodejs` musl compatibility check                           | api-docker R10             | `apps/api/Dockerfile`, `fly.staging.toml`                                                                                               | P3       | M      | Image-size win (~70 MB → ~25 MB if distroless), but the prior block was unverified pyroscope musl support.                                                                                                                       |

## Outstanding Manual Operator Tasks

These steps are inherent to third-party APIs (OAuth providers, registrars, Netlify PAT minting, Let's Encrypt timing) or human judgement. They cannot be eliminated by additional code in this repo.

| #   | Manual Step                                                                                                                                                          | Source                          | Why It Cannot Be Scripted                                                                                                    | Frequency                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| M1  | Set OTLP auth header via `fly secrets set OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic\\ <base64>`                                                                 | prod-observability R2           | Secrets must never appear in repo; one-time per env unless Grafana Cloud token rotates.                                      | One-time + on rotation        |
| M2  | Create / rename Grafana Cloud datasources to UIDs `prometheus`, `loki`, `tempo` (and add Fly Prometheus federation as Prometheus datasource)                         | prod-observability R3 + M2 + M3 | Grafana Cloud admin UI; programmatic alternative covered by S16 once it ships.                                               | One-time per env              |
| M3  | Add PostgreSQL datasource (Supabase connection) with UID `postgresql` in Grafana Cloud                                                                               | prod-observability M4           | Connection string is a secret + Grafana plugin install requires admin.                                                       | One-time                      |
| M4  | Install `redis-datasource` plugin + add Redis datasource (UID `redis`) in Grafana Cloud                                                                              | prod-observability M5           | Plugin install requires Grafana Cloud admin; URL is a secret.                                                                | One-time                      |
| M5  | Add `GRAFANA_URL` + `GRAFANA_API_KEY` to GitHub `staging` and `production` environment secrets                                                                       | prod-observability R6           | Required for S3; secrets are environment-scoped.                                                                             | One-time per env              |
| M6  | Deploy Fly Log Shipper app with Loki sink secrets                                                                                                                    | prod-observability M7           | Requires Fly app creation + secret population per env.                                                                       | One-time per env              |
| M7  | Configure Grafana Cloud scrape job (or Alloy) for Supabase Prometheus endpoint                                                                                       | prod-observability M8           | Optional/P3; requires Supabase service role key.                                                                             | One-time                      |
| M8  | Paste Netlify PAT into `gh secret set NETLIFY_AUTH_TOKEN --env production` via interactive provisioning script                                                       | netlify M1                      | Netlify intentionally does not expose programmatic PAT minting (PAT is the root credential for `netlify-cli`).               | One-time per acct/repo pair   |
| M9  | Verify Google + GitHub OAuth redirect URIs include `https://{taucad.dev,tau.new}/api/auth/callback/{github,google}`                                                  | netlify M2                      | No `gcloud`/GitHub API for mutating an OAuth client's redirect URI list — web console only.                                  | One-time per env per provider |
| M10 | Domain-registrar DNS cutover for new hostnames (when adding environments)                                                                                            | netlify M3                      | Registrar (Porkbun / Cloudflare / similar) — repo intentionally has no registrar API integration.                            | Per environment               |
| M11 | Wait for Netlify-managed Let's Encrypt TLS provisioning after attaching a custom domain                                                                              | netlify M4                      | Netlify exposes cert state read-only (`netlify api showSiteTLSCertificate`); no force-provision endpoint or SLA.             | Per cutover                   |
| M12 | Production smoke test: visual + behavioural + auth E2E pass before promoting deploy                                                                                  | netlify M5                      | E2E covers deterministic surface; final gate is human judgement.                                                             | Per release                   |
| M13 | When a future DB outage occurs, perform per-incident remediation (unpause Supabase / rotate role / scale pool / etc.) using the structured log hint emitted by R1+R2 | staging-audit R4                | Action is incident-specific; the point of R1+R2+R3 is that the operator action is now a lookup against the log, not a guess. | Per incident                  |
| M14 | One-time human sweep of the Netlify dashboard for the `taucad` site to delete the obsolete `TAU_WEBSOCKET_URL=wss://api.tau.new` env var if still present            | netlify R2 (closure check)      | Requires Netlify admin; verifies the migration document's stated state still matches reality.                                | One-time                      |

## Recommendations

Prioritised consolidated list. P0/P1 items unblock observability or close known regressions; P2/P3 are defense-in-depth and cosmetic.

| #      | Action                                                                                                                                                                                                  | Priority         | Effort | Impact   | Addresses         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------ | -------- | ----------------- |
| R1     | Land **S1** (OTLP endpoint + sampling in Fly TOMLs) and complete **M1** (set OTLP auth header secret) to enable traces+logs in Grafana Cloud                                                            | P0               | XS     | High     | S1, M1            |
| R2     | Land **S4** (client-side instrumentation for 4 ingest events) so the dashboards backed by `WEBSOCKET_RECONNECTION`, `EDITOR_LOAD`, `WASM_MODULE_LOAD`, `INDEXEDDB_OPERATION` show data                  | P1               | M      | High     | S4                |
| R3     | Land **S3** + **M5** (CI dashboard sync + GitHub env secrets) so dashboards-as-code actually sync on deploy                                                                                             | P1               | S      | High     | S3, M5            |
| R4     | Land **S14** (decommission Fly UI deploys) — Netlify is stable; the parallel Fly UI path is dead surface area                                                                                           | P1               | M      | Med      | S14               |
| ~~R5~~ | ~~Land **S2** (`.dockerignore` defensive entries) to prevent a latent ~2 GB build-context regression~~ — **DONE 2026-04-20**                                                                            | —                | —      | —        | S2                |
| ~~R6~~ | ~~Land **S5** (Safari OCJS diagnostic probe) so the long-running blank-viewport bug is finally root-caused~~ — **DONE 2026-04-20**                                                                      | —                | —      | —        | S5                |
| R7     | Land **S6** + **S7** + **S8** + **S9** (runtime COI distribution close-out: SW fallback, docs page, boot warning, Vite CORP)                                                                            | P2               | S–M    | Med      | S6–S9             |
| R8     | Land **S11** (W3C trace context extraction) for full round-trip distributed tracing                                                                                                                     | P2               | S      | Med      | S11               |
| R9     | Land **S12** + **S13** (Redis + PostgreSQL deep-dive dashboards) since the datasources are already provisioned                                                                                          | P2               | M      | Med      | S12, S13          |
| R10    | Land **S15** (Fly secrets checklist) before the next environment is stood up                                                                                                                            | P2               | S      | Med      | S15               |
| R11    | Land **S19** (validate Nx Cloud token plumbing) — high-leverage warm-cache win if functional                                                                                                            | P2               | S      | Med      | S19               |
| R12    | Land **S10** (logger trace demotion), **S16** (datasource provisioning script), **S17** (Fly Log Shipper config), **S20** (alpine runtime smoke test) as P3 cleanup (S18 closed out-of-band 2026-04-20) | P3               | XS–M   | Low–Med  | S10, S16–S17, S20 |
| R13    | Operator: complete **M2–M7** (Grafana Cloud datasources, plugin install, GH env secrets, Fly Log Shipper deploy, optional Supabase scrape)                                                              | P0–P3 (per item) | Varies | High–Low | M2–M7             |
| R14    | Operator: complete **M14** (audit `taucad` Netlify env vars for stale `TAU_WEBSOCKET_URL` mismatch)                                                                                                     | P1               | XS     | Med      | M14               |

## Verification Evidence

Spot-checks performed during this audit, with file:line citations to rule out drift between research-doc claims and current state.

```text
$ rg -n 'OTEL_EXPORTER_OTLP_ENDPOINT|OTEL_TRACES_SAMPLER' apps/api/fly.prod.toml apps/api/fly.staging.toml
(no matches)                                              ← S1 outstanding

$ rg -n 'tarballs/(experiments|comparisons|package|active)' .dockerignore
14:tarballs/experiments
15:tarballs/comparisons
16:tarballs/package
17:tarballs/active                                         ← S2 done 2026-04-20

# Build-context survival check (BuildKit semantics)
$ docker build -f /tmp/dockerignore-check.Dockerfile .
[2/3] COPY tarballs/ /tarballs/                            ← all four root *.tgz copied
[3/3] RUN test -f /tarballs/opencascade.js-3.0.0-beta.d453dbf.tgz \
       && test -f /tarballs/replicad-0.21.0-v8.56.tgz \
       && test -f /tarballs/replicad-opencascadejs-0.21.0-v8.55.tgz \
       && test -f /tarballs/taucad-assimpjs-0.0.18.tgz
ALL ROOT TARBALLS PRESENT                                  ← `pnpm install` `file:` deps unaffected

# Negative check (sentinels in the four ignored subdirs)
$ docker build -f /tmp/dockerignore-exclude.Dockerfile .
EXCLUDES OK                                                ← experiments/comparisons/package/active stripped from context

$ rg -n 'probeGltfScene' apps/ui/app/components/geometry/graphics/three/react
gltf-mesh.tsx:    96: export function probeGltfScene(gltf: GLTF, byteLength: number): void {
gltf-mesh.tsx:   307:        probeGltfScene(gltf, gltfFile.byteLength);
gltf-mesh.test.tsx: 5: import { probeGltfScene } from '#components/geometry/graphics/three/react/gltf-mesh.js';
                                                           ← S5 done 2026-04-20 (line numbers approximate)

$ pnpm nx test ui ./app/components/geometry/graphics/three/react/gltf-mesh.test.tsx --watch=false
✓ Gate 2 (childrenCount === 0) → "GLTFLoader produced a scene with zero children"
✓ Gate 3 (childrenCount > 0 && !bbox.finite) → "GLTFLoader produced a scene with a non-finite bounding box"
✓ Happy path (≥1 child + finite bbox) → silent
✓ Multi-child finite path → silent
Test Files  1 passed (1) · Tests  4 passed (4) · Type Errors  no errors

$ rg -n 'sseEvents.add' apps/api/app/api/chat/chat.controller.ts
255:    return new TransformStream({
258:        this.metricsService.sseEvents.add(1, …)        ← G1 done

$ rg -n 'GEN_AI_PROVIDER_NAME' apps/api/app/api/chat/middleware
(matches in 5 middleware files)                           ← G7 done

$ rg -n 'ERROR_TYPE' apps/api/app/api/chat/middleware/llm-timing.middleware.ts
60: [AttributeKey.ERROR_TYPE]: error instanceof Error ? …  ← G2 done

$ rg -n 'sharedWorker' apps/ui/app/hooks/use-file-manager.tsx
107:  const parentWorker = useContext(SharedWorkerContext);
116:    sharedWorker: parentWorker,                         ← R8 done

$ rg -n 'database-startup-failure' infra/grafana/alerts
tau-critical.json:  "uid": "database-startup-failure"      ← R3 done

$ rg -n 'smoke-cors.sh' .github/workflows
deploy.yml: scripts/src/smoke-cors.sh
prod-deploy-ui.yml: scripts/src/smoke-cors.sh             ← R13 done

$ rg -n 'crossOriginResourcePolicy' apps/api/app/main.ts
78:    crossOriginResourcePolicy: {                         ← R9 done
79:      policy: apiHeaders['Cross-Origin-Resource-Policy'] as 'cross-origin',
```

## References

- [`staging-cors-coep-safari-rendering-audit.md`](./staging-cors-coep-safari-rendering-audit.md)
- [`netlify-ui-deployment-strategy.md`](./netlify-ui-deployment-strategy.md)
- [`production-observability-readiness.md`](./production-observability-readiness.md)
- [`observability-implementation-status.md`](./observability-implementation-status.md)
- [`runtime-cross-origin-isolation-distribution.md`](./runtime-cross-origin-isolation-distribution.md)
- [`safari-cross-origin-isolation.md`](./safari-cross-origin-isolation.md)
- [`api-docker-build-optimization.md`](./api-docker-build-optimization.md)
- [`websocket-resilience.md`](./websocket-resilience.md)
- [`socketio-production-resilience.md`](./socketio-production-resilience.md)
- Architecture: [`docs/architecture/ui-deployment-topology.md`](../architecture/ui-deployment-topology.md)
- Provisioning / DNS: **`repos/tau-cloud`** (Terraform — `pnpm repos sync`); **`scripts/src/smoke-cors.sh`**
- Workflows: `.github/workflows/{ci,deploy,prod-deploy-ui,review}.yml`
- Infra: `apps/api/fly.{prod,staging}.toml`, `apps/ui/netlify{,.prod}.toml`, `apps/api/Dockerfile`, `.dockerignore`, `infra/grafana/`
