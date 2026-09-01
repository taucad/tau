---
title: 'React Router 7 Production Readiness Audit (May 2026)'
description: 'Audit of apps/ui React Router 7.14 + React 19.2 surface against May 2026 best practices: data loading, streaming, code splitting, prefetch, SEO, web vitals, monitoring, infra. Pairs with the Netlify perf audit.'
status: draft
created: '2026-05-06'
updated: '2026-05-06'
category: audit
related:
  - docs/research/netlify-production-performance-audit.md
  - docs/research/netlify-ui-deployment-strategy.md
  - docs/architecture/ui-deployment-topology.md
  - docs/research/homepage-time-to-interactive-analysis.md
---

# React Router 7 Production Readiness Audit (May 2026)

Systematic review of the `apps/ui` React Router 7.14.2 + React 19.2.4 surface against canonical May 2026 best practices, covering every framework capability the app does **and** does not exercise. Pairs the framework-level findings with the infrastructure findings already documented in [`netlify-production-performance-audit.md`](netlify-production-performance-audit.md) so the production cutover plan addresses both layers.

## Executive Summary

The app runs a current React Router 7.14.2 + React 19.2.4 + Vite 8.0.10 stack on Netlify with a custom Express server (`apps/ui/server.ts`) for local serve and the `@netlify/vite-plugin-react-router@3.1.1` adapter for SSR Functions. Foundations are solid: `StrictMode` + `startTransition` hydration, `isbot` agent detection for full-stream-on-crawl, self-hosted variable fonts with `font-display: swap` + `<link rel="preload">`, COOP/COEP/CORP wired correctly, and a strict CSP in report-only mode.

But the app is leaving most of React Router 7's production-grade levers on the table:

- **Zero `headers` exports across 44 routes** — the canonical RR7 cache-control mechanism is unused, which is the framework half of the cache bypass diagnosed in [`netlify-production-performance-audit.md`](netlify-production-performance-audit.md) Finding 1.
- **Zero `shouldRevalidate` exports** — the root loader (which fires the 341 ms blocking `getModels()` fetch) re-runs on every client-side navigation as well as every SSR request.
- **2 `Link prefetch=` instances** across the entire app (both in `docs-sidebar.tsx`) — RR7's flagship pre-warming UX feature is effectively disabled.
- **3 `meta` exports across 44 routes** — only `/v/:id`, `/docs/*`, and `/import/*` declare per-route SEO metadata. No JSON-LD anywhere. No sitemap.xml. The catch-all 404 route returns **HTTP 200**.
- **Zero `web-vitals` package usage** — INP/LCP/CLS are not being measured anywhere in the codebase. PostHog autocapture provides only coarse pageview timing.
- **No clientLoader / Suspense streaming patterns** — every route fully blocks SSR on its loader chain even though several loaders are non-critical (model list, theme cookie, env).
- **171 `<link rel="modulepreload">` tags in the homepage HTML head** — far above the ~10–20 the framework intends; saturates the browser request queue and blocks the main thread on JS parse before LCP.
- **No `manualChunks` or `serverBundles` configuration** — vendor splitting is left at Vite defaults, which produced the 22 MB SSR bundle and 290 MB client output documented in the Netlify perf audit.
- **No Sentry / structured error reporting** — error boundaries call `analytics.captureException` (PostHog), which is fine for triage but lacks source-map symbolication, release tracking, and replay correlation.

Each finding is independently addressable. The top three (R1–R3) are single-file changes that compound with the Netlify cache work to bring TTFB into the 100–200 ms band and Core Web Vitals into the green.

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Methodology](#methodology)
3. [Stack Inventory](#stack-inventory)
4. [Findings — Routing & Data](#findings--routing--data)
5. [Findings — Streaming, Suspense, React 19](#findings--streaming-suspense-react-19)
6. [Findings — Code Splitting & Bundle Topology](#findings--code-splitting--bundle-topology)
7. [Findings — SEO & Crawlability](#findings--seo--crawlability)
8. [Findings — Web Vitals & Monitoring](#findings--web-vitals--monitoring)
9. [Findings — Hydration & Asset Pipeline](#findings--hydration--asset-pipeline)
10. [Findings — Security & Cross-Origin](#findings--security--cross-origin)
11. [Findings — Production Operations](#findings--production-operations)
12. [Recommendations](#recommendations)
13. [Trade-offs](#trade-offs)
14. [Code Examples](#code-examples)
15. [References](#references)
16. [Appendix](#appendix)

## Problem Statement

The Netlify production perf audit ([`netlify-production-performance-audit.md`](netlify-production-performance-audit.md)) quantified a 4.2× TTFB gap to a Vercel-hosted Fumadocs reference and identified five infrastructure-layer root causes (cache bypass, blocking root loader, single-region SSR, 22 MB function bundle, asset cache miss). Before the production cutover to `tau.new`, we need a parallel audit at the **framework layer** — what React Router 7 + React 19 best practices we are or aren't applying — so the eventual fix list addresses both layers as one coherent rollout instead of two separate tickets.

This audit answers: of the framework capabilities and idioms documented as canonical for React Router 7 in May 2026, which is `apps/ui` using, which is it missing, and what is the impact?

### Scope and Non-Goals

**In scope**: Route module surface (`loader`, `action`, `headers`, `links`, `meta`, `shouldRevalidate`, `clientLoader`, `clientAction`, `HydrateFallback`), data flow patterns (single-fetch, deferred promises, Suspense, `React.use`), code splitting (Vite `manualChunks`, RR7 `serverBundles`), prefetching strategies, SEO surface (meta tags, structured data, sitemap, status codes), Web Vitals instrumentation, error reporting, security headers, hydration safety.

**Out of scope**: API performance (`api.tau.new`), DNS / Cloudflare migration, bundle size analysis at the dependency level (separate workstream), accessibility audit (separate `accessibility-policy.md`), CAD viewer / runtime perf (separate runtime topology research).

## Methodology

| Source                                                                                                                                  | Inspection                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm-workspace.yaml` catalog block                                                                                                     | Pinned framework versions                                                                                                                                                |
| `apps/ui/{package.json, vite.config.ts, react-router.config.ts, server.ts, app/entry.{client,server}.tsx, app/root.tsx, app/routes.ts}` | Stack contract and entry points                                                                                                                                          |
| `apps/ui/app/routes/**/*.{ts,tsx}` (44 routes)                                                                                          | Per-route loader/action/header/meta/links exports + Suspense usage                                                                                                       |
| Workspace `rg` queries                                                                                                                  | Counts of `headers`, `shouldRevalidate`, `prefetch=`, `meta`, `Suspense`, `Await`, `use(`, `web-vitals`, `@sentry`, `og:image`, `JSON-LD`, `clientLoader`                |
| Live `curl -D -` against `taucad.dev`                                                                                                   | Status codes, head structure, served HTML head tag inventory                                                                                                             |
| Web research May 2026                                                                                                                   | React Router 7.10–7.14 release notes, React 19.2 SSR changes, Vite 7/8 chunking guidance, Sentry RR7 SDK status, Netlify Image CDN docs, Core Web Vitals 2026 thresholds |

Findings are evidence-based: every claim cites a count from a workspace query, a curl trace, a file path, or a documented framework behavior.

## Stack Inventory

| Layer                                                                                            | Pinned version                                                  | Notes                                                                                                                      |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `react`                                                                                          | 19.2.4                                                          | React 19.2 SSR Web Streams, batched Suspense, async transitions all available                                              |
| `react-dom`                                                                                      | 19.2.4                                                          | Renders via `renderToPipeableStream` already (good)                                                                        |
| `react-router`                                                                                   | 7.14.2                                                          | Includes Split Route Modules (7.10), Vite 7 support (7.13), `singleFetchAction` `skipRevalidation` middleware fix (7.13.5) |
| `@react-router/dev` / `@react-router/express` / `@react-router/node` / `@react-router/fs-routes` | 7.14.2                                                          | All aligned                                                                                                                |
| `@netlify/vite-plugin-react-router`                                                              | 3.1.1                                                           | SSR Function bundling for Netlify deploy                                                                                   |
| `vite`                                                                                           | 8.0.10                                                          | `manualChunks` available; `splitVendorChunkPlugin` removed in v7+                                                          |
| `isbot`                                                                                          | 5.1.35                                                          | Used in `entry.server.tsx` for full-stream-on-crawl (correct)                                                              |
| `geist`                                                                                          | 1.7.0                                                           | Self-hosted variable fonts                                                                                                 |
| Bot detection mode                                                                               | `onAllReady` for bots, `onShellReady` for humans                | Correct — humans get streaming, crawlers get fully-rendered HTML                                                           |
| Hydration entry                                                                                  | `startTransition(() => hydrateRoot(document, <StrictMode>...))` | Correct — yields to browser between hydration and reconciliation                                                           |
| `vite-plugin-pwa`                                                                                | (not installed)                                                 | Service worker / offline not wired                                                                                         |
| `@sentry/*`                                                                                      | (not installed)                                                 | Error reporting via PostHog `analytics.captureException` only                                                              |
| `web-vitals`                                                                                     | (not installed)                                                 | INP/LCP/CLS not measured                                                                                                   |

## Findings — Routing & Data

### Finding 1: Zero `headers` exports across 44 routes

**Severity**: P0 — framework half of the Netlify cache bypass.

`grep` for `^export\s+(?:const\|function\|async function)\s+headers\b` across `apps/ui` returned **zero matches**. Every loader response thus falls through to React Router's framework default of `Cache-Control: no-cache`, which Netlify's edge reads and bypasses both Edge and Durable cache (see [`netlify-production-performance-audit.md`](netlify-production-performance-audit.md) Finding 1).

The canonical pattern is to set per-route HTTP headers (browser cache and CDN cache via `Netlify-CDN-Cache-Control`) through the `headers` export with `loaderHeaders` propagation:

```ts
export async function loader({ params }: Route.LoaderArgs) {
  const page = await getPage(params.id);
  return data(page, {
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=86400, stale-while-revalidate=604800',
      'Cache-Tag': 'docs',
    },
  });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}
```

The two layers — browser cache and CDN cache — are independent and should be set separately. We are setting neither.

### Finding 2: Zero `shouldRevalidate` exports

**Severity**: P0 — root loader re-runs on every client-side navigation in addition to every SSR.

`grep` for `^export\s+(?:const\|function|async function)\s+shouldRevalidate\b` returned **zero matches**. React Router 7's default is to re-run every loader on every navigation (single-fetch mode), including the root loader. The root loader (`apps/ui/app/root.tsx`) calls `getModels()` which performs a 341 ms HTTP fetch to `https://api.taucad.dev/v1/models`. This fires:

- Once on every SSR request (already documented in the Netlify perf audit Finding 2).
- Once on every client-side navigation that triggers single-fetch revalidation.
- Multiple times per page when the user uses the app's command palette or sidebar links.

The intended pattern is `shouldRevalidate({ defaultShouldRevalidate, currentUrl, nextUrl }) => boolean` — explicitly opting out of revalidation for routes whose data does not change between navigations. The model list changes on the order of weeks (when we update model registries), not navigation.

### Finding 3: Only 2 `Link prefetch=` instances across the app

**Severity**: P1 — RR7's flagship UX feature is effectively disabled.

`grep` for `prefetch=` returned just two hits, both in `docs-sidebar.tsx`. RR7 supports four prefetch strategies on `<Link>`:

| Mode       | When fetched              | Best for                       |
| ---------- | ------------------------- | ------------------------------ |
| `none`     | Never                     | Default; current behavior      |
| `intent`   | Hover or focus            | Most desktop navigation        |
| `render`   | When the link mounts      | Critical above-the-fold links  |
| `viewport` | When link enters viewport | Mobile / list-style navigation |

The homepage (`/`) has `<Link to='/projects/community'>`, the sidebar has many `<Link>` elements, the docs sidebar has many `<Link>` elements — none with `prefetch`. Every navigation hits a cold loader chain.

Adding `prefetch="intent"` to navigation links is a one-token change per file that warms route assets and loader data on hover/focus, often making clicks feel instantaneous. RR7 implements prefetch via `<link rel="prefetch">` injected after the link, so it integrates cleanly with the existing modulepreload chain.

### Finding 4: No `clientLoader` patterns

**Severity**: P1 — every route blocks SSR on its full loader chain.

`grep` for `clientLoader` returned only matches inside `node_modules`. The "Skip the Server Hop" pattern documented for RR7 — load critical data SSR-side, then route subsequent navigations through `clientLoader` directly to the API — is not used. For high-frequency navigations within an authenticated session (project list, file tree, chat history), this would cut server hops in half.

### Finding 5: Loader chain is fully blocking — no deferred promises

**Severity**: P1 — non-critical data blocks shell render.

`grep` for `<Suspense`, `<Await`, `defer(`, and `use(` returned only 6 files in `apps/ui/app/`, none of them in route loaders. RR7 supports streaming via unawaited promises returned from loaders:

```ts
export async function loader() {
  const criticalData = await fetchCritical(); // awaited
  const nonCriticalData = fetchNonCritical(); // not awaited — streams
  return { criticalData, nonCriticalData };
}
```

The root loader's `getModels()` is the textbook case for deferred streaming: it adds 341 ms to TTFB but its consumer (`useModels` `useQuery`) treats the SSR-injected data as a hint, not a requirement. Returning the unawaited promise (or removing the SSR fetch entirely per Netlify perf audit R3) is strictly better than blocking the shell.

## Findings — Streaming, Suspense, React 19

### Finding 6: React 19.2 SSR primitives unused at the route level

**Severity**: P1 — leaving the headline React 19 perf features on the table.

React 19.2 introduced "Batching Suspense Boundaries for SSR" (October 2025) and "SSR: Web Streams support for Node," and React 19 brought `React.use()` for promise consumption inside components. Combined with RR7's deferred-promise loader pattern, these enable a Twitter-style "render the shell now, stream content as it arrives" UX with zero framework boilerplate.

Tau uses `renderToPipeableStream` (correct), bot detection (correct), and `streamTimeout = 5000` (correct), but every route loader awaits all data before responding. The shell never streams because there is nothing for it to stream.

### Finding 7: No `HydrateFallback` exported from any route

**Severity**: P2 — only relevant if we adopt `clientLoader` or partial SSR.

`HydrateFallback` is required when `clientLoader.hydrate = true` to render a placeholder while the client-side loader runs. Since no route uses `clientLoader`, this is not an issue today — but is a prerequisite for Finding 4's recommendation.

## Findings — Code Splitting & Bundle Topology

### Finding 8: 171 `<link rel="modulepreload">` tags in homepage HTML head

**Severity**: P0 — preload storm saturates browser request queue and blocks LCP.

Live curl of `taucad.dev/` returned an HTML head containing **171** `modulepreload` links (counted via `rg -oc 'modulepreload' /tmp/home.html`). React Router 7 emits one modulepreload per JS chunk in the matched route tree to warm the module cache; combined with our heavily-split route tree (44 routes, deep component nesting, kernel-aware lazy chunks), this cascades far beyond the typical ~10–20.

Browsers cap concurrent connections per origin (HTTP/2 multiplexing relaxes this but the parser still stalls on link tag enumeration), and every modulepreload counts against the JavaScript parse/compile budget that runs before LCP. The recommended mitigation is custom `manualChunks` configuration to consolidate small chunks and reduce the modulepreload fanout.

### Finding 9: No `manualChunks` or `serverBundles` configuration

**Severity**: P1 — vendor splitting left at Vite defaults; produced the 22 MB SSR bundle.

`vite.config.ts` does not configure `build.rollupOptions.output.manualChunks` and `react-router.config.ts` does not configure `serverBundles`. The default Rollup chunking strategy splits per dynamic import boundary, which is granular but produces many small chunks (Finding 8 above) and, on the SSR side, produces a single 22 MB bundle (per [`netlify-production-performance-audit.md`](netlify-production-performance-audit.md) Finding 4) because everything imported by the route tree ends up in the function.

Two complementary fixes:

- Vite 8 `manualChunks` function for vendor consolidation (e.g. group `react`, `react-dom`, `react-router` into a single `vendor-react` chunk).
- RR7 `serverBundles` config to split the SSR Function by route bundle so the cold start cost scales with the route hit, not the entire app.

### Finding 10: 290 MB total client output dominated by WASM

**Severity**: P1 — Already covered by [`netlify-production-performance-audit.md`](netlify-production-performance-audit.md) Finding 5. Cross-referenced for completeness; no separate remediation here.

## Findings — SEO & Crawlability

### Finding 11: 3 of 44 routes export a `meta` function

**Severity**: P0 — most routes have no per-route title/description for SEO and social sharing.

`grep` for `^export\s+(?:const|function|async function)\s+meta\b` returned only 3 routes:

| Route                         | Meta coverage                                                                |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `/v/:id` (publication viewer) | Full: title, og:title, og:image, og:description, robots noindex for unlisted |
| `/docs/*`                     | Title + description from MDX frontmatter                                     |
| `/import/*`                   | Title + description                                                          |

The other 41 routes — including `/`, `/projects/*`, `/files`, `/legal/*`, `/llms.*` — fall back to the `<title>Tau</title>` and the static description from `apps/ui/app/root.tsx#meta`. Crawlers get no per-page distinction. Social sharing previews show the same generic Tau card for every URL.

### Finding 12: No JSON-LD structured data anywhere

**Severity**: P2 — affects rich results in search.

`grep` for `application/ld+json`, `jsonld`, or `og:image` returned only `/v/:id` (which sets `og:image` but not JSON-LD). 2026 SEO best practice is JSON-LD on at least the homepage (`Organization` / `WebSite` / `SoftwareApplication`), docs (`TechArticle` or `HowTo`), and publications (`CreativeWork`). Implementation is trivial — render a `<script type="application/ld+json">` tag inside the route component or via a `<Meta />`-injected tag.

### Finding 13: No sitemap.xml

**Severity**: P2 — search engines must crawl the link graph instead of a curated index.

`grep` for `sitemap` returned only `robots[.]txt/route.ts`. The `robots.txt` file does not reference a sitemap. RR7's natural pattern is a `sitemap.xml/route.ts` that iterates over `source.getPages()` (Fumadocs already gives us this) plus a static list of marketing/legal routes.

### Finding 14: 404 page returns HTTP 200

**Severity**: P0 — SEO and CDN bug; misroutes crawlers and breaks cache invalidation.

Live test:

```text
$ curl -sS -I https://taucad.dev/this-page-does-not-exist
HTTP/2 200
cache-control: no-cache
```

The catch-all route `apps/ui/app/routes/$/route.tsx` renders `<PageNotFound />` but does **not** throw a 404 status response. Crawlers index the 200 OK response as a real page, CDN caches store it as a hit, and the page becomes a duplicate-content liability.

The two-line fix is to throw a `Response` from a `loader`:

```ts
export async function loader() {
  throw new Response('Not found', { status: 404 });
}
```

Then the existing `ErrorBoundary` chain renders `<PageNotFound />` (already handled in `error-page.tsx`).

## Findings — Web Vitals & Monitoring

### Finding 15: No `web-vitals` package usage

**Severity**: P0 — we do not measure INP, LCP, CLS, or TTFB anywhere.

`grep` for `web-vitals|onLCP|onINP|onCLS|onTTFB` returned **zero matches**. Core Web Vitals 2026 thresholds:

| Metric                          | Good   | Needs Improvement | Poor   |
| ------------------------------- | ------ | ----------------- | ------ |
| LCP (Largest Contentful Paint)  | <2.5s  | 2.5–4.0s          | >4.0s  |
| INP (Interaction to Next Paint) | <200ms | 200–500ms         | >500ms |
| CLS (Cumulative Layout Shift)   | <0.1   | 0.1–0.25          | >0.25  |
| TTFB (Time to First Byte)       | <0.8s  | 0.8–1.8s          | >1.8s  |

INP replaced FID in March 2024 and is the primary interactivity signal in 2026. Without `web-vitals` or PostHog's `web_vitals` autocapture extension wired up, we have no production data to validate the Netlify perf audit's projected wins or to detect regressions over time.

### Finding 16: No Sentry integration

**Severity**: P1 — error reporting via PostHog `captureException` lacks symbolication and release correlation.

`grep` for `@sentry|sentry` in `apps/ui/package.json` returned no matches. `error-page.tsx` calls `analytics.captureException(error, ...)` which is forwarded to PostHog. PostHog is fine for fuzzy-grouped client errors but lacks:

- Source-map symbolication (we have `build.sourcemap: true`, no upload pipeline).
- Release / commit-SHA correlation.
- Server-side error context (request headers, route, loader chain).
- Replay correlation (PostHog has session replay; correlating to specific exceptions is manual).

The Sentry React Router 7 SDK is in beta as of May 2026 and supports automatic Vite source-map upload via `@sentry/wizard@latest -i sourcemaps`. Server-side instrumentation requires manual setup but is straightforward against `entry.server.tsx`.

### Finding 17: Pyroscope server-side, no client-side counterpart

**Severity**: P2 — observability asymmetry.

`@pyroscope/nodejs` is in the catalog (used by the API). The UI has no client-side profiling beyond Document-Policy `js-profiling` (which enables the Browser Performance API). PostHog autocapture covers click events but not flame graphs.

## Findings — Hydration & Asset Pipeline

### Finding 18: Hydration entry point is best-practice

**Severity**: ✅ — good baseline.

```ts
// apps/ui/app/entry.client.tsx
startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});
```

`startTransition` ensures hydration yields to higher-priority browser work (input handling, scroll), avoiding the long-task cascade that hurts INP. `StrictMode` catches double-render hydration mismatches in development. This is the recommended 2026 entry pattern.

### Finding 19: SSR entry uses `renderToPipeableStream` with `isbot` differentiation

**Severity**: ✅ — good baseline.

```ts
// apps/ui/app/entry.server.tsx
const readyOption = isBotAgent || routerContext.isSpaMode ? 'onAllReady' : 'onShellReady';
```

Crawlers get fully-rendered HTML (better SEO); humans get streaming (better LCP). This is the recommended pattern.

### Finding 20: Self-hosted variable fonts with preload + `font-display: swap`

**Severity**: ✅ — good baseline.

```ts
// apps/ui/app/styles/global.styles.ts
const fonts: LinkDescriptor[] = [
  { rel: 'preload', href: '/fonts/Geist-Variable.woff2', as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' },
  { rel: 'preload', href: '/fonts/GeistMono-Variable.woff2', as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' },
];

@font-face {
  font-family: 'Geist Sans';
  src: url('/fonts/Geist-Variable.woff2') format('woff2-variations');
  font-display: swap;
}
```

Correct: variable fonts (one file per family), `woff2-variations` format, `<link rel="preload">` to start fetch in parallel with HTML parse, `font-display: swap` to prevent FOIT. Recommendation: also serve fonts with `Cache-Control: public, max-age=31536000, immutable` (covered in Netlify perf audit R2).

### Finding 21: No image optimization pipeline

**Severity**: P1 — homepage hero, avatars, and 3D placeholders are served raw.

`apps/ui/build/client/` contains `avatar-sample.png`, `robot.glb`, `placeholder.svg`, `apple-touch-icon.png`, `android-chrome-{192,512}x192.png`, etc. — all served raw without responsive variants.

Netlify Image CDN is enabled by default for all Netlify sites at `/.netlify/images?url=<path>` and supports format negotiation (AVIF, WebP), responsive sizing, and edge caching. For React Router projects the Unpic library wraps this with a typed `<Image>` component:

```tsx
import { Image } from '@unpic/react';
<Image src='/avatar-sample.png' width={64} height={64} cdn='netlify' />;
```

For LCP-critical images (homepage hero), this is meaningful — AVIF is typically 30–50% smaller than the equivalent PNG, and responsive `srcset` halves payload on mobile.

### Finding 22: `entry.worker.js` in `apps/ui/public/` is dormant

**Severity**: P3 — cleanup or reactivate.

`apps/ui/public/entry.worker.js` exists but is unreferenced. The `vite.config.ts` comment reads `// RemixPWA(), // TODO: add PWA back after https://github.com/remix-pwa/monorepo/issues/284`. Vite-PWA support for React Router 7 is unreliable as of 2026 (see References). Recommendation: delete the dormant file and document the deferred decision; revisit when upstream lands stable RR7 support.

## Findings — Security & Cross-Origin

### Finding 23: CSP is in report-only mode with no report endpoint

**Severity**: P1 — strict CSP defined but never enforced; violations are not collected.

`netlify.toml` and `netlify.prod.toml` both set `Content-Security-Policy-Report-Only` with a thoughtful policy (specific `connect-src`, `img-src`, `worker-src`, `frame-ancestors 'none'`). The header comment notes "Test thoroughly before switching to enforcing mode" — this is the correct progressive rollout, but no `report-uri` or `report-to` directive is set, so violation reports are not collected anywhere. Without telemetry we cannot ever flip to enforcing mode safely.

### Finding 24: `Permissions-Policy` is comprehensive

**Severity**: ✅ — good baseline.

```
Permissions-Policy = "accelerometer=(), camera=(), geolocation=(), gyroscope=(),
  magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()"
```

Disables every default-on permission the app does not need, including FLoC opt-out (`interest-cohort=()`).

### Finding 25: COOP/COEP/CORP wired for SharedArrayBuffer

**Severity**: ✅ — already covered in [`runtime-cross-origin-isolation-distribution.md`](runtime-cross-origin-isolation-distribution.md). Cross-referenced for completeness.

### Finding 26: No subresource integrity (SRI) on third-party scripts

**Severity**: P3 — limited concern given strict CSP and minimal third-party scripts.

We do not inline any third-party `<script>` tags from the SSR HTML — PostHog and GitHub avatars are proxied via same-origin (`/api/ph/*`, `/api/github-avatar`). SRI is therefore moot for the current architecture. Documented as a guard against future regressions if a third-party script is ever inlined.

## Findings — Production Operations

### Finding 27: No source-map upload pipeline

**Severity**: P1 — production stack traces resolve to mangled `chunk-X-hash.js:1:99999` symbols.

`build.sourcemap: true` is set in `vite.config.ts`, so source maps ARE generated (`apps/ui/build/client/assets/*.js.map`). They are deployed alongside the JS (visible in the build output: `editor.api2-KWj7RY_4.js.map` 13 MB, `ts.worker-DugA6tTH.js.map` 17 MB, etc.) — meaning maps are public. No upload to a private store (Sentry) and no `// # sourceMappingURL=` stripping for production. This combines two anti-patterns: maps are exposed to the public AND not used for symbolication.

### Finding 28: No release tracking

**Severity**: P2 — without a Sentry release or PostHog feature-flag-gated release tag, we cannot bisect regressions across deploys.

The deploy workflow (`prod-deploy-ui.yml`) tags the deploy with `prod ${GITHUB_SHA::7}` in the Netlify UI but does not surface this commit SHA anywhere a runtime error report can pick up. Build-time injection of `__BUILD_SHA__` into a global is one line in `vite.config.ts`.

### Finding 29: Cookie consent / GDPR

**Severity**: out of scope for this audit but flagged for the cutover checklist. PostHog autocapture is enabled. EU/UK visitors require consent before non-essential cookies. `apps/ui/app/components/cookie-consent-*.ts` exists per the route-tree dump above; verify it gates PostHog analytics and not just a UI banner.

### Finding 30: Robots / crawl management

**Severity**: P3 — `robots.txt` exists; verify production rules.

`apps/ui/app/routes/robots[.]txt/route.ts` exists. Recommendation: confirm it disallows `/api/*` and the auth-gated routes (`/projects/*` for non-logged-in crawlers makes no sense to crawl).

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Priority | Effort | Impact |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | **Add `headers` exports** to all SSR routes whose output is deterministic per deploy (`/llms.mdx/*`, `/llms.txt`, `/llms-full.txt`, `/docs/*`, `/legal/*`, `/`). Pattern: `Cache-Control: public, max-age=0, must-revalidate` + `Netlify-CDN-Cache-Control: public, durable, s-maxage=86400, stale-while-revalidate=604800` + per-class `Cache-Tag`. Pair with Netlify `purgeCache` on deploy (cross-references [`netlify-production-performance-audit.md`](netlify-production-performance-audit.md) R1). | P0       | Low    | High   |
| R2  | **Add `shouldRevalidate` to root** so `getModels()` does not re-fire on every navigation. Once Netlify perf audit R3 lands (drop SSR `getModels`), this becomes redundant; ship R2 first as a one-line interim mitigation.                                                                                                                                                                                                                                                                                | P0       | Low    | High   |
| R3  | **Throw `Response('Not found', { status: 404 })`** from `apps/ui/app/routes/$/route.tsx` so the catch-all returns 404 instead of 200. The existing `ErrorBoundary` already renders `<PageNotFound />`. Two-line fix.                                                                                                                                                                                                                                                                                      | P0       | Low    | High   |
| R4  | **Add `meta` exports** to every public route (`/`, `/projects/*`, `/legal/*`, `/llms.mdx/*` proxy via `<title>` prerender, `/files`, `/import/*`). Include `og:title`, `og:description`, `og:image` (Netlify Image CDN), `twitter:card` for share previews.                                                                                                                                                                                                                                               | P0       | Med    | High   |
| R5  | **Wire `web-vitals` reporting** in `entry.client.tsx` — attach `onLCP`, `onINP`, `onCLS`, `onTTFB`, `onFCP` handlers that forward to PostHog (or a dedicated `/api/web-vitals` collector). Build a Grafana dashboard backed by the new metric stream.                                                                                                                                                                                                                                                     | P0       | Low    | High   |
| R6  | **Add `prefetch="intent"` to all internal `<Link>` navigation** (sidebar, command palette, breadcrumb, in-content cross-links). For mobile-heavy surfaces use `prefetch="viewport"`. Consider a wrapped `<AppLink>` component that defaults to `prefetch="intent"`.                                                                                                                                                                                                                                       | P1       | Med    | High   |
| R7  | **Configure `manualChunks`** in `vite.config.ts` to consolidate small chunks (Finding 8). Group `react`, `react-dom`, `react-router`, `react-router-dom`; group all `@radix-ui/*`; group `@taucad/runtime` worker entry; etc. Target reducing modulepreload count from 171 to <30.                                                                                                                                                                                                                        | P1       | Med    | High   |
| R8  | **Configure `serverBundles`** in `react-router.config.ts` to split the 22 MB SSR Function by route bundle (e.g. one bundle for `/`, one for `/docs/*`, one for `/projects/*`). Reduces cold-start cost and pushes back the 50 MB Netlify Functions ceiling.                                                                                                                                                                                                                                               | P1       | Med    | High   |
| R9  | **Adopt `@unpic/react` + Netlify Image CDN** for raster assets. Highest ROI on the homepage hero (currently `/avatar-sample.png` and similar) — AVIF format negotiation cuts bytes 30–50%.                                                                                                                                                                                                                                                                                                                | P1       | Med    | Med    |
| R10 | **Stream non-critical loader data** by returning unawaited promises and rendering with `<Suspense>` + `React.use()` in components. Highest-value targets: homepage `CommunityProjectGrid` (already lazy), publication viewer file blob fetches (currently sequential `Promise.all` in `useEffect`).                                                                                                                                                                                                       | P1       | High   | Med    |
| R11 | **Install `@sentry/react-router`** (beta, May 2026). Wire automatic source-map upload via `@sentry/wizard@latest -i sourcemaps`. Mark the existing `analytics.captureException` calls in `error-page.tsx` to fan out to both Sentry and PostHog during transition.                                                                                                                                                                                                                                        | P1       | Med    | Med    |
| R12 | **Add a `report-to` / `report-uri` directive** to the report-only CSP so violations are collected. Use Sentry's CSP collection or a Netlify Function. After 2 weeks of clean reports, flip the header from `Content-Security-Policy-Report-Only` to `Content-Security-Policy`.                                                                                                                                                                                                                            | P1       | Low    | Med    |
| R13 | **Add `apps/ui/app/routes/sitemap[.]xml/route.ts`** that iterates `source.getPages()` (docs) plus the static marketing/legal routes and emits a valid sitemap. Reference it from `robots.txt`.                                                                                                                                                                                                                                                                                                            | P2       | Low    | Med    |
| R14 | **Add JSON-LD structured data** to the homepage (`Organization`, `WebSite`, `SoftwareApplication`), docs (`TechArticle`), and publications (`CreativeWork`). Use the React 19 fix (PR #14806) — stable index-based keys + `suppressHydrationWarning` on the script tag.                                                                                                                                                                                                                                   | P2       | Low    | Med    |
| R15 | **Strip source-map URLs from production JS** while still uploading the maps to Sentry. Configure Vite plugin to emit maps to a private location and remove `// # sourceMappingURL=` from public chunks. Removes the leak of internal symbol names + path structure.                                                                                                                                                                                                                                       | P2       | Low    | Med    |
| R16 | **Inject `__BUILD_SHA__` global** at Vite build time so client errors report the exact commit. Wire into Sentry release tagging once R11 lands.                                                                                                                                                                                                                                                                                                                                                           | P2       | Low    | Med    |
| R17 | **Adopt `clientLoader`** for high-frequency authenticated navigations (project list, file tree refresh) so the round-trip skips the SSR Function entirely on subsequent loads.                                                                                                                                                                                                                                                                                                                            | P2       | High   | Med    |
| R18 | **Delete `apps/ui/public/entry.worker.js`** (dormant) and document the PWA deferral. Revisit when `vite-plugin-pwa` lands stable RR7 support (currently broken per upstream issue #809).                                                                                                                                                                                                                                                                                                                  | P3       | Low    | Low    |
| R19 | **Confirm `robots.txt` disallows `/api/*`, `/projects/*`, `/files`, `/settings/*`**, and similar auth-gated paths. Audit against actual production `robots.txt`.                                                                                                                                                                                                                                                                                                                                          | P3       | Low    | Low    |
| R20 | **Document the route-module contract** in `docs/architecture/ui-deployment-topology.md` with a "Route Module Checklist" (must export: `meta` for public routes, `headers` for cacheable routes, `shouldRevalidate` for static-data routes, `loader` only when needed, `clientLoader` for high-frequency client nav). Cross-reference from this audit.                                                                                                                                                     | P3       | Low    | Med    |

### Suggested Execution Order (combined with [`netlify-production-performance-audit.md`](netlify-production-performance-audit.md))

| Sprint                  | Tickets                                                                                                                                                              | Outcome                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Sprint 1 (1–2 days)** | This audit's R2 (`shouldRevalidate`), R3 (404 status), Netlify audit's R3 (drop `getModels`), R2 (asset cache headers)                                               | TTFB drops ~340 ms across all routes; SEO 404 fixed; immutable assets cache forever         |
| **Sprint 2 (3–5 days)** | This audit's R1 (`headers` exports), R5 (`web-vitals`), R4 (meta tags), Netlify audit's R1 + R5 + R7 (CDN cache + purge + Vary)                                      | TTFB into <150 ms warm band; live Core Web Vitals dashboard; SEO baseline                   |
| **Sprint 3 (1 week)**   | This audit's R6 (prefetch), R7 (manualChunks), R8 (serverBundles), R11 (Sentry), R12 (CSP enforcing)                                                                 | Modulepreload count <30; smaller cold starts; production-grade observability; CSP enforcing |
| **Sprint 4 (1+ week)**  | This audit's R9 (image CDN), R10 (Suspense streaming), R13–R17 (sitemap, JSON-LD, source-maps, clientLoader), Netlify audit's R6 + R8 (Edge Functions, multi-region) | Polish; geographic distribution; advanced SEO                                               |

### Projected Production Readiness Scorecard (after R1–R17)

| Area                      | Today                         | After Sprint 4       |
| ------------------------- | ----------------------------- | -------------------- |
| TTFB p95 (warm)           | 731 ms                        | <200 ms              |
| LCP p75 (homepage)        | unmeasured (~3-4 s estimated) | <2.5 s (Good)        |
| INP p75                   | unmeasured                    | <200 ms (Good)       |
| CLS p75                   | unmeasured                    | <0.1 (Good)          |
| Modulepreload tags / page | 171                           | <30                  |
| Routes with `meta`        | 3/44                          | 44/44                |
| Routes with `headers`     | 0/44                          | All cacheable routes |
| 404 status code           | 200 ❌                        | 404 ✅               |
| CSP mode                  | report-only (no collection)   | enforcing            |
| Source-map symbolication  | none                          | Sentry releases      |
| Web Vitals telemetry      | none                          | PostHog + Grafana    |

## Trade-offs

### `headers` export vs `data()` per-loader

| Dimension     | `headers()` export                                                      | `data()` per-loader                                                                |
| ------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Granularity   | Per-route module                                                        | Per-loader response (per-request)                                                  |
| Composability | Receives `loaderHeaders`, `actionHeaders`, `parentHeaders`              | Sets headers at the response level                                                 |
| Best for      | Static cacheability declarations (`/llms.txt` always cacheable for 24h) | Dynamic cacheability (publication viewer with `Cache-Control` based on visibility) |
| Maintenance   | Co-located with route module                                            | Co-located with loader logic                                                       |

We need both: `headers()` for the static-output routes (R1), `data()` for routes whose cacheability depends on loader state (e.g., `/v/:id` could vary cache TTL based on publication visibility).

### Sentry vs PostHog for error reporting

| Dimension           | Sentry                                | PostHog `captureException`                  |
| ------------------- | ------------------------------------- | ------------------------------------------- |
| Symbolication       | Auto via Debug IDs (Vite plugin)      | None                                        |
| Release tracking    | First-class                           | Manual via event properties                 |
| Server-side context | Native (request, route, loader chain) | Manual                                      |
| Replay correlation  | Native (Sentry Replay)                | Manual (PostHog session ID linkage)         |
| Cost                | Per-event tier                        | Already paying for PostHog                  |
| Best for            | Production exceptions                 | Product analytics + coarse error categories |

Recommendation: dual-write during transition. Sentry for the engineering on-call surface; PostHog continues collecting for product analytics correlation.

### `manualChunks` aggressiveness

| Strategy                                                         | Pros                                                       | Cons                                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| All `node_modules` → single `vendor` chunk                       | Maximum cache reuse across deploys (vendor changes rarely) | Single huge chunk; cache-bust on any dep update invalidates everything |
| Per-package vendor chunks (`react-vendor`, `radix-vendor`, etc.) | Granular invalidation                                      | More HTTP requests; modulepreload count creeps back up                 |
| Per-route-tree chunks                                            | Aligns chunks with usage                                   | Vite default; produced our 171 modulepreload problem                   |

The pragmatic balance: per-major-dep vendor chunks (5–10 chunks for React, Router, Radix, TipTap, Three.js, Dockview, Allotment, Fumadocs) plus route-aware splitting for app code.

## Code Examples

### R1: Cache headers on static-output routes

```ts
// apps/ui/app/routes/llms[.]txt/route.ts
import type { Route } from './+types/route.js';
import { ENV } from '#environment.config.js';
import { metaConfig } from '#constants/meta.constants.js';
import { getLlmRefText } from '#lib/fumadocs/get-llms-text.js';

export async function loader(): Promise<Response> {
  const content = await getLlmRefText({
    siteTitle: `${metaConfig.name} Documentation`,
    siteUrl: ENV.TAU_FRONTEND_URL,
  });

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=86400, stale-while-revalidate=604800',
      'Cache-Tag': 'llms, docs',
      'Netlify-Vary': 'query=',
    },
  });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}
```

### R2: Skip root revalidation between navigations

```ts
// apps/ui/app/root.tsx
export const shouldRevalidate: ShouldRevalidateFunction = ({ defaultShouldRevalidate, formAction }) => {
  if (formAction?.includes('/action/set-theme')) {
    return defaultShouldRevalidate;
  }
  return false;
};
```

### R3: 404 catch-all

```ts
// apps/ui/app/routes/$/route.tsx
import { PageNotFound } from '#components/page-not-found.js';
import type { Handle } from '#types/matches.types.js';

export const handle: Handle = { enablePageFooter: true };

export async function loader(): Promise<never> {
  // oxlint-disable-next-line typescript-eslint/only-throw-error -- React Router idiom
  throw new Response('Not found', {
    status: 404,
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}

export default function NotFoundPage(): React.JSX.Element {
  return <PageNotFound />;
}
```

### R5: Web Vitals reporter

```ts
// apps/ui/app/entry.client.tsx
import { HydratedRouter } from 'react-router/dom';
import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';

const sendMetric = (metric: Metric): void => {
  navigator.sendBeacon(
    '/api/web-vitals',
    JSON.stringify({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      id: metric.id,
      delta: metric.delta,
      navigationType: metric.navigationType,
      url: location.href,
    }),
  );
};

onCLS(sendMetric);
onFCP(sendMetric);
onINP(sendMetric);
onLCP(sendMetric);
onTTFB(sendMetric);

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});
```

### R6: `<Link prefetch="intent">` migration

```tsx
// Before
<Link to='/projects/community'>View All</Link>

// After (intent — most navigation links)
<Link to='/projects/community' prefetch='intent'>View All</Link>

// Or wrap once, use everywhere
export const AppLink = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ prefetch = 'intent', ...rest }, ref) => <Link ref={ref} prefetch={prefetch} {...rest} />,
);
```

### R7: `manualChunks` configuration

```ts
// apps/ui/vite.config.ts (excerpt)
build: {
  sourcemap: true,
  target: 'es2022',
  rollupOptions: {
    output: {
      manualChunks(id) {
        if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
          return 'vendor-react';
        }
        if (id.includes('node_modules/react-router')) {
          return 'vendor-router';
        }
        if (id.includes('node_modules/@radix-ui/')) {
          return 'vendor-radix';
        }
        if (id.includes('node_modules/@tiptap/')) {
          return 'vendor-tiptap';
        }
        if (id.includes('node_modules/three/') || id.includes('node_modules/@react-three/')) {
          return 'vendor-three';
        }
        if (id.includes('node_modules/fumadocs')) {
          return 'vendor-fumadocs';
        }
        return undefined;
      },
    },
  },
}
```

### R10: Streaming root loader

```tsx
// apps/ui/app/root.tsx — opt-in streaming
import { Suspense, use } from 'react';

export async function loader({ request }: LoaderFunctionArgs) {
  throwRedirectIfSubdomain(request, 'www');
  const { getTheme } = await themeSessionResolver(request);
  return {
    theme: getTheme(),
    cookie: request.headers.get('Cookie') ?? '',
    env: await getEnvironment(),
    // Note: not awaited — streams to client
    modelsPromise: getModels().catch((): Model[] => []),
  };
}

// Consumer (only renders when needed)
function ModelBadge({ promise }: { readonly promise: Promise<Model[]> }) {
  const models = use(promise);
  return <span>{models.length} models</span>;
}

// In a component
<Suspense fallback={<Skeleton />}>
  <ModelBadge promise={loaderData.modelsPromise} />
</Suspense>;
```

## References

- [React Router 7 Streaming with Suspense](https://reactrouter.com/7.10.0/how-to/suspense) — deferred promises, `Await`, `React.use()` patterns
- [React Router 7 Pre-Rendering](https://reactrouter.com/7.10.0/how-to/pre-rendering) — `prerender` config, `getStaticPaths`, `unstable_concurrency`
- [React Router 7 Headers](https://reactrouter.com/7.0.1/how-to/headers) — canonical `headers` export pattern
- [React Router 7 Link Prefetch](https://reactrouter.com/7.12.0/api/components/Link) — `none | intent | render | viewport`
- [React Router 7 Code Splitting](https://reactrouter.com/7.10.0/explanation/code-splitting) — Split Route Modules + automatic per-route splits
- [React Router 7 Client Data](https://reactrouter.com/how-to/client-data) — `clientLoader`, hybrid SSR patterns, `HydrateFallback`
- [React Router 7 SPA Mode](https://reactrouter.com/7.10.0/how-to/spa) — `ssr: false` configuration
- [React 19 release notes](https://react.dev/blog/2024/04/25/react-19) — `use()`, async transitions, batched Suspense
- [React 19.2 release notes](https://ar.react.dev/blog/2025/10/01/react-19-2) — Web Streams support for Node, batched Suspense for SSR
- [Sentry React Router Framework SDK](https://docs.sentry.io/platforms/javascript/guides/react-router) — beta, source-map upload via Vite plugin
- [Netlify Image CDN](https://docs.netlify.com/build/image-cdn/overview) — `/.netlify/images?url=...` endpoint, format negotiation
- [Netlify React Router Deploy Guide](https://docs.netlify.com/build/frameworks/framework-setup-guides/react-router/) — official adapter integration
- [Vite 7+ manualChunks guidance](https://github.com/vitejs/vite/discussions/17566) — `splitVendorChunkPlugin` removal, recommended `manualChunks`
- [Core Web Vitals 2026 thresholds](https://webcraftdev.com/en/blog/core-web-vitals-optimizing-lcp-inp-cls-2026) — INP <200ms, LCP <2.5s, CLS <0.1
- [vite-plugin-pwa React Router 7 issue #809](https://github.com/vite-pwa/vite-plugin-pwa/issues/809) — known PWA incompatibility
- [React Router PR #14806](https://github.com/remix-run/react-router/pull/14806) — JSON-LD hydration mismatch fix in React 19
- Related: [`netlify-production-performance-audit.md`](netlify-production-performance-audit.md) — infrastructure-layer findings
- Related: [`netlify-ui-deployment-strategy.md`](netlify-ui-deployment-strategy.md) — deployment topology and risks
- Related: [`docs/architecture/ui-deployment-topology.md`](../architecture/ui-deployment-topology.md) — current site/route topology
- Related: [`runtime-cross-origin-isolation-distribution.md`](runtime-cross-origin-isolation-distribution.md) — COOP/COEP/CORP wiring
- Related: [`homepage-time-to-interactive-analysis.md`](homepage-time-to-interactive-analysis.md) — client-side TTI baseline

## Appendix

### A. Workspace `grep` evidence summary

| Query                                                 | Match count                       | Notes                                              |
| ----------------------------------------------------- | --------------------------------- | -------------------------------------------------- | ----------------- | -------------------- | ----- | ---------- |
| `^export\s+(?:const                                   | function                          | async function)\s+headers\b`(in`apps/ui`)          | **0**             | Finding 1            |
| `^export\s+(?:const                                   | function                          | async function)\s+shouldRevalidate\b`(in`apps/ui`) | **0**             | Finding 2            |
| `prefetch=` (in `apps/ui/app`)                        | **2** files                       | Finding 3 — only `docs-sidebar.tsx`                |
| `clientLoader` (in `apps/ui`)                         | 0 (excluding `node_modules`)      | Finding 4                                          |
| `<Suspense\|<Await\|use(\|defer(` (in `apps/ui/app`)  | 6 files                           | Finding 5 — none in route loaders                  |
| `^export\s+(?:const                                   | function                          | async function)\s+meta\b`(in`apps/ui/app/routes`)  | **3** routes / 44 | Finding 11           |
| `application/ld\+json                                 | jsonld`(in`apps/ui`)              | 0                                                  | Finding 12        |
| `sitemap` (in `apps/ui`)                              | 1 (`robots[.]txt`)                | Finding 13                                         |
| `web-vitals                                           | onLCP                             | onINP                                              | onCLS             | onTTFB`(in`apps/ui`) | **0** | Finding 15 |
| `@sentry                                              | sentry`(in`apps/ui/package.json`) | 0                                                  | Finding 16        |
| `<link rel="modulepreload">` count in served `/` HTML | **171**                           | Finding 8                                          |
| `report-uri\|report-to` in `netlify*.toml`            | 0                                 | Finding 23                                         |

### B. Route inventory and meta-export coverage

44 routes total in `apps/ui/app/routes/`. Per-export coverage:

| Export             | Coverage                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `loader`           | ~30/44 (most routes)                                                                                                                        |
| `meta`             | 3/44 (`/v/:id`, `/docs/*`, `/import/*`)                                                                                                     |
| `headers`          | 0/44                                                                                                                                        |
| `shouldRevalidate` | 0/44                                                                                                                                        |
| `links`            | 0/44 (root only via `globalStylesLinks`)                                                                                                    |
| `action`           | ~5/44                                                                                                                                       |
| `clientLoader`     | 0/44                                                                                                                                        |
| `clientAction`     | 0/44                                                                                                                                        |
| `HydrateFallback`  | 0/44                                                                                                                                        |
| `ErrorBoundary`    | 6 files (root, error-page composition, `/v/:id`, etc.)                                                                                      |
| `handle`           | ~12/44 (used for Tau-specific layout flags: `enableFloatingSidebar`, `enableOverflowY`, `enablePageFooter`, `breadcrumb`, `commandPalette`) |

### C. Live curl evidence (2026-05-06, Sydney POP)

```text
=== /this-page-does-not-exist (catch-all) ===
HTTP/2 200          ← Finding 14: should be 404
cache-control: no-cache

=== /docs/runtime ===
HTTP/2 200
cache-control: no-cache
cache-status: "Netlify Durable"; fwd=bypass
cache-status: "Netlify Edge"; fwd=miss
content-type: text/html
cross-origin-embedder-policy: require-corp
cross-origin-opener-policy: same-origin
cross-origin-resource-policy: same-origin

=== / (homepage) HEAD link tag inventory ===
<link rel="preload" href="/fonts/Geist-Variable.woff2" as="font" type="font/woff2" crossorigin>     ← good
<link rel="preload" href="/fonts/GeistMono-Variable.woff2" as="font" type="font/woff2" crossorigin> ← good
<link rel="manifest" href="/manifest.webmanifest">                                                  ← good
<link rel="modulepreload" href="/assets/...">  × 171                                                ← Finding 8
```

### D. SSR HTML head structural breakdown

| Tag                                                   | Count                                                     |
| ----------------------------------------------------- | --------------------------------------------------------- |
| `<meta charSet>`                                      | 1                                                         |
| `<meta name="viewport">`                              | 1                                                         |
| `<title>`                                             | 1                                                         |
| `<meta name="description">`                           | 1                                                         |
| `<meta name="theme-color">`                           | 1                                                         |
| `<meta name="apple-mobile-web-app-*">`                | 3                                                         |
| `<meta name="mobile-web-app-capable">`                | 1                                                         |
| `<meta rel="icon">` / `<meta rel="apple-touch-icon">` | 3 (note: should be `<link rel=...>` not `<meta rel=...>`) |
| `<meta name="color-scheme">`                          | 1                                                         |
| `<link rel="preload" as="font">`                      | 2                                                         |
| `<link rel="manifest">`                               | 1                                                         |
| `<link rel="modulepreload">`                          | **171**                                                   |
| `<link rel="stylesheet">`                             | (in body or via React Router `<Links />` — varies)        |
| `<meta property="og:*">`                              | 0                                                         |
| `<meta name="twitter:*">`                             | 0                                                         |
| `<script type="application/ld+json">`                 | 0                                                         |

Note: the `<meta rel="icon">` tags in `root.tsx#meta` use `meta` instead of `link` — `<meta>` does not have a `rel` attribute. These should be moved into `links` export. Minor.

### E. Files referenced in this audit

- `apps/ui/package.json` — dependency contract
- `apps/ui/vite.config.ts` — Vite plugin chain, missing `manualChunks`
- `apps/ui/react-router.config.ts` — `ssr: true`, missing `prerender` and `serverBundles`
- `apps/ui/app/entry.client.tsx` — `StrictMode` + `startTransition` hydration
- `apps/ui/app/entry.server.tsx` — `renderToPipeableStream` + `isbot`
- `apps/ui/app/root.tsx` — root loader, blocking `getModels()`, no `shouldRevalidate`
- `apps/ui/app/hooks/use-models.tsx` — the 341 ms blocking fetch source
- `apps/ui/app/styles/global.styles.ts` — font preload + stylesheet declarations
- `apps/ui/app/styles/global.css` — `@font-face` with `font-display: swap`
- `apps/ui/app/components/error-page.tsx` — error boundary with PostHog `captureException`
- `apps/ui/app/routes/$/route.tsx` — catch-all returning 200 instead of 404
- `apps/ui/app/routes/v.$id/route.tsx` — only route with full meta/og coverage; reference for R4
- `apps/ui/app/routes/_index/route.tsx` — homepage with good `LazySection` + idle deferral pattern
- `apps/ui/server.ts` — local Express; reference for asset cache config
- `apps/ui/netlify.toml`, `apps/ui/netlify.prod.toml` — security headers (good), report-only CSP (no collection)
- `pnpm-workspace.yaml` — pinned `react-router 7.14.2`, `react 19.2.4`, `vite 8.0.10`
