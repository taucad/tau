---
title: 'Runtime Naming Audit and Critique'
description: 'Audit of recently renamed symbols in @taucad/runtime, deep critique of RenderSettlement, and prioritised rename recommendations evaluated against library-api-policy.md.'
status: draft
created: '2026-04-22'
updated: '2026-05-08'
category: audit
related:
  - docs/policy/library-api-policy.md
  - docs/research/runtime-event-driven-api-blueprint-v5.md
  - docs/research/runtime-quickstart-dx-regression.md
---

# Runtime Naming Audit and Critique

Inventory and self-critique of every rename in `packages/runtime/` since `origin/main`, anchored on the question: **does `RenderSettlement` (and the surrounding new vocabulary) describe what the consumer sees, or does it leak how we built it?**

## Executive Summary

The recent v5 lifecycle work (`openFile`/`updateParameters`/`setOptions` → `Promise<RenderSettlement>`) is mostly excellent — verb renames are concrete, consistent, and obey `library-api-policy.md` §5 (describe the action, not the architecture). However the **return-type vocabulary leaks Promise spec jargon**: the single most contentious name is `RenderSettlement` — technically accurate, but "settlement" is reading-comprehension friction for everyone who has not internalised "settle" as Promise-spec terminology. We recommend renaming the discriminated union to `RenderOutcome`, paired with a small cluster of supporting renames (`hasRenderContext` → `hasSettledRender`, `NoActiveRenderContextError` → `NoSettledRenderError`, `pendingIntent` → `pendingRender`) so the whole vocabulary tells one consistent story.

The companion **time-unit rename wave** (`renderTimeoutMs` → `renderTimeout`, etc.) is now codified in [`library-api-policy.md` §21](../policy/library-api-policy.md#21-temporal-values): all temporal values are milliseconds, no unit suffix in the identifier, unit declared in JSDoc. This audit endorses that policy and recommends no further changes to the renamed identifiers.

**Release posture.** `@taucad/runtime` is **unreleased** (no version on npm, no external consumers). Every recommendation in this document lands as a **direct breaking change**: rename in place, delete the old name, no deprecation cycle, no dual exports, no migration shims, no changelog entries beyond the one-line "renamed `X` → `Y`". The same applies to the wire protocol — bump the symbol and move on. This is the cheapest moment in the package's lifetime to fix naming; we should spend it.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings](#findings)
  - [Finding 1: Inventory of recent renames in `packages/runtime/`](#finding-1-inventory-of-recent-renames-in-packagesruntime)
  - [Finding 2: `RenderSettlement` leaks Promise-spec jargon](#finding-2-rendersettlement-leaks-promise-spec-jargon)
  - [Finding 3: The `*Intent*` cluster is consumer-visible without ever being defined](#finding-3-the-intent-cluster-is-consumer-visible-without-ever-being-defined)
  - [Finding 4: `NoActiveRenderContextError` invents a concept ("render context") that no other API uses](#finding-4-noactiverendercontexterror-invents-a-concept-render-context-that-no-other-api-uses)
  - [Finding 5: Lifecycle verb renames (`setFile` → `openFile`, etc.) are uniformly good](#finding-5-lifecycle-verb-renames-setfile--openfile-etc-are-uniformly-good)
  - [Finding 6: `AbortReasonName` / `AbortReasonValue` is symbolic-vs-encoded but the suffixes are awkward](#finding-6-abortreasonname--abortreasonvalue-is-symbolic-vs-encoded-but-the-suffixes-are-awkward)
  - [Finding 7: Transport adds `observeWorkerState` while runtime client uses `on('state', handler)` — inconsistent](#finding-7-transport-adds-observeworkerstate-while-runtime-client-uses-onstate-handler--inconsistent)
  - [Finding 8: `RuntimeLifecycleState` literals are good; `unconnected` is the only weak spot](#finding-8-runtimelifecyclestate-literals-are-good-unconnected-is-the-only-weak-spot)
  - [Finding 9: Stale legacy errors (`RenderSupersededError`, `RenderAbortedError`) are exported but unreachable](#finding-9-stale-legacy-errors-rendersupersedederror-renderabortederror-are-exported-but-unreachable)
- [Recommendations](#recommendations)
- [Trade-offs](#trade-offs)
- [Appendix](#appendix)

## Problem Statement

The discriminated union returned by `client.openFile`/`updateParameters`/`setOptions` is named `RenderSettlement`. The user's read of it: **"weird feeling"**. The doc-simplification work in [`runtime-quickstart-dx-regression.md`](runtime-quickstart-dx-regression.md) had to prepend a sentence ("the latest render outcome — `geometry` on success, or just `superseded: true` when a newer call took over") because nobody reading the type name understands what they get back. That is the textbook smoke signal for [policy §5](../policy/library-api-policy.md#5-naming-conventions): "Describe the action, not the architecture" — `Settlement` describes a Promise-spec mechanism (the moment a Promise stops being pending), not the consumer-visible meaning (the outcome of one render attempt, possibly invalidated).

The same audit reveals a wider story: across the v5 rename wave, action verbs (`openFile`, `updateParameters`, `signalAbort`) became dramatically more concrete, but a handful of supporting names — `RenderSettlement`, `pendingIntent`, `hasRenderContext`, `NoActiveRenderContextError`, `AbortReasonName`/`Value` — drifted toward implementation-speak. We need to decide what to keep, what to rename, and where the remaining alternatives are.

## Methodology

1. **Working-copy diff harvest.** Ran `git diff origin/main -- packages/runtime/` and `git log --oneline origin/main..HEAD` (24 commits ahead, 7,454 lines of diff) to enumerate every symbol-level addition, removal, and rename inside the runtime.
2. **Symbol classification.** Tagged each rename by surface (public type/error/event/method, internal variable, wire-protocol literal, file path) using `Grep` against the working tree.
3. **Cross-reference.** Walked every consumer (`apps/ui/app/machines/cad.machine.ts`, `await-fresh-render.ts`, the new `runtime-client-*.test.ts` suites, the `runtime-event-driven-api-blueprint-v5.md` design doc) to confirm whether each new name has actually shaped consumer code.
4. **Policy alignment.** Mapped every name to the relevant clause of [`library-api-policy.md`](../policy/library-api-policy.md): §5 (naming), §11 (no optional methods), §19 (error design), §20 (discriminated-union settlements), and the `on*`/`from*`/`create*` prefix table.
5. **Self-critique loop.** For each name we authored, generated 3–5 candidate alternatives, then graded each on (a) policy compliance, (b) reading-comprehension friction at the call site, (c) stutter/overload risk against existing types.

## Findings

### Finding 1: Inventory of recent renames in `packages/runtime/`

The complete catalogue is in the [Appendix](#appendix); the table below summarises by category.

| Category                  | Count | Representative example                                                 | Verdict (preview)             |
| ------------------------- | ----: | ---------------------------------------------------------------------- | ----------------------------- |
| Public command verbs      |     3 | `setFile` → `openFile`                                                 | Keep (good)                   |
| Public discriminated type |     1 | new `RenderSettlement`                                                 | Rename                        |
| Public lifecycle state    |     1 | new `RuntimeLifecycleState` (`unconnected` / …)                        | Mostly keep                   |
| Public error classes      |     5 | new `NoActiveRenderContextError`, `RuntimeNotConnectedError`, …        | Mixed                         |
| Public events             |     1 | `'activeKernel'` → `'activeKernelChanged'`                             | Keep (good)                   |
| Internal state            |     6 | `pendingIntent`, `hasRenderContext`, `settlePriorAsSuperseded`, …      | Rename                        |
| Wire-protocol literals    |     4 | `'setFile'` → `'openFile'` + new `'setOptions'`, `'abort'` verbs       | Keep                          |
| Time-related parameters   |    14 | `windowMs` → `coalescingWindow`, `debounceMs` → `watchDebounce`, …     | Keep (codified in policy §21) |
| Folder paths              |     1 | `kernels/replicad/oc-*` → `kernels/occt/oc-*`                          | Keep (good)                   |
| Transport surface         |     5 | new `signalAbort`, `observeWorkerState`, `resolveGeometry`, `describe` | Mostly keep                   |

### Finding 2: `RenderSettlement` leaks Promise-spec jargon

```typescript
export type RenderSettlement =
  | { readonly superseded: false; readonly geometry: HashedGeometryResult }
  | { readonly superseded: true };
```

**Why the name was chosen.** [`library-api-policy.md` §20](../policy/library-api-policy.md#20-discriminated-union-settlements-for-race-prone-async-apis) coined "settlement" to describe the pattern: a discriminated union returned by an async method that _resolves_ even on supersession instead of rejecting. The name maps directly to ECMAScript's "settled" Promise terminology (the union of fulfilled + rejected).

**Why it reads weird.**

1. **`Settle`/`Settlement` is internal-machinery vocabulary.** The standard library never exports a type whose name ends in `Settlement`. The closest precedent (`Promise.allSettled` → `PromiseSettledResult`) tucks the word inside a hyphenated compound, never standing alone.
2. **The dominant meaning of "settlement" in everyday English is financial/legal**, not Promise-spec. Readers who haven't read MDN's Promise glossary in the last 24 hours have to context-switch.
3. **The name describes _when_ the value arrives, not _what_ it is.** A consumer types `client.openFile(...).then(s => …)` and asks "what is `s`?". The answer is "the outcome of this render", not "the moment this Promise stopped being pending".
4. **Policy §5 self-test fails.** The policy says: "Describe the action, not the architecture." `Settlement` describes the architectural fact that we don't reject on supersession. The same value, named `RenderOutcome`, would tell the consumer the _what_ without spending a word on the _how_.

**Candidate alternatives.**

| Candidate               | Pros                                              | Cons                                                                      |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| `RenderOutcome`         | Direct, reads as English, no Promise-spec baggage | "Outcome" is slightly soft (no implication of finality)                   |
| `RenderResult`          | Most direct — universal "what came out" word      | Already overloaded by `ExportResult`/`KernelResult` (success/issue shape) |
| `RenderResolution`      | Maps to `Promise.resolve` semantics               | Overloads "resolution" with screen/3D resolution                          |
| `RenderCompletion`      | Maps to "completion" of an attempted operation    | Implies the work finished; supersession arguably means it didn't          |
| `RenderResponse`        | Mirrors HTTP `Response` mental model              | Conflates request/response duality with a fire-and-forget intent          |
| `RenderHandle`          | Active object metaphor                            | "Handle" implies a live, queryable reference; this is a snapshot value    |
| Keep `RenderSettlement` | Matches policy §20 precedent verbatim             | Consumer reading-comprehension friction every time they see it            |

**Recommended winner: `RenderOutcome`.** It satisfies §5 ("describe the action"), avoids the existing `Result` overload, reads as plain English, and pairs naturally with the consumer-visible discriminant: "did the render succeed, or was it superseded?"

The same rename should propagate to the JSDoc and to `library-api-policy.md` §20 itself (the section title would become "Discriminated-Union Outcomes for Race-Prone Async APIs").

### Finding 3: The `*Intent*` cluster is consumer-visible without ever being defined

Three names introduced in the v5 work all use the word "intent":

```typescript
// packages/runtime/src/client/runtime-client.ts
type PendingIntent = { resolve: …; reject: … };
let pendingIntent: PendingIntent | undefined;
function settlePriorAsSuperseded(): void { … }
function settlePriorWithGeometry(geometry): void { … }
function settlePriorWithError(issues): void { … }
function trackPendingIntent(): Promise<RenderSettlement> { … }

// apps/ui/app/machines/await-fresh-render.ts
const baselineIntentId = cadActor.getSnapshot().context.lastRequestedIntentId;

// apps/ui/app/machines/cad.machine.ts
context: { lastRequestedIntentId: 0, lastSettledIntentId: 0 }
```

The internal references are technically private to `runtime-client.ts`, but the **`lastRequestedIntentId` / `lastSettledIntentId` pair lives on `cad.machine.context`** and is referenced by the `awaitFreshRender` helper that maps directly onto the chat-RPC freshness oracle. It is consumer-visible API in everything but name.

**Why "intent" is weak.**

- It is **never defined**. Reading the code, the closest definition is "the last user-initiated render request that the machine has acknowledged" — but a fresh reader cannot derive that from the word.
- It conflicts with React/UI-framework usage of "intent" (e.g. `useIntent` hooks, intent-based gestures).
- The same concept is called **"pending render"** in `RuntimeWorkerClient.cancelPendingRender()`, and **"render context"** in `NoActiveRenderContextError`. Three different words for the same idea — a textbook overloading violation per policy §5 ("Avoid overloading terms").

**Recommendation.** Pick one canonical noun across all layers. The strongest candidate is **render** (we're in a CAD runtime; the noun is unambiguous):

| Old                               | Proposed                          |
| --------------------------------- | --------------------------------- |
| `pendingIntent` / `PendingIntent` | `pendingRender` / `PendingRender` |
| `trackPendingIntent`              | `trackPendingRender`              |
| `settlePriorAsSuperseded`         | `supersedePendingRender`          |
| `settlePriorWithGeometry`         | `resolvePendingRender`            |
| `settlePriorWithError`            | `rejectPendingRender`             |
| `lastRequestedIntentId`           | `lastRequestedRenderId`           |
| `lastSettledIntentId`             | `lastSettledRenderId`             |
| `baselineIntentId`                | `baselineRenderId`                |

This is a mechanical rename with high impact-per-keystroke: every read site becomes self-explanatory.

### Finding 4: `NoActiveRenderContextError` invents a concept ("render context") that no other API uses

```typescript
export class NoActiveRenderContextError extends Error {
  public constructor() {
    super(
      'client.export(format) requires a prior openFile/updateParameters/setOptions ' +
        'settlement. Use client.export(format, input) to self-render in one call.',
    );
    this.name = 'NoActiveRenderContextError';
  }
}
```

The internal flag backing this error is `hasRenderContext: boolean` — flipped to `true` on the first successful `geometry` event. Three problems:

1. **"Render context" is not a thing in the public API.** The runtime never returns or accepts an object called `RenderContext`. The phrase is invented purely to justify the error.
2. **The error message itself never says "render context"** — it talks about a "prior `openFile`/`updateParameters`/`setOptions` settlement", which is the actual condition. The class name and the message are out of sync.
3. **Length.** 26 characters of class name + `Error` suffix = 31. Combined with the verbose message it becomes the longest error string in the runtime surface.

**Recommendation.** Rename in lock-step with Finding 2:

| Old                            | Proposed                 |
| ------------------------------ | ------------------------ |
| `NoActiveRenderContextError`   | `NoSettledRenderError`   |
| `isNoActiveRenderContextError` | `isNoSettledRenderError` |
| `hasRenderContext` (internal)  | `hasSettledRender`       |

The new name (a) matches the actual condition, (b) cross-references `RenderOutcome` / "settled" terminology that does exist on the public surface, and (c) is 8 characters shorter.

### Finding 5: Lifecycle verb renames (`setFile` → `openFile`, etc.) are uniformly good

| Old                           | New                      | Why it's better                                                                            |
| ----------------------------- | ------------------------ | ------------------------------------------------------------------------------------------ |
| `RuntimeClient.setFile`       | `openFile`               | Action-shaped; pairs with file-editor mental model; obvious return-value semantics         |
| `RuntimeClient.setParameters` | `updateParameters`       | "Update" telegraphs the side effect (re-render); avoids `set*` getter/setter ambiguity     |
| (new) `setOptions`            | `setOptions`             | Acceptable — kernel options are a property bag; `update` would falsely imply patch-merge   |
| Wire `'setFile'`              | `'openFile'`             | Symmetric with the consumer verb                                                           |
| Wire `'setParameters'`        | `'updateParameters'`     | Same                                                                                       |
| Worker `handleSetFile`        | `handleOpenFile`         | Same                                                                                       |
| Worker `handleSetParameters`  | `handleUpdateParameters` | Same                                                                                       |
| Event `'activeKernel'`        | `'activeKernelChanged'`  | Adds the `*Changed` suffix — consumer infers "fires on transitions"; matches `state` event |

**Verdict: keep all of these.** They are exactly the kind of rename §5 prescribes (action-shaped, symmetric, no leaked architecture). Note the one mild inconsistency: `setOptions` survives the `set*` ban because the worker actually replaces (not patches) the option bag. The JSDoc could call this out explicitly: "Replaces the active per-render kernel options."

### Finding 6: `AbortReasonName` / `AbortReasonValue` is symbolic-vs-encoded but the suffixes are awkward

```typescript
export type AbortReasonName = 'supersede' | 'timeout';
export type AbortReasonValue = (typeof abortReason)[keyof typeof abortReason];
export const abortReason = { none: 0, superseded: 1, timeout: 2 } as const;
```

Three problems:

1. **Two type names with similar surfaces.** A consumer who autocompletes `AbortReason` sees both and has to read the doc to decide which one they want.
2. **The `*Name` suffix is unidiomatic.** Idiomatic TS uses bare nouns for the public type (`AbortReason`) and a `*Code`/`*Numeric` suffix for the encoded form when it must be exposed.
3. **`'supersede'` (verb) vs `superseded` (past participle in `abortReason.superseded`) is inconsistent.** Pick one tense.

**Recommendation.**

| Old                | Proposed                                  |
| ------------------ | ----------------------------------------- |
| `AbortReasonName`  | `AbortReason` (public)                    |
| `AbortReasonValue` | `AbortReasonCode` (internal, `@internal`) |
| `'supersede'`      | `'superseded'` (match the enum)           |

The transport API becomes `signalAbort(reason: AbortReason)`, the internal SAB write uses `AbortReasonCode`. Consumers see the past-participle form everywhere.

### Finding 7: Transport adds `observeWorkerState` while runtime client uses `on('state', handler)` — inconsistent

```typescript
// transport/runtime-transport.ts
export type RuntimeTransport = {
  observeWorkerState(handler: (state: WorkerState, detail?: string) => void): Unsubscribe;
  …
};

// client/runtime-client.ts
on(event: 'state', handler: (state: WorkerState, detail?: string) => void): () => void;
```

Same callback shape, two different names + verbs. Per policy §5's prefix table, framework hooks/callbacks use `on*`. The transport should follow the same pattern:

| Old                  | Proposed                                                             |
| -------------------- | -------------------------------------------------------------------- |
| `observeWorkerState` | `onWorkerStateChange` (or just keep `on('workerState', ...)` parity) |
| `Unsubscribe` type   | Acceptable (matches Effect-TS, RxJS), but `() => void` is also fine  |

Either bring the transport into the `on*`-prefix family, or document the deliberate divergence (probably: transport prefers single-listener observer to match `MessagePort`'s 1:1 wire; client fans out 1:N).

### Finding 8: `RuntimeLifecycleState` literals are good; `unconnected` is the only weak spot

```typescript
export type RuntimeLifecycleState = 'unconnected' | 'connecting' | 'connected' | 'terminated';
```

`connecting`/`connected`/`terminated` read perfectly. `unconnected` is a non-standard English construction (the negation prefix `un-` reads as "previously connected, no longer so" — exactly the wrong meaning for a fresh client).

**Candidate alternatives.**

| Candidate                          | Pros                                   | Cons                                       |
| ---------------------------------- | -------------------------------------- | ------------------------------------------ |
| `unconnected`                      | Literally "not connected"              | Awkward English; reads like "disconnected" |
| `disconnected`                     | Standard English                       | Wrongly implies prior connection           |
| `idle`                             | Short, common state-machine name       | Conflicts with `WorkerState.idle`          |
| `pristine`                         | Distinct vocabulary                    | Unusual; reads as moralising               |
| `pending`                          | Pairs with Promise terminology         | Overloads `pending` (Promise state)        |
| `created`                          | Factual: "the factory has been called" | Slight noun/verb ambiguity                 |
| `idle` (with `WorkerState` rename) | Cleanest                               | Touches more files                         |

**Recommendation.** Keep `unconnected` for now — none of the alternatives is strictly better, and a rename here cascades into the existing oxlint snapshots and tests. Worth revisiting only if `WorkerState.idle` is itself renamed (e.g. to `ready` post-init), at which point `RuntimeLifecycleState.idle` becomes available.

### Finding 9: Stale legacy errors (`RenderSupersededError`, `RenderAbortedError`) are exported but unreachable

`runtime/src/index.ts` still re-exports five `Render*Error` classes:

```typescript
export {
  RenderSupersededError, // throw site removed; only thrown by removed `cancelPendingRender` path
  isRenderSupersededError,
  RenderAbortedError, // throw site removed in v5
  isRenderAbortedError,
  RenderTimeoutError, // still alive
  isRenderTimeoutError,
} from '#framework/runtime-worker-client.js';
```

Per policy §20: **"Do not throw on supersession."** The whole point of `RenderSettlement`/`RenderOutcome` is that supersession resolves the Promise; `RenderSupersededError` is now unreachable. Same for `RenderAbortedError` (v5 routes abort through `signalAbort` + the next geometry settlement, not a thrown error).

**Recommendation.** Remove `RenderSupersededError` + guard, and `RenderAbortedError` + guard, from the public surface in the same release that ships `RenderOutcome`. Keep `RenderTimeoutError` (still reachable via the timeout path). This collapses the error list from 5 → 1 and removes a documented anti-pattern from the public surface.

## Recommendations

| #   | Action                                                                                                                                                                                        | Priority | Effort | Impact |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | Rename `RenderSettlement` → `RenderOutcome` (type, JSDoc, doc references, policy §20 title)                                                                                                   | P0       | Low    | High   |
| R2  | Rename internal `pendingIntent` cluster + UI-side `lastRequestedIntentId`/`lastSettledIntentId` → `pendingRender` / `lastRequestedRenderId` / `lastSettledRenderId` (Finding 3 mapping table) | P0       | Medium | High   |
| R3  | Rename `NoActiveRenderContextError` → `NoSettledRenderError`; rename `hasRenderContext` (internal) → `hasSettledRender`                                                                       | P0       | Low    | Medium |
| R4  | Remove unreachable `RenderSupersededError` + guard, `RenderAbortedError` + guard from public surface; keep only `RenderTimeoutError`                                                          | P0       | Low    | Medium |
| R5  | Rename `AbortReasonName` → `AbortReason`, `AbortReasonValue` → `AbortReasonCode`, switch `'supersede'` literal → `'superseded'`                                                               | P1       | Low    | Medium |
| R6  | Reconcile `RuntimeTransport.observeWorkerState` with the `on*` prefix convention (rename to `onWorkerStateChange`) or document the deliberate divergence                                      | P2       | Low    | Low    |
| R7  | Document `setOptions`'s replace-not-patch semantics in JSDoc (the `set*` exception)                                                                                                           | P2       | Low    | Low    |
| R8  | Defer `RuntimeLifecycleState` literal change (`unconnected` → ?) until `WorkerState.idle` rename frees the slot                                                                               | P3       | Low    | Low    |

R1–R4 should ship together as a single coherent vocabulary refresh; R5–R8 can land independently.

**Execution model.** `@taucad/runtime` is unreleased — no npm version, no external consumers, no published wire-protocol consumers outside this monorepo. Every rename above lands as a **hard breaking change**: rename in place, delete the old export, do not add `/** @deprecated */` aliases, do not export under both names "for one minor", do not log migration warnings. Update every internal call site in the same PR (`apps/ui`, `apps/api`, `packages/cli`, tests, MDX docs, `libs/api-extractor` generated typings) so the tree compiles green at the rename commit. Wire-protocol literal renames (e.g. the `'supersede'` → `'superseded'` flip in R5) ship the same way — bump the symbol on both sides of the `postMessage` and move on. This is the cheapest moment in the package's lifetime to fix naming; we should spend it.

The time-unit rename wave (`*Ms` suffix removal) that this audit initially flagged is now codified in [`library-api-policy.md` §21](../policy/library-api-policy.md#21-temporal-values) as the canonical convention: all temporal values are milliseconds, no unit suffix in the identifier, unit declared in JSDoc, enforced by `tau-lint/no-time-unit-suffix` + `tau-lint/no-bare-time-identifier`. No further changes recommended.

## Trade-offs

### `RenderOutcome` vs `RenderResult`

`RenderResult` is the most direct translation of "what comes back from a render" but it would create stuttering with `ExportResult`/`KernelResult`, both of which use the `success | issues` discriminant. `RenderOutcome` carves out a distinct slot for the supersession-aware union without colliding.

### Rename impact vs API churn

`@taucad/runtime` is **unreleased** (no version on npm, no external consumers). The deprecation-cycle guidance in [`api-evolution-policy.md`](../policy/api-evolution-policy.md) (dual exports for one minor, `/** @deprecated */` aliases, migration warnings on the old name) **does not apply** here. Every rename in this audit lands as a direct breaking change in a single PR that updates every internal consumer in the same commit. The v5 wire-protocol changes already shipped this way; the same posture continues until the package's first published version.

## Appendix

### A. Full rename inventory (since `origin/main`)

#### Public surface — types, errors, events

| Surface | Old                                             | New                                                                           | Verdict                                           |
| ------- | ----------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------- |
| Type    | `Promise<HashedGeometryResult>` (from `render`) | `Promise<RenderSettlement>` (from `openFile`/`updateParameters`/`setOptions`) | **Rename to `RenderOutcome`** (R1)                |
| Type    | (none)                                          | `RuntimeLifecycleState`                                                       | Keep; revisit `unconnected` literal (R8)          |
| Type    | (none)                                          | `AbortReasonName`                                                             | **Rename to `AbortReason`** (R5)                  |
| Type    | (none)                                          | `AbortReasonValue`                                                            | **Rename to `AbortReasonCode`** (R5)              |
| Type    | (none)                                          | `TransportDescriptor`                                                         | Keep                                              |
| Type    | (none)                                          | `Unsubscribe`                                                                 | Keep                                              |
| Error   | (none)                                          | `NoActiveRenderContextError`                                                  | **Rename to `NoSettledRenderError`** (R3)         |
| Error   | (none)                                          | `RuntimeNotConnectedError`                                                    | Keep                                              |
| Error   | (none)                                          | `RuntimeConnectionError`                                                      | Keep (consider `RuntimeConnectFailedError` later) |
| Error   | (none)                                          | `RuntimeTerminatedError`                                                      | Keep                                              |
| Error   | (legacy) `RenderSupersededError`                | (unreachable)                                                                 | **Remove from surface** (R4)                      |
| Error   | (legacy) `RenderAbortedError`                   | (unreachable)                                                                 | **Remove from surface** (R4)                      |
| Event   | `'activeKernel'`                                | `'activeKernelChanged'`                                                       | Keep                                              |

#### Public surface — methods

| Surface               | Old                                              | New                                                                  | Verdict                                                                                                                                             |
| --------------------- | ------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RuntimeClient`       | `render(input)`                                  | `openFile(input)`                                                    | Keep                                                                                                                                                |
| `RuntimeClient`       | `setFile(file, params, opts)`                    | (folded into `openFile`)                                             | Keep                                                                                                                                                |
| `RuntimeClient`       | `setParameters(params)`                          | `updateParameters(params)`                                           | Keep                                                                                                                                                |
| `RuntimeClient`       | `setRenderTimeout(seconds)`                      | `setOptions({ renderTimeout })`                                      | Keep — `renderTimeout` is milliseconds per policy §21 (silent unit change from the prior seconds-based API was caught and fixed during the v5 wave) |
| `RuntimeClient`       | `notifyFileChanged(paths)`                       | (removed; auto-handled)                                              | Keep                                                                                                                                                |
| `RuntimeClient`       | `geometryPool` (getter)                          | (removed; transport-internal)                                        | Keep                                                                                                                                                |
| `RuntimeClient`       | (none)                                           | `lifecycleState` (getter)                                            | Keep                                                                                                                                                |
| `RuntimeTransport`    | (none)                                           | `signalAbort(reason)`                                                | Keep                                                                                                                                                |
| `RuntimeTransport`    | (none)                                           | `observeWorkerState(handler)`                                        | **Reconcile with `on*` prefix** (R6)                                                                                                                |
| `RuntimeTransport`    | (none)                                           | `resolveGeometry(payload)`                                           | Keep                                                                                                                                                |
| `RuntimeTransport`    | (none)                                           | `describe()`                                                         | Keep                                                                                                                                                |
| `RuntimeWorkerClient` | `setFile` / `setParameters` / `setRenderTimeout` | `openFile` / `updateParameters` / `setOptions`                       | Keep                                                                                                                                                |
| `KernelRuntimeWorker` | `handleSetFile` / `handleSetParameters`          | `handleOpenFile` / `handleUpdateParameters` / new `handleSetOptions` | Keep                                                                                                                                                |

#### Wire protocol literals (`RuntimeCommand.type`)

| Old               | New                  | Verdict |
| ----------------- | -------------------- | ------- |
| `'setFile'`       | `'openFile'`         | Keep    |
| `'setParameters'` | `'updateParameters'` | Keep    |
| (none)            | `'setOptions'`       | Keep    |
| (none)            | `'abort'`            | Keep    |

#### Internal state / variables / helpers

| File                       | Old                                                   | New (current)                           | Recommendation                                           |
| -------------------------- | ----------------------------------------------------- | --------------------------------------- | -------------------------------------------------------- |
| `runtime-client.ts`        | `connected: boolean`                                  | `lifecycleState: RuntimeLifecycleState` | Keep                                                     |
| `runtime-client.ts`        | (new) `pendingIntent`                                 | (same)                                  | **`pendingRender`** (R2)                                 |
| `runtime-client.ts`        | (new) `trackPendingIntent`                            | (same)                                  | **`trackPendingRender`** (R2)                            |
| `runtime-client.ts`        | (new) `settlePriorAsSuperseded`                       | (same)                                  | **`supersedePendingRender`** (R2)                        |
| `runtime-client.ts`        | (new) `settlePriorWithGeometry`                       | (same)                                  | **`resolvePendingRender`** (R2)                          |
| `runtime-client.ts`        | (new) `settlePriorWithError`                          | (same)                                  | **`rejectPendingRender`** (R2)                           |
| `runtime-client.ts`        | (new) `hasRenderContext: boolean`                     | (same)                                  | **`hasSettledRender`** (R3)                              |
| `runtime-worker-client.ts` | `renderTimeoutMs` (field)                             | `renderTimeout` (field, ms)             | Keep — milliseconds is canonical per policy §21          |
| `runtime-worker-client.ts` | `signalBuffer`/`signalView` (owned)                   | (proxied via transport)                 | Keep                                                     |
| `cad.machine.ts`           | (new) `lastRequestedIntentId` / `lastSettledIntentId` | (same)                                  | **`lastRequestedRenderId` / `lastSettledRenderId`** (R2) |
| `await-fresh-render.ts`    | `baselineIntentId`                                    | (same)                                  | **`baselineRenderId`** (R2)                              |

#### Time-related parameters and constants (full list)

All renames in this group are now codified by [`library-api-policy.md` §21](../policy/library-api-policy.md#21-temporal-values): all temporal values are milliseconds, no unit suffix in the identifier, unit declared in JSDoc, enforced by `tau-lint/no-time-unit-suffix` + `tau-lint/no-bare-time-identifier`. Verdict for every row below: **keep**.

| File                                       | Old                                    | New                                                                               |
| ------------------------------------------ | -------------------------------------- | --------------------------------------------------------------------------------- |
| `bundler/esbuild.constants.ts`             | `httpFetchTimeoutMs`                   | `httpFetchTimeout`                                                                |
| `bundler/module-manager.ts`                | `fetchTimeoutMs`                       | `fetchTimeout`                                                                    |
| `bundler/module-manager.ts`                | `retryDelayMs`                         | `retryDelay`                                                                      |
| `framework/runtime-framework.constants.ts` | `waitAsyncPollIntervalMs`              | `waitAsyncPollInterval`                                                           |
| `framework/kernel-worker.ts`               | `delayMs` (param)                      | `renderDelay`                                                                     |
| `framework/runtime-worker-client.ts`       | `renderTimeoutMs` (field)              | `renderTimeout`                                                                   |
| `middleware/geometry-cache.middleware.ts`  | `maxAgeMs`                             | `maxAge`                                                                          |
| `filesystem/event-coalescer.ts`            | `windowMs`                             | `coalescingWindow`                                                                |
| `filesystem/file-service.ts`               | `kernelCoalescingWindowMs`             | `kernelCoalescingWindow`                                                          |
| `filesystem/watch-registry.ts`             | `windowMs`                             | `coalescingWindow`                                                                |
| `filesystem/file-service.test.ts`          | `timeoutMs` / `pollMs` (helper params) | `waitTimeout` / `pollInterval`                                                    |
| `filesystem/filesystem-bridge.ts`          | `uiCoalescingWindowMs`                 | `uiCoalescingWindow`                                                              |
| `kernels/zoo/engine-connection.ts`         | `timeout` (NodeJS.Timeout field)       | `timeoutTimer` (the rename clarifies the field is the _handle_, not the duration) |
| `runtime-middleware.types.ts`              | `debounceMs` (registerWatchPath)       | `watchDebounce`                                                                   |

#### Folder paths

| Old                                   | New                                  | Verdict                                               |
| ------------------------------------- | ------------------------------------ | ----------------------------------------------------- |
| `kernels/replicad/oc-exceptions.ts`   | `kernels/occt/oc-exceptions.ts`      | Keep — files are OCCT-specific, not Replicad-specific |
| `kernels/replicad/oc-kernel-error.ts` | `kernels/occt/oc-kernel-error.ts`    | Keep                                                  |
| `kernels/replicad/oc-tracing.ts`      | `kernels/occt/oc-tracing.ts`         | Keep                                                  |
| (new)                                 | `kernels/occt/oc-error-formatter.ts` | Keep                                                  |
| (new)                                 | `kernels/occt/oc-run-main.ts`        | Keep                                                  |

### B. Sources

- `git log --oneline origin/main..HEAD -- packages/runtime/` (5 runtime-only commits + 19 cross-cutting)
- `git diff origin/main -- packages/runtime/` (7,454 lines)
- [`docs/research/runtime-event-driven-api-blueprint-v5.md`](runtime-event-driven-api-blueprint-v5.md) — design doc that introduced `RenderSettlement`
- [`docs/research/runtime-quickstart-dx-regression.md`](runtime-quickstart-dx-regression.md) — gap analysis that prompted the doc-side simplification
- [`docs/policy/library-api-policy.md`](../policy/library-api-policy.md) §5 (naming), §11, §19, §20
