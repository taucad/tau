---
title: 'IaC strategy — HCP Terraform Stacks blueprint for Tau cloud (Fly, Stripe, Netlify, Supabase, R2, Grafana)'
description: 'Architecture blueprint for repos/tau-cloud: Terraform + HCP Terraform Free with Stacks from day one, multi-environment deployments (staging + prod-us + prod-eu) with no is_prod boolean, per-provider readiness, variable-set secrets, full Cloudflare DNS authority (records migrated from Namecheap).'
status: superseded
created: '2026-05-05'
updated: '2026-05-14'
category: architecture
superseded_by: docs/research/tau-cloud-activation-status.md
related:
  - docs/research/tau-cloud-activation-status.md
  - docs/policy/vision-policy.md
  - docs/research/sharing-architecture.md
  - docs/research/sharing-mvp-manual-runbook.md
  - docs/research/chatgpt-deep-research-brief.md
---

> **Superseded.** This blueprint captured the full multi-provider HCP Terraform Stacks target (Fly + Stripe + Netlify + Supabase + R2 + Grafana). The V1 slice that actually landed (Cloudflare DNS + Netlify site build settings + GitHub repo, plain per-env root modules instead of Stacks) plus the remaining operator gates to activate it are consolidated in [`docs/research/tau-cloud-activation-status.md`](tau-cloud-activation-status.md). The unrealised V2+ scope (R2 + Supabase + Stripe + Grafana provider work + Stacks adoption + `tau-secrets` presence audit) survives as numbered recommendations there. Treat the content below as historical reference for the design rationale.

# IaC strategy — HCP Terraform Stacks blueprint for Tau cloud (Fly, Stripe, Netlify, Supabase, R2, Grafana)

A target architecture for `repos/tau-cloud` that captures Tau's entire cloud footprint — Fly.io API, Netlify UI, Supabase Postgres, Cloudflare R2 + Cache Rules, Stripe billing, and Grafana Cloud observability — as declarative Terraform Stacks, replacing the manual click-ops + `flyctl secrets set` runbook documented in [`sharing-mvp-manual-runbook.md`](sharing-mvp-manual-runbook.md). The shape is built from day one to support **staging + prod-us + prod-eu** with no `is_prod` boolean and no per-environment forking.

## Executive Summary

We recommend **Terraform 1.14+** running on **HCP Terraform Free tier** (500 RUM, post-2026-03-31 plan revamp), with **Stacks** as the unit of organization from the first commit and **Variable Sets** as the secret store. The tau-cloud repo holds one main stack — `stacks/cloud/` — whose component graph (R2 → Netlify env vars → Supabase project → Stripe catalog → Grafana dashboards → secrets-presence assertions) is deployed three times today (`staging`, `prod-us`, prod-eu pre-defined), with deployment-level inputs carrying full environment descriptors so geo-regional production rollout is purely a matter of adding a fourth `deployment` block. **Cloudflare is the DNS authority for both `tau.new` and `taucad.dev`** (Namecheap remains the registrar only); the actual record-by-record migration from Namecheap to Cloudflare is captured in a coordinated follow-up runbook (`repos/tau-cloud/docs/dns-migration-plan.md`), after which every record (`api.*`, `cdn.*`, apex, MX, TXT) becomes a reviewable `cloudflare_dns_record` in IaC and the [Finding 11](staging-cors-coep-safari-rendering-audit.md) cert↔app pairing defense closes in code. **Fly.io has no maintained Terraform provider** (official archived 2024; community fork single-maintainer), so app deploy + secrets stay on `flyctl` + GitHub Actions, and IaC carries a presence-only assertion module for Fly secret names. OpenTofu was evaluated as the OSS-licensed alternative; we accept Terraform's BSL 1.1 in exchange for Stacks (no OpenTofu equivalent), Variable Sets (managed secrets), HCP-managed state (no R2 bootstrap dance), and built-in Run UI on PR — operational quality outweighs licensing alignment for an internal tau-cloud repo that does not need to be open.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Scope and Non-Goals](#scope-and-non-goals)
- [Methodology](#methodology)
- [Findings](#findings)
- [Target Architecture](#target-architecture)
- [Recommendations](#recommendations)
- [Placeholder Resource Inventory](#placeholder-resource-inventory)
- [Roadmap](#roadmap)
- [Trade-offs](#trade-offs)
- [References](#references)
- [Appendix](#appendix)

## Problem Statement

The Sharing MVP plan Phase L (M1-M6) is currently 100% click-ops: Cloudflare buckets, custom domains, lifecycle rules, CORS, Cache Rules, Fly secrets, Fly cert↔app pairings, Smart Tiered Cache toggles, and Stripe products are all human-operated. Two environments (staging `taucad.dev` + production `tau.new`) duplicate the work, drift between them is unobservable, and there is no diff/review surface when a config bit changes. Geo-regional production is on the horizon (`prod-eu` to follow `prod-us`); duplicating click-ops across a third environment is not a viable path. Symptoms triggering this investigation:

- **Cert↔app routing mistake** documented in [staging-cors-coep-safari-rendering-audit Finding 11](staging-cors-coep-safari-rendering-audit.md) — `api.taucad.dev` cert was attached to the prod `tau-api` app instead of staging `tau-api-staging`, silently routing requests across environments. A reviewable IaC diff would have caught this.
- **No reviewable provenance** for "which Fly secret is set on which app" — the runbook says `flyctl secrets set ... -a <app>` but the actual list lives only in Fly's API.
- **Repeated bootstrap** of CORS, cache rules, lifecycle rules across each new bucket — at three buckets per env × three envs that is 27 manual configurations to keep aligned.
- **Stripe + Supabase + multi-region prod landing soon** — both have first-class Terraform providers, and pre-creating products/branches/regional projects by hand only multiplies the drift surface.

## Scope and Non-Goals

**In scope.** Terraform tool choice; HCP Terraform free-tier strategy; Stacks-based multi-environment architecture (`staging`, `prod-us`, `prod-eu`); the six providers Tau already depends on or is about to (Fly, Stripe, Netlify, Supabase, Cloudflare R2, Grafana); managed state + locking via HCP; secrets via HCP Variable Sets; placeholder resource inventory; phased roadmap.

**Out of scope.** Application deploy logic itself stays in `.github/workflows/` — `docker/build-push-action@v6` + `flyctl deploy --image` and `netlify deploy --prod` are working and orthogonal to IaC. Fly secret _values_ remain manual via `flyctl secrets set`; IaC declares the _expected secret name set_ and rotation policy. **DNS migration execution** (importing existing Namecheap records into Cloudflare, switching the nameservers at the registrar, propagation wait) is documented as a coordinated follow-up runbook at `repos/tau-cloud/docs/dns-migration-plan.md` rather than executed inline with the IaC blueprint — the blueprint declares the post-migration target state. Namecheap stays the registrar. Database schema migrations stay in Drizzle; IaC manages the Postgres _project_, not its _contents_. OpenTofu is documented as a fallback path (Trade-offs and Appendix D) but is not the primary recommendation.

## Methodology

1. **Repo context audit.** Read [`sharing-architecture.md`](sharing-architecture.md), [`sharing-mvp-manual-runbook.md`](sharing-mvp-manual-runbook.md), [`vision-policy.md`](../policy/vision-policy.md), and the Sharing MVP plan to enumerate every cloud resource Tau already uses or plans to use.
2. **Existing config inventory.** Read [`apps/api/fly.staging.toml`](../../apps/api/fly.staging.toml), [`apps/api/fly.prod.toml`](../../apps/api/fly.prod.toml), [`apps/ui/netlify.toml`](../../apps/ui/netlify.toml), [`apps/ui/netlify.prod.toml`](../../apps/ui/netlify.prod.toml), [`apps/api/.env.example`](../../apps/api/.env.example), and [`infra/grafana/`](../../infra/grafana/) to capture the current declarative surface.
3. **Web research (May 2026 snapshot).** Twelve parallel queries covering: Terraform vs OpenTofu 2026 divergence; HCP Terraform 2026-03-31 plan revamp; Stacks GA syntax (`.tfcomponent.hcl`, `.tfdeploy.hcl`, `deployment_group.auto_approve_checks`); Variable Sets encryption and rotation; per-provider versions for Fly, Netlify, Supabase, Cloudflare v5, Stripe, Grafana; Cloudflare R2 custom domain DNS requirements (partial zone vs subdomain delegation).
4. **Provider readiness scoring.** Each provider rated on (a) maintenance health, (b) coverage of Tau's actual resource needs, (c) maturity (1.x vs pre-1.0).

## Findings

### Finding 1: Terraform + HCP Terraform Free wins on operational quality once licensing is accepted

The tau-cloud repo is private (taucad-owned, not open source), so Terraform's BSL 1.1 license imposes no real constraint on Tau's MIT-licensed runtime stack. With that constraint relaxed, Terraform ahead of OpenTofu on the constellation that matters here:

| Capability                                       | Terraform + HCP Free                                                   | OpenTofu + self-host                                |
| ------------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------- |
| Stacks (multi-component coordinated deployments) | ✅ GA late 2025                                                        | ❌ Not planned                                      |
| Managed state + locking                          | ✅ Built-in                                                            | ✅ S3 backend `use_lockfile = true` (1.10+)         |
| Managed secrets via Variable Sets                | ✅ Encrypted at rest, audit log, rotation propagates to all workspaces | ❌ Roll your own (Doppler/Vault/GH Actions secrets) |
| Run UI on PR                                     | ✅ Native VCS-driven plan UI                                           | ❌ Markdown-comment hack via GH Actions             |
| Sentinel / OPA policy as code                    | ✅ Free tier                                                           | ⚠️ OPA/Conftest in CI                               |
| Drift detection                                  | Standard tier (~$20/seat/mo)                                           | ❌ Roll your own (cron `plan -refresh-only`)        |
| Native client-side state encryption              | ❌                                                                     | ✅ OpenTofu only (1.7+)                             |
| Free monetary cost                               | 500 RUM free                                                           | $0 self-host                                        |
| Vendor lock-in                                   | Moderate, reversible                                                   | Low                                                 |

HCP Terraform's enhanced Free tier (post-2026-03-31 plan revamp) covers up to **500 managed resources**, unlimited users, unlimited applies, and now includes premium features (SSO, policy as code, run tasks, agents) that previously sat behind a paywall. Tau's projected RUM through V2 is ≈60-100; through V3 (ephemeral previews) ≈500 at 50 active PR previews — **the entire roadmap fits inside the free tier**, with drift detection being the only paywall feature (mitigated on free tier by a `plan -refresh-only` GH Actions cron).

OpenTofu remains a documented fallback in [Appendix D](#d-opentofu-fallback-path) — state migration TFC → OpenTofu+R2 is `terraform state pull > backup.tfstate` then re-init with a new backend, and HCL/state are bit-compatible, so reversal cost is small.

### Finding 2: Stacks from day one (staging + prod-us + prod-eu in one stack)

Stacks (GA late 2025, billing aligned with workspace RUM) is the canonical solution for multi-environment infrastructure where the _component graph is identical across environments_ but inputs differ. Tau's component graph (R2 buckets → Netlify env vars → Supabase project → Stripe catalog → Grafana folder → secrets-presence) is exactly that pattern.

The shape:

- **One stack `cloud`**, defined under `stacks/cloud/`, with its component graph in `_components.tfcomponent.hcl` and per-environment instances in `_deployments.tfdeploy.hcl`.
- **Three deployments today**: `staging`, `prod-us`, `prod-eu` — even though `prod-eu` initially provisions zero resources (`enabled = false` flag flowing through component inputs), it is declared so adding the region later is a flag flip rather than a structural change.
- **One deployment group per deployment** (Stacks GA constraint: groups currently support only one deployment each), each carrying its own `auto_approve_checks` policy: staging auto-applies on no-destroys, production requires manual approval always.
- **Hard cap**: 20 deployments per stack. Three production environments + staging leaves headroom but rules out PR previews in this stack — they get their own (`stacks/preview/`, V3).

Stacks alternatives considered:

| Approach                                   | Verdict for Tau | Reason                                                                                                                                                 |
| ------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Stacks**                                 | **Adopt**       | Coordinated multi-component apply; deployments parameterise the same graph; ≤20 deployment cap is fine for cloud stack; PR previews use a second stack |
| Native rootmodule per env (V1 of this doc) | Reject          | Needs hand-rolled cross-component ordering; no PR-preview path; duplicates provider/backend blocks per env                                             |
| Workspaces                                 | Reject          | Single configuration; cannot model interconnected services passing values; no orchestration                                                            |
| Terragrunt                                 | Reject          | Fourth tool; OpenTofu-tied DRY pattern made obsolete by Stacks; no Stacks equivalent                                                                   |

### Finding 3: Provider readiness is uneven — Fly is the only blocker

Snapshot of the six providers, May 2026:

| Provider       | Registry slug           | Latest             | Maintenance             | Coverage of Tau's needs                                                                                                                                                                                                                       | Verdict                                                                      |
| -------------- | ----------------------- | ------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Cloudflare** | `cloudflare/cloudflare` | v5.19.0 (Apr 2026) | Vendor, active          | R2 buckets, Cache Rules (`set_cache_control` / `set_cache_tags` since v5.18.0), Workers, API tokens, R2 custom domains. CORS + lifecycle on R2 require the `aws/aws` provider against the R2 S3 endpoint.                                     | Adopt                                                                        |
| **Supabase**   | `supabase/supabase`     | v1.9.0 (Mar 2026)  | Vendor, active          | Project create/import per region, branch databases (preview DBs), `supabase_settings` (API config), import support.                                                                                                                           | Adopt                                                                        |
| **Grafana**    | `grafana/grafana`       | v3.x (req ≥2.9)    | Vendor, active          | Dashboards (JSON), folders, alert rules, contact points, notification policies, service accounts. `disable_provenance = false` locks dashboards from UI edits — drift detection is the point.                                                 | Adopt                                                                        |
| **Netlify**    | `netlify/netlify`       | v0.4.1 (Feb 2026)  | Vendor, pre-1.0         | `netlify_environment_variable` with full context-scoping (`production`, `deploy-preview`, `branch-deploy`) and `secret_values`. Site-management coverage partial.                                                                             | Adopt selectively (env vars only)                                            |
| **Stripe**     | `stripe/stripe`         | v0.2.2 (Apr 2026)  | Vendor, pre-1.0         | `stripe_product`, `stripe_price`, `stripe_coupon`, `stripe_tax_rate`, `stripe_shipping_rate`, `stripe_webhook_endpoint`, `stripe_billing_meter`, `stripe_customer`. Subscription/checkout templates not declarative — those stay in app code. | Adopt for catalog + webhooks                                                 |
| **Fly.io**     | (none viable)           | n/a                | **Archived 2024-03-01** | n/a                                                                                                                                                                                                                                           | Skip — see [Finding 4](#finding-4-flyio-has-no-supported-terraform-provider) |

### Finding 4: Fly.io has no supported Terraform provider

The official `fly-apps/terraform-provider-fly` was archived in March 2024 with the explicit notice: _"This project is not currently maintained, and is not a recommended method of deployment to Fly.io."_ Latest release v0.0.23 (June 2023), 52 open issues, no roadmap. Fly's own recommendation is the CLI or direct GraphQL API.

Two plausible paths:

| Option                                                                                 | Pro                                                                                                                                                | Con                                                                                                  |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **A. Community fork `andrewbaxter/fly`** (last release Oct 2024, last commit Feb 2025) | Restores ~80% of resource coverage (apps, machines, certs, IPs, volumes); single-maintainer fork                                                   | Single-maintainer risk; Fly.io GraphQL API drift catches up eventually; not on the official registry |
| **B. Skip Terraform for Fly**                                                          | Honest about Fly's reality; no orphan code; deploy/secrets stay in `.github/workflows/deploy.yml` + `flyctl secrets set` runbook (already working) | Fly resources (apps, certs, scaling) drift outside IaC review                                        |

We recommend **B** as the default. Rationale: app + machine config already lives declaratively in `fly.{staging,prod}.toml` (read by `flyctl deploy`), and the cross-app cert mistake from [staging-cors-coep-safari-rendering-audit Finding 11](staging-cors-coep-safari-rendering-audit.md) is more cleanly defended by **a runbook checklist + a presence-only `tau-secrets` component** that diffs `flyctl secrets list` against an expected name set, than by adding an unsupported provider. Option A is held in reserve for V4 if cert/IP automation becomes load-bearing.

### Finding 5: HCP-managed state replaces R2 backend bootstrap

HCP Terraform managed state eliminates the chicken-and-egg bootstrap from this doc's V1 design (private R2 bucket → state passphrase → tofu init). With Stacks, each deployment owns one state file per component automatically; locking is built in; encryption at rest is HashiCorp's responsibility. The only setup is creating the HCP organization + linking the GitHub repo + creating the project under which the stack lives.

Threat model: state contains plaintext secrets (Stripe restricted keys, Supabase JWT secrets, Cloudflare API tokens). With HCP-managed state, HashiCorp holds the encryption keys; with self-hosted R2 + native client-side encryption (OpenTofu only), Tau holds them. Both are acceptable; HCP wins on operational simplicity.

### Finding 6: Variable Sets centralise provider auth as managed secrets

Variable Sets are HCP Terraform's first-class secret store. One variable set named `tau-cloud-providers` holds all provider auth tokens, encrypted at rest, with workspace assignment by tag (`stack:cloud`):

| Variable                  | Type                    | Source                                                                                   |
| ------------------------- | ----------------------- | ---------------------------------------------------------------------------------------- |
| `cf_api_token`            | Sensitive env var       | Cloudflare → Profile → API Tokens (scoped: R2 admin + Cache Rules + Workers + Zone read) |
| `supabase_pat`            | Sensitive env var       | Supabase → Account → Access Tokens                                                       |
| `stripe_api_key_test`     | Sensitive Terraform var | Stripe Test mode → Restricted Key (resources-required scope)                             |
| `stripe_api_key_live`     | Sensitive Terraform var | Stripe Live mode → Restricted Key (resources-required scope)                             |
| `netlify_pat`             | Sensitive env var       | Netlify → User → Personal Access Tokens                                                  |
| `grafana_cap_token`       | Sensitive env var       | Grafana Cloud → Cloud Access Policies                                                    |
| `fly_secrets_audit_token` | Sensitive env var       | Fly → Personal Access Tokens (read-only) — for the `tau-secrets` presence-only module    |

Rotation: edit the value in HCP, all subsequent runs pick it up. Audit log per variable read on every plan/apply. No `TF_VAR_*` plumbing in GitHub Actions; no provider tokens in GH repo secrets.

Stripe's API keys split by mode (test vs live), exposed to the stack as a single variable consumed conditionally based on the deployment input `stripe_mode`:

```hcl
# inside the stripe-catalog component
provider "stripe" {
  api_key = var.stripe_mode == "live" ? var.stripe_api_key_live : var.stripe_api_key_test
}
```

### Finding 7: Multi-environment shape avoids `is_prod` and supports geo-regional rollout

Binary `is_prod` is the shape that most multi-env Terraform repos start with and most regret. The moment a second production region lands, `is_prod ? "prod" : "staging"` cannot express "production but EU-resident" without a second boolean and combinatorial branching. Tau commits to **rich environment descriptors carried as deployment inputs** from the first commit:

```hcl
# stacks/cloud/_deployments.tfdeploy.hcl

deployment "staging" {
  inputs = {
    environment_id   = "staging"
    tier             = "non-production"
    region_code      = "ap-syd"
    enabled          = true
    domain_root      = "taucad.dev"
    apex_hostname    = "taucad.dev"
    api_hostname     = "api.taucad.dev"
    cdn_hostname     = "cdn.taucad.dev"
    fly_app_name     = "tau-api-staging"
    fly_region       = "syd"
    netlify_site_slug = "taucad"
    bucket_prefix    = "tau-staging"
    r2_location_hint = "WEUR"      # Cloudflare-side data residency hint
    supabase_region  = "ap-southeast-2"
    supabase_instance_size = "micro"
    stripe_mode      = "test"
    grafana_folder   = "Tau / staging"
    allowed_origins  = ["https://taucad.dev", "https://*--taucad.netlify.app"]
  }
  deployment_group = deployment_group.staging
}

deployment "prod_us" {
  inputs = {
    environment_id   = "prod-us"
    tier             = "production"
    region_code      = "us-iad"
    enabled          = true
    domain_root      = "tau.new"
    apex_hostname    = "tau.new"
    api_hostname     = "api.tau.new"
    cdn_hostname     = "cdn.tau.new"
    fly_app_name     = "tau-api"
    fly_region       = "iad"
    netlify_site_slug = "taucad-prod"
    bucket_prefix    = "tau-prod-us"
    r2_location_hint = "ENAM"
    supabase_region  = "us-east-1"
    supabase_instance_size = "small"
    stripe_mode      = "live"
    grafana_folder   = "Tau / production / US"
    allowed_origins  = ["https://tau.new"]
  }
  deployment_group = deployment_group.prod_us
}

deployment "prod_eu" {
  inputs = {
    environment_id   = "prod-eu"
    tier             = "production"
    region_code      = "eu-fra"
    enabled          = false       # flip to true when prod-eu launches
    domain_root      = "tau.new"
    apex_hostname    = "tau.new"
    api_hostname     = "eu.api.tau.new"
    cdn_hostname     = "eu.cdn.tau.new"
    fly_app_name     = "tau-api-eu"
    fly_region       = "fra"
    netlify_site_slug = "taucad-prod"   # Netlify is global; one site fans out via CDN
    bucket_prefix    = "tau-prod-eu"
    r2_location_hint = "WEUR"
    supabase_region  = "eu-central-1"
    supabase_instance_size = "small"
    stripe_mode      = "live"
    grafana_folder   = "Tau / production / EU"
    allowed_origins  = ["https://tau.new"]
  }
  deployment_group = deployment_group.prod_eu
}
```

Component modules consume `var.tier`, `var.region_code`, `var.bucket_prefix`, `var.enabled` directly — there is no `is_prod` in any module body, no env-conditional branching anywhere. Adding `prod-au` later is a 25-line `deployment` block plus a `deployment_group`. Removing `enabled = false` and applying flips an empty placeholder into a real region.

The `enabled` flag is the linchpin for "declared but not yet deployed" environments — every component module wraps its resources in `count = var.enabled ? 1 : 0` so plan-time visibility exists for prod-eu before any infrastructure lands.

### Finding 8: Cloudflare is the DNS authority across the board; Namecheap is the registrar only

Cloudflare R2 custom domains require the hostname's parent zone to be present in the same Cloudflare account, and the cert↔app pairing defense from [staging-cors-coep-safari-rendering-audit Finding 11](staging-cors-coep-safari-rendering-audit.md) only closes in IaC if `api.*` records are declarative. Three options were available:

| Path                                   | Cloudflare plan          | Coverage     | Notes                                                                                                                                                                                                                                           |
| -------------------------------------- | ------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subdomain NS delegation (`cdn.*` only) | Free                     | `cdn.*` only | Initially attractive because everything else stays at Namecheap, but creates split-brain DNS: `api.*` and apex stay manually managed, Finding 11 stays unenforceable in IaC, and runbook drift accumulates again.                               |
| Partial zone (CNAME setup)             | **Business+** (~$200/mo) | All records  | The whole zone stays at Namecheap; specific records CNAME to Cloudflare endpoints. Most flexible but the price tag is hard to justify for one tau-cloud concern.                                                                                |
| **Full zone migration to Cloudflare**  | Free                     | All records  | Cloudflare owns the zone files; Namecheap holds only the NS records at the registrar level pointing to Cloudflare's assigned nameservers. Cloudflare DNS is free at any scale and supports every record type Tau uses (A, CNAME, MX, TXT, CAA). |

**Adopt full zone migration to Cloudflare** for both `tau.new` and `taucad.dev`. This unlocks several gains in one step:

- Every record (`api.*`, `cdn.*`, apex `A` → Netlify, `www` CNAME, MX → email provider, SPF/DKIM/DMARC TXT, CAA) becomes a `cloudflare_dns_record` resource in `modules/cloudflare-dns/`.
- The Finding 11 cert↔app pairing defense closes in IaC: `cloudflare_dns_record.api_tau_new` declaratively points at the expected Fly app and any drift surfaces in `terraform plan`.
- R2 custom domains for `cdn.*` stop needing the subdomain-delegation workaround — same-account zone is the supported path.
- One Cloudflare API token (Zone DNS Read+Edit + R2 Admin + Cache Rules) drives the entire DNS+R2 surface.

**Migration is a follow-up runbook**, not part of the IaC blueprint itself. The blueprint declares the _target_ (Cloudflare-authoritative DNS); the runbook executes the _transition_. Sequence captured in `repos/tau-cloud/docs/dns-migration-plan.md`:

1. **Mint** a Cloudflare API token scoped to Zone DNS Read+Edit on `tau.new` and `taucad.dev`; add to the `tau-cloud-providers` variable set.
2. **Add zone** for each domain in the Cloudflare dashboard (Free plan); note the assigned nameservers (typically pairs like `*.ns.cloudflare.com`).
3. **Inventory current records** at Namecheap (export zone or screenshot) — A, CNAME, MX, TXT, CAA, NS — and add the `cloudflare-dns` component to `stacks/cloud/_components.tfcomponent.hcl` declaring every record.
4. **`terraform import`** each existing-record `cloudflare_dns_record.<name>` so Terraform's view matches reality without churn.
5. **Verify** that Cloudflare's nameservers serve the zone identically to Namecheap (e.g. `dig @<cf-ns> tau.new ANY` matches `dig @<namecheap-ns> tau.new ANY`).
6. **Switch nameservers** at Namecheap (registrar level) to the Cloudflare-assigned pair.
7. **Wait for propagation** (~24-48h). Both nameservers serve the same data during propagation, so no record returns a wrong answer.
8. **Lock the zone** at Namecheap (no further DNS edits at the registrar — only NS changes); subsequent record changes flow through tau-cloud PRs.

Migration is per-zone (`tau.new` and `taucad.dev` are independent). Stagger to start with `taucad.dev` (staging) — lower stakes — and prove the loop before doing `tau.new`.

## Target Architecture

```
repos/tau-cloud/                          # private taucad/tau-cloud repo
├── README.md
├── .terraform-version                      # 1.14.x pin (tfenv-compatible)
├── modules/                                # local reusable Terraform modules
│   ├── cloudflare-dns/                     # zone records: api.*, cdn.*, apex, www, MX, TXT, CAA
│   ├── cloudflare-r2/                      # 3 buckets + custom domain + Cache Rules + scoped tokens
│   ├── netlify-site/                       # env vars only (TOML stays authoritative for build/headers)
│   ├── supabase-project/                   # project + branches + settings, regional
│   ├── stripe-catalog/                     # products, prices, webhook endpoints (mode-aware)
│   ├── grafana-stack/                      # folder + dashboards + alert rules + contact points
│   └── tau-secrets/                        # presence-only assertions for Fly + Netlify secrets
├── stacks/
│   ├── cloud/                              # MAIN STACK — staging + prod-us + prod-eu
│   │   ├── _components.tfcomponent.hcl     # component graph (refs ../../modules/*)
│   │   ├── _variables.tfcomponent.hcl      # input variables consumed by deployments
│   │   ├── _deployments.tfdeploy.hcl       # deployment "staging" / "prod_us" / "prod_eu"
│   │   ├── _orchestrate.tfdeploy.hcl       # deployment_group + deployment_auto_approve
│   │   └── _identity.tfdeploy.hcl          # provider auth from variable set tau-cloud-providers
│   └── preview/                            # V3 stack — ephemeral PR previews (≤20 active)
│       ├── _components.tfcomponent.hcl
│       ├── _deployments.tfdeploy.hcl       # deployment "pr-${number}" via for_each
│       └── _orchestrate.tfdeploy.hcl
├── docs/
│   ├── runbook.md                          # links to docs/research/sharing-mvp-manual-runbook.md
│   ├── secret-rotation.md                  # rotating items in the tau-cloud-providers var set
│   ├── dns-migration-plan.md               # Namecheap → Cloudflare DNS migration runbook (V1 prerequisite)
│   └── adding-a-region.md                  # checklist for adding prod-eu, prod-au, etc.
└── .github/workflows/                      # minimal — TFC drives plan/apply
    ├── lint.yml                            # tflint + terraform fmt -check on PR
    └── policy-check.yml                    # OPA/Conftest against generated plan JSON
```

Component graph (one direction, no cycles):

```mermaid
flowchart TB
  vars[Variable Set<br/>tau-cloud-providers] --> dns[modules/cloudflare-dns]
  vars --> r2[modules/cloudflare-r2]
  vars --> netlify[modules/netlify-site]
  vars --> sb[modules/supabase-project]
  vars --> stripe[modules/stripe-catalog]
  vars --> graf[modules/grafana-stack]
  vars --> sec[modules/tau-secrets]
  dns -. cdn.* zone records .-> r2
  dns -. apex/www A records .-> netlify
  dns -. api.* CNAME → Fly app .-> sec
  r2 -. cdn URL .-> netlify
  sb -. db url for Fly secret check .-> sec
  stripe -. webhook URL host .-> sec
  netlify -. presence list .-> sec
```

Per-component state files (Stacks default) keep blast radius tight — touching the Stripe catalog never plans an R2 change.

## Recommendations

| #   | Action                                                                                                                                                                                                                          | Priority | Effort | Impact |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | **Adopt Terraform 1.14+ on HCP Terraform Free tier**; pin via `.terraform-version`                                                                                                                                              | P0       | S      | High   |
| R2  | **Stacks from day one** — single `stacks/cloud/` with three deployments (`staging`, `prod-us`, `prod-eu`), each in its own deployment group                                                                                     | P0       | M      | High   |
| R3  | **HCP-managed state** — no R2 state bucket; one workspace per `(stack, deployment, component)` auto-created by Stacks                                                                                                           | P0       | S      | High   |
| R4  | **Variable Set `tau-cloud-providers`** holds all provider auth tokens; assigned to the cloud stack by tag; no `TF_VAR_*` plumbing in GitHub Actions                                                                             | P0       | S      | High   |
| R5  | **Rich environment descriptor inputs** per deployment — never `is_prod`; `enabled` flag toggles "declared but not deployed" regions                                                                                             | P0       | S      | High   |
| R6  | **Cloudflare R2 module** — buckets, custom domain CNAME (against the Cloudflare-authoritative zone), Cache Rules, scoped API tokens; covers M1/M2/M5 of the runbook                                                             | P0       | M      | High   |
| R7  | **Skip Fly Terraform provider**; keep `fly.{staging,prod}.toml` + `flyctl deploy` + `flyctl secrets set`; document Fly app/cert state in `docs/runbook.md`                                                                      | P0       | S      | Med    |
| R8  | **Cloudflare DNS authoritative** for `tau.new` and `taucad.dev`; Namecheap is the registrar only; migration runbook lives at `docs/dns-migration-plan.md` and runs as a coordinated V1 prerequisite                             | P0       | M      | High   |
| R9  | **Netlify provider for env vars only** (`netlify_environment_variable` with `secret_values`); leave `netlify.toml`/`netlify.prod.toml` authoritative for build+headers                                                          | P1       | S      | Med    |
| R10 | **Supabase provider for projects + branch DBs**; one project per region; import existing staging/prod projects on first apply                                                                                                   | P1       | M      | High   |
| R11 | **Grafana provider** — import the 10 dashboards in `infra/grafana/dashboards/` as `grafana_dashboard` resources; declare alert rules + contact points; one folder per env                                                       | P1       | M      | Med    |
| R12 | **Stripe provider for catalog + webhooks**; mode-aware via deployment input `stripe_mode` (`test`/`live`); checkout flows stay in app code                                                                                      | P1       | M      | High   |
| R13 | **`tau-secrets` presence-only module** asserts `flyctl secrets list -a <app>` covers expected names; values still set manually per runbook M3                                                                                   | P1       | S      | Med    |
| R14 | **Deployment groups: staging auto-applies on no-destroys; production requires manual approval** (`auto_approve_checks` returns false for production)                                                                            | P0       | S      | High   |
| R15 | **Stripe restricted keys per mode**, never unrestricted; `stripe_api_key_test` and `stripe_api_key_live` in the variable set; staging+prod-us+prod-eu select via `stripe_mode`                                                  | P0       | S      | High   |
| R16 | **Phase 2 stack `stacks/preview/`** — `for_each` over open PRs to spin up ephemeral preview deployments (Supabase branch DB + R2 prefix + Netlify deploy preview); ≤20 active                                                   | P2       | L      | High   |
| R17 | **OPA/Conftest policy guard** in `.github/workflows/policy-check.yml` — runs against `terraform show -json plan` to enforce "no public bucket ACLs", "no destroys in prod without approval", etc.                               | P1       | M      | Med    |
| R18 | **`cloudflare-dns` module** — declare every `api.*`, `cdn.*`, apex, `www`, MX, TXT, CAA record as `cloudflare_dns_record`; closes the [Finding 11](staging-cors-coep-safari-rendering-audit.md) cert↔app pairing defense in IaC | P0       | M      | High   |
| R19 | **`docs/policy/iac-policy.md`** to extract stable rules from this research once V1 ships (deployment-input shape, secret-handling contract, deployment-group convention)                                                        | P2       | S      | Med    |

## Placeholder Resource Inventory

The following inventory enumerates every cloud resource per module. Variables prefixed with `__PLACEHOLDER__` are filled at first apply (mostly account/org IDs read once and committed to the deployment input block); secrets live in the `tau-cloud-providers` variable set and are never in the repo.

### `modules/cloudflare-dns/`

| Resource                                                          | Variable / value                                                                                                                                                                                                                                    | Notes                                                                                                                                                                                          |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cloudflare_dns_record.apex_a`                                    | `name = var.apex_hostname`, `type = "A"`, `content = var.netlify_load_balancer_ip` (`__PLACEHOLDER__`)                                                                                                                                              | Apex points at Netlify; one record per zone                                                                                                                                                    |
| `cloudflare_dns_record.www_cname`                                 | `name = "www"`, `type = "CNAME"`, `content = var.apex_hostname`, `proxied = true`                                                                                                                                                                   | Or whatever the Netlify-recommended `www` CNAME target is                                                                                                                                      |
| `cloudflare_dns_record.api`                                       | `name = var.api_hostname`, `type = "CNAME"`, `content = "${var.fly_app_name}.fly.dev"`, `proxied = false`                                                                                                                                           | **The Finding 11 defense:** this resource declaratively pairs `api.<env>` to the correct Fly app per environment; `terraform plan` surfaces drift if the cert is ever issued for the wrong app |
| `cloudflare_dns_record.cdn`                                       | `name = var.cdn_hostname`, `type = "CNAME"`, `content = "<r2-account>.r2.dev"` (managed indirectly by `cloudflare_r2_custom_domain.cdn`)                                                                                                            | Some R2 custom-domain provisioning auto-creates this record; reconcile via `import` after first apply                                                                                          |
| `cloudflare_dns_record.mx_*` (`for_each` over `var.mx_records`)   | `type = "MX"`, `priority`, `content` from email provider                                                                                                                                                                                            | Migrated from Namecheap zone export                                                                                                                                                            |
| `cloudflare_dns_record.txt_spf`                                   | `type = "TXT"`, `content = "v=spf1 ..."`                                                                                                                                                                                                            | Migrated from Namecheap zone export                                                                                                                                                            |
| `cloudflare_dns_record.txt_dkim`                                  | `type = "TXT"`, per-selector                                                                                                                                                                                                                        | Migrated from Namecheap zone export                                                                                                                                                            |
| `cloudflare_dns_record.txt_dmarc`                                 | `type = "TXT"`, `name = "_dmarc"`                                                                                                                                                                                                                   | Migrated from Namecheap zone export                                                                                                                                                            |
| `cloudflare_dns_record.caa_*` (`for_each` over `var.caa_records`) | `type = "CAA"`, restricting issuance to Let's Encrypt + Fly + Netlify CAs                                                                                                                                                                           | Defense-in-depth against rogue certificate issuance                                                                                                                                            |
| `cloudflare_zone_setting.dnssec`                                  | `enabled = true`                                                                                                                                                                                                                                    | Cloudflare-managed DNSSEC; coordinated with the Namecheap registrar `DS` records as part of the migration runbook                                                                              |
| **Inputs:**                                                       | `var.environment_id`, `var.enabled`, `var.apex_hostname`, `var.api_hostname`, `var.cdn_hostname`, `var.fly_app_name`, `var.cf_zone_id` (`__PLACEHOLDER__`), `var.mx_records`, `var.caa_records`, `var.netlify_load_balancer_ip` (`__PLACEHOLDER__`) |

The same module is instantiated three times (once per deployment) — staging deploys against the `taucad.dev` zone, prod-us and prod-eu both deploy against the `tau.new` zone but write distinct subdomains (`api.tau.new` vs `eu.api.tau.new`, `cdn.tau.new` vs `eu.cdn.tau.new`). The "no two deployments may write the same record" invariant is enforced at the deployment-input level via `var.api_hostname`/`var.cdn_hostname` being unique per deployment. First apply requires `terraform import` on every record — see Appendix C for the bootstrap sequence.

### `modules/cloudflare-r2/`

| Resource                                                         | Variable / value                                                                                                                                                                                                                                                | Notes                                                                                                                                        |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `cloudflare_r2_bucket.blobs`                                     | `name = "${var.bucket_prefix}-blobs"`, `location = var.r2_location_hint`                                                                                                                                                                                        | Anonymous-download via custom domain (per Phase G1 of Sharing MVP)                                                                           |
| `cloudflare_r2_bucket.derivatives`                               | `name = "${var.bucket_prefix}-derivatives"`                                                                                                                                                                                                                     | Public-read derivatives (manifests, GLB, OG)                                                                                                 |
| `cloudflare_r2_bucket.og_images`                                 | `name = "${var.bucket_prefix}-og-images"`                                                                                                                                                                                                                       | Same as derivatives, separated for Cache Rule scoping                                                                                        |
| `cloudflare_r2_custom_domain.cdn`                                | `domain = var.cdn_hostname`, `zone_id = var.cf_zone_id`                                                                                                                                                                                                         | `cdn.taucad.dev` / `cdn.tau.new` / `eu.cdn.tau.new` — written into the same Cloudflare-authoritative zone owned by `modules/cloudflare-dns/` |
| `cloudflare_ruleset.cache_rules`                                 | Phase = `http_request_cache_settings`, rules per M5                                                                                                                                                                                                             | `/blobs/*` 1mo, `/publications/*/static.glb` 1mo, `/publications/*/manifest.json` 1h                                                         |
| `cloudflare_ruleset.cache_response`                              | `set_cache_control` action with Cache-Control directives                                                                                                                                                                                                        | Cloudflare provider v5.18.0+                                                                                                                 |
| `cloudflare_api_token.r2_object_rw`                              | Scoped to the three buckets; `Object Read` + `Object Write`                                                                                                                                                                                                     | Output value → set as Fly secret manually per runbook M3                                                                                     |
| `aws_s3_bucket_cors_configuration.{blobs,derivatives,og_images}` | Origins from `var.allowed_origins`                                                                                                                                                                                                                              | Routed at the R2 S3 endpoint (Cloudflare provider doesn't cover CORS yet)                                                                    |
| `aws_s3_bucket_lifecycle_configuration.{blobs,derivatives}`      | `abort_incomplete_multipart_upload_days = 7`, `unpublished/` expiration `30d`                                                                                                                                                                                   | AWS provider against R2                                                                                                                      |
| `cloudflare_zone_setting.smart_tiered_cache`                     | `enabled = true`                                                                                                                                                                                                                                                | Per M5                                                                                                                                       |
| **Inputs:**                                                      | `var.environment_id`, `var.enabled`, `var.bucket_prefix`, `var.cdn_hostname`, `var.r2_location_hint`, `var.allowed_origins`, `var.cf_account_id` (`__PLACEHOLDER__`), `var.cf_zone_id` (`__PLACEHOLDER__`, the same zone consumed by `modules/cloudflare-dns/`) |

All resources wrap with `count = var.enabled ? 1 : 0` so the prod-eu deployment is plan-visible even before launch.

### `modules/netlify-site/`

| Resource                                         | Notes                                                                                                                                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `netlify_environment_variable.tau_api_url`       | Per-context: `production`, `deploy-preview`, `branch-deploy`                                                                                                                                  |
| `netlify_environment_variable.tau_websocket_url` | Same context-scoping                                                                                                                                                                          |
| `netlify_environment_variable.tau_frontend_url`  | Same context-scoping                                                                                                                                                                          |
| `netlify_environment_variable.posthog_api_key`   | `secret_values` (writes to `secret_values` not `values`)                                                                                                                                      |
| `netlify_environment_variable.sentry_auth_token` | `secret_values`                                                                                                                                                                               |
| `netlify_environment_variable.node_env`          | Scope `functions,runtime` ONLY — NEVER `builds` (per [`netlify.toml`](../../apps/ui/netlify.toml) comment block; setting `NODE_ENV=production` at build time makes pnpm skip devDependencies) |
| **Inputs:**                                      | `var.environment_id`, `var.enabled`, `var.netlify_team_id` (`__PLACEHOLDER__`), `var.netlify_site_slug`, `var.api_hostname`, `var.apex_hostname`                                              |

`netlify.toml` and `netlify.prod.toml` stay authoritative for `[build]`, `[[headers]]` (security headers, COEP/COOP), and `[[redirects]]`. The provider does not yet manage these and the TOML pattern is well-established. Document the contract in `docs/policy/iac-policy.md` once it lands (R19).

### `modules/supabase-project/`

| Resource                                                           | Notes                                                                                                                               |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `supabase_project.main`                                            | `name = "tau-${var.environment_id}"`, `region = var.supabase_region`, `instance_size = var.supabase_instance_size`                  |
| `supabase_branch.preview` (`for_each` over `var.preview_branches`) | Per-PR preview DBs (V3)                                                                                                             |
| `supabase_settings.api`                                            | Schema search path, JWT secret config                                                                                               |
| **Inputs:**                                                        | `var.environment_id`, `var.enabled`, `var.supabase_org_id` (`__PLACEHOLDER__`), `var.supabase_region`, `var.supabase_instance_size` |

Database password and JWT secret read from outputs into the `tau-secrets` module's expected list, then runbook M3 step copies them into Fly secrets.

### `modules/stripe-catalog/`

| Resource                                | Notes                                                                                                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stripe_product.subscription_base`      | `name = "Tau Pro"` (TBD)                                                                                                                                                         |
| `stripe_price.pro_monthly`              | `currency = "usd"`, `unit_amount = __PLACEHOLDER__`, `recurring = { interval = "month" }`                                                                                        |
| `stripe_price.pro_annual`               | Same with `interval = "year"`                                                                                                                                                    |
| `stripe_webhook_endpoint.api`           | `url = "https://${var.api_hostname}/v1/billing/webhook"`, events: `customer.subscription.{created,updated,deleted}`, `invoice.{paid,payment_failed}`, `payment_intent.succeeded` |
| `stripe_billing_meter.cad_renders` (P2) | Usage-based metering for AI render budget if the pricing model adopts it                                                                                                         |
| **Inputs:**                             | `var.environment_id`, `var.enabled`, `var.stripe_mode` (`test`/`live`), `var.api_hostname`                                                                                       |

Mode selection inside the module:

```hcl
provider "stripe" {
  api_key = var.stripe_mode == "live" ? var.stripe_api_key_live : var.stripe_api_key_test
}
```

The webhook signing secret output is consumed by `flyctl secrets set TAU_STRIPE_WEBHOOK_SECRET=<value> -a <app>` via runbook M3. Both prod-us and prod-eu point at the same Stripe live account but each owns its own webhook endpoint URL — Stripe doesn't have geo-regional accounts.

### `modules/grafana-stack/`

| Resource                                                                            | Source                                                                                                                                                                             |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `grafana_folder.tau`                                                                | `title = var.grafana_folder` (e.g. `Tau / production / US`)                                                                                                                        |
| `grafana_dashboard.<n>` (`for_each` over JSON files in `infra/grafana/dashboards/`) | Existing 10 dashboards-as-code; copied into the tau-cloud repo at `modules/grafana-stack/dashboards/*.json` (or pulled from the tau monorepo at apply time via a small build step) |
| `grafana_rule_group.api_health`                                                     | Alert rules: error rate, p95 latency, redis down, db down (per region label)                                                                                                       |
| `grafana_contact_point.email`                                                       | Owner email                                                                                                                                                                        |
| `grafana_contact_point.slack` (optional)                                            | Slack webhook                                                                                                                                                                      |
| `grafana_notification_policy.default`                                               | Routes by severity + region label to contact points                                                                                                                                |
| **Inputs:**                                                                         | `var.environment_id`, `var.enabled`, `var.grafana_url` (`__PLACEHOLDER__`, single Grafana Cloud stack), `var.grafana_folder`, `var.region_code`                                    |

`disable_provenance = false` (default) so dashboards stay locked from UI edits — drift detection is the whole point. One Grafana Cloud stack hosts all environments; folders + region labels separate them.

### `modules/tau-secrets/` (presence-only)

| Resource                                          | Mechanism                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `data.external.fly_secrets_${var.environment_id}` | Runs `flyctl secrets list -a ${var.fly_app_name} --json` using `fly_secrets_audit_token`; output parsed as map of name → digest      |
| `null_resource.assert_fly_secrets`                | `lifecycle.precondition` asserts every name in `var.expected_fly_secrets` is present in the data output                              |
| `data.external.netlify_env_audit` (V2)            | Same for Netlify env vars                                                                                                            |
| **Inputs:**                                       | `var.environment_id`, `var.enabled`, `var.fly_app_name`, `var.expected_fly_secrets` (list, derived from a shared local in the stack) |

The shared expected-secret list (declared once in `_variables.tfcomponent.hcl`):

```hcl
variable "expected_fly_secrets" {
  type    = list(string)
  default = [
    "AUTH_SECRET",
    "DATABASE_URL",
    "REDIS_URL",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GOOGLE_VERTEX_AI_CREDENTIALS",
    "CEREBRAS_API_KEY",
    "MORPH_API_KEY",
    "TAVILY_API_KEY",
    "LANGSMITH_API_KEY",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "TAU_S3_ACCESS_KEY_ID",
    "TAU_S3_SECRET_ACCESS_KEY",
    "TAU_STRIPE_API_KEY",
    "TAU_STRIPE_WEBHOOK_SECRET",
    "ZOO_API_KEY",
  ]
}
```

Plan output surfaces a clear "missing secret" diff when a new variable is added to [`apps/api/.env.example`](../../apps/api/.env.example) without a matching Fly secret — closing the loop on the runbook drift problem across staging, prod-us, and prod-eu in one shot.

### `stacks/cloud/_orchestrate.tfdeploy.hcl`

```hcl
deployment_auto_approve "non_production_no_destroys" {
  check {
    condition = context.plan.changes.remove == 0
    reason    = "Non-production plans containing destroys require manual review."
  }
}

deployment_auto_approve "production_manual_only" {
  check {
    condition = false
    reason    = "Production deployments require manual approval."
  }
}

deployment_group "staging" {
  auto_approve_checks = [deployment_auto_approve.non_production_no_destroys]
}

deployment_group "prod_us" {
  auto_approve_checks = [deployment_auto_approve.production_manual_only]
}

deployment_group "prod_eu" {
  auto_approve_checks = [deployment_auto_approve.production_manual_only]
}
```

Stacks GA constraint: deployment groups currently support only one deployment per group, so prod-us and prod-eu each get their own group even though they share the same auto-approve policy. The duplication is mechanical and revisited if HCP relaxes the constraint.

## Roadmap

| Phase                                               | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Exit criteria                                                                                                                                                                                                                                                 |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **V1 (in flight — narrower slice landed May 2026)** | `repos/tau-cloud` ships runnable Terraform roots **`stacks/cloud/staging`** + **`stacks/cloud/prod-us`** declaring **`cloudflare-dns`** + **`netlify-site`** modules; canonical operator sequencing + verification lives in **`repos/tau-cloud/docs/dns-migration-plan.md`**; `cloudflare-r2`, `tau-secrets`, auxiliary `grafana-stack` skeleton, additional regional **`prod-eu`/`prod-ap`** stacks, OPA gates — **explicitly deferred to V1.5/V2** per Cloud Infra V1 plan scope. The `prod-us` suffix is intentional from V1 so multi-region prod adds sibling stacks without renaming | Registrar NS cut executes per runbook; `terraform plan` becomes the structural guard for **`api.<env>`** A/AAAA + `_acme-challenge.api` correctness; **`NETLIFY_PROD_SITE_ID`** continues to originate from Terraform output feeding **`prod-deploy-ui.yml`** |
| **V2** (R9, R10, R11, R12, R15, R17)                | Netlify env-vars module; Supabase project module (one per region); Stripe catalog + webhook module; Grafana dashboards imported; OPA/Conftest policy gate in CI                                                                                                                                                                                                                                                                                                                                                                                                                           | Stripe products + prices + webhook endpoints reviewable in PR; Grafana dashboard drift caught at plan time; Netlify env vars reviewable in PR; OPA blocks public-bucket-ACL changes                                                                           |
| **V3** (R16)                                        | `stacks/preview/` — `for_each` over open PRs from `open-prs.json` (regenerated by GH webhook); spins up Supabase branch DB + R2 bucket prefix + Netlify deploy preview; ≤20 active                                                                                                                                                                                                                                                                                                                                                                                                        | PR opens → bot comment with preview URL hitting a real DB and a real (sandboxed) R2 prefix; PR closes → all preview resources destroyed automatically                                                                                                         |
| **V4** (`prod-eu` enable)                           | Flip `prod-eu` deployment input `enabled = true`; first prod-eu apply; declare `eu.api.tau.new` and `eu.cdn.tau.new` records via the existing `cloudflare-dns` module; revisit Fly community fork iff cert/IP automation becomes load-bearing                                                                                                                                                                                                                                                                                                                                             | EU-resident publication URLs (`eu.cdn.tau.new`) serve from the EU R2 bucket with EU-region Supabase backing; no infra change touches staging/prod-us during the rollout                                                                                       |

V1 is realistically a 2-3 day focused sprint; V2 is ~3-5 days; V3 is ~1 week (preview lifecycle + GH webhook); V4 is ~3 days once V1's plumbing exists.

## Trade-offs

| Decision              | We picked                                                         | We could have picked                                                                                          | Trade-off                                                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool                  | Terraform 1.14+                                                   | OpenTofu 1.11+                                                                                                | Accept BSL 1.1 license; gain Stacks + Variable Sets + HCP-managed state + Run UI on PR; tau-cloud repo is private so license has no external impact                                             |
| Layout                | Stacks from day one                                               | Native rootmodule per env                                                                                     | Stacks gives coordinated multi-component apply, deployment-group auto-approve policies, and a clean V3 PR-preview path; pay a small learning-curve cost                                         |
| Stacks file extension | `.tfcomponent.hcl` + `.tfdeploy.hcl`                              | (legacy `.tfstack.hcl`)                                                                                       | Use GA syntax from the start; no deprecated file extensions to migrate later                                                                                                                    |
| State backend         | HCP-managed                                                       | Self-hosted R2 + `use_lockfile = true`                                                                        | Eliminates state bootstrap; HashiCorp holds keys vs Tau holds keys (acceptable threat model); avoid R2 chicken-and-egg                                                                          |
| Provider auth         | Variable Sets in HCP                                              | GH Actions repo secrets + `TF_VAR_*`                                                                          | First-class secret store with audit log + rotation propagation; one-time setup vs ongoing CI plumbing                                                                                           |
| Stripe API keys       | Restricted keys per mode (test/live), separate variables          | Single unrestricted key                                                                                       | Smaller blast radius if a key leaks; staging cannot accidentally hit live mode                                                                                                                  |
| Multi-env shape       | Rich deployment-input descriptors, no `is_prod` boolean           | `is_prod` ternary                                                                                             | Geo-regional production rollout is a 25-line `deployment` block, not a refactor; `enabled` flag declares pre-launch regions in IaC                                                              |
| DNS                   | Cloudflare authoritative for both zones; Namecheap registrar-only | Subdomain NS delegation (`cdn.*` only) on Cloudflare Free **OR** Cloudflare Business+ partial zone (~$200/mo) | Pay a one-time migration cost (one runbook, ~24-48h propagation per zone); gain every record in IaC including `api.*` (closes Finding 11), avoid Business+ price tag, eliminate split-brain DNS |
| Fly                   | Skip Terraform provider; runbook + presence-only secrets module   | Community fork `andrewbaxter/fly`                                                                             | Avoid single-maintainer dependency on Fly resources; `fly.{staging,prod}.toml` + `flyctl deploy` already declarative                                                                            |
| Netlify               | Provider for env vars; TOML for build/headers                     | Provider end-to-end (when supported)                                                                          | Two surfaces to maintain; provider coverage gap forces this until v1.0+                                                                                                                         |
| Stripe                | Provider for catalog + webhooks; app code for checkout            | Manual via Stripe dashboard                                                                                   | Pre-1.0 provider risk; gain reviewability of price changes                                                                                                                                      |
| Drift detection       | GH Actions cron `plan -refresh-only` (free)                       | HCP Standard tier (~$20/seat/mo)                                                                              | Free; ~80% of TFC's drift-detection value; revisit if cost is justified                                                                                                                         |
| Lock-in               | Moderate, reversible                                              | True OSS independence                                                                                         | TFC → OpenTofu+R2 migration is `state pull` + backend swap; HCL/state bit-compatible                                                                                                            |

## References

- [HCP Terraform — Pricing definitions and RUM](https://developer.hashicorp.com/hcp/docs/hcp/admin/billing/pricing-definitions)
- [HCP Terraform updates plans with an enhanced Free tier (2026)](https://www.hashicorp.com/en/blog/terraform-cloud-updates-plans-with-an-enhanced-free-tier-and-more-flexibility)
- [Terraform Stacks — overview](https://developer.hashicorp.com/terraform/language/stacks)
- [Terraform Stacks — beta to GA migration notes](https://developer.hashicorp.com/terraform/language/stacks/update-GA)
- [`deployment_group` reference (`auto_approve_checks`)](https://developer.hashicorp.com/terraform/language/block/stack/tfdeploy/deployment_group)
- [`deployment_auto_approve` reference](https://developer.hashicorp.com/terraform/language/block/stack/tfdeploy/deployment_auto_approve)
- [HCP Terraform Variable Sets](https://developer.hashicorp.com/terraform/cloud-docs/variables)
- [Cloudflare Terraform provider — R2 + Cache Rules](https://developers.cloudflare.com/r2/examples/terraform)
- [Migrating to Cloudflare provider v5](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/guides/version-5-migration)
- [Cloudflare R2 — public buckets and custom domain DNS requirements](https://developers.cloudflare.com/r2/buckets/public-buckets)
- [Cloudflare DNS — full zone setup (free, recommended)](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)
- [Cloudflare Terraform provider — `cloudflare_dns_record`](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/dns_record)
- [Importing existing DNS records into Terraform](https://developer.hashicorp.com/terraform/cli/import)
- [Supabase Terraform provider — projects + branches](https://supabase.com/docs/guides/deployment/terraform/tutorial)
- [Netlify Terraform provider — environment variables](https://registry.terraform.io/providers/netlify/netlify/latest/docs/resources/environment_variable)
- [Stripe Terraform provider — supported resources](https://docs.stripe.com/terraform/resources)
- [Grafana Terraform provider — dashboards + alerts](https://grafana.com/docs/grafana-cloud/developer-resources/infrastructure-as-code/terraform/)
- [`fly-apps/terraform-provider-fly` (archived)](https://github.com/fly-apps/terraform-provider-fly)
- [`andrewbaxter/terraform-provider-fly` (community fork, V4 fallback)](https://github.com/andrewbaxter/terraform-provider-fly)
- [OpenTofu vs Terraform 2026 — fallback path reference](https://www.terraformpilot.com/articles/terraform-vs-opentofu-2026/)
- Related: [`docs/research/sharing-architecture.md`](sharing-architecture.md)
- Related: [`docs/research/sharing-mvp-manual-runbook.md`](sharing-mvp-manual-runbook.md)
- Related: [`docs/policy/vision-policy.md`](../policy/vision-policy.md)
- Related (when shipped): `docs/policy/iac-policy.md` (R19)

## Appendix

### A. Naming convention

All names derive from the `environment_id` deployment input — never from a boolean. The `region_code` follows IATA-style airport codes for clarity:

| Role                    | staging           | prod-us                 | prod-eu                                          |
| ----------------------- | ----------------- | ----------------------- | ------------------------------------------------ |
| `environment_id`        | `staging`         | `prod-us`               | `prod-eu`                                        |
| `region_code`           | `ap-syd`          | `us-iad`                | `eu-fra`                                         |
| Fly app                 | `tau-api-staging` | `tau-api`               | `tau-api-eu`                                     |
| Netlify site slug       | `taucad`          | `taucad-prod`           | `taucad-prod` (shared, fans out via Netlify CDN) |
| R2 bucket prefix        | `tau-staging`     | `tau-prod-us`           | `tau-prod-eu`                                    |
| Supabase project        | `tau-staging`     | `tau-prod-us`           | `tau-prod-eu`                                    |
| Stripe webhook endpoint | (test mode)       | (live mode, US webhook) | (live mode, EU webhook)                          |
| Grafana folder          | `Tau / staging`   | `Tau / production / US` | `Tau / production / EU`                          |
| API hostname            | `api.taucad.dev`  | `api.tau.new`           | `eu.api.tau.new`                                 |
| CDN hostname            | `cdn.taucad.dev`  | `cdn.tau.new`           | `eu.cdn.tau.new`                                 |

### B. CI workflow shape

TFC drives plan/apply via VCS integration — GitHub Actions plays a supporting role only:

```yaml
# .github/workflows/lint.yml — runs on PR
on: pull_request
jobs:
  lint:
    steps:
      - uses: actions/checkout@v5
      - uses: hashicorp/setup-terraform@v3
      - run: terraform fmt -check -recursive
      - uses: terraform-linters/tflint-action@v1
      - run: tflint --recursive --format compact
```

```yaml
# .github/workflows/policy-check.yml — runs on PR after TFC speculative plan completes
on:
  pull_request:
    types: [opened, synchronize]
jobs:
  policy:
    steps:
      - uses: actions/checkout@v5
      - run: |
          # Pull the speculative plan JSON from TFC API for each deployment
          for dep in staging prod_us prod_eu; do
            curl -sH "Authorization: Bearer $TFC_TOKEN" \
              "https://app.terraform.io/api/v2/runs/$(...)/plan/json-output" > plan-$dep.json
          done
      - uses: open-policy-agent/conftest-action@v1
        with:
          policy-path: policies/
          files: plan-*.json
```

The TFC native VCS workflow handles speculative plans on PR open/sync, the rich plan UI in the TFC web app, and "Apply" gating per deployment group. There is no markdown-comment plan-output hack.

### C. HCP Terraform organization bootstrap (one-time)

1. **Execute the DNS migration runbook** (`repos/tau-cloud/docs/dns-migration-plan.md`) for both zones — start with `taucad.dev` (lower stakes), then `tau.new`. After migration, every existing record is served by Cloudflare and the Namecheap-side NS records point at Cloudflare's nameservers. This is a prerequisite for V1 because `cloudflare-dns`, `cloudflare-r2`, and `cloudflare_zone_setting` resources all assume Cloudflare-authoritative zones.
2. **Create HCP Terraform organization** `tau-cloud` (Free tier).
3. **Link GitHub VCS** — install the HashiCorp app on `taucad/tau-cloud`.
4. **Create Project** `cloud` under the organization.
5. **Create Variable Set** `tau-cloud-providers` — apply by tag `stack:cloud`, mark all as Sensitive, scope as listed in [Finding 6](#finding-6-variable-sets-centralise-provider-auth-as-managed-secrets). Includes a Cloudflare API token scoped to Zone DNS Read+Edit on both zones, R2 Admin, and Cache Rules.
6. **Configure stack** — add the tau-cloud repo as the source for a stack named `cloud`, root path `stacks/cloud/`. TFC parses `_components.tfcomponent.hcl` + `_deployments.tfdeploy.hcl` and creates one workspace per `(deployment, component)` automatically.
7. **First plan against `cloudflare-dns`** — every existing zone record is reported as "to be created" because Terraform has no state for them yet. **Run `terraform import`** in the TFC workspace UI for each `cloudflare_dns_record.*` resource against its existing record ID (Cloudflare provider supports `terraform import cloudflare_dns_record.<name> <zone_id>/<record_id>`). After import, the next plan is a clean no-op for the DNS module.
8. **First plan for the rest of the stack** — opens a speculative plan per deployment; review in the TFC UI; merge the PR to apply staging; manually click apply for prod-us; prod-eu is `enabled = false` so applies as a no-op.

The bootstrap is reversible — deleting the HCP organization detaches state from infrastructure but does not destroy real resources (the providers don't see the disconnect; resources keep running until next manual delete). DNS records remain authoritative on Cloudflare regardless of HCP state.

### D. OpenTofu fallback path

Reversal is documented for completeness. If TFC ever becomes a problem (cost, governance, outage):

1. **Pull all state files** out of HCP via `terraform state pull > <component>.tfstate` per workspace (one per component per deployment).
2. **Create R2 state bucket** `tau-tfstate`; mint a scoped Cloudflare API token; store as `TF_STATE_R2_*` GH Actions secrets.
3. **Add a self-hosted backend block** to each component pointing at R2:
   ```hcl
   terraform {
     backend "s3" {
       bucket                      = "tau-tfstate"
       key                         = "stacks/cloud/${ENV}/${COMPONENT}.tfstate"
       region                      = "auto"
       endpoints                   = { s3 = "https://<account>.r2.cloudflarestorage.com" }
       skip_credentials_validation = true
       skip_region_validation      = true
       use_lockfile                = true
       encrypt                     = true
     }
   }
   ```
4. **Re-init each component** with `tofu init -migrate-state` (using OpenTofu's `tofu` CLI).
5. **Replace Stacks orchestration** with native rootmodules per env (this doc's V1 layout) — pay the duplication cost; lose deployment-group auto-approve.
6. **Replace Variable Sets** with GH Actions repo secrets + `TF_VAR_*` env vars in CI.
7. **Replace Run UI** with `tofu plan` markdown-comment posting via `actions/github-script`.

Estimated reversal cost: 2-3 days of focused work. HCL configurations port unmodified between Terraform 1.14 and OpenTofu 1.11; only the orchestration layer (`.tfdeploy.hcl`) is Terraform-specific and would be replaced by GH Actions matrix builds.

### E. Adding a new region (e.g. `prod-au`)

1. Add a `deployment "prod_au"` block to `stacks/cloud/_deployments.tfdeploy.hcl` with full inputs (per [Finding 7](#finding-7-multi-environment-shape-avoids-is_prod-and-supports-geo-regional-rollout) shape) and `enabled = false`. Set `api_hostname = "au.api.tau.new"`, `cdn_hostname = "au.cdn.tau.new"`.
2. Add a `deployment_group "prod_au"` block with `auto_approve_checks = [deployment_auto_approve.production_manual_only]`.
3. Open PR; TFC plans a no-op (because `enabled = false`); merge.
4. When ready to launch the region: open a second PR flipping `enabled = true`; review the speculative plan (which now includes new `cloudflare_dns_record.api`/`cdn`/region-specific records, R2 buckets, Supabase project, etc.); manually approve the prod_au deployment group apply.
5. Update `docs/runbook.md` with the new app/cert pairings; update the `tau-secrets` expected list if region-specific secret names emerge.

The whole sequence is a couple of HCL blocks — no DNS housekeeping at the registrar, no per-region module fork, no env-conditional code anywhere. New zone records are created by the same `cloudflare-dns` module instance that already serves the parent zone.
