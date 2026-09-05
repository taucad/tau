# Infrastructure instructions

## Environment identity and validation

Use explicit environment/region names such as `staging` and `prod-us`; do not encode deployment identity as `is_prod`. Validate required IaC inputs and paired configuration before apply. Missing credentials or required site/repository identity must fail clearly rather than silently removing resources from the plan.

This directory owns local service and observability configuration. Deployment/IaC work also follows [UI deployment topology](../docs/architecture/ui-deployment-topology.md), [production promotion](../docs/architecture/production-gitops-runbook.md) and the [Tau Cloud maintenance route](../docs/architecture/dependency-maintenance/tau-cloud.md). The optional `repos/tau-cloud` checkout owns cloud modules; inspect its instructions and current source before changing it.

## Object storage and CDN

Keep local MinIO behavior compatible with the application storage contract. Public R2 delivery uses a custom domain and zone cache rules without an extra Worker hop. Private publication data and manifests remain in the private bucket behind application authorization; the old single-public-bucket description is superseded.

Storage namespace changes must reconcile `apps/api/app/storage/storage.constants.ts`, cache-rule prefixes and seeding/readiness checks. Keep the health probe uncached. Readiness must exercise the actual object-storage capability, not just environment-variable presence.

## Deployment topology

Cloudflare owns DNS; Netlify hosts staging and production UIs with Fly APIs. The committed `apps/ui/netlify.toml` owns build commands and non-sensitive defaults. Managed environments own secrets; do not copy credentials into source, instruction files or logs. Keep staging/production SSR bundling consistent with that build path.

Follow [compatibility policy](../docs/policy/compatibility-policy.md) for cross-origin isolation. Current UI headers use COEP `require-corp`; preserve the required API CORP/CORS contract and same-origin resource routes. Verify the resulting browser capability instead of assuming headers alone are sufficient.

Run local services from the root with `pnpm infra:up`, `pnpm infra:down` or an authorized `pnpm infra:reset`; use the owning stack's validation for IaC. Deployment, DNS changes and external state mutations still require the current task's authority.
