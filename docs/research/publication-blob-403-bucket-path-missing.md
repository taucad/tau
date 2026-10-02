---
title: 'Publication Viewer 403 — Missing MinIO Bucket Path in Public Base URL'
description: 'Root-cause investigation of "Can't load this design's files" on /v/:id in local dev: TAU_S3_PUBLIC_BASE_URL default omits the tau-content bucket segment required by path-style MinIO addressing.'
status: active
created: '2026-05-25'
updated: '2026-05-25'
category: investigation
related:
  - docs/research/sharing-architecture.md
  - docs/research/sharing-mvp-manual-runbook.md
---

# Publication Viewer 403 — Missing MinIO Bucket Path in Public Base URL

Root-cause investigation of the "Can't load this design's files" lock screen rendered by `/v/:id` in local dev, with browser console showing repeated `GET http://localhost:9000/blobs/<sha> 403 (Forbidden)` from the publication blob fetches.

## Executive Summary

The dev default for `TAU_S3_PUBLIC_BASE_URL` in `apps/api/app/config/environment.config.ts` and `apps/api/.env.example` is `http://localhost:9000`, omitting the `tau-content` bucket segment. MinIO uses **path-style** S3 addressing (`http://<host>/<bucket>/<key>`), so every URL emitted by `ObjectStorageService.publicUrl()` resolves to a non-existent bucket — `http://localhost:9000/blobs/<sha>` is parsed as bucket `blobs`, which has no anonymous policy and returns `403 Forbidden`. The corresponding architecture/runbook document already prescribes the correct value (`http://localhost:9000/tau-content`); the code defaults silently diverged. Fix is a one-line default update plus parity in `.env.example`, with a startup precondition to prevent future drift.

## Problem Statement

A user navigates to `http://localhost:3000/v/pub_l5rC3nyuosLMbxgYwN8c0`. The lock-screen variant `filesUnavailable` renders with copy "Can't load this design's files. The design's files are temporarily unavailable. Try again in a moment." The browser console shows:

```text
GET http://localhost:9000/blobs/93/33733fcc64ed5016c927d5c9639d97d83f84947f3a64619e79b6128d649ccb 403 (Forbidden)
GET http://localhost:9000/blobs/90/a9fc4d1a258d05d27d716957190e68d1b4b3ee7724b6bab6cfa0fe74da79fb 403 (Forbidden)
```

These 403s originate from `apps/ui/app/routes/v.$id/route.tsx:230`, where `PublicationInteractiveSurface` iterates `data.files: Record<string, string>` (path → URL) returned by the loader and calls `fetch(blobUrl)` for each. Any non-OK response sets `fetchError`, which causes the `<PublicationLockScreen variant='filesUnavailable' isInline />` branch to render.

The loader hits `GET /v1/publications/:id` which is served by `PublicationsService.getPublicationForViewer` and returns a body whose `files` field is computed by:

```393:393:apps/api/app/api/publications/publications.service.ts
      files[relativePath] = this.storage.publicUrl({ namespace: 'blobs', key: blobKey });
```

`ObjectStorageService.publicUrl()` constructs:

```237:244:apps/api/app/storage/object-storage.service.ts
  public publicUrl(args: { namespace: StorageNamespace; key: string }): string {
    const prefix = STORAGE_NAMESPACE_PREFIXES[args.namespace];
    const encodedKey = args.key
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `${this.publicBaseUrl}/${prefix}${encodedKey}`;
  }
```

Concatenation only — no bucket inserted. The output depends entirely on whether `publicBaseUrl` already includes the bucket segment.

## Methodology

1. Read the publication view route loader and identify the failure path (`PublicationInteractiveSurface` → `setFetchError`).
2. Trace `data.files` URLs back to `publicUrl()` in `ObjectStorageService`.
3. Inspect dev defaults in `environment.config.ts`, `.env.example`, and the actual `apps/api/.env` on disk.
4. Compare against the documented blueprint in `docs/research/sharing-architecture.md` § Object Storage.
5. Probe the running local MinIO directly with `curl` to confirm the URL shape that returns `200` vs `403`.

## Findings

### Finding 1: `TAU_S3_PUBLIC_BASE_URL` dev default omits the bucket segment

The schema default is `http://localhost:9000`:

```77:80:apps/api/app/config/environment.config.ts
  TAU_S3_PUBLIC_BASE_URL: z
    .string()
    .default('http://localhost:9000')
    .describe('Canonical CDN/host prefix for browser GETs (never *.r2.cloudflarestorage.com in prod UI)'),
```

`apps/api/.env.example:36` carries the same value: `TAU_S3_PUBLIC_BASE_URL=http://localhost:9000`.

The user's local `apps/api/.env` does not override `TAU_S3_*`, so the Zod default applies.

The architecture blueprint explicitly prescribes the bucket-bearing value for dev:

```764:768:docs/research/sharing-architecture.md
# Public base URL for direct browser GETs of public derivatives.
# Dev: MinIO uses path-style addressing, so the bucket name must be in the path
# (http://localhost:9000/<bucket>). Prod: CDN custom domain is host-bound to a
# single bucket so the bucket name is absent from the path (https://cdn.tau.new).
TAU_S3_PUBLIC_BASE_URL=http://localhost:9000/tau-content
```

The implementation never followed the spec.

### Finding 2: Production overrides mask the dev bug

`apps/api/fly.staging.toml:33` and `fly.prod.toml` set `TAU_S3_PUBLIC_BASE_URL = 'https://cdn.taucad.dev'` (and the prod analogue) — Cloudflare R2 custom domains are host-bound to a single bucket, so the bucket segment is intentionally absent. The current dev default works **only** in the prod URL shape, which is the inverse of what dev MinIO needs.

| Environment                     | `TAU_S3_FORCE_PATH_STYLE` | Bucket in URL?              | Working URL shape                 |
| ------------------------------- | ------------------------- | --------------------------- | --------------------------------- |
| Dev (MinIO)                     | `true`                    | **Yes** (in path)           | `http://host:9000/<bucket>/<key>` |
| Staging/Prod (R2 custom domain) | `false`                   | No (custom domain → bucket) | `https://cdn.host/<key>`          |

### Finding 3: Live MinIO probe confirms the failure shape

Direct probe of the running MinIO container (with the bug present):

```text
$ curl -o /dev/null -w "%{http_code}\n" http://localhost:9000/blobs/93/33733fcc...
403

$ curl -o /dev/null -w "%{http_code}\n" http://localhost:9000/tau-content/blobs/93/33733fcc...
200

$ curl -o /dev/null -w "%{http_code}\n" http://localhost:9000/defaults/og.png
403

$ curl -o /dev/null -w "%{http_code}\n" http://localhost:9000/tau-content/defaults/og.png
200
```

Path-style MinIO parses the first path segment as the bucket name. `blobs`, `defaults`, `derivatives`, `og-images` are all _namespace prefixes_ inside the `tau-content` bucket — they are not buckets themselves, so MinIO responds `403 AccessDenied` (anonymous policy is bound to `tau-content`, not to phantom siblings).

### Finding 4: The S3 readiness probe does not catch this misconfiguration

`S3HealthIndicator.isHealthy()` (`apps/api/app/api/health/s3-health.indicator.ts`) calls `ObjectStorage.headProbeObject()`, which issues a SigV4-signed `HeadObject` against `TAU_S3_ENDPOINT` with `Bucket: this.bucket`. The bucket name comes from `TAU_S3_BUCKET`, not from `TAU_S3_PUBLIC_BASE_URL`, so a broken public base URL never trips readiness. Every other server-side blob fetch (e.g. `getBlob` for the manifest) is signed too — only the _browser-facing_ URLs cross the broken surface.

### Finding 5: The `publicUrl` unit test cannot catch this

`apps/api/app/storage/object-storage.service.test.ts:165-171` asserts `publicUrl` returns `${publicBaseUrl}/<namespace-prefix><key>`, where `publicBaseUrl` is read from the runtime env. If the env's `TAU_S3_PUBLIC_BASE_URL` is broken, the test happily reflects the broken value back — it validates concatenation shape, not reachability. The bug is purely a configuration drift between the documented architecture and the dev defaults.

### Finding 6: Browser symptoms upstream of the failure are noise

The console transcript also contains:

- `[vite] 504 (Outdated Optimize Dep)` — Vite dev-server's optimized-deps cache invalidation; unrelated to publication serving.
- `ENOENT '/projects/view-pub_…'` thrown by `DirectIdbProvider.readdir` during `[FileManager] Initial tree hydration` — expected on the first viewer mount because the viewer project's IndexedDB tree is empty until `loadFiles` writes the fetched blobs back. The code already logs it as "(empty filesystem?)" and proceeds.

Neither contributes to the 403; both are pre-existing benign surface noise.

## Smoking Gun

```mermaid
flowchart LR
  A[publish flow] --> B[(MinIO bucket<br/>tau-content/blobs/sha…)]
  C[viewer loader<br/>/v/:id] --> D[publicUrl ⇒ ${publicBaseUrl}/blobs/sha…]
  D --> E{publicBaseUrl<br/>contains bucket?}
  E -- "Yes ✅ (prod via cdn.taucad.dev → bound to bucket)" --> F[200 OK]
  E -- "No ❌ (dev default = http://localhost:9000)" --> G[GET /blobs/sha…<br/>= bucket 'blobs'<br/>→ 403 AccessDenied]
  G --> H["filesUnavailable lock screen"]
```

The bug is **one missing path segment** in two files.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                          | Priority | Effort  | Impact                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- | ------------------------------------------------------------------------------------- |
| R1  | Change the dev default of `TAU_S3_PUBLIC_BASE_URL` in `apps/api/app/config/environment.config.ts` to `http://localhost:9000/tau-content`.                                                                                                                                                                                       | P0       | Trivial | Unblocks all local publication viewer testing                                         |
| R2  | Update `apps/api/.env.example:36` to match (`http://localhost:9000/tau-content`) so fresh clones inherit the correct value.                                                                                                                                                                                                     | P0       | Trivial | Prevents new contributors from re-introducing the same broken value into their `.env` |
| R3  | Add a startup precondition: when `TAU_S3_FORCE_PATH_STYLE === true`, assert that `new URL(TAU_S3_PUBLIC_BASE_URL).pathname` contains a non-root segment matching `TAU_S3_BUCKET` (mirrors the existing `superRefine` localhost-in-prod check). Fail fast with a descriptive error rather than silently emitting 403-bound URLs. | P1       | Low     | Catches drift in CI and any future env profile (dev container, e2e harness)           |
| R4  | Promote the dev MinIO publication round-trip to a smoke test (publish → fetch a blob URL with raw `fetch` → expect 200). The current `ObjectStorageService` integration test only proves the S3 client works; no test asserts the **browser-facing** URL is reachable.                                                          | P2       | Medium  | Closes the test gap that allowed Finding 5 to persist                                 |
| R5  | Cross-link the dev env section of `docs/research/sharing-mvp-manual-runbook.md` to call out this defaults-vs-blueprint divergence so the runbook stays single-source-of-truth.                                                                                                                                                  | P3       | Trivial | Documentation hygiene                                                                 |

## Trade-offs

R3 (startup precondition) is the only recommendation with a tradeoff worth noting: it slightly tightens the dev/test contract. A hypothetical future where `TAU_S3_PUBLIC_BASE_URL` legitimately points to a CDN that strips the bucket segment for path-style backends (none today, but conceivable) would need to disable the assertion. The mitigation is to scope the check to `NODE_ENV !== 'production'` so the prod profile is unaffected, mirroring the existing `superRefine`.

## Code Examples

### Recommended diff for R1 + R2

```diff
--- a/apps/api/app/config/environment.config.ts
+++ b/apps/api/app/config/environment.config.ts
@@ -77,7 +77,7 @@
   TAU_S3_PUBLIC_BASE_URL: z
     .string()
-    .default('http://localhost:9000')
+    .default('http://localhost:9000/tau-content')
     .describe('Canonical CDN/host prefix for browser GETs (never *.r2.cloudflarestorage.com in prod UI)'),
```

```diff
--- a/apps/api/.env.example
+++ b/apps/api/.env.example
@@ -33,7 +33,7 @@
 TAU_S3_SECRET_ACCESS_KEY=tau-api-dev-secret
 TAU_S3_FORCE_PATH_STYLE=true
 TAU_S3_BUCKET=tau-content
-TAU_S3_PUBLIC_BASE_URL=http://localhost:9000
+TAU_S3_PUBLIC_BASE_URL=http://localhost:9000/tau-content
```

The user must also update their local `apps/api/.env` (or simply unset `TAU_S3_PUBLIC_BASE_URL` to inherit the new default).

### Sketch for R3 startup precondition

Inside the existing `environmentSchema.superRefine` block:

```ts
if (data.TAU_S3_FORCE_PATH_STYLE) {
  try {
    const publicUrl = new URL(data.TAU_S3_PUBLIC_BASE_URL);
    const firstSegment = publicUrl.pathname.split('/').filter(Boolean)[0];
    if (firstSegment !== data.TAU_S3_BUCKET) {
      context.addIssue({
        code: 'custom',
        message: `TAU_S3_PUBLIC_BASE_URL must include the bucket name as the first path segment when TAU_S3_FORCE_PATH_STYLE=true (expected first segment '${data.TAU_S3_BUCKET}', got '${firstSegment ?? '<empty>'}'). Example: http://localhost:9000/${data.TAU_S3_BUCKET}.`,
        path: ['TAU_S3_PUBLIC_BASE_URL'],
      });
    }
  } catch {
    /* URL parse error already surfaced by the existing branch */
  }
}
```

## Scope and Non-Goals

**In scope**: identifying why blob GETs return 403 in local dev and prescribing a fix that keeps prod/staging untouched.

**Out of scope**:

- The Vite `504 (Outdated Optimize Dep)` server-error noise — orthogonal, fixed by restarting the dev server or clearing `node_modules/.vite`.
- The `ENOENT '/projects/view-pub_…'` log from `DirectIdbProvider` — already handled gracefully; not a regression.
- The CSP `connect-src` review described in `docs/research/sharing-mvp-manual-runbook.md` — relevant only to the deployed Netlify environments, not local dev.

## References

- Related architecture doc: `docs/research/sharing-architecture.md` (prescribes the correct `TAU_S3_PUBLIC_BASE_URL` shape at line 768).
- Related runbook: `docs/research/sharing-mvp-manual-runbook.md` (CSP and Fly env coordination).
- MinIO path-style addressing: bucket name is the first path segment; subpaths under unknown buckets return `403` (not `404`) because the policy evaluator runs before existence checks.
- Cloudflare R2 custom-domain routing: a custom domain is bound to a single bucket so `https://cdn.tau.new/<key>` resolves directly to `<bucket>/<key>` without an explicit bucket segment, which is why the prod profile naturally works without the segment.
