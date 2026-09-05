# UI Deployment Topology

How `apps/ui` is built, hosted, and promoted across staging and production, plus how it pairs with `apps/api` per environment.

## Status

Both staging and production UIs deploy on Netlify against Fly.io staging and production APIs. **Production promotions** are GitOps-style: a bot-managed trail PR merges `release/main-to-production` into `production`; that merge triggers native Netlify Git builds (`taucad-prod-us`) and pushes the Fly API via [`prod-deploy-on-merge.yml`](../../.github/workflows/prod-deploy-on-merge.yml).

The staging label `taucad` below is historical operator shorthand, not verified current hosted identity. The current optional staging stack pins a site ID and retains `taucad-staging` as its bootstrap lookup name. Use that selected stack's site ID and verify the authorized hosted state before changing site wiring; do not infer that the two labels identify different live sites. See [Tau Cloud maintenance](dependency-maintenance/tau-cloud.md).

**DNS authority** is **Cloudflare** (zones `taucad.dev` + `tau.new`) declared under `repos/tau-cloud` HCP workspaces `tau-cloud-staging` / `tau-cloud-prod-us`. Registrar cutover sequencing lives in **`repos/tau-cloud/docs/dns-migration-plan.md`**.

### Operator sequencing

Manual steps (Netlify repo link, HCP Sensitive vars for PostHOG CLI tokens, bootstrap `production` git branch, branch protection) stay listed in **[production-gitops-runbook.md](./production-gitops-runbook.md)** — they do not duplicate here.

Investigation narrative: **[docs/research/netlify-ui-deployment-strategy.md](../research/netlify-ui-deployment-strategy.md)**.

## At a Glance

| Surface           | Host                       | Domain                                         | Trigger                                                                                                                                                | Config                                                                                                     |
| ----------------- | -------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Staging UI        | Netlify (`taucad` site)    | `https://taucad.dev`                           | Auto on every push to `main` (Netlify GitHub integration, Netlify production context relative to site's prod branch)                                   | [`apps/ui/netlify.toml`](../../apps/ui/netlify.toml) + Terraform dashboard env vars (staging stack)        |
| Per-PR UI preview | Netlify (`taucad` site)    | `https://deploy-preview-N--taucad.netlify.app` | Auto on every PR (deploy-preview context)                                                                                                              | [`apps/ui/netlify.toml`](../../apps/ui/netlify.toml) `[context.deploy-preview]`                            |
| Staging API       | Fly.io (`tau-api-staging`) | `https://api.taucad.dev`                       | Auto on every push to `main` via [`ci.yml`](../../.github/workflows/ci.yml) `deploy-api-staging`                                                       | [`apps/api/fly.staging.toml`](../../apps/api/fly.staging.toml)                                             |
| Per-PR API        | Fly.io (`tau-api-pr-N`)    | `https://tau-api-pr-N.fly.dev`                 | [`review.yml`](../../.github/workflows/review.yml)                                                                                                     | Same staging fly base                                                                                      |
| Production UI     | Netlify (`taucad-prod-us`) | `https://tau.new`                              | Auto on pushes to **`production`** Git branch (after merge from trail PR)                                                                              | Same [`apps/ui/netlify.toml`](../../apps/ui/netlify.toml); dashboard env vars from prod-us Terraform stack |
| Production API    | Fly.io (`tau-api`)         | `https://api.tau.new`                          | **`prod-deploy-on-merge.yml`** runs [`deploy.yml`](../../.github/workflows/deploy.yml) on **`production`** branch push — or manual `workflow_dispatch` | [`apps/api/fly.prod.toml`](../../apps/api/fly.prod.toml)                                                   |

---

## Topology Diagram

```
                    ┌────────────────────────┐
                    │ Pull request vs main   │
                    └────────────┬───────────┘
                                 │
                   ┌─────────────┴─────────────┐
                   │                           │
                   ▼                           ▼
   ┌───────────────────────────┐    ┌─────────────────────────────┐
   │ Netlify deploy previews   │    │ review.yml (Fly review app) │
   │ on `taucad`               │    │                             │
   └───────────────────────────┘    └─────────────────────────────┘


                    ┌────────────────────────┐
                    │   push / merge main    │
                    └────────────┬───────────┘
                                 │
                   ┌─────────────┴──────────────────────────┐
                   │                                        │
                   ▼                                        ▼
   ┌───────────────────────────┐              ┌──────────────────────────────┐
   │ Netlify rebuilds staging  │              │ ci.yml → deploy-api-staging  │
   │ `taucad` site             │              │ Fly `tau-api-staging`        │
   └───────────────────────────┘              └──────────────────────────────┘
                   │
                   ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │ prepare-prod-release.yml → force-push `release/main-to-production`        │
   │ → open/update PR (base `production`, head `release/main-to-production`)    │
   │ → NO CI on that PR (`ci.yml` branches-ignore production)                  │
   └──────────────────────────────────────────────────────────────────────────┘


                    ┌────────────────────────┐
                    │ Maintainer merges trail│
                    │ PR → updates `production` branch
                    └────────────┬───────────┘
                                 │
                   ┌─────────────┴──────────────────────────┐
                   │                                        │
                   ▼                                        ▼
   ┌───────────────────────────┐              ┌──────────────────────────────┐
   │ Netlify Git builds        │              │ prod-deploy-on-merge.yml     │
   │ `taucad-prod-us`          │              │ → deploy.yml (Fly `tau-api`) │
   └───────────────────────────┘              └──────────────────────────────┘
```

---

## Environment Variables (UI)

**Single** [`apps/ui/netlify.toml`](../../apps/ui/netlify.toml) holds build commands + security headers. **Per-site** `TAU_API_URL`, `TAU_WEBSOCKET_URL`, `TAU_FRONTEND_URL`, `NODE_ENV`, `POSTHOG_CLI_*`, and build-only `NX_CLOUD_ACCESS_TOKEN` are written to each Netlify site by Terraform from committed non-secret tfvars plus HCP Sensitive variables in:

- `repos/tau-cloud/stacks/cloud/staging/terraform.auto.tfvars`
- `repos/tau-cloud/stacks/cloud/prod-us/terraform.auto.tfvars`

`NODE_ENV` for Functions/SSR is **never** scoped to `builds` (pnpm would skip devDependencies and break the Vite build). `TAU_*` URLs use `builds+functions+runtime` so server pre-render matches runtime. Deploy previews do not get a static `TAU_FRONTEND_URL`; the UI build derives and embeds the preview origin from Netlify's `DEPLOY_PRIME_URL`.

`NX_CLOUD_ACCESS_TOKEN` comes from HCP variable `nx_cloud_access_token_read_only`; Terraform exposes it as a read-only Netlify Builds-only secret. Netlify deploy previews may read Nx Cloud cache, but remote-cache writes stay with GitHub protected-branch CI.

### Staging site (`taucad`)

| Variable                | Notes                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `TAU_API_URL`           | `https://api.taucad.dev` (`context = all` in tfvars)                                 |
| `TAU_WEBSOCKET_URL`     | `wss://api.taucad.dev`                                                               |
| `TAU_FRONTEND_URL`      | `https://taucad.dev` for production context; previews derive from `DEPLOY_PRIME_URL` |
| `NODE_ENV`              | `production` for Functions + runtime only                                            |
| `POSTHOG_CLI_*`         | Source maps on **main** builds (same toml includes `ui:sourcemaps`)                  |
| `NX_CLOUD_ACCESS_TOKEN` | Read-only Nx Cloud token, Builds scope only                                          |

### Production site (`taucad-prod-us`)

| Variable                | Notes                                       |
| ----------------------- | ------------------------------------------- |
| `TAU_API_URL`           | `https://api.tau.new`                       |
| `TAU_WEBSOCKET_URL`     | `wss://api.tau.new`                         |
| `TAU_FRONTEND_URL`      | `https://tau.new`                           |
| `NODE_ENV`              | `production` (functions + runtime)          |
| `POSTHOG_CLI_*`         | Source maps in production Netlify ctx       |
| `NX_CLOUD_ACCESS_TOKEN` | Read-only Nx Cloud token, Builds scope only |

---

## Environment Variables (API)

| Variable                  | `tau-api-staging` (Fly)                                                         | `tau-api` (Fly, prod)                                             |
| ------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `TAU_FRONTEND_URL`        | `https://taucad.dev`                                                            | `https://tau.new`                                                 |
| `AUTH_URL`                | `https://api.taucad.dev`                                                        | `https://api.tau.new`                                             |
| `TAU_API_URL`             | `https://api.taucad.dev`                                                        | `https://api.tau.new`                                             |
| `ADDITIONAL_CORS_ORIGINS` | `["https://deploy-preview-*--taucad.netlify.app","https://taucad.netlify.app"]` | _(unset — `https://tau.new` matches `TAU_FRONTEND_URL` directly)_ |

Do **not** broaden the deploy-preview glob beyond that pattern — it would allow unintentional Netlify host classes.

---

## Cookie & Auth Strategy

Better Auth uses `sameSite: 'lax'`. Staging shares `taucad.dev` across UI + API subdomains; production shares `tau.new`. OAuth callbacks target `https://{taucad.dev,tau.new}/api/auth/callback/{github,google}`.

---

## Cross-Origin Headers

Netlify sends `Cross-Origin-Embedder-Policy: require-corp` from [`apps/ui/netlify.toml`](../../apps/ui/netlify.toml). The Fly API sets `Cross-Origin-Resource-Policy: cross-origin` so API calls succeed under COEP.

---

## How to Promote / Redeploy

| Need                         | Action                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Staging UI                   | Push to `main`                                                                                                                             |
| Staging API                  | Push `apps/api` changes to main (conditional in `ci.yml`) or workflow_dispatch `deploy.yml` staging                                        |
| Production **UI + API gate** | Merge the **trail PR** (`production` ← `release/main-to-production`). See **[production-gitops-runbook](./production-gitops-runbook.md)**. |
| Hotfix Fly API without UI    | `gh workflow run deploy.yml -f environment=production -f app=api`                                                                          |
| Roll back Netlify prod UI    | Netlify Deploys UI → Publish previous deploy                                                                                               |
| Roll back Fly prod API       | `flyctl releases rollback`                                                                                                                 |

---

## See Also

- [production-gitops-runbook.md](./production-gitops-runbook.md) — operators + HCP sequencing
- [docs/research/netlify-ui-deployment-strategy.md](../research/netlify-ui-deployment-strategy.md)
- [`repos/tau-cloud/stacks/cloud/{staging,prod-us}`](../../repos/tau-cloud/stacks/cloud/)
- [`.github/workflows/prepare-prod-release.yml`](../../.github/workflows/prepare-prod-release.yml)
- [`.github/workflows/prod-deploy-on-merge.yml`](../../.github/workflows/prod-deploy-on-merge.yml)
- [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)
- [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
