---
title: 'Netlify UI Deployment Strategy: PR Previews + Auto Staging + Manual Production'
description: 'Audit of current Tau UI deploy topology (Netlify + Fly.io) and a target architecture for per-PR deploy previews, auto-staging, and manual production via GitHub Actions, modelled on the Novu reference workflow.'
status: superseded
created: '2026-04-20'
updated: '2026-05-14'
category: architecture
superseded_by: docs/research/tau-cloud-activation-status.md
related:
  - docs/research/tau-cloud-activation-status.md
  - docs/policy/commit-policy.md
---

> **Superseded.** The Netlify cutover this document scoped is code-complete; its M1–M5 gap-analysis findings about residual operator steps (PAT minting, OAuth redirect-URI verification, registrar NS delegation, Let's Encrypt wait, smoke gate) are consolidated into the activation checklist at [`docs/research/tau-cloud-activation-status.md`](tau-cloud-activation-status.md). Operational ownership of the Netlify Terraform module lives in [`repos/tau-cloud/docs/netlify-iac-runbook.md`](../../repos/tau-cloud/docs/netlify-iac-runbook.md) and the topology diagram in [`docs/architecture/ui-deployment-topology.md`](../architecture/ui-deployment-topology.md). Treat the content below as historical reference for the cutover rationale.

# Netlify UI Deployment Strategy: PR Previews + Auto Staging + Manual Production

Document the current Tau UI deployment landscape across Netlify and Fly.io, examine the Novu (open-source notifications platform) reference flow for separated dev-auto / prod-manual Netlify deployments, and define the concrete delta needed to reach a target state where (1) every PR against `main` produces a Netlify deploy preview (existing behaviour, retained), (2) `main` continues to auto-deploy to a staging Netlify site, and (3) a manual GitHub Actions workflow promotes a build to a separate production Netlify site.

## Executive Summary

**Status (2026-04-20)**: Both staging and production cutovers are **code-complete**. The staging UI ships from Netlify (`taucad` site, custom domain `taucad.dev`) via the Netlify GitHub integration; the Fly staging API CORS allowlist + Helmet `Cross-Origin-Resource-Policy` accommodate the Netlify origins. The production UI ships from Netlify (`taucad-prod` site, custom domain `tau.new`) via the manual [`prod-deploy-ui.yml`](../../.github/workflows/prod-deploy-ui.yml) (`workflow_dispatch`). See [docs/architecture/ui-deployment-topology.md](../architecture/ui-deployment-topology.md) for the resulting topology, [Recommendations / Task List](#recommendations--task-list) for the per-recommendation status, and the [Gap Analysis: Remaining Manual Operations](#gap-analysis-remaining-manual-operations) section below for the residual items inherent to OAuth, registrar nameserver delegation latency, PAT minting workflows, Let's Encrypt issuance timing, and human smoke tests.

**Infra carve-out (2026-05)**: Registrar-record **declarations** (+ Netlify attachment metadata that Terraform can emit) migrate to **`repos/tau-cloud`** per [`iac-terraform-strategy.md`](iac-terraform-strategy.md) V1 — follow [`repos/tau-cloud/docs/dns-migration-plan.md`](../../repos/tau-cloud/docs/dns-migration-plan.md) (`pnpm repos sync` required) until Cloudflare assumes full authority after the nameserver flip.

Tau currently runs **two parallel UI hosting stacks** (Fly.io and Netlify) that disagree about which is "staging" vs "production" and have **misconfigured environment variables on Netlify** that mix staging and production endpoints. Only one Netlify site exists (`taucad`, building `main` only — PR previews already work via the `deploy-preview` context); there is no production Netlify site and no manual-promotion workflow. The Fly.io UI side has both `tau-ui-staging` and `taucad` (prod) Fly apps but `ci.yml` only auto-deploys `tau-ui-staging` — production is reachable only through `workflow_dispatch` on the reusable `deploy.yml`. Reaching the target state requires: provisioning a second Netlify site (`taucad-prod`), preserving the existing per-PR deploy-preview behaviour on the staging site (no all-branch deploys), fixing the env-var topology on both Netlify sites, adding `prod-deploy-ui.yml` (modelled on Novu's `reusable-dashboard-deploy.yml` + `prod-deploy-web.yml` pair) using `nwtgck/actions-netlify@v1.2`, and patching `apps/api/fly.*.toml` to include the two production-class Netlify origins (`https://taucad-prod.netlify.app` plus the public `tau.new`/`taucad.dev` aliases) in `ADDITIONAL_CORS_ORIGINS`.

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Methodology](#methodology)
3. [Current Landscape](#current-landscape)
4. [Novu Reference Architecture](#novu-reference-architecture)
5. [Findings](#findings)
6. [Target Architecture](#target-architecture)
7. [Fly.io Compatibility Review](#flyio-compatibility-review)
8. [Recommendations / Task List](#recommendations--task-list)
9. [Risks and Open Questions](#risks-and-open-questions)
10. [Appendix](#appendix)

## Problem Statement

The user wants three deploy behaviours for `apps/ui`:

1. **Per-PR deploy previews** — every pull request against `main` produces a Netlify deploy preview (existing behaviour via the `deploy-preview` context; retained as-is). Non-PR branches are intentionally **not** deployed to keep build minutes and Netlify Function invocations bounded.
2. **Auto staging** — `main` continues to deploy to a staging Netlify site without manual intervention.
3. **Manual production** — a GitHub Actions workflow with `workflow_dispatch` promotes `main` to a separate production Netlify site, mirroring the cadence of the existing Fly.io production deploy.

Today, the Netlify side serves only `main` plus PR deploy previews (treated as quasi-staging) and there is no production Netlify deploy at all. The Fly.io side does most of the heavy lifting for both staging (`tau-ui-staging` → `taucad.dev`) and production (`taucad` → `tau.new`). The user also asked to verify that `apps/api/fly.{prod,staging}.toml` remains compatible with a Netlify-hosted UI (CORS, WebSocket, cross-subdomain cookies).

## Methodology

| Source                                                                                                                  | What was inspected                                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`, `deploy.yml`, `review.yml`                                                                  | Existing CI, reusable Fly deploy, PR review-app deploys                                        |
| `apps/api/fly.{prod,staging}.toml`                                                                                      | Production / staging API env, CORS additions, machine sizing                                   |
| `apps/ui/fly.{prod,staging}.toml`                                                                                       | Production / staging UI env, machine sizing                                                    |
| `apps/ui/netlify.toml`                                                                                                  | Build command, per-context env, security headers, COEP/COOP                                    |
| `apps/ui/Dockerfile`, `apps/ui/vite.config.ts`                                                                          | Confirms React Router v7 SSR + `@netlify/vite-plugin-react-router` (Netlify Functions runtime) |
| `apps/ui/app/environment.config.ts`                                                                                     | Frontend env schema, `NETLIFY_AI_GATEWAY_URL` fallback for `TAU_FRONTEND_URL`                  |
| `apps/api/app/main.ts`, `cors.utils.ts`, `config/environment.config.ts`                                                 | Origin validator, glob CORS support, `ADDITIONAL_CORS_ORIGINS` schema                          |
| `apps/api/app/config/better-auth.config.ts`                                                                             | `crossSubDomainCookies.enabled: true`, `trustedOrigins` derived from `TAU_FRONTEND_URL`        |
| `apps/api/app/api/websocket/redis-io.adapter.ts`, `chat-rpc.gateway.ts`                                                 | Socket.IO has `cors: false`, relies on Fastify CORS                                            |
| Netlify CLI (`netlify api getSite`, `getEnvVars`, `listSiteDeploys`)                                                    | Live site config, env vars, deploy history for site `a006a282-…`                               |
| `repos/novu/.github/workflows/{reusable-dashboard-deploy,dev-deploy-dashboard,prod-deploy-web,reusable-web-deploy}.yml` | Reference dual-site, dual-trigger Netlify pattern                                              |

The Novu source (`next` branch) was cloned via `git clone --depth 1 --branch next --filter=tree:0 https://github.com/novuhq/novu.git repos/novu` — the `pnpm repos add ... --clone` path failed because the bundled `repos` CLI passes an unsupported `--branch` flag to `git clone`. **Bug for follow-up:** `scripts/src/repos/` should use `git clone -b` or `git clone --branch`, not `git --branch clone`.

## Current Landscape

### Fly.io UI Apps

| Fly app          | Config                                  | Public URL (assumed)  | Trigger                                                                   |
| ---------------- | --------------------------------------- | --------------------- | ------------------------------------------------------------------------- |
| `tau-ui-staging` | `apps/ui/fly.staging.toml`              | `taucad.dev`          | Auto on `main` push (ci.yml `deploy-ui-staging`)                          |
| `taucad`         | `apps/ui/fly.prod.toml`                 | `tau.new`             | **Manual only** via `workflow_dispatch` on `.github/workflows/deploy.yml` |
| `tau-ui-pr-N`    | `apps/ui/fly.staging.toml` (overridden) | `tau-ui-pr-N.fly.dev` | PR `opened/sync/closed` (review.yml)                                      |

The user's framing said both staging and prod push to Fly via `ci.yml`. **In reality, `ci.yml` only auto-deploys staging.** Production deploys are gated behind manual `workflow_dispatch`. Updated mental model accordingly.

### Fly.io API Apps

| Fly app           | Config                      | URL              | Notes                                                                                             |
| ----------------- | --------------------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| `tau-api-staging` | `apps/api/fly.staging.toml` | `api.taucad.dev` | `ADDITIONAL_CORS_ORIGINS` allows `deploy-preview-*--taucad.netlify.app` and `tau-ui-pr-*.fly.dev` |
| `tau-api`         | `apps/api/fly.prod.toml`    | `api.tau.new`    | **No `ADDITIONAL_CORS_ORIGINS`**; `TAU_FRONTEND_URL=https://tau.new` is the only allowed origin   |

### Netlify Site

A single team-pro site, `taucad` (`a006a282-6254-499d-a38c-d089b47359c7`), under TauCAD account `6923bd7743d3c42cdeb1c992`:

```
default_domain      taucad.netlify.app
custom_domain       (none)
allowed_branches    ["main"]
repo_branch         main
package_path        apps/ui
build_image         noble
node default        22  (active 24)
plan                nf_team_pro
deploy_retention    90 days
framework           react-router (Netlify Function `react-router-server`, 33.3 MB, nodejs24.x, us-east-2)
```

Recent deploys show:

- `production` context deploys from `main` (latest `2026-04-19T13:15:20Z`).
- `deploy-preview` context deploys for PR branches (Dependabot, feature branches like `payments-v1`, `dependabot/...`).
- Several Dependabot deploys are in `error` state — separate concern.

### Netlify Site Env Vars (live)

```
TAU_API_URL         all  ->  https://api.taucad.dev    [STAGING API]
TAU_WEBSOCKET_URL   all  ->  wss://api.tau.new          [PROD WS!]   <-- mismatch
TAU_FRONTEND_URL    production -> https://taucad.dev   [STAGING URL]
NODE_ENV            production/deploy-preview -> "production"
```

`netlify.toml` declares context-scoped values that disagree with what the dashboard sets:

```toml
[context.production.environment]
TAU_API_URL       = "https://api.tau.new"      # netlify.toml says PROD
TAU_FRONTEND_URL  = "https://tau.new"          # netlify.toml says PROD
TAU_WEBSOCKET_URL = "wss://api.tau.new"        # netlify.toml says PROD
```

**Netlify dashboard env vars override `netlify.toml`** at build time, so the actual production-context build uses staging API + staging frontend + production WS. This is a latent inconsistency: the WebSocket connects to prod while HTTP and the CORS-bearing `TAU_FRONTEND_URL` claim staging. WebSocket calls from `taucad.netlify.app` to `wss://api.tau.new` would also be blocked by CORS today because `apps/api/fly.prod.toml` does not list `taucad.netlify.app` in `ADDITIONAL_CORS_ORIGINS` (the field is unset, so only `https://tau.new` is trusted in prod).

### Apps/UI Build Surface

- React Router v7 SSR build → Netlify Functions (`react-router-server`) via `@netlify/vite-plugin-react-router@2.1.3`.
- `apps/ui/app/environment.config.ts` already auto-derives `TAU_FRONTEND_URL` from `NETLIFY_AI_GATEWAY_URL` when not set, so branch/preview contexts work without per-branch env config.
- Build command: `NX_PREFER_NODE_STRIP_TYPES=true pnpm nx build ui`.
- Security headers in `netlify.toml` already include `Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Opener-Policy: same-origin`, and a CSP-Report-Only allowing `wss:`, `https://api.zoo.dev`, `https://api.kittycad.io`.

### Apps/API Surface (relevant to Netlify origins)

- Fastify `enableCors` uses `createCorsOriginValidatorFromList([TAU_FRONTEND_URL, ...ADDITIONAL_CORS_ORIGINS])`; supports glob patterns via `minimatch` (cap 50 patterns).
- Socket.IO gateway sets `cors: false` (delegated to Fastify) — must traverse the same allow-list.
- Better Auth: `trustedOrigins: [TAU_FRONTEND_URL]` and `crossSubDomainCookies.enabled: true` with `domain: undefined` (inferred per-request). Cookie cross-subdomain only works when API and UI share a parent domain (`tau.new` ↔ `api.tau.new`). It will **not** work for `taucad.netlify.app` ↔ `api.tau.new` — those are unrelated public-suffix domains.

## Novu Reference Architecture

Novu hosts each frontend (web + dashboard) on Netlify with a **separate Netlify site per environment** and a **reusable build/deploy workflow** parameterised per environment.

### Workflow files

| File                              | Trigger                                                                          | Purpose                                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `reusable-dashboard-deploy.yml`   | `workflow_call`                                                                  | Build dashboard, deploy to a `netlify_site_id` via `nwtgck/actions-netlify@v1.2`                               |
| `dev-deploy-dashboard.yml`        | `push` to `next`/`main` (paths: `apps/dashboard/**`) **and** `workflow_dispatch` | Calls reusable workflow with **dev** site ID and `alias: dev`                                                  |
| `prod-deploy-web.yml` (analogous) | `workflow_dispatch` only                                                         | Calls `reusable-web-deploy.yml` per region with **prod** site IDs and `alias: prod`, `production-deploy: true` |
| `reusable-web-deploy.yml`         | `workflow_call`                                                                  | Builds, writes a `.env` from inputs/secrets, deploys to Netlify                                                |

### Key patterns extracted

| Pattern                                  | Novu implementation                                                              | Applicability to Tau                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| One Netlify site per environment         | Dev (`5b9c0332-…`), EU prod (`d2e8b860-…`), US prod (`8639d8b9-…`)               | Direct fit — provision `taucad-prod` alongside `taucad`              |
| Action `nwtgck/actions-netlify@v1.2`     | Pinned to v1.2; uses `NETLIFY_SITE_ID` + `NETLIFY_AUTH_TOKEN`                    | Pin to a SHA per repo policy; or use `netlify-cli` directly          |
| `production-deploy: true` + `alias`      | Forces deploy into the production slot (not a preview), tagged with branch alias | Same flag works for SSR; alias is just a label                       |
| Build runs in GH runner, not Netlify     | `pnpm build:dashboard` runs in CI, `publish-dir` is the static output            | Tau is SSR — see [Build Topology](#build-topology) below             |
| `paths:` filter in dev workflow          | Only triggers when `apps/dashboard/**` changes                                   | Tau already uses `nx affected` for the same purpose                  |
| Dual trigger (push + dispatch) on dev    | `on: [workflow_dispatch, push]`                                                  | Match this for staging                                               |
| `workflow_dispatch` only on prod         | No `push` trigger — humans gate every release                                    | Match this for production                                            |
| `environment: ${{ inputs.environment }}` | Uses GitHub deploy environments for secret scoping and approval gates            | Tau already uses `environment: staging`/`production` in `deploy.yml` |
| `extra_env_variables` multi-line input   | Allows region-specific env without bloating workflow inputs                      | Useful if Tau later does multi-region                                |
| `actions-netlify` `timeout-minutes: 1`   | Just publishes the prebuilt artifacts, so the API call itself is fast            | Same expectation                                                     |

### Build topology delta

Novu's dashboard is an SPA (`vite build` → static `dist/`) so they upload a directory and Netlify serves it as static. Tau's UI is an **SSR React Router v7 app** that bundles a Netlify Function (`react-router-server`). For SSR, `nwtgck/actions-netlify` works only if the local build already produced `.netlify/functions-internal/` — that requires running `netlify build` (not just `pnpm nx build ui`). Two viable strategies:

1. **Use the Netlify CLI directly** (`netlify deploy --build --prod --site $SITE_ID`) inside the workflow. The CLI honours `netlify.toml`, runs the build, packages the function, and uploads.
2. **Pre-build via Nx then `netlify deploy --prod --dir=apps/ui/build/client --functions=apps/ui/build/server`**. Slightly more work but fully cacheable through Nx Cloud.

Novu's pattern of running the build in CI then handing prebuilt artifacts to `actions-netlify` is the cleanest fit for Nx-cached builds, but for SSR we should **wrap with `netlify build` to get the function bundling step** (or use the CLI's `--build` flag). We will adopt option 1 (`netlify deploy --build --prod`) in the recommendation since it stays closest to the SSR contract Netlify expects.

## Findings

### Finding 1: Single Netlify site is misnamed and serves the wrong endpoints

The site `taucad` builds `main` and is treated by config as "production" (Netlify's `context: production`), but its dashboard env vars point at the staging API (`https://api.taucad.dev`) while the WebSocket points at the production API (`wss://api.tau.new`). End users on `taucad.netlify.app` would suffer split-brain auth (HTTP cookies on staging, WebSocket on prod) and likely fail CORS preflight on the WS upgrade because `tau-api`'s `ADDITIONAL_CORS_ORIGINS` does not include any Netlify origin.

### Finding 2: No production Netlify site exists

`netlify api listSites` returns exactly one site (`taucad`). There is no `taucad-prod`, no custom `tau.new` domain attachment, and no separate site_id wired into any workflow. To support manual production releases on Netlify we must provision a new site.

### Finding 3: PR deploy previews already work; non-PR branch deploys are intentionally off

`build_settings.allowed_branches: ["main"]`. PRs surface as `deploy-preview` context (which is a separate Netlify mode that runs independently of `allowed_branches`), so per-PR previews already function correctly — the `listSiteDeploys` history shows recent `deploy-preview` builds for `payments-v1`, `dependabot/...`, etc. Pushes to non-PR feature branches produce no deploy, and **target state #1 keeps it that way** (per the user's pivot from "all branches" to "per-PR only"). Action: leave `allowed_branches` set to `["main"]`; no Netlify-side change is required for previews.

### Finding 4: `ci.yml` does not auto-deploy production

Contrary to the original framing, `.github/workflows/ci.yml` only contains `deploy-api-staging` and `deploy-ui-staging` jobs. The `deploy.yml` reusable supports both via `workflow_dispatch`, but production is human-triggered for both API and UI. This is the existing pattern we should mirror for Netlify production.

### Finding 5: SSR + Netlify Functions vs Novu's static SPA

Tau's UI bundles a Netlify Function for SSR (`react-router-server`, 33 MB, runtime `nodejs24.x`, region `us-east-2`). This is non-trivial — it must be packaged through `netlify build`, not just published via `publish-dir`. Novu's reference workflow does not exercise this path; we cannot copy it 1:1.

### Finding 6: API CORS allowlist is environment-specific and incomplete for Netlify

| API env | `TAU_FRONTEND_URL`   | `ADDITIONAL_CORS_ORIGINS`                                                     |
| ------- | -------------------- | ----------------------------------------------------------------------------- |
| staging | `https://taucad.dev` | `https://deploy-preview-*--taucad.netlify.app`, `https://tau-ui-pr-*.fly.dev` |
| prod    | `https://tau.new`    | (unset — defaults to `[]`)                                                    |

For the target state (PR previews + main only — no all-branch deploys), staging API needs to additionally allow:

- `https://main--taucad.netlify.app` (Netlify alias for the staging site's main branch)
- `https://taucad.netlify.app` (default domain alias for the staging site)

The existing `https://deploy-preview-*--taucad.netlify.app` glob already covers per-PR previews, so it stays as-is. **Do not** broaden to `https://*--taucad.netlify.app`: that would silently allow any future branch-deploy alias even though target state #1 explicitly excludes non-PR branch deploys. Keep the wildcard tightly scoped to the `deploy-preview-*` prefix.

Production API needs to allow:

- `https://taucad-prod.netlify.app` (default domain of the new prod site)
- `https://tau.new` (already set as `TAU_FRONTEND_URL`; can be dropped from `ADDITIONAL_CORS_ORIGINS` once the custom domain is attached and `TAU_FRONTEND_URL` is unchanged)

PR previews deliberately do **not** run on the production site, so no `deploy-preview-*--taucad-prod.netlify.app` glob is required.

### Finding 7: Custom domains keep `sameSite: 'lax'` cookies working — DNS cutover required

Better Auth's `crossSubDomainCookies` requires shared parent domain. `https://tau.new` ↔ `https://api.tau.new` works today on Fly; `https://taucad-prod.netlify.app` ↔ `https://api.tau.new` would not. **Decided strategy: keep `sameSite: 'lax'` and attach the existing public domains as Netlify custom domains** so cookies stay same-site:

- Existing `taucad` Netlify site (staging) → attach `taucad.dev` (currently served by Fly `tau-ui-staging`).
- New `taucad-prod` Netlify site (production) → attach `tau.new` (currently served by Fly `taucad`).

This preserves the current cookie posture (`sameSite: 'lax'`, `crossSubDomainCookies.enabled: true`, `domain: undefined` inferred per-request) without code changes. The trade-off is **DNS cutover sequencing**: each public domain can only resolve to one host, so flipping `tau.new`/`taucad.dev` from Fly to Netlify must be coordinated with decommissioning the Fly UI machines for that environment (R11). Until cutover, validate against the Netlify default domain (`taucad-prod.netlify.app`, `taucad.netlify.app`) — cookie-bearing auth flows will not work there, but unauthenticated routes, static assets, COEP/CORP, and CSP can all be smoke-tested.

Sub-domain alternative (e.g. `app.tau.new` as a CNAME to Netlify, leaving the apex on Fly for marketing) remains technically valid but is **not** the chosen path; the apex itself moves to Netlify per the user's directive.

### Finding 8: COOP/COEP and CSP need spot-check after Netlify takes over

`netlify.toml` enforces `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin`. Tau's API responses must therefore include `Cross-Origin-Resource-Policy: cross-origin` (or `same-site` if same parent domain) for the browser to consume them. This currently works on Fly because both are same-origin or via the same proxying setup. Audit `apps/api/app/main.ts` Helmet config to confirm CORP is permissive enough for cross-site fetches from Netlify-hosted UI to `api.tau.new`. (Helmet's default is `same-origin`, which would break cross-origin fetches; this needs explicit relaxation.)

### Finding 9: `repos` CLI bug — `--branch` not forwarded correctly

`pnpm repos add novuhq/novu -g ai -b next --clone` failed with `unknown option: --branch` from git, because the script renders `git --branch next clone …` instead of `git clone --branch next …`. Out of scope for this research, but worth filing.

## Target Architecture

```
                       ┌──────────────────────────────────────────────┐
                       │                  GitHub                       │
                       │                                                │
                       │   push: main ──────┐                          │
                       │   PR opened ───────┼─► Netlify webhook        │
                       │                    │   (existing integration) │
                       │   push: <branch>   │   (intentionally ignored)│
                       │                                                │
                       │   workflow_dispatch ──► prod-deploy-ui.yml    │
                       └──────────────────────┬─────────────┬──────────┘
                                              │             │
                  Netlify auto-build           │             │  GH runner builds
                  (main + PR previews)         │             │  via netlify-cli
                                               ▼             ▼
                                  ┌──────────────────┐  ┌──────────────────┐
                                  │ Netlify staging  │  │ Netlify production│
                                  │ site: `taucad`   │  │ site: `taucad-prod`│
                                  │                  │  │                  │
                                  │ main = production │ │ alias: prod       │
                                  │ context (staging) │ │ no auto-build     │
                                  │ + PR previews     │ │ (manual only)     │
                                  └──────┬───────────┘  └────────┬─────────┘
                                         │                       │
                                         ▼                       ▼
                                api.taucad.dev (Fly)     api.tau.new (Fly)
                                tau-api-staging          tau-api
```

### Site Inventory (target)

| Netlify site  | Site ID                 | Default domain            | Custom domain (target)   | Auto-build branches         | Triggered by              |
| ------------- | ----------------------- | ------------------------- | ------------------------ | --------------------------- | ------------------------- |
| `taucad`      | `a006a282-…` (existing) | `taucad.netlify.app`      | `taucad.dev`             | `main` only (+ PR previews) | Netlify GitHub app        |
| `taucad-prod` | TBD (new)               | `taucad-prod.netlify.app` | `tau.new` (post cutover) | None (PR previews disabled) | `prod-deploy-ui.yml` only |

### Trigger Matrix

| Event                     | Outcome                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `push origin main`        | Netlify auto-builds `taucad` (production context) → staging UI promoted                                                  |
| `push origin feature/foo` | **No deploy** — non-PR branch pushes are intentionally ignored                                                           |
| PR opened against `main`  | Netlify auto-builds `taucad` (deploy-preview context) → `https://deploy-preview-<n>--taucad.netlify.app` (existing flow) |
| Tag / release ready       | Engineer runs `prod-deploy-ui.yml` → builds + deploys to `taucad-prod`                                                   |

### Workflow Skeleton

`prod-deploy-ui.yml`:

```yaml
name: Deploy UI to Netlify Production
on:
  workflow_dispatch:
    inputs:
      ref:
        description: 'Git ref to deploy (default: main)'
        required: false
        default: 'main'

concurrency: deploy-ui-netlify-prod
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v6
        with:
          ref: ${{ inputs.ref }}
      - uses: ./.github/actions/setup-nx
      - name: Build UI
        run: NX_PREFER_NODE_STRIP_TYPES=true pnpm nx build ui
      - name: Deploy to Netlify production site
        run: |
          pnpm dlx netlify-cli@latest deploy \
            --prod \
            --site ${{ vars.NETLIFY_PROD_SITE_ID }} \
            --dir apps/ui/build/client \
            --functions apps/ui/build/server \
            --filter @taucad/ui \
            --message "prod ${GITHUB_SHA::7}"
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
```

(Implementation may prefer `netlify build && netlify deploy --prod --no-build` for cleaner function packaging — to be validated during execution. The Novu approach using `nwtgck/actions-netlify@<sha>` is also viable but requires its build args to point at the SSR function output and `netlify-config-path: apps/ui/netlify.toml`.)

## Fly.io Compatibility Review

| File                             | Field                      | Status                                                                           | Action                                                                                                                                                                                                                                                                                                                             |
| -------------------------------- | -------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/fly.staging.toml`      | `TAU_FRONTEND_URL`         | `https://taucad.dev`                                                             | Keep — when staging Netlify gets `taucad.dev` custom domain, this still matches.                                                                                                                                                                                                                                                   |
| `apps/api/fly.staging.toml`      | `ADDITIONAL_CORS_ORIGINS`  | `["https://deploy-preview-*--taucad.netlify.app","https://tau-ui-pr-*.fly.dev"]` | **Extend** to `["https://deploy-preview-*--taucad.netlify.app","https://main--taucad.netlify.app","https://taucad.netlify.app","https://tau-ui-pr-*.fly.dev"]` — keep PR-preview glob narrow, add main alias + default domain. Do **not** broaden to `https://*--taucad.netlify.app` (would silently allow non-PR branch deploys). |
| `apps/api/fly.prod.toml`         | `TAU_FRONTEND_URL`         | `https://tau.new`                                                                | Keep — assumes `tau.new` lands on Netlify post cutover.                                                                                                                                                                                                                                                                            |
| `apps/api/fly.prod.toml`         | `ADDITIONAL_CORS_ORIGINS`  | (unset)                                                                          | **Add** `["https://taucad-prod.netlify.app"]`. No PR-preview glob (PR previews live on staging only). Drop the entry after `tau.new` cutover.                                                                                                                                                                                      |
| Both                             | `force_https = true`       | OK                                                                               | No change.                                                                                                                                                                                                                                                                                                                         |
| Both                             | `min_machines_running = 1` | OK for both — Netlify front does not change cold-start dynamics                  | No change.                                                                                                                                                                                                                                                                                                                         |
| Both                             | `[http_service.checks]`    | Health check at `/health/ready`                                                  | No change.                                                                                                                                                                                                                                                                                                                         |
| `apps/api/main.ts`               | Helmet defaults            | `Cross-Origin-Resource-Policy` defaults to `same-origin`                         | **Verify and likely set to `cross-origin`** so Netlify-hosted UI can read API responses under COEP `require-corp`.                                                                                                                                                                                                                 |
| `apps/api/better-auth.config.ts` | `trustedOrigins`           | Single entry from `TAU_FRONTEND_URL`                                             | Temporarily extend to include the Netlify default domains (`https://taucad.netlify.app`, `https://taucad-prod.netlify.app`) **for the pre-cutover smoke-test window only**, then revert to the single `TAU_FRONTEND_URL` entry after `tau.new` / `taucad.dev` resolve to Netlify.                                                  |
| `apps/api/better-auth.config.ts` | `crossSubDomainCookies`    | `enabled: true`, `domain: undefined`                                             | **No change.** `sameSite: 'lax'` is preserved per the locked-in cookie strategy. The custom-domain attachments in R10 ensure UI and API stay on the same registered domain (`tau.new`, `taucad.dev`), so cookies inherit cross-subdomain SSO automatically.                                                                        |

Cookie strategy is **locked in: keep `sameSite: 'lax'`** and bring `tau.new` / `taucad.dev` onto Netlify as custom domains so the UI ↔ API origin pair stays on a shared parent domain. No Better Auth, Helmet `cookie`, or `crossSubDomainCookies` config edits are required. The work shifts entirely to DNS cutover sequencing (Finding 7, R10) and ensuring CORS/origin allowlists also accept the Netlify default hostnames during the parallel-run window before cutover.

## Recommendations / Task List

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Priority | Effort | Impact |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | **Provision second Netlify site** `taucad-prod` linked to the same GitHub repo with build disabled (or `prevent_non_git_prod_deploys=false`, `skip_automatic_builds=true`). Set `package_path: apps/ui`.                                                                                                                                                                                                                                                                                                                  | P0       | Low    | High   |
| R2  | **Repair env vars on existing `taucad` site** — set all of `TAU_API_URL`, `TAU_WEBSOCKET_URL`, `TAU_FRONTEND_URL` to staging values (`https://api.taucad.dev`, `wss://api.taucad.dev`, `https://taucad.dev` / let `NETLIFY_AI_GATEWAY_URL` derive on branch contexts). Remove the `TAU_WEBSOCKET_URL=wss://api.tau.new` mismatch.                                                                                                                                                                                         | P0       | Low    | High   |
| R3  | **Configure env vars on `taucad-prod`** with production endpoints (`https://api.tau.new`, `wss://api.tau.new`, `https://tau.new`).                                                                                                                                                                                                                                                                                                                                                                                        | P0       | Low    | High   |
| R4  | **Verify per-PR deploy previews keep working** on `taucad`. No config change needed: leave `build_settings.allowed_branches = ["main"]`; PR deploy previews run in their own Netlify context independently of `allowed_branches`. Spot-check a PR after R2 lands to confirm the preview URL still resolves.                                                                                                                                                                                                               | P1       | Low    | Med    |
| R5  | **Add `.github/workflows/prod-deploy-ui.yml`** — `workflow_dispatch` only, `environment: production`, builds via Nx, deploys via `netlify-cli` with `--prod --site $NETLIFY_PROD_SITE_ID`. Inspired by Novu's `prod-deploy-web.yml`.                                                                                                                                                                                                                                                                                      | P0       | Med    | High   |
| R6  | **Pin `netlify-cli` version** in CI (and document via lockfile or `pnpm dlx netlify-cli@<version>`) to avoid drift.                                                                                                                                                                                                                                                                                                                                                                                                       | P1       | Low    | Med    |
| R7  | **Update `apps/api/fly.staging.toml`** `ADDITIONAL_CORS_ORIGINS` to `["https://deploy-preview-*--taucad.netlify.app","https://main--taucad.netlify.app","https://taucad.netlify.app","https://tau-ui-pr-*.fly.dev"]`. Keep PR-preview glob narrow (`deploy-preview-*`) — do not broaden to `*--taucad.netlify.app`. Re-deploy staging API.                                                                                                                                                                                | P0       | Low    | High   |
| R8  | **Update `apps/api/fly.prod.toml`** to add `ADDITIONAL_CORS_ORIGINS = ["https://taucad-prod.netlify.app"]` until `tau.new` DNS cutover, after which the entry can be removed. No PR-preview glob — previews live on staging only.                                                                                                                                                                                                                                                                                         | P0       | Low    | High   |
| R9  | **Audit Helmet config** in `apps/api/app/main.ts` — explicitly set `crossOriginResourcePolicy: { policy: 'cross-origin' }` so COEP `require-corp` on Netlify can consume API responses.                                                                                                                                                                                                                                                                                                                                   | P0       | Low    | High   |
| R10 | **Attach custom domains to both Netlify sites** so the locked-in `sameSite: 'lax'` cookie strategy keeps working. Sequence: (a) add `taucad.dev` as a custom domain on the existing `taucad` site; (b) add `tau.new` as a custom domain on the new `taucad-prod` site; (c) cut DNS over from Fly to Netlify per environment, coordinated with R11 (Fly UI machines for that environment must stop serving the same hostname). Use Netlify's managed-DNS or external-DNS path; verify TLS issuance before cutting traffic. | P0       | Med    | High   |
| R11 | **Decommission redundant Fly UI deploys** once Netlify production is verified — remove `apps/ui/fly.{prod,staging}.toml` and the `deploy-ui-staging` job in `ci.yml` (and the manual-prod path in `deploy.yml`). Keep PR review apps on Fly OR migrate to Netlify deploy previews (already running).                                                                                                                                                                                                                      | P1       | Med    | Med    |
| R12 | **Update review.yml** — if Netlify deploy previews fully replace `tau-ui-pr-*.fly.dev`, remove the UI half of `review.yml`. If Fly review apps stay, keep; otherwise drop the corresponding wildcard from API CORS in R7.                                                                                                                                                                                                                                                                                                 | P1       | Low    | Med    |
| R13 | **Add `NETLIFY_AUTH_TOKEN` and `NETLIFY_PROD_SITE_ID`** to GitHub `production` environment secrets/variables. Document in `apps/ui/.env.example` or a deployment runbook.                                                                                                                                                                                                                                                                                                                                                 | P0       | Low    | High   |
| R14 | **Sanity-test Better Auth callback URLs** for Netlify origins — Better Auth `trustedOrigins` and OAuth provider redirect URIs must include the Netlify hostnames during cutover, otherwise OAuth callbacks 4xx.                                                                                                                                                                                                                                                                                                           | P0       | Low    | High   |
| R15 | **File follow-up bug** in `scripts/src/repos/` for the `--branch` arg ordering that breaks `pnpm repos add ... --clone -b <branch>`.                                                                                                                                                                                                                                                                                                                                                                                      | P3       | Low    | Low    |
| R16 | **Document the deployment topology** with a short README under `docs/architecture/` (or extend `apps/ui/netlify.toml` header comment) so contributors understand which site is which and how to trigger a prod release.                                                                                                                                                                                                                                                                                                   | P2       | Low    | Med    |

## Risks and Open Questions

1. **Auth flows are blocked on Netlify default domains until DNS cutover.** Cookie strategy is fixed at `sameSite: 'lax'`, so cookies will not flow between `*.netlify.app` UI and `api.{tau.new,taucad.dev}` API. Pre-cutover smoke tests on `https://taucad.netlify.app` / `https://taucad-prod.netlify.app` must be limited to unauthenticated routes (assets, `/health`, public docs, COEP/CORP, CSP). Authenticated end-to-end testing is gated on R10 (custom-domain attachment + DNS cutover) per environment.
2. **Fly UI prod and Netlify UI prod cannot both serve `tau.new` (same for `taucad.dev` on staging).** The DNS A/AAAA/ALIAS record is single-source-of-truth. Plan a short maintenance window per environment: (1) provision Netlify custom domain and confirm TLS, (2) flip DNS, (3) stop Fly UI machines for that environment. Roll-back plan: re-point DNS back to Fly. Keep Fly UI configs (`apps/ui/fly.{prod,staging}.toml`) for ≥1 week post-cutover before R11.
3. **SSR function size (33 MB)** is approaching the Netlify Functions 50 MB unzipped limit. Worth tracking via `size:build` and considering splitting heavy dependencies (e.g. `@taucad/converter`, `@taucad/runtime`) out of the SSR bundle.
4. **WebSocket on Netlify** — the WebSocket connection bypasses Netlify entirely (it goes browser → Fly directly). The CSP `connect-src 'self' … wss:` already allows this. No Netlify-side change required for WS, only API CORS allowlist updates (R7/R8).
5. **`ci.yml` UI staging deploy duplication.** Once R1–R3 land, `ci.yml`'s `deploy-ui-staging` (Fly) is redundant with Netlify's auto-build of `main`. Either keep both as failover or delete via R11.
6. **PR previews are scoped to staging only.** PRs against `main` deploy to `taucad`'s `deploy-preview` context, which builds with the staging env vars set in R2. PRs are explicitly **not** mirrored on the production site `taucad-prod` — no deploy-preview wildcard goes into `apps/api/fly.prod.toml`. Reviewers click the staging preview URL even when the PR's eventual production target is `tau.new`. If a future need arises to test against prod APIs from a preview, that's a deliberate, separately-scoped change.
7. **Custom domain TLS** — moving `tau.new` to Netlify requires re-issuing the certificate (Let's Encrypt via Netlify managed DNS or DNS-only). Plan for ~10–60 minutes of TLS provisioning.
8. **Helmet `crossOriginResourcePolicy`** is currently the registered default — verify in source whether Tau already overrides this; if not, R9 is a real gap, not a verification.

## Appendix

### A. Netlify CLI commands used

```bash
netlify status                                                          # Confirms auth + team
netlify api listSites                                                   # Enumerates sites for the user
netlify api getSite --data='{"site_id":"a006a282-…"}'                   # Full site config
netlify api getEnvVars --data='{"account_id":"…","site_id":"…"}'        # Env vars (with values)
netlify api listSiteDeploys --data='{"site_id":"…","per_page":50}'      # Deploy history
```

### B. Novu reference paths

- `repos/novu/.github/workflows/reusable-dashboard-deploy.yml` — reusable build+deploy
- `repos/novu/.github/workflows/dev-deploy-dashboard.yml` — dev auto-deploy
- `repos/novu/.github/workflows/prod-deploy-web.yml` — prod manual-deploy (multi-region)
- `repos/novu/.github/workflows/reusable-web-deploy.yml` — heavier reusable with env-file generation
- `repos/novu/apps/dashboard/netlify.toml` — minimal SPA Netlify config

### C. Tau key file references

- `.github/workflows/ci.yml` — staging-only auto-deploys
- `.github/workflows/deploy.yml` — reusable Fly deploy with `workflow_dispatch`
- `.github/workflows/review.yml` — PR review apps on Fly
- `apps/ui/netlify.toml` — current Netlify config (with override conflict vs dashboard env)
- `apps/ui/Dockerfile` — Fly UI container (uses `react-router-serve`)
- `apps/ui/app/environment.config.ts` — auto-derives `TAU_FRONTEND_URL` from `NETLIFY_AI_GATEWAY_URL`
- `apps/api/app/main.ts` — Fastify CORS + Helmet + Socket.IO adapter
- `apps/api/app/utils/cors.utils.ts` — glob-aware origin validator
- `apps/api/app/config/better-auth.config.ts` — auth cookie + trustedOrigins
- `apps/api/fly.staging.toml`, `apps/api/fly.prod.toml` — API env per environment

### D. Suggested ordering for execution

**Cookie strategy is fixed (sameSite=lax + custom domains)**, so the sequence is purely operational.

1. R1, R3 (provision `taucad-prod` Netlify site + its env vars). Build remains gated on R5 — provisioning alone does not auto-deploy.
2. R7, R8, R9 (API CORS + Helmet) — deploy staging API first, smoke-test unauthenticated routes from `https://main--taucad.netlify.app`.
3. R2 (fix existing site env vars) — verify staging Netlify keeps working post R7, then run R4 (PR-preview smoke test) on the next opened PR.
4. R13 (GH secrets) → R5 (workflow) → R6 (pin CLI). At this point a manual `prod-deploy-ui.yml` run can target `https://taucad-prod.netlify.app` (Netlify default domain) and verify the deploy pipeline end-to-end without disrupting `tau.new`.
5. **Staging cutover**: R10(a) attach `taucad.dev` to `taucad` → confirm TLS → flip DNS → R14 (verify Better Auth callbacks under the cutover hostnames) → smoke-test auth end-to-end → stop Fly `tau-ui-staging` machines.
6. **Production cutover**: R10(b) attach `tau.new` to `taucad-prod` → confirm TLS → flip DNS → R14 (verify Better Auth callbacks) → smoke-test auth end-to-end → stop Fly `taucad` (prod UI) machines.
7. R11 (decommission Fly UI configs + `ci.yml` `deploy-ui-staging` job) once both environments have been stable on Netlify for ≥1 week.
8. R12, R15, R16 (cleanup + documentation).

## Gap Analysis: Remaining Manual Operations

### Executive Summary

The Netlify migration is **code-complete** across both environments. Staging UI builds automatically on every push to `main` and PR via the Netlify GitHub integration; production UI ships manually via [`.github/workflows/prod-deploy-ui.yml`](../../.github/workflows/prod-deploy-ui.yml) (`workflow_dispatch`). **DNS record declarations now live under `repos/tau-cloud` (Terraform)**, coordinated by **`repos/tau-cloud/docs/dns-migration-plan.md`**, leaving these operations outside CI automation: PAT mint + secret placement (often **HCP Terraform Variable Sets** + GitHub Actions secrets simultaneously), OAuth redirect-URI edits in vendor consoles, **registrar authoritative nameserver delegation**, Netlify-managed Let's Encrypt TLS provisioning wait windows, and the human judgement smoke gate before trusting a promotion. This gap section therefore tracks remaining **interaction surfaces**, not unmanaged DNS rows after Cloudflare assumes authority post NS flip.

### Methodology

The gap list was derived by enumerating every interactive step outside **Git-mergeable** automation in this repo. Tooling surveyed includes **`netlify-cli`**, **`gh`**, [`prod-deploy-ui.yml`](../../.github/workflows/prod-deploy-ui.yml), and the Terraform-managed surfaces in **`repos/tau-cloud`**. Operational bootstrapping that predated Terraform (temporary shell helpers) may still exist in archived notes but **`repos/tau-cloud/scripts/netlify-bootstrap-site.sh`** (+ API deletes documented in **`repos/tau-cloud/docs/netlify-iac-runbook.md`**) supersede imperative click-ops wherever possible — subject to Terraform provider gaps (notably declarative **`netlify_site` creation**, still absent).

### Findings

#### Finding M1: Netlify PAT must be pasted into `gh secret set`

**Severity**: P0 — blocks the first prod deploy until done

**Status**: **MANUAL** — one-time per Netlify account / GitHub repo pair.

**Source**: Historically scripted helper calls to `gh secret set`; post- **`repos/tau-cloud`**, consolidate Netlify PAT in **Terraform Cloud / HCP variable sets** alongside other provider tokens (still pasted interactively outside CI).

**Reason it cannot be scripted**: A Netlify Personal Access Token is created at [app.netlify.com/user/applications#personal-access-tokens](https://app.netlify.com/user/applications#personal-access-tokens) via a logged-in browser session. Netlify does not expose a programmatic PAT-mint endpoint (intentionally — the PAT is the root credential for `netlify-cli`). The provisioning script therefore prompts the operator to paste it once and forwards it directly to `gh secret set NETLIFY_AUTH_TOKEN --env production` without persisting locally.

#### Finding M2: Google + GitHub OAuth redirect-URI verification

**Severity**: P0 — auth flow silently breaks if the URI isn't pre-registered

**Status**: **MANUAL** — one-time per environment per OAuth provider.

**Source**: Cookie & Auth strategy in [docs/architecture/ui-deployment-topology.md](../architecture/ui-deployment-topology.md).

**Reason it cannot be scripted**: Google Cloud Console exposes OAuth client redirect URIs only via the web UI; there is no `gcloud` or REST API for mutating an OAuth 2.0 client's redirect URI list. GitHub OAuth Apps have a similar story — the [GitHub Apps API](https://docs.github.com/en/rest/apps/apps) supports listing but redirect-URI updates require the OAuth app owner to log in. The operator verifies (visually) that `https://{taucad.dev,tau.new}/api/auth/callback/{github,google}` are listed against each OAuth client.

#### Finding M3: Registrar nameserver delegation (Cloudflare authoritative DNS)

**Severity**: P0 — actual resolver authority flip toward Cloudflare-hosted records.

**Status**: **MANUAL NAMESERVER EDIT** — still performed at registrar; **individual DNS rows** now reviewable beforehand as Terraform-managed `repos/tau-cloud/stacks/cloud/{staging,prod}` plans.

**Source**: [`repos/tau-cloud/docs/dns-migration-plan.md`](../../repos/tau-cloud/docs/dns-migration-plan.md).

**Reason it stays manual**: Registrar APIs vary; NS glue updates require owner credentials and judgement about propagation windows (`dig +trace` acceptance tests). IaC declares the eventual steady-state records (including **`api.<env>`** pairing) prior to flipping NS so Cloudflare authoritative answers converge immediately upon delegation.

#### Finding M4: Netlify-managed Let's Encrypt TLS provisioning wait

**Severity**: P1 — observable but uncontrollable

**Status**: **MANUAL** — wait + observe, no automation available.

**Source**: Netlify custom-domain attachment workflow.

**Reason it cannot be scripted**: After `netlify api updateSite '{ "custom_domain": "tau.new" }'` runs and DNS is correct, Netlify provisions a Let's Encrypt certificate asynchronously. The Netlify API exposes the certificate state read-only (`netlify api showSiteTLSCertificate`) but does not expose a "force provision" trigger or a deterministic SLA. The cutover step is therefore "wait until `state == "issued"`, then proceed" — the operator polls or watches the Netlify dashboard.

#### Finding M5: Production smoke test

**Severity**: P0 — final gate before declaring success

**Status**: **MANUAL** — by definition, requires human judgement.

**Source**: Pre-deploy verification before flipping production traffic.

**Reason it cannot be scripted**: Smoke-testing covers visual correctness (no broken styles, fonts loaded), behavioural correctness (CAD viewer renders, file manager opens projects, chat completes a turn), and end-to-end auth (sign in via GitHub + Google, cookies set on `tau.new`, callbacks land on `api.tau.new` with `crossSubDomainCookies` honoured). E2E tests cover the deterministic surface, but a final human pass remains the gate for promoting a deploy.

### Landscape Summary

| #   | Manual Step                                                         | Tool Status                                                           | Tooling                                       | Action                                                         |
| --- | ------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| M1  | Paste Netlify PAT                                                   | Interactive only — Netlify does not expose programmatic PAT minting.  | PAT vault / `gh secret set` / HCP TF var sets | Operators paste once each surface that needs automation creds. |
| M2  | OAuth redirect-URI verification                                     | No GCP / GitHub API for OAuth-client URI mutation.                    | Web console                                   | Operator verifies the listed URIs.                             |
| M3  | Registrar NS delegation (`taucad.dev`, `tau.new`) toward Cloudflare | IaC previews entire zone — operator still swaps NS glue at registrar. | Registrar dashboard + **`dig`**               | Follow **`repos/tau-cloud/docs/dns-migration-plan.md`**.     |
| M4  | TLS provisioning wait                                               | Netlify exposes read-only state; no SLA / force-provision endpoint.   | `netlify api`                                 | Operator polls until `issued`.                                 |
| M5  | Production smoke test                                               | E2E covers deterministic surface; final gate is human.                | Human                                         | Operator validates UX before promoting.                        |

### Conclusion

The migration remains code-complete relative to Tau application repos: staging deploys automatically, production promotes through `prod-deploy-ui.yml`, and **`repos/tau-cloud`** now absorbs DNS + Netlify settings drift that previously lived purely in dashboards / ad-hoc scripts. M1/PAT minting stays interactive by vendor design; registrar NS delegation persists as a guarded human milestone even though record bodies are IaC-reviewed first. **`This gap analysis is the reconciliation point between historical Netlify-console operations and Terraform ownership — not a denial that DNS moved into IaC.`**
