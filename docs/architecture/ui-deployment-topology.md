# UI Deployment Topology

How `apps/ui` reaches staging and production, and the cross-origin contract it shares with `apps/api`.

Both staging and production UIs deploy on Netlify against Fly.io staging and production APIs. **Production promotions** are GitOps-style: a bot-managed trail PR merges `release/main-to-production` into `production`; that merge triggers native Netlify Git builds and pushes the Fly API via [`prod-deploy-on-merge.yml`](../../.github/workflows/prod-deploy-on-merge.yml).

Site identity, the per-environment variable matrices, DNS authority, and the promote and rollback procedures are operational. They live in Tau's private operations handbook at `docs/handbooks/cloud/` (`system/environments.md`, `system/services/ui.md`, `operate/deploy-and-promote.md`, `operate/rollback-ui.md`, `operate/rollback-api.md`), maintained with the `create-handbook` skill; that path resolves only in a checkout that has the private handbook.

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
   │ the production UI site    │              │ → deploy.yml (Fly API)       │
   └───────────────────────────┘              └──────────────────────────────┘
```

---

## Cookie & Auth Strategy

Better Auth uses `sameSite: 'lax'`. Staging shares `taucad.dev` across the UI and API subdomains; production shares `tau.new`. Better Auth is mounted at `/v1/auth` on the **API** origin (`apps/api/app/config/auth.ts:62`), so OAuth callbacks target `https://api.{taucad.dev,tau.new}/v1/auth/callback/{github,google}` — not the UI origin.

---

## Cross-Origin Headers

Netlify sends `Cross-Origin-Embedder-Policy: require-corp` from [`apps/ui/netlify.toml`](../../apps/ui/netlify.toml). The Fly API sets `Cross-Origin-Resource-Policy: cross-origin` so API calls succeed under COEP. The API's CORS allow-list is per environment; do not broaden the deploy-preview glob, because a wider pattern admits unintended Netlify host classes.

---

## See Also

- [`.github/workflows/prepare-prod-release.yml`](../../.github/workflows/prepare-prod-release.yml)
- [`.github/workflows/prod-deploy-on-merge.yml`](../../.github/workflows/prod-deploy-on-merge.yml)
- [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)
- [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
- [`apps/ui/netlify.toml`](../../apps/ui/netlify.toml) — build commands and security headers
