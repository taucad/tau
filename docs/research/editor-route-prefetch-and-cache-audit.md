---
title: 'Editor Route Prefetch and Cache Audit'
description: 'Why /projects/$id navigation feels slow after Remix and why CDN caching is the wrong lever — recommends route prefetch + warm-import; audits every UI route for cache/prefetch fit.'
status: draft
created: '2026-05-15'
updated: '2026-05-15'
category: audit
related:
  - docs/research/ui-startup-performance-gap-analysis.md
  - docs/research/homepage-time-to-interactive-analysis.md
  - docs/research/netlify-production-performance-audit.md
  - docs/research/ssr-bundle-audit.md
  - docs/research/netlify-ui-deployment-strategy.md
---

# Editor Route Prefetch and Cache Audit

User-visible symptom: clicking **Remix** on a community project card from `/` takes a long time to land on `/projects/<id>` (the editor route). The homepage uses `cdnBackedSsrRouteHeaders` for edge caching; this audit checks whether the same lever applies to the editor route, the publication viewer, the community page, and every other UI route — and identifies what does help the editor cold-load.

## Executive Summary

The editor route's cold-load time is dominated by **client-side JS evaluation and WASM instantiation** (Monaco + Three.js + replicad/OCCT kernels), not by SSR TTFB. CDN caching would shave at most tens of milliseconds off the SSR Function cold start and **cannot** speed up the chunk download + kernel boot that the user is actually waiting on.

The right lever is **route prefetch on the homepage**: warm the editor's module graph (and the runtime WASM) while the user is still on `/`, so that the `navigate('/projects/<id>')` after `projectManager.createProject(...)` finds chunks already cached. React Router 7 supports this declaratively via `<Link prefetch="intent">` on every `/projects/<id>` and `/projects/new` NavLink; the Remix button (which navigates programmatically) benefits from an explicit `import('#routes/projects_.$id/route.js')` triggered on hover or pointerdown.

Sweeping every other route: only `/projects/community` is a new candidate for `cdnBackedSsrRouteHeaders` (fully public, static `sampleProjects`, no loader). `/v/:id` already caches in the loader via `data(..., { headers })` but should re-export a `headers()` for nested-route header-merging clarity. Every other runtime route is per-user, auth-gated, or already prerendered.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings](#findings)
- [Recommendations](#recommendations)
- [Route Cache and Prefetch Inventory](#route-cache-and-prefetch-inventory)
- [Trade-offs](#trade-offs)
- [References](#references)

## Problem Statement

From the user-attached screenshot of `taucad.dev`: pressing **Remix** on a Community card on the homepage starts a long visible delay before the editor view appears at `/projects/<id>`. The homepage explicitly sets `cdnBackedSsrRouteHeaders(cacheTag.homepage, 'short')` (`apps/ui/app/routes/_index/route.tsx:81`), so the working theory floated by the user was: do we need the same cache wiring on `/projects/$id` (and other important pages) to make navigation feel snappy?

Two sub-questions follow:

1. Is CDN caching the right mechanism for the slow Remix → editor hop?
2. Are there other routes that should adopt the homepage's cache pattern?

## Methodology

- Read every `apps/ui/app/routes/**/route.tsx` to identify which routes have loaders, which export `headers()`/`cdnBackedSsrRouteHeaders`, and which are per-user vs static SSR.
- Traced the Remix click path: `apps/ui/app/components/project-grid.tsx` `ProjectCard.handleFork` → `useProjectManager().createProject` (IDB writes) → `navigate('/projects/<id>')`.
- Inspected `apps/ui/app/routes/projects_.$id/route.tsx` to map the provider tree (`SharedWorkerGate` → `FileManagerProvider` → `ChatRpcSocketProvider` → `WebglContextTrackerProvider` → `ProjectProvider` → `MonacoModelServiceProvider`) and the modules it pulls in (chat interface, dockview, Monaco, Three.js, kernel workers, replicad/OCCT WASM).
- Cross-referenced the cache primitives in `apps/ui/app/constants/cache.constants.ts` and `apps/ui/app/lib/react-router.lib.ts` (`cacheTag` map, `cdnBackedSsrRouteHeaders`, `browserRevalidateCacheControl`, `edgeShortLivedSsrRouteCacheControl`, `edgeDurableSsrRouteCacheControl`).
- Reviewed `apps/ui/react-router.config.ts` + `apps/ui/app/lib/static-paths.ts` for the prerender allowlist (docs, llms, legal, manifest, robots, sitemap).
- Reviewed prior performance investigations for the editor and homepage (`docs/research/ui-startup-performance-gap-analysis.md`, `docs/research/homepage-time-to-interactive-analysis.md`, `docs/research/netlify-production-performance-audit.md`) to confirm that the slow path is JS/WASM and not SSR.

## Findings

### Finding 1: CDN caching is the wrong axis for `/projects/$id`

The slow part of the Remix click is not the document fetch — it's everything that runs after React Router resolves the new route in the client. From `projects_.$id/route.tsx`:

- The route has **no loader**, so there is no per-id loader work to amortise via the edge.
- The route's SSR HTML is essentially constant for any `/projects/<anything>` (a thin layout shell — the editor, Monaco, dockview, and viewer are all client-rendered after hydration). This means even a CDN HIT for `/projects/<id>` saves only tens of ms of SSR Function invocation; the user still waits for the **same** client-side chunks and WASM.
- Per-URL cache keys + an unbounded id space mean every project's first hop is a miss anyway — exactly the scenario in the screenshot (Remix produces a brand-new id, so the new URL has never been seen).
- Theme cookies + `window.ENV` (`apps/ui/app/root.tsx:158-163`) are embedded into the document. A long edge TTL would freeze whatever theme primed the cache and mask env-var deploys; `must-revalidate` is the safer ceiling.

Prior traces confirm this. The editor's SSR DOM is only **~320 nodes** versus the homepage's ~1,974 (`docs/research/ui-startup-performance-gap-analysis.md`); the editor's slowness is the post-hydration boot of Monaco + Three.js + kernel WASM, not document delivery.

### Finding 2: Programmatic `navigate()` after IDB writes blocks the prefetch React Router would normally do

In `apps/ui/app/components/project-grid.tsx` `ProjectCard.handleFork`:

```typescript
const createProject = await projectManager.createProject({ ... });
await navigate(`/projects/${createProject.id}`);
```

The destination id is **created at click time**, so:

- React Router cannot prefetch the route's assets via `<Link prefetch="...">` because there is no `<Link>` — `handleFork` is a `<Button onClick>` doing async work.
- The browser sees the destination URL for the first time only after `await projectManager.createProject(...)` resolves. From that moment, the editor's module graph and runtime WASM start downloading + parsing + instantiating cold.
- The IDB writes themselves are fast (single project + file copies); they are not the user-visible delay. The visible delay is the chunk + WASM cold path that begins after `navigate`.

This pattern is identical for every entry into the editor: the Community-grid Remix button, `_index/route.tsx`'s "Build from code" `/projects/new` link, and the sidebar's "recent projects" `NavLink`s in `apps/ui/app/components/nav/nav-history.tsx` and `nav-projects.tsx`.

### Finding 3: Existing `prefetch` props on `NavLink` are not used for project routes

Searching `apps/ui/app/components/nav` and `apps/ui/app/routes/_index` for `prefetch=`:

- `nav-history.tsx:360` → `<NavLink to={`/projects/${project.id}`}>` — **no `prefetch`**.
- `nav-projects.tsx:58` → `<NavLink to={item.url}>` (pinned projects) — **no `prefetch`**.
- `_index/route.tsx:214` → `<NavLink to='/projects/new'>` ("Build from code") — **no `prefetch`**.

React Router 7's `<Link prefetch="intent">` would automatically begin downloading the destination route's chunks on hover/focus, eliminating the cold-load on subsequent navigation. The current homepage/sidebar surfaces lose this for free.

### Finding 4: The Remix click path has no warm-up hook today

Once Remix is clicked, the only available warm-up window is the `await projectManager.createProject(...)` step itself (a few hundred ms of IDB I/O). The handler does not currently use that window — it could fire a `import('#routes/projects_.$id/route.js')` (and friends) in parallel, but it does not.

A larger window is available on **hover** or **pointerdown** of the card, often hundreds of ms to several seconds before the click. Today nothing happens during hover.

### Finding 5: `/projects/community` is the only new CDN-cache candidate

`apps/ui/app/routes/projects_.community/route.tsx`:

- No loader.
- Renders `sampleProjects` (static constant) into `CommunityProjectGrid`.
- No auth, no per-user state, no cookies in the SSR output beyond the root layout's theme.

This is the same shape as the homepage: identical SSR for everyone, content changes only on deploy. Adding a new `cacheTag.community` and returning `cdnBackedSsrRouteHeaders(cacheTag.community, 'short')` from a `headers()` export is a clean fit.

### Finding 6: `/v/:id` already caches but should be explicit about it

`apps/ui/app/routes/v.$id/route.tsx:67-138` returns `data(body, { headers: cacheHeaders })` where `cacheHeaders` is `cdnBackedSsrRouteHeaders(cacheTag.publicationViewer, 'long')`. This works because `data()` merges those headers into the response, but the route does not export a `headers()` function. With nested routes, parent `headers()` exports can win in some merging scenarios; the docs route handles this by re-exporting:

```typescript
export function headers({ loaderHeaders }: Route.HeadersArgs): Headers {
  return loaderHeaders;
}
```

`/v/:id` should adopt the same pattern for parity with `/docs/*` and to make the cache contract obvious at the file's top level.

### Finding 7: Every other runtime route is correctly excluded from CDN caching

Walking the route tree:

- `/projects/library`, `/projects/new`, `/projects/:id`, `/projects/:id/preview`, `/files`, `/usage`, `/settings_/*`, `/workflows`, `/convert`, `/import.$`, `/auth.$` — all per-user (IDB- or auth-driven), `must-revalidate` is correct, no edge cache.
- `/`, `/docs/*`, `/llms.txt`, `/llms-full.txt`, `/docs.runtime.llms-*.txt`, `/llms.mdx.$` — already wired to `cdnBackedSsrRouteHeaders` directly or via `loaderHeaders`.
- `/manifest.webmanifest`, `/robots.txt`, `/sitemap.xml`, `/legal/*` — prerendered via `listStaticPrerenderPaths` in `apps/ui/app/lib/static-paths.ts`; Netlify serves static files with its own immutable headers.
- `/i/:`, `/assets.$`, `/action/set-theme`, `/api/ph`, `/api/github-avatar` — resource routes, own cache control.

## Recommendations

| #   | Action                                                                                                                            | Priority | Effort | Impact |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | Add `prefetch="intent"` to every `<NavLink>` / `<Link>` pointing at `/projects/$id`, `/projects/new`, and `/projects/$id/preview` | P0       | XS     | High   |
| R2  | Trigger `import('#routes/projects_.$id/route.js')` on hover or `pointerdown` of community/Remix cards and recent-project rows     | P0       | S      | High   |
| R3  | Issue the same dynamic `import(...)` in parallel with `projectManager.createProject(...)` inside `ProjectCard.handleFork`         | P1       | XS     | Medium |
| R4  | Add `cacheTag.community` + `headers()` returning `cdnBackedSsrRouteHeaders(cacheTag.community, 'short')` to `/projects/community` | P1       | XS     | Low    |
| R5  | Re-export an explicit `headers({ loaderHeaders }) { return loaderHeaders; }` from `/v/:id/route.tsx` for clarity and merge safety | P2       | XS     | Low    |
| R6  | Do **not** add `cdnBackedSsrRouteHeaders` to `/projects/$id`, `/projects/$id/preview`, `/projects/new`, or `/projects/library`    | P0       | —      | —      |

### R1 — `prefetch="intent"` on project links

Affected files:

- `apps/ui/app/components/nav/nav-history.tsx:360` — recent projects sidebar.
- `apps/ui/app/components/nav/nav-projects.tsx:58` — pinned projects sidebar.
- `apps/ui/app/routes/_index/route.tsx:214` — "Build from code" → `/projects/new`.

One-character changes per call site (`<NavLink to=... prefetch="intent">`) and React Router 7 begins fetching the route's `.data` payload + lazy chunks on hover/focus. Zero runtime cost when the user does not hover.

### R2 — Warm-import the editor route on community-card hover

Add a hover/pointerdown handler to `ProjectCard` (and `CommunityProjectGrid` siblings) that fires:

```typescript
void import('#routes/projects_.$id/route.js');
```

`import()` is idempotent and the browser caches the module graph after the first fetch, so multiple hovers across multiple cards still result in one network fetch. Combined with R1, this covers both `<Link>`-based and `<Button>`-based entries into the editor.

### R3 — Parallel-import inside `handleFork`

In `apps/ui/app/components/project-grid.tsx`:

```typescript
const handleFork = useCallback(
  async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (isForking) return;
    setIsForking(true);

    void import('#routes/projects_.$id/route.js');

    try {
      const createProject = await projectManager.createProject({ ... });
      await navigate(`/projects/${createProject.id}`);
    } catch {
      setIsForking(false);
    }
  },
  [...],
);
```

The dynamic import overlaps with the IDB writes (typically a few hundred ms), so even without hover prefetch the navigation finds chunks warmed.

### R4 — CDN-cache `/projects/community`

Mirror the homepage pattern:

```typescript
// apps/ui/app/lib/react-router.lib.ts
export const cacheTag = {
  // ... existing tags
  community: 'community',
} as const;

// apps/ui/app/routes/projects_.community/route.tsx
import { cacheTag, cdnBackedSsrRouteHeaders } from '#lib/react-router.lib.js';

export function headers(): Record<string, string> {
  return cdnBackedSsrRouteHeaders(cacheTag.community, 'short');
}
```

`'short'` (10 min `s-maxage`, 1 day SWR) is appropriate because `sampleProjects` is a constant in the bundle — the SSR output is bit-stable across requests for a given deploy.

### R5 — Explicit `headers()` on `/v/:id`

Defensive parity with `/docs/*`. The current loader-merged headers work but rely on React Router's response-header merge order. An explicit `headers({ loaderHeaders })` re-export keeps the cache policy visible at the top of the file and immune to future nested-layout changes.

### R6 — Explicitly avoid CDN-caching the editor

Recording the negative as a recommendation so future contributors do not adopt the homepage pattern by analogy. The editor route should keep `must-revalidate` (the React Router default) and rely on R1–R3 for navigation speed.

## Route Cache and Prefetch Inventory

| Route                                                     | Current cache wiring                                       | Verdict                | Action                        |
| --------------------------------------------------------- | ---------------------------------------------------------- | ---------------------- | ----------------------------- |
| `/` (`_index`)                                            | `cdnBackedSsrRouteHeaders(homepage, 'short')`              | ✅ correct             | None                          |
| `/docs/*`                                                 | `headers({ loaderHeaders })` → `cdnBackedSsrRouteHeaders`  | ✅ correct             | None                          |
| `/v/:id`                                                  | `data(..., { headers: cdnBackedSsrRouteHeaders('long') })` | ⚠️ implicit            | R5 — re-export `headers()`    |
| `/projects/community`                                     | None                                                       | 🟡 candidate           | R4 — add `cacheTag.community` |
| `/projects/library`                                       | None                                                       | ❌ per-user (IDB)      | Keep default                  |
| `/projects/:id`                                           | None                                                       | ❌ per-id, theme-bound | R1–R3 (prefetch, not cache)   |
| `/projects/:id/preview`                                   | None                                                       | ❌ per-user            | R1 on cards that link here    |
| `/projects/new`                                           | None                                                       | ❌ per-user (auth UI)  | R1 on `_index/route.tsx`      |
| `/files`, `/usage`, `/settings_/*`, `/workflows`          | None                                                       | ❌ per-user            | Keep default                  |
| `/convert`, `/import.$`, `/auth.$`                        | None                                                       | ❌ per-user            | Keep default                  |
| `/legal/*`                                                | Prerendered (`listStaticPrerenderPaths`)                   | ✅ correct             | None                          |
| `/manifest.webmanifest`, `/robots.txt`, `/sitemap.xml`    | Prerendered                                                | ✅ correct             | None                          |
| `/llms.txt`, `/llms-full.txt`, `/docs.runtime.llms-*.txt` | `cdnBackedSsrRouteHeaders` on loader                       | ✅ correct             | None                          |
| `/llms.mdx.$`                                             | `cdnBackedSsrRouteHeaders` on loader                       | ✅ correct             | None                          |
| `/i/:`, `/assets.$`, `/action/set-theme`, `/api/ph`       | Own resource handlers                                      | ✅ correct             | Out of scope for this audit   |
| `/e2e.graphics-backend`                                   | None (test fixture)                                        | ✅ correct             | None                          |

## Trade-offs

### Why not just add `cdnBackedSsrRouteHeaders` to `/projects/$id` defensively?

It is essentially a no-op for the symptom and introduces real risk:

- The CDN entry is keyed per id; first visits (the screenshot scenario) are always misses.
- The SSR Function cold start it would save is tens of ms vs the multi-second WASM/Monaco boot the user sees.
- Long edge TTLs freeze theme cookies and `window.ENV` in the cached document, masking env-var deploys until the cache expires.

### Why `prefetch="intent"` over `prefetch="render"`?

`render` would force fetch every project-link asset on every page mount (a large network burst on `/projects/library` and the sidebar). `intent` (hover/focus) targets only the projects the user is about to click, matching the homepage's lazy-section pattern.

### Why `import()` instead of `<link rel="modulepreload">`?

`modulepreload` requires plumbing the build manifest into `links()` to know which content-hashed chunk to preload — a non-trivial wiring change. `import()` is bundler-aware and idempotent; the browser caches the result, so subsequent calls are free. Worth revisiting `modulepreload` only if R1–R3 do not move the needle.

### Why not cache `/projects/:id/preview` even for static sample projects?

The route's id space is mixed: static `sampleProjects` ids and real per-user project ids share the URL. Caching would either need URL discrimination (fragile) or risk leaking per-user previews to the CDN. Not worth the complexity for the small set of public sample ids.

## References

- `apps/ui/app/lib/react-router.lib.ts` — `cacheTag`, `cdnBackedSsrRouteHeaders`, `throwRedirectIfSubdomain`.
- `apps/ui/app/constants/cache.constants.ts` — `browserRevalidateCacheControl`, `edgeShortLivedSsrRouteCacheControl`, `edgeDurableSsrRouteCacheControl`.
- `apps/ui/app/routes/_index/route.tsx` — homepage cache wiring and "Build from code" `NavLink`.
- `apps/ui/app/routes/projects_.$id/route.tsx` — editor route provider tree.
- `apps/ui/app/routes/v.$id/route.tsx` — publication viewer loader cache headers.
- `apps/ui/app/components/project-grid.tsx` — `ProjectCard.handleFork` (Remix navigation entry).
- `apps/ui/app/components/nav/nav-history.tsx`, `nav-projects.tsx` — sidebar `NavLink`s missing `prefetch`.
- `apps/ui/react-router.config.ts` + `apps/ui/app/lib/static-paths.ts` — prerender allowlist.
- Related research: `docs/research/ui-startup-performance-gap-analysis.md`, `docs/research/homepage-time-to-interactive-analysis.md`, `docs/research/netlify-production-performance-audit.md`, `docs/research/ssr-bundle-audit.md`.
- React Router 7 docs: [Link prefetch](https://reactrouter.com/api/components/Link#prefetch).
