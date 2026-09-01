---
title: 'Event Fan-Out Policy'
description: 'Production pub/sub fan-out composes Topic<E> from @taucad/events; hand-rolled registries are forbidden and lint-enforced.'
status: active
created: '2026-05-22'
updated: '2026-05-22'
related:
  - docs/research/file-services-architecture-blueprint.md
---

# Event Fan-Out Policy

Internal reference for pub/sub fan-out in production TypeScript across `packages/`, `apps/`, and `libs/`.

## Rationale

Hand-rolled `Set<handler>` / `Array<{ handler }>` + manual `for..of` dispatch duplicates the same bug class in every consumer: sibling handlers skipped when one self-unsubscribes mid-iteration (`indexOf` + `splice`), no handler-throw containment, no `AbortSignal` lifecycle, and inconsistent snapshot semantics. `@taucad/events` `Topic<E>` codifies the guarantees once; `tau-lint/no-handrolled-fanout` prevents drift at PR time.

## Rules

### 1. Compose `Topic<E>` for production fan-out

Production pub/sub fan-out **must** compose `Topic<E>` from `@taucad/events`. Hand-rolled `Array<{ handler }>` or `Set<handler>` + manual `for..of` dispatch is forbidden.

**Why**: One tested primitive eliminates the sibling-skip bug class and gives every consumer snapshot-on-emit, try/catch containment, optional `interestedIn`, and `AbortSignal` lifecycle for free.

CORRECT:

```typescript
import { Topic } from '@taucad/events';

readonly #events = new Topic<MyEvent>({ name: 'MyService.events' });

public subscribe(handler: (event: MyEvent) => void, options?: { signal?: AbortSignal }): () => void {
  return this.#events.subscribe(handler, options);
}

private notify(event: MyEvent): void {
  this.#events.emit(event);
}
```

INCORRECT:

```typescript
private readonly subs: Array<{ handler: (event: MyEvent) => void }> = [];

private notify(event: MyEvent): void {
  for (const sub of this.subs) {
    sub.handler(event);
  }
}
```

### 2. Preserve public API with additive options

When migrating an existing public `on(...)` / `subscribe(...)` surface, keep the handler signature byte-identical and add `{ signal?: AbortSignal }` (and `interestedIn` where applicable) as an **optional trailing argument**. Never break external consumers of `@taucad/runtime` or other published packages.

### 3. Keyed topics use `Map<string, Topic<E>>`

Per-key fan-out (chat sessions, file paths, bridge ports) composes one `Topic<E>` per key. Delete the map entry and call `topic.dispose()` when the last subscriber unsubscribes or the owning entity is released.

### 4. Lint enforcement

`tau-lint/no-handrolled-fanout` flags class fields typed as `Set<(…) => void>` or `Array<{ handler: (…) => void }>`. Allowlisted: `packages/events/**`, test files, `repos/**`.

## Migration cheat sheet (Tier 3 — opportunistic)

| Site                                 | Shape                         |
| ------------------------------------ | ----------------------------- |
| `runtime-filesystem-bridge` `listen` | `Map<string, Topic<unknown>>` |
| `ZooWebSocketTransport`              | One `Topic` per event         |
| `ChatRpcSocketService`               | One `Topic<Status>`           |
| `visibility-provider`                | One `Topic<void>`             |
| `createListingStore`                 | One `Topic<DirectoryListing>` |
| `flagStore`                          | One `Topic<void>`             |
| `cookieStore`                        | `Map<string, Topic<void>>`    |

## Summary Checklist

- [ ] Fan-out composes `Topic<E>` from `@taucad/events`
- [ ] Dispatch is a single `topic.emit(event)` — no manual `for..of` over handler collections
- [ ] Public subscribe APIs expose optional `{ signal?: AbortSignal }`
- [ ] Keyed registries dispose empty topics and delete map entries
- [ ] Regression tests cover self-unsubscribe-during-emit and handler-throw containment
