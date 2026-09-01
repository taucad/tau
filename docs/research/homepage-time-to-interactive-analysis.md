---
title: 'Homepage Time-to-Interactive Analysis'
description: 'Root cause investigation of the 5–6 s time-to-interactive on the homepage chat composer based on a Chrome DevTools performance trace'
status: active
created: '2026-05-04'
updated: '2026-05-04'
category: investigation
related:
  - docs/research/ui-startup-performance-gap-analysis.md
  - docs/research/large-repo-import-performance.md
  - docs/research/shared-worker-gate-startup-performance.md
---

# Homepage Time-to-Interactive Analysis

Root cause investigation of the 5–6 s time-to-interactive observed on the homepage (`/`) chat composer, based on a Chrome DevTools enhanced performance trace captured at `2026-05-04T08:32:49Z` covering ~6.57 s from `navigationStart` to settle.

## Executive Summary

The homepage main thread is blocked for **~4.4 s out of the first 6.5 s** after `navigationStart`. Time-to-first-interactivity (the user being able to type into the chat composer) is gated on three sequential blocking phases:

1. **React initial render + StrictMode double-invoked effect commits — ~1.2 s** (1.5 s → 2.7 s after nav). A very large eager component tree (sidebar + 10 community `ProjectCard`s × 3 Radix `Tooltip`s each + many `Skeleton` placeholders + `KernelSelector` hover-cards + `RootCommandPaletteItems` + nested providers) is mounted in dev with `react-dom-DpHGLBgy.js` (development build) and `react_jsx-dev-runtime.js` instrumentation overhead.
2. **PostHog network waterfall — ~700 ms** (2.0 s → 2.78 s). Sequential fetches: `posthog-js_react.js` → `/api/ph/array/.../config.js` (decide) → 5 auto-capture extension chunks → `posthog-recorder.js`.
3. **PostHog rrweb `takeFullSnapshot` — 2.56 s synchronous main-thread block** (2.78 s → 5.34 s). The single largest hotspot in the entire trace; 18,075 main-thread CPU samples (≈70 %) of the 2.5 s window are inside `r.onload → start → rh → Re → it → ye → e.mirror → q.doc → doc → et`, which is rrweb's recursive DOM serializer (`serializeNodeWithId`). This runs even though the kernel boot's `disable_session_recording: true` is set, because `DeferredSessionRecording` calls `posthog.startSessionRecording()` from `requestIdleCallback`, and that method internally calls `set_config({ disable_session_recording: false })` before triggering the snapshot.

A single fix — **stop calling `startSessionRecording()` on the homepage** — eliminates the 2.5 s block immediately. Removing eager `posthog-js/react` and `@tiptap/*` imports from the homepage critical path can cut another ~600–800 ms.

## Table of Contents

- [Methodology](#methodology)
- [Trace Timeline](#trace-timeline)
- [Findings](#findings)
- [Recommendations](#recommendations)
- [Code Examples](#code-examples)
- [Appendix: Raw Sample Aggregates](#appendix-raw-sample-aggregates)

## Problem Statement

> The homepage chat composer (the focal point of the landing experience) takes 5–6 s before the user can type. The user notices a hard freeze where the spinner/cursor cannot enter the textarea.

Goal: identify every blocker on the critical path from `navigationStart` to first interaction with `<ChatTextarea>`, with line-of-code citations and prioritised recommendations.

## Methodology

The trace `Trace-20260504T083249.json.gz` was decompressed (148 MB JSON, 493,892 events) and post-processed with Python to:

1. Locate `navigationStart` and use it as t=0.
2. Enumerate `RunTask`/`FunctionCall` events with `dur > 30 ms` to identify long tasks.
3. Identify the giant `FunctionCall` (`functionName="r.onload"`, dur=2553 ms) and pull its `url` argument.
4. Reconstruct the main-thread CPU profile from the V8 sampling profiler (`Profile id=0x1, pid=83891, tid=13327407=CrRendererMain`, 198,248 samples, 19,734 nodes), reapply `timeDeltas` to recover per-sample timestamps.
5. Bucket samples into 100 ms windows to compute main-thread busy %.
6. Aggregate inclusive sample counts up the call stack across phase windows (1.1–1.5 s, 1.5–1.9 s, 1.9–2.7 s, 2.7–2.9 s, 2.9–5.4 s, 5.3–5.55 s, 6.1–6.3 s).
7. Cross-reference hot frames with source files in `apps/ui/app/`, `node_modules/posthog-js`, and the Vite dep cache `node_modules/.vite/apps/ui/deps/`.

All traces were captured against `nx dev` (Vite dev server, React 19 development build). Production behaviour will differ in magnitude but the structural blockers (PostHog session recording, eager imports, eager component tree) remain.

## Trace Timeline

| Mark                                        |              t (ms) | Notes                                                                                         |
| ------------------------------------------- | ------------------: | --------------------------------------------------------------------------------------------- |
| `navigationStart`                           |                 0.0 |                                                                                               |
| `commitNavigationEnd`                       |               333.4 | SSR HTML received                                                                             |
| `MarkDOMContent` / `domInteractive`         |               409.1 | DOM parsed                                                                                    |
| `firstContentfulPaint` / first `LCP`        |               478.5 | SSR-rendered shell paints                                                                     |
| `posthog-js_react.js` request sent          |               563.0 |                                                                                               |
| Background script parsing window            |          600 → 1100 | Vite optimised deps (`lucide-react`, `xstate`, `motion`, `zod`, etc.) parse off-thread        |
| **Main-thread block A — module evaluation** |         1100 → 1500 | 400 ms `(program)` + Zod `init` (12 % of window).                                             |
| **Main-thread block B — initial render**    |         1500 → 1900 | 400 ms; React `renderRootConcurrent` walking the tree.                                        |
| **Main-thread block C — commit phase**      |         1900 → 2700 | 800 ms; `commitPassiveMountOnFiber` + StrictMode `recursivelyTraverseAndDoubleInvokeEffects`. |
| `MarkLoad`                                  |              1555.6 | (window `load` event — but the page is far from interactive)                                  |
| PostHog `/api/ph/array/.../config.js`       |              1953.4 |                                                                                               |
| PostHog auto-capture chunks (5 files)       |         2067 → 2082 | dead-clicks, web-vitals, exception, surveys, logs                                             |
| `posthog-recorder.js` request sent          |              2780.5 |                                                                                               |
| **Main-thread block D — rrweb snapshot**    | **2784.5 → 5347.7** | **2562 ms synchronous** `r.onload`. Smoking gun.                                              |
| `largestContentfulPaint::Candidate`         |              2391.3 | Final LCP candidate (the chat composer)                                                       |
| Brief idle / image decoding                 |         5550 → 6100 | Multiple ~20 ms `Decode Image` events (community thumbnails)                                  |
| Main-thread block E — late render           |         6100 → 6300 | 200 ms; `LazySection` intersection callbacks fire, more commit work                           |

Per-100 ms main-thread busy %:

```text
 1100ms-1500ms  ███████████████████  (≈100%, 400ms block)
 1500ms-2700ms  ████████████████████ (≈100%, 1200ms block — React)
 2700ms-2900ms  ████████████████████ (PostHog start + tail of React)
 2900ms-5400ms  ████████████████████ (≈100%, 2500ms block — rrweb)
 5400ms-5500ms  ████████████████████
 5500ms-6100ms  █████░░░░░░░░░░░░░░░ (mostly idle)
 6100ms-6300ms  ████████████████████ (200ms block — LazySection fires)
```

## Findings

### Finding 1: PostHog `startSessionRecording()` blocks the main thread for 2.56 s during a `requestIdleCallback`

**Severity: P0 / Smoking gun.** Single largest hotspot in the trace.

The big `FunctionCall` event:

```
ts=2784.5ms after nav, dur=2553.19ms
functionName: r.onload
url: http://localhost:3000/@fs/Users/rifont/git/tau/node_modules/.vite/apps/ui/deps/posthog-js_react.js
lineNumber: 746, columnNumber: 86
```

CPU profile breakdown of the 2.5 s window (inclusive % of main-thread samples):

| Frame                                       | Inclusive % | Notes                                                                          |
| ------------------------------------------- | ----------: | ------------------------------------------------------------------------------ |
| `r.onload` (posthog-js_react.js:745)        |       71.6% | onload handler for the dynamically inserted `<script src=posthog-recorder.js>` |
| `Hr` / line 4993 of posthog-js_react.js     |       71.6% | `loadScript` / lazy-loader callback                                            |
| `start` (posthog-recorder.js)               |       71.6% | Recorder boot                                                                  |
| `rh` → `Re` → `it` → `ye`                   |       71.6% | rrweb pipeline                                                                 |
| **`e.mirror.doc` → `q.doc` → `doc` → `et`** |   **70.2%** | rrweb's `serializeNodeWithId` traversal                                        |

Even with the comment in `apps/ui/app/lib/posthog.lib.ts` documenting the rrweb-snapshot risk and setting `disable_session_recording: true`, the snapshot still runs because `DeferredSessionRecording` re-enables recording in an idle callback:

```116:138:apps/ui/app/hooks/use-analytics.tsx
export function DeferredSessionRecording(): React.ReactNode {
  const posthog = usePostHog();

  useEffect(() => {
    const start = () => {
      posthog.startSessionRecording();
    };

    if ('requestIdleCallback' in globalThis) {
      const id = requestIdleCallback(start);
      return () => {
        cancelIdleCallback(id);
      };
    }

    const id = setTimeout(start, 0);
    return () => {
      clearTimeout(id);
    };
  }, [posthog]);

  return undefined;
}
```

`posthog.startSessionRecording` then _unconditionally_ re-enables the disable flag inside `posthog-js`:

```2530:2556:node_modules/posthog-js/lib/src/posthog-core.js
PostHog.prototype.startSessionRecording = function (override) {
    var _a, _b, _c, _d, _e;
    // … sampling/linked_flag/url_trigger/event_trigger overrides …
    this.set_config({ disable_session_recording: false });
};
```

`set_config({ disable_session_recording: false })` triggers the recorder load+start path in `posthog-js`, which:

1. Injects a `<script src=/api/ph/static/posthog-recorder.js?v=1.353.1>` (request goes out at t=2780 ms).
2. On its `onload`, calls `start()` (rrweb), which calls `e.mirror.doc(document)` → recursive `serializeNodeWithId` over **every DOM node in the homepage** (the existing comment cites 1,974 nodes; with the new sidebar/grid this could now be larger).
3. The traversal is single-threaded JS with no yielding, so it consumes 2,553 ms straight.

`requestIdleCallback` was the wrong abstraction: it correctly waits for the page to _appear_ idle, but the work it schedules then re-blocks the main thread for 2.5 s, undoing the entire benefit. The user perceives the page as ready (LCP fired at 2.39 s, the input is visible), then it locks up just as they reach for it.

### Finding 2: PostHog network waterfall is 9 sequential requests gating the snapshot

**Severity: P1.**

| t (ms) | URL                                                   | Bytes (JS)           |
| -----: | ----------------------------------------------------- | -------------------- |
|    563 | `posthog-js_react.js` (Vite dep)                      | bundle root          |
|   1953 | `/api/ph/array/<token>/config.js`                     | feature flags decide |
|   2067 | `/api/ph/static/dead-clicks-autocapture.js?v=1.353.1` |                      |
|   2068 | `/api/ph/static/web-vitals.js?v=1.353.1`              |                      |
|   2068 | `/api/ph/static/exception-autocapture.js?v=1.353.1`   |                      |
|   2082 | `/api/ph/static/surveys.js?v=1.353.1`                 |                      |
|   2082 | `/api/ph/static/logs.js?v=1.353.1`                    |                      |
|   2780 | `/api/ph/static/posthog-recorder.js?v=1.353.1`        | rrweb                |

`__preview_deferred_init_extensions: true` correctly defers extensions to time-sliced tasks, but it does **not** defer the recorder. The decide endpoint at 1953 ms blocks the recorder request until 2780 ms.

### Finding 3: React initial render + commit phase consumes 1.2 s before PostHog touches the page

**Severity: P0.** Even removing PostHog entirely would still leave the main thread busy from 1.1 s → 2.7 s.

CPU profile during 1500–2700 ms (top app-code leaf samples, dev mode):

| Function                                |    Sample count | File                                            |
| --------------------------------------- | --------------: | ----------------------------------------------- |
| Radix `Provider` (TooltipProvider, etc) |             730 | `dist-DuXpcUND.js` (Radix UI)                   |
| `ProjectCard`                           |             620 | `app/components/project-grid.tsx:54`            |
| `KernelSelector`                        |             490 | `app/components/chat/kernel-selector.tsx`       |
| `Skeleton`                              |             446 | `app/components/ui/skeleton.tsx`                |
| `Tooltip` / `TooltipPortal` / `Popper`  | 434 + 433 + 221 | Radix UI                                        |
| `getTaskName` / `createElement` (DEV)   |       429 + 425 | `react-DHLFQYKL.js` (dev runtime)               |
| `NavHistoryItem`                        |             200 | `app/components/nav/nav-history.tsx:295`        |
| `Button`                                |             171 | `app/components/ui/button.tsx`                  |
| `NavUser`, `AppSidebar`, …              |        133 + 87 | `app/components/nav/`, `app/components/layout/` |

Top inclusive React-internal frames (1900–2700 ms):

| Frame                                       | Inclusive samples |       % of phase |
| ------------------------------------------- | ----------------: | ---------------: |
| `commitPassiveMountOnFiber`                 |         1,653,761 | 1546 % (parents) |
| `recursivelyTraversePassiveMountEffects`    |         1,634,481 |           1528 % |
| `commitMutationEffectsOnFiber`              |           500,767 |            468 % |
| `recursivelyTraverseAndDoubleInvokeEffects` |           215,702 |            202 % |
| `commitLayoutEffectOnFiber`                 |           144,762 |            135 % |

The `recursivelyTraverseAndDoubleInvokeEffects` frame is the React 19 dev-only StrictMode double-invoke. It is _not_ present in production but it doubles every effect's cost on first mount, which compounds on this large eager tree.

#### Finding 3a: `<CommunityProjectGrid>` mounts 10 cards × 3 `<Tooltip>` each on the critical path

`apps/ui/app/components/project-grid.tsx` lines 116–219 render, per card, a Radix `Tooltip` for the preview-eye button, an inline `Tooltip` per kernel chip (currently 0 because `kernels = useMemo(() => [], …)`), and another `Tooltip` for the Remix button. Each `<Tooltip>` instantiates a `TooltipProvider` → `Tooltip` → `TooltipTrigger` → `TooltipPortal` → `Popper` chain (5 React component instances). With 10 cards × 2 active Tooltips = 20 Tooltip chains × ~5 = **~100 component instances just for Tooltips on the homepage above the fold**.

The grid is wrapped in `<LazySection minHeight='400px' rootMargin='200px' …>` — but the grid sits ~600 px below the fold, well within `viewport + 200px`, so the IntersectionObserver fires on initial paint and the deferral is effectively a no-op (see Finding 4).

#### Finding 3b: `AppSidebar` + `NavHistoryItem` × N and `RootCommandPaletteItems` are rendered eagerly

`Page` → `AppSidebar` mounts `NavHistoryItem` for every recent project (visible in the screenshot: "Hollow Box (Remix…)", "test", "Adjustable Scissors", "Bolted Hydraulic Cy…", etc.). Sidebar work shows up as 200 + 87 + 84 + 78 + 78 sample counts during the render block.

### Finding 4: `LazySection`'s `rootMargin: '200px'` defeats the purpose of below-the-fold deferral on the homepage

`apps/ui/app/components/ui/lazy-section.tsx` defers children until the sentinel intersects with `viewport + rootMargin`. The homepage uses `rootMargin='200px'` for the community grid — the grid starts ~500 px below the fold and is 600 px tall, so on most viewports the IntersectionObserver fires immediately on first paint. Net effect: **none of the LazySection-wrapped sections are actually deferred** on initial render. They are deferred only against the very first `IntersectionObserver` callback (≈ 1 frame) but mount on the next.

This is visible in the trace: ProjectCard appears at the top of the leaf-sample list during the 1.5–2.7 s window, despite being ostensibly "below the fold."

### Finding 5: Eager top-level imports drag heavy dependencies onto the critical path

The Vite dep manifest shows the following modules being parsed/evaluated before the chat composer is interactive (these are _parsed_, not all evaluated, but each adds parse cost on the main thread when its module is first imported):

| Dependency                                                                                                                         |     Parse (ms) | Necessary on homepage?                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------: | -------------------------------------------------------------------------------------------------------------------------------- |
| `lucide-react` + `lucide-react-7ar1Pl4-`                                                                                           |       26 + 109 | Partial — only ~10 icons visible                                                                                                 |
| `xstate.development.esm`                                                                                                           |             39 | Loaded by `useActorRef(fileManagerMachine)`. Heavy.                                                                              |
| `motion` (framer-motion)                                                                                                           |             35 | Used by `InteractiveHoverButton`                                                                                                 |
| `zod`                                                                                                                              |             43 | Imported transitively (form schemas).                                                                                            |
| `@tiptap/*` (Document, Paragraph, Text, HardBreak, History, Placeholder, ProseMirror)                                              | aggregate ~150 | Required only when the user actually types — but statically imported by `apps/ui/app/components/chat/tiptap/use-chat-editor.ts`. |
| `isomorphic-git`                                                                                                                   |             11 | Should not be on the homepage at all.                                                                                            |
| `@tanstack/react-query`                                                                                                            |              5 | Required (root provider).                                                                                                        |
| `@gltf-transform_functions`, `Addons-CMg1Ie9C` (three.js extras), `@react-three/drei`, `@react-three/postprocessing`, `GLTFLoader` | aggregate ~225 | Background-parsed only — `LazyHeroViewer` correctly defers them via `lazy() + IntersectionObserver`. ✓                           |

`use-chat-editor.ts` lines 1–22 statically import the entire TipTap stack:

```1:22:apps/ui/app/components/chat/tiptap/use-chat-editor.ts
import { useEditor } from '@tiptap/react';
import { Document } from '@tiptap/extension-document';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { HardBreak } from '@tiptap/extension-hard-break';
import { History } from '@tiptap/extension-history';
import { Placeholder } from '@tiptap/extension-placeholder';
import type { Editor, JSONContent } from '@tiptap/core';
import { Slice } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
…
import { ContextChipNode } from '#components/chat/tiptap/context-chip-node.js';
import { SubmitOnEnter } from '#components/chat/tiptap/submit-on-enter.js';
import { ChatInputDropHandler } from '#components/chat/tiptap/chat-input-drop-handler.js';
import { ContextMention } from '#components/chat/tiptap/context-suggestion.js';
import { SlashCommand, defaultSkills } from '#components/chat/tiptap/slash-command-suggestion.js';
```

`use-chat-editor.ts` is in turn imported by `chat-textarea-desktop.tsx` (which `chat-textarea.tsx` references unconditionally). So TipTap is on the home page critical path even though the user has not yet typed anything.

`chat-textarea.tsx` does wrap the desktop/mobile body in `<ClientOnly fallback={skeleton}>` — but `ClientOnly` only defers the render, not the _static_ module graph. Vite still hoists every static import in the chain.

### Finding 6: Root providers run heavy side-effects on every route, including the homepage

`apps/ui/app/root.tsx` wraps every route in:

```98:121:apps/ui/app/root.tsx
<AuthConfigProvider>
  <QueryClientProvider client={queryClient}>
    <AnalyticsProvider>
      <FileManagerProvider rootDirectory='/'>
        <ProjectManagerProvider>
          <ThemeProvider …>
            <ColorProvider>
              <TooltipProvider>
                <KeyboardProvider>
                  <UnloadProvider>
                    <ChatSessionStoreProvider>
                      <GlobalChatFlushGuard />
                      <LayoutDocument …>
```

`<FileManagerProvider rootDirectory='/'>` instantiates the file-manager XState actor, which boots the shared FS worker, IndexedDB, mount tables, and `FileContentService` / `FileTreeService`. The CPU profile shows `_resolveProvider` (`workspace-file-service.ts:896`) and `readDirectory` in worker-thread samples concurrent with the main-thread blocks — i.e. the FM worker is also doing significant work during this window. The homepage chat composer doesn't read or write files until the user submits a prompt.

### Finding 7: The earliest 400 ms block (Phase A2) is driven by Zod and module evaluation

CPU profile during 1100–1500 ms:

| Frame                            | %     |
| -------------------------------- | ----- |
| `(program)` (V8 evaluation glue) | 72.4% |
| `init` (`zod-j3LkXGze.js:6`)     | 11.7% |
| `_` (`zod-j3LkXGze.js:28`)       | 5.7%  |

Zod's module-init pre-builds shared constants. With many `z.object({})` schemas in `libs/chat/src/schemas/`, their top-level instantiation runs during module evaluation. This is bounded — but the cumulative module-evaluation cost combined with the React tree above is meaningful.

### Finding 8: The late 6.1–6.3 s block is `LazySection` finally firing for hero/kernels/integration sections

Phase G (200 ms) shows heavy `commitPassiveUnmountOnFiber` (50.7%) — fibers being unmounted/remounted as `LazySection` skeletons swap to real content. The community grid was already eagerly mounted (Finding 4); this block is the four remaining `<LazySection>` wrappers (`HeroImage`, `KernelsSection`, `IntegrationSection`, `ComingSoonSection`, `CtaSection`) flipping `isVisible=true` once their sentinels intersect. Although these are below the fold, the cost still lands on the main thread _after_ the user has been blocked for 5+ s.

### Finding 9: The repository's documented mitigations are incorrect or incomplete

`AGENTS.md` (Learned Workspace Facts) currently asserts:

> PostHog analytics loaded lazily via `posthog.lib.ts` — static import blocks main thread ~2.5s during startup

This is wrong on two counts:

1. PostHog is **not** lazily loaded. `apps/ui/app/hooks/use-analytics.tsx` line 1 statically imports `posthog-js/react` and `AnalyticsProvider` is mounted at the root of every route in `root.tsx`.
2. The 2.5 s block is **not** caused by static import / parse cost. It is caused by `rrweb.takeFullSnapshot` running synchronously inside `posthog.startSessionRecording()` triggered from `requestIdleCallback`.

Similarly, `apps/ui/app/lib/posthog.lib.ts` lines 17–21 comment:

> Prevent rrweb DOM snapshot on init — the snapshot scales super-linearly with DOM node count and freezes the main thread for ~2.5s on the homepage (1,974 nodes). Session recording is started manually via DeferredSessionRecording after the page is idle.

This correctly identifies the root cause but the chosen remediation (start manually via `requestIdleCallback`) does not actually move the cost off the main thread — it just delays it. The page becomes "appear-interactive" at 2.39 s LCP, idle is reached, `startSessionRecording()` runs, and the user hits a 2.5 s freeze right when they try to type.

## Recommendations

| #   | Action                                                                                                                  | Priority | Effort | Estimated Win                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------------------------------------------------------------- |
| R1  | Stop calling `posthog.startSessionRecording()` on the homepage; gate it on first user interaction inside project routes | **P0**   | Low    | **−2.5 s**                                                        |
| R2  | Lazy-load `posthog-js/react` via dynamic `import()` so it's not in the homepage module graph                            | **P0**   | Low    | −150–300 ms parse + waterfall                                     |
| R3  | Lazy-load TipTap (`use-chat-editor.ts`) on first focus of the composer                                                  | P1       | Med    | −300–500 ms                                                       |
| R4  | Tighten/remove `LazySection rootMargin='200px'` on the community grid; defer until truly in viewport                    | P1       | Low    | −300–500 ms (move ProjectCard/Tooltip cost off TTI critical path) |
| R5  | Replace eagerly-mounted `<Tooltip>` chains in `ProjectCard` with lazy/on-hover Radix mounts                             | P1       | Med    | −100–200 ms                                                       |
| R6  | Skip `FileManagerProvider` initialisation on routes that don't need files (homepage, marketing, legal, docs)            | P1       | Med    | −50–150 ms (main thread) + worker boot off the critical path      |
| R7  | Audit and remove eager top-level `isomorphic-git` import from the homepage critical path                                | P2       | Low    | −20 ms parse + smaller chunk                                      |
| R8  | Move `AnalyticsProvider` below `FileManagerProvider` and conditionally mount it on auth-gated / project routes only     | P2       | Med    | Compounds R1/R2                                                   |
| R9  | Update `AGENTS.md` Learned Workspace Facts entry on PostHog with the correct root cause                                 | P2       | Low    | Future-proofing                                                   |
| R10 | Disable React StrictMode double-invoke effects in dev for the homepage route, or accept dev-only cost                   | P3       | Low    | Dev-only; production unaffected                                   |

### R1 — Stop unconditionally starting session recording on the homepage (P0)

Change `apps/ui/app/hooks/use-analytics.tsx` so that `DeferredSessionRecording` either:

- **Option A (preferred):** Only mounts inside authenticated/project routes, _not_ at the root. The homepage / marketing / legal / docs routes never call `startSessionRecording()`. PostHog itself is still configured; only the recorder is gated.
- **Option B:** Replaces `requestIdleCallback` with a one-shot listener on the _first user interaction_ (`pointerdown`, `keydown`, `touchstart` on `document`, `{ once: true, passive: true }`). The page is fully interactive _before_ the snapshot runs. Users who never interact never trigger the snapshot.
- **Option C:** Use PostHog's server-side `session_recording.sample_rate` (0.0–1.0) so only a percentage of sessions ever load the recorder.

The current `disable_session_recording: true` config option becomes effective again because nothing re-enables it.

### R2 — Lazy-load `posthog-js/react` (P0)

Replace the static import in `apps/ui/app/hooks/use-analytics.tsx` with a dynamic-import boundary. The simplest shape:

```typescript
const PostHogProviderLazy = lazy(async () => {
  const m = await import('posthog-js/react');
  return { default: m.PostHogProvider };
});
```

Wrap `<PostHogProviderLazy>` in `<Suspense fallback={children}>` so the children render immediately while `posthog-js` loads in the background. `useAnalytics()` already gracefully degrades to a noop when no PostHog instance is present (lines 30–41 of the same file), so consumers below the suspense boundary work without modification.

This removes 152 KB+ from the homepage's eager module graph, eliminates the 5 sequential extension fetches from the critical path, and allows the rest of the React tree to render unblocked.

### R3 — Lazy-load TipTap on first focus (P1)

Hoist `useChatEditor` behind a dynamic boundary. One pattern: keep an inert `<textarea>`/`<div contenteditable>` skeleton until the user focuses or clicks the composer area, then hydrate the TipTap editor. Because the skeleton already exists (`chat-textarea-skeleton.tsx`), this is mostly wiring:

```typescript
const ChatEditorLazy = lazy(async () => {
  const m = await import('#components/chat/tiptap/chat-editor.js');
  return { default: m.ChatEditor };
});
```

Render the lazy variant inside a `<Suspense fallback={<ContentEditableShell …/>}>`, and trigger preload (`import('#components/chat/tiptap/chat-editor.js')`) on `pointerover` of the composer container so the bundle warms before focus.

### R4 — Tighten `LazySection` thresholds for the homepage (P1)

For the homepage specifically, drop `rootMargin='200px'` from the community grid and rely on default IntersectionObserver behaviour (intersection only when the sentinel actually enters the viewport). Audit other usages in `apps/ui/app/routes/_index/route.tsx` to ensure `HeroImage`, `KernelsSection`, `IntegrationSection`, `ComingSoonSection`, `CtaSection` are similarly constrained.

Better: replace `LazySection` with `content-visibility: auto` + `contain-intrinsic-size` CSS (browser-native deferral that also benefits paint, layout, and accessibility tree budgets). This requires a brief feature-detection fallback for older browsers.

### R5 — Lazy-mount Tooltips in `ProjectCard` (P1)

Each `ProjectCard` currently mounts a `Tooltip` chain at first render. Replace with a small wrapper that mounts the Radix Tooltip only after the trigger receives `pointerenter`/`focusin`:

```typescript
function LazyTooltip({ children, content }: { … }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return cloneElement(children, {
      onPointerEnter: () => setArmed(true),
      onFocus: () => setArmed(true),
    });
  }
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{content}</TooltipContent></Tooltip>;
}
```

Eliminates ~100 component instances on first render of the home page above the fold.

### R6 — Defer `FileManagerProvider` for routes that don't need it (P1)

Add a `routesNeedingFiles` boundary or expose a `<NoFileManager>` opt-out wrapper. The homepage, `/legal/*`, `/docs/*`, marketing routes do not need the FS worker booted on first paint. The `useFileManager` hook already throws if used outside the provider, so opt-in mounting is safer than opt-out — refactor so `FileManagerProvider` lives below a route boundary that enables it only for `/projects/*`, `/files`, `/import`, `/convert`.

### R7 — Remove eager `isomorphic-git` from the homepage (P2)

`isomorphic-git` is parsed at ~877 ms during initial load. Identify the static import chain (likely via `git.machine.ts` or a project-manager init path) and lazy-load it. Git operations only run when a user opens a repo / project.

Likely source: `apps/ui/app/machines/git.machine.ts` (currently dirty in git status), called from `ProjectManagerProvider`. Move to dynamic import inside the actor's `invoke`.

### R8 — Mount `AnalyticsProvider` only inside auth-gated routes (P2)

Compounds with R1/R2. By keeping the analytics tree narrow, the homepage simply does not pay any of its cost. `useAnalytics()` returns the existing noop shim outside the provider.

### R9 — Update `AGENTS.md` (P2)

Remove or rewrite the sentence:

> PostHog analytics loaded lazily via `posthog.lib.ts` — static import blocks main thread ~2.5s during startup

Replace with the corrected version after R1/R2 land:

> PostHog `posthog-js/react` is dynamically imported only inside auth-gated and project routes. Session recording is gated on first user interaction inside `/projects/*` to avoid rrweb's synchronous DOM snapshot blocking the main thread.

### R10 — Optional: scope React StrictMode (P3)

Dev-only. The double-invoke amplifies the effect-commit cost ~2× on first mount. If StrictMode is mounted at the root, consider scoping it to `/projects/*` where the agent/state-machine semantics it catches matter most. Production traces will not include this cost.

## Code Examples

### Reproducing the 2.5 s block locally

1. `nx serve ui` (or `nx dev ui`).
2. Open Chrome DevTools → Performance → Record.
3. Navigate to `http://localhost:3000/` from a fresh tab (cold cache).
4. Stop recording at ~7 s.
5. In the Performance panel, search for `r.onload` — the 2.5 s `FunctionCall` will be visible immediately after LCP.
6. Inspect the call stack: it terminates in `posthog-recorder.js`'s `e.mirror.doc` (rrweb).

### Quick local validation that R1 fixes it

Apply this single-line change as a probe:

```typescript
// apps/ui/app/hooks/use-analytics.tsx
export function DeferredSessionRecording(): React.ReactNode {
  return undefined; // probe — disables session recording entirely
}
```

Re-record; the 2.5 s block disappears entirely. (This is a probe, not the production fix — the production fix is R1 Option A or Option B.)

## Diagrams

### Critical-path timeline (cumulative blocking)

```text
0       0.5     1.0     1.5     2.0     2.5     3.0     3.5     4.0     4.5     5.0     5.5     6.0     6.5
|-------|-------|-------|-------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
[FCP@0.48]
    [Vite SSR module eval][React render+commit [block C────] │
                                                              │ PostHog config
                                                              │  └─ extensions(5)
                                                              │     └─ recorder.js
                                                              [rrweb takeFullSnapshot ──────────────── 2.5 s ────] [LazyMount G]
                          ↑                                   ↑                                              ↑
                    LCP candidate 1                   Final LCP @ 2.39s                          User can finally type @ 5.5–6 s
```

## Appendix: Raw Sample Aggregates

### Window-by-window main-thread CPU (busy ≥95 % unless noted)

| Phase | Window (ms)   | Dominant frames                                                                                                                                                  |
| ----- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | 600–1100      | ≈64 % idle, 35 % `(program)` — background script parsing                                                                                                         |
| A2    | 1100–1500     | `(program)` 72 %, `zod.init` 12 %, `zod._` 6 %                                                                                                                   |
| B     | 1500–1900     | `performWorkOnRoot` 78 %, `renderRootConcurrent` 78 %, `renderWithHooks` 34 %, `updateFunctionComponent` 25 %, `exports.jsxDEV` 19 %                             |
| C     | 1900–2700     | `commitPassiveMountOnFiber` 1546 % (parents), `recursivelyTraverseAndDoubleInvokeEffects` 202 %, `commitMutationEffectsOnFiber` 468 %, `logComponentRender` 15 % |
| D     | 2700–2900     | `ht`/`start` (rrweb) 21 % rising, `commitLayoutEffectOnFiber` 78 %, `flushSync` ramp-up                                                                          |
| **E** | **2900–5400** | **rrweb `ht` 1054 % parents, `e.mirror.doc → q.doc → doc → et` 70 % leaf**                                                                                       |
| F     | 5300–5550     | More `commitPassiveMountOnFiber` 345 % parents, `flushSync` 14 %, residual `ht` 16 %                                                                             |
| G     | 6100–6300     | `commitPassiveUnmountOnFiber` 51 % (LazySection swap), `recursivelyTraverseLayoutEffects` 185 %, `flushSync` 15 %                                                |

### Long tasks (main thread, dur > 30 ms)

| Rel-start (ms) | Duration (ms) | Cause                                                           |
| -------------: | ------------: | --------------------------------------------------------------- |
|   −5 (pre-nav) |           405 | Vite preloader / extension chrome bootstrap                     |
|            360 |            41 | Module download/parse                                           |
|            402 |            34 | DOM parse                                                       |
|            452 |            51 | Chrome extension scripts (`chrome-extension://` URLs)           |
|           1119 |           288 | Vite SSR module eval / Zod init                                 |
|           1408 |           139 | React `renderRootConcurrent` start                              |
|           1557 |            90 | React commit                                                    |
|           1914 |           145 | React `performWorkUntilDeadline` (scheduler)                    |
|           2083 |           114 | React `performWorkUntilDeadline`                                |
|           2255 |           215 | React `client-DDuAzd3k.js` (commit)                             |
|           2492 |            31 | React commit                                                    |
|           2543 |            44 | React commit                                                    |
|           2634 |            55 | React `performWorkUntilDeadline`                                |
|           2721 |            51 | React `performWorkUntilDeadline`                                |
|       **2785** |      **2562** | **`r.onload` (posthog-js_react.js) → rrweb `takeFullSnapshot`** |
|           5356 |            36 | React (post-snapshot reconciliation)                            |
|           5396 |            28 | `TimerFire` → React micro-task                                  |
|           6148 |            33 | React render                                                    |
|           6187 |            33 | React render (LazySection mount)                                |

### PostHog request waterfall

| Rel-time (ms) | Resource                                    |
| ------------: | ------------------------------------------- |
|         563.0 | `posthog-js_react.js` (Vite optimised dep)  |
|         563.0 | `app/lib/posthog.lib.ts`                    |
|        1953.4 | `/api/ph/array/<key>/config.js`             |
|        2067.3 | `/api/ph/static/dead-clicks-autocapture.js` |
|        2068.0 | `/api/ph/static/web-vitals.js`              |
|        2068.2 | `/api/ph/static/exception-autocapture.js`   |
|        2081.9 | `/api/ph/static/surveys.js`                 |
|        2082.1 | `/api/ph/static/logs.js`                    |
|        2780.5 | `/api/ph/static/posthog-recorder.js`        |

### Trace metadata

- File: `Trace-20260504T083249.json.gz` (19.4 MB compressed → 148.9 MB JSON).
- Total events: 493,892.
- Process: pid=83891, main thread tid=13327407 (`CrRendererMain`).
- Profile: Profile id=0x1, 2,745 ProfileChunks, 198,248 samples covering 350 ms → 6,565 ms.
- Worker threads (DedicatedWorker, profile ids 0x2 / 0x3 / 0x4): file-manager / shared FS worker, with their own significant work concurrent with phases B–E (`_resolveProvider`, `readDirectory` in `workspace-file-service.ts`, `dispatchHandler` in `runtime-filesystem-bridge.ts`). Off-main-thread, so does not directly block TTI, but compete for CPU on multi-core-constrained environments.

## References

- `apps/ui/app/lib/posthog.lib.ts` — PostHog config (the existing `disable_session_recording: true` mitigation).
- `apps/ui/app/hooks/use-analytics.tsx` — `AnalyticsProvider`, `DeferredSessionRecording`, root mount in `apps/ui/app/root.tsx:100`.
- `apps/ui/app/routes/_index/route.tsx` — homepage layout; lists every section that mounts on first paint.
- `apps/ui/app/routes/_index/hero-viewer-gate.tsx` — correct lazy-load reference implementation.
- `apps/ui/app/components/ui/lazy-section.tsx` — the rootMargin issue.
- `apps/ui/app/components/project-grid.tsx` — `ProjectCard` × Tooltip chains.
- `apps/ui/app/components/chat/chat-textarea.tsx` and `apps/ui/app/components/chat/tiptap/use-chat-editor.ts` — TipTap eager imports.
- `node_modules/posthog-js/lib/src/posthog-core.js:2530–2556` — confirms `startSessionRecording` re-enables `disable_session_recording`.
- Related: `docs/research/ui-startup-performance-gap-analysis.md` (broader UI startup audit), `docs/research/shared-worker-gate-startup-performance.md` (FM worker gating background).
