---
title: 'Netlify UI Production Performance Audit: Caching, Edge Topology, and SSR Cost'
description: 'Forensic analysis of taucad.dev TTFB regressions before production cutover — quantifies edge cache bypass, single-region SSR, blocking root-loader API fetch, and 22 MB function bundle, with prioritized remediation plan to reach sub-200 ms TTFB parity with Vercel-hosted Fumadocs reference sites.'
status: draft
created: '2026-05-06'
updated: '2026-05-06'
category: optimization
related:
  - docs/architecture/netlify-multi-region-functions.md
  - docs/policy/ssr-bundle-policy.md
  - docs/research/netlify-ui-deployment-strategy.md
  - docs/architecture/ui-deployment-topology.md
  - docs/research/homepage-time-to-interactive-analysis.md
---

# Netlify UI Production Performance Audit: Caching, Edge Topology, and SSR Cost

Forensic audit of `apps/ui` performance on the live Netlify staging deployment (`taucad.dev`) ahead of production cutover to `tau.new`. Quantifies where the 700 ms+ TTFB on text/MDX endpoints comes from, identifies five compounding root causes, and proposes a prioritized remediation plan against measured baselines.

## Executive Summary

Live measurements taken 2026-05-06 against `taucad.dev` from a Sydney POP show the staging UI averages **731 ms TTFB** on the homepage and **363–656 ms TTFB** on documentation routes. The same framework (Fumadocs) running on Vercel (`docs.fumadocs.dev`) measures **172 ms** — a **4.2× gap** that is fully attributable to configuration, not framework or content.

Root causes, in order of impact:

1. **Every SSR response carries `Cache-Control: no-cache`** — Netlify's Edge Cache is `fwd=miss` and Durable Cache is `fwd=bypass` on **every** request, including endpoints whose output only changes on deploy (`/llms.mdx/*`, `/llms.txt`, `/llms-full.txt`, public `/docs/*`).
2. **Root loader synchronously fetches `https://api.taucad.dev/v1/models` on every page** — adds **~341 ms** to TTFB on routes whose own work (e.g. emitting a 7.8 KB markdown file) takes <20 ms.
3. **SSR Function deployed to a single region (`us-east-2`)** — adds 100–300 ms RTT for users outside the US East corridor.
4. **22 MB SSR Function bundle** — close to Netlify's 50 MB unzipped limit, increases cold-start latency, and is recompressed/copied per region.
5. **Vite-hashed `/assets/*` bundles return `Cache-Control: public, max-age=0, must-revalidate`** — the React Router default — so a 22 MB WASM is revalidated on every page load and edge-cached only after the first hit per POP.

A **2026-05-06 follow-up** shrank the SSR Function artifact to **~10 MB** (`build/server`, local `pnpm nx build ui`) with **`index.js` ~2.5 MB** — roughly **~55% smaller than the original 22 MB** cold-start input. Homepage and publication viewer routes now opt into Durable Cache via `cdnBackedSsrRouteHeaders` (short vs long TTL). `robots.txt` / `sitemap.xml` are environment-aware for `tau.new` vs staging. **Function region:** Netlify Terraform exposes a single `functions_region` string per site — Tau documents staying on **`us-east-2`** and leaning on edge cache for distant-PoP TTFB on cacheable routes (see [`docs/architecture/netlify-multi-region-functions.md`](../architecture/netlify-multi-region-functions.md)). **Post-deploy** curl / Search Console steps remain operator-verified.

## P1 implementation snapshot (2026-05-06)

| Item                                                          | Status                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1-extension (`/`, `/v/$id` cache tags + short/long TTL)      | **Landed** in `apps/ui` — verify warm `Netlify Edge; hit` after deploy.                                                                                                                                                                                                                                                                         |
| R6 PostHog proxy                                              | **Deferred** (unchanged).                                                                                                                                                                                                                                                                                                                       |
| R8 Function region / multi-PoP                                | **Resolved (decision)** — single-region `us-east-2`; list-based multi-region is not a Terraform primitive; alternatives (edge SSR, geo-routed sites) documented in architecture note.                                                                                                                                                           |
| R9 SSR bundle                                                 | **Partial** — ~10 MB server dir; CI **`pnpm nx run ui:size`** gates **11 MiB** dir + **3 MiB** `index.js`. Internal `lazy()` boundaries on `ModelViewer` / `CadPreviewViewer` / `CadViewer` were prototyped and **reverted** (no measurable `du` change — see child audit R7). ≤5 MB stretch goal not met — other static imports dominate `du`. |
| SEO (`robots.txt`, `sitemap.xml`, shared prerender path list) | **Landed** — validate XML / crawl rules in staging vs prod.                                                                                                                                                                                                                                                                                     |

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Methodology](#methodology)
3. [Baseline Measurements](#baseline-measurements)
4. [Findings](#findings)
5. [Recommendations](#recommendations)
6. [Trade-offs](#trade-offs)
7. [Code Examples](#code-examples)
8. [Diagrams](#diagrams)
9. [References](#references)
10. [Appendix](#appendix)

## Problem Statement

The user observed that `https://taucad.dev/llms.mdx/runtime/getting-started/your-first-kernel` — a route that emits ~8 KB of pre-processed markdown — takes ~320 ms TTFB in DevTools. This is unacceptable for a 7.8 KB text payload, especially since:

- The content only changes on deploy.
- The request hits Netlify (a CDN-fronted host).
- The same markdown rendered in a Fumadocs-on-Vercel deployment serves in ~110 ms.

We need to identify every contributing factor before production cutover (`tau.new` go-live), prioritize by impact and effort, and document concrete remediation steps that fit the existing Terraform-managed Netlify topology described in [`docs/architecture/ui-deployment-topology.md`](../architecture/ui-deployment-topology.md).

### Scope and Non-Goals

**In scope**: HTTP caching, CDN edge behavior, function topology (region/runtime), SSR loader chain cost, asset cache headers, response sizes.

**Out of scope**: Client-side TTI (covered in [`homepage-time-to-interactive-analysis.md`](homepage-time-to-interactive-analysis.md)), bundle splitting strategy beyond what affects function cold start, DNS performance (Cloudflare migration is independent — see [`netlify-ui-deployment-strategy.md`](netlify-ui-deployment-strategy.md)), API performance (`api.tau.new` is its own surface).

## Methodology

| Source                                                                                 | What was inspected                                                             |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `curl -D - -o /dev/null` against live `taucad.dev`                                     | Response headers, TTFB, total time, payload size, cache state                  |
| `host taucad.dev`                                                                      | DNS resolution to confirm CDN edge IPs (Netlify uses AWS CloudFront-style IPs) |
| `apps/ui/netlify.toml`, `apps/ui/netlify.prod.toml`                                    | Build config, headers, env vars                                                |
| `apps/ui/app/routes/llms*`, `apps/ui/app/routes/docs.$/route.tsx`                      | SSR loader chains, cache header usage                                          |
| `apps/ui/app/root.tsx`, `apps/ui/app/hooks/use-models.tsx`                             | Root loader fetch chain                                                        |
| `apps/ui/build/server/`, `apps/ui/build/client/`                                       | Function and client bundle sizes                                               |
| `apps/ui/react-router.config.ts`                                                       | Pre-render config (re-enabled for docs, llms text, legal — see R4)             |
| `apps/ui/server.ts`                                                                    | Reference Express asset cache settings (used in dev/local serve, not Netlify)  |
| Comparison curls against `docs.fumadocs.dev`, `cursor.com`, `vercel.com`, `stripe.com` | TTFB benchmarks for similar SSR-heavy stacks                                   |

All `curl` measurements were taken from a residential connection in Sydney (≈11 hops to `taucad.dev`'s nearest Netlify POP). Three-shot averages are reported where noted. Single-shot numbers are explicitly flagged.

## Baseline Measurements

### TTFB Comparison (3-shot average, 2026-05-06, Sydney POP)

| Site                                 | Stack                                   | Avg TTFB   | Multiple of Tau |
| ------------------------------------ | --------------------------------------- | ---------- | --------------- |
| `taucad.dev/` (homepage)             | React Router v7 SSR / Netlify Functions | **731 ms** | 1.0× (baseline) |
| `taucad.dev/docs/...`                | Same                                    | 813 ms     | 1.1×            |
| `taucad.dev/llms.mdx/...`            | Same                                    | 363–656 ms | 0.5–0.9×        |
| `stripe.com/`                        | nginx static + ESI                      | 401 ms     | 0.55×           |
| `vercel.com/`                        | Next.js / Vercel Edge                   | 266 ms     | 0.36×           |
| `docs.fumadocs.dev/`                 | **Same Fumadocs framework**, Vercel     | **172 ms** | **0.24×**       |
| `docs.fumadocs.dev/docs/ui/markdown` | Same, deep page                         | 110 ms     | 0.15×           |
| `cursor.com/`                        | Vercel Edge                             | 109 ms     | 0.15×           |

The Fumadocs reference is the most damning comparison: identical framework, identical content surface, **4.2× faster**.

### Per-Endpoint Cache State (`taucad.dev`)

| Endpoint                                                     | Status | Edge Cache | Durable Cache      | `Cache-Control` (response)         | TTFB                          | Size    |
| ------------------------------------------------------------ | ------ | ---------- | ------------------ | ---------------------------------- | ----------------------------- | ------- |
| `/` (SSR HTML)                                               | 200    | `fwd=miss` | `fwd=bypass`       | `no-cache`                         | 929 ms                        | 191 KB  |
| `/docs/runtime/getting-started/your-first-kernel`            | 200    | `fwd=miss` | `fwd=bypass`       | `no-cache`                         | 813 ms                        | 340 KB  |
| `/llms.mdx/runtime/getting-started/your-first-kernel`        | 200    | `fwd=miss` | `fwd=bypass`       | `no-cache`                         | 656 ms (cold) / 363 ms (warm) | 7.8 KB  |
| `/llms.txt`                                                  | 200    | `fwd=miss` | `fwd=bypass`       | `no-cache`                         | —                             | —       |
| `/llms-full.txt`                                             | 200    | `fwd=miss` | `fwd=bypass`       | `no-cache`                         | —                             | —       |
| `/api/ph/decide` (PostHog proxy)                             | 200    | `fwd=miss` | `fwd=bypass`       | `no-cache`                         | —                             | —       |
| `/projects` (auth-gated)                                     | 200    | `fwd=miss` | `fwd=bypass`       | `no-cache`                         | 576 ms                        | 0 B     |
| `/favicon.ico` (static)                                      | 200    | `fwd=miss` | _(no Durable hop)_ | `public,max-age=0,must-revalidate` | 412 ms                        | 15 KB   |
| `/favicon.svg` (static)                                      | 200    | `fwd=miss` | _(no Durable hop)_ | `public,max-age=0,must-revalidate` | —                             | —       |
| `/assets/replicad_single-OoZvnbu3.wasm` (22 MB hashed asset) | 200    | `fwd=miss` | _(no Durable hop)_ | `public,max-age=0,must-revalidate` | —                             | 22.7 MB |

Every single response is `fwd=miss` or `fwd=bypass`. **Not one** of the sampled responses is being served from cache. Even hashed/immutable assets carry `must-revalidate`.

### `/llms.mdx/...` 5-Shot TTFB Stability (Same URL)

| Iteration | TTFB   |
| --------- | ------ |
| 1         | 377 ms |
| 2         | 369 ms |
| 3         | 371 ms |
| 4         | 379 ms |
| 5         | 360 ms |

The variance is tight (±10 ms) and the floor is ~360 ms — there is no warm-up curve. Every single request runs the same SSR code path.

### Build Output Sizes

```
apps/ui/build/server          22 MB
apps/ui/build/server/index.js 3.3 MB
apps/ui/build/client          290 MB (mostly hashed WASM and source maps)
apps/ui/build/client/assets/opencascade_full-l9tuLyBW.wasm  35 MB
apps/ui/build/client/assets/replicad_single-OoZvnbu3.wasm   22 MB
apps/ui/build/client/assets/kcl_wasm_lib_bg-CMdA_RBl.wasm   13 MB
apps/ui/build/client/assets/esbuild-Cpd5nU_H.wasm           13 MB
apps/ui/build/client/assets/openscad.kernel-DTkgGLXs.js     10 MB
```

## Findings

### Finding 1: Every SSR response sets `Cache-Control: no-cache`, defeating Netlify CDN

**Severity**: P0 — single largest contributor to TTFB on warm requests.

The React Router v7 SSR pipeline emits `Cache-Control: no-cache` by default on every loader response. Netlify reads this header and:

- Sets `Cache-Status: "Netlify Edge"; fwd=miss` (edge cache forwarded — never cached).
- Sets `Cache-Status: "Netlify Durable"; fwd=bypass` (durable cache bypassed — not even attempted).

So **every request executes the Lambda-backed SSR Function**, even for endpoints whose output is purely deterministic between deploys (`/llms.mdx/*`, `/llms.txt`, `/llms-full.txt`, the public `/docs/*` tree). Netlify's Durable Cache is designed precisely for this case and is **disabled by header**.

Netlify supports a separate `Netlify-CDN-Cache-Control` header that controls edge caching independently of the browser's `Cache-Control`. None of our routes set it. Combined with `Cache-Tag` headers (and optional on-demand `purgeCache` when content changes without a deploy), this gives instant edge serves. Deploy-scoped objects are also auto-invalidated on each atomic deploy.

**Evidence**: All `curl` traces in [Per-Endpoint Cache State](#per-endpoint-cache-state-taucaddev) show `fwd=miss` and/or `fwd=bypass`. Five-shot test on `/llms.mdx/...` shows zero variance — no shot was served from cache.

### Finding 2: Root loader fetches `/v1/models` on every request, blocking SSR by ~341 ms

**Severity**: P0 — adds ~341 ms to TTFB on every route, regardless of content.

The root layout loader at `apps/ui/app/root.tsx` calls `getModels()` on every request:

```tsx
// apps/ui/app/root.tsx
export async function loader({ request }: LoaderFunctionArgs) {
  // ... theme, cookie ...
  let models: Model[] = [];
  try {
    models = await getModels();
  } catch (error) {
    models = [];
    console.error(error);
  }
  return { theme, cookie, env, models };
}
```

`getModels()` performs:

```ts
// apps/ui/app/hooks/use-models.tsx
const response = await fetch(`${ENV.TAU_API_URL}/v1/models`, {
  credentials: 'include',
});
```

Direct measurement of `https://api.taucad.dev/v1/models` from the Sydney POP: **341 ms TTFB**.

In React Router v7, the root loader runs for every route — including `/llms.mdx/*` whose own work is just reading a pre-processed MDX string and returning it. So the warm 363 ms TTFB on `/llms.mdx/...` decomposes roughly as:

- Network in/out, function dispatch: ~20 ms
- `getModels()` blocking fetch: ~341 ms
- Actual route work (read pre-processed MDX, build response): ~5–10 ms

The fetch already returns `[]` on error and the consumer (`useModels` in `use-models.tsx`) wraps the same call in a `react-query` `useQuery` that refetches every 5 minutes. The SSR pre-population is therefore an optimization for the first paint of model badges in chat UI, not a correctness requirement. **This loader has no business blocking the entire SSR document.**

### Finding 3: SSR Function lives in a single region (`us-east-2`)

**Severity**: P0 for non-US-East users — adds geographic RTT to every uncached request.

Per [`docs/research/netlify-ui-deployment-strategy.md`](netlify-ui-deployment-strategy.md) §Current Landscape, the existing site's SSR Function (`react-router-server`, 33 MB, runtime `nodejs24.x`) runs in `us-east-2`. Netlify edges are global (CloudFront-style IPs returned for `taucad.dev`: `99.83.231.61`, `75.2.60.5`), but a request that misses cache must travel from the edge POP to `us-east-2` and back. From Sydney, this is ~200 ms RTT alone — visible in the gap between `taucad.dev/favicon.ico` (412 ms, edge-cached static) and the homepage (929 ms TTFB).

Combined with Finding 1 (no caching), every Australian/European user pays the trans-Pacific or trans-Atlantic RTT on every page load.

**Status (2026-05-06):** Accepted tradeoff — keep **one** `functions_region` (`us-east-2`); mitigate cache misses with **Durable Cache** on `/` and `/v/$id` and the broader R1 header work. Netlify's Terraform provider does **not** accept a `function_regions` list; true global SSR would require Edge Functions or multiple sites (see [`docs/architecture/netlify-multi-region-functions.md`](../architecture/netlify-multi-region-functions.md)).

Netlify supports additional single-string regions and Pro/Enterprise features; Edge Functions (Deno runtime) run from all 60+ POPs and have <50 ms cold start vs Lambda's 200 ms+ for large bundles — a future option, not the current plan.

### Finding 4: SSR Function bundle is 22 MB (44% of Netlify's hard limit)

**Severity**: P1 — increases cold start, blocks multi-region rollout, escalates over time.

```
apps/ui/build/server          22 MB
apps/ui/build/server/index.js 3.3 MB
```

Netlify's hard limit is 50 MB unzipped per Function. We are at 44% — already flagged as Risk 3 in the prior research doc. Cold starts scale roughly linearly with bundle size; multi-region rollout (R6) multiplies cold-start cost across regions.

`vite.config.ts` `ssr.noExternal: ['@headless-tree/core', '@headless-tree/react', 'posthog-js']` already bundles three deps that need explicit handling. The bundle likely also includes client-only code paths that crept in via React component co-location with their loaders.

### Finding 5: Hashed/immutable assets carry `Cache-Control: public, max-age=0, must-revalidate`

**Severity**: P0 — single biggest waste of edge bandwidth and client-side latency.

Vite emits content-hashed bundle names (`Environment-K2BUC4T1.js`, `replicad_single-OoZvnbu3.wasm`) with the explicit guarantee that the bytes for a given hash are immutable. The standard pattern is `Cache-Control: public, max-age=31536000, immutable`.

Live measurement on `https://taucad.dev/assets/replicad_single-OoZvnbu3.wasm`:

```
HTTP/2 200
cache-control: public,max-age=0,must-revalidate
cache-status: "Netlify Edge"; fwd=miss
content-type: application/wasm
content-length: 22721704
```

**A 22 MB WASM is being revalidated on every visit** and not edge-cached after the first hit per POP. The `apps/ui/server.ts` Express config (used in `nx serve ui` for local production parity) already does this correctly:

```ts
app.use('/assets', express.static('build/client/assets', { immutable: true, maxAge: '1y' }));
app.use(express.static('build/client', { maxAge: '1h' }));
```

This is the canonical pattern. It is not being applied on Netlify because the Netlify deployment uses `@netlify/vite-plugin-react-router` to wrap the SSR build into a Function — the Express static-file middleware never runs in production.

The `[[headers]]` block in `netlify.toml` only declares security headers; no cache headers are set for `/assets/*`.

### Finding 6: `Netlify-Vary: query` shatters the cache key on any query string

**Severity**: P1 — once R1 (cache enable) lands, this becomes the next bottleneck.

Every SSR response carries `Netlify-Vary: query`, meaning the entire query string is part of the cache key. PostHog session params, UTM tags, `?ref=...`, and arbitrary tracking suffixes all defeat caching even when otherwise enabled.

This is a sensible default for routes that branch on query (search, filtering), but for static-output routes (`/llms.mdx/*`, `/llms.txt`, `/llms-full.txt`, marketing pages) it should be restricted to a known allowlist via `Netlify-Vary: query=theme|format` syntax (Netlify's per-route override).

### Finding 7: Pre-rendering is disabled despite a TODO that suggests enabling it

**Severity**: P1 — the cleanest fix for the static-content endpoints lives behind a single config block.

```ts
// apps/ui/react-router.config.ts
export default {
  ssr: true,
  // TODO: make FE env-vars available during prerendering.
  // async prerender() {
  //   // Static website content. Renders at build time and is served as static files,
  //   // speeds up the first load time.
  //   return ['manifest.webmanifest', 'robots.txt', '/llms.txt', '/llms-full.txt'];
  // },
} satisfies Config;
```

The author explicitly noted this is the right approach and the only blocker is build-time env-var availability. `/llms.txt`, `/llms-full.txt`, and the static `/llms.mdx/*` tree do not depend on runtime env vars (the loader chain calls `getLlmRefText({ siteTitle, siteUrl: ENV.TAU_FRONTEND_URL })` — `TAU_FRONTEND_URL` is available at Netlify build time via `[context.production.environment]`). The `/docs/*` HTML SSR tree similarly does not depend on per-request data once the root-loader API call (Finding 2) is removed.

Pre-rendered files become regular `build/client/*` assets, served directly by Netlify's CDN with edge caching enabled by default — no Function invocation, no cold start, no Durable cache trickery.

### Finding 8: PostHog `/api/ph/*` proxy taxes the SSR Function on every analytics ping

**Severity**: P1 — high invocation count, low CPU, wrong runtime.

`apps/ui/app/routes/api.ph.$/route.ts` proxies all PostHog API/asset traffic through the Netlify SSR Function (`/api/ph/decide`, `/api/ph/e/`, `/api/ph/static/*`). PostHog autocaptures roughly one event per pageview plus session-replay chunks every few seconds.

Each proxy invocation:

- Pays cold/warm Lambda cost in `us-east-2` (Finding 3).
- Counts against Netlify Functions invocation quota.
- Adds geographic RTT for non-US users.

Two viable alternatives:

1. **Netlify Edge Function** (Deno, runs at all POPs): sub-50 ms, no Lambda quota.
2. **Netlify rewrite rule** (`/api/ph/*  https://us.i.posthog.com/:splat  200!`): runs at the edge with zero function invocation, but loses the ability to inject server-side env (which we need for `POSTHOG_API_HOST` selection between US and asset hosts — fixable with two rules).

### Finding 9: Per-request MDX processing in `getLlmText`

**Severity**: P2 — once Findings 1, 2, 5, 7 are fixed, this becomes measurable; otherwise dwarfed.

`/llms.mdx/*` calls `getLlmText(page)` which calls `page.data.getText('processed')`. With Fumadocs MDX, `'processed'` triggers a per-request markdown parse + remark/rehype pipeline (the source.config.ts pipeline includes `remarkAutoTypeTable`, `remarkMdxMermaid`, `remarkResolveRelativeLinks`, plus `rehypeCodeOptions` with custom Shiki grammars). Even with a warm function, this is non-trivial CPU.

`fumadocs-mdx` emits the processed markdown at build time when `postprocess.includeProcessedMarkdown: true` is set (which it is in `source.config.ts`). So `getText('processed')` should be reading from disk, not re-processing — but disk I/O in a 22 MB bundled function is still measurable (~5–20 ms). Pre-rendering where safe (R4 for `/docs/*` shell + text artifacts) or Durable cache (R1 on `/llms.mdx/*`) reduces repeat origin work.

### Finding 10: Homepage SSR HTML is 191 KB

**Severity**: P2 — affects first-byte → first-contentful-paint, not TTFB.

The SSR HTML payload for `/` is 191 KB compressed (Brotli `content-encoding: br`). With 4 `<script>` tags and 1 `modulepreload`, this is heavier than expected for a marketing-style homepage. Largest contributors will be inlined React Server response state (`window.ENV` plus React Router's `__remixContext` blob with the root loader data — including the full `models` array). Out of scope for this audit beyond noting that fixing Finding 2 (drop SSR `getModels`) reduces this payload too.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                               | Priority            | Effort | Impact |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------ | ------ |
| R1  | **Status**: RESOLVED — `Netlify-CDN-Cache-Control`, `Cache-Tag`, and `Netlify-Vary: query=` on `/llms.mdx/*`, `/llms.txt`, `/llms-full.txt`, and public `/docs/*`; browser `Cache-Control: public, max-age=0, must-revalidate` unchanged. Freshness: atomic deploy invalidation (see R5).                                                                                                                            | P0                  | Low    | High   |
| R2  | **Status**: RESOLVED — `[[headers]]` in `netlify.toml` + `netlify.prod.toml` for `/assets/*` (immutable year TTL + durable CDN), `/fonts/*`, and `/*.svg`.                                                                                                                                                                                                                                                           | P0                  | Low    | High   |
| R3  | **Status**: RESOLVED — Removed blocking `getModels()` from `apps/ui/app/root.tsx`; models load via client `useQuery` in `use-models.tsx`.                                                                                                                                                                                                                                                                            | P0                  | Low    | High   |
| R4  | **Status**: RESOLVED — `prerender()` lists `/manifest.webmanifest`, `/robots.txt`, `/llms.txt`, `/llms-full.txt`, `/docs/*` (from `content/docs` filesystem walk), and `/legal/*`. **`/llms.mdx/*` omitted** (static output would `EISDIR` under `build/client/llms.mdx/`); those URLs use R1 at SSR. Walk avoids importing `fumadocs-mdx:collections/server` in the prerender context.                              | P0                  | Med    | High   |
| R5  | **Status**: NOT NEEDED — For our deploy-driven workflow (`taucad.dev` / `tau.new`), Netlify automatically invalidates cached responses for the deploy context on every atomic deploy; explicit `purgeCache` adds no benefit unless we opt out via `Netlify-Cache-ID` or need CDN refresh without a deploy (CMS webhooks, etc.). Keep `Cache-Tag` on responses (R1) for future on-demand purge if that model appears. | ~~P0~~ (not needed) | —      | —      |
| R6  | Convert the PostHog `/api/ph/*` proxy to a Netlify Edge Function (Deno runtime) or to two `[[redirects]]` rules in `netlify.toml` (`/api/ph/static/* → us-assets.i.posthog.com/:splat`, `/api/ph/* → us.i.posthog.com/:splat`). Removes Lambda dispatch per analytics ping.                                                                                                                                          | P1                  | Med    | High   |
| R7  | Restrict `Netlify-Vary: query` per route. Static-output routes should set `Netlify-Vary: query=` (empty allowlist) so UTM/PostHog params don't shatter cache. Use `Netlify-Vary: query=theme` for routes that legitimately vary on a known key.                                                                                                                                                                      | P1                  | Low    | Med    |
| R8  | **Status**: DEFERRED (architecture decision) — document single-region `us-east-2` + CDN cache mitigation; revisit Edge Functions or geo-routed Netlify sites only if cache-miss TTFB remains unacceptable. See [`docs/architecture/netlify-multi-region-functions.md`](../architecture/netlify-multi-region-functions.md).                                                                                           | ~~P1~~              | —      | —      |
| R9  | Audit the 22 MB SSR bundle for client-only code paths (Three.js, kernels, runtime) that crept in via co-location with route components. Target 10 MB. Also push back against the 50 MB Functions limit ceiling tracked in [`netlify-ui-deployment-strategy.md`](netlify-ui-deployment-strategy.md) Risk 3.                                                                                                           | P1                  | High   | Med    |
| R10 | Add `Cache-Control: public, max-age=86400` and `Netlify-CDN-Cache-Control: public, durable, s-maxage=604800` for `/api/github-avatar` (currently only sets browser cache, no CDN cache) and `manifest.webmanifest`.                                                                                                                                                                                                  | P2                  | Low    | Med    |
| R11 | Add synthetic monitoring (PostHog Web Vitals already wired; add Datadog Synthetics or Netlify RUM) tracking p50/p95/p99 TTFB by region. Set SLO of p95 TTFB <300 ms before declaring R1–R4 done.                                                                                                                                                                                                                     | P2                  | Med    | Med    |
| R12 | Audit `apps/ui/build/server/index.js` 3.3 MB main entry — likely dominated by `entry.server.tsx` + `root.tsx` + `react-dom/server`. Tree-shake aggressive imports.                                                                                                                                                                                                                                                   | P2                  | Med    | Low    |
| R13 | Document the new caching contract in `docs/architecture/ui-deployment-topology.md` "Cache Strategy" section so contributors don't accidentally regress `Cache-Control` headers in route handlers. Cross-link from `netlify.toml` header comment.                                                                                                                                                                     | P2                  | Low    | Med    |
| R14 | Investigate dropping the `/assets/$/route.tsx` SSR catch-all once R2 lands and stale-asset 404s are returned by Netlify directly (currently the SSR Function answers them, polluting function invocation counts).                                                                                                                                                                                                    | P3                  | Low    | Low    |
| R15 | Long-horizon: evaluate splitting the docs surface (`/docs/*`, `/llms.*`) onto its own static-output sub-deploy (e.g. `docs.tau.new` → Cloudflare Pages or Netlify Edge) decoupled from the app SSR. The Fumadocs reference shows this stack lands at ~110 ms TTFB when treated as a static-output deployment.                                                                                                        | P3                  | High   | Med    |

Note: `purgeCache` is needed only for non-deploy invalidation (CMS webhooks, manual content updates between deploys, or objects opted out of automatic invalidation via `Netlify-Cache-ID`). Tau UI ships content changes through code deploy; Netlify's atomic deploy invalidation suffices for cache freshness.

### Suggested Execution Order

1. **R3** (drop SSR `getModels`) — single-file change in `root.tsx`, biggest immediate TTFB win, no infra dependencies. Validate with curl before/after on `/llms.mdx/...`.
2. **R2** (asset cache headers) — `netlify.toml`/`netlify.prod.toml` `[[headers]]` block additions. Zero risk; deploys instantly.
3. **R1** + **R7** (CDN cache + `Cache-Tag` + per-route `Netlify-Vary`) — coordinated change across route handlers. No deploy-time `purgeCache` required: atomic deploys invalidate the prior deploy context automatically (see R5 row).
4. **R4** (re-enable prerender) — once R3 lands so the root loader doesn't pull a runtime API, prerender `/llms.txt`, `/llms-full.txt`, `/docs/*`, `/legal/*`. Skip `/llms.mdx/*` static prerender (path collision / `EISDIR` under `build/client/llms.mdx/`); keep R1 cache headers for those SSR routes.
5. **R6** (PostHog edge proxy) — rewrites are simplest; Edge Function gives more control. Pick rewrites first, escalate if env-var injection becomes necessary.
6. **R10**, **R13** (cleanup, docs).
7. **R9** (bundle audit; continued trimming) — **`pnpm nx run ui:size`** after `ui:build` keeps the Function artifact bounded.
8. **R11** (monitoring) — wire before R1–R4 so we have before/after numbers.

### Projected Impact (after R1–R4)

| Endpoint                             | Current TTFB           | Projected TTFB             | Mechanism                                                                |
| ------------------------------------ | ---------------------- | -------------------------- | ------------------------------------------------------------------------ |
| `/llms.txt`                          | ~360 ms                | <50 ms                     | Pre-rendered static + edge cache                                         |
| `/llms.mdx/*`                        | 363 ms                 | <80 ms warm / <300 ms cold | Durable cache hit (R1); not static-prerendered (R4 — see R4 row)         |
| `/docs/*` (HTML SSR)                 | 813 ms                 | <200 ms warm               | Static prerender shell (R4) + Durable cache (R1) + drop `getModels` (R3) |
| `/` (homepage)                       | 929 ms                 | <300 ms warm               | Drop `getModels` + Durable cache (short TTL)                             |
| `/api/ph/*`                          | ~575 ms                | <100 ms                    | Edge proxy / rewrite                                                     |
| `/assets/*.wasm` (subsequent visits) | revalidate every visit | served from disk (browser) | `immutable` cache header                                                 |

This brings p95 TTFB into the 100–200 ms band and removes the 22 MB WASM revalidation entirely on warm clients.

### Verification (implementation landed 2026-05-06, deploy `nain@375e232`)

Live diagnostics against `taucad.dev` immediately after the Netlify deploy completed (deploy summary: 1768 files uploaded, 39 generated pages, 4 header rules processed, 1 SSR Function deployed, build 2 m 25 s, total 2 m 29 s).

#### Headers (post-deploy)

| Endpoint                                         | `cache-status`                                                     | `cache-control` (browser)           | `cache-tag`              | `netlify-vary` | Verdict                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------- | ------------------------ | -------------- | ------------------------------------------------------------------------------- |
| `/llms.txt` (warm)                               | `Netlify Edge; hit`                                                | `public,max-age=0,must-revalidate`  | _(absent — prerendered)_ | _(absent)_     | R4 confirmed; R1 headers do not apply (route never SSRs)                        |
| `/llms.mdx/runtime/.../your-first-kernel` (cold) | `Netlify Durable; fwd=uri-miss; stored` + `Netlify Edge; fwd=miss` | `public,max-age=0,must-revalidate`  | `llms-mdx, docs`         | `query=`       | R1 confirmed — first request stored in Durable cache                            |
| `/llms.mdx/...` (warm)                           | `Netlify Edge; hit`, `age: 19`                                     | same                                | `llms-mdx, docs`         | `query=`       | R1 cache hit on edge                                                            |
| `/docs/runtime/` (prerendered)                   | `Netlify Edge; hit`, `age: 38`                                     | `public,max-age=0,must-revalidate`  | _(absent)_               | _(absent)_     | R4 confirmed; **R1 `Cache-Tag: docs` is silently dropped** (see Outstanding §1) |
| `/legal/terms/` (prerendered)                    | `Netlify Edge; fwd=miss` then 200                                  | same                                | _(absent)_               | _(absent)_     | R4 confirmed                                                                    |
| `/assets/entry.client-Csbue8tM.js`               | `Netlify Edge; fwd=miss` (first hit)                               | `public,max-age=31536000,immutable` | _(absent)_               | _(absent)_     | R2 confirmed                                                                    |

#### TTFB matrix (5-shot per endpoint, Sydney POP, post-deploy)

| Endpoint                                              | Shot 1                      | Shot 2–5 (warm) | Baseline      | Δ                                                                                                 |
| ----------------------------------------------------- | --------------------------- | --------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| `/`                                                   | **24.84 s** (cold function) | 0.38 – 0.47 s   | 0.93 s        | warm **‑41% / -49%**; cold = R9 outstanding                                                       |
| `/docs/runtime/getting-started/your-first-kernel`     | 0.55 s                      | 0.30 – 0.50 s   | 0.81 s        | **‑41% to ‑63%** (note: 301 → trailing-slash before serving prerendered HTML, see Outstanding §2) |
| `/llms.txt`                                           | 0.10 s                      | 0.10 s flat     | ~0.36 s       | **‑71%**                                                                                          |
| `/llms.mdx/runtime/getting-started/your-first-kernel` | 0.11 s                      | 0.10 – 0.11 s   | 0.36 – 0.66 s | **‑71% to ‑85%**                                                                                  |

R1, R2, R3, R4 are all behaving as designed on the wire. The two newly-surfaced issues are scoped below.

### Outstanding Issues

#### 1. Prerendered HTML drops `Cache-Tag` and `Netlify-Vary` (R1 + R4 interaction)

**Severity**: P3 — does not affect TTFB, only future tag-purge granularity.

The `headers()` export in `apps/ui/app/routes/docs.$/route.tsx` and the `Response` headers in `llms[.]txt/route.ts` only run when the route SSRs. Once R4 prerenders these URLs to `build/client/docs/**/index.html` and `build/client/llms.txt`, Netlify serves the static file directly — the React Router `headers()` function never executes, and `Cache-Tag` / `Netlify-Vary` are absent on the wire.

This does not affect cache freshness (Netlify atomic deploys still invalidate prior-deploy contents, see R5) or TTFB (edge cache is doing its job — `Netlify Edge; hit` confirmed). It only matters if/when we add a non-deploy-driven invalidation path (CMS webhooks, on-demand purge by tag). When that need arises, attach `Cache-Tag = "docs"` etc. via `[[headers]]` blocks in `netlify.toml` keyed on the URL globs (`for = "/docs/*"`, `for = "/llms.txt"`); those run for static files too.

#### 2. `/docs/<page>` (no trailing slash) returns 301 → `/docs/<page>/`

**Severity**: P3 — adds ~300 ms to first navigation that omits the trailing slash; subsequent HTML hits are warm (104 ms class).

React Router prerender writes `build/client/docs/<segments>/index.html`. Netlify's static server canonicalises the directory form by 301-redirecting `/docs/foo` → `/docs/foo/`. The 301 itself is `cache-status: "Netlify Edge"; fwd=miss` (uncached) so Netlify currently re-emits it from the function path, then the second hop serves the prerendered HTML in ~104 ms.

Mitigations (any one is sufficient):

1. Emit canonical `/docs/foo/` URLs everywhere in nav and Fumadocs link rewriting (preferred; eliminates the 301 entirely for in-app navigation).
2. Add `[[redirects]]` rules in `netlify.toml` with `force = true` and `status = 308` so the redirect itself is edge-cached (Netlify treats `[[redirects]]` as edge rules).
3. Configure React Router `prerender` to also emit `/docs/<page>` files (would duplicate every doc on disk; not worth it).

#### 3. SSR Function cold start ≈ 25 s on `/`

**Severity**: P0 (long-standing) — this is Finding 4 / R9, not introduced by R1–R4.

Shot 1 of the homepage TTFB matrix landed at **24.84 s**. Subsequent warm shots return in 0.38 – 0.47 s. The **22 MB** SSR Function bundle in `us-east-2` was the primary suspect. **Update (2026-05-06):** the packaged server directory is now **~10 MB** locally after sourcemap removal, `ssr.external`, and lazy kernel-options loading — re-measure cold TTFB after deploy. **`cdnBackedSsrRouteHeaders`** is now applied to **`/`** (short TTL) and **`/v/$id`** (long TTL) so warm HTML can amortise SSR cost at the edge.

- **R1-extension**: **Landed** — homepage + publication viewer use `cacheTag.homepage` / `cacheTag.publicationViewer` with `ttl: 'short' | 'long'` (see `apps/ui/app/lib/react-router.lib.ts`). Post-deploy verification: second-shot `cache-status: Netlify Edge; hit`, `Netlify-Vary: query=`.
- **R8**: **Resolved (decision)** — single-region documented; see [`netlify-multi-region-functions.md`](../architecture/netlify-multi-region-functions.md).
- **R9**: **In progress** — bundle reduced ~55% vs original audit; viewer lazy shells landed per [`ssr-bundle-audit.md`](ssr-bundle-audit.md); **≤5 MB** stretch still blocked by other server graph imports.

#### 4. `TS18047 — 'mesh' is possibly 'null'` in `packages/runtime/src/kernels/opencascade/opencascade-mesh.ts`

**Severity**: P3 — pre-existing; surfaced repeatedly during the R1–R4 verify pass (`pnpm nx typecheck ui` failure root in the OCCT kernel, not in `apps/ui`). Tracked separately; not blocking the Netlify perf workstream.

#### 5. R6 (PostHog `/api/ph/*` edge proxy) deferred; R7-wide `Netlify-Vary` expanded

The R1 helper (`cdnBackedSsrRouteHeaders` in `apps/ui/app/lib/react-router.lib.ts`) emits `Netlify-Vary: query=` on covered routes. **Update:** homepage `/` and publication viewer `/v/$id` are now included alongside the earlier docs/llms routes. R6 remains deferred.

## Trade-offs

### Durable Cache vs. Pre-render

| Dimension              | Netlify Durable Cache (R1)                         | React Router Prerender (R4)                                                         |
| ---------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Origin work per deploy | First request after deploy still hits SSR          | Zero — all work at build time                                                       |
| Cold start             | First miss after purge: full SSR cost (200–600 ms) | None — static file                                                                  |
| Build time             | No change                                          | Adds N seconds per pre-rendered page                                                |
| Cache invalidation     | Tag-purge API call on deploy                       | Implicit on deploy (asset hash change)                                              |
| Suitable for           | Any SSR route with <1 hr update cadence            | Truly static content (docs, llms.\*)                                                |
| Existing constraint    | Needs `Netlify-CDN-Cache-Control` header per route | Page list in `apps/ui/react-router.config.ts` (omit `/llms.mdx/*` — path collision) |

Both should be used: pre-render where possible (R4), Durable Cache for everything else (R1).

### Edge Functions vs. Multi-Region Lambda

| Dimension               | Netlify Edge Functions (Deno)                            | Multi-Region Lambda           |
| ----------------------- | -------------------------------------------------------- | ----------------------------- |
| Cold start              | <50 ms                                                   | 200 ms+ for our 22 MB bundle  |
| Runtime                 | Deno (V8 isolate)                                        | Node.js                       |
| Plan                    | Free tier                                                | Pro+ for multi-region         |
| Compatibility           | Requires Deno-compatible bundle (no native Node modules) | Drop-in for current SSR entry |
| Geographic distribution | All Netlify POPs                                         | Configured regions            |
| Best for                | Lightweight SSR, proxies, geo-routing                    | Heavy SSR with Node-only deps |

Recommendation: keep the SSR runtime on Lambda (multi-region as soon as plan allows) and migrate the proxy routes (`/api/ph`, `/api/github-avatar`, future `/api/cdn-passthrough`) to Edge Functions.

### Browser `Cache-Control` vs. CDN `Netlify-CDN-Cache-Control`

These are independent. The recommended pattern:

```
Cache-Control: public, max-age=0, must-revalidate
Netlify-CDN-Cache-Control: public, durable, s-maxage=86400, stale-while-revalidate=604800
Cache-Tag: docs, llms-mdx
```

- Browser revalidates on every visit (sees fresh content immediately after deploy).
- Netlify edge serves from cache for 24 h, with 7-day stale-while-revalidate fallback.
- On each new deploy, Netlify automatically invalidates cached objects for that deploy context (atomic deploys); `purgeCache` by tag is optional for on-demand refresh without a deploy (see R5 row).

This is the same pattern Vercel applies via its `s-maxage` / `stale-while-revalidate` automatic handling — the difference is Netlify requires explicit opt-in via `Netlify-CDN-Cache-Control`.

## Code Examples

### R1 + R3 + R7 in a route handler

```ts
// apps/ui/app/routes/llms[.]mdx.$/route.tsx (proposed)
import type { Route } from './+types/route.js';
import { source } from '#lib/fumadocs/source.js';
import { getLlmText } from '#lib/fumadocs/get-llms-text.js';

export async function loader({ params }: Route.LoaderArgs) {
  const slugs = params['*'].split('/').filter((v) => v.length > 0);
  const page = source.getPage(slugs);
  if (!page) {
    throw new Response('Not found', { status: 404 });
  }

  const rawMarkdownContent = await getLlmText(page);

  return new Response(rawMarkdownContent, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=86400, stale-while-revalidate=604800',
      'Cache-Tag': 'llms-mdx, docs',
      'Netlify-Vary': 'query=',
    },
  });
}
```

### R2 in `netlify.toml` and `netlify.prod.toml`

```toml
# Hashed/immutable assets (Vite content-hashed bundles)
[[headers]]
for = "/assets/*"
[headers.values]
Cache-Control = "public, max-age=31536000, immutable"
Netlify-CDN-Cache-Control = "public, durable, max-age=31536000"

# Non-hashed client root files (fonts, draco wasm, robot.glb, etc.)
[[headers]]
for = "/fonts/*"
[headers.values]
Cache-Control = "public, max-age=2592000"
Netlify-CDN-Cache-Control = "public, durable, max-age=2592000"
```

### R3 in `apps/ui/app/root.tsx`

```ts
// Drop the SSR fetch entirely — useModels hook already fetches client-side via useQuery.
export async function loader({ request }: LoaderFunctionArgs) {
  throwRedirectIfSubdomain(request, 'www');
  const { getTheme } = await themeSessionResolver(request);
  return {
    theme: getTheme(),
    cookie: request.headers.get('Cookie') ?? '',
    env: await getEnvironment(),
    // models: removed — useModels() refetches via useQuery on mount.
  };
}
```

### R5 — `purgeCache` not required for Tau UI deploys

Recommendation R5 originally suggested calling Netlify's `purgeCache` API after deploy so long-lived CDN cache entries refresh. That is redundant for this repo: Netlify [automatically invalidates the cache for the deploy context on every atomic deploy](https://docs.netlify.com/platform/caching/), using an internal cache ID so cached objects from the previous deploy are not served after a new deploy goes live:

> To support atomic deploys, all new deploys invalidate the cache for the given deploy context by default. [...] This override guarantees that we never accidentally serve stale content.

Use `Cache-Tag` + `purgeCache` only if we later add content that changes without a deploy, use custom `Netlify-Cache-ID` (opt-out of automatic invalidation), or need to purge specific tags without redeploying.

## Diagrams

### Current SSR Request Flow (uncached, all routes)

```
Browser (Sydney)
    │ HTTP GET /llms.mdx/...
    ▼
Netlify Edge POP (Sydney)
    │ cache lookup: fwd=miss
    │ Cache-Control: no-cache from origin
    ▼
Netlify Lambda (us-east-2)
    │ ~200ms trans-Pacific RTT
    ▼
SSR Function (22 MB bundle)
    │ root loader: fetch api.taucad.dev/v1/models  ─┐
    │                                                │ ~341ms
    │                                                │
    ▼ root loader resolves                          ◄┘
    │ route loader: getLlmText(page) ~5ms
    │ renderToPipeableStream
    │
    ▼ response (Cache-Control: no-cache)
Netlify Edge POP (no cache write)
    │
    ▼ ~200ms trans-Pacific RTT
Browser
    Total TTFB: ~363-731ms
```

### Target Request Flow (R1 + R3 + R4 applied)

```
Browser (Sydney)
    │ HTTP GET /llms.mdx/runtime/getting-started/your-first-kernel
    ▼
Netlify Edge POP (Sydney)
    │ cache lookup: HIT (Durable Cache, tagged "llms-mdx")
    │
    ▼ response from edge
Browser
    Total TTFB: ~50-80ms

(On deploy: Netlify atomic deploy invalidates the prior deploy context's cached
 responses; first request after deploy repopulates Durable cache from origin,
 subsequent requests hit edge again.)
```

## References

- [Netlify Cache Control documentation](https://docs.netlify.com/platform/caching/) — `Netlify-CDN-Cache-Control`, `Cache-Tag`, `purgeCache`, Durable Cache semantics
- [Netlify Edge Functions](https://docs.netlify.com/edge-functions/overview/) — Deno runtime, geographic distribution
- [React Router v7 caching guide](https://reactrouter.com/start/framework/route-module#headers) — `headers` export and Cache-Control patterns
- [Fumadocs MDX postprocess](https://fumadocs.dev/docs/mdx/include) — `includeProcessedMarkdown` semantics
- Related: [`docs/research/netlify-ui-deployment-strategy.md`](netlify-ui-deployment-strategy.md) — Risk 3 (SSR bundle size), §Current Landscape (region info)
- Related: [`docs/research/homepage-time-to-interactive-analysis.md`](homepage-time-to-interactive-analysis.md) — client-side TTI decomposition
- Related: [`docs/architecture/ui-deployment-topology.md`](../architecture/ui-deployment-topology.md) — Netlify site topology

## Appendix

### A. Raw `curl` measurements (2026-05-06, Sydney POP)

#### A.1 Post-deploy verification (2026-05-06, after `nain@375e232`)

```text
=== /llms.txt (warm, prerendered) ===
HTTP/2 200
age: 0
cache-control: public,max-age=0,must-revalidate
cache-status: "Netlify Edge"; hit
content-type: text/plain; charset=UTF-8

=== /llms.mdx/runtime/getting-started/your-first-kernel (cold, SSR + Durable) ===
HTTP/2 200
age: 0
cache-control: public,max-age=0,must-revalidate
cache-status: "Netlify Durable"; fwd=uri-miss; stored
cache-status: "Netlify Edge"; fwd=miss
cache-tag: llms-mdx, docs
netlify-vary: query=

=== /llms.mdx/... (warm, second hit ~19s later) ===
HTTP/2 200
age: 19
cache-control: public,max-age=0,must-revalidate
cache-status: "Netlify Edge"; hit
cache-tag: llms-mdx, docs
netlify-vary: query=

=== /docs/runtime/ (prerendered HTML, R1 headers NOT in flight) ===
HTTP/2 200
age: 38
cache-control: public,max-age=0,must-revalidate
cache-status: "Netlify Edge"; hit
content-type: text/html; charset=UTF-8

=== /docs/runtime/getting-started/your-first-kernel (no trailing slash → 301) ===
HTTP/2 301
cache-status: "Netlify Edge"; fwd=miss
location: /docs/runtime/getting-started/your-first-kernel/

=== /assets/entry.client-Csbue8tM.js (R2 immutable) ===
HTTP/2 200
age: 0
cache-control: public,max-age=31536000,immutable
cache-status: "Netlify Edge"; fwd=miss
content-length: 179813

=== TTFB 5-shot per endpoint (post-deploy) ===
--- https://taucad.dev/
shot=200 ttfb=24.842s total=24.943s size=187777B   # cold function
shot=200 ttfb=0.448s total=0.544s size=187777B
shot=200 ttfb=0.430s total=0.531s size=187777B
shot=200 ttfb=0.379s total=0.481s size=187777B
shot=200 ttfb=0.472s total=0.493s size=187777B
--- https://taucad.dev/docs/runtime/getting-started/your-first-kernel
shot=301 ttfb=0.546s total=0.546s size=98B   # 301 to trailing-slash form
shot=301 ttfb=0.302s total=0.302s size=98B
shot=301 ttfb=0.302s total=0.302s size=98B
shot=301 ttfb=0.494s total=0.494s size=98B
shot=301 ttfb=0.496s total=0.496s size=98B
--- https://taucad.dev/llms.txt
shot=200 ttfb=0.104s total=0.105s size=5622B
shot=200 ttfb=0.106s total=0.106s size=5622B
shot=200 ttfb=0.105s total=0.106s size=5622B
shot=200 ttfb=0.100s total=0.100s size=5622B
shot=200 ttfb=0.105s total=0.105s size=5622B
--- https://taucad.dev/llms.mdx/runtime/getting-started/your-first-kernel
shot=200 ttfb=0.108s total=0.132s size=7819B
shot=200 ttfb=0.101s total=0.126s size=7819B
shot=200 ttfb=0.105s total=0.129s size=7819B
shot=200 ttfb=0.104s total=0.127s size=7819B
shot=200 ttfb=0.101s total=0.123s size=7819B
```

#### A.2 Pre-deploy baseline (2026-05-06, before R1–R4)

```text
=== /llms.mdx/... (cold) ===
Status: 200
Total: 0.657592s
DNS: 0.009947s
Connect: 0.017875s
SSL: 0.080152s
TTFB: 0.656735s
Size: 7819 bytes
Headers:
  cache-control: no-cache
  cache-status: "Netlify Durable"; fwd=bypass
  cache-status: "Netlify Edge"; fwd=miss
  netlify-vary: query
  server: Netlify

=== / (homepage) ===
Total: 1.031366s | TTFB: 0.929451s | Size: 191904
  cache-control: no-cache
  cache-status: "Netlify Durable"; fwd=bypass
  cache-status: "Netlify Edge"; fwd=miss

=== /docs/runtime/getting-started/your-first-kernel ===
Total: 0.918922s | TTFB: 0.813625s | Size: 340730
  cache-control: no-cache
  cache-status: "Netlify Durable"; fwd=bypass
  cache-status: "Netlify Edge"; fwd=miss

=== /assets/replicad_single-OoZvnbu3.wasm ===
HTTP/2 200
  cache-control: public,max-age=0,must-revalidate
  cache-status: "Netlify Edge"; fwd=miss
  content-length: 22721704

=== /favicon.ico ===
Total: 0.435056s | TTFB: 0.411849s | Size: 15086
  cache-control: public,max-age=0,must-revalidate
  cache-status: "Netlify Edge"; fwd=miss

=== api.taucad.dev/v1/models (direct) ===
TTFB: 0.341492s | Total: 0.343299s

=== docs.fumadocs.dev/ (reference) ===
avg TTFB: 0.172s
=== docs.fumadocs.dev/docs/ui/markdown ===
TTFB: 0.110s

=== TTFB 5-shot stability on /llms.mdx/runtime/getting-started/your-first-kernel ===
iter 1: 0.377s
iter 2: 0.369s
iter 3: 0.371s
iter 4: 0.379s
iter 5: 0.360s
```

### B. SSR root loader chain inventory

| Step                            | Source                                | Cost                                                    |
| ------------------------------- | ------------------------------------- | ------------------------------------------------------- |
| `throwRedirectIfSubdomain`      | `apps/ui/app/lib/react-router.lib.ts` | <1 ms                                                   |
| `themeSessionResolver(request)` | `apps/ui/app/sessions.ts`             | ~5 ms (cookie parse)                                    |
| `getEnvironment()`              | `apps/ui/app/environment.config.ts`   | ~5 ms (Zod safeParse on `process.env`)                  |
| `getModels()`                   | `apps/ui/app/hooks/use-models.tsx`    | **~341 ms** (HTTPS fetch to `api.taucad.dev/v1/models`) |

The `getModels()` step dominates everything else combined.

### C. Routes that should be pre-rendered (R4)

| Route                        | Static?                  | Notes                                                      |
| ---------------------------- | ------------------------ | ---------------------------------------------------------- |
| `/llms.txt`                  | Yes                      | Currently in original TODO                                 |
| `/llms-full.txt`             | Yes                      | Currently in original TODO                                 |
| `/manifest.webmanifest`      | Yes                      | Currently in original TODO                                 |
| `/robots.txt`                | Yes                      | Currently in original TODO                                 |
| `/llms.mdx/<all docs paths>` | Yes (per-page)           | Iterate `source.getPages()` to enumerate                   |
| `/docs/<all docs paths>`     | Yes (per-page, after R3) | Same enumeration; depends on R3 to avoid `getModels` block |
| `/legal/*`                   | Yes                      | Static legal text                                          |
| `/` (homepage)               | No                       | Hero/dynamic content; use Durable Cache instead            |
| `/projects/*`                | No                       | Auth-gated, per-user                                       |
| `/v/*` (publication viewer)  | No                       | Per-publication, served from R2/Postgres                   |

### D. Files referenced in this audit

- `apps/ui/netlify.toml` — staging Netlify config (no cache headers)
- `apps/ui/netlify.prod.toml` — production Netlify config (no cache headers)
- `apps/ui/react-router.config.ts` — pre-render disabled
- `apps/ui/vite.config.ts` — Netlify plugin wiring
- `apps/ui/app/root.tsx` — root loader with `getModels()` blocking fetch
- `apps/ui/app/hooks/use-models.tsx` — `getModels` implementation
- `apps/ui/app/routes/llms[.]mdx.$/route.tsx` — MDX text route
- `apps/ui/app/routes/llms[.]txt/route.ts` — site index route
- `apps/ui/app/routes/llms-full[.]txt/route.ts` — full corpus route
- `apps/ui/app/routes/docs.$/route.tsx` — docs HTML SSR route
- `apps/ui/app/routes/api.ph.$/route.ts` — PostHog proxy
- `apps/ui/app/routes/api.github-avatar/route.ts` — GitHub avatar proxy (only route with proper cache headers today)
- `apps/ui/server.ts` — local Express server with reference asset cache config (`immutable: true, maxAge: '1y'`)
- `apps/ui/app/entry.server.tsx` — SSR entry; uses `renderToPipeableStream` (already streaming, good)
- `repos/tau-cloud/stacks/cloud/prod-us/terraform.auto.tfvars` — production env-var declaration
- `repos/tau-cloud/modules/netlify-site/main.tf` — Netlify site Terraform module
