# UI Deployment Topology

How `apps/ui` reaches staging and production, and the cross-origin contract it shares with `apps/api`.

Both staging and production UIs deploy on Netlify against Fly.io staging and production APIs. **Production releases** are per application and need one approval: merging an application's release pull request makes [`release.yml`](../../.github/workflows/release.yml) create its `ui@` or `api@` tag and GitHub Release, and that release's [`release-build.yml`](../../.github/workflows/release-build.yml) run builds it and, once a release manager approves the `production` environment in the run, deploys it at the tag: [`deploy.yml`](../../.github/workflows/deploy.yml) for the Fly API, or [`deploy-ui.yml`](../../.github/workflows/deploy-ui.yml) (built in GitHub Actions, published to Netlify) and [`deploy-docs.yml`](../../.github/workflows/deploy-docs.yml) for the UI. The other application stays where it is. Rollbacks and redeploys dispatch [`deploy-production.yml`](../../.github/workflows/deploy-production.yml) with an earlier tag, which runs the same deploys behind the same approval. Netlify does not build from Git: the UI build needs GeoSpec engine products that only CI's macOS producer makes, so both sites publish only from Actions, and there are no PR deploy previews.

Site identity, the per-environment variable matrices, DNS authority, and the promote and rollback procedures are operational. They live in Tau's private operations handbook at `docs/handbooks/cloud/` (`system/environments.md`, `system/services/ui.md`, `operate/deploy-and-promote.md`, `operate/rollback-ui.md`, `operate/rollback-api.md`), maintained with the `create-handbook` skill; that path resolves only in a checkout that has the private handbook.

---

## Topology Diagram

```
                    ┌────────────────────────┐
                    │ Pull request vs main   │
                    └────────────┬───────────┘
                                 │
                                 ▼
                   ┌───────────────────────────┐
                   │ ci.yml (no UI preview)    │
                   └───────────────────────────┘


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
   │ release.yml → one release PR per app on `release/<app>`                  │
   │ merge one → tag `<app>@<version>` + GitHub Release                        │
   └────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌──────────────────────────────┐
                    │ release-build.yml at the tag │
                    │ verify, then wait for a      │
                    │ release manager on           │
                    │ `production` (one approval)  │
                    └────────────┬─────────────────┘
                                 │
                   ┌─────────────┴──────────────────────────┐
                   │ ui@x.y.z                               │ api@x.y.z
                   ▼                                        ▼
   ┌───────────────────────────┐              ┌──────────────────────────────┐
   │ deploy-ui.yml (Netlify)   │              │ deploy.yml (Fly API)         │
   │ + deploy-docs.yml, at tag │              │ at the tag                   │
   └───────────────────────────┘              └──────────────────────────────┘

   Rollback or redeploy: deploy-production.yml with an earlier tag dispatches
   the same deploys at that tag, behind the same approval.
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
- [`.github/workflows/deploy-ui.yml`](../../.github/workflows/deploy-ui.yml)
- [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)
- [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
- [`apps/ui/netlify.toml`](../../apps/ui/netlify.toml) — build commands and security headers
