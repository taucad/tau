---
title: 'Progressive Loading Policy'
description: 'How Tau web documents are delivered and loaded: route classes, neutral static shells, client facts, load tiers, budgets, the hand-off contract and the service worker.'
status: active
created: '2026-11-16'
updated: '2026-11-16'
related:
  - docs/research/progressive-loading-architecture.md
  - docs/research/loading-states-ux-blueprint.md
  - docs/research/app-state-orchestration-charter.md
  - docs/policy/ssr-bundle-policy.md
  - docs/policy/page-composition-policy.md
  - docs/policy/ui-policy.md
  - docs/policy/react-policy.md
  - docs/policy/worker-policy.md
  - docs/policy/testing-policy.md
---

# Progressive Loading Policy

Internal reference for how `apps/ui` documents reach the browser and what each route loads before, during and after its first input.

## Rationale

The critical path had no owner: a first-party change put the AI SDK on every document (+143 KB on the wire), per-visitor cookies made documents depend on the request, and the progressive-enhancement pieces existed only as one-offs. These rules make delivery a build output with one registry, keep heavy modules in a deferred tier behind measured budgets, and let a native input work before any bundle arrives. The architecture, measurements and rulings are in `docs/research/progressive-loading-architecture.md`.

## Load tiers

| Tier           | Contents                                                                                                                        | Arrives by                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| T0 Frame       | HTML, critical CSS, the client-facts head script, native inputs. Works before any module evaluates                              | The document                                   |
| T1 Interactive | Entry, root, route module, the runtime's core, the composer: the class's `interactive` roots and their static closure           | `modulepreload` in the document                |
| T2 Deferred    | Viewer and three.js, kernels and wasm, chat transport and `ai`, the editor, telemetry, runtime logic not needed for first input | `import()` started by a fact its owner reports |

## Status on main

Rules marked _pending_ state the target; the named work package lands their enforcement. Do not claim a pending mechanism exists.

| Mechanism                                                   | State on main                                                                                 |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Route-class registry, project static shell (PL3)            | Built. `project` is `static-shell`; Home is still `function`                                  |
| Home static shell at `/` (PL4)                              | _Pending_. Home's class says so in `route-classes.ts`                                         |
| Interactive-tier cut (PL5)                                  | _Pending_. `critical-budget.json` lists the editor and three.js as `knownHeavy` for `project` |
| Client facts (PL2), runtime entry cut (PL1), hand-off (PL6) | Built                                                                                         |
| Shared `Deferred` tier boundary (P3)                        | _Pending_. Deferral is per site today                                                         |
| One service worker from the registry (PL7)                  | Built. `app/offline/service-worker.ts` answers the project and Home shells and `/usage`       |

## Rules

### 1. Put every route in one route class

Every entry under `app/routes` belongs to exactly one class in `apps/ui/app/lib/route-classes.ts`. A class states its delivery (`static-shell`, `prerendered`, `function` or `cdn-ssr`); a guarded class also states its `interactive` roots, and its budgets live under its id in `apps/ui/critical-budget.json`. The registry is the one source for the prerender list (`static-paths.ts`), the function's `excludedPaths` and the generated routing block of `netlify.toml` (`renderNetlifyShellRouting`), the roots of the critical-path guards (`scripts/critical-path.mts`) and the shell checks. Never hand-edit the generated `netlify.toml` block or add a shell path elsewhere.

**Why**: before the registry six files had to agree on how a route was delivered.

**Enforced by**: `app/lib/route-classes.test.ts` (every route module has exactly one class; the generated `netlify.toml` block is held verbatim).

### 2. Keep a static-shell document a build output

A `static-shell` document's bytes depend on the deploy and nothing else. Never read cookies, headers, the user agent or the clock to render it, and never render the shell's placeholder parameters (`shellSentinel`, `__shell`) into text, attributes or loader data. Today this is the `project` class (`/w/:workspace/:project`, prerendered at `/w/__shell/__shell`); Home joins it with PL4, and until then the `/` server render stays session-neutral on the function. Resolve Home's authentication client-side from the shared session, never from a separate first-paint hint.

**Why**: one neutral document per class and deploy is cacheable at the CDN, testable ahead of time and the same on web, desktop and `tau serve`.

**Enforced by**: `pnpm nx run ui:check-static-shells` (`apps/ui/scripts/check-static-shells.mts`): neutral bytes for two different visitors, deterministic bytes, function-equals-shell, skew build id, header parity and the sentinel guard.

### 3. Carry per-visitor facts only in the client-facts record

A per-visitor fact reaches first paint only through the client-facts record (`apps/ui/app/lib/client-facts.ts`, `localStorage` key `tau-client-facts`): its owner writes it with `writeClientFacts`, the inline head script `clientFactsScript` (served from `hooks/use-theme.tsx`) applies it to `<html>` before the body parses, and React reads it with `useClientFact`, whose server snapshot is the neutral default. Never add a cookie the server reads for presentation. The legacy theme cookie survives only for the one-time migration route (`routes/action.migrate-theme.ts`).

CORRECT:

```ts
writeClientFacts({ sidebarOpen: false });
```

INCORRECT:

```ts
// Read in a loader to pick the initial render.
Cookies.set('tau_sidebar', 'closed');
```

**Why**: an `HttpOnly` or server-read cookie forces a per-request render and cannot serve a static document.

### 4. Express visible pre-hydration facts in CSS

A fact that changes what is visible before hydration is expressed in CSS keyed on a class, attribute or variable the head script sets on `<html>` (for example the theme class, `data-sidebar-closed`, `data-pointer-cursors`). Where text differs, render every variant and let CSS select one; where size differs, reserve it with a CSS variable. Keep `clientFactsScript` and `applyClientFacts` in step; the parity test in `client-facts.test.ts` runs both. A fact with no CSS expression waits for hydration and must not shift layout when it arrives (the consent banner mounts after hydration as a fixed overlay).

**Why**: React hydrates against the neutral markup, so anything the person sees before then must come from CSS, not a second render.

### 5. Import heavy modules only through a tier boundary

Modules on the heavy list (`heavyModules` in `apps/ui/scripts/critical-path.mts`: `ai` and `@ai-sdk/*`, `three`, `@react-three/*`, `@taucad/runtime`, kernel packages, the editor, telemetry and error-reporting SDKs) are reached only by `import()`. A static value import is allowed only in a file listed as a `deferredLeaves` entry, which only a dynamic import reaches. `import type` is unrestricted.

CORRECT:

```ts
const { streamText } = await import('ai');
```

INCORRECT:

```ts
import { streamText } from 'ai'; // in a module on a route class's static graph
```

**Enforced by**: G1 `tau-lint/no-static-heavy-import` (error, `.oxlintrc.json`, scoped to `apps/ui/app` and the app libraries it composes; `known` lists only shrink); G2 `apps/ui/app/lib/critical-graph.node.test.ts` (transitive reach per class, import chain printed, lint options held equal to the heavy list).

### 6. Keep the runtime entry to first input

The app runtime's entry imports only what is needed to accept the first input. A runtime child whose logic is not needed for that loads through the existing D5 loader form (`async () => import(...)` in `app/runtime/app-runtime.ts`) behind a facade from `app/runtime/deferred-child.ts`: its initial snapshot stays synchronous, events sent before the load are queued in order and replayed, and a failed load is the child's first fault. Add no second loader form and no second runtime root.

**Why**: the runtime entry was the +143 KB regression; synchronous snapshots keep server and client renders equal.

**Enforced by**: `apps/ui/app/runtime/import-boundary.node.test.ts`; `deferred-child.test.ts`.

### 7. Stay within the interactive-tier budget

Each guarded class's T1 closure stays within its brotli bytes, request count and largest-chunk numbers in `apps/ui/critical-budget.json`, per build variant (`cloud`, `self-host`). An `adaptive` build (the third UI ceiling, adaptive app deployment mode D1) has no entry of its own: `ui:check-critical-budget-adaptive` holds it within +2 requests, 1 % of total bytes and 1 % of the largest chunk of both the `self-host` entry and the same CI run's `self-host` build, and `--write` refuses it. The file is a ratchet: growth past the tolerance fails, landing under by more than the ratchet margin fails until the budget is lowered (`--write`), and a heavy family in a class's closure fails unless listed under its `knownHeavy` with the package that removes it. Raising a budget is a one-line change whose commit states the reason.

**Why**: only the build output sees bundler merges and packages reached through other packages.

**Enforced by**: G3 `pnpm nx run ui:check-critical-budget` (`apps/ui/scripts/check-critical-budget.mts`), over `.vite/manifest.json` and the module-id manifest from `@taucad/vite/module-id-manifest`. The PL5 targets (about 400 KB Home, 600 KB project on the wire) are confirmed after its first cut.

### 8. Follow the hand-off contract when a rich surface replaces a native one

A surface that a richer one replaces follows the hand-off contract (`apps/ui/app/components/hand-off/`): the native element is served in the document and accepts input from first paint, is created once per load, occupies the rich surface's final box, and hands over value, selection, focus, scroll and a queued submit in one commit (adoption waits for an open IME composition). If the rich module never arrives the native element stays usable and a queued send waits. Use `HandOffSlot` and `useHandOffAdoption`; do not write a second recorder.

**Enforced by**: the shared kit `apps/ui/app/testing/hand-off-contract.tsx` (`describeHandOffContract`: delayed adopter, no lost character, single mount), applied in `hand-off-slot.contract.test.tsx` and `chat-early-input.contract.test.tsx`; `hand-off.test.ts` holds the inline and bundled recorders to the same state.

### 9. Draw a deferred region's real frame and start it on a fact

A deferred region draws its real frame at final size in the document, and its content replaces the frame in place (loading follows [Page Composition Policy](page-composition-policy.md) rule 11 and [UI Policy](ui-policy.md) §5). The load starts on a fact an existing owner reports (composer ready, canvas visible, a pane admitted), never on a timer, and a failed load shows a retry, as `DeferredProjectChatRoute` in `routes/w.$workspace.$project/route.tsx` does.

**Pending (P3)**: a shared `Deferred` boundary (`tier`, `startOn`, `frame`) and the lint rule that requires it are not built; until then each deferred site states its start fact in code.

### 10. Keep the viewer and kernels in the deferred tier

The viewer is deferred. Never put three.js, a kernel or wasm in an interactive tier. Never `modulepreload`, `preload` or `prefetch` a kernel, wasm or worker asset in any document, and never precache one. Kernel compilation runs off the main thread (a worker, streaming compile in `packages/runtime/src/framework/wasm-loader.ts`). Holding kernel requests until the useful mark was withdrawn by measurement (2026-11-15); do not add such a hold without a new measurement.

**Enforced by**: `check-critical-budget.mts` "no early kernel" (no document may preload a wasm file, worker or kernel chunk) and its heavy-family check. Today `project` lists `three`, `react-three` and `editor` under `knownHeavy` until PL5 removes them.

### 11. Serve every document cross-origin isolated

Every document, whoever serves it, carries `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy` and `Cross-Origin-Resource-Policy` and the site's CSP, so `crossOriginIsolated` is true. The service worker replays stored responses whole and never synthesises a document.

**Enforced by**: `check-static-shells.mts` header parity between a shell and the function document; `apps/ui/scripts/netlify-headers.test.ts`; `static-host-conformance.sh` on a deployed site. The worker-served clause (shell invariant 9) is `apps/ui-e2e/src/service-worker.test.ts`: each shell opened offline from the worker is `crossOriginIsolated`.

### 12. Run one service worker generated from the registry

There is one service worker for the web app, `apps/ui/app/offline/service-worker.ts`, on Google Workbox's runtime modules. A class answers documents through it only by naming a `worker` delivery in `route-classes.ts` (`cache-first` for a static shell, `network-first` for `/usage`). Its precache list is generated from the registry by `scripts/build-service-worker.ts`: each answered class's document and the T1 closure its document and `interactive` roots load. Never add a path to it by hand, never give the worker a route for API, auth, `.data` or marketing requests, and never precache a deferred-tier, wasm, kernel or worker asset (see [SSR Bundle Policy](ssr-bundle-policy.md) rule 7 for the editor); hashed files the page fetches are cached on first use only. The worker never calls `skipWaiting` on install: a waiting worker activates when the build-skew verdict is `replaced` (ruling OD3), and a reload asks the network first. Do not register a second worker. Web builds only; desktop and `tau serve` never register it.

**Enforced by**: `check-critical-budget.mts` (the written list equals the generated one; no heavy family, wasm, worker or runtime asset; revisions on documents only; shell invariant 8), `verify-shipped-assets.mts` (each revisioned entry still matches its file after the last deploy step), `app/offline/service-worker-routing.test.ts` and `pwa-registration.test.ts` (routing and the update rule), `apps/ui-e2e/src/service-worker.test.ts` and `stale-deploy-recovery.test.ts` (offline opens, pass-through, a worker-controlled tab across a deploy; shell invariant 9).

### 13. Make every document work without a service worker

A document works with no service worker: a first visit, a private window and a failed install all get the CDN path. The worker is an accelerator and the offline path, never a requirement.

### 14. Update the cloud handbook with every delivery change

A change to a class's delivery (a new class, a route moving between classes, a shell, a rewrite, an edge function, header or worker scope) updates the affected cloud handbook pages (`docs/handbooks/cloud/`, notably `operate/static-host-conformance.md` and `operate/deploy-and-promote.md`) and the go-live checklist (`docs/handbooks/cloud/readiness/go-live-checklist.md`) in the same change, using `create-handbook`.

**Why**: a wrong rewrite serves the wrong document to every URL of a class, and operators verify delivery from the handbook.

## Anti-Patterns

- Adding a root-loader field that varies by visitor; it breaks rule 2 for every shell.
- Using `useCookie` or an `HttpOnly` cookie for a view preference.
- Silencing `no-static-heavy-import` with a disable comment instead of a `deferredLeaves` entry the graph test checks.
- Raising `critical-budget.json` with `--write` in a feature commit without stating why.
- Starting a deferred load from `setTimeout` or `requestIdleCallback` alone, with no owner fact.

## Summary Checklist

- [ ] New route has exactly one class in `route-classes.ts`
- [ ] Static-shell output passes `ui:check-static-shells`
- [ ] Per-visitor view facts go through `writeClientFacts` and CSS on `<html>`
- [ ] No heavy module on a class's static graph (lint and `critical-graph.node.test.ts` green)
- [ ] `ui:check-critical-budget` green; any raise names its reason
- [ ] Replaced native surfaces pass `describeHandOffContract`
- [ ] No kernel, wasm or worker preload or precache
- [ ] Delivery changes update the cloud handbook and go-live checklist

## References

- Architecture and rulings: `docs/research/progressive-loading-architecture.md`
- Related: [SSR Bundle Policy](ssr-bundle-policy.md), [Page Composition Policy](page-composition-policy.md), [UI Policy](ui-policy.md), [React Policy](react-policy.md), [Worker Policy](worker-policy.md), [Testing Policy](testing-policy.md)
