---
title: 'Kernel Display Fallback Elimination'
description: 'Audit of `?? "openscad"` fallbacks across the UI when resolving the selected kernel, and the architectural fix that makes the resolved kernel non-nullable end-to-end.'
status: active
created: '2026-05-20'
updated: '2026-05-20'
category: audit
related:
  - docs/research/chat-composer-context-unification.md
  - docs/research/chat-active-model-kernel-persistence.md
---

## Implementation

Landed in the working tree on 2026-05-20 against plan
`kernel-display-fallback-elimination_a3f9c7e1.plan.md`. Per-recommendation
status:

- **R1 (resolveKernel helper)** — added to `libs/types/src/constants/kernel.constants.ts` alongside a new `KernelEntry` type alias that preserves literal `id` narrowness; re-exported via the `@taucad/types/constants` barrel.
- **R2 (isKernelId guard)** — co-located with `resolveKernel`; reuses the existing `kernelProviders` tuple as the source of truth.
- **R3 (cookie + chat-row boundaries)** — `apps/ui/app/hooks/use-kernel.tsx` and `apps/ui/app/hooks/active-chat-provider.tsx` both validate ingressing ids via `isKernelId` and resolve via `resolveKernel`. Stale ids heal to the cookie default.
- **R4 (`ActiveChatKernel.kernel` tightened)** — broad `KernelConfiguration | undefined` replaced by non-nullable `KernelEntry`; `ActiveChatKernelEntry` alias deleted.
- **R5 (`ChatKernelSelectorProps['children']` tightened)** — render-prop signature now requires non-nullable `selectedKernel`.
- **R6 (fallback deletions)** — four desktop sites, three mobile sites, and the one test-side `?? 'none'` removed.
- **R7 (canonical test helper)** — `apps/ui/app/hooks/active-chat-provider.test-utils.ts` (`buildComposerMock`) added; eight test mocks (T1–T8) now hand a real `KernelEntry` via `resolveKernel` instead of `kernel: undefined`.
- **R8 (persistence-machine boundary)** — `chatRetrieved` assign for `activeKernel` now passes through `isKernelId`; stale rows resolve to `undefined` and the cookie default takes over downstream.
- **R9 (IDB + API boundaries)** — UI `IndexedDbStorageProvider.sanitizeChat` strips invalid `activeKernel` ids at every chat read; API side already enforces the contract via `z.enum(kernelProviders)` in `libs/chat/src/schemas/agent-config.schema.ts` (no controller change needed since the chat module does not read `activeKernel` from Postgres).
- **R10 (sweep)** — zero residual `?? 'openscad'` / `?? 'OpenSCAD'` literal fallbacks survive in label / icon code paths. The only remaining `'openscad'` occurrences are the seeded cookie default, the canonical mock helper default, the constants registration, and explicit test fixtures.

# Kernel Display Fallback Elimination

Audit of every UI site that falls back to `'openscad'` / `'OpenSCAD'` when displaying the currently selected CAD kernel, and the architectural fix that eliminates the fallback class entirely by making the resolved kernel non-nullable at every consumer boundary.

## Executive Summary

The chat composer and a handful of related selectors render the kernel
label with `selectedKernel?.name ?? 'OpenSCAD'`, the brand icon with
`selectedKernel?.id ?? 'openscad'`, and the tier badge with
`kernelId={selectedKernel?.id ?? 'openscad'}`. The fallback exists because
`useKernel()` and `useChatComposer().kernel.kernel` both expose
`KernelConfiguration | undefined`, even though `kernelId` itself is the
closed `KernelId` union. Two root causes feed the optionality:

1. **Type-level** — the lookup uses `Map<string, KernelConfiguration>.get()`,
   which TypeScript types as `T | undefined` regardless of how narrow the
   key is.
2. **Runtime** — cookie values, IndexedDB chat rows, and Postgres chat rows
   are not re-validated against `kernelProviders` when read. A
   removed-but-historically-persisted kernel id (the precedent for kernel
   removal is established by [`0008_drop_unlisted.sql`](apps/api/app/database/migrations/0008_drop_unlisted.sql)
   for publication visibility) silently degrades to "OpenSCAD" with the
   Free-tier badge and the OpenSCAD brand icon — even when the user picked
   Replicad, Manifold, or Zoo.

The recommended fix is to (a) add a `resolveKernel(id: KernelId): KernelConfiguration`
helper that encapsulates the lookup's "safe by construction" non-null
assertion in one place (the container itself stays a `Map` — swapping
to `Record<KernelId, V>` achieves nothing because the repo runs with
`noUncheckedIndexedAccess: true`, which widens dynamic indexed access
to `T | undefined` regardless of key narrowness), (b) introduce a single
`isKernelId` guard and run it at every boundary that reads kernel data
from an external source (cookie, IDB, Chat row), and (c) tighten the
consumer-facing types (`ActiveChatKernel.kernel`,
`ChatKernelSelectorProps['children']`, `useKernel().selectedKernel`) so
the `?? 'openscad'` fallback becomes a type error. The change is
mechanical, touches ~6 production files and ~7 test mocks, and is fully
backwards-compatible at the storage layer.

## Problem Statement

The user noticed the kernel display fallback at
`apps/ui/app/components/chat/chat-textarea-desktop.tsx:434-435` and
flagged it as an architectural correctness issue:

```434:441:apps/ui/app/components/chat/chat-textarea-desktop.tsx
                  <span className='hidden items-center gap-1.5 truncate text-xs @[22rem]:inline-flex'>
                    {selectedKernel?.name ?? 'OpenSCAD'}
                    <KernelTierBadge kernelId={selectedKernel?.id ?? 'openscad'} />
                  </span>
                  <span className='relative flex size-4 items-center justify-center'>
                    <ChevronDown className='absolute scale-0 transition-transform duration-200 ease-in-out group-hover:scale-0 @[22rem]:scale-100' />
                    <SvgIcon
                      id={selectedKernel?.id ?? 'openscad'}
```

When `selectedKernel` is `undefined`, three independent UI surfaces
(label, tier badge, brand icon) all default to OpenSCAD — silently
misrepresenting which kernel will actually serve the next request.
This violates the user-stated rule that "selector trigger/pill text
must read from the same source as the dropdown's selected state" (see
`.cursor/rules/learned-ui.mdc`), because the dropdown's `value`
(`selectedKernel` from `useChatComposer`) and the trigger's displayed
identity diverge whenever the lookup misses.

## Methodology

1. **Direct search** for every `?? 'openscad'` / `?? 'OpenSCAD'` /
   `?? selectedKernel?.id` site under `apps/ui/`.
2. **Type-flow trace** from the cookie source (`useKernel`) through the
   chat-composer context (`useChatComposer`) into the kernel selector
   (`ChatKernelSelector`) and the desktop/mobile chat composers.
3. **Boundary review** of every source that can populate a kernel id:
   cookie store (`useCookie`), `Chat.activeKernel` (IndexedDB +
   Postgres), and chat-persistence machine context.
4. **Test-mock audit** of `useChatComposer` mocks in every chat-adjacent
   test, since each mock currently embeds `kernel: undefined` and
   propagates the optionality.

## Findings

### Finding 1: `useKernel().selectedKernel` is the type-level source of optionality

```10:17:apps/ui/app/hooks/use-kernel.tsx
// oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- intentionally allowing inference
export const useKernel = () => {
  const [kernel, setKernel] = useCookie<KernelProvider>(cookieName.cadKernel, defaultKernel);

  const selectedKernel = kernelById.get(kernel);

  return { kernel, setKernel, selectedKernel };
};
```

Even though `kernel: KernelProvider` is a closed union of valid ids,
`Map<string, KernelConfiguration>.get()` always returns
`KernelConfiguration | undefined`. The narrower key type is not used by
the TS typings of `Map`. Consumers downstream of `useKernel` therefore
see `selectedKernel` as optional and apply fallbacks.

**Note — swapping the container alone does not fix this.** The repo
enables `noUncheckedIndexedAccess: true` in
[`tsconfig.base.json`](tsconfig.base.json) (line 32), so even a
`Record<KernelId, KernelConfiguration>` keyed by the closed union
returns `KernelConfiguration | undefined` on dynamic indexed access:

```typescript
const t = {} as Record<KernelId, KernelConfiguration>;
const id: KernelId = 'openscad';
const k = t[id]; // KernelConfiguration | undefined under `noUncheckedIndexedAccess`
```

Existing call sites already work around this widening for typed-array
reads (`apps/ui/app/components/geometry/graphics/three/materials/gltf-edges.ts:103`,
`packages/runtime/src/utils/merge-gltf-edges.ts:81`). The architectural
fix therefore needs a **typed resolver helper** that encapsulates the
"safe by construction" non-null assertion once at the source, rather
than relying on the container's indexed-access shape.

### Finding 2: `ActiveChatKernel.kernel` propagates the same optionality

```56:92:apps/ui/app/hooks/active-chat-provider.tsx
export type ActiveChatKernelEntry = ReturnType<typeof kernelById.get>;

const kernelById = new Map(kernelConfigurations.map((k) => [k.id, k]));

// …

export type ActiveChatKernel = {
  kernelId: KernelId;
  kernel: ActiveChatKernelEntry;
  setActiveKernel: (kernelId: KernelId) => void;
};
```

`ActiveChatKernelEntry` is derived from `Map.get`, so `kernel.kernel` is
`KernelConfiguration | undefined`. Both `useCookieKernel` and
`useSessionKernel` populate this field via `kernelById.get(...)`. Every
consumer of `useChatComposer().kernel.kernel` inherits the optionality.

### Finding 3: The render-prop signature of `ChatKernelSelector` exposes the optionality to callers

```40:40:apps/ui/app/components/chat/chat-kernel-selector.tsx
  readonly children: (props: { selectedKernel?: (typeof kernelConfigurations)[number] }) => ReactNode;
```

The signature documents the children render-prop as optional, even though
the selector itself always renders an item from `kernelConfigurations`.
This is the API surface that drove the explicit `?? 'OpenSCAD'` literal
in the desktop and mobile composers.

### Finding 4: Inventory of fallback sites

| #   | File                                                        | Line(s) | Fallback expression                                               | Surface affected              |
| --- | ----------------------------------------------------------- | ------- | ----------------------------------------------------------------- | ----------------------------- |
| F1  | `apps/ui/app/components/chat/chat-textarea-desktop.tsx`     | 434     | `selectedKernel?.name ?? 'OpenSCAD'`                              | Trigger label (desktop)       |
| F2  | `apps/ui/app/components/chat/chat-textarea-desktop.tsx`     | 435     | `<KernelTierBadge kernelId={selectedKernel?.id ?? 'openscad'} />` | Tier badge (desktop)          |
| F3  | `apps/ui/app/components/chat/chat-textarea-desktop.tsx`     | 440     | `<SvgIcon id={selectedKernel?.id ?? 'openscad'} />`               | Brand icon (desktop)          |
| F4  | `apps/ui/app/components/chat/chat-textarea-desktop.tsx`     | 378,450 | `selectedKernel?.name` flowing into tooltip text                  | Tooltip ("Select kernel (…)") |
| F5  | `apps/ui/app/components/chat/chat-textarea-mobile.tsx`      | 273     | `kernel?.id ?? selectedKernel?.id ?? 'openscad'`                  | Brand icon (mobile drawer)    |
| F6  | `apps/ui/app/components/chat/chat-textarea-mobile.tsx`      | 278     | `kernel?.name ?? selectedKernel?.name ?? 'OpenSCAD'`              | Trigger label (mobile drawer) |
| F7  | `apps/ui/app/components/chat/chat-textarea-mobile.tsx`      | 279     | `kernel?.id ?? selectedKernel?.id ?? 'openscad'`                  | Tier badge (mobile drawer)    |
| F8  | `apps/ui/app/components/chat/chat-kernel-selector.test.tsx` | 77      | `selectedKernel?.name ?? 'none'`                                  | Test render-prop fallback     |

All seven production sites (F1–F7) silently coerce to OpenSCAD when the
upstream lookup misses, and the mobile composer compounds the issue with
a double fallback (`kernel?.x ?? selectedKernel?.x ?? 'openscad'`).

### Finding 5: Test mocks perpetuate the bug

Eight test files mock `useChatComposer` with `kernel: { kernel: undefined, ... }`,
mirroring the production optionality. Tightening the production type
will make every one of these mocks fail typecheck, which is the desired
outcome — the mocks must mirror the post-fix invariant.

| #   | Test file                                                                | Mock shape                                                                      |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| T1  | `apps/ui/app/components/chat/chat-model-selector.test.tsx`               | `kernel: { kernelId: 'openscad', kernel: undefined, setActiveKernel: vi.fn() }` |
| T2  | `apps/ui/app/components/chat/chat-textarea-types.test.tsx`               | `kernel: { kernelId: 'openscad', kernel: undefined, setActiveKernel: vi.fn() }` |
| T3  | `apps/ui/app/components/chat/chat-context-indicator.test.tsx`            | `kernel: { kernelId: 'openscad', kernel: undefined, setActiveKernel: vi.fn() }` |
| T4  | `apps/ui/app/hooks/use-cad-agent-config.test.tsx`                        | `buildComposer({ kernelId: 'openscad' })` returning `kernel: undefined`         |
| T5  | `apps/ui/app/chat-clients/use-cad-chat-client.wire.integration.test.tsx` | `kernel: undefined` in composer harness                                         |
| T6  | `apps/ui/app/routes/_index/route.test.tsx`                               | `kernel: { kernelId: 'openscad', kernel: undefined, setActiveKernel: vi.fn() }` |
| T7  | `apps/ui/app/hooks/use-chat.test.tsx`                                    | `selectedKernel: undefined`                                                     |
| T8  | `apps/ui/app/hooks/active-chat-provider.test.tsx`                        | `result.current.kernel.kernel?.id` (optional-chain on the resolved entry)       |

### Finding 6: Runtime sources of invalidity that the type system cannot catch

Even after the `Map.get` lookup is type-narrowed, three runtime entry
points can deliver a kernel id whose `KernelConfiguration` has been
removed from `kernelConfigurations`:

| Boundary                       | Source                                                                 | Currently validated?                              |
| ------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------- |
| Cookie (`cad-kernel`)          | `useCookie<KernelProvider>(cookieName.cadKernel, defaultKernel)`       | No — cast to `KernelProvider` after `JSON.parse`. |
| Chat row (`Chat.activeKernel`) | IndexedDB row hydrated by `loadChatActor` (`event.chat?.activeKernel`) | No — typed as `KernelId` but never re-checked.    |
| Chat row (Postgres)            | `Chat.activeKernel` written/read by the API persistence path           | No — typed as `KernelId`, persisted as `text`.    |

The smoking-gun precedent is the recently shipped
[`0008_drop_unlisted.sql`](apps/api/app/database/migrations/0008_drop_unlisted.sql)
migration, which removed `'unlisted'` from the publication-visibility
union. The same class of drop is plausible for kernels (e.g. retiring
`'jscad'`, `'zoo'`, or `'opencascadejs'`). Without boundary validation,
every stale row silently displays as OpenSCAD with the Free tier badge.

### Finding 7: Tier-badge severity

The tier badge is the most user-visible failure mode. When
`selectedKernel?.id` is `undefined`, the fallback to `'openscad'` resolves
via [`getKernelRequiredTier`](apps/ui/app/components/tier-badge.tsx) to
`'free'`, so `KernelTierBadge` renders `undefined` (no badge). This means
a user who picked a Pro-only kernel (e.g. a hypothetical hosted Zoo build)
could see no Pro indicator while the lookup is missing, then have it
appear after rehydration — a flicker that misleads users about kernel
tier and pricing.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                        | Priority | Effort | Impact |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | Add a `resolveKernel(id: KernelId): KernelConfiguration` helper that wraps `kernelById.get(id)!`. Encapsulates the "safe by construction" non-null assertion at the source so consumers receive a non-nullable value. (`Record<KernelId, …>` alone does not fix this under `noUncheckedIndexedAccess: true`.) | P0       | Low    | High   |
| R2  | Introduce a single `isKernelId(v: unknown): v is KernelId` guard backed by `kernelProviders`. Export from `@taucad/types/constants` so API + UI share it.                                                                                                                                                     | P0       | Low    | High   |
| R3  | Validate the cookie value at the `useKernel` boundary — coerce to `defaultKernel` when `!isKernelId(cookieValue)`. Same pattern for the chat-row source in `useSessionKernel`.                                                                                                                                | P0       | Low    | High   |
| R4  | Tighten `ActiveChatKernel.kernel` from `ActiveChatKernelEntry` (optional) to `KernelConfiguration` (non-nullable). Update `ActiveChatKernelEntry` type or delete it.                                                                                                                                          | P0       | Low    | High   |
| R5  | Tighten `ChatKernelSelectorProps['children']` from `selectedKernel?: …` to `selectedKernel: KernelConfiguration` so the optional render-prop branch is removed.                                                                                                                                               | P0       | Low    | Medium |
| R6  | Delete all seven production fallbacks (F1–F7). The compiler will now reject `?? 'openscad'` because `selectedKernel` is non-nullable.                                                                                                                                                                         | P0       | Low    | High   |
| R7  | Update test mocks (T1–T8) to supply a real `KernelConfiguration` via `kernelConfigurations.find((k) => k.id === 'openscad')!`. Document the canonical mock shape in one helper to avoid drift.                                                                                                                | P1       | Low    | Medium |
| R8  | At the persistence-machine `chatRetrieved` boundary, drop `event.chat?.activeKernel` to `undefined` when `!isKernelId(value)`. Avoids stale-id resurrection after a kernel removal.                                                                                                                           | P1       | Low    | Medium |
| R9  | At the IndexedDB and Postgres read paths (`apps/ui/app/db/indexeddb-storage.ts`, `apps/api/.../chat` persistence), reuse the same guard. Centralises the healing so future kernel removals stay safe.                                                                                                         | P1       | Low    | Medium |
| R10 | After R1–R6 land, run `pnpm nx lint ui --files='app/components/chat/chat-textarea-*.tsx'` and assert zero remaining `'openscad'` literals in TSX label paths via a targeted rg check.                                                                                                                         | P2       | Low    | Low    |

## Architectural Solution

### Layer 1 — Type-level non-null lookup via a typed resolver

Add a `resolveKernel(id: KernelId): KernelConfiguration` helper that
encapsulates the lookup. The helper is safe by construction —
`KernelId` is the closed union literally derived from
`kernelConfigurations[number]['id']`, so the lookup cannot miss — and
the non-null assertion lives in exactly one place. The container itself
stays a `Map` (or could be a `Record`; the choice is now an
implementation detail).

This approach is preferred over swapping `Map` for
`Record<KernelId, KernelConfiguration>` because the repo runs with
`noUncheckedIndexedAccess: true`, which widens every dynamic indexed
access to `T | undefined` regardless of how narrow the key type is. The
helper bypasses that widening once at the source and gives every
consumer a `KernelConfiguration` directly.

```typescript
// libs/types/src/constants/kernel.constants.ts
const kernelById = new Map(kernelConfigurations.map((k) => [k.id, k]));

/**
 * Resolve a `KernelId` to its `KernelConfiguration`. The lookup cannot
 * miss because `id` is the closed union derived from
 * `kernelConfigurations[number]['id']`, so the non-null assertion is
 * safe by construction. Encapsulating it here removes the
 * `?? 'openscad'` fallback class at every consumer site.
 */
export function resolveKernel(id: KernelId): KernelConfiguration {
  return kernelById.get(id)!;
}

export const isKernelId = (v: unknown): v is KernelId =>
  typeof v === 'string' && (kernelProviders as readonly string[]).includes(v);
```

Both helpers move into `@taucad/types/constants` so the API can reuse
them when validating wire payloads. `useKernel`, `useCookieKernel`, and
`useSessionKernel` consume them directly:

```typescript
// apps/ui/app/hooks/use-kernel.tsx
import { resolveKernel, isKernelId } from '@taucad/types/constants';

export const useKernel = () => {
  const [raw, setKernel] = useCookie<KernelId>(cookieName.cadKernel, defaultKernel);
  const kernel = isKernelId(raw) ? raw : defaultKernel;
  const selectedKernel = resolveKernel(kernel);
  return { kernel, setKernel, selectedKernel };
};
```

`selectedKernel` is now `KernelConfiguration`, not
`KernelConfiguration | undefined`.

### Layer 2 — Runtime validation at every boundary

Apply `isKernelId` once per boundary, never per render. The boundaries
are:

- **Cookie read** (`useKernel`) — fall back to `defaultKernel`.
- **Chat-row hydration** (`chat-persistence.machine.ts` `chatRetrieved`)
  — coerce invalid ids to `undefined` so `chatActiveKernel ?? cookieKernel`
  picks up the cookie default.
- **API request validation** (`apps/api/.../chat` controller) — reject
  payloads where `activeKernel` fails the guard. Keeps the wire and the
  DB clean of stale ids without UI participation.

### Layer 3 — Tighten the consumer-facing types

```typescript
// apps/ui/app/hooks/active-chat-provider.tsx
export type ActiveChatKernel = {
  kernelId: KernelId;
  kernel: KernelConfiguration; // was: ActiveChatKernelEntry (=| undefined)
  setActiveKernel: (kernelId: KernelId) => void;
};

// apps/ui/app/components/chat/chat-kernel-selector.tsx
type ChatKernelSelectorProps = {
  readonly children: (props: { selectedKernel: KernelConfiguration }) => ReactNode;
  // …
};
```

After this change, every `selectedKernel?.name ?? 'OpenSCAD'` site fails
to typecheck. Removing the fallback is a one-character delete per site
and a one-import update per file (KernelTierBadge already accepts the
strict `KernelId` type).

### Layer 4 — Drop test-mock optionality

Replace every `kernel: { kernelId: 'openscad', kernel: undefined, … }` with:

```typescript
const openscad = kernelConfigurations.find((k) => k.id === 'openscad')!;
const mockKernel: ActiveChatKernel = {
  kernelId: 'openscad',
  kernel: openscad,
  setActiveKernel: vi.fn(),
};
```

Consider extracting a `buildComposerMock({ kernelId })` helper colocated
with `active-chat-provider.tsx` so the mock shape stays in lockstep with
the production type.

## Trade-offs

| Approach                                                                                       | Pros                                                   | Cons                                                                                               | Verdict |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------- |
| **A. Keep `Map.get`, fix fallbacks one site at a time**                                        | Smallest blast radius per change                       | Doesn't solve the class of bug; the next consumer adds a fresh fallback                            | Reject  |
| **B. Swap `Map` for `Record<KernelId, V>` only**                                               | Looks like a tidy container choice                     | Does nothing under `noUncheckedIndexedAccess: true`; indexed access still returns `T \| undefined` | Reject  |
| **B′. Add `resolveKernel(id)` helper only**                                                    | Removes type-level optionality at the single source    | Leaves runtime invalidity unhealed; stale cookie/DB rows still degrade silently                    | Reject  |
| **C. Layer 1 (resolver) + Layer 2 (boundary guards) + Layer 3 (consumer types) (recommended)** | Eliminates the bug class at the type AND runtime level | Touches more files (incl. test mocks)                                                              | Accept  |
| **D. Render an "Unknown kernel" placeholder when lookup misses**                               | Honest UX during a removal window                      | Adds a new render state for an invariant we can guarantee statically                               | Reject  |
| **E. Throw at the lookup boundary**                                                            | Loud failure for stale ids                             | Crashes the chat composer; worse UX than silent OpenSCAD fallback                                  | Reject  |

Option C combines compile-time non-nullability (Layers 1 + 3) with
runtime healing (Layer 2). Stale cookie or chat-row values are coerced
to a known-valid kernel id at the boundary; everything downstream can
treat the value as a definite `KernelConfiguration`.

## Code Examples

### Before — current state

```ts
// apps/ui/app/hooks/use-kernel.tsx
const kernelById = new Map(kernelConfigurations.map((k) => [k.id, k]));
export const useKernel = () => {
  const [kernel, setKernel] = useCookie<KernelProvider>(cookieName.cadKernel, defaultKernel);
  const selectedKernel = kernelById.get(kernel); // KernelConfiguration | undefined
  return { kernel, setKernel, selectedKernel };
};
```

```tsx
// apps/ui/app/components/chat/chat-textarea-desktop.tsx
<span className='hidden items-center gap-1.5 truncate text-xs @[22rem]:inline-flex'>
  {selectedKernel?.name ?? 'OpenSCAD'}
  <KernelTierBadge kernelId={selectedKernel?.id ?? 'openscad'} />
</span>
<SvgIcon id={selectedKernel?.id ?? 'openscad'} />
```

### After — recommended state

```ts
// libs/types/src/constants/kernel.constants.ts
const kernelById = new Map(kernelConfigurations.map((k) => [k.id, k]));

export function resolveKernel(id: KernelId): KernelConfiguration {
  // Safe by construction: `id` is the closed union derived from
  // `kernelConfigurations[number]['id']`, so the lookup cannot miss.
  return kernelById.get(id)!;
}

export const isKernelId = (v: unknown): v is KernelId =>
  typeof v === 'string' && (kernelProviders as readonly string[]).includes(v);
```

```ts
// apps/ui/app/hooks/use-kernel.tsx
import { resolveKernel, isKernelId } from '@taucad/types/constants';
export const useKernel = () => {
  const [raw, setKernel] = useCookie<KernelId>(cookieName.cadKernel, defaultKernel);
  const kernel = isKernelId(raw) ? raw : defaultKernel;
  const selectedKernel = resolveKernel(kernel); // KernelConfiguration
  return { kernel, setKernel, selectedKernel };
};
```

```tsx
// apps/ui/app/components/chat/chat-textarea-desktop.tsx
<span className='hidden items-center gap-1.5 truncate text-xs @[22rem]:inline-flex'>
  {selectedKernel.name}
  <KernelTierBadge kernelId={selectedKernel.id} />
</span>
<SvgIcon id={selectedKernel.id} />
```

## Diagrams

### Data flow — current state

```
cookie (string) ──► useCookie ──► useKernel ──► selectedKernel?
                                                     │
chat row     ──► loadChatActor ──► persistence ───── │ ──► useChatComposer().kernel.kernel?
                                                     │           │
                                                     ▼           ▼
                                          kernelById.get(id) returns T | undefined
                                                     │
                                                     ▼
                                  consumer applies `?? 'openscad'` at every site
```

### Data flow — recommended state

```
cookie / chat row ──► boundary guard `isKernelId` ──► KernelId (non-null)
                                                          │
                                                          ▼
                                              resolveKernel(id) : KernelConfiguration
                                                          │
                                                          ▼
                                consumers render `selectedKernel.name` directly
                                          (fallback expressions removed)
```

## References

- Triggering site: `apps/ui/app/components/chat/chat-textarea-desktop.tsx`
  (lines 434–440)
- Mirror site: `apps/ui/app/components/chat/chat-textarea-mobile.tsx`
  (lines 273–279)
- Source of optionality: `apps/ui/app/hooks/use-kernel.tsx` +
  `apps/ui/app/hooks/active-chat-provider.tsx`
- Related: `docs/research/chat-composer-context-unification.md`
  (the composer-vs-session strategy split that surfaces `kernel.kernel`
  to UI consumers)
- Related: `docs/research/chat-active-model-kernel-persistence.md`
  (the dual-write contract for `Chat.activeKernel` that this audit
  builds on; R8/R9 here extend the same boundary discipline)
- Precedent for value-set removal:
  `apps/api/app/database/migrations/0008_drop_unlisted.sql`

## Appendix — Audit Commands

```bash
rg "selectedKernel\?\." apps/ui --type=tsx -n
rg "\\?\\?\\s*'openscad'" apps/ui --type=tsx -n
rg "kernel: undefined" apps/ui --type=tsx -n
rg "kernelById\\.get|kernel-by-id" apps/ui packages/runtime libs -n
```

Cross-referenced against the production `useChatComposer`/`useKernel`
consumers and the eight test mocks listed in Finding 5.
