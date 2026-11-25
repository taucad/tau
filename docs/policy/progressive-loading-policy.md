---
title: 'Progressive Loading Policy'
description: 'How Tau web documents are delivered and loaded, and what a region shows while it waits: route classes, static shells, client facts, load tiers, budgets, the hand-off contract, the service worker, and loading states.'
status: active
created: '2026-11-16'
updated: '2026-11-25'
related:
  - docs/research/progressive-loading-architecture.md
  - docs/research/loading-states-ux-blueprint.md
  - docs/research/cloud-open-loading-states.md
  - docs/research/home-projects-skeleton-restoration.md
  - docs/research/app-state-orchestration-charter.md
  - docs/policy/ssr-bundle-policy.md
  - docs/policy/page-composition-policy.md
  - docs/policy/ui-policy.md
  - docs/policy/ux-policy.md
  - docs/policy/accessibility-policy.md
  - docs/policy/react-policy.md
  - docs/policy/worker-policy.md
  - docs/policy/testing-policy.md
---

# Progressive Loading Policy

Internal reference for how `apps/ui` documents reach the browser, what each route loads before, during and after its first input, and what a region shows while it waits.

## Rationale

The critical path had no owner: a first-party change put the AI SDK on every document (+143 KB on the wire), per-visitor cookies made documents depend on the request, and the progressive-enhancement pieces existed only as one-offs. These rules make delivery a build output with one registry, keep heavy modules in a deferred tier behind measured budgets, and let a native input work before any bundle arrives. The architecture, measurements and rulings are in `docs/research/progressive-loading-architecture.md`.

What a wait looks like had no single owner either. A project opening from the cloud drew a spinner, a title and a sentence in each of ten panes, named the same step three times at once, taught storage words ("on this device") and offered one "Try again" per pane. Rules 15 to 22 give every wait one model: the region's own frame, its content's shape, and one status whose words the wait has to earn. The review is in `docs/research/cloud-open-loading-states.md` (Part 5).

## Load tiers

| Tier           | Contents                                                                                                                        | Arrives by                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| T0 Frame       | HTML, critical CSS, the client-facts head script, native inputs. Works before any module evaluates                              | The document                                   |
| T1 Interactive | Entry, root, route module, the runtime's core, the composer: the class's `interactive` roots and their static closure           | `modulepreload` in the document                |
| T2 Deferred    | Viewer and three.js, kernels and wasm, chat transport and `ai`, the editor, telemetry, runtime logic not needed for first input | `import()` started by a fact its owner reports |

## Status on main

Rules marked _pending_ state the target; the named work package lands their enforcement. Do not claim a pending mechanism exists.

| Mechanism                                                   | State on main                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route-class registry, project static shell (PL3)            | Built. `project` is `static-shell`; Home is still `function`                                                                                                                                                                                                                                          |
| Home static shell at `/` (PL4)                              | _Pending_. Home's class says so in `route-classes.ts`                                                                                                                                                                                                                                                 |
| Interactive-tier cut (PL5)                                  | _Pending_. `critical-budget.json` lists the editor and three.js as `knownHeavy` for `project`                                                                                                                                                                                                         |
| Client facts (PL2), runtime entry cut (PL1), hand-off (PL6) | Built                                                                                                                                                                                                                                                                                                 |
| Shared `Deferred` tier boundary (P3)                        | _Pending_. Deferral is per site today                                                                                                                                                                                                                                                                 |
| One service worker from the registry (PL7)                  | Built. `app/offline/service-worker.ts` answers the project and Home shells and `/usage`                                                                                                                                                                                                               |
| Wait ladder (rule 16)                                       | Built for 1,000 ms, 500 ms and 10,000 ms (`utils/wait-timing`). _Pending_: the 300 ms skeleton mark, the 3,000 ms detail mark as a ladder constant (today `captionDelayMilliseconds` in `viewer-wait-status.tsx`), and the slow mark counted from the last progress (today from the download's start) |
| One voice for a project open (rules 15 and 17)              | Built in the viewer (`ViewerWaitStatus`). _Pending_ elsewhere: the chat lane, Parameters and eight other panes swap in `ProjectSyncPlaceholder`                                                                                                                                                       |
| One label and a numbers-only detail line (rules 18 and 19)  | _Pending_. `project-open-copy.ts` has three step labels and three helper sentences                                                                                                                                                                                                                    |
| One notice and one announcement (rules 21 and 22)           | _Pending_. A failed open offers an action in each pane, and both the route's region and the stage's `alert` say it                                                                                                                                                                                    |

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

Each guarded class's T1 closure stays within its brotli bytes, request count and largest-chunk numbers in `apps/ui/critical-budget.json`, in its one `adaptive` entry: every web, desktop and `tau serve` bundle is the one adaptive build (adaptive app deployment mode W12), measured on `ui:build`. The entry was first written from `main` with `--write`; gate G1's record holds the proof that the adaptive increment over the retired self-host build stayed within +2 requests, 1 % of bytes and 1 % of the largest chunk. The file is a ratchet: growth past the tolerance fails, landing under by more than the ratchet margin fails until the budget is lowered (`--write`), and a heavy family in a class's closure fails unless listed under its `knownHeavy` with the package that removes it. Raising a budget is a one-line change whose commit states the reason.

**Why**: only the build output sees bundler merges and packages reached through other packages.

**Enforced by**: G3 `pnpm nx run ui:check-critical-budget` (`apps/ui/scripts/check-critical-budget.mts`), over `.vite/manifest.json` and the module-id manifest from `@taucad/vite/module-id-manifest`. The PL5 targets (about 400 KB Home, 600 KB project on the wire) are confirmed after its first cut.

### 8. Follow the hand-off contract when a rich surface replaces a native one

A surface that a richer one replaces follows the hand-off contract (`apps/ui/app/components/hand-off/`): the native element is served in the document and accepts input from first paint, is created once per load, occupies the rich surface's final box, and hands over value, selection, focus, scroll and a queued submit in one commit (adoption waits for an open IME composition). If the rich module never arrives the native element stays usable and a queued send waits. Use `HandOffSlot` and `useHandOffAdoption`; do not write a second recorder.

**Enforced by**: the shared kit `apps/ui/app/testing/hand-off-contract.tsx` (`describeHandOffContract`: delayed adopter, no lost character, single mount), applied in `hand-off-slot.contract.test.tsx` and `chat-early-input.contract.test.tsx`; `hand-off.test.ts` holds the inline and bundled recorders to the same state.

### 9. Draw a deferred region's real frame and start it on a fact

A deferred region draws its real frame at final size in the document, and its content replaces the frame in place (loading follows rules 15 to 22, [Page Composition Policy](page-composition-policy.md) rule 11 and [UI Policy](ui-policy.md) §5). The load starts on a fact an existing owner reports (composer ready, canvas visible, a pane admitted), never on a timer, and a failed load shows a retry, as `DeferredProjectChatRoute` in `routes/w.$workspace.$project/route.tsx` does.

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

### 15. Draw a waiting region as its frame, then its content's shape

Rules 15 to 22 govern what a region shows while it waits, on every route. A waiting region keeps its own frame (header, borders, real controls) as one element from its first frame until its content is drawn in it. What goes inside depends on what is awaited:

| What is awaited                                                                         | Draw                                                                                               | Owner                           |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------- |
| Content whose shape is known: a transcript, rows, cards, a tree, lines of code          | Generic `Skeleton` bars in that shape, at final size, with no words ([UI Policy](ui-policy.md) §5) | `Skeleton` in `@taucad/ui`      |
| Work whose result has no shape: the viewer's model, an upload, an export, a running job | The wait indicator in a slot the frame already has                                                 | `WaitIndicator` in `@taucad/ui` |
| Content already on screen that is being refreshed                                       | The content, with the wait indicator in a header's trailing slot                                   | `WaitIndicator`                 |

Never replace a region's body with a centred spinner, a title and a sentence, and never unmount a frame to show a wait. Loading is not empty: an empty state appears only when the read has settled as empty.

**Why**: a block that stands in for a pane is a second layout that is swapped twice, and a sentence in every pane gives the person ten things to read about one wait.

**Enforced by**: `workspace-frame.test.tsx` (the persistent frame is created once and keeps its content node). Default, unenforced for the pane bodies until `ProjectSyncPlaceholder` has no caller; its deletion is the gate.

### 16. Time every wait on the one ladder

Every loading surface reads its marks from `@taucad/ui/utils/wait-timing`. Nothing on a load path defines its own delay or minimum.

| Mark, from the wait's start | Constant                                | What appears                                                                                                                                      |
| --------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0                           | none                                    | The frame. A read that has already answered draws its content in the same commit                                                                  |
| 300 ms                      | `skeletonDelayMilliseconds` (_pending_) | Skeleton bars, for a wait that starts on the client. Skeletons in a document's server render show from first paint ([UI Policy](ui-policy.md) §5) |
| 1,000 ms                    | `indicatorDelayMilliseconds`            | The wait indicator: a spinner, one label and, when measurable, a percentage                                                                       |
| 3,000 ms                    | `detailDelayMilliseconds` (_pending_)   | The detail line under the indicator, for a measurable wait only (rule 18)                                                                         |
| 10,000 ms with no progress  | `slowWaitMilliseconds`                  | The slow label, "Try again" and one line of what to do (rules 18 and 21)                                                                          |
| Once shown, at least 500 ms | `indicatorMinimumMilliseconds`          | The indicator finishes its minimum in its own slot. Content is never held for it, and a skeleton has no minimum                                   |

A mark is a CSS animation delay computed when the wait starts (`useWaitClock`, and the `wait-reveal`, `wait-hold`, `wait-until-slow` and `wait-after-slow` utilities in `tokens.css`). Never use `setTimeout`, an effect or a per-component constant for one. There is one clock per wait, not per mount: a region that mounts 900 ms into a wait reveals its indicator 100 ms later. Arriving content has no entrance animation.

CORRECT:

```tsx
<WaitIndicator
  active={isOpening}
  variant='pill'
  live={false}
  startedAt={startedAt}
  label='Opening project'
  progress={fraction}
/>
```

INCORRECT:

```tsx
useEffect(() => {
  const timer = setTimeout(() => setShowSpinner(true), 300);
  return () => clearTimeout(timer);
}, []);
```

**Why**: an open of a project already on the device ends before the first mark and shows nothing that says "loading"; a script timer cannot run before hydration and drifts from the other marks.

**Enforced by**: `packages/ui/src/utils/wait-timing.test.ts` (the constants and the CSS fallbacks agree); `wait-indicator.browser.test.tsx` (reveal, minimum and slow mark in a browser); the `react-event-layer.ceiling.json` files, which only go down.

### 17. Give a group of waits one voice

Regions that wait on the same thing are one group: while a project opens, the chat lane, every pane and the viewer all wait on the project. A group shows at most one status with words, in the region whose result has no shape. For a project open that is the viewer's status slot (`ViewerWaitStatus`). Every other region in the group shows its frame and its shape (rule 15): no spinner, no step name, no percentage and no sentence.

When the region that carries the status is covered (a phone sheet at full over the viewer), the covering surface shows the same status in its header's trailing slot with `WaitIndicator variant='inline'`, and the covered region is `inert`. The status moves; it is never shown twice. A wait a gesture starts after the open (opening History, a refetch) is its own group.

**Why**: three spinners that say "Downloading files… 64%" compete with the one place the eye should go, and three slow marks have to be kept in step.

**Enforced by**: default, unenforced until the project route's role test asserts one revealed `[data-slot=wait-indicator]` body per open. The canvas check (`docs/research/artifacts/cloud-open-loading-states/canvas/check.mjs`, Part 5) asserts it on the design.

### 18. Let the wait earn its words

| The wait                           | The status says                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Ends before 1,000 ms               | Nothing                                                                                                         |
| Passes 1,000 ms                    | One label that names what the person asked for, kept for the whole wait: "Opening project…"                     |
| Is measurable (a known total)      | The percentage beside that label. It never goes backwards under one label                                       |
| Is measurable and passes 3,000 ms  | A detail line with the numbers: "189 of 295 files, 44.8 MB of 70.0 MB"                                          |
| Has made no progress for 10,000 ms | The slow label ("Still opening project…"), "Try again" beside it, and one line of what to do in the detail line |

The label does not change to name an internal step while the wait runs. A wait with no known total has no detail line; do not fill the line with a sentence. A wait whose numbers are still moving is never called slow and never offers "Try again". Announce the label and a failure, never a percentage or a detail line (rule 22).

**Why**: words are read; a wait that ends in a second should cost none, and a download that takes a minute owes the person its real numbers. A "Try again" offered at ten seconds on a large download that is working invites the person to restart it.

**Enforced by**: default, unenforced until `viewer-wait-status.tsx` reads one label and counts its slow mark from the last progress. `wait-indicator.test.tsx` holds the percentage and the slow swap.

### 19. Name the request, not the transport

A running wait's words name the thing the person asked for ("Opening project…", "Exporting STEP…"), in [UX Policy](ux-policy.md) rule 9's sense. They never say where data is kept or how it moves, never promise a later state, and never explain a waiting control.

| Do not write, for a running wait                                                | Write                              |
| ------------------------------------------------------------------------------- | ---------------------------------- |
| "Downloading files…", "Preparing files…", "Connecting…", "Syncing…"             | "Opening project…"                 |
| "Opening this project on this device.", "Bringing this project to this device." | Nothing; the label says it         |
| "Your chats open once this project is on this device."                          | Nothing; the lane draws its shape  |
| "Send once the project is open" beside a disabled Send                          | Nothing; the send queues (rule 20) |

Device and network words belong to a failure whose next step depends on them: "You're offline. This project isn't on this device yet. Go online, then try again." A wait the person asked for by that name keeps it ("Downloading…" for an export they chose to download). Each flow's words live in one module (`apps/ui/app/lib/project-open-copy.ts` for a project open).

**Why**: Tau is a cloud product that also runs on the device. A person opening a project should not have to learn which of the two is happening.

**Enforced by**: `apps/ui/app/lib/project-open-copy.policy.node.test.ts` (an open's words are spelled only in the copy module; retired words fail anywhere). Add a string to its `retired` list in the change that removes it.

### 20. Keep input alive during a wait

A control that does not need the awaited data stays usable. The composer accepts text from the first frame and a send queues under the hand-off contract (rule 8): Send shows its pending state and keeps its name ([Page Composition Policy](page-composition-policy.md) rule 10). Do not add a disabled state with a reason that restates the wait. The frame never moves focus, the caret or scroll when content arrives or a wait fails, and a failed wait keeps typed text.

**Why**: the wait is the system's, not the person's; the one useful thing they can do meanwhile is start writing.

**Enforced by**: `describeHandOffContract` (rule 8) for the composer. Default, unenforced on a phone, where the chat sheet has no hand-off box yet.

### 21. Fail once, on the surface in front

When a group's wait fails, or stalls past the slow mark, every skeleton and indicator in the group stops. One notice says what did not happen and the next step ([UX Policy](ux-policy.md) rule 11), with one action, in the region that carried the status; when that region is covered, in the covering surface's body. The other regions keep their frames and say nothing: no second notice and no second button. Offline, a failed read and a needed sign-in are the same notice with their own words and action ("Try again", or "Open History" where a sign-in or a decision is needed). Use the neutral notice surface, never destructive red, for a failure the person can recover from.

**Why**: a failed open drew "Try again" in the viewer, the chat lane and Parameters at once, and three buttons that do the same thing read as three problems.

**Enforced by**: default, unenforced until the project route's role test asserts at most one "Try again" or "Open History" in a failed open. The canvas check asserts it on the design, at both phone detents.

### 22. Announce a group once

A group has one live region: for a project open, the route's `ProjectSyncAnnouncement`. It says the label when the wait starts and the failure if there is one. It does not say a step, a percentage, a detail line or a success; content arriving is the success. Inside the group every indicator passes `live={false}`, a skeleton's wrapper carries `aria-busy='true'` and its region's name with `aria-hidden` bars and no status text, and the failure notice is a labelled `group`, not a second `alert`. Focus does not move. Under reduced motion nothing pulses or spins, so an indicator always carries words.

CORRECT:

```tsx
<div role='group' aria-labelledby={titleId}>
  <p id={titleId}>Couldn’t open this project</p>
  <Button variant='outline' size='sm'>
    Try again
  </Button>
</div>
```

INCORRECT:

```tsx
{
  /* The route's region already says the failure: this says it a second time. */
}
<div role='alert'>Couldn’t open this project</div>;
```

**Why**: a screen reader hears every live region; one open that speaks from three panes, or changes its words at each step, is noise ([WCAG 4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)).

**Enforced by**: `project-sync-announcement.test.tsx` (one region, what it says). Default, unenforced for the stage's failure card, which is `role='alert'` today.

## Anti-Patterns

- Adding a root-loader field that varies by visitor; it breaks rule 2 for every shell.
- Using `useCookie` or an `HttpOnly` cookie for a view preference.
- Silencing `no-static-heavy-import` with a disable comment instead of a `deferredLeaves` entry the graph test checks.
- Raising `critical-budget.json` with `--write` in a feature commit without stating why.
- Starting a deferred load from `setTimeout` or `requestIdleCallback` alone, with no owner fact.
- A centred spinner, title and sentence in place of a pane's body, or the same status in more than one region of a group.
- A delay or minimum written in a component (`setTimeout`, `[animation-delay:300ms]`) instead of a ladder constant.
- A running wait that names the transport or the device ("Downloading files…", "on this device"), or a label that changes with each internal step.
- "Try again" offered on a wait whose numbers are still moving, or offered more than once for one failure.
- A second live region inside a route open: a live pill, a `role='status'` sentence in a pane, or an `alert` beside the route's announcement.

## Summary Checklist

- [ ] New route has exactly one class in `route-classes.ts`
- [ ] Static-shell output passes `ui:check-static-shells`
- [ ] Per-visitor view facts go through `writeClientFacts` and CSS on `<html>`
- [ ] No heavy module on a class's static graph (lint and `critical-graph.node.test.ts` green)
- [ ] `ui:check-critical-budget` green; any raise names its reason
- [ ] Replaced native surfaces pass `describeHandOffContract`
- [ ] No kernel, wasm or worker preload or precache
- [ ] Delivery changes update the cloud handbook and go-live checklist
- [ ] A waiting region keeps its frame; known shapes draw `Skeleton` bars, shapeless work draws `WaitIndicator`
- [ ] Every delay is a ladder constant applied as a CSS delay; no timer, no per-component number
- [ ] One status with words per group, on the surface in front; one label for the whole wait; numbers only when measurable
- [ ] Running-wait copy names the request; device and network words appear only in a failure that needs them
- [ ] One notice, one action and one live region per group; focus does not move

## References

- Architecture and rulings: `docs/research/progressive-loading-architecture.md`
- Loading states: `docs/research/cloud-open-loading-states.md` (Part 5, the review and its canvas), `docs/research/loading-states-ux-blueprint.md` (the timing ladder), `docs/research/home-projects-skeleton-restoration.md` (the skeleton ruling)
- [GitHub Primer, loading](https://primer.style/product/ui-patterns/loading/); [Nielsen Norman Group, skeleton screens](https://www.nngroup.com/articles/skeleton-screens/); [WCAG 4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
- Related: [SSR Bundle Policy](ssr-bundle-policy.md), [Page Composition Policy](page-composition-policy.md), [UI Policy](ui-policy.md), [UX Policy](ux-policy.md), [Accessibility Policy](accessibility-policy.md), [React Policy](react-policy.md), [Worker Policy](worker-policy.md), [Testing Policy](testing-policy.md)
