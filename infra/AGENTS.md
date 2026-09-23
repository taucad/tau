# Infrastructure instructions

## Environment identity and validation

Use explicit environment/region names such as `staging` and `prod-us`; do not encode deployment identity as `is_prod`. Validate required IaC inputs and paired configuration before apply. Missing credentials or required site/repository identity must fail clearly rather than silently removing resources from the plan.

This directory owns local service and observability configuration. Deployment/IaC work also follows [UI deployment topology](../docs/architecture/ui-deployment-topology.md) and the [Tau Cloud maintenance route](../docs/architecture/dependency-maintenance/tau-cloud.md); promotion, environment matrices, rollback and the module map are operational and live in the private handbook at `docs/handbooks/cloud/`. The optional `repos/tau-cloud` checkout owns cloud modules; inspect its instructions and current source before changing it.

## Object storage and CDN

Keep local MinIO behavior compatible with the application storage contract. Public R2 delivery uses a custom domain and zone cache rules without an extra Worker hop. Private publication data and manifests remain in the private bucket behind application authorization; the old single-public-bucket description is superseded.

Object storage is also where Tau Cloud's git repositories durably live: packs plus one manifest per repository under `tenants/<ownerId>/`, with LFS objects beside them and leases held only in a Machine's own temporary directory. No volume, no `TAU_GIT_ROOT` (boot refuses it) and no nightly bundle. The local bootstrap must create every bucket the suites need, including `tau-content-restore` for the restore path; a bucket that exists only because an old dev volume kept it is not bootstrapped. The public contract is [revisions cloud architecture](../docs/architecture/revisions-cloud-handbook.md); operating the deployed substrate is `docs/handbooks/cloud/system/services/revisions-maintenance.md` and `operate/storage-maintenance.md`.

Storage namespace changes must reconcile `apps/api/app/storage/storage.constants.ts`, cache-rule prefixes and seeding/readiness checks. Keep the health probe uncached. Readiness must exercise the actual object-storage capability, not just environment-variable presence.

## Deployment topology

Cloudflare owns DNS; Netlify hosts staging and production UIs with Fly APIs. The API declares its process groups in `apps/api/fly.*.toml`: `app` runs at two or more stateless Machines with no mount, and jobs that must run once (purge, LFS retirement, blob collection, restore) belong to the single-Machine `revisions-maintenance` group, never to `app`. The committed `apps/ui/netlify.toml` owns build commands and non-sensitive defaults. Managed environments own secrets; do not copy credentials into source, instruction files or logs. Keep staging/production SSR bundling consistent with that build path.

Follow [compatibility policy](../docs/policy/compatibility-policy.md) for cross-origin isolation. Current UI headers use COEP `require-corp`; preserve the required API CORP/CORS contract and same-origin resource routes. Verify the resulting browser capability instead of assuming headers alone are sufficient.

Run local services from the root with `pnpm infra:up`, `pnpm infra:down` or an authorized `pnpm infra:reset`; use the owning stack's validation for IaC. Deployment, DNS changes and external state mutations still require the current task's authority.

Changes to Grafana alerts or dashboards, billing policy files or local infra update the private handbook and its go-live checklist through `create-handbook`.
