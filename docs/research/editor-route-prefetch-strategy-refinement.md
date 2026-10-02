---
title: 'Editor Route Prefetch Strategy Refinement'
description: 'Architectural review of the editor-route prefetch audit — replaces ~20 per-link/per-handler decorations with a single centralized `<PrefetchPageLinks>` + idle warm-import in `root.tsx`, exploiting that Tau every flow converges on `/projects/$id`.'
status: draft
created: '2026-05-15'
updated: '2026-05-15'
category: architecture
related:
  - docs/research/editor-route-prefetch-and-cache-audit.md
  - docs/research/ui-startup-performance-gap-analysis.md
  - docs/research/homepage-time-to-interactive-analysis.md
  - docs/research/ssr-bundle-audit.md
---

# Editor Route Prefetch Strategy Refinement

Architectural reconsideration of the recommendations in [editor-route-prefetch-and-cache-audit.md](./editor-route-prefetch-and-cache-audit.md). The original audit identifies the right problem (cold-load on `/projects/$id`) and lever (prefetch over CDN cache), but its implementation scales linearly with the number of project links/buttons — ~20 decoration sites for a single optimization. This doc surveys React Router 7's prefetch primitives and proposes a centralized alternative that collapses the work to one mount point.

## Executive Summary

The original audit's R1–R3 spread editor-route preloading across **9 `<NavLink>` `prefetch="intent"` decorations + 11 `warmEditorRoute()` handler calls + 5 `onPointerEnter` hover hooks = ~25 touch points**. This optimizes for "prefetch at the moment of intent" — a textbook React Router 7 idiom when destinations vary by user action.

Tau's topology subverts that idiom: **every user flow culminates in `/projects/$id`**. Homepage chat-submit, Remix card click, Build from code, library Open, recent-project sidebar, publication Fork, GitHub/disk import, hero viewer, CTA — all eleven entry points navigate to the same destination route. The destination is convergent, not divergent. Per-link decoration optimizes for the wrong axis.

A single declarative `<PrefetchPageLinks page="/projects/__warmup__" />` rendered once in `root.tsx` (gated behind `requestIdleCallback` + saver-data + already-on-editor checks) achieves the same payoff with **one touch point**. The `useFork` hook from the audit remains valuable as a _code-deduplication_ refactor (four near-identical fork flows collapse into one hook); its prefetch responsibility falls away because the centralized preloader already covers the same window.

Recommendation: **adopt the centralized preloader as R1, keep `useFork` for dedup (R2), keep cache headers (R3 = old R4, R4 = old R5), drop the 25 decoration sites entirely**. Total touch points: ~6.

## Table of Contents

- [Problem Restatement](#problem-restatement)
- [What React Router 7 Actually Ships](#what-react-router-7-actually-ships)
- [Findings](#findings)
- [Architectural Options](#architectural-options)
- [Trade-offs](#trade-offs)
- [Revised Recommendations](#revised-recommendations)
- [Implementation Sketch](#implementation-sketch)
- [References](#references)

## Problem Restatement

The original audit's user-visible symptom: clicking **Remix** on a community card takes a long time to land on `/projects/<id>`. Root cause is client-side JS evaluation (Monaco + Three.js + WASM kernels), not SSR TTFB. The audit's fix is to begin chunk download _before_ the navigation happens.

The audit's R1–R3 propose three mechanisms to achieve that:

1. **R1**: `prefetch="intent"` on every `<NavLink>` / `<Link>` targeting an editor entry (9 sites).
2. **R2**: `onPointerEnter` hover-triggered `import('#routes/projects_.$id/route.js')` on fork affordances (5 sites).
3. **R3**: Parallel-import inside every programmatic project-creator handler (the audit limited this to `ProjectCard.handleFork`; the follow-up plan extended it to 11 sites).

The sum is roughly **25 touch points** across components, route handlers, and column cells. Every new project link or programmatic creator added in the future needs to remember to decorate itself. The decoration is invisible to the type system — forgetting it silently regresses performance, with no compile-time or lint-time signal.

The architectural question: is this _fan-out_ the right model, or is there a _fan-in_ alternative that exploits the convergent destination?

## What React Router 7 Actually Ships

Three primitives matter for this decision:

### `<Link prefetch="...">` — declarative, per-link

The familiar option from the original audit. Four behaviors:

| Mode       | Trigger              | Use case                          |
| ---------- | -------------------- | --------------------------------- |
| `none`     | never                | default                           |
| `intent`   | hover / focus        | desktop, fan-out destinations     |
| `render`   | link mounts          | small set of always-visible links |
| `viewport` | link enters viewport | mobile, infinite scroll           |

Internally injects an `<a>`-sibling `<link rel="prefetch">` after the link element. Prefetches **route modules + loader data** when the URL has a concrete path; for dynamic segments like `/projects/$id`, the `<Link to>` always carries a real id so this works fine. ([source](https://reactrouter.com/api/components/Link))

### `<PrefetchPageLinks page="/absolute/path" />` — declarative, page-targeted

**The architectural primitive that closes the gap.** Renders the same `<link rel="prefetch">` tags as `prefetch="intent"`, but for a target URL rather than tied to a `<Link>` element. The docs explicitly call out the "prefetch any other reason" use case:

> Renders `<link>` tags for modules and data of another page to enable an instant navigation to that page. `Link` uses this internally, but you can render it to prefetch a page for any other reason.
>
> For example, you may render one of this as the user types into a search field to prefetch search results before they click through to their selection.

A single `<PrefetchPageLinks page="/projects/__warm__" />` mounted anywhere (typically `root.tsx`) triggers the same chunk prefetch that `prefetch="intent"` on a Link element would — without the link. The `__warm__` id is a placeholder; RR7 prefetches the route's _module_ (which is content-hashed and parameter-independent), not the URL. ([source](https://reactrouter.com/api/components/PrefetchPageLinks))

### `useFetcher().load(url)` — imperative

Programmatic prefetch via the fetcher state machine; primarily for data, not modules. Not the right tool for our case (the editor route has no loader; we want the JS chunk).

## Findings

### Finding 1: The destination is convergent — the audit optimizes for fan-out

Walking every entry point that navigates to `/projects/<id>` (audit's R1+R3 inventory):

| #   | Source                                                       | Mechanism                      |
| --- | ------------------------------------------------------------ | ------------------------------ |
| 1   | `nav-history.tsx` recent-projects sidebar                    | `<NavLink>`                    |
| 2   | `nav-projects.tsx` pinned-projects sidebar                   | `<NavLink>`                    |
| 3   | `_index/route.tsx` "Build from code"                         | `<NavLink to='/projects/new'>` |
| 4   | `_index/cta-section.tsx` CTA                                 | `<Link to='/projects/new'>`    |
| 5   | `projects_.library/route.tsx` New / Open card                | `<NavLink>`                    |
| 6   | `projects_.library/columns.tsx` Open row                     | `<NavLink>`                    |
| 7   | `usage/columns.tsx` project link                             | `<Link>`                       |
| 8   | `_index/route.tsx` `HomepageChatInput.onSubmit`              | `navigate(...)`                |
| 9   | `_index/cta-section.tsx` `CtaChatComposer.onSubmit`          | `navigate(...)`                |
| 10  | `_index/hero-viewer.tsx` `handleContinueInEditor`            | `navigate(...)`                |
| 11  | `projects_.library/route.tsx` `onSubmit`                     | `navigate(...)`                |
| 12  | `projects_.new/route.tsx` `useProjectCreation.createProject` | `navigate(...)`                |
| 13  | `import.$/route.tsx` GitHub success effect                   | `navigate(...)`                |
| 14  | `import.$/route.tsx` Disk success effect                     | `navigate(...)`                |
| 15  | `project-grid.tsx` `ProjectCard.handleFork`                  | `navigate(...)`                |
| 16  | `preview-mobile.tsx` `handleRemix`                           | `navigate(...)`                |
| 17  | `preview-desktop.tsx` `handleEditOnline`                     | `navigate(...)`                |
| 18  | `v.$id/fork-action.tsx` `handleFork`                         | `navigate(...)`                |

Eighteen entry points, **one destination route**. Per-link/per-handler decoration treats each as an independent optimization problem; in reality they share a common precondition (the editor chunks are not yet loaded) and a common remedy (preload them).

### Finding 2: Existing codebase patterns already validate centralized idle preloading

Two precedents in [apps/ui/app](apps/ui/app/):

- **`DeferredSessionRecording`** in [hooks/use-analytics.tsx:113–135](apps/ui/app/hooks/use-analytics.tsx) — calls `requestIdleCallback(() => posthog.startSessionRecording())` with `setTimeout` Safari fallback. The exact pattern needed for editor route warming.
- **`LazyHeroViewer`** in [routes/\_index/hero-viewer-gate.tsx](apps/ui/app/routes/_index/hero-viewer-gate.tsx) — `lazy(() => import(...))` + `IntersectionObserver` for viewport-gated deferred loading.

The centralized preloader composes the first pattern with `<PrefetchPageLinks>` — no new abstraction required.

### Finding 3: Vite already auto-injects `<link rel="modulepreload">` for direct chunk dependents

Per Vite's `build.modulePreload` (enabled by default), the homepage's HTML already includes `<link rel="modulepreload">` for every chunk _directly_ imported by the homepage entry. The editor route is not a direct import of the homepage, so its chunks are not in this list — but `<PrefetchPageLinks>` fills exactly that gap by emitting `<link rel="prefetch">` for the editor route's manifest entry, including its module URL.

Caveat: as documented in [vite#10600](https://github.com/vitejs/vite/issues/10600), Vite does not yet support webpack-style `/* webpackPrefetch */` magic comments for dynamic imports. The right way to prefetch lazy chunks under Vite is RR7's manifest-aware `<PrefetchPageLinks>` (or a manual `<link rel="prefetch" href={manifest.editorChunk}>`).

### Finding 4: Next.js's prefetch model is centralized for the same reason

Next.js's `<Link>` automatically prefetches _every_ in-viewport link, but the actual scheduling [moved into `requestIdleCallback`](https://github.com/vercel/next.js/pull/14580) to avoid hydration-time first-input-delay. The architectural lesson: aggressive prefetch + idle scheduling beats hand-tuned per-link decisions, because the framework can't predict which links a user will click.

For Tau, the convergent destination removes even the "which one" question — there is only one editor route to predict.

### Finding 5: `prefetch="intent"` for `/projects/$id` is partially wasted

The editor route (`projects_.$id/route.tsx`) has no loader. `prefetch="intent"` triggers two work items:

1. Prefetch the route module (`<link rel="prefetch">` for the JS chunk).
2. Call the route's loader to warm the data cache.

For the editor route, item (2) is a no-op (no loader). Item (1) is the only payoff — and a single `<PrefetchPageLinks page="/projects/__warm__" />` accomplishes it once at app boot. The 9 NavLink decorations buy nothing additional for the editor route.

(For `/v/:id`, which _does_ have a loader, `prefetch="intent"` is still net-positive when users hover its links — but `/v/:id` is the publication viewer, not an editor entry. The audit already recommends `/v/:id` cache headers in R5; per-link prefetch is a separate, lower-priority enhancement.)

### Finding 6: The fork-shape consolidation is independently valuable

The audit's `useFork` hook (consolidating four near-identical fork flows) is a **code-deduplication** win independent of prefetch. Even if all R1–R3 decorations are removed, refactoring [project-grid.tsx](apps/ui/app/components/project-grid.tsx), [preview-mobile.tsx](apps/ui/app/routes/projects_.$id_.preview/preview-mobile.tsx), [preview-desktop.tsx](apps/ui/app/routes/projects_.$id_.preview/preview-desktop.tsx), and [v.$id/fork-action.tsx](apps/ui/app/routes/v.$id/fork-action.tsx) into one hook removes ~150 lines of duplicated boilerplate (state, error handling, navigate, project-shape construction).

Keep `useFork`, drop its embedded `warmEditorRoute()` call. The centralized preloader covers the prefetch window already.

## Architectural Options

| Option                                                                                   | Touch points               | Coverage                                                          | Maintainability                             | Drawback                                                      |
| ---------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| **A. Original audit (~25 sites)**                                                        | 25                         | Every entry path                                                  | Low — every new link needs decoration       | Decoration drift; invisible perf regressions                  |
| **B. Centralized `<PrefetchPageLinks>` in `root.tsx`**                                   | 1                          | Every entry path (warms at idle, ~200ms after homepage hydration) | High — single seam                          | Always-on bandwidth for visitors who never enter editor       |
| **C. Centralized + saver-data / route-aware gates**                                      | 1 (with internal checks)   | All entries except saver-data users (acceptable trade)            | High                                        | Slightly more code in the preloader                           |
| **D. Service Worker precache**                                                           | 1 (in `service-worker.ts`) | Repeat visits only                                                | Medium — cache-invalidation complexity      | First visit unchanged; content-hashed chunk manifest plumbing |
| **E. Vite `resolveDependencies` + manual `<link rel="prefetch">`**                       | ~3 (build config + root)   | Every entry path                                                  | Medium — couples to Vite manifest internals | Build-config fragility                                        |
| **F. Combination: B + per-link `prefetch="intent"` only where loader exists (`/v/:id`)** | 2                          | Editor (centralized) + viewer (link-level)                        | High                                        | Two mechanisms but each used for its strength                 |

**Verdict**: Option F is the architecturally cleanest. Use `<PrefetchPageLinks>` for the convergent editor destination; use `prefetch="intent"` only on links targeting routes that have loaders to warm.

## Trade-offs

### Always-on preload vs. intent-driven

- **Always-on (B/C/F)**: 100% of users pay editor chunk bandwidth even if they bounce off the homepage. With `requestIdleCallback` + `saveData` checks, this is benign on broadband and skipped on metered connections.
- **Intent-driven (A)**: Only users showing intent (hover, focus, click) trigger the download. Lower bandwidth on bounce, but the bandwidth saved is the _same chunks the user would soon download anyway_ if they engage. Net: bandwidth-equivalent for engaged users, savings only for bounces.

For Tau (CAD platform, low bounce rate, high engagement per session), always-on with idle scheduling is the right trade.

### Single `__warm__` id vs. real-id prefetch

`<PrefetchPageLinks page="/projects/__warm__" />` uses a placeholder id. Concerns:

1. **Root loader runs** for the prefetched URL — but the user is already on a Tau page so the root loader has already run; the prefetched manifest entry is cached.
2. **Editor route has no loader** — so no per-id loader fires. The placeholder id is purely a URL pattern matcher.
3. **404 risk** — RR7 does not actually navigate; it only resolves the route's module URL from the manifest. No HTTP request to the editor route URL is made.

Net: the placeholder is safe. Documenting it with a code comment and naming the constant `editorRoutePrefetchPlaceholder` keeps intent obvious.

### Preloading depth: route module vs. transitive chunks

`<PrefetchPageLinks page="/projects/__warm__" />` preloads the editor _route module_. The route module imports (transitively) Monaco, Three.js, dockview, and the kernel runtime. Vite splits these into separate chunks; RR7's prefetch covers the route's direct dependency manifest, which Vite normally includes.

**What it does cover**: the route entry chunk, its statically-imported children, and the parent layout chunks already on the current page.

**What it does NOT cover automatically**: chunks behind explicit `import()` calls inside the route (kernel WASM, lazy editor panels). Those still load on-demand after the route mounts.

For a deeper warm-up, a follow-up could explicitly idle-preload the user's most-recently-selected kernel WASM. That is out of scope for this refinement.

### Saver-Data and reduced-motion users

`navigator.connection.saveData === true` or `effectiveType === 'slow-2g' | '2g'` should skip the preload — those users explicitly opt out of speculative bandwidth. One check in the preloader, not 25 checks across decorations.

## Revised Recommendations

| #   | Action                                                                                                                                               | Priority | Effort | Impact |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1' | Centralized `<EditorRoutePreloader />` in `root.tsx`: `<PrefetchPageLinks>` + idle-time `import()` fallback, gated on saver-data + already-on-editor | P0       | S      | High   |
| R2' | `useFork` hook to consolidate four near-identical fork flows (no embedded prefetch — centralized preloader handles it)                               | P1       | S      | Medium |
| R3' | `cacheTag.community` + `headers()` on `/projects/community` (unchanged from audit R4)                                                                | P1       | XS     | Low    |
| R4' | Explicit `headers({ loaderHeaders })` on `/v/:id` (unchanged from audit R5)                                                                          | P2       | XS     | Low    |
| R5' | Optional: `prefetch="intent"` only on `<Link to='/v/$id'>` instances (publication viewer has a loader; this warms it on hover)                       | P3       | XS     | Low    |
| R6' | DROP audit R1's 9 NavLink decorations for `/projects/*` routes — centralized preloader supersedes them                                               | P0       | —      | —      |
| R7' | DROP audit R2's 5 `onPointerEnter` hover hooks — same reason                                                                                         | P0       | —      | —      |
| R8' | DROP audit R3's 11 `warmEditorRoute()` handler calls (including the original `ProjectCard.handleFork`) — same reason                                 | P0       | —      | —      |

Net delta vs. the existing implementation plan: **−25 decorations, +1 root-level component, +1 hook for fork-flow dedup**.

## Implementation Sketch

### `apps/ui/app/components/editor-route-preloader.tsx`

```typescript
import { useEffect, useState } from 'react';
import { PrefetchPageLinks, useLocation } from 'react-router';

/**
 * Tau's user flows all converge on `/projects/$id`. Rather than decorate
 * every entry link/handler with prefetch logic, preload the editor route's
 * module graph once from the app shell.
 *
 * The placeholder id is unused at the URL level — RR7 resolves the route
 * module from the manifest by pattern match. No HTTP request fires for the
 * placeholder URL itself.
 */
const editorRoutePrefetchPlaceholder = '/projects/__warm__';

function shouldSkipPreload(pathname: string): boolean {
  // Skip when already on the editor (chunks are loaded), publication viewer
  // (different topology), or preview (already lazy-loads editor on demand).
  if (pathname.startsWith('/projects/') && !pathname.endsWith('/preview')) {
    return true;
  }

  // Honour the user's data-saver preference.
  const connection = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData === true) {
    return true;
  }

  const slowTypes = new Set(['slow-2g', '2g']);
  if (connection?.effectiveType !== undefined && slowTypes.has(connection.effectiveType)) {
    return true;
  }

  return false;
}

export function EditorRoutePreloader(): React.ReactNode {
  const { pathname } = useLocation();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (shouldSkipPreload(pathname)) {
      return;
    }

    if ('requestIdleCallback' in globalThis) {
      const id = requestIdleCallback(
        () => {
          setArmed(true);
        },
        { timeout: 2000 },
      );

      return () => {
        cancelIdleCallback(id);
      };
    }

    const timer = setTimeout(() => {
      setArmed(true);
    }, 250);

    return () => {
      clearTimeout(timer);
    };
  }, [pathname]);

  if (!armed) {
    return null;
  }

  return <PrefetchPageLinks page={editorRoutePrefetchPlaceholder} />;
}
```

### `apps/ui/app/root.tsx`

Mount once, near the app shell — no per-route or per-link plumbing.

```typescript
// inside Layout(), alongside <GlobalChatFlushGuard /> etc.
<EditorRoutePreloader />
```

### `apps/ui/app/hooks/use-fork.tsx` — unchanged shape

Per the prior plan, but **drop** the internal `warmEditorRoute()` call. The hook is now purely a code-deduplication helper for the four fork sites; prefetch is a non-concern at this layer.

### What goes away

- `apps/ui/app/lib/route-prefetch.ts` (helper module) — not needed.
- Every `onPointerEnter` decoration — not needed.
- Every `prefetch='intent'` on `/projects/*` NavLinks — not needed.
- Every per-handler `void import('#routes/projects_.$id/route.js')` — not needed.

## References

- React Router 7: [Link](https://reactrouter.com/api/components/Link) — `prefetch` modes and inline `<link rel="prefetch">` semantics.
- React Router 7: [PrefetchPageLinks](https://reactrouter.com/api/components/PrefetchPageLinks) — declarative page-targeted prefetch, the API that unlocks the centralized pattern.
- React Router 7: [Lazy Route Discovery](https://reactrouter.com/7.10.0/explanation/lazy-route-discovery) — manifest model and how `<link rel="modulepreload">` is injected.
- Vite: [Build Options — `modulePreload`](https://v4.vite.dev/config/build-options.html) — auto-generation of `<link rel="modulepreload">` for direct chunk dependents.
- Vite: [Issue #10600 — Prefetch for async chunks](https://github.com/vitejs/vite/issues/10600) — confirms Vite does not ship a webpack-style prefetch hint; manifest-aware tooling (RR7's `PrefetchPageLinks`) is the way.
- Next.js: [PR #14580 — Prefetching with `requestIdleCallback`](https://github.com/vercel/next.js/pull/14580) — precedent for idle-scheduled aggressive prefetch.
- web.dev: [Prefetching, prerendering, and service worker precaching](https://web.dev/learn/performance/prefetching-prerendering-precaching) — when each strategy applies.
- Existing patterns: [hooks/use-analytics.tsx](apps/ui/app/hooks/use-analytics.tsx) `DeferredSessionRecording`, [routes/\_index/hero-viewer-gate.tsx](apps/ui/app/routes/_index/hero-viewer-gate.tsx) `LazyHeroViewer`.
- Predecessor: [editor-route-prefetch-and-cache-audit.md](./editor-route-prefetch-and-cache-audit.md).
