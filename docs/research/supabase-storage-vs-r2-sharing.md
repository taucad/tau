---
title: 'Supabase Storage vs Cloudflare R2 for Sharing Pipeline'
description: 'Evaluation of Supabase Storage as a potential replacement for Cloudflare R2 in the sharing/publication pipeline, given Tau already runs on Supabase Postgres. Covers S3-protocol parity, egress economics, Better Auth integration, local-dev parity, and architectural trade-offs.'
status: draft
created: '2026-05-05'
updated: '2026-05-05'
category: comparison
related:
  - docs/research/sharing-architecture.md
  - docs/architecture/runtime-topology.md
  - docs/policy/storage-policy.md
---

# Supabase Storage vs Cloudflare R2 for Sharing Pipeline

Evaluation of whether Supabase Storage's S3-protocol endpoint should replace Cloudflare R2 in the [sharing-architecture](sharing-architecture.md) plan, given that Tau already runs on Supabase Postgres.

## Executive Summary

Supabase Storage is genuinely S3-protocol-compatible and would slot into the existing `ObjectStorageService` abstraction with a one-line endpoint change. However, it is **not the right primary store for Tau's sharing pipeline**: (1) `PutObject` does **not** support `If-None-Match: '*'` (atomic content-addressed dedup is the core primitive of [R26](sharing-architecture.md#recommendations-for-tau)), (2) Year-3 egress costs project ~24× higher than R2 because Tau's public-embed workload amplifies reads-per-write 100-10,000×, (3) bucket lifecycle rules are not supported (breaks [R27](sharing-architecture.md#recommendations-for-tau) soft-delete semantics), and (4) RLS-from-Better-Auth needs asymmetric-JWT plumbing we don't currently have. The "shared-vendor simplicity" argument doesn't materialize in code because we still need application-level Postgres tables (`publication`, `blob_ref`) regardless of whether the bytes live in Supabase Storage or R2 — the call-site code is identical either way.

**Recommendation: stay with R2 as the [sharing-architecture](sharing-architecture.md) plan specifies.** Document Supabase Storage as a one-env-flag escape hatch (the abstraction already supports it), and revisit only if R2's pricing/availability story degrades.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings](#findings)
- [Cost Projection](#cost-projection)
- [Recommendations](#recommendations)
- [Trade-offs](#trade-offs)
- [Migration Optionality](#migration-optionality)
- [References](#references)

## Problem Statement

Tau already runs on Supabase Postgres for all relational data (auth tables, LangGraph checkpoints, soon `publication` / `blob_ref`). The [sharing-architecture](sharing-architecture.md) plan introduces Cloudflare R2 as a second vendor for object storage. Two questions:

1. **Could Supabase Storage simplify the integration** — fewer vendor relationships, single dashboard, shared auth model, native Postgres triggers on `storage.objects`?
2. **Is Supabase Storage's S3 protocol endpoint a drop-in replacement for R2** — does the abstraction work the same, do all the content-addressed primitives (`If-None-Match: '*'`, lifecycle rules, immutable cache headers) carry over?

Long-term architectural correctness is the primary optimization target; speed-to-delivery is secondary.

## Methodology

- Read Supabase's official S3 compatibility matrix at [supabase.com/docs/guides/storage/s3/compatibility](https://supabase.com/docs/guides/storage/s3/compatibility), which explicitly lists which S3 endpoints + headers are implemented.
- Read the Supabase Storage architecture overview on [DeepWiki](https://deepwiki.com/supabase/storage/1.1-architecture-overview) to understand the protocol-vs-backend split.
- Read Supabase pricing pages including the [cached/uncached egress changelog](https://supabase.com/changelog/38119-3x-cheaper-egress-for-cache-hits) and [egress management guide](https://supabase.com/docs/guides/platform/manage-your-usage/egress).
- Cross-reference Better Auth's JWT plugin documentation against Supabase's [third-party auth requirements](https://supabase.com/docs/guides/auth/third-party/overview) (asymmetric JWTs only, OIDC discovery required).
- Cross-reference the [sharing-architecture.md § Recommendations](sharing-architecture.md#recommendations-for-tau) (R23–R28) and the [R2-Specific Configuration & Gotchas](sharing-architecture.md#r2-specific-configuration--gotchas) section to identify which primitives Supabase must match for parity.
- Project costs against the same Year-1/2/3 scenarios used in [sharing-architecture.md § Cost Projection](sharing-architecture.md#cost-projection-usdmonth) for apples-to-apples comparison.

## Findings

### Finding 1: Supabase Storage is a protocol-and-backend split, not a single product

Supabase Storage exposes two independent S3-shaped surfaces:

| Surface                                      | What it is                                                                 | Where the bytes actually go                                             |
| -------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **S3 protocol endpoint** at `/storage/v1/s3` | Supabase implements a subset of the S3 wire protocol (sigv4, common verbs) | Whatever the storage backend is configured to be                        |
| **Storage backend** (configurable)           | The pluggable layer where bytes are persisted                              | `file` (local filesystem, default), `s3` (real AWS S3 / MinIO / RustFS) |

In **Supabase Cloud**, this split is invisible to the user — Supabase manages the backend (their managed S3 cluster) and the user just gets a single S3-compatible URL. So "do I need to set up AWS S3 to hook in?" — **no** for managed, **yes if you self-host** (you'd point `STORAGE_BACKEND=s3` at your own S3-compatible service).

Architectural significance for Tau: from the application's point of view, Supabase Storage and R2 are **both** S3-compatible endpoints. The `ObjectStorageService` abstraction in the existing plan ([apps/api/app/storage/object-storage.service.ts](apps/api/app/storage/object-storage.service.ts) per [sharing-architecture.md § R25](sharing-architecture.md#recommendations-for-tau)) works against either with one `TAU_S3_ENDPOINT` env change. There is no "use Postgres directly with a plugin" path that bypasses the S3 layer — Supabase Storage is itself a service in front of Postgres + an underlying object store.

### Finding 2: `PutObject` does not support `If-None-Match: '*'` — atomic content-addressed dedup is unsupported

The official [S3 compatibility matrix](https://supabase.com/docs/guides/storage/s3/compatibility) explicitly lists `Conditional Operations` as ✅ supported on `HeadObject`, `GetObject`, and `CopyObject`, but **not on `PutObject`**. Inspect the `PutObject` row directly: the supported System Metadata is `Content-Type / Cache-Control / Content-Disposition / Content-Encoding / Content-Language / Expires`. There is no `If-Match` / `If-None-Match` row. This is a hard blocker for the canonical R26 atomic content-addressed write pattern from [sharing-architecture.md § Atomic Content-Addressed Write Pattern](sharing-architecture.md#atomic-content-addressed-write-pattern):

```typescript
// Works against R2, MinIO, AWS S3, Tigris, B2 — does NOT work against Supabase Storage.
await storage.putBlob({
  key: `blobs/${sha.slice(0, 2)}/${sha.slice(2)}`,
  body: bytes,
  ifNoneMatch: '*',
});
```

Three workaround options if Supabase Storage were used:

| Workaround                                                                                        | Race window                                                                                      | Correctness                                                                                                      | Verdict                                                                        |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `HEAD`-then-`PUT`                                                                                 | Yes (between HEAD and PUT, two concurrent publishes from same user can both write the same blob) | Lossy — writes the same bytes twice (wasted egress, no correctness corruption since blobs are content-addressed) | Acceptable but defeats the dedup primitive                                     |
| Postgres `INSERT … ON CONFLICT DO NOTHING` on `blob_ref` first, then `PUT` only on insert success | None — Postgres is the gate                                                                      | Correct, atomic                                                                                                  | **Best fit** but couples blob existence to DB row, complicates orphan recovery |
| Resumable upload (TUS) protocol via Supabase's TUS endpoint                                       | None — TUS handles deduplication via fingerprints                                                | Correct                                                                                                          | Different upload protocol; loses S3-protocol portability                       |

The Postgres-gate workaround works but means the "smoke-test against MinIO in dev" guarantee weakens: dev exercises the real S3 atomic primitive, prod relies on the DB-coupled fallback. This is the kind of dev-prod divergence the [sharing-architecture.md § Dev/Prod Parity Contract](sharing-architecture.md#devprod-parity-contract) explicitly designs against.

December 2025 saw a related commit ([supabase/storage@fc76ee3](https://github.com/supabase/storage/commit/fc76ee324324f02ede77909f8bc9df2d35436c7d)) adding `IfMatch` for the TUS lock protocol's S3 operations — confirming that the storage team is incrementally adding conditional support, but `PutObject + If-None-Match: '*'` is not on the published roadmap as of May 2026.

### Finding 3: Egress economics make Supabase ~24× more expensive at Year 3 scale

Supabase pricing (Pro plan, May 2026):

| Quota / Rate             | Value        |
| ------------------------ | ------------ |
| Storage included         | 100 GB       |
| Storage overage          | $0.021/GB-mo |
| Cached egress included   | 250 GB/mo    |
| Cached egress overage    | $0.03/GB     |
| Uncached egress included | 250 GB/mo    |
| Uncached egress overage  | $0.09/GB     |
| Base plan                | $25/mo       |

Smart CDN auto-caches public bucket reads (Pro+). Achievable cache-hit rate for public, content-addressed CAD blobs with 1-year `Cache-Control: immutable` is high in steady state — generously assume **80% cache hits**. This is consistent with the [Cloudflare R2 baseline](https://developers.cloudflare.com/r2/) where similar public-static workloads see 90%+ hit rates.

The Year-1/2/3 scenarios from [sharing-architecture.md § Cost Projection](sharing-architecture.md#cost-projection-usdmonth) yield:

| Scenario                             | Storage                    | Total egress | 80% cached / 20% uncached | Supabase total/mo                                | R2 total/mo | Multiplier |
| ------------------------------------ | -------------------------- | ------------ | ------------------------- | ------------------------------------------------ | ----------- | ---------- |
| **Year 1** — 100 GB, 1 TB egress/mo  | $0 (within free)           | 1000 GB      | 800 / 200 GB              | $25 + $16.50 + $0 = **~$42**                     | **~$1.50**  | **28×**    |
| **Year 2** — 1 TB, 10 TB egress/mo   | $18.90 (900 GB × $0.021)   | 10 000 GB    | 8000 / 2000 GB            | $25 + $19 + $232.50 + $157.50 = **~$434**        | **~$20**    | **22×**    |
| **Year 3** — 10 TB, 100 TB egress/mo | $207.90 (9900 GB × $0.021) | 100 000 GB   | 80 000 / 20 000 GB        | $25 + $208 + $2 392.50 + $1 777.50 = **~$4 403** | **~$190**   | **23×**    |

3-year cumulative (Year-2 + Year-3 dominate):

| Vendor                   | 3-year cumulative                         |
| ------------------------ | ----------------------------------------- |
| **Supabase Storage Pro** | **~$57 000**                              |
| **Cloudflare R2**        | **~$2 540**                               |
| **AWS S3 + CloudFront**  | ~$101 500 (per the existing research doc) |

Even at an unrealistic 95% cache hit rate, Year-3 Supabase still costs **~$3 530/mo (~18× R2)**. The structural issue is Tau's read-per-write amplification — public model embeds in blogs/docs/Notion are read 100–10 000× more often than the user-uploaded source. R2's flat $0/GB egress is uniquely well-aligned to this access pattern; **any per-GB egress charge defeats the architecture economically**, regardless of how cheap the cached rate is.

### Finding 4: RLS-from-Better-Auth needs asymmetric-JWT plumbing Tau doesn't have today

Supabase's third-party auth integration ([guide](https://supabase.com/docs/guides/auth/third-party/overview)) requires:

- JWTs signed with an **asymmetric** algorithm (RS256, ES256, EdDSA — not HS256).
- A reachable **OIDC Discovery URL** (`/.well-known/openid-configuration`) exposing the issuer's JWKS endpoint.
- A `kid` (key ID) header parameter on each JWT.
- Supabase's own auth service running alongside (it cannot be disabled).

Better Auth's defaults:

- The JWT plugin defaults to **EdDSA / Ed25519** (asymmetric — works in principle).
- RS256 is configurable via `keyPairConfig` ([Better Auth JWT docs](https://beta.better-auth.com/docs/plugins/jwt)).
- HS256 is **not supported** at all.
- The plugin **is not currently configured in Tau** — only `idPrefix.jwks` exists in [apps/api/app/config/better-auth.config.ts](apps/api/app/config/better-auth.config.ts) line 28; no `jwt({ jwks: ... })` plugin is wired.

Net: pulling Better Auth into Supabase RLS-from-storage would require:

1. Wiring the Better Auth `jwt()` plugin with an asymmetric algorithm.
2. Standing up the OIDC discovery endpoint at the API base URL.
3. Configuring Supabase's third-party auth provider to trust the issuer.
4. Writing RLS policies on `storage.objects` that decode the Better Auth claim shape (which differs from Supabase Auth's claim shape).
5. Continuing to run Supabase Auth alongside (cannot be disabled).

This is real architectural surface — not impossible, but expensive relative to the alternative (use the API as the only client to private buckets, with the API service-account-authenticated). The R2 plan already takes the latter approach. **No simplification materializes by switching to Supabase Storage.**

### Finding 5: Bucket lifecycle rules and ACLs are unsupported — breaks R27 soft-delete

Supabase Storage's S3 compatibility matrix lists `PutBucketLifecycleConfiguration` and `GetBucketLifecycleConfiguration` as ❌ unsupported, alongside `PutBucketCors` (also ❌). [R27 from sharing-architecture.md](sharing-architecture.md#recommendations-for-tau) relies on:

- An "abort orphan multipart uploads after 7 days" lifecycle rule.
- A "delete `unpublished/<key>` prefix after 30 days" rule for soft-delete cleanup.

Supabase has no bucket-level lifecycle. Workarounds:

| Need                               | R2 native                               | Supabase workaround                                                             |
| ---------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------- |
| Soft-delete cleanup at 30 days     | Lifecycle rule on `unpublished/` prefix | Cron job in API issuing `DeleteObject`                                          |
| Orphan multipart cleanup at 7 days | Lifecycle rule                          | Cron job querying `storage.s3_multipart_uploads` table + `AbortMultipartUpload` |
| CORS configuration                 | Per-bucket via API                      | Per-bucket via Supabase dashboard (limited surface; not S3-protocol parity)     |

These are tractable, but they push operational concerns into Tau's own codebase that R2 handles declaratively. The migration cost dominates the integration cost — not a saving.

### Finding 6: Local-dev story is genuinely simpler with Supabase, but MinIO is already designed-in

`supabase start` provides a real S3-protocol endpoint at `http://127.0.0.1:54321/storage/v1/s3` ([Supabase local dev docs](https://supabase.com/docs/guides/local-development)). This is a legitimate ergonomic win — one Docker stack covers Postgres + Auth + Storage + Edge Functions + Realtime instead of separate `postgres` + `redis` + `minio` + `minio-bootstrap` services in [infra/docker-compose.yml](infra/docker-compose.yml).

Counter-arguments:

1. **The MinIO setup in the existing plan is already designed and ~50 lines of compose YAML** ([sharing-architecture.md § Local-Dev docker-compose Snippet](sharing-architecture.md#local-dev-docker-composeyml-snippet)). Replacing it with `supabase start` would force the entire team to install + run the Supabase CLI just to develop against any service — a much heavier dependency.
2. **`supabase start` boots ~14 Docker containers** versus 4 for Tau today. Cold-start time on a fresh laptop is several minutes vs ~30 s.
3. **Tau's Postgres is currently a pinned `pgvector/pgvector:pg17` image**, customizable per [infra/docker-compose.yml](infra/docker-compose.yml). Switching to Supabase would mean accepting the Supabase-bundled Postgres image and version cadence.
4. The MinIO endpoint already passes the `If-None-Match: '*'` parity test that Supabase's S3 endpoint fails (Finding 2) — using Supabase locally would make the dev environment **less** representative of the production behaviour we want, not more.

Net: the local-dev simplification is real but costs more than it saves at Tau's current scale and forces a regression on the conditional-write contract.

### Finding 7: "Just use Postgres with extensions" is not a viable path

The user's question included whether using Supabase Storage might enable "simply using Postgres with some plugins/extension" for blob storage. Three paths examined:

| Path               | Verdict      | Why                                                                                                                                                                                                                                       |
| ------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pg_largeobject`   | Rejected     | 16 TB DB-wide cap, awful streaming behavior, no CDN, no presigned URLs, no chunked range reads — not designed for media-style blob storage. AGENTS.md: Supabase free-tier auto-pauses after 7 days; Postgres is not the right blob store. |
| `bytea` columns    | Rejected     | Best-practice ceiling ~1 MiB per row; CAD source files routinely 10–25 MiB; would require chunking + reassembly logic that re-implements an object store badly.                                                                           |
| Postgres FDW to S3 | Out of scope | Foreign-data wrappers exist (e.g. `aws_s3` extension on RDS) but Supabase doesn't expose them; even if it did, the underlying S3 limits and pricing would still apply.                                                                    |

Supabase's `storage.objects` table is **metadata only** — the bytes themselves live in the underlying object store. So "Postgres + Supabase Storage" is identical to "Postgres + R2 + a separate metadata table" except:

- The `storage.objects` table is owned by Supabase (schema can change with platform updates).
- Tau still needs its own `publication` and `blob_ref` tables for the application semantics (refcount, owner, visibility, runtime pin, kernel set, GLB derivative key) — `storage.objects` doesn't replace them, only sits alongside.

There is **no architectural simplification** from binding the application's domain tables to Supabase's storage metadata table. The opposite is true: keeping `blob_ref` portable across object stores preserves migration optionality.

### Finding 8: Single-vendor blast radius and migration optionality

Tau today runs:

- Postgres on Supabase (free-tier, per AGENTS.md).
- API on Fly.io.
- UI on Netlify.
- Object storage: TBD (the existing plan says R2).

Adding R2 introduces **one** new vendor relationship. Adding Supabase Storage instead **removes** none — we're already on Supabase Postgres — but it **deepens** the Supabase dependency: an outage or pricing change at Supabase now blocks both database AND storage simultaneously, where the R2 path keeps those failure domains independent.

Migration optionality also matters. From [sharing-architecture.md § Migration Optionality](sharing-architecture.md#migration-optionality):

- **R2 → Tigris**: same SDK, Shadow Buckets handle the migration transparently, zero downtime.
- **R2 → AWS S3**: Cloudflare's native Super Slurper handles the move.
- **Supabase Storage → anything**: bulk-export through the S3 protocol endpoint (which doesn't support some bulk-copy primitives like `UploadPartCopy` conditional ops), or full re-upload from source. The migration path is materially worse than R2's.

## Cost Projection

Same scenarios as the [sharing-architecture.md § Cost Projection](sharing-architecture.md#cost-projection-usdmonth), with Supabase added.

| Scenario                             | **R2**      | **Tigris (Global)** | **Supabase Storage Pro** (80% cache hit) | **AWS S3 + CloudFront** |
| ------------------------------------ | ----------- | ------------------- | ---------------------------------------- | ----------------------- |
| **Year 1** — 100 GB, 1 TB egress/mo  | ~$1.50      | ~$2.50              | **~$42** (incl. $25 base)                | ~$88                    |
| **Year 2** — 1 TB, 10 TB egress/mo   | ~$20        | ~$30                | **~$434**                                | ~$897                   |
| **Year 3** — 10 TB, 100 TB egress/mo | ~$190       | ~$255               | **~$4 403**                              | ~$7 485                 |
| **3-year cumulative**                | **~$2 540** | ~$3 440             | **~$57 000**                             | ~$101 500               |

Supabase Storage is competitive only at very low scale (Year 1) where the $25 Pro plan base dominates. From Year 2 onward, egress economics make it 18-24× more expensive than R2 across realistic cache-hit ranges.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                           | Priority | Effort            | Impact                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------- | --------------------------- |
| R1  | **Stay with Cloudflare R2 in production** as specified in [sharing-architecture.md § R23](sharing-architecture.md#recommendations-for-tau) — egress economics, atomic conditional writes, and lifecycle rules dominate the decision                                                                              | P0       | None (status quo) | High                        |
| R2  | **Document Supabase Storage as a one-flag escape hatch.** The `ObjectStorageService` abstraction already supports it — switching only requires changing `TAU_S3_ENDPOINT`, credentials, and providing the conditional-write workaround                                                                           | P1       | S                 | Low (preserves optionality) |
| R3  | **Reject the hybrid "Supabase for staging, R2 for prod" pattern.** Different conditional-write semantics across environments would defeat the dev/prod parity contract; staging on R2 is correct                                                                                                                 | P0       | None              | Med                         |
| R4  | **Reject "Postgres-as-blob-store" entirely.** `pg_largeobject` and `bytea` are not viable at our blob sizes; the question is moot                                                                                                                                                                                | P0       | None              | Low                         |
| R5  | **Pre-conditions before any future Supabase Storage migration**: (a) `PutObject + If-None-Match: '*'` published as supported, (b) bucket lifecycle rules supported, (c) Better Auth JWT plugin wired with asymmetric algorithm + OIDC discovery endpoint, (d) cost projection re-validated at then-current scale | P3       | M                 | —                           |

## Trade-offs

| Aspect                                                              | **Cloudflare R2** (recommended)                           | **Supabase Storage Pro**                                          |
| ------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| Egress cost                                                         | $0/GB always                                              | $0.03/GB cached + $0.09/GB uncached                               |
| Year-3 projected cost                                               | ~$190/mo                                                  | ~$4 403/mo                                                        |
| `PutObject + If-None-Match: '*'` for atomic content-addressed dedup | ✓ (since 2024)                                            | ✗ (not in compatibility matrix)                                   |
| `If-None-Match` on reads (HeadObject/GetObject)                     | ✓                                                         | ✓                                                                 |
| Bucket lifecycle rules                                              | ✓                                                         | ✗ (would need API-side cron)                                      |
| Multipart upload                                                    | ✓                                                         | ✓                                                                 |
| Presigned URLs                                                      | ✓ on R2 endpoint, not on custom domain (by design)        | ✓                                                                 |
| Smart CDN                                                           | ✓ (Cloudflare's global cache, free)                       | ✓ (Smart CDN, included in Pro)                                    |
| Custom domain                                                       | `cdn.tau.new`                                             | Possible via Supabase Pro                                         |
| Image transformation                                                | Cloudflare Image Resizing                                 | Supabase Image Transformations                                    |
| Vendor blast radius                                                 | Independent failure domain from Supabase Postgres         | Same vendor as Postgres — coupled outage surface                  |
| Local-dev parity                                                    | MinIO in `infra/docker-compose.yml` (pinned)              | `supabase start` (heavier, 14 containers)                         |
| Dev/prod conditional-write parity                                   | ✓ (MinIO matches R2 on `If-None-Match: '*'`)              | ✗ (Supabase fails the parity test)                                |
| RLS / per-row auth                                                  | n/a (API-mediated)                                        | Possible but requires Better Auth asymmetric JWT + OIDC plumbing  |
| Migration optionality                                               | High (Super Slurper, Sippy, Tigris Shadow Buckets)        | Lower (full re-upload via S3 protocol)                            |
| Compliance breadth                                                  | SOC 2 Type II, ISO 27001/18/27701, GDPR, FedRAMP Moderate | SOC 2 Type II, HIPAA BAA on higher plans                          |
| Free-tier reality                                                   | 10 GB + 1 M Class A + 10 M Class B + $0 egress, permanent | 1 GB + 5 GB cached + 5 GB uncached, then $25/mo Pro plan kicks in |

## Migration Optionality

The `ObjectStorageService` abstraction in the existing plan is the migration insurance. At any future point:

```typescript
// Today (recommended): R2 in prod, MinIO in dev
TAU_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com

// One-flag pivot to Supabase Storage if R2's terms ever change:
TAU_S3_ENDPOINT=https://<project>.supabase.co/storage/v1/s3
// + workaround for the conditional-write gap (see Finding 2)
```

The application code does not change. This optionality is what makes "stay with R2 today" the safe long-term choice — we keep the option to switch open without paying the integration cost upfront.

## References

- [Supabase Storage S3 Compatibility](https://supabase.com/docs/guides/storage/s3/compatibility) — official compatibility matrix; the source of Finding 2.
- [Supabase Storage architecture overview (DeepWiki)](https://deepwiki.com/supabase/storage/1.1-architecture-overview) — protocol-and-backend split detail.
- [Supabase Storage 3× cheaper egress changelog](https://supabase.com/changelog/38119-3x-cheaper-egress-for-cache-hits) — current pricing model (cached vs uncached split).
- [Supabase Storage Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn) — caching semantics, signed-URL gotchas.
- [Supabase third-party auth requirements](https://supabase.com/docs/guides/auth/third-party/overview) — asymmetric JWT + OIDC discovery requirements.
- [Better Auth JWT plugin](https://beta.better-auth.com/docs/plugins/jwt) — supported algorithms (EdDSA default, RS256/ES256/PS256 configurable).
- [Cloudflare R2 conditional write support](https://blog.cloudflare.com/r2-conditional-writes/) — `If-None-Match: '*'` since 2024.
- Related: [docs/research/sharing-architecture.md](sharing-architecture.md) — the parent plan this evaluation feeds back into.
- Related: [docs/research/sharing-architecture.md § Object Storage: Local-Dev to Production](sharing-architecture.md#object-storage-local-dev-to-production) — the original R2-vs-Tigris-vs-S3+CloudFront comparison.
