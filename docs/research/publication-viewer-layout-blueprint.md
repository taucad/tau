---
title: 'Publication viewer layout and content blueprint'
description: 'Cohesive UX/layout/data plan for shared publication pages: bounded viewer + parameters at the top, README narrative card with math, GitHub-style explorer, author chrome, reliable view/fork counters, accessibility, and 2026 mobile patterns.'
status: draft
created: '2026-05-05'
updated: '2026-05-05'
category: architecture
related:
  - docs/research/sharing-architecture.md
  - docs/research/sharing-mvp-manual-runbook.md
  - docs/policy/ui-policy.md
  - docs/policy/accessibility-policy.md
---

# Publication viewer layout and content blueprint

Investigate how the `/v/:id` publication route (`apps/ui/app/routes/v.$id/route.tsx`) presents geometry today and blueprint a cohesive redesign that surfaces authorship, a tighter focal viewer, parameters anchored beneath the viewer, an integrated README narrative (with math), and a discoverable GitHub-style file explorer—plus a reliable per-user view-tracking pipeline and an explicit mobile pattern derived from `apps/ui/app/routes/projects_.$id_.preview/preview-mobile.tsx` and 2026 best practice.

## Executive Summary

The shared viewer reads as a CAD IDE clone: a viewer dominates vertically while the right rail's `flex-1` chain pushes Downloads to the bottom of the aside. Owner identity exists on the wire (`ownerId`) but is dropped during parsing; `MarkdownViewer` already wires `remarkMath` and KaTeX so a README narrative is a plug-in away. View and fork counts already have schema columns (`view_count`, `fork_count` `integer NOT NULL DEFAULT 0`) but no increment path or anti-fraud layer.

The redesign therefore stacks **viewer + parameters at the focal top**, a **README card** beneath, then a **manifest-driven file explorer**—on desktop and mobile—with a bottom-sheet pattern reserved for parameters interaction on touch screens (mirroring the deliberate "stay on canvas" pattern from `preview-mobile.tsx` but stripped of editor-only chrome). View-count integrity uses a two-tier pipeline: first-party session-cookie identity, Redis HLL-per-day for dedup, and an atomic `UPDATE … RETURNING` against `publications` triggered only after dwell-time + interaction signal—drawn directly from YouTube-style best practice and Postgres concurrency literature.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Scope and Non-Goals](#scope-and-non-goals)
- [Findings](#findings)
- [Target Layout Concept](#target-layout-concept)
- [Mobile UX Strategy (deep dive)](#mobile-ux-strategy-deep-dive)
- [View-Count Tracking Architecture](#view-count-tracking-architecture)
- [Accessibility Plan](#accessibility-plan)
- [Recommendations](#recommendations)
- [Trade-offs](#trade-offs)
- [References](#references)

## Problem Statement

Stakeholders want the publication page to feel closer to a structured showcase—creator attribution, narrative, bounded hero media, browsable sources, and credible engagement signals (views/forks/published-at)—rather than the project editor shell. Concretely:

1. **Author** is invisible despite the API carrying ownership identifiers on wire rows.
2. **Viewer** dominates the canvas; YouTube-style proportions (`aspect-video`, ≤ reading column) match consumer scanning behaviour.
3. **Downloads** appear disconnected from **Parameters** because the aside allocates vertical slack to the parameters block via `flex-1`.
4. **Long-form overview** (Markdown including math) should live **below** the viewer/parameters using `MarkdownViewer`.
5. **Source orientation** needs a **GitHub-like tree** below the README with vertical scroll for discovery without entering the editor.
6. **Engagement signals** (views, forks, publish date) need to be honest, per-user-aware, anti-fraud-aware, and privacy-aware—and there is no implementation today.
7. **Mobile** experience must follow 2026 patterns appropriate for _consumption_ (publication) rather than _editing_ (preview).

## Methodology

1. Read `apps/ui/app/routes/v.$id/route.tsx` for structural CSS (`flex`, `min-h`, aside composition) and loader payload typing (`PublicationRouteLoaderData`).
2. Cross-check API surface in `apps/api/app/api/publications/publications.dto.ts` (`publicationRowSchema` includes `ownerId`, `viewCount`, `forkCount`, `createdAt`).
3. Inspect `apps/ui/app/components/markdown/markdown-viewer.tsx` for Markdown/math capabilities (`remarkMath`, KaTeX stylesheet import, sanitize-stripped rehype stack).
4. Inspect `apps/ui/app/routes/projects_.$id_.preview/preview-mobile.tsx`, `use-preview-state.ts`, and `preview-nav.tsx` to compare mobile patterns against industry standards.
5. Survey 2026 best practice across YouTube view counting, Redis HLL sliding-window dedup, Postgres atomic counter updates, GDPR consent continuity, and mobile CAD viewer UX (Shapr3D, Vercel v0).
6. Compare `publications` schema (`apps/api/app/database/schema.ts`) and migration `0003_publish_foundation.sql` for existing counter columns and indexes.

## Scope and Non-Goals

**In scope**: `/v/:id` presentation layer; minimal API extensions strictly required for author display and view tracking; markdown README sourcing from published blobs; client-side tree UX over manifest paths; per-user view-tracking pipeline (HTTP edge, dedup store, durable counter); mobile pattern selection.

**Out of scope**: Full Git semantics (commits/blame), comment threads, redesigning fork internals beyond surfacing counts, deep-linking to individual files (deferred per 6.5), prioritized fetch optimization (deferred per 6.4), pre-render performance budgets, CAD runtime changes.

## Findings

### Finding 1: Downloads separation is primarily a flex layout bug

In `PublicationParametersAside`, **Parameters** wraps with `className='min-h-0 flex-1'`, which consumes remaining aside height; **Downloads** sit after a `Separator` at the bottom—creating the visible gap when parameter schemas are short.

```190:217:apps/ui/app/routes/v.$id/route.tsx
  return (
    <aside className='flex w-full max-w-sm flex-col gap-4 overflow-y-auto border-l bg-background p-4'>
      <div className='flex min-h-0 flex-1 flex-col gap-2'>
        <h2 className='text-sm font-medium'>Parameters</h2>
        <Parameters
          className='min-h-0 flex-1'
          parameters={parameterOverrides}
          defaultParameters={defaultParameters}
          jsonSchema={jsonSchema as RJSFSchema | undefined}
          onParametersChange={handleParametersChange}
          units={viewerUnits}
          enableSearch={false}
        />
      </div>
      <Separator />
      <div className='flex flex-col gap-2'>
        <h2 className='text-sm font-medium'>Downloads</h2>
```

**Implication**: Removing `flex-1` from the parameters wrapper—and from the inner `<Parameters />` instance—lets Downloads sit immediately under the parameter list, with overflow handled by the aside's existing `overflow-y-auto`.

### Finding 2: Owner identity is on the wire but dropped by the client parser

The loader exposes `data.publication` as `Record<string, unknown>`; only `title`, `description`, `visibility`, `entryFile`, `id` enter `ParsedPublication`. `ownerId`, `forkCount`, `viewCount`, `createdAt`, `kernels` are all available but unused.

**Implication**: Three additions are required:

1. Surface `ownerId`, `forkCount`, `viewCount`, `createdAt` through `ParsedPublication`.
2. Decide on **author display fields**: prefer denormalized `ownerSnapshot` (name, image) captured at publish/fork time over an N+1 profile join—mirrors how OG/thumbnail keys are denormalized today.
3. Add a profile read endpoint only if denormalization isn't desirable for non-publication contexts (out of scope for this blueprint).

### Finding 3: MarkdownViewer is the correct README primitive—but trust posture is undefined

`MarkdownViewer` centralises Streamdown configuration with `remarkMath` and KaTeX CSS:

```1:7:apps/ui/app/components/markdown/markdown-viewer.tsx
import 'katex/dist/katex.min.css';
import { defaultRehypePlugins, defaultRemarkPlugins as streamdownRemarkPlugins, Streamdown } from 'streamdown';
import type { ControlsConfig, StreamdownProps } from 'streamdown';
import remarkMath from 'remark-math';
```

Critically, the component intentionally **strips Streamdown's `sanitize` rehype plugin**:

```45:46:apps/ui/app/components/markdown/markdown-viewer.tsx
const { sanitize: _sanitize, ...unsanitizedRehypePlugins } = defaultRehypePlugins;
const tauRehypePlugins: StreamdownProps['rehypePlugins'] = Object.values(unsanitizedRehypePlugins);
```

That's safe inside trusted contexts (chat, internal docs). Public publication READMEs are _publisher-controlled_—a hardened path is required (sanitize subset, link rel hardening, image proxying). See R7.

### Finding 4: File explorer can reuse manifest path inventory cheaply

`PublicationInteractiveSurface` already resolves `data.files` blob URLs into an in-memory map for CAD preview. The same inventory renders a deterministic tree by splitting `/` segments and sorting (folders first, lexicographic). No new backend requirement beyond the existing manifest paths.

### Finding 5: Viewer framing wants explicit aspect discipline

Today `CadPreviewViewer` sits in `flex-1` with `min-h-105`. A bounded wrapper (`aspect-video`, centered, max width clamped to the reading column) yields YouTube-like proportions and re-uses the same dimensions on mobile portrait without overflow.

### Finding 6: Counter columns exist but have no increment path

`publications.view_count` and `publications.fork_count` are defined as `integer NOT NULL DEFAULT 0` in `apps/api/app/database/schema.ts`. `publications.service.ts` reads them onto the wire row but never increments either. Implementing trustworthy counts requires a deliberate edge protocol (Finding 7) before exposing the numbers to viewers.

### Finding 7: Industry view-count practice converges on dwell + dedup + atomic increment

Research highlights for view counting:

| Source                       | Pattern                                                                                                                | Tau-relevant takeaway                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| YouTube (2026 guides)        | A view is a **30s+ intentional watch**; per-user 4–5 views / 24h cap; multi-tier bot filtering reactive, not proactive | Use dwell + interaction signal; rate-limit per user; accept eventual correction over real-time perfection                         |
| Redis HLL (sliding window)   | Per-minute / per-day HLL keys; ~12 KB/key; ~0.81% error; `PFADD` O(1)                                                  | Use `PFADD pub:{id}:viewers:{yyyymmdd} {sessionHash}`, query with `PFCOUNT`, expire keys                                          |
| Postgres counters (Cybertec) | Atomic `UPDATE … SET view_count = view_count + 1 WHERE id = ?`—or fanout rows aggregated nightly for hot publications  | Default to atomic update; reserve fanout for long-tail spikes                                                                     |
| REST conventions             | `PATCH /publications/:id/views` rather than mutating GET (cache-friendly, REST-compliant)                              | Match this; do **not** increment inside the existing GET loader                                                                   |
| GDPR / Recital 30            | First-party technical session cookie OK; consent-state changes generate session ID churn that can inflate counts 2–3×  | Bind session id to the better-auth session if signed-in; otherwise use an opaque first-party cookie that survives consent changes |

### Finding 8: Existing mobile pattern (`preview-mobile.tsx`) is editor-shaped

`apps/ui/app/routes/projects_.$id_.preview/preview-mobile.tsx` uses a Vaul drawer with snap points (`[0.5, 0.85]`), a fixed bottom tab bar (`Model | Files | Params | Details`), and viewer padding-bottom that follows the snap point so the viewer remains visible while content overlays:

```81:178:apps/ui/app/routes/projects_.$id_.preview/preview-mobile.tsx
    <div className={cn('absolute inset-0 size-full', '[--nav-height:calc(var(--spacing)*10)]', 'md:hidden')}>
      <div
        className='relative h-full transition-all duration-200 ease-linear'
        style={{
          paddingBottom: isModelTab ? '0' : `calc(${Number(activeSnapPoint) - 0.07} * 100dvh)`,
        }}
      >
        <div className='relative h-full'>
          <CadPreviewViewer enableZoom enablePan className='h-full' />
        </div>
        ...
```

That pattern is well-suited to the _editor preview_ use case (parallel modes, near-equal weight tabs), but it carries an **empty `Model` tab** placeholder, dependence on a sibling status overlay, and is structured around four equally-relevant tab destinations. A **publication page** has a clear primary reading flow—viewer ⇒ parameters ⇒ README ⇒ files—with parameters being the only piece users _interact with_ mid-scroll.

**Implication**: Rather than copy the four-tab drawer, scroll the publication naturally and use a **single bottom-sheet trigger** for parameters when the device is mobile. This is the pattern Shapr3D's 2026 refresh advocates ("context-aware tools, not toolbar labyrinths") and matches Vercel's v0 iOS preview rework (preview without forcing landscape, content stays inline by default).

### Finding 9: Missing README must degrade silently

A publication that doesn't ship a `readme.md` is a normal state, not an error. Current loader fetches all `data.files` indiscriminately; a graceful path is to (a) compute `readmeKey` (case-insensitive lookup for `readme.md` / `README.md`) at parse time and (b) render the README card only when present, _without_ fetching, parsing, or warning when absent.

## Target Layout Concept

```text
┌─────────────────────────────────────────────────────────────────┐
│ Header bar                                                      │
│   Title  · visibility badge  · Fork [count]                     │
│   Author strip: avatar  Name  · Published Mar 24  · 1.2k views  │
├─────────────────────────────────────────────────────────────────┤
│ Viewer stage  (aspect-video, centered, max-w reading column)    │
│   ↳ overlay: zoom/pan controls; status pill bottom-center       │
├─────────────────────────────────────────────────────────────────┤
│ Parameters card     │  Downloads card                           │
│   (collapsible on   │   (anchored directly under parameters –   │
│   narrow widths)    │    no flex-1 slack)                       │
├─────────────────────────────────────────────────────────────────┤
│ README card  (MarkdownViewer; constrained prose width;          │
│   math-enabled; renders only when readme.md is present)         │
├─────────────────────────────────────────────────────────────────┤
│ File explorer  (manifest-derived tree; entry file pinned;       │
│   keyboard navigable; lazy file content modal)                  │
└─────────────────────────────────────────────────────────────────┘
```

Desktop layout uses a **two-column grid** for Parameters/Downloads when ≥ `lg`, collapsing to single-column at `< lg`. README and explorer remain full-width on every breakpoint.

## Mobile UX Strategy (deep dive)

### Audit of `preview-mobile.tsx`

| Concern               | Preview mobile (editor)                   | Publication mobile (showcase)                 |
| --------------------- | ----------------------------------------- | --------------------------------------------- |
| Primary flow          | Concurrent edit + visualise               | Read + interact then maybe fork               |
| Tab cardinality       | 4 equal tabs (Model/Files/Params/Details) | 1 primary scroll; Parameters interactive      |
| Drawer visibility     | Persistent partial drawer, snap 0.5/0.85  | Trigger-based bottom sheet                    |
| Viewer always visible | Yes (full height)                         | Yes when scrolled to top, then natural scroll |
| Header chrome         | Hidden (relies on app shell)              | Title + author should remain on top           |
| Empty `Model` tab     | Required artefact of pattern              | Avoid—no empty placeholders                   |

### 2026 best practice synthesis

- **Adaptive UI** (Shapr3D refresh): identical mental model across desktop/mobile, surfacing tools by context.
- **Stay-on-canvas controls**: keep the viewer rendered while parameters change—Shapr3D, Archisketch, Scene Viewer all do this.
- **No forced rotation / no forced fullscreen**: Vercel v0 explicitly removed the "switch to landscape" requirement.
- **Bottom sheet (Vaul) for transient interaction** _only_ when the underlying canvas needs to remain visible during the interaction.
- **Linear March 2026 refresh** keeps headers consistent across surfaces; consistent header is the orientation anchor.

### Recommendation: showcase-first scroll with a parameters bottom sheet

```text
Scroll position 0:
┌──────────────────────────┐
│ Title · ⋯ menu           │
│ Author · views · date    │
│ ──────────────────────── │
│ [Viewer 16:9]            │
│ [Adjust parameters ▼ btn]│ ← opens vaul sheet (snap 0.45 / 0.92)
│ Fork (sticky CTA)        │
└──────────────────────────┘
Scroll continues:
│ README markdown          │
│ File tree                │
└──────────────────────────┘
```

Implementation notes:

1. Reuse the **`Drawer`** Vaul wrapper already present at `apps/ui/app/components/ui/drawer.js`.
2. Snap points `[0.45, 0.92]` so users can keep the viewer visible while tweaking parameters.
3. While the sheet is open, dim the page behind via Vaul's overlay (`modal={true}`) — this differs from preview-mobile (`modal={false}`) because publication mode has no concurrent editing requirement.
4. The bottom sheet hosts **Parameters and Downloads**, mirroring desktop pairing—Downloads is the natural "after I've tweaked, I want the file" continuation.
5. Skip the four-tab nav entirely; the page is a single scroll.
6. **Sticky author/title** at top while viewer scrolls out of view (`position: sticky` on a slim 40 px row) preserves orientation.
7. Honour `prefers-reduced-motion` on sheet animations.

This is the smallest deviation from `preview-mobile.tsx` that respects the consumption-vs-editing distinction without inventing new primitives.

## View-Count Tracking Architecture

### Goals

- **Honest** (a view ≈ an intentional human view).
- **Privacy-respecting** (no third-party cookies; no PII at rest beyond the existing better-auth session).
- **Per-user reliable** (a single user does not inflate the count by reload-spamming).
- **Resilient** (no race conditions on the counter).
- **Cheap** (HLL ≈ 12 KB / period / publication; Redis is already in the stack).

### Identity model

| Viewer                | Identity used for dedup                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Authenticated session | `session.userId` (better-auth) hashed with a server-side pepper                                                                                 |
| Anonymous             | First-party technical cookie `tau_view_id` (HMAC-protected, 365-day TTL, `SameSite=Lax`, `Secure`) — survives consent state per GDPR Recital 30 |

The cookie **does not** identify the user beyond the dedup window; it is rotated server-side on every authenticated login (preventing pre-login dedup leakage into a logged-in identity).

### Edge protocol

1. Page loads `/v/:id`; loader returns publication payload as today.
2. Client mounts viewer; starts dwell timer.
3. Dwell condition (research-derived): **≥ 10 s** _and_ at least one of {orbit/zoom/pan event, parameter change, fork click, download click}. Conservative vs YouTube's 30s because CAD models are interacted with quickly.
4. Once satisfied, client issues `PATCH /v1/publications/:id/views` with no body. Cookie carries identity.
5. Server-side handler:
   1. Validates session/cookie identity.
   2. Computes `viewerHash = sha256(pepper || identity)`.
   3. `PFADD pub:{id}:viewers:{yyyymmdd} viewerHash` (24-hour HLL bucket, 26-hour TTL).
   4. If `PFADD` returned `1` (new add → unique today):
      - Atomic `UPDATE publications SET view_count = view_count + 1 WHERE id = $1 RETURNING view_count`.
      - Optionally append to `publication_view_events(publication_id, viewer_hash, occurred_at)` for forensics, partitioned by day. Marked optional (P2) to avoid premature retention scope.
   5. Returns `204 No Content` (counter is best-effort; never blocks UX).
6. Client treats every PATCH response as success; UI counts come from the next loader (or are stale until the next render).

### Anti-fraud envelope

| Layer                 | Mechanism                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Per-identity rate cap | Reject more than **5 PATCH calls / 24 h / publication** at the edge before HLL — mirrors YouTube cap                    |
| Per-IP rate cap       | Existing API rate limiter applies; `PATCH /views` is a cheap endpoint and goes through the same throttle                |
| Bot heuristics        | Same dwell + interaction gate; PATCH is only sent after the gate, so headless visits with no DOM events never increment |
| Replay resistance     | The cookie HMAC includes `(viewerId, issuedAt, secret)`; rotating the secret invalidates any harvested cookies          |
| Owner self-views      | `viewerHash == ownerHash` short-circuits `PFADD` and never increments — owners shouldn't inflate their own pages        |

### Storage / index updates

- `publication_view_events` (P2 optional, partitioned by `occurred_at::date`, indexes `(publication_id, occurred_at desc)` and `(viewer_hash, publication_id)`).
- HLL keys live exclusively in Redis.
- No new column on `publications`—`view_count` already exists.

### `PATCH` route shape

```ts
// apps/api/app/api/publications/publications.controller.ts
@Patch(':id/views')
@HttpCode(HttpStatus.NO_CONTENT)
@OptionalAuth()
public async recordView(
  @Param('id') publicationId: string,
  @OptionalUser('id') viewerUserId: string | undefined,
  @Req() request: FastifyRequest,
): Promise<void> {
  await this.publicationsService.recordView({ publicationId, viewerUserId, request });
}
```

### Observability

- Metric `publication_views_total{publicationId, deduped}` — increments per PATCH split by HLL outcome.
- Metric `publication_views_rejected_total{reason}` — `cap_exceeded`, `owner_self_view`, `rate_limited`, `bad_cookie`.
- Trace span `publications.recordView` wraps PFADD + UPDATE.

## Accessibility Plan

| Surface               | Requirement                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Header / author strip | Real `<h1>` for title; author rendered as semantic `<address>` with avatar `alt`; visibility badge `<span>` with `aria-label` ("Public publication")                                 |
| Viewer                | Keyboard handlers for orbit/zoom/pan via existing CAD canvas; `role='img'` with `aria-label` describing the model; status pill exposed as `role='status'` `aria-live='polite'`       |
| Parameters            | Inherit `Parameters` accessibility (form labels per RJSF); collapsible card uses Radix Collapsible with proper `aria-expanded`                                                       |
| Downloads             | Buttons (not divs) per format; `aria-label` includes the format and projected size                                                                                                   |
| README                | `MarkdownViewer` already produces semantic HTML; ensure heading order does not skip levels (post-process if needed); KaTeX nodes carry `aria-label` of the original LaTeX expression |
| File explorer         | `role='tree'` / `role='treeitem'`; arrow-key navigation; `aria-expanded` on directories; entry-file pinned with `aria-current='page'`                                                |
| Bottom sheet (mobile) | Use `Drawer` `DrawerTitle` + `DrawerDescription` (already in `preview-mobile.tsx`); first focusable element is the close handle; `Esc` closes; backdrop is `aria-hidden`             |
| Reduced motion        | Respect `prefers-reduced-motion` for sheet/transition animations and viewer auto-orbit (if any)                                                                                      |
| Contrast              | Verify the muted viewer chrome against `bg-muted` baseline meets WCAG AA against the new framed background                                                                           |

## Recommendations

| #   | Action                                                                                                                                                                                                                                             | Priority | Effort | Impact |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | Remove `flex-1` chain in `PublicationParametersAside`; place Downloads directly under Parameters; restructure into the new top-down layout (viewer → params/downloads → README → explorer)                                                         | P0       | Low    | High   |
| R2  | Frame viewer as `aspect-video` centered within reading column; preserve zoom/pan; verify on portrait mobile                                                                                                                                        | P0       | Medium | High   |
| R3  | Extend `ParsedPublication` to include `ownerSnapshot` (denormalized name/avatar), `forkCount`, `viewCount`, `createdAt`; add author strip + counts row                                                                                             | P0       | Medium | High   |
| R4  | Add author denormalization at publish/fork time (`ownerSnapshot` JSON column on publications row); migration path for existing rows backfills via better-auth read                                                                                 | P0       | Medium | High   |
| R5  | Detect `readme.md` (case-insensitive) in `data.files`; render via `MarkdownViewer` below viewer; **silently omit when absent**                                                                                                                     | P1       | Medium | High   |
| R6  | Build manifest-derived `<PublicationFileExplorer>` below README; tree with sorted folders, entry-file highlighted, keyboard navigation, modal/inline preview for individual files                                                                  | P1       | Medium | Medium |
| R7  | Harden README markdown trust posture: re-introduce a sanitize subset for the publication-only render path (do not affect chat/internal docs); proxy external images; force `rel='nofollow noopener'` on links                                      | P1       | Medium | High   |
| R8  | Implement `PATCH /v1/publications/:id/views` with dwell+interaction gate, identity (session or first-party `tau_view_id` cookie), Redis HLL dedup (`pub:{id}:viewers:{yyyymmdd}`), atomic Postgres `UPDATE … RETURNING`, owner self-view exclusion | P0       | High   | High   |
| R9  | Add anti-fraud envelope: per-identity 5/day cap, existing per-IP rate limiter, secret-rotation strategy for the dedup cookie                                                                                                                       | P0       | Medium | High   |
| R10 | Add metrics `publication_views_total{deduped}`, `publication_views_rejected_total{reason}` and trace span `publications.recordView`                                                                                                                | P1       | Low    | Medium |
| R11 | Mobile: implement single-scroll showcase with sticky title/author bar and **Parameters bottom sheet** trigger (Vaul, snap `[0.45, 0.92]`, `modal=true`) hosting Parameters + Downloads; do **not** copy the four-tab drawer                        | P0       | Medium | High   |
| R12 | Accessibility pass per the plan above; include automated checks (`@axe-core/playwright` if available) on the new route                                                                                                                             | P0       | Medium | High   |
| R13 | Hardened external-link handling in README: `MarkdownHyperlink` already enforces this for chat/docs—verify or extend the same constraints in the publication path                                                                                   | P1       | Low    | Medium |
| R14 | Optional `publication_view_events` table for forensics, partitioned by day (P2; not required to ship)                                                                                                                                              | P2       | Medium | Medium |

## Trade-offs

| Dimension                | Option A                                                     | Option B                                       | Recommendation                                                        |
| ------------------------ | ------------------------------------------------------------ | ---------------------------------------------- | --------------------------------------------------------------------- |
| Author enrichment        | Denormalize `ownerSnapshot` at publish/fork                  | Resolve via runtime profile join               | A (mirrors existing OG/thumb denorm; avoids N+1)                      |
| README sanitization      | Sanitize subset in MarkdownViewer for publication route only | Sandboxed iframe                               | A (smaller blast radius; iframe complicates KaTeX styling)            |
| View dedup               | Redis HLL + Postgres counter                                 | Postgres-only with raw events                  | A (cheap, privacy-friendly, scales)                                   |
| View identity            | First-party cookie + better-auth session                     | Anonymous IP-only                              | A (IP collisions on mobile networks; cookie survives consent changes) |
| Mobile pattern           | Single-scroll + Parameters sheet                             | Replicate `preview-mobile.tsx` four-tab drawer | A (consumption ≠ editing; avoids empty `Model` tab artefact)          |
| Counter increment timing | Atomic update on every dedup-pass PATCH                      | Bucketed fanout aggregated nightly             | A initially; revisit B only when contention shows up in metrics       |
| Counter cache            | None (UPDATE … RETURNING serves both)                        | Materialized aggregate                         | None (hot data fits in Postgres easily at expected scale)             |

## References

- [Castmagic: How does YouTube count views?](https://www.castmagic.io/post/how-does-youtube-count-views)
- [YTShark: What counts as a view on YouTube (2026 guide)](https://ytshark.com/what-counts-as-a-view-on-youtube/)
- [Redis HyperLogLog docs](https://redis.io/docs/latest/develop/data-types/probabilistic/hyperloglogs)
- [Cybertec: How to count hits in PostgreSQL](https://www.cybertec-postgresql.com/en/how-to-count-hits-on-a-website-in-postgresql/)
- [SQLForDevs: Concurrent counter updates](https://sqlfordevs.com/concurrent-updates-locking)
- [Vercel: Designing the v0 iOS app](https://vercel.com/blog/how-we-built-the-v0-ios-app)
- [Shapr3D visual refresh: readying CAD for mobile evolution](https://shapr3d.com/content-library/behind-the-shapr3d-user-interface-refresh)
- [Linear UI refresh — March 2026](https://linear.app/changelog/2026-03-12-ui-refresh)
- Tau internals: `apps/ui/app/routes/v.$id/route.tsx`, `apps/ui/app/routes/projects_.$id_.preview/preview-mobile.tsx`, `apps/ui/app/components/markdown/markdown-viewer.tsx`, `apps/api/app/api/publications/publications.dto.ts`, `apps/api/app/database/schema.ts`
- Related: `docs/research/sharing-architecture.md`, `docs/research/sharing-mvp-manual-runbook.md`
- Policies: `docs/policy/ui-policy.md`, `docs/policy/accessibility-policy.md`

## Appendix

### A. Layout order rationale (Q vs prior draft)

The earlier draft put README _above_ the viewer. Stakeholder direction (and 2026 product-page convention—Apple, Spotify, Bandcamp) is that **the artefact comes first**: viewer → controls → narrative → sources. This rewrites the layout accordingly while preserving the modular cards.

### B. Items explicitly deferred

- **6.4 Performance (prioritized fetch for entry/README before bulk blobs)** — not in scope; revisit when bulk blob count or size shows real LCP regressions.
- **6.5 Deep linking to individual files** — out of scope.

### C. Loader payload sketch (UI expectations)

The publication loader already returns structured URLs plus manifest metadata (`PublicationRouteLoaderData` in `route.tsx`). README integration should treat `data.files['readme.md']` (case-normalised lookup) as optional—absence is a normal state and never warrants an error UI.

### D. Resolved questions and deferrals

1. **`ownerSnapshot` placement** — **Resolved: inline JSON column on `publications`**. Cheaper for read-heavy publications, matches the existing OG/thumbnail denormalization pattern, and avoids a join on every viewer hit. R4 implements this.
2. **Fork count visibility (private forks)** — **Deferred**. Pending sharing-architecture decisions; revisit when fork visibility tiers exist.
3. **Remote-configurable dwell threshold** — **Deferred**. Ship the constant initially; revisit once real-world traffic data justifies tuning.
4. **`publication_view_events` regional/sharded layout** — **Deferred**. Single-region MVP; revisit before enabling the optional table (R14) at scale.
