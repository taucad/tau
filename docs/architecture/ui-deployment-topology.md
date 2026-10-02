# UI Deployment Topology

How `apps/ui` reaches staging and production, and the cross-origin contract it shares with `apps/api`.

Both staging and production UIs deploy on Netlify against Fly.io staging and production APIs. **Production promotions** are explicit: a maintainer dispatches [`deploy-production.yml`](../../.github/workflows/deploy-production.yml) with a release tag created by [`release.yml`](../../.github/workflows/release.yml), and it moves `production` to that release's commit; the push runs [`prod-deploy-on-merge.yml`](../../.github/workflows/prod-deploy-on-merge.yml), which deploys the Fly API and builds the UI in GitHub Actions with [`deploy-ui.yml`](../../.github/workflows/deploy-ui.yml) before publishing it to Netlify. Netlify does not build from Git: the UI build needs GeoSpec engine products that only CI's macOS producer makes, so both sites publish only from Actions, and there are no PR deploy previews.

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
   │ ci.yml (no UI preview)    │    │ review.yml (Fly review app) │
   └───────────────────────────┘    └─────────────────────────────┘


                    ┌────────────────────────┐
                    │   push / merge main    │
                    └────────────┬───────────┘
                                 │
                   ┌─────────────┴──────────────────────────┐
                   │                                        │
                   ▼                                        ▼
   ┌───────────────────────────┐              ┌──────────────────────────────┐
   │ ci.yml → deploy-ui-staging│              │ ci.yml → deploy-api-staging  │
   └───────────────────────────┘              └──────────────────────────────┘

   ┌──────────────────────────────────────────────────────────────────────────┐
   │ release.yml → regenerate `release/next` → open/update the release PR      │
   │ merge it → tags `<app>@<version>` + GitHub Releases → release-build.yml   │
   └──────────────────────────────────────────────────────────────────────────┘


                    ┌──────────────────────────────┐
                    │ Maintainer dispatches         │
                    │ deploy-production.yml with a  │
                    │ release tag → `production`    │
                    └────────────┬─────────────────┘
                                 │
                   ┌─────────────┴──────────────────────────┐
                   │                                        │
                   ▼                                        ▼
   ┌───────────────────────────┐              ┌──────────────────────────────┐
   │ prod-deploy-on-merge.yml  │              │ prod-deploy-on-merge.yml     │
   │ → deploy-ui.yml (Netlify) │              │ → deploy.yml (Fly API)       │
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

- [`.github/workflows/release.yml`](../../.github/workflows/release.yml)
- [`.github/workflows/release-build.yml`](../../.github/workflows/release-build.yml)
- [`.github/workflows/deploy-production.yml`](../../.github/workflows/deploy-production.yml)
- [`.github/workflows/prod-deploy-on-merge.yml`](../../.github/workflows/prod-deploy-on-merge.yml)
- [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)
- [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
- [`apps/ui/netlify.toml`](../../apps/ui/netlify.toml) — build commands and security headers
