---
title: 'Sharing MVP — manual provisioning runbook (Phase 0–1)'
description: 'Operational checklist for Cloudflare R2, Fly secrets, CDN cache rules, and default OG/thumbnail seeding referenced by Sharing MVP todos M1–M6.'
status: superseded
superseded_by: docs/research/tau-cloud-activation-status.md
created: '2026-05-04'
updated: '2026-05-14'
category: reference
---

> **Superseded by [`docs/research/tau-cloud-activation-status.md`](tau-cloud-activation-status.md)** — M1 (R2 bucket creation), M2 (CDN + DNS), M3 (R2 credential push to Fly), and M5 (cache rules) are now managed by `module.cloudflare_r2` + `module.fly_api_secrets` in IaC. See operator gates **F1–F7** in the activation status doc for the apply sequence.
>
> **Residual manual steps retained below:** M4 (seed default assets) and M6 (TLS/cert sanity check). These have corresponding IaC-coupled order requirements documented as **F5** and **F4** in the activation status doc.

This note captures **human-operated** steps referenced by todos **M1–M6** in the Sharing MVP plan when Cloudflare R2, Fly secrets, DNS, and cache rules are involved.

## Local parity — anonymous derivatives reads

The compose smoke script exercises MinIO the same way viewers hit Cloudflare R2: **`mc anonymous get`** against `local/tau-blobs` / derivatives layouts proves anonymous GET works before touching staging DNS.

## Content Security Policy (Netlify)

Public viewers fetch immutable blobs from the CDN hostname configured as `TAU_S3_PUBLIC_BASE_URL`. Staging and production `apps/ui/netlify*.toml` **`connect-src`** (and related directives where blob URLs appear) must include those CDN origins so `fetch()` from `/v/:id` succeeds after SSR.

## Drizzle migration filenames

Schema edits under `apps/api/app/database/` produce SQL via `pnpm db:generate`; the numeric prefix on generated files is tooling-assigned. CI should apply **`pnpm db:migrate`** against the committed journal — do not hand-rename migration files after generation without updating `meta/_journal.json`.

## Blob buckets vs authenticated API

- **`tau-*-blobs`** — content-addressed sources (potentially sensitive when URLs leak); gate access via visibility + signed/unlisted tokens at the API while allowing immutable CDN reads only for publication-linked keys when policy permits.
- **`tau-*-derivatives`** — manifests + default OG/thumbnail references; anonymous read via custom domain aligns with long TTL cache rules below.

## M1 — Staging R2 + `cdn.taucad.dev`

- Create private bucket `tau-staging-blobs`, public-read derivatives bucket `tau-staging-derivatives`, and `tau-staging-og-images` with anonymous read via custom domain.
- Attach **`cdn.taucad.dev`** to the public buckets per Cloudflare R2 custom-domain docs.
- Lifecycle: abort incomplete multipart uploads after **7d**; delete **`unpublished/`** after **30d** (when lifecycle automation ships server-side).
- CORS: allow `https://taucad.dev` and `https://*--taucad.netlify.app` for `GET, HEAD`.
- Disable `*.r2.dev` public URLs when using custom domains exclusively.
- Create a scoped **object read/write** token limited to the three staging buckets; record **account id**, **access key id**, and **secret** for Fly secrets.

## M2 — Production R2 + `cdn.tau.new`

- Mirror M1 with `tau-prod-*` buckets and **`cdn.tau.new`**, CORS for `https://tau.new` + `https://*--taucad-prod.netlify.app`.

## M3 — Fly secrets (staging + prod API apps)

On **`tau-api-staging`** and **`tau-api`**:

```bash
flyctl secrets set \
  TAU_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com \
  TAU_S3_REGION=auto \
  TAU_S3_ACCESS_KEY_ID=... \
  TAU_S3_SECRET_ACCESS_KEY=... \
  TAU_S3_FORCE_PATH_STYLE=false \
  -a <app>
```

Non-secret bucket names + `TAU_S3_PUBLIC_BASE_URL` stay in `fly.*.toml` `[env]` (already wired for staging/prod layouts).

## M4 — Seed default assets

From repo root (AWS CLI + credentials with write access to the **derivatives** bucket):

```bash
bash scripts/seed-r2-defaults.sh
```

Verify:

```bash
curl -I https://cdn.taucad.dev/defaults/og.png
curl -I https://cdn.tau.new/defaults/og.png
```

## M5 — Cloudflare cache rules

Per zone (`cdn.taucad.dev`, `cdn.tau.new`):

- **`/blobs/*`** — Cache Everything, Edge TTL ~1 month (immutable content-addressed blobs).
- **`/publications/*/manifest.json`** — Edge TTL ~1 hour.
- Enable **Smart Tiered Cache** on the hostname fronting R2.

## M6 — DNS + TLS + Fly cert sanity

- Confirm ACM/LetsEncrypt (or Cloudflare) certs issue cleanly for both CDN hostnames.
- Re-verify Fly API hostname ↔ app pairing (`api.taucad.dev` → **`tau-api-staging`**, `api.tau.new` → **`tau-api`**) before merging infra changes — mismatched certs silently route traffic across environments and surface as CORS failures in the browser.

## Public viewer (`/v/:id`) — parameter reset and export QA

After geometry finishes rendering:

- Per-parameter reset (circular arrow beside each label) restores that field to its published default; changing again then resetting still works.
- **Downloads** in the right-hand aside shows format pills once geometry is present; before render it shows “Render the geometry to enable export.”
- Choosing a format downloads using the publication title as the filename base (same pattern as project preview **Downloads**).
- **Fork** seeds the new project’s mechanical parameters from merged kernel defaults plus current slider overrides (fork should match what you see in the viewer).
